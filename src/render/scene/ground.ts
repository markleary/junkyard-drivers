import * as THREE from 'three';
import { flat, puddle } from '../materials';
import { surface } from '../surfaces';
import { createGroundMark, createPuddleMask, type Vegetation } from '../vegetation';
import { YARD_BOUNDS, distanceToRoad, type Point, type Road } from '../../world/layout';
import { C, lightPool, type SceneContext } from './kit';

export interface GroundMarks { oil: THREE.Material; dust: THREE.Material; tracks: THREE.Material; crack: THREE.Material; leaves: THREE.Material; skid: THREE.Material }

const isService = (road: Road) => road.id.includes('garage') || road.id.includes('gate');

/** Flat ground, streets, kerbs and the wear that makes them look used. Physics here is unchanged from the first build. */
export function buildGround(ctx: SceneContext, plants: Vegetation): GroundMarks {
  const { b, layout, rng } = ctx;
  const asphalt = surface('asphalt'), concrete = surface('concrete'), grass = surface('grass');
  const marks: GroundMarks = {
    oil: createGroundMark('oil'), dust: createGroundMark('dust'), tracks: createGroundMark('tracks'),
    crack: createGroundMark('crack'), leaves: createGroundMark('leaves'), skid: createGroundMark('skid'),
  };
  puddle.alphaMap = createPuddleMask();
  puddle.needsUpdate = true;

  // One continuous collider under everything keeps the whole map drivable.
  b.box(grass, 55, -.45, 70, 330, .9, 320, { color: C.grass, collide: true, global: true, cast: false });
  // Drier, paler ground between the yard and the first street reads as worn verge.
  b.box(surface('grass', 'overlay'), 30, .006, 37.4, 110, .012, 2.6, { color: C.grassDry, cast: false });

  const yardW = YARD_BOUNDS.maxX - YARD_BOUNDS.minX, yardD = YARD_BOUNDS.maxZ - YARD_BOUNDS.minZ;
  b.box(surface('gravel'), (YARD_BOUNDS.minX + YARD_BOUNDS.maxX) / 2, .005, (YARD_BOUNDS.minZ + YARD_BOUNDS.maxZ) / 2, yardW, .03, yardD, { color: C.gravel, cast: false, global: true });
  // Compacted lanes link the rack aisle to the back lot.
  const lane = surface('dirt', 'overlay');
  for (const [x, z, w, d] of [[-60, -2, 40, 7], [-47, -24, 7, 46], [-69, -24, 7, 44], [-45, -35, 65, 7]]) b.box(lane, x, .023, z, w, .004, d, { color: C.dirt, cast: false });
  b.box(concrete, -20, .02, -15, 18, .08, 18, { color: 0xa9a59a, collide: true, cast: false });
  // Apron in front of the door, poured later than the floor and a shade paler.
  b.box(surface('concrete', 'overlay'), -20, .058, -3.4, 14, .012, 5, { color: 0xb5b1a4, cast: false });

  const junctions = new Map<string, { point: Point; roads: Road[] }>();
  for (const road of layout.roads) for (const point of [road.a, road.b]) {
    const key = `${point.x},${point.z}`;
    if (!junctions.has(key)) junctions.set(key, { point, roads: [] });
    junctions.get(key)!.roads.push(road);
  }

  for (const road of layout.roads) {
    const horizontal = road.a.z === road.b.z;
    const length = Math.hypot(road.b.x - road.a.x, road.b.z - road.a.z);
    const cx = (road.a.x + road.b.x) / 2, cz = (road.a.z + road.b.z) / 2;
    const along = (t: number, side = 0): [number, number] => {
      const x = road.a.x + (road.b.x - road.a.x) * t, z = road.a.z + (road.b.z - road.a.z) * t;
      return horizontal ? [x, z + side] : [x + side, z];
    };
    b.box(asphalt, cx, .026, cz, horizontal ? length + road.width : road.width, .052, horizontal ? road.width : length + road.width,
      { color: isService(road) ? C.asphaltWorn : C.asphalt, collide: true, cast: false, global: true });
    if (isService(road)) continue;

    // Individual slabs leave each junction and lot driveway unobstructed.
    for (let offset = 6; offset < length - 5; offset += 4) {
      const [x, z] = along(offset / length);
      for (const side of [-1, 1]) {
        const px = horizontal ? x : x + side * (road.width / 2 + 1.65);
        const pz = horizontal ? z + side * (road.width / 2 + 1.65) : z;
        if (layout.roads.some(other => other !== road && distanceToRoad({ x: px, z: pz }, other) < other.width / 2 + 2.5)) continue;
        const driveway = layout.lots.some(lot => lot.driveways.some(d => Math.hypot(d.x - px, d.z - pz) < 3.6));
        const shade = .96 + rng() * .08;
        const tint = new THREE.Color(0xb1ada1).multiplyScalar(shade).getHex();
        if (driveway) {
          // Dropped kerb: a flush ramp the car can cross without a jolt.
          b.box(concrete, px, .03, pz, horizontal ? 4 : 3.3, .06, horizontal ? 3.3 : 4, { color: 0x9f9b90, collide: true, cast: false });
          continue;
        }
        b.box(concrete, px, .08, pz, horizontal ? 3.95 : 3, .16, horizontal ? 3 : 3.95, { color: tint, collide: true, cast: false });
        b.box(concrete, horizontal ? x : x + side * (road.width / 2 + .12), .12, horizontal ? z + side * (road.width / 2 + .12) : z,
          horizontal ? 3.95 : .24, .24, horizontal ? .24 : 3.95, { color: 0xbab6aa, collide: true, cast: false });
        // Leaves and grit collect in the gutter.
        if (rng() > .82) b.quad(marks.leaves, horizontal ? x : x + side * (road.width / 2 - .5), .058, horizontal ? z + side * (road.width / 2 - .5) : z, 1.6, 1.6, { yaw: rng() * 6 });
        if (rng() > .55 && ctx.quality.density > .2) {
          const gx = horizontal ? x + (rng() - .5) * 3 : x + side * (road.width / 2 + 3.5), gz = horizontal ? z + side * (road.width / 2 + 3.5) : z + (rng() - .5) * 3;
          plants.tuft(gx, 0, gz, .3 + rng() * .25);
        }
      }
    }
    // Centre dashes, edge lines and the darker lanes that tires polish.
    for (let offset = 10; offset < length - 8; offset += 9) {
      const [x, z] = along(offset / length);
      b.box(flat.marking, x, .056, z, horizontal ? 4 : .14, .006, horizontal ? .14 : 4, { color: 0xd9b24f, cast: false });
    }
    for (const side of [-1, 1]) {
      b.box(flat.marking, cx + (horizontal ? 0 : side * (road.width / 2 - .5)), .056, cz + (horizontal ? side * (road.width / 2 - .5) : 0),
        horizontal ? length - 12 : .12, .006, horizontal ? .12 : length - 12, { color: 0xcfcfc2, cast: false });
      for (const track of [1.75, 3.55]) {
        b.box(surface('asphalt', 'overlay'), cx + (horizontal ? 0 : side * track), .054, cz + (horizontal ? side * track : 0),
          horizontal ? length - 16 : .5, .002, horizontal ? .5 : length - 16, { color: 0x545556, cast: false });
      }
    }
    // Patched repairs, sealed cracks and the odd manhole cover.
    for (let d = 19; d < length - 12; d += 37) {
      const side = rng() > .5 ? 1 : -1;
      const [px, pz] = along(d / length, side * 2.6);
      b.box(surface('asphalt', 'overlay'), px, .055, pz, horizontal ? 3.6 : 1.4, .002, horizontal ? 1.4 : 3.6, { color: 0x4e4f50, cast: false });
      b.quad(marks.crack, px + (rng() - .5) * 6, .058, pz + (rng() - .5) * 6, 3.4, 3.4, { yaw: rng() * 6 });
      const [mx, mz] = along((d + 14) / length, -side * 1.9);
      b.cylinder(flat.metal, mx, .054, mz, .36, .012, { color: 0x3a3d3c, segments: 14, cast: false });
      b.cylinder(flat.marking, mx, .056, mz, .29, .008, { color: 0x2c2f2e, segments: 14, cast: false });
    }
    for (let d = 26; d < length - 20; d += 41) {
      const [px, pz] = along(d / length, (rng() - .5) * 5);
      b.quad(marks.oil, px, .058, pz, 2.6, 3.4, { yaw: (horizontal ? Math.PI / 2 : 0) + (rng() - .5) * .4 });
    }
  }

  // Zebra crossings and stop bars on every arm of the four-way and three-way junctions.
  for (const { point, roads } of junctions.values()) {
    const arms = roads.filter(road => !isService(road));
    if (roads.length < 2) continue;
    for (const road of arms) {
      const other = road.a.x === point.x && road.a.z === point.z ? road.b : road.a;
      const length = Math.hypot(other.x - point.x, other.z - point.z);
      const dx = (other.x - point.x) / length, dz = (other.z - point.z) / length;
      const offset = road.width / 2 + 2.4;
      const px = point.x + dx * offset, pz = point.z + dz * offset;
      const horizontal = dz === 0;
      for (let stripe = -4; stripe <= 4; stripe++) {
        b.box(flat.marking, px + (horizontal ? 0 : stripe * 1.08), .0565, pz + (horizontal ? stripe * 1.08 : 0), horizontal ? 2.2 : .56, .006, horizontal ? .56 : 2.2, { color: 0xd4d4c8, cast: false });
      }
      b.box(flat.marking, px + dx * 2.1 + (horizontal ? 0 : 2.6 * Math.sign(dz)), .0565, pz + dz * 2.1 + (horizontal ? -2.6 * Math.sign(dx) : 0), horizontal ? .4 : 5, .006, horizontal ? 5 : .4, { color: 0xd4d4c8, cast: false });
    }
  }

  // Low barriers bound the playable map without hidden collision walls.
  for (const z of [-65, 211]) b.box(concrete, 54, .55, z, 300, 1.1, .6, { color: 0xa9a59a, collide: true, global: true, shade: .82 });
  for (const x of [-95, 203]) b.box(concrete, x, .55, 73, .6, 1.1, 276, { color: 0xa9a59a, collide: true, global: true, shade: .82 });

  // Yard floor: stains where engines were pulled, dust drifts, wheel ruts and standing water.
  for (const [x, z, w, d, yaw] of [[-20.1, -13.2, 3.4, 3.8, .25], [-27, -15.3, 1.5, 2.8, .9], [-15.4, 12.6, 2.6, 4.4, 0], [-15.2, 1.4, 2.8, 4.6, .1], [-37.6, -22.4, 2.8, 4.2, .3], [-34.5, 2.6, 2, 2.6, 1.2], [-34.2, 8.4, 1.8, 2.2, .4], [-58, -14.7, 3, 6, 1.5]]) {
    b.quad(marks.oil, x, .066, z, w, d, { yaw });
  }
  b.quad(marks.tracks, -20, .065, -8.6, 3.1, 8);
  for (const [x, z, yaw] of [[-47, -18, 0], [-69, -24, 0], [-62, -2, Math.PI / 2], [-42, -35, Math.PI / 2], [-33, 20, Math.PI / 2 + .2], [-47, -38, 0]]) b.quad(marks.tracks, x, .03, z, 3.8, 19, { yaw });
  for (const [x, z] of [[-25.3, 12], [-14.7, 5], [-43, 2], [-68, -8], [-62, 24], [-30, 26], [-50, -40], [-80, -20], [-10, -12]]) b.quad(marks.dust, x, .034, z, 9, 7, { yaw: x * .2 });
  const pools: [number, number, number, number, number][] = [[-30.5, 17.6, 3.6, 2.4, .4], [-28.4, 6.2, 2.4, 1.8, 1.1], [-12.2, 16.5, 2.6, 1.9, .3], [-45.8, -12, 3.4, 2.2, 1.6], [-67.5, -20, 2.8, 2.2, .2],
    [-48.4, 21.5, 3.8, 2.6, .9], [-39.5, -33.6, 4.2, 2.4, .1], [-24.2, 28.2, 2.2, 1.6, .7], [-11.5, -27.4, 3, 2, 1.2], [-70.5, 3, 3.2, 2.2, .5]];
  for (const [x, z, w, d, yaw] of pools) b.quad(puddle, x, .04, z, w, d, { yaw });
  // Roadside puddles sit in the gutter line where water would gather.
  for (const road of layout.roads.filter(road => !isService(road))) {
    const horizontal = road.a.z === road.b.z, length = Math.hypot(road.b.x - road.a.x, road.b.z - road.a.z);
    for (let d = 22 + rng() * 20; d < length - 20; d += 44 + rng() * 30) {
      const side = rng() > .5 ? 1 : -1, t = d / length;
      const x = road.a.x + (road.b.x - road.a.x) * t + (horizontal ? 0 : side * (road.width / 2 - 1.1));
      const z = road.a.z + (road.b.z - road.a.z) * t + (horizontal ? side * (road.width / 2 - 1.1) : 0);
      b.quad(puddle, x, .06, z, horizontal ? 3.4 : 1.6, horizontal ? 1.6 : 3.4, { yaw: rng() * .3 });
    }
  }

  // Loose gravel and rust flakes, kept off the paths the player walks most.
  const chip = new THREE.IcosahedronGeometry(1, 0);
  const scatter = Math.round(240 * ctx.quality.density);
  for (let i = 0; i < scatter; i++) {
    const x = YARD_BOUNDS.minX + 1 + rng() * (yardW - 2), z = YARD_BOUNDS.minZ + .8 + rng() * (yardD - 1.6);
    if (Math.abs(x + 20) < 6 || (x > -29.5 && x < -10.5 && z < -5.5 && z > -24.5)) continue;
    b.instance(chip, flat.matte, x, .05, z, { sx: .05 + rng() * .16, sy: .025 + rng() * .05, sz: .05 + rng() * .15, yaw: rng() * 6, color: i % 4 ? 0x8f8470 : C.rust, cast: false });
  }
  // Weeds root along the fence, where nothing drives.
  const weeds = Math.round(420 * ctx.quality.density);
  for (let i = 0; i < weeds; i++) {
    const side = i % 4;
    const x = side === 0 ? YARD_BOUNDS.minX + .5 + rng() * .9 : side === 1 ? YARD_BOUNDS.maxX - .5 - rng() * .9 : YARD_BOUNDS.minX + 2 + rng() * (yardW - 4);
    const z = side === 2 ? YARD_BOUNDS.minZ + .5 + rng() * .9 : side === 3 ? YARD_BOUNDS.maxZ - .5 - rng() * .9 : YARD_BOUNDS.minZ + 2 + rng() * (yardD - 4);
    if (side === 3 && x > -27.5 && x < -12.5) continue;
    plants.tuft(x, .01, z, .32 + rng() * .42, rng() > .6 ? 0x9c9a52 : undefined);
  }
  // The gate lamps light the first few metres of drive.
  lightPool(ctx, -20, 31.5, 8, C.sodium, .8);
  return marks;
}
