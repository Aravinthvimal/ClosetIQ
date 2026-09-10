// ─────────────────────────────────────────────────────────
// ClosetIQ — Supabase Configuration
// Fill in your project URL and anon key from supabase.com
// Settings can also be saved via the in-app Settings modal.
// ─────────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  supabaseUrl: '',   // e.g. https://abcdefgh.supabase.co
  supabaseKey: '',   // Your anon/public key
};

// Load saved config from localStorage (set via Settings modal)
function loadConfig() {
  try {
    const saved = localStorage.getItem('closetiq_config');
    if (saved) return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
  } catch (_) {}
  return { ...DEFAULT_CONFIG };
}

function saveConfig(cfg) {
  localStorage.setItem('closetiq_config', JSON.stringify(cfg));
}

const CONFIG = loadConfig();
