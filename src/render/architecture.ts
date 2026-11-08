import * as THREE from 'three';

/** Cheap dimensional interiors behind reflective glazing; no additional light sources. */
export function createWindowMaterials() {
  return [0, 1, 2, 3].map(style => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const context = canvas.getContext('2d')!;
    const room = context.createLinearGradient(0, 0, 0, 256);
    room.addColorStop(0, style === 3 ? '#6b6150' : '#3d4a49');
    room.addColorStop(.55, style === 3 ? '#8c785b' : '#273638'); room.addColorStop(1, '#1b292b');
    context.fillStyle = room; context.fillRect(0, 0, 256, 256);
    if (style < 2) {
      for (const side of [0, 1]) for (let pleat = 0; pleat < 8; pleat++) {
        context.fillStyle = pleat % 2 ? '#97998a' : '#777e73';
        context.fillRect(side * 203 + pleat * 7, 0, 6, 244);
      }
    } else {
      context.fillStyle = '#9d9a83'; context.fillRect(0, 0, 256, style === 2 ? 100 : 42);
      context.fillStyle = '#717769';
      for (let y = 6; y < (style === 2 ? 100 : 42); y += 8) context.fillRect(0, y, 256, 1);
    }
    context.fillStyle = 'rgba(190,208,202,.11)';
    context.beginPath(); context.moveTo(70, 0); context.lineTo(98, 0); context.lineTo(216, 256); context.lineTo(188, 256); context.fill();
    context.strokeStyle = 'rgba(14,24,25,.5)'; context.lineWidth = 13; context.strokeRect(0, 0, 256, 256);
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
    return new THREE.MeshPhysicalMaterial({ map, color: '#cbd2c9', metalness: .12, roughness: .18, clearcoat: 1, clearcoatRoughness: .08, envMapIntensity: .85 });
  });
}

/** Unit pitched roof, base at y=0 and ridge at y=1. */
export function createPitchedRoof() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -.5,0,-.5, .5,0,-.5, 0,1,-.5,
    -.5,0,.5, .5,0,.5, 0,1,.5,
  ], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0,0,1,0,.5,1,0,0,1,0,.5,1], 2));
  geometry.setIndex([0,2,1,3,4,5,0,3,5,0,5,2,1,2,5,1,5,4,0,1,4,0,4,3]);
  const flat = geometry.toNonIndexed(); geometry.dispose(); flat.computeVertexNormals(); return flat;
}

/** Lettering follows the tank wall, rather than floating on a tangent billboard. */
export function createTankLettering() {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 160;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#233c3d'; context.textAlign = 'center'; context.textBaseline = 'middle';
  context.font = '800 90px sans-serif'; context.fillText('WILLOW CREEK', 512, 84);
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const material = new THREE.MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: .78 });
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(5.414, 5.414, 1.3, 48, 1, true, Math.PI - .84, 1.68), material);
  mesh.userData.excludeFromAO = true;
  return mesh;
}
