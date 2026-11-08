import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { PARTS, SHELLS } from '../src/game/catalog';
import { FIXED_DT, Vehicle } from '../src/physics/vehicle';
import type { DriveInput, VehicleTuning } from '../src/physics/vehicle';

beforeAll(async () => { await RAPIER.init(); });
const idle: DriveInput = { throttle: 0, steer: 0, brake: false, handbrake: false };
const throttle: DriveInput = { ...idle, throttle: 1 };

function tuning(engineId = 'i4-stock', tireId = 'street-1'): VehicleTuning {
  return { mass: SHELLS[0].mass, power: PARTS.find((part) => part.id === engineId)!.power!, grip: PARTS.find((part) => part.id === tireId)!.grip! };
}

function rig(config = tuning()) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = FIXED_DT;
  world.createCollider(RAPIER.ColliderDesc.cuboid(500, .5, 500).setTranslation(0, -.5, 0).setFriction(1));
  const vehicle = new Vehicle(world, config, { x: 0, y: 1, z: 0 }, 0);
  const step = (input: DriveInput, frames: number) => {
    for (let i = 0; i < frames; i++) { vehicle.update(input); world.step(); }
  };
  step(idle, 120);
  const speed = () => { const v = vehicle.body.linvel(); return Math.hypot(v.x, v.z); };
  return { world, vehicle, step, speed, free: () => world.free() };
}

describe('actual Rapier raycast vehicle dynamics', () => {
  it('settles on four suspension wheels and accelerates under throttle', () => {
    const test = rig();
    expect(test.vehicle.controller.numWheels()).toBe(4);
    expect(test.vehicle.body.translation().y).toBeGreaterThan(.3);
    for (let i = 0; i < 4; i++) expect(test.vehicle.controller.wheelIsInContact(i)).toBe(true);
    test.step(throttle, 240);
    console.log('starter acceleration', test.speed(), test.vehicle.body.translation(), test.vehicle.speed);
    expect(test.speed()).toBeGreaterThan(5);
    expect(test.vehicle.body.translation().z).toBeLessThan(-8);
    expect(test.vehicle.speed).toBeGreaterThan(5);
    test.free();
  });

  it('measures higher four-second acceleration for the upgraded I4', () => {
    const stock = rig();
    const performance = rig(tuning('i4-performance'));
    stock.step(throttle, 240);
    performance.step(throttle, 240);
    console.log('four-second speeds m/s', { stock: stock.speed(), performance: performance.speed() });
    expect(performance.speed()).toBeGreaterThan(stock.speed() * 1.2);
    stock.free(); performance.free();
  });

  it('changes lateral grip physically when switching from street to sport tires', () => {
    const street = rig();
    const sport = rig(tuning('i4-stock', 'sport-1'));
    // Identical sideways skid at road speed; higher-grip tires should arrest it sooner.
    street.vehicle.body.setLinvel({ x: 12, y: 0, z: -12 }, true);
    sport.vehicle.body.setLinvel({ x: 12, y: 0, z: -12 }, true);
    street.step(idle, 20); sport.step(idle, 20);
    const streetSlip = Math.abs(street.vehicle.body.linvel().x);
    const sportSlip = Math.abs(sport.vehicle.body.linvel().x);
    console.log('lateral skid m/s', { streetSlip, sportSlip });
    expect(sportSlip).toBeLessThan(streetSlip * .85);
    street.free(); sport.free();
  });

  it('steers left with A input and right with D input while staying upright', () => {
    const left = rig();
    const right = rig();
    left.step(throttle, 120); right.step(throttle, 120);
    left.step({ ...throttle, steer: 1 }, 90);
    right.step({ ...throttle, steer: -1 }, 90);
    const l = left.vehicle.body.translation();
    const r = right.vehicle.body.translation();
    const q = left.vehicle.body.rotation();
    console.log('junction turn', { left: { x: l.x, z: l.z }, right: { x: r.x, z: r.z }, upright: 1 - 2 * (q.x * q.x + q.z * q.z) });
    expect(l.x).toBeLessThan(-2);
    expect(r.x).toBeGreaterThan(2);
    expect(l.z).toBeLessThan(-8);
    expect(r.z).toBeLessThan(-8);
    expect(1 - 2 * (q.x * q.x + q.z * q.z)).toBeGreaterThan(.9);
    expect(Math.abs(left.vehicle.steering)).toBeLessThan(.48);
    left.free(); right.free();
  });

  it('backs up with reverse throttle and applies the handbrake to rear tires', () => {
    const test = rig();
    test.step({ ...idle, throttle: -.55 }, 180);
    expect(test.vehicle.body.translation().z).toBeGreaterThan(4);
    expect(test.vehicle.speed).toBeLessThan(-2);
    test.vehicle.update({ ...idle, handbrake: true });
    expect(test.vehicle.controller.wheelFrictionSlip(0)).toBeCloseTo(test.vehicle.tuning.grip);
    expect(test.vehicle.controller.wheelFrictionSlip(2)).toBeCloseTo(test.vehicle.tuning.grip * .25);
    test.free();
  });

  it('brakes to a stop and resets an overturned vehicle onto the apron', () => {
    const test = rig();
    test.step(throttle, 240);
    const before = test.speed();
    test.step({ ...idle, brake: true }, 180);
    expect(test.speed()).toBeLessThan(before * .1);
    test.vehicle.body.setRotation({ x: 0, y: 0, z: 1, w: 0 }, true);
    test.vehicle.body.setLinvel({ x: 8, y: -2, z: 3 }, true);
    test.vehicle.recover();
    expect(test.vehicle.body.translation()).toMatchObject({ x: -20, y: 1, z: 0 });
    expect(test.vehicle.body.linvel()).toMatchObject({ x: 0, y: 0, z: 0 });
    expect(test.vehicle.body.rotation().z).toBe(0);
    expect(test.vehicle.speed).toBe(0);
    test.free();
  });
});
