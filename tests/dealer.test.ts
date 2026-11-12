import { describe, expect, it } from 'vitest';
import { PARTS, SHELLS, getShell, type ShellId } from '../src/game/catalog';
import { OFFER_RANGE, PROOF_VALUE, appraise, completeSale, investment, lapProof, offerRange, offerWithin, sessionRoll } from '../src/game/dealer';
import { MEDAL_TIMES, SHELL_IDS, newProgress, parseProgress, recordLap, setStyle, type Progress } from '../src/game/progress';
import { install, newGame, paintCar, parseSave, purchase, sellCar, type GameState } from '../src/game/state';
import { fitUpgrade } from '../src/game/upgrades';
import { atDealer, dealerSite } from '../src/world/dealer';
import { generateTown, lotLocal, lotPoint } from '../src/world/layout';

const buy = (state: GameState, ...ids: string[]) => ids.reduce((next, id) => purchase(next, id), state);
const price = (id: string) => PARTS.find(part => part.id === id)!.price;

/** A finished Kestrel in saffron: shell 1400, engine 650, wheels 480, paint 120. */
function kestrel(): GameState {
  let state = buy(newGame(), 'shell-hachiro', 'part-i4-stock', 'part-street-1', 'part-paint-saffron');
  state = install(state, 'car-hachiro', 'instance-part-i4-stock');
  state = install(state, 'car-hachiro', 'instance-part-street-1');
  return paintCar(state, 'car-hachiro', 'paint-saffron');
}

describe('what the player put in', () => {
  it('adds up the shell, the fitted engine and wheels, and the respray', () => {
    const state = kestrel(), sum = investment(state, newProgress(), state.cars[0]);
    expect(sum.lines.map(line => [line.label, line.amount])).toEqual([['Shell', 1400], ['Engine', 650], ['Wheels', 480], ['Paint', 120]]);
    expect(sum.total).toBe(2650);
  });

  it('leaves out paint on a car still in the colour it was found in, and parts that are only on the shelf', () => {
    let state = buy(newGame(), 'shell-bison', 'part-v8-stock', 'part-v8-performance', 'part-street-1', 'part-paint-teal');
    state = install(state, 'car-bison', 'instance-part-v8-stock');
    expect(investment(state, newProgress(), state.cars[0]).total).toBe(getShell('bison').price + price('v8-stock'));
    state = install(state, 'car-bison', 'instance-part-street-1');
    expect(investment(state, newProgress(), state.cars[0]).total).toBe(getShell('bison').price + price('v8-stock') + price('street-1'));
  });

  it('counts each tuning part bolted to the car, and none bolted to another', () => {
    let state = buy(kestrel(), 'shell-bison', 'part-v8-stock', 'part-turbo-street', 'part-exhaust-race', 'part-nitro-150');
    state = install(state, 'car-bison', 'instance-part-v8-stock');
    let progress = newProgress();
    for (const id of ['turbo-street', 'exhaust-race']) progress = fitUpgrade(state, progress, 'car-hachiro', `instance-part-${id}`);
    progress = fitUpgrade(state, progress, 'car-bison', 'instance-part-nitro-150');
    const sum = investment(state, progress, state.cars[0]);
    expect(sum.lines.map(line => line.label)).toEqual(['Shell', 'Engine', 'Wheels', 'Turbocharger', 'Exhaust', 'Paint']);
    expect(sum.total).toBe(2650 + price('turbo-street') + price('exhaust-race'));
    expect(investment(state, progress, state.cars[1]).lines.map(line => line.label)).toEqual(['Shell', 'Engine', 'Nitrous']);
  });
});

describe('proof of speed', () => {
  it('is nothing without a lap and everything with a gold one, for every car', () => {
    for (const shell of SHELL_IDS) {
      const times = MEDAL_TIMES[shell];
      expect(lapProof(shell, undefined)).toBe(0);
      expect(lapProof(shell, Number.NaN)).toBe(0);
      expect(lapProof(shell, times.gold)).toBe(PROOF_VALUE.gold);
      expect(lapProof(shell, times.gold - 9)).toBe(PROOF_VALUE.gold);
      expect(lapProof(shell, times.silver)).toBeCloseTo(PROOF_VALUE.silver, 9);
      expect(lapProof(shell, times.bronze)).toBeCloseTo(PROOF_VALUE.bronze, 9);
      expect(lapProof(shell, times.bronze + 500)).toBe(PROOF_VALUE.slow);
    }
  });

  it('never rewards a slower lap more than a quicker one, and has no jumps', () => {
    for (const shell of SHELL_IDS) {
      let previous = lapProof(shell, 30);
      for (let lap = 30.05; lap < 130; lap += .05) {
        const value = lapProof(shell, lap);
        expect(value, `${shell} at ${lap.toFixed(2)}`).toBeLessThanOrEqual(previous + 1e-12);
        expect(previous - value, `${shell} at ${lap.toFixed(2)}`).toBeLessThan(.02);
        expect(value).toBeGreaterThanOrEqual(PROOF_VALUE.slow);
        previous = value;
      }
    }
  });
});

describe('offer range', () => {
  it('always starts above what was put in and never passes twice that', () => {
    for (let invested = 1500; invested < 60000; invested += 137) for (let step = 0; step <= 20; step++) {
      const proof = step / 20, range = offerRange(invested, proof);
      expect(range.low, `${invested} at ${proof}`).toBeGreaterThan(invested);
      expect(range.high).toBeGreaterThanOrEqual(range.low);
      expect(range.high).toBeLessThanOrEqual(invested * 2);
      expect(range.low % 10).toBe(0);
      expect(range.high % 10).toBe(0);
    }
  });

  it('reaches about twice the outlay only for a gold lap, and stays modest for a car that has never been driven', () => {
    const proven = offerRange(10000, 1), untried = offerRange(10000, 0);
    expect(proven).toEqual({ low: 14000, high: 20000 });
    expect(untried).toEqual({ low: 10600, high: 12500 });
    expect(OFFER_RANGE.high[1]).toBe(2);
    // Out-of-range proof is clamped rather than extrapolated.
    expect(offerRange(10000, 7)).toEqual(proven);
    expect(offerRange(10000, -3)).toEqual(untried);
  });

  it('moves both ends up as the proof improves', () => {
    let previous = offerRange(8430, 0);
    for (let step = 1; step <= 40; step++) {
      const range = offerRange(8430, step / 40);
      expect(range.low).toBeGreaterThanOrEqual(previous.low);
      expect(range.high).toBeGreaterThanOrEqual(previous.high);
      previous = range;
    }
    expect(previous.low).toBeGreaterThan(offerRange(8430, 0).high);
  });

  it('keeps even a nearly worthless car above its cost', () => {
    for (const invested of [1, 9, 10, 95, 101]) {
      const range = offerRange(invested, 0);
      expect(range.low).toBeGreaterThan(invested);
      expect(range.high).toBeGreaterThanOrEqual(range.low);
    }
  });
});

describe('the dealer’s mood', () => {
  it('is fixed for a session and differs between sessions and between models', () => {
    const rolls = new Set<number>();
    for (const shell of SHELL_IDS) {
      const roll = sessionRoll(20261112, shell);
      expect(roll).toBe(sessionRoll(20261112, shell));
      expect(roll).toBeGreaterThanOrEqual(0);
      expect(roll).toBeLessThan(1);
      rolls.add(roll);
    }
    expect(rolls.size).toBe(SHELL_IDS.length);
    const sessions = new Set(Array.from({ length: 200 }, (_, seed) => sessionRoll(seed, 'hachiro')));
    expect(sessions.size).toBeGreaterThan(190);
  });

  it('spreads across the whole range over many sessions', () => {
    const rolls = Array.from({ length: 4000 }, (_, seed) => sessionRoll(seed * 7919 + 13, 'bison'));
    const mean = rolls.reduce((sum, value) => sum + value, 0) / rolls.length;
    expect(mean).toBeGreaterThan(.46);
    expect(mean).toBeLessThan(.54);
    expect(Math.min(...rolls)).toBeLessThan(.02);
    expect(Math.max(...rolls)).toBeGreaterThan(.98);
  });

  it('turns a roll into a whole-ten offer inside the range', () => {
    const range = { low: 2810, high: 3310 };
    expect(offerWithin(range, 0)).toBe(2810);
    expect(offerWithin(range, 1)).toBe(3310);
    expect(offerWithin(range, .5)).toBe(3060);
    expect(offerWithin(range, 9)).toBe(3310);
    expect(offerWithin(range, -1)).toBe(2810);
    for (let roll = 0; roll <= 1; roll += .013) {
      const offer = offerWithin(range, roll);
      expect(offer % 10).toBe(0);
      expect(offer).toBeGreaterThanOrEqual(range.low);
      expect(offer).toBeLessThanOrEqual(range.high);
    }
  });
});

describe('appraisal', () => {
  it('gives the same offer every time it is asked in one session', () => {
    const state = kestrel(), progress = recordLap(newProgress(), 'hachiro', 61.4).progress;
    const first = appraise(state, progress, state.cars[0], 4242);
    for (let i = 0; i < 5; i++) expect(appraise(state, progress, state.cars[0], 4242).offer).toBe(first.offer);
    expect(first.offer).toBeGreaterThanOrEqual(first.range.low);
    expect(first.offer).toBeLessThanOrEqual(first.range.high);
    expect(first.profit).toBe(first.offer - 2650);
    expect(first.profit).toBeGreaterThan(0);
    expect(first.medal).toBe('bronze');
    expect(first.lap).toBe(61.4);
  });

  it('pays more for the same car once it has proved a quicker lap', () => {
    const state = kestrel();
    const untried = appraise(state, newProgress(), state.cars[0], 99);
    const bronze = appraise(state, recordLap(newProgress(), 'hachiro', MEDAL_TIMES.hachiro.bronze).progress, state.cars[0], 99);
    const gold = appraise(state, recordLap(newProgress(), 'hachiro', MEDAL_TIMES.hachiro.gold).progress, state.cars[0], 99);
    expect(untried.proof).toBe(0);
    expect(untried.medal).toBeNull();
    expect(bronze.offer).toBeGreaterThan(untried.offer);
    expect(gold.offer).toBeGreaterThan(bronze.offer);
    expect(gold.range.high).toBe(Math.floor(2650 * 2 / 10) * 10);
  });

  it('pays more for a car with more put into it', () => {
    const plain = kestrel();
    let tuned = buy(plain, 'part-turbo-race', 'part-rare-wheels');
    tuned = install(tuned, 'car-hachiro', 'instance-part-rare-wheels');
    const progress = fitUpgrade(tuned, newProgress(), 'car-hachiro', 'instance-part-turbo-race');
    expect(appraise(tuned, progress, tuned.cars[0], 7).offer).toBeGreaterThan(appraise(plain, newProgress(), plain.cars[0], 7).offer);
  });

  it('lists what an unfinished car still needs', () => {
    const state = buy(newGame(), 'shell-veloce');
    expect(appraise(state, newProgress(), state.cars[0], 1).issues).toHaveLength(2);
    expect(() => completeSale(state, newProgress(), 'car-veloce', 1)).toThrow(/only buys cars that run/);
    expect(() => completeSale(state, newProgress(), 'car-bison', 1)).toThrow(/not in your collection/);
  });

  it('holds every car in the catalog, in every state of proof, to the promise: more than cost, at most double', () => {
    for (const shell of SHELLS) {
      const engines = PARTS.filter(part => part.kind === 'engine' && part.mount === shell.mount);
      for (const engine of engines) for (const wheels of PARTS.filter(part => part.kind === 'wheels')) {
        let state = buy(newGame(), `shell-${shell.id}`, `part-${engine.id}`, `part-${wheels.id}`);
        state = install(state, `car-${shell.id}`, `instance-part-${engine.id}`);
        state = install(state, `car-${shell.id}`, `instance-part-${wheels.id}`);
        const cost = shell.price + engine.price + wheels.price;
        for (const lap of [undefined, 200, MEDAL_TIMES[shell.id].bronze, MEDAL_TIMES[shell.id].silver, MEDAL_TIMES[shell.id].gold - 1]) {
          const progress: Progress = lap === undefined ? newProgress() : recordLap(newProgress(), shell.id, lap).progress;
          for (const seed of [0, 1, 77, 0xffffffff]) {
            const sheet = appraise(state, progress, state.cars[0], seed);
            expect(sheet.investment.total).toBe(cost);
            expect(sheet.offer, `${shell.id} ${engine.id} ${wheels.id}`).toBeGreaterThan(cost);
            expect(sheet.offer).toBeLessThanOrEqual(cost * 2);
          }
        }
      }
    }
  });
});

describe('selling', () => {
  it('removes the car, its fitted parts and their receipts, and keeps everything else', () => {
    let state = buy(kestrel(), 'part-i4-performance', 'part-sport-1', 'shell-bison', 'part-turbo-street', 'part-exhaust-sport', 'part-nitro-75');
    let progress = fitUpgrade(state, newProgress(), 'car-hachiro', 'instance-part-turbo-street');
    progress = fitUpgrade(state, progress, 'car-hachiro', 'instance-part-nitro-75');
    progress = recordLap(progress, 'hachiro', 57).progress;
    const before = appraise(state, progress, state.cars[0], 31337);
    const sale = completeSale(state, progress, 'car-hachiro', 31337);
    state = sale.state;
    expect(sale.amount).toBe(before.offer);
    expect(sale.profit).toBe(before.offer - before.investment.total);
    expect(state.cars.map(car => car.id)).toEqual(['car-bison']);
    expect(state.inventory.map(item => item.partId).sort()).toEqual(['exhaust-sport', 'i4-performance', 'sport-1']);
    expect([...state.purchasedListings].sort()).toEqual(['part-exhaust-sport', 'part-i4-performance', 'part-paint-saffron', 'part-sport-1', 'shell-bison']);
    expect(state.paints).toEqual(['paint-saffron']);
    // The save is still one the first release would have written and can read back.
    expect(parseSave(JSON.stringify(state))).toEqual(state);
  });

  it('logs the takings, and takes the lap proof, the fittings and the finish with the car', () => {
    let state = buy(kestrel(), 'part-exhaust-race');
    let progress: Progress = { ...newProgress(), finds: ['pocket', 'crane', 'office'] };
    progress = fitUpgrade(state, progress, 'car-hachiro', 'instance-part-exhaust-race');
    progress = setStyle(recordLap(progress, 'hachiro', 70).progress, 'car-hachiro', { finish: 'metallic', stripe: 'ivory' });
    const first = completeSale(state, progress, 'car-hachiro', 5);
    expect(first.progress.sales).toEqual({ count: 1, takings: first.amount, profit: first.profit, best: first.amount });
    expect(first.progress.proof).toEqual({});
    expect(first.progress.fitted).toEqual({});
    expect(first.progress.styles).toEqual({});
    // Records, finds and what they unlocked are the driver's, not the car's.
    expect(first.progress.bestLap).toEqual({ hachiro: 70 });
    expect(first.progress.finds).toEqual(['pocket', 'crane', 'office']);
    expect(first.progress.laps).toBe(1);
    expect(progress.sales.count).toBe(0);
    expect(parseProgress(JSON.stringify(first.progress))).toEqual(first.progress);

    // The same model can be found, rebuilt and sold again; a new car starts unproven.
    state = buy(first.state, 'shell-hachiro', 'part-i4-stock', 'part-street-1');
    state = install(install(state, 'car-hachiro', 'instance-part-i4-stock'), 'car-hachiro', 'instance-part-street-1');
    const again = appraise(state, first.progress, state.cars[0], 5);
    expect(again.proof).toBe(0);
    expect(again.lap).toBeUndefined();
    const second = completeSale(state, first.progress, 'car-hachiro', 5);
    expect(second.progress.sales.count).toBe(2);
    expect(second.progress.sales.takings).toBe(first.amount + second.amount);
    expect(second.progress.sales.profit).toBe(first.profit + second.profit);
    expect(second.progress.sales.best).toBe(Math.max(first.amount, second.amount));
    expect(second.state).toEqual({ ...newGame(), purchasedListings: ['part-paint-saffron'], paints: ['paint-saffron'] });
  });

  it('sends rare pieces back into hiding when they are sold with a car, and counts each return', () => {
    let state = buy(newGame(), 'shell-wren', 'part-rare-i4', 'part-rare-wheels', 'part-rare-turbo', 'part-rare-exhaust');
    state = install(install(state, 'car-wren', 'instance-part-rare-i4'), 'car-wren', 'instance-part-rare-wheels');
    const progress = fitUpgrade(state, newProgress(), 'car-wren', 'instance-part-rare-turbo');
    const sale = completeSale(state, progress, 'car-wren', 2);
    expect(sale.restocked.sort()).toEqual(['part-rare-i4', 'part-rare-turbo', 'part-rare-wheels', 'shell-wren']);
    expect(sale.progress.restock).toEqual({ 'shell-wren': 1, 'part-rare-i4': 1, 'part-rare-wheels': 1, 'part-rare-turbo': 1 });
    // The exhaust was never fitted: it stays on the shelf and where it was found.
    expect(sale.state.inventory).toEqual([{ id: 'instance-part-rare-exhaust', partId: 'rare-exhaust' }]);
    // A car from the display rows goes back on display; nothing about it is counted.
    const plain = completeSale(kestrel(), newProgress(), 'car-hachiro', 2);
    expect(plain.restocked).toEqual([]);
    expect(plain.progress.restock).toEqual({});
  });

  it('refuses to take a part that belongs to another car', () => {
    let state = buy(kestrel(), 'shell-bison', 'part-v8-stock', 'part-street-2');
    state = install(install(state, 'car-bison', 'instance-part-v8-stock'), 'car-bison', 'instance-part-street-2');
    expect(() => sellCar(state, 'car-hachiro', ['instance-part-v8-stock'])).toThrow(/another car/);
    expect(() => sellCar(state, 'car-hachiro', ['instance-part-missing'])).toThrow(/not in your inventory/);
    expect(() => sellCar(state, 'car-veloce')).toThrow(/not in your collection/);
    expect(sellCar(state, 'car-hachiro').cars.map(car => car.shellId)).toEqual(['bison' satisfies ShellId]);
  });
});

describe('the lot', () => {
  it('stands on the home straight for every town, with its bay and hatch inside it', () => {
    for (const seed of [642019, 913057, 1, 7, 42, 2024, 31337, 500000, 777777, 999983]) {
      const layout = generateTown(seed), site = dealerSite(layout)!;
      expect(site, `seed ${seed}`).not.toBeNull();
      expect(site.along).toBeGreaterThan(site.depth);
      for (const point of [site.bay, site.hatch]) {
        expect(Math.abs(point.x - site.lot.x)).toBeLessThan(site.lot.w / 2);
        expect(Math.abs(point.z - site.lot.z)).toBeLessThan(site.lot.d / 2);
      }
      expect(atDealer(layout, site.bay.x, site.bay.z)).toBe(true);
      // Pulled up at the kerb outside counts; the far lane and the next block do not.
      const kerb = lotPoint(site.lot, 0, site.depth / 2 + 6), far = lotPoint(site.lot, 0, site.depth / 2 + 13), behind = lotPoint(site.lot, 0, -site.depth / 2 - 3);
      expect(atDealer(layout, kerb.x, kerb.z)).toBe(true);
      expect(atDealer(layout, far.x, far.z)).toBe(false);
      expect(atDealer(layout, behind.x, behind.z)).toBe(false);
      expect(atDealer(layout, -20, -13)).toBe(false);
    }
  });

  it('converts between the lot’s frame and the world both ways', () => {
    const lot = dealerSite(generateTown(642019))!.lot;
    for (const [across, toward] of [[0, 0], [7.4, 1.4], [-9, -5], [12, 8]]) {
      const point = lotPoint(lot, across, toward), back = lotLocal(lot, point.x, point.z);
      expect(back.across).toBeCloseTo(across, 9);
      expect(back.toward).toBeCloseTo(toward, 9);
    }
  });

  it('reports no dealer in a town with no lot, instead of failing', () => {
    const layout = { ...generateTown(1), lots: [] };
    expect(dealerSite(layout)).toBeNull();
    expect(atDealer(layout, 0, 100)).toBe(false);
  });
});
