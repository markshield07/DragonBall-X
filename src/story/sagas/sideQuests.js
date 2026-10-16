// Optional side missions. Each has a title, an introduction, a clear
// objective, dialogue, real gameplay, a reward and saved progress.
// unlockAfter: the episode that makes it available in the journal.
// setup: what the game switches to when you start it.
export const SIDE_QUESTS = {
  orinsTest: {
    title: "Orin's Hundred Punches",
    unlockAfter: 'ep0',
    intro: 'Master Orin says a real warrior can land a hundred punches without complaining once.',
    goal: { kind: 'punch', count: 100 },
    text: 'Land 100 punches',
    setup: { activity: 'punch' },
    reward: { xp: 150 },
    start: [
      { s: 'orin', t: 'A hundred punches. On the dummy, on a sparring partner, on a soldier, I do not care.' },
      { s: 'orin', t: 'And no complaining! Complaining resets the count.' },
      { s: 'orin', t: '…I am joking. Mostly.' },
    ],
    end: [
      { s: 'orin', t: 'One hundred! And not a single complaint. I am impressed.' },
      { s: 'orin', t: 'Here. That is real progress. Your fists will remember it.' },
    ],
  },
  rivalChallenge: {
    title: "The Rival's Challenge",
    unlockAfter: 'ep2',
    intro: 'A proud young warrior wants to find out if you are really as strong as everyone says.',
    goal: { kind: 'spar', wins: 1, level: 'hard' },
    text: 'Knock down your rival in a Hard sparring match',
    setup: { activity: 'spar', difficulty: 'hard' },
    reward: { xp: 300 },
    start: [
      { s: 'rival', t: 'So you are the one everybody keeps talking about.' },
      { s: 'rival', t: 'Everyone keeps talking about your incredible power.' },
      { s: 'rival', t: "Let's find out whether you've actually earned it." },
    ],
    end: [
      { s: 'rival', t: 'Hmph… Not bad. Not bad at all.' },
      { s: 'rival', t: "Don't get comfortable. Next time I'll be stronger." },
    ],
  },
};
