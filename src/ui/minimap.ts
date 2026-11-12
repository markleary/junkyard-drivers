import { AUTO_PARTS_STORE, GARAGE, YARD_BOUNDS, type Point, type TownLayout } from '../world/layout';
import { dealerSite } from '../world/dealer';

/** World rectangle covered by the printed map, a little beyond the barriers. */
const WORLD = { minX: -100, maxX: 208, minZ: -70, maxZ: 216 };
const SCALE = 3; // Pixels per metre in the pre-drawn sheet.

export interface MinimapView {
  x: number;
  z: number;
  /** Heading in radians, as the walking camera's yaw: forward is (-sin, -cos). */
  heading: number;
  /** Metres from the centre to the edge of the dial. */
  range: number;
  /** Next checkpoint or destination, if any. */
  target?: Point | null;
  driving: boolean;
}

/**
 * A pocket survey map of the yard and town: drawn once in the workshop's paper
 * and ink, then turned under a fixed arrow so that ahead is always up.
 */
export class Minimap {
  private sheet: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private size = 0;
  /** Lettered places: the Garage, the parts store, and the dealer who pays for finished cars. */
  private places: [string, number, number][];

  constructor(private canvas: HTMLCanvasElement, layout: TownLayout) {
    const dealer = dealerSite(layout);
    this.places = [['G', GARAGE.x, -15], ['P', AUTO_PARTS_STORE.x, AUTO_PARTS_STORE.z], ...(dealer ? [['$', dealer.lot.x, dealer.lot.z] as [string, number, number]] : [])];
    this.context = canvas.getContext('2d')!;
    this.sheet = document.createElement('canvas');
    this.sheet.width = (WORLD.maxX - WORLD.minX) * SCALE;
    this.sheet.height = (WORLD.maxZ - WORLD.minZ) * SCALE;
    this.paint(layout);
  }

  private paint(layout: TownLayout) {
    const c = this.sheet.getContext('2d')!;
    const px = (x: number) => (x - WORLD.minX) * SCALE, pz = (z: number) => (z - WORLD.minZ) * SCALE;
    const rect = (x: number, z: number, w: number, d: number) => c.fillRect(px(x - w / 2), pz(z - d / 2), w * SCALE, d * SCALE);
    c.fillStyle = '#d9d2b4'; c.fillRect(0, 0, this.sheet.width, this.sheet.height);
    // Meadow hatch, so open ground is not a blank sheet.
    c.strokeStyle = 'rgba(96,110,70,.16)'; c.lineWidth = 1;
    for (let i = -this.sheet.height; i < this.sheet.width; i += 14) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + this.sheet.height, this.sheet.height); c.stroke(); }
    // Salvage yard.
    c.fillStyle = '#c9b996';
    c.fillRect(px(YARD_BOUNDS.minX), pz(YARD_BOUNDS.minZ), (YARD_BOUNDS.maxX - YARD_BOUNDS.minX) * SCALE, (YARD_BOUNDS.maxZ - YARD_BOUNDS.minZ) * SCALE);
    c.strokeStyle = '#5e5a4c'; c.lineWidth = 2.5; c.setLineDash([7, 4]);
    c.strokeRect(px(YARD_BOUNDS.minX), pz(YARD_BOUNDS.minZ), (YARD_BOUNDS.maxX - YARD_BOUNDS.minX) * SCALE, (YARD_BOUNDS.maxZ - YARD_BOUNDS.minZ) * SCALE);
    c.setLineDash([]);
    for (const lot of layout.lots) {
      c.fillStyle = lot.kind === 'park' ? '#b4c392' : '#c8bea2';
      rect(lot.x, lot.z, lot.w, lot.d);
      c.strokeStyle = 'rgba(40,48,46,.5)'; c.lineWidth = 1.5;
      c.strokeRect(px(lot.x - lot.w / 2), pz(lot.z - lot.d / 2), lot.w * SCALE, lot.d * SCALE);
    }
    // Streets: a dark casing with a pale centre line.
    c.lineCap = 'round';
    for (const road of layout.roads) {
      c.strokeStyle = '#343c3c'; c.lineWidth = road.width * SCALE;
      c.beginPath(); c.moveTo(px(road.a.x), pz(road.a.z)); c.lineTo(px(road.b.x), pz(road.b.z)); c.stroke();
    }
    for (const road of layout.roads) {
      c.strokeStyle = 'rgba(232,223,196,.55)'; c.lineWidth = 1.6; c.setLineDash([10, 9]);
      c.beginPath(); c.moveTo(px(road.a.x), pz(road.a.z)); c.lineTo(px(road.b.x), pz(road.b.z)); c.stroke();
    }
    c.setLineDash([]);
    c.fillStyle = '#8f8873';
    for (const building of layout.buildings) rect(building.x, building.z, building.w, building.d);
    c.strokeStyle = '#4d4a3e'; c.lineWidth = 1.5;
    for (const building of layout.buildings) c.strokeRect(px(building.x - building.w / 2), pz(building.z - building.d / 2), building.w * SCALE, building.d * SCALE);
    // Workshop in yard red, parts store in counter blue.
    c.fillStyle = '#a63e2e'; rect(GARAGE.x, -15, 18, 18);
    c.fillStyle = '#24566a'; rect(AUTO_PARTS_STORE.x, AUTO_PARTS_STORE.z, AUTO_PARTS_STORE.w, AUTO_PARTS_STORE.d);
    // The used-car lot in banknote green, so the place to sell stands out from the other lots.
    const dealer = dealerSite(layout);
    if (dealer) { c.fillStyle = '#4e7a5c'; rect(dealer.lot.x, dealer.lot.z, dealer.lot.w, dealer.lot.d); }
    c.fillStyle = '#7e8f92';
    c.beginPath(); c.arc(px(layout.landmark.x), pz(layout.landmark.z), 6 * SCALE, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#3b4a4c'; c.lineWidth = 2; c.stroke();
  }

  /** Match the canvas backing store to its CSS box. Call on resize. */
  resize() {
    const box = this.canvas.getBoundingClientRect();
    const size = Math.round(Math.max(1, box.width) * Math.min(2, devicePixelRatio || 1));
    if (size !== this.size) { this.size = size; this.canvas.width = this.canvas.height = size; }
  }

  draw(view: MinimapView) {
    if (!this.size) this.resize();
    const c = this.context, size = this.size, half = size / 2;
    const zoom = half / (view.range * SCALE);
    c.clearRect(0, 0, size, size);
    c.save();
    c.beginPath(); c.arc(half, half, half - 1, 0, Math.PI * 2); c.clip();
    c.fillStyle = '#cfc7a8'; c.fillRect(0, 0, size, size);
    c.translate(half, half); c.rotate(view.heading); c.scale(zoom, zoom);
    c.translate(-(view.x - WORLD.minX) * SCALE, -(view.z - WORLD.minZ) * SCALE);
    c.imageSmoothingEnabled = true;
    c.drawImage(this.sheet, 0, 0);
    c.restore();

    // Letters for the places a player returns to. They are placed on the turned sheet but drawn
    // upright, so a P never reads as a d when the map swings round.
    const cosine = Math.cos(view.heading), sine = Math.sin(view.heading);
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `800 ${Math.round(size * .14)}px "Barlow Condensed", Impact, sans-serif`;
    c.lineJoin = 'round'; c.lineWidth = size * .028; c.strokeStyle = 'rgba(32,41,44,.55)'; c.fillStyle = '#f3ead2';
    for (const [letter, x, z] of this.places) {
      const dx = x - view.x, dz = z - view.z;
      const lx = (dx * cosine - dz * sine) / view.range * half, ly = (dx * sine + dz * cosine) / view.range * half;
      if (Math.hypot(lx, ly) > half - size * .1) continue;
      c.strokeText(letter, half + lx, half + ly + size * .008);
      c.fillText(letter, half + lx, half + ly + size * .008);
    }

    if (view.target) {
      // Rotate the target into view space; pin it to the rim when it is off the dial.
      const dx = view.target.x - view.x, dz = view.target.z - view.z;
      const cos = Math.cos(view.heading), sin = Math.sin(view.heading);
      let tx = (dx * cos - dz * sin) / view.range * half, ty = (dx * sin + dz * cos) / view.range * half;
      const distance = Math.hypot(tx, ty), rim = half - size * .09;
      const pinned = distance > rim;
      if (pinned) { tx *= rim / distance; ty *= rim / distance; }
      c.save(); c.translate(half + tx, half + ty);
      c.fillStyle = '#e8a23c'; c.strokeStyle = '#3a2a12'; c.lineWidth = size * .012;
      if (pinned) {
        c.rotate(Math.atan2(ty, tx) + Math.PI / 2);
        c.beginPath(); c.moveTo(0, -size * .06); c.lineTo(size * .045, size * .035); c.lineTo(-size * .045, size * .035); c.closePath();
      } else { c.beginPath(); c.arc(0, 0, size * .042, 0, Math.PI * 2); }
      c.fill(); c.stroke(); c.restore();
    }
    // The player: a fixed arrow, since the sheet turns beneath it.
    c.save(); c.translate(half, half);
    c.fillStyle = view.driving ? '#a63e2e' : '#20292c'; c.strokeStyle = '#f3ead2'; c.lineWidth = size * .016; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(0, -size * .085); c.lineTo(size * .055, size * .06); c.lineTo(0, size * .028); c.lineTo(-size * .055, size * .06); c.closePath();
    c.stroke(); c.fill(); c.restore();
  }
}
