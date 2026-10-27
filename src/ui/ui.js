// HUD, prompts, ride HUD, toasts, RPG dialogue, help overlay, splash. Vanilla DOM under #ui-root.
import { saveAvatarConfig } from '../core/avatar.js';
import { showAvatarCreator } from './creator.js';
import { mountTouchControls } from './touch.js';
import { applySettings } from '../core/settings.js';

const GEM_TOTAL = 14;
const KEYS_TOTAL = 5;      // royal keys that open the castle (quests.KEYS_TOTAL)
// Weather picker entries (ids match core/settings WEATHERS and world.setWeather).
const WEATHER_OPTIONS = [
  { value: 'sunny', label: '☀️ Sunny', sub: 'classic park day' },
  { value: 'cloudy', label: '⛅ Cloudy', sub: 'soft and grey' },
  { value: 'rain', label: '🌧️ Rain', sub: 'puddles!' },
  { value: 'storm', label: '⛈️ Storm', sub: 'thunder & lightning' },
  { value: 'sunset', label: '🌅 Sunset', sub: 'golden hour' },
  { value: 'night', label: '🌙 Night', sub: 'park lights on' },
];
const WEATHER_ICON = Object.fromEntries(WEATHER_OPTIONS.map((w) => [w.value, w.label.split(' ')[0]]));
const CONFETTI_COLORS = ['#f9d71c', '#ff6fb5', '#5bb0ff', '#2ecc71', '#ff8c42', '#9b59b6', '#ffffff'];
const ACC_NAMES = { crown: 'Crown', tiara: 'Tiara', wings: 'Fairy Wings', cape: 'Cape', wizardHat: 'Wizard Hat', bunnyEars: 'Bunny Ears', sunglasses: 'Sunglasses', halo: 'Halo', catEars: 'Cat Ears', none: 'Nothing' };

export function isTouchDevice() {
  try {
    if (matchMedia('(pointer: coarse)').matches) return true;
    if (('ontouchstart' in window || navigator.maxTouchPoints > 0) && !matchMedia('(hover: hover)').matches) return true;
  } catch {}
  return false;
}

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Keys shared by every choice list: 1-4 pick directly, Up/Down (or W/S) move the highlight, E/Space/Enter confirm.
const CONFIRM_KEYS = ['KeyE', 'Space', 'Enter', 'NumpadEnter'];
const UP_KEYS = ['ArrowUp', 'KeyW'], DOWN_KEYS = ['ArrowDown', 'KeyS'];

/**
 * A vertical list of chunky choice buttons. `options`: [{ label, sub?, value? }] (2–4 items).
 * onPick(value ?? index) fires once; keyboard is driven from outside via handleKey(e) -> bool (handled).
 */
function buildChoiceList(game, options, onPick, { touch = false } = {}) {
  const opts = options.slice(0, 4);
  const list = el('div', 'hk-choices');
  if (touch) list.classList.add('touch');
  let sel = 0, picked = false;
  const btns = opts.map((o, i) => {
    const b = el('button', 'hk-choice', `<span class="hk-choice-num">${i + 1}</span><span class="hk-choice-body"><span class="hk-choice-label">${esc(o.label)}</span>${o.sub ? `<span class="hk-choice-sub">${esc(o.sub)}</span>` : ''}</span>`);
    b.type = 'button';
    b.addEventListener('pointerenter', () => highlight(i));
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); highlight(i); });
    b.addEventListener('pointerup', (e) => { e.preventDefault(); e.stopPropagation(); pick(i); });
    b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); pick(i); });
    list.appendChild(b);
    return b;
  });
  const highlight = (i) => { sel = (i + btns.length) % btns.length; btns.forEach((b, j) => b.classList.toggle('sel', j === sel)); };
  const pick = (i) => {
    if (picked) return; picked = true;
    highlight(i);
    btns[sel].classList.add('picked');
    game.audio?.play('click');
    const o = opts[sel];
    onPick(o.value !== undefined ? o.value : sel, sel);
  };
  highlight(0);
  // stagger the buttons in (timers, not rAF, so a slow frame can't leave the list invisible)
  btns.forEach((b, i) => setTimeout(() => b.classList.add('in'), 40 + i * 60));
  return {
    el: list,
    handleKey(e) {
      if (picked) return true;
      const n = Number(e.key);
      if (e.code.startsWith('Digit') && n >= 1 && n <= btns.length) { pick(n - 1); return true; }
      if (UP_KEYS.includes(e.code)) { highlight(sel - 1); game.audio?.play('click'); return true; }
      if (DOWN_KEYS.includes(e.code)) { highlight(sel + 1); game.audio?.play('click'); return true; }
      if (CONFIRM_KEYS.includes(e.code)) { pick(sel); return true; }
      return false;
    },
    get picked() { return picked; },
  };
}

export class UI {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('ui-root');
    this.touch = isTouchDevice();
    this.locks = new Set();      // who is freezing the player (dialogue / creator / help)
    this.prevFrozen = false;
    this.menuOpen = false;        // creator or help open
    this.dialogueOpen = false;
    this.gems = 0;
    this.toastEls = [];
    this.touchCtl = null;
    this.buildDOM();
    this.bindEvents();
    this.applySettings(game.settings);
    this.bindKeys();
    if (this.touch) this.enableTouch();
    else window.addEventListener('touchstart', () => this.enableTouch(), { once: true, passive: true });
  }

  // ---------- DOM ----------
  buildDOM() {
    const r = this.root;
    this.hud = el('div', 'hk-hud');
    this.hud.innerHTML = `
      <div class="hk-hud-left">
        <div class="hk-name-card">
          <div class="hk-avatar-dot">👑</div>
          <div><div class="hk-name">Explorer</div><div class="hk-stats"><div class="hk-gems">💎 <b>0</b>/${GEM_TOTAL} gems</div><div class="hk-keys" title="Royal keys — one per day you finish every quest. Five open the castle!">🔑 <b>0</b>/${KEYS_TOTAL}</div></div></div>
        </div>
        <div class="hk-objective" hidden><span class="hk-star">★</span><span class="hk-objective-text"></span></div>
      </div>
      <div class="hk-hud-right">
        <button class="hk-btn hk-avatar-btn" title="Change your look (C)"><span class="hk-ico">🧚</span><span class="hk-txt">Avatar</span></button>
        <button class="hk-btn round hk-weather-btn" title="Pick the weather (K)">☀️</button>
        <button class="hk-btn round hk-mute-btn" title="Sound on/off (M)">🔊</button>
        <button class="hk-btn round hk-help-btn" title="Help (H)">?</button>
      </div>
      <button class="hk-btn yellow hk-item-btn" title="Use what you're holding (E)"><span class="hk-item-ico">✦</span><span class="hk-item-txt">Use</span></button>`;
    r.appendChild(this.hud);
    this.nameEl = this.hud.querySelector('.hk-name');
    this.gemsEl = this.hud.querySelector('.hk-gems');
    this.keysEl = this.hud.querySelector('.hk-keys');
    this.keys = 0;
    this.objectiveEl = this.hud.querySelector('.hk-objective');
    this.objectiveText = this.hud.querySelector('.hk-objective-text');
    this.muteBtn = this.hud.querySelector('.hk-mute-btn');
    this.weatherBtn = this.hud.querySelector('.hk-weather-btn');
    this.itemBtn = this.hud.querySelector('.hk-item-btn');
    this.hud.querySelector('.hk-avatar-btn').addEventListener('click', () => this.openCreator());
    this.weatherBtn.addEventListener('click', () => this.openWeather());
    this.muteBtn.addEventListener('click', () => this.toggleMute());
    this.hud.querySelector('.hk-help-btn').addEventListener('click', () => this.toggleHelp());
    // ✦ item button: the touch-friendly way to eat / squish / wave what you're holding
    this.itemBtn.addEventListener('pointerdown', (e) => e.preventDefault());
    this.itemBtn.addEventListener('click', (e) => { e.preventDefault(); this.game.items?.use?.() || this.game.quests?.items?.use?.(); });

    // ride HUD
    this.rideEl = el('div', 'hk-ride', `<div class="hk-ride-name"></div><div class="hk-ride-text"></div><div class="hk-bar"><i></i></div>`);
    r.appendChild(this.rideEl);
    this.rideName = this.rideEl.querySelector('.hk-ride-name');
    this.rideText = this.rideEl.querySelector('.hk-ride-text');
    this.rideBar = this.rideEl.querySelector('.hk-bar');
    this.rideFill = this.rideBar.firstElementChild;
    this.exitBtn = el('button', 'hk-btn pink hk-exit', `Exit ride <span class="hk-kbd">X</span>`);
    this.exitBtn.addEventListener('click', () => {
      const p = this.game.player; if (!p) return;
      this.game.audio?.play('click');
      if (p.state === 'sit') p.standUp?.(); else p.exitRide(false);
    });
    r.appendChild(this.exitBtn);

    // interaction prompt
    this.promptEl = el('button', 'hk-prompt', `<span class="hk-key">E</span><span><div class="hk-label"></div><div class="hk-sub"></div></span><span class="hk-tap">tap</span>`);
    this.promptEl.addEventListener('click', () => {
      const n = this.game.player?.nearest;
      if (n && !this.game.player.frozen) { this.game.audio?.play('click'); n.onInteract(); }
    });
    r.appendChild(this.promptEl);
    this.promptLabel = this.promptEl.querySelector('.hk-label');
    this.promptSub = this.promptEl.querySelector('.hk-sub');

    this.toastsEl = el('div', 'hk-toasts');
    r.appendChild(this.toastsEl);
    this.bannerEl = el('div', 'hk-banner');
    r.appendChild(this.bannerEl);
  }

  bindEvents() {
    const ev = this.game.events;
    ev.on('game:start', () => { this.refreshName(); this.gems = this.game.quests?.gemsFound || 0; this.renderGems(); this.splash(); });
    ev.on('gem:found', ({ kind } = {}) => {
      // Sunset Gems (day quests) have their own counter in the objective; the HUD counts Royal Gems only.
      if (kind === 'sunset') return;
      this.gems = Math.min(GEM_TOTAL, Math.max(this.gems + 1, this.game.quests?.gemsFound || 0));
      this.renderGems(true);
    });
    ev.on('ride:complete', ({ name }) => this.celebrate(name));
    ev.on('settings:change', (s) => this.applySettings(s));
    ev.on('weather:change', ({ weather } = {}) => this.renderWeather(weather));
    ev.on('day:change', ({ day } = {}) => { this.helpOpen?.querySelector('.hk-tip')?.replaceWith(this.helpTip()); });
    ev.on('unlock', ({ accessory }) => this.toast(`🎁 New accessory unlocked: ${ACC_NAMES[accessory] || accessory} — ${this.touch ? 'tap Avatar' : 'press C'} to try it on!`, 4200));
    // round 3: royal keys counter, the log flume's big splash
    ev.on('keys:change', ({ keys, total } = {}) => this.setKeys(keys, total));
    ev.on('ride:splash', () => this.wetScreen());
  }

  bindKeys() {
    window.addEventListener('keydown', (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.repeat) return;
      if (this.helpOpen && (e.code === 'Escape' || e.code === 'KeyH' || e.key === '?')) { this.toggleHelp(false); return; }
      if (this.menuOpen || this.dialogueOpen || this._chooser || !this.game.started) return;
      if (e.code === 'KeyC') this.openCreator();
      else if (e.code === 'KeyK') this.openWeather();
      else if (e.code === 'KeyM') this.toggleMute();
      else if (e.code === 'KeyH' || e.key === '?') this.toggleHelp(true);
    });
  }

  enableTouch() {
    if (this.touchCtl) return;
    this.touch = true;
    this.root.classList.add('hk-touch-mode');
    this.promptEl.classList.add('touch');
    this.promptEl.querySelector('.hk-key').textContent = '👆';
    this.touchCtl = mountTouchControls(this.game, this.root);
  }

  // ---------- freezing ----------
  lock(key) {
    if (this.locks.size === 0) this.prevFrozen = !!this.game.player?.frozen;
    this.locks.add(key);
    if (this.game.player) this.game.player.frozen = true;
    this.root.classList.add('hk-frozen');
  }
  unlock(key) {
    this.locks.delete(key);
    if (this.locks.size === 0) { if (this.game.player) this.game.player.frozen = this.prevFrozen; this.root.classList.remove('hk-frozen'); }
  }

  // ---------- public API ----------
  showHUD() {
    this.refreshName();
    this.gems = this.game.quests?.gemsFound || 0;
    this.renderGems();
    this.setKeys(this.game.quests?.royalKeys ?? 0, this.game.quests?.keysTotal ?? KEYS_TOTAL);
    this.muteBtn.textContent = this.game.audio?.muted ? '🔇' : '🔊';
    this.renderWeather();
    this.hud.classList.add('show');
  }

  setObjective(text) {
    if (!text) { this.objectiveEl.hidden = true; return; }
    this.objectiveText.textContent = text;
    this.objectiveEl.hidden = false;
    this.objectiveEl.classList.remove('pop'); void this.objectiveEl.offsetWidth; this.objectiveEl.classList.add('pop');
  }

  toast(text, ms = 2600) {
    const t = el('div', 'hk-toast', esc(text));
    this.toastsEl.appendChild(t);
    this.toastEls.push(t);
    requestAnimationFrame(() => t.classList.add('show'));
    while (this.toastEls.length > 3) this.dismissToast(this.toastEls[0]);
    t._timer = setTimeout(() => this.dismissToast(t), ms);
  }
  dismissToast(t) {
    const i = this.toastEls.indexOf(t); if (i < 0) return;
    this.toastEls.splice(i, 1); clearTimeout(t._timer);
    t.classList.add('hide'); t.classList.remove('show');
    setTimeout(() => t.remove(), 320);
  }

  // RPG dialogue box. Resolves when the player advances past the last line — or, when `choices`
  // ([{ label, sub?, value? }], 2–4 items) is given, with the chosen value ?? index once they pick one.
  dialogue(lines, { speaker = '', color = '#0b5d3b', choices = null } = {}) {
    lines = (Array.isArray(lines) ? lines : [String(lines)]).map(String);
    choices = Array.isArray(choices) && choices.length >= 1 ? choices.slice(0, 4) : null;
    if (!lines.length) { if (!choices) return Promise.resolve(); lines = ['…']; }
    // queue if one is already open
    if (this.dialogueOpen) return (this._dialogueQueue = (this._dialogueQueue || Promise.resolve()).then(() => this.dialogue(lines, { speaker, color, choices })));
    this.dialogueOpen = true;
    this.lock('dialogue');
    this.promptEl.classList.remove('show');
    const game = this.game;
    const catcher = el('div', 'hk-catch');
    const box = el('div', 'hk-dialogue', `<div class="hk-speaker"></div><div class="hk-text"></div><span class="hk-hint"></span><span class="hk-more" hidden>▼</span>`);
    if (choices) box.classList.add('has-choices');
    const spk = box.querySelector('.hk-speaker'), txt = box.querySelector('.hk-text'), more = box.querySelector('.hk-more'), hint = box.querySelector('.hk-hint');
    spk.textContent = speaker; spk.style.background = color; if (!speaker) spk.style.display = 'none';
    hint.textContent = this.touch ? 'tap' : 'E / Space';
    this.root.appendChild(catcher); this.root.appendChild(box);
    void box.offsetWidth; box.classList.add('show');   // flush, then animate in (no rAF: a slow frame must not delay the box)

    return new Promise((resolve) => {
      let idx = 0, shown = 0, done = false, raf = 0, last = 0, acc = 0, talkTick = 0, list = null, result;
      const CPS = 45;
      const render = () => {
        txt.innerHTML = esc(lines[idx].slice(0, shown)) + (done ? '' : '<span class="hk-cursor"></span>');
      };
      const tick = (now) => {
        if (done) return;
        const dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
        acc += dt * CPS;
        const n = Math.floor(acc);
        if (n > 0) {
          acc -= n; shown = Math.min(lines[idx].length, shown + n);
          if (++talkTick % 3 === 0) game.audio?.play('talk');
          render();
          if (shown >= lines[idx].length) finishLine();
        }
        raf = requestAnimationFrame(tick);
      };
      const startLine = () => { shown = 0; acc = 0; last = 0; done = false; more.hidden = true; render(); raf = requestAnimationFrame(tick); };
      const lastLine = () => idx >= lines.length - 1;
      const showChoices = () => {
        if (list) return;
        more.hidden = true; hint.textContent = this.touch ? 'tap one' : '1-4 · ↑↓ · E';
        list = buildChoiceList(game, choices, (value) => { result = value; close(); }, { touch: this.touch });
        box.appendChild(list.el);
        box.classList.add('choosing');
      };
      const finishLine = () => {
        done = true; shown = lines[idx].length; cancelAnimationFrame(raf); render();
        if (choices && lastLine()) return showChoices();
        more.hidden = false; more.textContent = lastLine() ? '✓' : '▼';
      };
      const advance = () => {
        if (list) return;                     // choices are up: only a pick closes the box
        game.audio?.play('click');
        if (!done) return finishLine();
        if (!lastLine()) { idx++; startLine(); } else close();
      };
      const onKey = (e) => {
        if (e.repeat) return;
        if (list) { if (list.handleKey(e)) e.preventDefault(); return; }
        if (CONFIRM_KEYS.includes(e.code)) { e.preventDefault(); advance(); }
      };
      const onPointer = (e) => { if (e.target.closest?.('.hk-choice')) return; e.preventDefault(); advance(); };
      const close = () => {
        window.removeEventListener('keydown', onKey, true);
        cancelAnimationFrame(raf);
        box.classList.remove('show'); catcher.remove();
        setTimeout(() => box.remove(), 300);
        // unfreeze a frame later so the key that closed us isn't also read by Input as a fresh interact
        requestAnimationFrame(() => requestAnimationFrame(() => { this.dialogueOpen = false; this.unlock('dialogue'); resolve(result); }));
      };
      // capture phase so we see the key even though Input also listens on window
      window.addEventListener('keydown', onKey, true);
      box.addEventListener('pointerdown', onPointer);
      catcher.addEventListener('pointerdown', onPointer);
      startLine();
    });
  }

  /**
   * Centered modal chooser: big title, 2–4 chunky option buttons, optional cancel.
   * Resolves with the picked option's value ?? index, or null when cancelled (cancel button, Escape, X,
   * or closeChoose()). Freezes the player while open.
   */
  choose({ title = 'Pick one', speaker = '', color = '#0b5d3b', options = [], cancel = null } = {}) {
    options = (options || []).slice(0, 4);
    if (!options.length) return Promise.resolve(null);
    if (this._chooser) this.closeChoose();
    this.lock('choose');
    this.promptEl.classList.remove('show');
    const game = this.game;
    const overlay = el('div', 'hk-overlay hk-choose-overlay');
    const card = el('div', 'hk-choose', `${speaker ? `<div class="hk-speaker"></div>` : ''}<h2 class="hk-choose-title"></h2>`);
    card.querySelector('.hk-choose-title').textContent = title;
    if (speaker) { const spk = card.querySelector('.hk-speaker'); spk.textContent = speaker; spk.style.background = color; }
    overlay.appendChild(card);
    this.root.appendChild(overlay);
    void overlay.offsetWidth; overlay.classList.add('show');
    return new Promise((resolve) => {
      let closed = false;
      const close = (value) => {
        if (closed) return; closed = true;
        this._chooser = null;
        window.removeEventListener('keydown', onKey, true);
        overlay.classList.remove('show');
        setTimeout(() => overlay.remove(), 260);
        requestAnimationFrame(() => requestAnimationFrame(() => { this.unlock('choose'); resolve(value); }));
      };
      const list = buildChoiceList(game, options, (value) => setTimeout(() => close(value), 140), { touch: this.touch });
      card.appendChild(list.el);
      if (cancel) {
        const c = el('button', 'hk-btn hk-choose-cancel', esc(cancel));
        c.type = 'button';
        c.addEventListener('click', (e) => { e.stopPropagation(); game.audio?.play('click'); close(null); });
        card.appendChild(c);
      }
      const hintEl = el('div', 'hk-choose-hint', this.touch ? 'tap to pick' : '1-4 or ↑↓ then E');
      card.appendChild(hintEl);
      const onKey = (e) => {
        if (e.repeat) return;
        if (list.handleKey(e)) { e.preventDefault(); return; }
        if (e.code === 'Escape' || e.code === 'KeyX') { e.preventDefault(); close(null); }
      };
      window.addEventListener('keydown', onKey, true);
      overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) e.preventDefault(); });
      this._chooser = { close };
    });
  }
  /** Dismiss an open choose() modal (resolves it with null). Safe to call when none is open. */
  closeChoose() { this._chooser?.close(null); }
  get chooseOpen() { return !!this._chooser; }

  /**
   * choose() with paging: any number of options, at most 4 buttons per page. Longer lists show 3 options plus
   * a 'More…' button that advances to the next page (wrapping around). Resolves like choose().
   */
  async chooseMenu({ options = [], perPage = 4, more = 'More…', ...rest } = {}) {
    if (options.length <= perPage) return this.choose({ options, ...rest });
    const size = perPage - 1, pages = Math.ceil(options.length / size);
    let page = 0;
    for (let guard = 0; guard < 40; guard++) {
      const slice = options.slice(page * size, page * size + size);
      const picked = await this.choose({ ...rest, options: [...slice, { label: more, sub: `page ${page + 1}/${pages}`, value: '__more__' }] });
      if (picked !== '__more__') return picked;
      page = (page + 1) % pages;
    }
    return null;
  }

  /** Fade the whole screen to black ('out', default) or back from black ('in') over `ms`. Resolves when done. */
  fade(ms = 800, dir = 'out') {
    if (!this.fadeEl) { this.fadeEl = el('div', 'hk-fade'); this.root.appendChild(this.fadeEl); }
    const f = this.fadeEl;
    f.style.transitionDuration = `${ms}ms`;
    void f.offsetWidth;
    f.classList.toggle('show', dir !== 'in');
    return new Promise((resolve) => setTimeout(() => { if (dir === 'in' && !f.classList.contains('show')) { f.remove(); this.fadeEl = null; } resolve(); }, ms + 30));
  }

  /** Big centered title card ("Day 2") with an optional subtitle, shown for `ms` then removed. Resolves after. */
  titleCard(text, sub = '', ms = 2200) {
    const card = el('div', 'hk-title-card', `<h1></h1>${sub ? '<p></p>' : ''}`);
    card.querySelector('h1').textContent = text;
    if (sub) card.querySelector('p').textContent = sub;
    this.root.appendChild(card);
    void card.offsetWidth;
    card.classList.add('show');
    return new Promise((resolve) => setTimeout(() => { card.classList.remove('show'); setTimeout(() => { card.remove(); resolve(); }, 350); }, ms));
  }

  // ---------- weather ----------
  renderWeather(weather) {
    const w = weather || this.game.world?.weather || this.game.settings?.weather || 'sunny';
    this.weatherBtn.textContent = WEATHER_ICON[w] || '☀️';
  }
  /** Weather picker (☀️ button / K): two pages of three, applied to settings and the world. */
  async openWeather() {
    if (this.menuOpen || this.dialogueOpen || this._chooser || !this.game.started) return;
    this.game.audio?.play('click');
    const current = this.game.world?.weather || this.game.settings?.weather || 'sunny';
    const options = WEATHER_OPTIONS.map((w) => ({ ...w, sub: w.value === current ? 'right now' : w.sub }));
    const weather = await this.chooseMenu({ title: 'Pick the weather', options, cancel: 'Leave it' });
    if (!weather) return;
    this.setWeather(weather);
  }
  setWeather(weather) {
    const g = this.game;
    applySettings(g, { weather });
    if (typeof g.world?.setWeather === 'function') g.world.setWeather(weather);
    else g.events.emit('weather:change', { weather });   // the world emits this itself once it has setWeather
    this.renderWeather(weather);
    const w = WEATHER_OPTIONS.find((o) => o.value === weather);
    this.toast(`${w?.label || weather} — ${w?.sub || ''}`.trim());
  }
  /** The house closet calls this (CONTRACT: ui.openDressingRoom). Same thing as the Avatar button / C. */
  openDressingRoom() { return this.openCreator(); }

  /** HUD: 🔑 n/total next to the gem counter (quests emits keys:change; bumps when the count goes up). */
  setKeys(n = 0, total = KEYS_TOTAL) {
    n = Math.max(0, Math.floor(Number(n) || 0)); total = Math.max(1, Math.floor(Number(total) || KEYS_TOTAL));
    const bump = n > this.keys;
    this.keys = n;
    this.keysEl.innerHTML = `🔑 <b>${Math.min(n, total)}</b>/${total}`;
    this.keysEl.classList.toggle('full', n >= total);
    if (bump) { this.keysEl.classList.remove('bump'); void this.keysEl.offsetWidth; this.keysEl.classList.add('bump'); }
  }

  /** Log flume splash: water droplets run down the screen for ~1.5 s (CSS only; safe to call repeatedly). */
  wetScreen(ms = 1500) {
    const wet = el('div', 'hk-wet');
    const n = this.touch ? 22 : 34;
    for (let i = 0; i < n; i++) {
      const d = el('i');
      const size = 10 + Math.random() * 26;
      d.style.left = `${Math.random() * 100}%`;
      d.style.top = `${-10 + Math.random() * 55}%`;
      d.style.width = `${size}px`; d.style.height = `${size * (1.3 + Math.random() * 0.8)}px`;
      d.style.animationDuration = `${0.9 + Math.random() * 0.9}s`;
      d.style.animationDelay = `${Math.random() * 0.35}s`;
      d.style.opacity = `${0.45 + Math.random() * 0.4}`;
      wet.appendChild(d);
    }
    this.root.appendChild(wet);
    void wet.offsetWidth; wet.classList.add('show');
    setTimeout(() => wet.classList.remove('show'), ms);
    setTimeout(() => wet.remove(), ms + 500);
    return wet;
  }

  /**
   * Splash Cove changing room: fade out behind a curtain swish, open the Dressing Room with the swimsuit on, fade
   * back. The swimsuit override stays on while the player is inside the water park; an outfit picked in here is
   * remembered as the one to change back into on the way out, and colours apply to the swimsuit right away.
   */
  async openChangingRoom() {
    const g = this.game, p = g.player;
    if (this.menuOpen || this.dialogueOpen || this._chooser || !p || p.state !== 'walk') return null;
    g.audio?.play('curtain');
    this.menuOpen = true; this.lock('changing');
    let cfg = null;
    try {
      await this.fade(420);
      if (p.setOutfitOverride && p.outfitOverride !== 'swimsuit') p.setOutfitOverride('swimsuit');
      const opening = showAvatarCreator(g, { ...p.config, outfit: 'swimsuit' }, { inGame: true });
      this.fade(350, 'in');
      cfg = await opening;
      await this.fade(350);
      if (cfg) this.applyCreatorResult(cfg);
      g.audio?.play('curtain');
      await this.fade(450, 'in');
      if (cfg) this.toast('Fresh from the changing room! 🩱', 2600);
    } finally {
      this.menuOpen = false; this.unlock('changing');
    }
    return cfg;
  }

  /**
   * Apply what the Dressing Room returned. With the swimsuit override on (Splash Cove), the swimsuit stays on and
   * the chosen outfit is stored as the one to change back into (player._savedOutfit); the saved config never
   * records 'swimsuit' as the real outfit.
   */
  applyCreatorResult(cfg) {
    const p = this.game.player;
    if (!p || !cfg) return;
    if (p.outfitOverride === 'swimsuit') {
      if (cfg.outfit && cfg.outfit !== 'swimsuit') p._savedOutfit = cfg.outfit;
      const real = p._savedOutfit || (cfg.outfit !== 'swimsuit' ? cfg.outfit : null) || 'casual';
      p.avatar.setConfig({ ...cfg, outfit: 'swimsuit' });
      saveAvatarConfig({ ...p.config, outfit: real });
    } else {
      p.avatar.setConfig(cfg);
      saveAvatarConfig(p.config);
    }
    this.refreshName();
  }

  // ---------- per-frame ----------
  update(dt, t) {
    if (this.splashEl) {
      if (this.splashT0 == null) { this.splashT0 = t; this.splashWall = performance.now(); }
      const age = Math.max(t - this.splashT0, (performance.now() - this.splashWall) / 1000 - 2.5);
      if (age > 2) this.splashEl.classList.remove('show');
      if (age > 2.6) { this.splashEl.remove(); this.splashEl = null; this.wordmarkEl = null; }
    }
    const p = this.game.player;
    if (!p) return;
    // prompt chip
    const n = p.state === 'walk' && !p.frozen ? p.nearest : null;
    if (n) {
      if (this.promptFor !== n) {
        this.promptFor = n;
        this.promptLabel.textContent = n.label || 'Interact';
        this.promptSub.textContent = n.sub || '';
      }
      this.promptEl.classList.add('show');
    } else { this.promptFor = null; this.promptEl.classList.remove('show'); }

    // ride HUD
    const riding = p.state === 'riding' && p.ride;
    if (riding) {
      const ride = p.ride;
      if (this.rideFor !== ride) { this.rideFor = ride; this.rideName.textContent = ride.name; }
      if (ride.kind === 'drive') {
        this.rideBar.hidden = true;
        this.rideText.textContent = ride.hudText || `${ride.rideTime.toFixed(0)}s`;
      } else {
        this.rideBar.hidden = false;
        const dur = ride.duration || 30, left = Math.max(0, dur - ride.rideTime);
        this.rideFill.style.width = `${Math.min(100, (ride.rideTime / dur) * 100).toFixed(1)}%`;
        this.rideText.textContent = ride.hudText || `${Math.ceil(left)}s left · hands up! 🙌`;
      }
      this.rideEl.classList.add('show'); this.exitBtn.classList.add('show'); this.hud.classList.add('riding');
    } else if (p.state === 'sit' || p.state === 'slide' || p.sitHint) {
      // seated on a bench / swing, or whooshing down a slide: reuse the ride bar as a hint strip
      const sitting = p.state === 'sit' || !!p.sitHint;
      if (this.rideFor !== p.state) {
        this.rideFor = p.state;
        this.rideName.textContent = sitting ? 'Taking a break 🪑' : 'Wheee! 🦩';
        this.rideText.textContent = sitting ? (this.touch ? 'tap ✕ or move to stand up' : 'X / EXIT to stand up') : 'Wheee!';
        this.rideBar.hidden = true;
      }
      this.rideEl.classList.add('show'); this.hud.classList.add('riding');
      this.exitBtn.classList.toggle('show', sitting);
    } else { this.rideFor = null; this.rideEl.classList.remove('show'); this.exitBtn.classList.remove('show'); this.hud.classList.remove('riding'); }
    this.touchCtl?.setRiding(!!riding, riding ? p.ride.kind : null);

    // ✦ item button: visible while holding something, walking, and not next to an interactable
    const items = this.game.items || this.game.quests?.items;
    const uiBusy = this.dialogueOpen || this.menuOpen || this._chooser || this.locks.size > 0;
    const act = p.state === 'walk' && !p.frozen && !uiBusy && !n && items?.actionLabel ? items.actionLabel() : null;
    if (act) {
      if (this.itemFor !== act.verb + act.emoji) {
        this.itemFor = act.verb + act.emoji;
        this.itemBtn.querySelector('.hk-item-ico').textContent = act.emoji;
        this.itemBtn.querySelector('.hk-item-txt').textContent = `${act.verb}${this.touch ? '' : ' (E)'}`;
      }
      this.itemBtn.classList.add('show');
    } else { this.itemFor = null; this.itemBtn.classList.remove('show'); }

    // keep gem counter honest even if quests updates after the event
    if ((this.game.quests?.gemsFound || 0) > this.gems) { this.gems = this.game.quests.gemsFound; this.renderGems(true); }
  }

  // ---------- helpers ----------
  /** Park name / princess names come from game.settings; re-render every place that shows them. */
  applySettings(s) {
    const name = s?.parkName || 'Princess Park';
    document.title = name;
    this.wordmarkEl && (this.wordmarkEl.innerHTML = this.wordmarkHTML());
    this.helpOpen?.querySelector('.hk-tip')?.replaceWith(this.helpTip());
  }
  wordmarkHTML() {
    // last word gets the accent colour, like a classic two-tone logo
    const words = (this.game.settings?.parkName || 'Princess Park').trim().split(/\s+/);
    const last = words.length > 1 ? words.pop() : '';
    return `${esc(words.join(' '))}${last ? ` <span>${esc(last)}</span>` : ''}`;
  }
  helpTip() {
    const [p1, p2] = this.game.settings?.princesses || [];
    const total = this.game.world?.gemSpots?.length || GEM_TOTAL;
    const day = this.game.quests?.day || 1;
    const keys = this.game.quests?.royalKeys ?? 0;
    if (day > 1) return el('p', 'hk-tip', `Day ${day}! Finish today's quests (see the ★ objective) to earn a Royal Key 🔑 (${keys}/${KEYS_TOTAL} — five open the castle), then sleep in your bed at the house by the entrance to start Day ${day + 1}.`);
    return el('p', 'hk-tip', `Find all ${total} Royal Gems, ride every ride, and chat with Princess ${esc(p1?.name || '1')} and Princess ${esc(p2?.name || '2')} to unlock new accessories! Finish every quest to earn a Royal Key 🔑, then sleep in your bed to start Day 2. Five keys open the castle.`);
  }
  refreshName() { this.nameEl.textContent = this.game.player?.config?.name || 'Explorer'; }
  renderGems(bump = false) {
    const total = this.game.world?.gemSpots?.length || GEM_TOTAL;
    this.gemsEl.innerHTML = `💎 <b>${this.gems}</b>/${total} gems`;
    if (bump) { this.gemsEl.classList.remove('bump'); void this.gemsEl.offsetWidth; this.gemsEl.classList.add('bump'); }
  }
  toggleMute() {
    const a = this.game.audio; if (!a) return;
    a.muted = !a.muted;
    this.muteBtn.textContent = a.muted ? '🔇' : '🔊';
    if (!a.muted) a.play('click');
  }

  splash() {
    const s = el('div', 'hk-splash', `<div class="hk-wordmark"><h1>${this.wordmarkHTML()}</h1><p>Welcome, ${esc(this.game.player?.config?.name || 'Explorer')}! ✨</p></div>`);
    this.wordmarkEl = s.querySelector('h1');
    this.root.appendChild(s);
    void s.offsetWidth; // force a style flush so the fade-in starts now, not after the (slow) first 3D frame
    s.classList.add('show');
    // timed on game.time in update() (dt is capped per frame) so a slow first frame can't skip the splash
    this.splashEl = s; this.splashT0 = null;
  }

  celebrate(name) {
    this.bannerEl.textContent = 'Ride complete! ✨';
    this.bannerEl.classList.add('show');
    setTimeout(() => this.bannerEl.classList.remove('show'), 2500);
    const c = el('div', 'hk-confetti');
    for (let i = 0; i < 30; i++) {
      const p = el('i');
      p.style.left = `${Math.random() * 100}%`;
      p.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      p.style.animationDuration = `${1.6 + Math.random() * 1.2}s`;
      p.style.animationDelay = `${Math.random() * 0.5}s`;
      p.style.transform = `rotate(${Math.random() * 360}deg)`;
      if (i % 3 === 0) p.style.borderRadius = '50%';
      c.appendChild(p);
    }
    this.root.appendChild(c);
    setTimeout(() => c.remove(), 3400);
  }

  toggleHelp(force) {
    const open = force ?? !this.helpOpen;
    if (open === !!this.helpOpen) return;
    this.game.audio?.play('click');
    if (open) {
      this.helpOpen = el('div', 'hk-overlay');
      const kb = `
        <li><span class="hk-keys"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span> or arrows — move</li>
        <li><span class="hk-keys"><kbd>Space</kbd></span> jump</li>
        <li><span class="hk-keys"><kbd>Shift</kbd></span> hold to run</li>
        <li><span class="hk-keys"><kbd>E</kbd></span> talk / ride</li>
        <li><span class="hk-keys"><kbd>X</kbd></span> exit a ride</li>
        <li><span class="hk-keys"><kbd>🖱 drag</kbd></span> look around · <kbd>scroll</kbd> zoom</li>
        <li><span class="hk-keys"><kbd>E</kbd></span> eat / squish / bop with what you're holding</li>
        <li><span class="hk-keys"><kbd>Q</kbd></span> drop what you're holding</li>
        <li><span class="hk-keys"><kbd>C</kbd> <kbd>K</kbd></span> dressing room · weather</li>
        <li><span class="hk-keys"><kbd>M</kbd> <kbd>H</kbd></span> mute · this help</li>`;
      const tc = `
        <li><span class="hk-keys"><kbd>🕹 left stick</kbd></span> move</li>
        <li><span class="hk-keys"><kbd>⤒ big button</kbd></span> jump</li>
        <li><span class="hk-keys"><kbd>⚡</kbd></span> hold to run</li>
        <li><span class="hk-keys"><kbd>tap the bubble</kbd></span> talk / ride</li>
        <li><span class="hk-keys"><kbd>✕</kbd></span> exit a ride / stand up</li>
        <li><span class="hk-keys"><kbd>✦</kbd></span> eat / squish / bop with what you're holding</li>
        <li><span class="hk-keys"><kbd>🫳 DROP</kbd></span> drop what you're holding</li>
        <li><span class="hk-keys"><kbd>☀️</kbd></span> pick the weather</li>
        <li><span class="hk-keys"><kbd>drag right side</kbd></span> look around</li>`;
      this.helpOpen.innerHTML = `<div class="hk-help"><button class="hk-btn round hk-close">✕</button><h2>How to play</h2><ul>${this.touch ? tc : kb}</ul></div>`;
      this.helpOpen.firstElementChild.appendChild(this.helpTip());
      this.helpOpen.addEventListener('click', (e) => { if (e.target === this.helpOpen || e.target.closest('.hk-close')) this.toggleHelp(false); });
      this.root.appendChild(this.helpOpen);
      this.menuOpen = true; this.lock('help');
    } else {
      this.helpOpen.remove(); this.helpOpen = null;
      this.menuOpen = false; this.unlock('help');
    }
  }

  async openCreator() {
    if (this.menuOpen || this.dialogueOpen || this._chooser || !this.game.player || this.game.player.state !== 'walk') return;
    this.game.audio?.play('click');
    this.menuOpen = true; this.lock('creator');
    try {
      const cfg = await showAvatarCreator(this.game, { ...this.game.player.config }, { inGame: true });
      if (cfg) this.applyCreatorResult(cfg);
    } finally {
      this.menuOpen = false; this.unlock('creator');
    }
  }
}
