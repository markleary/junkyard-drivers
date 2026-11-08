// Visual fixtures only. The browser acceptance suite separately proves fresh-save play.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { boot, read, walk, look, inspect, closePanel, stop } from '../tests/browser/helpers.ts';

const baseURL = process.env.VISUAL_BASE_URL || 'http://127.0.0.1:5173/';
const output = resolve(process.env.VISUAL_OUTPUT_DIR || 'artifacts/ui-after');
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: process.platform === 'darwin' ? ['--use-angle=metal'] : [],
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
});
const errors = [], failures = [], external = [], captures = [];
const options = { baseURL, viewport: { width: 1440, height: 900 } };
function observe(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => failures.push(request.url()));
  page.on('request', request => { if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== new URL(baseURL).origin) external.push(request.url()); });
}
async function capture(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${output}/${name}.png` });
  console.log(`[ui-review] ${name}`);
  captures.push({ name, viewport: page.viewportSize(), fonts: await page.evaluate(() => Array.from(document.fonts).map(font => ({ family: font.family, weight: font.weight, status: font.status }))), panels: await page.locator('#panel, #menu').evaluateAll(elements => elements.map(element => {
    const box = element.getBoundingClientRect();
    return { id: element.id, hidden: element.hidden, width: box.width, height: box.height, scrollHeight: element.scrollHeight };
  })) });
}

// Stable, valid version-one fixture with a full parts shelf and three owned cars.
const engines = ['i4-stock', 'i4-performance', 'v8-stock', 'v8-performance', 'v12-stock', 'v12-performance', 'crate-i4-stock', 'crate-i4-performance', 'crate-v8-stock', 'crate-v8-performance', 'crate-v12-stock', 'crate-v12-performance'];
const wheels = ['street', 'sport', 'new-touring', 'new-sport'].flatMap(prefix => [1, 2, 3].map(n => `${prefix}-${n}`));
const paints = ['paint-saffron', 'paint-oxide', 'paint-teal', 'paint-ivory', 'paint-cobalt', 'paint-silver', 'paint-forest'];
const fixture = {
  version: 1, seed: 642019,
  purchasedListings: ['shell-hachiro', 'shell-bison', 'shell-veloce', ...[...engines, ...wheels, ...paints].map(id => `part-${id}`)],
  cars: [
    { id: 'car-hachiro', shellId: 'hachiro', engineId: 'instance-part-i4-stock', wheelsId: 'instance-part-street-1', paint: '#e7ad36' },
    { id: 'car-bison', shellId: 'bison', engineId: null, wheelsId: null, paint: '#8a5c42' },
    { id: 'car-veloce', shellId: 'veloce', engineId: null, wheelsId: null, paint: '#8d715d' },
  ],
  inventory: [...engines, ...wheels].map(partId => ({ id: `instance-part-${partId}`, partId })),
  paints,
};

try {
  const page = await browser.newPage(options); observe(page);
  await page.goto('./?qa=1');
  await page.locator('#begin:not([disabled])').waitFor();
  await capture(page, 'startup');
  await page.locator('#begin').click();
  await look(page, 0, .03); await capture(page, 'on-foot');
  await page.keyboard.press('Escape'); await capture(page, 'pause');
  await page.locator('[data-action="new"]').click(); await capture(page, 'reset');
  await page.locator('[data-action="cancel-new"]').click();
  await page.setViewportSize({ width: 800, height: 600 }); await capture(page, 'pause-800');
  await page.setViewportSize(options.viewport); await page.locator('[data-action="resume"]').click();
  await walk(page, -18.2, 14.1); await inspect(page, -15, 12, 'shell-hachiro'); await capture(page, 'inspect'); await closePanel(page);
  await walk(page, -20, 20); await walk(page, -33, 20); await walk(page, -33, 2); await inspect(page, -36, 2, 'rack-engines'); await capture(page, 'salvage-parts'); await closePanel(page);
  await walk(page, -33, 23); await walk(page, -20, 26); await walk(page, -20, 34); await walk(page, 12, 34); await walk(page, 12, 11.2); await inspect(page, 12, 8, 'store-counter');
  await capture(page, 'store');
  await page.locator('[data-category="paint"]').click(); await capture(page, 'store-paint');
  await page.setViewportSize({ width: 800, height: 600 }); await capture(page, 'store-800');
  await page.close();

  const garage = await browser.newPage(options); observe(garage);
  await garage.addInitScript(save => localStorage.setItem('junkyard-drivers-save-v1', JSON.stringify(save)), fixture);
  await boot(garage);
  if ((await read(garage)).state.inventory.length !== fixture.inventory.length) throw new Error('Full-inventory visual fixture was rejected');
  await walk(garage, -24, -3); await walk(garage, -24, -13.5); await inspect(garage, -26.4, -15, 'workbench');
  await garage.waitForTimeout(900); await capture(garage, 'garage');
  await garage.locator('[data-paint="paint-forest"]').scrollIntoViewIfNeeded(); await capture(garage, 'garage-paint');
  await garage.setViewportSize({ width: 800, height: 600 }); await capture(garage, 'garage-800');
  await garage.locator('[data-select="car-veloce"]').click(); await capture(garage, 'incomplete-800');
  await garage.setViewportSize(options.viewport); await garage.locator('[data-select="car-hachiro"]').click();
  await closePanel(garage); await walk(garage, -22.6, -13); await inspect(garage, -20, -13, 'garage-car');
  await garage.keyboard.down('KeyW'); await garage.waitForTimeout(2000); await garage.keyboard.up('KeyW');
  await capture(garage, 'driving'); await stop(garage); await garage.close();

  const report = { visualFixtures: true, baseURL, captures, errors, failures, external };
  writeFileSync(`${output}/ui-review.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ output, captures: captures.map(c => c.name), errors, failures, external }, null, 2));
  if (errors.length || failures.length || external.length) process.exitCode = 1;
} finally { await browser.close(); }
