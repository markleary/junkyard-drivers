import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getCatalogPart, type Part } from '../game/catalog';
import type { StashItem } from '../game/stash';
import { PART_SOLID } from '../world/yard';
import { createEngineModel, createExhaustModel, createRacingWheelStack, createTurboModel, type EngineFamily } from './parts';

/**
 * Rare parts lying in the yard's hiding places: each on a pallet, as somebody left it. Unlike the rest of the
 * scenery these come and go (bought, sold on with a car, turned up somewhere else), so they are ordinary scene
 * objects with their own small colliders rather than part of the baked world.
 */
export interface StashView {
  /** Put every part that has not been bought where this game hides it, and clear away the rest. */
  sync(items: readonly StashItem[], bought: readonly string[]): void;
  /** Where to look to inspect each part still lying in the yard. */
  targets(): { listingId: string; position: THREE.Vector3; label: string }[];
  dispose(): void;
}

const timber = new THREE.MeshStandardMaterial({ color: 0x8a6a44, roughness: .9 });
const timberDark = new THREE.MeshStandardMaterial({ color: 0x5b4630, roughness: .92 });
const sacking = new THREE.MeshStandardMaterial({ color: 0x9a8a68, roughness: 1, side: THREE.DoubleSide });
/** Boxes given as [width, height, depth, x, y, z], joined into one shape: a pallet's boards are one draw call, not six. */
const boards = (pieces: number[][]) => mergeGeometries(pieces.map(([w, h, d, x, y, z]) => new THREE.BoxGeometry(w, h, d).translate(x, y, z)), false)!;
const bearers = boards([-.5, 0, .5].map(z => [1.2, .09, .1, 0, .045, z]));
const slats = boards(Array.from({ length: 6 }, (_, i) => [.14, .025, 1.1, -.5 + i * .2, .103, 0]));
// The timber frame an engine was shipped in: four posts and two rails across the top.
const crate = boards([...[[-.52, -.5], [.52, -.5], [-.52, .5], [.52, .5]].map(([x, z]) => [.06, 1, .06, x, .5, z]), ...[-.5, .5].map(z => [1.104, .054, .06, 0, .97, z])]);
const square = new THREE.PlaneGeometry(.95, .85);

function pallet(): THREE.Group {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(bearers, timberDark), new THREE.Mesh(slats, timber));
  return group;
}

/** The part itself, sized and turned to sit on a pallet top at y = 0.115. */
function display(part: Part): THREE.Object3D {
  const group = new THREE.Group();
  if (part.kind === 'engine') {
    const engine = createEngineModel(part.mount!.toLowerCase() as EngineFamily, { condition: 'salvage', performance: true });
    engine.scale.setScalar(.92);
    group.add(engine);
    // Still in the timber frame it was shipped in.
    group.add(new THREE.Mesh(crate, timber));
  } else if (part.kind === 'wheels') {
    group.add(createRacingWheelStack({ condition: 'salvage' }));
  } else if (part.kind === 'turbo') {
    const turbo = createTurboModel({ condition: 'salvage' });
    turbo.scale.setScalar(1.5); turbo.rotation.y = .5;
    // On a square of sacking, so the alloy stands out against the boards.
    const cloth = new THREE.Mesh(square, sacking);
    cloth.rotation.x = -Math.PI / 2; cloth.rotation.z = .2; cloth.position.y = .004;
    group.add(cloth, turbo);
  } else {
    const pipes = createExhaustModel({ condition: 'salvage', style: 'sidepipes' });
    pipes.rotation.y = .5;
    group.add(pipes);
  }
  group.position.y = .115;
  return group;
}

export function createStashView(scene: THREE.Scene, world: RAPIER.World): StashView {
  const root = new THREE.Group(); root.name = 'Rare salvage';
  scene.add(root);
  const shown = new Map<string, { group: THREE.Group; collider: RAPIER.Collider; spot: number; label: string; aim: THREE.Vector3 }>();
  const remove = (listingId: string) => {
    const entry = shown.get(listingId);
    if (!entry) return;
    root.remove(entry.group);
    world.removeCollider(entry.collider, true);
    shown.delete(listingId);
  };
  return {
    sync(items, bought) {
      const wanted = new Map(items.filter(item => item.kind === 'part' && !bought.includes(item.listingId)).map(item => [item.listingId, item]));
      for (const [listingId, entry] of [...shown]) if (wanted.get(listingId)?.spot !== entry.spot) remove(listingId);
      for (const [listingId, item] of wanted) {
        if (shown.has(listingId)) continue;
        const part = getCatalogPart(item.itemId), group = new THREE.Group();
        group.name = part.name;
        group.add(pallet(), display(part));
        group.position.set(item.x, .06, item.z); group.rotation.y = item.yaw;
        group.traverse(object => { if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true; } });
        root.add(group);
        const collider = world.createCollider(RAPIER.ColliderDesc.cuboid(PART_SOLID.w / 2, PART_SOLID.h / 2, PART_SOLID.d / 2)
          .setTranslation(item.x, PART_SOLID.h / 2 + .06, item.z).setRotation({ x: 0, y: Math.sin(item.yaw / 2), z: 0, w: Math.cos(item.yaw / 2) }));
        shown.set(listingId, { group, collider, spot: item.spot, label: part.name, aim: new THREE.Vector3(item.x, .7, item.z) });
      }
    },
    targets() {
      return [...shown].map(([listingId, entry]) => ({ listingId, position: entry.aim, label: entry.label }));
    },
    dispose() {
      for (const listingId of [...shown.keys()]) remove(listingId);
      scene.remove(root);
    },
  };
}
