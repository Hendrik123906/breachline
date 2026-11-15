// Weapons: one view model, three guns and two grenades. The guns own their numbers
// (magazine, reserve, fire gap, reload, damage, spread); main.js owns the ray and the
// damage. Grenades are thrown projectiles with a fuse: HE hurts everything near the
// blast, flash blinds whoever is looking at it. Ammo per gun persists across switches
// until the round resets the loadout.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPON_DEFS = {
  pistol: { name: 'P-9 Sidearm', mag: 12, reserve: 48, gap: 0.22, reload: 1.2, torso: 34, head: 100, spreadStill: 0.003, spreadMove: 0.02, auto: false, price: 0, barrel: 0.22, stock: false },
  smg: { name: 'VK-9 SMG', mag: 32, reserve: 96, gap: 0.07, reload: 1.6, torso: 26, head: 80, spreadStill: 0.006, spreadMove: 0.034, auto: true, price: 1500, barrel: 0.3, stock: true },
  rifle: { name: 'AR-77 Rifle', mag: 30, reserve: 90, gap: 0.096, reload: 1.9, torso: 34, head: 100, spreadStill: 0.0022, spreadMove: 0.028, auto: true, price: 2700, barrel: 0.4, stock: true },
};

export const GRENADE_DEFS = {
  he: { name: 'HE Grenade', price: 300, fuse: 1.6, radius: 6, damage: 90 },
  flash: { name: 'Flashbang', price: 200, fuse: 1.4, radius: 12, damage: 0 },
};

const GRAVITY = 12;
const THROW_SPEED = 13;

export function createWeapons(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });

  let model = null;
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);

  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const ammo = {};
  for (const id of Object.keys(WEAPON_DEFS)) ammo[id] = { mag: WEAPON_DEFS[id].mag, reserve: WEAPON_DEFS[id].reserve };
  const state = { id: 'pistol', mag: ammo.pistol.mag, reserve: ammo.pistol.reserve, cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, he: 0, flashCount: 0 };
  const grenades = [];

  function buildModel(def) {
    if (model) {
      camera.remove(model);
      model.traverse((mesh) => { if (mesh.isMesh) mesh.geometry.dispose(); });
    }
    model = new THREE.Group();
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.42), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, def.barrel), grip);
    barrel.position.set(0, 0.025, -0.21 - def.barrel / 2);
    model.add(receiver, barrel);
    if (def.stock) {
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), grip);
      stock.position.set(0, -0.02, 0.3);
      model.add(stock);
    }
    model.position.set(0.24, -0.2, -0.42);
    camera.add(model);
  }
  buildModel(WEAPON_DEFS.pistol);

  function syncState() {
    state.mag = ammo[state.id].mag;
    state.reserve = ammo[state.id].reserve;
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    if (model) {
      model.position.z = -0.42 + state.kick;
      model.rotation.x = state.kick * 2.2;
      if (state.reloadLeft > 0) {
        const def = WEAPON_DEFS[state.id];
        model.rotation.x = -0.55 * Math.min(1, (def.reload - state.reloadLeft) * 2);
      }
    }
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      if (state.reloadLeft === 0) {
        const def = WEAPON_DEFS[state.id];
        const need = def.mag - ammo[state.id].mag;
        const take = Math.min(need, ammo[state.id].reserve);
        ammo[state.id].mag += take;
        ammo[state.id].reserve -= take;
        syncState();
      }
    }
  }

  function stepGrenades(dt, onExplode) {
    for (let index = grenades.length - 1; index >= 0; index -= 1) {
      const grenade = grenades[index];
      grenade.vel.y -= GRAVITY * dt;
      grenade.pos.addScaledVector(grenade.vel, dt);
      if (grenade.pos.y < 0.08) {
        grenade.pos.y = 0.08;
        grenade.vel.y = Math.abs(grenade.vel.y) * 0.4;
        grenade.vel.x *= 0.6;
        grenade.vel.z *= 0.6;
      }
      grenade.fuse -= dt;
      if (grenade.fuse <= 0) {
        grenades.splice(index, 1);
        onExplode({ kind: grenade.kind, pos: grenade.pos.clone() });
      }
    }
  }

  return {
    state,
    def() {
      return WEAPON_DEFS[state.id];
    },
    step,
    stepGrenades,
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = WEAPON_DEFS[state.id].gap;
      state.flash = 0.06;
      state.kick = 0.055;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      ammo[state.id].mag -= 1;
      state.mag = ammo[state.id].mag;
      return true;
    },
    reload() {
      const def = WEAPON_DEFS[state.id];
      if (state.reloadLeft > 0 || state.mag === def.mag || state.reserve === 0) return;
      state.reloadLeft = def.reload;
    },
    spread(speed) {
      const def = WEAPON_DEFS[state.id];
      return def.spreadStill + Math.min(1, speed / 5.2) * def.spreadMove;
    },
    switchTo(id) {
      if (!WEAPON_DEFS[id] || id === state.id) return false;
      state.id = id;
      state.cooldown = 0;
      state.reloadLeft = 0;
      buildModel(WEAPON_DEFS[id]);
      syncState();
      return true;
    },
    buyWeapon(id) {
      ammo[id] = { mag: WEAPON_DEFS[id].mag, reserve: WEAPON_DEFS[id].reserve };
      return this.switchTo(id);
    },
    refill() {
      for (const id of Object.keys(WEAPON_DEFS)) ammo[id] = { mag: WEAPON_DEFS[id].mag, reserve: WEAPON_DEFS[id].reserve };
      state.id = 'pistol';
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.he = 0;
      state.flashCount = 0;
      grenades.length = 0;
      buildModel(WEAPON_DEFS.pistol);
      syncState();
    },
    addGrenades(he, flashCount) {
      state.he += he;
      state.flashCount += flashCount;
    },
    grenadeCounts() {
      return { he: state.he, flash: state.flashCount };
    },
    throwGrenade(kind, origin, direction) {
      if (kind === 'he' && state.he <= 0) return false;
      if (kind === 'flash' && state.flashCount <= 0) return false;
      if (kind === 'he') state.he -= 1;
      else state.flashCount -= 1;
      const vel = direction.clone().multiplyScalar(THROW_SPEED);
      vel.y += 3.5;
      grenades.push({ kind, pos: origin.clone(), vel, fuse: GRENADE_DEFS[kind].fuse });
      return true;
    },
    clearGrenades() {
      grenades.length = 0;
    },
  };
}
