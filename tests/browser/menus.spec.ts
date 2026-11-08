import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { boot, closePanel, inspect, read, walk } from './helpers';
import { install, newGame, paintCar, purchase, STORAGE_KEY } from '../../src/game/state';
import { LISTINGS } from '../../src/game/catalog';

async function expectNoWalking(page: Page, milliseconds = 400) {
  const before = (await read(page)).position;
  await page.waitForTimeout(milliseconds);
  const after = (await read(page)).position;
  expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThan(.025);
}

test('production startup has no errors, Escape exposes Resume, and pause clears held movement', async ({ page }) => {
  const errors: string[] = [];
  const failures: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', (request) => failures.push(request.url()));
  await boot(page);
  expect(page.url()).toContain('/junkyard-drivers/');
  expect((await read(page)).mode).toBe('foot');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(300);
  expect((await read(page)).position.z).toBeLessThan(25.5);
  // Leave W held across pause/resume: the application must clear its input set.
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-action="resume"]')).toBeVisible();
  expect((await read(page)).paused).toBe(true);
  await expectNoWalking(page);
  await page.locator('[data-action="resume"]').click();
  await expect.poll(async () => (await read(page)).paused).toBe(false);
  await expectNoWalking(page);
  await page.keyboard.up('KeyW');
  // Exercise the browser's actual mouse route, independently of the relative
  // MouseEvent adapter used to navigate long acceptance paths.
  await page.mouse.move(650, 440);
  await page.mouse.down();
  const yawBeforeMouseMove = (await read(page)).yaw;
  await page.mouse.move(700, 440, { steps: 3 });
  await page.mouse.up();
  expect(Math.abs((await read(page)).yaw - yawBeforeMouseMove)).toBeGreaterThan(.04);
  expect(errors).toEqual([]);
  expect(failures).toEqual([]);
});

test('inspection pauses movement and focus loss clears held input', async ({ page }) => {
  await boot(page);
  await walk(page, -20, 17);
  await walk(page, -18.2, 14.1);
  await inspect(page, -15, 12, 'shell-hachiro');
  expect((await read(page)).paused).toBe(true);
  await expect(page.locator('#panel')).toContainText('Hachiro Kestrel');
  // Key input arriving while a DOM panel is open must never leak into play.
  await page.keyboard.down('KeyW');
  await expectNoWalking(page);
  await closePanel(page);
  await expectNoWalking(page);
  await page.keyboard.up('KeyW');
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(200);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.locator('[data-action="resume"]')).toBeVisible();
  expect((await read(page)).paused).toBe(true);
  await expectNoWalking(page);
  await page.locator('[data-action="resume"]').click();
  await expect.poll(async () => (await read(page)).paused).toBe(false);
  await expectNoWalking(page);
  await page.keyboard.up('KeyS');
});

test('New Game cancel preserves a saved build and confirmation clears the collection', async ({ page }) => {
  // This fixture isolates the reset/save UI. game.spec.ts proves all purchases
  // and assembly through the normal world interactions from a fresh save.
  let fixture = newGame(913057);
  for (const id of ['shell-hachiro', 'part-i4-stock', 'part-street-1', 'part-paint-saffron']) fixture = purchase(fixture, id);
  fixture = install(fixture, 'car-hachiro', 'instance-part-i4-stock');
  fixture = install(fixture, 'car-hachiro', 'instance-part-street-1');
  fixture = paintCar(fixture, 'car-hachiro', 'paint-saffron');
  await page.addInitScript(({ key, save }) => {
    if (!sessionStorage.getItem('jd-reset-test-seeded')) {
      localStorage.setItem(key, JSON.stringify(save));
      sessionStorage.setItem('jd-reset-test-seeded', '1');
    }
  }, { key: STORAGE_KEY, save: fixture });
  await boot(page);
  expect((await read(page)).state).toEqual(fixture);
  await page.keyboard.press('Escape');
  await page.locator('[data-action="new"]').click();
  await expect(page.locator('#menu')).toContainText('Clear this collection?');
  await page.locator('[data-action="cancel-new"]').click();
  expect((await read(page)).state).toEqual(fixture);
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY)).toEqual(fixture);
  await page.locator('[data-action="new"]').click();
  await page.locator('[data-action="confirm-new"]').click();
  await expect(page.locator('#begin')).toBeEnabled();
  await expect(page.locator('#begin')).toContainText('Enter the yard');
  expect((await read(page)).state).toEqual(newGame());
  expect((await read(page)).mode).toBe('foot');
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY)).toEqual(newGame());
});

test('graphics initialization failure presents a readable retry screen', async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: function (this: HTMLCanvasElement, ...args: unknown[]) {
        if (typeof args[0] === 'string' && args[0].startsWith('webgl')) return null;
        return Reflect.apply(getContext, this, args);
      },
    });
  });
  await page.goto('./?qa=1');
  await expect(page.locator('#menu')).toContainText('The yard couldn’t open.');
  await expect(page.locator('#menu')).toContainText('WebGL 2 and WebAssembly');
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(page.locator('#menu pre')).not.toBeEmpty();
});

test('800 by 600 desktop window keeps pause and reset controls reachable', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await boot(page);
  await page.keyboard.press('Escape');
  const card = page.locator('.pause-card');
  const box = await card.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(600);
  await page.locator('[data-action="resume"]').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-action="resume"]')).toBeInViewport();
  await page.locator('[data-action="new"]').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-action="new"]')).toBeInViewport();
  mkdirSync('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/menu-800x600.png' });
  await page.locator('[data-action="new"]').click();
  await expect(page.locator('[data-action="confirm-new"]')).toBeInViewport();
  await page.locator('[data-action="cancel-new"]').click();
  await page.locator('[data-action="resume"]').click();
  await expect.poll(async () => (await read(page)).paused).toBe(false);
});

test('800 by 600 workshop keeps a full collection usable through engine, wheel and paint changes', async ({ page }) => {
  let fixture = newGame();
  for (const listing of LISTINGS) fixture = purchase(fixture, listing.id);
  fixture = install(fixture, 'car-hachiro', 'instance-part-i4-stock');
  fixture = install(fixture, 'car-hachiro', 'instance-part-street-1');
  await page.addInitScript(({ key, save }) => localStorage.setItem(key, JSON.stringify(save)), { key: STORAGE_KEY, save: fixture });
  await page.setViewportSize({ width: 800, height: 600 });
  await boot(page);
  await walk(page, -24, -3); await walk(page, -24, -13.5);
  await inspect(page, -26.4, -15, 'workbench');
  expect((await read(page)).paused).toBe(true);
  await expect(page.locator('[aria-label="Close panel"]')).toBeInViewport();
  await page.locator('[data-install="instance-part-crate-i4-performance"]').click();
  expect((await read(page)).state.cars[0].engineId).toBe('instance-part-crate-i4-performance');
  await page.locator('[data-install="instance-part-new-sport-3"]').click();
  expect((await read(page)).state.cars[0].wheelsId).toBe('instance-part-new-sport-3');
  await page.locator('[data-paint="paint-forest"]').click();
  expect((await read(page)).state.cars[0].paint).toBe('#285b43');
  await expect(page.locator('.build-status')).toContainText('READY FOR THE ROAD');
  await expect(page.locator('[aria-label="Close panel"]')).toBeInViewport();
  mkdirSync('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/workshop-800x600.png' });
  await page.locator('[data-select="car-veloce"]').click();
  await expect(page.locator('.build-status')).toContainText('BUILD INCOMPLETE');
  await expect(page.locator('[data-install="instance-part-i4-stock"]')).toBeDisabled();
  await closePanel(page);
  expect((await read(page)).paused).toBe(false);
});

test('modal menus support Space activation, preserve focus, and keep keyboard navigation inside the open paper', async ({ page }) => {
  await boot(page);
  await page.keyboard.press('Escape');
  const sound = page.locator('[data-action="sound"]');
  await sound.focus();
  const soundBefore = await sound.getAttribute('aria-pressed');
  await page.keyboard.press('Space');
  await expect(sound).toHaveAttribute('aria-pressed', soundBefore === 'true' ? 'false' : 'true');
  await expect(sound).toBeFocused();
  // Tab wraps at both ends instead of moving onto the hidden world controls.
  await page.locator('[data-action="new"]').focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-action="resume"]')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('[data-action="new"]')).toBeFocused();
  await page.locator('[data-action="resume"]').click();
  await walk(page, -18.2, 14.1);
  await inspect(page, -15, 12, 'shell-hachiro');
  const buy = page.locator('[data-buy="shell-hachiro"]');
  await buy.focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('[aria-label="Close panel"]')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(buy).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-action="resume"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await read(page)).paused).toBe(false);
});
