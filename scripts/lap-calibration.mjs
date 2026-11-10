// Lap calibration: a scripted driver laps the test loop in each car, in a stock and a fully upgraded build,
// at a tidy and a quick pace. Medal times in src/game/progress.ts are set from these laps. The driver sends
// real key events from inside the page every frame and follows the same line as the browser acceptance tests.
// Usage: node scripts/lap-calibration.mjs [filter, e.g. veloce:fast]   (needs `npm run dev -- --port 5173`)
import { chromium } from 'playwright';
import { boot, read, walk, inspect, loopPath } from '../tests/browser/helpers.ts';
const PAINT = { hachiro: ['#e7ad36', 'paint-saffron'], bison: ['#bd4432', 'paint-oxide'], veloce: ['#397d87', 'paint-teal'] };
function fixture(shellId, engine, wheels) {
  const [paint, paintId] = PAINT[shellId];
  return { version: 1, seed: 642019, purchasedListings: [`shell-${shellId}`, `part-${engine}`, `part-${wheels}`, `part-${paintId}`],
    cars: [{ id: `car-${shellId}`, shellId, engineId: `instance-part-${engine}`, wheelsId: `instance-part-${wheels}`, paint }],
    inventory: [engine, wheels].map(partId => ({ id: `instance-part-${partId}`, partId })), paints: [paintId] };
}
const CARS = [
  ['hachiro', 'i4-stock', 'street-1'], ['hachiro', 'crate-i4-performance', 'new-sport-1'],
  ['bison', 'v8-stock', 'street-1'], ['bison', 'crate-v8-performance', 'new-sport-1'],
  ['veloce', 'v12-stock', 'street-1'], ['veloce', 'crate-v12-performance', 'new-sport-1'],
];
const PACES = { brisk: { vmax: 22, alat: 5.5, decel: 5 }, fast: { vmax: 45, alat: 9, decel: 7.5 } };
const only = process.argv[2];
const browser = await chromium.launch({ headless: true, args: process.platform === 'darwin' ? ['--use-angle=metal'] : [] });
const results = [];
try {
  for (const [shell, engine, wheels] of CARS) for (const [pace, tune] of Object.entries(PACES)) {
    if (only && !`${shell}:${pace}`.includes(only)) continue;
    const page = await browser.newPage({ baseURL: process.env.VISUAL_BASE_URL || 'http://127.0.0.1:5173/', viewport: { width: 960, height: 600 } });
    page.on('pageerror', error => console.log('PAGEERROR', error.message));
    await page.addInitScript(save => localStorage.setItem('junkyard-drivers-save-v1', JSON.stringify(save)), fixture(shell, engine, wheels));
    await boot(page);
    await walk(page, -20, 17); await walk(page, -20, -9.5); await inspect(page, -20, -13, 'garage-car');
    const loop = (await read(page)).loop;
    const outcome = await page.evaluate(async ({ points, tune }) => {
      const key = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
      const held = new Set();
      const press = (code, down) => { if (down) { key(code, true); held.add(code); } else if (held.has(code)) { key(code, false); held.delete(code); } };
      const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
      const n = points.length, s = [0];
      for (let i = 1; i < n; i++) s.push(s[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
      const limit = points.map((p, i) => {
        if (i === 0 || i === n - 1) return tune.vmax;
        const a = points[i - 1], c = points[i + 1];
        const ab = Math.hypot(p.x - a.x, p.z - a.z), bc = Math.hypot(c.x - p.x, c.z - p.z), ac = Math.hypot(c.x - a.x, c.z - a.z);
        const area = Math.abs((p.x - a.x) * (c.z - a.z) - (p.z - a.z) * (c.x - a.x)) / 2;
        const radius = area < 1e-6 ? Infinity : ab * bc * ac / (4 * area);
        return Math.min(tune.vmax, Math.sqrt(tune.alat * radius));
      });
      for (let i = n - 2; i >= 0; i--) limit[i] = Math.min(limit[i], Math.sqrt(limit[i + 1] ** 2 + 2 * tune.decel * (s[i + 1] - s[i])));
      let k = 0, top = 0, offRoad = 0;
      const started = performance.now();
      return await new Promise(resolve => {
        function tick() {
          const state = window.__JD, p = state.position;
          top = Math.max(top, state.speed);
          if (state.lapComplete) { for (const code of [...held]) press(code, false); resolve({ lap: state.lapElapsed, top, seconds: (performance.now() - started) / 1000 }); return; }
          if (performance.now() - started > 170000) { for (const code of [...held]) press(code, false); resolve({ lap: null, top, stuckAt: k, position: p, lapIndex: state.lapIndex }); return; }
          while (k < n - 2 && Math.hypot(points[k + 1].x - p.x, points[k + 1].z - p.z) <= Math.hypot(points[k].x - p.x, points[k].z - p.z)) k++;
          const reach = Math.min(15, Math.max(4.5, 3 + Math.abs(state.speed) * .5));
          let j = k; while (j < n - 1 && s[j] - s[k] < reach) j++;
          const target = points[j], r = state.rotation;
          const yaw = Math.atan2(2 * (r.w * r.y + r.x * r.z), 1 - 2 * (r.x * r.x + r.y * r.y));
          const error = wrap(Math.atan2(-(target.x - p.x), -(target.z - p.z)) - yaw);
          press('KeyA', error > .03); press('KeyD', error < -.03);
          const want = Math.min(limit[k], limit[Math.min(n - 1, k + 1)]);
          press('KeyW', state.speed < want - .2); press('KeyS', state.speed > want + .9);
          requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      });
    }, { points: loopPath(loop[2].x, loop[3].z), tune });
    const after = await read(page);
    const row = { shell, engine, wheels, pace, lap: outcome.lap === null ? null : +outcome.lap.toFixed(2), topKmh: Math.round(outcome.top * 3.6), logged: after.progress.bestLap[shell] ?? null, note: outcome.lap === null ? JSON.stringify(outcome) : '' };
    results.push(row); console.log(JSON.stringify(row));
    await page.close();
  }
} finally { await browser.close(); }
console.table(results.map(({ note, ...row }) => row));
