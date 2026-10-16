import { P } from '../dialogueData.js';

// SAGA ONE: THE FALLEN WARRIOR. Main boss: Raxor, a mercenary working for
// Lord Veyron, hired to capture a warrior with an unusual energy signature.
// (See prologue.js for the step kinds.)

// Story boss fights use the real Raxor (same moves, same model) with a
// Power Level and health set for this point in the story, so the regular
// boss menu keeps its full-strength Raxor. A story win does not count as a
// boss-menu win.
const topPL = (g) => g.progress.powerLevel(g.progress.topForm());
const round = (n) => Math.round(n / 100) * 100;

export const FALLEN_WARRIOR = {
  // ---------------------------------------------------------------------------
  ep1: {
    summary: "Raxor's ship lands on the training grounds. His soldiers attack and Master Orin falls.",
    start: { at: [0, 2] },
    scene: { orin: 'platform', sky: 'red', ship: 'landed', raxor: 'ship', trainees: 'scared', fragment: 'none', portal: 'off' },
    reward: { xp: 250 },
    steps: [
      { title: true },
      { event: 'shipLand' },
      {
        scene: 'ep1_raxor', replay: true, title: 'Raxor Arrives',
        lines: [
          { s: 'raxor', t: "So this is the planet. Rocks, grass and old men." },
          { s: 'raxor', t: "This planet isn't even worth conquering." },
          { s: 'raxor', t: "I'm only here for one thing." },
          { s: 'orin', t: "Whoever you are, you're not welcome here. Leave. Now." },
          { s: 'raxor', t: 'Move, old man.', do: 'orinDown' },
          P({
            default: 'MASTER ORIN!',
            rokan: 'ORIN! …You will pay for that.',
            kaizen: "Master Orin! Hey! That was a cheap shot!",
            vexar: 'He struck down my teacher. That was a mistake.',
            toren: 'Orin! …No. This part I never saw.',
            zyra: "Orin! You'll answer for that!",
            zeron: 'Orin! He moved faster than I could follow…',
          }),
          { s: 'raxor', t: 'Now, where are you…', do: 'scanner' },
          { s: 'raxor', t: 'There you are.' },
          { s: 'raxor', t: 'Lord Veyron will pay me a fortune for bringing you back.' },
          { s: 'raxor', t: 'Soldiers! Soften this one up for me. And try not to break it.' },
        ],
      },
      { set: { raxor: 'ship' } },
      { goal: { kind: 'defeat', count: 6, max: 3 }, activity: 'none', text: 'Defeat the invading soldiers', hint: 'Punch them and blast them with ki', say: { s: 'soldier', t: 'Target sighted! Capture it!' } },
      { goal: { kind: 'rescue', actors: ['trainee0', 'trainee1'] }, text: 'Rescue the trainees', hint: 'Walk up to each one' },
      {
        scene: 'ep1_confront', replay: true, title: 'Facing Raxor',
        lines: [
          { s: 'tamo', t: 'Thank you! They came out of nowhere!' },
          { s: 'lira', t: 'Master Orin is hurt! Please, stop that monster!' },
          { s: 'orin', t: "Don't… fight him… He's far too strong for you…" },
          P({
            default: "I'm not running.",
            rokan: '...I protect the weak. That is all.',
            kaizen: "Too strong? That just means it'll be a great fight!",
            vexar: 'Too strong for ME? Watch and learn, old man.',
            toren: 'I have to. Every future where I run ends badly.',
            zyra: "I'm done hiding from people like him.",
            zeron: 'Maybe. But somebody has to stand up to him.',
          }),
          { s: 'raxor', t: "Ha! The little warrior wants to play. Fine. Let's see what Lord Veyron finds so interesting." },
        ],
      },
      {
        boss: 'raxor', key: 'ep1Raxor', losable: true,
        intro: { title: 'Mercenary of the Dominion', note: 'He is MUCH stronger than you. Win or lose, the story goes on.' },
        scale: (g) => ({ powerLevel: Math.max(4000, round(topPL(g) * 3)), maxHealth: 520, damage: 1.0, phases: [], attacks: { punch: 5, volley: 3 } }),
      },
      {
        when: (c) => c.won('ep1Raxor'), scene: 'ep1_won', replay: true, title: 'An Impossible Victory',
        lines: [
          { s: 'raxor', t: 'Impossible… a nobody from a backwater planet…' },
          { s: 'raxor', t: "The scanner wasn't broken. Your energy just keeps climbing." },
          P({
            default: 'Leave this planet. And never come back.',
            rokan: '...Go. Before I change my mind.',
            kaizen: 'Woohoo! Did you see that, Master Orin?!',
            vexar: 'Now you know what royalty looks like. Crawl away.',
            toren: "Run. You don't want the future where you stay.",
            zyra: 'Tell your Lord Veyron this planet fights back.',
            zeron: 'Go. And tell whoever sent you that I am not for sale.',
          }),
          { s: 'raxor', t: "This isn't over. Next time I won't hold back!", do: 'raxorFlees' },
        ],
      },
      {
        when: (c) => !c.won('ep1Raxor'), scene: 'ep1_lost', replay: true, title: 'Defeated',
        lines: [
          { s: 'raxor', t: "Pathetic. That's all you've got?" },
          { s: 'raxor', t: 'But the scanner never lies. Even lying in the dirt, your energy keeps rising…', do: 'scanner' },
          { s: 'raxor', t: "Hm? A message from Lord Veyron? …'Observe only. Do not capture yet.' Tch." },
          { s: 'raxor', t: 'Enjoy your little planet while you can, warrior. I will be back.', do: 'raxorFlees' },
        ],
      },
      { set: { ship: 'none', raxor: 'none', sky: 'clear', trainees: 'none', orin: 'platform' }, event: 'skyClear' },
      {
        scene: 'ep1_end', replay: true, title: 'After the Invasion',
        lines: [
          { s: 'orin', t: { default: "You're alive. That's what matters.", won: "You beat him?! Ha… my old heart can't take this." }, pick: (c) => (c.won('ep1Raxor') ? 'won' : 'default') },
          { s: 'orin', t: 'That mercenary was hunting YOU. Not me. Not this planet. You.' },
          { s: 'orin', t: "He'll be back. And next time he won't come to play." },
        ],
      },
      { reward: { xp: 250, discover: ['dominion', 'raxor'] } },
    ],
  },

  // ---------------------------------------------------------------------------
  ep2: {
    summary: 'Master Orin starts your training arc: strength, speed, ki and stamina. Golden light begins to flash around you.',
    start: { at: [0, 2] },
    scene: { orin: 'platform', sky: 'clear', ship: 'none', raxor: 'none', trainees: 'none', fragment: 'none', portal: 'off' },
    reward: { xp: 300 },
    steps: [
      { title: true },
      {
        scene: 'ep2_intro', replay: true, title: 'The Price of Weakness',
        lines: [
          { s: 'orin', t: 'That mercenary was toying with us.' },
          { s: 'orin', t: 'If he comes back stronger, we lose everything.', when: (c) => !c.won('ep1Raxor') },
          { s: 'orin', t: 'You surprised him once. Surprise only works one time.', when: (c) => c.won('ep1Raxor') },
          { s: 'orin', t: "So we train. Harder than you've ever trained in your life." },
          P({
            default: "I'm ready. Whatever it takes.",
            rokan: '...Good. I was born for this.',
            kaizen: "Training arc! Yes! I've been waiting for this my whole life!",
            vexar: 'Finally, something worth my time.',
            toren: "Then let's not waste a second. Time is shorter than you think.",
            zyra: "Make it hurt. I'm not losing to people like him again.",
            zeron: 'Then teach me everything. I need to understand this power.',
          }),
          { s: 'orin', t: 'Four lessons: Strength. Speed. Ki. Stamina. Then you spar.' },
        ],
      },
      { goal: { kind: 'xp', stat: 'strength', amount: 120 }, activity: 'punch', text: 'Strength training: punch the dummy', hint: { vr: 'Big swings and combos give more XP', desktop: 'Click fast for combos' }, say: { s: 'orin', t: 'From the hips! Your whole body is the punch!' } },
      { goal: { kind: 'xp', stat: 'speed', amount: 100 }, activity: 'speed', text: 'Speed training: punch the green orbs', hint: 'Hit each orb before it turns red', say: { s: 'orin', t: "Faster! If you can see it coming, you're already too slow!" } },
      { event: 'goldenFlash' },
      {
        scene: 'ep2_flash', replay: true, title: 'Golden Light',
        lines: [
          { s: 'orin', t: 'Wait. Did you see that?' },
          { s: 'orin', t: 'Golden light… pouring off your skin.' },
          P({
            default: "It just happened. I didn't do anything!",
            rokan: "...It happens when I'm angry. And when I dream.",
            kaizen: "Was that me?! That was SO cool. Can I do it again?",
            vexar: 'Gold suits me. I have always known I was meant to shine.',
            toren: 'In my visions, that light always comes right before the sky breaks.',
            zyra: 'It felt like a storm trying to get out.',
            zeron: "My ancestors' records describe golden light like that. They called it a warning.",
          }),
          { s: 'orin', t: "I've seen energy like yours only once before." },
          { s: 'orin', t: 'And the last time…' },
          { s: 'orin', t: 'An entire star system disappeared.' },
          { s: 'orin', t: '…Keep training. And keep that power under control.' },
        ],
      },
      { goal: { kind: 'xp', stat: 'ki', amount: 100 }, activity: 'ki', text: 'Ki training: blast the floating targets', hint: { vr: 'Pull the trigger. Hold it to charge.', desktop: 'Right click. Hold it to charge.' }, say: { s: 'orin', t: 'Charged blasts and far targets teach you more!' } },
      { goal: { kind: 'xp', stat: 'stamina', amount: 60 }, activity: 'defense', text: 'Stamina training: block or dodge the orbs', hint: { vr: 'Hold the left grip to block', desktop: 'Hold Q to block' }, say: { s: 'orin', t: "Don't flinch. Take it, and stand your ground." } },
      {
        scene: 'ep2_spar_offer',
        lines: [
          { s: 'orin', t: 'One more thing. A real fighter hits back. Want to spar against a training partner?' },
          {
            s: 'player', choice: 'ep2Spar', options: [
              { id: 'yes', label: "Yes, let's spar!" },
              { id: 'no', label: 'Skip it for now' },
            ],
          },
        ],
      },
      { when: (c) => c.choice('ep2Spar') === 'yes', goal: { kind: 'spar', wins: 1 }, activity: 'spar', text: 'Optional: knock down your sparring partner', hint: 'Punch, blast and block. Knock them down once!', optional: true },
      {
        scene: 'ep2_end', replay: true, title: 'Stronger Than Yesterday',
        lines: [
          { s: 'orin', t: 'Ha! That was a real fight. Your partner will be sore tomorrow.', when: (c) => c.choice('ep2Spar') === 'yes' },
          { s: 'orin', t: "You're stronger than you were yesterday. I can feel it." },
          { s: 'orin', t: 'But something inside you is still locked away. Something big.' },
          { s: 'orin', t: 'When it breaks loose… I want to be standing right next to you.' },
        ],
      },
      { reward: { xp: 300, discover: ['goldenPower'] } },
    ],
  },

  // ---------------------------------------------------------------------------
  ep3: {
    summary: 'You push your power past its limit and awaken your first Super Saiyan transformation.',
    // Already a Super Saiyan from training? Then this episode is about mastery.
    onStart: (c) => c.setFlag('ssj1Before', c.has('ssj1')),
    start: { at: [0, 2] },
    scene: { orin: 'platform', sky: 'clear', ship: 'none', raxor: 'none', trainees: 'none', fragment: 'none', portal: 'off' },
    reward: { xp: 300 },
    steps: [
      { title: true },
      {
        when: (c) => !c.has('ssj1'), scene: 'ep3_intro',
        lines: [
          { s: 'orin', t: 'Your power is pushing against a wall. I can feel it from here.' },
          { s: 'orin', t: 'Reach Power Level 5,000 and that wall will break.' },
          { s: 'orin', t: 'Train any way you like. Open the menu to pick your training. I will be watching.' },
        ],
      },
      {
        when: (c) => c.has('ssj1'), scene: 'ep3_intro_mastery',
        lines: [
          { s: 'orin', t: "You've already broken through that golden wall, haven't you? I can see it in your eyes." },
          { s: 'orin', t: 'Breaking through is one thing. Controlling it is another.' },
          { s: 'orin', t: 'Show me you can master it.' },
        ],
      },
      { when: (c) => !c.has('ssj1'), goal: { kind: 'powerLevel', value: 5000 }, activity: 'punch', text: 'Reach Power Level 5,000', hint: 'Any training counts. Open the menu to switch.' },
      {
        when: (c) => !c.flag('ssj1Before'), scene: 'ep3_unstable',
        lines: [
          { s: 'orin', t: "Here it comes! Your energy is going wild!" },
          { s: 'orin', t: "Don't fight it. FOCUS!" },
          { s: 'orin', t: 'Power up with everything you have, then let it out!' },
        ],
      },
      {
        when: (c) => c.flag('ssj1Before'), scene: 'ep3_control',
        lines: [{ s: 'orin', t: 'Power up and transform. Slowly. Show me control.' }],
      },
      { goal: { kind: 'transform', form: 'ssj1' }, activity: 'none', text: 'Power up until the bar is full, then transform', hint: { vr: 'Hold BOTH grips, then press A', desktop: 'Hold Space, then press T' } },
      {
        scene: 'ep3_awakened', replay: true, title: 'The Golden Awakening',
        lines: [
          { s: 'orin', t: 'Impossible…' },
          { s: 'orin', t: "You've awakened a legendary transformation!" },
          P({
            default: 'This power… I feel like I could split a mountain.',
            rokan: '...So this is what my blood has been hiding.',
            kaizen: "I'M GOLDEN! Master Orin, look at me! LOOK AT ME!",
            vexar: 'Yes… YES. This is the power my family lost!',
            toren: "In every vision I saw this moment. It's even brighter in person.",
            zyra: 'Now THIS is a storm.',
            zeron: 'It is warm. And calm. Not like the warnings said at all.',
          }),
          { s: 'orin', t: 'The old legends called it Super Saiyan.' },
          { s: 'orin', t: "But power like that burns through your ki fast. Let's see if you can handle it." },
        ],
      },
      { goal: { kind: 'formPunch', count: 12 }, activity: 'punch', text: 'Punch the dummy while transformed', hint: { vr: 'If you power down: hold both grips, then press A', desktop: 'If you power down: hold Space, then press T' } },
      { goal: { kind: 'formBlast', count: 4 }, activity: 'ki', text: 'Hit 4 targets while transformed', hint: { vr: 'Pull the trigger to fire', desktop: 'Right click to fire' } },
      { goal: { kind: 'holdForm', seconds: 20 }, activity: 'none', text: 'Stay transformed for 20 seconds', hint: { vr: 'Low on ki? Hold both grips to refill it', desktop: 'Low on ki? Hold Space to refill it' } },
      {
        scene: 'ep3_end', replay: true, title: 'Control',
        lines: [
          { s: 'orin', t: 'You held it. Barely, but you held it.' },
          { s: 'orin', t: "Rest now. Something tells me we won't have long." },
        ],
      },
      { reward: { xp: 300, mastery: 120 } },
    ],
  },

  // ---------------------------------------------------------------------------
  ep4: {
    summary: 'Raxor returns to capture you and finds a golden warrior waiting for him.',
    start: { at: [0, 2] },
    scene: { orin: 'platform', sky: 'red', ship: 'none', raxor: 'none', trainees: 'none', fragment: 'none', portal: 'off' },
    reward: { xp: 400 },
    steps: [
      { title: true },
      { set: { ship: 'none' }, event: 'shipDescend', fast: true },
      { set: { raxor: 'ship' } },
      {
        scene: 'ep4_intro', replay: true, title: 'He Came Back',
        lines: [
          { s: 'raxor', t: 'Did you miss me?', do: 'scanner' },
          { s: 'raxor', t: 'What happened to you?!' },
          { s: 'raxor', t: "That energy wasn't there before!" },
          { s: 'raxor', t: "And you're the one who beat me in the arena! That was a fluke!", when: (c) => c.beatBoss('raxor') },
          { s: 'raxor', t: 'Last time you got lucky. This time I brought my REAL power.', when: (c) => c.won('ep1Raxor') },
          P({
            default: "I'm not the same warrior you met last time.",
            rokan: '...You hurt my teacher. Now you face me.',
            kaizen: "I've been training SO hard for this rematch. Let's go!",
            vexar: 'You should have stayed away, mercenary.',
            toren: "I've seen how this fight ends. You won't like it.",
            zyra: 'For Orin. For everyone you scared. This ends now.',
            zeron: "Turn back, Raxor. You don't understand what you're hunting.",
          }),
          { s: 'raxor', t: "Doesn't matter. Lord Veyron wants you breathing. He never said unhurt!" },
          { s: 'orin', t: "Show him what you've earned!" },
        ],
      },
      {
        boss: 'raxor', key: 'ep4Raxor', losable: false,
        intro: { title: "Raxor's Return", note: 'Transform early! He gets angrier at half health.' },
        scale: (g) => ({ powerLevel: Math.max(6000, round(topPL(g) * 1.3)), maxHealth: 1100, damage: 1.3 }),
        lose: [
          { s: 'orin', t: "Get up! You're not done yet!" },
          { s: 'orin', t: 'Transform right away, block when his fist glows red, and dodge out of the red rings.' },
        ],
      },
      { set: { raxor: 'down', sky: 'clear' }, event: 'skyClear' },
      { event: 'hologramOn' },
      {
        scene: 'ep4_victory', replay: true, title: 'The Living Seal',
        lines: [
          { s: 'veyron', t: 'Raxor. You look… defeated.' },
          { s: 'raxor', t: "L-Lord Veyron! The target is stronger than the scanner said! It's not my fault!" },
          { s: 'veyron', t: 'So the rumors were true.' },
          { s: 'veyron', t: 'The Living Seal has awakened.' },
          { s: 'raxor', t: 'What… is the Living Seal?' },
          { s: 'veyron', t: 'Something far more valuable than your life.', do: 'hologramOff' },
          { s: 'raxor', t: 'Heh… heh…' },
          { s: 'raxor', t: 'You have no idea what you\'ve become.', do: 'raxorEscapes' },
          { s: 'orin', t: "He's gone. But he left his ship behind…" },
        ],
      },
      { set: { raxor: 'none', ship: 'landed' } },
      { reward: { xp: 400, discover: ['livingSeal'] } },
    ],
  },

  // ---------------------------------------------------------------------------
  ep5: {
    summary: "A crystal aboard Raxor's ship holds a map of the galaxy and the mark of the Celestial Heart.",
    start: { at: [0, 2] },
    scene: { orin: 'platform', sky: 'clear', ship: 'landed', raxor: 'none', trainees: 'none', fragment: 'ship', portal: 'off' },
    reward: { xp: 400 },
    steps: [
      { title: true },
      {
        scene: 'ep5_intro',
        lines: [
          { s: 'orin', t: "Raxor left in such a hurry he forgot his ship." },
          { s: 'orin', t: "Let's see what a mercenary keeps in his pockets." },
        ],
      },
      { goal: { kind: 'goTo', at: 'shipRamp', radius: 2.2 }, activity: 'none', text: "Search Raxor's spaceship", hint: 'Follow the golden light' },
      { goal: { kind: 'touch', at: 'fragment', radius: 1.3 }, text: 'Touch the glowing crystal', hint: 'Walk right up to it' },
      { event: 'fragmentMap' },
      {
        scene: 'ep5_fragment', replay: true, title: 'The First Seal',
        lines: [
          { s: 'narrator', t: 'The crystal flares. A map of the galaxy spreads across the sky.' },
          P({
            default: "Master Orin! Come look at this!",
            rokan: '...Orin. Come here.',
            kaizen: "Master Orin! The crystal made a SPACE MAP!",
            vexar: 'Orin. You will want to see this.',
            toren: 'Orin… this is the map from my visions.',
            zyra: 'Orin, get over here! The Dominion was tracking something!',
            zeron: 'Orin, this symbol. I have seen it before. In my family\'s oldest book.',
          }),
          { s: 'orin', t: 'That symbol… I know it.' },
          { s: 'orin', t: 'The mark of the Celestial Heart.' },
          { s: 'orin', t: 'Long ago, an ancient energy source powered the whole universe. Ki itself came from it.' },
          { s: 'orin', t: 'Some people tried to steal its power. It almost destroyed everything. Planets vanished. Stars went dark.' },
          { s: 'orin', t: 'They called it the First Fracture.' },
          { s: 'orin', t: 'To stop it from happening again, the guardians split its power into six seals. Five were hidden across the stars.' },
          { s: 'orin', t: 'This map is pointing to them. And this crystal is one of the pieces. The First Seal.' },
          P({ default: 'And the sixth seal?' }),
          { s: 'orin', t: '…The legends say the sixth was hidden inside a living warrior.' },
          P({
            default: 'A living warrior… you mean me?',
            rokan: '...The dreams. The burning sky. Is THAT why I see them?',
            kaizen: 'Wait. Wait wait wait. Is it ME?!',
            vexar: 'Of course it is me. Who else would carry such power?',
            toren: "So that's why every vision ends with me standing next to you.",
            zyra: "So that's why they hunt me. Not for what I did, for what I am.",
            zeron: 'My family hid the truth for generations… and it was inside me the whole time.',
          }),
          { s: 'orin', t: "I don't know. But Veyron thinks so. And he won't stop sending people." },
        ],
      },
      { reward: { discover: ['celestialHeart', 'sixSeals'], quiet: true } },
      { set: { portal: 'on' }, event: 'portalOn' },
      {
        scene: 'ep5_portal', replay: true, title: 'The Portal Opens',
        lines: [
          { s: 'orin', t: "The portal… it's never glowed like that before. The crystal woke it up." },
          { s: 'orin', t: "There's someone you need to meet." },
          { s: 'orin', t: 'An old master who knows more about strange energy than anyone I know.' },
          { s: 'orin', t: 'Go. I will guard the grounds. And {name}… come back stronger.' },
        ],
      },
      { goal: { kind: 'portal' }, text: 'Walk through the glowing portal', hint: 'It is at the end of the dirt path' },
      {
        scene: 'ep5_kali', replay: true, title: 'King Kali',
        lines: [
          { s: 'kali', t: "Well, well! So YOU'RE the one Orin keeps worrying about." },
          { s: 'kali', t: "Hoo boy. You've got enough energy to light up a small moon." },
          { s: 'kali', t: "Come in, come in. We have a LOT to talk about." },
        ],
      },
      { event: 'cutawayIn' },
      {
        scene: 'ep5_veyron', replay: true, title: 'Meanwhile…', cutaway: 'Meanwhile, aboard the Dominion flagship…',
        lines: [
          { s: 'veyron', t: 'Play it again.' },
          { s: 'narrator', t: 'A screen shows the training grounds. A warrior wrapped in golden light.' },
          { s: 'veyron', t: 'A golden warrior… on a planet nobody remembers.' },
          { s: 'veyron', t: 'Prepare my fleet.' },
          { s: 'veyron', t: 'The First Guardian will be pleased.' },
        ],
      },
      { event: 'cutawayOut' },
      { reward: { xp: 400, discover: ['firstGuardian'] } },
      { card: { top: 'END OF SAGA ONE', big: 'THE FALLEN WARRIOR', sub: 'Next: SAGA TWO · THE GALACTIC DOMINION', color: '#ffcc33' } },
    ],
  },
};
