import { describe, expect, it } from 'vitest';
import { FIND_COUNT, FIND_IDS, findSpots } from '../src/game/finds';
import { SUNRISE, SUNSET, TIME_PRESETS, advanceHour, clockLabel, sampleSky, sunDirection, wrapHour } from '../src/world/daylight';
import { AUTO_PARTS_STORE, GARAGE, YARD_BOUNDS, distanceToRoad, generateTown } from '../src/world/layout';
import { surfaceAt } from '../src/world/surface';
import { overlaps, yardObstacles, type Bounds } from '../src/world/yard';

const SEEDS = [642019, 913057, 1, 7, 42, 2024, 31337, 500000, 777777, 999983];
const around = (x: number, z: number, r: number): Bounds => ({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r });
const WORKSHOP: Bounds = { minX: -29.2, maxX: -10.8, minZ: -24.2, maxZ: -5.8 };
const STORE: Bounds = { minX: AUTO_PARTS_STORE.x - AUTO_PARTS_STORE.w / 2, maxX: AUTO_PARTS_STORE.x + AUTO_PARTS_STORE.w / 2, minZ: AUTO_PARTS_STORE.z - AUTO_PARTS_STORE.d / 2, maxZ: AUTO_PARTS_STORE.z + AUTO_PARTS_STORE.d / 2 };

describe('finds', () => {
  it('places all twelve, once each, for every town', () => {
    for (const seed of SEEDS) {
      const finds = findSpots(generateTown(seed));
      expect(finds.map(find => find.id)).toEqual([...FIND_IDS]);
      expect(finds).toHaveLength(FIND_COUNT);
      for (const find of finds) {
        expect(Number.isFinite(find.x) && Number.isFinite(find.z), `${find.id} for seed ${seed}`).toBe(true);
        expect(find.name.length).toBeGreaterThan(3);
        expect(find.hint.length).toBeGreaterThan(10);
      }
    }
  });

  it('leaves every find where a player can reach it', () => {
    const obstacles = yardObstacles();
    for (const seed of SEEDS) {
      const layout = generateTown(seed);
      for (const find of findSpots(layout)) {
        const spot = around(find.x, find.z, .35), label = `${find.id} for seed ${seed}`;
        for (const obstacle of obstacles) expect(overlaps(spot, obstacle.bounds), `${label} is inside ${obstacle.name}`).toBe(false);
        expect(overlaps(spot, WORKSHOP), `${label} is inside the workshop walls`).toBe(false);
        expect(overlaps(spot, STORE), `${label} is inside the parts store`).toBe(false);
        for (const building of layout.buildings) {
          expect(overlaps(spot, { minX: building.x - building.w / 2, maxX: building.x + building.w / 2, minZ: building.z - building.d / 2, maxZ: building.z + building.d / 2 }), `${label} is inside a building`).toBe(false);
        }
        // Nothing sits on the carriageway, where a car at speed would collect it by accident.
        for (const road of layout.roads) expect(distanceToRoad(find, road), `${label} is on ${road.id}`).toBeGreaterThan(road.width / 2);
      }
    }
  });

  it('keeps seven in the yard and five in town', () => {
    const finds = findSpots(generateTown(642019));
    const inYard = finds.filter(find => find.x > YARD_BOUNDS.minX - 6 && find.x < 24 && find.z < 36);
    expect(inYard.map(find => find.id)).toEqual(['pocket', 'crane', 'backfence', 'office', 'bales', 'alley', 'storeyard']);
  });
});

describe('ground surfaces', () => {
  const layout = generateTown(642019);

  it('names the ground for footsteps and tires', () => {
    expect(surfaceAt(layout, GARAGE.x, GARAGE.z)).toBe('concrete');
    expect(surfaceAt(layout, AUTO_PARTS_STORE.x, AUTO_PARTS_STORE.z)).toBe('concrete');
    expect(surfaceAt(layout, -70, -40)).toBe('gravel');
    expect(surfaceAt(layout, 195, 205)).toBe('grass');
    const street = layout.roads.find(road => !road.id.includes('garage') && !road.id.includes('gate'))!;
    expect(surfaceAt(layout, (street.a.x + street.b.x) / 2, (street.a.z + street.b.z) / 2)).toBe('asphalt');
    for (const lot of layout.lots) expect(surfaceAt(layout, lot.x, lot.z)).toBe(lot.kind === 'fuel' ? 'asphalt' : lot.kind === 'usedCars' ? 'gravel' : 'grass');
  });
});

describe('daylight', () => {
  it('puts the sun up by day and down by night', () => {
    expect(sunDirection(12.5)[1]).toBeGreaterThan(.8);
    expect(sunDirection(SUNRISE + .01)[1]).toBeGreaterThan(0);
    expect(sunDirection(SUNSET - .01)[1]).toBeGreaterThan(0);
    expect(sunDirection(23)[1]).toBeLessThan(0);
    expect(sunDirection(2)[1]).toBeLessThan(0);
    for (let hour = 0; hour < 24; hour += .25) expect(Math.hypot(...sunDirection(hour))).toBeCloseTo(1, 6);
  });

  it('always lights the scene from above the horizon', () => {
    for (let hour = 0; hour < 24; hour += .05) {
      const sample = sampleSky(hour);
      expect(sample.key[1], `hour ${hour.toFixed(2)}`).toBeGreaterThan(.1);
      expect(sample.keyIntensity).toBeGreaterThanOrEqual(0);
      expect(sample.night).toBeGreaterThanOrEqual(0);
      expect(sample.night).toBeLessThanOrEqual(1);
      for (const colour of [sample.top, sample.mid, sample.horizon, sample.fog, sample.hemiSky, sample.keyColor]) for (const value of colour) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1.001);
      }
    }
  });

  it('calls midday day and the small hours night', () => {
    expect(sampleSky(TIME_PRESETS.midday)).toMatchObject({ night: 0, daylight: 1 });
    expect(sampleSky(TIME_PRESETS.night).night).toBe(1);
    expect(sampleSky(TIME_PRESETS.night).daylight).toBe(0);
    expect(sampleSky(TIME_PRESETS.golden).night).toBeLessThan(.3);
    expect(sampleSky(TIME_PRESETS.night).stars).toBeGreaterThan(.5);
    expect(sampleSky(TIME_PRESETS.midday).stars).toBeLessThan(.01);
  });

  it('changes smoothly from minute to minute, with no jump at midnight', () => {
    const step = 1 / 60;
    for (let hour = 0; hour < 24; hour += step) {
      const a = sampleSky(hour), b = sampleSky(hour + step);
      const label = `hour ${hour.toFixed(2)}`;
      expect(Math.abs(a.exposure - b.exposure), label).toBeLessThan(.03);
      expect(Math.abs(a.hemiIntensity - b.hemiIntensity), label).toBeLessThan(.05);
      expect(Math.abs(a.fogDensity - b.fogDensity), label).toBeLessThan(.0006);
      for (let i = 0; i < 3; i++) {
        expect(Math.abs(a.fog[i] - b.fog[i]), label).toBeLessThan(.03);
        expect(Math.abs(a.top[i] - b.top[i]), label).toBeLessThan(.03);
        expect(Math.abs(a.horizon[i] - b.horizon[i]), label).toBeLessThan(.04);
      }
    }
  });

  it('runs the clock forward, wraps at midnight, and reads in five-minute steps', () => {
    let hour = 16.6, turned = 0;
    for (let second = 0; second < 3600; second++) {
      const next = advanceHour(hour, 1);
      expect(next).toBeGreaterThanOrEqual(0);
      expect(next).toBeLessThan(24);
      if (next < hour) turned++;
      else expect(next).toBeGreaterThan(hour);
      hour = next;
    }
    // An hour of play covers a little more than one full day.
    expect(turned).toBeGreaterThanOrEqual(1);
    expect(turned).toBeLessThanOrEqual(3);
    expect(wrapHour(-1)).toBe(23);
    expect(wrapHour(49.5)).toBe(1.5);
    expect(clockLabel(0)).toBe('00:00');
    expect(clockLabel(17.67)).toBe('17:40');
    expect(clockLabel(23.999)).toBe('23:55');
    expect(clockLabel(24.5)).toBe('00:30');
  });
});
