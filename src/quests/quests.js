// Quest system: tracks progress from game events, grants accessory unlocks, places the 12 hidden
// Royal Gems, and persists everything to localStorage ('pk:save').
// Quest text that mentions the princesses or the park reads game.settings at display time (see questTitle),
// so renaming a princess updates the objective and the next toast immediately.
import * as THREE from 'three';
import { ACCESSORIES } from '../core/avatar.js';
import { DEFAULT_SETTINGS } from '../core/settings.js';

export const SAVE_KEY = 'pk:save';
export const PRINCESS_IDS = ['p1', 'p2'];
// Accessories everyone has from the start; everything else in ACCESSORIES must be unlocked by a quest.
export const BASE_ACCESSORIES = ['none', 'tiara', 'bunnyEars'];
export const RIDE_IDS = ['coaster', 'logflume', 'carousel', 'ferris', 'teacups', 'lightcycle', 'motorcycle', 'waterslide', 'lazyriver'];
export const GEM_TOTAL = 14; // matches world.gemSpots.length (12 in the main park + 2 in Splash Cove)

export const ACCESSORY_NAMES = {
  halo: 'Halo', wings: 'Fairy Wings', crown: 'Royal Crown', wizardHat: 'Wizard Hat',
  sunglasses: 'Cool Shades', catEars: 'Cat Ears', cape: 'Hero Cape', tiara: 'Tiara', bunnyEars: 'Bunny Ears',
};

// Princess records from settings (always two; falls back to defaults if settings are missing).
function princesses(settings) {
  const list = (settings || DEFAULT_SETTINGS).princesses || DEFAULT_SETTINGS.princesses;
  return PRINCESS_IDS.map((id, i) => list[i] || DEFAULT_SETTINGS.princesses[i]);
}
/** Resolve a quest's title for the given settings — titles may be functions of settings (princess names). */
export function questTitle(q, settings) {
  return typeof q.title === 'function' ? q.title(settings || DEFAULT_SETTINGS) : q.title;
}

// Ordered quest list. `progress(state)` derives progress purely from saved state so it survives reloads.
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
    reward: { royal: true, text: 'You earned the Royal Keys!' },
    progress: (s) => QUEST_DEFS.filter((q) => q.id !== 'royal' && s.completed.includes(q.id)).length },
];

const GEM_COLORS = [
  { color: '#ff6fb5', emissive: '#ff6fb5' },   // pink
  { color: '#f9d71c', emissive: '#f9d71c' },   // yellow
  { color: '#0b5d3b', emissive: '#2ecc71' },   // deep green (brighter glow so it reads in shade)
  { color: '#00c2c7', emissive: '#00e5ea' },   // cyan
];

function defaultSave() {
  return {
    ridesRidden: [], gems: [], completed: [], unlockedAccessories: [], lapsBest: {}, talkedTo: [],
    stats: { rideCount: 0, crashes: 0, laps: 0, perRide: {} },
  };
}

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
    this.gems = [];                // [{ id, position: Vector3 (ground), group, found }]
    this.fx = [];                  // active particle bursts
    this.group = new THREE.Group();
    this.group.name = 'quests:gems';
    this._lastProgress = {};
    this._saveTimer = null;
    this.load();
  }

  // ---------- public getters ----------
  get settings() { return this.game.settings || DEFAULT_SETTINGS; }
  get gemsFound() { return this.state.gems.length; }
  get unlockedAccessories() { return this.state.unlockedAccessories; }
  isComplete(id) { return this.state.completed.includes(id); }
  progress(id) {
    const q = QUEST_DEFS.find((q) => q.id === id);
    if (!q) return { progress: 0, total: 0 };
    return { progress: this.isComplete(id) ? q.total : q.progress(this.state), total: q.total };
  }
  activeQuest() { return QUEST_DEFS.find((q) => !this.isComplete(q.id)) || null; }
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
        this.state = s;
        this.hadSave = true;
      }
    } catch (e) { console.warn('[quests] failed to load save', e); }
    this.state.royal = this.state.completed.includes('royal');
    for (const q of QUEST_DEFS) this._lastProgress[q.id] = this.progress(q.id).progress;
  }
  save() {
    clearTimeout(this._saveTimer); this._saveTimer = null;
    const s = this.state;
    const data = {
      ridesRidden: s.ridesRidden, gems: s.gems, completed: s.completed, unlockedAccessories: s.unlockedAccessories,
      lapsBest: s.lapsBest, talkedTo: s.talkedTo, stats: s.stats,
    };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { console.warn('[quests] failed to save', e); }
  }
  scheduleSave() {
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => this.save(), 150);
  }

  // ---------- lifecycle ----------
  start() {
    const g = this.game;
    g.scene.add(this.group);
    this.placeGems();
    g.events.on('ride:complete', ({ ride }) => this.onRideComplete(ride));
    g.events.on('npc:talk', ({ npc }) => { if (npc && !this.state.talkedTo.includes(npc)) { this.state.talkedTo.push(npc); this.changed(); } });
    g.events.on('drive:lap', ({ ride, lapTime }) => {
      this.state.stats.laps++;
      if (ride && typeof lapTime === 'number' && (this.state.lapsBest[ride] == null || lapTime < this.state.lapsBest[ride])) {
        this.state.lapsBest[ride] = Math.round(lapTime * 100) / 100;
        if (this.state.stats.laps > 1) g.ui.toast?.(`New best lap: ${this.state.lapsBest[ride].toFixed(1)}s`);
      }
      this.scheduleSave();
    });
    g.events.on('drive:crash', () => { this.state.stats.crashes++; this.scheduleSave(); });
    g.events.on('game:start', ({ config } = {}) => {
      const name = config?.name || g.player?.config?.name || 'Explorer';
      g.ui.toast?.(this.hadSave ? `Welcome back, ${name}!` : `Welcome to ${this.settings.parkName}, ${name}!`);
      this.refreshObjective();
    });
    // Princess names live in quest titles, so re-render the objective when settings change.
    g.events.on('settings:change', () => this.refreshObjective());
    window.addEventListener('pagehide', () => { if (this._saveTimer) this.save(); });
    this.refreshObjective();
  }

  onRideComplete(ride) {
    if (!ride) return;
    const s = this.state;
    s.stats.rideCount++;
    s.stats.perRide[ride] = (s.stats.perRide[ride] || 0) + 1;
    if (!s.ridesRidden.includes(ride)) s.ridesRidden.push(ride);
    this.changed();
  }

  // Re-evaluate every quest after any state change; emits progress/complete/unlock events and saves.
  changed() {
    const g = this.game;
    for (const q of QUEST_DEFS) {
      if (this.isComplete(q.id)) continue;
      const p = Math.min(q.total, q.progress(this.state));
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
    this.state.completed.push(q.id);
    this.recentCompletions.push(q.id);
    if (q.reward.royal) this.state.royal = true;
    const title = questTitle(q, this.settings);
    g.events.emit('quest:complete', { id: q.id, title, reward: q.reward });
    g.ui.toast?.(`Quest complete: ${title}`);
    g.audio?.play?.('quest');
    for (const acc of q.reward.accessories || []) this.unlock(acc);
    if (q.reward.text && !q.reward.accessories?.length) setTimeout(() => g.ui.toast?.(q.reward.text), 900);
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
    if (!q) return 'All quests complete — you hold the Royal Keys!';
    const { progress, total } = this.progress(q.id);
    return `${questTitle(q, this.settings)} — ${progress}/${total}`;
  }
  refreshObjective() { this.game.ui.setObjective?.(this.objectiveText()); }

  // ---------- gems ----------
  gemSpots() {
    const spots = this.game.world?.gemSpots;
    if (Array.isArray(spots) && spots.length) return spots.slice(0, GEM_TOTAL);
    // Fallback ring if the world didn't provide spots.
    const out = [];
    for (let i = 0; i < GEM_TOTAL; i++) { const a = (i / GEM_TOTAL) * Math.PI * 2; out.push(new THREE.Vector3(Math.cos(a) * 40, 0, Math.sin(a) * 40)); }
    return out;
  }

  placeGems() {
    const world = this.game.world;
    this.gemSpots().forEach((spot, i) => {
      const id = `gem-${i}`;
      const pos = new THREE.Vector3(spot.x, spot.y ?? 0, spot.z);
      pos.y = world?.getGroundHeight?.(pos.x, pos.z, pos.y + 1) ?? pos.y;
      const found = this.state.gems.includes(id);
      const gem = { id, index: i, position: pos, found, group: null, crystal: null, ring: null };
      if (!found) this.buildGem(gem);
      this.gems.push(gem);
    });
  }

  buildGem(gem) {
    const c = GEM_COLORS[gem.index % GEM_COLORS.length];
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
    if (!this.state.gems.includes(gem.id)) this.state.gems.push(gem.id);
    const n = this.state.gems.length;
    g.audio?.play?.('gem');
    g.events.emit('gem:found', { id: gem.id, position: gem.position.clone() });
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
    for (const gem of this.gems) {
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
