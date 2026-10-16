import { FORM_ORDER } from '../progression/forms.js';
import { formatNumber } from '../core/math.js';

// Reusable objective types for story missions. A step's `goal` names one of
// these with its parameters, e.g. { kind: 'punch', count: 15 }.
//
// Each type has:
//   total(goal)               the number to reach (progress is st.n / total)
//   on: { event(st, e, ctx) } game events (bus) that move it forward
//   tick(st, dt, ctx)         checked every frame (distances, timers, levels)
//   beacon(goal, ctx)         where the golden marker goes (optional)
//   show(st, goal)            the progress text in the tracker (optional)
//   start(st, goal, ctx)      set-up when it begins (optional)
// st is the saved progress object ({ n: 0, ... }); ctx is the StoryManager.
//
// Only training on the training grounds, a planet or the Time Chamber
// counts, never a story fight (those have their own steps).
const NOT_TRAINING_XP = ['story', 'daily', 'boss-reward', 'time-chamber', 'boss'];
const count = (st) => `${Math.min(Math.floor(st.n), st.total)} / ${st.total}`;
const near = (ctx, p, r) => {
  if (!p) return false;
  const h = ctx.game.player.headWorld;
  return Math.hypot(h.x - p.x, h.z - p.z) < r;
};

export const OBJECTIVES = {
  // Walk up to someone; their scene plays when you arrive.
  talk: {
    total: () => 1,
    beacon: (goal) => goal.actor,
    tick: (st, dt, ctx, goal) => { if (ctx.atGrounds && near(ctx, ctx.scene.point(goal.actor), 2.6)) st.n = 1; },
  },
  goTo: {
    total: () => 1,
    beacon: (goal) => goal.at,
    tick: (st, dt, ctx, goal) => { if (ctx.atGrounds && near(ctx, ctx.scene.point(goal.at), goal.radius || 2.5)) st.n = 1; },
  },
  touch: {
    total: () => 1,
    beacon: (goal) => goal.at,
    tick: (st, dt, ctx, goal) => { if (ctx.atGrounds && near(ctx, ctx.scene.point(goal.at), goal.radius || 1.4)) st.n = 1; },
  },
  // Walk through the gate (StoryManager.onPortal finishes it).
  portal: { total: () => 1, beacon: () => 'gate' },
  punch: {
    total: (g) => g.count,
    on: { 'punch:hit': (st, e, ctx) => { if (ctx.training) st.n += 1; } },
    show: count,
  },
  formPunch: {
    total: (g) => g.count,
    on: { 'punch:hit': (st, e, ctx) => { if (ctx.training && ctx.game.player.form !== 'base') st.n += 1; } },
    show: count,
  },
  block: {
    total: (g) => g.count,
    on: { 'player:hit': (st, e, ctx) => { if (ctx.training && e.blocked) st.n += 1; } },
    show: count,
  },
  // Seconds spent powering up.
  charge: {
    total: (g) => g.seconds,
    tick: (st, dt, ctx) => { if (ctx.training && ctx.game.transformation.state === 'charging') st.n += dt; },
    show: (st) => `${Math.min(st.total, st.n).toFixed(1)} / ${st.total} s`,
  },
  blastHit: {
    total: (g) => g.count,
    on: { xp: (st, e, ctx) => { if (ctx.training && e.source === 'ki-target') st.n += 1; } },
    show: count,
  },
  formBlast: {
    total: (g) => g.count,
    on: { xp: (st, e, ctx) => { if (ctx.training && e.source === 'ki-target' && ctx.game.player.form !== 'base') st.n += 1; } },
    show: count,
  },
  speedOrbs: {
    total: (g) => g.count,
    on: { xp: (st, e, ctx) => { if (ctx.training && e.source === 'speed') st.n += 1; } },
    show: count,
  },
  // XP earned in one stat from real training.
  xp: {
    total: (g) => g.amount,
    on: { xp: (st, e, ctx, goal) => { if (ctx.training && e.stat === goal.stat && !NOT_TRAINING_XP.includes(e.source)) st.n += e.amount; } },
    show: (st) => `${Math.min(st.total, Math.floor(st.n))} / ${st.total} XP`,
  },
  powerLevel: {
    total: (g) => g.value,
    tick: (st, dt, ctx) => { st.n = ctx.game.progress.basePowerLevel(); },
    show: (st) => `${formatNumber(Math.min(st.n, st.total))} / ${formatNumber(st.total)}`,
  },
  transform: {
    total: () => 1,
    start: (st, goal, ctx) => { if (FORM_ORDER.indexOf(ctx.game.player.form) >= FORM_ORDER.indexOf(goal.form)) st.n = 1; },
    on: { 'transform:burst': (st, e, ctx, goal) => { if (FORM_ORDER.indexOf(e.form) >= FORM_ORDER.indexOf(goal.form)) st.n = 1; } },
  },
  holdForm: {
    total: (g) => g.seconds,
    tick: (st, dt, ctx) => { if (ctx.training && ctx.game.player.form !== 'base') st.n += dt; },
    show: (st) => `${Math.floor(Math.min(st.total, st.n))} / ${st.total} s`,
  },
  spar: {
    total: (g) => g.wins,
    on: { 'spar:won': (st, e, ctx, goal) => { if (goal?.level && e?.level?.id !== goal.level) return; if (ctx.training) st.n += 1; } },
    show: count,
  },
  // Story soldiers (see StoryEnemies): the StoryManager counts knockouts.
  defeat: {
    total: (g) => g.count,
    on: { 'story:ko': (st) => { st.n += 1; } },
    show: count,
  },
  // Reach each scared trainee; they thank you and run to safety.
  rescue: {
    total: (g) => g.actors.length,
    start: (st) => { st.done = st.done || []; },
    beacon: (goal, ctx, st) => goal.actors.find((a) => !(st.done || []).includes(a)),
    tick: (st, dt, ctx, goal) => {
      if (!ctx.atGrounds) return;
      for (const id of goal.actors) {
        if (st.done.includes(id) || !near(ctx, ctx.scene.point(id), 2.2)) continue;
        st.done.push(id);
        st.n = st.done.length;
        ctx.onRescued(id);
      }
    },
    show: count,
  },
};

export function objectiveTotal(goal) {
  return OBJECTIVES[goal.kind]?.total(goal) ?? 1;
}
