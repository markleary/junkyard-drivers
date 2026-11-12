import * as THREE from 'three';
import type { WorldBuilder, PlaceOptions, CylinderOptions } from '../builder';
import type { QualitySettings } from '../quality';
import type { TownLayout } from '../../world/layout';
import { flat, lights, registerGlow } from '../materials';
import { surface } from '../surfaces';

export interface WorldInteractable {
  id: string;
  kind: 'workbench' | 'listing' | 'rack' | 'store' | 'dealer';
  listingId?: string;
  position: THREE.Vector3;
  label: string;
}

/** A light fitting that glows after dark. The nearest few also carry a real light. */
export interface LampSpot { x: number; y: number; z: number; color: number; reach: number }

export interface SceneContext {
  b: WorldBuilder;
  root: THREE.Group;
  rng: () => number;
  layout: TownLayout;
  quality: QualitySettings;
  interactables: WorldInteractable[];
  lamps: LampSpot[];
  /** Per-frame callbacks for the few things that move: vanes, flags, the crane hook. */
  animated: ((seconds: number, dt: number) => void)[];
}

/** The game's working palette. Yard rust and enamel, workshop cream, parts-counter blue. */
export const C = {
  rust: 0x9a5a38, rustDark: 0x6e3f2a, rustLight: 0xb98658, primer: 0x8d857a, oxide: 0xa63e2e, oxideDark: 0x772b22,
  cream: 0xe2d8bf, paper: 0xede4ce, ink: 0x20292c, steel: 0x8a9492, steelDark: 0x3a4446, galvanised: 0xa9b3b0,
  blue: 0x24566a, blueLight: 0x5d8796, teal: 0x3f7f86, yellow: 0xe3b449, amber: 0xe8a23c, green: 0x345d43, sage: 0x7f946e,
  wood: 0x8a6a44, woodDark: 0x5b4630, woodPale: 0xb89a6c, rubber: 0x292c2b, black: 0x181c1c, white: 0xe9e6dc,
  concrete: 0xa7a398, concretePale: 0xbdb9ad, asphalt: 0x5e5f60, asphaltWorn: 0x6b6b68, gravel: 0x9a8d76, gravelDark: 0x7c7260,
  dirt: 0x8b7c64, grass: 0x6c7d3c, grassDry: 0x8f8e4a, grassLush: 0x587433, brick: 0x9a5540, brickDark: 0x7b4636, brickPale: 0xb9876a,
  plaster: 0xd3c8b0, lampWarm: 0xffd9a0, lampCool: 0xdfeaff, sodium: 0xffb060, neonRed: 0xff4a36, neonBlue: 0x58c8ff, neonAmber: 0xffb347,
} as const;

/** Places pieces in the local frame of one prop: x to its right, z toward its back. */
export class Part {
  private cos: number;
  private sin: number;
  constructor(readonly b: WorldBuilder, readonly x: number, readonly y: number, readonly z: number, readonly yaw = 0) {
    this.cos = Math.cos(yaw); this.sin = Math.sin(yaw);
  }
  at(dx: number, dz: number): [number, number] {
    return [this.x + dx * this.cos + dz * this.sin, this.z - dx * this.sin + dz * this.cos];
  }
  point(dx: number, dy: number, dz: number) {
    const [x, z] = this.at(dx, dz);
    return new THREE.Vector3(x, this.y + dy, z);
  }
  box(material: THREE.Material, dx: number, dy: number, dz: number, w: number, h: number, d: number, options: PlaceOptions = {}) {
    const [x, z] = this.at(dx, dz);
    this.b.box(material, x, this.y + dy, z, w, h, d, { ...options, yaw: this.yaw + (options.yaw ?? 0) });
  }
  cyl(material: THREE.Material, dx: number, dy: number, dz: number, radius: number, height: number, options: CylinderOptions = {}) {
    const [x, z] = this.at(dx, dz);
    this.b.cylinder(material, x, this.y + dy, z, radius, height, { ...options, yaw: this.yaw + (options.yaw ?? 0) });
  }
  beam(material: THREE.Material, a: [number, number, number], b: [number, number, number], radius: number, options: CylinderOptions = {}) {
    this.b.beam(material, this.point(...a), this.point(...b), radius, options);
  }
  quad(material: THREE.Material, dx: number, dy: number, dz: number, w: number, d: number, options: PlaceOptions = {}) {
    const [x, z] = this.at(dx, dz);
    this.b.quad(material, x, this.y + dy, z, w, d, { ...options, yaw: this.yaw + (options.yaw ?? 0) });
  }
  /** A collider in the prop's frame. */
  solid(dx: number, dy: number, dz: number, w: number, h: number, d: number) {
    const [x, z] = this.at(dx, dz);
    this.b.solidBox(x, this.y + dy, z, w, h, d, { yaw: this.yaw });
  }
  child(dx: number, dy: number, dz: number, yaw = 0) {
    const [x, z] = this.at(dx, dz);
    return new Part(this.b, x, this.y + dy, z, this.yaw + yaw);
  }
}

export interface SignOptions {
  color?: string;
  bg?: string;
  yaw?: number;
  sub?: string;
  /** Enamel board (default), a hand-painted plank, or tube lettering that lights after dark. */
  style?: 'enamel' | 'plank' | 'neon';
  /** Lit colour for neon signs. */
  glow?: number;
  /** Leave off the steel backing when the sign is mounted flat on a wall. */
  bare?: boolean;
}

const DISPLAY = '"Barlow Condensed", Impact, "Arial Narrow", sans-serif';
const MONO = '"IBM Plex Mono", "Courier New", monospace';

/** Printed and painted signage, lettered in the same faces as the interface. */
export function sign(ctx: SceneContext, text: string, x: number, y: number, z: number, width: number, height: number, options: SignOptions = {}) {
  const canvas = document.createElement('canvas');
  // Wide fascia signs still need enough rows for the subtitle and border insets.
  canvas.height = Math.max(128, Math.min(512, Math.round(1024 * height / width)));
  canvas.width = Math.round(canvas.height * width / height);
  const context = canvas.getContext('2d')!;
  const w = canvas.width, h = canvas.height, style = options.style ?? 'enamel', neon = style === 'neon';
  context.fillStyle = neon ? '#0d1416' : options.bg ?? '#283b36';
  context.fillRect(0, 0, w, h);
  const ink = options.color ?? (neon ? '#ffffff' : '#ecdfc0');
  if (style === 'plank') {
    for (let i = 0; i < 5; i++) { context.fillStyle = `rgba(30,20,10,${.05 + (i % 2) * .05})`; context.fillRect(0, h * i / 5, w, 2); }
  } else if (!neon) {
    context.strokeStyle = ink; context.globalAlpha = .82; context.lineWidth = Math.max(4, h * .035);
    const inset = h * .08;
    context.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
    context.globalAlpha = 1;
    // Enamel boards are bolted at the corners.
    context.fillStyle = 'rgba(20,22,20,.55)';
    for (const [cx, cy] of [[inset * 1.9, inset * 1.9], [w - inset * 1.9, inset * 1.9], [inset * 1.9, h - inset * 1.9], [w - inset * 1.9, h - inset * 1.9]]) {
      context.beginPath(); context.arc(cx, cy, h * .018, 0, Math.PI * 2); context.fill();
    }
  }
  context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillStyle = ink;
  const size = Math.min(h * (options.sub ? .44 : .6), w / Math.max(3, text.length) * 1.75);
  context.font = `800 ${size}px ${DISPLAY}`;
  if (neon) { context.shadowColor = ink; context.shadowBlur = h * .08; }
  context.fillText(text, w / 2, h * (options.sub ? .41 : .53));
  context.shadowBlur = 0;
  if (options.sub) {
    context.font = `500 ${Math.min(h * .15, 40)}px ${MONO}`;
    context.globalAlpha = .88;
    context.fillText(options.sub, w / 2, h * .78);
    context.globalAlpha = 1;
  }
  if (!neon) {
    // Weather: a faint streak down from the top edge and dust along the bottom.
    const grime = context.createLinearGradient(0, 0, 0, h);
    grime.addColorStop(0, 'rgba(20,18,12,.16)'); grime.addColorStop(.25, 'rgba(20,18,12,0)');
    grime.addColorStop(.8, 'rgba(60,45,25,0)'); grime.addColorStop(1, 'rgba(60,45,25,.2)');
    context.fillStyle = grime; context.fillRect(0, 0, w, h);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8;
  let material: THREE.Material;
  if (neon) {
    const lit = new THREE.MeshBasicMaterial({ map: texture, color: options.glow ?? C.neonRed });
    registerGlow(lit, .55, 3.4, .07, options.glow ?? C.neonRed);
    material = lit;
  } else material = new THREE.MeshStandardMaterial({ map: texture, roughness: style === 'plank' ? .9 : .42, metalness: style === 'plank' ? 0 : .1 });
  const yaw = options.yaw ?? 0;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  mesh.position.set(x, y, z); mesh.rotation.y = yaw;
  mesh.castShadow = false; mesh.receiveShadow = !neon; mesh.matrixAutoUpdate = false; mesh.updateMatrix();
  ctx.root.add(mesh);
  if (!options.bare) {
    // The solid back keeps lettering from reading mirrored from behind.
    const depth = .06, back = .035, plank = style === 'plank', sin = Math.sin(yaw), cos = Math.cos(yaw);
    // Painted, not bare metal: a dark metallic slab turns pure black whenever it faces away from the light.
    ctx.b.box(plank ? surface('wood') : flat.satin, x - sin * back, y, z - cos * back, width + .06, height + .06, depth, { yaw, color: plank ? C.woodDark : 0x707a75 });
    // Two rails across the back, so from behind a sign reads as a sign.
    if (!plank && width > 1.4) for (const dy of [-.27, .27]) {
      ctx.b.box(flat.satin, x - sin * (back + depth / 2 + .018), y + dy * height, z - cos * (back + depth / 2 + .018), width * .97, .075, .035, { yaw, color: 0x4f5955 });
    }
  }
  return mesh;
}

export function postSign(ctx: SceneContext, text: string, x: number, z: number, width = 4, options: SignOptions & { height?: number } = {}) {
  const yaw = options.yaw ?? 0, height = options.height ?? 1.3;
  ctx.b.cylinder(flat.satin, x, 1.8, z, .065, 3.6, { collide: true, color: 0x55615d, segments: 8 });
  ctx.b.cylinder(flat.satin, x, .06, z, .16, .12, { color: 0x55615d, segments: 8 });
  sign(ctx, text, x + Math.sin(yaw) * .14, 3.2, z + Math.cos(yaw) * .14, width, height, options);
}

/* ---------------------------------------------------------------------------
 * Yard props
 * ------------------------------------------------------------------------- */

export function oilDrum(ctx: SceneContext, x: number, z: number, color: number, options: { y?: number; lying?: boolean; collide?: boolean } = {}) {
  const y = options.y ?? 0, b = ctx.b;
  if (options.lying) {
    const yaw = ctx.rng() * Math.PI;
    b.cylinder(flat.satin, x, y + .3, z, .3, .88, { roll: Math.PI / 2, yaw, color, segments: 14, shade: .8 });
    return;
  }
  b.cylinder(flat.satin, x, y + .44, z, .3, .88, { color, segments: 14, shade: .78, collide: options.collide });
  for (const ring of [.02, .3, .6, .87]) b.cylinder(flat.metal, x, y + ring, z, .312, .035, { color: C.steelDark, segments: 14 });
  b.cylinder(flat.metal, x, y + .885, z, .285, .012, { color: 0x4a4f4c, segments: 14 });
}

export function tireStack(ctx: SceneContext, x: number, z: number, count: number, tireGeometry: THREE.BufferGeometry) {
  for (let i = 0; i < count; i++) {
    ctx.b.instance(tireGeometry, flat.rubber, x + (ctx.rng() - .5) * .07, .12 + i * .235, z + (ctx.rng() - .5) * .07,
      { pitch: Math.PI / 2, yaw: ctx.rng() * 6, color: i % 3 ? 0x3b3e3d : 0x484b4a, scale: 1.05 });
  }
  if (count > 2) ctx.b.solidCylinder(x, count * .12, z, .46, count * .24);
}

export function pallet(ctx: SceneContext, x: number, y: number, z: number, yaw: number) {
  const p = new Part(ctx.b, x, y, z, yaw), wood = surface('wood');
  for (const dz of [-.5, 0, .5]) p.box(wood, 0, .05, dz, 1.2, .09, .1, { color: C.woodDark });
  for (let i = 0; i < 6; i++) p.box(wood, -.5 + i * .2, .115, 0, .14, .025, 1.1, { color: i % 2 ? C.woodPale : C.wood });
}

export function crate(ctx: SceneContext, x: number, y: number, z: number, size: number, yaw: number, color: number = C.woodPale) {
  const p = new Part(ctx.b, x, y, z, yaw), wood = surface('wood');
  p.box(wood, 0, size / 2, 0, size, size, size, { color, shade: .8 });
  for (const s of [-1, 1]) {
    p.box(wood, s * (size / 2 + .012), size / 2, 0, .025, size * 1.02, .09, { color: C.woodDark });
    p.box(wood, 0, size / 2, s * (size / 2 + .012), .09, size * 1.02, .025, { color: C.woodDark });
  }
}

/** Ribbed steel freight box. Stacks of them wall off the back lot. */
export function container(ctx: SceneContext, x: number, y: number, z: number, yaw: number, color: number, long = 6.1) {
  const p = new Part(ctx.b, x, y, z, yaw), skin = surface('corrugated');
  const w = 2.44, h = 2.6;
  p.box(skin, 0, h / 2, 0, w, h, long, { color, shade: .82 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(flat.metal, sx * (w / 2 - .04), h / 2, sz * (long / 2 - .04), .13, h + .04, .13, { color: C.steelDark });
  for (const sz of [-1, 1]) {
    p.box(flat.metal, 0, h - .03, sz * (long / 2 - .04), w, .1, .13, { color: C.steelDark });
    p.box(flat.metal, 0, .05, sz * (long / 2 - .04), w, .1, .13, { color: C.steelDark });
  }
  // Door end: two leaves with locking bars.
  for (const sx of [-1, 1]) for (const bar of [-.28, .28]) p.box(flat.metal, sx * (w / 4) + bar, h / 2, long / 2 + .03, .045, h * .9, .04, { color: C.galvanised });
  p.box(flat.metal, 0, h / 2, long / 2 + .012, .03, h * .96, .02, { color: C.black });
  p.solid(0, h / 2, 0, w, h, long);
}

/** Three or four shells stacked the way a loader leaves them. */
export function carStack(ctx: SceneContext, x: number, z: number, yaw: number, count: number, place: (style: number, px: number, py: number, pz: number, pyaw: number, squash: number, roll: number, pitch: number) => { height: number; length: number; width: number }) {
  let y = 0;
  for (let i = 0; i < count; i++) {
    const squash = i === count - 1 ? .82 + ctx.rng() * .16 : .62 + ctx.rng() * .2;
    const body = place(Math.floor(ctx.rng() * 6), x + (ctx.rng() - .5) * .3, y, z + (ctx.rng() - .5) * .35, yaw + (ctx.rng() - .5) * .14 + (ctx.rng() > .85 ? Math.PI : 0), squash, (ctx.rng() - .5) * .07, (ctx.rng() - .5) * .05);
    y += (body.height - .27) * squash - .04;
  }
  ctx.b.solidBox(x, y / 2, z, 1.9, y, 4.6, { yaw });
  return y;
}

/** A tall mast with a pair of work lights, for the yard after dark. */
export function floodlight(ctx: SceneContext, x: number, z: number, yaw: number, height = 9) {
  const p = new Part(ctx.b, x, 0, z, yaw);
  p.cyl(flat.metal, 0, height / 2, 0, .09, height, { color: C.galvanised, segments: 8, taper: .7 });
  p.cyl(surface('concrete'), 0, .2, 0, .32, .4, { color: C.concrete, segments: 8 });
  p.box(flat.satin, 0, height, .15, 1.5, .08, .08, { color: 0x4a5753 });
  for (const dx of [-.5, .5]) {
    p.box(flat.satin, dx, height - .08, .32, .46, .3, .34, { color: 0x4a5753, pitch: .5 });
    p.box(lights.lamp, dx, height - .15, .46, .38, .22, .04, { color: C.lampCool, pitch: .5, cast: false });
  }
  ctx.b.solidCylinder(x, 1.2, z, .14, 2.4);
  const [lx, lz] = p.at(0, 4.5);
  ctx.lamps.push({ x: lx, y: height - .3, z: lz, color: C.lampCool, reach: 26 });
  // Pale gravel needs little help: a strong pool here turns the whole yard white at night.
  lightPool(ctx, lx, lz, 11, C.lampCool, .55);
}

/** Additive disc on the ground under a lamp. Invisible by day. */
export function lightPool(ctx: SceneContext, x: number, z: number, radius: number, color: number, strength = 1, y = .075) {
  const tint = new THREE.Color(color).multiplyScalar(strength);
  ctx.b.quad(lights.pool, x, y, z, radius * 2, radius * 2, { color: tint.getHex(), receive: false });
}

export function trafficCone(ctx: SceneContext, x: number, z: number) {
  ctx.b.box(flat.rubber, x, .02, z, .34, .04, .34, { color: 0x202020, yaw: ctx.rng() });
  ctx.b.cylinder(flat.satin, x, .3, z, .13, .56, { taper: .2, color: 0xe2651e, segments: 10 });
  ctx.b.cylinder(flat.satin, x, .34, z, .098, .1, { taper: .78, color: C.white, segments: 10 });
}

export function dumpster(ctx: SceneContext, x: number, z: number, yaw: number, color: number) {
  const p = new Part(ctx.b, x, 0, z, yaw), skin = surface('metal');
  p.box(skin, 0, .7, 0, 2.2, 1.2, 1.3, { color, shade: .78 });
  p.box(skin, 0, 1.36, -.14, 2.26, .08, 1.36, { color: C.steelDark, pitch: -.16 });
  for (const sx of [-1, 1]) {
    p.box(flat.metal, sx * 1.13, .9, 0, .08, .16, .9, { color: C.steelDark });
    p.cyl(flat.rubber, sx * .85, .1, .45, .1, .08, { roll: Math.PI / 2, color: C.rubber, segments: 8 });
    p.cyl(flat.rubber, sx * .85, .1, -.45, .1, .08, { roll: Math.PI / 2, color: C.rubber, segments: 8 });
  }
  p.solid(0, .7, 0, 2.2, 1.4, 1.3);
}

/* ---------------------------------------------------------------------------
 * Street furniture
 * ------------------------------------------------------------------------- */

export function streetLamp(ctx: SceneContext, x: number, z: number, yaw: number) {
  const p = new Part(ctx.b, x, 0, z, yaw);
  p.cyl(flat.metal, 0, .25, 0, .16, .5, { color: C.steelDark, segments: 8, taper: .7 });
  p.cyl(flat.metal, 0, 3.9, 0, .075, 7.4, { color: C.steelDark, segments: 8, taper: .75 });
  // A swan-neck arm reaches over the kerb.
  p.beam(flat.metal, [0, 7.5, 0], [0, 7.95, -.5], .05, { color: C.steelDark });
  p.beam(flat.metal, [0, 7.95, -.5], [0, 8, -1.7], .045, { color: C.steelDark });
  p.box(flat.metal, 0, 7.96, -2, .34, .13, .72, { color: C.steelDark });
  p.box(lights.lamp, 0, 7.88, -2, .26, .05, .6, { color: C.sodium, cast: false });
  ctx.b.solidCylinder(x, 1.4, z, .12, 2.8);
  const [lx, lz] = p.at(0, -2);
  ctx.lamps.push({ x: lx, y: 7.6, z: lz, color: C.sodium, reach: 20 });
  lightPool(ctx, lx, lz, 9.5, C.sodium, .9);
}

/** Timber pole with a crossarm. Wires are strung by the caller. */
export function utilityPole(ctx: SceneContext, x: number, z: number, yaw: number) {
  const p = new Part(ctx.b, x, 0, z, yaw), wood = surface('bark');
  p.cyl(wood, 0, 4.4, 0, .13, 8.8, { color: 0x6b5744, segments: 8, taper: .7 });
  p.box(surface('wood'), 0, 8.1, 0, 2.2, .12, .12, { color: C.woodDark });
  p.box(surface('wood'), 0, 7.3, 0, 1.5, .1, .1, { color: C.woodDark });
  for (const dx of [-.95, -.4, .4, .95]) p.cyl(flat.satin, dx, 8.24, 0, .035, .16, { color: 0x6f8f8a, segments: 6 });
  p.cyl(flat.metal, .2, 6.6, .16, .16, .5, { color: 0x858c88, segments: 8 });
  ctx.b.solidCylinder(x, 1.4, z, .15, 2.8);
  return [p.point(-.95, 8.3, 0), p.point(.95, 8.3, 0), p.point(-.6, 7.4, 0)] as const;
}

/** A sagging run of cable between two points. */
export function wire(ctx: SceneContext, a: THREE.Vector3, b: THREE.Vector3, sag = .7) {
  const steps = 6;
  let previous = a.clone();
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, point = a.clone().lerp(b, t);
    point.y -= Math.sin(t * Math.PI) * sag;
    ctx.b.beam(flat.rubber, previous, point, .014, { color: 0x15181a, segments: 3, cast: false });
    previous = point;
  }
}

export function hydrant(ctx: SceneContext, x: number, z: number) {
  const b = ctx.b;
  b.cylinder(flat.satin, x, .3, z, .11, .6, { color: 0xb8362a, segments: 8, shade: .8 });
  b.cylinder(flat.satin, x, .64, z, .09, .1, { color: 0xb8362a, segments: 8, taper: .4 });
  b.cylinder(flat.satin, x, .42, z, .055, .34, { color: 0xb8362a, segments: 6, roll: Math.PI / 2 });
  b.cylinder(flat.metal, x, .04, z, .15, .06, { color: 0x6a6f6c, segments: 8 });
}

export function bench(ctx: SceneContext, x: number, z: number, yaw: number) {
  const p = new Part(ctx.b, x, 0, z, yaw), wood = surface('wood');
  for (let i = 0; i < 4; i++) p.box(wood, 0, .45, -.16 + i * .11, 1.6, .035, .09, { color: C.wood });
  for (let i = 0; i < 3; i++) p.box(wood, 0, .62 + i * .13, .22 + i * .03, 1.6, .09, .035, { color: C.wood, pitch: -.18 });
  for (const dx of [-.7, .7]) {
    p.box(flat.metal, dx, .22, 0, .05, .44, .46, { color: C.steelDark });
    p.box(flat.metal, dx, .68, .26, .05, .5, .05, { color: C.steelDark, pitch: -.18 });
  }
  p.solid(0, .4, 0, 1.6, .8, .5);
}

export function trashCan(ctx: SceneContext, x: number, z: number, color: number = C.green) {
  ctx.b.cylinder(flat.satin, x, .45, z, .26, .88, { color, segments: 10, shade: .76 });
  ctx.b.cylinder(flat.metal, x, .92, z, .285, .08, { color: C.steelDark, segments: 10 });
}

export function mailbox(ctx: SceneContext, x: number, z: number, yaw: number) {
  const p = new Part(ctx.b, x, 0, z, yaw);
  for (const dx of [-.18, .18]) for (const dz of [-.16, .16]) p.box(flat.satin, dx, .12, dz, .05, .24, .05, { color: 0x1d3f66 });
  p.box(flat.satin, 0, .68, 0, .5, .9, .46, { color: 0x24528a, shade: .8 });
  // The rounded top stops just inside the sides of the box.
  p.cyl(flat.satin, 0, 1.13, 0, .23, .49, { roll: Math.PI / 2, color: 0x24528a, segments: 10 });
  p.box(flat.satin, 0, .92, -.235, .34, .1, .01, { color: C.white });
}

export function newsBox(ctx: SceneContext, x: number, z: number, yaw: number, color: number) {
  const p = new Part(ctx.b, x, 0, z, yaw);
  p.box(flat.metal, 0, .18, 0, .1, .36, .1, { color: C.steelDark });
  p.box(flat.satin, 0, .72, 0, .42, .76, .36, { color, shade: .82 });
  p.box(flat.satin, 0, .82, -.185, .32, .36, .01, { color: 0x1c2224 });
}

export function planter(ctx: SceneContext, x: number, z: number, bush: (x: number, y: number, z: number, scale: number) => void) {
  ctx.b.box(surface('concrete'), x, .28, z, 1.1, .56, 1.1, { color: C.concretePale, shade: .8 });
  ctx.b.box(surface('dirt'), x, .57, z, .96, .02, .96, { color: 0x4a3a2a });
  bush(x, .58, z, .55);
}

export function roadSign(ctx: SceneContext, x: number, z: number, yaw: number, kind: 'stop' | 'speed' | 'yield') {
  const p = new Part(ctx.b, x, 0, z, yaw);
  p.cyl(flat.metal, 0, 1.25, 0, .035, 2.5, { color: C.galvanised, segments: 6 });
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const c = canvas.getContext('2d')!;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  if (kind === 'stop') {
    c.fillStyle = '#b3251e'; c.beginPath();
    for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; c.lineTo(64 + Math.cos(a) * 62, 64 + Math.sin(a) * 62); }
    c.fill(); c.strokeStyle = '#f2ede2'; c.lineWidth = 5; c.stroke();
    c.fillStyle = '#f2ede2'; c.font = `800 44px ${DISPLAY}`; c.fillText('STOP', 64, 67);
  } else if (kind === 'speed') {
    c.fillStyle = '#f2ede2'; c.fillRect(18, 4, 92, 120); c.strokeStyle = '#1c2224'; c.lineWidth = 5; c.strokeRect(22, 8, 84, 112);
    c.fillStyle = '#1c2224'; c.font = `800 20px ${DISPLAY}`; c.fillText('SPEED', 64, 28); c.fillText('LIMIT', 64, 48);
    c.font = `800 58px ${DISPLAY}`; c.fillText('25', 64, 88);
  } else {
    c.fillStyle = '#e3b449'; c.beginPath(); c.moveTo(64, 4); c.lineTo(124, 64); c.lineTo(64, 124); c.lineTo(4, 64); c.closePath(); c.fill();
    c.strokeStyle = '#1c2224'; c.lineWidth = 5; c.stroke(); c.fillStyle = '#1c2224'; c.font = `800 26px ${DISPLAY}`; c.fillText('SLOW', 64, 66);
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(.72, .72), new THREE.MeshStandardMaterial({ map: texture, alphaTest: .5, roughness: .5 }));
  const [fx, fz] = p.at(0, .05);
  face.position.set(fx, 2.2, fz); face.rotation.y = yaw; face.matrixAutoUpdate = false; face.updateMatrix();
  ctx.root.add(face);
  // Plain galvanised back, so the lettering never reads mirrored from behind.
  p.box(flat.metal, 0, 2.2, .03, kind === 'speed' ? .52 : .6, kind === 'speed' ? .68 : .6, .02, { color: C.galvanised });
}

/** Rooftop and wall equipment that breaks up plain boxes. */
export function airConditioner(ctx: SceneContext, x: number, y: number, z: number, yaw: number) {
  const p = new Part(ctx.b, x, y, z, yaw);
  p.box(surface('metal'), 0, .45, 0, 1.5, .9, 1.1, { color: 0xa9aea8, shade: .8 });
  for (let fin = 0; fin < 9; fin++) p.box(flat.metal, -.6 + fin * .15, .5, .56, .05, .62, .02, { color: 0x4b5250 });
  p.cyl(flat.metal, 0, .92, 0, .36, .05, { color: 0x3c4341, segments: 12 });
}

export function vent(ctx: SceneContext, x: number, y: number, z: number) {
  ctx.b.cylinder(flat.metal, x, y + .25, z, .16, .5, { color: 0x858c88, segments: 8 });
  ctx.b.cylinder(flat.metal, x, y + .58, z, .28, .2, { color: 0x9aa19c, segments: 10, taper: .55 });
}
