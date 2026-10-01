const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");

require("./shared/supabase-store.js");

afterEach(() => {
  delete globalThis.AttendIQDb;
});

test("attendance settings load the saved alert and leave workflow choices", async () => {
  let selected;
  globalThis.AttendIQDb = {
    from: (table) => ({
      select: (columns) => {
        selected = { table, columns };
        return {
          eq: () => ({
            single: async () => ({
              data: {
                threshold: 85,
                auto_notify_below_threshold: false,
                leave_workflow: "admin_only",
              },
              error: null,
            }),
          }),
        };
      },
    }),
  };

  const result = await globalThis.AttendIQSupabase.getSettings();

  assert.equal(result.ok, true);
  assert.deepEqual(result.data, {
    threshold: 85,
    autoNotifyBelowThreshold: false,
    leaveWorkflow: "admin_only",
  });
  assert.deepEqual(selected, {
    table: "settings",
    columns: "threshold, auto_notify_below_threshold, leave_workflow",
  });
});

test("attendance settings save all selected options and preserve the mapped result", async () => {
  let update;
  globalThis.AttendIQDb = {
    from: (table) => ({
      update: (patch) => {
        update = { table, patch };
        return {
          eq: () => ({
            select: () => ({
              single: async () => ({
                data: {
                  threshold: 90,
                  auto_notify_below_threshold: true,
                  leave_workflow: "auto_approve",
                },
                error: null,
              }),
            }),
          }),
        };
      },
    }),
  };

  const result = await globalThis.AttendIQSupabase.saveSettings({
    threshold: 90,
    autoNotifyBelowThreshold: true,
    leaveWorkflow: "auto_approve",
  });

  assert.equal(result.ok, true);
  assert.deepEqual(update, {
    table: "settings",
    patch: {
      threshold: 90,
      auto_notify_below_threshold: true,
      leave_workflow: "auto_approve",
    },
  });
  assert.deepEqual(result.data, {
    threshold: 90,
    autoNotifyBelowThreshold: true,
    leaveWorkflow: "auto_approve",
  });
});

test("invalid leave approval workflow is rejected before updating Supabase", async () => {
  let calls = 0;
  globalThis.AttendIQDb = {
    from: () => {
      calls += 1;
      return {};
    },
  };

  const result = await globalThis.AttendIQSupabase.saveSettings({
    threshold: 80,
    autoNotifyBelowThreshold: true,
    leaveWorkflow: "unrestricted",
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /valid leave approval workflow/i);
  assert.equal(calls, 0);
});

test("teacher attendance warning calls the protected notification RPC", async () => {
  let request;
  globalThis.AttendIQDb = {
    rpc: async (name, args) => {
      request = { name, args };
      return { data: null, error: null };
    },
  };

  const result = await globalThis.AttendIQSupabase.notifyAtRiskStudent("student-1");

  assert.equal(result.ok, true);
  assert.deepEqual(request, {
    name: "notify_at_risk_student",
    args: { p_student_id: "student-1" },
  });
});

test("notifications are queried only for the signed-in user's profile", async () => {
  let notificationUserFilter;
  globalThis.AttendIQDb = {
    auth: {
      getUser: async () => ({
        data: { user: { id: "teacher-1" } },
        error: null,
      }),
    },
    from: (table) => {
      const query = {
        select: () => query,
        eq: (column, value) => {
          if (table === "notifications" && column === "user_id") {
            notificationUserFilter = value;
          }
          return query;
        },
        order: () => query,
        limit: () => query,
        then: (resolve) => Promise.resolve({ data: [], error: null }).then(resolve),
        single: async () => ({
          data: {
            id: "teacher-1",
            role: "teacher",
            name: "Test Teacher",
            email: "teacher@kct.edu.np",
          },
          error: null,
        }),
      };
      return query;
    },
  };

  const result = await globalThis.AttendIQSupabase.getNotifications(true);

  assert.equal(result.ok, true);
  assert.equal(notificationUserFilter, "teacher-1");
});

test("mass notification inserts an announcement for every matching role", async () => {
  let audienceRole;
  let inserted;
  globalThis.AttendIQDb = {
    from: (table) => {
      const query = {
        select: () => query,
        eq: (column, value) => {
          assert.equal(table, "profiles");
          assert.equal(column, "role");
          audienceRole = value;
          return query;
        },
        insert: (rows) => {
          assert.equal(table, "notifications");
          inserted = rows;
          return Promise.resolve({ data: null, error: null });
        },
        then: (resolve) => Promise.resolve({
          data: [{ id: "student-1", role: "student" }, { id: "student-2", role: "student" }],
          error: null,
        }).then(resolve),
      };
      return query;
    },
  };

  const result = await globalThis.AttendIQSupabase.sendMassNotification({
    audience: "student",
    title: "Holiday",
    message: "Tomorrow is a holiday.",
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.data, { sent: 2 });
  assert.equal(audienceRole, "student");
  assert.deepEqual(inserted, [
    {
      user_id: "student-1",
      notification_type: "announcement",
      title: "Holiday",
      message: "Tomorrow is a holiday.",
    },
    {
      user_id: "student-2",
      notification_type: "announcement",
      title: "Holiday",
      message: "Tomorrow is a holiday.",
    },
  ]);
});

test("mass notification rejects invalid audience before querying Supabase", async () => {
  let calls = 0;
  globalThis.AttendIQDb = {
    from: () => {
      calls += 1;
      return {};
    },
  };

  const result = await globalThis.AttendIQSupabase.sendMassNotification({
    audience: "visitor",
    title: "Holiday",
    message: "Tomorrow is a holiday.",
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "Choose a valid notification audience.");
  assert.equal(calls, 0);
});

test("mass notification does not report success without Supabase", async () => {
  delete globalThis.AttendIQDb;
  globalThis.AttendIQDemoMode = false;

  const result = await globalThis.AttendIQSupabase.sendMassNotification({
    audience: "all",
    title: "Holiday",
    message: "Tomorrow is a holiday.",
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "Mass notifications are unavailable without a Supabase connection.");
});

test("attendance updates save the edited marks to the selected existing session", async () => {
  let request;
  globalThis.AttendIQDb = {
    rpc: async (name, args) => {
      request = { name, args };
      return { data: 2, error: null };
    },
  };

  const result = await globalThis.AttendIQSupabase.saveAttendanceSession({
    session_id: "session-1",
    records: [
      { student_id: "student-1", status: "Present" },
      { student_id: "student-2", status: "Absent" },
    ],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(request, {
    name: "save_attendance_session",
    args: {
      p_session_id: "session-1",
      p_records: [
        { student_id: "student-1", status: "Present" },
        { student_id: "student-2", status: "Absent" },
      ],
    },
  });
});
