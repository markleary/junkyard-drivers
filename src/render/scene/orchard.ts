import * as THREE from 'three';
import { inCourt, SHED_VAN, UNLOAD } from '../../world/orchard';
import { surface } from '../surfaces';
import { flat, lights } from '../materials';
import type { Vegetation } from '../vegetation';
import { C, Part, crate, lightPool, postSign, sign, type SceneContext } from './kit';

export function buildOrchard(ctx: SceneContext, plants: Vegetation) {
  const { b } = ctx;
  const shed = new Part(b, SHED_VAN.x, 0, SHED_VAN.z);
  const wood = surface('wood'), iron = surface('corrugated');
  b.box(surface('gravel'), -73, .016, 46.5, 34, .036, 27, { color: C.gravel, cast: false });
  shed.box(surface('dirt'), 0, .013, 0, 12.66, .052, 16, { color: C.dirt, cast: false });
  for (const side of [-1, 1]) {
    shed.box(wood, side * 6.4, 2.1, .18, .2, 4.2, 15.3, { color: C.oxideDark, collide: true });
    for (const z of [-7.4, -2.5, 2.5, 7.4]) {
      shed.box(wood, side * 6.18, 2.16, z, .26, 4.32, .3, { color: C.woodDark });
    }
    shed.box(iron, side * 3.4, 4.94, 0, 7.03, .14, 16.7, { roll: -side * .20, color: 0x867e70 });
    shed.beam(wood, [0,5.55,-7.52], [side*6.45,4.22,-7.52], .13, { color: C.woodPale });
    shed.box(wood, side * 5.28, 1.98, -7.5, 1.94, 3.96, .22, { color: C.oxide, collide: true });
    shed.beam(wood, [side*4.4,.26,-7.65], [side*6.10,3.7,-7.65], .07, { color: C.woodPale });
  }
  shed.box(wood, 0, 2.12, 7.88, 12.8, 4.24, .16, { color: C.oxideDark, collide: true });
  shed.box(wood, 0, 4.15, -7.63, 13.1, .3, .28, { color: C.woodDark });
  sign(ctx, 'BELL FRUIT CO.', SHED_VAN.x, 4.55, SHED_VAN.z - 7.8, 5.4, .9,
    { yaw: Math.PI, style: 'plank', bg: '#6a5238', sub: 'PACKING HOUSE   •   EST. 1938' });
  shed.box(lights.lamp, 0, 3.98, -6.8, 1.2, .08, .22, { color: C.lampWarm });
  ctx.lamps.push({ x: SHED_VAN.x, y: 3.7, z: SHED_VAN.z - 5, color: C.lampWarm, reach: 15 });
  lightPool(ctx, SHED_VAN.x, SHED_VAN.z - 6, 9, C.lampWarm, .7);
  postSign(ctx, 'BELL ORCHARD', -34, 38, 4.7, { style: 'plank', yaw: Math.PI / 2, bg: '#5d6347', sub: 'APPLES   •   PACKING HOUSE' });
  for (const [x,z] of [[-81,68],[-80,69.2],[-81.4,69.4],[-71,69.7],[-84,60]]) {
    crate(ctx, x, 0, z, 1, .03); crate(ctx, x, 1.04, z, .92, -.04);
    b.solidBox(x, 1, z, 1, 2, 1);
  }
  const apple = new THREE.IcosahedronGeometry(.15, 0);
  for (const x of [-89,-85,-65,-60]) for (const z of [60,66,72,78,84]) {
    if (inCourt(x, z)) continue;
    plants.tree(x, z, 3.8, 1.65, 'round');
    for (let i = 0; i < 10; i++) {
      const a = i * 2.4 + z;
      b.instance(apple, flat.matte, x + Math.cos(a) * 1.4, 2.2 + (i % 3) * .32, z + Math.sin(a) * 1.4, { color: i % 3 ? C.oxide : C.yellow });
    }
  }
  for (const side of [-1,1]) {
    b.box(flat.marking, UNLOAD.x + side * 2, .076, UNLOAD.z + 3, .13, .003, 13, { color: C.yellow, cast: false });
    for (let i = 0; i < 4; i++) b.box(flat.marking, UNLOAD.x + side * 1.56, .077, UNLOAD.z + i * 2.8, .12, .003, 1, { yaw: side * .8, color: C.yellow, cast: false });
  }
}
