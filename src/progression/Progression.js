import { bus } from '../core/events.js';
import { clamp } from '../core/math.js';
import { FORMS, FORM_ORDER } from './forms.js';
import { ATTACKS } from './attacks.js';

export const STAT_KEYS = ['strength', 'speed', 'ki', 'stamina'];
export const STAT_LABELS = { strength: 'Strength', speed: 'Speed', ki: 'Ki', stamina: 'Stamina' };
export const STAT_TRAINING = {
  strength: 'Punching Training',
  speed: 'Speed Training',
  ki: 'Ki Training',
  stamina: 'Defensive Training',
};

// XP needed to go from `level` to `level + 1`.
export const xpToNext = (level) => 40 + 15 * level;

// Base Power Level grows ~18% per stat level gained. Starting (all level 1) = 1,000.
// SSJ1 unlocks at 5,000 which is ~10 combined level-ups (~5-10 minutes of mixed training).
export const basePowerLevelFor = (levelSum) => Math.round(1000 * Math.pow(1.18, levelSum - 4));

export const POWER_MILESTONES = [2000, 3000, 5000, 7500, 10000, 15000, 25000];

export function defaultProgress() {
  return {
    stats: {
      strength: { level: 1, xp: 0 },
      speed: { level: 1, xp: 0 },
      ki: { level: 1, xp: 0 },
      stamina: { level: 1, xp: 0 },
    },
    unlockedForms: ['base'],
    formMastery: { ssj1: { xp: 0, level: 1 } },
    transformCount: { ssj1: 0 },
    equipped: ['kiBlast', 'chargedBlast', null, null],
    unlockedAttacks: ['kiBlast', 'chargedBlast'],
    bossesDefeated: [],
    bossAttempts: {},
    milestonesSeen: [],
    gravityUnlocked: [1],
    playTime: 0,
    totalPunches: 0,
    bestPowerLevel: 1000,
  };
}

// Owns the player's stats, levels, unlocks and derived combat numbers.
// Everything that "gets stronger" reads its numbers from here.
export class Progression {
  constructor(data) {
    this.data = Object.assign(defaultProgress(), data || {});
    this.recentXp = { strength: 0, speed: 0, ki: 0, stamina: 0 };
  }

  level(stat) { return this.data.stats[stat].level; }

  levelSum() {
    return STAT_KEYS.reduce((s, k) => s + this.data.stats[k].level, 0);
  }

  basePowerLevel() { return basePowerLevelFor(this.levelSum()); }

  powerLevel(formId = 'base') {
    return Math.round(this.basePowerLevel() * FORMS[formId].plMultiplier);
  }

  lowestStat() {
    return STAT_KEYS.reduce((a, b) => (this.level(b) < this.level(a) ? b : a), STAT_KEYS[0]);
  }

  // Awards XP. The lowest stat gets a +50% "fresh training" bonus so varied
  // training is rewarded over grinding one activity.
  addXp(stat, amount, source = '') {
    if (amount <= 0) return 0;
    const s = this.data.stats[stat];
    let gained = amount;
    if (stat === this.lowestStat() && STAT_KEYS.some((k) => this.level(k) > s.level)) gained *= 1.5;
    gained = Math.round(gained * 10) / 10;
    const plBefore = this.basePowerLevel();
    s.xp += gained;
    this.recentXp[stat] += gained;
    let leveled = false;
    while (s.xp >= xpToNext(s.level)) {
      s.xp -= xpToNext(s.level);
      s.level += 1;
      leveled = true;
      bus.emit('stat:levelup', { stat, level: s.level });
    }
    bus.emit('xp', { stat, amount: gained, source });
    if (leveled) {
      const plAfter = this.basePowerLevel();
      bus.emit('powerlevel:changed', { before: plBefore, after: plAfter });
      this.checkUnlocks(plBefore, plAfter);
    }
    return gained;
  }

  checkUnlocks(plBefore, plAfter) {
    for (const m of POWER_MILESTONES) {
      if (plBefore < m && plAfter >= m) bus.emit('milestone', { kind: 'power', value: m });
    }
    if (plAfter > this.data.bestPowerLevel) this.data.bestPowerLevel = plAfter;
    for (const id of FORM_ORDER) {
      const f = FORMS[id];
      if (!f.playable || !f.unlock || this.data.unlockedForms.includes(id)) continue;
      if (f.unlock.type === 'powerLevel' && plAfter >= f.unlock.value) {
        this.data.unlockedForms.push(id);
        bus.emit('form:unlocked', { form: id });
      }
    }
  }

  isFormUnlocked(id) { return this.data.unlockedForms.includes(id); }

  // Transformation mastery (per form).
  mastery(formId) {
    return this.data.formMastery[formId] || { xp: 0, level: 1 };
  }

  addMasteryXp(formId, amount) {
    if (!this.data.formMastery[formId]) this.data.formMastery[formId] = { xp: 0, level: 1 };
    const m = this.data.formMastery[formId];
    m.xp += amount;
    const need = () => 60 + 40 * m.level;
    while (m.level < 10 && m.xp >= need()) {
      m.xp -= need();
      m.level += 1;
      bus.emit('mastery:levelup', { form: formId, level: m.level });
    }
  }

  // ---- Derived combat numbers -------------------------------------------
  strengthMult() { return 1 + 0.13 * (this.level('strength') - 1); }
  kiMult() { return 1 + 0.13 * (this.level('ki') - 1); }
  speedMult() { return 1 + 0.05 * (this.level('speed') - 1); }

  maxHealth() { return 100 + 12 * (this.level('stamina') - 1); }
  maxKi() { return 100 + 10 * (this.level('ki') - 1); }
  maxStamina() { return 60 + 12 * (this.level('stamina') - 1); }
  staminaRegen() { return 9 + 2.2 * (this.level('stamina') - 1); }
  kiChargeRate() { return 16 + 3.5 * (this.level('ki') - 1); }

  // Seconds of holding both grips to fill the power-up meter.
  powerUpTime(formId) {
    const m = this.mastery(formId).level;
    return clamp(5.5 - 0.22 * (this.level('ki') - 1) - 0.3 * (m - 1), 1.6, 5.5);
  }

  formKiDrain(formId) {
    const f = FORMS[formId];
    const m = this.mastery(formId).level;
    return f.kiDrain * clamp(1 - 0.07 * (m - 1), 0.4, 1);
  }

  attack(id) { return ATTACKS[id]; }

  // Phase 1 "next goal" summary shown in menus/HUD.
  nextGoal(bossCatalog) {
    const pl = this.basePowerLevel();
    if (!this.isFormUnlocked('ssj1')) {
      const target = FORMS.ssj1.unlock.value;
      return {
        title: 'Unlock SUPER SAIYAN',
        detail: `Power Level ${pl.toLocaleString('en-US')} / ${target.toLocaleString('en-US')}`,
        progress: clamp((pl - 1000) / (target - 1000), 0, 1),
      };
    }
    if (!this.data.transformCount.ssj1) {
      return { title: 'Transform for the first time!', detail: 'Hold both grips (Space) to power up, then press A (T)', progress: 1 };
    }
    const boss = bossCatalog?.find((b) => !this.data.bossesDefeated.includes(b.id) && b.available);
    if (boss) {
      return { title: `Defeat ${boss.name}`, detail: `Enemy Power Level ${boss.powerLevel.toLocaleString('en-US')}`, progress: clamp(this.powerLevel('ssj1') / boss.powerLevel / 4, 0, 1) };
    }
    const m = this.mastery('ssj1');
    return { title: 'Master Super Saiyan', detail: `Mastery level ${m.level} / 10`, progress: m.level / 10 };
  }

  toJSON() { return this.data; }
}
