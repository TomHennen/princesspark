// Kingdom settings: the park name and the two princess hosts are chosen by the player, never hardcoded.
// Nothing in the codebase should contain a real person's name or age.
export const SETTINGS_KEY = 'pk:settings';
export const WEATHERS = ['sunny', 'cloudy', 'rain', 'storm', 'sunset', 'night'];
// Graphics quality tier (see game.perf in main.js). 'auto' picks medium on touch/mobile devices, high on desktop.
export const QUALITIES = ['auto', 'low', 'medium', 'high'];

export const DEFAULT_SETTINGS = {
  parkName: 'Sunshine Kingdom',
  setupDone: false,
  weather: 'sunny',           // 'sunny' | 'cloudy' | 'rain' | 'storm' | 'sunset' | 'night'
  quality: 'auto',            // 'auto' | 'low' | 'medium' | 'high'
  princesses: [
    // p1: the warm, clever big-sister type. p2: the bubbly hype type. Personalities are archetypes, not people.
    { id: 'p1', name: 'Juniper', color: '#0b5d3b', catchphrase: '' },
    { id: 'p2', name: 'Marigold', color: '#f9d71c', catchphrase: 'yay!' },
  ],
};

export function sanitizeName(s, max = 16) {
  return String(s || '').replace(/[^A-Za-z0-9 '\-]/g, '').trim().slice(0, max);
}

export function loadSettings() {
  let s = null;
  try { const raw = localStorage.getItem(SETTINGS_KEY); if (raw) s = JSON.parse(raw); } catch {}
  return normalize(s);
}
export function saveSettings(s) {
  const n = normalize(s);
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(n)); } catch {}
  return n;
}
function normalize(s) {
  const out = { ...DEFAULT_SETTINGS, ...(s || {}) };
  out.parkName = sanitizeName(out.parkName, 24) || DEFAULT_SETTINGS.parkName;
  out.weather = WEATHERS.includes(out.weather) ? out.weather : DEFAULT_SETTINGS.weather;
  out.quality = QUALITIES.includes(out.quality) ? out.quality : DEFAULT_SETTINGS.quality;
  out.princesses = DEFAULT_SETTINGS.princesses.map((d, i) => {
    const p = { ...d, ...((s && s.princesses && s.princesses[i]) || {}) };
    p.id = d.id;
    p.name = sanitizeName(p.name) || d.name;
    p.color = /^#[0-9a-fA-F]{6}$/.test(p.color) ? p.color : d.color;
    p.catchphrase = String(p.catchphrase || '').slice(0, 20).trim();
    return p;
  });
  return out;
}
/** Apply new settings at runtime: persists and tells every system via the 'settings:change' event. */
export function applySettings(game, next) {
  game.settings = saveSettings({ ...game.settings, ...next });
  game.events.emit('settings:change', game.settings);
  return game.settings;
}
