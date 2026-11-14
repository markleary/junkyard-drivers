import { PARTS, UPGRADE_KINDS, getShell, type UpgradeKind } from './catalog';
import { completeSale, investment } from './dealer';
import { JOBS, getJob, type RestorationJob } from './job-catalog';
import { formatLap, styleFor, type Progress } from './progress';
import { availableFunds, buildIssues, collectionCost, getPart, type GameState, type OwnedCar } from './state';
import { fittedUpgrades } from './upgrades';

export { JOBS, getJob, type RestorationJob } from './job-catalog';

const money = (value: number) => `$${value.toLocaleString('en-US')}`;
const UPGRADE_NAME: Record<UpgradeKind, string> = { turbo: 'turbocharger', exhaust: 'modified exhaust', nitro: 'nitrous kit' };

export function activeJob(progress: Progress): RestorationJob | undefined {
  return progress.jobs.active ? getJob(progress.jobs.active) : undefined;
}

export function jobRank(progress: Progress): string {
  const count = progress.jobs.completed.length;
  return count >= JOBS.length ? 'Master restorer' : count >= 6 ? 'Restoration specialist' : count >= 3 ? 'Trusted restorer' : count >= 1 ? 'Local favorite' : 'New workshop';
}

export function acceptJob(progress: Progress, id: string): Progress {
  const job = getJob(id);
  if (!job) throw new Error('That customer request is no longer on the board.');
  if (progress.jobs.completed.includes(id)) throw new Error('That commission has already been delivered.');
  if (progress.jobs.completed.length < job.unlocksAfter) throw new Error(`Complete ${job.unlocksAfter} commissions to earn this customer’s trust.`);
  if (progress.jobs.active === id) return progress;
  if (progress.jobs.active) throw new Error('Finish or cancel your current commission first.');
  return { ...progress, jobs: { ...progress.jobs, active: id, proof: null, revision: progress.jobs.revision + 1 } };
}

export function cancelJob(progress: Progress): Progress {
  if (!progress.jobs.active) return progress;
  return { ...progress, jobs: { ...progress.jobs, active: null, proof: null, revision: progress.jobs.revision + 1 } };
}

/** The accepted lap belongs to these exact parts and appearance, not just a reusable car id. */
export function jobBuildSignature(state: GameState, progress: Progress, car: OwnedCar): string {
  const fitted = fittedUpgrades(state, progress, car.id), style = styleFor(progress, car.id);
  return JSON.stringify([car.id, car.shellId, car.engineId, car.wheelsId, car.paint.toLowerCase(), style.finish, style.stripe,
    ...UPGRADE_KINDS.map(kind => fitted[kind]?.instanceId ?? null)]);
}

export interface JobCheck { id: string; label: string; done: boolean }
export interface JobAssessment {
  checks: JobCheck[];
  unmet: string[];
  buildReady: boolean;
  ready: boolean;
  investment: number;
  lap?: number;
}

/** The same checklist powers the job board, garage and final delivery validation. */
export function assessJob(state: GameState, progress: Progress, selectedCar: OwnedCar | undefined, job: RestorationJob): JobAssessment {
  // An older UI snapshot must never vouch for parts that have since changed in the collection.
  const car = selectedCar && state.cars.find(item => item.id === selectedCar.id);
  const owned = !!car;
  const engine = owned ? getPart(state, car.engineId) : undefined;
  const wheels = owned ? getPart(state, car.wheelsId) : undefined;
  const fitted = owned ? fittedUpgrades(state, progress, car.id) : {};
  const invested = owned ? investment(state, progress, car).total : 0;
  const checks: JobCheck[] = [
    { id: 'shell', label: `Restore ${job.shells.map(id => getShell(id).name).join(' or ')}`, done: !!owned && job.shells.includes(car.shellId) },
    { id: 'running', label: 'Install a compatible engine and a wheel set', done: !!owned && buildIssues(state, car).length === 0 },
    { id: 'budget', label: `Build cost at most ${money(job.maxInvestment)}${owned ? ` · now ${money(invested)}` : ''}`, done: !!owned && invested <= job.maxInvestment },
  ];
  if (job.enginePower) {
    const { min, max } = job.enginePower;
    const powerLabel = min !== undefined && max !== undefined ? `${min}–${max} hp` : min !== undefined ? `at least ${min} hp` : `at most ${max} hp`;
    checks.push({ id: 'engine', label: `Engine rated ${powerLabel} before bolt-on tuning`, done: engine?.kind === 'engine' && (min === undefined || engine.power! >= min) && (max === undefined || engine.power! <= max) });
  }
  if (job.minGrip !== undefined) checks.push({ id: 'grip', label: `Wheel grip at least ${job.minGrip}`, done: wheels?.kind === 'wheels' && wheels.grip! >= job.minGrip });
  for (const kind of job.requiredUpgrades ?? []) checks.push({ id: `with-${kind}`, label: `Fit a ${UPGRADE_NAME[kind]}`, done: !!fitted[kind] });
  for (const kind of job.forbiddenUpgrades ?? []) checks.push({ id: `without-${kind}`, label: `No ${UPGRADE_NAME[kind]}`, done: !!owned && !fitted[kind] });
  if (job.paintId) {
    const paint = PARTS.find(item => item.id === job.paintId);
    checks.push({ id: 'paint', label: `Paint: ${paint?.name ?? job.paintId}`, done: !!owned && !!paint?.color && car.paint.toLowerCase() === paint.color.toLowerCase() });
  }
  const buildReady = checks.every(check => check.done);
  const proof = progress.jobs.proof;
  const validProof = !!owned && progress.jobs.active === job.id && proof?.jobId === job.id && proof.carId === car.id && proof.signature === jobBuildSignature(state, progress, car);
  const lap = validProof ? proof.seconds : undefined;
  checks.push({ id: 'lap', label: `After accepting, drive a full test loop in this build${job.maxLap ? ` in ${formatLap(job.maxLap)} or less` : ''}${lap !== undefined ? ` · proved ${formatLap(lap)}` : ''}`, done: lap !== undefined && (job.maxLap === undefined || lap <= job.maxLap) });
  return { checks, unmet: checks.filter(check => !check.done).map(check => check.label), buildReady,
    ready: progress.jobs.active === job.id && !progress.jobs.completed.includes(job.id) && checks.every(check => check.done), investment: invested, lap };
}

export interface JobLapStart { jobId: string; signature: string; revision: number }

/** Capture at the starting checkpoint; accepting a job halfway round never earns its proof. */
export function beginJobLap(state: GameState, progress: Progress, carId: string): JobLapStart | null {
  const job = activeJob(progress), car = state.cars.find(item => item.id === carId);
  if (!job || !car || !assessJob(state, progress, car, job).buildReady) return null;
  return { jobId: job.id, signature: jobBuildSignature(state, progress, car), revision: progress.jobs.revision };
}

export function recordJobLap(state: GameState, progress: Progress, carId: string, seconds: number, start: JobLapStart | null): Progress {
  if (!start || !Number.isFinite(seconds) || seconds <= 0 || seconds > 36000) return progress;
  const job = activeJob(progress), car = state.cars.find(item => item.id === carId);
  if (!job || !car || start.jobId !== job.id || start.revision !== progress.jobs.revision ||
      start.signature !== jobBuildSignature(state, progress, car) || !assessJob(state, progress, car, job).buildReady) return progress;
  const previous = progress.jobs.proof;
  if (previous?.jobId === job.id && previous.carId === carId && previous.signature === start.signature && previous.seconds <= seconds) return progress;
  // Keep the actual elapsed value: rounding must not turn an over-limit lap into a pass.
  return { ...progress, jobs: { ...progress.jobs, proof: { jobId: job.id, carId, signature: start.signature, seconds } } };
}

/** Call after any build change or sale, so refitting old parts cannot resurrect an earlier acceptance lap. */
export function reconcileJobs(state: GameState, progress: Progress): Progress {
  const proof = progress.jobs.proof;
  if (!proof) return progress;
  const car = state.cars.find(item => item.id === proof.carId), job = activeJob(progress);
  if (car && job?.id === proof.jobId && !progress.jobs.completed.includes(job.id) &&
      proof.signature === jobBuildSignature(state, progress, car) && assessJob(state, progress, car, job).buildReady) return progress;
  return { ...progress, jobs: { ...progress.jobs, proof: null } };
}

export interface JobDelivery { state: GameState; progress: Progress; amount: number; profit: number; restocked: string[]; job: RestorationJob }

/** Complete the agreed commission once. The car leaves exactly as it does in a dealer sale. */
export function completeJob(state: GameState, progress: Progress, carId: string): JobDelivery {
  const job = activeJob(progress), car = state.cars.find(item => item.id === carId);
  if (!job) throw new Error('Accept a customer request at the workshop job board first.');
  if (!car) throw new Error('That car is not in your collection.');
  if (progress.jobs.completed.includes(job.id)) throw new Error('That commission has already been delivered.');
  const assessment = assessJob(state, progress, car, job);
  if (!assessment.ready) throw new Error(`This commission is not ready. ${assessment.unmet[0] ?? 'Check the job board.'}`);
  // Reuse the shared removal/restock rules, then apply the customer's agreed price instead of the dealer's offer.
  const sale = completeSale(state, progress, carId, 0);
  const budget = Math.min(Number.MAX_SAFE_INTEGER, availableFunds(state, progress.budget) + job.payout + collectionCost(sale.state));
  const next: Progress = { ...sale.progress, budget, sales: progress.sales,
    jobs: { active: null, completed: [...progress.jobs.completed, job.id], proof: null, revision: progress.jobs.revision + 1 } };
  return { state: sale.state, progress: next, amount: job.payout, profit: job.payout - assessment.investment, restocked: sale.restocked, job };
}
