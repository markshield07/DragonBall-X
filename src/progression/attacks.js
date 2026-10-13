// Attack catalogue. The full list from the design is here so unlock
// conditions and the 4-slot loadout already work; Phase 1 implements the
// first two (`implemented: true`). The others show in the menu as locked.
export const ATTACKS = {
  kiBlast: {
    id: 'kiBlast',
    name: 'Basic Ki Blast',
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
    effects: 'Hold to gather energy in your hand, release to launch a heavy blast.',
  },
  kamehameha: {
    id: 'kamehameha', name: 'Kamehameha', implemented: false, level: 2,
    damage: 120, kiCost: 60, chargeTime: 2.5, cooldown: 8, color: 0x4fc3ff,
    unlock: { label: 'Phase 2: defeat Raxor and master Super Saiyan' },
    effects: 'Bring both hands together, charge, push forward to unleash a beam.',
  },
  galickGun: {
    id: 'galickGun', name: 'Galick Gun', implemented: false, level: 2,
    damage: 110, kiCost: 55, chargeTime: 2.2, cooldown: 8, color: 0xb44dff,
    unlock: { label: 'Phase 2' }, effects: 'Purple two-handed beam.',
  },
  kaioken: {
    id: 'kaioken', name: 'Kaio-ken Power Boost', implemented: false, level: 2,
    damage: 0, kiCost: 30, chargeTime: 1, cooldown: 20, color: 0xff2a2a,
    unlock: { label: 'Phase 2' }, effects: 'Temporary red-aura strength boost that drains stamina.',
  },
  barrage: {
    id: 'barrage', name: 'Energy Barrage', implemented: false, level: 3,
    damage: 8, kiCost: 3, chargeTime: 0, cooldown: 0.08, color: 0xffe066,
    unlock: { label: 'Phase 2' }, effects: 'Alternate hands to fire a rapid stream of blasts.',
  },
  giantSphere: {
    id: 'giantSphere', name: 'Giant Energy Sphere', implemented: false, level: 3,
    damage: 300, kiCost: 120, chargeTime: 5, cooldown: 30, color: 0x9fe8ff,
    unlock: { label: 'Phase 3' }, effects: 'Raise both hands overhead to gather a huge sphere.',
  },
  ultimateBeam: {
    id: 'ultimateBeam', name: 'Ultimate Blue Energy Beam', implemented: false, level: 4,
    damage: 600, kiCost: 150, chargeTime: 3, cooldown: 25, color: 0x3fb6ff,
    unlock: { label: 'Phase 3: Super Saiyan 5 only' }, effects: 'The final form\'s exclusive beam.',
  },
};

export const ATTACK_ORDER = ['kiBlast', 'chargedBlast', 'kamehameha', 'galickGun', 'kaioken', 'barrage', 'giantSphere', 'ultimateBeam'];
