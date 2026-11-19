// police.js — the wanted system and police pursuit AI for Solmara Bay.
// Wanted 0-5 stars; police cars spawn, chase and ram; lay low and it fades.

import { clamp, dist2D } from './utils.js';
import { makeCar } from './vehicles.js';
import { randomRoadPoint } from './city.js';

export function makeWanted() {
  return {
    stars: 0,
    quietTimer: 0,
    spawnTimer: 0,
  };
}

export function addWanted(wanted, n) {
  wanted.stars = clamp(wanted.stars + n, 0, 5);
  wanted.quietTimer = 0;
}

// Spawn / update police cars. Returns events for the message feed.
export function updatePolice(wanted, police, player, dt, scene, allCars) {
  const events = [];
  const target = player.inCar && player.car ? player.car : player;
  const px = target.x;
  const pz = target.z;

  // how many police should be out
  const want = wanted.stars === 0 ? 0 : Math.min(wanted.stars, 5);
  wanted.spawnTimer -= dt;
  if (police.length < want && wanted.spawnTimer <= 0) {
    wanted.spawnTimer = 2.5;
    const p = randomRoadPoint(Math.random);
    // spawn a little away from the player, on a road
    let sx = p.x;
    let sz = p.z;
    if (dist2D(sx, sz, px, pz) < 40) {
      sx = px + (sx > px ? 60 : -60);
      sz = pz + (sz > pz ? 60 : -60);
    }
    const car = makeCar(scene, {
      x: sx, z: sz, angle: 0,
      isPolice: true, maxSpeed: 33,
    });
    car.isPoliceCar = true;
    police.push(car);
    allCars.push(car);
    events.push('Police on your tail!');
  }
  // remove extras when wanted falls
  while (police.length > want) {
    const car = police.pop();
    car.disabled = true;
    scene.remove(car.mesh);
    const idx = allCars.indexOf(car);
    if (idx >= 0) allCars.splice(idx, 1);
  }

  // chase AI: steer toward the player, ram on contact
  let nearest = Infinity;
  for (const car of police) {
    if (car.disabled) continue;
    const d = dist2D(car.x, car.z, px, pz);
    nearest = Math.min(nearest, d);
    const wantAngle = Math.atan2(px - car.x, pz - car.z);
    let diff = wantAngle - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    car.angle += clamp(diff, -2.4 * dt, 2.4 * dt);
    car.speed += clamp(30 - car.speed, -20 * dt, 12 * dt);
    car.x += Math.sin(car.angle) * car.speed * dt;
    car.z += Math.cos(car.angle) * car.speed * dt;
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.angle;
    // flashing light bar
    car.flash += dt * 9;
    const bar = car.mesh.userData.lightBar;
    if (bar) bar.visible = Math.sin(car.flash) > -0.2;
    // ram the player's car
    if (player.inCar && player.car && d < 4.6) {
      player.car.health -= 14 * dt;
      player.car.speed *= 1 - 1.5 * dt;
      if (player.car.health <= 0 && !player.car.disabled) {
        player.car.disabled = true;
        events.push('Your car is wrecked — get out!');
      }
    }
    // touch the player on foot -> busted meter
    if (!player.inCar && d < 3.2) {
      player.bustedMeter += dt;
      events.push('busted-progress');
    }
  }

  // wanted fades when no police is close for a while
  if (wanted.stars > 0) {
    if (nearest > 70) {
      wanted.quietTimer += dt;
      if (wanted.quietTimer > 10) {
        wanted.stars -= 1;
        wanted.quietTimer = 0;
        events.push(wanted.stars === 0 ? 'You lost the cops.' : 'Heat is cooling off…');
      }
    } else {
      wanted.quietTimer = 0;
    }
  }
  return events;
}
