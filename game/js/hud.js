// hud.js — HUD, minimap, message feed and screen prompts for Solmara Bay.

import { fmtCash } from './utils.js';
import { LINES } from './city.js';

let els = {};
let feedItems = [];

export function initHud() {
  els = {
    cash: document.getElementById('hud-cash'),
    stars: document.getElementById('hud-stars'),
    healthFill: document.getElementById('hud-health-fill'),
    ammo: document.getElementById('hud-ammo'),
    objective: document.getElementById('hud-objective'),
    speed: document.getElementById('hud-speed'),
    feed: document.getElementById('hud-feed'),
    prompt: document.getElementById('hud-prompt'),
    minimap: document.getElementById('minimap'),
    crosshair: document.getElementById('crosshair'),
  };
}

export function pushMessage(text) {
  feedItems.unshift({ text, t: Date.now() });
  feedItems = feedItems.slice(0, 5);
  if (!els.feed) return;
  els.feed.innerHTML = feedItems
    .map((m) => `<div class="feed-item">${escapeHtml(m.text)}</div>`)
    .join('');
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function setPrompt(text) {
  if (els.prompt) els.prompt.textContent = text || '';
}

export function updateHud(state) {
  if (!els.cash) return;
  els.cash.textContent = fmtCash(state.player.cash);
  els.stars.textContent = '★'.repeat(state.wanted.stars) + '☆'.repeat(5 - state.wanted.stars);
  els.stars.style.color = state.wanted.stars > 0 ? '#ff4040' : '#ffd23e';
  els.healthFill.style.width = Math.max(0, state.player.health) + '%';
  els.healthFill.style.background = state.player.health > 50 ? '#37d67a' : state.player.health > 25 ? '#f2c230' : '#ff4040';
  els.ammo.textContent = state.player.reloading > 0 ? 'RELOADING…' : `AMMO ${state.player.ammo}/12`;
  els.objective.textContent = state.objective;
  const speed = state.player.inCar && state.player.car
    ? Math.abs(state.player.car.speed) * 3.6
    : Math.abs(state.player.speed) * 3.6;
  els.speed.textContent = state.player.inCar ? `${Math.round(speed)} km/h` : '';
  els.crosshair.style.display = !state.player.inCar && state.started ? 'block' : 'none';
}

// Top-down minimap: roads, player, cars, police, mission target.
export function drawMinimap(state) {
  const cv = els.minimap;
  if (!cv) return;
  const g = cv.getContext('2d');
  const S = cv.width;
  const toPx = (v) => ((v + 250) / 500) * S;
  g.clearRect(0, 0, S, S);
  g.fillStyle = 'rgba(10, 16, 24, 0.85)';
  g.fillRect(0, 0, S, S);
  // roads
  g.strokeStyle = '#5a6270';
  g.lineWidth = 3;
  for (const l of LINES) {
    g.beginPath(); g.moveTo(toPx(l), 0); g.lineTo(toPx(l), S); g.stroke();
    g.beginPath(); g.moveTo(0, toPx(l)); g.lineTo(S, toPx(l)); g.stroke();
  }
  // beach
  g.fillStyle = '#2e7fb8';
  g.fillRect(0, toPx(246), S, S - toPx(246));
  // mission target
  if (state.target) {
    g.fillStyle = '#ffd23e';
    g.beginPath();
    g.arc(toPx(state.target.x), toPx(state.target.z), 5, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#ffd23e';
    g.beginPath();
    g.arc(toPx(state.target.x), toPx(state.target.z), 8, 0, Math.PI * 2);
    g.stroke();
  }
  // traffic + parked cars
  g.fillStyle = '#c8d2dc';
  for (const c of state.cars) {
    if (c.isPolice) continue;
    g.fillRect(toPx(c.x) - 1.5, toPx(c.z) - 1.5, 3, 3);
  }
  // police
  g.fillStyle = '#ff4040';
  for (const c of state.police) {
    g.beginPath();
    g.arc(toPx(c.x), toPx(c.z), 3.5, 0, Math.PI * 2);
    g.fill();
  }
  // player arrow
  const px = toPx(state.playerX);
  const pz = toPx(state.playerZ);
  g.save();
  g.translate(px, pz);
  g.rotate(state.playerAngle);
  g.fillStyle = '#37d67a';
  g.beginPath();
  g.moveTo(0, -7);
  g.lineTo(5, 5);
  g.lineTo(-5, 5);
  g.closePath();
  g.fill();
  g.restore();
}
