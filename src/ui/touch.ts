export interface TouchInput {
  moveX: number;
  moveForward: number;
  /** Rapier's steering convention: positive turns left. */
  steer: number;
  throttle: number;
  brake: number;
  handbrake: boolean;
}

export interface TouchContext {
  enabled: boolean;
  paused: boolean;
  mode: 'foot' | 'drive';
}

interface TouchAction { label: string; detail: string; enabled: boolean }
interface TapAction { element: HTMLButtonElement; onActivate: () => void }
interface TouchOptions {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  onLook: (dx: number, dy: number) => void;
  onInteract: () => void;
  /** Existing HUD buttons keep their mouse/keyboard click handlers. */
  actions?: TapAction[];
}

type HeldRole = 'throttle' | 'brake' | 'handbrake';
type PointerRole = HeldRole | 'stick' | 'look' | 'tap';
interface TrackedPointer {
  role: PointerRole;
  capture: HTMLElement;
  x: number;
  y: number;
  centerX?: number;
  centerY?: number;
  radius?: number;
  action?: TapAction;
  cancelled?: boolean;
}

const neutral = (): TouchInput => ({ moveX: 0, moveForward: 0, steer: 0, throttle: 0, brake: 0, handbrake: false });

/** A circular dead zone keeps resting thumbs still, without accelerating diagonals. */
export function normalizeTouchStick(x: number, y: number): { x: number; y: number } {
  const length = Math.hypot(x, y);
  if (!Number.isFinite(length) || length <= .12) return { x: 0, y: 0 };
  const strength = Math.min(1, (length - .12) / .88);
  return { x: x / length * strength, y: y / length * strength };
}

/** DOM-only gesture adapter. Physics reads normalized input; this never moves game objects. */
export class TouchControls {
  private readonly state = neutral();
  get input(): Readonly<TouchInput> { return this.state; }

  private context: TouchContext = { enabled: false, paused: true, mode: 'foot' };
  private action: TouchAction = { label: 'Interact', detail: 'Look towards an item', enabled: false };
  private readonly pointers = new Map<number, TrackedPointer>();
  private readonly suppressedClicks = new Map<number, { until: number; x: number; y: number; legacy: boolean }>();
  private readonly cleanup: (() => void)[] = [];
  private readonly stick: HTMLElement;
  private readonly stickLabel: HTMLElement;
  private readonly actionButton: HTMLButtonElement;
  private readonly actionLabel: HTMLElement;
  private readonly actionDetail: HTMLElement;
  private readonly heldButtons: Record<HeldRole, HTMLButtonElement>;
  private stickPointer: number | undefined;
  private lookPointer: number | undefined;
  private disposed = false;

  constructor(private readonly options: TouchOptions) {
    const find = <T extends HTMLElement>(id: string) => {
      const element = options.root.querySelector<T>(`#${id}`);
      if (!element) throw new Error(`Touch control is missing: ${id}`);
      return element;
    };
    this.stick = find('touch-stick');
    this.stickLabel = find('touch-stick-label');
    this.actionButton = find<HTMLButtonElement>('touch-interact');
    this.actionLabel = find('touch-action-label');
    this.actionDetail = find('touch-action-detail');
    this.heldButtons = {
      throttle: find<HTMLButtonElement>('touch-throttle'),
      brake: find<HTMLButtonElement>('touch-brake'),
      handbrake: find<HTMLButtonElement>('touch-handbrake'),
    };

    this.listen(this.stick, 'pointerdown', event => this.begin(event as PointerEvent, 'stick', this.stick));
    this.listen(options.canvas, 'pointerdown', event => this.begin(event as PointerEvent, 'look', options.canvas));
    for (const role of ['throttle', 'brake', 'handbrake'] as const) {
      const button = this.heldButtons[role];
      this.listen(button, 'pointerdown', event => this.begin(event as PointerEvent, role, button));
      this.listen(button, 'click', event => { event.preventDefault(); event.stopPropagation(); });
    }

    // Captured pointers normally target their original surface. Document listeners
    // also cover browsers that deny capture, and fingers sliding beyond the pad.
    const document = options.root.ownerDocument;
    this.listen(document, 'pointerdown', event => {
      const pointer = event as PointerEvent;
      if (pointer.pointerType === 'mouse') this.suppressedClicks.clear();
      else this.suppressedClicks.delete(pointer.pointerId);
      // A new physical gesture must not inherit a previous gesture's legacy
      // click fallback. Modern pointer IDs still identify delayed clicks.
      for (const [id, click] of this.suppressedClicks) {
        if (Date.now() > click.until) this.suppressedClicks.delete(id);
        else click.legacy = false;
      }
    }, true);
    this.listen(document, 'click', event => this.suppressCompatibilityClick(event as PointerEvent), true);
    this.listen(document, 'pointermove', event => this.move(event as PointerEvent));
    this.listen(document, 'pointerup', event => this.end((event as PointerEvent).pointerId, event as PointerEvent));
    for (const type of ['pointercancel', 'lostpointercapture']) {
      this.listen(document, type, event => this.end((event as PointerEvent).pointerId));
    }
    this.registerTap({ element: this.actionButton, onActivate: options.onInteract });
    for (const action of options.actions ?? []) this.registerTap(action);
    this.listen(this.actionButton, 'click', event => {
      if (!this.active || this.actionButton.disabled) return;
      event.preventDefault(); event.stopPropagation();
      options.onInteract();
    });
    for (const surface of [options.root, options.canvas]) this.listen(surface, 'contextmenu', event => {
      if (this.active) event.preventDefault();
    });
    this.listen(document, 'visibilitychange', () => { if (document.hidden) this.reset(); });
    if (document.defaultView) {
      for (const type of ['blur', 'resize', 'orientationchange']) this.listen(document.defaultView, type, () => this.reset());
    }
    this.renderContext();
    this.reset();
  }

  private get active() { return !this.disposed && this.context.enabled && !this.context.paused; }

  private listen(target: EventTarget, type: string, listener: EventListener, capture = false) {
    target.addEventListener(type, listener, { passive: false, capture });
    this.cleanup.push(() => target.removeEventListener(type, listener, { capture }));
  }

  private registerTap(action: TapAction) {
    const button = action.element;
    this.listen(button, 'pointerdown', event => {
      const pointer = event as PointerEvent;
      if (pointer.pointerType !== 'touch' && pointer.pointerType !== 'pen') return;
      if (!this.active || button.disabled || button.hidden || pointer.button !== 0 || this.pointers.has(pointer.pointerId)) return;
      pointer.preventDefault();
      this.pointers.set(pointer.pointerId, { role: 'tap', capture: button, x: pointer.clientX, y: pointer.clientY, action });
      try { button.setPointerCapture(pointer.pointerId); } catch { /* Document listeners still handle release. */ }
    });
  }

  private suppressCompatibilityClick(event: PointerEvent) {
    if (event.detail === 0) return; // Keyboard/assistive activation remains native.
    for (const [id, click] of this.suppressedClicks) {
      if (Date.now() > click.until) { this.suppressedClicks.delete(id); continue; }
      const identifiedTouch = event.pointerType === 'touch' || event.pointerType === 'pen';
      const matches = identifiedTouch ? event.pointerId === id
        : click.legacy && Math.hypot(event.clientX - click.x, event.clientY - click.y) <= 24;
      if (!matches) continue;
      this.suppressedClicks.delete(id);
      // Opening a panel on pointerup can retarget click to a newly visible
      // button. Capture at document level before that replacement sees it.
      event.preventDefault(); event.stopImmediatePropagation();
      return;
    }
  }

  setContext(context: TouchContext) {
    if (this.disposed) return;
    if (context.enabled !== this.context.enabled || context.paused !== this.context.paused || context.mode !== this.context.mode) this.reset();
    this.context = { ...context };
    this.renderContext();
  }

  setAction(action: TouchAction) {
    if (this.disposed) return;
    this.action = { ...action };
    if (this.actionLabel.textContent !== action.label) this.actionLabel.textContent = action.label;
    if (this.actionDetail.textContent !== action.detail) this.actionDetail.textContent = action.detail;
    this.actionButton.setAttribute('aria-label', [action.label, action.detail].filter(Boolean).join(' · '));
    this.actionButton.disabled = !this.active || !action.enabled;
  }

  private renderContext() {
    this.options.root.hidden = !this.active;
    this.options.root.setAttribute('aria-hidden', String(!this.active));
    this.options.root.dataset.mode = this.context.mode;
    this.stickLabel.textContent = this.context.mode === 'foot' ? 'MOVE' : 'STEER';
    this.stick.setAttribute('aria-label', this.context.mode === 'foot' ? 'Movement thumbstick' : 'Steering thumbstick');
    for (const button of Object.values(this.heldButtons)) button.disabled = !this.active || this.context.mode !== 'drive';
    this.setAction(this.action);
  }

  private begin(event: PointerEvent, role: Exclude<PointerRole, 'tap'>, capture: HTMLElement) {
    if (!this.active || event.button !== 0 || this.pointers.has(event.pointerId)) return;
    if (role === 'look' && this.context.mode !== 'foot') return;
    if (role !== 'stick' && role !== 'look' && this.context.mode !== 'drive') return;
    event.preventDefault();
    if ((role === 'stick' && this.stickPointer !== undefined) || (role === 'look' && this.lookPointer !== undefined)) return;

    const pointer: TrackedPointer = { role, capture, x: event.clientX, y: event.clientY };
    if (role === 'stick') {
      const bounds = this.stick.getBoundingClientRect();
      pointer.centerX = bounds.left + bounds.width / 2;
      pointer.centerY = bounds.top + bounds.height / 2;
      pointer.radius = Math.max(1, Math.min(bounds.width, bounds.height) * .4);
      this.stickPointer = event.pointerId;
    } else if (role === 'look') this.lookPointer = event.pointerId;
    this.pointers.set(event.pointerId, pointer);
    try { capture.setPointerCapture(event.pointerId); } catch { /* Document listeners retain cancellation/release handling. */ }
    if (role === 'stick') this.updateStick(pointer, event.clientX, event.clientY);
    this.updateHeld();
  }

  private move(event: PointerEvent) {
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer || !this.active) return;
    event.preventDefault();
    if (pointer.role === 'stick') this.updateStick(pointer, event.clientX, event.clientY);
    else if (pointer.role === 'look') {
      const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
      pointer.x = event.clientX; pointer.y = event.clientY;
      if (Number.isFinite(dx) && Number.isFinite(dy)) this.options.onLook(dx, dy);
    } else if (pointer.role === 'tap' && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 16) pointer.cancelled = true;
  }

  private updateStick(pointer: TrackedPointer, clientX: number, clientY: number) {
    const radius = pointer.radius!;
    const rawX = (clientX - pointer.centerX!) / radius;
    const rawY = this.context.mode === 'foot' ? (clientY - pointer.centerY!) / radius : 0;
    const axes = normalizeTouchStick(rawX, rawY);
    this.state.moveX = this.context.mode === 'foot' ? axes.x : 0;
    this.state.moveForward = this.context.mode === 'foot' ? (-axes.y || 0) : 0;
    this.state.steer = this.context.mode === 'drive' ? (-axes.x || 0) : 0;
    const length = Math.max(1, Math.hypot(rawX, rawY));
    this.stick.style.setProperty('--stick-x', `${rawX / length * radius}px`);
    this.stick.style.setProperty('--stick-y', `${rawY / length * radius}px`);
  }

  private end(pointerId: number, event?: PointerEvent) {
    const pointer = this.pointers.get(pointerId);
    if (!pointer) return;
    this.pointers.delete(pointerId);
    if (pointer.role === 'stick') {
      this.stickPointer = undefined;
      this.state.moveX = this.state.moveForward = this.state.steer = 0;
      this.centerKnob();
    } else if (pointer.role === 'look') this.lookPointer = undefined;
    this.release(pointerId, pointer.capture);
    this.updateHeld();
    if (pointer.action) this.suppressNextClick(pointerId, pointer, event);
    if (pointer.role === 'tap' && pointer.action && event && this.active && !pointer.cancelled) {
      const button = pointer.action.element, bounds = button.getBoundingClientRect();
      if (button.disabled || button.hidden || Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 16) return;
      if (event.clientX < bounds.left || event.clientX > bounds.left + bounds.width || event.clientY < bounds.top || event.clientY > bounds.top + bounds.height) return;
      event.preventDefault();
      // Secondary touch pointers do not produce click. Activate directly, then
      // swallow a primary pointer's compatibility click even if the callback
      // immediately pauses, opens a panel, or resets the gesture state.
      pointer.action.onActivate();
    }
  }

  private suppressNextClick(pointerId: number, pointer: TrackedPointer, event?: PointerEvent) {
    this.suppressedClicks.set(pointerId, { until: Date.now() + 750, x: event?.clientX ?? pointer.x, y: event?.clientY ?? pointer.y, legacy: true });
  }

  private release(pointerId: number, capture: HTMLElement) {
    try { if (capture.hasPointerCapture(pointerId)) capture.releasePointerCapture(pointerId); } catch { /* Already cancelled by the browser. */ }
  }

  private centerKnob() {
    this.stick.style.setProperty('--stick-x', '0px');
    this.stick.style.setProperty('--stick-y', '0px');
  }

  private updateHeld() {
    const roles = new Set([...this.pointers.values()].map(pointer => pointer.role));
    this.state.throttle = roles.has('throttle') ? 1 : 0;
    this.state.brake = roles.has('brake') ? 1 : 0;
    this.state.handbrake = roles.has('handbrake');
    this.stick.dataset.held = String(roles.has('stick'));
    for (const role of ['throttle', 'brake', 'handbrake'] as const) {
      this.heldButtons[role].dataset.held = String(roles.has(role));
      this.heldButtons[role].setAttribute('aria-pressed', String(roles.has(role)));
    }
  }

  reset() {
    const pointers = [...this.pointers.entries()];
    for (const [id, pointer] of pointers) if (pointer.action) this.suppressNextClick(id, pointer);
    this.pointers.clear(); this.stickPointer = this.lookPointer = undefined;
    Object.assign(this.state, neutral());
    this.centerKnob(); this.updateHeld();
    // Clear ownership first: releasing capture may synchronously emit lostcapture.
    pointers.forEach(([id, pointer]) => this.release(id, pointer.capture));
  }

  dispose() {
    if (this.disposed) return;
    this.reset(); this.disposed = true;
    this.suppressedClicks.clear();
    this.cleanup.forEach(remove => remove()); this.cleanup.length = 0;
    this.options.root.hidden = true; this.options.root.setAttribute('aria-hidden', 'true');
    this.actionButton.disabled = true;
  }
}
