// The bomb: carried by the WRAITH carrier, planted at site A or B, defused by
// VANGUARD. Plant takes 3 s of holding E inside a site, defuse takes 5 s, and a
// planted bomb detonates after 35 s. Taking damage or leaving the site cancels the
// progress. Events go into a queue main.js drains every frame.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { SITES } from './world.js';

const PLANT_SECONDS = 3;
const DEFUSE_SECONDS = 5;
const DETONATE_SECONDS = 35;
const BLAST_RADIUS = 10;

export function createBomb(scene) {
  const state = { status: 'carried', site: null, progress: 0, timer: 0, carrier: null, planter: null, defuser: null };
  const events = [];

  const group = new THREE.Group();
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.22, 0.24),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.6, metalness: 0.3 }),
  );
  box.castShadow = true;
  const light = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 8, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) }),
  );
  light.position.y = 0.15;
  group.add(box, light);
  group.visible = false;
  scene.add(group);

  function siteOf(actor) {
    const pos = actor.body ? actor.body.state.position : actor.position;
    for (const key of Object.keys(SITES)) {
      const dx = pos.x - SITES[key].x;
      const dz = pos.z - SITES[key].z;
      if (dx * dx + dz * dz < SITES[key].radius * SITES[key].radius) return key;
    }
    return null;
  }

  function explode(actors) {
    const at = group.position;
    for (const actor of actors) {
      if (!actor.alive) continue;
      const pos = actor.body ? actor.body.state.position : actor.position;
      const distance = Math.hypot(pos.x - at.x, pos.z - at.z);
      if (distance > BLAST_RADIUS) continue;
      const damage = distance < 4 ? 200 : Math.round(200 - ((distance - 4) / (BLAST_RADIUS - 4)) * 180);
      actor.damage(damage, 'blast', null);
    }
  }

  return {
    state,
    events,
    siteOf,
    assignCarrier(bot) {
      state.carrier = bot;
      state.status = 'carried';
      state.site = null;
      state.progress = 0;
      state.timer = 0;
      state.planter = null;
      state.defuser = null;
      group.visible = true;
    },
    startPlant(actor) {
      if (state.status !== 'carried') return false;
      const site = siteOf(actor);
      if (!site) return false;
      state.status = 'planting';
      state.planter = actor;
      state.site = site;
      state.progress = 0;
      events.push({ type: 'plant-start', site });
      return true;
    },
    cancelPlant() {
      if (state.status !== 'planting') return;
      state.status = 'carried';
      state.planter = null;
      state.site = null;
      state.progress = 0;
      events.push({ type: 'plant-cancel' });
    },
    startDefuse(actor) {
      if (state.status !== 'planted') return false;
      if (siteOf(actor) !== state.site) return false;
      state.status = 'defusing';
      state.defuser = actor;
      state.progress = 0;
      events.push({ type: 'defuse-start', site: state.site });
      return true;
    },
    cancelDefuse() {
      if (state.status !== 'defusing') return;
      state.status = 'planted';
      state.defuser = null;
      state.progress = 0;
      events.push({ type: 'defuse-cancel' });
    },
    step(dt, actors) {
      if (state.status === 'carried') {
        if (state.carrier && state.carrier.alive) {
          const pos = state.carrier.body.state.position;
          group.position.set(pos.x, 1.0, pos.z);
          group.visible = true;
        } else {
          group.visible = false;
        }
        return;
      }
      if (state.status === 'planting') {
        const planter = state.planter;
        if (!planter || !planter.alive || siteOf(planter) !== state.site) {
          this.cancelPlant();
          return;
        }
        state.progress += dt / PLANT_SECONDS;
        if (state.progress >= 1) {
          state.status = 'planted';
          state.timer = DETONATE_SECONDS;
          state.progress = 0;
          const pos = planter.body.state.position;
          group.position.set(pos.x, 0.15, pos.z);
          group.visible = true;
          events.push({ type: 'planted', site: state.site });
        }
        return;
      }
      if (state.status === 'planted') {
        state.timer -= dt;
        light.visible = Math.floor(state.timer * 2) % 2 === 0;
        if (state.timer <= 0) {
          state.status = 'detonated';
          events.push({ type: 'detonated', site: state.site });
          explode(actors);
          group.visible = false;
        }
        return;
      }
      if (state.status === 'defusing') {
        const defuser = state.defuser;
        if (!defuser || !defuser.alive || siteOf(defuser) !== state.site) {
          this.cancelDefuse();
          return;
        }
        state.progress += dt / DEFUSE_SECONDS;
        if (state.progress >= 1) {
          state.status = 'defused';
          state.progress = 0;
          group.visible = false;
          events.push({ type: 'defused', site: state.site });
        }
      }
    },
    drainEvents() {
      const out = events.splice(0, events.length);
      return out;
    },
    reset(carrier) {
      state.status = 'carried';
      state.site = null;
      state.progress = 0;
      state.timer = 0;
      state.carrier = carrier || null;
      state.planter = null;
      state.defuser = null;
      group.visible = false;
      events.length = 0;
    },
  };
}
