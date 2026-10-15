import * as THREE from 'three';
import { createAvatar } from '../character/createAvatar.js';
import { FORMS } from '../progression/forms.js';

const SIZE = 192;
const _v = new THREE.Vector3();

// "Selfie" portrait of your character for the HUD: a head-and-shoulders
// render of your own avatar in its current form (gold hair for SSJ1-3, red
// fur for SSJ4, blue for SSJ5, ...). Rendered off-screen only when the
// character or form changes, then copied into a 2D canvas the HUD draws.
export class Portrait {
  constructor(game) {
    this.game = game;
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xeef6ff, 0x5a5048, 1.1));
    const key = new THREE.DirectionalLight(0xfff0dc, 1.6);
    key.position.set(1.2, 2.2, 2.4);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xbfdcff, 0.8);
    rim.position.set(-2, 1.5, -1.5);
    this.scene.add(rim);
    this.camera = new THREE.PerspectiveCamera(20, 1, 0.05, 20);
    this.target = new THREE.WebGLRenderTarget(SIZE, SIZE, { samples: 4 });
    this.target.texture.colorSpace = THREE.SRGBColorSpace;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = SIZE;
    this.pixels = new Uint8Array(SIZE * SIZE * 4);
    this.avatar = null;
    this.charKey = '';
    this.formKey = '';
    this.dirty = true;
    this.ready = false;
  }

  // Re-renders if the look changed. Returns the canvas once there is a picture.
  update() {
    const g = this.game;
    const ck = JSON.stringify(g.character);
    const form = g.player?.form || 'base';
    if (ck !== this.charKey) {
      this.charKey = ck;
      if (this.avatar) { this.scene.remove(this.avatar.root); this.avatar.dispose(); }
      this.avatar = createAvatar(g.character);
      this.scene.add(this.avatar.root);
      this.formKey = '';
    }
    if (form !== this.formKey) {
      this.formKey = form;
      this.avatar.setForm(form);
      this.dirty = true;
    }
    // Modelled characters load asynchronously: render once they're in.
    if (this.avatar.ready === false) return this.ready ? this.canvas : null;
    if (this.dirty) this.render();
    return this.ready ? this.canvas : null;
  }

  render() {
    const a = this.avatar;
    a.restPose?.(0);
    a.root.rotation.y = 0.32; // a slight three-quarter turn
    a.root.updateMatrixWorld(true);
    const head = a.bones?.head || a.head;
    head.getWorldPosition(_v);
    const s = a.body?.scale?.x || 1;
    // The head bone sits at the base of the skull: aim a little above it.
    const face = a.bones ? 0.08 * s : 0;
    this.camera.position.set(_v.x + 0.22 * s, _v.y + face + 0.04 * s, _v.z + 1.45 * s);
    this.camera.lookAt(_v.x + 0.02 * s, _v.y + face - 0.05 * s, _v.z);
    const r = this.game.renderer.renderer;
    // Render straight to our target even inside a VR session.
    const xrOn = r.xr.enabled;
    const prev = r.getRenderTarget();
    r.xr.enabled = false;
    r.setRenderTarget(this.target);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(this.scene, this.camera);
    r.readRenderTargetPixels(this.target, 0, 0, SIZE, SIZE, this.pixels);
    r.setRenderTarget(prev);
    r.xr.enabled = xrOn;
    // Pixels come bottom-up; flip them into the canvas.
    const ctx = this.canvas.getContext('2d');
    const img = ctx.createImageData(SIZE, SIZE);
    const row = SIZE * 4;
    for (let y = 0; y < SIZE; y++) img.data.set(this.pixels.subarray((SIZE - 1 - y) * row, (SIZE - y) * row), y * row);
    ctx.clearRect(0, 0, SIZE, SIZE);
    // Backdrop in the form's aura colour.
    const col = '#' + (FORMS[this.formKey]?.aura.color ?? 0xbfe6ff).toString(16).padStart(6, '0');
    const grd = ctx.createRadialGradient(SIZE / 2, SIZE * 0.45, SIZE * 0.1, SIZE / 2, SIZE / 2, SIZE * 0.7);
    grd.addColorStop(0, col);
    grd.addColorStop(1, '#0a0e22');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, SIZE, SIZE);
    const tmp = document.createElement('canvas');
    tmp.width = tmp.height = SIZE;
    tmp.getContext('2d').putImageData(img, 0, 0);
    ctx.drawImage(tmp, 0, 0);
    this.dirty = false;
    this.ready = true;
  }
}
