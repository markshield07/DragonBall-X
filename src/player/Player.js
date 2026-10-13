import * as THREE from 'three';
import { bus } from '../core/events.js';
import { clamp, damp } from '../core/math.js';
import { FORMS } from '../progression/forms.js';
import { ATTACKS } from '../progression/attacks.js';
import { segmentSphere, makeDisc } from '../combat/Combat.js';
import { terrainHeight } from '../world/Arena.js';
import { WORLD_RADIUS } from '../world/terrain.js';
import { glowMaterial } from '../render/toon.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const SEATED_OFFSET = 0.45;
const ARENA_RADIUS = 30; // walking range during a boss fight
const FLIGHT_RADIUS = 90; // flying range during a boss fight
const MAX_ALTITUDE = 300;

// The player: resources (health / ki / stamina), locomotion & comfort,
// punching, ki attacks, blocking, and how damage is taken. Reads the unified
// input state, so VR and desktop share every rule here.
// Charging: every ki move can be held to power it up. It reaches full charge
// after its chargeTime, then keeps growing (OVERCHARGE_STAGES more levels,
// burning ki) until MAX_CHARGE_TIME seconds after you started holding.
const MAX_CHARGE_TIME = 9;
const OVERCHARGE_STAGES = 4;
const OVERCHARGE_KI = 34; // ki spent growing a move from full to maximum
// A quick Basic Ki Blast fires on the press; keep holding this long and it starts to charge.
const QUICK_HOLD = 0.3;
const QUICK_CHARGE_TIME = 0.9;
// Kaio-ken: tap for x2, hold to push it higher. Each level hits harder, moves
// faster and burns stamina faster.
export const KAIOKEN_LEVELS = [
  { x: 2, at: 0, ki: 30, dmg: 1.4, kiDmg: 1.25, spd: 1.15, drain: 6 },
  { x: 3, at: 2, ki: 34, dmg: 1.6, kiDmg: 1.35, spd: 1.2, drain: 9 },
  { x: 4, at: 4, ki: 38, dmg: 1.8, kiDmg: 1.45, spd: 1.25, drain: 12 },
  { x: 10, at: 6.5, ki: 46, dmg: 2.3, kiDmg: 1.7, spd: 1.35, drain: 14 },
  { x: 20, at: 9, ki: 55, dmg: 3, kiDmg: 2, spd: 1.5, drain: 18 },
];

export class Player {
  constructor(game) {
    this.game = game;
    this.rig = game.renderer.rig;
    this.camera = game.renderer.camera;
    this.health = 100;
    this.ki = 60;
    this.stamina = 60;
    this.form = 'base';
    this.blocking = false;
    this.alive = true;
    this.invuln = 0;
    this.selectedAttack = 0; // index into equipped
    this.fire = { left: { held: false, time: 0, cooldown: 0 }, right: { held: false, time: 0, cooldown: 0 } };
    this.snapReady = true;
    this.teleport = { active: false, valid: false, point: new THREE.Vector3() };
    this.moving = 0; // 0..1, drives comfort vignette
    this.exhausted = false;
    this.lastHurt = 0;
    this.headWorld = new THREE.Vector3();
    this.headForward = new THREE.Vector3();
    this.altitude = 0; // feet height above y = 0 (terrain or flight)
    this.flying = false;
    this.kaioken = 0; // seconds of Kaio-ken left
    this.kaiokenCooldown = 0;
    this.beam = { charging: false, charge: 0, hand: 'right', both: false, origin: new THREE.Vector3(), cooldown: 0 };
    this.chargeOrb = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), glowMaterial(0x4fc3ff, 0.85));
    this.chargeOrbCore = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.chargeOrb.add(this.chargeOrbCore);
    this.chargeOrb.visible = false;
    this.chargeOrb.renderOrder = 7;
    game.renderer.scene.add(this.chargeOrb);
    // Destructo Disc held above your hand.
    this.chargeDisc = makeDisc(0xfff3a0);
    this.chargeDisc.visible = false;
    this.chargeDisc.renderOrder = 7;
    game.renderer.scene.add(this.chargeDisc);
    this.buildTeleportMarker();

    // As a combat target for enemy projectiles / melee.
    this.target = {
      id: 'player',
      team: 'player',
      center: () => this.headWorld,
      testProjectile: (p) => this.testProjectile(p),
    };
    game.combat.addTarget(this.target);
  }

  get progress() { return this.game.progress; }
  get settings() { return this.game.settings; }

  resetResources() {
    this.health = this.progress.maxHealth();
    this.ki = this.progress.maxKi() * 0.6;
    this.stamina = this.progress.maxStamina();
    this.alive = true;
    this.exhausted = false;
    this.kaioken = 0;
    this.kaiokenCooldown = 0;
  }

  // ---- Flight -------------------------------------------------------------------
  groundY() { return this.altitude; }

  // Fly button: take off (rise to hover height) or land.
  toggleFlight() {
    if (!this.flying) {
      this.flying = true;
      this.takeoff = 1.6;
      bus.emit('flight:changed', { flying: true });
    } else this.land();
  }

  land() {
    if (!this.flying) return;
    this.flying = false;
    bus.emit('flight:changed', { flying: false });
  }

  // Combined multipliers from the form and Kaio-ken.
  damageMult() { return FORMS[this.form].damage * (this.kaioken > 0 ? this.kaiokenLevel().dmg : 1); }
  kiDamageMult() { return FORMS[this.form].kiDamage * (this.kaioken > 0 ? this.kaiokenLevel().kiDmg : 1); }
  speedMult() { return FORMS[this.form].speed * (this.kaioken > 0 ? this.kaiokenLevel().spd : 1); }
  // Kaio-ken multiplies your Power Level (x2 .. x20) while it lasts.
  kaiokenX() { return this.kaioken > 0 ? this.kaiokenLevel().x : 1; }

  buildTeleportMarker() {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.32, 24), new THREE.MeshBasicMaterial({ color: 0x4cc3ff, transparent: true, opacity: 0.85 }));
    ring.rotation.x = -Math.PI / 2;
    g.add(ring);
    this.teleportMarker = g;
    this.teleportMarker.visible = false;
    const pts = new Float32Array(32 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    this.teleportArc = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x4cc3ff }));
    this.teleportArc.frustumCulled = false;
    this.teleportArc.visible = false;
    this.game.renderer.scene.add(this.teleportMarker, this.teleportArc);
  }

  // Seated mode raises the virtual eye height so seated players stand tall.
  applySeated() {
    const xr = this.game.isXR;
    this.rig.position.y = (xr && this.settings.seated ? SEATED_OFFSET : 0) + this.altitude;
    if (!xr) this.camera.position.y = 1.65;
  }

  updateHead() {
    this.camera.getWorldPosition(this.headWorld);
    this.camera.getWorldDirection(this.headForward);
  }

  // Yaw-only forward vector (for movement and placing menus).
  flatForward(out = new THREE.Vector3()) {
    out.copy(this.headForward);
    out.y = 0;
    if (out.lengthSq() < 1e-4) out.set(0, 0, -1);
    return out.normalize();
  }

  // ---- Locomotion -----------------------------------------------------------
  updateMovement(dt, input, allowMove) {
    const L = input.hands.left;
    const R = input.hands.right;
    const s = this.settings;
    this.moving = damp(this.moving, 0, 6, dt);
    if (!allowMove) { this.teleport.active = false; this.teleportMarker.visible = this.teleportArc.visible = false; return; }

    // Turning (VR only; desktop uses the mouse)
    if (this.game.isXR) {
      const tx = R.stick.x;
      if (s.turnMode === 'snap') {
        if (Math.abs(tx) > 0.7 && this.snapReady) {
          this.rotateRigAroundHead(-Math.sign(tx) * THREE.MathUtils.degToRad(s.snapAngle));
          this.snapReady = false;
        } else if (Math.abs(tx) < 0.3) this.snapReady = true;
      } else if (Math.abs(tx) > 0.15) {
        this.rotateRigAroundHead(-tx * THREE.MathUtils.degToRad(s.smoothTurnSpeed) * dt);
        this.moving = Math.max(this.moving, Math.abs(tx));
      }
    }

    const stick = L.stick;
    const mag = Math.hypot(stick.x, stick.y);
    if (this.flying) {
      this.updateFlight(dt, input, mag);
      return;
    }
    if (this.game.isXR && s.moveMode === 'teleport') {
      this.updateTeleport(dt, input, mag);
      return;
    }
    if (mag >= 0.15) {
      // Exhaustion and heavy simulated gravity slow the avatar (in-game only).
      const g = this.game.training?.activeGravity || 1;
      const speed = 3.0 * this.speedMult() * (this.exhausted ? 0.6 : 1) * this.progress.speedMult() / (1 + 0.25 * Math.log10(g));
      const fwd = this.flatForward(_v);
      const right = _w.crossVectors(fwd, UP).normalize();
      const move = new THREE.Vector3()
        .addScaledVector(right, stick.x)
        .addScaledVector(fwd, -stick.y);
      if (move.lengthSq() > 1) move.normalize();
      this.moveRig(move.multiplyScalar(speed * dt), this.roamRadius(ARENA_RADIUS));
      this.moving = Math.max(this.moving, Math.min(1, mag));
    }
    // Walk on the ground (flat on the training grounds, hills beyond).
    this.updateHead();
    this.setAltitude(damp(this.altitude, terrainHeight(this.headWorld.x, this.headWorld.z), 10, dt));
  }

  // Flying: left stick moves where you look (including up/down), right stick
  // up/down (desktop: R / V) rises and descends. Touching the ground lands.
  updateFlight(dt, input, mag) {
    const R = input.hands.right;
    // Holding a direction builds up to high-speed cruising flight for crossing the world.
    const cruising = mag > 0.7 && this.game.state !== 'boss';
    this.cruise = cruising ? Math.min(1, (this.cruise || 0) + dt * 0.45) : Math.max(0, (this.cruise || 0) - dt * 2.5);
    const speed = 7 * this.speedMult() * Math.sqrt(this.progress.speedMult()) * (1 + 4 * this.cruise * this.cruise);
    const move = new THREE.Vector3();
    if (mag >= 0.15) {
      const fwd = _v.copy(this.headForward).normalize();
      const right = _w.crossVectors(this.flatForward(new THREE.Vector3()), UP).normalize();
      move.addScaledVector(right, input.hands.left.stick.x).addScaledVector(fwd, -input.hands.left.stick.y);
      if (move.lengthSq() > 1) move.normalize();
      move.multiplyScalar(speed);
    }
    const vert = this.game.isXR ? -R.stick.y : -R.stick.y;
    if (Math.abs(vert) > 0.2 && (!this.game.isXR || Math.abs(R.stick.y) > Math.abs(R.stick.x))) move.y += vert * speed * 0.7;
    if (this.takeoff > 0) { this.takeoff -= dt; move.y += 2.2; }
    this.moveRig(_v.copy(move).setY(0).multiplyScalar(dt), this.roamRadius(FLIGHT_RADIUS));
    this.updateHead();
    const ground = terrainHeight(this.headWorld.x, this.headWorld.z);
    const alt = clamp(this.altitude + move.y * dt, ground, MAX_ALTITUDE);
    this.setAltitude(alt);
    if (alt <= ground + 0.02 && move.y < 0 && !(this.takeoff > 0)) {
      this.land();
      this.game.effects.ring(new THREE.Vector3(this.headWorld.x, ground + 0.05, this.headWorld.z), 0xffffff, { maxRadius: 2, duration: 0.4, opacity: 0.5 });
    }
    // Flight trails of ki, more when moving fast.
    const v = move.length();
    this.moving = Math.max(this.moving, Math.min(1, v / speed));
    if (v > 1 && Math.random() < 0.5 * this.game.particleBudget) {
      const f = FORMS[this.form];
      this.game.effects.stream(_w.copy(this.headWorld).add(new THREE.Vector3(0, -1.1, 0)), this.form === 'base' ? 0xbfe6ff : f.aura.color, { vy: 0, spread: 0.3, size: 0.05, life: 0.35 });
    }
  }

  // Free roaming outside boss fights; a boss keeps you near its arena.
  roamRadius(bossRadius) {
    if (this.game.state === 'boss') return bossRadius;
    // Small planets have their own edge (King Kali's is tiny).
    const realm = this.game.training?.realm;
    if (realm) return this.flying ? realm.flyRadius : realm.radius;
    return WORLD_RADIUS - 60;
  }

  setAltitude(a) {
    const seated = this.game.isXR && this.settings.seated ? SEATED_OFFSET : 0;
    this.altitude = a;
    this.rig.position.y = seated + a;
  }

  // Move the rig horizontally; outside `radius` only inward movement is allowed.
  moveRig(delta, radius) {
    const p = this.rig.position;
    const r0 = Math.hypot(p.x, p.z);
    p.x += delta.x;
    p.z += delta.z;
    const r1 = Math.hypot(p.x, p.z);
    if (r1 > radius && r1 > r0) {
      const k = Math.max(radius, r0) / r1;
      p.x *= k; p.z *= k;
    }
  }

  clampToArena() {
    const p = this.rig.position;
    const r = Math.hypot(p.x, p.z);
    const R = this.roamRadius(ARENA_RADIUS);
    if (r > R) { p.x *= R / r; p.z *= R / r; }
  }

  rotateRigAroundHead(angle) {
    this.updateHead();
    const head = this.headWorld.clone();
    _q.setFromAxisAngle(UP, angle);
    this.rig.quaternion.premultiply(_q);
    // keep head position fixed in the world
    this.rig.updateMatrixWorld(true);
    const newHead = this.camera.getWorldPosition(new THREE.Vector3());
    this.rig.position.x += head.x - newHead.x;
    this.rig.position.z += head.z - newHead.z;
  }

  updateTeleport(dt, input, mag) {
    const L = input.hands.left;
    const t = this.teleport;
    if (L.stick.y < -0.6) {
      t.active = true;
      // Parabolic arc from the left hand
      const origin = L.aimOrigin.clone();
      const v = L.aimDir.clone().multiplyScalar(7);
      const g = -9.8;
      const pts = this.teleportArc.geometry.attributes.position;
      let hit = null;
      let p = origin.clone();
      for (let i = 0; i < 32; i++) {
        const tt = i * 0.05;
        const np = new THREE.Vector3(origin.x + v.x * tt, origin.y + v.y * tt + 0.5 * g * tt * tt, origin.z + v.z * tt);
        const gy = terrainHeight(np.x, np.z);
        if (!hit && np.y <= gy) {
          const gp = terrainHeight(p.x, p.z);
          hit = p.clone().lerp(np, (p.y - gp) / Math.max(1e-3, (p.y - gp) - (np.y - gy)));
          hit.y = terrainHeight(hit.x, hit.z);
        }
        const q = hit || np;
        pts.setXYZ(i, q.x, q.y, q.z);
        p = np;
      }
      pts.needsUpdate = true;
      t.valid = !!hit && Math.hypot(hit.x, hit.z) < this.roamRadius(ARENA_RADIUS);
      if (hit) t.point.copy(hit);
      this.teleportArc.visible = true;
      this.teleportArc.material.color.setHex(t.valid ? 0x4cc3ff : 0xff4d4d);
      this.teleportMarker.visible = t.valid;
      this.teleportMarker.position.copy(t.point);
    } else if (t.active && mag < 0.3) {
      if (t.valid) {
        this.updateHead();
        const dx = t.point.x - this.headWorld.x;
        const dz = t.point.z - this.headWorld.z;
        this.game.fadeTo(() => { this.rig.position.x += dx; this.rig.position.z += dz; });
      }
      t.active = false;
      this.teleportArc.visible = this.teleportMarker.visible = false;
    }
  }

  // ---- Resources --------------------------------------------------------------
  updateResources(dt, { charging }) {
    const p = this.progress;
    const maxSt = p.maxStamina();
    const gravityLoad = this.game.training?.activeGravity || 1;
    if (!this.blocking) this.stamina = Math.min(maxSt, this.stamina + (p.staminaRegen() / Math.sqrt(gravityLoad)) * dt);
    else this.stamina = Math.max(0, this.stamina - 4 * dt);
    if (this.stamina <= 0.5) this.exhausted = true;
    if (this.exhausted && this.stamina > maxSt * 0.35) this.exhausted = false;
    // Slow passive ki regen; real ki recovery comes from powering up.
    if (!charging) this.ki = Math.min(p.maxKi(), this.ki + 1.2 * dt);
    if (this.invuln > 0) this.invuln -= dt;
    // Kaio-ken burns stamina; running out ends it.
    if (this.kaiokenCooldown > 0) this.kaiokenCooldown -= dt;
    if (this.kaioken > 0) {
      this.kaioken -= dt;
      this.stamina = Math.max(0, this.stamina - this.kaiokenLevel().drain * dt);
      if (this.stamina <= 0.5 || this.kaioken <= 0) { this.kaioken = 0; bus.emit('kaioken', { on: false }); }
    }
    // Flying costs a trickle of ki.
    if (this.flying) this.ki = Math.max(0, this.ki - 0.4 * dt);
    // Slow health regen outside boss fights
    // (slow while sparring, so the fight has stakes).
    const sparring = this.game.training?.activity === 'spar' && this.game.state === 'training';
    if (!this.game.boss?.active && this.alive) this.health = Math.min(p.maxHealth(), this.health + (sparring ? 1 : 6) * dt);
  }

  spendStamina(n) {
    this.stamina = Math.max(0, this.stamina - n);
  }

  // ---- Punching ---------------------------------------------------------------
  updatePunching(dt, hands) {
    const p = this.progress;
    const f = FORMS[this.form];
    const ctx = {
      dt,
      head: this.headWorld,
      minPunchSpeed: 1.3,
      comboCap: clamp(2 + Math.floor(p.level('strength') / 2) + (this.form !== 'base' ? 1 : 0), 2, 8),
      punchDamage: (power, combo, finisher) => {
        const tired = this.exhausted ? 0.55 : 1;
        let d = 6 * (0.55 + power) * p.strengthMult() * this.damageMult() * tired;
        d *= 1 + 0.08 * (combo - 1);
        if (finisher) d *= 1.8;
        return d;
      },
    };
    for (const side of ['left', 'right']) {
      const h = hands.hands[side];
      if (!h.group.visible) continue;
      // Swing detection: whoosh + stamina cost when a fast swing starts.
      if (h.speed > 2.0 && h.swingArmed) {
        h.swingArmed = false;
        this.spendStamina((this.form === 'base' ? 3 : 2) * (1 + 0.3 * Math.log10(this.game.training?.activeGravity || 1)));
        bus.emit('punch:swing', { hand: side, speed: h.speed });
      } else if (h.speed < 0.8) h.swingArmed = true;
      if (this.blocking) continue;
      this.game.combat.testPunch(side, h.worldPos, h.vel, ctx);
    }
  }

  // ---- Ki attacks ---------------------------------------------------------------
  equippedAttack() {
    const eq = this.progress.data.equipped.filter(Boolean);
    return ATTACKS[eq[this.selectedAttack % eq.length]];
  }

  cycleAttack() {
    const eq = this.progress.data.equipped.filter(Boolean);
    this.selectedAttack = (this.selectedAttack + 1) % eq.length;
    bus.emit('attack:selected', { attack: this.equippedAttack() });
  }

  updateFiring(dt, input, hands, enabled) {
    const atk = this.equippedAttack();
    this.orbShown = false;
    this.discShown = false;
    this.kaiokenCharge = null;
    if (atk.type === 'beam') { this.updateBeam(dt, input, hands, atk, enabled); }
    else this.cancelBeamCharge();
    for (const side of ['left', 'right']) {
      const st = this.fire[side];
      const hs = input.hands[side];
      st.cooldown -= dt;
      const pressed = enabled && hs.trigger > 0.6 && hs.grip < 0.6;
      if (atk.type === 'barrage') this.updateBarrage(dt, side, st, hs, atk, pressed);
      else if (atk.type === 'buff') this.updateKaiokenCharge(dt, side, st, hands, atk, pressed);
      else if (atk.type !== 'beam') this.updateHeldShot(dt, side, st, hs, hands, atk, pressed);
      st.held = pressed;
    }
    if (!this.orbShown && !this.beam.charging) this.chargeOrb.visible = false;
    if (!this.discShown) this.chargeDisc.visible = false;
  }

  // Basic / Charged Ki Blast, Big Bang, Giant Sphere and Destructo Disc: hold to
  // charge, let go to throw. The Basic Ki Blast also fires a quick shot the
  // moment you press.
  updateHeldShot(dt, side, st, hs, hands, atk, pressed) {
    const quick = atk.type === 'blast';
    if (quick && pressed && !st.held && st.cooldown <= 0) this.fireBlast(side, hs, atk, 0);
    if (pressed && (quick || st.cooldown <= 0 || st.time > 0)) {
      st.time += dt;
      const delay = quick ? QUICK_HOLD : 0;
      const chargeTime = (quick ? QUICK_CHARGE_TIME : atk.chargeTime) / (1 + 0.06 * (this.progress.level('ki') - 1));
      st.charge = clamp((st.time - delay) / chargeTime, 0, 1);
      this.growOver(dt, st, atk, delay + (quick ? QUICK_CHARGE_TIME : atk.chargeTime), [side]);
      if (atk.type === 'sphere') this.showSphere(st, side, hands, atk);
      else if (atk.type === 'disc') this.showDisc(st, side, hs, hands, atk);
      else if (!quick || st.charge > 0) this.chargeBlastHeld(dt, side, hs, hands, atk, st);
      if (st.charge > 0 && Math.random() < 0.1 + 0.1 * (st.over || 0)) this.game.haptic(side, Math.min(1, 0.15 + 0.3 * st.charge + 0.15 * (st.over || 0)), 20);
    } else if (st.held || st.time > 0) {
      if (st.charge > 0.25 && st.cooldown <= 0) {
        if (atk.type === 'sphere') this.fireSphere(side, hs, atk, st.charge, st.over || 0);
        else if (atk.type === 'disc') this.fireDisc(side, hs, atk, st.charge, st.over || 0);
        else this.fireBlast(side, hs, atk, st.charge, st.over || 0);
      }
      st.time = 0;
      st.charge = 0;
      st.over = 0;
      st.stage = 0;
    }
  }

  // Past full charge, holding keeps building the move (up to
  // OVERCHARGE_STAGES more levels) until MAX_CHARGE_TIME after you started,
  // burning ki but always leaving enough to fire it.
  // `s` is a hand's fire state or the beam; `fullAt` is when it was fully charged.
  growOver(dt, s, atk, fullAt, sides, kiMul = 1) {
    if (s.charge < 1) return;
    const T = Math.max(4, MAX_CHARGE_TIME - fullAt);
    if ((s.over || 0) < OVERCHARGE_STAGES && this.ki > atk.kiCost + 1) {
      s.over = Math.min(OVERCHARGE_STAGES, (s.over || 0) + dt * OVERCHARGE_STAGES / T);
      this.ki = Math.max(0, this.ki - (OVERCHARGE_KI * kiMul / T) * dt);
    }
    const stage = Math.floor(s.over + 1e-6);
    if (stage > (s.stage || 0)) {
      s.stage = stage;
      const max = stage >= OVERCHARGE_STAGES;
      bus.emit('hud:message', { text: max ? `MAXIMUM ${atk.name.toUpperCase()}! Let it go!` : `Power level ${stage + 1}! Keep holding!`, color: max ? '#ff5a3a' : '#ffd23a' });
      for (const sd of sides) this.game.haptic(sd, 0.6 + 0.1 * stage, 120);
    }
  }

  // Charged Ki Blast / Big Bang held in the hand. Once fully charged it keeps
  // growing while you hold it into a huge ball of energy.
  chargeBlastHeld(dt, side, hs, hands, atk, st) {
    const over = st.over || 0;
    const show = st.charge > 0.15;
    const hand = hands.hands[side].worldPos;
    if (show) {
      // The ball of ki sits just in front of the hand, swelling and crackling.
      const size = atk.type === 'blast' ? 0.7 : atk.id === 'bigBang' ? 1.2 : 1;
      const r = (0.04 + 0.1 * st.charge) * size * (1 + 0.45 * over);
      const o = this.chargeOrb;
      o.visible = true;
      this.orbShown = true;
      o.material.color.setHex(this.form === 'base' || atk.id !== 'chargedBlast' ? atk.color : 0xfff07a);
      const shake = over > 0 ? Math.sin(st.time * 47) * 0.012 * over : 0;
      o.scale.setScalar(r * (1 + Math.sin(st.time * 30) * (0.04 + 0.03 * over)));
      // Pushed further out (and a little low) as it grows, so it never hides
      // what you're aiming at.
      o.position.copy(hand).addScaledVector(hs.aimDir, 0.06 + r * 1.3 + 0.1 * over).add(_v.set(shake, -shake * 0.5 - r * 0.35, 0));
      // Energy streams pulled into the ball, more and wider the bigger it gets.
      const n = 1 + Math.floor(over * 1.5);
      for (let i = 0; i < n; i++) {
        if (Math.random() > 0.7) continue;
        const a = Math.random() * Math.PI * 2;
        const d = r * (2.2 + over * 0.5);
        this.game.effects.stream(_w.copy(o.position).add(_v.set(Math.cos(a) * d, (Math.random() - 0.5) * d, Math.sin(a) * d)), atk.color, { vy: 0, spread: 0.04, size: 0.04 + 0.02 * over, life: 0.3 });
      }
      if (over > 0 && Math.random() < 0.15 * over) this.game.effects.burst?.(o.position.clone(), 0xffffff, 3, 2 + over, 0.03, 0.2);
    } else if (Math.random() < 0.5 + st.charge) {
      this.game.effects.stream(hand, atk.color, { vy: 0.2, spread: 0.12 * (1 - st.charge) + 0.03, size: 0.03 + 0.04 * st.charge, life: 0.25 });
    }
  }

  // Giant Energy Sphere: gathers above the raised hand, and keeps swelling
  // past full charge.
  showSphere(st, side, hands, atk) {
    const over = st.over || 0;
    const r = (0.08 + atk.radius * st.charge) * (1 + 0.3 * over);
    const o = this.chargeOrb;
    o.visible = true;
    this.orbShown = true;
    o.material.color.setHex(atk.color);
    o.scale.setScalar(r * (1 + Math.sin(st.time * 30) * (0.04 + 0.02 * over)));
    o.position.copy(hands.hands[side].worldPos).add(_v.set(0, 0.15 + r, 0));
    for (let i = 0; i < 1 + Math.floor(over); i++) {
      if (Math.random() > 0.8) continue;
      const a = Math.random() * Math.PI * 2;
      this.game.effects.stream(_w.copy(o.position).add(_v.set(Math.cos(a) * r * 2.5, Math.random() * r, Math.sin(a) * r * 2.5)), atk.color, { vy: -0.3, spread: 0.05, size: 0.05 + 0.03 * over, life: 0.3 });
    }
    if (over > 0 && Math.random() < 0.12 * over) this.game.effects.burst?.(o.position.clone(), 0xffffff, 3, 2 + over, 0.04, 0.25);
  }

  // Destructo Disc: a spinning razor disc above your raised hand.
  showDisc(st, side, hs, hands, atk) {
    if (st.charge <= 0.05) return;
    const over = st.over || 0;
    const r = (0.06 + 0.18 * st.charge) * (1 + 0.3 * over);
    const d = this.chargeDisc;
    d.visible = true;
    this.discShown = true;
    d.scale.set(r, r * (1 + 0.15 * over), r);
    // Held up high and a little forward, so it doesn't cover your view.
    d.position.copy(hands.hands[side].worldPos).addScaledVector(hs.aimDir, 0.1 + r * 0.8).add(_v.set(0, 0.18 + r * 0.5, 0));
    d.rotation.set(0, d.rotation.y + 0.9 + 0.2 * over, 0);
    if (Math.random() < 0.5 + 0.2 * over) {
      const a = Math.random() * Math.PI * 2;
      this.game.effects.stream(_w.copy(d.position).add(_v.set(Math.cos(a) * r, 0, Math.sin(a) * r)), atk.color, { vy: 0.1, spread: 0.02, size: 0.03 + 0.015 * over, life: 0.2 });
    }
    if (over > 0 && Math.random() < 0.1 * over) this.game.effects.burst?.(d.position.clone(), 0xffffff, 2, 2 + over, 0.03, 0.15);
  }

  // Energy Barrage: hold for a stream of exploding blasts that gets faster and
  // bigger the longer you hold (full power after MAX_CHARGE_TIME).
  updateBarrage(dt, side, st, hs, atk, pressed) {
    if (!pressed) { st.time = 0; st.stage = 0; return; }
    st.time += dt;
    const ramp = Math.min(1, st.time / MAX_CHARGE_TIME);
    const stage = Math.floor(ramp * 4 + 1e-6);
    if (stage > (st.stage || 0)) {
      st.stage = stage;
      bus.emit('hud:message', { text: stage >= 4 ? 'MAXIMUM BARRAGE!' : `Barrage power ${stage + 1}! Keep holding!`, color: stage >= 4 ? '#ff5a3a' : '#ffd23a' });
      this.game.haptic(side, 0.5 + 0.1 * stage, 100);
    }
    if (st.cooldown <= 0) this.fireBlast(side, hs, atk, 0, 0, ramp);
  }

  // Kaio-ken: tap for x2, keep holding to climb to x3, x4, x10 and x20, let
  // go to unleash it.
  updateKaiokenCharge(dt, side, st, hands, atk, pressed) {
    if (pressed && !st.held) {
      st.time = 0;
      st.kk = 0;
      st.blocked = true;
      if (this.kaioken > 0) bus.emit('hud:message', { text: `Kaio-ken x${this.kaiokenLevel().x} is on! ${Math.ceil(this.kaioken)}s left`, color: '#ff8a8a' });
      else if (this.kaiokenCooldown > 0) bus.emit('hud:message', { text: `Kaio-ken ready in ${Math.ceil(this.kaiokenCooldown)}s`, color: '#ff8a8a' });
      else if (this.ki < KAIOKEN_LEVELS[0].ki) bus.emit('ki:empty', {});
      else st.blocked = false;
    }
    if (pressed && !st.blocked) {
      st.time += dt;
      // Climb while you hold, as far as your ki allows.
      let lvl = 0;
      while (lvl + 1 < KAIOKEN_LEVELS.length && st.time >= KAIOKEN_LEVELS[lvl + 1].at && this.ki >= KAIOKEN_LEVELS[lvl + 1].ki) lvl++;
      if (lvl > st.kk || st.time === dt) {
        st.kk = lvl;
        const L = KAIOKEN_LEVELS[lvl];
        const max = lvl === KAIOKEN_LEVELS.length - 1;
        bus.emit('hud:message', { text: max ? 'KAIO-KEN TIMES TWENTY! Let it go!' : `Kaio-ken x${L.x}! ${st.time === dt ? 'Hold to go higher, let go to unleash' : 'Keep holding!'}`, color: '#ff5a4a' });
        this.game.haptic(side, 0.4 + 0.12 * lvl, 120);
      }
      this.kaiokenCharge = { level: st.kk, t: st.time };
      const h = hands.hands[side];
      if (h.group.visible && Math.random() < 0.5 + 0.1 * st.kk) {
        this.game.effects.stream(h.worldPos, 0xff2a1a, { vy: 0.6 + 0.2 * st.kk, spread: 0.08 + 0.02 * st.kk, size: 0.03 + 0.01 * st.kk, life: 0.4 });
      }
      if (Math.random() < 0.2) this.game.haptic(side, 0.2 + 0.1 * st.kk, 25);
    } else if (st.held && !st.blocked) {
      this.activateKaioken(atk, st.kk || 0);
      st.time = 0;
      st.blocked = true;
    }
  }

  // How charged the held move is: 0..1 charging, then 1 + overcharge.
  blastPower() {
    const f = this.fire;
    const kk = this.kaiokenCharge ? 0.6 + 0.6 * this.kaiokenCharge.level : 0;
    return Math.max(kk, this.beam.charging ? this.beam.charge + (this.beam.over || 0) : 0, (f.left.charge || 0) + (f.left.over || 0), (f.right.charge || 0) + (f.right.over || 0));
  }

  kaiokenLevel() { return KAIOKEN_LEVELS[this.kaiokenLvl || 0]; }

  activateKaioken(atk, lvl = 0) {
    if (this.kaioken > 0) return;
    if (this.kaiokenCooldown > 0) { bus.emit('hud:message', { text: `Kaio-ken ready in ${Math.ceil(this.kaiokenCooldown)}s`, color: '#ff8a8a' }); return; }
    while (lvl > 0 && this.ki < KAIOKEN_LEVELS[lvl].ki) lvl--;
    const L = KAIOKEN_LEVELS[lvl];
    if (this.ki < L.ki) { bus.emit('ki:empty', {}); return; }
    this.ki -= L.ki;
    this.kaiokenLvl = lvl;
    this.kaioken = atk.duration * (1 + 0.05 * (this.progress.level('stamina') - 1));
    this.kaiokenCooldown = atk.cooldown;
    bus.emit('kaioken', { on: true, x: L.x, level: lvl });
  }

  fireSphere(side, hs, atk, charge, over = 0) {
    const cost = atk.kiCost * (0.4 + 0.6 * charge);
    if (this.ki < cost) { bus.emit('ki:empty', {}); this.fire[side].cooldown = 0.4; return; }
    this.ki -= cost;
    const radius = (0.08 + atk.radius * charge) * (1 + 0.3 * over);
    const damage = atk.damage * this.progress.kiMult() * this.kiDamageMult() * (0.3 + 0.7 * charge) * (1 + 0.6 * over);
    const shot = this.game.combat.fire({ origin: this.chargeOrb.position.clone(), dir: hs.aimDir, speed: atk.speed * (1 - 0.05 * over), radius, damage, color: atk.color, team: 'player', charged: true, kind: 'sphere', life: 6 + over });
    if (over > 0) { shot.energy = 4 + 0.5 * over; shot.over = over; }
    if (over >= 2) bus.emit('hud:message', { text: over >= OVERCHARGE_STAGES ? 'MAXIMUM GIANT SPHERE!' : 'HUGE GIANT SPHERE!', color: '#9fe8ff' });
    this.fire[side].cooldown = atk.cooldown;
    bus.emit('blast:fired', { hand: side, charged: true, charge, power: 1 });
  }

  // Destructo Disc: thrown flat and spinning; slices through whoever it hits
  // and explodes where it lands.
  fireDisc(side, hs, atk, charge, over = 0) {
    const cost = atk.kiCost * (0.5 + 0.5 * charge);
    if (this.ki < cost) { bus.emit('ki:empty', {}); this.fire[side].cooldown = 0.4; return; }
    this.ki -= cost;
    const radius = (0.06 + 0.18 * charge) * (1 + 0.3 * over) * (this.form !== 'base' ? 1.2 : 1);
    const damage = atk.damage * this.progress.kiMult() * this.kiDamageMult() * (0.4 + 0.6 * charge) * (1 + 0.6 * over);
    const origin = this.chargeDisc.visible ? this.chargeDisc.position.clone() : hs.aimOrigin.clone().addScaledVector(hs.aimDir, 0.2);
    const shot = this.game.combat.fire({ origin, dir: hs.aimDir, speed: atk.speed, radius, damage, color: atk.color, team: 'player', charged: true, kind: 'disc', life: 3 + 0.3 * over });
    shot.energy = 1.2 + 0.4 * charge + 0.8 * over;
    shot.over = over;
    if (over >= 2) bus.emit('hud:message', { text: over >= OVERCHARGE_STAGES ? 'MAXIMUM DESTRUCTO DISC!' : 'HUGE DESTRUCTO DISC!', color: '#fff3a0' });
    this.fire[side].cooldown = atk.cooldown * (1 + 0.2 * over);
    bus.emit('blast:fired', { hand: side, charged: true, charge, power: 1 });
  }

  // ---- Beams (Kamehameha, Galick Gun, Ultimate Beam) ---------------------------
  // Hold a trigger to charge a sphere (between both hands when they are held
  // together), then release, or push both hands forward, to fire. While the
  // beam fires, aiming steers it.
  updateBeam(dt, input, hands, atk, enabled) {
    const b = this.beam;
    b.cooldown -= dt;
    const L = input.hands.left;
    const R = input.hands.right;
    const lp = enabled && L.trigger > 0.6 && L.grip < 0.6;
    const rp = enabled && R.trigger > 0.6 && R.grip < 0.6;
    const hl = hands.hands.left;
    const hr = hands.hands.right;
    const together = hl.group.visible && hr.group.visible && hl.worldPos.distanceTo(hr.worldPos) < 0.32;
    if (this.game.combat.playerBeam) { b.charging = false; this.chargeOrb.visible = false; return; }
    if ((lp || rp) && b.cooldown <= 0) {
      if (atk.form && this.form !== atk.form) {
        if (!b.warned) bus.emit('hud:message', { text: `${atk.name}: only in ${FORMS[atk.form].name} form`, color: '#4cc3ff' });
        b.warned = true;
        return;
      }
      if (!b.charging) { b.charging = true; b.charge = 0; b.over = 0; b.stage = 0; bus.emit('beam:charge', { attack: atk }); }
      b.hand = rp ? 'right' : 'left';
      b.both = together;
      const chargeTime = atk.chargeTime / (1 + 0.06 * (this.progress.level('ki') - 1));
      b.charge = clamp(b.charge + dt / chargeTime, 0, 1);
      // Fully charged and still holding: the beam keeps building (burning ki).
      this.growOver(dt, b, atk, atk.chargeTime, ['left', 'right'], 1.3);
      const over = b.over;
      const dir = this.beamDir(input, b, _w);
      if (together) b.origin.addVectors(hl.worldPos, hr.worldPos).multiplyScalar(0.5);
      else b.origin.copy(hands.hands[b.hand].worldPos);
      const r = (0.05 + 0.12 * b.charge) * (1 + 0.4 * over);
      // The ball moves out (and a little low) as it grows, so you can still aim.
      b.origin.addScaledVector(dir, 0.08 + r * 0.9 + 0.08 * over);
      b.origin.y -= r * 0.3;
      const shake = over > 0 ? Math.sin(performance.now() * 0.047) * 0.012 * over : 0;
      this.chargeOrb.visible = true;
      this.chargeOrb.material.color.setHex(atk.color);
      this.chargeOrb.position.copy(b.origin).add(_v.set(shake, -shake * 0.5, 0));
      this.chargeOrb.scale.setScalar(r * (1 + Math.sin(performance.now() * 0.03) * (0.08 + 0.03 * over)));
      // Energy pulled into the ball, wider and thicker as it grows.
      for (let i = 0; i < 1 + Math.floor(over * 1.5); i++) {
        if (Math.random() > 0.7) continue;
        const a = Math.random() * Math.PI * 2;
        const d = 0.25 + r * (1.5 + 0.4 * over);
        this.game.effects.stream(_v.copy(b.origin).add(_w.set(Math.cos(a) * d, Math.sin(a) * d, (Math.random() - 0.5) * d)), atk.color, { vy: 0, spread: 0.02, size: 0.03 + 0.02 * over, life: 0.25 });
      }
      if (over > 0 && Math.random() < 0.15 * over) this.game.effects.burst?.(b.origin.clone(), 0xffffff, 3, 2 + over, 0.03, 0.2);
      if (Math.random() < 0.3 + 0.1 * over) { this.game.haptic('left', Math.min(1, 0.2 + 0.5 * b.charge + 0.1 * over), 25); this.game.haptic('right', Math.min(1, 0.2 + 0.5 * b.charge + 0.1 * over), 25); }
      // VR gesture: both hands together, pushed forward = fire.
      if (together && b.charge > 0.5 && this.game.isXR) {
        const push = (hl.vel.dot(this.headForward) + hr.vel.dot(this.headForward)) / 2;
        if (push > 1.6) this.fireBeam(input, atk);
      }
    } else if (b.charging) {
      if (b.charge > 0.3) this.fireBeam(input, atk);
      b.charging = false;
      this.chargeOrb.visible = false;
    } else b.warned = false;
  }

  beamDir(input, b, out) {
    if (b.both) out.addVectors(input.hands.left.aimDir, input.hands.right.aimDir);
    else out.copy(input.hands[b.hand].aimDir);
    return out.normalize();
  }

  cancelBeamCharge() {
    if (this.beam.charging) { this.beam.charging = false; this.chargeOrb.visible = false; }
  }

  fireBeam(input, atk) {
    const b = this.beam;
    b.charging = false;
    this.chargeOrb.visible = false;
    const cost = atk.kiCost * (0.5 + 0.5 * b.charge);
    if (this.ki < cost) { bus.emit('ki:empty', {}); b.cooldown = 0.5; return; }
    this.ki -= cost;
    // Overcharged (held past full): longer, wider, stronger, and it blows up
    // far bigger where it lands.
    const over = b.over || 0;
    const duration = atk.duration * (0.6 + 0.4 * b.charge) * (1 + 0.25 * over);
    const total = atk.damage * this.progress.kiMult() * this.kiDamageMult() * (0.45 + 0.55 * b.charge) * (b.both ? 1.15 : 1) * (1 + 0.6 * over);
    const kiLv = this.progress.level('ki');
    const radius = atk.beamRadius * (0.6 + 0.4 * b.charge) * (1 + 0.04 * (kiLv - 1)) * (this.form !== 'base' ? 1.25 : 1) * (1 + 0.25 * over);
    if (over >= 2) bus.emit('hud:message', { text: over >= OVERCHARGE_STAGES ? `MAXIMUM ${atk.name.toUpperCase()}!` : `HUGE ${atk.name.toUpperCase()}!`, color: '#7fd8ff' });
    const hands = this.game.hands.hands;
    this.game.combat.fireBeam({
      origin: (out) => {
        if (b.both) out.addVectors(hands.left.worldPos, hands.right.worldPos).multiplyScalar(0.5);
        else out.copy(hands[b.hand].worldPos);
        return out.addScaledVector(this.beamDir(this.game.lastInput || input, b, _v), 0.1);
      },
      dir: (out) => this.beamDir(this.game.lastInput || input, b, out),
      duration, dps: total / duration, radius, color: atk.color, team: 'player',
      // Explosion size: the Ultimate beam outdoes Kamehameha / Galick Gun; charge and transformations add more.
      energy: Math.min(9.5, (atk.boom || 5) * (0.55 + 0.45 * b.charge) * (this.form !== 'base' ? 1.1 : 1) * (1 + 0.22 * over)),
      over,
      spiral: atk.spiral ? atk.spiralColor : null,
    });
    b.over = 0;
    b.stage = 0;
    b.cooldown = atk.cooldown;
    bus.emit('beam:fired', { attack: atk, charge: b.charge, both: b.both });
  }

  chargeLevel(side) { return this.fire[side].charge || 0; }

  fireBlast(side, hs, atk, charge, over = 0, ramp = 0) {
    const p = this.progress;
    const quick = atk.type === 'blast';
    const barrage = atk.type === 'barrage';
    const isCharged = atk.type === 'charged';
    const held = quick && charge > 0; // a Basic Ki Blast you held to charge up
    const cost = atk.kiCost * (isCharged ? 0.5 + 0.5 * charge : held ? 1 + 2 * charge : 1);
    if (this.ki < cost) {
      bus.emit('ki:empty', {});
      this.fire[side].cooldown = 0.4;
      return;
    }
    this.ki -= cost;
    const kiLv = p.level('ki');
    // Ki blasts grow bigger and brighter with ki level and transformation.
    const sizeK = (1 + 0.07 * (kiLv - 1)) * (this.form !== 'base' ? 1.35 : 1);
    const chargeK = isCharged ? 0.6 + 0.6 * charge : held ? 1 + 1.2 * charge : 1;
    const radius = atk.radius * sizeK * chargeK * (1 + 0.55 * over) * (1 + 1.2 * ramp);
    const damage = atk.damage * p.kiMult() * this.kiDamageMult() * (isCharged ? 0.4 + 0.8 * charge : held ? 1 + 1.6 * charge : 1) * (1 + 0.6 * over) * (1 + 1.5 * ramp);
    const color = this.form === 'base' || barrage || atk.id === 'bigBang' ? atk.color : isCharged ? 0xfff07a : 0xffe066;
    const fromOrb = (over > 0 || charge > 0.5) && this.chargeOrb.visible;
    const origin = fromOrb ? this.chargeOrb.position.clone() : hs.aimOrigin.clone().addScaledVector(hs.aimDir, 0.12);
    // Barrage shots spray slightly.
    const dir = barrage ? hs.aimDir.clone().add(_w.set((Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.06)) : hs.aimDir;
    const shot = this.game.combat.fire({ origin, dir, speed: atk.speed * (1 - 0.1 * over), radius, damage, color, team: 'player', charged: isCharged || held, kind: over >= 1 ? 'overcharged' : 'blast', life: 3 + over });
    // Every ki attack explodes where it hits; charging makes the blast much
    // bigger than its size alone would.
    if (quick) shot.energy = 0.75 + 1.0 * charge + 0.8 * over;
    else if (barrage) shot.energy = 0.45 + 1.1 * ramp;
    else if (atk.boom) shot.energy = atk.boom * (0.5 + 0.5 * charge) + 0.9 * over;
    else if (over > 0) shot.energy = 1.5 + 0.95 * over;
    if (over >= 2) bus.emit('hud:message', { text: `${over >= OVERCHARGE_STAGES ? 'MAXIMUM' : 'HUGE'} ${(quick || atk.id === 'chargedBlast' ? 'Ki Blast' : atk.name).toUpperCase()}!`, color: '#ff8a3a' });
    this.fire[side].cooldown = barrage ? atk.cooldown * (1 - 0.45 * ramp) : atk.cooldown * (1 + 0.3 * over);
    if (!barrage || Math.random() < 0.35) bus.emit('blast:fired', { hand: side, charged: isCharged || held, charge, power: Math.min(1, (kiLv - 1) / 10 + (this.form !== 'base' ? 0.4 : 0)) });
  }

  // ---- Defense ---------------------------------------------------------------
  updateBlocking(input, hands) {
    const L = input.hands.left;
    const R = input.hands.right;
    // Left grip alone = block (both grips is power-up).
    let block = L.grip > 0.6 && R.grip < 0.6;
    // Natural guard: both fists raised in front of the face (VR).
    if (!block && this.game.isXR && hands.hands.left.group.visible && hands.hands.right.group.visible) {
      const head = this.headWorld;
      const l = hands.hands.left.worldPos;
      const r = hands.hands.right.worldPos;
      const nearFace = (v) => v.distanceTo(head) < 0.32 && v.y > head.y - 0.3;
      if (nearFace(l) && nearFace(r)) block = true;
    }
    if (this.exhausted && this.stamina < 2) block = false;
    this.blocking = block;
  }

  // Enemy projectile vs player: blocked by hands when guarding, else body hit.
  testProjectile(p) {
    if (!this.alive) return false;
    const hands = this.game.hands.hands;
    if (this.blocking) {
      for (const side of ['left', 'right']) {
        const h = hands[side];
        if (h.group.visible && segmentSphere(p.prev, p.mesh.position, h.worldPos, 0.22 + p.radius)) {
          this.onHit({ damage: p.damage, blocked: true, point: p.mesh.position.clone(), kind: 'projectile', source: p.owner });
          return true;
        }
      }
    }
    const head = this.headWorld;
    const chest = _v.copy(head).add(_w.set(0, -0.45, 0));
    if (segmentSphere(p.prev, p.mesh.position, head, 0.16 + p.radius) || segmentSphere(p.prev, p.mesh.position, chest, 0.22 + p.radius)) {
      // Blocking from the front still protects the body somewhat.
      this.onHit({ damage: p.damage, blocked: this.blocking, point: p.mesh.position.clone(), kind: 'projectile', source: p.owner });
      return true;
    }
    return false;
  }

  // Melee from bosses: hit if the player's head is inside the strike sphere.
  testMelee(center, radius, damage, source) {
    if (!this.alive) return false;
    if (this.headWorld.distanceTo(center) > radius + 0.2 && _v.copy(this.headWorld).add(_w.set(0, -0.45, 0)).distanceTo(center) > radius + 0.25) return false;
    this.onHit({ damage, blocked: this.blocking, point: center.clone(), kind: 'melee', source });
    return true;
  }

  onHit({ damage, blocked, point, kind, source, ignoreInvuln = false }) {
    if (this.invuln > 0 && !blocked && !ignoreInvuln) return;
    const f = FORMS[this.form];
    let dmg = damage / f.defense / (1 + 0.04 * (this.progress.level('stamina') - 1));
    if (blocked) {
      dmg *= 0.2;
      this.spendStamina(6);
    }
    this.health = Math.max(0, this.health - dmg);
    if (!blocked && !ignoreInvuln) this.invuln = 0.35;
    bus.emit('player:hit', { damage: dmg, blocked, point, kind, source });
    if (this.health <= 0 && this.alive) {
      this.alive = false;
      bus.emit('player:defeated', {});
    }
  }
}
