// Temporary browser-only lighting diagnostics for the fixed town camera.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { boot } from '../tests/browser/helpers.ts';
const output='artifacts/graphics-diagnostic';mkdirSync(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal'],executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});
try {
 const page=await browser.newPage({baseURL:'http://127.0.0.1:5173/',viewport:{width:1440,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/src/main.ts*',async route=>{
   const response=await route.fetch();let body=await response.text();
   body=body.replace(/function updateCamera\(dt\)\s*\{/,'$& camera.position.set(38,2.2,45);camera.lookAt(90,2.3,49);return;');
   body+='\nwindow.__GRAPHICS_OBJECTS={get scene(){return scene},get renderer(){return renderer}};';
   await route.fulfill({response,body});
 });
 await page.route('**/src/render/lighting.ts*',async route=>{
   const response=await route.fetch();let body=await response.text();
   if(!/composer\.addPass\(ao\)/.test(body))throw new Error('AO diagnostic hook changed');
   body=body.replace(/composer\.addPass\(ao\);/,'$& window.__GRAPHICS_AO=ao;');
   await route.fulfill({response,body});
 });
 await boot(page);await page.waitForTimeout(4500);
 const objects=await page.evaluate(()=>{
   const result=[];
   window.__GRAPHICS_OBJECTS.scene.traverse(o=>{
     if(!o.isInstancedMesh || !['e8ad4d','d7b866','d4d5c6'].includes(o.material?.color?.getHexString()))return;
     const instances=[];
     for(let i=0;i<o.count;i++){
       const m=Array.from(o.instanceMatrix.array.slice(i*16,i*16+16));
       if(m[12]>20&&m[12]<65&&m[14]>38&&m[14]<50)instances.push({index:i,matrix:m});
     }
     result.push({color:o.material.color.getHexString(),count:o.count,castShadow:o.castShadow,receiveShadow:o.receiveShadow,userData:o.userData,instances});
   });return result;
 });
 for(const [name,ao,shadows]of[['normal',true,true],['no-ao',false,true],['no-sun-shadows',true,false],['neither',false,false]]){
   await page.evaluate(({ao,shadows})=>{
     window.__GRAPHICS_AO.enabled=ao;
     window.__GRAPHICS_OBJECTS.renderer.shadowMap.enabled=shadows;
     window.__GRAPHICS_OBJECTS.scene.traverse(o=>{
       if(o.isDirectionalLight)o.castShadow=shadows;
       if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material])m.needsUpdate=true;}
     });
   },{ao,shadows});
   await page.waitForTimeout(650);await page.screenshot({path:`${output}/${name}.png`});
 }
 writeFileSync(`${output}/route-instances.json`,JSON.stringify({objects,errors},null,2));
 console.log(JSON.stringify({objects,errors},null,2));
} finally {await browser.close();}
