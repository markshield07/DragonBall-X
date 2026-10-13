import * as THREE from 'three';
import { bus } from '../core/events.js';
import { clamp, damp } from '../core/math.js';
import { FORMS } from '../progression/forms.js';
import { ATTACKS } from '../progression/attacks.js';
import { segmentSphere } from '../combat/Combat.js';
import { terrainHeight } from '../world/Arena.js';
import { glowMaterial } from '../render/toon.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const SEATED_OFFSET = 0.45;
const ARENA_RADIUS = 30; // walking stays on the training grounds
const FLIGHT_RADIUS = 90; // flying reaches the surrounding mountains
const MAX_ALTITUDE = 45;

// The player: resources (health / ki / stamina), locomotion & comfort,
// punching, ki attacks, blocking, and how damage is taken. Reads the unified
// input state, so VR and desktop share every rule here.
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
  damageMult() { return FORMS[this.form].damage * (this.kaioken > 0 ? 1.5 : 1); }
  kiDamageMult() { return FORMS[this.form].kiDamage * (this.kaioken > 0 ? 1.3 : 1); }
  speedMult() { return FORMS[this.form].speed * (this.kaioken > 0 ? 1.25 : 1); }

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
      this.moveRig(move.multiplyScalar(speed * dt), ARENA_RADIUS);
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
    const speed = 7 * this.speedMult() * Math.sqrt(this.progress.speedMult());
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
    this.moveRig(_v.copy(move).setY(0).multiplyScalar(dt), FLIGHT_RADIUS);
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
    if (r > ARENA_RADIUS) { p.x *= ARENA_RADIUS / r; p.z *= ARENA_RADIUS / r; }
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
        if (!hit && np.y <= 0) {
          hit = p.clone().lerp(np, p.y / Math.max(1e-3, p.y - np.y));
          hit.y = 0;
        }
        const q = hit || np;
        pts.setXYZ(i, q.x, q.y, q.z);
        p = np;
      }
      pts.needsUpdate = true;
      t.valid = !!hit && Math.hypot(hit.x, hit.z) < ARENA_RADIUS;
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
      this.stamina = Math.max(0, this.stamina - 4 * dt);
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
    if (atk.type === 'beam') { this.updateBeam(dt, input, hands, atk, enabled); }
    else this.cancelBeamCharge();
    for (const side of ['left', 'right']) {
      const st = this.fire[side];
      const hs = input.hands[side];
      st.cooldown -= dt;
      const pressed = enabled && hs.trigger > 0.6 && hs.grip < 0.6;
      if (atk.type === 'blast') {
        if (pressed && !st.held && st.cooldown <= 0) this.fireBlast(side, hs, atk, 0);
        else if (pressed && st.held && st.cooldown <= 0 && st.time > 0.35) this.fireBlast(side, hs, atk, 0); // auto-fire while held
        st.time = pressed ? st.time + dt : 0;
      } else if (atk.type === 'barrage') {
        if (pressed && st.cooldown <= 0) this.fireBlast(side, hs, atk, 0);
      } else if (atk.type === 'buff') {
        if (pressed && !st.held) this.activateKaioken(atk);
      } else if (atk.type === 'charged' || atk.type === 'sphere') {
        const sphere = atk.type === 'sphere';
        if (pressed && (st.cooldown <= 0 || st.time > 0)) {
          st.time += dt;
          const chargeTime = atk.chargeTime / (1 + 0.06 * (this.progress.level('ki') - 1));
          st.charge = clamp(st.time / chargeTime, 0, 1);
          if (sphere) {
            // A huge sphere gathers above the raised hand.
            const r = 0.08 + atk.radius * st.charge;
            this.chargeOrb.visible = true;
            this.chargeOrb.material.color.setHex(atk.color);
            this.chargeOrb.scale.setScalar(r * (1 + Math.sin(st.time * 30) * 0.04));
            this.chargeOrb.position.copy(hands.hands[side].worldPos).add(_v.set(0, 0.15 + r, 0));
            if (Math.random() < 0.8) {
              const a = Math.random() * Math.PI * 2;
              this.game.effects.stream(_w.copy(this.chargeOrb.position).add(_v.set(Math.cos(a) * r * 2.5, Math.random() * r, Math.sin(a) * r * 2.5)), atk.color, { vy: -0.3, spread: 0.05, size: 0.05, life: 0.3 });
            }
          } else if (Math.random() < 0.5 + st.charge) {
            this.game.effects.stream(hands.hands[side].worldPos, atk.color, { vy: 0.2, spread: 0.12 * (1 - st.charge) + 0.03, size: 0.03 + 0.04 * st.charge, life: 0.25 });
          }
          if (Math.random() < 0.1) this.game.haptic(side, 0.15 + 0.3 * st.charge, 20);
        } else if (st.held || st.time > 0) {
          if (st.charge > 0.25 && st.cooldown <= 0) {
            if (sphere) this.fireSphere(side, hs, atk, st.charge);
            else this.fireBlast(side, hs, atk, st.charge);
          }
          if (sphere) this.chargeOrb.visible = false;
          st.time = 0;
          st.charge = 0;
        }
      }
      st.held = pressed;
    }
    if (atk.type !== 'sphere' && !this.beam.charging) this.chargeOrb.visible = false;
  }

  activateKaioken(atk) {
    if (this.kaiokenCooldown > 0) { bus.emit('hud:message', { text: `Kaio-ken ready in ${Math.ceil(this.kaiokenCooldown)}s`, color: '#ff8a8a' }); return; }
    if (this.ki < atk.kiCost) { bus.emit('ki:empty', {}); return; }
    this.ki -= atk.kiCost;
    this.kaioken = atk.duration * (1 + 0.05 * (this.progress.level('stamina') - 1));
    this.kaiokenCooldown = atk.cooldown;
    bus.emit('kaioken', { on: true });
  }

  fireSphere(side, hs, atk, charge) {
    const cost = atk.kiCost * (0.4 + 0.6 * charge);
    if (this.ki < cost) { bus.emit('ki:empty', {}); this.fire[side].cooldown = 0.4; return; }
    this.ki -= cost;
    const radius = 0.08 + atk.radius * charge;
    const damage = atk.damage * this.progress.kiMult() * this.kiDamageMult() * (0.3 + 0.7 * charge);
    this.game.combat.fire({ origin: this.chargeOrb.position.clone(), dir: hs.aimDir, speed: atk.speed, radius, damage, color: atk.color, team: 'player', charged: true, kind: 'sphere', life: 6 });
    this.fire[side].cooldown = atk.cooldown;
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
      if (!b.charging) { b.charging = true; b.charge = 0; bus.emit('beam:charge', { attack: atk }); }
      b.hand = rp ? 'right' : 'left';
      b.both = together;
      const chargeTime = atk.chargeTime / (1 + 0.06 * (this.progress.level('ki') - 1));
      b.charge = clamp(b.charge + dt / chargeTime, 0, 1);
      if (together) b.origin.addVectors(hl.worldPos, hr.worldPos).multiplyScalar(0.5);
      else b.origin.copy(hands.hands[b.hand].worldPos);
      b.origin.addScaledVector(this.beamDir(input, b, _v), 0.08);
      const r = 0.05 + 0.12 * b.charge;
      this.chargeOrb.visible = true;
      this.chargeOrb.material.color.setHex(atk.color);
      this.chargeOrb.position.copy(b.origin);
      this.chargeOrb.scale.setScalar(r * (1 + Math.sin(performance.now() * 0.03) * 0.08));
      if (Math.random() < 0.7) {
        const a = Math.random() * Math.PI * 2;
        this.game.effects.stream(_w.copy(b.origin).add(_v.set(Math.cos(a) * 0.25, Math.sin(a) * 0.25, 0)), atk.color, { vy: 0, spread: 0.02, size: 0.03, life: 0.2 });
      }
      if (Math.random() < 0.3) { this.game.haptic('left', 0.2 + 0.5 * b.charge, 25); this.game.haptic('right', 0.2 + 0.5 * b.charge, 25); }
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
    const duration = atk.duration * (0.6 + 0.4 * b.charge);
    const total = atk.damage * this.progress.kiMult() * this.kiDamageMult() * (0.45 + 0.55 * b.charge) * (b.both ? 1.15 : 1);
    const kiLv = this.progress.level('ki');
    const radius = atk.beamRadius * (0.6 + 0.4 * b.charge) * (1 + 0.04 * (kiLv - 1)) * (this.form !== 'base' ? 1.25 : 1);
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
      energy: (atk.id === 'ultimateBeam' ? 7 : 5) * (0.55 + 0.45 * b.charge) * (this.form !== 'base' ? 1.1 : 1),
    });
    b.cooldown = atk.cooldown;
    bus.emit('beam:fired', { attack: atk, charge: b.charge, both: b.both });
  }

  chargeLevel(side) { return this.fire[side].charge || 0; }

  fireBlast(side, hs, atk, charge) {
    const p = this.progress;
    const f = FORMS[this.form];
    const cost = atk.kiCost * (atk.id === 'chargedBlast' ? 0.5 + 0.5 * charge : 1);
    if (this.ki < cost) {
      bus.emit('ki:empty', {});
      this.fire[side].cooldown = 0.4;
      return;
    }
    this.ki -= cost;
    const kiLv = p.level('ki');
    const isCharged = atk.id === 'chargedBlast';
    // Ki blasts grow bigger and brighter with ki level and transformation.
    const sizeK = (1 + 0.07 * (kiLv - 1)) * (this.form !== 'base' ? 1.35 : 1);
    const radius = atk.radius * sizeK * (isCharged ? 0.6 + 0.6 * charge : 1);
    const damage = atk.damage * p.kiMult() * this.kiDamageMult() * (isCharged ? 0.4 + 0.8 * charge : 1);
    const color = this.form === 'base' || atk.type === 'barrage' ? atk.color : isCharged ? 0xfff07a : 0xffe066;
    const origin = hs.aimOrigin.clone().addScaledVector(hs.aimDir, 0.12);
    // Barrage shots spray slightly.
    const dir = atk.type === 'barrage' ? hs.aimDir.clone().add(_w.set((Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.06)) : hs.aimDir;
    this.game.combat.fire({ origin, dir, speed: atk.speed, radius, damage, color, team: 'player', charged: isCharged });
    this.fire[side].cooldown = atk.cooldown;
    if (atk.type !== 'barrage' || Math.random() < 0.35) bus.emit('blast:fired', { hand: side, charged: isCharged, charge, power: Math.min(1, (kiLv - 1) / 10 + (this.form !== 'base' ? 0.4 : 0)) });
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
