// The nine story missions of SOLMAR HEAT.
//
// Rex Marlowe owes Lena Cruz $5,000. The nine rewards add up to $6,000, so
// finishing the last mission pays the debt with a little left over for the
// garage and the gun shop. Each mission is a small state machine: the world
// tells it where the player is and what the player is doing, and it answers
// with events (progress, complete, fail). Pure logic — no DOM, no three.js.

import { grantReward } from './world.js';

/** The nine missions, in story order. Rewards add up to $6,000. */
export const MISSIONS = [
  {
    id: 'first-wheels',
    name: 'First Wheels',
    reward: 400,
    respect: 15,
    brief: 'Steal a car and bring it to the marker.',
    hint: 'Walk up to a parked or traffic car and press E.',
  },
  {
    id: 'the-package',
    name: 'The Package',
    reward: 500,
    respect: 20,
    brief: 'Pick up the package, then deliver it before the timer runs out.',
    hint: 'Reach the gold marker to pick it up, then the blue one in time.',
  },
  {
    id: 'heat-check',
    name: 'Heat Check',
    reward: 600,
    respect: 25,
    brief: 'Reach 3 wanted stars, then lose the cops completely.',
    hint: 'Cause trouble until 3 stars show, then hide until the heat is gone.',
  },
  {
    id: 'three-debts',
    name: 'Three Debts',
    reward: 700,
    respect: 30,
    brief: 'Collect money from three debtors around the city.',
    hint: 'Visit each gold marker. Any order works.',
  },
  {
    id: 'street-race',
    name: 'Street Race',
    reward: 800,
    respect: 35,
    brief: 'Win a checkpoint race against three rival drivers.',
    hint: 'Drive through the checkpoints in order before the timer ends.',
  },
  {
    id: 'the-big-score',
    name: 'The Big Score',
    reward: 900,
    respect: 40,
    brief: 'Steal the gold Comet and drop it off while the police chase you.',
    hint: 'The Comet is parked at the gold marker. Get in and run.',
  },
  {
    id: 'air-support',
    name: 'Air Support',
    reward: 600,
    respect: 30,
    brief: 'Survive the helicopter chase, then reach the safehouse.',
    hint: 'Stay moving for 45 seconds, then get to the safehouse marker.',
  },
  {
    id: 'garage-upgrade',
    name: 'Garage Upgrade',
    reward: 400,
    respect: 20,
    brief: 'Buy a garage upgrade, then finish a getaway drive in the upgraded car.',
    hint: 'Press E at the garage to buy, then drive to the marker.',
  },
  {
    id: 'the-final-debt',
    name: 'The Final Debt',
    reward: 1100,
    respect: 60,
    brief: 'Steal the black Phoenix, escape the city under a five-star chase, pay the debt.',
    hint: 'The Phoenix waits at the gold marker. Take it north, out of Solmar.',
  },
];

/** Total reward across all nine missions: $6,000. */
export const TOTAL_REWARD = MISSIONS.reduce((n, m) => n + m.reward, 0);

/** Fresh mission progress: nothing started yet. */
export function createMissionState() {
  return {
    index: 0,
    phase: 'idle', // idle | active | done
    runtime: {},
  };
}

/** The mission currently in play, or null when the story is over. */
export function currentMission(state) {
  return state.index < MISSIONS.length ? MISSIONS[state.index] : null;
}

/** Begin the current mission, setting up its markers and timers. */
export function startMission(state, world, city) {
  const mission = currentMission(state);
  if (!mission) return null;
  const r = {};
  switch (mission.id) {
    case 'first-wheels':
      r.marker = { x: 80, z: 80 };
      break;
    case 'the-package':
      r.pickup = { x: -80, z: 40 };
      r.dropoff = { x: 120, z: -40 };
      r.stage = 'pickup';
      r.timer = 90;
      break;
    case 'heat-check':
      r.reachedThree = false;
      break;
    case 'three-debts':
      r.debtors = [
        { x: -120, z: 40, visited: false },
        { x: 40, z: -120, visited: false },
        { x: 120, z: 80, visited: false },
      ];
      break;
    case 'street-race':
      r.checkpoints = [
        { x: -120, z: -40 },
        { x: 40, z: -120 },
        { x: 120, z: 40 },
        { x: -40, z: 120 },
      ];
      r.next = 0;
      r.timer = 120;
      break;
    case 'the-big-score':
      r.comet = { x: 0, z: -80 };
      r.dropoff = { x: -120, z: 120 };
      r.stolen = false;
      break;
    case 'air-support':
      r.survive = 45;
      r.safehouse = { x: city.landmarks.safehouseA.x, z: city.landmarks.safehouseA.z };
      break;
    case 'garage-upgrade':
      r.bought = false;
      r.marker = { x: -80, z: -80 };
      break;
    case 'the-final-debt':
      r.phoenix = { x: 80, z: -120 };
      r.stolen = false;
      r.escape = { x: 0, z: -196 };
      break;
    default:
      break;
  }
  state.phase = 'active';
  state.runtime = r;
  return mission;
}

/** Distance between the player and a point. */
function distTo(world, point) {
  const dx = world.player.x - point.x;
  const dz = world.player.z - point.z;
  return Math.sqrt(dx * dx + dz * dz);
}

/** The marker the HUD should point at for the current mission. */
export function missionMarker(state, world, city) {
  const mission = currentMission(state);
  if (!mission || state.phase !== 'active') return null;
  const r = state.runtime;
  switch (mission.id) {
    case 'first-wheels':
      return { ...r.marker, label: 'Drop-off' };
    case 'the-package':
      return r.stage === 'pickup'
        ? { ...r.pickup, label: 'Pick up the package' }
        : { ...r.dropoff, label: 'Deliver the package' };
    case 'heat-check':
      return r.reachedThree ? { x: world.player.x, z: world.player.z, label: 'Lose the cops!' } : null;
    case 'three-debts': {
      const next = r.debtors.find((d) => !d.visited);
      return next ? { ...next, label: `Debtor (${r.debtors.filter((d) => d.visited).length}/3)` } : null;
    }
    case 'street-race':
      return r.next < r.checkpoints.length
        ? { ...r.checkpoints[r.next], label: `Checkpoint ${r.next + 1}/4` }
        : null;
    case 'the-big-score':
      return r.stolen
        ? { ...r.dropoff, label: 'Drop off the Comet' }
        : { ...r.comet, label: 'Steal the gold Comet' };
    case 'air-support':
      return r.survive > 0
        ? { x: world.player.x, z: world.player.z, label: `Survive! ${Math.ceil(r.survive)}s` }
        : { ...r.safehouse, label: 'Reach the safehouse' };
    case 'garage-upgrade':
      return r.bought ? { ...r.marker, label: 'Getaway point' } : { ...city.landmarks.garage, label: 'Buy an upgrade (E)' };
    case 'the-final-debt':
      return r.stolen
        ? { ...r.escape, label: 'Escape north!' }
        : { ...r.phoenix, label: 'Steal the black Phoenix' };
    default:
      return null;
  }
}

/** Time left on the current mission's timer, or null when it has none. */
export function missionTimer(state) {
  const mission = currentMission(state);
  if (!mission || state.phase !== 'active') return null;
  if (mission.id === 'the-package') return state.runtime.timer;
  if (mission.id === 'street-race') return state.runtime.timer;
  return null;
}

/**
 * Advance the current mission by `dt` seconds. `world` carries the player's
 * position, car and heat; `city` carries the landmarks. Returns events:
 *   { type: 'complete', mission }  — reward already granted to the world
 *   { type: 'progress', text }     — something worth telling the player
 *   { type: 'fail', reason }       — the mission failed (timer ran out)
 */
export function updateMission(state, world, city, dt) {
  const events = [];
  const mission = currentMission(state);
  if (!mission || state.phase !== 'active') return events;
  const r = state.runtime;
  const complete = () => {
    grantReward(world, mission.reward, mission.respect);
    world.completedMissions.push(mission.id);
    state.index += 1;
    state.phase = 'idle';
    state.runtime = {};
    events.push({ type: 'complete', mission });
  };
  const near = (point, radius = 6) => distTo(world, point) < radius;

  switch (mission.id) {
    case 'first-wheels':
      if (!world.player.onFoot && near(r.marker, 8)) complete();
      break;
    case 'the-package':
      r.timer -= dt;
      if (r.timer <= 0) {
        state.phase = 'idle';
        state.runtime = {};
        events.push({ type: 'fail', reason: 'The delivery was too slow.' });
        break;
      }
      if (r.stage === 'pickup' && near(r.pickup)) {
        r.stage = 'deliver';
        events.push({ type: 'progress', text: 'Package picked up — deliver it!' });
      } else if (r.stage === 'deliver' && near(r.dropoff, 8)) {
        complete();
      }
      break;
    case 'heat-check': {
      if (!r.reachedThree && world.heat >= 60) {
        r.reachedThree = true;
        events.push({ type: 'progress', text: 'Three stars! Now lose them.' });
      }
      if (r.reachedThree && world.heat < 10) complete();
      break;
    }
    case 'three-debts': {
      let changed = false;
      for (const d of r.debtors) {
        if (!d.visited && near(d)) {
          d.visited = true;
          changed = true;
        }
      }
      if (changed) {
        const done = r.debtors.filter((d) => d.visited).length;
        events.push({ type: 'progress', text: `Collected from a debtor (${done}/3).` });
      }
      if (r.debtors.every((d) => d.visited)) complete();
      break;
    }
    case 'street-race':
      r.timer -= dt;
      if (r.timer <= 0) {
        state.phase = 'idle';
        state.runtime = {};
        events.push({ type: 'fail', reason: 'Out of time in the race.' });
        break;
      }
      if (r.next < r.checkpoints.length && near(r.checkpoints[r.next], 9)) {
        r.next += 1;
        events.push({ type: 'progress', text: `Checkpoint ${r.next}/4!` });
      }
      if (r.next >= r.checkpoints.length) complete();
      break;
    case 'the-big-score':
      if (!r.stolen && !world.player.onFoot && world.player.car && world.player.car.kind === 'comet') {
        r.stolen = true;
        events.push({ type: 'progress', text: 'The Comet is yours — drop it off!' });
      }
      if (r.stolen && near(r.dropoff, 8)) complete();
      break;
    case 'air-support':
      if (r.survive > 0) {
        if (world.heat >= 60) r.survive -= dt;
        if (r.survive <= 0) events.push({ type: 'progress', text: 'You outlasted them — get to the safehouse!' });
      } else if (near(r.safehouse, 8)) {
        complete();
      }
      break;
    case 'garage-upgrade':
      if (!r.bought && world.upgrades.engine + world.upgrades.armor + world.upgrades.handling > 0) {
        r.bought = true;
        events.push({ type: 'progress', text: 'Upgrade fitted — now the getaway!' });
      }
      if (r.bought && !world.player.onFoot && near(r.marker, 8)) complete();
      break;
    case 'the-final-debt':
      if (!r.stolen && !world.player.onFoot && world.player.car && world.player.car.kind === 'phoenix') {
        r.stolen = true;
        events.push({ type: 'progress', text: 'The Phoenix is yours — run north!' });
      }
      if (r.stolen && near(r.escape, 10)) {
        complete();
        world.debt = 0;
        world.storyComplete = true;
      }
      break;
    default:
      break;
  }
  return events;
}
