import { expect, test } from '@playwright/test';
import { newProgress, PROGRESS_KEY } from '../../src/game/progress';
import { install, newGame, purchase, STORAGE_KEY } from '../../src/game/state';
import { boot, drivePath, read, stop } from './helpers';

test('repairs an interrupted unload beside an already-built yard Courier', async ({ page }) => {
  let collection = ['shell-courier', 'part-v8-stock', 'part-street-1'].reduce((s, id) => purchase(s, id), newGame());
  collection = install(install(collection, 'car-courier', 'instance-part-v8-stock'), 'car-courier', 'instance-part-street-1');
  await page.addInitScript(({ collection, saveKey, progressKey, progress }) => {
    if (!sessionStorage.getItem('handoff-fixture')) {
      localStorage.setItem(saveKey, JSON.stringify(collection));
      localStorage.setItem(progressKey, JSON.stringify(progress));
      sessionStorage.setItem('handoff-fixture', '1');
    }
    // Fail exactly the second handoff write. A browser close here leaves the same durable data.
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === progressKey && JSON.parse(value).recovery === 'complete' && !sessionStorage.getItem('interrupted')) {
        write.call(sessionStorage, 'interrupted', '1');
        throw new DOMException('Interrupted handoff', 'QuotaExceededError');
      }
      write.call(this, key, value);
    };
  }, { collection, saveKey: STORAGE_KEY, progressKey: PROGRESS_KEY, progress: { ...newProgress(), recovery: 'loaded' } });

  await boot(page);
  await expect.poll(async () => (await read(page)).activeTarget).toBe('loaner');
  await page.keyboard.press('KeyE');
  await drivePath(page, [
    { x: -49, z: 44 }, { x: -33, z: 44 }, { x: -26, z: 43 }, { x: -22, z: 40 },
    { x: -20, z: 34 }, { x: -20, z: 18 }, { x: -20, z: -1 },
  ]);
  await stop(page);
  expect((await read(page)).rig.action).toBe('Unload the Courier');
  await page.keyboard.press('KeyE');
  await expect(page.locator('#toast')).toContainText('Couldn’t save the handoff');
  const partial = await page.evaluate(([save, progress]) => ({
    receipts: JSON.parse(localStorage.getItem(save)!).purchasedListings,
    stage: JSON.parse(localStorage.getItem(progress)!).recovery,
  }), [STORAGE_KEY, PROGRESS_KEY]);
  expect(partial.receipts).toContain('shell-orchard');
  expect(partial.stage).toBe('loaded');

  await boot(page);
  const repaired = await read(page);
  expect(repaired.state.cars[0]).toEqual(collection.cars[0]);
  expect(repaired.state.cars.map((car: { id: string }) => car.id)).toEqual(['car-courier', 'car-orchard']);
  expect(repaired.progress.recovery).toBe('complete');
  expect(repaired.progress.restorations['car-orchard'].stage).toBe('wash');
  expect(repaired.rig).toBeNull();
});
