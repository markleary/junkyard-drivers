// Software WebGL smoke, separate from native-GPU visual/performance reports.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { boot, read } from '../tests/browser/helpers.ts';
const baseURL=process.env.VISUAL_BASE_URL||'http://127.0.0.1:5173/';
const output=process.env.VISUAL_OUTPUT_DIR||'artifacts/graphics-after';
mkdirSync(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader'],executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});
try{
 const page=await browser.newPage({baseURL,viewport:{width:960,height:600}}),errors=[],failures=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('console',message=>{if(message.type()==='error')errors.push(message.text())});
 page.on('requestfailed',request=>failures.push({url:request.url(),error:request.failure()?.errorText}));
 await boot(page);await page.waitForTimeout(4500);
 const performanceSample=await page.evaluate(()=>new Promise(resolve=>{
   const times=[],begin=performance.now();
   const sample=time=>{times.push(time);if(time-begin<3000)requestAnimationFrame(sample);else{
     const gl=document.querySelector('canvas').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');
     const intervals=times.slice(1).map((time,i)=>time-times[i]).sort((a,b)=>a-b);
     resolve({fps:(times.length-1)*1000/(times.at(-1)-times[0]),p95FrameMs:intervals[Math.floor(intervals.length*.95)],renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable'});
   }};requestAnimationFrame(sample);
 }));
 await page.screenshot({path:`${output}/software-fallback.png`});
 const state=await read(page);
 const report={baseURL,viewport:page.viewportSize(),mode:state.mode,paused:state.paused,graphicsQuality:state.graphicsQuality,drawCalls:state.drawCalls,performanceSample,errors,failures};
 writeFileSync(`${output}/software-fallback.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 if(errors.length||failures.length||state.graphicsQuality!=='compatible')process.exitCode=1;
}finally{await browser.close()}
