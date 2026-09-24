// supabase/functions/admin-create-user/index.ts
// Creates a login account and its profile row. Only signed-in administrators
// may call it; the privileged work runs here with the service role key so the
// browser never sees powerful credentials.
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

  // Only administrators may create accounts.
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: caller } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!caller || caller.role !== "admin") {
    return json({ error: "Only administrators can create accounts." }, 403);
  }

  let input: { name?: string; email?: string; password?: string; role?: string };
  try {
    input = await req.json();
  } catch {
    return json({ error: "Send a JSON body." }, 400);
  }

  const name = String(input.name ?? "").trim();
  const email = String(input.email ?? "")
    .trim()
    .toLowerCase();
  const password = String(input.password ?? "");
  const role = String(input.role ?? "");

  // Mirror of the validation rules used by the client side form.
  if (!name) return json({ error: "Enter the user's full name." }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "Enter a valid email address." }, 400);
  }
  if (!["student", "teacher", "admin"].includes(role)) {
    return json({ error: "Choose a valid role." }, 400);
  }
  if (role === "student" && !email.endsWith("@kct.edu.np")) {
    return json({ error: "Student accounts must use an @kct.edu.np email." }, 400);
  }
  if (
    password.length < 8 ||
    !/[A-Z]/.test(password) ||
    !/[a-z]/.test(password) ||
    !/\d/.test(password) ||
    !/[^A-Za-z0-9]/.test(password)
  ) {
    return json(
      { error: "Password must include uppercase, lowercase, number, and symbol." },
      400,
    );
  }

  // Create the login account (auto-confirmed because the admin vouches for it).
  const { data: created, error: createError } = await admin.auth.admin.createUser(
    { email, password, email_confirm: true, user_metadata: { name } },
  );
  if (createError) return json({ error: createError.message }, 400);

  // Store the app-specific details next to the auth account.
  const { error: profileError } = await admin
    .from("profiles")
    .insert({ id: created.user.id, name, email, role });
  if (profileError) {
    // Keep auth and profiles consistent if the second step fails.
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ error: profileError.message }, 400);
  }

  return json({ user: { id: created.user.id, name, email, role } });
});
