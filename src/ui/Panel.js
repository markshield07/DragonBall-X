import * as THREE from 'three';

// A world-space UI panel drawn with Canvas 2D and shown as a textured plane.
// The same panel works in VR (controller laser pointer) and on desktop
// (mouse cursor), so menus are built once.
//
// Each panel has a draw(ui) callback that is re-run whenever the panel is
// marked dirty. `ui` is a tiny immediate-mode toolkit that records clickable
// regions while drawing.
export const COLORS = {
  bg: 'rgba(10, 14, 40, 0.96)',
  bgSolid: '#0b0f2a',
  border: '#ffb52b',
  text: '#f5f7ff',
  muted: '#aab3d6',
  gold: '#ffcc33',
  orange: '#ff7a1a',
  blue: '#4cc3ff',
  red: '#ff4d4d',
  green: '#5cff8a',
  button: '#1e2a66',
  buttonHover: '#33449a',
  buttonSel: '#ff8a1a',
  disabled: '#3a3f5a',
};

export class Panel {
  constructor({ width = 1.2, height = 0.8, pxPerMeter = 900, interactive = true, name = 'panel', depthTest = true } = {}) {
    this.name = name;
    this.width = width;
    this.height = height;
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(width * pxPerMeter);
    this.canvas.height = Math.round(height * pxPerMeter);
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.material = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthTest, side: THREE.FrontSide, toneMapped: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), this.material);
    this.mesh.name = name;
    this.mesh.userData.panel = this;
    this.mesh.renderOrder = depthTest ? 10 : 30;
    this.interactive = interactive;
    this.regions = [];
    this.hoverId = null;
    this.dirty = true;
    this.drawFn = null;
    this.visible = false;
    this.mesh.visible = false;
  }

  get W() { return this.canvas.width; }
  get H() { return this.canvas.height; }

  setDraw(fn) { this.drawFn = fn; this.dirty = true; }

  show() { this.visible = true; this.mesh.visible = true; this.dirty = true; }
  hide() { this.visible = false; this.mesh.visible = false; this.hoverId = null; }

  redraw() {
    if (!this.drawFn) return;
    this.regions = [];
    const g = this.ctx;
    g.clearRect(0, 0, this.W, this.H);
    this.drawFn(this.makeUI());
    this.texture.needsUpdate = true;
    this.dirty = false;
  }

  update() {
    if (this.visible && this.dirty) this.redraw();
  }

  // uv -> canvas pixel
  toPx(uv) { return { x: uv.x * this.W, y: (1 - uv.y) * this.H }; }

  hit(uv) {
    const p = this.toPx(uv);
    for (let i = this.regions.length - 1; i >= 0; i--) {
      const r = this.regions[i];
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return r;
    }
    return null;
  }

  setHover(uv) {
    const r = uv ? this.hit(uv) : null;
    const id = r && r.enabled ? r.id : null;
    if (id !== this.hoverId) {
      this.hoverId = id;
      this.dirty = true;
      return true;
    }
    return false;
  }

  click(uv) {
    const r = this.hit(uv);
    if (r && r.enabled && r.onClick) {
      r.onClick();
      this.dirty = true;
      return true;
    }
    return false;
  }

  makeUI() {
    const g = this.ctx;
    const panel = this;
    const ui = {
      g,
      W: this.W,
      H: this.H,
      background(color = COLORS.bg, border = COLORS.border, radius = 28) {
        roundRect(g, 4, 4, panel.W - 8, panel.H - 8, radius);
        g.fillStyle = color;
        g.fill();
        if (border) {
          g.lineWidth = 6;
          g.strokeStyle = border;
          g.stroke();
        }
      },
      text(str, x, y, { size = 32, color = COLORS.text, align = 'left', weight = 'bold', baseline = 'alphabetic', stroke = null, maxWidth } = {}) {
        g.font = `${weight} ${size}px "Trebuchet MS", "Segoe UI", sans-serif`;
        g.textAlign = align;
        g.textBaseline = baseline;
        if (stroke) {
          g.lineWidth = Math.max(4, size / 7);
          g.strokeStyle = stroke;
          g.lineJoin = 'round';
          g.strokeText(str, x, y, maxWidth);
        }
        g.fillStyle = color;
        g.fillText(str, x, y, maxWidth);
      },
      wrap(str, x, y, maxW, { size = 26, color = COLORS.muted, lineHeight = 1.3, weight = 'normal' } = {}) {
        g.font = `${weight} ${size}px "Trebuchet MS", "Segoe UI", sans-serif`;
        g.fillStyle = color;
        g.textAlign = 'left';
        g.textBaseline = 'alphabetic';
        const words = String(str).split(' ');
        let line = '';
        let yy = y;
        for (const w of words) {
          const test = line ? `${line} ${w}` : w;
          if (g.measureText(test).width > maxW && line) {
            g.fillText(line, x, yy);
            line = w;
            yy += size * lineHeight;
          } else line = test;
        }
        if (line) g.fillText(line, x, yy);
        return yy + size * lineHeight;
      },
      button(id, label, x, y, w, h, { onClick, enabled = true, selected = false, size = 30, color, sub } = {}) {
        const hover = panel.hoverId === id;
        roundRect(g, x, y, w, h, Math.min(18, h / 3));
        g.fillStyle = !enabled ? COLORS.disabled : selected ? COLORS.buttonSel : color || (hover ? COLORS.buttonHover : COLORS.button);
        g.fill();
        g.lineWidth = hover && enabled ? 5 : 3;
        g.strokeStyle = hover && enabled ? '#ffffff' : 'rgba(255,255,255,0.35)';
        g.stroke();
        ui.text(label, x + w / 2, y + h / 2 + (sub ? -size * 0.25 : 0), {
          size, align: 'center', baseline: 'middle', color: enabled ? (selected ? '#1a0d00' : COLORS.text) : '#8890b0', maxWidth: w - 16,
        });
        if (sub) ui.text(sub, x + w / 2, y + h / 2 + size * 0.6, { size: size * 0.55, align: 'center', baseline: 'middle', color: selected ? '#3a1d00' : COLORS.muted, weight: 'normal', maxWidth: w - 16 });
        panel.regions.push({ id, x, y, w, h, onClick, enabled });
      },
      bar(x, y, w, h, frac, color, { bg = 'rgba(255,255,255,0.12)', label, labelSize = 22 } = {}) {
        roundRect(g, x, y, w, h, h / 2);
        g.fillStyle = bg;
        g.fill();
        const f = Math.max(0, Math.min(1, frac));
        if (f > 0) {
          roundRect(g, x, y, Math.max(h, w * f), h, h / 2);
          g.fillStyle = color;
          g.fill();
        }
        if (label) ui.text(label, x + w / 2, y + h / 2 + 1, { size: labelSize, align: 'center', baseline: 'middle', stroke: 'rgba(0,0,0,0.7)' });
      },
      swatch(id, x, y, size, color, { selected = false, onClick } = {}) {
        g.beginPath();
        g.arc(x + size / 2, y + size / 2, size / 2 - 3, 0, Math.PI * 2);
        g.fillStyle = '#' + color.toString(16).padStart(6, '0');
        g.fill();
        g.lineWidth = selected ? 7 : panel.hoverId === id ? 5 : 2;
        g.strokeStyle = selected ? COLORS.gold : panel.hoverId === id ? '#fff' : 'rgba(255,255,255,0.4)';
        g.stroke();
        panel.regions.push({ id, x, y, w: size, h: size, onClick, enabled: true });
      },
    };
    return ui;
  }
}

export function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}


// Health bar color: green when fresh, through yellow and orange, to red.
export function healthColor(f) {
  const h = Math.max(0, Math.min(1, f)) * 120;
  return `hsl(${h}, 85%, ${45 + (1 - f) * 5}%)`;
}
