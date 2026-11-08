import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

export const FIXED_DT = 1 / 60;
export interface VehicleTuning { mass: number; power: number; grip: number }
export interface DriveInput { throttle: number; steer: number; brake: boolean; handbrake: boolean }
export class Vehicle {
  body: RAPIER.RigidBody;
  controller: RAPIER.DynamicRayCastVehicleController;
  steering = 0;
  wheelAngle = 0;
  speed = 0;
  tuning: VehicleTuning;
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
    // The visual chassis faces -Z; Rapier's axle convention makes negative force
    // travel in that direction. Distribute torque across four contact patches.
    const drag=Math.max(.18,1-Math.abs(this.speed)/45);
    const force=-input.throttle*this.tuning.power*32*drag/4;
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
    this.steering=0;this.speed=0;
  }
  dispose() {this.world.removeVehicleController(this.controller);this.world.removeRigidBody(this.body);}
}
