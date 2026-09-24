// Supabase client configuration for AttendIQ.
// Load the supabase-js CDN script before this file; it exposes a global
// `supabase` object with createClient(). The anon key is safe to ship to the
// browser because row level security protects every table, and privileged
// operations (account creation and deletion) run inside the edge functions.
const SUPABASE_URL = "https://yvvgvteijtxnuwtncfio.supabase.co";
const SUPABASE_ANON_KEY = "PASTE_YOUR_ANON_KEY_HERE";

// Shared client for the future data layer (shared/store.js). Kept on the
// global scope so plain <script> files can reach it without modules.
window.AttendIQDb = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

if (!window.AttendIQDb) {
  console.warn(
    "supabase-js is not loaded yet; include its CDN script before shared/supabase.js",
  );
}
if (SUPABASE_ANON_KEY.startsWith("PASTE")) {
  console.warn(
    "Add your Supabase anon key in shared/supabase.js (Dashboard → Settings → API).",
  );
}
