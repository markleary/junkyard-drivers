// Audio evidence without ears: renders the recorded voices offline in a real browser
// and measures what a listener would notice: loop seams, level steps across the engine's
// rev range, pitch rising with revs, how much louder a modified exhaust is, a turbocharger
// whistle that climbs with boost, a horn that holds steady, and footfalls cut cleanly.
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
    const { SampleBank, SampledEngine, SampledBoost, SampledHorn, findSteps, clipFor } = await import('/src/audio/sampled.ts');
    const RATE = 44100;
    const bank = await new Promise(done => { const made = new SampleBank(new OfflineAudioContext(2, RATE, RATE), () => done(made)); });
    const db = value => 20 * Math.log10(value + 1e-9);
    const rms = (data, from, to) => { let sum = 0; for (let i = from; i < to; i++) sum += data[i] * data[i]; return Math.sqrt(sum / Math.max(1, to - from)); };
    const crossings = (data, from, to) => { let count = 0; for (let i = from + 1; i < to; i++) if ((data[i - 1] < 0) !== (data[i] < 0)) count++; return count / ((to - from) / RATE) / 2; };
    const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))];
    const round = (value, digits = 1) => Number(value.toFixed(digits));
    const fft = (re, im) => {
      const n = re.length;
      for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
      }
      for (let size = 2; size <= n; size <<= 1) {
        const angle = -2 * Math.PI / size, wr = Math.cos(angle), wi = Math.sin(angle);
        for (let start = 0; start < n; start += size) {
          let cr = 1, ci = 0;
          for (let k = 0; k < size / 2; k++) {
            const a = start + k, b = a + size / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
            re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
            const next = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = next;
          }
        }
      }
    };
    // Level as the ear weighs it (A-weighting, applied to the averaged spectrum): a deep note counts for
    // less than a meter says, which is also roughly what a laptop or tablet speaker does to it.
    const heard = (data, from, to) => {
      const size = 8192, power = new Float64Array(size / 2);
      for (let start = from; start + size <= to; start += size / 2) {
        const re = new Float64Array(size), im = new Float64Array(size);
        for (let i = 0; i < size; i++) re[i] = data[start + i] * (.5 - .5 * Math.cos(2 * Math.PI * i / size));
        fft(re, im);
        for (let i = 1; i < size / 2; i++) power[i] += re[i] * re[i] + im[i] * im[i];
      }
      let flat = 0, weighted = 0;
      for (let i = 1; i < size / 2; i++) {
        const f2 = (i * RATE / size) ** 2, a = 1.2589 * 12194 ** 2 * f2 * f2 / ((f2 + 20.6 ** 2) * Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194 ** 2));
        flat += power[i]; weighted += power[i] * a * a;
      }
      return db(rms(data, from, to)) + 10 * Math.log10(weighted / (flat || 1e-30) + 1e-30);
    };

    // 1. Every loop, played through its seam twice exactly as the game loops it.
    const loopNames = ['amb-day', 'amb-night', 'amb-garage', 'amb-yard', 'roll-asphalt', 'roll-gravel', 'skid', 'wind', 'turbo-spool', 'nitro-loop',
      ...['i4', 'v8', 'v12'].flatMap(family => [`engine-${family}-idle`, `engine-${family}-rev`, `engine-${family}-sport-idle`, `engine-${family}-sport-rev`])];
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

    // 2. Each engine swept from idle to the red line on full throttle, then lifted: on the standard
    // exhaust, then with a sport system and with straight-through pipes fitted.
    const engines = [];
    for (const [family, power] of [['i4', 110], ['v8', 290], ['v12', 440]]) for (const exhaust of ['stock', 'sport', 'race']) {
      if (!SampledEngine.available(bank, family)) { engines.push({ family, exhaust, missing: true }); continue; }
      const seconds = 12, ctx = new OfflineAudioContext(1, RATE * seconds, RATE);
      const engine = new SampledEngine(ctx, bank, ctx.destination, { family, power, exhaust }, 0);
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
      const mean = pull.reduce((sum, frame) => sum + frame.level, 0) / pull.length;
      engines.push({ family, power, exhaust, source: engine.source, sweep: sampled, peak: round(data.reduce((most, value) => Math.max(most, Math.abs(value)), 0), 2),
        pullLevelDb: round(mean), pullHeardDb: round(heard(data, RATE, RATE * 8)), idleHeardDb: round(heard(data, Math.floor(RATE * 10.5), RATE * 12)),
        pitchRises: sampled.every((point, i) => i === 0 || point.crossingsHz > sampled[i - 1].crossingsHz),
        levelRangeDb: round(Math.max(...pull.map(frame => frame.level)) - Math.min(...pull.map(frame => frame.level))),
        largestStepDb: round(Math.max(...steps)), liftOffDropDb: round(at(7.6).level - at(8.6).level), idleAfterDb: round(at(11.7).level) });
    }

    // What fitting each exhaust does to the same engine: louder by the meter, and louder as heard.
    const exhausts = ['i4', 'v8', 'v12'].map(family => {
      const of = exhaust => engines.find(entry => entry.family === family && entry.exhaust === exhaust);
      const stock = of('stock');
      if (!stock || stock.missing) return { family, missing: true };
      return { family, ...Object.fromEntries(['sport', 'race'].map(exhaust => [exhaust, { recording: of(exhaust).source, louderDb: round(of(exhaust).pullLevelDb - stock.pullLevelDb),
        louderAsHeardDb: round(of(exhaust).pullHeardDb - stock.pullHeardDb), idleLouderAsHeardDb: round(of(exhaust).idleHeardDb - stock.idleHeardDb), peak: of(exhaust).peak }])) };
    });

    // 2b. A turbocharger spooling up on a pull and dumping its boost, then a second of nitrous.
    let boost = { missing: true };
    if (SampledBoost.available(bank)) {
      const seconds = 7, ctx = new OfflineAudioContext(1, RATE * seconds, RATE), voice = new SampledBoost(ctx, bank, ctx.destination);
      const state = t => ({ rpm: .7, throttle: t < 4 ? 1 : 0, speed: 22, slip: 0, surface: 'asphalt', grounded: true, boost: t < 4 ? Math.min(1, t / 3) : 0, nitro: t >= 5 && t < 6 ? 1 : 0 });
      voice.update(state(0), .05);
      for (let t = .05; t < seconds; t += .05) void ctx.suspend(t).then(() => { voice.update(state(t), .05); void ctx.resume(); });
      const data = (await ctx.startRendering()).getChannelData(0), window = Math.floor(RATE * .2);
      // The whistle is the strongest single tone between 1 and 9 kHz in a tenth of a second.
      const tone = time => {
        const size = 4096, from = Math.floor(time * RATE) - size / 2, re = new Float64Array(size), im = new Float64Array(size);
        for (let i = 0; i < size; i++) re[i] = data[from + i] * (.5 - .5 * Math.cos(2 * Math.PI * i / size));
        fft(re, im);
        let best = Math.ceil(1000 * size / RATE);
        for (let i = best; i < 9000 * size / RATE; i++) if (re[i] * re[i] + im[i] * im[i] > re[best] * re[best] + im[best] * im[best]) best = i;
        return Math.round(best * RATE / size);
      };
      const at = time => { const from = Math.floor(time * RATE) - window / 2; return { levelDb: round(db(rms(data, from, from + window))), whistleHz: tone(time) }; };
      const spool = [.25, .5, .75, 1].map(level => ({ boost: level, ...at(level * 3) }));
      boost = { spool, whistleRises: spool.every((point, i) => i === 0 || (point.whistleHz > spool[i - 1].whistleHz && point.levelDb > spool[i - 1].levelDb)),
        fullBoostDb: at(3.6).levelDb, fullBoostHeardDb: round(heard(data, Math.floor(RATE * 3.1), Math.floor(RATE * 3.9))), afterLiftDb: at(4.7).levelDb,
        nitrousDb: at(5.6).levelDb, nitrousHeardDb: round(heard(data, Math.floor(RATE * 5.2), Math.floor(RATE * 5.95))), afterNitrousDb: at(6.7).levelDb };
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
      'checkpoint', 'lapComplete', 'medal', 'find', 'unlock', 'handbrake', 'thud', 'scrape', 'lightSwitch', 'shutter', 'gearShift', 'blowoff', 'nitroStart', 'backfire', 'sold'];
    const effects = Object.fromEntries(names.map(name => [name, ['i4', 'v8', 'v12'].every(family => bank.has(clipFor(name, family))) ? 'recorded' : 'synthesized']));
    return { clips: bank.size, loops, engines, exhausts, boost, horns, steps, effects };
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
