// input.js — keyboard + mouse state for Solmara Bay.
// Tracks held keys and camera-drag deltas; no DOM game logic here.

export const keys = {};
export const mouse = { dx: 0, dy: 0, dragging: false, clicked: false };

export function initInput() {
  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });
  window.addEventListener('blur', () => {
    for (const k of Object.keys(keys)) keys[k] = false;
  });
  const c = document.getElementById('game-canvas');
  c.addEventListener('mousedown', (e) => {
    mouse.dragging = true;
    if (e.button === 0) mouse.clicked = true;
  });
  window.addEventListener('mouseup', () => {
    mouse.dragging = false;
  });
  window.addEventListener('mousemove', (e) => {
    if (mouse.dragging) {
      mouse.dx += e.movementX || 0;
      mouse.dy += e.movementY || 0;
    }
  });
}

export function consumeMouse() {
  const out = { dx: mouse.dx, dy: mouse.dy, clicked: mouse.clicked };
  mouse.dx = 0;
  mouse.dy = 0;
  mouse.clicked = false;
  return out;
}

export function pressed(code) {
  return !!keys[code];
}
