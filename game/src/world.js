// The world state of SOLMAR HEAT: money, debt, health, wanted level,
// weapons, respect and garage upgrades. Pure logic — no DOM, no three.js —
// so the same code runs in the browser and in Node tests.

/** Rex starts with a dead car and a $5,000 debt to Lena Cruz. */
export const START_MONEY = 200;
export const START_DEBT = 5000;

/** Heat thresholds: heat is 0..100, stars step up at these values. */
export const STAR_THRESHOLDS = [0, 20, 40, 60, 80, 95];

/** Respect ranks: name and the respect needed to reach it. */
export const RESPECT_RANKS = [
  { at: 0, name: 'Nobody' },
  { at: 50, name: 'Hustler' },
  { at: 150, name: 'Operator' },
  { at: 300, name: 'King of Solmar' },
];

/** Weapons: damage, range, seconds between shots, unlock respect, start ammo. */
export const WEAPONS = {
  fists: { name: 'Fists', damage: 20, range: 2.4, rate: 0.45, unlock: 0, ammo: Infinity, price: 0 },
  pistol: { name: 'Pistol', damage: 25, range: 42, rate: 0.35, unlock: 0, ammo: 24, price: 150 },
  shotgun: { name: 'Shotgun', damage: 14, pellets: 6, range: 20, rate: 0.9, unlock: 50, ammo: 12, price: 400 },
  smg: { name: 'SMG', damage: 14, range: 32, rate: 0.09, unlock: 150, ammo: 60, price: 700 },
};
export const WEAPON_ORDER = ['fists', 'pistol', 'shotgun', 'smg'];

/** Garage upgrade tracks: 3 levels each, cost per level. */
export const UPGRADE_TRACKS = ['engine', 'armor', 'handling'];
export const UPGRADE_COSTS = [300, 600, 1000];
export const UPGRADE_NAMES = {
  engine: 'Engine',
  armor: 'Armor',
  handling: 'Handling',
};

/** Fresh world state for a new game (or a new seed). */
export function createWorld(seed) {
  return {
    seed,
    money: START_MONEY,
    debt: START_DEBT,
    respect: 0,
    health: 100,
    heat: 0,
    missionIndex: 0,
    completedMissions: [],
    storyComplete: false,
    weapons: {
      fists: { owned: true, ammo: Infinity },
      pistol: { owned: true, ammo: WEAPONS.pistol.ammo },
      shotgun: { owned: false, ammo: 0 },
      smg: { owned: false, ammo: 0 },
    },
    currentWeapon: 'pistol',
    upgrades: { engine: 0, armor: 0, handling: 0 },
    player: {
      x: -160,
      z: -152,
      angle: 0,
      onFoot: true,
      speed: 0,
      car: null, // { kind, color, armor } while driving
    },
    clockMinutes: 17 * 60 + 20, // golden hour: 17:20
    radioStation: 0,
    muted: false,
    wasted: false,
    busted: false,
    kills: 0,
    carsStolen: 0,
  };
}

/** Wanted stars (0..5) for a heat value. */
export function starsForHeat(heat) {
  let stars = 0;
  for (let i = 0; i < STAR_THRESHOLDS.length; i++) {
    if (heat >= STAR_THRESHOLDS[i]) stars = i;
  }
  return stars;
}

/** Current wanted stars of the world. */
export function wantedLevel(world) {
  return starsForHeat(world.heat);
}

/** Raise the heat, capped at 100. Returns the new star count. */
export function addHeat(world, amount) {
  world.heat = Math.min(100, world.heat + amount);
  return wantedLevel(world);
}

/** Let the heat cool. Hiding (out of police sight) cools much faster. */
export function decayHeat(world, dt, hidden) {
  const rate = hidden ? 9 : 2.2;
  world.heat = Math.max(0, world.heat - rate * dt);
  return wantedLevel(world);
}

/** The respect rank for a respect total. */
export function rankFor(respect) {
  let rank = RESPECT_RANKS[0];
  for (const r of RESPECT_RANKS) {
    if (respect >= r.at) rank = r;
  }
  return rank;
}

/** Can the player buy this weapon (rank reached and money enough)? */
export function canBuyWeapon(world, key) {
  const w = WEAPONS[key];
  if (!w) return false;
  if (world.weapons[key].owned) return false;
  if (world.respect < w.unlock) return false;
  return world.money >= w.price;
}

/** Buy a weapon: deducts money, marks owned, fills ammo. */
export function buyWeapon(world, key) {
  if (!canBuyWeapon(world, key)) return false;
  const w = WEAPONS[key];
  world.money -= w.price;
  world.weapons[key].owned = true;
  world.weapons[key].ammo = w.ammo;
  return true;
}

/** Buy ammo for an owned weapon (half a clip, $40). */
export function buyAmmo(world, key) {
  const w = WEAPONS[key];
  if (!w || !world.weapons[key].owned || w.ammo === Infinity) return false;
  if (world.money < 40) return false;
  world.money -= 40;
  world.weapons[key].ammo += Math.ceil(w.ammo / 2);
  return true;
}

/** Price of the next level of an upgrade track, or null when maxed. */
export function nextUpgradeCost(world, track) {
  const level = world.upgrades[track];
  if (level >= UPGRADE_COSTS.length) return null;
  return UPGRADE_COSTS[level];
}

/** Buy the next level of an upgrade track. Returns true when bought. */
export function buyUpgrade(world, track) {
  const cost = nextUpgradeCost(world, track);
  if (cost === null || world.money < cost) return false;
  world.money -= cost;
  world.upgrades[track] += 1;
  return true;
}

/** Top speed of the player's car, with the engine upgrade applied. */
export function carTopSpeed(world) {
  return 26 + world.upgrades.engine * 3;
}

/** Damage taken is reduced by armor upgrades (10% a level). */
export function damageAfterArmor(world, amount) {
  return Math.max(1, Math.round(amount * (1 - world.upgrades.armor * 0.1)));
}

/** Hurt the player. Returns 'wasted' when health hits zero, else 'alive'. */
export function applyDamage(world, amount) {
  world.health = Math.max(0, world.health - damageAfterArmor(world, amount));
  if (world.health <= 0) {
    world.wasted = true;
    return 'wasted';
  }
  return 'alive';
}

/** Heal the player, capped at 100. */
export function heal(world, amount) {
  world.health = Math.min(100, world.health + amount);
}

/** Pay out a mission reward: money and respect. */
export function grantReward(world, money, respect) {
  world.money += money;
  world.respect += respect;
}

/** The player is caught: keep the money, lose a little, back at a safehouse. */
export function applyBusted(world) {
  world.busted = true;
  world.heat = 0;
  world.money = Math.max(0, Math.round(world.money * 0.95));
  world.health = 100;
}

/** Reset the run-ending flags after a retry respawn. */
export function clearRunEnd(world) {
  world.wasted = false;
  world.busted = false;
}

/** The shape save.js stores in localStorage (plain JSON, no functions). */
export function saveShape(world) {
  return {
    v: 1,
    seed: world.seed,
    money: world.money,
    debt: world.debt,
    respect: world.respect,
    health: world.health,
    missionIndex: world.missionIndex,
    completedMissions: world.completedMissions,
    storyComplete: world.storyComplete,
    weapons: world.weapons,
    currentWeapon: world.currentWeapon,
    upgrades: world.upgrades,
    player: { x: world.player.x, z: world.player.z, angle: world.player.angle },
    clockMinutes: world.clockMinutes,
    radioStation: world.radioStation,
    kills: world.kills,
    carsStolen: world.carsStolen,
  };
}

/** Restore a world from a saved shape. Returns null when the shape is bad. */
export function loadShape(data) {
  if (!data || data.v !== 1 || typeof data.money !== 'number') return null;
  const world = createWorld(data.seed ?? 7);
  world.money = data.money;
  world.debt = data.debt;
  world.respect = data.respect;
  world.health = data.health;
  world.missionIndex = data.missionIndex;
  world.completedMissions = Array.isArray(data.completedMissions) ? data.completedMissions : [];
  world.storyComplete = !!data.storyComplete;
  world.weapons = data.weapons;
  world.currentWeapon = data.currentWeapon;
  world.upgrades = data.upgrades;
  world.player.x = data.player.x;
  world.player.z = data.player.z;
  world.player.angle = data.player.angle;
  world.clockMinutes = data.clockMinutes;
  world.radioStation = data.radioStation;
  world.kills = data.kills ?? 0;
  world.carsStolen = data.carsStolen ?? 0;
  return world;
}
