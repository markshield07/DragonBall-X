import * as THREE from 'three';
import { bus } from '../core/events.js';
import { clamp, rand, damp } from '../core/math.js';
import { toon, toonUnique, addOutline, glowMaterial } from '../render/toon.js';
import { Aura } from '../fx/Aura.js';

// Boss catalogue: all five villains are defined so the progression screen can
// show what's coming. Only Raxor is playable in Phase 1.
export const BOSSES = [
  { id: 'raxor', name: 'Raxor', title: 'Aggressive Alien Fighter', powerLevel: 18000, maxHealth: 420, available: true },
  { id: 'veyron', name: 'Lord Veyron', title: 'Commander of Purple Ki', powerLevel: 900000, maxHealth: 1400, available: false, phase: 2 },
  { id: 'kurog', name: 'Titan Kurog', title: 'Colossal Warrior', powerLevel: 3500000, maxHealth: 2600, available: false, phase: 2 },
  { id: 'zareth', name: 'Emperor Zareth', title: 'Cosmic Teleporter', powerLevel: 40000000, maxHealth: 4000, available: false, phase: 3 },
  { id: 'draykon', name: 'Omega Draykon', title: 'The Ultimate Enemy', powerLevel: 900000000, maxHealth: 8000, available: false, phase: 3 },
];

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

// Raxor: punches, dashes and basic energy attacks. Phase 2 (below 50%) adds
// a charged mega blast and faster attacks. Every attack has a clear telegraph
// (glowing fist / hands + warning sound + text), so fights are about reading
// and reacting, not surprise damage.
//
// Damage scales with the Power Level gap (player PL vs 18,000) but the boss
// itself never scales up with the player, so training is felt directly.
export class Raxor {
  constructor(game) {
    this.game = game;
    this.def = BOSSES[0];
    this.group = new THREE.Group();
    this.group.name = 'raxor';
    this.build();
    this.group.visible = false;
    game.renderer.scene.add(this.group);
    this.active = false;
    this.state = 'inactive';
    this.health = this.def.maxHealth;
    this.velocity = new THREE.Vector3();
    this.knock = new THREE.Vector3();
    this.timer = 0;
    this.cooldown = 2;
    this.phase = 1;
    this.chest = new THREE.Vector3();
    this.target = {
      id: 'raxor', team: 'enemy',
      active: () => this.active && this.state !== 'intro' && this.state !== 'defeated',
      sphere: () => {
        this.torso.getWorldPosition(this.chest);
        return { center: this.chest, radius: 0.5 };
      },
      onPunch: (hit) => this.takeHit(hit),
      onBlast: (hit) => this.takeHit(hit),
    };
    this.aura = new Aura({ radius: 0.85, height: 2.8 });
    this.aura.setStyle({ color: 0xff4a6a, core: 0xffc0d0, scale: 1 });
    this.group.add(this.aura.group);
  }

  build() {
    const skin = toon(0x3fae9a);
    const armor = toon(0x9e1f2a);
    const dark = toon(0x2a1a2e);
    this.fistMat = toonUnique(0x3fae9a);
    const body = new THREE.Group();
    this.body = body;
    this.group.add(body);
    const S = 1.18; // Raxor is bigger than the player
    body.scale.setScalar(S);
    const add = (geo, mat, x, y, z, outline = 0.04) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      body.add(m);
      if (outline) addOutline(m, outline);
      return m;
    };
    // Legs
    for (const s of [-1, 1]) {
      add(new THREE.CapsuleGeometry(0.09, 0.42, 4, 8), dark, 0.13 * s, 0.68, 0);
      add(new THREE.CapsuleGeometry(0.08, 0.38, 4, 8), dark, 0.13 * s, 0.28, 0);
      add(new THREE.BoxGeometry(0.15, 0.14, 0.28), armor, 0.13 * s, 0.07, 0.04);
    }
    add(new THREE.CapsuleGeometry(0.17, 0.1, 4, 10), dark, 0, 0.98, 0);
    this.torso = add(new THREE.CapsuleGeometry(0.2, 0.3, 4, 12), skin, 0, 1.3, 0);
    this.torso.scale.set(1.35, 1, 0.8);
    // Armor chest plate + shoulder spikes
    const plate = add(new THREE.CapsuleGeometry(0.21, 0.24, 4, 12), armor, 0, 1.33, 0.02);
    plate.scale.set(1.38, 1, 0.82);
    for (const s of [-1, 1]) {
      add(new THREE.SphereGeometry(0.13, 10, 8), armor, 0.33 * s, 1.5, 0);
      const spike = add(new THREE.ConeGeometry(0.05, 0.22, 6), toon(0xe8e0d0), 0.38 * s, 1.63, 0, 0.06);
      spike.rotation.z = -0.5 * s;
    }
    // Head with horns and glowing eyes
    const head = new THREE.Group();
    head.position.set(0, 1.78, 0);
    body.add(head);
    this.head = head;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), skin);
    skull.scale.set(0.95, 1.1, 1);
    head.add(skull);
    addOutline(skull, 0.05);
    for (const s of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.26, 6), toon(0xe8e0d0));
      horn.position.set(0.08 * s, 0.14, -0.02);
      horn.rotation.set(-0.5, 0, -0.45 * s);
      head.add(horn);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
      eye.scale.set(1.4, 0.7, 0.5);
      eye.position.set(0.055 * s, 0.01, 0.135);
      head.add(eye);
    }
    const crest = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 4), armor);
    crest.position.set(0, 0.12, -0.06);
    crest.rotation.x = -0.9;
    head.add(crest);
    // Arms (long, with big fists)
    this.arms = {};
    for (const [side, s] of [['left', 1], ['right', -1]]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(0.36 * s, 1.47, 0);
      body.add(shoulder);
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.3, 4, 8), skin);
      upper.position.y = -0.2;
      shoulder.add(upper);
      addOutline(upper, 0.05);
      const elbow = new THREE.Group();
      elbow.position.y = -0.38;
      shoulder.add(elbow);
      const lower = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.28, 4, 8), skin);
      lower.position.y = -0.18;
      elbow.add(lower);
      addOutline(lower, 0.05);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.1, 10), armor);
      band.position.y = -0.24;
      elbow.add(band);
      const fist = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), this.fistMat);
      fist.position.y = -0.4;
      elbow.add(fist);
      addOutline(fist, 0.05);
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), glowMaterial(0xff3a2a, 0));
      glow.position.y = -0.4;
      elbow.add(glow);
      this.arms[side] = { shoulder, elbow, fist, glow };
    }
    // Health bar above head
    this.barCanvas = document.createElement('canvas');
    this.barCanvas.width = 512; this.barCanvas.height = 96;
    this.barTex = new THREE.CanvasTexture(this.barCanvas);
    this.barTex.colorSpace = THREE.SRGBColorSpace;
    this.bar = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.barTex, depthTest: false, transparent: true }));
    this.bar.scale.set(1.4, 0.26, 1);
    this.bar.position.y = 2.75;
    this.bar.renderOrder = 25;
    this.group.add(this.bar);
    // Big blast charge sphere (phase 2)
    this.megaOrb = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), glowMaterial(0xff4a1a, 0.85));
    this.megaOrb.visible = false;
    this.group.add(this.megaOrb);
    // Strike warning disc on the ground
    this.warnDisc = new THREE.Mesh(new THREE.CircleGeometry(0.8, 24), new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0, depthWrite: false }));
    this.warnDisc.rotation.x = -Math.PI / 2;
    this.warnDisc.renderOrder = 4;
    this.game.renderer.scene.add(this.warnDisc);
  }

  get player() { return this.game.player; }

  // ---- Lifecycle ---------------------------------------------------------------
  start() {
    this.active = true;
    this.health = this.def.maxHealth;
    this.phase = 1;
    this.state = 'intro';
    this.timer = 0;
    this.cooldown = 2.2;
    this.knock.set(0, 0, 0);
    this.group.visible = true;
    this.group.position.set(0, 9, -28);
    this.group.rotation.set(0, 0, 0);
    this.group.scale.setScalar(1);
    this.aura.target = 0.6;
    this.megaOrb.visible = false;
    this.arms.left.glow.material.opacity = 0;
    this.arms.right.glow.material.opacity = 0;
    this.game.combat.addTarget(this.target);
    this.drawBar();
    this.startPL = this.game.currentPowerLevel();
    this.game.audio.bossRoar();
  }

  stop() {
    this.active = false;
    this.state = 'inactive';
    this.group.visible = false;
    this.warnDisc.material.opacity = 0;
    this.game.combat.removeTarget(this.target);
    this.game.combat.clearProjectiles('enemy');
  }

  powerRatio() { return this.game.currentPowerLevel() / this.def.powerLevel; }
  // How hard the player's attacks land (0.55x at the start .. 1.6x when far stronger).
  playerDamageScale() { return clamp(Math.pow(this.powerRatio(), 0.25), 0.55, 1.6); }
  // How hard Raxor's attacks land on the player.
  bossDamageScale() { return clamp(Math.pow(1 / this.powerRatio(), 0.2), 0.45, 1.4); }

  say(text, color = '#ff8a8a') { bus.emit('hud:message', { text: `Raxor: ${text}`, color, duration: 3 }); }

  // ---- Damage ---------------------------------------------------------------------
  takeHit(hit) {
    if (this.state === 'defeated' || this.state === 'intro') return;
    const g = this.game;
    const dmg = hit.damage * this.playerDamageScale();
    this.health = Math.max(0, this.health - dmg);
    this.drawBar();
    g.effects.number(hit.point.clone().add(new THREE.Vector3(0, 0.3, 0)), Math.round(dmg), hit.finisher || hit.charged ? '#ffcc33' : '#ffffff', hit.finisher);
    // Knockback scales with how much stronger the player is.
    const ratio = this.powerRatio();
    const strong = hit.finisher || hit.charged || (hit.power > 0.7 && ratio > 1);
    const kb = (hit.kind === 'blast' ? 0.6 : 1) * (0.4 + hit.power) * clamp(Math.log10(ratio * 10 + 1), 0.25, 2.2);
    _v.copy(hit.dir).setY(0).normalize();
    this.knock.addScaledVector(_v, kb * (strong ? 3 : 1.2));
    if (strong && ratio > 1) {
      g.effects.crack(this.group.position.clone(), 1.6 + hit.power);
      g.effects.ring(this.group.position.clone().setY(0.05), 0xffffff, { maxRadius: 3, duration: 0.5, opacity: 0.5 });
    }
    if (hit.kind === 'punch') g.progress.addXp('strength', 2 + 2 * hit.power, 'boss');
    else g.progress.addXp('ki', hit.charged ? 3 : 1, 'boss');
    // Interrupt attacks on heavy hits (stagger). Much easier when stronger.
    const staggerChance = strong ? 0.9 : clamp(0.08 * ratio, 0.03, 0.6);
    if (['windup', 'approach', 'volleyCharge', 'idle'].includes(this.state) && Math.random() < staggerChance) {
      this.enter('stagger', 0.45 + (strong ? 0.35 : 0));
      if (strong && ratio > 3 && Math.random() < 0.3) this.say(['Ngh! How are you this strong?!', 'Impossible…!', 'That power… it can\'t be!'][Math.floor(Math.random() * 3)]);
    }
    if (this.phase === 1 && this.health < this.def.maxHealth * 0.5) {
      this.phase = 2;
      this.aura.setStyle({ color: 0xc02aff, core: 0xff9ae0, scale: 1.3 });
      this.aura.target = 1;
      this.say('Enough games! Feel my REAL power!');
      g.audio.bossRoar();
      this.enter('roar', 1.2);
    }
    if (this.health <= 0) this.defeat();
  }

  defeat() {
    const g = this.game;
    this.enter('defeated', 3.5);
    this.say(this.powerRatio() > 2 ? 'I… lost… to a Super Saiyan…' : 'This… isn\'t… over…', '#ffb0b0');
    g.combat.clearProjectiles('enemy');
    this.aura.target = 0;
    this.warnDisc.material.opacity = 0;
    g.effects.burst(this.chest.clone(), 0xffffff, 50, 6, 0.12, 1.2);
    g.effects.ring(this.group.position.clone().setY(0.05), 0xffcc33, { maxRadius: 10, duration: 1.2 });
    g.audio.explosion(1);
    bus.emit('boss:defeated', { id: this.def.id });
  }

  enter(state, time = 0) {
    this.state = state;
    this.timer = time;
  }

  // ---- AI -------------------------------------------------------------------------
  update(dt) {
    if (!this.active) return;
    const g = this.game;
    const head = this.player.headWorld;
    const pos = this.group.position;
    const toPlayer = _v.set(head.x - pos.x, 0, head.z - pos.z);
    const dist = toPlayer.length();
    toPlayer.normalize();
    const fast = this.phase === 2 ? 1.35 : 1;
    this.timer -= dt;
    this.cooldown -= dt;

    // Face the player (smoothly)
    if (this.state !== 'defeated') {
      const want = Math.atan2(head.x - pos.x, head.z - pos.z);
      let d = want - this.group.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.group.rotation.y += d * Math.min(1, dt * 6);
    }

    // Knockback slide
    if (this.knock.lengthSq() > 1e-4) {
      pos.addScaledVector(this.knock, dt * 3);
      this.knock.multiplyScalar(Math.exp(-dt * 5));
    }

    const arms = this.arms;
    const restArms = (k = 1) => {
      arms.left.shoulder.rotation.x = damp(arms.left.shoulder.rotation.x, -0.3, 8 * k, dt);
      arms.right.shoulder.rotation.x = damp(arms.right.shoulder.rotation.x, -0.3, 8 * k, dt);
      arms.left.elbow.rotation.x = damp(arms.left.elbow.rotation.x, -1.2, 8 * k, dt);
      arms.right.elbow.rotation.x = damp(arms.right.elbow.rotation.x, -1.2, 8 * k, dt);
    };
    const bob = Math.sin(performance.now() * 0.005) * 0.02;

    switch (this.state) {
      case 'intro': {
        // Fly in from the gate, land with a shockwave.
        const target = _w.set(0, 0, -4.5);
        pos.lerp(target, Math.min(1, dt * 1.4));
        this.body.rotation.x = 0.3;
        if (pos.distanceTo(target) < 0.15) {
          pos.copy(target);
          this.body.rotation.x = 0;
          g.effects.ring(pos.clone().setY(0.05), 0xff4a6a, { maxRadius: 8, duration: 0.9 });
          g.effects.crack(pos, 2.4);
          g.audio.explosion(0.7);
          if (this.startPL > this.def.powerLevel * 3) this.say('Wh-what is this power level?! Impossible!', '#ffb0b0');
          else if (this.startPL > this.def.powerLevel) this.say('Hmph. You\'ve gotten stronger. It won\'t matter!');
          else this.say('You call that power? I\'ll crush you, weakling!');
          bus.emit('boss:engaged', {});
          this.enter('idle', 0.8);
        }
        break;
      }
      case 'idle':
      case 'approach': {
        restArms();
        this.body.position.y = bob;
        const want = 1.35;
        if (dist > want + 0.2) {
          pos.addScaledVector(toPlayer, Math.min(dist - want, 2.6 * fast * dt));
          this.state = 'approach';
        } else if (dist < want - 0.4) pos.addScaledVector(toPlayer, -1.5 * dt);
        if (this.cooldown <= 0 && this.timer <= 0) this.chooseAttack(dist);
        break;
      }
      case 'windup': {
        // Telegraph: fist pulled back and glowing red, red warning disc at the player's feet.
        const arm = arms[this.attackArm];
        arm.shoulder.rotation.x = damp(arm.shoulder.rotation.x, 0.9, 10, dt);
        arm.elbow.rotation.x = damp(arm.elbow.rotation.x, -2.0, 10, dt);
        arm.glow.material.opacity = 0.7 * (1 - this.timer / this.windupTime);
        this.warnDisc.position.set(head.x, 0.03, head.z);
        this.warnDisc.material.opacity = 0.45 * (1 - this.timer / this.windupTime);
        // Lunge toward the player during the windup
        if (dist > 1.1) pos.addScaledVector(toPlayer, Math.min(dist - 1.1, 3 * dt));
        if (this.timer <= 0) this.strike();
        break;
      }
      case 'recover': {
        restArms(0.6);
        this.warnDisc.material.opacity = Math.max(0, this.warnDisc.material.opacity - dt * 3);
        arms.left.glow.material.opacity = arms.right.glow.material.opacity = 0;
        if (this.timer <= 0) this.enter('idle', 0.2);
        break;
      }
      case 'retreat': {
        restArms();
        if (dist < 6) pos.addScaledVector(toPlayer, -5 * dt);
        if (this.timer <= 0 || dist >= 6) this.enter('volleyCharge', 0.9 / fast);
        break;
      }
      case 'volleyCharge': {
        // Both hands forward, orange energy gathering = warning.
        arms.left.shoulder.rotation.x = damp(arms.left.shoulder.rotation.x, -1.5, 8, dt);
        arms.right.shoulder.rotation.x = damp(arms.right.shoulder.rotation.x, -1.5, 8, dt);
        arms.left.elbow.rotation.x = damp(arms.left.elbow.rotation.x, 0, 8, dt);
        arms.right.elbow.rotation.x = damp(arms.right.elbow.rotation.x, 0, 8, dt);
        const k = 1 - this.timer / (0.9 / fast);
        arms.left.glow.material.color.setHex(0xff9a1a);
        arms.right.glow.material.color.setHex(0xff9a1a);
        arms.left.glow.material.opacity = arms.right.glow.material.opacity = 0.8 * k;
        if (this.timer <= 0) { this.shotsLeft = this.phase === 2 ? 4 : 3; this.enter('volley', 0); }
        break;
      }
      case 'volley': {
        if (this.timer <= 0) {
          this.fireOrb(this.shotsLeft % 2 ? 'left' : 'right', 0.13, 8 * this.bossDamageScale(), 7.5 * fast);
          this.shotsLeft -= 1;
          this.timer = 0.32 / fast;
          if (this.shotsLeft <= 0) {
            arms.left.glow.material.opacity = arms.right.glow.material.opacity = 0;
            this.cooldown = 1.3 / fast;
            this.enter('idle', 0.4);
          }
        }
        break;
      }
      case 'megaCharge': {
        // Rises, gathers a huge orb overhead. Clear warning: text + sound + growing orb.
        pos.y = damp(pos.y, 2.2, 3, dt);
        arms.left.shoulder.rotation.x = damp(arms.left.shoulder.rotation.x, -3.0, 6, dt);
        arms.right.shoulder.rotation.x = damp(arms.right.shoulder.rotation.x, -3.0, 6, dt);
        const k = 1 - this.timer / 2.2;
        this.megaOrb.visible = true;
        this.megaOrb.position.set(0, 3.1, 0);
        this.megaOrb.scale.setScalar(0.1 + 0.55 * k);
        if (Math.random() < 0.6) g.effects.stream(this.megaOrb.getWorldPosition(new THREE.Vector3()), 0xff7a1a, { vy: -0.5, spread: 0.8, size: 0.08, life: 0.4 });
        if (this.timer <= 0) {
          const origin = this.megaOrb.getWorldPosition(new THREE.Vector3());
          const dir = head.clone().add(new THREE.Vector3(0, -0.3, 0)).sub(origin).normalize();
          g.combat.fire({ origin, dir, speed: 6.5, radius: 0.55, damage: 24 * this.bossDamageScale(), color: 0xff5a1a, team: 'enemy', charged: true, owner: 'raxor', kind: 'mega' });
          this.megaOrb.visible = false;
          g.audio.kiBlast(1, true);
          this.cooldown = 2;
          this.enter('land', 0.8);
        }
        break;
      }
      case 'land': {
        restArms();
        pos.y = damp(pos.y, 0, 4, dt);
        if (this.timer <= 0) { pos.y = 0; this.enter('idle', 0.3); }
        break;
      }
      case 'stagger': {
        this.body.rotation.x = damp(this.body.rotation.x, -0.35, 12, dt);
        arms.left.glow.material.opacity = arms.right.glow.material.opacity = 0;
        this.warnDisc.material.opacity = 0;
        this.megaOrb.visible = false;
        if (this.timer <= 0) {
          this.body.rotation.x = 0;
          pos.y = 0;
          this.cooldown = Math.max(this.cooldown, 0.6);
          this.enter('idle', 0.2);
        }
        break;
      }
      case 'roar': {
        this.body.rotation.x = damp(this.body.rotation.x, -0.25, 6, dt);
        arms.left.shoulder.rotation.z = damp(arms.left.shoulder.rotation.z, 0.8, 6, dt);
        arms.right.shoulder.rotation.z = damp(arms.right.shoulder.rotation.z, -0.8, 6, dt);
        if (Math.random() < 0.4) g.effects.stream(pos.clone().add(new THREE.Vector3(rand(-1, 1), 0.2, rand(-1, 1))), 0xc02aff, { vy: 3, size: 0.08, life: 0.6 });
        if (this.timer <= 0) {
          this.body.rotation.x = 0;
          arms.left.shoulder.rotation.z = arms.right.shoulder.rotation.z = 0;
          this.enter('idle', 0.2);
        }
        break;
      }
      case 'defeated': {
        this.body.rotation.x = damp(this.body.rotation.x, -1.4, 3, dt);
        pos.y = damp(pos.y, 0, 4, dt);
        if (this.timer < 1.2) this.group.scale.setScalar(Math.max(0.01, this.timer / 1.2));
        if (Math.random() < 0.3) g.effects.stream(pos.clone().add(new THREE.Vector3(rand(-0.5, 0.5), rand(0.5, 1.8), rand(-0.5, 0.5))), 0xffcc33, { vy: 2, size: 0.08 });
        if (this.timer <= 0) this.group.visible = false;
        break;
      }
      default:
        break;
    }
    // Keep inside the arena
    const r = Math.hypot(pos.x, pos.z);
    if (r > 20) { pos.x *= 20 / r; pos.z *= 20 / r; }
    this.aura.update(dt, g.renderer.camera, g.visualIntensity * 0.7);
  }

  chooseAttack(dist) {
    const roll = Math.random();
    if (this.phase === 2 && roll < 0.22) {
      this.say('Take THIS!');
      bus.emit('hud:warning', { text: 'BIG ATTACK! DODGE OR BLOCK!' });
      this.game.audio.warning();
      this.enter('megaCharge', 2.2);
      return;
    }
    if (dist < 2.2 || roll < 0.55) {
      this.attackArm = Math.random() < 0.5 ? 'left' : 'right';
      this.windupTime = this.phase === 2 ? 0.6 : 0.8;
      this.enter('windup', this.windupTime);
      this.arms[this.attackArm].glow.material.color.setHex(0xff2a2a);
      this.game.audio.warning();
      return;
    }
    this.enter('retreat', 1.2);
  }

  strike() {
    const g = this.game;
    const fist = this.arms[this.attackArm];
    fist.shoulder.rotation.x = -1.6;
    fist.elbow.rotation.x = 0;
    fist.glow.material.opacity = 0;
    // Strike lands at the player's position *at the end of the windup*:
    // stepping away during the telegraph dodges it.
    const center = this.warnDisc.position.clone().setY(this.player.headWorld.y - 0.2);
    const reach = this.group.position.distanceTo(new THREE.Vector3(center.x, 0, center.z));
    const hit = reach < 2.0 && this.player.testMelee(center, 0.45, 12 * this.bossDamageScale(), 'raxor');
    if (!hit) bus.emit('hud:message', { text: 'Dodged!', color: '#5cff8a' });
    g.audio.whoosh();
    this.cooldown = this.phase === 2 ? 0.9 : 1.4;
    this.enter('recover', 0.5);
  }

  fireOrb(side, radius, damage, speed) {
    const g = this.game;
    const origin = this.arms[side].fist.getWorldPosition(new THREE.Vector3());
    const aim = this.player.headWorld.clone().add(new THREE.Vector3(rand(-0.2, 0.2), rand(-0.5, 0), rand(-0.2, 0.2)));
    g.combat.fire({ origin, dir: aim.sub(origin), speed, radius, damage, color: 0xff9a1a, team: 'enemy', owner: 'raxor' });
    g.audio.kiBlast(0.4, false);
  }

  drawBar() {
    const c = this.barCanvas.getContext('2d');
    c.clearRect(0, 0, 512, 96);
    c.font = 'bold 34px Trebuchet MS, sans-serif';
    c.textAlign = 'center';
    c.lineWidth = 6;
    c.strokeStyle = '#000';
    c.strokeText('RAXOR', 256, 34);
    c.fillStyle = '#ff8a8a';
    c.fillText('RAXOR', 256, 34);
    c.fillStyle = 'rgba(0,0,0,0.6)';
    c.fillRect(16, 50, 480, 34);
    const f = this.health / this.def.maxHealth;
    c.fillStyle = f > 0.5 ? '#ff4a4a' : '#c02aff';
    c.fillRect(20, 54, 472 * f, 26);
    this.barTex.needsUpdate = true;
  }
}
