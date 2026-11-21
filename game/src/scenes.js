// Screenshot scenes: canned setups for ?scene=.
//
// The game reads the scene from the URL (?scene=chase, driving, mission or
// title) and stages the world before the first frame, so each screenshot
// shows a different system at its best: a chase with the helicopter and a
// roadblock, plain driving, a mission on foot, and the title screen over
// the city. Normal play ignores all of this.

import { startMission } from './missions.js';

/** The scenes the game knows, in the order the screenshots use them. */
export const SCENES = ['chase', 'driving', 'mission', 'title'];

/**
 * Stage the world for a scene. `game` carries world, city, traffic,
 * parked, peds, police and missionState. Returns the camera mode:
 * 'chase' for gameplay scenes, 'orbit' for the title.
 */
export function applyScene(name, game) {
  const { world, missionState, city } = game;
  switch (name) {
    case 'chase': {
      // Mission 6, mid-escape: Rex in the gold Comet, 3 stars, the
      // helicopter overhead and a roadblock ahead.
      missionState.index = 5;
      startMission(missionState, world, city);
      world.player.onFoot = false;
      world.player.car = { kind: 'comet', color: 0xffd34d };
      world.player.x = 0;
      world.player.z = 60;
      world.player.angle = Math.PI; // heading north, into the city
      world.player.speed = 18; // already cruising when the shot is taken
      world.heat = 100; // full heat: 5 stars at the start, still 3+ when the shot lands
      world.money = 1250;
      world.respect = 85;
      return 'chase';
    }
    case 'driving': {
      // Mission 1: Rex driving a stolen sedan down a sunny street.
      missionState.index = 0;
      startMission(missionState, world, city);
      world.player.onFoot = false;
      world.player.car = { kind: 'traffic', color: 0xc94f3d };
      world.player.x = -40;
      world.player.z = 0;
      world.player.angle = Math.PI / 2; // heading east
      world.player.speed = 14; // already cruising when the shot is taken
      world.heat = 0;
      world.money = 200;
      // A couple of traffic cars nearby, so the street reads as alive.
      if (game.traffic[0]) {
        game.traffic[0].x = -8;
        game.traffic[0].z = -2;
        game.traffic[0].alongX = true;
        game.traffic[0].dir = 1;
      }
      if (game.traffic[1]) {
        game.traffic[1].x = 24;
        game.traffic[1].z = 2;
        game.traffic[1].alongX = true;
        game.traffic[1].dir = -1;
      }
      return 'chase';
    }
    case 'mission': {
      // Mission 4: Rex on foot, about to collect from the first debtor.
      missionState.index = 3;
      startMission(missionState, world, city);
      world.player.onFoot = true;
      world.player.car = null;
      world.player.x = -104;
      world.player.z = 40;
      world.player.angle = -Math.PI / 2; // facing the debtor marker, west
      world.heat = 0;
      world.money = 900;
      world.respect = 60;
      return 'chase';
    }
    case 'title':
    default:
      return 'orbit';
  }
}
