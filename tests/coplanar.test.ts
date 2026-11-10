import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findCoplanarOverlaps, type Audit, type Face, type Overlap } from '../src/render/coplanar';
import { qualitySettings } from '../src/render/quality';
import { generateTown } from '../src/world/layout';
import { installCanvasStandIn } from './support/canvas';

const square = (x: number, y: number, z: number, w: number, d: number, look: string, extra: Partial<Face> = {}): Face => ({
  normal: [0, 1, 0], corners: [[x - w / 2, y, z - d / 2], [x + w / 2, y, z - d / 2], [x + w / 2, y, z + d / 2], [x - w / 2, y, z + d / 2]],
  look, bias: 0, writesDepth: true, doubleSided: false, owner: -1, label: look, place: '', ...extra,
});

describe('coplanar overlap finder', () => {
  it('reports two different surfaces sharing a plane, with the shared area and where it is', () => {
    const found = findCoplanarOverlaps([square(0, .06, 0, 4, 4, 'concrete'), square(3, .06, 0, 4, 2, 'asphalt')]);
    expect(found).toHaveLength(1);
    expect(found[0].area).toBeCloseTo(2, 6);
    expect(found[0].at[0]).toBeCloseTo(1.5, 6);
    expect(found[0].at[1]).toBeCloseTo(.06, 6);
  });

  it('ignores surfaces that only touch, look the same, sit at different heights or face opposite ways', () => {
    expect(findCoplanarOverlaps([square(0, .06, 0, 4, 4, 'concrete'), square(4, .06, 0, 4, 4, 'asphalt')])).toEqual([]);
    expect(findCoplanarOverlaps([square(0, .06, 0, 4, 4, 'asphalt'), square(3, .06, 0, 4, 4, 'asphalt')])).toEqual([]);
    expect(findCoplanarOverlaps([square(0, .06, 0, 4, 4, 'concrete'), square(3, .063, 0, 4, 4, 'asphalt')])).toEqual([]);
    const underside = square(3, .06, 0, 4, 4, 'asphalt', { normal: [0, -1, 0] });
    expect(findCoplanarOverlaps([square(0, .06, 0, 4, 4, 'concrete'), underside])).toEqual([]);
  });

  it('accepts a painted layer that is pulled toward the viewer, and two decals that only blend', () => {
    expect(findCoplanarOverlaps([square(0, .06, 0, 4, 4, 'asphalt'), square(0, .06, 0, 1, 1, 'paint', { bias: -2 })])).toEqual([]);
    expect(findCoplanarOverlaps([square(0, .06, 0, 2, 2, 'oil', { writesDepth: false }), square(1, .06, 0, 2, 2, 'dust', { writesDepth: false })])).toEqual([]);
    expect(findCoplanarOverlaps([square(0, .06, 0, 4, 4, 'asphalt'), square(0, .06, 0, 2, 2, 'oil', { writesDepth: false })])).toHaveLength(1);
  });

  it('handles turned and upright faces', () => {
    const turned = square(0, .06, 0, 2, 2, 'slab');
    const c = Math.cos(Math.PI / 4), s = Math.sin(Math.PI / 4);
    turned.corners = turned.corners.map(([x, y, z]) => [x * c - z * s, y, x * s + z * c]);
    const found = findCoplanarOverlaps([square(0, .06, 0, 2, 2, 'road'), turned]);
    // A square and the same square turned 45 degrees share a regular octagon.
    expect(found[0].area).toBeCloseTo(8 * (Math.SQRT2 - 1), 6);
    const wall = (z0: number, z1: number, look: string): Face => ({ ...square(0, 0, 0, 1, 1, look), normal: [1, 0, 0], corners: [[5, 0, z0], [5, 3, z0], [5, 3, z1], [5, 0, z1]] });
    expect(findCoplanarOverlaps([wall(0, 4, 'brick'), wall(3, 6, 'plaster')])[0].area).toBeCloseTo(3, 6);
  });
});

/** One line per kind of clash, biggest first, so a failure reads as a short list of things to fix. */
function summarise(overlaps: Overlap[]): string[] {
  const kinds = new Map<string, { count: number; area: number; largest: Overlap }>();
  for (const overlap of overlaps) {
    const facing = overlap.a.normal.map(value => Math.round(value * 10) / 10).join(',');
    const key = `${[overlap.a.label, overlap.b.label].sort().join('  <>  ')}  facing ${facing}`;
    const kind = kinds.get(key);
    if (!kind) kinds.set(key, { count: 1, area: overlap.area, largest: overlap });
    else { kind.count++; kind.area += overlap.area; if (overlap.area > kind.largest.area) kind.largest = overlap; }
  }
  return [...kinds.entries()].sort((a, b) => b[1].area - a[1].area).map(([key, { count, area, largest }]) =>
    `${count} x ${key}: ${area.toFixed(2)} m2 in all; largest ${largest.area.toFixed(2)} m2 near ${largest.at.map(value => value.toFixed(2)).join(', ')} (${largest.a.place} | ${largest.b.place})`);
}

describe('baked scenery', () => {
  let restore: () => void;
  let createWorld: typeof import('../src/render/world').createWorld;
  beforeAll(async () => {
    restore = installCanvasStandIn();
    await RAPIER.init();
    ({ createWorld } = await import('../src/render/world'));
  });
  afterAll(() => restore());

  // Seeds move the streets, the buildings and the three lots, so each one lays the pieces out differently.
  for (const seed of [642019, 1, 77, 20260508, 987654321]) {
    it(`has no two different surfaces drawn in the same plane (seed ${seed})`, () => {
      const audit: Audit = { faces: [], solids: [] };
      createWorld(new THREE.Scene(), new RAPIER.World({ x: 0, y: -9.81, z: 0 }), generateTown(seed), qualitySettings('high'), audit);
      expect(audit.faces.length).toBeGreaterThan(5000);
      expect(summarise(findCoplanarOverlaps(audit.faces, { solids: audit.solids }))).toEqual([]);
    });
  }
});
