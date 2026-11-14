// Fixed-view evidence for the optional workshop skin, in the actual game.
// Startup fixtures are the only save writes; QA hooks change camera, light and
// quality only. Use tests/browser/restoration.spec.ts for player interactions.
// VISUAL_BASE_URL=http://127.0.0.1:4191/junkyard-drivers/ node scripts/restoration-review.mjs
// RESTORATION_REVIEW_FULL=1 captures every stage in every model and quality.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const baseURL = process.env.VISUAL_BASE_URL || 'http://127.0.0.1:5173/';
const output = resolve(process.env.VISUAL_OUTPUT_DIR || 'artifacts/restoration');
const viewport = { width: 1200, height: 800 };
const full = process.env.RESTORATION_REVIEW_FULL === '1';
const cars = [
  { id: 'hachiro', engine: 'i4-stock', paintId: 'paint-saffron', paint: '#e7ad36' },
  { id: 'bison', engine: 'v8-stock', paintId: 'paint-burgundy', paint: '#6f303c' },
  { id: 'veloce', engine: 'v12-stock', paintId: 'paint-oxide', paint: '#bd4432' },
  { id: 'wren', engine: 'i4-stock', paintId: 'paint-ivory', paint: '#e4dfcb' },
  { id: 'packhorse', engine: 'v8-torque', paintId: 'paint-teal', paint: '#397d87' },
  { id: 'estate', engine: 'i4-stock', paintId: 'paint-cream', paint: '#f0dfad' },
  { id: 'sprite', engine: 'i4-twin', paintId: 'paint-burgundy', paint: '#6f303c' },
  { id: 'courier', engine: 'v8-torque', paintId: 'paint-teal', paint: '#397d87' },
].filter(car => !process.env.RESTORATION_REVIEW_CARS || process.env.RESTORATION_REVIEW_CARS.split(',').includes(car.id));
const stages = [
  { name: '01-as-found', stage: 'wash', route: 'paint', work: 0 },
  { name: '02-washed', stage: 'rust', route: 'paint', work: 0 },
  { name: '03-rust-removed', stage: 'repair', route: 'paint', work: 0 },
  { name: '04-panel-repair', stage: 'prime', route: 'paint', work: 0 },
  { name: '05-primed', stage: 'paint', route: 'paint', work: 0 },
  { name: '06-paint-pass', stage: 'paint', route: 'paint', work: .5 },
  { name: '07-fresh-paint', stage: 'complete', route: 'paint', work: 0 },
  { name: '08-preserved-patina', stage: 'complete', route: 'patina', work: 0 },
];
const position = [-23.5, 2.65, -8.5], target = [-20, 1.12, -13];
const captures = [], errors = [], failedRequests = [], externalRequests = [];
const report = { baseURL, capturedAt: new Date().toISOString(), viewport, position, target,
  setup: 'Catalog-valid startup saves, unchanged camera and midday light. The car uses production geometry and restoration materials. Only read-only QA view controls are used after startup.',
  captures, errors, failedRequests, externalRequests };
mkdirSync(output, { recursive: true });
const saveReport = () => writeFileSync(`${output}/measurements.json`, JSON.stringify(report, null, 2));
const browser = await chromium.launch({ headless: true, args: process.platform === 'darwin' ? ['--use-angle=metal'] : [],
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });

try {
  for (const car of cars) for (const stage of stages) {
    if (!full && car.id !== 'estate' && !['wash', 'complete'].includes(stage.stage)) continue;
    const page = await browser.newPage({ baseURL, viewport, deviceScaleFactor: 1 });
    const context = { car: car.id, stage: stage.name };
    page.on('pageerror', error => errors.push({ ...context, message: error.message }));
    page.on('console', message => { if (message.type() === 'error') errors.push({ ...context, message: message.text() }); });
    page.on('requestfailed', request => failedRequests.push({ ...context, url: request.url(), error: request.failure()?.errorText }));
    page.on('request', request => {
      if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== new URL(baseURL).origin) externalRequests.push({ ...context, url: request.url() });
    });
    try {
      await page.addInitScript(({ car, stage }) => {
        const parts = [car.engine, 'street-1'];
        const snapshot = { shellId: car.id, paint: car.paint, finish: 'gloss', stripe: 'none', enginePartId: car.engine,
          wheels: true, tuning: [], restored: false };
        localStorage.setItem('junkyard-drivers-save-v1', JSON.stringify({ version: 1, seed: 642019,
          purchasedListings: [`shell-${car.id}`, ...parts.map(id => `part-${id}`), `part-${car.paintId}`],
          cars: [{ id: `car-${car.id}`, shellId: car.id, engineId: `instance-part-${car.engine}`, wheelsId: 'instance-part-street-1', paint: car.paint }],
          inventory: parts.map(partId => ({ id: `instance-part-${partId}`, partId })), paints: [car.paintId] }));
        localStorage.setItem('junkyard-drivers-progress-v1', JSON.stringify({ version: 1, stash: 314159, hour: 13,
          settings: { quality: 'high', time: 'midday', motion: false },
          restorations: { [`car-${car.id}`]: { stage: stage.stage, route: stage.route, work: stage.work, before: snapshot,
            after: stage.stage === 'complete' ? { ...snapshot, restored: stage.route === 'paint' } : null } } }));
      }, { car, stage });
      await page.goto('./?qa=1');
      await page.locator('#begin:not([disabled])').waitFor({ timeout: 30000 });
      await page.locator('#begin').click();
      await page.waitForFunction(() => window.__JD && !window.__JD.paused);
      await page.evaluate(() => document.fonts.ready);
      const record = await page.evaluate(id => window.__JD.progress.restorations[`car-${id}`], car.id);
      if (!record || record.stage !== stage.stage || record.route !== stage.route || record.work !== stage.work) throw new Error(`Restoration fixture was rejected: ${car.id}/${stage.name}`);
      await page.keyboard.press('KeyP');
      await page.waitForFunction(() => window.__JD.photo);
      await page.waitForFunction(() => !document.querySelector('#toast')?.classList.contains('visible'), undefined, { timeout: 10000 });
      for (const quality of ['high', 'medium', 'low', 'compatible']) {
        if (!full && quality !== 'high' && !(stage.stage === 'complete' && stage.route === 'paint' && (quality === 'compatible' || car.id === 'veloce'))) continue;
        await page.evaluate(({ position, target, quality }) => {
          window.__JD_QA.quality(quality); window.__JD_QA.hour(13); window.__JD_QA.camera(position, target);
        }, { position, target, quality });
        await page.waitForTimeout(1000);
        const measurement = await page.evaluate(() => {
          const { graphicsQuality, drawCalls, triangles, memory, frameMs, programs } = window.__JD;
          return { graphicsQuality, drawCalls, triangles, memory, frameMs, programs };
        });
        const name = `${car.id}-${stage.name}-${quality}`, file = `${name}.png`;
        await page.screenshot({ path: `${output}/${file}` });
        captures.push({ name, file, car: car.id, restoration: stage, requestedQuality: quality, ...measurement });
        saveReport();
        console.log(JSON.stringify({ name, ...measurement }));
      }
    } finally { await page.close(); }
  }
} catch (error) {
  errors.push({ message: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
} finally {
  saveReport(); await browser.close();
}
if (errors.length || failedRequests.length || externalRequests.length) process.exitCode = 1;
console.log(JSON.stringify({ output, captures: captures.length, errors, failedRequests, externalRequests }, null, 2));
