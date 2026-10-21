# Mini Wheels Level Editor / Creator

## Game Design Document and Technical Implementation Plan

Status date: 2026-08-02 (America/Vancouver)  
Status: `APPROVED DESIGN — IMPLEMENTATION IN PROGRESS (PHASES 0–3 PARTIAL)`  
Release target: Mini Wheels Editor Release 1  
Primary audience: game design, engineering, UX, QA, and future Codex implementation sessions

## 1. Document authority and boundaries

This document records the complete user-approved vision for the Mini Wheels
level editor/creator and the implementation plan required to ship it.

The editor is a new, user-directed completion layer. It is not recovered
source-authentic functionality from the original Tiny Traction build.

Authority order:

1. The explicit decisions recorded in this document govern Editor Release 1.
2. The original
   [Mini Wheels reconstruction GDD](../Mini_Wheels_ThreeJS_Reconstruction_Package/Mini_Wheels_ThreeJS_Reconstruction_GDD.md)
   remains authoritative for the protected Profile A reconstruction.
3. This document expands and supersedes only the original GDD's minimal
   optional-editor proposal in Section 15.4.
4. Existing Profile A behavior and acceptance coverage must not be weakened to
   make the editor easier to implement.

`DECISION` means an approved product choice for this new work. `BASELINE` means
an existing architectural or gameplay constraint. `FUTURE` means deliberately
excluded from Release 1 and retained as a later possibility.

Implementation was subsequently authorized by the user. Current evidence and
remaining gates are tracked in
[EDITOR_IMPLEMENTATION_STATUS.md](./EDITOR_IMPLEMENTATION_STATUS.md). The
read-only reconstruction package remains outside the editor implementation
boundary.

### 1.1 Implementation entry gate

The user explicitly authorized implementation before all non-software Profile A
sign-offs were complete. The starting revision, dirty-worktree boundary,
automated evidence, and remaining tag/sign-off gate are recorded in the editor
implementation status without rewriting or weakening the protected baseline.

## 2. Product vision

Mini Wheels should let a child create a fun map quickly and still give an
experienced creator enough control to build polished obstacle playgrounds,
branching races, elevated stunt courses, tunnels, shortcuts, and original
colorful suspended tracks.

The core promise is:

> Draw something, understand it immediately, test it instantly, and never be
> afraid of losing it.

The editor is an in-game mode, but editing and live gameplay remain separate
systems. Creators build a persistent map document in Edit Mode, then switch to
the real game in Test Mode using a compiled snapshot. Returning to Edit Mode
restores the exact editing context.

The initial authoring target is PC mouse and keyboard. References to iPhone or
Apple-like quality describe responsiveness, continuity, restraint, and smooth
transitions; they do not imply touch support or copied visual assets.

## 3. Release 1 contract

Release 1 is the complete scope in this document. The implementation phases are
an order of work, not permission to ship a reduced editor under the Release 1
name.

### 3.1 Included

- In-game Editor entry and separate Map Library.
- Fast, reversible Edit Mode to Test Mode switching.
- A 3D editor camera with a one-click top-down view.
- Kid-friendly onboarding, large visual controls, contextual help, and
  progressive disclosure.
- Open-layout construction and constrained race-course construction.
- General object placement, transforms, snapping, grouping, duplication, and
  reusable prefabs.
- Smooth spline-based track drawing plus modular track pieces.
- Width, elevation, drops, banking, overpasses, tunnels, surfaces, materials,
  and independent left/right walls.
- Circuit, point-to-point, time-trial, multi-route, shortcut, and free-roam
  maps.
- Normal Play for saved maps with 1–10-player setup, countdown, race HUD,
  finish order/timing, results, restart, and map return.
- Automatic and manually editable checkpoints.
- Multiple valid routes and finish nodes using a validated route graph.
- Race recovery from falls and stuck states.
- Visual preset interactions without scripting.
- Built-in environments, assets, sounds, music, materials, and effects.
- Named browser-local maps, autosave, restore points, recoverable trash,
  thumbnails, search, sort, favorites, tags, import, and export.
- Warning-first performance guidance with a final browser-stability ceiling.
- Adaptive shared/split-screen presentation for local races and authored
  multiplayer playtests.
- Full validation, migration, accessibility, browser, performance, and
  lifecycle coverage.

### 3.2 Explicitly deferred

The following are `FUTURE` items and must not delay Release 1:

- Vertical loops, corkscrews, fully inverted track, magnetic/downforce driving,
  and the related vehicle/camera work.
- Computer-controlled racers, AI navigation, racing-line authoring, and AI
  tuning. Release 1 route metadata should remain clean enough to support them
  later.
- Free-form scripting or a general-purpose logic language.
- Imported custom images, models, audio, or other untrusted assets.
- Touch, tablet, and mobile editor controls.
- Share codes, accounts, cloud backup/sync, community discovery, ratings,
  moderation, and downloaded-map safety.
- Online collaborative editing.

## 4. Locked design decisions

| Area                     | Release 1 decision                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Product placement        | Editor is an in-game mode reached from the Mini Wheels front end.                                                                    |
| Runtime boundary         | Editing and gameplay are separate. Test Mode runs a compiled snapshot in the real game.                                              |
| Authoring view           | Full 3D orbit view with a one-click top-down toggle.                                                                                 |
| Input                    | PC mouse and keyboard authoring first. Every modifier shortcut also has a visible control.                                           |
| Save model               | Browser-local named maps and autosave, plus `.miniwheels-map` import/export.                                                         |
| Release depth            | Build the complete agreed editor now through phases; do not reduce it to a decorative prototype.                                     |
| Track authoring          | Spline click-drag flow is primary; modular pieces remain available.                                                                  |
| Track walls              | Left and right walls are independent, can cover a whole track or painted ranges, and remain easy to add or erase.                    |
| UI density               | One progressively disclosed workspace; advanced controls appear only for the active tool or selection.                               |
| Logic                    | Visual links with preset events, conditions, and actions; no scripting.                                                              |
| Built-ins                | Built-in maps are permanently locked and expose **Edit a Copy**, never destructive editing.                                          |
| Complexity               | Permit ambitious creations, warn near measured limits, and block only genuine stability hazards.                                     |
| Test flow                | Hide editor chrome, play immediately, then return to the exact editor state.                                                         |
| Track geometry           | Elevation, drops, banking, overpasses, and tunnels are in Release 1. Inversion is later.                                             |
| Race completion          | Support several race types, branching valid routes, shortcuts, and one or more valid finish nodes.                                   |
| Tutorial                 | Skippable, replayable, text-and-animation-only, bright, short, and understandable by an eight-year-old familiar with creative games. |
| Checkpoints              | Generate sensible defaults automatically, then allow complete manual editing.                                                        |
| Recovery                 | Use a playful kart-racing-style recovery flow while creating original Mini Wheels presentation and assets.                           |
| Test controls            | P1 quick start, local-player count, selected-checkpoint start, reset, and Return to Edit.                                            |
| Environments             | Ground/void, sky, lighting, fog, gravity, and built-in music are configurable.                                                       |
| Organization             | Search, sorting, favorites, tags, categories, and recent items; folders are not required.                                            |
| Assets                   | Built-in assets only in Release 1.                                                                                                   |
| Autosave history         | Keep a live working copy and at least ten meaningful restore points.                                                                 |
| Invalid maps             | Permit safe free-drive testing; block a scored race only when its required race data is invalid.                                     |
| Local multiplayer camera | Nearby racers share a view; separated racers split into stable cluster or individual views and merge smoothly on regrouping.         |

## 5. Experience principles

### 5.1 Make the first success immediate

A new creator should be able to draw a road, add a ramp, place a start and
finish, and drive it within five minutes. The editor starts with only the
essential choices visible:

- Select.
- Place.
- Track.
- Test.
- Save.

The inspector reveals detail only after an object or tool makes that detail
relevant.

### 5.2 Direct manipulation first

Objects follow the pointer immediately. Track previews appear while drawing.
Wheel adjustments show their value beside the pointer. Handles communicate what
can be moved. Numeric fields support precision but are never the first or only
way to build.

### 5.3 Safe experimentation

Every meaningful gesture is undoable. Autosave never pretends to succeed.
Built-in maps cannot be damaged. Imports do not silently overwrite. Test physics
never changes the authored document. Deletion is recoverable.

### 5.4 Smooth, not slow

Motion connects states without delaying input:

- Direct pointer feedback should begin within 50 ms on reference hardware.
- Normal panels and shared-element transitions use interruptible 160–300 ms
  motion.
- The interface responds before decorative easing completes.
- Long generation work shows cancellable progress rather than freezing.
- Reduced Motion replaces travel, zoom, and spring effects with state changes or
  fades no longer than 100 ms.

### 5.5 Explain problems in plain language

Warnings say what happened, why it matters, and what the creator can do. Prefer
“This finish cannot be reached from the start” over graph or collider jargon.
Color is reinforced with icons, labels, and shapes.

## 6. Primary user journeys

### 6.1 First editor launch

1. Select **Editor** from the Main Menu.
2. See the Map Library and a large **Make Your First Track** action.
3. Enter a disposable tutorial map.
4. Complete or skip seven short guided actions.
5. Name the first map or discard the tutorial map.
6. Arrive in the Map Library with the saved creation visible.

### 6.2 Create from blank

1. Choose **New Map**.
2. Pick **Open Playground**, **Race Track**, or **Empty World**.
3. Choose a basic ground or void environment.
4. Build using the object tray or Track tool.
5. Enter Test Mode at any time.
6. Return, fix, save, and optionally export a backup.

These starting choices create editable defaults, not rigid templates.

### 6.3 Create from a built-in map

1. Select a protected built-in card.
2. Choose **Play** or **Edit a Copy**.
3. **Edit a Copy** creates a new user-owned ID and title before editing begins.
4. The original remains byte-for-byte protected and cannot enter Trash.

### 6.4 Build a race with alternate routes

1. Draw or place the track geometry.
2. Place a start grid and one or more finish gates.
3. Generate checkpoints from selected track paths.
4. Create branch checkpoint groups and reconnect them.
5. Mark intended shortcuts.
6. Read the green, amber, and red route overlay.
7. Test from the start or a selected checkpoint.

### 6.5 Recover work

1. Reopen Mini Wheels after a refresh, crash, or accidental close.
2. See **Recover Last Session** when a newer working copy exists.
3. Preview the current map and restore points without overwriting either.
4. Restore as a new copy by default.

### 6.6 Play a saved map normally

1. Choose **Custom Maps** from Play or choose **Play** on a library card.
2. Select the local roster and controls using the normal 1–10 player setup.
3. Review the map's race type and any validation warnings.
4. Start the ordinary countdown and race, not an editor playtest.
5. View finish order or time-trial results.
6. Restart, change players, choose another map, return to the library/title, or
   edit a user-owned map.

Normal Play never exposes editor chrome or modifies authored content.

## 7. Information architecture

```text
Main Menu
  -> Play
     -> Custom Maps
        -> Map Picker
           -> Player Setup
              -> Race / Results
  -> Editor
     -> Map Library
        -> New Map / Template / Edit a Copy / Import / Play
        -> Edit Mode
           -> Test Mode
              -> Test Pause
              -> Return to Edit
        -> Restore Points / Trash / Export
```

Editor states should be hierarchical rather than represented by unrelated
booleans. At minimum, the application distinguishes front end, library,
editing, playtesting, test pause, and recovery/error states.

## 8. Map Library

### 8.1 Library card

Each card shows:

- Automatic or creator-selected thumbnail.
- Map name.
- Map type or race type.
- Tags.
- Favorite state.
- Last-edited date.
- Compact performance-health indicator from the last validation.
- Built-in, user map, autosave recovery, or imported-copy identity.

Primary actions are **New**, **Play**, **Edit**, **Quick Test**, **Duplicate**,
**Export**, and **Trash**. **Play** launches the normal player-setup and race
flow. **Quick Test** is a clearly labeled editor convenience and does not
replace normal play. Protected maps show **Play** and **Edit a Copy** instead of
destructive actions.

### 8.2 Finding maps

Release 1 includes:

- Name and tag search.
- Sort by last edited, name, date created, favorite, or map type.
- Favorites.
- User-defined tags.
- Built-in templates.
- A Trash view.

Folders are intentionally unnecessary in Release 1.

### 8.3 Destructive safety

- Trashing a user map does not immediately erase it.
- Trash remains until explicitly emptied.
- Restoring from Trash creates or restores a safe user-owned record without
  replacing a newer map silently.
- If browser storage pressure prevents indefinite retention, the library warns
  early and offers export before any removal.
- Built-ins cannot be overwritten, renamed in place, trashed, or imported over.

## 9. Editor workspace

### 9.1 Layout

| Region             | Contents                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| Top bar            | Back to Library, editable map name, truthful save state, Undo, Redo, Test, and overflow actions     |
| Left tray          | Large picture-card assets, categories, search, favorites, and recent items                          |
| Center             | 3D viewport, selection, placement previews, track handles, route overlays, and contextual wheel HUD |
| Right inspector    | Only the properties relevant to the active tool or selected objects                                 |
| Bottom/status area | Short control hint, **Show Me**, validation summary, and performance health                         |

Panels may collapse, but important controls must not overlap the viewport,
extend off-screen, or produce the oversized text collisions seen in earlier UI
iterations. At supported PC sizes, focus rings, menus, dialogs, and tooltips stay
inside the visual viewport.

The target authoring layout is 1280 × 720 or larger. At smaller desktop
viewports, the object tray and inspector become drawers while Test, Save, Undo,
and the viewport remain available.

### 9.2 Object tray

The tray uses pictures plus plain-language names. It opens with broad categories:

- Build.
- Track.
- Race.
- Play.
- Interact.
- Decorate.
- World.

Search results appear immediately. Recent and favorite items stay near the top.
The tray remembers its last category per map but does not reopen an advanced
inspector automatically.

### 9.3 Contextual inspector

The inspector follows these rules:

- Nothing selected: show map-level quick actions only.
- One object selected: show that object's useful properties.
- Multiple compatible objects: show shared properties and mixed-value states.
- Track or track range selected: show track, surface, color, and wall tools.
- Link tool active: show **When this -> do that** cards.
- Advanced values are placed behind a clear **More** disclosure.
- Every shortcut-controlled value also appears here as a mouse-accessible
  control.

## 10. Tutorial and contextual help

### 10.1 First-run tutorial

The tutorial is self-paced, skippable, replayable, text-and-animation-only, and
designed to communicate in 60–90 seconds without requiring prior instructions.
It uses a disposable tutorial map so experimentation cannot damage a real map.

| Step | On-screen instruction       | Success condition                                |
| ---- | --------------------------- | ------------------------------------------------ |
| 1    | “Move the camera.”          | Creator orbits and pans once.                    |
| 2    | “Draw a road.”              | A valid track stroke is committed.               |
| 3    | “Scroll to make it wider.”  | Track width changes.                             |
| 4    | “Add a ramp.”               | A ramp is placed or a track section is elevated. |
| 5    | “Paint some walls.”         | A wall range is added and then may be erased.    |
| 6    | “Place a start and finish.” | Usable spawn and finish objects exist.           |
| 7    | “Test-drive your track!”    | Test Mode begins and P1 can drive.               |

Tutorial presentation requirements:

- One instruction at a time.
- Prefer 12 words or fewer per instruction.
- At least 24 px tutorial text at the target viewport.
- At least 48 × 48 px primary targets.
- Bright focus rings, animated paths, or ghost-hand motion.
- No auto-dismiss timer on an instruction the child has not completed.
- A visible **Skip Tutorial** action.
- A permanent **Show Me** action that demonstrates the current tool without
  changing the map.
- Reduced Motion replaces moving demonstrations with a short stepped highlight.

### 10.2 Usability target

In a supervised, privacy-safe study, at least four of five children aged 7–10
who are familiar with creative games should complete the tutorial and test a
drivable mini-track within five minutes, with no more than two adult prompts.

## 11. PC controls

### 11.1 Core pointer controls

| Input                          | Viewport behavior                                                            |
| ------------------------------ | ---------------------------------------------------------------------------- |
| Left click                     | Select, confirm, place, or add a track point according to the active tool    |
| Left drag                      | Box-select, manipulate a handle, paint a range, or draw with the active tool |
| Right drag                     | Orbit the 3D camera                                                          |
| Middle drag                    | Pan the camera                                                               |
| Wheel with no placement active | Zoom                                                                         |
| Wheel during placement/edit    | Change the tool's primary property                                           |
| Shift + wheel                  | Change elevation or height                                                   |
| Ctrl + wheel                   | Change rotation or track banking                                             |
| Escape                         | Cancel the current uncommitted action safely                                 |
| Delete/Backspace               | Move selected authored objects to the undoable deletion transaction          |
| Ctrl + Z                       | Undo                                                                         |
| Ctrl + Shift + Z / Ctrl + Y    | Redo                                                                         |
| F                              | Frame the selection                                                          |

The one-click **Top Down / 3D** control is always visible in the viewport.
Keyboard shortcuts are enhancements, not hidden requirements.

The editor intercepts wheel modifiers only while the pointer is over the active
viewport. Browser zoom and panel scrolling remain normal elsewhere.

### 11.2 Contextual wheel feedback

While the wheel edits a value, a compact HUD appears beside the pointer with:

- Property name.
- Current value and unit.
- Direction of change.
- Relevant modifier hints.
- A reset or inspector equivalent.

Examples of the primary wheel property include object size, track width, ramp
steepness, repeated-object count, brush radius, wall height, or polygon side
count. A continuous wheel burst is one undo transaction, not dozens of history
entries.

For repeat placement, compatible objects show a live row, arc, or grid of ghost
previews before commit. The wheel changes the count, dragging the end/spacing
handle changes the covered distance, and a visible shape control switches the
pattern. The contextual HUD names the count, spacing, and pattern. Committing
creates an editable group in one undo transaction; the creator may then ungroup
or edit its children normally.

## 12. Camera, selection, and transforms

### 12.1 Editor camera

- Perspective 3D orbit is the default authoring view.
- Top-down mode aligns cleanly to the build plane while retaining zoom and pan.
- Switching views preserves the point of interest and uses a short,
  interruptible transition.
- **Frame Selection** works for one object, a group, or a selected track range.
- Camera state is stored as editor-session state, not runtime map content.

### 12.2 Selection

- Click to select.
- Drag an empty area to box-select.
- Shift-click adds or removes items from the selection.
- Hierarchical groups can be selected as a unit or entered for child editing.
- Track ranges use visible start/end handles and a highlighted centerline.
- Hidden, locked, or non-selectable helper layers are clearly indicated.

### 12.3 Placement and precision

- Free placement is the default.
- Grid snap and angle snap are independent optional toggles.
- Surface snap and endpoint magnetic snap appear contextually.
- Position, rotation, scale, width, height, and related numeric values appear
  only when relevant.
- Dragging shows a live preview; expensive physics collider replacement waits
  until the gesture commits.
- Duplicate and repeat placement preserve useful offsets.

### 12.4 Groups and prefabs

Creators can:

- Multi-select.
- Group and ungroup.
- Duplicate.
- Mirror or rotate a group.
- Save a selection as a reusable local prefab.
- Place prefab instances as ordinary editable copies.

Release 1 prefabs are stored with the local map library and use built-in assets
only. Removing a prefab definition never destroys already placed copies.

## 13. Construction catalog

Release 1 must provide enough built-in content to make both open playgrounds
and restricted races.

| Category             | Required content                                                                                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Floors and shapes    | Rectangles, circles, rounded platforms, regular polygons, simple freeform floor outlines, blocks, columns, and void-safe base pieces                 |
| Track and boundaries | Spline road, modular straights/corners, walls, tunnels, barriers, rails, ramps, jumps, banked corners, bridges, and overpass supports                |
| Race                 | Player spawns, start grids, checkpoints, checkpoint groups, finish gates, route links, shortcut markers, recovery volumes, and out-of-bounds volumes |
| Motion and physics   | Moving platforms, rotating bars, balls, cubes, doors, and simple physics obstacles                                                                   |
| Travel and speed     | Boosters, slow zones, portals, bounce surfaces, launch helpers, and directional arrows                                                               |
| Interaction          | Buttons, pressure plates, trigger zones, timers, counters/preset lap conditions, and linkable targets                                                |
| Decoration           | Primitive sculptures, signs, arrows, lights, color strips, particles/effect emitters, and themed built-in props                                      |
| Environment          | Ground/void, sky/background, sun/key light, fill/ambient light, fog, gravity, and built-in music                                                     |

Every catalog object needs:

- A stable asset identifier.
- A picture-card preview and plain-language name.
- A placement preview.
- Sensible defaults.
- A compact contextual inspector.
- Validation rules.
- A runtime compiler/factory path.
- Disposal and performance-cost metadata.

### 13.1 Minimum capability contract

The catalog is not satisfied by picture cards alone. Every individual asset is
registered in a typed catalog manifest with its defaults, editable fields and
safe ranges, physics class, collider/sensor behavior, supported link events and
actions, reset behavior, and measured cost category.

| Object family                           | Minimum authored properties                                                               | Runtime/physics contract                                                                    | Link and reset contract                                                                         |
| --------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Floor/shape/platform                    | Shape or bounded freeform outline, size/extrusion, transform, material, surface           | Static render mesh and matching static collider; invalid/self-crossing outlines rejected    | May be shown/hidden or moved only when compatible; reset restores authored state                |
| Spline/modular track and walls          | Geometry controls, profile, material, surface, wall ranges/style                          | Chunked static render/collision from Section 14                                             | Compatible track-state presets may enable/disable authored ranges; reset restores default state |
| Barrier/rail/tunnel/support/ramp/jump   | Transform, dimensions/profile, material, surface                                          | Static collider aligned with preview; tunnels retain usable clearance                       | Compatible visibility/motion actions only; reset restores authored transform/state              |
| Start/checkpoint/finish/recovery volume | Transform, bounds, direction, group/order/rule IDs, safe pose where relevant              | Sensor volumes only; no visible collision unless the chosen asset includes a separate frame | Emits race events where applicable; reset clears transient crossings/progress                   |
| Ball/cube/dynamic obstacle              | Initial transform, size, mass preset, friction, restitution, material                     | Dynamic rigid body with bounded parameters and authored recovery/reset policy               | Compatible activation/visibility actions; full reset restores authored pose and velocity        |
| Moving platform                         | Transform, path/endpoints, speed/duration, dwell, loop/ping-pong preset, material         | Kinematic body with deterministic fixed-step motion and passenger behavior                  | Start, stop, reverse, enable, disable, reset; reset restores authored phase                     |
| Rotating obstacle                       | Transform, axis, rate, direction, optional angle range, material                          | Kinematic body with stable time-based rotation                                              | Start, stop, reverse, set preset speed, reset                                                   |
| Door                                    | Closed/open transforms, duration, collision state, initial state, material                | Kinematic/static transition with no unsafe one-frame teleport through cars                  | Open, close, toggle, enable, disable, reset                                                     |
| Booster/slow/bounce/hazard              | Transform/range, direction where relevant, strength preset/value, cooldown, enabled state | Typed surface/sensor behavior from Section 15; one deterministic contact policy             | Enable, disable, pulse, reset; emits activation where relevant                                  |
| Portal pair                             | Pair ID, entry/exit transforms, velocity/orientation rule, cooldown, enabled state        | Linked sensors with safe exit clearance and re-entry lockout                                | Enable, disable, toggle, reset; unpaired portals fail scored validation                         |
| Button/pressure plate/trigger           | Transform/bounds, activation mode, hold/toggle behavior, retrigger/cooldown preset        | Sensor or interactable state with deterministic occupants/events                            | Emits pressed/released/entered/exited; enable, disable, reset                                   |
| Timer/counter/lap condition             | Duration/count/threshold, start mode, bounded repeat preset                               | No rigid body; fixed-step logic only                                                        | Emits elapsed/reached/changed; start, stop, reset where compatible                              |
| Sign/decorative prop                    | Transform, built-in style, color/material, bounded plain text where supported             | Static visual; collider is an explicit on/off property, never inferred secretly             | Optional show/hide/enable/reset                                                                 |
| Light/effect emitter                    | Transform, built-in preset, color, safe intensity/range, enabled state                    | Session-owned light or pooled bounded effect; honors player safety settings                 | Enable, disable, pulse, play, stop, reset                                                       |

Phase 0 defines the manifest schema; Phase 4 completes and tests a manifest
entry for every shipped asset. A runtime object with undocumented defaults,
reset behavior, or performance cost is not complete.

## 14. Smooth track authoring

### 14.1 Core flow

The Track tool prioritizes a click-drag flow:

1. Choose **Track**.
2. Press and drag through the desired path.
3. See a smoothed centerline, road preview, width, and direction immediately.
4. Use the wheel to change width, Shift + wheel for elevation, and Ctrl + wheel
   for banking.
5. Release to commit one undoable track stroke.
6. Drag the endpoint to continue, or select any range to reshape it.

Click-to-place control points is available for deliberate construction. Both
methods produce the same editable track model.

### 14.2 Track editing

Creators can:

- Move control points and tangent handles.
- Insert a point without changing the overall shape unexpectedly.
- Delete a point or selected range.
- Extend either end.
- Split and join tracks.
- Close a loop.
- Snap compatible endpoints.
- Create a branch or intersection with a magnetic join.
- Select a distance range and edit only that range.
- Copy style, surface, width, banking, color, or walls between ranges.
- Undo an entire draw or paint gesture in one action.

The track remains nondestructive source data. Generated render meshes and
colliders are disposable caches, never the authored truth.

### 14.3 Track properties

Properties may be constant, smoothly interpolated, or overridden by selected
ranges:

- Width.
- Elevation.
- Grade.
- Banking.
- Thickness/profile.
- Material and color.
- Surface behavior and strength.
- Emission/glow.
- Pattern animation speed and direction.
- Left wall and right wall state.
- Tunnel/cover state where supported.

Release 1 supports elevation changes, drops, jumps, banking, bridges,
overpasses, and tunnels. It must detect and explain self-intersections or slopes
that produce unsafe generated geometry, but it should not forbid intentionally
challenging tracks when they remain stable.

### 14.4 Independent walls

Wall editing is direct and reversible:

- **Left**, **Right**, **Both**, or **None** for the whole track.
- Paint or erase wall state while dragging over selected ranges.
- Adjust height, thickness, material, color, emission, and style.
- Smooth wall joins around bends and range boundaries automatically.
- Preserve wall ranges when inserting, removing, or moving nearby control
  points.
- Make a multi-range wall stroke one undo transaction.

A creator should be able to turn a suspended colorful track from unguarded to
fully guarded, then remove selected wall sections, without rebuilding the road.

### 14.5 Colorful suspended-track tools

Mini Wheels should support the playful goal behind a “Rainbow Road-style”
reference while using original Mini Wheels art and effects:

- Gradient and rainbow color presets.
- Per-track and per-range color editing.
- Emissive/glowing materials.
- Optional restrained animated color movement.
- Void environment preset.
- Quick supports on/off.
- Independent wall painting.

No third-party course geometry, textures, logos, music, or copied branded assets
are part of this requirement.

### 14.6 Geometry generation requirements

The implementation should:

- Sample splines by arc length so spacing remains stable.
- Use parallel-transport or an equally stable frame method to avoid accidental
  twisting and frame flips.
- Generate track render and collision data in bounded chunks.
- Rebuild only affected chunks during an edit.
- Keep low-cost visual previews responsive during a drag.
- Commit expensive collider replacement after the gesture.
- Maintain smooth visual and physical seams.
- Keep junction identifiers and wall distance ranges stable across ordinary
  edits.
- Validate finite values, minimum radii, slopes, thickness, and collider
  integrity before runtime compilation.

Fully inverted frames and the vehicle adhesion they require remain a `FUTURE`
feature.

## 15. Surfaces, materials, and environment

### 15.1 Surface behaviors

| Surface  | Intended effect                                                  |
| -------- | ---------------------------------------------------------------- |
| Normal   | Standard Mini Wheels grip and rolling behavior                   |
| Slippery | Reduced grip and longer drift/slide                              |
| Sticky   | Stronger grip and reduced lateral slip                           |
| Bouncy   | Adds a controlled normal impulse on contact                      |
| Slow     | Reduces speed with adjustable strength                           |
| Boost    | Adds directional speed with adjustable strength                  |
| Hazard   | Triggers damage-like feedback, recovery, or a configured penalty |

Strength is contextual and starts with safe presets. Surface changes can apply
to whole objects or selected track ranges. Test Mode must use the real vehicle,
brake, drift, spark, recovery, and surface systems.

### 15.2 Materials and appearance

Creators can choose built-in:

- Colors and palettes.
- Matte, glossy, translucent where safe, and emissive treatments.
- Gradient, stripe, checker, directional, and rainbow-style patterns.
- Static or restrained animated pattern movement.
- Wall and track styles.

Color is never the only editor-state signal. Runtime hazards, checkpoints, and
player identity retain non-color cues.

### 15.3 World settings

Map-level settings include:

- Ground plane, authored floor pieces, or void.
- Sky/background preset and color.
- Directional/key light direction, intensity, and color within safe ranges.
- Ambient/fill light.
- Fog on/off, color, and distance.
- Gravity preset and advanced numeric strength.
- Built-in music selection and volume preview.
- Out-of-bounds height or authored recovery volumes.

Safe visual changes preview live. Expensive or physics-changing values compile
for Test Mode and show that distinction clearly.

### 15.4 Runtime ownership and precedence

Surface effects belong to the active world session, not global vehicle
configuration. A `SurfaceContactSystem` maps authored collider IDs to typed
surface profiles and evaluates actual per-wheel or chassis sensor contacts at
the fixed simulation step.

Deterministic effect order is:

1. Start from the protected mode/vehicle baseline.
2. Blend slippery/sticky grip modifiers from supporting wheel contacts using a
   documented load/contact weighting and safe clamps.
3. Apply continuous slow behavior from current contacts.
4. Apply edge-triggered boost or bounce impulses once per authored cooldown.
5. Resolve hazard/recovery effects once for the contact event.

Mixed-surface behavior, strength ranges, cooldowns, and conflicting contacts
must be fixture-tested. Leaving a map or resetting a session removes every
modifier; authored surfaces never mutate protected Profile A defaults.

An `EnvironmentSession` owns map gravity, background, fog, lights, music
selection, and map-level effects. It snapshots the application defaults it
needs, applies the compiled environment, and restores/disposes all changes when
the world ends.

Player settings always win over authored presentation:

- Master/music volume caps authored music.
- Reduced Motion reduces or disables animated material movement and transition
  travel.
- Particle/effect, high-contrast, and photosensitivity settings constrain map
  VFX and flashes.
- Render-quality settings govern expensive lighting and fog presentation.

The map can choose an experience inside those limits but cannot override a
player safety/accessibility choice.

## 16. Race design

### 16.1 Supported map and race types

- Free roam with no scored finish.
- Circuit with configurable lap count.
- Point-to-point.
- Time trial.
- Multi-route race with branches and reconvergence.
- Race with intentional shortcuts.

A race may use one finish or a group of explicitly valid finish nodes. Its
completion rule states whether reaching any valid finish is enough or whether a
specific finish group is required. Circuit completion additionally requires
the configured laps and route progress.

### 16.2 Geometry is not race progress

Visible road geometry and race logic are related but separate. The runtime
never guesses complete race rules from meshes alone.

The directed route graph contains stable-ID nodes and edges for:

- Start grids/spawns.
- Ordered checkpoint groups.
- Alternate checkpoints within a group.
- Branches.
- Reconvergence.
- Intended shortcuts.
- One or more finish nodes.

A required checkpoint group may contain alternate valid nodes so two branches
can both advance the same stage. A shortcut is valid only when the graph says
which required progress it satisfies.

### 16.3 Route authoring and overlays

The creator can visually connect route nodes. Relevant overlays use color,
icons, line style, and text:

- Green: valid required route.
- Amber: optional route, shortcut, or warning.
- Red: broken, unreachable, reversed, ambiguous, or incomplete route.

Overlays appear while Race tools are active or when requested, not as permanent
clutter.

Validation checks:

- A usable player start exists.
- Every required checkpoint group is reachable.
- At least one allowed finish is reachable.
- All declared alternate branches can reconnect or finish correctly.
- No shortcut bypasses required progress unintentionally.
- Circuit routes can return to the lap boundary.
- Checkpoint direction and volume are usable.
- Finish rules are unambiguous.
- Spawn and recovery poses are not embedded in unsafe geometry.

### 16.4 Checkpoints

The editor can generate checkpoints along one or more selected spline paths.
The creator may then:

- Move, rotate, resize, add, duplicate, or delete them.
- Reorder them.
- Put alternatives into a shared checkpoint group.
- Mark optional shortcuts.
- Adjust crossing direction.
- Override the automatically suggested safe respawn pose.
- Regenerate only a selected route without destroying manual checkpoints
  elsewhere.

Generated checkpoints are a starting point, never an irreversible black box.

### 16.5 Start and finish

Start tools support:

- One or more player start grids.
- Preview for the selected local-player count.
- Spacing and facing controls.
- A quick one-player Test spawn.
- Safe overlap and obstruction validation.

Finish tools support:

- A conventional finish line/gate.
- Multiple alternate valid finish nodes.
- Circuit lap boundary behavior.
- Point-to-point completion.
- Time-trial completion and timing.
- Requirement that specified checkpoint groups have been completed.

### 16.6 Start-grid allocation

A scored race designates exactly one active start-grid group. That group exposes
up to ten ordered slot transforms and may generate them from a facing direction,
row/column layout, and spacing. P1 receives slot 1, P2 slot 2, and so on; the
assignment never depends on color or controller connection order.

The editor previews 1–10 occupied slots and validates clearance. If the chosen
roster exceeds safe grid capacity, normal scored play is blocked with **Show
Me**, while safe free-drive testing remains available. Additional authored
start grids can be alternate race presets or free-roam spawn groups, but the
race rule must select one unambiguously before a scored start.

### 16.7 Normal race state and results

Ordinary Play uses an explicit state machine:

1. **Setup** — map, active start grid, player roster, controls, laps/rules, and
   viewport budget are ready.
2. **Staging** — cars spawn in deterministic slots and the route/HUD resets.
3. **Countdown** — a clear 3, 2, 1, Go presentation plays. Cars are held safely
   and drive input cannot create a false start; input begins on Go.
4. **Racing** — per-player checkpoint group, lap, wrong-way, elapsed time, and
   finish eligibility advance independently.
5. **Finishing** — each eligible crossing records its sub-step crossing time
   and placement. A creator-selected safe preset either waits for all active
   racers or starts a visible finish window after the first finisher.
6. **Results** — finish order, ties, elapsed time, laps, and DNF states appear
   with **Restart**, **Change Players**, **Choose Map**, **Edit** for user-owned
   maps, and **Title/Library** actions.

Crossing time is interpolated within the fixed simulation step where practical;
times within the defined timing epsilon share a place rather than being ordered
by player number. A player is DNF only after the configured finish window,
explicit withdrawal, or an unrecoverable disconnect flow.

Time trial records each player's elapsed time independently. Local bests are
stored in library metadata against the map content revision and race-rule
signature, so editing the course does not present an old record as comparable.
Free-roam maps skip scored countdown/results unless a creator-selected preset
explicitly starts an activity.

The in-race HUD presents only what the selected mode needs: player identity,
countdown, lap/checkpoint progress, position or time, wrong-way/recovery state,
finish-window status, and results. It becomes more compact as adaptive viewport
count rises.

## 17. Recovery and respawn

Race recovery should feel playful and quick while remaining an original Mini
Wheels presentation.

The runtime:

1. Detects a fall below the safe world boundary, entry into a recovery volume,
   or a configurable stuck condition.
2. Begins a brief bright text/animation transition.
3. Chooses the most recent safe checkpoint or start.
4. Restores the car at a validated pose facing the route's intended direction.
5. Clears unsafe linear and angular motion.
6. Grants short, clearly indicated collision protection.
7. Applies the map's configured delay and race-time penalty.
8. Returns control without changing authored map data.

The editor suggests a safe pose from checkpoint direction and track surface.
Creators may adjust it manually. Validation warns about blocked, unsupported,
or downward-facing recovery poses.

Free-roam maps can use starts, recovery volumes, and a map default recovery
point without defining a race graph.

## 18. Visual interactions without scripting

### 18.1 Mental model

The interaction UI reads:

> **When this happens -> if these conditions pass -> do that**

The creator:

1. Selects a source.
2. Chooses **Link**.
3. Selects a target.
4. Chooses from compatible event, condition, and action cards.
5. Tests the result immediately.

Directional link lines and summaries appear only while the source, target, or
Link tool is relevant.

### 18.2 Required preset vocabulary

Events and conditions include:

- Button pressed.
- Pressure plate occupied/released.
- Trigger zone entered/exited.
- Timer elapsed.
- Checkpoint crossed.
- Lap number reached.
- Race started/finished.
- Object activated/deactivated.

Actions include:

- Open, close, toggle, or reset a door.
- Start, stop, reverse, or reset a moving platform.
- Start, stop, or change a rotating obstacle.
- Enable, disable, or pulse a booster.
- Teleport through a valid portal relationship.
- Show a built-in particle or light effect.
- Play a built-in sound.
- Move, rotate, reveal, hide, enable, or disable a compatible object.
- Change a compatible track-state preset for a lap or event.

Examples include button -> door, pressure plate -> platform, checkpoint ->
booster, timer -> obstacle, trigger -> effect/sound/motion, and lap number ->
track change.

### 18.3 Safety and determinism

- Only whitelisted event, condition, and action types are persisted.
- Execution order is deterministic within the fixed simulation step.
- Missing sources/targets and incompatible links are validation errors.
- Accidental instant cycles are rejected.
- Repeating behavior uses bounded timer/sequence presets with clear retrigger
  rules.
- Per-step activation and recursion budgets prevent event storms.
- Arbitrary JavaScript, URLs, expressions, and imported executable content are
  prohibited.

## 19. Edit Mode and Test Mode

### 19.1 State preservation

The live `EditorSession` owns:

- Current `MapDocument`.
- Unsaved/dirty state.
- Selection and active tool.
- Editor camera and top-down/3D state.
- Inspector and relevant tray context.
- Undo/redo history.
- Current track range or link selection.

Entering Test Mode commits or cancels the active gesture, writes a recovery
working-copy checkpoint, validates the map, and compiles an immutable snapshot.
That checkpoint does not clear “dirty relative to the named revision”; only an
explicit successful named save does. The `EditorSession` remains intact while a
separate disposable playtest runtime runs.

Returning to Edit Mode restores the exact editor camera, selection, tool,
history, and unsaved state. Moved physics objects, broken stacks, triggered
doors, car marks, timers, and other runtime state are discarded.

### 19.2 Test controls

- **Test Now as P1**.
- Choose local player count.
- Start from the authored start.
- Start from a selected checkpoint.
- Reset the current test instantly.
- Pause the test.
- **Return to Edit**, restoring the exact prior editor view and state.
- **Edit Here**, returning with the camera focused near the current test
  location.

**Edit Here** intentionally changes only the editor camera's point of interest.
It keeps the prior editor view available through a one-click **Previous View**
action and does not change authored content, selection, tool, history, or dirty
state.

### 19.3 Validation gates

Test Mode stays available with warnings whenever safe:

- Invalid race rules allow free-drive testing.
- A scored race cannot start until its required start, route, and finish rules
  validate.
- Missing usable spawns, corrupt data, non-finite transforms, or generated
  geometry likely to destabilize the browser can block live runtime creation.
- A blocking message explains the exact object or rule and offers **Show Me**.

### 19.4 Responsiveness target

The transition should acknowledge input visually within 100 ms. A budget-size
map should become drivable within one second at the 95th percentile on named
reference hardware. Larger maps may show cancellable progress with the stage
being compiled.

## 20. Adaptive local multiplayer cameras

### 20.1 Scope and behavior

Adaptive cameras are a cross-cutting runtime requirement for normal local races
and multiplayer Test Mode. Profile A's faithful shared-camera acceptance
scenario remains protected; new race sessions use the adaptive system.

- Nearby players share one fair group view.
- When one group can no longer be framed readably, it separates into spatial
  clusters.
- A fully isolated player receives an individual viewport.
- If all players are isolated, the runtime displays one labeled viewport per
  player for the supported local-player count.
- Views merge again after players remain comfortably close.
- Input and physics never pause during split, merge, or layout animation.

### 20.2 Clustering

Raw world distance alone is insufficient. Cluster compatibility should measure
whether candidate players fit within the camera's comfortable projected extent
at a readable zoom.

Recommended default policy:

- Evaluate candidate clusters at a bounded cadence while cameras still update
  every frame.
- Split only after a cluster exceeds the readable fit threshold for roughly
  0.35 seconds.
- Merge only after the combined group remains inside a tighter merge threshold,
  approximately 80% of the split extent, for roughly one second.
- Allow no more than one layout transition per second unless a player would
  otherwise become invisible.
- Keep cluster IDs and tile positions stable when possible.

Exact thresholds are calibrated from playtests and centralized as game defaults.
Map creators do not need to tune them in Release 1.

### 20.3 Viewport layout

For the current cluster count and display aspect, choose the row/column layout
that maximizes the smallest readable tile while avoiding overlap and waste.
Layouts are not hard-coded only by player count.

Each viewport:

- Has a stable cluster or player identity.
- Uses its own orthographic camera rig and fit calculation.
- Shows each assigned active player exactly once.
- Clips scene, markers, HUD, and input-relative overlays to its rectangle.
- Retains P1–P10 color, symbol, and text identity.
- Uses a compact HUD as tile count rises.
- Provides directional and wrong-way context.

Viewport rectangles and camera targets animate over an interruptible 160–300 ms
transition. Reduced Motion switches layouts immediately or uses a fade no
longer than 100 ms.

### 20.4 Rendering architecture

One physics simulation and one scene remain authoritative. Do not create a
Rapier world per viewport.

The recommended renderer boundary is a `ViewportRenderCoordinator` that:

- Pools camera rigs.
- Computes scissor and viewport rectangles on one WebGL renderer/canvas.
- Renders the shared scene once per active viewport camera.
- Coordinates viewport-aware markers, HUD, picking, resize, DPR, and pause.
- Applies explicit quality rules as viewport count increases.

The current whole-canvas post-processing pipeline is not automatically
split-screen safe. An early technical spike must benchmark 2, 4, and 10 views
and choose one documented policy:

- Correct per-viewport post-processing with bounded render targets; or
- A multi-view quality path that disables or reduces expensive cosmetic passes
  while preserving lighting, hazards, player identity, and gameplay
  readability.

The runtime must never silently trade away essential visibility. The
performance meter includes estimated multi-camera cost.

### 20.5 Split-screen quality bar

- No player disappears during a cluster transition.
- Viewports never overlap or leave stale interaction regions.
- HUD and DOM markers project through the correct camera and viewport.
- Hysteresis prevents rapid split/merge flicker near a threshold.
- Resizing, fullscreen, render scale, and DPR changes keep all tiles aligned.
- Pause freezes the simulation consistently across every tile.
- Ten-view stress testing is required even if ordinary play usually produces
  fewer clusters.
- Vehicle projected size and safe-frame margins meet calibrated readability
  minimums in 2-, 4-, and 10-view layouts at the supported reference
  resolutions.

## 21. Persistence and map safety

### 21.1 Storage choices

- Keep lightweight game/editor preferences in `localStorage`.
- Store named maps, working copies, restore points, thumbnails, Trash records,
  and local prefabs in IndexedDB.
- Use atomic IndexedDB transactions so a new revision becomes current only
  after all required records succeed.
- Request persistent browser storage where supported and explain denial without
  blocking creation.
- Show estimated storage use and early quota warnings.

### 21.2 Autosave

Durability has two layers:

- Each semantic editor transaction appends a compact recovery-journal entry to
  IndexedDB. Pointer response does not wait on IndexedDB, but the save indicator
  remains pending until that journal entry commits.
- A debounced full working-copy snapshot compacts the journal and supplies fast
  load/restore data.

Full autosave snapshots also occur:

- After meaningful committed edits settle for a short debounce.
- Before Test Mode.
- Before switching maps.
- Before import or destructive library actions.
- On page exit where the browser permits, without claiming success before it
  occurs.

The top bar truthfully shows **Saving**, **Recovery Saved**, **Named Save
Needed**, **Save Failed**, or **Offline Local Save** as appropriate. A failed
journal or autosave keeps the durability-pending/dirty state and offers
retry/export.

A transaction is “durably completed” only after its journal entry commits.
Crash recovery restores through the last durably completed transaction; at most
the currently active or visibly durability-pending transaction may be lost.
This avoids promising that an asynchronous browser write survived before it
actually did.

Release 1 keeps:

- One current working copy.
- At least ten meaningful restore points across sessions.
- A compact recovery journal through the last durably completed transaction.
- Recoverable Trash.

Saving and Test Mode do not clear in-session undo history.

### 21.3 Map identity

- Every user map has a stable local map ID.
- Exported content has its own document ID and provenance metadata.
- Import creates a new local identity by default.
- A name collision produces a clearly named copy.
- Duplicate and **Edit a Copy** generate a new identity while preserving
  attribution to the source map.
- Built-in identities occupy a protected namespace.

### 21.4 Import and export

The extension is `.miniwheels-map`. Its contents are human-readable,
versioned JSON.

Export:

- Uses a safe browser download or supported file picker.
- Includes map content and metadata needed to reconstruct the map.
- Does not include runtime physics state, browser paths, arbitrary code, or
  external asset URLs.
- Can optionally include a compact thumbnail representation if size-safe.

Import:

- Reads into temporary memory first.
- Enforces file, object-count, nesting, and string-size safety limits.
- Rejects non-finite numbers, duplicate stable IDs, unknown required behavior
  types, executable content, and invalid references.
- Validates, migrates, and normalizes before writing to the library.
- Never modifies an existing or built-in map as a side effect of failure.
- Presents warnings before adding a heavy but valid map.

The UI periodically reminds creators that clearing browser site data can remove
local maps and recommends **Export Backup** for valued work.

### 21.5 Versioning and migration

- The map schema is versioned from its first release.
- Migrations are pure, ordered, fixture-tested transformations.
- Unsupported future major versions fail safely and preserve the original file
  for re-export/download where possible.
- Unknown optional extension metadata may be preserved only in a bounded
  `extensions` area; unknown runtime behavior never executes.
- Save -> load -> canonical save should be stable.
- Failed migration never overwrites the last valid revision.

## 22. Authored data model

### 22.1 Portable `MapDocument`

`MapDocument` is the only portable editor-authored source of truth. It is
self-contained and independent from IndexedDB keys, local thumbnails, favorites,
restore history, and runtime caches.

| Section           | Required contents                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------------- |
| Header            | Schema version, portable document ID, title, map/race type, optional description, and source/template identity |
| Portable metadata | Tags and bounded provenance/extension data intended to survive export                                          |
| Environment       | Ground/void, sky, lights, fog, gravity, music, and recovery boundary                                           |
| Entities          | Stable ID, built-in asset ID, transform, properties, grouping, and behavior configuration                      |
| Tracks            | Stable track/node IDs, spline controls, range properties, surfaces, color/pattern, and wall intervals          |
| Race              | Mode, active start-grid rule, checkpoint groups, route graph, finish rules, lap/timer settings, and recovery   |
| Interactions      | Stable source/target IDs and whitelisted event-condition-action records                                        |
| Editor hints      | Safe portable hints such as an optional thumbnail camera; never transient selection/history/runtime handles    |

Library prefabs are placement sources only. Placing one expands its built-in
assets and properties into ordinary map entities/groups. A saved or exported
map never requires a separate local-prefab record to load. If a later prefab
system preserves instance metadata, every required definition must be embedded
inside the same exported document.

### 22.2 Local repository records

Mutable local concerns wrap the portable document instead of contaminating it:

| Record              | Local-only contents                                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MapRecord`         | Local map ID, current content revision, created/updated timestamps, favorite, thumbnail key, Trash state, import/copy provenance, and last validation summary |
| `RevisionRecord`    | Immutable content snapshot or journal range, revision ID, timestamp, and restore label                                                                        |
| `ThumbnailRecord`   | Generated image blob and capture metadata                                                                                                                     |
| `LocalResultRecord` | Map content revision/rule signature, local timing/finish record, and display metadata                                                                         |
| `RecoveryRecord`    | Working-copy snapshot, compact transaction journal, durability state, and source named revision                                                               |

Import creates a new `MapRecord` while preserving the portable document's
identity/provenance unless the user explicitly duplicates or **Edits a Copy**,
which creates a new portable identity as well. Favorites, timestamps, Trash,
thumbnail keys, restore records, and local race results are not part of
canonical map equality.

### 22.3 Coordinate and canonical-number contract

The first schema fixes these rules:

- Right-handed Three.js/Rapier world coordinates.
- Meters for position, distance, size, and speed-related authored values.
- Seconds for duration and radians for persisted scalar angles.
- +Y is up; +X is right; +Z is the canonical vehicle/track forward direction
  at identity rotation.
- Entity position is a finite `[x, y, z]`.
- Entity rotation is a normalized quaternion `[x, y, z, w]`, with one
  documented canonical sign representation. Inspector Euler angles are a UI
  conversion, not persisted ambiguous rotation order.
- Entity scale remains finite and positive. Mirror tools bake a safe mirrored
  authored result instead of relying on negative physics scale.
- Track bank is a finite signed radian value around the sampled forward axis.
- Colors use a documented sRGB representation; physics strengths use
  dimensioned fields or named normalized ranges.
- The schema defines safe numeric ranges. Import rejects NaN, infinity,
  underflow-like denormals where unsafe, and values outside stability limits.
- Canonical encoding sorts keys deterministically, normalizes `-0` to `0`, and
  emits the shortest round-trippable finite decimal without lossy cosmetic
  rounding.

### 22.4 Prohibited persisted state

Never serialize into `MapDocument`:

- Three.js UUIDs as authored identity.
- Rapier handles, contacts, sleeping state, or velocities.
- Generated meshes, collider caches, render targets, or materials.
- Undo stacks.
- Current editor camera/selection as required runtime map data.
- Arbitrary JavaScript, expressions, URLs, or filesystem paths.

Stable authored IDs map to runtime entity IDs through compiler-owned tables.

## 23. Architecture plan

### 23.1 Core lifecycle

```text
MapRepository <-> MapRecord + RevisionRecord
                          |
                    MapDocument <-> EditorSession
                          |
                   validate + compile
                          v
               immutable RuntimeBlueprint
                          |
                          v
          disposable Playtest/Normal-Play WorldSession
```

The editor never mutates live Rapier or Three objects as its durable model.
Editor previews are generated views of `MapDocument`; Test Mode uses a compiled
snapshot.

### 23.2 Responsibilities

| Component                   | Responsibility                                                                                        |
| --------------------------- | ----------------------------------------------------------------------------------------------------- |
| `EditorSession`             | Document, selection, camera, active tool, dirty state, transactions, undo/redo, and Edit/Test handoff |
| `MapRepository`             | IndexedDB maps, working copies, restore points, thumbnails, prefabs, Trash, and atomic revisions      |
| `MapCodec`                  | Canonical JSON encode/decode, import/export safety, version dispatch                                  |
| `MapMigrator`               | Pure schema migrations and compatibility reports                                                      |
| `MapValidator`              | Structural, geometry, race, interaction, safety, and performance diagnostics                          |
| `EditorHistory`             | Compact command transactions; one user gesture per semantic action                                    |
| `EditorToolController`      | Selection, placement, transform, track, wall paint, route, link, and erase tools                      |
| `TrackBuilder`              | Spline sampling, preview chunks, render geometry, collider geometry, wall ranges, and junctions       |
| `MapCompiler`               | Validated `MapDocument` to immutable runtime blueprint and stable-ID lookup                           |
| `WorldSession` factories    | Build and dispose one runtime map and its gameplay systems from a blueprint                           |
| `RaceSession`               | Staging/countdown/results, race mode, progress graph, finishes, laps, timing, wrong-way, and recovery |
| `SurfaceContactSystem`      | Per-collider/per-wheel surface lookup, deterministic effect blending, impulses, cooldowns, and reset  |
| `EnvironmentSession`        | Apply and restore map scene, gravity, lighting, fog, background, music, and presentation overrides    |
| `InteractionRuntime`        | Deterministic preset event-condition-action execution                                                 |
| `ViewportRenderCoordinator` | Adaptive clusters, cameras, viewport/scissor layout, quality policy, markers, and HUD                 |
| `EditorUiController`        | Library/workspace/tutorial/validation UI, focus, responsive layout, and reduced motion                |

### 23.3 Existing-code integration

The current architecture already has a persistent `GameApp`, one disposable
`WorldSession`, a fixed 0.02-second Rapier simulation step, a typed settings
service, and disciplined disposal. The editor implementation should extend
those boundaries rather than create a second application.

Required refactors:

- Make app state hierarchical enough for library, edit, playtest, and test pause.
- Replace hard-coded Sandbox construction in `WorldSession` with an immutable
  runtime blueprint and factories.
- Express the existing Sandbox through the same data/factory route while
  retaining its protected source-reference values and regression tests.
- Keep settings in `localStorage`; do not stretch the synchronous settings
  adapter into a map database.
- Generalize start spawning, recovery, markers, camera ownership, and runtime
  interactables.
- Make marker and HUD projection viewport-aware.
- Isolate generated editor preview resources and dispose replaced chunks.

The original Sandbox becomes a locked built-in template with **Edit a Copy**.
The protected Profile A scenario must remain reproducible.

### 23.4 Suggested source organization

This is a planning target, not a requirement to create files before their
phase:

```text
src/
  editor/
    EditorSession.ts
    EditorHistory.ts
    EditorCameraController.ts
    selection/
    tools/
    track/
    tutorial/
    ui/
  maps/
    MapDocument.ts
    MapCodec.ts
    MapMigrator.ts
    MapValidator.ts
    MapCompiler.ts
    MapRepository.ts
    runtime-blueprint.ts
  gameplay/
    race/
    interactions/
    recovery/
    surfaces/
  world/
    environment/
  render/
    ViewportRenderCoordinator.ts
    AdaptiveCameraClusters.ts
    ViewportMarkerSystem.ts
  ui/
    screens/
      CustomMapPickerScreen.ts
      MapLibraryScreen.ts
      EditorScreen.ts
      RaceResultsScreen.ts
```

Module names may change, but ownership boundaries and testability may not be
collapsed.

## 24. Undo, redo, and transactions

“Unlimited undo” means no arbitrary user-facing action count during the current
editing session, subject only to browser stability.

- Store compact document commands, not generated meshes, colliders, screenshots,
  or full runtime worlds.
- One drag, draw stroke, wall paint stroke, wheel burst, or grouped property
  change is one transaction.
- Undo and redo reproduce canonical document state deterministically.
- A new edit after undo clears only the abandoned redo branch.
- Test Mode and Save do not clear history.
- If memory pressure requires compaction, preserve the current document and
  persistent restore points, explain the reduced history, and never crash
  silently.
- Long operations either commit atomically or leave the document unchanged.

## 25. Validation and performance guidance

### 25.1 Diagnostic levels

| Level       | Meaning                                                                             | Editor behavior                                                          |
| ----------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Green       | Healthy on the measured reference budget                                            | No interruption                                                          |
| Amber       | Approaching a costly area                                                           | Explain the category and a suggested improvement                         |
| Red         | Likely frame-rate, physics, memory, or storage trouble                              | Strong warning; creation and safe free-drive usually remain allowed      |
| Safety stop | Another operation is likely to crash, corrupt, or create unsafe non-finite geometry | Block only that operation or runtime compile; preserve all existing work |

The meter reports separate contributors:

- Render geometry and draw cost.
- Dynamic and kinematic physics cost.
- Collision complexity.
- Interaction/event cost.
- Memory and generated-cache cost.
- Storage/autosave cost.
- Active-player and adaptive-viewport render cost.

Published limits must come from measured reference maps and named hardware, not
a simplistic universal object count.

### 25.2 Warning design

Warnings:

- Name the expensive object or category.
- Show where it is when practical.
- Offer specific fixes such as making objects static, reducing repeated
  dynamics, shortening an animated range, or testing with fewer cameras.
- Never silently delete, merge, simplify, or disable authored content.
- Do not block Test Mode merely because a scored race is incomplete.

### 25.3 Responsiveness

Target normal editor interaction at 60 fps on the supported reference PC.
Selection and placement should remain responsive while validation and chunk
generation run. Pure schema, graph, and cost analysis should move off the hot
render path and may use a worker where appropriate.

## 26. Accessibility and child safety

- Use semantic DOM controls for panels, dialogs, library cards, and property
  fields.
- Preserve keyboard focus through panel transitions.
- Keep visible focus indicators.
- Never rely only on color for player identity, validation, route state, or
  selection.
- Support UI scale and browser zoom without clipped essential controls.
- Respect `prefers-reduced-motion` and the in-game Reduced Motion setting.
- Give all modifier actions visible clickable equivalents.
- Use plain labels and short error messages, with optional detail disclosure.
- Confirm irreversible empty-trash actions; ordinary object deletion remains
  immediately undoable.
- Do not require an account, public profile, microphone, camera, or personal
  information.
- Tutorial evaluation with children requires guardian consent and must not
  collect identifying data in the game.

## 27. Failure and recovery behavior

The editor requires explicit handling for:

- IndexedDB unavailable, denied, full, or transaction failure.
- Browser storage cleared or evicted.
- Import parse, validation, migration, or size failure.
- Autosave interrupted during a revision.
- Page refresh or crash.
- WebGL context loss and restoration.
- Rapier/runtime compile failure.
- Generated mesh/collider failure.
- Fullscreen exit or resize during Test Mode.
- Controller disconnect during multiplayer Test Mode.
- Hidden tab and return.
- Out-of-memory pressure and history compaction.

The last valid map revision remains recoverable. Errors do not replace the
current library entry with partial data. When the renderer or playtest cannot
recover safely, return to the intact editor document or library.

Live WebGL context restoration is desirable but is not the minimum Release 1
contract. The existing safe Profile A behavior—stop rendering, show a clear
error, and require reload—remains acceptable if the editor first preserves all
already durable work and reload exposes **Recover Last Session**. A context
loss during Test Mode may discard that race simulation; it must not discard or
corrupt the authored map. A later live-rebuild path may improve this behavior
only if it also passes the existing context-loss acceptance coverage.

## 28. Implementation phases

Every phase ends with a runnable, testable build. All phases are required for
Editor Release 1.

| Phase                               | Deliverables                                                                                                                                                                                                   | Exit gate                                                                                                                         |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Entry — Protected baseline          | Create the tagged, tested Profile A baseline required by the canonical GDD and record its evidence                                                                                                             | Immutable baseline is reproducible before editor code begins                                                                      |
| 0 — Contracts and spikes            | Portable/local data split, coordinate/numeric contract, catalog-manifest schema, canonical codec, migration fixture, Sandbox blueprint proof, edit/test proof, spline prototype, and 2/4/10-view benchmark     | Architecture decisions recorded; round trip is stable; Profile A regression passes; no unresolved ten-view renderer blocker       |
| 1 — Library and persistence         | IndexedDB repository, per-transaction recovery journal, working copy, ten restore points, protected built-ins, Edit a Copy, thumbnails, organization, Trash, and import/export                                 | Failure-safe save/import/crash tests pass; built-ins cannot be damaged; storage UI tells the truth                                |
| 2 — Core editor                     | Workspace shell, responsive UI, editor camera, top-down toggle, picking, selection, transforms, contextual wheel, snapping, object tray, grouping, duplication, prefab foundation, history, tutorial framework | A first-time flow can place/edit/undo/save basic objects without advanced panels                                                  |
| 3 — Tracks                          | Spline and modular track tools, chunked render/collision generation, width/elevation/banking, overpasses/tunnels, surfaces, colors/glow, independent wall ranges, branch/junction editing                      | A creator can draw, reshape, partially wall, jump, undo, save, reload, and drive a track with continuous seams                    |
| 4 — World building and interactions | Complete typed catalog manifests, physics/gameplay objects, surface contacts, environment lifecycle, visual preset links, deterministic interaction runtime, and validation                                    | Every asset contract compiles/resets/disposes; surfaces and environments do not leak into other sessions; links work without code |
| 5 — Race and playtest               | Race types, normal Play route, countdown/results, deterministic 1–10 grid allocation, route graph, checkpoints, finishes, shortcuts, recovery, scored/free-drive validation, and exact Edit/Test state         | Complete multiplayer race and Test flows pass; 50 Edit/Test and normal-race cycles remain state- and resource-stable              |
| 6 — Adaptive local cameras          | Cluster algorithm, camera pool, renderer coordinator, viewport-aware HUD/markers, split/merge transitions, reduced motion, multi-view quality policy                                                           | Deterministic 1–10-player tests pass; every player appears once; hysteresis and performance targets are met                       |
| 7 — Ship polish                     | Final tutorial content, Show Me demonstrations, accessibility, child usability review, performance budgets, heavy-map guidance, migrations, context/storage recovery, browser matrix, long soak                | All acceptance criteria pass or have an explicit user-approved deviation; complete Release 1 definition of done is met            |

No phase may silently defer an included feature to the future-footnote list.

## 29. Acceptance criteria

All criteria are `REQUIRED` until implementation evidence marks them otherwise.

### 29.1 Document, storage, and library

| ID          | Criterion                                                                                                                                                 |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ED-DOC-001  | A representative map survives save -> load -> canonical save without semantic change or unstable IDs.                                                     |
| ED-DOC-002  | Every supported older fixture migrates deterministically; a failed migration leaves the previous valid revision untouched.                                |
| ED-DOC-003  | Corrupt, oversized, deeply nested, non-finite, duplicate-ID, unknown-behavior, and executable-content imports are rejected without changing the library.  |
| ED-DOC-004  | Export/import preserves geometry, tracks, wall ranges, routes, links, environment, race rules, tags, and behavior settings.                               |
| ED-DOC-005  | Coordinate fixtures round-trip meters, +Y-up/+Z-forward transforms, quaternions, bank angles, and canonical finite numbers without axis/order ambiguity.  |
| ED-DOC-006  | Changing favorites, timestamps, thumbnails, Trash, restore history, or local results does not change canonical portable map bytes.                        |
| ED-DOC-007  | A map created with a library prefab exports and imports without access to that local prefab record.                                                       |
| ED-LIB-001  | Built-in maps cannot be overwritten, renamed in place, or trashed. **Edit a Copy** creates an independent user map.                                       |
| ED-LIB-002  | Search, sort, favorites, tags, recent maps, duplicate, thumbnail, and Trash work with keyboard and pointer input.                                         |
| ED-LIB-003  | A valid saved user map launches through ordinary 1–10-player setup and returns to results/library without entering Editor Mode.                           |
| ED-SAVE-001 | Autosave completes within two seconds after a normal edit settles on reference hardware and never reports **Saved** before commit.                        |
| ED-SAVE-002 | Crash recovery restores through the last durably journaled transaction, loses at most an active/pending gesture, and never replaces a newer map silently. |
| ED-SAVE-003 | At least ten restore points can each be previewed and restored as a playable copy.                                                                        |
| ED-SAVE-004 | Quota denial, IndexedDB failure, and storage eviction produce recovery/export guidance while retaining the in-memory document where possible.             |

### 29.2 Editor interaction and onboarding

| ID        | Criterion                                                                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ED-UX-001 | At least four of five target-age child testers complete the tutorial and test a drivable mini-track within five minutes with at most two adult prompts. |
| ED-UX-002 | Pointer and wheel edits show visible feedback within 50 ms on named reference hardware.                                                                 |
| ED-UX-003 | A first-time user can draw, extend, reshape, bank, partially wall, undo, and test a track without opening an advanced panel.                            |
| ED-UX-004 | Every modifier operation has a visible mouse-clickable equivalent and a contextual value label.                                                         |
| ED-UX-005 | One continuous drag, draw, paint, or wheel burst produces one reversible history transaction.                                                           |
| ED-UX-006 | One hundred undo/redo cycles restore a canonical byte-equivalent document for the tested command sequence.                                              |
| ED-UX-007 | At target PC viewports, no essential control, dialog, text, or focus ring overlaps incorrectly or leaves the visual viewport.                           |
| ED-UX-008 | Reduced Motion removes nonessential travel/spring animation while preserving understandable state changes.                                              |
| ED-UX-009 | Repeat placement previews its count, spacing, and pattern; commit creates one editable group and one undo restores the entire placement.                |

### 29.3 Tracks and construction

| ID         | Criterion                                                                                                                                      |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| ED-TRK-001 | Drawing, point insertion/removal, extension, splitting, joining, and endpoint snapping preserve finite, editable track data.                   |
| ED-TRK-002 | Elevation and banking do not produce frame flips, NaNs, visible cracks, or collider gaps in supported non-inverted geometry.                   |
| ED-TRK-003 | A car crosses chunk seams, banked sections, overpasses, tunnels, and a representative jump without seam-triggered failure.                     |
| ED-TRK-004 | Editing one chunk does not regenerate unrelated chunks during the gesture.                                                                     |
| ED-TRK-005 | Independent left/right wall intervals survive ordinary control-point insertion, deletion, and movement.                                        |
| ED-TRK-006 | A wall paint/erase stroke can cover several ranges in one drag; one undo restores the complete prior state.                                    |
| ED-TRK-007 | Gradient, rainbow-style, emissive, per-range, and animated-color settings save, reload, and render using original built-in assets.             |
| ED-OBJ-001 | Every required catalog family can be placed, transformed, duplicated, grouped, saved, compiled, tested, and disposed.                          |
| ED-OBJ-002 | Free placement, grid snap, angle snap, surface snap, and numeric transforms agree on canonical values.                                         |
| ED-OBJ-003 | Every shipped asset has a typed manifest entry covering defaults, ranges, physics/sensors, links, reset behavior, disposal, and measured cost. |

### 29.4 Race, recovery, and interactions

| ID          | Criterion                                                                                                                                                                   |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ED-RACE-001 | Circuit, point-to-point, time trial, multi-route, shortcut, and free-roam maps each complete their intended runtime flow.                                                   |
| ED-RACE-002 | Every declared alternate route can finish; skipping a required checkpoint group or crossing in an invalid direction cannot advance progress.                                |
| ED-RACE-003 | Auto-generated checkpoints are editable and can be regenerated on one selected route without destroying unrelated manual work.                                              |
| ED-RACE-004 | Multiple valid finish nodes obey the selected any-finish or required-finish-group rule.                                                                                     |
| ED-RACE-005 | Invalid scored race rules still allow safe free-drive testing with clear warnings.                                                                                          |
| ED-RACE-006 | P1–P10 map deterministically to ordered clear start slots; insufficient capacity blocks scored start and identifies the grid.                                               |
| ED-RACE-007 | Normal Play stages cars, prevents false starts, runs 3-2-1-Go, and begins every player's timing/input on the same simulation boundary.                                      |
| ED-RACE-008 | Two- through ten-player finishes record valid order, interpolated time/ties, finish-window expiry, DNF, and a complete results/restart flow.                                |
| ED-RACE-009 | Time trial records independent elapsed times and keys local bests to the content revision and race-rule signature.                                                          |
| ED-REC-001  | Fall and stuck recovery return the car to the latest safe checkpoint facing forward with unsafe velocity cleared, protection applied, and configured delay/penalty honored. |
| ED-REC-002  | Blocked or unsafe authored recovery poses are found by validation and linked to **Show Me**.                                                                                |
| ED-LINK-001 | Required preset interactions execute deterministically at the 0.02-second fixed simulation step.                                                                            |
| ED-LINK-002 | Missing targets, incompatible links, instant cycles, and retrigger storms are rejected or bounded with understandable diagnostics.                                          |
| ED-SURF-001 | Normal, slippery, sticky, bouncy, slow, boost, and hazard contacts each match their typed strength/cooldown behavior without changing global vehicle defaults.              |
| ED-SURF-002 | Mixed wheel contacts resolve deterministically and clearing/resetting a world removes every temporary surface effect.                                                       |
| ED-ENV-001  | Repeatedly switching maps restores gravity, background, fog, lights, music, and pooled effects without cross-map leakage or resource growth.                                |
| ED-ENV-002  | Volume, Reduced Motion, particle/effect, high-contrast, photosensitivity, and quality settings constrain authored presentation.                                             |

### 29.5 Edit/Test lifecycle

| ID         | Criterion                                                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ED-TST-001 | Test input receives visible acknowledgement within 100 ms and a budget map becomes drivable within one second at the 95th percentile on named hardware. |
| ED-TST-002 | **Return to Edit** restores exact camera, selection, active tool, undo/redo stack, and dirty state.                                                     |
| ED-TST-003 | Runtime physics changes never alter serialized authored content.                                                                                        |
| ED-TST-004 | P1 quick start, local-player count, selected-checkpoint start, reset, pause, **Return to Edit**, **Edit Here**, and **Previous View** work.             |
| ED-TST-005 | Fifty Edit/Test cycles show no unbounded Rapier, GPU, listener, marker, HUD, or DOM growth.                                                             |
| ED-TST-006 | A failed runtime compile returns to an intact editable document with an actionable diagnostic.                                                          |
| ED-TST-007 | The pre-Test recovery checkpoint preserves the working copy without clearing dirty state relative to the named revision.                                |

### 29.6 Adaptive split screen

| ID          | Criterion                                                                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| ED-VIEW-001 | Deterministic 1–10-player layouts remain within canvas bounds with no overlap; every active player belongs to exactly one viewport.              |
| ED-VIEW-002 | When all active players are mutually outside the shared-camera fit threshold after its dwell time, viewport count equals active-player count.    |
| ED-VIEW-003 | Nearby players merge and separated players split according to distinct thresholds and dwell times.                                               |
| ED-VIEW-004 | Threshold-edge movement causes no more than one layout transition per second and does not flicker repeatedly.                                    |
| ED-VIEW-005 | No player, marker, or essential HUD identity disappears during animated split, merge, resize, fullscreen, or DPR changes.                        |
| ED-VIEW-006 | Each marker and HUD element uses the correct viewport camera and clips to the correct tile.                                                      |
| ED-VIEW-007 | Calibrated projected-vehicle size and safe-frame margins remain readable in human review of 2-, 4-, and 10-view layouts.                         |
| ED-VIEW-008 | Reduced Motion changes the layout without travel/spring animation and without pausing simulation.                                                |
| ED-VIEW-009 | Pause freezes one shared simulation consistently while all active viewports remain correctly composed.                                           |
| ED-VIEW-010 | The documented 2/4/10-view quality policy meets the named hardware budget or raises a truthful performance warning without hiding gameplay cues. |

### 29.7 Performance, accessibility, and resilience

| ID          | Criterion                                                                                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ED-PERF-001 | Simple, target-budget, and heavy reference maps have recorded render, physics, memory, compile, validation, and autosave measurements.                                    |
| ED-PERF-002 | The health meter attributes costly categories and offers specific actions; it never silently removes authored content.                                                    |
| ED-PERF-003 | The safety ceiling blocks only a demonstrated crash/corruption risk and preserves the map plus an export path.                                                            |
| ED-PERF-004 | A 30-minute mixed editing/playtest soak shows bounded runtime and generated-resource counts.                                                                              |
| ED-ACC-001  | Semantic panels, focus order, labels, zoom, UI scale, non-color cues, and reduced motion pass the supported browser matrix.                                               |
| ED-ACC-002  | Tutorial and essential editor actions remain understandable without audio.                                                                                                |
| ED-LIFE-001 | Refresh, hidden-tab return, storage failure, controller loss, resize, and fullscreen-exit scenarios return to a safe editor, test pause, or library state.                |
| ED-LIFE-002 | WebGL context loss either rebuilds safely or uses the accepted reload + Recover Last Session path without corrupting durable map content or weakening Profile A coverage. |

## 30. Verification strategy

### 30.1 Unit tests

- Schema parsing, canonical serialization, and every migration.
- Stable-ID reference checks.
- History transactions and command inversion.
- Spline sampling, arc length, frames, wall-range remapping, and chunk invalidation.
- Route reachability, checkpoint-group alternatives, lap progress, finishes, and
  shortcut rules.
- Start-grid allocation, countdown boundary, finish-time interpolation, ties,
  finish windows, DNF, and local-result signatures.
- Interaction ordering, compatibility, cycle detection, and retrigger bounds.
- Recovery pose selection.
- Surface contact weighting, effect order, cooldowns, and strength clamps.
- Camera cluster compatibility, hysteresis, layout bounds, and stable tile IDs.
- Complexity-cost aggregation.

### 30.2 Integration tests

- Editor gesture -> `MapDocument` -> preview.
- Save/load/import/export -> compile -> runtime.
- Existing Sandbox data -> blueprint -> protected Profile A behavior.
- Track mesh and Rapier collider continuity.
- Full visual-link scenarios.
- Edit/Test state isolation and disposal.
- Race progress and recovery with multiple branches.
- Ordinary saved-map Play through setup, countdown, finish, results, restart,
  and library return.
- Surface and environment apply/reset across consecutive worlds.
- Viewport-aware marker/HUD projection.

### 30.3 Browser tests

Use Chromium, Firefox, and WebKit for:

- Library and IndexedDB lifecycle.
- Pointer, wheel, modifier, focus, and responsive UI behavior.
- Import/export browser fallbacks.
- Edit/Test transitions.
- Normal Play, race modes, countdown/results, and recovery.
- 1, 2, 4, and 10-player camera layouts.
- Resize, fullscreen, DPR, hidden tab, controller disconnect, and context loss.
- Production-build WASM and worker packaging.

### 30.4 Visual and human review

Capture representative desktop sizes, including 1280 × 720 and 1920 × 1080:

- Empty editor.
- Busy inspector.
- Track drawing.
- Wall painting.
- Branch route overlay.
- Visual links.
- Library and restore flow.
- 2, 4, and 10 viewports.
- Reduced Motion and high UI scale.

Human review covers child comprehension, readable clutter, track feel, split
fairness, transition comfort, and whether performance warnings are helpful
rather than frightening.

### 30.5 Performance and soak

Record named CPU, GPU, browser, resolution, render scale, player count, and map
fixture. Measure:

- Editor input-to-preview latency.
- Frame-time percentiles.
- Fixed-step overload.
- Mesh/collider rebuild latency.
- Map compile latency.
- Autosave latency.
- Draw calls and render-target cost by viewport count.
- Rapier body/collider counts and step percentiles.
- Memory and IndexedDB use.
- Fifty Edit/Test cycles.
- Thirty minutes of mixed editing and multiplayer testing.

## 31. Risks and mitigations

| Risk                                                     | Consequence                                                | Mitigation                                                                                                                 |
| -------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Ten camera renders multiply GPU and post-processing cost | Split view becomes slower than the shared view it replaces | Benchmark in Phase 0; use one renderer, pooled cameras, explicit multi-view quality policy, culling, and measured warnings |
| Spline banking frames twist or collide poorly            | Cracks, flips, or impossible jumps                         | Arc-length sampling, stable transported frames, chunk seam tests, constrained non-inverted Release 1 geometry              |
| Collider regeneration blocks the main thread             | Track drawing feels sticky                                 | Cheap preview during gestures, affected-chunk rebuilds, collider commit after gesture, performance instrumentation         |
| “Unlimited” undo stores generated data                   | Browser memory exhaustion                                  | Compact semantic commands only; generated resources remain disposable caches; explain rare memory-pressure compaction      |
| Flexible routes permit cheating or impossible races      | Wrong winners and confusing validation                     | Explicit route graph, checkpoint groups, reachability/order tests, visual overlays                                         |
| Interaction links form cycles or event storms            | Simulation stalls or behaves nondeterministically          | Whitelisted presets, deterministic order, graph diagnostics, bounded retriggers and per-step budgets                       |
| Autosave or import overwrites valued work                | Loss of trust and maps                                     | Atomic revisions, new identity on import/copy, ten restore points, Trash, truthful state, export reminders                 |
| Heavy maps exceed 50 Hz physics or browser memory        | Poor play or crash                                         | Measured category budgets, warning-first guidance, final safety ceiling, no silent simplification                          |
| Progressive disclosure hides power                       | Experienced creators cannot find controls                  | Search, inspector disclosure, visible modifier equivalents, Show Me, consistent tool locations                             |
| Too many controls overwhelm children                     | Tutorial abandonment                                       | Picture cards, five primary actions, one instruction at a time, contextual inspector, observed child tests                 |
| Editor refactor breaks Profile A                         | Reconstruction regression                                  | Locked built-in Sandbox, shared blueprint path, protected constants, existing acceptance suite at every phase              |

## 32. Definition of done

Editor Release 1 is done only when:

- The protected baseline entry gate and Phases 0–7 are complete.
- Every included feature in Section 3 is usable and not represented by a
  placeholder.
- All applicable Section 29 acceptance criteria pass or have an explicit
  user-approved deviation.
- The seven-step tutorial meets its child-usability target.
- A creator can make and test an open playground, a circuit, a point-to-point
  race, and a branching suspended stunt track.
- Walls, surfaces, environments, objects, routes, checkpoints, finishes,
  recovery, and visual links round-trip through save/export/import.
- Built-in maps remain protected and editable only as copies.
- Autosave, ten restore points, crash recovery, Trash, and backup export work
  under tested failure cases.
- Test Mode uses the real game and returns to the exact editor state.
- Adaptive shared/split cameras work from 1–10 local players with stable,
  readable HUD and documented performance behavior.
- The editor remains responsive on the named reference PC and warns truthfully
  on heavy maps.
- Accessibility, browser, production, lifecycle, migration, context-loss, and
  soak suites pass.
- Profile A's protected Sandbox behavior and acceptance evidence remain intact.
- No unlicensed or copied third-party assets, code, map geometry, music, or
  branding have been introduced.
- README and implementation-status documentation explain how to run, test,
  back up, and recover editor maps.

## 33. Future notes

These ideas remain documented but uncommitted until after Release 1:

1. Inverted stunt expansion: loops, corkscrews, upside-down track, magnetic
   adhesion/downforce, new spline frames, vehicle behavior, and camera rules.
2. AI racing: computer-controlled racers, navigation, racing-line editing,
   overtaking, difficulty, and validation. Release 1 centerlines and route
   graphs should avoid blocking this future work.
3. Advanced logic: a safe visual logic expansion or scripting system only after
   permission, sandboxing, determinism, migration, and abuse risks are designed.
4. Custom assets: image, model, and audio imports only after file validation,
   quotas, licensing UX, rendering safety, and export packaging are specified.
5. Mobile authoring: touch/tablet interaction designed independently rather
   than mapping desktop modifiers directly.
6. Connected maps: share codes, cloud backup/sync, community browsing, ratings,
   moderation, reports, parental/privacy controls, and downloaded-map safety.
7. Collaborative editing: conflict resolution, permissions, identity, and
   network recovery as a separate later product.

## 34. Implementation handoff rules

When code work is authorized later:

- Satisfy the protected baseline entry gate, then begin Phase 0 and keep the
  game runnable after every phase.
- Treat `MapDocument` as the authored truth and runtime objects as disposable.
- Add tests with each behavior rather than postponing them to Phase 7.
- Preserve unrelated user changes in the working tree.
- Do not edit the read-only reconstruction package.
- Do not weaken existing Profile A values or tests to accommodate authored
  maps.
- Keep migrations, failure handling, and disposal in the first implementation
  of each subsystem.
- Record measured performance budgets instead of inventing permanent object
  counts.
- Use the acceptance IDs in this document in implementation status and test
  evidence.
- Do not move an included feature to the future list without explicit user
  approval.

## 35. Open decisions

There are no blocking product questions remaining for this GDD.

Implementation calibration will still determine named reference hardware,
measured performance thresholds, exact split/merge fit values, and the
multi-viewport post-processing quality policy. Those are evidence-driven
engineering decisions inside the approved design, not reasons to reduce its
scope.
