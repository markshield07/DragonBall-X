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
    effects: 'Tap for a quick shot. Hold to charge it up (up to 9 seconds) for a much bigger blast.',
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
    effects: 'Hold to gather energy in your hand, let go to launch a heavy blast. Keep holding (up to 9 seconds) and it grows bigger and bigger (uses ki) for a huge explosion.',
  },
  // Beams: hold the trigger (bring both hands together in VR) to charge a
  // sphere, then release or push both hands forward to fire. Aim steers it.
  kamehameha: {
    id: 'kamehameha', name: 'Kamehameha', implemented: true, level: 2, type: 'beam',
    damage: 120, kiCost: 45, chargeTime: 1.6, cooldown: 5, color: 0x4fc3ff, beamRadius: 0.3, duration: 1.4, boom: 5,
    unlock: { stat: ['ki', 4], boss: 'raxor', label: 'Ki level 4 or defeat Raxor' },
    effects: 'Bring both hands together, charge, push forward to unleash a beam. Keep holding (up to 9 seconds) and it grows bigger and bigger (uses ki).',
  },
  galickGun: {
    id: 'galickGun', name: 'Galick Gun', implemented: true, level: 2, type: 'beam',
    damage: 110, kiCost: 40, chargeTime: 1.3, cooldown: 5, color: 0xb44dff, beamRadius: 0.28, duration: 1.2, boom: 5,
    unlock: { stat: ['ki', 6], boss: 'veyron', label: 'Ki level 6 or defeat Lord Veyron' },
    effects: 'Purple two-handed beam that charges faster. Keep holding (up to 9 seconds) to make it bigger.',
  },
  kaioken: {
    id: 'kaioken', name: 'Kaio-ken Power Boost', implemented: true, level: 2, type: 'buff',
    damage: 0, kiCost: 30, chargeTime: 0, cooldown: 18, color: 0xff2a2a, duration: 12,
    unlock: { stat: ['strength', 5], label: 'Strength level 5' },
    effects: 'Tap for Kaio-ken x2. Hold to push it higher: x3, x4, x10, x20! Red aura, more power and speed for 12 s, but it burns stamina.',
  },
  barrage: {
    id: 'barrage', name: 'Energy Barrage', implemented: true, level: 3, type: 'barrage',
    damage: 4, kiCost: 0.4, chargeTime: 0, cooldown: 0.07, speed: 22, radius: 0.07, color: 0xffe066,
    unlock: { stat: ['speed', 4], label: 'Speed level 4' },
    effects: 'Hold for a stream of exploding blasts. The longer you hold (up to 9 seconds), the faster and bigger they get.',
  },
  // The Spirit Bomb (id kept from the Giant Energy Sphere so saves keep it
  // equipped): the most powerful move in the game. It takes a full 15 seconds
  // of gathering energy from the sky before it can be thrown (no ki-level
  // speed-up), and keeps growing for 10 more. The ground shakes the whole time.
  giantSphere: {
    id: 'giantSphere', name: 'Spirit Bomb', implemented: true, level: 4, type: 'sphere', spiritBomb: true,
    damage: 1800, kiCost: 80, chargeTime: 15, fixedCharge: true, overTime: 10, cooldown: 20, speed: 6, radius: 1.6, color: 0x9fe8ff,
    unlock: { stat: ['ki', 10], boss: 'kurog', label: 'Ki level 10 or defeat Titan Kurog' },
    effects: 'The strongest move there is. Raise your hand and hold for 15 seconds while energy flies in from the sky, then throw it. Keep holding (up to 25 seconds) for an even bigger one. Leaves the biggest crater of all.',
  },
  ultimateBeam: {
    id: 'ultimateBeam', name: 'Ultimate Blue Energy Beam', implemented: true, level: 4, type: 'beam',
    damage: 600, kiCost: 70, chargeTime: 2, cooldown: 8, color: 0x3fb6ff, beamRadius: 0.5, duration: 1.8, boom: 7, form: 'ssj5',
    unlock: { form: 'ssj5', label: 'Unlock Super Saiyan 5 (usable in that form)' },
    effects: 'The final form\'s exclusive beam. Keep holding (up to 9 seconds) to make it bigger.',
  },
  // More ki attacks.
  destructoDisc: {
    id: 'destructoDisc', name: 'Destructo Disc', implemented: true, level: 2, type: 'disc',
    damage: 90, kiCost: 30, chargeTime: 1.2, cooldown: 3, speed: 24, radius: 0.32, color: 0xfff3a0,
    unlock: { stat: ['speed', 5], boss: 'raxor', label: 'Speed level 5 or defeat Raxor' },
    effects: 'Hold your hand up to spin a razor disc of ki, let go to throw it. It slices through enemies and explodes. Keep holding (up to 9 seconds) to make it bigger.',
  },
  bigBang: {
    id: 'bigBang', name: 'Big Bang Attack', implemented: true, level: 3, type: 'charged',
    damage: 160, kiCost: 40, chargeTime: 1.5, cooldown: 3, speed: 20, radius: 0.3, color: 0x9fdcff, boom: 2.2,
    unlock: { stat: ['ki', 8], boss: 'veyron', label: 'Ki level 8 or defeat Lord Veyron' },
    effects: 'A fast ball of ki from your open palm with a giant explosion. Keep holding (up to 9 seconds) to make it bigger.',
  },
  specialBeamCannon: {
    id: 'specialBeamCannon', name: 'Special Beam Cannon', implemented: true, level: 3, type: 'beam', spiral: true,
    damage: 200, kiCost: 50, chargeTime: 2.4, cooldown: 6, color: 0xeaff7a, spiralColor: 0xc06cff, beamRadius: 0.13, duration: 1.0, boom: 4.5,
    unlock: { stat: ['strength', 8], boss: 'kurog', label: 'Strength level 8 or defeat Titan Kurog' },
    effects: 'A thin drilling beam wrapped in a purple spiral. Slow to charge but hits very hard. Keep holding (up to 9 seconds) to make it bigger.',
  },
  finalFlash: {
    id: 'finalFlash', name: 'Final Flash', implemented: true, level: 4, type: 'beam',
    damage: 220, kiCost: 55, chargeTime: 2.2, cooldown: 7, color: 0xfff07a, beamRadius: 0.48, duration: 1.6, boom: 6,
    unlock: { stat: ['ki', 12], boss: 'zareth', label: 'Ki level 12 or defeat Emperor Zareth' },
    effects: 'A huge golden beam from both hands. Keep holding (up to 9 seconds) to make it even bigger.',
  },
  masenko: {
    id: 'masenko', name: 'Masenko', implemented: true, level: 2, type: 'beam',
    damage: 90, kiCost: 30, chargeTime: 1.0, cooldown: 3.5, color: 0xffe14a, beamRadius: 0.24, duration: 1.0, boom: 3.5,
    unlock: { stat: ['ki', 3], label: 'Ki level 3' },
    effects: 'A quick golden beam fired from both hands held above your head. Weaker than Kamehameha but fast to charge. Keep holding (up to 9 seconds) to make it bigger.',
  },
  solarFlare: {
    id: 'solarFlare', name: 'Solar Flare', implemented: true, level: 2, type: 'flare',
    damage: 0, kiCost: 20, chargeTime: 0, cooldown: 10, color: 0xffffff,
    unlock: { stat: ['speed', 6], boss: 'veyron', label: 'Speed level 6 or defeat Lord Veyron' },
    effects: 'A blinding flash of light: your enemy can\'t see and stumbles around. Tap to blind them for 2 seconds; hold (up to 9 seconds) to blind them for up to 6.',
  },
  hellzoneGrenade: {
    id: 'hellzoneGrenade', name: 'Hellzone Grenade', implemented: true, level: 3, type: 'grenade',
    damage: 40, kiCost: 50, chargeTime: 2, cooldown: 6, speed: 13, radius: 0.15, color: 0x9cff5a, count: 10,
    unlock: { stat: ['ki', 14], boss: 'zareth', label: 'Ki level 14 or defeat Emperor Zareth' },
    effects: 'Throws a ring of ki blasts that circle around your enemy and then all slam into them at once. Keep holding (up to 9 seconds) for more blasts.',
  },
  triBeam: {
    id: 'triBeam', name: 'Tri-Beam', implemented: true, level: 4, type: 'beam',
    damage: 520, kiCost: 60, chargeTime: 2.5, cooldown: 9, color: 0xfff6c8, beamRadius: 0.42, duration: 1.4, boom: 7, healthCost: 15,
    unlock: { stat: ['strength', 16], boss: 'nyxar', label: 'Strength level 16 or defeat Nyxar' },
    effects: 'Make a triangle with your hands and fire a crushing beam. Very strong, but it costs some of your own health. Keep holding (up to 9 seconds) to make it bigger.',
  },
};

export const ATTACK_ORDER = ['kiBlast', 'chargedBlast', 'masenko', 'kamehameha', 'galickGun', 'kaioken', 'barrage', 'solarFlare', 'destructoDisc', 'bigBang', 'specialBeamCannon', 'hellzoneGrenade', 'finalFlash', 'triBeam', 'ultimateBeam', 'giantSphere'];
