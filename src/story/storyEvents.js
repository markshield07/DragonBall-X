import * as THREE from 'three';
import { bus } from '../core/events.js';
import { SPOTS } from './StoryScene.js';
import { terrainHeight } from '../world/terrain.js';

const _v = new THREE.Vector3();

// Scripted story moments. Each returns how many seconds the story waits
// before going on (0 = don't wait), or { dur, update(dt, t) } for a moment
// that animates every frame. `m` is the StoryManager. Skipping a scene
// still runs its moments (fast), so the world always ends up right.
// All of them stay gentle in VR: no camera moves, flashes are short.

// Where your hands are: real controllers in VR; on desktop the spots
// just in front of you where your first-person fists rest.
function handSpots(g) {
  if (g.isXR) return [g.hands.hands.left.worldPos.clone(), g.hands.hands.right.worldPos.clone()];
  const head = g.player.headWorld;
  const f = g.player.flatForward(new THREE.Vector3());
  const r = new THREE.Vector3(-f.z, 0, f.x);
  return [-1, 1].map((s) => head.clone().addScaledVector(f, 0.5).addScaledVector(r, 0.2 * s).setY(head.y - 0.3));
}
const feet = (g) => g.player.headWorld.clone().setY(g.player.groundY() + 0.05);

export const STORY_EVENTS = {
  // Your hands flicker with golden light.
  glowHands(m) {
    const g = m.game;
    g.audio.levelUp();
    g.haptic('left', 0.4, 300);
    g.haptic('right', 0.4, 300);
    let next = 0;
    return {
      dur: 1.6,
      update(dt, t) {
        next -= dt;
        if (next > 0 || t > 1.5) return;
        next = 0.12;
        for (const p of handSpots(g)) {
          g.effects.flash(p, 0xffd23a, 0.16, 0.12);
          g.effects.burst(p, 0xffcc33, 5, 0.8, 0.03, 0.4);
        }
      },
    };
  },

  // A huge explosion out past the valley, then its boom arrives.
  distantExplosion(m) {
    const g = m.game;
    const p = new THREE.Vector3(70, terrainHeight(70, -170) + 6, -170);
    g.effects.explosion(p, 0xff7a2a, 9);
    setTimeout(() => {
      g.audio.explosion(1);
      bus.emit('fx:shake', { position: g.player.headWorld.clone(), amount: 0.12 });
      g.haptic('left', 0.5, 250);
      g.haptic('right', 0.5, 250);
    }, 700);
    bus.emit('hud:message', { text: 'A massive explosion echoes across the valley!', color: '#ff9a5a', duration: 3 });
    return 2.2;
  },

  skyRed(m) {
    m.scene.moodTarget = 0.85;
    m.game.audio.warning();
    return 1.6;
  },

  skyClear(m) {
    m.scene.moodTarget = 0;
    return 0.6;
  },

  // Raxor's ship drops out of the clouds and lands.
  shipDescend(m, step) {
    const d = m.scene.shipDescend(step?.fast);
    m.setScene({ ship: 'landed' });
    bus.emit('hud:message', { text: 'A spaceship is coming down!', color: '#ff6a5a', duration: 3 });
    return d;
  },

  // The ramp drops open.
  shipLand(m) {
    const s = m.scene;
    s.ship.userData.rampPivot.rotation.x = -0.1;
    let done = false;
    m.game.audio.whoosh?.();
    return {
      dur: 1.2,
      update(dt, t) {
        s.ship.userData.rampPivot.rotation.x = -0.1 + Math.min(1, t / 1) * 0.52;
        if (t > 1 && !done) { done = true; m.game.effects.dust(s.point('shipRamp'), 1.2, 4); }
      },
    };
  },

  // Raxor flicks a ki blast; Master Orin is thrown down.
  orinDown(m) {
    const g = m.game;
    const from = g.boss.group.position.clone().setY(1.3);
    const orin = m.scene.actors.orin;
    const to = orin.root.position.clone().setY(1.2);
    g.effects.flash(from, 0xff4a6a, 0.5, 0.2);
    g.audio.kiBlast(0.8, true);
    for (let i = 0; i <= 8; i++) g.effects.stream(_v.copy(from).lerp(to, i / 8), 0xff6a8a, { vy: 0, spread: 0.02, size: 0.12, life: 0.25 });
    setTimeout(() => {
      g.effects.explosion(to, 0xff6a3a, 1.2);
      g.audio.punch(1, true);
      m.setScene({ orin: 'down' });
    }, 250);
    return 0.4;
  },

  // Raxor's scouter locks on to you.
  scanner(m) {
    const g = m.game;
    g.audio.warning();
    g.effects.ring(feet(g), 0xff2a2a, { maxRadius: 3, duration: 0.9, opacity: 0.8 });
    setTimeout(() => g.effects.ring(feet(g), 0xff2a2a, { maxRadius: 2, duration: 0.7, opacity: 0.7 }), 350);
    bus.emit('hud:message', { text: 'SCOUTER LOCKED ON!', color: '#ff4a4a', duration: 2 });
    return 0.2;
  },

  // Raxor jumps back in his ship and it takes off.
  raxorFlees(m) {
    m.setScene({ raxor: 'none' });
    const d = m.scene.shipLift();
    m.setScene({ ship: 'none' }, { apply: false });
    return d;
  },

  // Beaten Raxor crawls into an escape pod that rockets away.
  raxorEscapes(m) {
    const [x, z] = SPOTS.raxorDown;
    m.scene.podEscape(new THREE.Vector3(x, terrainHeight(x, z), z));
    m.setScene({ raxor: 'none' });
    return 1;
  },

  hologramOn(m) {
    m.setScene({ hologram: true });
    m.game.audio.ui();
    return 0.8;
  },

  hologramOff(m) {
    m.setScene({ hologram: false });
    m.game.audio.ui();
    return 0.2;
  },

  // Gold flashes off your body during training.
  goldenFlash(m) {
    const g = m.game;
    const f = feet(g);
    g.audio.transform?.('ssj1');
    g.effects.ring(f, 0xffcc33, { maxRadius: 5, duration: 1, opacity: 0.8 });
    g.effects.burst(f.clone().setY(f.y + 1), 0xffd23a, 40, 3.5, 0.07, 0.7);
    for (const p of handSpots(g)) g.effects.flash(p, 0xffd23a, 0.25, 0.2);
    bus.emit('hud:message', { text: 'Golden light bursts out of you!', color: '#ffcc33', duration: 3 });
    g.haptic('left', 0.7, 300);
    g.haptic('right', 0.7, 300);
    return 1.4;
  },

  // Extra golden light when you first go Super Saiyan in the story.
  goldenAwakening(m) {
    const g = m.game;
    const f = feet(g);
    for (let i = 0; i < 3; i++) setTimeout(() => g.effects.ring(f, i === 1 ? 0xffffff : 0xffcc33, { maxRadius: 6 + i * 4, duration: 1.2, opacity: 0.7 }), i * 250);
    g.effects.burst(f.clone().setY(f.y + 1), 0xffe680, 60, 5, 0.08, 1);
    g.effects.dust(f, 2, 8);
    return 0;
  },

  // The crystal flares and projects a map of the galaxy over the ship.
  fragmentMap(m) {
    const g = m.game;
    const p = m.scene.fragment.position.clone();
    g.effects.flash(p, 0xffd36a, 1.2, 0.3);
    g.effects.burst(p, 0xffcc33, 50, 4, 0.08, 1);
    g.audio.fanfare();
    m.setScene({ fragment: 'map' });
    return 2;
  },

  // The training-ground gate wakes up and glows gold.
  portalOn(m) {
    const g = m.game;
    m.setScene({ portal: 'on' });
    const p = new THREE.Vector3(SPOTS.gate[0], 5, SPOTS.gate[1]);
    g.effects.ring(p.clone().setY(0.1), 0xffd36a, { maxRadius: 12, duration: 1.4 });
    g.effects.burst(p, 0xffd36a, 50, 6, 0.1, 1);
    g.audio.fanfare();
    bus.emit('hud:message', { text: 'The portal is glowing gold!', color: '#ffd36a', duration: 3 });
    return 1.5;
  },

  // "Meanwhile…" scenes: the world darkens around you (no camera moves).
  cutawayIn(m) { m.scene.dimTarget = 0.93; m.game.audio.whoosh?.(); return 1.0; },
  cutawayOut(m) { m.scene.dimTarget = 0; return 0.9; },
};
