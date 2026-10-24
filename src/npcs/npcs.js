// NPCs: the two princess hosts at the Princess Plaza gazebo plus a few ambient park staff.
// Each NPC: { id, name, group, update(dt, t), talk() }. Dialogue content lives in dialogue.js.
// The princesses ('p1', 'p2') take their name, color and catchphrase from game.settings.princesses — never
// hardcoded — and rebuild themselves on the 'settings:change' event.
import * as THREE from 'three';
import { buildAvatar, SKIN_TONES } from '../core/avatar.js';
import { DEFAULT_SETTINGS } from '../core/settings.js';
import { getDialogue, getAmbientDialogue, walkDialogue } from './dialogue.js';

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
    id: 'lifeguard', name: 'Lifeguard', sub: 'Lagoon patrol', color: '#e74c3c', ambient: true,
    position: [12, 0, -45], facing: Math.PI / 2,
    avatar: { name: 'Lifeguard', skin: SKIN_TONES[4], hairStyle: 'curly', hairColor: '#2b1a0e', outfit: 'casual',
      topColor: '#e74c3c', bottomColor: '#ffffff', shoeColor: '#f9d71c', accessory: 'cape', accessoryColor: '#e74c3c' },
  },
];

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

class NPC {
  constructor(game, def) {
    this.game = game;
    this.id = def.id; this.name = def.name; this.def = def;
    this.ambient = !!def.ambient;
    this.avatar = buildAvatar(def.avatar);
    this.group = this.avatar.group;
    this.group.name = `npc:${def.id}`;
    const [x, , z] = def.position;
    const y = game.world?.getGroundHeight?.(x, z, 1) ?? 0;
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

  update(dt, t) {
    const player = this.game.player;
    let targetYaw = this.baseFacing;
    let dist = Infinity;
    if (player) {
      const dx = player.position.x - this.group.position.x, dz = player.position.z - this.group.position.z;
      dist = Math.hypot(dx, dz);
      if (dist < 10) targetYaw = Math.atan2(dx, dz);
    }
    // lerp yaw along the shortest arc
    let diff = targetYaw - this.group.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.group.rotation.y += diff * Math.min(1, dt * 4);

    // occasional wave when the player is near
    if (dist < 8 && t > this.nextWaveAt && t > this.waveUntil) {
      this.waveUntil = t + 1.8;
      this.nextWaveAt = t + 5 + Math.random() * 4;
    }
    this.anim = t < this.waveUntil ? 'wave' : 'idle';
    this.avatar.setAnim(this.anim, t + this.group.position.x * 0.37);
    this.tag.position.y = this.tagBaseY + Math.sin(t * 2 + this.group.position.x) * 0.06;
  }
}

export function createNPCs(game) {
  const princesses = ['p1', 'p2'].map((id) => new NPC(game, princessDef(id, game.settings)));
  const npcs = [...princesses, ...AMBIENT_DEFS.map((def) => new NPC(game, def))];
  // Player renamed / recoloured a princess (or the park): rebuild avatars, name tags and prompt labels in place.
  game.events.on('settings:change', (settings) => {
    for (const npc of princesses) npc.applyDef(princessDef(npc.id, settings || game.settings));
  });
  return npcs;
}
