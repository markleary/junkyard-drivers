import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Original display models. Units are metres; all models sit on local y=0.
 * Engines face +Z; wheels stand upright with their outside face toward +Z.
 * Cached geometry/materials belong to this factory and are shared by clones.
 * The display meshes do not add colliders or own inventory state.
 */
export type EngineFamily = 'i4' | 'v8' | 'v12';
export type PartCondition = 'new' | 'salvage';
export interface PartOptions { condition?: PartCondition }
export interface EngineOptions extends PartOptions { performance?: boolean }
export const ENGINE_DISPLAY_SIZE = {
  i4: { width: .84, height: .86, depth: 1.05 },
  v8: { width: 1.04, height: .87, depth: 1.05 },
  v12: { width: 1.04, height: .87, depth: 1.32 },
} as const;
export const WHEEL_DISPLAY_SIZE = { width: .73, height: .73, depth: .33 } as const;
export const PAINT_CAN_SIZE = { width: .41, height: .59, depth: .38 } as const;

const prototypes = new Map<string, THREE.Group>();
const palettes = new Map<PartCondition, ReturnType<typeof makePalette>>();
const canLabels = new Map<string, THREE.MeshStandardMaterial>();

function metalGrain(condition: PartCondition) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(128, 128);
  let seed = 97281;
  for (let i = 0; i < image.data.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const grain = seed / 4294967296;
    const n = condition === 'new' ? 214 + grain * 35 : 156 + grain * 60;
    image.data[i] = n;
    image.data[i + 1] = n - (condition === 'salvage' ? 7 : 0);
    image.data[i + 2] = n - (condition === 'salvage' ? 17 : 0);
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  if (condition === 'salvage') {
    for (let i = 0; i < 22; i++) {
      ctx.fillStyle = `rgba(70,44,27,${.05 + i % 4 * .025})`;
      ctx.beginPath(); ctx.ellipse((i * 47) % 128, (i * 71) % 128, 7 + i % 8, 2 + i % 5, i, 0, Math.PI * 2); ctx.fill();
    }
  }
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 4;
  return map;
}

function makePalette(condition: PartCondition) {
  const used = condition === 'salvage';
  const map = metalGrain(condition);
  return {
    cast: new THREE.MeshStandardMaterial({ color: used ? '#9b9988' : '#d1d2cd', metalness: .72, roughness: used ? .74 : .43, map, bumpMap: map, bumpScale: .0017 }),
    steel: new THREE.MeshStandardMaterial({ color: used ? '#77766d' : '#aab1b1', metalness: .86, roughness: used ? .57 : .26 }),
    dark: new THREE.MeshStandardMaterial({ color: used ? '#393932' : '#303738', metalness: .58, roughness: .64, map }),
    iron: new THREE.MeshStandardMaterial({ color: used ? '#79513a' : '#716b5a', metalness: .48, roughness: .83, map }),
    rubber: new THREE.MeshStandardMaterial({ color: used ? '#3a3c38' : '#22282a', roughness: .91 }),
    sidewall: new THREE.MeshStandardMaterial({ color: used ? '#343730' : '#252b2c', roughness: .82 }),
    enamel: new THREE.MeshStandardMaterial({ color: used ? '#53716d' : '#43616a', metalness: .42, roughness: used ? .68 : .3, map: used ? map : null }),
    accent: new THREE.MeshStandardMaterial({ color: used ? '#8f5943' : '#a8412c', metalness: .32, roughness: used ? .7 : .36 }),
  };
}

function palette(condition: PartCondition) {
  let value = palettes.get(condition);
  if (!value) { value = makePalette(condition); palettes.set(condition, value); }
  return value;
}

/** Bake all small fixed details into one mesh per material, rather than one draw per bolt. */
class Assembly {
  private batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private matrix = new THREE.Matrix4();
  private quaternion = new THREE.Quaternion();
  private scale = new THREE.Vector3(1, 1, 1);
  add(geometry: THREE.BufferGeometry, material: THREE.Material, position: number[] = [0, 0, 0], rotation: number[] = [0, 0, 0]) {
    this.quaternion.setFromEuler(new THREE.Euler(rotation[0], rotation[1], rotation[2]));
    this.matrix.compose(new THREE.Vector3(...position), this.quaternion, this.scale);
    geometry.applyMatrix4(this.matrix);
    let batch = this.batches.get(material);
    if (!batch) { batch = []; this.batches.set(material, batch); }
    batch.push(geometry);
  }
  box(material: THREE.Material, pos: number[], size: number[], radius = .012, rotation = [0, 0, 0]) {
    this.add(radius > 0
      ? new RoundedBoxGeometry(size[0], size[1], size[2], 1, Math.min(radius, Math.min(...size) * .35))
      : new THREE.BoxGeometry(...size), material, pos, rotation);
  }
  cylinder(material: THREE.Material, pos: number[], radius: number, length: number, rotation = [Math.PI / 2, 0, 0], segments = 16) {
    this.add(new THREE.CylinderGeometry(radius, radius, length, segments), material, pos, rotation);
  }
  tube(material: THREE.Material, points: number[][], radius: number, segments = 12) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    this.add(new THREE.TubeGeometry(curve, segments, radius, 6, false), material);
  }
  build(name: string) {
    const group = new THREE.Group(); group.name = name;
    for (const [material, geometries] of this.batches) {
      // RoundedBoxGeometry is non-indexed; normalise before merging other primitives.
      const flat = geometries.map(g => g.index ? g.toNonIndexed() : g);
      const geometry = mergeGeometries(flat, false)!;
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
      for (const g of new Set([...geometries, ...flat])) g.dispose();
    }
    const floor = new THREE.Box3().setFromObject(group).min.y;
    for (const child of group.children) (child as THREE.Mesh).geometry.translate(0, -floor, 0);
    return group;
  }
}

function cached(key: string, make: () => THREE.Group) {
  let prototype = prototypes.get(key);
  if (!prototype) { prototype = make(); prototypes.set(key, prototype); }
  return prototype.clone(true);
}

export function createEngineModel(family: EngineFamily, options: EngineOptions = {}): THREE.Group {
  const condition = options.condition ?? 'new';
  return cached(`engine-${family}-${condition}-${!!options.performance}`, () => {
    const p = palette(condition), a = new Assembly();
    const inline = family === 'i4', count = family === 'v12' ? 6 : 4;
    const length = family === 'v12' ? .93 : .67;
    const width = inline ? .36 : .51;
    // Feet and pressed sump establish an honest shelf contact instead of a floating block.
    for (const x of [-.23, .23]) a.box(p.dark, [x, .04, 0], [.09, .08, length + .03], .008);
    a.box(p.dark, [0, .13, 0], [width + .03, .2, length - .03], .035);
    a.box(p.cast, [0, .32, 0], [width, .3, length], .028);
    a.box(p.cast, [0, .215, 0], [width + .08, .025, length + .08], .007);
    // Cast webbing, freeze plugs, sump-flange bolts and mounting lugs.
    for (const side of [-1, 1]) {
      for (let i = 0; i < count; i++) {
        const z = -length * .39 + i / (count - 1) * length * .78;
        a.box(p.cast, [side * (width / 2 + .013), .31, z], [.024, .2, .032], .004);
        a.cylinder(p.steel, [side * (width / 2 + .026), .36, z + .04], .03, .012, [0, 0, Math.PI / 2], 12);
        a.cylinder(p.steel, [side * (width / 2 + .025), .23, z], .012, .018, [0, 0, Math.PI / 2], 6);
      }
      a.box(p.dark, [side * (width / 2 + .07), .24, -.18], [.16, .065, .12], .012);
    }
    if (inline) {
      a.box(p.cast, [0, .515, 0], [.43, .15, length + .05], .02);
      a.box(p.enamel, [0, .64, 0], [.31, .13, length + .04], .035);
      for (const x of [-.085, 0, .085]) a.box(p.steel, [x, .709, -.03], [.013, .009, length * .75], .003);
      for (let i = 0; i < 4; i++) {
        const z = -.235 + i * .155;
        a.cylinder(p.dark, [0, .72, z], .025, .025, [0, 0, 0], 12);
        a.tube(p.rubber, [[0, .745, z], [.1, .76, z], [.21, .67, z], [.21, .43, z + .07]], .008, 8);
        // Individual intake and exhaust runners make the cylinder count readable.
        a.tube(p.cast, [[.18, .55, z], [.31, .56, z], [.36, .7, z], [.3, .75, z]], .039);
        a.tube(p.iron, [[-.2, .51, z], [-.31, .47, z], [-.34, .29, z], [-.32, .24, .2]], .026);
      }
      a.box(p.cast, [.3, .755, 0], [.14, .1, length * .9], .025);
    } else {
      for (const side of [-1, 1]) {
        const tilt = -side * .47;
        a.box(p.cast, [side * .2, .47, 0], [.29, .25, length + .04], .018, [0, 0, tilt]);
        a.box(options.performance ? p.accent : p.enamel, [side * .285, .625, 0], [.25, .14, length + .06], .03, [0, 0, tilt]);
        for (const offset of [-.065, 0, .065]) a.box(p.steel, [side * (.295 + offset), .704 - side * offset * .4, 0], [.012, .009, length * .84], .003, [0, 0, tilt]);
        for (let i = 0; i < count; i++) {
          const z = -length * .39 + i / (count - 1) * length * .78;
          a.tube(p.cast, [[side * .05, .77, z], [side * .13, .76, z], [side * .22, .63, z]], .03, 8);
          a.tube(p.iron, [[side * .35, .5, z], [side * .44, .44, z], [side * .46, .29, z], [side * .4, .24, length * .3]], .025, 10);
          a.cylinder(p.steel, [side * .37, .642, z], .012, .018, [0, 0, -side * .47], 6);
        }
      }
      a.box(p.cast, [0, .765, -.025], [.2, .12, length * .92], .035);
      a.box(p.dark, [0, .832, -.025], [.1, .012, length * .64], .003);
    }
    // Timing case and physically connected accessory drive at the front.
    const front = length / 2 + .036;
    a.box(p.cast, [0, .365, front], [width * .83, .34, .065], .025);
    const pulleys = [[0, .26, .115], [0, .51, .074], [.235, .43, .067]];
    for (const [x, y, radius] of pulleys) {
      a.cylinder(p.dark, [x, y, front + .075], radius, .055);
      a.cylinder(p.steel, [x, y, front + .106], radius * .68, .009);
      a.cylinder(p.dark, [x, y, front + .115], .018, .016, [Math.PI / 2, 0, 0], 6);
    }
    a.tube(p.rubber, [[-.109,.26,front+.075],[-.065,.53,front+.075],[0,.582,front+.075],[.248,.495,front+.075],[.299,.43,front+.075],[.08,.17,front+.075],[-.085,.18,front+.075],[-.109,.26,front+.075]], .013, 30);
    a.cylinder(p.cast, [.235, .43, front - .025], .085, .13);
    for (let i = 0; i < 7; i++) a.box(p.dark, [.23 + (i - 3) * .018, .5, front - .035], [.007, .012, .084], .002);
    a.cylinder(p.accent, [-width / 2 - .055, .26, .13], .054, .14, [0, 0, -.25]);
    a.cylinder(p.dark, [inline ? -.07 : -.28, .74, -.22], .039, .033, [0, 0, 0]);
    // Flywheel / bellhousing end, with ribs and starter motor.
    a.cylinder(p.cast, [0, .31, -length / 2 - .045], .23, .10);
    a.cylinder(p.dark, [0, .31, -length / 2 - .102], .176, .016);
    a.cylinder(p.steel, [0, .31, -length / 2 - .114], .065, .025);
    a.cylinder(p.dark, [width / 2, .22, -length / 2 + .06], .065, .24);
    if (options.performance) {
      const x = inline ? -.33 : .43;
      a.add(new THREE.TorusGeometry(.075, .032, 8, 18), p.cast, [x, .42, -.07]);
      a.cylinder(p.dark, [x, .42, -.035], .049, .018);
      a.tube(p.cast, [[x, .49, -.07], [x, .62, -.12], [x * .6, .77, -.18]], .025);
    }
    return a.build(`Detailed ${family.toUpperCase()} ${condition} engine`);
  });
}

export function createWheelModel(style: 'street' | 'sport' = 'street', options: PartOptions = {}): THREE.Group {
  const condition = options.condition ?? 'new';
  return cached(`wheel-${style}-${condition}`, () => {
    const p = palette(condition), a = new Assembly();
    const profile = [[.235,-.12],[.29,-.132],[.337,-.119],[.356,-.09],[.361,-.06],[.361,.06],[.356,.09],[.337,.119],[.29,.132],[.235,.12]].map(([r, y]) => new THREE.Vector2(r, y));
    a.add(new THREE.LatheGeometry(profile, 48), p.rubber, [0, .362, 0], [Math.PI / 2, 0, 0]);
    for (const side of [-1, 1]) {
      a.add(new THREE.TorusGeometry(.29, .035, 8, 40), p.sidewall, [0, .362, side * .113]);
      a.add(new THREE.TorusGeometry(.238, .012, 6, 36), p.steel, [0, .362, side * .132]);
    }
    // Four broken tread bands leave longitudinal channels and staggered sipes.
    for (let row = 0; row < 4; row++) for (let i = 0; i < 40; i++) {
      const angle = (i + (row % 2) * .5) / 40 * Math.PI * 2;
      const x = Math.sin(angle) * .359, y = .362 + Math.cos(angle) * .359;
      a.box(p.sidewall, [x, y, -.083 + row * .055], [.035, .006, .045], 0, [0, 0, -angle + (row % 2 ? .08 : -.08)]);
    }
    a.cylinder(p.dark, [0, .362, 0], .23, .2);
    // Exposed rotor, hub and caliper sit behind a genuinely open spoke face.
    a.cylinder(p.steel, [0, .362, .099], .192, .012);
    a.cylinder(p.dark, [0, .362, .109], .072, .025);
    a.box(style === 'sport' ? p.accent : p.dark, [.14, .42, .118], [.068, .13, .045], .012, [0, 0, -.3]);
    const spokeCount = style === 'sport' ? 10 : 5;
    for (let i = 0; i < spokeCount; i++) {
      const angle = i / spokeCount * Math.PI * 2;
      a.box(p.steel, [Math.sin(angle) * .132, .362 + Math.cos(angle) * .132, .139], [style === 'sport' ? .021 : .048, .187, .028], .007, [0, 0, -angle]);
    }
    a.cylinder(p.steel, [0, .362, .153], .061, .025);
    a.cylinder(p.dark, [0, .362, .168], .032, .006);
    for (let i = 0; i < 5; i++) {
      const angle = i / 5 * Math.PI * 2;
      a.cylinder(p.dark, [Math.sin(angle) * .045, .362 + Math.cos(angle) * .045, .17], .01, .009, [Math.PI / 2, 0, 0], 6);
    }
    a.cylinder(p.rubber, [.145, .51, .148], .008, .035, [.5, .5, 0], 8);
    // Moulded shoulder ribs read at close inspection without a separate decal draw.
    for (let i = 0; i < 52; i++) {
      const angle = i / 52 * Math.PI * 2;
      a.box(p.rubber, [Math.sin(angle) * .312, .362 + Math.cos(angle) * .312, .139], [.007, .02, .003], 0, [0, 0, -angle]);
    }
    return a.build(`${condition} ${style} wheel and tire`);
  });
}

function paintLabel(color: string, name: string, condition: PartCondition) {
  const key = `${color}-${name}-${condition}`;
  let material = canLabels.get(key);
  if (material) return material;
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 256;
  const c = canvas.getContext('2d')!;
  c.fillStyle = condition === 'new' ? '#e6ddc2' : '#bab098'; c.fillRect(0, 0, 512, 256);
  c.fillStyle = color; c.fillRect(0, 0, 512, 42); c.fillRect(0, 178, 512, 52);
  c.fillStyle = '#243538'; c.textAlign = 'center';
  c.font = 'bold 35px sans-serif'; c.fillText('HOLLOWAY', 256, 86);
  c.font = 'bold 21px sans-serif'; c.fillText('AUTOMOTIVE REFINISH', 256, 120);
  c.font = '18px monospace'; c.fillText(name.toUpperCase().slice(0, 24), 256, 151);
  c.font = '14px monospace'; c.fillText('1 L  /  BASE COAT', 256, 249);
  for (let i = 0; i < 18; i++) {
    c.fillStyle = '#263437'; c.fillRect(20 + i * 4, 98, i % 3 ? 2 : 3, 48);
  }
  if (condition === 'salvage') {
    c.strokeStyle = 'rgba(74,54,32,.35)'; c.lineWidth = 1;
    for (let i = 0; i < 19; i++) { c.beginPath(); c.moveTo(i * 29 % 512, i * 37 % 256); c.lineTo(i * 29 % 512 + 18, i * 37 % 256 + 4); c.stroke(); }
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  material = new THREE.MeshStandardMaterial({ map: texture, roughness: .77 }); canLabels.set(key, material);
  return material;
}

export function createPaintCan(color: string, name = 'Workshop finish', options: PartOptions = {}): THREE.Group {
  const condition = options.condition ?? 'new';
  return cached(`paint-${color}-${name}-${condition}`, () => {
    const p = palette(condition), a = new Assembly();
    a.cylinder(p.steel, [0, .205, 0], .181, .4, [0, 0, 0], 32);
    a.add(new THREE.CylinderGeometry(.183, .183, .31, 32, 1, true), paintLabel(color, name, condition), [0, .207, 0], [0, Math.PI, 0]);
    for (const y of [.014, .389]) a.add(new THREE.TorusGeometry(.18, .009, 6, 32), p.steel, [0, y, 0], [Math.PI / 2, 0, 0]);
    a.cylinder(p.dark, [0, .4, 0], .167, .008, [0, 0, 0], 32);
    a.cylinder(p.steel, [0, .407, 0], .157, .009, [0, 0, 0], 32);
    a.add(new THREE.TorusGeometry(.145, .003, 5, 32), p.dark, [0, .414, 0], [Math.PI / 2, 0, 0]);
    for (const x of [-.184, .184]) a.cylinder(p.steel, [x, .29, 0], .017, .015, [0, 0, Math.PI / 2], 12);
    const handle = Array.from({ length: 17 }, (_, i) => {
      const angle = i / 16 * Math.PI;
      return [Math.cos(angle) * .193, .29 + Math.sin(angle) * .288, 0];
    });
    a.tube(p.steel, handle, .0055, 20);
    a.tube(p.dark, [[-.048, .568, 0], [0, .579, 0], [.048, .568, 0]], .012, 8);
    return a.build(`${name} paint tin`);
  });
}

const extras = new Map<string, THREE.MeshStandardMaterial>();
/** One-off finishes for the tuning parts: anodised bottle blue, racing magnesium, polished pipe. */
function extra(name: string, make: () => THREE.MeshStandardMaterial) {
  let material = extras.get(name);
  if (!material) { material = make(); extras.set(name, material); }
  return material;
}

/** A turbocharger on its mounting flange: alloy compressor one side, cast iron turbine the other. About 0.5 m across. */
export function createTurboModel(options: PartOptions = {}): THREE.Group {
  const condition = options.condition ?? 'new';
  return cached(`turbo-${condition}`, () => {
    const p = palette(condition), a = new Assembly(), along = [0, 0, Math.PI / 2], facing = [0, Math.PI / 2, 0];
    // The shaft runs along X: cold side at -x, hot side at +x.
    a.add(new THREE.TorusGeometry(.118, .062, 10, 26), p.cast, [-.13, .22, 0], facing);
    a.cylinder(p.cast, [-.13, .22, 0], .118, .1, along, 22);
    a.cylinder(p.cast, [-.215, .22, 0], .082, .09, along, 20);
    a.cylinder(p.dark, [-.262, .22, 0], .068, .008, along, 20);
    a.cylinder(p.steel, [-.262, .22, 0], .022, .03, along, 6);
    for (let blade = 0; blade < 9; blade++) {
      const angle = blade / 9 * Math.PI * 2;
      a.box(p.steel, [-.264, .22 + Math.cos(angle) * .038, Math.sin(angle) * .038], [.006, .05, .012], 0, [angle + .5, 0, 0]);
    }
    a.cylinder(p.steel, [0, .22, 0], .058, .17, along, 16);
    a.box(p.steel, [0, .15, 0], [.09, .03, .11], .006);
    a.add(new THREE.TorusGeometry(.106, .058, 10, 26), p.iron, [.13, .22, 0], facing);
    a.cylinder(p.iron, [.13, .22, 0], .1, .1, along, 22);
    a.cylinder(p.iron, [.2, .22, 0], .07, .06, along, 18);
    a.cylinder(p.dark, [.232, .22, 0], .058, .008, along, 18);
    // Compressor outlet sweeps up and back toward the intake.
    a.tube(p.cast, [[-.13, .34, -.04], [-.13, .42, .02], [-.13, .45, .13], [-.13, .44, .22]], .046, 10);
    a.cylinder(p.steel, [-.13, .44, .225], .054, .014, [Math.PI / 2, 0, 0], 16);
    // Turbine inlet and its bolted flange.
    a.cylinder(p.iron, [.13, .1, 0], .056, .1, [0, 0, 0], 14);
    a.box(p.iron, [.13, .035, 0], [.19, .03, .17], .008);
    for (const dx of [-.07, .07]) for (const dz of [-.06, .06]) a.cylinder(p.steel, [.13 + dx, .056, dz], .012, .02, [0, 0, 0], 6);
    a.box(p.dark, [.13, .012, 0], [.25, .024, .22], .006);
    // Wastegate can and its rod across to the hot side.
    a.cylinder(p.accent, [-.02, .39, -.14], .052, .07, [Math.PI / 2, 0, 0], 16);
    a.cylinder(p.steel, [-.02, .39, -.185], .03, .02, [Math.PI / 2, 0, 0], 12);
    a.tube(p.steel, [[-.02, .39, -.1], [.07, .33, -.07], [.15, .3, -.06]], .008, 8);
    a.tube(p.rubber, [[0, .28, .02], [.0, .36, .07], [.04, .43, .16]], .011, 8);
    return a.build(`${condition} turbocharger`);
  });
}

/** A performance exhaust laid out on the ground: either a silencer with twin tips, or a pair of chromed side pipes. About 1.5 m long. */
export function createExhaustModel(options: PartOptions & { style?: 'system' | 'sidepipes' } = {}): THREE.Group {
  const condition = options.condition ?? 'new', style = options.style ?? 'system';
  return cached(`exhaust-${style}-${condition}`, () => {
    const p = palette(condition), a = new Assembly();
    const chrome = extra(`pipe-${condition}`, () => new THREE.MeshStandardMaterial({ color: condition === 'new' ? '#d3d7d3' : '#a9a79a', metalness: 1, roughness: condition === 'new' ? .14 : .34 }));
    if (style === 'sidepipes') {
      for (const x of [-.11, .11]) {
        a.cylinder(chrome, [x, .07, 0], .058, 1.42, [Math.PI / 2, 0, 0], 20);
        a.cylinder(chrome, [x, .07, .76], .07, .12, [Math.PI / 2, 0, 0], 20);
        a.cylinder(p.dark, [x, .07, .823], .056, .006, [Math.PI / 2, 0, 0], 18);
        a.tube(chrome, [[x, .07, -.71], [x * 1.3, .1, -.83], [x * 2.4, .17, -.92]], .05, 8);
        // Slotted heat shield along the outer face.
        a.box(p.steel, [x + Math.sign(x) * .052, .09, .05], [.014, .09, .96], .004);
        for (let slot = 0; slot < 9; slot++) a.box(p.dark, [x + Math.sign(x) * .06, .09, -.36 + slot * .1], [.004, .05, .055], 0);
      }
      for (const z of [-.45, .45]) a.box(p.dark, [0, .03, z], [.34, .03, .05], .006);
    } else {
      a.tube(chrome, [[-.02, .08, -.78], [-.02, .08, -.5], [.03, .09, -.34], [.06, .1, -.2]], .034, 12);
      // Straight-through silencer: an oval can with a rolled seam at each end.
      a.cylinder(chrome, [.06, .1, .08], .1, .56, [Math.PI / 2, 0, 0], 22);
      for (const z of [-.2, .36]) a.add(new THREE.TorusGeometry(.1, .012, 6, 22), p.steel, [.06, .1, z]);
      a.box(p.accent, [.06, .204, .08], [.1, .006, .16], .002);
      for (const x of [.005, .115]) {
        a.cylinder(chrome, [x, .1, .52], .048, .34, [Math.PI / 2, 0, 0], 18);
        a.add(new THREE.TorusGeometry(.049, .008, 6, 18), p.steel, [x, .1, .69]);
        a.cylinder(p.dark, [x, .1, .687], .041, .004, [Math.PI / 2, 0, 0], 16);
      }
      for (const z of [-.6, -.1, .3]) { a.box(p.dark, [.03, .19, z], [.05, .02, .03], .004); a.tube(p.rubber, [[.03, .2, z], [.03, .24, z + .02], [.05, .27, z]], .012, 6); }
    }
    return a.build(`${condition} ${style === 'sidepipes' ? 'side pipes' : 'sport exhaust'}`);
  });
}

/** A nitrous bottle standing in its bracket, with the valve, gauge and braided feed line. About 0.62 m tall. */
export function createNitroModel(): THREE.Group {
  return cached('nitro-bottle', () => {
    const p = palette('new'), a = new Assembly();
    const blue = extra('bottle', () => new THREE.MeshStandardMaterial({ color: '#1f5db0', metalness: .5, roughness: .28 }));
    const label = extra('bottle-label', () => new THREE.MeshStandardMaterial({ color: '#ece6d2', roughness: .7 }));
    const brass = extra('brass', () => new THREE.MeshStandardMaterial({ color: '#c9a24a', metalness: .9, roughness: .3 }));
    a.cylinder(blue, [0, .25, 0], .088, .42, [0, 0, 0], 26);
    a.add(new THREE.SphereGeometry(.088, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2), blue, [0, .46, 0]);
    a.cylinder(blue, [0, .03, 0], .08, .04, [0, 0, 0], 24);
    a.add(new THREE.CylinderGeometry(.0895, .0895, .13, 26, 1, true), label, [0, .29, 0]);
    a.add(new THREE.CylinderGeometry(.0897, .0897, .02, 26, 1, true), p.accent, [0, .345, 0]);
    // Valve, hand wheel and pressure gauge.
    a.cylinder(brass, [0, .565, 0], .024, .06, [0, 0, 0], 12);
    a.box(brass, [0, .6, 0], [.05, .04, .05], .006);
    a.cylinder(p.accent, [0, .632, 0], .042, .012, [0, 0, 0], 8);
    a.cylinder(p.steel, [-.045, .6, 0], .026, .016, [0, 0, Math.PI / 2], 16);
    a.cylinder(label, [-.054, .6, 0], .021, .002, [0, 0, Math.PI / 2], 16);
    a.tube(p.steel, [[.025, .6, 0], [.09, .6, .01], [.13, .5, .03], [.14, .3, .05], [.16, .06, .1]], .011, 14);
    // Two steel straps hold it to a bracket.
    for (const y of [.14, .4]) a.add(new THREE.TorusGeometry(.092, .009, 5, 24), p.steel, [0, y, 0], [Math.PI / 2, 0, 0]);
    a.box(p.dark, [0, .27, -.1], [.12, .44, .016], .004);
    a.box(p.dark, [0, .012, -.02], [.24, .024, .24], .006);
    return a.build('nitrous bottle');
  });
}

/**
 * Four magnesium racing wheels on slicks: three stacked flat the way a pit crew leaves them, the fourth leaning
 * against the pile with its spokes showing. About 0.8 m tall and 1.1 m across.
 */
export function createRacingWheelStack(options: PartOptions = {}): THREE.Group {
  const condition = options.condition ?? 'salvage';
  return cached('racing-wheels-' + condition, () => {
    const p = palette(condition), a = new Assembly();
    const magnesium = extra('magnesium-' + condition, () => new THREE.MeshStandardMaterial({ color: condition === 'new' ? '#a08a52' : '#93804c', metalness: .72, roughness: condition === 'new' ? .38 : .52 }));
    const chalk = extra('chalk', () => new THREE.MeshStandardMaterial({ color: '#d9c25a', roughness: .9 }));
    const profile = [[.232, -.126], [.29, -.132], [.34, -.122], [.36, -.092], [.364, -.06], [.364, .06], [.36, .092], [.34, .122], [.29, .132], [.232, .126]].map(([r, y]) => new THREE.Vector2(r, y));
    // One wheel, built lying flat around the origin with its face up, then turned and moved into place as a whole.
    const wheel = (matrix: THREE.Matrix4, turn: number) => {
      const place = (geometry: THREE.BufferGeometry, material: THREE.Material, position: number[] = [0, 0, 0], rotation: number[] = [0, 0, 0]) => {
        geometry.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation[0], rotation[1], rotation[2])), new THREE.Vector3(1, 1, 1)));
        geometry.applyMatrix4(matrix);
        a.add(geometry, material);
      };
      place(new THREE.LatheGeometry(profile, 40), p.rubber);
      place(new THREE.CylinderGeometry(.236, .236, .21, 30, 1, true), magnesium);
      place(new THREE.CylinderGeometry(.228, .228, .012, 28), p.dark, [0, .05, 0]);
      place(new THREE.TorusGeometry(.24, .013, 6, 36), magnesium, [0, .106, 0], [Math.PI / 2, 0, 0]);
      // Eight short spokes around a deep hub, with a single centre nut.
      for (let spoke = 0; spoke < 8; spoke++) {
        const angle = turn + spoke / 8 * Math.PI * 2;
        place(new THREE.BoxGeometry(.058, .03, .2), magnesium, [Math.sin(angle) * .128, .075, Math.cos(angle) * .128], [0, angle, 0]);
      }
      place(new THREE.CylinderGeometry(.072, .072, .05, 18), magnesium, [0, .085, 0]);
      place(new THREE.CylinderGeometry(.03, .03, .02, 6), p.steel, [0, .118, 0]);
      // A yellow chalk stripe across the sidewall, as scrutineers leave.
      place(new THREE.BoxGeometry(.03, .004, .09), chalk, [Math.sin(turn + .4) * .3, .1275, Math.cos(turn + .4) * .3], [0, turn + .4, 0]);
    };
    const flat = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z);
    wheel(flat(-.16, .134, 0), 0);
    wheel(flat(-.13, .396, -.02), .7);
    wheel(flat(-.17, .658, .025), 1.4);
    // The fourth stands on its tread and leans back against the pile, face outward.
    const leaning = new THREE.Matrix4().compose(new THREE.Vector3(.36, .37, .02), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -Math.PI / 2 + .2)), new THREE.Vector3(1, 1, 1));
    wheel(leaning, .3);
    return a.build('magnesium racing wheel set');
  });
}
