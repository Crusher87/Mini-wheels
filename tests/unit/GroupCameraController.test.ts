import { Group, Object3D, OrthographicCamera, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import {
  GROUP_CAMERA_FIXED_OFFSET,
  GROUP_CAMERA_LOCAL_AXES,
  GroupCameraController,
  calculateCameraLocalExtents,
  calculateExponentialSmoothingBlend,
  cameraSmoothingTimeSeconds,
  calculateGroupCameraFit,
  calculateRequiredHalfHeight,
  calculateTargetCentroid,
} from "../../src/render/GroupCameraController";

function pointAlongScreenAxes(horizontal: number, vertical: number): Vector3 {
  return new Vector3()
    .addScaledVector(
      new Vector3(
        GROUP_CAMERA_LOCAL_AXES.horizontal.x,
        GROUP_CAMERA_LOCAL_AXES.horizontal.y,
        GROUP_CAMERA_LOCAL_AXES.horizontal.z,
      ),
      horizontal,
    )
    .addScaledVector(
      new Vector3(
        GROUP_CAMERA_LOCAL_AXES.vertical.x,
        GROUP_CAMERA_LOCAL_AXES.vertical.y,
        GROUP_CAMERA_LOCAL_AXES.vertical.z,
      ),
      vertical,
    );
}

function createCamera(aspectRatio = 16 / 9): OrthographicCamera {
  return new OrthographicCamera(-13 * aspectRatio, 13 * aspectRatio, 13, -13, 0.3, 1000);
}

describe("group-camera fit math", () => {
  it("computes the world-space centroid of active render positions", () => {
    expect(
      calculateTargetCentroid([
        { x: -6, y: 2, z: 3 },
        { x: 4, y: 4, z: -1 },
        { x: 8, y: 0, z: 7 },
      ]),
    ).toEqual({ x: 2, y: 2, z: 3 });
    expect(calculateTargetCentroid([])).toBeNull();
  });

  it("measures horizontal and vertical extents in fixed camera-local space", () => {
    const center = { x: 8, y: 2, z: -3 };
    const horizontalPoint = pointAlongScreenAxes(20, 0).add(
      new Vector3(center.x, center.y, center.z),
    );
    const verticalPoint = pointAlongScreenAxes(0, -7).add(
      new Vector3(center.x, center.y, center.z),
    );

    const extents = calculateCameraLocalExtents([horizontalPoint, verticalPoint], center);

    expect(extents.horizontal).toBeCloseTo(20, 10);
    expect(extents.vertical).toBeCloseTo(7, 10);
  });

  it("adds the four-unit buffer after aspect correction and clamps to 13", () => {
    expect(calculateRequiredHalfHeight(1, 1, 16 / 9)).toBe(13);
    expect(calculateRequiredHalfHeight(32, 6, 16 / 9)).toBe(22);
    expect(calculateRequiredHalfHeight(32, 6, 4 / 3)).toBe(28);
    expect(calculateRequiredHalfHeight(2, 17, 21 / 9)).toBe(21);
  });

  it("returns one complete fit from finite target positions", () => {
    const center = new Vector3(12, 3, -9);
    const points = [
      pointAlongScreenAxes(-24, 0).add(center),
      pointAlongScreenAxes(24, 0).add(center),
      pointAlongScreenAxes(0, -8).add(center),
      pointAlongScreenAxes(0, 8).add(center),
    ];

    const fit = calculateGroupCameraFit(points, 4 / 3);

    expect(fit).not.toBeNull();
    expect(fit?.center).toEqual({ x: 12, y: 3, z: -9 });
    expect(fit?.horizontalExtent).toBeCloseTo(24, 10);
    expect(fit?.verticalExtent).toBeCloseTo(8, 10);
    expect(fit?.halfHeight).toBeCloseTo(22, 10);
    expect(fit?.targetCount).toBe(4);
  });

  it("uses the documented frame-rate-independent exponential blend", () => {
    expect(calculateExponentialSmoothingBlend(0)).toBe(0);
    expect(calculateExponentialSmoothingBlend(0.25)).toBeCloseTo(1 - Math.exp(-1), 12);
    expect(1 - (1 - calculateExponentialSmoothingBlend(1 / 120)) ** 120).toBeCloseTo(
      calculateExponentialSmoothingBlend(1),
      12,
    );
  });

  it("maps accessibility smoothing modes to bounded damping times", () => {
    expect(cameraSmoothingTimeSeconds("default")).toBe(0.25);
    expect(cameraSmoothingTimeSeconds("reduced")).toBe(0.1);
    expect(cameraSmoothingTimeSeconds("instant")).toBe(0);
  });
});

describe("GroupCameraController", () => {
  it("tracks current interpolated Object3D world positions and preserves orientation", () => {
    const camera = createCamera();
    const controller = new GroupCameraController(camera);
    const root = new Group();
    const target = new Object3D();
    root.position.set(5, 2, -4);
    target.position.set(7, 1, 3);
    root.add(target);
    controller.registerTarget(target);
    const initialQuaternion = camera.quaternion.clone();

    controller.update(Number.POSITIVE_INFINITY);

    expect(controller.getCurrentCenter()).toEqual(new Vector3(12, 3, -1));
    expect(camera.position).toEqual(
      new Vector3(
        12 + GROUP_CAMERA_FIXED_OFFSET.x,
        3 + GROUP_CAMERA_FIXED_OFFSET.y,
        -1 + GROUP_CAMERA_FIXED_OFFSET.z,
      ),
    );
    expect(camera.quaternion.angleTo(initialQuaternion)).toBeLessThan(1e-7);

    // PhysicsRenderBinding writes its interpolation result to this transform.
    target.position.set(9, 1, 3);
    controller.update(Number.POSITIVE_INFINITY);
    expect(controller.getCurrentCenter()).toEqual(new Vector3(14, 3, -1));
  });

  it("smooths center and size with the same 0.25 second damping", () => {
    const camera = createCamera(1);
    const controller = new GroupCameraController(camera, 1);
    const left = new Object3D();
    const right = new Object3D();
    left.position.copy(pointAlongScreenAxes(-20, 0).add(new Vector3(10, 0, 0)));
    right.position.copy(pointAlongScreenAxes(20, 0).add(new Vector3(10, 0, 0)));
    controller.registerTarget(left);
    controller.registerTarget(right);
    const blend = 1 - Math.exp(-1);

    controller.update(0.25);

    expect(controller.getCurrentCenter().x).toBeCloseTo(10 * blend, 10);
    expect(controller.currentHalfHeight).toBeCloseTo(13 + (24 - 13) * blend, 10);
  });

  it("can snap immediately when camera smoothing is disabled", () => {
    const controller = new GroupCameraController(createCamera());
    const target = new Object3D();
    target.position.set(9, 2, -4);
    controller.registerTarget(target);
    controller.setSmoothing("instant");

    controller.update(1 / 144);

    expect(controller.getCurrentCenter()).toEqual(new Vector3(9, 2, -4));
  });

  it("deduplicates targets and ignores hidden, inactive, null, and invalid roots", () => {
    const controller = new GroupCameraController(createCamera());
    const active = new Object3D();
    const hidden = new Object3D();
    const inactive = new Object3D();
    const invalid = new Object3D();
    active.position.set(6, 0, 0);
    hidden.position.set(100, 0, 0);
    hidden.visible = false;
    inactive.position.set(200, 0, 0);
    invalid.position.set(Number.NaN, 0, 0);

    controller.registerTarget(null);
    controller.registerTarget(undefined);
    controller.registerTarget(active);
    controller.registerTarget(active);
    controller.registerTarget(hidden);
    controller.registerTarget(inactive, () => false);
    controller.registerTarget(invalid);
    controller.update(Number.POSITIVE_INFINITY);

    expect(controller.targetCount).toBe(4);
    expect(controller.getCurrentCenter()).toEqual(new Vector3(6, 0, 0));
  });

  it("uses the latest valid aspect without allocating a replacement camera", () => {
    const camera = createCamera();
    const projectionSpy = vi.spyOn(camera, "updateProjectionMatrix");
    const controller = new GroupCameraController(camera);
    const originalCamera = camera;

    controller.resize(800, 600);

    expect(camera).toBe(originalCamera);
    expect(controller.aspectRatio).toBeCloseTo(4 / 3);
    expect(camera.left).toBeCloseTo(-13 * (4 / 3));
    expect(camera.right).toBeCloseTo(13 * (4 / 3));
    expect(camera.top).toBe(13);
    expect(camera.bottom).toBe(-13);
    expect(projectionSpy).toHaveBeenCalled();

    controller.resize(1920, 0);
    expect(controller.aspectRatio).toBeCloseTo(4 / 3);
    expect(Number.isFinite(camera.left)).toBe(true);
  });

  it("clears destroyed targets and restores the exact default rig on reset", () => {
    const camera = createCamera(4 / 3);
    const controller = new GroupCameraController(camera, 4 / 3);
    const leftTarget = new Object3D();
    const rightTarget = new Object3D();
    leftTarget.position.copy(pointAlongScreenAxes(-30, 0).add(new Vector3(8, 4, -6)));
    rightTarget.position.copy(pointAlongScreenAxes(30, 0).add(new Vector3(8, 4, -6)));
    controller.registerTarget(leftTarget);
    controller.registerTarget(rightTarget);
    controller.update(Number.POSITIVE_INFINITY);
    expect(controller.currentHalfHeight).toBeGreaterThan(13);

    controller.reset();

    expect(controller.targetCount).toBe(0);
    expect(controller.currentHalfHeight).toBe(13);
    expect(controller.getCurrentCenter()).toEqual(new Vector3());
    expect(camera.position).toEqual(
      new Vector3(
        GROUP_CAMERA_FIXED_OFFSET.x,
        GROUP_CAMERA_FIXED_OFFSET.y,
        GROUP_CAMERA_FIXED_OFFSET.z,
      ),
    );
    expect(camera.left).toBeCloseTo(-13 * (4 / 3));
    expect(camera.right).toBeCloseTo(13 * (4 / 3));
    expect(camera.top).toBe(13);
    expect(camera.bottom).toBe(-13);

    leftTarget.position.set(100, 100, 100);
    rightTarget.position.set(100, 100, 100);
    controller.update(Number.POSITIVE_INFINITY);
    expect(controller.getCurrentCenter()).toEqual(new Vector3());
  });
});
