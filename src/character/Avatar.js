import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toonUnique, addOutline, outlineExtrudeMaterial } from '../render/toon.js';
import { buildHairGeometry, HEAD_RADIUS } from './hair.js';
import { SKIN_TONES, HAIR_COLORS, EYE_COLORS, paletteColor, buildOf } from './options.js';
import { FORMS } from '../progression/forms.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { torsoBand, torsoShell, torsoPoint, bulge, neck, thigh, calf, upperArm, forearm, partBasis } from './anatomy.js';

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const tmpTarget = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _elbow = new THREE.Vector3();
const _hint = new THREE.Vector3();
const _bias = new THREE.Vector3();
const _basis = new THREE.Matrix4();

const ARMOR_TRIM = 0x17171d;
const UPPER_ARM = 0.3;
const LOWER_ARM = 0.29;

// "Rokan, the Primal Titan": the one base model every player customizes.
// Broad shoulders, V-taper torso, heavy boots, wrist wraps, strong jaw.
//
// Structure (one rig for every look):
//   root            placed by whoever owns the avatar (creator preview, mirror)
//   └ body          scaled by the build preset's height
//     ├ static      torso, legs, armor, boots: merged into one mesh per
//     │             material (≈8 draw calls + outlines) and rebuilt when the
//     │             outfit, build or form changes
//     ├ head        merged face parts + hair; rotates with the player's head
//     └ arms        upper / lower / wrap / fist per side, posed with 2-bone IK
//
// Materials are per role (skin, suit, armor, gloves, boots, belt, ...) so the
// creator recolors sections live without rebuilding geometry. Forms change
// hair shape and color, eyes, muscle, and add fur / tail (see forms.js).
export class Avatar {
  constructor(character) {
    this.root = new THREE.Group();
    this.root.name = 'avatar';
    this.character = { ...character };
    this.formId = 'base';
    this.bodyKey = '';
    this.mats = {
      skin: toonUnique(0xffffff),
      hair: toonUnique(0xffffff),
      suit: toonUnique(0xffffff),
      armor: toonUnique(0xffffff),
      gloves: toonUnique(0xffffff),
      boots: toonUnique(0xffffff),
      belt: toonUnique(0xffffff),
      trim: toonUnique(ARMOR_TRIM),
      fur: toonUnique(0xb3202a),
      scar: toonUnique(0xffffff),
      eyeWhite: new THREE.MeshBasicMaterial({ color: 0xffffff }),
      iris: new THREE.MeshBasicMaterial({ color: 0x111111 }),
      dark: new THREE.MeshBasicMaterial({ color: 0x15100c }),
      // Anime ink lines for muscle definition (pec edges, abs), tinted to the skin.
      line: new THREE.MeshBasicMaterial({ color: 0x2a1a10, side: THREE.DoubleSide }),
    };
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.staticGroup = new THREE.Group();
    this.body.add(this.staticGroup);
    this.head = new THREE.Group();
    this.body.add(this.head);
    this.faceGroup = new THREE.Group();
    this.head.add(this.faceGroup);
    this.hairMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.mats.hair);
    this.hairMesh.castShadow = true;
    this.head.add(this.hairMesh);
    this.hairOutline = addOutline(this.hairMesh, 0.03);
    this.buildArms();
    this.apply(character);
  }

  // ---- Static body -----------------------------------------------------------
  // Each part is added to a bucket by material role, then merged. The body is
  // sculpted from lofted muscle shapes (see anatomy.js), not stacked spheres.
  rebuildBody() {
    const c = this.character;
    const f = FORMS[this.formId];
    const b = buildOf(c);
    const female = c.body === 'female';
    const muscle = f.body?.muscle || 1;
    const key = JSON.stringify([c.outfit, c.build, c.body, this.formId === 'ssj4', muscle]);
    if (key === this.bodyKey) return;
    this.bodyKey = key;

    for (const ch of [...this.staticGroup.children]) { ch.geometry.dispose(); this.staticGroup.remove(ch); }
    const parts = {};
    const push = (role, geo) => {
      const g = geo.index ? geo.toNonIndexed() : geo;
      if (g !== geo) geo.dispose();
      for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal') g.deleteAttribute(n);
      (parts[role] ||= []).push(g);
    };
    const add = (role, geo, pos, rot = [0, 0, 0], scl = [1, 1, 1]) => {
      _q.setFromEuler(_e.set(rot[0], rot[1], rot[2]));
      _m.compose(_p.set(pos[0], pos[1], pos[2]), _q, _s.set(scl[0], scl[1], scl[2]));
      addM(role, geo, _m);
    };
    const addM = (role, geo, matrix) => {
      if (matrix) geo.applyMatrix4(matrix);
      push(role, geo);
    };

    const o = c.outfit;
    const primal = o === 'primal';
    const w = b.width * muscle * (female ? 1 : 1.08);
    const d = b.chestDepth * muscle;
    const L = b.limb * muscle * (female ? 0.88 : 1.08);
    // Muscle definition: bigger builds and transformations show more of it;
    // cloth smooths it out.
    const def = Math.min(1.5, b.limb * muscle) * (female ? 0.6 : 1);
    const clothed = { primal: 1, tank: 0.75, rokan: 0.55, gi: 0.45, jacket: 0.45 }[o] ?? 0.6;
    const P = { female, w, d, def: def * clothed };
    const front = (y, extra = 0) => torsoPoint(y, 0, P, _p).z + extra;
    const side = (y, extra = 0) => torsoPoint(y, Math.PI / 2, P, _p).x + extra;

    const legRole = o === 'gi' || primal ? 'armor' : 'suit';
    const topRole = primal ? 'skin' : o === 'rokan' ? 'suit' : 'armor';

    // Torso, split into bands so each clothing region gets its material.
    if (primal) {
      // Baggy gi pants ride up over the hips; bare, sculpted torso above.
      push('armor', torsoShell(0.8, 1.06, P, (t) => 0.03 * (1 - t) + 0.012));
      push('skin', torsoBand(1.0, 1.58, P));
    } else {
      push(legRole, torsoBand(0.8, 1.0, P));
      const neckTop = o === 'tank' ? 1.44 : 1.5;
      push(o === 'tank' ? 'armor' : topRole, torsoBand(1.0, neckTop, P));
      push('skin', torsoBand(neckTop, 1.58, P));
    }
    // Neck with sternocleidomastoid ridges; it tucks into the traps and head.
    _m.makeTranslation(0, 1.5, -0.01);
    addM('skin', neck(0.2, Math.sqrt(w) * (female ? 1 : 1.05), female), _m);

    // Legs: hip -> knee -> ankle, angled slightly outward for a wide stance.
    for (const s of [-1, 1]) {
      const hip = tmpA.set(0.1 * s * Math.sqrt(w), 0.92, 0);
      const knee = tmpB.set(0.135 * s, 0.5, 0.012);
      const ankle = tmpC.set(0.14 * s, 0.1, 0);
      const thighDir = new THREE.Vector3().subVectors(knee, hip);
      const shinDir = new THREE.Vector3().subVectors(ankle, knee);
      const fwd = new THREE.Vector3(0, 0, 1);
      const baggy = primal ? 1.3 : o === 'gi' ? 1.12 : 1;
      const thighM = partBasis(hip, thighDir, fwd, new THREE.Matrix4());
      addM(legRole, thigh(thighDir.length(), L, def, s, baggy, primal ? 0.3 : 0.6), thighM);
      if (primal) {
        // Loose lower pant leg blousing over the ankle wraps, ragged hem.
        add('armor', raggedTube(0.105 * L, 0.125 * L, 0.38, 14, 0.035), [0.14 * s, 0.37, 0.005]);
        // Sandals: bare foot on a dark sole with a strap, bandaged ankles.
        const x = 0.14 * s;
        add('skin', new THREE.SphereGeometry(0.5, 12, 8), [x, 0.05, 0.06], [0, 0.08 * s, 0], [0.11 * L, 0.09, 0.26]);
        add('boots', new THREE.BoxGeometry(0.13 * L, 0.03, 0.28), [x, 0.015, 0.06], [0, 0.08 * s, 0]);
        add('boots', new THREE.CylinderGeometry(0.075 * L, 0.08 * L, 0.06, 10, 1, true), [x, 0.07, 0.03], [0.25, 0, 0], [1, 1, 1.25]);
        add('suit', new THREE.CylinderGeometry(0.06 * L, 0.066 * L, 0.16, 10), [x, 0.15, 0]);
      } else {
        addM(legRole, calf(shinDir.length(), L, def), partBasis(knee, shinDir, fwd, new THREE.Matrix4()));
        // Heavy anime boots: wide rounded foot, tall shaft, contrasting cuff.
        const x = 0.14 * s;
        add('boots', new THREE.SphereGeometry(0.5, 12, 8), [x, 0.07, 0.05], [0, 0.08 * s, 0], [0.14 * L, 0.14, 0.3]);
        add('trim', new THREE.BoxGeometry(0.15 * L, 0.03, 0.3), [x, 0.015, 0.05], [0, 0.08 * s, 0]);
        add('boots', new THREE.CylinderGeometry(0.088 * L, 0.078 * L, 0.34, 12), [x, 0.25, 0]);
        add('belt', new THREE.CylinderGeometry(0.096 * L, 0.092 * L, 0.05, 12), [x, 0.43, 0]);
      }
    }

    // Bare chest: ink lines like an anime drawing (pec undersides, sternum,
    // six-pack grid, outer ab edges) so the muscles read even in flat light.
    if (primal && !female) {
      const ink = (pts, wid) => push('line', ribbon(pts.map(([y, a]) => torsoPoint(y, a, { ...P, offset: 0.0015 }, new THREE.Vector3())), wid));
      const seq = (n, fn) => Array.from({ length: n + 1 }, (_, i) => fn(i / n));
      for (const s of [-1, 1]) {
        ink(seq(12, (t) => [1.305 + 0.075 * t ** 1.8, s * (0.06 + 0.78 * t)]), 0.007);
        ink(seq(8, (t) => [1.07 + 0.2 * t, s * (0.52 - 0.12 * t)]), 0.004);
      }
      ink(seq(6, (t) => [1.33 + 0.07 * t, 0]), 0.004);
      ink(seq(10, (t) => [1.08 + 0.2 * t, 0]), 0.004);
      for (const y of [1.2, 1.137]) ink(seq(8, (t) => [y - 0.006 * Math.sin(Math.PI * t), -0.38 + 0.76 * t]), 0.0035);
    }

    // Belt with buckle (or a thick tied sash for the primal gi).
    if (primal) {
      push('belt', torsoShell(0.99, 1.075, P, (t) => 0.034 * bulge(t, 0.4) + 0.02));
      const z = front(1.035, 0.05);
      add('belt', new THREE.SphereGeometry(0.042, 10, 8), [0.02, 1.035, z], [0, 0, 0], [1.25, 1, 0.75]);
      add('belt', new THREE.BoxGeometry(0.06, 0.3, 0.02), [0.04, 0.86, z - 0.012], [-0.12, 0, 0.1]);
      add('belt', new THREE.BoxGeometry(0.055, 0.24, 0.02), [-0.01, 0.88, z - 0.012], [-0.12, 0, -0.14]);
    } else {
      push('belt', torsoShell(1.005, 1.07, P, (t) => 0.02 * bulge(t, 0.3) + 0.004));
      add(o === 'gi' ? 'belt' : 'trim', new THREE.BoxGeometry(0.09, 0.07, 0.03), [0, 1.04, front(1.04, 0.022)]);
    }

    if (o === 'rokan') {
      // Titan battle armor: chest plate over the undersuit, trim at the
      // lower edge, collar, shoulder guards and waist flaps.
      push('armor', torsoShell(1.15, 1.52, P, (t) => 0.024 * bulge(t, 0.12) + 0.003));
      push('trim', torsoShell(1.14, 1.185, P, (t) => 0.03 * bulge(t, 0.5) + 0.004));
      add('trim', new THREE.TorusGeometry(0.085, 0.02, 6, 16), [0, 1.53, 0], [Math.PI / 2, 0, 0], [1.25 * Math.sqrt(w), 1, 1]);
      for (const s of [-1, 1]) {
        add('armor', new THREE.SphereGeometry(0.13, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), [(side(1.42) + 0.02) * s, 1.47, 0], [0, 0, -0.45 * s], [1.15 * L, 0.7, 1.1 * L]);
        add('trim', new THREE.SphereGeometry(0.128, 12, 4, 0, Math.PI * 2, 0, Math.PI / 2), [(side(1.42) + 0.02) * s, 1.455, 0], [0, 0, -0.45 * s], [1.2 * L, 0.45, 1.15 * L]);
        // Front and side waist flaps
        add('armor', new THREE.BoxGeometry(0.15, 0.2, 0.03), [0.09 * s * w, 0.9, front(0.92, 0.03)], [-0.2, 0, 0.05 * s]);
        add('armor', new THREE.BoxGeometry(0.03, 0.2, 0.16), [(side(0.92) + 0.03) * s, 0.9, 0], [0, 0, 0.18 * s]);
      }
    } else if (o === 'gi') {
      // V-neck undershirt and sash tails.
      add('suit', new THREE.ConeGeometry(0.075, 0.17, 3), [0, 1.43, front(1.43, 0.004)], [Math.PI, 0, 0], [1, 1, 0.3]);
      add('belt', new THREE.BoxGeometry(0.05, 0.16, 0.02), [0.06, 0.94, front(0.95, 0.03)], [-0.1, 0, 0.12]);
      add('belt', new THREE.BoxGeometry(0.05, 0.14, 0.02), [-0.04, 0.95, front(0.96, 0.03)], [-0.1, 0, -0.1]);
    } else if (o === 'jacket') {
      add('armor', new THREE.TorusGeometry(0.085, 0.03, 6, 14), [0, 1.52, 0], [Math.PI / 2, 0, 0], [1.25 * Math.sqrt(w), 1, 1]);
      add('suit', new THREE.BoxGeometry(0.045, 0.3, 0.02), [0, 1.3, front(1.3, 0.004)], [-0.05, 0, 0]);
    }

    // Super Saiyan 4 style: red fur over the torso and a tail.
    if (f.body?.fur) {
      push('fur', torsoShell(1.02, 1.5, { ...P, def: P.def * 0.6 }, (t) => 0.018 * bulge(t, 0.15) + 0.004));
    }
    if (f.body?.tail) {
      const tail = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.95, -0.14), new THREE.Vector3(0, 0.75, -0.32), new THREE.Vector3(0.15, 0.6, -0.42),
        new THREE.Vector3(0.3, 0.75, -0.44), new THREE.Vector3(0.32, 0.95, -0.32),
      ]);
      add('fur', new THREE.TubeGeometry(tail, 16, 0.04, 6, false), [0, 0, 0]);
    }

    for (const [role, geos] of Object.entries(parts)) {
      const g = mergeGeometries(geos, false);
      geos.forEach((x) => x.dispose());
      const mesh = new THREE.Mesh(g, this.mats[role.replace('Detail', '')]);
      mesh.castShadow = true;
      this.staticGroup.add(mesh);
      if (role !== 'trim' && role !== 'line' && !role.endsWith('Detail')) {
        const out = new THREE.Mesh(g, outlineExtrudeMaterial(0.009));
        out.userData.isOutline = true;
        out.raycast = () => {};
        this.staticGroup.add(out);
      }
    }

    // Arms: sculpted per build, attached at the shoulder socket just inside
    // the torso's widest point so the deltoid caps the joint.
    const armK = L * (o === 'rokan' || o === 'tank' ? 1.04 : 1);
    for (const side of ['left', 'right']) {
      const a = this.arms[side];
      const outer = -a.s;
      a.shoulder.set((side === 'left' ? 1 : -1) * (sideX(P, 1.42) + 0.035 * armK), female ? 1.42 : 1.43, -0.005);
      setGeo(a.upper, upperArm(UPPER_ARM, armK, def, outer, female));
      setGeo(a.lower, forearm(LOWER_ARM - 0.035, armK, def, outer, female));
      setGeo(a.fist, new RoundedBoxGeometry(0.084 * armK, 0.092 * armK, 0.09 * armK, 2, 0.024 * armK));
      const fingers = new RoundedBoxGeometry(0.088 * armK, 0.04 * armK, 0.07 * armK, 2, 0.016 * armK);
      fingers.translate(0, 0.036 * armK, 0.016 * armK);
      setGeo(a.knuckle, fingers);
      a.wrap.scale.setScalar(armK);
    }
    this.poseArms();
  }

  // ---- Face --------------------------------------------------------------------
  rebuildFace() {
    const c = this.character;
    const key = JSON.stringify([c.brows, c.scar, c.expression, c.body]);
    if (key === this.faceKey) return;
    this.faceKey = key;
    for (const ch of [...this.faceGroup.children]) { ch.geometry.dispose(); this.faceGroup.remove(ch); }
    const parts = {};
    const add = (role, geo, pos, rot = [0, 0, 0], scl = [1, 1, 1]) => {
      _q.setFromEuler(_e.set(rot[0], rot[1], rot[2]));
      _m.compose(_p.set(pos[0], pos[1], pos[2]), _q, _s.set(scl[0], scl[1], scl[2]));
      const g = geo.index ? geo.toNonIndexed() : geo.clone();
      g.applyMatrix4(_m);
      for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal') g.deleteAttribute(n);
      (parts[role] ||= []).push(g);
      geo.dispose();
    };
    const R = HEAD_RADIUS;
    const female = c.body === 'female';
    // Skull, strong jaw and chin, brow ridge, ears, nose.
    add('skin', new THREE.SphereGeometry(R, 16, 12), [0, 0, 0], [0, 0, 0], [0.95, 1.03, 1]);
    add('skin', new THREE.SphereGeometry(R * 0.8, 14, 10), [0, -0.068, 0.018], [0, 0, 0], [female ? 0.88 : 0.96, 0.8, 0.92]);
    if (!female) { 
      // Faceted, projecting jaw/chin gives the hero a stern anime profile.
      add('skin', new THREE.BoxGeometry(0.115, 0.045, 0.082), [0, -0.112, 0.047], [0, 0, 0], [1, 1, 1]);
      for (const s of [-1, 1]) add('skin', new THREE.SphereGeometry(0.037, 8, 6), [s * 0.069, -0.055, 0.036], [0, 0, 0], [0.85, 1.15, 0.7]);
    }
    add('skin', new THREE.CapsuleGeometry(0.016, 0.085, 3, 6), [0, 0.032, R * 0.88], [0, 0, Math.PI / 2]);
    for (const s of [-1, 1]) add('skin', new THREE.SphereGeometry(0.024, 8, 6), [s * R * 0.93, -0.005, -0.005], [0, 0, 0], [0.5, 1, 0.8]);
    add('skin', new THREE.ConeGeometry(0.012, 0.03, 4), [0, -0.022, R * 1.0], [Math.PI / 2, 0, 0]);

    // Eyes: expression sets their openness.
    const ex = { fierce: [1.0, 0.48, 0.75], focused: [1, 0.8, 0.9], bright: [0.95, 1.25, 1.1] }[c.expression] || [1.05, 0.68, 0.85];
    for (const s of [-1, 1]) {
      const x = 0.043 * s;
      const z = R * 0.97;
      add('eyeWhite', new THREE.CircleGeometry(0.027, 14), [x, 0.004, z], [0, 0.18 * s, 0], [ex[0], ex[1] * 1.15, 1]);
      add('iris', new THREE.CircleGeometry(0.016 * ex[2], 12), [x - 0.004 * s, 0.002, z + 0.002], [0, 0.18 * s, 0]);
      add('dark', new THREE.CircleGeometry(0.0075 * ex[2], 10), [x - 0.004 * s, 0.002, z + 0.003], [0, 0.18 * s, 0]);
      // Upper lid line: slants down toward the nose for a fierce look.
      const lidTilt = c.expression === 'bright' ? 0.05 : c.expression === 'focused' ? 0.15 : 0.39;
      add('dark', new THREE.PlaneGeometry(0.064, 0.009), [x, 0.004 + 0.031 * ex[1], z + 0.004], [0, 0.18 * s, lidTilt * s]);
      // Brows
      const br = { fierce: [0.066, 0.017, 0.45, 0.044], heavy: [0.07, 0.026, 0.18, 0.046], sharp: [0.064, 0.01, 0.6, 0.046], calm: [0.056, 0.011, -0.05, 0.05] }[c.brows] || [0.066, 0.017, 0.45, 0.044];
      add('hairBrow', new THREE.PlaneGeometry(br[0], br[1]), [0.046 * s, br[3] - (c.expression === 'fierce' ? 0.007 : 0), R * 0.97 + 0.008], [0, 0.18 * s, br[2] * s]);
    }
    add('dark', new THREE.PlaneGeometry(c.expression === 'bright' ? 0.03 : 0.04, 0.007), [0, -0.07, R * 0.93]);

    // Scars
    const scarZ = R * 0.96 + 0.007;
    if (c.scar === 'eye' || c.scar === 'cross') add('scar', new THREE.PlaneGeometry(0.008, 0.075), [0.046, 0.0, scarZ + 0.002], [0, 0.18, 0.15]);
    if (c.scar === 'cheek') add('scar', new THREE.PlaneGeometry(0.045, 0.008), [-0.055, -0.045, R * 0.9], [0, -0.45, 0.5]);
    if (c.scar === 'cross') add('scar', new THREE.PlaneGeometry(0.06, 0.008), [0.046, -0.005, scarZ + 0.003], [0, 0.18, -0.7]);

    for (const [role, geos] of Object.entries(parts)) {
      const g = mergeGeometries(geos, false);
      geos.forEach((x) => x.dispose());
      const mat = role === 'hairBrow' ? this.mats.hair : this.mats[role];
      const mesh = new THREE.Mesh(g, mat);
      if (role === 'skin') {
        mesh.castShadow = true;
        const out = new THREE.Mesh(g, outlineExtrudeMaterial(0.006));
        out.userData.isOutline = true;
        out.raycast = () => {};
        this.faceGroup.add(out);
      }
      this.faceGroup.add(mesh);
    }
  }

  // ---- Arms (2-bone, posed with simple IK so the mirror copies the player) ------
  // Geometry is sculpted in rebuildBody (it depends on the build); here we
  // only create the meshes and their outlines.
  buildArms() {
    const m = this.mats;
    this.arms = {};
    for (const side of ['left', 'right']) {
      const s = side === 'left' ? 1 : -1; // avatar's left is +X
      const upper = new THREE.Mesh(new THREE.BufferGeometry(), m.skin);
      const lower = new THREE.Mesh(new THREE.BufferGeometry(), m.skin);
      const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.041, 0.09, 12), m.gloves);
      const fist = new THREE.Mesh(new THREE.BufferGeometry(), m.skin);
      const knuckle = new THREE.Mesh(new THREE.BufferGeometry(), m.gloves);
      for (const p of [upper, lower, fist, knuckle]) {
        p.castShadow = true;
        const out = new THREE.Mesh(p.geometry, outlineExtrudeMaterial(p === knuckle ? 0.005 : 0.008));
        out.userData.isOutline = true;
        out.raycast = () => {};
        p.add(out);
        p.userData.outline = out;
      }
      this.body.add(upper, lower, fist, knuckle, wrap);
      this.arms[side] = {
        s, upper, lower, wrap, fist, knuckle,
        shoulder: new THREE.Vector3(0.3 * s, 1.44, 0),
        target: new THREE.Vector3(0.32 * s, 0.98, 0.12),
      };
    }
  }

  // Place arm segments for shoulder -> hand target with a simple 2-bone IK.
  // Each segment is oriented so its biceps / forearm flexors face the inside
  // of the elbow bend.
  poseArms() {
    const lu = UPPER_ARM;
    const ll = LOWER_ARM;
    for (const side of ['left', 'right']) {
      const a = this.arms[side];
      const sh = a.shoulder;
      const tgt = tmpTarget.copy(a.target);
      const toT = tmpB.subVectors(tgt, sh);
      let d = toT.length();
      const maxD = lu + ll - 0.001;
      if (d > maxD) { toT.multiplyScalar(maxD / d); d = maxD; tgt.copy(sh).add(toT); }
      d = Math.max(d, 0.08);
      // Elbow bends outward/down/back.
      const pole = tmpC.set(a.s * 0.6, -0.8, -0.4).normalize();
      const dir = _dir.copy(toT).normalize();
      const x = (lu * lu - ll * ll + d * d) / (2 * d);
      const h = Math.sqrt(Math.max(lu * lu - x * x, 0));
      const perp = pole.sub(_v1.copy(dir).multiplyScalar(pole.dot(dir))).normalize();
      const elbow = _elbow.copy(sh).addScaledVector(dir, x).addScaledVector(perp, h);
      const upDir = _v1.subVectors(elbow, sh).normalize();
      const loDir = _v2.subVectors(tgt, elbow).normalize();
      _hint.copy(loDir).add(_bias.set(0, 0.05, 0.3));
      placePart(a.upper, sh, upDir, _hint);
      _hint.copy(upDir).negate().add(_bias.set(0, -0.25, 0.15));
      placePart(a.lower, elbow, loDir, _hint);
      a.wrap.position.copy(elbow).addScaledVector(loDir, ll * 0.8);
      a.wrap.quaternion.copy(a.lower.quaternion);
      a.fist.position.copy(tgt);
      a.fist.quaternion.copy(a.lower.quaternion);
      a.knuckle.position.copy(tgt);
      a.knuckle.quaternion.copy(a.lower.quaternion);
    }
  }

  // Set hand targets in avatar-root space and head look rotation.
  setPose(leftLocal, rightLocal, headQuatLocal) {
    const k = 1 / this.body.scale.x;
    if (leftLocal) this.arms.left.target.copy(leftLocal).multiplyScalar(k);
    if (rightLocal) this.arms.right.target.copy(rightLocal).multiplyScalar(k);
    if (headQuatLocal) this.head.quaternion.copy(headQuatLocal);
    this.poseArms();
  }

  // Standard battle stance: fists up in a guard, breathing.
  restPose(t = 0) {
    const breathe = Math.sin(t * 2) * 0.012;
    const a = this.arms;
    a.left.target.set(a.left.shoulder.x * 0.6, 1.38 + breathe, 0.4);
    a.right.target.set(a.right.shoulder.x * 0.45, 1.3 + breathe, 0.44);
    this.head.quaternion.identity();
    this.poseArms();
  }

  apply(character) {
    this.character = { ...character };
    const c = this.character;
    const female = c.body === 'female';
    const skin = SKIN_TONES[c.skin % SKIN_TONES.length].color;
    this.mats.skin.color.setHex(skin);
    this.mats.line.color.setHex(skin).lerp(new THREE.Color(0x120804), 0.7);
    this.mats.scar.color.setHex(skin).lerp(new THREE.Color(0xe8b0a8), 0.55);
    this.mats.armor.color.setHex(paletteColor(c.armorColor));
    this.mats.suit.color.setHex(paletteColor(c.suitColor));
    this.mats.gloves.color.setHex(paletteColor(c.gloveColor));
    this.mats.boots.color.setHex(paletteColor(c.bootColor));
    this.mats.belt.color.setHex(paletteColor(c.beltColor));
    this.body.scale.setScalar(buildOf(c).height * (female ? 0.96 : 1));
    this.head.position.set(0, female ? 1.67 : 1.71, 0.01);
    this.head.scale.setScalar(female ? 0.98 : 0.99); // heroic head-to-body ratio, not chibi
    // Arms: Titan armor and tank top are sleeveless (bare, powerful arms).
    const sleeve = c.outfit === 'gi' || c.outfit === 'jacket';
    const gloved = c.outfit === 'primal'; // fingerless gloves with a colored cuff
    for (const side of ['left', 'right']) {
      const a = this.arms[side];
      a.upper.material = sleeve ? this.mats.armor : this.mats.skin;
      a.lower.material = c.outfit === 'jacket' ? this.mats.armor : this.mats.skin;
      a.fist.material = gloved ? this.mats.gloves : this.mats.skin;
      a.wrap.material = gloved ? this.mats.armor : this.mats.gloves;
      a.knuckle.material = gloved ? this.mats.skin : this.mats.gloves;
    }
    this.rebuildFace();
    this.bodyKey = '';
    this.setForm(this.formId);
  }

  setForm(formId, { rebuildHair = true } = {}) {
    this.formId = formId;
    const f = FORMS[formId];
    const c = this.character;
    if (rebuildHair) {
      const old = this.hairMesh.geometry;
      this.hairMesh.geometry = buildHairGeometry(c.hairStyle, f.hair);
      this.hairOutline.geometry = this.hairMesh.geometry;
      old.dispose();
    }
    const hairColor = f.hair.colorOverride ?? HAIR_COLORS[c.hairColor % HAIR_COLORS.length].color;
    this.mats.hair.color.setHex(hairColor);
    const glowing = f.hair.colorOverride && !f.body?.fur;
    this.mats.hair.emissive.setHex(glowing ? hairColor : 0x000000);
    this.mats.hair.emissiveIntensity = glowing ? 0.35 : 0;
    if (f.body?.fur) this.mats.fur.color.setHex(f.body.fur);
    const eye = f.eyes ?? EYE_COLORS[c.eyeColor % EYE_COLORS.length].color;
    this.mats.iris.color.setHex(eye);
    this.rebuildBody();
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.geometry && !o.userData.isOutline) o.geometry.dispose();
    });
  }
}

// Orient a +Y-built part: origin at `from`, pointing along `dir`, front toward `hint`.
function placePart(mesh, from, dir, hint) {
  partBasis(from, dir, hint, _basis);
  _basis.decompose(mesh.position, mesh.quaternion, _s);
}

// Flat strip along a polyline on the body, tapered at both ends.
function ribbon(pts, width) {
  const pos = [];
  const idx = [];
  const t = new THREE.Vector3(); const n = new THREE.Vector3(); const sd = new THREE.Vector3();
  pts.forEach((p, i) => {
    t.subVectors(pts[Math.min(i + 1, pts.length - 1)], pts[Math.max(i - 1, 0)]).normalize();
    n.set(p.x, 0, p.z).normalize();
    sd.crossVectors(n, t).normalize().multiplyScalar((width / 2) * (0.25 + 0.75 * Math.sin((Math.PI * i) / (pts.length - 1))));
    pos.push(p.x + sd.x, p.y + sd.y, p.z + sd.z, p.x - sd.x, p.y - sd.y, p.z - sd.z);
    if (i) idx.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i - 1, 2 * i + 1, 2 * i);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function setGeo(mesh, g) {
  mesh.geometry.dispose();
  mesh.geometry = g;
  if (mesh.userData.outline) mesh.userData.outline.geometry = g;
}

const _side = new THREE.Vector3();
const sideX = (p, y) => torsoPoint(y, Math.PI / 2, p, _side).x;

// Open tube with a zig-zag bottom edge (ragged cloth hems).
function raggedTube(rTop, rBottom, h, seg, tear) {
  const g = new THREE.CylinderGeometry(rTop, rBottom, h, seg, 2, true);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) < -h / 2 + 1e-4) {
      const a = Math.atan2(p.getZ(i), p.getX(i));
      const k = Math.round(((a + Math.PI) / (Math.PI * 2)) * seg);
      p.setY(i, p.getY(i) + (k % 2 ? tear : 0) + (k % 3 === 0 ? tear * 0.5 : 0));
    }
  }
  g.computeVertexNormals();
  return g;
}
