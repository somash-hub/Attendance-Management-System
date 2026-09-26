// Upload a leave document only after server-side authentication and validation.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BUCKET = "leave-documents";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png"];

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

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

function hasAllowedSignature(bytes: Uint8Array, type: string) {
  if (type === "application/pdf") {
    return String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
  }
  if (type === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (type === "image/png") {
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Use POST." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const callerClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await callerClient.auth.getUser();
  if (!user) return json(req, { error: "Not signed in." }, 401);

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || profile.role !== "student") {
    return json(req, { error: "Only students can upload leave documents." }, 403);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(req, { error: "Send a multipart form with a file." }, 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) return json(req, { error: "Choose a document to upload." }, 400);
  if (!file.name || file.size <= 0 || file.size > MAX_BYTES || !ALLOWED_TYPES.includes(file.type)) {
    return json(req, { error: "Choose a PDF, JPG, or PNG file smaller than 5 MB." }, 400);
  }

  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (!hasAllowedSignature(bytes, file.type)) {
    return json(req, { error: "The file content does not match its selected type." }, 400);
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `${user.id}/${Date.now()}-${safeName}`;
  const { error } = await admin.storage.from(BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type,
  });
  if (error) return json(req, { error: error.message }, 400);
  return json(req, { path });
});
