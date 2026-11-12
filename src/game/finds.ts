import { AUTO_PARTS_STORE, lotPoint, type Point, type TownLayout } from '../world/layout';

/**
 * Twelve small pieces of motoring history left around the yard and the town.
 * Walking or driving up to one collects it. Positions follow the generated
 * town, so they are worked out from the layout rather than fixed.
 */
export type FindKind = 'hubcap' | 'plate' | 'oilcan';
export interface Find extends Point { id: string; name: string; hint: string; kind: FindKind; y: number }

export const FIND_IDS = ['pocket', 'crane', 'backfence', 'office', 'bales', 'alley', 'storeyard', 'tower', 'fuel', 'carlot', 'bandstand', 'corner'] as const;
export const FIND_COUNT = FIND_IDS.length;

export function findSpots(layout: TownLayout): Find[] {
  const east = layout.loop[2].x, north = layout.loop[3].z;
  const lot = (kind: 'fuel' | 'usedCars' | 'park') => layout.lots.find(item => item.kind === kind);
  // A point in a lot's own frame: across its frontage, and out toward its street.
  const inLot = (kind: 'fuel' | 'usedCars' | 'park', across: number, toward: number, fallback: Point): Point => {
    const found = lot(kind);
    return found ? lotPoint(found, across, toward) : fallback;
  };
  const carLot = lot('usedCars');
  const carLotDepth = carLot ? Math.min(carLot.w, carLot.d) : 16;
  const spots: Omit<Find, 'y'>[] = [
    { id: 'pocket', kind: 'hubcap', name: "Comet '62 hubcap", hint: 'Behind the scrap row, near the rarest shell in the yard.', x: -33.6, z: -18.4 },
    { id: 'crane', kind: 'oilcan', name: 'Holloway oil can', hint: 'In the shadow of the gantry crane.', x: -57.6, z: 9.6 },
    { id: 'backfence', kind: 'plate', name: 'Route 9 number plate', hint: 'Between the two heaps along the back fence.', x: -27, z: -47.6 },
    { id: 'office', kind: 'hubcap', name: 'Kestrel wire wheel cover', hint: 'Round the side of the yard office.', x: -40.2, z: 27.6 },
    { id: 'bales', kind: 'plate', name: 'Dealer plate, 1958', hint: 'Beside the stacked bales by the press.', x: -74.5, z: -27 },
    { id: 'alley', kind: 'oilcan', name: 'Brass tire gauge', hint: 'In the alley between the workshop and the fence.', x: -9.4, z: -12 },
    { id: 'storeyard', kind: 'hubcap', name: 'Roadmaster dog-dish cap', hint: 'Out the back of Holloway Auto Parts.', x: AUTO_PARTS_STORE.x, z: 2.2 },
    { id: 'tower', kind: 'plate', name: 'Willow Creek pennant plate', hint: 'Under the water tower.', x: layout.landmark.x, z: layout.landmark.z },
    { id: 'fuel', kind: 'oilcan', name: 'Willow Fuel quart tin', hint: 'Between the pumps at the fuel station.', ...inLot('fuel', 0, 3, { x: east - 10.5, z: 55 }) },
    { id: 'carlot', kind: 'hubcap', name: 'Sirocco centre cap', hint: 'On the forecourt at Second Chance Motors.', ...inLot('usedCars', -2.2, -carLotDepth / 2 + 2, { x: -9.5, z: north - 10.5 }) },
    { id: 'bandstand', kind: 'plate', name: 'Founders Day rally plate', hint: 'On the bandstand in the green.', ...inLot('park', 0, 0, { x: layout.loop[2].x / 2, z: (44 + north) / 2 }) },
    { id: 'corner', kind: 'oilcan', name: 'Chrome mascot', hint: 'On the far corner of the test loop, inside the bend.', x: east - 10.5, z: north - 10.5 },
  ];
  // The bandstand stands on a low platform.
  return spots.map(spot => ({ ...spot, y: spot.id === 'bandstand' && lot('park') ? .22 : 0 }));
}
