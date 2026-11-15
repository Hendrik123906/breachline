// The human player: a shared body plus health, armor and two raycastable hit meshes
// the bots aim at. The hit meshes are fully transparent, so the player never sees
// them. Damage and armor work exactly like the bots': armor absorbs half.
import * as THREE from 'three';
import { createBody } from './body.js';

export function createPlayer(scene, colliders, spawn) {
  const body = createBody(colliders, spawn);
  const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.78, 0.3), material);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 16, 12), material);
  torso.userData.part = 'torso';
  head.userData.part = 'head';
  scene.add(torso, head);

  const eyePos = new THREE.Vector3();
  const player = {
    name: 'You',
    team: 'vanguard',
    body,
    health: 100,
    armor: 0,
    alive: true,
    hitMeshes: [torso, head],
  };
  torso.userData.target = player;
  head.userData.target = player;

  function syncMeshes() {
    const pos = body.state.position;
    torso.position.set(pos.x, pos.y + 1.0, pos.z);
    torso.rotation.y = body.state.yaw;
    head.position.set(pos.x, pos.y + 1.53, pos.z);
  }

  function eye() {
    eyePos.set(body.state.position.x, body.state.position.y + body.state.eye, body.state.position.z);
    return eyePos;
  }

  function damage(amount, part, attacker) {
    if (!player.alive) return false;
    let rest = amount;
    if (player.armor > 0) {
      const absorbed = Math.min(player.armor, rest * 0.5);
      player.armor -= absorbed;
      rest -= absorbed;
    }
    player.health -= rest;
    if (player.health > 0) return false;
    player.alive = false;
    return true;
  }

  function step(dt, keys) {
    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const sin = Math.sin(body.state.yaw);
    const cos = Math.cos(body.state.yaw);
    const wishX = -sin * forward + cos * strafe;
    const wishZ = -cos * forward - sin * strafe;
    const jump = keys.has('Space');
    const crouch = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    body.step(dt, wishX, wishZ, jump, crouch);
    syncMeshes();
  }

  function reset(spawnPoint) {
    body.state.position.set(spawnPoint.x, 0, spawnPoint.z);
    body.state.velocity.set(0, 0, 0);
    body.state.yaw = spawnPoint.yaw ?? 0;
    body.state.pitch = 0;
    body.state.eye = 1.6;
    body.state.onGround = true;
    body.state.crouching = false;
    body.state.height = 1.72;
    player.health = 100;
    player.armor = 0;
    player.alive = true;
    syncMeshes();
  }

  syncMeshes();

  player.state = body.state;
  player.eye = eye;
  player.damage = damage;
  player.step = step;
  player.reset = reset;
  player.look = body.look;
  player.recoil = body.recoil;
  player.groundSpeed = body.groundSpeed;
  player.position = () => body.state.position;
  return player;
}
