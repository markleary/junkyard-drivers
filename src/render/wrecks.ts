import * as THREE from 'three';
import type { WorldBuilder } from './builder';
import { flat } from './materials';

/**
 * Light car bodies for the scenery: salvage stacks, donor rows and the cars
 * parked around town. Each is a faceted loft of a few cross-sections, split
 * into a tintable paint shell and neutral trim (glass, bumpers, lamps, arches).
 * The three restorable cars have their own detailed models in `cars.ts`.
 */
export type BodyStyle = 'sedan' | 'coupe' | 'wagon' | 'pickup' | 'van' | 'compact';
export const BODY_STYLES: BodyStyle[] = ['sedan', 'coupe', 'wagon', 'pickup', 'van', 'compact'];

interface Station { z: number; belt: number; roof: number; width: number }
interface BodySpec {
  halfWidth: number;
  /** Roof half-width as a fraction of the body. */
  inset: number;
  stations: Station[];
  /** Intervals whose sides are window glass rather than pillar or panel. */
  glazed: number[];
  /** Intervals with an open load bed. */
  bed?: number[];
  axles: [number, number];
}

const st = (z: number, belt: number, roof: number, width = 1): Station => ({ z, belt, roof, width });

const SPECS: Record<BodyStyle, BodySpec> = {
  sedan: { halfWidth: .86, inset: .78, axles: [-1.35, 1.3], glazed: [4, 6],
    stations: [st(-2.25, .56, .56, .9), st(-2.08, .74, .74, .97), st(-.98, .85, .85), st(-.9, .87, .87), st(-.32, .88, 1.37),
      st(.2, .88, 1.38), st(.28, .88, 1.38), st(.8, .88, 1.36), st(1.38, .9, .9), st(2.06, .85, .85, .98), st(2.25, .6, .6, .92)] },
  coupe: { halfWidth: .88, inset: .74, axles: [-1.3, 1.25], glazed: [4],
    stations: [st(-2.2, .5, .5, .9), st(-2.02, .68, .68, .97), st(-.85, .78, .78), st(-.78, .8, .8), st(-.1, .82, 1.24),
      st(.6, .82, 1.22), st(1.5, .86, .86), st(2, .82, .82, .97), st(2.15, .56, .56, .9)] },
  wagon: { halfWidth: .87, inset: .82, axles: [-1.4, 1.3], glazed: [4, 6],
    stations: [st(-2.3, .56, .56, .9), st(-2.12, .75, .75, .97), st(-1.05, .86, .86), st(-.97, .88, .88), st(-.4, .9, 1.42),
      st(.5, .9, 1.44), st(.58, .9, 1.44), st(1.75, .9, 1.42), st(2.2, .9, .92, .98), st(2.3, .6, .6, .93)] },
  pickup: { halfWidth: .93, inset: .84, axles: [-1.55, 1.5], glazed: [4], bed: [6, 7],
    stations: [st(-2.55, .66, .66, .92), st(-2.38, .9, .9, .98), st(-1.3, 1, 1), st(-1.22, 1.02, 1.02), st(-.75, 1.03, 1.62),
      st(.05, 1.03, 1.62), st(.14, 1.02, 1.02), st(.2, .98, .98), st(2.5, .98, .98), st(2.6, .66, .66, .95)] },
  van: { halfWidth: .95, inset: .9, axles: [-1.5, 1.45], glazed: [3],
    stations: [st(-2.45, .62, .62, .93), st(-2.3, .95, .95, .98), st(-1.85, 1.08, 1.08), st(-1.3, 1.1, 1.92),
      st(-.55, 1.1, 1.95), st(2.35, 1.1, 1.95), st(2.45, .62, .62, .96)] },
  compact: { halfWidth: .8, inset: .8, axles: [-1.15, 1.1], glazed: [4],
    stations: [st(-1.85, .56, .56, .9), st(-1.7, .74, .74, .97), st(-.95, .84, .84), st(-.88, .86, .86), st(-.35, .88, 1.36),
      st(1.05, .88, 1.36), st(1.6, .88, .9, .98), st(1.85, .58, .58, .92)] },
};

const SILL = .27;
// Glass and arches are dark, not black: a pure black panel reads as a hole in the body at any distance.
const GLASS: [number, number, number] = [.12, .16, .19];
const UNDER: [number, number, number] = [.1, .095, .09];
const BUMPER: [number, number, number] = [.42, .43, .42];
const LAMP: [number, number, number] = [.82, .78, .6];
const TAIL: [number, number, number] = [.42, .04, .03];
const GRILLE: [number, number, number] = [.085, .09, .095];
const WHITE: [number, number, number] = [1, 1, 1];

class Faces {
  positions: number[] = [];
  colors: number[] = [];
  quad(a: number[], b: number[], c: number[], d: number[], color: [number, number, number]) {
    this.triangle(a, b, c, color); this.triangle(a, c, d, color);
  }
  triangle(a: number[], b: number[], c: number[], color: [number, number, number]) {
    // Skip slivers where a section collapses, such as the hood under the windscreen base.
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    if (Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) < 1e-5) return;
    this.positions.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) this.colors.push(...color);
  }
  box(cx: number, cy: number, cz: number, w: number, h: number, d: number, color: [number, number, number]) {
    const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    this.quad([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], color);
    this.quad([x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z1], color);
    this.quad([x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], color);
    this.quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], color);
    this.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], color);
    this.quad([x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], color);
  }
  build() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.computeVertexNormals();
    return geometry;
  }
}

export interface CarBody {
  paint: THREE.BufferGeometry;
  /** The same skin with rust worked up from the sills and round the arches, for salvage. */
  worn: THREE.BufferGeometry;
  trim: THREE.BufferGeometry;
  length: number; width: number; height: number; axles: [number, number];
}
const bodies = new Map<BodyStyle, CarBody>();
let wheelGeometry: THREE.BufferGeometry | undefined;

/** Section ring, left sill round to right sill. */
function ring(spec: BodySpec, station: Station): number[][] {
  const w = spec.halfWidth * station.width, top = station.roof > station.belt + .05;
  const roofW = top ? w * spec.inset : w;
  return [
    [-w * .9, SILL, station.z], [-w, SILL + .16, station.z], [-w, station.belt, station.z], [-roofW, station.roof, station.z],
    [roofW, station.roof, station.z], [w, station.belt, station.z], [w, SILL + .16, station.z], [w * .9, SILL, station.z],
  ];
}

export function carBody(style: BodyStyle): CarBody {
  const cached = bodies.get(style);
  if (cached) return cached;
  const spec = SPECS[style], paint = new Faces(), trim = new Faces();
  const rings = spec.stations.map(station => ring(spec, station));
  const hasCabin = (station: Station) => station.roof > station.belt + .05;
  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[i], b = rings[i + 1], sa = spec.stations[i], sb = spec.stations[i + 1];
    const glazed = spec.glazed.includes(i), bed = spec.bed?.includes(i);
    for (let side = 0; side < 7; side++) {
      const upper = side === 2 || side === 4, roof = side === 3;
      let target = paint, color = WHITE;
      if (upper && glazed) { target = trim; color = GLASS; }
      // The sloping panels where a cabin begins and ends are the front and rear screens.
      if (roof && hasCabin(sa) !== hasCabin(sb)) { target = trim; color = GLASS; }
      if (roof && bed) { target = trim; color = UNDER; }
      target.quad(a[side], b[side], b[side + 1], a[side + 1], color);
    }
    trim.quad(a[0], a[7], b[7], b[0], UNDER);
  }
  const front = rings[0], rear = rings[rings.length - 1];
  for (let i = 1; i < 7; i++) { paint.triangle(front[0], front[i], front[i + 1], WHITE); paint.triangle(rear[0], rear[i + 1], rear[i], WHITE); }

  const w = spec.halfWidth, zFront = spec.stations[0].z, zRear = spec.stations[spec.stations.length - 1].z;
  const nose = spec.stations[0].belt, tail = spec.stations[spec.stations.length - 1].belt;
  trim.box(0, SILL + .1, zFront - .05, w * 1.86, .15, .12, BUMPER);
  trim.box(0, SILL + .1, zRear + .05, w * 1.88, .15, .12, BUMPER);
  trim.box(0, nose - .08, zFront - .012, w * .8, .14, .03, GRILLE);
  for (const side of [-1, 1]) {
    trim.box(side * w * .66, nose - .07, zFront - .016, w * .34, .13, .04, LAMP);
    trim.box(side * w * .66, tail - .07, zRear + .016, w * .36, .12, .04, TAIL);
    // Dark arches stand in for the wheel openings at salvage-row distances.
    for (const axle of spec.axles) {
      const arch: number[][] = [];
      for (let i = 0; i <= 8; i++) { const angle = i / 8 * Math.PI; arch.push([side * (w + .012), SILL - .1 + Math.sin(angle) * .43, axle + Math.cos(angle) * .43]); }
      const centre = [side * (w + .012), SILL - .1, axle];
      for (let i = 0; i < 8; i++) side > 0 ? trim.triangle(centre, arch[i + 1], arch[i], UNDER) : trim.triangle(centre, arch[i], arch[i + 1], UNDER);
    }
  }
  const height = Math.max(...spec.stations.map(station => station.roof));
  const skin = paint.build(), worn = skin.clone();
  // Rust creeps up from the sills, further at the arches and the ends, in broad soft patches rather than speckle.
  const positions = worn.getAttribute('position'), tones = worn.getAttribute('color') as THREE.BufferAttribute;
  for (let i = 0; i < positions.count; i++) {
    const py = positions.getY(i), pz = positions.getZ(i);
    const nearArch = Math.min(...spec.axles.map(axle => Math.abs(pz - axle)));
    const reach = .2 + .26 * Math.max(0, 1 - nearArch / .7) + .1 * Math.sin(pz * 2.3 + w * 9) ** 2;
    const rust = Math.min(1, Math.max(0, (SILL + reach - py) / .22)) * .85;
    tones.setXYZ(i, 1 - rust * .42, 1 - rust * .62, 1 - rust * .74);
  }
  const body = { paint: skin, worn, trim: trim.build(), length: zRear - zFront, width: w * 2, height, axles: spec.axles };
  bodies.set(style, body);
  return body;
}

function wheel() {
  if (wheelGeometry) return wheelGeometry;
  const tire = new THREE.CylinderGeometry(.33, .33, .2, 16);
  tire.rotateZ(Math.PI / 2);
  // A dished steel wheel with a small cap: a wide pale disc read as a toy wheel.
  const hub = new THREE.CylinderGeometry(.17, .2, .212, 12);
  hub.rotateZ(Math.PI / 2);
  const cap = new THREE.CylinderGeometry(.07, .07, .23, 8);
  cap.rotateZ(Math.PI / 2);
  const paintColors = (geometry: THREE.BufferGeometry, value: [number, number, number]) => {
    const count = geometry.getAttribute('position').count, colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) colors.set(value, i * 3);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geometry.toNonIndexed();
  };
  const parts = [paintColors(tire, [.05, .052, .052]), paintColors(hub, [.3, .31, .31]), paintColors(cap, [.62, .63, .62])];
  const merged = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const arrays = parts.map(part => part.getAttribute(name).array as Float32Array);
    const joined = new Float32Array(arrays.reduce((sum, array) => sum + array.length, 0));
    let offset = 0;
    for (const array of arrays) { joined.set(array, offset); offset += array.length; }
    merged.setAttribute(name, new THREE.BufferAttribute(joined, 3));
  }
  wheelGeometry = merged;
  return merged;
}

export interface CarPlacement {
  /** sRGB paint. */
  tint: number;
  yaw?: number;
  pitch?: number;
  roll?: number;
  /** Salvage: rusted skin, flattened by `squash`, no wheels unless asked. */
  wreck?: boolean;
  squash?: number;
  wheels?: boolean;
  collide?: boolean;
}

/** Faded yard paints: sun-bleached colours, primers and plain rust. */
export const WRECK_TINTS = [0x8c5a3c, 0x7a4630, 0xa27a52, 0x6f7f84, 0x8a8f86, 0x9a3f30, 0x53707e, 0xb59a52, 0x60705a, 0xb7ae98, 0x473f38, 0x84604a];
/** Clean street colours for cars that still run. */
export const STREET_TINTS = [0xb8322a, 0x2c5a8a, 0xe2ddd0, 0x30383a, 0x4a7a5a, 0xd9a43a, 0x8f969a, 0x7a2f3a, 0x3f6f7a, 0xc96a2e, 0x1f2a44, 0xa9b8b4];

/** Place one scenery car. `y` is the ground beneath it. */
export function placeCar(builder: WorldBuilder, style: BodyStyle, x: number, y: number, z: number, placement: CarPlacement) {
  const body = carBody(style), wreck = placement.wreck ?? false;
  const yaw = placement.yaw ?? 0, pitch = placement.pitch ?? 0, roll = placement.roll ?? 0;
  const wheels = placement.wheels ?? !wreck;
  const squash = placement.squash ?? 1;
  // Without wheels the shell rests on its sills.
  const lift = wheels ? .06 : -SILL + .02;
  const options = { yaw, pitch, roll, sy: squash, shade: wreck ? .78 : .9 };
  // Faded flat paint with rust worked into the vertex colours: the hero cars are faceted and flat, and so is the scrap.
  builder.geometry(wreck ? flat.matte : flat.satin, wreck ? body.worn : body.paint, x, y + lift * squash, z, { ...options, color: placement.tint });
  builder.geometry(wreck ? flat.matte : flat.satin, body.trim, x, y + lift * squash, z, wreck ? { ...options, color: 0x9a8f80 } : options);
  if (wheels) {
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    for (const axle of body.axles) for (const side of [-1, 1]) {
      const lx = side * (body.width / 2 - .08), lz = axle;
      builder.geometry(flat.rubber, wheel(), x + lx * cos + lz * sin, y + .33, z - lx * sin + lz * cos, { yaw, color: wreck ? 0x8a8378 : undefined });
    }
  }
  if (placement.collide) builder.solidBox(x, y + body.height * squash / 2, z, body.width, body.height * squash, body.length, { yaw });
  return body;
}
