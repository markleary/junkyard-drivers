import { afterEach, describe, expect, it, vi } from 'vitest';
import { GamepadInput } from '../src/input/gamepad';

function rig() {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
  const controller = { connected: true, index: 0, mapping: 'standard', axes: [0, 0, 0, 0], buttons };
  vi.stubGlobal('navigator', { getGamepads: () => [controller] });
  return { input: new GamepadInput(), controller, buttons };
}

afterEach(() => vi.unstubAllGlobals());

describe('controller button edges', () => {
  it.each(['pressed', 'value'] as const)('recognizes an X press through %s once until release', signal => {
    const { input, buttons } = rig();
    input.poll();
    if (signal === 'pressed') buttons[2].pressed = true;
    else buttons[2].value = 1;
    input.poll();
    expect(input.take('interact')).toBe(true);
    expect(input.take('interact')).toBe(false);
    input.poll();
    expect(input.take('interact')).toBe(false);
    buttons[2].pressed = false; buttons[2].value = 0;
    input.poll();
    if (signal === 'pressed') buttons[2].pressed = true;
    else buttons[2].value = 1;
    input.poll();
    expect(input.take('interact')).toBe(true);
  });

  it('ignores analog button noise and gives held controls the same threshold as actions', () => {
    const { input, buttons } = rig();
    buttons[2].value = .1;
    input.poll();
    expect(input.take('interact')).toBe(false);
    for (const index of [0, 1, 4, 10]) buttons[index].value = 1;
    input.poll();
    expect(input.state).toMatchObject({ handbrake: true, nitro: true, lookBack: true, horn: true });
    expect(input.take('confirm')).toBe(true);
    expect(input.take('back')).toBe(true);
    for (const index of [0, 1, 4, 10]) buttons[index].value = 0;
    input.poll();
    expect(input.state).toMatchObject({ handbrake: false, nitro: false, lookBack: false, horn: false });
  });

  it.each(['pressed', 'value'] as const)('swaps physical X/Y slots using %s without changing other controls', signal => {
    const { input, buttons } = rig();
    const down = (index: number, active: boolean) => {
      buttons[index].pressed = signal === 'pressed' && active;
      buttons[index].value = signal === 'value' && active ? 1 : 0;
    };
    input.poll(true);
    down(3, true);
    input.poll(true);
    expect(input.take('interact')).toBe(true);
    expect(input.take('recover')).toBe(false);
    input.poll(true);
    expect(input.take('interact')).toBe(false);
    down(3, false); down(2, true); down(0, true); down(1, true);
    input.poll(true);
    expect(input.take('recover')).toBe(true);
    expect(input.take('interact')).toBe(false);
    expect(input.take('confirm')).toBe(true);
    expect(input.take('back')).toBe(true);
    expect(input.state).toMatchObject({ handbrake: true, nitro: true });
  });

  it('clears held steering, pedals and winch until each control is released', () => {
    const { input, buttons, controller } = rig();
    controller.axes[0] = 1; buttons[7].value = .8; buttons[0].pressed = true;
    input.poll(); input.clearHeld();
    expect(input.poll()).toMatchObject({ steer: 0, throttle: 0, handbrake: false });
    buttons[7].value = 0; input.poll(); buttons[7].value = .6;
    expect(input.poll()).toMatchObject({ steer: 0, throttle: .6, handbrake: false });
    controller.axes[0] = 0; buttons[0].pressed = false; input.poll();
    buttons[0].pressed = true;
    expect(input.poll().handbrake).toBe(true);
    expect(input.take('confirm')).toBe(true);
  });

  it('requires release before a held physical button can invoke its newly mapped action', () => {
    const { input, buttons } = rig();
    buttons[2].pressed = true;
    input.poll();
    expect(input.take('interact')).toBe(true);
    input.poll(true);
    expect(input.take('recover')).toBe(false);
    input.poll();
    expect(input.take('interact')).toBe(false);
    buttons[2].pressed = false;
    input.poll(true);
    buttons[2].pressed = true;
    input.poll(true);
    expect(input.take('recover')).toBe(true);
  });
});
