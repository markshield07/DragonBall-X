import * as THREE from 'three';

// Comfort helpers that live on the camera: a movement vignette (tunnel vision
// while artificially moving/turning) and a fade used for teleports and scene
// changes. Both are plain meshes so they work inside an XR session.
export class Comfort {
  constructor(camera) {
    this.vignetteMat = new THREE.ShaderMaterial({
      uniforms: { strength: { value: 0 } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float strength; varying vec2 vUv;
        void main(){ float d = length(vUv - 0.5) * 2.0; float a = smoothstep(0.55 - 0.25 * strength, 1.0, d) * strength;
        gl_FragColor = vec4(0.0, 0.0, 0.0, a * 0.92); }`,
    });
    this.vignette = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), this.vignetteMat);
    this.vignette.position.z = -0.2;
    this.vignette.renderOrder = 100;
    this.vignette.frustumCulled = false;
    camera.add(this.vignette);

    this.fadeMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthTest: false, depthWrite: false, side: THREE.BackSide });
    this.fadeSphere = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8), this.fadeMat);
    this.fadeSphere.renderOrder = 101;
    this.fadeSphere.frustumCulled = false;
    camera.add(this.fadeSphere);
    this.fade = { t: 0, phase: 'none', cb: null };
    this.vignette.visible = false;
    this.fadeSphere.visible = false;
  }

  setVignette(strength) {
    this.vignetteMat.uniforms.strength.value = strength;
    this.vignette.visible = strength > 0.01;
  }

  fadeTo(cb, duration = 0.18) {
    this.fade = { t: 0, phase: 'out', cb, duration };
    this.fadeSphere.visible = true;
  }

  update(dt) {
    const f = this.fade;
    if (f.phase === 'none') return;
    f.t += dt;
    if (f.phase === 'out') {
      this.fadeMat.opacity = Math.min(1, f.t / f.duration);
      if (f.t >= f.duration) {
        f.cb?.();
        f.phase = 'in';
        f.t = 0;
      }
    } else {
      this.fadeMat.opacity = Math.max(0, 1 - f.t / f.duration);
      if (f.t >= f.duration) {
        f.phase = 'none';
        this.fadeSphere.visible = false;
      }
    }
  }
}
