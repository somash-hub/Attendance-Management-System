// supabase/functions/admin-delete-user/index.ts
// Deletes a login account. The matching profile row disappears through the
// foreign key (on delete cascade). Administrators cannot delete themselves.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
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
  if (!user) return json({ error: "Not signed in." }, 401);

  // Only administrators may remove accounts.
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: caller } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!caller || caller.role !== "admin") {
    return json({ error: "Only administrators can remove accounts." }, 403);
  }

  let input: { id?: string };
  try {
    input = await req.json();
  } catch {
    return json({ error: "Send a JSON body." }, 400);
  }
  const id = String(input.id ?? "");
  if (!id) return json({ error: "Missing account id." }, 400);
  if (id === user.id) {
    return json({ error: "You cannot remove your own account." }, 400);
  }

  const { data: target, error: targetError } = await admin
    .from("profiles")
    .select("id, role, name, email")
    .eq("id", id)
    .single();
  if (targetError || !target) {
    return json({ error: targetError?.message || "Account not found." }, 404);
  }

  // Archive application records before removing the login. Attendance and
  // leave history remain queryable through the student/faculty rows.
  if (target.role === "student") {
    const { error: archiveError } = await admin
      .from("students")
      .update({ active: false, archived_at: new Date().toISOString() })
      .eq("profile_id", id);
    if (archiveError) return json({ error: archiveError.message }, 400);
  } else if (target.role === "teacher") {
    const { error: archiveError } = await admin
      .from("faculty")
      .update({ status: "archived", archived_at: new Date().toISOString() })
      .eq("profile_id", id);
    if (archiveError) return json({ error: archiveError.message }, 400);
  }

  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_id: user.id,
    action: "account.delete",
    entity_type: target.role,
    entity_id: id,
    old_values: { name: target.name, email: target.email, role: target.role },
  });
  if (auditError) return json({ error: auditError.message }, 500);

  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return json({ error: error.message }, 400);

  return json({ ok: true });
});
