import { getPartsForSale, getShell, LISTINGS, PARTS, SHELLS, type PartKind, type PartSource } from '../game/catalog';
import { availableInventory, buildIssues, getPart, type GameState, type OwnedCar } from '../game/state';
import { FINISHES, MEDAL_TIMES, STRIPES, bestMedal, finishUnlocked, formatLap, medalFor, stripeUnlocked, styleFor, type Medal, type Progress } from '../game/progress';
import type { Find } from '../game/finds';
import { icon, vehicleStamp } from './icons';

const money = (value: number) => `$${value.toLocaleString()}`;
const partIcon = (kind: PartKind) => icon(kind === 'wheels' ? 'wheel' : kind);
const MEDAL_NAME: Record<Medal, string> = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold' };

export const appMarkup = `<canvas id="world" tabindex="-1" aria-label="Junkyard Drivers 3D game"></canvas>
  <header id="hud">
    <div class="yard-mark"><span class="yard-monogram">JD</span><span class="yard-name">JUNKYARD<br><b>DRIVERS</b></span><span id="clock" class="yard-clock" aria-label="Time of day"></span></div>
    <div class="hud-tools"><button id="pause-button" aria-label="Pause and controls">${icon('pause')}<kbd>ESC</kbd><span class="touch-only">PAUSE</span></button></div>
  </header>
  <div id="objective" class="job-note"><span class="eyebrow">CURRENT JOB</span><p>Find a project car in the yard.</p><ol id="job-steps" class="job-steps" aria-label="Restoration steps"></ol></div>
  <div id="crosshair" aria-hidden="true">+</div><div id="hint" hidden></div>
  <div id="minimap" hidden aria-hidden="true"><canvas id="minimap-canvas"></canvas><span class="minimap-ring"></span></div>
  <div id="speed" hidden>
    <div class="instrument-top">ROAD SPEED</div>
    <div id="rev-bar" class="rev-bar" aria-hidden="true">${'<i></i>'.repeat(12)}</div>
    <div class="speed-dial" aria-hidden="true"><div class="speed-ticks"><i>0</i><i>80</i><i>160</i></div><div class="speed-needle"></div></div>
    <div class="speed-readout"><span id="gear" class="gear" aria-label="Gear">N</span><strong>00</strong><span class="speed-unit">km/h</span></div>
    <div class="instrument-bottom"><span id="motion-state">IDLE</span><span id="lamp-state" class="tell-tale" hidden>LIGHTS</span><span class="desktop-only">W / S · DRIVE</span><span class="touch-only">PEDALS · DRIVE</span></div>
  </div>
  <button id="recover" hidden>${icon('wrench')}<span>Recover to Garage</span><kbd>R</kbd></button>
  <div id="route" hidden></div>
  <div id="banner" role="status" hidden></div>
  <div id="photo-bar" hidden>
    <span class="photo-title">${icon('camera')}<b>PHOTO MODE</b></span>
    <button data-photo="filter">Filter: <b id="photo-filter">Natural</b></button>
    <button data-photo="earlier" aria-label="Earlier in the day">${icon('clock')} −</button>
    <button data-photo="later" aria-label="Later in the day">${icon('clock')} +</button>
    <button data-photo="save" class="photo-save">Save picture</button>
    <button data-photo="done">Done</button>
    <span class="photo-help desktop-only">DRAG TO ORBIT · SCROLL TO ZOOM</span><span class="photo-help touch-only">DRAG TO ORBIT · PINCH TO ZOOM</span>
  </div>
  <div id="toast" role="status"></div>
  <div id="menu">${introMarkup()}</div><div id="panel" role="dialog" aria-modal="true" aria-labelledby="panel-title" hidden></div>
  <footer id="footer"><span id="save-status">AUTOSAVE READY</span></footer>`;

function introMarkup() {
  return `<section class="intro yard-ticket">
    <div class="ticket-top">${icon('wrench')}<span>WILLOW CREEK<br><b>MOTOR SALVAGE</b></span><small>YARD PASS<br>No. 001</small></div>
    <h1 class="title-logo"><span>JUNKYARD</span><span>DRIVERS</span></h1>
    <div class="ticket-copy"><p>Pick a shell. Find its parts.<br>Get it running.</p><span class="admission-stamp">UNLIMITED<br>SHOP CREDIT</span></div>
    <div class="intro-bottom"><button class="primary" id="begin" disabled>Opening the yard…</button></div>
    <div class="ticket-stub"><div class="entry-controls desktop-only"><span><kbd>WASD</kbd> WALK</span><span><kbd>MOUSE</kbd> LOOK</span><span><kbd>E</kbd> INSPECT</span></div><div class="entry-controls touch-only"><span><b class="touch-key">STICK</b> MOVE</span><span><b class="touch-key">DRAG</b> LOOK</span><span><b class="touch-key">TAP</b> INTERACT</span></div><p class="touch-layout-tip touch-only">Best with your tablet in landscape. Portrait works too.</p><div id="loading" class="loading">Opening the gate…</div></div>
  </section>`;
}

export interface PauseOptions {
  soundOn: boolean;
  routeOn: boolean;
  carCount: number;
  touchEnabled: boolean;
  graphics: string;
  time: string;
  motion: boolean;
  map: boolean;
  finds: number;
  findTotal: number;
  canPhoto: boolean;
}

export function pauseMarkup(options: PauseOptions) {
  const { soundOn, routeOn, carCount, touchEnabled } = options;
  return `<section class="pause-card">
    <div class="document-top">${icon('wrench')}<span>WILLOW CREEK MOTOR SALVAGE</span></div>
    <span class="eyebrow">DRIVER'S LOGBOOK</span><h2>Shift paused.</h2>
    <p>Your purchases and builds save automatically.</p>
    <button class="primary" data-action="resume">Resume game ${icon('arrow')}</button>
    <div class="pause-links"><button data-action="logbook">${icon('book')}<span>Logbook<small>${String(options.finds).padStart(2, '0')} / ${options.findTotal} FINDS</small></span></button><button data-action="photo" ${options.canPhoto ? '' : 'disabled'}>${icon('camera')}<span>Photo mode<small class="desktop-only">KEY P</small><small class="touch-only">FREE CAMERA</small></span></button></div>
    <div class="controls desktop-only">
      <div><kbd>W A S D</kbd><span>Walk / drive</span></div><div><kbd>MOUSE</kbd><span>Look around</span></div>
      <div><kbd>E</kbd><span>Inspect / use / exit</span></div><div><kbd>SPACE</kbd><span>Handbrake</span></div>
      <div><kbd>C</kbd><span>Change camera</span></div><div><kbd>B</kbd><span>Look back</span></div>
      <div><kbd>L</kbd><span>Headlamps</span></div><div><kbd>H</kbd><span>Horn</span></div>
      <div><kbd>R</kbd><span>Recover to Garage</span></div><div><kbd>M</kbd><span>Map zoom</span></div>
      <div><kbd>P</kbd><span>Photo mode</span></div><div><kbd>ESC</kbd><span>Pause / free mouse</span></div>
    </div>
    <p class="pad-note desktop-only">Controllers work too: sticks to move and look, triggers to drive, X to interact, Start to pause.</p>
    <div class="controls touch-only">
      <div><b class="touch-control-name">Thumbstick</b><span>Move · push farther to run</span></div><div><b class="touch-control-name">Drag scene</b><span>Look around on foot</span></div>
      <div><b class="touch-control-name">Action tag</b><span>Inspect, use, or exit at Garage</span></div><div><b class="touch-control-name">Drive</b><span>Stick to steer · hold pedals</span></div>
      <div><b class="touch-control-name">Brake</b><span>Stop, then hold to reverse</span></div><div><b class="touch-control-name">Recovery</b><span>Tap Recover to Garage</span></div>
    </div>
    <div class="pause-actions"><button data-action="sound" aria-pressed="${soundOn}">Sound: ${soundOn ? 'on' : 'off'}</button><button data-action="route" aria-pressed="${routeOn}">Marked loop: ${routeOn ? 'on' : 'off'}</button><button data-action="touch-controls" aria-pressed="${touchEnabled}">Touch controls: ${touchEnabled ? 'on' : 'off'}</button><button data-action="graphics">Graphics: ${options.graphics}</button><button data-action="time">Time: ${options.time}</button><button data-action="map" aria-pressed="${options.map}">Map: ${options.map ? 'on' : 'off'}</button><button data-action="motion" aria-pressed="${options.motion}">Camera motion: ${options.motion ? 'on' : 'off'}</button><button data-action="new">New game…</button></div>
    <small class="paper-footnote">${String(carCount).padStart(2, '0')} CARS IN COLLECTION · SHOP CREDIT UNLIMITED</small>
  </section>`;
}

export function resetMarkup() {
  return `<section class="pause-card reset-card"><div class="document-top">${icon('warning')}<span>COLLECTION RESET</span></div>
    <span class="eyebrow">VOID CURRENT LOGBOOK</span><h2>Clear this collection?</h2>
    <p>This removes all purchased shells, parts, and paint, along with lap times, finds, and unlocked finishes, from the saved game on this device.</p>
    <button class="primary" data-action="confirm-new">Yes, start a new game</button><button class="secondary" data-action="cancel-new">Keep my collection</button>
  </section>`;
}

/** Lap records, distance driven and the twelve finds, on the same stationery as the pause sheet. */
export function logbookMarkup(state: GameState, progress: Progress, finds: Find[]) {
  const best = bestMedal(progress);
  const cars = SHELLS.map(shell => {
    const owned = state.cars.some(car => car.shellId === shell.id);
    const lap = progress.bestLap[shell.id], medal = lap === undefined ? null : medalFor(shell.id, lap), times = MEDAL_TIMES[shell.id];
    const next = medal === 'gold' ? null : medal === 'silver' ? 'gold' : medal === 'bronze' ? 'silver' : 'bronze';
    return `<tr class="${owned ? '' : 'unowned'}"><th scope="row">${owned ? shell.name : 'Not yet found'}<small>${owned ? shell.era : 'Somewhere in the yard'}</small></th>
      <td>${lap === undefined ? '<span class="blank">no lap</span>' : `<b>${formatLap(lap)}</b>`}${medal ? `<span class="medal ${medal}">${MEDAL_NAME[medal]}</span>` : ''}${owned && next ? `<small>${MEDAL_NAME[next].toUpperCase()} ${formatLap(times[next])}</small>` : ''}</td>
      <td><b>${((progress.odometer[shell.id] ?? 0) / 1000).toFixed(1)}</b><small>KM DRIVEN</small></td>
      <td><b>${Math.round((progress.topSpeed[shell.id] ?? 0) * 3.6)}</b><small>KM/H BEST</small></td></tr>`;
  }).join('');
  const found = finds.map((find, index) => {
    const has = progress.finds.includes(find.id);
    return `<li class="${has ? 'found' : ''}"><span class="find-number">${String(index + 1).padStart(2, '0')}</span><div><b>${has ? find.name : 'Not found yet'}</b><small>${has ? 'Hung on the workshop wall' : find.hint}</small></div>${has ? icon('check') : ''}</li>`;
  }).join('');
  const finishes = FINISHES.filter(item => item.finds > 0).map(item => `<li class="${finishUnlocked(progress, item.id) ? 'found' : ''}"><b>${item.name} finish</b><small>${finishUnlocked(progress, item.id) ? 'UNLOCKED' : `${item.finds} FINDS`}</small></li>`).join('');
  const stripes = STRIPES.filter(item => item.medal).map(item => `<li class="${stripeUnlocked(progress, item.id) ? 'found' : ''}"><b>${item.name} stripes</b><small>${stripeUnlocked(progress, item.id) ? 'UNLOCKED' : `${MEDAL_NAME[item.medal!].toUpperCase()} MEDAL`}</small></li>`).join('');
  return `<section class="pause-card logbook-card">
    <div class="document-top">${icon('book')}<span>WILLOW CREEK MOTOR SALVAGE</span></div>
    <span class="eyebrow">DRIVER'S LOGBOOK · PAGE 2</span><h2>Records &amp; finds.</h2>
    <button class="primary" data-action="back-to-pause">Back ${icon('arrow')}</button>
    <div class="logbook-columns"><div>
      <h3 class="logbook-heading">${icon('gauge')}<span>Test loop</span><small>${progress.laps} LAPS${best ? ` · BEST MEDAL ${MEDAL_NAME[best].toUpperCase()}` : ''}</small></h3>
      <table class="lap-table"><tbody>${cars}</tbody></table>
      <h3 class="logbook-heading">${icon('paint')}<span>Paint shop extras</span><small>AT THE WORKBENCH</small></h3>
      <ul class="unlock-list">${finishes}${stripes}</ul>
    </div><div>
      <h3 class="logbook-heading">${icon('find')}<span>Lost &amp; found</span><small>${progress.finds.length} OF ${finds.length}</small></h3>
      <ol class="find-list">${found}</ol>
    </div></div>
    <small class="paper-footnote">Finds unlock finishes. Medals on the test loop unlock stripes.</small>
  </section>`;
}

function panelHeader(kicker: string, title: string, code: string) {
  return `<div class="document-head"><button class="close" data-action="close" aria-label="Close panel">${icon('close')}</button>
    <div class="document-type"><span class="eyebrow">${kicker}</span><span class="document-code">${code}</span></div><h2 id="panel-title" tabindex="-1">${title}</h2></div>`;
}

export function inspectionMarkup(state: GameState, listingId: string) {
  const listing = LISTINGS.find(item => item.id === listingId)!;
  const shell = getShell(listing.itemId), sold = state.purchasedListings.includes(listingId);
  const lot = String(SHELLS.findIndex(item => item.id === shell.id) + 1).padStart(2, '0');
  return `${panelHeader('VEHICLE INVENTORY', shell.name, `LOT ${lot}`)}
    <div class="vehicle-drawing">${vehicleStamp(shell.id)}<span class="condition-stamp">${shell.id === 'veloce' ? 'RARE FIND' : 'AS FOUND'}</span></div>
    <div class="tag">${shell.era}</div><p class="description">${shell.description}</p>
    <div class="spec-grid"><div><span>CONDITION</span><b>Unrestored shell</b></div><div><span>ENGINE MOUNT</span><b>${shell.mount}</b></div><div><span>INCLUDED</span><b>Body & chassis</b></div><div><span>TO GET RUNNING</span><b>Engine + wheels</b></div></div>
    <div class="price"><div><span>ASKING PRICE</span><strong>${money(shell.price)}</strong></div><span>SHOP CREDIT<b>∞ Unlimited</b></span></div>
    <button class="primary" data-buy="${listingId}" aria-label="${sold ? 'Owned' : 'Buy'} ${shell.name}${sold ? '' : ` for ${money(shell.price)}`}" ${sold ? 'disabled' : ''}>${sold ? 'Delivered to your Garage' : `Buy shell ${icon('arrow')}`}</button>
    <small class="paper-footnote">${sold ? 'DELIVERY COMPLETE · CHECK YOUR GARAGE BAY' : 'INCLUDES DELIVERY TO THE GARAGE BAY'}</small>`;
}

export function shopMarkup(state: GameState, source: PartSource, kind: PartKind) {
  const store = source === 'store';
  const categories: PartKind[] = ['engine', 'wheels', 'paint'];
  const labels = { engine: 'Engines', wheels: 'Wheels & tires', paint: 'Paint' };
  const titles = { engine: 'Engine rack', wheels: 'Wheel rack', paint: 'Paint shelf' };
  const items = getPartsForSale(source, kind);
  return `${panelHeader(store ? 'HOLLOWAY AUTO PARTS' : 'WILLOW CREEK SALVAGE', store ? 'Parts counter' : titles[kind], store ? 'NEW STOCK' : 'YARD STOCK')}
    ${store ? `<p class="shop-intro">Factory-new parts. Collect here, install at the Garage.</p><div class="shop-tabs" role="group" aria-label="Parts categories">${categories.map((category, index) => `<button data-category="${category}" aria-pressed="${kind === category}"><span>0${index + 1}</span>${labels[category]}</button>`).join('')}</div>` : ''}
    <div class="shop-meta"><span>${kind === 'engine' ? 'Match the engine mount to your car.' : kind === 'wheels' ? 'Four wheels & tires in every set.' : 'Buy once. Repaint any owned car.'}</span><span class="shop-credit">FUNDS<b>∞</b>UNLIMITED</span></div>
    <div class="catalog-heading"><span>STOCK / DESCRIPTION</span><span>PRICE</span></div>
    <div class="item-list">${items.map((part, index) => {
      const id = `part-${part.id}`, sold = state.purchasedListings.includes(id);
      return `<article class="shop-item ${sold ? 'sold' : ''}"><span class="stock-number">${String(index + 1).padStart(2, '0')}</span><div class="part-icon ${part.kind}" ${part.color ? `style="--swatch:${part.color}"` : ''}>${partIcon(part.kind)}</div><div class="part-details"><h3>${part.name}</h3><p>${part.description}</p></div><div class="item-buy"><b>${money(part.price)}</b><button data-buy="${id}" aria-label="${sold ? 'Owned' : 'Buy'} ${part.name}${sold ? '' : ` for ${money(part.price)}`}" ${sold ? 'disabled' : ''}>${sold ? 'Owned' : 'Buy part'}</button></div></article>`;
    }).join('')}</div><small class="paper-footnote">One item per listing. Parts held in inventory until installed. Paint is reusable.</small>`;
}

export function garageMarkup(state: GameState, selectedId: string, progress: Progress) {
  const car = state.cars.find(item => item.id === selectedId);
  return `${panelHeader('WILLOW CREEK WORKSHOP', 'Build sheet', 'BAY 01')}
    <div class="garage-tabs" role="group" aria-label="Owned cars">${state.cars.map(item => `<button data-select="${item.id}" class="${item.id === selectedId ? 'selected' : ''}" aria-pressed="${item.id === selectedId}">${getShell(item.shellId).name}</button>`).join('') || '<p>No project in this bay.</p>'}</div>
    ${car ? garageContents(state, car, progress) : `<div class="empty-bay">${icon('wrench')}<h3>Bring in a shell.</h3><p>Buy a car in the yard. Then collect its engine, wheels, and paint from the salvage racks or Holloway Auto Parts.</p></div><button class="primary" data-action="close">Back to the yard ${icon('arrow')}</button>`}`;
}

function garageContents(state: GameState, car: OwnedCar, progress: Progress) {
  const shell = getShell(car.shellId), issues = buildIssues(state, car), style = styleFor(progress, car.id);
  const slot = (kind: 'engine' | 'wheels') => {
    const current = getPart(state, kind === 'engine' ? car.engineId : car.wheelsId);
    const inventory = availableInventory(state, kind).sort((a, b) => Number(kind === 'engine' && getPart(state, a.id)?.mount !== shell.mount) - Number(kind === 'engine' && getPart(state, b.id)?.mount !== shell.mount));
    return `<section class="build-slot" data-slot="${kind}"><div class="slot-heading"><span class="slot-number">${kind === 'engine' ? '01' : '02'}</span><span>${kind === 'engine' ? 'ENGINE' : 'WHEELS & TIRES'}</span><b>${kind === 'engine' ? `${shell.mount} MOUNT` : 'UNIVERSAL'}</b></div>
      <h3 tabindex="-1">${current?.name ?? 'Not installed'}</h3><p class="fitted-note">${current ? `${kind === 'engine' ? `${current.power} hp` : `Grip ${current.grip}`} · FITTED` : 'Select a part from your loose inventory.'}</p>
      <div class="inventory">${inventory.map(instance => {
        const part = getPart(state, instance.id)!;
        const compatible = kind !== 'engine' || part.mount === shell.mount;
        return `<button data-install="${instance.id}" ${compatible ? '' : 'disabled'}><span>${part.name}<small>${compatible ? `${kind === 'engine' ? `${part.power} hp` : `Grip ${part.grip}`} · ${part.source === 'store' ? 'NEW' : 'SALVAGE'}` : `Incompatible · needs ${shell.mount}, this is ${part.mount}`}</small></span><b>${compatible ? `Install ${icon('arrow')}` : 'NO FIT'}</b></button>`;
      }).join('') || '<p class="empty">No loose parts. Visit the yard racks or Auto Parts store.</p>'}</div></section>`;
  };
  const finishes = FINISHES.map(item => {
    const open = finishUnlocked(progress, item.id), active = style.finish === item.id;
    return `<button data-finish="${item.id}" class="${active ? 'active' : ''}" aria-pressed="${active}" ${open ? '' : 'disabled'} title="${item.note}"><b>${item.name}</b><small>${open ? item.note : `${item.finds} finds`}</small></button>`;
  }).join('');
  const stripes = STRIPES.map(item => {
    const open = stripeUnlocked(progress, item.id), active = style.stripe === item.id;
    return `<button data-stripe="${item.id}" class="${active ? 'active' : ''}" aria-pressed="${active}" ${open ? '' : 'disabled'} style="--swatch:${item.color ?? 'transparent'}"><span class="stripe-chip ${item.color ? '' : 'plain'}"></span><b>${item.name}</b>${open ? '' : `<small>${MEDAL_NAME[item.medal!]} medal</small>`}</button>`;
  }).join('');
  return `<div class="work-order"><span>PROJECT</span><strong>${shell.name}</strong><span>${shell.mount} / ${shell.mass.toLocaleString()} KG</span></div>
    <div class="build-scroll">${slot('engine')}${slot('wheels')}<section class="build-slot"><div class="slot-heading"><span class="slot-number">03</span><span>PAINT</span><b>REUSABLE</b></div><div class="swatches">${state.paints.map(id => {
      const paint = PARTS.find(item => item.id === id)!;
      const selected = car.paint === paint.color;
      return `<button data-paint="${id}" class="${selected ? 'active' : ''}" style="--swatch:${paint.color}" title="${paint.name}" aria-label="Apply ${paint.name}" aria-pressed="${selected}"><span class="paint-chip">${selected ? icon('check') : ''}</span><b>${paint.name}</b></button>`;
    }).join('') || '<p class="empty">Pick up a color at the yard or Auto Parts store.</p>'}</div></section>
    <section class="build-slot" data-slot="finish"><div class="slot-heading"><span class="slot-number">04</span><span>FINISH &amp; STRIPES</span><b>EARNED</b></div>
      <p class="fitted-note">Finds from around the yard and town unlock finishes. Medals on the test loop unlock stripes.</p>
      <div class="finish-options" role="group" aria-label="Paint finish">${finishes}</div><div class="stripe-options" role="group" aria-label="Stripes">${stripes}</div></section></div>
    <div class="build-status ${issues.length ? 'incomplete' : 'ready'}">${icon(issues.length ? 'warning' : 'check')}<div><b>${issues.length ? 'BUILD INCOMPLETE' : 'READY FOR THE ROAD'}</b><p>${issues.length ? issues.join(' ') : '<span class="desktop-only">Close the sheet. Press E beside the car to drive.</span><span class="touch-only">Close the sheet. Walk beside the car and tap Enter car.</span>'}</p></div></div>
    <button class="primary" data-action="close">Back to the Garage ${icon('arrow')}</button><small class="paper-footnote">Swapping a part returns the old one to inventory.</small>`;
}

/** Fixed structure for the lap card. The game writes the changing numbers into the marked spans. */
export function routeMarkup() {
  return `<span class="route-arrow">${icon('route')}</span><div><b id="route-title">TEST-DRIVE ROUTE</b><span><span id="route-detail">CHECK 01 / 07</span><strong id="route-distance"></strong></span><span class="route-times"><span id="route-timer" class="route-timer">0:00.0</span><span id="route-best"></span></span></div>`;
}

export interface BannerOptions { kicker: string; title: string; detail?: string; tone?: 'gold' | 'silver' | 'bronze' | 'find' | 'plain'; glyph?: 'medal' | 'find' | 'check' | 'paint' }
export function bannerMarkup(options: BannerOptions) {
  return `<div class="banner-card ${options.tone ?? 'plain'}">${icon(options.glyph ?? 'check')}<div><span class="eyebrow">${options.kicker}</span><b>${options.title}</b>${options.detail ? `<small>${options.detail}</small>` : ''}</div></div>`;
}

/** Four stamps on the job note: what the selected car still needs. */
export function jobStepsMarkup(steps: { label: string; done: boolean }[]) {
  return steps.map(step => `<li class="${step.done ? 'done' : ''}">${step.done ? icon('check') : ''}<span>${step.label}</span></li>`).join('');
}
