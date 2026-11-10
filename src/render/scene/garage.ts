import * as THREE from 'three';
import { clearGlass, flat, lights } from '../materials';
import { surface } from '../surfaces';
import { C, Part, lightPool, sign, tireStack, type SceneContext } from './kit';
import type { GroundMarks } from './ground';

/** Hooks on the east wall where recovered finds are hung, in collection order. */
export const TROPHY_PEGS: THREE.Vector3[] = Array.from({ length: 12 }, (_, i) =>
  new THREE.Vector3(-11.24, 2.5 + Math.floor(i / 6) * .95, -9.2 - (i % 6) * 1.25));

/**
 * The workshop. Walls, roof and benches keep the footprint and colliders of
 * the first build; everything else is dressing against the walls, so the bay
 * and the walk to the bench stay open.
 */
export function buildGarage(ctx: SceneContext, marks: GroundMarks) {
  const { b, rng } = ctx;
  const siding = surface('corrugated'), plaster = surface('plaster'), wood = surface('wood'), metal = surface('metal'), concrete = surface('concrete');
  const wall = 0xd9cfb6, trim = C.oxide;

  // Shell. Collider-bearing pieces first, in their original positions.
  b.box(siding, -20, 2.6, -24, 18, 5.2, .35, { color: wall, collide: true, shade: .8 });
  b.box(siding, -29, 2.6, -15, .35, 5.2, 18, { color: wall, collide: true, shade: .8 });
  b.box(siding, -11, 2.6, -15, .35, 5.2, 18, { color: wall, collide: true, shade: .8 });
  b.box(siding, -27.6, 2.6, -6, 2.8, 5.2, .4, { color: wall, collide: true, shade: .8 });
  b.box(siding, -12.4, 2.6, -6, 2.8, 5.2, .4, { color: wall, collide: true, shade: .8 });
  b.box(flat.metal, -20, 4.85, -6, 12.4, .7, .4, { color: C.steelDark, collide: true });
  b.solidBox(-20, 5.28, -15, 19, .35, 19);
  // A base course in workshop red ties the building to the yard's paintwork.
  for (const [x, z, w, d] of [[-20, -24.2, 18.4, .06], [-29.2, -15, .06, 18.4], [-10.8, -15, .06, 18.4], [-27.6, -5.78, 2.9, .06], [-12.4, -5.78, 2.9, .06]]) {
    b.box(flat.satin, x, .55, z, w, 1.1, d, { color: trim, shade: .72 });
    b.box(flat.metal, x, 1.12, z, w + .02, .06, d + .02, { color: C.steelDark });
  }
  for (const [x, z] of [[-29.1, -24.1], [-10.9, -24.1], [-29.1, -5.9], [-10.9, -5.9], [-26.15, -5.9], [-13.85, -5.9]]) b.box(flat.metal, x, 2.6, z, .22, 5.24, .22, { color: C.steelDark });

  // Tin roof on exposed steel trusses, with a deep fascia and a gutter along the back.
  b.box(siding, -20, 5.5, -15, 19.8, .08, 19.8, { color: 0x8a7a66, shade: .9 });
  b.box(flat.matte, -20, 5.4, -15, 17.6, .06, 17.6, { color: 0x3c3f3a, cast: false });
  for (const [x, z, w, d] of [[-20, -5.35, 19.5, .1], [-20, -24.65, 19.5, .1], [-29.65, -15, .1, 19.5], [-10.35, -15, .1, 19.5]]) b.box(flat.satin, x, 5.32, z, w, .3, d, { color: trim });
  b.box(flat.metal, -20, 5.14, -24.9, 19.8, .14, .16, { color: 0x858c88 });
  for (const x of [-29.6, -10.4]) b.cylinder(flat.metal, x, 2.7, -24.9, .06, 5.2, { color: 0x858c88, segments: 6 });
  for (const z of [-21, -17, -13, -9]) {
    b.box(flat.metal, -20, 5.08, z, 17.6, .14, .12, { color: 0x4a5250 });
    b.box(flat.metal, -20, 4.5, z, 17.6, .1, .1, { color: 0x4a5250 });
    for (let i = 0; i < 8; i++) {
      const x0 = -28.8 + i * 2.2;
      b.beam(flat.metal, new THREE.Vector3(x0, 4.5, z), new THREE.Vector3(x0 + 1.1, 5.08, z), .03, { color: 0x4a5250, segments: 4, cast: false });
      b.beam(flat.metal, new THREE.Vector3(x0 + 1.1, 5.08, z), new THREE.Vector3(x0 + 2.2, 4.5, z), .03, { color: 0x4a5250, segments: 4, cast: false });
    }
  }
  // Spinning cowls let the heat out.
  for (const [x, z] of [[-24.5, -12], [-15.5, -18]]) {
    b.cylinder(flat.metal, x, 5.75, z, .22, .4, { color: 0x858c88, segments: 10 });
    const cowl = new THREE.Mesh(new THREE.SphereGeometry(.34, 10, 6, 0, Math.PI * 2, 0, Math.PI * .6), new THREE.MeshStandardMaterial({ color: 0xa3aaa6, roughness: .4, metalness: .8, flatShading: true }));
    cowl.position.set(x, 6.02, z); cowl.castShadow = true;
    ctx.root.add(cowl);
    ctx.animated.push((seconds) => { cowl.rotation.y = seconds * 1.7; });
  }

  // High strip windows on the long walls. Lit rooms show warm from outside after dark.
  for (const x of [-29.2, -10.8]) for (const z of [-20.5, -15, -9.5]) {
    b.box(flat.metal, x, 4.1, z, .08, .9, 3.2, { color: C.steelDark });
    b.box(lights.window, x + (x < -20 ? -.03 : .03), 4.1, z, .04, .74, 3, { color: 0xffd9a0, cast: false });
    for (const dz of [-1, 0, 1]) b.box(flat.metal, x + (x < -20 ? -.06 : .06), 4.1, z + dz, .03, .74, .05, { color: C.steelDark });
  }

  // Interior lining: painted dado below, cream above.
  for (const [x, z, w, d] of [[-20, -23.8, 17.6, .04], [-28.8, -15, .04, 17.6], [-11.2, -15, .04, 17.6]]) {
    // Thicken only the thin axis, so the dado and its rail stand proud of the wall above.
    const along = w > d;
    b.box(plaster, x, 3.2, z, w, 3.9, d, { color: 0xddd4bd, cast: false });
    b.box(plaster, x, .65, z, along ? w : w * 1.5, 1.3, along ? d * 1.5 : d, { color: 0x52685c, cast: false });
    b.box(flat.satin, x, 1.32, z, along ? w : w * 2.4, .06, along ? d * 2.4 : d, { color: trim, cast: false });
  }
  for (const x of [-27.6, -12.4]) b.box(plaster, x, 2.6, -6.22, 2.7, 5.1, .04, { color: 0xddd4bd, cast: false });

  // Roller door: rolled up into its drum, guides either side, hazard paint on the sill.
  b.cylinder(flat.metal, -20, 4.58, -6.42, .3, 12.3, { roll: Math.PI / 2, color: 0x7d8683, segments: 12 });
  b.box(siding, -20, 4.2, -6.36, 12.3, .5, .05, { color: 0x9aa09a });
  for (const x of [-26.1, -13.9]) b.box(flat.metal, x, 2.3, -6.3, .1, 4.5, .12, { color: 0x4a5250 });
  for (let i = 0; i < 16; i++) b.box(flat.marking, -25.6 + i * .75, .066, -6, .38, .004, .34, { color: i % 2 ? C.yellow : C.black, yaw: .5, cast: false });
  // Drain grate and expansion joints stay paint-thin, so the floor is level to walk and drive on.
  b.box(flat.marking, -20, .064, -5, 8, .002, .4, { color: 0x2b3232, cast: false });
  for (let x = -23.8; x < -16; x += .2) b.box(flat.marking, x, .067, -5, .055, .003, .37, { color: 0x7d8683, cast: false });
  for (const x of [-25, -15]) b.box(flat.marking, x, .062, -15, .02, .002, 17, { color: 0x6f6a5c, cast: false });
  b.box(flat.marking, -20, .062, -17, 17, .002, .02, { color: 0x6f6a5c, cast: false });
  // The bay: a painted floor panel inside yellow lines.
  b.box(surface('concrete', 'overlay'), -20, .062, -14.2, 7.6, .004, 12.4, { color: 0x8f9488, cast: false });
  for (const x of [-24, -16]) b.box(flat.marking, x, .068, -14, .12, .004, 13, { color: C.yellow, cast: false });
  b.box(flat.marking, -20, .068, -20.5, 8, .004, .12, { color: C.yellow, cast: false });
  b.quad(marks.tracks, -20, .07, -12, 3.1, 9);

  // Signs keep their positions; tests and players both navigate by them.
  sign(ctx, 'GARAGE', -20, 4.28, -5.42, 8.3, 1.05, { sub: 'RESTORE · REBUILD · REPEAT' });
  sign(ctx, 'BUILT, NOT BOUGHT.', -20, 3.5, -23.76, 8, 1.3, { bg: '#7c4432', bare: true });
  sign(ctx, '01', -14.1, 2.7, -23.76, 1, 1.3, { bare: true });
  sign(ctx, 'WORKBENCH', -27, 2.7, -12.9, 2.6, .65, { bg: '#855b32' });
  for (const x of [-28, -26]) b.box(flat.metal, x, 3.75, -12.94, .02, 1.5, .02, { color: C.steelDark, cast: false });
  // Gooseneck lamps wash the fascia sign after dark.
  for (const x of [-23, -20, -17]) {
    b.beam(flat.metal, new THREE.Vector3(x, 5.25, -5.75), new THREE.Vector3(x, 5.35, -5.1), .025, { color: C.steelDark, segments: 4 });
    b.cylinder(flat.metal, x, 5.26, -5.06, .14, .16, { taper: .4, color: C.steelDark, segments: 8 });
    b.cylinder(lights.lamp, x, 5.17, -5.06, .09, .03, { color: C.lampWarm, segments: 8, cast: false });
  }

  // Workbench: steel frame, thick timber top, vise, pegboard of hand tools. Same collider.
  const bench = new Part(b, -27.3, 0, -15);
  bench.solid(0, .55, 0, 1.6, 1.1, 4);
  for (const dz of [-1.9, 0, 1.9]) for (const dx of [-.7, .7]) bench.box(flat.metal, dx, .52, dz, .08, 1.04, .08, { color: C.steelDark });
  bench.box(flat.metal, 0, .22, 0, 1.5, .05, 3.9, { color: 0x4a5250 });
  bench.box(metal, -.02, .62, 0, 1.44, .5, 3.84, { color: 0x4c5f58, shade: .8 });
  for (let i = 0; i < 4; i++) { bench.box(flat.metal, .71, .62, -1.44 + i * .96, .02, .34, .86, { color: 0x56695f }); bench.box(flat.chrome, .73, .7, -1.44 + i * .96, .02, .03, .4, { color: 0xc8cdc9 }); }
  bench.box(wood, 0, 1.14, 0, 1.85, .16, 4.1, { color: 0x8f6c42 });
  bench.box(wood, -1.44, 2.3, 0, .06, 1.8, 4, { color: 0xa78a5e });
  // Vise.
  bench.box(flat.metal, .5, 1.3, 1.5, .26, .16, .34, { color: 0x3f6f7a });
  bench.box(flat.metal, .5, 1.42, 1.38, .22, .14, .06, { color: 0x3f6f7a });
  bench.box(flat.metal, .5, 1.42, 1.62, .22, .14, .06, { color: 0x3f6f7a });
  bench.cyl(flat.chrome, .5, 1.36, 1.84, .018, .34, { pitch: Math.PI / 2, color: 0xc8cdc9, segments: 6 });
  // Hand tools hung in outline order.
  for (let i = 0; i < 9; i++) {
    const dz = -1.7 + i * .42, long = .34 + (i % 3) * .12;
    bench.box(flat.chrome, -1.39, 2.52 - long / 2 + .22, dz, .02, long, .05, { color: 0xbfc5c1 });
    bench.box(flat.chrome, -1.39, 2.74, dz, .02, .09, .1, { color: 0xbfc5c1 });
  }
  bench.box(flat.satin, -1.39, 1.82, -1.3, .03, .1, .5, { color: C.oxide });
  bench.box(flat.chrome, -1.39, 1.82, -.92, .03, .16, .12, { color: 0xbfc5c1 });
  bench.box(flat.satin, -1.39, 1.78, .3, .03, .42, .09, { color: C.yellow });
  bench.box(flat.chrome, -1.39, 1.86, 1.1, .02, .06, .6, { color: 0xbfc5c1 });
  // Bench clutter: tins, a lamp, the radio and a clipboard holding the build sheet.
  for (let i = 0; i < 6; i++) bench.cyl(flat.satin, -.55 + (i % 2) * .16, 1.31, -1.7 + i * .2, .06, .18, { color: [C.oxide, 0x3f6f7a, C.yellow, C.cream][i % 4], segments: 8 });
  bench.box(flat.satin, -.5, 1.34, .5, .24, .24, .5, { color: 0x6a4a3a });
  bench.box(flat.chrome, -.37, 1.34, .5, .01, .14, .34, { color: 0xbfc5c1 });
  bench.box(flat.matte, .2, 1.235, -.4, .32, .012, .44, { color: C.paper, yaw: .2 });
  bench.box(flat.matte, .2, 1.243, -.4, .26, .004, .36, { color: 0xd8ceb4, yaw: .2 });
  bench.beam(flat.metal, [-.6, 1.22, -.8], [-.5, 1.8, -.6], .016, { color: C.steelDark, segments: 4 });
  bench.beam(flat.metal, [-.5, 1.8, -.6], [-.1, 1.72, -.5], .016, { color: C.steelDark, segments: 4 });
  bench.cyl(flat.satin, -.06, 1.68, -.48, .1, .12, { taper: .5, color: C.green, segments: 8 });
  bench.cyl(lights.interior, -.06, 1.61, -.48, .07, .02, { color: C.lampWarm, segments: 8, cast: false });
  // Stool tucked under the open end.
  b.cylinder(flat.satin, -26, .58, -17.6, .2, .06, { color: C.oxide, segments: 10 });
  for (let i = 0; i < 3; i++) b.beam(flat.metal, new THREE.Vector3(-26, .56, -17.6), new THREE.Vector3(-26 + Math.cos(i * 2.1) * .2, 0, -17.6 + Math.sin(i * 2.1) * .2), .016, { color: C.steelDark, segments: 4 });

  // Rolling tool chest. Same collider as the plain red cabinet it replaces.
  const chest = new Part(b, -12, 0, -20.5);
  chest.solid(0, 1, 0, 1.3, 2, 2.5);
  chest.box(flat.satin, 0, .62, 0, 1.24, 1.02, 2.44, { color: 0xa5322a, shade: .8 });
  chest.box(flat.satin, .04, 1.52, 0, 1.1, .7, 2.3, { color: 0xb5382e });
  chest.box(flat.metal, 0, 1.14, 0, 1.3, .04, 2.5, { color: C.steelDark });
  for (let i = 0; i < 4; i++) { chest.box(flat.satin, -.63, .28 + i * .22, 0, .02, .18, 2.3, { color: 0x922a23 }); chest.box(flat.chrome, -.65, .32 + i * .22, 0, .02, .025, 1.5, { color: 0xc8cdc9 }); }
  for (let i = 0; i < 3; i++) { chest.box(flat.satin, -.52, 1.28 + i * .2, 0, .02, .16, 2.16, { color: 0x922a23 }); chest.box(flat.chrome, -.54, 1.32 + i * .2, 0, .02, .02, 1.3, { color: 0xc8cdc9 }); }
  for (const dz of [-1, 1]) for (const dx of [-.5, .5]) chest.cyl(flat.rubber, dx, .07, dz, .07, .05, { roll: Math.PI / 2, color: C.rubber, segments: 8 });
  chest.box(flat.chrome, .1, 1.9, -.5, .3, .06, .4, { color: 0xbfc5c1, yaw: .3 });

  // West wall: oil and paint shelving, hung belts, the air line.
  for (let i = 0; i < 5; i++) {
    b.box(wood, -28.6, 1.1 + i * .51, -19.5, .32, .045, 3.2, { color: C.woodPale });
    for (let j = 0; j < 7; j++) {
      const tint = [C.oxide, C.cream, 0x3f6f7a, C.yellow, 0x60705a, 0x2c5a8a][(i * 3 + j) % 6];
      if ((i + j) % 4 === 3) b.box(flat.matte, -28.56, 1.26 + i * .51, -20.9 + j * .44, .22, .26, .3, { color: tint });
      else b.cylinder(flat.satin, -28.56, 1.26 + i * .51, -20.9 + j * .44, .1 + (j % 3) * .02, .26, { color: tint, segments: 8 });
    }
  }
  for (const y of [.86, 3.4]) b.box(flat.metal, -28.72, y, -19.5, .05, .05, 3.3, { color: C.steelDark });
  for (const z of [-21.1, -17.9]) b.box(flat.metal, -28.62, 2.1, z, .26, 2.6, .05, { color: C.steelDark });
  const hoop = new THREE.TorusGeometry(.3, .022, 5, 20);
  for (let i = 0; i < 4; i++) b.instance(hoop, flat.rubber, -28.7, 3.5 - (i % 2) * .16, -11.4 + i * .5, { yaw: Math.PI / 2, color: C.rubber, sx: 1, sy: 1 + i * .12 });
  b.instance(new THREE.TorusGeometry(.42, .05, 6, 24), flat.rubber, -28.66, 2.5, -8.6, { yaw: Math.PI / 2, color: 0x8a3a2a });
  b.cylinder(flat.metal, -28.72, 2.5, -8.6, .16, .1, { roll: Math.PI / 2, color: C.oxide, segments: 10 });
  // Pallet of boxed parts in the back corner.
  b.box(wood, -27.8, .24, -22.2, 1.3, .44, 1.3, { color: C.wood });
  for (let i = 0; i < 4; i++) b.box(wood, -27.8, .47, -22.68 + i * .32, 1.4, .08, .24, { color: C.woodPale });
  b.box(surface('wood'), -27.9, .82, -22.3, .8, .6, .7, { color: 0xc0a275, yaw: .2 });
  b.box(surface('wood'), -27.6, 1.34, -22.2, .6, .44, .6, { color: 0xb89a6c, yaw: -.15 });
  // Wall-hung tires above the pallet.
  const tire = new THREE.TorusGeometry(.36, .13, 8, 18);
  for (let i = 0; i < 3; i++) b.instance(tire, flat.rubber, -24.8 + i * .95, 4.2, -23.6, { color: 0x1b1d1c });
  b.box(flat.metal, -23.85, 4.2, -23.72, 3.2, .06, .06, { color: C.steelDark });

  // East wall: compressor, welding set, jack stands, creeper.
  const compressor = new Part(b, -12.1, 0, -9.4);
  compressor.cyl(flat.satin, 0, .55, 0, .34, 1.5, { pitch: Math.PI / 2, color: C.oxide, segments: 14 });
  for (const dz of [-.5, .5]) compressor.box(flat.metal, 0, .12, dz, .6, .24, .08, { color: C.steelDark });
  compressor.box(flat.metal, 0, 1.06, .2, .4, .34, .5, { color: 0x4a5250 });
  compressor.cyl(flat.metal, 0, 1.1, -.36, .2, .08, { roll: Math.PI / 2, color: 0x7d8683, segments: 12 });
  compressor.cyl(flat.chrome, .24, .98, .62, .05, .02, { roll: Math.PI / 2, color: 0xe9e6dc, segments: 8 });
  const welder = new Part(b, -11.9, 0, -12.4);
  welder.box(flat.metal, 0, .14, 0, .5, .06, .8, { color: C.steelDark });
  welder.cyl(flat.satin, 0, .82, -.18, .12, 1.3, { color: 0x3f6f7a, segments: 10 });
  welder.cyl(flat.satin, 0, .74, .2, .11, 1.14, { color: 0x9a3f30, segments: 10 });
  welder.cyl(flat.metal, 0, 1.5, -.18, .04, .1, { color: 0xc8cdc9, segments: 6 });
  welder.beam(flat.metal, [-.2, .14, .42], [-.2, 1.3, .52], .016, { color: C.steelDark, segments: 4 });
  for (const z of [-21.4, -18.5]) {
    b.box(flat.metal, -11.42, .12, z - 1.6, .5, .08, .5, { color: C.steelDark });
    b.cylinder(flat.metal, -11.42, .4, z - 1.6, .05, .56, { color: C.oxide, segments: 6 });
    b.box(flat.metal, -11.42, .7, z - 1.6, .16, .05, .1, { color: C.steelDark });
  }
  b.box(flat.matte, -12.4, .1, -15.6, .6, .06, 1.1, { color: 0x2a3030 });
  for (const [dx, dz] of [[-.22, -.44], [.22, -.44], [-.22, .44], [.22, .44]]) b.cylinder(flat.rubber, -12.4 + dx, .04, -15.6 + dz, .04, .04, { roll: Math.PI / 2, color: C.rubber, segments: 6 });
  // Trophy rail: the brackets are fixed, and recovered finds are hung on them by the game.
  b.box(wood, -11.22, 2.5, -12.3, .05, .1, 7.2, { color: C.woodDark });
  b.box(wood, -11.22, 3.45, -12.3, .05, .1, 7.2, { color: C.woodDark });
  sign(ctx, 'LOST & FOUND', -11.19, 4.3, -12.3, 3.2, .5, { yaw: -Math.PI / 2, style: 'plank', bg: '#d9c89c', color: '#7a2b20', bare: true });

  // Back wall: a number plate collection either side of the motto.
  const plateTints = [C.cream, 0x2c5a8a, C.yellow, 0x60705a, 0xb8322a, 0xe9e6dc];
  for (let i = 0; i < 10; i++) {
    const x = i < 5 ? -27.6 + (i % 3) * .72 + Math.floor(i / 3) * .36 : -15.4 + ((i - 5) % 2) * .72;
    const y = i < 5 ? 2.2 + Math.floor(i / 3) * .46 + 1.3 : 1.6 + Math.floor((i - 5) / 2) * .44;
    b.box(flat.satin, x, y, -23.77, .52, .26, .012, { color: plateTints[i % plateTints.length], roll: (rng() - .5) * .08, cast: false });
  }
  // Wall clock.
  b.cylinder(flat.satin, -25.2, 4.3, -23.76, .34, .05, { pitch: Math.PI / 2, color: C.cream, segments: 20 });
  b.cylinder(flat.metal, -25.2, 4.3, -23.74, .37, .03, { pitch: Math.PI / 2, color: C.steelDark, segments: 20 });
  b.box(flat.matte, -25.2, 4.4, -23.71, .03, .22, .01, { color: C.ink });
  b.box(flat.matte, -25.1, 4.3, -23.71, .2, .03, .01, { color: C.ink });

  // Light: tube fittings, three shaded pendants over the bay, and one real source.
  for (const x of [-24, -16]) {
    b.box(flat.metal, x, 4.44, -15, .26, .07, 8.1, { color: 0xc9cdc6 });
    b.box(lights.interior, x, 4.39, -15, .16, .04, 7.8, { color: 0xfff1d6, cast: false });
    for (const z of [-18.6, -11.4]) b.box(flat.metal, x, 4.76, z, .02, .6, .02, { color: C.steelDark, cast: false });
  }
  for (const z of [-17.5, -13, -8.5]) {
    b.box(flat.metal, -20, 4.6, z, .02, .9, .02, { color: C.steelDark, cast: false });
    b.cylinder(flat.satin, -20, 4.06, z, .34, .26, { taper: .3, color: C.green, segments: 12 });
    b.cylinder(lights.interior, -20, 3.94, z, .2, .03, { color: C.lampWarm, segments: 12, cast: false });
    // Bright at the lamp and gone by the floor: a soft shaft, not a hard triangle.
    b.cylinder(lights.cone, -20, 2, z, 1.9, 3.9, { taper: .1, open: true, color: C.lampWarm, segments: 18, cast: false, receive: false, shade: .03 });
    lightPool(ctx, -20, z, 3, C.lampWarm, .55, .075);
  }
  const glow = new THREE.PointLight(0xffe2b8, 16, 22, 1.5);
  glow.position.set(-20, 4, -14);
  ctx.root.add(glow);
  // Warm light spills through the door onto the apron at night.
  lightPool(ctx, -20, -3.4, 7, C.lampWarm, .7);

  // Outside: a wall lamp over the door edge, a stack of tires and a side window pane.
  tireStack(ctx, -11.7, -5.1, 4, tire);
  b.box(clearGlass, -29.22, 2.4, -9, .03, 1.1, 1.6, { cast: false });
  b.box(flat.metal, -29.24, 2.4, -9, .05, 1.26, 1.76, { color: C.steelDark });
  ctx.interactables.push({ id: 'workbench', kind: 'workbench', position: new THREE.Vector3(-26.4, 1.2, -15), label: 'the workbench' });
  void concrete;
}
