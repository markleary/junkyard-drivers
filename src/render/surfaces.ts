import * as THREE from 'three';
import { randomFromSeed } from '../world/layout';

/**
 * Original surface studies, painted into canvases at startup. Each kind has a
 * greyscale albedo, a normal map derived from its height field and a roughness
 * map, all projected at a fixed world scale so a 150 m road and a 4 m slab
 * share the same grain. Colour comes from vertex tints, so one material serves
 * every wall, slab or panel of its kind.
 */
export type SurfaceKind =
  | 'asphalt' | 'concrete' | 'gravel' | 'dirt' | 'grass' | 'brick' | 'plaster'
  | 'metal' | 'corrugated' | 'rust' | 'wood' | 'roof' | 'bark' | 'tile';

interface SurfaceSpec {
  /** Metres covered by one repeat of the texture. */
  period: number;
  metalness: number;
  /** Height-to-normal strength. */
  relief: number;
  /** Mid tone of the albedo study, 0..255. */
  base: number;
  /** How strongly large patches drift lighter and darker. */
  macro: number;
}

const SPECS: Record<SurfaceKind, SurfaceSpec> = {
  asphalt: { period: 3.8, metalness: 0, relief: 1.7, base: 187, macro: .34 },
  concrete: { period: 3.5, metalness: 0, relief: 1.1, base: 224, macro: .3 },
  gravel: { period: 2.7, metalness: 0, relief: 3.4, base: 200, macro: .34 },
  dirt: { period: 3.2, metalness: 0, relief: 1.9, base: 196, macro: .4 },
  grass: { period: 4, metalness: 0, relief: 2.2, base: 196, macro: .5 },
  brick: { period: .9, metalness: 0, relief: 4.2, base: 214, macro: .26 },
  plaster: { period: 3, metalness: 0, relief: 1.2, base: 226, macro: .3 },
  metal: { period: 2.3, metalness: .45, relief: .9, base: 220, macro: .22 },
  corrugated: { period: 1.2, metalness: .5, relief: 5.5, base: 214, macro: .3 },
  rust: { period: 1.7, metalness: .12, relief: 1.8, base: 198, macro: .42 },
  wood: { period: 2, metalness: 0, relief: 1.8, base: 200, macro: .28 },
  roof: { period: 1.5, metalness: 0, relief: 3.2, base: 196, macro: .3 },
  bark: { period: 1.1, metalness: 0, relief: 4.5, base: 186, macro: .3 },
  tile: { period: 2, metalness: 0, relief: 1.6, base: 218, macro: .12 },
};

const SIZE = 512;
const smooth = (value: number) => { const t = Math.min(1, Math.max(0, value)); return t * t * (3 - 2 * t); };
const fract = (value: number) => value - Math.floor(value);
const TAU = Math.PI * 2;

/** Periodic value noise: seamless at the tile edge, without repeated circular stains. */
function noiseField(cells: number, rng: () => number) {
  const values = Array.from({ length: cells * cells }, rng);
  return (u: number, v: number) => {
    const x = fract(u) * cells, y = fract(v) * cells;
    const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
    const at = (dx: number, dy: number) => values[((iy + dy) % cells) * cells + (ix + dx) % cells];
    const top = at(0, 0) + (at(1, 0) - at(0, 0)) * fx, bottom = at(0, 1) + (at(1, 1) - at(0, 1)) * fx;
    return top + (bottom - top) * fy;
  };
}

/** Loose stones with edge copies for seamless wrapping, drawn into albedo, height and roughness alike. */
function scatterStones(contexts: CanvasRenderingContext2D[], rng: () => number, count: number, minRadius: number, maxRadius: number, tones: [number, number, number]) {
  for (let i = 0; i < count; i++) {
    const x = rng() * SIZE, y = rng() * SIZE, radius = minRadius + rng() * (maxRadius - minRadius);
    const aspect = .45 + rng() * .55, angle = rng() * TAU, sides = 5 + i % 3;
    const points = Array.from({ length: sides }, (_, j) => {
      const theta = j / sides * TAU, r = radius * (.65 + rng() * .5);
      const px = Math.cos(theta) * r, py = Math.sin(theta) * r * aspect;
      return [px * Math.cos(angle) - py * Math.sin(angle), px * Math.sin(angle) + py * Math.cos(angle)];
    });
    const values = [tones[0] + rng() * 57, tones[1] + rng() * 35, tones[2] + rng() * 20];
    const xs = [0], ys = [0];
    if (x < radius + 2) xs.push(SIZE); if (x > SIZE - radius - 2) xs.push(-SIZE);
    if (y < radius + 2) ys.push(SIZE); if (y > SIZE - radius - 2) ys.push(-SIZE);
    contexts.forEach((context, map) => {
      const value = Math.round(values[map]);
      context.fillStyle = `rgb(${value},${value},${value})`;
      for (const dx of xs) for (const dy of ys) {
        context.beginPath();
        points.forEach(([px, py], j) => j ? context.lineTo(x + dx + px, y + dy + py) : context.moveTo(x + dx + px, y + dy + py));
        context.closePath(); context.fill();
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

interface SurfaceMaps { color: THREE.CanvasTexture; normal: THREE.CanvasTexture; roughness: THREE.CanvasTexture; gain: number }
const maps = new Map<SurfaceKind, SurfaceMaps>();

function surfaceMaps(kind: SurfaceKind): SurfaceMaps {
  const cached = maps.get(kind);
  if (cached) return cached;
  const spec = SPECS[kind];
  const canvases = Array.from({ length: 3 }, () => { const canvas = document.createElement('canvas'); canvas.width = canvas.height = SIZE; return canvas; });
  const contexts = canvases.map(canvas => canvas.getContext('2d', { willReadFrequently: true })!);
  const pixels = contexts.map(context => context.createImageData(SIZE, SIZE));
  const rng = randomFromSeed(31817 + kind.charCodeAt(0) * 79 + kind.length * 13 + kind.charCodeAt(kind.length - 1));
  const broad = noiseField(4, rng), medium = noiseField(16, rng), fine = noiseField(64, rng);
  const base = spec.base;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const u = x / SIZE, v = y / SIZE;
    const grain = rng() - .5, low = broad(u, v) - .5, mid = medium(u, v) - .5, micro = fine(u, v) - .5;
    let color = base, height = .5, roughness = .9;
    if (kind === 'concrete') {
      // Small aggregate and restrained trowel mottling keep large slabs quiet.
      color += low * 9 + mid * 6 + grain * 12;
      const pore = grain < -.482 ? .22 : 0;
      color -= pore * 25; height += grain * .1 + micro * .06 - pore;
      roughness = .91 + mid * .06 + grain * .055;
    } else if (kind === 'asphalt') {
      const stone = grain > .2 ? (grain - .2) * 52 : 0;
      color += low * 10 + mid * 7 + grain * 31 + stone;
      height += grain * .36 + micro * .1;
      roughness = .93 + grain * .11;
    } else if (kind === 'gravel') {
      // Compacted fines between loose chips: no grid, cell outlines or continuous grout.
      color += grain * 31 + low * 9 + mid * 9 + micro * 7;
      height = .47 + grain * .12 + micro * .07;
      roughness = .93 + grain * .075;
    } else if (kind === 'dirt') {
      // Packed earth: soft clods, with fine dry crazing where it has baked hard.
      const clod = smooth(mid * 2.2 + .5);
      color += low * 16 + (clod - .5) * 14 + micro * 10 + grain * 18;
      height = .45 + (clod - .5) * .22 + micro * .1 + grain * .1;
      roughness = .96 + grain * .05;
    } else if (kind === 'grass') {
      const blade = Math.sin(u * TAU * 181 + Math.sin(v * TAU * 11) * 2) * Math.sin(v * TAU * 97 + low * 9);
      color += low * 22 + mid * 22 + grain * 26 + blade * 9;
      height += grain * .2 + micro * .1 + blade * .08;
      roughness = .95 + grain * .04;
    } else if (kind === 'brick') {
      // Twelve courses across 0.9 m give 75 mm courses in running bond.
      const row = Math.floor(v * 12), py = fract(v * 12), px = fract(u * 4 + (row % 2) * .5);
      const edgeDistance = Math.min(py * (SIZE / 12), (1 - py) * (SIZE / 12), px * 128, (1 - px) * 128);
      const bevel = smooth((edgeDistance - 1.1) / 2.4);
      const brickTone = fract(Math.sin((Math.floor(u * 4 + (row % 2) * .5) % 4 + row * 11) * 81.79) * 8192) - .5;
      const face = base + brickTone * 30 + grain * 15 + micro * 14;
      color = 150 + grain * 10 + (face - 150 - grain * 10) * bevel;
      height = .28 + bevel * .35 + micro * .09 * bevel + grain * .025;
      roughness = .98 - bevel * .1 + micro * .07;
    } else if (kind === 'plaster') {
      // Trowelled render with faint vertical weather streaks.
      const streak = medium(u, .2) * .6 + fine(u, .2 + Math.sin(v * TAU) * .015) * .4 - .5;
      color += low * 10 + mid * 7 + grain * 9 + streak * 9;
      height += micro * .16 + grain * .08 + mid * .06;
      roughness = .9 + grain * .05 + streak * .05;
    } else if (kind === 'metal') {
      // Fine rolling direction and shallow seams; geometry supplies the panel shape.
      const rolling = Math.sin(u * TAU * 128) * .5;
      const seam = Math.pow(Math.max(0, Math.cos(u * TAU * 16)), 24);
      const runoff = medium(u, .15) * .4 + fine(u, .15 + Math.sin(v * TAU) * .02) * .6 - .5;
      color += low * 7 + runoff * 9 + grain * 5 + rolling * 3 - seam * 7;
      height += rolling * .025 - seam * .15 + grain * .025;
      roughness = .62 + runoff * .14 + grain * .04;
    } else if (kind === 'corrugated') {
      // Twelve pressed ribs per repeat, running up the wall, with rain staining below each lap.
      const rib = Math.sin(u * TAU * 12);
      const lap = Math.pow(Math.max(0, Math.cos(v * TAU * 2)), 60);
      const runoff = medium(u, .4) * .5 + fine(u, .4 + Math.sin(v * TAU) * .02) * .5 - .5;
      color += rib * 13 + low * 10 + runoff * 16 + grain * 6 - lap * 24;
      height = .5 + rib * .4 - lap * .12 + grain * .02;
      roughness = .6 + runoff * .2 + grain * .04 + lap * .2;
    } else if (kind === 'rust') {
      const flake = smooth((micro + mid * .5 + .1) * 3);
      color += low * 14 + mid * 23 + grain * 29 - flake * 25;
      height += micro * .3 + grain * .13 + flake * .12;
      roughness = .95 + grain * .06;
    } else if (kind === 'wood') {
      // Four boards per repeat; waviness follows the cut and pores run along the grain.
      const board = Math.floor(v * 4), within = fract(v * 4);
      const gap = Math.min(within, 1 - within) < .035 ? 1 : 0;
      const shift = fract(Math.sin(board * 91.7) * 4375.5);
      const bend = Math.sin((v + shift) * TAU * 2) * .2 + Math.sin(v * TAU * 5) * .05;
      const rings = Math.sin((u + shift) * TAU * 23 + bend * 5 + low * 3);
      const pore = Math.pow(Math.max(0, Math.sin((u + shift * .7) * TAU * 113 + bend * 9)), 14);
      color += rings * 11 + low * 10 + grain * 13 - pore * 14 + (shift - .5) * 22 - gap * 60;
      height += rings * .04 - pore * .1 + grain * .035 - gap * .32;
      roughness = .86 + pore * .09 + low * .08;
    } else if (kind === 'roof') {
      // Eight overlapping shingle courses, each tab offset from the row beneath.
      const row = Math.floor(v * 8), within = fract(v * 8), tab = fract(u * 6 + (row % 2) * .5);
      const shadow = smooth(1 - within * 5);
      const slot = Math.min(tab, 1 - tab) < .03 ? 1 : 0;
      const tone = fract(Math.sin((Math.floor(u * 6 + (row % 2) * .5) + row * 17) * 43.3) * 7919) - .5;
      color += tone * 26 + grain * 22 + low * 8 - shadow * 34 - slot * 30;
      height = .35 + within * .4 - slot * .2 + grain * .08;
      roughness = .92 + grain * .06;
    } else if (kind === 'bark') {
      // Deep vertical furrows that wander and merge.
      const furrow = Math.abs(Math.sin((u * 9 + mid * 1.4 + Math.sin(v * TAU * 2) * .12) * TAU));
      const ridge = Math.pow(furrow, .55);
      color += (ridge - .6) * 60 + grain * 16 + low * 10;
      height = .2 + ridge * .65 + grain * .06;
      roughness = .97;
    } else {
      // Shop floor: sixteen vinyl tiles with a speckle and hairline joints.
      const tx = fract(u * 4), ty = fract(v * 4);
      const joint = Math.min(tx, 1 - tx, ty, 1 - ty) < .012 ? 1 : 0;
      const checker = (Math.floor(u * 4) + Math.floor(v * 4)) % 2 ? 1 : 0;
      const speck = grain > .38 ? 14 : grain < -.42 ? -18 : 0;
      color += checker * -26 + speck + low * 4 + mid * 3 - joint * 46;
      height += -joint * .3 + grain * .01;
      roughness = .46 + joint * .4 + mid * .08;
    }
    const offset = (x + y * SIZE) * 4;
    const values = [color, Math.min(1, Math.max(0, height)) * 255, Math.min(1, Math.max(0, roughness)) * 255];
    for (let map = 0; map < 3; map++) {
      const value = Math.round(values[map]);
      pixels[map].data[offset] = pixels[map].data[offset + 1] = pixels[map].data[offset + 2] = value;
      pixels[map].data[offset + 3] = 255;
    }
  }
  contexts.forEach((context, i) => context.putImageData(pixels[i], 0, 0));
  if (kind === 'gravel') scatterStones(contexts, rng, 12000, .45, 2, [178, 147, 222]);
  if (kind === 'dirt') scatterStones(contexts, rng, 900, .6, 2.6, [170, 150, 215]);

  // Normals from the finished height field, wrapping at the edges like the texture itself.
  const heightData = contexts[1].getImageData(0, 0, SIZE, SIZE).data;
  const normalImage = contexts[1].createImageData(SIZE, SIZE);
  const heightAt = (x: number, y: number) => heightData[(((y + SIZE) % SIZE) * SIZE + (x + SIZE) % SIZE) * 4] / 255;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const dx = (heightAt(x + 1, y) - heightAt(x - 1, y)) * spec.relief, dy = (heightAt(x, y + 1) - heightAt(x, y - 1)) * spec.relief;
    const length = Math.hypot(dx, dy, 1), offset = (x + y * SIZE) * 4;
    normalImage.data[offset] = Math.round((-dx / length * .5 + .5) * 255);
    // Canvas rows run downward while texture v runs upward.
    normalImage.data[offset + 1] = Math.round((dy / length * .5 + .5) * 255);
    normalImage.data[offset + 2] = Math.round((1 / length * .5 + .5) * 255);
    normalImage.data[offset + 3] = 255;
  }
  contexts[1].putImageData(normalImage, 0, 0);

  // Tints are authored as the surface's real colour, so divide out the study's own mean tone.
  const colorData = contexts[0].getImageData(0, 0, SIZE, SIZE).data;
  let sum = 0;
  for (let i = 0; i < colorData.length; i += 64) sum += Math.pow(colorData[i] / 255, 2.2);
  const gain = 1 / Math.max(.2, sum / (colorData.length / 64));

  const result = { color: textureFrom(canvases[0], true), normal: textureFrom(canvases[1], false), roughness: textureFrom(canvases[2], false), gain };
  maps.set(kind, result);
  return result;
}

const materials = new Map<string, THREE.MeshStandardMaterial>();

let detailMaps = true;
/**
 * Software rendering skips normal and roughness maps: two thirds fewer texture uploads and a much
 * lighter shader per pixel. Call before the first surface is made; the choice lasts for the session.
 */
export function configureSurfaces(options: { detailMaps: boolean }) { detailMaps = options.detailMaps; }

/** One shared material per surface kind. Tint each piece with vertex colour. */
/** `overlay` wins depth ties, for thin patches laid over other ground: lawns, lanes, repairs. */
export function surface(kind: SurfaceKind, variant: 'solid' | 'double' | 'overlay' = 'solid'): THREE.MeshStandardMaterial {
  const key = `${kind}:${variant}`;
  const cached = materials.get(key);
  if (cached) return cached;
  const spec = SPECS[kind], textures = surfaceMaps(kind);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, roughness: 1, metalness: spec.metalness,
    map: textures.color, normalMap: detailMaps ? textures.normal : null, roughnessMap: detailMaps ? textures.roughness : null,
    side: variant === 'double' ? THREE.DoubleSide : THREE.FrontSide,
    polygonOffset: variant === 'overlay', polygonOffsetFactor: -1.5, polygonOffsetUnits: -1.5,
  });
  material.name = `surface-${key}`;
  material.userData.projected = true;
  // Period, gain and macro variation travel as one uniform, so all fourteen kinds share a single
  // compiled program instead of one each. That matters most where shaders compile slowly.
  const tuning = new THREE.Vector3(spec.period, textures.gain, spec.macro);
  material.onBeforeCompile = shader => {
    shader.uniforms.uSurface = { value: tuning };
    // Texture coordinates come from world position, so every piece of a kind
    // lines up with its neighbours regardless of size or how it was scaled.
    shader.vertexShader = 'uniform vec3 uSurface;\n' + shader.vertexShader.replace('#include <project_vertex>', /* glsl */`#include <project_vertex>
      vec4 surfacePosition = vec4( transformed, 1.0 );
      vec3 surfaceNormal = normal;
      #ifdef USE_INSTANCING
        surfacePosition = instanceMatrix * surfacePosition;
        surfaceNormal = mat3( instanceMatrix ) * surfaceNormal;
      #endif
      surfacePosition = modelMatrix * surfacePosition;
      vec3 surfaceAxis = abs( normalize( mat3( modelMatrix ) * surfaceNormal ) );
      vec2 surfaceUv = surfaceAxis.y > 0.55 ? surfacePosition.xz : surfaceAxis.x > 0.55 ? surfacePosition.zy : surfacePosition.xy;
      surfaceUv /= uSurface.x;
      #ifdef USE_MAP
        vMapUv = surfaceUv;
      #endif
      #ifdef USE_NORMALMAP
        vNormalMapUv = surfaceUv;
      #endif
      #ifdef USE_ROUGHNESSMAP
        vRoughnessMapUv = surfaceUv;
      #endif
    `);
    // A second, far larger sample of the same study drifts whole patches lighter
    // and darker, which hides the repeat across open ground and long walls.
    shader.fragmentShader = 'uniform vec3 uSurface;\n' + shader.fragmentShader.replace('#include <map_fragment>', /* glsl */`
      #ifdef USE_MAP
        vec4 sampledDiffuseColor = texture2D( map, vMapUv );
        float macroA = texture2D( map, vMapUv * 0.113 + 0.37 ).g;
        float macroB = texture2D( map, vMapUv * 0.027 + 0.61 ).g;
        float macro = ( macroA * 0.55 + macroB * 0.45 ) * uSurface.y;
        sampledDiffuseColor.rgb *= uSurface.y * mix( 1.0, 0.4 + macro * 0.6, uSurface.z );
        diffuseColor *= sampledDiffuseColor;
      #endif
    `);
  };
  material.customProgramCacheKey = () => 'jd-surface';
  materials.set(key, material);
  return material;
}

/** Generate every study up front so the first frame does not stall on canvas work. */
export function prepareSurfaces() {
  for (const kind of Object.keys(SPECS) as SurfaceKind[]) surfaceMaps(kind);
}
