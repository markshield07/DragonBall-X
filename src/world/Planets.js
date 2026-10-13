import * as THREE from 'three';
import { toon, addOutline, glowMaterial } from '../render/toon.js';
import { noise2, fbm, mulberry32 } from './noise.js';

// Two planets reached through the portal on the training grounds. Each is
// swapped in for the outdoor world like the Time Chamber (the arena and the
// streamed terrain are hidden), owns the fog while you're there, supplies the
// ground height, and has a glowing return portal behind where you arrive.
//
//   KaliPlanet  King Kali's place: a tiny round planet floating above the
//               golden clouds of the Other World, with a domed house, a tree,
//               an old car, a winding road in the distance and King Kali
//               himself. Training here counts double (heavy gravity).
//   ZuiPlanet   Zui: a violet-skied battle planet ringed by crystal spires and
//               broken pillars, where crowds of fighters come at you
//               (see src/training/Horde.js).

const PORTAL_Z = 10;

// Sky dome from a gradient (top, horizon, below) with optional cloud sea.
function skyDome({ top, horizon, below, clouds = 0, cloudColor = 0xffffff }) {
  return new THREE.Mesh(new THREE.SphereGeometry(320, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(top) }, uHor: { value: new THREE.Color(horizon) }, uBel: { value: new THREE.Color(below) },
      uCloud: { value: clouds }, uCloudCol: { value: new THREE.Color(cloudColor) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 uTop, uHor, uBel, uCloudCol; uniform float uCloud; varying vec3 vP;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main(){ vec3 d = normalize(vP);
        vec3 c = d.y > 0.0 ? mix(uHor, uTop, smoothstep(0.0, 0.6, d.y)) : mix(uHor, uBel, smoothstep(0.0, 0.25, -d.y));
        if (uCloud > 0.0) {
          // Puffy cloud sea below (and a few streaks above) the horizon.
          vec2 q = d.xz / (abs(d.y) + 0.12) * 2.2;
          float k = n(q) * 0.6 + n(q * 2.3) * 0.3 + n(q * 5.1) * 0.1;
          float below = smoothstep(0.02, -0.08, d.y);
          float puff = smoothstep(0.42, 0.62, k);
          c = mix(c, uCloudCol, below * (0.55 + 0.45 * puff) * uCloud);
          c = mix(c, uCloudCol * 0.92, below * (1.0 - puff) * 0.25 * uCloud);
          float streak = smoothstep(0.55, 0.75, k) * smoothstep(0.02, 0.12, d.y) * smoothstep(0.45, 0.15, d.y);
          c = mix(c, vec3(1.0), streak * 0.35 * uCloud);
        }
        gl_FragColor = vec4(c, 1.0); }`,
  }));
}

// Glowing ring you walk into to go home.
function returnPortal(group, color, ground) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.16, 10, 40), toon(0x8a7a6a));
  ring.position.y = 1.7;
  addOutline(ring, 0.05);
  const mat = glowMaterial(color, 0.5);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.42, 36), mat);
  disc.position.y = 1.7;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.5, 0.3, 20), toon(0x6e6258));
  base.position.y = 0.05;
  g.add(ring, disc, base);
  g.position.set(0, ground(0, PORTAL_Z), PORTAL_Z);
  g.rotation.y = Math.PI; // faces the arrival point
  group.add(g);
  return { group: g, mat };
}

class Planet {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.time = 0;
    this.portalPos = new THREE.Vector3(0, 0, PORTAL_Z);
  }

  setActive(v, arena) {
    this.group.visible = v;
    if (v) arena.group.visible = false;
    if (!this.savedFog) this.savedFog = { color: this.scene.fog.color.clone(), near: this.scene.fog.near, far: this.scene.fog.far };
    if (v) {
      this.scene.fog.color.setHex(this.fog.color);
      this.scene.fog.near = this.fog.near;
      this.scene.fog.far = this.fog.far;
    } else if (this.wasActive) {
      this.scene.fog.color.copy(this.savedFog.color);
      this.scene.fog.near = this.savedFog.near;
      this.scene.fog.far = this.savedFog.far;
      arena.group.visible = true;
    }
    this.wasActive = v;
  }

  update(dt) {
    if (!this.group.visible) return;
    this.time += dt;
    if (this.portal) this.portal.mat.opacity = 0.4 + Math.sin(this.time * 3) * 0.12;
  }
}

// ---------------------------------------------------------------------------
const KALI_R = 30; // planet radius: tiny, so the horizon curves away close by

export class KaliPlanet extends Planet {
  constructor(scene) {
    super(scene);
    this.group.name = 'kaliPlanet';
    this.id = 'kali';
    this.radius = 16;
    this.flyRadius = 40;
    this.fog = { color: 0xffe2a8, near: 70, far: 300 };
    this.height = (x, z) => {
      const r = Math.hypot(x, z);
      const rr = Math.min(r, KALI_R * 0.995);
      return Math.sqrt(KALI_R * KALI_R - rr * rr) - KALI_R;
    };
    const H = this.height;
    const at = (obj, x, z, y = 0) => { obj.position.set(x, H(x, z) + y, z); return obj; };
    // Tilt something so it stands straight out of the curved surface.
    const upright = (obj, x, z) => { obj.rotation.set(Math.atan2(z, KALI_R) * 0.9, 0, -Math.atan2(x, KALI_R) * 0.9, 'XZY'); return obj; };

    this.group.add(skyDome({ top: 0xf0b860, horizon: 0xffe6a0, below: 0xfff1c4, clouds: 1, cloudColor: 0xfff6d8 }));

    // The planet itself.
    const planet = new THREE.Mesh(new THREE.SphereGeometry(KALI_R, 64, 40), toon(0x79c24e));
    planet.position.y = -KALI_R;
    this.group.add(planet);
    // A road looping round the top of the planet.
    const road = new THREE.RingGeometry(10.2, 12, 72, 1);
    road.rotateX(-Math.PI / 2);
    const rp = road.attributes.position;
    for (let i = 0; i < rp.count; i++) rp.setY(i, H(rp.getX(i), rp.getZ(i)) + 0.03);
    road.computeVertexNormals();
    this.group.add(new THREE.Mesh(road, toon(0xd9c08a)));

    // Domed house: white walls, a red dome roof, round windows, a door.
    const house = new THREE.Group();
    const walls = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.5, 2.6, 32), toon(0xf6efe0));
    walls.position.y = 1.3;
    const roof = new THREE.Mesh(new THREE.SphereGeometry(3.6, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), toon(0xcc2f2a));
    roof.position.y = 2.55;
    roof.scale.y = 0.75;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(3.55, 0.14, 8, 40), toon(0xf6efe0));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 2.6;
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.9, 0.2), toon(0x6a4630));
    door.position.set(0, 0.95, 3.42);
    house.add(walls, roof, rim, door);
    for (const a of [-0.75, 0.75]) {
      const win = new THREE.Mesh(new THREE.CircleGeometry(0.42, 20), toon(0x5a8fd0));
      win.position.set(Math.sin(a) * 3.47, 1.6, Math.cos(a) * 3.47);
      win.rotation.y = a;
      house.add(win);
    }
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 6), toon(0x444444));
    antenna.position.set(1.2, 4.6, 0.6);
    house.add(antenna);
    for (const m of [walls, roof]) addOutline(m, 0.02);
    at(house, -6, -9);
    upright(house, -6, -9);
    house.rotation.y = 0.55;
    this.group.add(house);

    // One big round tree.
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 4, 10), toon(0x7a5232));
    trunk.position.y = 2;
    tree.add(trunk);
    for (const [x, y, z, r] of [[0, 5, 0, 2.4], [1.4, 4.3, 0.6, 1.6], [-1.3, 4.5, -0.4, 1.7], [0.2, 6.3, 0.3, 1.5]]) {
      const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), toon(0x3f9a3a, { flat: true }));
      leaf.position.set(x, y, z);
      tree.add(leaf);
      addOutline(leaf, 0.03);
    }
    at(tree, 8, -5);
    upright(tree, 8, -5);
    this.group.add(tree);

    // An old round-topped red car parked by the road.
    const car = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 2.8), toon(0xc8322a));
    body.position.y = 0.6;
    const cab = new THREE.Mesh(new THREE.SphereGeometry(0.85, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), toon(0xc8322a));
    cab.position.set(0, 0.9, -0.2);
    cab.scale.set(0.95, 0.8, 1.1);
    car.add(body, cab);
    for (const [x, z] of [[-0.8, -0.95], [0.8, -0.95], [-0.8, 0.95], [0.8, 0.95]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.22, 14), toon(0x222222));
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 0.34, z);
      car.add(w);
    }
    addOutline(body, 0.03);
    at(car, 9.5, 5);
    upright(car, 9.5, 5);
    car.rotation.y = -0.4;
    this.group.add(car);

    // The winding road through the clouds in the distance.
    const pts = [];
    for (let i = 0; i <= 80; i++) {
      const t = i / 80;
      pts.push(new THREE.Vector3(-220 + 440 * t, -38 + Math.sin(t * 7) * 6, -170 + Math.sin(t * 11) * 40 + t * 60));
    }
    const way = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 240, 1.6, 6), toon(0xd8b25a));
    way.scale.y = 0.5;
    this.group.add(way);

    this.npc = buildKali();
    at(this.npc, -2.6, -5.2);
    this.group.add(this.npc);
    this.portal = returnPortal(this.group, 0xffd36a, H);
    this.portalPos.copy(this.portal.group.position);
    this.talkT = 0;
    this.talkIdx = 0;
  }

  // King Kali bobs, turns to face you and talks when you come close.
  updateNpc(dt, head, say) {
    const n = this.npc;
    const d = Math.hypot(head.x - n.position.x, head.z - n.position.z);
    const want = Math.atan2(head.x - n.position.x, head.z - n.position.z);
    let dy = want - n.rotation.y;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    n.rotation.y += dy * Math.min(1, dt * 3);
    n.userData.body.position.y = Math.abs(Math.sin(this.time * 2.2)) * 0.05;
    for (const a of n.userData.antennae) a.rotation.z = a.userData.base + Math.sin(this.time * 3 + a.userData.base * 4) * 0.12;
    this.talkT -= dt;
    if (d < 5 && this.talkT <= 0) {
      say(KALI_LINES[this.talkIdx % KALI_LINES.length]);
      this.talkIdx += 1;
      this.talkT = 6;
    }
  }
}

const KALI_LINES = [
  'King Kali: Welcome to my little planet! Gravity here is ten times heavier.',
  'King Kali: Every bit of training here counts double. Get to it!',
  'King Kali: Careful near the edge. This planet is smaller than it looks!',
  'King Kali: When you\'re ready, step back through the portal to go home.',
];

// King Kali: a plump, blue-skinned mentor in a dark robe, round sunglasses,
// a white moustache and two antennae.
function buildKali() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const blue = toon(0x3d6fd6);
  const robe = toon(0x1f2238);
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.52, 20, 14), robe);
  torso.scale.set(1, 1.1, 0.95);
  torso.position.y = 0.75;
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 0.5, 18), robe);
  skirt.position.y = 0.3;
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 6, 24), toon(0xd9a92e));
  belt.rotation.x = Math.PI / 2;
  belt.position.y = 0.55;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 14), blue);
  head.position.y = 1.45;
  head.scale.set(1.05, 0.95, 1);
  const emblem = new THREE.Mesh(new THREE.CircleGeometry(0.12, 16), toon(0xf4f1ea));
  emblem.position.set(0, 0.85, 0.5);
  body.add(torso, skirt, belt, head, emblem);
  // Sunglasses
  for (const s of [-1, 1]) {
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.1, 16), toon(0x111111));
    lens.position.set(s * 0.12, 1.5, 0.315);
    body.add(lens);
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.02), toon(0x111111));
  bridge.position.set(0, 1.51, 0.32);
  body.add(bridge);
  // Moustache
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.14, 3, 6), toon(0xf4f4f4));
    m.rotation.z = s * 1.2;
    m.position.set(s * 0.09, 1.35, 0.31);
    body.add(m);
  }
  // Antennae
  const antennae = [];
  for (const s of [-1, 1]) {
    const a = new THREE.Group();
    a.position.set(s * 0.14, 1.72, 0);
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.36, 6), toon(0x111111));
    stalk.position.y = 0.18;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), toon(0x111111));
    tip.position.y = 0.37;
    a.add(stalk, tip);
    a.userData.base = -s * 0.35;
    a.rotation.z = a.userData.base;
    body.add(a);
    antennae.push(a);
  }
  // Mitten hands
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.3, 4, 8), robe);
    arm.position.set(s * 0.55, 0.8, 0.05);
    arm.rotation.z = s * 0.5;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), blue);
    hand.position.set(s * 0.68, 0.58, 0.12);
    body.add(arm, hand);
  }
  for (const m of [torso, head, skirt]) addOutline(m, 0.04);
  g.userData.body = body;
  g.userData.antennae = antennae;
  g.scale.setScalar(1.05);
  return g;
}

// ---------------------------------------------------------------------------
export class ZuiPlanet extends Planet {
  constructor(scene) {
    super(scene);
    this.group.name = 'zuiPlanet';
    this.id = 'zui';
    this.radius = 34;
    this.flyRadius = 60;
    this.fog = { color: 0xb58ac8, near: 60, far: 260 };
    // Flat battleground in the middle, broken hills rising outside it.
    this.height = (x, z) => {
      const r = Math.hypot(x, z);
      if (r < 30) return 0;
      const k = Math.min(1, (r - 30) / 40);
      return k * k * (8 + 14 * fbm(x * 0.02, z * 0.02, 3)) + k * 3 * noise2(x * 0.1, z * 0.1);
    };
    const H = this.height;
    const rand = mulberry32(4242);
    this.group.add(skyDome({ top: 0x2a1b55, horizon: 0xe08ab8, below: 0x6a4a7a }));

    // Ground with rocky colour variation.
    const ground = new THREE.Mesh(this.ringGround(H), toon(0xffffff, { vertexColors: true }));
    this.group.add(ground);

    // Arena edge: a ring of broken stone pillars.
    const stone = toon(0xb9a6b8, { flat: true });
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      if (Math.abs(Math.atan2(Math.sin(a - Math.PI), Math.cos(a - Math.PI))) < 0.2) continue; // gap behind you for the portal
      const h = 3 + rand() * 4 * (i % 3 === 0 ? 0.4 : 1);
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.85, h, 8), stone);
      const x = Math.sin(a) * 31, z = -Math.cos(a) * 31;
      p.position.set(x, H(x, z) + h / 2 - 0.1, z);
      p.rotation.set((rand() - 0.5) * 0.12, rand() * 3, (rand() - 0.5) * 0.12);
      addOutline(p, 0.03);
      this.group.add(p);
    }
    // Crystal spires out in the hills.
    const crystal = new THREE.MeshToonMaterial({ color: 0x7ae8ff, emissive: 0x2a9cc8, emissiveIntensity: 0.6 });
    for (let i = 0; i < 40; i++) {
      const a = rand() * Math.PI * 2;
      const r = 40 + rand() * 100;
      const x = Math.sin(a) * r, z = -Math.cos(a) * r;
      const h = 4 + rand() * 14;
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.8 + h * 0.12, h, 6), i % 4 === 0 ? crystal : toon(0x6e5878, { flat: true }));
      m.position.set(x, H(x, z) + h * 0.45, z);
      m.rotation.set((rand() - 0.5) * 0.4, rand() * 3, (rand() - 0.5) * 0.4);
      this.group.add(m);
    }
    // Ringed gas giant and two moons in the sky.
    const giant = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.SphereGeometry(26, 32, 20), new THREE.MeshBasicMaterial({ color: 0xf0a060, fog: false }));
    const rings = new THREE.Mesh(new THREE.RingGeometry(34, 50, 64), new THREE.MeshBasicMaterial({ color: 0xffd8a8, transparent: true, opacity: 0.55, side: THREE.DoubleSide, fog: false }));
    rings.rotation.x = Math.PI / 2 - 0.35;
    giant.add(ball, rings);
    giant.position.set(-120, 110, -230);
    giant.rotation.z = 0.3;
    this.group.add(giant);
    for (const [x, y, z, r, col] of [[160, 90, -200, 8, 0xe6e0ff], [90, 150, -260, 5, 0xffd0e8]]) {
      const moon = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), new THREE.MeshBasicMaterial({ color: col, fog: false }));
      moon.position.set(x, y, z);
      this.group.add(moon);
    }
    this.portal = returnPortal(this.group, 0xb06aff, H);
    this.portalPos.copy(this.portal.group.position);
  }

  // Ground mesh in rings (fine near the middle, coarse far out).
  ringGround(H) {
    const radii = [];
    for (let r = 0; r <= 30; r += 3) radii.push(r);
    for (let r = 36; r <= 160; r += 8) radii.push(r);
    const seg = 72;
    const posArr = [];
    const colArr = [];
    const idx = [];
    const c = new THREE.Color();
    const a1 = new THREE.Color(0x8a6f8a), a2 = new THREE.Color(0x5e4a66), mid = new THREE.Color(0xa8909a);
    radii.forEach((r) => {
      for (let i = 0; i < seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        const x = Math.sin(a) * r, z = -Math.cos(a) * r;
        posArr.push(x, H(x, z), z);
        const n = noise2(x * 0.08, z * 0.08);
        c.copy(a1).lerp(a2, n * 0.8);
        if (r < 30) c.lerp(mid, 0.35);
        colArr.push(c.r, c.g, c.b);
      }
    });
    for (let ri = 0; ri < radii.length - 1; ri++) {
      for (let i = 0; i < seg; i++) {
        const a = ri * seg + i, b = ri * seg + ((i + 1) % seg), cc = (ri + 1) * seg + i, d = (ri + 1) * seg + ((i + 1) % seg);
        idx.push(a, b, cc, b, d, cc);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colArr, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }
}
