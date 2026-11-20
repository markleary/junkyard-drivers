import { SHED_VAN, UNLOAD, type Pose } from '../world/orchard';

export const HITCH = 2.58, DRAWBAR = 4.1;
export const angleDelta = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

/** Local +Z points to the rear of both vehicles. */
export function behind(p: Pose, distance: number): Pose {
  return { x: p.x + Math.sin(p.yaw) * distance, z: p.z + Math.cos(p.yaw) * distance, yaw: p.yaw };
}

/** Constrain the axle to a constant drawbar length. It rolls along its own heading in either direction.
 * Limit articulation at the drawbar stops so a reversing player can pull straight again. */
export function tow(truck: Pose, previous?: Pose): Pose {
  const hitch = behind(truck, HITCH);
  const bearing = previous ? Math.atan2(previous.x - hitch.x, previous.z - hitch.z) : truck.yaw;
  const angle = Math.max(-1.08, Math.min(1.08, angleDelta(bearing - truck.yaw)));
  return behind({ ...hitch, yaw: truck.yaw + angle }, DRAWBAR);
}

export function alignment(axle: Pose, speed: number): string | null {
  const tail = behind(axle, 2.25), nose = behind(SHED_VAN, -2.2);
  const dx = nose.x - tail.x, dz = nose.z - tail.z;
  if (Math.abs(angleDelta(axle.yaw)) > .47 || Math.abs(dx) > 2.3) return 'Straighten the trailer in front of the van';
  if (dz > 4.7) return 'Back a little closer';
  if (dz < -.6) return 'Pull forward a little';
  return Math.abs(speed) > .6 ? 'Brake to a stop' : null;
}

/** Judge the cargo's axle against the painted apron. The cab can be inside the Garage while the load is in the bay. */
export function unloadingGuide(axle: Pose): string | null {
  if (Math.abs(axle.x - UNLOAD.x) > 2.9 || Math.abs(Math.sin(axle.yaw)) > .65) return 'Center the trailer between the yellow stripes';
  if (axle.z > UNLOAD.z + 11.2) return 'Pull ahead until the trailer is in the striped bay';
  if (axle.z < UNLOAD.z - 5.2) return 'Ease back to the striped bay';
  return null;
}
