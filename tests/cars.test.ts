import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { SHELLS } from '../src/game/catalog';
import { createCar } from '../src/render/cars';
import { installCanvasStandIn } from './support/canvas';

let restoreCanvas: () => void;
beforeAll(() => { restoreCanvas = installCanvasStandIn(); });
afterAll(() => restoreCanvas());

describe('complete catalog car models', () => {
  const bodyMaterial = (car: ReturnType<typeof createCar>) => {
    let result: THREE.MeshPhysicalMaterial | undefined;
    car.group.traverse(object => {
      if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshPhysicalMaterial && object.material.name === 'restoration-body') result = object.material;
    });
    expect(result, 'painted panels must stay identifiable for workshop picking').toBeDefined();
    return result!;
  };

  it.each(SHELLS)('restores $name with one owned skin while preserving trim, then releases the skin after painting', shell => {
    const car = createCar(shell.id, { restored: true, paint: '#c56b34', restoration: { stage: 'wash', route: 'paint', work: 0 } });
    const paint = bodyMaterial(car), texture = paint.map!;
    const trim = new Map<THREE.MeshStandardMaterial, { color: string; map: THREE.Texture | null }>();
    car.group.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      for (const material of [object.material].flat()) {
        // Washing clears the glass; only the painted body receives a working skin.
        if (material instanceof THREE.MeshStandardMaterial && material !== paint && !material.transparent)
          trim.set(material, { color: material.color.getHexString(), map: material.map });
      }
    });
    const release = vi.spyOn(texture, 'dispose');
    expect(texture).toBeInstanceOf(THREE.CanvasTexture);
    const version = texture.version;
    car.setAppearance({ restoration: { stage: 'wash', route: 'paint', work: .001 } });
    expect(texture.version).toBe(version);
    for (const stage of ['wash', 'rust', 'repair', 'prime', 'paint'] as const) {
      car.setAppearance({ restoration: { stage, route: 'paint', work: .5 } });
      expect(paint.map).toBe(texture);
      expect(Number.isFinite(paint.roughness)).toBe(true);
    }
    expect(texture.version).toBeGreaterThan(version);
    car.setAppearance({ restoration: { stage: 'complete', route: 'paint', work: 0 } });
    expect(paint.map).toBeNull();
    expect(paint.color.getHexString()).toBe('c56b34');
    expect(paint.clearcoat).toBeGreaterThan(.8);
    for (const [material, before] of trim) {
      expect(material.color.getHexString(), `${shell.name} trim colour`).toBe(before.color);
      expect(material.map, `${shell.name} trim texture`).toBe(before.map);
    }
    expect(release).not.toHaveBeenCalled();
    car.dispose(); car.dispose();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it.each(SHELLS)('keeps $name weathering under sealed patina and can switch to the painted comparison photo', shell => {
    const car = createCar(shell.id, { paint: '#b83d30', restored: true, restoration: { stage: 'complete', route: 'patina', work: 0 } });
    try {
      const paint = bodyMaterial(car), texture = paint.map;
      expect(texture).not.toBeNull();
      expect(paint.color.getHexString()).toBe('ffffff');
      expect(paint.clearcoat).toBeGreaterThan(0);
      expect(paint.clearcoat).toBeLessThan(.6);
      car.setAppearance({ restoration: undefined });
      expect(paint.map).toBeNull();
      expect(paint.color.getHexString()).toBe('b83d30');
      car.setAppearance({ restoration: { stage: 'complete', route: 'patina', work: 0 } });
      expect(paint.map).toBe(texture);
    } finally { car.dispose(); }
  });

  it('maps weathering across the Courier cargo walls instead of sampling one texture pixel', () => {
    const car = createCar('courier', { restored: false, wheels: false });
    try {
      car.group.updateMatrixWorld(true);
      const wallArea = { left: 0, right: 0, rear: 0 };
      car.group.traverse(object => {
        if (!(object instanceof THREE.Mesh) || !(object.material instanceof THREE.MeshPhysicalMaterial) ||
            !object.material.map || object.material.transparent) return;
        const geometry = object.geometry, positions = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
        const index = geometry.getIndex();
        for (let triangle = 0; triangle < (index?.count ?? positions.count); triangle += 3) {
          const ids = [0, 1, 2].map(offset => index ? index.getX(triangle + offset) : triangle + offset);
          const [a, b, c] = ids.map(id => new THREE.Vector3().fromBufferAttribute(positions, id).applyMatrix4(object.matrixWorld));
          const center = a.clone().add(b).add(c).divideScalar(3);
          // Broad regions of the tall cargo body, above the beltline and behind the cab.
          // Select by location and facing so the check survives retessellation and added trim.
          if (center.y < car.roofHeight * .4 || center.y > car.roofHeight * .9 || center.z < .3) continue;
          const normal = b.clone().sub(a).cross(c.clone().sub(a)), area = normal.length() / 2;
          if (area < 1e-7) continue;
          normal.normalize();
          const wall = Math.abs(normal.x) > .8 && Math.abs(center.x) > .65 ? center.x < 0 ? 'left' : 'right'
            : Math.abs(normal.z) > .8 && center.z > 1.9 ? 'rear' : null;
          if (!wall) continue;
          wallArea[wall] += area;
          expect(uv, `${wall} cargo wall needs texture coordinates`).toBeDefined();
          const [p, q, r] = ids.map(id => new THREE.Vector2().fromBufferAttribute(uv, id));
          const uvArea = Math.abs((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
          expect(Number.isFinite(uvArea), `${wall} cargo wall has invalid texture coordinates`).toBe(true);
          expect(uvArea, `${wall} cargo wall collapses its weathering to a line or pixel`).toBeGreaterThan(1e-10);
        }
      });
      // Require substantial wall coverage, so missing panels or a broken selector cannot silently pass.
      for (const [wall, area] of Object.entries(wallArea)) expect(area, `${wall} cargo wall coverage`).toBeGreaterThan(.25);
    } finally { car.dispose(); }
  });

  it.each(SHELLS)('renders $name as salvage and a working restored car with finite geometry', shell => {
    const car = createCar(shell.id, { restored: false, wheels: false });
    try {
      expect(car.headlamps).toHaveLength(2);
      expect(car.wheels).toHaveLength(4);
      expect(car.wheels.every(wheel => !wheel.visible)).toBe(true);
      car.setAppearance({ restored: true, wheels: true, paint: '#f0dfad', stripe: '#16191a',
        engine: { family: shell.mount.toLowerCase() as 'i4' | 'v8' | 'v12', salvage: true, performance: false },
        tuning: { turbo: true, exhaust: true, nitro: true } });
      car.setBonnet(1); car.setLamps({ head: 1, brake: 1, reverse: 1 });
      car.animateWheels(.3, 1.2);
      expect(car.wheels.every(wheel => wheel.visible)).toBe(true);
      car.group.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        const positions = object.geometry.getAttribute('position');
        expect(positions.count).toBeGreaterThan(0);
        expect(Array.from(positions.array).every(Number.isFinite), `${shell.id} ${object.name}`).toBe(true);
      });
      car.setBonnet(0);
      const size = new THREE.Box3().setFromObject(car.group).getSize(new THREE.Vector3());
      expect(size.x).toBeGreaterThan(1.5); expect(size.x).toBeLessThan(2.5);
      expect(size.z).toBeGreaterThan(3.7); expect(size.z).toBeLessThan(5.2);
      expect(size.y).toBeGreaterThan(1); expect(size.y).toBeLessThan(2.5);
    } finally { car.dispose(); }
  });
});
