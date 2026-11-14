import { describe, expect, it } from 'vitest';
import { getShell, type ShellId } from '../src/game/catalog';
import {
  JOBS, acceptJob, activeJob, assessJob, beginJobLap, cancelJob, completeJob, getJob, jobRank,
  reconcileJobs, recordJobLap,
} from '../src/game/jobs';
import { newProgress, parseProgress, recordLap, setStyle, type Progress } from '../src/game/progress';
import { availableFunds, install, newGame, paintCar, parseSave, purchase, type GameState } from '../src/game/state';
import { fitUpgrade } from '../src/game/upgrades';

const buy = (state: GameState, ...ids: string[]) => ids.reduce((next, id) => purchase(next, id), state);
const initial = (completed: string[] = []): Progress => ({ ...newProgress(), jobs: { ...newProgress().jobs, completed } });

function build(shell: ShellId = 'hachiro', engine = 'i4-stock', wheels = 'street-1', paint = 'paint-cream', upgrades: string[] = []) {
  let state = buy(newGame(), `shell-${shell}`, `part-${engine}`, `part-${wheels}`, `part-${paint}`, ...upgrades.map(id => `part-${id}`));
  const carId = `car-${shell}`;
  state = install(install(state, carId, `instance-part-${engine}`), carId, `instance-part-${wheels}`);
  state = paintCar(state, carId, paint);
  let progress = newProgress();
  for (const id of upgrades) progress = fitUpgrade(state, progress, carId, `instance-part-${id}`);
  return { state, progress, carId };
}

const recipe: Record<string, [ShellId, string, string, string, string[]?]> = {
  'first-wheels': ['hachiro', 'i4-economy', 'wheels-classic', 'paint-cream'],
  'sunday-v8': ['bison', 'v8-stock', 'wheels-classic', 'paint-burgundy'],
  'family-estate': ['estate', 'i4-economy', 'wheels-classic', 'paint-cream'],
  'weekend-sprite': ['sprite', 'i4-stock', 'wheels-rally', 'paint-cream'],
  'shop-courier': ['courier', 'v8-torque', 'wheels-classic', 'paint-cream'],
  'quiet-surprise': ['estate', 'i4-performance', 'wheels-rally', 'paint-cream', ['turbo-yard']],
  'rally-return': ['wren', 'rare-i4', 'rare-wheels', 'paint-cream'],
  'working-classic': ['packhorse', 'v8-torque', 'wheels-classic', 'paint-cream', ['exhaust-touring']],
  'exotic-encore': ['veloce', 'v12-performance', 'sport-1', 'paint-silver'],
};

describe('customer briefs and workshop reputation', () => {
  it('opens three choices and unlocks later work through completed commissions', () => {
    const progress = newProgress();
    expect(JOBS.filter(job => job.unlocksAfter === 0)).toHaveLength(3);
    expect(() => acceptJob(progress, 'weekend-sprite')).toThrow(/Complete 1/);
    expect(() => acceptJob(progress, 'missing-job')).toThrow(/no longer/);
    const accepted = acceptJob(initial(['first-wheels']), 'weekend-sprite');
    expect(activeJob(accepted)?.id).toBe('weekend-sprite');
    expect(() => acceptJob(initial(['first-wheels']), 'first-wheels')).toThrow(/already/);
    expect(jobRank(progress)).toBe('New workshop');
    expect(jobRank(initial(['first-wheels']))).toBe('Local favorite');
    expect(jobRank(initial(JOBS.slice(0, 3).map(job => job.id)))).toBe('Trusted restorer');
    expect(jobRank(initial(JOBS.slice(0, 6).map(job => job.id)))).toBe('Restoration specialist');
    expect(jobRank(initial(JOBS.map(job => job.id)))).toBe('Master restorer');
  });

  it('keeps one active request, makes repeated acceptance harmless and cancels without a charge', () => {
    const accepted = acceptJob(newProgress(), 'first-wheels');
    expect(acceptJob(accepted, 'first-wheels')).toBe(accepted);
    expect(() => acceptJob(accepted, 'sunday-v8')).toThrow(/current commission/);
    const cancelled = cancelJob(accepted);
    expect(cancelled.budget).toBe(accepted.budget);
    expect(cancelled.jobs).toEqual({ active: null, completed: [], proof: null, revision: accepted.jobs.revision + 1 });
    expect(cancelJob(cancelled)).toBe(cancelled);
  });

  it.each(JOBS)('has an affordable working recipe and profitable fixed quote for $title', job => {
    const { state, progress: fresh, carId } = build(...recipe[job.id]);
    const completed = JOBS.filter(item => item.id !== job.id).slice(0, job.unlocksAfter).map(item => item.id);
    const progress = acceptJob({ ...fresh, jobs: { ...fresh.jobs, completed } }, job.id);
    const assessment = assessJob(state, progress, state.cars[0], job);
    expect(assessment.unmet).toHaveLength(1);
    expect(assessment.checks.at(-1)?.id).toBe('lap');
    expect(assessment.buildReady).toBe(true);
    expect(assessment.ready).toBe(false);
    expect(job.payout).toBeGreaterThan(job.maxInvestment);
    const proven = recordJobLap(state, progress, carId, job.maxLap ?? 90, beginJobLap(state, progress, carId));
    expect(assessJob(state, proven, state.cars[0], job).ready).toBe(true);
  });

  it('shows every requirement even before a car has been selected', () => {
    const job = getJob('quiet-surprise')!;
    const assessment = assessJob(newGame(), newProgress(), undefined, job);
    expect(assessment.ready).toBe(false);
    expect(assessment.buildReady).toBe(false);
    expect(assessment.checks.map(check => check.id)).toEqual(['shell', 'running', 'budget', 'engine', 'grip', 'with-turbo', 'without-exhaust', 'without-nitro', 'lap']);
    expect(assessment.checks.every(check => !check.done)).toBe(true);
  });

  it('checks the quoted budget, requested model, power, paint, grip and tuning separately', () => {
    const job = getJob('first-wheels')!;
    const { state, progress } = build('sprite', 'crate-i4-performance', 'sport-1', 'paint-saffron', ['turbo-race']);
    const assessment = assessJob(state, progress, state.cars[0], job);
    for (const id of ['shell', 'budget', 'engine', 'paint', 'without-turbo']) expect(assessment.checks.find(check => check.id === id)?.done).toBe(false);
    expect(assessment.checks.find(check => check.id === 'running')?.done).toBe(true);
    const plain = build('estate', 'i4-performance', 'street-1');
    const sleeper = assessJob(plain.state, plain.progress, plain.state.cars[0], getJob('quiet-surprise')!);
    expect(sleeper.checks.find(check => check.id === 'grip')?.done).toBe(false);
    expect(sleeper.checks.find(check => check.id === 'with-turbo')?.done).toBe(false);
  });
});

describe('a fresh road test for the actual commission build', () => {
  it('ignores past dealer lap proof and laps started before acceptance', () => {
    const { state, carId } = build();
    const old = recordLap(newProgress(), 'hachiro', 50).progress;
    expect(beginJobLap(state, old, carId)).toBeNull();
    const progress = acceptJob(old, 'first-wheels');
    expect(recordJobLap(state, progress, carId, 50, null)).toBe(progress);
    expect(assessJob(state, progress, state.cars[0], activeJob(progress)!).ready).toBe(false);
    expect(() => completeJob(state, progress, carId)).toThrow(/full test loop/);
  });

  it('requires a valid matching build at both the start and finish', () => {
    const { state, carId } = build();
    const progress = acceptJob(newProgress(), 'first-wheels');
    const start = beginJobLap(state, progress, carId);
    expect(start).not.toBeNull();
    const bare = purchase(newGame(), 'shell-hachiro');
    expect(beginJobLap(bare, progress, carId)).toBeNull();
    const changed = paintCar(buy(state, 'part-paint-burgundy'), carId, 'paint-burgundy');
    expect(recordJobLap(changed, progress, carId, 65, start)).toBe(progress);
    expect(recordJobLap(state, progress, 'car-bison', 65, start)).toBe(progress);
    for (const seconds of [0, -1, NaN, Infinity, 36001]) expect(recordJobLap(state, progress, carId, seconds, start)).toBe(progress);
  });

  it('does not accept cancelling and reaccepting the same job during a lap', () => {
    const { state, carId } = build();
    const progress = acceptJob(newProgress(), 'first-wheels'), start = beginJobLap(state, progress, carId);
    const reaccepted = acceptJob(cancelJob(progress), 'first-wheels');
    expect(recordJobLap(state, reaccepted, carId, 65, start)).toBe(reaccepted);
    const another = acceptJob(cancelJob(progress), 'sunday-v8');
    expect(recordJobLap(state, another, carId, 65, start)).toBe(another);
  });

  it('retains the quickest matching proof and never rounds an over-limit lap into a pass', () => {
    const { state, progress: fresh, carId } = build(...recipe['weekend-sprite']);
    const progress = acceptJob({ ...fresh, jobs: { ...fresh.jobs, completed: ['first-wheels'] } }, 'weekend-sprite');
    const start = beginJobLap(state, progress, carId), job = activeJob(progress)!;
    const tooSlow = recordJobLap(state, progress, carId, job.maxLap! + .001, start);
    expect(assessJob(state, tooSlow, state.cars[0], job).ready).toBe(false);
    const proven = recordJobLap(state, tooSlow, carId, job.maxLap!, start);
    expect(assessJob(state, proven, state.cars[0], job).ready).toBe(true);
    expect(recordJobLap(state, proven, carId, 100, start)).toBe(proven);
  });

  it('invalidates proof after a parts swap, even if the original parts are later refitted', () => {
    const built = build(), { carId } = built;
    const state = buy(built.state, 'part-i4-economy');
    const accepted = acceptJob(newProgress(), 'first-wheels');
    const proven = recordJobLap(state, accepted, carId, 70, beginJobLap(state, accepted, carId));
    const changed = install(state, carId, 'instance-part-i4-economy');
    expect(assessJob(changed, proven, changed.cars[0], activeJob(proven)!).ready).toBe(false);
    const reconciled = reconcileJobs(changed, proven);
    expect(reconciled.jobs.proof).toBeNull();
    const restored = install(changed, carId, 'instance-part-i4-stock');
    expect(assessJob(restored, reconciled, restored.cars[0], activeJob(reconciled)!).ready).toBe(false);
    expect(reconcileJobs(state, proven)).toBe(proven);
  });

  it('binds proof to wheels, paint, tuning and finish, and clears it when the car is gone', () => {
    const built = build(), { carId } = built;
    const state = buy(built.state, 'part-wheels-classic', 'part-paint-burgundy', 'part-turbo-yard');
    const accepted = acceptJob({ ...newProgress(), finds: ['a', 'b', 'c'] }, 'first-wheels');
    const proven = recordJobLap(state, accepted, carId, 70, beginJobLap(state, accepted, carId));
    expect(reconcileJobs(install(state, carId, 'instance-part-wheels-classic'), proven).jobs.proof).toBeNull();
    expect(reconcileJobs(paintCar(state, carId, 'paint-burgundy'), proven).jobs.proof).toBeNull();
    expect(reconcileJobs(state, fitUpgrade(state, proven, carId, 'instance-part-turbo-yard')).jobs.proof).toBeNull();
    expect(reconcileJobs(state, setStyle(proven, carId, { finish: 'metallic' })).jobs.proof).toBeNull();
    expect(reconcileJobs(newGame(), proven).jobs.proof).toBeNull();
    expect(reconcileJobs(state, newProgress())).toEqual(newProgress());
  });
});

describe('customer handover and saved progress', () => {
  it('pays the fixed quote once, removes the delivered build and preserves spare parts and dealer records', () => {
    const built = build(), { carId } = built;
    const state = buy(built.state, 'part-v8-stock', 'shell-bison');
    const original = { ...newProgress(), sales: { count: 1, takings: 6000, profit: 1000, best: 6000 } };
    const accepted = acceptJob(original, 'first-wheels');
    const proven = recordJobLap(state, accepted, carId, 70, beginJobLap(state, accepted, carId));
    const before = availableFunds(state, proven.budget), delivered = completeJob(state, proven, carId);
    expect(delivered.amount).toBe(getJob('first-wheels')!.payout);
    expect(availableFunds(delivered.state, delivered.progress.budget)).toBe(before + delivered.amount);
    expect(delivered.state.cars.map(car => car.id)).toEqual(['car-bison']);
    expect(delivered.state.inventory.map(item => item.partId)).toEqual(['v8-stock']);
    expect(delivered.state.paints).toEqual(['paint-cream']);
    expect(delivered.progress.sales).toEqual(original.sales);
    expect(delivered.progress.jobs).toMatchObject({ active: null, completed: ['first-wheels'], proof: null });
    expect(delivered.progress.proof.hachiro).toBeUndefined();
    expect(delivered.progress.fitted[carId]).toBeUndefined();
    expect(parseSave(JSON.stringify(delivered.state))).toEqual(delivered.state);
    expect(() => completeJob(delivered.state, delivered.progress, carId)).toThrow(/Accept a customer/);
    expect(() => acceptJob(delivered.progress, 'first-wheels')).toThrow(/already/);
    expect(proven.jobs.completed).toEqual([]);
    expect(state.cars).toHaveLength(2);
  });

  it('restocks rare shells and fitted rare parts using the same rules as an ordinary dealer sale', () => {
    const built = build(...recipe['rally-return']), { state, carId } = built;
    const completed = JOBS.slice(0, 4).map(job => job.id);
    const accepted = acceptJob(initial(completed), 'rally-return');
    const proven = recordJobLap(state, accepted, carId, 70, beginJobLap(state, accepted, carId));
    const delivered = completeJob(state, proven, carId);
    expect(getShell('wren').hidden).toBe(true);
    expect(delivered.restocked.sort()).toEqual(['part-rare-i4', 'part-rare-wheels', 'shell-wren']);
    expect(delivered.progress.restock).toEqual({ 'shell-wren': 1, 'part-rare-i4': 1, 'part-rare-wheels': 1 });
    expect(delivered.state.purchasedListings).toEqual(['part-paint-cream']);
  });

  it('round-trips an active commission and its exact build proof alongside old progress', () => {
    const { state, carId } = build();
    const accepted = acceptJob(newProgress(), 'first-wheels');
    const proven = recordJobLap(state, accepted, carId, 70.123456, beginJobLap(state, accepted, carId));
    const loaded = parseProgress(JSON.stringify(proven));
    expect(loaded).toEqual(proven);
    expect(assessJob(state, loaded, state.cars[0], activeJob(loaded)!).ready).toBe(true);
    expect(parseProgress(JSON.stringify({ version: 1, bestLap: { hachiro: 58 } })).jobs).toEqual(newProgress().jobs);
  });

  it('repairs job fields individually and rejects unknown, completed and locked active requests', () => {
    const parsed = parseProgress(JSON.stringify({ version: 1, laps: 7, jobs: {
      active: 'family-estate', completed: ['first-wheels', 'first-wheels', 'bogus', 12], revision: -1,
      proof: { jobId: 'first-wheels', carId: 'car-hachiro', signature: 'old', seconds: 64 },
    } }));
    expect(parsed.jobs).toEqual({ active: 'family-estate', completed: ['first-wheels'], proof: null, revision: 0 });
    expect(parsed.laps).toBe(7);
    for (const active of ['bogus', 'first-wheels', 'exotic-encore']) {
      expect(parseProgress(JSON.stringify({ version: 1, jobs: { active, completed: ['first-wheels'] } })).jobs.active).toBeNull();
    }
    for (const proof of [null, [], 'fast', { jobId: 'first-wheels', carId: 'car-kart', signature: 'x', seconds: 60 },
      { jobId: 'first-wheels', carId: 'car-hachiro', signature: '', seconds: 60 },
      { jobId: 'first-wheels', carId: 'car-hachiro', signature: 'x', seconds: -1 }]) {
      expect(parseProgress(JSON.stringify({ version: 1, jobs: { active: 'first-wheels', proof } })).jobs.proof).toBeNull();
    }
    expect(parseProgress(JSON.stringify({ version: 1, jobs: 'broken', laps: 3 })).jobs).toEqual(newProgress().jobs);
  });
});
