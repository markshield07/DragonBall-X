import * as THREE from 'three';
import { toon, toonUnique, addOutline } from '../render/toon.js';
import { bus } from '../core/events.js';
import { clamp } from '../core/math.js';

// Punching dummy with a spring hit reaction. Stronger hits = bigger tilt,
// louder impact and, at high strength, ground cracks. Breaking its
// durability bar gives bonus XP, so stronger players break it faster.
export class Dummy {
  constructor(game, position) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.position.copy(position);
    this.pivot = new THREE.Group(); // tilts on hits, pivots at the base
    this.group.add(this.pivot);
    const wood = toon(0x8a5a32);
    this.padMat = toonUnique(0xd94a3a);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.12, 12), toon(0x5a3a22));
    base.position.y = 0.06;
    this.group.add(base);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.1, 8), wood);
    post.position.y = 0.6;
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.4, 4, 12), this.padMat);
    torso.position.y = 1.25;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), toon(0xe8d3a8));
    head.position.y = 1.68;
    const armBar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.9, 6), wood);
    armBar.rotation.z = Math.PI / 2;
    armBar.position.y = 1.38;
    const target = new THREE.Mesh(new THREE.CircleGeometry(0.1, 16), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    target.position.set(0, 1.3, 0.225);
    const bull = new THREE.Mesh(new THREE.CircleGeometry(0.05, 16), new THREE.MeshBasicMaterial({ color: 0xd94a3a }));
    bull.position.z = 0.001;
    target.add(bull);
    [post, torso, head, armBar].forEach((m) => { m.castShadow = true; this.pivot.add(m); });
    addOutline(torso, 0.04);
    addOutline(head, 0.05);
    this.pivot.add(target);
    this.torso = torso;

    this.tilt = new THREE.Vector2(); // x/z tilt angles
    this.tiltVel = new THREE.Vector2();
    this.maxDurability = 160;
    this.durability = this.maxDurability;
    this.broken = 0;
    this.flash = 0;
    this.sessionXp = 0;

    this.center = new THREE.Vector3();
    this.target = {
      id: 'dummy',
      team: 'enemy',
      active: () => this.group.visible && this.broken <= 0,
      sphere: () => {
        // Hitbox stays upright (the tilt is visual only) so follow-up punches land.
        this.center.copy(this.group.position);
        this.center.y += 1.4;
        return { center: this.center, radius: 0.42 };
      },
      onPunch: (hit) => this.onHit(hit),
      onBlast: (hit) => this.onHit(hit),
    };
    game.combat.addTarget(this.target);
    game.renderer.scene.add(this.group);
  }

  setVisible(v) { this.group.visible = v; }

  onHit(hit) {
    const g = this.game;
    const strong = hit.power > 0.6 || hit.finisher;
    const transformed = g.player.form !== 'base';
    // Tilt away from the hit direction (local space)
    const local = hit.dir.clone().applyQuaternion(this.group.quaternion.clone().invert());
    const push = Math.min(2.2, 0.5 + hit.damage * 0.05) * (hit.kind === 'blast' ? 0.7 : 1);
    this.tiltVel.x += local.z * push * 4;
    this.tiltVel.y += -local.x * push * 4;
    this.flash = 1;
    this.durability -= hit.damage;
    g.effects.number(hit.point.clone().add(new THREE.Vector3(0, 0.25, 0)), Math.round(hit.damage), hit.finisher ? '#ffcc33' : transformed ? '#ffe066' : '#ffffff', hit.finisher);
    if (hit.kind === 'punch') {
      // Strength XP: harder punches and combos give more.
      const xp = 2 + 3 * hit.power + (hit.combo > 1 ? 1 : 0) + (hit.finisher ? 4 : 0);
      g.training.sessionXp += g.progress.addXp('strength', xp * g.training.xpMult, 'dummy');
      g.progress.data.totalPunches += 1;
      if (hit.finisher || (strong && (g.progress.level('strength') >= 5 || transformed))) {
        g.effects.crack(this.group.position.clone().add(new THREE.Vector3(0, 0, 0.5)), 1 + hit.power);
      }
    } else {
      g.training.sessionXp += g.progress.addXp('ki', (hit.charged ? 4 : 1.5) * g.training.xpMult, 'dummy-blast');
    }
    if (this.durability <= 0) this.breakApart();
  }

  breakApart() {
    const g = this.game;
    this.broken = 1.6;
    this.pivot.visible = false;
    const c = this.group.position.clone().add(new THREE.Vector3(0, 1.2, 0));
    g.effects.burst(c, 0x8a5a32, 30, 4, 0.1, 1.2, { grav: 9, up: 2, drag: 0.4 });
    g.effects.burst(c, 0xd94a3a, 20, 3, 0.1, 1.0, { grav: 9, up: 2, drag: 0.4 });
    g.effects.ring(this.group.position.clone(), 0xffffff, { maxRadius: 3, duration: 0.6, opacity: 0.6 });
    g.audio.explosion(0.6);
    g.training.sessionXp += g.progress.addXp('strength', 15 * g.training.xpMult, 'dummy-break');
    bus.emit('hud:message', { text: 'Dummy destroyed! +Strength bonus', color: '#ffcc33' });
  }

  update(dt) {
    if (this.broken > 0) {
      this.broken -= dt;
      if (this.broken <= 0) {
        this.pivot.visible = true;
        this.durability = this.maxDurability;
        this.tilt.set(0, 0);
        this.tiltVel.set(0, 0);
      }
      return;
    }
    // Damped spring back to upright
    const k = 60;
    const d = 7;
    this.tiltVel.x += (-k * this.tilt.x - d * this.tiltVel.x) * dt;
    this.tiltVel.y += (-k * this.tilt.y - d * this.tiltVel.y) * dt;
    this.tilt.x = clamp(this.tilt.x + this.tiltVel.x * dt, -0.6, 0.6);
    this.tilt.y = clamp(this.tilt.y + this.tiltVel.y * dt, -0.6, 0.6);
    this.pivot.rotation.set(this.tilt.x, 0, this.tilt.y);
    this.flash = Math.max(0, this.flash - dt * 5);
    this.padMat.emissive.setRGB(this.flash * 0.8, this.flash * 0.7, this.flash * 0.5);
  }
}
