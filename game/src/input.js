// STORMHARVEST — input.js
// Keyboard AND mouse input, as the brief requires both.
//  - Held keys give a 2-D flight vector (WASD / arrows) and dash (Shift).
//  - One-shot presses are queued as ACTION_* bit flags and taken exactly once
//    by the loop, so a press between frames is never lost or double-counted.
//  - The pointer is tracked in logical 1280x720 coordinates: while the mouse
//    button is held in play the kite steers toward the pointer, and every
//    click is queued (in logical coordinates) so menus, difficulty buttons,
//    upgrade cards and restart buttons are all clickable.

import { FIELD } from './config.js';

export const ACTION_CONFIRM = 1;  // Space / Enter — start, fire the Storm Lance
export const ACTION_PAUSE = 2;    // P / Esc
export const ACTION_MUTE = 4;     // M
export const ACTION_RESTART = 8;  // R
export const ACTION_DASH = 16;    // Shift tap also works as a dash press

const KEYMAP_CONFIRM = new Set(['Space', 'Enter']);
const KEYMAP_PAUSE = new Set(['KeyP', 'Escape']);
const HANDLED = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'Space']);

/** Convert a client (CSS pixel) point into logical playfield coordinates. */
export function toLogical(clientX, clientY) {
  const scale = Math.min(window.innerWidth / FIELD.width, window.innerHeight / FIELD.height);
  const ox = (window.innerWidth - FIELD.width * scale) / 2;
  const oy = (window.innerHeight - FIELD.height * scale) / 2;
  return { x: (clientX - ox) / scale, y: (clientY - oy) / scale };
}

export function createInput(target) {
  const held = new Set();
  let actions = 0;
  const pointer = { x: FIELD.width / 2, y: 300, down: false, inside: false };
  const clicks = []; // queued {x, y} logical clicks, drained by takeClicks()

  window.addEventListener('keydown', (event) => {
    if (HANDLED.has(event.code)) event.preventDefault();
    held.add(event.code);
    if (event.repeat) return;
    if (KEYMAP_CONFIRM.has(event.code)) actions |= ACTION_CONFIRM;
    else if (KEYMAP_PAUSE.has(event.code)) actions |= ACTION_PAUSE;
    else if (event.code === 'KeyM') actions |= ACTION_MUTE;
    else if (event.code === 'KeyR') actions |= ACTION_RESTART;
    else if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') actions |= ACTION_DASH;
  });
  window.addEventListener('keyup', (event) => held.delete(event.code));
  // A key released while the tab is hidden never sends keyup: drop everything on blur.
  window.addEventListener('blur', () => { held.clear(); pointer.down = false; });

  target.addEventListener('pointermove', (event) => {
    const p = toLogical(event.clientX, event.clientY);
    pointer.x = p.x; pointer.y = p.y; pointer.inside = true;
  });
  target.addEventListener('pointerdown', (event) => {
    const p = toLogical(event.clientX, event.clientY);
    pointer.x = p.x; pointer.y = p.y; pointer.down = true;
    clicks.push({ x: p.x, y: p.y });
  });
  window.addEventListener('pointerup', () => { pointer.down = false; });
  target.addEventListener('pointerleave', () => { pointer.inside = false; });

  const down = (...codes) => codes.some((c) => held.has(c));

  return {
    pointer,
    /** Flight vector: each component -1, 0 or 1 (diagonals normalised by the world). */
    vector() {
      return {
        x: (down('ArrowRight', 'KeyD') ? 1 : 0) - (down('ArrowLeft', 'KeyA') ? 1 : 0),
        y: (down('ArrowDown', 'KeyS') ? 1 : 0) - (down('ArrowUp', 'KeyW') ? 1 : 0),
      };
    },
    dashHeld() { return down('ShiftLeft', 'ShiftRight'); },
    /** Digit keys 1..4 currently pressed, for menus and upgrade drafts (0 = none). */
    digit() {
      for (let i = 1; i <= 4; i += 1) if (held.has('Digit' + i)) return i;
      return 0;
    },
    takeActions() { const taken = actions; actions = 0; return taken; },
    takeClicks() { const taken = clicks.slice(); clicks.length = 0; return taken; },
  };
}
