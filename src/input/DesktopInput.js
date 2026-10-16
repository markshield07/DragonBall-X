import * as THREE from 'three';
import { makeEmptyState } from './XRInput.js';

// Keyboard + mouse. Produces the same hand/button state shape as XRInput so
// every gameplay system is shared between desktop and VR. Virtual hands are
// animated (jab, guard, power-up pose) and fed through the same
// velocity-based punch detector the VR controllers use.
const REST = {
  left: new THREE.Vector3(-0.2, -0.24, -0.38),
  right: new THREE.Vector3(0.2, -0.24, -0.38),
};
const GUARD = {
  left: new THREE.Vector3(-0.13, -0.12, -0.45),
  right: new THREE.Vector3(0.13, -0.12, -0.45),
};
const POWER = {
  left: new THREE.Vector3(-0.32, -0.42, -0.25),
  right: new THREE.Vector3(0.32, -0.42, -0.25),
};
const AIM = new THREE.Vector3(0.12, -0.14, -0.52);
// Guard pose: fists turned up so the forearms stand vertical in front of the face.
const GUARD_ROT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 1.2);
const NO_ROT = new THREE.Quaternion();

export class DesktopInput {
  constructor(canvas, camera) {
    this.canvas = canvas;
    this.camera = camera;
    this.keys = new Set();
    this.keysDown = new Set();
    this.mouse = { left: false, right: false, leftDown: false, rightDown: false, x: 0, y: 0, dx: 0, dy: 0 };
    this.yaw = 0;
    this.pitch = 0;
    this.locked = false;
    this.pointerEnabled = true; // false while a menu wants the cursor
    this.state = makeEmptyState();
    this.punch = { left: 0, right: 0 }; // punch animation timers
    this.nextPunchHand = 'right';
    this.handOffset = { left: REST.left.clone(), right: REST.right.clone() };
    this.handRot = { left: new THREE.Quaternion(), right: new THREE.Quaternion() };
    this.sensitivity = 0.0022;
    this.lookSpeed = 1; // from settings (mouse sensitivity)
    this.enabled = false;
    // On-screen buttons (Fly / Slow-Mo) press these for one frame.
    this.virtual = { fly: false, slowmo: false };

    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (['Tab', 'Space'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.keysDown.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.left = this.mouse.right = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (!this.locked && this.pointerEnabled) return; // menus handle clicks
      if (!this.locked) { this.requestLock(); return; }
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftDown = true; }
      if (e.button === 2) { this.mouse.right = true; this.mouse.rightDown = true; }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      this.mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      if (this.locked) {
        this.yaw -= e.movementX * this.sensitivity * this.lookSpeed;
        this.pitch -= e.movementY * this.sensitivity * this.lookSpeed;
        this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      this.mouse.left = this.mouse.right = false;
    });
  }

  requestLock() {
    if (!this.enabled || this.pointerEnabled) return;
    try { this.canvas.requestPointerLock()?.catch?.(() => {}); } catch { /* ignore */ }
  }

  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  // Menus open -> free cursor; gameplay -> mouse look.
  setPointerMode(enabled) {
    this.pointerEnabled = enabled;
    if (enabled) this.releaseLock();
  }

  pressed(code) { return this.keys.has(code); }
  down(code) { return this.keysDown.has(code); }

  update(dt, { powerUp = false, block = false, aiming = false } = {}) {
    const s = this.state;
    // Camera look
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.updateMatrix();
    const gameplay = !this.pointerEnabled;

    // Punch triggers (alternating hands)
    if (gameplay && this.mouse.leftDown) {
      const h = this.nextPunchHand;
      if (this.punch[h] <= 0) {
        this.punch[h] = 0.3;
        this.nextPunchHand = h === 'right' ? 'left' : 'right';
      }
    }

    for (const h of ['left', 'right']) {
      const hs = s.hands[h];
      hs.tracked = true;
      let target;
      if (this.punch[h] > 0) {
        this.punch[h] -= dt;
        const t = 0.3 - this.punch[h];
        // extend 0.1 s, hold 0.06 s (so low frame rates still sample full reach), retract
        const ext = t < 0.1 ? t / 0.1 : t < 0.16 ? 1 : Math.max(0, 1 - (t - 0.16) / 0.14);
        const reach = new THREE.Vector3(h === 'left' ? -0.04 : 0.04, -0.05, -0.85);
        target = REST[h].clone().lerp(reach, ext);
      } else if (block) target = GUARD[h];
      else if (powerUp) target = POWER[h].clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.01, (Math.random() - 0.5) * 0.01, 0));
      else if (aiming && h === 'right') target = AIM;
      else target = REST[h];
      // Punches snap (velocity must be real), other poses ease.
      if (this.punch[h] > 0) this.handOffset[h].copy(target);
      else this.handOffset[h].lerp(target, Math.min(1, dt * 14));
      // Hand position in rig-local space = camera local transform * offset
      hs.localPos.copy(this.handOffset[h]).applyQuaternion(this.camera.quaternion).add(this.camera.position);
      this.handRot[h].slerp(block && this.punch[h] <= 0 ? GUARD_ROT : NO_ROT, Math.min(1, dt * 14));
      hs.localQuat.copy(this.camera.quaternion).multiply(this.handRot[h]);
      // Aim from the hand toward the crosshair (20 m ahead).
      this.camera.updateMatrixWorld();
      const camWorld = this.camera.getWorldPosition(new THREE.Vector3());
      const fwd = this.camera.getWorldDirection(new THREE.Vector3());
      const aimPoint = camWorld.clone().addScaledVector(fwd, 20);
      hs.aimOrigin.copy(hs.localPos);
      if (this.camera.parent) this.camera.parent.localToWorld(hs.aimOrigin);
      hs.aimDir.subVectors(aimPoint, hs.aimOrigin).normalize();
      hs.trigger = 0;
      hs.grip = 0;
      hs.primaryDown = hs.secondaryDown = false;
    }

    const R = s.hands.right;
    const L = s.hands.left;
    if (gameplay) {
      R.trigger = this.mouse.right ? 1 : 0;
      // Space = both grips (power up); Q = left grip (block)
      if (this.pressed('Space')) { R.grip = 1; L.grip = 1; }
      if (this.pressed('KeyQ')) L.grip = 1;
      R.primaryDown = this.down('KeyT');
      R.secondaryDown = this.down('KeyE');
      // F = slow motion (right stick click), G = fly (left stick click)
      R.stickPressDown = this.down('KeyF') || this.virtual.slowmo;
      L.stickPressDown = this.down('KeyG') || this.virtual.fly;
      s.viewToggle = this.down('KeyP');
    } else {
      s.viewToggle = false;
      R.stickPressDown = L.stickPressDown = false;
    }
    this.virtual.fly = this.virtual.slowmo = false;
    L.primaryDown = this.down('Tab') || this.down('KeyM'); // X = menu
    L.secondaryDown = this.down('KeyC'); // Y = comfort
    // Movement
    const mx = (this.pressed('KeyD') ? 1 : 0) - (this.pressed('KeyA') ? 1 : 0);
    const my = (this.pressed('KeyS') ? 1 : 0) - (this.pressed('KeyW') ? 1 : 0);
    L.stick.set(gameplay ? mx : 0, gameplay ? my : 0);
    // Flying: R rises, V descends (right stick up / down in VR).
    const rise = (this.pressed('KeyR') ? 1 : 0) - (this.pressed('KeyV') ? 1 : 0);
    R.stick.set(0, gameplay ? -rise : 0);
    s.escape = this.down('Escape');
    // Story scenes: Enter / Space go on to the next line.
    s.advance = this.down('Enter') || this.down('NumpadEnter') || this.down('Space');

    this.keysDown.clear();
    this.mouse.leftDown = this.mouse.rightDown = false;
    return s;
  }
}
