// Logic tests for SOLMAR HEAT. Runs in Node, no browser: it drives the
// pure modules (rng, city, world, missions, entities) and checks the rules
// the game promises: deterministic cities, the wanted system, the nine
// missions and the police. Run: node test/logic-test.mjs

import { makeRng, clamp, lerp } from '../game/src/rng.js';
import {
  generateCity, hitsBuilding, pushOutOfBuildings, onRoad, CITY_HALF,
} from '../game/src/city.js';
import {
  createWorld, starsForHeat, addHeat, decayHeat, rankFor, canBuyWeapon,
  buyWeapon, buyUpgrade, nextUpgradeCost, applyDamage, heal, grantReward,
  applyBusted, saveShape, loadShape, START_DEBT,
} from '../game/src/world.js';
import {
  MISSIONS, TOTAL_REWARD, createMissionState, currentMission,
  startMission, updateMission, missionMarker, missionTimer,
} from '../game/src/missions.js';
import {
  createTraffic, createParkedCars, createPedestrians, createPolice,
  updateTraffic, updatePedestrians, updatePolice,
} from '../game/src/entities.js';

let passed = 0;
let failed = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) {
    passed++;
  } else {
    failed++;
    failures.push(`${name} ${detail}`);
    console.log(`FAIL: ${name} ${detail}`);
  }
}

function approx(a, b, eps = 1e-9) {
  return Math.abs(a - b) < eps;
}

// ---------------------------------------------------------------- rng

{
  const a = makeRng(7);
  const b = makeRng(7);
  const c = makeRng(8);
  check('rng: same seed, same stream', a.next() === b.next() && a.next() === b.next());
  check('rng: different seed, different stream', makeRng(7).next() !== c.next());
  check('rng: range stays inside bounds', (() => {
    const r = makeRng(3);
    for (let i = 0; i < 200; i++) {
      const v = r.range(-5, 5);
      if (v < -5 || v >= 5) return false;
    }
    return true;
  })());
  check('rng: int stays inside bounds', (() => {
    const r = makeRng(4);
    for (let i = 0; i < 200; i++) {
      const v = r.int(1, 6);
      if (v < 1 || v > 6) return false;
    }
    return true;
  })());
  check('rng: shuffle keeps every element', (() => {
    const r = makeRng(5);
    const out = r.shuffle([1, 2, 3, 4, 5]);
    return out.length === 5 && out.slice().sort().join(',') === '1,2,3,4,5';
  })());
  check('clamp', clamp(5, 0, 3) === 3 && clamp(-1, 0, 3) === 0 && clamp(2, 0, 3) === 2);
  check('lerp', approx(lerp(0, 10, 0.25), 2.5));
}

// ---------------------------------------------------------------- city

{
  const cityA = generateCity(7);
  const cityB = generateCity(7);
  const cityC = generateCity(8);
  check('city: same seed, same building count', cityA.buildings.length === cityB.buildings.length);
  check('city: same seed, same first building', JSON.stringify(cityA.buildings[0]) === JSON.stringify(cityB.buildings[0]));
  check('city: different seed, different city', JSON.stringify(cityA.buildings) !== JSON.stringify(cityC.buildings));
  check('city: has buildings', cityA.buildings.length > 100);
  check('city: buildings inside the city', cityA.buildings.every((b) => Math.abs(b.x) < CITY_HALF && Math.abs(b.z) < CITY_HALF));
  check('city: buildings have positive size', cityA.buildings.every((b) => b.w > 0 && b.d > 0 && b.h >= 8));
  check('city: has parks and parking lots', cityA.parks.length > 0 && cityA.parkingLots.length > 0);
  check('city: beach sits on the south edge', cityA.beach.z1 === CITY_HALF && cityA.beach.z0 < cityA.beach.z1);
  check('city: landmarks present', ['safehouseA', 'safehouseB', 'sprayShop', 'gunShop', 'garage'].every((k) => cityA.landmarks[k]));
  check('city: pickups exist', cityA.pickups.length > 10);
  check('city: hitsBuilding finds a building', hitsBuilding(cityA.buildings[0].x, cityA.buildings[0].z, cityA) !== null);
  check('city: hitsBuilding misses open road', hitsBuilding(0, 0, cityA) === null);
  const pushed = pushOutOfBuildings(cityA.buildings[0].x, cityA.buildings[0].z, cityA);
  check('city: pushOutOfBuildings escapes the footprint', pushed.hit && hitsBuilding(pushed.x, pushed.z, cityA) === null);
  check('city: onRoad is true on a street', onRoad(0, 40) === true);
  check('city: onRoad is false mid-block', onRoad(20, 20) === false);
}

// ---------------------------------------------------------------- world / wanted

{
  check('wanted: 0 heat is 0 stars', starsForHeat(0) === 0);
  check('wanted: 19 heat is 0 stars', starsForHeat(19) === 0);
  check('wanted: 20 heat is 1 star', starsForHeat(20) === 1);
  check('wanted: 59 heat is 2 stars', starsForHeat(59) === 2);
  check('wanted: 60 heat is 3 stars', starsForHeat(60) === 3);
  check('wanted: 100 heat is 5 stars', starsForHeat(100) === 5);
  const w = createWorld(7);
  check('world: starts with $200 and $5,000 debt', w.money === 200 && w.debt === START_DEBT);
  addHeat(w, 25);
  check('world: addHeat raises stars', w.heat === 25);
  decayHeat(w, 10, false);
  check('world: decayHeat cools slowly in the open', w.heat < 25 && w.heat > 0);
  decayHeat(w, 10, true);
  check('world: hiding cools to zero', w.heat === 0);
  check('rank: 0 respect is Nobody', rankFor(0).name === 'Nobody');
  check('rank: 50 respect is Hustler', rankFor(50).name === 'Hustler');
  check('rank: 150 respect is Operator', rankFor(150).name === 'Operator');
  check('rank: 300 respect is King of Solmar', rankFor(300).name === 'King of Solmar');
  const rich = createWorld(7);
  rich.money = 5000;
  check('weapons: shotgun locked below rank 50', canBuyWeapon(rich, 'shotgun') === false);
  rich.respect = 60;
  check('weapons: shotgun buyable at rank 50 with money', canBuyWeapon(rich, 'shotgun') === true);
  check('weapons: buyWeapon deducts and owns', buyWeapon(rich, 'shotgun') && rich.weapons.shotgun.owned && rich.money === 4600);
  check('weapons: cannot buy twice', buyWeapon(rich, 'shotgun') === false);
  check('upgrades: first engine level costs 300', nextUpgradeCost(rich, 'engine') === 300);
  check('upgrades: buyUpgrade works', buyUpgrade(rich, 'engine') && rich.upgrades.engine === 1 && rich.money === 4300);
  check('upgrades: third level costs 1000', nextUpgradeCost(rich, 'engine') === 600);
  buyUpgrade(rich, 'engine');
  buyUpgrade(rich, 'engine');
  check('upgrades: maxed track has no next cost', nextUpgradeCost(rich, 'engine') === null);
  const hurt = createWorld(7);
  check('damage: applyDamage lowers health', applyDamage(hurt, 30) === 'alive' && hurt.health === 70);
  heal(hurt, 50);
  check('damage: heal caps at 100', hurt.health === 100);
  check('damage: lethal hit wastes the player', applyDamage(hurt, 200) === 'wasted' && hurt.wasted);
  const paid = createWorld(7);
  grantReward(paid, 400, 15);
  check('reward: money and respect grow', paid.money === 600 && paid.respect === 15);
  const busted = createWorld(7);
  busted.money = 1000;
  busted.heat = 80;
  applyBusted(busted);
  check('busted: heat cleared, money kept minus a little', busted.heat === 0 && busted.money === 950 && busted.health === 100);
  const saved = saveShape(createWorld(7));
  const loaded = loadShape(JSON.parse(JSON.stringify(saved)));
  check('save: round trip restores the world', loaded !== null && loaded.money === 200 && loaded.debt === START_DEBT);
  check('save: bad shape is rejected', loadShape({ v: 99 }) === null && loadShape(null) === null);
}

// ---------------------------------------------------------------- missions

{
  check('missions: there are nine', MISSIONS.length === 9);
  check('missions: rewards add up to $6,000', TOTAL_REWARD === 6000);
  check('missions: rewards beat the $5,000 debt', TOTAL_REWARD > START_DEBT);

  const city = generateCity(7);
  const driveCar = (world, x, z, kind = 'traffic') => {
    world.player.onFoot = false;
    world.player.car = { kind, color: 0xffffff };
    world.player.x = x;
    world.player.z = z;
  };
  const onFootAt = (world, x, z) => {
    world.player.onFoot = true;
    world.player.car = null;
    world.player.x = x;
    world.player.z = z;
  };

  // Mission 1: First Wheels — steal a car, bring it to the marker.
  {
    const w = createWorld(7);
    const s = createMissionState();
    startMission(s, w, city);
    check('m1: marker points at the drop-off', missionMarker(s, w, city).label === 'Drop-off');
    driveCar(w, 80, 80);
    const ev = updateMission(s, w, city, 0.1);
    check('m1: completes in a car at the marker', ev.some((e) => e.type === 'complete') && s.index === 1);
    check('m1: reward granted', w.money === 600 && w.respect === 15);
  }

  // Mission 2: The Package — pickup, deliver, and the timer fail path.
  {
    const w = createWorld(7);
    const s = createMissionState();
    s.index = 1;
    startMission(s, w, city);
    check('m2: timer starts at 90', missionTimer(s) === 90);
    onFootAt(w, -80, 40);
    let ev = updateMission(s, w, city, 0.1);
    check('m2: pickup gives progress', ev.some((e) => e.type === 'progress'));
    onFootAt(w, 120, -40);
    ev = updateMission(s, w, city, 0.1);
    check('m2: delivery completes', ev.some((e) => e.type === 'complete') && s.index === 2);
    // Fail path: fresh mission, let the timer run out.
    const w2 = createWorld(7);
    const s2 = createMissionState();
    s2.index = 1;
    startMission(s2, w2, city);
    const ev2 = updateMission(s2, w2, city, 91);
    check('m2: timer running out fails the mission', ev2.some((e) => e.type === 'fail') && s2.phase === 'idle');
  }

  // Mission 3: Heat Check — reach 3 stars, then cool off.
  {
    const w = createWorld(7);
    const s = createMissionState();
    s.index = 2;
    startMission(s, w, city);
    w.heat = 60;
    let ev = updateMission(s, w, city, 0.1);
    check('m3: 3 stars gives progress', ev.some((e) => e.type === 'progress'));
    w.heat = 5;
    ev = updateMission(s, w, city, 0.1);
    check('m3: cooling off completes', ev.some((e) => e.type === 'complete') && s.index === 3);
  }

  // Mission 4: Three Debts — visit all three debtors.
  {
    const w = createWorld(7);
    const s = createMissionState();
    s.index = 3;
    startMission(s, w, city);
    for (const d of [{ x: -120, z: 40 }, { x: 40, z: -120 }, { x: 120, z: 80 }]) {
      onFootAt(w, d.x, d.z);
      updateMission(s, w, city, 0.1);
    }
    check('m4: three debtors complete the mission', s.index === 4 && w.money === 900);
  }

  // Mission 5: Street Race — four checkpoints in order.
  {
    const w = createWorld(7);
    const s = createMissionState();
    s.index = 4;
    startMission(s, w, city);
    for (const c of [{ x: -120, z: -40 }, { x: 40, z: -120 }, { x: 120, z: 40 }, { x: -40, z: 120 }]) {
      driveCar(w, c.x, c.z);
      updateMission(s, w, city, 0.1);
    }
    check('m5: four checkpoints complete the race', s.index === 5 && w.money === 1000);
  }

  // Mission 6: The Big Score — steal the Comet, drop it off.
  {
    const w = createWorld(7);
    const s = createMissionState();
    s.index = 5;
    startMission(s, w, city);
    check('m6: marker points at the Comet first', missionMarker(s, w, city).label === 'Steal the gold Comet');
    driveCar(w, 0, -80, 'comet');
    let ev = updateMission(s, w, city, 0.1);
    check('m6: stealing the Comet gives progress', ev.some((e) => e.type === 'progress'));
    driveCar(w, -120, 120, 'comet');
    ev = updateMission(s, w, city, 0.1);
    check('m6: drop-off completes', ev.some((e) => e.type === 'complete') && s.index === 6);
  }

  // Mission 7: Air Support — survive 45s at 3 stars, reach the safehouse.
  {
    const w = createWorld(7);
    const s = createMissionState();
    s.index = 6;
    startMission(s, w, city);
    w.heat = 70;
    for (let i = 0; i < 45; i++) updateMission(s, w, city, 1);
    check('m7: surviving 45s gives progress', s.runtime.survive <= 0);
    onFootAt(w, city.landmarks.safehouseA.x, city.landmarks.safehouseA.z);
    const ev = updateMission(s, w, city, 0.1);
    check('m7: safehouse completes', ev.some((e) => e.type === 'complete') && s.index === 7);
  }

  // Mission 8: Garage Upgrade — buy, then a getaway drive.
  {
    const w = createWorld(7);
    w.money = 1000;
    const s = createMissionState();
    s.index = 7;
    startMission(s, w, city);
    buyUpgrade(w, 'engine');
    let ev = updateMission(s, w, city, 0.1);
    check('m8: buying an upgrade gives progress', ev.some((e) => e.type === 'progress'));
    driveCar(w, -80, -80);
    ev = updateMission(s, w, city, 0.1);
    check('m8: getaway completes', ev.some((e) => e.type === 'complete') && s.index === 8);
  }

  // Mission 9: The Final Debt — steal the Phoenix, escape north, debt paid.
  {
    const w = createWorld(7);
    const s = createMissionState();
    s.index = 8;
    startMission(s, w, city);
    driveCar(w, 80, -120, 'phoenix');
    let ev = updateMission(s, w, city, 0.1);
    check('m9: stealing the Phoenix gives progress', ev.some((e) => e.type === 'progress'));
    driveCar(w, 0, -196, 'phoenix');
    ev = updateMission(s, w, city, 0.1);
    check('m9: escape completes the story', ev.some((e) => e.type === 'complete'));
    check('m9: debt is paid and story complete', w.debt === 0 && w.storyComplete);
    check('m9: no mission remains', currentMission(s) === null);
  }
}

// ---------------------------------------------------------------- entities

{
  const city = generateCity(7);
  const rng = makeRng(7);
  const traffic = createTraffic(city, rng, 16);
  check('entities: traffic created', traffic.length === 16);
  const before = traffic.map((c) => [c.x, c.z]);
  updateTraffic(traffic, city, 1, rng);
  check('entities: traffic moves', traffic.some((c, i) => c.x !== before[i][0] || c.z !== before[i][1]));
  check('entities: traffic stays in the city', traffic.every((c) => Math.abs(c.x) <= CITY_HALF && Math.abs(c.z) <= CITY_HALF));
  const parked = createParkedCars(city);
  check('entities: parked cars include the Comet and the Phoenix', parked.some((c) => c.kind === 'comet') && parked.some((c) => c.kind === 'phoenix'));
  const peds = createPedestrians(city, rng, 10);
  check('entities: pedestrians created', peds.length === 10);
  updatePedestrians(peds, city, 1, { x: 0, z: 0, onFoot: true }, rng);
  check('entities: pedestrians stay in the city', peds.every((p) => Math.abs(p.x) <= CITY_HALF && Math.abs(p.z) <= CITY_HALF));

  const w = createWorld(7);
  const police = createPolice();
  w.heat = 20;
  let ev = updatePolice(police, w, city, 0.1, rng);
  check('police: 1 star spawns 1 police car', police.cars.length === 1);
  check('police: 1 star spawns a foot cop on foot', police.cops.length === 1);
  w.heat = 60;
  ev = updatePolice(police, w, city, 0.1, rng);
  check('police: 3 stars spawn 3 police cars', police.cars.length === 3);
  check('police: 3 stars bring the helicopter', police.heli !== null);
  check('police: 3 stars set a roadblock', police.roadblocks.length === 2);
  w.heat = 0;
  ev = updatePolice(police, w, city, 0.1, rng);
  check('police: 0 stars clear the helicopter and roadblock', police.heli === null && police.roadblocks.length === 0);

  // Busted: a cop holds the player for over a second.
  const w2 = createWorld(7);
  w2.heat = 20;
  const p2 = createPolice();
  updatePolice(p2, w2, city, 0.1, rng);
  p2.cops[0].x = w2.player.x;
  p2.cops[0].z = w2.player.z;
  let busted = false;
  for (let i = 0; i < 4; i++) {
    const evs = updatePolice(p2, w2, city, 0.5, rng);
    if (evs.some((e) => e.type === 'busted')) busted = true;
  }
  check('police: a cop holding the player busts them', busted);
}

// ---------------------------------------------------------------- summary

console.log(`\nlogic tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('failures:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
