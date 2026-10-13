import * as THREE from 'three';

// Reads Meta Quest (Touch) controllers through WebXR. Controllers are added
// to the player rig so their local positions are in tracking space, which
// makes punch-velocity detection immune to smooth locomotion and snap turns.
//
// xr-standard gamepad mapping (Quest Touch):
//   buttons[0] trigger, [1] grip/squeeze, [3] thumbstick press, [4] A/X, [5] B/Y
//   axes[2], axes[3] thumbstick x/y
export class XRInput {
  constructor(renderer, rig) {
    this.renderer = renderer;
    this.rig = rig;
    this.sources = { left: null, right: null };
    this.ray = { left: null, right: null }; // target-ray space (aiming)
    this.grip = { left: null, right: null }; // grip space (hand position)
    this.prevButtons = { left: [], right: [] };
    this.selectHeld = { left: false, right: false }; // hand-tracking pinch fallback
    this.state = makeEmptyState();

    for (let i = 0; i < 2; i++) {
      const ray = renderer.xr.getController(i);
      const grip = renderer.xr.getControllerGrip(i);
      rig.add(ray);
      rig.add(grip);
      ray.addEventListener('connected', (e) => {
        const h = e.data.handedness === 'left' ? 'left' : 'right';
        this.sources[h] = e.data;
        this.ray[h] = ray;
        this.grip[h] = grip;
        ray.userData.handedness = h;
        grip.userData.handedness = h;
      });
      ray.addEventListener('disconnected', () => {
        const h = ray.userData.handedness;
        if (h && this.ray[h] === ray) {
          this.sources[h] = null;
          this.ray[h] = null;
          this.grip[h] = null;
        }
      });
      ray.addEventListener('selectstart', () => { if (ray.userData.handedness) this.selectHeld[ray.userData.handedness] = true; });
      ray.addEventListener('selectend', () => { if (ray.userData.handedness) this.selectHeld[ray.userData.handedness] = false; });
    }
  }

  update() {
    const s = this.state;
    for (const h of ['left', 'right']) {
      const src = this.sources[h];
      const hs = s.hands[h];
      const grip = this.grip[h];
      const ray = this.ray[h];
      hs.tracked = !!(src && grip && (grip.visible || ray.visible));
      if (!src || !grip) {
        hs.trigger = hs.grip = 0;
        continue;
      }
      // Local (tracking-space) hand position. Grip space falls back to ray space.
      const g = grip.visible ? grip : ray;
      hs.localPos.setFromMatrixPosition(g.matrix);
      hs.localQuat.setFromRotationMatrix(g.matrix);
      ray.getWorldPosition(hs.aimOrigin);
      ray.getWorldDirection(hs.aimDir).negate(); // three's controller looks down -Z
      const gp = src.gamepad;
      const prev = this.prevButtons[h];
      if (gp) {
        const b = gp.buttons;
        const val = (i) => (b[i] ? b[i].value : 0);
        const pressed = (i) => !!(b[i] && b[i].pressed);
        hs.trigger = val(0);
        hs.grip = val(1);
        hs.primary = pressed(4);
        hs.secondary = pressed(5);
        hs.stickPress = pressed(3);
        hs.primaryDown = hs.primary && !prev[4];
        hs.secondaryDown = hs.secondary && !prev[5];
        hs.stickPressDown = hs.stickPress && !prev[3];
        hs.stick.set(gp.axes[2] || 0, gp.axes[3] || 0);
        for (let i = 0; i < b.length; i++) prev[i] = !!b[i]?.pressed;
        hs.gamepad = gp;
      } else {
        // Hand tracking: pinch acts as trigger.
        hs.trigger = this.selectHeld[h] ? 1 : 0;
        hs.grip = 0;
        hs.primaryDown = hs.secondaryDown = false;
        hs.stick.set(0, 0);
        hs.gamepad = null;
      }
    }
    return s;
  }

  pulse(hand, intensity, ms) {
    const gp = this.sources[hand]?.gamepad;
    if (!gp) return;
    const act = gp.hapticActuators?.[0];
    try {
      if (act?.pulse) act.pulse(Math.min(1, intensity), ms);
      else if (gp.vibrationActuator?.playEffect) {
        gp.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: Math.min(1, intensity), weakMagnitude: Math.min(1, intensity) });
      }
    } catch { /* haptics unsupported */ }
  }

  rayFor(hand) { return this.ray[hand]; }
}

export function makeHandState() {
  return {
    tracked: false,
    localPos: new THREE.Vector3(),
    localQuat: new THREE.Quaternion(),
    aimOrigin: new THREE.Vector3(),
    aimDir: new THREE.Vector3(0, 0, -1),
    trigger: 0,
    grip: 0,
    primary: false,
    secondary: false,
    primaryDown: false,
    secondaryDown: false,
    stickPress: false,
    stickPressDown: false,
    stick: new THREE.Vector2(),
    gamepad: null,
  };
}

export function makeEmptyState() {
  return { hands: { left: makeHandState(), right: makeHandState() } };
}
