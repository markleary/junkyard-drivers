import { describe, expect, it } from 'vitest';
import { PARTS, SHELLS } from '../src/game/catalog';
import {
  DEFAULT_SEED, STORAGE_KEY, availableInventory, buildIssues, getPart, install,
  loadGame, newGame, paintCar, parseSave, purchase, saveGame,
} from '../src/game/state';
import type { GameState, SaveStorage } from '../src/game/state';

function buy(state: GameState, ...ids: string[]): GameState {
  return ids.reduce((next, id) => purchase(next, id), state);
}

function starter(): GameState {
  let state = buy(newGame(), 'shell-hachiro', 'part-i4-stock', 'part-street-1', 'part-paint-saffron');
  state = install(state, 'car-hachiro', 'instance-part-i4-stock');
  state = install(state, 'car-hachiro', 'instance-part-street-1');
  return paintCar(state, 'car-hachiro', 'paint-saffron');
}

function memoryStorage(): SaveStorage {
  const values = new Map<string, string>();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
}

describe('purchases and inventory ownership', () => {
  it('starts from an empty deterministic save with unlimited purchasing', () => {
    expect(newGame()).toEqual({ version: 1, seed: DEFAULT_SEED, purchasedListings: [], cars: [], inventory: [], paints: [] });
    expect(newGame(123).seed).toBe(123);
  });

  it('does not mutate the source save during purchase', () => {
    const before = newGame();
    const after = purchase(before, 'shell-hachiro');
    expect(before.cars).toHaveLength(0);
    expect(after.cars).toHaveLength(1);
    expect(after.cars[0].engineId).toBeNull();
  });

  it('makes repeated shell, part and paint purchases idempotent', () => {
    const once = buy(newGame(), 'shell-hachiro', 'part-i4-stock', 'part-paint-saffron');
    let repeat = once;
    for (let i = 0; i < 50; i++) repeat = buy(repeat, 'shell-hachiro', 'part-i4-stock', 'part-paint-saffron');
    expect(repeat).toBe(once);
    expect(repeat.cars).toHaveLength(1);
    expect(repeat.inventory).toHaveLength(1);
    expect(repeat.paints).toEqual(['paint-saffron']);
  });

  it('rejects unknown listings without creating an item', () => {
    expect(() => purchase(newGame(), 'free-engine')).toThrow('listing');
  });

  it('retains installed instances but removes them from available stock', () => {
    const state = starter();
    expect(state.inventory).toHaveLength(2);
    expect(availableInventory(state)).toEqual([]);
    expect(getPart(state, state.cars[0].engineId)?.id).toBe('i4-stock');
  });

  it('returns the old engine to available inventory when swapping', () => {
    const original = starter();
    const bought = purchase(original, 'part-i4-performance');
    const swapped = install(bought, 'car-hachiro', 'instance-part-i4-performance');
    expect(swapped.inventory).toHaveLength(3);
    expect(availableInventory(swapped, 'engine').map((item) => item.partId)).toEqual(['i4-stock']);
    expect(original.cars[0].engineId).toBe('instance-part-i4-stock');
    expect(getPart(swapped, swapped.cars[0].engineId)!.power).toBeGreaterThan(getPart(original, original.cars[0].engineId)!.power!);
  });

  it('returns street wheels after upgrading tires and changes grip tuning', () => {
    const original = starter();
    const swapped = install(purchase(original, 'part-sport-1'), 'car-hachiro', 'instance-part-sport-1');
    expect(availableInventory(swapped, 'wheels').map((item) => item.partId)).toEqual(['street-1']);
    expect(getPart(swapped, swapped.cars[0].wheelsId)!.grip).toBeGreaterThan(getPart(original, original.cars[0].wheelsId)!.grip!);
  });

  it('cannot install one instance into two cars', () => {
    const state = purchase(starter(), 'shell-bison');
    expect(() => install(state, 'car-bison', 'instance-part-street-1')).toThrow('another car');
  });

  it('reinstalling the same part into its own car is harmless', () => {
    const state = starter();
    expect(install(state, 'car-hachiro', 'instance-part-i4-stock')).toBe(state);
  });

  it('allows a returned wheel instance to be assigned to a different car', () => {
    let state = buy(starter(), 'shell-bison', 'part-sport-1');
    state = install(state, 'car-hachiro', 'instance-part-sport-1');
    state = install(state, 'car-bison', 'instance-part-street-1');
    expect(state.cars[1].wheelsId).toBe('instance-part-street-1');
  });
});

describe('build rules and paint', () => {
  it('blocks driving until an engine and wheels are installed', () => {
    let state = buy(newGame(), 'shell-hachiro', 'part-i4-stock');
    expect(buildIssues(state, state.cars[0])).toHaveLength(2);
    state = install(state, 'car-hachiro', 'instance-part-i4-stock');
    expect(buildIssues(state, state.cars[0])).toEqual(['Install a wheel-and-tire set.']);
    expect(buildIssues(starter(), starter().cars[0])).toEqual([]);
  });

  it('rejects incompatible engine mounts and unowned parts', () => {
    const state = buy(newGame(), 'shell-hachiro', 'part-v8-stock');
    expect(() => install(state, 'car-hachiro', 'instance-part-v8-stock')).toThrow('I4 mount');
    expect(() => install(state, 'car-hachiro', 'instance-part-i4-stock')).toThrow('not in your inventory');
  });

  it('has enough independent compatible stock to complete every shell', () => {
    let state = newGame();
    for (const [index, shell] of SHELLS.entries()) {
      const engine = PARTS.find((part) => part.kind === 'engine' && part.mount === shell.mount)!;
      state = buy(state, `shell-${shell.id}`, `part-${engine.id}`, `part-street-${index + 1}`);
      state = install(state, `car-${shell.id}`, `instance-part-${engine.id}`);
      state = install(state, `car-${shell.id}`, `instance-part-street-${index + 1}`);
    }
    expect(state.cars).toHaveLength(3);
    expect(state.cars.every((car) => buildIssues(state, car).length === 0)).toBe(true);
    expect(availableInventory(state)).toHaveLength(0);
  });

  it('reuses purchased paint across cars while saving a separate body color', () => {
    let state = purchase(starter(), 'shell-veloce');
    state = paintCar(state, 'car-veloce', 'paint-saffron');
    expect(state.cars.map((car) => car.paint)).toEqual(['#e7ad36', '#e7ad36']);
    expect(state.paints).toEqual(['paint-saffron']);
    expect(() => paintCar(state, 'car-veloce', 'paint-teal')).toThrow('Purchase');
  });
});

describe('versioned saves', () => {
  it('round-trips seed, receipts, parts, assignments and paint', () => {
    const storage = memoryStorage();
    const state = { ...starter(), seed: 12345678 };
    expect(saveGame(state, storage)).toBe(true);
    expect(loadGame(storage)).toEqual(state);
    expect(storage.getItem(STORAGE_KEY)).toContain('"version":1');
  });

  it('round-trips an engine swap with the returned item still available', () => {
    const state = install(purchase(starter(), 'part-i4-performance'), 'car-hachiro', 'instance-part-i4-performance');
    const loaded = parseSave(JSON.stringify(state))!;
    expect(loaded).toEqual(state);
    expect(availableInventory(loaded, 'engine')[0].partId).toBe('i4-stock');
  });

  it('safely falls back for missing, malformed or future-version data', () => {
    const storage = memoryStorage();
    expect(loadGame(storage)).toEqual(newGame());
    for (const raw of ['{broken', 'null', '[]', '{"version":2}', JSON.stringify({ ...starter(), seed: 'invalid' })]) {
      storage.setItem(STORAGE_KEY, raw);
      expect(loadGame(storage)).toEqual(newGame());
    }
  });

  it('rejects duplicated receipts or fabricated inventory', () => {
    const state = starter();
    expect(parseSave(JSON.stringify({ ...state, purchasedListings: [...state.purchasedListings, 'shell-hachiro'] }))).toBeNull();
    expect(parseSave(JSON.stringify({ ...state, inventory: [...state.inventory, state.inventory[0]] }))).toBeNull();
    expect(parseSave(JSON.stringify({ ...state, inventory: [{ id: 'fake', partId: 'i4-performance' }, state.inventory[1]] }))).toBeNull();
  });

  it('rejects impossible saved assignments, wrong slot types and unpurchased paint', () => {
    const state = starter();
    expect(parseSave(JSON.stringify({ ...state, cars: [{ ...state.cars[0], engineId: 'missing' }] }))).toBeNull();
    expect(parseSave(JSON.stringify({ ...state, cars: [{ ...state.cars[0], engineId: state.cars[0].wheelsId }] }))).toBeNull();
    expect(parseSave(JSON.stringify({ ...state, cars: [{ ...state.cars[0], paint: '#397d87' }] }))).toBeNull();
    let both = buy(state, 'shell-bison', 'part-v8-stock');
    both = install(both, 'car-bison', 'instance-part-v8-stock');
    expect(parseSave(JSON.stringify({ ...both, cars: both.cars.map((car) => ({ ...car, wheelsId: 'instance-part-street-1' })) }))).toBeNull();
  });

  it('survives storage denial without losing the active in-memory state', () => {
    const storage: SaveStorage = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('full'); } };
    expect(saveGame(starter(), storage)).toBe(false);
    expect(loadGame(storage)).toEqual(newGame());
  });
});
