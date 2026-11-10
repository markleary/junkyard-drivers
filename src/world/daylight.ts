/**
 * Time of day as plain numbers, independent of the renderer. Colours are linear
 * RGB triples so they can be interpolated and handed to lights without conversion.
 */
export type RGB = [number, number, number];
export type Vec3 = [number, number, number];

export interface SkySample {
  hour: number;
  /** Unit vector toward the sun; it sinks below the horizon at night. */
  sun: Vec3;
  moon: Vec3;
  /** The light that shades the scene and casts shadows: sun by day, moon after dusk. */
  key: Vec3;
  keyColor: RGB;
  keyIntensity: number;
  /** 1 in full daylight, 0 once the sun has set. */
  daylight: number;
  /** 0 by day, 1 when lamps, windows and headlights matter. */
  night: number;
  top: RGB;
  /** Sky colour a little above the horizon band. */
  mid: RGB;
  horizon: RGB;
  fog: RGB;
  fogDensity: number;
  hemiSky: RGB;
  hemiGround: RGB;
  hemiIntensity: number;
  exposure: number;
  environment: number;
  cloudLight: RGB;
  cloudShade: RGB;
  /** Colour of the glow around the sun and of fog lit from behind. */
  glow: RGB;
  stars: number;
}

interface Key {
  hour: number;
  top: RGB; mid: RGB; horizon: RGB; fog: RGB; fogDensity: number;
  hemiSky: RGB; hemiGround: RGB; hemiIntensity: number;
  sun: RGB; sunIntensity: number;
  exposure: number; environment: number;
  cloudLight: RGB; cloudShade: RGB; glow: RGB; stars: number;
}

const channel = (value: number) => {
  const c = value / 255;
  return c <= .04045 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4);
};
/** sRGB hex to linear RGB. */
export const rgb = (hex: number): RGB => [channel(hex >> 16 & 255), channel(hex >> 8 & 255), channel(hex & 255)];

const NIGHT: Omit<Key, 'hour'> = {
  top: rgb(0x050a1c), mid: rgb(0x101c3c), horizon: rgb(0x1f3157), fog: rgb(0x16223d), fogDensity: .0026,
  // Kept low: pale gravel under a strong blue fill reads as snow, not as a moonlit yard.
  hemiSky: rgb(0x5b7cbc), hemiGround: rgb(0x23263a), hemiIntensity: .68,
  sun: rgb(0xff7a5a), sunIntensity: 0, exposure: 1.12, environment: .8,
  cloudLight: rgb(0x4a5f90), cloudShade: rgb(0x0c142c), glow: rgb(0x18243f), stars: 1,
};

const KEYS: Key[] = [
  { hour: 0, ...NIGHT },
  { hour: 4.5, ...NIGHT },
  { hour: 5.5, top: rgb(0x21407a), mid: rgb(0x6c86b4), horizon: rgb(0xf3a678), fog: rgb(0xc49f92), fogDensity: .003,
    hemiSky: rgb(0x7a8cab), hemiGround: rgb(0x4a3f3a), hemiIntensity: .72, sun: rgb(0xff9a60), sunIntensity: 1.1,
    exposure: 1.04, environment: .7, cloudLight: rgb(0xffbe96), cloudShade: rgb(0x4c4a74), glow: rgb(0xff8648), stars: .15 },
  { hour: 6.7, top: rgb(0x2f66b4), mid: rgb(0x8cb2e0), horizon: rgb(0xf8d2a8), fog: rgb(0xd9c6b2), fogDensity: .0023,
    hemiSky: rgb(0x9db3d2), hemiGround: rgb(0x62564a), hemiIntensity: .78, sun: rgb(0xffc48c), sunIntensity: 2.5,
    exposure: 1, environment: .82, cloudLight: rgb(0xffe6c8), cloudShade: rgb(0x7a85a6), glow: rgb(0xffae6c), stars: 0 },
  { hour: 8.6, top: rgb(0x2f6fc6), mid: rgb(0x82b2e6), horizon: rgb(0xc8e0f4), fog: rgb(0xc4d9e9), fogDensity: .0016,
    hemiSky: rgb(0xb0c8e6), hemiGround: rgb(0x71675a), hemiIntensity: .93, sun: rgb(0xfff0da), sunIntensity: 3.1,
    exposure: 1, environment: .92, cloudLight: rgb(0xffffff), cloudShade: rgb(0x98abc6), glow: rgb(0xffeccc), stars: 0 },
  { hour: 12.5, top: rgb(0x2463bd), mid: rgb(0x78abe6), horizon: rgb(0xc3dcf3), fog: rgb(0xc1d7ea), fogDensity: .0013,
    hemiSky: rgb(0xb8d0ee), hemiGround: rgb(0x7b7062), hemiIntensity: .96, sun: rgb(0xfff6e8), sunIntensity: 3.5,
    exposure: 1, environment: 1, cloudLight: rgb(0xffffff), cloudShade: rgb(0xa2b4cc), glow: rgb(0xfff2d8), stars: 0 },
  { hour: 16, top: rgb(0x2a65ba), mid: rgb(0x86b0e2), horizon: rgb(0xd6e0e4), fog: rgb(0xcdd9dc), fogDensity: .0015,
    hemiSky: rgb(0xbcc4cc), hemiGround: rgb(0x8a7860), hemiIntensity: 1, sun: rgb(0xffe9c6), sunIntensity: 3.3,
    exposure: 1, environment: .72, cloudLight: rgb(0xfff6e6), cloudShade: rgb(0x9dabc2), glow: rgb(0xffe0ac), stars: 0 },
  { hour: 17.8, top: rgb(0x2a55a6), mid: rgb(0x8fa9d2), horizon: rgb(0xfbc888), fog: rgb(0xe2c4a0), fogDensity: .002,
    hemiSky: rgb(0xc2bbb0), hemiGround: rgb(0x9a7650), hemiIntensity: 1.1, sun: rgb(0xffc07a), sunIntensity: 3.2,
    exposure: 1, environment: .42, cloudLight: rgb(0xffd9a2), cloudShade: rgb(0x8c88a8), glow: rgb(0xffae54), stars: 0 },
  { hour: 19.1, top: rgb(0x223c7c), mid: rgb(0x7c7fae), horizon: rgb(0xff9654), fog: rgb(0xd69670), fogDensity: .0026,
    hemiSky: rgb(0xa39c9c), hemiGround: rgb(0x704e40), hemiIntensity: .9, sun: rgb(0xff8444), sunIntensity: 2.1,
    exposure: 1.02, environment: .5, cloudLight: rgb(0xffa06a), cloudShade: rgb(0x574e76), glow: rgb(0xff7636), stars: .05 },
  { hour: 19.8, top: rgb(0x121f4c), mid: rgb(0x383e7c), horizon: rgb(0xb0627a), fog: rgb(0x5b4d72), fogDensity: .0029,
    hemiSky: rgb(0x5d6ea0), hemiGround: rgb(0x302c3a), hemiIntensity: 1.1, sun: rgb(0xff7a5a), sunIntensity: .5,
    exposure: 1.12, environment: .7, cloudLight: rgb(0x8f6c90), cloudShade: rgb(0x20244a), glow: rgb(0xb2506a), stars: .5 },
  { hour: 20.7, ...NIGHT },
  { hour: 24, ...NIGHT },
];

const MOON: Vec3 = normalize([-.42, .78, .46]);
const MOON_COLOR = rgb(0xa9bff2);
const MOON_INTENSITY = .5;
export const SUNRISE = 5.5;
export const SUNSET = 19.5;

function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mixRGB = (a: RGB, b: RGB, t: number): RGB => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

export function wrapHour(hour: number): number {
  return ((hour % 24) + 24) % 24;
}

/** The sun rises behind the town, crosses over the street, and sets beyond the salvage rows. */
export function sunDirection(hour: number): Vec3 {
  const fraction = wrapHour(hour - SUNRISE) / (SUNSET - SUNRISE);
  const elevation = 60 * Math.PI / 180 * Math.sin(Math.PI * fraction);
  const azimuth = (-10 + 180 * fraction) * Math.PI / 180;
  return [Math.cos(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.sin(azimuth) * Math.cos(elevation)];
}

export function sampleSky(rawHour: number): SkySample {
  const hour = wrapHour(rawHour);
  let index = 0;
  while (index < KEYS.length - 2 && hour >= KEYS[index + 1].hour) index++;
  const a = KEYS[index], b = KEYS[index + 1];
  const t = (hour - a.hour) / (b.hour - a.hour);
  const sun = sunDirection(hour);
  const daylight = smoothstep(-.02, .1, sun[1]);
  const moonlight = 1 - smoothstep(-.13, -.03, sun[1]);
  const moonlit = sun[1] < -.03;
  // Keep the shadow-casting direction a few degrees above the horizon so shadows stay finite.
  const key = moonlit ? MOON : normalize([sun[0], Math.max(sun[1], .105), sun[2]]);
  const sunIntensity = mix(a.sunIntensity, b.sunIntensity, t) * daylight;
  return {
    hour, sun, moon: MOON, key,
    keyColor: moonlit ? MOON_COLOR : mixRGB(a.sun, b.sun, t),
    keyIntensity: moonlit ? MOON_INTENSITY * moonlight : sunIntensity,
    daylight,
    night: smoothstep(.2, -.04, sun[1]),
    top: mixRGB(a.top, b.top, t), mid: mixRGB(a.mid, b.mid, t), horizon: mixRGB(a.horizon, b.horizon, t),
    fog: mixRGB(a.fog, b.fog, t), fogDensity: mix(a.fogDensity, b.fogDensity, t),
    hemiSky: mixRGB(a.hemiSky, b.hemiSky, t), hemiGround: mixRGB(a.hemiGround, b.hemiGround, t),
    hemiIntensity: mix(a.hemiIntensity, b.hemiIntensity, t),
    exposure: mix(a.exposure, b.exposure, t), environment: mix(a.environment, b.environment, t),
    cloudLight: mixRGB(a.cloudLight, b.cloudLight, t), cloudShade: mixRGB(a.cloudShade, b.cloudShade, t),
    glow: mixRGB(a.glow, b.glow, t), stars: mix(a.stars, b.stars, t),
  };
}

export type TimeChoice = 'auto' | 'morning' | 'midday' | 'golden' | 'dusk' | 'night';
export const TIME_PRESETS: Record<Exclude<TimeChoice, 'auto'>, number> = { morning: 8.3, midday: 12.5, golden: 17.7, dusk: 19.5, night: 23 };
export const TIME_LABEL: Record<TimeChoice, string> = { auto: 'Day cycle', morning: 'Morning', midday: 'Midday', golden: 'Golden hour', dusk: 'Dusk', night: 'Night' };
/** A new shift starts in the warm afternoon, with most of an evening ahead. */
export const STARTING_HOUR = 16.6;

/**
 * The clock lingers through the long golden evening and hurries through the
 * small hours. One full day takes roughly half an hour of play.
 */
export function advanceHour(hour: number, seconds: number): number {
  const h = wrapHour(hour);
  const pace = h >= 20.7 || h < 4.4 ? 2.6 : h < 7 ? 1.2 : h < 15.5 ? 1.5 : h < 19.9 ? .62 : 1;
  return wrapHour(h + seconds * pace / 100);
}

export function clockLabel(hour: number): string {
  const h = wrapHour(hour), whole = Math.floor(h), minutes = Math.floor((h - whole) * 60 / 5) * 5;
  return `${String(whole).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
