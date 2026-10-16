import { bus } from '../core/events.js';
import { STAT_KEYS } from '../progression/Progression.js';
import { FORMS } from '../progression/forms.js';
import { bossById } from '../boss/bosses.js';
import { CHARACTER_TEMPLATES, defaultCharacter } from '../character/options.js';
import { key } from '../ui/controls.js';
import { DialoguePanel } from '../ui/DialoguePanel.js';
import { EpisodeBanner } from '../ui/EpisodeBanner.js';
import { ObjectiveTracker } from '../ui/ObjectiveTracker.js';
import { EPISODES, sagaOf, nextEpisode, DISCOVERIES, SIDE_QUESTS } from './storyData.js';
import { SPEAKERS, WARRIOR_NAMES } from './dialogueData.js';
import { OBJECTIVES } from './objectives.js';
import { STORY_EVENTS } from './storyEvents.js';
import { StoryScene } from './StoryScene.js';
import { StoryWave } from './StoryEnemies.js';

// Runs the story campaign on top of the normal game. Episodes are data
// (./sagas); this walks through their steps: title cards, dialogue scenes,
// scripted moments, objectives, story boss fights and rewards. Everything
// it needs from the game goes through the game's own systems (training
// activities, the boss fight, the event bus, the save), so free training,
// the boss menu and old saves keep working exactly as before.
//
// Story Mode / Free Training: the main menu picks one. In Free Training the
// story is paused (no tracker, no story characters on the grounds) and
// nothing counts toward it.
export class StoryManager {
  constructor(game) {
    this.game = game;
    this.scene = new StoryScene(game);
    this.dialogue = new DialoguePanel(game);
    this.card = new EpisodeBanner(game);
    this.tracker = new ObjectiveTracker(game);
    this.wave = new StoryWave(game);
    this.running = false; // playing an episode this session
    this.goal = null; // { step, goal, h } current objective
    this.goalDone = false;
    this.wait = null; // { t, done } a pause before the next step
    this.fx = []; // animating story moments
    this.fight = null; // a story boss fight in progress: { step }
    this.epRewards = [];
    this.lastModal = false;
    this.readyAsked = false;
    // Forward every game event an objective listens for.
    const events = new Set();
    for (const o of Object.values(OBJECTIVES)) for (const e of Object.keys(o.on || {})) events.add(e);
    for (const e of events) bus.on(e, (p) => this.onEvent(e, p));
    bus.on('transform:burst', ({ form }) => {
      if (this.goal?.goal.kind === 'transform' && form === 'ssj1' && !this.goalDone) this.fire('goldenAwakening');
    });
  }

  // ---- State ---------------------------------------------------------------------
  get s() { return this.game.progress.data.story; }
  get ep() { return EPISODES[this.s.episode]; }
  get step() { return this.ep?.steps?.[this.s.step] || null; }
  // The story is switched on and an episode can be played.
  get on() { return this.running && !this.s.paused && !!this.ep?.playable; }
  // A dialogue or title card is up: gameplay waits.
  get modal() { return this.dialogue.open || this.card.open; }
  // Desktop: a click anywhere that isn't a button goes on (see UIManager).
  onFreeClick() {
    if (this.game.isXR) return;
    if (this.card.open) { if (!this.card.card?.buttons) this.card.advance(); } else if (this.dialogue.open && !this.dialogue.line?.choices) this.dialogue.next();
  }
  get atGrounds() { const g = this.game; return g.state === 'training' && g.training.location === 'arena'; }
  get training() { const g = this.game; return g.state === 'training' && !this.modal && !g.menuOpen; }

  // Helpers for `when` conditions and line choices in the saga files.
  ctx() {
    const s = this.s;
    const g = this.game;
    return {
      won: (k) => s.outcomes[k] === 'won',
      choice: (k) => s.choices[k],
      has: (form) => g.progress.isFormUnlocked(form),
      flag: (k) => !!s.flags[k],
      setFlag: (k, v = true) => { s.flags[k] = v; },
      beatBoss: (id) => g.progress.beat(id),
      player: g.character.templateId,
    };
  }

  // Your rival: Vexar, unless you are Vexar (then Kaizen).
  rivalId() { return this.game.character.templateId === 'vexar' ? 'kaizen' : 'vexar'; }

  // ---- Starting, pausing -------------------------------------------------------------
  // Story Mode: continue where you left off (or start an episode).
  play(epId = null) {
    const g = this.game;
    const s = this.s;
    s.started = true;
    s.paused = false;
    if (epId && epId !== s.episode) {
      // Playing a finished episode again: come back to where you were after.
      if (s.completed.includes(epId) && !s.returnTo) s.returnTo = s.episode;
      s.episode = epId; s.step = 0; s.obj = null;
    }
    const ep = this.ep;
    if (!ep?.playable) {
      s.paused = true;
      g.startTraining('punch');
      g.banner.push({ title: 'MORE STORY COMING SOON', subtitle: 'You finished every episode so far. Keep training!', color: '#ffcc33', duration: 4, big: true });
      return false;
    }
    this.closeModal();
    this.running = true;
    this.goal = null;
    this.goalDone = false;
    this.wait = null;
    this.fight = null;
    const fresh = s.step === 0;
    if (fresh) {
      s.scene = { ...ep.scene };
      s.obj = null;
      ep.onStart?.(this.ctx());
      this.epRewards = [];
    }
    this.replaying = s.completed.includes(ep.id);
    g.training.prefs.location = 'arena';
    g.startTraining('none', {
      story: true,
      place: () => {
        if (fresh && ep.start?.at) this.placePlayer(ep.start.at);
        this.scene.apply(s.scene);
        this.runStep();
      },
    });
    return true;
  }

  // Back to free training (from the episode-complete card or the journal).
  pause(announce = true) {
    const s = this.s;
    s.paused = true;
    this.stopRunning();
    if (this.game.state === 'training') this.game.training.setActivity('punch', false);
    if (announce) bus.emit('hud:message', { text: 'Free training. Menu > Story continues the story any time.', color: '#ffcc33', duration: 4 });
    this.game.save();
  }

  stopRunning() {
    this.running = false;
    this.closeModal();
    this.goal = null;
    this.goalDone = false;
    this.wait = null;
    this.fight = null;
    this.wave.end();
    this.scene.setBeacon(null);
    this.scene.setVisible(false);
    this.tracker.set(null);
  }

  closeModal() {
    this.dialogue.hide();
    this.card.hide();
    this.scene.setTalking(null);
    this.scene.dimTarget = 0;
  }

  // Leaving to the main menu.
  onMainMenu() {
    this.stopRunning();
  }

  // Someone started a non-story boss fight while a story fight was pending.
  onExternalBoss() {
    if (!this.fight) return;
    this.fight = null;
    this.s.obj = { phase: 'ready' };
  }

  placePlayer([x, z]) {
    const g = this.game;
    g.renderer.rig.position.x += x;
    g.renderer.rig.position.z += z;
    g.renderer.rig.updateMatrixWorld(true);
    g.player.updateHead();
  }

  setScene(changes, { apply = true } = {}) {
    Object.assign(this.s.scene, changes);
    if (apply) this.scene.set(changes);
    else Object.assign(this.scene.state, changes);
  }

  // ---- Step runner ----------------------------------------------------------------
  runStep() {
    if (!this.on) return;
    const s = this.s;
    const ep = this.ep;
    const step = this.step;
    if (!step) return this.finishEpisode();
    if (step.when && !step.when(this.ctx())) return this.advance(true);
    if (step.title === true) {
      const saga = sagaOf(ep.id);
      return this.card.show({ kind: 'episode', saga: `${saga.label} · ${saga.title.toUpperCase()}`, episode: `EPISODE ${ep.numberWord}`, title: ep.title.toUpperCase(), summary: ep.summary, color: saga.id === 'prologue' ? '#7fd8ff' : '#ff8a4a', onDone: () => this.advance() });
    }
    if (step.card) return this.card.show({ kind: 'card', ...step.card, duration: 4.5, onDone: () => this.advance() });
    if (step.scene) return this.playScene(step, () => this.advance());
    if (step.set) {
      this.setScene(step.set);
      if (!step.event) return this.advance();
    }
    if (step.event) return this.runEvent(step.event, step, () => this.advance());
    if (step.goal) return this.startGoal(step);
    if (step.boss) return this.startBossStep(step);
    if (step.reward) { this.grant(step.reward); return this.advance(); }
    return this.advance();
  }

  advance(quiet = false) {
    const s = this.s;
    s.step += 1;
    s.obj = null;
    this.goal = null;
    this.goalDone = false;
    this.scene.setBeacon(null);
    if (!quiet) this.game.save();
    this.runStep();
  }

  // ---- Story moments ----------------------------------------------------------------
  // Run a moment; done() once it's over.
  runEvent(id, step, done) {
    const r = this.fire(id, step);
    const t = typeof r === 'number' ? r : r?.dur || 0;
    this.wait = { t, done };
  }

  // Run a moment without waiting for it.
  fire(id, step = null) {
    const fn = STORY_EVENTS[id];
    if (!fn) { console.warn('[story] unknown event', id); return 0; }
    const r = fn(this, step);
    if (r && typeof r === 'object' && r.update) this.fx.push({ ...r, t: 0 });
    return r;
  }

  // ---- Dialogue -------------------------------------------------------------------------
  resolveLine(L) {
    const g = this.game;
    const tpl = g.character.templateId;
    const sp = L.s === 'rival' ? this.rivalSpeaker() : SPEAKERS[L.s] || SPEAKERS.narrator;
    let t = L.t ?? '';
    if (t && typeof t === 'object') {
      const k = L.pick ? L.pick(this.ctx()) : tpl;
      t = t[k] ?? t[tpl] ?? t.default ?? '';
    }
    const text = String(t).replace(/\{name\}/g, g.character.name);
    let portrait = sp.portrait ? { ...sp.portrait } : null;
    if (portrait?.type === 'avatar' && !portrait.character) portrait.character = this.scene.actors[portrait.actor]?.character || null;
    return {
      speaker: L.s,
      name: sp.name ?? g.character.name,
      color: sp.color,
      text,
      portrait,
      actor: sp.portrait?.actor || null,
      choices: L.options ? L.options.map((o) => ({ id: o.id, label: o.label })) : null,
      choice: L.choice || null,
      do: L.do || null,
    };
  }

  rivalSpeaker() {
    const id = this.rivalId();
    const t = CHARACTER_TEMPLATES.find((x) => x.id === id);
    return { name: WARRIOR_NAMES[id], color: id === 'vexar' ? '#7fb0ff' : '#ff9a3a', portrait: { type: 'avatar', character: { ...defaultCharacter(), ...t.appearance, templateId: id, name: WARRIOR_NAMES[id] } } };
  }

  // Play a scene's lines; done() at the end. replay: from the journal (no
  // story moments, nothing saved).
  playScene(step, done, replay = false) {
    const s = this.s;
    const lines = step.lines || [];
    const cutaway = step.cutaway || '';
    let i = -1;
    const finish = () => {
      this.dialogue.hide();
      this.scene.setTalking(null);
      if (!replay && step.scene && step.replay && !s.seen.includes(step.scene)) s.seen.push(step.scene);
      done?.();
    };
    const show = (k) => {
      // Skip lines whose condition isn't met.
      while (k < lines.length && lines[k].when && !lines[k].when(this.ctx())) k += 1;
      i = k;
      if (i >= lines.length) return finish();
      const L = this.resolveLine(lines[i]);
      if (L.do && !replay) this.fire(L.do);
      this.scene.setTalking(L.actor);
      if (L.speaker === 'player' && L.choices && !L.text) L.text = 'What do you say?';
      this.dialogue.show(L, {
        place: i === 0,
        cutaway,
        onNext: () => show(i + 1),
        onSkip: () => skipRest(),
        onChoice: (opt) => { if (L.choice) s.choices[L.choice] = opt.id; this.game.audio.ui(); show(i + 1); },
      });
    };
    // Skip: run the rest of the scene's moments so the world ends up right,
    // but stop at a choice (you still get to answer it).
    const skipRest = () => {
      for (let k = i + 1; k < lines.length; k++) {
        const raw = lines[k];
        if (raw.when && !raw.when(this.ctx())) continue;
        if (raw.options) return show(k);
        if (raw.do && !replay) this.fire(raw.do);
      }
      finish();
    };
    show(0);
  }

  // Start the current episode over (from the journal).
  restartEpisode() {
    const s = this.s;
    s.step = 0;
    s.obj = null;
    this.play();
  }

  // Scenes you've watched, for the journal's Watch Again list.
  sceneList() {
    const out = [];
    for (const ep of Object.values(EPISODES)) {
      for (const st of ep.steps || []) if (st.scene && st.replay && this.s.seen.includes(st.scene)) out.push({ id: st.scene, title: st.title || st.scene, ep: ep.n });
    }
    return out;
  }

  // Watch a scene again from the journal.
  replayScene(id) {
    for (const ep of Object.values(EPISODES)) {
      const step = ep.steps?.find((st) => st.scene === id);
      if (step) {
        this.game.closeGameMenu();
        this.playScene(step, null, true);
        return true;
      }
    }
    return false;
  }

  // A one-line callout (HUD message) when an objective starts.
  bark(line) {
    const L = this.resolveLine(line);
    bus.emit('hud:message', { text: `${L.name}: ${L.text}`, color: L.color, duration: 4 });
  }

  // ---- Objectives ---------------------------------------------------------------------
  startGoal(step) {
    const s = this.s;
    const goal = step.goal;
    const h = OBJECTIVES[goal.kind];
    if (!h) { console.warn('[story] unknown objective', goal.kind); return this.advance(); }
    if (!s.obj) s.obj = { n: 0 };
    s.obj.total = h.total(goal);
    this.goal = { step, goal, h };
    this.goalDone = false;
    h.start?.(s.obj, goal, this);
    if (step.activity && this.atGrounds) this.game.training.setActivity(step.activity, false);
    if (step.say) this.bark(step.say);
    if (goal.kind === 'defeat') this.startWave();
  }

  startWave() {
    const st = this.s.obj;
    if (!st || !this.atGrounds) return;
    const left = st.total - Math.floor(st.n);
    if (left > 0) this.wave.begin({ total: left, max: this.goal.goal.max || 3, spawnAt: () => this.scene.point('shipRamp') });
  }

  tickGoal(dt) {
    const { h, goal } = this.goal;
    const st = this.s.obj;
    if (this.goalDone) return;
    if (!this.modal) h.tick?.(st, dt, this, goal);
    const b = h.beacon?.(goal, this, st);
    this.scene.setBeacon(this.atGrounds && b ? b : null);
    if (st.n >= st.total) this.completeGoal();
  }

  completeGoal() {
    this.goalDone = true;
    const g = this.game;
    g.audio.levelUp();
    bus.emit('hud:message', { text: '✓ Objective complete!', color: '#5cff8a', duration: 2 });
    this.scene.setBeacon(null);
    if (this.goal.goal.kind === 'defeat') setTimeout(() => this.wave.end(), 2500);
    this.wait = { t: 1.0, done: () => this.advance() };
  }

  onEvent(e, payload) {
    if (this.on && this.goal && !this.goalDone) {
      const fn = this.goal.h.on?.[e];
      if (fn) fn(this.s.obj, payload, this, this.goal.goal);
    }
    this.onSideEvent(e, payload);
  }

  // A trainee you reached says thanks and runs off to safety.
  onRescued(id) {
    const a = this.scene.actors[id];
    if (!a) return;
    const s = this.s;
    s.scene.rescued = [...(s.scene.rescued || []), id];
    a.mode = 'run';
    const h = this.game.player.headWorld;
    a.runDir.set(a.root.position.x - h.x, 0, a.root.position.z - h.z + 3).normalize();
    this.game.audio.targetHit(1.3);
    this.bark({ s: id === 'trainee0' ? 'tamo' : 'lira', t: id === 'trainee0' ? 'Thank you! I\'ll hide by the mountains!' : 'You saved me! Go help Master Orin!' });
  }

  // Walking through the training-ground gate. Returns true if the story
  // took it (the portal objective: straight to King Kali's planet).
  onPortal() {
    if (!this.on || this.goal?.goal.kind !== 'portal' || this.goalDone) return false;
    this.s.obj.n = 1;
    this.goalDone = true;
    this.scene.setBeacon(null);
    this.game.travel('kali');
    this.wait = { t: 1.4, done: () => this.advance() };
    return true;
  }

  // ---- Story boss fights ------------------------------------------------------------------
  startBossStep(step) {
    const s = this.s;
    if (!s.obj) s.obj = { phase: 'intro' };
    this.readyAsked = false;
    if (s.obj.phase === 'ready') return; // waits for you at the golden light (tickReady)
    this.bossIntro(step);
  }

  bossIntro(step) {
    const g = this.game;
    const def = bossById(step.boss);
    const over = step.scale(g);
    this.card.show({
      kind: 'boss', name: def.name, title: step.intro?.title || def.title, bossPL: over.powerLevel,
      yourPL: g.progress.powerLevel(g.progress.topForm()), note: step.intro?.note,
      onDone: () => {
        this.fight = { step };
        this.s.obj = { phase: 'fight' };
        g.startBoss(step.boss, { story: over });
      },
    });
  }

  // Called by Game.showResult when a story fight ends. Returns true if handled.
  onBossResult(win) {
    if (!this.fight) return false;
    const g = this.game;
    const s = this.s;
    const step = this.fight.step;
    this.fight = null;
    if (win || s.outcomes[step.key] !== 'won') s.outcomes[step.key] = win ? 'won' : 'lost';
    g.transformation.forceBase();
    const after = () => {
      if (win || step.losable) {
        s.obj = null;
        this.advance();
        return;
      }
      // Must win: Orin's advice, then fight again now or train first.
      const lines = [...(step.lose || []), { s: 'player', t: 'What now?', choice: '_retry', options: [{ id: 'retry', label: 'Fight again now!' }, { id: 'train', label: 'Train first' }] }];
      this.playScene({ lines }, () => {
        const c = s.choices._retry;
        delete s.choices._retry;
        if (c === 'retry') this.bossIntro(step);
        else {
          s.obj = { phase: 'ready' };
          this.readyAsked = true;
          g.save();
          bus.emit('hud:message', { text: 'Train, then walk into the golden light by the ship to fight again.', color: '#ffcc33', duration: 5 });
        }
      });
    };
    g.startTraining('none', { story: true, place: () => { this.scene.apply(s.scene); after(); } });
    return true;
  }

  // Waiting to fight again: walking into the light asks if you're ready.
  tickReady() {
    const step = this.step;
    if (!step?.boss || this.s.obj?.phase !== 'ready' || this.fight) return;
    this.scene.setBeacon(this.atGrounds ? 'shipRamp' : null);
    if (!this.atGrounds || this.modal || this.game.menuOpen) return;
    const p = this.scene.point('shipRamp');
    const h = this.game.player.headWorld;
    const d = Math.hypot(h.x - p.x, h.z - p.z);
    if (d > 4) this.readyAsked = false;
    if (d < 2.2 && !this.readyAsked) {
      this.readyAsked = true;
      const name = bossById(step.boss).name;
      this.playScene({ lines: [{ s: 'player', t: `Ready to fight ${name}?`, choice: '_ready', options: [{ id: 'yes', label: 'Fight!' }, { id: 'no', label: 'Not yet' }] }] }, () => {
        const c = this.s.choices._ready;
        delete this.s.choices._ready;
        if (c === 'yes') this.bossIntro(step);
      });
    }
  }

  // ---- Rewards ------------------------------------------------------------------------------
  grant(r) {
    const g = this.game;
    const s = this.s;
    const ep = this.ep;
    const lines = [];
    // XP only the first time you finish an episode.
    if (r.xp && !this.replaying) {
      for (const k of STAT_KEYS) g.progress.addXp(k, r.xp, 'story');
      lines.push(`+${r.xp} XP to every stat`);
    }
    if (r.mastery && !this.replaying) {
      g.progress.addMasteryXp('ssj1', r.mastery);
      lines.push(`+${r.mastery} ${FORMS.ssj1.name} mastery`);
    }
    for (const d of r.discover || []) {
      if (s.discoveries.includes(d)) continue;
      s.discoveries.push(d);
      lines.push(`New discovery: ${DISCOVERIES[d].title}`);
    }
    if (!lines.length) return;
    this.epRewards.push(...lines);
    if (!this.replaying) s.rewards.push(...lines.filter((l) => l.startsWith('+')).map((l) => `Episode ${ep.n}: ${l}`));
    if (!r.quiet) g.audio.levelUp();
    bus.emit('hud:message', { text: lines.join('  ·  '), color: '#5cff8a', duration: 4 });
    g.save();
  }

  finishEpisode() {
    const g = this.game;
    const s = this.s;
    const ep = this.ep;
    if (!s.completed.includes(ep.id)) s.completed.push(ep.id);
    const back = this.replaying && s.returnTo && s.returnTo !== ep.id ? s.returnTo : null;
    delete s.returnTo;
    const next = back || nextEpisode(ep.id);
    const nextEp = next ? EPISODES[next] : null;
    s.episode = next || ep.id;
    s.step = 0;
    s.obj = null;
    this.goal = null;
    g.save();
    const buttons = nextEp?.playable
      ? [{ label: back ? 'Back to the Story ▶' : 'Next Episode ▶', sub: `Episode ${nextEp.n}: ${nextEp.title}`, onClick: () => this.play() }, { label: 'Free Training', sub: 'Continue the story later', onClick: () => this.pause() }]
      : [{ label: 'Keep Training', sub: 'Saga Two is coming soon!', onClick: () => this.pause() }];
    const lines = this.epRewards.length ? this.epRewards.slice(0, 4) : ['Your progress is saved.'];
    this.epRewards = [];
    this.card.show({ kind: 'complete', title: `Episode ${ep.n}: ${ep.title}`, lines, buttons });
  }

  // ---- Side quests ------------------------------------------------------------------------
  sideAvailable(id) { return this.s.completed.includes(SIDE_QUESTS[id].unlockAfter); }
  sideState(id) { return this.s.side[id] || null; }

  startSide(id) {
    const q = SIDE_QUESTS[id];
    const g = this.game;
    const again = this.s.side[id]?.stage === 'active';
    if (!again) this.s.side[id] = { stage: 'active', n: 0, total: OBJECTIVES[q.goal.kind].total(q.goal) };
    g.closeGameMenu();
    if (q.setup?.difficulty) g.training.setDifficulty(q.setup.difficulty);
    this.playScene({ lines: again ? [] : q.start }, () => {
      if (q.setup?.activity && g.state === 'training') g.training.setActivity(q.setup.activity, true);
      bus.emit('hud:message', { text: `Side quest: ${q.text}`, color: '#ffcc33', duration: 4 });
      g.save();
    });
  }

  onSideEvent(e, payload) {
    for (const [id, st] of Object.entries(this.s.side)) {
      if (st.stage !== 'active') continue;
      const q = SIDE_QUESTS[id];
      const fn = q && OBJECTIVES[q.goal.kind].on?.[e];
      if (!fn) continue;
      const before = Math.floor(st.n);
      fn(st, payload, this, q.goal);
      if (Math.floor(st.n) !== before && st.n < st.total && st.total >= 20 && Math.floor(st.n) % 25 === 0) {
        bus.emit('hud:message', { text: `${q.title}: ${Math.floor(st.n)} / ${st.total}`, color: '#ffcc33' });
      }
      if (st.n >= st.total) this.finishSide(id);
    }
  }

  finishSide(id) {
    const q = SIDE_QUESTS[id];
    const st = this.s.side[id];
    st.stage = 'done';
    const g = this.game;
    for (const k of STAT_KEYS) g.progress.addXp(k, q.reward.xp, 'story');
    this.s.rewards.push(`${q.title}: +${q.reward.xp} XP to every stat`);
    g.audio.fanfare();
    g.banner.push({ title: 'SIDE QUEST COMPLETE!', subtitle: `${q.title} · +${q.reward.xp} XP to every stat`, color: '#5cff8a', duration: 3.5, big: true });
    g.save();
    // Their closing words, once you're free to listen.
    this.pendingSideEnd = q.end;
  }

  // ---- Tracker ------------------------------------------------------------------------------
  hint(h) {
    if (!h) return '';
    if (typeof h === 'string') return h;
    return this.game.isXR ? h.vr : h.desktop;
  }

  trackerInfo() {
    if (!this.on) return null;
    const ep = this.ep;
    const saga = sagaOf(ep.id);
    const head = `${saga.id === 'prologue' ? 'Prologue' : saga.label.replace('SAGA ', 'Saga ')} · Episode ${ep.n}: ${ep.title}`;
    const st = this.s.obj;
    const step = this.step;
    const needsGrounds = this.goal && !['xp', 'powerLevel', 'spar', 'transform', 'holdForm', 'punch', 'formPunch', 'charge', 'portal'].includes(this.goal.goal.kind);
    if ((needsGrounds || this.fight === null && step?.boss) && !this.atGrounds && this.game.state === 'training') {
      return { episode: head, text: 'Go back to the Training Grounds', progress: null, hint: 'Menu > Story > Continue Story' };
    }
    if (this.goal && st) {
      const h = this.goal.h;
      const many = st.total > 1;
      return {
        episode: head,
        text: `${this.goal.step.optional ? '' : ''}${this.goal.step.text}`,
        progress: many ? Math.min(1, st.n / st.total) : null,
        progressText: many ? h.show?.(st, this.goal.goal) || '' : '',
        hint: this.hint(this.goal.step.hint),
      };
    }
    if (step?.boss && st?.phase === 'ready') {
      return { episode: head, text: `Defeat ${bossById(step.boss).name}`, progress: null, hint: 'Train, then walk into the golden light by the ship' };
    }
    return null;
  }

  // For the HUD's goal line.
  hudGoal() {
    const i = this.trackerInfo();
    if (!i) return null;
    return { title: `STORY: ${i.text}`, detail: i.progressText || i.hint || '', progress: i.progress ?? 0 };
  }

  // ---- Frame update -------------------------------------------------------------------------
  // dt: real time; enemyDt: slowed by slow motion.
  update(dt, input, enemyDt = dt) {
    const g = this.game;
    const xr = g.isXR;
    // Input for cards and dialogue: A / Enter / click goes on, B / Esc skips.
    const R = input?.hands?.right;
    const advance = xr ? R?.primaryDown : input?.advance;
    const skip = xr ? R?.secondaryDown : input?.escape;
    if (this.card.open) { if (advance) this.card.advance(); } else if (this.dialogue.open) {
      if (advance && !this.dialogue.line?.choices) this.dialogue.next();
      else if (skip) this.dialogue.skip();
    }
    this.dialogue.update(dt);
    if (xr) this.dialogue.updatePlacementIfLost();
    this.card.update(dt);
    // Pointer: free the desktop cursor only when there are buttons to press.
    const modalKey = this.modal;
    if (modalKey !== this.lastModal) { this.lastModal = modalKey; g.updatePointerMode(); }
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.t += dt;
      f.update(dt, f.t);
      if (f.t >= f.dur) this.fx.splice(i, 1);
    }
    const visible = this.on && this.atGrounds;
    this.scene.setVisible(visible);
    this.scene.update(dt);
    if (this.wait && !this.modal) {
      this.wait.t -= dt;
      if (this.wait.t <= 0) { const done = this.wait.done; this.wait = null; done?.(); }
    }
    if (this.on && this.goal) this.tickGoal(dt);
    if (this.on) this.tickReady();
    // Soldiers only fight while you're on the grounds with the story on.
    const fighting = this.goal?.goal.kind === 'defeat' && !this.goalDone;
    if (fighting && visible && !this.wave.active) this.startWave();
    if (this.wave.active && (!visible || !this.on)) this.wave.end();
    if (this.wave.active && !this.modal && !g.menuOpen) this.wave.update(dt, enemyDt);
    // A finished side quest's closing words.
    if (this.pendingSideEnd && this.training && !this.wait) {
      const lines = this.pendingSideEnd;
      this.pendingSideEnd = null;
      this.playScene({ lines }, null);
    }
    this.tracker.set(this.trackerInfo());
    this.tracker.update(dt, this.on && (g.state === 'training' || g.state === 'boss') && !this.modal && !g.menuOpen);
  }

  // Shown in the journal and on the main menu.
  summary(s = this.s) {
    const ep = EPISODES[s.episode];
    if (!s.started) return 'Start the adventure!';
    if (!ep?.playable) return 'Saga Two is coming soon!';
    return `Episode ${ep.n}: ${ep.title}`;
  }

  controlsHint(action) { return key(this.game, action); }
}
