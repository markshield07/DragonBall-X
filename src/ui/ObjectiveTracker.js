import * as THREE from 'three';
import { Panel, COLORS } from './Panel.js';

const _f = new THREE.Vector3();

// The small "what do I do now" box while the story is on: episode, the
// current objective, a progress bar and a hint for this device.
// Desktop: a box in the top-right corner of the screen.
// VR: a small panel low and to the left that drifts after your gaze slowly
// (never stuck to your face), so you can glance down at it.
export class ObjectiveTracker {
  constructor(game) {
    this.game = game;
    this.panel = new Panel({ width: 0.7, height: 0.24, interactive: false, name: 'objective', depthTest: false });
    this.panel.mesh.renderOrder = 31;
    this.panel.setDraw((ui) => this.draw(ui));
    game.renderer.scene.add(this.panel.mesh);
    this.el = document.createElement('div');
    this.el.id = 'story-tracker';
    this.el.className = 'hidden';
    this.el.innerHTML = '<div class="st-ep"></div><div class="st-obj"></div><div class="st-bar"><i></i></div><div class="st-prog"></div><div class="st-hint"></div>';
    document.body.appendChild(this.el);
    this.info = null;
    this.key = '';
    this.yaw = 0;
  }

  // info: { episode, text, progress (0..1 or null), progressText, hint } or null
  set(info) {
    const key = info ? JSON.stringify(info) : '';
    if (key === this.key) return;
    this.key = key;
    this.info = info;
    this.panel.dirty = true;
    if (!info) return;
    const q = (s) => this.el.querySelector(s);
    q('.st-ep').textContent = info.episode;
    q('.st-obj').textContent = info.text;
    q('.st-bar').style.display = info.progress == null ? 'none' : '';
    q('.st-bar i').style.width = `${Math.round((info.progress || 0) * 100)}%`;
    q('.st-prog').textContent = info.progressText || '';
    q('.st-hint').textContent = info.hint || '';
  }

  update(dt, visible) {
    const g = this.game;
    const xr = g.isXR;
    const show = visible && !!this.info;
    this.el.classList.toggle('hidden', !show || xr);
    const vr = show && xr;
    if (vr && !this.panel.visible) {
      this.panel.show();
      g.player.flatForward(_f);
      this.yaw = Math.atan2(_f.x, _f.z);
    }
    if (!vr && this.panel.visible) this.panel.hide();
    if (!vr) return;
    g.player.flatForward(_f);
    let d = Math.atan2(_f.x, _f.z) - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    // Only follow once you've turned well away (a lazy, comfortable follow).
    if (Math.abs(d) > 0.5) this.yaw += d * Math.min(1, dt * 2);
    const head = g.player.headWorld;
    const yaw = this.yaw + 0.42;
    const dist = 1.5;
    this.panel.mesh.position.set(head.x + Math.sin(yaw) * dist, head.y - 0.42, head.z + Math.cos(yaw) * dist);
    this.panel.mesh.lookAt(head.x, head.y - 0.1, head.z);
    this.panel.update();
  }

  draw(ui) {
    const i = this.info;
    if (!i) return;
    ui.background('rgba(8, 11, 32, 0.88)', COLORS.gold, 22);
    ui.text(i.episode, 26, 44, { size: 26, color: COLORS.gold, maxWidth: ui.W - 52 });
    ui.text(i.text, 26, 92, { size: 34, color: '#ffffff', maxWidth: ui.W - 52 });
    if (i.progress != null) {
      ui.bar(26, 112, ui.W - 52, 28, i.progress, '#ff8a1a', { label: i.progressText || '', labelSize: 22 });
    }
    if (i.hint) ui.text(i.hint, 26, 186, { size: 24, color: COLORS.muted, weight: 'normal', maxWidth: ui.W - 52 });
  }
}
