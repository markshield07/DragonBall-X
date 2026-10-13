import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { toonUnique, outlineExtrudeMaterial } from '../render/toon.js';
import { FORMS } from '../progression/forms.js';
import { SKIN_TONES, HAIR_COLORS, EYE_COLORS, CHARACTER_TEMPLATES, BUILDS, paletteColor, buildOf, scouterOf } from './options.js';
import { buildScouter } from './Scouter.js';

// Modeled, rigged characters loaded from GLB files (public/models/characters).
// A ModelAvatar has the same public interface as the procedural Avatar
// (root, body, head, arms.{left,right}.{target, shoulder, fist}, poseArms,
// setPose, restPose, apply, setForm, dispose), so the mirror, the creator
// preview and the sparring partner use it unchanged.
//
// The model faces +Z with its left side on +X, feet at y = 0, in meters.
// Arms are posed with two-bone IK on the skeleton; the head bone follows
// `head.quaternion` (avatar space).
// height: real height in meters (every GLB is built 1.837 m tall).
// colors: which customization slot recolors each outfit material; materials
// not listed (trim, accents, sword) keep the color baked into the GLB.
const BUILT_HEIGHT = 1.837;
const ROKAN_COLORS = { Pants: 'armorColor', Band: 'armorColor', Wrap: 'suitColor', Glove: 'gloveColor', Shoe: 'bootColor', Sash: 'beltColor' };
export const MODELS = {
  rokan: { height: 1.84, colors: ROKAN_COLORS },
  kaizen: { height: 1.8, colors: { Pants: 'armorColor', Main: 'armorColor', Under: 'suitColor', Cuff: 'gloveColor', Shoe: 'bootColor', Sash: 'beltColor' } },
  vexar: { height: 1.66, colors: { Main: 'armorColor', Under: 'suitColor', Glove: 'gloveColor', Shoe: 'bootColor' } },
  toren: { height: 1.8, colors: { Main: 'armorColor', Under: 'suitColor', Pants: 'suitColor', Shoe: 'bootColor', Sash: 'beltColor' } },
  zyra: { height: 1.72, colors: { Pants: 'armorColor', Under: 'suitColor', Glove: 'gloveColor', Shoe: 'bootColor', Sash: 'beltColor', Cuff: 'beltColor' } },
  zeron: { height: 1.95, colors: { Main: 'armorColor', Under: 'suitColor', Glove: 'gloveColor', Shoe: 'bootColor' } },
};
for (const [id, m] of Object.entries(MODELS)) m.url = `models/characters/${id}.glb`;

const cache = new Map();

// Hosts that can't serve .glb (the Claude artifact test link) get the same
// bytes base64-wrapped in JSON: build with VITE_MODEL_WRAP=json.
async function fetchModel(url) {
  const loader = new GLTFLoader();
  if (import.meta.env.VITE_MODEL_WRAP !== 'json') return loader.loadAsync(url);
  const res = await fetch(url + '.json');
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}.json`);
  const bin = Uint8Array.from(atob((await res.json()).glb), (c) => c.charCodeAt(0));
  return loader.parseAsync(bin.buffer, url.slice(0, url.lastIndexOf('/') + 1));
}
export function loadModel(id) {
  if (!cache.has(id)) {
    const url = (import.meta.env.BASE_URL || './') + MODELS[id].url;
    cache.set(id, fetchModel(url).catch((e) => {
      console.warn('[DBX] model failed to load', id, e);
      cache.delete(id);
      return null;
    }));
  }
  return cache.get(id);
}

// Which model (if any) represents this character: the template's own model,
// as long as the player kept its body type and outfit style. Other looks use
// the procedural avatar.
export function modelFor(c) {
  const t = CHARACTER_TEMPLATES.find((x) => x.id === c.templateId);
  if (!t || !MODELS[t.id]) return null;
  if (c.body !== t.appearance.body || c.outfit !== t.appearance.outfit) return null;
  return t.id;
}

let ramp = null;
function skinRamp() {
  if (ramp) return ramp;
  ramp = new THREE.DataTexture(new Uint8Array([70, 110, 160, 210, 255]), 5, 1, THREE.RedFormat);
  ramp.minFilter = ramp.magFilter = THREE.LinearFilter;
  ramp.generateMipmaps = false;
  ramp.needsUpdate = true;
  return ramp;
}

// Flat face layers: unlit, no outline, no wounds.
const FACE_PARTS = ['EyeWhite', 'Iris', 'Pupil', 'Highlight', 'Brow', 'Lash'];

// Hair mesh per form (material names in the GLB).
const FORM_HAIR = { base: 'Hair', ssj1: 'HairSSJ', ssj2: 'HairSSJ', ssj3: 'HairSSJ3', ssj4: 'HairSSJ4', ssj5: 'HairSSJ' };
const HAIR_PARTS = ['Hair', 'HairSSJ', 'HairSSJ3', 'HairSSJ4'];
const FINGERS = ['index', 'middle', 'ring', 'pinky'];
const POWER_BONES = ['spine_02', 'thigh_l', 'thigh_r', 'calf_l', 'calf_r', 'foot_l', 'foot_r'];
const _X = new THREE.Vector3(1, 0, 0);
const _pq = new THREE.Quaternion();
const _eu = new THREE.Euler();

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _t = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _e = new THREE.Vector3();
const _m = new THREE.Matrix4();

export class ModelAvatar {
  constructor(character, modelId = modelFor(character) || 'rokan') {
    this.modelId = modelId;
    this.root = new THREE.Group();
    this.root.name = 'avatar';
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.head = new THREE.Object3D(); // look rotation in avatar space (not a scene node)
    this.formId = 'base';
    this.character = { ...character };
    this.mats = {};
    this.parts = {}; // material name -> [meshes]
    this.bones = null;
    this.ready = false;
    this.disposed = false;
    this.arms = {};
    for (const side of ['left', 'right']) {
      const s = side === 'left' ? 1 : -1;
      const fist = new THREE.Object3D();
      this.body.add(fist);
      this.arms[side] = { s, fist, shoulder: new THREE.Vector3(0.24 * s, 1.47, 0), target: new THREE.Vector3(0.3 * s, 1.0, 0.12) };
    }
    this.promise = loadModel(modelId).then((gltf) => { if (gltf && !this.disposed) this.attach(gltf); return this; });
  }

  // ---- Model setup -------------------------------------------------------------------
  attach(gltf) {
    const scene = SkeletonUtils.clone(gltf.scene);
    this.model = scene;
    this.body.add(scene);
    const outlines = [];
    scene.traverse((o) => {
      if (o.isBone && !this.bones) this.bones = {};
      if (o.isBone) this.bones[o.name] = o;
      if (!o.isMesh) return;
      const name = o.material.name || 'Skin';
      const m = this.material(name, o.material);
      o.material = m;
      o.castShadow = true;
      o.frustumCulled = false; // skinned bounds don't follow the pose
      (this.parts[name] ||= []).push(o);
      if (name.startsWith('Hair') || FACE_PARTS.includes(name)) o.userData.noWounds = true;
      if (!FACE_PARTS.includes(name)) outlines.push(o);
    });
    // Ink outlines: the same skinned geometry, back faces pushed out.
    for (const o of outlines) {
      const line = new THREE.SkinnedMesh(o.geometry, outlineExtrudeMaterial(o.material.name?.startsWith('Hair') ? 0.006 : 0.004));
      line.bind(o.skeleton, o.bindMatrix);
      line.userData.isOutline = true;
      line.frustumCulled = false;
      line.raycast = () => {};
      o.parent.add(line);
      o.userData.outline = line;
    }
    const b = this.bones;
    this.chain = {};
    for (const side of ['left', 'right']) {
      const k = side === 'left' ? 'l' : 'r';
      this.chain[side] = { upper: b[`upperarm_${k}`], lower: b[`lowerarm_${k}`], hand: b[`hand_${k}`] };
    }
    this.rest = new Map();
    scene.traverse((o) => { if (o.isBone) this.rest.set(o, o.quaternion.clone()); });
    this.curlFingers();
    // Shoulders in body space (for the rest pose and callers that read them).
    this.root.updateMatrixWorld(true);
    for (const side of ['left', 'right']) {
      this.relPos(this.chain[side].upper, this.arms[side].shoulder).divideScalar(this.body.scale.x);
    }
    this.ready = true;
    this.apply(this.character);
    this.poseArms();
  }

  material(name, src) {
    if (this.mats[name]) return this.mats[name];
    const basic = FACE_PARTS.includes(name);
    const m = basic ? new THREE.MeshBasicMaterial({ color: 0xffffff }) : toonUnique(0xffffff);
    m.name = name;
    if (src?.color) m.color.copy(src.color);
    if (name === 'Skin') {
      // Baked muscle detail plus a softer ramp, so the anatomy reads under cel shading.
      if (src?.normalMap) {
        m.normalMap = src.normalMap;
        m.normalScale.set(2, 2);
      }
      m.gradientMap = skinRamp();
    }
    if (name.startsWith('Sash')) m.side = THREE.DoubleSide;
    this.mats[name] = m;
    return m;
  }

  // ---- Root-space helpers --------------------------------------------------------------
  // All posing math is done relative to `root`, never in world space: the mirror
  // reflects its avatar with a negative scale, which world quaternions can't express.
  relPos(obj, out = new THREE.Vector3()) {
    _m.copy(this.root.matrixWorld).invert().multiply(obj.matrixWorld);
    return out.setFromMatrixPosition(_m);
  }

  relQuat(obj, out = new THREE.Quaternion()) {
    out.identity();
    for (let o = obj; o && o !== this.root; o = o.parent) out.premultiply(o.quaternion);
    return out;
  }

  // Apply a root-space rotation `q` on top of the bone's current orientation.
  rotateRel(bone, q) {
    const parentQ = this.relQuat(bone.parent, _q2);
    const relQ = this.relQuat(bone, new THREE.Quaternion());
    bone.quaternion.copy(parentQ.invert().multiply(q).multiply(relQ));
    bone.updateMatrixWorld(true);
  }

  // Make fists: curl each finger around its knuckle line toward the palm.
  curlFingers() {
    const b = this.bones;
    this.root.updateMatrixWorld(true);
    for (const k of ['l', 'r']) {
      const thumb = b[`thumb_02_${k}`] && this.relPos(b[`thumb_02_${k}`]);
      const iK = b[`index_01_${k}`] && this.relPos(b[`index_01_${k}`]);
      const pK = b[`pinky_01_${k}`] && this.relPos(b[`pinky_01_${k}`]);
      if (!thumb || !iK || !pK) continue;
      const knuckle = new THREE.Vector3().subVectors(iK, pK).normalize();
      for (const f of FINGERS) {
        for (let seg = 1; seg <= 3; seg++) {
          const bone = b[`${f}_0${seg}_${k}`];
          if (!bone) continue;
          const child = b[`${f}_0${seg + 1}_${k}`] || bone.children.find((c) => c.isBone);
          this.bendBone(bone, child, knuckle, seg === 1 ? 1.25 : 1.35, thumb);
        }
      }
      const t2 = b[`thumb_02_${k}`];
      if (t2) this.bendBone(t2, b[`thumb_03_${k}`], knuckle, 0.6, iK);
    }
    this.model.traverse((o) => { if (o.isBone) this.rest.set(o, o.quaternion.clone()); });
  }

  // Rotate `bone` by `angle` about a root-space axis, in the direction that
  // brings its child toward `toward`.
  bendBone(bone, child, axis, angle, toward) {
    this.root.updateMatrixWorld(true);
    const p = this.relPos(bone);
    const tip = child ? this.relPos(child) : p.clone();
    let best = null;
    for (const sgn of [1, -1]) {
      const q = new THREE.Quaternion().setFromAxisAngle(axis, angle * sgn);
      const d = tip.clone().sub(p).applyQuaternion(q).add(p).distanceTo(toward);
      if (!best || d < best.d) best = { d, q };
    }
    this.rotateRel(bone, best.q);
  }

  // ---- Posing ------------------------------------------------------------------------
  // Turn `bone` so the direction from it to `fromPt` points at `toPt` (root space).
  aim(bone, fromPt, toPt) {
    const p = this.relPos(bone, _a);
    const d0 = _b.subVectors(fromPt, p).normalize();
    const d1 = _c.subVectors(toPt, p).normalize();
    this.rotateRel(bone, _q.setFromUnitVectors(d0, d1));
  }

  poseArms() {
    if (!this.ready) {
      for (const side of ['left', 'right']) this.arms[side].fist.position.copy(this.arms[side].target);
      return;
    }
    this.root.updateMatrixWorld(true);
    const k = this.body.scale.x;
    for (const side of ['left', 'right']) {
      const a = this.arms[side];
      const c = this.chain[side];
      for (const bone of [c.upper, c.lower, c.hand]) bone.quaternion.copy(this.rest.get(bone));
      c.upper.updateMatrixWorld(true);
      const S = this.relPos(c.upper, new THREE.Vector3());
      const E = this.relPos(c.lower, new THREE.Vector3());
      const H = this.relPos(c.hand, new THREE.Vector3());
      const l1 = S.distanceTo(E);
      const l2 = E.distanceTo(H);
      const T = _t.copy(a.target).multiplyScalar(k);
      const toT = _v.subVectors(T, S);
      let d = toT.length();
      const maxD = (l1 + l2) * 0.999;
      if (d > maxD) { toT.multiplyScalar(maxD / d); d = maxD; T.copy(S).add(toT); }
      d = Math.max(d, Math.abs(l1 - l2) + 0.01);
      const dir = toT.clone().normalize();
      // Elbow bends outward, down and back, like the procedural rig.
      // Powering up flares the elbows out and back instead.
      if (this.power > 0) _pole.set(a.s * 0.9, -0.2 * (1 - this.power) - 0.3, -0.7);
      else _pole.set(a.s * 0.6, -0.8, -0.4);
      _pole.normalize();
      const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
      const h = Math.sqrt(Math.max(l1 * l1 - x * x, 0));
      const perp = _pole.sub(dir.clone().multiplyScalar(_pole.dot(dir))).normalize();
      const elbow = _e.copy(S).addScaledVector(dir, x).addScaledVector(perp, h);
      this.aim(c.upper, E, elbow);
      this.aim(c.lower, this.relPos(c.hand, new THREE.Vector3()), T);
      // The fist marker sits on the knuckles (read for punches, glows, wounds).
      const hp = this.relPos(c.hand, new THREE.Vector3());
      const fwd = hp.clone().sub(this.relPos(c.lower, new THREE.Vector3())).normalize();
      a.fist.position.copy(hp.addScaledVector(fwd, 0.06)).divideScalar(k);
    }
    this.poseHead();
  }

  poseHead() {
    const head = this.bones?.head;
    if (!head) return;
    head.quaternion.copy(this.rest.get(head));
    head.updateMatrixWorld(true);
    this.rotateRel(head, this.head.quaternion);
  }

  setPose(leftLocal, rightLocal, headQuatLocal) {
    this.clearPowerUp();
    const k = 1 / this.body.scale.x;
    if (leftLocal) this.arms.left.target.copy(leftLocal).multiplyScalar(k);
    if (rightLocal) this.arms.right.target.copy(rightLocal).multiplyScalar(k);
    if (headQuatLocal) this.head.quaternion.copy(headQuatLocal);
    this.poseArms();
  }

  // Guard stance with breathing.
  restPose(t = 0) {
    this.clearPowerUp();
    const breathe = Math.sin(t * 2) * 0.012;
    const a = this.arms;
    a.left.target.set(0.2, 1.36 + breathe, 0.36);
    a.right.target.set(-0.17, 1.3 + breathe, 0.4);
    this.head.quaternion.identity();
    this.poseArms();
  }

  // ---- Look --------------------------------------------------------------------------
  // Dragon Ball power-up: knees bent, chest out, fists clenched low at the
  // hips with the elbows flared, head thrown back yelling, whole body shaking.
  // k: 0..1 intensity (call every frame while powering up).
  powerUpPose(t, k = 1) {
    this.power = Math.max(0.001, k);
    if (this.ready) this.poseBody(t, k);
    const a = this.arms;
    const jx = Math.sin(t * 61) * 0.008 * k, jy = Math.cos(t * 47) * 0.008 * k;
    a.left.target.set(0.27 + jx, 0.98 + jy, 0.1);
    a.right.target.set(-0.27 - jx, 0.98 - jy, 0.1);
    this.head.quaternion.setFromAxisAngle(_X, -0.2 * k);
    this.poseArms();
  }

  poseBody(t, k) {
    const b = this.bones;
    for (const n of POWER_BONES) if (b[n]) b[n].quaternion.copy(this.rest.get(b[n]));
    this.model.updateMatrixWorld(true);
    // Chest out and back.
    if (b.spine_02) this.rotateRel(b.spine_02, _pq.setFromAxisAngle(_X, -0.14 * k));
    // Knees bend into a wide horse stance; feet stay flat.
    for (const s of ['l', 'r']) {
      const sgn = s === 'l' ? 1 : -1;
      if (b[`thigh_${s}`]) this.rotateRel(b[`thigh_${s}`], _pq.setFromEuler(_eu.set(-0.42 * k, 0, 0.1 * k * sgn)));
      if (b[`calf_${s}`]) this.rotateRel(b[`calf_${s}`], _pq.setFromAxisAngle(_X, 0.8 * k));
      if (b[`foot_${s}`]) this.rotateRel(b[`foot_${s}`], _pq.setFromEuler(_eu.set(-0.38 * k, 0, -0.1 * k * sgn)));
    }
    // Drop the body so the feet stay on the ground, and shake.
    const sc = this.body.scale.x;
    this.body.position.set(Math.sin(t * 73) * 0.006 * k, -0.07 * k * sc + Math.abs(Math.sin(t * 37)) * 0.004 * k, Math.cos(t * 59) * 0.005 * k);
  }

  // Fighting stance that shows health. hp 0..1: fresh fighters stand tall,
  // chest out, chin up; badly hurt ones hunch over the gut on bent, shaky
  // knees with the head hanging. Call before poseArms (the arms follow the
  // bent spine). Cleared by clearPowerUp.
  stance(hp, t = 0) {
    if (!this.ready) return;
    const b = this.bones;
    for (const n of POWER_BONES) if (b[n]) b[n].quaternion.copy(this.rest.get(b[n]));
    this.model.updateMatrixWorld(true);
    const hurt = 1 - Math.max(0, Math.min(1, hp));
    const proud = Math.max(0, hp - 0.7) / 0.3;
    const sway = Math.sin(t * 2.3) * 0.05 * hurt * hurt;
    const lean = Math.pow(hurt, 1.2) * 0.62 - proud * 0.16 + Math.sin(t * 3.1) * 0.03 * hurt;
    if (b.spine_02) this.rotateRel(b.spine_02, _pq.setFromEuler(_eu.set(lean, sway, sway * 0.8)));
    const knee = 0.12 + 0.4 * hurt;
    for (const s of ['l', 'r']) {
      const sgn = s === 'l' ? 1 : -1;
      const wob = Math.sin(t * 7 + sgn) * 0.04 * hurt * hurt;
      if (b[`thigh_${s}`]) this.rotateRel(b[`thigh_${s}`], _pq.setFromEuler(_eu.set(-knee * 0.55 + wob, 0, 0.04 * sgn)));
      if (b[`calf_${s}`]) this.rotateRel(b[`calf_${s}`], _pq.setFromAxisAngle(_X, knee));
      if (b[`foot_${s}`]) this.rotateRel(b[`foot_${s}`], _pq.setFromEuler(_eu.set(-knee * 0.45, 0, -0.04 * sgn)));
    }
    this.body.position.set(0, -(0.008 + 0.05 * hurt) * this.body.scale.x, 0);
    this.stanced = true;
  }

  clearPowerUp() {
    if (this.stanced) {
      this.stanced = false;
      this.body.position.set(0, 0, 0);
      if (this.ready) for (const n of POWER_BONES) if (this.bones[n]) this.bones[n].quaternion.copy(this.rest.get(this.bones[n]));
    }
    if (!this.power) return;
    this.power = 0;
    this.body.position.set(0, 0, 0);
    if (!this.ready) return;
    for (const n of POWER_BONES) if (this.bones[n]) this.bones[n].quaternion.copy(this.rest.get(this.bones[n]));
  }

  apply(character) {
    this.character = { ...character };
    const c = this.character;
    // The model's own height, nudged by the build preset relative to the template's.
    const model = MODELS[this.modelId];
    const t = CHARACTER_TEMPLATES.find((x) => x.id === this.modelId);
    const base = BUILDS.find((b) => b.id === t?.appearance.build)?.height ?? 1;
    const nudge = THREE.MathUtils.clamp(buildOf(c).height / base, 0.9, 1.1);
    this.body.scale.setScalar((model.height / BUILT_HEIGHT) * nudge);
    if (!this.ready) return;
    const set = (name, hex) => this.mats[name]?.color.setHex(hex);
    set('Skin', SKIN_TONES[c.skin % SKIN_TONES.length].color);
    for (const [mat, slot] of Object.entries(MODELS[this.modelId].colors)) set(mat, paletteColor(c[slot]));
    set('EyeWhite', 0xf4f1ea);
    set('Pupil', 0x05070c);
    set('Highlight', 0xffffff);
    set('Brow', 0x0d0b0a);
    set('Lash', 0x0d0b0a);
    this.updateScouter();
    this.setForm(this.formId);
  }

  // Scouter on the head bone, fitted to where this model's eyes are.
  updateScouter() {
    const sc = scouterOf(this.character);
    if ((sc?.id || '') === this.scouterId) return;
    this.scouterId = sc?.id || '';
    if (this.scouter) { this.scouter.parent?.remove(this.scouter); this.scouter = null; }
    const head = this.bones?.head;
    const eyes = this.parts.EyeWhite;
    if (!sc || !head || !eyes?.length) return;
    // Measure the eyes in the rest pose, in avatar space.
    const saved = [];
    this.model.traverse((o) => { if (o.isBone) { saved.push([o, o.quaternion.clone()]); o.quaternion.copy(this.rest.get(o)); } });
    this.root.updateMatrixWorld(true);
    const box = new THREE.Box3();
    for (const m of eyes) { m.boundingBox = null; box.expandByObject(m); }
    box.applyMatrix4(_m.copy(this.root.matrixWorld).invert());
    const c = box.getCenter(new THREE.Vector3());
    const k = (box.max.x - box.min.x) / 0.14; // eye span relative to an average head
    const g = buildScouter(sc.color, new THREE.Vector3(c.x + 0.043 * k, c.y, c.z), new THREE.Vector3(c.x + 0.105 * k, c.y - 0.01 * k, c.z - 0.115 * k), k);
    g.traverse((o) => { o.userData.noWounds = true; });
    this.root.add(g);
    head.attach(g);
    for (const [o, q] of saved) o.quaternion.copy(q);
    this.root.updateMatrixWorld(true);
    this.scouter = g;
  }

  setForm(formId) {
    this.formId = formId;
    if (!this.ready) return;
    const f = FORMS[formId] || FORMS.base;
    const c = this.character;
    const hairPart = FORM_HAIR[formId] || 'Hair';
    for (const p of HAIR_PARTS) for (const m of this.parts[p] || []) {
      m.visible = p === hairPart;
      if (m.userData.outline) m.userData.outline.visible = m.visible;
    }
    for (const m of this.parts.Fur || []) {
      m.visible = !!f.body?.fur;
      if (m.userData.outline) m.userData.outline.visible = m.visible;
    }
    // Super Saiyan 3 has no eyebrows.
    for (const m of this.parts.Brow || []) m.visible = formId !== 'ssj3';
    const hairColor = f.hair.colorOverride ?? HAIR_COLORS[c.hairColor % HAIR_COLORS.length].color;
    const glowing = !!f.hair.colorOverride && !f.body?.fur;
    for (const p of HAIR_PARTS) {
      const m = this.mats[p];
      if (!m) continue;
      m.color.setHex(hairColor);
      m.emissive.setHex(glowing ? hairColor : 0x000000);
      m.emissiveIntensity = glowing ? 0.35 : 0;
    }
    if (f.body?.fur) this.mats.Fur?.color.setHex(f.body.fur);
    this.mats.Iris?.color.setHex(f.eyes ?? EYE_COLORS[c.eyeColor % EYE_COLORS.length].color);
  }

  dispose() {
    this.disposed = true;
    // Geometry is shared with the cached GLB; only the per-avatar materials go.
    for (const m of Object.values(this.mats)) m.dispose();
  }
}
