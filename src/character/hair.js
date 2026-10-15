import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Original procedural anime hair. Each style is a list of cone "spikes"
// rooted on the scalp. Transformations re-shape the same spikes (lift them
// upward, lengthen them, recolor) so every hairstyle has its own Super Saiyan
// look instead of swapping to one generic mesh.
//
// Spike: [baseAzimuth, baseElevation, dirAzimuth, dirElevation, length, radius, kind]
// Angles in degrees. Azimuth 0 = face forward (+Z), 90 = character's left (+X).
// kind: 'bang' (forehead, lifts less) | 'back' | undefined.
const R = 0.118;

const S = {
  // Rokan default: tall messy spikes on top swept up and back, long jagged
  // bangs falling over the forehead and side locks down past the ears.
  rokan: [
    // Crown silhouette: broad swept-back clusters with a tall central peak.
    [0, 77, 0, 82, 0.29, 0.075], [32, 76, 38, 77, 0.27, 0.075], [-32, 76, -38, 77, 0.27, 0.075],
    [70, 66, 94, 61, 0.28, 0.075], [-70, 66, -94, 61, 0.28, 0.075],
    [125, 65, 150, 60, 0.3, 0.082], [-125, 65, -150, 60, 0.3, 0.082],
    [0, 70, -20, 66, 0.17, 0.06], [25, 62, 35, 62, 0.2, 0.065], [-25, 62, -35, 62, 0.2, 0.065],
    [55, 55, 75, 45, 0.19, 0.06], [-55, 55, -75, 45, 0.19, 0.06],
    [0, 85, 150, 72, 0.2, 0.07], [180, 80, 175, 50, 0.21, 0.07], [100, 70, 120, 48, 0.18, 0.06], [-100, 70, -120, 48, 0.18, 0.06],
    [140, 50, 155, 22, 0.21, 0.065], [-140, 50, -155, 22, 0.21, 0.065],
    [180, 45, 180, 8, 0.21, 0.07, 'back'], [160, 20, 165, -35, 0.18, 0.06, 'back'], [-160, 20, -165, -35, 0.18, 0.06, 'back'],
    // a few bangs falling over the forehead, one between the eyes
    [4, 42, 6, -48, 0.105, 0.026, 'bang'], [26, 40, 40, -38, 0.11, 0.03, 'bang'], [-26, 40, -40, -38, 0.11, 0.03, 'bang'],
    [45, 36, 65, -40, 0.12, 0.034, 'bang'], [-45, 36, -65, -42, 0.12, 0.034, 'bang'],
    // side locks down past the ears
    [72, 25, 85, -75, 0.17, 0.04, 'bang'], [-72, 25, -85, -75, 0.17, 0.04, 'bang'],
    [95, 20, 105, -70, 0.15, 0.04], [-95, 20, -105, -70, 0.15, 0.04],
  ],
  wild: [
    [0, 62, 0, 70, 0.17, 0.05], [35, 55, 50, 55, 0.2, 0.055], [-35, 55, -50, 55, 0.2, 0.055],
    [80, 35, 95, 20, 0.2, 0.055], [-80, 35, -95, 20, 0.2, 0.055],
    [130, 40, 140, 5, 0.22, 0.06], [-130, 40, -140, 5, 0.22, 0.06], [180, 45, 180, 10, 0.2, 0.06, 'back'],
    [160, 15, 170, -25, 0.18, 0.05, 'back'], [-160, 15, -170, -25, 0.18, 0.05, 'back'],
    [0, 80, 20, 85, 0.18, 0.06], [180, 75, 170, 60, 0.18, 0.06],
    [12, 30, 25, -40, 0.13, 0.035, 'bang'], [-15, 30, -20, -45, 0.12, 0.035, 'bang'], [40, 25, 60, -30, 0.13, 0.035, 'bang'],
  ],
  // Tall spikes standing almost straight up.
  upright: [
    [0, 55, 0, 84, 0.22, 0.055], [30, 62, 20, 86, 0.26, 0.06], [-30, 62, -20, 86, 0.26, 0.06],
    [70, 50, 55, 80, 0.24, 0.06], [-70, 50, -55, 80, 0.24, 0.06], [120, 50, 120, 78, 0.22, 0.06],
    [-120, 50, -120, 78, 0.22, 0.06], [180, 55, 180, 76, 0.24, 0.06], [0, 85, 0, 90, 0.28, 0.065],
    [160, 25, 170, 40, 0.16, 0.05, 'back'], [-160, 25, -170, 40, 0.16, 0.05, 'back'],
    [8, 32, 10, -50, 0.1, 0.03, 'bang'],
  ],
  short: [
    [0, 70, 10, 75, 0.12, 0.05], [40, 55, 60, 50, 0.14, 0.05], [-40, 55, -60, 50, 0.14, 0.05],
    [90, 35, 105, 15, 0.13, 0.045], [-90, 35, -105, 15, 0.13, 0.045], [140, 45, 150, 25, 0.15, 0.055],
    [-140, 45, -150, 25, 0.15, 0.055], [180, 40, 180, 15, 0.14, 0.055, 'back'], [180, 75, 175, 60, 0.12, 0.05],
    [8, 35, 5, -60, 0.15, 0.03, 'bang'],
  ],
  // Long, layered hair falling down the back in tiers.
  layered: [
    [0, 60, 0, 72, 0.16, 0.05], [35, 55, 55, 50, 0.18, 0.055], [-35, 55, -55, 50, 0.18, 0.055],
    [90, 35, 100, -30, 0.3, 0.06], [-90, 35, -100, -30, 0.3, 0.06],
    [140, 40, 160, -60, 0.45, 0.07, 'back'], [-140, 40, -160, -60, 0.45, 0.07, 'back'], [180, 45, 180, -65, 0.55, 0.08, 'back'],
    [160, 20, 170, -75, 0.5, 0.07, 'back'], [-160, 20, -170, -75, 0.5, 0.07, 'back'],
    [120, 55, 140, -40, 0.34, 0.065, 'back'], [-120, 55, -140, -40, 0.34, 0.065, 'back'], [180, 70, 180, -45, 0.4, 0.07, 'back'],
    [12, 30, 25, -40, 0.12, 0.035, 'bang'], [-15, 30, -20, -45, 0.12, 0.035, 'bang'],
  ],
  // Widow's peak at the forehead with a tall flame-shaped crest.
  prince: [
    [0, 40, 0, -55, 0.075, 0.05, 'bang'], [18, 44, 10, -40, 0.06, 0.035, 'bang'], [-18, 44, -10, -40, 0.06, 0.035, 'bang'],
    [0, 50, 0, 82, 0.2, 0.05], [30, 60, 15, 85, 0.3, 0.06], [-30, 60, -15, 85, 0.3, 0.06],
    [70, 50, 40, 82, 0.28, 0.06], [-70, 50, -40, 82, 0.28, 0.06], [120, 50, 110, 80, 0.27, 0.06],
    [-120, 50, -110, 80, 0.27, 0.06], [180, 55, 180, 78, 0.3, 0.065], [0, 85, 0, 90, 0.34, 0.07],
    [150, 30, 160, 70, 0.22, 0.05], [-150, 30, -160, 70, 0.22, 0.05],
  ],
  swordsman: [
    [0, 50, 15, -70, 0.12, 0.05, 'bang'], [-10, 50, -15, -70, 0.12, 0.05, 'bang'],
    [40, 40, 50, -80, 0.17, 0.05], [-40, 40, -50, -80, 0.17, 0.05], [80, 30, 90, -85, 0.2, 0.05],
    [-80, 30, -90, -85, 0.2, 0.05], [120, 30, 125, -82, 0.21, 0.05], [-120, 30, -125, -82, 0.21, 0.05],
    [165, 30, 170, -82, 0.22, 0.055, 'back'], [-165, 30, -170, -82, 0.22, 0.055, 'back'],
    [0, 80, 0, 40, 0.1, 0.06], [180, 70, 180, -40, 0.15, 0.06, 'back'],
  ],
  ponytail: [
    [10, 40, 25, -65, 0.13, 0.04, 'bang'], [-10, 40, -25, -65, 0.13, 0.04, 'bang'], [0, 45, 0, -50, 0.1, 0.04, 'bang'],
    [70, 35, 80, -80, 0.15, 0.04], [-70, 35, -80, -80, 0.15, 0.04],
    [180, 55, 180, -20, 0.35, 0.075, 'back'], [175, 50, 180, -50, 0.42, 0.06, 'back'],
  ],
};

// Extra long spikes used by the "extra long" (Super Saiyan 3 style) form.
const EXTRA_LONG = [
  [180, 40, 180, -82, 0.95, 0.1, 'back'], [150, 40, 160, -84, 0.85, 0.09, 'back'], [-150, 40, -160, -84, 0.85, 0.09, 'back'],
  [120, 35, 130, -85, 0.7, 0.08, 'back'], [-120, 35, -130, -85, 0.7, 0.08, 'back'],
];

const d2r = THREE.MathUtils.degToRad;
const UP = new THREE.Vector3(0, 1, 0);

function dirFrom(az, el) {
  const a = d2r(az);
  const e = d2r(el);
  return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
}

function spikeGeometry(spike, formHair) {
  const [bAz, bEl, dAz, dEl0, len0, rad, kind] = spike;
  const lift = formHair?.lift || 0;
  // Super Saiyan: hair stands up. Bangs lift less so the face stays framed.
  const liftAmt = kind === 'bang' ? lift * 0.45 : lift;
  let dEl = dEl0 + (88 - dEl0) * liftAmt;
  if (formHair?.extraLong && kind === 'back') dEl = Math.min(dEl0, -60);
  if (formHair?.wild) dEl = dEl0 * 0.6 + (Math.random() - 0.5) * 30;
  // Sharper spikes (Super Saiyan 2 style): thinner, a little longer.
  const sharp = formHair?.sharp ? 0.8 : 1;
  const len = len0 * (formHair?.lengthScale || 1);
  const base = dirFrom(bAz, bEl).multiplyScalar(R * 0.82);
  const dir = dirFrom(dAz, dEl).normalize();
  const g = new THREE.ConeGeometry(rad * sharp, len * (formHair?.sharp ? 1.1 : 1), 5, 1);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir));
  g.translate(base.x, base.y, base.z);
  return g;
}

export function buildHairGeometry(styleId, formHair) {
  const spikes = [...(S[styleId] || S.rokan)];
  if (formHair?.extraLong) spikes.push(...EXTRA_LONG);
  const geos = spikes.map((s) => spikeGeometry(s, formHair));
  // Scalp cap covering top and back of the head, leaving the forehead.
  const cap = new THREE.SphereGeometry(R * 1.04, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.56);
  cap.rotateX(-0.32);
  geos.push(cap.toNonIndexed());
  const merged = mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)), false);
  merged.computeVertexNormals();
  return merged;
}

export const HEAD_RADIUS = R;
