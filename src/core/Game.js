import * as THREE from 'three';
import { bus } from './events.js';
import { clamp, formatNumber } from './math.js';
import { Renderer } from '../render/Renderer.js';
import { Arena } from '../world/Arena.js';
import { World } from '../world/World.js';
import { Destruction } from '../world/Destruction.js';
import { Mirror } from '../world/Mirror.js';
import { XRInput } from '../input/XRInput.js';
import { DesktopInput } from '../input/DesktopInput.js';
import { Hands } from '../player/Hands.js';
import { Player } from '../player/Player.js';
import { Comfort } from '../player/Comfort.js';
import { Combat } from '../combat/Combat.js';
import { Aim } from '../combat/Aim.js';
import { Effects } from '../fx/Effects.js';
import { Aura } from '../fx/Aura.js';
import { Progression, STAT_LABELS } from '../progression/Progression.js';
import { FORMS, FORM_ORDER } from '../progression/forms.js';
import { Transformation } from '../transform/Transformation.js';
import { Training } from '../training/Training.js';
import { Boss } from '../boss/Boss.js';
import { BOSSES, bossById } from '../boss/bosses.js';
import { SpeedFocus, SLOWMO_UNLOCK_LEVEL } from '../player/SpeedFocus.js';
import { DamageOverlay } from '../fx/DamageOverlay.js';
import { BattleDamage } from '../fx/BattleDamage.js';
import { createAvatar, needsNewAvatar } from '../character/createAvatar.js';
import { loadModel } from '../character/ModelAvatar.js';
import { defaultCharacter, migrateCharacter } from '../character/options.js';
import { SaveSystem } from '../save/SaveSystem.js';
import { loadSettings, GRAPHICS_PRESETS, VISUAL_INTENSITY } from '../settings/Settings.js';
import { PerformanceMonitor } from '../settings/Performance.js';
import { audio } from '../audio/Audio.js';
import { key } from '../ui/controls.js';
import { HUD } from '../ui/HUD.js';
import { Banner } from '../ui/Banner.js';
import { UIManager } from '../ui/UIManager.js';
import { MainMenu, CharacterCreator, GameMenu, ResultScreen, PortalMenu } from '../ui/Menus.js';

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _fwd = new THREE.Vector3();
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
    this.world = new World(this);
    this.combat = new Combat(this.renderer.scene, this.effects);
    this.aim = new Aim(this);
    this.xrInput = new XRInput(this.renderer.renderer, this.renderer.rig);
    this.desktopInput = new DesktopInput(this.renderer.canvas, this.renderer.camera);
    this.hands = new Hands(this.renderer.rig);
    this.comfort = new Comfort(this.renderer.camera);
    this.perf = new PerformanceMonitor(this);

    const save = SaveSystem.load();
    this.character = save?.character ? migrateCharacter(save.character) : defaultCharacter();
    this.progress = new Progression(save?.progress);

    loadModel('rokan'); // start downloading the 3D character early
    this.playerAura = new Aura({ radius: 0.95, height: 2.5, firstPerson: true });
    this.renderer.scene.add(this.playerAura.group);
    this.player = new Player(this);
    this.transformation = new Transformation(this);
    this.training = new Training(this);
    this.boss = new Boss(this);
    // Breakable scenery: the valley's rocks and spires, Zui's pillars, and
    // (as they stream in) the world's props.
    this.destruction = new Destruction(this);
    this.destruction.registerTree(this.arena.group, 'arena');
    this.destruction.registerTree(this.training.zui.group, 'zui');
    this.currentBossId = 'raxor';
    this.unlockNews = [];
    this.speedFocus = new SpeedFocus(this);
    this.damageOverlay = new DamageOverlay(this.renderer.camera);
    // Wounds on your own first-person forearms and fists.
    this.handWounds = new BattleDamage(this.renderer.rig, this, { forward: () => _fwd.copy(this.player.headForward).negate(), scale: 0.45 });
    this.lastInput = null;
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
    this.portalMenu = new PortalMenu(this);
    for (const m of [this.mainMenu, this.creator, this.gameMenu, this.result, this.portalMenu]) {
      this.renderer.scene.add(m.panel.mesh);
      this.ui.add(m.panel);
    }
    this.previewAvatar = null;
    this.previewForm = 'base';
    this.xrFrameRate = null;
    this.autosaveTimer = 0;
    this.resultTimer = 0;
    this.clock = new THREE.Clock();
    this.hitStop = 0; // brief freeze of the enemy on heavy impacts
    this.shake = 0; // desktop camera shake (VR gets controller rumble instead)
    this.shakeOffset = new THREE.Vector3();
    this.wireEvents();
    this.setupActionButtons();
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
    this.desktopInput.lookSpeed = this.settings.mouseSensitivity ?? 1;
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
    if (this.player.flying) this.player.land();
    this.player.altitude = 0;
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
    for (const m of [this.mainMenu, this.creator, this.gameMenu, this.result, this.portalMenu]) m.panel.hide();
  }

  // ---- State transitions ------------------------------------------------------------
  toMainMenu() {
    this.save();
    this.boss.stop();
    this.speedFocus.reset();
    this.combat.clearProjectiles();
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
      this.character = migrateCharacter(save.character);
      this.progress = new Progression(save.progress);
    }
    this.applyCharacter();
    this.startTraining('punch');
    this.banner.push({ title: `Welcome back, ${this.character.name}!`, subtitle: `Power Level ${formatNumber(this.progress.basePowerLevel())}`, duration: 2.5 });
    // Older saves: grant anything new content now unlocks at their level.
    this.progress.refreshUnlocks();
  }

  openCreator() {
    this.state = 'creator';
    this.hideAllMenus();
    this.resetPlayerPosition();
    this.previewForm = 'base';
    this.removePreview();
    this.previewAvatar = createAvatar(this.character);
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

  // Creator preview cycles through every form.
  togglePreviewForm() {
    const forms = FORM_ORDER.filter((id) => FORMS[id].playable);
    this.previewForm = forms[(forms.indexOf(this.previewForm) + 1) % forms.length];
    this.previewPower = 1.4;
    this.previewAvatar?.setForm(this.previewForm);
  }

  // The creator switched between a modeled and a procedural look.
  refreshPreviewAvatar() {
    if (!this.previewAvatar || !needsNewAvatar(this.previewAvatar, this.character)) return false;
    const old = this.previewAvatar;
    this.previewAvatar = createAvatar(this.character);
    this.previewAvatar.setForm(this.previewForm);
    this.previewAvatar.root.position.copy(old.root.position);
    this.previewAvatar.root.quaternion.copy(old.root.quaternion);
    this.renderer.scene.add(this.previewAvatar.root);
    this.renderer.scene.remove(old.root);
    old.dispose();
    return true;
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
    this.banner.push({ title: 'Need help?', subtitle: `${key(this, 'menu')} opens the menu. Help shows every button.`, duration: 3.5 });
  }

  startTraining(activity = 'punch') {
    const wasBoss = this.state === 'boss' || this.state === 'result';
    this.boss.stop();
    this.hideAllMenus();
    this.menuOpen = false;
    this.state = 'training';
    this.combat.clearProjectiles();
    this.speedFocus.reset();
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

  // Any boss can be challenged at any Power Level.
  startBoss(id = this.currentBossId) {
    const def = bossById(id) || BOSSES[0];
    this.currentBossId = def.id;
    this.hideAllMenus();
    this.menuOpen = false;
    this.training.setEnabled(false);
    this.combat.clearProjectiles();
    this.speedFocus.reset();
    this.unlockNews = [];
    this.state = 'boss';
    this.transformation.forceBase();
    this.player.resetResources();
    this.player.ki = this.progress.maxKi();
    const a = this.progress.data.bossAttempts;
    a[def.id] = (a[def.id] || 0) + 1;
    this.boss.setBoss(def.id);
    this.fadeTo(() => {
      this.resetPlayerPosition();
      this.boss.start(def.id);
    });
    this.hud.setMode(this.isXR, true);
    this.banner.clear(); // drop any leftover training tips
    this.banner.push({ title: 'BOSS BATTLE', subtitle: `${def.name} · Power Level ${formatNumber(def.powerLevel)}`, color: '#ff6a6a', duration: 2.6, big: true });
    this.updatePointerMode();
  }

  showResult(win) {
    this.state = 'result';
    this.menuOpen = false;
    this.gameMenu.panel.hide();
    this.boss.stop();
    this.transformation.forceBase();
    const def = this.boss.def;
    const pl = this.progress.basePowerLevel();
    const lines = [];
    if (win) {
      lines.push(`You defeated ${def.name} at Power Level ${formatNumber(this.progress.powerLevel(this.lastFightForm || 'base'))}.`);
      lines.push(`Rewards: +${def.rewards.xp} XP to every stat.`);
      for (const n of this.unlockNews.slice(0, 3)) lines.push(`NEW: ${n}`);
      const next = BOSSES.find((b) => !this.progress.beat(b.id));
      if (next) lines.push(`Next challenge: ${next.name} (Power Level ${formatNumber(next.powerLevel)}).`);
    } else {
      const top = this.progress.topForm();
      lines.push(`${def.name}'s Power Level is ${formatNumber(def.powerLevel)}. Yours is ${formatNumber(pl)}${top !== 'base' ? ` (${formatNumber(this.progress.powerLevel(top))} as ${FORMS[top].name})` : ''}.`);
      const tips = [];
      if (top !== 'base' && this.lastFightForm !== top) tips.push(`transform into ${FORMS[top].name} early (${key(this, 'powerUp').toLowerCase()}, then press ${key(this, 'transform')}; repeat to climb forms)`);
      if (top === 'base') tips.push(`train to Power Level 5,000 to unlock Super Saiyan (your lowest stat is ${STAT_LABELS[this.progress.lowestStat()]})`);
      if (def.attacks.slam) tips.push('get out of the red ring before the slam lands');
      if (def.attacks.beam) tips.push('step out of the red aim line when the beam charges');
      if (def.attacks.barrier) tips.push('punch through the purple barrier, ki is absorbed');
      if (def.attacks.teleport) tips.push('turn around when you hear BEHIND YOU');
      tips.push(`block (${key(this, 'block').toLowerCase()}) when a fist glows red`);
      if (this.speedFocus.unlocked) tips.push(`use slow motion (${key(this, 'slowmo').toLowerCase()}) to read big attacks`);
      lines.push(`Tip: ${tips.slice(0, 2).join('; ')}.`);
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

  // Walking through the gate: pick a planet (or stay).
  openPortalMenu() {
    if (this.menuOpen) return;
    this.menuOpen = true;
    this.portalMenu.panel.dirty = true;
    this.portalMenu.panel.show();
    this.placeInFront(this.portalMenu.panel.mesh, 1.4, 0, -0.05);
    this.updatePointerMode();
  }

  closePortalMenu() {
    this.menuOpen = false;
    this.portalMenu.panel.hide();
    // Step back out of the gate so it doesn't open again straight away.
    if (this.player.rig.position.z < -38) this.player.rig.position.z = -37;
    this.updatePointerMode();
  }

  travel(id) {
    this.menuOpen = false;
    this.portalMenu.panel.hide();
    this.combat.clearProjectiles();
    this.audio.whoosh?.();
    this.fadeTo(() => {
      this.training.setLocation(id);
      this.resetPlayerPosition();
    });
    this.updatePointerMode();
  }

  closeGameMenu() {
    this.menuOpen = false;
    this.gameMenu.panel.hide();
    this.portalMenu.panel.hide();
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
      this.effects.impact(h.point, transformed ? 0xffe680 : 0xffffff, 0.25 + 0.45 * power + (h.finisher ? 0.35 : 0));
      this.freeze(0.03 + 0.06 * power + (h.finisher ? 0.1 : 0));
      this.addShake(0.02 + 0.05 * power + (h.finisher ? 0.06 : 0));
      this.effects.burst(h.point, transformed ? 0xffcc33 : 0xfff2cc, Math.round(6 + 16 * power), 1.5 + 3 * power, 0.04 + 0.04 * power, 0.35);
      if (power > 0.55 || h.finisher) {
        this.effects.ring(h.point, col, { maxRadius: 0.5 + power, duration: 0.3, vertical: true, normal: h.dir, opacity: 0.6 });
      }
      // Heavy hits: a second, wider shockwave and debris sparks (close-range powerhouse feel).
      if (power > 0.8) {
        this.effects.ring(h.point, 0xffffff, { maxRadius: 1.4 + power, duration: 0.45, vertical: true, normal: h.dir, opacity: 0.35 });
        this.effects.burst(h.point, 0xffb04a, 8, 3.5, 0.03, 0.5);
      }
      if (h.finisher) this.banner.push({ title: `${h.combo}-HIT COMBO!`, color: '#ffcc33', duration: 1.0, priority: true });
    });
    bus.on('punch:swing', () => this.audio.whoosh());
    bus.on('blast:fired', (b) => {
      this.audio.kiBlast(b.power, b.charged);
      this.haptic(b.hand, b.charged ? 0.8 : 0.3, b.charged ? 120 : 40);
    });
    bus.on('projectile:explode', (e) => this.audio.explosion(clamp(0.1 + 0.35 * (e.energy ?? 0.5), 0.12, 1)));
    bus.on('blast:hit', (h) => {
      this.effects.impact(h.point, 0xffffff, 0.3 + 0.35 * (h.energy || 0.5));
      if (h.charged || h.sphere) this.freeze(0.05 + 0.04 * (h.energy || 1));
    });
    // Explosions shake the camera (desktop) or rumble the controllers (VR), less with distance.
    bus.on('fx:shake', ({ position, amount }) => {
      const d = position.distanceTo(this.player.headWorld);
      const k = amount / (1 + d * d * 0.03);
      if (k < 0.01) return;
      this.addShake(k);
      if (k > 0.04) { this.haptic('left', clamp(k * 4, 0.15, 1), 40 + 200 * k); this.haptic('right', clamp(k * 4, 0.15, 1), 40 + 200 * k); }
    });
    bus.on('ki:empty', () => bus.emit('hud:message', { text: `Not enough ki! Power up: ${key(this, 'powerUp').toLowerCase()}`, color: '#4cc3ff' }));
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
      if (!h.blocked) this.addShake(0.05 + clamp(h.damage / 150, 0, 0.12));
      if (!h.blocked && this.settings.battleDamage !== false) {
        const frac = this.player.health / this.progress.maxHealth();
        this.damageOverlay.flash(clamp(0.35 + h.damage / 25, 0.35, 1));
        this.handWounds.hit(h.point, null, frac, clamp(h.damage / 20, 0.2, 1));
      }
    });
    bus.on('player:defeated', () => {
      if (this.state === 'boss') {
        this.boss.say(this.boss.def.lines.win);
        this.lastFightForm = this.player.form;
        this.resultTimer = 1.8;
        this.pendingResult = false;
      } else {
        // Training never kills you: you just collapse and recover.
        this.player.resetResources();
        bus.emit('hud:message', { text: 'You collapsed! Catch your breath…', color: '#ff9a4d' });
      }
    });
    bus.on('boss:defeated', ({ id }) => {
      this.lastFightForm = this.player.form;
      const def = bossById(id) || this.boss.def;
      const d = this.progress.data;
      const first = !d.bossesDefeated.includes(def.id);
      if (first) d.bossesDefeated.push(def.id);
      for (const k of ['strength', 'speed', 'ki', 'stamina']) this.progress.addXp(k, def.rewards.xp, 'boss-reward');
      this.progress.refreshUnlocks();
      this.audio.fanfare();
      this.banner.push({ title: `${def.name.toUpperCase()} DEFEATED!`, subtitle: first ? 'First victory! New rewards unlocked' : 'Victory!', color: '#ffcc33', duration: 3.2, big: true, priority: true });
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
      if (this.state === 'boss') this.unlockNews.push(`${FORMS[form].name} transformation`);
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
    bus.on('attack:unlocked', ({ attack, equipped }) => {
      if (this.state === 'boss') this.unlockNews.push(`${attack.name} attack`);
      this.audio.levelUp();
      this.banner.push({ title: `NEW ATTACK: ${attack.name.toUpperCase()}`, subtitle: equipped ? `Equipped. ${this.isXR ? 'Press B' : 'Press E'} to switch to it` : 'Equip it in the Attacks menu', color: '#4cc3ff', duration: 3 });
      this.save();
    });
    bus.on('gravity:unlocked', ({ gravity }) => {
      if (this.state === 'boss') this.unlockNews.push(`${gravity}x gravity training`);
      this.banner.push({ title: `${gravity}x GRAVITY UNLOCKED`, subtitle: 'Set it in Menu > Training for bonus XP', color: '#ff6a6a', duration: 3 });
    });
    bus.on('timechamber:unlocked', () => {
      if (this.state === 'boss') this.unlockNews.push('the Hyperbolic Time Chamber');
      this.audio.fanfare();
      this.banner.push({ title: 'TIME CHAMBER UNLOCKED', subtitle: 'Menu > Training > Location. 3x XP inside', color: '#ffffff', duration: 3.5, big: true });
    });
    bus.on('timechamber:milestone', ({ days, xp }) => {
      this.audio.fanfare();
      this.banner.push({ title: `DAY ${days} IN THE TIME CHAMBER`, subtitle: `+${Math.round(xp)} XP to every stat`, color: '#ffffff', duration: 3 });
    });
    bus.on('slowmo:unlocked', () => {
      this.audio.fanfare();
      this.banner.push({ title: 'SLOW MOTION UNLOCKED!', subtitle: this.isXR ? 'Click the right thumbstick to slow time' : 'Press F (or the Slow-Mo button) to slow time', color: '#5cff8a', duration: 4, big: true, priority: true });
    });
    bus.on('slowmo', ({ on }) => {
      if (on) this.banner.push({ title: 'SLOW MOTION', color: '#7fd8ff', duration: 1.0, priority: true });
      this.updateActionButtons(true);
    });
    bus.on('kaioken', ({ on }) => {
      if (on) {
        this.audio.kaioken();
        this.banner.push({ title: 'KAIO-KEN!', subtitle: 'Damage and speed up · burns stamina', color: '#ff4a3a', duration: 1.6, priority: true });
      } else bus.emit('hud:message', { text: 'Kaio-ken wore off', color: '#ff8a8a' });
    });
    bus.on('flight:changed', ({ flying }) => {
      this.audio.flight(flying);
      if (flying) {
        bus.emit('hud:message', { text: this.isXR ? 'Flying! Left stick: move where you look · Right stick up/down: rise/descend' : 'Flying! WASD move where you look · R rise · V descend · G land', color: '#bfe6ff', duration: 4 });
      }
      this.updateActionButtons(true);
    });
    bus.on('beam:fired', ({ attack }) => {
      this.banner.push({ title: `${attack.name.toUpperCase()}!`, color: '#7fd8ff', duration: 1.2, priority: true });
      // Recoil: a shockwave and dust kicked up around your feet as it fires.
      const feet = this.player.headWorld.clone().setY(this.player.groundY());
      this.effects.ring(feet.clone().setY(feet.y + 0.05), attack.color, { maxRadius: 4, duration: 0.6, opacity: 0.6 });
      this.effects.dust(feet, 1.1, 5);
      this.addShake(0.12);
      this.haptic('left', 1, 200);
      this.haptic('right', 1, 200);
    });
    bus.on('region:entered', ({ index }) => {
      if (index < 0 || this.exploreTipShown) return;
      this.exploreTipShown = true;
      bus.emit('hud:message', { text: this.isXR ? 'Tip: fly (left stick click) and hold the stick forward to cruise at high speed.' : 'Tip: fly (G) and hold W to cruise at high speed.', color: '#bfe6ff', duration: 5 });
    });
    bus.on('beam:start', () => this.audio.beam(true));
    bus.on('beam:end', () => this.audio.beam(false));
    bus.on('spar:won', ({ level, shadow }) => {
      this.banner.push({ title: 'KNOCKDOWN!', subtitle: `${shadow ? 'Your shadow' : `${level.name} partner`} is down · bonus XP to every stat`, color: '#ffcc33', duration: 2.6, priority: true });
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
    // Point each hand's shots at what its reticle is on (locks onto enemies).
    this.aim.update(input, xr, active && this.player.alive);
    this.lastInput = input;
    if (active) {
      if (input.hands.right.secondaryDown) this.player.cycleAttack();
      // Left stick click / G / Fly button: fly or land. Right stick click / F: slow motion.
      if (input.hands.left.stickPressDown && this.player.alive) this.player.toggleFlight();
      if (input.hands.right.stickPressDown && this.player.alive) this.speedFocus.activate();
      this.player.updateBlocking(input, this.hands);
    } else this.player.blocking = false;
    this.player.updateMovement(dt, input, active);
    this.transformation.update(dt, input, { enabled: active && this.player.alive });
    if (active && this.player.alive) {
      this.player.updatePunching(dt, this.hands);
    }
    this.player.updateFiring(dt, input, this.hands, active && this.player.alive);
    // Slow motion slows only enemies and their attacks; you keep full speed.
    let ets = this.speedFocus.update(dt, active && this.player.alive);
    // Hit-stop: on a heavy blow the enemy freezes for a few frames (you don't,
    // so it never feels like lag in VR).
    if (this.hitStop > 0) { this.hitStop -= dt; ets *= 0.04; }
    this.arena.slow = clamp((1 - ets) / 0.8, 0, 1);
    if (!paused) {
      this.player.updateResources(dt, { charging: this.transformation.state === 'charging' });
      this.combat.update(dt, ets);
      this.boss.update(dt * ets);
    }
    this.training.update(dt, dt * ets);
    this.destruction.update(dt * ets);
    const fighting = this.state === 'training' || this.state === 'boss';
    const hpFrac = this.player.health / this.progress.maxHealth();
    if (fighting) this.handWounds.update(dt, hpFrac);
    else if (this.handWounds.decals.length) this.handWounds.reset();
    this.damageOverlay.update(dt, { healthFrac: fighting ? hpFrac : 1, enabled: this.settings.battleDamage !== false, slow: this.arena.slow });
    this.audio.beamCharge(this.player.beam.charging ? this.player.beam.charge : 0);
    this.updateActionButtons();
    this.mirror.update(dt);
    this.arena.update(dt);
    this.effects.eye.copy(this.player.headWorld);
    this.world.update(dt, this.player.headWorld, xr ? 3 : 6);
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

    this.renderShaken(dt, xr);
  }

  freeze(t) { this.hitStop = Math.max(this.hitStop, Math.min(0.2, t)); }
  addShake(a) { this.shake = Math.min(0.35, Math.max(this.shake, a) + a * 0.25); }

  // Desktop only: in a headset a moving camera causes motion sickness.
  renderShaken(dt, xr) {
    const cam = this.renderer.camera;
    const on = !xr && this.shake > 0.002 && this.settings.screenShake !== false;
    if (on) {
      const a = this.shake;
      const t = performance.now() * 0.001;
      this.shakeOffset.set(Math.sin(t * 71) * a * 0.12, Math.sin(t * 89 + 1) * a * 0.1, 0);
      cam.position.add(this.shakeOffset);
      cam.rotation.z = Math.sin(t * 53) * a * 0.05;
    }
    this.shake = Math.max(0, this.shake - dt * (0.6 + this.shake * 4));
    this.renderer.render();
    if (on) { cam.position.sub(this.shakeOffset); cam.rotation.z = 0; }
  }

  updatePlayerAuraPosition() {
    const head = this.player.headWorld;
    this.playerAura.group.position.set(head.x, this.player.groundY(), head.z);
    // In first person the aura shell is centred on the body (slightly behind the eyes).
    const f = this.player.flatForward(_v.clone());
    this.playerAura.group.position.addScaledVector(f, -0.1);
  }

  // ---- On-screen action buttons (desktop): Fly and Slow-Mo -------------------
  setupActionButtons() {
    this.actionBar = document.getElementById('action-buttons');
    this.btnFly = document.getElementById('btn-fly');
    this.btnSlow = document.getElementById('btn-slowmo');
    this.btnPowerDown = document.getElementById('btn-powerdown');
    const press = (key) => (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.desktopInput.virtual[key] = true;
      this.desktopInput.requestLock();
    };
    this.btnFly?.addEventListener('click', press('fly'));
    this.btnSlow?.addEventListener('click', press('slowmo'));
    this.btnPowerDown?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.transformation.powerDown();
      this.desktopInput.requestLock();
    });
    this.actionTimer = 0;
  }

  updateActionButtons(force = false) {
    if (!this.actionBar) return;
    this.actionTimer -= 1 / 60;
    if (!force && this.actionTimer > 0) return;
    this.actionTimer = 0.2;
    const show = !this.isXR && this.gameplayActive;
    this.actionBar.classList.toggle('hidden', !show);
    if (!show) return;
    const flying = this.player.flying;
    this.btnFly.innerHTML = `${flying ? 'LAND' : 'FLY'} <kbd>G</kbd>`;
    this.btnFly.classList.toggle('on', flying);
    const sf = this.speedFocus;
    let label = 'SLOW-MO <kbd>F</kbd>';
    if (!sf.unlocked) label = `SLOW-MO <small>Speed Lv ${SLOWMO_UNLOCK_LEVEL}</small>`;
    else if (sf.active > 0) label = `SLOW-MO ${Math.ceil(sf.active)}s`;
    else if (sf.cooldown > 0) label = `SLOW-MO <small>${Math.ceil(sf.cooldown)}s</small>`;
    this.btnSlow.innerHTML = label;
    this.btnSlow.classList.toggle('on', sf.active > 0);
    this.btnSlow.classList.toggle('locked', !sf.unlocked || (sf.cooldown > 0 && !(sf.active > 0)));
    const tr = this.transformation;
    this.btnPowerDown?.classList.toggle('hidden', this.player.form === 'base' || tr.state === 'transforming' || tr.state === 'poweringDown');
  }

  updatePreview(dt) {
    if (!this.previewAvatar || this.state !== 'creator') return;
    this.previewSpin = (this.previewSpin || 0) + dt * 0.6;
    this.previewAvatar.root.rotation.y = this.previewAvatarBaseYaw + Math.sin(this.previewSpin) * 1.2;
    // Each new form in the preview starts with a short power-up.
    if (this.previewPower > 0) {
      this.previewPower -= dt;
      this.previewAvatar.powerUpPose(this.previewSpin * 2, Math.min(1, this.previewPower * 2));
    } else this.previewAvatar.restPose(this.previewSpin * 2);
  }
}

const _v2 = new THREE.Vector2();
