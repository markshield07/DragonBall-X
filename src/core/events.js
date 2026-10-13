// Tiny event bus shared by every system, so systems can react to each other
// (e.g. a punch landing triggers audio, haptics, XP and VFX) without importing
// each other directly.
export class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
    return () => this.off(type, fn);
  }

  off(type, fn) {
    this.listeners.get(type)?.delete(fn);
  }

  emit(type, payload) {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const fn of [...set]) fn(payload);
  }
}

export const bus = new EventBus();
