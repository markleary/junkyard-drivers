import { UPGRADE_KINDS, getShell, isUpgrade, type ExhaustNote, type Part, type UpgradeKind } from './catalog';
import { buildIssues, getPart, type GameState, type InventoryItem, type OwnedCar } from './state';
import type { Progress, UpgradeFit } from './progress';

/**
 * Turbochargers, exhausts and nitrous kits. They are bought and held like any other part, so the purchase save
 * is unchanged; which car each one is bolted to is recorded in the progress save, beside that car's finish and
 * stripes. Every function here takes both records and returns a new progress record.
 */
export interface FittedUpgrade { instanceId: string; part: Part }

/** The part in one of the car's tuning slots, if it is still in the inventory and of the right kind. */
function resolve(state: GameState, fit: UpgradeFit | undefined, kind: UpgradeKind): FittedUpgrade | undefined {
  const instanceId = fit?.[kind], part = getPart(state, instanceId);
  return instanceId && part?.kind === kind ? { instanceId, part } : undefined;
}

export function fittedUpgrades(state: GameState, progress: Progress, carId: string): Partial<Record<UpgradeKind, FittedUpgrade>> {
  const fit = Object.hasOwn(progress.fitted, carId) ? progress.fitted[carId] : undefined, found: Partial<Record<UpgradeKind, FittedUpgrade>> = {};
  if (!state.cars.some(car => car.id === carId)) return found;
  for (const kind of UPGRADE_KINDS) { const upgrade = resolve(state, fit, kind); if (upgrade) found[kind] = upgrade; }
  return found;
}

/** Inventory instances of every tuning part bolted to that car. */
export function fittedInstances(state: GameState, progress: Progress, carId: string): string[] {
  return Object.values(fittedUpgrades(state, progress, carId)).map(upgrade => upgrade.instanceId);
}

/** Tuning parts of one kind that are owned and not on any car. */
export function looseUpgrades(state: GameState, progress: Progress, kind: UpgradeKind): InventoryItem[] {
  const taken = new Set(state.cars.flatMap(car => fittedInstances(state, progress, car.id)));
  return state.inventory.filter(item => !taken.has(item.id) && getPart(state, item.id)?.kind === kind);
}

/** Bolt a tuning part to a car. Whatever was in that slot goes back on the shelf. */
export function fitUpgrade(state: GameState, progress: Progress, carId: string, instanceId: string): Progress {
  const car = state.cars.find(item => item.id === carId);
  if (!car) throw new Error('Choose a car in the Garage first.');
  const part = getPart(state, instanceId);
  if (!part || !isUpgrade(part.kind)) throw new Error('That part is not in your inventory.');
  if (getPart(state, car.engineId)?.kind !== 'engine') throw new Error(`Install a ${getShell(car.shellId).mount} engine before fitting tuning parts.`);
  const owner = state.cars.find(other => fittedInstances(state, progress, other.id).includes(instanceId));
  if (owner && owner.id !== carId) throw new Error('That part is fitted to another car.');
  if (owner) return progress;
  return { ...progress, fitted: { ...progress.fitted, [carId]: { ...progress.fitted[carId], [part.kind]: instanceId } } };
}

/** Unbolt one slot. The part stays in the inventory. */
export function removeUpgrade(progress: Progress, carId: string, kind: UpgradeKind): Progress {
  const fit = Object.hasOwn(progress.fitted, carId) ? progress.fitted[carId] : undefined;
  if (!fit?.[kind]) return progress;
  const { [kind]: _removed, ...rest } = fit;
  const fitted = { ...progress.fitted };
  if (Object.keys(rest).length) fitted[carId] = rest; else delete fitted[carId];
  return { ...progress, fitted };
}

/**
 * Drop whatever the two saves no longer agree on: a car that has gone, a part that is no longer owned or is of
 * another kind, an engine that was taken out, or one part claimed by two cars. Returns the same object when
 * nothing needed mending.
 */
export function reconcileFitted(state: GameState, progress: Progress): Progress {
  const fitted: Record<string, UpgradeFit> = {}, claimed = new Set<string>();
  for (const car of state.cars) {
    if (!Object.hasOwn(progress.fitted, car.id) || getPart(state, car.engineId)?.kind !== 'engine') continue;
    const fit: UpgradeFit = {};
    for (const kind of UPGRADE_KINDS) {
      const upgrade = resolve(state, progress.fitted[car.id], kind);
      if (!upgrade || claimed.has(upgrade.instanceId)) continue;
      claimed.add(upgrade.instanceId);
      fit[kind] = upgrade.instanceId;
    }
    if (Object.keys(fit).length) fitted[car.id] = fit;
  }
  const print = (record: Record<string, UpgradeFit>) => Object.keys(record).sort().map(id => `${id}:${UPGRADE_KINDS.map(kind => record[id][kind] ?? '').join(',')}`).join('|');
  return print(fitted) === print(progress.fitted) ? progress : { ...progress, fitted };
}

/** Everything the physics, the dashboard and the engine note need to know about one finished build. */
export interface BuildTuning {
  mass: number;
  /** Engine output with the exhaust's gain included, before any boost. */
  power: number;
  grip: number;
  /** Turbocharger: share of power added at full boost, and the seconds it takes to build. Zero without one. */
  boost: number;
  lag: number;
  /** Nitrous: horsepower added while it flows, and the seconds a full bottle lasts. Zero without a kit. */
  shot: number;
  burn: number;
  exhaust: ExhaustNote | 'stock';
  /** The most the engine makes with the turbo on full boost: sets gearing and how loud it is. */
  peak: number;
}

export function buildTuning(state: GameState, progress: Progress, car: OwnedCar): BuildTuning {
  if (buildIssues(state, car).length) throw new Error('That car is not finished.');
  const engine = getPart(state, car.engineId)!, wheels = getPart(state, car.wheelsId)!;
  const { turbo, exhaust, nitro } = fittedUpgrades(state, progress, car.id);
  const power = engine.power! * (1 + (exhaust?.part.flow ?? 0)), boost = turbo?.part.boost ?? 0;
  return {
    mass: getShell(car.shellId).mass, power, grip: wheels.grip!,
    boost, lag: turbo?.part.lag ?? 0, shot: nitro?.part.shot ?? 0, burn: nitro?.part.burn ?? 0,
    exhaust: exhaust?.part.note ?? 'stock', peak: power * (1 + boost),
  };
}
