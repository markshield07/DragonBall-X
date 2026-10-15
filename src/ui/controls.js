// One place for "which button does what", so every hint, tip and the
// How to Play page names the right button for the device you're playing on.
export const CONTROLS = {
  punch: { vr: 'Swing your fists', desktop: 'Left click', what: 'Punch' },
  fire: { vr: 'Trigger', desktop: 'Right click', what: 'Fire ki attack (hold to charge)' },
  powerUp: { vr: 'Hold both grips', desktop: 'Hold Space', what: 'Power up (fills ki)' },
  transform: { vr: 'A button', desktop: 'T', what: 'Transform / power down' },
  switchAttack: { vr: 'B button', desktop: 'E', what: 'Switch attack' },
  block: { vr: 'Hold left grip', desktop: 'Hold Q', what: 'Block' },
  move: { vr: 'Left stick', desktop: 'W A S D', what: 'Move' },
  look: { vr: 'Right stick / your head', desktop: 'Mouse (click the game first)', what: 'Look around' },
  fly: { vr: 'Click left stick', desktop: 'G', what: 'Fly / land' },
  upDown: { vr: 'Right stick up / down', desktop: 'R up · V down', what: 'Fly up / down' },
  slowmo: { vr: 'Click right stick', desktop: 'F', what: 'Slow motion (Speed level 5)' },
  view: { vr: null, desktop: 'P', what: 'Camera: inside / behind you' },
  menu: { vr: 'X button', desktop: 'Tab or M', what: 'Menu' },
  comfort: { vr: 'Y button', desktop: 'Esc', what: 'Settings / close menu' },
};

// The button name for an action on this device, e.g. key(game, 'block').
export function key(game, action) {
  const c = CONTROLS[action];
  return c ? (game.isXR ? c.vr : c.desktop) : action;
}

// The rows of the How to Play page, in teaching order.
export const HELP_ORDER = ['move', 'look', 'punch', 'fire', 'switchAttack', 'block', 'powerUp', 'transform', 'fly', 'upDown', 'slowmo', 'view', 'menu'];
