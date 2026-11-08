import * as THREE from 'three';
import { createLighting } from './render/lighting';
import RAPIER from '@dimforge/rapier3d-compat';
import { SHELLS, getShell, type ShellId, type PartKind, type PartSource } from './game/catalog';
import { loadGame, saveGame, newGame, purchase, install, paintCar, getPart, buildIssues, type GameState } from './game/state';
import { createCar, type CarVisual } from './render/cars';
import { createWorld } from './render/world';
import { generateTown } from './world/layout';
import { Vehicle, FIXED_DT } from './physics/vehicle';
import { Character } from './physics/character';
import { GameAudio } from './ui/audio';
import { appMarkup, pauseMarkup, resetMarkup, inspectionMarkup, shopMarkup, garageMarkup, routeMarkup } from './ui/templates';
import { renderOverlay, containTab } from './ui/focus';
import { TouchControls } from './ui/touch';
import { touchMarkup } from './ui/touch-markup';
import './ui/fonts.css';
import './style.css';
import './ui/touch.css';

const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML=appMarkup+touchMarkup;
document.body.dataset.screen='intro';
const TOUCH_PREFERENCE='junkyard-drivers-touch-controls';
let touchEnabled=navigator.maxTouchPoints>0||matchMedia('(pointer: coarse)').matches;
try{const preference=localStorage.getItem(TOUCH_PREFERENCE);if(preference==='on'||preference==='off')touchEnabled=preference==='on';}catch{/* Controls still work when device preferences cannot be stored. */}
document.body.dataset.input=touchEnabled?'touch':'desktop';
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const canvas=$<HTMLCanvasElement>('world'), menu=$('menu'), panel=$('panel');
let state:GameState=loadGame();
let selectedId=state.cars[0]?.id??'';
let mode:'foot'|'drive'='foot';
let paused=true, panelKind:'none'|'inspect'|'rack'|'garage'='none',started=false,dragMode=false;
let yaw=0,pitch=0,dragging=false;
let vehicle:Vehicle|undefined,drivenVisual:CarVisual|undefined;
let parked:CarVisual|undefined,parkedCollider:RAPIER.Collider|undefined;
let inspectListing='',rackKind:PartKind='engine',rackSource:PartSource='yard';
let lighting:ReturnType<typeof createLighting>;
let scene:THREE.Scene, camera:THREE.PerspectiveCamera,renderer:THREE.WebGLRenderer,world:RAPIER.World;
let walker:Character,character:RAPIER.RigidBody,characterCollider:RAPIER.Collider;
let worldView:ReturnType<typeof createWorld>;
let layout:ReturnType<typeof generateTown>;
let accumulator=0,lastTime=0,toastUntil=0,lapIndex=0,lapStarted=0,lapComplete=false,lapElapsed=0;
let activeTarget:Target|undefined;
const keys=new Set<string>(),audio=new GameAudio();
const shellViews=new Map<ShellId,{visual:CarVisual,collider:RAPIER.Collider}>();
const shellPositions:Record<ShellId,THREE.Vector3>={hachiro:new THREE.Vector3(-15,.72,12),bison:new THREE.Vector3(-15,.72,1),veloce:new THREE.Vector3(-38,.72,-23)};
const BAY=new THREE.Vector3(-20,.8,-13);
const tmp=new THREE.Vector3(),direction=new THREE.Vector3(),q=new THREE.Quaternion();
const touch=new TouchControls({
 root:$('touch-controls'),canvas,
 onLook:(dx,dy)=>{if(paused||mode!=='foot')return;yaw-=dx*.0042;pitch=Math.max(-1.2,Math.min(1.2,pitch-dy*.0042));},
 onInteract:()=>{if(!paused)interact();},
 actions:[{element:$<HTMLButtonElement>('pause-button'),onActivate:pause},{element:$<HTMLButtonElement>('recover'),onActivate:recover}],
});
touch.setContext({enabled:touchEnabled,paused,mode});
interface Target {id:string;kind:'workbench'|'listing'|'rack'|'store'|'car';position:THREE.Vector3;label:string;listingId?:string}
function notify(message:string){$('toast').textContent=message;$('toast').classList.add('visible');toastUntil=performance.now()+4200;}
function clearInputs(){keys.clear();dragging=false;touch.reset();}
function syncUiScreen(){document.body.dataset.screen=panelKind!=='none'?panelKind:!started?'intro':paused?'pause':mode;document.body.dataset.input=touchEnabled?'touch':'desktop';touch.setContext({enabled:touchEnabled,paused,mode});}
function resizeGraphics(){if(!renderer)return;const width=app.clientWidth||innerWidth,height=app.clientHeight||innerHeight;renderer.setPixelRatio(Math.min(devicePixelRatio,lighting?.quality==='compatible'?.6:touchEnabled?1.25:1.5));camera.aspect=width/height;camera.updateProjectionMatrix();renderer.setSize(width,height);lighting?.resize(width,height);}
function selectedCar(){return state.cars.find(c=>c.id===selectedId);}
function commit(next:GameState){state=next;const saved=saveGame(state);$('save-status').textContent=saved?'LOGBOOK SAVED':'SAVE UNAVAILABLE · KEEP THIS TAB OPEN';if(!saved)notify('Browser storage is unavailable. Progress will last only in this tab.');audio.click();syncCars();updateObjective();}
function updateObjective(){let message='Inspect the salvage cars. Choose a shell.';const car=selectedCar();if(state.cars.length){if(car&&buildIssues(state,car).length)message='Find parts at the yard racks or AUTO PARTS. Install them at the Garage.';else message=mode==='drive'?'Follow the amber arrows through Willow Creek. Return to the Garage.':touchEnabled?'Your car is ready. Walk to its Garage bay and tap Enter car.':'Your car is ready. Walk to its Garage bay and press E.';}if(lapComplete)message=touchEnabled?'Loop complete. Return to the Garage, stop, then tap Exit car.':'Loop complete. Back at the Garage, stop and press E to make changes.';$('objective').querySelector('p')!.textContent=message;}
function syncCars(){
  for(const shell of SHELLS){const owned=state.cars.some(c=>c.shellId===shell.id),view=shellViews.get(shell.id);if(view){view.visual.group.visible=!owned;view.collider.setEnabled(!owned);}}
  worldView.updateListings(state.purchasedListings);
  if(parked){scene.remove(parked.group);disposeCar(parked);parked=undefined;}
  if(parkedCollider){world.removeCollider(parkedCollider,true);parkedCollider=undefined;}
  const car=selectedCar();if(car&&mode==='foot'){
    parked=createCar(car.shellId,{paint:car.paint,restored:buildIssues(state,car).length===0,wheels:!!car.wheelsId});parked.group.position.copy(BAY);parked.group.rotation.y=Math.PI;scene.add(parked.group);
    parkedCollider=world.createCollider(RAPIER.ColliderDesc.cuboid(.95,.65,2.25).setTranslation(BAY.x,BAY.y+.25,BAY.z));
  }
}
function disposeCar(visual:CarVisual){visual.dispose();}
function pause(){if(!started)return;paused=true;clearInputs();document.exitPointerLock?.();panel.hidden=true;panelKind='none';menu.hidden=false;syncUiScreen();renderOverlay(menu,pauseMarkup(!audio.muted,!$('route').dataset.disabled,state.cars.length,touchEnabled),'[data-action="resume"]');}
async function resume(){started=true;paused=false;menu.hidden=true;panel.hidden=true;panelKind='none';clearInputs();syncUiScreen();canvas.focus({preventScroll:true});audio.start();if(touchEnabled){dragMode=true;return;}try{await canvas.requestPointerLock();if(paused||touchEnabled){document.exitPointerLock?.();return;}dragMode=false;}catch{dragMode=true;if(!paused)notify('Mouse capture unavailable. Hold the left mouse button to look. WASD to move.');}}
function openPanel(kind:typeof panelKind){paused=true;clearInputs();panelKind=kind;document.exitPointerLock?.();menu.hidden=true;panel.innerHTML='';panel.scrollTop=0;panel.hidden=false;syncUiScreen();}
function closePanel(){void resume();}
function renderInspect(listingId:string){inspectListing=listingId;panel.className='inspect-panel';delete panel.dataset.source;renderOverlay(panel,inspectionMarkup(state,listingId));}
function renderRack(){panel.className='shop-panel';panel.dataset.source=rackSource;renderOverlay(panel,shopMarkup(state,rackSource,rackKind));}
function renderGarage(){panel.className='garage-panel';delete panel.dataset.source;renderOverlay(panel,garageMarkup(state,selectedId));}

function interact(){if(mode==='drive'){exitCar();return;}if(!activeTarget)return;const t=activeTarget;if(t.kind==='listing'){openPanel('inspect');renderInspect(t.listingId!);}else if(t.kind==='store'){rackSource='store';rackKind='engine';openPanel('rack');renderRack();}else if(t.kind==='rack'){rackSource='yard';rackKind=t.id==='rack-engines'?'engine':t.id==='rack-wheels'?'wheels':'paint';openPanel('rack');renderRack();}else if(t.kind==='workbench'){openPanel('garage');renderGarage();}else enterCar();}
function enterCar(){const car=selectedCar();if(!car)return;const issues=buildIssues(state,car);if(issues.length){notify(`Not drivable yet. ${issues.join(' ')} Use the workbench.`);return;}const shell=getShell(car.shellId);mode='drive';syncCars();vehicle=new Vehicle(world,{mass:shell.mass,power:getPart(state,car.engineId)!.power!,grip:getPart(state,car.wheelsId)!.grip!});drivenVisual=createCar(car.shellId,{paint:car.paint,restored:true,wheels:true});scene.add(drivenVisual.group);characterCollider.setEnabled(false);clearInputs();lapIndex=0;lapComplete=false;lapStarted=0;lapElapsed=0;$('speed').hidden=false;$('recover').hidden=false;$('crosshair').hidden=true;updateObjective();syncUiScreen();notify(touchEnabled?'Left pad steers · hold the accelerator to pull away · brake to stop or reverse':'W to pull away · A / D steer · S brake / reverse · R recover');}
function exitCar(){if(!vehicle)return;if(Math.abs(vehicle.speed)>1){notify(touchEnabled?'Stop before getting out. Release the accelerator and hold Brake.':'Stop the car before getting out. Hold S to brake.');return;}const p=vehicle.body.translation();if(Math.hypot(p.x+20,p.z+6)>22){notify(touchEnabled?'Return to the Garage apron to exit, or tap Recover to Garage.':'Return to the Garage apron to exit. R recovers the car there.');return;}vehicle.dispose();vehicle=undefined;if(drivenVisual){scene.remove(drivenVisual.group);disposeCar(drivenVisual);drivenVisual=undefined;}mode='foot';walker.teleport({x:-24,y:1,z:-6});characterCollider.setEnabled(true);yaw=0;pitch=0;syncCars();clearInputs();$('speed').hidden=true;$('recover').hidden=true;$('route').hidden=true;$('crosshair').hidden=false;updateObjective();syncUiScreen();notify(touchEnabled?'Car parked in the bay. Walk to the workbench and tap Open to change your build.':'Car parked in the bay. E at the workbench to change your build.');}
function recover(){if(!vehicle)return;vehicle.recover();clearInputs();lapIndex=0;lapStarted=0;lapComplete=false;lapElapsed=0;updateObjective();notify(touchEnabled?'Recovered to the Garage apron. Tap Exit car to get out.':'Recovered to the Garage apron. Stop and press E to exit.');}
function targets():Target[]{const list:Target[]=worldView.interactables as Target[];const cars= SHELLS.filter(s=>!state.cars.some(c=>c.shellId===s.id)).map(s=>({id:`shell-${s.id}`,kind:'listing' as const,listingId:`shell-${s.id}`,position:shellPositions[s.id].clone().add(new THREE.Vector3(0,.3,0)),label:s.name}));return [...list,...cars,...(selectedCar()?[{id:'garage-car',kind:'car' as const,position:BAY,label:`${getShell(selectedCar()!.shellId).name} · ${buildIssues(state,selectedCar()!).length?'incomplete build':'drive'}`}]:[])];}
function updateTarget(){activeTarget=undefined;let nearest=Infinity;camera.getWorldDirection(direction);for(const t of targets()){tmp.copy(t.position).sub(camera.position);const dist=tmp.length(),dot=tmp.normalize().dot(direction);if(dist<4.8&&dot>.25&&dist<nearest){nearest=dist;activeTarget=t;}}const hint=$('hint');hint.hidden=paused||mode==='drive'||!activeTarget;if(activeTarget)hint.innerHTML=`<kbd>E</kbd><span>${activeTarget.kind==='listing'?'Inspect':(activeTarget.kind==='rack'||activeTarget.kind==='store')?'Browse':activeTarget.kind==='workbench'?'Open':''} ${activeTarget.label}</span>`;
 if(mode==='drive'&&vehicle){const p=vehicle.body.translation(),nearGarage=Math.hypot(p.x+20,p.z+6)<22,stopped=Math.abs(vehicle.speed)<=1;touch.setAction({label:'Exit car',detail:!nearGarage?'Return to the Garage':!stopped?'Brake to a stop':'Park in the Garage bay',enabled:nearGarage&&stopped});}
 else if(activeTarget){const t=activeTarget;touch.setAction({label:t.kind==='listing'?'Inspect':t.kind==='rack'||t.kind==='store'?'Browse':t.kind==='workbench'?'Open':'Enter car',detail:t.label,enabled:true});}
 else touch.setAction({label:'Interact',detail:'Look towards a nearby item',enabled:false});
}
function updateLap(){if(!vehicle||$('route').dataset.disabled){$('route').hidden=true;return;}const position=vehicle.body.translation();const points=layout.loop;const target=points[lapIndex%points.length];if(Math.hypot(position.x-target.x,position.z-target.z)<12&&!lapComplete){if(!lapStarted)lapStarted=performance.now();lapIndex++;if(lapIndex>=points.length){lapComplete=true;lapElapsed=(performance.now()-lapStarted)/1000;notify(`Test loop complete · ${lapElapsed.toFixed(1)} seconds. Return to the Garage.`);updateObjective();}}
$('route').hidden=false;const next=points[lapIndex%points.length];const markup=routeMarkup(lapComplete,Math.min(lapIndex+1,points.length),points.length,Math.round(Math.hypot(position.x-next.x,position.z-next.z)));if($('route').dataset.content!==markup){$('route').innerHTML=markup;$('route').dataset.content=markup;}}
function step(){if(mode==='foot'){
 const forward=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0);
 const right=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0);
 tmp.set(right,0,-forward);if(tmp.lengthSq()>0)tmp.normalize().multiplyScalar(keys.has('ShiftLeft')?6:3.6);tmp.x+=touch.input.moveX*6;tmp.z-=touch.input.moveForward*6;tmp.clampLength(0,keys.has('ShiftLeft')||touch.input.moveX||touch.input.moveForward?6:3.6);tmp.applyAxisAngle(THREE.Object3D.DEFAULT_UP,yaw);
 walker.move(tmp,FIXED_DT);
}else if(vehicle){const forward=Math.max(keys.has('KeyW')||keys.has('ArrowUp')?1:0,touch.input.throttle),back=Math.max(keys.has('KeyS')||keys.has('ArrowDown')?1:0,touch.input.brake);const brake=back>0&&(vehicle.speed>1||forward>0);vehicle.update({throttle:brake?0:back>0?-.55*back:forward,steer:THREE.MathUtils.clamp((keys.has('KeyA')||keys.has('ArrowLeft')?1:0)-(keys.has('KeyD')||keys.has('ArrowRight')?1:0)+touch.input.steer,-1,1),brake,handbrake:keys.has('Space')||touch.input.handbrake});}
 world.step();
}
function updateCamera(dt:number){if(panelKind==='garage'&&selectedCar()){const angle=-.7;const target=new THREE.Vector3(BAY.x-5.9,BAY.y+3.1,BAY.z+6.8);camera.position.lerp(target,1-Math.exp(-dt*6));camera.lookAt(BAY.x+2.9,BAY.y+.4,BAY.z+1.8);void angle;
}else if(mode==='foot'){const p=character.translation();camera.position.set(p.x,p.y+.67,p.z);camera.rotation.set(pitch,yaw,0,'YXZ');
}else if(vehicle&&drivenVisual){const p=vehicle.body.translation(),r=vehicle.body.rotation();drivenVisual.group.position.set(p.x,p.y,p.z);drivenVisual.group.quaternion.set(r.x,r.y,r.z,r.w);drivenVisual.animateWheels(vehicle.steering,vehicle.wheelAngle,[0,1,2,3].map(i=>-.08-(vehicle!.controller.wheelSuspensionLength(i)??.27)));
 q.set(r.x,r.y,r.z,r.w);tmp.set(0,3.4,7.4).applyQuaternion(q);tmp.y=Math.max(2.8,tmp.y);tmp.add(new THREE.Vector3(p.x,p.y,p.z));camera.position.lerp(tmp,1-Math.exp(-dt*7));direction.set(0,.6,-4.5).applyQuaternion(q).add(new THREE.Vector3(p.x,p.y,p.z));camera.lookAt(direction);}}
function frame(time:number){const dt=Math.min((time-lastTime)/1000,.25)||.016;lastTime=time;if(!paused){accumulator+=dt;while(accumulator>=FIXED_DT){step();accumulator-=FIXED_DT;}}else accumulator=0;updateCamera(dt);if(!paused){updateTarget();if(vehicle){const speed=Math.round(Math.abs(vehicle.speed)*3.6);$('speed').querySelector('strong')!.textContent=String(speed).padStart(2,'0');$('speed').style.setProperty('--needle',`${-90+Math.min(speed/160,1)*180}deg`);$('motion-state').textContent=vehicle.speed<-.3?'REVERSE':Math.abs(vehicle.speed)<.3?'IDLE':'DRIVE';updateLap();if(vehicle.body.translation().y<-10)recover();}}else{$('hint').hidden=true;}$('crosshair').style.opacity=paused?'0':'1';audio.update(vehicle?.speed??0,mode==='drive'&&!paused,keys.has('KeyW')||touch.input.throttle>0);if(time>toastUntil)$('toast').classList.remove('visible');lighting.render(dt);requestAnimationFrame(frame);}

app.addEventListener('click',event=>{const button=(event.target as HTMLElement).closest('button');if(!button)return;const action=button.dataset.action;try{
 if(button.id==='begin'||action==='resume'){void resume();return;}if(button.id==='pause-button'){pause();return;}if(button.id==='recover'){recover();return;}
 if(action==='close'){closePanel();return;}if(action==='sound'){audio.muted=!audio.muted;pause();return;}if(action==='route'){const route=$('route');if(route.dataset.disabled)delete route.dataset.disabled;else route.dataset.disabled='1';pause();return;}
 if(action==='touch-controls'){touchEnabled=!touchEnabled;try{localStorage.setItem(TOUCH_PREFERENCE,touchEnabled?'on':'off');}catch{/* Preference is optional; controls remain usable. */}clearInputs();syncUiScreen();resizeGraphics();updateObjective();pause();return;}
 if(action==='new'){renderOverlay(menu,resetMarkup(),'[data-action="cancel-new"]');return;}
 if(action==='cancel-new'){pause();return;}if(action==='confirm-new'){if(saveGame(newGame()))location.reload();else notify('Reset could not be saved. Allow browser storage and try again. Your current collection is intact.');return;}
 if(button.dataset.category&&['engine','wheels','paint'].includes(button.dataset.category)){rackKind=button.dataset.category as PartKind;renderRack();return;}
 if(button.dataset.buy){const previous=state;commit(purchase(state,button.dataset.buy));if(!selectedId)selectedId=state.cars[0]?.id??'';updateObjective();if(previous!==state){syncCars();notify(button.dataset.buy.startsWith('shell-')?'Shell delivered to the Garage. Visit the yard racks or Auto Parts store.':'Added to your inventory.');}if(panelKind==='inspect')renderInspect(inspectListing);else renderRack();}
 if(button.dataset.select){selectedId=button.dataset.select;syncCars();updateObjective();renderGarage();}
 if(button.dataset.install){commit(install(state,selectedId,button.dataset.install));renderGarage();notify('Part installed. The previous part is back in your inventory.');}
 if(button.dataset.paint){commit(paintCar(state,selectedId,button.dataset.paint));renderGarage();notify('Paint applied.');}
 }catch(error){notify(error instanceof Error?error.message:String(error));}});
window.addEventListener('keydown',e=>{if(!paused&&['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();if(paused&&e.code==='Tab')containTab(e,panel.hidden?menu:panel);if(e.code==='Escape'){if(!menu.hidden&&panelKind==='none')return;pause();return;}if(paused)return;if(e.code==='KeyE'&&!e.repeat)interact();if(e.code==='KeyR'&&!e.repeat)recover();keys.add(e.code);});
window.addEventListener('keyup',e=>keys.delete(e.code));
document.addEventListener('mousemove',e=>{if(!touchEnabled&&!paused&&mode==='foot'&&(document.pointerLockElement===canvas||(dragMode&&dragging))){yaw-=e.movementX*.0024;pitch=Math.max(-1.2,Math.min(1.2,pitch-e.movementY*.0024));}});
canvas.addEventListener('mousedown',()=>{dragging=true;});window.addEventListener('mouseup',()=>dragging=false);
document.addEventListener('pointerlockchange',()=>{clearInputs();if(!document.pointerLockElement&&!paused&&!dragMode&&!touchEnabled)pause();});
window.addEventListener('blur',()=>{clearInputs();if(started&&!paused)pause();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&started)pause();});
window.addEventListener('resize',()=>{clearInputs();resizeGraphics();});
window.visualViewport?.addEventListener('resize',()=>{clearInputs();resizeGraphics();});
window.addEventListener('orientationchange',()=>{clearInputs();if(started&&!paused)pause();});
canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();paused=true;clearInputs();panel.hidden=true;panelKind='none';syncUiScreen();menu.hidden=false;menu.innerHTML='<section class="pause-card"><h2>Graphics connection lost.</h2><p>Your last purchases and build are saved. Reload to restart the renderer.</p><button class="primary" onclick="location.reload()">Reload game</button></section>';});
async function boot(){try{
 await RAPIER.init();world=new RAPIER.World({x:0,y:-9.81,z:0});world.timestep=FIXED_DT;
 renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,touchEnabled?1.25:1.5));renderer.setSize(app.clientWidth||innerWidth,app.clientHeight||innerHeight);
 scene=new THREE.Scene();
 camera=new THREE.PerspectiveCamera(64,innerWidth/innerHeight,.1,600);camera.rotation.order='YXZ';
 lighting=createLighting(renderer,scene,camera);
 resizeGraphics();
 layout=generateTown(state.seed);worldView=createWorld(scene,world,layout);
 walker=new Character(world,worldView.spawn);character=walker.body;characterCollider=walker.collider;
 for(const shell of SHELLS){const visual=createCar(shell.id,{restored:false,wheels:false});visual.group.position.copy(shellPositions[shell.id]);visual.group.rotation.y=shell.id==='veloce'?.25:-.12;scene.add(visual.group);const p=shellPositions[shell.id];const collider=world.createCollider(RAPIER.ColliderDesc.cuboid(.96,.65,2.25).setTranslation(p.x,p.y+.2,p.z));shellViews.set(shell.id,{visual,collider});}
 syncCars();updateObjective();world.step();$('begin').removeAttribute('disabled');$('begin').textContent=state.cars.length?'Back to the yard':'Enter the yard';$('loading').textContent='GATE OPEN · YOUR COLLECTION SAVES AUTOMATICALLY';requestAnimationFrame(frame);
 // Read-only QA observations. Browser acceptance uses players' keyboard, mouse, and touch controls.
 if(new URLSearchParams(location.search).has('qa'))Object.defineProperty(window,'__JD',{get:()=>({state:structuredClone(state),mode,paused,panelKind,position:{...(vehicle?.body.translation()??character.translation())},yaw,pitch,speed:vehicle?.speed??0,steering:vehicle?.steering??0,rotation:vehicle?{...vehicle.body.rotation()}:null,activeTarget:activeTarget?.id,lapIndex,lapComplete,lapElapsed,loop:layout.loop,roads:layout.roads,drawCalls:renderer.info.render.calls,graphicsQuality:lighting.quality,touchEnabled,touchInput:{...touch.input}})});
 }catch(error){console.error(error);menu.hidden=false;menu.innerHTML=`<section class="pause-card"><span class="eyebrow">STARTUP ERROR</span><h2>The yard couldn’t open.</h2><p>Junkyard Drivers needs WebGL 2 and WebAssembly. Enable browser graphics acceleration, then reload.</p><pre></pre><button class="primary" onclick="location.reload()">Try again</button></section>`;menu.querySelector('pre')!.textContent=error instanceof Error?error.message:String(error);}}
void boot();
