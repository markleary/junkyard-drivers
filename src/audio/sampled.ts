/**
 * Recorded layers. The clips in `./samples` are bundled with the game and
 * decoded once after the first click; nothing is fetched from anywhere else.
 * Every layer here has a synthesized stand-in, so a clip that fails to load
 * or decode simply leaves that sound on the synthesizer.
 */
import { clamp, clamp01, finite, rand, smoothstep } from './synth';
import type { AmbienceState, DriveAudioState, EngineFamily, EngineProfile, SfxName, SfxOptions, SurfaceKind } from './types';

const files = import.meta.glob('./samples/*.mp3', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const URLS = new Map(Object.entries(files).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -4), url]));

interface Clip {
  /** Playback level, so a horn and a paper rustle sit sensibly together. */
  level: number;
  /** Minimum seconds between two triggers; closer calls merge into one. */
  gap?: number;
  /** Seconds to skip at the head of the recording. */
  offset?: number;
  /** Fraction of the clip, from the end, that fades out under whatever follows it. */
  tail?: number;
}

const CLIPS: Record<string, Clip> = {
  click: { level: .5, gap: .04 }, open: { level: .5 }, close: { level: .5 }, buy: { level: .85, gap: .2 }, error: { level: .6, gap: .15 },
  install: { level: .55, gap: .25 }, ratchet: { level: .7, gap: .25 }, paint: { level: .5, gap: .25 }, stamp: { level: .7, gap: .15 },
  'enter-car': { level: .7 }, 'exit-car': { level: .55 }, shutdown: { level: .3, offset: .45 },
  // The starter recordings run on into a steady idle; that part fades under the looping engine.
  'ignition-i4': { level: .6, gap: .6, tail: .45 }, 'ignition-v8': { level: .62, gap: .6, tail: .45 }, 'ignition-v12': { level: .6, gap: .6, tail: .45 },
  handbrake: { level: .6, gap: .2 }, 'gear-shift': { level: .45, gap: .15 }, 'light-switch': { level: .9 },
  thud: { level: .9, gap: .14 }, scrape: { level: .5, gap: .3 }, recover: { level: .5, gap: .3 }, shutter: { level: .7, gap: .1 },
  checkpoint: { level: .55, gap: .2 }, 'lap-complete': { level: .5, gap: .5 }, medal: { level: .5, gap: .5 }, find: { level: .6, gap: .2 }, unlock: { level: .5, gap: .3 },
};

const FILE: Partial<Record<SfxName, string>> = { enterCar: 'enter-car', exitCar: 'exit-car', lapComplete: 'lap-complete', lightSwitch: 'light-switch', gearShift: 'gear-shift' };
const FAMILIES: EngineFamily[] = ['i4', 'v8', 'v12'];
const TIME = .07;

/** The recording that plays for a named effect in the given car. */
export function clipFor(name: SfxName, family: EngineFamily | null): string {
  if (name === 'ignition') return `ignition-${family ?? 'i4'}`;
  return Object.hasOwn(FILE, name) ? FILE[name]! : String(name);
}

/** How far into an ignition recording the looping engine takes over, as a fraction of its length. */
export const SAMPLED_CATCH = .5;

export class SampleBank {
  private buffers = new Map<string, AudioBuffer>();
  private bounds = new Map<string, [number, number]>();
  private lastAt = new Map<string, number>();
  /** True once every clip has either decoded or been given up on. */
  settled = false;

  constructor(private ctx: BaseAudioContext, onSettled: () => void = () => undefined) {
    // Unit tests run without a page; there is nothing to fetch from.
    if (typeof document === 'undefined' || typeof fetch !== 'function' || !URLS.size) { this.settled = true; return; }
    const jobs = [...URLS].map(async ([name, url]) => {
      try {
        const response = await fetch(url);
        if (!response.ok) return;
        const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
        this.buffers.set(name, buffer);
        this.bounds.set(name, LOOPED.test(name) ? sealLoop(buffer) : trimSilence(buffer));
      } catch {
        // This clip stays on the synthesizer.
      }
    });
    void Promise.all(jobs).then(() => { this.settled = true; onSettled(); }).catch(() => undefined);
  }

  get size() { return this.buffers.size; }
  get(name: string) { return this.buffers.get(name); }
  has(...names: string[]) { return names.every(name => this.buffers.has(name)); }
  loopBounds(name: string): [number, number] { return this.bounds.get(name) ?? [0, 0]; }
  /** Playing length in seconds, after the skipped head. Zero when the clip is missing. */
  duration(name: string) { return Math.max(0, (this.buffers.get(name)?.duration ?? 0) - (CLIPS[name]?.offset ?? 0)); }

  /** Play a one-shot. Returns its start time, or -1 if the clip is not available. */
  play(name: string, destination: AudioNode, options: SfxOptions = {}): number {
    const buffer = this.buffers.get(name);
    if (!buffer) return -1;
    const ctx = this.ctx, now = ctx.currentTime, clip = CLIPS[name] ?? { level: .6 };
    const volume = clamp(finite(options.volume ?? 1, 1), 0, 1.5);
    const last = this.lastAt.get(name);
    // Too soon after the last one, or silent: handled, with nothing new to play.
    if (volume <= 0 || (last !== undefined && now - last < (clip.gap ?? .07))) return now;
    this.lastAt.set(name, now);
    const source = ctx.createBufferSource(), gain = ctx.createGain();
    source.buffer = buffer;
    // A few percent of pitch drift keeps repeats from sounding stamped out.
    const rate = clamp(finite(options.pitch ?? 1, 1), .25, 4) * rand(.97, 1.03);
    source.playbackRate.value = rate;
    const level = clip.level * volume, offset = Math.min(clip.offset ?? 0, buffer.duration * .9);
    gain.gain.value = level;
    if (clip.tail) {
      const end = now + (buffer.duration - offset) / rate;
      gain.gain.setValueAtTime(level, end - (buffer.duration * clip.tail) / rate);
      gain.gain.linearRampToValueAtTime(0, end);
    }
    let tail: AudioNode = gain;
    const pan = clamp(finite(options.pan ?? 0, 0), -1, 1);
    if (pan !== 0 && typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      gain.connect(panner);
      tail = panner;
    }
    source.connect(gain);
    tail.connect(destination);
    source.onended = () => { try { source.disconnect(); gain.disconnect(); if (tail !== gain) tail.disconnect(); } catch { /* Already gone. */ } };
    source.start(now, offset);
    return now;
  }
}

/** Some decoders leave encoder padding at the ends; a loop must skip it or it ticks. */
function trimSilence(buffer: AudioBuffer): [number, number] {
  try {
    const data = buffer.getChannelData(0), limit = Math.min(data.length, Math.floor(buffer.sampleRate * .12));
    let start = 0, end = 0;
    while (start < limit && Math.abs(data[start]) < 2e-4) start++;
    while (end < limit && Math.abs(data[data.length - 1 - end]) < 2e-4) end++;
    return [start / buffer.sampleRate, end / buffer.sampleRate];
  } catch { return [0, 0]; }
}

/** Clips that play end to end without a gap: beds, tires, wind and engines. */
const LOOPED = /^(amb|roll|engine)-|^(skid|wind)$/;

/**
 * Make a loop's seam exact after decoding. Lossy encoding can leave a small step where the end
 * meets the start; here the last few hundredths of a second blend into the lead-in to the loop
 * start, in place, so the wrap is continuous whatever the decoder did. Returns the trimmed bounds.
 */
function sealLoop(buffer: AudioBuffer): [number, number] {
  const [lead, trail] = trimSilence(buffer), rate = buffer.sampleRate;
  try {
    const from = Math.round(lead * rate), end = buffer.length - Math.round(trail * rate), fade = Math.floor(rate * .03);
    if (end - from < fade * 8) return [lead, trail];
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < fade; i++) {
        const t = (i + 1) / fade * Math.PI / 2;
        data[end - fade + i] = data[end - fade + i] * Math.cos(t) + data[from + i] * Math.sin(t);
      }
    }
    return [lead + fade / rate, trail];
  } catch { return [lead, trail]; }
}

/** Loudness of a recording in ten millisecond steps. */
function envelopeOf(data: Float32Array, hop: number): number[] {
  const env: number[] = [];
  for (let i = 0; i + hop <= data.length; i += hop) {
    let sum = 0;
    for (let j = 0; j < hop; j++) sum += data[i + j] * data[i + j];
    env.push(Math.sqrt(sum / hop));
  }
  return env;
}

/** One continuously looping clip with smoothed level and speed. */
class Loop {
  private source: AudioBufferSourceNode;
  private gain: GainNode;

  constructor(private ctx: BaseAudioContext, bank: SampleBank, name: string, destination: AudioNode, phase = Math.random()) {
    const buffer = bank.get(name)!, [lead, trail] = bank.loopBounds(name);
    this.source = ctx.createBufferSource();
    this.source.buffer = buffer;
    this.source.loop = true;
    this.source.loopStart = lead;
    this.source.loopEnd = buffer.duration - trail;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.source.connect(this.gain).connect(destination);
    // Start part way in, so two loops of the same clip never line up.
    this.source.start(0, lead + clamp01(phase) * Math.max(.01, buffer.duration - lead - trail - .05));
  }

  set(level: number, rate = 1, time = TIME) {
    const now = this.ctx.currentTime;
    this.gain.gain.setTargetAtTime(clamp(finite(level, 0), 0, 2), now, time);
    this.source.playbackRate.setTargetAtTime(clamp(finite(rate, 1), .3, 3), now, time);
  }

  dispose() {
    try { this.source.stop(); } catch { /* Never started. */ }
    try { this.source.disconnect(); this.gain.disconnect(); } catch { /* Already gone. */ }
  }
}

/** The engine voice built from two recordings: an idle and a held high rev, crossed over and pitched by engine speed. */
export class SampledEngine {
  private idle: Loop;
  private rev: Loop;
  private tone: BiquadFilterNode;
  private out: GainNode;
  private level: number;
  private stopped = false;

  static available(bank: SampleBank, family: EngineFamily) { return bank.has(`engine-${family}-idle`, `engine-${family}-rev`); }

  constructor(private ctx: BaseAudioContext, bank: SampleBank, destination: AudioNode, profile: EngineProfile, startAt: number) {
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 2400;
    this.tone.Q.value = .4;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.tone.connect(this.out).connect(destination);
    this.idle = new Loop(ctx, bank, `engine-${profile.family}-idle`, this.tone);
    this.rev = new Loop(ctx, bank, `engine-${profile.family}-rev`, this.tone);
    // More power: a little louder and fuller.
    this.level = .62 + clamp01((profile.power - 100) / 340) * .3;
    this.out.gain.setTargetAtTime(1, Math.max(ctx.currentTime, startAt), .22);
  }

  update(rpm: number, throttle: number, _dt: number) {
    if (this.stopped) return;
    const r = clamp01(finite(rpm, 0)), load = clamp01(finite(throttle, 0));
    const cross = smoothstep(.1, .46, r);
    // Off the throttle the note falls back and darkens: engine braking. The idle recording never
    // leaves entirely: pitched up under the rev recording, it keeps the firing pulse and the low end.
    this.idle.set(this.level * (1 - cross * .7) * (.6 + load * .25), 1 + r * 1.7);
    this.rev.set(this.level * cross * (.34 + load * .66), .52 + r * .8);
    this.tone.frequency.setTargetAtTime(700 + 6300 * (.22 + .78 * load) * (.3 + .7 * r), this.ctx.currentTime, .09);
  }

  /** Stay silent until the starter has finished cranking. */
  hold(time: number) {
    if (this.stopped) return;
    const now = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setValueAtTime(0, now);
    this.out.gain.setTargetAtTime(1, Math.max(now, time), .25);
  }

  stop(quick = false) {
    if (this.stopped) return;
    this.stopped = true;
    const now = this.ctx.currentTime, fade = quick ? .03 : .16;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setTargetAtTime(0, now, fade);
    setTimeout(() => {
      this.idle.dispose(); this.rev.dispose();
      try { this.tone.disconnect(); this.out.disconnect(); } catch { /* Already gone. */ }
    }, quick ? 150 : 900);
  }
}

/** Tires, the squeal of a slide, and the rush of air, from recordings. */
export class SampledRoad {
  private asphalt: Loop;
  private gravel: Loop;
  private skid: Loop;
  private wind: Loop;
  private soften: BiquadFilterNode;

  static available(bank: SampleBank) { return bank.has('roll-asphalt', 'roll-gravel', 'skid', 'wind'); }

  constructor(private ctx: BaseAudioContext, bank: SampleBank, destination: AudioNode) {
    // Grass muffles the same loose-surface recording.
    this.soften = ctx.createBiquadFilter();
    this.soften.type = 'lowpass';
    this.soften.frequency.value = 9000;
    this.soften.connect(destination);
    this.asphalt = new Loop(ctx, bank, 'roll-asphalt', destination);
    this.gravel = new Loop(ctx, bank, 'roll-gravel', this.soften);
    this.skid = new Loop(ctx, bank, 'skid', destination);
    this.wind = new Loop(ctx, bank, 'wind', destination);
  }

  update(state: DriveAudioState, _dt: number) {
    const speed = Math.min(90, Math.abs(finite(state.speed, 0))), slip = clamp01(finite(state.slip, 0));
    const rolling = state.grounded ? Math.pow(clamp01(speed / 24), .8) : 0;
    const loose = state.surface === 'gravel' || state.surface === 'grass';
    this.asphalt.set(loose ? 0 : rolling * .5, (state.surface === 'concrete' ? .78 : .72) + speed / 42);
    this.gravel.set(loose ? (rolling * .8 + slip * .35 * Math.min(1, speed / 5)) * (state.surface === 'grass' ? .5 : 1) : 0, .8 + speed / 46);
    this.soften.frequency.setTargetAtTime(state.surface === 'grass' ? 1700 : 9000, this.ctx.currentTime, .1);
    this.skid.set(state.grounded && !loose ? Math.pow(slip, 1.3) * .8 : 0, .86 + slip * .2 + speed / 130);
    this.wind.set(Math.pow(clamp01(speed / 38), 1.6) * .55, .85 + speed / 90);
  }

  silence() {
    for (const loop of [this.asphalt, this.gravel, this.skid, this.wind]) loop.set(0, 1, .12);
  }

  dispose() {
    for (const loop of [this.asphalt, this.gravel, this.skid, this.wind]) loop.dispose();
    try { this.soften.disconnect(); } catch { /* Already gone. */ }
  }
}

/** Day birds, night crickets, the workshop's room tone, and wind through the scrap rows. */
export class SampledAmbience {
  private day: Loop;
  private night: Loop;
  private room: Loop;
  private yard: Loop;

  static available(bank: SampleBank) { return bank.has('amb-day', 'amb-night', 'amb-garage', 'amb-yard'); }

  constructor(ctx: BaseAudioContext, bank: SampleBank, destination: AudioNode) {
    this.day = new Loop(ctx, bank, 'amb-day', destination);
    this.night = new Loop(ctx, bank, 'amb-night', destination);
    this.room = new Loop(ctx, bank, 'amb-garage', destination);
    this.yard = new Loop(ctx, bank, 'amb-yard', destination);
  }

  update(state: AmbienceState, _dt: number, quiet: boolean) {
    const dark = clamp01(finite(state.night, 0)), inside = clamp01(finite(state.indoors, 0)), yard = clamp01(finite(state.yard ?? 0, 0));
    const outside = quiet ? 0 : 1 - inside * .82;
    this.day.set((1 - dark) * outside * .7, 1, .5);
    this.night.set(dark * outside * .55, 1, .5);
    this.room.set(quiet ? 0 : inside * .4, 1, .5);
    this.yard.set(yard * outside * (.3 + .25 * (1 - dark)), 1, .7);
  }

  dispose() {
    for (const loop of [this.day, this.night, this.room, this.yard]) loop.dispose();
  }
}

export interface Slice { start: number; length: number; gain: number }

/**
 * Cut a recorded walk into single footfalls: the loudest moments at least a
 * third of a second apart, each from where it rises out of the background.
 */
export function findSteps(data: Float32Array, rate: number): Slice[] {
  const hop = Math.max(1, Math.floor(rate * .01)), env = envelopeOf(data, hop);
  if (env.length < 40) return [];
  const smooth = env.map((value, i) => (env[i - 1] ?? value) * .25 + value * .5 + (env[i + 1] ?? value) * .25);
  const floor = [...smooth].sort((a, b) => a - b)[Math.floor(smooth.length * .4)];
  const threshold = Math.max(floor * 1.9, 1e-4);
  const peaks: number[] = [];
  for (let i = 1; i < smooth.length - 1; i++) if (smooth[i] > threshold && smooth[i] >= smooth[i - 1] && smooth[i] > smooth[i + 1]) peaks.push(i);
  const kept: number[] = [];
  for (const peak of peaks.sort((a, b) => smooth[b] - smooth[a])) if (kept.every(other => Math.abs(other - peak) > 32)) kept.push(peak);
  kept.sort((a, b) => a - b);
  const onsets = kept.map(peak => {
    let i = peak;
    while (i > 0 && peak - i < 14 && smooth[i - 1] > threshold * .7) i--;
    return Math.max(0, i - 2);
  });
  return kept.map((peak, index) => {
    const start = onsets[index], limit = index + 1 < onsets.length ? onsets[index + 1] - 2 : smooth.length;
    const end = Math.min(start + 40, Math.max(start + 12, limit), smooth.length);
    // Even out the walk: every footfall plays at about the same loudness.
    return { start: start * hop / rate, length: (end - start) * hop / rate, gain: clamp(.085 / smooth[peak], .3, 5) };
  });
}

/** Footsteps cut from recorded walks, one footfall per stride, so they stay in time with the player. */
export class SampledSteps {
  private slices = new Map<string, { buffer: AudioBuffer; steps: Slice[] }>();
  private last = -1;
  private foot = 1;

  constructor(private ctx: BaseAudioContext, bank: SampleBank) {
    for (const kind of ['gravel', 'hard', 'grass']) {
      const buffer = bank.get(`steps-${kind}`);
      if (!buffer) continue;
      try {
        const steps = findSteps(buffer.getChannelData(0), buffer.sampleRate);
        if (steps.length >= 2) this.slices.set(kind, { buffer, steps });
      } catch { /* This surface stays on the synthesizer. */ }
    }
  }

  /** Returns false when there is no recording for the surface. */
  play(surface: SurfaceKind, running: boolean, destination: AudioNode): boolean {
    const walk = this.slices.get(surface === 'gravel' ? 'gravel' : surface === 'grass' ? 'grass' : 'hard');
    if (!walk) return false;
    const ctx = this.ctx, now = ctx.currentTime;
    let index = Math.floor(Math.random() * walk.steps.length);
    if (index === this.last) index = (index + 1) % walk.steps.length;
    this.last = index;
    this.foot = -this.foot;
    const slice = walk.steps[index], rate = rand(.94, 1.06) * (running ? 1.07 : 1) * (surface === 'concrete' ? 1.05 : 1);
    const level = .5 * slice.gain * (running ? 1.25 : 1) * rand(.8, 1.05), real = slice.length / rate;
    const source = ctx.createBufferSource(), gain = ctx.createGain();
    source.buffer = walk.buffer;
    source.playbackRate.value = rate;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(level, now + .006);
    gain.gain.setValueAtTime(level, now + real * .6);
    gain.gain.linearRampToValueAtTime(0, now + real);
    let tail: AudioNode = gain;
    if (typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner();
      panner.pan.value = this.foot * .12;
      gain.connect(panner);
      tail = panner;
    }
    source.connect(gain);
    tail.connect(destination);
    source.onended = () => { try { source.disconnect(); gain.disconnect(); if (tail !== gain) tail.disconnect(); } catch { /* Already gone. */ } };
    source.start(now, slice.start, slice.length);
    return true;
  }
}

export interface SustainLoop { start: number; end: number; fade: number }

/**
 * Find the steady middle of a held note and where it can repeat without a
 * click: the loop ends where the waveform best matches its start. Times are in
 * samples; `fade` is how much of the loop's end should blend into the lead-in.
 */
export function findSustain(data: Float32Array, rate: number): SustainLoop | null {
  const hop = Math.max(1, Math.floor(rate * .01)), env = envelopeOf(data, hop);
  let top = 0;
  for (const value of env) top = Math.max(top, value);
  if (!(top > 0)) return null;
  const first = env.findIndex(value => value > top * .5);
  let last = env.length - 1;
  while (last > first && env[last] <= top * .5) last--;
  const from = first * hop, to = (last + 1) * hop, span = to - from;
  const window = Math.floor(rate * .02), fade = Math.floor(rate * .02);
  if (first < 0 || span < rate * .14) return null;
  const start = Math.max(fade, from + Math.floor(span * .3));
  let end = -1, best = Infinity;
  for (let i = from + Math.floor(span * .6); i < to - window - fade; i++) {
    let error = 0;
    for (let j = 0; j < window; j += 2) { const d = data[start + j] - data[i + j]; error += d * d; }
    if (error < best) { best = error; end = i; }
  }
  return end < start + rate * .04 ? null : { start, end, fade };
}

/** A recorded horn for each car, held for as long as the button is down. */
export class SampledHorn {
  private loops = new Map<EngineFamily, { buffer: AudioBuffer; start: number; end: number }>();
  private sounding?: { source: AudioBufferSourceNode; gain: GainNode };

  constructor(private ctx: BaseAudioContext, bank: SampleBank, private destination: AudioNode) {
    for (const family of FAMILIES) {
      const buffer = bank.get(`horn-${family}`);
      if (!buffer) continue;
      try {
        const loop = findSustain(buffer.getChannelData(0), buffer.sampleRate);
        if (!loop) continue;
        // Blend the last few milliseconds of the loop into the lead-in to its start.
        const copy = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
          const source = buffer.getChannelData(channel), target = copy.getChannelData(channel);
          target.set(source);
          for (let i = 0; i < loop.fade; i++) {
            const t = i / loop.fade;
            target[loop.end - loop.fade + i] = source[loop.end - loop.fade + i] * (1 - t) + source[loop.start - loop.fade + i] * t;
          }
        }
        this.loops.set(family, { buffer: copy, start: loop.start / buffer.sampleRate, end: loop.end / buffer.sampleRate });
      } catch { /* This horn stays on the synthesizer. */ }
    }
  }

  /** Returns true when a recorded horn is now sounding. */
  set(on: boolean, family: EngineFamily | null): boolean {
    const now = this.ctx.currentTime;
    if (!on) { this.release(now); return false; }
    if (this.sounding) return true;
    const loop = family ? this.loops.get(family) : undefined;
    if (!loop) return false;
    const source = this.ctx.createBufferSource(), gain = this.ctx.createGain();
    source.buffer = loop.buffer;
    source.loop = true;
    source.loopStart = loop.start;
    source.loopEnd = loop.end;
    gain.gain.value = family === 'v12' ? .42 : .3;
    source.connect(gain).connect(this.destination);
    source.start(now);
    this.sounding = { source, gain };
    return true;
  }

  private release(now: number) {
    const sounding = this.sounding;
    if (!sounding) return;
    this.sounding = undefined;
    sounding.gain.gain.cancelScheduledValues(now);
    sounding.gain.gain.setTargetAtTime(0, now, .03);
    sounding.source.onended = () => { try { sounding.source.disconnect(); sounding.gain.disconnect(); } catch { /* Already gone. */ } };
    try { sounding.source.stop(now + .25); } catch { /* Already stopped. */ }
  }

  dispose() { this.release(this.ctx.currentTime); }
}
