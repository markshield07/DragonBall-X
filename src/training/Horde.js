import * as THREE from 'three';
import { bus } from '../core/events.js';
import { rand, clamp, formatNumber } from '../core/math.js';
import { Sparring } from './Sparring.js';
import { Knockdown } from '../combat/Knockdown.js';
import { createAvatar } from '../character/createAvatar.js';
import { BattleDamage } from '../fx/BattleDamage.js';
import { CHARACTER_TEMPLATES, defaultCharacter, OUTFIT_PALETTE } from '../character/options.js';
import { healthColor } from '../ui/Panel.js';

const COUNT = 4; // fighters on the field at once (Quest draw-call budget)
const MAX_ATTACKERS = 2; // how many may wind up a strike at the same time
const ALIEN_SKIN = [0x5fae5a, 0x7a5ad0, 0xc05a4a, 0x3a9ab0, 0xb8a040, 0x8a8f9a];
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

// One Zui warrior. A sparring partner (same AI, blocks, dodges, knockdowns,
// stuns) with its own look and strength, rolled each time it (re)spawns:
// most are far weaker than you, now and then an elite comes close to your
// Power Level. A knockout puts them down for good; another takes their place.
class ZuiFighter extends Sparring {
  constructor(game, horde, idx) {
    super(game);
    this.horde = horde;
    this.idx = idx;
    this.arenaRadius = 29;
    this.respawnT = 0;
    this.deadT = 0;
    this.ratio = 0.1;
    this.pl = 100;
    // Taller bar canvas: name and Power Level over the health bar.
    this.barCanvas.width = 256; this.barCanvas.height = 64;
    this.barTex.dispose();
    this.barTex = new THREE.CanvasTexture(this.barCanvas);
    this.barTex.colorSpace = THREE.SRGBColorSpace;
    this.bar.material.map = this.barTex;
    this.bar.scale.set(0.72, 0.18, 1);
  }

  // Ignores the training difficulty: Zui fighters roll their own strength.
  setLevel() {
    if (!this.avatar) this.buildAvatar();
    this.roll();
  }

  buildAvatar() {
    const t = CHARACTER_TEMPLATES[this.idx % CHARACTER_TEMPLATES.length];
    const ch = { ...defaultCharacter(), ...t.appearance, templateId: t.id };
    this.avatar = createAvatar(ch);
    this.group.add(this.avatar.root);
    this.avatar.setForm('base');
    this.wounds = new BattleDamage(this.avatar.root, this.game, { forward: () => this.group.getWorldDirection(_w), scale: 0.8 });
    this.aura.setStyle({ color: 0xc08aff, core: 0xffffff, scale: 0.7 });
    this.aura.target = 0;
  }

  // New strength, colours and skin for this life.
  roll() {
    const elite = Math.random() < 0.15;
    const r = elite ? rand(0.7, 1.15) : rand(0.03, 0.3);
    this.ratio = r;
    this.elite = elite;
    const you = this.game.progress.powerLevel(this.game.player.form);
    this.pl = Math.max(50, Math.round((you * r) / 10) * 10);
    this.level = {
      id: 'zui', name: elite ? 'Zui Elite' : 'Zui Warrior', hp: Math.round(50 + 230 * r), damage: 2 + 7 * r,
      windup: 1.15 - 0.55 * Math.min(1, r), cooldown: 2.8 - 1.5 * Math.min(1, r), block: 0.05 + 0.35 * Math.min(1, r),
      dodge: 0.03 + 0.3 * Math.min(1, r), blast: 0.2, xp: 0.35 + 0.9 * r, form: 'base',
    };
    this.aura.target = elite ? 0.6 : 0;
    // Alien skin and a random outfit.
    const a = this.avatar;
    const skin = ALIEN_SKIN[Math.floor(Math.random() * ALIEN_SKIN.length)];
    const pal = () => Math.floor(Math.random() * OUTFIT_PALETTE.length);
    const ch = { ...a.character, armorColor: pal(), suitColor: pal(), gloveColor: pal(), bootColor: pal(), beltColor: pal() };
    const tint = () => { a.apply?.(ch); (a.mats?.Skin || a.mats?.skin)?.color.setHex(skin); };
    if (a.ready === false) a.promise?.then(tint); else tint();
    this.barShown = -1;
  }

  reset() {
    super.reset();
    // Arrive somewhere around you rather than right in front.
    const head = this.game.player.headWorld;
    const ang = rand(0, Math.PI * 2);
    const d = rand(8, 12);
    let x = head.x + Math.sin(ang) * d, z = head.z + Math.cos(ang) * d;
    const r = Math.hypot(x, z);
    if (r > this.arenaRadius - 2) { x *= (this.arenaRadius - 2) / r; z *= (this.arenaRadius - 2) / r; }
    this.group.position.set(x, this.player.groundY(), z);
    this.avatar.root.position.y = 0;
    this.deadT = 0;
  }

  // Knocked out: down for good, then they fade away.
  knockDown(hit = null) {
    const g = this.game;
    const dir = hit?.dir || this.group.getWorldDirection(_w).negate();
    const style = hit ? (hit.kind === 'punch' && !hit.finisher && Math.random() < 0.4 ? 'crumple' : Knockdown.pickStyle(hit, 0)) : 'back';
    this.kd.start(dir, 1.1, { lie: 99, size: this.scale, style, health: 0 });
    this.knock.set(0, 0, 0);
    this.enter('down', 0);
    this.fistGlow.material.opacity = 0;
    this.deadT = 0;
    const bonus = (2 + 10 * this.ratio) * g.training.xpMult;
    for (const k of ['strength', 'speed', 'ki', 'stamina']) g.training.sessionXp += g.progress.addXp(k, bonus, 'zui-ko');
    g.effects.number(this.center.clone().add(_v.set(0, 0.5, 0)), 'K.O.!', this.elite ? '#ffb347' : '#ffcc33', true);
    this.horde.onDefeat(this);
  }

  drawBar() {
    const f = clamp(this.health / this.maxHealth, 0, 1);
    const key = f + (this.pl * 1e-9);
    if (Math.abs(key - this.barShown) < 0.004) return;
    this.barShown = key;
    const c = this.barCanvas;
    const x = c.getContext('2d');
    x.clearRect(0, 0, c.width, c.height);
    x.font = 'bold 22px "Trebuchet MS", sans-serif';
    x.textAlign = 'center';
    x.lineWidth = 4;
    x.strokeStyle = 'rgba(0,0,0,0.8)';
    const label = `${this.level.name}  PL ${formatNumber(this.pl)}`;
    x.strokeText(label, 128, 26);
    x.fillStyle = this.elite ? '#ffb347' : '#ffffff';
    x.fillText(label, 128, 26);
    x.fillStyle = 'rgba(10,12,20,0.8)';
    x.fillRect(32, 38, 192, 18);
    x.fillStyle = healthColor(f);
    x.fillRect(34, 40, 188 * f, 14);
    this.barTex.needsUpdate = true;
  }

  get alive() { return this.group.visible && this.state !== 'down'; }

  updateLife(dt) {
    if (!this.group.visible) {
      this.respawnT -= dt;
      if (this.respawnT <= 0 && this.horde.active) { if (!this.avatar) this.buildAvatar(); this.roll(); this.setActive(true); }
      return;
    }
    if (this.state === 'down') {
      this.deadT += dt;
      if (this.deadT > 4.2) { this.setActive(false); this.group.visible = false; this.respawnT = rand(0.8, 2.5); }
    }
  }
}

// The fight on Zui: a few fighters at a time, two at most attacking at once
// while the rest circle and wait their turn; knock one out and another
// arrives. Endless; the KO count shows how you're doing.
export class Horde {
  constructor(game) {
    this.game = game;
    this.fighters = [];
    this.active = false;
    this.kos = 0;
  }

  setActive(v) {
    if (v === this.active) return;
    this.active = v;
    if (v && !this.fighters.length) for (let i = 0; i < COUNT; i++) this.fighters.push(new ZuiFighter(this.game, this, i));
    this.fighters.forEach((f, i) => {
      if (v) {
        f.respawnT = 0.3 + i * 0.9; // arrive one after another
        f.group.visible = false;
      } else {
        f.setActive(false);
        f.group.visible = false;
      }
      f.fistGlow.material.opacity = 0;
    });
    if (v) this.kos = 0;
  }

  onDefeat() {
    this.kos += 1;
    if (this.kos % 10 === 0) bus.emit('hud:message', { text: `${this.kos} Zui warriors defeated!`, color: '#ffcc33', duration: 2.5 });
  }

  update(dt, enemyDt) {
    if (!this.active) return;
    const head = this.game.player.headWorld;
    const live = this.fighters.filter((f) => f.alive);
    // The two closest may fight; the others hang back and circle.
    live.sort((a, b) => a.group.position.distanceToSquared(head) - b.group.position.distanceToSquared(head));
    let attackers = live.filter((f) => ['windup', 'strike', 'blast'].includes(f.state)).length;
    live.forEach((f, i) => {
      const front = i < MAX_ATTACKERS;
      f.wantDist = front ? 1.25 : 3.4 + i * 0.6;
      const busy = ['windup', 'strike', 'blast'].includes(f.state);
      if (!busy && (attackers >= MAX_ATTACKERS || !front)) f.cooldown = Math.max(f.cooldown, 0.35);
      else if (!busy && f.cooldown <= 0) attackers += 1;
    });
    // Keep them from standing inside each other.
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i].group.position, b = live[j].group.position;
        _v.set(a.x - b.x, 0, a.z - b.z);
        const d = _v.length();
        if (d < 1.1 && d > 1e-4) {
          _v.multiplyScalar(((1.1 - d) / d) * 0.5);
          a.add(_v); b.sub(_v);
        }
      }
    }
    for (const f of this.fighters) {
      f.updateLife(dt);
      f.update(enemyDt);
    }
  }
}
