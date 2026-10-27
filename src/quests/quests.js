// Quest system: tracks progress from game events, grants accessory unlocks, places the hidden Royal Gems,
// runs the DAY system (quests.day, quests.trySleep()) and persists everything to localStorage ('pk:save').
// Quest text that mentions the princesses or the park reads game.settings at display time (see questTitle),
// so renaming a princess updates the objective and the next toast immediately.
//
// Days: day 1 is the classic quest list (QUEST_DEFS, accessory unlocks). Day 2 and 3 are hand-written lists
// built on the round-2 events (snacks, shops, playground, seats, slides, weather, lifeguards). From day 4 on a
// daily set of 5 is drawn from a pool, deterministically by day number. Per-day counters live in
// state.dayStats and reset every morning; lifetime stats (ridesRidden, gems, lapsBest…) never reset.
import * as THREE from 'three';
import { ACCESSORIES } from '../core/avatar.js';
import { DEFAULT_SETTINGS } from '../core/settings.js';
import { Items } from './items.js';

export const SAVE_KEY = 'pk:save';
export const PRINCESS_IDS = ['p1', 'p2'];
// Accessories everyone has from the start; everything else in ACCESSORIES must be unlocked by a quest.
export const BASE_ACCESSORIES = ['none', 'tiara', 'bunnyEars'];
export const RIDE_IDS = ['coaster', 'logflume', 'carousel', 'ferris', 'teacups', 'lightcycle', 'motorcycle', 'waterslide', 'lazyriver'];
export const WATER_RIDE_IDS = ['waterslide', 'lazyriver'];
export const GEM_TOTAL = 14; // matches world.gemSpots.length (12 in the main park + 2 in Splash Cove)
export const PLAYGROUND_TOTAL = 5; // swing, slide, spinner, seesaw, climb (world emits `play` { id })
export const KEYS_TOTAL = 5;       // royal keys needed to open the castle (one per fully completed day)

export const ACCESSORY_NAMES = {
  halo: 'Halo', wings: 'Fairy Wings', crown: 'Royal Crown', wizardHat: 'Wizard Hat',
  sunglasses: 'Cool Shades', catEars: 'Cat Ears', cape: 'Hero Cape', tiara: 'Tiara', bunnyEars: 'Bunny Ears',
};
const SNACK_ITEMS = ['iceCream', 'cottonCandy', 'pretzel', 'lemonade'];

// Princess records from settings (always two; falls back to defaults if settings are missing).
function princesses(settings) {
  const list = (settings || DEFAULT_SETTINGS).princesses || DEFAULT_SETTINGS.princesses;
  return PRINCESS_IDS.map((id, i) => list[i] || DEFAULT_SETTINGS.princesses[i]);
}
/** Resolve a quest's title for the given settings — titles may be functions of settings (princess names). */
export function questTitle(q, settings) {
  return typeof q.title === 'function' ? q.title(settings || DEFAULT_SETTINGS) : q.title;
}
const uniq = (arr, v) => { if (!arr.includes(v)) arr.push(v); return arr.length; };

// ---------- day 1: the classic list ----------
// `progress(state, dayStats)` derives progress purely from saved state so it survives reloads.
// `title` is a string or `(settings) => string`; always display it through questTitle().
export const QUEST_DEFS = [
  { id: 'meet', title: (st) => `Say hi to Princess ${princesses(st)[0].name} and Princess ${princesses(st)[1].name}`, total: 2,
    reward: { accessories: ['halo'], text: 'Halo unlocked!' },
    progress: (s) => PRINCESS_IDS.filter((n) => s.talkedTo.includes(n)).length },
  { id: 'first-ride', title: 'Ride any ride', total: 1,
    reward: { text: 'You are officially a park explorer!' },
    progress: (s) => Math.min(1, s.stats.rideCount) },
  { id: 'gems', title: `Find the ${GEM_TOTAL} hidden Royal Gems`, total: GEM_TOTAL,
    reward: { accessories: ['wings'], text: 'Fairy Wings unlocked!' },
    progress: (s) => Math.min(GEM_TOTAL, s.gems.length) },
  { id: 'ride-all', title: 'Ride every ride in the park', total: RIDE_IDS.length,
    reward: { accessories: ['crown', 'wizardHat'], text: 'Royal Crown + Wizard Hat unlocked!' },
    progress: (s) => RIDE_IDS.filter((r) => s.ridesRidden.includes(r)).length },
  { id: 'speed-demon', title: 'Finish 3 laps on Thunder Bikes', total: 1,
    reward: { accessories: ['sunglasses'], text: 'Cool Shades unlocked!' },
    progress: (s) => (s.ridesRidden.includes('motorcycle') ? 1 : 0) },
  { id: 'grid-master', title: 'Collect 10 bits on Grid Riders', total: 1,
    reward: { accessories: ['catEars'], text: 'Cat Ears unlocked!' },
    progress: (s) => (s.ridesRidden.includes('lightcycle') ? 1 : 0) },
  { id: 'thrill-seeker', title: 'Ride the coaster 3 times', total: 3,
    reward: { accessories: ['cape'], text: 'Hero Cape unlocked!' },
    progress: (s) => Math.min(3, s.stats.perRide?.coaster || 0) },
  { id: 'royal', title: 'Complete every quest', total: 7,
    reward: { royal: true, text: 'You earned a Royal Key! 🔑 (1/5)' },
    progress: (s) => QUEST_DEFS.filter((q) => q.id !== 'royal' && s.completed.includes(q.id)).length },
];

// ---------- day 2+ quest builders (per-day counters in dayStats `d`) ----------
// Each builder returns a def; `hint` is a plain-language tip the princesses read out ("What should I do next?").
const Q = {
  snacks: (n) => ({ id: 'snacks', title: `Eat ${n} snacks from the Snack Stand`, total: n, progress: (s, d) => d.snacks,
    hint: 'The Snack Stand is by the entrance. Grab a treat, then press E (or tap ✦) to eat it. Sugar rush!' }),
  squish: (n) => ({ id: 'squish', title: `Squish a Needoh ${n} times`, total: n, progress: (s, d) => d.squishes,
    hint: 'Get a Needoh at the Souvenir Shop near the entrance, then press E (or tap ✦) to squish it. So squishy.' }),
  play: (n, again) => ({ id: again ? 'play-again' : 'play', title: again ? 'Visit every playground thing again' : `Play on ${n} different playground things`, total: n, progress: (s, d) => d.played.length,
    hint: 'The playground has a swing, a slide, a spinner, a seesaw and a climbing frame. Press E on each one.' }),
  sit: (n) => ({ id: 'sit', title: `Sit on ${n} benches`, total: n, progress: (s, d) => d.sits.length,
    hint: 'Walk up to any bench or lounger and press E to sit. X stands you back up.' }),
  slide: (n = 1) => ({ id: 'slide', title: n > 1 ? `Zoom down the flamingo slide ${n} times` : 'Zoom down the flamingo slide', total: n, progress: (s, d) => d.slideCount,
    hint: 'Climb the Flamingo Lookout steps by the lagoon and press E at the top of the big slide.' }),
  weather: (n) => ({ id: 'weather', title: `Change the weather ${n} times`, total: n, progress: (s, d) => d.weatherChanges,
    hint: 'Press K or tap the ☀️ button to pick the weather. Try Night — the park lights come on.' }),
  waterRides: () => ({ id: 'water-rides', title: 'Ride every water ride', total: WATER_RIDE_IDS.length, progress: (s, d) => WATER_RIDE_IDS.filter((r) => d.rides.includes(r)).length,
    hint: 'Splash Cove is the east wing: Flamingo Falls and the Lazy Lagoon River both count.' }),
  gems: (n) => ({ id: 'sunset-gems', title: `Find ${n} Sunset Gems`, total: n, gems: n, progress: (s, d) => d.gems.length,
    hint: 'Orange Sunset Gems glow in some of the old gem spots. Look for the orange ring on the ground.' }),
  thrown: () => ({ id: 'thrown', title: 'Get thrown out of the teacups', total: 1, progress: (s, d) => Math.min(1, d.thrown),
    hint: 'At the Tipsy Teacups, pick the button that says not to press it. Then hold on. Or don\'t.' }),
  fastLap: () => ({ id: 'fast-lap', title: (st, d) => `Beat a Thunder Bikes lap under ${d?.lapTarget ?? 30}s`, total: 1, progress: (s, d) => d.fastLap,
    hint: 'Thunder Bikes: hold boost on the straights and ease off into the turns. Hit the ramps for air.' }),
  nightCoaster: () => ({ id: 'night-coaster', title: 'Ride the coaster at night', total: 1, progress: (s, d) => Math.min(1, d.nightCoaster),
    hint: 'Set the weather to Night (press K), then ride Dragon\'s Breath Coaster all the way round.' }),
  balloonTalk: () => ({ id: 'balloon-talk', title: (st) => `Talk to Princess ${princesses(st)[0].name} and Princess ${princesses(st)[1].name} with a balloon`, total: 2, progress: (s, d) => d.balloonTalks.length,
    hint: 'Get a balloon from the Souvenir Shop, then say hi to both princesses at the gazebo while holding it.' }),
  warns: (n) => ({ id: 'warns', title: `Make the lifeguard yell at you ${n} times`, total: n, progress: (s, d) => d.warns,
    hint: 'Run (hold Shift) on the pool deck in Splash Cove. The lifeguards do NOT like that.' }),
  rides: (n) => ({ id: 'rides', title: `Ride ${n} rides`, total: n, progress: (s, d) => d.rideCount,
    hint: 'Any ride counts, even the same one twice. Ride it all the way to the end.' }),
  coaster: (n) => ({ id: 'coaster', title: `Ride the coaster ${n} times`, total: n, progress: (s, d) => d.perRide.coaster || 0,
    hint: 'Dragon\'s Breath Coaster is in the northwest. Keep your eyes open on the drop.' }),
  laps: (n) => ({ id: 'laps', title: `Finish ${n} laps on Thunder Bikes or Grid Riders`, total: n, progress: (s, d) => d.laps,
    hint: 'Thunder Bikes (southeast) and Grid Riders (southwest) both count laps.' }),
  wand: (n) => ({ id: 'wand', title: `Wave a glow wand ${n} times`, total: n, progress: (s, d) => d.sparkles,
    hint: 'The Souvenir Shop has glow wands. Press E (or tap ✦) to wave it. Sparkles!' }),
  talkBoth: () => ({ id: 'talk-both', title: (st) => `Visit Princess ${princesses(st)[0].name} and Princess ${princesses(st)[1].name}`, total: 2, progress: (s, d) => d.talked.length,
    hint: 'The princesses are at the gazebo in Princess Plaza. Say hi to both.' }),
  walk: (m) => ({ id: 'walk', title: `Walk ${m} metres around the park`, total: m, progress: (s, d) => Math.floor(d.walked),
    hint: 'Just explore! Every step counts. Splash Cove is a nice long walk.' }),
  // only once the castle is open (5 royal keys): the throne room's two thrones are seats 'throneL' / 'throneR'
  throne: () => ({ id: 'throne', title: 'Sit on a throne', total: 1, progress: (s, d) => Math.min(1, d.throne || 0),
    hint: 'The castle keep is open now! Cross the drawbridge, go through the big door and press E at a throne.' }),
};
const royal = (day, n) => ({ id: day === 1 ? 'royal' : `d${day}-royal`, title: 'Complete every quest', total: n, royalDay: day,
  reward: day === 1 ? { royal: true, text: 'You earned a Royal Key! 🔑 (1/5)' } : { day: true, text: `Day ${day} complete! Sleep in your bed to start Day ${day + 1}.` },
  progress: () => 0 }); // real progress is computed in progressOf() (counts the day's other quests)

const DAY_LISTS = {
  2: () => [Q.snacks(3), Q.squish(10), Q.play(4), Q.sit(3), Q.slide(1), Q.weather(3), Q.waterRides(), Q.gems(5)],
  3: () => [Q.thrown(), Q.fastLap(), Q.nightCoaster(), Q.balloonTalk(), Q.warns(3), Q.play(PLAYGROUND_TOTAL, true)],
};
// Day 4+: a pool of builders; 5 are drawn per day with a seeded shuffle so the list is stable across reloads.
const POOL = [
  () => Q.snacks(2 + (Math.random() * 3 | 0)), () => Q.squish(5 + (Math.random() * 11 | 0)), () => Q.play(3 + (Math.random() * 3 | 0)),
  () => Q.sit(2 + (Math.random() * 3 | 0)), () => Q.slide(1 + (Math.random() * 2 | 0)), () => Q.weather(2 + (Math.random() * 2 | 0)),
  () => Q.waterRides(), () => Q.gems(3 + (Math.random() * 4 | 0)), () => Q.thrown(), () => Q.fastLap(), () => Q.nightCoaster(),
  () => Q.balloonTalk(), () => Q.warns(2 + (Math.random() * 2 | 0)), () => Q.rides(3 + (Math.random() * 3 | 0)),
  () => Q.coaster(2 + (Math.random() * 2 | 0)), () => Q.laps(3 + (Math.random() * 4 | 0)), () => Q.wand(5 + (Math.random() * 6 | 0)),
  () => Q.talkBoth(), () => Q.walk(300 + 100 * (Math.random() * 5 | 0)),
];
function seededRng(seed) { let s = (seed * 2654435761 + 12345) >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/**
 * The quest list for `day` (ids are prefixed `d<N>-` from day 2 so completions never collide across days).
 * `castleOpen`: once the castle doors are open, every generated day also asks for a sit on a throne.
 */
export function questsForDay(day, { castleOpen = false } = {}) {
  let list;
  if (day <= 1) return QUEST_DEFS;
  if (DAY_LISTS[day]) list = DAY_LISTS[day]();
  else {
    const rng = seededRng(day);
    const realRandom = Math.random; Math.random = rng;   // the builders' size rolls use the seeded stream
    try {
      const idx = POOL.map((_, i) => i);
      for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
      list = idx.slice(0, 5).map((i) => POOL[i]());
    } finally { Math.random = realRandom; }
  }
  if (castleOpen) list.push(Q.throne());
  list = list.map((q) => ({ ...q, id: `d${day}-${q.id}`, reward: q.reward || { text: 'Nice one!' } }));
  list.push(royal(day, list.length));
  return list;
}

const GEM_COLORS = [
  { color: '#ff6fb5', emissive: '#ff6fb5' },   // pink
  { color: '#f9d71c', emissive: '#f9d71c' },   // yellow
  { color: '#0b5d3b', emissive: '#2ecc71' },   // deep green (brighter glow so it reads in shade)
  { color: '#00c2c7', emissive: '#00e5ea' },   // cyan
];
const SUNSET_GEM = { color: '#ff8c42', emissive: '#ff7a1a' };

function defaultSave() {
  return {
    day: 1, ridesRidden: [], gems: [], completed: [], unlockedAccessories: [], lapsBest: {}, talkedTo: [],
    royalKeys: 0, castleOpen: false,
    stats: { rideCount: 0, crashes: 0, laps: 0, perRide: {} },
    dayStats: defaultDayStats(),
  };
}
// Per-day counters (reset every morning by startDay).
function defaultDayStats(lapsBest = {}) {
  const best = lapsBest.motorcycle;
  return {
    snacks: 0, squishes: 0, sparkles: 0, played: [], sits: [], slideCount: 0, weatherChanges: 0, rides: [], perRide: {}, rideCount: 0,
    gems: [], warns: 0, thrown: 0, fastLap: 0, nightCoaster: 0, balloonTalks: [], talked: [], laps: 0, walked: 0, throne: 0,
    lapTarget: best ? Math.max(8, Math.ceil(best) - 1) : 30,
  };
}

// Where the player stands at the keep's front door when the world has no `castleDoor` landmark yet:
// the keep's front face is at z ≈ -86 (CASTLE.z -91, keep centre -94, half depth 8), inside the courtyard.
const CASTLE_DOOR_FALLBACK = [0, -83.4];
const _d = new THREE.Vector3();
const gemGeo = new THREE.OctahedronGeometry(0.5, 0);
const ringGeo = new THREE.TorusGeometry(0.55, 0.05, 8, 24);
const sparkGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);

export class Quests {
  constructor(game) {
    this.game = game;
    this.hadSave = false;
    this.state = defaultSave();
    this.state.royal = false;
    this.recentCompletions = [];   // quest ids completed since an NPC last reacted (in-memory)
    this.gems = [];                // royal gems [{ id, position: Vector3 (ground), group, found }]
    this.dayGems = [];             // this day's Sunset Gems (same shape)
    this.fx = [];                  // active particle bursts
    this.group = new THREE.Group();
    this.group.name = 'quests:gems';
    this._lastProgress = {};
    this._saveTimer = null;
    this._defsDay = 0; this._defs = QUEST_DEFS; this._defsCastle = false;
    this.sleeping = false;
    this.items = new Items(game);  // shops + hand-held item actions (src/quests/items.js)
    this.load();
    // ?keys=N — debug: start with N royal keys (saved, so the castle door can be tested without 5 real days)
    const keys = Number(game.params?.get?.('keys'));
    if (Number.isFinite(keys) && game.params.get('keys') !== null) { this.state.royalKeys = Math.max(0, Math.min(99, Math.floor(keys))); this.save(); }
  }

  // ---------- public getters ----------
  get settings() { return this.game.settings || DEFAULT_SETTINGS; }
  get day() { return this.state.day; }
  get gemsFound() { return this.state.gems.length; }
  get unlockedAccessories() { return this.state.unlockedAccessories; }
  get dayStats() { return this.state.dayStats; }
  /** Royal keys earned so far (one per day on which every quest was completed). Five open the castle. */
  get royalKeys() { return this.state.royalKeys; }
  get keysTotal() { return KEYS_TOTAL; }
  /** True once the castle keep's door has been opened (saved; the world reads it at build). */
  get castleOpen() { return !!this.state.castleOpen; }
  /** Quest defs for the current day (re-generated when the day or the castle state changes). */
  dayQuests() {
    const castleOpen = this.castleOpen;
    if (this._defsDay !== this.state.day || this._defsCastle !== castleOpen) {
      this._defsDay = this.state.day; this._defsCastle = castleOpen;
      this._defs = questsForDay(this.state.day, { castleOpen });
      for (const q of this._defs) if (this._lastProgress[q.id] == null) this._lastProgress[q.id] = this.progressOf(q);
    }
    return this._defs;
  }
  questById(id) { return this.dayQuests().find((q) => q.id === id) || QUEST_DEFS.find((q) => q.id === id) || null; }
  isComplete(id) { return this.state.completed.includes(id); }
  progressOf(q) {
    if (this.isComplete(q.id)) return q.total;
    if (q.royalDay) return this.dayQuests().filter((o) => !o.royalDay && this.state.completed.includes(o.id)).length;
    return Math.min(q.total, q.progress(this.state, this.state.dayStats) || 0);
  }
  progress(id) {
    const q = this.questById(id);
    if (!q) return { progress: 0, total: 0 };
    return { progress: this.progressOf(q), total: q.total };
  }
  title(q) { return typeof q.title === 'function' ? q.title(this.settings, this.state.dayStats) : q.title; }
  activeQuest() { return this.dayQuests().find((q) => !this.isComplete(q.id)) || null; }
  /** Incomplete quests of the current day (the royal "complete every quest" one excluded). */
  remainingToday() { return this.dayQuests().filter((q) => !q.royalDay && !this.isComplete(q.id)); }
  dayComplete() { return this.remainingToday().length === 0; }
  isUnlocked(accessory) { return BASE_ACCESSORIES.includes(accessory) || this.state.unlockedAccessories.includes(accessory); }
  // Dialogue helper: returns quests completed since last call and clears the list.
  takeRecentCompletions() { const r = this.recentCompletions; this.recentCompletions = []; return r; }

  // ---------- persistence ----------
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        const s = defaultSave();
        for (const k of ['ridesRidden', 'gems', 'completed', 'unlockedAccessories', 'talkedTo']) if (Array.isArray(d[k])) s[k] = d[k];
        if (d.lapsBest && typeof d.lapsBest === 'object') s.lapsBest = d.lapsBest;
        if (d.stats && typeof d.stats === 'object') s.stats = { ...s.stats, ...d.stats, perRide: { ...(d.stats.perRide || {}) } };
        s.day = Math.max(1, Math.floor(Number(d.day) || 1));                 // old saves → day 1
        s.dayStats = { ...defaultDayStats(s.lapsBest), ...((d.dayStats && typeof d.dayStats === 'object') ? d.dayStats : {}) };
        for (const k of ['played', 'sits', 'rides', 'gems', 'balloonTalks', 'talked']) if (!Array.isArray(s.dayStats[k])) s.dayStats[k] = [];
        if (!s.dayStats.perRide || typeof s.dayStats.perRide !== 'object') s.dayStats.perRide = {};
        // royal keys: saved from round 3 on; older saves derive them from the "complete every quest" days done
        const derived = s.completed.filter((id) => id === 'royal' || /^d\d+-royal$/.test(id)).length;
        s.royalKeys = Number.isFinite(Number(d.royalKeys)) && d.royalKeys !== undefined ? Math.max(0, Math.floor(Number(d.royalKeys))) : derived;
        s.castleOpen = !!d.castleOpen;
        this.state = s;
        this.hadSave = true;
      }
    } catch (e) { console.warn('[quests] failed to load save', e); }
    this.state.royal = this.state.completed.includes('royal');
    for (const q of this.dayQuests()) this._lastProgress[q.id] = this.progressOf(q);
  }
  save() {
    clearTimeout(this._saveTimer); this._saveTimer = null;
    const s = this.state;
    const data = {
      day: s.day, ridesRidden: s.ridesRidden, gems: s.gems, completed: s.completed, unlockedAccessories: s.unlockedAccessories,
      lapsBest: s.lapsBest, talkedTo: s.talkedTo, stats: s.stats, dayStats: s.dayStats,
      royalKeys: s.royalKeys, castleOpen: !!s.castleOpen,
    };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { console.warn('[quests] failed to save', e); }
  }
  scheduleSave() {
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => this.save(), 150);
  }

  // ---------- lifecycle ----------
  start() {
    const g = this.game, ev = g.events;
    g.scene.add(this.group);
    this.placeGems();
    this.placeDayGems();
    this.items.start();
    g.items = this.items;
    this.registerCastleDoor();
    ev.on('game:start', () => { this.registerCastleDoor(); this.emitKeys(); });
    // the world may have been built before the save was read: start with the door open when it already is
    if (this.castleOpen) g.world?.castle?.setDoorOpen?.(true, false);
    const ds = () => this.state.dayStats;
    ev.on('ride:complete', ({ ride }) => this.onRideComplete(ride));
    ev.on('ride:exit', ({ ride }) => { if (ride === 'teacups') this._teacupExitAt = g.time; });
    ev.on('player:landed', () => { if (this._teacupExitAt != null && g.time - this._teacupExitAt < 10) { this._teacupExitAt = null; ds().thrown++; this.changed(); } });
    ev.on('npc:talk', ({ npc }) => {
      if (!npc) return;
      const s = this.state;
      if (!s.talkedTo.includes(npc)) s.talkedTo.push(npc);
      if (PRINCESS_IDS.includes(npc)) {
        uniq(ds().talked, npc);
        if (this.heldItem() === 'balloon') uniq(ds().balloonTalks, npc);
      }
      this.changed();
    });
    ev.on('drive:lap', ({ ride, lapTime }) => {
      this.state.stats.laps++;
      ds().laps++;
      if (ride && typeof lapTime === 'number') {
        if (this.state.lapsBest[ride] == null || lapTime < this.state.lapsBest[ride]) {
          this.state.lapsBest[ride] = Math.round(lapTime * 100) / 100;
          if (this.state.stats.laps > 1) g.ui.toast?.(`New best lap: ${this.state.lapsBest[ride].toFixed(1)}s`);
        }
        if (ride === 'motorcycle' && lapTime < ds().lapTarget) ds().fastLap = 1;
      }
      this.changed();
    });
    ev.on('drive:crash', () => { this.state.stats.crashes++; this.scheduleSave(); });
    // round-2 events
    ev.on('snack:eat', () => { ds().snacks++; this.changed(); });
    ev.on('item:use', ({ item }) => { if (item === 'needoh') ds().squishes++; else if (item === 'wand') ds().sparkles++; else return; this.changed(); });
    ev.on('play', ({ id } = {}) => { uniq(ds().played, id || `thing-${ds().played.length}`); this.changed(); });
    ev.on('seat:sit', ({ id } = {}) => { uniq(ds().sits, id || `seat-${ds().sits.length}`); if (/^throne/i.test(id || '')) ds().throne = 1; this.changed(); });
    ev.on('slide:end', ({ id } = {}) => { if (!id || /lookout|flamingo/i.test(id)) ds().slideCount++; this.changed(); });
    ev.on('weather:change', () => { if (!g.started) return; ds().weatherChanges++; this.changed(); });
    ev.on('lifeguard:warn', () => { ds().warns++; this.changed(); });
    ev.on('game:start', ({ config } = {}) => {
      const name = config?.name || g.player?.config?.name || 'Explorer';
      g.ui.toast?.(this.hadSave ? `Welcome back, ${name}!${this.state.day > 1 ? ` It's Day ${this.state.day}.` : ''}` : `Welcome to ${this.settings.parkName}, ${name}!`);
      this.refreshObjective();
    });
    // Princess names live in quest titles, so re-render the objective when settings change.
    ev.on('settings:change', () => this.refreshObjective());
    window.addEventListener('pagehide', () => { if (this._saveTimer) this.save(); });
    this.refreshObjective();
  }

  heldItem() { return this.game.player?.config?.held || this.game.player?.avatar?.config?.held || 'none'; }
  currentWeather() { return this.game.world?.weather || this.settings.weather || 'sunny'; }

  onRideComplete(ride) {
    if (!ride) return;
    const s = this.state, d = s.dayStats;
    s.stats.rideCount++;
    s.stats.perRide[ride] = (s.stats.perRide[ride] || 0) + 1;
    if (!s.ridesRidden.includes(ride)) s.ridesRidden.push(ride);
    d.rideCount++;
    d.perRide[ride] = (d.perRide[ride] || 0) + 1;
    uniq(d.rides, ride);
    if (ride === 'coaster' && this.currentWeather() === 'night') d.nightCoaster++;
    this.changed();
  }

  // Re-evaluate every quest after any state change; emits progress/complete/unlock events and saves.
  changed() {
    const g = this.game;
    for (const q of this.dayQuests()) {
      if (this.isComplete(q.id)) continue;
      const p = this.progressOf(q);
      if (p !== this._lastProgress[q.id]) {
        this._lastProgress[q.id] = p;
        g.events.emit('quest:progress', { id: q.id, progress: p, total: q.total });
      }
      if (p >= q.total) this.completeQuest(q);
    }
    this.refreshObjective();
    this.scheduleSave();
  }

  completeQuest(q) {
    const g = this.game;
    if (this.isComplete(q.id)) return;
    this.state.completed.push(q.id);
    this.recentCompletions.push(q.id);
    if (q.reward.royal) this.state.royal = true;
    const title = this.title(q);
    g.events.emit('quest:complete', { id: q.id, title, reward: q.reward, day: this.state.day });
    g.ui.toast?.(`Quest complete: ${title}`);
    g.audio?.play?.('quest');
    for (const acc of q.reward.accessories || []) this.unlock(acc);
    if (q.reward.text && !q.reward.accessories?.length) setTimeout(() => g.ui.toast?.(q.reward.text, q.reward.day ? 5000 : 2600), 900);
    if (q.royalDay && q.royalDay > 1) g.ui.celebrate?.(`Day ${q.royalDay} complete! 🌙`);
    // every "complete every quest" day (day 1's `royal` included) earns one royal key
    if (q.id === 'royal' || q.royalDay) this.addKey(q.id === 'royal' ? 0 : 1800);
  }

  // ---------- royal keys + the castle ----------
  /** +1 royal key (toast after `delayMs` so it lands after the day-complete toast). Five keys open the castle door. */
  addKey(delayMs = 0) {
    const g = this.game;
    this.state.royalKeys = (this.state.royalKeys || 0) + 1;
    const n = this.state.royalKeys;
    this.emitKeys();
    this.scheduleSave();
    const text = n >= KEYS_TOTAL && !this.castleOpen
      ? `🔑 Royal Key ${n}/${KEYS_TOTAL}! You can open the castle door now!`
      : n > 1 ? `🔑 Royal Key ${Math.min(n, KEYS_TOTAL)}/${KEYS_TOTAL} earned! ${Math.max(0, KEYS_TOTAL - n)} more to open the castle.` : null;
    if (text) setTimeout(() => g.ui.toast?.(text, 4200), delayMs);
  }
  /** Debug / tests: set the key count directly. */
  setKeys(n) { this.state.royalKeys = Math.max(0, Math.floor(n) || 0); this.emitKeys(); this.scheduleSave(); }
  emitKeys() {
    const g = this.game;
    g.ui?.setKeys?.(this.state.royalKeys, KEYS_TOTAL);
    g.events.emit('keys:change', { keys: this.state.royalKeys, total: KEYS_TOTAL, castleOpen: this.castleOpen });
  }
  /** The keep's front door: locked until 5 royal keys; registered at world.landmarks.castleDoor. */
  registerCastleDoor() {
    const g = this.game;
    if (this.castleDoor || !g.world) return;
    const lm = g.world.landmarks || {};
    let position;
    if (lm.castleDoor && typeof lm.castleDoor.x === 'number') position = new THREE.Vector3(lm.castleDoor.x, lm.castleDoor.y ?? 0, lm.castleDoor.z);
    else { const [x, z] = CASTLE_DOOR_FALLBACK; position = new THREE.Vector3(x, g.world.getGroundHeight?.(x, z, 1) ?? 0, z); }
    this.castleDoor = {
      position, radius: 3.6, kind: 'misc', id: 'castleDoor',
      get label() { return 'Castle Door'; },
      onInteract: () => this.openCastleDoor(),
      enabled: () => g.player?.state === 'walk' && !this._doorBusy,
    };
    Object.defineProperty(this.castleDoor, 'sub', { get: () => (this.castleOpen ? 'the throne room awaits' : `🔑 ${Math.min(this.state.royalKeys, KEYS_TOTAL)}/${KEYS_TOTAL} royal keys`) });
    g.interactables.push(this.castleDoor);
  }
  async openCastleDoor() {
    const g = this.game, n = this.state.royalKeys;
    if (this._doorBusy) return;
    this._doorBusy = true;
    try {
      if (this.castleOpen) {
        g.world?.castle?.setDoorOpen?.(true);
        g.audio?.play?.('click');
        g.ui.toast?.('The castle is yours — go on in! 👑');
        return;
      }
      if (n < KEYS_TOTAL) {
        const left = KEYS_TOTAL - n;
        g.audio?.play?.('click');
        await (g.ui.dialogue?.([`Locked. 🔑 ${left} more royal key${left === 1 ? '' : 's'} — one for every day you finish all your quests.`], { speaker: 'Castle Door', color: '#6b4a2b' }) ?? Promise.resolve());
        return;
      }
      await this.openCastle();
    } finally { this._doorBusy = false; }
  }
  /** Five keys: swing the door open, fanfare, title card, crown unlock, and the throne quest joins the day list. */
  async openCastle() {
    const g = this.game;
    if (this.castleOpen) return;
    this.state.castleOpen = true;
    this.save();
    const castle = g.world?.castle;
    if (castle?.setDoorOpen) castle.setDoorOpen(true); else g.audio?.play?.('door');   // the world plays 'door' via castle:door
    g.audio?.play?.('fanfare');
    g.events.emit('castle:open', { keys: this.state.royalKeys });
    this.unlock('crown');
    this.dayQuests();   // regenerate with the throne quest
    this.refreshObjective();
    this.emitKeys();
    await (g.ui.titleCard?.('The castle is yours!', 'The throne room is open — go sit on a throne! 👑', 2800) ?? Promise.resolve());
    g.ui.toast?.('New quest: Sit on a throne', 3600);
    this.changed();
  }

  unlock(accessory) {
    if (!ACCESSORIES.includes(accessory)) { console.warn('[quests] unknown accessory', accessory); return; }
    if (this.isUnlocked(accessory)) return;
    this.state.unlockedAccessories.push(accessory);
    this.game.events.emit('unlock', { accessory });
    this.game.audio?.play?.('unlock');
    setTimeout(() => this.game.ui.toast?.(`Unlocked: ${ACCESSORY_NAMES[accessory] || accessory}! Try it on in the Dressing Room (C)`), 900);
    this.scheduleSave();
  }

  objectiveText() {
    const q = this.activeQuest();
    const day = this.state.day;
    if (!q) return day === 1 ? 'All quests complete — you earned a Royal Key! Sleep at home for Day 2' : `Day ${day} done — sleep in your bed for Day ${day + 1}`;
    const { progress, total } = this.progress(q.id);
    return `Day ${day} · ${this.title(q)} — ${progress}/${total}`;
  }
  refreshObjective() { this.game.ui.setObjective?.(this.objectiveText()); }

  // ---------- days ----------
  /**
   * Called by the bed in the player's house. If every quest of the day is done: fade out, advance the day,
   * show the "Day N" card and resolve true. Otherwise shows what is left and returns false (synchronously).
   */
  trySleep() {
    const g = this.game;
    if (this.sleeping) return false;
    const left = this.remainingToday();
    if (left.length) {
      // pack the remaining titles onto a few lines (≤ ~100 chars each) so the box doesn't take 9 pages to read
      const lines = [];
      for (const q of left) {
        const t = `• ${this.title(q)}`;
        if (lines.length && (lines[lines.length - 1] + '   ' + t).length <= 100) lines[lines.length - 1] += '   ' + t;
        else lines.push(t);
      }
      g.ui.dialogue?.([`You still have ${left.length === 1 ? 'one thing' : `${left.length} things`} to do today!`, ...lines.slice(0, 5)], { speaker: 'Bed', color: '#9b59b6' });
      return false;
    }
    this.sleeping = true;
    return (async () => {
      const next = this.state.day + 1;
      g.audio?.play?.('sleep');
      g.ui.lock?.('sleep');
      try {
        await (g.ui.fade?.(900) ?? Promise.resolve());
        await (g.ui.titleCard?.('Good night…', `Day ${this.state.day} is over. Sweet dreams! 💤`, 2200) ?? Promise.resolve());
        this.startDay(next);
        const q = this.activeQuest();
        await (g.ui.titleCard?.(`Day ${next}`, q ? `First up: ${this.title(q)}` : 'A brand new day!', 2400) ?? Promise.resolve());
        await (g.ui.fade?.(900, 'in') ?? Promise.resolve());
      } finally { g.ui.unlock?.('sleep'); this.sleeping = false; }
      const q = this.activeQuest();
      if (q) g.ui.toast?.(`Day ${next}: ${this.title(q)}`, 4000);
      return true;
    })();
  }

  /** Jump straight to `day`: resets per-day counters, loads that day's quests and its Sunset Gems. */
  startDay(day) {
    const s = this.state;
    s.day = Math.max(1, Math.floor(day));
    s.dayStats = defaultDayStats(s.lapsBest);
    this.recentCompletions = [];   // yesterday's news — the princesses give the morning briefing instead
    this._defsDay = 0;
    this._lastProgress = {};
    for (const q of this.dayQuests()) this._lastProgress[q.id] = this.progressOf(q);
    this.placeDayGems();
    this.refreshObjective();
    this.game.events.emit('day:change', { day: s.day });
    this.save();
  }

  // ---------- gems ----------
  gemSpots() {
    const spots = this.game.world?.gemSpots;
    if (Array.isArray(spots) && spots.length) return spots.slice(0, GEM_TOTAL);
    // Fallback ring if the world didn't provide spots.
    const out = [];
    for (let i = 0; i < GEM_TOTAL; i++) { const a = (i / GEM_TOTAL) * Math.PI * 2; out.push(new THREE.Vector3(Math.cos(a) * 40, 0, Math.sin(a) * 40)); }
    return out;
  }
  groundedSpot(spot) {
    const pos = new THREE.Vector3(spot.x, spot.y ?? 0, spot.z);
    pos.y = this.game.world?.getGroundHeight?.(pos.x, pos.z, pos.y + 1) ?? pos.y;
    return pos;
  }

  placeGems() {
    this.gemSpots().forEach((spot, i) => {
      const id = `gem-${i}`;
      const found = this.state.gems.includes(id);
      const gem = { id, index: i, position: this.groundedSpot(spot), found, group: null, crystal: null, ring: null, sunset: false };
      if (!found) this.buildGem(gem);
      this.gems.push(gem);
    });
  }

  /** Sunset Gems: a day quest with `gems: N` re-uses N of the royal gem spots (seeded by day) in orange. */
  placeDayGems() {
    for (const g of this.dayGems) if (g.group) this.group.remove(g.group);
    this.dayGems = [];
    const q = this.dayQuests().find((q) => q.gems);
    if (!q || this.isComplete(q.id)) return;
    const spots = this.gemSpots();
    const rng = seededRng(this.state.day * 7 + 3);
    const idx = spots.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    idx.slice(0, q.gems).forEach((spotIndex, i) => {
      const id = `sun-d${this.state.day}-${spotIndex}`;
      const found = this.state.dayStats.gems.includes(id);
      const gem = { id, index: i, position: this.groundedSpot(spots[spotIndex]), found, group: null, crystal: null, ring: null, sunset: true };
      if (!found) this.buildGem(gem);
      this.dayGems.push(gem);
    });
  }

  buildGem(gem) {
    const c = gem.sunset ? SUNSET_GEM : GEM_COLORS[gem.index % GEM_COLORS.length];
    const group = new THREE.Group();
    group.position.copy(gem.position);
    const crystal = new THREE.Mesh(gemGeo, new THREE.MeshStandardMaterial({
      color: c.color, emissive: c.emissive, emissiveIntensity: 0.9, roughness: 0.25, metalness: 0.1,
    }));
    crystal.position.y = 1.1;
    crystal.castShadow = true;
    group.add(crystal);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshStandardMaterial({
      color: c.emissive, emissive: c.emissive, emissiveIntensity: 1.2, roughness: 0.4, transparent: true, opacity: 0.85,
    }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.06;
    group.add(ring);
    this.group.add(group);
    gem.group = group; gem.crystal = crystal; gem.ring = ring;
  }

  collectGem(gem) {
    const g = this.game;
    gem.found = true;
    if (gem.group) { this.group.remove(gem.group); gem.group = null; }
    if (gem.sunset) {
      uniq(this.state.dayStats.gems, gem.id);
      const q = this.dayQuests().find((q) => q.gems);
      g.audio?.play?.('gem');
      g.events.emit('gem:found', { id: gem.id, position: gem.position.clone(), kind: 'sunset' });
      g.ui.toast?.(`Sunset Gem found! (${this.state.dayStats.gems.length}/${q?.gems || '?'})`);
      this.burst(gem.position, SUNSET_GEM.emissive);
      this.changed();
      return;
    }
    if (!this.state.gems.includes(gem.id)) this.state.gems.push(gem.id);
    const n = this.state.gems.length;
    g.audio?.play?.('gem');
    g.events.emit('gem:found', { id: gem.id, position: gem.position.clone(), kind: 'royal' });
    g.ui.toast?.(`Royal Gem found! (${n}/${GEM_TOTAL})`);
    // Milestone cheers from the two hosts; p2 (the hype one) leads with her catchphrase when she has one.
    if (n === Math.floor(GEM_TOTAL / 3)) setTimeout(() => {
      const [, p2] = princesses(this.settings);
      const cheer = p2.catchphrase ? `${p2.catchphrase}, you're cracked at this` : `you're cracked at this!`;
      g.ui.toast?.(`${n}/${GEM_TOTAL} gems! ${p2.name} says: ${cheer}`);
    }, 1200);
    if (n === Math.floor((GEM_TOTAL * 2) / 3)) setTimeout(() => {
      const [p1] = princesses(this.settings);
      g.ui.toast?.(`${n}/${GEM_TOTAL} gems! ${p1.name} says: only ${GEM_TOTAL - n} left — check the quiet corners and Splash Cove.`);
    }, 1200);
    this.burst(gem.position, GEM_COLORS[gem.index % GEM_COLORS.length].emissive);
    this.changed();
  }

  burst(pos, color) {
    const count = 8, parts = [];
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(sparkGeo, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.5, transparent: true, opacity: 1 }));
      m.position.set(pos.x, pos.y + 1.1, pos.z);
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      parts.push({ mesh: m, vel: new THREE.Vector3(Math.cos(a) * 3, 3 + Math.random() * 3, Math.sin(a) * 3) });
      this.group.add(m);
    }
    this.fx.push({ parts, age: 0, life: 0.8 });
  }

  update(dt, t) {
    const player = this.game.player;
    for (const list of [this.gems, this.dayGems]) {
      for (const gem of list) {
        if (gem.found || !gem.group) continue;
        gem.crystal.position.y = 1.1 + Math.sin(t * 2 + gem.index) * 0.15;
        gem.crystal.rotation.y = t * 1.5 + gem.index;
        gem.ring.rotation.z = t * 0.6;
        gem.ring.scale.setScalar(1 + Math.sin(t * 3 + gem.index) * 0.08);
        if (player) {
          _d.copy(gem.position).sub(player.position);
          const dy = Math.abs(_d.y); _d.y = 0;
          if (_d.length() < 1.6 && dy < 2.5) this.collectGem(gem);
        }
      }
    }
    // "Walk N metres" counts the player's own odometer, per day.
    if (player && typeof player.distanceWalked === 'number') {
      if (this._walkMark == null) this._walkMark = player.distanceWalked;
      const delta = player.distanceWalked - this._walkMark;
      if (delta > 0) {
        this.state.dayStats.walked += delta; this._walkMark = player.distanceWalked;
        this._walkAcc = (this._walkAcc || 0) + delta;
        if (this._walkAcc > 10 && this.dayQuests().some((q) => q.id.endsWith('-walk') && !this.isComplete(q.id))) { this._walkAcc = 0; this.changed(); }
      }
    }
    this.items.update?.(dt, t);
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const fx = this.fx[i];
      fx.age += dt;
      const k = Math.min(1, fx.age / fx.life);
      for (const p of fx.parts) {
        p.vel.y -= 12 * dt;
        p.mesh.position.addScaledVector(p.vel, dt);
        p.mesh.rotation.x += dt * 6; p.mesh.rotation.y += dt * 8;
        p.mesh.material.opacity = 1 - k;
      }
      if (k >= 1) {
        for (const p of fx.parts) { this.group.remove(p.mesh); p.mesh.material.dispose(); }
        this.fx.splice(i, 1);
      }
    }
  }
}
