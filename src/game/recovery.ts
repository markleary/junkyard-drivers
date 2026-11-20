import type { Progress, RecoveryStage } from './progress';
import { startRestoration } from './restoration';
import { purchase, type GameState } from './state';

export const TIP = 'Dad’s old Courier is still in the packing shed. Head past the yard gate to the Bell Orchard sign. The lettering faces the wall. I’ve left the pickup and trailer out front. Bring her home. — Nell';
export const RECOVERY_OBJECTIVE: Record<RecoveryStage, string> = {
  unknown: 'Ask at Holloway Auto Parts.',
  lead: 'Take Holloway’s rig west past the yard gate to Bell Orchard.',
  shed: 'Turn around in the gravel yard and back the trailer toward the nose of the Courier.',
  loaded: 'Take the secured Courier through the yard gate. Stop at the striped Garage unloading bay.',
  complete: 'Recovered Nell Bell’s family delivery van from the old orchard packing shed.',
};

export function advanceRecovery(progress: Progress, next: 'lead' | 'shed' | 'loaded'): Progress {
  const before = { lead: 'unknown', shed: 'lead', loaded: 'shed' } as const;
  return progress.recovery === before[next] ? { ...progress, recovery: next } : progress;
}

/** Write the receipt first. If the tab closes before the progress write, its presence commits the handoff on load.
 * A completed run with no receipt means the van has since left the collection. */
export function reconcileRecovery(state: GameState, progress: Progress): Progress {
  if (!state.purchasedListings.includes('shell-orchard')) return progress;
  const finished = progress.recovery === 'complete' ? progress : { ...progress, recovery: 'complete' as const };
  return startRestoration(state, finished, 'car-orchard');
}

export function unloadRecovery(state: GameState, progress: Progress) {
  if (progress.recovery !== 'loaded') return { state, progress };
  const next = purchase(state, 'shell-orchard', progress.budget);
  return { state: next, progress: reconcileRecovery(next, progress) };
}
