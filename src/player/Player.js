import * as THREE from 'three';
import { bus } from '../core/events.js';
import { clamp, damp } from '../core/math.js';
import { FORMS } from '../progression/forms.js';
import { ATTACKS } from '../progression/attacks.js';
import { segmentSphere } from '../combat/Combat.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const SEATED_OFFSET = 0.45;
const ARENA_RADIUS = 30;

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
    this.buildTeleportMarker();

    // As a combat target for enemy projectiles / melee.
    this.target = {
      id: 'player',
      team: 'player',
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
  }

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
    this.rig.position.y = xr && this.settings.seated ? SEATED_OFFSET : 0;
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
    if (this.game.isXR && s.moveMode === 'teleport') {
      this.updateTeleport(dt, input, mag);
      return;
    }
    if (mag < 0.15) return;
    // Higher simulated gravity / exhaustion slows the avatar (in-game only).
    const formSpeed = FORMS[this.form].speed;
    const speed = 3.0 * formSpeed * (this.exhausted ? 0.6 : 1) * this.progress.speedMult();
    const fwd = this.flatForward(_v);
    const right = _w.crossVectors(fwd, UP).normalize();
    const move = new THREE.Vector3()
      .addScaledVector(right, stick.x)
      .addScaledVector(fwd, -stick.y);
    if (move.lengthSq() > 1) move.normalize();
    this.rig.position.addScaledVector(move, speed * dt);
    this.clampToArena();
    this.moving = Math.max(this.moving, Math.min(1, mag));
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
    const gravityLoad = this.game.training?.gravity || 1;
    if (!this.blocking) this.stamina = Math.min(maxSt, this.stamina + (p.staminaRegen() / Math.sqrt(gravityLoad)) * dt);
    else this.stamina = Math.max(0, this.stamina - 4 * dt);
    if (this.stamina <= 0.5) this.exhausted = true;
    if (this.exhausted && this.stamina > maxSt * 0.35) this.exhausted = false;
    // Slow passive ki regen; real ki recovery comes from powering up.
    if (!charging) this.ki = Math.min(p.maxKi(), this.ki + 1.2 * dt);
    if (this.invuln > 0) this.invuln -= dt;
    // Slow health regen outside boss fights
    if (!this.game.boss?.active && this.alive) this.health = Math.min(p.maxHealth(), this.health + 6 * dt);
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
      comboCap: clamp(2 + Math.floor(p.level('strength') / 2) + (this.form !== 'base' ? 1 : 0), 2, 7),
      punchDamage: (power, combo, finisher) => {
        const tired = this.exhausted ? 0.55 : 1;
        let d = 6 * (0.55 + power) * p.strengthMult() * f.damage * tired;
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
        this.spendStamina(this.form === 'base' ? 3 : 2);
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
    for (const side of ['left', 'right']) {
      const st = this.fire[side];
      const hs = input.hands[side];
      st.cooldown -= dt;
      const pressed = enabled && hs.trigger > 0.6 && hs.grip < 0.6;
      if (atk.id === 'kiBlast') {
        if (pressed && !st.held && st.cooldown <= 0) this.fireBlast(side, hs, atk, 0);
        else if (pressed && st.held && st.cooldown <= 0 && st.time > 0.35) this.fireBlast(side, hs, atk, 0); // auto-fire while held
        st.time = pressed ? st.time + dt : 0;
      } else if (atk.id === 'chargedBlast') {
        if (pressed) {
          st.time += dt;
          const chargeTime = atk.chargeTime / (1 + 0.06 * (this.progress.level('ki') - 1));
          st.charge = clamp(st.time / chargeTime, 0, 1);
          // Gathering energy in the hand
          if (Math.random() < 0.5 + st.charge) {
            this.game.effects.stream(hands.hands[side].worldPos, atk.color, { vy: 0.2, spread: 0.12 * (1 - st.charge) + 0.03, size: 0.03 + 0.04 * st.charge, life: 0.25 });
          }
          if (Math.random() < 0.1) this.game.haptic(side, 0.15 + 0.3 * st.charge, 20);
        } else if (st.held) {
          if (st.charge > 0.25 && st.cooldown <= 0) this.fireBlast(side, hs, atk, st.charge);
          st.time = 0;
          st.charge = 0;
        }
      }
      st.held = pressed;
    }
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
    const damage = atk.damage * p.kiMult() * f.kiDamage * (isCharged ? 0.4 + 0.8 * charge : 1);
    const color = this.form === 'base' ? atk.color : isCharged ? 0xfff07a : 0xffe066;
    const origin = hs.aimOrigin.clone().addScaledVector(hs.aimDir, 0.12);
    this.game.combat.fire({ origin, dir: hs.aimDir, speed: atk.speed, radius, damage, color, team: 'player', charged: isCharged });
    this.fire[side].cooldown = atk.cooldown;
    bus.emit('blast:fired', { hand: side, charged: isCharged, charge, power: Math.min(1, (kiLv - 1) / 10 + (this.form !== 'base' ? 0.4 : 0)) });
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

  onHit({ damage, blocked, point, kind, source }) {
    if (this.invuln > 0 && !blocked) return;
    const f = FORMS[this.form];
    let dmg = damage / f.defense / (1 + 0.04 * (this.progress.level('stamina') - 1));
    if (blocked) {
      dmg *= 0.2;
      this.spendStamina(6);
    }
    this.health = Math.max(0, this.health - dmg);
    if (!blocked) this.invuln = 0.35;
    bus.emit('player:hit', { damage: dmg, blocked, point, kind, source });
    if (this.health <= 0 && this.alive) {
      this.alive = false;
      bus.emit('player:defeated', {});
    }
  }
}
