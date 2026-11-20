import { DEFAULT_PAINT, PARTS, OWNABLE_SHELLS, UPGRADE_KINDS, type ShellId, type UpgradeKind } from './catalog';
import { styleFor, type FinishId, type Progress, type StripeId } from './progress';
import { getPart, type GameState, type OwnedCar } from './state';
import { fittedUpgrades } from './upgrades';

export type RestorationRoute = 'paint' | 'patina';
export type RestorationStage = 'wash' | 'rust' | 'repair' | 'prime' | 'paint' | 'seal' | 'complete';
/** A photograph's catalog data, frozen at the time of capture. No canvas or image data enters a save. */
export interface RestorationSnapshot {
  shellId: ShellId;
  paint: string;
  finish: FinishId;
  stripe: StripeId;
  enginePartId: string | null;
  wheels: boolean;
  tuning: UpgradeKind[];
  restored: boolean;
  /** On a completed orchard repaint, the after photo also records the owner's door finish. */
  orchardLettering?: boolean;
}
export interface RestorationRecord {
  stage: RestorationStage;
  route: RestorationRoute;
  /** Progress through this operation; completing it starts the next operation at zero. */
  work: number;
  before: RestorationSnapshot;
  after: RestorationSnapshot | null;
}
export const RESTORATION_STAGES: Record<RestorationRoute, readonly RestorationStage[]> = {
  paint: ['wash', 'rust', 'repair', 'prime', 'paint', 'complete'],
  patina: ['wash', 'rust', 'repair', 'seal', 'complete'],
};

export function restorationFor(progress: Progress, carId: string): RestorationRecord | undefined {
  return progress.restorations[carId];
}

/** Every catalog shell can be a restoration project; there is no separate project-car class. */
function isCatalogCar(car: OwnedCar): boolean {
  return OWNABLE_SHELLS.some(shell => shell.id === car.shellId && car.id === `car-${shell.id}`);
}

function ownedCar(state: GameState, carId: string): OwnedCar {
  const car = state.cars.find(item => item.id === carId);
  if (!car || !isCatalogCar(car)) throw new Error('Choose an owned car at the workbench first.');
  return car;
}

function snapshot(state: GameState, progress: Progress, car: OwnedCar, restored: boolean): RestorationSnapshot {
  const engine = getPart(state, car.engineId), fitted = fittedUpgrades(state, progress, car.id);
  return {
    shellId: car.shellId, paint: car.paint, ...styleFor(progress, car.id),
    enginePartId: engine?.kind === 'engine' ? engine.id : null, wheels: getPart(state, car.wheelsId)?.kind === 'wheels',
    tuning: UPGRADE_KINDS.filter(kind => !!fitted[kind]), restored,
    ...(restored && car.shellId === 'orchard' ? { orchardLettering: false } : {}),
  };
}

/** Any changed appearance loses that car's old acceptance lap immediately. */
function put(progress: Progress, carId: string, record: RestorationRecord): Progress {
  return { ...progress, restorations: { ...progress.restorations, [carId]: record },
    jobs: progress.jobs.proof?.carId === carId ? { ...progress.jobs, proof: null } : progress.jobs };
}

/** Opt in explicitly: existing collections keep their appearance and their original build save. */
export function startRestoration(state: GameState, progress: Progress, carId: string): Progress {
  const car = ownedCar(state, carId);
  if (restorationFor(progress, carId)) return progress;
  return put(progress, carId, { stage: 'wash', route: 'paint', work: 0,
    before: snapshot(state, progress, car, false), after: null });
}

/** Decide once the dirt is off and before the first pass of rust treatment. */
export function chooseRestorationRoute(state: GameState, progress: Progress, carId: string, route: RestorationRoute): { state: GameState; progress: Progress } {
  const car = ownedCar(state, carId);
  if (route !== 'paint' && route !== 'patina') throw new Error('Choose fresh paint or preserved patina.');
  const record = restorationFor(progress, carId);
  if (!record) throw new Error('Start bodywork at the workbench first.');
  if (record.route === route) return { state, progress };
  if (record.stage !== 'rust' || record.work !== 0) throw new Error('Choose the finish after washing, before treating the rust.');
  // A selected tin is only a plan for the final coat. Preserving patina keeps the colour the car started with.
  // Snapshot colours are repaired separately; only colours accepted by the frozen collection save can enter it.
  const startingPaint = record.before.paint;
  const validPaint = startingPaint === DEFAULT_PAINT[car.shellId] || PARTS.some(part =>
    part.kind === 'paint' && part.color === startingPaint && state.paints.includes(part.id));
  const preservedPaint = validPaint ? startingPaint : DEFAULT_PAINT[car.shellId];
  const preserved = route === 'patina' && car.paint !== preservedPaint
    ? { ...state, cars: state.cars.map(item => item.id === carId ? { ...item, paint: preservedPaint } : item) } : state;
  return { state: preserved, progress: put(progress, carId, { ...record, route }) };
}

/** Keep the original before photo, but let preserved bodywork become a fresh painted finish. */
export function refinishRestoration(state: GameState, progress: Progress, carId: string): Progress {
  ownedCar(state, carId);
  const record = restorationFor(progress, carId);
  if (!record) throw new Error('Start bodywork at the workbench first.');
  if (record.route !== 'patina') return progress;
  // Unfinished preparation still needs doing. A repaired or sealed body only needs its new primer and coat.
  const stage = record.stage === 'wash' || record.stage === 'rust' || record.stage === 'repair' ? record.stage : 'prime';
  return put(progress, carId, { ...record, route: 'paint', stage, work: 0, after: null });
}

export function setOrchardLettering(state: GameState, progress: Progress, carId: string, enabled: boolean): Progress {
  const car = ownedCar(state, carId);
  const record = restorationFor(progress, carId);
  if (car.shellId !== 'orchard' || record?.route !== 'paint' || record.stage !== 'complete' || !record.after) {
    throw new Error('Finish painting the Bell Orchard Courier before choosing its door lettering.');
  }
  if ((record.after.orchardLettering ?? false) === enabled) return progress;
  return put(progress, carId, { ...record, after: { ...record.after, orchardLettering: enabled } });
}

/** A bounded tool pass cannot spill into the next operation, even when a frame takes a long time. */
export function workRestoration(state: GameState, progress: Progress, carId: string, amount: number): Progress {
  const car = ownedCar(state, carId), record = restorationFor(progress, carId);
  if (!record) throw new Error('Start bodywork at the workbench first.');
  if (!Number.isFinite(amount) || amount <= 0 || record.stage === 'complete') return progress;
  const work = Math.min(1, record.work + amount);
  if (work < 1 - 1e-9) return put(progress, carId, { ...record, work });
  const path = RESTORATION_STAGES[record.route];
  const stage = path[path.indexOf(record.stage) + 1] ?? 'complete';
  return put(progress, carId, { ...record, stage, work: 0,
    after: stage === 'complete' ? snapshot(state, progress, car, record.route === 'paint') : null });
}

/** A sold or otherwise missing car cannot donate its bodywork to another shell with the same id. */
export function reconcileRestorations(state: GameState, progress: Progress): Progress {
  const kept = Object.entries(progress.restorations).filter(([id, record]) =>
    state.cars.some(car => car.id === id && car.shellId === record.before.shellId && isCatalogCar(car)));
  return kept.length === Object.keys(progress.restorations).length ? progress : { ...progress, restorations: Object.fromEntries(kept) };
}

export function restorationSignature(progress: Progress, carId: string): string | null {
  const record = restorationFor(progress, carId);
  if (!record) return null;
  const signature: (string | number)[] = [record.route, record.stage, record.work];
  if (record.after?.orchardLettering) signature.push('orchard-lettering');
  return JSON.stringify(signature);
}
