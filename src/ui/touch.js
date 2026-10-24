// Virtual joystick + action buttons for touch devices. Feeds game.input's virtual axis / buttons.
const RADIUS = 60, DEADZONE = 0.12;

export function mountTouchControls(game, root) {
  const wrap = document.createElement('div');
  wrap.className = 'hk-touch';
  wrap.innerHTML = `
    <div class="hk-stick"><div class="hk-knob">✥</div></div>
    <div class="hk-tbtns">
      <button class="hk-tbtn-run" aria-label="Run">⚡<span>RUN</span></button>
      <button class="hk-tbtn-jump" aria-label="Jump">⤒<span>JUMP</span></button>
      <button class="hk-tbtn-exit" aria-label="Exit ride" hidden>✕<span>EXIT</span></button>
    </div>`;
  root.appendChild(wrap);
  const stick = wrap.querySelector('.hk-stick'), knob = wrap.querySelector('.hk-knob');
  const jumpBtn = wrap.querySelector('.hk-tbtn-jump'), runBtn = wrap.querySelector('.hk-tbtn-run'), exitBtn = wrap.querySelector('.hk-tbtn-exit');

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
    stickId = e.pointerId; stick.setPointerCapture(stickId);
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

  // ---- hold buttons ----
  const hold = (btn, action, onDown) => {
    let id = null;
    btn.addEventListener('pointerdown', (e) => {
      if (id !== null) return;
      e.preventDefault(); id = e.pointerId; btn.setPointerCapture(id); btn.classList.add('down');
      game.input.pressVirtual(action); onDown?.();
    });
    const up = (e) => { if (e.pointerId !== id) return; id = null; btn.classList.remove('down'); game.input.releaseVirtual(action); };
    btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', up); btn.addEventListener('lostpointercapture', up);
  };
  hold(jumpBtn, 'jump');
  hold(runBtn, 'boost', () => game.audio?.play('click'));
  // pointerup, not click: the touchstart preventDefault below suppresses synthesized clicks
  exitBtn.addEventListener('pointerdown', (e) => e.preventDefault());
  exitBtn.addEventListener('pointerup', () => { game.audio?.play('click'); game.player?.exitRide(false); });
  // stop the browser from treating button taps as page gestures
  wrap.addEventListener('contextmenu', (e) => e.preventDefault());
  wrap.addEventListener('touchstart', (e) => { if (e.target !== wrap) e.preventDefault(); }, { passive: false });

  let riding = false;
  return {
    el: wrap,
    setRiding(on, kind) {
      if (on === riding && this._kind === kind) return;
      riding = on; this._kind = kind;
      jumpBtn.hidden = on; exitBtn.hidden = !on;
      // steering needs the stick; boost is only meaningful on drive rides
      stick.style.visibility = on && kind !== 'drive' ? 'hidden' : '';
      runBtn.hidden = on && kind !== 'drive';
      if (on) { game.input.setVirtualAxis(0, 0); game.input.releaseVirtual('jump'); }
    },
    destroy() { wrap.remove(); game.input.setVirtualAxis(0, 0); },
  };
}
