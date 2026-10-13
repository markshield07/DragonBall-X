import { Panel, COLORS } from './Panel.js';
import { FORMS, FORM_ORDER } from '../progression/forms.js';
import { ATTACKS, ATTACK_ORDER } from '../progression/attacks.js';
import { STAT_KEYS, STAT_LABELS, STAT_TRAINING, xpToNext, GRAVITY_LEVELS, TIME_CHAMBER_UNLOCK } from '../progression/Progression.js';
import { ACTIVITIES, SPAR_LEVELS } from '../training/Training.js';
import { SLOWMO_UNLOCK_LEVEL } from '../player/SpeedFocus.js';
import { BOSSES } from '../boss/bosses.js';
import { GRAPHICS_PRESETS } from '../settings/Settings.js';
import {
  SKIN_TONES, HAIR_STYLES, HAIR_COLORS, EYE_COLORS, BODY_TYPES, BUILDS, BROWS, SCARS, EXPRESSIONS,
  OUTFITS, OUTFIT_PALETTE, OUTFIT_SECTIONS, CHARACTER_TEMPLATES, applyCharacterTemplate, randomName, defaultCharacter,
} from '../character/options.js';
import { formatNumber } from '../core/math.js';

const STAT_ACTIVITY = { strength: 'punch', ki: 'ki', speed: 'speed', stamina: 'defense' };
const cycle = (arr, cur, dir) => (cur + dir + arr.length) % arr.length;

// ---------------------------------------------------------------------------
export class MainMenu {
  constructor(game) {
    this.game = game;
    this.panel = new Panel({ width: 1.4, height: 1.0, name: 'mainMenu', depthTest: false });
    this.confirmNew = false;
    this.panel.setDraw((ui) => this.draw(ui));
  }

  draw(ui) {
    const g = this.game;
    ui.background();
    ui.text('DRAGON BALL', ui.W / 2, 140, { size: 110, align: 'center', color: COLORS.gold, stroke: '#7a2a00' });
    ui.text('X', ui.W / 2, 250, { size: 120, align: 'center', color: '#ffffff', stroke: '#1a4ea8' });
    ui.text('Saiyan Training · Phases 1–3', ui.W / 2, 315, { size: 34, align: 'center', color: COLORS.muted, weight: 'normal' });
    const bw = 620;
    const x = (ui.W - bw) / 2;
    let y = 370;
    const has = g.hasSave();
    if (this.confirmNew) {
      ui.text('Start over? Your saved warrior will be erased.', ui.W / 2, y + 40, { size: 34, align: 'center', color: COLORS.red });
      ui.button('confirmYes', 'Yes, new warrior', x, y + 80, bw, 100, { onClick: () => { this.confirmNew = false; g.newGame(); } });
      ui.button('confirmNo', 'Cancel', x, y + 200, bw, 100, { onClick: () => { this.confirmNew = false; } });
      return;
    }
    if (has) {
      const s = g.saveSummary();
      ui.button('continue', 'Continue', x, y, bw, 120, { size: 48, color: '#b4560f', sub: s, onClick: () => g.continueGame() });
      y += 140;
    }
    ui.button('new', 'New Warrior', x, y, bw, 100, { size: 42, onClick: () => { if (has) this.confirmNew = true; else g.newGame(); } });
    y += 120;
    ui.button('settings', 'Settings & Comfort', x, y, bw, 90, { size: 36, onClick: () => g.openGameMenu('settings', true) });
    y += 110;
    ui.text(g.isXR ? 'Point and pull the trigger to select' : 'Click to select', ui.W / 2, Math.min(y + 30, ui.H - 30), { size: 28, align: 'center', color: COLORS.muted, weight: 'normal' });
  }
}

// ---------------------------------------------------------------------------
export class CharacterCreator {
  constructor(game) {
    this.game = game;
    this.panel = new Panel({ width: 1.3, height: 1.3, name: 'creator', depthTest: false });
    this.keyboard = false;
    this.tab = 'body';
    this.panel.setDraw((ui) => this.draw(ui));
    window.addEventListener('keydown', (e) => {
      if (this.game.state !== 'creator' || this.game.isXR) return;
      const c = this.game.character;
      if (e.key === 'Backspace') { c.name = c.name.slice(0, -1); this.changed(); e.preventDefault(); }
      else if (/^[a-zA-Z0-9 ]$/.test(e.key) && c.name.length < 12) { c.name += e.key; this.changed(); }
    });
  }

  changed() {
    if (!this.game.refreshPreviewAvatar()) this.game.previewAvatar?.apply(this.game.character);
    this.panel.dirty = true;
  }

  draw(ui) {
    const g = this.game;
    const c = g.character;
    ui.background();
    ui.text('CREATE YOUR SAIYAN', ui.W / 2, 72, { size: 56, align: 'center', color: COLORS.gold });
    ui.text('Choose an anime warrior template, then customize your look', ui.W / 2, 112, { size: 26, align: 'center', color: COLORS.muted, weight: 'normal' });
    if (this.keyboard) return this.drawKeyboard(ui);
    const rowH = 96;
    let y = 128;
    const labelX = 40;
    const valX = 330;
    const valW = ui.W - valX - 40;
    const arrowRow = (id, label, list, key, idOf = (o) => o.id) => {
      const i = Math.max(0, list.findIndex((o) => idOf(o) === c[key]));
      ui.text(label, labelX, y + 58, { size: 34, color: COLORS.muted });
      ui.button(`${id}-prev`, '<', valX, y + 12, 80, 72, { size: 44, onClick: () => { c[key] = idOf(list[cycle(list, i, -1)]); this.changed(); } });
      ui.text(list[i].name, valX + valW / 2, y + 60, { size: 36, align: 'center', maxWidth: valW - 190 });
      ui.button(`${id}-next`, '>', valX + valW - 80, y + 12, 80, 72, { size: 44, onClick: () => { c[key] = idOf(list[cycle(list, i, 1)]); this.changed(); } });
      y += rowH;
    };
    const swatchRow = (id, label, list, key, colorOf = (o) => o.color) => {
      ui.text(label, labelX, y + 58, { size: 34, color: COLORS.muted, maxWidth: valX - labelX - 10 });
      const n = list.length;
      const size = Math.min(78, (valW - 10) / n);
      list.forEach((o, i) => ui.swatch(`${id}-${i}`, valX + i * size, y + 12, size - 6, colorOf(o), {
        selected: c[key] === i,
        onClick: () => { c[key] = i; this.changed(); },
      }));
      y += rowH;
    };
    // Name
    ui.text('Name', labelX, y + 58, { size: 34, color: COLORS.muted });
    ui.text(c.name || '—', valX, y + 60, { size: 42, color: '#ffffff', maxWidth: ui.W - valX - 400 });
    ui.button('name-rand', 'Random', ui.W - 380, y + 12, 160, 72, { size: 30, onClick: () => { c.name = randomName(); this.changed(); } });
    ui.button('name-edit', 'Type', ui.W - 200, y + 12, 160, 72, { size: 30, onClick: () => { this.keyboard = true; } });
    y += rowH;
    // Section tabs
    const tabs = [['body', 'Body'], ['face', 'Face'], ['hair', 'Hair'], ['outfit', 'Outfit']];
    const tw = (ui.W - 80 - 3 * 12) / 4;
    tabs.forEach(([id, label], i) => ui.button(`ctab-${id}`, label, 40 + i * (tw + 12), y + 6, tw, 70, {
      size: 32, selected: this.tab === id, onClick: () => { this.tab = id; },
    }));
    y += 96;
    if (this.tab === 'body') {
      const templates = CHARACTER_TEMPLATES;
      const ti = Math.max(0, templates.findIndex(t => t.id === c.templateId));
      ui.text('Template', labelX, y + 58, { size: 34, color: COLORS.muted });
      ui.button('template-prev', '<', valX, y + 12, 80, 72, { size: 44, onClick: () => { applyCharacterTemplate(c, templates[cycle(templates, ti, -1)].id); this.changed(); } });
      ui.text(templates[ti].name, valX + valW / 2, y + 60, { size: 32, align: 'center', maxWidth: valW - 190 });
      ui.button('template-next', '>', valX + valW - 80, y + 12, 80, 72, { size: 44, onClick: () => { applyCharacterTemplate(c, templates[cycle(templates, ti, 1)].id); this.changed(); } });
      y += rowH;
      arrowRow('build', 'Build', BUILDS, 'build');
      arrowRow('frame', 'Frame', BODY_TYPES, 'body');
      swatchRow('skin', 'Skin tone', SKIN_TONES, 'skin');
      ui.button('reset', 'Reset to Rokan default look', valX, y + 12, valW, 72, { size: 30, onClick: () => { const n = c.name; Object.assign(c, defaultCharacter(), { name: n }); this.changed(); } });
    } else if (this.tab === 'face') {
      swatchRow('eye', 'Eye color', EYE_COLORS, 'eyeColor');
      arrowRow('expr', 'Expression', EXPRESSIONS, 'expression');
      arrowRow('brows', 'Brows', BROWS, 'brows');
      arrowRow('scar', 'Scars', SCARS, 'scar');
    } else if (this.tab === 'hair') {
      arrowRow('hair', 'Hairstyle', HAIR_STYLES, 'hairStyle');
      swatchRow('hairc', 'Hair color', HAIR_COLORS, 'hairColor');
      ui.wrap('Every Super Saiyan form restyles your hair. Use Preview to cycle through them.', labelX, y + 40, ui.W - 80, { size: 26 });
    } else {
      arrowRow('outfit', 'Outfit', OUTFITS, 'outfit');
      for (const sec of OUTFIT_SECTIONS) swatchRow(sec.key, sec.name, OUTFIT_PALETTE, sec.key);
    }
    ui.button('preview-ssj', `Preview: ${FORMS[g.previewForm].name}`, 40, ui.H - 118, 440, 90, {
      size: 30, onClick: () => { g.togglePreviewForm(); },
    });
    ui.button('start', 'Begin Training!', ui.W - 520, ui.H - 118, 480, 90, { size: 42, color: '#b4560f', onClick: () => g.finishCreation() });
  }

  drawKeyboard(ui) {
    const c = this.game.character;
    ui.text(c.name + '_', ui.W / 2, 190, { size: 64, align: 'center' });
    const rows = ['ABCDEFGHIJ', 'KLMNOPQRST', 'UVWXYZ'];
    const k = 104;
    rows.forEach((row, r) => {
      const x0 = (ui.W - row.length * k) / 2;
      [...row].forEach((ch, i) => ui.button(`k-${ch}`, ch, x0 + i * k, 260 + r * (k + 10), k - 10, k - 4, {
        size: 44,
        onClick: () => { if (c.name.length < 12) c.name += c.name.length ? ch.toLowerCase() : ch; this.changed(); },
      }));
    });
    ui.button('k-back', 'Delete', 120, 640, 320, 100, { size: 38, onClick: () => { c.name = c.name.slice(0, -1); this.changed(); } });
    ui.button('k-clear', 'Clear', 470, 640, 240, 100, { size: 38, onClick: () => { c.name = ''; this.changed(); } });
    ui.button('k-done', 'Done', 740, 640, 320, 100, { size: 40, color: '#b4560f', onClick: () => { if (!c.name) c.name = randomName(); this.keyboard = false; this.changed(); } });
  }
}

// ---------------------------------------------------------------------------
export class GameMenu {
  constructor(game) {
    this.game = game;
    this.panel = new Panel({ width: 1.6, height: 1.15, name: 'gameMenu', depthTest: false });
    this.tab = 'status';
    this.fromMain = false;
    this.panel.setDraw((ui) => this.draw(ui));
  }

  draw(ui) {
    const g = this.game;
    ui.background();
    const tabs = this.fromMain ? [['settings', 'Settings']] : [['status', 'Status'], ['training', 'Training'], ['boss', 'Bosses'], ['attacks', 'Attacks'], ['settings', 'Settings']];
    const tw = (ui.W - 80 - (tabs.length - 1) * 12) / tabs.length;
    tabs.forEach(([id, label], i) => ui.button(`tab-${id}`, label, 40 + i * (tw + 12), 30, tw, 80, {
      size: 34, selected: this.tab === id, onClick: () => { this.tab = id; },
    }));
    const area = { x: 40, y: 140, w: ui.W - 80, h: ui.H - 280 };
    ({ status: () => this.drawStatus(ui, area), training: () => this.drawTraining(ui, area), boss: () => this.drawBoss(ui, area), attacks: () => this.drawAttacks(ui, area), settings: () => this.drawSettings(ui, area) })[this.tab]();
    // Footer
    const fy = ui.H - 120;
    if (this.fromMain) {
      ui.button('back', 'Back', ui.W / 2 - 200, fy, 400, 90, { size: 38, onClick: () => g.closeGameMenu() });
    } else {
      ui.button('resume', 'Resume', 40, fy, 420, 90, { size: 38, color: '#b4560f', onClick: () => g.closeGameMenu() });
      ui.button('save', 'Save', 480, fy, 300, 90, { size: 34, onClick: () => { g.save(); g.banner.push({ title: 'Progress saved', duration: 1.4, color: '#5cff8a' }); } });
      ui.button('quit', 'Save & Main Menu', 800, fy, ui.W - 840, 90, { size: 32, onClick: () => g.toMainMenu() });
    }
  }

  drawStatus(ui, a) {
    const g = this.game;
    const p = g.progress;
    const pl = g.currentPowerLevel();
    ui.text('POWER LEVEL', a.x, a.y + 30, { size: 30, color: COLORS.muted });
    ui.text(formatNumber(pl), a.x, a.y + 100, { size: 76, color: g.player.form === 'base' ? '#fff' : COLORS.gold });
    ui.text(`Form: ${FORMS[g.player.form].name}`, a.x, a.y + 150, { size: 32, color: COLORS.gold });
    let y = a.y + 200;
    for (const k of STAT_KEYS) {
      const st = p.data.stats[k];
      ui.text(`${STAT_LABELS[k]} Lv ${st.level}`, a.x, y + 34, { size: 32 });
      ui.bar(a.x + 280, y + 6, 360, 36, st.xp / xpToNext(st.level), '#4cc3ff', { label: `${Math.floor(st.xp)}/${xpToNext(st.level)}` });
      y += 60;
    }
    const low = p.lowestStat();
    y = ui.wrap(`Tip: ${STAT_TRAINING[low]} gives +50% XP right now (your lowest stat).`, a.x, y + 30, 680, { size: 26, color: COLORS.green });
    // Quick actions (also on the left / right thumbstick clicks, G / F on desktop).
    const sf = g.speedFocus;
    ui.button('act-fly', g.player.flying ? 'Land' : 'Fly', a.x, y + 10, 330, 80, {
      size: 34, color: '#1a4ea8', sub: g.isXR ? 'Left stick click' : 'G',
      onClick: () => { g.closeGameMenu(); g.player.toggleFlight(); },
    });
    ui.button('act-slowmo', 'Slow Motion', a.x + 350, y + 10, 330, 80, {
      size: 32, enabled: sf.unlocked, sub: sf.unlocked ? (g.isXR ? 'Right stick click' : 'F') : `Speed Lv ${SLOWMO_UNLOCK_LEVEL}`,
      onClick: () => { g.closeGameMenu(); sf.activate(); },
    });
    // Right column: goal + transformations
    const rx = a.x + 760;
    const goal = p.nextGoal(BOSSES);
    ui.text('NEXT GOAL', rx, a.y + 30, { size: 30, color: COLORS.muted });
    ui.text(goal.title, rx, a.y + 76, { size: 38, color: COLORS.gold, maxWidth: a.w - 770 });
    ui.bar(rx, a.y + 96, a.w - 770, 34, goal.progress, '#ff8a1a');
    ui.text(goal.detail, rx, a.y + 166, { size: 28, color: COLORS.text, maxWidth: a.w - 770, weight: 'normal' });
    ui.text('TRANSFORMATIONS', rx, a.y + 230, { size: 30, color: COLORS.muted });
    let ty = a.y + 270;
    for (const id of FORM_ORDER) {
      const f = FORMS[id];
      const unlocked = p.isFormUnlocked(id);
      const mastery = id !== 'base' && unlocked ? `  ·  Mastery ${p.mastery(id).level}` : '';
      ui.text(`${unlocked ? '★' : '◇'} ${f.name}${mastery}`, rx, ty, { size: 30, color: unlocked ? COLORS.gold : '#7b84a8', weight: unlocked ? 'bold' : 'normal' });
      if (!unlocked && f.unlock) ui.text(f.unlock.label, rx + 40, ty + 30, { size: 22, color: '#7b84a8', weight: 'normal', maxWidth: a.w - 810 });
      ty += unlocked ? 44 : 64;
    }
  }

  drawTraining(ui, a) {
    const g = this.game;
    const p = g.progress;
    const t = g.training;
    let y = a.y;
    // Activities: two columns.
    const colW = (a.w - 20) / 2;
    ACTIVITIES.forEach((act, i) => {
      const locked = act.requires && !p.isFormUnlocked(act.requires);
      const st = STAT_KEYS.includes(act.stat) ? p.data.stats[act.stat] : null;
      const sub = locked ? 'Unlock Super Saiyan first'
        : st ? `${STAT_LABELS[act.stat]} Lv ${st.level}`
        : act.stat === 'all' ? `All stats · ${SPAR_LEVELS.find((l) => l.id === t.prefs.difficulty)?.name || 'Normal'}`
        : `Mastery Lv ${p.mastery(p.topForm() === 'base' ? 'ssj1' : p.topForm()).level}`;
      ui.button(`act-${act.id}`, act.name, a.x + (i % 2) * (colW + 20), y + Math.floor(i / 2) * 94, colW, 84, {
        size: 32, sub, enabled: !locked, selected: t.activity === act.id && g.state === 'training',
        onClick: () => { g.startTraining(act.id); },
      });
    });
    y += Math.ceil(ACTIVITIES.length / 2) * 94 + 6;
    const cur = ACTIVITIES.find((x) => x.id === t.activity);
    y = ui.wrap(cur.desc, a.x, y + 22, a.w, { size: 24, color: COLORS.muted });
    y += 8;
    const row = (label, opts, onPick) => {
      ui.text(label, a.x, y + 50, { size: 28, color: COLORS.gold });
      const bx = a.x + 300;
      const bw = (a.w - 300 - (opts.length - 1) * 10) / opts.length;
      opts.forEach((o, i) => ui.button(`${label}-${o.id}`, o.name, bx + i * (bw + 10), y + 6, bw, 70, {
        size: 26, selected: o.selected, enabled: o.enabled !== false, sub: o.sub, onClick: () => onPick(o.id),
      }));
      y += 82;
    };
    row('Partner', SPAR_LEVELS.map((l) => ({ id: l.id, name: l.name, selected: t.prefs.difficulty === l.id })), (id) => {
      t.setDifficulty(id);
      if (g.state === 'training') g.startTraining('spar');
    });
    row('Gravity', GRAVITY_LEVELS.map((l) => {
      const open = p.data.gravityUnlocked.includes(l.g);
      return { id: l.g, name: `${l.g}x`, selected: t.gravity === l.g, enabled: open, sub: open ? undefined : `PL ${formatNumber(l.powerLevel)}` };
    }), (v) => t.setGravity(v));
    const tc = p.data.timeChamber.unlocked;
    row('Location', [
      { id: 'arena', name: 'Training Grounds', selected: t.location === 'arena' },
      { id: 'timechamber', name: 'Time Chamber', selected: t.location === 'timechamber', enabled: tc, sub: tc ? `Day ${t.chamberDays()} · 3x XP` : `PL ${formatNumber(TIME_CHAMBER_UNLOCK.powerLevel)}` },
    ], (id) => g.fadeTo(() => t.setLocation(id)));
    const lv = GRAVITY_LEVELS.find((l) => l.g === t.gravity);
    if (lv?.recommended && p.basePowerLevel() < lv.recommended) {
      ui.text(`Warning: ${lv.g}x gravity strains you below Power Level ${formatNumber(lv.recommended)}.`, a.x, y + 30, { size: 24, color: COLORS.red, weight: 'normal' });
    }
  }

  drawBoss(ui, a) {
    const g = this.game;
    let y = a.y;
    const pl = g.currentPowerLevel();
    const top = g.progress.powerLevel(g.progress.topForm());
    ui.text('Challenge any boss at any Power Level. Damage scales with the gap.', a.x, y + 24, { size: 24, color: COLORS.muted, weight: 'normal' });
    y += 40;
    for (const b of BOSSES) {
      const beaten = g.progress.beat(b.id);
      const attempts = g.progress.data.bossAttempts[b.id] || 0;
      ui.text(`${b.name}`, a.x, y + 40, { size: 38, color: '#ff8a8a' });
      ui.text(b.title, a.x, y + 74, { size: 24, color: COLORS.muted, weight: 'normal' });
      ui.text(`PL ${formatNumber(b.powerLevel)}`, a.x + 520, y + 40, { size: 32, color: COLORS.text });
      const ratio = Math.max(pl, top) / b.powerLevel;
      const verdict = ratio > 3 ? 'You overwhelm them' : ratio > 1 ? 'You are stronger' : ratio > 0.25 ? 'Tough fight' : ratio > 0.02 ? 'Very dangerous' : 'Nearly impossible';
      ui.text(`${verdict}${beaten ? '  ·  DEFEATED ★' : ''}${attempts ? `  ·  ${attempts} tr${attempts > 1 ? 'ies' : 'y'}` : ''}`, a.x + 520, y + 74, { size: 24, color: ratio > 1 ? COLORS.green : ratio > 0.25 ? COLORS.orange : COLORS.red, weight: 'normal', maxWidth: a.w - 840 });
      ui.button(`fight-${b.id}`, beaten ? 'Rematch' : 'Challenge!', a.x + a.w - 280, y + 12, 280, 76, { size: 34, color: '#a8241a', onClick: () => g.startBoss(b.id) });
      y += 104;
    }
  }

  drawAttacks(ui, a) {
    const g = this.game;
    const p = g.progress;
    ui.text('EQUIPPED (4 slots)', a.x, a.y + 30, { size: 30, color: COLORS.muted });
    p.data.equipped.forEach((id, i) => {
      const atk = id ? ATTACKS[id] : null;
      ui.button(`slot-${i}`, atk ? atk.name : 'Empty slot', a.x + i * ((a.w + 12) / 4), a.y + 50, (a.w + 12) / 4 - 12, 80, {
        size: 28, selected: atk && g.player.equippedAttack().id === atk.id, enabled: !!atk,
        onClick: () => { this.slot = i; if (id) { const eq = p.data.equipped.filter(Boolean); g.player.selectedAttack = eq.indexOf(id); } },
      });
    });
    if (this.slot == null) this.slot = 0;
    ui.text(`Tap an attack below to put it in slot ${this.slot + 1}`, a.x + a.w, a.y + 30, { size: 24, color: COLORS.muted, align: 'right', weight: 'normal' });
    let y = a.y + 170;
    ui.text('Attack', a.x, y, { size: 26, color: COLORS.muted });
    ui.text('Dmg', a.x + 520, y, { size: 26, color: COLORS.muted });
    ui.text('Ki', a.x + 620, y, { size: 26, color: COLORS.muted });
    ui.text('Charge', a.x + 700, y, { size: 26, color: COLORS.muted });
    ui.text('Cooldown', a.x + 830, y, { size: 26, color: COLORS.muted });
    ui.text('Unlock', a.x + 990, y, { size: 26, color: COLORS.muted });
    y += 12;
    for (const id of ATTACK_ORDER) {
      const atk = ATTACKS[id];
      const has = p.data.unlockedAttacks.includes(id);
      const col = has ? COLORS.text : '#7b84a8';
      y += 44;
      if (has) {
        ui.button(`equip-${id}`, '', a.x - 10, y - 34, 510, 44, {
          size: 1, color: p.data.equipped.includes(id) ? '#2a4a8a' : undefined,
          onClick: () => {
            const eq = p.data.equipped;
            const other = eq.indexOf(id);
            if (other >= 0) eq[other] = eq[this.slot];
            eq[this.slot] = id;
            // Keep filled slots first so cycling skips the gaps.
            g.player.selectedAttack = Math.max(0, eq.filter(Boolean).indexOf(id));
          },
        });
      }
      ui.text(`${has ? '★' : '◇'} ${atk.name}`, a.x, y, { size: 28, color: col, maxWidth: 500 });
      ui.text(String(atk.damage), a.x + 520, y, { size: 26, color: col, weight: 'normal' });
      ui.text(String(atk.kiCost), a.x + 620, y, { size: 26, color: col, weight: 'normal' });
      ui.text(`${atk.chargeTime}s`, a.x + 700, y, { size: 26, color: col, weight: 'normal' });
      ui.text(`${atk.cooldown}s`, a.x + 830, y, { size: 26, color: col, weight: 'normal' });
      ui.text(has ? 'Unlocked' : atk.unlock.label, a.x + 990, y, { size: 22, color: col, weight: 'normal', maxWidth: a.w - 990 });
    }
  }

  drawSettings(ui, a) {
    const g = this.game;
    const s = g.settings;
    let y = a.y;
    const row = (label, options, current, onPick, x = a.x, w = a.w) => {
      ui.text(label, x, y + 52, { size: 30, color: COLORS.muted });
      const bx = x + 330;
      const bw = (w - 330 - (options.length - 1) * 10) / options.length;
      options.forEach(([val, name], i) => ui.button(`${label}-${val}`, name, bx + i * (bw + 10), y + 8, bw, 64, {
        size: 28, selected: current === val, onClick: () => { onPick(val); g.applySettings(); },
      }));
      y += 82;
    };
    const half = (a.w - 40) / 2;
    const left = a.x;
    const right = a.x + half + 40;
    const y0 = y;
    ui.text('GRAPHICS', left, y + 20, { size: 28, color: COLORS.gold });
    y += 30;
    row('Preset', Object.entries(GRAPHICS_PRESETS).map(([k, v]) => [k, v.label]), s.graphics, (v) => { s.graphics = v; }, left, half);
    row('Auto quality', [[true, 'On'], [false, 'Off']], s.autoQuality, (v) => { s.autoQuality = v; }, left, half);
    row('Effects', [['low', 'Low'], ['medium', 'Med'], ['high', 'High']], s.visualIntensity, (v) => { s.visualIntensity = v; }, left, half);
    row('Haptics', [[true, 'On'], [false, 'Off']], s.haptics, (v) => { s.haptics = v; }, left, half);
    row('Volume', [[0, 'Off'], [0.4, '40%'], [0.8, '80%'], [1, 'Max']], s.masterVolume, (v) => { s.masterVolume = v; }, left, half);
    row('Blood & scars', [[true, 'On'], [false, 'Off']], s.battleDamage !== false, (v) => { s.battleDamage = v; }, left, half);
    ui.text(`FPS ${Math.round(g.perf.fps)}${g.perf.reduced ? ' · auto-reduced' : ''}`, left, y + 40, { size: 24, color: COLORS.muted, weight: 'normal' });
    y = y0;
    ui.text('VR COMFORT', right, y + 20, { size: 28, color: COLORS.gold });
    y += 30;
    row('Turning', [['snap', 'Snap'], ['smooth', 'Smooth']], s.turnMode, (v) => { s.turnMode = v; }, right, half);
    row('Snap angle', [[30, '30°'], [45, '45°'], [90, '90°']], s.snapAngle, (v) => { s.snapAngle = v; }, right, half);
    row('Movement', [['smooth', 'Smooth'], ['teleport', 'Teleport']], s.moveMode, (v) => { s.moveMode = v; }, right, half);
    row('Vignette', [[true, 'On'], [false, 'Off']], s.vignette, (v) => { s.vignette = v; }, right, half);
    row('Play mode', [[false, 'Standing'], [true, 'Seated']], s.seated, (v) => { s.seated = v; }, right, half);
  }
}

// ---------------------------------------------------------------------------
export class ResultScreen {
  constructor(game) {
    this.game = game;
    this.panel = new Panel({ width: 1.3, height: 0.8, name: 'result', depthTest: false });
    this.data = null;
    this.panel.setDraw((ui) => this.draw(ui));
  }

  set(data) { this.data = data; this.panel.dirty = true; }

  draw(ui) {
    const g = this.game;
    const d = this.data;
    if (!d) return;
    ui.background(COLORS.bg, d.win ? COLORS.gold : COLORS.red);
    ui.text(d.win ? 'VICTORY!' : 'DEFEATED…', ui.W / 2, 130, { size: 110, align: 'center', color: d.win ? COLORS.gold : COLORS.red, stroke: '#000' });
    let y = 200;
    for (const line of d.lines) {
      y = ui.wrap(line, 80, y + 20, ui.W - 160, { size: 32, color: COLORS.text });
    }
    ui.button('res-train', 'Back to Training', 60, ui.H - 150, 520, 100, { size: 38, color: '#b4560f', onClick: () => g.startTraining(d.win ? 'transform' : STAT_ACTIVITY[g.progress.lowestStat()]) });
    ui.button('res-again', d.win ? 'Rematch' : 'Try Again', ui.W - 580, ui.H - 150, 520, 100, { size: 38, onClick: () => g.startBoss(g.currentBossId) });
  }
}
