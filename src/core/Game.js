import * as THREE from 'three';
import { bus } from './events.js';
import { clamp, formatNumber } from './math.js';
import { Renderer } from '../render/Renderer.js';
import { Arena } from '../world/Arena.js';
import { Mirror } from '../world/Mirror.js';
import { XRInput } from '../input/XRInput.js';
import { DesktopInput } from '../input/DesktopInput.js';
import { Hands } from '../player/Hands.js';
import { Player } from '../player/Player.js';
import { Comfort } from '../player/Comfort.js';
import { Combat } from '../combat/Combat.js';
import { Effects } from '../fx/Effects.js';
import { Aura } from '../fx/Aura.js';
import { Progression, STAT_LABELS } from '../progression/Progression.js';
import { FORMS } from '../progression/forms.js';
import { Transformation } from '../transform/Transformation.js';
import { Training } from '../training/Training.js';
import { Raxor } from '../boss/Raxor.js';
import { Avatar } from '../character/Avatar.js';
import { defaultCharacter } from '../character/options.js';
import { SaveSystem } from '../save/SaveSystem.js';
import { loadSettings, GRAPHICS_PRESETS, VISUAL_INTENSITY } from '../settings/Settings.js';
import { PerformanceMonitor } from '../settings/Performance.js';
import { audio } from '../audio/Audio.js';
import { HUD } from '../ui/HUD.js';
import { Banner } from '../ui/Banner.js';
import { UIManager } from '../ui/UIManager.js';
import { MainMenu, CharacterCreator, GameMenu, ResultScreen } from '../ui/Menus.js';

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const PRESET_ORDER = ['low', 'medium', 'high'];

// Game: owns every system and the state machine
//   menu -> creator -> training <-> boss -> result -> training ...
// The same systems run in VR and desktop; only the input source differs.
export class Game {
  constructor(container) {
    this.state = 'landing';
    this.menuOpen = false;
    this.settings = loadSettings();
    this.audio = audio;
    this.renderer = new Renderer(container);
    this.effects = new Effects(this.renderer.scene);
    this.arena = new Arena(this.renderer.scene);
    this.combat = new Combat(this.renderer.scene, this.effects);
    this.xrInput = new XRInput(this.renderer.renderer, this.renderer.rig);
    this.desktopInput = new DesktopInput(this.renderer.canvas, this.renderer.camera);
    this.hands = new Hands(this.renderer.rig);
    this.comfort = new Comfort(this.renderer.camera);
    this.perf = new PerformanceMonitor(this);

    const save = SaveSystem.load();
    this.character = save?.character ? { ...defaultCharacter(), ...save.character } : defaultCharacter();
    this.progress = new Progression(save?.progress);

    this.playerAura = new Aura({ radius: 0.95, height: 2.5, firstPerson: true });
    this.renderer.scene.add(this.playerAura.group);
    this.player = new Player(this);
    this.transformation = new Transformation(this);
    this.training = new Training(this);
    this.boss = new Raxor(this);
    this.mirror = new Mirror(this);
    this.mirror.setCharacter(this.character);
    this.hands.applyCharacter(this.character);

    this.hud = new HUD(this);
    this.hud.attachWrist(this.hands.hands.left.group);
    this.banner = new Banner(this);
    this.ui = new UIManager(this);
    this.mainMenu = new MainMenu(this);
    this.creator = new CharacterCreator(this);
    this.gameMenu = new GameMenu(this);
    this.result = new ResultScreen(this);
    for (const m of [this.mainMenu, this.creator, this.gameMenu, this.result]) {
      this.renderer.scene.add(m.panel.mesh);
      this.ui.add(m.panel);
    }
    this.previewAvatar = null;
    this.previewForm = 'base';
    this.xrFrameRate = null;
    this.autosaveTimer = 0;
    this.resultTimer = 0;
    this.clock = new THREE.Clock();
    this.wireEvents();
    this.applySettings();
    this.resetPlayerPosition();

    document.addEventListener('visibilitychange', () => { if (document.hidden) this.save(); });
    window.addEventListener('beforeunload', () => this.save());
  }

  // ---- Properties -------------------------------------------------------------
  get isXR() { return this.renderer.isPresenting; }
  get preset() { return this.effectivePreset || GRAPHICS_PRESETS[this.settings.graphics]; }
  get visualIntensity() { return VISUAL_INTENSITY[this.settings.visualIntensity] ?? 0.8; }
  get particleBudget() { return this.effects.particles.budget; }
  get gameplayActive() { return (this.state === 'training' || this.state === 'boss') && !this.menuOpen; }

  currentPowerLevel() {
    const charge = this.transformation?.charge || 0;
    return Math.round(this.progress.powerLevel(this.player.form) * (1 + 0.15 * charge));
  }

  hasSave() { return SaveSystem.hasSave(); }

  saveSummary() {
    const s = SaveSystem.load();
    if (!s) return '';
    const p = new Progression(s.progress);
    const ss = p.isFormUnlocked('ssj1') ? ' · Super Saiyan' : '';
    return `${s.character.name} · PL ${formatNumber(p.basePowerLevel())}${ss}`;
  }

  save() {
    if (this.state === 'landing' || this.state === 'menu' || this.state === 'creator') return;
    SaveSystem.save({ character: this.character, progress: this.progress.toJSON() });
  }

  haptic(side, intensity, ms) {
    if (!this.settings.haptics || !this.isXR) return;
    this.xrInput.pulse(side, intensity, ms);
  }

  fadeTo(cb) {
    this.comfort.fadeTo(cb);
  }

  // ---- Settings ---------------------------------------------------------------
  applySettings() {
    SaveSystem.saveSettings(this.settings);
    this.perf.reset();
    this.applyDynamicQuality();
    this.audio.setVolume(this.settings.masterVolume);
    this.player.applySeated();
    this.gameMenu.panel.dirty = true;
  }

  // Preset + automatic reductions from the performance monitor.
  applyDynamicQuality() {
    const lvl = this.perf.level;
    let presetKey = this.settings.graphics;
    if (lvl >= 3) presetKey = PRESET_ORDER[Math.max(0, PRESET_ORDER.indexOf(presetKey) - 1)];
    const base = GRAPHICS_PRESETS[presetKey];
    const p = { ...base };
    if (lvl >= 1) p.particles *= 0.6;
    if (lvl >= 2) { p.lightning = Math.min(p.lightning, 1); p.auraLayers = 1; p.shadows = false; }
    this.effectivePreset = p;
    this.effects.setBudget(p.particles);
    this.effects.intensity = this.visualIntensity;
    this.playerAura.setLayers(p.auraLayers);
    this.mirror?.aura.setLayers(p.auraLayers);
    this.boss?.aura.setLayers(p.auraLayers);
    this.arena.setDetail(p.environmentDetail);
    this.renderer.applyGraphics(p, this.isXR);
    if (this.isXR) this.renderer.applyFrameRate(p.targetFps).then((r) => { if (r) this.xrFrameRate = r; });
    this.updatePointScale();
  }

  updatePointScale() {
    const h = this.isXR ? 1700 : this.renderer.renderer.getDrawingBufferSize(_v2).y;
    this.effects.particles.points.material.uniforms.scale.value = this.isXR ? 850 : h / 1.4;
  }

  // ---- Session / mode ------------------------------------------------------------
  async start(mode) {
    this.audio.unlock();
    if (mode === 'xr') {
      const session = await navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
      });
      this.renderer.xr.setFramebufferScaleFactor(this.preset.framebufferScale);
      await this.renderer.xr.setSession(session);
      session.addEventListener('end', () => this.onXREnd());
      this.desktopInput.enabled = false;
      this.desktopInput.releaseLock();
      this.applyDynamicQuality();
    } else {
      this.desktopInput.enabled = true;
    }
    this.onModeChanged();
    if (this.state === 'landing') this.toMainMenu();
    else this.refreshPlacement();
    if (!this.loopRunning) {
      this.loopRunning = true;
      this.renderer.renderer.setAnimationLoop((t, f) => this.tick(t, f));
    }
  }

  onXREnd() {
    this.save();
    this.desktopInput.enabled = true;
    this.renderer.onResize();
    this.onModeChanged();
    this.applyDynamicQuality();
    this.refreshPlacement();
  }

  onModeChanged() {
    const xr = this.isXR;
    this.player.applySeated();
    this.desktopInput.yaw = 0;
    this.desktopInput.pitch = 0;
    if (!xr) this.renderer.camera.position.set(0, 1.65, 0);
    this.hud.setMode(xr, this.state === 'training' || this.state === 'boss');
    document.getElementById('crosshair')?.classList.toggle('hidden', xr || !this.gameplayActive);
    document.getElementById('desktop-hint')?.classList.toggle('hidden', xr || !this.gameplayActive);
    const vrCorner = document.getElementById('btn-enter-vr-corner');
    if (vrCorner) vrCorner.classList.toggle('hidden', xr || !this.xrSupported);
    this.updatePointerMode();
    bus.emit('mode:changed', { xr });
  }

  updatePointerMode() {
    const needsCursor = !this.gameplayActive;
    this.desktopInput.setPointerMode(needsCursor);
    if (!this.isXR) {
      document.getElementById('crosshair')?.classList.toggle('hidden', needsCursor);
      document.getElementById('desktop-hint')?.classList.toggle('hidden', needsCursor);
    }
  }

  // Put the player at the platform centre facing the dummy (-Z).
  resetPlayerPosition() {
    const rig = this.renderer.rig;
    const cam = this.renderer.camera;
    if (this.isXR) {
      _e.setFromQuaternion(cam.quaternion, 'YXZ');
      rig.rotation.set(0, -_e.y, 0);
      rig.updateMatrix();
      _v.set(cam.position.x, 0, cam.position.z).applyQuaternion(rig.quaternion);
      rig.position.set(-_v.x, rig.position.y, -_v.z);
    } else {
      rig.position.set(0, 0, 0);
      rig.rotation.set(0, 0, 0);
      this.desktopInput.yaw = 0;
      this.desktopInput.pitch = 0;
    }
    this.player.applySeated();
    rig.updateMatrixWorld(true);
    this.player.updateHead();
  }

  // Place a panel in front of the player's current gaze.
  placeInFront(obj, dist = 1.5, lateral = 0, height = -0.1, yawOffset = 0) {
    if (!this.isXR && this.desktopInput.pitch !== 0) {
      this.desktopInput.pitch = 0; // level the desktop view so the panel is centred
      this.renderer.camera.rotation.x = 0;
      this.renderer.camera.updateMatrixWorld();
    }
    this.player.updateHead();
    const head = this.player.headWorld;
    const f = this.player.flatForward(_v.clone());
    const yaw = Math.atan2(f.x, f.z) + yawOffset;
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    obj.position.set(head.x + Math.sin(yaw) * dist, head.y + height, head.z + Math.cos(yaw) * dist).addScaledVector(right, -lateral);
    obj.lookAt(head.x, obj.position.y, head.z);
  }

  refreshPlacement() {
    if (this.state === 'menu') this.placeInFront(this.mainMenu.panel.mesh, 1.6, 0, -0.05);
    if (this.state === 'creator') this.layoutCreator();
    if (this.menuOpen) this.placeInFront(this.gameMenu.panel.mesh, 1.5, 0, -0.1);
    if (this.state === 'result') this.placeInFront(this.result.panel.mesh, 1.5, 0, -0.05);
  }

  hideAllMenus() {
    for (const m of [this.mainMenu, this.creator, this.gameMenu, this.result]) m.panel.hide();
  }

  // ---- State transitions ------------------------------------------------------------
  toMainMenu() {
    this.save();
    this.boss.stop();
    this.transformation.forceBase();
    this.training.setEnabled(false);
    this.removePreview();
    this.state = 'menu';
    this.menuOpen = false;
    this.hideAllMenus();
    this.resetPlayerPosition();
    this.mainMenu.confirmNew = false;
    this.mainMenu.panel.show();
    this.placeInFront(this.mainMenu.panel.mesh, 1.6, 0, -0.05);
    this.hud.setMode(this.isXR, false);
    this.banner.clear();
    this.updatePointerMode();
  }

  newGame() {
    SaveSystem.wipe();
    this.character = defaultCharacter();
    this.progress = new Progression();
    this.player.form = 'base';
    this.openCreator();
  }

  continueGame() {
    const save = SaveSystem.load();
    if (save) {
      this.character = { ...defaultCharacter(), ...save.character };
      this.progress = new Progression(save.progress);
    }
    this.applyCharacter();
    this.startTraining(this.progress.isFormUnlocked('ssj1') ? 'punch' : 'punch');
    this.banner.push({ title: `Welcome back, ${this.character.name}!`, subtitle: `Power Level ${formatNumber(this.progress.basePowerLevel())}`, duration: 2.5 });
  }

  openCreator() {
    this.state = 'creator';
    this.hideAllMenus();
    this.resetPlayerPosition();
    this.previewForm = 'base';
    this.removePreview();
    this.previewAvatar = new Avatar(this.character);
    this.renderer.scene.add(this.previewAvatar.root);
    this.creator.keyboard = false;
    this.creator.panel.show();
    this.layoutCreator();
    this.updatePointerMode();
  }

  layoutCreator() {
    // Panel slightly right, rotating preview slightly left.
    const d = this.isXR ? 1.5 : 2.1;
    this.placeInFront(this.creator.panel.mesh, d, 0.5, -0.15, -0.25);
    if (this.previewAvatar) {
      this.placeInFront(this.previewAvatar.root, d + 0.6, -0.8, 0, 0.3);
      this.previewAvatar.root.position.y = 0;
      this.previewAvatarBaseYaw = this.previewAvatar.root.rotation.y;
    }
  }

  togglePreviewForm() {
    this.previewForm = this.previewForm === 'base' ? 'ssj1' : 'base';
    this.previewAvatar?.setForm(this.previewForm);
  }

  removePreview() {
    if (this.previewAvatar) {
      this.renderer.scene.remove(this.previewAvatar.root);
      this.previewAvatar.dispose();
      this.previewAvatar = null;
    }
  }

  applyCharacter() {
    this.mirror.setCharacter(this.character);
    this.hands.applyCharacter(this.character);
  }

  finishCreation() {
    this.removePreview();
    this.applyCharacter();
    this.state = 'training';
    SaveSystem.save({ character: this.character, progress: this.progress.toJSON() });
    this.startTraining('punch');
    this.banner.push({ title: `Welcome, ${this.character.name}!`, subtitle: 'Train to unlock SUPER SAIYAN', duration: 3 });
    this.banner.push({ title: 'Punch the dummy!', subtitle: this.isXR ? 'Swing your fists for real' : 'Left click to punch', duration: 3 });
    this.banner.push({ title: 'Fire ki blasts', subtitle: this.isXR ? 'Pull the trigger to shoot from your hand' : 'Right click to fire', duration: 3 });
  }

  startTraining(activity = 'punch') {
    const wasBoss = this.state === 'boss' || this.state === 'result';
    this.boss.stop();
    this.hideAllMenus();
    this.menuOpen = false;
    this.state = 'training';
    this.combat.clearProjectiles();
    this.training.setEnabled(true);
    this.training.setActivity(activity, true);
    if (wasBoss) {
      this.player.resetResources();
      this.transformation.forceBase();
    }
    if (!this.player.alive) this.player.resetResources();
    this.fadeTo(() => this.resetPlayerPosition());
    this.hud.setMode(this.isXR, true);
    this.updatePointerMode();
    this.save();
  }

  startBoss() {
    this.hideAllMenus();
    this.menuOpen = false;
    this.training.setEnabled(false);
    this.combat.clearProjectiles();
    this.state = 'boss';
    this.transformation.forceBase();
    this.player.resetResources();
    this.player.ki = this.progress.maxKi();
    const a = this.progress.data.bossAttempts;
    a.raxor = (a.raxor || 0) + 1;
    this.fadeTo(() => {
      this.resetPlayerPosition();
      this.boss.start();
    });
    this.hud.setMode(this.isXR, true);
    this.banner.push({ title: 'BOSS BATTLE', subtitle: `Raxor · Power Level ${formatNumber(this.boss.def.powerLevel)}`, color: '#ff6a6a', duration: 2.6, big: true });
    this.updatePointerMode();
  }

  showResult(win) {
    this.state = 'result';
    this.boss.stop();
    this.transformation.forceBase();
    const pl = this.progress.basePowerLevel();
    const lines = [];
    if (win) {
      lines.push(`You defeated Raxor at Power Level ${formatNumber(this.progress.powerLevel(this.lastFightForm || 'base'))}.`);
      lines.push('Rewards: +40 XP to every stat.');
      if (this.firstRaxorWin) lines.push('NEW MILESTONE: The Gravity Chamber and Lord Veyron await in Phase 2!');
    } else {
      const ssj = this.progress.isFormUnlocked('ssj1');
      lines.push(`Raxor's Power Level is ${formatNumber(this.boss.def.powerLevel)}. Yours is ${formatNumber(pl)}.`);
      lines.push(ssj ? 'Tip: transform into a Super Saiyan early in the fight. Block (left grip / Q) when his fist glows red.' : `Tip: train to Power Level 5,000 to unlock Super Saiyan. Your lowest stat is ${STAT_LABELS[this.progress.lowestStat()]}.`);
    }
    this.result.set({ win, lines });
    this.result.panel.show();
    this.placeInFront(this.result.panel.mesh, 1.5, 0, -0.05);
    this.updatePointerMode();
    this.save();
  }

  openGameMenu(tab = 'status', fromMain = false) {
    this.gameMenu.fromMain = fromMain;
    this.gameMenu.tab = tab;
    if (fromMain) this.mainMenu.panel.hide();
    this.menuOpen = true;
    this.gameMenu.panel.show();
    this.placeInFront(this.gameMenu.panel.mesh, 1.5, 0, -0.1);
    this.updatePointerMode();
  }

  closeGameMenu() {
    this.menuOpen = false;
    this.gameMenu.panel.hide();
    if (this.gameMenu.fromMain) {
      this.mainMenu.panel.show();
      this.placeInFront(this.mainMenu.panel.mesh, 1.6, 0, -0.05);
    }
    this.updatePointerMode();
  }

  // ---- Event wiring: feedback for every action ------------------------------------
  wireEvents() {
    bus.on('punch:hit', (h) => {
      const transformed = this.player.form !== 'base';
      const power = clamp(h.power * (0.6 + 0.08 * this.progress.level('strength')) + (transformed ? 0.3 : 0), 0, 1);
      this.audio.punch(power, transformed);
      this.haptic(h.hand, 0.35 + 0.65 * h.power, 40 + 60 * h.power);
      const col = transformed ? 0xffd23a : 0xffffff;
      this.effects.flash(h.point, col, 0.12 + 0.3 * power, 0.12);
      this.effects.burst(h.point, transformed ? 0xffcc33 : 0xfff2cc, Math.round(6 + 16 * power), 1.5 + 3 * power, 0.04 + 0.04 * power, 0.35);
      if (power > 0.55 || h.finisher) {
        this.effects.ring(h.point, col, { maxRadius: 0.5 + power, duration: 0.3, vertical: true, normal: h.dir, opacity: 0.6 });
      }
      if (h.finisher) this.banner.push({ title: `${h.combo}-HIT COMBO!`, color: '#ffcc33', duration: 1.0, priority: true });
    });
    bus.on('punch:swing', () => this.audio.whoosh());
    bus.on('blast:fired', (b) => {
      this.audio.kiBlast(b.power, b.charged);
      this.haptic(b.hand, b.charged ? 0.8 : 0.3, b.charged ? 120 : 40);
    });
    bus.on('projectile:explode', (e) => this.audio.explosion(e.charged ? 0.6 : 0.15));
    bus.on('ki:empty', () => bus.emit('hud:message', { text: 'Not enough ki! Power up (both grips / Space)', color: '#4cc3ff' }));
    bus.on('attack:selected', (a) => bus.emit('hud:message', { text: `Equipped: ${a.attack.name}`, color: '#4cc3ff' }));
    bus.on('player:hit', (h) => {
      if (h.blocked) this.audio.block(); else this.audio.hurt();
      this.haptic('left', h.blocked ? 0.4 : 0.9, h.blocked ? 60 : 150);
      this.haptic('right', h.blocked ? 0.4 : 0.9, h.blocked ? 60 : 150);
      if (h.blocked && this.state === 'training' && this.training.activity === 'defense') {
        this.training.sessionXp += this.progress.addXp('stamina', 5 * this.training.xpMult, 'block');
        this.effects.number(h.point.clone(), 'BLOCK!', '#4cc3ff');
      } else if (h.blocked) {
        this.progress.addXp('stamina', 2, 'block');
      }
      this.effects.burst(h.point, h.blocked ? 0x4cc3ff : 0xff5a5a, 10, 2, 0.05, 0.3);
    });
    bus.on('player:defeated', () => {
      if (this.state === 'boss') {
        this.boss.say('Ha! Come back when you\'re a real warrior!');
        this.lastFightForm = this.player.form;
        this.resultTimer = 1.8;
        this.pendingResult = false;
      } else {
        // Training never kills you: you just collapse and recover.
        this.player.resetResources();
        bus.emit('hud:message', { text: 'You collapsed! Catch your breath…', color: '#ff9a4d' });
      }
    });
    bus.on('boss:defeated', () => {
      this.lastFightForm = this.player.form;
      const d = this.progress.data;
      this.firstRaxorWin = !d.bossesDefeated.includes('raxor');
      if (this.firstRaxorWin) {
        d.bossesDefeated.push('raxor');
        if (!d.gravityUnlocked.includes(10)) d.gravityUnlocked.push(10);
      }
      for (const k of ['strength', 'speed', 'ki', 'stamina']) this.progress.addXp(k, 40, 'boss-reward');
      this.audio.fanfare();
      this.banner.push({ title: 'RAXOR DEFEATED!', subtitle: this.firstRaxorWin ? 'First victory! New milestone unlocked' : 'Victory!', color: '#ffcc33', duration: 3.2, big: true, priority: true });
      this.haptic('left', 1, 300);
      this.haptic('right', 1, 300);
      this.resultTimer = 3.6;
      this.resultWin = true;
    });
    bus.on('stat:levelup', ({ stat, level }) => {
      this.audio.levelUp();
      this.haptic('left', 0.5, 80);
      this.haptic('right', 0.5, 80);
      this.banner.push({ title: `${STAT_LABELS[stat].toUpperCase()} LEVEL ${level}!`, subtitle: `Power Level ${formatNumber(this.progress.basePowerLevel())}`, color: '#4cc3ff', duration: 2 });
      this.player.health = Math.min(this.progress.maxHealth(), this.player.health + 10);
    });
    bus.on('milestone', (m) => {
      if (m.kind === 'power') {
        this.audio.fanfare();
        this.banner.push({ title: `POWER LEVEL ${formatNumber(m.value)}!`, subtitle: 'Your strength is rising', color: '#ffcc33', duration: 2.6 });
      }
      this.save();
    });
    bus.on('form:unlocked', ({ form }) => {
      this.audio.fanfare();
      this.haptic('left', 1, 300);
      this.haptic('right', 1, 300);
      this.banner.push({ title: `${FORMS[form].name.toUpperCase()} UNLOCKED!`, subtitle: this.isXR ? 'Hold BOTH grips to power up, then press A' : 'Hold SPACE to power up, then press T', color: '#ffcc33', duration: 4.5, big: true, priority: true });
      this.save();
    });
    bus.on('transform:burst', ({ form, first }) => {
      const f = FORMS[form];
      this.banner.push({ title: f.name.toUpperCase() + '!', subtitle: first ? 'You have awakened the legendary power!' : `Power Level ${formatNumber(this.currentPowerLevel())}`, color: '#ffcc33', duration: first ? 3.5 : 2, big: true, priority: true });
      if (first) setTimeout(() => this.audio.fanfare(), 600);
      if (this.state === 'boss' && this.boss.active) {
        this.boss.say(this.boss.powerRatio() > 1 ? 'What?! Your power… it\'s skyrocketing!' : 'A golden aura? It\'s just a trick!', '#ffb0b0');
        this.boss.knock.add(this.boss.group.position.clone().sub(this.player.headWorld).setY(0).normalize().multiplyScalar(2.5));
      }
      this.save();
    });
    bus.on('powerdown', () => this.banner.push({ title: 'Powered down', color: '#aab3d6', duration: 1.2 }));
    bus.on('mastery:levelup', ({ form, level }) => {
      this.audio.levelUp();
      this.banner.push({ title: `${FORMS[form].name} Mastery ${level}!`, subtitle: 'Faster power-up · less ki drain', color: '#ffcc33', duration: 2.4 });
      this.save();
    });
  }

  // ---- Frame loop -------------------------------------------------------------------
  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.perf.sample(dt);
    const xr = this.isXR;
    let input;
    if (xr) input = this.xrInput.update();
    else {
      const tr = this.transformation;
      input = this.desktopInput.update(dt, {
        powerUp: tr.state === 'charging' || tr.state === 'transforming',
        block: this.player.blocking,
        aiming: this.player.fire.right.held,
      });
      if (input.escape && this.menuOpen) this.closeGameMenu();
    }
    const rig = this.renderer.rig;
    rig.updateMatrixWorld(true);
    this.player.updateHead();
    this.hands.update(dt, input, rig.getWorldQuaternion(_q));
    const handsVisible = xr || this.gameplayActive;
    if (!handsVisible) this.hands.setVisible(false);

    // Menu buttons (X / Tab, Y / C)
    if (this.state === 'training' || this.state === 'boss') {
      if (input.hands.left.primaryDown) { if (this.menuOpen) this.closeGameMenu(); else this.openGameMenu('status'); }
      if (input.hands.left.secondaryDown) { if (this.menuOpen && this.gameMenu.tab === 'settings') this.closeGameMenu(); else this.openGameMenu('settings'); }
    }

    const active = this.gameplayActive;
    const paused = this.menuOpen && (this.state === 'boss');
    if (active) {
      if (input.hands.right.secondaryDown) this.player.cycleAttack();
      this.player.updateBlocking(input, this.hands);
    } else this.player.blocking = false;
    this.player.updateMovement(dt, input, active);
    this.transformation.update(dt, input, { enabled: active && this.player.alive });
    if (active && this.player.alive) {
      this.player.updatePunching(dt, this.hands);
    }
    this.player.updateFiring(dt, input, this.hands, active && this.player.alive);
    if (!paused) {
      this.player.updateResources(dt, { charging: this.transformation.state === 'charging' });
      this.combat.update(dt);
      this.boss.update(dt);
    }
    this.training.update(dt);
    this.mirror.update(dt);
    this.arena.update(dt);
    this.effects.update(dt);
    this.updatePlayerAuraPosition();

    // Transform prompt
    const can = this.transformation.canTransform();
    this.banner.setPrompt(active && this.transformation.state === 'charging' && can.ok ? (xr ? 'PRESS A TO TRANSFORM!' : 'PRESS T TO TRANSFORM!') : null);
    this.banner.update(dt);
    this.ui.update(input);
    this.hud.update(dt);
    this.updatePreview(dt);
    this.comfort.setVignette(xr && this.settings.vignette ? this.player.moving * 0.85 : 0);
    this.comfort.update(dt);

    // Result screen countdown
    if (this.resultTimer > 0) {
      this.resultTimer -= dt;
      if (this.resultTimer <= 0) {
        const win = !!this.resultWin;
        this.resultWin = false;
        this.showResult(win);
      }
    }
    // Autosave
    this.autosaveTimer += dt;
    if (this.autosaveTimer > 20) { this.autosaveTimer = 0; this.save(); }
    if (this.state === 'training' || this.state === 'boss') this.progress.data.playTime += dt;

    this.renderer.render();
  }

  updatePlayerAuraPosition() {
    const head = this.player.headWorld;
    this.playerAura.group.position.set(head.x, this.renderer.rig.position.y > 0 ? 0 : 0, head.z);
    // In first person the aura shell is centred on the body (slightly behind the eyes).
    const f = this.player.flatForward(_v.clone());
    this.playerAura.group.position.addScaledVector(f, -0.1);
  }

  updatePreview(dt) {
    if (!this.previewAvatar || this.state !== 'creator') return;
    this.previewSpin = (this.previewSpin || 0) + dt * 0.6;
    this.previewAvatar.root.rotation.y = this.previewAvatarBaseYaw + Math.sin(this.previewSpin) * 1.2;
    this.previewAvatar.restPose(this.previewSpin * 2);
  }
}

const _v2 = new THREE.Vector2();
