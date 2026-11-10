import * as THREE from 'three';
import type { WorldBuilder } from './builder';
import { swaying } from './materials';
import { surface } from './surfaces';
import { randomFromSeed } from '../world/layout';

/**
 * Trees, shrubs and ground cover. Crowns are soft shaded volumes fringed with
 * cut-out leaf sprays, so they read as full from any side and still let light
 * through at the edges. Everything is instanced and leans with the wind.
 */
export interface Vegetation {
  tree(x: number, z: number, height: number, spread: number, kind?: 'broad' | 'tall' | 'round'): void;
  conifer(x: number, y: number, z: number, height: number, tint?: number): void;
  bush(x: number, y: number, z: number, scale: number, tint?: number): void;
  tuft(x: number, y: number, z: number, scale: number, tint?: number): void;
  hedge(x: number, z: number, length: number, yaw: number, height?: number): void;
}

const CROWN_TINTS = [0x6f8a3a, 0x7f9440, 0x5d7a36, 0x8a9a48, 0x66803a, 0x54703a];
const AUTUMN_TINTS = [0xb9973c, 0xa8742f, 0x9a8a3a];
const TUFT_TINTS = [0xa3b552, 0xb4bc60, 0x8fa64c, 0xc6c170, 0x9cb056];

function bladeTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const random = randomFromSeed(5521);
  for (let blade = 0; blade < 34; blade++) {
    const x = 6 + random() * 116, height = 46 + random() * 78, lean = (random() - .5) * 46, width = 2.4 + random() * 3.2;
    const tone = 196 + Math.floor(random() * 59);
    ctx.fillStyle = `rgb(${tone - 10},${tone},${tone - 40})`;
    ctx.beginPath(); ctx.moveTo(x - width, 128);
    ctx.quadraticCurveTo(x + lean * .35, 128 - height * .6, x + lean, 128 - height);
    ctx.quadraticCurveTo(x + lean * .5 + width, 128 - height * .5, x + width, 128); ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return texture;
}

/** A lumpy sphere, shaded darker underneath so crowns keep their volume in flat light. */
function crownGeometry(seed: number) {
  // Faceted, like the cars and the conifers: every triangle keeps its own normal. Each corner is moved by a
  // function of its direction alone, so the copies of a shared corner stay together and no gaps open.
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  geometry.deleteAttribute('normal'); geometry.deleteAttribute('uv');
  const position = geometry.getAttribute('position'), random = randomFromSeed(seed);
  const lumps = Array.from({ length: 9 }, () => new THREE.Vector3(random() - .5, random() - .5, random() - .5).normalize());
  const colors = new Float32Array(position.count * 3), v = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i);
    let bulge = 0;
    for (const lump of lumps) bulge += Math.max(0, v.dot(lump) - .55) * .9;
    const radius = .82 + bulge;
    position.setXYZ(i, v.x * radius, v.y * radius * .84, v.z * radius);
    const light = .5 + .5 * Math.min(1, Math.max(0, v.y * .75 + .55)) + bulge * .25;
    colors[i * 3] = light; colors[i * 3 + 1] = light; colors[i * 3 + 2] = light * .94;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function tuftGeometry() {
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [];
  for (let card = 0; card < 3; card++) {
    const angle = card * Math.PI / 3 + .2, cx = Math.cos(angle) * .5, cz = Math.sin(angle) * .5;
    for (const [s, y, u, v] of [[-1, 0, 0, 0], [1, 0, 1, 0], [1, 1, 1, 1], [-1, 0, 0, 0], [1, 1, 1, 1], [-1, 1, 0, 1]]) {
      positions.push(cx * s, y, cz * s); normals.push(0, 1, 0); uvs.push(u, v);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  // Upward normals light ground cover like the turf it grows from.
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return geometry;
}

function coniferGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const tiers = [[.0, 1, .52], [.22, .8, .46], [.42, .6, .4], [.6, .4, .34], [.76, .22, .26]];
  for (const [base, radius, height] of tiers) {
    const cone = new THREE.ConeGeometry(radius, height, 9, 1, true);
    cone.translate(0, base + height / 2, 0);
    parts.push(cone.toNonIndexed());
  }
  const count = parts.reduce((sum, part) => sum + part.getAttribute('position').count, 0);
  const positions = new Float32Array(count * 3), colors = new Float32Array(count * 3);
  let offset = 0;
  for (const part of parts) {
    const position = part.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      positions[offset * 3] = position.getX(i); positions[offset * 3 + 1] = position.getY(i); positions[offset * 3 + 2] = position.getZ(i);
      const tone = .62 + .38 * position.getY(i) + (Math.hypot(position.getX(i), position.getZ(i)) > .3 ? .08 : -.1);
      colors[offset * 3] = tone; colors[offset * 3 + 1] = tone; colors[offset * 3 + 2] = tone;
      offset++;
    }
    part.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function createVegetation(builder: WorldBuilder, rng: () => number): Vegetation {
  const crowns = [crownGeometry(311), crownGeometry(977), crownGeometry(4409)];
  const tuftShape = tuftGeometry(), conifer = coniferGeometry();
  const crownMaterial = swaying(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .92 }), .035, 'crown');
  const tuftMaterial = swaying(new THREE.MeshStandardMaterial({ map: bladeTexture(), alphaTest: .4, side: THREE.DoubleSide, roughness: .95 }), .16, 'tuft');
  const coniferMaterial = swaying(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95, side: THREE.DoubleSide }), .012, 'conifer');
  const bark = surface('bark');
  const a = new THREE.Vector3(), b = new THREE.Vector3();

  function crown(x: number, y: number, z: number, radius: number, tint: number, flatten = 1) {
    builder.instance(crowns[Math.floor(rng() * crowns.length)], crownMaterial, x, y, z, { sx: radius, sy: radius * flatten, sz: radius, yaw: rng() * 6.28, color: tint });
    // The second draw is taken either way, so the stream of random numbers (and every tree after this one) is unchanged.
    rng();
  }

  return {
    tree(x, z, height, spread, kind = 'broad') {
      const palette = rng() > .9 ? AUTUMN_TINTS : CROWN_TINTS;
      const tint = palette[Math.floor(rng() * palette.length)];
      const trunkHeight = height * (kind === 'tall' ? .34 : .42);
      const lean = (rng() - .5) * .12;
      builder.cylinder(bark, x + lean * trunkHeight * .5, trunkHeight / 2, z, .13 + spread * .045, trunkHeight, { color: 0x6a5642, segments: 8, taper: .66, roll: -lean, collide: true });
      // Root flare so the trunk does not meet the ground as a plain cylinder.
      builder.cylinder(bark, x, .14, z, .22 + spread * .07, .3, { color: 0x5e4c3a, segments: 8, taper: .6 });
      const top = trunkHeight * .96;
      if (kind === 'tall') {
        for (let i = 0; i < 4; i++) crown(x + (rng() - .5) * spread * .3, top + i * height * .17, z + (rng() - .5) * spread * .3, spread * (.62 - i * .09), tint, 1.25);
        return;
      }
      const limbs = kind === 'round' ? 4 : 5 + Math.floor(rng() * 2);
      for (let i = 0; i < limbs; i++) {
        const angle = i / limbs * Math.PI * 2 + rng() * .7, reach = spread * (.42 + rng() * .3);
        const cx = x + Math.cos(angle) * reach, cz = z + Math.sin(angle) * reach, cy = top + height * (.12 + rng() * .2);
        builder.beam(bark, a.set(x + lean * trunkHeight, top - .25, z), b.set(cx, cy - spread * .12, cz), .075 + rng() * .04, { color: 0x6a5642, segments: 5, taper: .5 });
        crown(cx, cy + spread * .1, cz, spread * (.5 + rng() * .2), tint, .85);
      }
      crown(x + lean * trunkHeight, top + height * .36, z, spread * (kind === 'round' ? .82 : .66), tint, .9);
    },
    conifer(x, y, z, height, tint = 0x3f5a38) {
      builder.cylinder(bark, x, y + height * .08, z, height * .028, height * .2, { color: 0x4f4034, segments: 6 });
      builder.instance(conifer, coniferMaterial, x, y + height * .1, z, { sx: height * .27, sy: height * .9, sz: height * .27, yaw: rng() * 6.28, color: tint });
    },
    bush(x, y, z, scale, tint) {
      const color = tint ?? CROWN_TINTS[Math.floor(rng() * CROWN_TINTS.length)];
      builder.instance(crowns[Math.floor(rng() * crowns.length)], crownMaterial, x, y + scale * .5, z, { sx: scale * 1.15, sy: scale * .74, sz: scale * 1.15, yaw: rng() * 6.28, color });
      // One draw is still taken where the leaf cards used to be, so everything planted after this keeps its place.
      rng();
    },
    tuft(x, y, z, scale, tint) {
      builder.instance(tuftShape, tuftMaterial, x, y, z, { sx: scale * (.8 + rng() * .5), sy: scale, sz: scale * (.8 + rng() * .5), yaw: rng() * 6.28, color: tint ?? TUFT_TINTS[Math.floor(rng() * TUFT_TINTS.length)], cast: false });
    },
    hedge(x, z, length, yaw, height = 1.1) {
      const count = Math.max(2, Math.round(length / .9)), cos = Math.cos(yaw), sin = Math.sin(yaw);
      for (let i = 0; i < count; i++) {
        const t = (i + .5) / count - .5;
        builder.instance(crowns[i % crowns.length], crownMaterial, x + cos * t * length, height * .52, z - sin * t * length, { sx: .68, sy: height * .6, sz: .58, yaw: rng() * 6.28, color: 0x4f6b34 });
      }
    },
  };
}

/** Soft, irregular marks with no extra collision geometry or hard rectangular borders. */
export function createGroundMark(kind: 'oil' | 'dust' | 'tracks' | 'crack' | 'leaves' | 'skid') {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const random = randomFromSeed({ oil: 452, dust: 981, tracks: 219, crack: 613, leaves: 377, skid: 141 }[kind]);
  if (kind === 'tracks' || kind === 'skid') {
    for (let row = 0; row < 55; row++) {
      const fade = Math.sin(row / 55 * Math.PI) * (kind === 'skid' ? .5 : .3);
      ctx.fillStyle = kind === 'skid' ? `rgba(14,14,14,${fade})` : `rgba(45,37,27,${fade})`;
      for (const x of [55, 181]) for (let rib = 0; rib < 3; rib++) {
        ctx.save(); ctx.translate(x + rib * 6, row * 4.65); ctx.rotate(.22);
        ctx.fillRect(0, 0, kind === 'skid' ? 6 : 4, kind === 'skid' ? 5 : 3.2); ctx.restore();
      }
    }
  } else if (kind === 'crack') {
    ctx.strokeStyle = 'rgba(18,18,18,.78)'; ctx.lineCap = 'round';
    for (let branch = 0; branch < 5; branch++) {
      let x = 40 + random() * 176, y = 20 + random() * 40, heading = Math.PI / 2 + (random() - .5);
      ctx.lineWidth = 1.2 + random() * 1.6; ctx.beginPath(); ctx.moveTo(x, y);
      for (let step = 0; step < 22 && y < 240; step++) {
        heading += (random() - .5) * .9;
        x += Math.cos(heading) * 9; y += Math.abs(Math.sin(heading)) * 9 + 2;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  } else if (kind === 'leaves') {
    for (let i = 0; i < 70; i++) {
      const angle = random() * Math.PI * 2, radius = Math.sqrt(random()) * 110;
      ctx.save(); ctx.translate(128 + Math.cos(angle) * radius, 128 + Math.sin(angle) * radius); ctx.rotate(random() * 6);
      ctx.fillStyle = ['rgba(160,120,50,.85)', 'rgba(130,95,40,.85)', 'rgba(110,125,55,.8)', 'rgba(170,140,70,.8)'][i % 4];
      ctx.beginPath(); ctx.ellipse(0, 0, 4 + random() * 4, 2 + random() * 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  } else {
    for (let i = 0; i < 200; i++) {
      const angle = random() * Math.PI * 2, radius = Math.sqrt(random()) * 80;
      const x = 128 + Math.cos(angle) * radius, y = 128 + Math.sin(angle) * radius * .66;
      const size = 6 + random() * 30;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, size);
      const color = kind === 'oil' ? '26,23,19' : '168,150,116';
      gradient.addColorStop(0, `rgba(${color},${kind === 'oil' ? .06 : .08})`);
      gradient.addColorStop(1, `rgba(${color},0)`); ctx.fillStyle = gradient;
      ctx.fillRect(x - size, y - size, size * 2, size * 2);
    }
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  const material = new THREE.MeshStandardMaterial({ map: texture, transparent: true, depthWrite: false, roughness: kind === 'oil' ? .32 : 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  material.name = `mark-${kind}`;
  material.userData.needsUv = true;
  return material;
}

/** An irregular blob used to mask standing water. */
export function createPuddleMask() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const random = randomFromSeed(9133);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 128, 128);
  ctx.filter = 'blur(5px)';
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 9; i++) {
    ctx.beginPath(); ctx.ellipse(64 + (random() - .5) * 46, 64 + (random() - .5) * 34, 16 + random() * 20, 10 + random() * 16, random() * 3, 0, Math.PI * 2); ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.NoColorSpace;
  return texture;
}
