import * as THREE from 'three';
import { toonUnique, addOutline } from '../render/toon.js';
import { buildHairGeometry, HEAD_RADIUS } from './hair.js';
import { SKIN_TONES, HAIR_COLORS, EYE_COLORS, OUTFIT_COLORS } from './options.js';
import { FORMS } from '../progression/forms.js';

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const tmpTarget = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// Procedural stylized Saiyan body. Used for the character creator preview
// and for the training-room mirror. Faces +Z, feet at y = 0.
export class Avatar {
  constructor(character) {
    this.root = new THREE.Group();
    this.root.name = 'avatar';
    this.character = { ...character };
    this.formId = 'base';
    this.mats = {
      skin: toonUnique(0xffffff),
      hair: toonUnique(0xffffff, { flat: true }),
      primary: toonUnique(0xffffff),
      secondary: toonUnique(0xffffff),
      belt: toonUnique(0x1f3fa8),
      boots: toonUnique(0x2a2a3a),
      fur: toonUnique(0xb3202a, { flat: true }),
      armor: toonUnique(0xf0f0f0),
      eyeWhite: new THREE.MeshBasicMaterial({ color: 0xffffff }),
      iris: new THREE.MeshBasicMaterial({ color: 0x111111 }),
      pupil: new THREE.MeshBasicMaterial({ color: 0x000000 }),
      brow: new THREE.MeshBasicMaterial({ color: 0x111111 }),
    };
    this.build();
    this.apply(character);
  }

  build() {
    const m = this.mats;
    const root = this.root;
    this.body = new THREE.Group();
    root.add(this.body);

    // Legs
    this.legs = [];
    for (const s of [-1, 1]) {
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.36, 4, 8), m.secondary);
      thigh.position.set(0.1 * s, 0.7, 0);
      const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.34, 4, 8), m.secondary);
      shin.position.set(0.1 * s, 0.32, 0.01);
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.13, 0.24), m.boots);
      boot.position.set(0.1 * s, 0.07, 0.04);
      [thigh, shin, boot].forEach((p) => { p.castShadow = true; this.body.add(p); addOutline(p, 0.05); });
      this.legs.push({ thigh, shin, boot });
    }

    // Torso: hips + chest
    this.hips = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.08, 4, 10), m.secondary);
    this.hips.position.set(0, 0.95, 0);
    this.hips.scale.set(1.15, 1, 0.8);
    this.chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.22, 4, 12), m.primary);
    this.chest.position.set(0, 1.22, 0);
    this.chest.scale.set(1.25, 1, 0.75);
    this.belt = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.025, 6, 16), m.belt);
    this.belt.rotation.x = Math.PI / 2;
    this.belt.position.y = 1.02;
    this.belt.scale.set(1.2, 0.85, 1);
    this.neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 8), m.skin);
    this.neck.position.y = 1.47;
    [this.hips, this.chest, this.belt, this.neck].forEach((p) => { p.castShadow = true; this.body.add(p); });
    addOutline(this.chest, 0.04);
    addOutline(this.hips, 0.04);

    // Female chest shape (shown for the female preset)
    this.bust = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), m.primary);
    this.bust.scale.set(2.1, 0.9, 0.9);
    this.bust.position.set(0, 1.27, 0.08);
    this.body.add(this.bust);

    // Armor pieces (armor outfit)
    this.armorPlate = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.2, 4, 12), m.armor);
    this.armorPlate.scale.set(1.32, 1, 0.82);
    this.armorPlate.position.set(0, 1.24, 0);
    this.body.add(this.armorPlate);
    this.shoulderPads = [];
    for (const s of [-1, 1]) {
      const pad = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), m.armor);
      pad.position.set(0.25 * s, 1.37, 0);
      pad.scale.set(1.2, 0.8, 1.1);
      this.body.add(pad);
      this.shoulderPads.push(pad);
    }
    // Jacket collar (jacket outfit)
    this.collar = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.03, 6, 14), m.primary);
    this.collar.rotation.x = Math.PI / 2;
    this.collar.position.y = 1.43;
    this.body.add(this.collar);
    // Undershirt V (gi outfit)
    this.undershirt = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.16, 3), m.secondary);
    this.undershirt.rotation.x = Math.PI;
    this.undershirt.position.set(0, 1.36, 0.115);
    this.undershirt.scale.z = 0.3;
    this.body.add(this.undershirt);

    // Fur (SSJ4)
    this.fur = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.24, 4, 10), m.fur);
    this.fur.scale.set(1.3, 1, 0.8);
    this.fur.position.set(0, 1.22, -0.01);
    this.fur.visible = false;
    this.body.add(this.fur);

    // Tail (SSJ4)
    const tailCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.95, -0.12), new THREE.Vector3(0, 0.75, -0.3), new THREE.Vector3(0.15, 0.6, -0.4),
      new THREE.Vector3(0.3, 0.75, -0.42), new THREE.Vector3(0.32, 0.95, -0.3),
    ]);
    this.tail = new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 16, 0.035, 6, false), m.fur);
    this.tail.visible = false;
    this.body.add(this.tail);

    // Head
    this.head = new THREE.Group();
    this.head.position.set(0, 1.62, 0);
    this.body.add(this.head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(HEAD_RADIUS, 16, 12), m.skin);
    skull.scale.set(0.95, 1.05, 1);
    skull.castShadow = true;
    this.head.add(skull);
    addOutline(skull, 0.05);
    const jaw = new THREE.Mesh(new THREE.SphereGeometry(HEAD_RADIUS * 0.75, 12, 8), m.skin);
    jaw.position.set(0, -0.055, 0.025);
    jaw.scale.set(0.95, 0.9, 1);
    this.head.add(jaw);
    // Anime eyes
    this.eyes = [];
    for (const s of [-1, 1]) {
      const white = new THREE.Mesh(new THREE.CircleGeometry(0.027, 14), m.eyeWhite);
      white.scale.set(0.95, 1.25, 1);
      white.position.set(0.043 * s, 0.005, HEAD_RADIUS * 0.97);
      const iris = new THREE.Mesh(new THREE.CircleGeometry(0.017, 12), m.iris);
      iris.position.set(0.004 * -s, -0.002, 0.002);
      const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.008, 10), m.pupil);
      pupil.position.z = 0.001;
      iris.add(pupil);
      white.add(iris);
      const brow = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.009), m.brow);
      brow.position.set(0.044 * s, 0.045, HEAD_RADIUS * 0.96);
      brow.rotation.z = -0.25 * s;
      this.head.add(white, brow);
      this.eyes.push(white);
    }
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.01, 0.025, 4), m.skin);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, -0.025, HEAD_RADIUS * 1.0);
    this.head.add(nose);
    this.mouth = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 0.006), m.brow);
    this.mouth.position.set(0, -0.07, HEAD_RADIUS * 0.9);
    this.head.add(this.mouth);

    this.hairMesh = new THREE.Mesh(new THREE.BufferGeometry(), m.hair);
    this.hairMesh.castShadow = true;
    this.head.add(this.hairMesh);
    this.hairOutline = addOutline(this.hairMesh, 0.03);

    // Arms (2-bone, posed with simple IK so the mirror copies the player's hands)
    this.arms = {};
    for (const side of ['left', 'right']) {
      const s = side === 'left' ? 1 : -1; // avatar's left is +X
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.22, 4, 8), m.primary);
      const lower = new THREE.Mesh(new THREE.CapsuleGeometry(0.048, 0.2, 4, 8), m.skin);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.07, 10), m.belt);
      const fist = new THREE.Mesh(new THREE.SphereGeometry(0.058, 10, 8), m.skin);
      fist.scale.set(1, 0.9, 1.15);
      [upper, lower, fist].forEach((p) => { p.castShadow = true; this.body.add(p); addOutline(p, 0.05); });
      this.body.add(band);
      this.arms[side] = {
        s, upper, lower, band, fist,
        shoulder: new THREE.Vector3(0.24 * s, 1.36, 0),
        target: new THREE.Vector3(0.28 * s, 0.95, 0.12),
      };
    }
    this.poseArms();
  }

  // Place arm segments for shoulder -> hand target with a simple 2-bone IK.
  poseArms() {
    const lu = 0.3;
    const ll = 0.29;
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
      a.band.position.copy(elbow).lerp(tgt, 0.78);
      a.band.quaternion.copy(a.lower.quaternion);
      a.fist.position.copy(tgt);
      a.fist.quaternion.copy(a.lower.quaternion);
    }
  }

  placeSegment(mesh, from, to) {
    mesh.position.copy(from).add(to).multiplyScalar(0.5);
    const dir = tmpA.subVectors(to, from).normalize();
    mesh.quaternion.setFromUnitVectors(UP, dir);
  }

  // Set hand targets in avatar-local space and head look rotation.
  setPose(leftLocal, rightLocal, headQuatLocal) {
    if (leftLocal) this.arms.left.target.copy(leftLocal);
    if (rightLocal) this.arms.right.target.copy(rightLocal);
    if (headQuatLocal) this.head.quaternion.copy(headQuatLocal);
    this.poseArms();
  }

  restPose(t = 0) {
    const breathe = Math.sin(t * 2) * 0.01;
    this.arms.left.target.set(0.3, 0.95 + breathe, 0.1);
    this.arms.right.target.set(-0.3, 0.95 + breathe, 0.1);
    this.head.quaternion.identity();
    this.poseArms();
  }

  apply(character) {
    this.character = { ...character };
    const c = this.character;
    const female = c.body === 'female';
    this.mats.skin.color.setHex(SKIN_TONES[c.skin % SKIN_TONES.length].color);
    const oc = OUTFIT_COLORS[c.outfitColor % OUTFIT_COLORS.length];
    this.mats.primary.color.setHex(oc.primary);
    this.mats.secondary.color.setHex(oc.secondary);
    this.mats.belt.color.setHex(c.outfit === 'armor' ? 0xd8b23a : oc.secondary);
    this.mats.boots.color.setHex(c.outfit === 'armor' ? 0xf0f0f0 : 0x2a2a3a);

    // Body preset
    this.chest.scale.set(female ? 1.08 : 1.25, female ? 0.95 : 1, female ? 0.72 : 0.75);
    this.hips.scale.set(female ? 1.3 : 1.15, 1, 0.8);
    this.bust.visible = female && c.outfit !== 'armor';
    for (const side of ['left', 'right']) {
      const a = this.arms[side];
      a.shoulder.set((female ? 0.21 : 0.24) * a.s, female ? 1.34 : 1.36, 0);
    }
    this.root.scale.setScalar(female ? 0.96 : 1);

    // Outfit pieces
    const o = c.outfit;
    this.armorPlate.visible = o === 'armor';
    this.shoulderPads.forEach((p) => (p.visible = o === 'armor'));
    this.collar.visible = o === 'jacket';
    this.undershirt.visible = o === 'gi';
    const sleeveless = o === 'tank';
    for (const side of ['left', 'right']) {
      this.arms[side].upper.material = sleeveless ? this.mats.skin : (o === 'armor' ? this.mats.secondary : this.mats.primary);
    }
    if (o === 'armor') this.chest.material = this.mats.secondary;
    else this.chest.material = this.mats.primary;
    this.legs.forEach((l) => { l.thigh.material = this.mats.secondary; l.shin.material = this.mats.secondary; });
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
    this.mats.hair.emissive.setHex(f.hair.colorOverride && formId !== 'ssj4' ? hairColor : 0x000000);
    this.mats.hair.emissiveIntensity = f.hair.colorOverride ? 0.35 : 0;
    const eye = f.eyes ?? EYE_COLORS[c.eyeColor % EYE_COLORS.length].color;
    this.mats.iris.color.setHex(eye);
    const isFurForm = !!f.body?.fur;
    this.fur.visible = isFurForm;
    this.tail.visible = !!f.body?.tail;
    const muscle = f.body?.muscle || 1;
    this.chest.scale.x = (c.body === 'female' ? 1.08 : 1.25) * muscle;
    for (const side of ['left', 'right']) {
      const a = this.arms[side];
      a.upper.scale.setScalar(muscle);
      a.lower.scale.setScalar(muscle);
    }
    // Determined brows when transformed
    this.eyes.forEach((e) => (e.scale.y = formId === 'base' ? 1.25 : 0.95));
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.geometry && !o.userData.isOutline) o.geometry.dispose();
    });
  }
}
