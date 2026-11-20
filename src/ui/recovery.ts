import { TIP, RECOVERY_OBJECTIVE } from '../game/recovery';
import type { RecoveryStage } from '../game/progress';

export function recoveryNote(stage: RecoveryStage) {
  return `<article class="orchard-note"><small>HOLLOWAY AUTO PARTS · COUNTER COPY</small>
    <h2>A favor for Nell</h2><p>${TIP}</p>
    ${stage === 'unknown' ? '<button class="primary" data-action="accept-tip">Borrow the rig</button>' : `<p class="note-status">${RECOVERY_OBJECTIVE[stage]}</p>`}
    <button data-action="close">Fold note</button></article>`;
}
