import { describe, expect, it } from 'vitest';
import { FIND_IDS } from '../src/game/finds';
import {
  FINISHES, MEDAL_TIMES, PROGRESS_KEY, STRIPES, bestMedal, finishUnlocked, formatLap, loadProgress, medalFor, newProgress, parseProgress,
  recordDriving, recordFind, recordLap, saveProgress, setStyle, stripeUnlocked, styleFor, type Progress,
} from '../src/game/progress';
import { CHECKPOINT_RADIUS, advanceTrial, newTrial, runningTime } from '../src/game/trial';
import { Drivetrain } from '../src/physics/drivetrain';
import { generateTown } from '../src/world/layout';

const withFinds = (count: number): Progress => ({ ...newProgress(), finds: FIND_IDS.slice(0, count) as unknown as string[] });

describe('progress save', () => {
  it('starts empty and survives a round trip', () => {
    let progress = newProgress();
    expect(parseProgress(JSON.stringify(progress))).toEqual(progress);
    progress = recordFind(progress, 'crane');
    progress = recordLap(progress, 'hachiro', 52.337).progress;
    progress = recordDriving(progress, 'hachiro', 1840.5, 31.2);
    progress = { ...progress, settings: { ...progress.settings, camera: 'bonnet', time: 'night', map: false }, hour: 21.25 };
    expect(parseProgress(JSON.stringify(progress), FIND_IDS)).toEqual(progress);
  });

  it('uses the opening budget for older saves and preserves a valid saved budget', () => {
    for (const budget of [undefined, -1, '2000', 3.5]) {
      const loaded = parseProgress(JSON.stringify({ version: 1, budget, stash: 12, laps: 2 }), undefined, 1234);
      expect(loaded).toMatchObject({ budget: 1234, stash: 12, laps: 2 });
    }
    for (const budget of [0, 2050]) {
      const progress = newProgress(budget);
      expect(parseProgress(JSON.stringify(progress), undefined, 1234)).toEqual(progress);
    }
  });

  it('repairs damaged fields one at a time instead of discarding the save', () => {
    const repaired = parseProgress(JSON.stringify({
      version: 1, finds: ['pocket', 'pocket', 'bogus', 5, 'tower'], laps: 3.9, hour: 99,
      bestLap: { hachiro: 50.5, bison: -3, veloce: 'fast' }, odometer: { hachiro: 1200, bison: Infinity }, topSpeed: { veloce: 999 },
      settings: { quality: 'ultra', camera: 'far', motion: 'yes', map: false },
      styles: { 'car-hachiro': { finish: 'pearl', stripe: 'chequered' }, 'constructor': { finish: 'matte' }, 'car-bison': 7 },
    }), FIND_IDS);
    expect(repaired.finds).toEqual(['pocket', 'tower']);
    expect(repaired.bestLap).toEqual({ hachiro: 50.5 });
    expect(repaired.odometer).toEqual({ hachiro: 1200 });
    expect(repaired.topSpeed).toEqual({});
    expect(repaired.laps).toBe(3);
    expect(repaired.hour).toBe(newProgress().hour);
    expect(repaired.settings).toEqual({ ...newProgress().settings, camera: 'far', map: false });
    expect(repaired.styles).toEqual({ 'car-hachiro': { finish: 'pearl', stripe: 'none' } });
    // A hand-edited style cannot outrun what has been earned.
    expect(styleFor(repaired, 'car-hachiro')).toEqual({ finish: 'gloss', stripe: 'none' });
  });

  it('keeps what the dealer and the hidden salvage add, and repairs each of those on its own', () => {
    let progress: Progress = {
      ...newProgress(), stash: 0x9e3779b1, fitted: { 'car-hachiro': { turbo: 'instance-part-turbo-street', nitro: 'instance-part-nitro-75' } },
      sales: { count: 2, takings: 9120, profit: 2110, best: 5400 }, restock: { 'shell-wren': 2, 'part-rare-turbo': 1 },
    };
    progress = recordLap(progress, 'hachiro', 61.2).progress;
    progress = recordLap(progress, 'wren', 55.004).progress;
    // A slower lap neither replaces the record nor the proof the dealer goes by.
    progress = recordLap(progress, 'hachiro', 64).progress;
    expect(progress.proof).toEqual({ hachiro: 61.2, wren: 55 });
    expect(parseProgress(JSON.stringify(progress), FIND_IDS)).toEqual(progress);

    const repaired = parseProgress(`{"version":1,"stash":-4.5,"proof":{"hachiro":58.25,"wren":-1,"bison":"quick","kart":40},
      "sales":{"count":2.9,"takings":5000.4,"profit":9000,"best":7000},
      "restock":{"shell-wren":3.7,"part-rare-turbo":0,"__proto__":4,"Shell Wren":2,"part-rare-i4":"many"}}`);
    expect(repaired.stash).toBe(0);
    expect(repaired.proof).toEqual({ hachiro: 58.25 });
    // Whole dollars, and neither the profit nor the best sale can be more than was ever paid out.
    expect(repaired.sales).toEqual({ count: 2, takings: 5000, profit: 5000, best: 5000 });
    expect(repaired.restock).toEqual({ 'shell-wren': 3 });
    expect(Object.getPrototypeOf(repaired.restock)).toBe(Object.prototype);
    // The rest of a record survives a field of the wrong shape.
    const mangled = parseProgress(JSON.stringify({ version: 1, laps: 4, sales: 'plenty', restock: [3], proof: null, stash: 2 ** 32, fitted: 'all of it' }));
    expect(mangled).toEqual({ ...newProgress(), laps: 4 });
    for (const stash of [12.5, Number.NaN, '7']) expect(parseProgress(JSON.stringify({ version: 1, stash })).stash).toBe(0);
    expect(parseProgress(JSON.stringify({ version: 1, stash: 0xffffffff })).stash).toBe(0xffffffff);
  });

  it('counts laps from before the dealer opened as proof, once', () => {
    // A record as the previous release wrote it: laps, but no word of proof.
    const earlier = JSON.stringify({ version: 1, laps: 9, bestLap: { hachiro: 51.9, veloce: 54.25 }, odometer: { hachiro: 9000 } });
    const loaded = parseProgress(earlier);
    expect(loaded.proof).toEqual({ hachiro: 51.9, veloce: 54.25 });
    expect(loaded.bestLap).toEqual({ hachiro: 51.9, veloce: 54.25 });
    // Once the record has been written by this release the proof stands on its own: a car sold on takes its proof with it,
    // and the record lap that stays behind does not vouch for the next car of that model.
    const sold: Progress = { ...loaded, proof: { veloce: 54.25 } };
    expect(parseProgress(JSON.stringify(sold)).proof).toEqual({ veloce: 54.25 });
    expect(parseProgress(JSON.stringify({ ...loaded, proof: {} })).proof).toEqual({});
    expect(parseProgress(JSON.stringify(newProgress())).proof).toEqual({});
  });

  it('falls back to a fresh logbook for unreadable or foreign data', () => {
    for (const raw of ['', 'not json', 'null', '[]', '{"version":2,"finds":["pocket"]}']) expect(parseProgress(raw)).toEqual(newProgress());
  });

  it('loads and saves through any storage, and shrugs off one that fails', () => {
    const cells = new Map<string, string>();
    const storage = { getItem: (key: string) => cells.get(key) ?? null, setItem: (key: string, value: string) => void cells.set(key, value) };
    expect(loadProgress(storage)).toEqual(newProgress());
    const progress = recordFind(newProgress(), 'fuel');
    expect(saveProgress(progress, storage)).toBe(true);
    expect([...cells.keys()]).toEqual([PROGRESS_KEY]);
    expect(loadProgress(storage, FIND_IDS)).toEqual(progress);
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } };
    expect(loadProgress(broken)).toEqual(newProgress());
    expect(saveProgress(progress, broken)).toBe(false);
    expect(saveProgress(progress, undefined)).toBe(false);
  });
});

describe('medals, finishes and stripes', () => {
  it('awards medals at the posted times for each car', () => {
    for (const [shell, times] of Object.entries(MEDAL_TIMES) as [keyof typeof MEDAL_TIMES, (typeof MEDAL_TIMES)['hachiro']][]) {
      expect(times.gold).toBeLessThan(times.silver);
      expect(times.silver).toBeLessThan(times.bronze);
      expect(medalFor(shell, times.gold)).toBe('gold');
      expect(medalFor(shell, times.gold + .01)).toBe('silver');
      expect(medalFor(shell, times.silver + .01)).toBe('bronze');
      expect(medalFor(shell, times.bronze + .01)).toBeNull();
    }
  });

  it('keeps the best lap, counts every lap, and reports only a better medal as new', () => {
    const first = recordLap(newProgress(), 'hachiro', 60);
    expect(first).toMatchObject({ improved: true, medal: 'bronze', newMedal: true, previous: undefined });
    const slower = recordLap(first.progress, 'hachiro', 64.2);
    expect(slower).toMatchObject({ improved: false, medal: 'bronze', newMedal: false, previous: 60 });
    expect(slower.progress.bestLap.hachiro).toBe(60);
    const quicker = recordLap(slower.progress, 'hachiro', 55.256);
    expect(quicker).toMatchObject({ improved: true, medal: 'silver', newMedal: true });
    expect(quicker.progress.bestLap.hachiro).toBe(55.26);
    expect(quicker.progress.laps).toBe(3);
    expect(bestMedal(quicker.progress)).toBe('silver');
    expect(bestMedal(newProgress())).toBeNull();
  });

  it('unlocks finishes by finds and stripes by the best medal in any car', () => {
    for (const finish of FINISHES) {
      expect(finishUnlocked(withFinds(finish.finds), finish.id)).toBe(true);
      if (finish.finds > 0) expect(finishUnlocked(withFinds(finish.finds - 1), finish.id)).toBe(false);
    }
    const bronze = recordLap(newProgress(), 'bison', MEDAL_TIMES.bison.bronze).progress;
    const gold = recordLap(bronze, 'veloce', MEDAL_TIMES.veloce.gold).progress;
    expect(STRIPES.map(stripe => stripeUnlocked(newProgress(), stripe.id))).toEqual([true, false, false, false]);
    expect(STRIPES.map(stripe => stripeUnlocked(bronze, stripe.id))).toEqual([true, true, false, false]);
    expect(STRIPES.map(stripe => stripeUnlocked(gold, stripe.id))).toEqual([true, true, true, true]);
  });

  it('applies only earned styles, per car', () => {
    const fresh = newProgress();
    expect(() => setStyle(fresh, 'car-hachiro', { finish: 'matte' })).toThrow(/not unlocked/);
    expect(() => setStyle(fresh, 'car-hachiro', { stripe: 'gold' })).toThrow(/not unlocked/);
    const earned = recordLap(withFinds(6), 'hachiro', MEDAL_TIMES.hachiro.bronze).progress;
    const styled = setStyle(setStyle(earned, 'car-hachiro', { finish: 'matte' }), 'car-hachiro', { stripe: 'ivory' });
    expect(styleFor(styled, 'car-hachiro')).toEqual({ finish: 'matte', stripe: 'ivory' });
    expect(styleFor(styled, 'car-bison')).toEqual({ finish: 'gloss', stripe: 'none' });
    expect(earned.styles).toEqual({});
  });

  it('records finds once and driving only when something changed', () => {
    const once = recordFind(newProgress(), 'alley');
    expect(recordFind(once, 'alley')).toBe(once);
    expect(recordDriving(once, 'bison', 0, 0)).toBe(once);
    const driven = recordDriving(recordDriving(once, 'bison', 400, 18), 'bison', 250.5, 12);
    expect(driven.odometer.bison).toBeCloseTo(650.5);
    expect(driven.topSpeed.bison).toBe(18);
    expect(recordDriving(driven, 'bison', -30, 25).odometer.bison).toBeCloseTo(650.5);
  });

  it('prints lap times in minutes, seconds and tenths', () => {
    expect(formatLap(0)).toBe('0:00.0');
    expect(formatLap(9.94)).toBe('0:09.9');
    expect(formatLap(48)).toBe('0:48.0');
    expect(formatLap(59.96)).toBe('1:00.0');
    expect(formatLap(65.04)).toBe('1:05.0');
    expect(formatLap(754.32)).toBe('12:34.3');
  });
});

describe('test loop', () => {
  const loop = generateTown(642019).loop;

  it('times a lap from the first checkpoint to the last, in order', () => {
    const trial = newTrial();
    expect(runningTime(trial, 10)).toBe(0);
    // Reaching a later checkpoint first does nothing.
    expect(advanceTrial(trial, loop, loop[2], 5)).toBeNull();
    const events = loop.map((point, index) => advanceTrial(trial, loop, point, 100 + index * 9));
    expect(events).toEqual(['start', ...Array(loop.length - 2).fill('checkpoint'), 'finish']);
    expect(trial.complete).toBe(true);
    expect(trial.elapsed).toBe((loop.length - 1) * 9);
    expect(runningTime(trial, 9999)).toBe(trial.elapsed);
  });

  it('counts a checkpoint only inside its radius and reports the running time', () => {
    const trial = newTrial();
    expect(advanceTrial(trial, loop, { x: loop[0].x + CHECKPOINT_RADIUS + .5, z: loop[0].z }, 0)).toBeNull();
    expect(advanceTrial(trial, loop, { x: loop[0].x + CHECKPOINT_RADIUS - .5, z: loop[0].z }, 20)).toBe('start');
    expect(advanceTrial(trial, loop, loop[0], 21)).toBeNull();
    expect(runningTime(trial, 27.5)).toBe(7.5);
  });

  it('starts another lap only after the car has been back inside the yard', () => {
    const trial = newTrial();
    loop.forEach((point, index) => advanceTrial(trial, loop, point, index * 8));
    // Sitting on the line after the finish must not start a second lap.
    expect(advanceTrial(trial, loop, loop[0], 500)).toBeNull();
    expect(advanceTrial(trial, loop, { x: loop[0].x, z: loop[0].z - 20 }, 510)).toBeNull();
    expect(trial.armed).toBe(true);
    expect(advanceTrial(trial, loop, loop[0], 520)).toBe('start');
    expect(trial).toMatchObject({ index: 1, startedAt: 520, complete: false, armed: false });
    expect(runningTime(trial, 523)).toBe(3);
  });
});

describe('drivetrain', () => {
  const run = (drivetrain: Drivetrain, speed: number, throttle: number, frames = 120) => { for (let i = 0; i < frames; i++) drivetrain.update(speed, throttle, 1 / 60); };

  it('idles in neutral, selects reverse when rolling back, and first when pulling away', () => {
    const drivetrain = new Drivetrain(150);
    run(drivetrain, 0, 0);
    expect(drivetrain.gear).toBe('N');
    expect(drivetrain.rpm).toBeLessThan(.01);
    run(drivetrain, -2, .5);
    expect(drivetrain.gear).toBe('R');
    run(drivetrain, 0, 1);
    expect(drivetrain.gear).toBe(1);
    expect(drivetrain.rpm).toBeGreaterThan(.25);
  });

  it('works up through five gears with the revs falling at each change', () => {
    const drivetrain = new Drivetrain(150), gears: number[] = [];
    let shifts = 0;
    for (let speed = 0; speed <= 44; speed += .02) {
      const before = drivetrain.rpm;
      drivetrain.update(speed, 1, 1 / 60);
      expect(drivetrain.rpm).toBeGreaterThanOrEqual(0);
      expect(drivetrain.rpm).toBeLessThanOrEqual(1);
      if (drivetrain.shifted) {
        shifts++;
        expect(drivetrain.rpm).toBeLessThan(before);
      }
      if (gears.at(-1) !== drivetrain.gear) gears.push(drivetrain.gear as number);
    }
    expect(gears).toEqual([1, 2, 3, 4, 5]);
    expect(shifts).toBe(4);
  });

  it('does not hunt between gears around a change point', () => {
    const drivetrain = new Drivetrain(150);
    run(drivetrain, 7.2, 1);
    expect(drivetrain.gear).toBe(2);
    run(drivetrain, 6.2, .4);
    expect(drivetrain.gear).toBe(2);
    run(drivetrain, 4.2, 0);
    expect(drivetrain.gear).toBe(1);
  });

  it('gives stronger engines longer gears', () => {
    const small = new Drivetrain(110), large = new Drivetrain(440);
    run(small, 7.4, 1);
    run(large, 7.4, 1);
    expect(small.gear).toBe(2);
    expect(large.gear).toBe(1);
  });
});
