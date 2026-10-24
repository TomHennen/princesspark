// HUD, prompts, ride HUD, toasts, RPG dialogue, help overlay, splash. Vanilla DOM under #ui-root.
import { saveAvatarConfig } from '../core/avatar.js';
import { showAvatarCreator } from './creator.js';
import { mountTouchControls } from './touch.js';

const GEM_TOTAL = 14;
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
  // stagger the buttons in
  requestAnimationFrame(() => btns.forEach((b, i) => setTimeout(() => b.classList.add('in'), 40 + i * 60)));
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
          <div><div class="hk-name">Explorer</div><div class="hk-gems">💎 <b>0</b>/${GEM_TOTAL} gems</div></div>
        </div>
        <div class="hk-objective" hidden><span class="hk-star">★</span><span class="hk-objective-text"></span></div>
      </div>
      <div class="hk-hud-right">
        <button class="hk-btn hk-avatar-btn" title="Change your look (C)"><span class="hk-ico">🧚</span><span class="hk-txt">Avatar</span></button>
        <button class="hk-btn round hk-mute-btn" title="Sound on/off (M)">🔊</button>
        <button class="hk-btn round hk-help-btn" title="Help (H)">?</button>
      </div>`;
    r.appendChild(this.hud);
    this.nameEl = this.hud.querySelector('.hk-name');
    this.gemsEl = this.hud.querySelector('.hk-gems');
    this.objectiveEl = this.hud.querySelector('.hk-objective');
    this.objectiveText = this.hud.querySelector('.hk-objective-text');
    this.muteBtn = this.hud.querySelector('.hk-mute-btn');
    this.hud.querySelector('.hk-avatar-btn').addEventListener('click', () => this.openCreator());
    this.muteBtn.addEventListener('click', () => this.toggleMute());
    this.hud.querySelector('.hk-help-btn').addEventListener('click', () => this.toggleHelp());

    // ride HUD
    this.rideEl = el('div', 'hk-ride', `<div class="hk-ride-name"></div><div class="hk-ride-text"></div><div class="hk-bar"><i></i></div>`);
    r.appendChild(this.rideEl);
    this.rideName = this.rideEl.querySelector('.hk-ride-name');
    this.rideText = this.rideEl.querySelector('.hk-ride-text');
    this.rideBar = this.rideEl.querySelector('.hk-bar');
    this.rideFill = this.rideBar.firstElementChild;
    this.exitBtn = el('button', 'hk-btn pink hk-exit', `Exit ride <span class="hk-kbd">X</span>`);
    this.exitBtn.addEventListener('click', () => { this.game.audio?.play('click'); this.game.player?.exitRide(false); });
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
    ev.on('gem:found', () => {
      this.gems = Math.max(this.gems + 1, this.game.quests?.gemsFound || 0);
      this.renderGems(true);
    });
    ev.on('ride:complete', ({ name }) => this.celebrate(name));
    ev.on('settings:change', (s) => this.applySettings(s));
    ev.on('unlock', ({ accessory }) => this.toast(`🎁 New accessory unlocked: ${ACC_NAMES[accessory] || accessory} — ${this.touch ? 'tap Avatar' : 'press C'} to try it on!`, 4200));
  }

  bindKeys() {
    window.addEventListener('keydown', (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.repeat) return;
      if (this.helpOpen && (e.code === 'Escape' || e.code === 'KeyH' || e.key === '?')) { this.toggleHelp(false); return; }
      if (this.menuOpen || this.dialogueOpen || this._chooser || !this.game.started) return;
      if (e.code === 'KeyC') this.openCreator();
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
    this.muteBtn.textContent = this.game.audio?.muted ? '🔇' : '🔊';
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
    requestAnimationFrame(() => box.classList.add('show'));

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
    requestAnimationFrame(() => overlay.classList.add('show'));
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
    } else { this.rideFor = null; this.rideEl.classList.remove('show'); this.exitBtn.classList.remove('show'); this.hud.classList.remove('riding'); }
    this.touchCtl?.setRiding(!!riding, riding ? p.ride.kind : null);

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
    return el('p', 'hk-tip', `Find all ${total} Royal Gems, ride every ride, and chat with Princess ${esc(p1?.name || '1')} and Princess ${esc(p2?.name || '2')} to unlock new accessories!`);
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
        <li><span class="hk-keys"><kbd>C</kbd></span> dressing room</li>
        <li><span class="hk-keys"><kbd>M</kbd> <kbd>H</kbd></span> mute · this help</li>`;
      const tc = `
        <li><span class="hk-keys"><kbd>🕹 left stick</kbd></span> move</li>
        <li><span class="hk-keys"><kbd>⤒ big button</kbd></span> jump</li>
        <li><span class="hk-keys"><kbd>⚡</kbd></span> hold to run</li>
        <li><span class="hk-keys"><kbd>tap the bubble</kbd></span> talk / ride</li>
        <li><span class="hk-keys"><kbd>✕</kbd></span> exit a ride</li>
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
      if (cfg) { this.game.player.avatar.setConfig(cfg); saveAvatarConfig(this.game.player.config); this.refreshName(); }
    } finally {
      this.menuOpen = false; this.unlock('creator');
    }
  }
}
