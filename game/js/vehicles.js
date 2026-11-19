// vehicles.js — car factory, traffic AI and driving physics for Solmara Bay.

import * as THREE from 'three';
import { clamp, dist2D, pick } from './utils.js';
import { LINES, isRoad, randomRoadPoint, collideCircle } from './city.js';

const CAR_COLORS = [0xd83a2e, 0x2e7fd8, 0xf2c230, 0x38b24a, 0x8a5fd8, 0xe8e8e8, 0x222226, 0xff7a2e, 0x2ed8c8];

export function buildCarMesh(color, isPolice) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({
    color, roughness: 0.35, metalness: 0.55,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x18242e, roughness: 0.15, metalness: 0.8,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), paint);
  body.position.y = 0.55;
  body.castShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.55, 2.2), glass);
  cabin.position.set(0, 1.1, -0.25);
  cabin.castShadow = true;
  g.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });
  const wheels = [];
  for (const [x, z] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.36, z);
    w.castShadow = true;
    g.add(w);
    wheels.push(w);
  }
  // headlights + taillights
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xfff6c8, emissive: 0xffedb0, emissiveIntensity: 1.2,
  });
  for (const x of [-0.65, 0.65]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.06), headMat);
    h.position.set(x, 0.62, 2.21);
    g.add(h);
  }
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0xd82020, emissive: 0xa01010, emissiveIntensity: 1.0,
  });
  for (const x of [-0.65, 0.65]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.06), tailMat);
    t.position.set(x, 0.62, -2.21);
    g.add(t);
  }
  let lightBar = null;
  if (isPolice) {
    const bar = new THREE.Group();
    const r = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.16, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff2020, emissiveIntensity: 2 }),
    );
    r.position.x = -0.35;
    const b = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.16, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x2040ff, emissive: 0x2040ff, emissiveIntensity: 2 }),
    );
    b.position.x = 0.35;
    bar.add(r);
    bar.add(b);
    bar.position.set(0, 1.48, -0.25);
    g.add(bar);
    lightBar = bar;
    // police livery: white body with black doors is faked by a dark stripe
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(2.02, 0.3, 4.42),
      new THREE.MeshStandardMaterial({ color: 0x181818, roughness: 0.4, metalness: 0.4 }),
    );
    stripe.position.y = 0.55;
    g.add(stripe);
  }
  g.userData.wheels = wheels;
  g.userData.lightBar = lightBar;
  return g;
}

export function makeCar(scene, opts) {
  const { x, z, angle = 0, color, isPolice = false, isTraffic = false, maxSpeed = 30 } = opts;
  const mesh = buildCarMesh(isPolice ? 0xf0f0f0 : color, isPolice);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = angle;
  scene.add(mesh);
  const car = {
    mesh, x, z, angle, speed: 0, maxSpeed,
    color, isPolice, isTraffic, isPlayer: false,
    health: 100, disabled: false,
    steer: 0, trafficDir: 0, trafficLine: 0, horizontal: true,
    flash: 0,
  };
  if (isTraffic) {
    car.horizontal = Math.random() < 0.5;
    car.trafficLine = pick(Math.random, LINES);
    car.trafficDir = Math.random() < 0.5 ? 1 : -1;
    car.speed = 7 + Math.random() * 5;
  }
  return car;
}

export function spawnParkedCars(scene, colliders, rng, count) {
  const cars = [];
  let tries = 0;
  while (cars.length < count && tries < count * 40) {
    tries++;
    const p = randomRoadPoint(rng);
    if (Math.abs(p.x) > 225 || Math.abs(p.z) > 225) continue;
    // keep clear of other parked cars
    if (cars.some((c) => dist2D(c.x, c.z, p.x, p.z) < 9)) continue;
    const horizontal = Math.abs(p.z - Math.round(p.z / 52) * 52) < 8;
    const angle = horizontal ? (Math.random() < 0.5 ? 0 : Math.PI) : (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
    const car = makeCar(scene, {
      x: p.x, z: p.z, angle,
      color: pick(rng, CAR_COLORS),
      maxSpeed: 26 + rng() * 10,
    });
    cars.push(car);
  }
  return cars;
}

export function spawnTraffic(scene, count) {
  const cars = [];
  for (let i = 0; i < count; i++) {
    const p = randomRoadPoint(Math.random);
    const car = makeCar(scene, {
      x: p.x, z: p.z, angle: 0,
      color: pick(Math.random, CAR_COLORS),
      isTraffic: true, maxSpeed: 12,
    });
    // face along its lane
    car.angle = car.horizontal ? (car.trafficDir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.trafficDir > 0 ? 0 : Math.PI);
    car.mesh.rotation.y = car.angle;
    cars.push(car);
  }
  return cars;
}

// Traffic: drive along a road line, turn at intersections sometimes.
export function updateTraffic(car, dt, allCars) {
  if (car.disabled) return;
  const ahead = car.horizontal
    ? { x: car.x + Math.sin(car.angle) * 9, z: car.z + Math.cos(car.angle) * 9 }
    : { x: car.x + Math.sin(car.angle) * 9, z: car.z + Math.cos(car.angle) * 9 };
  let targetSpeed = car.maxSpeed;
  for (const other of allCars) {
    if (other === car || other.disabled) continue;
    if (dist2D(ahead.x, ahead.z, other.x, other.z) < 6) {
      targetSpeed = 0;
      break;
    }
  }
  car.speed += clamp(targetSpeed - car.speed, -14 * dt, 8 * dt);
  car.x += Math.sin(car.angle) * car.speed * dt;
  car.z += Math.cos(car.angle) * car.speed * dt;
  // at an intersection, sometimes turn
  const onLine = (v) => Math.abs(v - Math.round(v / 52) * 52) < 1.2;
  if ((car.horizontal && onLine(car.x)) || (!car.horizontal && onLine(car.z))) {
    if (Math.random() < 0.004) {
      car.horizontal = !car.horizontal;
      car.trafficLine = car.horizontal ? car.z : car.x;
      car.angle += (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
    }
  }
  // keep inside the city: wrap around the edge roads
  if (car.x > 226) car.x = -226;
  if (car.x < -226) car.x = 226;
  if (car.z > 226) car.z = -226;
  if (car.z < -226) car.z = 226;
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.angle;
  spinWheels(car, dt);
}

export function spinWheels(car, dt) {
  const wheels = car.mesh.userData.wheels;
  if (!wheels) return;
  for (const w of wheels) w.rotation.x += car.speed * dt * 2.2;
}

// Player driving physics: arcade handling, building collision, car-car push.
export function updatePlayerCar(car, input, dt, colliders, allCars) {
  if (car.disabled) {
    car.speed *= 1 - 2 * dt;
  } else {
    const accel = input.forward ? 15 : input.back ? -11 : 0;
    car.speed += accel * dt;
    if (!input.forward && !input.back) car.speed *= 1 - 1.1 * dt;
    if (input.brake) car.speed *= 1 - 3.2 * dt;
    car.speed = clamp(car.speed, -11, car.maxSpeed);
    const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    car.steer += (steerTarget - car.steer) * Math.min(1, 10 * dt);
    const dir = car.speed >= 0 ? 1 : -1;
    car.angle += car.steer * 1.9 * dir * Math.min(1, Math.abs(car.speed) / 9) * dt;
  }
  let nx = car.x + Math.sin(car.angle) * car.speed * dt;
  let nz = car.z + Math.cos(car.angle) * car.speed * dt;
  const fixed = collideCircle(colliders, nx, nz, 2.4);
  if (fixed.x !== nx || fixed.z !== nz) {
    car.speed *= 0.45;
    nx = fixed.x;
    nz = fixed.z;
  }
  car.x = nx;
  car.z = nz;
  // gentle push from other cars
  for (const other of allCars) {
    if (other === car || other.disabled) continue;
    const d = dist2D(car.x, car.z, other.x, other.z);
    if (d < 4.4 && d > 0.01) {
      const push = (4.4 - d) * 0.5;
      const px = ((car.x - other.x) / d) * push;
      const pz = ((car.z - other.z) / d) * push;
      car.x += px;
      car.z += pz;
      if (other.isTraffic) {
        other.x -= px * 0.7;
        other.z -= pz * 0.7;
      }
    }
  }
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.angle;
  spinWheels(car, dt);
}

export function nearestCar(cars, x, z, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const c of cars) {
    if (c.disabled) continue;
    const d = dist2D(x, z, c.x, c.z);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}
