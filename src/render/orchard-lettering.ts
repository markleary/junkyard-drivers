import * as THREE from 'three';
import { randomFromSeed } from '../world/layout';
import type { RestorationAppearance } from './restoration-surface';

/** Painted on the outward slope of the passenger-side cargo door. Transparent chips expose the actual finish. */
export function orchardLettering() {
  const canvas = document.createElement('canvas');
  canvas.width = 768; canvas.height = 320;
  const c = canvas.getContext('2d')!;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = '#4d3026';
  c.font = 'italic bold 108px Georgia, serif';
  c.fillText('Bell Orchard', 382, 131, 708);
  c.fillStyle = '#fff0be';
  c.fillText('Bell Orchard', 378, 126, 708);
  c.fillStyle = '#733527';
  c.fillRect(126, 195, 516, 58);
  c.fillStyle = '#ffe5a1';
  c.font = 'bold 37px Georgia, serif';
  c.fillText('FARM  •  FRESH  •  APPLES', 384, 228);
  c.fillStyle = '#853c32';
  c.beginPath(); c.ellipse(383, 45, 22, 19, -.1, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#425d36';
  c.beginPath(); c.ellipse(397, 24, 14, 5, -.5, 0, Math.PI * 2); c.fill();
  const random = randomFromSeed(1976);
  c.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 2900; i++) c.fillRect(random() * 768, random() * 320, 1 + random() * 6, .6 + random() * 2);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.68, .70),
    new THREE.MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: .78 }));
  mesh.name = 'Bell Orchard door lettering';
  mesh.rotation.set(-.052, Math.PI / 2, 0, 'YXZ');
  mesh.position.set(.904, .87, 1.18);
  return mesh;
}

export function inkOpacity(stage: RestorationAppearance | undefined, restored: boolean) {
  if (restored) return stage?.orchardLettering ? 1 : 0;
  if (!stage) return .46;
  if (stage.stage === 'wash') return .46 + .51 * stage.work;
  if (stage.stage === 'prime') return .97 * (1 - stage.work);
  if (stage.stage === 'paint') return 0;
  return .97;
}
