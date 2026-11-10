// Objective pixel statistics for a folder of screenshots: colour entropy, edge
// density, luminance contrast and dominant-colour share. The PNGs are decoded in
// a blank browser page, so this needs no image dependency beyond Playwright.
// Usage: node scripts/pixel-metrics.mjs artifacts/overhaul-after [more-folders]
import { chromium } from 'playwright';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const folders = process.argv.slice(2);
if (!folders.length) { console.error('Usage: node scripts/pixel-metrics.mjs <folder> [folder...]'); process.exit(1); }

/** Runs in the page. Coarse 160 x 90 luminance grid keeps the cost trivial. */
async function measure(base64) {
  const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0);
  const { data, width, height } = context.getImageData(0, 0, bitmap.width, bitmap.height);
  const stepX = Math.max(1, Math.floor(width / 160)), stepY = Math.max(1, Math.floor(height / 90));
  const cols = Math.floor(width / stepX), rows = Math.floor(height / stepY);
  const luminance = new Float64Array(cols * rows), buckets = new Map();
  let samples = 0;
  for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) {
    const offset = (gy * stepY * width + gx * stepX) * 4;
    const r = data[offset], g = data[offset + 1], b = data[offset + 2];
    luminance[gy * cols + gx] = .2126 * r + .7152 * g + .0722 * b;
    const key = `${r >> 4},${g >> 4},${b >> 4}`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1); samples++;
  }
  const sorted = Array.from(luminance).sort((a, b) => a - b);
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  const p5 = sorted[Math.floor(sorted.length * .05)], p95 = sorted[Math.floor(sorted.length * .95)];
  let entropy = 0, dominant = 0;
  for (const count of buckets.values()) { const p = count / samples; entropy -= p * Math.log2(p); dominant = Math.max(dominant, count); }
  let edges = 0, checked = 0;
  for (let gy = 0; gy < rows - 1; gy++) for (let gx = 0; gx < cols - 1; gx++) {
    const i = gy * cols + gx;
    if (Math.max(Math.abs(luminance[i] - luminance[i + 1]), Math.abs(luminance[i] - luminance[i + cols])) > 12) edges++;
    checked++;
  }
  const round = (value, digits) => Number(value.toFixed(digits));
  return {
    width, height, colorBuckets: buckets.size, colorEntropyBits: round(entropy, 2), edgeDensity: round(edges / checked, 3),
    luminance: { mean: round(mean, 1), p5: round(p5, 1), p95: round(p95, 1), contrast: round(p95 - p5, 1) },
    dominantColorShare: round(dominant / samples, 3),
  };
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  for (const folder of folders) {
    const directory = resolve(folder), results = {};
    for (const file of readdirSync(directory).filter(name => name.endsWith('.png')).sort()) {
      results[file.replace(/\.png$/, '')] = await page.evaluate(measure, readFileSync(join(directory, file)).toString('base64'));
    }
    const names = Object.keys(results);
    const average = key => Number((names.reduce((sum, name) => sum + key(results[name]), 0) / Math.max(1, names.length)).toFixed(3));
    const summary = {
      images: names.length,
      colorEntropyBits: average(item => item.colorEntropyBits), edgeDensity: average(item => item.edgeDensity),
      luminanceContrast: average(item => item.luminance.contrast), dominantColorShare: average(item => item.dominantColorShare),
    };
    writeFileSync(join(directory, 'pixel-metrics.json'), JSON.stringify({ summary, images: results }, null, 2));
    console.log(folder, JSON.stringify(summary));
  }
} finally { await browser.close(); }
