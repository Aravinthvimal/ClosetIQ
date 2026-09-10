// ─────────────────────────────────────────────────────────
// ClosetIQ — Supabase Configuration
// Credentials are loaded from js/env.js (gitignored).
// For Netlify: set SUPABASE_URL and SUPABASE_KEY as
// environment variables — netlify.toml generates env.js.
// ─────────────────────────────────────────────────────────

// SUPABASE_URL and SUPABASE_KEY are declared in js/env.js
// (loaded before this file in index.html)

// Load config — localStorage overrides env.js values (for dev/testing)
function loadConfig() {
  try {
    const saved = localStorage.getItem('closetiq_config');
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        supabaseUrl: parsed.supabaseUrl || (typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : ''),
        supabaseKey: parsed.supabaseKey || (typeof SUPABASE_KEY !== 'undefined' ? SUPABASE_KEY : ''),
      };
    }
  } catch (_) {}
  return {
    supabaseUrl: typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : '',
    supabaseKey: typeof SUPABASE_KEY !== 'undefined' ? SUPABASE_KEY : '',
  };
}

function saveConfig(cfg) {
  localStorage.setItem('closetiq_config', JSON.stringify(cfg));
}

const CONFIG = loadConfig();
