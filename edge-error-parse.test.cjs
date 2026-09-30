const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");

require("./shared/supabase-store.js");

function useClient(client) {
  globalThis.AttendIQDb = client;
}

afterEach(() => {
  delete globalThis.AttendIQDb;
});

test("updatePassword sends the validated password to Supabase", async () => {
  let payload;
  useClient({
    auth: {
      updateUser: async (request) => {
        payload = request;
        return { data: { user: { id: "1" } }, error: null };
      },
    },
  });

  const result = await globalThis.AttendIQSupabase.updatePassword("Str0ng!Pass");

  assert.equal(result.ok, true);
  assert.deepEqual(payload, { password: "Str0ng!Pass" });
});

test("updatePassword rejects weak passwords before calling Supabase", async () => {
  let calls = 0;
  useClient({
    auth: {
      updateUser: async () => {
        calls += 1;
        return { data: {}, error: null };
      },
    },
  });

  const result = await globalThis.AttendIQSupabase.updatePassword("weakpass");

  assert.equal(result.ok, false);
  assert.equal(result.error, "Password must include uppercase, lowercase, number, and symbol.");
  assert.equal(calls, 0);
});

test("Edge Function validation messages reach the UI", async () => {
  let request;
  useClient({
    functions: {
      invoke: async (name, options) => {
        request = { name, options };
        return {
          error: {
            message: "Failed to send a request.",
            context: {
              clone: () => ({
                text: async () => JSON.stringify({
                  error: "Student accounts must use an @kct.edu.np email.",
                }),
              }),
            },
          },
        };
      },
    },
  });

  const result = await globalThis.AttendIQSupabase.createUser({
    name: "Test Student",
    email: "student@example.com",
    password: "Str0ng!Pass",
    role: "student",
    semester: 3,
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "Student accounts must use an @kct.edu.np email.");
  assert.equal(request.name, "admin-create-user");
  assert.equal(request.options.body.email, "student@example.com");
});

test("student creation sends program, batch, and semester without section fields", async () => {
  let request;
  useClient({
    functions: {
      invoke: async (name, options) => {
        request = { name, options };
        return { data: { user: { id: "student-1", role: "student" } }, error: null };
      },
    },
  });

  const result = await globalThis.AttendIQSupabase.createUser({
    name: "Test Student",
    email: "student@kct.edu.np",
    password: "Str0ng!Pass",
    role: "student",
    roll: "2082CSIT001",
    program: "BSc CSIT",
    batch: "2082",
    semester: 3,
    section: "A",
    section_id: "legacy-section",
  });

  assert.equal(result.ok, true);
  assert.equal(request.name, "admin-create-user");
  assert.equal(request.options.body.program, "BSc CSIT");
  assert.equal(request.options.body.batch, "2082");
  assert.equal(request.options.body.semester, 3);
  assert.equal("section" in request.options.body, false);
  assert.equal("section_id" in request.options.body, false);
});

test("student creation rejects semesters outside 1-8 before invoking the Edge Function", async () => {
  let calls = 0;
  useClient({
    functions: {
      invoke: async () => {
        calls += 1;
        return { data: {}, error: null };
      },
    },
  });

  const result = await globalThis.AttendIQSupabase.createUser({
    name: "Test Student",
    email: "student@kct.edu.np",
    password: "Str0ng!Pass",
    role: "student",
    roll: "2082CSIT001",
    batch: "2082",
    semester: 9,
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "Choose a semester from 1 to 8.");
  assert.equal(calls, 0);
});

test("transport errors without a JSON response remain actionable", async () => {
  useClient({
    functions: {
      invoke: async () => ({
        error: { message: "Failed to fetch" },
      }),
    },
  });

  const result = await globalThis.AttendIQSupabase.createUser({
    name: "Test Teacher",
    email: "teacher@example.com",
    password: "Str0ng!Pass",
    role: "teacher",
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /ALLOWED_ORIGINS|file:\/\/|Serve the app over http/i);
});

test("student edits cannot assign a legacy section", async () => {
  let request;
  useClient({
    rpc: (name, args) => {
      request = { name, args };
      return { single: async () => ({ data: { id: "student-1" }, error: null }) };
    },
  });

  const result = await globalThis.AttendIQSupabase.updateStudent({
    id: "student-1",
    name: "Test Student",
    email: "student@kct.edu.np",
    roll: "CSIT-001",
    program: "BSc CSIT",
    batch: "2082",
    semester: 5,
    section_id: "legacy-section",
  });

  assert.equal(result.ok, true);
  assert.equal(request.name, "admin_update_student");
  assert.equal(request.args.p_section_id, null);
  assert.equal(request.args.p_semester, 5);
});

test("course offerings can be created without a section", async () => {
  let request;
  useClient({
    rpc: (name, args) => {
      request = { name, args };
      return { single: async () => ({ data: { id: "offering-1" }, error: null }) };
    },
  });

  const result = await globalThis.AttendIQSupabase.createCourseOffering({
    subject_code: "CSC101",
    semester_id: "semester-1",
    section_id: "legacy-section",
    teacher_id: "teacher-1",
  });

  assert.equal(result.ok, true);
  assert.equal(request.name, "admin_create_course_offering");
  assert.equal(request.args.p_section_id, null);
});

test("class schedules are created through the database with only the required details", async () => {
  let request;
  useClient({
    rpc: (name, args) => {
      request = { name, args };
      return { single: async () => ({ data: { id: "schedule-1" }, error: null }) };
    },
  });

  const result = await globalThis.AttendIQSupabase.createClassSchedule({
    course_offering_id: "offering-1",
    day_of_week: "2",
    start_time: "09:00",
    end_time: "10:30",
    room: "",
  });

  assert.equal(result.ok, true);
  assert.equal(request.name, "admin_create_class_schedule");
  assert.deepEqual(request.args, {
    p_offering_id: "offering-1",
    p_day_of_week: 2,
    p_start_time: "09:00",
    p_end_time: "10:30",
    p_room: "",
  });
});

test("invalid class schedules are rejected before reaching the database", async () => {
  let calls = 0;
  useClient({
    rpc: () => {
      calls += 1;
      return { single: async () => ({ data: {}, error: null }) };
    },
  });

  const result = await globalThis.AttendIQSupabase.createClassSchedule({
    course_offering_id: "offering-1",
    day_of_week: "2",
    start_time: "10:30",
    end_time: "09:00",
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /valid start and end time/i);
  assert.equal(calls, 0);
});

test("class schedule reads include the course teacher for the admin timetable", async () => {
  let selection;
  const query = {
    select: (columns) => {
      selection = columns;
      return query;
    },
    order: () => query,
    then: (resolve, reject) => Promise.resolve({
      data: [{
        id: "schedule-1",
        course_offering_id: "offering-1",
        course_offerings: { id: "offering-1", teacher_id: "teacher-1" },
      }],
      error: null,
    }).then(resolve, reject),
  };
  useClient({ from: () => query });

  const result = await globalThis.AttendIQSupabase.getClassSchedules({ include_archived: true });

  assert.equal(result.ok, true);
  assert.match(selection, /course_offerings\([^)]*teacher_id/);
  assert.equal(result.data[0].course_offerings.teacher_id, "teacher-1");
});

test("teacher class schedules are limited to active offerings assigned to the signed-in teacher", async () => {
  const calls = [];
  const profileQuery = {
    select: () => profileQuery,
    eq: (column, value) => {
      calls.push(["profile", column, value]);
      return profileQuery;
    },
    single: async () => ({ data: { id: "teacher-1", role: "teacher" }, error: null }),
  };
  const offeringsQuery = {
    select: () => offeringsQuery,
    eq: (column, value) => {
      calls.push(["offering", column, value]);
      return offeringsQuery;
    },
    order: () => offeringsQuery,
    then: (resolve, reject) => Promise.resolve({
      data: [{ id: "offering-1" }],
      error: null,
    }).then(resolve, reject),
  };
  const scheduleQuery = {
    select: () => scheduleQuery,
    in: (column, value) => {
      calls.push(["schedule-in", column, value]);
      return scheduleQuery;
    },
    eq: (column, value) => {
      calls.push(["schedule", column, value]);
      return scheduleQuery;
    },
    order: () => scheduleQuery,
    then: (resolve, reject) => Promise.resolve({ data: [{ id: "schedule-1" }], error: null }).then(resolve, reject),
  };
  useClient({
    auth: { getUser: async () => ({ data: { user: { id: "teacher-1" } }, error: null }) },
    from: (table) => {
      if (table === "profiles") return profileQuery;
      if (table === "course_offerings") return offeringsQuery;
      if (table === "class_schedules") return scheduleQuery;
      throw new Error("Unexpected table: " + table);
    },
  });

  const result = await globalThis.AttendIQSupabase.getTeacherClassSchedules();

  assert.equal(result.ok, true);
  assert.deepEqual(calls.filter(([kind]) => kind === "offering"), [
    ["offering", "teacher_id", "teacher-1"],
    ["offering", "status", "active"],
    ["offering", "semesters.is_current", true],
  ]);
  assert.deepEqual(calls.find(([kind]) => kind === "schedule-in"), [
    "schedule-in",
    "course_offering_id",
    ["offering-1"],
  ]);
  assert.ok(calls.some(([kind, column, value]) => kind === "schedule" && column === "status" && value === "active"));
  assert.deepEqual(result.data, [{ id: "schedule-1" }]);
});

test("current semester changes call the admin RPC with validated Gregorian term values", async () => {
  let request;
  useClient({
    rpc: (name, args) => {
      request = { name, args };
      return { single: async () => ({ data: { id: "semester-1", number: 1 }, error: null }) };
    },
  });

  const result = await globalThis.AttendIQSupabase.setCurrentSemester({
    year: "2026",
    semester: "1",
  });

  assert.equal(result.ok, true);
  assert.equal(request.name, "admin_set_current_semester");
  assert.deepEqual(request.args, { p_year: 2026, p_semester: 1 });
});

test("current semester changes reject years before 2020 and semesters outside 1-8", async () => {
  let calls = 0;
  useClient({
    rpc: () => {
      calls += 1;
      return { single: async () => ({ data: {}, error: null }) };
    },
  });

  const result = await globalThis.AttendIQSupabase.setCurrentSemester({ year: 2019, semester: 9 });

  assert.equal(result.ok, false);
  assert.match(result.error, /2020 onward.*1 to 8/);
  assert.equal(calls, 0);
});

test("student subjects are queried by program and the student's semester", async () => {
  const queryFilters = [];
  const rowsByTable = {
    profiles: { id: "profile-1", name: "Test Student", email: "student@kct.edu.np", role: "student" },
    students: { id: "student-1", profile_id: "profile-1", program: "BSc CSIT", semester: 3 },
    semesters: [{ id: "semester-current", number: 3, is_current: true }],
    course_offerings: [{
      id: "offering-1",
      subject_code: "CSC301",
      subjects: { code: "CSC301", name: "Example Course", semester: 3, program: "BSc CSIT" },
    }],
  };

  function queryFor(table) {
    const query = {
      select: () => query,
      eq: (column, value) => {
        queryFilters.push({ table, column, value });
        return query;
      },
      order: () => query,
      limit: () => query,
      single: async () => ({ data: rowsByTable[table], error: null }),
      then: (resolve, reject) => Promise.resolve({ data: rowsByTable[table], error: null }).then(resolve, reject),
    };
    return query;
  }

  useClient({
    auth: { getUser: async () => ({ data: { user: { id: "profile-1" } }, error: null }) },
    from: queryFor,
  });

  const result = await globalThis.AttendIQSupabase.getMySubjects();

  assert.equal(result.ok, true);
  assert.equal(result.data.length, 1);
  assert.ok(queryFilters.some((filter) => filter.table === "course_offerings" && filter.column === "subjects.semester" && filter.value === 3));
  assert.ok(queryFilters.some((filter) => filter.table === "course_offerings" && filter.column === "subjects.program" && filter.value === "BSc CSIT"));
});
