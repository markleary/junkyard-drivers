import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { boot, closePanel, drivePath, inspect, loopPath, read, stop, walk } from './helpers';
import { bootTablet, closeTabletPanel, touchInspect, touchWalk } from './touch-helpers';
import { newProgress, PROGRESS_KEY } from '../../src/game/progress';
import { availableFunds, newGame, purchase, STORAGE_KEY, type GameState } from '../../src/game/state';
import { PROJECT_SHELLS } from '../../src/world/yard';

const output = 'artifacts/jobs';
async function capture(page: Page, name: string) {
  await expect(page.locator('#toast')).not.toHaveClass(/visible/);
  return page.screenshot({ path: `${output}/${name}.jpg`, type: 'jpeg', quality: 82 });
}

function watch(page: Page, baseURL: string) {
  const errors: string[] = [], failed: string[] = [], external: string[] = [], origin = new URL(baseURL).origin;
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => failed.push(request.url()));
  page.on('request', request => { if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== origin) external.push(request.url()); });
  return { errors, failed, external };
}

async function prepare(page: Page, save = newGame(), progress = newProgress()) {
  mkdirSync(output, { recursive: true });
  await page.addInitScript(({ save, progress, saveKey, progressKey }) => {
    if (sessionStorage.getItem('jd-jobs-prepared')) return;
    sessionStorage.setItem('jd-jobs-prepared', '1');
    localStorage.setItem(saveKey, JSON.stringify(save));
    localStorage.setItem(progressKey, JSON.stringify(progress));
  }, { save, progress, saveKey: STORAGE_KEY, progressKey: PROGRESS_KEY });
}

async function panelFits(page: Page) {
  const box = await page.locator('#panel').boundingBox(), viewport = page.viewportSize()!;
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
  expect(await page.locator('#panel').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await expect(page.locator('[aria-label="Close panel"]')).toBeInViewport();
}

test('customer commission runs from a brief through assembly and a fresh lap to delivery and saved reputation', async ({ page, baseURL }) => {
  const watched = watch(page, baseURL!);
  let save = newGame();
  for (const listing of ['shell-hachiro', 'part-i4-stock', 'part-street-1', 'part-paint-cream']) save = purchase(save, listing);
  await prepare(page, save);
  await page.setViewportSize({ width: 800, height: 600 });
  await boot(page);
  await page.keyboard.press('Escape');
  await page.locator('[data-action="jobs"]:visible').click();
  await expect(page.locator('#panel-title')).toHaveText('Workshop job board');
  await panelFits(page);
  await expect(page.locator('[data-action="accept-job"]')).toHaveCount(3);
  await capture(page, 'board-800x600');
  // Accept with native keyboard activation; no save or QA hook supplies job progress.
  await page.locator('[data-job="first-wheels"]').focus();
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await read(page)).progress.jobs.active).toBe('first-wheels');
  await expect(page.locator('.active-commission [data-check="running"]')).not.toHaveClass(/done/);
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.querySelector('#panel')!.contains(document.activeElement))).toBe(true);
  await closePanel(page);

  await walk(page, -24, -3); await walk(page, -24, -13.5);
  await inspect(page, -26.4, -15, 'workbench');
  await page.locator('[data-install="instance-part-i4-stock"]').click();
  await page.locator('[data-install="instance-part-street-1"]').click();
  await page.locator('[data-paint="paint-cream"]').click();
  await page.locator('[data-action="jobs"]:visible').click();
  await expect(page.locator('.active-commission [data-check="running"]')).toHaveClass(/done/);
  await expect(page.locator('.active-commission [data-check="paint"]')).toHaveClass(/done/);
  await expect(page.locator('.active-commission [data-check="lap"]')).not.toHaveClass(/done/);
  await page.locator('[data-action="job-garage"]').click();
  await expect(page.locator('#panel-title')).toHaveText('Build sheet');
  await closePanel(page);
  await page.setViewportSize({ width: 1180, height: 820 });
  await walk(page, -22.6, -13); await inspect(page, -20, -13, 'garage-car');
  const loop = (await read(page)).loop;
  await drivePath(page, loopPath(loop[2].x, loop[3].z));
  await stop(page);
  await expect.poll(async () => (await read(page)).progress.jobs.proof?.jobId).toBe('first-wheels');
  expect((await read(page)).progress.jobs.proof.seconds).toBeGreaterThan(20);
  await expect(page.locator('#objective')).toContainText('deliver this car');
  // Recovery puts the finished car back in its garage bay facing the gate; it does not replace the earned proof.
  await page.keyboard.press('KeyR');
  await expect(page.locator('#route-title')).toHaveText('CUSTOMER HANDOVER');
  await expect(page.locator('#route-detail')).toHaveText('Second Chance Motors');
  const dealer = (await read(page)).dealer;
  await drivePath(page, [{ x: -20, z: 30 }, { x: -20, z: 60 }, { x: -19.5, z: dealer.bay.z - 12 }, { x: -15, z: dealer.bay.z - 3 }, { x: dealer.bay.x - 6, z: dealer.bay.z }, { x: dealer.bay.x - .5, z: dealer.bay.z }]);
  await stop(page);
  await page.keyboard.press('KeyE');
  const delivery = page.locator('[data-action="deliver-job"]');
  await expect(delivery).toBeEnabled();
  await expect(delivery).toContainText('$4,100');
  await delivery.scrollIntoViewIfNeeded();
  await capture(page, 'customer-handover');
  const before = await read(page), cash = availableFunds(before.state as GameState, before.progress.budget);
  await delivery.click();
  const delivered = await read(page);
  expect(delivered.state.cars).toHaveLength(0);
  expect(delivered.state.inventory).toHaveLength(0);
  expect(delivered.state.paints).toContain('paint-cream');
  expect(delivered.progress.jobs).toMatchObject({ active: null, completed: ['first-wheels'], proof: null });
  expect(availableFunds(delivered.state, delivered.progress.budget)).toBe(cash + 4100);
  expect(delivered.progress.sales.count).toBe(0);
  expect(delivered.mode).toBe('foot');
  await page.keyboard.press('Escape');
  await page.locator('[data-action="jobs"]:visible').click();
  await expect(page.locator('.workshop-reputation')).toContainText('Local favorite');
  await expect(page.locator('[data-job="weekend-sprite"]')).toBeEnabled();
  await page.locator('.completed-commissions').scrollIntoViewIfNeeded();
  await capture(page, 'first-customer-delivered');
  await page.reload();
  await expect(page.locator('#begin')).toBeEnabled();
  const reloaded = await read(page);
  expect(reloaded.state).toEqual(delivered.state);
  expect(reloaded.progress.jobs).toEqual(delivered.progress.jobs);
  expect(reloaded.progress.budget).toBe(delivered.progress.budget);
  expect(watched.errors).toEqual([]); expect(watched.failed).toEqual([]); expect(watched.external).toEqual([]);
});

test.describe('tablet customer workshop', () => {
  test.use({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });

  test('touch-only customer briefs, project row purchases and reclaimed parts build a family wagon', async ({ page, baseURL }) => {
    const watched = watch(page, baseURL!);
    await prepare(page);
    await page.addInitScript(() => {
      (window as any).__jobKeyboardEvents = 0;
      window.addEventListener('keydown', () => { (window as any).__jobKeyboardEvents++; });
    });
    const touch = await bootTablet(page);
    await touch.tap('#pause-button'); await touch.tap('[data-action="jobs"]:visible');
    await touch.tap('[data-job="first-wheels"]');
    await expect.poll(async () => (await read(page)).progress.jobs.active).toBe('first-wheels');
    await touch.tap('[data-action="cancel-job"]');
    await expect.poll(async () => (await read(page)).progress.jobs.active).toBeNull();
    await touch.tap('[data-job="family-estate"]');
    await page.setViewportSize({ width: 820, height: 1180 });
    await panelFits(page);
    await page.locator('#panel').evaluate(element => { element.scrollTop = 0; });
    await capture(page, 'family-brief-portrait');
    await page.reload();
    await expect(page.locator('#begin')).toBeEnabled();
    expect((await read(page)).progress.jobs.active).toBe('family-estate');
    await page.setViewportSize({ width: 1180, height: 820 });
    await touch.tap('#begin');
    await expect.poll(async () => (await read(page)).paused).toBe(false);

    // Follow the kept-clear parts aisle and crosslane; approach each new shell from its nose.
    for (const [x, z] of [[-20, 17], [-31, 17], [-31, -3], [-47, -3]]) await touchWalk(touch, x, z);
    for (const [id, spot] of Object.entries(PROJECT_SHELLS)) {
      await touchWalk(touch, spot.x, -2);
      await touchWalk(touch, spot.x, .1, .35);
      await touchInspect(touch, spot.x, spot.z, `shell-${id}`);
      await capture(page, `${id}-salvage-tag`);
      await touch.tap(`[data-buy="shell-${id}"]`);
      await expect(page.locator(`[data-buy="shell-${id}"]`)).toBeDisabled();
      await closeTabletPanel(touch);
      await touchWalk(touch, spot.x, -2);
    }
    expect((await read(page)).state.cars.map((car: { shellId: string }) => car.shellId)).toEqual(['estate', 'sprite', 'courier']);
    for (const [x, z] of [[-47, -3], [-33, -3], [-33, 2]]) await touchWalk(touch, x, z);
    await touchInspect(touch, -36, 2, 'rack-engines');
    await touch.tap('[data-buy="part-i4-economy"]');
    await touch.tap('[data-category="wheels"]'); await touch.tap('[data-buy="part-wheels-classic"]');
    await touch.tap('[data-category="paint"]'); await touch.tap('[data-buy="part-paint-cream"]');
    await touch.tap('[data-category="tuning"]'); await touch.tap('[data-buy="part-turbo-yard"]');
    await capture(page, 'salvage-tuning-rack');
    await closeTabletPanel(touch);
    for (const [x, z] of [[-31, -3], [-24, -3], [-24, -13.5]]) await touchWalk(touch, x, z);
    await touchInspect(touch, -26.4, -15, 'workbench');
    await touch.tap('[data-select="car-estate"]');
    await touch.tap('[data-install="instance-part-i4-economy"]');
    await touch.tap('[data-install="instance-part-wheels-classic"]');
    await touch.tap('[data-paint="paint-cream"]');
    await touch.tap('[data-fit="instance-part-turbo-yard"]');
    await touch.tap('[data-action="jobs"]:visible');
    await expect(page.locator('.active-commission [data-check="without-turbo"]')).not.toHaveClass(/done/);
    await touch.tap('[data-action="job-garage"]');
    await touch.tap('[data-unfit="turbo"]');
    await expect(page.locator('.build-status')).toContainText('READY FOR THE ROAD');
    await capture(page, 'estate-built-tablet');
    await touch.tap('[data-action="jobs"]:visible');
    await expect(page.locator('.active-commission [data-check="shell"]')).toHaveClass(/done/);
    await expect(page.locator('.active-commission [data-check="without-turbo"]')).toHaveClass(/done/);
    await expect(page.locator('.active-commission [data-check="paint"]')).toHaveClass(/done/);
    await expect(page.locator('.active-commission [data-check="lap"]')).not.toHaveClass(/done/);
    await page.locator('#panel').evaluate(element => { element.scrollTop = 0; });
    await capture(page, 'family-wagon-checklist');
    expect(await page.evaluate(() => (window as any).__jobKeyboardEvents)).toBe(0);
    const before = await read(page);
    await page.reload(); await expect(page.locator('#begin')).toBeEnabled();
    const after = await read(page);
    expect(after.state).toEqual(before.state);
    expect(after.progress.jobs).toEqual(before.progress.jobs);
    expect(after.progress.fitted).toEqual(before.progress.fitted);
    expect(await page.evaluate(() => (window as any).__jobKeyboardEvents)).toBe(0);
    expect(watched.errors).toEqual([]); expect(watched.failed).toEqual([]); expect(watched.external).toEqual([]);
  });
});

test('controller navigates the job board and a held confirm never accepts or cancels a second action', async ({ page, baseURL }) => {
  const watched = watch(page, baseURL!);
  await prepare(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'getGamepads', { value: () => {
      const pressed = Number(document.body?.getAttribute('data-job-pad-button') ?? -1);
      return [{ connected: true, index: 0, mapping: 'standard', axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, (_, index) => ({ pressed: index === pressed, value: Number(index === pressed) })) }];
    } });
  });
  await boot(page);
  const button = async (index: number) => {
    await page.evaluate(index => document.body.setAttribute('data-job-pad-button', String(index)), index);
    await page.waitForTimeout(80);
  };
  const tap = async (index: number) => { await button(index); await button(-1); };
  const choose = async (selector: string) => {
    for (let attempt = 0; attempt < 30; attempt++) {
      if (await page.locator(selector).evaluate(element => element === document.activeElement)) return;
      await tap(13);
    }
    throw new Error(`Controller could not focus ${selector}`);
  };
  await tap(9);
  await choose('[data-action="jobs"]:visible');
  await button(0);
  await expect(page.locator('#panel-title')).toHaveText('Workshop job board');
  await page.waitForTimeout(250);
  expect((await read(page)).progress.jobs.active).toBeNull();
  await button(-1);
  await choose('[data-job="first-wheels"]');
  await button(0);
  await expect.poll(async () => (await read(page)).progress.jobs.active).toBe('first-wheels');
  await page.waitForTimeout(250);
  expect((await read(page)).progress.jobs.active).toBe('first-wheels');
  await button(-1);
  await choose('[data-action="cancel-job"]');
  await tap(0);
  await expect.poll(async () => (await read(page)).progress.jobs.active).toBeNull();
  await expect(page.locator('.job-pad-hint')).toBeVisible();
  await capture(page, 'controller-board');
  await tap(1);
  await expect(page.locator('#panel')).toBeHidden();
  expect((await read(page)).paused).toBe(false);
  expect(watched.errors).toEqual([]); expect(watched.failed).toEqual([]); expect(watched.external).toEqual([]);
});
