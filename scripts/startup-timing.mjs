// Startup and frame rate on the GPU and on a forced software renderer (what hosted CI runners use).
// Reads the game's own performance marks, so main-thread stalls during the first frame are visible.
// Usage: node scripts/startup-timing.mjs [base URL] [--out DIR]     Default URL: the local dev server.
// A production preview gives the most representative numbers: npm run build && npx vite preview --port 4174
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const output = resolve(outIndex >= 0 ? args[outIndex + 1] : 'artifacts/overhaul-after');
const base = args.find((value, index) => /^https?:/.test(value) && (outIndex < 0 || index !== outIndex + 1)) || process.env.VISUAL_BASE_URL || 'http://127.0.0.1:5173/';
mkdirSync(output, { recursive: true });

const report = { base, viewport: { width: 960, height: 600 }, runs: [] };
for (const [renderer, flags] of [['gpu', process.platform === 'darwin' ? ['--use-angle=metal'] : []], ['software', ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']]]) {
  const browser = await chromium.launch({ headless: true, args: flags });
  try {
    const page = await browser.newPage({ viewport: report.viewport });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // The first visit fills caches; the reload is the one that is timed.
    await page.goto(`${base}?qa=1`);
    await page.locator('#begin:not([disabled])').waitFor({ timeout: 180000 });
    const reloaded = Date.now();
    await page.reload();
    await page.locator('#begin:not([disabled])').waitFor({ timeout: 180000 });
    const beginUsableMs = Date.now() - reloaded;
    const clicked = Date.now();
    await page.locator('#begin').click();
    await page.waitForFunction(() => window.__JD && !window.__JD.paused, null, { timeout: 180000 });
    const playingAfterClickMs = Date.now() - clicked;
    const fps = await page.evaluate(() => new Promise(done => {
      let frames = 0; const begin = performance.now();
      const tick = time => { frames++; if (time - begin < 3000) requestAnimationFrame(tick); else done(frames * 1000 / (time - begin)); };
      requestAnimationFrame(tick);
    }));
    const state = await page.evaluate(() => ({
      tier: window.__JD.graphicsQuality, drawCalls: window.__JD.drawCalls, programs: window.__JD.programs ?? null, memory: window.__JD.memory, world: window.__JD.world ?? null,
      marks: Object.fromEntries(performance.getEntriesByType('mark').filter(mark => mark.name.startsWith('jd-')).map(mark => [mark.name.slice(3), Math.round(mark.startTime)])),
      gl: (() => { const gl = document.querySelector('canvas').getContext('webgl2'), ext = gl.getExtension('WEBGL_debug_renderer_info'); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unavailable'; })(),
    }));
    const run = { renderer, beginUsableMs, playingAfterClickMs, fps: +fps.toFixed(1), ...state, errors };
    report.runs.push(run);
    console.log(`${renderer.padEnd(9)} Begin usable after ${beginUsableMs} ms, playing ${playingAfterClickMs} ms after the click, ${run.fps} fps, tier ${run.tier}, ${run.programs ?? '?'} programs`);
    if (Object.keys(run.marks).length) console.log(`          marks (ms since navigation): ${Object.entries(run.marks).map(([name, at]) => `${name} ${at}`).join(', ')}`);
  } finally { await browser.close(); }
}
writeFileSync(`${output}/startup-timing.json`, JSON.stringify(report, null, 2));
