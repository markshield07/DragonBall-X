// Attack catalogue. Every attack is implemented; `unlock` lists what unlocks
// it (a stat level, a boss victory or a form; any one is enough). Players
// equip four at a time.
export const ATTACKS = {
  kiBlast: {
    id: 'kiBlast',
    name: 'Basic Ki Blast',
    type: 'blast',
    implemented: true,
    level: 1,
    damage: 7,
    kiCost: 4,
    chargeTime: 0,
    cooldown: 0.28,
    speed: 18,
    radius: 0.09,
    color: 0x7fd8ff,
    unlock: null,
    effects: 'Small fast energy shot from the firing hand.',
  },
  chargedBlast: {
    id: 'chargedBlast',
    name: 'Charged Ki Blast',
    type: 'charged',
    implemented: true,
    level: 1,
    damage: 26,
    kiCost: 16,
    chargeTime: 1.1,
    cooldown: 0.8,
    speed: 13,
    radius: 0.22,
    color: 0xffe26a,
    unlock: null,
    effects: 'Hold to gather energy in your hand, release to launch a heavy blast. Keep holding after it is full and it grows bigger and bigger (uses ki) for a huge explosion.',
  },
  // Beams: hold the trigger (bring both hands together in VR) to charge a
  // sphere, then release or push both hands forward to fire. Aim steers it.
  kamehameha: {
    id: 'kamehameha', name: 'Kamehameha', implemented: true, level: 2, type: 'beam',
    damage: 120, kiCost: 45, chargeTime: 1.6, cooldown: 5, color: 0x4fc3ff, beamRadius: 0.3, duration: 1.4,
    unlock: { stat: ['ki', 4], boss: 'raxor', label: 'Ki level 4 or defeat Raxor' },
    effects: 'Bring both hands together, charge, push forward to unleash a beam. Keep holding after it is full and it grows bigger and bigger (uses ki).',
  },
  galickGun: {
    id: 'galickGun', name: 'Galick Gun', implemented: true, level: 2, type: 'beam',
    damage: 110, kiCost: 40, chargeTime: 1.3, cooldown: 5, color: 0xb44dff, beamRadius: 0.28, duration: 1.2,
    unlock: { stat: ['ki', 6], boss: 'veyron', label: 'Ki level 6 or defeat Lord Veyron' },
    effects: 'Purple two-handed beam that charges faster. Keep holding to make it bigger.',
  },
  kaioken: {
    id: 'kaioken', name: 'Kaio-ken Power Boost', implemented: true, level: 2, type: 'buff',
    damage: 0, kiCost: 30, chargeTime: 0, cooldown: 20, color: 0xff2a2a, duration: 12,
    unlock: { stat: ['strength', 5], label: 'Strength level 5' },
    effects: 'Pull the trigger: red aura, +50% damage and speed for 12 s. Drains stamina.',
  },
  barrage: {
    id: 'barrage', name: 'Energy Barrage', implemented: true, level: 3, type: 'barrage',
    damage: 4, kiCost: 1.5, chargeTime: 0, cooldown: 0.07, speed: 22, radius: 0.07, color: 0xffe066,
    unlock: { stat: ['speed', 4], label: 'Speed level 4' },
    effects: 'Hold the trigger for a rapid stream of blasts.',
  },
  giantSphere: {
    id: 'giantSphere', name: 'Giant Energy Sphere', implemented: true, level: 3, type: 'sphere',
    damage: 300, kiCost: 90, chargeTime: 3, cooldown: 12, speed: 6, radius: 1.1, color: 0x9fe8ff,
    unlock: { stat: ['ki', 10], boss: 'kurog', label: 'Ki level 10 or defeat Titan Kurog' },
    effects: 'Hold the trigger (raise your hand) to gather a huge sphere, release to throw it.',
  },
  ultimateBeam: {
    id: 'ultimateBeam', name: 'Ultimate Blue Energy Beam', implemented: true, level: 4, type: 'beam',
    damage: 600, kiCost: 70, chargeTime: 2, cooldown: 8, color: 0x3fb6ff, beamRadius: 0.5, duration: 1.8, form: 'ssj5',
    unlock: { form: 'ssj5', label: 'Unlock Super Saiyan 5 (usable in that form)' },
    effects: 'The final form\'s exclusive beam. Keep holding to make it bigger.',
  },
};

export const ATTACK_ORDER = ['kiBlast', 'chargedBlast', 'kamehameha', 'galickGun', 'kaioken', 'barrage', 'giantSphere', 'ultimateBeam'];
