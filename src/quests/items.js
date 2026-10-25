// Shops + hand-held items. Registers the Snack Stand and Souvenir Shop interactables (kind 'misc') at
// world.landmarks.snackStand / souvenirStand (fallback: in front of the counters by the entrance), opens
// ui.choose menus, and turns the interact key into the held item's action (eat / squish / wave) whenever the
// player is NOT near an interactable (main.js gives interactables priority). Everything is free.
import * as THREE from 'three';
import { HELD_ITEMS } from '../core/avatar.js';

export const SNACKS = {
  iceCream:    { label: 'Ice cream',     sub: 'strawberry swirl',  emoji: '🍦' },
  cottonCandy: { label: 'Cotton candy',  sub: 'pink cloud',        emoji: '🍭' },
  pretzel:     { label: 'Pretzel',       sub: 'warm & salty',      emoji: '🥨' },
  lemonade:    { label: 'Lemonade',      sub: 'extra sour',        emoji: '🍋' },
};
export const SOUVENIRS = {
  needoh:  { label: 'Needoh',           sub: 'squishy ball — press E to squish', emoji: '🟣', verb: 'Squish' },
  balloon: { label: 'Balloon',          sub: 'floaty & shiny',                  emoji: '🎈', verb: 'Bop' },
  wand:    { label: 'Glow wand',        sub: 'sparkles!',                       emoji: '✨', verb: 'Wave' },
  plushie: { label: 'Flamingo plushie', sub: 'very huggable',                   emoji: '🦩', verb: 'Hug' },
};
export const ITEM_NAMES = Object.fromEntries([...Object.entries(SNACKS), ...Object.entries(SOUVENIRS)].map(([k, v]) => [k, v.label]));
export const isSnack = (item) => !!SNACKS[item];
const FALLBACK = { snackStand: [40, 0, 64.5], souvenirStand: [-40, 0, 64.5] };
const SUGAR_RUSH_S = 15;

export class Items {
  constructor(game) {
    this.game = game;
    this.registered = false;
    this.busy = false;          // a shop menu is open
    this.eating = false;        // bite animation in progress
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
      else g.ui.toast?.(`${SOUVENIRS[pick].emoji} ${SOUVENIRS[pick].label}! Press E / tap ✦ to ${SOUVENIRS[pick].verb.toLowerCase()} it`, 3600);
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
    if (item === 'needoh') { p.avatar?.squish?.(); g.audio?.play?.('squish'); }
    else if (item === 'wand') { p.avatar?.squish?.(); g.audio?.play?.('sparkle'); }
    else if (item === 'balloon') { p.avatar?.squish?.(); g.audio?.play?.('boing'); }
    else { p.avatar?.squish?.(); g.audio?.play?.('squish'); }   // plushie hug
    g.events.emit('item:use', { item });
    return true;
  }

  update() {
    const g = this.game, p = g.player;
    if (!p || !g.started || p.state !== 'walk' || p.frozen || p.nearest) return;
    if (g.input.justPressed('interact')) this.use();
  }
}
