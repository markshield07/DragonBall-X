// Persistent save data in localStorage. One slot, versioned so later phases
// can migrate old saves instead of wiping them.
const KEY = 'dragonballx.save.v1';
const SETTINGS_KEY = 'dragonballx.settings.v1';

function safeGet(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const SaveSystem = {
  hasSave() {
    return !!safeGet(KEY)?.character;
  },

  load() {
    const data = safeGet(KEY);
    if (!data || data.version !== 1) return null;
    return data;
  },

  save({ character, progress }) {
    return safeSet(KEY, { version: 1, savedAt: Date.now(), character, progress });
  },

  wipe() {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  },

  loadSettings() {
    return safeGet(SETTINGS_KEY);
  },

  saveSettings(settings) {
    return safeSet(SETTINGS_KEY, settings);
  },
};
