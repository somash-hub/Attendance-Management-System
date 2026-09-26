// supabase/functions/admin-update-faculty/index.ts
// Updates a linked faculty directory record and its Auth/profile identity.
// Only signed-in administrators may call it; privileged credentials stay here.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
// file:// pages send Origin: null. This switch exists only for local demos and
// should remain false in production.
const allowFileOrigin = Deno.env.get("ALLOW_FILE_ORIGIN") === "true";

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin");
  const allowedOrigin = origin && (allowedOrigins.includes(origin) || (origin === "null" && allowFileOrigin))
    ? origin
    : null;
  return {
    ...(allowedOrigin ? { "Access-Control-Allow-Origin": allowedOrigin } : {}),
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

type UpdateFacultyInput = {
  id?: string;
  faculty_id?: string;
  name?: string;
  email?: string;
  department?: string;
  program?: string;
  designation?: string;
  status?: string;
};

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });

  const url = Deno.env.get("SUPABASE_URL")!;
  const callerClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await callerClient.auth.getUser();
  if (!user) return json(req, { error: "Not signed in." }, 401);

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: caller } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!caller || caller.role !== "admin") return json(req, { error: "Only administrators can update faculty." }, 403);

  let input: UpdateFacultyInput;
  try {
    input = await req.json();
  } catch {
    return json(req, { error: "Send a JSON body." }, 400);
  }

  const id = String(input.id ?? "").trim();
  const facultyCode = String(input.faculty_id ?? "").trim();
  const name = String(input.name ?? "").trim();
  const email = String(input.email ?? "").trim().toLowerCase();
  const department = String(input.department ?? "").trim();
  const program = String(input.program ?? "").trim();
  const designation = String(input.designation ?? "").trim() || null;
  const status = String(input.status ?? "").trim();

  if (!id || !facultyCode || !name || !email || !department || !program) {
    return json(req, { error: "Faculty ID, name, email, department, and program are required." }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(req, { error: "Enter a valid email address." }, 400);
  }
  if (!["active", "on_leave", "archived"].includes(status)) {
    return json(req, { error: "Choose active, on_leave, or archived status." }, 400);
  }

  const { data: current, error: currentError } = await admin
    .from("faculty")
    .select("id, profile_id, email, status")
    .eq("id", id)
    .single();
  if (currentError || !current) return json(req, { error: currentError?.message || "Faculty record not found." }, 404);

  if (current.profile_id) {
    const { error: authError } = await admin.auth.admin.updateUserById(current.profile_id, { email });
    if (authError) return json(req, { error: authError.message }, 400);
    const { error: profileError } = await admin.from("profiles").update({ name, email }).eq("id", current.profile_id);
    if (profileError) return json(req, { error: profileError.message }, 400);
  }

  const { data: updated, error: updateError } = await admin
    .from("faculty")
    .update({ faculty_id: facultyCode, name, email, department, program, designation, status, archived_at: status === "archived" ? new Date().toISOString() : null })
    .eq("id", id)
    .select("id, profile_id, faculty_id, name, email, department, program, designation, status, archived_at, created_at")
    .single();
  if (updateError) return json(req, { error: updateError.message }, 400);

  return json(req, { faculty: updated });
});
