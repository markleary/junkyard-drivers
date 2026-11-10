/**
 * The engine voice. A stack of oscillators locked to the firing frequency runs through a
 * saturator, fixed exhaust resonances and a lowpass that opens with rpm and throttle.
 * One long-lived graph per running engine; every frame only moves parameters.
 */
import type { EngineFamily, EngineProfile } from './types';
import {
  Drift,
  Glide,
  Patch,
  clamp,
  clamp01,
  finite,
  harmonicWave,
  lerp,
  rand,
  saturationCurve,
  smoothstep,
} from './synth';

type WaveName = 'buzz' | 'hollow' | 'body' | 'thin' | 'rumble' | 'lope' | 'silk' | 'soft' | 'bright';

interface WaveRecipe {
  harmonics: number;
  amplitude: (harmonic: number) => number;
}

const WAVES: Record<WaveName, WaveRecipe> = {
  // Saw with lifted even harmonics: the nasal four cylinder buzz.
  buzz: { harmonics: 48, amplitude: (n) => (n % 2 === 0 ? 1.25 : 1) / n },
  // Mostly odd harmonics, a hollow reed on top of the buzz.
  hollow: { harmonics: 20, amplitude: (n) => (n % 2 === 1 ? 1 : 0.25) / n ** 1.2 },
  // Nearly a sine: weight without extra edge.
  body: { harmonics: 10, amplitude: (n) => 1 / n ** 1.8 },
  thin: { harmonics: 10, amplitude: (n) => 1 / n ** 1.4 },
  // Half-order stack with the firing order pushed forward.
  rumble: { harmonics: 48, amplitude: (n) => (n === 2 ? 1.5 : n === 3 ? 1.2 : 1) / n ** 1.05 },
  // Weak fundamental, strong overtones: heard as separate thumps at idle.
  lope: { harmonics: 40, amplitude: (n) => (n === 1 ? 0.3 : 1) / n ** 0.9 },
  // Dense series for the twelve: firing-order multiples forward, half orders as a soft fill.
  silk: { harmonics: 40, amplitude: (n) => (n % 2 === 0 ? 1.6 : n === 1 ? 0.3 : 0.55) / n },
  soft: { harmonics: 24, amplitude: (n) => 1 / n ** 1.2 },
  // Slow rolloff: the overtones that turn a hum into a wail.
  bright: { harmonics: 16, amplitude: (n) => 1 / n ** 0.9 },
};

const waveCache = new WeakMap<BaseAudioContext, Map<WaveName, PeriodicWave>>();

function waveFor(ctx: BaseAudioContext, name: WaveName): PeriodicWave {
  let waves = waveCache.get(ctx);
  if (!waves) {
    waves = new Map();
    waveCache.set(ctx, waves);
  }
  let wave = waves.get(name);
  if (!wave) {
    wave = harmonicWave(ctx, WAVES[name].harmonics, WAVES[name].amplitude);
    waves.set(name, wave);
  }
  return wave;
}

interface PartialSpec {
  /** Frequency as a multiple of the firing frequency. Partials stay phase locked, like real engine orders. */
  ratio: number;
  wave: WaveName;
  /** Mix level at idle and at redline, plus the extra share at full throttle. */
  idle: number;
  redline: number;
  load: number;
}

interface LopeSpec {
  /** Amplitude modulation rate as a multiple of the firing frequency. */
  ratio: number;
  idle: number;
  redline: number;
  /** Extra depth when coasting down at speed. */
  overrun: number;
}

type Gains = readonly [idle: number, mid: number, redline: number];

/** Piecewise-linear curve through the values at idle, mid range and redline. */
function across(gains: Gains, revs: number): number {
  return revs < 0.5 ? lerp(gains[0], gains[1], revs * 2) : lerp(gains[1], gains[2], revs * 2 - 1);
}

interface FamilySpec {
  idleRpm: number;
  redlineRpm: number;
  firingsPerRev: number;
  partials: PartialSpec[];
  lopes: LopeSpec[];
  /** Random cycle-to-cycle loudness variation. */
  roughness: number;
  /** Idle pitch hunting, as a fraction of frequency. */
  wander: number;
  /** Saturator asymmetry: more means more even harmonics and a rougher edge. */
  bias: number;
  /** Highpass corner. Sets how much true sub-bass the engine carries. */
  floor: number;
  drive: { idle: number; rpm: number; load: number };
  /** Exhaust and body resonances. They stay put while the harmonics sweep through them. */
  formants: { frequency: number; q: number; gain: number }[];
  /** Lowpass that opens with rpm and throttle. */
  cutoff: { idle: number; rpm: number; load: number; loadRpm: number; max: number };
  /** Fixed ceiling that keeps the top end from turning harsh. */
  ceiling: number;
  /** Noise: `grit` goes through the saturator with the tone, `air` is clean intake hiss. */
  breath: {
    from: number;
    to: number;
    q: number;
    grit: number;
    gritLoad: number;
    rasp: number;
    air: number;
    airLoad: number;
  };
  /**
   * Noise let through in time with one partial, so every exhaust pulse carries a breath.
   * This is most of what a small speaker reproduces of an idle.
   */
  chuff: { partial: number; frequency: number; idle: number; redline: number };
  /** Resonant band that climbs with rpm (the V12 wail). */
  wail?: { from: number; to: number; q: number; idle: number; redline: number };
  /**
   * Output gain at idle, mid range and redline, off and on the throttle. The saturator and
   * filters change loudness on their own, so these come from measuring the rendered output.
   */
  loudness: { coast: Gains; pull: Gains };
  /** Throttle response in seconds, opening and closing. */
  attack: number;
  release: number;
  /** Brightness and level kick when the throttle snaps open. */
  bark: number;
  /** Level of the pops when lifting off at speed. Zero disables them. */
  crackle: number;
}

const FAMILIES: Record<EngineFamily, FamilySpec> = {
  i4: {
    idleRpm: 850,
    redlineRpm: 7200,
    firingsPerRev: 2,
    partials: [
      { ratio: 1, wave: 'buzz', idle: 0.62, redline: 0.5, load: 0.15 },
      { ratio: 2, wave: 'hollow', idle: 0.14, redline: 0.3, load: 0.35 },
      { ratio: 0.5, wave: 'body', idle: 0.2, redline: 0.1, load: 0 },
      { ratio: 4, wave: 'thin', idle: 0, redline: 0.14, load: 0.8 },
    ],
    lopes: [
      { ratio: 0.25, idle: 0.09, redline: 0.02, overrun: 0.03 },
      { ratio: 0.5, idle: 0.06, redline: 0.02, overrun: 0.02 },
    ],
    roughness: 0.05,
    wander: 0.012,
    bias: 0.2,
    floor: 62,
    drive: { idle: 0.3, rpm: 0.05, load: 0.32 },
    formants: [
      { frequency: 170, q: 1.4, gain: 5 },
      { frequency: 1250, q: 1.3, gain: 4 },
    ],
    cutoff: { idle: 620, rpm: 1600, load: 500, loadRpm: 1600, max: 4200 },
    ceiling: 4400,
    breath: { from: 1400, to: 3200, q: 0.7, grit: 0.05, gritLoad: 0.2, rasp: 0.22, air: 0.01, airLoad: 0.05 },
    chuff: { partial: 0, frequency: 650, idle: 2, redline: 0.3 },
    loudness: { coast: [0.102, 0.069, 0.061], pull: [0.092, 0.07, 0.066] },
    attack: 0.07,
    release: 0.14,
    bark: 0.25,
    crackle: 0,
  },
  v8: {
    idleRpm: 700,
    redlineRpm: 6200,
    firingsPerRev: 4,
    partials: [
      { ratio: 0.5, wave: 'rumble', idle: 0.56, redline: 0.6, load: 0 },
      { ratio: 1, wave: 'soft', idle: 0.34, redline: 0.36, load: 0.3 },
      { ratio: 0.25, wave: 'lope', idle: 0.26, redline: 0.06, load: 0 },
      { ratio: 1.5, wave: 'thin', idle: 0, redline: 0.14, load: 0.9 },
    ],
    lopes: [
      { ratio: 0.25, idle: 0.2, redline: 0.07, overrun: 0.12 },
      { ratio: 0.5, idle: 0.16, redline: 0.05, overrun: 0.08 },
      { ratio: 0.125, idle: 0.1, redline: 0, overrun: 0 },
    ],
    roughness: 0.1,
    wander: 0.02,
    bias: 0.38,
    floor: 58,
    drive: { idle: 0.4, rpm: 0.06, load: 0.5 },
    formants: [
      { frequency: 105, q: 0.9, gain: 3 },
      { frequency: 380, q: 0.8, gain: 5 },
      { frequency: 760, q: 1, gain: 3 },
    ],
    cutoff: { idle: 850, rpm: 900, load: 500, loadRpm: 1400, max: 3600 },
    ceiling: 4600,
    breath: { from: 500, to: 1700, q: 0.6, grit: 0.06, gritLoad: 0.4, rasp: 0.1, air: 0.012, airLoad: 0.06 },
    chuff: { partial: 2, frequency: 620, idle: 1.6, redline: 0.3 },
    loudness: { coast: [0.11, 0.079, 0.074], pull: [0.105, 0.088, 0.084] },
    attack: 0.045,
    release: 0.16,
    bark: 1,
    crackle: 5,
  },
  v12: {
    idleRpm: 950,
    redlineRpm: 8200,
    firingsPerRev: 6,
    partials: [
      { ratio: 0.5, wave: 'silk', idle: 0.52, redline: 0.36, load: 0.1 },
      { ratio: 1, wave: 'bright', idle: 0.5, redline: 0.62, load: 0.25 },
      { ratio: 1.5, wave: 'thin', idle: 0.04, redline: 0.16, load: 0.5 },
      { ratio: 2, wave: 'thin', idle: 0.04, redline: 0.18, load: 0.5 },
    ],
    lopes: [{ ratio: 0.5, idle: 0.04, redline: 0.01, overrun: 0.02 }],
    roughness: 0.025,
    wander: 0.005,
    bias: 0.1,
    floor: 60,
    drive: { idle: 0.22, rpm: 0.1, load: 0.28 },
    formants: [
      { frequency: 260, q: 0.8, gain: 2.5 },
      { frequency: 1100, q: 1.1, gain: 3 },
    ],
    cutoff: { idle: 900, rpm: 1600, load: 600, loadRpm: 1000, max: 3600 },
    ceiling: 4400,
    breath: { from: 900, to: 2800, q: 0.7, grit: 0.03, gritLoad: 0.14, rasp: 0.06, air: 0.012, airLoad: 0.05 },
    chuff: { partial: 0, frequency: 1000, idle: 0.6, redline: 0.1 },
    wail: { from: 700, to: 2300, q: 3.5, idle: 0.15, redline: 0.65 },
    loudness: { coast: [0.073, 0.0356, 0.0347], pull: [0.067, 0.0413, 0.0434] },
    attack: 0.09,
    release: 0.16,
    bark: 0.15,
    crackle: 0,
  },
};

const MIN_POWER = 110;
const MAX_POWER = 440;
/** How far the start-up flare lifts the revs above idle, as a share of the rev range. */
const FLARE_RPM = 0.26;

function specFor(family: EngineFamily): FamilySpec {
  return Object.hasOwn(FAMILIES, family) ? FAMILIES[family] : FAMILIES.i4;
}

/** Firing frequency in Hz for a normalized rpm (0 idle .. 1 redline). */
export function firingFrequency(family: EngineFamily, rpm: number): number {
  const spec = specFor(family);
  const revs = lerp(spec.idleRpm, spec.redlineRpm, clamp01(finite(rpm, 0)));
  return (revs / 60) * spec.firingsPerRev;
}

export class EngineVoice {
  readonly profile: EngineProfile;
  private readonly spec: FamilySpec;
  private readonly patch: Patch;
  private readonly life: AudioParam;
  private readonly partialFrequency: Glide[] = [];
  private readonly partialLevel: Glide[] = [];
  private readonly lopeFrequency: Glide[] = [];
  private readonly lopeDepth: Glide[] = [];
  private readonly drive: Glide;
  private readonly cutoff: Glide;
  private readonly breathFrequency: Glide;
  private readonly grit: Glide;
  private readonly air: Glide;
  private readonly chuff: Glide;
  private readonly level: Glide;
  private readonly wailFrequency?: Glide;
  private readonly wailLevel?: Glide;
  private readonly popGain?: AudioParam;
  private readonly popTone?: AudioParam;
  private readonly hunting = new Drift(0.35);
  /** 0..1 from the rated power: a little louder and fuller as it rises. */
  private readonly fullness: number;
  private load = 0;
  private pedal = 0;
  private kick = 0;
  private liftoff = 0;
  private flare = 0;
  private flareAt = Infinity;
  private popIn = 0;
  private stopped = false;

  /**
   * `startAt` delays the fade in (so a starter sound can finish first) and `flare` adds the
   * little rev rise an engine makes as it catches.
   */
  constructor(
    ctx: BaseAudioContext,
    noiseBuffer: AudioBuffer,
    destination: AudioNode,
    profile: EngineProfile,
    startAt: number,
    flare: boolean,
  ) {
    this.profile = profile;
    this.spec = specFor(profile.family);
    this.fullness = clamp01((finite(profile.power, MIN_POWER) - MIN_POWER) / (MAX_POWER - MIN_POWER));
    const spec = this.spec;
    const patch = new Patch(ctx, noiseBuffer);
    this.patch = patch;

    // Tonal core. Its gain is wobbled by the lope oscillators and a little noise.
    const core = patch.gain(1);
    const oscillators: OscillatorNode[] = [];
    for (const partial of spec.partials) {
      const osc = patch.osc(waveFor(ctx, partial.wave), 50);
      const mix = patch.gain(0);
      osc.connect(mix).connect(core);
      oscillators.push(osc);
      this.partialFrequency.push(Glide.frequency(osc.frequency));
      this.partialLevel.push(Glide.gain(mix.gain));
    }
    for (let i = 0; i < spec.lopes.length; i++) {
      const lfo = patch.osc('sine', 10);
      const depth = patch.gain(0);
      lfo.connect(depth).connect(core.gain);
      this.lopeFrequency.push(Glide.frequency(lfo.frequency));
      this.lopeDepth.push(Glide.gain(depth.gain, 0.6));
    }
    patch.slowNoise(30).connect(patch.gain(spec.roughness)).connect(core.gain);

    // Saturator. Noise that enters with the tone gets chopped by it, which reads as exhaust rasp.
    const drive = patch.gain(spec.drive.idle);
    const shaper = patch.shaper(saturationCurve(3, spec.bias));
    core.connect(drive).connect(shaper);
    const hiss = patch.noise();
    const breath = patch.filter('bandpass', spec.breath.from, spec.breath.q);
    const grit = patch.gain(0);
    hiss.connect(breath).connect(grit).connect(drive);

    // Tone shaping. The floor also removes the DC offset the asymmetric curve leaves behind.
    const shaped = patch.filter('highpass', spec.floor, 0.8);
    shaper.connect(shaped);
    let tail: AudioNode = shaped;
    for (const formant of spec.formants) {
      const peak = patch.filter('peaking', formant.frequency * (1 - 0.08 * this.fullness), formant.q);
      peak.gain.value = formant.gain;
      tail = tail.connect(peak);
    }
    const shelf = patch.filter('lowshelf', 170);
    shelf.gain.value = 5 * this.fullness;
    const tone = patch.filter('lowpass', spec.cutoff.idle, 0.9);
    tail.connect(shelf).connect(tone);
    if (spec.wail) {
      const band = patch.filter('bandpass', spec.wail.from, spec.wail.q);
      const mix = patch.gain(0);
      shaped.connect(band).connect(mix).connect(tone);
      this.wailFrequency = Glide.frequency(band.frequency);
      this.wailLevel = Glide.gain(mix.gain);
    }

    const ceiling = patch.filter('lowpass', spec.ceiling, 0.6);
    const level = patch.gain(0);
    const life = patch.gain(0);
    tone.connect(ceiling).connect(level).connect(life).connect(destination);

    // Clean intake hiss, added after the saturator.
    const air = patch.gain(0);
    breath.connect(air).connect(ceiling);

    // Chuff: one partial swings this gain around zero, so the noise pulses in time with it.
    // Band-limited on both sides to stay a breath, not a hiss.
    const chuff = patch.gain(0);
    const chuffDepth = patch.gain(0);
    oscillators[spec.chuff.partial].connect(chuffDepth).connect(chuff.gain);
    hiss
      .connect(patch.filter('bandpass', spec.chuff.frequency, 1))
      .connect(patch.filter('lowpass', spec.chuff.frequency * 2))
      .connect(chuff)
      .connect(ceiling);

    if (spec.crackle > 0) {
      const band = patch.filter('bandpass', 900, 1.8);
      const pop = patch.gain(0);
      patch.noise().connect(band).connect(pop).connect(tone);
      this.popGain = pop.gain;
      this.popTone = band.frequency;
    }

    this.drive = Glide.gain(drive.gain, 1.3);
    this.cutoff = Glide.frequency(tone.frequency);
    this.breathFrequency = Glide.frequency(breath.frequency);
    this.grit = Glide.gain(grit.gain);
    this.air = Glide.gain(air.gain);
    this.chuff = Glide.gain(chuffDepth.gain);
    this.level = Glide.gain(level.gain);
    this.life = life.gain;

    const now = ctx.currentTime;
    this.apply(0, now, 0);
    this.life.setValueAtTime(0, now);
    this.life.setTargetAtTime(1, Math.max(now, startAt), 0.09);
    if (flare) this.flareAt = Math.max(now, startAt);
  }

  /** Call once per frame. `rpm` and `throttle` are both 0..1. */
  update(rpm: number, throttle: number, dt: number): void {
    if (this.stopped) return;
    const spec = this.spec;
    const now = this.patch.ctx.currentTime;
    const step = clamp(finite(dt, 0.016), 0.001, 0.1);
    const pedal = clamp01(finite(throttle, 0));

    if (now >= this.flareAt) {
      this.flareAt = Infinity;
      this.flare = FLARE_RPM;
      this.load = Math.max(this.load, 0.75);
    }
    this.flare *= Math.exp(-step / 0.28);

    const response = pedal > this.load ? spec.attack : spec.release;
    this.load += (pedal - this.load) * (1 - Math.exp(-step / response));

    const rise = pedal - this.pedal;
    this.pedal = pedal;
    // Both follow pedal travel, so a slow squeeze barks less and a slow lift pops less.
    this.kick = Math.min(1, this.kick * Math.exp(-step / 0.18) + Math.max(0, rise) * spec.bark);
    this.liftoff = Math.min(1, this.liftoff * Math.exp(-step / 1.1) + Math.max(0, -rise) * 1.5);

    const revs = clamp01(finite(rpm, 0) + this.flare);
    this.apply(revs, now, 0.03, step);
    if (this.popGain) this.crackle(revs, now, step);
  }

  /** Silences the voice until `time`, then lets it catch with a flare. Used when a starter sound plays. */
  hold(time: number): void {
    if (this.stopped) return;
    const now = this.patch.ctx.currentTime;
    this.life.cancelScheduledValues(now);
    this.life.setTargetAtTime(0, now, 0.03);
    this.life.setTargetAtTime(1, Math.max(now, time), 0.09);
    this.flareAt = Math.max(now, time);
  }

  /** Lets the engine run down and frees its nodes. `quick` is for teardown. */
  stop(quick = false): void {
    if (this.stopped) return;
    this.stopped = true;
    if (quick) {
      this.patch.dispose();
      return;
    }
    const now = this.patch.ctx.currentTime;
    this.life.cancelScheduledValues(now);
    this.life.setTargetAtTime(0, now, 0.13);
    // Revs sag below idle as it dies.
    const dying = firingFrequency(this.profile.family, 0) * 0.55;
    this.spec.partials.forEach((partial, index) => {
      this.partialFrequency[index].to(dying * partial.ratio, now, 0.22);
    });
    this.patch.end(now + 1);
  }

  private apply(revs: number, now: number, ease: number, step = 0): void {
    const spec = this.spec;
    const load = this.load;
    const kick = this.kick;
    const slow = ease * 1.7;
    const hunt = step > 0 ? this.hunting.step(step) * spec.wander * (1 - revs) ** 2 : 0;
    const firing = firingFrequency(this.profile.family, revs) * (1 + hunt);

    spec.partials.forEach((partial, index) => {
      this.partialFrequency[index].to(firing * partial.ratio, now, ease);
      const mix = lerp(partial.idle, partial.redline, revs) * (1 + partial.load * load);
      this.partialLevel[index].to(mix, now, slow);
    });
    spec.lopes.forEach((lope, index) => {
      this.lopeFrequency[index].to(firing * lope.ratio, now, ease);
      const depth = lerp(lope.idle, lope.redline, revs) + lope.overrun * (1 - load) * revs;
      this.lopeDepth[index].to(depth, now, slow);
    });

    const drive = spec.drive.idle + spec.drive.rpm * revs + spec.drive.load * load + 0.15 * kick;
    this.drive.to(drive * (1 + 0.2 * this.fullness), now, slow);

    const open = spec.cutoff.idle + spec.cutoff.rpm * revs + load * (spec.cutoff.load + spec.cutoff.loadRpm * revs);
    this.cutoff.to(clamp(open * (1 + 0.6 * kick), 150, spec.cutoff.max), now, slow);

    const breath = spec.breath;
    this.breathFrequency.to(lerp(breath.from, breath.to, revs), now, slow);
    const rasp = breath.gritLoad * (0.4 + 0.6 * revs) + breath.rasp * revs ** 3;
    this.grit.to(breath.grit + load * rasp + 0.25 * kick, now, slow);
    this.air.to(breath.air + breath.airLoad * load * (0.3 + 0.7 * revs), now, slow);
    this.chuff.to(lerp(spec.chuff.idle, spec.chuff.redline, revs) * (0.6 + 0.4 * load), now, slow);

    if (spec.wail && this.wailFrequency && this.wailLevel) {
      this.wailFrequency.to(lerp(spec.wail.from, spec.wail.to, revs ** 1.25), now, slow);
      this.wailLevel.to(lerp(spec.wail.idle, spec.wail.redline, revs) * (0.45 + 0.55 * load), now, slow);
    }

    const loudness = lerp(across(spec.loudness.coast, revs), across(spec.loudness.pull, revs), load);
    this.level.to(loudness * (1 + 0.45 * kick) * lerp(0.88, 1.12, this.fullness), now, slow);
  }

  /** Soft exhaust pops while coasting down from speed. Only moves one gain, no new nodes. */
  private crackle(revs: number, now: number, step: number): void {
    const pop = this.popGain;
    const tone = this.popTone;
    if (!pop || !tone) return;
    const overrun = (1 - this.load) * smoothstep(0.22, 0.6, revs) * (0.25 + 0.75 * this.liftoff);
    const rate = overrun * (5 + 16 * revs);
    this.popIn -= step;
    if (this.popIn > 0 || rate < 0.5) return;
    const at = now + rand(0.005, 0.03);
    tone.setValueAtTime(rand(450, 1500), at);
    pop.setTargetAtTime(this.spec.crackle * overrun * rand(0.3, 1), at, 0.003);
    pop.setTargetAtTime(0, at + 0.008, rand(0.008, 0.03));
    this.popIn = Math.min(2, -Math.log(1 - Math.random()) / rate);
  }
}
