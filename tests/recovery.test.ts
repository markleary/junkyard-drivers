import { describe, expect, it } from 'vitest';
import { advanceRecovery, reconcileRecovery, unloadRecovery } from '../src/game/recovery';
import { newProgress, parseProgress, recordLap } from '../src/game/progress';
import { completeSale } from '../src/game/dealer';
import { acceptJob, beginJobLap, completeJob, recordJobLap } from '../src/game/jobs';
import { chooseRestorationRoute, startRestoration, workRestoration } from '../src/game/restoration';
import { install, newGame, parseSave, purchase } from '../src/game/state';
import { angleDelta, alignment, behind, DRAWBAR, HITCH, tow, unloadingGuide } from '../src/physics/trailer';

const fresh = newProgress();
const loaded = advanceRecovery(advanceRecovery(advanceRecovery(fresh,'lead'),'shed'),'loaded');

describe('Bell Orchard recovery', () => {
  it('requires each milestone, tolerates repeats and repairs a bad milestone independently', () => {
    expect(loaded.recovery).toBe('loaded');
    expect(advanceRecovery(fresh,'loaded')).toBe(fresh);
    expect(advanceRecovery(loaded,'shed')).toBe(loaded);
    expect(unloadRecovery(newGame(),fresh).state.cars).toEqual([]);
    expect(parseProgress(JSON.stringify({...loaded,recovery:{loaded:true},laps:4}))).toMatchObject({recovery:'unknown',laps:4});
    expect(parseProgress(JSON.stringify(loaded)).recovery).toBe('loaded');
  });

  it('repairs the interrupted receipt-first handoff and starts just one bodywork record', () => {
    const handoff = unloadRecovery(newGame(),loaded);
    const restored = parseSave(JSON.stringify(handoff.state))!;
    expect(reconcileRecovery(restored,parseProgress(JSON.stringify(loaded)))).toEqual(handoff.progress);
    expect(reconcileRecovery(restored,handoff.progress)).toBe(handoff.progress);
    expect(unloadRecovery(restored,loaded).state).toBe(restored);
    expect(unloadRecovery(restored,handoff.progress).state).toBe(restored);
    expect(reconcileRecovery(newGame(),fresh)).toBe(fresh);
  });

  it.each(['sell orchard','sell yard','deliver orchard'])('keeps separate parts, proof and bodywork across reload and %s', action => {
    let state = ['shell-courier','part-v8-stock','part-street-1','part-v8-torque','part-street-2'].reduce((s,id)=>purchase(s,id),newGame());
    state = install(install(state,'car-courier','instance-part-v8-stock'),'car-courier','instance-part-street-1');
    let progress = workRestoration(state,startRestoration(state,loaded,'car-courier'),'car-courier',.4);
    ({state,progress} = unloadRecovery(state,progress));
    state = install(install(state,'car-orchard','instance-part-v8-torque'),'car-orchard','instance-part-street-2');
    progress = workRestoration(state,progress,'car-orchard',1);
    progress = chooseRestorationRoute(state,progress,'car-orchard','patina').progress;
    progress = recordLap(recordLap(progress,'courier',64).progress,'orchard',66).progress;
    state = parseSave(JSON.stringify(state))!; progress = parseProgress(JSON.stringify(progress));
    expect(state.cars.map(c=>c.id)).toEqual(['car-courier','car-orchard']);
    expect(progress.restorations['car-orchard'].route).toBe('patina');
    expect(progress.restorations['car-courier'].work).toBe(.4);
    const remaining = action === 'sell yard' ? 'orchard' : 'courier';
    const delivered = action.startsWith('deliver');
    if (delivered) {
      progress = acceptJob({...progress,jobs:{...progress.jobs,completed:['first-wheels','sunday-v8']}},'shop-courier');
      progress = recordJobLap(state,progress,'car-orchard',66,beginJobLap(state,progress,'car-orchard'));
    }
    const sale = delivered ? completeJob(state,progress,'car-orchard') :
      completeSale(state,progress,action==='sell yard' ? 'car-courier' : 'car-orchard',42);
    const collection = parseSave(JSON.stringify(sale.state))!;
    const saved = reconcileRecovery(collection,parseProgress(JSON.stringify(sale.progress)));
    expect(saved.recovery).toBe('complete');
    expect(collection.cars).toEqual(state.cars.filter(c=>c.shellId === remaining));
    expect(collection.inventory.map(i=>i.id).sort()).toEqual([collection.cars[0].engineId,collection.cars[0].wheelsId].sort());
    expect(saved.proof).toEqual({[remaining]:progress.proof[remaining]});
    expect(Object.keys(saved.restorations)).toEqual([`car-${remaining}`]);
    expect(unloadRecovery(collection,saved).state).toBe(collection);
  });

  it('unloads by the striped trailer position even with the cab already inside the Garage', () => {
    expect(unloadingGuide(tow({x:-20,z:-10,yaw:0}))).toBeNull();
    expect(unloadingGuide({x:-20,z:12,yaw:0})).toContain('Pull ahead');
    expect(unloadingGuide({x:-20,z:-9,yaw:0})).toContain('Ease back');
    expect(unloadingGuide({x:-16,z:0,yaw:0})).toContain('Center');
    expect(unloadingGuide({x:-20,z:0,yaw:Math.PI/2})).toContain('Center');
  });

  it('rolls backward along the drawbar, articulates through a loaded turn and straightens on departure', () => {
    let truck = {x:-76,z:44,yaw:0}, axle = tow(truck), bent = 0;
    for (let i=0; i<79; i++) { truck = behind(truck,.1); axle = tow(truck,axle); }
    expect(alignment(axle,0)).toBeNull();
    expect(alignment(axle,2)).toContain('stop');
    expect(alignment({...axle,yaw:.8},0)).toContain('Straighten');
    expect(alignment({...axle,z:axle.z-9},0)).toContain('closer');
    for (let i=0;i<240;i++) {
      truck = behind({...truck,yaw:Math.min(i,90)*-.013},-.15);
      axle = tow(truck,axle);
      const hitch = behind(truck,HITCH);
      expect(Math.hypot(axle.x-hitch.x,axle.z-hitch.z)).toBeCloseTo(DRAWBAR,8);
      bent = Math.max(bent,Math.abs(angleDelta(truck.yaw-axle.yaw)));
    }
    expect(bent).toBeGreaterThan(.25); expect(Math.abs(angleDelta(truck.yaw-axle.yaw))).toBeLessThan(.01);
  });
});
