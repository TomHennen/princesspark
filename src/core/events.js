// Tiny event bus shared by every system. Usage:
//   game.events.on('ride:complete', ({ ride }) => ...)
//   game.events.emit('ride:complete', { ride: 'coaster' })
export class EventBus {
  constructor() { this.map = new Map(); }
  on(name, fn) {
    if (!this.map.has(name)) this.map.set(name, new Set());
    this.map.get(name).add(fn);
    return () => this.off(name, fn);
  }
  off(name, fn) { this.map.get(name)?.delete(fn); }
  emit(name, payload = {}) {
    this.map.get(name)?.forEach((fn) => { try { fn(payload); } catch (e) { console.error(`[events:${name}]`, e); } });
  }
}
