import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

/**
 * Static scenery is baked into one mesh per material per map cell. A whole
 * street of trim, sills and gutters then costs a few draw calls, and cells
 * outside the view (or outside the sun's shadow volume) are skipped entirely.
 */
export interface PlaceOptions {
  yaw?: number;
  pitch?: number;
  roll?: number;
  /** sRGB tint multiplied into the material. */
  color?: number;
  /** Add a fixed physics collider matching the shape. */
  collide?: boolean;
  friction?: number;
  cast?: boolean;
  receive?: boolean;
  /** Darken the lower edge (0..1 multiplier) so pieces sit in their own contact shade. */
  shade?: number;
  /** Too large for one cell: always drawn. */
  global?: boolean;
}
export interface CylinderOptions extends PlaceOptions {
  segments?: number;
  /** Top radius as a fraction of the base radius. */
  taper?: number;
  /** Leave off the end caps: tubes, shades and light cones. */
  open?: boolean;
}

class Floats {
  data = new Float32Array(2048);
  length = 0;
  reserve(extra: number) {
    if (this.length + extra <= this.data.length) return;
    let size = this.data.length * 2;
    while (size < this.length + extra) size *= 2;
    const next = new Float32Array(size);
    next.set(this.data.subarray(0, this.length));
    this.data = next;
  }
  trimmed() { return this.data.slice(0, this.length); }
}

interface Bucket {
  material: THREE.Material;
  cast: boolean;
  receive: boolean;
  global: boolean;
  positions: Floats;
  normals: Floats;
  colors: Floats;
  uvs: Floats | null;
  indices: number[];
  vertices: number;
}
interface InstanceBucket {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  cast: boolean;
  receive: boolean;
  matrices: number[];
  colors: number[];
  tinted: boolean;
}
interface Template { positions: Float32Array; normals: Float32Array; uvs: Float32Array | null; indices: ArrayLike<number>; minY: number; height: number }

const linearCache = new Map<number, [number, number, number]>();
const scratchColor = new THREE.Color();
export function linear(hex: number): [number, number, number] {
  let value = linearCache.get(hex);
  if (!value) {
    scratchColor.setHex(hex);
    value = [scratchColor.r, scratchColor.g, scratchColor.b];
    linearCache.set(hex, value);
  }
  return value;
}

function templateFrom(geometry: THREE.BufferGeometry): Template {
  const indexed = geometry.index ? geometry : geometry.clone();
  if (!indexed.getAttribute('normal')) indexed.computeVertexNormals();
  const position = indexed.getAttribute('position'), normal = indexed.getAttribute('normal'), uv = indexed.getAttribute('uv');
  const positions = new Float32Array(position.count * 3), normals = new Float32Array(position.count * 3);
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < position.count; i++) {
    positions[i * 3] = position.getX(i); positions[i * 3 + 1] = position.getY(i); positions[i * 3 + 2] = position.getZ(i);
    normals[i * 3] = normal.getX(i); normals[i * 3 + 1] = normal.getY(i); normals[i * 3 + 2] = normal.getZ(i);
    minY = Math.min(minY, position.getY(i)); maxY = Math.max(maxY, position.getY(i));
  }
  let uvs: Float32Array | null = null;
  if (uv) {
    uvs = new Float32Array(position.count * 2);
    for (let i = 0; i < position.count; i++) { uvs[i * 2] = uv.getX(i); uvs[i * 2 + 1] = uv.getY(i); }
  }
  const indices = indexed.index ? indexed.index.array : Uint32Array.from({ length: position.count }, (_, i) => i);
  return { positions, normals, uvs, indices, minY, height: Math.max(1e-6, maxY - minY) };
}

const UP = new THREE.Vector3(0, 1, 0);

function releaseArray(this: THREE.BufferAttribute) {
  (this as { array: unknown }).array = null;
}

export class WorldBuilder {
  private buckets = new Map<string, Bucket>();
  private instances = new Map<string, InstanceBucket>();
  private templates = new Map<string, Template>();
  private geometryTemplates = new WeakMap<THREE.BufferGeometry, Template>();
  private matrix = new THREE.Matrix4();
  private quaternion = new THREE.Quaternion();
  private euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private position = new THREE.Vector3();
  private scale = new THREE.Vector3();
  private direction = new THREE.Vector3();
  readonly stats = { meshes: 0, instancedMeshes: 0, triangles: 0, colliders: 0 };

  constructor(readonly root: THREE.Object3D, readonly physics: RAPIER.World, private cell = 44) {
    this.templates.set('box', templateFrom(new THREE.BoxGeometry(1, 1, 1)));
    const quad = new THREE.PlaneGeometry(1, 1);
    quad.rotateX(-Math.PI / 2);
    this.templates.set('quad', templateFrom(quad));
  }

  private cellKey(x: number, z: number, global?: boolean) {
    return global ? 'g' : `${Math.floor(x / this.cell)},${Math.floor(z / this.cell)}`;
  }

  private bucket(material: THREE.Material, x: number, z: number, options: PlaceOptions | undefined, uv: boolean): Bucket {
    const cast = options?.cast ?? true, receive = options?.receive ?? true, global = options?.global ?? false;
    const key = `${material.uuid}|${this.cellKey(x, z, global)}|${cast ? 1 : 0}${receive ? 1 : 0}`;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { material, cast, receive, global, positions: new Floats(), normals: new Floats(), colors: new Floats(), uvs: uv ? new Floats() : null, indices: [], vertices: 0 };
      this.buckets.set(key, bucket);
    }
    return bucket;
  }

  private compose(x: number, y: number, z: number, sx: number, sy: number, sz: number, options?: PlaceOptions) {
    this.euler.set(options?.pitch ?? 0, options?.yaw ?? 0, options?.roll ?? 0);
    this.quaternion.setFromEuler(this.euler);
    return this.matrix.compose(this.position.set(x, y, z), this.quaternion, this.scale.set(sx, sy, sz));
  }

  /** Append a transformed copy of a template to the cell that owns its origin. */
  private append(template: Template, material: THREE.Material, matrix: THREE.Matrix4, options?: PlaceOptions, vertexColors?: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) {
    const e = matrix.elements;
    // Surfaces project their own coordinates from world position; everything else that samples a texture needs real ones.
    const textured = material.userData.needsUv === true || (!material.userData.projected && !!(material as THREE.MeshStandardMaterial).map);
    const wantsUv = textured && template.uvs !== null;
    const bucket = this.bucket(material, e[12], e[14], options, wantsUv);
    const count = template.positions.length / 3;
    bucket.positions.reserve(count * 3); bucket.normals.reserve(count * 3); bucket.colors.reserve(count * 3);
    if (bucket.uvs) bucket.uvs.reserve(count * 2);
    const [r, g, b] = options?.color === undefined ? [1, 1, 1] : linear(options.color);
    const shade = options?.shade ?? 1;
    const P = bucket.positions.data, N = bucket.normals.data, C = bucket.colors.data;
    let p = bucket.positions.length;
    // Normals use the inverse-transpose so non-uniform scale keeps them perpendicular.
    const sx = Math.hypot(e[0], e[1], e[2]) || 1, sy = Math.hypot(e[4], e[5], e[6]) || 1, sz = Math.hypot(e[8], e[9], e[10]) || 1;
    const ix = 1 / (sx * sx), iy = 1 / (sy * sy), iz = 1 / (sz * sz);
    for (let i = 0; i < count; i++) {
      const o = i * 3;
      const px = template.positions[o], py = template.positions[o + 1], pz = template.positions[o + 2];
      P[p] = e[0] * px + e[4] * py + e[8] * pz + e[12];
      P[p + 1] = e[1] * px + e[5] * py + e[9] * pz + e[13];
      P[p + 2] = e[2] * px + e[6] * py + e[10] * pz + e[14];
      const nx = template.normals[o] * ix, ny = template.normals[o + 1] * iy, nz = template.normals[o + 2] * iz;
      let tx = e[0] * nx + e[4] * ny + e[8] * nz, ty = e[1] * nx + e[5] * ny + e[9] * nz, tz = e[2] * nx + e[6] * ny + e[10] * nz;
      const length = Math.hypot(tx, ty, tz) || 1;
      tx /= length; ty /= length; tz /= length;
      N[p] = tx; N[p + 1] = ty; N[p + 2] = tz;
      let tone = shade === 1 ? 1 : shade + (1 - shade) * Math.min(1, (py - template.minY) / template.height * 1.6);
      let cr = r, cg = g, cb = b;
      if (vertexColors) { cr *= vertexColors.getX(i); cg *= vertexColors.getY(i); cb *= vertexColors.getZ(i); }
      // Undersides sit in their own shade; a touch of baked occlusion costs nothing at run time.
      if (ty < -.5) tone *= .82;
      C[p] = cr * tone; C[p + 1] = cg * tone; C[p + 2] = cb * tone;
      p += 3;
    }
    bucket.positions.length = bucket.normals.length = bucket.colors.length = p;
    if (bucket.uvs && template.uvs) {
      bucket.uvs.data.set(template.uvs, bucket.uvs.length);
      bucket.uvs.length += template.uvs.length;
    }
    const base = bucket.vertices, indices = template.indices;
    for (let i = 0; i < indices.length; i++) bucket.indices.push(indices[i] + base);
    bucket.vertices += count;
  }

  private cylinderTemplate(segments: number, taper: number, open: boolean) {
    const key = `cyl-${segments}-${taper}-${open ? 1 : 0}`;
    let template = this.templates.get(key);
    if (!template) { template = templateFrom(new THREE.CylinderGeometry(taper, 1, 1, segments, 1, open)); this.templates.set(key, template); }
    return template;
  }

  box(material: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, options?: PlaceOptions) {
    this.append(this.templates.get('box')!, material, this.compose(x, y, z, w, h, d, options), options);
    if (options?.collide) this.solidBox(x, y, z, w, h, d, options);
  }

  /** Upright unless pitch or roll is given. Height is along local Y. */
  cylinder(material: THREE.Material, x: number, y: number, z: number, radius: number, height: number, options?: CylinderOptions) {
    const template = this.cylinderTemplate(options?.segments ?? 12, options?.taper ?? 1, options?.open ?? false);
    this.append(template, material, this.compose(x, y, z, radius, height, radius, options), options);
    if (options?.collide) {
      const collider = RAPIER.ColliderDesc.cylinder(height / 2, radius).setTranslation(x, y, z);
      if (options.friction !== undefined) collider.setFriction(options.friction);
      this.physics.createCollider(collider); this.stats.colliders++;
    }
  }

  /** A round bar between two points: braces, rails, pipes and branches. */
  beam(material: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, radius: number, options?: CylinderOptions) {
    const template = this.cylinderTemplate(options?.segments ?? 6, options?.taper ?? 1, options?.open ?? false);
    this.direction.copy(b).sub(a);
    const length = this.direction.length() || 1e-4;
    this.quaternion.setFromUnitVectors(UP, this.direction.divideScalar(length));
    this.position.copy(a).add(b).multiplyScalar(.5);
    this.matrix.compose(this.position, this.quaternion, this.scale.set(radius, length, radius));
    this.append(template, material, this.matrix, options);
  }

  /** A flat mark lying on the ground, with 0..1 texture coordinates. */
  quad(material: THREE.Material, x: number, y: number, z: number, w: number, d: number, options?: PlaceOptions) {
    this.append(this.templates.get('quad')!, material, this.compose(x, y, z, w, 1, d, options), { cast: false, ...options });
  }

  /** Bake any geometry in place. Geometry vertex colours multiply the tint. */
  geometry(material: THREE.Material, geometry: THREE.BufferGeometry, x: number, y: number, z: number, options?: PlaceOptions & { sx?: number; sy?: number; sz?: number; scale?: number }) {
    let template = this.geometryTemplates.get(geometry);
    if (!template) { template = templateFrom(geometry); this.geometryTemplates.set(geometry, template); }
    const s = options?.scale ?? 1;
    const color = geometry.getAttribute('color') as THREE.BufferAttribute | undefined;
    this.append(template, material, this.compose(x, y, z, (options?.sx ?? 1) * s, (options?.sy ?? 1) * s, (options?.sz ?? 1) * s, options), options, color);
  }

  /** Bake geometry with an explicit transform, for pieces assembled in their own local space. */
  geometryAt(material: THREE.Material, geometry: THREE.BufferGeometry, matrix: THREE.Matrix4, options?: PlaceOptions) {
    let template = this.geometryTemplates.get(geometry);
    if (!template) { template = templateFrom(geometry); this.geometryTemplates.set(geometry, template); }
    this.append(template, material, matrix, options, geometry.getAttribute('color') as THREE.BufferAttribute | undefined);
  }

  /** Bake every mesh of an assembled model, as the part displays are. */
  model(model: THREE.Object3D, x: number, y: number, z: number, yaw = 0, scale = 1, options?: PlaceOptions) {
    model.position.set(x, y, z); model.rotation.set(0, yaw, 0); model.scale.setScalar(scale); model.updateMatrixWorld(true);
    model.traverse(object => {
      if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
      this.geometryAt(object.material, object.geometry, object.matrixWorld, options);
    });
  }

  /** Repeated detailed geometry keeps one copy on the GPU and one transform per placement. */
  instance(geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, options?: PlaceOptions & { sx?: number; sy?: number; sz?: number; scale?: number }) {
    const s = options?.scale ?? 1;
    this.instanceAt(geometry, material, this.compose(x, y, z, (options?.sx ?? 1) * s, (options?.sy ?? 1) * s, (options?.sz ?? 1) * s, options), options);
  }

  instanceAt(geometry: THREE.BufferGeometry, material: THREE.Material, matrix: THREE.Matrix4, options?: PlaceOptions) {
    const e = matrix.elements;
    // A vertex-tinted material reads black from geometry that carries no colours of its own.
    if ((material as THREE.MeshStandardMaterial).vertexColors && !geometry.getAttribute('color')) {
      geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geometry.getAttribute('position').count * 3).fill(1), 3));
    }
    const cast = options?.cast ?? true, receive = options?.receive ?? true;
    const key = `${geometry.uuid}|${material.uuid}|${this.cellKey(e[12], e[14], options?.global)}|${cast ? 1 : 0}${receive ? 1 : 0}`;
    let bucket = this.instances.get(key);
    if (!bucket) { bucket = { geometry, material, cast, receive, matrices: [], colors: [], tinted: false }; this.instances.set(key, bucket); }
    for (let i = 0; i < 16; i++) bucket.matrices.push(e[i]);
    const [r, g, b] = options?.color === undefined ? [1, 1, 1] : linear(options.color);
    if (options?.color !== undefined) bucket.tinted = true;
    bucket.colors.push(r, g, b);
  }

  solidBox(x: number, y: number, z: number, w: number, h: number, d: number, options?: PlaceOptions) {
    this.euler.set(options?.pitch ?? 0, options?.yaw ?? 0, options?.roll ?? 0);
    this.quaternion.setFromEuler(this.euler);
    const collider = RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(x, y, z).setRotation(this.quaternion).setFriction(options?.friction ?? .85);
    this.stats.colliders++;
    return this.physics.createCollider(collider);
  }

  solidCylinder(x: number, y: number, z: number, radius: number, height: number) {
    this.stats.colliders++;
    return this.physics.createCollider(RAPIER.ColliderDesc.cylinder(height / 2, radius).setTranslation(x, y, z));
  }

  solidHull(points: Float32Array, x: number, y: number, z: number, friction = .9) {
    const collider = RAPIER.ColliderDesc.convexHull(points);
    if (!collider) return undefined;
    this.stats.colliders++;
    return this.physics.createCollider(collider.setTranslation(x, y, z).setFriction(friction));
  }

  /** Turn everything gathered so far into meshes. Call once, after all placement. */
  build() {
    for (const bucket of this.buckets.values()) {
      if (!bucket.vertices) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(bucket.positions.trimmed(), 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(bucket.normals.trimmed(), 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(bucket.colors.trimmed(), 3));
      if (bucket.uvs) geometry.setAttribute('uv', new THREE.BufferAttribute(bucket.uvs.trimmed(), 2));
      geometry.setIndex(bucket.vertices > 65535 ? new THREE.BufferAttribute(Uint32Array.from(bucket.indices), 1) : new THREE.BufferAttribute(Uint16Array.from(bucket.indices), 1));
      geometry.computeBoundingSphere(); geometry.computeBoundingBox();
      // Baked scenery never changes and is never read back, so its vertex data lives on the graphics card
      // alone once uploaded. That returns tens of megabytes of memory, which matters most on tablets.
      for (const attribute of [...Object.values(geometry.attributes), geometry.index!]) (attribute as THREE.BufferAttribute).onUpload(releaseArray);
      const mesh = new THREE.Mesh(geometry, bucket.material);
      // Bounds were computed above; with the arrays released there is nothing left for a ray to test.
      mesh.raycast = () => undefined;
      mesh.castShadow = bucket.cast && !bucket.material.transparent;
      mesh.receiveShadow = bucket.receive;
      mesh.frustumCulled = !bucket.global;
      mesh.matrixAutoUpdate = false;
      this.root.add(mesh);
      this.stats.meshes++; this.stats.triangles += bucket.indices.length / 3;
    }
    this.buckets.clear();
    const matrix = new THREE.Matrix4(), color = new THREE.Color();
    for (const bucket of this.instances.values()) {
      const count = bucket.matrices.length / 16;
      const mesh = new THREE.InstancedMesh(bucket.geometry, bucket.material, count);
      for (let i = 0; i < count; i++) {
        mesh.setMatrixAt(i, matrix.fromArray(bucket.matrices, i * 16));
        if (bucket.tinted) mesh.setColorAt(i, color.setRGB(bucket.colors[i * 3], bucket.colors[i * 3 + 1], bucket.colors[i * 3 + 2]));
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = bucket.cast && !bucket.material.transparent;
      mesh.receiveShadow = bucket.receive;
      mesh.matrixAutoUpdate = false;
      mesh.computeBoundingSphere(); mesh.computeBoundingBox();
      this.root.add(mesh);
      this.stats.instancedMeshes++;
      this.stats.triangles += count * (bucket.geometry.index ? bucket.geometry.index.count : bucket.geometry.getAttribute('position').count) / 3;
    }
    this.instances.clear();
    return this.stats;
  }
}
