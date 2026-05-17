// =====================================================================
// settings.js  -- Persist user choices in localStorage
// =====================================================================

const KEY = "mandara_local_settings_v1";

const SAVED_KEYS = ["mode", "classes", "method", "palette", "reverse", "maxR"];

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    const out = {};
    for (const k of SAVED_KEYS) if (k in obj) out[k] = obj[k];
    return out;
  } catch {
    return null;
  }
}

export function saveSettings(state) {
  const obj = {};
  for (const k of SAVED_KEYS) obj[k] = state[k];
  try {
    localStorage.setItem(KEY, JSON.stringify(obj));
  } catch {
    /* private mode / quota — ignore silently */
  }
}
