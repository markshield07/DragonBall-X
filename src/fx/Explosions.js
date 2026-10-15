import * as THREE from 'three';
import { bus } from '../core/events.js';
import { clamp, rand } from '../core/math.js';
import { toon, toonUnique } from '../render/toon.js';
import { terrainHeight } from '../world/Arena.js';

const MAX_BALLS = 8;
const MAX_PUFFS = 80;
const MAX_ROCKS = 96;
const MAX_CRATERS = 6;
const MAX_SCORCH = 16;
const CRATER_ENERGY = 3.5; // only the really big attacks dig craters
const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _s2 = new THREE.Color();
const _dh = new THREE.Vector3();
const _dh2 = new THREE.Vector3();
const _dn = new THREE.Vector3();

// Scorched crater floor: dark centre, a lighter churned ring, radial cracks.
function craterTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, 'rgba(28,18,12,0.95)');
  grd.addColorStop(0.45, 'rgba(58,38,24,0.92)');
  grd.addColorStop(0.72, 'rgba(110,80,52,0.85)');
  grd.addColorStop(0.86, 'rgba(150,118,80,0.6)');
  grd.addColorStop(1, 'rgba(150,118,80,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(15,8,4,0.8)';
  g.lineCap = 'round';
  for (let i = 0; i < 14; i++) {
    let a = (i / 14) * Math.PI * 2 + rand(-0.2, 0.2);
    let r = rand(20, 50);
    g.lineWidth = rand(2, 4);
    g.beginPath();
    g.moveTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r);
    while (r < 120) { r += rand(10, 20); a += rand(-0.25, 0.25); g.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r); }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Burn mark from a blast that hit the ground head-on: a blackened splash
// with a ragged edge and soot spatter.
function scorchTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  g.translate(64, 64);
  for (let k = 0; k < 3; k++) {
    g.beginPath();
    const r0 = 52 - k * 14;
    for (let i = 0; i <= 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const r = r0 * (0.8 + 0.25 * Math.sin(a * 5 + k) * Math.sin(a * 3) + rand(-0.06, 0.06));
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fillStyle = `rgba(${30 - k * 8},${22 - k * 6},${16 - k * 4},${0.35 + k * 0.2})`;
    g.fill();
  }
  for (let i = 0; i < 40; i++) {
    const a = rand(0, Math.PI * 2), r = rand(40, 62);
    g.fillStyle = `rgba(20,14,10,${rand(0.3, 0.7)})`;
    g.beginPath(); g.arc(Math.cos(a) * r, Math.sin(a) * r, rand(1, 3.5), 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Gouge from a blast that hit the ground at an angle: narrow where it
// touched down (bottom of the canvas), ploughing a widening furrow forward
// and spraying dirt out past the far end (top).
function gougeTexture() {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 256;
  const g = cv.getContext('2d');
  const half = (y) => 8 + 44 * Math.pow(1 - y / 256, 0.6); // half width along the furrow
  // Churned, lighter dirt along the edges.
  g.beginPath();
  for (let y = 250; y >= 30; y -= 8) g.lineTo(64 - half(y) - 6 + rand(-3, 3), y);
  g.quadraticCurveTo(64, -6, 64 + half(30) + 6, 30);
  for (let y = 30; y <= 250; y += 8) g.lineTo(64 + half(y) + 6 + rand(-3, 3), y);
  g.closePath();
  g.fillStyle = 'rgba(120,90,60,0.75)';
  g.fill();
  // Scorched trench.
  g.beginPath();
  for (let y = 252; y >= 40; y -= 8) g.lineTo(64 - half(y) + rand(-2, 2), y);
  g.quadraticCurveTo(64, 6, 64 + half(40), 40);
  for (let y = 40; y <= 252; y += 8) g.lineTo(64 + half(y) + rand(-2, 2), y);
  g.closePath();
  const grd = g.createLinearGradient(0, 256, 0, 0);
  grd.addColorStop(0, 'rgba(40,26,16,0.6)');
  grd.addColorStop(0.5, 'rgba(26,17,11,0.95)');
  grd.addColorStop(1, 'rgba(22,15,10,0.9)');
  g.fillStyle = grd;
  g.fill();
  // Drag lines along the furrow.
  g.strokeStyle = 'rgba(8,5,3,0.7)';
  g.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const off = rand(-0.7, 0.7);
    g.lineWidth = rand(1.5, 3.5);
    g.beginPath();
    for (let y = 250; y >= 50; y -= 20) g.lineTo(64 + off * half(y) + rand(-1.5, 1.5), y);
    g.stroke();
  }
  // Dirt sprayed past the end.
  for (let i = 0; i < 45; i++) {
    const a = rand(-1.1, 1.1) - Math.PI / 2, r = rand(20, 50);
    g.fillStyle = `rgba(${rand(40, 110) | 0},${rand(30, 80) | 0},${rand(20, 50) | 0},${rand(0.4, 0.8)})`;
    g.beginPath(); g.arc(64 + Math.cos(a) * r * 1.2, 46 + Math.sin(a) * r, rand(1.5, 4), 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

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
    // Craters left by the biggest attacks: a scorched bowl decal, a ring of
    // broken rock thrown up around it and a few loose boulders.
    this.craterTex = craterTexture();
    const rim = new THREE.TorusGeometry(1, 0.13, 7, 40);
    rim.rotateX(Math.PI / 2);
    const rp = rim.attributes.position;
    for (let i = 0; i < rp.count; i++) {
      _v.fromBufferAttribute(rp, i);
      const a = Math.atan2(_v.z, _v.x);
      const k = 1 + 0.35 * Math.sin(a * 7) * Math.sin(a * 3 + 1) + 0.2 * Math.sin(a * 17);
      rp.setY(i, Math.max(-0.02, _v.y * k * 1.4));
      const w = 1 + 0.06 * Math.sin(a * 11);
      rp.setX(i, _v.x * w); rp.setZ(i, _v.z * w);
    }
    rim.computeVertexNormals();
    this.craters = [];
    for (let i = 0; i < MAX_CRATERS; i++) {
      const decal = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: this.craterTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
      const rimMesh = new THREE.Mesh(rim, toonUnique(0x8f7356));
      rimMesh.material.transparent = true;
      const g = new THREE.Group();
      g.add(decal, rimMesh);
      g.visible = false;
      scene.add(g);
      this.craters.push({ g, decal, rim: rimMesh, t: 0, life: 0, size: 1 });
    }
    this.craterCursor = 0;
    // Scorch marks and gouges: flat decals bent over the terrain under them.
    this.scorchTex = scorchTexture();
    this.gougeTex = gougeTexture();
    this.scorches = [];
    for (let i = 0; i < MAX_SCORCH; i++) {
      const geo = new THREE.PlaneGeometry(1, 1, 4, 8).rotateX(-Math.PI / 2).translate(0, 0, -0.5);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: this.scorchTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      m.visible = false;
      m.renderOrder = 1;
      m.frustumCulled = false;
      scene.add(m);
      this.scorches.push({ m, base: geo.attributes.position.array.slice(), t: 0, life: 0, w: 1, l: 1 });
    }
    this.scorchCursor = 0;
  }

  // Burn mark on the ground. With a direction that skims the ground, it is a
  // long gouge ploughed forward from the impact; straight down, a round splash.
  // pos: impact point; w: width; dirH: unit horizontal direction (or null);
  // stretch: length / width.
  scorch(pos, w, dirH = null, stretch = 1) {
    const gouge = !!dirH && stretch > 1.6;
    const len = w * stretch;
    // A beam digging in at one spot keeps refreshing (and lengthening) one mark.
    for (const s of this.scorches) {
      if (s.m.visible && s.gouge === gouge && Math.hypot(s.x - pos.x, s.z - pos.z) < s.w * 0.35) {
        s.t = Math.min(s.t, 1);
        if (w > s.w * 1.05 || len > s.l * 1.05) { s.w = Math.max(s.w, w); s.l = Math.max(s.l, len); this.placeScorch(s); }
        return;
      }
    }
    const s = this.scorches[this.scorchCursor];
    this.scorchCursor = (this.scorchCursor + 1) % MAX_SCORCH;
    s.gouge = gouge;
    s.m.material.map = gouge ? this.gougeTex : this.scorchTex;
    s.x = pos.x; s.z = pos.z;
    s.yaw = dirH ? Math.atan2(-dirH.x, -dirH.z) : rand(0, Math.PI * 2);
    s.w = w; s.l = len;
    s.t = 0;
    s.life = 25;
    s.m.visible = true;
    this.placeScorch(s);
  }

  // Lays the decal over the terrain: the gouge starts a little behind the
  // impact and runs forward; a round mark is centred on it.
  placeScorch(s) {
    const back = s.gouge ? s.w * 0.25 : s.l * 0.5;
    const sy = Math.sin(s.yaw), cy = Math.cos(s.yaw);
    const ox = s.x + sy * back, oz = s.z + cy * back; // forward is (-sin, -cos)
    const arr = s.m.geometry.attributes.position.array;
    for (let i = 0; i < arr.length; i += 3) {
      const lx = s.base[i] * s.w, lz = s.base[i + 2] * s.l;
      const wx = ox + lx * cy + lz * sy, wz = oz - lx * sy + lz * cy;
      arr[i] = wx; arr[i + 1] = terrainHeight(wx, wz) + 0.04; arr[i + 2] = wz;
    }
    s.m.geometry.attributes.position.needsUpdate = true;
    s.m.geometry.computeBoundingSphere();
  }

  // Leaves a crater of the given radius on the ground at pos (x/z).
  crater(pos, radius, dirH = null, stretch = 1) {
    // Grow an existing crater nearby instead of stacking a new one on top.
    for (const c of this.craters) {
      if (c.g.visible && Math.hypot(c.g.position.x - pos.x, c.g.position.z - pos.z) < c.size * 0.6) {
        c.size = Math.max(c.size, radius);
        c.t = Math.min(c.t, 0.3);
        return c;
      }
    }
    const c = this.craters[this.craterCursor];
    this.craterCursor = (this.craterCursor + 1) % MAX_CRATERS;
    c.g.visible = true;
    // An angled hit digs an oval bowl pushed forward along the shot.
    const fwd = (stretch - 1) * radius * 0.5;
    const cx = pos.x + (dirH ? dirH.x * fwd : 0), cz = pos.z + (dirH ? dirH.z * fwd : 0);
    c.g.position.set(cx, terrainHeight(cx, cz) + 0.03, cz);
    c.g.rotation.y = dirH ? Math.atan2(dirH.x, dirH.z) : rand(0, Math.PI * 2);
    c.stretch = stretch;
    c.size = radius;
    c.t = 0;
    c.life = 30;
    return c;
  }

  // How much "energy" a projectile carries, from its size, damage and type.
  static energyOf(p) {
    if (p.energy) return clamp(p.energy, 0.15, p.spiritBomb ? 16 : 6);
    const e = p.radius * 2.6 + Math.log10(1 + p.damage) * 0.32 + (p.charged ? 0.3 : 0) + (p.kind === 'sphere' ? 0.6 : 0) + (p.kind === 'mega' ? 0.4 : 0);
    return clamp(e, 0.15, 4.5);
  }

  // dir (optional): which way the blast was travelling. A shot skimming the
  // ground ploughs a long gouge and throws its debris forward; one coming
  // straight down splashes a round burn (and, if huge, a crater).
  explode(pos, color, energy = 1, dir = null) {
    const budget = this.fx.particles.budget;
    const R = 0.3 + 1.15 * energy;
    const floor = terrainHeight(pos.x, pos.z);
    const height = pos.y - floor;
    const ground = height < R * 0.9;
    // How much the shot skims along the ground (0 = straight down, 1 = level).
    let graze = 0;
    const dirH = _dh.set(0, 0, 0);
    if (dir && dir.lengthSq() > 1e-6) {
      _dn.copy(dir).normalize();
      const h = Math.hypot(_dn.x, _dn.z);
      if (h > 1e-3) { dirH.set(_dn.x / h, 0, _dn.z / h); graze = _dn.y > 0 ? 1 : h; }
    }
    const center = _v.copy(pos);
    if (ground) center.y = Math.max(pos.y, floor + R * 0.25);
    if (ground && graze > 0.3) center.addScaledVector(dirH, R * 0.35 * graze);
    // Point-blank (an enemy blast hitting you in the face): just the flash and
    // sparks, so smoke never fills the headset.
    const near = center.distanceTo(this.eye) < 1.2 + R * 0.4;
    const c = _c.set(color);

    // Sparks + flash (shared particle pool).
    this.fx.burst(center, color, Math.min(90, Math.round(8 + 28 * energy)), 2 + 4 * energy, 0.05 + 0.05 * energy, 0.45 + 0.25 * energy, { drag: 2 });
    this.fx.burst(center, 0xffffff, Math.min(40, Math.round(4 + 10 * energy)), 3 + 5 * energy, 0.04 + 0.03 * energy, 0.3);
    if (energy > 0.9) this.fx.burst(center, 0xffb347, Math.min(50, Math.round(10 * energy)), 1.5 + 2 * energy, 0.12 * energy, 0.9, { up: 1.5, drag: 1.2 });

    if (!near) {
      // Fireball: white core that blooms then collapses, coloured shell that keeps expanding.
      const b = this.balls[this.ballCursor];
      this.ballCursor = (this.ballCursor + 1) % MAX_BALLS;
      b.t = 0;
      b.dur = 0.35 + 0.3 * Math.min(4, energy);
      b.R = R;
      b.color.copy(c);
      b.core.position.copy(center);
      b.shell.position.copy(center);
      b.shell.material.color.copy(c);
      b.core.visible = b.shell.visible = true;

      // Smoke: a glowing ball of puffs; near the ground it also rolls outward as a dust wall.
      const n = Math.round(Math.min(30, 3 + 9 * energy) * Math.max(0.4, budget));
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
        const col = Math.round(Math.min(14, 2 + 3 * energy) * Math.max(0.4, budget));
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
        const ring = Math.round(Math.min(26, 4 + 8 * energy) * Math.max(0.4, budget));
        for (let i = 0; i < ring; i++) {
          const a = (i / ring) * Math.PI * 2 + rand(-0.2, 0.2);
          const p = this.nextPuff();
          p.m.position.set(pos.x + Math.cos(a) * R * 0.5, floor + R * 0.15, pos.z + Math.sin(a) * R * 0.5);
          p.vel.set(Math.cos(a), 0.12, Math.sin(a)).multiplyScalar(R * rand(1.8, 2.8));
          // An angled hit sweeps its dust wall forward.
          p.vel.addScaledVector(dirH, R * 2.2 * graze);
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
      // Only the really big attacks dig a crater (an oval one if they came
      // in at an angle); the rest leave burns: round when they hit head-on,
      // a long gouge in the direction of travel when they came in low.
      const stretch = 1 + 2.8 * clamp((graze - 0.35) / 0.65, 0, 1);
      const steep = graze < 0.8;
      if (energy >= CRATER_ENERGY && steep) {
        this.crater(g, R * 0.75, graze > 0.3 ? dirH : null, 1 + 0.9 * Math.max(0, graze - 0.3));
        this.scorch(g, R * 2.1, null, 1);
      } else {
        if (energy > 0.25) this.scorch(g, R * (energy >= CRATER_ENERGY ? 1.3 : 0.95) * (1 - 0.25 * graze), graze > 0.3 ? dirH : null, stretch);
        if (energy > 0.9 && stretch < 1.6) this.fx.crack(g, R * 1.3);
      }
      const rocks = Math.round(Math.min(60, energy < 0.45 ? 2 : 4 + 14 * energy) * Math.max(0.4, budget));
      for (let i = 0; i < rocks; i++) {
        const r = this.rocks[this.rockCursor];
        this.rockCursor = (this.rockCursor + 1) % MAX_ROCKS;
        const a = rand(0, Math.PI * 2);
        const out = rand(0.3, 1);
        r.pos.set(pos.x + Math.cos(a) * R * 0.3 * out, floor + 0.05, pos.z + Math.sin(a) * R * 0.3 * out);
        const sp = (2.5 + 4 * Math.sqrt(energy)) * rand(0.5, 1.1);
        // Straight down: a fountain thrown up and out. Skimming: a low spray
        // fanning out forward along the shot.
        _s.set(Math.cos(a) * out, 0, Math.sin(a) * out).lerp(_dh2.copy(dirH).multiplyScalar(rand(0.9, 1.6)), graze * 0.8);
        r.vel.set(_s.x * sp * (1 + graze), sp * rand(0.9, 1.8) * (1 - 0.55 * graze), _s.z * sp * (1 + graze));
        r.rot.set(rand(0, 6), rand(0, 6), rand(0, 6));
        r.spin.set(rand(-9, 9), rand(-9, 9), rand(-9, 9));
        r.size = rand(0.05, 0.13) * (0.6 + 0.6 * Math.min(2, energy));
        r.life = rand(1.6, 2.4);
        r.bounced = false;
      }
    }
    bus.emit('fx:shake', { position: center.clone(), amount: 0.04 + 0.12 * energy, energy });
    // Rocks, spires and pillars nearby take the hit (see world/Destruction.js).
    bus.emit('blast:world', { position: pos.clone(), energy, dir: dirH.lengthSq() ? _dn.clone() : null });
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
    for (const c of this.craters) {
      if (!c.g.visible) continue;
      c.t += dt;
      const grow = 1 - Math.pow(1 - Math.min(1, c.t / 0.35), 3);
      const st = c.stretch || 1;
      c.decal.scale.set(c.size * 1.25 * grow, 1, c.size * 1.25 * grow * st);
      c.rim.scale.set(c.size * grow, c.size * (0.5 + 0.5 * grow), c.size * grow * st);
      const fade = Math.min(1, (c.life - c.t) / 4);
      c.decal.material.opacity = fade;
      c.rim.material.opacity = fade;
      c.rim.position.y = -(1 - fade) * 0.3 * c.size;
      if (c.t >= c.life) c.g.visible = false;
    }
    for (const sc of this.scorches) {
      if (!sc.m.visible) continue;
      sc.t += dt;
      sc.m.material.opacity = Math.min(1, sc.t / 0.12, (sc.life - sc.t) / 4);
      if (sc.t >= sc.life) sc.m.visible = false;
    }
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
