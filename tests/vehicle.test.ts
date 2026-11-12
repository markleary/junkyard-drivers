import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { PARTS, SHELLS } from '../src/game/catalog';
import { FIXED_DT, NITRO_REARM, NITRO_REFILL, Vehicle } from '../src/physics/vehicle';
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

describe('turbocharger, nitrous and what they do to the same car', () => {
  const part = (id: string) => PARTS.find(item => item.id === id)!;
  const turbo = (id: string): Partial<VehicleTuning> => ({ boost: part(id).boost, lag: part(id).lag });
  const kit = (id: string): Partial<VehicleTuning> => ({ shot: part(id).shot, burn: part(id).burn });
  const boosted: DriveInput = { ...throttle, nitro: true };

  it('builds boost over the turbine’s lag and lets go when the throttle shuts', () => {
    const test = rig({ ...tuning(), ...turbo('turbo-race') });
    expect(test.vehicle.spool).toBe(0);
    test.step(throttle, Math.round(part('turbo-race').lag! / FIXED_DT));
    // One time constant in: about two thirds of the way there.
    expect(test.vehicle.spool).toBeGreaterThan(.55);
    expect(test.vehicle.spool).toBeLessThan(.72);
    test.step(throttle, 240);
    expect(test.vehicle.spool).toBeGreaterThan(.98);
    test.step(idle, 30);
    expect(test.vehicle.spool).toBeLessThan(.15);
    // Reversing and braking make no boost.
    test.step({ ...idle, throttle: -.55 }, 120);
    expect(test.vehicle.spool).toBeLessThan(.01);
    test.step({ ...throttle, brake: true }, 60);
    expect(test.vehicle.spool).toBeLessThan(.01);
    test.free();
  });

  it('wakes a small turbine sooner than a big one, and the big one pulls harder once it is awake', () => {
    const small = rig({ ...tuning(), ...turbo('turbo-street') }), big = rig({ ...tuning(), ...turbo('turbo-race') }), plain = rig();
    for (const test of [small, big, plain]) test.step(throttle, 20);
    expect(small.vehicle.spool).toBeGreaterThan(big.vehicle.spool * 1.4);
    for (const test of [small, big, plain]) test.step(throttle, 340);
    console.log('six-second speeds m/s', { plain: plain.speed(), small: small.speed(), big: big.speed() });
    expect(small.speed()).toBeGreaterThan(plain.speed() * 1.08);
    expect(big.speed()).toBeGreaterThan(small.speed() * 1.04);
    expect(plain.vehicle.spool).toBe(0);
    for (const test of [small, big, plain]) test.free();
  });

  it('adds nitrous only while the button is held with the throttle down, and empties the bottle in its rated time', () => {
    const test = rig({ ...tuning(), ...kit('nitro-75') }), plain = rig({ ...tuning(), ...kit('nitro-75') });
    expect(test.vehicle.charge).toBe(1);
    // The button alone, with no throttle, does nothing and costs nothing.
    test.step({ ...idle, nitro: true }, 60);
    expect(test.vehicle.nitro).toBe(false);
    expect(test.vehicle.charge).toBe(1);
    test.step(boosted, 120); plain.step(throttle, 120);
    expect(test.vehicle.nitro).toBe(true);
    expect(plain.vehicle.nitro).toBe(false);
    expect(test.vehicle.charge).toBeCloseTo(1 - 2 / part('nitro-75').burn!, 2);
    console.log('two-second speeds m/s', { plain: plain.speed(), nitrous: test.speed() });
    expect(test.speed()).toBeGreaterThan(plain.speed() * 1.25);
    // Held to the end: it runs dry after the rated four seconds and stops pushing.
    test.step(boosted, Math.round(2.1 / FIXED_DT));
    expect(test.vehicle.charge).toBe(0);
    expect(test.vehicle.nitro).toBe(false);
    test.free(); plain.free();
  });

  it('refills with the button up, and will not fire again until the bottle has pressure', () => {
    const test = rig({ ...tuning(), ...kit('nitro-150') });
    test.step(boosted, Math.round(part('nitro-150').burn! / FIXED_DT) + 5);
    expect(test.vehicle.charge).toBe(0);
    // Holding the button on an empty bottle neither fires nor refills.
    test.step(boosted, 120);
    expect(test.vehicle.charge).toBe(0);
    expect(test.vehicle.nitro).toBe(false);
    // A few seconds off the button: some gas back, but not enough to fire.
    test.step(throttle, Math.round(NITRO_REFILL * (NITRO_REARM - .05) / FIXED_DT));
    expect(test.vehicle.charge).toBeGreaterThan(.1);
    test.step(boosted, 1);
    expect(test.vehicle.nitro).toBe(false);
    test.step(idle, Math.round(NITRO_REFILL * .12 / FIXED_DT));
    test.step(boosted, 2);
    expect(test.vehicle.nitro).toBe(true);
    // Left alone for the whole refill time it is full again, and never more than full.
    test.step(idle, Math.round(NITRO_REFILL / FIXED_DT) + 60);
    expect(test.vehicle.charge).toBe(1);
    test.free();
  });

  it('leaves a car without the parts exactly as it was', () => {
    const before = rig(), after = rig({ ...tuning(), boost: 0, shot: 0 });
    before.step(throttle, 240); after.step(boosted, 240);
    expect(after.speed()).toBeCloseTo(before.speed(), 6);
    expect(after.vehicle.nitro).toBe(false);
    expect(after.vehicle.spool).toBe(0);
    before.free(); after.free();
  });

  it('keeps the most powerful build possible on its wheels and under control', () => {
    // The rarest V12 with the biggest turbo, open pipes, the big nitrous kit and racing slicks, in the lightest shell that takes a V12.
    const engine = part('rare-v12').power! * (1 + part('exhaust-race').flow!);
    const config: VehicleTuning = { mass: SHELLS.find(shell => shell.mount === 'V12')!.mass, power: engine, grip: part('rare-wheels').grip!, ...turbo('turbo-race'), ...kit('nitro-150') };
    const test = rig(config);
    let fastest = 0, lowest = 1;
    for (let frame = 0; frame < 900; frame++) {
      test.step({ ...boosted, steer: frame > 500 && frame < 620 ? .5 : 0, nitro: frame % 420 < 300 }, 1);
      const q = test.vehicle.body.rotation(), p = test.vehicle.body.translation();
      for (const value of [p.x, p.y, p.z, q.x, q.y, q.z, q.w, test.vehicle.speed]) expect(Number.isFinite(value)).toBe(true);
      lowest = Math.min(lowest, 1 - 2 * (q.x * q.x + q.z * q.z));
      fastest = Math.max(fastest, test.speed());
      expect(p.y).toBeGreaterThan(.2);
      expect(p.y).toBeLessThan(1.6);
    }
    console.log('strongest build', { fastestKmh: Math.round(fastest * 3.6), upright: lowest });
    expect(lowest).toBeGreaterThan(.85);
    // Quick, but still inside what the speedometer and the streets were built for.
    expect(fastest).toBeGreaterThan(30);
    expect(fastest).toBeLessThan(60);
    test.free();
  });

  it('forgets its boost when the car is recovered, and keeps what is left in the bottle', () => {
    const test = rig({ ...tuning(), ...turbo('turbo-street'), ...kit('nitro-75') });
    test.step(boosted, 90);
    const left = test.vehicle.charge;
    expect(test.vehicle.spool).toBeGreaterThan(.8);
    test.vehicle.recover();
    expect(test.vehicle.spool).toBe(0);
    expect(test.vehicle.nitro).toBe(false);
    expect(test.vehicle.charge).toBe(left);
    test.free();
  });
});
