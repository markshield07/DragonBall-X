import * as THREE from 'three';

// Procedural anatomy: smooth "lofted" body parts sculpted from muscle
// profiles instead of stacked spheres and capsules.
//
// Every part is a tube swept along an axis. Its radius at each point is a
// base profile (how thick the limb is along its length) plus Gaussian
// muscle bumps placed where real muscles sit: deltoid cap, biceps on the
// front, triceps behind, forearm flexors, pecs with a defined lower edge,
// a six-pack, obliques, lats, traps, glutes, quads and calves. The cel
// shader then turns those curves into readable anime muscle definition.
//
// Conventions (body space, metres): feet at y = 0, character faces +Z,
// character's left is +X. Angles around a part: 0 = front (+Z), 90° = +X.

const TAU = Math.PI * 2;
const gauss = (x, c, s) => Math.exp(-((x - c) * (x - c)) / (2 * s * s));
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Piecewise-cubic (Catmull-Rom) interpolation through [x, y] keys.
export function curve(keys) {
  return (x) => {
    if (x <= keys[0][0]) return keys[0][1];
    const n = keys.length;
    if (x >= keys[n - 1][0]) return keys[n - 1][1];
    let i = 0;
    while (x > keys[i + 1][0]) i++;
    const p0 = keys[Math.max(0, i - 1)][1];
    const p1 = keys[i][1];
    const p2 = keys[i + 1][1];
    const p3 = keys[Math.min(n - 1, i + 2)][1];
    const t = (x - keys[i][0]) / (keys[i + 1][0] - keys[i][0]);
    const t2 = t * t; const t3 = t2 * t;
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  };
}

// Generic tube along +Y from 0 to `length`, with rounded end caps.
// radius(t, a) → metres, t in [0, 1] along the part, a = angle (0 = +Z).
// Optional squash(t, a) → [sx, sz] elliptical scale of the cross-section.
export function loftLimb({ length, rings = 24, sides = 18, radius, squash = null, capStart = true, capEnd = true }) {
  const pos = [];
  const ts = [];
  const r0 = radius(0, 0);
  const r1 = radius(1, 0);
  const c0 = capStart ? Math.min(r0 / length, 0.3) : 0;
  const c1 = capEnd ? Math.min(r1 / length, 0.3) : 0;
  const capRings = 4;
  if (capStart) for (let i = capRings; i >= 1; i--) ts.push(-c0 * (i / capRings));
  for (let i = 0; i <= rings; i++) ts.push(i / rings);
  if (capEnd) for (let i = 1; i <= capRings; i++) ts.push(1 + c1 * (i / capRings));
  for (const t of ts) {
    const tc = Math.min(1, Math.max(0, t));
    let k = 1;
    if (t < 0) k = Math.sqrt(Math.max(0, 1 - (t / c0) ** 2));
    if (t > 1) k = Math.sqrt(Math.max(0, 1 - ((t - 1) / c1) ** 2));
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * TAU;
      const r = radius(tc, a) * Math.max(k, 0.02);
      const [sx, sz] = squash ? squash(tc, a) : [1, 1];
      pos.push(Math.sin(a) * r * sx, t * length, Math.cos(a) * r * sz);
    }
  }
  return gridGeometry(pos, ts.length, sides);
}

function gridGeometry(pos, rows, sides) {
  const idx = [];
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < sides; j++) {
      const a = i * sides + j;
      const b = i * sides + ((j + 1) % sides);
      const c = (i + 1) * sides + j;
      const d = (i + 1) * sides + ((j + 1) % sides);
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Matrix that maps a +Y-aligned part to start at `from`, point along `dir`,
// with its local +Z ("front") turned toward `frontHint`.
const _x = new THREE.Vector3(); const _y = new THREE.Vector3(); const _z = new THREE.Vector3();
export function partBasis(from, dir, frontHint, out = new THREE.Matrix4()) {
  _y.copy(dir).normalize();
  _z.copy(frontHint).addScaledVector(_y, -frontHint.dot(_y));
  if (_z.lengthSq() < 1e-6) _z.set(0, 0, 1).addScaledVector(_y, -_y.z);
  if (_z.lengthSq() < 1e-6) _z.set(0, 1, 0).addScaledVector(_y, -_y.y);
  _z.normalize();
  _x.crossVectors(_y, _z).normalize();
  out.makeBasis(_x, _y, _z);
  out.setPosition(from);
  return out;
}

// ---- Torso ---------------------------------------------------------------------
// Half-widths and front/back depths along the height, for a muscular male.
const MALE = {
  width: curve([[0.8, 0.1], [0.86, 0.16], [0.93, 0.172], [1.0, 0.163], [1.06, 0.15], [1.14, 0.158], [1.24, 0.188], [1.33, 0.206], [1.41, 0.214], [1.47, 0.19], [1.52, 0.122], [1.58, 0.074]]),
  front: curve([[0.8, 0.06], [0.86, 0.095], [0.93, 0.105], [1.0, 0.1], [1.06, 0.097], [1.14, 0.102], [1.24, 0.112], [1.33, 0.122], [1.41, 0.1], [1.47, 0.08], [1.52, 0.062], [1.58, 0.058]]),
  back: curve([[0.8, 0.06], [0.86, 0.11], [0.93, 0.122], [1.0, 0.105], [1.06, 0.095], [1.14, 0.1], [1.24, 0.112], [1.33, 0.118], [1.41, 0.11], [1.47, 0.09], [1.52, 0.066], [1.58, 0.06]]),
};
const FEMALE = {
  width: curve([[0.8, 0.1], [0.86, 0.17], [0.93, 0.182], [1.0, 0.165], [1.06, 0.13], [1.14, 0.132], [1.24, 0.155], [1.33, 0.168], [1.41, 0.178], [1.47, 0.14], [1.52, 0.085], [1.58, 0.062]]),
  front: curve([[0.8, 0.06], [0.86, 0.095], [0.93, 0.1], [1.0, 0.095], [1.06, 0.088], [1.14, 0.09], [1.24, 0.098], [1.33, 0.1], [1.41, 0.088], [1.47, 0.072], [1.52, 0.056], [1.58, 0.052]]),
  back: curve([[0.8, 0.06], [0.86, 0.12], [0.93, 0.13], [1.0, 0.105], [1.06, 0.088], [1.14, 0.09], [1.24, 0.098], [1.33, 0.1], [1.41, 0.096], [1.47, 0.082], [1.52, 0.06], [1.58, 0.055]]),
};

// Torso surface point for height y and angle a. p: { female, w, d, def, offset }
export function torsoPoint(y, a, p, out = new THREE.Vector3()) {
  const P = p.female ? FEMALE : MALE;
  // Build width mostly widens the upper body (shoulders, lats, chest).
  const upper = smooth(1.02, 1.3, y);
  const W = P.width(y) * (1 + (p.w - 1) * (0.45 + 0.55 * upper));
  const Df = P.front(y) * p.d;
  const Db = P.back(y) * p.d;
  const s = Math.sin(a); const c = Math.cos(a);
  const n = 2.3; // superellipse: slightly boxy, like a real ribcage
  const px = Math.sign(s) * Math.pow(Math.abs(s), 2 / n) * W;
  const pz = Math.sign(c) * Math.pow(Math.abs(c), 2 / n) * (c >= 0 ? Df : Db);
  const front = Math.max(0, c);
  const back = Math.max(0, -c);
  const side = Math.abs(s);
  const m = p.def;
  let bump = 0;
  if (p.female) {
    for (const k of [-1, 1]) bump += 0.042 * gauss(px, 0.075 * k * p.w, 0.04) * gauss(y, 1.31, 0.045) * front ** 1.2;
    bump += 0.004 * m * gauss(y, 1.12, 0.06) * front ** 2 * (1 - gauss(px, 0, 0.012) * 0.6);
  } else {
    // Pecs: full on top, sharp lower edge.
    for (const k of [-1, 1]) {
      const cx = 0.085 * k * p.w;
      const sy = y < 1.335 ? 0.02 : 0.055;
      bump += 0.034 * m * gauss(px, cx, 0.058 * p.w) * gauss(y, 1.335, sy) * front ** 1.3;
    }
    // Six-pack, split down the middle (linea alba).
    for (const ry of [1.235, 1.17, 1.105]) {
      for (const k of [-1, 1]) bump += 0.012 * m * gauss(px, 0.034 * k, 0.016) * gauss(y, ry, 0.021) * front ** 2;
    }
    bump -= 0.006 * m * gauss(px, 0, 0.008) * smooth(1.06, 1.12, y) * (1 - smooth(1.29, 1.33, y)) * front ** 2;
    // Obliques and serratus on the sides.
    bump += 0.01 * m * gauss(y, 1.1, 0.045) * side ** 2 * (0.4 + 0.6 * front);
    for (const ry of [1.2, 1.25]) bump += 0.004 * m * gauss(y, ry, 0.012) * gauss(Math.abs(px), 0.15 * p.w, 0.02) * front;
    // Lats flare the back into a V; shoulder blades and traps on top.
    bump += 0.02 * m * gauss(y, 1.28, 0.07) * back * side ** 1.5;
    for (const k of [-1, 1]) bump += 0.012 * m * gauss(px, 0.08 * k * p.w, 0.04) * gauss(y, 1.38, 0.04) * back;
    bump += 0.018 * m * gauss(y, 1.48, 0.03) * (0.5 + 0.5 * back) * gauss(Math.abs(px), 0.08 * p.w, 0.05);
  }
  // Glutes
  for (const k of [-1, 1]) bump += 0.028 * gauss(px, 0.075 * k * p.w, 0.05) * gauss(y, 0.92, 0.05) * back;
  const r = Math.hypot(px, pz) || 1;
  const off = bump + (p.offset || 0);
  return out.set(px + (px / r) * off, y, pz + (pz / r) * off);
}

// Torso band from y0 to y1 (open ends). Bands with the same params meet
// seamlessly, so clothing regions can use different materials.
export function torsoBand(y0, y1, p, { sides = 32, ringsPerMetre = 64 } = {}) {
  return torsoShell(y0, y1, p, null, { sides, ringsPerMetre });
}

// A layer that hugs the torso (belt, sash, armor plate, fur). thick(t, a)
// is how far it stands off the skin, t in [0, 1] from y0 to y1; let it fall
// to ~0 at the ends so the layer tucks into the body instead of leaving a gap.
export function torsoShell(y0, y1, p, thick, { sides = 32, ringsPerMetre = 64 } = {}) {
  const rows = Math.max(2, Math.ceil((y1 - y0) * ringsPerMetre) + 1);
  const pos = [];
  const v = new THREE.Vector3();
  const q = { ...p };
  for (let i = 0; i < rows; i++) {
    const t = i / (rows - 1);
    const y = y0 + (y1 - y0) * t;
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * TAU;
      q.offset = (p.offset || 0) + (thick ? thick(t, a) : 0);
      torsoPoint(y, a, q, v);
      pos.push(v.x, v.y, v.z);
    }
  }
  return gridGeometry(pos, rows, sides);
}

// Rounded profile for shells: 0 at both ends, 1 in the middle.
export const bulge = (t, edge = 0.25) => Math.sin(Math.PI * Math.min(1, Math.min(t, 1 - t) / edge) / 2);

// ---- Limbs ---------------------------------------------------------------------
// outer: +1 if the part's local +X points away from the body, else -1.
// k: limb thickness (build); m: muscle definition.
export function upperArm(length, k, m, outer, female = false) {
  const base = curve([[0, 0.066], [0.3, 0.06], [0.6, 0.056], [1, 0.045]]);
  const f = female ? 0.6 : 1;
  return loftLimb({
    length,
    rings: 26,
    sides: 20,
    radius: (t, a) => {
      const cs = Math.cos(a);
      const lateral = Math.max(0, Math.sin(a) * outer);
      let r = base(t) * k;
      // Deltoid: a rounded cap over the shoulder, strongest on the outside.
      r += 0.03 * k * gauss(t, 0.1, 0.13) * (0.55 + 0.45 * lateral) * (female ? 0.7 : 1);
      // Biceps (front) and triceps (back, higher and wider).
      r += 0.024 * k * m * f * gauss(t, 0.56, 0.17) * Math.max(0, cs) ** 1.5;
      r += 0.02 * k * m * f * gauss(t, 0.4, 0.2) * Math.max(0, -cs) ** 1.2;
      return r;
    },
  });
}

export function forearm(length, k, m, outer, female = false) {
  const base = curve([[0, 0.046], [0.15, 0.05], [0.5, 0.043], [0.85, 0.034], [1, 0.032]]);
  return loftLimb({
    length,
    rings: 22,
    sides: 18,
    radius: (t, a) => {
      const lateral = Math.max(0, Math.sin(a) * outer);
      let r = base(t) * k;
      // Brachioradialis / flexor mass near the elbow.
      r += 0.014 * k * m * (female ? 0.6 : 1) * gauss(t, 0.22, 0.16) * (0.5 + 0.5 * lateral);
      return r;
    },
    // The wrist is wider than it is deep.
    squash: (t) => [1 + 0.15 * smooth(0.6, 1, t), 1 - 0.2 * smooth(0.6, 1, t)],
  });
}

// inner: +1 if local +X points toward the body's centre line.
export function thigh(length, k, m, inner, baggy = 1, fit = 1) {
  const base = curve([[0, 0.098], [0.3, 0.094], [0.7, 0.074], [1, 0.06]]);
  return loftLimb({
    length,
    rings: 24,
    sides: 20,
    radius: (t, a) => {
      const cs = Math.cos(a);
      const toward = Math.max(0, Math.sin(a) * inner);
      let r = base(t) * k;
      // Quads in front, teardrop just above the inner knee, hamstrings behind.
      r += 0.016 * k * m * fit * gauss(t, 0.45, 0.2) * Math.max(0, cs) ** 1.3;
      r += 0.012 * k * m * fit * gauss(t, 0.82, 0.08) * toward * Math.max(0, cs + 0.3);
      r += 0.01 * k * m * fit * gauss(t, 0.4, 0.2) * Math.max(0, -cs);
      return r * baggy + (baggy > 1 ? 0.012 : 0);
    },
  });
}

export function calf(length, k, m) {
  const base = curve([[0, 0.056], [0.25, 0.054], [0.7, 0.04], [1, 0.034]]);
  return loftLimb({
    length,
    rings: 22,
    sides: 18,
    radius: (t, a) => {
      const cs = Math.cos(a);
      let r = base(t) * k;
      // Calf muscle bulges behind, just below the knee.
      r += 0.024 * k * m * gauss(t, 0.28, 0.13) * Math.max(0, -cs) ** 1.2;
      return r;
    },
  });
}

export function neck(length, k, female = false) {
  return loftLimb({
    length,
    rings: 10,
    sides: 18,
    radius: (t, a) => {
      const cs = Math.cos(a);
      // Thick neck with the sternocleidomastoid ridges on the front-sides.
      const r = (female ? 0.052 : 0.064) * k * (1 + 0.15 * (1 - t));
      return r + 0.006 * k * Math.abs(Math.sin(2 * a)) * Math.max(0, cs) * (1 - t);
    },
    squash: () => [1.05, 0.92],
    capStart: false,
    capEnd: false,
  });
}
