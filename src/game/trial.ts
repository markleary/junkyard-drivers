import type { Point } from '../world/layout';

/** The marked test loop as a small state machine. Time is supplied by the caller, in seconds. */
export interface Trial {
  /** Next checkpoint to reach. */
  index: number;
  /** When the first checkpoint was crossed, or null before the lap begins. */
  startedAt: number | null;
  complete: boolean;
  /** Finished lap time. */
  elapsed: number;
  /** After a finished lap, set once the car is back inside the yard: the next pass through the gate starts a new lap. */
  armed: boolean;
}
export type TrialEvent = 'start' | 'checkpoint' | 'finish' | null;
export const CHECKPOINT_RADIUS = 12;

export function newTrial(): Trial {
  return { index: 0, startedAt: null, complete: false, elapsed: 0, armed: false };
}

export function runningTime(trial: Trial, now: number): number {
  return trial.complete ? trial.elapsed : trial.startedAt === null ? 0 : now - trial.startedAt;
}

/** Advance the lap for the car's current position. Mutates and returns the same object. */
export function advanceTrial(trial: Trial, loop: Point[], position: Point, now: number): TrialEvent {
  if (trial.complete) {
    // Pull back into the yard to line up for another attempt.
    if (!trial.armed && position.z < loop[0].z - 12) trial.armed = true;
    if (trial.armed && Math.hypot(position.x - loop[0].x, position.z - loop[0].z) < CHECKPOINT_RADIUS) {
      Object.assign(trial, { index: 1, startedAt: now, complete: false, elapsed: 0, armed: false });
      return 'start';
    }
    return null;
  }
  const target = loop[trial.index % loop.length];
  if (Math.hypot(position.x - target.x, position.z - target.z) >= CHECKPOINT_RADIUS) return null;
  const first = trial.startedAt === null;
  if (first) trial.startedAt = now;
  trial.index++;
  if (trial.index >= loop.length) {
    trial.complete = true;
    trial.elapsed = now - trial.startedAt!;
    return 'finish';
  }
  return first ? 'start' : 'checkpoint';
}
