import * as THREE from 'three';
import { Panel, COLORS, roundRect } from './Panel.js';
import { Portrait } from './Portrait.js';

const _f = new THREE.Vector3();
const TYPE_SPEED = 48; // letters per second

// Story dialogue: a panel in front of you with the speaker's portrait, name
// and words. Words type out; Next (A button / Enter / click) finishes the
// line or goes on, Skip jumps past the whole scene. Choice lines show big
// answer buttons instead of Next. It stays where it opened (not stuck to
// your head), which is comfortable in VR.
export class DialoguePanel {
  constructor(game) {
    this.game = game;
    this.panel = new Panel({ width: 1.6, height: 0.56, name: 'dialogue', depthTest: false });
    this.panel.mesh.renderOrder = 120;
    this.panel.setDraw((ui) => this.draw(ui));
    game.renderer.scene.add(this.panel.mesh);
    game.ui.add(this.panel);
    this.line = null; // { speaker, name, color, text, choices, portrait }
    this.shown = 0;
    this.redrawT = 0;
    this.portraits = new Map();
    this.onNext = null;
    this.onSkip = null;
    this.onChoice = null;
  }

  get open() { return this.panel.visible; }

  show(line, { onNext, onSkip, onChoice, place = false, cutaway = '' }) {
    this.line = line;
    this.cutaway = cutaway;
    this.onNext = onNext;
    this.onSkip = onSkip;
    this.onChoice = onChoice;
    this.shown = line.choices ? line.text.length : 0;
    if (!this.panel.visible || place) this.place();
    this.panel.show();
    this.panel.dirty = true;
  }

  hide() {
    this.panel.hide();
    this.line = null;
  }

  // In front of you, a little below eye level.
  place() {
    const g = this.game;
    g.placeInFront(this.panel.mesh, g.isXR ? 1.45 : 1.6, 0, g.isXR ? -0.42 : -0.32);
    this.panel.mesh.rotateX(g.isXR ? -0.18 : -0.08);
  }

  get typing() { return this.line && this.shown < this.line.text.length; }

  // Next: finish typing first, then move on.
  next() {
    if (!this.line || this.line.choices) return;
    if (this.typing) { this.shown = this.line.text.length; this.panel.dirty = true; return; }
    this.onNext?.();
  }

  skip() { if (this.line) this.onSkip?.(); }

  update(dt) {
    if (!this.panel.visible || !this.line) return;
    if (this.typing) {
      this.shown = Math.min(this.line.text.length, this.shown + dt * TYPE_SPEED);
      this.redrawT -= dt;
      if (this.redrawT <= 0) { this.redrawT = 0.05; this.panel.dirty = true; }
    }
    // A portrait that is still loading draws once it's ready.
    if (this.waitingPortrait && this.portraitCanvas()) { this.waitingPortrait = false; this.panel.dirty = true; }
  }

  portraitCanvas() {
    const p = this.line?.portrait;
    if (!p) return null;
    if (p.type === 'player') return this.game.hud.portrait.update();
    if (p.type === 'avatar' && p.character) {
      const key = JSON.stringify(p.character);
      if (!this.portraits.has(key)) this.portraits.set(key, new Portrait(this.game, { character: p.character, form: 'base' }));
      return this.portraits.get(key).update();
    }
    return null;
  }

  draw(ui) {
    const L = this.line;
    if (!L) return;
    const g = ui.g;
    ui.background('rgba(8, 11, 32, 0.95)', L.color || COLORS.border, 30);
    const hasPic = !!L.portrait;
    const px = 34, py = 34, ps = 300;
    if (hasPic) {
      roundRect(g, px, py, ps, ps, 24);
      g.fillStyle = '#121838';
      g.fill();
      const pic = this.portraitCanvas();
      if (pic) {
        g.save();
        roundRect(g, px, py, ps, ps, 24);
        g.clip();
        g.drawImage(pic, px, py, ps, ps);
        g.restore();
      } else if (L.portrait.type === 'badge') drawBadge(g, px, py, ps, L.portrait);
      else this.waitingPortrait = true;
      roundRect(g, px, py, ps, ps, 24);
      g.lineWidth = 6;
      g.strokeStyle = L.color || '#ffffff';
      g.stroke();
    }
    const tx = hasPic ? px + ps + 40 : 60;
    const tw = ui.W - tx - 50;
    if (this.cutaway) ui.text(this.cutaway, ui.W - 50, 40, { size: 26, color: '#b9a0ff', align: 'right', weight: 'normal' });
    if (L.name) ui.text(L.name, tx, 92, { size: 56, color: L.color, stroke: '#000' });
    const text = L.text.slice(0, Math.floor(this.shown));
    ui.wrap(text, tx, L.name ? 160 : 110, tw, { size: L.speaker === 'narrator' ? 38 : 42, color: L.speaker === 'narrator' ? '#d6dcff' : COLORS.text, weight: L.speaker === 'narrator' ? 'normal' : 'bold', lineHeight: 1.28 });
    const by = ui.H - 112;
    const xr = this.game.isXR;
    if (L.choices) {
      const n = L.choices.length;
      const gap = 20;
      const bw = (tw - gap * (n - 1)) / n;
      L.choices.forEach((c, i) => ui.button(`choice-${i}`, c.label, tx + i * (bw + gap), by - 10, bw, 96, { size: 36, color: i === 0 ? '#b4560f' : '#1e2a66', onClick: () => this.onChoice?.(c) }));
      return;
    }
    ui.button('dlg-skip', 'Skip scene', tx, by, 230, 80, { size: 30, sub: xr ? 'B button' : 'Esc', onClick: () => this.skip() });
    ui.button('dlg-next', this.typing ? 'Next ▶▶' : 'Next ▶', ui.W - 50 - 300, by, 300, 80, { size: 38, color: '#b4560f', sub: xr ? 'A button' : 'Enter or click', onClick: () => this.next() });
  }

  updatePlacementIfLost() {
    // If you turned far away (VR), bring it back in front of you.
    const g = this.game;
    if (!this.panel.visible) return;
    g.player.flatForward(_f);
    const p = this.panel.mesh.position;
    const h = g.player.headWorld;
    const dx = p.x - h.x, dz = p.z - h.z;
    const d = Math.hypot(dx, dz) || 1;
    if ((dx * _f.x + dz * _f.z) / d < 0.2) this.place();
  }
}

// A drawn face for characters without a 3D model portrait (villains,
// King Kali, soldiers).
export function drawBadge(g, x, y, s, p) {
  const cx = x + s / 2, cy = y + s * 0.56;
  const grd = g.createRadialGradient(cx, cy - s * 0.1, s * 0.05, cx, cy, s * 0.75);
  grd.addColorStop(0, p.hologram ? '#5a2a8a' : '#3a2030');
  grd.addColorStop(1, '#0a0e22');
  g.fillStyle = grd;
  g.fillRect(x, y, s, s);
  g.save();
  if (p.hologram) g.globalAlpha = 0.85;
  // Shoulders / armor.
  g.fillStyle = p.armor;
  g.beginPath();
  g.ellipse(cx, y + s * 1.02, s * 0.46, s * 0.3, 0, 0, Math.PI * 2);
  g.fill();
  // Horns / crest / antennae behind the head.
  g.fillStyle = '#e8e0d0';
  if (p.horns) for (const k of [-1, 1]) { g.beginPath(); g.moveTo(cx + k * s * 0.12, cy - s * 0.16); g.lineTo(cx + k * s * 0.3, cy - s * 0.42); g.lineTo(cx + k * s * 0.2, cy - s * 0.12); g.fill(); }
  if (p.crest) { g.fillStyle = p.armor; g.beginPath(); g.moveTo(cx - s * 0.08, cy - s * 0.18); g.lineTo(cx, cy - s * 0.46); g.lineTo(cx + s * 0.08, cy - s * 0.18); g.fill(); }
  if (p.antennae) {
    g.strokeStyle = '#111'; g.lineWidth = s * 0.02;
    for (const k of [-1, 1]) { g.beginPath(); g.moveTo(cx + k * s * 0.08, cy - s * 0.22); g.lineTo(cx + k * s * 0.16, cy - s * 0.4); g.stroke(); g.beginPath(); g.arc(cx + k * s * 0.16, cy - s * 0.41, s * 0.025, 0, 7); g.fillStyle = '#111'; g.fill(); }
  }
  // Head.
  g.fillStyle = p.skin;
  g.beginPath();
  g.ellipse(cx, cy, s * 0.2, s * 0.24, 0, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = s * 0.015;
  g.strokeStyle = '#140c10';
  g.stroke();
  // Eyes (angry slants) or sunglasses.
  if (p.glasses) {
    g.fillStyle = '#111';
    for (const k of [-1, 1]) { g.beginPath(); g.arc(cx + k * s * 0.08, cy - s * 0.02, s * 0.055, 0, 7); g.fill(); }
    g.fillStyle = '#f4f4f4';
    for (const k of [-1, 1]) { g.beginPath(); g.ellipse(cx + k * s * 0.06, cy + s * 0.09, s * 0.06, s * 0.02, k * 0.4, 0, 7); g.fill(); }
  } else {
    g.fillStyle = p.eyes;
    for (const k of [-1, 1]) {
      g.beginPath();
      g.moveTo(cx + k * s * 0.03, cy - s * 0.02);
      g.lineTo(cx + k * s * 0.14, cy - s * 0.06);
      g.lineTo(cx + k * s * 0.13, cy + s * 0.01);
      g.closePath();
      g.fill();
    }
    g.strokeStyle = '#140c10';
    g.lineWidth = s * 0.018;
    g.beginPath(); g.moveTo(cx - s * 0.07, cy + s * 0.12); g.lineTo(cx + s * 0.07, cy + s * 0.11); g.stroke();
  }
  if (p.scouter) {
    g.fillStyle = 'rgba(255,58,58,0.75)';
    g.fillRect(cx - s * 0.17, cy - s * 0.09, s * 0.11, s * 0.08);
  }
  g.restore();
  if (p.hologram) {
    g.fillStyle = 'rgba(200,140,255,0.12)';
    for (let yy = y; yy < y + s; yy += 8) g.fillRect(x, yy, s, 3);
  }
}
