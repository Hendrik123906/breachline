// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the display's rate.
// 4v4 round-based tactical FPS: VANGUARD (you + 3 ally bots) defends, WRAITH (4 bots)
// attacks with the bomb. Rounds, money and the buy menu live in rounds.js; the bomb
// lives in bomb.js; bots live in bot.js. ?shot=start|play|end with &seed=N sets up a
// deterministic frame for a capture, renders it twice, then freezes it and sets
// window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld, SITES, SPAWNS } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapons, WEAPON_DEFS } from './weapons.js';
import { createBot } from './bot.js';
import { createBomb } from './bomb.js';
import { createRounds, BUY_MENU } from './rounds.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 30, 70);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 140);
scene.add(camera);

const world = createWorld(scene);
const bomb = createBomb(scene);
const weapons = createWeapons(camera);
const hud = createHud();
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 80;
const direction = new THREE.Vector3();
const tempVec = new THREE.Vector3();

const player = createPlayer(scene, world.colliders, SPAWNS.vanguard[0]);
const allies = [
  createBot({ scene, colliders: world.colliders, shootables: world.shootables, spawn: SPAWNS.vanguard[1], team: 'vanguard', name: 'VANGUARD-1', random, raycaster }),
  createBot({ scene, colliders: world.colliders, shootables: world.shootables, spawn: SPAWNS.vanguard[2], team: 'vanguard', name: 'VANGUARD-2', random, raycaster }),
  createBot({ scene, colliders: world.colliders, shootables: world.shootables, spawn: SPAWNS.vanguard[3], team: 'vanguard', name: 'VANGUARD-3', random, raycaster }),
];
const enemies = [
  createBot({ scene, colliders: world.colliders, shootables: world.shootables, spawn: SPAWNS.wraith[0], team: 'wraith', name: 'WRAITH-1', random, raycaster }),
  createBot({ scene, colliders: world.colliders, shootables: world.shootables, spawn: SPAWNS.wraith[1], team: 'wraith', name: 'WRAITH-2', random, raycaster }),
  createBot({ scene, colliders: world.colliders, shootables: world.shootables, spawn: SPAWNS.wraith[2], team: 'wraith', name: 'WRAITH-3', random, raycaster }),
  createBot({ scene, colliders: world.colliders, shootables: world.shootables, spawn: SPAWNS.wraith[3], team: 'wraith', name: 'WRAITH-4', random, raycaster }),
];
const vanguard = [player, ...allies];
const wraith = [...enemies];
const allActors = [...vanguard, ...wraith];
const allHitMeshes = [...player.hitMeshes];
for (const bot of [...allies, ...enemies]) allHitMeshes.push(...bot.hitMeshes);
const shootables = world.shootables;

let kills = 0;
let elapsed = 0;
let started = false;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();
let lastHealth = player.health;
let carrier = enemies[0];
let siteNode = 9;
let boughtThisRound = false;
let buyMenuOpen = false;
const prevAlive = new Map(allActors.map((actor) => [actor, true]));

function trackDamage(actor) {
  const original = actor.damage.bind(actor);
  actor.damage = (amount, part, attacker) => {
    actor.lastAttacker = attacker || actor.lastAttacker || null;
    actor.lastDamagePart = part;
    return original(amount, part, attacker);
  };
}
for (const actor of allActors) trackDamage(actor);

const rounds = createRounds({
  onRoundStart(round) {
    setupRound(round);
  },
  onBuy(actor, item) {
    if (item.kind === 'weapon' && actor === player) weapons.buyWeapon(item.id);
    if (item.kind === 'armor') actor.armor = 50;
    if (item.kind === 'grenade' && actor === player) {
      if (item.id === 'he') weapons.addGrenades(1, 0);
      else weapons.addGrenades(0, 1);
    }
    if (actor === player) hud.refreshBuyMenu(rounds.moneyOf(player), rounds.ownedOf(player));
  },
  onMatchEnd(winner) {
    hud.setOverlayCopy(winner === 'vanguard' ? 'VANGUARD wins the match.' : 'WRAITH wins the match.');
    hud.showOverlay('end', kills);
    if (document.pointerLockElement) document.exitPointerLock();
  },
});

function setupRound(round) {
  siteNode = random() < 0.5 ? 9 : 10;
  carrier = enemies[0];
  player.reset(SPAWNS.vanguard[0]);
  if (player.health <= 0) player.health = 100;
  const wasAlive = prevAlive.get(player);
  if (!wasAlive) {
    weapons.refill();
    const owned = rounds.ownedOf(player);
    owned.length = 0;
    owned.push('pistol');
  }
  allies[0].reset(SPAWNS.vanguard[1], 'defend', 9, false);
  allies[1].reset(SPAWNS.vanguard[2], 'defend', 10, false);
  allies[2].reset(SPAWNS.vanguard[3], 'attack', 4, false);
  enemies[0].reset(SPAWNS.wraith[0], 'attack', siteNode, true);
  enemies[1].reset(SPAWNS.wraith[1], 'attack', siteNode, false);
  enemies[2].reset(SPAWNS.wraith[2], 'attack', siteNode, false);
  enemies[3].reset(SPAWNS.wraith[3], 'attack', siteNode, false);
  bomb.reset(carrier);
  for (const actor of allActors) prevAlive.set(actor, true);
  boughtThisRound = false;
  buyMenuOpen = false;
  hud.hideBuyMenu();
  hud.hideBanner();
  lastHealth = player.health;
  hud.setScore(kills);
  syncHud();
}

function syncHud() {
  hud.setHealth(player.health, player.armor);
  hud.setMoney(rounds.moneyOf(player));
  hud.setRoundScore(rounds.state.vanguardWins, rounds.state.wraithWins);
  hud.setAlive(vanguard.filter((a) => a.alive).length, wraith.filter((a) => a.alive).length);
  const def = weapons.def();
  hud.setAmmo(weapons.state.mag, weapons.state.reserve, def.name, weapons.grenadeCounts());
  const phase = rounds.state.phase;
  const seconds = phase === 'freeze' ? rounds.state.freezeLeft : phase === 'live' ? rounds.state.roundLeft : rounds.state.endLeft;
  hud.setTimer(seconds, phase);
  const bombState = bomb.state;
  if (bombState.status === 'planted') hud.setBomb('planted', bombState.timer, 0);
  else if (bombState.status === 'planting') hud.setBomb('planting', 0, bombState.progress);
  else if (bombState.status === 'defusing') hud.setBomb('defusing', 0, bombState.progress);
  else hud.setBomb('', 0, 0);
  hud.setCrosshair(4 + weapons.spread(player.groundSpeed()) * 400);
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
    if (buyMenuOpen) {
      buyMenuOpen = false;
      hud.hideBuyMenu();
    }
  } else if (player.alive && rounds.state.phase !== 'match-end') {
    hud.showOverlay(started ? 'paused' : 'start', kills);
  }
}

hud.onPlay(() => {
  if (shot) return;
  if (rounds.state.matchOver) {
    kills = 0;
    rounds.startMatch(allActors);
    rounds.startRound();
    input.requestLock();
    return;
  }
  if (!player.alive) {
    hud.hideOverlay();
    return;
  }
  input.requestLock();
});

hud.onBuy((itemId) => {
  if (rounds.buy(player, itemId)) {
    hud.refreshBuyMenu(rounds.moneyOf(player), rounds.ownedOf(player));
  }
});

function noiseAt(pos) {
  for (const bot of [...allies, ...enemies]) bot.hearNoise(pos);
}

function checkDeaths() {
  for (const actor of allActors) {
    const was = prevAlive.get(actor);
    if (was && !actor.alive) {
      prevAlive.set(actor, false);
      const killer = actor.lastAttacker;
      const part = actor.lastDamagePart;
      if (killer && killer !== actor) {
        hud.addKill(`${killer.name} ▸ ${actor.name}`);
        rounds.awardKill(killer);
        if (killer === player) {
          kills += 1;
          hud.setScore(kills);
        }
      } else if (part === 'blast') {
        hud.addKill(`Bomb ▸ ${actor.name}`);
      } else {
        hud.addKill(`${actor.name} is down`);
      }
      if (actor === carrier) {
        const next = wraith.find((bot) => bot.alive);
        if (next) {
          carrier = next;
          next.isCarrier = true;
          if (bomb.state.status === 'carried') bomb.assignCarrier(next);
        }
      }
      if (actor === player) {
        hud.showOverlay('dead', kills);
        if (document.pointerLockElement) document.exitPointerLock();
      }
    }
  }
}

function checkElimination() {
  if (rounds.state.phase !== 'live') return;
  const vanguardAlive = vanguard.some((a) => a.alive);
  const wraithAlive = wraith.some((a) => a.alive);
  if (!vanguardAlive) rounds.endRound('wraith', 'elimination');
  else if (!wraithAlive) rounds.endRound('vanguard', 'elimination');
}

function drainBombEvents() {
  for (const event of bomb.drainEvents()) {
    if (event.type === 'planted') {
      hud.showBanner('BOMB PLANTED', `Site ${event.site} — defuse it, VANGUARD`);
      hud.addKill(`Bomb planted at site ${event.site}`);
      for (const ally of allies) if (ally.alive) ally.setObjective(event.site === 'A' ? 9 : 10);
      for (const enemy of enemies) if (enemy.alive) enemy.setObjective(event.site === 'A' ? 9 : 10);
    } else if (event.type === 'defused') {
      rounds.endRound('vanguard', 'defused');
    } else if (event.type === 'detonated') {
      rounds.endRound('wraith', 'detonation');
    }
  }
}

function drainRoundEvents() {
  for (const event of rounds.drainEvents()) {
    if (event.type === 'round-end') {
      const won = event.winner === 'vanguard';
      hud.showBanner(won ? 'VANGUARD WINS THE ROUND' : 'WRAITH WINS THE ROUND', event.reason);
    } else if (event.type === 'round-live') {
      hud.hideBanner();
    }
  }
}

function shoot(spread) {
  if (!weapons.takeRound()) return false;
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  const hit = raycaster.intersectObjects(shootables.concat(allHitMeshes), false)[0];
  if (hit) {
    const target = hit.object.userData.target;
    if (target && target !== player) {
      const def = weapons.def();
      const killed = target.damage(hit.object.userData.part === 'head' ? def.head : def.torso, hit.object.userData.part, player);
      hud.hitMarker(killed, shot ? 4000 : 90);
      noiseAt(player.position());
    }
  }
  weapons.pullTrigger();
  player.recoil(0.009 + random() * 0.004, (random() * 2 - 1) * 0.004);
  const def = weapons.def();
  hud.setAmmo(weapons.state.mag, weapons.state.reserve, def.name, weapons.grenadeCounts());
  return true;
}

function explodeGrenade(blast) {
  if (blast.kind === 'he') {
    for (const actor of allActors) {
      if (!actor.alive) continue;
      const pos = actor.body.state.position;
      const distance = Math.hypot(pos.x - blast.pos.x, pos.z - blast.pos.z);
      if (distance > 6) continue;
      const damage = distance < 2 ? 90 : Math.round(90 - ((distance - 2) / 4) * 70);
      actor.damage(damage, 'blast', player);
    }
    noiseAt(blast.pos);
  } else {
    const eyePos = player.eye();
    tempVec.copy(blast.pos).sub(eyePos);
    const distance = tempVec.length();
    if (distance < 12 && player.alive) {
      camera.getWorldDirection(direction);
      const facing = direction.dot(tempVec.normalize());
      if (facing > 0.2) hud.flashbang((1 - distance / 12) * (facing > 0.7 ? 1 : 0.5));
    }
    for (const bot of [...allies, ...enemies]) {
      const pos = bot.body.state.position;
      if (Math.hypot(pos.x - blast.pos.x, pos.z - blast.pos.z) < 12) bot.setBlind(2);
    }
    noiseAt(blast.pos);
  }
}

function handlePressed(codes) {
  for (const code of codes) {
    if (code === 'KeyB' && rounds.state.phase === 'freeze' && player.alive) {
      buyMenuOpen = !buyMenuOpen;
      if (buyMenuOpen) {
        hud.showBuyMenu(rounds.moneyOf(player), rounds.ownedOf(player));
        if (document.pointerLockElement) document.exitPointerLock();
      } else {
        hud.hideBuyMenu();
        input.requestLock();
      }
    }
    if (code === 'KeyE' && rounds.state.phase === 'live' && player.alive) {
      if (bomb.state.status === 'planted') bomb.startDefuse(player);
      else if (bomb.state.status === 'defusing') bomb.cancelDefuse();
    }
    if (code === 'KeyG' && rounds.state.phase === 'live' && player.alive) {
      const counts = weapons.grenadeCounts();
      const kind = counts.he > 0 ? 'he' : counts.flash > 0 ? 'flash' : null;
      if (kind) {
        camera.getWorldDirection(direction);
        tempVec.copy(player.eye()).addScaledVector(direction, 0.5);
        weapons.throwGrenade(kind, tempVec, direction);
      }
    }
    if (code === 'Digit1') weapons.switchTo('pistol');
    if (code === 'Digit2' && rounds.ownedOf(player).includes('smg')) weapons.switchTo('smg');
    if (code === 'Digit3' && rounds.ownedOf(player).includes('rifle')) weapons.switchTo('rifle');
    if (buyMenuOpen) {
      const index = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].indexOf(code);
      if (index >= 0 && index < BUY_MENU.length) {
        if (rounds.buy(player, BUY_MENU[index].id)) hud.refreshBuyMenu(rounds.moneyOf(player), rounds.ownedOf(player));
      }
    }
  }
}

function syncCamera() {
  camera.position.set(player.state.position.x, player.state.position.y + player.state.eye, player.state.position.z);
  camera.rotation.set(player.state.pitch, player.state.yaw, 0, 'YXZ');
}

function step(dt) {
  elapsed += dt;
  const phase = rounds.state.phase;
  rounds.update(dt, bomb.state.status);
  drainRoundEvents();
  if (phase === 'live' && player.alive) {
    player.step(dt, input.state.keys);
    weapons.step(dt);
    weapons.stepGrenades(dt, explodeGrenade);
    const pressed = input.takePressed();
    if (pressed.length > 0) handlePressed(pressed);
    if (input.state.firing && weapons.ready()) shoot(shot ? 0 : weapons.spread(player.groundSpeed()));
    if (input.state.keys.has('KeyR')) weapons.reload();
  } else if (phase === 'freeze') {
    weapons.step(dt);
    const pressed = input.takePressed();
    if (pressed.length > 0) handlePressed(pressed);
    if (!boughtThisRound) {
      boughtThisRound = true;
      for (const bot of [...allies, ...enemies]) rounds.botAutoBuy(bot);
    }
  } else {
    weapons.step(dt);
  }
  if (phase !== 'freeze') {
    for (const ally of allies) ally.step(dt, { enemies: wraith });
    for (const enemy of enemies) enemy.step(dt, { enemies: vanguard });
  }
  bomb.step(dt, allActors);
  drainBombEvents();
  if (phase === 'live' && bomb.state.status === 'carried' && carrier.alive && !carrier.visibleEnemy) {
    if (bomb.siteOf(carrier)) bomb.startPlant(carrier);
  }
  for (const bot of allies) {
    if (bot.role === 'attack' && bot.pathIndex >= bot.path.length && bot.state === 'advance') {
      bot.setObjective([4, 11, 5, 6][Math.floor(random() * 4)]);
    }
  }
  if (player.health < lastHealth) hud.damageFlash();
  lastHealth = player.health;
  checkDeaths();
  checkElimination();
  syncHud();
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (player.alive && rounds.state.phase === 'live') player.look(look.x, look.y);
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function aimAt(point) {
  const body = player.state;
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBanner();
  const body = player.state;
  body.pitch = 0;
  body.yaw = 0;
  if (name === 'play') {
    body.position.set(0, 0, 4);
    enemies[0].reset({ x: 2, z: -4, yaw: 0 }, 'attack', 9, true);
    enemies[0].group.position.set(2, 0, -4);
    settle(20);
    const point = new THREE.Vector3(2, 1.0, -4);
    for (let round = 0; round < 5; round += 1) {
      aimAt(point);
      shoot(0);
      if (round < 4) settle(8);
    }
    for (let tick = 0; tick < 24; tick += 1) enemies[0].step(FIXED_STEP, { enemies: vanguard });
    settle(12);
  } else if (name === 'end') {
    body.position.set(0, 0, 6);
    settle(20);
    aimAt(new THREE.Vector3(-16, 1, -10));
    rounds.state.vanguardWins = 1;
    rounds.state.phase = 'ended';
    rounds.state.endLeft = 4;
    hud.showBanner('VANGUARD WINS THE ROUND', 'Bomb defused');
    syncHud();
    settle(10);
  } else {
    body.position.set(0, 0, 12);
    settle(20);
    aimAt(new THREE.Vector3(0, 1.5, -6));
    hud.showOverlay('start', 0);
  }
  const def = weapons.def();
  hud.setAmmo(weapons.state.mag, weapons.state.reserve, def.name, weapons.grenadeCounts());
  hud.setScore(kills);
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

rounds.startMatch(allActors);
rounds.startRound();
window.__breachline = { player, allies, enemies, rounds, bomb, weapons, get kills() { return kills; } };
syncCamera();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
