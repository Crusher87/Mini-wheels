# Acceptance tests

Canonical source: GDD Section 21  
Status date: 2026-07-28 (America/Vancouver)  
Profile: A unless noted

## Evidence rules

| Status    | Meaning                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------- |
| `PASS`    | The complete stated condition has reproducible current evidence                                         |
| `PARTIAL` | Implementation and/or narrower automation exists, but the complete condition is not currently evidenced |
| `NOT RUN` | The required execution or human review has not occurred                                                 |
| `FAIL`    | The complete condition was executed and failed                                                          |
| `BLOCKED` | A named external blocker prevents execution                                                             |

The release candidate passes format, lint, strict type checking, 19 unit files
with 112 tests, and the complete three-engine functional matrix. The final
Playwright matrix contains 34 defined cases per project: 27 functional cases
pass on each of Chromium, Firefox, and WebKit; `PROD-001` and six native visual
cases are intentionally skipped there and pass in their dedicated commands.
The combined result is 81 passed / 21 intentional skips.

## Final browser-results block

| Field                                 | Result                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------- |
| Revision                              | Assigned by the final release commit / Sites version                      |
| Command                               | `npm run test:browser:matrix`                                             |
| Browser configuration                 | Playwright 1.62.0; Chromium, Firefox 153, and WebKit 26.5 device profiles |
| Test count                            | 34 defined per project across 11 spec files                               |
| Final result after latest integration | `PASS` — 81 passed / 21 intentional dedicated-suite skips                 |
| HTML report                           | `playwright-report/` (local generated artifact; not committed)            |
| Native visual result                  | `PASS` — 6/6 scenarios, seven retained PNG files                          |
| Production preview                    | `PASS` — 1/1 `PROD-001`                                                   |
| Real GPU/controllers                  | `NOT RUN`                                                                 |

## 21.1 Boot and flow

| ID       | Test         | Status | Current evidence / open condition                                                                 |
| -------- | ------------ | ------ | ------------------------------------------------------------------------------------------------- |
| FLOW-001 | Fresh launch | `PASS` | Three-engine boot verifies the trusted activation UI and a clean console                          |
| FLOW-002 | Activation   | `PASS` | Audio is absent before activation; available contexts unlock and unavailable output fails softly  |
| FLOW-003 | Play Sandbox | `PASS` | All engines wait through Rapier/renderer precompile and enter a live `playing` session            |
| FLOW-004 | Pause        | `PASS` | Keyboard P, controller Menu, blur, hidden-page, disconnect, and fullscreen-exit paths are covered |
| FLOW-005 | Resume       | `PASS` | Resume clears held input and fixed-step debt; hidden return records zero overload bursts          |
| FLOW-006 | Full reset   | `PASS` | Reset rebuilds a complete clean session and returns to `playing`                                  |
| FLOW-007 | Hidden tab   | `PASS` | Hidden-page return remains paused with frozen state and no catch-up burst                         |
| FLOW-008 | Rebuild soak | `PASS` | 25 Chromium rebuilds plus three Firefox and three WebKit rebuilds remain bounded                  |

## 21.2 Vehicle

| ID      | Test                      | Status    | Current evidence / open condition                                                           |
| ------- | ------------------------- | --------- | ------------------------------------------------------------------------------------------- |
| VEH-001 | Configuration audit       | `PASS`    | `tests/unit/VehicleConfiguration.test.ts` preserves source values and runtime mappings      |
| VEH-002 | Straight acceleration     | `PARTIAL` | Browser smoke checks acceleration, but not quantified heading drift                         |
| VEH-003 | Steering                  | `PASS`    | Unit and three-engine browser telemetry verify the protected 35° command                    |
| VEH-004 | Hard braking              | `PASS`    | Unit and three-engine browser telemetry verify the 20,000 opposing force                    |
| VEH-005 | Reverse transition        | `PARTIAL` | Unit force-selection logic exists; no measured live transition result                       |
| VEH-006 | Airborne                  | `PARTIAL` | Ramp launch browser test exists; collision-spin and representative-run evidence remain open |
| VEH-007 | Wheel visuals             | `NOT RUN` | Interpolation is implemented; high-refresh human/video review is absent                     |
| VEH-008 | Recovery                  | `PASS`    | All engines verify the exact authored one-player spawn and zero immediate speed             |
| VEH-009 | Pause                     | `NOT RUN` | No recorded vehicle/wheel/exhaust progression comparison while paused                       |
| VEH-010 | Refresh-rate independence | `NOT RUN` | Fixed-loop unit coverage is not a 60/120/144 Hz vehicle trajectory comparison               |
| VEH-011 | Render interpolation      | `NOT RUN` | Chassis/wheel interpolation exists; high-refresh visual evidence is absent                  |
| VEH-012 | Calibration report        | `NOT RUN` | Recorder/CSV unit tests pass, but no handling result set has been recorded                  |

## 21.3 Multiplayer and input

| ID     | Test                  | Status    | Current evidence / open condition                                                                             |
| ------ | --------------------- | --------- | ------------------------------------------------------------------------------------------------------------- |
| MP-001 | Player-count range    | `PASS`    | `tests/unit/PlayerSpawn.test.ts` rejects values outside 1–10; UI range is bounded                             |
| MP-002 | Ring formula          | `PASS`    | `tests/unit/PlayerSpawn.test.ts` verifies N/2 for N=1,4,10 (and 7)                                            |
| MP-003 | Inward orientation    | `PASS`    | The same unit suite verifies every local forward vector toward center                                         |
| MP-004 | Stable identity       | `PASS`    | Three-engine browser specs cover colors, indices, controls, markers, and resets                               |
| MP-005 | Mixed devices         | `PARTIAL` | `tests/browser/input.spec.ts` uses two keyboards plus two synthetic standard pads; real hardware not reviewed |
| MP-006 | Conflict warning      | `PASS`    | All engines verify key overlap, reserved pause, and exclusive controller ownership                            |
| MP-007 | Color independence    | `PARTIAL` | A retained grayscale P1–P10 symbol/label capture passes technical review; independent identification remains  |
| MP-008 | Activation visibility | `PASS`    | Gamepad polling/assignment begins only after trusted activation; missing API falls back to keyboard           |
| MP-009 | Blur safety           | `PASS`    | All engines verify live 2,000 N input, blur pause/clear, and zero force after resume                          |

## 21.4 Camera

| ID      | Test         | Status    | Current evidence / open condition                                                                  |
| ------- | ------------ | --------- | -------------------------------------------------------------------------------------------------- |
| CAM-001 | Minimum size | `PASS`    | `tests/unit/GroupCameraController.test.ts` verifies the minimum half-height of 13                  |
| CAM-002 | Centroid     | `PASS`    | Unit tests verify active-target centroid and ignore invalid/inactive targets                       |
| CAM-003 | Group fit    | `PARTIAL` | Fit math and a ten-player browser spread test exist; full on-screen projection assertion is absent |
| CAM-004 | Aspect ratio | `PARTIAL` | Math covers 4:3, 16:9 and 21:9 cases; 16:10 and live viewport matrix remain open                   |
| CAM-005 | Smoothness   | `NOT RUN` | Exponential smoothing is unit-tested; visual steady-speed jitter review is absent                  |
| CAM-006 | Reset        | `PASS`    | Unit test clears targets and restores the exact default rig                                        |

## 21.5 Sandbox props

| ID      | Test               | Status    | Current evidence / open condition                                                                     |
| ------- | ------------------ | --------- | ----------------------------------------------------------------------------------------------------- |
| MAP-001 | Ground             | `PARTIAL` | Unit config verifies 80 × 80; live traversal/open-edge final run pending                              |
| MAP-002 | Cube count         | `PASS`    | `tests/unit/SandboxLayout.test.ts` verifies 96 unique 6 × 4 × 4 positions                             |
| MAP-003 | Cube reset         | `PASS`    | 25-reset run checks authored transforms and zero velocities on every rebuild                          |
| MAP-004 | Balls              | `PASS`    | Unit config verifies three radius-0.5, mass-50 balls and exact positions                              |
| MAP-005 | Lift timing        | `PASS`    | `tests/unit/KinematicMoverMath.test.ts` verifies 7.95 s travel and 2 s holds                          |
| MAP-006 | Shuttle timing     | `PASS`    | The same unit file verifies 6 s travel and 2 s holds                                                  |
| MAP-007 | Platform passenger | `PASS`    | Repeated live runs ride lift and shuttle; measured shuttle carry is 1.30–1.40 m with <0.016 m Z drift |
| MAP-008 | Rotating contact   | `PASS`    | All engines verify momentum transfer from the protected legacy-speed bar                              |

## 21.6 Boosters and portals

| ID      | Test             | Status    | Current evidence / open condition                                                                                  |
| ------- | ---------------- | --------- | ------------------------------------------------------------------------------------------------------------------ |
| INT-001 | Floor boost      | `PASS`    | Latest targeted Chromium run passed exact live velocity-delta assertions                                           |
| INT-002 | Ramp boost       | `PASS`    | Latest targeted run passed unnormalized `(-1,+1,+5)` for a ball                                                    |
| INT-003 | Booster cooldown | `PASS`    | Unit cooldown/enter-exit coverage plus latest targeted live cooldown assertion passed                              |
| INT-004 | Booster VFX      | `PASS`    | Latest targeted telemetry verified exactly five requested/emitted particles per activation                         |
| INT-005 | Portal speed     | `PASS`    | Unit and three-engine live specs assert 80% output magnitude                                                       |
| INT-006 | Portal direction | `PASS`    | Unit/live specs assert exit-forward direction; endpoint rotations remain recorded reconstruction choices           |
| INT-007 | Portal transform | `PARTIAL` | Live spec checks positions and implementation applies destination rotation; rotation telemetry assertion is absent |
| INT-008 | Portal stability | `PASS`    | Both bodies remain locked through the 0.20 s immediate re-entry window; no infinite loop occurs                    |
| INT-009 | Dynamic props    | `PASS`    | All engines send cars and balls through boosters and both portal orientations                                      |

## 21.7 UI, options and accessibility

| ID       | Test                   | Status    | Current evidence / open condition                                                                             |
| -------- | ---------------------- | --------- | ------------------------------------------------------------------------------------------------------------- |
| UI-001   | Complete navigation    | `PARTIAL` | Focused 3/3 UI run covers keyboard and synthetic controller routes; full pointer/every-panel matrix is absent |
| UI-002   | Disabled content       | `PASS`    | Focused Chromium run verifies Sandbox enabled and four unfinished cards disabled                              |
| UI-003   | Render scale           | `PASS`    | All engines verify device-DPR-aware 50% buffers and the DPR-2 cap                                             |
| UI-004   | Fullscreen             | `PARTIAL` | Lifecycle browser spec injects denial and fullscreen exit; real accepted fullscreen remains untested          |
| UI-005   | Anti-aliasing          | `PARTIAL` | Unit mapping covers Off/FXAA/SMAA/High and browser spec inspects passes; visual efficacy not reviewed         |
| UI-006   | AO/vignette            | `PARTIAL` | Persistence and pass enablement are automated; visible-effect human check is absent                           |
| UI-007   | Browser exit semantics | `PASS`    | Static UI audit: only Return to Title / Exit Fullscreen are offered                                           |
| A11Y-001 | Rebinding              | `PASS`    | All engines verify four-direction capture, conflict warnings, reserved pause, persistence, and reset          |
| A11Y-002 | Focus                  | `PARTIAL` | Semantic controls and 4 px white + dark keyline focus style exist; measured contrast review is absent         |
| A11Y-003 | Marker contrast        | `NOT RUN` | P1–P10 text/symbol/keyline implementation exists; background/contrast matrix not reviewed                     |

## 21.8 Performance and soak

| ID       | Test              | Status    | Current evidence / open condition                                                                         |
| -------- | ----------------- | --------- | --------------------------------------------------------------------------------------------------------- |
| PERF-001 | Worst collision   | `PARTIAL` | Ten-car cube-impact browser harness exists; no named minimum hardware or 30 FPS measurement               |
| PERF-002 | Normal play       | `NOT RUN` | No 1080p Medium real-GPU benchmark                                                                        |
| PERF-003 | Physics health    | `PARTIAL` | Short cube-impact finite-number check exists; required 30-minute soak is not run                          |
| PERF-004 | Memory            | `PARTIAL` | 25 rebuilds pass strict scene/physics/audio/particle/GPU-resource bounds; browser heap trend remains open |
| PERF-005 | Hot paths         | `PARTIAL` | Typed-array monitors/pools and unit tests exist; no GC/long-task capture                                  |
| PERF-006 | Frame percentiles | `PARTIAL` | Runtime p50/p95/p99 telemetry is unit-tested; no target-hardware result                                   |
| PERF-007 | Draw calls        | `PASS`    | Every engine verifies all 96 cube visuals remain one instanced draw batch                                 |

## 21.9 Browser lifecycle and deployment

| ID      | Test                | Status    | Current evidence / open condition                                                                                      |
| ------- | ------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------- |
| WEB-001 | Production WASM     | `PARTIAL` | Production output contains hashed JS and external Rapier WASM; HTTPS preview/MIME trace is absent                      |
| WEB-002 | Audio policy        | `PARTIAL` | All engines verify pre-activation absence, bounded voices, pause, and soft unavailable fallback; listening review open |
| WEB-003 | Background policy   | `PASS`    | All engines verify blur/hidden pause, input clearing, frozen state, and zero catch-up overload                         |
| WEB-004 | Fullscreen Escape   | `PARTIAL` | Lifecycle spec injects fullscreen exit and asserts pause; native browser fullscreen transition is untested             |
| WEB-005 | Resize              | `PARTIAL` | Renderer/composer/camera resizing is implemented and math-tested; DOM/canvas live alignment matrix is absent           |
| WEB-006 | Context loss        | `PASS`    | All engines dispatch cancelable context loss and verify the stopped/reload error state                                 |
| WEB-007 | Gamepad unavailable | `PASS`    | All engines remove the Gamepad API and verify exact live keyboard engine force                                         |
| WEB-008 | Storage failure     | `PASS`    | `tests/unit/SettingsService.test.ts` covers corruption, unavailable storage and field-level fallback                   |
| WEB-009 | Cached upgrade      | `NOT RUN` | No deployment or cache-upgrade test                                                                                    |
| WEB-010 | Embed permissions   | `PARTIAL` | `public/embed-example.html` and `_headers` declare fullscreen/gamepad permissions; hosted iframe test is absent        |

## 21.10 Visual fidelity

| ID      | Test                   | Status    | Current evidence / open condition                                                                  |
| ------- | ---------------------- | --------- | -------------------------------------------------------------------------------------------------- |
| VIS-001 | Palette                | `PARTIAL` | Native current/reference pairs received technical review; sampled colorimetry is absent            |
| VIS-002 | Car silhouette         | `NOT RUN` | Procedural car exists; front/side/top comparison is absent                                         |
| VIS-003 | Shadows                | `PARTIAL` | Six native captures show cast/contact shadows; independent art approval remains                    |
| VIS-004 | Portal material        | `PASS`    | Technical review confirms readable horizontal/upright translucent cyan volumes and depth ordering  |
| VIS-005 | Cube impact            | `PASS`    | Native evidence retains a readable standing mass with 20+ displaced complete cubes                 |
| VIS-006 | Exhaust                | `PASS`    | Native evidence confirms bounded player-colored dotted exhaust at the reviewed 0.12 size           |
| VIS-007 | Ten-player read        | `PASS`    | Color and grayscale companion captures show ten labels/symbols and stable shared-camera framing    |
| VIS-008 | Reference compositions | `PASS`    | Six clean-room native captures are generated, dimension-checked, and technically reviewed          |
| VIS-009 | Browser consistency    | `PARTIAL` | Functional rendering passes in all engines; equivalent Firefox/WebKit visual baselines remain open |

## Release rule

Profile A is not release-complete while any applicable row is `PARTIAL`,
`NOT RUN`, `FAIL` or `BLOCKED`. A reconstruction decision may explain a
difference, but it does not convert missing performance, browser, visual,
accessibility or legal review into a pass.
