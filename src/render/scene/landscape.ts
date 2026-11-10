import * as THREE from 'three';
import { surface } from '../surfaces';
import type { Vegetation } from '../vegetation';
import { randomFromSeed } from '../../world/layout';
import { C, type SceneContext } from './kit';

/** Playable rectangle, just inside the low concrete barriers. */
const INNER = { minX: -95, maxX: 203, minZ: -65, maxZ: 211 };

/** Smooth periodic-free noise from hashed lattice values. */
function makeNoise(seed: number) {
  const random = randomFromSeed(seed);
  const size = 64, values = Float32Array.from({ length: size * size }, random);
  const at = (x: number, z: number) => values[((z % size + size) % size) * size + (x % size + size) % size];
  return (x: number, z: number) => {
    const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
    const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
    return (at(ix, iz) * (1 - sx) + at(ix + 1, iz) * sx) * (1 - sz) + (at(ix, iz + 1) * (1 - sx) + at(ix + 1, iz + 1) * sx) * sz;
  };
}

/**
 * Everything beyond the barriers: ground that rises into wooded hills and a
 * far ridge, so every street ends in country rather than at the map edge.
 * None of it reaches the playable area, so it carries no colliders.
 */
export function buildLandscape(ctx: SceneContext, plants: Vegetation) {
  const { layout, rng } = ctx;
  const noise = makeNoise(layout.seed ^ 0x51f3);
  const outside = (x: number, z: number) => Math.max(INNER.minX - x, x - INNER.maxX, INNER.minZ - z, z - INNER.maxZ, 0);
  const height = (x: number, z: number) => {
    const distance = outside(x, z);
    if (distance <= 0) return 0;
    const rise = Math.min(1, distance / 260);
    const rolling = noise(x * .012, z * .012) * .65 + noise(x * .031 + 9, z * .031 + 4) * .35;
    // A gentle apron first, then hills, then the ridge.
    return Math.pow(rise, 1.35) * (12 + rolling * 78) + Math.max(0, distance - 12) * .03 * rolling;
  };

  const step = 14, minX = -460, maxX = 580, minZ = -430, maxZ = 600;
  const columns = Math.round((maxX - minX) / step), rows = Math.round((maxZ - minZ) / step);
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const meadow = new THREE.Color(C.grass), wood = new THREE.Color(0x4f6a38), dry = new THREE.Color(0x8f8e4a), rock = new THREE.Color(0x8a8474), mixed = new THREE.Color();
  for (let row = 0; row <= rows; row++) for (let column = 0; column <= columns; column++) {
    const x = minX + column * step, z = minZ + row * step, y = height(x, z);
    // Sink the inner skirt slightly so it never fights the flat ground it meets.
    positions.push(x, outside(x, z) <= 0 ? -.4 : y - .05, z);
    const patch = noise(x * .02 + 31, z * .02 + 17);
    mixed.copy(meadow).lerp(dry, Math.max(0, patch - .45) * 1.4).lerp(wood, Math.min(1, y / 26)).lerp(rock, Math.max(0, Math.min(1, (y - 58) / 30)));
    colors.push(mixed.r, mixed.g, mixed.b);
  }
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const x = minX + (column + .5) * step, z = minZ + (row + .5) * step;
    // Leave the playable interior to the flat ground slab.
    if (x > INNER.minX + step && x < INNER.maxX - step && z > INNER.minZ + step && z < INNER.maxZ - step) continue;
    const a = row * (columns + 1) + column, c = a + columns + 1;
    indices.push(a, c, a + 1, a + 1, c, c + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const terrain = new THREE.Mesh(geometry, surface('grass'));
  terrain.name = 'Surrounding hills';
  terrain.receiveShadow = true; terrain.matrixAutoUpdate = false; terrain.frustumCulled = false;
  ctx.root.add(terrain);

  // Woods on the slopes: dense near the barriers, thinning with distance.
  const conifers = Math.round(1500 * Math.max(.2, ctx.quality.density));
  const greens = [0x3f5a38, 0x4a6638, 0x36503a, 0x55703c, 0x445c40];
  for (let i = 0; i < conifers; i++) {
    const x = minX + 60 + rng() * (maxX - minX - 120), z = minZ + 60 + rng() * (maxZ - minZ - 120);
    const distance = outside(x, z);
    if (distance < 7 || distance > 300) continue;
    if (noise(x * .016 + 50, z * .016 + 70) < .36 && distance > 30) continue; // Clearings.
    const tall = 8 + rng() * 9 + Math.min(6, distance * .03);
    plants.conifer(x, height(x, z) - .2, z, tall, greens[Math.floor(rng() * greens.length)]);
  }
  // A broadleaf fringe right behind the barrier hides the hard edge of the map.
  const fringe = Math.round(150 * Math.max(.3, ctx.quality.density));
  for (let i = 0; i < fringe; i++) {
    const side = i % 4, t = rng();
    const x = side === 0 ? INNER.minX - 6 - rng() * 14 : side === 1 ? INNER.maxX + 6 + rng() * 14 : INNER.minX + t * (INNER.maxX - INNER.minX);
    const z = side === 2 ? INNER.minZ - 6 - rng() * 14 : side === 3 ? INNER.maxZ + 6 + rng() * 14 : INNER.minZ + t * (INNER.maxZ - INNER.minZ);
    if (rng() > .5) plants.tree(x, z, 7 + rng() * 5, 2.4 + rng() * 1.4, rng() > .7 ? 'tall' : 'broad');
    else plants.bush(x, height(x, z), z, 1 + rng() * 1.2);
  }

  // Town trees keep the positions and trunk colliders of the generated layout.
  layout.trees.forEach((tree, index) => {
    // A crown reaches about 1.4 times its spread from the trunk: keep it out of the nearest wall and awning.
    const clearance = layout.buildings.reduce((nearest, building) => Math.min(nearest,
      Math.hypot(Math.max(Math.abs(tree.x - building.x) - building.w / 2, 0), Math.max(Math.abs(tree.z - building.z) - building.d / 2, 0))), Infinity);
    const spread = Math.min(1.9 + rng() * 1.3, Math.max(1.15, (clearance - 1.1) / 1.4)), tall = 5.6 + rng() * 4.2;
    plants.tree(tree.x, tree.z, tall, spread, index % 5 === 0 ? 'tall' : index % 3 === 0 ? 'round' : 'broad');
    if (ctx.quality.density > .2) for (let i = 0; i < 5; i++) plants.tuft(tree.x + (rng() - .5) * 3, .01, tree.z + (rng() - .5) * 3, .3 + rng() * .3);
  });
  // Meadow grass and scrub across the open ground between streets.
  const tufts = Math.round(2600 * ctx.quality.density);
  const blocked = (x: number, z: number) =>
    layout.roads.some(road => Math.abs(road.a.z === road.b.z ? z - road.a.z : x - road.a.x) < road.width / 2 + 3.4 &&
      (road.a.z === road.b.z ? x > Math.min(road.a.x, road.b.x) - 6 && x < Math.max(road.a.x, road.b.x) + 6 : z > Math.min(road.a.z, road.b.z) - 6 && z < Math.max(road.a.z, road.b.z) + 6)) ||
    layout.buildings.some(building => Math.abs(x - building.x) < building.w / 2 + .8 && Math.abs(z - building.z) < building.d / 2 + .8) ||
    layout.lots.some(lot => lot.kind !== 'park' && Math.abs(x - lot.x) < lot.w / 2 + .5 && Math.abs(z - lot.z) < lot.d / 2 + .5) ||
    (x > -87 && x < -4 && z > -54 && z < 31) || (x > -2 && x < 26 && z > 3 && z < 36);
  for (let i = 0; i < tufts; i++) {
    const x = INNER.minX + 2 + rng() * (INNER.maxX - INNER.minX - 4), z = INNER.minZ + 2 + rng() * (INNER.maxZ - INNER.minZ - 4);
    if (blocked(x, z)) continue;
    const lush = noise(x * .05 + 3, z * .05 + 8);
    plants.tuft(x, .01, z, .34 + rng() * .5, lush > .58 ? 0x9c9a52 : undefined);
    if (i % 23 === 0 && !layout.trees.some(tree => Math.hypot(tree.x - x, tree.z - z) < 4)) plants.bush(x, 0, z, .6 + rng() * .7);
  }
}
