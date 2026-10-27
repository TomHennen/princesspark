// Keyboard + touch input. Exposes a normalized move vector and action flags.
// Mobile UI (ui/touch.js) feeds values in through setVirtualAxis / pressVirtual.
export class Input {
  constructor() {
    this.keys = new Set();
    this.virtual = { x: 0, y: 0 };      // joystick, -1..1 (x right, y forward)
    this.virtualButtons = new Set();     // 'jump' | 'interact' | 'exit' | 'boost' | 'drop'
    this.pressedThisFrame = new Set();   // one-shot actions, cleared each frame
    this.lookDelta = { x: 0, y: 0 };     // accumulated mouse/touch look delta
    this.enabled = true;
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (!this.keys.has(e.code)) this.pressedThisFrame.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }
  // movement: x = strafe right (+), y = forward (+)
  get move() {
    let x = 0, y = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    x += this.virtual.x; y += this.virtual.y;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y };
  }
  get jump() { return this.keys.has('Space') || this.virtualButtons.has('jump'); }
  get boost() { return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.virtualButtons.has('boost'); }
  // one-shot: true only on the frame the key went down ('drop' = Q: toss what you're holding, see quests/items.js)
  justPressed(action) {
    const map = { interact: ['KeyE', 'Enter'], exit: ['KeyX', 'Escape'], jump: ['Space'], boost: ['ShiftLeft'], drop: ['KeyQ'] };
    if (this.pressedThisFrame.has(`virtual:${action}`)) return true;
    return (map[action] || []).some((c) => this.pressedThisFrame.has(c));
  }
  setVirtualAxis(x, y) { this.virtual.x = x; this.virtual.y = y; }
  pressVirtual(action) { this.virtualButtons.add(action); this.pressedThisFrame.add(`virtual:${action}`); }
  releaseVirtual(action) { this.virtualButtons.delete(action); }
  addLook(dx, dy) { this.lookDelta.x += dx; this.lookDelta.y += dy; }
  endFrame() { this.pressedThisFrame.clear(); this.lookDelta.x = 0; this.lookDelta.y = 0; }
}
