import * as THREE from 'three';

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
  context.font = '800 104px "Barlow Condensed", Impact, sans-serif'; context.fillText('WILLOW CREEK', 512, 84);
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const material = new THREE.MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: .78 });
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(5.414, 5.414, 1.3, 48, 1, true, Math.PI - .84, 1.68), material);
  mesh.userData.excludeFromAO = true;
  return mesh;
}
