// NPCs: the two princess hosts at the Princess Plaza gazebo, a few ambient park staff, and the Splash Cove
// lifeguards (who whistle at anyone running on the pool deck — see LifeguardPatrol).
// Each NPC: { id, name, group, update(dt, t), talk() }. Dialogue content lives in dialogue.js.
// The princesses ('p1', 'p2') take their name, color and catchphrase from game.settings.princesses — never
// hardcoded — and rebuild themselves on the 'settings:change' event.
import * as THREE from 'three';
import { buildAvatar, SKIN_TONES } from '../core/avatar.js';
import { DEFAULT_SETTINGS } from '../core/settings.js';
import { getDialogue, getAmbientDialogue, walkDialogue, getBopLine } from './dialogue.js';

/** Mix a hex colour toward white by `amt` (0..1). */
export function lighten(hex, amt = 0.25) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const ch = (v) => Math.round(v + (255 - v) * amt).toString(16).padStart(2, '0');
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}
// Perceived luminance (0..1) so dark gown colours still get a readable name tag on the dark pill.
function luminance(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}
const tagColor = (hex) => (luminance(hex) < 0.45 ? lighten(hex, 0.45) : hex);

// Static (non-identifying) parts of the two princess hosts: where they stand and their hairstyle / accessory.
// Everything a player can personalise (name, colour, catchphrase) is merged in from settings at build time.
const PRINCESS_BASE = {
  p1: {
    position: [-3, 0, 12], facing: 0, outfit: 'gown',
    avatar: { skin: SKIN_TONES[1], hairStyle: 'long', hairColor: '#5a3825', shoeColor: '#222222', accessory: 'tiara', accessoryColor: '#f9d71c' },
  },
  p2: {
    position: [3, 0, 12], facing: 0, outfit: 'dress',
    avatar: { skin: SKIN_TONES[1], hairStyle: 'ponytail', hairColor: '#5a3825', shoeColor: '#ff6fb5', accessory: 'bunnyEars', accessoryColor: '#ff6fb5' },
  },
};

function princessFromSettings(settings) {
  const s = settings || DEFAULT_SETTINGS;
  const list = s.princesses || DEFAULT_SETTINGS.princesses;
  return {
    p1: list[0] || DEFAULT_SETTINGS.princesses[0],
    p2: list[1] || DEFAULT_SETTINGS.princesses[1],
    park: s.parkName || DEFAULT_SETTINGS.parkName,
  };
}

/** Build the full NPC def for princess `id` from the current settings. */
function princessDef(id, settings) {
  const base = PRINCESS_BASE[id];
  const { park, ...ps } = princessFromSettings(settings);
  const p = ps[id];
  return {
    id, name: p.name, sub: `Princess of ${park}`, color: p.color, crown: true,
    position: base.position, facing: base.facing,
    avatar: { ...base.avatar, name: p.name, outfit: base.outfit, topColor: p.color, bottomColor: lighten(p.color, base.outfit === 'gown' ? 0.18 : 0.3) },
  };
}

// Playground spinner (world/playground.js MX/MZ) — the Pal idles ~4.5 m south-west of it, facing the hub.
const SPINNER_X = 31, SPINNER_Z = 83;
const PAL_WALK_SPEED = 3;

const AMBIENT_DEFS = [
  {
    id: 'guide', name: 'Park Guide', sub: 'Ask me anything', color: '#5bb0ff', ambient: true,
    position: [4, 0, 90], facing: 0,
    avatar: { name: 'Guide', skin: SKIN_TONES[3], hairStyle: 'short', hairColor: '#111111', outfit: 'casual',
      topColor: '#5bb0ff', bottomColor: '#222222', shoeColor: '#ffffff', accessory: 'sunglasses', accessoryColor: '#111111' },
  },
  {
    id: 'chef', name: 'Churro Chef', sub: 'Fresh churros!', color: '#ff8c42', ambient: true,
    position: [14, 0, -4], facing: Math.PI,
    avatar: { name: 'Chef', skin: SKIN_TONES[2], hairStyle: 'bun', hairColor: '#c0392b', outfit: 'hoodie',
      topColor: '#ffffff', bottomColor: '#ff8c42', shoeColor: '#8d6e63', accessory: 'wizardHat', accessoryColor: '#ffffff' },
  },
  {
    id: 'lifeguard', name: 'Lifeguard', sub: 'Lagoon patrol', color: '#e74c3c', ambient: true, lifeguard: true,
    position: [12, 0, -45], facing: Math.PI / 2,
    avatar: { name: 'Lifeguard', skin: SKIN_TONES[4], hairStyle: 'curly', hairColor: '#2b1a0e', outfit: 'casual',
      topColor: '#e74c3c', bottomColor: '#ffffff', shoeColor: '#f9d71c', accessory: 'cape', accessoryColor: '#e74c3c' },
  },
  {
    // Playground Pal: teen attendant in a staff polo by the spinner; walks over and pushes it on 'spinner:push:start'
    // (the pusher spot the world sends is just south of the spinner, so the Pal idles a few metres south-west of it)
    id: 'pal', name: 'Playground Pal', sub: 'Spinner pushes!', color: '#7bd94a', ambient: true, attendant: true,
    position: [SPINNER_X - 3.4, 0, SPINNER_Z + 3.2], facing: Math.atan2(3.4, -3.2),
    avatar: { name: 'Pal', skin: SKIN_TONES[0], hairStyle: 'curly', hairColor: '#d8a35a', outfit: 'casual',
      topColor: '#7bd94a', bottomColor: '#3b5bdb', shoeColor: '#ffffff', accessory: 'none', accessoryColor: '#ffffff' },
  },
];

// Splash Cove lifeguards: positions come from world.lifeguardSpots when the world provides them.
const LIFEGUARD_FALLBACK = [
  { position: [148, 0, -39], facing: -Math.PI / 2 },   // wave pool, facing west over the water
  { position: [160, 0, 10], facing: Math.PI },         // lazy river
];
const LIFEGUARD_LOOKS = [
  { name: 'Lifeguard Sunny', skin: SKIN_TONES[2], hairStyle: 'bob', hairColor: '#f2d16b' },
  { name: 'Lifeguard Reef', skin: SKIN_TONES[5], hairStyle: 'short', hairColor: '#111111' },
  { name: 'Lifeguard Coral', skin: SKIN_TONES[0], hairStyle: 'bun', hairColor: '#c0392b' },
];
function lifeguardDefs(game) {
  const spots = Array.isArray(game.world?.lifeguardSpots) && game.world.lifeguardSpots.length ? game.world.lifeguardSpots : LIFEGUARD_FALLBACK;
  return spots.slice(0, 3).map((s, i) => {
    const p = s.position || s;
    const pos = Array.isArray(p) ? p : [p.x, p.y ?? 0, p.z];
    const look = LIFEGUARD_LOOKS[i % LIFEGUARD_LOOKS.length];
    return {
      id: `lifeguard-${i + 1}`, name: look.name, sub: 'Pool patrol · no running!', color: '#e74c3c', ambient: true, lifeguard: true, poolguard: true,
      position: pos, facing: s.facing ?? 0, chair: !!s.chair,
      avatar: { ...look, outfit: 'swimsuit', topColor: '#e74c3c', bottomColor: '#e74c3c', shoeColor: '#ffffff', accessory: 'sunglasses', accessoryColor: '#111111' },
    };
  });
}
// Fallback "no running" zone: the whole Splash Cove wing.
const POOL_FALLBACK = new THREE.Box3(new THREE.Vector3(122, -5, -70), new THREE.Vector3(200, 30, 85));
const RUN_SPEED = 8.5;      // m/s — walking is 6.5, running 11 (core/player.js)
const WARN_COOLDOWN = 6;

// Floating name tag: canvas texture with name + optional crown icon, drawn in the NPC's color.
// Returns the sprite plus a redraw(name, color) so a renamed/recoloured NPC can refresh in place.
function makeNameTag(name, color, crown) {
  const w = 512, h = 160;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(2.6, 2.6 * (h / w), 1);

  function redraw(name, color) {
    ctx.clearRect(0, 0, w, h);
    // rounded pill background
    const r = 44, pad = 24;
    ctx.fillStyle = 'rgba(20, 24, 40, 0.72)';
    ctx.beginPath();
    ctx.roundRect(pad, 30, w - pad * 2, h - 60, r);
    ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 6; ctx.stroke();
    // text (shrink long names so they stay inside the pill)
    let size = 62;
    ctx.font = `bold ${size}px "Trebuchet MS", "Segoe UI", Arial, sans-serif`;
    const maxW = w - pad * 2 - 40 - (crown ? 80 : 0);
    while (size > 30 && ctx.measureText(name).width > maxW) { size -= 4; ctx.font = `bold ${size}px "Trebuchet MS", "Segoe UI", Arial, sans-serif`; }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const textX = crown ? w / 2 + 34 : w / 2;
    ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.strokeText(name, textX, h / 2 + 2);
    ctx.fillStyle = color;
    ctx.fillText(name, textX, h / 2 + 2);
    if (crown) {
      const tw = ctx.measureText(name).width;
      const cx = textX - tw / 2 - 52, cy = h / 2;
      ctx.fillStyle = '#f9d71c';
      ctx.beginPath();
      ctx.moveTo(cx - 30, cy + 22); ctx.lineTo(cx - 32, cy - 14); ctx.lineTo(cx - 14, cy + 2); ctx.lineTo(cx, cy - 26);
      ctx.lineTo(cx + 14, cy + 2); ctx.lineTo(cx + 32, cy - 14); ctx.lineTo(cx + 30, cy + 22); ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ff6fb5';
      ctx.beginPath(); ctx.arc(cx, cy + 10, 6, 0, Math.PI * 2); ctx.fill();
    }
    tex.needsUpdate = true;
  }
  redraw(name, color);
  sprite.userData.redraw = redraw;
  return sprite;
}

// Comic speech bubble ("NO RUNNING!") — white bubble, coloured text, shown briefly above a shouting NPC.
// sprite.userData.redraw(text, color) swaps the text (lifeguards shout different things at runners and boppers).
function makeShoutBubble(text, color = '#e74c3c') {
  const w = 512, h = 192;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const redraw = (text, color = '#e74c3c') => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.roundRect(16, 10, w - 32, h - 60, 40); ctx.fill();
    ctx.beginPath(); ctx.moveTo(w / 2 - 28, h - 52); ctx.lineTo(w / 2 + 28, h - 52); ctx.lineTo(w / 2, h - 8); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.roundRect(16, 10, w - 32, h - 60, 40); ctx.stroke();
    let size = 66;
    ctx.font = `bold ${size}px "Trebuchet MS", "Segoe UI", Arial, sans-serif`;
    while (size > 28 && ctx.measureText(text).width > w - 80) { size -= 4; ctx.font = `bold ${size}px "Trebuchet MS", "Segoe UI", Arial, sans-serif`; }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = color;
    ctx.fillText(text, w / 2, (h - 50) / 2 + 4);
    tex.needsUpdate = true;
  };
  redraw(text, color);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
  sprite.scale.set(3.4, 3.4 * (h / w), 1);
  sprite.renderOrder = 10;
  sprite.visible = false;
  sprite.userData.redraw = redraw;
  return sprite;
}

const gearMat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra });
/** Lifeguard kit: a whistle on a lanyard and a red rescue float tucked under the arm. Local to the avatar group. */
function buildLifeguardGear() {
  const g = new THREE.Group(); g.name = 'lifeguard-gear';
  // lanyard + whistle
  const lanyard = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.015, 6, 20), gearMat('#222222'));
  lanyard.position.set(0, 1.5, 0.12); lanyard.rotation.x = 0.35; g.add(lanyard);
  const whistle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.09, 0.09), gearMat('#f9d71c', { metalness: 0.4, roughness: 0.3 }));
  whistle.position.set(0, 1.3, 0.3); g.add(whistle);
  // rescue float (red tube with white stripes) under the left arm
  const float = new THREE.Group();
  float.position.set(-0.62, 1.0, 0.05); float.rotation.z = 0.12;
  const tube = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.8, 4, 10), gearMat('#e74c3c'));
  float.add(tube);
  for (const y of [-0.25, 0.25]) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.08, 12), gearMat('#ffffff')); s.position.y = y; float.add(s); }
  tube.castShadow = true;
  g.add(float);
  g.userData.float = float;
  return g;
}

class NPC {
  constructor(game, def) {
    this.game = game;
    this.id = def.id; this.name = def.name; this.def = def;
    this.ambient = !!def.ambient;
    this.avatar = buildAvatar(def.avatar);
    this.group = this.avatar.group;
    this.group.name = `npc:${def.id}`;
    const [x, py, z] = def.position;
    // perches (lifeguard chair decks) pass their own height; everyone else stands on the ground
    const y = Math.max(game.world?.getGroundHeight?.(x, z, 1) ?? 0, py || 0);
    this.group.position.set(x, y, z);
    this.baseFacing = def.facing ?? 0;
    this.group.rotation.y = this.baseFacing;
    this.tag = makeNameTag(def.name, tagColor(def.color), !!def.crown);
    this.tagBaseY = this.avatar.height + 0.9; // clear of tall accessories (bunny ears, hats)
    this.tag.position.y = this.tagBaseY;
    this.group.add(this.tag);
    this.talking = false;
    this.waveUntil = 0;       // t until which the wave animation plays
    this.nextWaveAt = 0;      // t when the next wave may start
    this.anim = 'idle';
    this.lookAt = null;       // Vector3 to face instead of the base facing (set by shout())
    this.lookUntil = 0;
    this.bopStart = -1;       // game.time when the last bop landed (wobble runs BOP_WOBBLE_S from there)

    this.interactable = {
      position: this.group.position, radius: 3.5, kind: 'npc', id: this.id,
      label: `Talk to ${def.name}`, sub: def.sub,
      onInteract: () => this.talk(),
      enabled: () => game.player?.state === 'walk' && !this.talking,
    };
    game.interactables.push(this.interactable);
  }

  /** Re-skin this NPC from a new def (name / colours / sub). Avatar, name tag and prompt label all refresh. */
  applyDef(def) {
    this.def = def; this.name = def.name;
    this.avatar.setConfig(def.avatar);
    if (!this.tag.parent) this.group.add(this.tag);   // the avatar rebuild clears the group's children
    this.group.name = `npc:${def.id}`;
    this.tag.userData.redraw?.(def.name, tagColor(def.color));
    this.tagBaseY = this.avatar.height + 0.9;
    this.interactable.label = `Talk to ${def.name}`;
    this.interactable.sub = def.sub;
  }

  async talk() {
    if (this.talking) return;
    const g = this.game;
    this.talking = true;
    const playerName = g.player?.config?.name || 'Explorer';
    // Build the tree BEFORE emitting so the first conversation still reads as a first meeting.
    // getDialogue returns either string[] or a DialogueNode tree { lines, choices: [{ label, sub?, next }] }.
    const tree = this.ambient
      ? getAmbientDialogue(this.id, g.quests, playerName, g.settings)
      : getDialogue(this.id, g.quests, playerName, g.settings);
    g.events.emit('npc:talk', { npc: this.id });
    if (g.player) g.player.frozen = true;
    this.waveUntil = g.time + 1.2;
    try {
      g.audio?.play?.('talk');
      // speaker/colour are read per node so a settings:change mid-conversation still shows the right name
      await walkDialogue(tree, (lines, choices) => g.ui.dialogue(lines, { speaker: this.name, color: this.def.color, choices }));
    } catch (e) {
      console.error('[npc] dialogue failed', e);
    } finally {
      if (g.player) g.player.frozen = false;
      this.talking = false;
      this.nextWaveAt = g.time + 6;
    }
  }

  /**
   * Bopped with a balloon / Needoh (quests/items.js): a ~0.6 s stagger-wobble (tilt + squash of the whole group,
   * the idle anim keeps running underneath), turn to the player, and a one-liner toast in this NPC's voice.
   */
  bopped(item = 'balloon') {
    const g = this.game, t = g.time || 0;
    this.bopStart = t;
    this.lookUntil = t + 2.5;
    this.nextWaveAt = t + 4;
    if (typeof this.avatar.bopped === 'function') { try { this.avatar.bopped(); } catch {} }
    const line = this.bopLine(item);
    if (line) g.ui?.toast?.(`${this.name}: ${line}`, 3000);
    this.onBopped?.(t, item);
    return Promise.resolve();
  }
  bopLine(item) { return getBopLine(this.id, this.game.settings, this.game.player?.config?.name || 'Explorer', item); }
  applyBopWobble(t) {
    const gp = this.group;
    const k = this.bopStart >= 0 ? (t - this.bopStart) / BOP_WOBBLE_S : 2;
    if (k >= 1) {
      if (this.bopStart >= 0) { gp.rotation.x = gp.rotation.z = 0; gp.scale.set(1, 1, 1); this.bopStart = -1; }
      return;
    }
    // the avatar rig may play its own stagger (avatar.bopped()); then the group only adds a light squash
    const own = typeof this.avatar.bopped === 'function' ? 0.45 : 1;
    const fade = 1 - k, w = Math.sin(k * Math.PI * 3.5) * fade;
    gp.rotation.z = w * 0.28 * own;              // side-to-side stagger
    gp.rotation.x = -Math.sin(k * Math.PI) * 0.12 * fade * own;   // knocked back a touch
    const sq = Math.sin(k * Math.PI) * 0.12 * own;
    gp.scale.set(1 + sq, 1 - sq, 1 + sq);
  }

  update(dt, t) {
    const player = this.game.player;
    let targetYaw = this.baseFacing;
    let dist = Infinity;
    if (player) {
      const dx = player.position.x - this.group.position.x, dz = player.position.z - this.group.position.z;
      dist = Math.hypot(dx, dz);
      if (dist < 10 || t < this.lookUntil) targetYaw = Math.atan2(dx, dz);
    }
    // lerp yaw along the shortest arc
    let diff = targetYaw - this.group.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.group.rotation.y += diff * Math.min(1, dt * (t < this.lookUntil ? 10 : 4));

    // occasional wave when the player is near
    if (dist < 8 && t > this.nextWaveAt && t > this.waveUntil) {
      this.waveUntil = t + 1.8;
      this.nextWaveAt = t + 5 + Math.random() * 4;
    }
    this.anim = t < this.waveUntil ? 'wave' : 'idle';
    this.avatar.setAnim(this.anim, t + this.group.position.x * 0.37);
    this.tag.position.y = this.tagBaseY + Math.sin(t * 2 + this.group.position.x) * 0.06;
    this.applyBopWobble(t);
  }
}
const BOP_WOBBLE_S = 0.6;

/**
 * Playground Pal: stands by the spinner. On `spinner:push:start { position, duration }` (world/playground.js) walks
 * to `position` at PAL_WALK_SPEED, faces the spinner and loops a push animation until `spinner:push:end`, then
 * walks home. States: 'idle' | 'walk' | 'push' | 'return'.
 */
class Attendant extends NPC {
  constructor(game, def) {
    super(game, def);
    this.home = this.group.position.clone();
    this.mode = 'idle';
    this.target = null;
    this.spinner = new THREE.Vector3(SPINNER_X, 0, SPINNER_Z);
    const lm = game.world?.landmarks;
    if (lm?.spinner?.x !== undefined) this.spinner.set(lm.spinner.x, 0, lm.spinner.z);
    this.pushUntil = 0;
    game.events.on('spinner:push:start', (e = {}) => this.startPush(e));
    game.events.on('spinner:push:end', () => this.endPush());
  }
  startPush({ position, duration } = {}) {
    const g = this.game;
    const p = position && typeof position.x === 'number' ? position : { x: this.spinner.x, y: 0, z: this.spinner.z + 2.2 };
    this.target = new THREE.Vector3(p.x, p.y ?? 0, p.z);
    this.mode = 'walk';
    this.pushUntil = (g.time || 0) + (Number(duration) || 8) + 4;   // safety: stop pushing even if no :end arrives
    this.waveUntil = 0;
  }
  endPush() {
    if (this.mode === 'idle') return;
    this.target = this.home.clone();
    this.mode = 'return';
  }
  /** Step toward this.target; returns true on arrival. Faces the direction of travel. */
  walkTo(dt, t) {
    const gp = this.group.position, to = this.target;
    const dx = to.x - gp.x, dz = to.z - gp.z, d = Math.hypot(dx, dz);
    if (d < 0.12) { gp.x = to.x; gp.z = to.z; return true; }
    const step = Math.min(d, PAL_WALK_SPEED * dt);
    gp.x += (dx / d) * step; gp.z += (dz / d) * step;
    gp.y = Math.max(this.game.world?.getGroundHeight?.(gp.x, gp.z, gp.y + 1) ?? 0, 0);
    const yaw = Math.atan2(dx, dz);
    let diff = yaw - this.group.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.group.rotation.y += diff * Math.min(1, dt * 10);
    this.avatar.setAnim('walk', t, 1.1);
    return false;
  }
  update(dt, t) {
    if (this.mode === 'idle') { super.update(dt, t); return; }
    this.tag.position.y = this.tagBaseY + Math.sin(t * 2) * 0.06;
    if (this.mode === 'walk') {
      if (this.walkTo(dt, t)) this.mode = 'push';
    } else if (this.mode === 'push') {
      // face the spinner's hub and shove: both arms out front, a lean-in bob (on top of the wave pose's timing)
      const dx = this.spinner.x - this.group.position.x, dz = this.spinner.z - this.group.position.z;
      const yaw = Math.atan2(dx, dz);
      let diff = yaw - this.group.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.group.rotation.y += diff * Math.min(1, dt * 8);
      this.avatar.setAnim('idle', t);
      const parts = this.avatar.parts, ph = Math.sin(t * 5);
      if (parts?.armL && parts?.armR) {
        parts.armL.rotation.x = parts.armR.rotation.x = -1.3 + ph * 0.45;
        parts.armL.rotation.z = 0.25; parts.armR.rotation.z = -0.25;
      }
      if (parts?.torso) { parts.torso.rotation.x = 0.22 + ph * 0.12; }
      if (parts?.legL && parts?.legR) { parts.legL.rotation.x = -0.35; parts.legR.rotation.x = 0.3; }
      if (t > this.pushUntil) this.endPush();
    } else if (this.mode === 'return') {
      if (this.walkTo(dt, t)) { this.mode = 'idle'; this.group.rotation.y = this.baseFacing; }
    }
    this.applyBopWobble(t);
  }
}

/** A lifeguard: whistle + float, and shout() — turns to the player, raises an arm, shows a "NO RUNNING!" bubble. */
class Lifeguard extends NPC {
  constructor(game, def) {
    super(game, def);
    this.gear = buildLifeguardGear();
    this.group.add(this.gear);
    this.bubble = makeShoutBubble('NO RUNNING!'); this.bubbleText = 'NO RUNNING!';
    this.bubble.position.y = this.tagBaseY + 1.1;
    this.group.add(this.bubble);
    this.shoutUntil = 0;
    if (def.chair) {
      // up on a chair: the talk prompt is anchored at the foot of the ladder so players on the deck can reach it
      const g = this.group.position;
      this.interactable.position = new THREE.Vector3(g.x, game.world?.getGroundHeight?.(g.x, g.z, 1) ?? 0, g.z);
      this.interactable.radius = 4.5;
    }
  }
  shout(t, text = 'NO RUNNING!') {
    this.shoutUntil = t + 2.4;
    this.waveUntil = t + 2.4;          // arm up (the 'wave' pose)
    this.nextWaveAt = t + 8;
    this.lookUntil = t + 3;
    if (text !== this.bubbleText) { this.bubbleText = text; this.bubble.userData.redraw?.(text); }
    this.bubble.visible = true;
  }
  /** A bop gets the whistle treatment: comic bubble + arm up, on top of the wobble and the toast. */
  onBopped(t) { this.shout(t, 'NO HORSEPLAY!'); this.game.audio?.play?.('whistle'); }
  update(dt, t) {
    super.update(dt, t);
    if (this.bubble.visible) {
      const k = Math.min(1, (this.shoutUntil - t) / 0.3);
      this.bubble.visible = t < this.shoutUntil;
      this.bubble.material.opacity = Math.max(0, Math.min(1, k));
      this.bubble.position.y = this.tagBaseY + 1.1 + Math.sin(t * 14) * 0.05;   // angry jiggle
    }
    const fl = this.gear.userData.float;
    if (fl) fl.rotation.z = 0.12 + (t < this.shoutUntil ? Math.sin(t * 18) * 0.12 : 0);
  }
}

/**
 * Watches the local player: running (speed > RUN_SPEED, from the position delta so a sugar rush counts too)
 * inside any world.poolZones box makes the nearest lifeguard shout, whistle and emit 'lifeguard:warn'.
 */
class LifeguardPatrol {
  constructor(game, guards) {
    this.game = game; this.guards = guards;
    this.id = 'lifeguard-patrol';
    this.group = new THREE.Group(); this.group.name = 'npc:lifeguard-patrol';
    this.prev = null; this.nextWarnAt = 0; this.runTime = 0;
  }
  inPool(p) {
    const zones = this.game.world?.poolZones;
    const list = Array.isArray(zones) && zones.length ? zones : [POOL_FALLBACK];
    for (const b of list) {
      const min = b.min || b, max = b.max || b;
      if (p.x >= min.x && p.x <= max.x && p.z >= min.z && p.z <= max.z) return true;
    }
    return false;
  }
  update(dt, t) {
    const g = this.game, p = g.player;
    if (!p || !g.started || dt <= 0) return;
    const pos = p.position;
    if (!this.prev) { this.prev = pos.clone(); return; }
    const speed = Math.hypot(pos.x - this.prev.x, pos.z - this.prev.z) / dt;
    this.prev.copy(pos);
    const running = p.state === 'walk' && speed > RUN_SPEED && speed < 40 && this.inPool(pos);
    // a short grace period so one fast step onto the deck doesn't trigger it
    this.runTime = running ? this.runTime + dt : 0;
    if (!running || this.runTime < 0.25 || t < this.nextWarnAt || !this.guards.length) return;
    this.nextWarnAt = t + WARN_COOLDOWN;
    let best = null, bestD = Infinity;
    for (const lg of this.guards) { const d = lg.group.position.distanceTo(pos); if (d < bestD) { bestD = d; best = lg; } }
    best.shout(t);
    g.audio?.play?.('whistle');
    g.ui.toast?.(`${best.name}: HEY! NO RUNNING by the pool! 🛟`, 3200);
    g.events.emit('lifeguard:warn', { npc: best.id });
  }
}

export function createNPCs(game) {
  const princesses = ['p1', 'p2'].map((id) => new NPC(game, princessDef(id, game.settings)));
  const ambient = AMBIENT_DEFS.map((def) => (def.lifeguard ? new Lifeguard(game, def) : def.attendant ? new Attendant(game, def) : new NPC(game, def)));
  const poolGuards = lifeguardDefs(game).map((def) => new Lifeguard(game, def));
  const patrol = new LifeguardPatrol(game, [...poolGuards, ...ambient.filter((n) => n instanceof Lifeguard)]);
  const npcs = [...princesses, ...ambient, ...poolGuards, patrol];
  // Player renamed / recoloured a princess (or the park): rebuild avatars, name tags and prompt labels in place.
  game.events.on('settings:change', (settings) => {
    for (const npc of princesses) npc.applyDef(princessDef(npc.id, settings || game.settings));
  });
  return npcs;
}
