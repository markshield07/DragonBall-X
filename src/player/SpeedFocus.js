import { bus } from '../core/events.js';
import { clamp, damp } from '../core/math.js';

export const SLOWMO_UNLOCK_LEVEL = 5;

// Speed Focus: once Speed reaches level 5 the player can slow down time
// (right thumbstick click / F / the on-screen button). Enemies, their attacks
// and enemy ki slow to a crawl while you keep moving and punching at full
// speed. Longer and stronger with more Speed levels; costs stamina and has a
// cooldown. No camera effects: the world tints cool blue and sound drops.
export class SpeedFocus {
  constructor(game) {
    this.game = game;
    this.active = 0; // seconds left
    this.cooldown = 0;
    this.scale = 1; // eased time scale applied to enemies
    this.announced = false;
    bus.on('stat:levelup', ({ stat, level }) => {
      if (stat === 'speed' && level === SLOWMO_UNLOCK_LEVEL) bus.emit('slowmo:unlocked', {});
    });
  }

  get unlocked() { return this.game.progress.level('speed') >= SLOWMO_UNLOCK_LEVEL; }
  get duration() { return clamp(3 + 0.35 * (this.game.progress.level('speed') - SLOWMO_UNLOCK_LEVEL), 3, 8); }
  get target() { return clamp(0.35 - 0.015 * (this.game.progress.level('speed') - SLOWMO_UNLOCK_LEVEL), 0.2, 0.35); }

  activate() {
    const g = this.game;
    if (!this.unlocked) {
      bus.emit('hud:message', { text: `Slow motion unlocks at Speed level ${SLOWMO_UNLOCK_LEVEL} (Speed Training)`, color: '#5cff8a' });
      return;
    }
    if (this.active > 0) { this.active = 0; return; }
    if (this.cooldown > 0) {
      bus.emit('hud:message', { text: `Slow motion ready in ${Math.ceil(this.cooldown)}s`, color: '#5cff8a' });
      return;
    }
    if (g.player.stamina < 15) {
      bus.emit('hud:message', { text: 'Too tired for slow motion', color: '#ff9a4d' });
      return;
    }
    g.player.spendStamina(15);
    this.active = this.duration;
    this.cooldown = 12 + this.duration;
    g.audio.slowmo?.(true);
    bus.emit('slowmo', { on: true });
  }

  reset() {
    this.active = 0;
    this.scale = 1;
  }

  update(dt, enabled) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.active > 0) {
      this.active -= dt;
      if (this.active <= 0 || !enabled) {
        this.active = 0;
        this.game.audio.slowmo?.(false);
        bus.emit('slowmo', { on: false });
      }
    }
    this.scale = damp(this.scale, this.active > 0 ? this.target : 1, 10, dt);
    return this.scale;
  }
}
