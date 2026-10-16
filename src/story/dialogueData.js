// Who can speak in story scenes. `portrait` tells the dialogue panel how to
// draw them: 'player' (your own warrior), 'avatar' (a rendered NPC
// character), or 'badge' (a drawn face for villains and King Kali).
export const SPEAKERS = {
  player: { name: null, color: '#5cd2ff', portrait: { type: 'player' } },
  orin: { name: 'Master Orin', color: '#ffcc66', portrait: { type: 'avatar', actor: 'orin' } },
  raxor: { name: 'Raxor', color: '#ff6a6a', portrait: { type: 'badge', skin: '#3fae9a', armor: '#9e1f2a', eyes: '#ff2a2a', horns: true } },
  veyron: { name: 'Lord Veyron', color: '#d08aff', portrait: { type: 'badge', skin: '#c9b8e8', armor: '#5a2d91', eyes: '#ff4ae0', crest: true, hologram: true } },
  kali: { name: 'King Kali', color: '#ffd36a', portrait: { type: 'badge', skin: '#3d6fd6', armor: '#1f2238', eyes: '#111111', glasses: true, antennae: true } },
  soldier: { name: 'Dominion Soldier', color: '#c08aff', portrait: { type: 'badge', skin: '#5fae5a', armor: '#5a2d91', eyes: '#ff3a3a', scouter: true } },
  tamo: { name: 'Tamo', color: '#9effb0', portrait: { type: 'avatar', actor: 'trainee0' } },
  lira: { name: 'Lira', color: '#ffb0e0', portrait: { type: 'avatar', actor: 'trainee1' } },
  narrator: { name: '', color: '#aab3d6', portrait: null },
};

// The six warriors' voices, used when a line is written per template:
// Rokan quiet and protective, Kaizen eager, Vexar proud, Toren calm and
// secretive, Zyra fierce, Zeron thoughtful.
export const WARRIOR_NAMES = { rokan: 'Rokan', kaizen: 'Kaizen', vexar: 'Vexar', toren: 'Toren', zyra: 'Zyra', zeron: 'Zeron' };

// A line written for each warrior: P({ default, rokan, kaizen, ... }).
export const P = (t, extra = {}) => ({ s: 'player', t, ...extra });
