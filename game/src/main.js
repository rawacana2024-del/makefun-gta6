// SOLMAR HEAT — main entry point.
//
// Wires the pure modules (city, world, missions, entities) to the 3D view
// and the audio synth, reads the keyboard and mouse, runs the loop, and
// draws the HUD and the minimap. Browser only.

import * as THREE from 'three';
import { generateCity, pushOutOfBuildings, CITY_HALF } from './city.js';
import {
  createWorld, wantedLevel, addHeat, decayHeat, rankFor, WEAPONS,
  WEAPON_ORDER, canBuyWeapon, buyWeapon, buyAmmo, buyUpgrade,
  nextUpgradeCost, applyDamage, heal, carTopSpeed, applyBusted,
  clearRunEnd, UPGRADE_NAMES,
} from './world.js';
import {
  MISSIONS, createMissionState, currentMission, startMission,
  updateMission, missionMarker, missionTimer,
} from './missions.js';
import {
  createTraffic, createParkedCars, createPedestrians, createPolice,
  updateTraffic, updatePedestrians, updatePolice,
} from './entities.js';
import { createView, updateView, resizeView } from './render3d.js';
import { createAudio, RADIO_STATIONS } from './audio.js';
import { saveGame, loadGame, hasSave } from './save.js';
import { applyScene } from './scenes.js';
import { clamp } from './rng.js';

const $ = (id) => document.getElementById(id);

/** The whole game, in one object. */
const game = {
  world: null,
  city: null,
  traffic: [],
  parked: [],
  peds: [],
  police: null,
  missionState: null,
  view: null,
  audio: null,
  running: false,
  paused: false,
  cameraMode: 'chase',
  keys: {},
  mouse: { x: 0, y: 0, down: false },
  shootCooldown: 0,
  toastTimer: null,
  clock: 0,
};

boot();

function boot() {
  const params = new URLSearchParams(window.location.search);
  const seed = Number.parseInt(params.get('seed') || '7', 10) || 7;
  const scene = params.get('scene');

  game.city = generateCity(seed);
  game.world = createWorld(seed);
  // One persistent random stream per system, so the traffic, the
  // pedestrians and the police keep making fresh choices every frame.
  game.rngs = {
    traffic: makeSeededRng(seed + 1),
    peds: makeSeededRng(seed + 2),
    police: makeSeededRng(seed + 3),
  };
  game.traffic = createTraffic(game.city, game.rngs.traffic);
  game.parked = createParkedCars(game.city);
  game.peds = createPedestrians(game.city, game.rngs.peds);
  game.police = createPolice();
  game.missionState = createMissionState();
  game.audio = createAudio();

  const canvas = $('game-canvas');
  try {
    game.view = createView(canvas, game.city);
  } catch (err) {
    $('overlay-start').innerHTML = `<h1>SOLMAR HEAT</h1><p>WebGL is not available in this browser, so the game cannot start.</p>`;
    return;
  }
  resizeView(game.view);
  window.addEventListener('resize', () => resizeView(game.view));

  bindInput();

  if (scene) {
    game.cameraMode = applyScene(scene, game);
    startGame(true);
    if (scene === 'title') {
      // The title screen stays up over the orbiting city.
      game.running = false;
      $('btn-continue').style.display = hasSave() ? 'inline-block' : 'none';
      showOverlay('overlay-start');
    }
  } else {
    showOverlay('overlay-start');
    $('btn-continue').style.display = hasSave() ? 'inline-block' : 'none';
  }

  requestAnimationFrame(loop);
}

/** A small seeded stream with the same shape as makeRng (rng.js). */
function makeSeededRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => items[Math.floor(next() * items.length)],
    chance: (p) => next() < p,
    shuffle: (items) => items.slice(),
  };
}

function bindInput() {
  window.addEventListener('keydown', (e) => {
    game.keys[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (e.code === 'KeyM') toggleMute();
    if (e.code === 'KeyR') cycleRadio();
    if (e.code === 'KeyV') doSave();
    if (e.code === 'KeyE') interact();
    if (e.code === 'KeyF') punch();
    if (e.code === 'KeyQ') cycleWeapon();
    if (e.code === 'Digit1') setWeapon(0);
    if (e.code === 'Digit2') setWeapon(1);
    if (e.code === 'Digit3') setWeapon(2);
    if (e.code === 'Digit4') setWeapon(3);
    if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
    game.audio.resume();
  });
  window.addEventListener('keyup', (e) => {
    game.keys[e.code] = false;
  });
  window.addEventListener('mousemove', (e) => {
    game.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    game.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  });
  window.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      game.mouse.down = true;
      game.audio.resume();
    }
  });
  window.addEventListener('mouseup', () => {
    game.mouse.down = false;
  });
  $('btn-start').addEventListener('click', () => startGame(true));
  $('btn-continue').addEventListener('click', () => startGame(false));
  $('btn-resume').addEventListener('click', togglePause);
  $('btn-retry-wasted').addEventListener('click', () => respawn('wasted'));
  $('btn-retry-busted').addEventListener('click', () => respawn('busted'));
  $('btn-again').addEventListener('click', () => {
    game.world = createWorld(game.world.seed);
    game.missionState = createMissionState();
    startGame(true);
  });
}

function showOverlay(id) {
  for (const el of document.querySelectorAll('.overlay')) el.classList.add('hidden');
  if (id) $(id).classList.remove('hidden');
}

function startGame(fresh) {
  if (!fresh) {
    const saved = loadGame();
    if (saved) game.world = saved;
  }
  showOverlay(null);
  game.running = true;
  game.paused = false;
  game.audio.resume();
  game.audio.startRadio(game.world.radioStation);
  if (game.missionState.phase === 'idle' && currentMission(game.missionState)) {
    startMission(game.missionState, game.world, game.city);
    showMissionBanner();
  }
}

function togglePause() {
  if (!game.running && !game.paused) return;
  game.paused = !game.paused;
  if (game.paused) {
    showOverlay('overlay-pause');
    game.audio.setSiren(false);
    game.audio.setRotor(false);
  } else {
    showOverlay(null);
  }
}

function toggleMute() {
  game.world.muted = !game.world.muted;
  game.audio.setMuted(game.world.muted);
  toast(game.world.muted ? 'Sound muted (M to unmute)' : 'Sound on');
}

function cycleRadio() {
  game.world.radioStation = (game.world.radioStation + 1) % RADIO_STATIONS.length;
  game.audio.startRadio(game.world.radioStation);
  toast(`Radio: ${RADIO_STATIONS[game.world.radioStation].name}`);
}

function cycleWeapon() {
  const owned = WEAPON_ORDER.filter((k) => game.world.weapons[k].owned);
  const i = owned.indexOf(game.world.currentWeapon);
  game.world.currentWeapon = owned[(i + 1) % owned.length];
}

function setWeapon(i) {
  const owned = WEAPON_ORDER.filter((k) => game.world.weapons[k].owned);
  if (owned[i]) game.world.currentWeapon = owned[i];
}

function doSave() {
  if (!game.running) return;
  if (saveGame(game.world)) toast('Progress saved (V)');
}

function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.remove('hidden');
  clearTimeout(game.toastTimer);
  game.toastTimer = setTimeout(() => el.classList.add('hidden'), 2600);
}

function showMissionBanner() {
  const mission = currentMission(game.missionState);
  if (!mission) return;
  $('mission-title').textContent = `${game.missionState.index + 1}. ${mission.name}`;
  $('mission-brief').textContent = mission.brief;
  $('mission-banner').classList.remove('hidden');
  setTimeout(() => $('mission-banner').classList.add('hidden'), 4200);
}

/** The E key: steal/exit a car, or use the shop or safehouse nearby. */
function interact() {
  if (!game.running || game.paused) return;
  const w = game.world;
  const p = w.player;
  if (!p.onFoot) {
    // Get out of the car: it stays parked where it stops.
    const car = p.car;
    const carX = p.x;
    const carZ = p.z;
    p.onFoot = true;
    p.car = null;
    p.x += Math.cos(p.angle) * 2.5;
    p.z -= Math.sin(p.angle) * 2.5;
    p.speed = 0;
    game.parked.push({ id: 3000 + Math.floor(Math.random() * 900), kind: car.kind, color: car.color, x: carX, z: carZ, angle: p.angle, speed: 0, parked: true });
    return;
  }
  // Steal the nearest car.
  const car = nearestCar(p.x, p.z, 3.8);
  if (car) {
    stealCar(car);
    return;
  }
  // Landmarks: safehouse, spray shop, gun shop, garage.
  const lm = game.city.landmarks;
  if (near(p, lm.safehouseA) || near(p, lm.safehouseB)) {
    doSave();
    heal(w, 100);
    toast('Safehouse — progress saved, health restored.');
    return;
  }
  if (near(p, lm.sprayShop)) {
    if (w.heat > 0) {
      const cost = Math.min(50, w.money);
      w.money -= cost;
      w.heat = 0;
      toast(`Spray Shop — new paint, clean record. ($${cost})`);
    } else {
      toast('Spray Shop — you are already clean.');
    }
    return;
  }
  if (near(p, lm.gunShop)) {
    const next = WEAPON_ORDER.find((k) => canBuyWeapon(w, k));
    if (next) {
      buyWeapon(w, next);
      game.world.currentWeapon = next;
      toast(`Bought the ${WEAPONS[next].name} for $${WEAPONS[next].price}.`);
    } else if (buyAmmo(w, w.currentWeapon)) {
      toast(`Bought ammo for the ${WEAPONS[w.currentWeapon].name}. ($40)`);
    } else {
      toast('Gun Shop — nothing you can afford right now.');
    }
    return;
  }
  if (near(p, lm.garage)) {
    const track = ['engine', 'armor', 'handling'].sort((a, b) => w.upgrades[a] - w.upgrades[b])[0];
    const cost = nextUpgradeCost(w, track);
    if (cost !== null && buyUpgrade(w, track)) {
      toast(`Garage — ${UPGRADE_NAMES[track]} upgraded to level ${w.upgrades[track]}. ($${cost})`);
    } else {
      toast('Garage — upgrades maxed out or not enough cash.');
    }
  }
}

function near(p, point, radius = 7) {
  return Math.hypot(p.x - point.x, p.z - point.z) < radius;
}

function nearestCar(x, z, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of [...game.traffic, ...game.parked]) {
    // A fast-moving traffic car cannot be grabbed.
    if (car.kind === 'traffic' && Math.abs(car.speed) > 2) continue;
    const d = Math.hypot(car.x - x, car.z - z);
    if (d < bestD) {
      best = car;
      bestD = d;
    }
  }
  return best;
}

function stealCar(car) {
  const w = game.world;
  game.traffic = game.traffic.filter((c) => c !== car);
  game.parked = game.parked.filter((c) => c !== car);
  w.player.onFoot = false;
  w.player.car = { kind: car.kind, color: car.color };
  w.player.angle = car.angle;
  w.player.speed = 0;
  w.carsStolen += 1;
  addHeat(w, 20);
  toast(car.kind === 'comet' ? 'The gold Comet is yours!' : car.kind === 'phoenix' ? 'The black Phoenix is yours!' : 'Car stolen — the cops noticed.');
}

/** F: punch the nearest person in front of you. */
function punch() {
  if (!game.running || game.paused || !game.world.player.onFoot) return;
  const p = game.world.player;
  const target = nearestPerson(p.x, p.z, p.angle, 2.6);
  if (!target) return;
  if (game.peds.includes(target)) {
    target.state = 'down';
    addHeat(game.world, 8);
  } else {
    game.police.cops = game.police.cops.filter((c) => c !== target);
    game.world.kills += 1;
    addHeat(game.world, 12);
  }
  game.audio.shot('fists');
}

function nearestPerson(x, z, angle, maxDist) {
  let best = null;
  let bestD = maxDist;
  const fx = Math.sin(angle);
  const fz = Math.cos(angle);
  const consider = (ref) => {
    const dx = ref.x - x;
    const dz = ref.z - z;
    const d = Math.hypot(dx, dz);
    if (d < bestD && (dx * fx + dz * fz) / Math.max(d, 0.01) > 0.3) {
      best = ref;
      bestD = d;
    }
  };
  for (const ped of game.peds) {
    if (ped.state !== 'down') consider(ped);
  }
  for (const cop of game.police.cops) consider(cop);
  return best;
}

/** Shoot toward the mouse position on the ground. */
function shoot() {
  const w = game.world;
  if (game.shootCooldown > 0) return;
  const def = WEAPONS[w.currentWeapon];
  game.shootCooldown = def.rate;
  const state = w.weapons[w.currentWeapon];
  if (state.ammo !== Infinity) {
    if (state.ammo <= 0) {
      toast('Out of ammo — find a pickup or visit the Gun Shop.');
      return;
    }
    state.ammo -= 1;
  }
  game.audio.shot(w.currentWeapon);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(game.mouse.x, game.mouse.y), game.view.camera);
  const origin = ray.ray.origin;
  const dir = ray.ray.direction;
  if (dir.y >= -0.01) return;
  const t = -origin.y / dir.y;
  const tx = origin.x + dir.x * t;
  const tz = origin.z + dir.z * t;
  const range = def.range;
  const pd = Math.hypot(w.player.x - tx, w.player.z - tz);
  if (pd > range) return;
  // Nearest pedestrian or cop near the impact point.
  let best = null;
  let bestD = 3;
  for (const ped of game.peds) {
    if (ped.state === 'down') continue;
    const d = Math.hypot(ped.x - tx, ped.z - tz);
    if (d < bestD) {
      best = { kind: 'ped', ref: ped };
      bestD = d;
    }
  }
  for (const cop of game.police.cops) {
    const d = Math.hypot(cop.x - tx, cop.z - tz);
    if (d < bestD) {
      best = { kind: 'cop', ref: cop };
      bestD = d;
    }
  }
  if (best && best.kind === 'ped') {
    best.ref.state = 'down';
    addHeat(w, 15);
  } else if (best) {
    game.police.cops = game.police.cops.filter((c) => c !== best.ref);
    w.kills += 1;
    addHeat(w, 12);
  } else {
    addHeat(w, 3); // a gunshot in the city still draws attention
  }
}

function respawn(kind) {
  const w = game.world;
  const lm = game.city.landmarks.safehouseA;
  w.player.x = lm.x;
  w.player.z = lm.z + 6;
  w.player.angle = 0;
  w.player.onFoot = true;
  w.player.car = null;
  w.player.speed = 0;
  w.heat = 0;
  w.health = 100;
  if (kind === 'wasted') w.money = Math.max(0, Math.round(w.money * 0.95));
  clearRunEnd(w);
  showOverlay(null);
  game.running = true;
}

/** One frame of the game. */
let lastT = 0;
function loop(t) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
  lastT = t;
  if (!game.view) return;
  if (game.running && !game.paused) {
    step(dt);
  }
  updateView(game.view, {
    world: game.world,
    traffic: game.traffic,
    parked: game.parked,
    peds: game.peds,
    police: game.police,
    marker: missionMarker(game.missionState, game.world, game.city),
  }, dt, game.cameraMode);
  game.view.renderer.render(game.view.scene, game.view.camera);
  drawMinimap();
  updateHud();
}

function step(dt) {
  const w = game.world;
  const p = w.player;
  const k = game.keys;
  game.shootCooldown = Math.max(0, game.shootCooldown - dt);

  // --- movement
  if (p.onFoot) {
    const run = k.ShiftLeft || k.ShiftRight;
    const speed = run ? 10 : 6;
    if (k.KeyA || k.ArrowLeft) p.angle += 2.6 * dt;
    if (k.KeyD || k.ArrowRight) p.angle -= 2.6 * dt;
    let mx = 0;
    let mz = 0;
    if (k.KeyW || k.ArrowUp) { mx += Math.sin(p.angle); mz += Math.cos(p.angle); }
    if (k.KeyS || k.ArrowDown) { mx -= Math.sin(p.angle) * 0.6; mz -= Math.cos(p.angle) * 0.6; }
    const len = Math.hypot(mx, mz);
    if (len > 0) {
      p.x += (mx / len) * speed * dt;
      p.z += (mz / len) * speed * dt;
    }
    const out = pushOutOfBuildings(p.x, p.z, game.city);
    p.x = out.x;
    p.z = out.z;
    p.x = clamp(p.x, -CITY_HALF + 2, CITY_HALF - 2);
    p.z = clamp(p.z, -CITY_HALF + 2, CITY_HALF - 2);
    // Pickups.
    for (const pk of game.city.pickups) {
      if (pk.taken) continue;
      if (Math.hypot(pk.x - p.x, pk.z - p.z) < 2.2) {
        pk.taken = true;
        if (pk.kind === 'health') {
          heal(w, 30);
          toast('Health +30');
        } else {
          const def = WEAPONS[w.currentWeapon];
          if (def.ammo !== Infinity) w.weapons[w.currentWeapon].ammo += Math.ceil(def.ammo / 2);
          toast('Ammo picked up');
        }
      }
    }
    if (game.mouse.down) shoot();
  } else {
    // --- driving
    const top = carTopSpeed(w);
    const handling = 1 + w.upgrades.handling * 0.15;
    if (k.KeyW || k.ArrowUp) p.speed += 15 * dt;
    if (k.KeyS || k.ArrowDown) p.speed -= (p.speed > 0.5 ? 22 : 9) * dt;
    if (k.Space) p.speed -= Math.sign(p.speed) * 26 * dt;
    p.speed = clamp(p.speed, -9, top);
    if (Math.abs(p.speed) > 0.3) {
      const steer = (k.KeyA || k.ArrowLeft ? 1 : 0) - (k.KeyD || k.ArrowRight ? 1 : 0);
      p.angle += steer * 1.5 * handling * dt * clamp(Math.abs(p.speed) / 9, 0.35, 1) * Math.sign(p.speed);
    }
    p.x += Math.sin(p.angle) * p.speed * dt;
    p.z += Math.cos(p.angle) * p.speed * dt;
    const out = pushOutOfBuildings(p.x, p.z, game.city);
    if (out.hit) {
      if (Math.abs(p.speed) > 12) game.audio.crash();
      p.speed *= 0.3;
      p.x = out.x;
      p.z = out.z;
    }
    p.x = clamp(p.x, -CITY_HALF + 2, CITY_HALF - 2);
    p.z = clamp(p.z, -CITY_HALF + 2, CITY_HALF - 2);
    // Running over a pedestrian.
    for (const ped of game.peds) {
      if (ped.state === 'down') continue;
      if (Math.hypot(ped.x - p.x, ped.z - p.z) < 2.4 && Math.abs(p.speed) > 3) {
        ped.state = 'down';
        addHeat(w, 15);
        p.speed *= 0.8;
        game.audio.crash();
      }
    }
  }

  // --- the world around the player
  updateTraffic(game.traffic, game.city, dt, game.rngs.traffic);
  updatePedestrians(game.peds, game.city, dt, p, game.rngs.peds);
  const policeEvents = updatePolice(game.police, w, game.city, dt, game.rngs.police);
  for (const ev of policeEvents) {
    if (ev.type === 'ram') {
      if (applyDamage(w, ev.damage) === 'wasted') return endRun('wasted');
      game.audio.crash();
    }
    if (ev.type === 'busted') {
      applyBusted(w);
      return endRun('busted');
    }
  }

  // --- heat cools when the player hides from the police
  const nearPolice = game.police.cars.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < 30)
    || game.police.cops.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < 25)
    || !!game.police.heli;
  decayHeat(w, dt, !nearPolice);

  // --- missions
  const events = updateMission(game.missionState, w, game.city, dt);
  for (const ev of events) {
    if (ev.type === 'complete') {
      game.audio.stinger(true);
      toast(`Mission complete: ${ev.mission.name} (+$${ev.mission.reward})`);
      if (w.storyComplete) {
        game.running = false;
        showOverlay('overlay-complete');
      } else {
        startMission(game.missionState, w, game.city);
        showMissionBanner();
      }
    } else if (ev.type === 'progress') {
      toast(ev.text);
    } else if (ev.type === 'fail') {
      game.audio.stinger(false);
      toast(`Mission failed: ${ev.reason} — try again.`);
      startMission(game.missionState, w, game.city);
      showMissionBanner();
    }
  }

  // --- audio follows the chase
  const stars = wantedLevel(w);
  game.audio.setSiren(stars >= 1);
  game.audio.setRotor(!!game.police.heli);
  if (!p.onFoot) game.audio.setEngine(Math.abs(p.speed) / carTopSpeed(w), k.KeyW ? 1 : 0.3);
  else game.audio.setEngine(0, 0);

  // --- the clock keeps turning (1 real second = 30 game seconds)
  w.clockMinutes = (w.clockMinutes + dt * 0.5) % (24 * 60);
  game.clock += dt;
}

function endRun(kind) {
  game.running = false;
  game.audio.setSiren(false);
  game.audio.setRotor(false);
  showOverlay(kind === 'wasted' ? 'overlay-wasted' : 'overlay-busted');
}

// ---------------------------------------------------------------- HUD

function updateHud() {
  const w = game.world;
  if (!w) return;
  $('health-fill').style.width = `${w.health}%`;
  $('health-text').textContent = `${Math.round(w.health)} HP`;
  $('money').textContent = `$${w.money.toLocaleString()}`;
  $('debt').textContent = w.debt > 0 ? `Debt: $${w.debt.toLocaleString()}` : 'Debt: PAID OFF';
  const stars = wantedLevel(w);
  $('stars').textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars);
  $('stars').style.color = stars >= 3 ? '#ff5a4d' : '#ffd34d';
  $('rank').textContent = rankFor(w.respect).name;
  const hh = Math.floor(w.clockMinutes / 60);
  const mm = Math.floor(w.clockMinutes % 60);
  $('clock').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  $('speed').textContent = w.player.onFoot ? 'On foot' : `${Math.round(Math.abs(w.player.speed) * 3.2)} mph`;
  const mission = currentMission(game.missionState);
  if (mission) {
    $('objective').textContent = `${game.missionState.index + 1}. ${mission.name} — ${mission.brief}`;
    const marker = missionMarker(game.missionState, w, game.city);
    const timer = missionTimer(game.missionState);
    if (marker) {
      const d = Math.round(Math.hypot(w.player.x - marker.x, w.player.z - marker.z));
      $('objective-dist').textContent = timer !== null ? `${d}m · ${Math.ceil(timer)}s` : `${d}m`;
    } else {
      $('objective-dist').textContent = timer !== null ? `${Math.ceil(timer)}s` : '';
    }
  } else {
    $('objective').textContent = 'Story complete — free roam. Enjoy Solmar.';
    $('objective-dist').textContent = '';
  }
  const def = WEAPONS[w.currentWeapon];
  $('weapon').textContent = def.name;
  $('ammo').textContent = w.weapons[w.currentWeapon].ammo === Infinity ? '∞' : String(w.weapons[w.currentWeapon].ammo);
  $('radio').textContent = `♪ ${RADIO_STATIONS[w.radioStation].name}${w.muted ? ' (muted)' : ''}`;
  $('upgrades').textContent = `Engine ${w.upgrades.engine} · Armor ${w.upgrades.armor} · Handling ${w.upgrades.handling}`;
}

/** The 2D minimap: roads, buildings, the beach, entities and the marker. */
function drawMinimap() {
  const canvas = $('minimap');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const S = canvas.width;
  const scale = S / (CITY_HALF * 2 + 40);
  const toX = (x) => (x + CITY_HALF + 20) * scale;
  const toZ = (z) => (z + CITY_HALF + 20) * scale;
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = '#20242c';
  ctx.fillRect(0, 0, S, S);
  // Water and beach.
  ctx.fillStyle = '#2e7f9e';
  ctx.fillRect(0, toZ(CITY_HALF), S, S - toZ(CITY_HALF));
  ctx.fillStyle = '#e6d3a3';
  ctx.fillRect(0, toZ(CITY_HALF - 30), S, toZ(CITY_HALF) - toZ(CITY_HALF - 30));
  // Roads.
  ctx.strokeStyle = '#565b66';
  ctx.lineWidth = 2;
  for (const x of game.city.streetsX) {
    ctx.beginPath();
    ctx.moveTo(toX(x), 0);
    ctx.lineTo(toX(x), S);
    ctx.stroke();
  }
  for (const z of game.city.streetsZ) {
    ctx.beginPath();
    ctx.moveTo(0, toZ(z));
    ctx.lineTo(S, toZ(z));
    ctx.stroke();
  }
  // Buildings.
  ctx.fillStyle = '#8a7a5a';
  for (const b of game.city.buildings) {
    ctx.fillRect(toX(b.x - b.w / 2), toZ(b.z - b.d / 2), Math.max(1, b.w * scale), Math.max(1, b.d * scale));
  }
  // Landmarks.
  ctx.fillStyle = '#58d68d';
  for (const key of Object.keys(game.city.landmarks)) {
    const lm = game.city.landmarks[key];
    ctx.fillRect(toX(lm.x) - 3, toZ(lm.z) - 3, 6, 6);
  }
  // Traffic and police.
  ctx.fillStyle = '#ffffff';
  for (const car of [...game.traffic, ...game.parked]) {
    ctx.fillRect(toX(car.x) - 1.5, toZ(car.z) - 1.5, 3, 3);
  }
  ctx.fillStyle = '#4d8dff';
  for (const car of [...game.police.cars, ...game.police.roadblocks]) {
    ctx.fillRect(toX(car.x) - 2, toZ(car.z) - 2, 4, 4);
  }
  if (game.police.heli) {
    ctx.fillStyle = '#ffd34d';
    ctx.beginPath();
    ctx.arc(toX(game.police.heli.x), toZ(game.police.heli.z), 4, 0, Math.PI * 2);
    ctx.fill();
  }
  // Mission marker, pulsing.
  const marker = missionMarker(game.missionState, game.world, game.city);
  if (marker) {
    const pulse = 4 + Math.sin(performance.now() / 250) * 2;
    ctx.strokeStyle = '#ffc93c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(toX(marker.x), toZ(marker.z), pulse, 0, Math.PI * 2);
    ctx.stroke();
  }
  // The player, a triangle pointing where they face.
  const p = game.world.player;
  ctx.fillStyle = '#ff5a4d';
  ctx.save();
  ctx.translate(toX(p.x), toZ(p.z));
  ctx.rotate(Math.atan2(Math.sin(p.angle), Math.cos(p.angle)));
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.lineTo(4, 5);
  ctx.lineTo(-4, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
