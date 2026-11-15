// The map: a 44 x 30 m yard with two bomb sites, two lanes and a mid connector.
// VANGUARD spawns south, WRAITH north. Site A sits north-west, site B north-east.
// Every box is a collider for bodies and a surface a bullet stops on. Plain geometry
// only, no models and no textures. The waypoint graph is the bots' road map: every
// node sits in open space, clear of crates and walls, and every link is walkable.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const SITES = {
  A: { x: -16, z: -10, radius: 3.4 },
  B: { x: 16, z: -10, radius: 3.4 },
};

export const SPAWNS = {
  vanguard: [
    { x: -4, z: 12, yaw: 0 },
    { x: -1.5, z: 13, yaw: 0 },
    { x: 1.5, z: 13, yaw: 0 },
    { x: 4, z: 12, yaw: 0 },
  ],
  wraith: [
    { x: -4, z: -12, yaw: Math.PI },
    { x: -1.5, z: -13, yaw: Math.PI },
    { x: 1.5, z: -13, yaw: Math.PI },
    { x: 4, z: -12, yaw: Math.PI },
  ],
};

// Waypoints: id -> { x, z, links }. Links are bidirectional and walkable.
export const WAYPOINTS = [
  { x: 0, z: 12, links: [1, 2, 3] }, // 0 vanguard spawn
  { x: -14, z: 8, links: [0, 5] }, // 1 west lane south
  { x: 14, z: 8, links: [0, 6] }, // 2 east lane south
  { x: 0, z: 6, links: [0, 4] }, // 3 mid south
  { x: 0, z: 0, links: [3, 5, 6, 11] }, // 4 mid gap
  { x: -14, z: 0, links: [1, 4, 7] }, // 5 west lane mid
  { x: 14, z: 0, links: [2, 4, 8] }, // 6 east lane mid
  { x: -14, z: -6, links: [5, 9, 11] }, // 7 west lane north
  { x: 14, z: -6, links: [6, 10, 11] }, // 8 east lane north
  { x: -16, z: -10, links: [7, 11] }, // 9 site A
  { x: 16, z: -10, links: [8, 11] }, // 10 site B
  { x: 0, z: -6, links: [4, 7, 8, 9, 10, 12] }, // 11 mid north
  { x: 0, z: -12, links: [11, 9, 10] }, // 12 wraith spawn
];

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: 0.03,
    });
  }

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Floor and perimeter: 44 x 30 m, 4.6 m walls, open to the sky.
  box(44.4, 0.4, 30.4, 0, -0.2, 0, 'canvas');
  box(0.4, 4.6, 30.4, -22.2, 2.3, 0, 'surface');
  box(0.4, 4.6, 30.4, 22.2, 2.3, 0, 'surface');
  box(44.4, 4.6, 0.4, 0, 2.3, -15.2, 'surface');
  box(44.4, 4.6, 0.4, 0, 2.3, 15.2, 'surface');

  // Mid wall at z = 0 with a 14 m gap in the middle: the only crossing is the mid
  // connector, the west lane and the east lane.
  box(15, 3.4, 0.6, -14.5, 1.7, 0, 'surface');
  box(15, 3.4, 0.6, 14.5, 1.7, 0, 'surface');

  // Site platforms, 0.5 m high: a planter can stand on one and see the whole site.
  box(6, 0.5, 4, -16, 0.25, -10, 'surface');
  box(6, 0.5, 4, 16, 0.25, -10, 'surface');

  // Cover crates (1.1 m, crouch height) kept off the waypoint lines so bots never
  // have to path around them, and tall pillars (3.2 m) that break sightlines.
  box(1.6, 1.1, 1.6, -11, 0.55, 4, 'hairline');
  box(1.6, 1.1, 1.6, 11, 0.55, 4, 'hairline');
  box(1.6, 1.1, 1.6, -11, 0.55, -4, 'hairline');
  box(1.6, 1.1, 1.6, 11, 0.55, -4, 'hairline');
  box(1.6, 1.1, 1.2, -3.5, 0.55, 0, 'hairline');
  box(1.6, 1.1, 1.2, 3.5, 0.55, 0, 'hairline');
  box(1.6, 1.1, 1.6, -7, 0.55, -8, 'hairline');
  box(1.6, 1.1, 1.6, 7, 0.55, -8, 'hairline');
  box(1.2, 3.2, 1.2, -7, 1.6, 6, 'hairline');
  box(1.2, 3.2, 1.2, 7, 1.6, 6, 'hairline');
  box(1.2, 3.2, 1.2, -7, 1.6, -1.5, 'hairline');
  box(1.2, 3.2, 1.2, 7, 1.6, -1.5, 'hairline');

  // Spawn cover: low walls the defenders start behind.
  box(2.4, 0.9, 1.2, -2.4, 0.45, 10.4, 'hairline');
  box(2.4, 0.9, 1.2, 2.4, 0.45, 10.4, 'hairline');
  box(2.4, 0.9, 1.2, -2.4, 0.45, -10.4, 'hairline');
  box(2.4, 0.9, 1.2, 2.4, 0.45, -10.4, 'hairline');

  // Light: a warm key from the front right, a cool fill from behind, and a sky/ground gradient.
  const sky = new THREE.HemisphereLight(new THREE.Color(PALETTE.surface), new THREE.Color(PALETTE.canvas), 1.1);
  scene.add(sky);

  const key = new THREE.DirectionalLight(new THREE.Color(PALETTE.ink), 2.1);
  key.position.set(14, 20, 10);
  key.target.position.set(0, 0, -3);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -26;
  key.shadow.camera.right = 26;
  key.shadow.camera.top = 26;
  key.shadow.camera.bottom = -26;
  key.shadow.camera.far = 64;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);

  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 0.8);
  fill.position.set(-12, 12, 14);
  scene.add(fill);

  return { colliders, shootables, group };
}
