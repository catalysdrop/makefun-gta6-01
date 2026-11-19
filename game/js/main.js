// main.js — Solmara Bay: an open-world crime game in the spirit of GTA 6.
// Boots the renderer, owns the game loop, and wires every system together.
// Original city, characters, vehicles, story, art and music — nothing from
// any commercial game.

import * as THREE from 'three';
import { clamp, dist2D, mulberry32 } from './utils.js';
import { keys, mouse, initInput, consumeMouse } from './input.js';
import { initAudio, setEngine, setSiren, setMuted, isMuted, sfx, startMusic } from './audio.js';
import { buildCity, isRoad } from './city.js';
import { makeCar, spawnParkedCars, spawnTraffic, updateTraffic, updatePlayerCar, nearestCar } from './vehicles.js';
import { makePlayer, buildPlayerMesh, updatePlayerOnFoot, updateCamera } from './player.js';
import { spawnPeds, updatePeds, knockDown, scareNear } from './peds.js';
import { makeWanted, addWanted, updatePolice } from './police.js';
import { makeMissionState, currentStep, currentObjective, makeBeacon, updateBeacon, updateMissions, MISSIONS } from './missions.js';
import { initHud, pushMessage, setPrompt, updateHud, drawMinimap } from './hud.js';

const SAVE_KEY = 'solmara-bay-save-v1';
const params = new URLSearchParams(location.search);
const SHOT = params.get('shot') ? parseInt(params.get('shot'), 10) : 0;

const state = {
  started: false,
  paused: false,
  over: null, // 'busted' | 'wasted' | 'complete'
  time: 0,
  player: null,
  wanted: null,
  missions: null,
  cars: [],
  traffic: [],
  peds: [],
  police: [],
  colliders: [],
  objective: '',
  target: null,
};

let renderer;
let scene;
let camera;
let raycaster;
let beacon;
let clock;

function loadSave() {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
  } catch (e) {
    return null;
  }
}

function writeSave() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: state.player.cash,
      missionIndex: state.missions.index,
      x: state.player.x,
      z: state.player.z,
    }));
  } catch (e) {
    /* storage unavailable (file:// etc.) — the game still plays */
  }
}

function setupShot(n) {
  const p = state.player;
  if (n === 1) {
    // cover: driving a red sports car down the main avenue
    const car = makeCar(scene, { x: 0, z: -120, angle: 0, color: 0xd83a2e, maxSpeed: 38 });
    state.cars.push(car);
    enterCar(car);
    p.camYaw = Math.PI;
  } else if (n === 2) {
    // on foot next to a yellow taxi, downtown
    p.x = 52;
    p.z = 52;
    p.mesh.position.set(p.x, 0, p.z);
    p.camYaw = Math.PI * 0.75;
    const taxi = makeCar(scene, { x: 56, z: 55, angle: Math.PI / 2, color: 0xf2c230, maxSpeed: 30 });
    state.cars.push(taxi);
  } else if (n === 3) {
    // police chase, wanted 3
    const car = makeCar(scene, { x: -52, z: 0, angle: Math.PI / 2, color: 0x2e7fd8, maxSpeed: 36 });
    state.cars.push(car);
    enterCar(car);
    state.wanted.stars = 3;
    p.camYaw = Math.PI / 2 + Math.PI;
    // two police cars already closing in, visible in frame
    const cop1 = makeCar(scene, { x: -22, z: 7, angle: -Math.PI / 2, isPolice: true, maxSpeed: 33 });
    const cop2 = makeCar(scene, { x: -78, z: -9, angle: Math.PI / 2, isPolice: true, maxSpeed: 33 });
    state.police.push(cop1, cop2);
    state.cars.push(cop1, cop2);
  } else if (n === 4) {
    // at the harbor mission beacon on the boardwalk, facing the warehouse
    p.x = 158;
    p.z = 228;
    p.mesh.position.set(p.x, 0, p.z);
    p.camYaw = Math.PI / 2;
    state.missions.index = 2;
    state.missions.step = 0;
  }
}

function enterCar(car) {
  const p = state.player;
  p.inCar = true;
  p.car = car;
  car.isPlayer = true;
  car.isTraffic = false;
  car.maxSpeed = Math.max(car.maxSpeed, 26);
  p.mesh.visible = false;
  setPrompt('');
  sfx.click();
}

function exitCar() {
  const p = state.player;
  if (!p.car) return;
  const car = p.car;
  car.isPlayer = false;
  const side = { x: car.x + Math.cos(car.angle) * 2.6, z: car.z - Math.sin(car.angle) * 2.6 };
  p.x = side.x;
  p.z = side.z;
  p.mesh.position.set(p.x, 0, p.z);
  p.mesh.visible = true;
  p.inCar = false;
  p.car = null;
  sfx.click();
}

function tryPunch() {
  const p = state.player;
  if (p.punchCooldown > 0 || p.inCar) return;
  p.punchCooldown = 0.45;
  sfx.punch();
  const fx = p.x + Math.sin(p.angle) * 1.6;
  const fz = p.z + Math.cos(p.angle) * 1.6;
  for (const ped of state.peds) {
    if (ped.state === 'down') continue;
    if (dist2D(ped.x, ped.z, fx, fz) < 1.8) {
      knockDown(ped);
      addWanted(state.wanted, 1);
      pushMessage('You knocked a pedestrian down — the heat is on!');
      scareNear(state.peds, p.x, p.z, 25);
      return;
    }
  }
  for (const car of state.police) {
    if (dist2D(car.x, car.z, fx, fz) < 4) {
      car.health -= 20;
      addWanted(state.wanted, 1);
      pushMessage('You smashed a police car!');
      if (car.health <= 0) disablePoliceCar(car);
      return;
    }
  }
}

function disablePoliceCar(car) {
  car.disabled = true;
  car.speed = 0;
  car.mesh.rotation.z = 0.06;
  pushMessage('Police car disabled!');
}

function tryShoot() {
  const p = state.player;
  if (p.inCar || p.reloading > 0 || p.ammo <= 0) {
    if (p.ammo <= 0 && p.reloading <= 0) {
      p.reloading = 1.2;
      pushMessage('Reloading…');
    }
    return;
  }
  p.ammo -= 1;
  sfx.gunshot();
  addWanted(state.wanted, 0); // shooting itself is loud, but the hit raises heat
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  const targets = [];
  for (const ped of state.peds) if (ped.state !== 'down') targets.push(ped.mesh);
  for (const car of state.police) if (!car.disabled) targets.push(car.mesh);
  for (const car of state.traffic) targets.push(car.mesh);
  const hits = raycaster.intersectObjects(targets, true);
  if (hits.length > 0) {
    let obj = hits[0].object;
    while (obj.parent && obj.parent !== scene) obj = obj.parent;
    const ped = state.peds.find((pd) => pd.mesh === obj);
    if (ped) {
      knockDown(ped);
      addWanted(state.wanted, 1);
      pushMessage('You shot a pedestrian down!');
      scareNear(state.peds, p.x, p.z, 30);
    }
    const cop = state.police.find((c) => c.mesh === obj);
    if (cop) {
      cop.health -= 34;
      addWanted(state.wanted, 1);
      pushMessage('You hit a police car!');
      if (cop.health <= 0) disablePoliceCar(cop);
    }
  }
  // muzzle flash: brief point light
  const flash = new THREE.PointLight(0xffe9a0, 60, 18);
  flash.position.copy(camera.position).add(new THREE.Vector3(0, -0.3, 0));
  scene.add(flash);
  setTimeout(() => scene.remove(flash), 70);
}

function checkCarHits() {
  const p = state.player;
  if (!p.inCar || !p.car) return;
  const car = p.car;
  for (const ped of state.peds) {
    if (ped.state === 'down') continue;
    if (dist2D(ped.x, ped.z, car.x, car.z) < 2.6 && Math.abs(car.speed) > 5) {
      knockDown(ped);
      addWanted(state.wanted, 1);
      sfx.crash();
      pushMessage('You ran over a pedestrian!');
      scareNear(state.peds, car.x, car.z, 30);
      car.speed *= 0.7;
    }
  }
}

function bustPlayer() {
  state.over = 'busted';
  state.started = false;
  const fine = Math.min(100, Math.floor(state.player.cash * 0.1));
  state.player.cash = Math.max(0, state.player.cash - fine);
  state.wanted.stars = 0;
  state.player.bustedMeter = 0;
  sfx.busted();
  document.getElementById('overlay-busted').style.display = 'flex';
  document.getElementById('busted-fine').textContent = `Fine: $${fine}. You were dropped at the hospital.`;
  writeSave();
}

function wastePlayer() {
  state.over = 'wasted';
  state.started = false;
  state.player.cash = Math.max(0, state.player.cash - 50);
  state.wanted.stars = 0;
  document.getElementById('overlay-wasted').style.display = 'flex';
  writeSave();
}

function respawn() {
  const p = state.player;
  if (p.inCar) exitCar();
  p.x = -208;
  p.z = -156;
  p.health = 100;
  p.mesh.position.set(p.x, 0, p.z);
  p.mesh.visible = true;
  document.getElementById('overlay-busted').style.display = 'none';
  document.getElementById('overlay-wasted').style.display = 'none';
  state.over = null;
  state.started = true;
  pushMessage('Back on the streets. Stay out of trouble… or don\'t.');
}

function startGame(fresh) {
  const save = fresh ? null : loadSave();
  initAudio();
  startMusic();
  if (save) {
    state.player.cash = save.cash || 0;
    state.missions.index = Math.min(save.missionIndex || 0, MISSIONS.length - 1);
    state.player.x = save.x ?? 0;
    state.player.z = save.z ?? 0;
    state.player.mesh.position.set(state.player.x, 0, state.player.z);
  }
  state.started = true;
  state.paused = false;
  document.getElementById('overlay-start').style.display = 'none';
  document.getElementById('hud').style.display = 'block';
  if (SHOT) setupShot(SHOT);
  pushMessage(MISSIONS[state.missions.index]
    ? MISSIONS[state.missions.index].briefing
    : 'Free roam — Solmara Bay is yours.');
  window.__gameReady = true;
}

function togglePause() {
  if (!state.started) return;
  state.paused = !state.paused;
  document.getElementById('overlay-pause').style.display = state.paused ? 'flex' : 'none';
}

function init() {
  const canvas = document.getElementById('game-canvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87b5d6);
  scene.fog = new THREE.Fog(0x9fc3dd, 220, 720);

  camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
  camera.position.set(0, 6, -14);

  const sun = new THREE.DirectionalLight(0xffe8c0, 2.6);
  sun.position.set(180, 260, -120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -280;
  sun.shadow.camera.right = 280;
  sun.shadow.camera.top = 280;
  sun.shadow.camera.bottom = -280;
  sun.shadow.camera.far = 800;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 1.0));

  raycaster = new THREE.Raycaster();
  clock = new THREE.Clock();

  const city = buildCity(scene);
  state.colliders = city.colliders;

  const rng = mulberry32(20261119);
  state.cars = spawnParkedCars(scene, state.colliders, rng, 16);
  state.traffic = spawnTraffic(scene, 14);
  state.peds = spawnPeds(scene, 26);
  state.player = makePlayer(scene, 0, -40);
  state.wanted = makeWanted();
  state.missions = makeMissionState();
  beacon = makeBeacon(scene);

  initInput();
  initHud();

  // UI wiring
  const save = loadSave();
  const continueBtn = document.getElementById('btn-continue');
  if (save && (save.cash > 0 || save.missionIndex > 0)) {
    continueBtn.style.display = 'inline-block';
    continueBtn.textContent = `Continue — $${Math.floor(save.cash)} · Job ${Math.min(save.missionIndex + 1, 3)}/3`;
  }
  document.getElementById('btn-start').addEventListener('click', () => startGame(true));
  continueBtn.addEventListener('click', () => startGame(false));
  document.getElementById('btn-resume').addEventListener('click', respawn);
  document.getElementById('btn-retry').addEventListener('click', respawn);
  document.getElementById('btn-pause-resume').addEventListener('click', togglePause);
  document.getElementById('btn-mute').addEventListener('click', () => {
    setMuted(!isMuted());
    document.getElementById('btn-mute').textContent = isMuted() ? 'Sound: OFF' : 'Sound: ON';
  });
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  if (SHOT) {
    // screenshot mode: skip the menu and start immediately
    document.getElementById('overlay-start').style.display = 'none';
    startGame(true);
  }
  renderer.setAnimationLoop(tick);
}

let saveTimer = 0;

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const m = consumeMouse();

  if (state.started && !state.paused) {
    state.time += dt;
    const p = state.player;

    // global keys
    if (keys['KeyM'] && !tick._mPressed) {
      setMuted(!isMuted());
      document.getElementById('btn-mute').textContent = isMuted() ? 'Sound: OFF' : 'Sound: ON';
    }
    tick._mPressed = !!keys['KeyM'];
    if (keys['KeyP'] && !tick._pPressed) togglePause();
    tick._pPressed = !!keys['KeyP'];

    const input = {
      forward: !!(keys['KeyW'] || keys['ArrowUp']) || (SHOT === 1 || SHOT === 3),
      back: !!(keys['KeyS'] || keys['ArrowDown']),
      left: !!(keys['KeyA'] || keys['ArrowLeft']),
      right: !!(keys['KeyD'] || keys['ArrowRight']),
      run: !!keys['ShiftLeft'] || !!keys['ShiftRight'],
      brake: !!keys['Space'],
    };

    // enter / exit car
    if (keys['KeyE'] && !tick._ePressed) {
      if (p.inCar) {
        exitCar();
      } else {
        const car = nearestCar([...state.cars, ...state.traffic, ...state.police], p.x, p.z, 4.5);
        if (car && !car.isPolice) {
          if (car.isTraffic && Math.abs(car.speed) > 3) {
            setPrompt('Too fast to jack!');
          } else {
            enterCar(car);
            addWanted(state.wanted, 1);
            pushMessage('You jacked a car — the heat is on!');
          }
        }
      }
    }
    tick._ePressed = !!keys['KeyE'];

    if (keys['KeyF'] && !tick._fPressed) tryPunch();
    tick._fPressed = !!keys['KeyF'];
    if (keys['KeyR'] && !tick._rPressed && p.ammo < 12 && p.reloading <= 0) {
      p.reloading = 1.2;
      p.ammo = 12;
      pushMessage('Reloaded.');
    }
    tick._rPressed = !!keys['KeyR'];
    if (m.clicked) tryShoot();

    if (p.inCar && p.car) {
      updatePlayerCar(p.car, input, dt, state.colliders, [...state.cars, ...state.traffic, ...state.police]);
      checkCarHits();
      setEngine(Math.abs(p.car.speed) / p.car.maxSpeed, true);
    } else {
      updatePlayerOnFoot(p, input, dt, state.colliders, [...state.cars, ...state.traffic]);
      setEngine(0, false);
      // nearby car prompt
      const near = nearestCar([...state.cars, ...state.traffic], p.x, p.z, 4.5);
      setPrompt(near ? 'Press E to get in the car' : '');
    }

    for (const car of state.traffic) {
      if (car.isPlayer) continue;
      updateTraffic(car, dt, [...state.cars, ...state.traffic, ...state.police]);
    }
    updatePeds(state.peds, dt, p, state.colliders);

    // police + wanted
    const events = updatePolice(state.wanted, state.police, p, dt, scene, state.cars);
    for (const e of events) {
      if (e === 'busted-progress') continue;
      pushMessage(e);
    }
    setSiren(state.police.length > 0);

    // busted / wasted
    if (p.bustedMeter > 2) {
      bustPlayer();
    } else if (p.health <= 0) {
      wastePlayer();
    }
    if (p.inCar && p.car && p.car.disabled && Math.abs(p.car.speed) < 0.5) {
      // stay in the wreck until the player gets out
      setPrompt('Your car is wrecked — press E to get out');
    }

    // missions
    const mEvents = updateMissions(state.missions, p, state.wanted, state.time);
    for (const e of mEvents) pushMessage(e);
    if (state.missions.allDone && !state.over) {
      state.over = 'complete';
      sfx.missionDone();
      writeSave();
    }
    updateBeacon(beacon, state.missions, state.time);

    // crash damage at high speed into buildings is handled by speed loss;
    // hard hits hurt the player a little
    updateCamera(camera, p, m, dt);

    // HUD
    const step = currentStep(state.missions);
    state.objective = currentObjective(state.missions);
    state.target = step && step.target ? step.target : null;
    updateHud(state);
    drawMinimap({
      playerX: p.inCar && p.car ? p.car.x : p.x,
      playerZ: p.inCar && p.car ? p.car.z : p.z,
      playerAngle: p.inCar && p.car ? p.car.angle : p.angle,
      cars: [...state.cars, ...state.traffic],
      police: state.police,
      target: state.target,
    });

    saveTimer += dt;
    if (saveTimer > 15) {
      saveTimer = 0;
      writeSave();
    }
  } else if (!state.started && !state.over) {
    // menu orbit: slow cinematic pan over the city
    state.time += dt;
    const a = state.time * 0.03;
    camera.position.set(Math.sin(a) * 190, 90, Math.cos(a) * 190 + 20);
    camera.lookAt(0, 0, 0);
  }

  renderer.render(scene, camera);
}

init();
