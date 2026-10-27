// Virtual joystick + action buttons for touch devices. Feeds game.input's virtual axis / buttons.
// Layout: joystick bottom-left; bottom-right cluster = JUMP, RUN, ✦ (interact: talk / ride / sit — shown when
// something is in reach), EXIT (rides and seats), a camera-mode toggle and DROP (shown while holding an item).
// Visibility follows game.player.state every frame (refresh()), so ui.js only needs to mount us.
const RADIUS = 60, DEADZONE = 0.12;

export function mountTouchControls(game, root) {
  const wrap = document.createElement('div');
  wrap.className = 'hk-touch';
  wrap.innerHTML = `
    <div class="hk-stick"><div class="hk-knob">✥</div></div>
    <div class="hk-tbtns">
      <button class="hk-tbtn-run" aria-label="Run">⚡<span>RUN</span></button>
      <button class="hk-tbtn-jump" aria-label="Jump">⤒<span>JUMP</span></button>
      <button class="hk-tbtn-act" aria-label="Interact" hidden>★<span>GO</span></button>
      <button class="hk-tbtn-cam" aria-label="Camera mode">📷<span>CAM</span></button>
      <button class="hk-tbtn-exit" aria-label="Exit" hidden>✕<span>EXIT</span></button>
      <button class="hk-tbtn-drop" aria-label="Drop item" hidden>🫳<span>DROP</span></button>
    </div>`;
  root.appendChild(wrap);
  const $ = (c) => wrap.querySelector(c);
  const stick = $('.hk-stick'), knob = $('.hk-knob');
  const jumpBtn = $('.hk-tbtn-jump'), runBtn = $('.hk-tbtn-run'), exitBtn = $('.hk-tbtn-exit'), actBtn = $('.hk-tbtn-act'), camBtn = $('.hk-tbtn-cam'), dropBtn = $('.hk-tbtn-drop');
  const actLabel = actBtn.querySelector('span');
  const capture = (el, id) => { try { el.setPointerCapture(id); } catch {} };   // synthetic/odd pointer ids may throw

  // ---- joystick ----
  let stickId = null, cx = 0, cy = 0;
  const setAxis = (dx, dy) => {
    const len = Math.hypot(dx, dy);
    const clamped = Math.min(len, RADIUS);
    const nx = len > 0 ? dx / len : 0, ny = len > 0 ? dy / len : 0;
    knob.style.transform = `translate(${nx * clamped}px, ${ny * clamped}px)`;
    let mag = clamped / RADIUS;
    mag = mag < DEADZONE ? 0 : (mag - DEADZONE) / (1 - DEADZONE);
    game.input.setVirtualAxis(nx * mag, -ny * mag); // screen down = backward
  };
  stick.addEventListener('pointerdown', (e) => {
    if (stickId !== null) return;
    e.preventDefault();
    stickId = e.pointerId; capture(stick, stickId);
    const r = stick.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
    stick.classList.add('active');
    setAxis(e.clientX - cx, e.clientY - cy);
  });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) setAxis(e.clientX - cx, e.clientY - cy); });
  const stickEnd = (e) => {
    if (e.pointerId !== stickId) return;
    stickId = null; stick.classList.remove('active');
    knob.style.transform = ''; game.input.setVirtualAxis(0, 0);
  };
  stick.addEventListener('pointerup', stickEnd); stick.addEventListener('pointercancel', stickEnd); stick.addEventListener('lostpointercapture', stickEnd);

  // ---- hold buttons (held virtual actions) ----
  const hold = (btn, action, onDown) => {
    let id = null;
    btn.addEventListener('pointerdown', (e) => {
      if (id !== null) return;
      e.preventDefault(); id = e.pointerId; capture(btn, id); btn.classList.add('down');
      game.input.pressVirtual(action); onDown?.();
    });
    const up = (e) => { if (e.pointerId !== id) return; id = null; btn.classList.remove('down'); game.input.releaseVirtual(action); };
    btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', up); btn.addEventListener('lostpointercapture', up);
  };
  hold(jumpBtn, 'jump');
  hold(runBtn, 'boost', () => game.audio?.play('click'));
  // ✦ interact: main.js reads input.justPressed('interact') and fires player.nearest.onInteract()
  hold(actBtn, 'interact', () => game.audio?.play('click'));

  // ---- tap buttons (pointerup, not click: the touchstart preventDefault below suppresses synthesized clicks) ----
  const tap = (btn, fn) => {
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); btn.classList.add('down'); });
    const up = (e, fire) => { btn.classList.remove('down'); if (fire) fn(e); };
    btn.addEventListener('pointerup', (e) => up(e, true));
    btn.addEventListener('pointercancel', (e) => up(e, false));
  };
  tap(exitBtn, () => {
    const p = game.player; if (!p) return;
    game.audio?.play('click');
    if (p.state === 'sit') p.standUp?.(); else if (p.state === 'riding') p.exitRide(false);
  });
  tap(camBtn, () => { const p = game.player; if (p && !p.frozen) p.toggleCameraMode?.(); });
  // DROP: a one-shot 'drop' action (quests/items.js reads input.justPressed('drop') in its update)
  tap(dropBtn, () => { const p = game.player; if (p && !p.frozen) { game.input.pressVirtual('drop'); game.input.releaseVirtual('drop'); } });
  // stop the browser from treating button taps as page gestures (double-tap zoom, long-press menus, scroll)
  wrap.addEventListener('contextmenu', (e) => e.preventDefault());
  wrap.addEventListener('touchstart', (e) => { if (e.target !== wrap) e.preventDefault(); }, { passive: false });
  wrap.addEventListener('touchmove', (e) => { if (e.target !== wrap) e.preventDefault(); }, { passive: false });

  // ---- visibility follows the player state ----
  const ACT_WORDS = { ride: 'RIDE', npc: 'TALK', gem: 'GRAB' };
  const show = (el, on) => { if (el.hidden === !on) return; el.hidden = !on; };
  let kind = null, lastNearest = null, raf = 0;
  const refresh = () => {
    const p = game.player;
    const state = p?.state || 'walk';
    const riding = state === 'riding', drive = riding && (kind || p?.ride?.kind) === 'drive';
    const sitting = state === 'sit', sliding = state === 'slide';
    const walking = state === 'walk' && !p?.fling;
    stick.style.visibility = (walking || drive || sitting) ? '' : 'hidden';
    show(runBtn, walking || drive);
    show(jumpBtn, walking);   // seated: EXIT (same slot) stands you up
    show(exitBtn, riding || sitting);
    show(camBtn, !sliding);
    const held = (game.items || game.quests?.items)?.held;
    show(dropBtn, walking && !p?.frozen && !!held && held !== 'none');
    const near = walking && !p?.frozen ? p.nearest : null;
    show(actBtn, !!near);
    if (near && near !== lastNearest) {
      lastNearest = near;
      const word = ACT_WORDS[near.kind] || (near.label ? String(near.label).split(/\s+/)[0].toUpperCase().slice(0, 8) : 'GO');
      actLabel.textContent = word;
      actLabel.style.fontSize = word.length > 5 ? '10px' : '';
    }
    if (!near) lastNearest = null;
    // a state change must not leave a virtual button latched (e.g. jump held when boarding)
    if (!walking && !drive && stickId === null) game.input.setVirtualAxis(0, 0);
    if (!walking && !sitting) game.input.releaseVirtual('jump');
  };
  const loop = () => { refresh(); raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop);

  return {
    el: wrap,
    refresh,
    /** Kept for ui.js: it reports the ride kind each frame; visibility itself is derived from player.state. */
    setRiding(on, k) { kind = on ? k : null; },
    destroy() { cancelAnimationFrame(raf); wrap.remove(); game.input.setVirtualAxis(0, 0); },
  };
}
