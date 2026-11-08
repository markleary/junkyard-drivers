// Safari-engine smoke on this Mac, not a claim of physical iPad testing.
// Playwright WebKit offers native taps but no native multi-touch drag API;
// Chromium acceptance in tests/browser/touch.spec.ts covers native multi-touch.
import { webkit } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const baseURL = process.env.VISUAL_BASE_URL || 'http://127.0.0.1:5173/';
const output = resolve(process.env.VISUAL_OUTPUT_DIR || 'artifacts/tablet');
mkdirSync(output, { recursive: true });
const errors = [], failed = [];
const browser = await webkit.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_WEBKIT_EXECUTABLE_PATH || undefined });
const page = await browser.newPage({ baseURL, viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('requestfailed', request => failed.push({ url: request.url(), error: request.failure()?.errorText }));
try {
  await page.goto('./?qa=1');
  await page.waitForFunction(() => document.querySelector('#begin') && !document.querySelector('#begin').disabled);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${output}/webkit-startup.png` });
  await page.locator('#begin').tap();
  await page.waitForFunction(() => window.__JD?.touchEnabled && !window.__JD.paused);
  const before = await page.evaluate(() => window.__JD.position);
  await page.locator('#touch-stick').evaluate(element => {
    const rect = element.getBoundingClientRect(), x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
    element.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 101, pointerType: 'touch', isPrimary: true, buttons: 1, clientX: x, clientY: y, bubbles: true, cancelable: true }));
    element.dispatchEvent(new PointerEvent('pointermove', { pointerId: 101, pointerType: 'touch', isPrimary: true, buttons: 1, clientX: x, clientY: y - rect.height * .42, bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(650);
  const moving = await page.evaluate(() => window.__JD);
  if (moving.position.z >= before.z - .5) throw new Error('WebKit pointer gesture did not move the player');
  await page.screenshot({ path: `${output}/webkit-on-foot.png` });
  await page.locator('#pause-button').tap();
  if (!(await page.evaluate(() => window.__JD.paused))) throw new Error('WebKit native pause tap did not pause');
  const input = await page.evaluate(() => window.__JD.touchInput);
  if (Object.values(input).some(value => value !== 0 && value !== false)) throw new Error('WebKit pause left a held control');
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.waitForTimeout(250);
  const portraitViewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, canvasWidth: document.querySelector('#world').clientWidth, canvasHeight: document.querySelector('#world').clientHeight }));
  if (portraitViewport.canvasHeight !== portraitViewport.height || portraitViewport.canvasWidth !== portraitViewport.width) throw new Error(`WebKit canvas did not resize: ${JSON.stringify(portraitViewport)}`);
  await page.screenshot({ path: `${output}/webkit-pause-portrait.png` });
  await page.locator('[data-action="resume"]').tap();
  if (await page.evaluate(() => !!document.pointerLockElement)) throw new Error('Touch mode acquired pointer lock');
  const ready = await page.evaluate(() => ({ touchEnabled: window.__JD.touchEnabled, paused: window.__JD.paused, quality: window.__JD.graphicsQuality, userAgent: navigator.userAgent }));
  const report = { baseURL, engine: 'Playwright WebKit on macOS', browserVersion: browser.version(), physicalIPad: false, nativeTaps: true, movementInput: 'Synthetic PointerEvent; native multi-touch is verified separately in Chromium', positionBefore: before, positionAfter: moving.position, portraitViewport, ...ready, errors, failed };
  writeFileSync(`${output}/webkit-smoke.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (errors.length || failed.length) process.exitCode = 1;
} finally { await browser.close(); }
