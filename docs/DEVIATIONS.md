# Reconstruction decisions and deviations

Status date: 2026-07-28 (America/Vancouver)  
Canonical source: GDD Sections 0.1, 0.5, 23 and 24

## Evidence vocabulary

| Label       | Meaning                                                              |
| ----------- | -------------------------------------------------------------------- |
| `CONFIRMED` | Explicit source-build behavior/data and a protected Profile A target |
| `OBSERVED`  | Visible in supplied public/reference evidence                        |
| `INFERRED`  | Strongly supported but not directly specified                        |
| `DECISION`  | A project-owned browser reconstruction choice                        |

Priority is latest explicit user instruction, `CONFIRMED`, `OBSERVED`,
`INFERRED`, then `DECISION`. A decision must never be described as recovered
source fact.

## Runtime deviation register

These entries preserve the source value separately from the browser runtime
choice. “Approval” below is engineering status only; no row is legal approval.

| ID      | Label                   | Source / requirement                                                                  | Browser runtime                                                                                                                                                                | Reason and evidence                                                                                                                                                                                                                                                                                                          | Acceptance impact                                     | Approval                                                               |
| ------- | ----------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------- |
| DEV-001 | `DECISION`              | Suspension spring 35,000 and damper 1,500                                             | Rapier controller coefficients are divided by chassis mass: stiffness `35,000 / 1,500 = 23.333…`; compression and relaxation `1,500 / 1,500 = 1`                               | Rapier’s ray-cast controller applies chassis mass internally. The direct source values remain beside the calibrated fields and are asserted in `tests/unit/VehicleConfiguration.test.ts`. No full handling calibration has been recorded.                                                                                    | `VEH-001`, `VEH-002`, `VEH-006`, `VEH-012`, `MAP-007` | Implemented mapping; calibration approval still open                   |
| DEV-002 | `DECISION`              | Source cube bodies used continuous collision detection                                | Runtime cube CCD is disabled; cars and balls retain CCD                                                                                                                        | Enabling CCD on all 96 cubes caused sustained fixed-step overruns in Chromium development testing. The observation was not saved as a durable benchmark. `tests/unit/SandboxLayout.test.ts` protects both source `true` and runtime `false`; `tests/browser/soak.spec.ts` defines a ten-car displacement/finite-value check. | `MAP-002`, `MAP-008`, `PERF-001`, `PERF-003`          | Release deviation open until named-hardware benchmark/tunneling review |
| DEV-003 | `DECISION`              | `OBSERVED` soft-shadow appearance                                                     | Three.js r185 `PCFShadowMap` with 1024/2048/4096 map sizes                                                                                                                     | In r185, `PCFSoftShadowMap` emits “deprecated; using PCFShadowMap instead” and is no longer a distinct supported renderer type. Selecting `PCFShadowMap` directly removes the warning and matches r185 behavior. Visual softness/contact still needs review.                                                                 | `VIS-003`, `PERF-002`, `UI-006`                       | Implemented; visual approval open                                      |
| DEV-004 | `INFERRED` / `DECISION` | Ramp transforms and source X-scale multiplier are known; base mesh dimensions are not | Original convex wedge is 10 × 4.2 × 4, rises toward local −X, with recovered positions/yaws                                                                                    | This isolated geometry places the documented ramp booster near y=4.19 at its recovered X/Z location. `tests/unit/SandboxLayout.test.ts` freezes the choice; ramp and booster browser specs exist. No source mesh was copied and visual calibration remains open.                                                             | `VEH-006`, `INT-002`, `VIS-008`                       | Reconstruction choice; human reference approval open                   |
| DEV-005 | `INFERRED` / `DECISION` | Portal positions are known; every endpoint quaternion is not                          | Local +Z is the outward normal; endpoint rotations face open space, including one horizontal +Y exit                                                                           | Prevents spawning into nearby architecture and gives deterministic exit-forward behavior. Unit portal math verifies normals/speed/locks; exact visual orientation remains an inference.                                                                                                                                      | `INT-006`, `INT-007`, `VIS-004`, `VIS-008`            | Reconstruction choice; human reference approval open                   |
| DEV-006 | `DECISION`              | Desktop sample-count/quality labels cannot be copied literally to WebGL               | Off = no AA pass; FXAA = FXAA; SMAA = SMAA; High = SMAA plus 1.25× internal supersampling, capped at effective DPR 2                                                           | Gives truthful browser behavior. AO maps to a quarter-resolution Three.js GTAO pass with 4 GTAO samples, 8 denoise samples and intensity 0.45; Low shadows disable AO. Unit/render specs expose the active plan.                                                                                                             | `UI-003`, `UI-005`, `UI-006`, `PERF-002`, `VIS-003`   | Implemented; real-GPU/visual approval open                             |
| DEV-007 | `DECISION`              | Position-based kinematic platforms must carry a neutral stationary car                | When at least two wheels agree on one kinematic support, average support `velocityAtPoint` and apply X/Z surface velocity only; neutral dead zone 0.05, velocity epsilon 0.001 | Rapier's ray-cast controller does not inherit position-based support motion. Repeated MAP-007 runs carried P1 1.020–1.059 m while the shuttle moved 1.30–1.40 m, with <0.016 m cross-axis drift and sampled 1.000023 m/s surface speed. The correction is isolated as `profileBPassengerSurfaceCorrection`.                  | `MAP-007`, `VEH-002`, `PERF-003`                      | Implemented and repeated browser evidence passes                       |

No before/after benchmark artifact exists yet for DEV-002 or DEV-006. Their
performance rationale must be reproduced on named hardware before release.

## Browser reconstruction decisions

| ID      | Label      | Decision                                                                                                                   | Validation status                                                                 |
| ------- | ---------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| DEC-001 | `DECISION` | Strict TypeScript, Three.js `WebGLRenderer`, official Rapier 3D WASM, semantic DOM/CSS and static ESM build                | Implemented; production preview smoke passes                                      |
| DEC-002 | `DECISION` | Isolate vehicle integration behind `VehiclePhysicsAdapter` and keep immutable source values separate from runtime mappings | Unit audit passes                                                                 |
| DEC-003 | `DECISION` | Convert 400 torque at radius 0.2 to 2,000 Rapier force per front wheel; opposing force is 20,000                           | Unit audit passes; full calibration pending                                       |
| DEC-004 | `DECISION` | Simulate at fixed 0.02 s and render with interpolation at browser refresh cadence                                          | Fixed-loop unit tests pass; trajectory/visual review pending                      |
| DEC-005 | `DECISION` | Preserve +300°/s and −480°/s legacy rotating-bar comparison preset; keep safer rates separate                              | Mover math unit tests pass                                                        |
| DEC-006 | `DECISION` | Lock teleported bodies out of both endpoints until destination exit or 0.20 s                                              | Unit and three-engine car/ball portal runs pass                                   |
| DEC-007 | `DECISION` | Add P1–P10 text and distinct symbols/keylines instead of relying on ten colors                                             | Native grayscale technical capture passes; measured contrast open                 |
| DEC-008 | `DECISION` | Use semantic HTML controls over one Three.js canvas                                                                        | Implemented; assistive-technology review pending                                  |
| DEC-009 | `DECISION` | Reset by disposing/rebuilding a session-owned `WorldSession`; keep renderer/UI/settings/audio app-owned                    | 25 Chromium plus three Firefox/WebKit rebuilds pass resource bounds               |
| DEC-010 | `DECISION` | Pause/clear input and accumulator on hidden tab, blur and fullscreen exit                                                  | Hidden, blur, and injected fullscreen-exit matrix passes                          |
| DEC-011 | `DECISION` | Never promise to close a normal browser tab; provide Return to Title and Exit Fullscreen                                   | Static UI audit passes                                                            |
| DEC-012 | `DECISION` | Persist only schema-v2 settings/bindings, never live bodies or `Gamepad.index`                                             | Migration/validation unit tests pass                                              |
| DEC-013 | `DECISION` | Migrate v1 and unversioned documents to schema v2; salvage recognized fields from future versions                          | `tests/unit/SettingsService.test.ts` passes                                       |
| DEC-014 | `DECISION` | Treat controller ID/mapping as hints, require explicit non-standard axis calibration and pause on assigned-device loss     | Unit/synthetic specs exist; real hardware pending                                 |
| DEC-015 | `DECISION` | Use a fixed-capacity 512-particle instanced pool for exhaust, booster and portal effects                                   | Unit, reset bounds, and native visual evidence pass                               |
| DEC-016 | `DECISION` | Use original oscillator/gain/panner Web Audio for engine and event cues; cap at 10 engine and 16 short cue voices          | Unit/browser policy and voice bounds pass; listening review pending               |
| DEC-017 | `DECISION` | Use only original procedural geometry, shader, UI, VFX and audio; copy no source assets                                    | Source/current `dist/` inspection supports this; independent/legal review pending |
| DEC-018 | `DECISION` | Keep Infected, other named maps, AI, networking, progression and editor features outside Profile A                         | Disabled UI cards are covered by current targeted Chromium evidence               |

## Protected source targets

The following remain immutable source-reference data even where a separate
runtime mapping exists:

- 1–10 local players and Sandbox as the required Alpha mode;
- chassis mass 1,500 and center of mass `(0, -0.125, +0.1)`;
- front-wheel drive/steering, 400 torque per driven wheel, 10× opposing
  multiplier, 35° maximum steering and radius-0.2 wheels;
- documented suspension/friction targets;
- gravity `(0, -9.81, 0)` and fixed timestep 0.02 seconds;
- orthographic group camera minimum 13, buffer 4 and default smoothing 0.25 s;
- 96 cubes in a 6 × 4 × 4 formation;
- boosters `(0,0,-5)` and `(-1,+1,+5)`;
- portal output speed at 80% and direction exit-forward;
- platforms at 1 unit/s with 2-second endpoint waits.

Visual properties such as primitive silhouette, palette hierarchy, sparse
composition, portal translucency, exhaust character and shadow appearance are
`OBSERVED`, not recovered implementation facts.

## Measurement and approval procedure

1. Preserve the source value in immutable configuration.
2. Reproduce the browser mismatch with a scripted run and record dependency,
   browser, hardware and quality profile.
3. Change only the isolated runtime field or named quality profile.
4. Record before/after measurements and all affected acceptance IDs.
5. Obtain explicit project-owner approval for a protected gameplay difference.
6. Rerun affected unit, browser, calibration, performance and visual checks.
7. Keep legal/trademark/license approval separate from engineering approval.
