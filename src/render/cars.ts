import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

type ShellId = 'hachiro' | 'bison' | 'veloce';
export interface CarAppearance { paint?: string; restored?: boolean; wheels?: boolean }
export interface CarVisual {
  group: THREE.Group;
  /** Front left, front right, rear left, rear right. Forward is local -Z. */
  wheels: THREE.Group[];
  setAppearance(options: CarAppearance): void;
  animateWheels(steering: number, rotation: number, suspension?: number[]): void;
  /** Release only resources owned by this car; shared factory assets stay alive. */
  dispose(): void;
}

const metal = new THREE.MeshStandardMaterial({ color: '#b7b9b5', metalness: 0.92, roughness: 0.22 });
const darkMetal = new THREE.MeshStandardMaterial({ color: '#202728', metalness: 0.65, roughness: 0.52 });
const rubber = new THREE.MeshStandardMaterial({ color: '#1d201e', roughness: 0.9 });
const glass = new THREE.MeshPhysicalMaterial({ color: '#819a9e', metalness: 0.05, roughness: 0.065, clearcoat: 1, clearcoatRoughness: 0.035, transparent: true, opacity: 0.62, depthWrite: false, envMapIntensity: 1.15 });
const interior = new THREE.MeshStandardMaterial({ color: '#252725', roughness: 0.97 });
const lamp = new THREE.MeshStandardMaterial({ color: '#fff3cd', emissive: '#ffe8ac', emissiveIntensity: 0.08, roughness: 0.14 });
const tailLamp = new THREE.MeshStandardMaterial({ color: '#ad201a', emissive: '#cd2c17', emissiveIntensity: 0.13, roughness: 0.22 });
const amber = new THREE.MeshStandardMaterial({ color: '#e79028', emissive: '#a85412', emissiveIntensity: 0.08, roughness: 0.26 });
const black = new THREE.MeshStandardMaterial({ color: '#101818', roughness: 0.7 });
const brake = new THREE.MeshStandardMaterial({ color: '#a24429', metalness: 0.55, roughness: 0.35 });
const supportConcrete = new THREE.MeshStandardMaterial({ color: '#858071', roughness: 0.98 });
const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const lugGeometry = new THREE.CylinderGeometry(.012, .012, .018, 6);
const sharedMaterials = new Set<THREE.Material>([metal, darkMetal, rubber, glass, interior, lamp, tailLamp, amber, black, brake, supportConcrete]);
const surfaceTextures = new Map<string, THREE.CanvasTexture>();

/** Details are baked together within each rigid assembly, never across wheel pivots. */
function batchAssembly(parent: THREE.Object3D) {
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const originalGeometries = new Set<THREE.BufferGeometry>();
  for (const object of [...parent.children]) {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) continue;
    object.updateMatrix();
    const geometries = buckets.get(object.material) ?? [];
    const append = (matrix: THREE.Matrix4) => {
      const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
      if (!geometry.getAttribute('uv')) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geometry.getAttribute('position').count * 2), 2));
      geometry.applyMatrix4(matrix); geometries.push(geometry);
    };
    if (object instanceof THREE.InstancedMesh) {
      const matrix = new THREE.Matrix4();
      for (let i = 0; i < object.count; i++) { object.getMatrixAt(i, matrix); append(matrix.premultiply(object.matrix)); }
      object.dispose();
    } else append(object.matrix);
    buckets.set(object.material, geometries);
    if (object.geometry !== boxGeometry && object.geometry !== lugGeometry) originalGeometries.add(object.geometry);
    parent.remove(object);
  }
  for (const [material, pieces] of buckets) {
    const geometry = mergeGeometries(pieces, false)!;
    pieces.forEach(piece => piece.dispose());
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
  }
  originalGeometries.forEach(geometry => geometry.dispose());
}

function fineFinish() {
  if (surfaceTextures.has('finish')) return surfaceTextures.get('finish')!;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d')!, image = context.createImageData(128, 128);
  let seed = 871;
  for (let i = 0; i < image.data.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const value = 116 + seed % 24;
    image.data[i] = image.data[i + 1] = image.data[i + 2] = value; image.data[i + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas); texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(12, 12); texture.anisotropy = 8; surfaceTextures.set('finish', texture);
  return texture;
}

function lensFinish() {
  if (surfaceTextures.has('lens')) return surfaceTextures.get('lens')!;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#ecebe4'; context.fillRect(0, 0, 128, 128);
  for (let x = 0; x < 128; x += 8) {
    const gradient = context.createLinearGradient(x, 0, x + 8, 0);
    gradient.addColorStop(0, '#b1b8b4'); gradient.addColorStop(.3, '#fafbf5'); gradient.addColorStop(1, '#d4d9d2');
    context.fillStyle = gradient; context.fillRect(x, 0, 8, 128);
  }
  context.fillStyle = 'rgba(51,61,57,.16)';
  for (let y = 0; y < 128; y += 32) context.fillRect(0, y, 128, 1);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  surfaceTextures.set('lens', texture); return texture;
}

function box(parent: THREE.Object3D, material: THREE.Material, position: number[], size: number[], rotation?: number[]) {
  const mesh = new THREE.Mesh(boxGeometry, material);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.scale.set(size[0], size[1], size[2]);
  if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function roundedBox(parent: THREE.Object3D, material: THREE.Material, position: number[], size: number[], radius = .025, rotation?: number[]) {
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(size[0], size[1], size[2], 2, Math.min(radius, Math.min(...size) * .4)), material);
  mesh.position.set(position[0], position[1], position[2]);
  if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function panel(parent: THREE.Object3D, material: THREE.Material, vertices: number[][]) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(vertices.flat());
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const indices: number[] = [];
  for (let i = 1; i < vertices.length - 1; i++) indices.push(0, i, i + 1);
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

type BodySection = {z:number;y:number;width:number};
const crownProfile = [-1, -.96, -.85, -.62, 0, .62, .85, .96, 1];
const crownRise = [0, .014, .025, .033, .038, .033, .025, .014, 0];
function panelHeight(sections: BodySection[], x: number, z: number) {
  const index = Math.max(0, sections.findIndex((section, i) => i < sections.length - 1 && z <= sections[i + 1].z));
  const a = sections[index], b = sections[index + 1];
  const t = THREE.MathUtils.clamp((z - a.z) / (b.z - a.z), 0, 1);
  const width = THREE.MathUtils.lerp(a.width,b.width,t), u = THREE.MathUtils.clamp(x / width,-1,1);
  const col = Math.max(0, crownProfile.findIndex((value, i) => i < crownProfile.length - 1 && u <= crownProfile[i + 1]));
  return THREE.MathUtils.lerp(a.y,b.y,t) + THREE.MathUtils.lerp(crownRise[col],crownRise[col + 1],(u - crownProfile[col]) / (crownProfile[col + 1] - crownProfile[col]));
}

/** Crowned hood, boot and roof surfaces meet their adjoining panels at the edges. */
function loft(parent: THREE.Object3D, material: THREE.Material, sections: BodySection[]) {
  const vertices: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const profile = crownProfile, crown = crownRise;
  for (const section of sections) {
    profile.forEach((u, i) => {
      vertices.push(section.width * u, section.y + crown[i], section.z);
      uvs.push((u + 1) / 2, (section.z + 2.3) / 4.6);
    });
  }
  for (let row = 0; row < sections.length - 1; row++) {
    for (let column = 0; column < profile.length - 1; column++) {
      const a = row * profile.length + column, b = a + profile.length;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
}

function endBand(parent: THREE.Object3D, material: THREE.Material, section: BodySection, bottom: number, facing: -1 | 1) {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  crownProfile.forEach((u, i) => {
    positions.push(section.width * u,section.y + crownRise[i],section.z,section.width * u,bottom,section.z);
    uvs.push((u + 1) / 2,1,(u + 1) / 2,0);
    if (i < crownProfile.length - 1) {
      const a = i * 2, b = a + 2;
      if (facing < 0) indices.push(a,b,a + 1,a + 1,b,b + 1);
      else indices.push(a,a + 1,b,a + 1,b + 1,b);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2)); geometry.setIndex(indices); geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry,material); mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh);
}

function strip(parent: THREE.Object3D, material: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, width: number) {
  const length = a.distanceTo(b);
  const mesh = new THREE.Mesh(boxGeometry, material);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.scale.set(width, length, width);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  mesh.castShadow = true;
  parent.add(mesh);
}

function bodyWidth(x: number, z: number, y: number, front: number, rear: number, top: number) {
  const frontBlend = THREE.MathUtils.smoothstep(z, front, front + .25);
  const rearBlend = THREE.MathUtils.smoothstep(z, rear - .32, rear);
  const width = Math.abs(x) * (.88 + .12 * frontBlend - .07 * rearBlend);
  const height = THREE.MathUtils.clamp((y + .25) / (top + .25), 0, 1);
  const fender = Math.max(0, 1 - Math.min(Math.abs(z + 1.25), Math.abs(z - 1.25)) / .62);
  // Narrow sill, gently convex door skin, and a pressed flare above each wheel.
  return Math.sign(x) * (width - .063 * (1 - height) ** 2 + .023 * Math.sin(height * Math.PI) + .042 * fender * (1 - height));
}

function sidePanel(parent: THREE.Object3D, material: THREE.Material, x: number, zFront: number, zRear: number, top: number, hood: BodySection[], boot: BodySection[]) {
  const radius = .455, startAngle = Math.asin(.1 / radius);
  const samples = [zFront, zRear];
  for (let i = 1; i < 38; i++) samples.push(THREE.MathUtils.lerp(zFront, zRear, i / 38));
  for (const center of [-1.25, 1.25]) for (let i = 0; i <= 24; i++) samples.push(center + Math.cos(startAngle + i / 24 * (Math.PI - 2 * startAngle)) * radius);
  const columns = [...new Set(samples)].sort((a, b) => a - b);
  const rows = [0, .14, .34, .58, .78, .93, 1];
  const positions: number[] = [], indices: number[] = [], uvs: number[] = [];
  const bottomAt = (z: number) => {
    const dz = Math.min(Math.abs(z + 1.25), Math.abs(z - 1.25));
    return dz < radius ? Math.max(-.25, -.35 + Math.sqrt(radius * radius - dz * dz)) : -.25;
  };
  for (const z of columns) {
    const bottom = bottomAt(z);
    const upper = z <= hood.at(-1)!.z ? panelHeight(hood,99,z) : z >= boot[0].z ? panelHeight(boot,99,z) : top;
    for (const t of rows) {
      const y = THREE.MathUtils.lerp(bottom, upper, t);
      positions.push(bodyWidth(x, z, y, zFront, zRear, top), y, z);
      uvs.push((z + 2.3) / 4.6, (y + .4) * 1.15);
    }
  }
  for (let col = 0; col < columns.length - 1; col++) for (let row = 0; row < rows.length - 1; row++) {
    const a = col * rows.length + row, b = a + rows.length;
    if (x > 0) indices.push(a, a + 1, b, a + 1, b + 1, b);
    else indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh);
  for (const center of [-1.25, 1.25]) {
    // A rolled metal flange wraps into the dark wheel housing, with a flat outer lip.
    const lipPositions: number[] = [], lipUVs: number[] = [], lipIndices: number[] = [];
    for (let i = 0; i <= 32; i++) {
      const angle = startAngle + i / 32 * (Math.PI - 2 * startAngle);
      for (const [r, inset] of [[radius, -.055], [radius, .005], [radius + .023, .006]] as const) {
        const z = center + Math.cos(angle) * r, y = -.35 + Math.sin(angle) * r;
        lipPositions.push(bodyWidth(x, z, y, zFront, zRear, top) + Math.sign(x) * inset, y, z);
        lipUVs.push((z + 2.3) / 4.6, (y + .4) * 1.15);
      }
      if (i < 32) for (let ring = 0; ring < 2; ring++) {
        const a = i * 3 + ring, b = a + 3;
        lipIndices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const lipGeometry = new THREE.BufferGeometry();
    lipGeometry.setAttribute('position', new THREE.Float32BufferAttribute(lipPositions, 3));
    lipGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(lipUVs, 2));
    lipGeometry.setIndex(lipIndices); lipGeometry.computeVertexNormals();
    const lip = new THREE.Mesh(lipGeometry, material); lip.castShadow = true; parent.add(lip);
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(.452, .452, .19, 32, 1, true, 0, Math.PI), darkMetal);
    housing.rotation.z = Math.PI / 2;
    housing.position.set(x - Math.sign(x) * .14, -.35, center); parent.add(housing);
  }
}

function label(text: string, background = '#172225', foreground = '#ece5ce') {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 128;
  const context = canvas.getContext('2d')!;
  context.fillStyle = background; context.fillRect(0, 0, 512, 128);
  context.strokeStyle = foreground; context.lineWidth = 5; context.strokeRect(7, 7, 498, 114);
  context.font = 'bold 65px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
  context.fillStyle = foreground; context.fillText(text, 256, 69);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: texture, roughness: 0.5, metalness: 0.2 });
}

const rustTextures = new Map<ShellId, THREE.CanvasTexture>();
function weathering(shellId: ShellId) {
  if (rustTextures.has(shellId)) return rustTextures.get(shellId)!;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const context = canvas.getContext('2d')!;
  const base = { hachiro: [102, 119, 116], bison: [116, 91, 75], veloce: [124, 111, 94] }[shellId];
  let seed = shellId.length * 7193;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  // Fine oxidized paint grain remains dominant. Rust gathers in irregular chips,
  // rather than obscuring the original finish with a repeated camouflage pattern.
  const pixels = context.createImageData(512, 512);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const grain = (random() - .5) * 11;
    pixels.data[i] = base[0] + grain; pixels.data[i+1] = base[1] + grain; pixels.data[i+2] = base[2] + grain; pixels.data[i+3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  for (let patch = 0; patch < 23; patch++) {
    const x = random() * 512, y = random() * 512;
    const radius = 7 + random() * 28;
    const points = Array.from({length: 16}, (_, i) => {
      const angle = i / 16 * Math.PI * 2, r = radius * (.55 + random() * .6);
      return [Math.cos(angle) * r, Math.sin(angle) * r * .65];
    });
    const draw = (scale: number, color: string) => {
      context.fillStyle = color; context.beginPath();
      points.forEach(([px, py], i) => i ? context.lineTo(x + px * scale, y + py * scale) : context.moveTo(x + px * scale, y + py * scale));
      context.closePath(); context.fill();
    };
    draw(1.14, 'rgba(67,54,39,.55)'); draw(1, '#79513a'); draw(.65, '#9b6240');
    for (let speck = 0; speck < 16; speck++) {
      context.fillStyle = random() > .5 ? 'rgba(48,35,28,.38)' : 'rgba(184,123,74,.35)';
      context.fillRect(x + (random() - .5) * radius, y + (random() - .5) * radius * .6, 1 + random() * 3, 1 + random() * 2);
    }
  }
  for (let i = 0; i < 46; i++) {
    context.strokeStyle = i % 3 ? 'rgba(215,208,178,.21)' : 'rgba(31,35,31,.3)'; context.lineWidth = .5 + random();
    const x = random() * 512, y = random() * 512;
    context.beginPath(); context.moveTo(x, y); context.lineTo(x + 8 + random() * 46, y + (random() - .5) * 7); context.stroke();
  }
  const grime = context.createLinearGradient(0, 310, 0, 512);
  grime.addColorStop(0, 'rgba(29,28,23,0)'); grime.addColorStop(1, 'rgba(29,28,23,.25)');
  context.fillStyle = grime; context.fillRect(0, 0, 512, 512);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = 8;
  rustTextures.set(shellId, texture);
  return texture;
}

const sidewallMaterials = new Map<ShellId, THREE.MeshStandardMaterial>();
function tireLettering(style: ShellId) {
  if (sidewallMaterials.has(style)) return sidewallMaterials.get(style)!;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const context = canvas.getContext('2d')!;
  context.translate(256, 256); context.fillStyle = '#464c47';
  context.font = 'bold 17px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
  const words = (text: string, radius: number, start: number, span: number) => {
    [...text].forEach((letter, i) => {
      const angle = start + i / Math.max(1, text.length - 1) * span;
      context.save(); context.translate(Math.sin(angle) * radius, -Math.cos(angle) * radius); context.rotate(angle); context.fillText(letter, 0, 0); context.restore();
    });
  };
  words(style === 'veloce' ? 'HOLLOWAY  SPORT' : 'HOLLOWAY  RADIAL', 207, -.57, 1.14);
  words(style === 'bison' ? '225 / 60 R15' : style === 'veloce' ? '245 / 45 ZR16' : '205 / 55 R15', 207, 2.68, .92);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8;
  const material = new THREE.MeshStandardMaterial({ map: texture, transparent: true, alphaTest: .15, roughness: .96, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
  sharedMaterials.add(material); sidewallMaterials.set(style, material); surfaceTextures.set(`sidewall-${style}`, texture);
  return material;
}

function createWheel(style: ShellId, side: number) {
  const pivot = new THREE.Group(), spin = new THREE.Group(); pivot.add(spin);
  const tireProfile = [[.232,-.128],[.27,-.142],[.304,-.146],[.335,-.133],[.354,-.106],[.361,-.081],
    [.361,-.061],[.352,-.055],[.352,-.045],[.361,-.04],[.362,-.011],[.352,-.006],
    [.352,.006],[.362,.011],[.361,.04],[.352,.045],[.352,.055],[.361,.061],[.361,.081],
    [.354,.106],[.335,.133],[.304,.146],[.27,.142],[.232,.128]].map(([r,y]) => new THREE.Vector2(r,y));
  const tire = new THREE.Mesh(new THREE.LatheGeometry(tireProfile, 48), rubber);
  tire.rotation.z = Math.PI / 2; tire.castShadow = true; spin.add(tire);
  for (const radius of [.259, .325]) {
    const bead = new THREE.Mesh(new THREE.TorusGeometry(radius, .0025, 4, 48), rubber);
    bead.rotation.y = Math.PI / 2; bead.position.x = side * (.14 - (radius === .325 ? .005 : 0)); spin.add(bead);
  }
  const letteringGeometry = new THREE.RingGeometry(.263, .332, 64);
  const letteringPositions = letteringGeometry.getAttribute('position'), letteringUVs = letteringGeometry.getAttribute('uv');
  for (let i = 0; i < letteringPositions.count; i++) letteringUVs.setXY(i, (letteringPositions.getX(i) + .36) / .72, (letteringPositions.getY(i) + .36) / .72);
  const words = new THREE.Mesh(letteringGeometry, tireLettering(style));
  words.rotation.y = side * Math.PI / 2; words.position.x = side * .148; spin.add(words);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.237, .237, .245, 40, 1, true), darkMetal);
  barrel.rotation.z = Math.PI / 2; spin.add(barrel);
  for (const [radius, depth] of [[.234, .142], [.218, .137]] as const) {
    const rimLip = new THREE.Mesh(new THREE.TorusGeometry(radius, radius > .23 ? .011 : .004, 6, 40), metal);
    rimLip.rotation.y = Math.PI / 2; rimLip.position.x = side * depth; spin.add(rimLip);
  }
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(.192, .192, .014, 40), metal);
  disc.rotation.z = Math.PI / 2; disc.position.x = side * .077; spin.add(disc);
  for (const radius of [.139, .168, .187]) {
    const scoring = new THREE.Mesh(new THREE.TorusGeometry(radius, .0012, 3, 40), darkMetal);
    scoring.rotation.y = Math.PI / 2; scoring.position.x = side * .086; spin.add(scoring);
  }
  // The caliper follows the steering knuckle but does not spin with the rim.
  roundedBox(pivot, brake, [side * .09, .025, .15], [.055, .15, .065], .012);
  const spokes = style === 'hachiro' ? 8 : 5;
  for (let i = 0; i < spokes; i++) {
    const angle = i / spokes * Math.PI * 2;
    const shape = new THREE.Shape();
    const width = style === 'veloce' ? .036 : style === 'bison' ? .041 : .021;
    shape.moveTo(-width * .65, .047); shape.lineTo(-width, .19); shape.lineTo(-width * .65, .225);
    shape.lineTo(width * .65, .225); shape.lineTo(width, .19); shape.lineTo(width * .65, .047); shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: .025, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: .004, bevelThickness: .004, curveSegments: 1 });
    geometry.rotateY(Math.PI / 2); geometry.translate(side * .135 - .012, 0, 0); geometry.rotateX(angle);
    const spoke = new THREE.Mesh(geometry, metal); spoke.castShadow = true; spin.add(spoke);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(.057, .057, .035, 20), metal);
  hub.rotation.z = Math.PI / 2; hub.position.x = side * .156; spin.add(hub);
  const center = new THREE.Mesh(new THREE.CylinderGeometry(.027, .027, .004, 20), darkMetal);
  center.rotation.z = Math.PI / 2; center.position.x = side * .177; spin.add(center);
  const lugs = new THREE.InstancedMesh(lugGeometry, metal, 5);
  const transform = new THREE.Object3D();
  for (let i = 0; i < 5; i++) {
    const angle = i / 5 * Math.PI * 2;
    transform.position.set(side * .177, Math.cos(angle) * .041, Math.sin(angle) * .041);
    transform.scale.set(.85,.85,.85); transform.rotation.set(0,0,Math.PI / 2); transform.updateMatrix(); lugs.setMatrixAt(i, transform.matrix);
  }
  spin.add(lugs);
  const valve = new THREE.Mesh(new THREE.CylinderGeometry(.006, .006, .035, 8), rubber);
  valve.position.set(side * .144, .19, .058); valve.rotation.z = -.38; spin.add(valve);
  // Four offset tread lanes leave deep circumferential rain channels between them.
  const tread = new THREE.InstancedMesh(boxGeometry, rubber, 48 * 4);
  for (let lane = 0; lane < 4; lane++) for (let i = 0; i < 48; i++) {
    const angle = (i + (lane % 2) * .5) / 48 * Math.PI * 2;
    transform.position.set(-.08 + lane * .053, Math.cos(angle) * .3605, Math.sin(angle) * .3605);
    transform.scale.set(.038, .0035, .029); transform.rotation.set(angle, (lane < 2 ? -1 : 1) * .18, 0); transform.updateMatrix(); tread.setMatrixAt(lane * 48 + i, transform.matrix);
  }
  spin.add(tread);
  batchAssembly(spin); batchAssembly(pivot);
  return { pivot, spin };
}

export function createCar(shellId: ShellId, options: CarAppearance = {}): CarVisual {
  const group = new THREE.Group(); group.name = `car-${shellId}`;
  const initialPaint = { hachiro: '#e8d9b0', bison: '#d28037', veloce: '#b83d30' }[shellId];
  const appearance = { paint: options.paint ?? initialPaint, restored: options.restored ?? false, wheels: options.wheels ?? false };
  const paint = new THREE.MeshPhysicalMaterial({ color: appearance.paint, metalness: .19, roughness: .28, clearcoat: .88, clearcoatRoughness: .1, bumpMap: fineFinish(), bumpScale: .0007, side: THREE.DoubleSide });
  if (!lamp.map) {
    lamp.map = lensFinish(); lamp.needsUpdate = true;
    tailLamp.map = lamp.map; tailLamp.needsUpdate = true;
    amber.map = lamp.map; amber.needsUpdate = true;
  }
  const isMuscle = shellId === 'bison', isSuper = shellId === 'veloce';
  const halfWidth = isMuscle ? 0.98 : isSuper ? 0.99 : 0.91;
  const front = isMuscle ? -2.3 : isSuper ? -2.2 : -2.12;
  const rear = isMuscle ? 2.28 : isSuper ? 2.12 : 2.09;
  const shoulder = isMuscle ? 0.29 : isSuper ? 0.2 : 0.27;
  const roof = isMuscle ? 0.76 : isSuper ? 0.50 : 0.72;
  const windscreenBottomZ = isMuscle ? -0.45 : isSuper ? -0.82 : -0.66;
  const windscreenTopZ = isMuscle ? 0.12 : isSuper ? -0.10 : -0.06;
  const rearTopZ = isSuper ? 0.50 : 0.76;
  const rearBottomZ = isMuscle ? 1.3 : isSuper ? 1.18 : 1.43;
  const roofWidth = isSuper ? 0.70 : isMuscle ? 0.76 : 0.73;

  box(group, darkMetal, [0, -0.23, 0], [1.30, 0.13, 3.87]);
  const hoodSections = [{z:front,y:isSuper ? 0.03 : 0.16,width:halfWidth * 0.88},
    {z:front + 0.25,y:isSuper ? 0.10 : shoulder,width:halfWidth},
    {z:(front + windscreenBottomZ) * .5,y:isSuper ? .145 : shoulder + .025,width:halfWidth * .99},
    {z:windscreenBottomZ,y:shoulder + 0.03,width:halfWidth * 0.96}];
  const bootSections = [{z:rearBottomZ,y:shoulder + 0.04,width:halfWidth * 0.96},
    {z:rear - 0.16,y:shoulder,width:halfWidth}, {z:rear,y:shoulder - 0.04,width:halfWidth * 0.93}];
  sidePanel(group, paint, -halfWidth, front, rear, shoulder, hoodSections, bootSections);
  sidePanel(group, paint, halfWidth, front, rear, shoulder, hoodSections, bootSections);
  loft(group, paint, hoodSections); loft(group, paint, bootSections);
  endBand(group, paint, hoodSections[0], -.12, -1);
  endBand(group, paint, bootSections.at(-1)!, -.12, 1);
  roundedBox(group, paint, [0, isSuper ? -.085 : -.04, front + .06], [halfWidth * 1.80, isSuper ? .24 : .34, .15], .035);
  roundedBox(group, paint, [0, -0.03, rear - 0.05], [halfWidth * 1.85, 0.35, 0.16], .035);
  for (const side of [-1, 1]) {
    box(group, paint, [side * halfWidth * 0.94, -0.235, 0], [0.08, 0.10, 1.45]);
    // Shut lines sit on the curved skin, with a small recessed handle pocket.
    const skin = (y: number, z: number) => new THREE.Vector3(bodyWidth(side * halfWidth, z, y, front, rear, shoulder) + side * .003, y, z);
    const doorLine = [skin(shoulder - .005, windscreenBottomZ + .08), skin(-.13, windscreenBottomZ + .12), skin(-.185, windscreenBottomZ + .22), skin(-.185,.59), skin(-.1,.72), skin(shoulder - .005,.72)];
    for (let i = 0; i < doorLine.length - 1; i++) for (let step = 0; step < 8; step++) {
      const a = doorLine[i].clone().lerp(doorLine[i + 1], step / 8), b = doorLine[i].clone().lerp(doorLine[i + 1], (step + 1) / 8);
      strip(group, black, skin(a.y,a.z), skin(b.y,b.z), .004);
    }
    const handleX = bodyWidth(side * halfWidth, .53, shoulder - .045, front, rear, shoulder);
    roundedBox(group, darkMetal, [handleX + side * .005, shoulder - .045, .53], [.012,.042,.17], .008);
    roundedBox(group, metal, [handleX + side * .016, shoulder - .038, .53], [.021,.019,.13], .006);
    box(group, darkMetal, [side * (halfWidth + 0.01), shoulder - 0.15, -1.85], [0.018, 0.04, 0.10]);
    box(group, amber, [side * (halfWidth + 0.012), shoulder - 0.15, -1.85], [0.02, 0.028, 0.065]);
    for (const center of [-1.25,1.25]) {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(.026,.034,.4,10), darkMetal);
      strut.position.set(side * .69,-.15,center); group.add(strut);
      for (let ring = 0; ring < 5; ring++) {
        const coil = new THREE.Mesh(new THREE.TorusGeometry(.061,.008,5,12),metal);
        coil.rotation.x = Math.PI / 2; coil.position.set(side * .69,-.05 + ring * .031,center); group.add(coil);
      }
    }
  }
  // The narrow hood and boot gaps separate stamped panels without changing the silhouette.
  for (const side of [-1,1]) {
    for (const [sections, from, to] of [[hoodSections,front + .07,windscreenBottomZ - .025],[bootSections,rearBottomZ + .025,rear - .22]] as const) {
      const x = side * halfWidth * .80;
      for (let i = 0; i < 24; i++) {
        const a = THREE.MathUtils.lerp(from,to,i / 24), b = THREE.MathUtils.lerp(from,to,(i + 1) / 24);
        strip(group, darkMetal, new THREE.Vector3(x,panelHeight(sections,x,a) + .002,a), new THREE.Vector3(x,panelHeight(sections,x,b) + .002,b), .004);
      }
    }
  }
  for (const [sections,z] of [[hoodSections,front + .07],[bootSections,rear - .22]] as const) {
    for (let i = 0; i < 24; i++) {
      const a = THREE.MathUtils.lerp(-halfWidth * .8,halfWidth * .8,i / 24), b = THREE.MathUtils.lerp(-halfWidth * .8,halfWidth * .8,(i + 1) / 24);
      strip(group,darkMetal,new THREE.Vector3(a,panelHeight(sections,a,z) + .002,z),new THREE.Vector3(b,panelHeight(sections,b,z) + .002,z),.004);
    }
  }
  const filler = new THREE.Mesh(new THREE.TorusGeometry(.071,.003,4,24), darkMetal);
  filler.rotation.y = Math.PI / 2; filler.position.set(bodyWidth(halfWidth,1.77,.09,front,rear,shoulder) + .003,.09,1.77); group.add(filler);

  // Tinted windows are independent surfaces bounded by painted pillars.
  const windowMaterial = glass.clone(); windowMaterial.side = THREE.DoubleSide;
  panel(group, windowMaterial, [[-halfWidth * 0.88,shoulder + 0.04,windscreenBottomZ],
    [halfWidth * 0.88,shoulder + 0.04,windscreenBottomZ], [roofWidth,roof - 0.04,windscreenTopZ],[-roofWidth,roof - 0.04,windscreenTopZ]]);
  panel(group, windowMaterial, [[-roofWidth,roof - 0.045,rearTopZ],[roofWidth,roof - 0.045,rearTopZ],
    [halfWidth * 0.87,shoulder + 0.05,rearBottomZ],[-halfWidth * 0.87,shoulder + 0.05,rearBottomZ]]);
  const roofSections = [{z:windscreenTopZ - .025,y:roof,width:roofWidth}, {z:rearTopZ + .025,y:roof - .02,width:roofWidth}];
  loft(group, paint, roofSections);
  endBand(group, paint, roofSections[0], roof - .05, -1);
  endBand(group, paint, roofSections[1], roof - .07, 1);
  for (const side of [-1, 1]) {
    const bottomX = side * halfWidth * 0.92, topX = side * roofWidth;
    panel(group, windowMaterial, [[bottomX,shoulder + 0.035,windscreenBottomZ + 0.05],
      [topX,roof - 0.035,windscreenTopZ + 0.045], [topX,roof - 0.055,rearTopZ - 0.045],
      [bottomX,shoulder + 0.035,rearBottomZ - 0.08]]);
    strip(group, paint, new THREE.Vector3(bottomX,shoulder,windscreenBottomZ), new THREE.Vector3(topX,roof,windscreenTopZ), 0.065);
    strip(group, paint, new THREE.Vector3(topX,roof - 0.02,rearTopZ), new THREE.Vector3(bottomX,shoulder,rearBottomZ), isSuper ? 0.13 : 0.09);
    strip(group, paint, new THREE.Vector3(topX,roof - 0.02,windscreenTopZ),new THREE.Vector3(topX,roof - 0.02,rearTopZ),0.05);
    strip(group, darkMetal, new THREE.Vector3(bottomX,shoulder + 0.035,0.38),new THREE.Vector3(topX,roof - 0.035,0.38),0.035);
    strip(group, darkMetal, new THREE.Vector3(bottomX,shoulder + 0.025,windscreenBottomZ),new THREE.Vector3(bottomX,shoulder + 0.025,rearBottomZ),0.035);
    roundedBox(group, paint, [side * (halfWidth + 0.075), shoulder + 0.11, windscreenBottomZ + 0.16], [0.18, 0.085, 0.20], .03);
    box(group, glass, [side * (halfWidth + 0.075), shoulder + 0.11, windscreenBottomZ + 0.266], [0.13, 0.055, 0.008]);
  }
  box(group, interior, [0, 0.19, 0.15], [1.36, 0.07, 1.52]);
  const seatHeight = roof - .31;
  for (const side of [-1, 1]) {
    roundedBox(group, interior, [side * .36, .16 + seatHeight / 2, .54], [.40, seatHeight, .18], .04, [-.11, 0, 0]);
    roundedBox(group, interior, [side * .36, .22, .26], [.40, .12, .48], .04);
    roundedBox(group, interior, [side * .36, roof - .13, .56], [.22, .11, .13], .025);
  }
  roundedBox(group, interior, [0, shoulder + .01, windscreenBottomZ + .15], [1.38, .11, .30], .025);
  box(group, darkMetal, [0, .25, .15], [.16, .10, .80]);
  const steeringWheel = new THREE.Mesh(new THREE.TorusGeometry(.11, .015, 8, 20), interior);
  steeringWheel.position.set(-.34, shoulder + .13, windscreenBottomZ + .36); steeringWheel.rotation.x = -.55; group.add(steeringWheel);
  box(group, darkMetal, [-.34, shoulder + .13, windscreenBottomZ + .36], [.17,.025,.025],[-.55,0,0]);
  // Slim wipers sit on the lower glass edge and give the windshield a useful scale cue.
  for (const side of [-1, 1]) strip(group, black, new THREE.Vector3(side * .51,shoulder + .061,windscreenBottomZ + .018), new THREE.Vector3(side * .18,shoulder + .105,windscreenBottomZ + .09), .012);

  if (isMuscle) {
    // Long hood, chrome grille, paired round lamps, and a narrow black hood scoop.
    box(group, darkMetal, [0, -0.01, front - 0.031], [1.77, 0.24, 0.045]);
    for (let i = 0; i < 11; i++) box(group, metal, [(i - 5) * 0.075, -0.01, front - 0.059], [0.018, 0.16, 0.015]);
    for (const side of [-1, 1]) for (const offset of [0, 0.24]) {
      const light = new THREE.Mesh(new THREE.CylinderGeometry(0.10,0.10,0.035,24), lamp);
      light.rotation.x = Math.PI / 2; light.position.set(side * (0.56 + offset),0.012,front - 0.045); group.add(light);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.105,0.012,6,24), metal);
      ring.position.copy(light.position); ring.position.z -= 0.026; group.add(ring);
    }
    box(group, metal, [0, -0.20, front - 0.08], [1.90, 0.085, 0.11]);
    box(group, metal, [0, -0.19, rear + 0.055], [1.92, 0.085, 0.10]);
    box(group, darkMetal, [0, shoulder + 0.085, -1.12], [0.46,0.11,0.69],[-0.045,0,0]);
    box(group, black, [0, shoulder + 0.11, -1.47], [0.37,0.055,0.02]);
    for (const side of [-1,1]) box(group, tailLamp,[side * 0.62,0.035,rear + 0.035],[0.43,0.12,0.035]);
  } else if (isSuper) {
    // Low wedge nose, outlined pop-up lamps, large intake openings, and vented engine cover.
    for (const side of [-1,1]) {
      box(group, darkMetal,[side * 0.61,0.15,-1.73],[0.40,0.018,0.36],[-0.07,0,0]);
      box(group, paint,[side * 0.61,0.167,-1.73],[0.37,0.016,0.33],[-0.07,0,0]);
      box(group,lamp,[side * 0.66,-0.09,front - 0.03],[0.37,0.07,0.03]);
      box(group,black,[side * 0.53,-0.19,front - 0.04],[0.40,0.085,0.035]);
      box(group,black,[side * (halfWidth + 0.005),0.07,0.69],[0.018,0.15,0.32]);
      for (let i = 0; i < 3; i++) box(group,paint,[side * (halfWidth + 0.02),0.025 + i * 0.055,0.69],[0.026,0.013,0.32]);
      for (const offset of [0,0.25]) {
        const light = new THREE.Mesh(new THREE.CylinderGeometry(0.085,0.085,0.03,24),tailLamp);
        light.rotation.x = Math.PI / 2; light.position.set(side * (0.53 + offset),0.02,rear + 0.05);group.add(light);
      }
    }
    for (let i = 0; i < 8; i++) box(group,darkMetal,[0,shoulder + 0.055,1.22 + i * 0.085],[1.24,0.018,0.035]);
    box(group,paint,[0,0.46,1.92],[1.83,0.055,0.23]);
    for (const side of [-1,1]) box(group,darkMetal,[side * 0.58,0.34,1.93],[0.045,0.22,0.10]);
    box(group,black,[0,-0.23,rear + 0.03],[1.72,0.13,0.10]);
  } else {
    // Eighties notchback: broad rectangular lights, slim black bumpers, tidy lip spoiler.
    box(group,darkMetal,[0,-0.04,front - 0.025],[1.70,0.20,0.07]);
    for (const side of [-1,1]) {
      box(group,lamp,[side * 0.58,0.02,front - 0.07],[0.49,0.105,0.025]);
      box(group,amber,[side * 0.84,0.02,front - 0.065],[0.07,0.10,0.027]);
      box(group,tailLamp,[side * 0.59,0.04,rear + 0.025],[0.53,0.12,0.035]);
    }
    for (let i = 0; i < 4; i++) box(group,black,[0,-0.045 + i * 0.034,front - 0.067],[0.54,0.014,0.02]);
    box(group,darkMetal,[0,-0.19,front - 0.08],[1.78,0.085,0.12]);
    box(group,darkMetal,[0,-0.18,rear + 0.05],[1.80,0.08,0.09]);
    box(group,paint,[0,shoulder + 0.09,rear - 0.20],[1.73,0.05,0.14]);
    for (const side of [-1,1]) box(group,darkMetal,[side * 0.53,shoulder + 0.045,rear - 0.20],[0.04,0.07,0.06]);
  }

  const badgeName = { hachiro:'HACHI', bison:'BISON', veloce:'VELOCE' }[shellId];
  const badgeMaterial = label(badgeName);
  const badge = new THREE.Mesh(new THREE.PlaneGeometry(isSuper ? 0.24 : 0.29,0.065),badgeMaterial);
  badge.rotation.y = Math.PI; badge.position.set(0, isMuscle ? 0.10 : isSuper ? 0.065 : 0.19,front - 0.083);group.add(badge);
  const rearBadge = new THREE.Mesh(new THREE.PlaneGeometry(0.30,0.065),badgeMaterial);
  rearBadge.position.set(0,0.16,rear + 0.045);group.add(rearBadge);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.36,0.10),label('JNK-YRD','#ddd5b9','#36403a'));
  plate.position.set(0,-0.065,rear + 0.062);group.add(plate);
  for (const side of isMuscle || isSuper ? [-1,1] : [1]) {
    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(.047,.043,.21,20,1,true),metal);
    exhaust.rotation.x = Math.PI / 2;exhaust.position.set(side * .59,-.28,rear);group.add(exhaust);
    const bore = new THREE.Mesh(new THREE.CircleGeometry(.041,20),black);
    bore.position.set(side * .59,-.28,rear + .065);group.add(bore);
  }

  const wheelMeshes: THREE.Group[] = [], spins: THREE.Group[] = [];
  const hubs = new THREE.Group(); group.add(hubs);
  for (const z of [-1.25,1.25]) for (const x of [-0.84,0.84]) {
    const {pivot,spin} = createWheel(shellId,Math.sign(x));
    pivot.position.set(x,-0.35,z);group.add(pivot);wheelMeshes.push(pivot);spins.push(spin);
    const rotor = new THREE.Mesh(new THREE.CylinderGeometry(.17,.17,.025,24),metal);
    rotor.rotation.z = Math.PI / 2;rotor.position.set(x,-.35,z);hubs.add(rotor);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(.07,.07,.10,16),darkMetal);
    hub.rotation.z = Math.PI / 2;hub.position.set(x,-.35,z);hubs.add(hub);
    for (let i = 0; i < 5; i++) {
      const angle = i / 5 * Math.PI * 2;
      const stud = new THREE.Mesh(lugGeometry,metal);stud.rotation.z = Math.PI / 2;
      stud.position.set(x + Math.sign(x) * .058,-.35 + Math.cos(angle) * .047,z + Math.sin(angle) * .047);hubs.add(stud);
    }
  }

  // Salvage shells rest on masonry until a wheel set replaces the supports.
  const supports = new THREE.Group();
  supports.name = 'Salvage axle supports';
  for (const z of [-1.25,1.25]) for (const x of [-0.6,0.6]) {
    box(supports, supportConcrete, [x,-0.47,z], [0.34,0.50,0.44]);
    box(supports, darkMetal, [x,-0.223,z], [0.27,0.025,0.28]);
    // Recesses on the visible end distinguish cinder blocks from car components.
    for (const dz of [-0.105,0.105]) box(supports, black, [x + Math.sign(x) * 0.171,-0.48,z + dz], [0.003,0.24,0.105]);
  }
  group.add(supports);
  batchAssembly(hubs); batchAssembly(supports); batchAssembly(group);

  const setAppearance = (next: CarAppearance) => {
    Object.assign(appearance,next);
    paint.color.set(appearance.restored ? appearance.paint : '#ffffff');
    paint.map = appearance.restored ? null : weathering(shellId);
    paint.roughness = appearance.restored ? .28 : .88;
    paint.metalness = appearance.restored ? .19 : .08;
    paint.clearcoat = appearance.restored ? .88 : .04;
    paint.clearcoatRoughness = appearance.restored ? .1 : .7;
    paint.bumpScale = appearance.restored ? .0007 : .008;
    paint.needsUpdate = true;
    wheelMeshes.forEach(wheel => { wheel.visible = appearance.wheels; });
    hubs.visible = !appearance.wheels;
    supports.visible = !appearance.wheels;
    windowMaterial.roughness = appearance.restored ? .065 : .28;
    windowMaterial.opacity = appearance.restored ? .42 : .88;
    windowMaterial.color.set(appearance.restored ? '#788f93' : '#626e65');
  };
  setAppearance(options);
  let disposed = false;
  return {
    group,
    wheels:wheelMeshes,
    setAppearance,
    animateWheels(steering,rotation,suspension) {
      wheelMeshes.forEach((wheel,index) => {
        wheel.rotation.y = index < 2 ? steering : 0;
        wheel.position.y = suspension?.[index] ?? -0.35;
        spins[index].rotation.x = rotation;
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      const textures = new Set<THREE.Texture>();
      const sharedTextures = new Set<THREE.Texture>([...rustTextures.values(), ...surfaceTextures.values()]);
      group.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        if (object.geometry !== boxGeometry && object.geometry !== lugGeometry) geometries.add(object.geometry);
        const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of objectMaterials) {
          if (sharedMaterials.has(material)) continue;
          materials.add(material);
          if (material instanceof THREE.MeshStandardMaterial && material.map && !sharedTextures.has(material.map)) textures.add(material.map);
        }
        // Instance matrices belong to the mesh, including meshes using shared box geometry.
        if (object instanceof THREE.InstancedMesh) object.dispose();
      });
      textures.forEach(texture => texture.dispose());
      materials.forEach(material => material.dispose());
      geometries.forEach(geometry => geometry.dispose());
      group.removeFromParent();
      group.clear();
    },
  };
}
