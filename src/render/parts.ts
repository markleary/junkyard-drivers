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
    rubber: new THREE.MeshStandardMaterial({ color: used ? '#292b27' : '#171d1e', roughness: .91 }),
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
