import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_PAINT } from '../src/game/catalog';
import { createRestorationSurface, type RestorationAppearance } from '../src/render/restoration-surface';
import { installCanvasStandIn } from './support/canvas';

interface DrawRecord {
  pixels: Uint8ClampedArray;
  paths: number[][];
  copies: HTMLCanvasElement[];
}
const records = new Map<HTMLCanvasElement, DrawRecord>();
let restoreCanvas: () => void;

beforeEach(() => {
  restoreCanvas = installCanvasStandIn();
  records.clear();
  const create = document.createElement.bind(document);
  // Record the real pixel buffers and chip paths submitted to canvas. The
  // generic stand-in deliberately ignores these, so material-only checks
  // cannot distinguish a captured colour from a hard-coded factory patina.
  document.createElement = ((tag: string) => {
    const element = create(tag);
    if (tag === 'canvas') {
      const canvas = element as HTMLCanvasElement, context = canvas.getContext('2d')!;
      const draw: DrawRecord = { pixels: new Uint8ClampedArray(), paths: [], copies: [] };
      records.set(canvas, draw);
      context.putImageData = image => { draw.pixels = image.data.slice(); draw.paths = []; };
      context.moveTo = (x, y) => { draw.paths.push([0, x, y]); };
      context.lineTo = (x, y) => { draw.paths.push([1, x, y]); };
      context.clearRect = () => { draw.copies = []; };
      context.drawImage = image => { draw.copies.push(image as HTMLCanvasElement); };
    }
    return element;
  }) as typeof document.createElement;
});
afterEach(() => restoreCanvas());

/** At zero/full work the composited skin copies one complete endpoint. */
function drawn(surface: ReturnType<typeof createRestorationSurface>) {
  const copies = records.get(surface.texture.image as HTMLCanvasElement)!.copies;
  return records.get(copies[copies.length - 1])!;
}

describe('captured restoration colours', () => {
  it.each(['wash', 'complete'] as const)('uses the captured colour in the %s skin and invalidates the cache when it changes', stage => {
    const surface = createRestorationSurface('packhorse', [104, 122, 113]);
    try {
      const appearance = { stage, route: 'patina' as const, work: 0, startingPaint: '#284b86' };
      surface.update(appearance, '#e7ad36');
      const blue = drawn(surface).pixels.slice(0, 4), version = surface.texture.version;
      expect(blue[2] - blue[0]).toBeGreaterThan(70);
      surface.update(appearance, '#e7ad36');
      expect(surface.texture.version).toBe(version);
      surface.update({ ...appearance, startingPaint: '#f0dfad' }, '#e7ad36');
      const cream = drawn(surface).pixels.slice(0, 4);
      expect(surface.texture.version).toBeGreaterThan(version);
      expect(cream[0] - cream[2]).toBeGreaterThan(60);
      expect(cream).not.toEqual(blue);
      // Callers without a captured colour still retain their supplied paint.
      surface.update({ stage, route: 'patina', work: 0 }, '#f0dfad');
      expect(drawn(surface).pixels.slice(0, 4)).toEqual(cream);
    } finally { surface.dispose(); }
  });

  it('keeps aged endpoints fixed when the final colour changes, then sprays the selected new colour', () => {
    const surface = createRestorationSurface('packhorse', [104, 122, 113]);
    try {
      const phases: RestorationAppearance[] = [
        { stage: 'wash', route: 'paint', work: 0 }, { stage: 'rust', route: 'paint', work: 0 },
        { stage: 'repair', route: 'paint', work: 0 }, { stage: 'prime', route: 'paint', work: 0 },
        { stage: 'repair', route: 'patina', work: 0 }, { stage: 'seal', route: 'patina', work: 0 },
        { stage: 'complete', route: 'patina', work: 0 },
      ];
      for (const phase of phases) {
        const appearance = { ...phase, startingPaint: '#f0dfad' };
        surface.update(appearance, '#397d87');
        const before = drawn(surface), pixels = before.pixels.slice(0, 128), paths = before.paths;
        surface.update(appearance, '#bd4432');
        expect(drawn(surface).pixels.slice(0, 128), `${phase.route}/${phase.stage}`).toEqual(pixels);
        expect(drawn(surface).paths, `${phase.route}/${phase.stage} chip positions`).toEqual(paths);
      }
      surface.update({ stage: 'paint', route: 'paint', work: 0, startingPaint: '#f0dfad' }, '#bd4432');
      const primer = drawn(surface).pixels.slice(0, 4);
      expect(primer[0] - primer[2]).toBe(16);
      surface.update({ stage: 'paint', route: 'paint', work: 1, startingPaint: '#f0dfad' }, '#bd4432');
      const painted = drawn(surface).pixels.slice(0, 4);
      expect(painted[0] - painted[1]).toBeGreaterThan(110);
    } finally { surface.dispose(); }
  });

  it('retains the authored default patina and identical chip paths for a custom starting colour', () => {
    const surface = createRestorationSurface('packhorse', [104, 122, 113]);
    try {
      surface.update({ stage: 'wash', route: 'paint', work: 0, startingPaint: DEFAULT_PAINT.packhorse.toUpperCase() }, '#bd4432');
      const original = drawn(surface), pixels = original.pixels.slice(0, 4), paths = original.paths;
      // Grain is identical in each channel, so these differences identify the
      // authored patina RGB rather than the catalog's default paint RGB.
      expect(pixels[1] - pixels[0]).toBe(18);
      expect(pixels[2] - pixels[0]).toBe(9);
      surface.update({ stage: 'wash', route: 'paint', work: 0 }, DEFAULT_PAINT.packhorse);
      expect(drawn(surface).pixels.slice(0, 4)).toEqual(pixels);
      surface.update({ stage: 'wash', route: 'paint', work: 0, startingPaint: '#f0dfad' }, '#bd4432');
      expect(drawn(surface).paths).toEqual(paths);
      expect(drawn(surface).pixels.slice(0, 4)).not.toEqual(pixels);
    } finally { surface.dispose(); }
  });
});
