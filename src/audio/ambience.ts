/**
 * The quiet bed under everything: wind, daytime birds, night crickets and a soft room hum.
 * Continuous layers are built once; bird phrases are sparse one-shots scheduled from update().
 */
import type { AmbienceState } from './types';
import { Drift, Glide, Patch, clamp, clamp01, envelopeWave, finite, lerp, rand, smoothstep } from './synth';

const WIND_LEVEL = 0.1;
const RUSTLE_LEVEL = 0.03;
const BIRD_LEVEL = 0.045;
const CRICKET_LEVEL = 0.03;
const HUM_LEVEL = 0.08;
/** Outdoor sounds heard through a wall keep only what is below this. */
const MUFFLED_HZ = 700;
const OPEN_HZ = 16000;

interface Note {
  /** Seconds after the phrase starts. */
  at: number;
  length: number;
  from: number;
  to: number;
  level: number;
}

interface Phrase {
  shape: OscillatorType;
  /** Time constant of each note's attack; chirps snap, coos swell. */
  attack: number;
  notes: Note[];
}

const count = (min: number, max: number): number => min + Math.floor(Math.random() * (max - min + 1));

/** A few quick chirps, each sliding down. */
function sparrow(): Phrase {
  const base = rand(3600, 5000);
  const notes: Note[] = [];
  let at = 0;
  for (let i = count(2, 4); i > 0; i--) {
    notes.push({ at, length: 0.07, from: base * rand(1.15, 1.3), to: base, level: rand(0.7, 1) });
    at += rand(0.11, 0.17);
  }
  return { shape: 'sine', attack: 0.004, notes };
}

/** A short slurred melody, lower and sweeter. */
function whistler(): Phrase {
  const base = rand(2300, 3100);
  const steps = [1, 1.19, 0.94, 1.33, 1.12, 1.26, 0.89];
  const notes: Note[] = [];
  let at = 0;
  for (let i = count(3, 5); i > 0; i--) {
    const from = base * steps[count(0, steps.length - 1)];
    const length = rand(0.09, 0.17);
    notes.push({ at, length, from, to: from * rand(0.9, 1.12), level: rand(0.6, 1) });
    at += length + rand(0.02, 0.07);
  }
  return { shape: 'sine', attack: 0.006, notes };
}

/** One high note repeated fast, fading. */
function triller(): Phrase {
  const base = rand(4300, 5800);
  const gap = rand(0.05, 0.07);
  const notes = Array.from({ length: count(6, 11) }, (_, index) => ({
    at: index * gap,
    length: 0.035,
    from: base * 1.06,
    to: base,
    level: 1 - 0.05 * index,
  }));
  return { shape: 'sine', attack: 0.003, notes };
}

/** Two long pure notes, the second a third lower. */
function twoTone(): Phrase {
  const base = rand(3300, 4000);
  return {
    shape: 'sine',
    attack: 0.012,
    notes: [
      { at: 0, length: 0.24, from: base, to: base * 0.985, level: 1 },
      { at: 0.3, length: 0.28, from: base * 0.84, to: base * 0.83, level: 0.9 },
    ],
  };
}

/** Low three-part coo. Long notes carry, so it is kept quieter than the chirps. */
function dove(): Phrase {
  const base = rand(440, 520);
  return {
    shape: 'triangle',
    attack: 0.035,
    notes: [
      { at: 0, length: 0.22, from: base * 0.97, to: base, level: 0.5 },
      { at: 0.32, length: 0.46, from: base * 1.04, to: base * 0.99, level: 0.7 },
      { at: 0.9, length: 0.24, from: base * 0.98, to: base * 0.93, level: 0.45 },
    ],
  };
}

/** Repeats weight the pick: sparrows and whistlers are the common voices. */
const SONGS = [sparrow, sparrow, whistler, whistler, triller, twoTone, dove];

interface CricketKind {
  pitch: number;
  /** Chirps per second. */
  rate: number;
  /** Loudness of each wing pulse inside one chirp. */
  pulses: number[];
  /** Seconds per pulse, and between pulse starts. */
  width: number;
  spacing: number;
  pan: number;
  share: number;
  /** Chance of singing through each turn instead of resting. */
  stamina: number;
}

const CRICKETS: CricketKind[] = [
  // Two field crickets: three or four wing pulses per chirp, each at its own unhurried rate.
  {
    pitch: 4580, rate: 1.92, pulses: [0.7, 1, 0.9], width: 0.019, spacing: 0.034,
    pan: -0.5, share: 1, stamina: 0.85,
  },
  {
    pitch: 4140, rate: 1.41, pulses: [0.6, 0.9, 1, 0.8], width: 0.016, spacing: 0.03,
    pan: 0.55, share: 0.8, stamina: 0.85,
  },
  // Tree cricket: one long even trill instead of separate chirps. Kept faint and often resting.
  {
    pitch: 3350, rate: 43, pulses: [1], width: 1 / 43, spacing: 0,
    pan: 0.1, share: 0.22, stamina: 0.45,
  },
];

/** One cycle of a chirp: a few raised-cosine pulses, then silence until the next chirp. */
function chirpShape(kind: CricketKind, size = 512): Float32Array {
  const shape = new Float32Array(size);
  const period = 1 / kind.rate;
  kind.pulses.forEach((level, index) => {
    const start = index * kind.spacing;
    for (let i = 0; i < size; i++) {
      const phase = ((i / size) * period - start) / kind.width;
      if (phase >= 0 && phase < 1) shape[i] = Math.max(shape[i], level * (0.5 - 0.5 * Math.cos(2 * Math.PI * phase)));
    }
  });
  return shape;
}

interface Cricket {
  level: Glide;
  share: number;
  stamina: number;
  mood: Drift;
  awake: boolean;
  /** Seconds until it next falls silent or starts up again. */
  turn: number;
}

export class Ambience {
  private readonly patch: Patch;
  private readonly outdoor: BiquadFilterNode;
  private readonly muffle: Glide;
  private readonly outdoorLevel: Glide;
  private readonly windLevel: Glide;
  private readonly windTone: Glide;
  private readonly rustleLevel: Glide;
  private readonly humLevel: Glide;
  private readonly gust = new Drift(3);
  private readonly humDrift = new Drift(5);
  private readonly songs = new Set<Patch>();
  private crickets?: { level: Glide; voices: Cricket[] };
  private birdIn = rand(1, 3);

  constructor(ctx: BaseAudioContext, noiseBuffer: AudioBuffer, destination: AudioNode) {
    const patch = new Patch(ctx, noiseBuffer);
    this.patch = patch;

    // Everything outdoors shares one lowpass so stepping inside muffles it all at once.
    this.outdoor = patch.filter('lowpass', OPEN_HZ, 0.5);
    const outdoorLevel = patch.gain(1);
    this.outdoor.connect(outdoorLevel).connect(destination);

    const air = patch.noise();
    const windBand = patch.filter('bandpass', 420, 0.6);
    const wind = patch.gain(0);
    air.connect(windBand).connect(wind).connect(this.outdoor);
    // Leaves: a thin high band that only shows up in gusts.
    const rustle = patch.gain(0);
    air.connect(patch.filter('bandpass', 2800, 0.7)).connect(rustle).connect(this.outdoor);

    // Room tone: mostly ventilation rumble. Only a trace of mains hum, so it never reads as a fault.
    const hum = patch.gain(0);
    const vent = patch.noise();
    vent.connect(patch.filter('lowpass', 240)).connect(patch.gain(0.9)).connect(hum);
    vent.connect(patch.filter('bandpass', 480, 0.7)).connect(patch.gain(0.25)).connect(hum);
    patch.osc('sine', 100).connect(patch.gain(0.06)).connect(hum);
    patch.osc('sine', 200).connect(patch.gain(0.025)).connect(hum);
    hum.connect(destination);

    this.muffle = Glide.frequency(this.outdoor.frequency);
    this.outdoorLevel = Glide.gain(outdoorLevel.gain);
    this.windLevel = Glide.gain(wind.gain);
    this.windTone = Glide.frequency(windBand.frequency);
    this.rustleLevel = Glide.gain(rustle.gain);
    this.humLevel = Glide.gain(hum.gain);
  }

  /** `quiet` skips new bird phrases (muted or hidden), since nobody would hear them. */
  update(state: AmbienceState, dt: number, quiet: boolean): void {
    const now = this.patch.ctx.currentTime;
    const step = clamp(finite(dt, 0.016), 0, 0.1);
    const night = clamp01(finite(state.night, 0));
    const indoors = clamp01(finite(state.indoors, 0));
    const wind = clamp01(finite(state.wind, 0));

    this.muffle.to(OPEN_HZ * (MUFFLED_HZ / OPEN_HZ) ** indoors, now, 0.25);
    this.outdoorLevel.to(lerp(1, 0.35, indoors), now, 0.25);
    this.humLevel.to(HUM_LEVEL * indoors * (1 + 0.15 * this.humDrift.step(step)), now, 0.4);

    const gust = 0.5 + 0.5 * this.gust.step(step);
    const flow = 0.22 + 0.78 * wind;
    const breeze = flow * (0.55 + 0.45 * gust);
    this.windLevel.to(WIND_LEVEL * breeze, now, 0.5);
    this.windTone.to(300 + 520 * breeze, now, 0.6);
    this.rustleLevel.to(RUSTLE_LEVEL * flow ** 1.5 * gust ** 2 * (1 - 0.4 * night), now, 0.5);

    this.birds(1 - smoothstep(0.3, 0.8, night), now, step, quiet);
    this.chorus(smoothstep(0.45, 0.9, night), now, step);
  }

  dispose(): void {
    for (const song of this.songs) song.dispose();
    this.songs.clear();
    this.patch.dispose();
  }

  /** Counts down to the next phrase; the countdown runs slower as the day fades. */
  private birds(day: number, now: number, step: number, quiet: boolean): void {
    if (quiet || day < 0.03) return;
    this.birdIn -= step * day;
    if (this.birdIn > 0 || this.songs.size >= 4) return;
    this.birdIn = rand(2.2, 6.5);
    const song = SONGS[count(0, SONGS.length - 1)];
    const pan = rand(-0.8, 0.8);
    const loudness = BIRD_LEVEL * rand(0.35, 1);
    this.sing(song(), now + 0.05, loudness, pan);
    // Often a second bird answers from the other side.
    if (Math.random() < 0.35) {
      this.sing(song(), now + rand(0.9, 1.8), loudness * rand(0.4, 0.8), -pan * rand(0.5, 1));
    }
  }

  /** One oscillator plays the whole phrase; pitch and loudness are automated per note. */
  private sing(phrase: Phrase, at: number, loudness: number, pan: number): void {
    const last = phrase.notes[phrase.notes.length - 1];
    const patch = new Patch(this.patch.ctx, this.patch.noiseBuffer);
    const osc = patch.osc(phrase.shape, phrase.notes[0].from, at, at + last.at + last.length + 0.3);
    const amp = patch.gain(0);
    amp.gain.setValueAtTime(0, at);
    for (const note of phrase.notes) {
      const start = at + note.at;
      osc.frequency.setValueAtTime(note.from, start);
      osc.frequency.exponentialRampToValueAtTime(note.to, start + note.length);
      amp.gain.setTargetAtTime(loudness * note.level, start, phrase.attack);
      amp.gain.setTargetAtTime(0, start + note.length * 0.55, note.length * 0.18);
    }
    const panner = patch.panner(pan);
    osc.connect(amp);
    (panner ? amp.connect(panner) : amp).connect(this.outdoor);
    this.songs.add(patch);
    patch.release(() => this.songs.delete(patch));
  }

  private chorus(dark: number, now: number, step: number): void {
    // Crickets are only built the first time night actually falls.
    if (!this.crickets) {
      if (dark < 0.02) return;
      this.crickets = this.wakeCrickets();
    }
    this.crickets.level.to(CRICKET_LEVEL * dark, now, 0.6);
    for (const cricket of this.crickets.voices) {
      cricket.turn -= step;
      if (cricket.turn <= 0) {
        cricket.awake = Math.random() < cricket.stamina;
        cricket.turn = cricket.awake ? rand(4, 12) : rand(1.5, 5);
      }
      const level = cricket.awake ? cricket.share * (0.75 + 0.25 * cricket.mood.step(step)) : 0;
      cricket.level.to(level, now, 0.4);
    }
  }

  private wakeCrickets(): { level: Glide; voices: Cricket[] } {
    const patch = this.patch;
    const bus = patch.gain(0);
    bus.connect(this.outdoor);
    const voices = CRICKETS.map((kind) => {
      const harmonics = clamp(Math.ceil(2.5 / (kind.width * kind.rate)), 1, 96);
      const chirp = envelopeWave(patch.ctx, chirpShape(kind), harmonics);
      // The pulse oscillator swings the gain around its mean, tracing the chirp pattern.
      const amp = patch.gain(chirp.mean);
      patch.osc(chirp.wave, kind.rate).connect(patch.gain(chirp.swing)).connect(amp.gain);
      const out = patch.gain(0);
      const panner = patch.panner(kind.pan);
      patch.osc('sine', kind.pitch).connect(amp).connect(out);
      (panner ? out.connect(panner) : out).connect(bus);
      return {
        level: Glide.gain(out.gain),
        share: kind.share,
        stamina: kind.stamina,
        mood: new Drift(4),
        awake: true,
        turn: rand(3, 9),
      };
    });
    return { level: Glide.gain(bus.gain), voices };
  }
}
