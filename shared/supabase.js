// Supabase client configuration for AttendIQ.
// Load the supabase-js CDN script before this file; it exposes a global
// `supabase` object with createClient(). The anon key is safe to ship to the
// browser because row level security protects every table, and privileged
// operations (account creation and deletion) run inside the edge functions.
const SUPABASE_URL = "https://yvvgvteijtxnuwtncfio.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Oo7qwamCwC05zP1HqN92-g_8fVZ96Ue";

const runtimeState = {
  protocol: window.location.protocol,
  isFileOrigin: window.location.protocol === "file:",
  isDemoMode: new URLSearchParams(window.location.search).get("demo") === "1",
  isSupabaseConfigured: !!window.supabase && !SUPABASE_ANON_KEY.startsWith("PASTE"),
};

// Shared client for the async adapter in shared/supabase-store.js. Kept on the
// global scope so plain <script> files can reach it without modules.
window.AttendIQDemoMode = runtimeState.isDemoMode;
window.AttendIQRuntime = runtimeState;

window.AttendIQDb =
  !window.AttendIQDemoMode &&
  runtimeState.isSupabaseConfigured &&
  !runtimeState.isFileOrigin
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

if (runtimeState.isFileOrigin && !window.AttendIQDemoMode) {
  console.warn(
    "AttendIQ is running from a file:// page. Supabase authentication and Edge Functions require http:// or https://. Open the project with Live Server or `npx serve .`.",
  );
}

if (!window.supabase) {
  console.warn(
    "Supabase SDK is unavailable; only explicit demo mode can use the local store.",
  );
} else if (SUPABASE_ANON_KEY.startsWith("PASTE")) {
  console.warn(
    "Add the public Supabase anon key in shared/supabase.js (Dashboard → Settings → API).",
  );
}
