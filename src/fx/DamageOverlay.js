import * as THREE from 'three';

// First-person damage feedback on a camera-attached quad (works in VR and on
// desktop): a red flash at the screen edges when hit, and at low health a
// slow pulsing red rim with blood spatter creeping in from the edges. The
// centre of view is never covered. Also tints cool blue during slow motion.
export class DamageOverlay {
  constructor(camera) {
    this.mat = new THREE.ShaderMaterial({
      uniforms: { hurt: { value: 0 }, low: { value: 0 }, time: { value: 0 }, slow: { value: 0 } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float hurt; uniform float low; uniform float time; uniform float slow; varying vec2 vUv;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
        void main(){
          vec2 c = vUv - 0.5;
          float d = length(c) * 2.0;
          // Ragged blood edge: noise pushes the rim in and out.
          float n = noise(c * 9.0) * 0.5 + noise(c * 23.0) * 0.25;
          float pulse = 0.75 + 0.25 * sin(time * 5.5);
          float rim = smoothstep(0.98 - 0.42 * low - 0.18 * hurt - n * 0.25 * low, 1.25, d);
          float a = rim * clamp(low * pulse * 0.9 + hurt * 0.75, 0.0, 0.85);
          vec3 col = mix(vec3(0.55, 0.0, 0.02), vec3(0.85, 0.05, 0.05), hurt);
          float s = smoothstep(0.7, 1.3, d) * slow * 0.45;
          vec3 outc = mix(vec3(0.25, 0.55, 1.0), col, a / max(a + s, 1e-3));
          gl_FragColor = vec4(outc, max(a, s));
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), this.mat);
    this.mesh.position.z = -0.19;
    this.mesh.renderOrder = 99;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    camera.add(this.mesh);
    this.hurt = 0;
  }

  flash(amount = 1) { this.hurt = Math.min(1, this.hurt + amount); }

  update(dt, { healthFrac, enabled, slow }) {
    this.hurt = Math.max(0, this.hurt - dt * 2.5);
    const low = enabled ? THREE.MathUtils.clamp((0.4 - healthFrac) / 0.35, 0, 1) : 0;
    const u = this.mat.uniforms;
    u.time.value += dt;
    u.hurt.value = enabled ? this.hurt : 0;
    u.low.value = low;
    u.slow.value = slow;
    this.mesh.visible = u.hurt.value > 0.01 || low > 0.01 || slow > 0.01;
  }
}
