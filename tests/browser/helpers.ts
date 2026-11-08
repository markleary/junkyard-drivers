import { expect, type Page } from '@playwright/test';
export const read = (page:Page):Promise<any>=>page.evaluate(()=>(window as any).__JD);
export async function boot(page:Page){await page.goto('./?qa=1');await page.locator('#begin').waitFor();await expect(page.locator('#begin')).toBeEnabled();await page.locator('#begin').click();await expect.poll(async()=>(await read(page)).paused).toBe(false);}
const wrap=(a:number)=>Math.atan2(Math.sin(a),Math.cos(a));
export async function look(page:Page,yaw:number,pitch=0){
  const s=await read(page),dx=-wrap(yaw-s.yaw)/.0024,dy=-(pitch-s.pitch)/.0024;
  // Relative mouse events use the normal input handlers in both pointer-lock and drag-look modes.
  // Absolute Playwright cursor recentering would itself turn a pointer-locked camera.
  await page.evaluate(({dx,dy})=>{
    document.querySelector('canvas')!.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));
    document.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,movementX:dx,movementY:dy}));
    window.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,button:0}));
  },{dx,dy});
}

export async function walk(page:Page,x:number,z:number,tolerance=.8,sprint=true){
  const result=await page.evaluate(async({x,z,tolerance,sprint})=>{
    const input=(code:string,down:boolean)=>window.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{code,bubbles:true}));
    const started=performance.now();
    while(performance.now()-started<40000){
      const s=(window as any).__JD,dx=x-s.position.x,dz=z-s.position.z,dist=Math.hypot(dx,dz);
      if(dist<tolerance){input('KeyW',false);input('ShiftLeft',false);return true;}
      const desired=Math.atan2(-dx,-dz),delta=Math.atan2(Math.sin(desired-s.yaw),Math.cos(desired-s.yaw));
      document.querySelector('canvas')!.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));
      document.dispatchEvent(new MouseEvent('mousemove',{movementX:-delta/.0024,movementY:s.pitch/.0024,bubbles:true}));
      window.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
      input('ShiftLeft',sprint&&dist>2.8);input('KeyW',true);
      await new Promise(resolve=>setTimeout(resolve,70));
    }
    input('KeyW',false);input('ShiftLeft',false);return false;
  },{x,z,tolerance,sprint});
  if(!result)throw new Error(`Walking blocked toward ${x},${z}: ${JSON.stringify(await read(page))}`);
}

export async function inspect(page:Page,x:number,z:number,target:string){const s=await read(page);await look(page,Math.atan2(-(x-s.position.x),-(z-s.position.z)),-.08);await expect.poll(async()=>(await read(page)).activeTarget).toBe(target);await page.keyboard.press('KeyE');}
export async function closePanel(page:Page){await page.locator('[data-action="close"]').first().click();await expect.poll(async()=>(await read(page)).paused).toBe(false);}
export async function stop(page:Page){await page.keyboard.up('KeyW');await page.keyboard.up('KeyA');await page.keyboard.up('KeyD');await page.keyboard.down('Space');await expect.poll(async()=>Math.abs((await read(page)).speed),{timeout:15000}).toBeLessThan(.4);await page.keyboard.up('Space');}
export async function drivePath(page:Page,points:{x:number,z:number}[]){let index=0;let townCaptured=false;const started=Date.now();while(index<points.length&&Date.now()-started<160000){
  const s=await read(page),p=points[index];const dx=p.x-s.position.x,dz=p.z-s.position.z,dist=Math.hypot(dx,dz);
  if(dist<3.3){index++;continue;}
  if(!townCaptured&&s.position.x>60&&s.position.x<120&&s.position.z<52){await page.screenshot({path:'artifacts/town.png'});townCaptured=true;}
  const r=s.rotation;const yaw=Math.atan2(2*(r.w*r.y+r.x*r.z),1-2*(r.x*r.x+r.y*r.y));const desired=Math.atan2(-dx,-dz);const error=wrap(desired-yaw);
  const corner=dist<20&&points.slice(index,index+3).some((pt,i,ar)=>i&&Math.abs(wrap(Math.atan2(pt.x-ar[i-1].x,pt.z-ar[i-1].z)-Math.atan2(dx,dz)))>.25);
  const targetSpeed=(Math.abs(error)>.4||corner)?5.8:12.0;
  for(const [key,down] of [['KeyA',error>.045],['KeyD',error<-.045],['KeyW',s.speed<targetSpeed],['KeyS',s.speed>targetSpeed+1.1]] as const){if(down)await page.keyboard.down(key);else await page.keyboard.up(key);}
  await page.waitForTimeout(100);
}
for(const k of ['KeyW','KeyS','KeyA','KeyD'])await page.keyboard.up(k);if(index<points.length)throw new Error(`Drive path stuck at ${index}: ${JSON.stringify(await read(page))}`);
}
export function loopPath(east=144,north=151){const points:{x:number,z:number}[]=[];const add=(x:number,z:number)=>points.push({x,z});const arc=(cx:number,cz:number,start:number,end:number)=>{for(let i=1;i<=8;i++){const a=start+(end-start)*i/8;add(cx+10*Math.cos(a),cz+10*Math.sin(a));}};
add(-20,30);add(-20,34);arc(-10,34,Math.PI,Math.PI/2);add(east-10,44);arc(east-10,54,-Math.PI/2,0);add(east,north-10);arc(east-10,north-10,0,Math.PI/2);add(-10,north);arc(-10,north-10,Math.PI/2,Math.PI);add(-20,44);add(-20,30);add(-20,5);return points;}
