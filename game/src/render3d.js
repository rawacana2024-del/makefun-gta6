// The 3D view of Solmar: three.js meshes for the city, the cars, the
// people, the police and the mission beacon, plus the chase camera.
// Browser only. The simulation lives in the pure modules; this file only
// turns their plain state into something you can see.

import * as THREE from 'three';

const GOLD = 0xf2b878;
const SUN_COLOR = 0xffd9a8;

/** One shared unit box, scaled per building and car. */
let unitBox;
let wheelGeo;
let trunkGeo;
let foliageGeo;

/** A canvas texture of lit windows, reused across buildings. */
function windowTexture(seed) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 64, 128);
  for (let y = 6; y < 122; y += 12) {
    for (let x = 6; x < 58; x += 12) {
      const lit = ((x * 31 + y * 17 + seed * 7) % 10) < 6;
      ctx.fillStyle = lit ? '#ffd98a' : '#2a2f3a';
      ctx.fillRect(x, y, 7, 8);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Build the renderer, scene, lights and the static city meshes. */
export function createView(canvas, city) {
  unitBox = new THREE.BoxGeometry(1, 1, 1);
  wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 10);
  trunkGeo = new THREE.CylinderGeometry(0.18, 0.26, 2.2, 6);
  foliageGeo = new THREE.ConeGeometry(1.6, 3.6, 8);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf7c489);
  scene.fog = new THREE.Fog(0xf2c98f, 140, 460);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 900);

  const sun = new THREE.DirectionalLight(SUN_COLOR, 1.6);
  sun.position.set(-140, 90, -50);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 1.05));
  scene.add(new THREE.AmbientLight(0xffe0b3, 0.7));

  buildGround(scene, city);
  buildBuildings(scene, city);
  buildTrees(scene, city);

  const view = {
    renderer,
    scene,
    camera,
    city,
    carMeshes: new Map(),
    pedMeshes: new Map(),
    policeMeshes: new Map(),
    playerMesh: makePerson(0x3a6ea5, 1.05),
    heliMesh: null,
    beacon: makeBeacon(),
    orbitAngle: 0,
  };
  scene.add(view.playerMesh);
  scene.add(view.beacon);
  return view;
}

/** Ground, streets, beach and water. */
function buildGround(scene, city) {
  const half = city.half;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2 + 280, half * 2 + 280),
    new THREE.MeshLambertMaterial({ color: 0x8f9a7d }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, 40);
  scene.add(ground);

  const streetMat = new THREE.MeshLambertMaterial({ color: 0x3c3f45 });
  for (const x of city.streetsX) {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(city.streetWidth, half * 2), streetMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(x, 0, 0);
    scene.add(road);
  }
  for (const z of city.streetsZ) {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, city.streetWidth), streetMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, z);
    scene.add(road);
  }

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2, 30),
    new THREE.MeshLambertMaterial({ color: 0xe6d3a3 }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.02, city.beach.z0 + 15);
  scene.add(sand);

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2 + 280, 140),
    new THREE.MeshLambertMaterial({ color: 0x2e7f9e, transparent: true, opacity: 0.9 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.05, city.water.z0 + 70);
  water.name = 'water';
  scene.add(water);
}

/** Buildings: boxes with warm colours and a lit-window texture. */
function buildBuildings(scene, city) {
  const texA = windowTexture(1);
  const texB = windowTexture(2);
  const matCache = new Map();
  const materialFor = (color, lit) => {
    const key = `${color}-${lit}`;
    if (!matCache.has(key)) {
      matCache.set(key, new THREE.MeshLambertMaterial({
        color,
        map: lit ? texA : texB,
        emissive: lit ? 0x332200 : 0x000000,
      }));
    }
    return matCache.get(key);
  };
  const group = new THREE.Group();
  for (const b of city.buildings) {
    const mesh = new THREE.Mesh(unitBox, materialFor(b.color, b.lit));
    mesh.scale.set(b.w, b.h, b.d);
    mesh.position.set(b.x, b.h / 2, b.z);
    group.add(mesh);
    // A flat roof cap, slightly darker.
    const roof = new THREE.Mesh(unitBox, new THREE.MeshLambertMaterial({ color: 0x5a5148 }));
    roof.scale.set(b.w + 0.4, 0.5, b.d + 0.4);
    roof.position.set(b.x, b.h + 0.25, b.z);
    group.add(roof);
  }
  scene.add(group);
}

/** Trees in the parks: trunk plus a cone of leaves. */
function buildTrees(scene, city) {
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x4d7a3a });
  const group = new THREE.Group();
  for (const park of city.parks) {
    for (const t of park.trees) {
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(t.x, 1.1, t.z);
      group.add(trunk);
      const leaves = new THREE.Mesh(foliageGeo, leafMat);
      leaves.scale.setScalar(t.size);
      leaves.position.set(t.x, 2.2 + t.size * 1.4, t.z);
      group.add(leaves);
    }
  }
  scene.add(group);
}

/** A person: a body cylinder and a head, one colour for the jacket. */
function makePerson(color, scale = 1) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.38, 1.15, 8),
    new THREE.MeshLambertMaterial({ color }),
  );
  body.position.y = 0.85;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xd9a986 }),
  );
  head.position.y = 1.65;
  group.add(head);
  group.scale.setScalar(scale);
  return group;
}

/** A car: body, cabin, four wheels; police cars get a light bar. */
function makeCar(color, isPolice = false) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(unitBox, new THREE.MeshLambertMaterial({ color }));
  body.scale.set(1.9, 0.62, 4.3);
  body.position.y = 0.55;
  group.add(body);
  const cabin = new THREE.Mesh(unitBox, new THREE.MeshLambertMaterial({ color: 0x222831 }));
  cabin.scale.set(1.6, 0.55, 2.1);
  cabin.position.set(0, 1.05, -0.2);
  group.add(cabin);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  for (const [x, z] of [[-0.85, 1.4], [0.85, 1.4], [-0.85, -1.4], [0.85, -1.4]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.34, z);
    group.add(wheel);
  }
  if (isPolice) {
    const bar = new THREE.Mesh(unitBox, new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x888888 }));
    bar.scale.set(1.2, 0.18, 0.3);
    bar.position.set(0, 1.42, -0.2);
    group.add(bar);
  }
  return group;
}

/** The helicopter: body, tail, spinning main rotor. */
function makeHeli() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(unitBox, new THREE.MeshLambertMaterial({ color: 0x1c2f4a }));
  body.scale.set(2.2, 1.4, 3.4);
  group.add(body);
  const tail = new THREE.Mesh(unitBox, new THREE.MeshLambertMaterial({ color: 0x1c2f4a }));
  tail.scale.set(0.5, 0.5, 3.2);
  tail.position.set(0, 0.2, -3);
  group.add(tail);
  const rotor = new THREE.Mesh(unitBox, new THREE.MeshLambertMaterial({ color: 0x222222 }));
  rotor.scale.set(7.5, 0.08, 0.35);
  rotor.position.y = 1.1;
  rotor.name = 'rotor';
  group.add(rotor);
  // A white spotlight cone under the helicopter.
  const spot = new THREE.Mesh(
    new THREE.ConeGeometry(4, 14, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
  );
  spot.position.y = -7;
  group.add(spot);
  return group;
}

/** The mission beacon: a pulsing gold column of light. */
function makeBeacon() {
  const group = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.1, 34, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffc93c, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 17;
  beam.name = 'beam';
  group.add(beam);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(3, 0.22, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0xffc93c }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.3;
  ring.name = 'ring';
  group.add(ring);
  group.visible = false;
  return group;
}

/** Sync a mesh map to a list of entities (create, move, remove). */
function syncMeshes(view, map, list, make, place) {
  const seen = new Set();
  for (const e of list) {
    seen.add(e.id);
    let mesh = map.get(e.id);
    if (!mesh) {
      mesh = make(e);
      map.set(e.id, mesh);
      view.scene.add(mesh);
    }
    place(mesh, e);
  }
  for (const [id, mesh] of map) {
    if (!seen.has(id)) {
      view.scene.remove(mesh);
      map.delete(id);
    }
  }
}

/**
 * Advance the view one frame: move every mesh to where the simulation says
 * it is, pulse the beacon, spin the rotor, and place the chase camera.
 * `game` carries world, traffic, parked, peds, police, city and the mission
 * marker (or null). `cameraMode` is 'chase' or 'orbit'.
 */
export function updateView(view, game, dt, cameraMode = 'chase') {
  const { world, traffic, parked, peds, police } = game;

  // Player: on foot as a person, in a car as that car.
  if (world.player.onFoot) {
    view.playerMesh.visible = true;
    view.playerMesh.position.set(world.player.x, 0, world.player.z);
    view.playerMesh.rotation.y = world.player.angle;
  } else {
    view.playerMesh.visible = false;
  }

  syncMeshes(view, view.carMeshes, [...traffic, ...parked], (car) => {
    const mesh = makeCar(car.color, car.kind === 'police');
    mesh.userData.kind = car.kind;
    return mesh;
  }, (mesh, car) => {
    mesh.position.set(car.x, 0, car.z);
    mesh.rotation.y = car.angle;
  });

  syncMeshes(view, view.pedMeshes, peds.filter((p) => p.state !== 'down'), (ped) => makePerson(ped.color, 0.95), (mesh, ped) => {
    mesh.position.set(ped.x, 0, ped.z);
    mesh.rotation.y = ped.angle;
  });

  syncMeshes(view, view.policeMeshes, [...police.cars, ...police.roadblocks], (car) => makeCar(car.color, true), (mesh, car) => {
    mesh.position.set(car.x, 0, car.z);
    mesh.rotation.y = car.angle;
  });

  if (police.heli) {
    if (!view.heliMesh) {
      view.heliMesh = makeHeli();
      view.scene.add(view.heliMesh);
    }
    view.heliMesh.visible = true;
    view.heliMesh.position.set(police.heli.x, police.heli.y, police.heli.z);
    const rotor = view.heliMesh.getObjectByName('rotor');
    if (rotor) rotor.rotation.y += dt * 22;
  } else if (view.heliMesh) {
    view.heliMesh.visible = false;
  }

  // The player's own car, when driving, is drawn from the world state.
  if (!world.player.onFoot && world.player.car) {
    const car = world.player.car;
    let mesh = view.carMeshes.get('player');
    if (!mesh) {
      mesh = makeCar(car.color, false);
      view.carMeshes.set('player', mesh);
      view.scene.add(mesh);
    }
    mesh.position.set(world.player.x, 0, world.player.z);
    mesh.rotation.y = world.player.angle;
  } else {
    const mesh = view.carMeshes.get('player');
    if (mesh) {
      view.scene.remove(mesh);
      view.carMeshes.delete('player');
    }
  }

  // Mission beacon over the current marker.
  if (game.marker) {
    view.beacon.visible = true;
    view.beacon.position.set(game.marker.x, 0, game.marker.z);
    const beam = view.beacon.getObjectByName('beam');
    if (beam) beam.material.opacity = 0.3 + Math.sin(performance.now() / 300) * 0.12;
  } else {
    view.beacon.visible = false;
  }

  // Camera.
  const cam = view.camera;
  if (cameraMode === 'orbit') {
    view.orbitAngle += dt * 0.06;
    const r = 190;
    cam.position.set(Math.sin(view.orbitAngle) * r, 95, Math.cos(view.orbitAngle) * r);
    cam.lookAt(0, 10, 0);
  } else {
    const px = world.player.x;
    const pz = world.player.z;
    const a = world.player.angle;
    const dist = world.player.onFoot ? 10 : 13;
    const height = world.player.onFoot ? 5.5 : 6.5;
    const tx = px - Math.sin(a) * dist;
    const tz = pz - Math.cos(a) * dist;
    cam.position.x += (tx - cam.position.x) * Math.min(1, dt * 4);
    cam.position.y += (height - cam.position.y) * Math.min(1, dt * 4);
    cam.position.z += (tz - cam.position.z) * Math.min(1, dt * 4);
    cam.lookAt(px + Math.sin(a) * 5, 1.5, pz + Math.cos(a) * 5);
  }
}

/** Resize the renderer to its canvas. */
export function resizeView(view) {
  const canvas = view.renderer.domElement;
  const w = canvas.clientWidth || 1280;
  const h = canvas.clientHeight || 720;
  view.renderer.setSize(w, h, false);
  view.camera.aspect = w / h;
  view.camera.updateProjectionMatrix();
}
