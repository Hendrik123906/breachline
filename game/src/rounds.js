// Rounds and economy: freeze (buy) -> live -> round end -> next round. First team
// to 5 round wins takes the match. Money: $800 to start, +$300 per kill, +$3250 for
// a round win, +$1900 for a loss. Weapons survive a round only if their owner does.
// The round timer stops while a bomb is planted: the round then ends on detonation,
// defusal or elimination. main.js owns actor positions and calls the hooks here.
import { WEAPON_DEFS, GRENADE_DEFS } from './weapons.js';

const FREEZE_SECONDS = 8;
const ROUND_SECONDS = 100;
const END_SECONDS = 4;
const WIN_ROUNDS = 5;
const START_MONEY = 800;
const KILL_REWARD = 300;
const WIN_REWARD = 3250;
const LOSS_REWARD = 1900;
const ARMOR_PRICE = 650;
const ARMOR_VALUE = 50;

export const BUY_MENU = [
  { id: 'rifle', name: WEAPON_DEFS.rifle.name, price: WEAPON_DEFS.rifle.price, kind: 'weapon' },
  { id: 'smg', name: WEAPON_DEFS.smg.name, price: WEAPON_DEFS.smg.price, kind: 'weapon' },
  { id: 'armor', name: 'Kevlar Armor', price: ARMOR_PRICE, kind: 'armor' },
  { id: 'he', name: GRENADE_DEFS.he.name, price: GRENADE_DEFS.he.price, kind: 'grenade' },
  { id: 'flash', name: GRENADE_DEFS.flash.name, price: GRENADE_DEFS.flash.price, kind: 'grenade' },
];

export function createRounds(hooks) {
  const state = {
    phase: 'freeze',
    round: 1,
    freezeLeft: FREEZE_SECONDS,
    roundLeft: ROUND_SECONDS,
    endLeft: 0,
    vanguardWins: 0,
    wraithWins: 0,
    winner: null,
    reason: '',
    matchOver: false,
  };
  const money = new Map();
  const owned = new Map();
  const events = [];

  function setMoney(actor, amount) {
    money.set(actor, amount);
  }
  function getMoney(actor) {
    return money.get(actor) ?? START_MONEY;
  }
  function getOwned(actor) {
    let list = owned.get(actor);
    if (!list) {
      list = ['pistol'];
      owned.set(actor, list);
    }
    return list;
  }

  function startMatch(actors) {
    state.phase = 'freeze';
    state.round = 1;
    state.freezeLeft = FREEZE_SECONDS;
    state.roundLeft = ROUND_SECONDS;
    state.endLeft = 0;
    state.vanguardWins = 0;
    state.wraithWins = 0;
    state.winner = null;
    state.reason = '';
    state.matchOver = false;
    money.clear();
    owned.clear();
    for (const actor of actors) {
      money.set(actor, START_MONEY);
      owned.set(actor, ['pistol']);
    }
    events.push({ type: 'match-start' });
  }

  function startRound() {
    state.phase = 'freeze';
    state.freezeLeft = FREEZE_SECONDS;
    state.roundLeft = ROUND_SECONDS;
    state.endLeft = 0;
    state.winner = null;
    state.reason = '';
    events.push({ type: 'round-start', round: state.round });
    if (hooks.onRoundStart) hooks.onRoundStart(state.round);
  }

  function endRound(winner, reason) {
    if (state.phase === 'ended' || state.phase === 'match-end') return;
    state.winner = winner;
    state.reason = reason;
    if (winner === 'vanguard') state.vanguardWins += 1;
    else state.wraithWins += 1;
    for (const [actor, amount] of money) {
      const team = actor.team || 'vanguard';
      money.set(actor, amount + (team === winner ? WIN_REWARD : LOSS_REWARD));
    }
    events.push({ type: 'round-end', winner, reason, round: state.round });
    if (state.vanguardWins >= WIN_ROUNDS || state.wraithWins >= WIN_ROUNDS) {
      state.phase = 'match-end';
      state.matchOver = true;
      events.push({ type: 'match-end', winner: state.vanguardWins >= WIN_ROUNDS ? 'vanguard' : 'wraith' });
      if (hooks.onMatchEnd) hooks.onMatchEnd(state.vanguardWins >= WIN_ROUNDS ? 'vanguard' : 'wraith');
    } else {
      state.phase = 'ended';
      state.endLeft = END_SECONDS;
    }
  }

  function awardKill(killer) {
    if (!killer) return;
    money.set(killer, getMoney(killer) + KILL_REWARD);
    events.push({ type: 'kill-reward', killer });
  }

  function buy(actor, itemId) {
    if (state.phase !== 'freeze') return false;
    const item = BUY_MENU.find((entry) => entry.id === itemId);
    if (!item) return false;
    if (getMoney(actor) < item.price) return false;
    const list = getOwned(actor);
    if (item.kind === 'weapon' && list.includes(itemId)) return false;
    if (item.kind === 'armor' && actor.armor >= ARMOR_VALUE) return false;
    money.set(actor, getMoney(actor) - item.price);
    if (item.kind === 'weapon') list.push(itemId);
    events.push({ type: 'buy', actor, item: itemId });
    if (hooks.onBuy) hooks.onBuy(actor, item);
    return true;
  }

  function botAutoBuy(bot) {
    const funds = getMoney(bot);
    const list = getOwned(bot);
    if (funds >= WEAPON_DEFS.rifle.price && !list.includes('rifle')) {
      buy(bot, 'rifle');
    } else if (funds >= WEAPON_DEFS.smg.price && !list.includes('smg') && !list.includes('rifle')) {
      buy(bot, 'smg');
    }
    if (getMoney(bot) >= ARMOR_PRICE && bot.armor < ARMOR_VALUE) buy(bot, 'armor');
    if (getMoney(bot) >= GRENADE_DEFS.he.price) buy(bot, 'he');
    if (getMoney(bot) >= GRENADE_DEFS.flash.price) buy(bot, 'flash');
  }

  function update(dt, bombStatus) {
    if (state.phase === 'freeze') {
      state.freezeLeft -= dt;
      if (state.freezeLeft <= 0) {
        state.phase = 'live';
        events.push({ type: 'round-live', round: state.round });
      }
      return;
    }
    if (state.phase === 'live') {
      if (bombStatus !== 'planted' && bombStatus !== 'defusing') {
        state.roundLeft -= dt;
        if (state.roundLeft <= 0) {
          endRound('vanguard', 'time');
          return;
        }
      }
      return;
    }
    if (state.phase === 'ended') {
      state.endLeft -= dt;
      if (state.endLeft <= 0) {
        state.round += 1;
        startRound();
      }
    }
  }

  return {
    state,
    events,
    startMatch,
    startRound,
    endRound,
    awardKill,
    buy,
    botAutoBuy,
    update,
    moneyOf: getMoney,
    setMoney,
    ownedOf: getOwned,
    drainEvents() {
      return events.splice(0, events.length);
    },
  };
}
