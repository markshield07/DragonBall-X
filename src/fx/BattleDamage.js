import * as THREE from 'three';

// Battle damage: as a fighter's health drops, cuts, bruises and blood
// streaks appear on their body, and hits spray blood. Wounds are tiny flat
// decals stuck to the body's own meshes (so they move with arms and head),
// picked by sampling random surface points that face the viewer.
//
// Works on any model made of MeshToonMaterial meshes: bosses, the sparring
// partner, the mirror avatar and the first-person forearms.
// Respects the "Battle damage" setting (off = no blood or wounds).
const THRESHOLDS = [0.75, 0.55, 0.38, 0.22, 0.1];
const PER_STEP = [2, 2, 3, 3, 3];
const planeGeo = new THREE.PlaneGeometry(1, 1);
const MATS = {
  cut: new THREE.MeshBasicMaterial({ color: 0x5a0606, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide }),
  blood: new THREE.MeshBasicMaterial({ color: 0x9a0c10, polygonOffset: true, polygonOffsetFactor: -1, side: THREE.DoubleSide }),
  bruise: new THREE.MeshBasicMaterial({ color: 0x3a1430, transparent: true, opacity: 0.45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, side: THREE.DoubleSide }),
};
// Blood drop shape: wide at the top, tapering to a point.
const dripGeo = (() => {
  const s = new THREE.Shape();
  s.moveTo(-0.5, 0.5);
  s.quadraticCurveTo(0, 0.62, 0.5, 0.5);
  s.lineTo(0.12, -0.3);
  s.quadraticCurveTo(0, -0.5, -0.12, -0.3);
  s.lineTo(-0.5, 0.5);
  return new THREE.ShapeGeometry(s, 4);
})();
const bruiseGeo = new THREE.CircleGeometry(0.5, 12);

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _n = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _fwd = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);

export class BattleDamage {
  // root: model root. forward(): world direction the model faces (wounds favour it).
  constructor(root, game, { forward = null, scale = 1, minY = -Infinity } = {}) {
    this.root = root;
    this.game = game;
    this.forward = forward;
    this.scale = scale;
    this.minY = minY;
    this.decals = [];
    this.step = 0;
    this.dripTimer = 0;
  }

  get enabled() { return this.game.settings.battleDamage !== false; }

  reset() {
    for (const d of this.decals) d.parent?.remove(d);
    this.decals = [];
    this.step = 0;
  }

  // Call every frame with the health fraction (0..1).
  update(dt, frac) {
    if (!this.enabled) { if (this.decals.length) this.reset(); return; }
    // Heal: wounds clear once health is mostly back (training regen).
    if (frac > 0.92 && this.step > 0) this.reset();
    // The model was rebuilt (e.g. a transformation): re-apply the wounds.
    if (this.decals.length && !this.decals[0].parent?.parent) this.reset();
    while (this.step < THRESHOLDS.length && frac < THRESHOLDS[this.step]) {
      for (let i = 0; i < PER_STEP[this.step]; i++) this.addWound(this.step);
      this.step += 1;
    }
    // Occasional blood drips from a badly hurt fighter.
    if (frac < 0.25 && this.root.visible && this.decals.length) {
      this.dripTimer -= dt;
      if (this.dripTimer <= 0) {
        this.dripTimer = 0.5 + Math.random();
        const d = this.decals[Math.floor(Math.random() * this.decals.length)];
        if (d.parent) {
          d.getWorldPosition(_a);
          this.game.effects.burst(_a, 0x8a0a0e, 2, 0.4, 0.02 * this.scale, 0.6, { grav: 9, up: 0 });
        }
      }
    }
  }

  // Blood spray on a hit, heavier the lower the health.
  hit(point, dir, frac, power = 0.5) {
    if (!this.enabled || frac > 0.6) return;
    const n = Math.round((3 + 8 * power) * (1.2 - frac));
    this.game.effects.burst(point, 0x9a0c10, n, 1.5 + 2 * power, 0.025 * this.scale, 0.6, { grav: 9, up: 0.5 });
  }

  // ---- Wounds ----------------------------------------------------------------
  meshes() {
    const list = [];
    this.root.traverse((o) => {
      if (!o.isMesh || !o.material?.isMeshToonMaterial || o.userData.isOutline || o.userData.isDecal) return;
      let p = o;
      while (p) { if (!p.visible) return; p = p.parent; }
      list.push(o);
    });
    return list;
  }

  // Random point on the model's surface, weighted toward the front.
  sample() {
    const list = this.meshes();
    if (!list.length) return null;
    this.root.updateMatrixWorld(true);
    const fwd = this.forward ? _fwd.copy(this.forward()).normalize() : null;
    let best = null;
    let bestScore = -Infinity;
    for (let k = 0; k < 6; k++) {
      const mesh = list[Math.floor(Math.random() * list.length)];
      const pos = mesh.geometry.attributes.position;
      const idx = mesh.geometry.index;
      const tris = (idx ? idx.count : pos.count) / 3;
      const t = Math.floor(Math.random() * tris);
      const i0 = idx ? idx.getX(t * 3) : t * 3;
      const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
      _a.fromBufferAttribute(pos, i0).applyMatrix4(mesh.matrixWorld);
      _b.fromBufferAttribute(pos, i1).applyMatrix4(mesh.matrixWorld);
      _c.fromBufferAttribute(pos, i2).applyMatrix4(mesh.matrixWorld);
      const area = _x.subVectors(_b, _a).cross(_y.subVectors(_c, _a)).length();
      if (area < 1e-6) continue;
      _n.subVectors(_b, _a).cross(_y.subVectors(_c, _a)).normalize();
      if (mesh.matrixWorld.determinant() < 0) _n.negate(); // mirrored models flip winding
      const u = Math.random(); const v = Math.random() * (1 - u);
      const p = _a.clone().multiplyScalar(1 - u - v).addScaledVector(_b, u).addScaledVector(_c, v);
      if (p.y < this.minY) continue;
      const score = (fwd ? _n.dot(fwd) : 0) + Math.sqrt(area) * 2 + Math.random() * 0.3;
      if (score > bestScore) { bestScore = score; best = { mesh, point: p, normal: _n.clone() }; }
    }
    return best;
  }

  addWound(step) {
    const s = this.sample();
    if (!s) return;
    const kinds = step < 1 ? ['bruise', 'cut'] : ['cut', 'blood', 'cut', 'blood', 'bruise'];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    const k = this.scale;
    let mesh;
    if (kind === 'cut') {
      mesh = new THREE.Mesh(planeGeo, MATS.cut);
      mesh.scale.set(0.012 * k, (0.05 + Math.random() * 0.07) * k, 1);
    } else if (kind === 'blood') {
      mesh = new THREE.Mesh(dripGeo, MATS.blood);
      mesh.scale.set((0.025 + Math.random() * 0.02) * k, (0.06 + Math.random() * 0.08) * k, 1);
    } else {
      mesh = new THREE.Mesh(bruiseGeo, MATS.bruise);
      mesh.scale.setScalar((0.05 + Math.random() * 0.04) * k);
    }
    mesh.userData.isDecal = true;
    mesh.renderOrder = 2;
    mesh.raycast = () => {};
    // Orient: face along the surface normal; blood runs "down" the surface,
    // cuts get a random slash angle.
    const n = s.normal;
    _y.copy(DOWN).addScaledVector(n, -n.dot(DOWN)).negate();
    if (_y.lengthSq() < 1e-4) _y.set(1, 0, 0).addScaledVector(n, -n.x);
    _y.normalize();
    if (kind === 'cut') _y.applyAxisAngle(n, (Math.random() - 0.5) * 2.4);
    _x.crossVectors(_y, n).normalize();
    _m.makeBasis(_x, _y, n);
    _q.setFromRotationMatrix(_m);
    const p = s.point.addScaledVector(n, 0.003);
    if (kind === 'blood') p.addScaledVector(_y, -mesh.scale.y * 0.3);
    // Build in world space, then attach to the body part so it moves with it.
    this.game.renderer.scene.add(mesh);
    mesh.position.copy(p);
    mesh.quaternion.copy(_q);
    mesh.updateMatrixWorld();
    s.mesh.attach(mesh);
    this.decals.push(mesh);
  }
}
