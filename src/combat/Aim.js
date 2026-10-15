import * as THREE from 'three';
import { terrainHeight } from '../world/Arena.js';

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Vector3();
const MAX_RANGE = 90;
const LOCK_ANGLE = 0.07; // radians off-centre that still counts as "on" a target

function ringTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.strokeStyle = '#ffffff';
  g.lineWidth = 5;
  g.beginPath(); g.arc(32, 32, 24, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#ffffff';
  g.beginPath(); g.arc(32, 32, 4, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Aiming. Each hand's aim ray (VR controller, or the desktop crosshair) is
// cast into the world: if it passes over an enemy, it locks on and every
// blast and beam from that hand flies to the enemy's centre; otherwise it
// goes to whatever the ray hits (the ground, or far ahead). In VR a little
// ring sits where each hand is aiming (red when locked on); on desktop the
// crosshair turns red.
export class Aim {
  constructor(game) {
    this.game = game;
    const tex = ringTexture();
    this.rings = {};
    for (const h of ['left', 'right']) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xffffff, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false }));
      s.renderOrder = 30;
      s.visible = false;
      game.renderer.scene.add(s);
      this.rings[h] = s;
    }
    this.locked = { left: null, right: null };
    this.crosshair = document.getElementById('crosshair');
  }

  update(input, xr, active) {
    const g = this.game;
    const cam = g.renderer.camera;
    for (const h of ['left', 'right']) {
      const hs = input.hands[h];
      const ring = this.rings[h];
      // Ray: the controller in VR; the camera through the crosshair on desktop.
      if (xr) { _o.copy(hs.aimOrigin); _d.copy(hs.aimDir).normalize(); } else {
        cam.getWorldPosition(_o);
        cam.getWorldDirection(_d);
      }
      const hit = active ? this.cast(_o, _d) : null;
      this.locked[h] = hit?.target || null;
      if (hit) {
        // Fire from the hand at exactly the point under the reticle.
        hs.aimDir.subVectors(hit.point, hs.aimOrigin).normalize();
      }
      ring.visible = !!(xr && active && hit && hs.aimOrigin.lengthSq() > 0);
      if (ring.visible) {
        const dist = _p.copy(hit.point).sub(_o).length();
        // Sit just in front of whatever it's on, same apparent size at any range.
        ring.position.copy(_o).addScaledVector(_d, Math.max(0.3, dist - 0.3));
        if (hit.target) ring.position.copy(hit.point).addScaledVector(_d, -0.45);
        const size = (hit.target ? 0.032 : 0.022) * (h === 'right' ? 1 : 0.8) * Math.max(0.3, dist - 0.3);
        ring.scale.setScalar(size);
        ring.material.color.setHex(hit.target ? 0xff3a2a : 0xffffff);
      }
    }
    if (this.crosshair) this.crosshair.classList.toggle('locked', !xr && !!this.locked.right);
  }

  // First thing along the ray: an enemy (with a little forgiveness so a
  // near miss still locks on), else the ground, else a point far ahead.
  cast(o, d) {
    let best = null;
    let bestT = MAX_RANGE;
    for (const t of this.game.combat.targets) {
      if (t.team !== 'enemy' || (t.active && !t.active())) continue;
      const s = t.sphere();
      _c.subVectors(s.center, o);
      const along = _c.dot(d);
      if (along <= 0.3 || along > bestT) continue;
      const off = Math.sqrt(Math.max(0, _c.lengthSq() - along * along));
      if (off < s.radius + along * LOCK_ANGLE) { bestT = along; best = { target: t, point: s.center.clone() }; }
    }
    if (best) return best;
    // March to the ground.
    let prev = 0;
    for (let t = 1; t <= MAX_RANGE; t += t < 20 ? 1 : 3) {
      _p.copy(o).addScaledVector(d, t);
      if (_p.y < terrainHeight(_p.x, _p.z)) {
        // Refine between the last two steps.
        let a = prev, b = t;
        for (let i = 0; i < 6; i++) {
          const m = (a + b) / 2;
          _p.copy(o).addScaledVector(d, m);
          if (_p.y < terrainHeight(_p.x, _p.z)) b = m; else a = m;
        }
        return { target: null, point: o.clone().addScaledVector(d, b) };
      }
      prev = t;
    }
    return { target: null, point: o.clone().addScaledVector(d, 40) };
  }
}
