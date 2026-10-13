import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toon, glowMaterial } from '../render/toon.js';

// Open grassy battlefield: mountains, rock formations, bright sky, training
// platform and a boss entrance gate. Everything is procedural geometry.
export class Arena {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'arena';
    scene.add(this.group);
    this.detailGroup = new THREE.Group(); // extra props, hidden on Low
    this.group.add(this.detailGroup);
    this.time = 0;
    this.tint = 0; // 0..1, darkens the sky during transformations

    this.buildSky();
    this.buildLights();
    this.buildGround();
    this.buildPlatform();
    this.buildMountains();
    this.buildRocks();
    this.buildGate();
    this.buildClouds();
    this.buildGrass();
    // Merge static props per material: ~100 fewer draw calls (Quest 2 budget).
    mergeStatic(this.platform);
    mergeStatic(this.clouds);
    mergeStatic(this.detailGroup);
    this.gate.userData.mergeRoot = true; // keep the animated portal separate
    mergeStatic(this.group, (o) => o !== this.sky && o !== this.ground);
  }

  buildSky() {
    const geo = new THREE.SphereGeometry(400, 24, 12);
    this.skyUniforms = {
      top: { value: new THREE.Color(0x2f7cff) },
      horizon: { value: new THREE.Color(0xbfe7ff) },
      tint: { value: 0 },
      tintColor: { value: new THREE.Color(0x3a2a10) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform float tint; uniform vec3 tintColor; varying vec3 vP;
        void main(){ float h = clamp(normalize(vP).y, 0.0, 1.0); vec3 c = mix(horizon, top, pow(h, 0.6));
        c = mix(c, tintColor, tint * 0.55); gl_FragColor = vec4(c, 1.0); }`,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.renderOrder = -10;
    this.group.add(this.sky);
    // Stylized sun disc
    const sun = new THREE.Mesh(new THREE.CircleGeometry(14, 24), new THREE.MeshBasicMaterial({ color: 0xfff6c8, fog: false }));
    sun.position.set(120, 160, -260);
    sun.lookAt(0, 0, 0);
    this.group.add(sun);
  }

  buildLights() {
    this.hemi = new THREE.HemisphereLight(0xdff2ff, 0x5a7a3a, 0.9);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff1d6, 1.4);
    this.sun.position.set(12, 22, 8);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const s = this.sun.shadow.camera;
    s.left = -12; s.right = 12; s.top = 12; s.bottom = -12; s.near = 1; s.far = 60;
    this.sun.shadow.bias = -0.0015;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.scene.fog = new THREE.Fog(0xbfe7ff, 60, 330);
  }

  buildGround() {
    // Radially subdivided so no single triangle is huge (keeps fog and depth
    // interpolation stable on mobile GPUs).
    const geo = new THREE.RingGeometry(0.001, 300, 48, 24);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      // Concentrate rings near the player: r' = 300 * (r/300)^2
      const x = pos.getX(i); const y = pos.getY(i);
      const r = Math.hypot(x, y);
      if (r > 0) { const k = (300 * Math.pow(r / 300, 2)) / r; pos.setXY(i, x * k, y * k); }
    }
    geo.rotateX(-Math.PI / 2);
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, toon(0x6fbf4a));
    ground.receiveShadow = true;
    ground.name = 'ground';
    this.group.add(ground);
    this.ground = ground;
    // A few darker grass patches for readability of movement
    const patchMat = toon(0x5aa83c);
    for (let i = 0; i < 26; i++) {
      const r = 8 + Math.random() * 90;
      const a = Math.random() * Math.PI * 2;
      const p = new THREE.Mesh(new THREE.CircleGeometry(2 + Math.random() * 6, 10), patchMat);
      p.rotation.x = -Math.PI / 2;
      p.position.set(Math.cos(a) * r, 0.01, Math.sin(a) * r);
      this.group.add(p);
    }
    // Dirt path to the boss gate
    const path = new THREE.Mesh(new THREE.PlaneGeometry(4, 34), toon(0xc9a46a));
    path.rotation.x = -Math.PI / 2;
    path.position.set(0, 0.015, -23);
    this.group.add(path);
  }

  buildPlatform() {
    const g = new THREE.Group();
    // Side wall + a radially subdivided top (avoids huge fan triangles).
    const base = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 6.6, 0.12, 40, 1, true), toon(0xc9bfae));
    base.position.y = -0.05;
    g.add(base);
    const topGeo = new THREE.RingGeometry(0.001, 6.2, 40, 8);
    topGeo.rotateX(-Math.PI / 2);
    const top = new THREE.Mesh(topGeo, toon(0xd8cfc0));
    top.position.y = 0.01; // floor height stays ~0
    top.receiveShadow = true;
    g.add(top);
    const ring = new THREE.Mesh(new THREE.RingGeometry(5.6, 5.9, 48), toon(0xa89a86));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.015;
    g.add(ring);
    const inner = new THREE.Mesh(new THREE.RingGeometry(1.9, 2.05, 40), toon(0xa89a86));
    inner.rotation.x = -Math.PI / 2;
    inner.position.y = 0.015;
    g.add(inner);
    // Corner pillars
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 1.4, 8), toon(0xe9e2d6));
      p.position.set(Math.cos(a) * 6.2, 0.7, Math.sin(a) * 6.2);
      p.castShadow = true;
      g.add(p);
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffb24a }));
      orb.position.set(p.position.x, 1.55, p.position.z);
      g.add(orb);
    }
    this.group.add(g);
    this.platform = g;
  }

  buildMountains() {
    const colors = [0x6b7fa8, 0x7d8fb5, 0x5f7298];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + Math.random() * 0.2;
      const r = 150 + Math.random() * 60;
      const h = 45 + Math.random() * 70;
      const m = new THREE.Mesh(new THREE.ConeGeometry(25 + Math.random() * 20, h, 6 + Math.floor(Math.random() * 3)), toon(colors[i % 3], { flat: true }));
      m.position.set(Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r);
      m.rotation.y = Math.random() * Math.PI;
      this.group.add(m);
      if (h > 80) {
        const cap = new THREE.Mesh(new THREE.ConeGeometry(9, 16, 6), toon(0xf4f8ff, { flat: true }));
        cap.position.set(m.position.x, h - 8 - 2, m.position.z);
        cap.rotation.y = m.rotation.y;
        this.group.add(cap);
      }
    }
  }

  buildRocks() {
    const rockMat = toon(0xb08a64, { flat: true });
    const rockMat2 = toon(0x9a7655, { flat: true });
    // Tall rock pillars typical of anime battlefields
    const spots = [[-22, -18], [18, -26], [-30, 10], [28, 14], [-12, -45], [14, -48], [40, -10], [-42, -30], [8, 30], [-18, 32]];
    spots.forEach(([x, z], i) => {
      const h = 6 + Math.random() * 12;
      const geo = new THREE.CylinderGeometry(1.2 + Math.random(), 2.4 + Math.random() * 1.5, h, 7);
      const p = new THREE.Mesh(geo, i % 2 ? rockMat : rockMat2);
      p.position.set(x, h / 2, z);
      p.rotation.y = Math.random() * 3;
      p.castShadow = true;
      this.group.add(p);
      const top = new THREE.Mesh(new THREE.DodecahedronGeometry(2.2 + Math.random(), 0), rockMat);
      top.position.set(x, h + 0.5, z);
      top.scale.y = 0.6;
      this.group.add(top);
    });
    // Boulders near the platform (detail)
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 9 + Math.random() * 14;
      const b = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 + Math.random() * 1.2, 0), i % 2 ? rockMat : rockMat2);
      b.position.set(Math.cos(a) * r, 0.3, Math.sin(a) * r);
      if (Math.abs(b.position.x) < 3 && b.position.z < 0) b.position.x += 6; // keep the path clear
      b.rotation.set(Math.random(), Math.random(), Math.random());
      b.castShadow = true;
      this.detailGroup.add(b);
    }
  }

  buildGate() {
    // Boss entrance: two rock pillars with a glowing energy portal
    const g = new THREE.Group();
    const mat = toon(0x8a6a4c, { flat: true });
    [-4.5, 4.5].forEach((x) => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(2, 11, 2), mat);
      p.position.set(x, 5.5, 0);
      p.castShadow = true;
      g.add(p);
    });
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(11.5, 1.8, 2.4), mat);
    lintel.position.y = 11.5;
    g.add(lintel);
    this.portalMat = glowMaterial(0xff5a2a, 0.45);
    const portal = new THREE.Mesh(new THREE.PlaneGeometry(7, 10.5), this.portalMat);
    portal.position.y = 5.3;
    g.add(portal);
    g.position.set(0, 0, -40);
    this.group.add(g);
    this.gate = g;
    this.gatePosition = new THREE.Vector3(0, 5, -40);
  }

  buildClouds() {
    const mat = toon(0xffffff);
    this.clouds = new THREE.Group();
    for (let i = 0; i < 14; i++) {
      const c = new THREE.Group();
      const n = 3 + Math.floor(Math.random() * 3);
      for (let j = 0; j < n; j++) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(4 + Math.random() * 4, 10, 8), mat);
        s.position.set(j * 5 - n * 2.5, Math.random() * 2, Math.random() * 3);
        s.scale.y = 0.6;
        c.add(s);
      }
      const a = Math.random() * Math.PI * 2;
      const r = 90 + Math.random() * 120;
      c.position.set(Math.cos(a) * r, 55 + Math.random() * 40, Math.sin(a) * r);
      this.clouds.add(c);
    }
    this.group.add(this.clouds);
  }

  buildGrass() {
    // Instanced grass tufts: one draw call. Hidden on Low preset.
    const blade = new THREE.ConeGeometry(0.06, 0.35, 3);
    blade.translate(0, 0.17, 0);
    const count = 900;
    const inst = new THREE.InstancedMesh(blade, toon(0x4f9e33), count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    let i = 0;
    while (i < count) {
      const a = Math.random() * Math.PI * 2;
      const r = 7 + Math.random() * 40;
      p.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      if (Math.abs(p.x) < 2.4 && p.z < -5 && p.z > -40) continue;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 3);
      const k = 0.7 + Math.random() * 0.8;
      s.set(k, k, k);
      m.compose(p, q, s);
      inst.setMatrixAt(i++, m);
    }
    this.detailGroup.add(inst);
  }

  setDetail(level) {
    this.detailGroup.visible = level > 0;
    this.clouds.visible = level > 0;
    this.sun.castShadow = level > 1;
  }

  update(dt) {
    this.time += dt;
    this.clouds.rotation.y += dt * 0.004;
    this.portalMat.opacity = 0.35 + Math.sin(this.time * 2) * 0.1;
    this.skyUniforms.tint.value = this.tint;
    const k = 1 - this.tint * 0.35;
    this.hemi.intensity = 0.9 * k;
    this.sun.intensity = 1.4 * k;
  }
}

// Bake every eligible mesh under `root` (direct or nested, skipping nested
// merge roots) into one mesh per material.
function mergeStatic(root, filter = () => true) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  const victims = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o === root) return;
    if (o.material.transparent || o.material.isShaderMaterial || Array.isArray(o.material)) return;
    if (!filter(o)) return;
    // Only merge objects whose parents are plain groups owned by this root.
    let p = o.parent;
    while (p && p !== root) { if (p.userData.mergeRoot) return; p = p.parent; }
    const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone());
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    const key = o.material.uuid;
    if (!buckets.has(key)) buckets.set(key, { material: o.material, geos: [], cast: false, receive: false });
    const b = buckets.get(key);
    b.geos.push(g);
    b.cast ||= o.castShadow;
    b.receive ||= o.receiveShadow;
    victims.push(o);
  });
  for (const o of victims) o.parent.remove(o);
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false);
    if (!merged) continue;
    const m = new THREE.Mesh(merged, b.material);
    m.castShadow = b.cast;
    m.receiveShadow = b.receive;
    root.add(m);
  }
  root.userData.mergeRoot = true;
}
