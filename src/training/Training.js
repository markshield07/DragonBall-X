import * as THREE from 'three';
import { bus } from '../core/events.js';
import { clamp, rand } from '../core/math.js';
import { toon, glowMaterial, addOutline } from '../render/toon.js';
import { Dummy } from './Dummy.js';
import { Panel, COLORS } from '../ui/Panel.js';
import { segmentSphere } from '../combat/Combat.js';

export const ACTIVITIES = [
  { id: 'punch', name: 'Punching Training', stat: 'strength', desc: 'Punch the dummy. Harder punches and combos give more Strength XP. Break it for a bonus!' },
  { id: 'ki', name: 'Ki Training', stat: 'ki', desc: 'Aim at the floating targets and fire ki blasts. Charged blasts and far targets give more Ki XP.' },
  { id: 'speed', name: 'Speed Training', stat: 'speed', desc: 'Punch or touch each orb as it appears. Faster reactions give more Speed XP.' },
  { id: 'defense', name: 'Defensive Training', stat: 'stamina', desc: 'The bot fires energy orbs. Block (left grip / Q) or dodge them for Stamina XP.' },
  { id: 'transform', name: 'Transformation Training', stat: 'mastery', desc: 'Power up, transform and hold the form. Builds mastery: faster power-ups, less ki drain.', requires: 'ssj1' },
];

const _v = new THREE.Vector3();

// ---- Ki targets -------------------------------------------------------------
class KiTargets {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.targets = [];
    const ringMat = toon(0xffcc33, { emissive: 0x442200 });
    for (let i = 0; i < 5; i++) {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.06, 8, 24), ringMat);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.38, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
      const bull = new THREE.Mesh(new THREE.CircleGeometry(0.16, 20), new THREE.MeshBasicMaterial({ color: 0xff4a2a, side: THREE.DoubleSide }));
      bull.position.z = 0.01;
      addOutline(ring, 0.05);
      g.add(ring, disc, bull);
      this.group.add(g);
      const t = {
        mesh: g, base: new THREE.Vector3(), phase: rand(0, 6), respawn: 0, alive: true,
        target: null,
      };
      t.target = {
        id: `kitarget${i}`, team: 'enemy',
        active: () => this.group.visible && t.alive,
        sphere: () => ({ center: g.position, radius: 0.45 }),
        onBlast: (hit) => this.hit(t, hit),
        onPunch: () => {},
      };
      this.place(t);
      this.targets.push(t);
    }
    game.renderer.scene.add(this.group);
    this.group.visible = false;
    this.registered = false;
  }

  place(t) {
    const a = rand(-0.9, 0.9);
    const d = rand(6, 13);
    t.base.set(Math.sin(a) * d, rand(1.0, 3.2), -Math.cos(a) * d);
    t.mesh.position.copy(t.base);
    t.mesh.lookAt(0, 1.5, 0);
    t.alive = true;
    t.mesh.visible = true;
    t.mesh.scale.setScalar(0.01);
  }

  hit(t, hit) {
    const g = this.game;
    t.alive = false;
    t.respawn = 0.8;
    t.mesh.visible = false;
    const dist = t.mesh.position.length();
    const xp = (hit.charged ? 7 : 3) + dist * 0.25;
    g.training.sessionXp += g.progress.addXp('ki', xp * g.training.xpMult, 'ki-target');
    g.effects.burst(t.mesh.position, 0xffcc33, 24, 4, 0.09, 0.7);
    g.effects.number(t.mesh.position.clone(), `+${Math.round(xp)} KI`, '#7fd8ff');
    g.audio.targetHit(1 + Math.random() * 0.2);
  }

  setActive(v) {
    this.group.visible = v;
    for (const t of this.targets) {
      if (v) this.game.combat.addTarget(t.target);
      else this.game.combat.removeTarget(t.target);
    }
  }

  update(dt) {
    if (!this.group.visible) return;
    const lv = this.game.progress.level('ki');
    const moveAmp = 0.4 + Math.min(2, lv * 0.15);
    for (const t of this.targets) {
      if (!t.alive) {
        t.respawn -= dt;
        if (t.respawn <= 0) this.place(t);
        continue;
      }
      t.phase += dt;
      t.mesh.position.set(t.base.x + Math.sin(t.phase * 0.7) * moveAmp, t.base.y + Math.sin(t.phase * 1.3) * 0.25, t.base.z);
      const s = t.mesh.scale.x;
      if (s < 1) t.mesh.scale.setScalar(Math.min(1, s + dt * 4));
    }
  }
}

// ---- Speed orbs ---------------------------------------------------------------
class SpeedOrbs {
  constructor(game) {
    this.game = game;
    this.mat = glowMaterial(0x5cff8a, 0.9);
    this.orb = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 12), this.mat);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.01, 6, 24), glowMaterial(0xffffff, 0.7));
    this.orb.add(ring);
    this.ring = ring;
    this.orb.visible = false;
    game.renderer.scene.add(this.orb);
    this.active = false;
    this.timer = 0;
    this.window = 2;
    this.gap = 0;
    this.streak = 0;
    this.best = 0;
    this.prevHand = { left: new THREE.Vector3(), right: new THREE.Vector3() };
  }

  setActive(v) {
    this.active = v;
    this.orb.visible = false;
    this.gap = 0.8;
    this.streak = 0;
  }

  spawn() {
    const g = this.game;
    const head = g.player.headWorld;
    const fwd = g.player.flatForward(_v.clone());
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    // Within comfortable arm's reach in front of the player; no extreme swings.
    const desktop = !g.isXR;
    const side = desktop ? rand(-0.12, 0.12) : rand(-0.38, 0.38);
    const up = desktop ? rand(-0.12, 0.06) : rand(-0.4, 0.1);
    const dist = desktop ? rand(0.72, 0.8) : rand(0.42, 0.58);
    if (desktop) {
      // desktop fists punch along the view direction, so place orbs around the crosshair
      const f3 = g.player.headForward.clone();
      this.orb.position.copy(head).addScaledVector(f3, dist).addScaledVector(right, side).add(new THREE.Vector3(0, up, 0));
    } else {
      this.orb.position.copy(head).addScaledVector(fwd, dist).addScaledVector(right, side).add(new THREE.Vector3(0, up, 0));
    }
    this.orb.visible = true;
    this.orb.scale.setScalar(0.3);
    for (const side of ['left', 'right']) this.prevHand[side].copy(g.hands.hands[side].worldPos);
    const lv = g.progress.level('speed');
    this.window = clamp(2.4 - 0.1 * (lv - 1), 0.9, 2.4);
    this.timer = 0;
  }

  update(dt) {
    if (!this.active) return;
    const g = this.game;
    if (!this.orb.visible) {
      this.gap -= dt;
      if (this.gap <= 0) this.spawn();
      return;
    }
    this.timer += dt;
    const k = this.timer / this.window;
    this.orb.scale.setScalar(Math.min(1, this.orb.scale.x + dt * 6));
    this.ring.scale.setScalar(1 + (1 - k) * 0.8);
    this.mat.color.setHSL(0.36 - 0.36 * k, 1, 0.6);
    this.ring.lookAt(g.player.headWorld);
    for (const side of ['left', 'right']) {
      const h = g.hands.hands[side];
      if (!h.group.visible) continue;
      const prev = this.prevHand[side];
      const touched = segmentSphere(prev, h.worldPos, this.orb.position, 0.15);
      prev.copy(h.worldPos);
      if (touched) {
        const reaction = 1 - k;
        const xp = 2 + 5 * reaction + Math.min(5, this.streak * 0.5);
        g.training.sessionXp += g.progress.addXp('speed', xp * g.training.xpMult, 'speed');
        this.streak += 1;
        this.best = Math.max(this.best, this.streak);
        g.effects.burst(this.orb.position, 0x5cff8a, 16, 2.5, 0.05, 0.4);
        g.effects.number(this.orb.position.clone().add(new THREE.Vector3(0, 0.12, 0)), `${Math.round(this.timer * 1000)}ms`, '#5cff8a');
        g.audio.targetHit(1.2 + Math.min(0.6, this.streak * 0.04));
        g.haptic(side, 0.5, 40);
        this.orb.visible = false;
        this.gap = 0.25;
        return;
      }
    }
    if (k >= 1) {
      this.streak = 0;
      this.orb.visible = false;
      this.gap = 0.6;
      g.effects.burst(this.orb.position, 0xff4d4d, 8, 1, 0.04, 0.3);
    }
  }
}

// ---- Defense bot --------------------------------------------------------------
class DefenseBot {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 12), toon(0x9aa5c4));
    addOutline(body, 0.04);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), new THREE.MeshBasicMaterial({ color: 0xff3a3a }));
    eye.position.z = 0.28;
    this.eye = eye;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.04, 6, 24), toon(0x5a6488));
    ring.rotation.x = Math.PI / 2;
    this.group.add(body, eye, ring);
    this.group.visible = false;
    game.renderer.scene.add(this.group);
    this.timer = 2;
    this.telegraph = 0;
    this.phase = 0;
    this.shots = new Set();
  }

  setActive(v) {
    this.group.visible = v;
    this.timer = 2;
    this.telegraph = 0;
    if (!v) this.game.combat.clearProjectiles('enemy');
  }

  update(dt) {
    if (!this.group.visible) return;
    const g = this.game;
    this.phase += dt;
    const head = g.player.headWorld;
    this.group.position.set(Math.sin(this.phase * 0.5) * 2.5, 1.8 + Math.sin(this.phase * 1.1) * 0.3, -6.5);
    this.group.lookAt(head);
    if (this.telegraph > 0) {
      this.telegraph -= dt;
      this.eye.scale.setScalar(1 + (0.6 - this.telegraph) * 1.5);
      if (this.telegraph <= 0) this.shoot();
    } else {
      this.timer -= dt;
      this.eye.scale.setScalar(1);
      if (this.timer <= 0) {
        this.telegraph = 0.6;
        g.audio.warning();
      }
    }
    // Track projectiles that went past the player = dodged.
    for (const p of this.shots) {
      if (!g.combat.projectiles.includes(p)) { this.shots.delete(p); continue; }
      const toPlayer = _v.subVectors(head, p.mesh.position);
      if (toPlayer.dot(p.vel) < 0 && !p.dodgeCounted) {
        p.dodgeCounted = true;
        if (p.mesh.position.distanceTo(head) < 1.5) {
          g.training.sessionXp += g.progress.addXp('stamina', 4 * g.training.xpMult, 'dodge');
          g.effects.number(head.clone().add(g.player.headForward.clone().multiplyScalar(0.8)), 'DODGE!', '#5cff8a');
        }
        this.shots.delete(p);
      }
    }
  }

  shoot() {
    const g = this.game;
    const lv = g.progress.level('stamina');
    const aim = g.player.headWorld.clone().add(new THREE.Vector3(rand(-0.15, 0.15), rand(-0.45, 0.05), 0));
    const origin = this.eye.getWorldPosition(new THREE.Vector3());
    const dir = aim.sub(origin).normalize();
    const speed = 4 + Math.min(4, lv * 0.35);
    const p = g.combat.fire({ origin, dir, speed, radius: 0.12, damage: 4, color: 0xff5a5a, team: 'enemy', owner: 'bot' });
    this.shots.add(p);
    this.timer = clamp(2.2 - lv * 0.08, 0.9, 2.2);
  }
}

// ---- Training manager -----------------------------------------------------------
export class Training {
  constructor(game) {
    this.game = game;
    this.activity = 'punch';
    this.gravity = 1; // Gravity chamber arrives in Phase 2; the multiplier is already wired in.
    this.sessionXp = 0;
    this.dummy = new Dummy(game, new THREE.Vector3(0, 0, -1.15));
    this.kiTargets = new KiTargets(game);
    this.speed = new SpeedOrbs(game);
    this.bot = new DefenseBot(game);
    this.transformGoal = { time: 0, transforms: 0 };
    this.sign = new Panel({ width: 1.1, height: 0.62, interactive: false, name: 'trainingSign' });
    this.sign.mesh.position.set(1.9, 1.75, -1.6);
    this.sign.mesh.rotation.y = -0.45;
    game.renderer.scene.add(this.sign.mesh);
    this.sign.setDraw((ui) => this.drawSign(ui));
    this.signTimer = 0;
    this.enabled = false;
    bus.on('xp', () => { this.sign.dirty = true; });
    bus.on('transform:burst', () => { if (this.activity === 'transform') this.transformGoal.transforms += 1; });
  }

  get xpMult() { return this.gravity === 1 ? 1 : 1 + Math.log10(this.gravity) * 1.5; }

  setEnabled(v) {
    this.enabled = v;
    if (v) { this.sign.show(); this.setActivity(this.activity, false); } else {
      this.sign.hide();
      this.dummy.setVisible(false);
      this.kiTargets.setActive(false);
      this.speed.setActive(false);
      this.bot.setActive(false);
    }
  }

  setActivity(id, announce = true) {
    this.activity = id;
    this.sessionXp = 0;
    this.dummy.setVisible(id === 'punch' || id === 'transform');
    this.kiTargets.setActive(id === 'ki');
    this.speed.setActive(id === 'speed');
    this.bot.setActive(id === 'defense');
    if (id === 'transform') this.transformGoal = { time: 0, transforms: 0 };
    this.sign.dirty = true;
    if (announce) {
      const a = ACTIVITIES.find((x) => x.id === id);
      bus.emit('hud:message', { text: a.name, color: '#ffcc33' });
    }
  }

  update(dt) {
    if (!this.enabled) return;
    this.dummy.update(dt);
    this.kiTargets.update(dt);
    this.speed.update(dt);
    this.bot.update(dt);
    if (this.activity === 'transform' && this.game.player.form !== 'base') {
      this.transformGoal.time += dt;
      this.signTimer -= dt;
      if (this.signTimer <= 0) { this.signTimer = 0.5; this.sign.dirty = true; }
    }
    if (this.activity === 'speed') {
      this.signTimer -= dt;
      if (this.signTimer <= 0) { this.signTimer = 0.4; this.sign.dirty = true; }
    }
    this.sign.update();
  }

  drawSign(ui) {
    const a = ACTIVITIES.find((x) => x.id === this.activity);
    const p = this.game.progress;
    ui.background();
    ui.text(a.name.toUpperCase(), 40, 80, { size: 50, color: COLORS.gold });
    let y = ui.wrap(a.desc, 40, 135, ui.W - 80, { size: 30, color: COLORS.text });
    y += 10;
    if (a.stat !== 'mastery') {
      const st = p.data.stats[a.stat];
      const need = 40 + 15 * st.level;
      ui.text(`${a.stat.toUpperCase()} Lv ${st.level}`, 40, y + 20, { size: 34, color: COLORS.blue });
      ui.bar(300, y - 8, ui.W - 340, 38, st.xp / need, '#4cc3ff', { label: `${Math.floor(st.xp)} / ${need} XP` });
      y += 80;
    } else {
      const m = p.mastery('ssj1');
      ui.text(`Super Saiyan mastery Lv ${m.level}`, 40, y + 20, { size: 34, color: COLORS.gold });
      y += 70;
      ui.text(`Transforms this session: ${this.transformGoal.transforms}`, 40, y, { size: 30 });
      ui.text(`Time in form: ${Math.floor(this.transformGoal.time)}s`, 40, y + 40, { size: 30 });
      y += 80;
    }
    if (this.activity === 'speed') ui.text(`Streak ${this.speed.streak}   Best ${this.speed.best}`, 40, y, { size: 32, color: COLORS.green });
    else ui.text(`Session: +${Math.round(this.sessionXp)} XP`, 40, y, { size: 32, color: COLORS.green });
  }
}
