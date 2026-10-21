# Implementation status

Status date: 2026-07-30 (America/Vancouver)
Target: Profile A clean-room browser reconstruction of the Alpha 0.0.6 sandbox  
Canonical plan: GDD Section 20

## Status rules

| Status    | Meaning                                                                                                |
| --------- | ------------------------------------------------------------------------------------------------------ |
| `PASS`    | The stated criterion has current, reproducible evidence                                                |
| `PARTIAL` | Substantial implementation and automated coverage exist, but at least one exit criterion is still open |
| `NOT RUN` | The implementation may exist, but the required verification has not been executed                      |
| `FAIL`    | A required check was executed and failed                                                               |
| `BLOCKED` | A named external condition prevents execution                                                          |

All Profile A software features are implemented. `PARTIAL` below identifies
physical-hardware, long-duration, perceptual, assistive-technology, or legal
sign-off that cannot be inferred from CI.

## Release evidence snapshot

| Evidence                          | Result                                                                                                                                              |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Format, lint, strict type check   | `PASS` — Prettier 3.9.6, ESLint 10.8.0, TypeScript 6.0.3                                                                                            |
| Unit suite                        | `PASS` — 19 files / 113 tests, Vitest 4.1.10                                                                                                        |
| Chromium functional suite         | `PASS` — 29 runnable tests; production and six native visual cases are intentionally separate                                                       |
| Firefox/WebKit matrix             | `PASS WITH RERUN` — Firefox passed 29/29; WebKit passed 28/29 in the full run, then the timing-hardened controller case passed on all three engines |
| Reset/resource soak               | `PASS` — 25 Chromium rebuilds plus three rebuilds on Firefox and WebKit; stable scene, physics, audio, particles, and renderer bounds               |
| Native visual evidence            | `PASS` — six Chromium captures plus the grayscale P1–P10 companion generated at native presentation quality                                         |
| Production preview                | `PASS` — optimized build boots Rapier from external WASM with no development test API                                                               |
| Real controllers / assistive tech | `NOT RUN` — automation uses synthetic standard pads and semantic-DOM inspection                                                                     |
| Named real-GPU benchmark          | `NOT RUN` — no minimum CPU/GPU/driver has been selected                                                                                             |
| Required 30-minute soak           | `NOT RUN` — short collision and rebuild soaks are green                                                                                             |
| Independent legal sign-off        | `NOT RUN` — engineering inventory and runtime license texts are present                                                                             |
| Production hosting                | Pending the release deployment recorded at the end of this build                                                                                    |

## Milestone summary

| Milestone | Scope                             | Status    | Implemented evidence                                                                                                                       | Open non-software or extended gate                                                    |
| --------- | --------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| 0         | Project skeleton                  | `PASS`    | Strict TypeScript/Vite, exact lock, trusted activation, WebGL 2, Rapier WASM, fixed loop, error/lifecycle handling                         | —                                                                                     |
| 1         | One-car handling                  | `PARTIAL` | Ray-cast vehicle, acceleration/steering/service brake, momentum-preserving spark drift, ramp/recovery, interpolation                       | Full handling report and 60/120/144 Hz comparative capture                            |
| 2         | Group camera and ten-player spawn | `PARTIAL` | Stable 1–10 roster, exact ring/inward orientation, group fit/smoothing, ten semantic DOM markers                                           | Live 16:10/resize matrix and independent jitter/readability review                    |
| 3         | Device configuration              | `PARTIAL` | Ten five-action keyboard profiles, rebinding, controller assignment/calibration, shoulder drift, conflicts, safety, schema-v4 persistence  | Representative physical-controller and keyboard-rollover review                       |
| 4         | Sandbox toys                      | `PARTIAL` | Exact arena counts, 96 independently simulated instanced cubes, balls, ramps, movers, boosters, portals, reset, passenger correction       | Named-hardware worst-collision benchmark and 30-minute mixed-physics soak             |
| 5         | Front end and options             | `PARTIAL` | Complete semantic menu/pause flow, disabled out-of-scope modes, live graphics/audio/accessibility options, fullscreen denial/exit fallback | Native accepted-fullscreen, pointer, screen-reader, zoom, and viewport review         |
| 6         | Art, VFX, audio, accessibility    | `PARTIAL` | Original procedural art/audio, bounded particles/voices, reference-subject captures, grayscale marker companion                            | Independent art/contrast/listening/photosensitivity review and cross-engine baselines |
| 8         | Production web release            | `PARTIAL` | Optimized static build, external hashed WASM, production smoke, hardened headers, notices, and cross-engine functional coverage            | Hosted cache/MIME check, real-GPU targets, long soak, and independent legal approval  |

Milestone 7 is intentionally omitted because optional Profile C work is outside
the release target.

## Implemented architecture

- `GameApp` owns renderer, UI, input, audio, settings, the fixed-step loop, and
  one disposable `WorldSession`.
- Rapier 0.19.3 advances at 0.02 seconds with a five-step render-frame cap.
  Chassis and wheel presentation interpolate between fixed states.
- `VehiclePhysicsAdapter` keeps immutable source values separate from Rapier
  mappings. Its named Profile B passenger correction applies averaged
  kinematic surface velocity only when two or more wheels agree on one support.
- One orthographic camera tracks active cars. P1–P10 markers combine text,
  distinct symbols, dark backing, and dual keylines rather than color alone.
- The 80 × 80 open arena includes 96 cubes in one visual draw batch, three
  balls, two ramps, a wall, columns, two rotating bars, two moving platforms,
  four boosters, and two portal pairs.
- Settings schema v4 validates fields independently, migrates v1/v2/v3/unversioned
  documents, and safely falls back when storage or the Gamepad API is absent.
- Rendering uses Render → GTAO → vignette → FXAA/SMAA → output. High quality is
  SMAA plus 1.25× supersampling, capped at effective DPR 2.
- Audio and VFX are application-owned procedural systems. No source model,
  texture, font, audio, logo, or promotional image ships in the application.

## Release command record

| Command / review                  | Result                                                                                                |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `npm run format:check`            | `PASS`                                                                                                |
| `npm run lint`                    | `PASS`                                                                                                |
| `npm run typecheck`               | `PASS`                                                                                                |
| `npm run test`                    | `PASS` — 19 files / 113 tests                                                                         |
| `npm run test:browser:matrix`     | `86 PASS / 1 timing miss / 21 intentional skips`; the corrected menu-pad case then passed 3/3 engines |
| `npm run test:visual`             | `PASS` — six native-quality scenarios; seven PNG evidence files                                       |
| `npm run test:browser:production` | `PASS` — production build and `PROD-001`                                                              |
| 25-reset Chromium soak            | `PASS` — stable bodies, colliders, scene roots, markers, particle capacity, voices, and GPU resources |
| Three-engine short rebuild soak   | `PASS` — 25 Chromium / 3 Firefox / 3 WebKit                                                           |
| Real-controller review            | `NOT RUN`                                                                                             |
| Named real-GPU / 30-minute soak   | `NOT RUN`                                                                                             |
| Independent legal approval        | `NOT RUN`; see [DEPENDENCIES_LICENSES.md](DEPENDENCIES_LICENSES.md)                                   |

`npm ci` was not repeated destructively after the final edits. The installed
tree passes the release gates; the committed lockfile and exact direct pins are
the reproducibility authority.

## Remaining external validation

1. Select and record minimum CPU/GPU/driver hardware, then run the documented
   1080p Medium and worst-collision benchmarks.
2. Run the 30-minute mixed-physics soak and 60/120/144 Hz trajectory comparison.
3. Review physical controllers, keyboard rollover, accepted fullscreen,
   screen-reader flow, 200% browser zoom, and measured contrast.
4. Obtain independent art/audio/photosensitivity and legal/trademark approval.
5. Record the production URL, commit, Sites version, cache behavior, and WASM
   MIME result after deployment.
