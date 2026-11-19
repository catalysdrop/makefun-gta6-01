// missions.js — the story of Solmara Bay: three jobs for fixer Vera Solano.
// Each mission is a chain of steps with a map target; finishing pays cash.

import * as THREE from 'three';
import { dist2D, fmtCash } from './utils.js';

export const MISSIONS = [
  {
    id: 'borrowed-wheels',
    title: 'Job 1 — Borrowed Wheels',
    briefing: 'Vera: "New in town, Deke? Prove you can drive. Borrow a car — any car — and bring it to the boardwalk."',
    reward: 150,
    steps: [
      { text: 'Get in a car (walk up to one and press E)', target: null, needCar: true },
      { text: 'Drive to the boardwalk marker', target: { x: 0, z: 226 }, radius: 10 },
    ],
  },
  {
    id: 'the-package',
    title: 'Job 2 — The Package',
    briefing: 'Vera: "A package is waiting at the docks. Pick it up, drop it at the Starlight Motel. The cops are jumpy tonight — expect heat."',
    reward: 300,
    steps: [
      { text: 'Pick up the package at the docks (east side)', target: { x: 208, z: 52 }, radius: 8 },
      { text: 'Deliver it to the Starlight Motel — the cops are coming', target: { x: -156, z: -104 }, radius: 9, setWanted: 2 },
    ],
  },
  {
    id: 'harbor-lights',
    title: 'Job 3 — Harbor Lights',
    briefing: 'Vera: "Last one, big score. A briefcase is stashed in the harbor warehouse. Grab it and lose the heat at the safehouse."',
    reward: 600,
    steps: [
      { text: 'Grab the briefcase at the harbor warehouse', target: { x: 190, z: 226 }, radius: 8 },
      { text: 'Escape to the safehouse with the briefcase', target: { x: -208, z: -208 }, radius: 9, setWanted: 3 },
      { text: 'Lose the cops — stay out of sight until the heat dies down', target: null, needQuiet: true },
    ],
  },
];

export function makeMissionState() {
  return { index: 0, step: 0, done: false, allDone: false, quietCheck: 0 };
}

export function currentStep(m) {
  if (m.allDone || m.index >= MISSIONS.length) return null;
  return MISSIONS[m.index].steps[m.step];
}

export function currentObjective(m) {
  const mission = MISSIONS[m.index];
  if (!mission || m.allDone) return 'Free roam — Solmara Bay is yours.';
  const step = mission.steps[m.step];
  return `${mission.title}: ${step.text}`;
}

// A glowing beacon + floating ring marking the current target.
export function makeBeacon(scene) {
  const group = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffd23e, transparent: true, opacity: 0.28,
      side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  beam.position.y = 30;
  group.add(beam);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(3.2, 0.22, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd23e }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 1.2;
  group.add(ring);
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.9),
    new THREE.MeshBasicMaterial({ color: 0xffe97a }),
  );
  diamond.position.y = 6;
  group.add(diamond);
  group.userData.ring = ring;
  group.userData.diamond = diamond;
  group.visible = false;
  scene.add(group);
  return group;
}

export function updateBeacon(beacon, m, time) {
  const step = currentStep(m);
  if (!step || !step.target) {
    beacon.visible = false;
    return;
  }
  beacon.visible = true;
  beacon.position.set(step.target.x, 0, step.target.z);
  beacon.userData.ring.rotation.z = time * 0.8;
  beacon.userData.diamond.position.y = 6 + Math.sin(time * 2) * 0.8;
  beacon.userData.diamond.rotation.y = time;
}

// Advance missions. Returns event strings for the feed.
export function updateMissions(m, player, wanted, time) {
  const events = [];
  if (m.allDone) return events;
  const mission = MISSIONS[m.index];
  const step = mission.steps[m.step];
  if (!step) return events;

  if (step.needCar && player.inCar) {
    m.step++;
    events.push('Nice wheels. Now drive!');
  } else if (step.needQuiet) {
    if (wanted.stars === 0) {
      m.quietCheck += 1;
      finishMission(m, player, events);
    }
  } else if (step.target) {
    const px = player.inCar && player.car ? player.car.x : player.x;
    const pz = player.inCar && player.car ? player.car.z : player.z;
    if (dist2D(px, pz, step.target.x, step.target.z) < step.radius) {
      if (step.setWanted !== undefined && wanted.stars < step.setWanted) {
        wanted.stars = step.setWanted;
        events.push('Wanted level up — the cops are on you!');
      }
      m.step++;
      if (m.step >= mission.steps.length) {
        finishMission(m, player, events);
      } else {
        events.push('Objective updated.');
      }
    }
  }
  return events;
}

function finishMission(m, player, events) {
  const mission = MISSIONS[m.index];
  player.cash += mission.reward;
  events.push(`Job complete: ${mission.title} — +${fmtCash(mission.reward)}`);
  m.index++;
  m.step = 0;
  if (m.index >= MISSIONS.length) {
    m.allDone = true;
    events.push('STORY COMPLETE — You run Solmara Bay now. Free roam!');
  } else {
    events.push(`New job: ${MISSIONS[m.index].briefing}`);
  }
}
