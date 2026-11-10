import * as THREE from 'three';
import { FOG_SUN_UNIFORMS } from './atmosphere';

/**
 * Short-lived effects tied to what the car and the workshop are doing: dust off
 * gravel, tire smoke, exhaust haze, sparks, paint mist, and the rubber a sliding
 * tire leaves behind. Two point clouds and one ribbon mesh, all preallocated.
 */
export type ParticleKind = 'dust' | 'smoke' | 'exhaust' | 'spark' | 'mist' | 'sparkle';

interface Recipe { life: [number, number]; size: [number, number]; grow: number; alpha: number; drag: number; gravity: number; additive: boolean; color: number }
const RECIPES: Record<ParticleKind, Recipe> = {
  dust: { life: [.9, 1.8], size: [.35, .7], grow: 2.6, alpha: .3, drag: 1.4, gravity: -.25, additive: false, color: 0xb9a686 },
  smoke: { life: [1.1, 2.1], size: [.3, .55], grow: 3.2, alpha: .34, drag: 1.1, gravity: -.6, additive: false, color: 0xd9d9d4 },
  exhaust: { life: [.5, 1.1], size: [.1, .2], grow: 3.4, alpha: .22, drag: 1.8, gravity: -.5, additive: false, color: 0x8f9296 },
  spark: { life: [.25, .6], size: [.05, .1], grow: -.6, alpha: 1, drag: .6, gravity: 9, additive: true, color: 0xffb04a },
  mist: { life: [.6, 1.2], size: [.16, .32], grow: 2.4, alpha: .3, drag: 2.2, gravity: -.1, additive: false, color: 0xffffff },
  sparkle: { life: [.6, 1.3], size: [.07, .16], grow: -.4, alpha: 1, drag: 1.4, gravity: -1.2, additive: true, color: 0xffd98a },
};

const vertexShader = /* glsl */`
attribute float size;
attribute vec4 tint;
uniform float uScale;
varying vec4 vTint;
#include <fog_pars_vertex>
void main() {
  vTint = tint;
  vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
  gl_PointSize = size * uScale / max( 0.1, - mvPosition.z );
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const fragmentShader = /* glsl */`
uniform vec3 uLight;
varying vec4 vTint;
#include <fog_pars_fragment>
void main() {
  vec2 centred = gl_PointCoord - 0.5;
  float falloff = smoothstep( 0.5, 0.12, length( centred ) );
  if ( falloff * vTint.a < 0.004 ) discard;
  gl_FragColor = vec4( vTint.rgb * uLight, falloff * vTint.a );
  #include <fog_fragment>
}`;

class Cloud {
  readonly points: THREE.Points;
  readonly material: THREE.ShaderMaterial;
  private position: Float32Array; private tint: Float32Array; private size: Float32Array;
  private velocity: Float32Array; private life: Float32Array; private span: Float32Array;
  private start: Float32Array; private grow: Float32Array; private alpha: Float32Array; private drag: Float32Array; private gravity: Float32Array;
  private cursor = 0;
  live = 0;

  constructor(private capacity: number, additive: boolean) {
    this.position = new Float32Array(capacity * 3); this.tint = new Float32Array(capacity * 4); this.size = new Float32Array(capacity);
    this.velocity = new Float32Array(capacity * 3); this.life = new Float32Array(capacity); this.span = new Float32Array(capacity).fill(1);
    this.start = new Float32Array(capacity); this.grow = new Float32Array(capacity); this.alpha = new Float32Array(capacity);
    this.drag = new Float32Array(capacity); this.gravity = new Float32Array(capacity);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.position, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('tint', new THREE.BufferAttribute(this.tint, 4).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      vertexShader, fragmentShader, transparent: true, depthWrite: false, fog: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...FOG_SUN_UNIFORMS, uScale: { value: 600 }, uLight: { value: new THREE.Color(1, 1, 1) } },
    });
    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  spawn(recipe: Recipe, x: number, y: number, z: number, vx: number, vy: number, vz: number, color: THREE.Color, random: () => number, scale: number) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    this.position[i * 3] = x; this.position[i * 3 + 1] = y; this.position[i * 3 + 2] = z;
    this.velocity[i * 3] = vx; this.velocity[i * 3 + 1] = vy; this.velocity[i * 3 + 2] = vz;
    this.span[i] = recipe.life[0] + random() * (recipe.life[1] - recipe.life[0]);
    this.life[i] = this.span[i];
    this.start[i] = (recipe.size[0] + random() * (recipe.size[1] - recipe.size[0])) * scale;
    this.grow[i] = recipe.grow; this.alpha[i] = recipe.alpha; this.drag[i] = recipe.drag; this.gravity[i] = recipe.gravity;
    this.tint[i * 4] = color.r; this.tint[i * 4 + 1] = color.g; this.tint[i * 4 + 2] = color.b; this.tint[i * 4 + 3] = 0;
  }

  update(dt: number) {
    let live = 0;
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.tint[i * 4 + 3] = 0; this.size[i] = 0; continue; }
      live++;
      const o = i * 3, slow = Math.max(0, 1 - this.drag[i] * dt);
      this.velocity[o] *= slow; this.velocity[o + 2] *= slow;
      this.velocity[o + 1] = this.velocity[o + 1] * slow - this.gravity[i] * dt;
      this.position[o] += this.velocity[o] * dt; this.position[o + 1] += this.velocity[o + 1] * dt; this.position[o + 2] += this.velocity[o + 2] * dt;
      // Sparks bounce once on the floor instead of sinking through it.
      if (this.gravity[i] > 2 && this.position[o + 1] < .04) { this.position[o + 1] = .04; this.velocity[o + 1] *= -.35; }
      const age = 1 - this.life[i] / this.span[i];
      this.size[i] = Math.max(0, this.start[i] * (1 + this.grow[i] * age));
      // In quickly, out slowly.
      this.tint[i * 4 + 3] = this.alpha[i] * Math.min(1, age * 9) * (1 - age) * (1 - age * .35);
    }
    this.live = live;
    const geometry = this.points.geometry;
    geometry.getAttribute('position').needsUpdate = true;
    geometry.getAttribute('tint').needsUpdate = true;
    geometry.getAttribute('size').needsUpdate = true;
    this.points.visible = live > 0;
  }
}

const RIBBON_QUADS = 520;
const RIBBON_LIFE = 14;

export class Effects {
  private soft: Cloud;
  private bright: Cloud;
  private color = new THREE.Color();
  private seed = 12345;
  private random = () => { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 4294967296; };
  private ribbon: THREE.Mesh;
  private ribbonPosition: Float32Array;
  private ribbonColor: Float32Array;
  private ribbonAge = new Float32Array(RIBBON_QUADS).fill(RIBBON_LIFE);
  private ribbonStrength = new Float32Array(RIBBON_QUADS);
  private ribbonCursor = 0;
  private last: ({ lx: number; lz: number; rx: number; rz: number; y: number } | undefined)[] = [undefined, undefined, undefined, undefined];

  constructor(scene: THREE.Scene, capacity: number) {
    this.soft = new Cloud(Math.max(32, Math.round(capacity * .82)), false);
    this.bright = new Cloud(Math.max(24, Math.round(capacity * .18)), true);
    scene.add(this.soft.points, this.bright.points);
    this.ribbonPosition = new Float32Array(RIBBON_QUADS * 12);
    this.ribbonColor = new Float32Array(RIBBON_QUADS * 16);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.ribbonPosition, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.ribbonColor, 4).setUsage(THREE.DynamicDrawUsage));
    const indices: number[] = [];
    for (let i = 0; i < RIBBON_QUADS; i++) indices.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3);
    geometry.setIndex(indices);
    this.ribbon = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      color: 0x0d0d0d, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    }));
    this.ribbon.frustumCulled = false;
    this.ribbon.renderOrder = 2;
    this.ribbon.visible = false;
    scene.add(this.ribbon);
  }

  get live() { return this.soft.live + this.bright.live; }

  /** Keeps particle sizes in metres whatever the canvas height and field of view. */
  setViewport(height: number, fovDegrees: number) {
    const scale = height / (2 * Math.tan(fovDegrees * Math.PI / 360));
    this.soft.material.uniforms.uScale.value = scale;
    this.bright.material.uniforms.uScale.value = scale;
  }

  /** Emit `count` particles around a point. `spread` scatters both position and velocity. */
  emit(kind: ParticleKind, x: number, y: number, z: number, vx = 0, vy = 0, vz = 0, options: { count?: number; spread?: number; color?: number; scale?: number } = {}) {
    const recipe = RECIPES[kind], cloud = recipe.additive ? this.bright : this.soft;
    const count = options.count ?? 1, spread = options.spread ?? .3, random = this.random;
    this.color.setHex(options.color ?? recipe.color);
    for (let i = 0; i < count; i++) {
      cloud.spawn(recipe,
        x + (random() - .5) * spread * .6, y + (random() - .5) * spread * .3, z + (random() - .5) * spread * .6,
        vx + (random() - .5) * spread * 2.4, vy + random() * spread * 1.6, vz + (random() - .5) * spread * 2.4,
        this.color, random, options.scale ?? 1);
    }
  }

  /**
   * Lay rubber under one wheel. Call every frame with the contact patch and the
   * car's right vector; pass strength 0 to lift the tire and end the mark.
   */
  skid(wheel: number, x: number, y: number, z: number, rightX: number, rightZ: number, strength: number) {
    const half = .11;
    const now = { lx: x - rightX * half, lz: z - rightZ * half, rx: x + rightX * half, rz: z + rightZ * half, y };
    const previous = this.last[wheel];
    if (strength <= .02) { this.last[wheel] = undefined; return; }
    if (!previous) { this.last[wheel] = now; return; }
    const travelled = Math.hypot((now.lx + now.rx - previous.lx - previous.rx) / 2, (now.lz + now.rz - previous.lz - previous.rz) / 2);
    if (travelled < .28) return;
    if (travelled > 4) { this.last[wheel] = now; return; }
    const i = this.ribbonCursor;
    this.ribbonCursor = (this.ribbonCursor + 1) % RIBBON_QUADS;
    this.ribbonPosition.set([previous.lx, previous.y, previous.lz, previous.rx, previous.y, previous.rz, now.lx, now.y, now.lz, now.rx, now.y, now.rz], i * 12);
    this.ribbonAge[i] = 0;
    this.ribbonStrength[i] = Math.min(1, strength);
    this.ribbon.geometry.getAttribute('position').needsUpdate = true;
    this.last[wheel] = now;
  }

  /** `light` tints unlit smoke and dust so they dim with the evening. */
  update(dt: number, light: THREE.Color) {
    this.soft.material.uniforms.uLight.value.copy(light);
    this.soft.update(dt);
    this.bright.update(dt);
    let visible = false;
    for (let i = 0; i < RIBBON_QUADS; i++) {
      if (this.ribbonAge[i] >= RIBBON_LIFE) continue;
      this.ribbonAge[i] += dt;
      const alpha = this.ribbonAge[i] >= RIBBON_LIFE ? 0 : this.ribbonStrength[i] * .62 * (1 - Math.pow(this.ribbonAge[i] / RIBBON_LIFE, 2));
      for (let corner = 0; corner < 4; corner++) {
        const o = i * 16 + corner * 4;
        this.ribbonColor[o] = this.ribbonColor[o + 1] = this.ribbonColor[o + 2] = 1; this.ribbonColor[o + 3] = alpha;
      }
      visible = visible || alpha > 0;
    }
    this.ribbon.geometry.getAttribute('color').needsUpdate = true;
    this.ribbon.visible = visible;
  }

  /** Forget ribbon continuity, for example when the car is recovered to the workshop. */
  breakSkids() { this.last = [undefined, undefined, undefined, undefined]; }

  dispose() {
    for (const object of [this.soft.points, this.bright.points, this.ribbon]) {
      object.removeFromParent();
      object.geometry.dispose();
      (object.material as THREE.Material).dispose();
    }
  }
}
