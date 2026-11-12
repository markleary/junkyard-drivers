import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

export const FIXED_DT = 1 / 60;
export interface VehicleTuning {
  mass: number;
  power: number;
  grip: number;
  /** Turbocharger: share of engine power added at full boost, and the seconds it takes to build. */
  boost?: number;
  lag?: number;
  /** Nitrous: horsepower added while it flows, and the seconds a full bottle lasts. */
  shot?: number;
  burn?: number;
}
export interface DriveInput { throttle: number; steer: number; brake: boolean; handbrake: boolean; nitro?: boolean }
/** Seconds for an empty nitrous bottle to refill while the button is up. */
export const NITRO_REFILL = 18;
/** A bottle run dry will not fire again until it is this full, so a held button cannot stutter. */
export const NITRO_REARM = .25;
/** Boost falls away this quickly (seconds) when the throttle shuts. */
const SPOOL_DOWN = .22;
export class Vehicle {
  body: RAPIER.RigidBody;
  controller: RAPIER.DynamicRayCastVehicleController;
  steering = 0;
  wheelAngle = 0;
  speed = 0;
  tuning: VehicleTuning;
  /** Turbocharger boost, 0 (off) to 1 (full). Stays 0 without a turbo. */
  spool = 0;
  /** Nitrous left in the bottle, 0..1. */
  charge = 1;
  /** True while nitrous is flowing this step. */
  nitro = false;
  private spent = false;
  private forward = new THREE.Vector3();
  private rotation = new THREE.Quaternion();
  constructor(public world: RAPIER.World, tuning: VehicleTuning, position = {x:-20,y:1,z:-13}, yaw = Math.PI) {
    this.tuning = tuning;
    this.body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(position.x, position.y, position.z).setRotation({x:0,y:Math.sin(yaw/2),z:0,w:Math.cos(yaw/2)}).setLinearDamping(.16).setAngularDamping(1.9).setCanSleep(false).setCcdEnabled(true));
    world.createCollider(RAPIER.ColliderDesc.cuboid(.82,.24,1.96).setTranslation(0,-.06,0).setMass(tuning.mass).setFriction(.3).setRestitution(.03),this.body);
    this.controller = world.createVehicleController(this.body);
    this.controller.indexUpAxis = 1;
    this.controller.setIndexForwardAxis = 2;
    for (const [x,z] of [[-.84,-1.25],[.84,-1.25],[-.84,1.25],[.84,1.25]]) {
      this.controller.addWheel({x,y:-.08,z},{x:0,y:-1,z:0},{x:-1,y:0,z:0},.34,.36);
    }
    for (let i=0;i<4;i++) {
      this.controller.setWheelSuspensionStiffness(i,32);
      this.controller.setWheelSuspensionCompression(i,4.4);
      this.controller.setWheelSuspensionRelaxation(i,5.2);
      this.controller.setWheelMaxSuspensionTravel(i,.24);
      this.controller.setWheelMaxSuspensionForce(i,tuning.mass*10);
      this.controller.setWheelFrictionSlip(i,tuning.grip);
      this.controller.setWheelSideFrictionStiffness(i,1.25);
    }
  }
  update(input: DriveInput) {
    const q=this.body.rotation(), v=this.body.linvel();
    this.rotation.set(q.x,q.y,q.z,q.w);
    this.forward.set(0,0,-1).applyQuaternion(this.rotation);
    this.speed=v.x*this.forward.x+v.z*this.forward.z;
    const steeringLimit=.48/(1+Math.abs(this.speed)*.045);
    const target=input.steer*steeringLimit;
    this.steering+=Math.max(-.035,Math.min(.035,target-this.steering));
    // Forced induction works going forwards with the pedal down: never in reverse, never against the brake.
    const pedal=input.throttle>0&&!input.brake?Math.min(1,input.throttle):0;
    const boost=this.tuning.boost??0, shot=this.tuning.shot??0;
    if(boost>0) {
      // The turbine takes its time to wake and lets go at once.
      const time=pedal>this.spool?Math.max(.05,this.tuning.lag??.6):SPOOL_DOWN;
      this.spool+=(pedal-this.spool)*(1-Math.exp(-FIXED_DT/time));
    } else this.spool=0;
    if(shot>0) {
      if(this.charge<=0) this.spent=true;
      else if(this.spent&&this.charge>=NITRO_REARM) this.spent=false;
      this.nitro=!!input.nitro&&!this.spent&&pedal>.2&&this.speed>-.5;
      if(this.nitro) this.charge=Math.max(0,this.charge-FIXED_DT/Math.max(.5,this.tuning.burn??4));
      else if(!input.nitro) this.charge=Math.min(1,this.charge+FIXED_DT/NITRO_REFILL);
    } else this.nitro=false;
    const power=this.tuning.power*(1+boost*this.spool)+(this.nitro?shot:0);
    // The visual chassis faces -Z; Rapier's axle convention makes negative force
    // travel in that direction. Distribute torque across four contact patches.
    // Pull fades with road speed; boost and nitrous each push that fade further out.
    const reach=45+10*boost*this.spool+(this.nitro?12:0);
    const drag=Math.max(.18,1-Math.abs(this.speed)/reach);
    const force=-input.throttle*power*32*drag/4;
    const braking=input.brake ? this.tuning.mass*.015 : input.throttle===0 ? .55 : 0;
    for(let i=0;i<4;i++) {
      this.controller.setWheelSteering(i,i<2?this.steering:0);
      this.controller.setWheelEngineForce(i,force);
      this.controller.setWheelBrake(i,braking+(input.handbrake&&i>=2?this.tuning.mass*.04:0));
      this.controller.setWheelFrictionSlip(i,input.handbrake&&i>=2?this.tuning.grip*.25:this.tuning.grip);
    }
    this.controller.updateVehicle(FIXED_DT,RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC);
    this.wheelAngle += this.speed*FIXED_DT/.36;
  }
  recover(position={x:-20,y:1,z:0},yaw=Math.PI) {
    this.body.setTranslation(position,true);
    this.body.setRotation({x:0,y:Math.sin(yaw/2),z:0,w:Math.cos(yaw/2)},true);
    this.body.setLinvel({x:0,y:0,z:0},true);
    this.body.setAngvel({x:0,y:0,z:0},true);
    this.body.resetForces(true);this.body.resetTorques(true);
    this.steering=0;this.speed=0;this.spool=0;this.nitro=false;
  }
  dispose() {this.world.removeVehicleController(this.controller);this.world.removeRigidBody(this.body);}
}
