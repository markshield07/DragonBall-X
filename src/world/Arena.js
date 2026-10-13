import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toon, glowMaterial, softCircleTexture } from '../render/toon.js';

// "Mountain plains training zone": a bright, open anime battlefield.
//
// Layout (metres, player starts at the origin facing -Z):
//   r < 34        flat play area: stone training platform (dummy and
//                 sparring circle), mirror house on the left, dirt path to
//                 the boss gate at z = -40 and a cracked battle crater
//   34 – 120      rolling grass hills, layered rock pillars and mesas, trees
//   120 – 300     two rings of mountain silhouettes, cliffs, snow caps
//   sky           gradient dome, sun with halo, soft clouds
//   ambient       drifting wind streaks, dust motes, floating rocks near the
//                 battle crater (all GPU-animated, one draw call each)
//
// Everything is procedural. Static props are merged into one mesh per
// material, so the whole world is about 30 draw calls. Low hides the detail
// group (grass, trees, boulders, dust, wind); High adds denser grass.
const FLAT_RADIUS = 34;
const GROUND_RADIUS = 320;

// Rock strata palette (sandstone layers typical of anime wastelands)
const STRATA = [0xc98c5a, 0xb3714a, 0xdca772, 0x9a6040];

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth value noise for terrain and color variation.
function hash2(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise2(x, z) {
  const ix = Math.floor(x); const iz = Math.floor(z);
  const fx = x - ix; const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx); const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz); const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1); const d = hash2(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Terrain height: flat where people play, rolling hills beyond.
export function terrainHeight(x, z) {
  const r = Math.hypot(x, z);
  if (r < FLAT_RADIUS) return 0;
  const hills = noise2(x * 0.03, z * 0.03) * 9 + noise2(x * 0.08 + 7, z * 0.08) * 3;
  const rise = smooth(FLAT_RADIUS, 70, r);
  const foothills = smooth(110, 200, r) * 22 * (0.5 + noise2(x * 0.015, z * 0.015));
  return hills * rise + foothills;
}

export class Arena {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'arena';
    scene.add(this.group);
    this.detailGroup = new THREE.Group(); // extra props, hidden on Low
    this.group.add(this.detailGroup);
    this.highGroup = new THREE.Group(); // extra density, High only
    this.group.add(this.highGroup);
    this.time = 0;
    this.tint = 0; // 0..1, darkens the sky during transformations
    this.slow = 0; // 0..1, cool blue tint during slow motion
    this.gravity = 0; // 0..1, red gravity-chamber tint
    this.rand = mulberry32(1987);

    this.buildSky();
    this.buildLights();
    this.buildGround();
    this.buildPlatform();
    this.buildTrainingProps();
    this.buildBattleCrater();
    this.buildMountains();
    this.buildRockFormations();
    this.buildGate();
    this.buildClouds();
    this.buildTrees();
    this.buildGrass();
    this.buildFloatingRocks();
    this.buildWind();
    this.buildDust();
    // Merge static props per material (Quest 2 draw-call budget).
    mergeStatic(this.platform);
    mergeStatic(this.clouds);
    mergeStatic(this.detailGroup);
    mergeStatic(this.floating);
    this.gate.userData.mergeRoot = true; // keep the animated portal separate
    mergeStatic(this.group, (o) => o !== this.sky && o !== this.ground && o !== this.sunDisc);
  }

  r() { return this.rand(); }

  buildSky() {
    const geo = new THREE.SphereGeometry(420, 32, 16);
    this.skyUniforms = {
      top: { value: new THREE.Color(0x1f6dff) },
      mid: { value: new THREE.Color(0x5aa8ff) },
      horizon: { value: new THREE.Color(0xd6f1ff) },
      sunDir: { value: new THREE.Vector3(0.38, 0.5, -0.78).normalize() },
      tint: { value: 0 },
      tintColor: { value: new THREE.Color(0x3a2a10) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 sunDir; uniform float tint; uniform vec3 tintColor; varying vec3 vP;
        void main(){ vec3 d = normalize(vP); float h = clamp(d.y, 0.0, 1.0);
        vec3 c = mix(horizon, mid, smoothstep(0.0, 0.18, h)); c = mix(c, top, smoothstep(0.18, 0.75, h));
        float s = max(dot(d, sunDir), 0.0); c += vec3(1.0, 0.92, 0.7) * pow(s, 24.0) * 0.45;
        c = mix(c, tintColor, tint * 0.55); gl_FragColor = vec4(c, 1.0); }`,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.renderOrder = -10;
    this.group.add(this.sky);
    // Stylized sun disc with a soft halo
    const sunPos = this.skyUniforms.sunDir.value.clone().multiplyScalar(380);
    const sun = new THREE.Mesh(new THREE.CircleGeometry(13, 28), new THREE.MeshBasicMaterial({ color: 0xfff8d8, fog: false }));
    sun.position.copy(sunPos);
    sun.lookAt(0, 0, 0);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softCircleTexture(), color: 0xfff0b0, transparent: true, opacity: 0.55, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(90);
    halo.position.copy(sunPos).multiplyScalar(1.01);
    this.sunDisc = sun;
    this.group.add(sun, halo);
  }

  buildLights() {
    this.hemi = new THREE.HemisphereLight(0xe6f4ff, 0x6a8a3a, 0.95);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0d0, 1.45);
    this.sun.position.set(12, 22, 8);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const s = this.sun.shadow.camera;
    s.left = -12; s.right = 12; s.top = 12; s.bottom = -12; s.near = 1; s.far = 60;
    this.sun.shadow.bias = -0.0015;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.scene.fog = new THREE.Fog(0xd6f1ff, 80, 400);
  }

  buildGround() {
    // Radially subdivided disc with rings concentrated near the player, so no
    // triangle is huge (keeps fog and depth stable on mobile GPUs). Colors are
    // per vertex: grass tones, dirt paths, worn battle areas, rocky patches.
    const geo = new THREE.RingGeometry(0.001, GROUND_RADIUS, 96, 44);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const grassA = new THREE.Color(0x6cc24a);
    const grassB = new THREE.Color(0x58ad3c);
    const grassHigh = new THREE.Color(0x9ccf55);
    const dirt = new THREE.Color(0xcfa66c);
    const worn = new THREE.Color(0xb88f5c);
    const rock = new THREE.Color(0xa58a6c);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i); let z = pos.getZ(i);
      const r0 = Math.hypot(x, z);
      if (r0 > 0) { const k = (GROUND_RADIUS * Math.pow(r0 / GROUND_RADIUS, 2)) / r0; x *= k; z *= k; }
      const r = Math.hypot(x, z);
      const y = terrainHeight(x, z);
      pos.setXYZ(i, x, y, z);
      // Grass: two cel tones chosen by noise (blotchy anime look)
      const n = noise2(x * 0.07, z * 0.07);
      c.copy(n > 0.5 ? grassA : grassB);
      // Higher hills are sunnier
      c.lerp(grassHigh, smooth(4, 14, y) * 0.8);
      // Dirt path from the platform to the boss gate
      const onPath = Math.abs(x + Math.sin(z * 0.15) * 0.6) < 2.4 - noise2(z * 0.3, 3) * 0.6 && z < -5 && z > -42;
      // Worn ring around the platform and the battle crater
      const aroundPlatform = r > 6.4 && r < 8.2 + noise2(x * 0.4, z * 0.4) * 1.5;
      const crater = Math.hypot(x, z + 24) < 9 + noise2(x * 0.3, z * 0.3) * 2;
      if (onPath) c.copy(dirt);
      else if (crater) c.copy(worn);
      else if (aroundPlatform) c.lerp(worn, 0.65);
      // Rocky patches out on the plains
      else if (r > 18 && noise2(x * 0.05 + 30, z * 0.05) > 0.72) c.copy(rock);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, toon(0xffffff, { vertexColors: true }));
    ground.receiveShadow = true;
    ground.name = 'ground';
    this.group.add(ground);
    this.ground = ground;
  }

  buildPlatform() {
    // Tournament-style stone training platform: the sparring circle where
    // the dummy, targets and boss fight happen. Floor height stays ~0.
    const g = new THREE.Group();
    const stone = toon(0xd9d0c0);
    const stoneDark = toon(0xa89a86);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 6.7, 0.14, 48, 1, true), toon(0xb8ad9a));
    base.position.y = -0.06;
    g.add(base);
    const topGeo = new THREE.RingGeometry(0.001, 6.2, 48, 8);
    topGeo.rotateX(-Math.PI / 2);
    const top = new THREE.Mesh(topGeo, stone);
    top.position.y = 0.01;
    top.receiveShadow = true;
    g.add(top);
    // Tile seams: concentric rings and radial lines
    for (const [a, b] of [[5.6, 5.85], [3.9, 4.0], [1.9, 2.05]]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(a, b, 56), stoneDark);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.016;
      g.add(ring);
    }
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      const seam = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 3.6), stoneDark);
      seam.rotation.set(-Math.PI / 2, 0, ang);
      seam.position.set(Math.sin(ang) * 3.95, 0.017, Math.cos(ang) * 3.95);
      g.add(seam);
    }
    // Corner pillars with energy orbs
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.32, 1.5, 8), toon(0xe9e2d6));
      p.position.set(Math.cos(a) * 6.3, 0.75, Math.sin(a) * 6.3);
      p.castShadow = true;
      g.add(p);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.3, 0.14, 8), stoneDark);
      cap.position.set(p.position.x, 1.55, p.position.z);
      g.add(cap);
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffb24a }));
      orb.position.set(p.position.x, 1.78, p.position.z);
      g.add(orb);
    }
    // Steps down to the path
    for (let i = 0; i < 2; i++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 0.5), toon(0xb8ad9a));
      step.position.set(0, -0.04 - i * 0.03, -6.75 - i * 0.45);
      g.add(step);
    }
    this.group.add(g);
    this.platform = g;
  }

  buildTrainingProps() {
    // Training-ground dressing just off the platform: wooden posts and
    // weighted boulders. Kept away from the mirror house (left) and path.
    const wood = toon(0x9a6a3c);
    const rope = toon(0xe0c98a);
    const rock = toon(0x9c8b78, { flat: true });
    const posts = [[8.2, 2.5], [9.0, 0.6], [8.6, -1.4]];
    for (const [x, z] of posts) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.7, 8), wood);
      p.position.set(x, 0.85, z);
      p.castShadow = true;
      this.detailGroup.add(p);
      for (const y of [0.9, 1.3]) {
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 8), rope);
        band.position.set(x, y, z);
        this.detailGroup.add(band);
      }
    }
    // A big training boulder with a rope harness
    const b = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9, 1), rock);
    b.position.set(9.5, 0.7, 4.8);
    b.scale.set(1, 0.85, 1);
    b.castShadow = true;
    this.detailGroup.add(b);
    const harness = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.05, 6, 20), rope);
    harness.position.copy(b.position);
    harness.rotation.x = Math.PI / 2;
    this.detailGroup.add(harness);
  }

  buildBattleCrater() {
    // Where Raxor lands: cracked stone slabs, impact rims and standing stones.
    const c = new THREE.Vector3(0, 0, -24);
    const slab = toon(0xb3a48e, { flat: true });
    const slabDark = toon(0x8a7a66, { flat: true });
    const rim = toon(0xa88a64, { flat: true });
    // Impact rims (low mounds)
    for (const [x, z, rad] of [[0, -24, 6.5], [-6, -19, 2.2], [5.5, -29, 2.6]]) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(rad, 0.28, 5, 28), rim);
      t.rotation.x = -Math.PI / 2;
      t.position.set(x, 0.02, z);
      t.scale.z = 0.5;
      this.group.add(t);
    }
    // Broken, tilted floor slabs
    for (let i = 0; i < 16; i++) {
      const a = this.r() * Math.PI * 2;
      const rr = 2 + this.r() * 5;
      const x = c.x + Math.cos(a) * rr;
      const z = c.z + Math.sin(a) * rr;
      if (Math.abs(x) < 1.6) continue; // keep the path clear
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.8 + this.r() * 1.2, 0.18, 0.6 + this.r()), i % 3 ? slab : slabDark);
      s.position.set(x, 0.05, z);
      s.rotation.set((this.r() - 0.5) * 0.35, this.r() * 3, (this.r() - 0.5) * 0.35);
      this.group.add(s);
    }
    // Crack lines (dark strips) radiating from the crater centre
    const crack = toon(0x5c4a38);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + this.r() * 0.3;
      const len = 2.5 + this.r() * 3;
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.12, len), crack);
      s.rotation.set(-Math.PI / 2, 0, a);
      s.position.set(c.x + Math.sin(a) * (len / 2 + 0.6), 0.02, c.z + Math.cos(a) * (len / 2 + 0.6));
      this.group.add(s);
    }
    // Standing stones lining the approach to the gate
    const standing = toon(0xc0a07a, { flat: true });
    for (const z of [-14, -20, -26, -32]) {
      for (const s of [-1, 1]) {
        const h = 2.2 + this.r() * 1.6;
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.65, h, 5), standing);
        m.position.set(s * (9.5 + this.r() * 1.5), h / 2 - 0.1, z);
        m.rotation.set((this.r() - 0.5) * 0.12, this.r() * 3, (this.r() - 0.5) * 0.12);
        m.castShadow = true;
        this.group.add(m);
      }
    }
  }

  buildMountains() {
    // Overlapping eroded ridge masses, rather than pointed geometric cones.
    // Keep them outside the gameplay area and let fog blend distant layers.
    const near = [0x927b68, 0xa08a78, 0x877665];
    const far = [0x879eb6, 0x9aafc5, 0x7f9db6];
    for(let layer=0;layer<2;layer++) {
      const count=layer===0?24:24;
      for(let i=0;i<count;i++) {
        const angle=(i+this.r()*.4)*Math.PI*2/count;
        const distance=(layer===0?170:275)+(this.r()-.5)*42;
        const x=Math.cos(angle)*distance,z=Math.sin(angle)*distance;
        const height=(layer===0?45:80)+this.r()*(layer===0?68:85);
        const radius=(layer===0?26:49)+this.r()*22;
        const geo=erodedRockGeometry(radius,height,14,9,this.r()*1000);
        const mat=toon((layer===0?near:far)[i%3],{flat:true});
        const mountain=new THREE.Mesh(geo,mat);
        mountain.position.set(x,terrainHeight(x,z)-5,z);
        mountain.rotation.y=this.r()*Math.PI*2;
        this.group.add(mountain);
      }
    }
  }

  buildRockFormations() {
    const strata = STRATA.map((col) => toon(col, { flat: true }));
    const capGrass = toon(0x6cb848, { flat: true });
    // Irregular weathered sandstone columns, single continuous mesh each.
    // Vertex heights and radial profiles are offset to avoid stacked drum shapes.
    const pillar=(x,z,h,rad,grassTop)=>{
      const geo=erodedRockGeometry(rad,h,12,8,this.r()*1000,true);
      const m=new THREE.Mesh(geo,strata[Math.floor(this.r()*strata.length)]);
      m.position.set(x,terrainHeight(x,z)-.7,z);
      m.rotation.y=this.r()*Math.PI*2;
      m.castShadow=h<23;
      this.group.add(m);
      if(grassTop){
        const cap=new THREE.Mesh(new THREE.CylinderGeometry(rad*.65,rad*.72,.35,12),capGrass);
        cap.position.set(x,terrainHeight(x,z)+h*.96,z);
        this.group.add(cap);
      }
    };
    const spots = [
      [-26, -20, 14, 2.2], [22, -30, 18, 2.6], [-38, 6, 11, 2.0], [36, 12, 16, 2.4], [-14, -52, 22, 3.0],
      [16, -58, 26, 3.2], [48, -14, 12, 2.0], [-50, -34, 20, 2.8], [10, 44, 15, 2.4], [-22, 40, 18, 2.6],
      [62, 34, 30, 4.0], [-70, 20, 34, 4.5], [40, -80, 40, 5.0], [-48, -90, 36, 4.5], [86, -40, 28, 3.6], [-90, -12, 26, 3.4],
    ];
    spots.forEach(([x, z, h, rad], i) => pillar(x, z, h, rad, i % 3 === 0));
    // Massive plateaus behind the smaller spires.
    const mesas=[[95,40,14,18],[-105,55,18,22],[70,-105,16,20],[-80,-110,20,16],[125,-5,22,14],[-20,120,18,24]];
    for(const [x,z,h,rad] of mesas){
      const m=new THREE.Mesh(erodedRockGeometry(rad,h,18,7,this.r()*1000,true),strata[Math.floor(this.r()*strata.length)]);
      m.position.set(x,terrainHeight(x,z)-1,z);
      this.group.add(m);
      const cap=new THREE.Mesh(new THREE.CylinderGeometry(rad*.81,rad*.84,.55,18),capGrass);
      cap.position.set(x,terrainHeight(x,z)+h-.45,z);
      this.group.add(cap);
    }
    // Stylized cliffs: angular boulder walls behind the boss gate
    const cliff = toon(0xb98258, { flat: true });
    const cliff2 = toon(0xa06c48, { flat: true });
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + (i - 4) * 0.13;
      const r = 120 + this.r() * 10;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(14 + this.r() * 6, 0), i % 2 ? cliff : cliff2);
      m.position.set(x, terrainHeight(x, z) + 6 + this.r() * 6, z);
      m.scale.set(1.3, 1.6 + this.r() * 0.6, 0.9);
      m.rotation.set(this.r(), this.r() * 3, this.r() * 0.3);
      this.group.add(m);
    }
    // Scattered boulders on the plains (detail)
    const boulderMats = [toon(0xb08a64, { flat: true }), toon(0x9a7655, { flat: true }), toon(0xa59a8a, { flat: true })];
    for (let i = 0; i < 26; i++) {
      const a = this.r() * Math.PI * 2;
      const r = 11 + this.r() * 26;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (Math.abs(x) < 3.5 && z < -4 && z > -42) continue; // path and crater approach
      if (x < -2.5 && x > -14 && Math.abs(z) < 5) continue; // mirror house
      if (x > 6.5 && x < 11 && z > -3 && z < 7) continue; // training props
      const s = 0.4 + this.r() * 1.3;
      const b = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), boulderMats[i % 3]);
      b.position.set(x, s * 0.35 + terrainHeight(x, z), z);
      b.rotation.set(this.r(), this.r(), this.r());
      b.castShadow = true;
      this.detailGroup.add(b);
    }
  }

  buildGate() {
    // Boss entrance: two rock pillars with a glowing energy portal
    const g = new THREE.Group();
    const mat = toon(0x8a6a4c, { flat: true });
    const mat2 = toon(0xa67c56, { flat: true });
    [-4.5, 4.5].forEach((x) => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(2, 11, 2), mat);
      p.position.set(x, 5.5, 0);
      p.castShadow = true;
      g.add(p);
      const band = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 2.2), mat2);
      band.position.set(x, 3.5, 0);
      g.add(band);
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
    // Puffy cel clouds: bright tops, a soft blue-grey underside.
    const top = toon(0xffffff);
    const under = toon(0xdce8f6);
    this.clouds = new THREE.Group();
    for (let i = 0; i < 18; i++) {
      const c = new THREE.Group();
      const n = 3 + Math.floor(this.r() * 4);
      for (let j = 0; j < n; j++) {
        const rad = 4 + this.r() * 5;
        const x = j * 5.5 - n * 2.75;
        const s = new THREE.Mesh(new THREE.SphereGeometry(rad, 10, 8), top);
        s.position.set(x, this.r() * 2.5 + (j % 2) * 1.5, this.r() * 3);
        s.scale.y = 0.65;
        c.add(s);
        const u = new THREE.Mesh(new THREE.SphereGeometry(rad * 0.95, 10, 6), under);
        u.position.set(x, s.position.y - rad * 0.28, s.position.z);
        u.scale.set(1, 0.35, 1);
        c.add(u);
      }
      const a = this.r() * Math.PI * 2;
      const r = 90 + this.r() * 130;
      c.position.set(Math.cos(a) * r, 60 + this.r() * 45, Math.sin(a) * r);
      c.rotation.y = this.r() * Math.PI;
      this.clouds.add(c);
    }
    this.group.add(this.clouds);
  }

  buildTrees() {
    // Simple stylized trees in small groves on the hills (detail).
    const trunk = toon(0x7a5232);
    const leaves = [toon(0x3f9a3a, { flat: true }), toon(0x56b444, { flat: true })];
    const groves = [[45, 25], [-42, -12], [30, -48], [-30, 55], [60, -20], [-60, 38]];
    for (const [gx, gz] of groves) {
      const n = 3 + Math.floor(this.r() * 4);
      for (let i = 0; i < n; i++) {
        const x = gx + (this.r() - 0.5) * 12;
        const z = gz + (this.r() - 0.5) * 12;
        const y = terrainHeight(x, z);
        const h = 2.5 + this.r() * 2;
        const t = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, h, 6), trunk);
        t.position.set(x, y + h / 2, z);
        this.detailGroup.add(t);
        const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4 + this.r(), 0), leaves[i % 2]);
        crown.position.set(x, y + h + 0.6, z);
        crown.scale.y = 0.85;
        this.detailGroup.add(crown);
      }
    }
  }

  buildGrass() {
    // Instanced grass tufts: one draw call each. Hidden on Low; High adds a
    // second, denser field.
    const make = (count, rMin, rMax, group, color) => {
      const blade = new THREE.ConeGeometry(0.06, 0.38, 3);
      blade.translate(0, 0.18, 0);
      const inst = new THREE.InstancedMesh(blade, toon(color), count);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const s = new THREE.Vector3();
      const p = new THREE.Vector3();
      const yAxis = new THREE.Vector3(0, 1, 0);
      let i = 0;
      let guard = 0;
      while (i < count && guard++ < count * 10) {
        const a = this.r() * Math.PI * 2;
        const r = rMin + this.r() * (rMax - rMin);
        p.set(Math.cos(a) * r, 0, Math.sin(a) * r);
        if (Math.abs(p.x) < 2.8 && p.z < -5 && p.z > -42) continue;
        if (Math.hypot(p.x, p.z + 24) < 10) continue;
        if (p.x < -2.5 && p.x > -13 && Math.abs(p.z) < 4.5) continue;
        p.y = terrainHeight(p.x, p.z);
        q.setFromAxisAngle(yAxis, this.r() * 3);
        const k = 0.7 + this.r() * 0.9;
        s.set(k, k, k);
        m.compose(p, q, s);
        inst.setMatrixAt(i++, m);
      }
      inst.count = i;
      group.add(inst);
    };
    make(1700, 8.5, 65, this.detailGroup, 0x4f9e33);
    make(2500, 8.5, 60, this.highGroup, 0x73bc49);
  }

  buildFloatingRocks() {
    // Rocks hovering over the battle crater, as if lifted by leftover energy.
    this.floating = new THREE.Group();
    const mat = toon(0xa07a56, { flat: true });
    for (let i = 0; i < 7; i++) {
      const s = 0.25 + this.r() * 0.6;
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), mat);
      const a = this.r() * Math.PI * 2;
      m.position.set(Math.cos(a) * (3 + this.r() * 5), 1.5 + this.r() * 4, -24 + Math.sin(a) * (3 + this.r() * 4));
      m.rotation.set(this.r() * 3, this.r() * 3, 0);
      this.floating.add(m);
    }
    this.group.add(this.floating);
  }

  buildWind() {
    // Stylized wind streaks: thin bright lines that sweep across the plains.
    // One merged geometry, animated entirely in the vertex shader.
    const count = 16;
    const geos = [];
    for (let i = 0; i < count; i++) {
      const g = new THREE.PlaneGeometry(7 + this.r() * 6, 0.07, 8, 1);
      const seed = this.r();
      const n = g.attributes.position.count;
      g.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(n).fill(seed), 1));
      const base = new Float32Array(n * 3);
      const a = this.r() * Math.PI * 2;
      const r = 10 + this.r() * 50;
      for (let k = 0; k < n; k++) { base[k * 3] = Math.cos(a) * r; base[k * 3 + 1] = 2 + seed * 14; base[k * 3 + 2] = Math.sin(a) * r; }
      g.setAttribute('aBase', new THREE.BufferAttribute(base, 3));
      geos.push(g);
    }
    const geo = mergeGeometries(geos, false);
    this.windUniforms = { uTime: { value: 0 }, uDir: { value: new THREE.Vector3(1, 0, 0.35).normalize() } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.windUniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: `attribute float aSeed; attribute vec3 aBase; uniform float uTime; uniform vec3 uDir; varying float vA; varying float vU;
        void main(){
          float cycle = fract(uTime * 0.07 + aSeed * 7.31);
          vec3 side = normalize(cross(uDir, vec3(0.0,1.0,0.0)));
          vec3 p = aBase + uDir * (position.x + (cycle - 0.5) * 70.0) + vec3(0.0, position.y + sin(position.x * 0.6 + uTime * 2.0 + aSeed * 9.0) * 0.25, 0.0);
          vA = sin(cycle * 3.14159);
          vU = uv.x;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `varying float vA; varying float vU;
        void main(){ float a = vA * sin(vU * 3.14159) * 0.35; gl_FragColor = vec4(vec3(1.0) * a, 1.0); }`,
    });
    this.wind = new THREE.Mesh(geo, mat);
    this.wind.frustumCulled = false;
    this.wind.renderOrder = 5;
    this.detailGroup.add(this.wind);
  }

  buildDust() {
    // Drifting dust and pollen motes around the play area (one draw call).
    const count = 160;
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const a = this.r() * Math.PI * 2;
      const r = 3 + this.r() * 30;
      pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = 0.2 + this.r() * 4; pos[i * 3 + 2] = Math.sin(a) * r;
      seed[i] = this.r();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.dustUniforms = { uTime: { value: 0 }, map: { value: softCircleTexture() }, scale: { value: 600 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.dustUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `attribute float aSeed; uniform float uTime; uniform float scale; varying float vA;
        void main(){
          vec3 p = position;
          p.x += sin(uTime * 0.3 + aSeed * 20.0) * 1.5 + uTime * 0.25;
          p.x = mod(p.x + 35.0, 70.0) - 35.0;
          p.y += sin(uTime * 0.5 + aSeed * 13.0) * 0.4;
          p.z += cos(uTime * 0.27 + aSeed * 17.0) * 1.2;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float d = -mv.z;
          vA = (0.35 + 0.35 * sin(uTime * 1.3 + aSeed * 40.0)) * smoothstep(0.6, 2.0, d);
          gl_PointSize = min(0.05 * scale / max(0.1, d), 8.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform sampler2D map; varying float vA;
        void main(){ float t = texture2D(map, gl_PointCoord).a; gl_FragColor = vec4(vec3(1.0, 0.95, 0.8) * t * vA, 1.0); }`,
    });
    this.dust = new THREE.Points(geo, mat);
    this.dust.frustumCulled = false;
    this.detailGroup.add(this.dust);
  }

  setDetail(level) {
    this.detailGroup.visible = level > 0;
    this.highGroup.visible = level > 1;
    this.clouds.visible = level > 0;
    this.sun.castShadow = level > 1;
  }

  update(dt) {
    this.time += dt;
    this.clouds.rotation.y += dt * 0.004;
    this.portalMat.opacity = 0.35 + Math.sin(this.time * 2) * 0.1;
    this.windUniforms.uTime.value = this.time;
    this.dustUniforms.uTime.value = this.time;
    this.floating.position.y = Math.sin(this.time * 0.6) * 0.35;
    this.floating.rotation.y = Math.sin(this.time * 0.15) * 0.08;
    // Strongest effect wins: transformation dims gold, slow motion tints
    // blue, the gravity chamber glows red.
    const slow = this.slow * 0.8;
    const grav = this.gravity * (0.42 + 0.05 * Math.sin(this.time * 3));
    const t = Math.max(this.tint, slow, grav);
    this.skyUniforms.tint.value = t;
    this.skyUniforms.tintColor.value.setHex(t === this.tint ? 0x3a2a10 : t === slow ? 0x1a3a8a : 0x8a1010);
    const k = 1 - t * 0.35;
    this.hemi.intensity = 0.95 * k;
    this.sun.intensity = 1.45 * k;
  }
}

// A tapered, asymmetric continuous rock surface with stepped erosion bands.
// Replaces stacks of cylinders / repetitive cones while retaining modest Quest
// geometry budgets. Uses indexed triangles and calculated normals.
function erodedRockGeometry(radius,height,sides=12,rings=8,seed=0,mesa=false){
  const random=(v)=>{const x=Math.sin(v*127.1+seed*17.17)*43758.5453;return x-Math.floor(x);};
  const vertices=[],indices=[];
  const samples=Array.from({length:sides},(_,j)=>.81+random(j+11)*.35);
  for(let i=0;i<=rings;i++){
    const t=i/rings;
    const taper=mesa?(t>.83?.83:.97-.12*t):(1-.63*Math.pow(t,1.65));
    const band=1+.08*Math.sin(t*height*.65+seed);
    for(let j=0;j<sides;j++){
      const a=2*Math.PI*j/sides;
      const jitter=.965+.07*random(j*31+i*7);
      const r=radius*taper*band*samples[j]*jitter;
      vertices.push(Math.cos(a)*r+(t*t)*radius*.10*Math.sin(seed),
        t*height+(random(j+19)*.13-.065)*height/rings,
        Math.sin(a)*r+(t*t)*radius*.08*Math.cos(seed));
    }
  }
  for(let i=0;i<rings;i++)for(let j=0;j<sides;j++){
    const a=i*sides+j,b=i*sides+(j+1)%sides,c=(i+1)*sides+j,d=(i+1)*sides+(j+1)%sides;
    indices.push(a,b,c,b,d,c);
  }
  // Top and bottom cap; capped formations cast sensible shadows.
  const bottom=vertices.length/3;vertices.push(0,0,0);
  const top=vertices.length/3;vertices.push(0,height,0);
  for(let j=0;j<sides;j++){
    indices.push(bottom,j,(j+1)%sides);
    indices.push(top,rings*sides+(j+1)%sides,rings*sides+j);
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geo.setIndex(indices);geo.computeVertexNormals();return geo;
}

// Push the middle vertices of a cone outward/inward a little for jagged peaks.
function jitter(geo, amount, arena) {
  const p = geo.attributes.position;
  const h = geo.parameters.height;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (Math.abs(y) < h * 0.3) {
      const k = 1 + (arena.r() - 0.5) * 2 * (amount / geo.parameters.radius);
      p.setX(i, p.getX(i) * k);
      p.setZ(i, p.getZ(i) * k);
    }
  }
  geo.computeVertexNormals();
}

// Bake every eligible mesh under `root` (direct or nested, skipping nested
// merge roots) into as few meshes as possible. Plain cel-shaded props of any
// color share one mesh: their color moves into a vertex attribute, so a
// whole group of rocks, slabs and mountains costs one draw call per eye.
let sharedVC = null;
function mergeStatic(root, filter = () => true) {
  sharedVC ||= toon(0xffffff, { vertexColors: true });
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
    const mat = o.material;
    const vc = mat.isMeshToonMaterial && !mat.vertexColors && mat.emissive.getHex() === 0;
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal'].includes(name)) g.deleteAttribute(name);
    if (vc) {
      const n = g.attributes.position.count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { col[i * 3] = mat.color.r; col[i * 3 + 1] = mat.color.g; col[i * 3 + 2] = mat.color.b; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    const key = vc ? 'vc' : mat.uuid;
    if (!buckets.has(key)) buckets.set(key, { material: vc ? sharedVC : mat, geos: [], cast: false, receive: false });
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
