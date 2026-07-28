/**
 * Rapier interaction-group memberships. Keep every gameplay category in one
 * 16-bit mask so sensors can opt into cars and dynamic toys without producing
 * solid contacts.
 */
export const enum CollisionLayer {
  Ground = 1 << 0,
  Car = 1 << 1,
  DynamicToy = 1 << 2,
  StaticObstacle = 1 << 3,
  MovingObstacle = 1 << 4,
  PortalSensor = 1 << 5,
  BoosterSensor = 1 << 6,
  ResetSensor = 1 << 7,
}

const ALL_LAYERS = 0xffff;

export const DYNAMIC_TRIGGER_TARGETS = CollisionLayer.Car | CollisionLayer.DynamicToy;

/**
 * Encodes Rapier's `(membership << 16) | filter` interaction-group layout.
 */
export function interactionGroups(membership: number, filter = ALL_LAYERS): number {
  return (((membership & ALL_LAYERS) << 16) | (filter & ALL_LAYERS)) >>> 0;
}

export const COLLISION_GROUPS = Object.freeze({
  ground: interactionGroups(CollisionLayer.Ground, CollisionLayer.Car | CollisionLayer.DynamicToy),
  car: interactionGroups(
    CollisionLayer.Car,
    CollisionLayer.Ground |
      CollisionLayer.Car |
      CollisionLayer.DynamicToy |
      CollisionLayer.StaticObstacle |
      CollisionLayer.MovingObstacle |
      CollisionLayer.PortalSensor |
      CollisionLayer.BoosterSensor |
      CollisionLayer.ResetSensor,
  ),
  dynamicToy: interactionGroups(
    CollisionLayer.DynamicToy,
    CollisionLayer.Ground |
      CollisionLayer.Car |
      CollisionLayer.DynamicToy |
      CollisionLayer.StaticObstacle |
      CollisionLayer.MovingObstacle |
      CollisionLayer.PortalSensor |
      CollisionLayer.BoosterSensor |
      CollisionLayer.ResetSensor,
  ),
  staticObstacle: interactionGroups(
    CollisionLayer.StaticObstacle,
    CollisionLayer.Car | CollisionLayer.DynamicToy,
  ),
  movingObstacle: interactionGroups(
    CollisionLayer.MovingObstacle,
    CollisionLayer.Car | CollisionLayer.DynamicToy,
  ),
  portalSensor: interactionGroups(CollisionLayer.PortalSensor, DYNAMIC_TRIGGER_TARGETS),
  boosterSensor: interactionGroups(CollisionLayer.BoosterSensor, DYNAMIC_TRIGGER_TARGETS),
  resetSensor: interactionGroups(
    CollisionLayer.ResetSensor,
    CollisionLayer.Car | CollisionLayer.DynamicToy,
  ),
});
