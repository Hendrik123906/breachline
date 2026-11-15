// The DOM HUD: health, armor, money, timer, round score, alive counts, bomb status,
// killfeed, buy menu, banners, a dynamic crosshair and flash/damage overlays. It never
// touches the simulation; main.js pushes numbers in and reads the play/buy callbacks out.
import { BUY_MENU } from './rounds.js';

const COPY = {
  start: {
    title: 'BREACHLINE',
    copy: 'VANGUARD vs WRAITH, first to 5 rounds. Plant or defuse the bomb — or wipe the enemy team. Click to play.',
    action: 'Click to play',
  },
  paused: {
    title: 'BREACHLINE',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  dead: {
    title: 'You are down',
    copy: 'Your team is still fighting. You are back next round.',
    action: 'Keep watching',
  },
  end: {
    title: 'Match over',
    copy: '',
    action: 'Play again',
  },
};

export function createHud() {
  const overlay = document.getElementById('overlay');
  const title = document.getElementById('overlay-title');
  const copy = document.getElementById('overlay-copy');
  const play = document.getElementById('play');
  const ammo = document.getElementById('ammo');
  const ammoMag = document.getElementById('ammo-mag');
  const ammoReserve = document.getElementById('ammo-reserve');
  const weaponName = document.getElementById('weapon-name');
  const grenades = document.getElementById('grenades');
  const scoreValue = document.getElementById('score-value');
  const hitmarker = document.getElementById('hitmarker');
  const crosshair = document.getElementById('crosshair');
  const healthValue = document.getElementById('health-value');
  const armorValue = document.getElementById('armor-value');
  const moneyValue = document.getElementById('money-value');
  const timerValue = document.getElementById('timer-value');
  const roundScore = document.getElementById('round-score');
  const aliveValue = document.getElementById('alive-value');
  const bombStatus = document.getElementById('bomb-status');
  const bombProgress = document.getElementById('bomb-progress');
  const bombBar = document.getElementById('bomb-bar');
  const killfeed = document.getElementById('killfeed');
  const buymenu = document.getElementById('buymenu');
  const buymenuItems = document.getElementById('buymenu-items');
  const buymenuMoney = document.getElementById('buymenu-money');
  const banner = document.getElementById('banner');
  const bannerTitle = document.getElementById('banner-title');
  const bannerSub = document.getElementById('banner-sub');
  const flashOverlay = document.getElementById('flash-overlay');
  const damageOverlay = document.getElementById('damage-overlay');
  let hitTimer = 0;
  let bannerTimer = 0;
  let lastMag = -1;
  let lastReserve = -1;
  let lastScore = -1;
  let lastHealth = -1;
  let lastArmor = -1;
  let lastMoney = -1;
  let lastTimer = '';
  let lastRound = '';
  let lastAlive = '';
  let lastBomb = '';
  let lastWeapon = '';
  let lastGrenades = '';
  let buyHandler = null;

  function formatTime(seconds) {
    const total = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }

  return {
    setAmmo(mag, reserve, name, grenadeCounts) {
      if (mag === lastMag && reserve === lastReserve && name === lastWeapon) return;
      lastMag = mag;
      lastReserve = reserve;
      lastWeapon = name;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      weaponName.textContent = name;
      ammo.classList.toggle('empty', mag === 0);
      const text = `HE ${grenadeCounts.he} · FL ${grenadeCounts.flash}`;
      if (text !== lastGrenades) {
        lastGrenades = text;
        grenades.textContent = text;
      }
    },
    setScore(value) {
      if (value === lastScore) return;
      lastScore = value;
      scoreValue.textContent = String(value);
    },
    setHealth(hp, armor) {
      if (hp === lastHealth && armor === lastArmor) return;
      lastHealth = hp;
      lastArmor = armor;
      healthValue.textContent = String(Math.max(0, Math.ceil(hp)));
      armorValue.textContent = String(Math.max(0, Math.ceil(armor)));
    },
    setMoney(value) {
      if (value === lastMoney) return;
      lastMoney = value;
      moneyValue.textContent = `$${value}`;
      buymenuMoney.textContent = `$${value}`;
    },
    setTimer(seconds, phase) {
      const text = phase === 'freeze' ? `BUY ${formatTime(seconds)}` : formatTime(seconds);
      if (text === lastTimer) return;
      lastTimer = text;
      timerValue.textContent = text;
      timerValue.classList.toggle('buy', phase === 'freeze');
    },
    setRoundScore(vanguard, wraith) {
      const text = `${vanguard} — ${wraith}`;
      if (text === lastRound) return;
      lastRound = text;
      roundScore.textContent = text;
    },
    setAlive(vanguard, wraith) {
      const text = `V ${vanguard} · W ${wraith}`;
      if (text === lastAlive) return;
      lastAlive = text;
      aliveValue.textContent = text;
    },
    setBomb(status, seconds, progress) {
      const text = status === 'planted' ? `BOMB PLANTED ${formatTime(seconds)}`
        : status === 'defusing' ? 'DEFUSING…'
        : status === 'planting' ? 'PLANTING…'
        : '';
      if (text !== lastBomb) {
        lastBomb = text;
        bombStatus.textContent = text;
        bombStatus.hidden = text === '';
      }
      if (status === 'planted') {
        bombBar.style.width = `${Math.max(0, Math.min(100, (seconds / 35) * 100))}%`;
        bombProgress.hidden = false;
      } else if (status === 'planting' || status === 'defusing') {
        bombBar.style.width = `${Math.max(0, Math.min(100, progress * 100))}%`;
        bombProgress.hidden = false;
      } else {
        bombProgress.hidden = true;
      }
    },
    setCrosshair(gapPx) {
      crosshair.style.setProperty('--sp', `${Math.round(gapPx)}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.style.transform = killed ? 'translate(-50%, -50%) rotate(45deg) scale(1.25)' : '';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        hitmarker.classList.remove('on');
        hitmarker.style.transform = '';
      }, holdMs);
    },
    damageFlash() {
      damageOverlay.classList.add('on');
      setTimeout(() => damageOverlay.classList.remove('on'), 140);
    },
    flashbang(strength) {
      flashOverlay.style.opacity = String(Math.max(0, Math.min(1, strength)));
      setTimeout(() => { flashOverlay.style.opacity = '0'; }, 1200);
    },
    addKill(text) {
      const entry = document.createElement('div');
      entry.className = 'killfeed-entry';
      entry.textContent = text;
      killfeed.prepend(entry);
      while (killfeed.children.length > 5) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => entry.remove(), 5000);
    },
    showBuyMenu(money, ownedIds) {
      buymenuItems.innerHTML = '';
      for (const item of BUY_MENU) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'buy-row';
        const ownedItem = ownedIds.includes(item.id);
        row.disabled = ownedItem || money < item.price;
        row.textContent = `${item.name} — $${item.price}${ownedItem ? ' (owned)' : ''}`;
        row.addEventListener('click', () => { if (buyHandler) buyHandler(item.id); });
        buymenuItems.appendChild(row);
      }
      buymenuMoney.textContent = `$${money}`;
      buymenu.hidden = false;
    },
    hideBuyMenu() {
      buymenu.hidden = true;
    },
    buyMenuVisible() {
      return !buymenu.hidden;
    },
    refreshBuyMenu(money, ownedIds) {
      if (buymenu.hidden) return;
      this.showBuyMenu(money, ownedIds);
    },
    showBanner(text, sub) {
      bannerTitle.textContent = text;
      bannerSub.textContent = sub || '';
      banner.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => { banner.hidden = true; }, 3500);
    },
    hideBanner() {
      banner.hidden = true;
      clearTimeout(bannerTimer);
    },
    showOverlay(mode, score) {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = mode === 'end' ? `${text.copy} You scored ${score}.` : text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    setOverlayCopy(text) {
      copy.textContent = text;
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
    onBuy(handler) {
      buyHandler = handler;
    },
  };
}
