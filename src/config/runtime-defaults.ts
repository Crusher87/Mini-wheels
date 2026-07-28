export const SIMULATION_CONFIG = Object.freeze({
  gravity: Object.freeze({ x: 0, y: -9.81, z: 0 }),
  fixedTimestepSeconds: 0.02,
  maxFrameDeltaSeconds: 0.25,
  maxPhysicsStepsPerRender: 5,
});

export const RENDER_CONFIG = Object.freeze({
  background: 0xa5b3c4,
  minimumOrthographicSize: 13,
  nearClip: 0.3,
  farClip: 1000,
  pixelRatioCap: 2,
  initialCameraPosition: Object.freeze({ x: 45.93, y: 37.5, z: 45.93 }),
});
