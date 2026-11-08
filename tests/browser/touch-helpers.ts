import { expect, type CDPSession, type Page } from '@playwright/test';
import { read } from './helpers';

const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
type Finger = { id: number; x: number; y: number; radiusX: number; radiusY: number; force: number };

/** Native browser input: start/move carry active fingers, end carries the released finger. */
export class TabletTouches {
  private points = new Map<number, Finger>();
  private stick?: { x: number; y: number; radius: number };
  private constructor(public page: Page, private cdp: CDPSession) {}
  static async create(page: Page) { return new TabletTouches(page, await page.context().newCDPSession(page)); }
  private async send(type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', points = [...this.points.values()]) {
    await this.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  }
  async down(id: number, x: number, y: number) {
    if (this.points.has(id)) return this.move(id, x, y);
    this.points.set(id, { id, x, y, radiusX: 6, radiusY: 6, force: 1 }); await this.send('touchStart');
  }
  async move(id: number, x: number, y: number) {
    const point = this.points.get(id); if (!point) throw new Error(`Finger ${id} is not down`);
    Object.assign(point, { x, y }); await this.send('touchMove');
  }
  async up(id: number) {
    const point = this.points.get(id);
    if (!point) return;
    this.points.delete(id);
    // Chromium dispatches pointerup for the IDs supplied in touchEnd. Sending
    // the remaining fingers instead would incorrectly release their controls.
    await this.send('touchEnd', [point]);
  }
  async release() { const active = this.points.size; this.points.clear(); this.stick = undefined; if (active) await this.send('touchEnd'); }
  async cancel() { const active = this.points.size; this.points.clear(); this.stick = undefined; if (active) await this.send('touchCancel'); }
  async center(selector: string) {
    const box = await this.page.locator(selector).first().boundingBox();
    if (!box) throw new Error(`Touch target missing: ${selector}`);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
  }
  async tap(selector: string, id = 9, scroll = true) {
    if (scroll) await this.page.locator(selector).first().scrollIntoViewIfNeeded();
    const { x, y } = await this.center(selector);
    await this.down(id, x, y); await this.up(id);
    await this.page.waitForTimeout(40);
  }
  async hold(selector: string, id: number, down: boolean) {
    if (!down) { await this.up(id); return; }
    if (!this.points.has(id)) { const { x, y } = await this.center(selector); await this.down(id, x, y); }
  }
  async joystick(x: number, y: number) {
    if (!this.points.has(1)) {
      const center = await this.center('#touch-stick');
      this.stick = { x: center.x, y: center.y, radius: Math.min(center.box.width, center.box.height) * .42 };
      await this.down(1, center.x, center.y);
    }
    await this.move(1, this.stick!.x + x * this.stick!.radius, this.stick!.y + y * this.stick!.radius);
  }
  async releaseStick() { await this.up(1); this.stick = undefined; }
  async look(yaw: number, pitch = 0) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const state = await read(this.page), yawDelta = wrap(yaw - state.yaw), pitchDelta = pitch - state.pitch;
      if (Math.abs(yawDelta) < .009 && Math.abs(pitchDelta) < .009) return;
      const viewport = this.page.viewportSize()!;
      const x = viewport.width * .63, y = viewport.height * .4;
      const dx = Math.max(-180, Math.min(180, -yawDelta / .0042));
      const dy = Math.max(-140, Math.min(140, -pitchDelta / .0042));
      await this.down(2, x, y); await this.move(2, x + dx, y + dy); await this.up(2);
      await this.page.waitForTimeout(18);
    }
    throw new Error(`Touch look did not reach yaw ${yaw}: ${JSON.stringify(await read(this.page))}`);
  }
  async swipe(selector: string, distance = -180) {
    const { x, y, box } = await this.center(selector);
    const start = Math.max(box.y + 20, Math.min(box.y + box.height - 20, y - distance / 2));
    await this.down(8, x, start);
    for (let step = 1; step <= 12; step++) {
      await this.move(8, x, start + distance * step / 12); await this.page.waitForTimeout(18);
    }
    await this.up(8); await this.page.waitForTimeout(220);
  }
}

export async function bootTablet(page: Page, startupScreenshot?: string) {
  await page.goto('./?qa=1');
  await expect(page.locator('#begin')).toBeEnabled();
  if (startupScreenshot) {
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: startupScreenshot });
  }
  const touch = await TabletTouches.create(page);
  await touch.tap('#begin');
  await expect.poll(async () => (await read(page)).paused).toBe(false);
  expect((await read(page)).touchEnabled).toBe(true);
  expect(await page.evaluate(() => document.pointerLockElement === null)).toBe(true);
  await expect(page.locator('#touch-controls')).toBeVisible();
  return touch;
}

export async function touchWalk(touch: TabletTouches, x: number, z: number, tolerance = .65) {
  const started = Date.now();
  while (Date.now() - started < 45000) {
    const state = await read(touch.page), dx = x - state.position.x, dz = z - state.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < tolerance) { await touch.releaseStick(); return; }
    const desired = Math.atan2(-dx, -dz);
    if (Math.abs(wrap(desired - state.yaw)) > .3) await touch.releaseStick();
    await touch.look(desired);
    await touch.joystick(0, distance > 2.5 ? -1 : -.5);
    await touch.page.waitForTimeout(90);
  }
  await touch.release(); throw new Error(`Tablet walk blocked toward ${x},${z}: ${JSON.stringify(await read(touch.page))}`);
}

export async function touchInspect(touch: TabletTouches, x: number, z: number, target: string) {
  const state = await read(touch.page);
  await touch.look(Math.atan2(-(x - state.position.x), -(z - state.position.z)), -.08);
  await expect.poll(async () => (await read(touch.page)).activeTarget).toBe(target);
  await expect(touch.page.locator('#touch-interact')).toBeEnabled();
  await touch.tap('#touch-interact', 9, false);
}

export async function closeTabletPanel(touch: TabletTouches) {
  await touch.tap('[data-action="close"]');
  await expect.poll(async () => (await read(touch.page)).paused).toBe(false);
}

export async function stopTablet(touch: TabletTouches) {
  await touch.release();
  await touch.hold('#touch-handbrake', 5, true);
  await expect.poll(async () => Math.abs((await read(touch.page)).speed), { timeout: 15000 }).toBeLessThan(.4);
  await touch.up(5);
}

export async function touchDrivePath(touch: TabletTouches, points: { x: number; z: number }[], screenshot?: string) {
  let index = 0, captured = false;
  const started = Date.now();
  while (index < points.length && Date.now() - started < 170000) {
    const state = await read(touch.page), target = points[index];
    const dx = target.x - state.position.x, dz = target.z - state.position.z, distance = Math.hypot(dx, dz);
    if (distance < 3.3) { index++; continue; }
    const r = state.rotation;
    const yaw = Math.atan2(2 * (r.w * r.y + r.x * r.z), 1 - 2 * (r.x * r.x + r.y * r.y));
    const error = wrap(Math.atan2(-dx, -dz) - yaw);
    const corner = distance < 20 && points.slice(index, index + 3).some((p, i, array) => i && Math.abs(wrap(Math.atan2(p.x - array[i - 1].x, p.z - array[i - 1].z) - Math.atan2(dx, dz))) > .25);
    const targetSpeed = Math.abs(error) > .4 || corner ? 5.8 : 12;
    const steer = Math.abs(error) < .035 ? 0 : Math.sign(error) * (.12 + .88 * Math.min(1, Math.abs(error) * 2.8));
    await touch.joystick(-steer, 0);
    await touch.hold('#touch-throttle', 3, state.speed < targetSpeed);
    await touch.hold('#touch-brake', 4, state.speed > targetSpeed + 1.1);
    if (screenshot && !captured && state.position.x > 45 && state.position.x < 110 && state.position.z < 52) {
      await touch.page.screenshot({ path: screenshot }); captured = true;
    }
    await touch.page.waitForTimeout(95);
  }
  await touch.release();
  if (index < points.length) throw new Error(`Tablet drive blocked at ${index}: ${JSON.stringify(await read(touch.page))}`);
}
