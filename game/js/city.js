// city.js — builds Solmara Bay: road grid, buildings, beach, palms, lights.
// The city is deterministic (seeded RNG) so every load looks the same.

import * as THREE from 'three';
import { mulberry32, pick } from './utils.js';

export const PITCH = 52; // distance between road centre lines
export const ROAD_W = 12; // road width
export const GRID = 9; // road lines per axis
export const HALF = 234; // city half-size (road lines at -208..208)
export const LINES = [-208, -156, -104, -52, 0, 52, 104, 156, 208];

export function isRoad(x, z) {
  for (const l of LINES) {
    if (Math.abs(x - l) <= ROAD_W / 2) return true;
    if (Math.abs(z - l) <= ROAD_W / 2) return true;
  }
  return false;
}

export function nearestRoadLine(v) {
  let best = LINES[0];
  for (const l of LINES) if (Math.abs(v - l) < Math.abs(v - best)) best = l;
  return best;
}

// Random point on a road (for spawning cars / peds).
export function randomRoadPoint(rng) {
  const horizontal = rng() < 0.5;
  const line = pick(rng, LINES);
  const along = (rng() * 2 - 1) * 200;
  const side = (rng() < 0.5 ? -1 : 1) * 3;
  return horizontal ? { x: along, z: line + side } : { x: line + side, z: along };
}

function groundTexture() {
  const S = 2048;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const g = cv.getContext('2d');
  const world = (v) => ((v + 280) / 560) * S; // world [-280,280] -> px
  const px = (w) => (w / 560) * S;

  // base asphalt
  g.fillStyle = '#3a3f46';
  g.fillRect(0, 0, S, S);
  // sidewalks: light border around every block
  g.fillStyle = '#8d9299';
  for (let i = 0; i < GRID - 1; i++) {
    for (let j = 0; j < GRID - 1; j++) {
      const x0 = LINES[i] + ROAD_W / 2;
      const z0 = LINES[j] + ROAD_W / 2;
      g.fillRect(world(x0), world(z0), px(PITCH - ROAD_W), px(PITCH - ROAD_W));
    }
  }
  // block interiors: warm concrete
  g.fillStyle = '#b9ac93';
  for (let i = 0; i < GRID - 1; i++) {
    for (let j = 0; j < GRID - 1; j++) {
      const x0 = LINES[i] + ROAD_W / 2 + 3;
      const z0 = LINES[j] + ROAD_W / 2 + 3;
      g.fillRect(world(x0), world(z0), px(PITCH - ROAD_W - 6), px(PITCH - ROAD_W - 6));
    }
  }
  // lane dashes
  g.fillStyle = '#e8d44d';
  for (const l of LINES) {
    for (let d = -220; d < 220; d += 16) {
      g.fillRect(world(l) - 1.5, world(d), 3, px(8));
      g.fillRect(world(d), world(l) - 1.5, px(8), 3);
    }
  }
  // crosswalks at intersections
  g.fillStyle = '#e8e8e8';
  for (const lx of LINES) {
    for (const lz of LINES) {
      for (let k = -2; k <= 2; k++) {
        g.fillRect(world(lx + k * 2.2) - 1, world(lz - ROAD_W / 2), 2, px(ROAD_W));
        g.fillRect(world(lx - ROAD_W / 2), world(lz + k * 2.2) - 1, px(ROAD_W), 2);
      }
    }
  }
  // beach strip (south edge, z > 234) and ocean beyond
  g.fillStyle = '#e6d3a3';
  g.fillRect(0, world(234), S, world(262) - world(234));
  g.fillStyle = '#2e7fb8';
  g.fillRect(0, world(262), S, S - world(262));
  g.fillStyle = 'rgba(255,255,255,0.35)';
  for (let y = world(266); y < S; y += 26) {
    for (let x = (y % 52); x < S; x += 90) {
      g.fillRect(x, y, 46, 3);
    }
  }
  // boardwalk line along the beach
  g.fillStyle = '#a9805a';
  g.fillRect(0, world(232), S, px(3));

  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function windowTexture() {
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = '#cfc8b8';
  g.fillRect(0, 0, 128, 256);
  for (let y = 12; y < 244; y += 24) {
    for (let x = 10; x < 118; x += 22) {
      const lit = Math.random() < 0.28;
      g.fillStyle = lit ? '#ffd97a' : '#2c3e55';
      g.fillRect(x, y, 14, 16);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildCity(scene) {
  const rng = mulberry32(1337);
  const colliders = [];

  // ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 560),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 10);
  ground.receiveShadow = true;
  scene.add(ground);

  // buildings
  const winTex = windowTexture();
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const palette = [0xe8b4a0, 0xf2d492, 0xa8c8d8, 0xd8a0a8, 0xb8d8b0, 0xd8c8a8, 0xc8b8d8, 0x9fb8c8, 0xe8c898];
  const hotelColors = [0xff9d7a, 0xffd27a, 0x7ac8e8];
  for (let i = 0; i < GRID - 1; i++) {
    for (let j = 0; j < GRID - 1; j++) {
      const bx = LINES[i] + PITCH / 2;
      const bz = LINES[j] + PITCH / 2;
      const n = 1 + Math.floor(rng() * 2);
      for (let k = 0; k < n; k++) {
        const w = 12 + rng() * 14;
        const d = 12 + rng() * 14;
        const h = 9 + rng() * rng() * 42;
        const ox = (rng() - 0.5) * (PITCH - ROAD_W - w - 4);
        const oz = (rng() - 0.5) * (PITCH - ROAD_W - d - 4);
        const mat = new THREE.MeshStandardMaterial({
          map: winTex,
          color: pick(rng, palette),
          roughness: 0.85,
          metalness: 0.05,
        });
        const b = new THREE.Mesh(boxGeo, mat);
        b.scale.set(w, h, d);
        b.position.set(bx + ox, h / 2, bz + oz);
        b.castShadow = true;
        b.receiveShadow = true;
        scene.add(b);
        colliders.push({
          x1: bx + ox - w / 2, x2: bx + ox + w / 2,
          z1: bz + oz - d / 2, z2: bz + oz + d / 2,
        });
        // rooftop box
        const roof = new THREE.Mesh(
          boxGeo,
          new THREE.MeshStandardMaterial({ color: 0x5a5148, roughness: 1 }),
        );
        roof.scale.set(w * 0.92, 0.8, d * 0.92);
        roof.position.set(bx + ox, h + 0.4, bz + oz);
        scene.add(roof);
      }
    }
  }
  // beachfront hotels (taller, brighter, along the boardwalk)
  for (let k = 0; k < 6; k++) {
    const x = -190 + k * 76;
    const h = 34 + rng() * 26;
    const mat = new THREE.MeshStandardMaterial({
      map: winTex, color: pick(rng, hotelColors), roughness: 0.8, metalness: 0.05,
    });
    const b = new THREE.Mesh(boxGeo, mat);
    b.scale.set(26, h, 18);
    b.position.set(x, h / 2, 214);
    b.castShadow = true;
    scene.add(b);
    colliders.push({ x1: x - 13, x2: x + 13, z1: 205, z2: 223 });
  }

  // palm trees along the beach + a few in blocks
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 7, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a6b45, roughness: 1 });
  const frondGeo = new THREE.ConeGeometry(2.6, 1.2, 6);
  const frondMat = new THREE.MeshStandardMaterial({ color: 0x2f8f4e, roughness: 0.9 });
  function palm(x, z) {
    const t = new THREE.Mesh(trunkGeo, trunkMat);
    t.position.set(x, 3.5, z);
    t.castShadow = true;
    scene.add(t);
    const f = new THREE.Mesh(frondGeo, frondMat);
    f.position.set(x, 7.4, z);
    f.scale.y = 0.7;
    scene.add(f);
    colliders.push({ x1: x - 0.6, x2: x + 0.6, z1: z - 0.6, z2: z + 0.6 });
  }
  for (let x = -220; x <= 220; x += 22) palm(x + (rng() - 0.5) * 8, 240 + rng() * 12);
  for (let k = 0; k < 14; k++) {
    const bx = LINES[Math.floor(rng() * (GRID - 1))] + PITCH / 2 + (rng() - 0.5) * 30;
    const bz = LINES[Math.floor(rng() * (GRID - 1))] + PITCH / 2 + (rng() - 0.5) * 30;
    if (!isRoad(bx, bz)) palm(bx, bz);
  }

  // streetlights at intersections
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 7, 6);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.6, metalness: 0.6 });
  const lampGeo = new THREE.SphereGeometry(0.45, 8, 6);
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xfff2b0, emissive: 0xffdf80, emissiveIntensity: 1.4,
  });
  for (const lx of LINES) {
    for (const lz of LINES) {
      if ((lx + lz) % 104 === 0) {
        const p = new THREE.Mesh(poleGeo, poleMat);
        p.position.set(lx + 7, 3.5, lz + 7);
        scene.add(p);
        const lamp = new THREE.Mesh(lampGeo, lampMat);
        lamp.position.set(lx + 7, 7.1, lz + 7);
        scene.add(lamp);
      }
    }
  }

  return { colliders };
}

// Push a circle (x, z, radius) out of building colliders. Returns corrected {x, z}.
export function collideCircle(colliders, x, z, r) {
  let nx = x;
  let nz = z;
  for (const c of colliders) {
    const cx = Math.max(c.x1, Math.min(nx, c.x2));
    const cz = Math.max(c.z1, Math.min(nz, c.z2));
    const dx = nx - cx;
    const dz = nz - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        nx = cx + (dx / d) * r;
        nz = cz + (dz / d) * r;
      } else {
        // centre inside the box: push out along the smallest penetration axis
        const pl = nx - c.x1 + r;
        const pr = c.x2 - nx + r;
        const pt = nz - c.z1 + r;
        const pb = c.z2 - nz + r;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) nx = c.x1 - r;
        else if (m === pr) nx = c.x2 + r;
        else if (m === pt) nz = c.z1 - r;
        else nz = c.z2 + r;
      }
    }
  }
  // world bounds
  nx = Math.max(-256, Math.min(256, nx));
  nz = Math.max(-256, Math.min(290, nz));
  return { x: nx, z: nz };
}
