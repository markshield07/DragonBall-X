import * as THREE from 'three';
import { bus } from '../core/events.js';
import { clamp, rand } from '../core/math.js';
import { toon, glowMaterial, addOutline } from '../render/toon.js';
import { Dummy } from './Dummy.js';
import { Panel, COLORS } from '../ui/Panel.js';
import { FORMS } from '../progression/forms.js';
import { segmentSphere } from '../combat/Combat.js';
import { Sparring, SPAR_LEVELS } from './Sparring.js';
import { TimeChamber } from '../world/TimeChamber.js';
import { KaliPlanet, ZuiPlanet } from '../world/Planets.js';
import { setGroundOverride } from '../world/terrain.js';
import { Horde } from './Horde.js';
import {
  GRAVITY_LEVELS, TIME_CHAMBER_HOURS_PER_SECOND, KALI_XP, xpToNext, TIME_CHAMBER_MILESTONES, STAT_KEYS,
} from '../progression/Progression.js';

export const ACTIVITIES = [
  { id: 'punch', name: 'Punching Training', stat: 'strength', desc: 'Punch the dummy. Harder punches and combos give more Strength XP. Break it for a bonus!' },
  { id: 'ki', name: 'Ki Training', stat: 'ki', desc: 'Aim at the floating targets and fire ki blasts. Charged blasts and far targets give more Ki XP.' },
  { id: 'speed', name: 'Speed Training', stat: 'speed', desc: 'Punch or touch each orb as it appears. Faster reactions give more Speed XP.' },
  { id: 'defense', name: 'Defensive Training', stat: 'stamina', desc: 'The bot fires energy orbs. Block or dodge them for Stamina XP.' },
  { id: 'transform', name: 'Transformation Training', stat: 'mastery', desc: 'Power up, transform and hold the form. Builds mastery: faster power-ups, less ki drain.', requires: 'ssj1' },
  { id: 'spar', name: 'Sparring Partner', stat: 'all', desc: 'Fight a partner who punches, blocks, dodges and fires ki. Every stat grows. Knock them down for a bonus!' },
];
export { SPAR_LEVELS };

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
    this.sessionXp = 0;
    this.sparring = new Sparring(game);
    this.chamber = new TimeChamber(game.renderer.scene);
    this.kali = new KaliPlanet(game.renderer.scene);
    this.zui = new ZuiPlanet(game.renderer.scene);
    this.horde = new Horde(game);
    this.lastGateZ = 0;
    this.location = 'arena';
    this.strainTimer = 0;
    this.streakTimer = 0;
    this.dummy = new Dummy(game, new THREE.Vector3(0, 0, -1.15));
    this.kiTargets = new KiTargets(game);
    this.speed = new SpeedOrbs(game);
    this.bot = new DefenseBot(game);
    this.transformGoal = { time: 0, transforms: 0 };
    this.sign = new Panel({ width: 1.1, height: 0.7, interactive: false, name: 'trainingSign' });
    this.sign.mesh.position.set(1.9, 1.75, -1.6);
    this.sign.mesh.rotation.y = -0.45;
    game.renderer.scene.add(this.sign.mesh);
    this.sign.setDraw((ui) => this.drawSign(ui));
    this.signTimer = 0;
    this.enabled = false;
    bus.on('xp', () => { this.sign.dirty = true; });
    bus.on('transform:burst', () => { if (this.activity === 'transform') this.transformGoal.transforms += 1; });
  }

  get prefs() { return this.game.progress.data.trainingPrefs; }
  // Gravity: only inside the Time Chamber (at least its own 10x); 1 elsewhere.
  get gravity() { return this.inChamber ? Math.max(10, this.prefs.gravity || 1) : 1; }
  // Gravity felt right now: only while training.
  get activeGravity() { return this.enabled && this.game.state === 'training' ? this.gravity : 1; }
  get inChamber() { return this.location === 'timechamber'; }
  // The planet you're on (King Kali's or Zui), or null at home / in the chamber.
  get realm() { return this.location === 'kali' ? this.kali : this.location === 'zui' ? this.zui : null; }
  // Training Grounds 1x, King Kali's 2x, Time Chamber 4x to 10x by gravity.
  get xpMult() {
    if (this.inChamber) return GRAVITY_LEVELS.find((l) => l.g === this.activeGravity)?.xp || 1;
    return this.location === 'kali' ? KALI_XP : 1;
  }

  setEnabled(v) {
    this.enabled = v;
    if (v) { this.sign.show(); this.setLocation(this.prefs.location, false); this.setActivity(this.activity, false); } else {
      this.sign.hide();
      this.dummy.setVisible(false);
      this.kiTargets.setActive(false);
      this.speed.setActive(false);
      this.bot.setActive(false);
      this.sparring.setActive(false);
      this.setLocation('arena', false, false);
    }
  }

  // Gravity setting (only unlocked levels).
  setGravity(g) {
    if (g > 10 && !this.game.progress.data.gravityUnlocked.includes(g)) return;
    this.prefs.gravity = g;
    const lv = GRAVITY_LEVELS.find((l) => l.g === g);
    bus.emit('hud:message', { text: `Gravity ${g}x (${lv.name}): ${lv.xp}x XP`, color: '#ff6a6a' });
    this.sign.dirty = true;
  }

  setDifficulty(id) {
    this.prefs.difficulty = id;
    if (this.activity === 'spar' && this.enabled) this.sparring.setLevel(id, this.inChamber);
    else this.sparring.level = SPAR_LEVELS.find((l) => l.id === id) || SPAR_LEVELS[1];
    this.sparring.avatarStale = true;
    this.sign.dirty = true;
  }

  // 'arena' (training grounds) or 'timechamber'. remember = store as preference.
  setLocation(loc, announce = true, remember = true) {
    if (loc === 'timechamber' && !this.game.progress.data.timeChamber.unlocked) loc = 'arena';
    if (!['arena', 'timechamber', 'kali', 'zui'].includes(loc)) loc = 'arena';
    if (remember) this.prefs.location = loc;
    const changed = loc !== this.location;
    const wasZui = this.location === 'zui';
    if (changed) this.game.destruction?.clearDebris();
    this.location = loc;
    // Leave any planet first (it restores the outdoor world), then the
    // chamber, then arrive on the new planet (it hides the world again).
    const arena = this.game.arena;
    for (const pl of [this.kali, this.zui]) if (pl.id !== loc) pl.setActive(false, arena);
    this.chamber.setActive(loc === 'timechamber', arena);
    this.realm?.setActive(true, arena);
    setGroundOverride(this.realm ? this.realm.height : null);
    if (loc === 'zui' || wasZui) {
      this.horde.setActive(loc === 'zui' && this.enabled);
      if (this.enabled) this.setActivity(this.activity, false);
    }
    if (changed && this.activity === 'spar' && this.sparring.group.visible) this.sparring.setLevel(this.prefs.difficulty, this.inChamber);
    if (announce && changed) {
      bus.emit('hud:message', {
        timechamber: { text: `Hyperbolic Time Chamber: ${this.gravity}x gravity, ${this.xpMult}x XP. A day passes every 24 seconds.`, color: '#ffffff', duration: 3.5 },
        kali: { text: 'King Kali\'s planet: 10x gravity, 2x XP', color: '#ffd36a', duration: 3.5 },
        zui: { text: 'Planet Zui: warriors are coming for you!', color: '#d08aff', duration: 3.5 },
      }[loc] || { text: 'Back on the training grounds', color: '#aab3d6' });
    }
    this.sign.dirty = true;
  }

  setActivity(id, announce = true) {
    if (!ACTIVITIES.some((a) => a.id === id)) id = 'punch';
    this.activity = id;
    this.sessionXp = 0;
    // On Zui the fight comes to you: no training props.
    const zui = this.location === 'zui';
    if (zui) this.sign.hide(); else if (this.enabled) this.sign.show();
    this.dummy.setVisible(!zui && (id === 'punch' || id === 'transform'));
    this.kiTargets.setActive(!zui && id === 'ki');
    this.speed.setActive(!zui && id === 'speed');
    this.bot.setActive(!zui && id === 'defense');
    if (zui) { this.sparring.setActive(false); this.sign.dirty = true; return; }
    if (id === 'spar') {
      const sp = this.sparring;
      if (!sp.avatar || sp.avatarStale || sp.shadow !== this.inChamber || sp.level.id !== this.prefs.difficulty) {
        sp.avatarStale = false;
        sp.setLevel(this.prefs.difficulty, this.inChamber);
      }
    }
    this.sparring.setActive(id === 'spar');
    if (id === 'transform') this.transformGoal = { time: 0, transforms: 0 };
    this.sign.dirty = true;
    if (announce) {
      const a = ACTIVITIES.find((x) => x.id === id);
      bus.emit('hud:message', { text: a.name, color: '#ffcc33' });
    }
  }

  // dt: real time. enemyDt: slowed by slow motion (enemies only).
  update(dt, enemyDt = dt) {
    this.chamber.update(dt);
    this.kali.update(dt);
    this.zui.update(dt);
    const g = this.game;
    g.arena.gravity = this.enabled && g.state === 'training' && this.gravity > 1 ? Math.min(1, 0.4 + Math.log10(this.gravity) * 0.3) : 0;
    if (!this.enabled) return;
    this.dummy.update(dt);
    this.kiTargets.update(dt);
    this.speed.update(dt);
    this.bot.update(enemyDt);
    this.sparring.update(enemyDt);
    this.horde.update(dt, enemyDt);
    if (g.state === 'training' && !g.menuOpen) this.updatePortals(dt);
    if (g.state === 'training' && !g.menuOpen) {
      this.updateGravity(dt);
      this.updateChamber(dt);
    }
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

  // Walking through the gate on the training grounds offers the planets;
  // the glowing ring behind you on a planet takes you home.
  updatePortals(dt) {
    const g = this.game;
    const head = g.player.headWorld;
    if (this.traveling) return;
    const realm = this.realm;
    if (realm) {
      if (this.location === 'kali') this.kali.updateNpc(dt, head, (text) => bus.emit('hud:message', { text, color: '#ffd36a', duration: 4.5 }));
      const p = realm.portalPos;
      if (Math.hypot(head.x - p.x, head.z - p.z) < 1.6) {
        this.traveling = true;
        g.audio.whoosh?.();
        g.fadeTo(() => { this.setLocation('arena'); g.resetPlayerPosition(); this.traveling = false; });
      }
      return;
    }
    if (this.location !== 'arena') return;
    const z = head.z;
    if (Math.abs(head.x) < 3.4 && this.lastGateZ > -40 && z <= -40 && head.y < 11) g.openPortalMenu();
    this.lastGateZ = z;
  }

  // Heavy gravity: falling pressure streaks, and if you are below the
  // recommended Power Level it strains you (stamina, then some health).
  updateGravity(dt) {
    const g = this.game;
    const grav = this.gravity;
    if (grav <= 1) return;
    const p = g.player;
    this.streakTimer -= dt;
    if (this.streakTimer <= 0) {
      this.streakTimer = 0.05;
      const head = p.headWorld;
      const a = rand(0, Math.PI * 2);
      const r = rand(0.6, 3);
      g.effects.stream(new THREE.Vector3(head.x + Math.cos(a) * r, head.y + rand(0.5, 2), head.z + Math.sin(a) * r), 0xff5a4a, { vy: -5 - grav * 0.05, spread: 0.01, size: 0.025, life: 0.35 });
    }
    const lv = GRAVITY_LEVELS.find((l) => l.g === grav);
    const pl = g.progress.basePowerLevel();
    if (lv?.recommended && pl < lv.recommended) {
      const strain = clamp(1 - pl / lv.recommended, 0.15, 1);
      p.stamina = Math.max(0, p.stamina - 3 * strain * dt);
      if (p.exhausted) p.health = Math.max(g.progress.maxHealth() * 0.15, p.health - 4 * strain * dt);
      this.strainTimer -= dt;
      if (this.strainTimer <= 0) {
        this.strainTimer = 12;
        bus.emit('hud:message', { text: `${grav}x gravity is crushing you! Recommended Power Level ${lv.recommended.toLocaleString('en-US')}`, color: '#ff6a6a', duration: 3 });
      }
    }
  }

  // Simulated days inside the Time Chamber, with milestone rewards.
  updateChamber(dt) {
    if (!this.inChamber) return;
    const g = this.game;
    const tc = g.progress.data.timeChamber;
    const before = Math.floor(tc.seconds * TIME_CHAMBER_HOURS_PER_SECOND / 24);
    tc.seconds += dt;
    const days = Math.floor(tc.seconds * TIME_CHAMBER_HOURS_PER_SECOND / 24);
    if (days !== before) this.sign.dirty = true;
    for (const m of TIME_CHAMBER_MILESTONES) {
      if (days >= m && !tc.milestones.includes(m)) {
        tc.milestones.push(m);
        const xp = 15 + m * 0.6;
        for (const k of STAT_KEYS) g.progress.addXp(k, xp, 'time-chamber');
        bus.emit('timechamber:milestone', { days: m, xp });
      }
    }
  }

  chamberDays() {
    return Math.floor(this.game.progress.data.timeChamber.seconds * TIME_CHAMBER_HOURS_PER_SECOND / 24);
  }

  drawSign(ui) {
    const a = ACTIVITIES.find((x) => x.id === this.activity);
    const p = this.game.progress;
    ui.background();
    ui.text(a.name.toUpperCase(), 40, 80, { size: 50, color: COLORS.gold });
    let y = ui.wrap(a.desc, 40, 135, ui.W - 80, { size: 30, color: COLORS.text });
    y += 10;
    if (a.stat === 'all') {
      const sp = this.sparring;
      ui.text(`${sp.shadow ? 'Your Shadow' : 'Partner'} · ${sp.level.name}`, 40, y + 20, { size: 34, color: COLORS.blue });
      ui.bar(420, y - 8, ui.W - 460, 38, sp.health / (sp.maxHealth || 1), '#ff6a4d', { label: `Round ${sp.wins + 1}` });
      y += 80;
    } else if (a.stat !== 'mastery') {
      const st = p.data.stats[a.stat];
      const need = xpToNext(st.level);
      ui.text(`${a.stat.toUpperCase()} Lv ${st.level}`, 40, y + 20, { size: 34, color: COLORS.blue });
      ui.bar(300, y - 8, ui.W - 340, 38, st.xp / need, '#4cc3ff', { label: `${Math.floor(st.xp)} / ${need} XP` });
      y += 80;
    } else {
      const form = this.game.player.form !== 'base' ? this.game.player.form : p.topForm();
      const m = p.mastery(form);
      ui.text(`${FORMS[form].name} mastery Lv ${m.level}`, 40, y + 20, { size: 34, color: COLORS.gold });
      y += 70;
      ui.text(`Transforms this session: ${this.transformGoal.transforms}`, 40, y, { size: 30 });
      ui.text(`Time in form: ${Math.floor(this.transformGoal.time)}s`, 40, y + 40, { size: 30 });
      y += 80;
    }
    if (this.activity === 'speed') ui.text(`Streak ${this.speed.streak}   Best ${this.speed.best}`, 40, y, { size: 32, color: COLORS.green });
    else ui.text(`Session: +${Math.round(this.sessionXp)} XP`, 40, y, { size: 32, color: COLORS.green });
    const extras = [];
    if (this.gravity > 1) extras.push(`Gravity ${this.gravity}x`);
    if (this.inChamber) extras.push(`Time Chamber · Day ${this.chamberDays()}`);
    if (this.xpMult > 1.01) extras.push(`XP x${this.xpMult.toFixed(1)}`);
    if (extras.length) ui.text(extras.join('  ·  '), 40, y + 44, { size: 28, color: this.gravity > 1 ? COLORS.red : COLORS.gold });
  }
}
