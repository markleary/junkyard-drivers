// Looks for surfaces that fight for the same pixels (z-fighting). At each view the camera is nudged a few
// millimetres, twice, and the frames are compared: stable geometry barely changes, while two surfaces drawn in
// the same plane swap over in large patches. Two frames from a camera that has not moved give the floor that
// swaying plants, cloud and film grain set on their own. Reports the share of pixels that flip, and saves the
// first frame of each view with the flipped pixels marked in red beside it.
// Usage: node scripts/flicker-check.mjs [base URL] [--out DIR] [--views a,b]     Default URL: the local dev server.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const option = name => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : undefined; };
const valueIndexes = new Set(['out', 'views'].map(name => args.indexOf(`--${name}`)).filter(index => index >= 0).map(index => index + 1));
const base = args.find((value, index) => /^https?:/.test(value) && !valueIndexes.has(index)) || process.env.VISUAL_BASE_URL || 'http://127.0.0.1:5173/';
const output = resolve(option('out') ?? 'artifacts/overhaul-after/flicker');
const only = (option('views') ?? '').split(',').filter(Boolean);
mkdirSync(output, { recursive: true });

// name, camera position, look-at target. Coordinates are for the review seed.
const SEED = 642019;
const VIEWS = [
  ['store-path', [15.5, 1.7, 33.2], [-2, .3, 33.2]],
  ['store-path-from-above', [6, 3.4, 37.5], [5.5, 0, 33.2]],
  ['store-canopy', [12, 1.7, 30.5], [12, 3.5, 26.2]],
  ['gate-junction', [-20, 1.7, 35], [-20, 0, 46]],
  ['pavement-corner', [140.5, 1.7, 139.5], [136.7, .16, 143.2]],
  ['crossing', [127.5, 1.7, 45.2], [136, 0, 44]],
  ['shop-door', [107.2, 1.5, 161], [108.2, .8, 163.85]],
  ['yard-fence', [-23.2, 1.6, -49.5], [-23.2, 1.2, -53]],
  ['town-street', [60, 1.7, 46.5], [100, .5, 44]],
].filter(view => !only.length || only.includes(view[0]));

/** Runs in a blank page: decode two PNGs and count pixels whose colour moved by more than `threshold` levels. */
async function compare([first, second, threshold]) {
  const pixels = async base64 => {
    const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0);
    return context.getImageData(0, 0, bitmap.width, bitmap.height);
  };
  const a = await pixels(first), b = await pixels(second);
  const cell = 16, cols = Math.ceil(a.width / cell), rows = Math.ceil(a.height / cell), cells = new Uint32Array(cols * rows);
  let flipped = 0;
  for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
    const i = (y * a.width + x) * 4;
    if (Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2])) <= threshold) continue;
    flipped++;
    cells[Math.floor(y / cell) * cols + Math.floor(x / cell)]++;
  }
  // A sub-pixel shift along an edge touches a line of pixels; a fight fills whole blocks.
  let solidCells = 0;
  for (const count of cells) if (count >= cell * cell * .6) solidCells++;
  // The first frame, dimmed, with every flipped pixel in red.
  const marked = new ImageData(a.width, a.height);
  for (let i = 0; i < a.data.length; i += 4) {
    const moved = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2])) > threshold;
    const grey = (a.data[i] * .3 + a.data[i + 1] * .6 + a.data[i + 2] * .1) * .45 + 110;
    marked.data[i] = moved ? 235 : grey; marked.data[i + 1] = moved ? 30 : grey; marked.data[i + 2] = moved ? 30 : grey; marked.data[i + 3] = 255;
  }
  const canvas = new OffscreenCanvas(a.width, a.height);
  canvas.getContext('2d').putImageData(marked, 0, 0);
  const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return { share: flipped / (a.width * a.height), solidBlocks: solidCells, marked: btoa(binary) };
}

const browser = await chromium.launch({ headless: true, args: process.platform === 'darwin' ? ['--use-angle=metal'] : [] });
const report = { base, seed: SEED, nudgeMetres: .006, threshold: 28, views: [] };
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(seed => {
    if (!localStorage.getItem('junkyard-drivers-save-v1')) localStorage.setItem('junkyard-drivers-save-v1', JSON.stringify({ version: 1, seed, purchasedListings: [], cars: [], inventory: [], paints: [] }));
  }, SEED);
  await page.goto(`${base}?qa=1`);
  await page.locator('#begin:not([disabled])').waitFor({ timeout: 120000 });
  await page.locator('#begin').click();
  await page.waitForFunction(() => window.__JD && !window.__JD.paused);
  await page.evaluate(() => window.__JD_QA.quality('high'));
  const seed = await page.evaluate(() => window.__JD.state.seed);
  if (seed !== SEED) throw new Error(`Expected the review seed ${SEED}, but the game loaded ${seed}`);
  const blank = await browser.newPage();
  const shot = async () => (await page.locator('canvas').first().screenshot()).toString('base64');
  for (const [name, position, target] of VIEWS) {
    const length = Math.hypot(target[0] - position[0], target[1] - position[1], target[2] - position[2]);
    const step = [0, 1, 2].map(axis => (target[axis] - position[axis]) / length * report.nudgeMetres);
    const frames = [];
    // Nudges 0, 0, 1, 2: the first pair is the still camera, the next two pairs are the moves.
    for (const nudge of [0, 0, 1, 2]) {
      await page.evaluate(({ position, target }) => { window.__JD_QA.hour(13); window.__JD_QA.camera(position, target); },
        { position: position.map((value, axis) => value + step[axis] * nudge), target });
      await page.waitForTimeout(frames.length ? 350 : 1600);
      frames.push(await shot());
    }
    const still = await blank.evaluate(compare, [frames[0], frames[1], report.threshold]);
    const moves = [await blank.evaluate(compare, [frames[1], frames[2], report.threshold]), await blank.evaluate(compare, [frames[2], frames[3], report.threshold])];
    const worst = moves[0].share >= moves[1].share ? moves[0] : moves[1];
    const view = { name, position, target, stillShare: +still.share.toFixed(5), stillBlocks: still.solidBlocks,
      flippedShare: +worst.share.toFixed(5), solidBlocks: Math.max(moves[0].solidBlocks, moves[1].solidBlocks) };
    report.views.push(view);
    writeFileSync(`${output}/${name}.png`, Buffer.from(frames[1], 'base64'));
    writeFileSync(`${output}/${name}-flips.png`, Buffer.from(worst.marked, 'base64'));
    console.log(`${name.padEnd(24)} moved: ${(view.flippedShare * 100).toFixed(3).padStart(7)} % flip, ${String(view.solidBlocks).padStart(4)} solid blocks   still: ${(view.stillShare * 100).toFixed(3).padStart(7)} %, ${String(view.stillBlocks).padStart(3)} blocks`);
  }
  report.errors = errors;
  if (errors.length) console.log('page errors:', errors);
} finally { await browser.close(); }
writeFileSync(`${output}/flicker-check.json`, JSON.stringify(report, null, 2));
