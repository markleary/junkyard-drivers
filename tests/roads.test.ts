import { describe, expect, it } from 'vitest';
import { AUTO_PARTS_STORE, STORE_LOT, YARD_BOUNDS, distanceToRoad, generateTown, roadIntersectsBox, type Point } from '../src/world/layout';

const key = (p: Point) => `${p.x},${p.z}`;
type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };
const bounds = (box: Point & { w: number; d: number }): Bounds => ({ minX: box.x - box.w / 2, maxX: box.x + box.w / 2, minZ: box.z - box.d / 2, maxZ: box.z + box.d / 2 });
const separated = (a: Bounds, b: Bounds, margin = 0) => a.maxX + margin <= b.minX || a.minX - margin >= b.maxX || a.maxZ + margin <= b.minZ || a.minZ - margin >= b.maxZ;

describe('roads-first town generation', () => {
  it('recreates identical geometry from a saved seed', () => {
    expect(generateTown(1800)).toEqual(generateTown(1800));
    expect(generateTown(1800)).not.toEqual(generateTown(1801));
  });

  it.each([0, 1, 7, 42, 1986, 1993, 234854, 0xffffffff])('connects every street to the garage for seed %s', seed => {
    const town = generateTown(seed);
    const graph = new Map<string, Set<string>>();
    for (const road of town.roads) {
      const a = key(road.a), b = key(road.b);
      if (!graph.has(a)) graph.set(a, new Set());
      if (!graph.has(b)) graph.set(b, new Set());
      graph.get(a)!.add(b); graph.get(b)!.add(a);
      expect(road.a.x === road.b.x || road.a.z === road.b.z).toBe(true);
      expect(road.width).toBeGreaterThanOrEqual(10);
    }
    const seen = new Set<string>(), queue = ['-20,-6'];
    while (queue.length) {
      const current = queue.shift()!;
      if (seen.has(current)) continue;
      seen.add(current);
      queue.push(...(graph.get(current) ?? []));
    }
    expect(seen.size).toBe(graph.size);
    // More edges than a spanning tree proves at least one closed street loop.
    expect(town.roads.length).toBeGreaterThan(graph.size - 1);
    expect([...graph.values()].some(neighbors => neighbors.size >= 3)).toBe(true);
  });

  it.each(Array.from({ length: 50 }, (_, i) => i * 8189))('keeps structures and trees off the road for seed %s', seed => {
    const town = generateTown(seed);
    expect(town.buildings.length).toBeGreaterThan(10);
    for (const building of town.buildings) {
      expect(town.roads.some(road => roadIntersectsBox(road, building, 5))).toBe(false);
      expect(building.x - building.w / 2 < -5 && building.z - building.d / 2 < 34).toBe(false);
    }
    for (const tree of town.trees) expect(town.roads.every(road => distanceToRoad(tree, road) >= road.width / 2 + 6)).toBe(true);
  });

  it.each([0, 1, 7, 42, 1986, 1993, 18000, 234854, 642019, 123456789, 0x80000000, 0xffffffff])('keeps the enlarged yard, parts store and walking approach clear for seed %s', seed => {
    const town = generateTown(seed);
    const store = bounds(STORE_LOT);
    // A 2 m clear pedestrian corridor outside the gate, then into the store.
    const approach: Bounds[] = [
      { minX: -21, maxX: AUTO_PARTS_STORE.x + 1, minZ: 33, maxZ: 35 },
      { minX: AUTO_PARTS_STORE.x - 1, maxX: AUTO_PARTS_STORE.x + 1, minZ: AUTO_PARTS_STORE.z + AUTO_PARTS_STORE.d / 2, maxZ: 35 },
    ];
    for (const building of town.buildings) {
      const footprint = bounds(building);
      expect(separated(footprint, YARD_BOUNDS), `building ${building.x},${building.z} inside salvage yard`).toBe(true);
      expect(separated(footprint, store, 3), `building ${building.x},${building.z} crowds parts store`).toBe(true);
      expect(approach.every(corridor => separated(footprint, corridor)), 'building blocks walk to store').toBe(true);
    }
    for (const tree of town.trees) {
      const footprint = bounds({ ...tree, w: 2, d: 2 });
      expect(separated(footprint, YARD_BOUNDS), `tree ${tree.x},${tree.z} inside salvage yard`).toBe(true);
      expect(separated(footprint, store, 3), `tree ${tree.x},${tree.z} crowds parts store`).toBe(true);
      expect(approach.every(corridor => separated(footprint, corridor)), 'tree blocks walk to store').toBe(true);
    }
  });

  it('marks a continuous loop with a roughly one minute drive at town speed', () => {
    const town = generateTown(1986);
    expect(town.loop[0]).toEqual(town.loop.at(-1));
    let meters = 0;
    for (let i = 0; i < town.loop.length - 1; i++) {
      const a = town.loop[i], b = town.loop[i + 1];
      meters += Math.hypot(b.x - a.x, b.z - a.z);
      for (let t = 0; t <= 1; t += .05) {
        const point = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
        expect(town.roads.some(road => distanceToRoad(point, road) < .001)).toBe(true);
      }
    }
    expect(meters / (35 / 3.6)).toBeGreaterThan(45);
    expect(meters / (35 / 3.6)).toBeLessThan(75);
  });
});
