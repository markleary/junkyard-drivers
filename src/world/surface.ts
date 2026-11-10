import { AUTO_PARTS_STORE, YARD_BOUNDS, distanceToRoad, type TownLayout } from './layout';

/** What is underfoot or under the tires at a point. Drives footsteps, tire noise and dust. */
export type GroundKind = 'asphalt' | 'gravel' | 'concrete' | 'grass';

export function surfaceAt(layout: TownLayout, x: number, z: number): GroundKind {
  // Workshop floor and its apron.
  if (x > -29 && x < -11 && z > -24 && z < -1) return z < -6 || Math.abs(x + 20) < 7 ? 'concrete' : 'gravel';
  const store = AUTO_PARTS_STORE;
  if (Math.abs(x - store.x) < store.w / 2 && Math.abs(z - store.z) < store.d / 2) return 'concrete';
  for (const road of layout.roads) if (distanceToRoad({ x, z }, road) < road.width / 2) return 'asphalt';
  if (x > -1 && x < 25 && z > 24 && z < 34) return 'asphalt';
  if (x > -18 && x < 12 && z > 32.3 && z < 35.7) return 'concrete';
  for (const lot of layout.lots) {
    if (Math.abs(x - lot.x) < lot.w / 2 && Math.abs(z - lot.z) < lot.d / 2) return lot.kind === 'fuel' ? 'asphalt' : lot.kind === 'usedCars' ? 'gravel' : 'grass';
  }
  if (x > YARD_BOUNDS.minX && x < YARD_BOUNDS.maxX && z > YARD_BOUNDS.minZ && z < YARD_BOUNDS.maxZ) return 'gravel';
  // Pavement slabs run beside every street.
  for (const road of layout.roads) {
    if (road.id.includes('garage') || road.id.includes('gate')) continue;
    if (distanceToRoad({ x, z }, road) < road.width / 2 + 3.2) return 'concrete';
  }
  return 'grass';
}
