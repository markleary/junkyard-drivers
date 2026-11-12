import { describe, expect, it } from 'vitest';
import { getPartsForSale, PARTS, SHELLS } from '../src/game/catalog';
import { availableInventory, buildIssues, getPart, install, newGame, paintCar, parseSave, purchase } from '../src/game/state';
import type { GameState } from '../src/game/state';

const buy = (state: GameState, ...listings: string[]) => listings.reduce((next, id) => purchase(next, id), state);

describe('auto parts store inventory', () => {
  it('keeps new stock separate from salvage racks with unique listing IDs', () => {
    const yard = getPartsForSale('yard');
    const store = getPartsForSale('store');
    expect(yard.map(part => part.id)).toContain('i4-stock');
    expect(store.map(part => part.id)).toContain('crate-i4-stock');
    expect(yard.every(part => part.source === 'yard')).toBe(true);
    expect(store.every(part => part.source === 'store')).toBe(true);
    expect(new Set(PARTS.map(part => part.id)).size).toBe(PARTS.length);
    for (const kind of ['engine', 'wheels', 'paint'] as const) {
      expect(getPartsForSale('store', kind).length).toBeGreaterThan(0);
      expect(getPartsForSale('store', kind).every(part => part.kind === kind)).toBe(true);
    }
  });

  it('has independent new engines and wheel sets to complete every car', () => {
    let state = newGame();
    const wheels = getPartsForSale('store', 'wheels');
    for (const [index, shell] of SHELLS.entries()) {
      const engines = getPartsForSale('store', 'engine').filter(part => part.mount === shell.mount);
      expect(engines).toHaveLength(2);
      expect(engines[1].power).toBeGreaterThan(engines[0].power!);
      // Two cars share each of the smaller mounts, so the second takes the other crate engine.
      const engine = engines.find(part => !state.purchasedListings.includes(`part-${part.id}`))!;
      const wheelId = wheels[index].id;
      state = buy(state, `shell-${shell.id}`, `part-${engine.id}`, `part-${wheelId}`);
      state = install(state, `car-${shell.id}`, `instance-part-${engine.id}`);
      state = install(state, `car-${shell.id}`, `instance-part-${wheelId}`);
    }
    expect(state.cars.every(car => buildIssues(state, car).length === 0)).toBe(true);
    expect(availableInventory(state)).toHaveLength(0);
    expect(parseSave(JSON.stringify(state))).toEqual(state);
  });

  it.each(SHELLS)('rejects the wrong factory-new engine mount for $name', shell => {
    const wrong = getPartsForSale('store', 'engine').find(part => part.mount !== shell.mount)!;
    const state = buy(newGame(), `shell-${shell.id}`, `part-${wrong.id}`);
    expect(() => install(state, `car-${shell.id}`, `instance-part-${wrong.id}`)).toThrow(`${shell.mount} mount`);
  });

  it('cannot grant a second instance or paint unlock from repeated store purchases', () => {
    const once = buy(newGame(), 'part-crate-i4-stock', 'part-new-touring-1', 'part-paint-cobalt');
    let repeated = once;
    for (let i = 0; i < 20; i++) repeated = buy(repeated, 'part-crate-i4-stock', 'part-new-touring-1', 'part-paint-cobalt');
    expect(repeated).toBe(once);
    expect(repeated.inventory).toHaveLength(2);
    expect(repeated.paints).toEqual(['paint-cobalt']);
  });

  it('returns salvage parts when installing store upgrades and preserves both on reload', () => {
    let state = buy(newGame(), 'shell-hachiro', 'part-i4-stock', 'part-street-1', 'part-crate-i4-performance', 'part-new-sport-1');
    state = install(state, 'car-hachiro', 'instance-part-i4-stock');
    state = install(state, 'car-hachiro', 'instance-part-street-1');
    const oldPower = getPart(state, state.cars[0].engineId)!.power!;
    const oldGrip = getPart(state, state.cars[0].wheelsId)!.grip!;
    state = install(state, 'car-hachiro', 'instance-part-crate-i4-performance');
    state = install(state, 'car-hachiro', 'instance-part-new-sport-1');
    expect(availableInventory(state).map(item => item.partId)).toEqual(['i4-stock', 'street-1']);
    expect(getPart(state, state.cars[0].engineId)!.power).toBeGreaterThan(oldPower);
    expect(getPart(state, state.cars[0].wheelsId)!.grip).toBeGreaterThan(oldGrip);
    expect(parseSave(JSON.stringify(state))).toEqual(state);
  });

  it('reuses store-exclusive paint and retains each car’s selected color', () => {
    let state = buy(newGame(1234), 'shell-hachiro', 'shell-veloce', 'part-paint-cobalt', 'part-paint-silver');
    state = paintCar(state, 'car-hachiro', 'paint-cobalt');
    state = paintCar(state, 'car-veloce', 'paint-cobalt');
    state = paintCar(state, 'car-veloce', 'paint-silver');
    expect(state.cars.map(car => car.paint)).toEqual(['#285eaa', '#b7c0c5']);
    expect(state.paints).toEqual(['paint-cobalt', 'paint-silver']);
    expect(parseSave(JSON.stringify(state))).toEqual(state);
  });

  it('loads an existing version-one salvage save without adding store receipts', () => {
    const legacy: GameState = {
      version: 1, seed: 642019,
      purchasedListings: ['shell-hachiro', 'part-i4-stock', 'part-street-1', 'part-paint-saffron'],
      cars: [{ id: 'car-hachiro', shellId: 'hachiro', engineId: 'instance-part-i4-stock', wheelsId: 'instance-part-street-1', paint: '#e7ad36' }],
      inventory: [{ id: 'instance-part-i4-stock', partId: 'i4-stock' }, { id: 'instance-part-street-1', partId: 'street-1' }],
      paints: ['paint-saffron'],
    };
    expect(parseSave(JSON.stringify(legacy))).toEqual(legacy);
    expect(getPartsForSale('store').every(part => !legacy.purchasedListings.includes(`part-${part.id}`))).toBe(true);
  });
});
