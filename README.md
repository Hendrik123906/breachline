# BREACHLINE

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/Hendrik123906/breachline/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/Hendrik123906/breachline/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

A round-based tactical FPS for [make.fun](https://make.fun) competition `threejs-fps-02`.
VANGUARD vs WRAITH, 4v4: plant or defuse the bomb, win the round, spend the
money. Built on three.js, plain static files, no build step, no network.

## What it is

- **First-person combat** — mouse look, WASD movement with acceleration,
  crouching and jumping, collision with the map. A rifle, an SMG and a pistol,
  each with its own damage, fire rate, magazine and spread; recoil and spread
  punish firing on the move, and headshots hurt more than body shots.
- **Bots that fight back** — teammates and enemies move along routes, hold
  positions, react to what they see and hear, and shoot back. Enemies carry
  out the plant; defenders rotate to the planted site.
- **An objective beyond killing** — plant the bomb at site A or B, defend it
  until it detonates, or defuse it. Rounds end in a win or a loss and start
  again; first to 5 takes the match.
- **Money and a buy menu** — earn cash for kills and round wins, spend it
  between rounds on weapons, armour and grenades (HE + flash).
- **An original map** — two bomb sites, two lanes and a mid connector, with
  corners and sightlines worth playing, lit in one six-colour palette.
- **HUD** — health, armour, ammunition, money, round timer, round score,
  alive counts, bomb status and a killfeed.

## Play it

```sh
node serve.ts
```

Then open http://localhost:8080. Click to play: W/A/S/D to move, mouse to look,
click to fire, R to reload, Ctrl to crouch, Space to jump, E to plant/defuse,
B for the buy menu, G to throw a grenade, 1/2/3 to switch weapons.

## Build the submission

Node 22, standard library only. No network, no dependencies.

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts
```

That copies `game/` and `screenshots/` and writes `out/dossier.json`.
Run it twice and the output is byte-identical.

## Layout

- `main.ts` — entry point: game in, dossier out.
- `game/` — the game (`index.html`, `src/*.js`, `vendor/three/`).
- `game/src/` — one module per job: `body` (movement + collision),
  `player`, `bot` (AI), `world` (map + waypoints), `weapons`, `bomb`,
  `rounds` (round state + economy), `hud`, `input`, `palette`, `main`.
- `vendor/makefun-threejs.ts` — the make.fun dossier library, shipped byte for byte.
- `screenshots/` — the submission screenshots (start, play, end).
- `shots.json` — how each screenshot is staged (`?shot=...&seed=...`).

## License

MIT. See [LICENSE](LICENSE).

---

<sub>Entered on [make.fun](https://make.fun/?ref=2fxcygrt&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
