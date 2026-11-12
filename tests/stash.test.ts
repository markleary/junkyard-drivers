import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PARTS, SHELLS, getPartsForSale } from '../src/game/catalog';
import { findSpots } from '../src/game/finds';
import { RARE_PARTS, RARE_SHELLS, seedPlacing, stashLayout } from '../src/game/stash';
import { install, newGame, parseSave, purchase } from '../src/game/state';
import { qualitySettings } from '../src/render/quality';
import { YARD_BOUNDS, YARD_SPAWN, generateTown } from '../src/world/layout';
import { KEEP_CLEAR, PART_SOLID, PART_SPOTS, SHELL_SOLID, SHELL_SPOTS, footprintBounds, insideYard, overlaps, yardObstacles, type Bounds } from '../src/world/yard';
import { installCanvasStandIn } from './support/canvas';

const around = (x: number, z: number, r: number): Bounds => ({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r });
const turn = (yaw: number) => ({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });

describe('rare salvage in the catalog', () => {
  it('is never on a rack or a shelf', () => {
    expect(RARE_PARTS.length).toBeGreaterThanOrEqual(4);
    expect(RARE_SHELLS.length).toBeGreaterThanOrEqual(2);
    for (const part of RARE_PARTS) {
      expect(part.rare).toBe(true);
      expect(getPartsForSale('yard').includes(part)).toBe(false);
      expect(getPartsForSale('store').includes(part)).toBe(false);
    }
    // The example that started it: a rare tire is not on the tire rack.
    const tires = PARTS.find(part => part.id === 'rare-wheels')!;
    expect(tires.kind).toBe('wheels');
    expect(getPartsForSale('yard', 'wheels').map(part => part.id)).not.toContain('rare-wheels');
    expect(tires.grip).toBeGreaterThan(Math.max(...[...getPartsForSale('yard', 'wheels'), ...getPartsForSale('store', 'wheels')].map(part => part.grip!)));
  });

  it('beats anything that can be bought off a rack or a shelf, engine for engine', () => {
    for (const mount of ['I4', 'V8', 'V12'] as const) {
      const rare = RARE_PARTS.find(part => part.kind === 'engine' && part.mount === mount)!;
      const ordinary = PARTS.filter(part => part.kind === 'engine' && part.mount === mount && part.source !== 'hidden');
      expect(rare.power, mount).toBeGreaterThan(Math.max(...ordinary.map(part => part.power!)));
    }
  });

  it('can be bought where it lies, built into a car, and saved like anything else', () => {
    let state = newGame();
    for (const id of ['shell-wren', 'part-rare-i4', 'part-rare-wheels', 'shell-packhorse', 'part-rare-v8', 'part-street-1']) state = purchase(state, id);
    state = install(install(state, 'car-wren', 'instance-part-rare-i4'), 'car-wren', 'instance-part-rare-wheels');
    state = install(install(state, 'car-packhorse', 'instance-part-rare-v8'), 'car-packhorse', 'instance-part-street-1');
    expect(() => install(state, 'car-packhorse', 'instance-part-rare-i4')).toThrow(/V8 mount/);
    expect(parseSave(JSON.stringify(state))).toEqual(state);
    expect(SHELLS.filter(shell => shell.hidden).every(shell => shell.rare)).toBe(true);
  });
});

describe('where it is hidden', () => {
  it('has at least two places for every piece', () => {
    expect(PART_SPOTS.length).toBeGreaterThanOrEqual(RARE_PARTS.length * 2);
    expect(SHELL_SPOTS.length).toBeGreaterThanOrEqual(RARE_SHELLS.length * 2);
  });

  it('deals every piece its own place, the same way every time for one seed', () => {
    for (const seed of [1, 2, 642019, 0xfffffffe, 123456789]) {
      const layout = stashLayout(seed);
      expect(layout.map(item => item.listingId).sort()).toEqual([...RARE_PARTS.map(part => `part-${part.id}`), ...RARE_SHELLS.map(shell => `shell-${shell.id}`)].sort());
      expect(stashLayout(seed)).toEqual(layout);
      for (const kind of ['part', 'shell'] as const) {
        const spots = layout.filter(item => item.kind === kind).map(item => item.spot);
        expect(new Set(spots).size, `seed ${seed}`).toBe(spots.length);
      }
      for (const item of layout) {
        const place = (item.kind === 'part' ? PART_SPOTS : SHELL_SPOTS)[item.spot];
        expect([item.x, item.z, item.yaw, item.hint]).toEqual([place.x, place.z, place.yaw, place.hint]);
      }
    }
  });

  it('differs from game to game, and uses every hiding place sooner or later', () => {
    const partPlaces = new Set<number>(), shellPlaces = new Set<number>(), signatures = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      const layout = stashLayout(seed);
      signatures.add(layout.map(item => item.spot).join(','));
      for (const item of layout) (item.kind === 'part' ? partPlaces : shellPlaces).add(item.spot);
    }
    expect(signatures.size).toBeGreaterThan(250);
    expect(partPlaces.size).toBe(PART_SPOTS.length);
    expect(shellPlaces.size).toBe(SHELL_SPOTS.length);
    // Any one piece can be anywhere: the rare tires are found in every part place across games.
    const tires = new Set(Array.from({ length: 400 }, (_, seed) => stashLayout(seed + 1).find(item => item.listingId === 'part-rare-wheels')!.spot));
    expect(tires.size).toBe(PART_SPOTS.length);
  });

  it('moves a piece when it comes back after a sale, and only that piece', () => {
    for (const seed of [5, 642019, 99999]) {
      const first = stashLayout(seed);
      for (const moved of first) {
        const next = stashLayout(seed, { [moved.listingId]: 1 });
        for (const item of next) {
          const before = first.find(other => other.listingId === item.listingId)!;
          if (item.listingId === moved.listingId) expect(item.spot, `${moved.listingId} with seed ${seed}`).not.toBe(before.spot);
          else expect(item.spot).toBe(before.spot);
        }
      }
    }
  });

  it('never puts two pieces in one place, however often each has been sold', () => {
    const ids = stashLayout(1).map(item => item.listingId);
    let state = 7;
    const random = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
    for (let round = 0; round < 400; round++) {
      const restock = Object.fromEntries(ids.map(id => [id, Math.floor(random() * 9)]));
      const layout = stashLayout(Math.floor(random() * 0xffffffff), restock);
      for (const kind of ['part', 'shell'] as const) {
        const spots = layout.filter(item => item.kind === kind).map(item => item.spot);
        expect(new Set(spots).size).toBe(spots.length);
      }
    }
    // Junk in the record is ignored rather than trusted.
    expect(stashLayout(3, { constructor: 4, 'part-nothing': 2 } as unknown as Record<string, number>)).toEqual(stashLayout(3));
  });

  it('finds a seed for any piece in any place, for the browser tests', () => {
    for (const listing of ['part-rare-wheels', 'shell-wren']) for (const spot of [0, 3]) {
      const seed = seedPlacing(listing, spot);
      expect(stashLayout(seed).find(item => item.listingId === listing)!.spot).toBe(spot);
    }
  });
});

describe('the hiding places themselves', () => {
  const obstacles = yardObstacles();
  // Solid things that predate the yard features list and are placed by hand in the scenery.
  const fixtures: Bounds[] = [
    { minX: -29.2, maxX: -10.8, minZ: -24.2, maxZ: -5.8 }, { minX: -38.8, maxX: -36.2, minZ: -.3, maxZ: 16.3 },
    { minX: -40.8, maxX: -30.2, minZ: -11.9, maxZ: -8.5 }, { minX: -43.8, maxX: -42.2, minZ: -29, maxZ: -12.6 },
    footprintBounds({ x: -15, z: 12, w: 1.95, d: 4.5, yaw: -.12 }), footprintBounds({ x: -15, z: 1, w: 1.95, d: 4.6, yaw: -.12 }), footprintBounds({ x: -38, z: -23, w: 1.95, d: 4.5, yaw: .25 }),
  ];
  const footprints = [
    ...PART_SPOTS.map((spot, index) => ({ name: `part place ${index}`, spot, bounds: footprintBounds({ x: spot.x, z: spot.z, w: PART_SOLID.w, d: PART_SOLID.d, yaw: spot.yaw }) })),
    ...SHELL_SPOTS.map((spot, index) => ({ name: `shell place ${index}`, spot, bounds: footprintBounds({ x: spot.x, z: spot.z, w: SHELL_SOLID.w, d: SHELL_SOLID.d, yaw: spot.yaw }) })),
  ];

  it('are inside the fence and clear of every feature, fixture and walking route', () => {
    for (const { name, bounds } of footprints) {
      expect(insideYard(bounds, .2), `${name} crosses the fence`).toBe(true);
      for (const obstacle of obstacles) expect(overlaps(bounds, obstacle.bounds), `${name} overlaps ${obstacle.name}`).toBe(false);
      for (const fixture of fixtures) expect(overlaps(bounds, fixture), `${name} overlaps an established fixture`).toBe(false);
      // A lane is where everybody walks: nothing left in one is hidden.
      for (const [index, lane] of KEEP_CLEAR.entries()) expect(overlaps(bounds, lane), `${name} is in clear zone ${index}`).toBe(false);
    }
  });

  it('are clear of one another and away from the lit columns of the twelve finds', () => {
    for (let i = 0; i < footprints.length; i++) for (let j = i + 1; j < footprints.length; j++) {
      expect(overlaps(footprints[i].bounds, footprints[j].bounds, 1.5), `${footprints[i].name} crowds ${footprints[j].name}`).toBe(false);
    }
    for (const seed of [642019, 1, 31337]) for (const find of findSpots(generateTown(seed))) for (const { name, spot } of footprints) {
      expect(Math.hypot(find.x - spot.x, find.z - spot.z), `${name} is beside the ${find.id} find`).toBeGreaterThan(6);
    }
  });

  it('each have something to say for themselves in the logbook', () => {
    const hints = footprints.map(item => item.spot.hint);
    expect(new Set(hints).size).toBe(hints.length);
    for (const hint of hints) { expect(hint.length).toBeGreaterThan(24); expect(hint.endsWith('.')).toBe(true); }
  });

  describe('in the built yard', () => {
    let restore: () => void;
    let world: RAPIER.World;
    beforeAll(async () => {
      restore = installCanvasStandIn();
      await RAPIER.init();
      const { createWorld } = await import('../src/render/world');
      world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
      createWorld(new THREE.Scene(), world, generateTown(642019), qualitySettings('high'));
      world.step();
    });
    afterAll(() => restore());

    it('stand on open ground: nothing solid occupies any of them', () => {
      for (const [index, spot] of PART_SPOTS.entries()) {
        // The pallet and the part on it, lifted clear of the ground slabs.
        const hit = world.intersectionWithShape({ x: spot.x, y: .62, z: spot.z }, turn(spot.yaw), new RAPIER.Cuboid(PART_SOLID.w / 2 + .1, .42, PART_SOLID.d / 2 + .1));
        expect(hit, `part place ${index} at ${spot.x}, ${spot.z} is inside something solid`).toBeNull();
      }
      for (const [index, spot] of SHELL_SPOTS.entries()) {
        const hit = world.intersectionWithShape({ x: spot.x, y: .92, z: spot.z }, turn(spot.yaw), new RAPIER.Cuboid(SHELL_SOLID.w / 2 + .05, SHELL_SOLID.h / 2 - .1, SHELL_SOLID.d / 2 + .05));
        expect(hit, `shell place ${index} at ${spot.x}, ${spot.z} is inside something solid`).toBeNull();
      }
    });

    it('can all be walked to from the gate, even with every place occupied at once', () => {
      // The worst case: a shell in every shell place and a pallet in every part place.
      for (const spot of SHELL_SPOTS) world.createCollider(RAPIER.ColliderDesc.cuboid(SHELL_SOLID.w / 2, SHELL_SOLID.h / 2, SHELL_SOLID.d / 2).setTranslation(spot.x, .92, spot.z).setRotation(turn(spot.yaw)));
      for (const spot of PART_SPOTS) world.createCollider(RAPIER.ColliderDesc.cuboid(PART_SOLID.w / 2, PART_SOLID.h / 2, PART_SOLID.d / 2).setTranslation(spot.x, PART_SOLID.h / 2 + .06, spot.z).setRotation(turn(spot.yaw)));
      world.step();
      // Flood the yard from the spawn point with a body the walker's size, a little fatter for safety.
      const STEP = .25, walker = new RAPIER.Capsule(.5, .32), upright = { x: 0, y: 0, z: 0, w: 1 };
      const columns = Math.ceil((YARD_BOUNDS.maxX - YARD_BOUNDS.minX) / STEP), rows = Math.ceil((YARD_BOUNDS.maxZ - YARD_BOUNDS.minZ) / STEP);
      const open = new Int8Array(columns * rows).fill(-1), reached = new Uint8Array(columns * rows);
      const free = (column: number, row: number) => {
        if (column < 0 || row < 0 || column >= columns || row >= rows) return false;
        const index = row * columns + column;
        if (open[index] < 0) open[index] = world.intersectionWithShape({ x: YARD_BOUNDS.minX + (column + .5) * STEP, y: 1.02, z: YARD_BOUNDS.minZ + (row + .5) * STEP }, upright, walker) ? 0 : 1;
        return open[index] === 1;
      };
      const cell = (x: number, z: number): [number, number] => [Math.floor((x - YARD_BOUNDS.minX) / STEP), Math.floor((z - YARD_BOUNDS.minZ) / STEP)];
      const queue: [number, number][] = [cell(YARD_SPAWN.x, YARD_SPAWN.z)];
      expect(free(...queue[0])).toBe(true);
      reached[queue[0][1] * columns + queue[0][0]] = 1;
      for (let head = 0; head < queue.length; head++) {
        const [column, row] = queue[head];
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const c = column + dc, r = row + dr;
          if (!free(c, r) || reached[r * columns + c]) continue;
          reached[r * columns + c] = 1;
          queue.push([c, r]);
        }
      }
      expect(queue.length * STEP * STEP).toBeGreaterThan(2500);
      // Close enough to read the tag: the game lets a player interact from 4.8 m.
      const REACH = 3.4;
      const within = (x: number, z: number) => {
        const [c0, r0] = cell(x, z), span = Math.ceil(REACH / STEP);
        for (let dr = -span; dr <= span; dr++) for (let dc = -span; dc <= span; dc++) {
          const c = c0 + dc, r = r0 + dr;
          if (c < 0 || r < 0 || c >= columns || r >= rows || !reached[r * columns + c]) continue;
          if (Math.hypot(YARD_BOUNDS.minX + (c + .5) * STEP - x, YARD_BOUNDS.minZ + (r + .5) * STEP - z) <= REACH) return true;
        }
        return false;
      };
      for (const [index, spot] of PART_SPOTS.entries()) expect(within(spot.x, spot.z), `part place ${index} at ${spot.x}, ${spot.z} cannot be reached on foot`).toBe(true);
      for (const [index, spot] of SHELL_SPOTS.entries()) expect(within(spot.x, spot.z), `shell place ${index} at ${spot.x}, ${spot.z} cannot be reached on foot`).toBe(true);
      // The same flood proves the old fixtures are still reachable: the three display shells and the racks.
      for (const [x, z] of [[-15, 12], [-15, 1], [-38, -23], [-35.8, 2], [-35.8, 8], [-35.8, 14], [-26.4, -15]]) expect(within(x, z), `fixture at ${x}, ${z}`).toBe(true);
      void around;
    });
  });
});
