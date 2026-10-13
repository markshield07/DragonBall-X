import { bus } from '../core/events.js';

// Watches real frame times and, when auto quality is on, steps visual
// complexity down (particles -> lightning/aura layers -> preset) if the frame
// rate stays below target. Gameplay is never changed, only visuals.
export class PerformanceMonitor {
  constructor(game) {
    this.game = game;
    this.frames = 0;
    this.acc = 0;
    this.fps = 60;
    this.lowWindows = 0;
    this.goodWindows = 0;
    this.level = 0; // 0 = preset as chosen, 1..3 = progressively reduced
    this.reduced = false;
  }

  reset() {
    this.level = 0;
    this.reduced = false;
    this.lowWindows = this.goodWindows = 0;
  }

  sample(dt) {
    this.frames += 1;
    this.acc += dt;
    if (this.acc < 1.5) return;
    this.fps = this.frames / this.acc;
    this.frames = 0;
    this.acc = 0;
    const g = this.game;
    if (!g.settings.autoQuality) return;
    // On desktop the browser caps at the display refresh rate; aim for ~55.
    const target = g.isXR ? g.xrFrameRate || 72 : 55;
    if (this.fps < target * 0.85) {
      this.lowWindows += 1;
      this.goodWindows = 0;
      if (this.lowWindows >= 2 && this.level < 3) {
        this.level += 1;
        this.lowWindows = 0;
        this.reduced = true;
        g.applyDynamicQuality();
      }
    } else {
      this.lowWindows = 0;
      this.goodWindows += 1;
    }
  }
}
