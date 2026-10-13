import * as THREE from 'three';
import { toon, addOutline } from '../render/toon.js';

// The Hyperbolic Time Chamber: an endless white void with a small temple
// behind you. Swapped in for the training grounds (the arena is hidden), so
// it costs only a handful of draw calls.
export class TimeChamber {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'timeChamber';
    this.group.visible = false;
    scene.add(this.group);
    this.time = 0;

    // Sky: bright white with a faint warm haze near the horizon.
    const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 12), new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vP; void main(){ vec3 d = normalize(vP);
        vec3 c = mix(vec3(1.0, 0.97, 0.9), vec3(0.97, 0.98, 1.0), smoothstep(-0.05, 0.5, d.y));
        gl_FragColor = vec4(c, 1.0); }`,
    }));
    sky.renderOrder = -10;
    this.group.add(sky);

    // Floor: white tiles that fade into the endless white.
    this.floorUniforms = { uTime: { value: 0 } };
    const floor = new THREE.Mesh(new THREE.CircleGeometry(300, 48), new THREE.ShaderMaterial({
      uniforms: this.floorUniforms,
      fog: false,
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `varying vec3 vW; void main(){
        vec2 g = abs(fract(vW.xz / 2.0) - 0.5);
        float line = 1.0 - smoothstep(0.47, 0.49, max(g.x, g.y));
        float d = length(vW.xz);
        float fade = smoothstep(8.0, 60.0, d);
        vec3 base = vec3(0.93, 0.92, 0.9);
        vec3 c = mix(base * (0.94 + 0.06 * line), vec3(1.0, 0.98, 0.94), fade);
        gl_FragColor = vec4(c, 1.0); }`,
    }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.002;
    this.group.add(floor);

    // The temple behind the player: a white platform, two towers, stairs.
    const white = toon(0xf4f1ea);
    const trim = toon(0xc9b48a);
    const dark = toon(0x55504a);
    const temple = new THREE.Group();
    temple.position.set(0, 0, 9);
    const base = new THREE.Mesh(new THREE.BoxGeometry(10, 0.8, 5), white);
    base.position.y = 0.4;
    temple.add(base);
    const hall = new THREE.Mesh(new THREE.BoxGeometry(5, 3.2, 3.4), white);
    hall.position.set(0, 2.4, 0.3);
    temple.add(hall);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.2, 0.1), dark);
    door.position.set(0, 1.9, -1.42);
    temple.add(door);
    for (const s of [-1, 1]) {
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, 6.5, 16), white);
      tower.position.set(s * 3.8, 4.05, 0.4);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(1.15, 2.2, 16), trim);
      cap.position.set(s * 3.8, 8.4, 0.4);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(1.02, 1.02, 0.25, 16), trim);
      band.position.set(s * 3.8, 6.8, 0.4);
      for (const m of [tower, cap]) addOutline(m, 0.03);
      temple.add(tower, cap, band);
    }
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 3.2, 1.4, 4), trim);
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(1, 1, 0.75);
    roof.position.set(0, 4.7, 0.3);
    temple.add(roof);
    for (let i = 0; i < 4; i++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(3, 0.2, 0.5), white);
      step.position.set(0, 0.1 + i * 0.2, -2.75 - (3 - i) * 0.5 + 1.5);
      temple.add(step);
    }
    addOutline(base, 0.02);
    addOutline(hall, 0.02);
    this.group.add(temple);
  }

  setActive(v, arena) {
    this.group.visible = v;
    arena.group.visible = !v;
    if (!this.savedFog) this.savedFog = { color: this.scene.fog.color.clone(), near: this.scene.fog.near, far: this.scene.fog.far };
    if (v) {
      this.scene.fog.color.setHex(0xfbf8f1);
      this.scene.fog.near = 30;
      this.scene.fog.far = 220;
    } else {
      this.scene.fog.color.copy(this.savedFog.color);
      this.scene.fog.near = this.savedFog.near;
      this.scene.fog.far = this.savedFog.far;
    }
  }

  update(dt) {
    if (!this.group.visible) return;
    this.time += dt;
    this.floorUniforms.uTime.value = this.time;
  }
}
