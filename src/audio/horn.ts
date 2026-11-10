/** Car horn: two reedy notes a third apart, held for as long as the button is down. */
import type { EngineFamily } from './types';
import { Patch } from './synth';

/** Each car gets its own pair: small and nasal, big and low, bright twin trumpets. */
const NOTES: Record<EngineFamily, readonly [number, number]> = {
  i4: [410, 510],
  v8: [345, 435],
  v12: [470, 590],
};
const DEFAULT_NOTES = [400, 500] as const;
const HORN_LEVEL = 0.17;

export class Horn {
  private sounding?: { patch: Patch; amp: AudioParam };

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly noiseBuffer: AudioBuffer,
    private readonly destination: AudioNode,
  ) {}

  set(on: boolean, family: EngineFamily | null): void {
    const now = this.ctx.currentTime;
    const sounding = this.sounding;
    if (!on) {
      if (!sounding) return;
      this.sounding = undefined;
      sounding.amp.cancelScheduledValues(now);
      sounding.amp.setTargetAtTime(0, now, 0.025);
      sounding.patch.end(now + 0.25);
      return;
    }
    if (sounding) return;
    const patch = new Patch(this.ctx, this.noiseBuffer);
    const notes = family && Object.hasOwn(NOTES, family) ? NOTES[family] : DEFAULT_NOTES;
    // A resonant lowpass gives the honk its nasal edge without the fizz of raw saws.
    const body = patch.filter('lowpass', 2300, 1.6);
    const floor = patch.filter('highpass', 260);
    const amp = patch.gain(0);
    for (const note of notes) {
      const osc = patch.osc('sawtooth', note);
      osc.connect(patch.gain(0.5)).connect(body);
    }
    body.connect(floor).connect(amp).connect(this.destination);
    amp.gain.setValueAtTime(0, now);
    amp.gain.setTargetAtTime(HORN_LEVEL, now, 0.008);
    this.sounding = { patch, amp: amp.gain };
  }

  dispose(): void {
    this.sounding?.patch.dispose();
    this.sounding = undefined;
  }
}
