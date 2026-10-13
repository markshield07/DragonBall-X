import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toonUnique, addOutline, outlineExtrudeMaterial } from '../render/toon.js';
import { buildHairGeometry, HEAD_RADIUS } from './hair.js';
import { SKIN_TONES, HAIR_COLORS, EYE_COLORS, paletteColor, buildOf } from './options.js';
import { FORMS } from '../progression/forms.js';

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
  // Each part is added to a bucket by material role, then merged.
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
    const add = (role, geo, pos, rot = [0, 0, 0], scl = [1, 1, 1]) => {
      _q.setFromEuler(_e.set(rot[0], rot[1], rot[2]));
      _m.compose(_p.set(pos[0], pos[1], pos[2]), _q, _s.set(scl[0], scl[1], scl[2]));
      const g = geo.index ? geo.toNonIndexed() : geo.clone();
      g.applyMatrix4(_m);
      for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal') g.deleteAttribute(n);
      (parts[role] ||= []).push(g);
      geo.dispose();
    };

    const o = c.outfit;
    const w = b.width * muscle * (female ? 0.86 : 1);
    const d = b.chestDepth * muscle;
    const L = b.limb * muscle * (female ? 0.88 : 1);
    const legRole = o === 'gi' ? 'armor' : 'suit';
    const topRole = o === 'rokan' ? 'suit' : 'armor';

    // Heavy anime boots: wide rounded foot, tall shaft, contrasting cuff.
    for (const s of [-1, 1]) {
      const x = 0.14 * s;
      add('boots', new THREE.SphereGeometry(0.5, 12, 8), [x, 0.07, 0.05], [0, 0.08 * s, 0], [0.14 * L, 0.14, 0.3]);
      add('trim', new THREE.BoxGeometry(0.15 * L, 0.03, 0.3), [x, 0.015, 0.05], [0, 0.08 * s, 0]);
      add('boots', new THREE.CylinderGeometry(0.1 * L, 0.088 * L, 0.36, 10), [x, 0.26, 0]);
      add('belt', new THREE.CylinderGeometry(0.11 * L, 0.106 * L, 0.06, 10), [x, 0.44, 0]);
      // Thigh and knee, angled slightly outward for a wide, heavy stance.
      add(legRole, new THREE.CapsuleGeometry(0.1 * L, 0.32, 4, 10), [0.13 * s, 0.72, 0], [0, 0, -0.07 * s]);
      add(legRole, new THREE.SphereGeometry(0.085 * L, 8, 6), [0.135 * s, 0.5, 0.01]);
    }

    // Pelvis, waist, chest: a strong V-taper.
    add(legRole, new THREE.CapsuleGeometry(0.16, 0.06, 4, 12), [0, 0.98, 0], [0, 0, 0], [1.2 * w * (female ? 1.15 : 1), 1, 0.85 * d]);
    add(o === 'tank' ? 'armor' : topRole, new THREE.CapsuleGeometry(0.15, 0.12, 4, 12), [0, 1.12, 0], [0, 0, 0], [1.05 * w, 1, 0.8 * d]);
    add(topRole, new THREE.CapsuleGeometry(0.18, 0.16, 4, 14), [0, 1.3, 0], [0, 0, 0], [1.45 * w, 1, 0.8 * d]);
    // Pecs (or bust) give the chest its shape under any outfit.
    const chestRole = o === 'rokan' ? 'armor' : topRole;
    if (female) {
      add(chestRole, new THREE.SphereGeometry(0.085, 10, 8), [0, 1.33, 0.1 * d], [0, 0, 0], [2.0, 0.9, 0.9]);
    } else {
      for (const s of [-1, 1]) add(chestRole, new THREE.SphereGeometry(0.11, 10, 8), [0.1 * w * s, 1.36, 0.1 * d], [0, 0, 0], [1.15 * w, 0.8, 0.55 * d]);
    }
    // Traps and thick neck.
    for (const s of [-1, 1]) add('skin', new THREE.SphereGeometry(female ? 0.07 : 0.1, 10, 6), [0.12 * w * s, 1.5, -0.02], [0, 0, 0.35 * s], [1.3, 0.55, 0.9]);
    add('skin', new THREE.CylinderGeometry(female ? 0.06 : 0.075, female ? 0.07 : 0.09, 0.16, 10), [0, 1.53, 0]);

    // Belt with buckle.
    add('belt', new THREE.TorusGeometry(0.165, 0.032, 6, 18), [0, 1.04, 0], [Math.PI / 2, 0, 0], [1.2 * w, 0.85 * d, 1]);
    add(o === 'gi' ? 'belt' : 'trim', new THREE.BoxGeometry(0.09, 0.07, 0.03), [0, 1.04, 0.15 * d]);

    if (o === 'rokan') {
      // Titan battle armor: chest plate over the undersuit, shoulder guards,
      // dark trim and waist flaps.
      add('armor', new THREE.CapsuleGeometry(0.19, 0.12, 4, 14), [0, 1.31, 0.005], [0, 0, 0], [1.5 * w, 0.95, 0.86 * d]);
      add('trim', new THREE.CylinderGeometry(0.205, 0.205, 0.035, 18, 1, true), [0, 1.17, 0], [0, 0, 0], [1.48 * w, 1, 0.86 * d]);
      add('trim', new THREE.TorusGeometry(0.1, 0.022, 6, 16), [0, 1.48, 0.01], [Math.PI / 2, 0, 0], [1.3, 1, 1]);
      for (const s of [-1, 1]) {
        add('armor', new THREE.SphereGeometry(0.13, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), [0.31 * w * s, 1.45, 0], [0, 0, -0.35 * s], [1.3, 0.8, 1.2]);
        add('trim', new THREE.SphereGeometry(0.128, 12, 4, 0, Math.PI * 2, 0, Math.PI / 2), [0.31 * w * s, 1.435, 0], [0, 0, -0.35 * s], [1.36, 0.5, 1.26]);
        // Front and side waist flaps
        add('armor', new THREE.BoxGeometry(0.15, 0.2, 0.03), [0.09 * s * w, 0.88, 0.15 * d], [-0.18, 0, 0.05 * s]);
        add('armor', new THREE.BoxGeometry(0.03, 0.2, 0.16), [0.23 * s * w, 0.88, 0], [0, 0, 0.18 * s]);
      }
    } else if (o === 'gi') {
      // V-neck undershirt and sash tails.
      add('suit', new THREE.ConeGeometry(0.09, 0.18, 3), [0, 1.42, 0.13 * d], [Math.PI, 0, 0], [1, 1, 0.3]);
      add('belt', new THREE.BoxGeometry(0.05, 0.16, 0.02), [0.06, 0.94, 0.16 * d], [0, 0, 0.12]);
      add('belt', new THREE.BoxGeometry(0.05, 0.14, 0.02), [-0.04, 0.95, 0.16 * d], [0, 0, -0.1]);
      for (const s of [-1, 1]) add('armor', new THREE.SphereGeometry(0.1, 10, 6), [0.29 * w * s, 1.43, 0], [0, 0, 0], [1.1 * L, 0.9, 1]);
    } else if (o === 'jacket') {
      add('armor', new THREE.TorusGeometry(0.1, 0.035, 6, 14), [0, 1.48, 0], [Math.PI / 2, 0, 0], [1.2, 1, 1]);
      add('suit', new THREE.BoxGeometry(0.045, 0.28, 0.02), [0, 1.3, 0.15 * d]);
      for (const s of [-1, 1]) add('armor', new THREE.SphereGeometry(0.1, 10, 6), [0.29 * w * s, 1.43, 0], [0, 0, 0], [1.1 * L, 0.9, 1]);
    } else {
      for (const s of [-1, 1]) add('skin', new THREE.SphereGeometry(0.1, 10, 6), [0.29 * w * s, 1.43, 0], [0, 0, 0], [1.1 * L, 0.9, 1]);
    }

    // Super Saiyan 4 style: red fur over the torso and a tail.
    if (f.body?.fur) {
      add('fur', new THREE.CapsuleGeometry(0.19, 0.24, 4, 12), [0, 1.26, -0.01], [0, 0, 0], [1.5 * w, 1, 0.85 * d]);
    }
    if (f.body?.tail) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.95, -0.14), new THREE.Vector3(0, 0.75, -0.32), new THREE.Vector3(0.15, 0.6, -0.42),
        new THREE.Vector3(0.3, 0.75, -0.44), new THREE.Vector3(0.32, 0.95, -0.32),
      ]);
      add('fur', new THREE.TubeGeometry(curve, 16, 0.04, 6, false), [0, 0, 0]);
    }

    for (const [role, geos] of Object.entries(parts)) {
      const g = mergeGeometries(geos, false);
      geos.forEach((x) => x.dispose());
      const mesh = new THREE.Mesh(g, this.mats[role]);
      mesh.castShadow = true;
      this.staticGroup.add(mesh);
      if (role !== 'trim') {
        const out = new THREE.Mesh(g, outlineExtrudeMaterial(0.011));
        out.userData.isOutline = true;
        out.raycast = () => {};
        this.staticGroup.add(out);
      }
    }

    // Arms attach at the (build-dependent) shoulders.
    for (const side of ['left', 'right']) {
      const a = this.arms[side];
      a.shoulder.set((female ? 0.26 : 0.3) * w * a.s, female ? 1.42 : 1.44, 0);
      const k = L;
      a.upper.scale.set(k * (o === 'rokan' || o === 'tank' ? 1.05 : 1), 1, k);
      a.lower.scale.set(k, 1, k);
      a.wrap.scale.set(k, 1, k);
      a.fist.scale.set(k, k * 0.9, k * 1.15);
      a.knuckle.scale.set(k, 1, k);
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
    add('skin', new THREE.SphereGeometry(R * 0.8, 12, 8), [0, -0.06, 0.02], [0, 0, 0], [female ? 0.88 : 1.02, 0.85, 0.95]);
    if (!female) add('skin', new THREE.SphereGeometry(0.045, 10, 6), [0, -0.105, 0.055], [0, 0, 0], [1.35, 0.85, 1]);
    add('skin', new THREE.CapsuleGeometry(0.016, 0.085, 3, 6), [0, 0.032, R * 0.88], [0, 0, Math.PI / 2]);
    for (const s of [-1, 1]) add('skin', new THREE.SphereGeometry(0.024, 8, 6), [s * R * 0.93, -0.005, -0.005], [0, 0, 0], [0.5, 1, 0.8]);
    add('skin', new THREE.ConeGeometry(0.012, 0.03, 4), [0, -0.022, R * 1.0], [Math.PI / 2, 0, 0]);

    // Eyes: expression sets their openness.
    const ex = { fierce: [1.05, 0.68, 0.85], focused: [1, 0.92, 1], bright: [0.95, 1.25, 1.1] }[c.expression] || [1.05, 0.68, 0.85];
    for (const s of [-1, 1]) {
      const x = 0.043 * s;
      const z = R * 0.97;
      add('eyeWhite', new THREE.CircleGeometry(0.027, 14), [x, 0.004, z], [0, 0.18 * s, 0], [ex[0], ex[1] * 1.15, 1]);
      add('iris', new THREE.CircleGeometry(0.016 * ex[2], 12), [x - 0.004 * s, 0.002, z + 0.002], [0, 0.18 * s, 0]);
      add('dark', new THREE.CircleGeometry(0.0075 * ex[2], 10), [x - 0.004 * s, 0.002, z + 0.003], [0, 0.18 * s, 0]);
      // Upper lid line: slants down toward the nose for a fierce look.
      const lidTilt = c.expression === 'bright' ? 0.05 : c.expression === 'focused' ? 0.15 : 0.32;
      add('dark', new THREE.PlaneGeometry(0.064, 0.009), [x, 0.004 + 0.031 * ex[1], z + 0.004], [0, 0.18 * s, lidTilt * s]);
      // Brows
      const br = { fierce: [0.066, 0.017, 0.45, 0.044], heavy: [0.07, 0.026, 0.18, 0.046], sharp: [0.064, 0.01, 0.6, 0.046], calm: [0.056, 0.011, -0.05, 0.05] }[c.brows] || [0.066, 0.017, 0.45, 0.044];
      add('hairBrow', new THREE.PlaneGeometry(br[0], br[1]), [0.046 * s, br[3], R * 0.97 + 0.006], [0, 0.18 * s, br[2] * s]);
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
  buildArms() {
    const m = this.mats;
    this.arms = {};
    for (const side of ['left', 'right']) {
      const s = side === 'left' ? 1 : -1; // avatar's left is +X
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.2, 4, 10), m.skin);
      const lower = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.18, 4, 10), m.skin);
      const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.064, 0.12, 10), m.gloves);
      const fist = new THREE.Mesh(new THREE.SphereGeometry(0.068, 12, 8), m.skin);
      const knuckle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.035, 10), m.gloves);
      [upper, lower, fist].forEach((p) => { p.castShadow = true; this.body.add(p); addOutline(p, 0.05); });
      this.body.add(wrap, knuckle);
      this.arms[side] = {
        s, upper, lower, wrap, fist, knuckle,
        shoulder: new THREE.Vector3(0.3 * s, 1.44, 0),
        target: new THREE.Vector3(0.32 * s, 0.98, 0.12),
      };
    }
  }

  // Place arm segments for shoulder -> hand target with a simple 2-bone IK.
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
      const dir = toT.clone().normalize();
      const x = (lu * lu - ll * ll + d * d) / (2 * d);
      const h = Math.sqrt(Math.max(lu * lu - x * x, 0));
      const perp = pole.sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
      const elbow = sh.clone().addScaledVector(dir, x).addScaledVector(perp, h);
      this.placeSegment(a.upper, sh, elbow);
      this.placeSegment(a.lower, elbow, tgt);
      a.wrap.position.copy(elbow).lerp(tgt, 0.72);
      a.wrap.quaternion.copy(a.lower.quaternion);
      a.fist.position.copy(tgt);
      a.fist.quaternion.copy(a.lower.quaternion);
      a.knuckle.position.copy(tgt);
      a.knuckle.quaternion.copy(a.lower.quaternion);
    }
  }

  placeSegment(mesh, from, to) {
    mesh.position.copy(from).add(to).multiplyScalar(0.5);
    const dir = tmpA.subVectors(to, from).normalize();
    mesh.quaternion.setFromUnitVectors(UP, dir);
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
    this.mats.scar.color.setHex(skin).lerp(new THREE.Color(0xe8b0a8), 0.55);
    this.mats.armor.color.setHex(paletteColor(c.armorColor));
    this.mats.suit.color.setHex(paletteColor(c.suitColor));
    this.mats.gloves.color.setHex(paletteColor(c.gloveColor));
    this.mats.boots.color.setHex(paletteColor(c.bootColor));
    this.mats.belt.color.setHex(paletteColor(c.beltColor));
    this.body.scale.setScalar(buildOf(c).height * (female ? 0.96 : 1));
    this.head.position.set(0, female ? 1.67 : 1.71, 0.01);
    this.head.scale.setScalar(female ? 1.04 : 1.1);
    // Arms: Titan armor and tank top are sleeveless (bare, powerful arms).
    const sleeve = c.outfit === 'gi' || c.outfit === 'jacket';
    for (const side of ['left', 'right']) {
      this.arms[side].upper.material = sleeve ? this.mats.armor : this.mats.skin;
      this.arms[side].lower.material = c.outfit === 'jacket' ? this.mats.armor : this.mats.skin;
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
