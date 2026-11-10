import { describe, expect, it } from 'vitest';
import { KEEP_CLEAR, footprintBounds, insideYard, overlaps, yardObstacles, type Bounds } from '../src/world/yard';

// Solid features that predate the overhaul and still stand in the same places.
const ESTABLISHED: { name: string; bounds: Bounds }[] = [
  { name: 'workshop', bounds: { minX: -29.2, maxX: -10.8, minZ: -24.2, maxZ: -5.8 } },
  { name: 'parts racks', bounds: { minX: -38.8, maxX: -36.2, minZ: -.3, maxZ: 16.3 } },
  { name: 'scrap row', bounds: { minX: -40.8, maxX: -30.2, minZ: -11.9, maxZ: -8.5 } },
  { name: 'salvage row 03', bounds: { minX: -43.8, maxX: -42.2, minZ: -29, maxZ: -12.6 } },
  { name: 'Kestrel shell', bounds: footprintBounds({ x: -15, z: 12, w: 1.95, d: 4.5, yaw: -.12 }) },
  { name: 'Roadmaster shell', bounds: footprintBounds({ x: -15, z: 1, w: 1.95, d: 4.6, yaw: -.12 }) },
  { name: 'Sirocco shell', bounds: footprintBounds({ x: -38, z: -23, w: 1.95, d: 4.5, yaw: .25 }) },
];

describe('salvage yard layout', () => {
  const obstacles = yardObstacles();

  it('keeps every walking route, lane and the driveway free of new obstacles', () => {
    for (const obstacle of obstacles) for (const [index, lane] of KEEP_CLEAR.entries()) {
      expect(overlaps(obstacle.bounds, lane), `${obstacle.name} blocks clear zone ${index}`).toBe(false);
    }
  });

  it('stands every feature inside the fence', () => {
    for (const obstacle of obstacles) expect(insideYard(obstacle.bounds), `${obstacle.name} crosses the fence`).toBe(true);
  });

  it('does not overlap the workshop, racks, scrap rows or the three shells', () => {
    for (const obstacle of obstacles) for (const fixed of ESTABLISHED) {
      expect(overlaps(obstacle.bounds, fixed.bounds, .25), `${obstacle.name} overlaps ${fixed.name}`).toBe(false);
    }
  });

  it('does not stack one feature inside another', () => {
    for (let i = 0; i < obstacles.length; i++) for (let j = i + 1; j < obstacles.length; j++) {
      expect(overlaps(obstacles[i].bounds, obstacles[j].bounds), `${obstacles[i].name} overlaps ${obstacles[j].name}`).toBe(false);
    }
  });

  it('leaves the routes used by the acceptance walks outside every established obstacle', () => {
    // The clear zones themselves may touch old colliders only where a path slides past a corner.
    const waypoints: [number, number][] = [[-20, 17], [-18.2, 14.1], [-20, -9.5], [-31, -3], [-33, 2], [-33, 8], [-33, 14], [-24, -3], [-24, -13.5], [-22.6, -13], [-41.6, -4], [-41.6, -17], [-40.8, -22], [-31, 16], [-29, 20], [-11, 20], [-33, 20], [-33, 23], [-20, 26]];
    for (const [x, z] of waypoints) {
      const point = { minX: x - .3, maxX: x + .3, minZ: z - .3, maxZ: z + .3 };
      for (const obstacle of obstacles) expect(overlaps(point, obstacle.bounds), `${obstacle.name} covers waypoint ${x},${z}`).toBe(false);
    }
  });
});
