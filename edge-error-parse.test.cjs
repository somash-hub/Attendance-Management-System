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
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "Student accounts must use an @kct.edu.np email.");
  assert.equal(request.name, "admin-create-user");
  assert.equal(request.options.body.email, "student@example.com");
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

