import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { createLighting, type GradeName, type Lighting } from './render/lighting';
import { QUALITY_LABEL } from './render/quality';
import { DEFAULT_PAINT, LISTINGS, PARTS, SHELLS, SHOP_CATEGORIES, getShell, type PartSource, type ShellId, type ShopCategory, type UpgradeKind } from './game/catalog';
import { loadGame, saveGame, newGame, purchase, install, paintCar, getPart, buildIssues, type GameState, type OwnedCar } from './game/state';
import { buildTuning, fitUpgrade, fittedUpgrades, reconcileFitted, removeUpgrade, type BuildTuning } from './game/upgrades';
import { appraise, completeSale } from './game/dealer';
import { stashLayout, type StashItem } from './game/stash';
import { FINISHES, MEDAL_TIMES, PROGRESS_KEY, STRIPES, finishUnlocked, formatLap, loadProgress, newProgress, recordDriving, recordFind, recordLap, saveProgress, setStyle, stripeUnlocked, styleFor,
  type CameraMode, type FinishId, type LightMode, type Medal, type Progress, type QualityPreference, type StripeId, type TimePreference } from './game/progress';
import { FIND_IDS, findSpots, type Find } from './game/finds';
import { advanceTrial, newTrial, runningTime, type Trial } from './game/trial';
import { createCar, type CarAppearance, type CarVisual } from './render/cars';
import { createWorld, type WorldView } from './render/world';
import { createFindMarkers, type FindMarkers } from './render/finds';
import { createStashView, type StashView } from './render/stash';
import { Effects } from './render/vfx';
import { GARAGE, YARD_BOUNDS, YARD_SPAWN, generateTown, type Point, type TownLayout } from './world/layout';
import { atDealer, dealerSite } from './world/dealer';
import { SHELL_SOLID } from './world/yard';
import { surfaceAt } from './world/surface';
import { TIME_LABEL, TIME_PRESETS, advanceHour, clockLabel } from './world/daylight';
import { Vehicle, FIXED_DT } from './physics/vehicle';
import { Drivetrain } from './physics/drivetrain';
import { Character } from './physics/character';
import { GameAudio, type EngineFamily } from './audio/audio';
import { GamepadInput } from './input/gamepad';
import { appMarkup, bannerMarkup, dealerMarkup, garageMarkup, inspectionMarkup, jobStepsMarkup, logbookMarkup, pauseMarkup, resetMarkup, routeMarkup, shopMarkup, type BannerOptions } from './ui/templates';
import { renderOverlay, containTab } from './ui/focus';
import { TouchControls } from './ui/touch';
import { touchMarkup } from './ui/touch-markup';
import { Minimap } from './ui/minimap';
import './ui/fonts.css';
import './style.css';
import './ui/touch.css';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = appMarkup + touchMarkup;
document.body.dataset.screen = 'intro';
const TOUCH_PREFERENCE = 'junkyard-drivers-touch-controls';
let touchEnabled = navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches;
try {
  const preference = localStorage.getItem(TOUCH_PREFERENCE);
  if (preference === 'on' || preference === 'off') touchEnabled = preference === 'on';
} catch { /* Controls still work when device preferences cannot be stored. */ }
document.body.dataset.input = touchEnabled ? 'touch' : 'desktop';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('world'), menu = $('menu'), panel = $('panel');
const qa = new URLSearchParams(location.search).has('qa');

// Collection and build; the purchase save format is unchanged from the first release.
let state: GameState = loadGame();
// Laps, finds, finishes and preferences live beside it under their own key.
let progress: Progress = loadProgress(undefined, FIND_IDS);
// A first visit follows the system's reduced-motion setting; after that the pause sheet's switch decides.
try {
  if (localStorage.getItem(PROGRESS_KEY) === null && matchMedia('(prefers-reduced-motion: reduce)').matches) progress = { ...progress, settings: { ...progress.settings, motion: false } };
} catch { /* Storage or media queries are unavailable: keep the defaults. */ }
const randomSeed = () => {
  try { return crypto.getRandomValues(new Uint32Array(1))[0] || 1; } catch { return Math.floor(Math.random() * 0xfffffffe) + 1; }
};
// Tuning parts are recorded against cars in the progress save; anything the collection no longer backs is dropped here.
progress = reconcileFitted(state, progress);
// The first visit decides where this game hides its rare salvage. After that the save remembers.
if (!progress.stash) { progress = { ...progress, stash: randomSeed() }; saveProgress(progress); }
/** The used-car dealer's mood: rolled when the game opens, the same until it is closed. */
const SESSION_SEED = randomSeed();
let selectedId = state.cars[0]?.id ?? '';
let mode: 'foot' | 'drive' = 'foot';
let paused = true, panelKind: 'none' | 'inspect' | 'rack' | 'garage' | 'dealer' = 'none', started = false, dragMode = false;
let yaw = 0, pitch = 0, dragging = false;
let vehicle: Vehicle | undefined, drivenVisual: CarVisual | undefined, drivetrain: Drivetrain | undefined;
/** What is fitted to the car being driven. */
let tuning: BuildTuning | undefined;
let parked: CarVisual | undefined, parkedCollider: RAPIER.Collider | undefined;
let inspectListing = '', rackKind: ShopCategory = 'engine', rackSource: PartSource = 'yard';
let stash: StashItem[] = stashLayout(progress.stash, progress.restock), stashView: StashView;
let lighting: Lighting;
let scene: THREE.Scene, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer, world: RAPIER.World;
let walker: Character, character: RAPIER.RigidBody, characterCollider: RAPIER.Collider;
let worldView: WorldView, layout: TownLayout, effects: Effects, minimap: Minimap, findMarkers: FindMarkers;
let finds: Find[] = [];
let accumulator = 0, lastTime = 0, toastUntil = 0, bannerUntil = 0, simTime = 0, seconds = 0;
let trial: Trial = newTrial();
let activeTarget: Target | undefined;
let hour = progress.settings.time === 'auto' ? progress.hour : TIME_PRESETS[progress.settings.time];
let lampsOn = false, hornHeld = false, lookBack = false, mapRange = 62;
let trauma = 0, lastSpeed = 0, strideLeft = 0, bonnet = 0, driveSaveTimer = 0, exhaustTimer = 0, orbit = 0, frameCost = 0, framesDrawn = 0;
let pendingMetres = 0, peakSpeed = 0;
// Driving feedback for the tuning parts: the last frame's pedal and boost, the view's kick under nitrous, and whether the dealer is in reach.
let pedalWas = 0, nitroWas = false, blownOff = true, boostKick = 0, flameTimer = 0, glintTimer = 0, dealerNear = false;
let qaCamera: { position: [number, number, number]; target: [number, number, number] } | undefined;
let photo: { yaw: number; pitch: number; distance: number; focus: THREE.Vector3; grade: number; savedHour: number; capture: boolean } | undefined;
const keys = new Set<string>(), audio = new GameAudio(), pad = new GamepadInput();
const shellViews = new Map<ShellId, { visual: CarVisual; collider: RAPIER.Collider }>();
// Three shells stand where they always have. The rare ones lie wherever this game's stash puts them (see placeShells).
const shellPositions: Record<ShellId, THREE.Vector3> = {
  hachiro: new THREE.Vector3(-15, .72, 12), bison: new THREE.Vector3(-15, .72, 1), veloce: new THREE.Vector3(-38, .72, -23),
  wren: new THREE.Vector3(0, .72, 0), packhorse: new THREE.Vector3(0, .72, 0),
};
const shellYaw: Record<ShellId, number> = { hachiro: -.12, bison: -.12, veloce: .25, wren: 0, packhorse: 0 };
const BAY = new THREE.Vector3(-20, .8, -13);
const tmp = new THREE.Vector3(), direction = new THREE.Vector3(), aim = new THREE.Vector3(), q = new THREE.Quaternion();
const carPosition = new THREE.Vector3(), carRight = new THREE.Vector3(), carForward = new THREE.Vector3();
const particleLight = new THREE.Color(), keyTint = new THREE.Color();
const headlights: THREE.SpotLight[] = [];
let beacon: THREE.Group | undefined;
const GRADE_NAMES: GradeName[] = ['natural', 'postcard', 'faded', 'mono'];
const GRADE_LABEL: Record<GradeName, string> = { natural: 'Natural', postcard: 'Postcard', faded: 'Faded print', mono: 'Black & white' };
const QUALITY_CYCLE: QualityPreference[] = ['auto', 'high', 'medium', 'low'];
const TIME_CYCLE: TimePreference[] = ['auto', 'morning', 'midday', 'golden', 'dusk', 'night'];
const CAMERA_CYCLE: CameraMode[] = ['chase', 'far', 'bonnet'];
const CAMERA_LABEL: Record<CameraMode, string> = { chase: 'Chase view', far: 'Wide view', bonnet: 'Bonnet view' };
const LIGHT_CYCLE: LightMode[] = ['auto', 'on', 'off'];
const MEDAL_NAME: Record<Medal, string> = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold' };

const touch = new TouchControls({
  root: $('touch-controls'), canvas,
  onLook: (dx, dy) => { if (paused || mode !== 'foot') return; yaw -= dx * .0042; pitch = Math.max(-1.2, Math.min(1.2, pitch - dy * .0042)); },
  onInteract: () => { if (!paused) interact(); },
  actions: [
    { element: $<HTMLButtonElement>('pause-button'), onActivate: pause }, { element: $<HTMLButtonElement>('recover'), onActivate: recover },
    { element: $<HTMLButtonElement>('touch-camera'), onActivate: cycleCamera }, { element: $<HTMLButtonElement>('touch-lights'), onActivate: cycleLights },
    { element: $<HTMLButtonElement>('touch-horn'), onActivate: tapHorn },
  ],
});
touch.setContext({ enabled: touchEnabled, paused, mode });

interface Target { id: string; kind: 'workbench' | 'listing' | 'rack' | 'store' | 'dealer' | 'car'; position: THREE.Vector3; label: string; listingId?: string }
const dollars = (value: number) => `$${value.toLocaleString()}`;

function notify(message: string) { $('toast').textContent = message; $('toast').classList.add('visible'); toastUntil = performance.now() + 4200; }
/** A stamped card for the moments worth marking: medals, finds, unlocks. */
function announce(options: BannerOptions, sound?: 'medal' | 'find' | 'unlock' | 'lapComplete') {
  const banner = $('banner');
  banner.innerHTML = bannerMarkup(options);
  banner.hidden = false;
  // Restart the entrance animation when one banner follows another.
  banner.classList.remove('visible'); void banner.offsetWidth; banner.classList.add('visible');
  bannerUntil = performance.now() + 4600;
  if (sound) audio.play(sound);
}
function clearInputs() {
  keys.clear(); setDragging(false); lookBack = false; touch.reset();
  if (hornHeld) { hornHeld = false; audio.horn(false); }
}
// Looking by dragging turns the camera without capturing the mouse, so the cursor hides until the button comes up.
function setDragging(on: boolean) {
  dragging = on;
  document.body.toggleAttribute('data-drag-look', on && (!!photo || (dragMode && !paused && !touchEnabled && mode === 'foot')));
}
function syncUiScreen() {
  document.body.dataset.screen = photo ? 'photo' : panelKind !== 'none' ? panelKind : !started ? 'intro' : paused ? 'pause' : mode;
  document.body.dataset.input = touchEnabled ? 'touch' : 'desktop';
  touch.setContext({ enabled: touchEnabled, paused, mode });
  audio.setPaused(paused);
}
function resizeGraphics() {
  if (!renderer || !lighting) return;
  const width = app.clientWidth || innerWidth, height = app.clientHeight || innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  lighting.resize(width, height);
  minimap?.resize();
}
function selectedCar() { return state.cars.find(car => car.id === selectedId); }
function persist() {
  progress = { ...progress, hour };
  if (!saveProgress(progress)) $('save-status').textContent = 'SAVE UNAVAILABLE · KEEP THIS TAB OPEN';
}
function commit(next: GameState) {
  state = next;
  const saved = saveGame(state);
  $('save-status').textContent = saved ? 'LOGBOOK SAVED' : 'SAVE UNAVAILABLE · KEEP THIS TAB OPEN';
  if (!saved) notify('Browser storage is unavailable. Progress will last only in this tab.');
  audio.click();
  syncCars();
  updateObjective();
}

function updateObjective() {
  let message = 'Inspect the salvage cars. Choose a shell.';
  const car = selectedCar();
  if (state.cars.length) {
    if (car && buildIssues(state, car).length) message = 'Find parts at the yard racks or AUTO PARTS. Install them at the Garage.';
    else message = mode === 'drive' ? 'Follow the amber arrows through Willow Creek. Return to the Garage.'
      : touchEnabled ? 'Your car is ready. Walk to its Garage bay and tap Enter car.' : 'Your car is ready. Walk to its Garage bay and press E.';
  }
  if (trial.complete) message = touchEnabled ? 'Loop complete. Return to the Garage, stop, then tap Exit car. Or sell it at Second Chance Motors.' : 'Loop complete. Back at the Garage, stop and press E to make changes. Or sell it at Second Chance Motors.';
  $('objective').querySelector('p')!.textContent = message;
  const engine = !!car && getPart(state, car.engineId)?.kind === 'engine', wheels = !!car && getPart(state, car.wheelsId)?.kind === 'wheels';
  $('job-steps').innerHTML = jobStepsMarkup([
    { label: 'Shell', done: !!car }, { label: 'Engine', done: engine }, { label: 'Wheels', done: wheels },
    { label: 'First drive', done: !!car && (progress.odometer[car.shellId] ?? 0) > 60 },
  ]);
}

/** How a saved car should look: fresh paint once painted or finished, its fitted engine, and any earned extras. */
function appearanceOf(car: OwnedCar): CarAppearance {
  const complete = buildIssues(state, car).length === 0, style = styleFor(progress, car.id);
  const engine = getPart(state, car.engineId), fitted = fittedUpgrades(state, progress, car.id);
  return {
    paint: car.paint, restored: complete || car.paint.toLowerCase() !== DEFAULT_PAINT[car.shellId], wheels: !!car.wheelsId,
    finish: style.finish, stripe: STRIPES.find(item => item.id === style.stripe)?.color ?? null,
    // Anything that did not come new from the counter shows its age; the uprated and rare engines carry the red covers.
    engine: engine?.kind === 'engine' ? { family: engine.mount!.toLowerCase() as EngineFamily, salvage: engine.source !== 'store', performance: engine.id.includes('performance') || !!engine.rare } : null,
    tuning: { exhaust: !!fitted.exhaust, turbo: !!fitted.turbo, nitro: !!fitted.nitro },
  };
}

/** Stand each rare shell in the hiding place this game gives it. The three display shells never move. */
function placeShells() {
  for (const item of stash) {
    if (item.kind !== 'shell') continue;
    const id = item.itemId as ShellId, view = shellViews.get(id);
    shellPositions[id].set(item.x, .72, item.z);
    shellYaw[id] = item.yaw;
    if (!view) continue;
    view.visual.group.position.copy(shellPositions[id]);
    view.visual.group.rotation.y = item.yaw;
    view.collider.setTranslation({ x: item.x, y: .92, z: item.z });
    view.collider.setRotation({ x: 0, y: Math.sin(item.yaw / 2), z: 0, w: Math.cos(item.yaw / 2) });
  }
}

function syncCars() {
  for (const shell of SHELLS) {
    const owned = state.cars.some(car => car.shellId === shell.id), view = shellViews.get(shell.id);
    if (view) { view.visual.group.visible = !owned; view.collider.setEnabled(!owned); }
  }
  stashView.sync(stash, state.purchasedListings);
  worldView.updateListings(state.purchasedListings);
  if (parked) { scene.remove(parked.group); parked.dispose(); parked = undefined; }
  if (parkedCollider) { world.removeCollider(parkedCollider, true); parkedCollider = undefined; }
  const car = selectedCar();
  if (car && mode === 'foot') {
    parked = createCar(car.shellId, appearanceOf(car));
    parked.group.position.copy(BAY); parked.group.rotation.y = Math.PI;
    parked.setBonnet(bonnet);
    scene.add(parked.group);
    parkedCollider = world.createCollider(RAPIER.ColliderDesc.cuboid(.95, .65, 2.25).setTranslation(BAY.x, BAY.y + .25, BAY.z));
  }
}

function pauseOptions() {
  return {
    soundOn: !audio.muted, routeOn: !$('route').dataset.disabled, carCount: state.cars.length, touchEnabled,
    graphics: progress.settings.quality === 'auto' ? `Auto (${QUALITY_LABEL[lighting.quality]})` : QUALITY_LABEL[lighting.quality],
    time: TIME_LABEL[progress.settings.time], motion: progress.settings.motion, map: progress.settings.map,
    finds: progress.finds.length, findTotal: finds.length, canPhoto: started,
  };
}
function pause() {
  if (!started) return;
  if (photo) leavePhoto(false);
  paused = true; clearInputs();
  document.exitPointerLock?.();
  panel.hidden = true; panelKind = 'none'; menu.hidden = false;
  syncUiScreen();
  if (vehicle) flushDriving();
  renderOverlay(menu, pauseMarkup(pauseOptions()), '[data-action="resume"]');
}
function resume() {
  started = true; paused = false;
  menu.hidden = true; panel.hidden = true; panelKind = 'none';
  clearInputs(); syncUiScreen();
  canvas.focus({ preventScroll: true });
  audio.start();
  if (touchEnabled) { dragMode = true; return; }
  dragMode = false;
  captureMouse();
}
// Desktop play captures the mouse, which hides the cursor and keeps it still while looking.
// The pointerlockchange listener handles a granted capture.
function captureMouse() {
  // Some engines return nothing here and report a refusal only as a pointerlockerror event.
  try { Promise.resolve(canvas.requestPointerLock()).catch(lookByDragging); } catch { lookByDragging(); }
}
// Capture can be refused, for example when the click that resumed play also focused the window, or just
// after Escape. Until a press on the scene captures the mouse, holding the left button looks around.
function lookByDragging() {
  if (paused || touchEnabled || dragMode) return;
  dragMode = true;
  notify('Mouse capture unavailable. Click to try again, or hold the left mouse button to look.');
}
function openPanel(kind: typeof panelKind) {
  paused = true; clearInputs(); panelKind = kind;
  document.exitPointerLock?.();
  menu.hidden = true; panel.innerHTML = ''; panel.scrollTop = 0; panel.hidden = false;
  syncUiScreen();
  audio.play('open');
}
function closePanel() { audio.play('close'); void resume(); }
function renderInspect(listingId: string) { inspectListing = listingId; panel.className = 'inspect-panel'; delete panel.dataset.source; renderOverlay(panel, inspectionMarkup(state, listingId)); }
function renderRack() { panel.className = 'shop-panel'; panel.dataset.source = rackSource; renderOverlay(panel, shopMarkup(state, rackSource, rackKind)); }
function renderGarage() { panel.className = 'garage-panel'; delete panel.dataset.source; renderOverlay(panel, garageMarkup(state, selectedId, progress)); }
/** In the car: the offer for that car. On foot at the hatch: what each car in the collection would fetch. */
function renderDealer() {
  const car = selectedCar(), driving = mode === 'drive' && !!car;
  panel.className = 'dealer-panel'; delete panel.dataset.source;
  // Focus goes to the heading, never to Sell: a key still held from driving (Space is the handbrake) would
  // otherwise press the button on its way up and sell the car unasked.
  renderOverlay(panel, dealerMarkup((driving ? [car!] : state.cars).map(item => appraise(state, progress, item, SESSION_SEED)), driving));
}

function interact() {
  if (mode === 'drive') {
    if (!dealerNear) { exitCar(); return; }
    // At the lot the same control asks for an offer instead of getting out.
    if (Math.abs(vehicle?.speed ?? 0) > 1) { notify(touchEnabled ? 'Stop the car to ask for an offer. Hold Brake.' : 'Stop the car to ask for an offer. Hold S to brake.'); return; }
    flushDriving();
    openPanel('dealer'); renderDealer();
    return;
  }
  if (!activeTarget) return;
  const t = activeTarget;
  if (t.kind === 'listing') { openPanel('inspect'); renderInspect(t.listingId!); }
  else if (t.kind === 'store') { rackSource = 'store'; rackKind = 'engine'; openPanel('rack'); renderRack(); }
  else if (t.kind === 'rack') { rackSource = 'yard'; rackKind = t.id === 'rack-engines' ? 'engine' : t.id === 'rack-wheels' ? 'wheels' : 'paint'; openPanel('rack'); renderRack(); }
  else if (t.kind === 'workbench') { openPanel('garage'); renderGarage(); }
  else if (t.kind === 'dealer') { openPanel('dealer'); renderDealer(); }
  else enterCar();
}

function enterCar() {
  const car = selectedCar();
  if (!car) return;
  const issues = buildIssues(state, car);
  if (issues.length) { audio.play('error'); notify(`Not drivable yet. ${issues.join(' ')} Use the workbench.`); return; }
  const engine = getPart(state, car.engineId)!;
  mode = 'drive';
  bonnet = 0;
  syncCars();
  // Engine, exhaust, tires, and whatever is bolted on: one description for the physics, the gearbox and the engine note.
  tuning = buildTuning(state, progress, car);
  vehicle = new Vehicle(world, tuning);
  drivetrain = new Drivetrain(tuning.peak);
  drivenVisual = createCar(car.shellId, appearanceOf(car));
  scene.add(drivenVisual.group);
  // The beams ride with the car; they are created once so the light count never changes.
  headlights.forEach((light, index) => {
    drivenVisual!.group.add(light, light.target);
    light.position.copy(drivenVisual!.headlamps[index % drivenVisual!.headlamps.length]);
    light.target.position.set(light.position.x * .8, light.position.y - 1.1, light.position.z - 14);
  });
  // The walker waits far below the yard while the car is out. Switching its collider off is not enough by
  // itself: a collider on a kinematic body keeps blocking the car, so standing in front of the bonnet would wall it in.
  characterCollider.setEnabled(false);
  walker.teleport({ x: BAY.x, y: -60, z: BAY.z });
  clearInputs();
  trial = newTrial(); lastSpeed = 0; pendingMetres = 0; peakSpeed = 0;
  pedalWas = 0; nitroWas = false; blownOff = true; boostKick = 0; dealerNear = false;
  effects.breakSkids();
  $('speed').hidden = false; $('recover').hidden = false; $('crosshair').hidden = true;
  // The boost and nitrous gauges, and the touch button, exist only for a car that carries the parts.
  $('boost-gauge').hidden = !tuning.boost; $('nitro-gauge').hidden = !tuning.shot;
  setText('drive-keys', tuning.shot ? 'N · NITRO' : 'W / S · DRIVE');
  touch.setNitro(tuning.shot > 0);
  audio.play('enterCar');
  audio.setEngine({ family: engine.mount!.toLowerCase() as EngineFamily, power: tuning.peak, exhaust: tuning.exhaust });
  audio.play('ignition');
  // The car sits in the bay facing the door, so its tailpipes point at the back wall.
  for (const pipe of drivenVisual.exhausts) effects.emit('exhaust', BAY.x - pipe.x, BAY.y + pipe.y, BAY.z - pipe.z, 0, .4, -1.2, { count: 9, spread: .5, scale: 1.6 });
  updateObjective(); syncUiScreen();
  const nitroHint = !tuning.shot ? '' : touchEnabled ? ' · hold Nitro for a burst' : ' · hold N for nitro';
  notify((touchEnabled ? 'Left pad steers · hold the accelerator to pull away · brake to stop or reverse' : 'W to pull away · A / D steer · S brake / reverse · R recover') + nitroHint);
}

/** Bank the distance and top speed gathered since the last save. */
function flushDriving() {
  const car = selectedCar();
  if (!car || (pendingMetres < 1 && peakSpeed <= (progress.topSpeed[car.shellId] ?? 0))) return;
  progress = recordDriving(progress, car.shellId, pendingMetres, peakSpeed);
  pendingMetres = 0;
  persist();
}

function exitCar() {
  if (!vehicle) return;
  if (Math.abs(vehicle.speed) > 1) { notify(touchEnabled ? 'Stop before getting out. Release the accelerator and hold Brake.' : 'Stop the car before getting out. Hold S to brake.'); return; }
  const p = vehicle.body.translation();
  if (Math.hypot(p.x + 20, p.z + 6) > 22) { notify(touchEnabled ? 'Return to the Garage apron to exit, or tap Recover to Garage.' : 'Return to the Garage apron to exit. R recovers the car there.'); return; }
  flushDriving();
  leaveVehicle({ x: -24, y: 1, z: -6 });
  audio.play('shutdown'); audio.play('exitCar');
  updateObjective(); syncUiScreen();
  notify(touchEnabled ? 'Car parked in the bay. Walk to the workbench and tap Open to change your build.' : 'Car parked in the bay. E at the workbench to change your build.');
}

/** Take the driven car out of the world and put the driver back on their feet at `at`. */
function leaveVehicle(at: { x: number; y: number; z: number }) {
  if (!vehicle) return;
  headlights.forEach(light => { scene.add(light, light.target); light.intensity = 0; });
  vehicle.dispose(); vehicle = undefined; drivetrain = undefined; tuning = undefined;
  if (drivenVisual) { scene.remove(drivenVisual.group); drivenVisual.dispose(); drivenVisual = undefined; }
  mode = 'foot';
  walker.teleport(at);
  characterCollider.setEnabled(true);
  yaw = 0; pitch = 0; dealerNear = false; boostKick = 0;
  syncCars(); clearInputs();
  $('speed').hidden = true; $('recover').hidden = true; $('route').hidden = true; $('crosshair').hidden = false;
  touch.setNitro(false);
  if (beacon) beacon.visible = false;
  audio.setEngine(null);
}

/** Take the dealer's offer for the car that was driven onto the lot. */
function sellDrivenCar() {
  const car = selectedCar();
  if (!car || !vehicle) return;
  flushDriving();
  const shell = getShell(car.shellId), sale = completeSale(state, progress, car.id, SESSION_SEED);
  state = sale.state; progress = sale.progress;
  const saved = saveGame(state);
  persist();
  $('save-status').textContent = saved ? 'LOGBOOK SAVED' : 'SAVE UNAVAILABLE · KEEP THIS TAB OPEN';
  selectedId = state.cars[0]?.id ?? '';
  // Rare pieces that went with the car come back into the yard somewhere new.
  stash = stashLayout(progress.stash, progress.restock);
  placeShells();
  // The dealer runs the seller back to the yard gate.
  leaveVehicle({ x: YARD_SPAWN.x, y: 1, z: YARD_SPAWN.z });
  trial = newTrial();
  audio.play('sold');
  closePanel();
  updateObjective();
  announce({ kicker: 'SOLD · SECOND CHANCE MOTORS', title: dollars(sale.amount), detail: `${shell.name} · ${dollars(sale.profit)} over what you put in`, tone: 'gold', glyph: 'cash' });
  pad.rumble(220, .6);
  notify(sale.restocked.length
    ? 'Sold. The dealer ran you back to the yard gate. The rare pieces that went with the car have turned up somewhere new in the yard.'
    : 'Sold. The dealer ran you back to the yard gate. Another shell like it has come in: build it again, or try a different car.');
}

function recover() {
  if (!vehicle) return;
  vehicle.recover();
  clearInputs();
  trial = newTrial(); lastSpeed = 0;
  effects.breakSkids();
  audio.play('recover');
  updateObjective();
  notify(touchEnabled ? 'Recovered to the Garage apron. Tap Exit car to get out.' : 'Recovered to the Garage apron. Stop and press E to exit.');
}

function cycleCamera() {
  if (mode !== 'drive' || paused) return;
  const next = CAMERA_CYCLE[(CAMERA_CYCLE.indexOf(progress.settings.camera) + 1) % CAMERA_CYCLE.length];
  setPreference({ camera: next });
  audio.click();
  notify(CAMERA_LABEL[next]);
}
function cycleLights() {
  if (mode !== 'drive' || paused) return;
  const next = LIGHT_CYCLE[(LIGHT_CYCLE.indexOf(progress.settings.lights) + 1) % LIGHT_CYCLE.length];
  setPreference({ lights: next });
  audio.play('lightSwitch');
  notify(next === 'auto' ? 'Headlamps: automatic at dusk' : next === 'on' ? 'Headlamps: on' : 'Headlamps: off');
}
function tapHorn() {
  if (mode !== 'drive' || paused) return;
  audio.horn(true);
  setTimeout(() => { if (!hornHeld) audio.horn(false); }, 420);
}

function targets(): Target[] {
  const list: Target[] = worldView.interactables as Target[];
  const cars = SHELLS.filter(shell => !state.cars.some(car => car.shellId === shell.id)).map(shell => ({
    id: `shell-${shell.id}`, kind: 'listing' as const, listingId: `shell-${shell.id}`,
    position: shellPositions[shell.id].clone().add(new THREE.Vector3(0, .3, 0)), label: shell.name,
  }));
  // Rare parts still lying where the yard hides them carry the same inspection tag as a shell.
  const salvage = stashView.targets().map(item => ({ id: item.listingId, kind: 'listing' as const, listingId: item.listingId, position: item.position, label: item.label }));
  const car = selectedCar();
  return [...list, ...cars, ...salvage, ...(car ? [{ id: 'garage-car', kind: 'car' as const, position: BAY, label: `${getShell(car.shellId).name} · ${buildIssues(state, car).length ? 'incomplete build' : 'drive'}` }] : [])];
}

function updateTarget() {
  activeTarget = undefined;
  let nearest = Infinity;
  // Reach is measured from the walker's eyes and heading, never from a review or photo camera.
  const p = character.translation();
  aim.set(0, 0, -1).applyEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
  direction.set(p.x, p.y + .67, p.z);
  for (const t of targets()) {
    tmp.copy(t.position).sub(direction);
    const dist = tmp.length(), dot = tmp.normalize().dot(aim);
    if (dist < 4.8 && dot > .25 && dist < nearest) { nearest = dist; activeTarget = t; }
  }
  const hint = $('hint');
  // On foot the hint names whatever is in reach. In the car it appears only at the dealer's, once the car has slowed to pull in.
  const offer = mode === 'drive' && !!vehicle && dealerNear && Math.abs(vehicle.speed) < 6;
  hint.hidden = paused || (mode === 'drive' ? !offer : !activeTarget);
  let markup = '';
  if (offer) markup = '<kbd>E</kbd><span>Stop and ask Second Chance Motors for an offer</span>';
  else if (activeTarget) {
    const verb = activeTarget.kind === 'listing' ? 'Inspect' : (activeTarget.kind === 'rack' || activeTarget.kind === 'store') ? 'Browse' : activeTarget.kind === 'workbench' ? 'Open' : activeTarget.kind === 'dealer' ? 'Ask at' : '';
    markup = `<kbd>E</kbd><span>${verb} ${activeTarget.label}</span>`;
  }
  if (markup && hint.dataset.content !== markup) { hint.innerHTML = markup; hint.dataset.content = markup; }
  if (mode === 'drive' && vehicle) {
    const v = vehicle.body.translation(), nearGarage = Math.hypot(v.x + 20, v.z + 6) < 22, stopped = Math.abs(vehicle.speed) <= 1;
    if (dealerNear) touch.setAction({ label: 'Sell car', detail: stopped ? 'Ask Second Chance Motors' : 'Brake to a stop', enabled: stopped });
    else touch.setAction({ label: 'Exit car', detail: !nearGarage ? 'Return to the Garage' : !stopped ? 'Brake to a stop' : 'Park in the Garage bay', enabled: nearGarage && stopped });
  } else if (activeTarget) {
    const t = activeTarget;
    touch.setAction({ label: t.kind === 'listing' ? 'Inspect' : t.kind === 'rack' || t.kind === 'store' ? 'Browse' : t.kind === 'workbench' ? 'Open' : t.kind === 'dealer' ? 'Ask prices' : 'Enter car', detail: t.label, enabled: true });
  } else touch.setAction({ label: 'Interact', detail: 'Look towards a nearby item', enabled: false });
}

/** Where the map's amber marker and the roadside beacon should point. */
function destination(): Point | null {
  if (mode === 'drive') {
    if ($('route').dataset.disabled) return null;
    return trial.complete ? { x: -20, z: -2 } : layout.loop[trial.index % layout.loop.length];
  }
  const car = selectedCar();
  if (!car) return { x: shellPositions.hachiro.x, z: shellPositions.hachiro.z };
  if (!car.engineId) return { x: -35.8, z: 2 };
  if (!car.wheelsId) return { x: -35.8, z: 8 };
  return { x: BAY.x, z: BAY.z };
}

function setText(id: string, value: string) { const element = $(id); if (element.textContent !== value) element.textContent = value; }

function updateLap() {
  const route = $('route');
  if (!vehicle || route.dataset.disabled) { route.hidden = true; if (beacon) beacon.visible = false; return; }
  const position = vehicle.body.translation(), points = layout.loop, car = selectedCar()!;
  const event = advanceTrial(trial, points, position, simTime);
  if (event === 'start') audio.play('checkpoint', { pitch: .8 });
  else if (event === 'checkpoint') { audio.play('checkpoint'); pad.rumble(90, .25); }
  else if (event === 'finish') {
    const hadStripes = STRIPES.map(item => stripeUnlocked(progress, item.id));
    const result = recordLap(progress, car.shellId, trial.elapsed);
    progress = result.progress;
    flushDriving(); persist();
    notify(`Test loop complete · ${trial.elapsed.toFixed(1)} seconds. Return to the Garage.`);
    const nextMedal: Medal | null = result.medal === 'gold' ? null : result.medal === 'silver' ? 'gold' : result.medal === 'bronze' ? 'silver' : 'bronze';
    announce({
      kicker: result.improved && result.previous !== undefined ? 'NEW BEST LAP' : 'TEST LOOP COMPLETE',
      title: `${formatLap(trial.elapsed)}${result.medal ? ` · ${MEDAL_NAME[result.medal]}` : ''}`,
      detail: nextMedal ? `Next: ${MEDAL_NAME[nextMedal]} at ${formatLap(MEDAL_TIMES[car.shellId][nextMedal])}` : 'Nothing left to prove in this one.',
      tone: result.medal ?? 'plain', glyph: result.medal ? 'medal' : 'check',
    }, result.newMedal ? 'medal' : 'lapComplete');
    pad.rumble(260, .7);
    const unlocked = STRIPES.find((item, index) => !hadStripes[index] && stripeUnlocked(progress, item.id));
    if (unlocked) setTimeout(() => announce({ kicker: 'PAINT SHOP', title: `${unlocked.name} stripes unlocked`, detail: 'Apply them at the workbench.', tone: 'find', glyph: 'paint' }, 'unlock'), 4800);
    updateObjective();
  }
  route.hidden = false;
  if (!route.dataset.built) { route.innerHTML = routeMarkup(); route.dataset.built = '1'; }
  const next = points[trial.index % points.length];
  setText('route-title', trial.complete ? 'LOOP COMPLETE' : 'TEST-DRIVE ROUTE');
  setText('route-detail', trial.complete ? 'Return to the Garage' : `CHECK ${String(Math.min(trial.index + 1, points.length)).padStart(2, '0')} / ${String(points.length).padStart(2, '0')}`);
  setText('route-distance', trial.complete ? '' : `${Math.round(Math.hypot(position.x - next.x, position.z - next.z))} m`);
  setText('route-timer', formatLap(runningTime(trial, simTime)));
  const best = progress.bestLap[car.shellId];
  setText('route-best', best === undefined ? `BRONZE ${formatLap(MEDAL_TIMES[car.shellId].bronze)}` : `BEST ${formatLap(best)}`);
  route.classList.toggle('running', trial.startedAt !== null && !trial.complete);
  if (beacon) {
    const target = destination();
    beacon.visible = !!target;
    if (target) beacon.position.set(target.x, 0, target.z);
  }
}

function collectFinds(x: number, z: number, radius: number) {
  const find = findMarkers.near(x, z, radius);
  if (!find) return;
  const before = FINISHES.map(item => finishUnlocked(progress, item.id));
  progress = recordFind(progress, find.id);
  persist();
  findMarkers.collect(find.id);
  findMarkers.hang(progress.finds);
  effects.emit('sparkle', find.x, find.y + 1, find.z, 0, 1.2, 0, { count: 26, spread: .9 });
  announce({ kicker: `FOUND · ${String(progress.finds.length).padStart(2, '0')} OF ${finds.length}`, title: find.name, detail: 'Hung on the workshop wall.', tone: 'find', glyph: 'find' }, 'find');
  pad.rumble(140, .4);
  const unlocked = FINISHES.find((item, index) => !before[index] && finishUnlocked(progress, item.id));
  if (unlocked) setTimeout(() => announce({ kicker: 'PAINT SHOP', title: `${unlocked.name} finish unlocked`, detail: 'Apply it at the workbench.', tone: 'find', glyph: 'paint' }, 'unlock'), 4800);
}

function step() {
  simTime += FIXED_DT;
  if (mode === 'foot') {
    const forward = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const right = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    tmp.set(right, 0, -forward);
    if (tmp.lengthSq() > 0) tmp.normalize().multiplyScalar(keys.has('ShiftLeft') ? 6 : 3.6);
    tmp.x += (touch.input.moveX + pad.state.moveX) * 6; tmp.z += (pad.state.moveY - touch.input.moveForward) * 6;
    const analogue = touch.input.moveX || touch.input.moveForward || pad.state.moveX || pad.state.moveY;
    tmp.clampLength(0, keys.has('ShiftLeft') || analogue ? 6 : 3.6);
    tmp.applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
    walker.move(tmp, FIXED_DT);
  } else if (vehicle) {
    const forward = pedal();
    const back = Math.max(keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0, touch.input.brake, pad.state.brake);
    const brake = back > 0 && (vehicle.speed > 1 || forward > 0);
    vehicle.update({
      throttle: brake ? 0 : back > 0 ? -.55 * back : forward,
      steer: THREE.MathUtils.clamp((keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) + touch.input.steer + pad.state.steer, -1, 1),
      brake, handbrake: keys.has('Space') || touch.input.handbrake || pad.state.handbrake,
      // Nitrous: N or Shift on the keyboard, B on a controller, the Nitro button on a touch screen.
      nitro: keys.has('KeyN') || keys.has('ShiftLeft') || keys.has('ShiftRight') || pad.state.nitro || touch.input.nitro,
    });
  }
  world.step();
}

/** The accelerator from every device. The touch Nitro button counts as a full pedal, so one thumb can do both. */
function pedal() {
  return Math.max(keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0, touch.input.throttle, pad.state.throttle, touch.input.nitro ? 1 : 0);
}

/** Everything the moving car drives besides its physics: wheels, lamps, dust, smoke, sound, the lap. */
function updateDriving(dt: number) {
  if (!vehicle || !drivenVisual || !drivetrain) return;
  const p = vehicle.body.translation(), r = vehicle.body.rotation(), velocity = vehicle.body.linvel();
  q.set(r.x, r.y, r.z, r.w);
  carPosition.set(p.x, p.y, p.z);
  carForward.set(0, 0, -1).applyQuaternion(q); carRight.set(1, 0, 0).applyQuaternion(q);
  const speed = vehicle.speed, absolute = Math.abs(speed);
  const throttle = pedal();
  const braking = Math.max(keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0, touch.input.brake, pad.state.brake) > 0;
  const handbrake = keys.has('Space') || touch.input.handbrake || pad.state.handbrake;
  drivetrain.update(speed, throttle, dt);
  if (drivetrain.shifted) audio.play('gearShift', { volume: .5 });

  // Sideways travel is the measure of a slide; a locked rear axle slides whenever the car is moving.
  const lateral = velocity.x * carRight.x + velocity.z * carRight.z;
  let slip = THREE.MathUtils.clamp((Math.abs(lateral) - 1.4) / 5, 0, 1);
  if (handbrake && absolute > 3) slip = Math.max(slip, Math.min(1, absolute / 9));
  if (throttle > .8 && absolute < 3.5 && vehicle.tuning.power > 180) slip = Math.max(slip, .45);
  const ground = surfaceAt(layout, p.x, p.z), loose = ground === 'gravel' || ground === 'grass';
  let grounded = false;
  for (let i = 0; i < 4; i++) {
    const contact = vehicle.controller.wheelIsInContact(i);
    grounded = grounded || contact;
    const side = i % 2 ? .84 : -.84, along = i < 2 ? -1.25 : 1.25;
    tmp.set(side, -.08 - (vehicle.controller.wheelSuspensionLength(i) ?? .27) - .36, along).applyQuaternion(q).add(carPosition);
    const rear = i >= 2;
    effects.skid(i, tmp.x, Math.max(.062, tmp.y + .02), tmp.z, carRight.x, carRight.z, contact && !loose && rear && slip > .3 ? slip : 0);
    if (!contact || !rear) continue;
    if (loose && absolute > 2.5 && Math.random() < dt * (4 + absolute * 1.4 + slip * 20)) {
      effects.emit('dust', tmp.x, tmp.y + .12, tmp.z, -carForward.x * absolute * .25, .5, -carForward.z * absolute * .25, { spread: .5, color: ground === 'grass' ? 0x9c9a78 : 0xb9a686, scale: 1 + slip });
    } else if (!loose && slip > .35 && Math.random() < dt * slip * 46) {
      effects.emit('smoke', tmp.x, tmp.y + .1, tmp.z, velocity.x * .2, .5, velocity.z * .2, { spread: .45, scale: .8 + slip * .8 });
    }
  }
  // A working engine breathes: a puff under load, a steady wisp at idle.
  exhaustTimer -= dt;
  if (exhaustTimer <= 0) {
    exhaustTimer = throttle > .1 ? .05 : .22;
    for (const pipe of drivenVisual.exhausts) {
      tmp.copy(pipe).applyQuaternion(q).add(carPosition);
      effects.emit('exhaust', tmp.x, tmp.y, tmp.z, -carForward.x * 1.4 + velocity.x * .5, .3, -carForward.z * 1.4 + velocity.z * .5, { spread: .12, scale: .7 + throttle * .9 });
    }
  }
  updateTuningFeedback(dt, throttle, velocity);
  // A sudden loss of speed is a knock: sound, sparks, a jolt through the view and the pad.
  const loss = Math.abs(lastSpeed) - absolute;
  if (loss > 2.4 && !braking && !handbrake) {
    const force = Math.min(1, loss / 9);
    audio.play(force > .45 ? 'thud' : 'scrape', { volume: .45 + force * .55 });
    trauma = Math.min(1, trauma + .3 + force * .5);
    pad.rumble(160 + force * 140, .4 + force * .5);
    tmp.copy(carForward).multiplyScalar(Math.sign(lastSpeed || 1) * 2.1).add(carPosition);
    effects.emit('spark', tmp.x, tmp.y + .1, tmp.z, -carForward.x * 2, 2, -carForward.z * 2, { count: Math.round(6 + force * 16), spread: 1.4 });
  }
  lastSpeed = speed;

  // Lamps: automatic at dusk unless the driver has set them.
  const wantLamps = progress.settings.lights === 'on' || (progress.settings.lights === 'auto' && lighting.atmosphere.sample.night > .3);
  if (wantLamps !== lampsOn) { lampsOn = wantLamps; $('lamp-state').hidden = !lampsOn; }
  drivenVisual.setLamps({ head: lampsOn ? 1 : 0, brake: braking || handbrake ? 1 : 0, reverse: speed < -.3 ? 1 : 0 });
  const beam = lampsOn ? 26 + lighting.atmosphere.sample.night * 110 : 0;
  for (const light of headlights) light.intensity += (beam - light.intensity) * Math.min(1, dt * 8);

  drivenVisual.group.position.copy(carPosition);
  drivenVisual.group.quaternion.copy(q);
  drivenVisual.animateWheels(vehicle.steering, vehicle.wheelAngle, [0, 1, 2, 3].map(i => -.08 - (vehicle!.controller.wheelSuspensionLength(i) ?? .27)));

  pendingMetres += absolute * dt;
  peakSpeed = Math.max(peakSpeed, absolute);
  driveSaveTimer += dt;
  if (driveSaveTimer > 12) { driveSaveTimer = 0; flushDriving(); }

  const kmh = Math.round(absolute * 3.6);
  setText('gear', String(drivetrain.gear));
  const readout = $('speed').querySelector('strong')!, text = String(kmh).padStart(2, '0');
  if (readout.textContent !== text) readout.textContent = text;
  $('speed').style.setProperty('--needle', `${-90 + Math.min(kmh / 160, 1) * 180}deg`);
  $('rev-bar').dataset.revs = String(Math.round(drivetrain.rpm * 12));
  setText('motion-state', speed < -.3 ? 'REVERSE' : absolute < .3 ? 'IDLE' : 'DRIVE');
  updateLap();
  collectFinds(p.x, p.z, 3.4);
  dealerNear = atDealer(layout, p.x, p.z);
  audio.updateDrive({ rpm: drivetrain.rpm, throttle, speed, slip, surface: ground, grounded, boost: tuning?.boost ? vehicle.spool : 0, nitro: vehicle.nitro ? 1 : 0 }, dt);
  if (p.y < -10) recover();
}

/** What the turbocharger, the nitrous and an open exhaust add to a drive: gauges, flame, a kick in the view, and their sounds. */
function updateTuningFeedback(dt: number, throttle: number, velocity: { x: number; y: number; z: number }) {
  if (!vehicle || !drivenVisual || !drivetrain || !tuning) return;
  const flame = (color: number, count: number, scale: number) => {
    for (const pipe of drivenVisual!.exhausts) {
      tmp.copy(pipe).applyQuaternion(q).add(carPosition);
      effects.emit('flame', tmp.x, tmp.y, tmp.z, -carForward.x * 3.2 + velocity.x, .25, -carForward.z * 3.2 + velocity.z, { count, spread: .16, color, scale });
    }
  };
  if (tuning.boost) {
    const gauge = $('boost-gauge');
    gauge.style.setProperty('--level', vehicle.spool.toFixed(2));
    gauge.classList.toggle('full', vehicle.spool > .9);
    // Lifting off with the turbine spinning dumps the boost through the blow-off valve: once per lift.
    if (throttle > .6) blownOff = false;
    else if (!blownOff && throttle < .15 && vehicle.spool > .45) { blownOff = true; audio.play('blowoff', { volume: .5 + vehicle.spool * .5 }); }
  }
  if (tuning.shot) {
    const gauge = $('nitro-gauge'), spent = vehicle.charge <= 0 || (!vehicle.nitro && vehicle.charge < .25);
    gauge.style.setProperty('--level', vehicle.charge.toFixed(2));
    gauge.classList.toggle('firing', vehicle.nitro);
    gauge.classList.toggle('spent', spent);
    const button = $('touch-nitro');
    button.style.setProperty('--level', vehicle.charge.toFixed(2));
    if (button.dataset.spent !== String(spent)) button.dataset.spent = String(spent);
    if (vehicle.nitro && !nitroWas) {
      // The valve opens: a thump in the back, a burst of blue flame, and the view opens out.
      audio.play('nitroStart');
      trauma = Math.min(1, trauma + .22);
      pad.rumble(260, .55, .8);
      flame(0x8fd0ff, 7, 1.5);
    }
    if (vehicle.nitro) {
      flameTimer -= dt;
      if (flameTimer <= 0) { flameTimer = .035; flame(0x7fc4ff, 1, 1); }
    }
    nitroWas = vehicle.nitro;
  }
  boostKick += ((vehicle.nitro ? 1 : 0) - boostKick) * Math.min(1, dt * (vehicle.nitro ? 9 : 3.5));
  // Straight-through pipes spit unburnt fuel when the throttle snaps shut at high revs.
  if (tuning.exhaust === 'race' && pedalWas > .7 && throttle < .15 && drivetrain.rpm > .5) {
    audio.play('backfire', { volume: .55 + drivetrain.rpm * .45 });
    flame(0xffa24a, 3, 1.2);
  }
  pedalWas = throttle;
}

function updateWalking(dt: number) {
  const p = character.translation();
  // Controller look, at a steady rate regardless of frame time.
  if (pad.state.lookX || pad.state.lookY) { yaw -= pad.state.lookX * 2.6 * dt; pitch = Math.max(-1.2, Math.min(1.2, pitch - pad.state.lookY * 1.9 * dt)); }
  const moved = Math.hypot(p.x - carPosition.x, p.z - carPosition.z);
  carPosition.set(p.x, p.y, p.z);
  if (moved > .001 && moved < 1) {
    strideLeft -= moved;
    if (strideLeft <= 0) {
      const running = moved / dt > 4.6;
      strideLeft = running ? 1.25 : .82;
      audio.footstep(surfaceAt(layout, p.x, p.z), running);
    }
  }
  collectFinds(p.x, p.z, 2.2);
  // Rare parts have no beacon. From a few paces off, bare metal catches the light now and then: enough to reward a careful look.
  glintTimer -= dt;
  if (glintTimer <= 0) {
    glintTimer = 1.1 + Math.random() * .9;
    for (const item of stashView.targets()) {
      if (Math.hypot(item.position.x - p.x, item.position.z - p.z) < 13) effects.emit('sparkle', item.position.x, item.position.y + .25, item.position.z, 0, .5, 0, { count: 2, spread: .7 });
    }
  }
}

function updateCamera(dt: number) {
  const base = 64;
  let fov = base;
  if (qaCamera) {
    camera.position.set(...qaCamera.position); camera.lookAt(...qaCamera.target);
  } else if (photo) {
    const reach = photo.distance * Math.cos(photo.pitch);
    camera.position.set(photo.focus.x + Math.sin(photo.yaw) * reach, photo.focus.y + Math.sin(photo.pitch) * photo.distance, photo.focus.z + Math.cos(photo.yaw) * reach);
    camera.position.y = Math.max(.25, camera.position.y);
    camera.lookAt(photo.focus);
    fov = 50;
  } else if (!started) {
    // Before the shift starts, a slow turn around the yard gate.
    orbit += dt * .045;
    camera.position.set(-20 + Math.sin(orbit + .6) * 31, 8.5 + Math.sin(orbit * .7) * 1.6, 8 + Math.cos(orbit + .6) * 31);
    camera.lookAt(-21, 2.2, 4);
    fov = 52;
  } else if (panelKind === 'garage' && selectedCar()) {
    // Beside the bay, drifting a little so the paint catches the light.
    orbit += dt * .35;
    const sway = Math.sin(orbit) * .5;
    tmp.set(BAY.x - 5.9 + sway * .5, BAY.y + 3.1, BAY.z + 6.8 + sway);
    camera.position.lerp(tmp, 1 - Math.exp(-dt * 6));
    camera.lookAt(BAY.x + 2.9, BAY.y + .4, BAY.z + 1.8);
  } else if (mode === 'foot') {
    const p = character.translation();
    camera.position.set(p.x, p.y + .67, p.z);
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
  } else if (vehicle && drivenVisual) {
    const p = vehicle.body.translation(), r = vehicle.body.rotation(), view = progress.settings.camera, speed = Math.abs(vehicle.speed);
    q.set(r.x, r.y, r.z, r.w);
    const behind = (lookBack || pad.state.lookBack) ? -1 : 1;
    if (view === 'bonnet') {
      // Just over the roof, which is taller on some cars than others.
      tmp.set(0, Math.max(.92, drivenVisual.roofHeight + .2), -.25 * behind).applyQuaternion(q).add(direction.set(p.x, p.y, p.z));
      camera.position.copy(tmp);
      direction.set(0, .7, -9 * behind).applyQuaternion(q).add(aim.set(p.x, p.y, p.z));
    } else {
      const far = view === 'far';
      tmp.set(0, far ? 5 : 3.4, (far ? 11 : 7.4) * behind).applyQuaternion(q);
      tmp.y = Math.max(far ? 4 : 2.8, tmp.y);
      tmp.add(direction.set(p.x, p.y, p.z));
      // In and around the workshop the view ducks under the lamps and the door lintel, and stays inside the walls.
      if (Math.abs(tmp.x - GARAGE.x) < 9.6 && tmp.z < -1.2 && tmp.z > -26) {
        const cover = THREE.MathUtils.smoothstep(-tmp.z, 1.2, 5.4);
        tmp.y = THREE.MathUtils.lerp(tmp.y, Math.min(tmp.y, 3.2), cover);
        if (tmp.z < -5.8) { tmp.x = THREE.MathUtils.clamp(tmp.x, GARAGE.x - 8.3, GARAGE.x + 8.3); tmp.z = Math.max(tmp.z, -23.3); }
      }
      camera.position.lerp(tmp, 1 - Math.exp(-dt * 7));
      direction.set(0, .6, -4.5 * behind).applyQuaternion(q).add(aim.set(p.x, p.y, p.z));
    }
    camera.lookAt(direction);
    // The view opens out a little with speed, and a little more while the nitrous is flowing.
    if (progress.settings.motion) fov = base + Math.min(9, speed * .32) + boostKick * 5;
  }
  if (trauma > 0) {
    trauma = Math.max(0, trauma - dt * 1.5);
    if (progress.settings.motion && !photo && !qaCamera) {
      const shake = trauma * trauma, t = seconds * 34;
      const noise = (seed: number) => { const x = Math.sin(t * 12.9898 + seed * 78.233) * 43758.5453; return (x - Math.floor(x)) * 2 - 1; };
      camera.position.x += .16 * shake * noise(1); camera.position.y += .16 * shake * noise(2);
      camera.rotation.z += .035 * shake * noise(3);
    }
  }
  if (Math.abs(camera.fov - fov) > .05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 5); camera.updateProjectionMatrix(); }
}

function enterPhoto() {
  if (!started || panelKind !== 'none' || photo) return;
  const focus = new THREE.Vector3();
  if (vehicle) { const p = vehicle.body.translation(); focus.set(p.x, p.y + .2, p.z); }
  else if (parked && Math.hypot(character.translation().x - BAY.x, character.translation().z - BAY.z) < 14) focus.set(BAY.x, BAY.y, BAY.z);
  else { const p = character.translation(); focus.set(p.x, p.y + .5, p.z); }
  // Start from where the player was already looking.
  const away = camera.position.distanceTo(focus);
  photo = { yaw: away > .5 ? Math.atan2(camera.position.x - focus.x, camera.position.z - focus.z) : yaw, pitch: .24, distance: 8.5, focus, grade: 0, savedHour: hour, capture: false };
  paused = true; clearInputs();
  document.exitPointerLock?.();
  menu.hidden = true; panel.hidden = true;
  $('photo-bar').hidden = false;
  setText('photo-filter', GRADE_LABEL[GRADE_NAMES[0]]);
  lighting.setGrade('natural');
  syncUiScreen();
  audio.play('shutter', { volume: .4 });
}
function leavePhoto(andResume: boolean) {
  if (!photo) return;
  hour = photo.savedHour;
  lighting.atmosphere.setHour(hour);
  photo = undefined;
  $('photo-bar').hidden = true;
  lighting.setGrade('natural');
  if (andResume) void resume(); else syncUiScreen();
}
function savePhoto() {
  canvas.toBlob(blob => {
    if (!blob) { notify('The picture could not be saved.'); return; }
    const link = document.createElement('a'), stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
    link.href = URL.createObjectURL(blob);
    link.download = `junkyard-drivers-${stamp}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 4000);
  }, 'image/png');
}

function updateClock(dt: number) {
  if (!qaCamera) {
    if (progress.settings.time !== 'auto' && !photo) hour = TIME_PRESETS[progress.settings.time];
    else if (!paused) hour = advanceHour(hour, dt);
    lighting.atmosphere.setHour(hour);
  }
  const sample = lighting.atmosphere.sample;
  setText('clock', `${sample.night > .5 ? '☾' : '☀'} ${clockLabel(sample.hour)}`);
  // Unlit smoke and dust take their brightness from the hour.
  particleLight.setRGB(...sample.hemiSky).multiplyScalar(.55 * sample.hemiIntensity);
  particleLight.add(keyTint.setRGB(...sample.keyColor).multiplyScalar(sample.keyIntensity * .2));
}

function handlePad() {
  pad.poll();
  if (!pad.state.connected) return;
  if (pad.take('pause')) { if (photo) leavePhoto(true); else if (paused && started && panelKind === 'none') void resume(); else if (!paused) pause(); }
  if (pad.take('back') && paused) { if (photo) leavePhoto(true); else if (panelKind !== 'none') closePanel(); }
  if (paused) return;
  if (pad.take('interact')) interact();
  if (pad.take('recover')) recover();
  if (pad.take('camera')) cycleCamera();
  if (pad.take('lights')) cycleLights();
  if (pad.take('photo')) enterPhoto();
  if (pad.take('map')) mapRange = mapRange > 80 ? 62 : 130;
  if (mode === 'drive' && pad.state.horn !== hornHeld && !keys.has('KeyH')) { hornHeld = pad.state.horn; audio.horn(hornHeld); }
}

function frame(time: number) {
  const began = performance.now();
  const dt = Math.min((time - lastTime) / 1000, .25) || .016;
  lastTime = time; seconds += dt;
  handlePad();
  if (!paused) {
    accumulator += dt;
    while (accumulator >= FIXED_DT) { step(); accumulator -= FIXED_DT; }
  } else accumulator = 0;
  updateClock(dt);
  if (!paused) {
    if (vehicle) updateDriving(dt); else updateWalking(dt);
  }
  // The bonnet lifts while the build sheet is open, to show what is (or is not) in the bay.
  const lift = panelKind === 'garage' ? 1 : 0;
  if (bonnet !== lift) { bonnet = THREE.MathUtils.clamp(bonnet + Math.sign(lift - bonnet) * dt * 1.7, 0, 1); parked?.setBonnet(bonnet); }
  updateCamera(dt);
  if (!paused) updateTarget(); else $('hint').hidden = true;
  $('crosshair').style.opacity = paused ? '0' : '1';
  const sample = lighting.atmosphere.sample;
  const inWorkshop = Math.abs(carPosition.x + 20) < 9 && carPosition.z < -6 && carPosition.z > -24;
  const inStore = Math.abs(carPosition.x - 12) < 11 && Math.abs(carPosition.z - 14) < 10;
  // Loose sheet metal ticks in the wind among the scrap rows and fades out over the first few dozen metres beyond the fence.
  const beyondYard = Math.hypot(Math.max(YARD_BOUNDS.minX - carPosition.x, 0, carPosition.x - YARD_BOUNDS.maxX), Math.max(YARD_BOUNDS.minZ - carPosition.z, 0, carPosition.z - YARD_BOUNDS.maxZ));
  audio.updateAmbience({
    night: sample.night, indoors: mode === 'foot' && (inWorkshop || inStore) ? 1 : 0,
    wind: Math.min(1, .25 + Math.abs(vehicle?.speed ?? 0) / 30), yard: Math.max(0, 1 - beyondYard / 30),
  }, dt);
  if (time > toastUntil) $('toast').classList.remove('visible');
  if (bannerUntil && time > bannerUntil) { $('banner').classList.remove('visible'); bannerUntil = 0; }
  // Map: only when it is switched on and the world is in play.
  const showMap = progress.settings.map && !paused && started;
  if ($('minimap').hidden === showMap) { $('minimap').hidden = !showMap; if (showMap) minimap.resize(); }
  if (showMap) {
    let heading = yaw;
    if (vehicle) { const r = vehicle.body.rotation(); heading = Math.atan2(2 * (r.w * r.y + r.x * r.z), 1 - 2 * (r.x * r.x + r.y * r.y)); }
    minimap.draw({ x: carPosition.x, z: carPosition.z, heading, range: mode === 'drive' ? mapRange : mapRange * .55, target: destination(), driving: mode === 'drive' });
  }
  findMarkers.update(seconds);
  if (beacon?.visible) {
    const column = beacon.children[0] as THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
    column.scale.setScalar(1 + .1 * Math.sin(seconds * 3));
    // The column is a landmark from a distance. Up close it fades, so driving through it never washes the view.
    column.material.opacity = .16 * THREE.MathUtils.smoothstep(Math.hypot(camera.position.x - beacon.position.x, camera.position.z - beacon.position.z), 6, 20);
  }
  effects.setViewport(renderer.domElement.height, camera.fov);
  effects.update(paused ? 0 : dt, particleLight);
  worldView.update(dt, seconds, sample.night, camera.position);
  lighting.render(dt, !paused);
  if (photo?.capture) { photo.capture = false; savePhoto(); }
  // Main-thread cost of a frame (simulation, scene updates and draw submission), smoothed, for the review reports.
  frameCost += (performance.now() - began - frameCost) * .05;
  if (framesDrawn < 3) performance.mark(`jd-frame-${++framesDrawn}`);
  requestAnimationFrame(frame);
}

function setPreference(change: Partial<Progress['settings']>) {
  progress = { ...progress, settings: { ...progress.settings, ...change } };
  persist();
}

app.addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest('button');
  if (!button) return;
  const action = button.dataset.action;
  try {
    if (button.id === 'begin' || action === 'resume') { void resume(); return; }
    if (button.id === 'pause-button') { pause(); return; }
    if (button.id === 'recover') { recover(); return; }
    if (button.id === 'touch-camera') { cycleCamera(); return; }
    if (button.id === 'touch-lights') { cycleLights(); return; }
    if (button.id === 'touch-horn') { tapHorn(); return; }
    if (button.dataset.photo) {
      if (!photo) return;
      const kind = button.dataset.photo;
      if (kind === 'done') leavePhoto(true);
      else if (kind === 'save') { photo.capture = true; audio.play('shutter'); }
      else if (kind === 'filter') { photo.grade = (photo.grade + 1) % GRADE_NAMES.length; lighting.setGrade(GRADE_NAMES[photo.grade]); setText('photo-filter', GRADE_LABEL[GRADE_NAMES[photo.grade]]); }
      else { hour = (hour + (kind === 'later' ? .5 : 23.5)) % 24; lighting.atmosphere.setHour(hour); }
      return;
    }
    if (action === 'close') { closePanel(); return; }
    if (action === 'sound') { audio.muted = !audio.muted; pause(); return; }
    if (action === 'route') { const route = $('route'); if (route.dataset.disabled) delete route.dataset.disabled; else route.dataset.disabled = '1'; pause(); return; }
    if (action === 'touch-controls') {
      touchEnabled = !touchEnabled;
      try { localStorage.setItem(TOUCH_PREFERENCE, touchEnabled ? 'on' : 'off'); } catch { /* Preference is optional; controls remain usable. */ }
      clearInputs(); syncUiScreen();
      lighting.setQuality(progress.settings.quality, touchEnabled);
      resizeGraphics(); updateObjective(); pause(); return;
    }
    if (action === 'graphics') {
      const next = QUALITY_CYCLE[(QUALITY_CYCLE.indexOf(progress.settings.quality) + 1) % QUALITY_CYCLE.length];
      setPreference({ quality: next });
      lighting.setQuality(next, touchEnabled);
      pause(); return;
    }
    if (action === 'time') { setPreference({ time: TIME_CYCLE[(TIME_CYCLE.indexOf(progress.settings.time) + 1) % TIME_CYCLE.length] }); updateClock(0); pause(); return; }
    if (action === 'map') { setPreference({ map: !progress.settings.map }); pause(); return; }
    if (action === 'motion') { setPreference({ motion: !progress.settings.motion }); pause(); return; }
    if (action === 'logbook') { renderOverlay(menu, logbookMarkup(state, progress, finds, stash), '[data-action="back-to-pause"]'); audio.play('open'); return; }
    if (action === 'sell') { sellDrivenCar(); return; }
    if (action === 'back-to-pause') { pause(); return; }
    if (action === 'photo') { menu.hidden = true; enterPhoto(); return; }
    if (action === 'new') { renderOverlay(menu, resetMarkup(), '[data-action="cancel-new"]'); return; }
    if (action === 'cancel-new') { pause(); return; }
    if (action === 'confirm-new') {
      // Preferences survive a new game; everything earned does not.
      if (saveGame(newGame())) { saveProgress({ ...newProgress(), settings: progress.settings }); location.reload(); }
      else notify('Reset could not be saved. Allow browser storage and try again. Your current collection is intact.');
      return;
    }
    if (button.dataset.category && (SHOP_CATEGORIES as string[]).includes(button.dataset.category)) { rackKind = button.dataset.category as ShopCategory; audio.click(); renderRack(); return; }
    if (button.dataset.buy) {
      const previous = state, listing = button.dataset.buy;
      commit(purchase(state, listing));
      if (!selectedId) selectedId = state.cars[0]?.id ?? '';
      updateObjective();
      if (previous !== state) {
        syncCars();
        audio.play('buy');
        notify(listing.startsWith('shell-') ? 'Shell delivered to the Garage. Visit the yard racks or Auto Parts store.' : 'Added to your inventory.');
        // Something the yard was hiding: worth a stamped card of its own.
        const found = stash.find(item => item.listingId === listing);
        if (found) {
          const item = LISTINGS.find(entry => entry.id === listing)!;
          const name = item.kind === 'shell' ? getShell(item.itemId).name : PARTS.find(part => part.id === item.itemId)!.name;
          announce({ kicker: 'RARE SALVAGE', title: name, detail: item.kind === 'shell' ? 'Delivered to the Garage.' : 'Carried to the Garage. Fit it at the workbench.', tone: 'find', glyph: 'rare' }, 'find');
        }
      }
      if (panelKind === 'inspect') renderInspect(inspectListing); else renderRack();
    }
    if (button.dataset.select) { selectedId = button.dataset.select; audio.click(); syncCars(); updateObjective(); renderGarage(); }
    if (button.dataset.install) {
      const engine = getPart(state, button.dataset.install)?.kind === 'engine';
      commit(install(state, selectedId, button.dataset.install));
      renderGarage();
      audio.play(engine ? 'ratchet' : 'install');
      // Sparks at the corner being worked on: the engine bay, or the nearest wheel.
      const bay = engine ? (selectedCar()?.shellId === 'veloce' ? -1.5 : 1.3) : 1.25;
      effects.emit('spark', BAY.x + (engine ? 0 : -.9), BAY.y + (engine ? .4 : -.2), BAY.z + bay, 0, 1.6, 0, { count: 22, spread: 1.1 });
      notify('Part installed. The previous part is back in your inventory.');
    }
    if (button.dataset.paint) {
      commit(paintCar(state, selectedId, button.dataset.paint));
      renderGarage();
      audio.play('paint');
      const colour = Number.parseInt((selectedCar()?.paint ?? '#ffffff').slice(1), 16);
      effects.emit('mist', BAY.x, BAY.y + .5, BAY.z, 0, .3, 0, { count: 40, spread: 2.6, color: colour, scale: 1.4 });
      notify('Paint applied.');
    }
    if (button.dataset.fit || button.dataset.unfit) {
      const fitting = !!button.dataset.fit;
      progress = fitting ? fitUpgrade(state, progress, selectedId, button.dataset.fit!) : removeUpgrade(progress, selectedId, button.dataset.unfit as UpgradeKind);
      persist(); syncCars(); renderGarage();
      audio.play(fitting ? 'ratchet' : 'install');
      // Sparks where the work is: under the bonnet, or at the tailpipes for an exhaust.
      const exhaust = (fitting ? getPart(state, button.dataset.fit)?.kind : button.dataset.unfit) === 'exhaust';
      const rear = selectedCar()?.shellId === 'veloce';
      effects.emit('spark', BAY.x + (exhaust ? .5 : 0), BAY.y + (exhaust ? -.2 : .4), BAY.z + (exhaust ? -2 : rear ? -1.5 : 1.3), 0, 1.6, 0, { count: 18, spread: 1 });
      notify(fitting ? 'Fitted. Anything it replaced is back in your inventory.' : 'Removed. It is back in your inventory.');
    }
    if (button.dataset.finish || button.dataset.stripe) {
      progress = setStyle(progress, selectedId, button.dataset.finish ? { finish: button.dataset.finish as FinishId } : { stripe: button.dataset.stripe as StripeId });
      persist(); syncCars(); renderGarage();
      audio.play('paint');
      notify(button.dataset.finish ? 'Finish applied.' : 'Stripes updated.');
    }
  } catch (error) {
    audio.play('error');
    notify(error instanceof Error ? error.message : String(error));
  }
});

window.addEventListener('keydown', e => {
  if (!paused && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (paused && e.code === 'Tab') containTab(e, panel.hidden ? menu : panel);
  if (photo) {
    if (e.code === 'Escape' || (e.code === 'KeyP' && !e.repeat)) leavePhoto(true);
    return;
  }
  if (e.code === 'Escape') { if (!menu.hidden && panelKind === 'none') return; pause(); return; }
  if (paused) return;
  if (!e.repeat) {
    if (e.code === 'KeyE') interact();
    if (e.code === 'KeyR') recover();
    if (e.code === 'KeyC') cycleCamera();
    if (e.code === 'KeyL') cycleLights();
    if (e.code === 'KeyP') { enterPhoto(); return; }
    if (e.code === 'KeyM') { mapRange = mapRange > 80 ? 62 : 130; audio.click(); }
    if (e.code === 'KeyB') lookBack = true;
    if (e.code === 'KeyH' && mode === 'drive' && !hornHeld) { hornHeld = true; audio.horn(true); }
  }
  // Opening a panel or the pause sheet above clears held keys; do not put this one straight back.
  if (!paused) keys.add(e.code);
});
window.addEventListener('keyup', e => {
  keys.delete(e.code);
  if (e.code === 'KeyB') lookBack = false;
  if (e.code === 'KeyH' && hornHeld) { hornHeld = false; audio.horn(false); }
});
document.addEventListener('mousemove', e => {
  if (photo) {
    if (dragging) { photo.yaw -= e.movementX * .005; photo.pitch = THREE.MathUtils.clamp(photo.pitch + e.movementY * .004, -.05, 1.3); }
    return;
  }
  if (!touchEnabled && !paused && mode === 'foot' && (document.pointerLockElement === canvas || (dragMode && dragging))) {
    yaw -= e.movementX * .0024;
    pitch = Math.max(-1.2, Math.min(1.2, pitch - e.movementY * .0024));
  }
});
canvas.addEventListener('mousedown', () => {
  setDragging(true);
  // After a refused capture, a press on the scene asks again; the press is the user gesture it needs.
  if (dragMode && !paused && !touchEnabled) captureMouse();
});
window.addEventListener('mouseup', () => setDragging(false));
canvas.addEventListener('wheel', e => {
  if (!photo) return;
  e.preventDefault();
  photo.distance = THREE.MathUtils.clamp(photo.distance * Math.exp(e.deltaY * .0012), 2.6, 26);
}, { passive: false });
// Photo mode on a touch screen: one finger orbits, two fingers pinch to zoom.
const photoTouches = new Map<number, { x: number; y: number }>();
canvas.addEventListener('pointerdown', e => { if (photo && e.pointerType !== 'mouse') photoTouches.set(e.pointerId, { x: e.clientX, y: e.clientY }); });
canvas.addEventListener('pointermove', e => {
  const previous = photoTouches.get(e.pointerId);
  if (!photo || !previous) return;
  if (photoTouches.size === 1) {
    photo.yaw -= (e.clientX - previous.x) * .006;
    photo.pitch = THREE.MathUtils.clamp(photo.pitch + (e.clientY - previous.y) * .005, -.05, 1.3);
  } else {
    const other = [...photoTouches.entries()].find(([id]) => id !== e.pointerId)![1];
    const before = Math.hypot(previous.x - other.x, previous.y - other.y), after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
    if (before > 1) photo.distance = THREE.MathUtils.clamp(photo.distance * before / Math.max(1, after), 2.6, 26);
  }
  previous.x = e.clientX; previous.y = e.clientY;
});
for (const type of ['pointerup', 'pointercancel']) window.addEventListener(type, e => photoTouches.delete((e as PointerEvent).pointerId));
document.addEventListener('pointerlockchange', () => {
  clearInputs();
  if (document.pointerLockElement === canvas) {
    // A capture that lands after the game paused (or switched to touch controls) is let go at once.
    if (paused || touchEnabled) document.exitPointerLock?.(); else dragMode = false;
  } else if (!paused && !dragMode && !touchEnabled) pause();
});
document.addEventListener('pointerlockerror', lookByDragging);
window.addEventListener('blur', () => { clearInputs(); if (started && !paused) pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && started) pause(); });
window.addEventListener('resize', () => { clearInputs(); resizeGraphics(); });
window.visualViewport?.addEventListener('resize', () => { clearInputs(); resizeGraphics(); });
window.addEventListener('orientationchange', () => { clearInputs(); if (started && !paused) pause(); });
window.addEventListener('pagehide', () => { if (!lighting) return; if (vehicle) flushDriving(); else persist(); });
canvas.addEventListener('webglcontextlost', event => {
  event.preventDefault();
  paused = true; clearInputs(); panel.hidden = true; panelKind = 'none'; syncUiScreen(); menu.hidden = false;
  menu.innerHTML = '<section class="pause-card"><h2>Graphics connection lost.</h2><p>Your last purchases and build are saved. Reload to restart the renderer.</p><button class="primary" onclick="location.reload()">Reload game</button></section>';
});

/** A column of amber light over the next checkpoint, readable from the far end of a street. */
function buildBeacon() {
  const group = new THREE.Group();
  const column = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 9, 20, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: .16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  column.position.y = 4.5;
  const ring = new THREE.Mesh(new THREE.RingGeometry(4.6, 5.2, 40),
    new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = .09;
  group.add(column, ring);
  group.visible = false;
  return group;
}

async function boot() {
  try {
    // Startup phases are marked for the performance timeline (and the QA reports); they cost nothing.
    performance.mark('jd-boot');
    await RAPIER.init();
    performance.mark('jd-physics');
    world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.timestep = FIXED_DT;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, touchEnabled ? 1.25 : 1.5));
    renderer.setSize(app.clientWidth || innerWidth, app.clientHeight || innerHeight);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(64, innerWidth / innerHeight, .12, 1600);
    camera.rotation.order = 'YXZ';
    lighting = createLighting(renderer, scene, camera, { touch: touchEnabled, quality: progress.settings.quality, hour });
    performance.mark('jd-lighting');
    resizeGraphics();
    // Signs are lettered in the interface faces, so those must be ready before the world is painted.
    await Promise.race([
      Promise.all(['800 48px "Barlow Condensed"', '700 48px "Barlow Condensed"', '500 24px "IBM Plex Mono"'].map(font => document.fonts.load(font))),
      new Promise(resolve => setTimeout(resolve, 1800)),
    ]).catch(() => undefined);
    performance.mark('jd-fonts');
    layout = generateTown(state.seed);
    worldView = createWorld(scene, world, layout, lighting.settings);
    performance.mark('jd-world');
    finds = findSpots(layout);
    findMarkers = createFindMarkers(scene, finds, progress.finds, worldView.trophyPegs);
    findMarkers.hang(progress.finds);
    stashView = createStashView(scene, world);
    effects = new Effects(scene, lighting.settings.particles);
    minimap = new Minimap($<HTMLCanvasElement>('minimap-canvas'), layout);
    beacon = buildBeacon();
    scene.add(beacon);
    for (let i = 0; i < 2; i++) {
      const light = new THREE.SpotLight(0xfff1d8, 0, 46, .52, .7, 1.5);
      scene.add(light, light.target);
      headlights.push(light);
    }
    walker = new Character(world, worldView.spawn);
    character = walker.body; characterCollider = walker.collider;
    carPosition.copy(worldView.spawn);
    for (const shell of SHELLS) {
      const visual = createCar(shell.id, { restored: false, wheels: false });
      visual.group.position.copy(shellPositions[shell.id]);
      visual.group.rotation.y = shellYaw[shell.id];
      scene.add(visual.group);
      const p = shellPositions[shell.id];
      const collider = world.createCollider(RAPIER.ColliderDesc.cuboid(SHELL_SOLID.w / 2, SHELL_SOLID.h / 2, SHELL_SOLID.d / 2).setTranslation(p.x, p.y + .2, p.z));
      shellViews.set(shell.id, { visual, collider });
    }
    placeShells();
    syncCars(); updateObjective();
    world.step();
    performance.mark('jd-ready');
    $('begin').removeAttribute('disabled');
    $('begin').textContent = state.cars.length ? 'Back to the yard' : 'Enter the yard';
    $('loading').textContent = 'GATE OPEN · YOUR COLLECTION SAVES AUTOMATICALLY';
    requestAnimationFrame(frame);
    // Read-only observations and a review camera. Browser acceptance still plays through the ordinary controls.
    if (qa) {
      Object.defineProperty(window, '__JD', { get: () => ({
        state: structuredClone(state), progress: structuredClone(progress), mode, paused, panelKind,
        position: { ...(vehicle?.body.translation() ?? character.translation()) }, yaw, pitch,
        speed: vehicle?.speed ?? 0, steering: vehicle?.steering ?? 0, rotation: vehicle ? { ...vehicle.body.rotation() } : null,
        activeTarget: activeTarget?.id, lapIndex: trial.index, lapComplete: trial.complete, lapElapsed: trial.elapsed,
        loop: layout.loop, roads: layout.roads, lots: layout.lots, landmark: { ...layout.landmark }, finds,
        drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, memory: { ...renderer.info.memory }, programs: renderer.info.programs?.length ?? 0, world: worldView.stats,
        graphicsQuality: lighting.quality, hour: lighting.atmosphere.sample.hour, particles: effects.live, photo: !!photo,
        camera: progress.settings.camera, lamps: lampsOn, gear: drivetrain?.gear ?? null, rpm: drivetrain?.rpm ?? 0,
        audio: { ready: audio.ready, muted: audio.muted, clips: audio.clips, recorded: audio.recorded, engine: audio.engineSource }, frameMs: frameCost,
        touchEnabled, touchInput: { ...touch.input },
        // Where this game hides its rare salvage, what is fitted to the car being driven, and what the dealer would pay for the selected car.
        stash: stash.map(item => ({ ...item, held: state.purchasedListings.includes(item.listingId) })),
        tuning: tuning ? { ...tuning } : null, boost: vehicle?.spool ?? 0, nitro: { charge: vehicle?.charge ?? 0, active: vehicle?.nitro ?? false },
        dealer: (() => {
          const site = dealerSite(layout), car = selectedCar();
          const sheet = car ? appraise(state, progress, car, SESSION_SEED) : null;
          return { bay: site?.bay ?? null, hatch: site?.hatch ?? null, near: dealerNear, invested: sheet?.investment.total ?? 0, range: sheet?.range ?? null, offer: sheet && !sheet.issues.length ? sheet.offer : null };
        })(),
      }) });
      Object.assign(window, { __JD_QA: {
        camera(position?: [number, number, number], target?: [number, number, number]) { qaCamera = position && target ? { position, target } : undefined; },
        hour(value: number) { lighting.atmosphere.setHour(value); },
        quality(choice: QualityPreference) { lighting.setQuality(choice, touchEnabled); },
        pick(x: number, y: number) {
          const ray = new THREE.Raycaster();
          ray.setFromCamera(new THREE.Vector2(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1), camera);
          return ray.intersectObjects(scene.children, true).slice(0, 4).map(hit => ({
            distance: +hit.distance.toFixed(2), point: hit.point.toArray().map(v => +v.toFixed(2)), type: hit.object.type, name: hit.object.name,
            material: ((hit.object as THREE.Mesh).material as THREE.Material | undefined)?.name,
          }));
        },
      } });
    }
  } catch (error) {
    console.error(error);
    menu.hidden = false;
    menu.innerHTML = `<section class="pause-card"><span class="eyebrow">STARTUP ERROR</span><h2>The yard couldn’t open.</h2><p>Junkyard Drivers needs WebGL 2 and WebAssembly. Enable browser graphics acceleration, then reload.</p><pre></pre><button class="primary" onclick="location.reload()">Try again</button></section>`;
    menu.querySelector('pre')!.textContent = error instanceof Error ? error.message : String(error);
  }
}
void boot();
