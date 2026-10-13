import * as THREE from 'three';
import { bus } from '../core/events.js';
import { FORMS } from '../progression/forms.js';
import { formatNumber } from '../core/math.js';
import { roundRect, COLORS } from './Panel.js';
import { BOSSES } from '../boss/Raxor.js';

// Status HUD drawn on one canvas. On desktop the canvas itself is shown as a
// DOM overlay; in VR the same canvas is a texture on a wrist display above
// the left hand (look at your wrist like a watch).
export class HUD {
  constructor(game) {
    this.game = game;
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'hud-canvas';
    this.canvas.width = 768;
    this.canvas.height = 512;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.wrist = new THREE.Mesh(
      new THREE.PlaneGeometry(0.21, 0.14),
      new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthTest: true, toneMapped: false }),
    );
    this.wrist.renderOrder = 12;
    this.wrist.visible = false;
    this.timer = 0;
    this.message = null;
    this.displayPL = 1000;
    bus.on('hud:message', (m) => this.showMessage(m.text, m.color, m.duration));
  }

  attachWrist(leftHandGroup) {
    leftHandGroup.add(this.wrist);
    // Above the back of the left wrist, tilted toward the face.
    this.wrist.position.set(0.0, 0.07, 0.1);
    this.wrist.rotation.set(-1.0, 0, 0);
  }

  setMode(isXR, visible) {
    this.wrist.visible = isXR && visible;
    if (!isXR && visible) {
      if (!this.canvas.parentNode) document.body.appendChild(this.canvas);
      this.canvas.classList.remove('hidden');
    } else this.canvas.classList.add('hidden');
  }

  showMessage(text, color = '#ffffff', duration = 2.2) {
    this.message = { text, color, t: duration };
  }

  update(dt) {
    this.timer -= dt;
    if (this.message) {
      this.message.t -= dt;
      if (this.message.t <= 0) this.message = null;
    }
    const pl = this.game.currentPowerLevel();
    // Power Level counts up/down visibly instead of snapping.
    this.displayPL += (pl - this.displayPL) * Math.min(1, dt * 4);
    if (Math.abs(pl - this.displayPL) < 1) this.displayPL = pl;
    if (this.timer > 0) return;
    this.timer = 1 / 15;
    this.draw();
  }

  draw() {
    const g = this.ctx;
    const W = 768;
    const H = 512;
    const game = this.game;
    const p = game.player;
    const prog = game.progress;
    const f = FORMS[p.form];
    g.clearRect(0, 0, W, H);
    roundRect(g, 4, 4, W - 8, H - 8, 26);
    g.fillStyle = 'rgba(8, 12, 34, 0.78)';
    g.fill();
    g.lineWidth = 5;
    g.strokeStyle = p.form === 'base' ? 'rgba(255,255,255,0.35)' : '#ffcc33';
    g.stroke();

    const text = (s, x, y, size, color = COLORS.text, align = 'left', weight = 'bold') => {
      g.font = `${weight} ${size}px "Trebuchet MS", sans-serif`;
      g.textAlign = align;
      g.fillStyle = color;
      g.fillText(s, x, y);
    };
    const bar = (x, y, w, h, frac, color, label) => {
      roundRect(g, x, y, w, h, h / 2);
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fill();
      const fr = Math.max(0, Math.min(1, frac));
      if (fr > 0) {
        roundRect(g, x, y, Math.max(h, w * fr), h, h / 2);
        g.fillStyle = color;
        g.fill();
      }
      if (label) text(label, x + 12, y + h - 8, h - 10, '#ffffff', 'left');
    };

    // Header: name + form
    text(game.character.name.toUpperCase(), 28, 52, 36, COLORS.text);
    text(f.name.toUpperCase(), W - 28, 52, 34, p.form === 'base' ? COLORS.muted : COLORS.gold, 'right');
    // Power level
    text('POWER LEVEL', 28, 100, 24, COLORS.muted);
    text(formatNumber(this.displayPL), 28, 150, 54, p.form === 'base' ? '#ffffff' : COLORS.gold);
    // Resources
    bar(28, 172, 712, 34, p.health / prog.maxHealth(), '#4cdd6a', `HP ${Math.ceil(p.health)}`);
    bar(28, 214, 712, 34, p.ki / prog.maxKi(), '#4cc3ff', `KI ${Math.floor(p.ki)}`);
    bar(28, 256, 712, 26, p.stamina / prog.maxStamina(), p.exhausted ? '#ff6a4d' : '#ffd23a', p.exhausted ? 'EXHAUSTED' : 'STAMINA');

    // Power-up meter
    const tr = game.transformation;
    if (tr.charge > 0.01 || tr.state === 'transforming') {
      const can = tr.canTransform();
      bar(28, 296, 712, 30, tr.charge, can.ok ? '#ffcc33' : '#bfe6ff', can.ok ? 'READY! PRESS A / T TO TRANSFORM' : 'POWERING UP');
    } else {
      const atk = p.equippedAttack();
      text(`Attack: ${atk.name}`, 28, 320, 28, COLORS.blue);
      text(game.isXR ? 'B: switch' : 'E: switch', W - 28, 320, 24, COLORS.muted, 'right');
    }

    // Boss bar or next goal
    if (game.boss.active && game.boss.state !== 'inactive') {
      const b = game.boss;
      text(`${b.def.name.toUpperCase()}  PL ${formatNumber(b.def.powerLevel)}`, 28, 370, 28, '#ff8a8a');
      bar(28, 384, 712, 30, b.health / b.def.maxHealth, b.phase === 2 ? '#c02aff' : '#ff4a4a');
    } else {
      const goal = prog.nextGoal(BOSSES);
      text(`NEXT: ${goal.title}`, 28, 370, 28, COLORS.gold);
      bar(28, 384, 712, 22, goal.progress, '#ff8a1a');
      text(goal.detail, 28, 440, 24, COLORS.muted);
    }

    // Transient message
    if (this.message) {
      text(this.message.text, W / 2, 492, 30, this.message.color, 'center');
    } else if (!game.isXR) {
      text('Tab: menu   Space: power up   T: transform', W / 2, 492, 22, 'rgba(255,255,255,0.45)', 'center', 'normal');
    }
    this.texture.needsUpdate = true;
  }
}
