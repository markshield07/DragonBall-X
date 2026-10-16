import * as THREE from 'three';
import { bus } from '../core/events.js';
import { rand } from '../core/math.js';
import { Horde, ZuiFighter } from '../training/Horde.js';
import { createAvatar } from '../character/createAvatar.js';
import { BattleDamage } from '../fx/BattleDamage.js';
import { CHARACTER_TEMPLATES, defaultCharacter } from '../character/options.js';

const ALIEN_SKIN = [0x5fae5a, 0x7a5ad0, 0xc05a4a, 0x3a9ab0, 0x8a8f9a];
const _w = new THREE.Vector3();

// A Galactic Dominion soldier: the same fighter AI as the Zui warriors
// (punches, blocks, dodges, ki), in purple-and-black Dominion armor with a
// red scouter and alien skin. Weaker than you, and they come in a limited
// wave out of Raxor's ship instead of forever.
class StorySoldier extends ZuiFighter {
  constructor(game, wave, idx) {
    super(game, wave, idx);
    this.arenaRadius = 30;
  }

  buildAvatar() {
    const pool = CHARACTER_TEMPLATES.filter((t) => t.id !== this.game.character.templateId);
    const t = pool[this.idx % pool.length];
    const ch = { ...defaultCharacter(), ...t.appearance, templateId: t.id, armorColor: 8, suitColor: 1, gloveColor: 1, bootColor: 1, beltColor: 0, scouter: 'red' };
    this.avatar = createAvatar(ch);
    this.group.add(this.avatar.root);
    this.avatar.setForm('base');
    this.wounds = new BattleDamage(this.avatar.root, this.game, { forward: () => this.group.getWorldDirection(_w), scale: 0.8 });
    this.aura.setStyle({ color: 0xb05aff, core: 0xffffff, scale: 0.7 });
    this.aura.target = 0;
  }

  roll() {
    const r = rand(this.horde.minRatio, this.horde.maxRatio);
    this.ratio = r;
    this.elite = false;
    const you = this.game.progress.powerLevel(this.game.player.form);
    this.pl = Math.max(50, Math.round((you * r) / 10) * 10);
    this.level = {
      id: 'soldier', name: 'Dominion Soldier', hp: Math.round(70 + 200 * r), damage: 2 + 6 * r,
      windup: 1.1 - 0.4 * r, cooldown: 2.6 - 1.2 * r, block: 0.08 + 0.2 * r, dodge: 0.05 + 0.15 * r, blast: 0.25, xp: 0.5 + r, form: 'base',
    };
    const a = this.avatar;
    const skin = ALIEN_SKIN[Math.floor(Math.random() * ALIEN_SKIN.length)];
    const tint = () => (a.mats?.Skin || a.mats?.skin)?.color.setHex(skin);
    if (a.ready === false) a.promise?.then(tint); else tint();
    this.barShown = -1;
  }

  // March out of the ship's ramp.
  reset() {
    super.reset();
    const p = this.horde.spawnAt?.();
    if (p) this.group.position.set(p.x + rand(-1.5, 1.5), this.player.groundY(), p.z + rand(-1.5, 1.5));
  }

  updateLife(dt) {
    if (!this.group.visible) {
      this.respawnT -= dt;
      if (this.respawnT <= 0 && this.horde.active && this.horde.canSpawn()) {
        this.horde.spawned += 1;
        if (!this.avatar) this.buildAvatar();
        this.roll();
        this.setActive(true);
      }
      return;
    }
    if (this.state === 'down') {
      this.deadT += dt;
      if (this.deadT > 4.2) { this.setActive(false); this.group.visible = false; this.respawnT = rand(0.6, 1.6); }
    }
  }
}

// A limited wave of soldiers: `total` in all, at most `max` at once, two
// attacking at a time (the Horde's crowd rules). Each knockout emits
// 'story:ko'.
export class StoryWave extends Horde {
  constructor(game) {
    super(game);
    this.total = 0;
    this.spawned = 0;
    this.minRatio = 0.15;
    this.maxRatio = 0.32;
    this.spawnAt = null;
    this.soldiers = [];
  }

  canSpawn() { return this.spawned < this.total; }

  // total: soldiers still to beat. spawnAt(): where they come from.
  begin({ total, max = 3, spawnAt = null }) {
    this.end();
    this.total = total;
    this.spawned = 0;
    this.spawnAt = spawnAt;
    while (this.soldiers.length < max) this.soldiers.push(new StorySoldier(this.game, this, this.soldiers.length));
    this.fighters = this.soldiers.slice(0, max);
    this.active = true;
    this.fighters.forEach((f, i) => { f.respawnT = 0.4 + i * 1.1; f.group.visible = false; });
  }

  end() {
    this.active = false;
    for (const f of this.soldiers) { f.setActive(false); f.group.visible = false; f.fistGlow.material.opacity = 0; }
  }

  onDefeat() {
    this.kos += 1;
    bus.emit('story:ko', {});
  }
}
