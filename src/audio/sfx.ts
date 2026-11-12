/**
 * One-shot effects and footsteps. Every sound is a short recipe built from a few strokes
 * (pitched tone, filtered noise burst, struck bar, gated rattle) so the set reads as one family.
 */
import type { SfxName, SfxOptions, SurfaceKind } from './types';
import { Patch, clamp, envelope, finite, noiseMakeup, rand, strikes } from './synth';

/** Seconds from the start of the ignition sound to the moment the engine catches. */
export const IGNITION_CATCH = 0.62;

/** Scheduling a hair ahead keeps the first milliseconds of an attack from being skipped. */
const LOOKAHEAD = 0.012;
const MAX_VOICES = 24;
const FOOTSTEP_LEVEL = 0.55;

class Voice extends Patch {
  readonly out: GainNode;

  constructor(
    ctx: BaseAudioContext,
    noiseBuffer: AudioBuffer,
    destination: AudioNode,
    level: number,
    pan: number,
    pitch: number,
  ) {
    super(ctx, noiseBuffer, pitch);
    const panner = pan === 0 ? undefined : this.panner(pan);
    // A panner drops a centered source by 3 dB; make up for it so pan 0 and pan 0.01 sound alike.
    this.out = this.gain(panner ? level * Math.SQRT2 : level);
    if (panner) this.out.connect(panner).connect(destination);
    else this.out.connect(destination);
  }
}

interface ToneStroke {
  shape?: OscillatorType;
  from: number;
  /** Pitch glides here over `glide` seconds. */
  to?: number;
  glide?: number;
  peak: number;
  attack?: number;
  hold?: number;
  /** Seconds to fall about 60 dB. */
  decay: number;
}

function tone(voice: Voice, at: number, stroke: ToneStroke): void {
  const attack = stroke.attack ?? 0.002;
  const hold = stroke.hold ?? 0;
  const length = attack + hold + stroke.decay;
  const osc = voice.osc(stroke.shape ?? 'sine', stroke.from, at, at + length);
  if (stroke.to !== undefined) {
    osc.frequency.setValueAtTime(voice.hz(stroke.from), at);
    osc.frequency.exponentialRampToValueAtTime(voice.hz(stroke.to), at + (stroke.glide ?? length * 0.6));
  }
  const amp = voice.gain();
  envelope(amp.gain, at, stroke.peak, attack, hold, stroke.decay);
  osc.connect(amp).connect(voice.out);
}

interface BurstStroke {
  type?: BiquadFilterType;
  from: number;
  /** Filter sweeps here across the whole burst. */
  to?: number;
  q?: number;
  /** Loudness as the amplitude of an equally loud sine. */
  peak: number;
  attack?: number;
  hold?: number;
  decay: number;
}

function burst(voice: Voice, at: number, stroke: BurstStroke): void {
  const type = stroke.type ?? 'bandpass';
  const q = stroke.q ?? 1;
  const attack = stroke.attack ?? 0.001;
  const hold = stroke.hold ?? 0;
  const end = at + attack + hold + stroke.decay;
  const filter = voice.filter(type, stroke.from, q);
  if (stroke.to !== undefined) {
    filter.frequency.setValueAtTime(voice.hz(stroke.from), at);
    filter.frequency.exponentialRampToValueAtTime(voice.hz(stroke.to), end);
  }
  const centre = voice.hz(Math.sqrt(stroke.from * (stroke.to ?? stroke.from)));
  const amp = voice.gain();
  envelope(amp.gain, at, stroke.peak * noiseMakeup(voice.ctx, type, centre, q), attack, hold, stroke.decay);
  voice.noise(at, end).connect(filter).connect(amp).connect(voice.out);
}

/** Partials of a struck metal bar: ratio, level and how long each rings relative to the fundamental. */
const BAR_PARTIALS = [
  [1, 1, 1],
  [2.756, 0.4, 0.5],
  [5.404, 0.18, 0.28],
] as const;

/** Bell or glockenspiel note. `warmth` adds an octave below for a rounder chime. */
function bell(voice: Voice, at: number, frequency: number, peak: number, decay: number, warmth = 0): void {
  for (const [ratio, level, ring] of BAR_PARTIALS) {
    // Partials this high add sting, not sparkle.
    if (frequency * ratio * voice.pitch > 9000) break;
    tone(voice, at, { from: frequency * ratio, peak: peak * level, attack: 0.0015, decay: decay * ring });
  }
  if (warmth > 0) tone(voice, at, { from: frequency / 2, peak: peak * warmth, attack: 0.003, decay: decay * 0.6 });
}

/** Soft brass note: two detuned saws under a lowpass that blooms on the attack. */
function brass(voice: Voice, at: number, frequency: number, length: number, peak: number): void {
  const end = at + length + 0.2;
  const filter = voice.filter('lowpass', frequency * 1.5, 0.9);
  filter.frequency.setValueAtTime(voice.hz(frequency * 1.5), at);
  filter.frequency.linearRampToValueAtTime(voice.hz(frequency * 4.5), at + 0.04);
  filter.frequency.setTargetAtTime(voice.hz(frequency * 2.6), at + 0.04, 0.08);
  const amp = voice.gain();
  envelope(amp.gain, at, peak, 0.018, Math.max(0, length - 0.018), 0.2);
  for (const detune of [-5, 6]) {
    const osc = voice.osc('sawtooth', frequency, at, end);
    osc.detune.value = detune;
    osc.connect(filter);
  }
  filter.connect(amp).connect(voice.out);
}

interface RattleSpec {
  times: number[];
  peak: (index: number) => number;
  attack: number;
  decay: number;
  noise?: { type: BiquadFilterType; frequency: number; q: number; level: number };
  /** `lowpass` rounds the ring off when a raw wave would buzz. */
  ring?: { shape: OscillatorType; frequency: number; level: number; lowpass?: number };
}

/** A gate struck repeatedly, fed by filtered noise and an optional pitched ring. Returns the parts for extra motion. */
function rattle(
  voice: Voice,
  at: number,
  end: number,
  spec: RattleSpec,
): { band?: BiquadFilterNode; ring?: OscillatorNode } {
  const gate = voice.gain();
  strikes(gate.gain, spec.times, spec.peak, spec.attack, spec.decay);
  gate.connect(voice.out);
  let band: BiquadFilterNode | undefined;
  let ring: OscillatorNode | undefined;
  if (spec.noise) {
    const { type, frequency, q, level } = spec.noise;
    band = voice.filter(type, frequency, q);
    const mix = voice.gain(level * noiseMakeup(voice.ctx, type, voice.hz(frequency), q));
    voice.noise(at, end).connect(band).connect(mix).connect(gate);
  }
  if (spec.ring) {
    ring = voice.osc(spec.ring.shape, spec.ring.frequency, at, end);
    const mix = voice.gain(spec.ring.level);
    if (spec.ring.lowpass) ring.connect(voice.filter('lowpass', spec.ring.lowpass, 1.2)).connect(mix);
    else ring.connect(mix);
    mix.connect(gate);
  }
  return { band, ring };
}

/** Stand-in rev flare for when no engine voice is there to catch. Returns its gain so it can be withdrawn. */
function revFlare(voice: Voice, at: number): AudioParam {
  const osc = voice.osc('sawtooth', 54, at, at + 0.75);
  osc.frequency.setValueAtTime(voice.hz(54), at);
  osc.frequency.exponentialRampToValueAtTime(voice.hz(104), at + 0.13);
  osc.frequency.setTargetAtTime(voice.hz(58), at + 0.13, 0.14);
  const filter = voice.filter('lowpass', 500, 1);
  filter.frequency.setValueAtTime(voice.hz(500), at);
  filter.frequency.exponentialRampToValueAtTime(voice.hz(1500), at + 0.13);
  filter.frequency.setTargetAtTime(voice.hz(420), at + 0.13, 0.15);
  const amp = voice.gain();
  envelope(amp.gain, at, 0.14, 0.03, 0.2, 0.5);
  osc.connect(filter).connect(amp).connect(voice.out);
  return amp.gain;
}

interface Recipe {
  /** Minimum seconds between two triggers; closer calls merge into one. */
  gap: number;
  /** Random pitch spread, so repeats do not sound machine-gunned. */
  vary: number;
  /** Loudness trim, set from measuring the rendered sound against the rest of the mix. */
  level: number;
  build: (voice: Voice, at: number, player: SfxPlayer) => void;
}

const RECIPES: Record<Exclude<SfxName, 'ratchet'>, Recipe> & Partial<Record<'ratchet', Recipe>> = {
  // Soft latch tick.
  click: {
    gap: 0.03,
    vary: 0.04,
    level: 1,
    build: (v, t) => {
      burst(v, t, { from: 2600, q: 1.4, peak: 0.07, decay: 0.03 });
      tone(v, t, { from: 1150, to: 760, peak: 0.05, decay: 0.045 });
    },
  },
  // Paper sliding out: the hiss rises.
  open: {
    gap: 0.08,
    vary: 0.03,
    level: 0.56,
    build: (v, t) => {
      burst(v, t, { from: 700, to: 2400, q: 0.9, peak: 0.07, attack: 0.05, hold: 0.02, decay: 0.16 });
      burst(v, t + 0.012, { from: 3800, peak: 0.02, decay: 0.04 });
    },
  },
  // Paper sliding back: the hiss falls and lands with a pat.
  close: {
    gap: 0.08,
    vary: 0.03,
    level: 0.51,
    build: (v, t) => {
      burst(v, t, { from: 2200, to: 650, q: 0.9, peak: 0.07, attack: 0.03, decay: 0.16 });
      tone(v, t + 0.11, { from: 170, to: 105, peak: 0.09, attack: 0.003, decay: 0.1 });
      burst(v, t + 0.11, { type: 'lowpass', from: 500, peak: 0.04, decay: 0.06 });
    },
  },
  // Cash drawer: key clack, bell, drawer thunk, two loose coins.
  buy: {
    gap: 0.2,
    vary: 0.01,
    level: 0.6,
    build: (v, t) => {
      burst(v, t, { from: 3000, q: 1.2, peak: 0.05, decay: 0.025 });
      tone(v, t, { from: 220, to: 160, peak: 0.05, decay: 0.05 });
      bell(v, t + 0.04, 1975.5, 0.12, 0.9);
      bell(v, t + 0.04, 2637, 0.06, 0.7);
      tone(v, t + 0.12, { from: 140, to: 80, peak: 0.12, decay: 0.16 });
      tone(v, t + 0.12, { from: 250, to: 180, peak: 0.05, decay: 0.07 });
      burst(v, t + 0.12, { type: 'lowpass', from: 420, peak: 0.08, decay: 0.09 });
      tone(v, t + 0.17, { from: 5200, peak: 0.012, decay: 0.08 });
      tone(v, t + 0.23, { from: 4400, peak: 0.01, decay: 0.08 });
    },
  },
  // Impact wrench: a motor whirr under a fast run of hammer blows.
  install: {
    gap: 0.25,
    vary: 0.04,
    level: 1,
    build: (v, t) => {
      const end = t + 0.5;
      const motor = v.osc('sawtooth', 210, t, end);
      motor.frequency.setValueAtTime(v.hz(210), t);
      motor.frequency.exponentialRampToValueAtTime(v.hz(310), t + 0.1);
      motor.frequency.setTargetAtTime(v.hz(190), t + 0.34, 0.04);
      const amp = v.gain();
      envelope(amp.gain, t, 0.05, 0.02, 0.33, 0.12);
      motor.connect(v.filter('bandpass', 900, 0.8)).connect(amp).connect(v.out);
      rattle(v, t, end, {
        times: Array.from({ length: 10 }, (_, index) => t + 0.05 + index * 0.031),
        peak: (index) => 0.75 + 0.25 * (index % 2),
        attack: 0.002,
        decay: 0.024,
        noise: { type: 'bandpass', frequency: 1700, q: 1.5, level: 0.1 },
        ring: { shape: 'triangle', frequency: 2350, level: 0.03 },
      });
    },
  },
  // Spray can hiss.
  paint: {
    gap: 0.2,
    vary: 0.03,
    level: 0.68,
    build: (v, t) => {
      burst(v, t, { from: 2600, to: 3300, q: 0.8, peak: 0.05, attack: 0.03, hold: 0.28, decay: 0.16 });
      burst(v, t, { from: 4500, q: 1.5, peak: 0.015, attack: 0.002, decay: 0.04 });
    },
  },
  // Rubber stamp: thump, paper slap, sticky lift.
  stamp: {
    gap: 0.1,
    vary: 0.04,
    level: 1,
    build: (v, t) => {
      tone(v, t, { from: 170, to: 90, glide: 0.07, peak: 0.11, decay: 0.15 });
      tone(v, t, { from: 300, to: 210, peak: 0.06, decay: 0.06 });
      burst(v, t, { type: 'lowpass', from: 600, peak: 0.08, decay: 0.07 });
      burst(v, t, { from: 1500, q: 0.8, peak: 0.05, decay: 0.03 });
      burst(v, t + 0.12, { from: 2200, peak: 0.015, decay: 0.04 });
    },
  },
  // Dull double knock, the second one lower: a wooden "nope".
  error: {
    gap: 0.2,
    vary: 0.02,
    level: 1,
    build: (v, t) => {
      for (const [delay, pitch, peak] of [[0, 1, 0.11], [0.14, 0.84, 0.095]] as const) {
        tone(v, t + delay, { shape: 'triangle', from: 220 * pitch, to: 170 * pitch, peak, decay: 0.1 });
        burst(v, t + delay, { from: 520 * pitch, q: 0.9, peak: peak * 0.65, decay: 0.05 });
        burst(v, t + delay, { type: 'lowpass', from: 450 * pitch, peak: peak * 0.45, decay: 0.045 });
      }
    },
  },
  // Door pulled shut from inside: latch, then a heavy muffled thunk.
  enterCar: {
    gap: 0.3,
    vary: 0.03,
    level: 0.95,
    build: (v, t) => {
      burst(v, t, { from: 1800, q: 1.5, peak: 0.04, decay: 0.02 });
      tone(v, t + 0.03, { from: 110, to: 62, peak: 0.13, decay: 0.22 });
      tone(v, t + 0.03, { from: 210, to: 150, peak: 0.07, decay: 0.09 });
      burst(v, t + 0.03, { type: 'lowpass', from: 520, peak: 0.09, decay: 0.1 });
      burst(v, t + 0.03, { from: 900, q: 0.7, peak: 0.05, decay: 0.045 });
      tone(v, t + 0.06, { shape: 'triangle', from: 320, to: 280, peak: 0.015, decay: 0.08 });
    },
  },
  // Handle click, door swings, then a brighter thunk from outside.
  exitCar: {
    gap: 0.3,
    vary: 0.03,
    level: 0.85,
    build: (v, t) => {
      burst(v, t, { from: 2400, q: 1.6, peak: 0.05, decay: 0.022 });
      tone(v, t, { from: 520, to: 380, peak: 0.03, decay: 0.045 });
      burst(v, t + 0.05, { from: 500, to: 900, q: 0.8, peak: 0.015, attack: 0.06, decay: 0.12 });
      tone(v, t + 0.24, { from: 130, to: 76, peak: 0.13, decay: 0.17 });
      tone(v, t + 0.24, { from: 260, to: 190, peak: 0.06, decay: 0.07 });
      burst(v, t + 0.24, { type: 'lowpass', from: 900, peak: 0.1, decay: 0.07 });
      burst(v, t + 0.24, { from: 1500, q: 0.9, peak: 0.045, decay: 0.035 });
    },
  },
  // Starter cranks through six compression strokes, then the engine coughs into life.
  ignition: {
    gap: 0.9,
    vary: 0.02,
    level: 0.62,
    build: (v, t, player) => {
      const chugs = [0.02, 0.13, 0.235, 0.335, 0.43, 0.52].map((delay) => t + delay);
      const catchAt = t + IGNITION_CATCH;
      const { ring } = rattle(v, t, catchAt + 0.06, {
        times: chugs,
        peak: (index) => 0.8 + 0.04 * index,
        attack: 0.02,
        decay: 0.13,
        noise: { type: 'lowpass', frequency: 320, q: 0.707, level: 0.1 },
        ring: { shape: 'sawtooth', frequency: 235, level: 0.1, lowpass: 1100 },
      });
      // The starter motor sags on every stroke and speeds up between them.
      for (const chug of chugs) {
        ring?.frequency.setTargetAtTime(v.hz(262), chug, 0.012);
        ring?.frequency.setTargetAtTime(v.hz(228), chug + 0.045, 0.03);
      }
      tone(v, t, { from: 1080, to: 1240, glide: 0.5, peak: 0.012, attack: 0.04, hold: 0.52, decay: 0.08 });
      burst(v, catchAt, { type: 'lowpass', from: 900, to: 320, peak: 0.13, attack: 0.006, decay: 0.3 });
      tone(v, catchAt, { from: 90, to: 56, peak: 0.12, attack: 0.006, decay: 0.3 });
      if (!player.engineSet) player.offerFlare(revFlare(v, catchAt), catchAt);
    },
  },
  // Engine sputters out in slowing puffs, then hot metal ticks.
  shutdown: {
    gap: 0.6,
    vary: 0.03,
    level: 1,
    build: (v, t) => {
      const levels = [1, 0.85, 0.7, 0.5, 0.32];
      const { ring } = rattle(v, t, t + 0.7, {
        times: [0, 0.07, 0.16, 0.28, 0.44].map((delay) => t + delay),
        peak: (index) => levels[index],
        attack: 0.006,
        decay: 0.1,
        noise: { type: 'lowpass', frequency: 420, q: 0.707, level: 0.12 },
        ring: { shape: 'triangle', frequency: 80, level: 0.13 },
      });
      ring?.frequency.setValueAtTime(v.hz(80), t);
      ring?.frequency.exponentialRampToValueAtTime(v.hz(46), t + 0.5);
      burst(v, t + 0.56, { from: 2000, q: 1.5, peak: 0.02, decay: 0.03 });
      tone(v, t + 0.58, { from: 3100, peak: 0.012, decay: 0.09 });
    },
  },
  // Whoosh: air sweeps up, then falls away.
  recover: {
    gap: 0.4,
    vary: 0.03,
    level: 0.67,
    build: (v, t) => {
      burst(v, t, { from: 280, to: 2600, q: 1.1, peak: 0.09, attack: 0.2, decay: 0.2 });
      burst(v, t + 0.2, { from: 2600, to: 500, q: 1.1, peak: 0.07, attack: 0.06, decay: 0.4 });
      tone(v, t, { from: 420, to: 1260, glide: 0.32, peak: 0.03, attack: 0.16, decay: 0.3 });
    },
  },
  // Single bright bell ping.
  checkpoint: {
    gap: 0.15,
    vary: 0,
    level: 0.54,
    build: (v, t) => {
      burst(v, t, { from: 4000, peak: 0.012, decay: 0.012 });
      bell(v, t, 1760, 0.15, 1.1, 0.3);
    },
  },
  // Two chimes rising a fifth; the second is the checkpoint note, resolved.
  lapComplete: {
    gap: 0.5,
    vary: 0,
    level: 0.52,
    build: (v, t) => {
      bell(v, t, 1174.66, 0.13, 0.6, 0.3);
      bell(v, t + 0.15, 1760, 0.15, 1.3, 0.3);
      tone(v, t + 0.15, { from: 587.33, peak: 0.04, decay: 0.8 });
    },
  },
  // Three-note brass fanfare, the last note held as a chord.
  medal: {
    gap: 0.8,
    vary: 0,
    level: 0.62,
    build: (v, t) => {
      brass(v, t, 523.25, 0.1, 0.1);
      brass(v, t + 0.13, 659.25, 0.1, 0.1);
      brass(v, t + 0.26, 783.99, 0.5, 0.11);
      brass(v, t + 0.26, 523.25, 0.5, 0.05);
      brass(v, t + 0.26, 1046.5, 0.5, 0.04);
    },
  },
  // Sparkle: a quick run of high pings, each doubled slightly sharp so it shimmers.
  find: {
    gap: 0.3,
    vary: 0,
    level: 0.8,
    build: (v, t) => {
      [1318.5, 1760, 1975.5, 2637, 2960, 3951].forEach((frequency, index) => {
        const at = t + index * 0.045 + rand(0, 0.012);
        const peak = 0.07 - index * 0.007;
        tone(v, at, { from: frequency, peak, decay: 0.3 + index * 0.03 });
        tone(v, at, { from: frequency * 1.004, peak: peak * 0.5, decay: 0.35 });
      });
      burst(v, t, { from: 6500, q: 2, peak: 0.008, attack: 0.08, decay: 0.3 });
    },
  },
  // Glockenspiel arpeggio up a major chord.
  unlock: {
    gap: 0.5,
    vary: 0,
    level: 0.64,
    build: (v, t) => {
      [1046.5, 1318.5, 1568, 2093].forEach((frequency, index) => {
        bell(v, t + index * 0.085, frequency, 0.11, index === 3 ? 1.4 : 0.7);
      });
    },
  },
  // Lever ratchet: clicks tighten and slow, then the pawl seats.
  handbrake: {
    gap: 0.15,
    vary: 0.05,
    level: 1,
    build: (v, t) => {
      const { band } = rattle(v, t, t + 0.3, {
        times: [0, 0.026, 0.055, 0.088, 0.126, 0.17].map((delay) => t + delay),
        peak: (index) => 0.6 + 0.08 * index,
        attack: 0.001,
        decay: 0.016,
        noise: { type: 'bandpass', frequency: 2100, q: 2, level: 0.1 },
        ring: { shape: 'sine', frequency: 1650, level: 0.035 },
      });
      band?.frequency.setValueAtTime(v.hz(2100), t);
      band?.frequency.linearRampToValueAtTime(v.hz(2900), t + 0.17);
      tone(v, t + 0.2, { from: 190, to: 140, peak: 0.07, decay: 0.07 });
    },
  },
  // Low body impact. Callers scale it with options.volume.
  thud: {
    gap: 0.06,
    vary: 0.08,
    level: 0.8,
    build: (v, t) => {
      tone(v, t, { from: 95, to: 52, glide: 0.09, peak: 0.16, decay: 0.24 });
      tone(v, t, { from: 190, to: 120, peak: 0.08, decay: 0.1 });
      burst(v, t, { type: 'lowpass', from: 420, peak: 0.12, decay: 0.12 });
      burst(v, t, { from: 900, q: 0.8, peak: 0.07, decay: 0.05 });
    },
  },
  // Metal dragged over a hard edge: ringing bands with a chatter.
  scrape: {
    gap: 0.12,
    vary: 0.1,
    level: 0.68,
    build: (v, t) => {
      const end = t + 0.36;
      const amp = v.gain();
      envelope(amp.gain, t, 1, 0.02, 0.1, 0.22);
      const chatter = v.gain(0.6);
      v.osc('sawtooth', 64, t, end).connect(v.gain(0.4)).connect(chatter.gain);
      const source = v.noise(t, end);
      for (const [frequency, q, level] of [[640, 3, 0.5], [1250, 5, 1], [2850, 7, 0.6]] as const) {
        const band = v.filter('bandpass', frequency, q);
        band.frequency.setValueAtTime(v.hz(frequency), t);
        band.frequency.exponentialRampToValueAtTime(v.hz(frequency * 0.86), end);
        const mix = v.gain(level * 0.08 * noiseMakeup(v.ctx, 'bandpass', v.hz(frequency), q));
        source.connect(band).connect(mix).connect(chatter);
      }
      chatter.connect(amp).connect(v.out);
    },
  },
  // Rocker switch: a high click, then a lower clack.
  lightSwitch: {
    gap: 0.1,
    vary: 0.03,
    level: 1,
    build: (v, t) => {
      burst(v, t, { from: 3400, q: 1.6, peak: 0.05, decay: 0.02 });
      tone(v, t, { from: 950, to: 800, peak: 0.03, decay: 0.03 });
      burst(v, t + 0.055, { from: 1900, q: 1.4, peak: 0.07, decay: 0.03 });
      tone(v, t + 0.055, { from: 620, to: 480, peak: 0.05, decay: 0.05 });
    },
  },
  // Camera shutter: mirror slap, curtain buzz, close.
  shutter: {
    gap: 0.2,
    vary: 0.02,
    level: 1.25,
    build: (v, t) => {
      burst(v, t, { from: 2700, q: 1.2, peak: 0.08, decay: 0.025 });
      tone(v, t, { from: 240, to: 170, peak: 0.07, decay: 0.045 });
      const buzz = v.osc('sawtooth', 330, t + 0.012, t + 0.1);
      const amp = v.gain();
      envelope(amp.gain, t + 0.012, 0.035, 0.004, 0.045, 0.03);
      buzz.connect(v.filter('bandpass', 1600, 1)).connect(amp).connect(v.out);
      burst(v, t + 0.075, { from: 4200, q: 1.3, peak: 0.06, decay: 0.022 });
      burst(v, t + 0.075, { from: 1300, peak: 0.04, decay: 0.045 });
    },
  },
  // Blow-off valve: boost dumped to the air when the throttle shuts. A sharp sneeze that falls in pitch, then flutters.
  blowoff: {
    gap: 0.25,
    vary: 0.06,
    level: 0.7,
    build: (v, t) => {
      burst(v, t, { type: 'highpass', from: 5200, to: 1700, peak: 0.07, attack: 0.004, hold: 0.03, decay: 0.2 });
      burst(v, t, { from: 2600, to: 900, q: 1.6, peak: 0.06, attack: 0.004, decay: 0.18 });
      for (const delay of [0.11, 0.16, 0.2]) burst(v, t + delay, { from: 1500, q: 2, peak: 0.022, attack: 0.003, decay: 0.03 });
    },
  },
  // Nitrous valve opening: a rising hiss that lands on a low thump from the exhaust.
  nitroStart: {
    gap: 0.4,
    vary: 0.04,
    level: 0.8,
    build: (v, t) => {
      burst(v, t, { from: 900, to: 4200, q: 0.9, peak: 0.09, attack: 0.05, hold: 0.04, decay: 0.3 });
      tone(v, t + 0.03, { from: 110, to: 58, glide: 0.12, peak: 0.14, attack: 0.008, decay: 0.32 });
      burst(v, t + 0.03, { type: 'lowpass', from: 500, peak: 0.1, decay: 0.14 });
    },
  },
  // One flat bang from an open tailpipe.
  backfire: {
    gap: 0.12,
    vary: 0.12,
    level: 0.75,
    build: (v, t) => {
      tone(v, t, { from: 150, to: 60, glide: 0.05, peak: 0.16, attack: 0.001, decay: 0.16 });
      burst(v, t, { from: 1100, q: 0.7, peak: 0.13, attack: 0.001, decay: 0.07 });
      burst(v, t + 0.012, { type: 'lowpass', from: 700, peak: 0.09, decay: 0.12 });
    },
  },
  // Sold: keys dropped on the counter, then the till rings and its drawer runs out.
  sold: {
    gap: 0.6,
    vary: 0,
    level: 0.62,
    build: (v, t) => {
      for (const [delay, frequency] of [[0, 4200], [0.03, 5300], [0.07, 3600]] as const) tone(v, t + delay, { from: frequency, peak: 0.02, decay: 0.09 });
      burst(v, t, { from: 3200, q: 1.4, peak: 0.04, decay: 0.05 });
      bell(v, t + 0.22, 1568, 0.12, 0.9);
      bell(v, t + 0.22, 2093, 0.07, 0.8);
      tone(v, t + 0.32, { from: 140, to: 82, peak: 0.12, decay: 0.16 });
      burst(v, t + 0.32, { type: 'lowpass', from: 420, peak: 0.08, decay: 0.09 });
      bell(v, t + 0.44, 2637, 0.08, 1.2, 0.2);
    },
  },
  // Tiny mechanical clunk with a detent tick.
  gearShift: {
    gap: 0.08,
    vary: 0.06,
    level: 1,
    build: (v, t) => {
      tone(v, t, { from: 230, to: 150, glide: 0.03, peak: 0.11, decay: 0.07 });
      burst(v, t, { from: 780, peak: 0.06, decay: 0.045 });
      burst(v, t + 0.018, { from: 2300, q: 1.5, peak: 0.025, decay: 0.014 });
    },
  },
};

const STEPS: Record<SurfaceKind, (voice: Voice, at: number) => void> = {
  asphalt: (v, t) => {
    burst(v, t, { from: 700, q: 0.9, peak: 0.07, decay: 0.06 });
    burst(v, t, { from: 2100, q: 1.2, peak: 0.02, decay: 0.014 });
    tone(v, t, { from: 120, to: 80, peak: 0.05, decay: 0.07 });
  },
  // Harder and a touch brighter than asphalt.
  concrete: (v, t) => {
    burst(v, t, { from: 950, peak: 0.07, decay: 0.08 });
    burst(v, t, { from: 2600, q: 1.3, peak: 0.03, decay: 0.016 });
    tone(v, t, { from: 135, to: 90, peak: 0.04, decay: 0.06 });
  },
  // A few stones shift a moment after the foot lands.
  gravel: (v, t) => {
    burst(v, t, { from: rand(1500, 2100), q: 0.8, peak: 0.07, decay: 0.05 });
    burst(v, t + rand(0.012, 0.03), { from: rand(2200, 3200), q: 0.9, peak: 0.05, decay: 0.07 });
    burst(v, t + rand(0.035, 0.06), { from: rand(1200, 1800), q: 0.8, peak: 0.035, decay: 0.08 });
    burst(v, t, { type: 'lowpass', from: 260, peak: 0.05, decay: 0.08 });
  },
  grass: (v, t) => {
    burst(v, t, { type: 'lowpass', from: 600, peak: 0.06, attack: 0.008, decay: 0.11 });
    burst(v, t + 0.01, { from: 3000, q: 0.5, peak: 0.012, attack: 0.01, decay: 0.07 });
  },
};

// Fitting an engine is the same powered wrench, a touch lower and slower.
RECIPES.ratchet = { ...RECIPES.install, vary: 0.02, level: RECIPES.install.level * 0.9 };

export class SfxPlayer {
  /** True while an engine voice exists; the ignition then leaves the catch to it. */
  engineSet = false;
  private flare?: { gain: AudioParam; at: number };
  private readonly lastAt = new Map<string, number>();
  /** End times of the voices still sounding, for the polyphony cap. */
  private busyUntil: number[] = [];
  private foot = 1;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly noiseBuffer: AudioBuffer,
    private readonly destination: AudioNode,
  ) {}

  /** Returns the scheduled start time, or -1 when the sound was skipped. */
  play(name: SfxName, options: SfxOptions = {}): number {
    const recipe = Object.hasOwn(RECIPES, name) ? RECIPES[name] : undefined;
    if (!recipe) return -1;
    const volume = clamp(finite(options.volume ?? 1, 1), 0, 1.5);
    if (volume <= 0 || !this.admit(name, recipe.gap)) return -1;
    const pitch = clamp(finite(options.pitch ?? 1, 1), 0.25, 4) * (1 + rand(-recipe.vary, recipe.vary));
    const pan = clamp(finite(options.pan ?? 0, 0), -1, 1);
    const at = this.ctx.currentTime + LOOKAHEAD;
    return this.run(recipe.level * volume, pan, pitch, (voice) => recipe.build(voice, at, this)) ? at : -1;
  }

  footstep(surface: SurfaceKind, running: boolean): void {
    if (!Object.hasOwn(STEPS, surface) || !this.admit('footstep', 0.08)) return;
    // Alternate feet a little left and right.
    this.foot = -this.foot;
    const level = FOOTSTEP_LEVEL * (running ? 1.3 : 1) * rand(0.8, 1.1);
    const pitch = rand(0.92, 1.08) * (running ? 1.06 : 1);
    const at = this.ctx.currentTime + LOOKAHEAD;
    this.run(level, this.foot * 0.12, pitch, (voice) => STEPS[surface](voice, at));
  }

  /** Called by the ignition recipe when it had to supply its own rev flare. */
  offerFlare(gain: AudioParam, at: number): void {
    this.flare = { gain, at };
  }

  /** An engine voice has arrived and will do the catch itself. */
  withdrawFlare(): void {
    const flare = this.flare;
    this.flare = undefined;
    const now = this.ctx.currentTime;
    if (!flare || now > flare.at + 0.75) return;
    flare.gain.cancelScheduledValues(now);
    flare.gain.setTargetAtTime(0, now, 0.05);
  }

  /** Refuses a sound that would retrigger too soon or push past the polyphony cap. */
  private admit(key: string, gap: number): boolean {
    const now = this.ctx.currentTime;
    this.busyUntil = this.busyUntil.filter((end) => end > now);
    if (this.busyUntil.length >= MAX_VOICES) return false;
    const last = this.lastAt.get(key);
    if (last !== undefined && now - last < gap) return false;
    this.lastAt.set(key, now);
    return true;
  }

  private run(level: number, pan: number, pitch: number, build: (voice: Voice) => void): boolean {
    const voice = new Voice(this.ctx, this.noiseBuffer, this.destination, level, pan, pitch);
    try {
      build(voice);
      voice.release();
      this.busyUntil.push(voice.endsAt);
      return true;
    } catch {
      voice.dispose();
      return false;
    }
  }
}
