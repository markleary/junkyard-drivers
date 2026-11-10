import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { boot, closePanel, drivePath, inspect, loopPath, read, stop, walk } from './helpers';
import { bootTablet, touchInspect, touchWalk } from './touch-helpers';
import { install, newGame, paintCar, purchase, STORAGE_KEY } from '../../src/game/state';
import { MEDAL_TIMES, PROGRESS_KEY, formatLap, medalFor } from '../../src/game/progress';

const output = 'artifacts/overhaul-after/play';

/** A finished Kestrel in the bay, so these checks start at the features under test. */
function builtKestrel() {
  let save = newGame();
  for (const id of ['shell-hachiro', 'part-i4-stock', 'part-street-1', 'part-paint-saffron']) save = purchase(save, id);
  save = install(save, 'car-hachiro', 'instance-part-i4-stock');
  save = install(save, 'car-hachiro', 'instance-part-street-1');
  return paintCar(save, 'car-hachiro', 'paint-saffron');
}

async function start(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(({ key, save }) => localStorage.setItem(key, JSON.stringify(save)), { key: STORAGE_KEY, save: builtKestrel() });
  mkdirSync(output, { recursive: true });
  await boot(page);
  return errors;
}

const walkAll = async (page: Page, points: [number, number][]) => { for (const [x, z] of points) await walk(page, x, z); };

test('finds are collected on foot, logged, unlock a finish, and survive a reload', async ({ page }) => {
  const errors = await start(page);
  expect((await read(page)).progress.finds).toEqual([]);
  expect((await read(page)).finds).toHaveLength(12);

  // Round the side of the yard office.
  await walkAll(page, [[-29, 20], [-33, 23], [-40.2, 23], [-40.2, 26.8]]);
  await expect.poll(async () => (await read(page)).progress.finds).toEqual(['office']);
  await expect(page.locator('#banner')).toContainText('Kestrel wire wheel cover');
  await expect(page.locator('#banner')).toContainText('01 OF 12');
  await page.screenshot({ path: `${output}/find-banner.png` });

  // Behind the scrap row, by the rare shell.
  await walkAll(page, [[-40.2, 23], [-33, 23], [-33, 2], [-31, -3], [-41.6, -4], [-41.6, -17], [-34.6, -18.2]]);
  await expect.poll(async () => (await read(page)).progress.finds).toEqual(['office', 'pocket']);

  // In the shadow of the gantry crane. The third find unlocks the metallic finish.
  await walkAll(page, [[-41.6, -17], [-41.6, -4], [-57.6, -2], [-57.6, 8.8]]);
  await expect.poll(async () => (await read(page)).progress.finds).toEqual(['office', 'pocket', 'crane']);
  await expect(page.locator('#banner')).toContainText('Metallic finish unlocked', { timeout: 9000 });

  // The logbook lists what has been found and what it earned.
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-action="logbook"]')).toContainText('03 / 12');
  await page.locator('[data-action="logbook"]').click();
  await expect(page.locator('.logbook-card')).toContainText('3 OF 12');
  await expect(page.locator('.logbook-card')).toContainText('Holloway oil can');
  await expect(page.locator('.find-list li.found')).toHaveCount(3);
  await expect(page.locator('.unlock-list li.found')).toHaveCount(1);
  await expect(page.locator('[data-action="back-to-pause"]')).toBeFocused();
  await page.screenshot({ path: `${output}/logbook.png` });
  await page.locator('[data-action="back-to-pause"]').click();
  await page.locator('[data-action="resume"]').click();
  await expect.poll(async () => (await read(page)).paused).toBe(false);

  // Earned finishes are applied at the workbench; the rest stay locked.
  await walkAll(page, [[-57.6, -2], [-41.6, -4], [-31, -3], [-24, -3], [-24, -13.5]]);
  await inspect(page, -26.4, -15, 'workbench');
  await expect(page.locator('[data-finish="matte"]')).toBeDisabled();
  await expect(page.locator('[data-stripe="ivory"]')).toBeDisabled();
  await page.locator('[data-finish="metallic"]').click();
  await expect(page.locator('[data-finish="metallic"]')).toHaveAttribute('aria-pressed', 'true');
  expect((await read(page)).progress.styles['car-hachiro']).toEqual({ finish: 'metallic', stripe: 'none' });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${output}/metallic-finish.png` });
  await closePanel(page);

  const before = await read(page);
  await page.reload();
  await expect(page.locator('#begin')).toBeEnabled();
  const after = await read(page);
  expect(after.progress.finds).toEqual(['office', 'pocket', 'crane']);
  expect(after.progress.styles).toEqual(before.progress.styles);
  expect(after.state).toEqual(before.state);
  expect(JSON.parse(await page.evaluate(key => localStorage.getItem(key)!, PROGRESS_KEY)).finds).toEqual(['office', 'pocket', 'crane']);
  expect(errors).toEqual([]);
});

test('driving adds gears, cameras, lamps, photo mode, a timed lap with a medal, and stripes', async ({ page }) => {
  const errors = await start(page);
  // Getting in while standing in front of the bonnet must not leave the walker in the car's way.
  await walk(page, -20, 17);
  await walk(page, -20, -9.5);
  await inspect(page, -20, -13, 'garage-car');
  expect((await read(page)).mode).toBe('drive');
  await expect(page.locator('#speed')).toBeVisible();
  await expect(page.locator('#gear')).toBeVisible();

  // Camera and lamp switches cycle and are remembered.
  for (const camera of ['far', 'bonnet', 'chase']) {
    await page.keyboard.press('KeyC');
    await expect.poll(async () => (await read(page)).camera).toBe(camera);
  }
  await page.keyboard.press('KeyL');
  await expect.poll(async () => (await read(page)).lamps).toBe(true);
  await expect(page.locator('#lamp-state')).toBeVisible();
  await page.keyboard.press('KeyL');
  await expect.poll(async () => (await read(page)).lamps).toBe(false);
  await page.keyboard.press('KeyL');
  expect((await read(page)).progress.settings.lights).toBe('auto');

  // Photo mode freezes play, hides the instruments, and hands the hour back when it closes.
  const hourBefore = (await read(page)).hour;
  await page.keyboard.press('KeyP');
  await expect.poll(async () => (await read(page)).photo).toBe(true);
  expect((await read(page)).paused).toBe(true);
  await expect(page.locator('#photo-bar')).toBeVisible();
  await expect(page.locator('#speed')).toBeHidden();
  await expect(page.locator('#hud')).toBeHidden();
  await page.locator('[data-photo="filter"]').click();
  await expect(page.locator('#photo-filter')).toHaveText('Postcard');
  await page.locator('[data-photo="later"]').click();
  await page.locator('[data-photo="later"]').click();
  await expect.poll(async () => (await read(page)).hour).toBeCloseTo(hourBefore + 1, 1);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${output}/photo-mode.png` });
  await page.locator('[data-photo="done"]').click();
  await expect.poll(async () => (await read(page)).photo).toBe(false);
  expect((await read(page)).paused).toBe(false);
  await expect(page.locator('#photo-bar')).toBeHidden();
  await expect.poll(async () => Math.abs((await read(page)).hour - hourBefore)).toBeLessThan(.05);

  // The gearbox follows road speed.
  // Mouse capture settling clears held keys, so the accelerator is pressed the way a held key repeats.
  await expect.poll(async () => { await page.keyboard.down('KeyW'); return (await read(page)).gear; }, { timeout: 8000 }).toBe(2);
  expect((await read(page)).rpm).toBeGreaterThan(.1);
  expect((await read(page)).position.z).toBeGreaterThan(-9);
  await page.keyboard.up('KeyW');

  // A full lap on the ordinary controls is timed and banked.
  const loop = (await read(page)).loop;
  await drivePath(page, loopPath(loop[2].x, loop[3].z));
  const lap = await read(page);
  expect(lap.lapComplete).toBe(true);
  expect(lap.progress.laps).toBe(1);
  expect(lap.progress.bestLap.hachiro).toBeCloseTo(lap.lapElapsed, 1);
  expect(lap.progress.odometer.hachiro).toBeGreaterThan(400);
  expect(lap.progress.topSpeed.hachiro).toBeGreaterThan(8);
  const medal = medalFor('hachiro', lap.lapElapsed);
  console.log('lap', lap.lapElapsed.toFixed(2), 'medal', medal, 'bronze at', MEDAL_TIMES.hachiro.bronze);
  await expect(page.locator('#banner')).toContainText(formatLap(lap.lapElapsed));
  await page.screenshot({ path: `${output}/lap-banner.png` });
  await stop(page);
  await page.keyboard.press('KeyE');
  expect((await read(page)).mode).toBe('foot');
  // The paced driver in this check finishes inside the bronze time, which earns the first stripes.
  expect(medal).not.toBeNull();
  await walk(page, -24, -13.5);
  await inspect(page, -26.4, -15, 'workbench');
  await expect(page.locator('[data-stripe="ivory"]')).toBeEnabled();
  await page.locator('[data-stripe="ivory"]').click();
  expect((await read(page)).progress.styles['car-hachiro'].stripe).toBe('ivory');
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${output}/stripes.png` });
  await closePanel(page);

  // Time of day and graphics quality are player settings.
  await page.keyboard.press('Escape');
  const time = page.locator('[data-action="time"]');
  for (let i = 0; i < 6 && !(await time.textContent())!.includes('Night'); i++) await time.click();
  await expect(time).toContainText('Night');
  const graphics = page.locator('[data-action="graphics"]');
  for (let i = 0; i < 4 && !(await graphics.textContent())!.includes('Medium'); i++) await graphics.click();
  await expect(graphics).toHaveText('Graphics: Medium');
  await page.locator('[data-action="resume"]').click();
  await expect.poll(async () => (await read(page)).hour).toBeCloseTo(23, 1);
  expect((await read(page)).graphicsQuality).toBe('medium');
  // After dark the lamps come on by themselves.
  await walk(page, -22.6, -13);
  await inspect(page, -20, -13, 'garage-car');
  expect((await read(page)).mode).toBe('drive');
  await expect.poll(async () => (await read(page)).lamps).toBe(true);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(2600);
  await page.keyboard.up('KeyW');
  await page.screenshot({ path: `${output}/night-drive.png` });
  expect((await read(page)).drawCalls).toBeGreaterThan(50);
  expect(errors).toEqual([]);
});

test.describe('tablet', () => {
  test.use({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });

  test('tablet switches act once per tap, and the map, instruments and photo bar keep clear of the thumbs', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.addInitScript(({ key, save }) => localStorage.setItem(key, JSON.stringify(save)), { key: STORAGE_KEY, save: builtKestrel() });
    mkdirSync(output, { recursive: true });
    const touch = await bootTablet(page);
    await touchWalk(touch, -20, 17);
    await touchWalk(touch, -20, -9.5);
    await touchInspect(touch, -20, -13, 'garage-car');
    expect((await read(page)).mode).toBe('drive');

    // One tap, one step: the native touch and its compatibility click must not both count.
    for (const camera of ['far', 'bonnet', 'chase']) {
      await touch.tap('#touch-camera');
      await expect.poll(async () => (await read(page)).camera).toBe(camera);
    }
    await touch.tap('#touch-lights');
    await expect.poll(async () => (await read(page)).lamps).toBe(true);
    expect((await read(page)).progress.settings.lights).toBe('on');
    await touch.tap('#touch-horn');

    // Pull out of the bay so the lap card is showing, then check nothing on the glass overlaps.
    await touch.hold('#touch-throttle', 3, true);
    await expect.poll(async () => (await read(page)).position.z, { timeout: 12000 }).toBeGreaterThan(8);
    await touch.up(3);
    await expect(page.locator('#route')).toBeVisible();
    const pieces = ['#minimap', '#speed', '#recover', '#pause-button', '.yard-mark', '#touch-stick', '.touch-switches', '.touch-pedals', '#touch-handbrake', '#touch-interact', '#route'];
    const boxes = await page.evaluate(selectors => selectors.map(selector => {
      const element = document.querySelector<HTMLElement>(selector)!, box = element.getBoundingClientRect();
      return { selector, left: box.left, top: box.top, right: box.right, bottom: box.bottom, shown: box.width > 0 && box.height > 0 };
    }), pieces);
    const viewport = page.viewportSize()!;
    for (const box of boxes) {
      expect(box.shown, `${box.selector} is shown`).toBe(true);
      expect(box.left >= 0 && box.top >= 0 && box.right <= viewport.width + 1 && box.bottom <= viewport.height + 1, `${box.selector} is inside the screen`).toBe(true);
    }
    for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
      const overlap = boxes[a].left < boxes[b].right - 1 && boxes[a].right > boxes[b].left + 1 && boxes[a].top < boxes[b].bottom - 1 && boxes[a].bottom > boxes[b].top + 1;
      expect(overlap, `${boxes[a].selector} overlaps ${boxes[b].selector}`).toBe(false);
    }
    const switches = await page.locator('.touch-switches button').evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect()).map(box => Math.min(box.width, box.height)));
    expect(switches.every(size => size >= 44)).toBe(true);
    await page.screenshot({ path: `${output}/tablet-driving.png` });

    // Photo mode from the pause sheet, with touch-sized buttons.
    await touch.tap('#pause-button');
    await touch.tap('[data-action="photo"]');
    await expect.poll(async () => (await read(page)).photo).toBe(true);
    await expect(page.locator('#touch-controls')).toBeHidden();
    const photoButtons = await page.locator('#photo-bar button').evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().height));
    expect(photoButtons.every(height => height >= 44)).toBe(true);
    await touch.tap('[data-photo="filter"]');
    await expect(page.locator('#photo-filter')).toHaveText('Postcard');
    await page.screenshot({ path: `${output}/tablet-photo.png` });
    await touch.tap('[data-photo="done"]');
    await expect.poll(async () => (await read(page)).photo).toBe(false);
    expect((await read(page)).paused).toBe(false);
    expect(errors).toEqual([]);
  });
});
