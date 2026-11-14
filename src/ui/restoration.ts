import { DEFAULT_PAINT, getShell, PARTS } from '../game/catalog';
import type { GameState, OwnedCar } from '../game/state';
import type { Progress } from '../game/progress';
import { restorationFor, type RestorationStage } from '../game/restoration';
import { icon } from './icons';

export const RESTORATION_COPY: Record<RestorationStage, { title: string; tool: string; action: string; detail: string }> = {
  wash: { title: 'Wash away the years', tool: 'SPONGE & WATER', action: 'Wash the body', detail: 'Lift the yard grime and uncover the paint beneath.' },
  rust: { title: 'Take care of the rust', tool: 'ABRASIVE PAD', action: 'Remove rust', detail: 'Work back the corrosion, ready for sound metal and fresh paint.' },
  repair: { title: 'Make the panels sound', tool: 'PANEL & FILLER WORK', action: 'Repair the panels', detail: 'Dress the rough patches and smooth the repairs.' },
  prime: { title: 'Lay down the primer', tool: 'PRIMER GUN', action: 'Prime the body', detail: 'Build an even, matte foundation for the colour coat.' },
  paint: { title: 'Make it your own', tool: 'COLOUR & CLEAR COAT', action: 'Paint the body', detail: 'Lay down your chosen colour and bring the finish to life.' },
  seal: { title: 'Keep its character', tool: 'SATIN SEALER', action: 'Seal the patina', detail: 'Protect the faded paint and the marks that tell its story.' },
  complete: { title: 'A project with a story', tool: 'BODYWORK COMPLETE', action: 'Finished', detail: 'Your work stays with the car, in the bay and out on the road.' },
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

function header(car: OwnedCar, gallery = false) {
  return `<div class="document-head restoration-head"><button class="close" data-action="restoration-back" aria-label="Back to the build sheet">${icon('close')}</button>
    <div class="document-type"><span class="eyebrow">WILLOW CREEK BODY SHOP</span><span class="document-code">${gallery ? 'PROJECT PHOTOS' : 'BAY 01 / BODYWORK'}</span></div>
    <h2 id="panel-title" tabindex="-1">${escapeHtml(getShell(car.shellId).name)}</h2></div>`;
}

/** Dedicated bodywork sheet: the live car remains the largest element. */
export function restorationMarkup(state: GameState, car: OwnedCar, progress: Progress) {
  const record = restorationFor(progress, car.id), stage = record?.stage ?? 'wash', done = stage === 'complete';
  const patina = record?.route === 'patina', copy = RESTORATION_COPY[stage];
  const stages: RestorationStage[] = patina ? ['wash', 'rust', 'repair', 'seal'] : ['wash', 'rust', 'repair', 'prime', 'paint'];
  const labels: Partial<Record<RestorationStage, string>> = { wash: 'Wash', rust: patina ? 'Stabilize' : 'De-rust', repair: 'Repair', prime: 'Prime', paint: 'Paint', seal: 'Seal' };
  const current = done ? stages.length : stages.indexOf(stage), percent = Math.round((record?.work ?? 0) * 100);
  const chooseRoute = stage === 'rust' && record?.work === 0;
  const paints = PARTS.filter(part => part.kind === 'paint' && state.paints.includes(part.id));
  const colours = [{ id: 'original', name: 'Original colour', color: DEFAULT_PAINT[car.shellId] }, ...paints];
  const paintChoice = record && !patina && !done ? `<fieldset class="restoration-paints"><legend>YOUR COLOUR</legend><div class="swatches">${colours.map(paint => `<button data-restoration-paint="${paint.id}" class="${car.paint === paint.color ? 'active' : ''}" style="--swatch:${paint.color}" aria-label="Choose ${escapeHtml(paint.name)}" title="${escapeHtml(paint.name)}" aria-pressed="${car.paint === paint.color}"><span class="paint-chip">${car.paint === paint.color ? icon('check') : ''}</span><b>${escapeHtml(paint.name)}</b></button>`).join('')}</div></fieldset>` : '';
  const workTitle = stage === 'rust' && patina ? 'Save the old finish' : copy.title;
  const workDetail = stage === 'rust' && patina ? 'Stabilize the corrosion while keeping the faded colour and weathered edges.' : copy.detail;
  return `${header(car)}<div class="restoration-layout">
    <div class="restoration-view"><div class="restoration-view-label"><span>${done ? 'FINISHED BY YOU' : record ? 'WORK IN PROGRESS' : 'YOUR NEXT CHAPTER'}</span><span>${patina ? 'PRESERVED PATINA' : 'FRESH FINISH'}</span></div>
      <canvas id="restoration-preview" aria-label="Live bodywork preview of ${escapeHtml(getShell(car.shellId).name)}. Drag across the body to work, or use the hold button."></canvas>
      <div class="restoration-view-foot"><span>${record && !done ? 'DRAG ACROSS THE BODY TO WORK' : 'WILLOW CREEK / PROJECT RECORD'}</span>${icon(done ? 'camera' : 'wrench')}</div></div>
    <div class="restoration-sheet"><ol class="restoration-steps" aria-label="Bodywork stages">${stages.map((item, index) => `<li class="${index < current ? 'done' : index === current && record ? 'current' : ''}" ${index === current && record ? 'aria-current="step"' : ''}><span>${index < current ? icon('check') : String(index + 1).padStart(2, '0')}</span><b>${labels[item]}</b></li>`).join('')}</ol>
      ${!record ? `<div class="restoration-intro"><span class="eyebrow">A LITTLE WORK. A LOT OF CHARACTER.</span><h3>Bring the body back.</h3><p>Wash, de-rust, repair, prime and paint. Or keep the aged finish and seal its patina.</p><p class="restoration-note">Start from the as-found bodywork. Your fitted parts stay in place. Each step takes a few seconds; leave and pick up where you stopped.</p><button class="primary" data-action="restoration-start">Begin bodywork ${icon('wrench')}</button><small>OPTIONAL · WORKSHOP SUPPLIES INCLUDED</small></div>`
      : done ? `<div class="restoration-complete"><span class="status-stamp">${patina ? 'PATINA PRESERVED' : 'RESTORED BY HAND'}</span><h3>${copy.title}</h3><p>${patina ? 'Cleaned, repaired and sealed. The old finish lives on.' : 'From tired bodywork to a finish you made your own.'}</p><button class="primary" data-action="restoration-photos">Before &amp; after ${icon('camera')}</button><small>${patina ? 'Your project photos keep the old finish and your handiwork.' : 'Your project photos keep this moment, even if you repaint later.'}</small></div>`
      : `<div class="restoration-task"><div class="restoration-tool"><span>${String(current + 1).padStart(2, '0')} / ${String(stages.length).padStart(2, '0')}</span><b>${stage === 'rust' && patina ? 'RUST TREATMENT' : copy.tool}</b></div><h3>${workTitle}</h3><p>${workDetail}</p>
      ${chooseRoute ? `<fieldset class="restoration-routes"><legend>CHOOSE ITS CHARACTER</legend><button data-restoration-route="paint" aria-pressed="${!patina}"><b>Fresh paint</b><small>Repair, prime &amp; colour</small></button><button data-restoration-route="patina" aria-pressed="${patina}"><b>Preserve patina</b><small>Repair &amp; seal the old finish</small></button><p class="restoration-route-note">The choice locks when rust work begins. Patina keeps its old colour; colour-specific customer jobs need fresh paint.</p></fieldset>` : ''}
      ${paintChoice}${stage === 'paint' && paints.length === 0 ? '<p class="restoration-note">The original body colour is ready to spray. More colours are available at the parts racks.</p>' : ''}
      <div class="restoration-progress"><label for="restoration-meter">THIS STEP</label><span id="restoration-percent">${percent}%</span><progress id="restoration-meter" max="1" value="${record.work}">${percent}%</progress></div>
      <button class="primary" id="restoration-work" aria-describedby="restoration-help">Hold to ${stage === 'rust' && patina ? 'stabilize rust' : copy.action.toLowerCase()} ${icon(stage === 'prime' || stage === 'paint' || stage === 'seal' ? 'paint' : 'wrench')}</button>
      <small id="restoration-help"><span class="desktop-only keyboard-only">Drag across the body, or hold the tool button / Space.</span><span class="touch-only keyboard-only">Drag across the body, or hold the tool button.</span><span class="gamepad-only">D-pad: choose · Hold A on the work button.</span> Release between steps.</small></div>`}
      <button class="restoration-return" data-action="restoration-back">Back to build sheet</button>
    </div></div>`;
}

/** URLs are supplied by the renderer after these fixed, matching views are drawn. */
export function restorationPhotosMarkup(car: OwnedCar, progress: Progress) {
  const record = restorationFor(progress, car.id), patina = record?.route === 'patina';
  return `${header(car, true)}<div class="restoration-photo-heading"><span class="eyebrow">SAME CAR. YOUR HANDIWORK.</span><span class="status-stamp">${patina ? 'PATINA PRESERVED' : 'RESTORED BY HAND'}</span></div>
    <div class="restoration-photo-pair"><figure><img id="restoration-before" alt="${escapeHtml(getShell(car.shellId).name)} before bodywork"><figcaption><b>Before</b><span>THE BODYWORK YOU STARTED WITH</span></figcaption></figure><figure><img id="restoration-after" alt="${escapeHtml(getShell(car.shellId).name)} after bodywork"><figcaption><b>After</b><span>${patina ? 'CLEANED, REPAIRED & SEALED' : 'REPAIRED, PRIMED & PAINTED'}</span></figcaption></figure></div>
    <div class="restoration-photo-actions"><p>A matched pair for your workshop wall.<br><small>Saved with the build and finish from each moment.</small></p><button class="primary" data-action="restoration-download">Save photo pair ${icon('camera')}</button><button class="restoration-return" data-action="restoration-bench">Back to bodywork</button></div>`;
}
