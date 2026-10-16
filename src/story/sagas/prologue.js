import { P } from '../dialogueData.js';

// PROLOGUE: THE WARRIOR AWAKENS
// Episode 0: A Quiet World. Master Orin's first lesson on the training
// grounds, then something strange happens to your energy and a ship
// drops out of a red sky.
//
// Step kinds (run by StoryManager):
//   title                 the episode title card
//   card: {...}           any other big title card
//   scene: id, lines      dialogue (replay: true lists it in the journal)
//   set: {...}            change the training grounds (actors, sky, ship)
//   event: id             a scripted moment (waits for it to finish)
//   goal: {...}           an objective (see objectives.js)
//   boss: id              a story boss fight through the normal boss system
//   reward: {...}         XP, discoveries and journal lines
//   when: (ctx) => bool   skip the step unless true
export const PROLOGUE = {
  ep0: {
    summary: 'Your first lesson with Master Orin on the mountain training grounds.',
    start: { at: [0, 15] },
    scene: { orin: 'platform', sky: 'clear', ship: 'none', raxor: 'none', trainees: 'none', fragment: 'none', portal: 'off' },
    reward: { xp: 150 },
    steps: [
      { title: true },
      { goal: { kind: 'talk', actor: 'orin' }, text: 'Walk to the training platform and meet Master Orin', hint: 'Follow the golden light' },
      {
        scene: 'ep0_intro', replay: true, title: 'Meet Master Orin',
        lines: [
          { s: 'orin', t: 'So you finally made it up the mountain. Good. Most quit halfway.' },
          { s: 'orin', t: 'Everyone wants to become the strongest warrior alive.' },
          { s: 'orin', t: "But strength isn't something you're born with." },
          { s: 'orin', t: "It's something you earn." },
          P({
            default: "Then I'll earn it.",
            rokan: '...Then I will earn it.',
            kaizen: "The strongest warrior alive? That's gonna be me! Let's go!",
            vexar: 'I was born a prince, old man. But fine. Watch closely.',
            toren: "I didn't climb up here for speeches. Teach me what you know.",
            zyra: "Strength I can use to fight back? Then teach me. Fast.",
            zeron: 'The old books in my family say the same thing. I am ready to learn.',
          }),
          {
            s: 'orin',
            t: {
              default: "Ha! We'll see. Come on, {name}. Let's see what you've got.",
              vexar: "A prince, huh? Punches don't care about crowns. Come on, {name}. Let's see what you've got.",
              kaizen: "Ha! I like the fire. Let's see if your fists keep up with your mouth.",
            },
          },
        ],
      },
      { goal: { kind: 'punch', count: 15 }, activity: 'punch', text: 'Punch the training dummy', hint: { vr: 'Swing your fists at the dummy', desktop: 'Left click to punch' }, say: { s: 'orin', t: 'Hit it like you mean it! Combos hit harder.' } },
      { goal: { kind: 'block', count: 4 }, activity: 'defense', text: 'Block the energy orbs', hint: { vr: 'Hold the left grip when an orb flies at you', desktop: 'Hold Q when an orb flies at you' }, say: { s: 'orin', t: 'That bot throws little energy orbs. Get your guard up!' } },
      { goal: { kind: 'charge', seconds: 3 }, activity: 'none', text: 'Power up to charge your ki', hint: { vr: 'Hold BOTH grips', desktop: 'Hold Space' }, say: { s: 'orin', t: 'Now feel the energy inside you. Pull it up from your feet!' } },
      { goal: { kind: 'blastHit', count: 5 }, activity: 'ki', text: 'Hit the floating targets with ki blasts', hint: { vr: 'Point and pull the trigger', desktop: 'Right click to fire' }, say: { s: 'orin', t: 'Push that energy out through your hands. Aim for the middle!' } },
      {
        scene: 'ep0_challenge',
        lines: [
          { s: 'orin', t: "Not bad at all. One last test." },
          { s: 'orin', t: 'Green orbs will pop up in front of you. Punch each one before it turns red.' },
        ],
      },
      { goal: { kind: 'speedOrbs', count: 6 }, activity: 'speed', text: 'Training challenge: punch 6 green orbs', hint: { vr: 'Punch or touch each orb', desktop: 'Left click when an orb appears' } },
      { goal: { kind: 'talk', actor: 'orin' }, activity: 'none', text: 'Talk to Master Orin', hint: 'Walk up to him' },
      {
        scene: 'ep0_strange', replay: true, title: 'Strange Energy',
        lines: [
          { s: 'orin', t: 'Good work. Hold still a moment. Let me feel your energy.' },
          { s: 'orin', t: "That's strange…" },
          { s: 'orin', t: "Your energy should've stabilized a while ago." },
          { s: 'orin', t: 'But it keeps growing.', do: 'glowHands' },
          P({
            default: 'My hands… why are they glowing?',
            rokan: '...My hands. They burn. Like in my dreams.',
            kaizen: 'Whoa! My hands are glowing! Is that normal?!',
            vexar: 'Hmph. The power of royalty finally shows itself.',
            toren: "This light… I've seen it before. In a vision.",
            zyra: 'It feels like lightning under my skin.',
            zeron: "This glow… the old records spoke of something like it.",
          }),
          { s: 'orin', t: "That is NOT normal. In forty years I've never—" },
        ],
      },
      { event: 'distantExplosion' },
      { set: { sky: 'red' }, event: 'skyRed' },
      { event: 'shipDescend' },
      {
        scene: 'ep0_end', replay: true, title: 'Something Is Coming',
        lines: [
          { s: 'orin', t: 'The sky… it turned red.' },
          { s: 'orin', t: "Something's coming." },
          P({
            default: 'A spaceship?!',
            rokan: '...Stay behind me, old man.',
            kaizen: "A real spaceship! Are they friendly? They don't look friendly.",
            vexar: 'That is a warship. Somebody very rich wants something here.',
            toren: "It's starting. Earlier than I thought.",
            zyra: 'Those markings… invaders. I knew they would come.',
            zeron: 'That ship is following an energy trail. And it leads… to me.',
          }),
          { s: 'orin', t: 'Get ready!' },
        ],
      },
      { card: { top: 'SAGA ONE', big: 'THE FALLEN WARRIOR', color: '#ff6a4a' } },
      { reward: { xp: 150, discover: ['strangeEnergy'] } },
    ],
  },
};
