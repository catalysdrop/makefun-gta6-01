// peds.js — pedestrians strolling the sidewalks of Solmara Bay.
// They walk block to block, flee when scared, and fall when hit.

import * as THREE from 'three';
import { clamp, dist2D, pick } from './utils.js';
import { LINES, PITCH, ROAD_W, collideCircle } from './city.js';

const SHIRTS = [0xe86a5a, 0x5aa8e8, 0x7ac87a, 0xe8c85a, 0xb07ad8, 0xe8e8e8, 0x5ad8c8];
const SKINS = [0xd8a080, 0xb87a52, 0x8a5a38, 0xe8b898];

function buildPedMesh() {
  const g = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({
    color: pick(Math.random, SHIRTS), roughness: 0.9,
  });
  const skin = new THREE.MeshStandardMaterial({
    color: pick(Math.random, SKINS), roughness: 0.8,
  });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.62, 0.32), shirt);
  torso.position.y = 0.98;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), skin);
  head.position.y = 1.5;
  g.add(head);
  const legGeo = new THREE.BoxGeometry(0.2, 0.6, 0.22);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.9 });
  const legL = new THREE.Mesh(legGeo, legMat);
  legL.position.set(-0.13, 0.32, 0);
  g.add(legL);
  const legR = new THREE.Mesh(legGeo, legMat);
  legR.position.set(0.13, 0.32, 0);
  g.add(legR);
  g.userData.legL = legL;
  g.userData.legR = legR;
  return g;
}

function sidewalkPoint() {
  // a point on a sidewalk ring around a random block
  const i = Math.floor(Math.random() * (LINES.length - 1));
  const j = Math.floor(Math.random() * (LINES.length - 1));
  const bx = LINES[i] + PITCH / 2;
  const bz = LINES[j] + PITCH / 2;
  const side = Math.floor(Math.random() * 4);
  const off = ROAD_W / 2 + 1.5;
  if (side === 0) return { x: bx + (Math.random() - 0.5) * (PITCH - ROAD_W - 2), z: bz - PITCH / 2 + off };
  if (side === 1) return { x: bx + (Math.random() - 0.5) * (PITCH - ROAD_W - 2), z: bz + PITCH / 2 - off };
  if (side === 2) return { x: bx - PITCH / 2 + off, z: bz + (Math.random() - 0.5) * (PITCH - ROAD_W - 2) };
  return { x: bx + PITCH / 2 - off, z: bz + (Math.random() - 0.5) * (PITCH - ROAD_W - 2) };
}

export function spawnPeds(scene, count) {
  const peds = [];
  for (let i = 0; i < count; i++) {
    const mesh = buildPedMesh();
    const p = sidewalkPoint();
    mesh.position.set(p.x, 0, p.z);
    scene.add(mesh);
    const target = sidewalkPoint();
    peds.push({
      mesh, x: p.x, z: p.z, tx: target.x, tz: target.z,
      angle: 0, speed: 1 + Math.random() * 0.9,
      state: 'walk', downTimer: 0, fleeTimer: 0, walkPhase: Math.random() * 6,
    });
  }
  return peds;
}

export function updatePeds(peds, dt, playerPos, colliders) {
  for (const p of peds) {
    if (p.state === 'down') {
      p.downTimer -= dt;
      p.mesh.rotation.x = Math.min(Math.PI / 2, p.mesh.rotation.x + 4 * dt);
      if (p.downTimer <= 0) {
        p.state = 'flee';
        p.fleeTimer = 3;
        p.mesh.rotation.x = 0;
      }
      continue;
    }
    let speed = p.speed;
    let tx = p.tx;
    let tz = p.tz;
    if (p.state === 'flee') {
      p.fleeTimer -= dt;
      // run away from the player
      const dx = p.x - playerPos.x;
      const dz = p.z - playerPos.z;
      const d = Math.hypot(dx, dz) || 1;
      tx = p.x + (dx / d) * 20;
      tz = p.z + (dz / d) * 20;
      speed = 4.5;
      if (p.fleeTimer <= 0) {
        p.state = 'walk';
        const t = sidewalkPoint();
        p.tx = t.x;
        p.tz = t.z;
      }
    }
    const dx = tx - p.x;
    const dz = tz - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.2) {
      if (p.state === 'walk') {
        const t = sidewalkPoint();
        p.tx = t.x;
        p.tz = t.z;
      }
      continue;
    }
    const vx = (dx / d) * speed;
    const vz = (dz / d) * speed;
    const fixed = collideCircle(colliders, p.x + vx * dt, p.z + vz * dt, 0.5);
    p.x = fixed.x;
    p.z = fixed.z;
    p.angle = Math.atan2(vx, vz);
    p.walkPhase += speed * dt * 2.4;
    p.mesh.position.set(p.x, 0, p.z);
    p.mesh.rotation.y = p.angle;
    const swing = Math.sin(p.walkPhase) * 0.5;
    p.mesh.userData.legL.rotation.x = swing;
    p.mesh.userData.legR.rotation.x = -swing;
  }
}

export function knockDown(p) {
  p.state = 'down';
  p.downTimer = 4;
}

export function scareNear(peds, x, z, radius) {
  for (const p of peds) {
    if (p.state !== 'walk') continue;
    if (dist2D(p.x, p.z, x, z) < radius) {
      p.state = 'flee';
      p.fleeTimer = 2.5;
    }
  }
}
