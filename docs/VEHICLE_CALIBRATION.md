# Vehicle calibration

Status date: 2026-07-30 (America/Vancouver)
Canonical source: GDD Sections 5, 11 and 19.1  
Acceptance IDs: `VEH-001`–`VEH-013`
Calibration status: `PARTIAL — CONFIGURATION AUDITED; HANDLING RUNS NOT RECORDED`

The source reference and Rapier runtime mapping are intentionally separate.
Passing configuration unit tests is not evidence that the handling character
matches the reference build.

## Current automated evidence

`npm run test` passed 115/115 tests. Vehicle-specific coverage includes:

- `tests/unit/VehicleConfiguration.test.ts`: protected values, 2,000 source /
  4,000 runtime / 20,000 opposing force mapping, suspension, braking logic and wrapped
  wheel interpolation;
- `tests/unit/VehicleCalibrationHarness.test.ts`: deterministic input phases
  and stable JSON/CSV fields;
- `tests/unit/AutomaticUprightRecovery.test.ts`: optional settled-inversion
  eligibility and collision/motion exclusions.

`tests/browser/boot.spec.ts` verifies live acceleration, steering, hard
braking, service braking, spark drift, exact fall recovery, and ramp launch.
`tests/browser/sandbox.spec.ts` verifies platform passenger contact and
legacy-speed rotating-bar momentum on all three engines. These checks are not a
substitute for the full calibration protocols below.

Repeated Chromium MAP-007 runs recorded:

- horizontal-shuttle travel: 1.30–1.40 m during the measured interval;
- P1 carried travel: 1.020–1.059 m;
- cross-axis Z drift: below 0.016 m;
- sampled shuttle surface velocity: 1.000023 m/s.

The calibration report format has its own schema version 1. That is unrelated
to the user-settings schema, which is version 2.

## Protected source chassis reference

| Parameter                  | `CONFIRMED` source value |
| -------------------------- | -----------------------: |
| Mass                       |                    1,500 |
| Linear drag                |                        0 |
| Angular drag               |                     0.05 |
| Gravity                    |                  Enabled |
| Interpolation              |                  Enabled |
| Collision detection        |       Continuous Dynamic |
| Center-of-mass offset      |      `(0, -0.125, +0.1)` |
| Driven axle                |                    Front |
| Steering axle              |                    Front |
| Maximum motor torque       |      400 per front wheel |
| Opposing-torque multiplier |                       10 |
| Maximum steering           |    35° / 0.610865238 rad |
| Artificial top speed       |                     None |

The procedural visual/collision target is approximately 0.7 wide, 0.4 high and
1.3 long, with wheel centers at X ±0.3 and Z ±0.5.

## Protected wheel and suspension reference

| Parameter                              | `CONFIRMED` source value |
| -------------------------------------- | -----------------------: |
| Wheel mass                             |                       50 |
| Radius                                 |                      0.2 |
| Suspension distance                    |                      0.3 |
| Spring strength                        |                   35,000 |
| Damper                                 |                    1,500 |
| Suspension target position             |                      0.5 |
| Wheel damping rate                     |                     0.25 |
| Force application point distance       |                      0.3 |
| Forward friction extremum slip/value   |                0.4 / 1.0 |
| Forward friction asymptote slip/value  |                0.6 / 0.5 |
| Forward friction stiffness             |                      1.0 |
| Sideways friction extremum slip/value  |                0.2 / 1.0 |
| Sideways friction asymptote slip/value |               0.5 / 0.75 |
| Sideways friction stiffness            |                      1.8 |

| Wheel       | Local center      |
| ----------- | ----------------- |
| Front left  | `(-0.3, 0, +0.5)` |
| Front right | `(+0.3, 0, +0.5)` |
| Rear left   | `(-0.3, 0, -0.5)` |
| Rear right  | `(+0.3, 0, -0.5)` |

## Implemented Rapier mapping

| Runtime field                          |                      Value | Derivation / status                           |
| -------------------------------------- | -------------------------: | --------------------------------------------- |
| Chassis mass                           |                      1,500 | Direct, unit-audited                          |
| Linear / angular damping               |                   0 / 0.05 | Direct                                        |
| Gravity scale                          |                          1 | World gravity `(0,-9.81,0)`                   |
| Chassis CCD                            |                    Enabled | Source continuity retained                    |
| Center of mass                         |          `(0,-0.125,+0.1)` | Direct                                        |
| Principal angular inertia              |     `(231.25,272.5,81.25)` | `DECISION`, initial 0.7 × 0.4 × 1.3 estimate  |
| Up / forward axes                      |      Y index 1 / Z index 2 | Project convention                            |
| Suspension direction / axle            |     `(0,-1,0)` / `(1,0,0)` | Chassis-local                                 |
| Rest length / max travel               |                0.15 / 0.15 | Half of the source 0.3 travel                 |
| Source stiffness retained              |                     35,000 | Immutable audit field                         |
| Rapier stiffness coefficient           | `35,000 / 1,500 = 23.333…` | Mass-normalized; see DEV-001                  |
| Source compression/relaxation retained |              1,500 / 1,500 | Immutable audit fields                        |
| Rapier compression/relaxation          |                      1 / 1 | Mass-normalized; see DEV-001                  |
| Maximum suspension force               |                    100,000 | Initial runtime cap, calibration pending      |
| Friction slip                          |                        1.0 | Initial longitudinal approximation            |
| Source side friction stiffness         |                        1.8 | Immutable audit target                        |
| Runtime side friction stiffness        |                        1.2 | Arcade momentum profile; see DEV-009          |
| Source-equivalent front engine force   |           ±2,000 per wheel | `400 / 0.2`                                   |
| Ordinary front engine force            |           ±4,000 per wheel | 2× arcade acceleration; see DEV-009           |
| Full-steer front engine force          |           ±8,000 per wheel | Linear steering boost; see DEV-009            |
| Opposing front engine force            |    Up to ±20,000 per wheel | `400 × 10 / 0.2`                              |
| Front steering                         | ±0.610865238 to ±0.2138028 | 35° below 2 m/s, scaling to 35% by 8 m/s      |
| Service brake                          |           12,000 per wheel | Brake held without drift steering             |
| Drift rear brake / side stiffness      |                 100 / 0.45 | Grounded rear-slip profile; see DEV-010       |
| Drift steering / drive assist          |              1.55× / 1.35× | Retains control through the slide             |
| Drift entry-momentum floor             |                        82% | Horizontal momentum floor while drift is held |
| Rear engine force / steering           |                      0 / 0 | Passive rear axle                             |
| Fixed step                             |                     0.02 s | Protected 50 Hz simulation                    |

Rapier ray-cast wheels are not separate rigid bodies. Source wheel mass, wheel
damping and the two-piece Unity friction curves therefore remain calibration
targets rather than one-to-one API fields.

### Suspension scaling boundary

The runtime uses mass-normalized coefficients because the Rapier ray-cast
vehicle calculation incorporates chassis mass. Keeping 35,000 and 1,500 as the
controller coefficients would multiply the effective response by the 1,500
chassis mass. The source numbers remain available as immutable `Initial`
fields, while the adapter consumes the calibrated values.

This is an analytic mapping plus unit audit, not a completed before/after
handling benchmark. It remains open under
[DEV-001](DEVIATIONS.md#runtime-deviation-register).

### Moving-platform passenger boundary

Rapier's ray-cast controller does not automatically inherit position-based
kinematic platform velocity. The named Profile B correction activates only
when at least two wheels report the same kinematic support, throttle is within
the 0.05 neutral dead zone, and the measured horizontal surface velocity is
above 0.001 m/s. It averages `velocityAtPoint` across the agreeing supports and
applies only X/Z velocity, preserving chassis Y motion. This avoids a general
vehicle-force rewrite and is recorded as DEV-007.

## Fixed-step and braking order

1. Cache logical axes from the rendered frame.
2. Derive front-wheel/chassis longitudinal direction.
3. Select ordinary or opposing force and resolve service-brake/drift state.
4. Apply force and steering to the front ray-cast wheels; while drifting,
   loosen and lightly brake the rear wheels and retain the configured momentum floor.
5. Update the vehicle for exactly 0.02 seconds and step Rapier.
6. Capture previous/current chassis and wheel state.
7. Interpolate presentation state for the render frame.

Opposing 20,000 force applies only while requested direction and motion oppose.
After the direction crosses zero, ordinary 4,000-scale reverse force resumes.

## Calibration environment

No committed handling result set exists. The final report must fill every
field:

| Field                       | Current value                                  |
| --------------------------- | ---------------------------------------------- |
| Report/run ID               | `NOT RUN`                                      |
| Revision                    | Assigned by the release commit / Sites version |
| Date/time/time zone         | `NOT RUN`                                      |
| Build mode                  | `NOT RUN`                                      |
| Three.js                    | 0.185.1 (manifest)                             |
| Rapier                      | 0.19.3 (manifest)                              |
| Browser/engine              | `NOT RUN`                                      |
| Operating system            | `NOT RUN` for calibration                      |
| CPU/GPU/driver              | `NOT RUN`                                      |
| Refresh/render cap          | `NOT RUN`                                      |
| Resolution/DPR/render scale | `NOT RUN`                                      |
| Physics profile             | `NOT RUN`                                      |
| Random seeds                | `NOT RUN`                                      |

## Required harness results

Use the development calibration recorder with deterministic axes and fixed
0.02-second stepping. Preserve JSON/CSV plus video where numbers cannot prove
visual equivalence.

| Run                | Input                                | Required measurements                         | Status    |
| ------------------ | ------------------------------------ | --------------------------------------------- | --------- |
| CAL-ACCEL          | +1 drive for 5 s                     | Speed at 1/3/5 s, distance, drift             | `NOT RUN` |
| CAL-COAST          | +1 for 3 s, neutral for 5 s          | Decay curve and distance                      | `NOT RUN` |
| CAL-BRAKE          | +1 for 3 s, then −1 through reversal | Stop time/distance, peak force, reverse onset | `NOT RUN` |
| CAL-STEER-L/R      | +1 drive and full left/right         | Radius, yaw, slip, commanded angle            | `NOT RUN` |
| CAL-SLALOM         | Alternating full steering            | Latency, overshoot, roll, path                | `NOT RUN` |
| CAL-RAMP           | Fixed source-scale approach          | Entry speed, apex, range, pitch, landing      | `NOT RUN` |
| CAL-CAR-COLLISION  | Head-on and offset                   | Momentum, spin, recovery                      | `NOT RUN` |
| CAL-CUBE-COLLISION | Authored cube wall                   | Entry speed, displacement, spin, recovery     | `NOT RUN` |
| CAL-INVERTED-20    | Twenty representative seeds          | Inversion count and stuck duration            | `NOT RUN` |
| CAL-REFRESH        | Same script at 60/120/144 Hz         | Trajectory deltas and interpolation video     | `NOT RUN` |
| CAL-PAUSE          | Pause under throttle/airborne/spin   | Zero physics/VFX progression and clean resume | `NOT RUN` |
| CAL-FALL           | Cross an open floor edge             | Spawn transform and zero velocities           | `NOT RUN` |

## Acceptance summary

| ID      | Status    | Evidence / remaining gate                                    |
| ------- | --------- | ------------------------------------------------------------ |
| VEH-001 | `PASS`    | Source/runtime unit audit                                    |
| VEH-002 | `PARTIAL` | Acceleration smoke exists; drift result absent               |
| VEH-003 | `PASS`    | 35° config and three-engine live telemetry                   |
| VEH-004 | `PASS`    | 20,000 mapping and three-engine live telemetry               |
| VEH-005 | `PARTIAL` | Unit logic only; live transition not measured                |
| VEH-006 | `PARTIAL` | Ramp smoke exists; full momentum/spin protocol absent        |
| VEH-007 | `NOT RUN` | High-refresh wheel/body visual review absent                 |
| VEH-008 | `PASS`    | Exact authored spawn and zero immediate speed on all engines |
| VEH-009 | `NOT RUN` | Pause progression comparison absent                          |
| VEH-010 | `NOT RUN` | 60/120/144 trajectory comparison absent                      |
| VEH-011 | `NOT RUN` | High-refresh interpolation review absent                     |
| VEH-012 | `NOT RUN` | No versioned handling result set                             |
| VEH-013 | `PASS`    | Chromium service-brake, drift, yaw, speed and spark evidence |

## Tuning procedure

1. Run the unchanged mapping and archive the environment/result.
2. Compare against public Alpha measurements or supplied visual evidence.
3. Tune only isolated runtime inertia, stiffness, damping, friction and force
   caps after a reproducible mismatch.
4. Never overwrite the protected source-reference block.
5. Append before/after evidence and affected IDs to
   [DEVIATIONS.md](DEVIATIONS.md).
6. Rerun the complete harness, platform passenger, cube collision, reset soak
   and visual checks after a handling change.
