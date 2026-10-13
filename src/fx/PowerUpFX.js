import * as THREE from 'three';
import { toon } from '../render/toon.js';
import { rand } from '../core/math.js';

// Dragon Ball power-up: rocks break off the ground and float up around the
// fighter, dust rings pulse outward, and everything drops when the power-up
// stops. One pooled InstancedMesh, so it costs a single draw call.
const MAX = 14;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();

export class PowerUpFX {
  constructor(scene, effects) {
    this.effects = effects;
    this.mesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), toon(0x8a6a4c, { flat: true }), MAX);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.rocks = [];
    this.spawnTimer = 0;
    this.ringTimer = 0;
  }

  // center: the fighter's feet (world). level: 0..1 power-up intensity (0 = off).
  update(dt, center, level, ringColor = 0xdcc9a8) {
    const on = level > 0.01;
    if (on) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.rocks.length < MAX) {
        this.spawnTimer = rand(0.12, 0.3) / (0.5 + level);
        const a = rand(0, Math.PI * 2), r = rand(0.9, 2.3);
        this.rocks.push({
          pos: new THREE.Vector3(center.x + Math.cos(a) * r, center.y + 0.02, center.z + Math.sin(a) * r),
          vy: rand(0.35, 0.8), top: center.y + rand(0.9, 2.6), size: rand(0.03, 0.11) * (0.7 + 0.5 * level),
          rot: new THREE.Vector3(rand(0, 6), rand(0, 6), rand(0, 6)), spin: new THREE.Vector3(rand(-2, 2), rand(-2, 2), rand(-2, 2)),
          phase: rand(0, 6), falling: false, life: 1,
        });
      }
      this.ringTimer -= dt;
      if (this.ringTimer <= 0) {
        this.ringTimer = 0.75 - 0.3 * level;
        this.effects.ring(center, ringColor, { maxRadius: 2.2 + 1.5 * level, duration: 0.9, opacity: 0.35 + 0.3 * level, y: center.y + 0.04 });
      }
    }
    let n = 0;
    for (let i = this.rocks.length - 1; i >= 0; i--) {
      const k = this.rocks[i];
      k.phase += dt;
      if (!on) k.falling = true;
      if (k.falling) {
        k.vy -= 9 * dt;
        k.pos.y += k.vy * dt;
        if (k.pos.y < center.y - 0.05) k.life -= dt * 3;
      } else {
        // Rise, then bob in the air while the power-up lasts.
        if (k.pos.y < k.top) k.pos.y += k.vy * dt;
        else k.pos.y = k.top + Math.sin(k.phase * 2) * 0.03;
        k.vy = Math.max(k.vy, 0);
      }
      k.rot.addScaledVector(k.spin, dt);
      if (k.life <= 0) { this.rocks.splice(i, 1); continue; }
      _s.setScalar(k.size * Math.max(0, k.life));
      _m.compose(k.pos, _q.setFromEuler(_e.set(k.rot.x, k.rot.y, k.rot.z)), _s);
      this.mesh.setMatrixAt(n++, _m);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
