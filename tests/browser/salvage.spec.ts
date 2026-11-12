import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { boot, closePanel, drivePath, inspect, read, stop, walk } from './helpers';
import { bootTablet, stopTablet, touchDrivePath, touchInspect, touchWalk } from './touch-helpers';
import { LISTINGS, PARTS, SHELLS } from '../../src/game/catalog';
import { PROGRESS_KEY, newProgress, recordLap, type Progress } from '../../src/game/progress';
import { seedPlacing, stashLayout } from '../../src/game/stash';
import { install, newGame, paintCar, purchase, STORAGE_KEY, type GameState } from '../../src/game/state';
import { fitUpgrade } from '../../src/game/upgrades';
import { PART_SPOTS, SHELL_SPOTS } from '../../src/world/yard';

const output = 'artifacts/salvage';
// Two hiding places with a known way in: behind the wheel rack, and against the south fence behind the big heap.
const WHEELS_PLACE = 5, WREN_PLACE = 2;

/** A game that hides the racing wheels behind the wheel rack and the Wren behind the heap. */
function stashSeed() {
  let seed = seedPlacing('part-rare-wheels', WHEELS_PLACE);
  while (stashLayout(seed).find(item => item.listingId === 'shell-wren')!.spot !== WREN_PLACE) seed = seedPlacing('part-rare-wheels', WHEELS_PLACE, seed + 1);
  return seed;
}

/** A finished Wren with straight-through pipes and nitrous fitted, a turbocharger still in its box, and a lap on record. */
function tunedWren(turboFitted = false): { save: GameState; progress: Progress } {
  let save = newGame();
  for (const id of ['shell-wren', 'part-crate-i4-performance', 'part-new-sport-1', 'part-paint-saffron', 'part-turbo-race', 'part-exhaust-race', 'part-nitro-150']) save = purchase(save, id);
  save = install(save, 'car-wren', 'instance-part-crate-i4-performance');
  save = install(save, 'car-wren', 'instance-part-new-sport-1');
  save = paintCar(save, 'car-wren', 'paint-saffron');
  let progress: Progress = { ...newProgress(), stash: stashSeed() };
  for (const part of ['exhaust-race', 'nitro-150', ...(turboFitted ? ['turbo-race'] : [])]) progress = fitUpgrade(save, progress, 'car-wren', `instance-part-${part}`);
  return { save, progress: recordLap(progress, 'wren', 57.3).progress };
}

function watch(page: Page, baseURL: string) {
  const errors: string[] = [], failed: string[] = [], external: string[] = [], origin = new URL(baseURL).origin;
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => failed.push(request.url()));
  page.on('request', request => { if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== origin) external.push(request.url()); });
  return { errors, failed, external };
}

/** Put a prepared game in storage before the first load only: after that the game's own writes stand, as they must across a reload. */
async function prepare(page: Page, records: { save?: GameState; progress: Progress }) {
  await page.addInitScript(({ keys, records }) => {
    if (sessionStorage.getItem('prepared')) return;
    sessionStorage.setItem('prepared', '1');
    if (records.save) localStorage.setItem(keys.save, JSON.stringify(records.save));
    localStorage.setItem(keys.progress, JSON.stringify(records.progress));
  }, { keys: { save: STORAGE_KEY, progress: PROGRESS_KEY }, records });
  mkdirSync(output, { recursive: true });
}

/** Evidence captures are kept in the repository, so they are JPEGs rather than full-size PNGs. */
const capture = (page: Page, name: string) => page.screenshot({ path: `${output}/${name}.jpg`, type: 'jpeg', quality: 82 });
const dollars = async (page: Page, selector: string) => Number((await page.locator(selector).innerText()).replace(/[^0-9]/g, ''));
const price = (listingId: string) => {
  const listing = LISTINGS.find(item => item.id === listingId)!;
  return (listing.kind === 'shell' ? SHELLS : PARTS).find(item => item.id === listing.itemId)!.price;
};
const walkAll = async (page: Page, points: [number, number][], tolerance = .8, sprint = true) => { for (const [x, z] of points) await walk(page, x, z, tolerance, sprint); };

test('rare salvage is off the racks, hidden in the yard, and builds into a car that survives a reload', async ({ page, baseURL }) => {
  const { errors, failed, external } = watch(page, baseURL!);
  const seed = stashSeed(), wheels = PART_SPOTS[WHEELS_PLACE], wren = SHELL_SPOTS[WREN_PLACE];
  await prepare(page, { progress: { ...newProgress(), stash: seed } });
  await boot(page);

  // Eight pieces lie about the yard, none of them held, each in its own place.
  const hidden = (await read(page)).stash;
  expect(hidden).toHaveLength(8);
  expect(hidden.every((item: { held: boolean }) => !item.held)).toBe(true);
  expect(new Set(hidden.map((item: { x: number; z: number }) => `${item.x},${item.z}`)).size).toBe(8);
  expect(hidden.find((item: { listingId: string }) => item.listingId === 'part-rare-wheels')).toMatchObject({ x: wheels.x, z: wheels.z });
  expect(hidden.find((item: { listingId: string }) => item.listingId === 'shell-wren')).toMatchObject({ x: wren.x, z: wren.z });

  // A rare tire is not on the tire rack, nor a rare engine on the engine rack.
  await walkAll(page, [[-20, 17], [-31, 16], [-33, 8]]);
  await inspect(page, -36, 8, 'rack-wheels');
  await expect(page.locator('[data-buy="part-street-1"]')).toBeVisible();
  await expect(page.locator('[data-buy^="part-rare-"]')).toHaveCount(0);
  await expect(page.locator('#panel')).not.toContainText('Comet');
  await closePanel(page);
  await walk(page, -33, 2);
  await inspect(page, -36, 2, 'rack-engines');
  await expect(page.locator('[data-buy="part-i4-stock"]')).toBeVisible();
  await expect(page.locator('[data-buy^="part-rare-"]')).toHaveCount(0);
  await closePanel(page);

  // It is behind the rack, through the gap in the shelving.
  await walkAll(page, [[-33.4, 11.1], [-36.1, 11.1], [-37.9, 11.1]], .4, false);
  await inspect(page, wheels.x, wheels.z, 'part-rare-wheels');
  await expect(page.locator('#panel')).toContainText('RARE SALVAGE');
  await expect(page.locator('#panel')).toContainText('not on any rack');
  await capture(page, 'rare-wheels-tag');
  await page.locator('[data-buy="part-rare-wheels"]').click();
  await expect(page.locator('[data-buy="part-rare-wheels"]')).toBeDisabled();
  await expect(page.locator('#banner')).toContainText('Comet magnesium racing set');
  await closePanel(page);
  expect((await read(page)).state.inventory.map((item: { partId: string }) => item.partId)).toEqual(['rare-wheels']);
  // Bought, it is no longer lying there to be bought again.
  expect((await read(page)).stash.find((item: { listingId: string }) => item.listingId === 'part-rare-wheels').held).toBe(true);

  // The Wren is a salvageable car that is not standing with the others: round the yard office and behind the heap.
  await walkAll(page, [[-36.1, 11.1], [-33.4, 11.1]], .4, false);
  await walkAll(page, [[-32.1, 24.4], [-41.1, 24.4], [-41.6, 24.9], [-45.9, 24.6], [-46.1, 23.6], [-50.9, 23.4], [-54.6, 24.4]], .4);
  await inspect(page, wren.x, wren.z, 'shell-wren');
  await expect(page.locator('#panel')).toContainText('Hachiro Wren R');
  await capture(page, 'rare-shell-tag');
  await page.locator('[data-buy="shell-wren"]').click();
  await closePanel(page);
  expect((await read(page)).state.cars.map((car: { id: string }) => car.id)).toEqual(['car-wren']);

  // An ordinary engine off the rack, the rare wheels, and it is a car.
  await walkAll(page, [[-50.9, 23.4], [-46.1, 23.6], [-45.9, 24.6], [-41.6, 24.9], [-41.1, 24.4], [-32.1, 24.4]], .4);
  await walkAll(page, [[-33, 2]]);
  await inspect(page, -36, 2, 'rack-engines');
  await page.locator('[data-buy="part-i4-stock"]').click();
  await closePanel(page);
  await walkAll(page, [[-31, -3], [-24, -3], [-24, -13.5]]);
  await inspect(page, -26.4, -15, 'workbench');
  await page.locator('[data-install="instance-part-i4-stock"]').click();
  await page.locator('[data-install="instance-part-rare-wheels"]').click();
  await expect(page.locator('.build-status')).toContainText('READY FOR THE ROAD');
  await page.waitForTimeout(900);
  await capture(page, 'wren-built');
  await closePanel(page);

  // The logbook keeps count and tells where the rest are said to be.
  await page.keyboard.press('Escape');
  await page.locator('[data-action="logbook"]').click();
  await expect(page.locator('.logbook-card')).toContainText('2 OF 8 HELD');
  await expect(page.locator('.rare-list li')).toHaveCount(8);
  await expect(page.locator('.rare-list li.held')).toHaveCount(2);
  await capture(page, 'logbook-rare');
  await page.locator('[data-action="back-to-pause"]').click();
  await page.keyboard.press('Escape');

  const before = await read(page);
  await page.reload();
  await expect(page.locator('#begin')).toBeEnabled();
  const after = await read(page);
  expect(after.state).toEqual(before.state);
  expect(after.progress.stash).toBe(seed);
  expect(after.stash).toEqual(before.stash);
  expect(errors).toEqual([]); expect(failed).toEqual([]); expect(external).toEqual([]);
});

test('tuning parts change the drive and its sound, and the dealer buys the car for one fixed offer', async ({ page, baseURL }) => {
  const { errors, failed, external } = watch(page, baseURL!);
  const { save, progress } = tunedWren();
  await prepare(page, { save, progress });
  await boot(page);

  // The workbench: pipes and nitrous are on the car, the turbocharger is on the shelf.
  await walkAll(page, [[-24, -3], [-24, -13.5]]);
  await inspect(page, -26.4, -15, 'workbench');
  const slot = page.locator('[data-slot="tuning"]');
  await slot.scrollIntoViewIfNeeded();
  await expect(slot.locator('[data-tuning="exhaust"]')).toContainText('FITTED');
  await expect(slot.locator('[data-tuning="turbo"]')).toContainText('None fitted');
  await page.locator('[data-fit="instance-part-turbo-race"]').click();
  await expect.poll(async () => (await read(page)).progress.fitted['car-wren']).toEqual({ turbo: 'instance-part-turbo-race', exhaust: 'instance-part-exhaust-race', nitro: 'instance-part-nitro-150' });
  // It lifts off again and goes back on: a fitting, not a one-way purchase. Nothing is bought or lost either way.
  await page.locator('[data-unfit="turbo"]').click();
  await expect.poll(async () => (await read(page)).progress.fitted['car-wren'].turbo).toBeUndefined();
  await page.locator('[data-fit="instance-part-turbo-race"]').click();
  await expect(slot.locator('[data-tuning="turbo"]')).toContainText('FITTED');
  expect((await read(page)).state).toEqual(save);
  await slot.scrollIntoViewIfNeeded();
  await capture(page, 'tuning-slot');
  await closePanel(page);

  // On the road: boost builds on the throttle and the gauges for both parts are on the dash.
  await walk(page, -22.6, -13);
  await inspect(page, -20, -13, 'garage-car');
  expect((await read(page)).mode).toBe('drive');
  expect((await read(page)).tuning).toMatchObject({ exhaust: 'race' });
  await expect(page.locator('#boost-gauge')).toBeVisible();
  await expect(page.locator('#nitro-gauge')).toBeVisible();
  expect((await read(page)).nitro).toEqual({ charge: 1, active: false });
  await page.keyboard.down('KeyW');
  await expect.poll(async () => (await read(page)).boost, { timeout: 8000 }).toBeGreaterThan(.6);
  // The N key opens the nitrous: the bottle empties while it is held and the valve shuts when it is let go.
  await page.keyboard.down('KeyN');
  await expect.poll(async () => (await read(page)).nitro.active).toBe(true);
  await expect.poll(async () => (await read(page)).nitro.charge).toBeLessThan(.9);
  await capture(page, 'nitro');
  await page.keyboard.up('KeyN');
  await expect.poll(async () => (await read(page)).nitro.active).toBe(false);
  // The changed exhaust is a different recording of the same engine, with the turbine over it.
  await expect.poll(async () => (await read(page)).audio.engine, { timeout: 20000 }).toBe('engine-i4-sport');
  expect((await read(page)).audio.recorded).toEqual(expect.arrayContaining(['engine', 'boost']));
  await page.keyboard.up('KeyW');

  // Out of the gate and up the avenue to Second Chance Motors.
  const site = (await read(page)).dealer;
  await drivePath(page, [{ x: -20, z: 30 }, { x: -20, z: 60 }, { x: -19.5, z: site.bay.z - 12 }, { x: -15, z: site.bay.z - 3 }, { x: site.bay.x - 6, z: site.bay.z }, { x: site.bay.x - .5, z: site.bay.z }]);
  await stop(page);
  expect((await read(page)).dealer.near).toBe(true);
  await expect(page.locator('#hint')).toContainText('Second Chance Motors');
  // A driver still holding the handbrake when the sheet opens must not sell the car by letting go of the key:
  // the sheet opens with nothing armed, and Sell takes a deliberate press.
  await page.keyboard.down('Space');
  await page.keyboard.press('KeyE');
  await expect(page.locator('#panel')).toContainText('Trade-in offer');
  await page.keyboard.down('Space');
  await page.keyboard.up('Space');
  await page.waitForTimeout(250);
  expect((await read(page)).state.cars).toHaveLength(1);
  await expect(page.locator('#panel')).toContainText('Trade-in offer');
  await expect(page.locator('#panel-title')).toBeFocused();

  // What went into the car, and one figure for it: above the outlay, at most double, and no range to haggle over.
  const outlay = ['shell-wren', 'part-crate-i4-performance', 'part-new-sport-1', 'part-turbo-race', 'part-exhaust-race', 'part-nitro-150', 'part-paint-saffron'].reduce((sum, id) => sum + price(id), 0);
  expect(await dollars(page, '#dealer-invested')).toBe(outlay);
  const offer = await dollars(page, '#dealer-offer'), quote = (await read(page)).dealer;
  expect(quote).toMatchObject({ invested: outlay, offer });
  expect(quote.range.low).toBeGreaterThan(outlay);
  expect(quote.range.high).toBeLessThanOrEqual(outlay * 2);
  expect(offer).toBeGreaterThanOrEqual(quote.range.low);
  expect(offer).toBeLessThanOrEqual(quote.range.high);
  await expect(page.locator('.offer-table tbody tr')).toHaveCount(7);
  await expect(page.locator('.lap-proof')).toContainText('0:57.3');
  await expect(page.locator('#dealer-low, #dealer-high, .offer-range')).toHaveCount(0);
  await expect(page.locator('#panel')).not.toContainText(/between/i);
  // The offer and both answers are on the sheet without scrolling for them.
  for (const selector of ['#dealer-offer', '[data-action="sell"]', '.dealer-panel .secondary']) await expect(page.locator(selector)).toBeInViewport({ ratio: 1 });
  await capture(page, 'trade-in-offer');

  // Walking away and asking again gets the same figure: it stands for the session.
  await page.locator('.dealer-panel .secondary').click();
  await expect.poll(async () => (await read(page)).paused).toBe(false);
  expect((await read(page)).mode).toBe('drive');
  await page.keyboard.press('KeyE');
  expect(await dollars(page, '#dealer-offer')).toBe(offer);

  await page.locator('[data-action="sell"]').click();
  await expect(page.locator('#banner')).toContainText('SOLD');
  await capture(page, 'sold');
  const sold = await read(page);
  // The car and everything bolted to it have gone; the takings are in the book; the player is back at the yard gate on foot.
  expect(sold.state.cars).toEqual([]);
  expect(sold.state.inventory).toEqual([]);
  expect(sold.state.purchasedListings).toEqual(['part-paint-saffron']);
  expect(sold.state.paints).toEqual(save.paints);
  expect(sold.progress.sales).toEqual({ count: 1, takings: offer, profit: offer - outlay, best: offer });
  expect(sold.progress.fitted).toEqual({});
  expect(sold.progress.proof).toEqual({});
  expect(sold.progress.bestLap).toEqual({ wren: 57.3 });
  expect(sold.mode).toBe('foot');
  expect(Math.hypot(sold.position.x + 20, sold.position.z - 26)).toBeLessThan(1.5);
  await expect(page.locator('#boost-gauge')).toBeHidden();
  // A rare shell that has been sold on turns up in the yard again, somewhere else.
  expect(sold.progress.restock).toEqual({ 'shell-wren': 1 });
  const back = sold.stash.find((item: { listingId: string }) => item.listingId === 'shell-wren');
  expect(back.held).toBe(false);
  expect(back.spot).not.toBe(WREN_PLACE);

  await page.keyboard.press('Escape');
  await page.locator('[data-action="logbook"]').click();
  await expect(page.locator('.sales-ledger')).toContainText(offer.toLocaleString('en-US'));
  // The lap it set is the driver's record and stays in the book under the car's name.
  await expect(page.locator('.lap-table tr.sold')).toHaveCount(1);
  await expect(page.locator('.lap-table tr.sold')).toContainText('Hachiro Wren R');
  await expect(page.locator('.lap-table tr.sold')).toContainText('0:57.3');
  await page.locator('.sales-ledger').scrollIntoViewIfNeeded();
  await capture(page, 'logbook-sales');
  await page.locator('[data-action="back-to-pause"]').click();
  await page.keyboard.press('Escape');

  await page.reload();
  await expect(page.locator('#begin')).toBeEnabled();
  const after = await read(page);
  expect(after.state).toEqual(sold.state);
  expect(after.progress.sales).toEqual(sold.progress.sales);
  expect(after.progress.restock).toEqual(sold.progress.restock);
  expect(after.stash).toEqual(sold.stash);
  expect(errors).toEqual([]); expect(failed).toEqual([]); expect(external).toEqual([]);
});

test.describe('tablet', () => {
  test.use({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });

  test('tablet nitrous is its own held button, clear of the pedals, and the car sells by touch', async ({ page, baseURL }) => {
    const { errors, failed, external } = watch(page, baseURL!);
    await page.addInitScript(() => {
      (window as any).__touchKeyboardEvents = 0;
      window.addEventListener('keydown', () => { (window as any).__touchKeyboardEvents++; });
    });
    const { save, progress } = tunedWren(true);
    await prepare(page, { save, progress });
    const touch = await bootTablet(page);
    // On foot there is nothing to fire.
    await expect(page.locator('#touch-nitro')).toBeHidden();
    await touchWalk(touch, -20, 17);
    await touchWalk(touch, -20, -9.5);
    await touchInspect(touch, -20, -13, 'garage-car');
    expect((await read(page)).mode).toBe('drive');

    // The button is there for a car that carries a kit: thumb-sized, on the screen, and not under anything else.
    await expect(page.locator('#touch-nitro')).toBeVisible();
    const pieces = ['#touch-nitro', '#touch-throttle', '#touch-brake', '#touch-handbrake', '#touch-stick', '.touch-switches', '#touch-interact', '#speed', '#minimap', '#recover', '#pause-button'];
    const boxes = await page.evaluate(selectors => selectors.map(selector => {
      const box = document.querySelector<HTMLElement>(selector)!.getBoundingClientRect();
      return { selector, left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
    }), pieces);
    const viewport = page.viewportSize()!;
    for (const box of boxes) {
      expect(box.width > 0 && box.height > 0, `${box.selector} is shown`).toBe(true);
      expect(box.left >= 0 && box.top >= 0 && box.right <= viewport.width + 1 && box.bottom <= viewport.height + 1, `${box.selector} is inside the screen`).toBe(true);
    }
    for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
      const overlap = boxes[a].left < boxes[b].right - 1 && boxes[a].right > boxes[b].left + 1 && boxes[a].top < boxes[b].bottom - 1 && boxes[a].bottom > boxes[b].top + 1;
      expect(overlap, `${boxes[a].selector} overlaps ${boxes[b].selector}`).toBe(false);
    }
    expect(Math.min(boxes[0].width, boxes[0].height)).toBeGreaterThanOrEqual(44);
    await expect(page.locator('#boost-gauge')).toBeVisible();
    await expect(page.locator('#nitro-gauge')).toBeVisible();

    // Held on its own it is throttle and nitrous together; let go, the valve shuts.
    await touch.hold('#touch-nitro', 6, true);
    await expect.poll(async () => (await read(page)).nitro.active).toBe(true);
    expect((await read(page)).touchInput).toMatchObject({ nitro: true, throttle: 0 });
    await expect(page.locator('#touch-nitro')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => (await read(page)).speed, { timeout: 8000 }).toBeGreaterThan(5);
    await capture(page, 'tablet-nitro');
    await touch.up(6);
    await expect.poll(async () => (await read(page)).nitro.active).toBe(false);
    expect((await read(page)).touchInput.nitro).toBe(false);
    expect((await read(page)).nitro.charge).toBeLessThan(1);

    // To the dealer on the pedals, and the sale with a thumb.
    const site = (await read(page)).dealer;
    await touchDrivePath(touch, [{ x: -20, z: 30 }, { x: -20, z: 60 }, { x: -19.5, z: site.bay.z - 12 }, { x: -15, z: site.bay.z - 3 }, { x: site.bay.x - 6, z: site.bay.z }, { x: site.bay.x - .5, z: site.bay.z }]);
    await stopTablet(touch);
    await expect(page.locator('#touch-action-label')).toHaveText('Sell car');
    await expect(page.locator('#touch-interact')).toBeEnabled();
    await touch.tap('#touch-interact', 9, false);
    await expect(page.locator('#panel')).toContainText('Trade-in offer');
    await expect(page.locator('#touch-controls')).toBeHidden();
    const offer = await dollars(page, '#dealer-offer');
    expect(offer).toBeGreaterThan((await read(page)).dealer.invested);
    await expect(page.locator('#dealer-low, #dealer-high, .offer-range')).toHaveCount(0);
    for (const selector of ['#dealer-offer', '[data-action="sell"]', '.dealer-panel .secondary', '#panel .close']) await expect(page.locator(selector)).toBeInViewport({ ratio: 1 });
    // All seven lines of the costing fit on a tablet in landscape without scrolling the list.
    expect(await page.locator('.dealer-scroll').evaluate(list => list.scrollHeight - list.clientHeight)).toBeLessThanOrEqual(1);
    const targets = await page.locator('#panel button').evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().height));
    expect(targets.every(height => height >= 44)).toBe(true);
    await capture(page, 'tablet-trade-in');
    await touch.tap('[data-action="sell"]');
    await expect(page.locator('#banner')).toContainText('SOLD');
    const sold = await read(page);
    expect(sold.state.cars).toEqual([]);
    expect(sold.progress.sales).toMatchObject({ count: 1, takings: offer });
    expect(sold.mode).toBe('foot');
    await expect(page.locator('#touch-nitro')).toBeHidden();
    expect(await page.evaluate(() => (window as any).__touchKeyboardEvents)).toBe(0);
    expect(errors).toEqual([]); expect(failed).toEqual([]); expect(external).toEqual([]);
  });
});
