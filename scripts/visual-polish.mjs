// Isolated visual fixtures only; the fresh-save acceptance suite lives in tests/browser.
// Run with VISUAL_BASE_URL=http://localhost:5173/ VISUAL_OUTPUT_DIR=artifacts/polish-after node scripts/visual-polish.mjs
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { boot, read, walk, look, inspect, closePanel, drivePath, stop } from '../tests/browser/helpers.ts';

const output = resolve(process.env.VISUAL_OUTPUT_DIR || 'artifacts/polish-after');
const baseURL = process.env.VISUAL_BASE_URL || 'http://127.0.0.1:4183/';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: process.platform === 'darwin' ? ['--use-angle=metal'] : [],
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
});
const errors = [], failures = [], reports = {};
const pageOptions = { viewport: { width: 1440, height: 900 }, baseURL };
function observe(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => failures.push(request.url()));
}
async function capture(page, name) {
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${output}/${name}.png` });
}
async function fps(page) {
  return page.evaluate(() => new Promise(resolve => {
    const times = []; const begin = performance.now();
    function sample(time) {
      times.push(time);
      if (time - begin < 3000) requestAnimationFrame(sample);
      else {
        const intervals = times.slice(1).map((value, i) => value - times[i]);
        const canvas = document.querySelector('canvas');
        const gl = canvas.getContext('webgl2');
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        resolve({ fps: (times.length - 1) * 1000 / (times.at(-1) - times[0]), maxFrameMs: Math.max(...intervals), renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unavailable', drawCalls: window.__JD?.drawCalls });
      }
    }
    requestAnimationFrame(sample);
  }));
}
try {
  const yard = await browser.newPage(pageOptions); observe(yard);
  await boot(yard); await yard.waitForTimeout(4300);
  await look(yard, 0, .03); await capture(yard, 'entrance');
  await walk(yard, -20, 17); await look(yard, -.38, -.04); await capture(yard, 'scrapyard');
  reports.yard = await fps(yard);
  await yard.close();

  // Valid versioned fixture in this temporary browser context only. It does not
  // claim fresh-save purchase acceptance and never touches the user's browser.
  const fixture = {
    version: 1, seed: 642019,
    purchasedListings: ['shell-hachiro', 'part-i4-stock', 'part-street-1', 'part-paint-saffron'],
    cars: [{ id: 'car-hachiro', shellId: 'hachiro', engineId: 'instance-part-i4-stock', wheelsId: 'instance-part-street-1', paint: '#e7ad36' }],
    inventory: [{ id: 'instance-part-i4-stock', partId: 'i4-stock' }, { id: 'instance-part-street-1', partId: 'street-1' }],
    paints: ['paint-saffron'],
  };
  const page = await browser.newPage(pageOptions); observe(page);
  await page.addInitScript(save => localStorage.setItem('junkyard-drivers-save-v1', JSON.stringify(save)), fixture);
  await boot(page);
  await walk(page, -24, -3); await walk(page, -24, -13.5); await inspect(page, -26.4, -15, 'workbench');
  await page.waitForTimeout(1400); await capture(page, 'garage-fixture'); reports.garage = await fps(page);
  await closePanel(page); await walk(page, -22.6, -13); await inspect(page, -20, -13, 'garage-car');
  const route = [{ x: -20, z: 30 }, { x: -20, z: 34 }];
  for (let i = 1; i <= 8; i++) { const a = Math.PI - Math.PI / 2 * i / 8; route.push({ x: -10 + 10 * Math.cos(a), z: 34 + 10 * Math.sin(a) }); }
  route.push({ x: 55, z: 44 });
  await drivePath(page, route); await stop(page); await capture(page, 'town-fixture'); reports.town = await fps(page);
  reports.finalPosition = (await read(page)).position;
  await page.close();
  const report = { visualFixture: true, baseURL, captured: ['entrance', 'scrapyard', 'garage-fixture', 'town-fixture'], reports, errors, failures };
  writeFileSync(`${output}/visual-report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (errors.length || failures.length) process.exitCode = 1;
} finally { await browser.close(); }
