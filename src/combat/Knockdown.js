import * as THREE from 'three';
import { damp, smoothstep, clamp } from '../core/math.js';
import { terrainHeight } from '../world/Arena.js';
import { bus } from '../core/events.js';

const LIE = 1.48; // body tilt when flat (radians, pivot at the feet); negative = on the back

// Shared knockdown motion for anyone who can be sent flying (boss, sparring
// partner). Several styles, picked from how and how hard they were hit:
//   back    launched up and back, slams down, bounces, skids on the back
//   spin    spins like a top through the air, lands face down and skids
//   flip    a full backward somersault before crashing onto the back
//   launch  knocked high into the air (uppercut / huge blast), crashes down hard
//   crumple knees buckle and they fold forward onto their face (out on their feet)
// The caller applies `tilt` to the body's rotation.x, `yaw` to its rotation.y
// and `lift()` to its height. Badly hurt fighters stay down longer and get up slowly.
export class Knockdown {
  constructor(game) {
    this.game = game;
    this.phase = 'none';
    this.style = 'back';
    this.vel = new THREE.Vector3();
    this.vy = 0;
    this.t = 0;
    this.tilt = 0;
    this.yaw = 0;
    this.spinRate = 0;
    this.drop = 0; // extra lowering (kneeling in a crumple)
    this.lieTime = 0.8;
    this.getUpTime = 0.55;
    this.bounces = 0;
    this.trail = 0;
  }

  get active() { return this.phase !== 'none'; }
  get grounded() { return this.phase === 'slide' || this.phase === 'lie' || this.phase === 'getUp' || this.phase === 'buckle'; }
  get faceDown() { return this.tilt > 0.5; }

  // Pick a style from the hit: upward blows launch, huge ones tumble, the
  // badly hurt crumple, the rest vary.
  static pickStyle(hit, healthFrac) {
    if ((hit.dir?.y ?? 0) > 0.45 || hit.sphere) return 'launch';
    if (healthFrac < 0.25 && hit.kind === 'punch' && !hit.finisher && Math.random() < 0.6) return 'crumple';
    const r = Math.random();
    if (hit.finisher) return r < 0.35 ? 'spin' : r < 0.65 ? 'flip' : 'back';
    return r < 0.25 ? 'spin' : r < 0.45 ? 'flip' : 'back';
  }

  // dir: horizontal direction of the blow; power 0..1.5; size scales distances and dust.
  start(dir, power = 1, { lie = 0.8, size = 1, style = 'back', health = 1 } = {}) {
    power = Math.min(1.5, power);
    this.style = style;
    this.vel.copy(dir).setY(0);
    if (this.vel.lengthSq() < 1e-4) this.vel.set(0, 0, -1);
    this.vel.normalize().multiplyScalar(4 + 5 * power);
    this.vy = 3.2 + 3.2 * power;
    this.spinRate = 0;
    if (style === 'launch') { this.vy = 9 + 4 * power; this.vel.multiplyScalar(0.35); }
    if (style === 'flip') this.vy += 1.5;
    if (style === 'spin') this.spinRate = (Math.random() < 0.5 ? -1 : 1) * (14 + 6 * power);
    this.phase = style === 'crumple' ? 'buckle' : 'air';
    this.flipped = false;
    this.t = 0;
    this.bounces = 0;
    this.yaw = 0;
    this.drop = 0;
    this.size = size;
    this.power = power;
    // Hurt fighters stay down longer and get up more slowly.
    const hurt = 1 - clamp(health, 0, 1);
    this.lieTime = lie + 1.2 * hurt;
    this.getUpTime = 0.55 + 0.9 * hurt;
  }

  // Moves `pos` (the feet). Returns true while the knockdown is running.
  update(dt, pos) {
    if (!this.active) return false;
    const fx = this.game.effects;
    this.t += dt;
    const floor = terrainHeight(pos.x, pos.z);
    switch (this.phase) {
      case 'buckle': {
        // Out on their feet: sag to the knees, sway, then topple forward.
        pos.y = floor;
        const k1 = smoothstep(0, 0.45, this.t);
        this.drop = 0.42 * k1;
        this.tilt = 0.25 * k1 + Math.sin(this.t * 9) * 0.04 * (1 - k1);
        this.yaw = Math.sin(this.t * 5) * 0.12;
        if (this.t > 0.7) {
          const k2 = smoothstep(0.7, 1.05, this.t);
          this.tilt = 0.25 + (LIE - 0.25) * k2 * k2;
          this.drop = 0.42 * (1 - k2);
          if (this.t >= 1.05) { this.impact(pos, 0.4); this.phase = 'lie'; this.t = 0; }
        }
        break;
      }
      case 'air': {
        pos.addScaledVector(this.vel, dt);
        this.vy -= 22 * dt;
        pos.y += this.vy * dt;
        if (this.style === 'spin') {
          this.yaw += this.spinRate * dt;
          this.spinRate *= Math.exp(-dt * 1.2);
          this.tilt = damp(this.tilt, LIE * 0.8, 3, dt); // lands face down
        } else if (this.style === 'flip') {
          // One full turn backwards over the flight, ending on the back.
          const k = clamp(this.t / 0.75, 0, 1);
          this.tilt = -(LIE + Math.PI * 2) * smoothstep(0, 1, k) * 0.9;
        } else if (this.style === 'launch') {
          // Rises bent backwards, flips over at the top, comes down back first.
          this.tilt = this.vy > 0 ? damp(this.tilt, -0.9, 4, dt) : damp(this.tilt, -LIE, 6, dt);
          if (this.vy < 0 && !this.flipped) { this.flipped = true; this.tilt -= Math.PI * 2; }
        } else this.tilt = damp(this.tilt, -LIE * 0.9, 5, dt);
        if (Math.random() < 0.5) fx.stream(pos.clone().setY(pos.y + 1.1 * this.size), 0xffffff, { vy: 0, spread: 0.3 * this.size, size: 0.09, life: 0.25 });
        if (pos.y <= floor && this.vy < 0) {
          pos.y = floor;
          this.tilt = wrap(this.tilt);
          const hard = this.style === 'launch' ? 1.6 : 1;
          this.impact(pos, this.bounces === 0 ? hard : 0.5);
          if (this.bounces === 0 && this.vy < -3) {
            this.vy = -this.vy * (this.style === 'launch' ? 0.22 : 0.32);
            this.vel.multiplyScalar(0.6);
            this.bounces = 1;
          } else this.phase = 'slide';
        }
        break;
      }
      case 'slide': {
        pos.y = floor;
        pos.addScaledVector(this.vel, dt);
        this.vel.multiplyScalar(Math.exp(-dt * 4.5));
        this.tilt = damp(this.tilt, this.tilt > 0 ? LIE : -LIE, 10, dt);
        if (this.spinRate) { this.yaw += this.spinRate * dt * 0.3; this.spinRate *= Math.exp(-dt * 4); }
        this.trail -= dt;
        if (this.trail <= 0 && this.vel.length() > 1) {
          this.trail = 0.07;
          fx.dust(pos.clone().addScaledVector(this.vel, -0.05), 0.45 * this.size, 1);
        }
        if (this.vel.length() < 0.35) { this.phase = 'lie'; this.t = 0; }
        break;
      }
      case 'lie': {
        pos.y = floor;
        this.tilt = damp(this.tilt, this.tilt > 0 ? LIE : -LIE, 10, dt);
        // A badly hurt fighter twitches while down.
        if (this.lieTime > 1.2) this.tilt += Math.sin(this.t * 13) * 0.004;
        if (this.t >= this.lieTime) { this.phase = 'getUp'; this.t = 0; this.tilt0 = this.tilt; this.yaw0 = this.yaw; }
        break;
      }
      case 'getUp': {
        pos.y = floor;
        // Push up (face down) or sit up (on the back), then onto the feet;
        // slower and wobblier the more hurt they are.
        const k = smoothstep(0, this.getUpTime, this.t);
        const wob = Math.sin(this.t * 10) * 0.05 * (this.getUpTime - 0.55);
        this.tilt = this.tilt0 * (1 - k) + wob;
        this.yaw = this.yaw0 * (1 - k);
        this.drop = Math.sin(k * Math.PI) * 0.25;
        if (this.t >= this.getUpTime) {
          this.tilt = 0; this.yaw = 0; this.drop = 0;
          this.phase = 'none';
          this.flipped = false;
          fx.dust(pos, 0.5 * this.size, 2);
        }
        break;
      }
      default: break;
    }
    return true;
  }

  // Raises the body while it lies down so it rests on the ground instead of
  // sinking through it (the rig pivots at the feet); lowers it when kneeling.
  lift(thickness) { return thickness * Math.min(1, Math.abs(Math.sin(this.tilt))) - this.drop * this.size; }

  impact(pos, k) {
    const g = this.game;
    const fx = g.effects;
    const s = this.size;
    fx.dust(pos, 0.8 * s * k + 0.3, Math.round(3 + 4 * k));
    fx.ring(pos.clone().setY(pos.y + 0.05), 0xe8dcc0, { maxRadius: 2.5 * s * k + 0.6, duration: 0.45, opacity: 0.45 });
    if (k >= 1 && this.power > 0.6) fx.crack(pos.clone(), 1.6 * s * k);
    fx.burst(pos.clone().setY(pos.y + 0.1), 0x8a6a4c, Math.round(6 + 10 * k), 3, 0.07, 0.7, { up: 2.5, grav: 9, drag: 0.6 });
    g.audio.explosion(0.12 + 0.25 * Math.min(1.2, k));
    bus.emit('fx:shake', { position: pos.clone(), amount: 0.04 + 0.06 * k });
  }
}

// Angle into (-π, π].
function wrap(a) { a %= Math.PI * 2; if (a > Math.PI) a -= Math.PI * 2; if (a <= -Math.PI) a += Math.PI * 2; return a; }
