// Audio evidence without ears: renders the recorded voices offline in a real browser
// and measures what a listener would notice: loop seams, level steps across the engine's
// rev range, pitch rising with revs, a horn that holds steady, and footfalls cut cleanly.
// Then boots the game and confirms the recordings are decoded and in use.
// Usage: node scripts/audio-review.mjs [--out DIR]
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : fallback; };
const baseURL = process.env.VISUAL_BASE_URL || 'http://127.0.0.1:5173/';
const output = resolve(option('out', 'artifacts/overhaul-after'));
mkdirSync(output, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])] });
const errors = [];
try {
  const bench = await browser.newPage({ baseURL });
  bench.on('pageerror', error => errors.push(error.message));
  bench.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  // An empty page on the game's origin, so its modules import without booting the 3D world.
  await bench.route('**/__audio-review', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>audio review</title>' }));
  await bench.goto('./__audio-review');
  const offline = await bench.evaluate(async () => {
    const { SampleBank, SampledEngine, SampledHorn, findSteps, clipFor } = await import('/src/audio/sampled.ts');
    const RATE = 44100;
    const bank = await new Promise(done => { const made = new SampleBank(new OfflineAudioContext(2, RATE, RATE), () => done(made)); });
    const db = value => 20 * Math.log10(value + 1e-9);
    const rms = (data, from, to) => { let sum = 0; for (let i = from; i < to; i++) sum += data[i] * data[i]; return Math.sqrt(sum / Math.max(1, to - from)); };
    const crossings = (data, from, to) => { let count = 0; for (let i = from + 1; i < to; i++) if ((data[i - 1] < 0) !== (data[i] < 0)) count++; return count / ((to - from) / RATE) / 2; };
    const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))];
    const round = (value, digits = 1) => Number(value.toFixed(digits));

    // 1. Every loop, played through its seam twice exactly as the game loops it.
    const loopNames = ['amb-day', 'amb-night', 'amb-garage', 'amb-yard', 'roll-asphalt', 'roll-gravel', 'skid', 'wind',
      ...['i4', 'v8', 'v12'].flatMap(family => [`engine-${family}-idle`, `engine-${family}-rev`])];
    const loops = [];
    for (const name of loopNames) {
      const buffer = bank.get(name);
      if (!buffer) { loops.push({ name, missing: true }); continue; }
      const [lead, trail] = bank.loopBounds(name), length = buffer.duration - lead - trail;
      const ctx = new OfflineAudioContext(1, Math.ceil(RATE * length * 2.3), RATE), source = ctx.createBufferSource();
      source.buffer = buffer; source.loop = true; source.loopStart = lead; source.loopEnd = buffer.duration - trail;
      source.connect(ctx.destination); source.start(0, lead);
      const data = (await ctx.startRendering()).getChannelData(0), window = Math.floor(RATE * .04);
      const levels = [];
      for (let i = 0; i + window <= data.length; i += window) levels.push(db(rms(data, i, i + window)));
      const steps = levels.slice(1).map((level, i) => Math.abs(level - levels[i]));
      const jumps = [];
      for (let i = 1; i < data.length; i++) jumps.push(Math.abs(data[i] - data[i - 1]));
      const usual = percentile(jumps, .999);
      const seams = [1, 2].map(turn => {
        const at = Math.round(length * turn * RATE), near = Math.floor(RATE * .002);
        let click = 0;
        for (let i = Math.max(1, at - near); i < Math.min(data.length, at + near); i++) click = Math.max(click, jumps[i - 1]);
        return { stepDb: Math.abs(db(rms(data, at - window, at)) - db(rms(data, at, at + window))), click: click / (usual || 1e-9) };
      });
      loops.push({ name, seconds: round(length, 2), paddingMs: [round(lead * 1000), round(trail * 1000)], levelDb: round(db(rms(data, 0, data.length))),
        seamStepDb: round(Math.max(...seams.map(seam => seam.stepDb))), usualStepDb: round(percentile(steps, .9)), seamClick: round(Math.max(...seams.map(seam => seam.click)), 2) });
    }

    // 2. Each engine swept from idle to the red line on full throttle, then lifted.
    const engines = [];
    for (const [family, power] of [['i4', 110], ['v8', 290], ['v12', 440]]) {
      if (!SampledEngine.available(bank, family)) { engines.push({ family, missing: true }); continue; }
      const seconds = 12, ctx = new OfflineAudioContext(1, RATE * seconds, RATE);
      const engine = new SampledEngine(ctx, bank, ctx.destination, { family, power }, 0);
      const revs = t => t < 8 ? t / 8 : Math.max(0, 1 - (t - 8) / 3), throttle = t => t < 8 ? 1 : 0;
      engine.update(0, 1, .05);
      for (let t = .05; t < seconds; t += .05) void ctx.suspend(t).then(() => { engine.update(revs(t), throttle(t), .05); void ctx.resume(); });
      const data = (await ctx.startRendering()).getChannelData(0), window = Math.floor(RATE * .25);
      const frames = [];
      for (let i = 0; i + window <= data.length; i += window) frames.push({ t: i / RATE + .125, level: db(rms(data, i, i + window)), pitch: crossings(data, i, i + window) });
      const at = time => frames.reduce((best, frame) => Math.abs(frame.t - time) < Math.abs(best.t - time) ? frame : best);
      const pull = frames.filter(frame => frame.t > 1 && frame.t < 8);
      const steps = pull.slice(1).map((frame, i) => Math.abs(frame.level - pull[i].level));
      const sampled = [.15, .3, .5, .7, .9].map(r => ({ revs: r, levelDb: round(at(r * 8).level), crossingsHz: Math.round(at(r * 8).pitch) }));
      engines.push({ family, power, sweep: sampled, peak: round(data.reduce((most, value) => Math.max(most, Math.abs(value)), 0), 2),
        pitchRises: sampled.every((point, i) => i === 0 || point.crossingsHz > sampled[i - 1].crossingsHz),
        levelRangeDb: round(Math.max(...pull.map(frame => frame.level)) - Math.min(...pull.map(frame => frame.level))),
        largestStepDb: round(Math.max(...steps)), liftOffDropDb: round(at(7.6).level - at(8.6).level), idleAfterDb: round(at(11.7).level) });
    }

    // 3. A horn held for a second and a half, then released.
    const horns = [];
    for (const family of ['i4', 'v8', 'v12']) {
      const ctx = new OfflineAudioContext(1, RATE * 2, RATE), horn = new SampledHorn(ctx, bank, ctx.destination);
      const sounding = horn.set(true, family);
      void ctx.suspend(1.5).then(() => { horn.set(false, family); void ctx.resume(); });
      const data = (await ctx.startRendering()).getChannelData(0), window = Math.floor(RATE * .05);
      const held = [];
      for (let i = Math.floor(RATE * .25); i + window <= RATE * 1.45; i += window) held.push(db(rms(data, i, i + window)));
      const mean = held.reduce((sum, value) => sum + value, 0) / held.length;
      horns.push({ family, recorded: sounding, heldLevelDb: round(mean), heldSpreadDb: round(Math.max(...held) - Math.min(...held)),
        afterReleaseDb: round(db(rms(data, Math.floor(RATE * 1.8), RATE * 2))), source: round(bank.get(`horn-${family}`)?.duration ?? 0, 2) });
    }

    // 4. Footfalls cut from each recorded walk.
    const steps = ['gravel', 'hard', 'grass'].map(kind => {
      const buffer = bank.get(`steps-${kind}`);
      if (!buffer) return { kind, missing: true };
      const slices = findSteps(buffer.getChannelData(0), buffer.sampleRate);
      return { kind, footfalls: slices.length, meanMs: Math.round(slices.reduce((sum, slice) => sum + slice.length, 0) / Math.max(1, slices.length) * 1000),
        gains: slices.map(slice => round(slice.gain, 2)) };
    });

    // 5. Which named effects have a recording, and which stay synthesized.
    const names = ['click', 'open', 'close', 'buy', 'install', 'ratchet', 'paint', 'stamp', 'error', 'enterCar', 'exitCar', 'ignition', 'shutdown', 'recover',
      'checkpoint', 'lapComplete', 'medal', 'find', 'unlock', 'handbrake', 'thud', 'scrape', 'lightSwitch', 'shutter', 'gearShift'];
    const effects = Object.fromEntries(names.map(name => [name, ['i4', 'v8', 'v12'].every(family => bank.has(clipFor(name, family))) ? 'recorded' : 'synthesized']));
    return { clips: bank.size, loops, engines, horns, steps, effects };
  });
  await bench.close();

  // 6. The game itself: recordings decoded and voices switched over after the first click.
  const game = await browser.newPage({ baseURL, viewport: { width: 1280, height: 720 } });
  game.on('pageerror', error => errors.push(error.message));
  game.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const requests = [];
  game.on('request', request => { if (request.url().endsWith('.mp3')) requests.push(new URL(request.url()).origin === new URL(baseURL).origin ? 'same-origin' : request.url()); });
  await game.goto('./?qa=1');
  await game.locator('#begin:not([disabled])').waitFor();
  const before = await game.evaluate(() => window.__JD.audio);
  await game.locator('#begin').click();
  await game.waitForFunction(() => window.__JD.audio.clips >= 40 && window.__JD.audio.recorded.length >= 4, null, { timeout: 20000 }).catch(() => undefined);
  const inGame = { beforeFirstClick: before, afterFirstClick: await game.evaluate(() => window.__JD.audio),
    clipRequests: requests.length, clipRequestsOffOrigin: requests.filter(origin => origin !== 'same-origin') };
  await game.close();

  const report = { baseURL, ...offline, inGame, errors };
  writeFileSync(`${output}/audio-review.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 1));
} finally {
  await browser.close();
}
