// The city of Solmar: pure data, generated from a seed.
//
// generateCity(seed) returns plain objects only — no three.js, no DOM — so
// the same code runs in the browser and in Node tests. The renderer turns
// this data into meshes; the simulation drives on it (streets for traffic,
// building footprints for collisions, landmarks for missions and shops).
//
// Layout: a square city 400 units across, streets every 40 units, blocks
// of buildings between them, a sandy beach and water along the south edge.

import { makeRng } from './rng.js';

export const CITY_HALF = 200;
export const STREET_STEP = 40;
export const STREET_WIDTH = 8;

/** Warm, sun-soaked palette for the buildings, picked per building. */
export const BUILDING_COLORS = [
  0xe8dcc3, 0xd9b48a, 0xc98f6b, 0xe5c9a8, 0xb7c4b1,
  0xd6a06a, 0xead9b8, 0xc47f5a, 0x9fb8ad, 0xe0b184,
];

/** Fixed landmark spots, on street corners so the player can reach them. */
export const LANDMARKS = {
  safehouseA: { x: -160, z: -160, label: 'Safehouse — Rex\u2019s flat' },
  safehouseB: { x: 160, z: 120, label: 'Safehouse — Marina flat' },
  sprayShop: { x: -120, z: 120, label: 'Spray Shop' },
  gunShop: { x: 120, z: -120, label: 'Gun Shop' },
  garage: { x: 0, z: 160, label: 'Garage' },
};

/**
 * Build the city for `seed`. Deterministic: the same seed always returns
 * the same streets, buildings, parks and pickups.
 */
export function generateCity(seed) {
  const rng = makeRng(seed);
  const streetsX = [];
  const streetsZ = [];
  for (let v = -CITY_HALF; v <= CITY_HALF; v += STREET_STEP) {
    streetsX.push(v);
    streetsZ.push(v);
  }

  const buildings = [];
  const parks = [];
  const parkingLots = [];
  // Walk the blocks between the streets. A block spans [x0, x1] x [z0, z1].
  for (let bx = 0; bx < streetsX.length - 1; bx++) {
    for (let bz = 0; bz < streetsZ.length - 1; bz++) {
      const x0 = streetsX[bx] + STREET_WIDTH / 2;
      const x1 = streetsX[bx + 1] - STREET_WIDTH / 2;
      const z0 = streetsZ[bz] + STREET_WIDTH / 2;
      const z1 = streetsZ[bz + 1] - STREET_WIDTH / 2;
      // The southernmost row is the beach, not buildings.
      if (z1 > CITY_HALF - 30) continue;
      const roll = rng.next();
      if (roll < 0.12) {
        parks.push(makePark(rng, x0, x1, z0, z1));
      } else if (roll < 0.22) {
        parkingLots.push({ x0, x1, z0, z1, spots: makeParkingSpots(rng, x0, x1, z0, z1) });
        buildings.push(...makeBlockBuildings(rng, x0, x1, z0, z1, 1));
      } else {
        buildings.push(...makeBlockBuildings(rng, x0, x1, z0, z1, rng.int(1, 3)));
      }
    }
  }

  const pickups = makePickups(rng, buildings);
  return {
    seed,
    half: CITY_HALF,
    streetsX,
    streetsZ,
    streetWidth: STREET_WIDTH,
    buildings,
    parks,
    parkingLots,
    beach: { z0: CITY_HALF - 30, z1: CITY_HALF, sand: 0xe6d3a3 },
    water: { z0: CITY_HALF, z1: CITY_HALF + 140 },
    landmarks: LANDMARKS,
    pickups,
  };
}

/** One park: a green block with trees placed by the rng. */
function makePark(rng, x0, x1, z0, z1) {
  const trees = [];
  const count = rng.int(4, 9);
  for (let i = 0; i < count; i++) {
    trees.push({
      x: rng.range(x0 + 3, x1 - 3),
      z: rng.range(z0 + 3, z1 - 3),
      size: rng.range(1.2, 2.4),
    });
  }
  return { x0, x1, z0, z1, trees };
}

/** Parking spots along the edges of a lot, some occupied by parked cars. */
function makeParkingSpots(rng, x0, x1, z0, z1) {
  const spots = [];
  const rows = 2;
  for (let r = 0; r < rows; r++) {
    const z = z0 + 6 + r * 10;
    for (let x = x0 + 4; x < x1 - 4; x += 6) {
      spots.push({ x, z, occupied: rng.chance(0.55), angle: 0 });
    }
  }
  return spots;
}

/** 1-3 buildings inside one block, with a gap between them. */
function makeBlockBuildings(rng, x0, x1, z0, z1, count) {
  const out = [];
  const w = (x1 - x0) / count;
  for (let i = 0; i < count; i++) {
    const bx0 = x0 + i * w + 2;
    const bx1 = x0 + (i + 1) * w - 2;
    const bz0 = z0 + 2;
    const bz1 = z1 - 2;
    const cx = (bx0 + bx1) / 2;
    const cz = (bz0 + bz1) / 2;
    const bw = bx1 - bx0;
    const bd = bz1 - bz0;
    // Taller near the centre of town, shorter near the edges.
    const centre = 1 - (Math.abs(cx) + Math.abs(cz)) / (2 * CITY_HALF);
    const h = Math.round(rng.range(8, 14) + centre * rng.range(0, 26));
    out.push({
      x: cx,
      z: cz,
      w: bw,
      d: bd,
      h,
      color: rng.pick(BUILDING_COLORS),
      lit: rng.chance(0.7),
      windows: Math.max(2, Math.floor(h / 4)),
    });
  }
  return out;
}

/** Health and ammo pickups scattered on sidewalks, away from buildings. */
function makePickups(rng, buildings) {
  const pickups = [];
  const kinds = ['health', 'ammo'];
  for (let i = 0; i < 26; i++) {
    const x = rng.range(-CITY_HALF + 12, CITY_HALF - 12);
    const z = rng.range(-CITY_HALF + 12, CITY_HALF - 42);
    if (insideAnyBuilding(x, z, buildings)) continue;
    pickups.push({
      kind: kinds[i % 2],
      x,
      z,
      taken: false,
    });
  }
  return pickups;
}

function insideAnyBuilding(x, z, buildings) {
  for (const b of buildings) {
    if (Math.abs(x - b.x) < b.w / 2 + 1 && Math.abs(z - b.z) < b.d / 2 + 1) return true;
  }
  return false;
}

/** Is the point (x, z) inside any building footprint? Used for collisions. */
export function hitsBuilding(x, z, city) {
  for (const b of city.buildings) {
    if (Math.abs(x - b.x) < b.w / 2 && Math.abs(z - b.z) < b.d / 2) return b;
  }
  return null;
}

/** Push a point out of a building footprint, if it is inside one. */
export function pushOutOfBuildings(x, z, city) {
  const b = hitsBuilding(x, z, city);
  if (!b) return { x, z, hit: false };
  const dx = x - b.x;
  const dz = z - b.z;
  const px = b.w / 2 - Math.abs(dx);
  const pz = b.d / 2 - Math.abs(dz);
  if (px < pz) {
    return { x: b.x + (dx >= 0 ? b.w / 2 : -b.w / 2), z, hit: true };
  }
  return { x, z: b.z + (dz >= 0 ? b.d / 2 : -b.d / 2), hit: true };
}

/** The nearest street coordinate to `v` (streets run every STREET_STEP). */
export function nearestStreet(v) {
  return Math.round(v / STREET_STEP) * STREET_STEP;
}

/** Is (x, z) on a road (within half a street width of a street line)? */
export function onRoad(x, z) {
  const dx = Math.abs(x - nearestStreet(x));
  const dz = Math.abs(z - nearestStreet(z));
  return dx < STREET_WIDTH / 2 + 1 || dz < STREET_WIDTH / 2 + 1;
}
