import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bus } from '../core/events.js';
import { toon } from '../render/toon.js';
import { mulberry32, noise2 } from './noise.js';
import { terrainHeight, terrainColor, regionWeights, regionMix, regionAt, REGIONS, HUB_RADIUS, SEA, VOLCANO, WORLD_RADIUS } from './terrain.js';
import { spireGeometry, boulderGeometry } from './Arena.js';

const CS = 160; // chunk size (m)
const VIEW = 3; // chunks in each direction
const SEGS = [32, 32, 16, 8]; // grid resolution by ring distance from the player's chunk
const PROP_RING = 1; // props only on the nearest 3x3 chunks
const SKIRT = 8;
const MAX_CACHE = 90;

const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _e = new THREE.Euler();

// The explorable world around the training valley: terrain streamed in
// chunks around the player (finer near you, coarser in the distance), with
// each region's own props (mesas, pines, palms, lava rocks, ice) baked into
// the chunk so a chunk is one draw call. Also the ocean/lakes, the volcano's
// lava lake, and per-region fog and sky colors with an "Entering …" banner.
export class World {
  constructor(game) {
    this.game = game;
    this.scene = game.renderer.scene;
    this.arena = game.arena;
    this.group = new THREE.Group();
    this.group.name = 'world';
    this.scene.add(this.group);
    this.mat = toon(0xffffff, { vertexColors: true });
    this.chunks = new Map(); // key -> { key, cx, cz, lod, mesh, used }
    this.cache = new Map(); // `${key}:${lod}` -> geometry
    this.center = { cx: NaN, cz: NaN };
    this.queue = [];
    this.props = buildPropTemplates();
    // Ocean and lakes: one big disc that follows you.
    this.water = new THREE.Mesh(new THREE.CircleGeometry(900, 64).rotateX(-Math.PI / 2), toon(0x2f8fd8, { shared: false }));
    this.water.material.emissive = new THREE.Color(0x0a2a55);
    this.water.position.y = SEA;
    this.water.name = 'water';
    this.group.add(this.water);
    // The volcano's lava lake.
    this.lava = new THREE.Mesh(new THREE.CircleGeometry(48, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff7a1a }));
    this.lava.position.set(VOLCANO.x, terrainHeight(VOLCANO.x, VOLCANO.z) + 7, VOLCANO.z);
    this.group.add(this.lava);
    // A slow column of smoke over the crater, visible from far away.
    const plume = [];
    const prnd = mulberry32(77);
    for (let i = 0; i < 9; i++) {
      const s = new THREE.SphereGeometry(14 + i * 3.5, 10, 7);
      s.translate((prnd() - 0.5) * 12 + i * 2.5, 18 + i * 17, (prnd() - 0.5) * 12);
      plume.push(painted(s, i < 2 ? 0x6a5a55 : 0x8a807c, 0.55));
    }
    this.plume = new THREE.Mesh(mergeGeometries(plume), this.mat);
    this.plume.position.copy(this.lava.position);
    this.group.add(this.plume);
    this.region = { index: -1, name: '' };
    this.regionTimer = 0;
    this.pendingRegion = null;
    this.baseFog = this.scene.fog.color.clone();
    this.baseHorizon = this.arena.skyUniforms.horizon.value.clone();
    this.scene.fog.far = 560;
    this.time = 0;
  }

  heightAt(x, z) { return terrainHeight(x, z); }

  // Called every frame with the player's head position.
  update(dt, pos, budgetMs = 6) {
    this.time += dt;
    // The Time Chamber hides the outdoor world (and owns the fog while you're in it).
    this.group.visible = this.arena.group.visible;
    if (!this.group.visible) return;
    this.plume.rotation.y += dt * 0.03;
    const cx = Math.floor(pos.x / CS);
    const cz = Math.floor(pos.z / CS);
    if (cx !== this.center.cx || cz !== this.center.cz) {
      this.center = { cx, cz };
      this.plan();
    }
    // Build queued chunks within a small time budget per frame (nearest first).
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < budgetMs) this.buildNext();
    this.water.position.x = Math.round(pos.x / 50) * 50;
    this.water.position.z = Math.round(pos.z / 50) * 50;
    this.lava.material.color.setRGB(1, 0.42 + 0.08 * Math.sin(this.time * 2.3), 0.08);
    this.arena.follow(pos);
    this.updateAtmosphere(dt, pos);
  }

  plan() {
    const { cx, cz } = this.center;
    const want = new Map();
    for (let dz = -VIEW; dz <= VIEW; dz++) {
      for (let dx = -VIEW; dx <= VIEW; dx++) {
        const x = cx + dx, z = cz + dz;
        // Skip chunks wholly inside the valley (it has its own ground) or past the world's edge.
        const nearX = Math.max(x * CS, Math.min(0, (x + 1) * CS));
        const nearZ = Math.max(z * CS, Math.min(0, (z + 1) * CS));
        if (Math.hypot(nearX, nearZ) > WORLD_RADIUS + 100) continue;
        if (farCorner(x, z) < HUB_RADIUS - 6) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dz));
        want.set(`${x},${z}`, { x, z, lod: d, dist: Math.hypot(dx, dz) });
      }
    }
    // Drop chunks out of range.
    for (const [key, ch] of this.chunks) {
      if (!want.has(key)) { this.group.remove(ch.mesh); this.chunks.delete(key); }
    }
    this.queue = [];
    for (const [key, w] of want) {
      const ch = this.chunks.get(key);
      if (!ch || ch.lod !== w.lod) this.queue.push({ key, ...w });
    }
    this.queue.sort((a, b) => a.dist - b.dist);
  }

  buildNext() {
    const job = this.queue.shift();
    const ck = `${job.key}:${job.lod}`;
    let geo = this.cache.get(ck);
    if (!geo) {
      geo = buildChunk(job.x, job.z, job.lod, this.props);
      this.cache.set(ck, geo);
      if (this.cache.size > MAX_CACHE) {
        for (const [k, g] of this.cache) {
          if (![...this.chunks.values()].some((c) => c.mesh.geometry === g)) { g.dispose(); this.cache.delete(k); }
          if (this.cache.size <= MAX_CACHE * 0.8) break;
        }
      }
    } else {
      this.cache.delete(ck); this.cache.set(ck, geo); // keep recently used at the end
    }
    const old = this.chunks.get(job.key);
    if (old) this.group.remove(old.mesh);
    const mesh = new THREE.Mesh(geo, this.mat);
    mesh.name = 'chunk';
    mesh.receiveShadow = job.lod <= PROP_RING;
    this.group.add(mesh);
    this.chunks.set(job.key, { key: job.key, lod: job.lod, mesh });
  }

  // Fog and horizon shift toward each region's mood; banner when you enter one.
  updateAtmosphere(dt, pos) {
    const r = Math.hypot(pos.x, pos.z);
    const rm = regionMix(r);
    const w = regionWeights(pos.x, pos.z);
    _c.setRGB(0, 0, 0);
    const h = new THREE.Color(0, 0, 0);
    for (let k = 0; k < REGIONS.length; k++) {
      _c.r += ((REGIONS[k].fog >> 16) & 255) / 255 * w[k];
      _c.g += ((REGIONS[k].fog >> 8) & 255) / 255 * w[k];
      _c.b += (REGIONS[k].fog & 255) / 255 * w[k];
      h.r += ((REGIONS[k].horizon >> 16) & 255) / 255 * w[k];
      h.g += ((REGIONS[k].horizon >> 8) & 255) / 255 * w[k];
      h.b += (REGIONS[k].horizon & 255) / 255 * w[k];
    }
    // Colors are given in sRGB; the renderer works in linear.
    _c.convertSRGBToLinear(); h.convertSRGBToLinear();
    this.scene.fog.color.copy(this.baseFog).lerp(_c, rm);
    this.arena.skyUniforms.horizon.value.copy(this.baseHorizon).lerp(h, rm);
    // Region banner (debounced so walking along a border doesn't spam it).
    this.regionTimer -= dt;
    if (this.regionTimer > 0) return;
    this.regionTimer = 0.5;
    const reg = regionAt(pos.x, pos.z);
    if (reg.index === this.region.index) { this.pendingRegion = null; return; }
    if (!this.pendingRegion || this.pendingRegion.index !== reg.index) { this.pendingRegion = reg; return; }
    const first = this.region.name === '';
    this.region = reg;
    this.pendingRegion = null;
    if (!first) {
      this.game.banner?.push({ title: reg.name.toUpperCase(), subtitle: reg.index < 0 ? 'Back to training' : 'Explore!', color: '#ffd23a', duration: 2.5 });
      bus.emit('region:entered', { name: reg.name, index: reg.index });
    }
  }
}

function farCorner(x, z) {
  const fx = Math.max(Math.abs(x * CS), Math.abs((x + 1) * CS));
  const fz = Math.max(Math.abs(z * CS), Math.abs((z + 1) * CS));
  return Math.hypot(fx, fz);
}

// ---- Chunk geometry ----------------------------------------------------------------
function buildChunk(cx, cz, lod, props) {
  const segs = SEGS[Math.min(lod, SEGS.length - 1)];
  const step = CS / segs;
  const x0 = cx * CS, z0 = cz * CS;
  const N = segs + 3; // one extra sample on each side for normals
  const H = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) H[j * N + i] = terrainHeight(x0 + (i - 1) * step, z0 + (j - 1) * step);
  const V = segs + 1;
  const pos = new Float32Array(V * V * 3);
  const nrm = new Float32Array(V * V * 3);
  const col = new Float32Array(V * V * 3);
  for (let j = 0; j < V; j++) {
    for (let i = 0; i < V; i++) {
      const v = j * V + i;
      const x = x0 + i * step, z = z0 + j * step;
      const y = H[(j + 1) * N + i + 1];
      const dx = H[(j + 1) * N + i + 2] - H[(j + 1) * N + i];
      const dz = H[(j + 2) * N + i + 1] - H[j * N + i + 1];
      const nx = -dx, ny = 2 * step, nz = -dz;
      const nl = Math.hypot(nx, ny, nz);
      pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
      nrm[v * 3] = nx / nl; nrm[v * 3 + 1] = ny / nl; nrm[v * 3 + 2] = nz / nl;
      terrainColor(x, z, y, ny / nl, _c);
      col[v * 3] = _c.r; col[v * 3 + 1] = _c.g; col[v * 3 + 2] = _c.b;
    }
  }
  const idx = [];
  const hole = HUB_RADIUS - 4;
  const inHub = (v) => Math.hypot(pos[v * 3], pos[v * 3 + 2]) < hole;
  for (let j = 0; j < segs; j++) {
    for (let i = 0; i < segs; i++) {
      const a = j * V + i, b = a + 1, c = a + V, d = c + 1;
      if (inHub(a) && inHub(b) && inHub(c) && inHub(d)) continue;
      idx.push(a, c, b, b, c, d);
    }
  }
  // Skirts hang down from the edges so neighbours at a different detail level never show a crack.
  const P = Array.from(pos), Nn = Array.from(nrm), Cc = Array.from(col);
  const edge = (list) => {
    for (let k = 0; k < list.length - 1; k++) {
      const a = list[k], b = list[k + 1];
      const base = P.length / 3;
      for (const v of [a, b]) {
        P.push(pos[v * 3], pos[v * 3 + 1] - SKIRT, pos[v * 3 + 2]);
        Nn.push(nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]);
        Cc.push(col[v * 3], col[v * 3 + 1], col[v * 3 + 2]);
      }
      idx.push(a, b, base, b, base + 1, base, a, base, b, b, base, base + 1); // both sides
    }
  };
  const row = (j) => Array.from({ length: V }, (_, i) => j * V + i);
  const column = (i) => Array.from({ length: V }, (_, j) => j * V + i);
  edge(row(0)); edge(row(segs)); edge(column(0)); edge(column(segs));
  let geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
  geo.setIndex(idx);
  if (lod <= PROP_RING) {
    const extra = scatterProps(cx, cz, props);
    if (extra.length) geo = mergeGeometries([geo.toNonIndexed(), ...extra], false) || geo;
  }
  geo.computeBoundingSphere();
  return geo;
}

// ---- Props -------------------------------------------------------------------------
// Each template is non-indexed with position / normal / color, ready to merge.
function painted(geo, hex, shadeBottom = 0.75) {
  const g = (geo.index ? geo.toNonIndexed() : geo);
  for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(name)) g.deleteAttribute(name);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.color) {
    const p = g.attributes.position;
    g.computeBoundingBox();
    const { min, max } = g.boundingBox;
    const col = new Float32Array(p.count * 3);
    const c = new THREE.Color(hex);
    for (let i = 0; i < p.count; i++) {
      const t = (p.getY(i) - min.y) / Math.max(1e-3, max.y - min.y);
      const k = shadeBottom + (1 - shadeBottom) * t;
      col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  return g;
}

function place(g, x, y, z) { return g.translate(x, y, z); }

function buildPropTemplates() {
  const rnd = mulberry32(4242);
  const T = { broadleaf: [], pine: [], snowPine: [], palm: [], spire: [], mesa: [], boulder: [], lavaRock: [], ice: [], bush: [], deadTree: [] };
  for (let v = 0; v < 4; v++) {
    // Broadleaf tree: trunk + three soft crowns.
    const h = 4 + rnd() * 3;
    const parts = [painted(place(new THREE.CylinderGeometry(0.25, 0.42, h, 6), 0, h / 2, 0), 0x7a5232)];
    const greens = [0x3f9a3a, 0x56b444, 0x4aa63e];
    for (let q = 0; q < 3; q++) {
      const r = 1.9 + rnd() * 0.8;
      const a = q * 2.1 + rnd();
      const s = new THREE.SphereGeometry(r, 8, 6);
      s.scale(1, 0.82, 1);
      parts.push(painted(place(s, q ? Math.cos(a) * 1.1 : 0, h + 0.6 + (q ? 0.5 : 0.2), q ? Math.sin(a) * 1.1 : 0), greens[q], 0.55));
    }
    T.broadleaf.push(mergeGeometries(parts));
    // Pine: trunk + three stacked cones. The snowy one has white tips.
    const ph = 6 + rnd() * 4;
    for (const snowy of [false, true]) {
      const pp = [painted(place(new THREE.CylinderGeometry(0.2, 0.3, ph * 0.3, 5), 0, ph * 0.15, 0), 0x6a4630)];
      for (let q = 0; q < 3; q++) {
        const cr = (1.9 - q * 0.45) * (ph / 8);
        const cone = place(new THREE.ConeGeometry(cr, ph * 0.38, 8), 0, ph * (0.32 + q * 0.22), 0);
        const g = painted(cone, q % 2 ? 0x2f6f45 : 0x2a6640, 0.6);
        if (snowy) {
          const p = g.attributes.position, c = g.attributes.color;
          const top = ph * (0.32 + q * 0.22) + ph * 0.08;
          for (let i = 0; i < p.count; i++) if (p.getY(i) > top) c.setXYZ(i, 0.93, 0.96, 1);
        }
        pp.push(g);
      }
      (snowy ? T.snowPine : T.pine).push(mergeGeometries(pp));
    }
    // Palm: a bent trunk and drooping fronds.
    const palm = [];
    const segsN = 5, lean = 0.6 + rnd() * 0.6;
    let top = new THREE.Vector3();
    for (let q = 0; q < segsN; q++) {
      const t0 = q / segsN, t1 = (q + 1) / segsN;
      const p0 = new THREE.Vector3(lean * t0 * t0 * 2, t0 * 7, 0), p1 = new THREE.Vector3(lean * t1 * t1 * 2, t1 * 7, 0);
      const len = p0.distanceTo(p1);
      const cyl = new THREE.CylinderGeometry(0.2 - q * 0.02, 0.24 - q * 0.02, len, 6);
      cyl.translate(0, len / 2, 0);
      cyl.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), p1.clone().sub(p0).normalize()));
      cyl.translate(p0.x, p0.y, p0.z);
      palm.push(painted(cyl, 0x9c7a4c));
      top = p1;
    }
    for (let q = 0; q < 7; q++) {
      const a = (q / 7) * Math.PI * 2;
      const leaf = new THREE.ConeGeometry(0.45, 3.4, 4);
      leaf.scale(1, 1, 0.25);
      leaf.translate(0, 1.7, 0);
      leaf.rotateZ(-1.9);
      leaf.rotateY(a);
      leaf.translate(top.x, top.y, top.z);
      palm.push(painted(leaf, q % 2 ? 0x4fae3e : 0x3e9a35, 0.7));
    }
    T.palm.push(mergeGeometries(palm));
    // Rocks.
    T.spire.push(painted(spireGeometry(2.4 + rnd() * 1.6, 16 + rnd() * 18, 300 + v * 77, { grass: rnd() < 0.5 })));
    T.mesa.push(painted(spireGeometry(9 + rnd() * 5, 14 + rnd() * 10, 900 + v * 51, { grass: true, mesa: true })));
    T.boulder.push(painted(boulderGeometry(1 + rnd() * 1.4, v * 3.3), [0xb08a64, 0x9a7655, 0xa59a8a, 0x8f8a80][v], 0.7));
    const lr = painted(boulderGeometry(1.2 + rnd(), v * 5.1 + 2), 0x3c3330, 0.6);
    const lc = lr.attributes.color, lp = lr.attributes.position;
    for (let i = 0; i < lp.count; i++) if (noise2(lp.getX(i) * 2 + v, lp.getZ(i) * 2) > 0.72) lc.setXYZ(i, 1, 0.42, 0.1);
    T.lavaRock.push(lr);
    const ice = [];
    for (let q = 0; q < 3; q++) {
      const ch = 2.5 + rnd() * 4;
      const cone = new THREE.ConeGeometry(0.5 + rnd() * 0.5, ch, 5);
      cone.translate(0, ch / 2, 0);
      cone.rotateZ((rnd() - 0.5) * 0.6);
      cone.translate((rnd() - 0.5) * 1.5, 0, (rnd() - 0.5) * 1.5);
      ice.push(painted(cone, 0xbfe6ff, 0.65));
    }
    T.ice.push(mergeGeometries(ice));
    const bush = new THREE.SphereGeometry(1.1 + rnd() * 0.5, 7, 5);
    bush.scale(1.3, 0.7, 1.1);
    T.bush.push(painted(place(bush, 0, 0.4, 0), 0x4a9a3c, 0.6));
    // Dead tree for the volcano and wasteland.
    const dt = [painted(place(new THREE.CylinderGeometry(0.12, 0.28, 4, 5), 0, 2, 0), 0x4a3a30)];
    for (let q = 0; q < 3; q++) {
      const br = new THREE.CylinderGeometry(0.05, 0.1, 1.8, 4);
      br.translate(0, 0.9, 0);
      br.rotateZ(0.8 * (q % 2 ? 1 : -1));
      br.rotateY(q * 2.1);
      br.translate(0, 2.2 + q * 0.6, 0);
      dt.push(painted(br, 0x4a3a30));
    }
    T.deadTree.push(mergeGeometries(dt));
  }
  return T;
}

// Which props each region grows: [template, chance per candidate spot, min scale, max scale].
const FLORA = {
  wasteland: [['spire', 0.05, 0.8, 1.4], ['mesa', 0.012, 0.8, 1.3], ['boulder', 0.12, 0.6, 1.6], ['deadTree', 0.03, 0.8, 1.2]],
  volcano: [['lavaRock', 0.18, 0.6, 2.0], ['deadTree', 0.05, 0.8, 1.3], ['spire', 0.02, 0.6, 1.0]],
  coast: [['palm', 0.14, 0.8, 1.3], ['boulder', 0.05, 0.5, 1.2], ['bush', 0.08, 0.7, 1.2]],
  forest: [['broadleaf', 0.42, 0.8, 1.5], ['pine', 0.12, 0.8, 1.3], ['bush', 0.12, 0.7, 1.3], ['boulder', 0.03, 0.5, 1.2]],
  snow: [['snowPine', 0.22, 0.8, 1.4], ['ice', 0.06, 0.8, 1.6], ['boulder', 0.03, 0.6, 1.4]],
};

function scatterProps(cx, cz, T) {
  const out = [];
  const rnd = mulberry32((cx * 73856093) ^ (cz * 19349663));
  const spots = 140;
  for (let i = 0; i < spots; i++) {
    const x = (cx + rnd()) * CS, z = (cz + rnd()) * CS;
    const r = Math.hypot(x, z);
    const roll = rnd(), pickV = rnd(), sc = rnd(), rot = rnd();
    if (r < 175 || r > WORLD_RADIUS - 120) continue;
    const rm = regionMix(r);
    if (rnd() > rm) continue;
    const w = regionWeights(x, z);
    // Pick the region by weight at this spot.
    let pick = rnd(), k = 0;
    while (k < REGIONS.length - 1 && pick > w[k]) { pick -= w[k]; k++; }
    const y = terrainHeight(x, z);
    if (y < SEA + 0.6) continue;
    // Slope: skip steep ground (except rocks, which like it).
    const sl = Math.abs(terrainHeight(x + 2, z) - y) + Math.abs(terrainHeight(x, z + 2) - y);
    let acc = 0;
    for (const [name, chance, s0, s1] of FLORA[REGIONS[k].id]) {
      acc += chance;
      if (roll > acc) continue;
      const rocky = name === 'spire' || name === 'mesa' || name === 'boulder' || name === 'lavaRock';
      if (sl > (rocky ? 3.5 : 1.6)) break;
      if (name === 'palm' && y > SEA + 9) break; // palms stay near the beach
      const list = T[name];
      const g = list[Math.floor(pickV * list.length)].clone();
      const s = s0 + (s1 - s0) * sc;
      _m.compose(_p.set(x, y - (rocky ? 0.6 : 0.1), z), _q.setFromEuler(_e.set(0, rot * Math.PI * 2, 0)), _s.set(s, s, s));
      g.applyMatrix4(_m);
      out.push(g);
      break;
    }
  }
  return out;
}
