import { Panel, COLORS } from './Panel.js';
import { formatNumber } from '../core/math.js';

// Big anime title cards for the story:
//   episode   SAGA ONE · THE FALLEN WARRIOR / EPISODE FOUR / RAXOR'S RETURN
//   card      any big announcement (a new saga, END OF SAGA ONE)
//   boss      boss name, title and both Power Levels before a story fight
//   complete  EPISODE COMPLETE with rewards and Next / Free Training buttons
// It fades in front of you; tap anywhere (or A / Enter) to go on early.
export class EpisodeBanner {
  constructor(game) {
    this.game = game;
    this.panel = new Panel({ width: 2.2, height: 1.15, name: 'episodeCard', depthTest: false });
    this.panel.mesh.renderOrder = 118;
    this.panel.setDraw((ui) => this.draw(ui));
    game.renderer.scene.add(this.panel.mesh);
    game.ui.add(this.panel);
    this.card = null;
    this.t = 0;
  }

  get open() { return this.panel.visible; }

  // card: { kind, ...text, duration, onDone, buttons }
  show(card) {
    this.card = card;
    this.t = 0;
    this.panel.mesh.material.opacity = 0;
    const g = this.game;
    g.placeInFront(this.panel.mesh, g.isXR ? 2.4 : 2.5, 0, g.isXR ? 0.05 : 0.0);
    this.panel.show();
    this.panel.dirty = true;
    if (card.kind === 'boss') g.audio.bossRoar();
    else if (card.kind === 'complete') g.audio.fanfare();
    else g.audio.whoosh?.();
  }

  hide() { this.panel.hide(); this.card = null; }

  // Tap / A / Enter: finish the card (cards with buttons wait for a button).
  advance() {
    const c = this.card;
    if (!c || c.buttons || this.t < 0.6) return;
    this.finish();
  }

  finish() {
    const c = this.card;
    this.hide();
    c?.onDone?.();
  }

  update(dt) {
    const c = this.card;
    if (!c) return;
    this.t += dt;
    const dur = c.duration ?? 4.2;
    const fadeIn = Math.min(1, this.t / 0.5);
    const fadeOut = c.buttons ? 1 : Math.min(1, Math.max(0, (dur - this.t) / 0.5));
    this.panel.mesh.material.opacity = Math.min(fadeIn, fadeOut);
    if (!c.buttons && this.t >= dur) this.finish();
  }

  draw(ui) {
    const c = this.card;
    if (!c) return;
    const g = ui.g;
    const W = ui.W, H = ui.H;
    // Dark card with a glow in the card's colour and anime speed lines.
    const col = c.color || (c.kind === 'boss' ? '#ff4a3a' : COLORS.gold);
    const grd = g.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, W * 0.6);
    grd.addColorStop(0, hexA(col, 0.32));
    grd.addColorStop(0.55, 'rgba(10,10,30,0.94)');
    grd.addColorStop(1, 'rgba(4,4,14,0.97)');
    ui.background(grd, col, 36);
    g.save();
    g.globalAlpha = 0.16;
    g.strokeStyle = col;
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      g.lineWidth = 2 + (i % 3) * 2;
      g.beginPath();
      g.moveTo(W / 2 + Math.cos(a) * 330, H / 2 + Math.sin(a) * 230);
      g.lineTo(W / 2 + Math.cos(a) * 1200, H / 2 + Math.sin(a) * 900);
      g.stroke();
    }
    g.restore();
    const mid = W / 2;
    const tapHint = () => { if (!c.buttons) ui.text(this.game.isXR ? 'Press A to continue' : 'Click or press Enter to continue', mid, H - 50, { size: 40, align: 'center', color: '#c8d0f0', weight: 'normal' }); };
    if (c.kind === 'episode') {
      ui.text(c.saga, mid, 190, { size: 54, align: 'center', color: col, stroke: '#000' });
      ui.text(c.episode, mid, 330, { size: 70, align: 'center', color: '#ffffff', stroke: '#1a1a3a' });
      ui.text(c.title, mid, 530, { size: 150, align: 'center', color: '#ffb33a', stroke: '#5a1a00', maxWidth: W - 120 });
      if (c.summary) ui.wrap(c.summary, 160, 650, W - 320, { size: 44, color: '#d6dcff' });
      tapHint();
    } else if (c.kind === 'card') {
      ui.text(c.top || '', mid, 300, { size: 80, align: 'center', color: '#ffffff', stroke: '#1a1a3a' });
      ui.text(c.big || '', mid, 520, { size: 160, align: 'center', color: col, stroke: '#3a1000', maxWidth: W - 120 });
      if (c.sub) ui.text(c.sub, mid, 660, { size: 46, align: 'center', color: '#d6dcff', maxWidth: W - 160 });
      tapHint();
    } else if (c.kind === 'boss') {
      ui.text('BOSS BATTLE', mid, 170, { size: 70, align: 'center', color: '#ff6a5a', stroke: '#000' });
      ui.text(c.name.toUpperCase(), mid, 380, { size: 190, align: 'center', color: '#ffffff', stroke: '#8a0a0a', maxWidth: W - 120 });
      ui.text(c.title, mid, 470, { size: 50, align: 'center', color: '#ffb0a0' });
      ui.text(`Power Level ${formatNumber(c.bossPL)}`, mid - 40, 600, { size: 56, align: 'right', color: '#ff8a7a' });
      ui.text(`You: ${formatNumber(c.yourPL)}`, mid + 40, 600, { size: 56, align: 'left', color: '#7fd8ff' });
      ui.text('VS', mid, 600, { size: 44, align: 'center', color: '#ffffff' });
      if (c.note) ui.wrap(c.note, 200, 700, W - 400, { size: 44, color: '#ffe0a0' });
      tapHint();
    } else if (c.kind === 'complete') {
      ui.text('EPISODE COMPLETE!', mid, 170, { size: 110, align: 'center', color: COLORS.gold, stroke: '#5a2a00' });
      ui.text(c.title, mid, 260, { size: 54, align: 'center', color: '#ffffff' });
      let y = 360;
      for (const line of c.lines || []) { ui.text(line, mid, y, { size: 42, align: 'center', color: '#5cff8a', maxWidth: W - 200 }); y += 62; }
      const bw = 620;
      const by = H - 190;
      const bs = c.buttons;
      bs.forEach((b, i) => {
        const x = bs.length === 1 ? mid - bw / 2 : i === 0 ? mid - bw - 30 : mid + 30;
        ui.button(`card-${i}`, b.label, x, by, bw, 130, { size: 50, color: i === 0 ? '#b4560f' : '#1e2a66', sub: b.sub, onClick: () => { this.hide(); b.onClick(); } });
      });
    }
    // Tap anywhere to continue (cards without buttons).
    if (!c.buttons) this.panel.regions.push({ id: 'card-tap', x: 0, y: 0, w: W, h: H, enabled: true, onClick: () => this.advance() });
  }
}

function hexA(hex, a) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
