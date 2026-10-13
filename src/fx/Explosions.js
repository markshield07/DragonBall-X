import * as THREE from 'three';
import { bus } from '../core/events.js';
import { clamp, rand } from '../core/math.js';
import { toon, toonUnique } from '../render/toon.js';
import { terrainHeight } from '../world/Arena.js';

const MAX_BALLS = 8;
const MAX_PUFFS = 48;
const MAX_ROCKS = 72;
const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _s2 = new THREE.Color();

// Anime ki explosions, sized by how much energy went into the attack:
// a white-hot core, a coloured shock shell, cel-shaded smoke that starts out
// glowing in the blast colour and cools to dust, flying rock chunks and a
// ground shockwave + crater when it goes off near the ground. Everything is
// pooled, so a barrage of small blasts costs the same meshes as one big one.
//
// energy ~0.3 = a jab-sized ki blast, ~1.5 = a charged blast, 3 = Spirit Bomb.
export class Explosions {
  constructor(scene, fx) {
    this.scene = scene;
    this.fx = fx;
    this.eye = new THREE.Vector3(0, 1.6, 0);
    const ball = new THREE.IcosahedronGeometry(1, 3);
    this.balls = [];
    for (let i = 0; i < MAX_BALLS; i++) {
      const core = new THREE.Mesh(ball, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      const shell = new THREE.Mesh(ball, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      for (const m of [core, shell]) { m.visible = false; m.frustumCulled = false; m.renderOrder = 7; scene.add(m); }
      this.balls.push({ core, shell, t: 1, dur: 1, R: 1, color: new THREE.Color() });
    }
    this.ballCursor = 0;
    // Smoke puffs: lumpy cel-shaded spheres. Their emissive glow fades from the
    // blast colour to nothing, so fire turns into smoke like an anime explosion.
    const puff = new THREE.SphereGeometry(1, 18, 12); // indexed, so normals stay smooth
    const pp = puff.attributes.position;
    for (let i = 0; i < pp.count; i++) {
      _v.fromBufferAttribute(pp, i);
      const k = 1 + 0.06 * Math.sin(_v.x * 2.6 + _v.y * 1.9) * Math.cos(_v.z * 2.2 - _v.y * 1.3);
      pp.setXYZ(i, _v.x * k, _v.y * k, _v.z * k);
    }
    puff.computeVertexNormals();
    this.puffs = [];
    for (let i = 0; i < MAX_PUFFS; i++) {
      const mat = toonUnique(0xb8ab98);
      mat.transparent = true;
      mat.depthWrite = false;
      mat.emissive = new THREE.Color();
      const m = new THREE.Mesh(puff, mat);
      m.visible = false;
      m.renderOrder = 5;
      scene.add(m);
      this.puffs.push({ m, life: 0, max: 1, vel: new THREE.Vector3(), size: 1, glow: new THREE.Color(), glowTime: 0.3, smoke: new THREE.Color(), spin: 0, opacity: 1 });
    }
    this.puffCursor = 0;
    // Rock chunks: one instanced mesh = one draw call for every chunk in flight.
    const rock = new THREE.DodecahedronGeometry(1, 0);
    rock.scale(1, 0.7, 0.85);
    this.rockMesh = new THREE.InstancedMesh(rock, toon(0x8a7058), MAX_ROCKS);
    this.rockMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rockMesh.frustumCulled = false;
    this.rockMesh.castShadow = false;
    scene.add(this.rockMesh);
    this.rocks = [];
    for (let i = 0; i < MAX_ROCKS; i++) {
      this.rocks.push({ life: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Vector3(), spin: new THREE.Vector3(), size: 0.1 });
      this.rockMesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
    }
    this.rockCursor = 0;
  }

  // How much "energy" a projectile carries, from its size, damage and type.
  static energyOf(p) {
    const e = p.radius * 2.6 + Math.log10(1 + p.damage) * 0.32 + (p.charged ? 0.3 : 0) + (p.kind === 'sphere' ? 0.6 : 0) + (p.kind === 'mega' ? 0.4 : 0);
    return clamp(e, 0.15, 3);
  }

  explode(pos, color, energy = 1) {
    const budget = this.fx.particles.budget;
    const R = 0.3 + 1.15 * energy;
    const floor = terrainHeight(pos.x, pos.z);
    const height = pos.y - floor;
    const ground = height < R * 0.9;
    const center = _v.copy(pos);
    if (ground) center.y = Math.max(pos.y, floor + R * 0.25);
    // Point-blank (an enemy blast hitting you in the face): just the flash and
    // sparks, so smoke never fills the headset.
    const near = center.distanceTo(this.eye) < 1.2 + R * 0.4;
    const c = _c.set(color);

    // Sparks + flash (shared particle pool).
    this.fx.burst(center, color, Math.round(8 + 28 * energy), 2 + 4 * energy, 0.05 + 0.05 * energy, 0.45 + 0.25 * energy, { drag: 2 });
    this.fx.burst(center, 0xffffff, Math.round(4 + 10 * energy), 3 + 5 * energy, 0.04 + 0.03 * energy, 0.3);
    if (energy > 0.9) this.fx.burst(center, 0xffb347, Math.round(10 * energy), 1.5 + 2 * energy, 0.12 * energy, 0.9, { up: 1.5, drag: 1.2 });

    if (!near) {
      // Fireball: white core that blooms then collapses, coloured shell that keeps expanding.
      const b = this.balls[this.ballCursor];
      this.ballCursor = (this.ballCursor + 1) % MAX_BALLS;
      b.t = 0;
      b.dur = 0.35 + 0.35 * Math.min(2, energy);
      b.R = R;
      b.color.copy(c);
      b.core.position.copy(center);
      b.shell.position.copy(center);
      b.shell.material.color.copy(c);
      b.core.visible = b.shell.visible = true;

      // Smoke: a glowing ball of puffs; near the ground it also rolls outward as a dust wall.
      const n = Math.round((3 + 9 * energy) * Math.max(0.4, budget));
      for (let i = 0; i < n; i++) {
        const dir = new THREE.Vector3(rand(-1, 1), rand(-0.3, 1), rand(-1, 1)).normalize();
        const p = this.nextPuff();
        p.m.position.copy(center).addScaledVector(dir, R * rand(0.1, 0.45));
        p.vel.copy(dir).multiplyScalar(R * rand(0.9, 1.8));
        p.vel.y += R * 0.5;
        p.size = R * rand(0.3, 0.5);
        p.max = p.life = rand(1.0, 1.6) * (0.8 + 0.35 * energy);
        p.glow.copy(c).lerp(new THREE.Color(0xffe6a0), 0.35);
        p.glowTime = 0.25 + 0.15 * energy;
        p.smoke.set(0x9c9488);
        p.spin = rand(-1, 1);
        p.opacity = 0.95;
      }
      // Big blasts throw up a mushroom column of fire and smoke.
      if (energy > 1) {
        const col = Math.round((2 + 3 * energy) * Math.max(0.4, budget));
        for (let i = 0; i < col; i++) {
          const p = this.nextPuff();
          p.m.position.copy(center).add(_s.set(rand(-0.2, 0.2) * R, rand(0, 0.3) * R, rand(-0.2, 0.2) * R));
          p.vel.set(rand(-0.3, 0.3) * R, R * rand(1.4, 2.6), rand(-0.3, 0.3) * R);
          p.size = R * rand(0.3, 0.45);
          p.max = p.life = rand(1.4, 2.0) * (0.8 + 0.3 * energy);
          p.glow.copy(c).lerp(_s2.set(0xffc060), 0.5);
          p.glowTime = 0.35 + 0.15 * energy;
          p.smoke.set(0x8f8780);
          p.spin = rand(-1, 1);
          p.opacity = 0.95;
        }
      }
      if (ground) {
        const ring = Math.round((4 + 8 * energy) * Math.max(0.4, budget));
        for (let i = 0; i < ring; i++) {
          const a = (i / ring) * Math.PI * 2 + rand(-0.2, 0.2);
          const p = this.nextPuff();
          p.m.position.set(pos.x + Math.cos(a) * R * 0.5, floor + R * 0.15, pos.z + Math.sin(a) * R * 0.5);
          p.vel.set(Math.cos(a), 0.12, Math.sin(a)).multiplyScalar(R * rand(1.8, 2.8));
          p.size = R * rand(0.25, 0.42);
          p.max = p.life = rand(1.2, 1.9) * (0.8 + 0.3 * energy);
          p.glow.copy(c).multiplyScalar(0.5);
          p.glowTime = 0.15;
          p.smoke.set(0xc9b691);
          p.spin = rand(-1, 1);
          p.opacity = 0.9;
        }
      }
    }

    if (ground) {
      // Crater, ground shockwave and flying rocks.
      const g = new THREE.Vector3(pos.x, floor, pos.z);
      this.fx.ring(g, color, { maxRadius: R * 3.2, duration: 0.55 + 0.2 * energy, opacity: 0.6, y: floor + 0.06 });
      if (energy > 0.7) this.fx.ring(g, 0xffffff, { maxRadius: R * 5, duration: 0.9 + 0.2 * energy, opacity: 0.3, y: floor + 0.05 });
      if (energy > 0.45 && floor < 0.5) this.fx.crack(g, R * 1.6);
      const rocks = Math.round((energy < 0.45 ? 2 : 4 + 14 * energy) * Math.max(0.4, budget));
      for (let i = 0; i < rocks; i++) {
        const r = this.rocks[this.rockCursor];
        this.rockCursor = (this.rockCursor + 1) % MAX_ROCKS;
        const a = rand(0, Math.PI * 2);
        const out = rand(0.3, 1);
        r.pos.set(pos.x + Math.cos(a) * R * 0.3 * out, floor + 0.05, pos.z + Math.sin(a) * R * 0.3 * out);
        const sp = (2.5 + 4 * Math.sqrt(energy)) * rand(0.5, 1.1);
        r.vel.set(Math.cos(a) * sp * out, sp * rand(0.9, 1.8), Math.sin(a) * sp * out);
        r.rot.set(rand(0, 6), rand(0, 6), rand(0, 6));
        r.spin.set(rand(-9, 9), rand(-9, 9), rand(-9, 9));
        r.size = rand(0.05, 0.13) * (0.6 + 0.6 * Math.min(2, energy));
        r.life = rand(1.6, 2.4);
        r.bounced = false;
      }
    }
    bus.emit('fx:shake', { position: center.clone(), amount: 0.04 + 0.12 * energy, energy });
  }

  // A low dust cloud (landings, slides, dashes). No glow, no shake.
  dust(pos, size = 0.6, count = 3, color = 0xc9b691) {
    if (Math.random() > Math.max(0.35, this.fx.particles.budget)) return;
    for (let i = 0; i < count; i++) {
      const p = this.nextPuff();
      const a = rand(0, Math.PI * 2);
      p.m.position.set(pos.x + Math.cos(a) * size * 0.4, pos.y + size * 0.2, pos.z + Math.sin(a) * size * 0.4);
      p.vel.set(Math.cos(a) * size * rand(0.8, 1.8), size * rand(0.3, 0.8), Math.sin(a) * size * rand(0.8, 1.8));
      p.size = size * rand(0.35, 0.6);
      p.max = p.life = rand(0.8, 1.3);
      p.glow.setRGB(0, 0, 0);
      p.glowTime = 0.01;
      p.smoke.set(color);
      p.spin = rand(-1, 1);
      p.opacity = 0.75;
    }
  }

  nextPuff() {
    const p = this.puffs[this.puffCursor];
    this.puffCursor = (this.puffCursor + 1) % MAX_PUFFS;
    p.m.visible = true;
    p.m.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
    return p;
  }

  update(dt) {
    for (const b of this.balls) {
      if (!b.core.visible) continue;
      b.t += dt;
      const k = b.t / b.dur;
      if (k >= 1) { b.core.visible = b.shell.visible = false; continue; }
      const bloom = Math.min(1, b.t / 0.07);
      b.core.scale.setScalar(b.R * (0.25 + 0.6 * bloom) * (1 - k * 0.7));
      b.core.material.opacity = (1 - k) * 0.95;
      b.core.material.color.copy(b.color).lerp(_c.set(0xffffff), 1 - k * 1.4 > 0 ? 1 - k * 1.4 : 0);
      b.shell.scale.setScalar(b.R * (0.35 + 0.85 * (1 - Math.pow(1 - k, 3))));
      b.shell.material.opacity = 0.75 * Math.pow(1 - k, 1.6);
    }
    for (const p of this.puffs) {
      if (!p.m.visible) continue;
      p.life -= dt;
      if (p.life <= 0) { p.m.visible = false; continue; }
      const age = p.max - p.life;
      const t = age / p.max;
      p.vel.multiplyScalar(Math.exp(-dt * 3.2));
      p.vel.y += dt * 0.35;
      p.m.position.addScaledVector(p.vel, dt);
      p.m.rotation.y += p.spin * dt;
      p.m.scale.setScalar(p.size * (0.45 + 0.75 * (1 - Math.pow(1 - Math.min(1, t * 1.6), 2))));
      const mat = p.m.material;
      const glow = Math.max(0, 1 - age / p.glowTime);
      mat.emissive.copy(p.glow).multiplyScalar(glow * 1.3);
      mat.color.copy(p.smoke).lerp(p.glow, glow * 0.6);
      // Fade out at the end of its life, and when it drifts up to your eyes.
      const near = clamp((p.m.position.distanceTo(this.eye) - p.m.scale.x - 0.25) / 0.8, 0, 1);
      mat.opacity = p.opacity * Math.min(1, (1 - t) / 0.45) * near;
    }
    let any = false;
    for (let i = 0; i < MAX_ROCKS; i++) {
      const r = this.rocks[i];
      if (r.life <= 0) continue;
      any = true;
      r.life -= dt;
      r.vel.y -= 20 * dt;
      r.pos.addScaledVector(r.vel, dt);
      const floor = terrainHeight(r.pos.x, r.pos.z) + r.size * 0.6;
      if (r.pos.y < floor) {
        r.pos.y = floor;
        if (!r.bounced && r.vel.y < -2) { r.vel.y *= -0.3; r.vel.x *= 0.5; r.vel.z *= 0.5; r.bounced = true; } else { r.vel.set(0, 0, 0); r.spin.set(0, 0, 0); }
      }
      r.rot.addScaledVector(r.spin, dt);
      const s = r.size * Math.min(1, r.life / 0.4);
      _m.compose(r.pos, _q.setFromEuler(_e.set(r.rot.x, r.rot.y, r.rot.z)), _s.set(s, s, s));
      this.rockMesh.setMatrixAt(i, _m);
      if (r.life <= 0) this.rockMesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
    }
    if (any || this.rocksWereActive) this.rockMesh.instanceMatrix.needsUpdate = true;
    this.rocksWereActive = any;
  }
}
