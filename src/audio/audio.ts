/**
 * Game audio. Two layers share one Web Audio graph: recordings bundled with the game (engines,
 * tires, ambience, tools, the horn) and a synthesizer that covers every one of them until they
 * have decoded, or for good if they cannot. Nothing is fetched from outside the game's own
 * files and there are no libraries. If audio is missing or blocked the game keeps running
 * silently; no public method ever throws.
 */
import { Ambience } from './ambience';
import { BoostVoice } from './boost';
import { EngineVoice } from './engine';
import { Horn } from './horn';
import { RoadVoice } from './road';
import { SAMPLED_CATCH, SampleBank, SampledAmbience, SampledBoost, SampledEngine, SampledHorn, SampledRoad, SampledSteps, clipFor } from './sampled';
import { IGNITION_CATCH, SfxPlayer } from './sfx';
import { clamp, clamp01, createNoiseBuffer, finite } from './synth';
import type {
  AmbienceState,
  DriveAudioState,
  EngineProfile,
  ExhaustNote,
  SfxName,
  SfxOptions,
  SurfaceKind,
  VolumeSettings,
} from './types';

export { firingFrequency } from './engine';
export type {
  AmbienceState,
  DriveAudioState,
  EngineFamily,
  EngineProfile,
  ExhaustNote,
  SfxName,
  SfxOptions,
  SurfaceKind,
  VolumeSettings,
} from './types';

/** Time constant for mute, pause and volume changes: settled in about 80 ms, no clicks. */
const FADE = 0.027;
/** Seconds without driving updates before the car is treated as parked. */
const DRIVE_TIMEOUT = 0.15;
/** A sound requested this soon after start() may play even though the context is still waking. */
const WAKE_GRACE_MS = 500;

type ContextClass = new () => AudioContext;

function contextClass(): ContextClass | undefined {
  const scope = globalThis as { AudioContext?: ContextClass; webkitAudioContext?: ContextClass };
  return scope.AudioContext ?? scope.webkitAudioContext;
}

function fade(param: AudioParam, value: number, now: number): void {
  param.cancelScheduledValues(now);
  param.setTargetAtTime(value, now, FADE);
}

function closeQuietly(ctx: AudioContext | undefined): void {
  try {
    void Promise.resolve(ctx?.close()).catch(() => undefined);
  } catch {
    // Already closed.
  }
}

const EXHAUST_NOTES: readonly ExhaustNote[] = ['stock', 'sport', 'race'];

function cleanProfile(profile: EngineProfile | null): EngineProfile | null {
  if (!profile || typeof profile !== 'object') return null;
  const exhaust = EXHAUST_NOTES.includes(profile.exhaust as ExhaustNote) ? profile.exhaust as ExhaustNote : 'stock';
  return { family: profile.family, power: clamp(finite(profile.power, 110), 60, 700), exhaust };
}

/** The synthesized and the recorded voices are interchangeable behind these shapes. */
interface EngineLike {
  update(rpm: number, throttle: number, dt: number): void;
  hold(time: number): void;
  stop(quick?: boolean): void;
}
interface RoadLike {
  update(state: DriveAudioState, dt: number): void;
  silence(): void;
  dispose(): void;
}
interface BedLike {
  update(state: AmbienceState, dt: number, quiet: boolean): void;
  dispose(): void;
}
/** Turbocharger whistle and nitrous rush. */
interface BoostLike {
  update(state: DriveAudioState, dt: number): void;
  silence(): void;
  dispose(): void;
}

interface Graph {
  ctx: AudioContext;
  noise: AudioBuffer;
  master: GainNode;
  sfxBus: GainNode;
  engineBus: GainNode;
  ambienceBus: GainNode;
  sfx: SfxPlayer;
  road: RoadLike;
  boost: BoostLike;
  horn: Horn;
  bed: BedLike;
  /** Recordings; empty until they have decoded. */
  bank: SampleBank;
  steps?: SampledSteps;
  klaxon?: SampledHorn;
}

export class GameAudio {
  private graph?: Graph;
  private voice?: EngineLike;
  private profile: EngineProfile | null = null;
  private readonly volumes: VolumeSettings = { master: 1, sfx: 1, ambience: 1 };
  private mute = false;
  private paused = false;
  private hidden = false;
  private broken = false;
  /** Context time at which a playing ignition sound hands over to the engine. */
  private catchAt = -Infinity;
  private parkedFor = 0;
  private wokeAt = 0;

  private readonly onVisibility = (): void => {
    this.hidden = typeof document !== 'undefined' && document.hidden;
    this.mix();
    // Some browsers leave the context asleep after a trip to the background.
    if (!this.hidden && this.graph) this.wake(this.graph.ctx);
  };

  /** Mutes everything without tearing the graph down. */
  get muted(): boolean {
    return this.mute;
  }

  set muted(value: boolean) {
    this.mute = Boolean(value);
    this.mix();
  }

  /** True once an AudioContext exists and is running. */
  get ready(): boolean {
    return this.graph?.ctx.state === 'running';
  }

  /** How many bundled recordings have decoded so far. Zero until the first click, or without Web Audio. */
  get clips(): number {
    return this.graph?.bank.size ?? 0;
  }

  /** Which voices are currently playing from recordings rather than the synthesizer. */
  get recorded(): string[] {
    const graph = this.graph;
    if (!graph) return [];
    return [
      graph.road instanceof SampledRoad && 'road',
      graph.bed instanceof SampledAmbience && 'ambience',
      graph.steps && 'steps',
      graph.klaxon && 'horn',
      this.voice instanceof SampledEngine && 'engine',
      graph.boost instanceof SampledBoost && 'boost',
    ].filter((name): name is string => typeof name === 'string');
  }

  /**
   * What the engine voice is made from right now: the pair of recordings in use (`engine-v8`, or `engine-v8-sport`
   * with a modified exhaust), `synth` with the family and exhaust while the synthesizer is standing in, or `none`.
   */
  get engineSource(): string {
    if (this.voice instanceof SampledEngine) return this.voice.source;
    if (!this.voice || !this.profile) return 'none';
    return 'synth-' + this.profile.family + (this.profile.exhaust && this.profile.exhaust !== 'stock' ? '-' + this.profile.exhaust : '');
  }

  /** Call from a user gesture. Creates the context and graph on first call, resumes it afterwards. */
  start(): void {
    try {
      if (!this.graph && !this.broken) {
        this.graph = this.build();
        if (this.graph) this.restore();
      }
      const ctx = this.graph?.ctx;
      if (!ctx || ctx.state === 'running') return;
      this.wokeAt = Date.now();
      this.wake(ctx);
    } catch {
      // Audio is optional; the game carries on without it.
    }
  }

  /** 0..1 each. Safe before start(). */
  setVolumes(volumes: Partial<VolumeSettings>): void {
    for (const key of ['master', 'sfx', 'ambience'] as const) {
      const value = volumes?.[key];
      if (typeof value === 'number' && Number.isFinite(value)) this.volumes[key] = clamp01(value);
    }
    this.mix();
  }

  /** Fades engine, tires and ambience to silence while paused. UI sounds still play. */
  setPaused(paused: boolean): void {
    this.paused = Boolean(paused);
    this.mix();
    // A horn held into the pause menu would otherwise blare again on resume.
    if (this.paused) this.horn(false);
  }

  /** Start (profile) or stop (null) the engine voice. Starting plays no ignition by itself. */
  setEngine(profile: EngineProfile | null): void {
    try {
      const next = cleanProfile(profile);
      const current = this.profile;
      const unchanged = next?.family === current?.family && next?.power === current?.power && next?.exhaust === current?.exhaust;
      // Repeat calls are free, but a voice that failed to build earlier gets another try.
      if (unchanged && (this.voice || !next || !this.graph)) return;
      this.profile = next;
      this.restartEngine();
    } catch {
      // Stay silent.
    }
  }

  /** Call every rendered frame while driving. dt in seconds. */
  updateDrive(state: DriveAudioState, dt: number): void {
    const graph = this.graph;
    if (!graph || !state || !this.live(graph)) return;
    try {
      this.parkedFor = 0;
      this.voice?.update(state.rpm, state.throttle, dt);
      graph.road.update(state, dt);
      graph.boost.update(state, dt);
    } catch {
      // Stay silent.
    }
  }

  /** Call every rendered frame. */
  updateAmbience(state: AmbienceState, dt: number): void {
    const graph = this.graph;
    if (!graph || !state || !this.live(graph)) return;
    try {
      graph.bed.update(state, dt, this.mute || this.hidden);
      // No driving updates lately means the player left the car: let it settle on its own.
      this.parkedFor += clamp(finite(dt, 0), 0, 1);
      if (this.parkedFor > DRIVE_TIMEOUT) {
        this.voice?.update(0, 0, dt);
        graph.road.silence();
        graph.boost.silence();
      }
    } catch {
      // Stay silent.
    }
  }

  /** One footstep. The game calls this on each stride. */
  footstep(surface: SurfaceKind, running: boolean): void {
    const graph = this.graph;
    if (!graph || this.paused || !this.audible(graph)) return;
    try {
      if (graph.steps?.play(surface, Boolean(running), graph.sfxBus)) return;
      graph.sfx.footstep(surface, Boolean(running));
    } catch {
      // Stay silent.
    }
  }

  /** One-shot effect. Unknown or failed sounds are ignored. */
  play(name: SfxName, options?: SfxOptions): void {
    const graph = this.graph;
    if (!graph || !this.audible(graph)) return;
    try {
      const clip = clipFor(name, this.profile?.family ?? null);
      let at = graph.bank.play(clip, graph.sfxBus, options ?? {});
      const recorded = at >= 0;
      if (!recorded) at = graph.sfx.play(name, options ?? {});
      if (name === 'ignition' && at >= 0) {
        // The engine voice stays quiet while the starter cranks, then catches.
        this.catchAt = at + (recorded ? graph.bank.duration(clip) * SAMPLED_CATCH : IGNITION_CATCH);
        this.voice?.hold(this.catchAt);
      }
    } catch {
      // Stay silent.
    }
  }

  /** Car horn held down or released. */
  horn(on: boolean): void {
    try {
      const graph = this.graph;
      if (!graph) return;
      const active = Boolean(on) && !this.paused;
      const family = this.profile?.family ?? null;
      const recorded = graph.klaxon?.set(active, family) ?? false;
      graph.horn.set(active && !recorded, family);
    } catch {
      // Stay silent.
    }
  }

  /** Same as play('click'); kept for existing callers. */
  click(): void {
    this.play('click');
  }

  /** Stop every voice and close the context. */
  dispose(): void {
    const graph = this.graph;
    const voice = this.voice;
    this.graph = undefined;
    this.voice = undefined;
    this.profile = null;
    this.catchAt = -Infinity;
    if (!graph) return;
    try {
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibility);
      voice?.stop(true);
      graph.klaxon?.dispose();
      graph.horn.dispose();
      graph.road.dispose();
      graph.boost.dispose();
      graph.bed.dispose();
      graph.master.disconnect();
    } catch {
      // Closing the context below silences whatever is left.
    }
    closeQuietly(graph.ctx);
  }

  private build(): Graph | undefined {
    const Context = contextClass();
    if (!Context) return undefined;
    let ctx: AudioContext | undefined;
    try {
      ctx = new Context();
      const noise = createNoiseBuffer(ctx);
      const sfxBus = ctx.createGain();
      const engineBus = ctx.createGain();
      const ambienceBus = ctx.createGain();
      // Gentle glue: only catches the peaks when several loud things land together.
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -12;
      limiter.knee.value = 10;
      limiter.ratio.value = 4;
      limiter.attack.value = 0.004;
      limiter.release.value = 0.2;
      const master = ctx.createGain();
      for (const bus of [sfxBus, engineBus, ambienceBus]) bus.connect(limiter);
      limiter.connect(master).connect(ctx.destination);
      const bank: SampleBank = new SampleBank(ctx, () => this.adopt(bank));
      return {
        ctx,
        noise,
        master,
        sfxBus,
        engineBus,
        ambienceBus,
        sfx: new SfxPlayer(ctx, noise, sfxBus),
        road: new RoadVoice(ctx, noise, engineBus),
        boost: new BoostVoice(ctx, noise, engineBus),
        horn: new Horn(ctx, noise, engineBus),
        bed: new Ambience(ctx, noise, ambienceBus),
        bank,
      };
    } catch {
      // A half-built graph is worse than none. Give up for good so contexts do not pile up.
      this.broken = true;
      closeQuietly(ctx);
      return undefined;
    }
  }

  /** The recordings have decoded: hand each voice that has one over from the synthesizer. */
  private adopt(bank: SampleBank): void {
    const graph = this.graph;
    if (!graph || graph.bank !== bank || !bank.size) return;
    const swap = (task: () => void): void => {
      try {
        task();
      } catch {
        // That voice stays synthesized.
      }
    };
    swap(() => {
      if (!SampledRoad.available(bank)) return;
      const old = graph.road;
      graph.road = new SampledRoad(graph.ctx, bank, graph.engineBus);
      old.dispose();
    });
    swap(() => {
      if (!SampledBoost.available(bank)) return;
      const old = graph.boost;
      graph.boost = new SampledBoost(graph.ctx, bank, graph.engineBus);
      old.dispose();
    });
    swap(() => {
      if (!SampledAmbience.available(bank)) return;
      const old = graph.bed;
      graph.bed = new SampledAmbience(graph.ctx, bank, graph.ambienceBus);
      old.dispose();
    });
    swap(() => (graph.steps = new SampledSteps(graph.ctx, bank)));
    swap(() => (graph.klaxon = new SampledHorn(graph.ctx, bank, graph.engineBus)));
    swap(() => {
      if (this.profile && SampledEngine.available(bank, this.profile.family)) this.restartEngine();
    });
  }

  /** Applies whatever the game asked for before the graph existed. */
  private restore(): void {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibility);
      this.hidden = document.hidden;
    }
    this.mix(true);
    this.restartEngine();
  }

  /** Pushes volume, mute and pause state to the buses. Engine and tires follow the sfx volume. */
  private mix(immediate = false): void {
    const graph = this.graph;
    if (!graph) return;
    try {
      const now = graph.ctx.currentTime;
      // A hidden tab should not keep droning, so it is treated like a pause.
      const world = this.paused || this.hidden ? 0 : 1;
      const targets: [AudioParam, number][] = [
        [graph.master.gain, this.mute ? 0 : this.volumes.master],
        [graph.sfxBus.gain, this.volumes.sfx],
        [graph.engineBus.gain, this.volumes.sfx * world],
        [graph.ambienceBus.gain, this.volumes.ambience * world],
      ];
      for (const [param, value] of targets) {
        if (immediate) param.value = value;
        else fade(param, value, now);
      }
    } catch {
      // Stay silent.
    }
  }

  private restartEngine(): void {
    this.voice?.stop();
    this.voice = undefined;
    const graph = this.graph;
    if (!graph) return;
    graph.sfx.engineSet = this.profile !== null;
    if (!this.profile) return;
    const now = graph.ctx.currentTime;
    // If a starter is still cranking, come in when it catches; if it just did, still flare.
    const cranking = this.catchAt > now;
    const justCaught = now - this.catchAt < 1;
    if (SampledEngine.available(graph.bank, this.profile.family)) {
      this.voice = new SampledEngine(graph.ctx, graph.bank, graph.engineBus, this.profile, cranking ? this.catchAt : now);
      return;
    }
    graph.sfx.withdrawFlare();
    this.voice = new EngineVoice(
      graph.ctx,
      graph.noise,
      graph.engineBus,
      this.profile,
      cranking ? this.catchAt : now,
      cranking || justCaught,
    );
  }

  /** Asks a sleeping context to run. Browsers honor this once the page has had a user gesture. */
  private wake(ctx: AudioContext): void {
    if (ctx.state === 'running' || ctx.state === 'closed') return;
    void Promise.resolve(ctx.resume()).catch(() => undefined);
  }

  /**
   * Per-frame updates only run while the world is audible and the clock is moving. On a
   * sleeping context every update would queue automation that is never consumed.
   */
  private live(graph: Graph): boolean {
    return !this.paused && graph.ctx.state === 'running';
  }

  /** One-shots are skipped while nobody can hear them, so they cannot pile up and burst out later. */
  private audible(graph: Graph): boolean {
    if (this.mute || this.hidden) return false;
    return graph.ctx.state === 'running' || Date.now() - this.wokeAt < WAKE_GRACE_MS;
  }
}
