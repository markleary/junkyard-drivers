import { afterEach, describe, expect, it } from 'vitest';
import { GameAudio, firingFrequency } from '../src/audio/audio';
import { SampledBoost, SampledEngine, findSteps, findSustain, type SampleBank } from '../src/audio/sampled';
import type { DriveAudioState, EngineFamily, EngineProfile, SfxName, SurfaceKind } from '../src/audio/audio';

const FAMILIES: EngineFamily[] = ['i4', 'v8', 'v12'];
const SURFACES: SurfaceKind[] = ['asphalt', 'gravel', 'concrete', 'grass'];
const SOUNDS: SfxName[] = [
  'click', 'open', 'close', 'buy', 'install', 'ratchet', 'paint', 'stamp', 'error',
  'enterCar', 'exitCar', 'ignition', 'shutdown', 'recover',
  'checkpoint', 'lapComplete', 'medal', 'find', 'unlock',
  'handbrake', 'thud', 'scrape', 'lightSwitch', 'shutter', 'gearShift',
  'blowoff', 'nitroStart', 'backfire', 'sold',
];
const FRAME = 1 / 60;

/** Calls the whole public surface, including values a buggy caller might send. */
function exercise(audio: GameAudio, tick: () => void = () => undefined): void {
  audio.setVolumes({ master: 0.8, sfx: 0.7 });
  audio.setVolumes({ ambience: Number.NaN, master: 7 });
  for (const [index, family] of FAMILIES.entries()) {
    // One engine on its factory exhaust, one on a sport system, one on straight-through pipes.
    audio.setEngine({ family, power: family === 'v12' ? 440 : 110, exhaust: (['stock', 'sport', 'race'] as const)[index] });
    audio.play('ignition');
    for (let frame = 0; frame < 90; frame++) {
      const rpm = frame / 89;
      const surface = SURFACES[frame % SURFACES.length];
      const throttle = frame % 30 < 20 ? 1 : 0;
      const grounded = frame % 17 !== 0;
      audio.updateDrive({ rpm, throttle, speed: rpm * 50 - 5, slip: rpm, surface, grounded, boost: rpm * throttle, nitro: frame > 40 && frame < 70 ? 1 : 0 }, FRAME);
      audio.updateAmbience({ night: rpm, indoors: 1 - rpm, wind: rpm }, FRAME);
      if (frame % 20 === 0) audio.footstep(surface, frame % 40 === 0);
      if (frame === 30) audio.horn(true);
      if (frame === 50) audio.horn(false);
      tick();
    }
    const wild = { rpm: Number.NaN, throttle: Infinity, speed: -Infinity, slip: -3, grounded: true };
    audio.updateDrive({ ...wild, surface: 'lava' as SurfaceKind }, Number.NaN);
    audio.updateDrive({ ...wild, surface: 'asphalt', boost: Number.NaN, nitro: -Infinity }, FRAME);
    audio.updateDrive({ ...wild, surface: 'asphalt', boost: 40, nitro: 9 }, FRAME);
    audio.updateAmbience({ night: Number.NaN, indoors: 9, wind: -1 }, -1);
  }
  for (const name of SOUNDS) {
    audio.play(name);
    audio.play(name, { volume: 0.4, pitch: 1.7, pan: -0.6 });
    tick();
  }
  audio.play('thud', { volume: Number.NaN, pitch: 0, pan: 99 });
  audio.play('thud', { volume: 50, pitch: -2 });
  audio.play('warp' as SfxName);
  audio.footstep('lava' as SurfaceKind, true);
  audio.click();
  audio.setEngine({ family: 'rotary' as EngineFamily, power: Number.NaN });
  audio.setEngine({ family: 'v8', power: 9000, exhaust: 'whistle' as 'race' });
  audio.setPaused(true);
  audio.horn(true);
  audio.updateDrive({ rpm: 0.5, throttle: 1, speed: 10, slip: 0, surface: 'asphalt', grounded: true }, FRAME);
  audio.setPaused(false);
  audio.muted = true;
  audio.play('click');
  audio.muted = false;
  audio.setEngine(null);
  audio.horn(false);
}

describe('firingFrequency', () => {
  it('matches the idle and redline firing rates of each engine', () => {
    expect(firingFrequency('i4', 0)).toBeCloseTo((850 / 60) * 2, 5);
    expect(firingFrequency('i4', 1)).toBeCloseTo((7200 / 60) * 2, 5);
    expect(firingFrequency('v8', 0)).toBeCloseTo((700 / 60) * 4, 5);
    expect(firingFrequency('v8', 1)).toBeCloseTo((6200 / 60) * 4, 5);
    expect(firingFrequency('v12', 0)).toBeCloseTo((950 / 60) * 6, 5);
    expect(firingFrequency('v12', 1)).toBeCloseTo((8200 / 60) * 6, 5);
    expect(firingFrequency('i4', 0.5)).toBeCloseTo((4025 / 60) * 2, 5);
  });

  it('rises with rpm, clamps outside 0..1 and survives bad input', () => {
    for (const family of FAMILIES) {
      let previous = 0;
      for (let step = 0; step <= 20; step++) {
        const frequency = firingFrequency(family, step / 20);
        expect(frequency).toBeGreaterThan(previous);
        previous = frequency;
      }
      expect(firingFrequency(family, -4)).toBe(firingFrequency(family, 0));
      expect(firingFrequency(family, 4)).toBe(firingFrequency(family, 1));
      expect(firingFrequency(family, Number.NaN)).toBe(firingFrequency(family, 0));
    }
    // More cylinders fire more often at the same point in the rev range.
    expect(firingFrequency('v12', 0.5)).toBeGreaterThan(firingFrequency('v8', 0.5));
    expect(firingFrequency('v8', 0.5)).toBeGreaterThan(firingFrequency('i4', 0.5));
    expect(Number.isFinite(firingFrequency('rotary' as EngineFamily, 0.5))).toBe(true);
  });
});

describe('GameAudio without Web Audio', () => {
  it('accepts every call silently and never reports ready', () => {
    const audio = new GameAudio();
    expect(audio.ready).toBe(false);
    expect(audio.muted).toBe(false);
    expect(() => {
      exercise(audio);
      audio.start();
      audio.start();
      exercise(audio);
      audio.dispose();
      audio.dispose();
      audio.start();
    }).not.toThrow();
    expect(audio.ready).toBe(false);
    audio.muted = true;
    expect(audio.muted).toBe(true);
  });
});

// A tiny stand-in for the Web Audio API: just enough surface to build the graph, with every
// AudioParam call checked for the values a real browser would reject or turn into noise.
const problems: string[] = [];
let automation = 0;

class FakeParam {
  target = 0;
  private current = 0;
  constructor(private readonly name: string) {}
  get value(): number {
    return this.current;
  }
  set value(next: number) {
    this.check('value', next, 0);
    this.current = this.target = next;
  }
  setValueAtTime = (value: number, time: number): this => this.check('setValueAtTime', value, time);
  linearRampToValueAtTime = (value: number, time: number): this => this.check('linearRamp', value, time);
  // A real context throws on an exponential ramp to zero or below.
  exponentialRampToValueAtTime = (value: number, time: number): this =>
    this.check('exponentialRamp', value, time, value > 0);
  setTargetAtTime = (value: number, time: number, constant: number): this =>
    this.check('setTarget', value, time, constant >= 0);
  cancelScheduledValues = (time: number): this => this.check('cancel', 0, time);
  private check(method: string, value: number, time: number, extra = true): this {
    automation += 1;
    const inRange = this.name !== 'frequency' || (value >= 0 && value <= 24000);
    if (!Number.isFinite(value) || !Number.isFinite(time) || time < 0 || !inRange || !extra) {
      problems.push(`${this.name}.${method}(${value}, ${time})`);
    }
    this.target = value;
    return this;
  }
}

interface FakeNode {
  [key: string]: unknown;
  inputs: FakeNode[];
  stopAt?: number;
  onended?: (() => void) | null;
}

class FakeContext {
  static made: FakeContext[] = [];
  currentTime = 0;
  sampleRate = 48000;
  state = 'running';
  connected = 0;
  readonly scheduled = new Set<FakeNode>();
  readonly destination = this.node();
  constructor() {
    FakeContext.made.push(this);
  }
  node(): FakeNode {
    const params = new Map<string, FakeParam>();
    let live = false;
    const node: FakeNode = {
      inputs: [],
      onended: null,
      connect: (to: FakeNode) => {
        if (!live) this.connected += 1;
        live = true;
        to.inputs?.push(proxy);
        return to;
      },
      disconnect: () => {
        if (live) this.connected -= 1;
        live = false;
      },
      start: (when = 0, offset = 0) => {
        if (!(when >= 0) || !(offset >= 0)) problems.push(`start(${when}, ${offset})`);
      },
      stop: (when = 0) => {
        if (!(when >= 0)) problems.push(`stop(${when})`);
        node.stopAt = when;
        this.scheduled.add(proxy);
      },
      setPeriodicWave: () => undefined,
    };
    const proxy: FakeNode = new Proxy(node, {
      get: (target, key) => {
        if (typeof key !== 'string' || key in target) return target[key as string];
        if (!params.has(key)) params.set(key, new FakeParam(key));
        return params.get(key);
      },
    });
    return proxy;
  }
  createGain = (): FakeNode => this.node();
  createOscillator = (): FakeNode => this.node();
  createBufferSource = (): FakeNode => this.node();
  createBiquadFilter = (): FakeNode => this.node();
  createWaveShaper = (): FakeNode => this.node();
  createStereoPanner = (): FakeNode => this.node();
  createDynamicsCompressor = (): FakeNode => this.node();
  createPeriodicWave = (real: Float32Array, imag: Float32Array): object => {
    if (![...real, ...imag].every(Number.isFinite)) problems.push('createPeriodicWave(non-finite)');
    return {};
  };
  createBuffer = (_channels: number, length: number): object => {
    const data = new Float32Array(length);
    return { duration: length / this.sampleRate, getChannelData: () => data };
  };
  resume = (): Promise<void> => Promise.resolve();
  close = (): Promise<void> => {
    this.state = 'closed';
    return Promise.resolve();
  };
  /** Moves the clock and fires `ended` on sources whose stop time has passed. */
  advance(seconds: number): void {
    this.currentTime += seconds;
    for (const node of [...this.scheduled]) {
      if ((node.stopAt ?? Infinity) > this.currentTime) continue;
      this.scheduled.delete(node);
      node.onended?.();
    }
  }
}

describe('GameAudio on a fake AudioContext', () => {
  const scope = globalThis as { AudioContext?: unknown };

  afterEach(() => {
    delete scope.AudioContext;
    FakeContext.made.length = 0;
    problems.length = 0;
  });

  it('builds one graph, sends only sane values, and frees every one-shot node', () => {
    scope.AudioContext = FakeContext;
    const audio = new GameAudio();
    audio.muted = true;
    audio.setVolumes({ master: 0.5 });
    audio.setEngine({ family: 'v8', power: 290 });
    expect(audio.ready).toBe(false);

    audio.start();
    audio.start();
    audio.start();
    expect(FakeContext.made).toHaveLength(1);
    const ctx = FakeContext.made[0];
    expect(audio.ready).toBe(true);

    // State set before start() is applied to the new graph: still muted until told otherwise.
    const master = ctx.destination.inputs[0].gain as FakeParam;
    expect(master.value).toBe(0);
    audio.muted = false;
    expect(master.target).toBeGreaterThan(0);
    audio.setVolumes({ master: 0 });
    expect(master.target).toBe(0);

    // Let night fall once so the lazily built crickets count as part of the standing graph.
    audio.setEngine(null);
    audio.updateAmbience({ night: 1, indoors: 0, wind: 0 }, FRAME);
    ctx.advance(3);
    const standing = ctx.connected;

    expect(() => exercise(audio, () => ctx.advance(FRAME))).not.toThrow();
    expect(ctx.connected).toBeGreaterThan(standing);
    ctx.advance(5);
    expect(ctx.connected).toBe(standing);
    expect(problems).toEqual([]);

    // A sleeping context must not be fed: nothing would ever consume the queued automation.
    ctx.state = 'suspended';
    expect(audio.ready).toBe(false);
    const queued = automation;
    audio.setEngine({ family: 'i4', power: 150 });
    const afterEngineStart = automation;
    for (let frame = 0; frame < 30; frame++) {
      const rpm = frame / 30;
      audio.updateDrive({ rpm, throttle: 1, speed: frame, slip: 0.5, surface: 'gravel', grounded: true }, FRAME);
      audio.updateAmbience({ night: 0, indoors: 0, wind: 0.5 }, FRAME);
      audio.play('click');
      audio.footstep('gravel', false);
    }
    expect(afterEngineStart).toBeGreaterThan(queued);
    expect(automation).toBe(afterEngineStart);
    audio.setEngine(null);
    ctx.state = 'running';

    audio.dispose();
    expect(ctx.state).toBe('closed');
    expect(audio.ready).toBe(false);
    expect(() => exercise(audio)).not.toThrow();
    expect(problems).toEqual([]);
  });

  it('stays inert when the context cannot be created', () => {
    scope.AudioContext = class {
      constructor() {
        throw new Error('blocked');
      }
    };
    const audio = new GameAudio();
    expect(() => {
      audio.start();
      exercise(audio);
    }).not.toThrow();
    expect(audio.ready).toBe(false);
  });
});

describe('recorded engine and boost voices', () => {
  afterEach(() => {
    FakeContext.made.length = 0;
    problems.length = 0;
  });

  /** A bank holding only the named clips: enough for the voices that play them. */
  const bankOf = (names: string[]) => {
    const buffers = new Map(names.map(name => [name, { name, duration: 4.8 }]));
    return { has: (...wanted: string[]) => wanted.every(name => buffers.has(name)), get: (name: string) => buffers.get(name), loopBounds: () => [0.03, 0] } as unknown as SampleBank;
  };
  const STANDARD = FAMILIES.flatMap(family => [`engine-${family}-idle`, `engine-${family}-rev`]);
  const MODIFIED = FAMILIES.flatMap(family => [`engine-${family}-sport-idle`, `engine-${family}-sport-rev`]);
  /** What a looping recording was last told: which clip it is, how loud, and how fast it plays. */
  const loop = (gain: FakeNode) => {
    const source = gain.inputs[0];
    return { clip: (source.buffer as { name: string }).name, level: (gain.gain as FakeParam).target, rate: (source.playbackRate as FakeParam).target };
  };
  const engineOn = (ctx: FakeContext, bank: SampleBank, profile: EngineProfile) => {
    const out = ctx.node(), engine = new SampledEngine(ctx as unknown as BaseAudioContext, bank, out as unknown as AudioNode, profile, 0);
    // Output gain, then the tone filter the two loops play through.
    const tone = out.inputs[0].inputs[0];
    return { engine, tone, loops: () => tone.inputs.map(loop) };
  };
  const decibels = (ratio: number) => 20 * Math.log10(ratio);

  it('plays the modified recordings for a changed exhaust, and the standard pair when one of them is missing', () => {
    const ctx = new FakeContext(), full = bankOf([...STANDARD, ...MODIFIED]);
    for (const family of FAMILIES) {
      expect(SampledEngine.available(full, family)).toBe(true);
      expect(SampledEngine.modified(full, family)).toBe(true);
      const standard = engineOn(ctx, full, { family, power: 200 });
      expect(standard.engine.source).toBe(`engine-${family}`);
      expect(standard.loops().map(item => item.clip)).toEqual([`engine-${family}-idle`, `engine-${family}-rev`]);
      for (const exhaust of ['sport', 'race'] as const) {
        const changed = engineOn(ctx, full, { family, power: 200, exhaust });
        expect(changed.engine.source).toBe(`engine-${family}-sport`);
        expect(changed.loops().map(item => item.clip)).toEqual([`engine-${family}-sport-idle`, `engine-${family}-sport-rev`]);
      }
      // Half a pair is no pair: the car keeps its standard recordings rather than mixing the two.
      const partial = bankOf([...STANDARD, `engine-${family}-sport-idle`]);
      expect(SampledEngine.modified(partial, family)).toBe(false);
      const fallback = engineOn(ctx, partial, { family, power: 200, exhaust: 'race' });
      expect(fallback.engine.source).toBe(`engine-${family}`);
      expect(fallback.loops().map(item => item.clip)).toEqual([`engine-${family}-idle`, `engine-${family}-rev`]);
    }
    expect(SampledEngine.modified(bankOf(STANDARD), 'v8')).toBe(false);
    expect(problems).toEqual([]);
  });

  it('plays a changed exhaust louder and more open at the same revs, without changing the engine speed', () => {
    const ctx = new FakeContext();
    // With the modified recordings, and without them: the part changes the sound either way.
    for (const bank of [bankOf([...STANDARD, ...MODIFIED]), bankOf(STANDARD)]) for (const family of FAMILIES) {
      const heard = (exhaust: EngineProfile['exhaust'], rpm: number, throttle: number) => {
        const { engine, tone, loops } = engineOn(ctx, bank, { family, power: 260, exhaust });
        engine.update(rpm, throttle, FRAME);
        const [idle, rev] = loops();
        return { idle, rev, open: (tone.frequency as FakeParam).target };
      };
      for (const [rpm, throttle] of [[0.8, 1], [0.35, 0.4], [0, 0]]) {
        const stock = heard('stock', rpm, throttle), sport = heard('sport', rpm, throttle), race = heard('race', rpm, throttle);
        // A sport system is a couple of decibels up, straight-through pipes about four, on both recordings.
        for (const part of ['idle', 'rev'] as const) {
          if (stock[part].level === 0) { expect(race[part].level).toBe(0); continue; }
          expect(decibels(sport[part].level / stock[part].level)).toBeGreaterThan(1.5);
          expect(decibels(sport[part].level / stock[part].level)).toBeLessThan(3.5);
          expect(decibels(race[part].level / sport[part].level)).toBeGreaterThan(1);
          expect(decibels(race[part].level / stock[part].level)).toBeLessThan(5.5);
          expect(sport[part].rate).toBe(stock[part].rate);
          expect(race[part].rate).toBe(stock[part].rate);
        }
        expect(sport.open).toBeGreaterThan(stock.open);
        expect(race.open).toBeGreaterThan(sport.open);
      }
    }
    expect(problems).toEqual([]);
  });

  it('raises the turbine whistle with boost and opens the jet only while nitrous flows', () => {
    const ctx = new FakeContext(), out = ctx.node();
    expect(SampledBoost.available(bankOf(['turbo-spool']))).toBe(false);
    const bank = bankOf(['turbo-spool', 'nitro-loop']);
    expect(SampledBoost.available(bank)).toBe(true);
    const voice = new SampledBoost(ctx as unknown as BaseAudioContext, bank, out as unknown as AudioNode);
    const state = (boost: number, nitro: number, rpm = 0.6): DriveAudioState => ({ rpm, throttle: 1, speed: 20, slip: 0, surface: 'asphalt', grounded: true, boost, nitro });
    const at = (boost: number, nitro: number, rpm?: number) => { voice.update(state(boost, nitro, rpm), FRAME); return out.inputs.map(loop); };
    let [spool, jet] = at(0, 0);
    expect([spool.clip, jet.clip]).toEqual(['turbo-spool', 'nitro-loop']);
    expect([spool.level, jet.level]).toEqual([0, 0]);
    for (const boost of [0.25, 0.5, 0.75, 1]) {
      const [next] = at(boost, 0);
      expect(next.level).toBeGreaterThan(spool.level);
      expect(next.rate).toBeGreaterThan(spool.rate);
      spool = next;
    }
    // On full boost the turbine still follows the engine up the rev range.
    expect(at(1, 0, 1)[0].rate).toBeGreaterThan(at(1, 0, 0.2)[0].rate);
    [spool, jet] = at(0.4, 1);
    expect(jet.level).toBeGreaterThan(0);
    expect(at(0.4, 0)[1].level).toBe(0);
    // A car with neither part reports nothing at all, and a buggy caller cannot push the levels anywhere odd.
    voice.update({ rpm: 0.5, throttle: 1, speed: 20, slip: 0, surface: 'asphalt', grounded: true }, FRAME);
    expect(out.inputs.map(loop).map(item => item.level)).toEqual([0, 0]);
    for (const [boost, nitro] of [[Number.NaN, Infinity], [-3, -1], [40, 9]]) for (const item of at(boost, nitro, Number.NaN)) {
      expect(item.level).toBeGreaterThanOrEqual(0);
      expect(item.level).toBeLessThanOrEqual(1);
      expect(item.rate).toBeGreaterThan(0.3);
      expect(item.rate).toBeLessThan(3);
    }
    voice.silence();
    expect(out.inputs.map(loop).map(item => item.level)).toEqual([0, 0]);
    voice.dispose();
    expect(problems).toEqual([]);
  });
});

describe('recorded clips', () => {
  const RATE = 8000;
  /** Deterministic hiss, so the test never depends on the random seed. */
  const hiss = (index: number) => ((Math.sin(index * 12.9898) * 43758.5453) % 1) * 2;

  it('cuts a recorded walk into one slice per footfall and evens out their loudness', () => {
    const data = new Float32Array(RATE * 4);
    for (let i = 0; i < data.length; i++) data[i] = hiss(i) * .002;
    const onsets = [.3, .82, 1.36, 1.9, 2.45, 3.0, 3.52];
    onsets.forEach((onset, step) => {
      const level = step % 2 ? .12 : .3;
      for (let i = 0; i < RATE * .12; i++) data[Math.floor(onset * RATE) + i] += hiss(i + step * 977) * level * Math.exp(-i / (RATE * .03));
    });
    const steps = findSteps(data, RATE);
    expect(steps).toHaveLength(onsets.length);
    steps.forEach((slice, step) => {
      // Each slice starts just ahead of its footfall and ends before the next one.
      expect(slice.start).toBeLessThanOrEqual(onsets[step]);
      expect(slice.start).toBeGreaterThan(onsets[step] - .06);
      expect(slice.length).toBeGreaterThan(.1);
      expect(slice.start + slice.length).toBeLessThanOrEqual(step + 1 < onsets.length ? onsets[step + 1] : 4);
    });
    // The quiet footfalls are turned up to meet the loud ones.
    expect(steps[1].gain).toBeGreaterThan(steps[0].gain * 1.8);
    expect(findSteps(new Float32Array(RATE), RATE)).toEqual([]);
    expect(findSteps(new Float32Array(100), RATE)).toEqual([]);
  });

  it('finds a whole number of cycles to repeat in the steady part of a held note', () => {
    const frequency = 400, data = new Float32Array(RATE * .6);
    for (let i = 0; i < data.length; i++) {
      const t = i / RATE, envelope = Math.min(1, t / .02) * (t > .45 ? Math.max(0, 1 - (t - .45) / .05) : 1);
      data[i] = Math.sin(2 * Math.PI * frequency * t) * .5 * envelope;
    }
    const loop = findSustain(data, RATE)!;
    expect(loop).not.toBeNull();
    expect(loop.start / RATE).toBeGreaterThan(.05);
    expect(loop.end / RATE).toBeLessThan(.45);
    expect(loop.end).toBeGreaterThan(loop.start + RATE * .04);
    expect(loop.start).toBeGreaterThanOrEqual(loop.fade);
    const cycles = (loop.end - loop.start) * frequency / RATE;
    expect(Math.abs(cycles - Math.round(cycles))).toBeLessThan(.02);
    expect(findSustain(new Float32Array(RATE), RATE)).toBeNull();
    // Too short to hold: stays a one-shot.
    expect(findSustain(data.slice(0, RATE * .08), RATE)).toBeNull();
  });
});
