// supabase/functions/admin-create-user/index.ts
// Creates a login account and its profile row. Only signed-in administrators
// may call it; the privileged work runs here with the service role key so the
// browser never sees powerful credentials.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin");
  const allowedOrigin = origin && allowedOrigins.includes(origin) ? origin : null;
  return {
    ...(allowedOrigin ? { "Access-Control-Allow-Origin": allowedOrigin } : {}),
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

type CreateUserInput = {
  name?: string;
  email?: string;
  password?: string;
  role?: string;
  roll?: string;
  program?: string;
  department?: string;
  batch?: string;
  section?: string;
  section_id?: string;
  faculty_id?: string;
  designation?: string;
};

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  // Identify the caller by their access token.
  const url = Deno.env.get("SUPABASE_URL")!;
  const callerClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: {
      headers: { Authorization: req.headers.get("Authorization") ?? "" },
    },
  });
  const {
    data: { user },
  } = await callerClient.auth.getUser();
  if (!user) return json(req, { error: "Not signed in." }, 401);

  // Only administrators may create accounts.
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: caller } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!caller || caller.role !== "admin") {
    return json(req, { error: "Only administrators can create accounts." }, 403);
  }

  let input: CreateUserInput;
  try {
    input = await req.json();
  } catch {
    return json(req, { error: "Send a JSON body." }, 400);
  }

  const name = String(input.name ?? "").trim();
  const email = String(input.email ?? "")
    .trim()
    .toLowerCase();
  const password = String(input.password ?? "");
  const role = String(input.role ?? "");
  const roll = String(input.roll ?? "").trim();
  const program = String(input.program ?? "BSc CSIT").trim() || "BSc CSIT";
  const department = String(input.department ?? program).trim() || program;
  const batch = String(input.batch ?? "").trim();
  const section = String(input.section ?? "A").trim() || "A";
  const sectionId = String(input.section_id ?? "").trim();
  const facultyId = String(input.faculty_id ?? "").trim();
  const designation = String(input.designation ?? "").trim();

  // Mirror of the validation rules used by the client side form.
  if (!name) return json(req, { error: "Enter the user's full name." }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(req, { error: "Enter a valid email address." }, 400);
  }
  if (!["student", "teacher", "admin"].includes(role)) {
    return json(req, { error: "Choose a valid role." }, 400);
  }
  if (role === "student" && !email.endsWith("@kct.edu.np")) {
    return json(req, { error: "Student accounts must use an @kct.edu.np email." }, 400);
  }
  if (role === "student" && (!roll || !batch)) {
    return json(req, { error: "Enter the student's roll number and batch." }, 400);
  }
  if (role === "teacher" && !facultyId) {
    return json(req, { error: "Enter the faculty ID." }, 400);
  }
  if (
    password.length < 8 ||
    !/[A-Z]/.test(password) ||
    !/[a-z]/.test(password) ||
    !/\d/.test(password) ||
    !/[^A-Za-z0-9]/.test(password)
  ) {
    return json(
      req,
      { error: "Password must include uppercase, lowercase, number, and symbol." },
      400,
    );
  }

  // Resolve the current section before creating Auth so an incomplete academic
  // relationship cannot be created and then repaired manually.
  let currentSectionId = sectionId;
  if (role === "student") {
    let sectionQuery = admin
      .from("sections")
      .select("id, program, batch, name")
      .eq("program", program)
      .eq("batch", batch)
      .eq("name", section)
      .eq("is_current", true)
      .limit(1);
    if (currentSectionId) sectionQuery = sectionQuery.eq("id", currentSectionId);
    const { data: sections, error: sectionError } = await sectionQuery;
    if (sectionError) return json(req, { error: sectionError.message }, 400);
    if (!sections || !sections.length) {
      return json(req, { error: "No current section matches this program, batch, and section." }, 400);
    }
    currentSectionId = sections[0].id;
  }

  // Create the login account (auto-confirmed because the admin vouches for it).
  const { data: created, error: createError } = await admin.auth.admin.createUser(
    { email, password, email_confirm: true, user_metadata: { name } },
  );
  if (createError) return json(req, { error: createError.message }, 400);

  // Store the app-specific details next to the auth account.
  const { error: profileError } = await admin
    .from("profiles")
    .insert({ id: created.user.id, name, email, role });
  if (profileError) {
    // Keep auth and profiles consistent if the second step fails.
    await admin.auth.admin.deleteUser(created.user.id);
    return json(req, { error: profileError.message }, 400);
  }

  // Create the role-specific directory row and audit event in the same
  // privileged path. A missing directory row leaves the login unusable.
  if (role === "student") {
    const { data: student, error: studentError } = await admin
      .from("students")
      .insert({
        profile_id: created.user.id,
        roll,
        name,
        email,
        program,
        batch,
        section,
        active: true,
      })
      .select("id")
      .single();
    if (studentError) {
      await admin.auth.admin.deleteUser(created.user.id);
      return json(req, { error: studentError.message }, 400);
    }
    const { error: enrollmentError } = await admin.from("enrollments").insert({
      student_id: student.id,
      section_id: currentSectionId,
      status: "active",
    });
    if (enrollmentError) {
      await admin.from("students").delete().eq("profile_id", created.user.id);
      await admin.auth.admin.deleteUser(created.user.id);
      return json(req, { error: enrollmentError.message }, 400);
    }
  } else if (role === "teacher") {
    const { error: facultyError } = await admin.from("faculty").insert({
      profile_id: created.user.id,
      faculty_id: facultyId,
      name,
      email,
      department: department,
      program,
      status: "active",
      designation: designation || null,
    });
    if (facultyError) {
      await admin.auth.admin.deleteUser(created.user.id);
      return json(req, { error: facultyError.message }, 400);
    }
  }

  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_id: user.id,
    action: "account.create",
    entity_type: role,
    entity_id: created.user.id,
    new_values: { name, email, role },
  });
  if (auditError) {
    if (role === "student") {
      await admin.from("students").delete().eq("profile_id", created.user.id);
    } else if (role === "teacher") {
      await admin.from("faculty").delete().eq("profile_id", created.user.id);
    }
    await admin.auth.admin.deleteUser(created.user.id);
    return json(req, { error: "The account could not be created because its audit record failed." }, 500);
  }

  return json(req, { user: { id: created.user.id, name, email, role } });
});
