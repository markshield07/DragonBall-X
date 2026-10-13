import * as THREE from 'three';
import { bus } from '../core/events.js';
import { clamp, rand } from '../core/math.js';
import { FORMS, nextForm } from '../progression/forms.js';
import { Lightning } from '../fx/Effects.js';
import { PowerUpFX } from '../fx/PowerUpFX.js';
import { key } from '../ui/controls.js';

const _c = new THREE.Vector3();
const BURST_AT = 1.05; // seconds into the sequence when the burst happens
const SEQUENCE_LEN = 2.6;

// The multi-stage transformation experience:
//  1 Charging      hold both grips: hands glow, hum starts, energy streams, ki fills
//  2 Power rising  aura expands, lightning arcs between hands, sound + haptics ramp
//  3 Transform     press A when the meter is full: build-up, burst, shockwave, new form
//  4 Sustained     animated aura, stronger attacks, ki drain, mastery XP
//  5 Power down    press A again (or run out of ki): aura fades, back to base
//
// No camera shake, forced head motion or full-screen flashes: all drama is in
// the hands, aura, environment and sound.
export class Transformation {
  constructor(game) {
    this.game = game;
    this.state = 'idle'; // idle | charging | transforming | poweringDown
    this.charge = 0; // 0..1 power-up meter
    this.seqTime = 0;
    this.targetForm = null;
    this.powerDownTime = 0;
    this.burstDone = false;
    this.sustainTime = 0;
    this.lightning = [];
    for (let i = 0; i < 5; i++) {
      const l = new Lightning(0xd8f2ff, 9);
      game.renderer.scene.add(l.mesh);
      this.lightning.push(l);
    }
    this.lightningTimer = 0;
    this.prompted = false;
    this.readyGrace = 0; // lets A be pressed just after letting go of the grips

    bus.on('punch:hit', (h) => {
      // Strong attacks interact with the aura (it flares).
      if (this.game.player.form !== 'base') this.game.playerAura.intensity = Math.min(1.6, this.game.playerAura.intensity + 0.25 * h.power);
    });
  }

  get player() { return this.game.player; }
  get progress() { return this.game.progress; }

  canTransform() {
    const nf = nextForm(this.player.form);
    if (!nf || !nf.playable) return { ok: false, reason: this.player.form === 'base' ? 'locked' : 'max' };
    if (!this.progress.isFormUnlocked(nf.id)) return { ok: false, reason: 'locked', form: nf };
    if (this.charge < 0.999 && this.readyGrace <= 0) return { ok: false, reason: 'charge', form: nf };
    if (this.player.ki < nf.transformKiCost) return { ok: false, reason: 'ki', form: nf };
    return { ok: true, form: nf };
  }

  update(dt, input, { enabled }) {
    const p = this.player;
    const L = input.hands.left;
    const R = input.hands.right;
    const bothGrips = enabled && L.grip > 0.6 && R.grip > 0.6;
    const pressA = enabled && R.primaryDown;

    // ---- State transitions
    if (this.state === 'transforming') {
      this.updateSequence(dt);
    } else if (this.state === 'poweringDown') {
      this.powerDownTime += dt;
      if (this.powerDownTime > 0.6 && p.form !== 'base') this.setForm('base');
      if (this.powerDownTime > 1.5) this.state = 'idle';
    } else {
      if (bothGrips) {
        if (this.state !== 'charging') { this.state = 'charging'; bus.emit('powerup:start', {}); }
        const t = this.progress.powerUpTime(p.form === 'base' ? 'ssj1' : p.form);
        this.charge = clamp(this.charge + dt / t, 0, 1);
        if (this.charge >= 0.999) this.readyGrace = 1.2;
        p.ki = Math.min(this.progress.maxKi(), p.ki + this.progress.kiChargeRate() * dt);
        if (p.form !== 'base') this.progress.addMasteryXp(p.form, dt * 2);
        const can = this.canTransform();
        if (can.ok && !this.prompted) { this.prompted = true; bus.emit('transform:ready', { form: can.form }); }
      } else {
        if (this.state === 'charging') { this.state = 'idle'; bus.emit('powerup:end', {}); }
        this.readyGrace -= dt;
        this.charge = Math.max(0, this.charge - dt * 0.6);
        this.prompted = false;
      }
      if (pressA) this.onTransformButton();
    }

    // ---- Sustained form
    if (p.form !== 'base' && this.state !== 'transforming' && this.state !== 'poweringDown') {
      const drain = this.progress.formKiDrain(p.form);
      p.ki -= drain * dt * (this.state === 'charging' ? 0 : 1);
      this.sustainTime += dt;
      this.progress.addMasteryXp(p.form, dt * 0.8);
      if (p.ki <= 0) {
        p.ki = 0;
        bus.emit('hud:message', { text: 'Out of ki! Powering down…', color: '#ff9a4d' });
        this.powerDown();
      }
    }

    this.updateVisuals(dt, bothGrips);
  }

  onTransformButton() {
    const p = this.player;
    if (p.form !== 'base' && this.state !== 'charging') {
      this.powerDown();
      return;
    }
    const can = this.canTransform();
    if (can.ok) {
      this.begin(can.form.id);
    } else if (p.form !== 'base') {
      // Still powering up (desktop players keep Space held) but can't go any
      // higher: A powers down, as it does when not charging.
      this.powerDown();
    } else if (can.reason === 'locked') {
      const f = can.form || FORMS.ssj1;
      bus.emit('hud:message', { text: f.unlock ? `Locked: ${f.unlock.label}` : 'Not available yet', color: '#ff9a4d' });
    } else if (can.reason === 'charge') {
      bus.emit('hud:message', { text: `Power up first! ${key(this.game, 'powerUp')}`, color: '#ffd24d' });
    } else if (can.reason === 'ki') {
      bus.emit('hud:message', { text: 'Not enough ki to transform', color: '#ff9a4d' });
    } else if (can.reason === 'max') {
      bus.emit('hud:message', { text: 'This is your highest form.', color: '#ffd24d' });
    }
  }

  begin(formId) {
    this.readyGrace = 0;
    this.state = 'transforming';
    this.targetForm = formId;
    this.seqTime = 0;
    this.burstDone = false;
    bus.emit('transform:start', { form: formId });
    this.game.audio.transform(formId);
  }

  updateSequence(dt) {
    const g = this.game;
    this.seqTime += dt;
    const t = this.seqTime;
    const f = FORMS[this.targetForm];
    const intensity = g.visualIntensity;
    const head = this.player.headWorld;
    const ground = this.player.groundY();
    const feet = new THREE.Vector3(head.x, ground + 0.05, head.z);
    if (t < BURST_AT) {
      // Build-up: aura flares, sky darkens, energy spirals and debris lifts.
      const k = t / BURST_AT;
      g.arena.tint = k * intensity;
      g.playerAura.target = 0.6 + k * 0.8;
      g.playerAura.setStyle({ color: 0xfff3c0, core: 0xffffff, scale: 0.7 + k * 0.6 });
      for (let i = 0; i < 3; i++) {
        const a = rand(0, Math.PI * 2);
        const r = rand(0.6, 1.4);
        g.effects.stream(new THREE.Vector3(feet.x + Math.cos(a) * r, ground + rand(0, 0.4), feet.z + Math.sin(a) * r), i ? f.aura.color : 0xffffff, { vy: 2 + k * 4, spread: 0.05, size: 0.05 + 0.05 * k, life: 0.6 });
      }
      if (Math.random() < 0.3) g.effects.burst(new THREE.Vector3(feet.x + rand(-2, 2), ground + 0.1, feet.z + rand(-2, 2)), 0x8a6a4c, 2, 1.5, 0.09, 1.2, { up: 2.5, drag: 0.3 });
      g.haptic('left', 0.2 + 0.6 * k, 30);
      g.haptic('right', 0.2 + 0.6 * k, 30);
    } else if (!this.burstDone) {
      this.burstDone = true;
      this.setForm(this.targetForm);
      // Burst: stylized shockwave through the environment (not a screen flash).
      g.effects.ring(feet, f.aura.color, { maxRadius: 22, duration: 1.4, opacity: 0.9 });
      g.effects.ring(feet, 0xffffff, { maxRadius: 12, duration: 0.9, opacity: 0.7 });
      g.effects.ring(new THREE.Vector3(feet.x, ground + 1.0, feet.z), f.aura.color, { maxRadius: 6, duration: 0.7, opacity: 0.6 });
      g.effects.burst(new THREE.Vector3(feet.x, ground + 1.0, feet.z), f.aura.color, 80, 7, 0.12, 1.1, { drag: 1.2 });
      g.effects.burst(new THREE.Vector3(feet.x, ground + 0.2, feet.z), 0xffffff, 30, 5, 0.08, 0.8, { up: 3 });
      if (!this.player.flying) g.effects.crack(feet, 3.2);
      g.haptic('left', 1, 400);
      g.haptic('right', 1, 400);
      g.playerAura.intensity = 1.6;
      const first = !this.progress.data.transformCount[this.targetForm];
      this.progress.data.transformCount[this.targetForm] = (this.progress.data.transformCount[this.targetForm] || 0) + 1;
      this.progress.addMasteryXp(this.targetForm, 15);
      this.player.ki -= f.transformKiCost;
      this.sustainTime = 0;
      bus.emit('transform:burst', { form: this.targetForm, first });
    } else {
      g.arena.tint = Math.max(0, intensity * (1 - (t - BURST_AT) / 1.2));
      if (t >= SEQUENCE_LEN) {
        g.arena.tint = 0;
        this.state = 'idle';
        this.charge = 0;
        bus.emit('transform:end', { form: this.targetForm });
      }
    }
  }

  powerDown() {
    // Already on the way down: calling again restarted the timer every frame
    // when ki hit zero, so you stayed stuck in the form with no way out.
    if (this.player.form === 'base' || this.state === 'poweringDown') return;
    if (this.state === 'charging') bus.emit('powerup:end', {});
    this.charge = 0;
    this.prompted = false;
    this.state = 'poweringDown';
    this.powerDownTime = 0;
    this.game.audio.powerDown();
    bus.emit('powerdown', { form: this.player.form });
  }

  setForm(id) {
    const prev = this.player.form;
    this.player.form = id;
    const f = FORMS[id];
    this.game.mirror?.setForm(id);
    this.game.playerBody?.setForm(id);
    this.game.hands?.setForm?.(id);
    bus.emit('form:changed', { form: id, prev });
    if (id === 'base') this.game.playerAura.setStyle({ color: f.aura.color, core: f.aura.core, scale: f.aura.scale });
  }

  forceBase() {
    this.state = 'idle';
    this.charge = 0;
    this.game.arena.tint = 0;
    if (this.player.form !== 'base') this.setForm('base');
  }

  // Hands, aura, lightning and sound every frame.
  updateVisuals(dt, charging) {
    const g = this.game;
    const p = this.player;
    const f = FORMS[p.form];
    const aura = g.playerAura;
    const transformed = p.form !== 'base';
    const c = this.charge;
    const kiLv = this.progress.level('ki');

    // Aura target
    if (this.state !== 'transforming') {
      if (p.kaioken > 0) {
        // Kaio-ken: a blazing red aura over any form.
        aura.setStyle({ color: 0xff2a1a, core: 0xffb0a0, scale: Math.max(1, f.aura.scale) * (1 + 0.3 * c) });
        aura.target = 0.9 + 0.3 * c;
      } else if (this.state === 'poweringDown') aura.target = 0;
      else if (transformed) {
        aura.setStyle({ color: f.aura.color, core: f.aura.core, scale: f.aura.scale * (1 + 0.3 * c) });
        aura.target = 0.75 + 0.5 * c;
      } else if (charging) {
        // Base aura grows with charge and ki level (faint at first).
        aura.setStyle({ color: f.aura.color, core: f.aura.core, scale: f.aura.scale + 0.25 * c + 0.03 * kiLv });
        aura.target = 0.15 + 0.75 * c * (0.6 + 0.04 * kiLv);
      } else aura.target = 0;
    }

    // Hands glow
    const handColor = transformed ? 0xffd23a : this.state === 'transforming' ? 0xfff3c0 : 0x9fdcff;
    const baseGlow = transformed ? 0.45 : 0;
    // Brawler feel: fists blaze up quickly while powering up.
    const chargeGlow = charging ? 0.4 + 0.9 * c : 0;
    const seqGlow = this.state === 'transforming' ? 1.2 : 0;
    for (const side of ['left', 'right']) {
      const fireCharge = p.chargeLevel(side);
      const lvl = Math.max(baseGlow, chargeGlow, seqGlow, fireCharge * (0.6 + 0.04 * kiLv)) * (0.7 + 0.03 * kiLv);
      g.hands.setGlow(side, lvl, fireCharge > 0.05 && !charging ? 0xffe26a : handColor, transformed ? 1 : charging ? 0.2 + c * 0.8 : 0, transformed ? 0xffd23a : 0x9fdcff, dt);
      const h = g.hands.hands[side];
      if (h.group.visible && (charging || transformed) && Math.random() < (charging ? 0.4 + c : 0.25) * g.particleBudget) {
        // Energy streams around the arms
        g.effects.stream(h.worldPos, transformed ? f.aura.color : 0xbfe6ff, { vy: 0.6 + c, spread: 0.08, size: 0.025 + 0.03 * c, life: 0.4 });
      }
    }

    // Lightning arcs between the hands (stage 2) and around the body when transformed
    this.lightningTimer -= dt;
    const maxBolts = g.preset.lightning;
    let wantBolts = this.state === 'transforming' ? maxBolts : charging && c > 0.55 ? Math.ceil(maxBolts * (c - 0.5) * 2) : 0;
    // Super Saiyan 2 and above crackle with lightning around the body.
    const bodyBolts = wantBolts === 0 && transformed && f.aura.lightning && this.state !== 'poweringDown';
    if (bodyBolts) wantBolts = Math.min(maxBolts, 2);
    if (this.lightningTimer <= 0) {
      this.lightningTimer = 0.06;
      const L = g.hands.hands.left;
      const R = g.hands.hands.right;
      this.lightning.forEach((l, i) => {
        if (bodyBolts) {
          if (i >= wantBolts || Math.random() < 0.55) { l.mesh.visible = false; return; }
          l.mat.color.setHex(p.form === 'ssj5' ? 0xbfe8ff : 0xfff2a8);
          l.mat.opacity = 0.8 * g.visualIntensity;
          const head = p.headWorld;
          const a = rand(0, Math.PI * 2);
          const from = new THREE.Vector3(head.x + Math.cos(a) * rand(0.3, 0.55), head.y - rand(0.1, 1.2), head.z + Math.sin(a) * rand(0.3, 0.55));
          l.set(from, from.clone().add(new THREE.Vector3(rand(-0.3, 0.3), rand(-0.5, 0.3), rand(-0.3, 0.3))), 0.006, 0.06);
          return;
        }
        if (i >= wantBolts || !L.group.visible || !R.group.visible || Math.random() < 0.25) { l.mesh.visible = false; return; }
        l.mat.color.setHex(transformed ? 0xfff2a8 : 0xd8f2ff);
        l.mat.opacity = 0.9 * g.visualIntensity;
        if (i === 0) l.set(L.worldPos, R.worldPos, 0.008, 0.07);
        else {
          const from = i % 2 ? L.worldPos : R.worldPos;
          const to = from.clone().add(new THREE.Vector3(rand(-0.4, 0.4), rand(-0.6, 0.2), rand(-0.4, 0.4)));
          l.set(from, to, 0.006, 0.05);
        }
      });
    }

    // Rocks float up around the fighter and dust rings pulse while powering up.
    this.powerFx ||= new PowerUpFX(g.renderer.scene, g.effects);
    const head = p.headWorld;
    _c.set(head.x, p.groundY(), head.z);
    const fxLevel = this.state === 'transforming' ? 1 : charging ? 0.35 + 0.65 * c : 0;
    this.powerFx.update(dt, _c, fxLevel * g.visualIntensity);
    if (charging && !this.wasCharging) g.effects.crack(_c, 1.6);
    this.wasCharging = charging;

    // Sound: charge hum + sustained aura
    const hum = charging ? 0.25 + 0.75 * c : this.state === 'transforming' ? 1 : 0;
    g.audio.setLoop('charge', hum * (transformed ? 1.1 : 0.8), 0.8 + c * 1.2 + (transformed ? 0.5 : 0), { base: 55, noiseFreq: 500 });
    const auraLoop = transformed && this.state !== 'poweringDown' ? 0.35 + 0.2 * c : 0;
    g.audio.setLoop('aura', auraLoop, 1.4, { base: 82, noiseFreq: 1400, type: 'triangle' });

    // Charging haptics (stage 2)
    if (charging && Math.random() < 0.35) {
      g.haptic('left', 0.1 + 0.5 * c, 25);
      g.haptic('right', 0.1 + 0.5 * c, 25);
    }

    aura.update(dt, g.renderer.camera, g.visualIntensity * f.aura.opacity + (transformed ? 0 : 0.3 * c));
  }
}
