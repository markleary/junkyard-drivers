import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { boot, inspect, read, walk } from './helpers';
import { bootTablet, touchInspect, touchWalk } from './touch-helpers';
import { newProgress, PROGRESS_KEY, type Progress } from '../../src/game/progress';
import { DEFAULT_PAINT, SHELLS, getShell, type ShellId } from '../../src/game/catalog';
import { chooseRestorationRoute, startRestoration, workRestoration } from '../../src/game/restoration';
import { acceptJob } from '../../src/game/jobs';
import { install, newGame, paintCar, purchase, STORAGE_KEY, type GameState } from '../../src/game/state';

const output = 'artifacts/restoration';
function runningCar(shellId: ShellId): GameState {
  const engine = `${getShell(shellId).mount.toLowerCase()}-stock`, carId = `car-${shellId}`;
  let state = newGame();
  for (const id of [`shell-${shellId}`, `part-${engine}`, 'part-street-1', 'part-paint-saffron']) state = purchase(state, id);
  return install(install(state, carId, `instance-part-${engine}`), carId, 'instance-part-street-1');
}
async function prepare(page: Page, baseURL: string, state: GameState, progress: Progress = newProgress()) {
  mkdirSync(output, { recursive: true });
  await page.addInitScript(({ state, progress, saveKey, progressKey }) => {
    if (sessionStorage.getItem('restoration-seeded')) return;
    sessionStorage.setItem('restoration-seeded', '1');
    localStorage.setItem(saveKey, JSON.stringify(state)); localStorage.setItem(progressKey, JSON.stringify(progress));
  }, { state, progress, saveKey: STORAGE_KEY, progressKey: PROGRESS_KEY });
  const errors: string[] = [], failed: string[] = [], external: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', event => { if (event.type() === 'error') errors.push(event.text()); });
  page.on('requestfailed', request => failed.push(request.url()));
  page.on('request', request => { if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== new URL(baseURL).origin) external.push(request.url()); });
  return { errors, failed, external };
}
const record = async (page: Page, carId?: string) => {
  const snapshot = await read(page);
  return snapshot.progress.restorations[carId ?? snapshot.state.cars[0].id];
};
async function enterBench(page: Page) {
  await walk(page, -24, -3); await walk(page, -24, -13.5);
  await inspect(page, -26.4, -15, 'workbench');
  await page.locator('[data-action="restoration"]').click();
}
async function keyboardStep(page: Page, next: string) {
  await page.locator('#restoration-work').focus(); await page.keyboard.down('Space');
  await expect.poll(async () => (await record(page)).stage, { timeout: 20000 }).toBe(next);
  // A held key cannot start the next operation or skip the patina choice.
  await page.waitForTimeout(150); expect((await record(page)).work).toBe(0);
  await page.keyboard.up('Space'); await page.waitForTimeout(50);
}

test('the repainted orchard door keeps its lettering choice on reload and in the exported photo pair', async ({ page, baseURL }, testInfo) => {
  const id = 'car-orchard';
  const state = purchase(runningCar('orchard'), 'part-paint-cobalt');
  let progress = startRestoration(state, { ...newProgress(), recovery: 'complete' }, id);
  for (let i = 0; i < 4; i++) progress = workRestoration(state, progress, id, 1);
  const watched = await prepare(page, baseURL!, state, progress);
  const clean = page.getByRole('button', { name: 'Clean door' });
  const lettering = page.getByRole('button', { name: 'Bell Orchard lettering' });
  const exportPair = async (path: string) => {
    await page.getByRole('button', { name: 'Before & after' }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save photo pair' }).click();
    await (await download).saveAs(path);
    await page.getByRole('button', { name: 'Back to bodywork' }).click();
    return readFileSync(path).toString('base64');
  };

  await boot(page); await enterBench(page);
  await expect(lettering).toHaveCount(0);
  await page.locator('[data-restoration-paint="paint-cobalt"]').click();
  await keyboardStep(page, 'complete');
  await expect(clean).toHaveAttribute('aria-pressed', 'true');
  await lettering.focus(); await page.keyboard.press('Enter');
  await expect(lettering).toHaveAttribute('aria-pressed', 'true');
  await boot(page); await enterBench(page);
  await expect(lettering).toHaveAttribute('aria-pressed', 'true');
  mkdirSync('artifacts/recovery', { recursive: true });
  const withLogo = await exportPair('artifacts/recovery/relettered-photo-pair.png');
  await clean.click();
  const plain = await exportPair(testInfo.outputPath('clean-photo-pair.png'));
  // Compare the actual downloaded prints. Count visibly changed pixels inside each photo, excluding its caption.
  const [before, after] = await page.evaluate(async (prints) => {
    const images = await Promise.all(prints.map(async data => {
      const image = new Image();
      image.src = 'data:image/png;base64,' + data;
      await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(image, 0, 0);
      return ctx.getImageData(0, 0, canvas.width, canvas.height);
    }));
    const [a, b] = images;
    return [40, 860].map(left => {
      let changed = 0;
      for (let y = 148; y < 733; y++) for (let x = left; x < left + 780; x++) {
        const i = (y * a.width + x) * 4;
        if (Math.abs(a.data[i] - b.data[i]) > 40) changed++;
      }
      return changed;
    });
  }, [withLogo, plain]);
  expect(before).toBeLessThan(150);
  expect(after).toBeGreaterThan(before + 800);
  await boot(page); await enterBench(page);
  await expect(clean).toHaveAttribute('aria-pressed', 'true');
  expect(watched).toEqual({ errors: [], failed: [], external: [] });
});

test('hands-on bodywork restores the Sirocco, saves stages and exports frozen before-and-after photos', async ({ page, baseURL }) => {
  const watched = await prepare(page, baseURL!, runningCar('veloce'));
  await boot(page); await enterBench(page);
  await page.locator('[data-action="restoration-start"]').click();
  const position = (await read(page)).position;
  await page.screenshot({ path: `${output}/bench-before.png` });
  const preview = page.locator('#restoration-preview');
  const before = await preview.evaluate((element: HTMLCanvasElement) => element.toDataURL());
  // Drag through the rendered car using ordinary mouse events, with no state hook.
  const box = (await preview.boundingBox())!;
  await page.mouse.move(box.x + box.width * .35, box.y + box.height * .6); await page.mouse.down();
  for (let i = 0; i < 12; i++) {
    await page.mouse.move(box.x + box.width * (i % 2 ? .35 : .65), box.y + box.height * .6, { steps: 8 });
    await page.waitForTimeout(35);
  }
  await page.mouse.up();
  expect((await record(page)).work).toBeGreaterThan(0);
  await keyboardStep(page, 'rust');
  await page.locator('[data-restoration-paint="paint-saffron"]').click();
  await expect(page.locator('[data-restoration-paint="original"]')).toHaveAttribute('aria-pressed', 'false');
  expect((await read(page)).state.cars[0].paint).toBe('#e7ad36');
  await page.locator('[data-restoration-paint="original"]').click();
  await expect(page.locator('[data-restoration-paint="original"]')).toHaveAttribute('aria-pressed', 'true');
  expect((await read(page)).state.cars[0].paint).toBe(DEFAULT_PAINT.veloce);
  await page.locator('#restoration-work').focus(); await page.keyboard.down('Space');
  await expect.poll(async () => (await record(page)).work).toBeGreaterThan(.05);
  await page.keyboard.up('Space');
  await expect(page.locator('[data-restoration-route="patina"]')).toBeDisabled();
  for (const next of ['repair', 'prime', 'paint', 'complete']) await keyboardStep(page, next);
  expect((await read(page)).position).toEqual(position);
  expect(await preview.evaluate((element: HTMLCanvasElement) => element.toDataURL())).not.toBe(before);
  await page.screenshot({ path: `${output}/bench-painted.png` });
  await page.locator('[data-action="restoration-photos"]').click();
  await expect(page.locator('#restoration-before')).toHaveJSProperty('naturalWidth', 800);
  await expect(page.locator('#restoration-after')).toHaveJSProperty('naturalWidth', 800);
  const photos = await record(page);
  expect(photos.after.paint).toBe(DEFAULT_PAINT.veloce);
  expect(await page.locator('#restoration-before').getAttribute('src')).not.toBe(await page.locator('#restoration-after').getAttribute('src'));
  await page.screenshot({ path: `${output}/photo-pair.png` });
  const download = page.waitForEvent('download'); await page.locator('[data-action="restoration-download"]').click();
  const print = await download;
  expect(print.suggestedFilename()).toContain('restoration.png');
  await print.saveAs(`${output}/export-pair.png`);
  const png = readFileSync(`${output}/export-pair.png`);
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1680, 800]);
  await page.reload(); await expect(page.locator('#begin')).toBeEnabled();
  expect(await record(page)).toEqual(photos);
  expect(watched).toEqual({ errors: [], failed: [], external: [] });
});

test('controller can preserve Packhorse patina and focus loss stops a held tool', async ({ page, baseURL }) => {
  const initial = paintCar(purchase(runningCar('packhorse'), 'part-paint-cream'), 'car-packhorse', 'paint-cream');
  const startingPaint = initial.cars[0].paint;
  const watched = await prepare(page, baseURL!, initial);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'getGamepads', { value: () => document.body?.hasAttribute('data-test-pad') ? [{
      connected: true, index: 0, mapping: 'standard', axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === Number(document.body?.getAttribute('data-test-button') ?? -1), value: Number(i === Number(document.body?.getAttribute('data-test-button') ?? -1)) })),
    }] : [] });
  });
  await boot(page); await enterBench(page); await page.locator('[data-action="restoration-start"]').click();
  await page.evaluate(() => document.body.setAttribute('data-test-pad', ''));
  await page.locator('#restoration-work').focus();
  await page.evaluate(() => document.body.setAttribute('data-test-button', '0'));
  await expect.poll(async () => (await record(page)).work).toBeGreaterThan(.1);
  await page.evaluate(() => document.body.removeAttribute('data-test-button'));
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)!).restorations['car-packhorse'].work, PROGRESS_KEY)).toBeGreaterThan(.1);
  await page.evaluate(() => document.body.setAttribute('data-test-button', '0'));
  await expect.poll(async () => (await record(page)).work).toBeGreaterThan(.2);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const partial = (await record(page)).work; await page.waitForTimeout(350);
  expect((await record(page)).work).toBe(partial);
  await page.evaluate(() => document.body.removeAttribute('data-test-button')); await page.waitForTimeout(100);
  const step = async (next: string) => {
    await page.locator('#restoration-work').focus();
    await page.evaluate(() => document.body.setAttribute('data-test-button', '0'));
    await expect.poll(async () => (await record(page)).stage, { timeout: 20000 }).toBe(next);
    await page.waitForTimeout(180); expect((await record(page)).work).toBe(0);
    await page.evaluate(() => document.body.removeAttribute('data-test-button')); await page.waitForTimeout(100);
  };
  await step('rust');
  await page.locator('[data-restoration-paint="paint-saffron"]').click();
  expect((await read(page)).state.cars[0].paint).toBe('#e7ad36');
  await page.locator('[data-restoration-route="patina"]').click();
  expect((await read(page)).state.cars[0].paint).toBe(startingPaint);
  for (const next of ['repair', 'seal', 'complete']) await step(next);
  await page.locator('[data-action="restoration-photos"]').click();
  await expect(page.locator('.status-stamp')).toContainText('PATINA PRESERVED');
  await page.screenshot({ path: `${output}/patina-pair.png` });
  await page.locator('[data-action="restoration-back"]').first().click();
  await expect(page.locator('[data-paint="paint-saffron"]')).toBeDisabled();
  const preserved = await record(page);
  expect(preserved.after.restored).toBe(false);
  expect(preserved.after.paint).toBe(preserved.before.paint);
  await page.reload(); await expect(page.locator('#begin')).toBeEnabled();
  expect(await record(page)).toEqual(preserved);
  expect((await read(page)).state.cars[0].paint).toBe(preserved.before.paint);
  expect(watched).toEqual({ errors: [], failed: [], external: [] });
});

test('a patina Roadmaster can be refinished in customer burgundy with updated photos and a saved paint check', async ({ page, baseURL }) => {
  let state = paintCar(purchase(runningCar('bison'), 'part-paint-burgundy'), 'car-bison', 'paint-burgundy');
  let progress = startRestoration(state, acceptJob(newProgress(), 'sunday-v8'), 'car-bison');
  progress = workRestoration(state, progress, 'car-bison', 1);
  ({ state, progress } = chooseRestorationRoute(state, progress, 'car-bison', 'patina'));
  while (progress.restorations['car-bison'].stage !== 'complete') progress = workRestoration(state, progress, 'car-bison', 1);
  const original = progress.restorations['car-bison'].before;
  const watched = await prepare(page, baseURL!, state, progress);
  await boot(page); await enterBench(page);
  await expect(page.locator('[data-action="restoration-refinish"]')).toBeVisible();
  await page.locator('[data-action="restoration-back"]').first().click();
  await expect(page.locator('[data-paint="paint-burgundy"]')).toBeDisabled();
  await page.locator('[data-action="jobs"]').click();
  const paintCheck = page.locator('.active-commission [data-check="paint"]');
  await expect(paintCheck).not.toHaveClass('done');
  await expect(paintCheck).toContainText('Oxblood burgundy');
  await expect(paintCheck).toContainText('refinish the patina');
  await page.locator('[data-action="job-garage"]').click();
  await page.locator('[data-action="restoration-refinish"]').click();
  expect(await record(page)).toMatchObject({ route: 'paint', stage: 'prime', work: 0, before: original, after: null });
  await page.locator('[data-restoration-paint="paint-burgundy"]').click();
  await keyboardStep(page, 'paint');
  await page.screenshot({ path: `${output}/customer-refinish-primer.png` });
  await keyboardStep(page, 'complete');
  await page.locator('[data-action="restoration-photos"]').click();
  await expect(page.locator('#restoration-before')).toHaveJSProperty('naturalWidth', 800);
  await expect(page.locator('#restoration-after')).toHaveJSProperty('naturalWidth', 800);
  const refinished = await record(page);
  expect(refinished.before).toEqual(original);
  expect(refinished.after).toMatchObject({ paint: '#6f303c', restored: true });
  expect(await page.locator('#restoration-before').getAttribute('src')).not.toBe(await page.locator('#restoration-after').getAttribute('src'));
  await page.screenshot({ path: `${output}/customer-refinish-photos.png` });
  await page.locator('[data-action="restoration-back"]').first().click();
  await expect(page.locator('[data-paint="paint-burgundy"]')).toBeEnabled();
  await page.locator('[data-action="jobs"]').click();
  await expect(paintCheck).toHaveClass('done');
  await page.screenshot({ path: `${output}/customer-refinish-checklist.png` });
  await boot(page); await enterBench(page);
  expect(await record(page)).toEqual(refinished);
  await page.locator('[data-action="restoration-back"]').first().click();
  await page.locator('[data-action="jobs"]').click();
  await expect(paintCheck).toHaveClass('done');
  expect(watched).toEqual({ errors: [], failed: [], external: [] });
});

test('tablet Kestrel bodywork cancels cleanly, resumes after reload and fits portrait and landscape', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  try {
    const watched = await prepare(page, baseURL!, runningCar('hachiro'));
    let touch = await bootTablet(page);
    await touchWalk(touch, -24, -3); await touchWalk(touch, -24, -13.5); await touchInspect(touch, -26.4, -15, 'workbench');
    await touch.tap('[data-action="restoration"]'); await touch.tap('[data-action="restoration-start"]');
    await touch.hold('#restoration-work', 3, true);
    await expect.poll(async () => (await record(page)).work).toBeGreaterThan(.15);
    await touch.cancel();
    const partial = (await record(page)).work;
    await page.waitForTimeout(300); expect((await record(page)).work).toBe(partial);
    await page.screenshot({ path: `${output}/tablet-landscape.png` });
    await page.setViewportSize({ width: 820, height: 1180 });
    expect(await page.locator('#panel').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await expect(page.locator('#restoration-preview')).toBeInViewport();
    await page.screenshot({ path: `${output}/tablet-portrait.png` });
    await page.reload(); await expect(page.locator('#begin')).toBeEnabled();
    expect((await record(page)).work).toBe(partial);
    touch = await bootTablet(page);
    await touchWalk(touch, -24, -3); await touchWalk(touch, -24, -13.5); await touchInspect(touch, -26.4, -15, 'workbench');
    await touch.tap('[data-action="restoration"]'); await touch.hold('#restoration-work', 3, true);
    await expect.poll(async () => (await record(page)).stage, { timeout: 20000 }).toBe('rust');
    await touch.up(3); expect((await record(page)).work).toBe(0);
    expect(watched).toEqual({ errors: [], failed: [], external: [] });
  } finally { await context.close(); }
});


test('every salvageable shell retains its bodywork and opens its own matching photo pair', async ({ page, baseURL }) => {
  // Only startup fixtures write storage. The collection, bench and photos are
  // then exercised through their normal buttons; no QA hook changes a car.
  let state = SHELLS.reduce((save, shell) => purchase(save, `shell-${shell.id}`), newGame());
  let progress = newProgress();
  for (const [index, car] of state.cars.entries()) {
    progress = startRestoration(state, progress, car.id);
    progress = workRestoration(state, progress, car.id, 1);
    if (index % 2) ({ state, progress } = chooseRestorationRoute(state, progress, car.id, 'patina'));
    while (progress.restorations[car.id].stage !== 'complete') progress = workRestoration(state, progress, car.id, 1);
  }
  const watched = await prepare(page, baseURL!, state, progress);
  await boot(page);
  expect((await read(page)).progress.restorations).toEqual(progress.restorations);
  await walk(page, -24, -3); await walk(page, -24, -13.5);
  await inspect(page, -26.4, -15, 'workbench');
  const afterImages = new Set<string>();
  for (const shell of SHELLS) {
    await page.locator(`[data-select="car-${shell.id}"]`).click();
    await page.locator('[data-action="restoration"]').click();
    await expect(page.locator('#panel-title')).toHaveText(shell.name);
    await page.locator('[data-action="restoration-photos"]').click();
    await expect(page.locator('#restoration-before')).toHaveAttribute('alt', `${shell.name} before bodywork`);
    await expect(page.locator('#restoration-after')).toHaveAttribute('alt', `${shell.name} after bodywork`);
    await expect(page.locator('#restoration-before')).toHaveJSProperty('naturalWidth', 800);
    await expect(page.locator('#restoration-after')).toHaveJSProperty('naturalWidth', 800);
    const before = (await page.locator('#restoration-before').getAttribute('src'))!;
    const after = (await page.locator('#restoration-after').getAttribute('src'))!;
    expect(after).not.toBe(before); afterImages.add(after);
    expect(await record(page, `car-${shell.id}`)).toEqual(progress.restorations[`car-${shell.id}`]);
    await page.locator('[data-action="restoration-back"]').first().click();
  }
  expect(afterImages.size).toBe(SHELLS.length);
  await page.reload(); await expect(page.locator('#begin')).toBeEnabled();
  expect((await read(page)).progress.restorations).toEqual(progress.restorations);
  expect(watched).toEqual({ errors: [], failed: [], external: [] });
});
