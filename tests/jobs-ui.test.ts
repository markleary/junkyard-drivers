import { describe, expect, it } from 'vitest';
import { appraise } from '../src/game/dealer';
import { acceptJob, beginJobLap, recordJobLap } from '../src/game/jobs';
import { newProgress } from '../src/game/progress';
import { install, newGame, paintCar, purchase } from '../src/game/state';
import { dealerMarkup, garageMarkup, jobsMarkup, shopMarkup } from '../src/ui/templates';

function customerBuild() {
  let state = newGame();
  for (const id of ['shell-hachiro', 'part-i4-stock', 'part-street-1', 'part-paint-cream']) state = purchase(state, id);
  state = install(state, 'car-hachiro', 'instance-part-i4-stock');
  state = install(state, 'car-hachiro', 'instance-part-street-1');
  return paintCar(state, 'car-hachiro', 'paint-cream');
}

describe('customer job paperwork', () => {
  it('offers all three starter briefs before a player owns a car and shows future unlocks', () => {
    const html = jobsMarkup(newGame(), newProgress(), '');
    expect(html.match(/data-action="accept-job"/g)).toHaveLength(3);
    expect(html).toContain('Nora &amp; Kit');
    expect(html).toContain('6 jobs delivered');
    expect(html).toContain('After accepting, drive a full test loop');
    expect(html).toContain('NO DEADLINES');
    expect(garageMarkup(newGame(), '', newProgress())).toContain('data-action="jobs"');
  });

  it('shows incomplete road proof at the dealer, then enables delivery for the proven build', () => {
    const state = customerBuild(), car = state.cars[0];
    let progress = acceptJob(newProgress(), 'first-wheels');
    const unproven = dealerMarkup([appraise(state, progress, car, 1)], true, { state, progress });
    expect(unproven).toMatch(/data-action="deliver-job" disabled/);
    expect(unproven).toContain('After accepting, drive a full test loop');
    progress = recordJobLap(state, progress, car.id, 70, beginJobLap(state, progress, car.id));
    const proven = dealerMarkup([appraise(state, progress, car, 1)], true, { state, progress });
    expect(proven).not.toMatch(/data-action="deliver-job" disabled/);
    expect(proven).toContain('Deliver for $4,100');
    expect(proven).toContain('data-action="sell"');
    expect(proven).toContain('fitted tuning parts go to the customer');
  });

  it('keeps an underway job visible without remote car selection or workbench controls while driving', () => {
    const state = customerBuild(), progress = acceptJob(newProgress(), 'first-wheels');
    const html = jobsMarkup(state, progress, 'car-hachiro', { canSelectCar: false, atWorkbench: false });
    expect(html).not.toContain('data-action="job-car"');
    expect(html).not.toContain('data-action="job-garage"');
    expect(html).toContain('Hachiro Kestrel');
    expect(html).toContain('data-action="cancel-job"');
    expect(html).toContain('VISIT THE GARAGE WORKBENCH');
    expect(html).toContain('D-pad: choose');
  });

  it('keeps completed commissions separate from offers and opens newly earned briefs', () => {
    const progress = newProgress();
    progress.jobs.completed = ['first-wheels'];
    const html = jobsMarkup(newGame(), progress, '');
    expect(html).not.toContain('data-job="first-wheels"');
    expect(html).toContain('data-job="weekend-sprite"');
    expect(html).toContain('Signed &amp; delivered');
    expect(html).toContain('Local favorite');
  });

  it('makes the reclaimed tuning shelf accessible from every salvage rack', () => {
    const html = shopMarkup(newGame(), 'yard', 'engine', 150000);
    expect(html).toContain('data-category="tuning"');
    expect(html).toContain('reclaimed tuning parts');
    const tuning = shopMarkup(newGame(), 'yard', 'tuning', 150000);
    expect(tuning).toContain('data-buy="part-turbo-yard"');
    expect(tuning).toContain('data-buy="part-exhaust-touring"');
  });
});
