import * as THREE from 'three';
import { clearGlass, flat, lights, windowGlass } from '../materials';
import { surface } from '../surfaces';
import { createPitchedRoof, createTankLettering } from '../architecture';
import { STREET_TINTS, placeCar, type BodyStyle } from '../wrecks';
import type { Vegetation } from '../vegetation';
import { STORE_LOT, distanceToRoad, overlapsBox, roadIntersectsBox, type Building, type Lot, type Point, type Road } from '../../world/layout';
import { C, Part, airConditioner, bench, hydrant, lightPool, mailbox, newsBox, planter, postSign, roadSign, sign, streetLamp, trashCan, utilityPole, vent, wire, type SceneContext } from './kit';
import type { GroundMarks } from './ground';

const SHOPS = ['MERCER HARDWARE', 'LAST STOP DINER', 'FOUND & FIXED', 'MILLER GROCERY', 'WILLOW LAUNDRY', 'CORNER COFFEE', 'POST OFFICE', 'THE FOUNDRY', 'RIVERSIDE BOOKS', 'OAK STREET BAKERY', 'WILLOW CREEK BANK', 'BARBER & SHAVE'];
const BRICKS = [0x9a5540, 0x8a4a3a, 0xa9705a, 0x7b4636, 0xb48a6e];
const RENDERS = [0xd9cfb4, 0xc9d2c0, 0xd8c79a, 0xbfcbd0, 0xe2d6c2, 0xcdb89c];
const SIDINGS = [0xc9d6cf, 0xe2d8bf, 0xb8c9a8, 0xd9b9a0, 0xa9bcc9, 0xe6dcc4, 0xc8b06a];
const AWNINGS = [0xa63e2e, 0x345d43, 0x24566a, 0xd9a43a, 0x7a2f3a, 0x3f7f86];
const ROOMS = [0xffd9a0, 0xffc880, 0xfff0d0, 0xbfe0ff, 0xffb070];
const isService = (road: Road) => road.id.includes('garage') || road.id.includes('gate');

/** Which way a building should face: toward the nearest street. Yaw 0 looks along +z. */
function facing(building: Building, roads: Road[]): number {
  let best = Infinity, yaw = 0;
  for (const road of roads) {
    if (isService(road)) continue;
    const distance = distanceToRoad(building, road);
    if (distance >= best) continue;
    best = distance;
    const horizontal = road.a.z === road.b.z;
    yaw = horizontal ? (road.a.z > building.z ? 0 : Math.PI) : (road.a.x > building.x ? Math.PI / 2 : -Math.PI / 2);
  }
  return yaw;
}

/** The town: every generated building, the kerbside furniture, the three lots and the water tower. */
export function buildTown(ctx: SceneContext, plants: Vegetation, marks: GroundMarks) {
  const { b, layout, rng } = ctx;
  const brick = surface('brick'), plaster = surface('plaster'), siding = surface('wood'), concrete = surface('concrete'), roofing = surface('roof'), metal = surface('metal');
  const roofShape = createPitchedRoof();
  const free = (box: { x: number; z: number; w: number; d: number }, margin = 1) =>
    !layout.roads.some(road => roadIntersectsBox(road, box, 3.6)) && !layout.buildings.some(other => overlapsBox(box, other, margin)) &&
    !layout.lots.some(lot => overlapsBox(box, lot, margin)) && !overlapsBox(box, STORE_LOT, 2) && !(box.x - box.w / 2 < -3 && box.z - box.d / 2 < 37) &&
    !layout.trees.some(tree => Math.abs(tree.x - box.x) < box.w / 2 + 1.2 && Math.abs(tree.z - box.z) < box.d / 2 + 1.2);

  layout.buildings.forEach((building, index) => {
    const yaw = facing(building, layout.roads), turned = Math.abs(Math.sin(yaw)) > .5;
    // Local frame: x across the frontage, +z out of the front door.
    const w = turned ? building.d : building.w, d = turned ? building.w : building.d, h = building.h;
    const p = new Part(b, building.x, 0, building.z, yaw);
    const shop = index < SHOPS.length, floors = Math.max(1, Math.round((h - 2) / 3));
    const pitched = building.style === 0 || !shop;
    const kind = shop ? (building.style % 2 ? 'render' : 'brick') : 'siding';
    const wallMaterial = kind === 'brick' ? brick : kind === 'render' ? plaster : siding;
    const tint = kind === 'brick' ? BRICKS[index % BRICKS.length] : kind === 'render' ? RENDERS[index % RENDERS.length] : SIDINGS[index % SIDINGS.length];
    const trim = kind === 'siding' ? 0xf0ead8 : 0xe2d8bf;

    // Mass and plinth carry the same colliders as before.
    p.box(wallMaterial, 0, h / 2, 0, w, h, d, { color: tint, shade: .84 });
    p.solid(0, h / 2, 0, w, h, d);
    p.box(concrete, 0, .22, 0, w + .6, .44, d + .6, { color: 0xa9a59a });
    p.solid(0, .22, 0, w + .6, .44, d + .6);

    if (pitched) {
      const rise = Math.min(2.8, w * .16);
      const tile = shop ? 0x5a5f5c : [0x6a4a3a, 0x4f5a5a, 0x7a3f34, 0x56544c][index % 4];
      const [rx, rz] = p.at(0, 0);
      b.geometry(roofing, roofShape, rx, h, rz, { sx: w + .9, sy: rise, sz: d + .9, yaw, color: tile });
      const hull = new Float32Array([-(w + .9) / 2, 0, -(d + .9) / 2, (w + .9) / 2, 0, -(d + .9) / 2, 0, rise, -(d + .9) / 2, -(w + .9) / 2, 0, (d + .9) / 2, (w + .9) / 2, 0, (d + .9) / 2, 0, rise, (d + .9) / 2]);
      const collider = b.solidHull(hull, building.x, h, building.z, .6);
      collider?.setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw));
      p.box(flat.metal, 0, h + rise, 0, .18, .1, d + 1, { color: 0x4a5250 });
      for (const side of [-1, 1]) {
        p.box(flat.satin, side * (w / 2 + .42), h + .02, 0, .14, .16, d + 1, { color: trim });
        p.cyl(flat.metal, side * (w / 2 + .3), h / 2, d / 2 + .12, .05, h, { color: 0x858c88, segments: 6 });
      }
    } else {
      // Flat roof behind a parapet, with the plant that keeps a shop running.
      p.box(flat.satin, 0, h + .16, 0, w + .5, .32, d + .5, { color: trim });
      p.box(flat.matte, 0, h + .36, 0, w - .5, .1, d - .5, { color: 0x3f4442 });
      for (const side of [-1, 1]) {
        p.box(wallMaterial, side * (w / 2 - .14), h + .62, 0, .3, .6, d, { color: tint });
        p.box(wallMaterial, 0, h + .62, side * (d / 2 - .14), w, .6, .3, { color: tint });
        p.box(flat.satin, 0, h + .95, side * (d / 2 - .14), w + .2, .08, .48, { color: trim });
        p.box(flat.satin, side * (w / 2 - .14), h + .95, 0, .48, .08, d + .2, { color: trim });
      }
      const [ax, az] = p.at(w * .22, -d * .12);
      airConditioner(ctx, ax, h + .42, az, yaw + .2);
      const [vx, vz] = p.at(-w * .2, d * .18);
      vent(ctx, vx, h + .42, vz);
      if (index % 3 === 0) {
        // A timber water tank on stilts gives the taller blocks a skyline.
        const tank = p.child(w * .24, h + .42, d * .2);
        for (const [dx, dz] of [[-.5, -.5], [.5, -.5], [-.5, .5], [.5, .5]]) tank.box(flat.metal, dx, .5, dz, .08, 1, .08, { color: C.steelDark });
        tank.cyl(siding, 0, 1.75, 0, .8, 1.5, { color: 0x8a6a44, segments: 12 });
        tank.cyl(roofing, 0, 2.75, 0, .9, .5, { taper: .1, color: 0x5a4a3a, segments: 12 });
      }
    }
    // Chimney stack.
    p.box(brick, -w * .26, h + 1.1, -d * .2, 1, 1.7, 1, { color: 0x8a4a3a });
    p.box(flat.matte, -w * .26, h + 2, -d * .2, 1.24, .14, 1.24, { color: 0x3f4442 });

    // Corner quoins and a string course at each floor line.
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(kind === 'siding' ? flat.satin : plaster, sx * (w / 2 - .12), h / 2, sz * (d / 2 + .05), .34, h, .16, { color: trim });
    for (let floor = 1; floor < floors; floor++) for (const sz of [-1, 1]) p.box(flat.satin, 0, floor * 3 + .4, sz * (d / 2 + .06), w, .14, .14, { color: trim });
    p.box(flat.satin, 0, h - .14, d / 2 + .1, w + .1, .28, .22, { color: trim });

    // Windows. A stable pattern decides which rooms have their lamps on after dark.
    const pane = (dx: number, y: number, dz: number, pw: number, ph: number, along: 'x' | 'z', seed: number, alwaysLit = false) => {
      const roll = Math.abs(Math.sin(seed * 12.9898 + index * 4.1)) * 43758.5453 % 1;
      const lit = alwaysLit || roll > .42;
      const glow = lit ? ROOMS[Math.floor(roll * 97) % ROOMS.length] : 0x000000;
      if (along === 'x') {
        const out = Math.sign(dz);
        p.box(flat.satin, dx, y, dz, pw + .26, ph + .26, .1, { color: trim });
        p.box(windowGlass, dx, y, dz + out * .04, pw, ph, .06, { color: glow, cast: false, shade: .42 });
        p.box(flat.satin, dx, y, dz + out * .08, .05, ph, .03, { color: trim });
        p.box(flat.satin, dx, y + ph * .12, dz + out * .08, pw, .05, .03, { color: trim });
        p.box(concrete, dx, y - ph / 2 - .16, dz + out * .1, pw + .5, .12, .34, { color: 0xbdb9ad });
      } else {
        const out = Math.sign(dx);
        p.box(flat.satin, dx, y, dz, .1, ph + .26, pw + .26, { color: trim });
        p.box(windowGlass, dx + out * .04, y, dz, .06, ph, pw, { color: glow, cast: false, shade: .42 });
        p.box(flat.satin, dx + out * .08, y, dz, .03, ph, .05, { color: trim });
        p.box(concrete, dx + out * .1, y - ph / 2 - .16, dz, .34, .12, pw + .5, { color: 0xbdb9ad });
      }
    };
    const shutters = kind === 'siding' ? [0x345d43, 0x24566a, 0x7a2f3a, 0x3c4448][index % 4] : 0;
    const firstUpper = shop ? 1 : 0;
    for (let floor = firstUpper; floor < floors; floor++) {
      const y = floor * 3 + (shop ? 2 : 1.9);
      const columns = Math.max(2, Math.floor((w - 2.2) / 3.2));
      for (let i = 0; i < columns; i++) {
        const dx = -(columns - 1) * 1.6 + i * 3.2;
        if (!shop && floor === 0 && Math.abs(dx) < 1.4) continue; // The front door stands here.
        for (const sz of [-1, 1]) {
          pane(dx, y, sz * (d / 2 + .04), 1.3, 1.5, 'x', floor * 31 + i * 7 + sz);
          if (shutters && sz > 0) for (const side of [-1, 1]) p.box(flat.matte, dx + side * .92, y, d / 2 + .1, .36, 1.56, .05, { color: shutters });
        }
      }
      const sideColumns = Math.max(1, Math.floor((d - 2.2) / 3.4));
      for (let i = 0; i < sideColumns; i++) {
        const dz = -(sideColumns - 1) * 1.7 + i * 3.4;
        for (const sx of [-1, 1]) pane(sx * (w / 2 + .04), y, dz, 1.2, 1.45, 'z', floor * 17 + i * 5 + sx * 3);
      }
    }

    const fz = d / 2;
    if (shop) {
      // Shop front: bulkhead, display glazing, a recessed door and a striped awning.
      const awning = AWNINGS[index % AWNINGS.length], doorAt = (index % 3 - 1) * Math.min(2, w * .14);
      p.box(kind === 'brick' ? plaster : brick, 0, .5, fz + .06, w - .8, .7, .14, { color: kind === 'brick' ? 0x3c4448 : 0x7b4636 });
      const bays: [number, number][] = [];
      const left = -w / 2 + .7, right = w / 2 - .7;
      if (doorAt - .85 - left > 1.6) bays.push([left, doorAt - .85]);
      if (right - (doorAt + .85) > 1.6) bays.push([doorAt + .85, right]);
      for (const [from, to] of bays) {
        const centre = (from + to) / 2, width = to - from - .2;
        p.box(flat.satin, centre, 1.75, fz + .07, width + .2, 1.9, .12, { color: 0x2c3a40 });
        p.box(windowGlass, centre, 1.75, fz + .12, width, 1.7, .06, { color: 0xffd9a0, cast: false, shade: .38 });
        // Posters on the glass and a display plinth along the sill: by night they stand dark against the lit shop.
        p.box(flat.matte, centre, 1.02, fz + .158, width - .12, .24, .014, { color: 0x2c3a40, cast: false });
        for (let poster = 0; poster < Math.max(1, Math.round(width / 2.2)); poster++) {
          const px = centre - width / 2 + .55 + poster * 2.1 + ((index + poster) % 3) * .22;
          if (px > centre + width / 2 - .45) break;
          p.box(flat.matte, px, 1.72 + ((index * 5 + poster) % 3) * .14, fz + .158, .5 + ((index + poster) % 2) * .16, .66, .014, { color: [0xd9c89c, 0xa63e2e, 0x24566a, 0xe3b449][(index + poster * 3) % 4], cast: false });
        }
        for (let m = 1; m < Math.round(width / 1.6); m++) p.box(flat.satin, centre - width / 2 + m * width / Math.round(width / 1.6), 1.75, fz + .16, .06, 1.7, .04, { color: 0x2c3a40 });
        // Goods in the window.
        for (let item = 0; item < Math.floor(width / .7); item++) p.box(flat.satin, centre - width / 2 + .4 + item * .7, 1.05 + (item % 2) * .1, fz - .3, .36, .3 + (item % 3) * .12, .3, { color: STREET_TINTS[(index * 3 + item) % STREET_TINTS.length] });
      }
      p.box(flat.satin, doorAt, 1.38, fz + .07, 1.4, 2.76, .12, { color: 0x2c3a40 });
      p.box(windowGlass, doorAt, 1.62, fz + .12, 1.05, 2, .06, { color: 0xffe2b0, cast: false, shade: .4 });
      p.box(flat.satin, doorAt, .44, fz + .15, 1.05, .34, .04, { color: awning });
      p.box(flat.chrome, doorAt + .4, 1.3, fz + .2, .04, .4, .04, { color: 0xc8cdc9 });
      p.box(concrete, doorAt, .12, fz + .64, 1.8, .24, .5, { color: 0xbdb9ad });
      // Awning: sloped cloth with a scalloped valance, on two rods.
      p.box(flat.sheet, 0, 3.1, fz + .72, w - 1, .06, 1.3, { color: awning, pitch: .22 });
      for (let stripe = 0; stripe < Math.floor((w - 1) / .9); stripe += 2) p.box(flat.sheet, -(w - 1) / 2 + .45 + stripe * .9, 3.115, fz + .72, .45, .06, 1.31, { color: 0xe9e2cc, pitch: .22 });
      p.box(flat.sheet, 0, 2.86, fz + 1.36, w - 1, .26, .04, { color: awning });
      for (const sx of [-1, 1]) p.beam(flat.metal, [sx * (w / 2 - .7), 2.5, fz + .1], [sx * (w / 2 - .7), 2.96, fz + 1.34], .02, { color: C.steelDark, segments: 4 });
      // Fascia board with the shop's name, facing the street.
      const [sx, sz] = p.at(0, fz + .19);
      sign(ctx, SHOPS[index], sx, 3.92, sz, Math.min(11, w - 1.4), .86, { bg: ['#405653', '#754a36', '#24566a', '#5a4630'][index % 4], yaw, bare: true });
      p.box(flat.satin, 0, 3.92, fz + .13, Math.min(11, w - 1.4) + .2, 1.02, .08, { color: 0x2c3a40 });
      // The diner and the coffee shop hang a tube sign that lights after dark.
      if (index === 1 || index === 5) {
        const [nx, nz] = p.at(w / 2 - 1.1, fz + .9);
        p.box(flat.metal, w / 2 - 1.1, 5, fz + .45, .08, .08, .9, { color: C.steelDark });
        const neon = sign(ctx, index === 1 ? 'DINER' : 'COFFEE', nx, 4.6, nz, 1.9, .7, { style: 'neon', glow: index === 1 ? C.neonRed : C.neonAmber, yaw: yaw + Math.PI / 2, bare: true });
        (neon.material as THREE.Material).side = THREE.DoubleSide;
      }
      // Wall lamps and whatever stands on the pavement outside.
      for (const side of [-1, 1]) {
        p.box(flat.metal, side * (w / 2 - .5), 2.7, fz + .14, .14, .3, .16, { color: C.steelDark });
        p.box(lights.lamp, side * (w / 2 - .5), 2.56, fz + .2, .1, .08, .1, { color: C.lampWarm, cast: false });
      }
      const [lx, lz] = p.at(0, fz + 1.4);
      ctx.lamps.push({ x: lx, y: 2.6, z: lz, color: C.lampWarm, reach: 10 });
      lightPool(ctx, lx, lz, Math.min(6, w * .34), C.lampWarm, .75, .47);
      const [fx, fzz] = p.at(w * .32, fz + .62);
      if (index % 2) planter(ctx, fx, fzz, (x, y, z, scale) => plants.bush(x, y + .44, z, scale));
      else { const seat = p.child(w * .3, .44, fz + .5, 0); const [bx, bz] = seat.at(0, 0); bench(ctx, bx, bz, yaw + Math.PI); }
      const [tx, tz] = p.at(-w * .34, fz + .55);
      trashCan(ctx, tx, tz, index % 2 ? C.green : C.blue);
    } else {
      // House: a porch with posts and steps, a painted door, a hedge and a letterbox.
      const door = [C.oxide, 0x24566a, 0x345d43, 0x3c4448][index % 4];
      p.box(siding, 0, .5, fz + 1.1, Math.min(w - 2, 6.4), .2, 2.2, { color: 0xb9a888 });
      p.box(concrete, 0, .2, fz + 2.5, 2.2, .4, .7, { color: 0xbdb9ad });
      p.box(roofing, 0, 3.05, fz + 1.2, Math.min(w - 1.6, 6.8), .1, 2.6, { color: 0x5a4a3a, pitch: .16 });
      for (const side of [-1, 1]) {
        p.box(flat.satin, side * (Math.min(w - 2, 6.4) / 2 - .12), 1.75, fz + 2.1, .14, 2.5, .14, { color: trim });
        p.box(flat.satin, side * (Math.min(w - 2, 6.4) / 4 + .6), .98, fz + 2.14, Math.min(w - 2, 6.4) / 2 - 1.3, .06, .06, { color: trim });
        for (let rail = 0; rail < 4; rail++) p.box(flat.satin, side * (1.4 + rail * .34), .78, fz + 2.14, .05, .4, .05, { color: trim });
      }
      p.box(flat.satin, 0, 1.6, fz + .07, 1.2, 2.2, .12, { color: trim });
      p.box(flat.satin, 0, 1.56, fz + .12, .96, 2, .06, { color: door });
      p.box(windowGlass, 0, 2.1, fz + .16, .5, .5, .03, { color: 0xffd9a0, cast: false });
      p.box(lights.lamp, .9, 2.4, fz + .16, .14, .2, .1, { color: C.lampWarm, cast: false });
      const [lx, lz] = p.at(0, fz + 1.6);
      lightPool(ctx, lx, lz, 3.2, C.lampWarm, .7, .47);
      // Garden: hedges either side of the path, flower tufts under the windows.
      for (const side of [-1, 1]) {
        const [hx, hz] = p.at(side * (w / 4 + .9), fz + 4.2);
        if (free({ x: hx, z: hz, w: 3, d: 1.2 }, .2)) plants.hedge(hx, hz, w / 2 - 2, yaw);
        for (let i = 0; i < 4; i++) { const [gx, gz] = p.at(side * (1.6 + i * .7), fz + .7); plants.tuft(gx, .44, gz, .34, [0xd9a43a, 0xc9584a, 0xe9e6dc, 0x8f7ab8][(index + i) % 4]); }
      }
      const [mx, mz] = p.at(-1.8, fz + 4.6);
      if (free({ x: mx, z: mz, w: 1, d: 1 }, .2)) mailbox(ctx, mx, mz, yaw);
      // A car on a gravel pad beside the house, where there is room for one.
      for (const side of [1, -1]) {
        const [cx, cz] = p.at(side * (w / 2 + 2.4), 1);
        const pad = turned ? { x: cx, z: cz, w: 6.4, d: 3.4 } : { x: cx, z: cz, w: 3.4, d: 6.4 };
        if (!free(pad, .6)) continue;
        b.box(surface('gravel', 'overlay'), cx, .02, cz, pad.w, .03, pad.d, { color: 0xa39780, cast: false });
        placeCar(b, (['sedan', 'wagon', 'pickup', 'compact', 'coupe', 'van'] as BodyStyle[])[index % 6], cx, .03, cz, { tint: STREET_TINTS[(index * 5 + 2) % STREET_TINTS.length], yaw: yaw + (index % 2 ? Math.PI : 0), collide: true });
        b.quad(marks.oil, cx, .04, cz, 2, 3, { yaw });
        break;
      }
    }
    // Back of the building: a service door, a meter box and the bins.
    p.box(flat.satin, w * .2, 1.4, -fz - .07, 1.1, 2.4, .1, { color: 0x3c4448 });
    p.box(flat.metal, -w * .3, 1.5, -fz - .1, .5, .7, .16, { color: 0x858c88 });
    p.cyl(flat.metal, -w * .3, .8, -fz - .08, .03, 1.1, { color: 0x858c88, segments: 5 });
    // Rough grass against the plinth softens the meeting of wall and ground.
    if (ctx.quality.density > .2) for (let i = 0; i < 10; i++) {
      const edge = i % 3, [gx, gz] = edge === 0 ? p.at(-w / 2 - .6, (rng() - .5) * d) : edge === 1 ? p.at(w / 2 + .6, (rng() - .5) * d) : p.at((rng() - .5) * w, -fz - .6);
      plants.tuft(gx, .01, gz, .3 + rng() * .3);
    }
  });

  // Street lighting, signs and furniture follow the generated roads.
  const main = layout.roads.filter(road => !isService(road));
  const nearLot = (x: number, z: number, margin = 3.5) => layout.lots.some(lot => lot.driveways.some(d => Math.hypot(d.x - x, d.z - z) < margin));
  for (const road of main) {
    const length = Math.hypot(road.b.x - road.a.x, road.b.z - road.a.z), horizontal = road.a.z === road.b.z;
    const point = (d: number, side: number): [number, number] => {
      const x = road.a.x + (road.b.x - road.a.x) * d / length, z = road.a.z + (road.b.z - road.a.z) * d / length;
      return horizontal ? [x, z + side] : [x + side, z];
    };
    const clear = (x: number, z: number) => !main.some(other => other !== road && distanceToRoad({ x, z }, other) < other.width / 2 + 9) && !nearLot(x, z);
    for (let d = 16; d < length - 10; d += 35) {
      const [x, z] = point(d, 8);
      streetLamp(ctx, x, z, horizontal ? 0 : Math.PI / 2);
    }
    // Poles and their wires run down the far side of each street.
    let previous: readonly [THREE.Vector3, THREE.Vector3, THREE.Vector3] | undefined;
    for (let d = 20; d < length - 12; d += 36) {
      const [x, z] = point(d, -9.4);
      if (!clear(x, z) || layout.buildings.some(building => Math.abs(building.x - x) < building.w / 2 + 1.5 && Math.abs(building.z - z) < building.d / 2 + 1.5)) { previous = undefined; continue; }
      const tops = utilityPole(ctx, x, z, horizontal ? 0 : Math.PI / 2);
      if (previous) for (let i = 0; i < 3; i++) wire(ctx, previous[i], tops[i], .5 + i * .12);
      previous = tops;
    }
    // Pavement furniture sits on the slab between the kerb and the buildings.
    let item = Math.floor(rng() * 4);
    for (let d = 26; d < length - 22; d += 21 + rng() * 9) {
      const side = item % 2 ? 1 : -1, [x, z] = point(d, side * 7.6);
      if (!clear(x, z)) continue;
      const turn = (horizontal ? 0 : Math.PI / 2) + (side > 0 ? Math.PI : 0);
      const choice = item++ % 6;
      if (choice === 0) hydrant(ctx, x, z);
      else if (choice === 1) { const [bx, bz] = point(d, side * 8.2); bench(ctx, bx, bz, turn); }
      else if (choice === 2) trashCan(ctx, x, z, C.green);
      else if (choice === 3) mailbox(ctx, x, z, turn);
      else if (choice === 4) { newsBox(ctx, x, z, turn, C.oxide); const [nx, nz] = point(d + .6, side * 7.6); newsBox(ctx, nx, nz, turn, 0x2c5a8a); }
      else roadSign(ctx, x, z, turn + Math.PI, 'speed');
    }
    // Stop signs face traffic arriving at each end.
    for (const [end, d] of [[road.a, 8.4], [road.b, length - 8.4]] as const) {
      const toward = Math.atan2(-(end.x - (road.a.x + road.b.x) / 2), -(end.z - (road.a.z + road.b.z) / 2));
      const right = horizontal ? (end === road.a ? 6.4 : -6.4) : (end === road.a ? -6.4 : 6.4);
      const [x, z] = point(d, right);
      roadSign(ctx, x, z, toward + Math.PI, 'stop');
    }
  }

  // Painted route arrows and loop markers follow the exact test-drive route.
  function arrow(x: number, z: number, yaw: number) {
    const heading = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    // Paint the travel lane, clear of the dashed centre line and its junctions.
    x += right.x * 2.4; z += right.z * 2.4;
    b.box(flat.marking, x, .058, z, .36, .006, 3.4, { color: 0xe8ad4d, yaw, cast: false });
    for (const side of [-1, 1]) b.box(flat.marking, x + heading.x * 1.15 + right.x * side * .59, .058, z + heading.z * 1.15 + right.z * side * .59, .3, .006, 1.8, { color: 0xe8ad4d, yaw: yaw + side * .75, cast: false });
  }
  for (let i = 0; i < layout.loop.length - 1; i++) {
    const a = layout.loop[i], c = layout.loop[i + 1], length = Math.hypot(c.x - a.x, c.z - a.z);
    const yaw = Math.atan2(-(c.x - a.x), -(c.z - a.z));
    for (let d = 10; d < length - 6; d += 27) arrow(a.x + (c.x - a.x) * d / length, a.z + (c.z - a.z) * d / length, yaw);
  }
  // On the far corner of the junction, framed by the gate from the driveway: no board or floodlight mast stands in front of it there.
  postSign(ctx, 'TEST LOOP  →', -28.5, 51.2, 4.6, { sub: 'FOLLOW THE AMBER ARROWS', yaw: Math.PI });
  postSign(ctx, 'GARAGE  ←', -9, 49, 4, { sub: 'WILLOW CREEK SALVAGE' });
  const corners: Point[] = [layout.loop[2], layout.loop[3], layout.loop[4]];
  const cornerYaws = [-Math.PI / 2, Math.PI, Math.PI / 2];
  corners.forEach((corner, i) => postSign(ctx, `LOOP ${i + 1}/3`, corner.x + 8, corner.z + 8, 3.4, { sub: 'BACK TO THE GARAGE', yaw: cornerYaws[i] }));

  for (const lot of layout.lots) {
    if (lot.kind === 'fuel') fuelStation(ctx, lot, marks);
    else if (lot.kind === 'usedCars') carLot(ctx, lot, marks);
    else park(ctx, lot, plants);
  }
  waterTower(ctx);
  void clearGlass; void metal;
}

/** Yaw that turns a lot's local +z toward its street. */
const lotYaw = (lot: Lot) => Math.atan2(lot.face.x, lot.face.z);

function fuelStation(ctx: SceneContext, lot: Lot, marks: GroundMarks) {
  const { b } = ctx, yaw = lotYaw(lot), p = new Part(b, lot.x, 0, lot.z, yaw);
  const along = Math.max(lot.w, lot.d), depth = Math.min(lot.w, lot.d);
  p.box(surface('asphalt'), 0, .03, 0, along, .06, depth, { color: 0x4d4f51, cast: false });
  p.solid(0, .03, 0, along, .06, depth);
  // Apron out to the dropped kerbs.
  for (const f of [-.3, .3]) p.box(surface('asphalt', 'overlay'), along * f, .034, depth / 2 + 1.6, 7, .01, 3.4, { color: 0x4d4f51, cast: false });
  // Kiosk at the back of the lot.
  const kiosk = p.child(0, 0, -depth / 2 + 3.2);
  kiosk.box(surface('plaster'), 0, 1.7, 0, 9, 3.4, 5, { color: 0xe6dcc4, shade: .84 });
  kiosk.solid(0, 1.7, 0, 9, 3.4, 5);
  kiosk.box(flat.satin, 0, 3.5, 0, 9.6, .3, 5.6, { color: C.oxide });
  kiosk.box(flat.satin, 0, .5, 2.54, 9, 1, .08, { color: C.oxide });
  kiosk.box(windowGlass, -2.2, 1.9, 2.55, 3.6, 1.7, .06, { color: 0xffe6b8, cast: false, shade: .4 });
  kiosk.box(windowGlass, 2.6, 1.6, 2.55, 1, 2.2, .06, { color: 0xffe6b8, cast: false, shade: .4 });
  kiosk.box(flat.satin, 2.6, 1.6, 2.53, 1.2, 2.5, .06, { color: 0x2c3a40 });
  const [kx, kz] = kiosk.at(0, 2.6);
  sign(ctx, 'WILLOW FUEL', kx, 2.95, kz, 6, .6, { bg: '#7c4432', yaw, bare: true });
  const [unitX, unitZ] = kiosk.at(-2.5, -.5);
  airConditioner(ctx, unitX, 3.66, unitZ, yaw);
  // Canopy on four columns over two pump islands, lit from underneath.
  const canopy = p.child(0, 0, 3);
  for (const dx of [-5.5, 5.5]) for (const dz of [-2.4, 2.4]) {
    canopy.box(flat.satin, dx, 2.4, dz, .32, 4.8, .32, { color: 0xe9e6dc, shade: .8 });
    canopy.solid(dx, 1.4, dz, .4, 2.8, .4);
  }
  canopy.box(flat.satin, 0, 5.05, 0, 14.5, .5, 7.6, { color: 0xe9e6dc });
  canopy.box(flat.satin, 0, 5.05, 3.82, 14.6, .52, .06, { color: C.oxide });
  canopy.box(flat.satin, 0, 5.05, -3.82, 14.6, .52, .06, { color: C.oxide });
  for (const side of [-1, 1]) canopy.box(flat.satin, side * 7.28, 5.05, 0, .06, .52, 7.6, { color: C.oxide });
  for (const dx of [-4, 0, 4]) for (const dz of [-1.8, 1.8]) {
    canopy.box(lights.interior, dx, 4.78, dz, 1.6, .03, .5, { color: 0xc9d2de, cast: false });
    const [lx, lz] = canopy.at(dx, dz);
    lightPool(ctx, lx, lz, 3.6, C.lampCool, .34, .08);
  }
  const [cx, cz] = canopy.at(0, 0);
  ctx.lamps.push({ x: cx, y: 4.4, z: cz, color: C.lampCool, reach: 13 });
  for (const dx of [-3.2, 3.2]) {
    const island = canopy.child(dx, 0, 0);
    island.box(surface('concrete'), 0, .1, 0, 1.3, .2, 4.4, { color: 0xbdb9ad });
    island.solid(0, .5, 0, 1.3, 1, 4.4);
    for (const dz of [-1.1, 1.1]) {
      island.box(flat.satin, 0, .95, dz, .7, 1.5, .5, { color: C.oxide, shade: .8 });
      island.box(flat.satin, 0, 1.86, dz, .78, .34, .56, { color: 0xe9e6dc });
      island.box(lights.interior, 0, 1.3, dz + .26, .46, .3, .02, { color: 0xbfe6d8, cast: false });
      island.box(lights.interior, 0, 1.3, dz - .26, .46, .3, .02, { color: 0xbfe6d8, cast: false });
      island.beam(flat.rubber, [.36, 1.4, dz], [.5, .5, dz + .3], .02, { color: C.rubber, segments: 4 });
    }
    island.cyl(flat.satin, 0, .5, 2, .16, .8, { color: C.yellow, segments: 8 });
    island.cyl(flat.satin, 0, .5, -2, .16, .8, { color: C.yellow, segments: 8 });
    const [ox, oz] = island.at(1.6, .4);
    b.quad(marks.oil, ox, .07, oz, 2.2, 3.2, { yaw });
  }
  // Price pylon at the street edge.
  const pylon = p.child(along / 2 - 2, 0, depth / 2 - 1);
  pylon.box(flat.metal, 0, 3.2, 0, .3, 6.4, .3, { color: C.steelDark });
  pylon.solid(0, 1.4, 0, .4, 2.8, .4);
  const [px, pz] = pylon.at(0, .22), [qx, qz] = pylon.at(0, -.22);
  sign(ctx, 'FUEL', px, 5.6, pz, 2.6, 1.1, { style: 'neon', glow: C.neonAmber, yaw, bare: true });
  sign(ctx, 'FUEL', qx, 5.6, qz, 2.6, 1.1, { style: 'neon', glow: C.neonAmber, yaw: yaw + Math.PI, bare: true });
  pylon.box(flat.satin, 0, 5.6, 0, 2.8, 1.3, .36, { color: 0x1c2224 });
  sign(ctx, 'REG 1.19', px, 4.3, pz, 2.2, .7, { bg: '#1c2224', color: '#e3b449', yaw, bare: true });
  pylon.box(flat.satin, 0, 4.3, 0, 2.4, .9, .3, { color: 0x1c2224 });
  // A customer at the pump and the station's own pickup.
  const [customerX, customerZ] = canopy.at(-5.1, .3);
  placeCar(b, 'sedan', customerX, .06, customerZ, { tint: STREET_TINTS[6], yaw: yaw + Math.PI / 2, collide: true });
  const [tx, tz] = p.at(-along / 2 + 2.4, -depth / 2 + 3.4);
  placeCar(b, 'pickup', tx, .06, tz, { tint: STREET_TINTS[0], yaw: yaw + .1, collide: true });
  // Air line, oil rack and bin.
  const [bx, bz] = p.at(along / 2 - 2.2, -depth / 2 + 5);
  trashCan(ctx, bx, bz, C.oxide);
  const rack = p.child(6, 0, -depth / 2 + 5.9);
  rack.box(flat.metal, 0, .7, 0, 1.4, 1.4, .4, { color: C.steelDark });
  for (let i = 0; i < 6; i++) rack.cyl(flat.satin, -.5 + (i % 3) * .5, .5 + Math.floor(i / 3) * .56, .05, .12, .34, { color: [C.yellow, 0x2c5a8a, C.oxide][i % 3], segments: 8 });
}

function carLot(ctx: SceneContext, lot: Lot, marks: GroundMarks) {
  const { b, rng } = ctx, yaw = lotYaw(lot), p = new Part(b, lot.x, 0, lot.z, yaw);
  const along = Math.max(lot.w, lot.d), depth = Math.min(lot.w, lot.d);
  p.box(surface('gravel'), 0, .03, 0, along, .06, depth, { color: 0xa39780, cast: false });
  p.solid(0, .03, 0, along, .06, depth);
  // Sales hut.
  const hut = p.child(-along / 2 + 3.4, 0, -depth / 2 + 2.6);
  hut.box(surface('wood'), 0, 1.5, 0, 5, 3, 3.6, { color: 0xe2d8bf, shade: .82 });
  hut.solid(0, 1.5, 0, 5, 3, 3.6);
  hut.box(surface('roof'), 0, 3.12, 0, 5.6, .14, 4.3, { color: 0x7a3f34, pitch: .06 });
  hut.box(windowGlass, .9, 1.7, 1.83, 2, 1.1, .06, { color: 0xffd9a0, cast: false });
  hut.box(flat.satin, -1.5, 1.2, 1.83, .95, 2.2, .06, { color: C.oxide });
  const [hx, hz] = hut.at(0, 1.9);
  sign(ctx, 'SECOND CHANCE MOTORS', hx, 2.7, hz, 4.6, .5, { bg: '#7c4432', yaw, bare: true });
  // A front row of cars for sale, each with a price card in the screen.
  const styles: BodyStyle[] = ['coupe', 'sedan', 'wagon', 'compact', 'pickup', 'sedan'];
  const count = Math.floor((along - 4) / 3.4);
  for (let i = 0; i < count; i++) {
    const dx = -along / 2 + 3 + i * 3.4, [cx, cz] = p.at(dx, depth / 2 - 3.6);
    placeCar(b, styles[i % styles.length], cx, .06, cz, { tint: STREET_TINTS[(i * 5 + 4) % STREET_TINTS.length], yaw: yaw + Math.PI + (rng() - .5) * .08, collide: true });
    const [sx, sz] = p.at(dx, depth / 2 - 1.1);
    sign(ctx, `$${(1.4 + ((i * 7) % 9) * .45).toFixed(1)}K`, sx, .62, sz, .9, .5, { style: 'plank', bg: '#e8dcc0', color: '#a63e2e', yaw, bare: true });
    b.box(surface('wood'), sx - Math.sin(yaw) * .05, .34, sz - Math.cos(yaw) * .05, .06, .68, .06, { color: C.woodDark });
  }
  for (let i = 0; i < 3; i++) {
    const [cx, cz] = p.at(along / 2 - 3 - i * 3.6, -depth / 2 + 3.2);
    placeCar(b, styles[(i + 2) % styles.length], cx, .06, cz, { tint: STREET_TINTS[(i * 3 + 1) % STREET_TINTS.length], yaw: yaw + Math.PI / 2 + (rng() - .5) * .1, collide: true });
    b.quad(marks.oil, cx, .07, cz, 2, 3, { yaw });
  }
  // Bunting between four poles, the unmistakable sign of a used-car lot.
  const poles = [[-along / 2 + .6, depth / 2 - .6], [along / 2 - .6, depth / 2 - .6], [along / 2 - .6, -depth / 2 + .6], [-along / 2 + 7, -depth / 2 + .6]];
  const tops = poles.map(([dx, dz]) => {
    p.cyl(flat.metal, dx, 2.6, dz, .06, 5.2, { color: 0xe9e6dc, segments: 6 });
    p.solid(dx, 1.4, dz, .2, 2.8, .2);
    return p.point(dx, 5.1, dz);
  });
  const flags = [0xb8322a, 0xe3b449, 0x2c5a8a, 0xe9e6dc, 0x345d43];
  for (let i = 0; i < tops.length; i++) {
    const from = tops[i], to = tops[(i + 1) % tops.length], steps = Math.round(from.distanceTo(to) / .7);
    for (let s = 0; s < steps; s++) {
      const t = (s + .5) / steps, point = from.clone().lerp(to, t);
      point.y -= Math.sin(t * Math.PI) * 1.1;
      b.box(flat.sheet, point.x, point.y - .16, point.z, .3, .34, .02, { color: flags[s % flags.length], yaw: Math.atan2(to.x - from.x, to.z - from.z) + Math.PI / 2, roll: .12 * Math.sin(s), cast: false });
    }
    wire(ctx, from, to, 1.1);
  }
  const [lx, lz] = p.at(0, depth / 2 - 3.6);
  ctx.lamps.push({ x: lx, y: 4.6, z: lz, color: C.lampWarm, reach: 20 });
  lightPool(ctx, lx, lz, 9, C.lampWarm, .6, .08);
}

function park(ctx: SceneContext, lot: Lot, plants: Vegetation) {
  const { b, rng } = ctx, yaw = lotYaw(lot), p = new Part(b, lot.x, 0, lot.z, yaw);
  const along = Math.max(lot.w, lot.d), depth = Math.min(lot.w, lot.d);
  p.box(surface('grass', 'overlay'), 0, .012, 0, along, .02, depth, { color: C.grassLush, cast: false });
  // Crossing gravel paths meet at a bandstand.
  p.box(surface('gravel', 'overlay'), 0, .03, 0, 2.2, .02, depth, { color: 0xb8ab90, cast: false });
  p.box(surface('gravel', 'overlay'), 0, .03, 0, along, .02, 2.2, { color: 0xb8ab90, cast: false });
  const stand = p.child(0, 0, 0);
  stand.cyl(surface('wood'), 0, .11, 0, 3.4, .22, { color: 0xb9a888, segments: 8 });
  for (let i = 0; i < 8; i++) {
    const angle = i / 8 * Math.PI * 2 + Math.PI / 8, dx = Math.cos(angle) * 3.1, dz = Math.sin(angle) * 3.1;
    stand.cyl(flat.satin, dx, 1.9, dz, .09, 3.4, { color: 0xf0ead8, segments: 6 });
    const next = (i + 1) / 8 * Math.PI * 2 + Math.PI / 8;
    if (i !== 1 && i !== 5) stand.beam(flat.satin, [dx, 1, dz], [Math.cos(next) * 3.1, 1, Math.sin(next) * 3.1], .04, { color: 0xf0ead8, segments: 4 });
  }
  stand.cyl(surface('roof'), 0, 4.3, 0, 3.9, 1.6, { taper: .08, color: 0x5a6a52, segments: 8 });
  stand.cyl(flat.metal, 0, 5.3, 0, .06, .6, { color: C.steelDark, segments: 5 });
  stand.cyl(lights.interior, 0, 3.5, 0, .26, .16, { color: C.lampWarm, segments: 8, cast: false });
  const [sx, sz] = stand.at(0, 0);
  // Low enough to step onto.
  ctx.b.solidCylinder(sx, .11, sz, 3.4, .22);
  ctx.lamps.push({ x: sx, y: 3.3, z: sz, color: C.lampWarm, reach: 14 });
  lightPool(ctx, sx, sz, 7.5, C.lampWarm, .8, .26);
  // Benches along the paths, a hedge on the three sides away from the street, flower beds at the corners.
  for (const [dx, dz, turn] of [[-5.5, 1.9, Math.PI], [5.5, -1.9, 0], [1.9, 6, -Math.PI / 2], [-1.9, -6, Math.PI / 2]] as const) {
    const [bx, bz] = p.at(dx, dz);
    bench(ctx, bx, bz, yaw + turn);
  }
  for (const side of [-1, 1]) {
    const [hx, hz] = p.at(side * (along / 2 - .5), 0);
    plants.hedge(hx, hz, depth - 2, yaw + Math.PI / 2, 1);
  }
  const [hx, hz] = p.at(0, -depth / 2 + .5);
  plants.hedge(hx, hz, along - 2, yaw, 1);
  for (const [dx, dz] of [[-along / 2 + 4, depth / 2 - 4], [along / 2 - 4, depth / 2 - 4], [-along / 2 + 4, -depth / 2 + 4], [along / 2 - 4, -depth / 2 + 4]]) {
    const [tx, tz] = p.at(dx, dz);
    plants.tree(tx, tz, 6.4 + rng() * 2, 2.5 + rng() * .5, 'round');
    for (let i = 0; i < 14; i++) {
      const [fx, fz] = p.at(dx + (rng() - .5) * 5, dz + (rng() - .5) * 5);
      plants.tuft(fx, .02, fz, .3 + rng() * .2, [0xd9a43a, 0xc9584a, 0xe9e6dc, 0x8f7ab8][i % 4]);
    }
  }
  const [gx, gz] = p.at(along / 2 - 2, depth / 2 + .6);
  sign(ctx, 'WILLOW CREEK GREEN', gx, 1.2, gz, 3.6, .7, { bg: '#345d43', yaw });
  for (const dx of [-1.5, 1.5]) { const [qx, qz] = p.at(along / 2 - 2 + dx, depth / 2 + .56); b.cylinder(flat.metal, qx, .6, qz, .05, 1.2, { color: C.steelDark, segments: 6 }); }
}

function waterTower(ctx: SceneContext) {
  const { b, layout } = ctx, { x: tx, z: tz } = layout.landmark;
  const steel = surface('metal');
  for (const dx of [-3.6, 3.6]) for (const dz of [-3.6, 3.6]) {
    b.box(flat.metal, tx + dx, 9, tz + dz, .45, 18, .45, { color: 0x4a5250, collide: true, shade: .8 });
    b.box(surface('concrete'), tx + dx, .3, tz + dz, 1.3, .6, 1.3, { color: C.concrete });
  }
  for (const y of [4, 9, 14]) {
    for (const s of [-1, 1]) {
      b.box(flat.metal, tx, y, tz + s * 3.6, 7.5, .25, .25, { color: 0x7d8683 });
      b.box(flat.metal, tx + s * 3.6, y, tz, .25, .25, 7.5, { color: 0x7d8683 });
    }
    for (const side of [-1, 1]) for (const flip of [-1, 1]) {
      b.beam(flat.metal, new THREE.Vector3(tx - 3.6 * flip, y - 3.6, tz + side * 3.6), new THREE.Vector3(tx + 3.6 * flip, y, tz + side * 3.6), .055, { color: 0x7d8683 });
      b.beam(flat.metal, new THREE.Vector3(tx + side * 3.6, y - 3.6, tz - 3.6 * flip), new THREE.Vector3(tx + side * 3.6, y, tz + 3.6 * flip), .055, { color: 0x7d8683 });
    }
  }
  const profile = [[0, 14.7], [2.8, 14.9], [4.8, 15.5], [5.35, 16.1], [5.4, 16.3], [5.4, 21.45], [5.15, 21.85], [4.6, 22.2], [3, 22.65], [0, 22.9]].map(([r, y]) => new THREE.Vector2(r, y));
  b.geometry(steel, new THREE.LatheGeometry(profile, 48), tx, 0, tz, { color: 0xb9cbc4, global: true });
  b.solidCylinder(tx, 18.8, tz, 5.4, 5.5);
  const ring = new THREE.TorusGeometry(5.43, .055, 6, 48); ring.rotateX(Math.PI / 2);
  for (const y of [16.35, 18.9, 21.4]) b.geometry(flat.metal, ring, tx, y, tz, { color: 0x7d8683 });
  const rail = new THREE.TorusGeometry(5.65, .04, 6, 48); rail.rotateX(Math.PI / 2);
  for (const y of [16, 16.7]) b.geometry(flat.metal, rail, tx, y, tz, { color: 0x3a4446 });
  for (let i = 0; i < 24; i++) { const angle = i * Math.PI / 12; b.cylinder(flat.metal, tx + Math.cos(angle) * 5.65, 16.36, tz + Math.sin(angle) * 5.65, .035, .9, { color: 0x3a4446, segments: 5 }); }
  b.cylinder(flat.metal, tx, 23.1, tz, .42, .45, { color: 0x7d8683, segments: 10 });
  // An aircraft warning lamp marks the tower after dark, visible from the yard.
  b.cylinder(lights.neon, tx, 23.5, tz, .16, .3, { color: C.neonRed, segments: 8, cast: false });
  const lettering = createTankLettering(); lettering.position.set(tx, 19.3, tz); ctx.root.add(lettering);
  for (let y = 0; y < 16; y += .45) b.box(flat.metal, tx - 3.85, y, tz - 3.7, .75, .06, .12, { color: 0x7d8683, cast: false });
  for (const x of [tx - 4.22, tx - 3.48]) b.box(flat.metal, x, 8, tz - 3.7, .055, 16.8, .07, { color: 0x3a4446 });
  // Rust runs down from the seam.
  for (let i = 0; i < 9; i++) { const angle = i * .7 + .3; b.box(flat.marking, tx + Math.cos(angle) * 5.42, 17.6, tz + Math.sin(angle) * 5.42, .28, 2.4 + (i % 3) * .5, .02, { color: 0x8a5a3c, yaw: -angle + Math.PI / 2, cast: false }); }
}
