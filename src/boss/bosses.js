// The five villains. Every boss can be challenged at any Power Level: the
// Power Level gap scales damage both ways (see Boss.js), so an early attempt
// is brutal and a return visit after training feels very different.
//
// attacks: weighted moves the AI picks from. Moves are implemented in Boss.js:
//   punch   telegraphed melee (glowing fist + red disc under you; step away or block)
//   volley  a burst of ki orbs from both hands
//   mega    rises and throws a huge orb
//   barrier purple shield that absorbs ki blasts; punch through it to stagger
//   dash    blurs to a new spot around you
//   slam    leaps and crashes down on a red ring; step out of it
//   rush    shoulder charge along a warning line; sidestep it
//   teleport vanishes and reappears beside or behind you, then strikes
//   beam    charges, locks a red aim line, then fires a beam down it
//   homing  slow homing orbs (block or punch them away)
// phases: health fractions where the boss powers up (new aura, faster).
export const BOSSES = [
  {
    id: 'raxor', name: 'Raxor', title: 'Aggressive Alien Fighter', phase: 1,
    powerLevel: 18000, maxHealth: 420, damage: 1, speed: 1, scale: 1.18,
    look: { skin: 0x3fae9a, armor: 0x9e1f2a, dark: 0x2a1a2e, bone: 0xe8e0d0, eyes: 0xff2a2a, horns: true, spikes: true, crest: true },
    aura: { color: 0xff4a6a, core: 0xffc0d0 },
    orb: 0xff9a1a,
    attacks: { punch: 5, volley: 4 },
    phases: [{ at: 0.5, aura: { color: 0xc02aff, core: 0xff9ae0 }, speed: 1.35, add: { mega: 2 }, line: 'Enough games! Feel my REAL power!' }],
    lines: {
      weak: 'You call that power? I\'ll crush you, weakling!',
      close: 'Hmph. You\'ve gotten stronger. It won\'t matter!',
      scared: 'Wh-what is this power level?! Impossible!',
      win: 'Ha! Come back when you\'re a real warrior!',
      lose: 'This… isn\'t… over…',
      loseStrong: 'I… lost… to a Super Saiyan…',
    },
    rewards: { xp: 40 },
  },
  {
    id: 'veyron', name: 'Lord Veyron', title: 'Commander of Purple Ki', phase: 2,
    powerLevel: 900000, maxHealth: 900, damage: 1.25, speed: 1.25, scale: 1.1,
    look: { skin: 0xc9b8e8, armor: 0x5a2d91, dark: 0x1d1530, bone: 0xf2e6ff, eyes: 0xff4ae0, cape: 0x3a1a5e, crest: true, shoulderPads: true },
    aura: { color: 0xa04aff, core: 0xf0c0ff },
    orb: 0xc05aff,
    attacks: { punch: 3, volley: 4, barrier: 2, dash: 3 },
    phases: [{ at: 0.45, aura: { color: 0xff3ad0, core: 0xffd0f6 }, speed: 1.3, add: { mega: 2 }, line: 'You dare scratch my armor? Witness my true power!' }],
    lines: {
      weak: 'A Saiyan monkey? My soldiers could handle you.',
      close: 'Interesting… you might amuse me for a minute.',
      scared: 'This energy… no Saiyan should be this strong!',
      win: 'Kneel. That is where you belong.',
      lose: 'My empire… will remember this…',
      loseStrong: 'Defeated… by a Saiyan…',
    },
    rewards: { xp: 70 },
  },
  {
    id: 'kurog', name: 'Titan Kurog', title: 'Colossal Warrior', phase: 2,
    powerLevel: 3500000, maxHealth: 1300, damage: 1.6, speed: 0.85, scale: 1.65,
    look: { skin: 0xb5703c, armor: 0x5c5f66, dark: 0x2a2420, bone: 0xf0e2c0, eyes: 0xffd21a, horns: true, bulky: true, tusks: true },
    aura: { color: 0xff8a1a, core: 0xffe0a0 },
    orb: 0xff6a1a,
    attacks: { punch: 4, slam: 4, rush: 3 },
    phases: [{ at: 0.4, aura: { color: 0xff3a1a, core: 0xffc080 }, speed: 1.25, add: { volley: 2 }, line: 'KUROG SMASH YOU INTO THE GROUND!' }],
    lines: {
      weak: 'Tiny. Kurog step on you.',
      close: 'Small one hits hard. Good. Kurog hits harder.',
      scared: 'Small one… stronger than mountain?!',
      win: 'Too small. Too weak.',
      lose: 'Kurog… falls…',
      loseStrong: 'Small one… is giant inside…',
    },
    rewards: { xp: 100 },
  },
  {
    id: 'zareth', name: 'Emperor Zareth', title: 'Cosmic Teleporter', phase: 3,
    powerLevel: 40000000, maxHealth: 1700, damage: 2, speed: 1.35, scale: 1.12,
    look: { skin: 0xe8ecf4, armor: 0x1a2a6a, dark: 0x0c1028, bone: 0xffd84a, eyes: 0x3af0ff, crown: true, halo: true, shoulderPads: true },
    aura: { color: 0x3a8aff, core: 0xd0f0ff },
    orb: 0x5ac8ff,
    attacks: { punch: 2, teleport: 4, homing: 3, beam: 3, volley: 2 },
    phases: [{ at: 0.5, aura: { color: 0x3af0ff, core: 0xffffff }, speed: 1.3, add: { mega: 1 }, line: 'Time and space bend to me. You cannot run.' }],
    lines: {
      weak: 'An insect has wandered into my throne room.',
      close: 'Your power is… acceptable. Let us see it.',
      scared: 'This power rivals the stars themselves…',
      win: 'The universe forgets you already.',
      lose: 'An emperor… does not… fall…',
      loseStrong: 'So this is a true Saiyan…',
    },
    rewards: { xp: 140 },
  },
  {
    id: 'draykon', name: 'Omega Draykon', title: 'The Ultimate Enemy', phase: 3,
    powerLevel: 900000000, maxHealth: 2400, damage: 2.4, speed: 1.2, scale: 1.3,
    look: { skin: 0x2a2a34, armor: 0x8a0f1a, dark: 0x101014, bone: 0xd0d0e0, eyes: 0xff1a1a, horns: true, spikes: true, wings: true, tail: true },
    aura: { color: 0xff1a3a, core: 0xffa0a0 },
    orb: 0xff2a4a,
    attacks: { punch: 3, volley: 3, dash: 2, beam: 2, homing: 2 },
    phases: [
      { at: 0.66, aura: { color: 0x8a1aff, core: 0xe0a0ff }, speed: 1.2, grow: 1.12, add: { teleport: 3, slam: 2 }, line: 'You forced my second form. You will regret it.' },
      { at: 0.33, aura: { color: 0x1a1a1a, core: 0xff2a2a }, speed: 1.45, grow: 1.12, add: { mega: 2, rush: 2 }, line: 'FINAL FORM. THIS PLANET ENDS WITH YOU!' },
    ],
    lines: {
      weak: 'I have erased galaxies stronger than you.',
      close: 'At last, a warrior worth my attention.',
      scared: 'Impossible… a power beyond Omega?!',
      win: 'Omega is eternal.',
      lose: 'Omega… is… ended…',
      loseStrong: 'You are… the legend…',
    },
    rewards: { xp: 200 },
  },
];

export const bossById = (id) => BOSSES.find((b) => b.id === id) || BOSSES[0];
