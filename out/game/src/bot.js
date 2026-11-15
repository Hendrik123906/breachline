// Bots: 4v4 teammates and enemies. Each bot is a body (shared movement core) with a
// mesh, health, a rifle and a small state machine: advance along the waypoint graph,
// hold a position, engage a visible enemy, or investigate a noise. Attackers push a
// site and the carrier plants; defenders hold the sites and rotate to a planted bomb.
// Reaction delay, spread and strafing keep them beatable; a flashbang blinds them.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createBody } from './body.js';
import { WAYPOINTS } from './world.js';

const BOT_SPEED = 4.2;
const REACT_MIN = 0.35;
const REACT_MAX = 0.6;
const FIRE_GAP = 0.14;
const TORSO_DAMAGE = 14;
const HEAD_DAMAGE = 34;
const HEAD_CHANCE = 0.12;
const VIEW_DISTANCE = 42;
const ARRIVE_DISTANCE = 0.8;
const STUCK_SECONDS = 3;

function nearestNode(x, z) {
  let best = 0;
  let bestDist = Infinity;
  for (let index = 0; index < WAYPOINTS.length; index += 1) {
    const dx = WAYPOINTS[index].x - x;
    const dz = WAYPOINTS[index].z - z;
    const dist = dx * dx + dz * dz;
    if (dist < bestDist) {
      bestDist = dist;
      best = index;
    }
  }
  return best;
}

function findPath(from, to) {
  if (from === to) return [to];
  const prev = new Array(WAYPOINTS.length).fill(-1);
  const queue = [from];
  prev[from] = from;
  while (queue.length > 0) {
    const node = queue.shift();
    for (const link of WAYPOINTS[node].links) {
      if (prev[link] !== -1) continue;
      prev[link] = node;
      if (link === to) {
        const path = [to];
        let at = to;
        while (at !== from) {
          at = prev[at];
          path.unshift(at);
        }
        return path;
      }
      queue.push(link);
    }
  }
  return [to];
}

export function createBot(options) {
  const { scene, colliders, shootables, spawn, team, name, random, raycaster } = options;
  const body = createBody(colliders, spawn);

  const torsoMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(team === 'vanguard' ? PALETTE.ink : PALETTE.surface),
    roughness: 0.6,
    metalness: 0.05,
  });
  const headMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(team === 'vanguard' ? PALETTE.accent : PALETTE.muted),
    roughness: 0.45,
    metalness: 0.1,
  });
  const legMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.85 });

  const group = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.78, 0.3), torsoMaterial);
  torso.position.y = 1.0;
  torso.userData.part = 'torso';
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 16, 12), headMaterial);
  head.position.y = 1.53;
  head.userData.part = 'head';
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.55, 0.26), legMaterial);
  legs.position.y = 0.28;
  group.add(torso, head, legs);
  group.traverse((mesh) => {
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  group.position.copy(body.state.position);
  scene.add(group);

  const tracerMaterial = new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.85 });
  const tracerGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const tracer = new THREE.Line(tracerGeometry, tracerMaterial);
  tracer.visible = false;
  tracer.frustumCulled = false;
  scene.add(tracer);

  const bot = {
    name,
    team,
    body,
    group,
    hitMeshes: [torso, head],
    health: 100,
    armor: 0,
    alive: true,
    isCarrier: false,
    role: 'attack',
    targetNode: 9,
    path: [],
    pathIndex: 0,
    state: 'advance',
    visibleEnemy: null,
    reactLeft: 0,
    fireLeft: 0,
    strafeDir: 1,
    strafeLeft: 0,
    holdLeft: 0,
    blindLeft: 0,
    noisePos: null,
    stuckLeft: STUCK_SECONDS,
    lastX: spawn.x,
    lastZ: spawn.z,
    fall: 0,
    plantLeft: 0,
  };
  torso.userData.target = bot;
  head.userData.target = bot;

  const eyePos = new THREE.Vector3();
  const targetEye = new THREE.Vector3();
  const toTarget = new THREE.Vector3();
  const wish = new THREE.Vector3();

  function eye() {
    eyePos.set(body.state.position.x, body.state.position.y + body.state.eye, body.state.position.z);
    return eyePos;
  }

  function faceToward(x, z) {
    const dx = x - body.state.position.x;
    const dz = z - body.state.position.z;
    if (dx * dx + dz * dz < 0.0001) return;
    body.state.yaw = Math.atan2(-dx, -dz);
  }

  function rebuildPath() {
    const from = nearestNode(body.state.position.x, body.state.position.z);
    bot.path = findPath(from, bot.targetNode);
    bot.pathIndex = bot.path[0] === from ? 1 : 0;
  }

  function visibleEnemies(enemies) {
    const seen = [];
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      toTarget.copy(enemy.eye()).sub(eye());
      const distance = toTarget.length();
      if (distance > VIEW_DISTANCE) continue;
      raycaster.set(eye(), toTarget.normalize());
      raycaster.far = distance + 0.5;
      const hit = raycaster.intersectObjects(shootables.concat(enemy.hitMeshes), false)[0];
      if (hit && enemy.hitMeshes.includes(hit.object)) seen.push({ enemy, distance });
    }
    seen.sort((a, b) => a.distance - b.distance);
    return seen;
  }

  function shootAt(enemy, distance) {
    if (bot.fireLeft > 0) return;
    bot.fireLeft = FIRE_GAP;
    const muzzle = eye().clone();
    muzzle.addScaledVector(toTarget, 0.5);
    const aim = enemy.eye().clone();
    const error = (bot.blindLeft > 0 ? 1.6 : 0.35) + distance * 0.012;
    aim.x += (random() * 2 - 1) * error;
    aim.y += (random() * 2 - 1) * error * 0.6;
    aim.z += (random() * 2 - 1) * error;
    tracer.geometry.setFromPoints([muzzle, aim]);
    tracer.visible = true;
    setTimeout(() => { tracer.visible = false; }, 70);
    let chance = bot.blindLeft > 0 ? 0.05 : Math.max(0.22, 0.55 - distance * 0.01);
    if (random() > chance) return;
    const headshot = random() < HEAD_CHANCE;
    enemy.damage(headshot ? HEAD_DAMAGE : TORSO_DAMAGE, headshot ? 'head' : 'torso', bot);
  }

  function damage(amount, part, attacker) {
    if (!bot.alive) return false;
    let rest = amount;
    if (bot.armor > 0) {
      const absorbed = Math.min(bot.armor, rest * 0.5);
      bot.armor -= absorbed;
      rest -= absorbed;
    }
    bot.health -= rest;
    if (attacker) bot.noisePos = attacker.body ? attacker.body.state.position.clone() : null;
    if (bot.health > 0) return false;
    bot.alive = false;
    bot.fall = 0;
    bot.state = 'dead';
    return true;
  }

  function step(dt, ctx) {
    if (!bot.alive) {
      bot.fall = Math.min(1, bot.fall + dt / 0.4);
      group.rotation.x = -bot.fall * 1.45;
      return;
    }
    bot.fireLeft = Math.max(0, bot.fireLeft - dt);
    bot.blindLeft = Math.max(0, bot.blindLeft - dt);
    bot.reactLeft = Math.max(0, bot.reactLeft - dt);

    const seen = bot.blindLeft > 0 ? [] : visibleEnemies(ctx.enemies);
    const nearest = seen[0] || null;
    if (nearest && bot.visibleEnemy !== nearest.enemy) {
      bot.visibleEnemy = nearest.enemy;
      bot.reactLeft = REACT_MIN + random() * (REACT_MAX - REACT_MIN);
      bot.state = 'engage';
    } else if (!nearest) {
      bot.visibleEnemy = null;
      if (bot.state === 'engage') bot.state = bot.role === 'defend' ? 'hold' : 'advance';
    }

    if (bot.state === 'engage' && bot.visibleEnemy) {
      const enemy = bot.visibleEnemy;
      targetEye.copy(enemy.eye());
      faceToward(targetEye.x, targetEye.z);
      bot.strafeLeft -= dt;
      if (bot.strafeLeft <= 0) {
        bot.strafeDir = random() < 0.5 ? -1 : 1;
        bot.strafeLeft = 0.8 + random() * 0.7;
      }
      const distance = eye().distanceTo(targetEye);
      const sin = Math.sin(body.state.yaw);
      const cos = Math.cos(body.state.yaw);
      const strafeX = cos * bot.strafeDir;
      const strafeZ = -sin * bot.strafeDir;
      const holdDistance = distance > 16 ? 1 : 0;
      wish.set(-sin * holdDistance + strafeX * 0.6, 0, -cos * holdDistance - strafeZ * 0.6);
      body.step(dt, wish.x, wish.z, false, false);
      if (bot.reactLeft <= 0) shootAt(enemy, distance);
      group.position.copy(body.state.position);
      group.rotation.y = body.state.yaw;
      return;
    }

    if (bot.noisePos && bot.state !== 'engage') {
      const dx = bot.noisePos.x - body.state.position.x;
      const dz = bot.noisePos.z - body.state.position.z;
      if (dx * dx + dz * dz < 4) {
        bot.noisePos = null;
      } else {
        faceToward(bot.noisePos.x, bot.noisePos.z);
        const sin = Math.sin(body.state.yaw);
        const cos = Math.cos(body.state.yaw);
        body.step(dt, -sin, -cos, false, false);
        group.position.copy(body.state.position);
        group.rotation.y = body.state.yaw;
        return;
      }
    }

    if (bot.role === 'defend' || bot.state === 'hold') {
      bot.holdLeft -= dt;
      if (bot.holdLeft <= 0) {
        body.state.yaw += (random() * 2 - 1) * 1.2;
        bot.holdLeft = 1.5 + random() * 2;
      }
      body.step(dt, 0, 0, false, false);
      group.position.copy(body.state.position);
      group.rotation.y = body.state.yaw;
      return;
    }

    if (bot.path.length === 0 || bot.pathIndex >= bot.path.length) rebuildPath();
    const node = WAYPOINTS[bot.path[bot.pathIndex]];
    if (!node) return;
    const dx = node.x - body.state.position.x;
    const dz = node.z - body.state.position.z;
    const distSq = dx * dx + dz * dz;
    if (distSq < ARRIVE_DISTANCE * ARRIVE_DISTANCE) {
      bot.pathIndex += 1;
      bot.stuckLeft = STUCK_SECONDS;
      return;
    }
    const moved = Math.hypot(body.state.position.x - bot.lastX, body.state.position.z - bot.lastZ);
    bot.lastX = body.state.position.x;
    bot.lastZ = body.state.position.z;
    if (moved < 0.01) {
      bot.stuckLeft -= dt;
      if (bot.stuckLeft <= 0) {
        rebuildPath();
        bot.stuckLeft = STUCK_SECONDS;
        return;
      }
    } else {
      bot.stuckLeft = STUCK_SECONDS;
    }
    faceToward(node.x, node.z);
    const sin = Math.sin(body.state.yaw);
    const cos = Math.cos(body.state.yaw);
    body.step(dt, -sin, -cos, false, false);
    group.position.copy(body.state.position);
  }

  function reset(spawnPoint, role, targetNode, carrier) {
    body.state.position.set(spawnPoint.x, 0, spawnPoint.z);
    body.state.velocity.set(0, 0, 0);
    body.state.yaw = spawnPoint.yaw ?? 0;
    body.state.pitch = 0;
    body.state.eye = 1.6;
    body.state.onGround = true;
    body.state.crouching = false;
    body.state.height = 1.72;
    group.position.copy(body.state.position);
    group.rotation.set(0, 0, 0);
    bot.health = 100;
    bot.armor = 0;
    bot.alive = true;
    bot.fall = 0;
    bot.role = role;
    bot.targetNode = targetNode;
    bot.isCarrier = carrier;
    bot.path = [];
    bot.pathIndex = 0;
    bot.state = role === 'defend' ? 'hold' : 'advance';
    bot.visibleEnemy = null;
    bot.reactLeft = 0;
    bot.fireLeft = 0;
    bot.blindLeft = 0;
    bot.noisePos = null;
    bot.holdLeft = 0;
    bot.plantLeft = 0;
    bot.stuckLeft = STUCK_SECONDS;
    bot.lastX = spawnPoint.x;
    bot.lastZ = spawnPoint.z;
  }

  bot.eye = eye;
  bot.damage = damage;
  bot.step = step;
  bot.reset = reset;
  bot.setObjective = (node) => {
    bot.targetNode = node;
    bot.path = [];
    bot.pathIndex = 0;
  };
  bot.hearNoise = (pos) => {
    if (!bot.alive || bot.state === 'engage') return;
    const dx = pos.x - body.state.position.x;
    const dz = pos.z - body.state.position.z;
    if (dx * dx + dz * dz < 625) bot.noisePos = pos.clone();
  };
  bot.setBlind = (seconds) => {
    bot.blindLeft = Math.max(bot.blindLeft, seconds);
  };
  bot.position = () => body.state.position;
  return bot;
}
