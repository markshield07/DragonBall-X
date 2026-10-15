import * as THREE from 'three';
import { bus } from '../core/events.js';
import { Panel, COLORS } from './Panel.js';
import { damp } from '../core/math.js';

const _f = new THREE.Vector3();

// Big announcement banner (milestones, transformation, boss warnings and
// "press A" prompts). Floats ahead of the player and follows their gaze
// lazily, which is comfortable in VR (no head-locked UI).
export class Banner {
  constructor(game) {
    this.game = game;
    this.panel = new Panel({ width: 1.8, height: 0.5, interactive: false, name: 'banner', depthTest: false });
    this.panel.mesh.material.depthWrite = false;
    game.renderer.scene.add(this.panel.mesh);
    this.queue = [];
    this.current = null;
    this.yaw = 0;
    this.opacity = 0;
    this.prompt = null;
    this.panel.setDraw((ui) => this.draw(ui));
    bus.on('banner', (b) => this.push(b));
    bus.on('hud:warning', (w) => this.push({ title: w.text, color: '#ff4d4d', duration: 1.8, priority: true }));
  }

  push({ title, subtitle = '', color = COLORS.gold, duration = 2.6, priority = false, big = false }) {
    const item = { title, subtitle, color, duration, big };
    if (priority) this.queue.unshift(item);
    else this.queue.push(item);
    if (this.queue.length > 5) this.queue.length = 5;
  }

  setPrompt(text) {
    if (text === this.prompt) return;
    this.prompt = text;
    if (!this.current) this.panel.dirty = true;
  }

  clear() {
    this.queue = [];
    this.current = null;
    this.prompt = null;
  }

  draw(ui) {
    const item = this.current || (this.prompt ? { title: this.prompt, subtitle: '', color: COLORS.gold } : null);
    if (!item) return;
    const g = ui.g;
    const grd = g.createLinearGradient(0, 0, ui.W, 0);
    grd.addColorStop(0, 'rgba(10,14,40,0)');
    grd.addColorStop(0.15, 'rgba(10,14,40,0.85)');
    grd.addColorStop(0.85, 'rgba(10,14,40,0.85)');
    grd.addColorStop(1, 'rgba(10,14,40,0)');
    g.fillStyle = grd;
    g.fillRect(0, 40, ui.W, ui.H - 80);
    ui.text(item.title, ui.W / 2, item.subtitle ? ui.H * 0.48 : ui.H * 0.58, {
      size: item.big ? 120 : 88, align: 'center', color: item.color, stroke: '#2a1200', maxWidth: ui.W - 120,
    });
    if (item.subtitle) ui.text(item.subtitle, ui.W / 2, ui.H * 0.78, { size: 50, align: 'center', color: '#ffffff', stroke: '#000', weight: 'bold', maxWidth: ui.W - 160 });
  }

  update(dt) {
    const g = this.game;
    if (this.current) {
      this.current.t -= dt;
      if (this.current.t <= 0) { this.current = null; this.panel.dirty = true; }
    }
    if (!this.current && this.queue.length) {
      this.current = this.queue.shift();
      this.current.t = this.current.duration;
      this.panel.dirty = true;
    }
    const want = this.current || this.prompt ? 1 : 0;
    this.opacity = damp(this.opacity, want, 10, dt);
    const visible = this.opacity > 0.02 && g.state !== 'menu' && g.state !== 'creator' && g.state !== 'result' && !g.menuOpen;
    if (visible && !this.panel.visible) {
      this.panel.show();
      g.player.flatForward(_f);
      this.yaw = Math.atan2(_f.x, _f.z); // appear straight ahead, then follow lazily
    }
    if (!visible && this.panel.visible) this.panel.hide();
    if (!visible) return;
    this.panel.mesh.material.opacity = this.opacity;
    // Lazy follow: yaw eases toward the head's yaw.
    const head = g.player.headWorld;
    g.player.flatForward(_f);
    const targetYaw = Math.atan2(_f.x, _f.z);
    let d = targetYaw - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * 2.5);
    const dist = 2.4;
    this.panel.mesh.position.set(head.x + Math.sin(this.yaw) * dist, head.y + 0.35, head.z + Math.cos(this.yaw) * dist);
    this.panel.mesh.lookAt(head.x, head.y + 0.35, head.z);
    this.panel.update();
  }
}
