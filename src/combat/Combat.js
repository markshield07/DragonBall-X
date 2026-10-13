import * as THREE from 'three';
import { bus } from '../core/events.js';
import { clamp } from '../core/math.js';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

// Combat & collisions: target registry, punch contact tests, pooled ki
// projectiles (player and enemy), and damage formulas.
//
// A target is { id, team, sphere(): {center: Vector3, radius}, onPunch(hit), onBlast(hit), active() }.
export class Combat {
  constructor(scene, effects) {
    this.scene = scene;
    this.fx = effects;
    this.targets = new Set();
    this.projectiles = [];
    this.coreGeo = new THREE.SphereGeometry(1, 14, 10);
    this.contact = new Map(); // hand -> current swing state
    this.combo = { count: 0, timer: 0, lastHand: null };
  }

  addTarget(t) { this.targets.add(t); return () => this.targets.delete(t); }
  removeTarget(t) { this.targets.delete(t); }

  // ---- Punches -------------------------------------------------------------
  // Called every frame per hand with its world position and velocity.
  // A "swing" opens when the hand moves faster than the punch threshold and
  // stays open briefly, so a fist that is decelerating on contact (or a low
  // frame rate) still lands. Each swing can hit each target once. The hand's
  // path since last frame is swept, so fast punches can't pass through.
  testPunch(hand, pos, vel, ctx) {
    // Only movement away from the body counts (pulling the fist back doesn't).
    const out = _a.subVectors(pos, ctx.head).normalize();
    const speed = Math.max(0, vel.dot(out)) * 0.6 + vel.length() * 0.4 * (vel.dot(out) > 0 ? 1 : 0);
    let sw = this.contact.get(hand);
    if (!sw) {
      sw = { window: 0, peak: 0, dir: new THREE.Vector3(0, 0, -1), hit: new Set(), prev: pos.clone() };
      this.contact.set(hand, sw);
    }
    if (speed >= ctx.minPunchSpeed) {
      if (sw.window <= 0) { sw.hit.clear(); sw.peak = 0; }
      sw.window = 0.16;
      if (speed > sw.peak) { sw.peak = speed; sw.dir.copy(vel).normalize(); }
    } else {
      sw.window -= ctx.dt;
    }
    if (sw.window > 0) {
      for (const t of this.targets) {
        if (t.team !== 'enemy' || (t.active && !t.active()) || sw.hit.has(t)) continue;
        const s = t.sphere();
        if (!segmentSphere(sw.prev, pos, s.center, s.radius + 0.07)) continue;
        sw.hit.add(t);
        const power = clamp((sw.peak - ctx.minPunchSpeed) / 3.2, 0.05, 1);
        // Combo: alternating or quick successive hits.
        const c = this.combo;
        if (c.timer > 0 && c.lastHand !== hand) c.count = Math.min(c.count + 1, ctx.comboCap);
        else if (c.timer <= 0) c.count = 1;
        c.timer = 0.9;
        c.lastHand = hand;
        const finisher = c.count >= ctx.comboCap && ctx.comboCap >= 3;
        const dmg = ctx.punchDamage(power, c.count, finisher);
        const hit = { hand, power, damage: dmg, dir: sw.dir.clone(), point: pos.clone(), combo: c.count, finisher, kind: 'punch' };
        if (finisher) c.count = 0;
        t.onPunch?.(hit);
        bus.emit('punch:hit', { ...hit, target: t });
      }
    }
    sw.prev.copy(pos);
  }

  update(dt) {
    if (this.combo.timer > 0) this.combo.timer -= dt;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      p.prev.copy(p.mesh.position);
      if (p.homing && p.homing.target) {
        const want = _a.subVectors(p.homing.target(), p.mesh.position).normalize().multiplyScalar(p.speed);
        p.vel.lerp(want, Math.min(1, dt * p.homing.strength));
      }
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.z += dt * 8;
      const pulse = 1 + Math.sin(p.life * 40) * 0.08;
      p.mesh.scale.setScalar(p.radius * pulse);
      // Trail
      if (Math.random() < 0.7) this.fx.stream(p.mesh.position, p.color, { vy: 0, spread: p.radius * 0.5, size: p.radius * 0.9, life: 0.25 });
      let done = p.life <= 0 || p.mesh.position.y < 0;
      if (!done) done = this.collideProjectile(p);
      if (done) {
        if (p.life > 0) this.explode(p);
        this.removeProjectile(i);
      }
    }
  }

  // ---- Projectiles -----------------------------------------------------------
  fire({ origin, dir, speed, radius, damage, color, team = 'player', charged = false, homing = null, life = 3, owner = null, kind = 'blast' }) {
    const group = new THREE.Group();
    const core = new THREE.Mesh(this.coreGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    core.scale.setScalar(0.55);
    const shell = new THREE.Mesh(this.coreGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    group.add(core, shell);
    group.position.copy(origin);
    group.scale.setScalar(radius);
    this.scene.add(group);
    const p = {
      mesh: group, vel: dir.clone().normalize().multiplyScalar(speed), speed, radius, damage, color, team, charged,
      life, homing, owner, kind, prev: origin.clone(), shell,
    };
    this.projectiles.push(p);
    return p;
  }

  collideProjectile(p) {
    if (p.team === 'player') {
      for (const t of this.targets) {
        if (t.team !== 'enemy' || (t.active && !t.active())) continue;
        const s = t.sphere();
        if (segmentSphere(p.prev, p.mesh.position, s.center, s.radius + p.radius)) {
          const hit = { damage: p.damage, dir: p.vel.clone().normalize(), point: p.mesh.position.clone(), charged: p.charged, kind: 'blast', power: p.charged ? 1 : 0.4 };
          t.onBlast?.(hit);
          bus.emit('blast:hit', { ...hit, target: t });
          return true;
        }
      }
    } else {
      for (const t of this.targets) {
        if (t.team !== 'player') continue;
        const res = t.testProjectile?.(p);
        if (res) return true;
      }
    }
    return false;
  }

  explode(p) {
    const s = p.charged ? 1 : 0.4;
    this.fx.burst(p.mesh.position, p.color, p.charged ? 26 : 10, 3 * s + 1, 0.1 * s + 0.05, 0.5);
    this.fx.flash(p.mesh.position, p.color, p.radius * 4, 0.18);
    bus.emit('projectile:explode', { position: p.mesh.position.clone(), charged: p.charged, team: p.team, kind: p.kind });
  }

  removeProjectile(i) {
    const p = this.projectiles[i];
    this.scene.remove(p.mesh);
    p.mesh.children.forEach((c) => c.material.dispose());
    this.projectiles.splice(i, 1);
  }

  clearProjectiles(team = null) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      if (!team || this.projectiles[i].team === team) this.removeProjectile(i);
    }
  }
}

// Swept sphere test so fast projectiles can't tunnel through targets.
export function segmentSphere(a, b, c, r) {
  const ab = _a.subVectors(b, a);
  const ac = _b.subVectors(c, a);
  const len2 = ab.lengthSq();
  const t = len2 > 0 ? clamp(ac.dot(ab) / len2, 0, 1) : 0;
  const px = a.x + ab.x * t - c.x;
  const py = a.y + ab.y * t - c.y;
  const pz = a.z + ab.z * t - c.z;
  return px * px + py * py + pz * pz <= r * r;
}

