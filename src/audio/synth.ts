/** Small Web Audio building blocks shared by the engine, road, effects and ambience layers. */

export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export const clamp01 = (value: number): number => clamp(value, 0, 1);

export const lerp = (from: number, to: number, amount: number): number => from + (to - from) * amount;

export const rand = (min: number, max: number): number => min + Math.random() * (max - min);

/** Replaces NaN and infinities so a bad game value can never reach an AudioParam. */
export const finite = (value: number, fallback: number): number => (Number.isFinite(value) ? value : fallback);

export function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

const NOISE_SECONDS = 2;

/** The one shared white noise buffer. Every noisy layer loops it from its own random offset. */
export function createNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * NOISE_SECONDS);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** Band-limited wave from a harmonic recipe. Sine phases keep one sharp edge per cycle, like a firing pulse. */
export function harmonicWave(
  ctx: BaseAudioContext,
  harmonics: number,
  amplitude: (harmonic: number) => number,
): PeriodicWave {
  const real = new Float32Array(harmonics + 1);
  const imag = new Float32Array(harmonics + 1);
  for (let n = 1; n <= harmonics; n++) imag[n] = amplitude(n);
  return ctx.createPeriodicWave(real, imag);
}

export interface EnvelopeWave {
  wave: PeriodicWave;
  mean: number;
  swing: number;
}

/**
 * Wave that repeats an arbitrary 0..1 envelope, so one oscillator can pulse a gain in a pattern.
 * A periodic wave cannot carry its mean, so the caller rebuilds it as: mean + swing * oscillator.
 */
export function envelopeWave(ctx: BaseAudioContext, shape: ArrayLike<number>, harmonics: number): EnvelopeWave {
  const size = shape.length;
  let mean = 0;
  for (let i = 0; i < size; i++) mean += shape[i] / size;
  let swing = 0;
  for (let i = 0; i < size; i++) swing = Math.max(swing, Math.abs(shape[i] - mean));
  swing = swing || 1;
  const real = new Float32Array(harmonics + 1);
  const imag = new Float32Array(harmonics + 1);
  for (let k = 1; k <= harmonics; k++) {
    let cosine = 0;
    let sine = 0;
    for (let i = 0; i < size; i++) {
      const angle = (2 * Math.PI * k * i) / size;
      const sample = (shape[i] - mean) / swing;
      cosine += sample * Math.cos(angle);
      sine += sample * Math.sin(angle);
    }
    real[k] = (2 * cosine) / size;
    imag[k] = (2 * sine) / size;
  }
  return { wave: ctx.createPeriodicWave(real, imag), mean, swing };
}

/**
 * Soft clipping curve for a WaveShaper. `bias` makes it asymmetric, which adds the even
 * harmonics that read as exhaust grit. Silence in still gives silence out (no DC at rest).
 */
export function saturationCurve(hardness: number, bias: number, size = 1025): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(size);
  const rest = Math.tanh(hardness * bias);
  const top = Math.tanh(hardness * (1 + bias)) - rest;
  const bottom = rest - Math.tanh(hardness * (bias - 1));
  const scale = 1 / Math.max(top, bottom);
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    curve[i] = (Math.tanh(hardness * (x + bias)) - rest) * scale;
  }
  return curve;
}

/** Gain that brings filtered white noise to about the loudness of a sine of amplitude 1. */
export function noiseMakeup(ctx: BaseAudioContext, type: BiquadFilterType, frequency: number, q: number): number {
  const nyquist = ctx.sampleRate / 2;
  let band = 1.11 * frequency;
  if (type === 'bandpass') band = (Math.PI / 2) * (frequency / Math.max(q, 0.1));
  else if (type === 'highpass') band = nyquist - frequency;
  const kept = clamp(band / nyquist, 0.002, 1);
  // 0.577 is the RMS of uniform noise in -1..1, 0.707 the RMS of a unit sine.
  return 0.707 / (0.577 * Math.sqrt(kept));
}

/** Click-free envelope: linear attack, optional hold, then a release that falls about 60 dB in `release` s. */
export function envelope(
  param: AudioParam,
  at: number,
  peak: number,
  attack: number,
  hold: number,
  release: number,
): void {
  param.setValueAtTime(0, at);
  param.linearRampToValueAtTime(peak, at + attack);
  param.setTargetAtTime(0, at + attack + hold, release / 6.9);
}

/** Repeated strikes on one gain, for ratchets, wrenches and sputters without a node per strike. */
export function strikes(
  param: AudioParam,
  times: readonly number[],
  peak: (index: number) => number,
  attack: number,
  release: number,
): void {
  if (times.length === 0) return;
  param.setValueAtTime(0, times[0]);
  times.forEach((time, index) => {
    param.setTargetAtTime(peak(index), time, attack / 3);
    param.setTargetAtTime(0, time + attack, release / 6.9);
  });
}

/** Eases an AudioParam toward per-frame targets. Targets that barely moved are skipped to keep its timeline short. */
export class Glide {
  private target = Number.NaN;

  constructor(
    private readonly param: AudioParam,
    private readonly min: number,
    private readonly max: number,
  ) {}

  static gain(param: AudioParam, max = 4): Glide {
    return new Glide(param, 0, max);
  }

  static frequency(param: AudioParam): Glide {
    return new Glide(param, 0.05, 18000);
  }

  /** A zero time constant sets the value outright, for initial state. */
  to(value: number, now: number, timeConstant: number): void {
    if (!Number.isFinite(value)) return;
    const next = clamp(value, this.min, this.max);
    if (Math.abs(next - this.target) <= 1e-5 + Math.abs(next) * 5e-4) return;
    this.target = next;
    if (timeConstant > 0) this.param.setTargetAtTime(next, now, timeConstant);
    else this.param.value = next;
  }
}

/** Slow random wander in -1..1, stepped at frame rate. Cheaper than an audio-rate LFO for slow motion. */
export class Drift {
  private value = 0;
  private goal = 0;
  private wait = 0;

  constructor(private readonly period: number) {}

  step(dt: number): number {
    this.wait -= dt;
    if (this.wait <= 0) {
      this.goal = rand(-1, 1);
      this.wait = this.period * rand(0.5, 1.5);
    }
    this.value += (this.goal - this.value) * Math.min(1, (2 * dt) / this.period);
    return this.value;
  }
}

/**
 * A group of nodes that live and die together. One-shots give every source a stop time and
 * call release(); long-lived layers call end() or dispose(). Either way nothing stays connected.
 */
export class Patch {
  private readonly nodes: AudioNode[] = [];
  private readonly sources: AudioScheduledSourceNode[] = [];
  private finalSource?: AudioScheduledSourceNode;
  private finalStop = -1;

  constructor(
    readonly ctx: BaseAudioContext,
    readonly noiseBuffer: AudioBuffer,
    /** Multiplier applied to every frequency set through this patch. */
    readonly pitch = 1,
  ) {}

  /** A frequency after the patch pitch, kept inside the range oscillators and filters accept. */
  hz(frequency: number): number {
    return clamp(finite(frequency * this.pitch, 440), 0.05, 18000);
  }

  track<T extends AudioNode>(node: T): T {
    this.nodes.push(node);
    return node;
  }

  gain(value = 0): GainNode {
    const node = this.ctx.createGain();
    node.gain.value = value;
    return this.track(node);
  }

  filter(type: BiquadFilterType, frequency: number, q = 0.707): BiquadFilterNode {
    const node = this.ctx.createBiquadFilter();
    node.type = type;
    node.frequency.value = this.hz(frequency);
    node.Q.value = q;
    return this.track(node);
  }

  shaper(curve: Float32Array<ArrayBuffer>): WaveShaperNode {
    const node = this.ctx.createWaveShaper();
    node.curve = curve;
    // Keeps the added harmonics from folding back as harsh aliasing.
    node.oversample = '2x';
    return this.track(node);
  }

  /** Undefined on browsers without StereoPanner; callers then stay centred. */
  panner(pan: number): StereoPannerNode | undefined {
    if (typeof this.ctx.createStereoPanner !== 'function') return undefined;
    const node = this.ctx.createStereoPanner();
    node.pan.value = clamp(finite(pan, 0), -1, 1);
    return this.track(node);
  }

  osc(shape: OscillatorType | PeriodicWave, frequency: number, start = 0, stop?: number): OscillatorNode {
    const node = this.ctx.createOscillator();
    // PeriodicWave is an empty interface to the type checker, so narrow by hand.
    if (typeof shape === 'string') node.type = shape as OscillatorType;
    else node.setPeriodicWave(shape);
    node.frequency.value = this.hz(frequency);
    node.start(start);
    return this.own(node, stop);
  }

  noise(start = 0, stop?: number): AudioBufferSourceNode {
    const node = this.ctx.createBufferSource();
    node.buffer = this.noiseBuffer;
    node.loop = true;
    // Random offsets keep layers that share the buffer from sounding identical.
    node.start(start, Math.random() * Math.max(0, this.noiseBuffer.duration - 0.25));
    return this.own(node, stop);
  }

  /** Random control signal of roughly unit RMS, band-limited to `cutoff` Hz. */
  slowNoise(cutoff: number): GainNode {
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    // noiseMakeup targets a sine's RMS (0.707); divide to land on 1.
    const output = this.gain(noiseMakeup(this.ctx, 'lowpass', cutoff, 0.707) / 0.707);
    this.noise().connect(this.track(filter)).connect(output);
    return output;
  }

  /** When the last scheduled source stops, or -1 if none has a stop time. */
  get endsAt(): number {
    return this.finalStop;
  }

  /** For one-shots: tidy up when the source with the latest stop time ends. */
  release(done?: () => void): void {
    this.finishAfter(this.finalSource, done);
  }

  /** For long-lived patches: stop every source at `time`, then tidy up. */
  end(time: number, done?: () => void): void {
    let last: AudioScheduledSourceNode | undefined;
    for (const source of this.sources) {
      try {
        source.stop(time);
        last = source;
      } catch {
        // Already stopped; nothing to schedule.
      }
    }
    this.finishAfter(last, done);
  }

  /** Stops and disconnects right now. */
  dispose(): void {
    for (const source of this.sources) {
      try {
        source.onended = null;
        source.stop();
      } catch {
        // Already stopped.
      }
    }
    this.disconnect();
  }

  private own<T extends AudioScheduledSourceNode>(node: T, stop?: number): T {
    this.sources.push(node);
    if (stop !== undefined) {
      node.stop(stop);
      if (stop > this.finalStop) {
        this.finalStop = stop;
        this.finalSource = node;
      }
    }
    return this.track(node);
  }

  private finishAfter(source: AudioScheduledSourceNode | undefined, done?: () => void): void {
    const finish = (): void => {
      this.disconnect();
      done?.();
    };
    if (source) source.onended = finish;
    else finish();
  }

  private disconnect(): void {
    for (const node of this.nodes) {
      try {
        node.disconnect();
      } catch {
        // Never connected.
      }
    }
    this.nodes.length = 0;
    this.sources.length = 0;
  }
}
