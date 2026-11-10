import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { WorldBuilder } from './builder';
import { ensureLightTextures, updateGlows } from './materials';
import { configureSurfaces, prepareSurfaces } from './surfaces';
import { createVegetation } from './vegetation';
import type { QualitySettings } from './quality';
import { randomFromSeed, type TownLayout } from '../world/layout';
import { buildGround } from './scene/ground';
import { buildYard } from './scene/yard';
import { TROPHY_PEGS, buildGarage } from './scene/garage';
import { buildStore } from './scene/store';
import { buildTown } from './scene/town';
import { buildLandscape } from './scene/landscape';
import type { LampSpot, SceneContext, WorldInteractable } from './scene/kit';

export type { WorldInteractable } from './scene/kit';

export interface WorldView {
  interactables: WorldInteractable[];
  garagePosition: THREE.Vector3;
  spawn: THREE.Vector3;
  /** Hooks on the workshop wall for recovered finds. */
  trophyPegs: THREE.Vector3[];
  lamps: LampSpot[];
  stats: { meshes: number; instancedMeshes: number; triangles: number; colliders: number; buildMs: number };
  updateListings: (purchased: string[]) => void;
  /** Per-frame: lamp glow, the few moving parts, and the lights nearest the viewer. */
  update(dt: number, seconds: number, night: number, focus: THREE.Vector3): void;
}

export function createWorld(scene: THREE.Scene, world: RAPIER.World, layout: TownLayout, quality: QualitySettings): WorldView {
  const started = performance.now();
  const root = new THREE.Group();
  root.name = 'Town, scrapyard and workshop';
  scene.add(root);
  configureSurfaces({ detailMaps: quality.tier !== 'compatible' });
  prepareSurfaces();
  ensureLightTextures();
  const builder = new WorldBuilder(root, world);
  const rng = randomFromSeed(layout.seed ^ 0x8549);
  const ctx: SceneContext = { b: builder, root, rng, layout, quality, interactables: [], lamps: [], animated: [] };
  const plants = createVegetation(builder, randomFromSeed(layout.seed ^ 0x2f71));

  const marks = buildGround(ctx, plants);
  buildYard(ctx, plants, marks);
  buildGarage(ctx, marks);
  buildStore(ctx, plants, marks);
  buildTown(ctx, plants, marks);
  buildLandscape(ctx, plants);
  const built = builder.build();

  // A handful of real lights follow the viewer from lamp to lamp after dark.
  // Their count is fixed, so no shader is ever recompiled as they move.
  const pool = Array.from({ length: quality.lampLights }, () => {
    const light = new THREE.PointLight(0xffffff, 0, 20, 1.7);
    light.visible = true;
    root.add(light);
    return { light, lamp: undefined as LampSpot | undefined };
  });
  const order: { lamp: LampSpot; distance: number }[] = ctx.lamps.map(lamp => ({ lamp, distance: 0 }));
  let poolTimer = 0;

  function updatePool(dt: number, night: number, focus: THREE.Vector3) {
    if (!pool.length) return;
    poolTimer -= dt;
    if (poolTimer <= 0) {
      poolTimer = .2;
      for (const item of order) item.distance = Math.hypot(item.lamp.x - focus.x, item.lamp.z - focus.z);
      order.sort((a, b) => a.distance - b.distance);
      const wanted = order.slice(0, pool.length).map(item => item.lamp);
      // Keep lights where they are when their lamp is still among the nearest.
      for (const slot of pool) if (slot.lamp && !wanted.includes(slot.lamp)) slot.lamp = undefined;
      for (const lamp of wanted) {
        if (pool.some(slot => slot.lamp === lamp)) continue;
        const slot = pool.find(item => !item.lamp);
        if (!slot) break;
        slot.lamp = lamp;
        slot.light.position.set(lamp.x, lamp.y, lamp.z);
        slot.light.color.setHex(lamp.color);
        slot.light.distance = lamp.reach;
        slot.light.intensity = 0;
      }
    }
    // Fade toward the edge of the pool's reach so a light is dark whenever it changes lamps.
    const edge = order[pool.length]?.distance ?? Infinity;
    for (const slot of pool) {
      if (!slot.lamp) { slot.light.intensity = 0; continue; }
      const distance = Math.hypot(slot.lamp.x - focus.x, slot.lamp.z - focus.z);
      const fade = Number.isFinite(edge) ? THREE.MathUtils.smoothstep(edge - distance, 0, Math.max(4, edge * .3)) : 1;
      const target = night * fade * slot.lamp.reach * 1.35;
      slot.light.intensity += (target - slot.light.intensity) * Math.min(1, dt * 5);
    }
  }

  return {
    interactables: ctx.interactables,
    garagePosition: new THREE.Vector3(-20, .72, -13),
    spawn: new THREE.Vector3(-20, 1, 26),
    trophyPegs: TROPHY_PEGS,
    lamps: ctx.lamps,
    stats: { ...built, buildMs: Math.round(performance.now() - started) },
    updateListings: () => {},
    update(dt, seconds, night, focus) {
      updateGlows(night, seconds);
      for (const animate of ctx.animated) animate(seconds, dt);
      updatePool(dt, night, focus);
    },
  };
}
