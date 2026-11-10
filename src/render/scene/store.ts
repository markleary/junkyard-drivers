import * as THREE from 'three';
import { clearGlass, flat, lights } from '../materials';
import { surface } from '../surfaces';
import { createEngineModel, createPaintCan, createWheelModel } from '../parts';
import { STREET_TINTS, placeCar } from '../wrecks';
import type { Vegetation } from '../vegetation';
import { getPartsForSale } from '../../game/catalog';
import { AUTO_PARTS_STORE } from '../../world/layout';
import { C, Part, airConditioner, lightPool, newsBox, planter, sign, trashCan, vent, type SceneContext } from './kit';
import type { GroundMarks } from './ground';

/**
 * Holloway Auto Parts: a glazed shop a short walk from the gate. The walls,
 * shelving and counter keep their original colliders and the centre aisle
 * stays open from the door to the till.
 */
export function buildStore(ctx: SceneContext, plants: Vegetation, marks: GroundMarks) {
  const { b, rng } = ctx;
  const store = AUTO_PARTS_STORE;
  const brick = surface('brick'), plaster = surface('plaster'), concrete = surface('concrete'), wood = surface('wood'), metal = surface('metal');
  const blue = C.blue, cream = 0xe6dcc4;

  // Slabs: shop floor, forecourt and the path from the yard gate.
  b.box(concrete, store.x, .02, store.z, store.w, .08, store.d, { color: 0xa9a59a, collide: true, cast: false });
  // The forecourt is drawn in two pieces around the path, which crosses its street edge at the same height: drawn
  // whole, the two slabs would share a plane there and shimmer. One collider still covers the whole forecourt.
  const forecourt = surface('asphalt');
  b.box(forecourt, store.x, .02, 28.15, 26, .08, 8.3, { color: 0x505254, cast: false });
  b.box(forecourt, 18.5, .02, 33.15, 13, .08, 1.7, { color: 0x505254, cast: false });
  b.solidBox(store.x, .02, 29, 26, .08, 10);
  b.box(concrete, -3, .02, 34, 30, .08, 3.4, { color: 0xb1ada1, collide: true, cast: false });
  b.box(surface('tile', 'overlay'), store.x, .064, store.z, store.w - .5, .004, store.d - .5, { color: 0xd9d2bf, cast: false });
  // A pavement strip under the canopy, flush so the door has no step.
  b.box(surface('concrete', 'overlay'), store.x, .066, 25.3, 22.6, .004, 2.4, { color: 0xb9b5a8, cast: false });

  // Shell: brick to sill height, painted render above, with the original colliders.
  b.box(plaster, store.x, 2.3, 4, 22, 4.6, .3, { color: cream, collide: true, shade: .82 });
  for (const x of [1, 23]) b.box(plaster, x, 2.3, 14, .3, 4.6, 20, { color: cream, collide: true, shade: .82 });
  for (const [x, z, w, d] of [[store.x, 3.82, 22.4, .08], [.82, 14, .08, 20.4], [23.18, 14, .08, 20.4]]) b.box(brick, x, .6, z, w, 1.2, d, { color: C.brick });
  for (const [x, z, w, d] of [[store.x, 3.8, 22.5, .1], [.8, 14, .1, 20.5], [23.2, 14, .1, 20.5]]) b.box(flat.satin, x, 3.95, z, w, .5, d, { color: blue });
  // Front: glazing either side of a four metre door opening. No collider crosses the door.
  for (const x of [5.5, 18.5]) {
    b.box(brick, x, .55, 24, 9, 1.1, .3, { color: C.brick, collide: true });
    b.box(concrete, x, 1.13, 24.02, 9.1, .07, .4, { color: 0xbdb9ad });
    b.solidBox(x, 2.2, 24, 9, 2.2, .12);
    b.box(clearGlass, x, 2.24, 24, 8.9, 2.14, .04, { cast: false });
    for (const dx of [-4.45, -1.5, 1.5, 4.45]) b.box(flat.metal, x + dx, 2.24, 24, .09, 2.2, .14, { color: 0x2c3a40 });
    b.box(flat.metal, x, 3.3, 24, 9, .1, .14, { color: 0x2c3a40 });
  }
  // A hair taller than the side walls it crosses, so their tops are not in one plane. The collider is the original.
  b.box(plaster, store.x, 4.031, 24, 22, 1.142, .3, { color: blue });
  b.solidBox(store.x, 4.03, 24, 22, 1.14, .3);
  b.solidBox(store.x, 4.73, 14, 22.7, .26, 20.7);
  b.box(metal, store.x, 4.76, 14, 22.9, .2, 20.9, { color: 0x6f7773 });
  b.box(flat.matte, store.x, 4.56, 14, 21.6, .06, 19.6, { color: 0xe9e4d4, cast: false });
  for (const x of [9.8, 14.2]) b.box(flat.metal, x, 1.75, 24, .12, 3.5, .4, { color: 0x2c3a40, collide: true });
  // Door header and the mat inside.
  b.box(flat.metal, store.x, 3.4, 24, 4.4, .2, .32, { color: 0x2c3a40 });
  b.box(flat.rubber, store.x, .07, 23.3, 2.6, .012, 1.2, { color: 0x2a2f30, cast: false });

  // Canopy with a painted fascia and the shop name lit from within after dark.
  b.box(metal, store.x, 3.48, 25.05, 22.6, .18, 2.3, { color: blue });
  // The fascia stands a centimetre proud of the canopy edge, and the lower trim hangs just below its underside.
  b.box(flat.satin, store.x, 4.03, 26.15, 22.62, 1.1, .12, { color: blue });
  b.box(flat.satin, store.x, 3.435, 26.17, 22.7, .1, .14, { color: C.yellow });
  b.box(flat.satin, store.x, 4.62, 26.17, 22.7, .08, .14, { color: C.yellow });
  for (const x of [1.4, 22.6]) b.box(flat.metal, x, 1.74, 26.05, .14, 3.48, .14, { color: 0x2c3a40, collide: true });
  sign(ctx, 'HOLLOWAY AUTO PARTS', store.x, 4.05, 26.24, 18.5, .98, { bg: '#24566a', sub: 'NEW ENGINES · WHEELS · PAINT', bare: true });
  sign(ctx, 'OPEN', 15.2, 2.5, 24.1, 1.5, .62, { style: 'neon', glow: C.neonRed, bare: true });
  for (const x of [4, 8, 16, 20]) {
    b.box(lights.interior, x, 3.37, 25.1, 1.2, .03, .2, { color: 0xfff1d6, cast: false });
    lightPool(ctx, x, 25.2, 2.6, C.lampWarm, .5);
  }
  // Roof plant.
  airConditioner(ctx, 7, 4.86, 10, .1);
  airConditioner(ctx, 17, 4.86, 16, 1.6);
  vent(ctx, 12, 4.86, 7);
  vent(ctx, 19, 4.86, 8.5);

  // Wayfinding from the yard: a post sign at the corner, and painted chevrons along the path.
  for (const x of [-7.6, -2.8]) b.cylinder(flat.metal, x, 1.4, 31, .05, 2.8, { color: C.steelDark, segments: 6 });
  sign(ctx, 'NEW PARTS  →', -5.2, 2.2, 31.06, 5.2, .9, { bg: '#24566a', sub: 'HOLLOWAY AUTO · 35 m' });
  for (let x = -13; x < 11; x += 4) {
    b.box(flat.marking, x, .067, 34, 1.15, .006, .09, { color: 0xe9e6dc, cast: false });
    b.box(flat.marking, x + .35, .068, 34.2, .1, .006, .63, { color: 0xe9e6dc, yaw: -.75, cast: false });
    b.box(flat.marking, x + .35, .068, 33.8, .1, .006, .63, { color: 0xe9e6dc, yaw: .75, cast: false });
  }

  // Aisle shelving: steel uprights, boxed stock in mixed colours, price tickets on the lip.
  const boxTints = [0xc0a275, blue, C.oxide, 0xd9cdb0, C.yellow, 0x3f6f7a, 0xb89a6c, 0xe6dcc4];
  for (const x of [3, 21]) for (const z of [11.5, 18]) {
    b.solidBox(x, 1.3, z, 2.1, 2.6, 4);
    const side = x < 12 ? 1 : -1;
    b.box(metal, x - side * 1.02, 1.3, z, .06, 2.6, 4, { color: 0x56605c });
    for (const dx of [-1.02, 1.02]) for (const dz of [-1.95, 1.95]) b.box(flat.metal, x + dx, 1.31, z + dz, .07, 2.62, .07, { color: 0x2c3a40 });
    for (const y of [.3, 1.05, 1.8, 2.5]) {
      b.box(metal, x, y, z, 2.25, .06, 4.2, { color: 0x9aa09a });
      b.box(flat.satin, x + side * 1.13, y - .02, z, .02, .09, 4.2, { color: C.yellow });
    }
    for (let i = 0; i < 6; i++) for (const y of [.62, 1.37, 2.1]) {
      if (x === 3 && z === 11.5 && y > 2) continue; // Open display shelf for the crate V8.
      const tint = boxTints[Math.floor(rng() * boxTints.length)], depth = .5 + rng() * .5, height = .34 + rng() * .22;
      b.box(flat.matte, x + side * (.9 - depth) * .5 - side * .1, y - .26 + height / 2, z - 1.75 + i * .7, 1.1 + depth * .7, height, .56, { color: tint });
      b.box(flat.matte, x + side * .93, y - .26 + height * .5, z - 1.75 + i * .7, .012, height * .5, .3, { color: C.paper });
    }
  }
  // Hanging aisle markers.
  for (const [x, label] of [[4.4, 'FILTERS · BELTS'], [19.6, 'BRAKES · BULBS']] as const) {
    for (const dz of [-.8, .8]) b.box(flat.metal, x, 4, 14.75 + dz, .015, 1, .015, { color: C.steelDark, cast: false });
    sign(ctx, label, x, 3.3, 14.75, 2.2, .42, { yaw: Math.PI / 2 * (x < 12 ? 1 : -1), bg: '#24566a', bare: true });
  }

  // Counter and till, on the original collider.
  const counter = new Part(b, store.counter.x, 0, store.counter.z);
  counter.solid(0, .58, 0, 8, 1.16, 1.65);
  counter.box(wood, 0, .58, 0, 8, 1.16, 1.65, { color: 0x3a6276, shade: .8 });
  for (let i = 0; i < 8; i++) counter.box(flat.satin, -3.5 + i, .58, .835, .86, .9, .02, { color: i % 2 ? 0x2f5265 : 0x35596c });
  counter.box(wood, 0, 1.22, 0, 8.25, .13, 1.9, { color: 0x9a7a52 });
  counter.box(flat.metal, 0, 1.16, .94, 8.25, .04, .04, { color: C.yellow });
  counter.box(flat.satin, 2.7, 1.47, 0, .75, .35, .65, { color: 0x2c3a40 });
  counter.box(lights.interior, 2.7, 1.8, -.08, .6, .38, .04, { color: 0x9fd0c8, cast: false });
  counter.box(flat.satin, 2.7, 1.82, -.12, .7, .46, .06, { color: 0x2c3a40 });
  counter.box(flat.matte, -1.2, 1.3, .3, .5, .03, .36, { color: C.paper, yaw: .2 });
  counter.cyl(flat.chrome, -3.2, 1.36, .2, .09, .14, { color: 0xc8cdc9, segments: 10 });
  sign(ctx, 'PARTS COUNTER', store.x, 2.75, 4.19, 9.5, .9, { bg: '#24566a', sub: 'I4 · V8 · V12 / STREET · SPORT', bare: true });
  // Colour wall behind the till: one chip per store paint.
  const newPaints = getPartsForSale('store', 'paint');
  for (const [i, paint] of newPaints.entries()) {
    b.model(createPaintCan(paint.color!, paint.name), 9.5 + i * .65, 1.285, 8, 0, 1.1);
    b.box(flat.satin, 16.4 + i * .9, 2.1, 4.18, .7, 1, .03, { color: new THREE.Color(paint.color!).getHex() });
    b.box(flat.matte, 16.4 + i * .9, 1.5, 4.18, .7, .16, .03, { color: C.paper });
  }
  // Belts and gaskets on pegboard, left of the counter sign.
  b.box(wood, 5.2, 2.2, 4.18, 3.6, 1.9, .04, { color: 0xb89a6c });
  const hoop = new THREE.TorusGeometry(.22, .018, 5, 18);
  for (let i = 0; i < 10; i++) b.instance(hoop, flat.rubber, 3.8 + (i % 5) * .7, 2.7 - Math.floor(i / 5) * .8, 4.24, { color: C.rubber, sy: 1 + (i % 3) * .25 });

  // Showpieces: crate engines on pallets under their own lamps, and the V8 on the open shelf.
  for (const x of [6.2, 17.8]) {
    b.box(wood, x, .2, 6.1, 2.5, .4, 2.4, { color: C.wood });
    for (const z of [5.3, 6.9]) b.box(wood, x, .43, z, 2.55, .06, .19, { color: C.woodPale });
    b.model(createEngineModel(x < 12 ? 'i4' : 'v12', { condition: 'new', performance: true }), x, .46, 6.1, .12, 1.15);
    // High on the wall, clear of the pegboard and the paint chips beneath.
    sign(ctx, x < 12 ? 'CRATE ENGINES' : 'FACTORY FRESH', x, 3.62, 4.19, 3, .55, { bg: '#24566a', bare: true });
    b.cylinder(flat.satin, x, 4.2, 6.1, .22, .3, { taper: .4, color: 0x2c3a40, segments: 10 });
    b.cylinder(lights.interior, x, 4.06, 6.1, .13, .03, { color: 0xfff1d6, segments: 10, cast: false });
    lightPool(ctx, x, 6.1, 2.4, C.lampCool, .5, .07);
  }
  b.model(createEngineModel('v8', { condition: 'new' }), 3.2, 1.84, 11.5, Math.PI / 2, .7);
  // Window displays make the shop recognisable from the street.
  for (const x of [5.7, 18.3]) {
    b.box(wood, x, .14, 21.8, 3.2, .28, 1.55, { color: blue, collide: true });
    b.box(flat.satin, x, .29, 21.8, 3.3, .03, 1.65, { color: C.yellow });
    for (let i = 0; i < 3; i++) b.model(createWheelModel(x < 12 ? 'street' : 'sport', { condition: 'new' }), x - 1 + i, .3, 21.8, x < 12 ? -.2 : .2, 1.18);
  }
  // Ceiling: troffers in a grid, plus the one real source.
  for (const x of [6.5, 12, 17.5]) for (const z of [8.5, 14, 19.5]) {
    b.box(flat.metal, x, 4.5, z, 1.4, .06, .7, { color: 0xc9cdc6, cast: false });
    b.box(lights.interior, x, 4.46, z, 1.26, .02, .56, { color: 0xf4f8ff, cast: false });
  }
  const shopLight = new THREE.PointLight(0xe9f1ff, 13, 24, 1.4);
  shopLight.position.set(store.x, 3.3, 14);
  ctx.root.add(shopLight);
  lightPool(ctx, store.x, 26.4, 6, C.lampCool, .7);

  // Forecourt: marked bays, wheel stops, bollards guarding the glass, and a few customers.
  for (let i = 0; i <= 7; i++) {
    const x = 1.6 + i * 2.95;
    if (x > 9.6 && x < 14.6) continue;
    b.box(flat.marking, x, .068, 29.6, .1, .006, 4.8, { color: 0xd4d4c8, cast: false });
  }
  for (const x of [3.1, 6, 8.9, 16.4, 19.3, 22.2]) {
    b.box(concrete, x, .13, 27.5, 1.7, .14, .22, { color: 0xbdb9ad });
    b.cylinder(flat.satin, x - 1.45, .5, 26.6, .09, .9, { color: C.yellow, segments: 8, collide: true });
  }
  for (const [x, style, tint, yaw] of [[19.3, 'wagon', STREET_TINTS[1], .03], [6, 'sedan', STREET_TINTS[5], -.04], [22.2, 'pickup', STREET_TINTS[3], 0]] as const) {
    placeCar(b, style, x, .06, 29.5, { tint, yaw, collide: true });
    b.quad(marks.oil, x, .07, 29.6, 2, 3, { yaw: .2 });
  }
  // Lot lamps on the outer corners.
  for (const x of [-.4, 24.4]) {
    const inward = x < 12 ? 1 : -1;
    b.cylinder(flat.metal, x, 2.6, 29, .07, 5.2, { color: C.steelDark, segments: 8, taper: .8, collide: true });
    b.box(flat.metal, x + inward * .5, 5.2, 29, 1, .12, .3, { color: C.steelDark });
    b.box(lights.lamp, x + inward * .7, 5.13, 29, .6, .04, .24, { color: C.lampCool, cast: false });
    ctx.lamps.push({ x: x + inward * 1.5, y: 5, z: 29, color: C.lampCool, reach: 16 });
    lightPool(ctx, x + inward * 2.5, 29, 7, C.lampCool, .8);
  }
  // Kerbside furniture, all to the sides of the walk-in line.
  const vending = new Part(b, 2.1, 0, 25.2, Math.PI);
  vending.box(flat.satin, 0, 1, 0, 1, 1.9, .8, { color: C.oxide, shade: .8 });
  vending.box(lights.interior, 0, 1.25, .41, .78, 1.1, .02, { color: 0xffe2b0, cast: false });
  vending.box(flat.satin, .3, .45, .41, .2, .3, .02, { color: 0x2c3a40 });
  vending.solid(0, 1, 0, 1, 1.9, .8);
  const ice = new Part(b, 21.6, 0, 25.2, Math.PI);
  ice.box(flat.satin, 0, .7, 0, 1.8, 1.4, .8, { color: C.white, shade: .82 });
  ice.box(flat.satin, 0, .9, .41, 1.6, .6, .02, { color: 0x3f7f96 });
  ice.solid(0, .7, 0, 1.8, 1.4, .8);
  trashCan(ctx, 8.6, 25.4, C.blue);
  newsBox(ctx, 15.6, 25.3, Math.PI, C.yellow);
  newsBox(ctx, 16.2, 25.3, Math.PI, 0x2c5a8a);
  planter(ctx, -1.7, 30.6, (x, y, z, scale) => plants.bush(x, y, z, scale));
  planter(ctx, 25.7, 30.6, (x, y, z, scale) => plants.bush(x, y, z, scale));
  // Painted wall on the side facing the yard gate.
  sign(ctx, 'HOLLOWAY', .78, 3.1, 14, 9, 1.6, { yaw: -Math.PI / 2, style: 'plank', bg: '#e6dcc4', color: '#24566a', sub: 'AUTO PARTS · SINCE 1958', bare: true });
  // Behind the shop: pallets and a skip.
  for (let i = 0; i < 3; i++) b.box(wood, 20, .08 + i * .15, 2.4, 1.2, .14, 1.1, { color: i % 2 ? C.woodPale : C.wood, yaw: i * .07 });
  for (let i = 0; i < 8; i++) plants.tuft(1 + rng() * 22, .01, 3.2 + rng() * .6, .3 + rng() * .3);

  ctx.interactables.push({ id: 'store-counter', kind: 'store', position: new THREE.Vector3(store.counter.x, 1.35, store.counter.z + 1), label: 'Holloway Auto Parts · new parts' });
}
