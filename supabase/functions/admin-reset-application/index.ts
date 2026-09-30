import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const preservedEmails = new Set([
  "admin@kct.edu.np",
  "priya.mehta@kct.edu.np",
  "aryan.k@kct.edu.np",
]);

const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowFileOrigin = Deno.env.get("ALLOW_FILE_ORIGIN") === "true";

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin");
  const allowedOrigin = origin && (
    allowedOrigins.includes(origin) ||
    (origin === "null" && allowFileOrigin)
  ) ? origin : null;
  return {
    ...(allowedOrigin ? { "Access-Control-Allow-Origin": allowedOrigin } : {}),
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

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
  if (req.method !== "POST") return json(req, { error: "POST is required." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: authData } = await caller.auth.getUser();
  if (!authData.user) return json(req, { error: "Not signed in." }, 401);

  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .single();
  if (profileError || profile?.role !== "admin") {
    return json(req, { error: "Only administrators can reset application data." }, 403);
  }

  let body: { confirmation?: string };
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "Send a JSON body." }, 400);
  }
  if (body.confirmation !== "RESET") {
    return json(req, { error: "Type RESET to confirm this destructive action." }, 400);
  }

  const { error: resetError } = await caller.rpc("admin_reset_application_data");
  if (resetError) return json(req, { error: resetError.message }, 400);

  let page = 1;
  const removed: string[] = [];
  while (true) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return json(req, { error: error.message }, 500);
    const users = data.users || [];
    for (const user of users) {
      const email = String(user.email || "").toLowerCase();
      if (preservedEmails.has(email)) continue;
      const { error: deleteError } = await service.auth.admin.deleteUser(user.id);
      if (deleteError) return json(req, { error: deleteError.message }, 500);
      removed.push(email || user.id);
    }
    if (users.length < 1000) break;
    page += 1;
  }

  return json(req, { ok: true, preserved: [...preservedEmails], removedCount: removed.length });
});
