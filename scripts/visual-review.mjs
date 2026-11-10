// Fixed-camera visual fixtures with renderer measurements. Cameras and the clock
// are placed through the game's ?qa=1 review hooks; player state is never moved.
// Usage: node scripts/visual-review.mjs [--out DIR] [--views a,b] [--hour 17.6] [--quality high] [--mobile]
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { read } from '../tests/browser/helpers.ts';

const args = process.argv.slice(2);
const option = (name, fallback) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : fallback; };
const baseURL = process.env.VISUAL_BASE_URL || 'http://127.0.0.1:5173/';
const output = resolve(option('out', process.env.VISUAL_OUTPUT_DIR || 'artifacts/overhaul-after'));
const only = option('views', '')?.split(',').filter(Boolean) ?? [];
const forcedHour = option('hour') === undefined ? undefined : Number(option('hour'));
const quality = option('quality');
const mobile = args.includes('--mobile');
const query = option('query', '');
const viewport = mobile ? { width: 1180, height: 820 } : { width: 1440, height: 900 };
mkdirSync(output, { recursive: true });

const GOLDEN = 17.7;
/** name, camera position, look-at target, hour, save fixture */
const VIEWS = [
  ['scrapyard', [-22, 3.2, 24], [-27, 1.2, 0], GOLDEN],
  ['yard-gate-out', [-20, 2.4, 12], [-20, 3.2, 44], GOLDEN],
  ['unrestored-hachiro', [-19, 2.25, 16.2], [-15, .95, 12], GOLDEN],
  ['unrestored-veloce', [-41.8, 2.2, -18], [-38, .95, -23], GOLDEN],
  ['salvage-engines', [-32.7, 2.2, 5.2], [-37, 1.2, 2], GOLDEN],
  ['salvage-wheels', [-32.7, 2, 11.1], [-37, 1.2, 8], GOLDEN],
  ['back-lot', [-50, 4.5, 8], [-70, 1.5, -20], GOLDEN],
  ['back-lot-rows', [-47, 2.2, -8], [-58, 1.8, -34], 15.5],
  ['store-exterior', [26, 2.4, 35], [12, 2, 23], GOLDEN],
  ['store-displays', [12, 2.2, 19], [9, 1.3, 6], 13],
  ['store-engine-detail', [8.6, 1.9, 9.8], [6.2, 1, 6.1], 13],
  ['town-street', [38, 2.2, 45], [90, 2.3, 49], GOLDEN],
  ['town-noon', [38, 2.2, 45], [90, 2.3, 49], 12.5],
  ['town-dusk', [38, 2.2, 45], [90, 2.3, 49], 19.55],
  ['town-night', [38, 2.2, 45], [90, 2.3, 49], 23],
  ['yard-night', [-22, 3.2, 24], [-27, 1.2, 0], 23],
  ['yard-morning', [-22, 3.2, 24], [-27, 1.2, 0], 8.3],
  ['water-tower', 'landmark', 'landmark', GOLDEN],
  ['overview', [-20, 46, 78], [-22, 0, -4], GOLDEN],
  ['debug-east', [-18, 2.5, 8], [-9, 1, -3], GOLDEN],
  ['yard-crane', [-49, 2.2, 6], [-66, 4, 10], GOLDEN],
  ['yard-office', [-24, 2.2, 21], [-34, 1.6, 27], GOLDEN],
  ['fuel', 'fuel', 'fuel', GOLDEN],
  ['fuel-night', 'fuel', 'fuel', 22.5],
  ['car-lot', 'usedCars', 'usedCars', GOLDEN],
  ['park', 'park', 'park', 15],
  ['houses', 'houses', 'houses', GOLDEN],
  ['sky-sunward', [-20, 3, 10], [-60, 22, 40], GOLDEN],
  ['sky-noon', [-20, 3, 10], [20, 30, 60], 12.5],
  ['restored-hachiro', [-24.3, 2.6, -6.8], [-20, 1.1, -13], GOLDEN, 'hachiro'],
  ['detail-hachiro', [-22.5, 1.35, -9.55], [-20, 1.05, -12.4], GOLDEN, 'hachiro'],
  ['garage', [-24.6, 3.1, -4.4], [-19.5, 1.3, -15], GOLDEN, 'hachiro'],
  ['garage-bench', [-21.5, 2.2, -13], [-28, 1.5, -15.5], 13, 'hachiro'],
  ['garage-out', [-20, 2.4, -19], [-20, 1.6, 10], GOLDEN, 'hachiro'],
  ['garage-night', [-23, 2.6, 6], [-20, 2.2, -14], 23, 'hachiro'],
  ['restored-bison', [-24.3, 2.6, -6.8], [-20, 1.1, -13], GOLDEN, 'bison'],
  ['detail-bison', [-22.5, 1.35, -9.55], [-20, 1.05, -12.4], GOLDEN, 'bison'],
  ['restored-veloce', [-24.3, 2.6, -6.8], [-20, 1.1, -13], GOLDEN, 'veloce'],
  ['detail-veloce', [-22.5, 1.35, -9.55], [-20, 1.05, -12.4], GOLDEN, 'veloce'],
].filter(view => !only.length || only.includes(view[0]));

function carFixture(shellId) {
  const family = { hachiro: 'i4', bison: 'v8', veloce: 'v12' }[shellId];
  const paint = { hachiro: '#e7ad36', bison: '#bd4432', veloce: '#397d87' }[shellId];
  const paintId = { hachiro: 'paint-saffron', bison: 'paint-oxide', veloce: 'paint-teal' }[shellId];
  const engine = `${family}-stock`, wheels = 'sport-1';
  return { version: 1, seed: 642019,
    purchasedListings: [`shell-${shellId}`, `part-${engine}`, `part-${wheels}`, `part-${paintId}`],
    cars: [{ id: `car-${shellId}`, shellId, engineId: `instance-part-${engine}`, wheelsId: `instance-part-${wheels}`, paint }],
    inventory: [engine, wheels].map(partId => ({ id: `instance-part-${partId}`, partId })), paints: [paintId] };
}

const browser = await chromium.launch({ headless: true,
  args: process.platform === 'darwin' ? ['--use-angle=metal'] : [],
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
});
const errors = [], failures = [], external = [], captures = [];

async function makePage(fixture) {
  const page = await browser.newPage({ baseURL, viewport, ...(mobile ? { deviceScaleFactor: 2, hasTouch: true, isMobile: true } : {}) });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => failures.push({ url: request.url(), error: request.failure()?.errorText }));
  page.on('request', request => { if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== new URL(baseURL).origin) external.push(request.url()); });
  if (fixture) await page.addInitScript(save => localStorage.setItem('junkyard-drivers-save-v1', JSON.stringify(save)), fixture);
  await page.goto(`./?qa=1${query ? `&${query}` : ''}`);
  await page.locator('#begin:not([disabled])').waitFor();
  await page.locator('#begin').click();
  await page.waitForFunction(() => window.__JD && !window.__JD.paused);
  await page.evaluate(() => document.fonts.ready);
  if (quality) await page.evaluate(choice => window.__JD_QA.quality(choice), quality);
  await page.waitForTimeout(2500);
  return page;
}

async function capture(page, [name, position, target, hour]) {
  if (position === 'landmark') {
    const landmark = (await read(page)).landmark;
    position = [landmark.x - 19, 3, landmark.z - 29]; target = [landmark.x, 11, landmark.z];
  } else if (position === 'houses') {
    const east = (await read(page)).roads[4].a.x;
    position = [east + 3, 2.2, 70]; target = [east + 26, 3, 86];
  } else if (typeof position === 'string') {
    // Lots are found by kind: stand on the street side and look in.
    const lot = (await read(page)).lots.find(item => item.kind === position);
    if (!lot) { console.log(`[visual-review] ${name}: no such lot for this seed`); return; }
    const reach = Math.min(lot.w, lot.d) / 2 + 13;
    position = [lot.x + lot.face.x * reach + lot.face.z * 9, 3.2, lot.z + lot.face.z * reach + lot.face.x * 9]; target = [lot.x, 1.6, lot.z];
  }
  await page.evaluate(({ position, target, hour }) => {
    window.__JD_QA.hour(hour);
    window.__JD_QA.camera(position, target);
  }, { position, target, hour: forcedHour ?? hour });
  // Long enough for the reflection cube to follow a new hour.
  await page.waitForTimeout(3300);
  await page.screenshot({ path: `${output}/${name}.png` });
  const perf = await page.evaluate(() => new Promise(resolve => {
    const times = [], begin = performance.now();
    function sample(time) {
      times.push(time);
      if (time - begin < 1200) { requestAnimationFrame(sample); return; }
      const intervals = times.slice(1).map((value, i) => value - times[i]).sort((a, b) => a - b);
      const gl = document.querySelector('canvas').getContext('webgl2');
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const state = window.__JD;
      resolve({ fps: (times.length - 1) * 1000 / (times.at(-1) - times[0]),
        medianFrameMs: intervals[Math.floor(intervals.length * .5)], p95FrameMs: intervals[Math.floor(intervals.length * .95)],
        renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unavailable',
        drawCalls: state.drawCalls, triangles: state.triangles, memory: state.memory, mainThreadMs: state.frameMs,
        jsHeapBytes: performance.memory?.usedJSHeapSize, quality: state.graphicsQuality, hour: state.hour });
    }
    requestAnimationFrame(sample);
  }));
  captures.push({ name, position, target, perf });
  console.log(`[visual-review] ${name.padEnd(22)} ${perf.fps.toFixed(1)} fps  ${String(perf.drawCalls).padStart(5)} calls  ${String(perf.triangles).padStart(8)} tris  ${perf.quality}`);
}

try {
  const fixtures = [...new Set(VIEWS.map(view => view[4]))];
  for (const fixture of fixtures) {
    const page = await makePage(fixture ? carFixture(fixture) : undefined);
    for (const view of VIEWS.filter(item => item[4] === fixture)) await capture(page, view);
    await page.close();
  }
  const report = { visualFixtures: true, capturedAt: new Date().toISOString(), baseURL, viewport, mobile, seed: 642019,
    instrumentation: 'Review camera and clock through the ?qa=1 hooks; no player state is changed.',
    performanceScope: 'Stationary 1.2 second samples after warm-up; frame pacing is vsync-limited. Draw calls and triangles include every pass.',
    captures, errors, failures, external };
  // A run limited with --views is written beside the full report, never over it.
  writeFileSync(`${output}/${only.length ? 'visual-review-subset' : 'visual-review'}.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ output, captures: captures.length, errors, failures, external }, null, 2));
  if (errors.length || failures.length || external.length) process.exitCode = 1;
} finally { await browser.close(); }
