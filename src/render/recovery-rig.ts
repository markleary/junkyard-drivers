import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { createCar } from './cars';
import { SHED_VAN, type Pose } from '../world/orchard';
import { behind, tow, angleDelta } from '../physics/trailer';
import type { RecoveryStage } from '../game/progress';

export const LOANER_LOOK = { restored: true, wheels: true, paint: '#496b63' };

/** The trailer rolls around its axle. The cable, ramps and moving load all use that same local frame. */
export class RecoveryRig {
  readonly pickup = createCar('packhorse', LOANER_LOOK);
  private readonly van = createCar('orchard', { wheels: true, restored: false });
  private readonly deck = new THREE.Group();
  private readonly ramps = new THREE.Group();
  private readonly straps = new THREE.Group();
  private readonly cable: THREE.Mesh[] = [];
  private readonly truckBlock: RAPIER.Collider;
  private readonly deckBlock: RAPIER.Collider;
  private readonly vanBlock: RAPIER.Collider;
  private readonly sweep = new RAPIER.Cuboid(1.11,.22,2.27);
  truck: Pose;
  axle: Pose;
  attached = false;
  winched = 0;
  constructor(private world: RAPIER.World, scene: THREE.Scene, pose: Pose) {
    this.truck = pose; this.axle = tow(pose);
    const box = (parent: THREE.Group, x: number, y: number, z: number, w: number, h: number, d: number, color: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), new THREE.MeshStandardMaterial({ color, roughness: .8 }));
      mesh.position.set(x,y,z); mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
    };
    box(this.deck, 0,.48,-.17,2.21,.19,4.87,0x454d4c);
    for (let i = 0; i < 8; i++) box(this.deck, (i-3.5)*.264,.60,-.17,.25,.08,4.82,i%2 ? 0x967854 : 0x87704e);
    for (const side of [-1,1]) {
      box(this.deck, side*.56,.46,-3.31,.09,.12,1.89,0x515956).rotation.y = side*.58;
      box(this.deck, side*1.08,.69,-.17,.085,.14,4.92,0x687370);
      box(this.deck, side*.96,.48,2.31,.20,.11,.045,0xb23724);
      for (const z of [-.43,.43]) {
        const tire = new THREE.Mesh(new THREE.CylinderGeometry(.355,.355,.19,16), new THREE.MeshStandardMaterial({ color: 0x292a26 }));
        tire.rotation.z = Math.PI/2; tire.position.set(side*1.15,.355,z); this.deck.add(tire);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(.2,.2,.018,12),new THREE.MeshStandardMaterial({ color:0x9d9d8a }));
        hub.rotation.z = Math.PI/2; hub.position.set(side*1.255,.355,z); this.deck.add(hub);
      }
      box(this.deck, side*1.16,.77,0,.31,.09,1.63,0x697b72);
      box(this.ramps, side*.76,0,.93,.43,.075,1.86,0x84908a);
      for (let i=0; i<8; i++) box(this.ramps,side*.76,.048,.12+i*.23,.41,.025,.04,0x505956);
      for (const z of [-1.7,1.65]) box(this.straps,side*.92,.9,z,.075,.72,.07,0xd68835).rotation.z = side*.48;
    }
    box(this.deck,0,.47,-4.10,.18,.13,.33,0x8d9384);
    this.ramps.position.set(0,.60,2.24); this.deck.add(this.ramps,this.straps);
    box(this.deck,0,.80,-2.52,.55,.42,.28,0x475956);
    const cableMat = new THREE.MeshStandardMaterial({color:0x392f23, metalness:.35});
    for (let i=0;i<2;i++) {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(.031,.031,1,6),cableMat);
      this.cable.push(mesh); this.deck.add(mesh);
    }
    scene.add(this.pickup.group,this.van.group,this.deck);
    this.truckBlock = world.createCollider(RAPIER.ColliderDesc.cuboid(.97,.66,2.34));
    this.deckBlock = world.createCollider(RAPIER.ColliderDesc.cuboid(1.15,.34,2.36));
    this.vanBlock = world.createCollider(RAPIER.ColliderDesc.cuboid(.98,.73,2.25).setTranslation(SHED_VAN.x,.85,SHED_VAN.z));
  }

  park(pose: Pose, straighten = false) {
    this.truck = pose;
    if (straighten) this.axle = tow(pose);
  }

  /** Reject a fixed step if the trailer deck would enter a wall, tree trunk, or gatepost. */
  follow(truck: Pose) {
    const axle = tow(truck,this.axle);
    const rotation = { x:0, y:Math.sin(axle.yaw/2), z:0, w:Math.cos(axle.yaw/2) };
    if (this.world.intersectionWithShape({x:axle.x,y:.71,z:axle.z}, rotation, this.sweep, RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC)) return false;
    this.truck = truck; this.axle = axle;
    return true;
  }

  draw(stage: RecoveryStage, driving: boolean) {
    const loaded = stage === 'loaded', t = loaded ? 1 : this.winched;
    const { truck, axle } = this;
    const rotation = (yaw:number) => ({x:0,y:Math.sin(yaw/2),z:0,w:Math.cos(yaw/2)});

    this.truckBlock.setEnabled(!driving); this.deckBlock.setEnabled(!driving);
    if (!driving) {
      this.pickup.group.position.set(truck.x,.72,truck.z); this.pickup.group.rotation.y = truck.yaw;
      this.truckBlock.setTranslation({x:truck.x,y:.84,z:truck.z}); this.truckBlock.setRotation(rotation(truck.yaw));
      this.deckBlock.setTranslation({x:axle.x,y:.52,z:axle.z}); this.deckBlock.setRotation(rotation(axle.yaw));
    }
    this.deck.position.set(axle.x,0,axle.z); this.deck.rotation.y = axle.yaw;
    this.ramps.rotation.x = !loaded && stage === 'shed' && Math.hypot(axle.x-SHED_VAN.x,axle.z-SHED_VAN.z)<15 ? .30 : -1.46;
    this.straps.visible = loaded;
    this.vanBlock.setEnabled(!loaded && !this.attached);
    const seat = behind(axle,-.15);
    const loadPitch = .13 * Math.sin(t*Math.PI);
    this.van.group.position.set(THREE.MathUtils.lerp(SHED_VAN.x,seat.x,t), .72 + .64*t, THREE.MathUtils.lerp(SHED_VAN.z,seat.z,t));
    this.van.group.rotation.set(loadPitch, SHED_VAN.yaw+t*angleDelta(axle.yaw-SHED_VAN.yaw),0,'YXZ');
    for (const rope of this.cable) rope.visible = this.attached && !loaded;
    if (this.attached && !loaded) {
      const hook = new THREE.Vector3(0,-.08,-2.12).applyQuaternion(this.van.group.quaternion).add(this.van.group.position);
      this.deck.worldToLocal(hook);
      const start = new THREE.Vector3(0,.94,-2.49), middle = start.clone().lerp(hook,.5);
      middle.y -= .29 * Math.max(0,1-t*15);
      [start,middle].forEach((a,i) => {
        const b = i ? hook : middle, line = this.cable[i], delta = b.clone().sub(a);
        line.position.copy(a).lerp(b,.5); line.scale.y = delta.length();
        line.quaternion.setFromUnitVectors(THREE.Object3D.DEFAULT_UP,delta.normalize());
      });
    }
  }

  dispose() {
    this.pickup.dispose(); this.van.dispose(); this.deck.removeFromParent();
    const materials = new Set<THREE.Material>();
    this.deck.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); materials.add(o.material); } });
    materials.forEach(m => m.dispose());
    for (const c of [this.truckBlock,this.deckBlock,this.vanBlock]) this.world.removeCollider(c,true);
  }
}
