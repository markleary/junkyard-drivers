import * as THREE from 'three';
import { randomFromSeed } from '../world/layout';

/** Original alpha-cut foliage, shared by every tree rather than individual leaf meshes. */
export function createFoliage() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const random = randomFromSeed(84631);
  ctx.lineCap = 'round';
  for (let twig = 0; twig < 7; twig++) {
    const angle = twig / 7 * Math.PI * 2 + .2;
    const tx = 128 + Math.cos(angle) * 77, ty = 128 + Math.sin(angle) * 77;
    ctx.strokeStyle = '#797864'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(128, 135); ctx.quadraticCurveTo(128 + Math.cos(angle) * 40, ty + 14, tx, ty); ctx.stroke();
  }
  for (let leaf = 0; leaf < 88; leaf++) {
    const angle = random() * Math.PI * 2, radius = Math.sqrt(random()) * 100;
    const x = 128 + Math.cos(angle) * radius, y = 128 + Math.sin(angle) * radius * .9;
    const length = 8 + random() * 13, width = length * (.38 + random() * .15);
    const tone = 140 + Math.floor(random() * 105);
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle + random());
    ctx.fillStyle = `rgb(${tone},${Math.min(255, tone + 7)},${tone - 17})`;
    ctx.beginPath(); ctx.moveTo(-length / 2, 0);
    ctx.bezierCurveTo(-length / 3, -width, length / 3, -width, length / 2, 0);
    ctx.bezierCurveTo(length / 3, width, -length / 3, width, -length / 2, 0); ctx.fill();
    ctx.strokeStyle = 'rgba(64,73,43,.3)'; ctx.lineWidth = .6;
    ctx.beginPath(); ctx.moveTo(-length / 2, 0); ctx.lineTo(length / 2, 0); ctx.stroke(); ctx.restore();
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  // Crossed, offset sprays keep a porous silhouette from every camera direction.
  // Radial normals soften the lighting across each volume of leaves.
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [];
  const corner = new THREE.Vector3(), normal = new THREE.Vector3();
  for (let spray = 0; spray < 14; spray++) {
    const angle = spray * 2.39996, radius = spray < 3 ? .16 : .42 + random() * .2;
    const center = new THREE.Vector3(Math.cos(angle) * radius, (random() - .5) * .85, Math.sin(angle) * radius);
    const rotation = new THREE.Euler((random() - .5) * 1.5, angle, (random() - .5) * .8);
    const scale = .95 + random() * .3;
    for (const [x, y, u, v] of [[-.5,-.5,0,0],[.5,-.5,1,0],[.5,.5,1,1],[-.5,-.5,0,0],[.5,.5,1,1],[-.5,.5,0,1]]) {
      corner.set(x * scale, y * scale, 0).applyEuler(rotation).add(center);
      normal.copy(corner).add(new THREE.Vector3(0, .28, 0)).normalize();
      positions.push(corner.x, corner.y, corner.z); normals.push(normal.x, normal.y, normal.z); uvs.push(u, v);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  const materials = [0x647b44, 0x7d8c4e, 0x73814a, 0x526b3c].map(color => {
    const material = new THREE.MeshStandardMaterial({ color, map: texture, alphaTest: .48, side: THREE.DoubleSide, roughness: .95 });
    material.shadowSide = THREE.DoubleSide;
    material.userData.excludeFromAO = true;
    return material;
  });
  return { geometry, materials };
}

/** Soft, irregular marks with no extra collision geometry or hard rectangular borders. */
export function createGroundMark(kind: 'oil' | 'dust' | 'tracks') {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const random = randomFromSeed(kind === 'oil' ? 452 : kind === 'dust' ? 981 : 219);
  if (kind === 'tracks') {
    for (let row = 0; row < 55; row++) {
      const fade = Math.sin(row / 55 * Math.PI) * .24;
      ctx.fillStyle = `rgba(45,37,27,${fade})`;
      for (const x of [55, 181]) for (let rib = 0; rib < 3; rib++) {
        ctx.save(); ctx.translate(x + rib * 6, row * 4.65); ctx.rotate(.22);
        ctx.fillRect(0, 0, 4, 3.2); ctx.restore();
      }
    }
  } else {
    for (let i = 0; i < 180; i++) {
      const angle = random() * Math.PI * 2, radius = Math.sqrt(random()) * 76;
      const x = 128 + Math.cos(angle) * radius, y = 128 + Math.sin(angle) * radius * .62;
      const size = 6 + random() * 28;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, size);
      const color = kind === 'oil' ? '32,29,23' : '152,137,108';
      gradient.addColorStop(0, `rgba(${color},${kind === 'oil' ? .035 : .07})`);
      gradient.addColorStop(1, `rgba(${color},0)`); ctx.fillStyle = gradient;
      ctx.fillRect(x - size, y - size, size * 2, size * 2);
    }
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshStandardMaterial({ map: texture, transparent: true, depthWrite: false, roughness: kind === 'oil' ? .55 : 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  material.userData.excludeFromAO = true;
  return material;
}
