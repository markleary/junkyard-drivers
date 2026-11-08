import RAPIER from '@dimforge/rapier3d-compat';

/** Collision-aware walking, with gravity integrated in meters/second. */
export class Character {
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly controller: RAPIER.KinematicCharacterController;
  private verticalVelocity = 0;

  constructor(world: RAPIER.World, position: RAPIER.Vector) {
    this.body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(position.x, position.y, position.z));
    this.collider = world.createCollider(RAPIER.ColliderDesc.capsule(.55, .27), this.body);
    this.controller = world.createCharacterController(.025);
    this.controller.enableAutostep(.25, .2, false);
    this.controller.enableSnapToGround(.3);
  }

  /** Call once before world.step(). Horizontal input is velocity, not displacement. */
  move(velocity: { x: number; z: number }, dt: number) {
    // A constant -.12 m/tick used to force the capsule down at 7.2 m/s even
    // while grounded. The steep sweep caught small asphalt lips at walking
    // speed. Grounded gravity now starts from rest on each fixed step.
    this.verticalVelocity -= 9.81 * dt;
    this.controller.computeColliderMovement(this.collider, {
      x: velocity.x * dt,
      y: this.verticalVelocity * dt,
      z: velocity.z * dt,
    });
    const movement = this.controller.computedMovement();
    const position = this.body.translation();
    this.body.setNextKinematicTranslation({ x: position.x + movement.x, y: position.y + movement.y, z: position.z + movement.z });
    if (this.controller.computedGrounded()) this.verticalVelocity = 0;
  }

  /** Also resets gravity when returning to walking after a drive. */
  teleport(position: RAPIER.Vector) {
    this.body.setTranslation(position, true);
    this.body.setNextKinematicTranslation(position);
    this.verticalVelocity = 0;
  }
}
