import * as THREE from 'three';
import { noise2, smooth, ridged, fbm } from './noise.js';

// The world: the training valley (hub) in the middle, ringed by mountains
// with a pass toward each of five regions that fan out around it.
//
//   r < 34      flat play area (training platform, boss crater)
//   34 – 112    rolling grass hills of the valley
//   112 – 420   the mountain ring, cut by five passes
//   300 – 1400  the regions, one per direction (see REGIONS)
//   > 1250      a wall of huge peaks at the edge of the world
//
// Angles are measured from north (-Z, the way you face at the start) toward east (+X).
export const FLAT_RADIUS = 34;
export const HUB_RADIUS = 128; // the hub's own detailed ground mesh ends here
export const SEA = -3; // ocean and lake surface
export const WORLD_RADIUS = 1450;
const TAU = Math.PI * 2;

export const REGIONS = [
  { id: 'wasteland', name: 'Rocky Wasteland', angle: 0, fog: 0xf1dcc0, horizon: 0xf5e1c2 },
  { id: 'volcano', name: 'Volcano Ridge', angle: TAU * 0.2, fog: 0xb99486, horizon: 0xe0a585 },
  { id: 'coast', name: 'Ocean Coast', angle: TAU * 0.4, fog: 0xd3efff, horizon: 0xd3efff },
  { id: 'forest', name: 'Forest Valley', angle: TAU * 0.6, fog: 0xd0eed8, horizon: 0xd8f3df },
  { id: 'snow', name: 'Frozen Peaks', angle: TAU * 0.8, fog: 0xeaf2ff, horizon: 0xf0f6ff },
];
export const HUB_NAME = 'Training Valley';

// The volcano's summit (centre of its crater) and its lava level.
const VOLCANO_R = 720;
export const VOLCANO = {
  x: Math.sin(REGIONS[1].angle) * VOLCANO_R,
  z: -Math.cos(REGIONS[1].angle) * VOLCANO_R,
};

const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

// Soft weight of each region at (x, z), summing to 1. Boundaries wander with noise.
const W = new Float32Array(REGIONS.length);
export function regionWeights(x, z, out = W) {
  const a = Math.atan2(x, -z) + (noise2(x * 0.003 + 3, z * 0.003 - 7) - 0.5) * 0.7;
  let sum = 0;
  for (let k = 0; k < REGIONS.length; k++) {
    const w = Math.pow(Math.max(0, Math.cos(angDiff(a, REGIONS[k].angle))), 8);
    out[k] = w; sum += w;
  }
  for (let k = 0; k < REGIONS.length; k++) out[k] /= sum;
  return out;
}

// How far out of the valley (0 in the hub, 1 deep in a region).
export const regionMix = (r) => smooth(150, 340, r);

function hubHeight(x, z, r) {
  if (r < FLAT_RADIUS) return 0;
  const hills = noise2(x * 0.03, z * 0.03) * 9 + noise2(x * 0.08 + 7, z * 0.08) * 3;
  const foothills = smooth(110, 200, r) * 22 * (0.5 + noise2(x * 0.015, z * 0.015));
  return hills * smooth(FLAT_RADIUS, 70, r) + foothills;
}

// The mountains that wall in the valley, with a low pass toward each region.
function ringHeight(x, z, r, a) {
  if (r < 112 || r > 430) return 0;
  const massif = 0.35 + 0.65 * smooth(0.25, 0.75, noise2(Math.cos(a) * 2.2 + 11, Math.sin(a) * 2.2 + 5));
  let pass = 1;
  for (const R of REGIONS) pass = Math.min(pass, smooth(0.07, 0.24, Math.abs(angDiff(a, R.angle))));
  return smooth(118, 175, r) * (1 - smooth(300, 430, r)) * massif * pass * (22 + 135 * ridged(x * 0.010, z * 0.010));
}

const HEIGHTS = {
  // Sand flats broken by terraced, flat-topped mesas.
  wasteland(x, z) {
    const m = fbm(x * 0.008, z * 0.008, 3);
    return 3 + noise2(x * 0.02, z * 0.02) * 4 + smooth(0.56, 0.6, m) * 26 + smooth(0.66, 0.69, m) * 22;
  },
  // Dark rolling basalt around one huge volcano with a lava-filled crater.
  volcano(x, z) {
    const d = Math.hypot(x - VOLCANO.x, z - VOLCANO.z);
    const base = 4 + fbm(x * 0.006, z * 0.006, 3) * 30;
    const cone = 210 * Math.pow(Math.max(0, 1 - Math.max(d, 55) / 390), 1.6);
    return base + cone - smooth(58, 28, d) * 48;
  },
  // Grassy shore sloping down into the ocean, with islands offshore.
  coast(x, z, r) {
    let h = 9 + noise2(x * 0.02, z * 0.02) * 4 - smooth(380, 760, r) * 30;
    const isl = smooth(0.6, 0.78, fbm(x * 0.005 + 11, z * 0.005 - 4)) * smooth(640, 760, r);
    return h + isl * (30 + ridged(x * 0.03, z * 0.03) * 12);
  },
  // Big green hills with lakes in the hollows.
  forest(x, z) {
    const h = fbm(x * 0.005, z * 0.005, 3) * 60 - 4;
    return h - smooth(0.36, 0.16, noise2(x * 0.004 + 20, z * 0.004 + 3)) * 26;
  },
  // Jagged snowy peaks with wide valleys between them.
  snow(x, z, r) {
    const peaks = ridged(x * 0.005, z * 0.005, 4) * 160 * smooth(250, 520, r);
    return (20 + peaks) * (0.4 + 0.6 * smooth(0.3, 0.6, noise2(x * 0.003 + 40, z * 0.003))) + fbm(x * 0.02, z * 0.02) * 6;
  },
};

// Ground height anywhere in the world.
// Other planets (King Kali's, Zui) replace the ground while you're there.
let groundOverride = null;
export function setGroundOverride(fn) { groundOverride = fn; }

export function terrainHeight(x, z) {
  if (groundOverride) return groundOverride(x, z);
  const r = Math.hypot(x, z);
  if (r < FLAT_RADIUS) return 0;
  const hub = hubHeight(x, z, r);
  if (r < 112) return hub;
  const a = Math.atan2(x, -z);
  let h = hub;
  const rm = regionMix(r);
  if (rm > 0) {
    const w = regionWeights(x, z);
    let reg = 0;
    for (let k = 0; k < REGIONS.length; k++) if (w[k] > 0.01) reg += w[k] * HEIGHTS[REGIONS[k].id](x, z, r);
    h = hub * (1 - rm) + reg * rm;
  }
  h += ringHeight(x, z, r, a);
  if (r > WORLD_RADIUS - 300) h += smooth(WORLD_RADIUS - 300, WORLD_RADIUS - 40, r) * (140 + 180 * ridged(x * 0.006 + 9, z * 0.006));
  return h;
}

// Which region you're in at (x, z): { index (-1 = the valley), name }.
export function regionAt(x, z) {
  const r = Math.hypot(x, z);
  if (regionMix(r) < 0.35) return { index: -1, name: HUB_NAME };
  const w = regionWeights(x, z, new Float32Array(REGIONS.length));
  let best = 0;
  for (let k = 1; k < REGIONS.length; k++) if (w[k] > w[best]) best = k;
  return { index: best, name: REGIONS[best].name, weight: w[best] };
}

// ---- Colors ----------------------------------------------------------------------
const C = (h) => new THREE.Color(h);
const P = {
  grassA: C(0x6cc24a), grassB: C(0x58ad3c), grassHigh: C(0x9ccf55), rock: C(0xa58a6c),
  sandA: C(0xd09a62), sandB: C(0xb7774a), sandC: C(0xe2b37a), greyA: C(0x8c8fa0), greyB: C(0x767a8c), snow: C(0xf4f8ff),
  dune: C(0xdcb57c), dune2: C(0xcfa266), mesaTop: C(0xb5b862),
  basalt: C(0x4d413d), basalt2: C(0x5d4c45), ash: C(0x7a6a62), lava: C(0xff6a1a), lavaHot: C(0xffc24a),
  beach: C(0xf0dca0), wetSand: C(0xc9ad78), shoreGrass: C(0x7ccf52), cliff: C(0x9a9080),
  forest: C(0x3f9a3a), forest2: C(0x2f8233), dirt: C(0x7a6040), mud: C(0x8a7a50),
  snowShade: C(0xd2e2f6), ice: C(0xbfe2ff), pineSlope: C(0x5a8a6a), slate: C(0x7c8494),
};
const _t = new THREE.Color();
const _r = new THREE.Color();

// Strata bands for cliffs (sandstone layers, slightly wavy).
function strata(x, z, y, out) {
  const band = ((Math.floor((y + noise2(x * 0.02, z * 0.02) * 6) / 5.5) % 3) + 3) % 3;
  return out.copy(band === 0 ? P.sandA : band === 1 ? P.sandB : P.sandC);
}

const COLORS = {
  wasteland(x, z, y, flat, n, out) {
    out.copy(n > 0.5 ? P.dune : P.dune2);
    const steep = 1 - smooth(0.55, 0.8, flat);
    if (steep > 0) out.lerp(strata(x, z, y, _t), steep);
    if (y > 25 && flat > 0.85) out.lerp(P.mesaTop, 0.6);
    return out;
  },
  volcano(x, z, y, flat, n, out) {
    out.copy(n > 0.5 ? P.basalt : P.basalt2);
    out.lerp(P.ash, smooth(0.6, 0.9, flat) * 0.4);
    // Glowing lava veins and the crater lake.
    const vein = ridged(x * 0.012 + 5, z * 0.012, 2) * smooth(0.45, 0.6, noise2(x * 0.004 - 3, z * 0.004));
    if (vein > 0.5) out.lerp(P.lava, smooth(0.5, 0.56, vein));
    const d = Math.hypot(x - VOLCANO.x, z - VOLCANO.z);
    if (d < 60) out.lerp(P.lavaHot, smooth(52, 30, d));
    return out;
  },
  coast(x, z, y, flat, n, out) {
    out.copy(n > 0.5 ? P.shoreGrass : P.grassA);
    out.lerp(P.beach, smooth(SEA + 3.5, SEA + 1.2, y));
    out.lerp(P.wetSand, smooth(SEA + 0.2, SEA - 2, y));
    out.lerp(P.cliff, 1 - smooth(0.5, 0.75, flat));
    return out;
  },
  forest(x, z, y, flat, n, out) {
    out.copy(n > 0.5 ? P.forest : P.forest2);
    out.lerp(P.mud, smooth(SEA + 2.5, SEA + 0.5, y));
    out.lerp(P.dirt, 1 - smooth(0.55, 0.8, flat));
    return out;
  },
  snow(x, z, y, flat, n, out) {
    out.copy(P.pineSlope).lerp(P.snow, smooth(14, 30, y + n * 8));
    out.lerp(n > 0.5 ? P.snowShade : P.ice, (1 - flat) * 0.6);
    out.lerp(P.slate, 1 - smooth(0.45, 0.65, flat));
    return out;
  },
};

// The valley's own colors plus the mountain ring's (grass, sandstone, grey rock, snow).
function hubColor(x, z, y, flat, n, out) {
  const r = Math.hypot(x, z);
  out.copy(noise2(x * 0.07, z * 0.07) > 0.5 ? P.grassA : P.grassB);
  out.lerp(P.grassHigh, smooth(4, 14, y) * 0.8);
  if (r > 18 && noise2(x * 0.05 + 30, z * 0.05) > 0.72) out.copy(P.rock);
  const up = y - hubHeight(x, z, r);
  if (up > 3 || flat < 0.75) {
    const m = strata(x, z, y, _t).lerp(n > 0.5 ? P.greyA : P.greyB, smooth(70, 115, y));
    const g = smooth(0.42, 0.62, flat + (n - 0.5) * 0.2) * (1 - smooth(60, 105, up)) + (1 - smooth(4, 16, up));
    m.lerp(n > 0.45 ? P.grassA : P.grassB, Math.min(1, g));
    m.lerp(P.snow, smooth(118, 140, y + n * 12) * smooth(0.3, 0.55, flat));
    out.copy(m);
  }
  return out;
}

// Vertex color for terrain at (x, z) with height y and normal.y `flat`.
export function terrainColor(x, z, y, flat, out = new THREE.Color()) {
  const r = Math.hypot(x, z);
  const n = noise2(x * 0.05, z * 0.05);
  hubColor(x, z, y, flat, n, out);
  const rm = regionMix(r);
  if (rm <= 0) return out;
  const w = regionWeights(x, z);
  _r.setRGB(0, 0, 0);
  for (let k = 0; k < REGIONS.length; k++) {
    if (w[k] < 0.01) continue;
    COLORS[REGIONS[k].id](x, z, y, flat, n, _t);
    _r.r += _t.r * w[k]; _r.g += _t.g * w[k]; _r.b += _t.b * w[k];
  }
  // Mountain-ring rock stays rock even as the region takes over.
  const ringUp = y - hubHeight(x, z, r);
  const keepRing = r < 430 ? smooth(25, 60, ringUp) * (1 - smooth(300, 430, r)) : 0;
  out.lerp(_r, rm * (1 - keepRing));
  // Snow on the highest peaks anywhere.
  out.lerp(P.snow, smooth(150, 185, y + n * 15) * smooth(0.35, 0.6, flat));
  return out;
}
