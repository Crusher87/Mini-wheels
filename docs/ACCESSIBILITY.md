# Accessibility and usability

Status date: 2026-07-30 (America/Vancouver)
Relevant acceptance IDs: `MP-007`, `UI-001`, `A11Y-001`–`A11Y-003`,
`WEB-003`, `WEB-007`

This is an engineering implementation and test inventory. It is not a WCAG
conformance statement, accessibility certification or legal sign-off.

## Current evidence

- `npm run test` passed 113/113 unit tests. Relevant files are
  `tests/unit/ControllerNavigation.test.ts`,
  `tests/unit/KeyboardBindings.test.ts`,
  `tests/unit/InputHub.test.ts`,
  `tests/unit/MarkerPresentation.test.ts`,
  `tests/unit/SettingsService.test.ts`,
  `tests/unit/AutomaticUprightRecovery.test.ts` and
  `tests/unit/AudioService.test.ts`.
- The full Chromium/Firefox/WebKit matrix passes keyboard and
  synthetic-controller navigation, disabled modes, schema-v4 presentation
  settings, rebinding/conflicts, mixed devices, Menu pause, blur/device-loss
  safety, unavailable Gamepad API, and unavailable audio fallback.
- Native visual evidence includes a technically reviewed grayscale P1–P10
  marker companion.
- Screen-reader, physical-controller, keyboard-rollover,
  color-vision-deficiency, measured contrast, pointer, browser-zoom, and
  reduced-motion human reviews remain `NOT RUN`.

## Implemented behavior

| Requirement                                    | Implementation                                                                                               | Verification                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Rebind drive/brake actions per keyboard player | Ten independent `KeyboardEvent.code` profiles and capture UI                                                 | `PASS` automated in Chromium; prior direction coverage passed all three engines   |
| Controller assignment                          | Exclusive per-player assignment, ID/mapping hints and explicit non-standard axis calibration                 | `PARTIAL`; synthetic/unit coverage, real hardware not run                         |
| Keyboard-only fallback                         | All gameplay/menu routes retain keyboard support when Gamepad API yields no pads                             | `PASS` automated in all three engines                                             |
| Blur/disconnect safety                         | Held input clears; active assigned-controller loss pauses and identifies players                             | `PASS` synthetic matrix; physical device-loss review open                         |
| Color-independent identity                     | P1–P10 text plus ten distinct symbols, dark backing and light/dark keylines                                  | `PARTIAL`; grayscale technical capture passes, independent identification remains |
| High-contrast focus                            | `:focus-visible` uses a 4 px white outline plus a dark outer keyline                                         | `PARTIAL`; visible in targeted UI run, contrast has not been measured             |
| Semantic UI                                    | Native buttons, labels, selects, ranges, fieldsets, headings, status regions and pause dialog                | `PARTIAL`; DOM inspection and targeted UI automation only                         |
| Keyboard menu navigation                       | Arrow navigation, Enter activation, Escape/back and focus boundaries                                         | `PASS` across all panels covered by the three-engine UI route                     |
| Controller menu navigation                     | Standard D-pad/left stick, A confirm and B cancel with repeat/hysteresis                                     | `PARTIAL`; synthetic matrix passes, physical hardware remains                     |
| Focus return/containment                       | Visible screen receives the first focusable control; pause is an `aria-modal` dialog                         | `PARTIAL`; full forward/reverse focus-order and restoration audit not run         |
| Reduced motion                                 | OS preference seeds safe defaults; manual option suppresses optional CSS motion and adjusts camera/particles | `PARTIAL`; settings/unit coverage, human motion review not run                    |
| Adjustable presentation                        | UI scale, marker size, camera smoothing, particle density, AO and vignette controls                          | `PARTIAL`; targeted schema-v4 option test passed                                  |
| High-contrast interactables                    | Stronger portal/booster treatment setting                                                                    | `PARTIAL`; hook is automated, visual contrast review not run                      |
| Optional upright recovery                      | Settled upside-down cars can be recovered when enabled                                                       | `PARTIAL`; eligibility logic unit-tested, live behavior review not run            |
| Adjustable controller response                 | Dead zone and sensitivity are separately persisted and applied                                               | `PARTIAL`; settings/input unit coverage                                           |
| Adjustable audio                               | Master/effects/music buses are persisted; cues never carry required information alone                        | `PARTIAL`; procedural service unit-tested, real output review not run             |
| Trusted audio activation                       | No `AudioContext` is created before activation; unavailable audio fails softly                               | `PARTIAL`; browser matrix passes, physical listening/output review remains        |

The music-volume control currently adjusts a reserved music bus; this Profile A
build does not create a music source. The label is therefore a forward-
compatible mix control, not a claim that music ships.

## Input design

Gameplay uses two continuous axes plus a Brake/Drift action. There is no
required jump, boost, camera, weapon or manual-respawn control. Standard pads
map Brake/Drift to either shoulder button.

Binding capture:

- names the selected player and direction;
- displays “PRESS A KEY…” and allows Escape to cancel;
- stores physical `KeyboardEvent.code` values;
- rejects same-player opposite-direction duplication;
- warns when a physical key is shared across players;
- reserves `Escape` and `KeyP` for pause;
- persists valid values through schema-v4 settings validation.

Ten logical keyboard profiles are supplied without silent overlap. This does
not guarantee that a physical keyboard can register every simultaneous
combination: rollover/ghosting depends on the device. The UI should retain a
plain-language warning before public release; real multi-keyboard and mixed-
controller capacity testing remains open.

Standard-mapped gamepads use portable mapping indices. Non-standard pads are
not guessed: the player must explicitly choose steering/drive axes and
inversion. `Gamepad.index` is treated as a session handle and is not persisted;
ID and mapping are only reconnection hints.

## Color-independent markers

Each active car receives:

- persistent `P1`–`P10` text;
- a distinct symbol;
- the source color as a secondary accent;
- white-on-dark marker text with outline and shadow;
- a camera-facing DOM projection;
- consistent player/color/control identity through world rebuild.

Implementation is not evidence that every user can distinguish the markers.
The release review must capture ten players over neutral ground, green cubes,
red boosters, blue portals and deep shadows, then test grayscale and common
color-vision simulations.

## Motion, effects and audio

- There is no screen shake.
- `prefers-reduced-motion: reduce` and the saved reduced-motion setting shorten
  optional CSS animation/transition time.
- Particle density supports Full, Reduced and Off.
- Camera smoothing supports Default (0.25 s), Reduced (0.10 s) and Instant.
- AO and vignette can be disabled.
- Booster/portal feedback uses fixed-capacity procedural particles and bounded
  procedural oscillator cues, with no source asset.
- Hidden pages suspend the audio context; pause ducks gameplay audio while
  leaving navigation/recovery cues available.
- Audio service limits are 10 engine voices and 16 simultaneous short cue
  voices.

No photosensitivity, vestibular or audio-device review has been performed.

## Verification matrix

| Review                      | Status    | Evidence / requirement                                                          |
| --------------------------- | --------- | ------------------------------------------------------------------------------- |
| Keyboard navigation         | `PASS`    | Three-engine route covers activation, panels, pause, focus boundaries, and back |
| Controller navigation       | `PARTIAL` | Three-engine synthetic route passes; real hardware required                     |
| Pointer navigation          | `NOT RUN` | Manual mouse/trackpad route required                                            |
| Focus order and return      | `NOT RUN` | Forward/reverse traversal and dialog restoration required                       |
| Per-player rebinding        | `PASS`    | Three-engine capture/persistence/reset route                                    |
| Conflict handling           | `PASS`    | Same-player, cross-player, reserved pause, and controller ownership             |
| Blur/device loss            | `PARTIAL` | Synthetic matrix passes; real hardware/device loss required                     |
| Keyboard rollover           | `NOT RUN` | Test representative simultaneous player combinations                            |
| Screen reader               | `NOT RUN` | Names, roles, values, live errors and disabled reasons                          |
| Browser zoom/UI scale       | `NOT RUN` | 200% browser zoom and 80%–150% app scale                                        |
| Focus/text contrast         | `NOT RUN` | Measure against all menu/gameplay backgrounds                                   |
| Marker grayscale            | `PASS`    | Retained native grayscale companion with all ten labels/symbols                 |
| Color-vision simulations    | `NOT RUN` | Representative common deficiencies                                              |
| Reduced motion              | `NOT RUN` | OS preference plus manual setting                                               |
| Fullscreen denial/exit      | `PARTIAL` | Three-engine injected denial/exit passes; native accepted transition remains    |
| Gamepad API unavailable     | `PASS`    | Three-engine exact live keyboard-force route                                    |
| Audio unavailable/suspended | `PARTIAL` | Browser policy/fallback matrix passes; physical output review remains           |

## Acceptance summary

| ID       | Status    | Reason                                                               |
| -------- | --------- | -------------------------------------------------------------------- |
| MP-007   | `PARTIAL` | Grayscale technical evidence passes; independent identification open |
| UI-001   | `PARTIAL` | Keyboard/synthetic controller matrix passes; pointer/real pad open   |
| A11Y-001 | `PASS`    | Rebinding/conflict/persistence/reset pass across all three engines   |
| A11Y-002 | `PARTIAL` | Focus treatment exists; measured contrast review open                |
| A11Y-003 | `PARTIAL` | Grayscale/keyline capture passes; measured background contrast open  |
