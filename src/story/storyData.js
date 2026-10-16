import { PROLOGUE } from './sagas/prologue.js';
import { FALLEN_WARRIOR } from './sagas/fallenWarrior.js';

// DRAGON BALL X: THE SHATTERED HEAVENS. The whole campaign outline lives
// here (titles for the journal); playable episodes carry their `steps`
// from the saga files in ./sagas. Later sagas are listed so the journal can
// show what is coming, but have no steps yet.
export const CAMPAIGN = { title: 'THE SHATTERED HEAVENS', season: 'Season One' };

export const SAGAS = [
  { id: 'prologue', label: 'PROLOGUE', title: 'The Warrior Awakens', episodes: ['ep0'] },
  { id: 'saga1', label: 'SAGA ONE', title: 'The Fallen Warrior', boss: 'raxor', episodes: ['ep1', 'ep2', 'ep3', 'ep4', 'ep5'] },
  { id: 'saga2', label: 'SAGA TWO', title: 'The Galactic Dominion', boss: 'veyron', episodes: ['ep6', 'ep7', 'ep8', 'ep9', 'ep10'] },
  { id: 'saga3', label: 'SAGA THREE', title: 'The Primal Awakening', boss: 'kurog', episodes: ['ep11', 'ep12', 'ep13', 'ep14', 'ep15'] },
  { id: 'saga4', label: 'SAGA FOUR', title: 'The Fractured Empire', boss: 'zareth', episodes: ['ep16', 'ep17', 'ep18', 'ep19', 'ep20'] },
  { id: 'saga5', label: 'SAGA FIVE', title: 'The Omega Eclipse', boss: 'draykon', episodes: ['ep21', 'ep22', 'ep23', 'ep24', 'ep25'] },
];

const NUM_WORDS = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN', 'TWENTY', 'TWENTY-ONE', 'TWENTY-TWO', 'TWENTY-THREE', 'TWENTY-FOUR', 'TWENTY-FIVE'];

const TITLES = [
  'A Quiet World', 'The Sky Breaks', 'The Price of Weakness', 'The Golden Awakening', "Raxor's Return", 'The First Seal',
  'The Planet Above the Clouds', 'The Purple Planet', 'Rivals Under Pressure', 'The Storm Within', "The Tyrant's Throne",
  'The Mountain That Moves', 'Gravity of the Ancients', 'The Time Beyond Time', 'Beast Against Warrior', 'The Heart of the Beast',
  "The Emperor's Warning", 'Secrets of the Guardians', 'The Broken Future', 'Assault on the Cosmic Throne', 'The Emperor Falls',
  'The Universe Goes Dark', 'The Final Training', 'Blue Awakening', 'The Last Guardians', 'Omega Draykon: The Final Battle',
];

const PLAYABLE = { ep0: PROLOGUE.ep0, ...FALLEN_WARRIOR };

export const EPISODES = {};
export const EPISODE_ORDER = [];
for (const saga of SAGAS) {
  for (const id of saga.episodes) {
    const n = Number(id.slice(2));
    const def = PLAYABLE[id] || {};
    EPISODES[id] = {
      id, n, saga: saga.id, title: TITLES[n], numberWord: NUM_WORDS[n],
      summary: def.summary || '', steps: def.steps || null, playable: !!def.steps,
      start: def.start || null, scene: def.scene || null, reward: def.reward || null, onStart: def.onStart || null,
    };
    EPISODE_ORDER.push(id);
  }
}

export const sagaOf = (epId) => SAGAS.find((s) => s.episodes.includes(epId));
export const nextEpisode = (epId) => EPISODE_ORDER[EPISODE_ORDER.indexOf(epId) + 1] || null;

// Lore unlocked as you play (shown under Discoveries in the journal).
export const DISCOVERIES = {
  strangeEnergy: { title: 'Your Strange Energy', text: 'Master Orin says your energy should have stopped growing long ago. It keeps rising.' },
  dominion: { title: 'The Galactic Dominion', text: 'An empire led by Lord Veyron. Its soldiers wear red scouters and hunt for unusual energy.' },
  raxor: { title: 'Raxor the Mercenary', text: 'A hired fighter working for Lord Veyron. He came to capture you and bring you back alive.' },
  goldenPower: { title: 'Golden Power', text: 'Golden light flashes around you when you train hard. Orin saw energy like this once, when a whole star system vanished.' },
  livingSeal: { title: 'The Living Seal', text: 'Lord Veyron called your power "the Living Seal". Nobody will tell you what that means yet.' },
  celestialHeart: { title: 'The Celestial Heart', text: 'An ancient energy source that powered the universe. When people tried to steal its power, the First Fracture nearly destroyed everything.' },
  sixSeals: { title: 'The Six Seals', text: 'The guardians split the Celestial Heart\'s power into six seals. Five were hidden across the galaxy. The sixth was bound to a living bloodline.' },
  firstGuardian: { title: 'The First Guardian', text: 'Someone Lord Veyron serves. "The First Guardian will be pleased," he said.' },
};

export { SIDE_QUESTS } from './sagas/sideQuests.js';
