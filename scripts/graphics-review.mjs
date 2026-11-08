// Fixed-camera visual fixtures, separate from normal-control gameplay acceptance.
// Runtime instrumentation is injected into the temporary browser response only;
// it does not change game source, user saves, or production bundles.
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { boot, read } from '../tests/browser/helpers.ts';

const baseURL = process.env.VISUAL_BASE_URL || 'http://127.0.0.1:5173/';
const output = resolve(process.env.VISUAL_OUTPUT_DIR || 'artifacts/graphics-after');
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true,
  args: process.platform === 'darwin' ? ['--use-angle=metal'] : [],
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
});
const errors = [], failures = [], external = [], captures = [];
const viewport = { width: 1440, height: 900 };
async function makePage(fixture) {
  const page = await browser.newPage({ baseURL, viewport });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => failures.push({ url:request.url(), error:request.failure()?.errorText, page:page.url() }));
  page.on('request', request => { if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== new URL(baseURL).origin) external.push(request.url()); });
  await page.route('**/src/main.ts*', async route => {
    const response = await route.fetch();
    let body = await response.text();
    const cameraPattern = /function updateCamera\(dt\)\s*\{/;
    const infoPattern = /drawCalls:\s*renderer\.info\.render\.calls/;
    if (!cameraPattern.test(body) || !infoPattern.test(body)) throw new Error('Visual instrumentation targets changed');
    body = body.replace(cameraPattern, '$& if(window.__GRAPHICS_CAMERA){ const v=window.__GRAPHICS_CAMERA; camera.position.set(...v.position); camera.lookAt(...v.target); return; }');
    body = body.replace(infoPattern, '$&, renderTriangles:renderer.info.render.triangles, renderMemory:{...renderer.info.memory}, landmark:{...layout.landmark}, cameraPosition:camera.position.toArray()');
    await route.fulfill({ response, body });
  });
  if (fixture) await page.addInitScript(save => localStorage.setItem('junkyard-drivers-save-v1', JSON.stringify(save)), fixture);
  await boot(page);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(4500);
  return page;
}
async function capture(page, name, position, target) {
  await page.evaluate(camera => { window.__GRAPHICS_CAMERA = camera; }, { position, target });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${output}/${name}.png` });
  const perf = await page.evaluate(() => new Promise(resolve => {
    const times = [], begin = performance.now();
    function sample(time) {
      times.push(time);
      if (time - begin < 1500) requestAnimationFrame(sample);
      else {
        const intervals = times.slice(1).map((value, i) => value - times[i]).sort((a, b) => a-b);
        const gl = document.querySelector('canvas').getContext('webgl2');
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        resolve({ fps: (times.length - 1) * 1000 / (times.at(-1) - times[0]),
          medianFrameMs: intervals[Math.floor(intervals.length * .5)], p95FrameMs: intervals[Math.floor(intervals.length * .95)],
          renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unavailable',
          drawCalls: window.__JD.drawCalls, triangles: window.__JD.renderTriangles,
          memory: window.__JD.renderMemory, jsHeapBytes: performance.memory?.usedJSHeapSize,
          quality: window.__JD.graphicsQuality });
      }
    }
    requestAnimationFrame(sample);
  }));
  captures.push({ name, position, target, perf });
  console.log(`[graphics-review] ${name} ${perf.fps.toFixed(1)} fps / ${perf.drawCalls} calls / ${perf.triangles} triangles`);
}
function carFixture(shellId) {
  const family = { hachiro:'i4', bison:'v8', veloce:'v12' }[shellId];
  const paint = { hachiro:'#e7ad36', bison:'#bd4432', veloce:'#397d87' }[shellId];
  const paintId = { hachiro:'paint-saffron', bison:'paint-oxide', veloce:'paint-teal' }[shellId];
  const engine = `${family}-stock`, wheels = 'sport-1';
  return { version:1,seed:642019,
    purchasedListings:[`shell-${shellId}`,`part-${engine}`,`part-${wheels}`,`part-${paintId}`],
    cars:[{id:`car-${shellId}`,shellId,engineId:`instance-part-${engine}`,wheelsId:`instance-part-${wheels}`,paint}],
    inventory:[engine,wheels].map(partId=>({id:`instance-part-${partId}`,partId})), paints:[paintId] };
}
try {
  const page = await makePage();
  await capture(page,'scrapyard',[-22,3.2,24],[-27,1.2,0]);
  await capture(page,'unrestored-hachiro',[-19,2.25,16.2],[-15,.95,12]);
  await capture(page,'unrestored-veloce',[-41.8,2.2,-18],[-38,.95,-23]);
  await capture(page,'salvage-engines',[-32.7,2.2,5.2],[-37,1.2,2]);
  await capture(page,'salvage-wheels',[-32.7,2.0,11.1],[-37,1.2,8]);
  await capture(page,'store-exterior',[26,2.4,35],[12,2,23]);
  await capture(page,'store-displays',[12,2.2,19],[9,1.3,6]);
  await capture(page,'store-engine-detail',[8.6,1.9,9.8],[6.2,1,6.1]);
  await capture(page,'town-street',[38,2.2,45],[90,2.3,49]);
  const landmark = (await read(page)).landmark;
  await capture(page,'water-tower',[landmark.x-19,3,landmark.z-29],[landmark.x,11,landmark.z]);
  await page.close();
  for (const id of ['hachiro','bison','veloce']) {
    const car = await makePage(carFixture(id));
    if ((await read(car)).state.cars[0]?.shellId !== id) throw new Error(`Visual fixture rejected: ${id}`);
    await capture(car,`restored-${id}`,[-24.3,2.6,-6.8],[-20,1.1,-13]);
    await capture(car,`detail-${id}`,[-22.5,1.35,-9.55],[-20,1.05,-12.4]);
    if(id==='hachiro') await capture(car,'garage',[-26.5,3.3,-5],[-20,1.3,-15]);
    await car.close();
  }
  const report = { visualFixtures:true, capturedAt:new Date().toISOString(), instrumentation:'Temporary browser response only; fixed cameras and read-only renderer observations', baseURL, viewport, seed:642019,
    performanceScope:'1.5-second stationary samples after warm-up; frame pacing is vsync-limited on this machine. Draw calls and triangles include all rendering passes; memory reports Three.js resource counts, not GPU bytes.',
    captures, errors, failures, external };
  writeFileSync(`${output}/graphics-review.json`,JSON.stringify(report,null,2));
  const baselinePath = resolve(process.env.VISUAL_BASELINE_REPORT || 'artifacts/graphics-before/graphics-review.json');
  if (existsSync(baselinePath) && baselinePath !== `${output}/graphics-review.json`) {
    const baseline = JSON.parse(readFileSync(baselinePath,'utf8'));
    const comparison = captures.map(current => {
      const previous = baseline.captures.find(item => item.name === current.name);
      if (!previous) return { name:current.name, baseline:false };
      return { name:current.name, cameraMatches:JSON.stringify([current.position,current.target]) === JSON.stringify([previous.position,previous.target]),
        before:previous.perf, after:current.perf,
        drawCallChangePercent:100*(current.perf.drawCalls/previous.perf.drawCalls-1), triangleChangePercent:100*(current.perf.triangles/previous.perf.triangles-1) };
    });
    writeFileSync(`${output}/graphics-comparison.json`,JSON.stringify({baselinePath,comparison},null,2));
  }
  console.log(JSON.stringify({output,captures:captures.length,errors,failures,external},null,2));
  if(errors.length || failures.length || external.length) process.exitCode=1;
} finally { await browser.close(); }
