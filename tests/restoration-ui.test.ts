import { describe, expect, it } from 'vitest';
import { SHELLS } from '../src/game/catalog';
import { newProgress } from '../src/game/progress';
import { chooseRestorationRoute, startRestoration, workRestoration } from '../src/game/restoration';
import { newGame, purchase } from '../src/game/state';
import { restorationMarkup, restorationPhotosMarkup } from '../src/ui/restoration';
import { garageMarkup } from '../src/ui/templates';

const project = () => purchase(newGame(), 'shell-estate');

describe('hands-on bodywork paperwork', () => {
  it.each(SHELLS)('offers bodywork on $name and explains the optional starting finish', shell => {
    const state = purchase(newGame(), `shell-${shell.id}`), progress = newProgress();
    expect(garageMarkup(state, `car-${shell.id}`, progress)).toContain('data-action="restoration"');
    const html = restorationMarkup(state, state.cars[0], progress);
    expect(html).toContain('data-action="restoration-start"');
    expect(html).toContain('Start from the as-found bodywork');
    expect(html).not.toContain('id="restoration-work"');
  });

  it('exposes the patina decision at its valid boundary and explains the alternate sequence', () => {
    const state = project(), car = state.cars[0];
    let progress = startRestoration(state, newProgress(), car.id);
    expect(restorationMarkup(state, car, progress)).not.toContain('data-restoration-route');
    progress = workRestoration(state, progress, car.id, 1);
    expect(restorationMarkup(state, car, progress)).toContain('data-restoration-route="patina"');
    progress = chooseRestorationRoute(state, progress, car.id, 'patina');
    const patina = restorationMarkup(state, car, progress);
    expect(patina).toContain('Hold to stabilize rust');
    expect(patina).toContain('<b>Seal</b>');
    expect(patina).not.toContain('<b>Prime</b>');
    progress = workRestoration(state, progress, car.id, .2);
    expect(restorationMarkup(state, car, progress)).not.toContain('data-restoration-route');
  });

  it('always offers the original body colour alongside only owned paint tins', () => {
    const state = project(), car = state.cars[0];
    let progress = startRestoration(state, newProgress(), car.id);
    for (let i = 0; i < 4; i++) progress = workRestoration(state, progress, car.id, 1);
    const unpainted = restorationMarkup(state, car, progress);
    expect(unpainted).toContain('original body colour is ready to spray');
    expect(unpainted).toContain('id="restoration-work"');
    expect(unpainted.match(/data-restoration-paint=/g)).toHaveLength(1);
    expect(unpainted).toContain('data-restoration-paint="original"');
    const stocked = purchase(state, 'part-paint-cream');
    const html = restorationMarkup(stocked, car, progress);
    expect(html.match(/data-restoration-paint=/g)).toHaveLength(2);
    expect(html).toContain('data-restoration-paint="paint-cream"');
  });

  it('replaces the tool with a matched photo pair on completion', () => {
    const state = project(), car = state.cars[0];
    let progress = startRestoration(state, newProgress(), car.id);
    for (let i = 0; i < 5; i++) progress = workRestoration(state, progress, car.id, 1);
    const html = restorationMarkup(state, car, progress);
    expect(html).not.toContain('id="restoration-work"');
    expect(html).toContain('data-action="restoration-photos"');
    const photos = restorationPhotosMarkup(car, progress);
    expect(photos).toContain('id="restoration-before"');
    expect(photos).toContain('id="restoration-after"');
    expect(photos).toContain('data-action="restoration-download"');
  });

  it('keeps garage cosmetics from promising changes that the patina route cannot show', () => {
    const state = purchase(project(), 'part-paint-cream'), car = state.cars[0];
    let progress = startRestoration(state, newProgress(), car.id);
    const painting = garageMarkup(state, car.id, progress);
    expect(painting).toContain('Choose final colour:');
    expect(painting).toContain('Choose the finish and stripes for your final coat.');
    progress = workRestoration(state, progress, car.id, 1);
    progress = chooseRestorationRoute(state, progress, car.id, 'patina');
    const patina = garageMarkup(state, car.id, progress);
    expect(patina).toContain('Patina preserves the old paint and finish.');
    const cosmeticButtons = patina.match(/<button data-(?:paint|finish|stripe)="[^>]+>/g)!;
    expect(cosmeticButtons.length).toBeGreaterThan(0);
    expect(cosmeticButtons.every(button => button.includes('disabled'))).toBe(true);
    progress = chooseRestorationRoute(state, progress, car.id, 'paint');
    const resumedPaint = garageMarkup(state, car.id, progress).match(/<button data-paint="paint-cream"[^>]+>/)![0];
    expect(resumedPaint).not.toContain('disabled');
  });
});
