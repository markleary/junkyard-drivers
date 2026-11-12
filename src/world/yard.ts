import { YARD_BOUNDS } from './layout';

/**
 * Where the large salvage features stand. Plain data, so the routes a player
 * walks and drives can be checked against every solid footprint without a renderer.
 */
export interface Footprint { x: number; z: number; w: number; d: number; yaw: number }
export interface Bounds { minX: number; maxX: number; minZ: number; maxZ: number }
export interface CarStackSpot extends Footprint { count: number }
export interface ContainerSpot extends Footprint { color: number; tier: number }
export interface HeapSpot { x: number; z: number; w: number; d: number; height: number }
export interface DonorSpot extends Footprint { style: number; tint: number; wheels: boolean }

const QUARTER = Math.PI / 2;
const stack = (x: number, z: number, yaw: number, count: number): CarStackSpot => ({ x, z, yaw, count, w: 1.95, d: 4.7 });
const box = (x: number, z: number, yaw: number, color: number, tier = 0): ContainerSpot => ({ x, z, yaw, color, tier, w: 2.44, d: 6.1 });

/** Shells stacked three and four high: the yard's skyline. */
export const CAR_STACKS: CarStackSpot[] = [
  // Along the east fence, facing the driveway.
  stack(-8.3, 25.2, 0, 3), stack(-8.3, 19.8, 0, 4), stack(-8.5, 14.4, 0, 3),
  // The sorted rows between the two back-lot lanes.
  ...[-9.6, -14.9, -20.2, -25.5, -30.2].flatMap((z, i) => [stack(-61.6, z, QUARTER, 3 + (i % 2)), stack(-54.6, z, QUARTER, 4 - (i % 2))]),
  // South-west corner, behind the donor row.
  stack(-83.4, 12.5, 0, 4), stack(-83.4, 18.2, 0, 3), stack(-83.4, 6.6, 0, 2),
  // Beside the far lane.
  stack(-74.6, -40.5, QUARTER, 3), stack(-60.5, -44.6, QUARTER, 2),
];

/** Freight boxes used as parts stores. Tier 1 sits on top of the box beneath it. */
export const CONTAINERS: ContainerSpot[] = [
  box(-8, -2.9, 0, 0x8a4a34),
  box(-78.5, -50.4, QUARTER, 0x3f6f7a), box(-71.9, -50.4, QUARTER, 0x9a5a38), box(-65.3, -50.4, QUARTER, 0x5a6a52),
  box(-58.7, -50.4, QUARTER, 0x8a8f86), box(-52.1, -50.4, QUARTER, 0x7a3a30), box(-45.5, -50.4, QUARTER, 0x3f6f7a),
  box(-75.2, -50.4, QUARTER, 0xb59a52, 1), box(-55.4, -50.4, QUARTER, 0x9a5a38, 1),
  box(-83.4, -38.2, 0, 0x5a6a52), box(-83.4, -31.6, 0, 0x8a4a34),
];

/** Loose mounds of sheet, rail and tire, each with a walkable gap around it. */
export const HEAPS: HeapSpot[] = [
  { x: -77.5, z: -17.5, w: 9, d: 11, height: 3.3 },
  { x: -57, z: 18.5, w: 10, d: 9, height: 2.9 },
  { x: -35, z: -45.5, w: 11, d: 7, height: 2.7 },
  { x: -19, z: -45.5, w: 9, d: 7, height: 3 },
  { x: -76, z: 23.5, w: 8, d: 7, height: 2.5 },
];

/** Complete cars waiting to be stripped, nosed up to the south fence. */
export const DONORS: DonorSpot[] = [
  { x: -51.5, z: 26.7, yaw: Math.PI, style: 0, tint: 0x6f7f84, wheels: true, w: 1.9, d: 4.6 },
  { x: -47.3, z: 26.5, yaw: Math.PI + .06, style: 2, tint: 0x9a3f30, wheels: false, w: 1.9, d: 4.7 },
  { x: -62.2, z: 26.6, yaw: Math.PI - .04, style: 3, tint: 0xb59a52, wheels: true, w: 2, d: 5.3 },
  { x: -66.6, z: 26.4, yaw: Math.PI, style: 5, tint: 0x60705a, wheels: false, w: 1.8, d: 3.9 },
  { x: -70.6, z: 26.6, yaw: Math.PI + .05, style: 1, tint: 0xb7ae98, wheels: true, w: 1.9, d: 4.5 },
  { x: -78.2, z: 4.2, yaw: QUARTER, style: 4, tint: 0x8a8f86, wheels: false, w: 2, d: 5 },
];

/** Gantry crane over the scrap pile, with a shell on the magnet. */
export const CRANE = { x: -66, z: 9.5, span: 13, height: 8.6, legs: [[-6.5, -2.2], [-6.5, 2.2], [6.5, -2.2], [6.5, 2.2]] as [number, number][] };
/** Hydraulic baling press with a row of finished bales beside it. */
export const CRUSHER = { x: -79.5, z: -9.3, w: 4.2, d: 3, yaw: 0 };
export const BALES = { x: -79.3, z: -26.8, columns: 3, rows: 2, layers: 3, w: 1.7, h: .78, d: 2.3 };
/** Site office by the gate. */
export const OFFICE = { x: -34.6, z: 26.6, w: 6.4, d: 3.1, yaw: 0 };
export const FLOODLIGHTS: [number, number, number][] = [[-27.9, 28.4, 2.6], [-12.2, -4.2, -.5], [-44.6, 3.6, 1.2], [-51.2, -39.3, -2.2], [-74.2, 28.9, 2.9], [-84.4, -24, 1.3]];
/** Tire walls behind the parts racks. */
export const TIRE_WALL = { x: -40.9, zFrom: 3.2, zTo: 16.4 };

/**
 * Hiding places for rare salvage: corners no lane passes and that a stack, a heap or a freight box screens from
 * the paths. Which piece lies in which place is decided per game (game/stash.ts). A part rests on a pallet about
 * a metre square; a shell needs room for its whole footprint. `hint` is what the logbook says about the place.
 */
export interface StashSpot { x: number; z: number; yaw: number; hint: string }
/** Solid size of a salvage shell wherever it stands, and of a rare part on its pallet. */
export const SHELL_SOLID = { w: 1.92, h: 1.3, d: 4.5 };
export const PART_SOLID = { w: 1, h: .9, d: 1 };
export const PART_SPOTS: StashSpot[] = [
  { x: -58.1, z: -20.2, yaw: .2, hint: 'Deep in the sorted rows, in the gap between two stacks of shells.' },
  { x: -84, z: -50.2, yaw: 1.1, hint: 'In the far back corner, past the pipe rack.' },
  { x: -84, z: -9.4, yaw: .4, hint: 'Behind the baling press, against the west fence.' },
  { x: -83.7, z: -26.9, yaw: 2.2, hint: 'At the dead end behind the stacked bales.' },
  { x: -6.2, z: 21, yaw: 1.5, hint: 'Behind the stacked shells by the gate, hard against the east fence.' },
  { x: -39.6, z: 9.2, yaw: 1.62, hint: 'Behind the wheel rack, between the shelving and the tire wall.' },
  { x: -60.5, z: -47.4, yaw: .1, hint: 'Along the back fence, between a stack of shells and the freight boxes.' },
  { x: -5.9, z: -2.8, yaw: 1.55, hint: 'Squeezed behind the rust-red freight box beside the workshop apron.' },
  { x: -35.5, z: -50.9, yaw: 2.9, hint: 'Behind the scrap heap at the back fence, on the side nobody walks.' },
  { x: -18.6, z: -51, yaw: .3, hint: 'Behind the second heap along the back fence.' },
  { x: -75.2, z: -45.2, yaw: 2.6, hint: 'Behind the stack beside the far lane, near the pipe rack.' },
  { x: -6.2, z: -25.8, yaw: .9, hint: 'Past the tire stacks at the far end of the alley behind the workshop.' },
];
export const SHELL_SPOTS: (StashSpot & { w: number; d: number })[] = [
  { x: -9.8, z: -46.8, yaw: .35, w: 2, d: 4.7, hint: 'In the far corner beyond the last scrap heap, where the fences meet.' },
  { x: -82.9, z: 25.4, yaw: -.3, w: 2, d: 4.7, hint: 'In the corner by the south fence, behind the stacked shells and the heap.' },
  { x: -56.8, z: 27.2, yaw: QUARTER + .08, w: 2, d: 4.7, hint: 'Against the south fence, behind the big heap, between the donor cars.' },
  { x: -84.55, z: -17.4, yaw: .04, w: 2, d: 4.7, hint: 'Along the west fence, hidden behind the largest scrap heap.' },
];

/** Rectangles that must stay open: every route a player or test walks, plus the driveway. */
export const KEEP_CLEAR: Bounds[] = [
  // Driveway, gate and apron.
  { minX: -26.4, maxX: -13.6, minZ: -6, maxZ: 46 },
  // Parts aisle in front of the three racks.
  { minX: -35.6, maxX: -29, minZ: -5.2, maxZ: 24 },
  // From the aisle to the workshop door, and west to the back-lot lanes.
  { minX: -42.6, maxX: -22, minZ: -5.2, maxZ: -1 },
  // The gap behind the scrap row that leads to the rare find.
  { minX: -42.3, maxX: -40.7, minZ: -23, maxZ: -3 },
  { minX: -41.6, maxX: -36, minZ: -25.4, maxZ: -20.6 },
  // Across the front yard between racks, shells and gate.
  { minX: -34, maxX: -10.5, minZ: 13.4, maxZ: 23.6 },
  // Back-lot lanes.
  { minX: -50.2, maxX: -43.8, minZ: -47, maxZ: -1 },
  { minX: -72.2, maxX: -65.8, minZ: -46, maxZ: -2.4 },
  { minX: -80, maxX: -40, minZ: -5.2, maxZ: 1.2 },
  { minX: -77.5, maxX: -12.5, minZ: -38.2, maxZ: -31.8 },
];

export function footprintBounds(shape: Footprint): Bounds {
  const cos = Math.abs(Math.cos(shape.yaw)), sin = Math.abs(Math.sin(shape.yaw));
  const halfX = (shape.w * cos + shape.d * sin) / 2, halfZ = (shape.w * sin + shape.d * cos) / 2;
  return { minX: shape.x - halfX, maxX: shape.x + halfX, minZ: shape.z - halfZ, maxZ: shape.z + halfZ };
}

export const overlaps = (a: Bounds, b: Bounds, margin = 0) =>
  a.minX < b.maxX + margin && a.maxX > b.minX - margin && a.minZ < b.maxZ + margin && a.maxZ > b.minZ - margin;

/** Every solid feature added to the yard, as axis-aligned bounds. */
export function yardObstacles(): { name: string; bounds: Bounds }[] {
  const list: { name: string; bounds: Bounds }[] = [];
  CAR_STACKS.forEach((item, i) => list.push({ name: `car stack ${i}`, bounds: footprintBounds(item) }));
  CONTAINERS.filter(item => item.tier === 0).forEach((item, i) => list.push({ name: `container ${i}`, bounds: footprintBounds(item) }));
  // A heap's collider is a tapered core; its loose edge is walkable.
  HEAPS.forEach((item, i) => list.push({ name: `heap ${i}`, bounds: footprintBounds({ ...item, w: item.w * .92, d: item.d * .92, yaw: 0 }) }));
  DONORS.forEach((item, i) => list.push({ name: `donor ${i}`, bounds: footprintBounds(item) }));
  CRANE.legs.forEach(([dx, dz], i) => list.push({ name: `crane leg ${i}`, bounds: footprintBounds({ x: CRANE.x + dx, z: CRANE.z + dz, w: .5, d: .5, yaw: 0 }) }));
  list.push({ name: 'crusher', bounds: footprintBounds(CRUSHER) });
  list.push({ name: 'bales', bounds: footprintBounds({ x: BALES.x, z: BALES.z, w: BALES.columns * BALES.w, d: BALES.rows * BALES.d, yaw: 0 }) });
  list.push({ name: 'office', bounds: footprintBounds(OFFICE) });
  FLOODLIGHTS.forEach(([x, z], i) => list.push({ name: `floodlight ${i}`, bounds: footprintBounds({ x, z, w: .7, d: .7, yaw: 0 }) }));
  list.push({ name: 'tire wall', bounds: { minX: TIRE_WALL.x - .55, maxX: TIRE_WALL.x + .55, minZ: TIRE_WALL.zFrom - .5, maxZ: TIRE_WALL.zTo + .5 } });
  return list;
}

export const insideYard = (bounds: Bounds, margin = .3) =>
  bounds.minX >= YARD_BOUNDS.minX + margin && bounds.maxX <= YARD_BOUNDS.maxX - margin && bounds.minZ >= YARD_BOUNDS.minZ + margin && bounds.maxZ <= YARD_BOUNDS.maxZ - margin;
