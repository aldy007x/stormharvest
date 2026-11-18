// STORMHARVEST — entrypoint for the make.fun "Make the best game" bounty.
//
// What this program does, in order:
//   1. audits the game tree and the screenshots on disk, refusing to hand in
//      anything the scorer would refuse (file-count, byte and image caps);
//   2. copies game/ and screenshots/ into the output directory;
//   3. asks the vendored make.fun library for the dossier JSON and writes it
//      as dossier.json next to the copied trees.
// The game itself is plain static files under game/ (no build step, no
// network), so this file is deliberately small: its whole job is to hand the
// folder in exactly as it stands, after proving it is inside the caps.
//
// Run locally with:  MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The caps below mirror the competition's published gate for this bounty.
const CAPS = {
  dossierTextBytes: 163840,
  shotCount: 4,
  shotBytes: 262144,
  gameFiles: 993,
  gameBytes: 50331648,
  gamePathBytes: 1000,
};

function auditTree(dir: string): { files: number; bytes: number } {
  let files = 0;
  let bytes = 0;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (full.length > CAPS.gamePathBytes + root.length) {
      throw new Error(`path too long for the gate: ${full}`);
    }
    const info = statSync(full);
    if (info.isDirectory()) {
      const sub = auditTree(full);
      files += sub.files;
      bytes += sub.bytes;
    } else {
      files += 1;
      bytes += info.size;
    }
  }
  return { files, bytes };
}

function auditScreenshots(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const names = readdirSync(dir)
    .filter((name) => /\.(png|jpe?g)$/i.test(name))
    .sort();
  if (names.length > CAPS.shotCount) {
    throw new Error(`too many screenshots: ${names.length} over the cap of ${CAPS.shotCount}`);
  }
  for (const name of names) {
    const size = statSync(join(dir, name)).size;
    if (size > CAPS.shotBytes) {
      throw new Error(`screenshot ${name} is ${size} bytes, over the ${CAPS.shotBytes}-byte cap`);
    }
  }
  return names;
}

const gameDir = join(root, 'game');
const shotsDir = join(root, 'screenshots');

const tree = auditTree(gameDir);
if (tree.files > CAPS.gameFiles) {
  throw new Error(`game tree holds ${tree.files} files, over the cap of ${CAPS.gameFiles}`);
}
if (tree.bytes > CAPS.gameBytes) {
  throw new Error(`game tree is ${tree.bytes} bytes, over the cap of ${CAPS.gameBytes}`);
}
const shots = auditScreenshots(shotsDir);

mkdirSync(outputDir, { recursive: true });
cpSync(gameDir, join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (shots.length > 0) {
  cpSync(shotsDir, join(outputDir, 'screenshots'), { recursive: true });
}

const dossier = buildDossier(outputDir, {
  text_max_bytes: CAPS.dossierTextBytes,
  screenshots: { max: CAPS.shotCount, max_bytes: CAPS.shotBytes },
  game_max_files: CAPS.gameFiles,
  game_max_bytes: CAPS.gameBytes,
  game_path_max_bytes: CAPS.gamePathBytes,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);

console.log(
  `STORMHARVEST handed in: ${tree.files} game files (${tree.bytes} bytes), ` +
    `${shots.length} screenshots (${shots.join(', ')}), dossier ${dossier.length} bytes.`,
);
