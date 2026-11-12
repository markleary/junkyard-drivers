/** Public shapes for the game audio module. Kept free of Web Audio so game code and tests can import them anywhere. */

export type SurfaceKind = 'asphalt' | 'gravel' | 'concrete' | 'grass';

export type EngineFamily = 'i4' | 'v8' | 'v12';

/** How far the exhaust departs from the factory system: untouched, a free-flowing sport system, or straight-through pipes. */
export type ExhaustNote = 'stock' | 'sport' | 'race';

export interface EngineProfile {
  family: EngineFamily;
  /** Rated horsepower, 110 to 440. Louder and deeper with more power. */
  power: number;
  /** A modified exhaust has its own recordings and its own synthesizer voicing. Stock when left out. */
  exhaust?: ExhaustNote;
}

export interface DriveAudioState {
  /** 0 at idle, 1 at redline. Already smoothed by the game. */
  rpm: number;
  /** 0..1 accelerator load. */
  throttle: number;
  /** Signed forward speed in m/s. */
  speed: number;
  /** 0..1 how hard the tires are sliding (handbrake turns, skids). */
  slip: number;
  surface: SurfaceKind;
  /** True while at least one wheel touches the ground. */
  grounded: boolean;
  /** 0..1 turbocharger boost: the whistle of the turbine. Zero or left out for a car without one. */
  boost?: number;
  /** 1 while nitrous is flowing, otherwise 0. */
  nitro?: number;
}

export interface AmbienceState {
  /** 0 = full day, 1 = deep night. Birds by day, crickets at night. */
  night: number;
  /** 0 = outdoors, 1 = inside the garage or the parts store (muffled outdoors, soft room hum). */
  indoors: number;
  /** 0..1 gustiness; also rises with driving speed. */
  wind: number;
  /** 0..1 how much of the scrapyard is around the listener: loose sheet metal ticking in the wind. Optional. */
  yard?: number;
}

export type SfxName =
  | 'click' | 'open' | 'close' | 'buy' | 'install' | 'ratchet' | 'paint' | 'stamp' | 'error'
  | 'enterCar' | 'exitCar' | 'ignition' | 'shutdown' | 'recover'
  | 'checkpoint' | 'lapComplete' | 'medal' | 'find' | 'unlock'
  | 'handbrake' | 'thud' | 'scrape' | 'lightSwitch' | 'shutter' | 'gearShift'
  | 'blowoff' | 'nitroStart' | 'backfire' | 'sold';

export interface SfxOptions {
  volume?: number;
  /** Playback pitch multiplier, default 1. */
  pitch?: number;
  /** Stereo pan -1..1. */
  pan?: number;
}

export interface VolumeSettings {
  master: number;
  sfx: number;
  ambience: number;
}
