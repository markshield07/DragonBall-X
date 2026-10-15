import * as THREE from 'three';
import { bus } from '../core/events.js';
import { clamp } from '../core/math.js';
import { glowMaterial, softCircleTexture } from '../render/toon.js';
import { terrainHeight } from '../world/Arena.js';
import { Explosions } from '../fx/Explosions.js';
import { sceneryRaycast } from '../world/Destruction.js';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _d = new THREE.Vector3();
const DISC_CORE = new THREE.CylinderGeometry(0.72, 0.72, 0.05, 28);
const DISC_SHELL = new THREE.CylinderGeometry(1, 1, 0.09, 28);
const SPIRAL_LEN = 50; // metres of Special Beam Cannon spiral, trimmed to the beam
const SPIRAL_SEGS = 900;

// A Destructo Disc: a thin white-hot disc in a glowing rim, lying flat.
export function makeDisc(color) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(DISC_CORE, new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const shell = new THREE.Mesh(DISC_SHELL, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
  g.add(core, shell);
  return g;
}

// Combat & collisions: target registry, punch contact tests, pooled ki
// projectiles (player and enemy), and damage formulas.
//
// A target is { id, team, sphere(): {center: Vector3, radius}, onPunch(hit), onBlast(hit), active() }.
export class Combat {
  constructor(scene, effects) {
    this.scene = scene;
    this.fx = effects;
    this.targets = new Set();
    this.projectiles = [];
    this.coreGeo = new THREE.SphereGeometry(1, 14, 10);
    this.contact = new Map(); // hand -> current swing state
    this.combo = { count: 0, timer: 0, lastHand: null };
    this.playerBeam = null;
    this.buildBeam();
  }

  // ---- Beams ------------------------------------------------------------------
  buildBeam() {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);
    this.beamGroup = new THREE.Group();
    this.beamOuter = new THREE.Mesh(geo, glowMaterial(0x4fc3ff, 0.6));
    this.beamMid = new THREE.Mesh(geo, glowMaterial(0x4fc3ff, 0.5));
    this.beamCore = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    for (const m of [this.beamOuter, this.beamMid, this.beamCore]) { m.frustumCulled = false; m.renderOrder = 7; this.beamGroup.add(m); }
    this.beamTip = new THREE.Sprite(new THREE.SpriteMaterial({ map: softCircleTexture(), color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.beamTip.renderOrder = 8;
    // Special Beam Cannon: a spiral wound around the beam.
    const pts = [];
    for (let i = 0; i <= 400; i++) { const z = (i / 400) * SPIRAL_LEN; const a = z * (Math.PI * 2 / 0.9); pts.push(new THREE.Vector3(Math.cos(a), Math.sin(a), z)); }
    const helix = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), SPIRAL_SEGS, 0.14, 5, false);
    this.beamSpiral = new THREE.Mesh(helix, glowMaterial(0xc06cff, 0.85));
    this.beamSpiral.frustumCulled = false;
    this.beamSpiral.renderOrder = 7;
    this.beamGroup.add(this.beamSpiral);
    this.beamGroup.visible = false;
    this.beamTip.visible = false;
    this.scene.add(this.beamGroup, this.beamTip);
  }

  // A continuous beam that follows origin()/dir() callbacks, hits the first
  // enemy target along it and deals `dps` in short ticks.
  // `energy` sizes the explosions where it lands (see Explosions.js).
  fireBeam({ origin, dir, duration, dps, radius, color, team = 'player', energy = 2.5, over = 0, spiral = null }) {
    this.playerBeam = { origin, dir, duration, t: 0, dps, radius, color, team, energy, over, tick: 0, boom: 0, o: new THREE.Vector3(), d: new THREE.Vector3(), impact: null };
    this.beamSpiral.visible = spiral != null;
    if (spiral != null) this.beamSpiral.material.color.setHex(spiral);
    this.beamOuter.material.color.setHex(color);
    this.beamMid.material.color.setHex(color);
    this.beamTip.material.color.setHex(color);
    bus.emit('beam:start', { color });
  }

  updateBeam(dt) {
    const b = this.playerBeam;
    if (!b) return;
    b.t += dt;
    const o = b.origin(b.o);
    const d = b.dir(b.d);
    // Where it meets the ground (or a hill), marching along the beam.
    let len = 45;
    let ground = false;
    for (let t = 0.5; t <= 45; t += 0.5) {
      _a.copy(o).addScaledVector(d, t);
      if (_a.y < terrainHeight(_a.x, _a.z)) {
        let lo = t - 0.5;
        let hi = t;
        for (let k = 0; k < 6; k++) {
          const m = (lo + hi) / 2;
          _a.copy(o).addScaledVector(d, m);
          if (_a.y < terrainHeight(_a.x, _a.z)) hi = m; else lo = m;
        }
        len = hi;
        ground = true;
        break;
      }
    }
    // Rocks and spires in the way stop it too (and get blown apart).
    const rock = sceneryRaycast(o, d, len, b.radius * 0.5);
    if (rock && rock.t < len) { len = Math.max(0.3, rock.t); ground = true; }
    // Find the first target the beam reaches.
    let hitT = null;
    for (const t of this.targets) {
      if (t.team !== 'enemy' || (t.active && !t.active())) continue;
      const s = t.sphere();
      const along = _a.subVectors(s.center, o).dot(d);
      if (along < 0 || along > len) continue;
      const perp2 = _a.lengthSq() - along * along;
      const rr = s.radius + b.radius;
      if (perp2 > rr * rr) continue;
      const hitAt = along - Math.sqrt(Math.max(0, rr * rr - perp2)) + b.radius;
      if (hitAt < len) { len = Math.max(0.3, hitAt); hitT = t; ground = false; }
    }
    // Grow in quickly, fade out at the end.
    const k = Math.min(1, b.t / 0.12) * Math.min(1, (b.duration - b.t) / 0.25 + 0.2);
    const reach = Math.min(len, b.t * 60);
    const r = b.radius * k * (1 + Math.sin(b.t * 50) * 0.06);
    this.beamGroup.visible = true;
    // A wide beam starts a little out from the hands so it doesn't fill your eyes.
    const start = Math.min(reach * 0.5, Math.max(0, r - 0.3) * 1.5);
    this.beamGroup.position.copy(o).addScaledVector(d, start);
    this.beamGroup.lookAt(_b.copy(this.beamGroup.position).add(d));
    this.beamOuter.scale.set(r, r, reach - start);
    this.beamMid.scale.set(r * 0.7, r * 0.7, reach - start);
    this.beamCore.scale.set(r * 0.38, r * 0.38, reach - start);
    if (this.beamSpiral.visible) {
      // Starts a couple of metres out, so it winds round the beam ahead of you
      // instead of round your head.
      const s0 = Math.min(2, reach * 0.5);
      this.beamSpiral.position.z = s0;
      this.beamSpiral.scale.set(r * 1.9, r * 1.9, 1);
      this.beamSpiral.rotation.z -= dt * 18;
      const idx = this.beamSpiral.geometry.index.count;
      this.beamSpiral.geometry.setDrawRange(0, Math.min(idx, Math.ceil((Math.max(0, reach - start - s0) / SPIRAL_LEN) * SPIRAL_SEGS) * 5 * 6));
    }
    this.beamTip.visible = true;
    this.beamTip.position.copy(o).addScaledVector(d, reach);
    this.beamTip.scale.setScalar(r * (hitT && reach >= len ? 7 : 3));
    if (Math.random() < 0.8) this.fx.stream(o, b.color, { vy: 0, spread: Math.min(0.3, r * 0.8), size: Math.min(0.25, r * 0.6), life: 0.2 });
    // Where it lands, the beam keeps blowing up: rolling explosions, rocks
    // and a gouge burnt along the line of the beam.
    b.boom -= dt;
    if ((hitT || ground) && reach >= len) {
      const point = _b.copy(o).addScaledVector(d, len);
      if (!b.impact) b.impact = new THREE.Vector3();
      b.impact.copy(point);
      if (b.boom <= 0) {
        b.boom = 0.2;
        // Rolling blasts burn and plough the ground along the beam; only the
        // finale of a big beam digs a crater.
        this.fx.explosion(point, b.color, Math.min(3.2, b.energy * 0.38), d);
      }
    }
    b.tick -= dt;
    if (hitT && reach >= len && b.tick <= 0) {
      b.tick = 0.1;
      const point = _a.copy(o).addScaledVector(d, len).clone();
      const hit = { damage: b.dps * 0.1, dir: d.clone(), point, charged: false, kind: 'beam', power: 0.6 };
      hitT.onBlast?.(hit);
      bus.emit('beam:hit', { ...hit, target: hitT });
      this.fx.burst(point, b.color, 6, 3, 0.07, 0.35);
    }
    if (b.t >= b.duration) this.stopBeam();
  }

  stopBeam(quiet = false) {
    const b = quiet ? null : this.playerBeam;
    // The finale: one huge explosion where the beam was landing (or at its tip in the air).
    if (b) {
      const at = b.impact || _b.copy(b.o).addScaledVector(b.d, Math.min(45, b.t * 60));
      this.fx.explosion(at, b.color, b.energy, b.d);
      this.fx.flash(at, 0xffffff, 2 + b.energy * 2, 0.35);
      // Overcharged: extra shockwaves that roll out across the land.
      if (b.over >= 1) {
        this.fx.ring(at.clone(), 0xffffff, { maxRadius: 6 + 3 * b.energy, duration: 1.0, opacity: 0.8 });
        this.fx.ring(at.clone(), b.color, { maxRadius: 10 + 5 * b.energy, duration: 1.6, opacity: 0.5 });
        if (b.over >= 3) this.fx.flash(at, b.color, 4 + b.energy * 3, 0.6);
      }
      bus.emit('projectile:explode', { position: at.clone(), charged: true, team: b.team, kind: 'beam', energy: b.energy });
    }
    this.playerBeam = null;
    this.beamGroup.visible = false;
    this.beamTip.visible = false;
    bus.emit('beam:end', {});
  }

  addTarget(t) { this.targets.add(t); return () => this.targets.delete(t); }

  // The active enemy closest to where you're aiming (within about 60°), or null.
  nearestEnemy(origin, dir) {
    let best = null, bestScore = Infinity;
    for (const t of this.targets) {
      if (t.team !== 'enemy' || (t.active && !t.active())) continue;
      const to = _a.subVectors(t.sphere().center, origin);
      const d = to.length();
      if (d > 80 || to.dot(dir) < d * 0.5) continue;
      const score = d * (2 - to.dot(dir) / Math.max(d, 1e-3));
      if (score < bestScore) { bestScore = score; best = t; }
    }
    return best;
  }

  // Solar Flare: every enemy within 40 m that can see you is blinded.
  blindEnemies(from, sec) {
    for (const t of this.targets) {
      if (t.team !== 'enemy' || (t.active && !t.active()) || !t.blind) continue;
      if (t.sphere().center.distanceTo(from) < 40) t.blind(sec);
    }
  }
  removeTarget(t) { this.targets.delete(t); }

  // ---- Punches -------------------------------------------------------------
  // Called every frame per hand with its world position and velocity.
  // A "swing" opens when the hand moves faster than the punch threshold and
  // stays open briefly, so a fist that is decelerating on contact (or a low
  // frame rate) still lands. Each swing can hit each target once. The hand's
  // path since last frame is swept, so fast punches can't pass through.
  testPunch(hand, pos, vel, ctx) {
    // Only movement away from the body counts (pulling the fist back doesn't).
    const out = _a.subVectors(pos, ctx.head).normalize();
    const speed = Math.max(0, vel.dot(out)) * 0.6 + vel.length() * 0.4 * (vel.dot(out) > 0 ? 1 : 0);
    let sw = this.contact.get(hand);
    if (!sw) {
      sw = { window: 0, peak: 0, dir: new THREE.Vector3(0, 0, -1), hit: new Set(), prev: pos.clone() };
      this.contact.set(hand, sw);
    }
    if (speed >= ctx.minPunchSpeed) {
      if (sw.window <= 0) { sw.hit.clear(); sw.peak = 0; }
      sw.window = 0.16;
      if (speed > sw.peak) { sw.peak = speed; sw.dir.copy(vel).normalize(); }
    } else {
      sw.window -= ctx.dt;
    }
    if (sw.window > 0) {
      for (const t of this.targets) {
        if (t.team !== 'enemy' || (t.active && !t.active()) || sw.hit.has(t)) continue;
        const s = t.sphere();
        if (!segmentSphere(sw.prev, pos, s.center, s.radius + 0.07)) continue;
        sw.hit.add(t);
        const power = clamp((sw.peak - ctx.minPunchSpeed) / 3.2, 0.05, 1);
        // Combo: alternating or quick successive hits.
        const c = this.combo;
        if (c.timer > 0 && c.lastHand !== hand) c.count = Math.min(c.count + 1, ctx.comboCap);
        else if (c.timer <= 0) c.count = 1;
        c.timer = 0.9;
        c.lastHand = hand;
        const finisher = c.count >= ctx.comboCap && ctx.comboCap >= 3;
        const dmg = ctx.punchDamage(power, c.count, finisher);
        const hit = { hand, power, damage: dmg, dir: sw.dir.clone(), point: pos.clone(), combo: c.count, finisher, kind: 'punch' };
        if (finisher) c.count = 0;
        t.onPunch?.(hit);
        bus.emit('punch:hit', { ...hit, target: t });
      }
    }
    sw.prev.copy(pos);
  }

  // enemyScale < 1 slows enemy projectiles (slow motion); yours stay full speed.
  update(dt0, enemyScale = 1) {
    if (this.combo.timer > 0) this.combo.timer -= dt0;
    this.updateBeam(dt0);
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const dt = p.team === 'enemy' ? dt0 * enemyScale : dt0;
      p.life -= dt;
      p.prev.copy(p.mesh.position);
      if (p.homing && p.homing.target) {
        const want = _a.subVectors(p.homing.target(), p.mesh.position).normalize().multiplyScalar(p.speed);
        p.vel.lerp(want, Math.min(1, dt * p.homing.strength));
      }
      p.mesh.position.addScaledVector(p.vel, dt);
      // A disc flies tilted toward you a little, so you can see it spin.
      if (p.kind === 'disc') { p.mesh.rotation.x = p.team === 'player' ? -0.45 : 0; p.mesh.rotation.y += dt * 30; }
      else p.mesh.rotation.z += dt * 8;
      const pulse = 1 + Math.sin(p.life * 40) * (p.kind === 'disc' ? 0.02 : 0.08);
      p.mesh.scale.setScalar(p.radius * pulse);
      // Trail
      if (Math.random() < 0.7) this.fx.stream(p.mesh.position, p.color, { vy: 0, spread: p.radius * 0.5, size: Math.min(0.32, p.radius * 0.9), life: 0.25 });
      const pp = p.mesh.position;
      let done = p.life <= 0 || pp.y < terrainHeight(pp.x, pp.z);
      if (!done) {
        // Smacks into a rock, spire or pillar on the way.
        const seg = _d.subVectors(pp, p.prev);
        const l = seg.length();
        const rock = l > 1e-4 ? sceneryRaycast(p.prev, seg.divideScalar(l), l, p.radius) : null;
        if (rock) { pp.copy(p.prev).addScaledVector(_d, rock.t); done = true; }
      }
      if (!done) done = this.collideProjectile(p);
      if (!done) this.checkPassed(p);
      if (done) {
        this.explode(p);
        this.removeProjectile(i);
      }
    }
  }

  // ---- Projectiles -----------------------------------------------------------
  fire({ origin, dir, speed, radius, damage, color, team = 'player', charged = false, homing = null, life = 3, owner = null, kind = 'blast' }) {
    let group;
    if (kind === 'disc') group = makeDisc(color);
    else {
      group = new THREE.Group();
      const core = new THREE.Mesh(this.coreGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
      core.scale.setScalar(0.55);
      const shell = new THREE.Mesh(this.coreGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
      group.add(core, shell);
    }
    const shell = group.children[1];
    group.position.copy(origin);
    group.scale.setScalar(radius);
    this.scene.add(group);
    const p = {
      mesh: group, vel: dir.clone().normalize().multiplyScalar(speed), speed, radius, damage, color, team, charged,
      life, homing, owner, kind, prev: origin.clone(), shell,
    };
    this.projectiles.push(p);
    return p;
  }

  // A blast that flies past whoever it was aimed at (dodged, or just missed)
  // doesn't vanish into the sky: it flies on into whatever is behind them (a
  // hill, a rock spire, a mountain) and blows it up, or if nothing is in
  // range, detonates a few metres behind them.
  checkPassed(p) {
    if (p.passed) return;
    for (const t of this.targets) {
      if (t.team === p.team || (t.active && !t.active())) continue;
      const c = t.center ? t.center() : t.sphere?.().center;
      if (!c) continue;
      const to = _a.subVectors(c, p.mesh.position);
      if (to.lengthSq() > 36) continue;
      const along = to.dot(p.vel);
      if (along > 0) { p.approached = true; continue; }
      if (!p.approached) continue;
      p.passed = true;
      const ahead = this.lookAhead(p.mesh.position, p.vel, p.radius, 140);
      p.life = ahead !== null ? ahead / Math.max(1, p.speed) + 0.3 : Math.min(p.life, 2.6 / Math.max(1, p.speed) + 0.06);
      return;
    }
  }

  // Distance to the first ground or scenery along a direction, or null.
  lookAhead(from, vel, rad, max) {
    _d.copy(vel).normalize();
    const rock = sceneryRaycast(from, _d, max, rad);
    const lim = rock ? rock.t : max;
    for (let t = 1; t < lim; t += 2) {
      _b.copy(from).addScaledVector(_d, t);
      if (_b.y < terrainHeight(_b.x, _b.z)) return t;
    }
    return rock ? rock.t : null;
  }

  collideProjectile(p) {
    if (p.team === 'player') {
      for (const t of this.targets) {
        if (t.team !== 'enemy' || (t.active && !t.active()) || p.ignore === t || p.sliced?.has(t)) continue;
        const s = t.sphere();
        if (segmentSphere(p.prev, p.mesh.position, s.center, s.radius + p.radius)) {
          const hit = { damage: p.damage, dir: p.vel.clone().normalize(), point: p.mesh.position.clone(), charged: p.charged, kind: 'blast', sphere: p.kind === 'sphere', power: p.charged ? 1 : 0.4, energy: Explosions.energyOf(p) };
          // A target can dodge at the last instant: the blast keeps flying.
          if (t.onBlast?.(hit) === 'dodged') { p.ignore = t; continue; }
          bus.emit('blast:hit', { ...hit, target: t });
          // A Destructo Disc slices straight through, blowing up as it cuts,
          // and flies on to explode wherever it lands.
          if (p.kind === 'disc') {
            (p.sliced ||= new Set()).add(t);
            this.fx.explosion(hit.point, p.color, hit.energy * 0.6, hit.dir);
            this.fx.burst(hit.point.clone(), 0xffffff, 14, 5, 0.06, 0.4);
            continue;
          }
          return true;
        }
      }
    } else {
      for (const t of this.targets) {
        if (t.team !== 'player') continue;
        const res = t.testProjectile?.(p);
        if (res) return true;
      }
    }
    return false;
  }

  explode(p) {
    const energy = Explosions.energyOf(p);
    // The Spirit Bomb always lands like a meteor: a round crater, never a gouge.
    this.fx.explosion(p.mesh.position, p.color, energy, p.spiritBomb ? null : p.vel);
    this.fx.flash(p.mesh.position, p.color, p.radius * 4 + energy * 0.8, 0.18 + 0.06 * energy);
    if (p.kind === 'sphere') this.fx.ring(p.mesh.position.clone(), p.color, { maxRadius: 6 * p.radius + 2 + 2 * (p.over || 0), duration: 0.7 + 0.15 * (p.over || 0) });
    // Spirit Bomb: a blinding dome of light, shockwaves rolling out across
    // the land and a second blast as the dome collapses.
    if (p.spiritBomb) {
      const at = p.mesh.position.clone();
      const ground = at.clone().setY(terrainHeight(at.x, at.z) + 0.1);
      this.fx.flash(at, 0xffffff, 10 + energy * 3, 1.1);
      this.fx.flash(at, p.color, 14 + energy * 4, 1.8);
      this.fx.ring(ground.clone(), 0xffffff, { maxRadius: 25 + 3 * energy, duration: 1.4, opacity: 0.9 });
      this.fx.ring(ground.clone(), p.color, { maxRadius: 40 + 4 * energy, duration: 2.2, opacity: 0.6 });
      this.fx.ring(ground.clone(), 0xffe0a0, { maxRadius: 60 + 5 * energy, duration: 3.2, opacity: 0.35 });
      setTimeout(() => this.fx.explosion(at, 0xffffff, energy * 0.55, null), 650);
      bus.emit('fx:shake', { position: at, amount: 1.2 });
    }
    // Overcharged spheres and discs: extra shockwaves too.
    if ((p.kind === 'sphere' || p.kind === 'disc') && p.over >= 1) {
      this.fx.ring(p.mesh.position.clone(), 0xffffff, { maxRadius: 4 + 3 * energy, duration: 1.0, opacity: 0.8 });
      this.fx.flash(p.mesh.position, 0xffffff, 3 + energy * 2, 0.45);
    }
    // Overcharged ki blast: a second, bigger white shockwave and a long flash.
    if (p.kind === 'overcharged') {
      this.fx.ring(p.mesh.position.clone(), 0xffffff, { maxRadius: 4 + 3 * energy, duration: 0.9, opacity: 0.8 });
      this.fx.ring(p.mesh.position.clone(), p.color, { maxRadius: 7 + 5 * energy, duration: 1.4, opacity: 0.5 });
      this.fx.flash(p.mesh.position, 0xffffff, 3 + energy * 2, 0.45);
    }
    bus.emit('projectile:explode', { position: p.mesh.position.clone(), charged: p.charged, team: p.team, kind: p.kind, energy });
  }

  removeProjectile(i) {
    const p = this.projectiles[i];
    this.scene.remove(p.mesh);
    p.mesh.children.forEach((c) => c.material.dispose());
    this.projectiles.splice(i, 1);
  }

  clearProjectiles(team = null) {
    if (!team || team === 'player') { if (this.playerBeam) this.stopBeam(true); }
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      if (!team || this.projectiles[i].team === team) this.removeProjectile(i);
    }
  }
}

// Swept sphere test so fast projectiles can't tunnel through targets.
export function segmentSphere(a, b, c, r) {
  const ab = _a.subVectors(b, a);
  const ac = _b.subVectors(c, a);
  const len2 = ab.lengthSq();
  const t = len2 > 0 ? clamp(ac.dot(ab) / len2, 0, 1) : 0;
  const px = a.x + ab.x * t - c.x;
  const py = a.y + ab.y * t - c.y;
  const pz = a.z + ab.z * t - c.z;
  return px * px + py * py + pz * pz <= r * r;
}

