import { Quaternion, Vector3 } from "three";
import type { Object3D, OrthographicCamera } from "three";
import { RENDER_CONFIG } from "../config/runtime-defaults";
import type { CameraSmoothing } from "../persistence/schema";

export interface CameraPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface CameraLocalAxes {
  readonly horizontal: CameraPoint;
  readonly vertical: CameraPoint;
}

export interface CameraLocalExtents {
  readonly horizontal: number;
  readonly vertical: number;
}

export interface GroupCameraFit {
  readonly center: CameraPoint;
  readonly horizontalExtent: number;
  readonly verticalExtent: number;
  readonly halfHeight: number;
  readonly targetCount: number;
}

export type CameraTargetActivity = () => boolean;

interface RegisteredTarget {
  readonly isActive: CameraTargetActivity | undefined;
}

export const GROUP_CAMERA_SCREEN_EDGE_BUFFER = 4;
export const GROUP_CAMERA_SMOOTH_TIME_SECONDS = 0.25;
export const GROUP_CAMERA_REDUCED_SMOOTH_TIME_SECONDS = 0.1;

export const GROUP_CAMERA_DEFAULT_CENTER: CameraPoint = Object.freeze({
  x: 0,
  y: 0,
  z: 0,
});

/**
 * The offset is kept intact instead of being reconstructed from rounded Euler
 * angles, so reset always returns to the documented source rig transform.
 */
export const GROUP_CAMERA_FIXED_OFFSET: CameraPoint = Object.freeze({
  x: RENDER_CONFIG.initialCameraPosition.x,
  y: RENDER_CONFIG.initialCameraPosition.y,
  z: RENDER_CONFIG.initialCameraPosition.z,
});

const WORLD_UP: CameraPoint = Object.freeze({ x: 0, y: 1, z: 0 });

function isFinitePoint(point: CameraPoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z);
}

function dot(left: CameraPoint, right: CameraPoint): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function cross(left: CameraPoint, right: CameraPoint): CameraPoint {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}

function normalize(vector: CameraPoint): CameraPoint {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  if (!Number.isFinite(length) || length <= Number.EPSILON) {
    throw new RangeError("Camera direction must have a finite, non-zero length.");
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  };
}

/**
 * Builds screen-right and screen-up axes for a fixed camera forward direction.
 * The returned values are plain objects and the input is never mutated.
 */
export function calculateCameraLocalAxes(
  forward: CameraPoint,
  worldUp: CameraPoint = WORLD_UP,
): CameraLocalAxes {
  const normalizedForward = normalize(forward);
  const normalizedWorldUp = normalize(worldUp);
  const horizontal = normalize(cross(normalizedForward, normalizedWorldUp));
  const vertical = normalize(cross(horizontal, normalizedForward));

  return { horizontal, vertical };
}

export const GROUP_CAMERA_FIXED_FORWARD: CameraPoint = Object.freeze(
  normalize({
    x: -GROUP_CAMERA_FIXED_OFFSET.x,
    y: -GROUP_CAMERA_FIXED_OFFSET.y,
    z: -GROUP_CAMERA_FIXED_OFFSET.z,
  }),
);

export const GROUP_CAMERA_LOCAL_AXES: CameraLocalAxes = Object.freeze({
  horizontal: Object.freeze(calculateCameraLocalAxes(GROUP_CAMERA_FIXED_FORWARD).horizontal),
  vertical: Object.freeze(calculateCameraLocalAxes(GROUP_CAMERA_FIXED_FORWARD).vertical),
});

/**
 * Returns the centroid of finite points. Invalid positions are omitted so a
 * recovering vehicle cannot poison the camera transform for every player.
 */
export function calculateTargetCentroid(points: readonly CameraPoint[]): CameraPoint | null {
  let x = 0;
  let y = 0;
  let z = 0;
  let count = 0;

  for (const point of points) {
    if (!isFinitePoint(point)) {
      continue;
    }
    x += point.x;
    y += point.y;
    z += point.z;
    count += 1;
  }

  return count === 0 ? null : { x: x / count, y: y / count, z: z / count };
}

/**
 * Projects offsets around the centroid onto the camera's local screen axes.
 */
export function calculateCameraLocalExtents(
  points: readonly CameraPoint[],
  center: CameraPoint,
  axes: CameraLocalAxes = GROUP_CAMERA_LOCAL_AXES,
): CameraLocalExtents {
  let horizontal = 0;
  let vertical = 0;

  for (const point of points) {
    if (!isFinitePoint(point)) {
      continue;
    }

    const offset = {
      x: point.x - center.x,
      y: point.y - center.y,
      z: point.z - center.z,
    };
    horizontal = Math.max(horizontal, Math.abs(dot(offset, axes.horizontal)));
    vertical = Math.max(vertical, Math.abs(dot(offset, axes.vertical)));
  }

  return { horizontal, vertical };
}

/**
 * GDD Section 7.3:
 * max(13, max(vertical, horizontal / aspect) + 4).
 */
export function calculateRequiredHalfHeight(
  horizontalExtent: number,
  verticalExtent: number,
  aspectRatio: number,
): number {
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    throw new RangeError("Camera aspect ratio must be finite and greater than zero.");
  }
  if (
    !Number.isFinite(horizontalExtent) ||
    horizontalExtent < 0 ||
    !Number.isFinite(verticalExtent) ||
    verticalExtent < 0
  ) {
    throw new RangeError("Camera extents must be finite and non-negative.");
  }

  const requiredExtent = Math.max(verticalExtent, horizontalExtent / aspectRatio);
  return Math.max(
    RENDER_CONFIG.minimumOrthographicSize,
    requiredExtent + GROUP_CAMERA_SCREEN_EDGE_BUFFER,
  );
}

export function calculateGroupCameraFit(
  points: readonly CameraPoint[],
  aspectRatio: number,
  axes: CameraLocalAxes = GROUP_CAMERA_LOCAL_AXES,
): GroupCameraFit | null {
  const center = calculateTargetCentroid(points);
  if (center === null) {
    return null;
  }

  const extents = calculateCameraLocalExtents(points, center, axes);
  let targetCount = 0;
  for (const point of points) {
    if (isFinitePoint(point)) {
      targetCount += 1;
    }
  }

  return {
    center,
    horizontalExtent: extents.horizontal,
    verticalExtent: extents.vertical,
    halfHeight: calculateRequiredHalfHeight(extents.horizontal, extents.vertical, aspectRatio),
    targetCount,
  };
}

/**
 * Frame-rate-independent damping factor. A non-positive or invalid frame delta
 * deliberately produces no movement; an infinite positive delta snaps safely.
 */
export function calculateExponentialSmoothingBlend(
  renderDeltaSeconds: number,
  smoothTimeSeconds = GROUP_CAMERA_SMOOTH_TIME_SECONDS,
): number {
  if (Number.isNaN(renderDeltaSeconds) || renderDeltaSeconds <= 0) {
    return 0;
  }
  if (!Number.isFinite(smoothTimeSeconds) || smoothTimeSeconds <= 0) {
    return 1;
  }
  return 1 - Math.exp(-renderDeltaSeconds / smoothTimeSeconds);
}

export function cameraSmoothingTimeSeconds(mode: CameraSmoothing): number {
  switch (mode) {
    case "default":
      return GROUP_CAMERA_SMOOTH_TIME_SECONDS;
    case "reduced":
      return GROUP_CAMERA_REDUCED_SMOOTH_TIME_SECONDS;
    case "instant":
      return 0;
  }
}

function inferAspectRatio(camera: OrthographicCamera): number {
  const frustumHeight = camera.top - camera.bottom;
  const aspectRatio = (camera.right - camera.left) / frustumHeight;
  return Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
}

function isVisibleInHierarchy(target: Object3D): boolean {
  let current: Object3D | null = target;
  while (current !== null) {
    if (!current.visible) {
      return false;
    }
    current = current.parent;
  }
  return true;
}

export class GroupCameraController {
  private readonly targets = new Map<Object3D, RegisteredTarget>();
  private readonly smoothedCenter = new Vector3();
  private readonly fixedOffset = new Vector3(
    GROUP_CAMERA_FIXED_OFFSET.x,
    GROUP_CAMERA_FIXED_OFFSET.y,
    GROUP_CAMERA_FIXED_OFFSET.z,
  );
  private readonly fixedQuaternion = new Quaternion();
  private readonly targetCenter = new Vector3();
  private readonly positionPool: Vector3[] = [];
  private readonly activeWorldPositions: Vector3[] = [];
  private aspect: number;
  private halfHeight: number = RENDER_CONFIG.minimumOrthographicSize;
  private smoothTimeSeconds = GROUP_CAMERA_SMOOTH_TIME_SECONDS;

  public constructor(
    private readonly camera: OrthographicCamera,
    initialAspectRatio = inferAspectRatio(camera),
  ) {
    this.aspect =
      Number.isFinite(initialAspectRatio) && initialAspectRatio > 0
        ? initialAspectRatio
        : inferAspectRatio(camera);

    this.camera.up.set(WORLD_UP.x, WORLD_UP.y, WORLD_UP.z);
    this.camera.position.copy(this.fixedOffset);
    this.camera.lookAt(
      GROUP_CAMERA_DEFAULT_CENTER.x,
      GROUP_CAMERA_DEFAULT_CENTER.y,
      GROUP_CAMERA_DEFAULT_CENTER.z,
    );
    this.fixedQuaternion.copy(this.camera.quaternion);
    this.restoreDefaultTransform();
  }

  public get targetCount(): number {
    return this.targets.size;
  }

  public get currentHalfHeight(): number {
    return this.halfHeight;
  }

  public get aspectRatio(): number {
    return this.aspect;
  }

  public getCurrentCenter(target = new Vector3()): Vector3 {
    return target.copy(this.smoothedCenter);
  }

  public setSmoothing(mode: CameraSmoothing): void {
    this.smoothTimeSeconds = cameraSmoothingTimeSeconds(mode);
  }

  /**
   * The optional activity callback allows spawn/reset state to be excluded
   * without coupling this render service to a vehicle lifecycle type.
   */
  public registerTarget(
    target: Object3D | null | undefined,
    isActive?: CameraTargetActivity,
  ): void {
    if (target === null || target === undefined) {
      return;
    }
    this.targets.set(target, { isActive });
  }

  public unregisterTarget(target: Object3D | null | undefined): void {
    if (target !== null && target !== undefined) {
      this.targets.delete(target);
    }
  }

  public clearTargets(): void {
    this.targets.clear();
    this.activeWorldPositions.length = 0;
  }

  /**
   * Clears destroyed targets and restores the documented origin-centered rig.
   * Replacement cars can be registered immediately after this call.
   */
  public reset(): void {
    this.clearTargets();
    this.restoreDefaultTransform();
  }

  /**
   * Accepts either an aspect ratio or a width/height pair. Invalid transient
   * resize measurements retain the last valid projection.
   */
  public resize(aspectRatio: number): void;
  public resize(width: number, height: number): void;
  public resize(widthOrAspect: number, height?: number): void {
    const nextAspect = height === undefined ? widthOrAspect : widthOrAspect / Math.max(height, 0);

    if (Number.isFinite(nextAspect) && nextAspect > 0) {
      this.aspect = nextAspect;
    }
    this.applyFrustum();
  }

  /**
   * Call after physics interpolation has written the rendered Object3D poses.
   */
  public update(renderDeltaSeconds: number): void {
    this.collectActiveWorldPositions();
    const fit = calculateGroupCameraFit(this.activeWorldPositions, this.aspect);
    if (fit === null) {
      return;
    }

    const blend = calculateExponentialSmoothingBlend(renderDeltaSeconds, this.smoothTimeSeconds);
    this.targetCenter.set(fit.center.x, fit.center.y, fit.center.z);
    this.smoothedCenter.lerp(this.targetCenter, blend);
    this.halfHeight += (fit.halfHeight - this.halfHeight) * blend;
    this.halfHeight = Math.max(RENDER_CONFIG.minimumOrthographicSize, this.halfHeight);

    this.applyCameraTransform();
    this.applyFrustum();
  }

  private collectActiveWorldPositions(): void {
    this.activeWorldPositions.length = 0;
    let activeIndex = 0;

    for (const [target, registration] of this.targets) {
      if (
        !isVisibleInHierarchy(target) ||
        (registration.isActive !== undefined && !registration.isActive())
      ) {
        continue;
      }

      let worldPosition = this.positionPool[activeIndex];
      if (worldPosition === undefined) {
        worldPosition = new Vector3();
        this.positionPool.push(worldPosition);
      }
      target.getWorldPosition(worldPosition);
      if (
        !Number.isFinite(worldPosition.x) ||
        !Number.isFinite(worldPosition.y) ||
        !Number.isFinite(worldPosition.z)
      ) {
        continue;
      }

      this.activeWorldPositions.push(worldPosition);
      activeIndex += 1;
    }
  }

  private restoreDefaultTransform(): void {
    this.smoothedCenter.set(
      GROUP_CAMERA_DEFAULT_CENTER.x,
      GROUP_CAMERA_DEFAULT_CENTER.y,
      GROUP_CAMERA_DEFAULT_CENTER.z,
    );
    this.halfHeight = RENDER_CONFIG.minimumOrthographicSize;
    this.camera.zoom = 1;
    this.applyCameraTransform();
    this.applyFrustum();
  }

  private applyCameraTransform(): void {
    this.camera.position.copy(this.smoothedCenter).add(this.fixedOffset);
    this.camera.quaternion.copy(this.fixedQuaternion);
  }

  private applyFrustum(): void {
    this.camera.left = -this.halfHeight * this.aspect;
    this.camera.right = this.halfHeight * this.aspect;
    this.camera.top = this.halfHeight;
    this.camera.bottom = -this.halfHeight;
    this.camera.updateProjectionMatrix();
  }
}
