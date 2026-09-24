// Upload a leave document only after server-side authentication and validation.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BUCKET = "leave-documents";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png"];

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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const callerClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await callerClient.auth.getUser();
  if (!user) return json({ error: "Not signed in." }, 401);

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || profile.role !== "student") {
    return json({ error: "Only students can upload leave documents." }, 403);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "Send a multipart form with a file." }, 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) return json({ error: "Choose a document to upload." }, 400);
  if (!file.name || file.size <= 0 || file.size > MAX_BYTES || !ALLOWED_TYPES.includes(file.type)) {
    return json({ error: "Choose a PDF, JPG, or PNG file smaller than 5 MB." }, 400);
  }

  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (!hasAllowedSignature(bytes, file.type)) {
    return json({ error: "The file content does not match its selected type." }, 400);
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `${user.id}/${Date.now()}-${safeName}`;
  const { error } = await admin.storage.from(BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type,
  });
  if (error) return json({ error: error.message }, 400);
  return json({ path });
});
