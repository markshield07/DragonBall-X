// The eight villains. Every boss can be challenged at any Power Level: the
// Power Level gap scales damage both ways (see Boss.js), so an early attempt
// is brutal and a return visit after training feels very different.
// Their Power Levels sit near what you'd have in the form you usually face
// them in, doubled (2026-10-14) for more of a challenge: Raxor ~SSJ1,
// Veyron ~SSJ2, Kurog ~SSJ3, Zareth ~SSJ4, Draykon ~SSJ5. The last three are
// beyond Super Saiyan 5: you need Kaio-ken on top of it (x10, x20) to match them.
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
    powerLevel: 30000, maxHealth: 420, damage: 1, speed: 1, scale: 1.18,
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
    rewards: { xp: 600 },
  },
  {
    id: 'veyron', name: 'Lord Veyron', title: 'Commander of Purple Ki', phase: 2,
    powerLevel: 100000, maxHealth: 900, damage: 1.25, speed: 1.25, scale: 1.1,
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
    rewards: { xp: 1200 },
  },
  {
    id: 'kurog', name: 'Titan Kurog', title: 'Colossal Warrior', phase: 2,
    powerLevel: 280000, maxHealth: 1300, damage: 1.6, speed: 0.85, scale: 1.65,
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
    rewards: { xp: 2200 },
  },
  {
    id: 'zareth', name: 'Emperor Zareth', title: 'Cosmic Teleporter', phase: 3,
    powerLevel: 800000, maxHealth: 1700, damage: 2, speed: 1.35, scale: 1.12,
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
    rewards: { xp: 3800 },
  },
  {
    id: 'draykon', name: 'Omega Draykon', title: 'The Ultimate Enemy', phase: 3,
    powerLevel: 2400000, maxHealth: 2400, damage: 2.4, speed: 1.2, scale: 1.3,
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
    rewards: { xp: 6000 },
  },
  {
    id: 'nyxar', name: 'Nyxar the Void King', title: 'Ruler of the Dark Dimension', phase: 4,
    powerLevel: 6000000, maxHealth: 3200, damage: 2.8, speed: 1.35, scale: 1.25,
    look: { skin: 0x3a2a5a, armor: 0x101018, dark: 0x05050a, bone: 0xb07aff, eyes: 0xd04aff, crown: true, cape: 0x1a0a2e, shoulderPads: true, spikes: true },
    aura: { color: 0x7a1aff, core: 0xd8b0ff },
    orb: 0x9a3aff,
    attacks: { punch: 2, teleport: 4, homing: 3, beam: 3, barrier: 2, volley: 2 },
    phases: [
      { at: 0.6, aura: { color: 0x2a0a4a, core: 0xff4aff }, speed: 1.25, add: { mega: 2 }, line: 'The void hungers. It will swallow you whole.' },
      { at: 0.3, aura: { color: 0x000000, core: 0xb07aff }, speed: 1.45, grow: 1.1, add: { rush: 2, dash: 2 }, line: 'NO LIGHT ESCAPES THE VOID KING!' },
    ],
    lines: {
      weak: 'You are a flicker of light. I will put you out.',
      close: 'You shine brighter than I expected. Let me dim you.',
      scared: 'This light… it burns the darkness itself!',
      win: 'Darkness always wins.',
      lose: 'The void… is… breaking…',
      loseStrong: 'A light… the void cannot hold…',
    },
    rewards: { xp: 9000 },
  },
  {
    id: 'gorvax', name: 'Gorvax the Planet Eater', title: 'Devourer of Worlds', phase: 4,
    powerLevel: 15000000, maxHealth: 4400, damage: 3.2, speed: 1.0, scale: 1.95,
    look: { skin: 0x6a3a1a, armor: 0x2a2a2a, dark: 0x140c08, bone: 0xffe0a0, eyes: 0xff7a1a, horns: true, tusks: true, bulky: true, spikes: true, tail: true },
    aura: { color: 0xff6a00, core: 0xfff0a0 },
    orb: 0xff7a1a,
    attacks: { punch: 4, slam: 4, rush: 3, mega: 2, volley: 2 },
    phases: [
      { at: 0.6, aura: { color: 0xff2a00, core: 0xffd080 }, speed: 1.2, grow: 1.08, add: { beam: 2 }, line: 'GORVAX HUNGRY! GORVAX EAT YOUR PLANET!' },
      { at: 0.3, aura: { color: 0xffffff, core: 0xff6a00 }, speed: 1.35, grow: 1.1, add: { teleport: 2, homing: 2 }, line: 'NOTHING LEFT BUT GORVAX!' },
    ],
    lines: {
      weak: 'Small snack. Gorvax eat you in one bite.',
      close: 'Tough snack. Gorvax like tough snack.',
      scared: 'Snack… bigger than planet?!',
      win: 'Gorvax still hungry.',
      lose: 'Gorvax… full… of defeat…',
      loseStrong: 'Gorvax… bit off… too much…',
    },
    rewards: { xp: 13000 },
  },
  {
    id: 'azrath', name: 'Azrath the Endless', title: 'The God Beyond Omega', phase: 5,
    powerLevel: 40000000, maxHealth: 6000, damage: 3.8, speed: 1.5, scale: 1.4,
    look: { skin: 0xf4f0e8, armor: 0xd4a017, dark: 0x1a1406, bone: 0xffffff, eyes: 0x00e8ff, crown: true, halo: true, wings: true, tail: true, horns: true, shoulderPads: true },
    aura: { color: 0xffd23a, core: 0xffffff },
    orb: 0xffe066,
    attacks: { punch: 3, volley: 3, dash: 3, beam: 3, homing: 2, teleport: 3, barrier: 1 },
    phases: [
      { at: 0.7, aura: { color: 0x00e8ff, core: 0xffffff }, speed: 1.2, add: { mega: 2, slam: 2 }, line: 'Interesting. You have earned my second form.' },
      { at: 0.45, aura: { color: 0xff2a6a, core: 0xffd0e0 }, speed: 1.35, grow: 1.1, add: { rush: 3 }, line: 'Gods do not bleed. And yet…' },
      { at: 0.2, aura: { color: 0xffffff, core: 0xffd23a }, speed: 1.6, grow: 1.12, add: { mega: 2, beam: 2 }, line: 'ENDLESS! MY POWER HAS NO END!' },
    ],
    lines: {
      weak: 'Kneel, mortal. Even Omega bowed to me.',
      close: 'A mortal who can stand before a god. Remarkable.',
      scared: 'This cannot be… a mortal surpassing a god?!',
      win: 'I am Endless. You are not.',
      lose: 'Even the endless… end…',
      loseStrong: 'You are… the new god…',
    },
    rewards: { xp: 18000 },
  },
];

export const bossById = (id) => BOSSES.find((b) => b.id === id) || BOSSES[0];
