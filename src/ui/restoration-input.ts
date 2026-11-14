/** A short, interruptible tool action shared by pointer, touch, keyboard and controller. */
export class RestorationInput {
  private pointer: number | null = null;
  private buttonHeld = false;
  private keyHeld = false;
  private strokeUntil = 0;
  private lastPoint: { x: number; y: number } | null = null;
  private blocked = false;
  private engaged = false;
  point: { x: number; y: number } | null = null;

  constructor(private root: HTMLElement, private active: () => boolean,
    private hitsBody: (x: number, y: number) => boolean, private released: () => void) {
    root.addEventListener('pointerdown', event => {
      if (!active() || event.button !== 0 || this.pointer !== null) return;
      const target = event.target as HTMLElement;
      const button = target.closest<HTMLButtonElement>('#restoration-work');
      if (!button && target.id !== 'restoration-preview') return;
      if (button?.disabled) return;
      event.preventDefault();
      this.pointer = event.pointerId; this.buttonHeld = !!button;
      this.lastPoint = { x: event.clientX, y: event.clientY };
      this.point = button ? null : this.lastPoint;
      target.setPointerCapture(event.pointerId);
      button?.focus({ preventScroll: true });
    });
    root.addEventListener('pointermove', event => {
      if (event.pointerId !== this.pointer || this.buttonHeld || !active()) return;
      const point = { x: event.clientX, y: event.clientY };
      if (this.lastPoint && Math.hypot(point.x - this.lastPoint.x, point.y - this.lastPoint.y) > 1 && hitsBody(point.x, point.y)) {
        this.strokeUntil = performance.now() + 100;
      } else this.strokeUntil = 0;
      this.lastPoint = this.point = point;
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) root.addEventListener(type, event => {
      if ((event as PointerEvent).pointerId === this.pointer) this.clear();
    });
    root.addEventListener('keydown', event => {
      if (!active() || !['Space', 'Enter'].includes(event.code) || (event.target as HTMLElement).id !== 'restoration-work') return;
      event.preventDefault();
      if (!event.repeat) this.keyHeld = true;
    });
    window.addEventListener('keyup', event => {
      if (['Space', 'Enter'].includes(event.code) && this.keyHeld) { event.preventDefault(); this.clear(); }
    });
    root.addEventListener('focusout', () => { if (this.keyHeld) this.clear(); });
  }

  /** A stage always needs a fresh press; keeping A down cannot skip the next choice. */
  finishStage() { this.clear(); this.blocked = true; }
  clear() {
    const wasWorking = this.pointer !== null || this.keyHeld || this.engaged;
    this.pointer = null; this.buttonHeld = this.keyHeld = false;
    this.strokeUntil = 0; this.lastPoint = this.point = null;
    this.blocked = true;
    this.engaged = false;
    if (wasWorking) this.released();
  }
  working(padHeld: boolean) {
    const held = this.buttonHeld || this.keyHeld || this.strokeUntil > performance.now() || padHeld;
    if (!held) this.blocked = false;
    const working = this.active() && !this.blocked && held;
    if (this.engaged && !working) this.released();
    this.engaged = working;
    return working;
  }
}
