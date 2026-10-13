import * as THREE from 'three';
import { softCircleTexture } from '../render/toon.js';
import { rand } from '../core/math.js';

const MAX_PARTICLES = 700;

// One pooled additive point cloud for every particle in the game (sparks,
// energy streams, debris, impact bursts) = one draw call.
class ParticlePool {
  constructor(scene) {
    this.count = MAX_PARTICLES;
    this.budget = 1;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.count * 3);
    this.col = new Float32Array(this.count * 3);
    this.size = new Float32Array(this.count);
    this.alpha = new Float32Array(this.count);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1000);
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: softCircleTexture() }, scale: { value: 600 } },
      // Particles fade out when very close to the eyes and their on-screen size
      // is capped, so bursts never fill the player's view.
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float scale;
        void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); float d = -mv.z;
          vA = alpha * smoothstep(0.25, 0.8, d);
          gl_PointSize = min(size * scale / max(0.1, d), 0.06 * scale); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vC; varying float vA;
        void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC * t.a * vA, 1.0); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    scene.add(this.points);
    this.p = [];
    for (let i = 0; i < this.count; i++) {
      this.p.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0.05, r: 1, g: 1, b: 1, drag: 0, grav: 0 });
    }
    this.cursor = 0;
  }

  spawn(o) {
    // Respect the quality budget by randomly skipping spawns.
    if (this.budget < 1 && Math.random() > this.budget) return;
    const p = this.p[this.cursor];
    this.cursor = (this.cursor + 1) % this.count;
    p.life = p.max = o.life ?? 0.6;
    p.x = o.x; p.y = o.y; p.z = o.z;
    p.vx = o.vx ?? 0; p.vy = o.vy ?? 0; p.vz = o.vz ?? 0;
    p.size = o.size ?? 0.06;
    const c = o.color;
    p.r = c.r; p.g = c.g; p.b = c.b;
    p.drag = o.drag ?? 1.5;
    p.grav = o.grav ?? 0;
  }

  update(dt) {
    for (let i = 0; i < this.count; i++) {
      const p = this.p[i];
      const i3 = i * 3;
      if (p.life <= 0) {
        this.alpha[i] = 0;
        this.size[i] = 0;
        continue;
      }
      p.life -= dt;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy = p.vy * k - p.grav * dt; p.vz *= k;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const t = Math.max(0, p.life / p.max);
      this.pos[i3] = p.x; this.pos[i3 + 1] = p.y; this.pos[i3 + 2] = p.z;
      this.col[i3] = p.r; this.col[i3 + 1] = p.g; this.col[i3 + 2] = p.b;
      this.size[i] = p.size * (0.4 + 0.6 * t);
      this.alpha[i] = t;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.attributes.size.needsUpdate = true;
    g.attributes.alpha.needsUpdate = true;
  }
}

// Jagged electric arc rendered as two crossed ribbons so it stays visible in
// VR (1px GL lines disappear on a headset).
export class Lightning {
  constructor(color = 0xbfe9ff, segments = 10) {
    this.segments = segments;
    const verts = segments * 2 * 6; // 2 ribbons x 2 triangles x 3 verts per segment
    this.geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(verts * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    this.mesh.visible = false;
    this.timer = 0;
  }

  set(a, b, width = 0.012, jitter = 0.06) {
    const n = this.segments;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = new THREE.Vector3().lerpVectors(a, b, t);
      if (i > 0 && i < n) p.add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(jitter));
      pts.push(p);
    }
    let k = 0;
    const put = (v) => { this.positions[k++] = v.x; this.positions[k++] = v.y; this.positions[k++] = v.z; };
    const offs = [new THREE.Vector3(0, width, 0), new THREE.Vector3(width, 0, 0)];
    for (let i = 0; i < n; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      for (const o of offs) {
        const a0 = p0.clone().add(o); const a1 = p0.clone().sub(o);
        const b0 = p1.clone().add(o); const b1 = p1.clone().sub(o);
        put(a0); put(a1); put(b0);
        put(a1); put(b1); put(b0);
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.mesh.visible = true;
  }
}

// Procedural crack decal texture (drawn once).
function crackTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(40,25,10,0.95)';
  g.lineCap = 'round';
  const branch = (x, y, ang, len, w, depth) => {
    if (depth <= 0 || len < 6) return;
    const nx = x + Math.cos(ang) * len;
    const ny = y + Math.sin(ang) * len;
    g.lineWidth = w;
    g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
    branch(nx, ny, ang + rand(-0.5, 0.5), len * 0.75, w * 0.7, depth - 1);
    if (Math.random() < 0.5) branch(nx, ny, ang + rand(-1.2, 1.2), len * 0.5, w * 0.6, depth - 2);
  };
  for (let i = 0; i < 9; i++) branch(128, 128, (i / 9) * Math.PI * 2 + rand(-0.2, 0.2), rand(28, 40), 7, 5);
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 40);
  grd.addColorStop(0, 'rgba(60,40,20,0.6)');
  grd.addColorStop(1, 'rgba(60,40,20,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const _v = new THREE.Vector3();

// Central effects manager: particles, expanding shockwave rings, ground
// cracks, impact flashes and floating damage numbers.
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.particles = new ParticlePool(scene);
    this.intensity = 0.8; // visual intensity setting
    this.rings = [];
    this.cracks = [];
    this.flashes = [];
    this.numbers = [];
    this.crackTex = crackTexture();
    this.ringGeo = new THREE.RingGeometry(0.85, 1, 48);
    this.ringGeo.rotateX(-Math.PI / 2);
    this.sphereGeo = new THREE.SphereGeometry(1, 16, 12);
    this.colTmp = new THREE.Color();
  }

  setBudget(b) { this.particles.budget = b; }

  burst(pos, color, count = 12, speed = 2, size = 0.06, life = 0.5, opts = {}) {
    const c = this.colTmp.set(color);
    for (let i = 0; i < count; i++) {
      const dir = _v.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
      const s = speed * rand(0.4, 1);
      this.particles.spawn({
        x: pos.x, y: pos.y, z: pos.z,
        vx: dir.x * s, vy: dir.y * s + (opts.up || 0), vz: dir.z * s,
        size: size * rand(0.6, 1.3), life: life * rand(0.6, 1.2), color: c, drag: opts.drag ?? 2.5, grav: opts.grav ?? 0,
      });
    }
  }

  stream(pos, color, { vy = 1.2, spread = 0.05, size = 0.04, life = 0.5 } = {}) {
    this.particles.spawn({
      x: pos.x + rand(-spread, spread), y: pos.y + rand(-spread, spread), z: pos.z + rand(-spread, spread),
      vx: rand(-0.2, 0.2), vy, vz: rand(-0.2, 0.2), size, life, color: this.colTmp.set(color), drag: 0.5,
    });
  }

  // Expanding ring. `vertical` rings face the camera direction (punch impacts),
  // ground rings lie flat (shockwaves). Kept translucent: no blinding flashes.
  ring(pos, color, { maxRadius = 6, duration = 0.8, vertical = false, normal = null, opacity = 0.8, y = null } = {}) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(this.ringGeo, mat);
    m.position.copy(pos);
    if (y !== null) m.position.y = y;
    if (vertical && normal) m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    m.scale.setScalar(0.05);
    m.renderOrder = 8;
    this.scene.add(m);
    this.rings.push({ m, t: 0, duration, maxRadius, opacity: opacity * this.intensity });
  }

  flash(pos, color, size = 0.3, duration = 0.15) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 * this.intensity, blending: THREE.AdditiveBlending, depthWrite: false });
    const m = new THREE.Mesh(this.sphereGeo, mat);
    m.position.copy(pos);
    m.scale.setScalar(size * 0.3);
    this.scene.add(m);
    this.flashes.push({ m, t: 0, duration, size });
  }

  crack(pos, size = 1.5) {
    const mat = new THREE.MeshBasicMaterial({ map: this.crackTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.random() * Math.PI * 2;
    m.position.set(pos.x, 0.025, pos.z);
    this.scene.add(m);
    this.cracks.push({ m, t: 0, duration: 6 });
    if (this.cracks.length > 8) this.removeCrack(this.cracks.shift());
    // Debris
    this.burst(new THREE.Vector3(pos.x, 0.1, pos.z), 0x8a6a4c, 14, 3, 0.08, 0.9, { up: 3, grav: 9, drag: 0.5 });
  }

  removeCrack(c) {
    this.scene.remove(c.m);
    c.m.geometry.dispose();
    c.m.material.dispose();
  }

  number(pos, value, color = '#ffffff', big = false) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 96;
    const g = c.getContext('2d');
    g.font = `bold ${big ? 72 : 56}px Trebuchet MS, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 10;
    g.strokeStyle = '#1a0d00';
    g.strokeText(String(value), 128, 48);
    g.fillStyle = color;
    g.fillText(String(value), 128, 48);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    s.position.copy(pos);
    const k = big ? 0.55 : 0.4;
    s.scale.set(k, k * 0.375, 1);
    s.renderOrder = 20;
    this.scene.add(s);
    this.numbers.push({ s, t: 0, duration: 0.9, vx: rand(-0.3, 0.3) });
    if (this.numbers.length > 14) this.removeNumber(this.numbers.shift());
  }

  removeNumber(n) {
    this.scene.remove(n.s);
    n.s.material.map.dispose();
    n.s.material.dispose();
  }

  update(dt) {
    this.particles.update(dt);
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      const k = r.t / r.duration;
      r.m.scale.setScalar(0.05 + r.maxRadius * (1 - Math.pow(1 - Math.min(1, k), 3)));
      r.m.material.opacity = r.opacity * (1 - k);
      if (k >= 1) {
        this.scene.remove(r.m);
        r.m.material.dispose();
        this.rings.splice(i, 1);
      }
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t += dt;
      const k = f.t / f.duration;
      f.m.scale.setScalar(f.size * (0.3 + 0.7 * k));
      f.m.material.opacity = 0.85 * this.intensity * (1 - k);
      if (k >= 1) {
        this.scene.remove(f.m);
        f.m.material.dispose();
        this.flashes.splice(i, 1);
      }
    }
    for (let i = this.cracks.length - 1; i >= 0; i--) {
      const c = this.cracks[i];
      c.t += dt;
      c.m.material.opacity = Math.min(1, (c.duration - c.t) / 1.5);
      if (c.t >= c.duration) {
        this.removeCrack(c);
        this.cracks.splice(i, 1);
      }
    }
    for (let i = this.numbers.length - 1; i >= 0; i--) {
      const n = this.numbers[i];
      n.t += dt;
      n.s.position.y += dt * 0.6;
      n.s.position.x += n.vx * dt;
      n.s.material.opacity = 1 - Math.max(0, (n.t - 0.5) / 0.4);
      if (n.t >= n.duration) {
        this.removeNumber(n);
        this.numbers.splice(i, 1);
      }
    }
  }
}
