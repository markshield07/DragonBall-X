import * as THREE from 'three';
import { createAvatar } from '../character/createAvatar.js';
import { terrainHeight } from '../world/terrain.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _m = new THREE.Matrix4();
const _dir = new THREE.Vector3();

// Your own warrior, seen from behind. On desktop the camera can sit behind
// you ("Behind view", P), which shows your whole character: legs stepping as
// you walk or run, hanging and trailing behind you when you fly, arms
// following your punches. First person keeps just the gloves.
export class PlayerBody {
  constructor(game) {
    this.game = game;
    this.avatar = null;
    this.yaw = 0;
    this.speed = 0;
    this.last = null;
    this.third = false;
    this.viewCam = new THREE.PerspectiveCamera(70, 1, 0.05, 600);
    this.viewCam.name = 'behindCamera';
    game.renderer.scene.add(this.viewCam);
  }

  setCharacter(character) {
    if (this.avatar) {
      this.game.renderer.scene.remove(this.avatar.root);
      this.avatar.dispose();
    }
    this.avatar = createAvatar(character);
    this.avatar.root.name = 'playerBody';
    this.avatar.root.visible = false;
    this.game.renderer.scene.add(this.avatar.root);
    this.avatar.setForm(this.game.player?.form || 'base');
  }

  setForm(id) {
    this.avatar?.setForm(id);
  }

  // Desktop "Behind" camera is on and you're playing (menus use the normal view).
  wantsThird() {
    const g = this.game;
    return !g.isXR && g.settings.cameraView === 'behind' && g.gameplayActive && !g.menuOpen;
  }

  update(dt) {
    const g = this.game;
    const a = this.avatar;
    if (!a) return;
    const p = g.player;
    const head = p.headWorld;
    // How fast you're really going (sticks, flight, being knocked back).
    if (this.last && dt > 0) {
      const inst = Math.hypot(head.x - this.last.x, head.z - this.last.z) / dt;
      this.speed += (Math.min(inst, 80) - this.speed) * Math.min(1, dt * 12);
      _v.set(head.x - this.last.x, 0, head.z - this.last.z);
    } else _v.set(0, 0, 0);
    this.last = (this.last || new THREE.Vector3()).copy(head);

    this.third = this.wantsThird();
    a.root.visible = this.third;
    if (!this.third) return;

    // Body faces where you look (turning with the head, like your real body).
    _e.setFromQuaternion(g.renderer.camera.getWorldQuaternion(_q), 'YXZ');
    let d = _e.y - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += Math.abs(d) > 1.2 ? d : d * Math.min(1, dt * 10);
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw); // camera looks -Z, so forward is (-fx, -fz)
    const along = -(_v.x * fx + _v.z * fz);
    const back = along < -0.3 * _v.length();

    const root = a.root;
    const floor = p.groundY();
    const eye = Math.max(0.9, head.y - floor);
    const scale = THREE.MathUtils.clamp(eye / 1.66, 0.8, 1.15);
    root.scale.setScalar(scale);
    root.position.set(head.x + fx * 0.04, floor, head.z + fz * 0.04);
    root.rotation.set(0, this.yaw + Math.PI, 0, 'YXZ');
    // Fast flight in the behind view: lie flat out like Superman, pivoting
    // around the hips so you stay under the camera.
    const cruise = p.flying ? (p.cruise || 0) * Math.min(1, this.speed / 8) : 0;
    this.tilt = (this.tilt || 0) + (cruise * 1.05 - (this.tilt || 0)) * Math.min(1, dt * 4);
    if (this.tilt > 0.01) {
      const h = 1.0 * scale;
      root.rotation.x = this.tilt;
      root.position.x += fx * h * Math.sin(this.tilt);
      root.position.z += fz * h * Math.sin(this.tilt);
      root.position.y += h * (1 - Math.cos(this.tilt));
    }
    root.updateMatrixWorld(true);

    const tr = g.transformation;
    if (tr && (tr.state === 'charging' || tr.state === 'transforming')) {
      this.powerTime = (this.powerTime || 0) + dt;
      a.powerUpPose(this.powerTime, tr.state === 'transforming' ? 1 : 0.55 + 0.45 * tr.charge);
    } else {
      // Arms reach for your gloves; the head turns with the camera.
      _m.copy(root.matrixWorld).invert();
      const L = g.hands.hands.left;
      const R = g.hands.hands.right;
      const toLocal = (h) => h.group.getWorldPosition(new THREE.Vector3()).applyMatrix4(_m);
      const headLocal = root.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(_q);
      headLocal.multiply(new THREE.Quaternion().setFromAxisAngle(_w.set(0, 1, 0), Math.PI));
      a.setPose(toLocal(L), toLocal(R), headLocal);
      a.stride?.(dt, this.speed, p.flying, { back, fast: Math.max(p.cruise || 0, Math.min(1, (this.speed - 4) / 10)) });
    }
  }

  // The behind-you camera: over your right shoulder, aimed at the point your
  // crosshair points at, never under the ground.
  placeViewCamera(cam) {
    const g = this.game;
    const head = g.player.headWorld;
    const dir = cam.getWorldDirection(_dir);
    const right = _w.crossVectors(dir, THREE.Object3D.DEFAULT_UP).normalize();
    const vc = this.viewCam;
    vc.fov = cam.fov;
    vc.aspect = cam.aspect;
    vc.near = 0.1;
    vc.far = cam.far;
    vc.updateProjectionMatrix();
    const dist = 3.4 + 1.6 * (g.player.cruise || 0);
    vc.position.copy(head).addScaledVector(dir, -dist).addScaledVector(right, 0.55);
    vc.position.y += 0.55;
    const ground = terrainHeight(vc.position.x, vc.position.z) + 0.35;
    if (vc.position.y < ground) vc.position.y = ground;
    vc.lookAt(_v.copy(head).addScaledVector(dir, 25));
    vc.updateMatrixWorld(true);
    return vc;
  }
}
