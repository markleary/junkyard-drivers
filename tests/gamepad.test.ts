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
});
