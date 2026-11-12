import { UPGRADE_KINDS, type ShellId, type UpgradeKind } from './catalog';

/**
 * Everything a player earns by driving and exploring. Kept under its own
 * storage key, so the purchase and build save stays exactly as it was and
 * collections from the first release load unchanged.
 */
export const PROGRESS_KEY = 'junkyard-drivers-progress-v1';
export type Medal = 'bronze' | 'silver' | 'gold';
export type FinishId = 'gloss' | 'metallic' | 'matte' | 'pearl';
export type StripeId = 'none' | 'ivory' | 'black' | 'gold';
export type CameraMode = 'chase' | 'far' | 'bonnet';
export type LightMode = 'auto' | 'on' | 'off';
export type QualityPreference = 'auto' | 'high' | 'medium' | 'low';
export type TimePreference = 'auto' | 'morning' | 'midday' | 'golden' | 'dusk' | 'night';

export interface CarStyle { finish: FinishId; stripe: StripeId }
/** The inventory instance in each tuning slot of one car. */
export type UpgradeFit = Partial<Record<UpgradeKind, string>>;
/** What the used-car dealer has paid out so far, in dollars. */
export interface Sales { count: number; takings: number; profit: number; best: number }
export interface Settings {
  quality: QualityPreference;
  time: TimePreference;
  camera: CameraMode;
  lights: LightMode;
  /** Camera shake and speed effects. Off for players who prefer a steady view. */
  motion: boolean;
  map: boolean;
}
export interface Progress {
  version: 1;
  finds: string[];
  bestLap: Partial<Record<ShellId, number>>;
  /** Metres driven in each car. */
  odometer: Partial<Record<ShellId, number>>;
  /** Fastest speed reached in each car, in metres per second. */
  topSpeed: Partial<Record<ShellId, number>>;
  laps: number;
  /** Keyed by car id. */
  styles: Record<string, CarStyle>;
  settings: Settings;
  /** Time of day, carried between sessions when the cycle is running. */
  hour: number;
  /** Turbocharger, exhaust and nitrous fitted to each car, keyed by car id. The parts themselves are ordinary inventory. */
  fitted: Record<string, UpgradeFit>;
  /** Best lap by the car of each kind owned now: what the dealer accepts as proof of its speed. Cleared when that car is sold. */
  proof: Partial<Record<ShellId, number>>;
  sales: Sales;
  /** Decides where the rare salvage is hidden. Zero until the first visit rolls it. */
  stash: number;
  /** How many times each rare listing has come back after being sold with a car. Each return moves it. */
  restock: Record<string, number>;
}

export const SHELL_IDS: ShellId[] = ['hachiro', 'bison', 'veloce', 'wren', 'packhorse'];
export const FINISHES: { id: FinishId; name: string; finds: number; note: string }[] = [
  { id: 'gloss', name: 'Gloss', finds: 0, note: 'Workshop standard' },
  { id: 'metallic', name: 'Metallic', finds: 3, note: 'Fine flake under clear coat' },
  { id: 'matte', name: 'Matte', finds: 6, note: 'Flat, no shine' },
  { id: 'pearl', name: 'Pearl', finds: 10, note: 'Shifts colour in the light' },
];
export const STRIPES: { id: StripeId; name: string; color: string | null; medal: Medal | null }[] = [
  { id: 'none', name: 'Plain', color: null, medal: null },
  { id: 'ivory', name: 'Ivory twin', color: '#f1ece0', medal: 'bronze' },
  { id: 'black', name: 'Black twin', color: '#16191a', medal: 'silver' },
  { id: 'gold', name: 'Gold twin', color: '#d9a43a', medal: 'gold' },
];
/**
 * Test-loop targets in seconds, from the gate and back. Set from measured laps by a scripted driver
 * (scripts/lap-calibration.mjs): bronze is a tidy lap in the stock build with a tenth to spare, silver
 * sits between a tidy and a quick stock lap, and gold is a quick lap with the best engine and tires
 * plus a couple of seconds, so it takes either upgrades or better lines than the script drives.
 */
export const MEDAL_TIMES: Record<ShellId, Record<Medal, number>> = {
  hachiro: { bronze: 72, silver: 58, gold: 52 },
  bison: { bronze: 71, silver: 57, gold: 52 },
  veloce: { bronze: 69, silver: 55, gold: 50 },
  wren: { bronze: 71, silver: 57, gold: 51 },
  packhorse: { bronze: 72, silver: 58, gold: 52 },
};
const MEDAL_RANK: Record<Medal, number> = { bronze: 1, silver: 2, gold: 3 };
export const DEFAULT_SETTINGS: Settings = { quality: 'auto', time: 'auto', camera: 'chase', lights: 'auto', motion: true, map: true };
export const DEFAULT_STYLE: CarStyle = { finish: 'gloss', stripe: 'none' };
const START_HOUR = 16.6;
export type ProgressStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function newProgress(): Progress {
  return {
    version: 1, finds: [], bestLap: {}, odometer: {}, topSpeed: {}, laps: 0, styles: {}, settings: { ...DEFAULT_SETTINGS }, hour: START_HOUR,
    fitted: {}, proof: {}, sales: { count: 0, takings: 0, profit: 0, best: 0 }, stash: 0, restock: {},
  };
}

export function medalFor(shell: ShellId, seconds: number): Medal | null {
  const times = MEDAL_TIMES[shell];
  return seconds <= times.gold ? 'gold' : seconds <= times.silver ? 'silver' : seconds <= times.bronze ? 'bronze' : null;
}

/** The best medal earned in any car. */
export function bestMedal(progress: Progress): Medal | null {
  let best: Medal | null = null;
  for (const shell of SHELL_IDS) {
    const time = progress.bestLap[shell];
    const medal = time === undefined ? null : medalFor(shell, time);
    if (medal && (!best || MEDAL_RANK[medal] > MEDAL_RANK[best])) best = medal;
  }
  return best;
}

export function finishUnlocked(progress: Progress, finish: FinishId): boolean {
  return progress.finds.length >= (FINISHES.find(item => item.id === finish)?.finds ?? Infinity);
}

export function stripeUnlocked(progress: Progress, stripe: StripeId): boolean {
  const needed = STRIPES.find(item => item.id === stripe)?.medal;
  if (needed === undefined) return false;
  if (needed === null) return true;
  const best = bestMedal(progress);
  return !!best && MEDAL_RANK[best] >= MEDAL_RANK[needed];
}

export function styleFor(progress: Progress, carId: string): CarStyle {
  const style = progress.styles[carId] ?? DEFAULT_STYLE;
  // A style can only outlive its unlock if a save was edited by hand.
  return { finish: finishUnlocked(progress, style.finish) ? style.finish : 'gloss', stripe: stripeUnlocked(progress, style.stripe) ? style.stripe : 'none' };
}

export function setStyle(progress: Progress, carId: string, change: Partial<CarStyle>): Progress {
  const next = { ...styleFor(progress, carId), ...change };
  if (!finishUnlocked(progress, next.finish)) throw new Error('That finish is not unlocked yet. Bring back more finds.');
  if (!stripeUnlocked(progress, next.stripe)) throw new Error('Those stripes are not unlocked yet. Earn the medal on the test loop.');
  return { ...progress, styles: { ...progress.styles, [carId]: next } };
}

/** Collecting the same find twice changes nothing. */
export function recordFind(progress: Progress, id: string): Progress {
  return progress.finds.includes(id) ? progress : { ...progress, finds: [...progress.finds, id] };
}

export interface LapResult { progress: Progress; improved: boolean; medal: Medal | null; previous: number | undefined; newMedal: boolean }
export function recordLap(progress: Progress, shell: ShellId, seconds: number): LapResult {
  const previous = progress.bestLap[shell];
  const improved = previous === undefined || seconds < previous;
  const medal = medalFor(shell, seconds);
  const before = previous === undefined ? null : medalFor(shell, previous);
  const lap = Math.round(seconds * 100) / 100, proven = progress.proof[shell];
  const next: Progress = {
    ...progress, laps: progress.laps + 1,
    bestLap: improved ? { ...progress.bestLap, [shell]: lap } : progress.bestLap,
    // The record stands for good; the proof belongs to the car in the bay and goes when it is sold.
    proof: proven === undefined || seconds < proven ? { ...progress.proof, [shell]: lap } : progress.proof,
  };
  return { progress: next, improved, medal, previous, newMedal: !!medal && (!before || MEDAL_RANK[medal] > MEDAL_RANK[before]) };
}

/** Adds metres driven and raises the top speed. Returns the same object when nothing changed. */
export function recordDriving(progress: Progress, shell: ShellId, metres: number, speed: number): Progress {
  const top = progress.topSpeed[shell] ?? 0;
  if (metres <= 0 && speed <= top) return progress;
  return {
    ...progress,
    odometer: { ...progress.odometer, [shell]: (progress.odometer[shell] ?? 0) + Math.max(0, metres) },
    topSpeed: speed > top ? { ...progress.topSpeed, [shell]: speed } : progress.topSpeed,
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const oneOf = <T extends string>(value: unknown, options: readonly T[], fallback: T): T => options.includes(value as T) ? value as T : fallback;
const positive = (value: unknown, limit: number) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= limit;
const CAR_ID = /^car-[a-z]+$/, INSTANCE_ID = /^instance-part-[a-z0-9-]+$/, LISTING_ID = /^(shell|part)-[a-z0-9-]+$/;

/** Unknown or damaged fields fall back to defaults one at a time, so a bad setting never costs a medal. */
export function parseProgress(raw: string, knownFinds?: readonly string[]): Progress {
  const fresh = newProgress();
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return fresh; }
  if (!isRecord(data) || data.version !== 1) return fresh;
  const finds = Array.isArray(data.finds) ? [...new Set(data.finds.filter((id): id is string => typeof id === 'string' && (!knownFinds || knownFinds.includes(id))))] : [];
  const perShell = (source: unknown, limit: number) => {
    const result: Partial<Record<ShellId, number>> = {};
    if (isRecord(source)) for (const shell of SHELL_IDS) if (positive(source[shell], limit) && (source[shell] as number) > 0) result[shell] = source[shell] as number;
    return result;
  };
  const styles: Record<string, CarStyle> = {};
  if (isRecord(data.styles)) for (const [carId, style] of Object.entries(data.styles)) {
    if (!isRecord(style) || !CAR_ID.test(carId)) continue;
    styles[carId] = { finish: oneOf(style.finish, FINISHES.map(item => item.id), 'gloss'), stripe: oneOf(style.stripe, STRIPES.map(item => item.id), 'none') };
  }
  const saved = isRecord(data.settings) ? data.settings : {};
  const settings: Settings = {
    quality: oneOf(saved.quality, ['auto', 'high', 'medium', 'low'] as const, 'auto'),
    time: oneOf(saved.time, ['auto', 'morning', 'midday', 'golden', 'dusk', 'night'] as const, 'auto'),
    camera: oneOf(saved.camera, ['chase', 'far', 'bonnet'] as const, 'chase'),
    lights: oneOf(saved.lights, ['auto', 'on', 'off'] as const, 'auto'),
    motion: typeof saved.motion === 'boolean' ? saved.motion : true,
    map: typeof saved.map === 'boolean' ? saved.map : true,
  };
  const fitted: Record<string, UpgradeFit> = {};
  if (isRecord(data.fitted)) for (const [carId, slots] of Object.entries(data.fitted)) {
    if (!isRecord(slots) || !CAR_ID.test(carId)) continue;
    const fit: UpgradeFit = {};
    for (const kind of UPGRADE_KINDS) { const id = slots[kind]; if (typeof id === 'string' && INSTANCE_ID.test(id)) fit[kind] = id; }
    if (Object.keys(fit).length) fitted[carId] = fit;
  }
  const sold = isRecord(data.sales) ? data.sales : {};
  const dollars = (value: unknown) => positive(value, 1e12) ? Math.round(value as number) : 0;
  // Neither the profit nor the best single sale can exceed everything the dealer has paid.
  const takings = dollars(sold.takings);
  const sales: Sales = { count: positive(sold.count, 1e7) ? Math.floor(sold.count as number) : 0, takings, profit: Math.min(dollars(sold.profit), takings), best: Math.min(dollars(sold.best), takings) };
  const restock: Record<string, number> = {};
  if (isRecord(data.restock)) for (const [listing, times] of Object.entries(data.restock)) {
    if (LISTING_ID.test(listing) && positive(times, 1e6) && Math.floor(times as number) > 0) restock[listing] = Math.floor(times as number);
  }
  return {
    version: 1, finds, bestLap: perShell(data.bestLap, 36000), odometer: perShell(data.odometer, 1e9), topSpeed: perShell(data.topSpeed, 200),
    laps: positive(data.laps, 1e7) ? Math.floor(data.laps as number) : 0, styles, settings,
    hour: positive(data.hour, 24) ? data.hour as number : START_HOUR,
    // A record written before the dealer existed has no proof at all. Nothing could be sold then, so every car
    // that set a lap in it is still in the collection and that lap is its proof.
    fitted, proof: perShell(data.proof === undefined ? data.bestLap : data.proof, 36000), sales, restock,
    stash: positive(data.stash, 0xffffffff) && Number.isInteger(data.stash) ? data.stash as number : 0,
  };
}

function browserStorage(): ProgressStorage | undefined {
  try { return globalThis.localStorage; } catch { return undefined; }
}

export function loadProgress(storage: ProgressStorage | undefined = browserStorage(), knownFinds?: readonly string[]): Progress {
  try {
    const raw = storage?.getItem(PROGRESS_KEY);
    return raw ? parseProgress(raw, knownFinds) : newProgress();
  } catch { return newProgress(); }
}

export function saveProgress(progress: Progress, storage: ProgressStorage | undefined = browserStorage()): boolean {
  if (!storage) return false;
  try { storage.setItem(PROGRESS_KEY, JSON.stringify(progress)); return true; } catch { return false; }
}

export function formatLap(seconds: number): string {
  // Work in whole tenths so 59.96 reads 1:00.0, never 0:60.0.
  const tenths = Math.max(0, Math.round(seconds * 10)), minutes = Math.floor(tenths / 600);
  return `${minutes}:${((tenths - minutes * 600) / 10).toFixed(1).padStart(4, '0')}`;
}
