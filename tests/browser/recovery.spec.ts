import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { boot, inspect, read, stop, walk, closePanel } from './helpers';
import { bootTablet, TabletTouches } from './touch-helpers';
import { PROGRESS_KEY } from '../../src/game/progress';
import { STORAGE_KEY } from '../../src/game/state';
import { SHED_VAN } from '../../src/world/orchard';
import { angleDelta } from '../../src/physics/trailer';

const output = 'artifacts/recovery';
type Point = [number,number];
async function drive(page: Page, points: Point[]) {
  let index = 0, lastAdvance = Date.now();
  while (index < points.length && Date.now()-lastAdvance < 18000) {
    const { rig, speed } = await read(page);
    const [x,z] = points[index], dx = x-rig.truck.x, dz = z-rig.truck.z;
    if (Math.hypot(dx,dz)<1.55) { index++; lastAdvance = Date.now(); continue; }
    const error = angleDelta(Math.atan2(-dx,-dz)-rig.truck.yaw);
    const target = Math.abs(error)>.35 ? 3.3 : 5.5;
    for (const [key,down] of [['KeyA',error>.035],['KeyD',error<-.035],['KeyW',speed<target],['KeyS',speed>target+.45]] as const) {
      if (down) await page.keyboard.down(key); else await page.keyboard.up(key);
    }
    await page.waitForTimeout(65);
  }
  for (const key of ['KeyA','KeyD','KeyW','KeyS']) await page.keyboard.up(key);
  if (index<points.length) throw new Error(`Rig blocked approaching ${points[index]}: ${JSON.stringify((await read(page)).rig)}`);
}

async function backIn(page: Page) {
  const start = Date.now();
  while (Date.now()-start < 22000) {
    const { rig, speed } = await read(page);
    if (rig.axle.z > SHED_VAN.z-7.0) break;
    const desired = Math.max(-.32,Math.min(.32,(SHED_VAN.x-rig.axle.x)*.13));
    // Back the truck under the trailer to correct its bearing, then follow it straight.
    const truckYaw = rig.axle.yaw + 1.35*angleDelta(rig.axle.yaw-desired);
    const steer = angleDelta(rig.truck.yaw-truckYaw);
    for (const [key,down] of [['KeyA',steer>.035],['KeyD',steer<-.035],['KeyS',speed> -1.8]] as const) {
      if (down) await page.keyboard.down(key); else await page.keyboard.up(key);
    }
    await page.waitForTimeout(65);
  }
  await page.keyboard.up('KeyS'); await stop(page);
  const { rig } = await read(page);
  expect(rig.action,JSON.stringify(rig)).toBe('Attach the cable');
}

async function work(page: Page, next: string) {
  await page.locator('#restoration-work').focus(); await page.keyboard.down('Space');
  await expect.poll(async () => (await read(page)).progress.restorations['car-orchard'].stage).toBe(next);
  await page.keyboard.up('Space');
}

test('recovers the lettered Courier from Nell’s counter note and refinishes the same door', async ({ page, baseURL }) => {
  mkdirSync(output,{ recursive:true });
  const errors: string[] = [];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); });
  page.on('requestfailed',r=>errors.push(r.url()));
  page.on('request',r=>{if(/^https?:/.test(r.url()) && new URL(r.url()).origin!==new URL(baseURL!).origin) errors.push(r.url());});
  await boot(page);
  await walk(page,-20,34); await walk(page,12,34); await walk(page,12,16); await walk(page,9.5,11.2);
  await inspect(page,9.4,8.9,'orchard-note');
  await page.locator('[data-action="accept-tip"]').click();
  expect((await read(page)).state.cars).toHaveLength(0);
  // Pick up factory parts for the recovery while we are at the counter.
  await walk(page,12,11.1); await inspect(page,12,8,'store-counter');
  await page.locator('[data-buy="part-crate-v8-stock"]').click();
  await page.locator('[data-category="wheels"]').click();
  await page.locator('[data-buy="part-new-touring-1"]').click();
  await page.locator('[data-category="paint"]').click();
  await page.locator('[data-buy="part-paint-cobalt"]').click(); await closePanel(page);
  await walk(page,12,23); await walk(page,12,38); await inspect(page,12,41,'loaner');
  await drive(page,[[-18,44],[-45,44],[-54,46],[-61,52],[-66,55],[-71,54],[-75,50],[-76,44],[-76,34.5]]);
  await stop(page); await page.keyboard.press('KeyC');
  await backIn(page); await page.keyboard.press('KeyE');
  await expect(page.locator('#objective')).toContainText('Winch the Courier');
  await page.waitForTimeout(150); await page.keyboard.down('Space');
  await expect.poll(async()=>(await read(page)).rig.winched).toBeGreaterThan(.42);
  await page.keyboard.up('Space'); await page.screenshot({path:`${output}/loading.jpg`});
  const partial = (await read(page)).rig.winched;
  await page.keyboard.press('KeyR');
  expect((await read(page)).rig.winched).toBe(partial);
  await page.keyboard.down('Space'); await expect.poll(async()=>(await read(page)).rig.winched).toBe(1);
  await expect(page.locator('#objective')).toContainText('Secure the Courier');
  await page.keyboard.up('Space'); await page.keyboard.press('KeyE');
  expect((await read(page)).progress.recovery).toBe('loaded');
  await drive(page,[[-76,49],[-75,46],[-71,43],[-65,42],[-51,44],[-32,44],[-26,43],[-22,40],[-20,35],[-20,22],[-20,0]]);
  await stop(page);
  const home = await read(page);
  expect(home.rig.action,JSON.stringify(home.rig)).toBe('Unload the Courier');
  expect(home.progress.laps).toBe(0); expect(home.progress.odometer).toEqual({});
  await page.keyboard.press('KeyE');
  expect((await read(page)).state.cars.map((c:{id:string})=>c.id)).toEqual(['car-orchard']);
  await walk(page,-24,-13.5); await inspect(page,-26.4,-15,'workbench');
  await page.locator('[data-install="instance-part-crate-v8-stock"]').click();
  await page.locator('[data-install="instance-part-new-touring-1"]').click();
  await page.locator('[data-action="restoration"]').click();
  await work(page,'rust'); await page.locator('[data-restoration-route="patina"]').click();
  await work(page,'repair'); await work(page,'seal'); await work(page,'complete');
  await page.locator('[data-action="restoration-photos"]').click();
  await page.locator('#restoration-after').screenshot({path:`${output}/patina.jpg`});
  const downloaded = page.waitForEvent('download'); await page.locator('[data-action="restoration-download"]').click();
  await (await downloaded).saveAs(`${output}/orchard-photo-pair.png`);
  await page.locator('[data-action="restoration-bench"]').click();
  await page.locator('[data-action="restoration-refinish"]').click();
  await page.locator('[data-restoration-paint="paint-cobalt"]').click();
  await work(page,'paint'); await work(page,'complete');
  await page.locator('[data-action="restoration-photos"]').click();
  await page.locator('#restoration-after').screenshot({path:`${output}/repaint.jpg`});
  await boot(page); await walk(page,-22.7,-12);
  await inspect(page,-20,-13,'garage-car'); await page.keyboard.down('KeyW');
  await expect.poll(async()=>(await read(page)).speed).toBeGreaterThan(2); await page.keyboard.up('KeyW');
  expect((await read(page)).progress.recovery).toBe('complete');
  expect(errors).toEqual([]);
});

for (const input of ['touch','controller'] as const) {
  test(`${input} reverses, winches, secures and resumes the loaded rig`, async ({ browser, baseURL }) => {
    const context = await browser.newContext({baseURL, hasTouch: input === 'touch', viewport:{width:1180,height:820}});
    try {
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(({controller,progressKey,saveKey}) => {
        // Start at the persisted arrival checkpoint. Everything after boot uses player controls.
        if (!sessionStorage.getItem('recovery-fixture')) {
          sessionStorage.setItem('recovery-fixture','1');
          localStorage.setItem(progressKey,JSON.stringify({version:1,recovery:'shed'}));
          localStorage.removeItem(saveKey);
        }
        if (controller) Object.defineProperty(navigator,'getGamepads',{value:()=>{
          const held = (document.body?.dataset.pad || '').split(' ');
          return [{connected:true,index:0,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},(_,i)=>({
            pressed:held.includes(String(i)),value:Number(held.includes(String(i))),
          }))}];
        }});
      },{controller:input==='controller',progressKey:PROGRESS_KEY,saveKey:STORAGE_KEY});
      let touch: TabletTouches | undefined;
      if (input==='touch') touch = await bootTablet(page); else await boot(page);
      const held = new Set<number>();
      const press = async (button: number, selector: string, down: boolean) => {
        if (touch) await touch.hold(selector,button+1,down);
        else {
          if (down) held.add(button); else held.delete(button);
          await page.evaluate(value=>{document.body.dataset.pad=value;},[...held].join(' '));
          await page.waitForTimeout(85);
        }
      };
      const tap = async (button: number, selector: string) => {
        if (touch) await touch.tap(selector);
        else { await press(button,selector,true); await press(button,selector,false); }
      };
      await expect.poll(async()=>(await read(page)).activeTarget).toBe('loaner');
      await tap(2,'#touch-interact'); await tap(5,'#touch-camera');
      await expect.poll(async()=>(await read(page)).rig.view).toBe(true);
      await tap(3,'#recover');
      expect((await read(page)).progress.recovery).toBe('shed');
      await press(6,'#touch-brake',true);
      await page.waitForFunction(()=> (window as any).__JD.rig.axle.z > 58);
      await press(6,'#touch-brake',false);
      await press(0,'#touch-handbrake',true);
      await expect.poll(async()=>(await read(page)).rig.action).toBe('Attach the cable');
      await press(0,'#touch-handbrake',false);
      await tap(2,'#touch-interact'); await press(0,'#touch-handbrake',true);
      await expect.poll(async()=>(await read(page)).rig.winched).toBeGreaterThan(.12);
      await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
      const partial = (await read(page)).rig.winched;
      if (touch) { await touch.release(); await touch.tap('[data-action="resume"]'); }
      else await tap(9,'#pause-button');
      await page.waitForTimeout(250);
      expect((await read(page)).rig.winched).toBe(partial);
      await press(0,'#touch-handbrake',false); await page.waitForTimeout(80);
      await press(0,'#touch-handbrake',true);
      await expect.poll(async()=>(await read(page)).rig.action).toBe('Secure the Courier');
      await press(0,'#touch-handbrake',false); await tap(2,'#touch-interact');
      await expect.poll(async()=>(await read(page)).progress.recovery).toBe('loaded');
      if (touch) touch = await bootTablet(page); else await boot(page);
      await expect(page.locator('#objective')).toContainText('unloading bay');
      expect((await read(page)).state.cars).toEqual([]);
      await tap(2,'#touch-interact'); await tap(3,'#recover');
      await press(7,'#touch-throttle',true);
      await expect.poll(async()=>(await read(page)).speed).toBeGreaterThan(2);
      await press(7,'#touch-throttle',false);
      expect((await read(page)).progress.recovery).toBe('loaded');
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  });
}
