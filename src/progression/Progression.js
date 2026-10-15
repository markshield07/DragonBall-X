import { bus } from '../core/events.js';
import { clamp } from '../core/math.js';
import { FORMS, FORM_ORDER } from './forms.js';
import { ATTACKS, ATTACK_ORDER } from './attacks.js';

export const STAT_KEYS = ['strength', 'speed', 'ki', 'stamina'];
export const STAT_LABELS = { strength: 'Strength', speed: 'Speed', ki: 'Ki', stamina: 'Stamina' };
export const STAT_TRAINING = {
  strength: 'Punching Training',
  speed: 'Speed Training',
  ki: 'Ki Training',
  stamina: 'Defensive Training',
};

// XP needed to go from `level` to `level + 1`. LEVEL_EFFORT makes every
// level (so every Super Saiyan form) take that many times more training;
// the Time Chamber is the way to speed it up.
export const LEVEL_EFFORT = 5;
export const xpToNext = (level) => LEVEL_EFFORT * (40 + 15 * level);

// Base Power Level grows ~18% per stat level gained. Starting (all level 1) = 1,000.
// SSJ1 unlocks at 5,000 which is ~10 combined level-ups (~5-10 minutes of mixed training).
// Past ~120,000 (where the last unlocks are) each level adds a steady ~4,800
// instead, so a long-trained character doesn't run off into the billions.
const PL_KNEE = 29;
export const basePowerLevelFor = (levelSum) => {
  const n = levelSum - 4;
  const pl = n <= PL_KNEE ? 1000 * Math.pow(1.18, n) : 1000 * Math.pow(1.18, PL_KNEE) * (1 + 0.04 * (n - PL_KNEE));
  return Math.round(pl / 10) * 10;
};

export const POWER_MILESTONES = [2000, 3000, 5000, 7500, 10000, 15000, 25000, 50000, 100000, 250000, 500000];

// Gravity chamber levels. Each unlocks at a base Power Level or a boss
// victory. `recommended`: below this base Power Level the gravity strains
// you (stamina drains, then health; you collapse instead of finishing).
export const GRAVITY_LEVELS = [
  { g: 1, name: 'Normal' },
  // Gravity training only works inside the Time Chamber, where 10x is the
  // room's own gravity. xp: the XP multiplier at that gravity in there.
  { g: 10, name: 'Difficult', powerLevel: 5000, boss: 'raxor', recommended: 5000, xp: 4 },
  { g: 20, name: 'Advanced', powerLevel: 20000, boss: 'veyron', recommended: 12000, xp: 5 },
  { g: 50, name: 'Extreme', powerLevel: 50000, boss: 'kurog', recommended: 30000, xp: 7 },
  { g: 100, name: 'Legendary', powerLevel: 120000, boss: 'zareth', recommended: 70000, xp: 10 },
];
// The Time Chamber opens together with Super Saiyan (or by beating Raxor):
// it is the fast way to grind towards the higher forms.
export const TIME_CHAMBER_UNLOCK = { powerLevel: 5000, boss: 'raxor', label: 'Defeat Raxor or reach Power Level 5,000' };
export const KALI_XP = 2; // King Kali's planet; everywhere else outside the chamber is 1x
// Simulated time inside the chamber: every real second is one hour inside,
// so a day passes in 24 seconds and a full year in about two and a half hours.
export const TIME_CHAMBER_HOURS_PER_SECOND = 1;
export const TIME_CHAMBER_MILESTONES = [7, 30, 90, 180, 365]; // days inside

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
    timeChamber: { unlocked: false, seconds: 0, milestones: [] },
    sparWins: {},
    trainingPrefs: { difficulty: 'normal', gravity: 1, location: 'arena' },
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
    // Older saves: add fields introduced later.
    const d = defaultProgress();
    this.data.timeChamber = { ...d.timeChamber, ...(this.data.timeChamber || {}) };
    this.data.trainingPrefs = { ...d.trainingPrefs, ...(this.data.trainingPrefs || {}) };
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
    this.refreshUnlocks();
  }

  beat(bossId) { return this.data.bossesDefeated.includes(bossId); }

  // A rule { powerLevel, boss, stat: [key, level], form } is met when ANY of
  // its conditions is.
  meets(rule) {
    if (!rule) return true;
    const pl = this.basePowerLevel();
    if (rule.powerLevel && pl >= rule.powerLevel) return true;
    if (rule.boss && this.beat(rule.boss)) return true;
    if (rule.stat && this.level(rule.stat[0]) >= rule.stat[1]) return true;
    if (rule.form && this.isFormUnlocked(rule.form)) return true;
    return false;
  }

  // Grants every form, attack, gravity level and the Time Chamber whose
  // conditions are now met. Called after level-ups and boss victories.
  refreshUnlocks() {
    const d = this.data;
    // Forms are climbed in order, so unlocking one unlocks those before it.
    let highest = -1;
    FORM_ORDER.forEach((id, i) => {
      const f = FORMS[id];
      if (f.playable && (d.unlockedForms.includes(id) || this.meets(f.unlock))) highest = i;
    });
    for (let i = 1; i <= highest; i++) {
      const id = FORM_ORDER[i];
      if (!d.unlockedForms.includes(id)) {
        d.unlockedForms.push(id);
        bus.emit('form:unlocked', { form: id });
      }
    }
    for (const id of ATTACK_ORDER) {
      const a = ATTACKS[id];
      if (!a.implemented || d.unlockedAttacks.includes(id) || !a.unlock || !this.meets(a.unlock)) continue;
      d.unlockedAttacks.push(id);
      const empty = d.equipped.indexOf(null);
      if (empty >= 0) d.equipped[empty] = id;
      bus.emit('attack:unlocked', { attack: a, equipped: empty >= 0 });
    }
    for (const lv of GRAVITY_LEVELS) {
      if (lv.g === 1 || d.gravityUnlocked.includes(lv.g) || !this.meets(lv)) continue;
      d.gravityUnlocked.push(lv.g);
      bus.emit('gravity:unlocked', { gravity: lv.g });
    }
    if (!d.timeChamber.unlocked && this.meets(TIME_CHAMBER_UNLOCK)) {
      d.timeChamber.unlocked = true;
      bus.emit('timechamber:unlocked', {});
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

  // The "next goal" shown in menus and the HUD: the next transformation,
  // then the next undefeated boss, then mastery.
  nextGoal(bossCatalog) {
    const pl = this.basePowerLevel();
    const fmt = (n) => n.toLocaleString('en-US');
    const next = FORM_ORDER.map((id) => FORMS[id]).find((f) => f.unlock && !this.isFormUnlocked(f.id));
    const lastForm = [...this.data.unlockedForms].sort((a, b) => FORM_ORDER.indexOf(b) - FORM_ORDER.indexOf(a))[0];
    if (lastForm !== 'base' && !this.data.transformCount[lastForm]) {
      return { title: `Transform: ${FORMS[lastForm].name}!`, detail: 'Power up until the bar is full, then transform. Repeat to climb forms.', progress: 1 };
    }
    if (next) {
      const prev = FORM_ORDER[FORM_ORDER.indexOf(next.id) - 1];
      const from = FORMS[prev]?.unlock?.powerLevel || 1000;
      const boss = next.unlock.boss ? bossCatalog?.find((b) => b.id === next.unlock.boss) : null;
      return {
        title: `Unlock ${next.name.toUpperCase()}`,
        detail: `Power Level ${fmt(pl)} / ${fmt(next.unlock.powerLevel)}${boss ? `  ·  or defeat ${boss.name}` : ''}`,
        progress: clamp((pl - from) / (next.unlock.powerLevel - from), 0, 1),
      };
    }
    const boss = bossCatalog?.find((b) => !this.beat(b.id));
    if (boss) {
      const best = this.powerLevel(lastForm);
      return { title: `Defeat ${boss.name}`, detail: `Enemy Power Level ${fmt(boss.powerLevel)}`, progress: clamp(Math.log10(best) / Math.log10(boss.powerLevel), 0, 1) };
    }
    const m = this.mastery(lastForm);
    return { title: `Master ${FORMS[lastForm].name}`, detail: `Mastery level ${m.level} / 10`, progress: m.level / 10 };
  }

  // Highest unlocked form id.
  topForm() {
    return [...this.data.unlockedForms].sort((a, b) => FORM_ORDER.indexOf(b) - FORM_ORDER.indexOf(a))[0];
  }

  toJSON() { return this.data; }
}
