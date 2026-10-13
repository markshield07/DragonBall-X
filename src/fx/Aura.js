import * as THREE from 'three';

// Animated anime energy aura: a teardrop-shaped shell with a scrolling flame
// shader (additive, no lights, no textures). Two shells (outer flame + inner
// core) on Medium/High, one on Low.
//
// firstPerson mode fades the aura out in the centre of the player's view so
// it frames peripheral vision without blocking what they are fighting.
const vert = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const frag = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform vec3 uColor;
  uniform vec3 uCore;
  uniform float uFirstPerson;
  uniform vec3 uCamPos;
  uniform vec3 uCamDir;
  uniform float uSpeed;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormalW;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  void main() {
    // Flame tongues: noise columns scrolling upward.
    vec2 p = vec2(vUv.x * 14.0, vUv.y * 3.0 - uTime * uSpeed);
    float n = noise(p) * 0.6 + noise(p * 2.3 + 4.0) * 0.4;
    float tongues = smoothstep(0.25, 0.9, n + (1.0 - vUv.y) * 0.45);
    float bottomFade = smoothstep(0.0, 0.12, vUv.y);
    float topFade = 1.0 - smoothstep(0.55, 1.0, vUv.y);
    vec3 viewDir = normalize(vWorld - uCamPos);
    float rim = 1.0 - abs(dot(normalize(vNormalW), viewDir));
    float a = tongues * bottomFade * topFade * (0.35 + 0.65 * rim);
    // First person: keep the centre of the view clear.
    float centre = dot(viewDir, uCamDir);
    a *= mix(1.0, 1.0 - smoothstep(0.55, 0.9, centre) * 0.92, uFirstPerson);
    vec3 col = mix(uColor, uCore, smoothstep(0.55, 1.0, n));
    gl_FragColor = vec4(col * a * uIntensity, 1.0);
  }
`;

const _camPos = new THREE.Vector3();
const _camDir = new THREE.Vector3();

function auraGeometry(radius, height) {
  // Teardrop profile: wide at waist, closing to a point above the head.
  const pts = [];
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const r = radius * (Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.08)) * 0.9 + 0.12) * (1 - t * 0.35);
    pts.push(new THREE.Vector2(Math.max(r, 0.01), t * height));
  }
  return new THREE.LatheGeometry(pts, 20);
}

export class Aura {
  constructor({ radius = 0.75, height = 2.4, firstPerson = false } = {}) {
    this.group = new THREE.Group();
    this.group.name = 'aura';
    this.layers = [];
    this.intensity = 0;
    this.target = 0;
    this.color = new THREE.Color(0xbfe6ff);
    this.core = new THREE.Color(0xffffff);
    this.scale = 1;
    const geo = auraGeometry(radius, height);
    for (let i = 0; i < 2; i++) {
      const uniforms = {
        uTime: { value: Math.random() * 10 },
        uIntensity: { value: 0 },
        uColor: { value: this.color.clone() },
        uCore: { value: this.core.clone() },
        uFirstPerson: { value: firstPerson ? 1 : 0 },
        uCamPos: { value: new THREE.Vector3() },
        uCamDir: { value: new THREE.Vector3(0, 0, -1) },
        uSpeed: { value: i === 0 ? 1.6 : 2.4 },
      };
      const mat = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: vert,
        fragmentShader: frag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 5;
      mesh.raycast = () => {};
      if (i === 1) mesh.scale.set(0.72, 0.85, 0.72);
      this.group.add(mesh);
      this.layers.push(mesh);
    }
    this.group.visible = false;
  }

  setStyle({ color, core, scale }) {
    if (color !== undefined) this.color.setHex(color);
    if (core !== undefined) this.core.setHex(core);
    if (scale !== undefined) this.scale = scale;
  }

  setLayers(n) {
    this.layers[1].visible = n > 1;
  }

  update(dt, camera, intensityScale = 1) {
    this.intensity += (this.target - this.intensity) * Math.min(1, dt * 4);
    const vis = this.intensity > 0.01;
    this.group.visible = vis;
    if (!vis) return;
    const camPos = camera.getWorldPosition(_camPos);
    const camDir = camera.getWorldDirection(_camDir);
    const s = 0.6 + 0.4 * this.scale * Math.min(1.4, 0.4 + this.intensity);
    this.group.scale.set(s, 0.75 + 0.35 * this.scale * this.intensity, s);
    for (const m of this.layers) {
      const u = m.material.uniforms;
      u.uTime.value += dt;
      u.uIntensity.value = this.intensity * intensityScale * (m === this.layers[1] ? 0.8 : 1);
      u.uColor.value.copy(this.color);
      u.uCore.value.copy(this.core);
      u.uCamPos.value.copy(camPos);
      u.uCamDir.value.copy(camDir);
    }
  }
}
