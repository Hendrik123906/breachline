// BREACHLINE — entrypoint for make.fun threejs-fps-02 (Node 22, stdlib only).
// The game itself lives in game/ (plain static files, three.js via import map).
// This script stages the entry for the judge: copy game/ and screenshots/
// from beside this file into $MAKEFUN_OUTPUT_DIR (or /output in the grader),
// then write dossier.json with the vendored make.fun scorer library.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const gameDir = join(root, 'game');
const shotsDir = join(root, 'screenshots');
const outGame = join(outputDir, 'game');
const outShots = join(outputDir, 'screenshots');

mkdirSync(outputDir, { recursive: true });
cpSync(gameDir, outGame, { recursive: true });
mkdirSync(outShots, { recursive: true });
if (existsSync(shotsDir)) cpSync(shotsDir, outShots, { recursive: true });

// Scorer caps (reference/gate.json): text_max_bytes shapes the dossier bytes;
// the rest refuse entries the scorer would refuse (over 4 screenshots or one
// over 256 KiB; over 993 files in game/ or 48 MiB of game files in all).
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);
