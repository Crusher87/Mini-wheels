# Browser support and performance

Status date: 2026-07-28 (America/Vancouver)  
Relevant acceptance IDs: `PERF-001`–`PERF-007`, `WEB-001`–`WEB-010`  
Verification status: `PARTIAL — INSTRUMENTATION EXISTS; RELEASE BENCHMARKS NOT RUN`

No result in this document is a real-GPU performance certification. The
minimum target hardware and required 30-minute soak remain open. The complete
functional matrix, 25-reset Chromium resource soak, three-engine short rebuild
soak, native visual suite, and production-preview smoke are recorded below.

## Exact tool/runtime snapshot

| Component                        | Version / configuration                                          |
| -------------------------------- | ---------------------------------------------------------------- |
| Node used for current unit audit | 24.14.1                                                          |
| npm                              | 11.12.0                                                          |
| Three.js                         | 0.185.1                                                          |
| Rapier                           | 0.19.3                                                           |
| Vite                             | 8.1.5                                                            |
| Playwright                       | 1.62.0                                                           |
| Default Playwright project       | Chromium / Desktop Chrome device profile                         |
| Cross-browser matrix             | `npm run test:browser:matrix` runs Chromium, Firefox, and WebKit |
| Physics                          | 0.02 s fixed step, 0.25 s frame clamp, five substeps/render      |
| Effective DPR cap                | 2                                                                |

The final functional matrix passed 81 runnable cases with 21 intentional skips:
27 passes per engine; the production smoke and six native visual scenarios run
separately. The matrix completed in 5.1 minutes on the managed Windows runner.
Exact GPU/driver details were not captured, so software-renderer timing and
overload warnings are not release FPS evidence.

## Support policy

Profile A targets current and previous major desktop Chromium, Firefox and
Safari/WebKit releases, subject to capability detection:

| Capability                       | Requirement / fallback                                                |
| -------------------------------- | --------------------------------------------------------------------- |
| ES modules, WebAssembly, WebGL 2 | Required; startup must show a useful error                            |
| Keyboard and Pointer Events      | Required                                                              |
| Web Audio                        | Optional to successful play; trusted activation required before sound |
| `localStorage`                   | Preferred; exceptions/corruption fall back per field                  |
| Gamepad API                      | Optional; keyboard play remains complete                              |
| Fullscreen API                   | Optional; denial leaves page-mode play usable                         |
| WebGPU                           | Not used                                                              |
| Touch gameplay                   | Out of Profile A scope                                                |

The current Playwright builds pass the full functional collection. Safari on
actual macOS and current/previous stable-version breadth remain open.

On this managed Windows host, Playwright Firefox's first `about:blank` content
process crashes when its nested Mozilla sandbox runs inside the outer managed
sandbox. `playwright.config.ts` therefore sets
`MOZ_DISABLE_CONTENT_SANDBOX=1` for the Firefox test child on Windows only.
Firefox otherwise loads the unchanged application and passes the same suite.
This is test-runner containment configuration, not a production browser flag.

## Browser automation

`npm run test:browser` starts Vite at `http://127.0.0.1:4173`, waits for the
server, runs Playwright serially and terminates the server.

By default, the runner sets an E2E low-quality profile:

- render scale 0.5;
- anti-aliasing off;
- AO off;
- vignette off;
- Low shadows.

This keeps broad functional tests stable but cannot support Medium/1080p
performance or visual-fidelity claims. Use:

```sh
npm run test:browser -- --native-quality
npm run test:browser:matrix -- --native-quality
```

for native-quality and cross-engine work. Hardware benchmarks still require a
dedicated controlled run rather than a CI pass/fail alone.

Browser specs include boot, input, arena, interactables, render settings,
reset/collision soak, lifecycle faults, UI, production, and visual evidence.
There are 34 defined cases across 11 files per project.

## Runtime telemetry

`RuntimePerformanceMonitor` stores frame and physics-step timings in fixed
7,200-sample typed-array rings. Snapshot work, including sorting, occurs only
when explicitly requested. It reports:

- frame and physics sample counts;
- average, p50, p95, p99 and maximum milliseconds;
- average FPS and p95 frame-pacing FPS;
- physics substep count;
- overload count and discarded simulation seconds.

Renderer debug telemetry reports geometries, textures, programs, draw calls,
triangles, lines and points. World telemetry exposes rigid-body/collider
counts, transforms and finite velocities. Unit coverage is in
`tests/unit/RuntimePerformanceMonitor.test.ts`.

Not currently captured: reliable GPU duration, long tasks, garbage-collection
events, complete JS heap, power mode or driver information.

## Fixed-step contract

```text
fixedDt = 0.02 seconds
maxFrameDelta = 0.25 seconds
maxPhysicsStepsPerRender = 5
```

When the cap is reached, the loop records overload and discards excess
whole-step debt. It resets the accumulator across pause/resume/reset and hidden
page transitions. `tests/unit/FixedStepLoop.test.ts` passes, but equivalent
live vehicle trajectories at 60/120/144 Hz are `NOT RUN`.

## Performance status

| Metric               | Target                                                         | Status / evidence                                           |
| -------------------- | -------------------------------------------------------------- | ----------------------------------------------------------- |
| Normal presentation  | 60 FPS at 1920 × 1080, Medium                                  | `NOT RUN`                                                   |
| Worst collision      | ≥30 FPS for 10 cars hitting 96 cubes on named minimum hardware | `PARTIAL`; harness exists, no FPS threshold/hardware        |
| Physics cadence      | Stable 50 Hz                                                   | `PARTIAL`; loop unit-tested, real load not certified        |
| Input response       | Motion within two rendered frames at 60 FPS                    | `NOT RUN`                                                   |
| Smooth interpolation | No visible 50 Hz stepping at 60–144 Hz                         | `NOT RUN`                                                   |
| Long tasks           | None >50 ms in ordinary play                                   | `NOT RUN`                                                   |
| GC hitches           | No recurring hot-loop hitch after warm-up                      | `PARTIAL`; typed-array/pool design, no trace                |
| Shader compilation   | No recurring per-frame compilation                             | `PARTIAL`; precompile path exists, trace absent             |
| Cube visuals         | One instanced draw batch                                       | `PASS`; asserted in Chromium, Firefox, and WebKit           |
| Particles/audio      | Fixed capacity / voice caps                                    | `PASS` for configuration/unit behavior; real load pending   |
| Pixel ratio          | Capped at 2                                                    | `PASS` in render-quality unit tests                         |
| Physics health       | No NaN/Infinity for 30 minutes                                 | `PARTIAL`; short collision finite check only                |
| Reset resources      | No unbounded trend across 25 resets                            | `PASS`; 25 Chromium resets, plus three on each other engine |

### Implemented performance harnesses

`tests/browser/soak.spec.ts` defines:

- 25 full session rebuilds, checking one session root, stable body/collider/root
  counts, reset cube/ball transforms and velocities, clean camera/marker/
  particle/interactable state, and bounded renderer resources;
- a 2.5-second ten-car impact into the 96-cube wall, checking cube displacement,
  finite car/cube values, timing samples and one cube visual batch.

The second test does not assert ≥30 FPS and is not a 30-minute soak.

The reset soak initially exposed a real directional-light shadow render-target
leak. `WorldSession.dispose()` now traverses session lights and calls
`DirectionalLight.shadow.dispose()`. The repeated run stays within +1 geometry,
texture, and program of the first rebuilt session, with one 512-capacity
particle batch and bounded audio voices/nodes.

## Required benchmark scenarios

| Scenario                    |           Duration / repetitions | Status                                     |
| --------------------------- | -------------------------------: | ------------------------------------------ |
| Idle, one car, Medium 1080p |          5 minutes after warm-up | `NOT RUN`                                  |
| Normal four-car sandbox     |                       10 minutes | `NOT RUN`                                  |
| Ten-player camera spread    |                        5 minutes | `NOT RUN`                                  |
| Ten-car cube impact         |                       30 impacts | `NOT RUN`                                  |
| Both platform passengers    |                   10 cycles each | `NOT RUN`                                  |
| Portal/booster stress       |                       10 minutes | `NOT RUN`                                  |
| Mixed physics soak          |                       30 minutes | `NOT RUN`                                  |
| Full reset soak             |                        25 resets | `PASS`; 25 Chromium / 3 Firefox / 3 WebKit |
| Resize/fullscreen           |                        25 cycles | `NOT RUN`                                  |
| Hidden/resume               | 10 cycles including ≥30 s hidden | `NOT RUN`                                  |

Every result must include immutable revision, build mode, exact browser/OS,
CPU/GPU/driver, memory/power mode, viewport, DPR, quality options, duration,
frame/physics distributions, overload/debt, bodies, renderer counts and
available heap/long-task evidence.

## Lifecycle implementation

| Event                          | Implemented response                                                         | Verification                                                |
| ------------------------------ | ---------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Hidden tab                     | Pause, clear fixed-step debt and suspend audio                               | `PASS` in all three automated engines                       |
| Window blur                    | Clear input and pause                                                        | `PASS` in all three automated engines                       |
| Return from hidden/blur        | Remain paused; resume explicitly resets input/debt                           | `PASS`; zero catch-up overload and zero held force          |
| Fullscreen exit                | Update UI and pause if playing                                               | Injected lifecycle spec exists; native transition `NOT RUN` |
| Resize                         | Resize renderer/composer and camera; DOM markers project each frame          | Live viewport/alignment matrix `NOT RUN`                    |
| Gamepad disconnect             | Clear assignment and pause if active player is affected                      | `PASS` synthetic matrix; real device `NOT RUN`              |
| WebGL context loss             | Prevent default restoration behavior, stop normal play and show reload error | `PASS` synthetic matrix                                     |
| Context restore                | Show recovery guidance; reload is the safe rebuild path                      | Browser test `NOT RUN`                                      |
| Storage exception/corruption   | Validate per field and use defaults/in-memory state                          | Unit tests `PASS`                                           |
| Unhandled initialization error | Enter error screen with reload action                                        | Error-injection test `NOT RUN`                              |

## Production delivery

The Vite configuration uses relative base paths, ES2022 output, no source maps,
and excludes Rapier from dependency prebundling so its JavaScript glue and WASM
share one externref heap. The current build emits hashed application/Rapier JS,
hashed CSS and external hashed Rapier WASM.

`public/_headers` declares:

- `nosniff` and no-referrer policies;
- fullscreen/gamepad permissions for self;
- revalidated HTML;
- immutable assets;
- `application/wasm` and immutable caching for WASM.

`public/embed-example.html` supplies `allow="fullscreen; gamepad"`.

These files are hosting configuration intent only. No production URL has been
verified.

| Delivery check                            | Status                                                       |
| ----------------------------------------- | ------------------------------------------------------------ |
| Optimized build emits external WASM       | `PASS`; final build inspection                               |
| Production preview initializes Rapier     | `PASS`; `PROD-001` with no development API                   |
| HTTPS WASM MIME                           | `NOT RUN`                                                    |
| Atomic HTML/JS/WASM release               | `NOT RUN` on a host                                          |
| Cache policy applied by host              | `NOT RUN`                                                    |
| Fresh and repeat load                     | `NOT RUN`                                                    |
| Top-level fullscreen/audio/gamepad policy | `NOT RUN`                                                    |
| Intended iframe permissions               | `PARTIAL`; fixture exists, hosted test absent                |
| Network/asset failure recovery            | `NOT RUN`                                                    |
| No debug/source-map/unlicensed asset      | `PASS` engineering inspection; independent legal review open |

## Acceptance summary

| Range                 | Status    | Blocking evidence                                                                |
| --------------------- | --------- | -------------------------------------------------------------------------------- |
| `PERF-001`–`PERF-007` | `PARTIAL` | No named-hardware FPS/frame-pacing/30-minute result                              |
| `WEB-001`–`WEB-010`   | `PARTIAL` | Functional matrix/lifecycle pass; hosted cache/MIME and failure injection remain |
