// Traffic, pedestrians and the police of Solmar.
//
// Pure simulation on plain objects: positions, speeds and waypoints only.
// render3d.js turns these objects into meshes. No three.js, no DOM here,
// so Node tests can drive the simulation.

import { makeRng, clamp } from './rng.js';
import { CITY_HALF, STREET_STEP, nearestStreet, onRoad } from './city.js';

/** Paint jobs for traffic cars. */
export const CAR_COLORS = [0xc94f3d, 0x3d6ec9, 0xe0b13c, 0x5a5a5a, 0xe8e4da, 0x2f8f5b, 0x8a5fb0];

/** Special cars the missions care about. */
export const SPECIAL_CARS = {
  comet: { color: 0xffd34d, name: 'Comet' },
  phoenix: { color: 0x1a1a1a, name: 'Phoenix' },
};

/** How many police cars chase at each wanted level (index = stars). */
export const POLICE_CARS_PER_STAR = [0, 1, 2, 3, 3, 4];

/** Fresh traffic: cars driving the streets and cars parked in lots. */
export function createTraffic(city, rng, count = 16) {
  const cars = [];
  for (let i = 0; i < count; i++) {
    cars.push(makeTrafficCar(city, rng, i));
  }
  return cars;
}

function makeTrafficCar(city, rng, id) {
  const alongX = rng.chance(0.5);
  const street = rng.pick(city.streetsX);
  const pos = rng.range(-CITY_HALF + 10, CITY_HALF - 10);
  const dir = rng.chance(0.5) ? 1 : -1;
  return {
    id,
    kind: 'traffic',
    color: rng.pick(CAR_COLORS),
    x: alongX ? pos : street,
    z: alongX ? street : pos,
    angle: alongX ? (dir > 0 ? 0 : Math.PI) : dir > 0 ? Math.PI / 2 : -Math.PI / 2,
    speed: rng.range(7, 11),
    alongX,
    dir,
    // A parked car waiting in a lot, stealable.
    parked: false,
  };
}

/** Parked cars in the parking lots, ready to be stolen. */
export function createParkedCars(city) {
  const cars = [];
  let id = 1000;
  for (const lot of city.parkingLots) {
    for (const spot of lot.spots) {
      if (!spot.occupied) continue;
      cars.push({
        id: id++,
        kind: 'parked',
        color: CAR_COLORS[id % CAR_COLORS.length],
        x: spot.x,
        z: spot.z,
        angle: 0,
        speed: 0,
        parked: true,
      });
    }
  }
  // The two mission cars, parked where their missions expect them.
  cars.push({
    id: 2001, kind: 'comet', color: SPECIAL_CARS.comet.color,
    x: 0, z: -80, angle: Math.PI / 2, speed: 0, parked: true,
  });
  cars.push({
    id: 2002, kind: 'phoenix', color: SPECIAL_CARS.phoenix.color,
    x: 80, z: -120, angle: 0, speed: 0, parked: true,
  });
  return cars;
}

/** Pedestrians strolling the sidewalks. */
export function createPedestrians(city, rng, count = 22) {
  const peds = [];
  for (let i = 0; i < count; i++) {
    const street = rng.pick(city.streetsX);
    const pos = rng.range(-CITY_HALF + 10, CITY_HALF - 10);
    const alongX = rng.chance(0.5);
    peds.push({
      id: i,
      x: alongX ? pos : street + 6,
      z: alongX ? street + 6 : pos,
      angle: rng.range(0, Math.PI * 2),
      speed: rng.range(1, 2),
      color: rng.pick([0xd96a6a, 0x6a8fd9, 0x7ac98a, 0xd9b36a, 0x9a7ad9, 0x5bc8c8]),
      state: 'walk', // walk | flee | down
      fleeTimer: 0,
    });
  }
  return peds;
}

/** Fresh police state: no cars, no cops, no helicopter yet. */
export function createPolice() {
  return {
    cars: [],
    cops: [],
    heli: null,
    roadblocks: [],
    bustTimer: 0,
    nextCarId: 1,
    nextCopId: 1,
  };
}

/** Move traffic cars along the streets, turning at intersections. */
export function updateTraffic(cars, city, dt, rng) {
  for (const car of cars) {
    if (car.parked) continue;
    if (car.alongX) {
      car.x += car.dir * car.speed * dt;
      car.angle = car.dir > 0 ? 0 : Math.PI;
    } else {
      car.z += car.dir * car.speed * dt;
      car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    // At an intersection, sometimes turn; at the city edge, turn around.
    const atCross = Math.abs(car.x - nearestStreet(car.x)) < 1.2 && Math.abs(car.z - nearestStreet(car.z)) < 1.2;
    const out = Math.abs(car.x) > CITY_HALF - 6 || Math.abs(car.z) > CITY_HALF - 6;
    if (out) {
      car.dir *= -1;
    } else if (atCross && rng.chance(0.02)) {
      car.alongX = !car.alongX;
      car.dir = rng.chance(0.5) ? 1 : -1;
    }
    car.x = clamp(car.x, -CITY_HALF + 4, CITY_HALF - 4);
    car.z = clamp(car.z, -CITY_HALF + 4, CITY_HALF - 4);
  }
}

/** Walk pedestrians; they flee when a car comes close. */
export function updatePedestrians(peds, city, dt, player, rng) {
  for (const ped of peds) {
    if (ped.state === 'down') continue;
    const dx = ped.x - player.x;
    const dz = ped.z - player.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (ped.state === 'walk' && d < 9 && !player.onFoot) {
      ped.state = 'flee';
      ped.fleeTimer = 2.5;
      ped.angle = Math.atan2(dx, dz);
    }
    if (ped.state === 'flee') {
      ped.fleeTimer -= dt;
      ped.x += Math.sin(ped.angle) * 4.5 * dt;
      ped.z += Math.cos(ped.angle) * 4.5 * dt;
      if (ped.fleeTimer <= 0) ped.state = 'walk';
    } else {
      ped.x += Math.sin(ped.angle) * ped.speed * dt;
      ped.z += Math.cos(ped.angle) * ped.speed * dt;
      if (rng.chance(0.004)) ped.angle = rng.range(0, Math.PI * 2);
    }
    // Keep pedestrians inside the city and off the beach.
    ped.x = clamp(ped.x, -CITY_HALF + 4, CITY_HALF - 4);
    ped.z = clamp(ped.z, -CITY_HALF + 4, CITY_HALF - 34);
  }
}

/** Distance between two points. */
function dist(ax, az, bx, bz) {
  return Math.sqrt((ax - bx) * (ax - bx) + (az - bz) * (az - bz));
}

/**
 * Run the police for one step. Spawns chasers, a helicopter and roadblocks
 * as the wanted level rises, and clears them as it falls. Returns events:
 *   { type: 'busted' } — a foot cop held the player long enough
 *   { type: 'ram', damage } — a police car hit the player's car
 */
export function updatePolice(police, world, city, dt, rng) {
  const events = [];
  const stars = Math.floor(world.heat / 20);
  const px = world.player.x;
  const pz = world.player.z;

  // --- police cars: one per star, up to the table's count.
  const want = POLICE_CARS_PER_STAR[Math.min(stars, 5)];
  while (police.cars.length < want) {
    const edge = rng.pick([
      { x: px + rng.range(60, 90), z: pz + rng.range(-20, 20) },
      { x: px - rng.range(60, 90), z: pz + rng.range(-20, 20) },
      { x: px + rng.range(-20, 20), z: pz + rng.range(60, 90) },
      { x: px + rng.range(-20, 20), z: pz - rng.range(60, 90) },
    ]);
    police.cars.push({
      id: police.nextCarId++,
      x: clamp(edge.x, -CITY_HALF + 4, CITY_HALF - 4),
      z: clamp(edge.z, -CITY_HALF + 4, CITY_HALF - 34),
      angle: 0,
      speed: 0,
      color: 0x1c2f4a,
    });
  }
  while (police.cars.length > want) police.cars.pop();
  for (const car of police.cars) {
    const d = dist(car.x, car.z, px, pz);
    const target = Math.atan2(px - car.x, pz - car.z);
    let diff = target - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    car.angle += clamp(diff, -2.4 * dt, 2.4 * dt);
    const wantSpeed = d > 6 ? 24 : 10;
    car.speed += clamp(wantSpeed - car.speed, -30 * dt, 18 * dt);
    // Already on top of the player: hold position instead of driving off
    // in a default direction (atan2(0, 0) would send the car north).
    if (d > 1) {
      car.x += Math.sin(car.angle) * car.speed * dt;
      car.z += Math.cos(car.angle) * car.speed * dt;
    }
    if (!world.player.onFoot && d < 4.5 && car.speed > 8 && (car.ramCooldown ?? 0) <= 0) {
      events.push({ type: 'ram', damage: 12 });
      car.speed *= 0.2;
      car.ramCooldown = 2; // one hit every two seconds at most
    }
    if ((car.ramCooldown ?? 0) > 0) car.ramCooldown -= dt;
  }

  // --- foot cops: chase the player on foot, bust on contact.
  const wantCops = stars >= 1 && world.player.onFoot ? Math.min(stars, 3) : 0;
  while (police.cops.length < wantCops) {
    police.cops.push({
      id: police.nextCopId++,
      x: clamp(px + rng.range(-40, 40), -CITY_HALF + 4, CITY_HALF - 4),
      z: clamp(pz + rng.range(-40, 40), -CITY_HALF + 4, CITY_HALF - 34),
      angle: 0,
      speed: 5.2,
    });
  }
  while (police.cops.length > wantCops) police.cops.pop();
  let touching = false;
  for (const cop of police.cops) {
    const d = dist(cop.x, cop.z, px, pz);
    const target = Math.atan2(px - cop.x, pz - cop.z);
    cop.angle = target;
    // On top of the player already: hold them, don't walk away.
    if (d > 0.5) {
      cop.x += Math.sin(target) * cop.speed * dt;
      cop.z += Math.cos(target) * cop.speed * dt;
    }
    if (d < 2.2) touching = true;
  }
  if (touching) {
    police.bustTimer += dt;
    if (police.bustTimer > 1.2) {
      police.bustTimer = 0;
      events.push({ type: 'busted' });
    }
  } else {
    police.bustTimer = 0;
  }

  // --- helicopter from 3 stars: hovers over the player.
  if (stars >= 3 && !police.heli) {
    police.heli = { x: px, z: pz, y: 20, angle: 0 };
  }
  if (stars < 3) police.heli = null;
  if (police.heli) {
    // Hover a little ahead of the player, so the chase camera can see it.
    const hx = px + Math.sin(world.player.angle) * 55;
    const hz = pz + Math.cos(world.player.angle) * 55;
    police.heli.x += (hx - police.heli.x) * Math.min(1, dt * 1.4);
    police.heli.z += (hz - police.heli.z) * Math.min(1, dt * 1.4);
    police.heli.angle += dt * 1.5;
  }

  // --- roadblocks from 3 stars: two police cars across the road ahead.
  if (stars >= 3 && police.roadblocks.length === 0) {
    const aheadX = px + Math.sin(world.player.angle) * 110;
    const aheadZ = pz + Math.cos(world.player.angle) * 110;
    const sx = onRoad(aheadX, aheadZ) ? nearestStreet(aheadX) : aheadX;
    police.roadblocks.push(
      { x: sx - 5, z: aheadZ, angle: Math.PI / 2, color: 0x1c2f4a },
      { x: sx + 5, z: aheadZ, angle: Math.PI / 2, color: 0x1c2f4a },
    );
  }
  if (stars < 3) police.roadblocks = [];
  return events;
}
