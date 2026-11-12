import { describe, expect, it, vi } from 'vitest';
import { normalizeTouchStick, TouchControls } from '../src/ui/touch';

// These tests exercise pointer ownership/lifecycle without a DOM dependency.
// Native capture, multitouch delivery, and layout are covered by browser tests.
class Surface extends EventTarget {
  hidden = false;
  disabled = false;
  textContent = '';
  dataset: Record<string, string> = {};
  attributes = new Map<string, string>();
  properties = new Map<string, string>();
  captures = new Set<number>();
  children = new Map<string, Surface>();
  style = { setProperty: (name: string, value: string) => { this.properties.set(name, value); } };
  constructor(readonly ownerDocument: TestDocument) { super(); }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  querySelector<T>(selector: string) { return (this.children.get(selector) ?? null) as T | null; }
  getBoundingClientRect() { return { left: 30, top: 400, width: 160, height: 160 }; }
  setPointerCapture(id: number) { this.captures.add(id); }
  hasPointerCapture(id: number) { return this.captures.has(id); }
  releasePointerCapture(id: number) {
    this.captures.delete(id);
    pointer(this.ownerDocument, 'lostpointercapture', id);
  }
}
class TestDocument extends EventTarget { hidden = false; defaultView = new EventTarget(); }

function pointer(target: EventTarget, type: string, id: number, x = 110, y = 480, button = 0, pointerType = 'touch') {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { pointerId: id, clientX: x, clientY: y, button, pointerType, isPrimary: id === 1 });
  // Model document capture before the target listener without a DOM dependency.
  if (target instanceof Surface && type === 'pointerdown') target.ownerDocument.dispatchEvent(event);
  target.dispatchEvent(event);
  return event;
}

function click(target: EventTarget, detail = 1, pointerType?: string, pointerId?: number, x = 110, y = 480) {
  const event = new Event('click', { cancelable: true });
  Object.assign(event, { detail, pointerType, pointerId, clientX: x, clientY: y });
  if (target instanceof Surface) target.ownerDocument.dispatchEvent(event);
  if (!event.defaultPrevented) target.dispatchEvent(event);
  return event;
}

function rig(mode: 'foot' | 'drive' = 'foot') {
  const document = new TestDocument(), root = new Surface(document), canvas = new Surface(document);
  const ids = ['touch-stick', 'touch-stick-label', 'touch-interact', 'touch-action-label', 'touch-action-detail', 'touch-throttle', 'touch-brake', 'touch-handbrake', 'touch-nitro'];
  for (const id of ids) root.children.set(`#${id}`, new Surface(document));
  const element = (id: string) => root.children.get(`#touch-${id}`)!;
  const pause = new Surface(document), recover = new Surface(document);
  const onLook = vi.fn(), onInteract = vi.fn(), onPause = vi.fn(), onRecover = vi.fn();
  const controls = new TouchControls({
    root: root as unknown as HTMLElement, canvas: canvas as unknown as HTMLCanvasElement, onLook, onInteract,
    actions: [{ element: pause as unknown as HTMLButtonElement, onActivate: onPause }, { element: recover as unknown as HTMLButtonElement, onActivate: onRecover }],
  });
  controls.setContext({ enabled: true, paused: false, mode });
  return { document, root, canvas, element, onLook, onInteract, pause, recover, onPause, onRecover, controls };
}

describe('touch input', () => {
  it('keeps resting thumbs neutral and caps diagonal or off-pad movement to unit speed', () => {
    expect(normalizeTouchStick(.05, -.05)).toEqual({ x: 0, y: 0 });
    const diagonal = normalizeTouchStick(4, -4);
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(1);
    expect(diagonal.x).toBeCloseTo(-diagonal.y);
    expect(normalizeTouchStick(.56, 0).x).toBeCloseTo(.5);
    expect(normalizeTouchStick(Infinity, 0)).toEqual({ x: 0, y: 0 });
  });

  it('moves and looks with independent fingers, releasing only the cancelled gesture', () => {
    const r = rig();
    pointer(r.element('stick'), 'pointerdown', 1, 110, 416);
    pointer(r.canvas, 'pointerdown', 2, 800, 300);
    pointer(r.document, 'pointermove', 2, 840, 320);
    expect(r.controls.input.moveForward).toBeCloseTo(1);
    expect(r.onLook).toHaveBeenCalledWith(40, 20);
    pointer(r.document, 'pointercancel', 2);
    pointer(r.document, 'pointermove', 2, 920, 400);
    expect(r.onLook).toHaveBeenCalledTimes(1);
    expect(r.controls.input.moveForward).toBeCloseTo(1);
    pointer(r.document, 'pointermove', 1, 174, 480);
    expect(r.controls.input.moveX).toBeCloseTo(1);
    expect(r.controls.input.moveForward).toBe(0);
    pointer(r.document, 'pointerup', 1);
    expect(r.controls.input.moveX).toBe(0);
    expect(r.element('stick').properties.get('--stick-x')).toBe('0px');
    r.controls.dispose();
  });

  it('steers while holding pedals, ignoring vertical stick motion and independent releases', () => {
    const r = rig('drive');
    pointer(r.element('throttle'), 'pointerdown', 1);
    pointer(r.element('stick'), 'pointerdown', 2, 46, 480);
    pointer(r.element('handbrake'), 'pointerdown', 3);
    expect(r.controls.input).toMatchObject({ throttle: 1, steer: 1, handbrake: true, moveX: 0, moveForward: 0 });
    pointer(r.document, 'pointermove', 2, 110, 300);
    expect(r.controls.input.steer).toBe(0);
    pointer(r.document, 'pointercancel', 3);
    expect(r.controls.input.handbrake).toBe(false);
    expect(r.controls.input.throttle).toBe(1);
    pointer(r.document, 'lostpointercapture', 1);
    expect(r.controls.input.throttle).toBe(0);
    r.controls.dispose();
  });

  it('holds the nitrous with its own finger, and lets go of it when the kit comes off the car', () => {
    const r = rig('drive'), button = r.element('nitro');
    // As in the page: the button is there, hidden, until a car with a kit is driven.
    button.hidden = true;
    r.controls.setNitro(true);
    expect(button.hidden).toBe(false);
    expect(r.root.dataset.nitro).toBe('true');
    pointer(r.element('throttle'), 'pointerdown', 1);
    pointer(button, 'pointerdown', 2);
    expect(r.controls.input).toMatchObject({ throttle: 1, nitro: true, brake: 0, handbrake: false });
    expect(button.dataset.held).toBe('true');
    expect(button.attributes.get('aria-pressed')).toBe('true');
    // The two are separate fingers: lifting the pedal leaves the valve open.
    pointer(r.document, 'pointerup', 1);
    expect(r.controls.input).toMatchObject({ throttle: 0, nitro: true });
    r.controls.setNitro(false);
    expect(r.controls.input.nitro).toBe(false);
    expect(button.hidden).toBe(true);
    expect(button.dataset.held).toBe('false');
    expect(r.root.dataset.nitro).toBe('false');
    // Telling it twice changes nothing, and the finger that was on the button does not come back with it.
    r.controls.setNitro(false);
    r.controls.setNitro(true);
    expect(r.controls.input.nitro).toBe(false);
    pointer(button, 'pointerdown', 3);
    expect(r.controls.input.nitro).toBe(true);
    pointer(r.document, 'pointercancel', 3);
    expect(r.controls.input.nitro).toBe(false);
    r.controls.dispose();
  });

  it('retains a held pedal until every finger holding that pedal has ended', () => {
    const r = rig('drive');
    pointer(r.element('brake'), 'pointerdown', 4);
    pointer(r.element('brake'), 'pointerdown', 5);
    pointer(r.document, 'pointerup', 4);
    expect(r.controls.input.brake).toBe(1);
    expect(r.element('brake').dataset.held).toBe('true');
    pointer(r.document, 'pointercancel', 5);
    expect(r.controls.input.brake).toBe(0);
    expect(r.element('brake').dataset.held).toBe('false');
    r.controls.dispose();
  });

  it('keeps one owner for the thumbstick and does not transfer it to an already resting finger', () => {
    const r = rig();
    pointer(r.element('stick'), 'pointerdown', 1, 110, 416);
    pointer(r.element('stick'), 'pointerdown', 2, 110, 544);
    pointer(r.document, 'pointercancel', 2);
    expect(r.controls.input.moveForward).toBeCloseTo(1);
    pointer(r.document, 'pointerup', 1);
    pointer(r.document, 'pointermove', 2, 110, 544);
    expect(r.controls.input.moveForward).toBe(0);
    r.controls.dispose();
  });

  it('clears held controls when menus or modes change and requires a fresh gesture afterward', () => {
    const r = rig('drive');
    pointer(r.element('throttle'), 'pointerdown', 1);
    r.controls.setContext({ enabled: true, paused: false, mode: 'drive' });
    expect(r.controls.input.throttle).toBe(1); // Repeated frame context updates must not interrupt a gesture.
    r.controls.setContext({ enabled: true, paused: true, mode: 'drive' });
    expect(r.controls.input.throttle).toBe(0);
    expect(r.root.hidden).toBe(true);
    pointer(r.element('throttle'), 'pointerdown', 2);
    expect(r.controls.input.throttle).toBe(0);
    r.controls.setContext({ enabled: true, paused: false, mode: 'foot' });
    pointer(r.document, 'pointermove', 1, 40, 420);
    expect(r.controls.input.throttle).toBe(0);
    pointer(r.element('stick'), 'pointerdown', 3, 174, 480);
    expect(r.controls.input.moveX).toBeCloseTo(1);
    r.controls.setContext({ enabled: false, paused: false, mode: 'foot' });
    expect(r.controls.input.moveX).toBe(0);
    expect(r.root.hidden).toBe(true);
    r.controls.dispose();
  });

  it.each(['blur', 'resize', 'orientationchange', 'visibilitychange'])('releases fingers on %s without leaving capture or pressed feedback', type => {
    const r = rig('drive');
    pointer(r.element('throttle'), 'pointerdown', 1);
    pointer(r.element('stick'), 'pointerdown', 2, 46, 480);
    if (type === 'visibilitychange') { r.document.hidden = true; r.document.dispatchEvent(new Event(type)); }
    else r.document.defaultView.dispatchEvent(new Event(type));
    expect(r.controls.input).toEqual({ moveX: 0, moveForward: 0, steer: 0, throttle: 0, brake: 0, handbrake: false, nitro: false });
    expect(r.element('throttle').captures.size).toBe(0);
    expect(r.element('stick').captures.size).toBe(0);
    expect(r.element('throttle').dataset.held).toBe('false');
    r.controls.dispose();
  });

  it('activates contextual interaction once per click and blocks it while unavailable or paused', () => {
    const r = rig();
    const action = r.element('interact');
    r.controls.setAction({ label: 'Inspect', detail: 'Hachiro Kestrel', enabled: true });
    pointer(action, 'pointerdown', 1);
    expect(r.onInteract).not.toHaveBeenCalled();
    action.dispatchEvent(new Event('click', { cancelable: true }));
    expect(r.onInteract).toHaveBeenCalledTimes(1);
    expect(action.attributes.get('aria-label')).toBe('Inspect · Hachiro Kestrel');
    r.controls.setAction({ label: 'Interact', detail: 'Look towards an item', enabled: false });
    action.dispatchEvent(new Event('click'));
    r.controls.setContext({ enabled: true, paused: true, mode: 'foot' });
    r.controls.setAction({ label: 'Inspect', detail: 'Hachiro Kestrel', enabled: true });
    action.dispatchEvent(new Event('click'));
    expect(r.onInteract).toHaveBeenCalledTimes(1);
    r.controls.dispose();
  });

  it('removes listeners and leaves neutral input when disposed', () => {
    const r = rig('drive');
    pointer(r.element('throttle'), 'pointerdown', 1);
    r.controls.dispose(); r.controls.dispose();
    pointer(r.element('throttle'), 'pointerdown', 2);
    r.controls.setContext({ enabled: true, paused: false, mode: 'drive' });
    expect(r.controls.input.throttle).toBe(0);
    expect(r.root.hidden).toBe(true);
  });

  it('activates Pause with a secondary finger and suppresses its later click across the pause reset', () => {
    const r = rig();
    r.onPause.mockImplementation(() => r.controls.setContext({ enabled: true, paused: true, mode: 'foot' }));
    // Represents the existing delegated click callback reached after the adapter.
    const nativePause = vi.fn();
    r.pause.addEventListener('click', nativePause);
    pointer(r.element('stick'), 'pointerdown', 1, 110, 416);
    pointer(r.pause, 'pointerdown', 2);
    pointer(r.document, 'pointerup', 2);
    expect(r.onPause).toHaveBeenCalledTimes(1);
    expect(r.controls.input.moveForward).toBe(0);
    expect(click(r.pause, 1, 'touch', 2).defaultPrevented).toBe(true);
    expect(nativePause).not.toHaveBeenCalled();
    expect(r.onPause).toHaveBeenCalledTimes(1);
    r.controls.dispose();
  });

  it('activates contextual interaction without a compatibility click while another finger moves', () => {
    const r = rig();
    r.controls.setAction({ label: 'Inspect', detail: 'Kestrel', enabled: true });
    pointer(r.element('stick'), 'pointerdown', 1, 110, 416);
    pointer(r.element('interact'), 'pointerdown', 2);
    pointer(r.document, 'pointerup', 2);
    expect(r.onInteract).toHaveBeenCalledTimes(1);
    expect(r.controls.input.moveForward).toBe(1);
    click(r.element('interact'), 1, 'touch', 2);
    expect(r.onInteract).toHaveBeenCalledTimes(1);
    click(r.element('interact'), 0);
    expect(r.onInteract).toHaveBeenCalledTimes(2);
    r.controls.dispose();
  });

  it('recovers while steering and retains compatibility-click suppression through reset', () => {
    const r = rig('drive');
    r.onRecover.mockImplementation(() => r.controls.reset());
    const nativeRecover = vi.fn();
    r.recover.addEventListener('click', nativeRecover);
    pointer(r.element('stick'), 'pointerdown', 1, 46, 480);
    pointer(r.recover, 'pointerdown', 2);
    pointer(r.document, 'pointerup', 2);
    expect(r.onRecover).toHaveBeenCalledTimes(1);
    expect(r.controls.input.steer).toBe(0);
    pointer(r.document, 'pointermove', 1, 174, 480);
    expect(r.controls.input.steer).toBe(0);
    // Legacy Safari emits a MouseEvent without pointerType or pointerId.
    expect(click(r.recover).defaultPrevented).toBe(true);
    expect(nativeRecover).not.toHaveBeenCalled();
    r.controls.dispose();
  });

  it.each(['pointercancel', 'lostpointercapture', 'drag', 'outside', 'reset'])('does not activate a %s tap or its compatibility click', ending => {
    const r = rig();
    const nativePause = vi.fn();
    r.pause.addEventListener('click', nativePause);
    pointer(r.pause, 'pointerdown', 2, ending === 'outside' ? 35 : 110, 480);
    if (ending === 'drag') {
      pointer(r.document, 'pointermove', 2, 140, 480);
      pointer(r.document, 'pointermove', 2, 110, 480);
    }
    if (ending === 'reset') r.controls.reset();
    pointer(r.document, ending === 'pointercancel' || ending === 'lostpointercapture' ? ending : 'pointerup', 2, ending === 'outside' ? 25 : 110, 480);
    expect(r.onPause).not.toHaveBeenCalled();
    click(r.pause, 1, 'touch', 2);
    expect(nativePause).not.toHaveBeenCalled();
    r.controls.dispose();
  });

  it('keeps mouse and keyboard activation native, including immediately after a touch tap', () => {
    const r = rig();
    const nativePause = vi.fn();
    r.pause.addEventListener('click', nativePause);
    pointer(r.pause, 'pointerdown', 1);
    pointer(r.document, 'pointerup', 1);
    expect(r.onPause).toHaveBeenCalledTimes(1);
    click(r.pause, 0);
    expect(nativePause).toHaveBeenCalledTimes(1);
    pointer(r.pause, 'pointerdown', 2, 110, 480, 0, 'mouse');
    pointer(r.document, 'pointerup', 2, 110, 480, 0, 'mouse');
    expect(r.onPause).toHaveBeenCalledTimes(1);
    click(r.pause, 1, 'mouse', 2);
    expect(nativePause).toHaveBeenCalledTimes(2);
    r.controls.dispose();
  });

  it('accepts pen taps and expires suppression without blocking later legacy activation', () => {
    const r = rig();
    const nativePause = vi.fn();
    r.pause.addEventListener('click', nativePause);
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
    pointer(r.pause, 'pointerdown', 2, 110, 480, 0, 'pen');
    pointer(r.document, 'pointerup', 2, 110, 480, 0, 'pen');
    expect(r.onPause).toHaveBeenCalledTimes(1);
    now.mockReturnValue(1_751);
    expect(click(r.pause).defaultPrevented).toBe(false);
    expect(nativePause).toHaveBeenCalledTimes(1);
    now.mockRestore();
    r.controls.dispose();
  });

  it.each(['touch', 'legacy'])('blocks a retargeted %s click when interaction opens a panel under the pointer', type => {
    const r = rig();
    const closeButton = new Surface(r.document), closePanel = vi.fn();
    closeButton.addEventListener('click', closePanel);
    r.controls.setAction({ label: 'Open workbench', detail: 'Garage', enabled: true });
    r.onInteract.mockImplementation(() => r.controls.setContext({ enabled: true, paused: true, mode: 'foot' }));
    pointer(r.element('interact'), 'pointerdown', 1);
    pointer(r.document, 'pointerup', 1);
    expect(r.onInteract).toHaveBeenCalledTimes(1);
    const event = click(closeButton, 1, type === 'touch' ? 'touch' : undefined, type === 'touch' ? 1 : undefined);
    expect(event.defaultPrevented).toBe(true);
    expect(closePanel).not.toHaveBeenCalled();
    // A deliberate next tap on the new menu button still works.
    pointer(closeButton, 'pointerdown', 3);
    pointer(r.document, 'pointerup', 3);
    click(closeButton, 1, 'touch', 3);
    expect(closePanel).toHaveBeenCalledTimes(1);
    r.controls.dispose();
  });

  it('does not consume unrelated or subsequent menu clicks while a secondary tap awaits a missing compatibility click', () => {
    const r = rig();
    const menuButton = new Surface(r.document), activate = vi.fn();
    menuButton.addEventListener('click', activate);
    pointer(r.pause, 'pointerdown', 2);
    pointer(r.document, 'pointerup', 2);
    click(menuButton, 1, 'touch', 3);
    click(menuButton, 1, undefined, undefined, 400, 700);
    expect(activate).toHaveBeenCalledTimes(2);
    // No compatibility click came from the secondary tap. A fresh legacy
    // gesture at the same coordinates must not be mistaken for that old tap.
    pointer(menuButton, 'pointerdown', 4);
    pointer(r.document, 'pointerup', 4);
    click(menuButton);
    expect(activate).toHaveBeenCalledTimes(3);
    r.controls.dispose();
  });
});
