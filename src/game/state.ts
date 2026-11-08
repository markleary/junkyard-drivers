import { DEFAULT_PAINT, LISTINGS, PARTS, SHELLS, getCatalogPart, getShell } from './catalog';
import type { Part, PartKind, ShellId } from './catalog';

export interface OwnedCar {
  id: string;
  shellId: ShellId;
  engineId: string | null;
  wheelsId: string | null;
  /** Applied color, independent of render objects. */
  paint: string;
}

export interface InventoryItem { id: string; partId: string }

export interface GameState {
  version: 1;
  seed: number;
  purchasedListings: string[];
  cars: OwnedCar[];
  /** Includes installed instances; their assignment is stored on the owning car. */
  inventory: InventoryItem[];
  /** Catalog paint IDs, permanently unlocked and reusable. */
  paints: string[];
}

export const STORAGE_KEY = 'junkyard-drivers-save-v1';
export const DEFAULT_SEED = 642019;
export type SaveStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function newGame(seed = DEFAULT_SEED): GameState {
  return {
    version: 1, seed: Number.isFinite(seed) ? seed >>> 0 : DEFAULT_SEED,
    purchasedListings: [], cars: [], inventory: [], paints: [],
  };
}

export function getPart(state: GameState, instanceId: string | null | undefined): Part | undefined {
  const instance = state.inventory.find((item) => item.id === instanceId);
  return instance ? PARTS.find((part) => part.id === instance.partId) : undefined;
}

export function availableInventory(state: GameState, kind?: PartKind): InventoryItem[] {
  const assigned = new Set(state.cars.flatMap((car) => [car.engineId, car.wheelsId]));
  return state.inventory.filter((item) => !assigned.has(item.id) && (!kind || getPart(state, item.id)?.kind === kind));
}

export function purchase(state: GameState, listingId: string): GameState {
  // The receipt is the transaction's unique key. Holding E or double-clicking is safe.
  if (state.purchasedListings.includes(listingId)) return state;
  const listing = LISTINGS.find((item) => item.id === listingId);
  if (!listing) throw new Error('This listing does not exist.');
  const next: GameState = { ...state, purchasedListings: [...state.purchasedListings, listingId] };
  if (listing.kind === 'shell') {
    const shell = getShell(listing.itemId);
    next.cars = [...state.cars, { id: `car-${shell.id}`, shellId: shell.id, engineId: null, wheelsId: null, paint: DEFAULT_PAINT[shell.id] }];
  } else {
    const part = getCatalogPart(listing.itemId);
    if (part.kind === 'paint') next.paints = [...state.paints, part.id];
    else next.inventory = [...state.inventory, { id: `instance-${listing.id}`, partId: part.id }];
  }
  return next;
}

export function install(state: GameState, carId: string, instanceId: string): GameState {
  const car = state.cars.find((item) => item.id === carId);
  if (!car) throw new Error('Choose a car in the Garage first.');
  const part = getPart(state, instanceId);
  if (!part || part.kind === 'paint') throw new Error('That part is not in your inventory.');
  if (part.kind === 'engine' && part.mount !== getShell(car.shellId).mount) {
    throw new Error(`Incompatible engine: this car needs a ${getShell(car.shellId).mount} mount.`);
  }
  const assigned = state.cars.find((item) => item.engineId === instanceId || item.wheelsId === instanceId);
  if (assigned && assigned.id !== carId) throw new Error('That part is installed in another car.');
  if (assigned?.id === carId) return state;
  const slot = part.kind === 'engine' ? 'engineId' : 'wheelsId';
  return { ...state, cars: state.cars.map((item) => item.id === carId ? { ...item, [slot]: instanceId } : item) };
}

export function paintCar(state: GameState, carId: string, paintId: string): GameState {
  if (!state.cars.some((car) => car.id === carId)) throw new Error('Choose a car in the Garage first.');
  const paint = PARTS.find((part) => part.id === paintId && part.kind === 'paint');
  if (!paint?.color || !state.paints.includes(paintId)) throw new Error('Purchase this paint at the parts rack first.');
  return { ...state, cars: state.cars.map((car) => car.id === carId ? { ...car, paint: paint.color! } : car) };
}

export function buildIssues(state: GameState, car: OwnedCar): string[] {
  const shell = SHELLS.find((item) => item.id === car.shellId);
  if (!shell) return ['Unknown car shell.'];
  const issues: string[] = [];
  const engine = getPart(state, car.engineId);
  const wheels = getPart(state, car.wheelsId);
  if (engine?.kind !== 'engine') issues.push(`Install a ${shell.mount} engine.`);
  else if (engine.mount !== shell.mount) issues.push(`Engine is incompatible: ${shell.mount} mount required.`);
  if (wheels?.kind !== 'wheels') issues.push('Install a wheel-and-tire set.');
  if (state.cars.some((other) => other.id !== car.id && (
    (car.engineId !== null && other.engineId === car.engineId) ||
    (car.wheelsId !== null && other.wheelsId === car.wheelsId)
  ))) issues.push('A part is already assigned to another car.');
  return issues;
}

function browserStorage(): SaveStorage | undefined {
  try { return globalThis.localStorage; } catch { return undefined; }
}

export function saveGame(state: GameState, storage: SaveStorage | undefined = browserStorage()): boolean {
  if (!storage) return false;
  try { storage.setItem(STORAGE_KEY, JSON.stringify(state)); return true; } catch { return false; }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sameStrings(actual: unknown, expected: string[]): boolean {
  return Array.isArray(actual) && actual.length === expected.length &&
    actual.every((item) => typeof item === 'string') && new Set(actual).size === actual.length &&
    expected.every((item) => actual.includes(item));
}

/** Replay receipts, then validate assignments. Corrupt/unknown saves never enter simulation. */
export function parseSave(raw: string): GameState | null {
  try {
    const data: unknown = JSON.parse(raw);
    if (!isRecord(data) || data.version !== 1 || typeof data.seed !== 'number' || !Number.isInteger(data.seed) ||
      data.seed < 0 || data.seed > 0xffffffff || !Array.isArray(data.purchasedListings) ||
      !Array.isArray(data.cars) || !Array.isArray(data.inventory) || !Array.isArray(data.paints)) return null;
    if (!data.purchasedListings.every((id) => typeof id === 'string') ||
      new Set(data.purchasedListings).size !== data.purchasedListings.length) return null;
    let verified = newGame(data.seed);
    for (const id of data.purchasedListings) verified = purchase(verified, id as string);
    if (!sameStrings(data.paints, verified.paints) || data.cars.length !== verified.cars.length ||
      data.inventory.length !== verified.inventory.length) return null;
    const carIds = new Set<string>();
    const instanceIds = new Set<string>();
    for (const instance of data.inventory) {
      if (!isRecord(instance) || typeof instance.id !== 'string' || instanceIds.has(instance.id) ||
        !verified.inventory.some((item) => item.id === instance.id && item.partId === instance.partId)) return null;
      instanceIds.add(instance.id);
    }
    for (const car of data.cars) {
      if (!isRecord(car) || typeof car.id !== 'string' || carIds.has(car.id)) return null;
      const expected = verified.cars.find((item) => item.id === car.id && item.shellId === car.shellId);
      if (!expected || !(car.engineId === null || typeof car.engineId === 'string') ||
        !(car.wheelsId === null || typeof car.wheelsId === 'string') || typeof car.paint !== 'string') return null;
      carIds.add(car.id);
      if (car.engineId !== null) {
        if (getPart(verified, car.engineId)?.kind !== 'engine') return null;
        verified = install(verified, car.id, car.engineId);
      }
      if (car.wheelsId !== null) {
        if (getPart(verified, car.wheelsId)?.kind !== 'wheels') return null;
        verified = install(verified, car.id, car.wheelsId);
      }
      if (car.paint !== DEFAULT_PAINT[expected.shellId]) {
        const paint = PARTS.find((item) => item.kind === 'paint' && item.color === car.paint && verified.paints.includes(item.id));
        if (!paint) return null;
        verified = paintCar(verified, car.id, paint.id);
      }
    }
    return verified;
  } catch { return null; }
}

export function loadGame(storage: SaveStorage | undefined = browserStorage()): GameState {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    return raw ? parseSave(raw) ?? newGame() : newGame();
  } catch { return newGame(); }
}
