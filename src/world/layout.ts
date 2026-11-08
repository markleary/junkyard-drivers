export interface Point { x: number; z: number }
export interface Road { id: string; a: Point; b: Point; width: number }
export interface Building extends Point { w: number; d: number; h: number; color: number; style: number }
export interface TownLayout { seed: number; roads: Road[]; buildings: Building[]; trees: Point[]; loop: Point[]; landmark: Point }

export const GARAGE = { x: -20, z: -13 };
export const YARD_SPAWN = { x: -20, z: 26 };
export const YARD_BOUNDS = { minX: -86, maxX: -5, minZ: -53, maxZ: 30 };
/** Hand-placed walk-in store and its clear route from the salvage gate. */
export const AUTO_PARTS_STORE = { x: 12, z: 14, w: 22, d: 20, counter: { x: 12, z: 8 } };
export const STORE_LOT = { x: 12, z: 18, w: 28, d: 38 };

export function overlapsBox(a: { x: number; z: number; w: number; d: number }, b: { x: number; z: number; w: number; d: number }, margin = 0): boolean {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 + margin && Math.abs(a.z - b.z) < (a.d + b.d) / 2 + margin;
}

export function randomFromSeed(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Minimum distance from a point to the centerline of a road. */
export function distanceToRoad(p: Point, road: Road): number {
  const dx = road.b.x - road.a.x;
  const dz = road.b.z - road.a.z;
  const t = Math.max(0, Math.min(1, ((p.x - road.a.x) * dx + (p.z - road.a.z) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(p.x - road.a.x - t * dx, p.z - road.a.z - t * dz);
}

export function roadIntersectsBox(road: Road, box: { x: number; z: number; w: number; d: number }, margin = 0): boolean {
  const minX = Math.min(road.a.x, road.b.x) - road.width / 2 - margin;
  const maxX = Math.max(road.a.x, road.b.x) + road.width / 2 + margin;
  const minZ = Math.min(road.a.z, road.b.z) - road.width / 2 - margin;
  const maxZ = Math.max(road.a.z, road.b.z) + road.width / 2 + margin;
  return box.x + box.w / 2 > minX && box.x - box.w / 2 < maxX && box.z + box.d / 2 > minZ && box.z - box.d / 2 < maxZ;
}

/** Roads are created first. Every junction is an endpoint shared by its connecting edges. */
export function generateTown(seed: number): TownLayout {
  const random = randomFromSeed(seed);
  const east = 143 + Math.floor(random() * 9);
  const north = 143 + Math.floor(random() * 9);
  const middle = 62 + Math.floor(random() * 7);
  const roads: Road[] = [];
  const add = (id: string, ax: number, az: number, bx: number, bz: number, width = 11) => roads.push({ id, a: { x: ax, z: az }, b: { x: bx, z: bz }, width });
  add('garage-driveway', -20, -6, -20, 30, 10);
  add('yard-gate', -20, 30, -20, 44, 10);
  add('foundry-west', -20, 44, middle, 44);
  add('foundry-east', middle, 44, east, 44);
  add('east-avenue', east, 44, east, north);
  add('water-west', -20, north, middle, north);
  add('water-east', middle, north, east, north);
  add('west-avenue', -20, 44, -20, north);
  add('market-street', middle, 44, middle, north);

  const buildings: Building[] = [];
  const colors = [0x9d775f, 0xb2a38e, 0x8a9a91, 0xab7460, 0xb7b3a0, 0x737e81, 0x9a8a74];
  const place = (x: number, z: number, w: number, d: number) => {
    const box = { x: x + (random() - .5) * 3, z: z + (random() - .5) * 3, w: w * (.8 + random() * .2), d: d * (.8 + random() * .2) };
    if (roads.some(road => roadIntersectsBox(road, box, 5))) return;
    if (overlapsBox(box, STORE_LOT, 3)) return;
    if (box.x - box.w / 2 < -5 && box.z - box.d / 2 < 34) return;
    if (buildings.some(b => Math.abs(box.x - b.x) < (box.w + b.w) / 2 + 4 && Math.abs(box.z - b.z) < (box.d + b.d) / 2 + 4)) return;
    buildings.push({ ...box, h: 5 + Math.floor(random() * 3) * 3, color: colors[Math.floor(random() * colors.length)], style: Math.floor(random() * 4) });
  };
  for (let x = 8; x < east - 12; x += 25) {
    place(x, 23, 19, 16);
    place(x, north + 22, 19, 18);
  }
  for (const x of [middle / 2 - 10, middle + (east - middle) / 2]) {
    place(x, 67, 23, 19);
    place(x, north - 23, 23, 19);
  }
  for (let z = 69; z < north - 10; z += 29) {
    place(east + 25, z, 22, 19);
    place(-45, z, 19, 19);
  }
  const trees: Point[] = [];
  for (let i = 0; i < 110; i++) {
    const p = { x: -75 + random() * 275, z: -45 + random() * 250 };
    if (p.x > YARD_BOUNDS.minX - 4 && p.x < 0 && p.z > YARD_BOUNDS.minZ - 4 && p.z < 36) continue;
    if (overlapsBox({ ...p, w: 2, d: 2 }, STORE_LOT, 3)) continue;
    if (roads.some(r => distanceToRoad(p, r) < r.width / 2 + 6)) continue;
    if (buildings.some(b => Math.abs(p.x - b.x) < b.w / 2 + 3 && Math.abs(p.z - b.z) < b.d / 2 + 3)) continue;
    if (Math.hypot(p.x - (east + 26), p.z - (north + 25)) < 12) continue;
    trees.push(p);
  }
  return {
    seed, roads, buildings, trees,
    loop: [{ x: -20, z: 30 }, { x: -20, z: 44 }, { x: east, z: 44 }, { x: east, z: north }, { x: -20, z: north }, { x: -20, z: 44 }, { x: -20, z: 30 }],
    landmark: { x: east + 26, z: north + 25 },
  };
}
