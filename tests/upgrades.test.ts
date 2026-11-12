import { describe, expect, it } from 'vitest';
import { LISTINGS, PARTS, SHELLS, UPGRADE_KINDS, categoryOf, getCategoryStock, getPartsForSale, isUpgrade } from '../src/game/catalog';
import { newProgress, parseProgress, type Progress } from '../src/game/progress';
import { availableInventory, buildIssues, install, newGame, parseSave, purchase, type GameState } from '../src/game/state';
import { buildTuning, fitUpgrade, fittedInstances, fittedUpgrades, looseUpgrades, reconcileFitted, removeUpgrade } from '../src/game/upgrades';

const buy = (state: GameState, ...ids: string[]) => ids.reduce((next, id) => purchase(next, id), state);

function kestrel(...extra: string[]): GameState {
  let state = buy(newGame(), 'shell-hachiro', 'part-i4-stock', 'part-street-1', ...extra);
  state = install(state, 'car-hachiro', 'instance-part-i4-stock');
  return install(state, 'car-hachiro', 'instance-part-street-1');
}

describe('tuning parts in the catalog', () => {
  it('offers a turbocharger, an exhaust and a nitrous kit new, each with what it does', () => {
    const tuning = getCategoryStock('store', 'tuning');
    expect(tuning.map(part => part.kind).sort()).toEqual(['exhaust', 'exhaust', 'nitro', 'nitro', 'turbo', 'turbo']);
    for (const part of tuning) {
      expect(isUpgrade(part.kind)).toBe(true);
      expect(categoryOf(part.kind)).toBe('tuning');
      expect(part.price).toBeGreaterThan(0);
      if (part.kind === 'turbo') { expect(part.boost).toBeGreaterThan(.1); expect(part.boost).toBeLessThan(.6); expect(part.lag).toBeGreaterThan(.2); }
      if (part.kind === 'exhaust') { expect(part.flow).toBeGreaterThan(0); expect(part.flow).toBeLessThan(.15); expect(['sport', 'race']).toContain(part.note); }
      if (part.kind === 'nitro') { expect(part.shot).toBeGreaterThan(40); expect(part.burn).toBeGreaterThan(2); }
    }
    // A bigger turbine gives more and takes longer to give it.
    const [small, big] = getPartsForSale('store', 'turbo');
    expect(big.boost).toBeGreaterThan(small.boost!);
    expect(big.lag).toBeGreaterThan(small.lag!);
  });

  it('sells nitrous only at the parts counter: none in the yard, on a rack or hidden', () => {
    const kits = PARTS.filter(part => part.kind === 'nitro');
    expect(kits.length).toBeGreaterThan(0);
    expect(kits.every(part => part.source === 'store')).toBe(true);
    expect(getPartsForSale('yard', 'nitro')).toEqual([]);
    expect(getPartsForSale('hidden', 'nitro')).toEqual([]);
  });

  it('keeps the salvage racks to engines, wheels and paint', () => {
    expect([...new Set(getPartsForSale('yard').map(part => part.kind))].sort()).toEqual(['engine', 'paint', 'wheels']);
    expect(getCategoryStock('yard', 'tuning')).toEqual([]);
    expect(getPartsForSale('yard').some(part => part.rare)).toBe(false);
    expect(getPartsForSale('store').some(part => part.rare)).toBe(false);
  });

  it('leaves every listing id unique and every older id in place', () => {
    expect(new Set(LISTINGS.map(listing => listing.id)).size).toBe(LISTINGS.length);
    for (const id of ['shell-hachiro', 'shell-bison', 'shell-veloce', 'part-i4-stock', 'part-crate-v12-performance', 'part-new-sport-3', 'part-paint-forest']) {
      expect(LISTINGS.some(listing => listing.id === id), id).toBe(true);
    }
  });
});

describe('fitting', () => {
  it('holds a bought tuning part as ordinary inventory in an unchanged save', () => {
    const state = kestrel('part-turbo-street');
    expect(state.inventory.at(-1)).toEqual({ id: 'instance-part-turbo-street', partId: 'turbo-street' });
    expect(Object.keys(state).sort()).toEqual(['cars', 'inventory', 'paints', 'purchasedListings', 'seed', 'version']);
    expect(Object.keys(state.cars[0]).sort()).toEqual(['engineId', 'id', 'paint', 'shellId', 'wheelsId']);
    expect(parseSave(JSON.stringify(state))).toEqual(state);
    expect(buy(state, 'part-turbo-street')).toBe(state);
  });

  it('cannot be put in the engine or wheel slot', () => {
    const state = kestrel('part-turbo-street', 'part-exhaust-sport', 'part-nitro-75');
    for (const id of ['turbo-street', 'exhaust-sport', 'nitro-75']) expect(() => install(state, 'car-hachiro', `instance-part-${id}`)).toThrow(/tuning part/);
    expect(state.cars[0].engineId).toBe('instance-part-i4-stock');
  });

  it('bolts one of each kind to a car and returns the old one to the shelf when swapped', () => {
    const state = kestrel('part-turbo-street', 'part-turbo-race', 'part-exhaust-sport', 'part-nitro-75');
    let progress = newProgress();
    progress = fitUpgrade(state, progress, 'car-hachiro', 'instance-part-turbo-street');
    progress = fitUpgrade(state, progress, 'car-hachiro', 'instance-part-exhaust-sport');
    progress = fitUpgrade(state, progress, 'car-hachiro', 'instance-part-nitro-75');
    expect(Object.keys(fittedUpgrades(state, progress, 'car-hachiro')).sort()).toEqual(['exhaust', 'nitro', 'turbo']);
    expect(looseUpgrades(state, progress, 'turbo').map(item => item.partId)).toEqual(['turbo-race']);
    expect(looseUpgrades(state, progress, 'nitro')).toEqual([]);
    const swapped = fitUpgrade(state, progress, 'car-hachiro', 'instance-part-turbo-race');
    expect(fittedUpgrades(state, swapped, 'car-hachiro').turbo!.part.id).toBe('turbo-race');
    expect(looseUpgrades(state, swapped, 'turbo').map(item => item.partId)).toEqual(['turbo-street']);
    // Fitting the part that is already there changes nothing, and the source record is untouched.
    expect(fitUpgrade(state, swapped, 'car-hachiro', 'instance-part-turbo-race')).toBe(swapped);
    expect(progress.fitted['car-hachiro'].turbo).toBe('instance-part-turbo-street');
    expect(newProgress().fitted).toEqual({});
  });

  it('refuses a part that is not owned, not a tuning part, on another car, or for a car with no engine', () => {
    let state = kestrel('part-turbo-street', 'shell-bison', 'part-v8-stock');
    const progress = fitUpgrade(state, newProgress(), 'car-hachiro', 'instance-part-turbo-street');
    expect(() => fitUpgrade(state, progress, 'car-hachiro', 'instance-part-nitro-75')).toThrow(/not in your inventory/);
    expect(() => fitUpgrade(state, progress, 'car-hachiro', 'instance-part-v8-stock')).toThrow(/not in your inventory/);
    expect(() => fitUpgrade(state, progress, 'car-veloce', 'instance-part-turbo-street')).toThrow(/Choose a car/);
    expect(() => fitUpgrade(state, progress, 'car-bison', 'instance-part-turbo-street')).toThrow(/V8 engine before/);
    state = install(state, 'car-bison', 'instance-part-v8-stock');
    expect(() => fitUpgrade(state, progress, 'car-bison', 'instance-part-turbo-street')).toThrow(/another car/);
  });

  it('unbolts a part without losing it', () => {
    const state = kestrel('part-turbo-street', 'part-nitro-150');
    let progress = fitUpgrade(state, newProgress(), 'car-hachiro', 'instance-part-turbo-street');
    progress = fitUpgrade(state, progress, 'car-hachiro', 'instance-part-nitro-150');
    const without = removeUpgrade(progress, 'car-hachiro', 'turbo');
    expect(without.fitted).toEqual({ 'car-hachiro': { nitro: 'instance-part-nitro-150' } });
    expect(looseUpgrades(state, without, 'turbo')).toHaveLength(1);
    expect(removeUpgrade(without, 'car-hachiro', 'turbo')).toBe(without);
    expect(removeUpgrade(without, 'car-bison', 'nitro')).toBe(without);
    expect(removeUpgrade(without, 'car-hachiro', 'nitro').fitted).toEqual({});
    expect(state.inventory).toHaveLength(4);
  });

  it('does not count tuning parts among the engines and wheels on offer in the build sheet', () => {
    const state = kestrel('part-turbo-street', 'part-exhaust-sport');
    expect(availableInventory(state, 'engine')).toEqual([]);
    expect(availableInventory(state, 'wheels')).toEqual([]);
    expect(buildIssues(state, state.cars[0])).toEqual([]);
  });
});

describe('agreement between the two saves', () => {
  const state = kestrel('part-turbo-street', 'part-exhaust-sport', 'shell-bison', 'part-v8-stock');

  it('survives a round trip through storage', () => {
    let progress = fitUpgrade(state, newProgress(), 'car-hachiro', 'instance-part-turbo-street');
    progress = fitUpgrade(state, progress, 'car-hachiro', 'instance-part-exhaust-sport');
    const loaded = parseProgress(JSON.stringify(progress));
    expect(loaded).toEqual(progress);
    expect(reconcileFitted(state, loaded)).toBe(loaded);
    expect(reconcileFitted(newGame(), newProgress()).fitted).toEqual({});
  });

  it('repairs damaged fittings field by field', () => {
    const repaired = parseProgress(JSON.stringify({
      version: 1,
      fitted: {
        'car-hachiro': { turbo: 'instance-part-turbo-street', exhaust: 7, nitro: '<script>', wheels: 'instance-part-street-1' },
        'car-bison': 'everything', 'constructor': { turbo: 'instance-part-turbo-race' }, 'car-veloce': {},
      },
    }));
    expect(repaired.fitted).toEqual({ 'car-hachiro': { turbo: 'instance-part-turbo-street' } });
    expect(parseProgress(JSON.stringify({ version: 1, fitted: [1, 2] })).fitted).toEqual({});
  });

  it('drops fittings the collection no longer backs, and nothing else', () => {
    const claimed: Progress = { ...newProgress(), fitted: {
      // A part that was never bought, a wheel set in the turbo slot, and a real exhaust.
      'car-hachiro': { nitro: 'instance-part-nitro-75', turbo: 'instance-part-street-1', exhaust: 'instance-part-exhaust-sport' },
      // The Roadmaster has no engine yet, and claims the Kestrel's exhaust as well.
      'car-bison': { exhaust: 'instance-part-exhaust-sport', turbo: 'instance-part-turbo-street' },
      // A car that is not in the collection.
      'car-veloce': { turbo: 'instance-part-turbo-street' },
    } };
    const mended = reconcileFitted(state, claimed);
    expect(mended.fitted).toEqual({ 'car-hachiro': { exhaust: 'instance-part-exhaust-sport' } });
    expect(mended.settings).toBe(claimed.settings);
    expect(fittedInstances(state, claimed, 'car-veloce')).toEqual([]);
    // With an engine in, the Roadmaster keeps the turbo; the exhaust stays with the car that claimed it first.
    const withEngine = install(state, 'car-bison', 'instance-part-v8-stock');
    expect(reconcileFitted(withEngine, claimed).fitted).toEqual({ 'car-hachiro': { exhaust: 'instance-part-exhaust-sport' }, 'car-bison': { turbo: 'instance-part-turbo-street' } });
  });
});

describe('what a build is worth on the road', () => {
  it('describes a plain build with no extras', () => {
    const state = kestrel();
    expect(buildTuning(state, newProgress(), state.cars[0])).toEqual({ mass: 1080, power: 110, grip: 1.8, boost: 0, lag: 0, shot: 0, burn: 0, exhaust: 'stock', peak: 110 });
  });

  it('adds the exhaust to the engine, the turbo on top, and nitrous as a fixed shot', () => {
    const state = kestrel('part-turbo-race', 'part-exhaust-race', 'part-nitro-150');
    let progress = newProgress();
    for (const id of ['turbo-race', 'exhaust-race', 'nitro-150']) progress = fitUpgrade(state, progress, 'car-hachiro', `instance-part-${id}`);
    const tuning = buildTuning(state, progress, state.cars[0]);
    expect(tuning.power).toBeCloseTo(110 * 1.07, 9);
    expect(tuning.boost).toBe(.38);
    expect(tuning.lag).toBe(.85);
    expect(tuning.shot).toBe(150);
    expect(tuning.burn).toBe(3.5);
    expect(tuning.exhaust).toBe('race');
    expect(tuning.peak).toBeCloseTo(110 * 1.07 * 1.38, 9);
  });

  it('will not describe a car that cannot be driven', () => {
    const state = buy(newGame(), 'shell-hachiro', 'part-i4-stock');
    expect(() => buildTuning(state, newProgress(), state.cars[0])).toThrow(/not finished/);
  });

  it('gives every shell, engine and tuning combination finite, positive numbers', () => {
    const tuningParts = PARTS.filter(part => isUpgrade(part.kind));
    for (const shell of SHELLS) for (const engine of PARTS.filter(part => part.kind === 'engine' && part.mount === shell.mount)) {
      let state = buy(newGame(), `shell-${shell.id}`, `part-${engine.id}`, 'part-rare-wheels', ...tuningParts.map(part => `part-${part.id}`));
      state = install(install(state, `car-${shell.id}`, `instance-part-${engine.id}`), `car-${shell.id}`, 'instance-part-rare-wheels');
      for (const kind of UPGRADE_KINDS) for (const part of tuningParts.filter(item => item.kind === kind)) {
        const tuning = buildTuning(state, fitUpgrade(state, newProgress(), `car-${shell.id}`, `instance-part-${part.id}`), state.cars[0]);
        for (const value of [tuning.mass, tuning.power, tuning.grip, tuning.peak]) { expect(Number.isFinite(value)).toBe(true); expect(value).toBeGreaterThan(0); }
        expect(tuning.peak).toBeGreaterThanOrEqual(tuning.power);
        expect(tuning.peak).toBeLessThan(700);
      }
    }
  });
});
