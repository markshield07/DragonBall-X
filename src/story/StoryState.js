// Story progress saved inside the normal save (progress.data.story), so
// older saves simply get a fresh story and keep everything else.
export const STORY_VERSION = 1;

export function defaultStory() {
  return {
    version: STORY_VERSION,
    started: false, // has the player ever pressed Story Mode
    paused: true, // Free Training hides the story; Story Mode shows it again
    episode: 'ep0', // episode being played (or next to play)
    step: 0, // index into that episode's steps
    obj: null, // progress on the current objective
    scene: {}, // what the training grounds look like right now (ship landed, red sky, ...)
    completed: [], // finished episode ids
    outcomes: {}, // e.g. { ep1Raxor: 'won' | 'lost' }
    choices: {}, // dialogue choices: { key: optionId }
    flags: {}, // important story events that happened
    discoveries: [], // journal lore entries unlocked
    rewards: [], // reward lines shown in the journal
    seen: [], // scenes watched (can be replayed from the journal)
    side: {}, // side quest progress: { id: { stage, done } }
    ending: null, // final choice (later seasons)
  };
}

export function migrateStory(saved) {
  const d = defaultStory();
  if (!saved || typeof saved !== 'object') return d;
  const s = { ...d, ...saved };
  for (const k of ['completed', 'discoveries', 'rewards', 'seen']) if (!Array.isArray(s[k])) s[k] = [];
  for (const k of ['outcomes', 'choices', 'flags', 'scene', 'side']) if (!s[k] || typeof s[k] !== 'object') s[k] = {};
  s.version = STORY_VERSION;
  return s;
}
