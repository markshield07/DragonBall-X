import * as THREE from 'three';
import { toonUnique, addOutline, glowMaterial, softCircleTexture } from '../render/toon.js';
import { SKIN_TONES, paletteColor, buildOf } from '../character/options.js';
import { damp } from '../core/math.js';

const _v = new THREE.Vector3();

// First-person virtual hands and forearms. Follows tracked controllers in VR
// and animated virtual hands on desktop. Tracks per-hand velocity (in rig
// space, so locomotion doesn't count as punching) and owns the hand glow
// that grows with charge level, ki level and transformation.
export class Hands {
  constructor(rig) {
    this.rig = rig;
    this.skinMat = toonUnique(0xf6c9a0);
    this.bandMat = toonUnique(0x1f3fa8);
    this.sleeveMat = toonUnique(0xff7a1a);
    this.gloveMat = toonUnique(0x17171d);
    this.cuffMat = toonUnique(0xb81d2a);
    this.hands = {};
    for (const side of ['left', 'right']) {
      const g = new THREE.Group();
      g.name = `hand-${side}`;
      const s = side === 'left' ? -1 : 1;
      // Fist
      const fist = new THREE.Mesh(roundedBox(0.092, 0.086, 0.106), this.skinMat);
      fist.position.set(0, 0, -0.01);
      addOutline(fist, 0.06);
      // Knuckle ridge
      const knuckles = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.06, 2, 6), this.skinMat);
      knuckles.rotation.z = Math.PI / 2;
      knuckles.position.set(0, 0.01, -0.06);
      // Hand wrap across the palm and knuckles (Rokan's fighting wraps)
      const handWrap = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.032, 12), this.bandMat);
      handWrap.rotation.x = Math.PI / 2;
      handWrap.scale.set(1.0, 1, 0.95);
      handWrap.position.set(0, -0.002, -0.022);
      // Thumb
      const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.04, 2, 6), this.skinMat);
      thumb.position.set(-0.04 * s, -0.015, -0.035);
      thumb.rotation.set(Math.PI / 2, 0, 0.6 * s);
      // Forearm: extends back (+Z) and slightly down from the grip.
      const arm = new THREE.Group();
      const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.24, 3, 8), this.skinMat);
      forearm.rotation.x = Math.PI / 2;
      forearm.position.z = 0.17;
      addOutline(forearm, 0.06);
      // Wrist wraps: two stacked bands
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.049, 0.047, 0.075, 12), this.bandMat);
      band.rotation.x = Math.PI / 2;
      band.position.z = 0.07;
      const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.12, 12, 1, true), this.sleeveMat);
      sleeve.rotation.x = Math.PI / 2;
      sleeve.position.z = 0.33;
      arm.add(forearm, band, sleeve);
      arm.rotation.x = -0.32; // forearm angles down toward the elbow
      g.add(fist, knuckles, handWrap, thumb, arm);

      // Ki glow around the fist
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softCircleTexture(), color: 0x9fdcff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
      glow.scale.setScalar(0.3);
      glow.position.z = -0.02;
      glow.renderOrder = 6;
      g.add(glow);
      const shell = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), glowMaterial(0x9fdcff, 0));
      shell.position.z = -0.02;
      g.add(shell);
      // Forearm energy sheath (shows transformation state on the arms)
      const sheath = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.08, 0.36, 10, 1, true), glowMaterial(0xffd23a, 0));
      sheath.rotation.x = Math.PI / 2;
      sheath.position.z = 0.17;
      arm.add(sheath);

      rig.add(g);
      this.hands[side] = {
        side, group: g, glow, shell, sheath, arm, sleeve, fist, handWrap, band,
        prevLocal: new THREE.Vector3(), localPos: new THREE.Vector3(), vel: new THREE.Vector3(), velLocal: new THREE.Vector3(),
        worldPos: new THREE.Vector3(), speed: 0, first: true, glowLevel: 0, swingArmed: true,
        color: new THREE.Color(0x9fdcff),
      };
    }
  }

  applyCharacter(character) {
    this.skinMat.color.setHex(SKIN_TONES[character.skin % SKIN_TONES.length].color);
    this.bandMat.color.setHex(paletteColor(character.gloveColor));
    this.gloveMat.color.setHex(paletteColor(character.gloveColor));
    this.cuffMat.color.setHex(paletteColor(character.armorColor));
    // Primal gi: fingerless gloves (glove over the back of the fist, bare
    // knuckles and thumb) with a colored wrist cuff.
    const gloved = character.outfit === 'primal';
    this.sleeveMat.color.setHex(paletteColor(character.armorColor));
    // Titan armor and the tank top leave the forearms bare; the build
    // preset thickens or slims the first-person forearms and fists.
    const sleeve = character.outfit === 'gi' || character.outfit === 'jacket';
    const k = buildOf(character).limb * (character.body === 'female' ? 0.9 : 1);
    for (const h of Object.values(this.hands)) {
      h.sleeve.visible = sleeve;
      h.fist.material = gloved ? this.gloveMat : this.skinMat;
      h.handWrap.visible = !gloved;
      h.band.material = gloved ? this.cuffMat : this.bandMat;
      h.arm.scale.set(k, k, 1);
      h.fist.scale.setScalar(0.92 + 0.08 * k);
    }
  }

  setVisible(v) {
    for (const h of Object.values(this.hands)) h.group.visible = v;
  }

  // Follow input; compute velocity. Returns nothing; read this.hands.
  update(dt, inputState, rigQuat) {
    for (const side of ['left', 'right']) {
      const h = this.hands[side];
      const hs = inputState.hands[side];
      h.group.visible = hs.tracked;
      if (!hs.tracked) { h.first = true; continue; }
      h.group.position.copy(hs.localPos);
      h.group.quaternion.copy(hs.localQuat);
      h.localPos.copy(hs.localPos);
      if (h.first) { h.prevLocal.copy(h.localPos); h.first = false; }
      const inst = _v.subVectors(h.localPos, h.prevLocal).divideScalar(Math.max(dt, 1e-3));
      // Light smoothing to reject tracking jitter but keep punch peaks.
      h.velLocal.lerp(inst, Math.min(1, dt * 30));
      h.prevLocal.copy(h.localPos);
      h.vel.copy(h.velLocal).applyQuaternion(rigQuat);
      h.speed = h.velLocal.length();
      h.group.getWorldPosition(h.worldPos);
    }
  }

  // level 0..1+ ; color hex; drives glow sprite, shell and forearm sheath.
  setGlow(side, level, color, sheathLevel = 0, sheathColor = null, dt = 0.016) {
    const h = this.hands[side];
    h.glowLevel = damp(h.glowLevel, level, 10, dt);
    h.color.setHex(color);
    const L = h.glowLevel;
    h.glow.material.color.copy(h.color);
    h.glow.material.opacity = Math.min(0.7, L * 0.6);
    h.glow.scale.setScalar(0.1 + L * 0.17 + Math.sin(performance.now() * 0.03) * 0.01 * L);
    h.shell.material.color.copy(h.color);
    h.shell.material.opacity = Math.min(0.35, L * 0.25);
    h.shell.scale.setScalar(0.7 + L * 0.45);
    h.sheath.material.opacity = Math.min(0.55, sheathLevel * 0.45);
    if (sheathColor !== null) h.sheath.material.color.setHex(sheathColor);
  }
}

function roundedBox(w, h, d) {
  // Sphere squashed into a soft box shape: cheap "fist" silhouette.
  const g = new THREE.SphereGeometry(0.5, 12, 10);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i); let y = p.getY(i); let z = p.getZ(i);
    const k = 1.35;
    x = Math.sign(x) * Math.pow(Math.abs(x) * 2, 1 / k) / 2;
    y = Math.sign(y) * Math.pow(Math.abs(y) * 2, 1 / k) / 2;
    z = Math.sign(z) * Math.pow(Math.abs(z) * 2, 1 / k) / 2;
    p.setXYZ(i, x * w, y * h, z * d);
  }
  g.computeVertexNormals();
  return g;
}
