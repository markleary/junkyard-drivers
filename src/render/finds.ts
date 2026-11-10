import * as THREE from 'three';
import type { Find, FindKind } from '../game/finds';

/**
 * The twelve finds as objects in the world: a slowly turning keepsake under a
 * thin column of light, and the same piece hung on the workshop wall once it
 * has been brought home.
 */
const chrome = new THREE.MeshStandardMaterial({ color: 0xd6dad6, metalness: 1, roughness: .16 });
const dark = new THREE.MeshStandardMaterial({ color: 0x1c2224, metalness: .5, roughness: .5 });
const enamels = [0xe9e2cc, 0x24566a, 0xe3b449, 0xa63e2e].map(color => new THREE.MeshStandardMaterial({ color, metalness: .2, roughness: .35 }));
const brass = new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: .9, roughness: .3 });
const beamMaterial = new THREE.MeshBasicMaterial({ color: 0xffc866, transparent: true, opacity: .2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: .5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const beamGeometry = new THREE.CylinderGeometry(.05, .34, 7, 12, 1, true);
const ringGeometry = new THREE.RingGeometry(.5, .62, 28);
ringGeometry.rotateX(-Math.PI / 2);

function keepsake(kind: FindKind, index: number): THREE.Group {
  const group = new THREE.Group();
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z); mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };
  if (kind === 'hubcap') {
    const profile = [[0, .05], [.06, .05], [.1, .028], [.17, .022], [.2, .0], [.222, -.018]].map(([r, y]) => new THREE.Vector2(r, y));
    const dish = add(new THREE.LatheGeometry(profile, 28), chrome);
    dish.rotation.x = Math.PI / 2;
    for (let i = 0; i < 8; i++) {
      const slot = add(new THREE.BoxGeometry(.022, .07, .012), dark, Math.cos(i * Math.PI / 4) * .145, Math.sin(i * Math.PI / 4) * .145, .026);
      slot.rotation.z = i * Math.PI / 4 + Math.PI / 2;
    }
    add(new THREE.CylinderGeometry(.045, .045, .014, 16), enamels[index % enamels.length], 0, 0, .052).rotation.x = Math.PI / 2;
    add(new THREE.CircleGeometry(.22, 24), dark, 0, 0, -.02).rotation.y = Math.PI;
  } else if (kind === 'plate') {
    add(new THREE.BoxGeometry(.46, .23, .016), enamels[index % enamels.length]);
    add(new THREE.BoxGeometry(.4, .17, .004), enamels[(index + 1) % enamels.length], 0, 0, .009);
    add(new THREE.BoxGeometry(.4, .17, .004), enamels[(index + 1) % enamels.length], 0, 0, -.009);
    for (const x of [-.19, .19]) for (const y of [-.08, .08]) add(new THREE.CylinderGeometry(.012, .012, .024, 8), chrome, x, y, 0).rotation.x = Math.PI / 2;
    for (let i = 0; i < 5; i++) add(new THREE.BoxGeometry(.045, .1, .006), dark, -.14 + i * .07, 0, .012);
  } else {
    add(new THREE.CylinderGeometry(.085, .085, .2, 18), enamels[index % enamels.length]);
    add(new THREE.CylinderGeometry(.087, .087, .07, 18), brass, 0, .02, 0);
    add(new THREE.ConeGeometry(.085, .08, 18), chrome, 0, .14, 0);
    const spout = add(new THREE.CylinderGeometry(.008, .014, .2, 8), chrome, .05, .24, 0);
    spout.rotation.z = -.5;
    add(new THREE.TorusGeometry(.05, .008, 6, 14, Math.PI), chrome, -.085, .02, 0).rotation.z = Math.PI / 2;
  }
  return group;
}

export interface FindMarkers {
  /** Remove a find from the world, once collected. */
  collect(id: string): void;
  /** The uncollected find within `radius` of a point, if any. */
  near(x: number, z: number, radius: number): Find | undefined;
  update(seconds: number): void;
  /** Hang collected pieces on the wall, in the order they were found. */
  hang(ids: string[]): void;
}

export function createFindMarkers(scene: THREE.Scene, finds: Find[], collected: string[], pegs: THREE.Vector3[]): FindMarkers {
  const root = new THREE.Group(); root.name = 'Finds';
  scene.add(root);
  const markers = new Map<string, { find: Find; group: THREE.Group; piece: THREE.Group; ring: THREE.Mesh }>();
  finds.forEach((find, index) => {
    if (collected.includes(find.id)) return;
    const group = new THREE.Group();
    group.position.set(find.x, find.y, find.z);
    const piece = keepsake(find.kind, index);
    piece.position.y = .95;
    const beam = new THREE.Mesh(beamGeometry, beamMaterial);
    beam.position.y = 3.6;
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.position.y = .07;
    group.add(piece, beam, ring);
    root.add(group);
    markers.set(find.id, { find, group, piece, ring });
  });
  const wall = new THREE.Group(); wall.name = 'Recovered finds';
  scene.add(wall);
  const index = new Map(finds.map((find, i) => [find.id, i]));
  return {
    collect(id) {
      const marker = markers.get(id);
      if (!marker) return;
      root.remove(marker.group);
      markers.delete(id);
    },
    near(x, z, radius) {
      for (const marker of markers.values()) if (Math.hypot(marker.find.x - x, marker.find.z - z) < radius) return marker.find;
      return undefined;
    },
    update(seconds) {
      for (const marker of markers.values()) {
        marker.piece.rotation.y = seconds * 1.4 + marker.find.x;
        marker.piece.position.y = .95 + Math.sin(seconds * 2 + marker.find.z) * .07;
        const pulse = 1 + .12 * Math.sin(seconds * 3 + marker.find.x);
        marker.ring.scale.set(pulse, 1, pulse);
      }
    },
    hang(ids) {
      wall.clear();
      ids.slice(0, pegs.length).forEach((id, slot) => {
        const find = finds.find(item => item.id === id);
        if (!find) return;
        const piece = keepsake(find.kind, index.get(id) ?? slot);
        piece.scale.setScalar(1.35);
        // Faces into the bay from the east wall.
        piece.position.copy(pegs[slot]).add(new THREE.Vector3(-.05, find.kind === 'oilcan' ? -.12 : 0, 0));
        piece.rotation.y = -Math.PI / 2;
        wall.add(piece);
      });
    },
  };
}
