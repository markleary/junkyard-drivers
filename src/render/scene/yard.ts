import * as THREE from 'three';
import { flat, lights } from '../materials';
import { surface } from '../surfaces';
import { createEngineModel, createPaintCan, createWheelModel } from '../parts';
import { BODY_STYLES, WRECK_TINTS, carBody, placeCar } from '../wrecks';
import type { Vegetation } from '../vegetation';
import { getPartsForSale } from '../../game/catalog';
import { YARD_BOUNDS } from '../../world/layout';
import { BALES, CAR_STACKS, CONTAINERS, CRANE, CRUSHER, DONORS, FLOODLIGHTS, HEAPS, OFFICE, TIRE_WALL } from '../../world/yard';
import { C, Part, carStack, container, crate, dumpster, floodlight, lightPool, oilDrum, pallet, postSign, sign, tireStack, trafficCone, type SceneContext } from './kit';
import type { GroundMarks } from './ground';

export const RACKS = [
  { id: 'rack-engines', z: 2, name: 'ENGINES', subtitle: 'I4 / V8 / V12' },
  { id: 'rack-wheels', z: 8, name: 'WHEELS', subtitle: 'STREET / SPORT' },
  { id: 'rack-paint', z: 14, name: 'PAINT', subtitle: 'A FRESH START' },
];

/** The salvage yard: fence and gate, the three racks, and the sorted back lot. */
export function buildYard(ctx: SceneContext, plants: Vegetation, marks: GroundMarks) {
  const { b, rng } = ctx;
  const corrugated = surface('corrugated'), rust = surface('rust'), metal = surface('metal'), wood = surface('wood');
  const tire = new THREE.TorusGeometry(.36, .13, 8, 18);
  const wreck = (style: number, x: number, y: number, z: number, yaw: number, squash: number, roll: number, pitch: number) =>
    placeCar(b, BODY_STYLES[style % BODY_STYLES.length], x, y, z, { tint: WRECK_TINTS[Math.floor(rng() * WRECK_TINTS.length)], yaw, squash, roll, pitch, wreck: true });

  // Perimeter: overlapping corrugated sheets on steel posts. One collider per run, as before.
  const sheetTints = [0x9aa09a, 0x8d948f, 0xa39c8c, 0x86837a, 0x9a8a78, 0x7f8a88];
  function fence(ax: number, az: number, bx: number, bz: number) {
    const length = Math.hypot(bx - ax, bz - az), horizontal = az === bz;
    b.solidBox((ax + bx) / 2, 1.1, (az + bz) / 2, horizontal ? length : .14, 2.2, horizontal ? .14 : length);
    const panels = Math.ceil(length / 2.05);
    for (let i = 0; i < panels; i++) {
      const t = (i + .5) / panels, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      const width = length / panels + .06, height = 2.1 + rng() * .22, lean = (rng() - .5) * .03;
      // Every so often a sheet has been replaced with a rustier one.
      const tint = rng() > .84 ? C.rust : sheetTints[Math.floor(rng() * sheetTints.length)];
      b.box(corrugated, x, height / 2 + .04, z, horizontal ? width : .05, height, horizontal ? .05 : width, { color: tint, shade: .74, roll: horizontal ? 0 : lean, pitch: horizontal ? lean : 0 });
    }
    for (let d = 0; d <= length + .01; d += 4.1) {
      const x = ax + (bx - ax) * Math.min(1, d / length), z = az + (bz - az) * Math.min(1, d / length);
      b.box(flat.metal, x, 1.25, z, .11, 2.5, .11, { color: C.steelDark });
    }
    b.box(flat.metal, (ax + bx) / 2, 2.02, (az + bz) / 2 + (horizontal ? -.06 : 0), horizontal ? length : .06, .07, horizontal ? .06 : length, { color: C.steelDark });
    b.box(flat.metal, (ax + bx) / 2, .5, (az + bz) / 2 + (horizontal ? -.06 : 0), horizontal ? length : .06, .07, horizontal ? .06 : length, { color: C.steelDark });
  }
  fence(YARD_BOUNDS.minX, YARD_BOUNDS.minZ, YARD_BOUNDS.maxX, YARD_BOUNDS.minZ);
  fence(YARD_BOUNDS.minX, YARD_BOUNDS.minZ, YARD_BOUNDS.minX, YARD_BOUNDS.maxZ);
  fence(YARD_BOUNDS.maxX, YARD_BOUNDS.minZ, YARD_BOUNDS.maxX, YARD_BOUNDS.maxZ);
  fence(YARD_BOUNDS.minX, 30, -27, 30); fence(-13, 30, YARD_BOUNDS.maxX, 30);

  // Gate: braced steel posts, a truss carrying the yard name, lamps, and the leaves rolled back along the fence.
  for (const x of [-27, -13]) {
    b.box(flat.satin, x, 2.8, 30, .3, 5.6, .3, { color: 0x4a5753, collide: true, shade: .8 });
    b.box(surface('concrete'), x, .2, 30, .7, .4, .7, { color: C.concrete });
    b.box(flat.metal, x, 5.2, 30.34, .2, .22, .5, { color: C.steelDark });
    b.box(lights.lamp, x, 5.08, 30.5, .3, .1, .3, { color: C.sodium, cast: false });
    ctx.lamps.push({ x, y: 5, z: 31.2, color: C.sodium, reach: 16 });
  }
  for (const y of [5.6, 4.35]) b.box(flat.satin, -20, y, 30, 14.3, .14, .2, { color: 0x4a5753 });
  for (let i = 0; i < 14; i++) {
    const x = -26.5 + i, lean = i % 2 ? 1 : -1;
    b.beam(flat.satin, new THREE.Vector3(x - .5 * lean, 4.4, 30), new THREE.Vector3(x + .5 * lean, 5.56, 30), .03, { color: 0x4a5753, segments: 4 });
  }
  sign(ctx, 'JUNKYARD DRIVERS', -20, 5, 30.2, 12.5, 1.4, { sub: 'SECOND CHANCES. FIRST DRIVES.' });
  sign(ctx, 'JUNKYARD DRIVERS', -20, 5, 29.8, 12.5, 1.4, { sub: 'SECOND CHANCES. FIRST DRIVES.', yaw: Math.PI });
  for (const side of [-1, 1]) {
    const leaf = new Part(b, -20 + side * 10.6, 0, 29.72, 0);
    leaf.box(flat.metal, 0, 1.2, 0, 6.6, .08, .06, { color: C.steelDark });
    for (const y of [.2, 2.2]) leaf.box(flat.metal, 0, y, 0, 6.6, .09, .07, { color: C.steelDark });
    for (let i = 0; i <= 6; i++) leaf.box(flat.metal, -3.3 + i * 1.1, 1.2, 0, .07, 2.05, .06, { color: C.steelDark });
    leaf.box(corrugated, 0, 1.2, .02, 6.5, 1.9, .03, { color: side > 0 ? 0x7f8a88 : 0x9a8a78, shade: .8 });
    leaf.cyl(flat.rubber, -2.6, .1, 0, .1, .07, { roll: Math.PI / 2, color: C.rubber, segments: 8 });
    leaf.cyl(flat.rubber, 2.6, .1, 0, .1, .07, { roll: Math.PI / 2, color: C.rubber, segments: 8 });
  }
  // Painted notices on the outside of the fence give the place a voice.
  sign(ctx, 'WE BUY SCRAP', -6.5, 1.5, 30.12, 3, .9, { style: 'plank', bg: '#d9c89c', color: '#7a2b20', bare: true });
  sign(ctx, 'CARS WANTED · ANY CONDITION', -33.6, 1.45, 30.12, 6.4, .8, { style: 'plank', bg: '#c9b88c', color: '#273a36', bare: true });

  postSign(ctx, 'PARTS  ←', -31, 21, 5, { sub: 'ENGINES · WHEELS · PAINT' });
  postSign(ctx, 'GARAGE  ↑', -11, 19, 4.5, { sub: 'YOUR NEXT CHAPTER' });
  postSign(ctx, 'NEW PARTS  ↑', -10, 28, 5.6, { sub: 'WALK THROUGH THE GATE · HOLLOWAY AUTO', yaw: Math.PI });
  postSign(ctx, 'SALVAGE AISLES', -46, 22, 6.5, { sub: 'BODY PANELS · SCRAP METAL · DONOR CARS' });
  postSign(ctx, 'ROW 04', -51.3, -31, 3.1, { sub: 'SORTED METAL' });

  // Three open racks; one interaction opens each clearly labelled stock category.
  for (const rack of RACKS) {
    b.solidBox(-37.5, .85, rack.z, 2.4, 1.7, 4.4);
    const frame = new Part(b, -37.5, 0, rack.z);
    for (const dx of [-1.1, 1.3]) for (const dz of [-2.2, 2.2]) frame.box(flat.metal, dx, 1.25, dz, .1, 2.5, .1, { color: C.steelDark });
    frame.box(corrugated, -1.17, 1.05, 0, .06, 1.9, 4.4, { color: 0x8d948f, shade: .8 });
    for (const y of [.2, 1, 1.8]) {
      frame.box(wood, .1, y, 0, 2.7, .08, 4.6, { color: C.woodPale });
      frame.box(flat.metal, 1.36, y - .01, 0, .06, .1, 4.6, { color: C.oxide });
    }
    // A sloped tin roof keeps the weather off the stock.
    frame.box(corrugated, -.14, 2.64, 0, 2.76, .05, 5, { color: 0x8a6a52, roll: -.09 });
    for (const dz of [-2.2, 2.2]) frame.beam(flat.metal, [-1.1, 2.5, dz], [1.3, 1.9, dz], .03, { color: C.steelDark, segments: 4 });
    sign(ctx, rack.name, -35.98, 2.32, rack.z, 4, .75, { yaw: Math.PI / 2, sub: rack.subtitle });
    if (rack.id === 'rack-engines') {
      for (const [i, family] of (['i4', 'v8', 'v12'] as const).entries()) for (const y of [.26, 1.06]) {
        b.model(createEngineModel(family, { condition: 'salvage', performance: y > 1 }), -36.8, y, rack.z - 1.4 + i * 1.4, Math.PI / 2, .76);
      }
    } else if (rack.id === 'rack-wheels') {
      for (let i = 0; i < 4; i++) for (const y of [.26, 1.06]) b.model(createWheelModel(y > 1 ? 'sport' : 'street', { condition: 'salvage' }), -36.6, y, rack.z - 1.4 + i * .93, Math.PI / 2, .9);
    } else {
      const paints = getPartsForSale('yard', 'paint');
      for (const [i, paint] of paints.entries()) for (const y of [.26, 1.06]) b.model(createPaintCan(paint.color!, paint.name, { condition: 'salvage' }), -36.7, y, rack.z - 1.5 + i * 3 / Math.max(1, paints.length - 1), Math.PI / 2);
    }
    ctx.interactables.push({ id: rack.id, kind: 'rack', position: new THREE.Vector3(-35.8, 1.3, rack.z), label: rack.name.toLowerCase() });
  }
  // Tire walls behind the racks.
  for (let z = TIRE_WALL.zFrom; z <= TIRE_WALL.zTo; z += .92) tireStack(ctx, TIRE_WALL.x + (rng() - .5) * .12, z, 4 + Math.floor(rng() * 4), tire);

  // Scrap row: baled sheet that screens the rare find from the yard. Colliders match the first build.
  for (let i = 0; i < 3; i++) {
    const x = -39 + i * 3.5, yaw = .08 * (i - 1);
    b.box(rust, x, .5, -10.2, 3.3, 1, 3.1, { color: i % 2 ? C.rustLight : C.rust, collide: true, yaw, shade: .7 });
    b.box(rust, x + .25, 1.35, -10.4, 2.8, .7, 2.6, { color: i % 2 ? C.rust : 0x7d5a44, collide: true, yaw: -.15, shade: .8 });
    for (let j = 0; j < 4; j++) b.box(corrugated, x - 1 + j * .65, 1.76, -10.4, .5, .08, 2.3, { color: j % 2 ? 0x86837a : C.rustLight, yaw: .1 + j * .05, roll: (rng() - .5) * .2 });
    for (let j = 0; j < 3; j++) b.box(surface('corrugated', 'double'), x + (rng() - .5) * 2.4, 1.92 + j * .09, -10.2 + (rng() - .5), 1.6 + rng(), .03, .9 + rng() * .5, { color: sheetTints[(i + j) % sheetTints.length], yaw: rng() * 3, roll: (rng() - .5) * .3 });
    b.instance(tire, flat.rubber, x + .9, 1.86, -9.2, { pitch: Math.PI / 2, color: 0x3b3e3d });
    b.beam(flat.metal, new THREE.Vector3(x - 1.5, 1.2, -8.7), new THREE.Vector3(x + 1.1, 2.3, -11.4), .05, { color: C.rustDark });
  }
  // Row 03: engine crates and steel bins, each weighted down with a tire.
  for (let i = 0; i < 7; i++) {
    const z = -28 + i * 2.4, yaw = (rng() - .5) * .3;
    b.solidBox(-43, .4, z, 1.3, .8, 1.8, { yaw });
    if (i % 2) crate(ctx, -43, 0, z, 1.25, yaw, i % 4 === 1 ? C.woodPale : C.wood);
    else {
      b.box(metal, -43, .4, z, 1.3, .8, 1.8, { color: i % 4 ? 0x6f7f84 : C.oxide, yaw, shade: .72 });
      b.box(flat.metal, -43, .81, z, 1.36, .05, 1.86, { color: C.steelDark, yaw });
    }
    b.instance(tire, flat.rubber, -42.9, i % 2 ? 1.38 : .98, z, { pitch: Math.PI / 2, color: 0x3b3e3d });
  }
  sign(ctx, 'SALVAGE / ROW 03', -40, 2.5, -29.8, 3.6, .7, { bg: '#604c3c' });
  // The rare find sits in uncut grass, as if nobody has been back here for years.
  for (let i = 0; i < Math.round(46 * Math.max(.3, ctx.quality.density)); i++) {
    const angle = rng() * Math.PI * 2, radius = 1.2 + rng() * 3.4;
    const x = -38 + Math.cos(angle) * radius * .9, z = -23 + Math.sin(angle) * radius * 1.25;
    if (x < -41.4 || x > -30 || z < -28.5 || z > -12.5) continue;
    plants.tuft(x, .01, z, .5 + rng() * .5, rng() > .5 ? 0x9c9a52 : 0x7d8f3e);
  }
  b.quad(marks.leaves, -37, .034, -24.6, 5, 4, { yaw: .4 });

  // Shell stacks, freight boxes and the baling yard.
  for (const spot of CAR_STACKS) carStack(ctx, spot.x, spot.z, spot.yaw, spot.count, wreck);
  for (const spot of CONTAINERS) container(ctx, spot.x, spot.tier * 2.6, spot.z, spot.yaw + (spot.tier ? .03 : 0), spot.color);
  for (const heap of HEAPS) {
    // A tapered convex proxy matches the solid core; the loose edge stays walkable.
    const points: number[] = [];
    for (const [y, scale] of [[.03, .46], [heap.height * .57, .3]]) for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      points.push(Math.cos(angle) * heap.w * scale, y, Math.sin(angle) * heap.d * scale);
    }
    points.push(0, heap.height, 0);
    b.solidHull(new Float32Array(points), heap.x, 0, heap.z);
    const pieces = Math.round(22 + heap.w * heap.d * .18);
    for (let i = 0; i < pieces; i++) {
      const angle = rng() * Math.PI * 2, spread = Math.sqrt(rng()) * .44;
      const px = heap.x + Math.cos(angle) * heap.w * spread, pz = heap.z + Math.sin(angle) * heap.d * spread;
      const mound = Math.max(.12, 1 - spread * 2.1), y = heap.height * mound * (.3 + rng() * .7);
      if (i % 5 === 0) wreck(Math.floor(rng() * 6), px, y * .7, pz, rng() * 6, .45 + rng() * .25, (rng() - .5) * .9, (rng() - .5) * .5);
      else if (i % 5 === 1) b.box(rust, px, y + .2, pz, .9 + rng() * 1.3, .3 + rng() * .5, .8 + rng() * 1.1, { color: WRECK_TINTS[i % WRECK_TINTS.length], yaw: rng() * 6, pitch: (rng() - .5) * .8, roll: (rng() - .5) * .8, shade: .75 });
      else b.box(surface('corrugated', 'double'), px, y + .35, pz, 1.3 + rng() * 1.6, .035, .8 + rng() * 1.2, { color: sheetTints[i % sheetTints.length], yaw: rng() * 6, pitch: (rng() - .5) * .9, roll: (rng() - .5) * .7 });
      if (i % 4 === 0) b.beam(flat.metal, new THREE.Vector3(px - .9, y + .2, pz - .5), new THREE.Vector3(px + 1.2, y + .9, pz + .5), .05, { color: C.rustDark });
    }
    for (let i = 0; i < 8; i++) b.instance(tire, flat.rubber, heap.x + (rng() - .5) * heap.w * .8, .15 + rng() * heap.height * .45, heap.z + (rng() - .5) * heap.d * .8, { pitch: rng() * 3, yaw: rng() * 3, roll: rng() * 3, color: 0x1b1d1c, scale: 1.1 });
    for (let i = 0; i < 10; i++) plants.tuft(heap.x + (rng() - .5) * heap.w, .01, heap.z + (rng() - .5) * heap.d, .3 + rng() * .3, 0x9c9a52);
  }
  for (const donor of DONORS) {
    placeCar(b, BODY_STYLES[donor.style], donor.x, .02, donor.z, { tint: donor.tint, yaw: donor.yaw, wreck: true, wheels: donor.wheels, collide: true });
    b.quad(marks.oil, donor.x, .036, donor.z, 2.2, 3.6, { yaw: donor.yaw });
    for (let i = 0; i < 5; i++) plants.tuft(donor.x + (rng() - .5) * 2.6, .01, donor.z + (rng() - .5) * 4.6, .35 + rng() * .3);
  }

  // Gantry crane with a shell on the magnet. The hook sways gently in the wind.
  const crane = new Part(b, CRANE.x, 0, CRANE.z);
  for (const [dx, dz] of CRANE.legs) {
    crane.box(flat.metal, dx, CRANE.height / 2, dz, .34, CRANE.height, .34, { color: C.yellow, shade: .72 });
    crane.box(surface('concrete'), dx, .18, dz, .9, .36, .9, { color: C.concrete });
    crane.solid(dx, 1.4, dz, .5, 2.8, .5);
  }
  for (const dz of [-2.2, 2.2]) {
    crane.box(flat.metal, 0, CRANE.height, dz, CRANE.span + .6, .5, .34, { color: C.yellow });
    for (let i = 0; i < 6; i++) crane.beam(flat.metal, [-6.5 + i * 2.17, CRANE.height - .2, dz], [-6.5 + (i + 1) * 2.17, CRANE.height - 1.3, dz], .05, { color: C.yellow, segments: 4 });
    crane.box(flat.metal, 0, CRANE.height - 1.3, dz, CRANE.span, .12, .12, { color: C.yellow });
  }
  for (const dx of [-6.5, 6.5]) {
    crane.box(flat.metal, dx, CRANE.height, 0, .34, .4, 4.6, { color: C.yellow });
    crane.beam(flat.metal, [dx, 3.2, -2.2], [dx, CRANE.height - .4, 2.2], .05, { color: C.steelDark, segments: 4 });
    crane.beam(flat.metal, [dx, 3.2, 2.2], [dx, CRANE.height - .4, -2.2], .05, { color: C.steelDark, segments: 4 });
  }
  crane.box(flat.metal, 1.5, CRANE.height + .42, 0, 1.6, .5, 4.9, { color: C.steelDark });
  crane.box(flat.satin, 1.5, CRANE.height + .9, 1.2, 1.3, .9, 1.4, { color: C.oxide });
  // Black and yellow chevrons on the legs mark the working area.
  for (const [dx, dz] of CRANE.legs) for (let i = 0; i < 3; i++) crane.box(flat.marking, dx, .7 + i * .34, dz, .36, .12, .36, { color: C.black });
  const hook = new THREE.Group();
  hook.position.set(CRANE.x + 1.5, CRANE.height + .2, CRANE.z);
  const hookMetal = new THREE.MeshStandardMaterial({ color: 0x2f3638, roughness: .5, metalness: .7 });
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, 3.2, 5), hookMetal);
  cable.position.y = -1.6;
  const magnet = new THREE.Mesh(new THREE.CylinderGeometry(.85, .95, .34, 20), new THREE.MeshStandardMaterial({ color: 0x4a4f4c, roughness: .6, metalness: .6 }));
  magnet.position.y = -3.3;
  hook.add(cable, magnet);
  hook.traverse(object => { object.castShadow = true; });
  ctx.root.add(hook);
  // The lifted shell is its own small mesh so it can move with the hook.
  {
    const body = new THREE.Group();
    const carried = BODY_STYLES[1];
    const shell = new THREE.Mesh(carBody(carried).worn, flat.matte);
    const trim = new THREE.Mesh(carBody(carried).trim, flat.matte);
    const tint = new THREE.Color(0x53707e);
    const colors = shell.geometry.getAttribute('color').clone() as THREE.BufferAttribute;
    for (let i = 0; i < colors.count; i++) colors.setXYZ(i, colors.getX(i) * tint.r, colors.getY(i) * tint.g, colors.getZ(i) * tint.b);
    shell.geometry = shell.geometry.clone(); shell.geometry.setAttribute('color', colors);
    body.add(shell, trim);
    body.position.y = -4.72; body.rotation.y = .4;
    body.traverse(object => { object.castShadow = true; });
    hook.add(body);
  }
  ctx.animated.push(seconds => {
    hook.rotation.z = Math.sin(seconds * .55) * .035;
    hook.rotation.x = Math.sin(seconds * .41 + 1.3) * .028;
  });
  // The pile it is feeding.
  for (let i = 0; i < 7; i++) wreck(Math.floor(rng() * 6), CRANE.x - 2 + (rng() - .5) * 5, i < 4 ? 0 : .7, CRANE.z + (rng() - .5) * 2.6, rng() * 6, .5 + rng() * .3, (rng() - .5) * .5, (rng() - .5) * .3);
  b.solidBox(CRANE.x - 2, .7, CRANE.z, 6.4, 1.4, 3.4);

  // Baling press: an open steel frame, two rams, and a car half way to becoming a cube.
  const press = new Part(b, CRUSHER.x, 0, CRUSHER.z, CRUSHER.yaw);
  press.box(surface('concrete'), 0, .12, 0, CRUSHER.w + .6, .24, CRUSHER.d + .6, { color: C.concrete });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) press.box(flat.metal, sx * 1.95, 1.7, sz * 1.35, .3, 3.2, .3, { color: C.oxide, shade: .72 });
  press.box(flat.metal, 0, 3.2, 0, 4.4, .5, 3.2, { color: C.oxide });
  press.box(flat.metal, 0, 2.2, 0, 3.5, .34, 2.4, { color: C.steelDark });
  for (const dx of [-.9, .9]) press.cyl(flat.chrome, dx, 2.72, 0, .13, .9, { color: 0xc8cdc9, segments: 10 });
  for (const sx of [-1, 1]) press.box(metal, sx * 2.02, 1.2, 0, .08, 1.9, 2.4, { color: 0x86837a });
  press.box(flat.satin, 2.5, 1.1, 1.2, .5, 1, .4, { color: C.yellow });
  press.box(lights.neon, 2.5, 1.5, 1.41, .12, .12, .02, { color: C.neonRed, cast: false });
  wreck(0, CRUSHER.x, .5, CRUSHER.z, CRUSHER.yaw + Math.PI / 2, .34, 0, 0);
  press.solid(0, 1.7, 0, CRUSHER.w, 3.4, CRUSHER.d);
  for (let layer = 0; layer < BALES.layers; layer++) for (let row = 0; row < BALES.rows; row++) for (let column = 0; column < BALES.columns; column++) {
    if (layer === BALES.layers - 1 && (column + row) % 2) continue;
    const x = BALES.x + (column - (BALES.columns - 1) / 2) * BALES.w, z = BALES.z + (row - (BALES.rows - 1) / 2) * BALES.d;
    b.box(rust, x + (rng() - .5) * .08, .4 + layer * BALES.h, z + (rng() - .5) * .08, BALES.w - .08, BALES.h - .04, BALES.d - .1,
      { color: WRECK_TINTS[(layer * 5 + row * 3 + column) % WRECK_TINTS.length], yaw: (rng() - .5) * .08, shade: .7 });
  }
  b.solidBox(BALES.x, BALES.layers * BALES.h / 2, BALES.z, BALES.columns * BALES.w, BALES.layers * BALES.h, BALES.rows * BALES.d);

  // Site office: a timber cabin on blocks with a lit window after dark.
  const office = new Part(b, OFFICE.x, 0, OFFICE.z, OFFICE.yaw);
  office.box(surface('wood'), 0, 1.65, 0, OFFICE.w, 2.5, OFFICE.d, { color: 0x7f946e, shade: .78 });
  office.box(corrugated, 0, 3.02, 0, OFFICE.w + .5, .1, OFFICE.d + .6, { color: 0x7a6a5a, pitch: .05 });
  for (const dx of [-2.6, 0, 2.6]) for (const dz of [-1.2, 1.2]) office.box(surface('concrete'), dx, .2, dz, .5, .4, .4, { color: C.concrete });
  office.box(flat.satin, -1.9, 1.5, -1.57, .95, 2, .06, { color: C.oxide });
  office.box(flat.chrome, -1.56, 1.45, -1.61, .05, .12, .04, { color: 0xc8cdc9 });
  office.box(surface('wood'), -1.9, .3, -2, 1.3, .16, .8, { color: C.woodDark });
  office.box(surface('wood'), -1.9, .12, -2.5, 1.3, .16, .5, { color: C.woodDark });
  office.box(flat.satin, 1.2, 1.85, -1.57, 2, 1.1, .06, { color: C.cream });
  office.box(lights.window, 1.2, 1.85, -1.6, 1.8, .92, .02, { color: 0xffcf8a, cast: false });
  office.box(flat.satin, 1.2, 1.85, -1.62, .05, .92, .02, { color: C.cream });
  office.box(flat.satin, 1.2, 2.44, -1.75, 2.3, .06, .36, { color: C.oxide, pitch: .3 });
  office.solid(0, 1.6, 0, OFFICE.w, 3.2, OFFICE.d);
  const [ox, oz] = office.at(.4, -1.61);
  sign(ctx, 'OFFICE', ox - 1, 2.72, oz, 1.6, .42, { yaw: Math.PI + OFFICE.yaw, bg: '#7c4432', bare: true });
  // A noticeboard, a bench and the yard dog's kennel.
  office.box(surface('wood'), 2.75, 1.5, -1.6, 1, 1.2, .05, { color: C.woodPale });
  office.box(flat.matte, 2.6, 1.7, -1.63, .32, .44, .01, { color: C.paper });
  office.box(flat.matte, 2.98, 1.45, -1.63, .28, .36, .01, { color: 0xd9a43a });
  const kennel = new Part(b, OFFICE.x + 4.4, 0, OFFICE.z + .6, .3);
  kennel.box(surface('wood'), 0, .42, 0, 1, .84, 1.2, { color: C.wood, shade: .78 });
  kennel.box(surface('roof'), -.27, .98, 0, .7, .05, 1.4, { color: 0x6a4a3a, roll: .62 });
  kennel.box(surface('roof'), .27, .98, 0, .7, .05, 1.4, { color: 0x6a4a3a, roll: -.62 });
  kennel.box(flat.matte, 0, .34, -.61, .44, .56, .02, { color: C.black });
  kennel.cyl(flat.metal, .8, .05, -.5, .14, .08, { color: 0x9aa19c, segments: 10 });
  kennel.solid(0, .5, 0, 1, 1, 1.2);
  ctx.lamps.push({ x: OFFICE.x - 1.9, y: 2.5, z: OFFICE.z - 2.2, color: C.lampWarm, reach: 9 });
  office.box(lights.lamp, -1.9, 2.66, -1.66, .22, .1, .14, { color: C.lampWarm, cast: false });
  lightPool(ctx, OFFICE.x - 1.9, OFFICE.z - 2.6, 3.4, C.lampWarm, .9);

  for (const [x, z, yaw] of FLOODLIGHTS) floodlight(ctx, x, z, yaw);

  // Loose stock and clutter, all clear of the walked routes.
  const drumTints = [C.oxide, 0x3f6f7a, C.yellow, 0x60705a, C.rust];
  for (const [x, z] of [[-10, 24], [-10.8, 23.2], [-9.2, 9.6], [-10, 8.9], [-9.3, 8.2], [-10, -29], [-9.1, -28.4], [-42, 24], [-42.8, 23.3], [-32, -28], [-31.2, -28.6], [-12.4, -26.4], [-8.4, -19.4], [-7.6, -19]]) {
    oilDrum(ctx, x, z, drumTints[Math.floor(rng() * drumTints.length)], { collide: true });
  }
  oilDrum(ctx, -9.4, 23.1, C.rust, { lying: true });
  for (const [x, z, yaw, layers] of [[-9, 5.6, .2, 3], [-8.4, -9.8, 1.4, 2], [-12.6, -28.8, .1, 4], [-30.6, -27.2, .6, 2], [-44.4, 20.4, 0, 3]]) {
    for (let i = 0; i < layers; i++) pallet(ctx, x, i * .15, z, yaw + (rng() - .5) * .08);
    b.solidBox(x, layers * .075, z, 1.2, layers * .15, 1.1, { yaw });
  }
  crate(ctx, -8.8, .45, 5.6, .7, .5, C.woodPale);
  crate(ctx, -7.4, 0, 11.4, .9, .2);
  b.solidBox(-7.4, .45, 11.4, .9, .9, .9);
  for (const [x, z, count] of [[-7.2, 7.4, 5], [-8, 6.8, 3], [-12, -22.6, 6], [-6.9, -22, 4], [-7.6, -23.4, 5], [-44.6, 17.4, 4]]) tireStack(ctx, x, z, count, tire);
  dumpster(ctx, -7.6, -14.2, Math.PI / 2, 0x3f5f52);
  for (const [x, z] of [[-26.8, 28.6], [-13.2, 28.7], [-26.9, 24.4], [-13.1, 24.6]]) trafficCone(ctx, x, z);
  // Pipe rack by the far lane.
  const rackPart = new Part(b, -81, 0, -44.6, 0);
  for (const dz of [-2.6, 2.6]) { rackPart.box(flat.metal, 0, .9, dz, 2.6, 1.8, .14, { color: C.steelDark }); rackPart.box(flat.metal, 0, .1, dz, 3, .14, .3, { color: C.steelDark }); }
  for (let row = 0; row < 4; row++) for (let column = 0; column < 5 - row; column++) {
    rackPart.cyl(rust, -.9 + column * .46 + row * .23, .32 + row * .38, 0, .2, 5.8, { pitch: Math.PI / 2, color: row % 2 ? C.rust : C.rustLight, segments: 10 });
  }
  rackPart.solid(0, .9, 0, 2.6, 1.8, 5.8);

  // Price boards beside the two shells that greet the player.
  for (const [x, z, price] of [[-12.9, 13.6, '$1,400'], [-12.9, 2.6, '$2,800']] as const) {
    const board = new Part(b, x, 0, z, -Math.PI / 2 + .25);
    board.box(surface('wood'), 0, .55, .12, .9, 1.1, .04, { color: C.woodPale, pitch: -.2 });
    board.box(surface('wood'), 0, .5, -.16, .9, 1, .04, { color: C.woodDark, pitch: .22 });
    const [sx, sz] = board.at(0, .19);
    const card = sign(ctx, price, sx, .62, sz, .74, .62, { style: 'plank', bg: '#e8dcc0', color: '#a63e2e', sub: 'AS FOUND', yaw: -Math.PI / 2 + .25, bare: true });
    card.rotation.order = 'YXZ'; card.rotation.x = -.2; card.updateMatrix();
  }
}
