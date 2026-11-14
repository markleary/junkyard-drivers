import { afterEach, describe, expect, it, vi } from 'vitest';
import { RestorationInput } from '../src/ui/restoration-input';

// Native pointer capture and delegated DOM events are covered by browser tests.
// These events isolate release/repress timing between animation frames.
class Surface extends EventTarget {
  disabled = false;
  constructor(readonly id = 'restoration-work') { super(); }
  closest() { return this.id === 'restoration-work' ? this : null; }
  setPointerCapture() {}
  focus() {}
}

function event(target: EventTarget, type: string, values: Record<string, unknown>) {
  const input = new Event(type, { cancelable: true });
  Object.assign(input, values);
  target.dispatchEvent(input);
}

function rig(preview = false) {
  const root = new Surface(preview ? 'restoration-preview' : 'restoration-work'), window = new EventTarget();
  vi.stubGlobal('window', window);
  const released = vi.fn();
  const input = new RestorationInput(root as unknown as HTMLElement, () => true, () => true, released);
  const key = (type: string, code = 'Space', repeat = false) => event(type === 'keyup' ? window : root, type, { code, repeat });
  const pointer = (type: string, x = 10) => event(root, type, { pointerId: 1, button: 0, clientX: x, clientY: 10 });
  const press = () => { pointer('pointerdown'); if (preview) pointer('pointermove', 20); };
  return { input, released, key, pointer, press };
}

afterEach(() => vi.unstubAllGlobals());

describe('restoration tool input', () => {
  it.each(['Space', 'Enter'])('resumes a %s hold released and pressed again between frames', code => {
    const { input, released, key } = rig();
    key('keydown', code);
    expect(input.working(false)).toBe(true);
    key('keyup', code);
    key('keydown', code);
    expect(input.working(false)).toBe(true);
    expect(released).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])('resumes a pointer gesture between frames (preview=%s)', preview => {
    const { input, released, pointer, press } = rig(preview);
    press();
    expect(input.working(false)).toBe(true);
    pointer('pointerup');
    press();
    expect(input.working(false)).toBe(true);
    expect(released).toHaveBeenCalledTimes(1);
  });

  it('ignores keyboard repeats after a stage ends but accepts the next deliberate press immediately', () => {
    const { input, key } = rig();
    key('keydown');
    expect(input.working(false)).toBe(true);
    input.finishStage();
    key('keydown', 'Space', true);
    expect(input.working(false)).toBe(false);
    key('keydown', 'Space', true);
    expect(input.working(false)).toBe(false);
    key('keyup');
    key('keydown');
    expect(input.working(false)).toBe(true);
  });

  it('ignores the old drag after a stage ends until a new pointer press', () => {
    const { input, pointer, press } = rig(true);
    press();
    expect(input.working(false)).toBe(true);
    input.finishStage();
    pointer('pointermove', 40);
    expect(input.working(false)).toBe(false);
    pointer('pointerup');
    press();
    expect(input.working(false)).toBe(true);
  });

  it.each(['finishStage', 'clear'] as const)('keeps a controller hold blocked after %s until its release is observed', reset => {
    const { input, released } = rig();
    expect(input.working(true)).toBe(true);
    input[reset]();
    expect(input.working(true)).toBe(false);
    expect(input.working(true)).toBe(false);
    expect(released).toHaveBeenCalledTimes(1);
    expect(input.working(false)).toBe(false);
    expect(input.working(true)).toBe(true);
  });
});
