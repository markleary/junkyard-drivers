import { lotLocal, lotPoint, type Lot, type Point, type TownLayout } from './layout';

/**
 * Second Chance Motors: the used-car lot that buys finished cars. Positions are in the lot's own frame
 * (`lotPoint`), because the lot lands wherever the generated town leaves room for it.
 */
/** The marked trade-in bay: where it is centred, and its painted outline. */
export const TRADE_BAY = { across: 7.4, toward: 1.4, w: 3.8, d: 7.6 };
/** The sales hut, in the back corner away from the street. */
export const SALES_HUT = { fromEnd: 3.4, fromBack: 2.6, w: 5, d: 3.6 };
/** A stopped car counts as "at the dealer" this far past the lot's street edge (the pavement and the near lane) and past its ends. */
const KERBSIDE = 9.5, ENDS = 2;

export interface DealerSite {
  lot: Lot;
  /** Frontage length and depth, whichever way the lot is turned. */
  along: number;
  depth: number;
  /** Centre of the trade-in bay. */
  bay: Point;
  /** The hatch in the sales hut, for a customer on foot. */
  hatch: Point;
}

export function dealerSite(layout: TownLayout): DealerSite | null {
  const lot = layout.lots.find(item => item.kind === 'usedCars');
  if (!lot) return null;
  const along = Math.max(lot.w, lot.d), depth = Math.min(lot.w, lot.d);
  return {
    lot, along, depth,
    bay: lotPoint(lot, TRADE_BAY.across, TRADE_BAY.toward),
    hatch: lotPoint(lot, -along / 2 + SALES_HUT.fromEnd + .9, -depth / 2 + SALES_HUT.fromBack + SALES_HUT.d / 2 + .1),
  };
}

/** True on the lot itself, on the pavement outside it, and in the lane that runs past it. */
export function atDealer(layout: TownLayout, x: number, z: number): boolean {
  const site = dealerSite(layout);
  if (!site) return false;
  const { across, toward } = lotLocal(site.lot, x, z);
  return Math.abs(across) <= site.along / 2 + ENDS && toward >= -site.depth / 2 && toward <= site.depth / 2 + KERBSIDE;
}
