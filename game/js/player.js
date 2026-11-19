// player.js — the on-foot character: movement, camera, entering cars, combat.

import * as THREE from 'three';
import { clamp, angleLerp } from './utils.js';
import { collideCircle } from './city.js';

export function buildPlayerMesh() {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xd8a080, roughness: 0.8 });
  const jacket = new THREE.MeshStandardMaterial({ color: 0x2e7fd8, roughness: 0.85 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.9 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.36), jacket);
  torso.position.y = 1.08;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), skin);
  head.position.y = 1.66;
  head.castShadow = true;
  g.add(head);
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26, 0.26, 0.1, 12),
    new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.7 }),
  );
  cap.position.y = 1.84;
  g.add(cap);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.68, 0.26), pants);
  legL.position.set(-0.16, 0.36, 0);
  legL.castShadow = true;
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.16;
  g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.6, 0.2), jacket);
  armL.position.set(-0.42, 1.1, 0);
  g.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.42;
  g.add(armR);
  g.userData.legL = legL;
  g.userData.legR = legR;
  g.userData.armL = armL;
  g.userData.armR = armR;
  return g;
}

export function makePlayer(scene, x, z) {
  const mesh = buildPlayerMesh();
  mesh.position.set(x, 0, z);
  scene.add(mesh);
  return {
    mesh, x, z, angle: 0, camYaw: 0, camPitch: 0.32,
    speed: 0, health: 100, cash: 0, ammo: 12, reloading: 0,
    inCar: false, car: null, walkPhase: 0, punchCooldown: 0,
    bustedMeter: 0, invulnerable: 0,
  };
}

// Move on foot. Returns nothing; mutates player.
export function updatePlayerOnFoot(p, input, dt, colliders, allCars) {
  const run = input.run ? 9 : 5.2;
  let mx = 0;
  let mz = 0;
  if (input.forward) mz += 1;
  if (input.back) mz -= 1;
  if (input.left) mx -= 1;
  if (input.right) mx += 1;
  const moving = mx !== 0 || mz !== 0;
  const targetSpeed = moving ? run : 0;
  p.speed += clamp(targetSpeed - p.speed, -30 * dt, 22 * dt);
  if (moving) {
    const len = Math.hypot(mx, mz);
    mx /= len;
    mz /= len;
    // camera-relative movement
    const sin = Math.sin(p.camYaw);
    const cos = Math.cos(p.camYaw);
    const wx = mx * cos - mz * sin;
    const wz = mx * sin + mz * cos;
    const fixed = collideCircle(colliders, p.x + wx * p.speed * dt, p.z + wz * p.speed * dt, 0.6);
    p.x = fixed.x;
    p.z = fixed.z;
    p.angle = angleLerp(p.angle, Math.atan2(wx, wz), Math.min(1, 14 * dt));
    p.walkPhase += p.speed * dt * 1.6;
  }
  p.mesh.position.set(p.x, 0, p.z);
  p.mesh.rotation.y = p.angle;
  const swing = moving ? Math.sin(p.walkPhase) * 0.55 : 0;
  p.mesh.userData.legL.rotation.x = swing;
  p.mesh.userData.legR.rotation.x = -swing;
  p.mesh.userData.armL.rotation.x = -swing * 0.7;
  p.mesh.userData.armR.rotation.x = swing * 0.7;
  p.mesh.position.y = moving ? Math.abs(Math.sin(p.walkPhase)) * 0.05 : 0;
  if (p.punchCooldown > 0) p.punchCooldown -= dt;
  if (p.reloading > 0) p.reloading -= dt;
  if (p.invulnerable > 0) p.invulnerable -= dt;
}

// Third-person camera behind the player (or the car).
export function updateCamera(camera, p, mouse, dt) {
  p.camYaw -= mouse.dx * 0.0042;
  p.camPitch = clamp(p.camPitch + mouse.dy * 0.0032, 0.05, 1.1);
  const dist = p.inCar ? 11 : 7.5;
  const height = p.inCar ? 4.2 : 3.4;
  let tx;
  let tz;
  let ty;
  if (p.inCar && p.car) {
    // chase cam follows the car's heading, eased
    const targetYaw = Math.atan2(Math.sin(p.car.angle), Math.cos(p.car.angle));
    p.camYaw = angleLerp(p.camYaw, targetYaw + Math.PI, Math.min(1, 2.2 * dt));
    tx = p.car.x;
    tz = p.car.z;
    ty = 1.2;
  } else {
    tx = p.x;
    tz = p.z;
    ty = 1.4;
  }
  const cx = tx - Math.sin(p.camYaw) * Math.cos(p.camPitch) * dist;
  const cz = tz - Math.cos(p.camYaw) * Math.cos(p.camPitch) * dist;
  const cy = ty + Math.sin(p.camPitch) * dist + (height - 3.4);
  camera.position.set(cx, cy, cz);
  camera.lookAt(tx, ty + 0.6, tz);
}
