// audio.js — all sound is synthesized with WebAudio; no audio files.
// Engine hum, sirens, gunshots, pickups and a tiny synthwave loop.

let ctx = null;
let master = null;
let engineOsc = null;
let engineOsc2 = null;
let engineGain = null;
let sirenOsc = null;
let sirenGain = null;
let musicTimer = null;
let muted = false;

const MUSIC_BASS = [55, 55, 65.41, 49, 55, 55, 82.41, 73.42];
const MUSIC_CHORD = [
  [220, 261.63, 329.63],
  [174.61, 220, 261.63],
  [196, 246.94, 293.66],
  [164.81, 207.65, 246.94],
];

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) {
    return;
  }
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);

  engineOsc = ctx.createOscillator();
  engineOsc.type = 'sawtooth';
  engineOsc.frequency.value = 50;
  engineOsc2 = ctx.createOscillator();
  engineOsc2.type = 'square';
  engineOsc2.frequency.value = 25;
  engineGain = ctx.createGain();
  engineGain.gain.value = 0;
  engineOsc.connect(engineGain);
  engineOsc2.connect(engineGain);
  engineGain.connect(master);
  engineOsc.start();
  engineOsc2.start();

  sirenOsc = ctx.createOscillator();
  sirenOsc.type = 'sine';
  sirenOsc.frequency.value = 700;
  sirenGain = ctx.createGain();
  sirenGain.gain.value = 0;
  sirenOsc.connect(sirenGain);
  sirenGain.connect(master);
  sirenOsc.start();
  let high = false;
  setInterval(() => {
    if (!ctx || muted) return;
    sirenOsc.frequency.value = high ? 950 : 700;
    high = !high;
  }, 420);
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.5;
}

export function isMuted() {
  return muted;
}

export function setEngine(speedNorm, on) {
  if (!ctx || !engineGain) return;
  const t = ctx.currentTime;
  engineGain.gain.setTargetAtTime(on ? 0.05 + 0.06 * speedNorm : 0, t, 0.08);
  engineOsc.frequency.setTargetAtTime(45 + 130 * speedNorm, t, 0.08);
  engineOsc2.frequency.setTargetAtTime(22 + 65 * speedNorm, t, 0.08);
}

export function setSiren(on) {
  if (!ctx || !sirenGain) return;
  sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, ctx.currentTime, 0.2);
}

function blip(freq, dur, type, vol, when = 0) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type || 'sine';
  o.frequency.value = freq;
  g.gain.setValueAtTime(vol || 0.2, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noiseBurst(dur, vol, lowpass) {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = lowpass || 3000;
  const g = ctx.createGain();
  g.gain.value = vol || 0.3;
  src.connect(f);
  f.connect(g);
  g.connect(master);
  src.start(t);
}

export const sfx = {
  pickup() {
    blip(660, 0.12, 'sine', 0.25);
    blip(990, 0.18, 'sine', 0.25, 0.09);
  },
  missionDone() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => blip(f, 0.22, 'triangle', 0.22, i * 0.11));
  },
  gunshot() {
    noiseBurst(0.14, 0.4, 2500);
  },
  punch() {
    noiseBurst(0.09, 0.3, 500);
    blip(90, 0.1, 'sine', 0.3);
  },
  crash() {
    noiseBurst(0.25, 0.45, 900);
  },
  click() {
    blip(880, 0.05, 'square', 0.12);
  },
  busted() {
    [392, 311, 233].forEach((f, i) => blip(f, 0.3, 'sawtooth', 0.15, i * 0.18));
  },
};

export function startMusic() {
  if (!ctx || musicTimer) return;
  let step = 0;
  musicTimer = setInterval(() => {
    if (muted || !ctx) return;
    const bar = Math.floor(step / 4) % 4;
    const bass = MUSIC_BASS[step % MUSIC_BASS.length];
    blip(bass, 0.5, 'triangle', 0.1);
    if (step % 4 === 0) {
      MUSIC_CHORD[bar].forEach((f) => blip(f, 1.6, 'sine', 0.045));
    }
    if (step % 2 === 0) noiseBurst(0.03, 0.05, 8000);
    step++;
  }, 300);
}
