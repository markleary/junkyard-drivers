import { DEFAULT_PAINT, PARTS, UPGRADE_KINDS, getShell, type ShellId } from './catalog';
import { MEDAL_TIMES, medalFor, type Medal, type Progress } from './progress';
import { buildIssues, getPart, sellCar, type GameState, type OwnedCar } from './state';
import { fittedInstances, fittedUpgrades } from './upgrades';
import { randomFromSeed } from '../world/layout';

/**
 * Second Chance Motors buys finished cars. The offer is a point inside a range that is set by two things: what
 * went into the car, and the lap it has proved on the test loop. Where in the range the offer falls is the
 * dealer's mood: rolled once when the game is opened and unchanged until it is closed.
 */
export interface InvestmentLine { label: string; item: string; amount: number }
export interface Investment { lines: InvestmentLine[]; total: number }

const UPGRADE_LABEL = { turbo: 'Turbocharger', exhaust: 'Exhaust', nitro: 'Nitrous' } as const;

/** Catalog price of the shell and of everything bolted to or sprayed on it: what the player put in. */
export function investment(state: GameState, progress: Progress, car: OwnedCar): Investment {
  const shell = getShell(car.shellId), lines: InvestmentLine[] = [{ label: 'Shell', item: shell.name, amount: shell.price }];
  const engine = getPart(state, car.engineId), wheels = getPart(state, car.wheelsId);
  if (engine?.kind === 'engine') lines.push({ label: 'Engine', item: engine.name, amount: engine.price });
  if (wheels?.kind === 'wheels') lines.push({ label: 'Wheels', item: wheels.name, amount: wheels.price });
  const fitted = fittedUpgrades(state, progress, car.id);
  for (const kind of UPGRADE_KINDS) {
    const upgrade = fitted[kind];
    if (upgrade) lines.push({ label: UPGRADE_LABEL[kind], item: upgrade.part.name, amount: upgrade.part.price });
  }
  // The colour is reusable, but each respray is costed at the price of the tin.
  if (car.paint.toLowerCase() !== DEFAULT_PAINT[car.shellId]) {
    const paint = PARTS.find(part => part.kind === 'paint' && part.color === car.paint && state.paints.includes(part.id));
    if (paint) lines.push({ label: 'Paint', item: paint.name, amount: paint.price });
  }
  return { lines, total: lines.reduce((sum, line) => sum + line.amount, 0) };
}

/** How far past the bronze time a lap still counts for a little. */
const SLOW_MARGIN = 20;
/** What each standard of lap is worth, from 0 (never driven) to 1 (a gold lap). */
export const PROOF_VALUE = { slow: .15, bronze: .4, silver: .7, gold: 1 } as const;

/**
 * How convincing a lap is as proof of the car's speed, 0..1. No lap proves nothing. Any finished lap shows the
 * car runs; from there every tenth counts, through bronze and silver, until a gold lap is worth everything.
 */
export function lapProof(shell: ShellId, lap: number | undefined): number {
  if (lap === undefined || !Number.isFinite(lap) || lap <= 0) return 0;
  const times = MEDAL_TIMES[shell];
  const between = (from: number, to: number, slower: number, quicker: number) => from + (to - from) * (slower - lap) / (slower - quicker);
  if (lap <= times.gold) return PROOF_VALUE.gold;
  if (lap <= times.silver) return between(PROOF_VALUE.silver, PROOF_VALUE.gold, times.silver, times.gold);
  if (lap <= times.bronze) return between(PROOF_VALUE.bronze, PROOF_VALUE.silver, times.bronze, times.silver);
  if (lap < times.bronze + SLOW_MARGIN) return between(PROOF_VALUE.slow, PROOF_VALUE.bronze, times.bronze + SLOW_MARGIN, times.bronze);
  return PROOF_VALUE.slow;
}

/** The range as multiples of what was put in: its bottom and top with no lap at all, and with a gold lap. */
export const OFFER_RANGE = { low: [1.06, 1.4], high: [1.25, 2] } as const;
const STEP = 10;

export interface OfferRange { low: number; high: number }

/**
 * Bottom and top of what the dealer will pay, in whole tens of dollars. The bottom is always more than was put
 * in; the top never passes twice that, and only reaches it for a car with a gold lap to its name.
 */
export function offerRange(invested: number, proof: number): OfferRange {
  const p = Math.min(1, Math.max(0, proof));
  const at = ([unproven, proven]: readonly [number, number]) => invested * (unproven + (proven - unproven) * p);
  const low = Math.max(Math.ceil(at(OFFER_RANGE.low) / STEP) * STEP, (Math.floor(invested / STEP) + 1) * STEP);
  return { low, high: Math.max(low, Math.floor(at(OFFER_RANGE.high) / STEP) * STEP) };
}

/** The dealer's mood about one car, 0..1: fixed by the session's seed, different for each model. */
export function sessionRoll(seed: number, shell: ShellId): number {
  let hash = seed >>> 0;
  for (const letter of shell) hash = Math.imul(hash ^ letter.charCodeAt(0), 0x01000193) >>> 0;
  return randomFromSeed(hash)();
}

export function offerWithin(range: OfferRange, roll: number): number {
  const r = Math.min(1, Math.max(0, roll));
  return Math.min(range.high, Math.max(range.low, Math.round((range.low + (range.high - range.low) * r) / STEP) * STEP));
}

export interface Appraisal {
  car: OwnedCar;
  /** Why the dealer will not look at it yet; empty for a finished car. */
  issues: string[];
  investment: Investment;
  /** The lap this car has proved, if any. */
  lap: number | undefined;
  medal: Medal | null;
  proof: number;
  range: OfferRange;
  offer: number;
  profit: number;
}

/** Everything on the dealer's offer sheet for one car. `seed` is the session's: the same seed gives the same offer. */
export function appraise(state: GameState, progress: Progress, car: OwnedCar, seed: number): Appraisal {
  const invested = investment(state, progress, car), lap = progress.proof[car.shellId];
  const proof = lapProof(car.shellId, lap), range = offerRange(invested.total, proof);
  const offer = offerWithin(range, sessionRoll(seed, car.shellId));
  return {
    car, issues: buildIssues(state, car), investment: invested, lap, medal: lap === undefined ? null : medalFor(car.shellId, lap),
    proof, range, offer, profit: offer - invested.total,
  };
}

export interface Sale { state: GameState; progress: Progress; amount: number; profit: number; restocked: string[] }

/** Listings the yard hides rather than displays: selling one sends it back to a new hiding place. */
const isHidden = (listing: string) => {
  if (listing.startsWith('shell-')) return !!getShellOrUndefined(listing.slice(6))?.hidden;
  return PARTS.find(part => `part-${part.id}` === listing)?.source === 'hidden';
};
function getShellOrUndefined(id: string) { try { return getShell(id); } catch { return undefined; } }

/**
 * Hand over the keys. The car and everything fitted to it leave both saves; the takings are logged; the lap it
 * proved goes with it, so the next one built has to earn its own.
 */
export function completeSale(state: GameState, progress: Progress, carId: string, seed: number): Sale {
  const car = state.cars.find(item => item.id === carId);
  if (!car) throw new Error('That car is not in your collection.');
  const appraisal = appraise(state, progress, car, seed);
  if (appraisal.issues.length) throw new Error('The dealer only buys cars that run. Finish the build first.');
  const fitted = fittedInstances(state, progress, carId);
  const next = sellCar(state, carId, fitted);
  const gone = state.purchasedListings.filter(id => !next.purchasedListings.includes(id));
  const restocked = gone.filter(isHidden), restock = { ...progress.restock };
  for (const listing of restocked) restock[listing] = (restock[listing] ?? 0) + 1;
  const { [car.shellId]: _lap, ...proof } = progress.proof;
  const { [carId]: _fit, ...fittedLeft } = progress.fitted;
  const { [carId]: _style, ...styles } = progress.styles;
  const sales = {
    count: progress.sales.count + 1, takings: progress.sales.takings + appraisal.offer,
    profit: progress.sales.profit + appraisal.profit, best: Math.max(progress.sales.best, appraisal.offer),
  };
  return { state: next, progress: { ...progress, proof, fitted: fittedLeft, styles, sales, restock }, amount: appraisal.offer, profit: appraisal.profit, restocked };
}
