import * as THREE from 'three';
import { bus } from '../core/events.js';
import { clamp, rand } from '../core/math.js';
import { terrainHeight, addDent } from './terrain.js';
import { toon } from '../render/toon.js';
import { hash2 } from './noise.js';

const MAX_RUBBLE = 220;
const RUBBLE_LIFE = 45; // seconds a rubble chunk stays before sinking away
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();
const BROKEN = new THREE.Color(0x7a5c44);

let active = null; // the game's instance, for Combat's ray tests

// Ray test against the breakable scenery: the first rock, spire or pillar
// along o + d*t (t up to len), padded by `rad`. Returns { t, piece } or null.
export function sceneryRaycast(o, d, len, rad = 0) {
  return active ? active.raycast(o, d, len, rad) : null;
}

// Breakable scenery. Rocks, spires, mesas, rock fangs, standing stones and
// pillars are registered as "pieces": a vertex range inside a merged static
// mesh (or a whole mesh). When a blast goes off against one:
//   * small blasts chip it: a spray of rubble and dust
//   * a blast strong enough for its size snaps it where it was hit: the
//     part above breaks off and topples away from the blast, then smashes
//     into rubble when it hits the ground; what's left is a jagged stump
//     (shoot it again and it breaks lower)
//   * boulders and anything hit near its base just burst into rubble
// Rubble piles stay for a while, so a big fight leaves the area wrecked.
// Cuts survive the world's chunks streaming out and back in.
export class Destruction {
  constructor(game) {
    this.game = game;
    this.scene = game.renderer.scene;
    this.pieces = [];
    this.byMesh = new Map();
    this.cuts = new Map(); // piece id -> cut height (or -Infinity when gone)
    this.falling = [];
    const rock = new THREE.DodecahedronGeometry(1, 0);
    rock.scale(1, 0.75, 0.9);
    this.rubble = new THREE.InstancedMesh(rock, toon(0xffffff), MAX_RUBBLE);
    this.rubble.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rubble.frustumCulled = false;
    this.rubble.castShadow = true;
    this.scene.add(this.rubble);
    this.chunks = [];
    for (let i = 0; i < MAX_RUBBLE; i++) {
      this.chunks.push({ life: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Vector3(), spin: new THREE.Vector3(), size: 1, rest: false });
      this.rubble.setMatrixAt(i, _m.makeScale(0, 0, 0));
      this.rubble.setColorAt(i, _c.set(0x8a7058));
    }
    this.cursor = 0;
    active = this;
    bus.on('blast:world', (e) => this.blast(e.position, e.energy, e.dir));
  }

  // ---- Registry -------------------------------------------------------------------
  // Every breakable thing under `root`: merged meshes carry userData.pieces
  // (vertex ranges), standalone meshes carry userData.piece (a kind).
  registerTree(root, prefix) {
    root.updateMatrixWorld(true);
    let n = 0;
    root.traverse((o) => {
      if (!o.isMesh) return;
      if (o.userData.pieces?.length || o.userData.piece) this.register(o, `${prefix}:${n++}`);
    });
  }

  register(mesh, prefix) {
    if (this.byMesh.has(mesh)) this.unregister(mesh);
    const geo = mesh.geometry;
    if (geo.index) return; // ranges need non-indexed triangles
    mesh.updateMatrixWorld(true);
    const list = mesh.userData.pieces || [{ start: 0, count: geo.attributes.position.count, kind: mesh.userData.piece }];
    const own = [];
    list.forEach((info, i) => {
      const p = this.makePiece(mesh, info, `${prefix}:${i}`);
      if (!p) return;
      own.push(p);
      this.pieces.push(p);
      const cut = this.cuts.get(p.id);
      if (cut !== undefined) this.applyCut(p, cut);
    });
    this.byMesh.set(mesh, own);
  }

  unregister(mesh) {
    const own = this.byMesh.get(mesh);
    if (!own) return;
    this.byMesh.delete(mesh);
    const set = new Set(own);
    this.pieces = this.pieces.filter((p) => !set.has(p));
  }

  // Footprint of a vertex range, in world space.
  makePiece(mesh, info, id) {
    const pos = mesh.geometry.attributes.position;
    const box = new THREE.Box3();
    const end = info.start + info.count;
    for (let i = info.start; i < end; i++) box.expandByPoint(_v.fromBufferAttribute(pos, i));
    if (box.isEmpty()) return null;
    box.applyMatrix4(mesh.matrixWorld);
    const size = box.getSize(new THREE.Vector3());
    const col = mesh.geometry.attributes.color;
    const color = new THREE.Color();
    if (col) {
      // Average colour of a few vertices in the middle of the piece.
      let r = 0, g = 0, b = 0, k = 0;
      for (let i = info.start; i < end; i += Math.max(3, Math.floor(info.count / 24))) { r += col.getX(i); g += col.getY(i); b += col.getZ(i); k++; }
      color.setRGB(r / k, g / k, b / k);
    } else color.copy(mesh.material.color || _c.set(0x9a8070));
    const radius = Math.max(0.3, Math.max(size.x, size.z) * 0.5);
    return {
      id, mesh, start: info.start, count: info.count, kind: info.kind || 'rock',
      x: (box.min.x + box.max.x) / 2, z: (box.min.z + box.max.z) / 2,
      base: box.min.y, top: box.max.y, origTop: box.max.y, radius, color, gone: false,
    };
  }

  // Radius of the piece at height y (spires taper toward the top).
  radiusAt(p, y) {
    const k = clamp((y - p.base) / Math.max(0.1, p.origTop - p.base), 0, 1);
    return p.radius * (p.kind === 'boulder' ? 0.85 : 0.85 - 0.4 * k);
  }

  visible(p) {
    for (let o = p.mesh; o; o = o.parent) if (!o.visible) return false;
    return true;
  }

  // ---- Queries --------------------------------------------------------------------
  raycast(o, d, len, rad = 0) {
    let best = null;
    for (const p of this.pieces) {
      if (p.gone) continue;
      // Closest approach of the ray to the piece's axis, in the ground plane.
      const ox = p.x - o.x, oz = p.z - o.z;
      const hl = d.x * d.x + d.z * d.z;
      let t = hl > 1e-6 ? (ox * d.x + oz * d.z) / hl : 0;
      const reach = p.radius + rad;
      if (t < -reach || t > len + reach) continue;
      const cx = o.x + d.x * t - p.x, cz = o.z + d.z * t - p.z;
      if (cx * cx + cz * cz > reach * reach) continue;
      if (best && t - reach > best.t) continue;
      if (!this.visible(p)) continue;
      // March across the footprint to find where it enters the solid.
      const t0 = Math.max(0, t - reach), t1 = Math.min(len, t + reach);
      const step = Math.max(0.2, (t1 - t0) / 16);
      for (let s = t0; s <= t1; s += step) {
        _v.copy(o).addScaledVector(d, s);
        if (_v.y < p.base - rad || _v.y > p.top + rad) continue;
        const r = this.radiusAt(p, _v.y) + rad;
        if ((_v.x - p.x) ** 2 + (_v.z - p.z) ** 2 < r * r) {
          if (!best || s < best.t) best = { t: s, piece: p };
          break;
        }
      }
    }
    return best;
  }

  // ---- Damage ---------------------------------------------------------------------
  blast(pos, energy, dir) {
    const R = 0.3 + 1.15 * energy;
    this.dig(pos, energy, R);
    for (const p of this.pieces) {
      if (p.gone) continue;
      const dx = pos.x - p.x, dz = pos.z - p.z;
      const reachH = p.radius + R * 0.9;
      if (dx * dx + dz * dz > reachH * reachH) continue;
      if (pos.y < p.base - R || pos.y > p.top + R * 0.7) continue;
      if (!this.visible(p)) continue;
      const d = Math.max(0, Math.hypot(dx, dz) - this.radiusAt(p, pos.y));
      const power = energy * clamp(1 - d / (R * 0.9 + 0.5), 0, 1);
      if (power <= 0.05) continue;
      // Toughness grows with girth: a boulder breaks to a jab-sized blast,
      // a fat mesa only to the biggest attacks, or to a beam held on it
      // (smaller hits wear it down: enough of them and it gives way too).
      const need = p.kind === 'boulder' ? 0.12 + 0.3 * p.radius : 0.35 * Math.pow(p.radius, 0.9);
      p.wear = (p.wear || 0) + power;
      if (power >= need || p.wear >= need * 2.2) { p.wear = 0; this.breakPiece(p, pos, dir, Math.max(1, power / need)); } else this.chip(p, pos, power);
    }
  }

  // The ground gives too: a blast into a hillside blows a bowl out of the
  // slope; the biggest attacks sink a real crater into flat ground. Not on
  // the platform (it's stone) or on the other planets.
  dig(pos, energy, R) {
    const g = this.game;
    // The Spirit Bomb (energy 10+) digs even next to the platform: the stone
    // platform survives on a column of earth in the middle (see terrain.js).
    if (g.training?.realm || (Math.hypot(pos.x, pos.z) < 12 && energy < 10)) return;
    const h = terrainHeight(pos.x, pos.z);
    if (pos.y - h > R * 0.6) return;
    const s = 1.2;
    const slope = Math.hypot(terrainHeight(pos.x + s, pos.z) - terrainHeight(pos.x - s, pos.z),
      terrainHeight(pos.x, pos.z + s) - terrainHeight(pos.x, pos.z - s)) / (2 * s);
    let r, depth;
    if (energy >= 1.2 && slope > 0.35) { r = R * 1.25; depth = R * 0.6; }
    else if (energy >= 10) { r = R * 0.8; depth = R * 0.32; } // Spirit Bomb: the biggest crater of all
    else if (energy >= 3.5) { r = R * 0.8; depth = R * 0.3; }
    else return;
    const old = addDent(pos.x, pos.z, r, depth);
    g.arena?.refreshGround?.(pos.x, pos.z, r);
    g.world?.refreshArea?.(pos.x, pos.z, r);
    if (old) { g.arena?.refreshGround?.(old.x, old.z, old.r); g.world?.refreshArea?.(old.x, old.z, old.r); }
    // Earth and rock thrown out of the hole.
    const color = new THREE.Color(0x7a6650);
    const n = Math.round(clamp(6 + energy * 5, 6, 26));
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(2, 5 + energy * 1.5);
      this.spawnRubble(_v.set(pos.x + Math.sin(a) * r * 0.3, h + 0.3, pos.z + Math.cos(a) * r * 0.3), color,
        rand(0.1, 0.3) * (0.7 + energy * 0.2), _s.set(Math.sin(a) * sp, rand(3, 6 + energy), Math.cos(a) * sp), RUBBLE_LIFE * rand(0.5, 0.9));
    }
    g.effects.boom?.dust(_v.set(pos.x, h + 0.5, pos.z), 1 + energy * 0.5, 3, 0x9a8670);
  }

  chip(p, pos, power) {
    const n = Math.round(clamp(2 + power * 5, 2, 8));
    const out = _w.set(pos.x - p.x, 0, pos.z - p.z).normalize();
    for (let i = 0; i < n; i++) {
      this.spawnRubble(_v.copy(pos).addScaledVector(out, -0.2), p.color, rand(0.06, 0.16) * (0.6 + power),
        _s.set(out.x * rand(1, 4) + rand(-1.5, 1.5), rand(1.5, 4.5), out.z * rand(1, 4) + rand(-1.5, 1.5)), 6 + rand(0, 8));
    }
    this.game.effects.boom?.dust(pos, 0.5 + power * 0.5, 2, 0xb8a58c);
  }

  breakPiece(p, pos, dir, over) {
    const g = this.game;
    const h = p.top - p.base;
    let cutY = clamp(pos.y, p.base + h * 0.12, p.top - h * 0.08);
    // Hit low, very hard, or a boulder: the whole thing goes.
    const whole = p.kind === 'boulder' || cutY - p.base < h * 0.3 || over > 4;
    if (whole) cutY = p.base + Math.min(h * 0.12, 0.6);
    // Which way it falls: away from the blast (along the shot if it had one).
    const away = _w.set(p.x - pos.x, 0, p.z - pos.z);
    if (dir && (dir.x * dir.x + dir.z * dir.z) > 0.04) away.set(dir.x, 0, dir.z);
    if (away.lengthSq() < 1e-4) away.set(rand(-1, 1), 0, rand(-1, 1));
    away.normalize();
    const top = this.extractAbove(p, cutY);
    this.applyCut(p, cutY);
    this.cuts.set(p.id, cutY);
    const size = Math.max(p.radius, (p.top - cutY) * 0.5);
    if (top && !whole && size > 1.2) {
      // The top breaks off and topples away, then smashes on the ground.
      const mesh = new THREE.Mesh(top.geo, p.mesh.material);
      mesh.position.copy(top.center);
      mesh.castShadow = true;
      this.scene.add(mesh);
      const axis = new THREE.Vector3(away.z, 0, -away.x); // tip over, away from the blast
      this.falling.push({
        mesh, piece: p, vel: away.clone().multiplyScalar(1.5 + Math.min(4, over)).setY(1 + Math.min(3, over * 0.5)),
        axis, spin: 0, spinRate: 0.35 + Math.min(1.2, over * 0.25), extent: top.extent, t: 0,
      });
    } else if (top) {
      top.geo.dispose();
      this.shatter(top.center, top.extent, p.color, away, over);
    }
    p.top = cutY;
    if (cutY - p.base < 0.7) p.gone = true;
    g.audio.explosion?.(clamp(0.25 + size * 0.04, 0.25, 0.9));
    bus.emit('fx:shake', { position: pos.clone(), amount: clamp(0.04 + size * 0.015, 0.04, 0.3) });
    bus.emit('scenery:broken', { kind: p.kind, position: pos.clone() });
  }

  // Copies the triangles above `y` out of the piece as their own geometry,
  // centred on their middle (so it can tumble about it).
  extractAbove(p, y) {
    const geo = p.mesh.geometry;
    const pos = geo.attributes.position, nrm = geo.attributes.normal, col = geo.attributes.color;
    const mw = p.mesh.matrixWorld;
    const P = [], N = [], C = [];
    const nm = new THREE.Matrix3().getNormalMatrix(mw);
    for (let i = p.start; i < p.start + p.count; i += 3) {
      let above = 0;
      for (let k = 0; k < 3; k++) if (_v.fromBufferAttribute(pos, i + k).applyMatrix4(mw).y > y) above++;
      if (above < 2) continue;
      for (let k = 0; k < 3; k++) {
        _v.fromBufferAttribute(pos, i + k).applyMatrix4(mw);
        P.push(_v.x, Math.max(y, _v.y), _v.z);
        if (nrm) { _w.fromBufferAttribute(nrm, i + k).applyMatrix3(nm).normalize(); N.push(_w.x, _w.y, _w.z); }
        if (col) C.push(col.getX(i + k), col.getY(i + k), col.getZ(i + k));
      }
    }
    if (P.length < 9) return null;
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    if (N.length) out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); else out.computeVertexNormals();
    if (C.length) out.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    out.computeBoundingBox();
    const center = out.boundingBox.getCenter(new THREE.Vector3());
    const extent = out.boundingBox.getSize(new THREE.Vector3()).length() * 0.5;
    out.translate(-center.x, -center.y, -center.z);
    out.computeBoundingSphere();
    return { geo: out, center, extent };
  }

  // Shears the piece off at `y`: everything above is flattened onto a jagged
  // broken surface, freshly exposed rock colour. Idempotent.
  applyCut(p, y) {
    const geo = p.mesh.geometry;
    const pos = geo.attributes.position, nrm = geo.attributes.normal, col = geo.attributes.color;
    const mw = p.mesh.matrixWorld;
    const inv = _m.copy(mw).invert();
    const jag = Math.min(0.6, p.radius * 0.18);
    let touched = false;
    for (let i = p.start; i < p.start + p.count; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(mw);
      if (_v.y <= y) continue;
      const ny = y + (hash2(Math.round(_v.x * 2), Math.round(_v.z * 2)) - 0.5) * jag;
      _v.y = Math.min(_v.y, ny);
      _v.applyMatrix4(inv);
      pos.setXYZ(i, _v.x, _v.y, _v.z);
      if (nrm) nrm.setXYZ(i, 0, 1, 0);
      if (col) { _c.setRGB(col.getX(i), col.getY(i), col.getZ(i)).lerp(BROKEN, 0.6); col.setXYZ(i, _c.r, _c.g, _c.b); }
      touched = true;
    }
    if (!touched) return;
    for (const a of [pos, nrm, col]) {
      if (!a) continue;
      a.clearUpdateRanges?.();
      a.addUpdateRange?.(p.start * 3, p.count * 3);
      a.needsUpdate = true;
    }
  }

  // A falling top (or a burst boulder) breaks into rubble.
  shatter(center, extent, color, away, over = 1) {
    const g = this.game;
    const budget = Math.max(0.4, g.effects.particles?.budget ?? 1);
    const n = Math.round(clamp(6 + extent * 4, 6, 46) * budget);
    for (let i = 0; i < n; i++) {
      _v.set(rand(-1, 1), rand(-0.4, 1), rand(-1, 1)).multiplyScalar(extent * 0.6).add(center);
      const sp = rand(1, 3.5) + Math.min(4, over);
      _s.set(rand(-1, 1) * sp + away.x * sp * 0.6, rand(2, 5) + extent * 0.3, rand(-1, 1) * sp + away.z * sp * 0.6);
      this.spawnRubble(_v, color, rand(0.12, 0.35) * Math.min(4, 0.6 + extent * 0.25), _s, RUBBLE_LIFE * rand(0.7, 1));
    }
    const fx = g.effects;
    const boom = fx.boom;
    const ground = _w.set(center.x, terrainHeight(center.x, center.z), center.z);
    for (let i = 0; i < Math.min(5, 1 + Math.round(extent / 2)); i++) {
      boom?.dust(_v.copy(ground).add(_s.set(rand(-1, 1) * extent * 0.5, 0, rand(-1, 1) * extent * 0.5)), 0.8 + extent * 0.35, 3, 0xbca98e);
    }
    fx.ring(ground.clone().setY(ground.y + 0.06), 0xd8c8a8, { maxRadius: 2 + extent * 1.2, duration: 0.7, opacity: 0.45 });
    if (extent > 2.5) fx.crack(ground.clone(), extent * 0.8);
    g.audio.explosion?.(clamp(0.3 + extent * 0.05, 0.3, 1));
    bus.emit('fx:shake', { position: ground.clone(), amount: clamp(0.05 + extent * 0.025, 0.05, 0.35) });
  }

  spawnRubble(pos, color, size, vel, life) {
    const r = this.chunks[this.cursor];
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX_RUBBLE;
    r.pos.copy(pos);
    r.vel.copy(vel);
    r.rot.set(rand(0, 6), rand(0, 6), rand(0, 6));
    r.spin.set(rand(-6, 6), rand(-6, 6), rand(-6, 6));
    r.size = size;
    r.life = life;
    r.max = life;
    r.rest = false;
    _c.copy(color).multiplyScalar(rand(0.8, 1.1));
    this.rubble.setColorAt(i, _c);
    this.rubble.instanceColor.needsUpdate = true;
  }

  // ---- Per frame --------------------------------------------------------------------
  update(dt) {
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const f = this.falling[i];
      f.t += dt;
      f.vel.y -= 14 * dt;
      f.mesh.position.addScaledVector(f.vel, dt);
      f.spinRate += dt * 0.9; // tips over faster and faster
      f.spin = Math.min(Math.PI * 0.6, f.spin + f.spinRate * dt);
      f.mesh.quaternion.setFromAxisAngle(f.axis, f.spin);
      if (Math.random() < 0.3) this.game.effects.boom?.dust(f.mesh.position, 0.4 + f.extent * 0.1, 1, 0xbca98e);
      const p = f.mesh.position;
      const low = p.y - f.extent * (0.35 + 0.4 * Math.sin(f.spin));
      if (low < terrainHeight(p.x, p.z) || f.t > 6 || !this.visible(f.piece)) {
        if (this.visible(f.piece)) this.shatter(p.clone(), f.extent, f.piece.color, _w.copy(f.vel).setY(0).normalize(), 1);
        this.scene.remove(f.mesh);
        f.mesh.geometry.dispose();
        this.falling.splice(i, 1);
      }
    }
    let any = false;
    for (let i = 0; i < MAX_RUBBLE; i++) {
      const r = this.chunks[i];
      if (r.life <= 0) continue;
      any = true;
      r.life -= dt;
      if (!r.rest) {
        r.vel.y -= 18 * dt;
        r.pos.addScaledVector(r.vel, dt);
        r.rot.addScaledVector(r.spin, dt);
        const floor = terrainHeight(r.pos.x, r.pos.z) + r.size * 0.45;
        if (r.pos.y < floor) {
          r.pos.y = floor;
          if (r.vel.y < -3) { r.vel.y *= -0.25; r.vel.x *= 0.5; r.vel.z *= 0.5; r.spin.multiplyScalar(0.5); } else { r.rest = true; r.vel.set(0, 0, 0); }
        }
      }
      // Sinks into the ground at the end of its life.
      const sink = Math.max(0, 1 - r.life / 3);
      _m.compose(_s.set(r.pos.x, r.pos.y - sink * r.size, r.pos.z), _q.setFromEuler(_e.set(r.rot.x, r.rot.y, r.rot.z)), _v.setScalar(r.size));
      this.rubble.setMatrixAt(i, r.life > 0 ? _m : _m.makeScale(0, 0, 0));
    }
    if (any || this.wasActive) this.rubble.instanceMatrix.needsUpdate = true;
    this.wasActive = any;
    // Rubble belongs to whichever place you're in.
    this.rubble.visible = true;
  }

  // Leaving a place (planet trips) clears what's flying and lying around.
  clearDebris() {
    for (const f of this.falling) { this.scene.remove(f.mesh); f.mesh.geometry.dispose(); }
    this.falling = [];
    for (let i = 0; i < MAX_RUBBLE; i++) { this.chunks[i].life = 0; this.rubble.setMatrixAt(i, _m.makeScale(0, 0, 0)); }
    this.rubble.instanceMatrix.needsUpdate = true;
  }
}
