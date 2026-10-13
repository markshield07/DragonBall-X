# Dragon Ball X

An anime-style VR training and fighting game for **Meta Quest 2 / Quest 3** (standalone, in Meta Quest Browser) with a full **desktop keyboard-and-mouse mode** for development. You start as a weak Base Saiyan, train until you unlock **Super Saiyan**, experience a multi-stage transformation, and use that power to defeat the first boss, **Raxor**.

Built with **Three.js + WebXR** (real `immersive-vr` sessions) and **Vite**. Every model, effect and sound is procedural and original: no downloaded models, textures, audio files, paid plugins or APIs.

> **Status: Phases 1–3 playable prototype.** See [What has been verified](#what-has-been-verified-and-what-needs-a-headset) before trusting any performance claim: nothing here has been run on a real headset yet.

---

## Quick start (PC)

Requires [Node.js](https://nodejs.org/) 18 or newer.

```bash
npm install
npm run dev
```

Open <http://localhost:5173> and click **Play on Desktop**.

`npm run build` produces a static site in `dist/` that you can host anywhere.

## The Phase 1 game loop

1. **Main menu → New Warrior → character creator.** Every warrior starts from **Rokan, the Primal Titan** (see below) and you customise him across four tabs: Body (build, frame, 10 skin tones), Face (eye colour, expression, brows, scars), Hair (8 styles, 7 colours) and Outfit (4 styles, 5 recolourable sections). Use *Preview* to see your Super Saiyan look. Your character saves automatically.
2. **Train** (menu → Training): each activity levels one stat, and the lowest stat gets +50% XP so varied training pays.
   - **Punching** (Strength): punch the dummy. Harder punches and alternating-hand combos give more XP; finishers crack the ground; break the dummy for a bonus.
   - **Ki** (Ki): shoot floating targets. Charged blasts and far targets give more.
   - **Speed** (Speed): punch or touch orbs that appear within arm's reach; faster reactions give more.
   - **Defensive** (Stamina): a bot fires energy orbs; block (left grip / Q) or dodge.
   - **Transformation** (after unlocking SSJ): power up and hold the form to build mastery (faster power-up, less ki drain).
3. **Power Level 5,000 unlocks Super Saiyan** (about 5–10 minutes of mixed training). Stat levels raise your Power Level about 18% each.
4. **Transform**: hold **both grips** (Space) to power up. Hands glow, energy streams up your arms, the aura grows, lightning arcs between your hands, the hum and haptics build. When the meter is full, press **A** (T): a build-up, a golden burst and shockwave, your hands and the mirror reflection turn Super Saiyan. The form drains ki. Press A (T) again to power down.
5. **Fight Raxor** (menu → Bosses). He punches (red glowing fist and red floor marker: block or step away), fires ki volleys, and below 50% HP launches a charged mega-blast with a big warning. As a fresh Base Saiyan he is a real struggle. After training and transforming, your hits knock him back, crack the ground and finish him fast. He reacts to your power level.
6. **Win** for XP and new unlocks. **Lose** and you get a tip about what to train next; nothing is lost.

## Phases 2 and 3: everything else

- **Five bosses, all challengeable at any Power Level** (menu → Bosses). Raxor (18k), Lord Veyron (900k, purple barrier and dash), Titan Kurog (3.5M, giant, ground slam and charge), Emperor Zareth (40M, teleports behind you, homing orbs, beam) and Omega Draykon (900M, two power-up phases). Damage both ways scales with the Power Level gap, so a weak warrior can still win with good blocking and dodging. Every big attack has a telegraph: glowing fist, red ring, red aim line, warning text and sound.
- **Six forms**: Super Saiyan 1 to 5. Each unlocks at a Power Level or by beating a boss. Climb them in order: power up while transformed, then press A (T) again. SSJ2 and up crackle with lightning.
- **Eight attacks**: Ki Blast, Charged Blast, Kamehameha and Galick Gun (beams: hold the trigger to charge, release or push both hands forward to fire, aim to steer), Kaio-ken (red aura, damage and speed up, burns stamina), Energy Barrage, Giant Sphere and the SSJ5 Ultimate Beam. New attacks equip themselves into an empty slot; swap them in menu → Attacks.
- **Blood and scars**: as anyone's health drops, cuts, bruises and blood streaks appear on their body (bosses, the sparring partner, your mirror reflection and your own forearms), hits spray blood and your view gets a pulsing red edge. Turn it off in Settings → Blood & scars.
- **Slow motion**: unlocks at Speed level 5. Right thumbstick click (F, or the on-screen button) slows enemies and their attacks for 3–8 seconds while you move at full speed. Costs stamina, has a cooldown, longer and stronger with more Speed.
- **Flying**: left thumbstick click (G, or the on-screen **Fly** button on desktop, or menu → Status → Fly). Move where you look; right stick up and down (R and V) rises and descends; touch the ground to land. Costs a trickle of ki. You can fly out over the mountains, and bosses follow you up.
- **Sparring partner** (menu → Training): a humanoid fighter who punches, blocks, dodges and fires ki at Easy, Normal, Hard or Master (who goes Super Saiyan). Every stat grows; knock them down for a bonus.
- **Gravity chamber**: 10x, 20x, 50x, 100x gravity unlock with Power Level or boss wins. More XP, heavier movement and a red sky; below the recommended Power Level it strains your stamina and health.
- **The portal** (the glowing gate north of the training grounds): walk through it to pick **King Kali's Planet** (a tiny planet above the Other World clouds with King Kali, his domed house and car; training there gives 2x XP) or **Planet Zui** (a violet battle planet where crowds of Zui warriors attack, most far weaker than you, now and then an elite near your Power Level). Walk into the glowing ring behind where you arrive to go home. Both are also under Menu > Training > Location.
- **Hyperbolic Time Chamber**: unlocks at Power Level 30,000 or by beating Titan Kurog. A white void with 3x XP, a day passes every 24 seconds with bonus XP at days 7, 30, 90, 180 and 365, and the sparring partner becomes your own shadow.

The **mirror** to your left (a little house with a golden frame) shows your character copying your head and hand movement, including hair, aura and transformation.

## Rokan, the base character

Rokan is the one base model every player customises; there are no separate player characters. Out of the box he matches the reference concept art: a shirtless, muscular anime brawler with spiky black hair and bangs, steel-blue eyes, baggy red gi pants, a tied black sash, black fingerless gloves with red cuffs, bandaged ankles and black sandals (the **Primal Gi** outfit). Titan Armour (red-and-black battle armour with heavy boots) is the second outfit.

- **Sculpted anatomy** (`src/character/anatomy.js`): the torso, neck, arms and legs are smooth lofted shapes with real muscle groups (pecs, six-pack, obliques, lats, traps, deltoids, biceps, triceps, forearms, quads, calves), not stacked spheres. Bigger builds and transformations add definition; on the bare chest, anime-style ink lines mark the pecs and abs.
- **One rig** (`src/character/Avatar.js`): the body is built from procedural parts, then merged into one mesh per material (skin, undersuit, armour, wraps, boots, belt, trim) which keeps the mirror avatar cheap. The head (face and hair) and the two IK arms stay separate so they can follow your head and hands.
- **Customisation** (`src/character/options.js`): builds (Lean, Athletic, Muscular, Heavy Muscular) scale the shoulders, chest and limbs of the same rig. Frame (masculine or feminine), 10 skin tones, 8 hairstyles (Titan Mane, Wild, Upright, Short, Layered, Prince with a widow's peak, Swordsman, Ponytail), 7 hair colours, 7 eye colours, 3 expressions, 4 brow shapes and 4 scar options. Outfits are Primal Gi, Titan Armour, Training Gi, Battle Jacket and Sleeveless Fighter, and each has five colour sections (main/pants, under layer/wraps, gloves, footwear, belt/sash) picked from a shared 11-colour palette. The first-person hands use the same skin, wraps and build.
- **Transformations** (`src/progression/forms.js`) only change hair shape and colour, eye colour, muscle, fur and tail, so every form works on every customisation. Super Saiyan 1 is playable: golden lifted hair, teal eyes, gold aura, same face, skin and outfit. Super Saiyan 2 (sharper spikes, lightning), 3 (very long hair), 4 (black hair, red fur, tail, more muscle) and 5 (electric blue hair and aura) are already described in data and render in the rig; they unlock in later phases.
- **Brawler feel**: a wide guard stance on the avatar, fists that blaze brighter while powering up, and a second shockwave on heavy punches.
- Saves from the first prototype are migrated automatically (old hairstyles, colours and outfits map onto the new options).

## The world: mountain plains training zone

`src/world/Arena.js` builds a bright, open anime battlefield, all procedural and cel-shaded:

- **Ground**: one vertex-coloured terrain mesh with two-tone grass, dirt paths, a worn ring around the platform, rocky patches and rolling hills. It is perfectly flat within 34 m of the centre, where you play.
- **Training zone**: a tiled stone sparring platform (dummy, targets and fights happen here), wooden training posts and a roped training boulder to the right, and the mirror house to the left.
- **Battle crater**: a cracked crater with broken slabs, impact rims and standing stones on the way to the boss gate, where Raxor lands.
- **Rock formations**: layered sandstone pillars (some grass-topped), wide mesas, cliffs behind the gate and scattered boulders.
- **Distance**: two rings of jagged mountains with snow caps, then pale far peaks, a gradient sky with a sun glow, and puffy two-tone clouds.
- **Ambient life**: drifting wind streaks, dust motes and rocks hovering over the crater, all animated on the GPU.
- **Performance**: every plain cel-shaded prop (rocks, mountains, slabs, clouds, platform) is merged into a single vertex-coloured mesh per group, so the world costs a handful of draw calls. The full training view measured 63 draw calls in desktop Chromium. Low hides the grass, trees, boulders, wind and dust; High adds a denser grass field and shadows.

**Placeholders still in use**: the characters are procedural low-poly shapes rather than sculpted, rigged models (no skinned mesh, fingers or facial animation), the legs don't animate, and the clouds and mountains are simple primitives. All of these sit behind the same interfaces (`Avatar`, `Arena`), so real models can replace them later without touching gameplay.

## Controls

| Action | Meta Quest | Keyboard & mouse |
|---|---|---|
| Punch | Physically punch (either hand) | Left click (alternates hands) |
| Fire equipped attack | Trigger (Ki Blast: tap or hold; Charged Blast: hold and release) | Right click |
| Power up (refills ki) | Hold **both** grips | Hold Space |
| Transform / power down | A | T |
| Cycle equipped attack | B | E |
| Block | Left grip, or raise both fists in front of your face | Hold Q |
| Training / progression menu | X | Tab or M |
| Comfort & settings | Y | C |
| Move | Left stick (smooth or teleport) | WASD |
| Turn | Right stick (snap or smooth) | Mouse (click the canvas to lock it) |
| Fly / land | Left stick click | G or the Fly button |
| Rise / descend while flying | Right stick up / down | R / V |
| Slow motion (Speed level 5) | Right stick click | F or the Slow-Mo button |
| Menus | Point a controller and pull the trigger | Mouse |

Overlaps are prevented: grips + trigger don't fire, both grips never count as a block, punching is ignored while blocking.

## Testing on Meta Quest 2 and Quest 3

WebXR only works on **secure origins** (HTTPS, or `localhost` on the same device). Quest Browser opens the game over the network, so you need HTTPS. Pick one option.

### Option A: your PC on the same Wi-Fi (fastest for development)

```bash
npm run dev:https
```

Vite prints a `Network:` address such as `https://192.168.1.50:5173`. On the headset, open **Meta Quest Browser**, type that address, accept the **self-signed certificate warning** (Advanced → Proceed), then press **Enter VR**. If the page doesn't load, allow Node through your PC firewall for private networks.

### Option B: USB with port forwarding (no certificate warning)

With the headset in developer mode and connected by USB, run `npm run dev`, then use Chrome on the PC at `chrome://inspect/#devices` → **Port forwarding** → `5173` → `localhost:5173`. On the headset open `http://localhost:5173` (localhost counts as secure).

### Option C: host it (shareable link)

`npm run build`, then upload `dist/` to any HTTPS static host: GitHub Pages, Netlify, Cloudflare Pages or Vercel all work on their free tiers. Open the HTTPS URL in Quest Browser.

### Entering VR and what to check

1. Press **Enter VR** on the landing page (or the button in the corner once playing).
2. Quest 2 automatically gets the **Low** preset at 72 Hz; Quest 3 gets **High** and asks for 90 Hz. You can change both in the menu.
3. Checklist for a first headset session:
   - Hands and forearms line up with your real hands (forearm angle is a guess, see below).
   - Punching registers with normal, comfortable punches (threshold 1.3 m/s, outward motion only).
   - Trigger blasts come out of the hand and go where the controller points.
   - Powering up and transforming: aura reads well and never blocks your view; nothing flashes.
   - Haptics: punches, charging ramp, transformation burst.
   - The wrist HUD (look at the top of your left forearm) is readable.
   - Snap / smooth turn, smooth / teleport movement, vignette, seated mode.
   - Frame rate (Settings tab shows FPS) during the transformation and the boss fight.

## Graphics, comfort and saves

- **Settings tab** (menu → Settings, or Y / C): graphics preset **Low / Medium / High**, **Auto quality**, effects intensity, haptics and volume, plus turning (snap 30/45/90° or smooth), movement (smooth or teleport), comfort vignette, and standing / seated play.
- **Auto quality**: if the frame rate stays below target, effects step down (particles, then lightning and aura layers and shadows, then the preset). Gameplay is never changed.
- **Comfort rules**: no camera shake, no forced head motion, no full-screen flashes. Menus and banners float in the world and follow your gaze lazily. The first-person aura fades out in the centre of your view.
- **Saves**: progress is saved in the browser's local storage automatically (every 20 s, on milestones, when you leave the page) and via **Save** in the menu. Use **Continue** on the main menu to resume. Saves are per browser and per device: the headset and your PC keep separate saves.

## Testing VR code paths without a headset

Open <http://localhost:5173/?emulate=quest3> (or `?emulate=quest2`). This loads Meta's open-source WebXR emulator ([IWER](https://github.com/meta-quest/immersive-web-emulation-runtime)) so **Enter VR** starts a real WebXR session in a desktop browser. The emulated device is available as `window.__xrDevice` in the console, for example:

```js
__xrDevice.controllers.right.updateButtonValue('trigger', 1); // pull right trigger
__xrDevice.controllers.left.updateAxes('thumbstick', 0, -1);   // push left stick forward
```

`window.__dbx` is the running game, which is handy for inspecting state.

## What has been verified and what needs a headset

**Verified in desktop Chromium** (headless, software WebGL), by scripted playthroughs:

- Landing page, VR detection and desktop fallback; main menu, character creator (mouse clicks on 3D panels), all menu tabs.
- Punching the dummy, combos and dummy break; ki blasts hitting targets; speed orbs; blocking bot shots.
- XP, stat level-ups, Power Level milestones, Super Saiyan unlock at 5,000.
- Full power-up and transformation sequence, sustained form, power down; the mirror showing the transformed character.
- Raxor: a fresh character (Power Level 1,000) lost the scripted fight with Raxor nearly beaten, so it's hard but possible; a trained character who transformed won quickly. Win and lose screens, rewards, milestone.
- Save, reload, Continue.

**Verified in the IWER Quest 2 / Quest 3 emulator** (real WebXR session API, emulated device):

- `immersive-vr` session start, local-floor space, frame-rate request (72 Hz on the Quest 2 profile, 90 Hz on Quest 3).
- Controller tracking drives the virtual hands; laser-pointer menu clicks with the trigger.
- Motion punches register; trigger fires ki blasts; both grips + A transforms; X opens the menu.
- Snap turn, smooth locomotion and teleport.
- Draw calls: about 118 in training and 200 in the boss fight on the Low preset, 212 on High (both eyes counted).

**Not verified, needs real Quest 2 and Quest 3 testing:**

- **Any performance number**: 72 FPS on Quest 2 and 90 Hz on Quest 3 are targets, not measurements. Software rendering here says nothing about the Quest GPU.
- Feel of the punch threshold, punch power and damage balance with real arm motion, and whether 5–10 minutes to Super Saiyan holds for real players.
- Forearm and wrist-HUD placement relative to the real controllers (the forearm angle is an estimate).
- Haptic strength on real Touch controllers, and audio levels in the headset.
- Comfort: aura opacity in the periphery, the transformation burst and the vignette over a longer session.
- Hand tracking (controller-free) only has basic support: pinch works as the trigger, and grips and buttons are not mapped.
- Text readability of panels and the wrist HUD at Quest resolution.

## Project structure

```
src/
  main.js                 entry: WebXR detection, landing screen, start VR/desktop
  core/Game.js            state machine and frame loop that wires every system together
  core/events.js, math.js event bus and helpers
  render/Renderer.js      WebGLRenderer, XR setup, frame rate and foveation
  render/toon.js          cel-shading materials, outlines, glow helpers
  input/XRInput.js        Quest controllers (xr-standard mapping), haptics
  input/DesktopInput.js   keyboard and mouse with animated virtual hands
  player/Player.js        health, ki and stamina, locomotion, punching, blasts, blocking
  player/Hands.js         first-person hands and forearms, velocity tracking, hand glow
  player/Comfort.js       movement vignette and fades
  player/SpeedFocus.js    slow motion (Speed level 5+)
  character/              Rokan base model: options, procedural hair and anatomy, merged avatar rig
  combat/Combat.js        targets, swept punch and projectile collisions, projectiles
  progression/            stats and Power Level, all 6 forms, all 8 attacks
  transform/              the 5-stage transformation experience
  training/               dummy, ki targets, speed orbs, defense bot, sparring partner, gravity, activity manager
  boss/bosses.js          the five bosses as data (stats, look, attacks, phases, lines)
  boss/Boss.js            one boss fighter AI that becomes any of the five
  fx/                     aura shader, particles, lightning, shockwaves, cracks, battle damage, damage overlay
  world/                  mountain-plains arena, Hyperbolic Time Chamber and mirror
  ui/                     canvas panels, menus, HUD, banners, pointer handling
  audio/Audio.js          procedural WebAudio sound effects
  save/SaveSystem.js      localStorage save and settings
  settings/               graphics presets, device detection, auto quality
  dev/emulator.js         optional ?emulate=quest2|quest3 WebXR emulator
```

## Roadmap

- **Phases 1–3**: everything above is playable.
- **Next**: replace the procedural characters with modeled, rigged anime characters (see `docs/`), headset tuning.

Forms, attacks and bosses are data (`src/progression/forms.js`, `src/progression/attacks.js`, `src/boss/bosses.js`).
