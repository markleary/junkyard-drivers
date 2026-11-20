import { describe, expect, it } from 'vitest';
import { DEFAULT_PAINT, SHELLS, getShell, type ShellId } from '../src/game/catalog';
import { completeSale } from '../src/game/dealer';
import { acceptJob, activeJob, assessJob, beginJobLap, jobBuildSignature, reconcileJobs, recordJobLap } from '../src/game/jobs';
import { newProgress, parseProgress, setStyle } from '../src/game/progress';
import { chooseRestorationRoute, reconcileRestorations, refinishRestoration, restorationFor, restorationSignature, setOrchardLettering, startRestoration, workRestoration } from '../src/game/restoration';
import { install, newGame, paintCar, parseSave, purchase, restoreOriginalPaint, type GameState } from '../src/game/state';

const carId = 'car-estate';
function project(shellId: ShellId = 'estate'): GameState {
  let state = newGame();
  const engine = `${getShell(shellId).mount.toLowerCase()}-stock`, id = `car-${shellId}`;
  for (const listing of [`shell-${shellId}`, `part-${engine}`, 'part-street-1', 'part-paint-cream']) state = purchase(state, listing);
  state = install(install(state, id, `instance-part-${engine}`), id, 'instance-part-street-1');
  return paintCar(state, id, 'paint-cream');
}

const record = (progress: ReturnType<typeof newProgress>) => restorationFor(progress, carId)!;

describe('hands-on restoration', () => {
  it('saves a reversible orchard lettering choice on the finished photo and repairs older saves as clean doors', () => {
    const state = project('orchard'), id = 'car-orchard';
    let clean = startRestoration(state, newProgress(), id);
    for (let i = 0; i < 5; i++) clean = workRestoration(state, clean, id, 1);
    const { before, after } = clean.restorations[id];
    for (const legacy of [undefined, 'true', 1]) {
      const saved = { ...clean, restorations: { [id]: { ...clean.restorations[id], after: { ...after, orchardLettering: legacy } } } };
      expect(parseProgress(JSON.stringify(saved)).restorations[id]).toEqual(clean.restorations[id]);
    }
    const lettered = setOrchardLettering(state, clean, id, true);
    expect(lettered.restorations[id].before).toBe(before);
    expect(lettered.restorations[id].after).toEqual({ ...after, orchardLettering: true });
    expect(restorationSignature(lettered, id)).not.toBe(restorationSignature(clean, id));
    const reloaded = parseProgress(JSON.stringify(lettered));
    expect(reloaded).toEqual(lettered);
    expect(setOrchardLettering(state, reloaded, id, true)).toBe(reloaded);
    expect(setOrchardLettering(state, reloaded, id, false)).toEqual(clean);
  });

  it('offers replacement lettering only on a completed Bell Orchard repaint', () => {
    const state = purchase(project('orchard'), 'shell-courier');
    let progress = startRestoration(state, newProgress(), 'car-orchard');
    expect(() => setOrchardLettering(state, progress, 'car-orchard', true)).toThrow(/Finish painting/);
    progress = workRestoration(state, progress, 'car-orchard', 1);
    progress = chooseRestorationRoute(state, progress, 'car-orchard', 'patina').progress;
    for (let i = 0; i < 3; i++) progress = workRestoration(state, progress, 'car-orchard', 1);
    expect(() => setOrchardLettering(state, progress, 'car-orchard', false)).toThrow(/Finish painting/);
    progress = startRestoration(state, progress, 'car-courier');
    for (let i = 0; i < 5; i++) progress = workRestoration(state, progress, 'car-courier', 1);
    expect(() => setOrchardLettering(state, progress, 'car-courier', true)).toThrow(/Bell Orchard/);
  });

  it('requires an owned catalog car and leaves the frozen purchase save unchanged', () => {
    const state = project(), fresh = newProgress();
    expect(restorationFor(fresh, carId)).toBeUndefined();
    const progress = startRestoration(state, fresh, carId);
    expect(record(progress)).toMatchObject({ stage: 'wash', route: 'paint', work: 0, after: null, before: {
      shellId: 'estate', paint: state.cars[0].paint, enginePartId: 'i4-stock', wheels: true, restored: false,
    } });
    expect(startRestoration(state, progress, carId)).toBe(progress);
    expect(fresh.restorations).toEqual({});
    expect(parseSave(JSON.stringify(state))).toEqual(state);
    expect(() => startRestoration(state, fresh, 'car-courier')).toThrow(/owned car/);
    const unknown = { ...state, cars: [{ ...state.cars[0], id: 'car-unknown', shellId: 'unknown' as ShellId }] };
    expect(() => startRestoration(unknown, fresh, 'car-unknown')).toThrow(/owned car/);
    const alias = { ...state, cars: [{ ...state.cars[0], id: 'car-alias' }] };
    expect(() => startRestoration(alias, fresh, 'car-alias')).toThrow(/owned car/);
  });

  describe.each(SHELLS)('$name', shell => {
    it.each(['paint', 'patina'] as const)('supports the %s route, saved photos and a fresh replacement', route => {
      const state = project(shell.id), id = `car-${shell.id}`, originalSave = JSON.stringify(state);
      let progress = startRestoration(state, newProgress(), id);
      progress = parseProgress(JSON.stringify(workRestoration(state, progress, id, .4)));
      const before = restorationFor(progress, id)!.before;
      expect(restorationFor(progress, id)).toMatchObject({ stage: 'wash', work: .4, before: {
        shellId: shell.id, enginePartId: `${shell.mount.toLowerCase()}-stock`, wheels: true, restored: false,
      } });
      progress = workRestoration(state, progress, id, .6);
      progress = chooseRestorationRoute(state, progress, id, route).progress;
      for (const stage of route === 'paint' ? ['repair', 'prime', 'paint', 'complete'] : ['repair', 'seal', 'complete']) {
        progress = parseProgress(JSON.stringify(workRestoration(state, progress, id, 1)));
        expect(restorationFor(progress, id)).toMatchObject({ route, stage, work: 0, before });
      }
      expect(restorationFor(progress, id)!.after).toEqual({ ...before, restored: route === 'paint' });
      expect(reconcileRestorations(state, progress)).toBe(progress);
      expect(JSON.stringify(state)).toBe(originalSave);
      expect(parseSave(originalSave)).toEqual(state);

      const sale = completeSale(state, progress, id, 4);
      expect(restorationFor(parseProgress(JSON.stringify(sale.progress)), id)).toBeUndefined();
      const replacement = purchase(sale.state, `shell-${shell.id}`, sale.progress.budget);
      const fresh = startRestoration(replacement, sale.progress, id);
      expect(restorationFor(fresh, id)).toMatchObject({ stage: 'wash', route: 'paint', work: 0, after: null, before: {
        shellId: shell.id, enginePartId: null, wheels: false,
      } });
    });

    it('discards a planned paint colour when preserving patina, including the saved finished photo', () => {
      const id = `car-${shell.id}`, painted = project(shell.id);
      for (const initial of [painted, restoreOriginalPaint(painted, id)]) {
        let state = purchase(initial, 'part-paint-saffron');
        let progress = startRestoration(state, newProgress(), id);
        const before = restorationFor(progress, id)!.before, startingPaint = initial.cars[0].paint;
        progress = workRestoration(state, progress, id, 1);
        const planned = paintCar(state, id, 'paint-saffron');
        const priorProgress = progress;
        ({ state, progress } = chooseRestorationRoute(planned, progress, id, 'patina'));
        expect(state.cars[0].paint).toBe(startingPaint);
        expect(planned.cars[0].paint).toBe('#e7ad36');
        expect(state.paints).toEqual(planned.paints);
        expect(state.inventory).toBe(planned.inventory);
        expect(restorationFor(priorProgress, id)!.route).toBe('paint');
        expect(restorationFor(progress, id)!.before).toBe(before);
        expect(chooseRestorationRoute(state, progress, id, 'patina')).toEqual({ state, progress });

        ({ state, progress } = chooseRestorationRoute(state, progress, id, 'paint'));
        expect(state.cars[0].paint).toBe(startingPaint);
        ({ state, progress } = chooseRestorationRoute(paintCar(state, id, 'paint-saffron'), progress, id, 'patina'));
        state = parseSave(JSON.stringify(state))!;
        progress = parseProgress(JSON.stringify(progress));
        expect(state.cars[0].paint).toBe(startingPaint);
        for (const stage of ['repair', 'seal', 'complete']) {
          progress = workRestoration(state, progress, id, 1);
          expect(restorationFor(progress, id)!.stage).toBe(stage);
        }
        expect(restorationFor(progress, id)!.after).toEqual({ ...before, paint: startingPaint, restored: false });
        expect(parseProgress(JSON.stringify(progress))).toEqual(progress);
      }
    });
  });

  it('keeps pre-expansion records when new catalog cars share the same progress save', () => {
    let state = newGame(), progress = newProgress();
    for (const shell of ['estate', 'sprite', 'courier', 'hachiro'] as const) {
      state = purchase(state, `shell-${shell}`);
      const id = `car-${shell}`;
      progress = startRestoration(state, progress, id);
      progress = workRestoration(state, progress, id, .3);
    }
    const restored = parseProgress(JSON.stringify(progress));
    expect(restored.restorations).toEqual(progress.restorations);
    expect(reconcileRestorations(state, restored)).toBe(restored);
  });

  it('cannot copy an unsupported snapshot colour into the frozen collection save when preserving patina', () => {
    const state = project();
    const progress = workRestoration(state, startRestoration(state, newProgress(), carId), carId, 1);
    for (const paint of ['#123456', '#397d87', '#F0DFAD']) {
      const damaged = parseProgress(JSON.stringify({ ...progress, restorations: { [carId]: {
        ...record(progress), before: { ...record(progress).before, paint },
      } } }));
      const preserved = chooseRestorationRoute(state, damaged, carId, 'patina');
      expect(preserved.state.cars[0].paint).toBe(DEFAULT_PAINT.estate);
      expect(parseSave(JSON.stringify(preserved.state))).toEqual(preserved.state);
      let finished = preserved.progress;
      for (let i = 0; i < 3; i++) finished = workRestoration(preserved.state, finished, carId, 1);
      expect(record(finished).after?.paint).toBe(DEFAULT_PAINT.estate);
    }
  });

  it('makes five short operations, resumes partial work, and never spills work into the next stage', () => {
    const state = project();
    let progress = startRestoration(state, newProgress(), carId);
    progress = workRestoration(state, progress, carId, .4);
    progress = parseProgress(JSON.stringify(progress));
    expect(record(progress)).toMatchObject({ stage: 'wash', work: .4 });
    for (const invalid of [0, -.1, NaN, Infinity]) expect(workRestoration(state, progress, carId, invalid)).toBe(progress);
    progress = workRestoration(state, progress, carId, 100);
    expect(record(progress)).toMatchObject({ stage: 'rust', work: 0 });
    for (const next of ['repair', 'prime', 'paint', 'complete']) {
      progress = workRestoration(state, progress, carId, 1);
      expect(record(progress)).toMatchObject({ stage: next, work: 0 });
    }
    expect(record(progress).after).toMatchObject({ shellId: 'estate', restored: true, paint: state.cars[0].paint });
    expect(workRestoration(state, progress, carId, 1)).toBe(progress);
    expect(parseProgress(JSON.stringify(progress))).toEqual(progress);
  });

  it('preserves patina through rust treatment, panel repair and sealing, with no primer or paint', () => {
    const state = project();
    let progress = startRestoration(state, newProgress(), carId);
    expect(() => chooseRestorationRoute(state, progress, carId, 'patina')).toThrow(/after washing/);
    progress = workRestoration(state, progress, carId, 1);
    progress = chooseRestorationRoute(state, progress, carId, 'patina').progress;
    const unchanged = chooseRestorationRoute(state, progress, carId, 'patina');
    expect(unchanged.state).toBe(state);
    expect(unchanged.progress).toBe(progress);
    progress = workRestoration(state, progress, carId, .1);
    expect(() => chooseRestorationRoute(state, progress, carId, 'paint')).toThrow(/before treating/);
    for (const next of ['repair', 'seal', 'complete']) {
      progress = workRestoration(state, progress, carId, 1);
      expect(record(progress).stage).toBe(next);
    }
    expect(record(progress).after?.restored).toBe(false);
    expect(parseProgress(JSON.stringify(progress))).toEqual(progress);
  });

  it.each(['rust', 'repair', 'seal', 'complete'] as const)('can refinish patina from %s without skipping unfinished preparation or replacing the before photo', stage => {
    const state = purchase(project(), 'shell-hachiro'), originalSave = JSON.stringify(state);
    let progress = startRestoration(state, newProgress(), carId);
    progress = workRestoration(state, progress, carId, 1);
    progress = chooseRestorationRoute(state, progress, carId, 'patina').progress;
    while (record(progress).stage !== stage) progress = workRestoration(state, progress, carId, 1);
    if (stage !== 'complete') progress = workRestoration(state, progress, carId, .4);
    const previous = record(progress), originalBefore = previous.before;

    const refinishing = refinishRestoration(state, progress, carId);
    expect(record(refinishing)).toMatchObject({ route: 'paint', stage: stage === 'rust' || stage === 'repair' ? stage : 'prime', work: 0, after: null });
    expect(record(refinishing).before).toBe(originalBefore);
    expect(record(progress)).toBe(previous);
    expect(previous.route).toBe('patina');
    expect(previous.work).toBe(stage === 'complete' ? 0 : .4);
    expect(previous.after !== null).toBe(stage === 'complete');
    expect(JSON.stringify(state)).toBe(originalSave);
    expect(parseSave(originalSave)).toEqual(state);
    expect(parseProgress(JSON.stringify(refinishing))).toEqual(refinishing);
    expect(refinishRestoration(state, refinishing, carId)).toBe(refinishing);
  });

  it('requires an owned started project and leaves a fresh-paint project unchanged', () => {
    const state = project(), progress = startRestoration(state, newProgress(), carId);
    expect(() => refinishRestoration(newGame(), progress, carId)).toThrow(/owned car/);
    expect(() => refinishRestoration(state, newProgress(), carId)).toThrow(/Start bodywork/);
    expect(refinishRestoration(state, progress, carId)).toBe(progress);
    let finished = progress;
    for (let i = 0; i < 5; i++) finished = workRestoration(state, finished, carId, 1);
    expect(refinishRestoration(state, finished, carId)).toBe(finished);
  });

  it('invalidates a completed patina project road test when its owner begins a fresh finish', () => {
    const id = 'car-sprite';
    const state = install(purchase(project('sprite'), 'part-wheels-rally'), id, 'instance-part-wheels-rally');
    let progress = newProgress();
    progress = acceptJob({ ...progress, jobs: { ...progress.jobs, completed: ['first-wheels'] } }, 'weekend-sprite');
    progress = startRestoration(state, progress, id);
    progress = workRestoration(state, progress, id, 1);
    progress = chooseRestorationRoute(state, progress, id, 'patina').progress;
    for (let i = 0; i < 3; i++) progress = workRestoration(state, progress, id, 1);
    const job = activeJob(progress)!, oldLap = beginJobLap(state, progress, id);
    progress = recordJobLap(state, progress, id, 70, oldLap);
    expect(assessJob(state, progress, state.cars[0], job).ready).toBe(true);
    const refinishing = refinishRestoration(state, progress, id);
    expect(refinishing.jobs.proof).toBeNull();
    expect(recordJobLap(state, refinishing, id, 70, oldLap).jobs.proof).toBeNull();
    expect(progress.jobs.proof).not.toBeNull();
  });

  it('freezes the before and after builds so later styling and parts cannot rewrite the photos', () => {
    const state = project();
    let progress = startRestoration(state, newProgress(), carId);
    const before = JSON.stringify(record(progress).before);
    for (let i = 0; i < 5; i++) progress = workRestoration(state, progress, carId, 1);
    const after = JSON.stringify(record(progress).after);
    progress = setStyle({ ...progress, finds: ['a', 'b', 'c', 'd', 'e', 'f'] }, carId, { finish: 'matte' });
    const changed = purchase(state, 'part-paint-saffron');
    const repainted = paintCar(changed, carId, 'paint-saffron');
    progress = reconcileRestorations(repainted, progress);
    expect(JSON.stringify(record(progress).before)).toBe(before);
    expect(JSON.stringify(record(progress).after)).toBe(after);
    expect(record(progress).after?.finish).toBe('gloss');
  });

  it('clears bodywork on sale and reconciliation, so a replacement does not inherit the finished record', () => {
    const state = project();
    const progress = startRestoration(state, newProgress(), carId);
    expect(reconcileRestorations(state, progress)).toBe(progress);
    expect(reconcileRestorations(newGame(), progress).restorations).toEqual({});
    const sale = completeSale(state, progress, carId, 4);
    expect(sale.progress.restorations).toEqual({});
    const replacement = purchase(sale.state, 'shell-estate', sale.progress.budget);
    expect(record(startRestoration(replacement, sale.progress, carId))).toMatchObject({ stage: 'wash', work: 0, after: null });
    expect(record(progress).stage).toBe('wash');
  });

  it('repairs damaged bodywork and snapshots independently without affecting other progress', () => {
    const state = project();
    const good = record(startRestoration(state, newProgress(), carId));
    const parsed = parseProgress(JSON.stringify({ version: 1, laps: 7, restorations: {
      [carId]: { ...good, stage: 'nonsense', work: 44, before: { ...good.before, finish: 'chrome', stripe: 'flames', enginePartId: 'rocket', tuning: ['turbo', 'turbo', 'bogus'] } },
      'car-sprite': { ...good, before: { ...good.before, shellId: 'sprite', paint: '<img>' } },
      'car-unknown': { ...good, before: { ...good.before, shellId: 'unknown' } },
      'car-bison': { ...good },
      constructor: { ...good },
    } }));
    expect(parsed.laps).toBe(7);
    expect(Object.keys(parsed.restorations)).toEqual([carId]);
    expect(record(parsed)).toMatchObject({ stage: 'wash', work: 0, before: { finish: 'gloss', stripe: 'none', enginePartId: null, tuning: ['turbo'] } });
    expect(Object.getPrototypeOf(parsed.restorations)).toBe(Object.prototype);
    const missingPhoto = parseProgress(JSON.stringify({ version: 1, restorations: { [carId]: { ...good, stage: 'complete', after: null } } }));
    expect(record(missingPhoto)).toMatchObject({ stage: 'paint', after: null, work: 0 });
    expect(parseProgress(JSON.stringify({ version: 1, restorations: ['bad'] })).restorations).toEqual({});
    const wrongRoute = parseProgress(JSON.stringify({ version: 1, restorations: { [carId]: { ...good, route: 'patina', stage: 'prime' } } }));
    expect(record(wrongRoute).stage).toBe('seal');
  });

  it('invalidates old road-test proof and requires actual visible paint for a paint-specific customer', () => {
    const state = project();
    let progress = acceptJob(newProgress(), 'family-estate');
    const job = activeJob(progress)!;
    const oldSignature = jobBuildSignature(state, progress, state.cars[0]);
    const start = beginJobLap(state, progress, carId);
    progress = recordJobLap(state, progress, carId, 70, start);
    expect(assessJob(state, progress, state.cars[0], job).ready).toBe(true);
    progress = startRestoration(state, progress, carId);
    expect(progress.jobs.proof).toBeNull();
    expect(jobBuildSignature(state, progress, state.cars[0])).not.toBe(oldSignature);
    expect(recordJobLap(state, progress, carId, 70, start).jobs.proof).toBeNull();
    expect(assessJob(state, progress, state.cars[0], job).checks.find(check => check.id === 'paint')?.done).toBe(false);
    for (let i = 0; i < 5; i++) progress = workRestoration(state, progress, carId, 1);
    expect(assessJob(state, progress, state.cars[0], job).buildReady).toBe(true);
    progress = recordJobLap(state, progress, carId, 70, beginJobLap(state, progress, carId));
    expect(assessJob(state, progress, state.cars[0], job).ready).toBe(true);
    const changed = { ...progress, restorations: { [carId]: { ...record(progress), route: 'patina' as const } } };
    expect(reconcileJobs(state, changed).jobs.proof).toBeNull();
    expect(assessJob(state, changed, state.cars[0], job).checks.find(check => check.id === 'paint')?.done).toBe(false);
  });
});
