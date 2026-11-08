import {test,expect} from '@playwright/test';
import {boot,read,walk,look,inspect,closePanel,drivePath,loopPath,stop} from './helpers';
import {mkdirSync,writeFileSync} from 'node:fs';

test('fresh-save restoration, normal-control town loop, upgrades, rare car and persistence',async({page,baseURL})=>{
  const errors:string[]=[],failed:string[]=[],external:string[]=[];
  const allowedOrigin=new URL(baseURL!).origin;
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('requestfailed',r=>failed.push(r.url()));page.on('request',r=>{if(/^https?:/.test(r.url())&&new URL(r.url()).origin!==allowedOrigin)external.push(r.url());});
  mkdirSync('artifacts',{recursive:true});await boot(page);console.log('booted');
  await walk(page,-20,17);await look(page,-.38,-.04);await page.screenshot({path:'artifacts/scrapyard.png'});
  await walk(page,-18.2,14.1);await inspect(page,-15,12,'shell-hachiro');
  await page.locator('[data-buy="shell-hachiro"]').click();await expect(page.locator('[data-buy="shell-hachiro"]')).toBeDisabled();
  await page.keyboard.press('KeyE');await page.keyboard.press('KeyE');expect((await read(page)).state.cars).toHaveLength(1);await closePanel(page);
  console.log('shell bought');
  // Incomplete build is blocked at the physical bay.
  await walk(page,-20,-9.5);await inspect(page,-20,-13,'garage-car');expect((await read(page)).mode).toBe('foot');await expect(page.locator('#toast')).toContainText('Not drivable');
  console.log('incomplete blocked');
  // All purchases happen at the physical stock racks.
  await walk(page,-31,-3);await walk(page,-33,2);await inspect(page,-36,2,'rack-engines');
  for(const id of ['i4-stock','i4-performance','v8-stock','v12-stock'])await page.locator(`[data-buy="part-${id}"]`).click();
  await expect(page.locator('[data-buy="part-i4-stock"]')).toBeDisabled();expect((await read(page)).state.inventory).toHaveLength(4);await closePanel(page);
  await walk(page,-33,8);await inspect(page,-36,8,'rack-wheels');for(const id of ['street-1','sport-1','street-2'])await page.locator(`[data-buy="part-${id}"]`).click();await closePanel(page);
  await walk(page,-33,14);await inspect(page,-36,14,'rack-paint');await page.locator('[data-buy="part-paint-saffron"]').click();await closePanel(page);
  console.log('parts bought');await walk(page,-31,-3);await walk(page,-24,-3);await walk(page,-24,-13.5);await inspect(page,-26.4,-15,'workbench');
  await expect(page.locator('[data-install="instance-part-v8-stock"]')).toBeDisabled();
  await page.locator('[data-install="instance-part-i4-stock"]').click();await page.locator('[data-install="instance-part-street-1"]').click();await page.locator('[data-paint="paint-saffron"]').click();await expect(page.locator('.build-status')).toContainText('READY FOR THE ROAD');await page.waitForTimeout(1200);await page.screenshot({path:'artifacts/garage.png'});await closePanel(page);
  await walk(page,-22.6,-13);await inspect(page,-20,-13,'garage-car');expect((await read(page)).mode).toBe('drive');
  console.log('driving starter');const loop=(await read(page)).loop;
  await drivePath(page,loopPath(loop[2].x,loop[3].z));await stop(page);expect((await read(page)).lapComplete).toBe(true);
  await page.screenshot({path:'artifacts/returned.png'});const lapSeconds=(await read(page)).lapElapsed;console.log('normal-control loop',lapSeconds);
  await page.keyboard.press('KeyE');expect((await read(page)).mode).toBe('foot');
  // Swap a unique engine and wheel instance. Old items become available again.
  await walk(page,-24,-13.5);await inspect(page,-26.4,-15,'workbench');await page.locator('[data-install="instance-part-i4-performance"]').click();await page.locator('[data-install="instance-part-sport-1"]').click();await expect(page.locator('[data-install="instance-part-i4-stock"]')).toBeEnabled();await expect(page.locator('[data-install="instance-part-street-1"]')).toBeEnabled();await closePanel(page);
  // The rare wedge is reachable around the scrap row on the first visit.
  await walk(page,-24,-3);await walk(page,-31,-3);await walk(page,-41.6,-4);await walk(page,-41.6,-17);await walk(page,-40.8,-22);await inspect(page,-38,-23,'shell-veloce');await page.screenshot({path:'artifacts/rare-find.png'});await page.locator('[data-buy="shell-veloce"]').click();await closePanel(page);
  await walk(page,-41.6,-17);await walk(page,-41.6,-4);await walk(page,-31,-3);await walk(page,-24,-3);await walk(page,-24,-13.5);await inspect(page,-26.4,-15,'workbench');await page.locator('[data-select="car-veloce"]').click();await page.locator('[data-install="instance-part-v12-stock"]').click();await page.locator('[data-install="instance-part-street-2"]').click();await page.locator('[data-paint="paint-saffron"]').click();await expect(page.locator('.build-status')).toContainText('READY FOR THE ROAD');await closePanel(page);
  await walk(page,-22.6,-13);await inspect(page,-20,-13,'garage-car');expect((await read(page)).mode).toBe('drive');await page.keyboard.down('KeyW');await page.waitForTimeout(3000);await page.keyboard.up('KeyW');expect((await read(page)).speed).toBeGreaterThan(3);await page.keyboard.press('KeyR');expect((await read(page)).position.z).toBeCloseTo(0,0);await stop(page);await page.keyboard.press('KeyE');
  const before=await read(page);await page.reload();await expect(page.locator('#begin')).toBeEnabled();const after=await read(page);expect(after.state).toEqual(before.state);expect(after.roads).toEqual(before.roads);expect(after.mode).toBe('foot');expect(after.position.x).toBe(-20);expect(after.state.cars[0].paint).toBe('#e7ad36');
  expect(errors).toEqual([]);expect(failed).toEqual([]);expect(external).toEqual([]);writeFileSync('artifacts/browser-acceptance.json',JSON.stringify({seed:after.state.seed,cars:after.state.cars,receipts:after.state.purchasedListings,lapSeconds,errors,failed,external},null,2));
});
