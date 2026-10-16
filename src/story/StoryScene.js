import * as THREE from 'three';
import { createAvatar } from '../character/createAvatar.js';
import { defaultCharacter, CHARACTER_TEMPLATES } from '../character/options.js';
import { toon, glowMaterial, addOutline } from '../render/toon.js';
import { terrainHeight } from '../world/terrain.js';
import { rand } from '../core/math.js';
import { bus } from '../core/events.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _X = new THREE.Vector3(1, 0, 0);

// Where things stand on the training grounds (x, z). The player starts on
// the stone platform at the origin facing -Z; the mirror house is on the
// left (x < -3), training posts on the right, the gate at z = -40.
export const SPOTS = {
  orin: [2.3, -2.2],
  orinDown: [3.4, -5.6],
  ship: [18, -14],
  raxorDown: [1.5, -7],
  gate: [0, -40],
  trainee0: [-8, 9],
  trainee1: [6.5, 9.5],
};
const SHIP_FACE = Math.atan2(-SPOTS.ship[0], -SPOTS.ship[1]); // ramp points at the platform
const RAMP_DIR = new THREE.Vector3(Math.sin(SHIP_FACE), 0, Math.cos(SHIP_FACE));
const rampFoot = () => new THREE.Vector3(SPOTS.ship[0], 0, SPOTS.ship[1]).addScaledVector(RAMP_DIR, 6.2);
const ground = (x, z) => terrainHeight(x, z);

// Master Orin: an old martial artist in a white and navy gi with white hair
// and an old scar. Built on one of the six modeled characters (never the
// one you're playing).
function orinLook(playerTemplate) {
  const model = playerTemplate === 'kaizen' ? 'toren' : 'kaizen';
  const t = CHARACTER_TEMPLATES.find((x) => x.id === model);
  return { ...defaultCharacter(), ...t.appearance, templateId: model, name: 'Orin', hairColor: 3, skin: 4, eyeColor: 0, brows: 'heavy', expression: 'focused', scar: 'eye', armorColor: 3, suitColor: 7, gloveColor: 7, bootColor: 7, beltColor: 7 };
}
// Two young trainees from Orin's school (plain training clothes).
function traineeLook(i, playerTemplate) {
  const pool = ['zeron', 'zyra', 'kaizen', 'toren'].filter((id) => id !== playerTemplate);
  const model = pool[i % pool.length];
  const t = CHARACTER_TEMPLATES.find((x) => x.id === model);
  const looks = [
    { hairColor: 1, skin: 3, armorColor: 6, suitColor: 3, gloveColor: 3, bootColor: 7, beltColor: 3, scouter: 'none' },
    { hairColor: 4, skin: 1, armorColor: 9, suitColor: 3, gloveColor: 9, bootColor: 1, beltColor: 3, scouter: 'none' },
  ];
  return { ...defaultCharacter(), ...t.appearance, templateId: model, name: i ? 'Lira' : 'Tamo', ...looks[i % 2] };
}

// A story character standing in the world (Orin, the trainees): faces you,
// nods while talking, can be knocked down, cower or run off.
class Actor {
  constructor(scene, character) {
    this.root = new THREE.Group();
    this.character = character;
    this.avatar = createAvatar(character);
    this.root.add(this.avatar.root);
    scene.add(this.root);
    this.mode = 'stand';
    this.talking = false;
    this.t = rand(0, 5);
    this.fall = 0;
    this.runDir = new THREE.Vector3();
  }

  place(x, z, mode = 'stand') {
    // Knocked over while you watch: fall; already lying there: just lie.
    const watching = this.root.visible && this.mode !== 'down';
    this.root.position.set(x, ground(x, z), z);
    this.mode = mode;
    this.fall = mode === 'down' && !watching ? 1 : mode === 'down' ? this.fall : 0;
    this.root.visible = true;
    this.fade = 1;
  }

  update(dt, playerPos) {
    if (!this.root.visible) return;
    this.t += dt;
    const a = this.avatar;
    const r = this.root;
    if (this.mode === 'stand' || this.mode === 'cower') {
      const want = Math.atan2(playerPos.x - r.position.x, playerPos.z - r.position.z);
      let d = want - r.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      r.rotation.y += d * Math.min(1, dt * 3);
    }
    if (this.mode === 'run') {
      r.position.addScaledVector(this.runDir, dt * 4.2);
      r.position.y = ground(r.position.x, r.position.z);
      r.rotation.y = Math.atan2(this.runDir.x, this.runDir.z);
      this.fade -= dt * 0.45;
      if (this.fade <= 0) { r.visible = false; this.mode = 'gone'; }
    }
    // Falling over (knocked down) or lying there.
    const wantFall = this.mode === 'down' ? 1 : 0;
    this.fall += Math.sign(wantFall - this.fall) * Math.min(Math.abs(wantFall - this.fall), dt * (wantFall ? 3.5 : 1.2));
    a.root.rotation.x = -Math.PI / 2 * easeOut(this.fall);
    a.root.position.y = 0.12 * this.fall;
    if (a.ready === false) return;
    const pose = (l, r, nod = 0, slump = 1) => {
      a.clearPowerUp?.();
      if (slump < 1 || this.mode === 'stand') a.stance?.(slump, this.t);
      if (a.arms?.left?.target) {
        a.arms.left.target.copy(l);
        a.arms.right.target.copy(r);
        a.head.quaternion.setFromAxisAngle(_X, nod);
        a.poseArms?.();
      } else a.setPose?.(l, r, _q.setFromAxisAngle(_X, nod));
    };
    if (this.mode === 'down') pose(_v.set(0.42, 1.05, 0.1), _w.set(-0.4, 1.15, -0.05), 0.3, 1);
    else if (this.mode === 'cower') pose(_v.set(0.12, 1.55, 0.3), _w.set(-0.12, 1.6, 0.28), 0.35, 0.25);
    else if (this.mode === 'run') {
      pose(_v.set(0.25, 1.05, 0.15 + Math.sin(this.t * 12) * 0.15), _w.set(-0.25, 1.05, 0.15 - Math.sin(this.t * 12) * 0.15));
      a.stride?.(dt, 4.2, false);
    } else {
      // Standing calm, hands loosely clasped behind the back; nods while talking.
      const nod = this.talking ? Math.sin(this.t * 9) * 0.07 : Math.sin(this.t * 0.7) * 0.02;
      const breathe = Math.sin(this.t * 2) * 0.008;
      pose(_v.set(0.2, 0.98 + breathe, -0.1), _w.set(-0.2, 0.98 + breathe, -0.1), nod, 1);
      a.stride?.(dt, 0, false);
    }
  }

  dispose(scene) {
    scene.remove(this.root);
    this.avatar.dispose?.();
  }
}
const easeOut = (t) => 1 - (1 - t) * (1 - t);

// The Dominion ship Raxor arrives in: a dark saucer with a purple glass
// dome, red running lights, three landing legs and a ramp.
function buildShip() {
  const g = new THREE.Group();
  g.name = 'raxorShip';
  const hullMat = toon(0x3a3348);
  const trim = toon(0x9e1f2a);
  const dark = toon(0x1a1622);
  const prof = [[0.2, -1.2], [3.2, -0.9], [5.2, -0.2], [5.4, 0.1], [4.6, 0.6], [3.0, 0.9], [2.2, 1.1]].map(([x, y]) => new THREE.Vector2(x, y));
  const hull = new THREE.Mesh(new THREE.LatheGeometry(prof, 36), hullMat);
  hull.position.y = 2.2;
  hull.castShadow = true;
  addOutline(hull, 0.05);
  const band = new THREE.Mesh(new THREE.TorusGeometry(5.3, 0.16, 6, 48), trim);
  band.rotation.x = Math.PI / 2;
  band.position.y = 2.25;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(2.3, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x7a3ab4, emissive: 0x2a0a4a, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.85 }));
  dome.position.y = 3.25;
  dome.scale.y = 0.7;
  g.add(hull, band, dome);
  // Running lights around the rim (one material so they blink together).
  const lightMat = glowMaterial(0xff3a2a, 0.95);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), lightMat);
    l.position.set(Math.cos(a) * 5.45, 2.3, Math.sin(a) * 5.45);
    g.add(l);
  }
  // Glowing engine ring underneath.
  const engineMat = glowMaterial(0xc05aff, 0.8);
  const engine = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.25, 8, 32), engineMat);
  engine.rotation.x = Math.PI / 2;
  engine.position.y = 1.0;
  g.add(engine);
  // Landing legs.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 2.4, 6), dark);
    leg.position.set(Math.cos(a) * 3.4, 1.0, Math.sin(a) * 3.4);
    leg.rotation.z = Math.cos(a) * 0.35;
    leg.rotation.x = -Math.sin(a) * 0.35;
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.18, 10), dark);
    foot.position.set(Math.cos(a) * 3.85, 0.09, Math.sin(a) * 3.85);
    g.add(leg, foot);
  }
  // Ramp (hinged at the hull, opens down to the ground).
  const rampPivot = new THREE.Group();
  rampPivot.position.set(0, 1.55, 3.6);
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.14, 3.2), hullMat);
  ramp.position.z = 1.6;
  addOutline(ramp, 0.04);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.02, 2.9), glowMaterial(0xff5a3a, 0.6));
  strip.position.set(0, 0.08, 1.6);
  rampPivot.add(ramp, strip);
  g.add(rampPivot);
  // Doorway glow above the ramp.
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.4), glowMaterial(0xff8a5a, 0.7));
  door.position.set(0, 2.25, 3.62);
  g.add(door);
  g.userData = { lightMat, engineMat, rampPivot, door };
  return g;
}

// The First Seal: a floating crystal shard with a golden glow.
function buildFragment() {
  const g = new THREE.Group();
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), new THREE.MeshStandardMaterial({ color: 0xffe080, emissive: 0xffb020, emissiveIntensity: 1.4, roughness: 0.2, flatShading: true }));
  crystal.scale.set(0.8, 1.6, 0.8);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10), glowMaterial(0xffd36a, 0.35));
  g.add(crystal, glow);
  g.userData = { crystal, glow };
  return g;
}

// The galaxy map the crystal projects: a disc of stars with the five seal
// locations marked.
function buildGalaxyMap() {
  const g = new THREE.Group();
  const N = 700;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const arm = i % 3;
    const r = Math.pow(Math.random(), 0.7) * 9;
    const a = r * 0.55 + (arm / 3) * Math.PI * 2 + rand(-0.35, 0.35);
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = rand(-0.25, 0.25) * (1 - r / 10);
    pos[i * 3 + 2] = Math.sin(a) * r;
    c.setHSL(0.58 + Math.random() * 0.15, 0.7, 0.6 + Math.random() * 0.3);
    col.set([c.r, c.g, c.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const stars = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.12, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
  g.add(stars);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 10), glowMaterial(0xfff0c0, 0.7));
  g.add(core);
  const sealMat = glowMaterial(0xffcc33, 0.95);
  for (const [x, z] of [[6, 2], [-4, 6], [-7, -3], [2, -7], [7.5, -5]]) {
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), sealMat);
    s.position.set(x, 0.3, z);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.55, 24), glowMaterial(0xffcc33, 0.7));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.3, z);
    g.add(s, ring);
  }
  g.userData = { stars };
  return g;
}

// Lord Veyron's hologram: a flickering purple projection over a small
// projector disc.
function buildHologram() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xc07aff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false });
  const add = (geo, x, y, z, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); g.add(m); return m; };
  add(new THREE.CapsuleGeometry(0.2, 0.32, 4, 10), 0, 1.32, 0, 1.4, 1, 0.8); // chest
  add(new THREE.SphereGeometry(0.14, 12, 10), 0, 1.78, 0, 0.95, 1.1, 1); // head
  add(new THREE.ConeGeometry(0.06, 0.3, 4), 0, 1.92, -0.06).rotation.x = -0.9; // crest
  for (const s of [-1, 1]) {
    add(new THREE.SphereGeometry(0.15, 10, 8), 0.34 * s, 1.5, 0, 1.5, 0.7, 1.3); // shoulder pads
    add(new THREE.CapsuleGeometry(0.07, 0.55, 4, 8), 0.36 * s, 1.15, 0.05);
    add(new THREE.CapsuleGeometry(0.085, 0.75, 4, 8), 0.13 * s, 0.5, 0);
  }
  const cape = add(new THREE.PlaneGeometry(0.75, 1.3), 0, 0.95, -0.22);
  cape.material = mat;
  const proj = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.1, 18), toon(0x2a2a34));
  proj.position.y = 0.05;
  g.add(proj);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.35, 2.1, 18, 1, true), new THREE.MeshBasicMaterial({ color: 0xc07aff, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.y = 1.1;
  g.add(beam);
  g.userData = { mat };
  return g;
}

// Objective marker: a tall pillar of light you can see from anywhere,
// a pulsing ring on the ground and a bobbing arrow.
function buildBeacon() {
  const g = new THREE.Group();
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 40, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  pillar.position.y = 20;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 32), new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.6, 4), new THREE.MeshBasicMaterial({ color: 0xffd36a }));
  arrow.rotation.x = Math.PI;
  g.add(pillar, ring, arrow);
  g.userData = { ring, arrow, pillar };
  g.visible = false;
  return g;
}

// Everything the story adds to the training grounds. `state` is the saved
// scene description (story.scene); apply() makes the world match it.
export class StoryScene {
  constructor(game) {
    this.game = game;
    this.scene = game.renderer.scene;
    this.group = new THREE.Group();
    this.group.name = 'story';
    this.scene.add(this.group);
    this.actors = {};
    this.ship = buildShip();
    this.ship.visible = false;
    this.group.add(this.ship);
    this.fragment = buildFragment();
    this.fragment.visible = false;
    this.group.add(this.fragment);
    this.map = buildGalaxyMap();
    this.map.visible = false;
    this.group.add(this.map);
    this.hologram = buildHologram();
    this.hologram.visible = false;
    this.group.add(this.hologram);
    this.pod = new THREE.Mesh(new THREE.SphereGeometry(0.7, 14, 10), toon(0x3a3348));
    this.pod.add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), glowMaterial(0xff3a2a, 0.5)));
    this.pod.visible = false;
    this.group.add(this.pod);
    this.beacon = buildBeacon();
    this.scene.add(this.beacon);
    this.beaconTarget = null;
    // Dark dome for "meanwhile" cutaways (story panels draw on top of it).
    this.dimMat = new THREE.MeshBasicMaterial({ color: 0x05030c, transparent: true, opacity: 0, depthTest: false, depthWrite: false, side: THREE.BackSide });
    this.dim = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), this.dimMat);
    this.dim.renderOrder = 99;
    this.dim.frustumCulled = false;
    this.dim.visible = false;
    game.renderer.camera.add(this.dim);
    this.dimTarget = 0;
    this.state = {};
    this.shipAnim = null; // { kind: 'descend' | 'lift', t, dur }
    this.podAnim = null;
    this.mood = 0;
    this.moodTarget = 0;
    this.time = 0;
    this.visible = false;
    this.playerTemplate = null;
  }

  get boss() { return this.game.boss; }

  // Build (or rebuild) the NPCs for the warrior being played, so nobody is a
  // copy of you.
  ensureActors() {
    const tpl = this.game.character.templateId;
    if (this.playerTemplate === tpl && this.actors.orin) return;
    for (const a of Object.values(this.actors)) a.dispose(this.group);
    this.actors = {};
    this.playerTemplate = tpl;
    this.actors.orin = new Actor(this.group, orinLook(tpl));
    this.actors.trainee0 = new Actor(this.group, traineeLook(0, tpl));
    this.actors.trainee1 = new Actor(this.group, traineeLook(1, tpl));
    for (const a of Object.values(this.actors)) a.root.visible = false;
  }

  // Make the training grounds match the saved scene state.
  apply(state) {
    this.state = { ...state };
    this.ensureActors();
    const s = this.state;
    const { orin, trainee0, trainee1 } = this.actors;
    if (s.orin === 'platform') orin.place(...SPOTS.orin, 'stand');
    else if (s.orin === 'down') orin.place(...SPOTS.orinDown, 'down');
    else orin.root.visible = false;
    for (const [i, t] of [trainee0, trainee1].entries()) {
      if (s.trainees === 'scared' && !(s.rescued || []).includes(`trainee${i}`)) t.place(...SPOTS[`trainee${i}`], 'cower');
      else t.root.visible = false;
    }
    this.ship.visible = s.ship === 'landed';
    if (this.ship.visible) this.placeShip(0);
    this.ship.userData.rampPivot.rotation.x = 0.42;
    this.fragment.visible = s.fragment === 'ship' || s.fragment === 'map';
    this.map.visible = s.fragment === 'map';
    if (this.fragment.visible) {
      // It rolled out of the hold and lies glowing at the foot of the ramp.
      const p = rampFoot().addScaledVector(RAMP_DIR, 0.4);
      this.fragment.position.copy(p).setY(ground(p.x, p.z) + 1.0);
    }
    this.hologram.visible = !!s.hologram;
    this.moodTarget = s.sky === 'red' ? 0.85 : 0;
    this.setPortal(s.portal === 'on');
    this.applyRaxor();
  }

  set(changes) { this.apply({ ...this.state, ...changes }); }

  placeShip(height) {
    const [x, z] = SPOTS.ship;
    this.ship.position.set(x, ground(x, z) + height, z);
    this.ship.rotation.y = SHIP_FACE;
  }

  setPortal(on) {
    const m = this.game.arena.portalMat;
    if (!m) return;
    m.color.setHex(on ? 0xffd36a : 0xff5a2a);
  }

  // Raxor between fights: the real boss model, posed but not fighting.
  applyRaxor() {
    const b = this.boss;
    const s = this.state.raxor;
    if (b.active) return; // a real fight owns the boss
    if (!s || s === 'none' || !this.visible) {
      if (this.puppet) { b.group.visible = false; this.puppet = false; }
      return;
    }
    if (b.def.id !== 'raxor') b.setBoss('raxor');
    this.puppet = true;
    b.group.visible = true;
    b.aura.target = 0;
    b.bar.visible = false;
    b.group.scale.setScalar(1);
    b.body.scale.setScalar(b.def.scale);
    b.body.position.set(0, 0, 0);
    if (s === 'down') {
      const [x, z] = SPOTS.raxorDown;
      b.group.position.set(x, ground(x, z), z);
      b.body.rotation.set(-Math.PI / 2, 0, 0);
      b.body.position.y = 0.2;
    } else {
      const p = rampFoot();
      b.group.position.set(p.x, ground(p.x, p.z), p.z);
      b.body.rotation.set(0, 0, 0);
    }
  }

  // Story hidden (paused, away from the grounds, in a boss fight): hide it all.
  setVisible(v) {
    if (v === this.visible) return;
    this.visible = v;
    this.group.visible = v;
    if (!v) {
      this.beacon.visible = false;
      if (this.puppet && !this.boss.active) this.boss.group.visible = false;
      this.puppet = false;
      this.setPortal(false);
      this.mood = 0;
      this.game.arena.mood = 0;
    } else this.apply(this.state);
  }

  // Objective marker over a spot, an actor, or nothing.
  setBeacon(target) { this.beaconTarget = target; }

  point(name) {
    if (name === 'shipRamp') return rampFoot();
    if (name === 'fragment') return this.fragment.position.clone().setY(ground(this.fragment.position.x, this.fragment.position.z));
    if (this.actors[name]) return this.actors[name].root.position.clone();
    const s = SPOTS[name];
    return s ? new THREE.Vector3(s[0], ground(s[0], s[1]), s[1]) : null;
  }

  setTalking(id) {
    for (const [k, a] of Object.entries(this.actors)) a.talking = k === id;
  }

  // ---- Scripted moments ---------------------------------------------------------
  shipDescend(fast = false) {
    this.ship.visible = true;
    this.ship.userData.rampPivot.rotation.x = -0.1;
    this.shipAnim = { kind: 'descend', t: 0, dur: fast ? 3.5 : 7 };
    this.placeShip(140);
    this.game.audio.bossRoar();
    return this.shipAnim.dur + 0.6;
  }

  shipLift() {
    this.shipAnim = { kind: 'lift', t: 0, dur: 4 };
    this.ship.userData.rampPivot.rotation.x = -0.1;
    this.game.audio.whoosh?.();
    return 2.5;
  }

  podEscape(from) {
    this.pod.visible = true;
    this.pod.position.copy(from).setY(from.y + 0.8);
    this.podAnim = { t: 0, from: this.pod.position.clone() };
    this.game.audio.whoosh?.();
  }

  // ---- Frame update -------------------------------------------------------------------
  update(dt) {
    this.time += dt;
    const g = this.game;
    // Cutaway dimming fades in and out smoothly.
    const op = this.dimMat.opacity + Math.sign(this.dimTarget - this.dimMat.opacity) * Math.min(Math.abs(this.dimTarget - this.dimMat.opacity), dt * 1.5);
    this.dimMat.opacity = op;
    this.dim.visible = op > 0.01;
    if (!this.visible) return;
    // Red sky blends in and out (Arena.mood).
    this.mood += (this.moodTarget - this.mood) * Math.min(1, dt * 0.8);
    g.arena.mood = this.mood;
    const head = g.player.headWorld;
    for (const a of Object.values(this.actors)) a.update(dt, head);
    // Ship: blinking lights, glowing engine, landing / take-off.
    const sd = this.ship.userData;
    if (this.ship.visible) {
      sd.lightMat.opacity = 0.5 + 0.5 * (Math.sin(this.time * 5) > 0 ? 1 : 0);
      sd.engineMat.opacity = 0.55 + Math.sin(this.time * 3) * 0.25;
    }
    const an = this.shipAnim;
    if (an) {
      an.t += dt;
      const k = Math.min(1, an.t / an.dur);
      if (an.kind === 'descend') {
        const h = 140 * Math.pow(1 - k, 2.2);
        this.placeShip(h);
        this.ship.rotation.y = SHIP_FACE + (1 - k) * 3;
        if (k >= 1) {
          this.shipAnim = null;
          const p = this.ship.position.clone();
          g.effects.ring(p.clone().setY(p.y + 0.1), 0xc8b089, { maxRadius: 14, duration: 1.2, opacity: 0.6 });
          g.effects.dust(p, 2.5, 10);
          g.audio.explosion(0.5);
          bus.emit('fx:shake', { position: p, amount: 0.25 });
          sd.rampPivot.rotation.x = 0.42;
        }
      } else if (an.kind === 'lift') {
        this.placeShip(Math.pow(k, 2.4) * 160);
        this.ship.rotation.y = SHIP_FACE + k * 4;
        if (k >= 1) { this.shipAnim = null; this.ship.visible = false; }
      }
    }
    if (this.podAnim) {
      const pa = this.podAnim;
      pa.t += dt;
      this.pod.position.copy(pa.from).add(_v.set(pa.t * pa.t * 4, pa.t * pa.t * 9, -pa.t * pa.t * 6));
      if (pa.t > 3) { this.podAnim = null; this.pod.visible = false; }
    }
    // Floating crystal and the projected map.
    if (this.fragment.visible) {
      this.fragment.userData.crystal.rotation.y += dt * 1.5;
      this.fragment.userData.glow.scale.setScalar(1 + Math.sin(this.time * 4) * 0.12);
    }
    if (this.map.visible) {
      this.map.position.copy(this.fragment.position).setY(this.fragment.position.y + 6);
      this.map.rotation.y += dt * 0.05;
    }
    if (this.hologram.visible) {
      const [x, z] = SPOTS.raxorDown;
      this.hologram.position.set(x + 2, ground(x + 2, z), z + 0.5);
      this.hologram.rotation.y = Math.atan2(head.x - this.hologram.position.x, head.z - this.hologram.position.z);
      this.hologram.userData.mat.opacity = 0.32 + Math.random() * 0.12 + (Math.random() < 0.04 ? -0.25 : 0);
    }
    this.applyRaxor();
    if (this.puppet && this.state.raxor !== 'down') {
      // Raxor stands with his arms crossed-ish and breathes.
      const b = this.boss;
      b.group.rotation.y = Math.atan2(head.x - b.group.position.x, head.z - b.group.position.z);
      for (const arm of [b.arms.left, b.arms.right]) { arm.shoulder.rotation.x = -0.25; arm.elbow.rotation.x = -1.4 + Math.sin(this.time * 2) * 0.05; }
    }
    this.updateBeacon();
  }

  updateBeacon() {
    const t = this.beaconTarget;
    let p = null;
    if (t) p = typeof t === 'string' ? this.point(t) : t;
    const b = this.beacon;
    b.visible = !!p;
    if (!p) return;
    b.position.copy(p);
    const k = (this.time * 1.2) % 1;
    b.userData.ring.scale.setScalar(0.7 + k * 0.8);
    b.userData.ring.material.opacity = 0.9 * (1 - k);
    b.userData.arrow.position.y = 2.9 + Math.sin(this.time * 3) * 0.2;
    b.userData.arrow.rotation.y += 0.04;
  }
}
