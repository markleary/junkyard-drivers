import { icon } from './icons';

/** DOM touch controls share the same salvage instruments as the desktop HUD. */
export const touchMarkup = `<div id="touch-controls" role="group" aria-label="Touch controls" hidden aria-hidden="true">
  <div class="touch-stick-group">
    <div id="touch-stick" role="group" aria-label="Movement thumbstick">
      <span class="touch-stick-gate" aria-hidden="true"></span>
      <span class="touch-stick-direction touch-stick-up" aria-hidden="true">▲</span>
      <span class="touch-stick-direction touch-stick-down" aria-hidden="true">▼</span>
      <span class="touch-stick-direction touch-stick-left" aria-hidden="true">◀</span>
      <span class="touch-stick-direction touch-stick-right" aria-hidden="true">▶</span>
      <span id="touch-stick-knob" aria-hidden="true"><i></i></span>
    </div>
    <div class="touch-stick-caption"><b id="touch-stick-label">MOVE</b><span class="touch-foot-help">EDGE TO RUN</span><span class="touch-drive-help">RELEASE TO CENTER</span></div>
  </div>
  <div class="touch-look-note touch-foot-help" aria-hidden="true"><span>LOOK AROUND</span><b>Drag the scene</b></div>
  <button id="touch-interact" type="button" disabled>
    <span class="touch-action-symbol" aria-hidden="true">${icon('tag')}</span>
    <span class="touch-action-copy"><b id="touch-action-label">Interact</b><span id="touch-action-detail">Look toward an item</span></span>
  </button>
  <div class="touch-pedals touch-drive-help" role="group" aria-label="Driving pedals">
    <button id="touch-brake" type="button" aria-label="Brake or reverse" aria-pressed="false"><span class="pedal-ribs" aria-hidden="true"></span><b>BRAKE</b><small>HOLD TO REVERSE</small></button>
    <button id="touch-throttle" type="button" aria-label="Accelerate" aria-pressed="false"><span class="pedal-ribs" aria-hidden="true"></span><b>ACCELERATE</b><small>HOLD</small></button>
  </div>
  <button id="touch-handbrake" class="touch-drive-help" type="button" aria-label="Handbrake" aria-pressed="false"><span class="handbrake-symbol" aria-hidden="true">P</span><b>HANDBRAKE</b><small>HOLD</small></button>
  <button id="touch-nitro" class="touch-drive-help" type="button" aria-label="Nitrous boost: hold to accelerate with nitrous" aria-pressed="false" hidden><span class="nitro-symbol" aria-hidden="true">${icon('nitro')}</span><b>NITRO</b><small>HOLD</small><i class="nitro-level" aria-hidden="true"></i></button>
  <div class="touch-switches touch-drive-help" role="group" aria-label="Car switches">
    <button id="touch-camera" type="button" aria-label="Change camera">${icon('camera')}<small>VIEW</small></button>
    <button id="touch-lights" type="button" aria-label="Headlamps">${icon('lamp')}<small>LAMPS</small></button>
    <button id="touch-horn" type="button" aria-label="Horn">${icon('horn')}<small>HORN</small></button>
  </div>
</div>`;
