// Fixed-camera evidence for the restoration-job project cars. Saves are startup fixtures;
// the QA hook changes only the review camera, hour and graphics tier.
// Usage: VISUAL_BASE_URL=http://127.0.0.1:5173/ node scripts/project-car-review.mjs
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const baseURL = process.env.VISUAL_BASE_URL || 'http://127.0.0.1:5173/';
const output = resolve(process.env.VISUAL_OUTPUT_DIR || 'artifacts/overhaul-after');
mkdirSync(output, { recursive: true });
const cars = [
  { id: 'estate', engine: 'i4-stock', wheels: 'wheels-classic', paintId: 'paint-cream', paint: '#f0dfad' },
  { id: 'sprite', engine: 'i4-twin', wheels: 'wheels-rally', paintId: 'paint-burgundy', paint: '#6f303c' },
  { id: 'courier', engine: 'v8-torque', wheels: 'street-1', paintId: 'paint-cream', paint: '#f0dfad' },
];
function fixture(car) {
  const parts = [car.engine, car.wheels];
  return { version: 1, seed: 642019, purchasedListings: [`shell-${car.id}`, ...parts.map(id => `part-${id}`), `part-${car.paintId}`],
    cars: [{ id: `car-${car.id}`, shellId: car.id, engineId: `instance-part-${car.engine}`, wheelsId: `instance-part-${car.wheels}`, paint: car.paint }],
    inventory: parts.map(partId => ({ id: `instance-part-${partId}`, partId })), paints: [car.paintId] };
}
const browser = await chromium.launch({ headless: true, args: process.platform === 'darwin' ? ['--use-angle=metal'] : [],
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
const errors = [], failedRequests = [], externalRequests = [], captures = [];
try {
  for (const car of [null, ...cars]) {
    const page = await browser.newPage({ baseURL, viewport: { width: 1440, height: 900 } });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('requestfailed', request => failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
    page.on('request', request => { if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== new URL(baseURL).origin) externalRequests.push(request.url()); });
    if (car) await page.addInitScript(save => localStorage.setItem('junkyard-drivers-save-v1', JSON.stringify(save)), fixture(car));
    await page.goto('./?qa=1');
    await page.locator('#begin:not([disabled])').waitFor();
    await page.locator('#begin').click();
    await page.waitForFunction(() => window.__JD && !window.__JD.paused);
    await page.evaluate(() => document.fonts.ready);
    const position = car ? [-24.4, car.id === 'sprite' ? 2.9 : 2.6, -6.8] : [-52, 4.4, -5.5];
    const target = car ? [-20, 1.15, -13] : [-57.5, 1.1, 4];
    await page.evaluate(({ position, target }) => {
      window.__JD_QA.quality('high'); window.__JD_QA.hour(17.7); window.__JD_QA.camera(position, target);
    }, { position, target });
    // Let startup notices clear before taking a shareable view of the cars.
    await page.waitForTimeout(5000);
    const name = car ? `project-${car.id}-restored` : 'project-salvage-row';
    await page.screenshot({ path: `${output}/${name}.png` });
    const measured = await page.evaluate(() => {
      const s = window.__JD;
      return { drawCalls: s.drawCalls, triangles: s.triangles, memory: s.memory, quality: s.graphicsQuality, mainThreadMs: s.frameMs };
    });
    captures.push({ name, position, target, ...measured });
    console.log(JSON.stringify(captures.at(-1)));
    await page.close();
  }
  writeFileSync(`${output}/project-car-review.json`, JSON.stringify({ baseURL, capturedAt: new Date().toISOString(), captures, errors, failedRequests, externalRequests }, null, 2));
  if (errors.length || failedRequests.length || externalRequests.length) process.exitCode = 1;
} finally { await browser.close(); }
