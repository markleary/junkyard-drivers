import * as THREE from 'three';
import { randomFromSeed } from '../world/layout';

type Surface = 'asphalt' | 'concrete' | 'gravel' | 'grass' | 'brick' | 'metal' | 'rust' | 'wood';
interface SurfaceMaps { color: THREE.CanvasTexture; height: THREE.CanvasTexture; roughness: THREE.CanvasTexture }
const maps = new Map<Surface, SurfaceMaps>();
const size = 512;
const smooth = (value: number) => { const t = THREE.MathUtils.clamp(value, 0, 1); return t * t * (3 - 2 * t); };
const fract = (value: number) => value - Math.floor(value);

/** Periodic value noise avoids a visible seam without introducing repeated circular stains. */
function noiseField(cells: number, rng: () => number) {
  const values = Array.from({ length: cells * cells }, rng);
  return (u: number, v: number) => {
    const x = fract(u) * cells, y = fract(v) * cells;
    const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
    const at = (dx: number, dy: number) => values[((iy + dy) % cells) * cells + (ix + dx) % cells];
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(at(0, 0), at(1, 0), fx), THREE.MathUtils.lerp(at(0, 1), at(1, 1), fx), fy);
  };
}

/** Independently scattered 5–20mm chips, with edge copies for seamless wrapping.
 * Overlapping angular stones avoid the joined cells / dark grout of paving.
 */
function scatterAggregate(contexts: CanvasRenderingContext2D[], rng: () => number) {
  for (let i = 0; i < 12000; i++) {
    const x = rng() * size, y = rng() * size, radius = .45 + rng() * 1.55;
    const aspect = .45 + rng() * .55, angle = rng() * Math.PI * 2;
    const points = Array.from({ length: 5 + i % 3 }, (_, j) => {
      const theta = j / (5 + i % 3) * Math.PI * 2;
      const r = radius * (.65 + rng() * .5), px = Math.cos(theta) * r, py = Math.sin(theta) * r * aspect;
      return [px * Math.cos(angle) - py * Math.sin(angle), px * Math.sin(angle) + py * Math.cos(angle)];
    });
    const tone = 178 + rng() * 57;
    const values = [tone, 147 + rng() * 35, 222 + rng() * 20];
    const xs = [0], ys = [0];
    if (x < 3) xs.push(size); if (x > size - 3) xs.push(-size);
    if (y < 3) ys.push(size); if (y > size - 3) ys.push(-size);
    contexts.forEach((ctx, map) => {
      const value = Math.round(values[map]); ctx.fillStyle = `rgb(${value},${value},${value})`;
      for (const dx of xs) for (const dy of ys) {
        ctx.beginPath();
        points.forEach(([px, py], j) => j ? ctx.lineTo(x + dx + px, y + dy + py) : ctx.moveTo(x + dx + px, y + dy + py));
        ctx.closePath(); ctx.fill();
      }
    });
  }
}

function textureFrom(canvas: HTMLCanvasElement, srgb: boolean) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

/** Original albedo, height, and roughness studies. One set per surface, all local and 512px. */
function surfaceMaps(kind: Surface): SurfaceMaps {
  const cached = maps.get(kind);
  if (cached) return cached;
  const canvases = Array.from({ length: 3 }, () => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = size; return canvas;
  });
  const contexts = canvases.map(canvas => canvas.getContext('2d')!);
  const pixels = contexts.map(context => context.createImageData(size, size));
  const rng = randomFromSeed(31817 + kind.charCodeAt(0) * 79 + kind.length);
  const broad = noiseField(4, rng), medium = noiseField(16, rng), fine = noiseField(64, rng);
  const base = { asphalt: 187, concrete: 231, gravel: 207, grass: 208, brick: 223, metal: 222, rust: 201, wood: 203 }[kind];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const grain = rng() - .5, low = broad(u, v) - .5, mid = medium(u, v) - .5, micro = fine(u, v) - .5;
    let color = base, height = .5, roughness = .9;
    if (kind === 'concrete') {
      // Small aggregate and restrained trowel mottling keep large slabs quiet.
      color += low * 9 + mid * 5 + grain * 12;
      const pore = grain < -.482 ? .22 : 0;
      color -= pore * 25; height += grain * .1 + micro * .06 - pore;
      roughness = .91 + mid * .06 + grain * .055;
    } else if (kind === 'asphalt') {
      const stone = grain > .2 ? (grain - .2) * 52 : 0;
      color += low * 9 + mid * 6 + grain * 31 + stone;
      height += grain * .36 + micro * .1;
      roughness = .93 + grain * .11;
    } else if (kind === 'gravel') {
      // Compacted fines between loose chips: no grid, cell outlines or continuous grout.
      color += grain * 31 + low * 8 + mid * 8 + micro * 7;
      height = .47 + grain * .12 + micro * .07;
      roughness = .93 + grain * .075;
    } else if (kind === 'grass') {
      const blade = Math.sin(u * Math.PI * 2 * 181 + Math.sin(v * Math.PI * 2 * 11) * 2);
      color += low * 17 + mid * 18 + grain * 24 + blade * 5;
      height += grain * .17 + micro * .09 + blade * .04;
      roughness = .96;
    } else if (kind === 'brick') {
      // Twelve courses across 0.9m produce 75mm courses and 225mm running-bond bricks.
      const row = Math.floor(v * 12), py = fract(v * 12), px = fract(u * 4 + (row % 2) * .5);
      const edgeDistance = Math.min(py * (size / 12), (1 - py) * (size / 12), px * 128, (1 - px) * 128);
      const bevel = smooth((edgeDistance - 1.1) / 2.4);
      const brickTone = fract(Math.sin((Math.floor(u * 4 + (row % 2) * .5) % 4 + row * 11) * 81.79) * 8192) - .5;
      const face = base + brickTone * 23 + grain * 15 + micro * 14;
      color = THREE.MathUtils.lerp(139 + grain * 10, face, bevel);
      height = .28 + bevel * .35 + micro * .09 * bevel + grain * .025;
      roughness = .98 - bevel * .1 + micro * .07;
    } else if (kind === 'metal') {
      // Fine rolling direction and shallow seams; geometry supplies the actual panel shape.
      const rolling = Math.sin(u * Math.PI * 2 * 128) * .5;
      const seam = Math.pow(Math.max(0, Math.cos(u * Math.PI * 2 * 16)), 24);
      const runoff = medium(u, .15) * .4 + fine(u, .15 + Math.sin(v * Math.PI * 2) * .02) * .6 - .5;
      color += low * 6 + runoff * 8 + grain * 5 + rolling * 3 - seam * 7;
      height += rolling * .025 - seam * .15 + grain * .025;
      roughness = .72 + runoff * .11 + grain * .03;
    } else if (kind === 'rust') {
      const flake = smooth((micro + mid * .5 + .1) * 3);
      color += low * 12 + mid * 21 + grain * 29 - flake * 23;
      height += micro * .3 + grain * .13 + flake * .12;
      roughness = .95 + grain * .06;
    } else {
      // Periodic waviness follows cut timber; darker pores run along the grain.
      const bend = Math.sin(v * Math.PI * 2 * 2) * .2 + Math.sin(v * Math.PI * 2 * 5) * .05;
      const rings = Math.sin(u * Math.PI * 2 * 39 + bend * 5);
      const pore = Math.pow(Math.max(0, Math.sin(u * Math.PI * 2 * 113 + bend * 9)), 14);
      color += rings * 10 + low * 11 + grain * 13 - pore * 13;
      height += rings * .04 - pore * .1 + grain * .035;
      roughness = .86 + pore * .09 + low * .08;
    }
    const offset = (x + y * size) * 4;
    const values = [color, THREE.MathUtils.clamp(height, 0, 1) * 255, THREE.MathUtils.clamp(roughness, 0, 1) * 255];
    for (let map = 0; map < 3; map++) {
      const value = Math.round(values[map]);
      pixels[map].data[offset] = pixels[map].data[offset + 1] = pixels[map].data[offset + 2] = value;
      pixels[map].data[offset + 3] = 255;
    }
  }
  contexts.forEach((context, i) => context.putImageData(pixels[i], 0, 0));
  if (kind === 'gravel') scatterAggregate(contexts, rng);
  const result = { color: textureFrom(canvases[0], true), height: textureFrom(canvases[1], false), roughness: textureFrom(canvases[2], false) };
  maps.set(kind, result);
  return result;
}

export function surfaceMaterial(kind: Surface, color: THREE.ColorRepresentation, period: number, roughness = .9, metalness = 0) {
  const textures = surfaceMaps(kind);
  const material = new THREE.MeshStandardMaterial({
    color, roughness, metalness, map: textures.color, bumpMap: textures.height, roughnessMap: textures.roughness,
    bumpScale: { asphalt: .012, concrete: .009, gravel: .035, grass: .015, brick: .027, metal: .014, rust: .008, wood: .012 }[kind],
  });
  // UVs use fully transformed positions, so a 150m road and a 4m slab retain
  // the same physical grain. All three maps share exactly this projection.
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vec4 surfacePosition = vec4(transformed, 1.0);
      vec3 surfaceNormal = normal;
      #ifdef USE_INSTANCING
        surfacePosition = instanceMatrix * surfacePosition;
        surfaceNormal = mat3(instanceMatrix) * surfaceNormal;
      #endif
      surfacePosition = modelMatrix * surfacePosition;
      surfaceNormal = normalize(mat3(modelMatrix) * surfaceNormal);
      vec3 surfaceAxis = abs(surfaceNormal);
      vec2 surfaceUv = surfaceAxis.y > 0.55 ? surfacePosition.xz : surfaceAxis.x > 0.55 ? surfacePosition.zy : surfacePosition.xy;
      surfaceUv /= ${period.toFixed(5)};
      #ifdef USE_MAP
        vMapUv = surfaceUv;
      #endif
      #ifdef USE_BUMPMAP
        vBumpMapUv = surfaceUv;
      #endif
      #ifdef USE_ROUGHNESSMAP
        vRoughnessMapUv = surfaceUv;
      #endif
    `);
  };
  material.customProgramCacheKey = () => `world-surface-pbr-${period}`;
  return material;
}
