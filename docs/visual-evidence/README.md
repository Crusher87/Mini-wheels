# Visual evidence methodology

This folder contains current-render evidence for GDD checks `VIS-001` through
`VIS-008`. It is not an approved pixel-regression baseline and does not by
itself satisfy `VIS-009`.

The Playwright fixture in
`tests/browser/visual-evidence.spec.ts` recreates the six supplied reference
subjects using only the development debug API. It does not read, copy, embed,
or ship any reference PNG, logo, caption, font, or promotional asset.

## Capture contract

- Browser: project Chromium, headless, device-pixel ratio 1.
- Output: PNG with no browser chrome at each reference's native viewport:
  `1536 × 863`, `1536 × 1023`, or `1536 × 1039`.
- Rendering: render scale 1, SMAA, medium shadows, ambient occlusion on,
  vignette on, full particle density, sRGB output.
- Simulation: normal 0.02-second fixed step while staging, then paused before
  capture. Three rendered frames refresh interpolation, transparency,
  shadows, and post-processing after staging.
- UI: gameplay screens and markers are excluded from the six reference-subject
  captures. A separate grayscale companion includes the P1–P10 markers.
- Camera: the production shared camera and fixed orientation remain unchanged.
  Because the debug API does not expose a fixture-only camera lock, close
  subjects use a declared test-only CSS canvas crop (`canvasZoom`) around that
  camera. This preserves the running build but is not equivalent to a
  full-resolution locked-camera baseline.
- Randomness: fixture IDs retain seeds `6006` through `6011` for future seeded
  effects. Current staging is closed-form and does not call random APIs.

Run:

```text
npm run test:visual
```

The command overwrites only the files in `current-render/`.

## Evidence map and review template

| Current capture                                    | Reference subject and hierarchy                                                                         | Primary checks                                                   | canvasZoom | Technical review |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------: | ---------------- |
| `1000006006-portals-current.png`                   | Horizontal and upright cyan portals separated by open space; small red car as scale                     | `VIS-001`, `VIS-003`, `VIS-004`, `VIS-008`                       |       1.25 | `PASS`           |
| `1000006007-platform-current.png`                  | Red car on thin elevated shuttle beside the 4 × 8 × 4 neutral column                                    | `VIS-002`, `VIS-003`, `VIS-008`                                  |       2.70 | `PASS`           |
| `1000006008-pristine-cubes-current.png`            | Intact 96-cube green mass left; P1 and dotted red exhaust right                                         | `VIS-001`, `VIS-002`, `VIS-003`, `VIS-005`, `VIS-006`, `VIS-008` |       2.05 | `PASS`           |
| `1000006009-ramp-launch-current.png`               | Authored ramp/booster leading to an airborne red car and detached shadow                                | `VIS-001`, `VIS-003`, `VIS-006`, `VIS-008`                       |       2.00 | `PASS`           |
| `1000006010-cube-impact-current.png`               | Standing green rear/top mass plus 20+ deterministically displaced complete cubes and red approach trail | `VIS-003`, `VIS-005`, `VIS-006`, `VIS-008`                       |       1.85 | `PASS`           |
| `1000006011-ten-player-current.png`                | Ten source colors in an outward-facing ring with an empty center and inward trails                      | `VIS-001`, `VIS-002`, `VIS-003`, `VIS-006`, `VIS-007`, `VIS-008` |       1.60 | `PASS`           |
| `vis-007-ten-player-grayscale-markers-current.png` | CSS grayscale companion of the ten-player ring with P1–P10 symbols/labels                               | `VIS-007` and color-independent readability support              |       1.60 | `PASS`           |

## Technical review record

Reviewer/date: Codex technical game-direction review, 2026-07-28  
Browser: native-quality Playwright Chromium, DPR 1  
Result: `PASS` for clean-room subject staging and current release evidence

- Both portal orientations remain distinct, translucent, and depth-readable;
  the revised crop includes the small red scale car.
- The shuttle image reads as an elevated passenger/contact case.
- The pristine and disrupted cube captures preserve the mass hierarchy and
  complete-cube character.
- The ramp image clearly places P1 airborne beyond the authored launch path.
- Exhaust is legible after the reviewed 0.12 procedural particle-size tuning.
- The ten-player color ring and grayscale companion preserve P1–P10 identity
  through labels, symbols, keylines, and shared-camera framing.
- No supplied logo, caption, font, screenshot, texture, model, or promotional
  asset is included.

Independent project-owner art approval is still recommended. For future
reviews, use this record:

```text
Reviewer/date:
Browser, OS, GPU:
Commit/build:
Result: PASS | NEEDS TUNING | BLOCKED
Subject/framing:
Palette/material:
Lighting/shadow:
Silhouette/readability:
Particle behavior:
Protected promotional assets absent: YES | NO
Notes and approved tolerances:
```

## Limits and follow-up

- These images verify reproducible subject staging and expose the current
  renderer for review; they do not claim perceptual or pixel equality.
- The disrupted-cube image is a deterministic restored pose. Existing live
  collision tests remain necessary so a staged pose cannot conceal broken
  physics.
- The grayscale companion is a simple luminance stress test, not a simulation
  of any specific color-vision deficiency.
- `VIS-002` still needs dedicated front/side/top orthographic silhouette
  captures.
- `VIS-009` remains open until equivalent Firefox and WebKit baselines are
  captured and an explicit cross-browser tolerance is approved.
- A future debug-only camera contract should expose center, orientation,
  half-height, simulation step, and a render-frame barrier. Once available,
  replace CSS crops with native full-resolution camera fixtures before
  approving regression baselines.
