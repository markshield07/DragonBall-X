import * as THREE from 'three';
import { damp, smoothstep } from '../core/math.js';
import { terrainHeight } from '../world/Arena.js';
import { bus } from '../core/events.js';

const LIE = -1.48; // body tilt when flat on the back (radians, pivot at the feet)

// Shared knockdown motion for anyone who can be sent flying (boss, sparring
// partner): launched up and back, slams into the ground, bounces once, skids
// along it leaving a dust trail, lies there for a moment, then gets back up.
// The caller applies `tilt` to the body's rotation.x and `lift` to its height.
export class Knockdown {
  constructor(game) {
    this.game = game;
    this.phase = 'none';
    this.vel = new THREE.Vector3();
    this.vy = 0;
    this.t = 0;
    this.tilt = 0;
    this.lieTime = 0.8;
    this.bounces = 0;
    this.trail = 0;
  }

  get active() { return this.phase !== 'none'; }
  get grounded() { return this.phase === 'slide' || this.phase === 'lie' || this.phase === 'getUp'; }

  // dir: horizontal direction of the blow; power 0..1+; size scales distances and dust.
  start(dir, power = 1, { lie = 0.8, size = 1 } = {}) {
    this.vel.copy(dir).setY(0);
    if (this.vel.lengthSq() < 1e-4) this.vel.set(0, 0, -1);
    this.vel.normalize().multiplyScalar(4 + 5 * Math.min(1.5, power));
    this.vy = 3.2 + 3.2 * Math.min(1.5, power);
    this.phase = 'air';
    this.t = 0;
    this.bounces = 0;
    this.lieTime = lie;
    this.size = size;
    this.power = power;
  }

  // Moves `pos` (the feet). Returns true while the knockdown is running.
  update(dt, pos) {
    if (!this.active) return false;
    const fx = this.game.effects;
    this.t += dt;
    const floor = terrainHeight(pos.x, pos.z);
    switch (this.phase) {
      case 'air': {
        pos.addScaledVector(this.vel, dt);
        this.vy -= 22 * dt;
        pos.y += this.vy * dt;
        this.tilt = damp(this.tilt, LIE * 0.9, 5, dt);
        if (Math.random() < 0.5) fx.stream(pos.clone().setY(pos.y + 1.1 * this.size), 0xffffff, { vy: 0, spread: 0.3 * this.size, size: 0.09, life: 0.25 });
        if (pos.y <= floor && this.vy < 0) {
          pos.y = floor;
          this.impact(pos, this.bounces === 0 ? 1 : 0.5);
          if (this.bounces === 0 && this.vy < -3) {
            this.vy = -this.vy * 0.32;
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
        this.tilt = damp(this.tilt, LIE, 10, dt);
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
        this.tilt = damp(this.tilt, LIE, 10, dt);
        if (this.t >= this.lieTime) { this.phase = 'getUp'; this.t = 0; }
        break;
      }
      case 'getUp': {
        pos.y = floor;
        // Sit up, then spring onto the feet.
        const k = smoothstep(0, 0.55, this.t);
        this.tilt = LIE * (1 - k);
        if (this.t >= 0.55) {
          this.tilt = 0;
          this.phase = 'none';
          fx.dust(pos, 0.5 * this.size, 2);
        }
        break;
      }
      default: break;
    }
    return true;
  }

  // Raises the body while it lies down so its back rests on the ground instead
  // of sinking through it (the rig pivots at the feet).
  lift(thickness) { return thickness * Math.max(0, Math.min(1, this.tilt / LIE)); }

  impact(pos, k) {
    const g = this.game;
    const fx = g.effects;
    const s = this.size;
    fx.dust(pos, 0.8 * s * k + 0.3, Math.round(3 + 4 * k));
    fx.ring(pos.clone().setY(pos.y + 0.05), 0xe8dcc0, { maxRadius: 2.5 * s * k + 0.6, duration: 0.45, opacity: 0.45 });
    if (k >= 1 && this.power > 0.6) fx.crack(pos.clone(), 1.6 * s);
    fx.burst(pos.clone().setY(pos.y + 0.1), 0x8a6a4c, Math.round(6 + 10 * k), 3, 0.07, 0.7, { up: 2.5, grav: 9, drag: 0.6 });
    g.audio.explosion(0.12 + 0.25 * k);
    bus.emit('fx:shake', { position: pos.clone(), amount: 0.04 + 0.06 * k });
  }
}
