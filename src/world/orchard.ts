import type { Point } from './layout';

export type Pose = Point & { yaw: number };
export const SHED_VAN: Pose = { x: -76, z: 65, yaw: 0 };
export const STORE_RIG: Pose = { x: 12, z: 41, yaw: Math.PI / 2 };
export const SHED_RIG: Pose = { x: -76, z: 44, yaw: 0 };
export const LOADED_RIG: Pose = { x: -66, z: 44, yaw: -Math.PI / 2 };
export const UNLOAD = { x: -20, z: -2 };
export const ORCHARD_LANE = { id: 'orchard-lane', a: { x: -20, z: 44 }, b: { x: -76, z: 44 }, width: 10 };
export const inOrchard = (x: number, z: number) => x < -53 && x > -91 && z > 32 && z < 79;
export const inCourt = (x: number, z: number) => x < -56 && x > -90 && z > 33 && z < 60;
