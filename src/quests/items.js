// Shops + hand-held items. Registers the Snack Stand and Souvenir Shop interactables (kind 'misc') at
// world.landmarks.snackStand / souvenirStand (fallback: in front of the counters by the entrance), opens
// ui.choose menus, and turns the interact key into the held item's action (eat / squish / wave / bop) whenever the
// player is NOT near an interactable (main.js gives interactables priority). Everything is free.
//
// Round 3: Q / the touch DROP button tosses the held item into the world (drop()); Needohs, plushies and wands
// bounce, settle and can be picked back up; balloons float away; snacks splat. Using the balloon or the Needoh is a
// "bop": the nearest NPC / remote player in front of the player gets a wobble (bop { targetKind, id, item }).
import * as THREE from 'three';
import * as Avatar from '../core/avatar.js';

const { HELD_ITEMS } = Avatar;

export const SNACKS = {
  iceCream:    { label: 'Ice cream',     sub: 'strawberry swirl',  emoji: '🍦', color: '#ff8fb8' },
  cottonCandy: { label: 'Cotton candy',  sub: 'pink cloud',        emoji: '🍭', color: '#ffb6e6' },
  pretzel:     { label: 'Pretzel',       sub: 'warm & salty',      emoji: '🥨', color: '#a0522d' },
  lemonade:    { label: 'Lemonade',      sub: 'extra sour',        emoji: '🍋', color: '#fff176' },
};
export const SOUVENIRS = {
  needoh:  { label: 'Needoh',           sub: 'squishy ball — press E to squish', emoji: '🟣', verb: 'Squish', color: '#7dff5a' },
  balloon: { label: 'Balloon',          sub: 'floaty & shiny',                  emoji: '🎈', verb: 'Bop', color: '#ff3b7a' },
  wand:    { label: 'Glow wand',        sub: 'sparkles!',                       emoji: '✨', verb: 'Wave', color: '#f9d71c' },
  plushie: { label: 'Flamingo plushie', sub: 'very huggable',                   emoji: '🦩', verb: 'Hug', color: '#ff8bc4' },
};
export const ITEM_NAMES = Object.fromEntries([...Object.entries(SNACKS), ...Object.entries(SOUVENIRS)].map(([k, v]) => [k, v.label]));
export const isSnack = (item) => !!SNACKS[item];
const FALLBACK = { snackStand: [40, 0, 64.5], souvenirStand: [-40, 0, 64.5] };
const SUGAR_RUSH_S = 15;
// dropped-item physics
const G = -14, MAX_ON_GROUND = 8, DROP_LIFE_S = 120, BALLOON_LIFE_S = 4, SPLAT_LIFE_S = 1.4;
const BOP_RANGE = 2.2, BOP_FACING_DOT = 0.3;
const _dir = new THREE.Vector3(), _off = new THREE.Vector3();

/** World-space mesh for a dropped item: the avatar's own builder when it exists, else a blob of the right colour. */
function buildDroppedMesh(kind) {
  let obj = null;
  try { obj = Avatar.buildHeldItem?.(kind) || null; } catch (e) { console.warn('[items] buildHeldItem failed', e); obj = null; }
  if (!obj) {
    const color = SOUVENIRS[kind]?.color || SNACKS[kind]?.color || '#ffffff';
    const geo = kind === 'wand' || kind === 'pretzel' ? new THREE.BoxGeometry(0.4, 0.08, 0.08) : new THREE.SphereGeometry(kind === 'balloon' ? 0.26 : 0.17, 12, 10);
    obj = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.4, emissive: color, emissiveIntensity: 0.15 }));
    obj.castShadow = true;
  }
  return obj;   // buildHeldItem already applies its userData.base scale
}
function disposeObject(obj) {
  obj.traverse((o) => { o.geometry?.dispose?.(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose?.()); });
}

export class Items {
  constructor(game) {
    this.game = game;
    this.registered = false;
    this.busy = false;          // a shop menu is open
    this.eating = false;        // bite animation in progress
    this.bopping = false;       // bop swing in progress
    this.dropped = [];          // [{ id, item, group, vel, settled, age, kind: 'bounce'|'float'|'splat', interactable }]
    this.group = new THREE.Group(); this.group.name = 'items:dropped';
    this._dropId = 0;
  }

  start() {
    const g = this.game;
    g.events.on('game:start', () => this.register());
    this.register();
  }

  /** Register the two shop interactables once a position is known (landmarks may land after us). */
  register() {
    if (this.registered) return;
    const g = this.game;
    if (!g.world) return;
    this.registered = true;
    g.scene?.add(this.group);
    const lm = g.world.landmarks || {};
    const at = (key) => {
      const p = lm[key];
      if (p && typeof p.x === 'number') return new THREE.Vector3(p.x, p.y ?? 0, p.z);
      const [x, y, z] = FALLBACK[key];
      return new THREE.Vector3(x, g.world.getGroundHeight?.(x, z, 1) ?? y, z);
    };
    this.snack = { position: at('snackStand'), radius: 3.6, label: 'Snack Stand', sub: 'yum!', kind: 'misc', id: 'snackStand',
      onInteract: () => this.openSnackStand(), enabled: () => g.player?.state === 'walk' && !this.busy };
    this.souvenir = { position: at('souvenirStand'), radius: 3.6, label: 'Souvenir Shop', sub: 'free goodies', kind: 'misc', id: 'souvenirStand',
      onInteract: () => this.openSouvenirShop(), enabled: () => g.player?.state === 'walk' && !this.busy };
    g.interactables.push(this.snack, this.souvenir);
  }

  // ---------- held item helpers ----------
  get held() { const p = this.game.player; return p?.config?.held || p?.avatar?.config?.held || 'none'; }
  setHeld(item) {
    const p = this.game.player;
    if (!p) return;
    if (!HELD_ITEMS.includes(item)) item = 'none';
    if (typeof p.setHeld === 'function') p.setHeld(item);
    else { p.config.held = item; p.avatar?.setConfig?.({ held: item }); }   // until the player module lands
    this.game.events.emit('shop:equip', { item });
  }
  /** Short label for the HUD's ✦ button: "Eat" / "Squish" / "Wave"… or null when hands are empty. */
  actionLabel() {
    const h = this.held;
    if (h === 'none') return null;
    if (SNACKS[h]) return { verb: 'Eat', emoji: SNACKS[h].emoji, hint: 'E / tap ✦ to eat' };
    const s = SOUVENIRS[h];
    return s ? { verb: s.verb, emoji: s.emoji, hint: `E / tap ✦ to ${s.verb.toLowerCase()}` } : { verb: 'Use', emoji: '✦', hint: 'E / tap ✦' };
  }

  // ---------- shops ----------
  async openSnackStand() {
    const g = this.game;
    if (this.busy) return;
    this.busy = true;
    try {
      const options = Object.entries(SNACKS).map(([value, s]) => ({ label: `${s.emoji} ${s.label}`, sub: s.sub, value }));
      const pick = await g.ui.chooseMenu({ title: 'Snack Stand', speaker: 'yum!', color: '#ff8c42', options, cancel: 'Nothing, thanks' });
      if (!pick) return;
      this.setHeld(pick);
      g.audio?.play?.('click');
      g.ui.toast?.(`${SNACKS[pick].emoji} Yum! Press E / tap ✦ to eat your ${SNACKS[pick].label.toLowerCase()}`, 3600);
    } finally { this.busy = false; }
  }

  async openSouvenirShop() {
    const g = this.game;
    if (this.busy) return;
    this.busy = true;
    try {
      const options = Object.entries(SOUVENIRS).map(([value, s]) => ({ label: `${s.emoji} ${s.label}`, sub: s.sub, value }));
      options.push({ label: '🙌 Put it away', sub: 'empty hands', value: 'none' });
      const pick = await g.ui.chooseMenu({ title: 'Souvenir Shop', speaker: 'free goodies', color: '#9b59b6', options, cancel: 'Just looking' });
      if (pick == null) return;
      this.setHeld(pick);
      g.audio?.play?.('click');
      if (pick === 'none') g.ui.toast?.('Put away. Come back any time!');
      else g.ui.toast?.(`${SOUVENIRS[pick].emoji} ${SOUVENIRS[pick].label}! Press E / tap ✦ to ${SOUVENIRS[pick].verb.toLowerCase()} it · Q / DROP to put it down`, 3600);
    } finally { this.busy = false; }
  }

  // ---------- using the held item ----------
  /** Perform the held item's action (also called by the HUD's ✦ button). Returns true when something happened. */
  use() {
    const g = this.game, p = g.player;
    const item = this.held;
    if (!p || item === 'none' || p.state !== 'walk' || p.frozen || this.eating) return false;
    if (SNACKS[item]) {
      this.eating = true;
      p.avatar?.eat?.();
      g.audio?.play?.('eat');
      g.events.emit('snack:eat', { item });
      p.speedBoost?.(SUGAR_RUSH_S);
      g.ui.toast?.(`${SNACKS[item].emoji} Sugar rush! Zoom for ${SUGAR_RUSH_S} seconds!`, 3000);
      setTimeout(() => { this.eating = false; if (this.held === item) this.setHeld('none'); }, 700);
      return true;
    }
    if (item === 'needoh' || item === 'balloon') this.bop(item);
    else if (item === 'wand') { p.avatar?.squish?.(); g.audio?.play?.('sparkle'); }
    else { p.avatar?.squish?.(); g.audio?.play?.('squish'); }   // plushie hug
    g.events.emit('item:use', { item });
    return true;
  }

  /**
   * Bop: swing the balloon / Needoh and hit-test the nearest NPC or remote player within BOP_RANGE and roughly in
   * front. A hit emits `bop { targetKind, id, item, name }` (audio plays 'bop'; NPCs wobble; the net module relays
   * peer bops). A miss is just the swing + the item's usual sound.
   */
  bop(item) {
    const g = this.game, p = g.player;
    const swing = p.avatar?.bop?.() ?? p.avatar?.squish?.();
    if (swing?.then) { this.bopping = true; swing.then(() => { this.bopping = false; }, () => { this.bopping = false; }); }
    const target = this.bopTarget();
    if (!target) { g.audio?.play?.(item === 'balloon' ? 'boing' : 'squish'); return null; }
    g.events.emit('bop', { targetKind: target.kind, id: target.id, item, name: target.name });
    g.audio?.play?.('bop');
    if (target.kind === 'npc') target.npc.bopped?.(item);
    else g.ui.toast?.(`You bopped ${target.name}! ${item === 'balloon' ? '🎈' : '🟣'}`, 2200);
    return target;
  }
  /** Nearest NPC ({ kind: 'npc', id, name, npc }) or peer ({ kind: 'peer', id, name }) in front of the player, or null. */
  bopTarget() {
    const g = this.game, p = g.player;
    if (!p) return null;
    const facing = typeof p.facing === 'number' ? p.facing : p.group?.rotation?.y || 0;
    _dir.set(Math.sin(facing), 0, Math.cos(facing));
    let best = null, bestD = Infinity;
    const consider = (pos, make) => {
      if (!pos || typeof pos.x !== 'number') return;
      _off.set(pos.x - p.position.x, 0, pos.z - p.position.z);
      const d = _off.length();
      if (d > BOP_RANGE || d >= bestD || Math.abs(pos.y - p.position.y) > 2.5) return;
      if (d > 0.05 && _off.divideScalar(d).dot(_dir) < BOP_FACING_DOT) return;
      bestD = d; best = make();
    };
    for (const n of g.npcs || []) {
      if (!n?.group?.position || !(n.group.children.length || typeof n.bopped === 'function')) continue;   // patrol helpers have no body
      consider(n.group.position, () => ({ kind: 'npc', id: n.id, name: n.name || n.id, npc: n }));
    }
    // net.peers() → [{ id, name, position, group }] once the net module lands; tolerate a Map / array meanwhile
    let peers = g.net?.peers;
    try { peers = typeof peers === 'function' ? peers.call(g.net) : peers instanceof Map ? [...peers.values()] : peers; } catch { peers = null; }
    for (const peer of Array.isArray(peers) ? peers : []) {
      const pos = peer?.position?.x !== undefined ? peer.position : peer?.group?.position;
      consider(pos, () => ({ kind: 'peer', id: peer.id, name: peer.name || 'a friend' }));
    }
    return best;
  }

  // ---------- dropping / picking up ----------
  /** Toss the held item in front of the player (Q / touch DROP). Returns the dropped record, or null. */
  drop() {
    const g = this.game, p = g.player;
    const item = this.held;
    if (!p || item === 'none' || p.state !== 'walk' || p.frozen || this.eating) return null;
    const facing = typeof p.facing === 'number' ? p.facing : p.group?.rotation?.y || 0;
    const fx = Math.sin(facing), fz = Math.cos(facing);
    const mesh = buildDroppedMesh(item);
    const group = new THREE.Group(); group.name = `drop:${item}`;
    group.add(mesh);
    group.position.set(p.position.x + fx * 0.5, p.position.y + 1.1, p.position.z + fz * 0.5);
    const rec = { id: `drop-${++this._dropId}`, item, group, mesh, age: 0, bounces: 0, settled: false, spin: new THREE.Vector3(Math.random() * 4 - 2, Math.random() * 4 - 2, Math.random() * 4 - 2), interactable: null };
    if (item === 'balloon') {
      rec.kind = 'float';
      rec.vel = new THREE.Vector3(fx * 0.6 + (Math.random() - 0.5) * 0.4, 1.4, fz * 0.6 + (Math.random() - 0.5) * 0.4);
      rec.spin.set(0, 0.6, 0);
      g.ui.toast?.('Bye, balloon! 🎈', 2600);
    } else if (SNACKS[item]) {
      rec.kind = 'splat';
      rec.vel = new THREE.Vector3(fx * 1.6, 2.6, fz * 1.6);
      rec.restY = 0.08;
    } else {
      rec.kind = 'bounce';
      rec.vel = new THREE.Vector3(fx * 1.4, 3.2, fz * 1.4);
      const half = mesh.userData?.size?.y > 0 ? mesh.userData.size.y / 2 : null;   // buildHeldItem reports its size
      rec.restY = half ?? (item === 'wand' ? 0.06 : 0.17);
    }
    this.group.add(group);
    this.dropped.push(rec);
    this.setHeld('none');
    g.events.emit('item:drop', { item, id: rec.id, position: group.position.clone() });
    // keep the ground tidy: the oldest pick-up-able item vanishes past MAX_ON_GROUND
    const onGround = this.dropped.filter((d) => d.kind === 'bounce');
    while (onGround.length > MAX_ON_GROUND) this.remove(onGround.shift());
    return rec;
  }
  /** Pick a dropped item back up (its interactable). Whatever is in hand gets dropped first. */
  pickup(rec) {
    const g = this.game, p = g.player;
    if (!rec || !this.dropped.includes(rec) || !p || p.state !== 'walk') return false;
    if (this.held !== 'none') this.drop();
    this.remove(rec);
    this.setHeld(rec.item);
    g.events.emit('item:pickup', { item: rec.item, id: rec.id });
    g.ui.toast?.(`${SOUVENIRS[rec.item]?.emoji || '✦'} Got your ${ITEM_NAMES[rec.item] || rec.item} back!`, 2200);
    return true;
  }
  remove(rec) {
    const i = this.dropped.indexOf(rec);
    if (i >= 0) this.dropped.splice(i, 1);
    if (rec.interactable) { const j = this.game.interactables.indexOf(rec.interactable); if (j >= 0) this.game.interactables.splice(j, 1); rec.interactable = null; }
    this.group.remove(rec.group);
    disposeObject(rec.group);
  }
  settle(rec) {
    rec.settled = true;
    rec.vel.set(0, 0, 0);
    const g = this.game, name = ITEM_NAMES[rec.item] || rec.item;
    rec.interactable = { position: rec.group.position, radius: 2.6, label: `Pick up ${name}`, sub: SOUVENIRS[rec.item]?.emoji || '', kind: 'misc', id: rec.id,
      onInteract: () => this.pickup(rec), enabled: () => g.player?.state === 'walk' && !this.busy };
    g.interactables.push(rec.interactable);
  }
  updateDropped(dt) {
    const g = this.game;
    for (let i = this.dropped.length - 1; i >= 0; i--) {
      const d = this.dropped[i], pos = d.group.position;
      d.age += dt;
      if (d.kind === 'float') {
        d.vel.y += 0.4 * dt; pos.addScaledVector(d.vel, dt);
        d.group.rotation.y += d.spin.y * dt; d.group.rotation.z = Math.sin(d.age * 2) * 0.15;
        if (d.age > BALLOON_LIFE_S - 0.6) d.group.scale.setScalar(Math.max(0.001, (BALLOON_LIFE_S - d.age) / 0.6));
        if (d.age > BALLOON_LIFE_S) this.remove(d);
        continue;
      }
      if (d.settled) {
        if (d.kind === 'splat') { if (d.age > d.splatAt + SPLAT_LIFE_S) this.remove(d); }
        else if (d.age > DROP_LIFE_S) this.remove(d);
        else if (d.item === 'wand') d.group.rotation.y += dt * 0.8;   // a glow wand keeps twinkling on the ground
        continue;
      }
      d.vel.y += G * dt;
      pos.addScaledVector(d.vel, dt);
      d.group.rotation.x += d.spin.x * dt; d.group.rotation.y += d.spin.y * dt; d.group.rotation.z += d.spin.z * dt;
      const ground = (g.world?.getGroundHeight?.(pos.x, pos.z, pos.y + 1) ?? 0) + (d.restY || 0.15);
      if (pos.y <= ground && d.vel.y < 0) {
        pos.y = ground;
        d.bounces++;
        if (d.kind === 'splat') {
          d.group.rotation.set(0, d.group.rotation.y, 0); d.group.scale.set(1.5, 0.25, 1.5);
          d.settled = true; d.splatAt = d.age; d.vel.set(0, 0, 0);
          g.ui.toast?.(`Splat! ${SNACKS[d.item]?.emoji || ''} The 5-second rule does not apply.`, 2600);
          continue;
        }
        d.vel.y = -d.vel.y * 0.45; d.vel.x *= 0.6; d.vel.z *= 0.6; d.spin.multiplyScalar(0.5);
        if (d.bounces >= 3 || d.vel.y < 0.9) { d.group.rotation.set(0, d.group.rotation.y, 0); this.settle(d); }
      }
      if (pos.y < -20) this.remove(d);   // fell out of the world somehow
    }
  }

  update(dt = 1 / 60) {
    const g = this.game, p = g.player;
    if (this.dropped.length) this.updateDropped(dt);
    if (!p || !g.started || p.state !== 'walk' || p.frozen) return;
    if (g.input.justPressed('drop')) { this.drop(); return; }
    if (!p.nearest && g.input.justPressed('interact')) this.use();
  }
}
