import * as THREE from 'three';
import { bus } from '../core/events.js';
import { rand, damp } from '../core/math.js';
import { Avatar } from '../character/Avatar.js';
import { Aura } from '../fx/Aura.js';
import { BattleDamage } from '../fx/BattleDamage.js';
import { CHARACTER_TEMPLATES, defaultCharacter } from '../character/options.js';
import { glowMaterial } from '../render/toon.js';

// Sparring partner difficulty. Higher levels attack faster, block and dodge
// more, hit harder and give more XP. Master sparring partners go Super Saiyan.
export const SPAR_LEVELS = [
  { id: 'easy', name: 'Easy', template: 'ryuzen', hp: 160, damage: 3, windup: 1.0, cooldown: 2.4, block: 0.1, dodge: 0.05, blast: 0.15, xp: 1, form: 'base' },
  { id: 'normal', name: 'Normal', template: 'kaizen', hp: 240, damage: 5, windup: 0.8, cooldown: 1.7, block: 0.25, dodge: 0.15, blast: 0.25, xp: 1.4, form: 'base' },
  { id: 'hard', name: 'Hard', template: 'vexar', hp: 340, damage: 8, windup: 0.62, cooldown: 1.15, block: 0.4, dodge: 0.3, blast: 0.3, xp: 1.9, form: 'base' },
  { id: 'master', name: 'Master', template: 'toren', hp: 480, damage: 11, windup: 0.5, cooldown: 0.85, block: 0.5, dodge: 0.42, blast: 0.35, xp: 2.6, form: 'ssj1' },
];

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

// A humanoid training partner built on the player's own character rig.
// Non-lethal: they spar, you learn. Punch them (Strength XP), hit them with
// ki (Ki XP), block their punches (Stamina XP) and dodge them (Speed XP).
// Knocking them down wins the round for bonus XP; they get back up.
// In the Time Chamber the partner becomes your own shadow.
export class Sparring {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.name = 'sparring';
    this.group.visible = false;
    game.renderer.scene.add(this.group);
    this.aura = new Aura({ radius: 0.7, height: 2.3 });
    this.group.add(this.aura.group);
    this.fistGlow = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), glowMaterial(0xff3a2a, 0));
    game.renderer.scene.add(this.fistGlow);
    this.level = SPAR_LEVELS[1];
    this.avatar = null;
    this.state = 'idle';
    this.timer = 0;
    this.cooldown = 2;
    this.health = 1;
    this.strafe = 1;
    this.wins = 0;
    this.knock = new THREE.Vector3();
    this.center = new THREE.Vector3();
    this.target = {
      id: 'sparring', team: 'enemy',
      active: () => this.group.visible && this.state !== 'down',
      sphere: () => {
        this.center.copy(this.group.position);
        this.center.y += 1.25 * this.scale;
        return { center: this.center, radius: 0.4 };
      },
      onPunch: (hit) => this.takeHit(hit),
      onBlast: (hit) => this.takeHit(hit),
    };
    this.registered = false;
    this.shadow = false;
  }

  get scale() { return this.avatar ? this.avatar.body.scale.x : 1; }
  get player() { return this.game.player; }

  setLevel(id, shadow = this.shadow) {
    this.level = SPAR_LEVELS.find((l) => l.id === id) || SPAR_LEVELS[1];
    this.shadow = shadow;
    this.buildAvatar();
    this.reset();
  }

  buildAvatar() {
    if (this.avatar) {
      this.group.remove(this.avatar.root);
      this.avatar.dispose();
    }
    let ch;
    if (this.shadow) {
      // Your shadow: your own warrior in dark colors.
      ch = { ...this.game.character, skin: 9, hairColor: 0, eyeColor: 6, armorColor: 1, suitColor: 2, gloveColor: 2, bootColor: 1, beltColor: 0 };
    } else {
      const t = CHARACTER_TEMPLATES.find((x) => x.id === this.level.template) || CHARACTER_TEMPLATES[0];
      ch = { ...defaultCharacter(), ...t.appearance };
    }
    this.avatar = new Avatar(ch);
    this.group.add(this.avatar.root);
    this.avatar.setForm(this.level.form);
    this.wounds = new BattleDamage(this.avatar.root, this.game, { forward: () => this.group.getWorldDirection(_w), scale: 0.8 });
    const auraCol = this.shadow ? 0x6a2aff : this.level.form === 'base' ? 0xbfe6ff : 0xffc21a;
    this.aura.setStyle({ color: auraCol, core: 0xffffff, scale: this.level.form === 'base' ? 0.55 : 1 });
    this.aura.target = this.level.form === 'base' && !this.shadow ? 0 : 0.7;
  }

  setActive(v) {
    this.group.visible = v;
    if (v && !this.avatar) this.setLevel(this.game.progress.data.trainingPrefs.difficulty);
    if (v && !this.registered) { this.game.combat.addTarget(this.target); this.registered = true; }
    if (!v && this.registered) { this.game.combat.removeTarget(this.target); this.registered = false; }
    this.fistGlow.material.opacity = 0;
    if (v) this.reset();
  }

  reset() {
    this.maxHealth = this.level.hp * (this.shadow ? 1.4 : 1);
    this.health = this.maxHealth;
    this.state = 'idle';
    this.timer = 0.5;
    this.cooldown = 2;
    this.knock.set(0, 0, 0);
    this.group.position.set(0, this.player.groundY(), -2.4);
    this.wounds?.reset();
  }

  // ---- Hits -----------------------------------------------------------------------
  takeHit(hit) {
    const g = this.game;
    const L = this.level;
    const xpK = L.xp * g.training.xpMult;
    if (this.state === 'down') return;
    // Dodge incoming ki blasts / block punches based on difficulty.
    if (hit.kind !== 'punch' && hit.kind !== 'beam' && ['idle', 'recover'].includes(this.state) && Math.random() < L.dodge) {
      this.dodge();
      return;
    }
    const facing = this.state === 'block' || (['idle'].includes(this.state) && Math.random() < L.block);
    if (facing && hit.kind === 'punch' && !hit.finisher) {
      this.enter('block', 0.5);
      g.effects.burst(hit.point, 0x4cc3ff, 10, 2, 0.05, 0.3);
      g.effects.number(hit.point.clone().add(_v.set(0, 0.2, 0)), 'BLOCKED', '#4cc3ff');
      g.audio.block();
      this.health = Math.max(1, this.health - hit.damage * 0.15);
      g.training.sessionXp += g.progress.addXp('strength', 1 * xpK, 'spar-blocked');
      return;
    }
    const dmg = hit.damage;
    this.health = Math.max(0, this.health - dmg);
    if (hit.kind !== 'beam' || Math.random() < 0.35) g.effects.number(hit.point.clone().add(_v.set(0, 0.25, 0)), Math.round(dmg), hit.finisher ? '#ffcc33' : '#ffffff', hit.finisher);
    this.wounds.hit(hit.point, hit.dir, this.health / this.maxHealth, hit.power || 0.5);
    _v.copy(hit.dir).setY(0).normalize();
    this.knock.addScaledVector(_v, (hit.kind === 'punch' ? 1 : 0.5) * (0.5 + (hit.power || 0.4)) * (hit.finisher ? 2.5 : 1));
    if (hit.kind === 'punch') {
      g.training.sessionXp += g.progress.addXp('strength', (2 + 3 * hit.power + (hit.finisher ? 4 : 0)) * xpK, 'spar');
      g.progress.data.totalPunches += 1;
    } else if (hit.kind !== 'beam' || Math.random() < 0.2) {
      g.training.sessionXp += g.progress.addXp('ki', (hit.charged ? 4 : 2) * xpK, 'spar-ki');
    }
    if (this.health <= 0) { this.knockDown(); return; }
    if (['windup', 'idle', 'approach'].includes(this.state) && (hit.power > 0.6 || hit.finisher || Math.random() < 0.25)) {
      this.fistGlow.material.opacity = 0;
      this.enter('hitReact', 0.35);
    }
  }

  dodge() {
    const g = this.game;
    const side = Math.random() < 0.5 ? 1 : -1;
    const right = _w.set(1, 0, 0).applyQuaternion(this.group.quaternion);
    this.knock.addScaledVector(right, 3.2 * side);
    g.effects.stream(this.center.clone(), 0xffffff, { vy: 0, spread: 0.3, size: 0.12, life: 0.3 });
    g.audio.whoosh();
    g.effects.number(this.center.clone().add(_v.set(0, 0.5, 0)), 'DODGED', '#aab3d6');
    this.enter('recover', 0.3);
  }

  knockDown() {
    const g = this.game;
    this.enter('down', 3);
    this.fistGlow.material.opacity = 0;
    this.wins += 1;
    const id = (this.shadow ? 'shadow-' : '') + this.level.id;
    g.progress.data.sparWins[id] = (g.progress.data.sparWins[id] || 0) + 1;
    const bonus = 12 * this.level.xp * g.training.xpMult;
    for (const k of ['strength', 'speed', 'ki', 'stamina']) g.training.sessionXp += g.progress.addXp(k, bonus, 'spar-win');
    g.audio.fanfare();
    g.effects.ring(this.group.position.clone().setY(this.group.position.y + 0.05), 0xffcc33, { maxRadius: 4, duration: 0.8 });
    bus.emit('spar:won', { level: this.level, shadow: this.shadow });
  }

  enter(state, t = 0) { this.state = state; this.timer = t; }

  // ---- AI -------------------------------------------------------------------------
  update(dt) {
    if (!this.group.visible || !this.avatar) return;
    const g = this.game;
    const L = this.level;
    const head = this.player.headWorld;
    const pos = this.group.position;
    const toP = _v.set(head.x - pos.x, 0, head.z - pos.z);
    const dist = toP.length();
    toP.normalize();
    this.timer -= dt;
    this.cooldown -= dt;
    this.wounds.update(dt, this.health / this.maxHealth);
    // Face the player
    if (this.state !== 'down') {
      const want = Math.atan2(head.x - pos.x, head.z - pos.z);
      let d = want - this.group.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.group.rotation.y += d * Math.min(1, dt * 7);
    }
    if (this.knock.lengthSq() > 1e-4) {
      pos.addScaledVector(this.knock, dt * 3);
      this.knock.multiplyScalar(Math.exp(-dt * 6));
    }
    pos.y = damp(pos.y, this.player.groundY(), 4, dt);
    // Slow health recovery between exchanges.
    if (this.state !== 'down') this.health = Math.min(this.maxHealth, this.health + dt * 2);

    const guardL = _w.set(0.17, 1.42, 0.3);
    const guardR = new THREE.Vector3(-0.14, 1.36, 0.34);
    const a = this.avatar;
    const pose = (l, r) => {
      a.arms.left.target.lerp(l, Math.min(1, dt * 14));
      a.arms.right.target.lerp(r, Math.min(1, dt * 14));
      a.head.quaternion.identity();
      a.poseArms();
    };
    const breathe = Math.sin(performance.now() * 0.004) * 0.015;
    a.root.rotation.x = 0;
    switch (this.state) {
      case 'idle':
      case 'approach': {
        pose(guardL.clone().setY(1.42 + breathe), guardR.clone().setY(1.36 + breathe));
        const want = 1.25;
        if (dist > want + 0.15) pos.addScaledVector(toP, Math.min(dist - want, 2.4 * dt));
        else if (dist < want - 0.3) pos.addScaledVector(toP, -1.5 * dt);
        // Circle-strafe a little.
        const right = _w.set(toP.z, 0, -toP.x);
        if (Math.random() < 0.005) this.strafe *= -1;
        pos.addScaledVector(right, this.strafe * 0.5 * dt);
        if (this.cooldown <= 0 && this.timer <= 0) this.chooseAttack(dist);
        break;
      }
      case 'windup': {
        // Telegraph: fist pulls back and glows red.
        const back = this.arm === 'left' ? new THREE.Vector3(0.3, 1.38, -0.05) : new THREE.Vector3(-0.3, 1.38, -0.05);
        pose(this.arm === 'left' ? back : guardL, this.arm === 'right' ? back : guardR);
        const f = a.arms[this.arm];
        f.fist.getWorldPosition(this.fistGlow.position);
        this.fistGlow.material.opacity = 0.75 * (1 - this.timer / this.windupTime);
        if (dist > 1.0) pos.addScaledVector(toP, Math.min(dist - 1.0, 2.5 * dt));
        if (this.timer <= 0) this.strike();
        break;
      }
      case 'strike': {
        const out = this.arm === 'left' ? new THREE.Vector3(0.1, 1.5, 0.65) : new THREE.Vector3(-0.1, 1.5, 0.65);
        a.arms[this.arm].target.copy(out);
        pose(this.arm === 'left' ? out : guardL, this.arm === 'right' ? out : guardR);
        if (this.timer <= 0) this.enter('recover', 0.4);
        break;
      }
      case 'blast': {
        const out = new THREE.Vector3(-0.15, 1.45, 0.55);
        pose(guardL, out);
        a.arms.right.fist.getWorldPosition(this.fistGlow.position);
        this.fistGlow.material.color.setHex(0x7fd8ff);
        this.fistGlow.material.opacity = 0.7 * (1 - this.timer / 0.6);
        if (this.timer <= 0) {
          this.fistGlow.material.opacity = 0;
          const origin = this.fistGlow.position.clone();
          const aim = head.clone().add(_w.set(rand(-0.15, 0.15), rand(-0.4, 0), 0));
          g.combat.fire({ origin, dir: aim.sub(origin), speed: 6 + 2 * SPAR_LEVELS.indexOf(L), radius: 0.11, damage: L.damage * 0.7, color: this.shadow ? 0xa04aff : 0x7fd8ff, team: 'enemy', owner: 'sparring' });
          g.audio.kiBlast(0.3, false);
          this.cooldown = L.cooldown;
          this.enter('recover', 0.4);
        }
        break;
      }
      case 'block': {
        pose(new THREE.Vector3(0.1, 1.62, 0.25), new THREE.Vector3(-0.1, 1.62, 0.25));
        if (this.timer <= 0) this.enter('idle', 0.2);
        break;
      }
      case 'hitReact': {
        pose(guardL, guardR);
        a.root.rotation.x = -0.25 * Math.max(0, this.timer / 0.35);
        if (this.timer <= 0) { this.cooldown = Math.max(this.cooldown, 0.5); this.enter('idle', 0.2); }
        break;
      }
      case 'recover': {
        pose(guardL, guardR);
        this.fistGlow.material.opacity = Math.max(0, this.fistGlow.material.opacity - dt * 4);
        if (this.timer <= 0) this.enter('idle', 0.2);
        break;
      }
      case 'down': {
        // Takes a knee, then gets back up for another round.
        a.root.rotation.x = damp(a.root.rotation.x, 0, 4, dt);
        pose(new THREE.Vector3(0.25, 1.0, 0.25), new THREE.Vector3(-0.25, 1.0, 0.25));
        a.root.position.y = damp(a.root.position.y, this.timer > 0.8 ? -0.45 : 0, 4, dt);
        if (this.timer <= 0) {
          a.root.position.y = 0;
          this.health = this.maxHealth;
          this.wounds.reset();
          this.cooldown = 1.5;
          this.enter('idle', 0.5);
          bus.emit('hud:message', { text: 'Your partner gets back up. Round ' + (this.wins + 1) + '!', color: '#ffcc33' });
        }
        break;
      }
      default: break;
    }
    if (this.state !== 'down') a.root.position.y = 0;
    const r = Math.hypot(pos.x, pos.z);
    if (r > 25) { pos.x *= 25 / r; pos.z *= 25 / r; }
    this.aura.update(dt, g.renderer.camera, g.visualIntensity * 0.6);
  }

  chooseAttack(dist) {
    const L = this.level;
    if (dist > 2.5 || Math.random() < L.blast) {
      this.enter('blast', 0.6);
      this.game.audio.warning();
      return;
    }
    this.arm = Math.random() < 0.5 ? 'left' : 'right';
    this.windupTime = L.windup;
    this.fistGlow.material.color.setHex(0xff3a2a);
    this.strikeAt = null;
    this.enter('windup', L.windup);
    this.game.audio.warning();
  }

  strike() {
    const g = this.game;
    const L = this.level;
    this.fistGlow.material.opacity = 0;
    const head = this.player.headWorld;
    // Lands where you are at the end of the windup: step or lean away to dodge.
    const pos = this.group.position;
    const reachPoint = pos.clone().add(_v.set(head.x - pos.x, 0, head.z - pos.z).normalize().multiplyScalar(0.95)).setY(head.y - 0.15);
    const hit = this.player.testMelee(reachPoint, 0.32, L.damage, 'sparring');
    if (!hit) {
      g.effects.number(head.clone().add(this.player.headForward.clone().multiplyScalar(0.7)), 'DODGE!', '#5cff8a');
      g.training.sessionXp += g.progress.addXp('speed', 3 * L.xp * g.training.xpMult, 'spar-dodge');
    }
    g.audio.whoosh();
    this.cooldown = L.cooldown * rand(0.8, 1.2);
    this.enter('strike', 0.2);
  }
}
