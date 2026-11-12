import { PARTS, SHELLS, type Part, type Shell } from './catalog';
import { randomFromSeed } from '../world/layout';
import { PART_SPOTS, SHELL_SPOTS, type StashSpot } from '../world/yard';

/**
 * Where the rare salvage lies. Each game shuffles the yard's hiding places with its own seed and deals every
 * rare piece a few of them: it starts in the first, and each time it is sold on with a car and comes back, it
 * turns up in the next. Places are never shared, so moving one piece never disturbs another.
 */
export const RARE_PARTS: Part[] = PARTS.filter(part => part.source === 'hidden');
export const RARE_SHELLS: Shell[] = SHELLS.filter(shell => shell.hidden);

export interface StashItem {
  listingId: string;
  kind: 'shell' | 'part';
  /** Catalog id of the shell or part. */
  itemId: string;
  x: number;
  z: number;
  yaw: number;
  hint: string;
  /** Index of the hiding place in PART_SPOTS or SHELL_SPOTS. */
  spot: number;
}

function shuffled(count: number, seed: number): number[] {
  const random = randomFromSeed(seed), order = Array.from({ length: count }, (_, index) => index);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

function deal(kind: StashItem['kind'], ids: string[], spots: readonly StashSpot[], seed: number, restock: Record<string, number>): StashItem[] {
  const order = shuffled(spots.length, seed), each = Math.max(1, Math.floor(spots.length / Math.max(1, ids.length)));
  return ids.map((itemId, index) => {
    const listingId = `${kind}-${itemId}`, returns = Object.hasOwn(restock, listingId) ? restock[listingId] : 0;
    const spot = order[(index + ids.length * (returns % each)) % spots.length];
    const { x, z, yaw, hint } = spots[spot];
    return { listingId, kind, itemId, x, z, yaw, hint, spot };
  });
}

/** Every rare piece and where it lies in this game, whether or not it has been bought. */
export function stashLayout(seed: number, restock: Record<string, number> = {}): StashItem[] {
  const base = seed >>> 0;
  return [
    ...deal('part', RARE_PARTS.map(part => part.id), PART_SPOTS, base ^ 0x51a7e, restock),
    ...deal('shell', RARE_SHELLS.map(shell => shell.id), SHELL_SPOTS, base ^ 0xca75, restock),
  ];
}

/** The smallest seed, counting up from `from`, that puts one listing in one hiding place. For tests and review scripts. */
export function seedPlacing(listingId: string, spot: number, from = 1): number {
  for (let seed = from; seed < from + 100000; seed++) {
    if (stashLayout(seed).find(item => item.listingId === listingId)?.spot === spot) return seed;
  }
  throw new Error(`No seed puts ${listingId} in hiding place ${spot}.`);
}
