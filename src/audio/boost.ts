/**
 * Forced induction: the whistle of a turbocharger that rises with its boost, and the rush of
 * nitrous while the valve is open. Both are steady voices steered by two numbers each frame,
 * built once with the rest of the graph and silent for a car that carries neither part.
 */
import type { DriveAudioState } from './types';
import { Drift, Glide, Patch, clamp, clamp01, finite } from './synth';

const WHISTLE_LEVEL = 0.03;
const HISS_LEVEL = 0.045;
const JET_LEVEL = 0.2;
const RUMBLE_LEVEL = 0.06;

export class BoostVoice {
  private readonly patch: Patch;
  private readonly whistleLevel: Glide;
  private readonly whistlePitch: Glide[];
  private readonly hissLevel: Glide;
  private readonly hissTone: Glide;
  private readonly jetLevel: Glide;
  private readonly jetTone: Glide;
  private readonly rumbleLevel: Glide;
  private readonly flutter = new Drift(0.18);

  constructor(ctx: BaseAudioContext, noiseBuffer: AudioBuffer, destination: AudioNode) {
    const patch = new Patch(ctx, noiseBuffer);
    this.patch = patch;

    // Turbine whistle: two sines a few cycles apart, so it shimmers instead of beeping.
    const whistle = patch.gain(0);
    const first = patch.osc('sine', 2200);
    const second = patch.osc('sine', 2213);
    first.connect(whistle);
    second.connect(patch.gain(0.6)).connect(whistle);
    whistle.connect(destination);

    // Compressor hiss: a narrow band of noise that climbs with the whistle.
    const hissBand = patch.filter('bandpass', 2400, 2.2);
    const hiss = patch.gain(0);
    patch.noise().connect(hissBand).connect(hiss).connect(destination);

    // Nitrous: a hard jet of gas over a low thrum from the exhaust.
    const jetBand = patch.filter('bandpass', 1500, 0.7);
    const jet = patch.gain(0);
    patch.noise().connect(patch.filter('highpass', 500)).connect(jetBand).connect(jet).connect(destination);
    const rumble = patch.gain(0);
    patch.osc('sawtooth', 62).connect(patch.filter('lowpass', 240, 0.8)).connect(rumble).connect(destination);

    this.whistleLevel = Glide.gain(whistle.gain);
    this.whistlePitch = [Glide.frequency(first.frequency), Glide.frequency(second.frequency)];
    this.hissLevel = Glide.gain(hiss.gain);
    this.hissTone = Glide.frequency(hissBand.frequency);
    this.jetLevel = Glide.gain(jet.gain);
    this.jetTone = Glide.frequency(jetBand.frequency);
    this.rumbleLevel = Glide.gain(rumble.gain);
  }

  update(state: DriveAudioState, dt: number): void {
    const now = this.patch.ctx.currentTime;
    const step = clamp(finite(dt, 0.016), 0, 0.1);
    const boost = clamp01(finite(state.boost ?? 0, 0));
    const nitro = clamp01(finite(state.nitro ?? 0, 0));
    const revs = clamp01(finite(state.rpm, 0));
    // The turbine's speed follows boost first and engine speed second.
    const pitch = 1700 + 3600 * boost + 900 * revs * boost;
    this.whistlePitch[0].to(pitch, now, 0.06);
    this.whistlePitch[1].to(pitch * 1.006, now, 0.06);
    this.whistleLevel.to(WHISTLE_LEVEL * boost ** 1.6, now, 0.05);
    this.hissTone.to(pitch * 0.62, now, 0.08);
    this.hissLevel.to(HISS_LEVEL * boost ** 1.3, now, 0.06);
    const shake = 1 + 0.18 * this.flutter.step(step);
    this.jetLevel.to(JET_LEVEL * nitro * shake, now, nitro ? 0.03 : 0.09);
    this.jetTone.to(1300 + 900 * revs, now, 0.1);
    this.rumbleLevel.to(RUMBLE_LEVEL * nitro, now, nitro ? 0.04 : 0.1);
  }

  /** Fades both voices out; used when the game stops reporting driving state. */
  silence(): void {
    const now = this.patch.ctx.currentTime;
    this.whistleLevel.to(0, now, 0.08);
    this.hissLevel.to(0, now, 0.08);
    this.jetLevel.to(0, now, 0.08);
    this.rumbleLevel.to(0, now, 0.08);
  }

  dispose(): void {
    this.patch.dispose();
  }
}
