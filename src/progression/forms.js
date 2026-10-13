// Every transformation is defined here. All six are playable: Base and SSJ1
// (Phase 1), SSJ2 and SSJ3 (Phase 2), SSJ4 and the custom SSJ5 (Phase 3).
// Forms are climbed in order: power up and press A again while transformed
// to reach the next one.
//
// unlock: { powerLevel, boss } unlocks the form when the base Power Level
// reaches `powerLevel` OR the named boss is defeated (whichever comes first).
//
// plMultiplier: multiplies the displayed Power Level (the big, satisfying number).
// damage/speed/kiDamage: real combat multipliers (kept modest for balance).
// kiDrain: ki per second while sustaining the form (before mastery reductions).
export const FORMS = {
  base: {
    id: 'base',
    name: 'Base Saiyan',
    playable: true,
    plMultiplier: 1,
    damage: 1,
    kiDamage: 1,
    speed: 1,
    defense: 1,
    kiDrain: 0,
    transformKiCost: 0,
    aura: { color: 0xbfe6ff, core: 0xffffff, scale: 0.55, opacity: 0.35, lightning: false },
    hair: { colorOverride: null, lift: 0, lengthScale: 1, extraLong: false },
    eyes: null,
    sound: 'base',
    unlock: null,
  },
  ssj1: {
    id: 'ssj1',
    name: 'Super Saiyan',
    playable: true,
    plMultiplier: 50,
    damage: 1.8,
    kiDamage: 1.7,
    speed: 1.3,
    defense: 1.4,
    kiDrain: 3.2,
    transformKiCost: 40,
    aura: { color: 0xffc21a, core: 0xfff3a0, scale: 1.0, opacity: 0.75, lightning: false },
    hair: { colorOverride: 0xffd21f, lift: 0.55, lengthScale: 1.12, extraLong: false },
    eyes: 0x1fb5a8,
    sound: 'ssj1',
    unlock: { powerLevel: 5000, label: 'Reach Power Level 5,000' },
  },
  ssj2: {
    id: 'ssj2',
    name: 'Super Saiyan 2',
    playable: true,
    plMultiplier: 100,
    damage: 2.4,
    kiDamage: 2.3,
    speed: 1.5,
    defense: 1.7,
    kiDrain: 4,
    transformKiCost: 45,
    aura: { color: 0xffd23a, core: 0xffffff, scale: 1.2, opacity: 0.85, lightning: true },
    hair: { colorOverride: 0xffdf3a, lift: 0.75, lengthScale: 1.2, extraLong: false, sharp: true },
    eyes: 0x1fb5a8,
    sound: 'ssj2',
    unlock: { powerLevel: 12000, boss: 'raxor', label: 'Defeat Raxor or reach Power Level 12,000' },
  },
  ssj3: {
    id: 'ssj3',
    name: 'Super Saiyan 3',
    playable: true,
    plMultiplier: 400,
    damage: 3.2,
    kiDamage: 3.2,
    speed: 1.6,
    defense: 2,
    kiDrain: 6.5,
    transformKiCost: 60,
    aura: { color: 0xffcf1a, core: 0xffffff, scale: 1.6, opacity: 0.9, lightning: true },
    hair: { colorOverride: 0xffd21f, lift: 0.3, lengthScale: 1.25, extraLong: true },
    eyes: 0x1fb5a8,
    sound: 'ssj3',
    unlock: { powerLevel: 25000, boss: 'veyron', label: 'Defeat Lord Veyron or reach Power Level 25,000' },
  },
  ssj4: {
    id: 'ssj4',
    name: 'Super Saiyan 4',
    playable: true,
    plMultiplier: 4000,
    damage: 4.2,
    kiDamage: 3.6,
    speed: 1.8,
    defense: 2.6,
    kiDrain: 5.5,
    transformKiCost: 70,
    aura: { color: 0xff3a2a, core: 0xffd060, scale: 1.5, opacity: 0.85, lightning: false },
    hair: { colorOverride: 0x111111, lift: 0.2, lengthScale: 1.35, extraLong: false, wild: true },
    eyes: 0xffc400,
    body: { fur: 0xb3202a, tail: true, muscle: 1.2 },
    sound: 'ssj4',
    unlock: { powerLevel: 45000, boss: 'kurog', label: 'Defeat Titan Kurog or reach Power Level 45,000' },
  },
  ssj5: {
    id: 'ssj5',
    name: 'Super Saiyan 5',
    playable: true,
    plMultiplier: 20000,
    damage: 5.5,
    kiDamage: 5.5,
    speed: 2,
    defense: 3,
    kiDrain: 7,
    transformKiCost: 80,
    aura: { color: 0x3fb6ff, core: 0xffffff, scale: 1.8, opacity: 0.95, lightning: true },
    hair: { colorOverride: 0x2fa8ff, lift: 0.6, lengthScale: 1.3, extraLong: false },
    eyes: 0x6fe0ff,
    eyesGlow: true,
    body: { muscle: 1.15 },
    sound: 'ssj5',
    unlock: { powerLevel: 80000, boss: 'zareth', label: 'Defeat Emperor Zareth or reach Power Level 80,000' },
  },
};

export const FORM_ORDER = ['base', 'ssj1', 'ssj2', 'ssj3', 'ssj4', 'ssj5'];

export function nextForm(id) {
  const i = FORM_ORDER.indexOf(id);
  return i >= 0 && i < FORM_ORDER.length - 1 ? FORMS[FORM_ORDER[i + 1]] : null;
}
