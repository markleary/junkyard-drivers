import { PARTS, OWNABLE_SHELLS, UPGRADE_KINDS, type ShellId } from './catalog';
import type { FinishId, StripeId } from './progress';
import type { RestorationRecord, RestorationSnapshot, RestorationStage } from './restoration';

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const finishes: FinishId[] = ['gloss', 'metallic', 'matte', 'pearl'];
const stripes: StripeId[] = ['none', 'ivory', 'black', 'gold'];
const stages: RestorationStage[] = ['wash', 'rust', 'repair', 'prime', 'paint', 'seal', 'complete'];
const color = /^#[\da-f]{6}$/i;

function parseSnapshot(value: unknown, shellId: ShellId): RestorationSnapshot | null {
  if (!record(value) || value.shellId !== shellId || typeof value.paint !== 'string' || !color.test(value.paint)) return null;
  return {
    shellId, paint: value.paint,
    finish: finishes.includes(value.finish as FinishId) ? value.finish as FinishId : 'gloss',
    stripe: stripes.includes(value.stripe as StripeId) ? value.stripe as StripeId : 'none',
    enginePartId: typeof value.enginePartId === 'string' && PARTS.some(part => part.kind === 'engine' && part.id === value.enginePartId) ? value.enginePartId : null,
    wheels: value.wheels === true,
    tuning: Array.isArray(value.tuning) ? UPGRADE_KINDS.filter(kind => (value.tuning as unknown[]).includes(kind)) : [],
    restored: value.restored === true,
  };
}

/** Repair each project's operation independently; never accept image payloads or unbounded photo history. */
export function parseRestorations(value: unknown): Record<string, RestorationRecord> {
  const result: Record<string, RestorationRecord> = {};
  if (!record(value)) return result;
  for (const { id: shellId } of OWNABLE_SHELLS) {
    const id = `car-${shellId}`, saved = value[id];
    if (!record(saved)) continue;
    const before = parseSnapshot(saved.before, shellId);
    if (!before) continue;
    const route = saved.route === 'patina' ? 'patina' : 'paint';
    let stage: RestorationStage = stages.includes(saved.stage as RestorationStage) ? saved.stage as RestorationStage : 'wash';
    if (route === 'patina' && (stage === 'prime' || stage === 'paint')) stage = 'seal';
    if (route === 'paint' && stage === 'seal') stage = 'prime';
    let after = stage === 'complete' ? parseSnapshot(saved.after, shellId) : null;
    // A damaged finished photo sends only this last operation back for a fresh capture.
    if (stage === 'complete' && !after) stage = route === 'paint' ? 'paint' : 'seal';
    if (after) after = { ...after, restored: route === 'paint' };
    if (after && shellId === 'orchard' && route === 'paint' && record(saved.after)) {
      after.orchardLettering = saved.after.orchardLettering === true;
    }
    const work = stage === 'complete' ? 0 : typeof saved.work === 'number' && Number.isFinite(saved.work) && saved.work >= 0 && saved.work < 1 ? saved.work : 0;
    result[id] = { stage, route, work, before, after };
  }
  return result;
}
