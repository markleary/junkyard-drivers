import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { Character } from '../src/physics/character';
import { FIXED_DT } from '../src/physics/vehicle';

beforeAll(async () => { await RAPIER.init(); });

function rig(position = { x: -20, y: 1, z: 0 }) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = FIXED_DT;
  // Match the yard's continuous ground, asphalt driveway and workshop slab.
  const box = (x: number, y: number, z: number, w: number, h: number, d: number) =>
    world.createCollider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(x, y, z));
  box(55, -.45, 70, 330, .9, 320);
  box(-20, .026, 12, 10, .052, 46);
  box(-20, .02, -15, 18, .08, 18);
  const character = new Character(world, position);
  world.step();
  const step = (x: number, z: number, frames: number) => {
    for (let i = 0; i < frames; i++) { character.move({ x, z }, FIXED_DT); world.step(); }
  };
  step(0, 0, 60);
  return { world, character, box, step };
}

describe('walking across real Rapier surface boundaries', () => {
  it.each([0, 12, 30, 34])('can leave asphalt, stop on gravel and walk back at z=%s', z => {
    const test = rig({ x: -20, y: 1, z });
    for (let crossing = 0; crossing < 3; crossing++) {
      test.step(-3.6, 0, 133);
      expect(test.character.body.translation().x).toBeLessThan(-27.5);
      test.step(0, 0, 30);
      test.step(3.6, 0, 133);
      expect(test.character.body.translation().x).toBeGreaterThan(-20.5);
      expect(test.character.body.translation().x).toBeLessThan(-19.5);
      expect(test.character.controller.computedGrounded()).toBe(true);
    }
    test.world.free();
  });

  it('crosses both sides of the asphalt lane at walking and running speeds', () => {
    const test = rig({ x: -28, y: 1, z: 20 });
    test.step(3.6, 0, 267);
    expect(test.character.body.translation().x).toBeGreaterThan(-12.5);
    test.step(0, 0, 30);
    test.step(-6, 0, 160);
    expect(test.character.body.translation().x).toBeLessThan(-27.5);
    test.world.free();
  });

  it('walks from Garage concrete to asphalt and back without catching the overlapping slabs', () => {
    const test = rig({ x: -20, y: 1, z: -17 });
    test.step(0, 3.6, 300);
    expect(test.character.body.translation().z).toBeGreaterThan(.5);
    test.step(0, 0, 30);
    test.step(0, -3.6, 300);
    expect(test.character.body.translation().z).toBeLessThan(-16.5);
    test.world.free();
  });

  it('steps over a normal 24 cm curb onto a 16 cm sidewalk and back', () => {
    const test = rig({ x: 0, y: 1, z: 0 });
    test.box(8, .08, 0, 6, .16, 5);
    test.box(4.88, .12, 0, .24, .24, 5);
    test.world.step();
    test.step(3.6, 0, 150);
    expect(test.character.body.translation().x).toBeGreaterThan(8.5);
    expect(test.character.body.translation().y).toBeGreaterThan(.96);
    test.step(0, 0, 30);
    test.step(-3.6, 0, 150);
    expect(test.character.body.translation().x).toBeLessThan(.5);
    test.world.free();
  });

  it('retains blocking collision for a barrier taller than the step limit', () => {
    const test = rig({ x: 0, y: 1, z: 0 });
    test.box(3, .6, 0, .5, 1.2, 10);
    test.world.step();
    test.step(3.6, 0, 180);
    expect(test.character.body.translation().x).toBeGreaterThan(2);
    expect(test.character.body.translation().x).toBeLessThan(2.75);
    expect(test.character.body.translation().y).toBeLessThan(.9);
    test.world.free();
  });

  it('falls to the ground after a safe-position reset without retaining fall velocity', () => {
    const test = rig({ x: 0, y: 1, z: 0 });
    test.character.teleport({ x: 0, y: 4, z: 0 });
    test.step(0, 0, 10);
    expect(test.character.body.translation().y).toBeLessThan(4);
    test.character.teleport({ x: 0, y: 1, z: 0 });
    test.step(0, 0, 120);
    expect(test.character.body.translation().y).toBeGreaterThan(.82);
    expect(test.character.body.translation().y).toBeLessThan(.87);
    expect(test.character.controller.computedGrounded()).toBe(true);
    test.world.free();
  });
});
