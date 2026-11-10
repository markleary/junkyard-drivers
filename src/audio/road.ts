/**
 * Everything the car makes besides its engine: tire roll, loose-surface grain, skids and
 * the wind rush at speed. All noise based, built once and steered by a few parameters.
 */
import type { DriveAudioState, SurfaceKind } from './types';
import { Drift, Glide, Patch, clamp, clamp01, finite, rand, smoothstep } from './synth';

interface SurfaceSpec {
  /** Rolling noise level at top speed, and how early it rises (below 1 is audible at a crawl). */
  roll: number;
  rise: number;
  /** Band kept from the noise. The top opens by `open` Hz per m/s. */
  low: number;
  high: number;
  open: number;
  /** Random loudness flutter of the roll. */
  rough: number;
  /** Loose stones: how busy the grain layer is. */
  grain: number;
  /** Tonal squeal when sliding, and its pitch relative to asphalt. */
  squeal: number;
  pitch: number;
  /** Broadband scrabble when sliding on loose ground. */
  scrabble: number;
}

const SURFACES: Record<SurfaceKind, SurfaceSpec> = {
  // Smooth hiss.
  asphalt: {
    roll: 0.5, rise: 0.9, low: 220, high: 1300, open: 26, rough: 0.08,
    grain: 0, squeal: 1, pitch: 1, scrabble: 0,
  },
  // A little brighter and rougher, and it squeals higher.
  concrete: {
    roll: 0.5, rise: 0.9, low: 320, high: 1900, open: 34, rough: 0.14,
    grain: 0, squeal: 0.9, pitch: 1.12, scrabble: 0,
  },
  // Broad crunch that is already audible at a crawl.
  gravel: {
    roll: 0.55, rise: 0.55, low: 160, high: 2400, open: 25, rough: 0.5,
    grain: 1, squeal: 0, pitch: 1, scrabble: 1,
  },
  // Soft and low.
  grass: {
    roll: 0.55, rise: 0.8, low: 90, high: 650, open: 8, rough: 0.3,
    grain: 0, squeal: 0, pitch: 1, scrabble: 0.55,
  },
};

/** Speed in m/s at which the rolling and wind layers reach full level. */
const TOP_SPEED = 45;
const ROLL_LEVEL = 0.18;
const GRAIN_LEVEL = 0.12;
const SQUEAL_LEVEL = 0.2;
const SCRABBLE_LEVEL = 0.1;
const WIND_LEVEL = 0.07;

export class RoadVoice {
  private readonly patch: Patch;
  private readonly rollLevel: Glide;
  private readonly rollLow: Glide;
  private readonly rollHigh: Glide;
  private readonly rollRough: Glide;
  private readonly grainGain: AudioParam;
  private readonly grainTone: AudioParam;
  private readonly squealLevel: Glide;
  private readonly squealPitch: Glide[];
  private readonly scrabbleLevel: Glide;
  private readonly windLevel: Glide;
  private readonly windTone: Glide;
  private readonly buffet = new Drift(0.6);
  private grainIn = 0;
  private surface: SurfaceKind = 'asphalt';

  constructor(ctx: BaseAudioContext, noiseBuffer: AudioBuffer, destination: AudioNode) {
    const patch = new Patch(ctx, noiseBuffer);
    this.patch = patch;

    // Roll: band-limited noise whose loudness flutters a little, more on rough ground.
    const rollLow = patch.filter('highpass', 220);
    const rollHigh = patch.filter('lowpass', 1300);
    const rollFlutter = patch.gain(1);
    const rollRough = patch.gain(0);
    const roll = patch.gain(0);
    patch.noise().connect(rollLow).connect(rollHigh).connect(rollFlutter).connect(roll).connect(destination);
    patch.slowNoise(18).connect(rollRough).connect(rollFlutter.gain);

    // Grain: one gain that is flicked open for a few milliseconds per stone.
    const grainBand = patch.filter('bandpass', 2000, 1.1);
    const grain = patch.gain(0);
    const grainOut = patch.gain(GRAIN_LEVEL);
    patch.noise().connect(patch.filter('highpass', 700)).connect(grainBand).connect(grain);
    grain.connect(patch.filter('lowpass', 4500)).connect(grainOut).connect(destination);

    // Squeal: noise and a saw through narrow resonances on the pitch and its octave. One slow
    // random signal bends the pitch and shakes the level, so it howls instead of whistling.
    const squealNoise = patch.noise();
    const squealSaw = patch.osc('sawtooth', 700);
    const sawMix = patch.gain(0.2);
    const first = patch.filter('bandpass', 700, 12);
    const second = patch.filter('bandpass', 1400, 10);
    const squealTop = patch.filter('lowpass', 3200);
    const squealFlutter = patch.gain(1);
    const squeal = patch.gain(0);
    squealSaw.connect(sawMix);
    for (const band of [first, second]) {
      squealNoise.connect(band);
      sawMix.connect(band);
    }
    first.connect(squealTop);
    second.connect(patch.gain(0.8)).connect(squealTop);
    squealSaw.connect(patch.gain(0.05)).connect(squealTop);
    squealTop.connect(squealFlutter).connect(squeal).connect(destination);
    const wobbleSource = patch.slowNoise(9);
    const wobble = patch.gain(35);
    wobbleSource.connect(wobble);
    for (const target of [first.detune, second.detune, squealSaw.detune]) wobble.connect(target);
    wobbleSource.connect(patch.gain(0.25)).connect(squealFlutter.gain);

    // Scrabble: loose ground thrown by sliding tires.
    const scrabbleBand = patch.filter('bandpass', 1100, 0.5);
    const scrabbleFlutter = patch.gain(1);
    const scrabbleRough = patch.gain(0.45);
    const scrabble = patch.gain(0);
    squealNoise.connect(scrabbleBand).connect(scrabbleFlutter).connect(scrabble).connect(destination);
    wobbleSource.connect(scrabbleRough).connect(scrabbleFlutter.gain);

    // Wind rush around the car.
    const windBand = patch.filter('bandpass', 400, 0.5);
    const wind = patch.gain(0);
    patch.noise().connect(windBand).connect(wind).connect(destination);

    this.rollLevel = Glide.gain(roll.gain);
    this.rollLow = Glide.frequency(rollLow.frequency);
    this.rollHigh = Glide.frequency(rollHigh.frequency);
    this.rollRough = Glide.gain(rollRough.gain, 1);
    this.grainGain = grain.gain;
    this.grainTone = grainBand.frequency;
    this.squealLevel = Glide.gain(squeal.gain);
    this.squealPitch = [first.frequency, second.frequency, squealSaw.frequency].map((param) => Glide.frequency(param));
    this.scrabbleLevel = Glide.gain(scrabble.gain);
    this.windLevel = Glide.gain(wind.gain);
    this.windTone = Glide.frequency(windBand.frequency);
  }

  update(state: DriveAudioState, dt: number): void {
    const now = this.patch.ctx.currentTime;
    const step = clamp(finite(dt, 0.016), 0, 0.1);
    if (Object.hasOwn(SURFACES, state.surface)) this.surface = state.surface;
    const surface = SURFACES[this.surface];
    const speed = Math.min(Math.abs(finite(state.speed, 0)), 100);
    const slip = clamp01(finite(state.slip, 0));
    const contact = state.grounded ? 1 : 0;
    const pace = clamp01(speed / TOP_SPEED);
    // Leaving the ground cuts quickly; everything else eases.
    const ease = contact ? 0.12 : 0.03;

    // A locked wheel on a parked car makes no noise, so sliding needs some speed.
    const sliding = smoothstep(0.08, 0.75, slip) * clamp01(speed / 3) * contact;
    const roll = ROLL_LEVEL * surface.roll * pace ** surface.rise * (1 + 0.5 * sliding * surface.scrabble);
    this.rollLevel.to(contact * roll, now, ease);
    this.rollLow.to(surface.low, now, 0.15);
    this.rollHigh.to(surface.high + surface.open * speed, now, 0.15);
    this.rollRough.to(surface.rough, now, 0.2);

    this.squealLevel.to(SQUEAL_LEVEL * surface.squeal * sliding ** 1.3, now, contact ? 0.05 : 0.03);
    const pitch = (680 + 260 * slip + 4 * speed) * surface.pitch;
    this.squealPitch[0].to(pitch, now, 0.08);
    this.squealPitch[1].to(pitch * 2, now, 0.08);
    this.squealPitch[2].to(pitch, now, 0.08);
    this.scrabbleLevel.to(SCRABBLE_LEVEL * surface.scrabble * sliding, now, contact ? 0.06 : 0.03);

    const stones = contact * surface.grain * ((speed > 0.4 ? 6 + 46 * pace ** 0.6 : 0) + 40 * sliding);
    this.grains(stones, pace, now, step);

    const rush = clamp01((speed - 5) / (TOP_SPEED - 5)) ** 1.6;
    this.windLevel.to(WIND_LEVEL * rush * (1 + 0.25 * this.buffet.step(step)), now, 0.2);
    this.windTone.to(380 + 24 * speed, now, 0.3);
  }

  /** Fades every layer out; used when the game stops reporting driving state. */
  silence(): void {
    const now = this.patch.ctx.currentTime;
    this.rollLevel.to(0, now, 0.12);
    this.squealLevel.to(0, now, 0.05);
    this.scrabbleLevel.to(0, now, 0.06);
    this.windLevel.to(0, now, 0.2);
  }

  dispose(): void {
    this.patch.dispose();
  }

  /** Schedules this frame's share of random stone hits. */
  private grains(rate: number, pace: number, now: number, step: number): void {
    if (rate < 1) {
      this.grainIn = Math.min(this.grainIn, 0.05);
      return;
    }
    this.grainIn -= step;
    for (let count = 0; this.grainIn <= 0 && count < 4; count++) {
      const at = now + 0.01 + rand(0, step);
      this.grainTone.setValueAtTime(rand(1200, 3400), at);
      this.grainGain.setTargetAtTime(rand(0.3, 1) ** 2 * (0.5 + 0.5 * pace), at, 0.002);
      this.grainGain.setTargetAtTime(0, at + rand(0.002, 0.008), rand(0.004, 0.016));
      this.grainIn += -Math.log(1 - Math.random()) / rate;
    }
    if (this.grainIn < 0) this.grainIn = 0;
  }
}
