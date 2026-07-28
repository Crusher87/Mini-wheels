export interface Vector3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface QuaternionLike extends Vector3Like {
  readonly w: number;
}

export interface PortalMotion {
  readonly linearVelocity: Vector3Like;
  readonly angularVelocity: Vector3Like;
}

export function addDeltaVelocity(
  currentVelocity: Vector3Like,
  deltaVelocity: Vector3Like,
): Vector3Like {
  return {
    x: currentVelocity.x + deltaVelocity.x,
    y: currentVelocity.y + deltaVelocity.y,
    z: currentVelocity.z + deltaVelocity.z,
  };
}

export function normalizeQuaternion(rotation: QuaternionLike): QuaternionLike {
  const magnitude = Math.hypot(rotation.x, rotation.y, rotation.z, rotation.w);
  if (!Number.isFinite(magnitude) || magnitude <= Number.EPSILON) {
    throw new RangeError("A trigger rotation must be a finite quaternion.");
  }
  return {
    x: rotation.x / magnitude,
    y: rotation.y / magnitude,
    z: rotation.z / magnitude,
    w: rotation.w / magnitude,
  };
}

/**
 * Portal meshes use local +Z as the outward face normal.
 */
export function portalForwardFromRotation(inputRotation: QuaternionLike): Vector3Like {
  const rotation = normalizeQuaternion(inputRotation);
  const x = rotation.x;
  const y = rotation.y;
  const z = rotation.z;
  const w = rotation.w;
  return {
    x: 2 * (x * z + w * y),
    y: 2 * (y * z - w * x),
    z: 1 - 2 * (x * x + y * y),
  };
}

export function calculatePortalExitMotion(
  entryLinearVelocity: Vector3Like,
  entryAngularVelocity: Vector3Like,
  exitForward: Vector3Like,
  retainedSpeedFraction = 0.8,
): PortalMotion {
  if (!Number.isFinite(retainedSpeedFraction) || retainedSpeedFraction < 0) {
    throw new RangeError("Portal retained speed fraction must be a finite non-negative number.");
  }

  const forwardMagnitude = Math.hypot(exitForward.x, exitForward.y, exitForward.z);
  if (!Number.isFinite(forwardMagnitude) || forwardMagnitude <= Number.EPSILON) {
    throw new RangeError("Portal exit forward must be a finite non-zero vector.");
  }

  const outputSpeed =
    Math.hypot(entryLinearVelocity.x, entryLinearVelocity.y, entryLinearVelocity.z) *
    retainedSpeedFraction;
  const scale = outputSpeed / forwardMagnitude;
  return {
    linearVelocity: {
      x: exitForward.x * scale,
      y: exitForward.y * scale,
      z: exitForward.z * scale,
    },
    // The Alpha specification preserves angular velocity in world space.
    angularVelocity: {
      x: entryAngularVelocity.x,
      y: entryAngularVelocity.y,
      z: entryAngularVelocity.z,
    },
  };
}
