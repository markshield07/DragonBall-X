import * as THREE from 'three';

const _m = new THREE.Matrix4();

// Routes pointer input to world-space panels.
//  VR: a laser from each controller; trigger clicks.
//  Desktop: the mouse cursor (pointer lock is released while menus are open).
export class UIManager {
  constructor(game) {
    this.game = game;
    this.panels = new Set();
    this.raycaster = new THREE.Raycaster();
    this.lasers = {};
    this.triggerPrev = { left: false, right: false };
    for (const side of ['left', 'right']) {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffcc33, transparent: true, opacity: 0.8 }));
      line.visible = false;
      line.frustumCulled = false;
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
      dot.renderOrder = 40;
      dot.visible = false;
      game.renderer.scene.add(line, dot);
      this.lasers[side] = { line, dot };
    }
    this.mouseClick = false;
    game.renderer.canvas.addEventListener('click', () => { this.mouseClick = true; });
  }

  add(panel) { this.panels.add(panel); }

  get anyVisible() {
    for (const p of this.panels) if (p.visible && p.interactive) return true;
    return false;
  }

  meshes() {
    const out = [];
    for (const p of this.panels) if (p.visible && p.interactive) out.push(p.mesh);
    return out;
  }

  update(input) {
    const g = this.game;
    const meshes = this.meshes();
    for (const p of this.panels) p.update();
    let hoveredAny = new Set();
    if (g.isXR) {
      for (const side of ['left', 'right']) {
        const L = this.lasers[side];
        const ray = g.xrInput.rayFor(side);
        const hs = input.hands[side];
        if (!ray || !meshes.length || !hs.tracked) { L.line.visible = L.dot.visible = false; this.triggerPrev[side] = hs.trigger > 0.6; continue; }
        ray.updateMatrixWorld();
        _m.identity().extractRotation(ray.matrixWorld);
        this.raycaster.ray.origin.setFromMatrixPosition(ray.matrixWorld);
        this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(_m);
        const hit = this.raycaster.intersectObjects(meshes, false)[0];
        const pressed = hs.trigger > 0.6;
        const clicked = pressed && !this.triggerPrev[side];
        this.triggerPrev[side] = pressed;
        L.line.visible = true;
        L.line.position.copy(this.raycaster.ray.origin);
        L.line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), this.raycaster.ray.direction);
        L.line.scale.z = hit ? hit.distance : 1.5;
        if (hit) {
          const panel = hit.object.userData.panel;
          L.dot.visible = true;
          L.dot.position.copy(hit.point);
          panel.setHover(hit.uv);
          hoveredAny.add(panel);
          if (clicked && panel.click(hit.uv)) {
            g.audio.ui();
            g.haptic(side, 0.3, 30);
          }
        } else L.dot.visible = false;
      }
    } else {
      for (const side of ['left', 'right']) this.lasers[side].line.visible = this.lasers[side].dot.visible = false;
      if (meshes.length) {
        const mouse = g.desktopInput.mouse;
        this.raycaster.setFromCamera(new THREE.Vector2(mouse.x, mouse.y), g.renderer.camera);
        const hit = this.raycaster.intersectObjects(meshes, false)[0];
        if (hit) {
          const panel = hit.object.userData.panel;
          panel.setHover(hit.uv);
          hoveredAny.add(panel);
          g.renderer.canvas.style.cursor = panel.hoverId ? 'pointer' : 'default';
          if (this.mouseClick) {
            if (panel.click(hit.uv)) g.audio.ui();
            else g.story?.onFreeClick();
          }
        } else {
          g.renderer.canvas.style.cursor = 'default';
          if (this.mouseClick) g.story?.onFreeClick();
        }
      } else if (this.mouseClick) g.story?.onFreeClick();
    }
    for (const p of this.panels) if (!hoveredAny.has(p) && p.hoverId) p.setHover(null);
    this.mouseClick = false;
    hoveredAny = null;
  }

  hideLasers() {
    for (const side of ['left', 'right']) this.lasers[side].line.visible = this.lasers[side].dot.visible = false;
  }
}
