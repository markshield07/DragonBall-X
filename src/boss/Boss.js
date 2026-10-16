import * as THREE from 'three';
import { bus } from '../core/events.js';
import { clamp, rand, damp } from '../core/math.js';
import { toon, toonUnique, addOutline, glowMaterial } from '../render/toon.js';
import { Aura } from '../fx/Aura.js';
import { BattleDamage } from '../fx/BattleDamage.js';
import { BOSSES, bossById } from './bosses.js';
import { Knockdown } from '../combat/Knockdown.js';
import { Dizzy } from '../fx/Dizzy.js';
import { healthColor } from '../ui/Panel.js';

export { BOSSES };

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _line = new THREE.Line3();
const _up = new THREE.Vector3(0, 1, 0);

// One boss fighter that becomes any of the five villains (see bosses.js).
//
// Every attack has a clear telegraph (glowing fist, red ground marker, aim
// line, warning sound + text), so fights are about reading and reacting.
// Damage scales with the Power Level gap but the boss never scales up with
// the player, so training is felt directly: an early attempt is brutal, a
// return visit after training is much easier.
export class Boss {
  constructor(game) {
    this.game = game;
    this.def = BOSSES[0];
    this.group = new THREE.Group();
    this.group.name = 'boss';
    this.group.visible = false;
    game.renderer.scene.add(this.group);
    this.active = false;
    this.state = 'inactive';
    this.health = this.def.maxHealth;
    this.knock = new THREE.Vector3();
    this.timer = 0;
    this.cooldown = 2;
    this.phase = 0; // index of the last phase reached (0 = initial)
    this.speedK = 1;
    this.chest = new THREE.Vector3();
    this.kd = new Knockdown(game);
    // Additive hit flinch (a damped spring on the body's lean), layered on top
    // of whatever pose the current state sets.
    this.flinch = { x: 0, z: 0, vx: 0, vz: 0, ax: 0, az: 0 };
    this.dodgeCd = 0;
    this.stance = { lean: 0, head: 0 }; // additive health posture (applied like the flinch)
    this.dizzy = new Dizzy(this.group);
    this.target = {
      id: 'boss', team: 'enemy',
      active: () => this.active && this.state !== 'intro' && this.state !== 'defeated' && this.state !== 'vanish',
      sphere: () => {
        this.torso.getWorldPosition(this.chest);
        return { center: this.chest, radius: 0.5 * this.def.scale / 1.18 };
      },
      onPunch: (hit) => this.takeHit(hit),
      onBlast: (hit) => this.takeHit(hit),
      blind: (sec) => this.blind(sec),
    };
    this.aura = new Aura({ radius: 0.85, height: 2.8 });
    this.group.add(this.aura.group);
    this.buildShared();
    this.setBoss('raxor');
  }

  get player() { return this.game.player; }

  // ---- Model -------------------------------------------------------------------
  // Markers and effects that every boss shares.
  buildShared() {
    const scene = this.game.renderer.scene;
    this.barCanvas = document.createElement('canvas');
    this.barCanvas.width = 512; this.barCanvas.height = 96;
    this.barTex = new THREE.CanvasTexture(this.barCanvas);
    this.barTex.colorSpace = THREE.SRGBColorSpace;
    this.bar = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.barTex, depthTest: false, transparent: true }));
    this.bar.scale.set(1.4, 0.26, 1);
    this.bar.renderOrder = 25;
    this.group.add(this.bar);
    this.megaOrb = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), glowMaterial(0xff4a1a, 0.85));
    this.megaOrb.visible = false;
    this.group.add(this.megaOrb);
    this.barrier = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), glowMaterial(0xb45aff, 0));
    this.barrier.visible = false;
    this.group.add(this.barrier);
    // Ground warning disc (punch target / slam zone)
    this.warnDisc = new THREE.Mesh(new THREE.CircleGeometry(1, 28), new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0, depthWrite: false }));
    this.warnDisc.rotation.x = -Math.PI / 2;
    this.warnDisc.renderOrder = 4;
    scene.add(this.warnDisc);
    this.warnRing = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 40), new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    this.warnRing.rotation.x = -Math.PI / 2;
    this.warnRing.renderOrder = 4;
    scene.add(this.warnRing);
    // Aim line (rush / beam warning) and the beam itself: unit cylinders along +Z.
    const lineGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);
    this.aimLine = new THREE.Mesh(lineGeo, new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0, depthWrite: false }));
    this.aimLine.renderOrder = 6;
    this.aimLine.visible = false;
    scene.add(this.aimLine);
    this.beamOuter = new THREE.Mesh(lineGeo, glowMaterial(0xff3a3a, 0.7));
    this.beamCore = new THREE.Mesh(lineGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.beam = new THREE.Group();
    this.beam.add(this.beamOuter, this.beamCore);
    this.beam.visible = false;
    scene.add(this.beam);
  }

  // Swap in a villain: rebuild the body from its look and reset stats.
  // override: a story fight's scaled copy (power, health, moves); the
  // boss menu never passes one, so menu fights are unchanged.
  setBoss(id, override = null) {
    this.def = override ? { ...bossById(id), ...override } : bossById(id);
    this.story = !!override;
    const d = this.def;
    if (this.body) {
      this.group.remove(this.body);
      this.body.traverse((o) => { if (o.geometry && !o.userData.isOutline) o.geometry.dispose(); });
    }
    this.buildBody(d);
    this.bar.position.y = 2.25 * d.scale + 0.3;
    this.aura.setStyle({ color: d.aura.color, core: d.aura.core, scale: d.scale / 1.18 });
    this.aura.group.scale.setScalar(1);
    this.wounds = new BattleDamage(this.body, this.game, { forward: () => this.group.getWorldDirection(_w) });
  }

  buildBody(d) {
    const L = d.look;
    const skin = toon(L.skin);
    const armor = toon(L.armor);
    const dark = toon(L.dark);
    const bone = toon(L.bone);
    this.fistMat = toonUnique(L.skin);
    const body = new THREE.Group();
    this.body = body;
    this.group.add(body);
    body.scale.setScalar(d.scale);
    const bulk = L.bulky ? 1.25 : 1;
    const add = (geo, mat, x, y, z, outline = 0.04, parent = body) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      if (outline) addOutline(m, outline);
      return m;
    };
    for (const s of [-1, 1]) {
      add(new THREE.CapsuleGeometry(0.09 * bulk, 0.42, 4, 8), dark, 0.13 * s, 0.68, 0);
      add(new THREE.CapsuleGeometry(0.08 * bulk, 0.38, 4, 8), dark, 0.13 * s, 0.28, 0);
      add(new THREE.BoxGeometry(0.15 * bulk, 0.14, 0.28), armor, 0.13 * s, 0.07, 0.04);
    }
    add(new THREE.CapsuleGeometry(0.17 * bulk, 0.1, 4, 10), dark, 0, 0.98, 0);
    this.torso = add(new THREE.CapsuleGeometry(0.2, 0.3, 4, 12), skin, 0, 1.3, 0);
    this.torso.scale.set(1.35 * bulk, 1, 0.8 * bulk);
    const plate = add(new THREE.CapsuleGeometry(0.21, 0.24, 4, 12), armor, 0, 1.33, 0.02);
    plate.scale.set(1.38 * bulk, 1, 0.82 * bulk);
    for (const s of [-1, 1]) {
      const pad = add(new THREE.SphereGeometry(0.13 * bulk, 10, 8), armor, 0.33 * s * bulk, 1.5, 0);
      if (L.shoulderPads) pad.scale.set(1.5, 0.7, 1.3);
      if (L.spikes) {
        const spike = add(new THREE.ConeGeometry(0.05, 0.22, 6), bone, 0.38 * s * bulk, 1.63, 0, 0.06);
        spike.rotation.z = -0.5 * s;
      }
    }
    // Head
    const head = new THREE.Group();
    head.position.set(0, 1.78, 0);
    body.add(head);
    this.head = head;
    const skull = add(new THREE.SphereGeometry(0.15, 14, 10), skin, 0, 0, 0, 0.05, head);
    skull.scale.set(0.95 * (L.bulky ? 1.1 : 1), 1.1, 1);
    const eyeMat = new THREE.MeshBasicMaterial({ color: L.eyes });
    for (const s of [-1, 1]) {
      if (L.horns) {
        const horn = add(new THREE.ConeGeometry(0.035, 0.26, 6), bone, 0.08 * s, 0.14, -0.02, 0, head);
        horn.rotation.set(-0.5, 0, -0.45 * s);
      }
      if (L.tusks) {
        const tusk = add(new THREE.ConeGeometry(0.018, 0.08, 5), bone, 0.05 * s, -0.09, 0.11, 0, head);
        tusk.rotation.x = Math.PI;
      }
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 6), eyeMat);
      eye.scale.set(1.4, 0.7, 0.5);
      eye.position.set(0.055 * s, 0.01, 0.135);
      head.add(eye);
    }
    if (L.crest) {
      const crest = add(new THREE.ConeGeometry(0.06, 0.3, 4), armor, 0, 0.12, -0.06, 0, head);
      crest.rotation.x = -0.9;
    }
    if (L.crown) {
      for (let i = 0; i < 5; i++) {
        const a = (i - 2) * 0.45;
        const c = add(new THREE.ConeGeometry(0.025, 0.14, 4), bone, Math.sin(a) * 0.12, 0.15, Math.cos(a) * 0.05, 0, head);
        c.rotation.z = -a * 0.5;
      }
    }
    if (L.halo) {
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.012, 6, 32), new THREE.MeshBasicMaterial({ color: L.bone }));
      halo.position.set(0, 0.05, -0.18);
      head.add(halo);
      this.halo = halo;
    } else this.halo = null;
    if (L.cape) {
      const cape = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.25, 1, 6), toon(L.cape, { side: THREE.DoubleSide }));
      const p = cape.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, -0.06 * Math.pow((0.62 - p.getY(i)) / 1.25, 2));
      cape.geometry.computeVertexNormals();
      cape.position.set(0, 0.95, -0.2);
      cape.rotation.x = 0.12;
      body.add(cape);
    }
    if (L.wings) {
      for (const s of [-1, 1]) {
        const shape = new THREE.Shape();
        shape.moveTo(0, 0); shape.lineTo(0.9, 0.5); shape.lineTo(0.75, 0.05); shape.lineTo(0.95, -0.25); shape.lineTo(0.6, -0.15); shape.lineTo(0.55, -0.5); shape.lineTo(0.2, -0.2);
        const wing = new THREE.Mesh(new THREE.ShapeGeometry(shape), toon(L.armor, { side: THREE.DoubleSide }));
        wing.position.set(0.1 * s, 1.45, -0.18);
        wing.scale.set(s, 1, 1);
        wing.rotation.y = -0.5 * s;
        body.add(wing);
      }
    }
    if (L.tail) {
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.95, -0.15), new THREE.Vector3(0, 0.6, -0.5), new THREE.Vector3(0.2, 0.25, -0.8), new THREE.Vector3(0.5, 0.2, -0.95)]);
      add(new THREE.TubeGeometry(curve, 16, 0.05, 6, false), dark, 0, 0, 0, 0);
    }
    // Arms
    this.arms = {};
    for (const [side, s] of [['left', 1], ['right', -1]]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(0.36 * s * bulk, 1.47, 0);
      body.add(shoulder);
      add(new THREE.CapsuleGeometry(0.075 * bulk, 0.3, 4, 8), skin, 0, -0.2, 0, 0.05, shoulder);
      const elbow = new THREE.Group();
      elbow.position.y = -0.38;
      shoulder.add(elbow);
      add(new THREE.CapsuleGeometry(0.07 * bulk, 0.28, 4, 8), skin, 0, -0.18, 0, 0.05, elbow);
      add(new THREE.CylinderGeometry(0.085 * bulk, 0.085 * bulk, 0.1, 10), armor, 0, -0.24, 0, 0, elbow);
      const fist = add(new THREE.SphereGeometry(0.1 * bulk, 10, 8), this.fistMat, 0, -0.4, 0, 0.05, elbow);
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), glowMaterial(0xff3a2a, 0));
      glow.position.y = -0.4;
      elbow.add(glow);
      this.arms[side] = { shoulder, elbow, fist, glow };
    }
  }

  // ---- Lifecycle ---------------------------------------------------------------
  start(id = this.def.id) {
    if (id !== this.def.id) this.setBoss(id);
    const d = this.def;
    this.active = true;
    this.health = d.maxHealth;
    this.phase = 0;
    this.speedK = d.speed;
    this.moves = { ...d.attacks };
    this.state = 'intro';
    this.timer = 0;
    this.cooldown = 2.2;
    this.knock.set(0, 0, 0);
    this.kd.phase = 'none';
    this.kd.tilt = 0;
    Object.assign(this.flinch, { x: 0, z: 0, vx: 0, vz: 0, ax: 0, az: 0 });
    this.dodgeCd = 0;
    this.group.visible = true;
    this.group.position.set(0, 9, -28);
    this.group.rotation.set(0, 0, 0);
    this.group.scale.setScalar(1);
    this.body.rotation.set(0, 0, 0);
    this.body.scale.setScalar(d.scale);
    this.aura.setStyle({ color: d.aura.color, core: d.aura.core, scale: d.scale / 1.18 });
    this.aura.target = 0.6;
    this.megaOrb.visible = false;
    this.barrier.visible = false;
    this.barrierHp = 0;
    this.beam.visible = false;
    this.aimLine.visible = false;
    this.clearWarnings();
    for (const a of Object.values(this.arms)) a.glow.material.opacity = 0;
    this.wounds.reset();
    this.game.combat.addTarget(this.target);
    this.drawBar();
    this.startPL = this.game.currentPowerLevel();
    this.game.audio.bossRoar();
  }

  stop() {
    this.active = false;
    this.state = 'inactive';
    this.group.visible = false;
    this.beam.visible = false;
    this.aimLine.visible = false;
    this.clearWarnings();
    this.game.combat.removeTarget(this.target);
    this.game.combat.clearProjectiles('enemy');
  }

  clearWarnings() {
    this.warnDisc.material.opacity = 0;
    this.warnRing.material.opacity = 0;
  }

  powerRatio() { return this.game.currentPowerLevel() / this.def.powerLevel; }
  // How hard the player's attacks land (0.3x when far weaker .. 1.6x when far stronger).
  playerDamageScale() { return clamp(Math.pow(this.powerRatio(), 0.25), 0.3, 1.6); }
  // How hard the boss's attacks land on the player.
  bossDamageScale() { return clamp(Math.pow(1 / this.powerRatio(), 0.2), 0.45, 2.5) * this.def.damage; }

  say(text, color = '#ff8a8a') { bus.emit('hud:message', { text: `${this.def.name}: ${text}`, color, duration: 3 }); }

  // ---- Damage ---------------------------------------------------------------------
  takeHit(hit) {
    if (this.state === 'defeated' || this.state === 'intro' || this.state === 'vanish') return;
    const g = this.game;
    // Barrier: absorbs ki, punches wear it down.
    if (this.barrier.visible) {
      if (hit.kind === 'punch' || hit.kind === 'beam') {
        this.barrierHp -= hit.damage * this.playerDamageScale();
        g.effects.burst(hit.point, 0xd08aff, 10, 2, 0.05, 0.3);
        if (this.barrierHp <= 0) {
          this.barrier.visible = false;
          g.effects.burst(this.chest.clone(), 0xd08aff, 40, 5, 0.08, 0.7);
          g.audio.explosion(0.5);
          bus.emit('hud:message', { text: 'Barrier shattered!', color: '#d08aff' });
          this.enter('stagger', 1.3);
        }
      } else {
        g.effects.number(hit.point.clone(), 'ABSORBED', '#d08aff');
      }
      return;
    }
    const ratio = this.powerRatio();
    // Ki blasts can be dodged: a blur to the side and the blast flies on past
    // (Combat then detonates it behind them).
    const canDodge = ['idle', 'approach', 'recover', 'retreat', 'land'].includes(this.state);
    if (hit.kind === 'blast' && canDodge && this.dodgeCd <= 0) {
      const chance = clamp(0.35 / Math.pow(ratio, 0.3), 0.05, 0.45) * (hit.sphere ? 0.6 : 1) * (hit.charged ? 0.85 : 1);
      this.dodgeCd = 0.9;
      if (Math.random() < chance) { this.dodge(hit.dir); return 'dodged'; }
    }
    const dmg = hit.damage * this.playerDamageScale();
    this.health = Math.max(0, this.health - dmg);
    this.drawBar();
    if (hit.kind !== 'beam' || Math.random() < 0.35) {
      g.effects.number(hit.point.clone().add(new THREE.Vector3(0, 0.3, 0)), Math.round(dmg), hit.finisher || hit.charged ? '#ffcc33' : '#ffffff', hit.finisher);
    }
    this.wounds.hit(hit.point, hit.dir, this.health / this.def.maxHealth, hit.power || 0.5);
    this.addFlinch(hit.dir, (hit.kind === 'beam' ? 0.25 : 0.5 + (hit.power || 0.4)) * (hit.finisher ? 1.6 : 1));
    const strong = hit.finisher || hit.charged || (hit.power > 0.7 && ratio > 1);
    const kb = (hit.kind === 'punch' ? 1 : 0.6) * (0.4 + (hit.power || 0.4)) * clamp(Math.log10(ratio * 10 + 1), 0.25, 2.2) / Math.sqrt(this.def.scale / 1.18);
    _v.copy(hit.dir).setY(0).normalize();
    this.knock.addScaledVector(_v, kb * (strong ? 3 : 1.2) * (hit.kind === 'beam' ? 0.3 : 1));
    if (strong && ratio > 1) {
      g.effects.crack(this.group.position.clone().setY(0), 1.6 + (hit.power || 0.5));
      g.effects.ring(this.group.position.clone().setY(0.05), 0xffffff, { maxRadius: 3, duration: 0.5, opacity: 0.5 });
    }
    if (hit.kind === 'punch') g.progress.addXp('strength', 2 + 2 * hit.power, 'boss');
    else if (hit.kind !== 'beam' || Math.random() < 0.2) g.progress.addXp('ki', hit.charged ? 3 : 1, 'boss');
    // Heavy hits interrupt attacks (stagger). Much easier when stronger.
    const staggerChance = strong ? 0.9 : clamp(0.08 * ratio, 0.03, 0.6) * (hit.kind === 'beam' ? 0.2 : 1);
    if (['windup', 'approach', 'volleyCharge', 'idle', 'beamCharge', 'rushWindup'].includes(this.state) && Math.random() < staggerChance) {
      this.endAttackVisuals();
      this.enter('stagger', 0.45 + (strong ? 0.35 : 0));
      if (strong && ratio > 3 && Math.random() < 0.3) this.say(['Ngh! How are you this strong?!', 'Impossible…!', 'That power… it can\'t be!'][Math.floor(Math.random() * 3)]);
    }
    // Big hits send them flying: finishers, Spirit Bombs, fully charged blasts.
    if (this.health > 0 && !this.kd.active && !['intro', 'roar', 'vanish', 'appear', 'knockdown'].includes(this.state)) {
      const heavy = hit.finisher || hit.sphere || (hit.charged && (hit.energy || 0) > 1.1) || (hit.kind === 'punch' && hit.power > 0.92 && ratio > 1.5);
      // A finished combo or a Spirit Bomb always does; charged blasts and big
      // punches do more often the stronger you are.
      const chance = hit.sphere || hit.finisher ? 1 : clamp(0.45 + 0.3 * Math.log10(ratio * 2), 0.3, 0.9);
      if (heavy && Math.random() < chance) this.knockDown(hit, hit.sphere ? 1.4 : hit.finisher ? 1 : 0.8);
    }
    // A hard blow (relative to their health) leaves them stunned: dazed,
    // swaying, arms hanging, seeing stars. Bigger hits stun longer.
    if (this.health > 0 && this.state !== 'knockdown' && !this.kd.active && !['intro', 'roar', 'vanish', 'appear'].includes(this.state)) {
      const stun = clamp((dmg / this.def.maxHealth) * 14 + (hit.charged ? 0.25 : 0) + (hit.energy || 0) * 0.15 - 0.35, 0, 2.4);
      if (this.state === 'stunned') this.timer = Math.min(this.timer + stun * 0.25, 2.4);
      else if (stun > 0.45) { this.endAttackVisuals(); this.enter('stunned', stun); if (stun > 1.4) g.audio.targetHit?.(0.4); }
    }
    const next = this.def.phases[this.phase];
    if (next && this.health < this.def.maxHealth * next.at && this.health > 0 && !this.kd.active) this.powerUpPhase(next);
    if (this.health <= 0) this.defeat(hit);
  }

  // Solar Flare: can't see, stumbles around dazed (not during a knockdown).
  blind(sec) {
    if (!this.active || ['defeated', 'intro', 'vanish', 'knockdown'].includes(this.state) || this.kd.active) return;
    this.endAttackVisuals();
    this.enter('stunned', sec);
    this.say(['ARGH! My eyes!', 'I can\'t see!', 'A cheap trick!'][Math.floor(Math.random() * 3)]);
  }

  addFlinch(dir, k) {
    // Hit direction in the boss's own frame (it faces +z).
    _w.copy(dir).setY(0).applyAxisAngle(_up, -this.group.rotation.y);
    const S = Math.sqrt(this.def.scale / 1.18);
    this.flinch.vx += _w.z * 6 * k / S;
    this.flinch.vz -= _w.x * 4 * k / S;
  }

  knockDown(hit, power) {
    const g = this.game;
    this.endAttackVisuals();
    this.knock.set(0, 0, 0);
    const hp = this.health / this.def.maxHealth;
    this.kd.start(hit.dir, power, { lie: 0.7, size: this.def.scale / 1.18, style: Knockdown.pickStyle(hit, hp), health: hp });
    this.enter('knockdown', 0);
    g.effects.impact(this.chest.clone(), 0xffffff, 1.2);
    g.audio.punch(1, true);
    if (Math.random() < 0.35) this.say(['Guh…!', 'Argh!', 'You little…!'][Math.floor(Math.random() * 3)]);
  }

  dodge(dir) {
    const g = this.game;
    _w.set(-dir.z, 0, dir.x).normalize();
    if (Math.random() < 0.5) _w.negate();
    this.knock.addScaledVector(_w, 4.5);
    this.torso.getWorldPosition(this.chest);
    // Afterimage: a burst of aura-coloured streaks where they stood.
    for (let i = 0; i < 10; i++) g.effects.stream(this.chest.clone().add(_v.set(rand(-0.3, 0.3), rand(-0.8, 0.5), rand(-0.3, 0.3))), this.def.aura.color, { vy: 0, spread: 0.15, size: 0.14, life: 0.3 });
    g.effects.dust(this.group.position.clone(), 0.5, 2);
    g.audio.whoosh();
    g.effects.number(this.chest.clone().add(_v.set(0, 0.6, 0)), 'DODGED', '#aab3d6');
    this.enter('dodge', 0.25);
  }

  powerUpPhase(p) {
    const g = this.game;
    this.phase += 1;
    this.speedK = this.def.speed * p.speed;
    for (const [k, w] of Object.entries(p.add || {})) this.moves[k] = (this.moves[k] || 0) + w;
    this.aura.setStyle({ color: p.aura.color, core: p.aura.core, scale: (this.def.scale / 1.18) * (1 + 0.25 * this.phase) });
    this.aura.target = 1;
    if (p.grow) this.body.scale.multiplyScalar(p.grow);
    this.say(p.line);
    g.audio.bossRoar();
    g.effects.ring(this.group.position.clone().setY(0.05), p.aura.color, { maxRadius: 9, duration: 1 });
    this.endAttackVisuals();
    this.enter('roar', 1.3);
    this.drawBar();
  }

  defeat(hit = null) {
    const g = this.game;
    this.endAttackVisuals();
    this.knock.set(0, 0, 0);
    // The final blow sends them flying; they don't get up.
    this.kd.start(hit?.dir || _v.set(-Math.sin(this.group.rotation.y), 0, -Math.cos(this.group.rotation.y)), 1.3, { lie: 99, size: this.def.scale / 1.18, style: hit ? Knockdown.pickStyle(hit, 0) : 'crumple', health: 0 });
    this.enter('defeated', 3.5);
    this.say(this.powerRatio() > 2 ? this.def.lines.loseStrong : this.def.lines.lose, '#ffb0b0');
    g.combat.clearProjectiles('enemy');
    this.aura.target = 0;
    g.effects.burst(this.chest.clone(), 0xffffff, 50, 6, 0.12, 1.2);
    g.effects.ring(this.group.position.clone().setY(0.05), 0xffcc33, { maxRadius: 10, duration: 1.2 });
    g.audio.explosion(1);
    bus.emit('boss:defeated', { id: this.def.id });
  }

  enter(state, time = 0) {
    this.state = state;
    this.timer = time;
  }

  endAttackVisuals() {
    this.clearWarnings();
    this.megaOrb.visible = false;
    this.aimLine.visible = false;
    this.beam.visible = false;
    for (const a of Object.values(this.arms)) a.glow.material.opacity = 0;
    this.group.scale.setScalar(1);
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
    const fast = this.speedK;
    // Hover at the player's altitude when they fly (except during ground moves).
    const groundY = this.player.groundY();
    this.timer -= dt;
    this.cooldown -= dt;
    this.wounds.update(dt, this.health / this.def.maxHealth);
    if (this.halo) this.halo.rotation.z += dt;
    this.dodgeCd -= dt;
    if (this.kd.active && this.state !== 'knockdown' && this.state !== 'defeated') { this.kd.phase = 'none'; this.kd.tilt = 0; this.body.position.y = 0; }
    const fl = this.flinch;
    this.body.rotation.x -= fl.ax;
    this.body.rotation.z -= fl.az;
    this.head.rotation.x -= this.stance.head;
    this.body.rotation.y = 0;
    const hp = this.health / this.def.maxHealth;
    const hurt = 1 - hp;

    if (!['defeated', 'rush', 'vanish', 'knockdown'].includes(this.state)) {
      const want = Math.atan2(head.x - pos.x, head.z - pos.z);
      let d = want - this.group.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.group.rotation.y += d * Math.min(1, dt * 6);
    }
    if (this.knock.lengthSq() > 1e-4) {
      pos.addScaledVector(this.knock, dt * 3);
      this.knock.multiplyScalar(Math.exp(-dt * 5));
    }
    if (!['intro', 'megaCharge', 'land', 'slamUp', 'slamDown', 'defeated', 'knockdown'].includes(this.state)) pos.y = damp(pos.y, groundY, 3, dt);

    const arms = this.arms;
    const restArms = (k = 1) => {
      for (const a of [arms.left, arms.right]) {
        // The guard drops as they get beaten down.
        a.shoulder.rotation.x = damp(a.shoulder.rotation.x, -0.3 + 0.28 * hurt, 8 * k, dt);
        a.elbow.rotation.x = damp(a.elbow.rotation.x, -1.2 + 0.7 * hurt * hurt, 8 * k, dt);
        a.shoulder.rotation.z = damp(a.shoulder.rotation.z, 0, 8 * k, dt);
      }
    };
    const armsForward = () => {
      for (const a of [arms.left, arms.right]) {
        a.shoulder.rotation.x = damp(a.shoulder.rotation.x, -1.5, 8, dt);
        a.elbow.rotation.x = damp(a.elbow.rotation.x, 0, 8, dt);
      }
    };
    const bob = Math.sin(performance.now() * 0.005) * 0.02;
    const S = this.def.scale / 1.18;

    switch (this.state) {
      case 'intro': {
        const target = _w.set(0, groundY, -4.5 - 0.5 * S);
        pos.lerp(target, Math.min(1, dt * 1.4));
        this.body.rotation.x = 0.3;
        if (pos.distanceTo(target) < 0.15) {
          pos.copy(target);
          this.body.rotation.x = 0;
          g.effects.ring(pos.clone().setY(0.05), this.def.aura.color, { maxRadius: 8, duration: 0.9 });
          g.effects.crack(pos.clone().setY(0), 2.4 * S);
          g.audio.explosion(0.7);
          const l = this.def.lines;
          this.say(this.startPL > this.def.powerLevel * 3 ? l.scared : this.startPL > this.def.powerLevel ? l.close : l.weak, this.startPL > this.def.powerLevel * 3 ? '#ffb0b0' : '#ff8a8a');
          bus.emit('boss:engaged', {});
          this.enter('idle', 0.8);
        }
        break;
      }
      case 'idle':
      case 'approach': {
        restArms();
        this.body.position.y = bob;
        const want = 1.35 * S;
        if (dist > want + 0.2) {
          pos.addScaledVector(toPlayer, Math.min(dist - want, 2.6 * fast * dt));
          this.state = 'approach';
        } else if (dist < want - 0.4) pos.addScaledVector(toPlayer, -1.5 * dt);
        if (this.cooldown <= 0 && this.timer <= 0) this.chooseAttack(dist);
        break;
      }
      // -- Punch: fist pulled back and glowing red, red disc at the player's feet.
      case 'windup': {
        const arm = arms[this.attackArm];
        arm.shoulder.rotation.x = damp(arm.shoulder.rotation.x, 0.9, 10, dt);
        arm.elbow.rotation.x = damp(arm.elbow.rotation.x, -2.0, 10, dt);
        const k = 1 - this.timer / this.windupTime;
        arm.glow.material.opacity = 0.7 * k;
        this.warnDisc.position.set(head.x, this.player.groundY() + 0.03, head.z);
        this.warnDisc.scale.setScalar(0.8);
        this.warnDisc.material.opacity = 0.45 * k;
        if (dist > 1.1 * S) pos.addScaledVector(toPlayer, Math.min(dist - 1.1 * S, 3 * dt));
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
      // -- Volley: back off, both hands forward, orange energy gathering.
      case 'retreat': {
        restArms();
        if (dist < 6) pos.addScaledVector(toPlayer, -5 * dt);
        if (this.timer <= 0 || dist >= 6) this.enter('volleyCharge', 0.9 / fast);
        break;
      }
      case 'volleyCharge': {
        armsForward();
        const k = 1 - this.timer / (0.9 / fast);
        for (const a of [arms.left, arms.right]) { a.glow.material.color.setHex(this.def.orb); a.glow.material.opacity = 0.8 * k; }
        if (this.timer <= 0) { this.shotsLeft = 3 + this.phase; this.enter('volley', 0); }
        break;
      }
      case 'volley': {
        if (this.timer <= 0) {
          this.fireOrb(this.shotsLeft % 2 ? 'left' : 'right', 0.18, 12 * this.bossDamageScale(), 8.5 * fast);
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
      // -- Homing: three slow orbs that curve toward you.
      case 'homingCharge': {
        armsForward();
        const k = 1 - this.timer / 0.9;
        for (const a of [arms.left, arms.right]) { a.glow.material.color.setHex(this.def.orb); a.glow.material.opacity = 0.8 * k; }
        if (this.timer <= 0) {
          for (let i = 0; i < 3; i++) {
            const origin = arms[i % 2 ? 'left' : 'right'].fist.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(rand(-0.3, 0.3), rand(0, 0.6), 0));
            const dir = new THREE.Vector3(rand(-1, 1), rand(0.2, 1), 0).applyQuaternion(this.group.quaternion).add(toPlayer.clone().multiplyScalar(1.5));
            g.combat.fire({
              origin, dir, speed: 4 + this.phase, radius: 0.17, damage: 9 * this.bossDamageScale(), color: this.def.orb, team: 'enemy', owner: this.def.id, life: 5,
              homing: { target: () => this.player.headWorld.clone().add(_w.set(0, -0.35, 0)), strength: 1.4 },
            });
          }
          g.audio.kiBlast(0.6, true);
          arms.left.glow.material.opacity = arms.right.glow.material.opacity = 0;
          this.cooldown = 1.6 / fast;
          this.enter('idle', 0.5);
        }
        break;
      }
      // -- Mega orb: rises, gathers a huge orb overhead.
      case 'megaCharge': {
        pos.y = damp(pos.y, groundY + 2.2, 3, dt);
        arms.left.shoulder.rotation.x = damp(arms.left.shoulder.rotation.x, -3.0, 6, dt);
        arms.right.shoulder.rotation.x = damp(arms.right.shoulder.rotation.x, -3.0, 6, dt);
        const k = 1 - this.timer / 2.2;
        this.megaOrb.visible = true;
        this.megaOrb.material.color.setHex(this.def.orb);
        this.megaOrb.position.set(0, 2.6 * this.def.scale, 0);
        this.megaOrb.scale.setScalar(0.1 + 0.55 * k);
        if (Math.random() < 0.6) g.effects.stream(this.megaOrb.getWorldPosition(new THREE.Vector3()), this.def.orb, { vy: -0.5, spread: 0.8, size: 0.08, life: 0.4 });
        if (this.timer <= 0) {
          const origin = this.megaOrb.getWorldPosition(new THREE.Vector3());
          const dir = head.clone().add(new THREE.Vector3(0, -0.3, 0)).sub(origin).normalize();
          g.combat.fire({ origin, dir, speed: 6.5, radius: 0.55, damage: 24 * this.bossDamageScale(), color: this.def.orb, team: 'enemy', charged: true, owner: this.def.id, kind: 'mega' });
          this.megaOrb.visible = false;
          g.audio.kiBlast(1, true);
          this.cooldown = 2;
          this.enter('land', 0.8);
        }
        break;
      }
      case 'land': {
        restArms();
        pos.y = damp(pos.y, groundY, 4, dt);
        if (this.timer <= 0) this.enter('idle', 0.3);
        break;
      }
      // -- Barrier: purple shield; punches break it.
      case 'barrierUp': {
        armsForward();
        this.barrier.material.opacity = damp(this.barrier.material.opacity, 0.35, 6, dt);
        this.barrier.scale.setScalar(1.1 * this.def.scale);
        this.barrier.position.set(0, 1.1 * this.def.scale, 0);
        if (this.timer <= 0) { this.enter('idle', 0.2); this.cooldown = 0.3; }
        break;
      }
      // -- Dash: blurs to a new spot around the player.
      case 'dash': {
        restArms();
        _w.subVectors(this.dashTo, pos).setY(0);
        const l = _w.length();
        if (l > 0.05) pos.addScaledVector(_w.normalize(), Math.min(l, 14 * dt));
        if (Math.random() < 0.8) g.effects.stream(pos.clone().add(new THREE.Vector3(0, 1.2 * this.def.scale, 0)), this.def.aura.color, { vy: 0, spread: 0.4, size: 0.12, life: 0.3 });
        if (l < 0.1 || this.timer <= 0) this.chooseAttack(pos.distanceTo(head), ['punch', 'volley']);
        break;
      }
      // -- Slam: leaps up, crashes down on a red ring.
      case 'slamUp': {
        restArms();
        const k = 1 - this.timer / this.slamTime;
        pos.x = THREE.MathUtils.lerp(this.slamFrom.x, this.slamAt.x, k * 0.8);
        pos.z = THREE.MathUtils.lerp(this.slamFrom.z, this.slamAt.z, k * 0.8);
        pos.y = this.slamAt.y + Math.sin(k * Math.PI * 0.85) * 4;
        this.warnRing.material.opacity = 0.7;
        this.warnDisc.material.opacity = 0.18 + 0.25 * k;
        if (this.timer <= 0) this.enter('slamDown', 0.18);
        break;
      }
      case 'slamDown': {
        const k = 1 - this.timer / 0.18;
        pos.x = THREE.MathUtils.lerp(pos.x, this.slamAt.x, k);
        pos.z = THREE.MathUtils.lerp(pos.z, this.slamAt.z, k);
        pos.y = damp(pos.y, this.slamAt.y, 25, dt);
        if (this.timer <= 0) {
          pos.y = this.slamAt.y;
          this.clearWarnings();
          g.effects.crack(this.slamAt.clone(), 3.5);
          g.effects.ring(this.slamAt.clone().setY(this.slamAt.y + 0.05), 0xffb04a, { maxRadius: this.slamRadius * 1.6, duration: 0.6 });
          g.effects.burst(this.slamAt.clone().setY(this.slamAt.y + 0.2), 0x8a6a4c, 30, 5, 0.1, 1.0, { up: 3, grav: 9 });
          g.audio.explosion(0.9);
          const dx = head.x - this.slamAt.x;
          const dz = head.z - this.slamAt.z;
          const airborne = head.y - this.player.groundY() > 2.6;
          if (Math.hypot(dx, dz) < this.slamRadius && !airborne) {
            this.player.onHit({ damage: 18 * this.bossDamageScale(), blocked: this.player.blocking, point: head.clone().setY(head.y - 0.6), kind: 'melee', source: this.def.id });
          } else bus.emit('hud:message', { text: 'Dodged!', color: '#5cff8a' });
          this.cooldown = 1.4 / fast;
          this.enter('recover', 0.7);
        }
        break;
      }
      // -- Rush: lowers his head, red warning line, then charges along it.
      case 'rushWindup': {
        this.body.rotation.x = damp(this.body.rotation.x, 0.35, 6, dt);
        restArms();
        const k = 1 - this.timer / this.rushWindup;
        this.showAimLine(this.rushFrom, this.rushDir, 12, 0.35 * S, 0.15 + 0.4 * k);
        if (this.timer <= 0) {
          this.aimLine.visible = false;
          this.rushHit = false;
          this.enter('rush', 12 / 15);
          g.audio.whoosh();
        }
        break;
      }
      case 'rush': {
        pos.addScaledVector(this.rushDir, 15 * dt);
        g.effects.stream(pos.clone().add(new THREE.Vector3(0, 0.3, 0)), 0x8a6a4c, { vy: 1, spread: 0.6, size: 0.1, life: 0.4 });
        if (!this.rushHit && Math.hypot(head.x - pos.x, head.z - pos.z) < 0.85 * S && head.y - this.player.groundY() < 2.6) {
          this.rushHit = true;
          this.player.onHit({ damage: 16 * this.bossDamageScale(), blocked: this.player.blocking, point: head.clone().setY(head.y - 0.5), kind: 'melee', source: this.def.id });
        }
        if (this.timer <= 0 || Math.hypot(pos.x, pos.z) > 19) {
          if (!this.rushHit) bus.emit('hud:message', { text: 'Dodged!', color: '#5cff8a' });
          this.body.rotation.x = 0;
          this.cooldown = 1.2 / fast;
          this.enter('recover', 0.6);
        }
        break;
      }
      // -- Teleport: vanish, reappear beside or behind the player, quick strike.
      case 'vanish': {
        this.group.scale.setScalar(Math.max(0.01, this.timer / 0.35));
        if (this.timer <= 0) {
          const f = this.player.flatForward(_w);
          const a = Math.atan2(f.x, f.z) + rand(0.5, 1) * Math.PI * (Math.random() < 0.5 ? 1 : -1);
          pos.set(head.x + Math.sin(a) * 1.5 * S, groundY, head.z + Math.cos(a) * 1.5 * S);
          this.group.rotation.y = Math.atan2(head.x - pos.x, head.z - pos.z);
          g.effects.burst(pos.clone().add(new THREE.Vector3(0, 1.2, 0)), this.def.aura.color, 24, 3, 0.07, 0.5);
          g.audio.targetHit(0.6);
          bus.emit('hud:warning', { text: 'BEHIND YOU!' });
          this.enter('appear', 0.25);
        }
        break;
      }
      case 'appear': {
        this.group.scale.setScalar(Math.min(1, 1 - this.timer / 0.25));
        if (this.timer <= 0) {
          this.group.scale.setScalar(1);
          this.beginPunch(0.75);
        }
        break;
      }
      // -- Beam: charge, lock a red aim line, fire down it.
      case 'beamCharge': {
        armsForward();
        const k = 1 - this.timer / this.beamTime;
        for (const a of [arms.left, arms.right]) { a.glow.material.color.setHex(this.def.orb); a.glow.material.opacity = 0.9 * k; }
        const origin = this.handsCenter(_w);
        if (this.timer > 0.55) this.beamAim.copy(head).add(new THREE.Vector3(0, -0.3, 0)).sub(origin).normalize();
        this.showAimLine(origin, this.beamAim, 30, 0.02 + 0.03 * k, 0.4 + 0.5 * k);
        if (this.timer <= 0) {
          this.aimLine.visible = false;
          this.beamTicks = 0;
          this.enter('beamFire', 0.9);
          g.audio.kiBlast(1, true);
        }
        break;
      }
      case 'beamFire': {
        armsForward();
        const origin = this.handsCenter(new THREE.Vector3());
        const len = 30;
        this.beam.visible = true;
        this.beam.position.copy(origin);
        this.beam.lookAt(_w.copy(origin).add(this.beamAim));
        const r = 0.28 * S * (0.8 + 0.2 * Math.sin(performance.now() * 0.04));
        this.beamOuter.scale.set(r, r, len);
        this.beamCore.scale.set(r * 0.45, r * 0.45, len);
        this.beamOuter.material.color.setHex(this.def.orb);
        this.beamTicks -= dt;
        if (this.beamTicks <= 0) {
          this.beamTicks = 0.15;
          _line.set(origin, _w.copy(origin).addScaledVector(this.beamAim, len));
          const p = new THREE.Vector3();
          _line.closestPointToPoint(head, true, p);
          const chest = head.clone().setY(head.y - 0.45);
          const p2 = new THREE.Vector3();
          _line.closestPointToPoint(chest, true, p2);
          if (p.distanceTo(head) < r + 0.18 || p2.distanceTo(chest) < r + 0.25) {
            this.player.onHit({ damage: 5 * this.bossDamageScale(), blocked: this.player.blocking, point: p.clone(), kind: 'beam', source: this.def.id, ignoreInvuln: true });
          }
        }
        if (this.timer <= 0) {
          this.beam.visible = false;
          arms.left.glow.material.opacity = arms.right.glow.material.opacity = 0;
          this.cooldown = 1.6 / fast;
          this.enter('idle', 0.4);
        }
        break;
      }
      case 'dodge': {
        restArms();
        this.body.rotation.z = damp(this.body.rotation.z, 0, 10, dt);
        if (this.timer <= 0) this.enter('idle', 0.15);
        break;
      }
      // -- Knocked flying: launch, slam, bounce, skid, lie there, get up.
      case 'knockdown': {
        const kd = this.kd;
        kd.update(dt, pos);
        this.body.rotation.x = kd.tilt;
        this.body.rotation.y = kd.yaw;
        this.body.position.y = kd.lift(0.2 * this.def.scale);
        const flail = kd.phase === 'getUp' ? 0 : 1;
        arms.left.shoulder.rotation.z = damp(arms.left.shoulder.rotation.z, 1.2 * flail, 8, dt);
        arms.right.shoulder.rotation.z = damp(arms.right.shoulder.rotation.z, -1.2 * flail, 8, dt);
        for (const a of [arms.left, arms.right]) {
          a.shoulder.rotation.x = damp(a.shoulder.rotation.x, flail ? -2.2 : -0.3, 6, dt);
          a.elbow.rotation.x = damp(a.elbow.rotation.x, flail ? -0.3 : -1.2, 6, dt);
        }
        if (!kd.active) {
          this.body.rotation.x = 0;
          this.body.position.y = 0;
          arms.left.shoulder.rotation.z = arms.right.shoulder.rotation.z = 0;
          this.cooldown = Math.max(this.cooldown, 0.9);
          const next = this.def.phases[this.phase];
          if (next && this.health < this.def.maxHealth * next.at) this.powerUpPhase(next);
          else this.enter('idle', 0.3);
        }
        break;
      }
      // -- Stunned: dazed and swaying, arms hanging, stars circling.
      case 'stunned': {
        const t = performance.now() * 0.001;
        for (const [a, sg] of [[arms.left, 1], [arms.right, -1]]) {
          a.shoulder.rotation.x = damp(a.shoulder.rotation.x, 0.1, 6, dt);
          a.elbow.rotation.x = damp(a.elbow.rotation.x, -0.25, 6, dt);
          a.shoulder.rotation.z = damp(a.shoulder.rotation.z, 0.12 * sg + Math.sin(t * 3 + sg) * 0.08, 6, dt);
          a.glow.material.opacity = 0;
        }
        this.body.rotation.x = damp(this.body.rotation.x, 0.2 + Math.sin(t * 2.6) * 0.08, 6, dt);
        this.body.rotation.z = Math.sin(t * 3.4) * 0.14;
        this.head.rotation.z = Math.sin(t * 2.9 + 1) * 0.3;
        this.body.position.y = -0.04 * S + Math.abs(Math.sin(t * 3.4)) * 0.02;
        // Stumbles a little in circles.
        pos.x += Math.cos(t * 1.7) * dt * 0.35;
        pos.z += Math.sin(t * 1.7) * dt * 0.35;
        if (this.timer <= 0) {
          this.body.rotation.x = this.body.rotation.z = this.head.rotation.z = 0;
          this.body.position.y = 0;
          this.cooldown = Math.max(this.cooldown, 0.5);
          this.enter('idle', 0.2);
        }
        break;
      }
      case 'stagger': {
        this.body.rotation.x = damp(this.body.rotation.x, -0.35, 12, dt);
        arms.left.glow.material.opacity = arms.right.glow.material.opacity = 0;
        if (this.timer <= 0) {
          this.body.rotation.x = 0;
          this.cooldown = Math.max(this.cooldown, 0.6);
          this.enter('idle', 0.2);
        }
        break;
      }
      case 'roar': {
        this.body.rotation.x = damp(this.body.rotation.x, -0.25, 6, dt);
        arms.left.shoulder.rotation.z = damp(arms.left.shoulder.rotation.z, 0.8, 6, dt);
        arms.right.shoulder.rotation.z = damp(arms.right.shoulder.rotation.z, -0.8, 6, dt);
        if (Math.random() < 0.4) g.effects.stream(pos.clone().add(new THREE.Vector3(rand(-1, 1), 0.2, rand(-1, 1))), this.aura.color.getHex(), { vy: 3, size: 0.08, life: 0.6 });
        if (this.timer <= 0) {
          this.body.rotation.x = 0;
          arms.left.shoulder.rotation.z = arms.right.shoulder.rotation.z = 0;
          this.enter('idle', 0.2);
        }
        break;
      }
      case 'defeated': {
        this.kd.update(dt, pos);
        this.body.rotation.x = this.kd.tilt;
        this.body.rotation.y = this.kd.yaw;
        this.body.position.y = this.kd.lift(0.2 * this.def.scale);
        if (this.timer < 1.2) this.group.scale.setScalar(Math.max(0.01, this.timer / 1.2));
        if (Math.random() < 0.3) g.effects.stream(pos.clone().add(new THREE.Vector3(rand(-0.5, 0.5), rand(0.5, 1.8), rand(-0.5, 0.5))), 0xffcc33, { vy: 2, size: 0.08 });
        if (this.timer <= 0) this.group.visible = false;
        break;
      }
      default:
        break;
    }
    // Flinch spring, added on top of the pose (and removed again next frame).
    fl.vx += (-140 * fl.x - 13 * fl.vx) * dt;
    fl.vz += (-140 * fl.z - 13 * fl.vz) * dt;
    fl.x += fl.vx * dt;
    fl.z += fl.vz * dt;
    // Health shows in the stance: chest out and chin up when fresh, hunched
    // over, head hanging and breathing hard when beaten up.
    const down = this.state === 'knockdown' || this.state === 'defeated';
    const posture = down || this.state === 'stunned' ? 0 : Math.pow(hurt, 1.3) * 0.42 - Math.max(0, hp - 0.7) * 0.3 + Math.sin(performance.now() * 0.006) * 0.035 * hurt;
    fl.ax = down ? 0 : clamp(fl.x, -0.6, 0.6) + posture;
    fl.az = down ? 0 : clamp(fl.z, -0.4, 0.4);
    this.body.rotation.x += fl.ax;
    this.body.rotation.z += fl.az;
    this.stance.head = down ? 0 : hurt * 0.4 - Math.max(0, hp - 0.7) * 0.35;
    this.head.rotation.x += this.stance.head;
    this.dizzy.update(dt, this.state === 'stunned', 2.12 * this.body.scale.y, 0.28 * this.body.scale.y);
    if (this.barrier.visible && this.state !== 'barrierUp') {
      this.barrierTime -= dt;
      if (this.barrierTime <= 0) this.barrier.visible = false;
    }
    const r = Math.hypot(pos.x, pos.z);
    const maxR = this.player.flying ? 60 : 20;
    if (r > maxR) { pos.x *= maxR / r; pos.z *= maxR / r; }
    this.aura.update(dt, g.renderer.camera, g.visualIntensity * 0.7);
  }

  handsCenter(out) {
    this.arms.left.fist.getWorldPosition(out);
    this.arms.right.fist.getWorldPosition(_line.start);
    return out.add(_line.start).multiplyScalar(0.5);
  }

  showAimLine(from, dir, len, radius, opacity) {
    this.aimLine.visible = true;
    this.aimLine.position.copy(from);
    this.aimLine.lookAt(_line.end.copy(from).add(dir));
    this.aimLine.scale.set(radius, radius, len);
    this.aimLine.material.opacity = opacity;
  }

  // Weighted random pick from the boss's current move set.
  chooseAttack(dist, only = null) {
    const moves = Object.entries(this.moves).filter(([k]) => !only || only.includes(k));
    if (dist < 2.2 * this.def.scale / 1.18 && Math.random() < 0.5 && this.moves.punch) return this.doMove('punch');
    let total = moves.reduce((s, [, w]) => s + w, 0);
    let r = Math.random() * total;
    for (const [k, w] of moves) {
      r -= w;
      if (r <= 0) return this.doMove(k);
    }
    return this.doMove('punch');
  }

  doMove(k) {
    const g = this.game;
    const head = this.player.headWorld;
    const pos = this.group.position;
    const fast = this.speedK;
    switch (k) {
      case 'volley': this.enter('retreat', 1.2); break;
      case 'homing': this.enter('homingCharge', 0.9); g.audio.warning(); break;
      case 'mega':
        this.say('Take THIS!');
        bus.emit('hud:warning', { text: 'BIG ATTACK! DODGE OR BLOCK!' });
        g.audio.warning();
        this.enter('megaCharge', 2.2);
        break;
      case 'barrier':
        if (this.barrier.visible) return this.doMove('dash');
        this.barrier.visible = true;
        this.barrier.material.opacity = 0;
        this.barrier.material.color.setHex(this.def.aura.color);
        this.barrierHp = 40 + 0.05 * this.def.maxHealth;
        this.barrierTime = 6;
        this.say('My barrier is absolute!');
        bus.emit('hud:message', { text: 'Barrier! Ki blasts are absorbed. Punch through it!', color: '#d08aff' });
        this.enter('barrierUp', 0.6);
        break;
      case 'dash': {
        const a = rand(0, Math.PI * 2);
        const r = rand(2.5, 5);
        this.dashTo = new THREE.Vector3(head.x + Math.sin(a) * r, pos.y, head.z + Math.cos(a) * r);
        g.audio.whoosh();
        this.enter('dash', 0.6);
        break;
      }
      case 'slam': {
        this.slamFrom = pos.clone();
        this.slamAt = new THREE.Vector3(head.x, this.player.groundY(), head.z);
        this.slamRadius = 1.6 + 0.4 * this.phase;
        this.slamTime = 1.3 / Math.sqrt(fast);
        this.warnDisc.position.set(this.slamAt.x, this.slamAt.y + 0.03, this.slamAt.z);
        this.warnDisc.scale.setScalar(this.slamRadius);
        this.warnRing.position.copy(this.warnDisc.position).setY(this.slamAt.y + 0.04);
        this.warnRing.scale.setScalar(this.slamRadius);
        g.audio.warning();
        bus.emit('hud:warning', { text: 'GROUND SLAM! GET OUT OF THE RED RING!' });
        this.enter('slamUp', this.slamTime);
        break;
      }
      case 'rush': {
        if (Math.hypot(head.x - pos.x, head.z - pos.z) < 2.5) return this.doMove('punch');
        this.rushFrom = pos.clone().setY(pos.y + 0.6);
        this.rushDir = new THREE.Vector3(head.x - pos.x, 0, head.z - pos.z).normalize();
        this.rushWindup = 1.0 / Math.sqrt(fast);
        g.audio.warning();
        bus.emit('hud:warning', { text: 'CHARGE! SIDESTEP!' });
        this.enter('rushWindup', this.rushWindup);
        break;
      }
      case 'teleport':
        g.effects.burst(pos.clone().add(new THREE.Vector3(0, 1.2, 0)), this.def.aura.color, 24, 3, 0.07, 0.5);
        g.audio.whoosh();
        this.enter('vanish', 0.35);
        break;
      case 'beam':
        this.beamAim = new THREE.Vector3(0, 0, 1);
        this.beamTime = 1.6 / Math.sqrt(fast);
        g.audio.warning();
        bus.emit('hud:warning', { text: 'BEAM! STEP OUT OF THE RED LINE!' });
        this.enter('beamCharge', this.beamTime);
        break;
      default:
        this.beginPunch(this.phase ? 0.6 : 0.8);
    }
  }

  beginPunch(windup) {
    this.attackArm = Math.random() < 0.5 ? 'left' : 'right';
    this.windupTime = windup / Math.sqrt(this.speedK);
    this.enter('windup', this.windupTime);
    this.arms[this.attackArm].glow.material.color.setHex(0xff2a2a);
    this.game.audio.warning();
  }

  strike() {
    const g = this.game;
    const fist = this.arms[this.attackArm];
    fist.shoulder.rotation.x = -1.6;
    fist.elbow.rotation.x = 0;
    fist.glow.material.opacity = 0;
    // The strike lands where the player stood at the end of the windup:
    // stepping away during the telegraph dodges it.
    const center = this.warnDisc.position.clone().setY(this.player.headWorld.y - 0.2);
    const reach = this.group.position.distanceTo(new THREE.Vector3(center.x, this.group.position.y, center.z));
    const hit = reach < 2.0 * this.def.scale / 1.18 && this.player.testMelee(center, 0.45, 12 * this.bossDamageScale(), this.def.id);
    if (!hit) bus.emit('hud:message', { text: 'Dodged!', color: '#5cff8a' });
    g.audio.whoosh();
    this.cooldown = (this.phase ? 0.9 : 1.4) / this.speedK;
    this.enter('recover', 0.5);
  }

  fireOrb(side, radius, damage, speed) {
    const g = this.game;
    const origin = this.arms[side].fist.getWorldPosition(new THREE.Vector3());
    const aim = this.player.headWorld.clone().add(new THREE.Vector3(rand(-0.2, 0.2), rand(-0.5, 0), rand(-0.2, 0.2)));
    g.combat.fire({ origin, dir: aim.sub(origin), speed, radius, damage, color: this.def.orb, team: 'enemy', owner: this.def.id });
    g.audio.kiBlast(0.4, false);
  }

  drawBar() {
    const c = this.barCanvas.getContext('2d');
    const name = this.def.name.toUpperCase();
    c.clearRect(0, 0, 512, 96);
    c.font = 'bold 34px Trebuchet MS, sans-serif';
    c.textAlign = 'center';
    c.lineWidth = 6;
    c.strokeStyle = '#000';
    c.strokeText(name, 256, 34);
    c.fillStyle = '#ff8a8a';
    c.fillText(name, 256, 34);
    c.fillStyle = 'rgba(0,0,0,0.6)';
    c.fillRect(16, 50, 480, 34);
    const f = this.health / this.def.maxHealth;
    c.fillStyle = healthColor(f);
    c.fillRect(20, 54, 472 * f, 26);
    c.fillStyle = 'rgba(255,255,255,0.25)';
    c.fillRect(20, 54, 472 * f, 8);
    this.barTex.needsUpdate = true;
  }
}
