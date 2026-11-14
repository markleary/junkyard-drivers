// Comparative car evidence in the real game. Shell-only and restored startup fixtures use the same garage bay,
// light and cameras; only the documented QA camera/hour/quality hooks and the real Photo Mode key are used.
// Usage: VISUAL_BASE_URL=http://127.0.0.1:4187/junkyard-drivers/ node scripts/car-quality-review.mjs
// Optional: VISUAL_OUTPUT_DIR=artifacts/car-quality-before CAR_REVIEW_CARS=estate,sprite,courier
// CAR_REVIEW_TIERS=0 skips the extra medium/low/compatible front views of restored new cars.
// CAR_REVIEW_DETAILS=0 skips the two restored high-quality detail views per new model.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const baseURL = process.env.VISUAL_BASE_URL || 'http://127.0.0.1:5173/';
const output = resolve(process.env.VISUAL_OUTPUT_DIR || 'artifacts/car-quality-review');
const only = (process.env.CAR_REVIEW_CARS || '').split(',').map(id => id.trim()).filter(Boolean);
const tierSamples = process.env.CAR_REVIEW_TIERS !== '0';
const detailSamples = process.env.CAR_REVIEW_DETAILS !== '0';
const viewport = { width: 1200, height: 800 }, seed = 642019, hour = 13;
const CARS = [
  { id: 'hachiro', baseline: true, engine: 'i4-stock', wheels: 'street-1', paintId: 'paint-saffron', paint: '#e7ad36', salvage: '#83908a' },
  { id: 'packhorse', baseline: true, engine: 'v8-stock', wheels: 'street-1', paintId: 'paint-teal', paint: '#397d87', salvage: '#6f8478' },
  { id: 'estate', engine: 'i4-stock', wheels: 'wheels-classic', paintId: 'paint-cream', paint: '#f0dfad', salvage: '#82917c' },
  { id: 'sprite', engine: 'i4-twin', wheels: 'wheels-rally', paintId: 'paint-burgundy', paint: '#6f303c', salvage: '#8c6b69' },
  { id: 'courier', engine: 'v8-torque', wheels: 'street-1', paintId: 'paint-cream', paint: '#f0dfad', salvage: '#9b937b' },
];
if (only.some(id => !CARS.some(car => car.id === id))) throw new Error(`Unknown CAR_REVIEW_CARS entry; choose ${CARS.map(car => car.id).join(',')}`);
const cars = CARS.filter(car => !only.length || only.includes(car.id));
// All parked models face +world Z. These matching distances, heights and target compare front/rear details
// without putting the rear camera through the garage's wall. The Courier roof fits the same framing.
const VIEWS = [
  { name: 'front', position: [-23.5, 2.65, -8.5], target: [-20, 1.12, -13] },
  { name: 'rear', position: [-23.5, 2.65, -17.5], target: [-20, 1.12, -13] },
];
// Details deliberately use tighter cameras; the twenty comparison images above retain identical framing.
const DETAILS = {
  estate: [
    { name: 'detail-rear-door-side', position: [-23.6, 2.2, -14], target: [-20, 1.15, -13.35] },
    { name: 'detail-tailgate', position: [-22.1, 1.7, -16.7], target: [-20, 1.25, -14.3] },
  ],
  sprite: [
    { name: 'detail-cockpit', position: [-21.55, 3, -15.6], target: [-20, 1.08, -13.18] },
    { name: 'detail-front', position: [-22.3, 1.35, -9.6], target: [-20, .95, -11.8] },
  ],
  courier: [
    { name: 'detail-rear-doors', position: [-21.6, 1.75, -17], target: [-20, 1.32, -14.6] },
    { name: 'detail-side-front', position: [-23.75, 2.05, -11.4], target: [-20, 1.35, -13] },
  ],
};

function fixture(car, condition) {
  const restored = condition === 'restored', parts = restored ? [car.engine, car.wheels] : [];
  return {
    version: 1, seed,
    purchasedListings: [`shell-${car.id}`, ...parts.map(id => `part-${id}`), ...(restored ? [`part-${car.paintId}`] : [])],
    cars: [{ id: `car-${car.id}`, shellId: car.id,
      engineId: restored ? `instance-part-${car.engine}` : null,
      wheelsId: restored ? `instance-part-${car.wheels}` : null,
      paint: restored ? car.paint : car.salvage }],
    inventory: parts.map(partId => ({ id: `instance-part-${partId}`, partId })), paints: restored ? [car.paintId] : [],
  };
}

mkdirSync(output, { recursive: true });
const errors = [], failedRequests = [], externalRequests = [], captures = [];
const report = {
  baseURL, capturedAt: new Date().toISOString(), viewport, seed, hour,
  setup: 'Actual game, shell-only or restored startup save in the garage bay. Original salvage paint on shell-only fixtures. Photo Mode entered through KeyP; QA hooks change only camera, hour and graphics tier.',
  comparison: 'Identical front and rear three-quarter cameras, target, midday light and viewport for every model. Car geometry comes from the served build, not this script.',
  performanceScope: 'Stationary Photo Mode, 600 ms animation-frame samples after warm-up. Draw calls and triangles cover the full rendered scene and passes, not the individual car. Frame intervals are vsync-limited.',
  cars: cars.map(({ id, baseline }) => ({ id, baseline: !!baseline })), tierSamples, detailSamples,
  captures, errors, failedRequests, externalRequests,
};
const writeReport = () => writeFileSync(`${output}/car-quality-review.json`, JSON.stringify(report, null, 2));
const browser = await chromium.launch({ headless: true, args: process.platform === 'darwin' ? ['--use-angle=metal'] : [],
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });

async function makePage(car, condition) {
  const page = await browser.newPage({ baseURL, viewport, deviceScaleFactor: 1 });
  const context = { car: car.id, condition };
  page.on('pageerror', error => errors.push({ ...context, message: error.message }));
  page.on('console', message => { if (message.type() === 'error') errors.push({ ...context, message: message.text() }); });
  page.on('requestfailed', request => failedRequests.push({ ...context, url: request.url(), error: request.failure()?.errorText }));
  page.on('request', request => { if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== new URL(baseURL).origin) externalRequests.push({ ...context, url: request.url() }); });
  await page.addInitScript(({ save, hour }) => {
    localStorage.setItem('junkyard-drivers-save-v1', JSON.stringify(save));
    localStorage.setItem('junkyard-drivers-progress-v1', JSON.stringify({ version: 1, stash: 314159, hour,
      settings: { quality: 'high', time: 'midday', motion: false } }));
  }, { save: fixture(car, condition), hour });
  await page.goto('./?qa=1');
  await page.locator('#begin:not([disabled])').waitFor({ timeout: 30000 });
  await page.locator('#begin').click();
  await page.waitForFunction(() => window.__JD && !window.__JD.paused);
  await page.evaluate(() => document.fonts.ready);
  const loaded = await page.evaluate(() => window.__JD.state);
  if (loaded.cars.length !== 1 || loaded.cars[0].shellId !== car.id) throw new Error(`Fixture for ${car.id}/${condition} was rejected by the served game.`);
  await page.keyboard.press('KeyP');
  await page.waitForFunction(() => window.__JD.photo);
  // A startup mouse-capture notice must be allowed to expire naturally before a shareable capture.
  await page.waitForFunction(() => !document.querySelector('#toast')?.classList.contains('visible'), undefined, { timeout: 10000 });
  return page;
}

async function capture(page, car, condition, view, quality, warmup = 1400) {
  await page.evaluate(({ quality, hour, position, target }) => {
    window.__JD_QA.quality(quality); window.__JD_QA.hour(hour); window.__JD_QA.camera(position, target);
  }, { quality, hour, ...view });
  await page.waitForTimeout(warmup);
  const measured = await page.evaluate(() => new Promise(resolve => {
    const frames = [], started = performance.now();
    function sample(time) {
      frames.push(time);
      if (time - started < 600) { requestAnimationFrame(sample); return; }
      const intervals = frames.slice(1).map((at, index) => at - frames[index]).sort((a, b) => a - b);
      const snapshot = window.__JD, gl = document.querySelector('#world').getContext('webgl2'), debug = gl?.getExtension('WEBGL_debug_renderer_info');
      resolve({ quality: snapshot.graphicsQuality, drawCalls: snapshot.drawCalls, triangles: snapshot.triangles,
        memory: snapshot.memory, programs: snapshot.programs, mainThreadMs: snapshot.frameMs,
        medianFrameMs: intervals[Math.floor(intervals.length * .5)] ?? null,
        p95FrameMs: intervals[Math.floor(intervals.length * .95)] ?? null,
        renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'unavailable', hour: snapshot.hour,
        fixture: snapshot.state.cars[0] });
    }
    requestAnimationFrame(sample);
  }));
  const name = `${car.id}-${condition}-${view.name}-${quality}`, file = `${name}.jpg`;
  await page.screenshot({ path: `${output}/${file}`, type: 'jpeg', quality: 88 });
  captures.push({ name, file, car: car.id, baseline: !!car.baseline, condition, view: view.name,
    position: view.position, target: view.target, requestedQuality: quality, ...measured });
  writeReport();
  console.log(JSON.stringify({ name, quality: measured.quality, drawCalls: measured.drawCalls, triangles: measured.triangles, medianFrameMs: measured.medianFrameMs }));
}

try {
  // Complete the matching high-quality set first; extra quality samples are a separate pass.
  for (const car of cars) for (const condition of ['salvage', 'restored']) {
    const page = await makePage(car, condition);
    try { for (const [index, view] of VIEWS.entries()) await capture(page, car, condition, view, 'high', index === 0 ? 2500 : 1400); }
    finally { await page.close(); }
  }
  if (detailSamples || tierSamples) for (const car of cars.filter(car => !car.baseline)) {
    const page = await makePage(car, 'restored');
    try {
      if (detailSamples) for (const view of DETAILS[car.id]) await capture(page, car, 'restored', view, 'high', 1800);
      if (tierSamples) for (const quality of ['medium', 'low', 'compatible']) await capture(page, car, 'restored', VIEWS[0], quality, 1800);
    }
    finally { await page.close(); }
  }
} catch (error) {
  errors.push({ message: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
} finally {
  writeReport();
  await browser.close();
}
if (errors.length || failedRequests.length || externalRequests.length) process.exitCode = 1;
console.log(JSON.stringify({ output, captures: captures.length, errors, failedRequests, externalRequests }, null, 2));
