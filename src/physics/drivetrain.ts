/**
 * A gearbox for the dashboard and the engine note. The physics model drives the
 * wheels directly from engine power; this derives a believable gear and engine
 * speed from road speed, so the tachometer and the sound rise and fall as a
 * manual car's would.
 */
export type Gear = 'R' | 'N' | 1 | 2 | 3 | 4 | 5;

/** Road speed in metres per second at which each forward gear tops out, for a 150 hp car. */
const TOP = [7.5, 13.5, 20, 28, 46];

export class Drivetrain {
  gear: Gear = 'N';
  /** 0 at idle, 1 at the red line. */
  rpm = 0;
  /** True for the frame in which the gear changed. */
  shifted = false;
  private scale: number;
  private forward = 1;

  constructor(power: number) {
    // Stronger engines pull longer gears.
    this.scale = Math.min(1.5, Math.max(.82, Math.pow(power / 150, .3)));
  }

  /** speed is signed, in metres per second; throttle is 0..1. */
  update(speed: number, throttle: number, dt: number) {
    this.shifted = false;
    const previous = this.gear;
    let target: number;
    if (speed < -.4) {
      this.gear = 'R';
      target = Math.min(1, .12 + Math.abs(speed) / (TOP[0] * this.scale) * .8);
    } else if (Math.abs(speed) < .35 && throttle < .05) {
      this.gear = 'N';
      target = 0;
    } else {
      const v = Math.max(0, speed);
      // Change up near the red line, and down only once the lower gear would be comfortable.
      while (this.forward < 5 && v > TOP[this.forward - 1] * this.scale * .93) this.forward++;
      while (this.forward > 1 && v < TOP[this.forward - 2] * this.scale * .62) this.forward--;
      this.gear = this.forward as Gear;
      const low = this.forward === 1 ? 0 : TOP[this.forward - 2] * this.scale * .62, high = TOP[this.forward - 1] * this.scale;
      target = Math.min(1, Math.max(0, .16 + .84 * (v - low) / (high - low)));
      // Slip the clutch a little when pulling away, so first gear does not start from a dead idle.
      if (this.forward === 1) target = Math.max(target, throttle * .3);
    }
    this.shifted = previous !== this.gear && typeof previous === 'number' && typeof this.gear === 'number';
    // The needle falls faster than it climbs.
    const rate = target > this.rpm ? 5.5 : 8;
    this.rpm += (target - this.rpm) * Math.min(1, dt * rate);
  }
}
