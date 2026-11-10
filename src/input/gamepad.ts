/**
 * Standard-layout controller support. The pad is read once per frame and turned
 * into the same intents the keyboard produces; nothing here touches the game.
 */
export interface PadState {
  connected: boolean;
  moveX: number;
  moveY: number;
  lookX: number;
  lookY: number;
  /** Positive turns left, matching the vehicle model. */
  steer: number;
  throttle: number;
  brake: number;
  handbrake: boolean;
  lookBack: boolean;
  horn: boolean;
}
export type PadButton = 'interact' | 'recover' | 'camera' | 'lights' | 'pause' | 'back' | 'photo' | 'map';

const BUTTONS: Record<PadButton, number> = { interact: 2, recover: 3, camera: 5, lights: 12, pause: 9, back: 1, photo: 8, map: 13 };

/** Dead zone, then a curve that is gentle near the centre and full at the edge. */
export function stickCurve(value: number, dead = .14): number {
  const magnitude = Math.abs(value);
  if (!Number.isFinite(magnitude) || magnitude < dead) return 0;
  const scaled = Math.min(1, (magnitude - dead) / (1 - dead));
  return Math.sign(value) * (scaled * .6 + scaled * scaled * (3 - 2 * scaled) * .4);
}

const neutral = (): PadState => ({ connected: false, moveX: 0, moveY: 0, lookX: 0, lookY: 0, steer: 0, throttle: 0, brake: 0, handbrake: false, lookBack: false, horn: false });

export class GamepadInput {
  readonly state: PadState = neutral();
  private held = new Set<number>();
  private pressed = new Set<PadButton>();
  private index = -1;

  /** Read the pad. Buttons pressed since the last poll are available once from `take`. */
  poll(): PadState {
    this.pressed.clear();
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    let pad: Gamepad | null = this.index >= 0 ? pads[this.index] ?? null : null;
    if (!pad || !pad.connected) pad = Array.from(pads).find(candidate => candidate?.connected && candidate.mapping === 'standard') ?? null;
    const state = this.state;
    if (!pad) {
      if (state.connected) this.reset();
      this.index = -1;
      return state;
    }
    this.index = pad.index;
    state.connected = true;
    state.moveX = stickCurve(pad.axes[0] ?? 0); state.moveY = stickCurve(pad.axes[1] ?? 0);
    state.lookX = stickCurve(pad.axes[2] ?? 0); state.lookY = stickCurve(pad.axes[3] ?? 0);
    state.steer = -stickCurve(pad.axes[0] ?? 0, .08);
    state.throttle = pad.buttons[7]?.value ?? 0;
    state.brake = pad.buttons[6]?.value ?? 0;
    state.handbrake = !!pad.buttons[0]?.pressed;
    state.lookBack = !!pad.buttons[4]?.pressed;
    state.horn = !!pad.buttons[10]?.pressed;
    for (const [name, button] of Object.entries(BUTTONS) as [PadButton, number][]) {
      const down = !!pad.buttons[button]?.pressed;
      if (down && !this.held.has(button)) this.pressed.add(name);
      if (down) this.held.add(button); else this.held.delete(button);
    }
    return state;
  }

  /** True once for each fresh press. */
  take(button: PadButton) { return this.pressed.delete(button); }

  /** Short rumble for bumps and medals, where the hardware offers it. */
  rumble(milliseconds: number, strong: number, weak = strong * .5) {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const actuator = (this.index >= 0 ? pads[this.index] : null)?.vibrationActuator;
    if (!actuator) return;
    void actuator.playEffect('dual-rumble', { duration: milliseconds, strongMagnitude: strong, weakMagnitude: weak }).catch(() => undefined);
  }

  reset() {
    Object.assign(this.state, neutral());
    this.held.clear(); this.pressed.clear();
  }
}
