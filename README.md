# Mini Wheels browser reconstruction

This repository is a clean-room, original-asset browser recreation of the publicly observable _Mini Wheels_ Alpha 0.0.6 experience. Profile A is the release target: a 1–10 player local physics sandbox built with strict TypeScript, Three.js `WebGLRenderer`, Rapier 3D, and semantic HTML/CSS.

The canonical specification is
`Mini_Wheels_ThreeJS_Reconstruction_Package/Mini_Wheels_ThreeJS_Reconstruction_GDD.md`.
That package and its six reference images are read-only evidence. Implementation
files belong outside the package directory.

## Current state

The Profile A sandbox, vehicles, 1–10 player roster, device setup, arena toys,
front end, render options, procedural VFX/audio and accessibility settings are
implemented. The current revision passes format, lint, strict type checking,
113 unit tests, all 29 Chromium functional cases, the corrected
input/layout/controller routes on Firefox and WebKit, a 25-reset Chromium
resource soak, native-quality visual capture, and optimized production-preview
smoke. Named real-GPU benchmarks, the 30-minute soak,
physical-controller/assistive-technology review, and independent legal approval
remain explicit external gates. See
[Implementation status](docs/IMPLEMENTATION_STATUS.md) and
[Acceptance tests](docs/ACCEPTANCE_TESTS.md).

Profile C modes, extra arenas, networking, AI opponents, progression, and a
level editor are intentionally out of scope until Profile A passes its
acceptance tests.

## Prerequisites

- A current Node.js release compatible with the version declared by the project
  manifest.
- npm, using the committed lockfile.
- A current desktop Chromium, Firefox, or Safari/WebKit browser with WebGL 2 and
  WebAssembly.
- HTTPS for production. `localhost` is suitable for development.
- A keyboard; standard-mapped gamepads are optional.

## Install

```sh
npm ci
```

Use `npm ci`, rather than an unpinned install, when reproducing a checked-in
build. If the manifest or lockfile is not present yet, Milestone 0 is not
complete.

## Development

```sh
npm run dev
```

Open the local URL printed by the development server. The page should stop at a
trusted-interaction gate before audio or controller discovery is activated.

The intended script contract is:

| Command                           | Purpose                                                      |
| --------------------------------- | ------------------------------------------------------------ |
| `npm run dev`                     | Start the local Vite/ESM development server                  |
| `npm run typecheck`               | Run strict TypeScript checking                               |
| `npm run lint`                    | Run static lint checks                                       |
| `npm run test`                    | Run 113 unit tests                                           |
| `npm run test:browser`            | Run the complete Chromium functional suite                   |
| `npm run test:browser:matrix`     | Run Chromium, Firefox, and WebKit functional suites          |
| `npm run test:visual`             | Regenerate six native-quality visual scenarios               |
| `npm run test:browser:production` | Build and smoke-test the production output without debug API |
| `npm run test:all`                | Run the standard local release chain                         |
| `npm run build`                   | Produce the optimized static build                           |
| `npm run preview`                 | Serve the production build locally                           |

`package.json` is the authority for the scripts currently available. A missing
script is an incomplete Milestone 0/8 deliverable, not an instruction to skip
that verification.

## Verification

Before describing a milestone or acceptance test as complete, run the relevant
checks and link the output or committed report:

```sh
npm run typecheck
npm run lint
npm run test
npm run test:browser
npm run test:browser:matrix
npm run test:visual
npm run test:browser:production
npm run build
```

Vehicle behavior also requires the scripted calibration harness, visual
comparison, refresh-rate checks, and the reset/performance soak described in:

- [Vehicle calibration](docs/VEHICLE_CALIBRATION.md)
- [Browser support and performance](docs/BROWSER_PERFORMANCE.md)
- [Accessibility](docs/ACCESSIBILITY.md)

Compilation alone is not acceptance evidence.

The browser runner defaults to Chromium and a test-only 50%/AA-off graphics
profile. `npm run test:browser:matrix` adds Firefox and WebKit.
`npm run test:visual` explicitly restores native presentation quality for
evidence capture. The managed Windows runner disables only Firefox's nested
content-process sandbox because that sandbox crashes inside the already
sandboxed runner; production browser security is unaffected.

## Production build and deployment

```sh
npm run build
npm run preview
```

Deploy the generated static output directory from the build configuration.
Production hosting must:

- use HTTPS;
- serve external Rapier assets with `application/wasm`;
- serve the HTML shell with short or no caching;
- serve content-hashed JS, WASM, audio, and font assets with immutable caching;
- keep the HTML, JavaScript, and WASM release versions atomic;
- grant `fullscreen` and `gamepad` permissions when embedded in an iframe.

A fresh uncached load and a cached repeat load must both pass the Milestone 8
checks before release. Do not deploy a development server as production.

## Controls

- Player 1 keyboard default: `W`, `A`, `S`, `D`; brake/drift is `Left Shift`.
- Every keyboard player's Forward, Reverse, Left, Right, and Brake/Drift bindings are configurable.
- Standard gamepads use the left stick for drive and steering; either shoulder button brakes/drifts.
- Pause: `Escape` when the browser delivers it, `P`, or gamepad Menu/Start.
- The browser may reserve `Escape` to leave fullscreen; a fullscreen exit pauses
  gameplay.

There is no jump, weapon, boost button, camera control, or manual respawn
action. Brake/Drift is a user-directed browser gameplay extension.

## Evidence and change policy

Requirements retain the GDD's evidence labels:

- `CONFIRMED` — authoritative source behavior or data.
- `OBSERVED` — visual or behavioral target.
- `INFERRED` — supported but not directly established.
- `DECISION` — a browser reconstruction choice.

Source-reference vehicle values remain immutable and inspectable. Rapier runtime
mappings live separately. Any meaningful difference must be measured and
recorded in [Deviations](docs/DEVIATIONS.md); protected gameplay targets may not
be changed silently.

Do not copy the original executable, code, logo, fonts, textures, audio, or
other unlicensed assets into this project.

## Documentation

| Document                                                       | Purpose                                                            |
| -------------------------------------------------------------- | ------------------------------------------------------------------ |
| [Implementation status](docs/IMPLEMENTATION_STATUS.md)         | Milestone 0–6 and 8 progress and gates                             |
| [Acceptance tests](docs/ACCEPTANCE_TESTS.md)                   | Every GDD Section 21 test ID and result                            |
| [Deviations](docs/DEVIATIONS.md)                               | Evidence labels, reconstruction decisions, and measured deviations |
| [Vehicle calibration](docs/VEHICLE_CALIBRATION.md)             | Source/runtime mapping and handling measurements                   |
| [Browser support and performance](docs/BROWSER_PERFORMANCE.md) | Browser matrix, lifecycle checks, and budgets                      |
| [Accessibility](docs/ACCESSIBILITY.md)                         | Required and recommended usability verification                    |
| [Dependencies and licenses](docs/DEPENDENCIES_LICENSES.md)     | Dependency, asset, and license inventory                           |
| [Visual evidence methodology](docs/visual-evidence/README.md)  | Clean-room capture fixtures and human-review template              |
