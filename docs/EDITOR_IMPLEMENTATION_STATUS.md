# Mini Wheels Editor implementation status

Status date: 2026-08-08 (America/Vancouver)  
Canonical editor plan: [LEVEL_EDITOR_GDD.md](./LEVEL_EDITOR_GDD.md)

## Entry record

The user explicitly authorized beginning the editor on 2026-07-30.

The protected repository baseline at the start of this implementation turn was
Git revision `502981b`. The worktree already contained uncommitted Profile A/B
vehicle, input, UI, documentation, and test changes from earlier work. No tag or
commit was created, and those existing changes were preserved.

This authorization permits the GDD's foundation work to start while remaining
external Profile A sign-offs are open. It does not permit weakening the
protected Sandbox behavior or its tests.

## Phase status

| GDD phase                   | Status        | Current evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Still required                                                                                                                                   |
| --------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Entry — protected baseline  | `PARTIAL`     | Starting revision and dirty-worktree boundary recorded; existing Profile A suite remains part of verification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Create the requested immutable release tag/commit only when the user authorizes repository history changes                                       |
| 0 — contracts and spikes    | `PARTIAL`     | Portable schema v1, coordinate conventions, strict canonical codec, stable IDs, typed spline nodes/tracks/wall ranges, import-safety foundation, immutable runtime blueprint, and unit coverage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Full typed race/interaction schema, migrations beyond v1, Sandbox blueprint conversion, edit/test lifecycle proof, and 2/4/10 viewport benchmark |
| 1 — library and persistence | `PARTIAL`     | IndexedDB repository with safe memory fallback; create, list, manual save, edit autosave, reload, and duplicate maps; protected starter template; atomic prior-revision restore points capped at twenty; recover-as-copy; tags/favorites/search/sort; recoverable Trash; strict portable JSON import/export; bounded pre-autosave crash-recovery journal with forced-reload restoration; local automatic thumbnails; storage persistence/usage/quota status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Compact journal-delta storage, an explicit page-exit flush retry, and failure-injection/quota browser coverage                                   |
| 2 — core editor             | `COMPLETE`    | Responsive authoring workspace; orbit/pan/zoom/top-down camera; permanent 15%–350% zoom slider and Alt+wheel camera override; closest-visible-hit picking; pre-click hover labels/highlights; click/shift/box multi-selection; direct move/turn/size gizmos; independent grid/angle snapping; dual-mode click preset or corner-drag rectangular floor placement with live dimensions; floor/start-grid placement ghosts; contextual wheel and numeric transforms; aspect-preserving rectangle resizing; duplicate/delete; copy/paste; semantic transaction undo/redo; seven-step road-to-Test-Mode first-run/replayable tutorial with per-step Show Me highlights; searchable object tray; live validation and browser coverage; portable whole-unit grouping/ungrouping with shared-center transforms; IndexedDB-backed local prefabs with self-contained editable placement; default-on upward-surface stacking with a visible opt-out; magnetic authored track endpoints; thirty-eight searchable built-in assets                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | —                                                                                                                                                |
| 3 — smooth track authoring  | `COMPLETE`    | Press-drag spline drawing with live translucent road preview; jitter-reducing freehand simplification; grid-distance and 15° direction guides; persistent bright handles at every unconnected endpoint; screen-space and plan-view magnetic snapping across different track heights; tangent-preserving departure and arrival transitions; automatic opposite-end loop bridging; joining separate open track objects with an eased height bridge; free strokes that finish onto existing elevated ends; undoable open-track splitting at an internal control point; closed-loop opening at any selected point; tangent, length, and wall-range preservation across cuts; direct source-node hover/picking and snapped X/Z dragging; precise per-node X/Y/Z, width, and bank editing; authored cubic tangent geometry with vertical overshoot safety; independent in/out curve handles with horizontal and Shift-modified vertical dragging; automatic tangent reset; local tangent rebuilding and node-anchored range remapping; manual-tangent preservation through node edits and extensions; undoable midpoint insertion and safe point removal with wall-range remapping; contextual wheel point/whole-track width, elevation, and banking; depth-correct selectable road meshes and handles; independent left/right whole-track walls; direct left/right/both wall-range paint and erase brushes with live start/end highlighting; persistent distance-range selection; per-range wall side, height, thickness, and built-in visual style editing; per-range road width, bank, ten portable materials, and typed surface authoring with eased geometry transitions; backward-compatible save/load metadata; interval merge/split and one-stroke undo; walls that grow through extensions and wrap only complete closed seams; solid artifact-free road ribbons; deterministic chunked runtime road/wall render and Rapier collision; per-wheel typed surface lookup and deterministic normal/slippery/sticky/bouncy/slow/boost/hazard Test Mode effects; first playable Test Mode; semantic history, autosave/reload, strict validation, visual/browser evidence, 16-segment signature-keyed preview chunk reuse, exact runtime seam vertices, and 100-node bounded stress evidence | —                                                                                                                                                |
| 4 — world building          | `PARTIAL`     | Typed thirty-eight-asset manifest; complete floor/shape and track/boundary families; dynamic Ball/Cube authoring with physical properties, runtime simulation, reset, and disposal; deterministic Moving Platform and Rotating Bar authoring with visual paths, runtime passenger-compatible kinematic motion, reset, and disposal; authored Boost, Launch, Bounce, and Slow travel pads with distinct previews, bounded contextual controls, deterministic sensor effects, selective particles/audio, and strict save/load; reciprocal authored Portal pairs with selection-based linking, visible pair lines, strict save/load references, car/toy teleportation, retained exit speed, and bounded re-entry protection; placeable Direction Arrow and Arrow Sign guidance with color/glow controls and explicit optional sign collision; bounded Point Light and non-blocking Color Strip decoration with enabled-state controls and light-count performance guidance; seven race markers/sensors; strict required/optional checkpoint groups and directed normal/shortcut route edges; Race Setup for five modes, laps, finish rules, recovery delay/penalty; selection-based route and recovery-link actions; route/recovery overlays; delayed linked-pose and latest-checkpoint recovery; deterministic countdown/racing/results phases; post-recovery collision protection; deterministic per-player directed checkpoint/lap/finish progression, wrong-way and invalid-route rejection, finish order, elapsed time, recovery penalties, and compact Test Mode HUD; strict validation/canonical save-load; modular structures and collision evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Add remaining motion/physics, travel/speed, interaction, decoration, and environment families                                                    |
| 5–7                         | `NOT STARTED` | Defined in the GDD                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Race/Test Mode, adaptive cameras, polish, and release verification                                                                               |

## Current phase correction

The current catalog contains **forty-seven** searchable built-in assets, not
the earlier thirty-eight-asset snapshot in the summary table above. Phase 4 now
also includes the complete environment family and the first deterministic
no-code interaction slice. Its remaining work is broader action/event coverage,
interaction-aware prefab duplication, final performance-limit diagnostics, and
the Phase 4 release gate; the already-working race/Test Mode foundation is not
“not started.” Adaptive split-screen and final release polish remain later work.

## Latest milestone: no-code interactions and map-owned environments

The catalog now adds Physics Domino, Door, Sculpture, Button, Pressure Plate,
Trigger Zone, Timer, Counter, and Effect Emitter. Every object has a typed
manifest, bounded portable properties, strict codec support, editor/runtime
visuals, and an explicit reset contract. Doors use deterministic fixed-step
kinematic open/close motion rather than teleporting.

Selecting a compatible source and target opens the large **WHEN → DO** panel.
Creators can add a preset event, optional condition, and action without writing
code. Imports validate both ends against their manifests, reject broken
references and instant cycles, and cap link/action work. Test Mode polls authored
zones at the fixed step, edge-triggers enter/exit events, advances repeatable
timers and counters, commands doors/platforms, and plays pooled effects. Focused
unit and Chromium coverage proves a button smoothly opens a door.

Map-level **World Settings** now provide ground/void, day/sunset/night/custom
sky, background color, key and ambient lights, fog, gravity presets plus numeric
strength, three built-in procedural music beds with preview volume, and an
out-of-bounds recovery height. Safe visual changes preview immediately; physics
changes compile into Test Mode. `EnvironmentSession` owns the runtime ground,
fog, background, lights, and cleanup, while the audio service owns one bounded
music bed through the player-capped music bus. Leaving the map restores the
previous scene and stops its music. Old schema-v1 maps receive explicit safe
defaults, while unknown external music IDs remain rejected.

Saved user maps now expose **Play Map** in the ordinary library. This path
loads the immutable compiled map without entering Editor Mode, honors the
selected local player count, uses map-owned environment/music, supports pause
and deterministic reset, and returns to the map library. A scored map with
incomplete rules launches as clearly announced safe Free Drive instead of
starting a broken race or modifying the saved document. Chromium coverage
proves the normal-play launch, fallback, pause labels, and return route.

Authored spline walls now retain a per-collider road-facing guide derived from
their generated inner/outer vertices. Contact recovery uses that deterministic
inward direction from either side of a rail, so a tipped car outside a wall is
guided back toward the road instead of being slowly separated farther away.
The isolated glancing/tipped wall browser regression passes with the new guide.

## Earlier milestone: safe library organization and restore history

The map library now supports live name/tag search, recent/name/created sorting,
favorites, portable comma-separated tags, and recoverable Trash. Permanent
deletion is isolated behind explicit confirmation and also removes that map's
local restore history. Filters are immediate, keyboard-accessible semantic
controls, and do not change portable map bytes.

Strict human-readable JSON backups export from any active map and import into a
new local identity. Import is decoded and fully validated in temporary memory
before any repository write; malformed files and files above the bounded input
size fail without changing the library. Exported maps retain their portable
geometry, race data, tags, links, and authored behavior while excluding local
favorites, Trash state, and restore history.

Every named/autosave revision now atomically writes the new current map and its
prior revision to an IndexedDB restore-point store (with memory fallback). Up to
twenty historical revisions survive sessions. The library exposes them without
opening or overwriting the current map, and **Recover as Copy** gives the chosen
revision new local and portable identities. Repository tests cover the cap,
cleanup, invalid import, and copy safety; focused Chromium coverage exercises
tags, search, favorites, export, Trash, restore, permanent delete, import, and
restore-point discovery end to end.

Semantic edits also write a bounded recovery-journal snapshot before the normal
autosave debounce. The save badge distinguishes an in-flight recovery write
from a durably recoverable edit and a named save. On the next launch, a journal
entry based on the current named revision reopens as the working document and
then autosaves normally; a forced-reload Chromium test proves the edit survives
when the 700 ms full-save timer never fires. Automatic schematic thumbnails are
stored as local-only metadata, while the library reports estimated storage use,
requests persistent storage where supported, and warns near quota.

Core placement now has an explicit default-on **Stack on Surfaces** snap. It
raycasts only upward-facing authored object and road surfaces, applies the hit
height without changing X/Z grid behavior, works with individual assets and
prefabs, and can be disabled for ground-plane placement. The first-run/replayable
tutorial now follows the GDD's seven short actions: camera, road, road width,
ramp, wall paint, start/finish, and Test Mode. Show Me points at the relevant
large semantic control for every step and never modifies the map.

## Earlier milestone: object groups and local prefabs

General object grouping is now portable rather than a visual-only selection.
Selecting one member selects the complete group; move, turn, and resize operate
around the shared center; duplicate and paste create independent group IDs; and
deleting a member repairs a would-be singleton. Group, Ungroup, Ctrl+G, undo,
redo, strict save/load, and reload all preserve the intended unit.

Any entity selection can be named and saved as a reusable local prefab. Prefabs
are stored in their own IndexedDB store with memory fallback, appear in the
editor tray, show a complete placement ghost, rotate in 15° wheel steps, and
expand into ordinary editable grouped entities in one undoable placement. The
portable placed map contains every built-in asset and property it needs; deleting
the local prefab never changes existing copies. Internal Portal and Recovery
links remap safely when their complete relationship is included.

Focused Chromium coverage groups two blocks, reloads the group, saves and places
a rotated prefab copy, removes the prefab definition, and verifies all placed
objects remain. Pure coverage verifies shared-center transforms, independent
copy group IDs, malformed-singleton rejection, repository persistence, and
self-contained placement.

## Earlier milestone: decoration and guidance foundations

Direction Arrow, Arrow Sign, Point Light, and Color Strip establish the built-in
Decoration + Guidance family. All four are searchable, resizable, color-aware,
and portable through undo, autosave, strict canonical save/load, and Test Mode.
The floor arrow and color strip stay deliberately non-blocking. Arrow Sign
defaults to decorative and exposes one plain **SOLID · BLOCKS CARS** option
when creators need a real course boundary.

Point Light exposes bounded brightness, range, color, and starting state. Its
lamp remains visible while off, but only an enabled light creates a session-owned
Three.js light. Color Strip exposes bounded glow, color, and starting state for
low-cost road and scenery accents. Maps may exceed twelve enabled point lights,
but receive a clear performance warning instead of silently rejecting work.

Edit Mode and Test Mode use matching visuals and authored transforms. A solid
sign compiles exactly two low-restitution obstacle colliders; the other three
assets compile no collision. Focused Chromium coverage places all four through
the real tray, edits their contextual controls, verifies four visuals, two sign
colliders, and one live point light in Test Mode, then returns to the intact
six-object editor document.

## Earlier milestone: authored bounce and slow pads

Bounce Pad and Slow Zone complete the first authored travel-surface set. Both
are searchable, portable objects with distinct purple/blue preview symbols and
a contextual **TRAVEL + SPEED** inspector. Bounce exposes upward power; Slow
exposes the fraction of horizontal speed retained on entry, with `0.4` clearly
explained as 40%. Both expose a bounded reuse delay and retain ordinary
placement, transform, resize, copy, undo, autosave, and strict save/load.

Test Mode compiles both into non-blocking Rapier sensors shared by cars and
dynamic toys. Bounce guarantees at least the authored upward exit speed even
when a body arrives falling. Slow scales only horizontal velocity, preserves
vertical motion, and intentionally emits no booster particles or sound. Each
activation remains edge-triggered and requires a complete exit before the same
body can trigger it again.

Pure coverage verifies multiplier and minimum-vertical-speed math plus compiled
definitions. The focused Chromium lifecycle edits and enters Boost, Launch,
Bounce, and Slow objects with a real vehicle, confirms all four effects and the
silent Slow response, then restores all six authored objects in Edit Mode.

## Earlier milestone: authored portal pairs

Portal is now a portable built-in travel asset with a bright upright frame and
an explicit forward marker. Selecting one Portal and Shift-selecting another
reveals a child-readable **LINK PORTALS** action; linked endpoints draw a blue
Edit Mode line and work in both directions. Unlinked endpoints remain safe to
save and free-drive test while producing a clear validation warning.

Pair references are strict and reciprocal. Relinking repairs former partners,
unlinking or deleting either endpoint clears the other, and copying both ends
creates a new independent pair instead of retaining references to the source.
Canonical save/load rejects missing, self-linked, wrong-type, or one-way
references.

Test Mode compiles complete pairs into the existing Rapier portal sensor system.
Cars and dynamic toys keep a bounded portion of their entry speed, exit in the
destination's authored forward direction, synchronize render interpolation,
emit pooled particles/audio, and use the deterministic destination-exit/time
lock that prevents immediate teleport loops. Focused Chromium coverage links a
pair through the real editor UI, teleports a live vehicle exactly once, and
returns to the unchanged document.

## Earlier milestone: authored boost and launch pads

Boost Pad and Launch Pad are now portable built-in travel assets. Both display a
large forward arrow in placement and Edit Mode, and ordinary rotation chooses
the travel direction. Their contextual **TRAVEL + SPEED** inspector exposes
bounded forward power, upward lift, and reuse delay. Boost defaults to a flat
speed push; Launch defaults to a combined forward/upward impulse. Size,
transform, copy, undo, autosave, and strict canonical save/load all use the
same authored-object path as the rest of the catalog.

Test Mode compiles each pad into a rotated Rapier sensor. Entry applies the
authored local-forward velocity plus lift once per cooldown, triggers the
existing pooled booster particle/audio callback, and retains high-contrast,
reset, diagnostics, and disposal behavior. The focused Chromium lifecycle
edits both pads, confirms two live sensors, observes forward speed from Boost
and upward speed from Launch, then returns to the unchanged editor document.
Pure coverage verifies rotated direction, elevation, size, power, lift, and
cooldown compilation.

## Earlier milestone: authored moving platforms and rotating bars

Moving Platform and Rotating Bar are now portable built-in assets. Selecting a
platform exposes speed, endpoint pause, and local X/Y/Z travel; a bright Edit
Mode line and endpoint marker show its complete path. Rotating Bars expose a
signed degree-per-second speed, so creators can change both rate and direction
without scripting. Both retain ordinary transform, resize, copy, undo,
autosave, and strict save/load behavior.

Test Mode converts the authored objects into position-based kinematic Rapier
bodies driven from absolute fixed-step time. Platforms ping-pong between their
endpoints with deterministic dwell periods and preserve their authored
rotation. Bars rotate at the exact signed authored rate. They use the existing
moving-obstacle collision group, vehicle passenger-surface correction, render
interpolation, reset, diagnostics, and disposal paths rather than creating a
second motion system.

The focused Chromium lifecycle edits both assets, confirms one compiled
platform and bar, observes the platform advance and the bar rotate, then
returns to the unchanged editor document. Pure coverage also verifies that
rotating an authored platform rotates its local path and that distance/speed
produces the expected travel time.

## Earlier milestone: authored dynamic physics toys

The object tray now includes Physics Ball and Physics Cube as portable built-in
assets. Both have a child-friendly contextual **PHYSICS** inspector for weight,
grip, and bounce, plus ordinary placement, transform, resize, duplicate,
delete, undo, autosave, and strict save/load behavior. Values are bounded before
they reach the runtime document.

Test Mode compiles each object into an independent Rapier dynamic body with a
matching sphere or cuboid collider, authored mass/friction/restitution, CCD,
and interpolated rendering. Cars and other dynamic toys can push them, and the
existing booster and portal collision layers remain compatible. Objects that
fall out of the authored world return to their own authored pose with velocity
cleared. Reset rebuilds that authored state, and leaving Test Mode disposes all
dynamic bodies, colliders, meshes, materials, and bindings before restoring the
unchanged editor document.

The focused Chromium lifecycle places both assets, edits Ball physics, enters
Test Mode, confirms one live Ball and Cube, verifies ballistic movement,
forces a Cube below the recovery boundary, observes its clean authored-pose
recovery, and returns to Edit Mode with both objects intact.

## Earlier milestone: checkpoint recovery and race-state lifecycle

Scored Test Mode now begins in a deterministic three-second countdown. Vehicle
input is locked until the fixed-step boundary changes the race to `racing`, race
time and trigger progression cannot start early, and Free Roam retains its
existing immediate controls. Once every local player has finished, the session
enters `results`, freezes race input, preserves independent finish places and
times, and presents a compact race-complete state in the HUD.

Every successfully completed checkpoint now becomes that player's latest safe
fallback recovery pose. Its road-level height is derived from the bottom of the
gate, while its authored forward rotation is retained. Falls therefore return
to the most recent legal checkpoint rather than always returning to the start;
explicit Recovery Volume to Safe Recovery Pose links continue to take priority.

Any automatic or authored recovery now starts a visible 1.25-second `SAFE`
window. During that window the car continues to contact driveable ground and
activate race, portal, boost, and recovery sensors, but temporarily ignores
walls, obstacles, dynamic toys, and other cars. This prevents an unlucky safe
pose or nearby traffic from trapping the vehicle again before the player can
move away. The protection expires automatically and restores the ordinary car
collision mask.

## Earlier milestone: scored checkpoint and route progression

The object tray now exposes a searchable typed catalog instead of hard-coded
two-object checks. Twenty-seven built-in assets are registered: Floor, Circle Floor,
Rounded Platform, Polygon Platform, Freeform Floor, Void Base, Start Grid,
Block, Column, Physics Ball, Physics Cube, Road Straight, Road Corner, Bridge Deck, Guard Rail, Overpass
Support, Drive-Through Tunnel, Barrier, Ramp, Jump, Player Spawn, Checkpoint,
Finish Gate, Shortcut Marker, Recovery Volume, Safe Recovery Pose, and
Out-of-Bounds Volume. Every manifest records a stable ID,
plain-language name, category/search terms, placement defaults and safe size
range, render kind, physics/collider class, supported link actions, reset
behavior, and measured cost tier.

The first race-object slice distinguishes marker-only Player Spawns from true
non-blocking Checkpoint, Finish, Recovery, and Out-of-Bounds sensor volumes.
Edit Mode gives each object a bright, selectable visual; Test Mode creates
Rapier sensor cuboids with car-only event groups and never turns their visible
frames into solid collision. Finish Gates automatically join the race's stable
finish-reference list, deletion removes the reference, and undo restores both.
The strict codec now rejects finish references aimed at ordinary objects. A
real-vehicle browser test crosses both Checkpoint and Finish Gate volumes with
no collision or recovery.

Checkpoint groups and directed route edges are now strict, portable schema-v1
data. Selecting ungrouped checkpoints exposes a kid-readable **MAKE GROUP**
action for alternative gates; selecting exactly two in order exposes **LINK
ROUTE** and **LINK SHORTCUT**. Normal links render green and shortcuts purple.
The codec rejects empty/duplicate groups, checkpoints assigned twice, broken
entity/group references, self-links, and duplicate links. Deleting a checkpoint
repairs its group and removes orphaned edges in the same undoable transaction.
Safe Recovery Pose is a visible directional marker and Shortcut Marker is a
non-blocking sensor foundation.

Recovery Volumes can now be selected together with a Safe Recovery Pose and
paired through **ASSIGN POSE** without scripting. The inspector reports the
link, **CLEAR LINK** removes it, and a bright green Edit Mode line makes the
destination visible. Links are strict portable entity references, older
schema-v1 recovery volumes migrate to an unlinked `null` value, deleting a pose
clears every affected link, and undo restores both the pose and link. The
compiler warns about unlinked recovery volumes while still allowing free drive.
In Test Mode the car-only sensor begins the authored delay, then restores the
car at the pose's position and heading with linear/angular motion and temporary
surface/interaction state cleared. The standard recovery counter and audio
callback run exactly once.

The map inspector now exposes a compact **RACE SETUP** panel for Free Roam,
Circuit, Point to Point, Time Trial, and Multi Route modes, with lap count,
finish rule, recovery delay, and time penalty. Every change is one immutable,
undoable edit and keeps header/race mode data synchronized. Existing checkpoint
groups can be switched between required and optional, allowing an authored
shortcut edge to bypass optional progress without making the finish invalid.

Test Mode now compiles checkpoint and finish sensors into a per-player race
progress system. Only forward crossings of currently reachable groups advance;
reverse, duplicate, unreachable, and premature finish crossings do not. Alternate
checkpoint entities in one group satisfy the same stage, directed branches and
reconvergence unlock their authored successors, required groups gate the finish,
and circuit finishes reset group progress until the configured final lap.
Elapsed time, recovery penalties, independent finish order, invalid-route counts,
and wrong-direction counts are deterministic fixed-step state. A compact live HUD
shows laps, required checkpoint progress, time, warnings, and final place.

The first modular structure slice adds straight road decks and closed curved
quarter turns for quick grid-based layouts. Road Corner shares one deterministic
ear-clipped quarter-ring mesh between Edit Mode and an exact static Test Mode
trimesh collider; its width is bounded against its radius so imports cannot
produce an inverted turn. Bridge decks stay top-anchored as elevation changes,
overpass supports stay base-anchored while their height changes, and guard rails
compile with the same low-bounce wall contact identity as authored barriers.
Drive-Through Tunnel is a true open compound object rather than a solid box:
its two side walls and roof render, collide, reset, and dispose independently
while remaining one selectable map entity. Clear width and height plus wall and
roof thickness are bounded in the portable schema. A browser traversal places
the tunnel at ground level and drives the real vehicle completely through the
opening without recovery or an invisible center collision.

Blocks and columns resize without sinking through their supporting floor.
Circle Floor uses matching cylindrical preview/runtime collision. Rounded and
regular-polygon platforms share deterministic closed-prism vertices between
Edit Mode rendering and solid convex-hull Test Mode collision; resizing keeps
their footprint and safe corner proportions grounded.
Freeform Floor uses a direct press-draw-release lasso with a live cyan footprint.
Tiny or self-crossing outlines stay red and are rejected with a plain-language
message instead of saving broken geometry. Valid concave outlines are simplified
to a bounded 3–32 point polygon and share deterministic ear-clipped mesh vertices
with an exact static Test Mode trimesh collider. Void Base is a thicker,
high-contrast driveable foundation intended to stay readable when later
environment controls disable the global ground plane.
Ramps and jumps share one deterministic wedge definition between editor
preview geometry, Test Mode rendering, and solid Rapier convex-hull collision.
Their triangles face outward so wheel support rays recognize the upward slope,
and their colliders are closed volumes so a chassis cannot tunnel into or become
trapped inside a hollow ramp. Barriers
compile as low-bounce static obstacles, while floors, shapes, ramps, and jumps
compile as driveable static surfaces. All new objects retain ordinary move,
turn, size, duplicate, delete, undo, autosave, and Edit/Test lifecycle behavior.

Authored wall contacts now read Rapier's actual manifold normal and penetration
depth. Cars are moved a small bounded distance back toward the road, inward
velocity becomes a gentle outward exit, tangent momentum is retained, and
rail-created lift/extreme roll is clamped. The wall never rewrites an airborne
car's rotation. A separate jump-landing assist only becomes eligible after a
real airborne interval and a downward road ray reaches the final `1.4 m`; it
then blends rotation over several fixed steps toward a wheels-down landing
without teleporting the car or changing its ballistic position and velocity.

The canonical codec now accepts these exact built-in IDs with strict bounded
property schemas and rejects unknown assets. Unit coverage round-trips every
catalog entry, and the browser flow searches, places, compiles, disposes, and
restores the complete construction slice.

## Earlier milestone: first playable Test Mode slice

The editor now compiles the current immutable `MapDocument` snapshot into a
disposable authored `WorldSession`. **TEST NOW** launches the real vehicle on
authored floors and spline roads, with generated static Rapier collision for
solid chunked road ribbons and independently authored walls. Road collision is
split into bounded deterministic chunks and carries the authored material and
surface identity. Supporting wheel rays now resolve that identity into bounded,
fixed-step gameplay effects without mutating the protected vehicle defaults.

Test Mode supports normal driving, pause, **RESET TEST**, and **RETURN TO
EDIT**. Returning disposes the runtime world and reconstructs the preview from
the still-live editor session. The document, selection data, active object or
track tool, transform mode, exact orbit/top-down camera model, zoom, undo/redo
history, and pending autosave state survive the round trip. Runtime physics
never writes back into authored content. Sandbox startup and reset now use the
same world-session factory while retaining their protected arena behavior.

This completes the first free-drive lifecycle slice, not the complete GDD Test
Mode contract. Selected-checkpoint starts, **Edit Here**, **Previous View**,
environment fog/music, scored races, and the 50-cycle resource soak remain
required.

Authored runtime walls now use closed outward-thickened prisms instead of
zero-thickness collision sheets. Their bases overlap the road slightly, Rapier
corrects internal triangle-edge normals, and the road-facing contact uses low
minimum-combined friction, zero minimum-combined restitution, CCD-friendly
contact skin, and continuous curved faces. Runtime generation now applies the
same safe inside-radius and covered-road opening rules as the editor preview,
including same-height roads from separate track objects. Visual wall caps do
not become collision caps at automatic openings. Authored-wall contacts also
damp pitch/roll impulses; a car tipped beyond the safe rail angle is righted
while retaining most horizontal momentum. This prevents road/wall seams,
crossing branches, exposed caps, and rail-induced vertical hangs from trapping
the car.

Authored road and floor collider handles now feed a dedicated fixed-step
surface-contact resolver. Each supporting wheel has one documented equal
weight because the ray-cast controller does not expose a stable normal load.
Slippery and sticky contacts blend bounded tire grip, slow contact continuously
damps horizontal speed by its wheel fraction, and boost/bouncy/hazard contacts
trigger once on entry with independent cooldowns. Selected road ranges now
store a bounded `0.25×–2×` effect strength and `0.10–5.00 s` cooldown; one-shot
seams choose the strongest supporting profile and longest contacted cooldown.
Hazard response limits itself
to predictable yaw and horizontal speed loss rather than adding a flip impulse;
bouncy road restitution stays low so its scripted vertical impulse cannot be
doubled by the collision solver. Teleports, recovery, reset, and disposal clear
contact edges and temporary grip, while Sandbox colliders report no authored
surface and continue using their protected defaults.

## Foundation limitations

The current schema accepts the twenty-five implemented catalog assets plus typed spline
tracks, source nodes, wall ranges, checkpoint groups, and directed route edges.
Interaction arrays still remain empty. This is a deliberate fail-closed boundary,
not the final Release 1 format. Later phases must expand the typed interaction
validator and compiler before those links become authorable.

All twenty-five current catalog objects can be placed, selected, transformed,
duplicated, deleted, undone, and autosaved. Spline road and wall geometry now
compile for both editor preview and the first playable runtime Test Mode.

Track authoring now also includes an undoable **Smooth Curves** cleanup that
preserves authored jump elevations. Wall generation automatically clamps an
impossible inside radius and opens covered wall spans where the road overlaps
itself, treating that area like a junction instead of drawing loops or spikes.
Endpoint extensions can target another elevation and generate an eased ramp
between layers. Global elevation edits translate that complete height profile
instead of flattening its ramps.

Every open track now keeps a bright start/end pin visible even when the track is
not selected. Clicking a pin opens its exact height, width, bank, and position
details. Track drawing raycasts these screen-space pins before falling back to
plan-view magnetism, so a visibly elevated endpoint can be captured directly.
Free strokes can finish at an existing end, and two separate open tracks can be
joined into one editable road with a bounded eased transition between heights.

Layered roads now use a depth-only prepass before visible road color, preserving
the overlap cleanup within each ribbon while restoring correct near/far
occlusion between separate tracks. Vertical curve controls are also bounded to
a safe envelope so extreme height handles cannot fold a ribbon through itself.

Selected tracks now expose their authored control points directly. Hovering a
point highlights it, clicking selects it, and dragging reshapes the spline in
X/Z with optional grid snapping. The contextual inspector supports exact
position, height, width, and bank values plus midpoint insertion and safe
removal. Each drag or wheel burst is one undo step, and wall distances remap as
the track changes length.

Banking is floor-safe: the lower road edge remains anchored at the authored
track elevation and only the opposite edge rises. Wall thickness expands
horizontally, so low-side walls cannot be pushed below the supporting floor.

Floor placement supports both quick presets and drawn rectangles. Clicking
places the current wheel-adjusted square, while dragging previews and commits a
rotated, grid-aware corner-to-corner rectangle. Later wheel or gizmo resizing
preserves that rectangle's aspect ratio.

Track tangent data now drives the generated road instead of being ignored by a
separate preview spline. Selecting a point reveals two colored, independent
curve handles: each changes only its incoming or outgoing section. Dragging
shapes a smooth turn, Shift-drag adjusts vertical curvature, and Reset Curve
Handles returns that point to automatic shaping. Manual handles survive later
point movement, insertion, removal, extension, save, and reload. Moving a point
also remaps wall and road-style distances between stable node anchors instead
of scaling every earlier range against the track's new total length.

An internal control point now exposes **Split Track Here**. For an open road the
cut produces two independently editable tracks whose coincident ends receive
separate stable IDs and vertically stacked endpoint pins. For a closed loop the
same command opens the circuit at that point without dropping the former closing
segment. Tangents, elevation, banking, total length, and intersecting wall ranges
are retained, and the complete operation is one undo transaction.

Selected tracks now expose a compact **Wall Paint Brush** with left, right,
both, and erase choices. A creator drags directly along the visible road while
bright endpoint markers and a centerline preview show the exact affected range.
Paint strokes merge compatible intervals, erase strokes split only the touched
side ranges, partial walls remain partial on closed loops, and each complete
drag is one undoable, autosaved edit.

The adjacent **Select Range** tool now keeps a dragged distance interval
highlighted after release. Its compact inspector can apply side-specific wall
height, thickness, and one of five built-in visual styles only inside that
range. The operation splits intersecting wall intervals at exact boundaries,
preserves untouched sections, rejoins compatible neighbors, and remains one
undo step without changing the saved map schema.

The same persistent selection now edits road width, banking, material, and a
typed surface preset. Width and banking ease over the range edges instead of
forming hard steps, while material changes remain bounded to the selected
section. Optional schema-v1 road-range metadata keeps older saved maps loadable.
Runtime chunks now retain their surface identity, bounded strength, and
cooldown through collider creation and drive those settings in Test Mode. Maps
saved before these optional schema-v1 fields load with safe surface defaults.

Road-range material authoring now offers ten portable built-in appearances:
asphalt, concrete, dirt, ice, neon, racing stripes, checker, direction arrows,
rainbow, and sunset. Patterned styles use deterministic generated textures, so
saved maps need only a stable material ID and never depend on an external image
file. The editor preview and compiled Test Mode runtime share the same catalog,
UV scale, color treatment, and texture lifecycle. Stripes, checker, and arrows
also provide strong shape cues that remain useful without relying on color
alone.

Editor document refreshes now reconcile immutable entities and tracks instead
of clearing the entire preview scene. Roads are split into bounded 16-segment
preview chunks with deterministic geometry/material signatures. A range edit
disposes and regenerates only intersecting chunks, unchanged entities and
chunks keep their existing Three.js resources, wall-only edits do not rebuild
road geometry, and physics-only strength/cooldown changes rebuild no visual
geometry. Replaced resources are still explicitly disposed.

Runtime seam and stress fixtures now require adjacent collision chunks to share
the exact same boundary vertices. A deterministic 100-node elevated, curved,
and banked track also verifies finite geometry, per-chunk vertex/index budgets,
repeatable output, and a conservative build-time ceiling.

## Current verification

- Prettier format check: `PASS`.
- Strict TypeScript typecheck: `PASS`.
- ESLint: `PASS`.
- Unit suite: `PASS` — 32 files / 210 tests, including canonical map
  codec/compiler/repository coverage, semantic editor history, typed spline
  validation, track/wall transaction coverage, and deterministic bounded
  runtime road/wall mesh generation.
- Editor Chromium suite: `PASS` with a loaded-run timing warning — the latest
  broad editor/protected-runtime selection passed 37 active scenarios with 5
  intentional visual/production skips. Its only miss was the established
  glancing-wall timing check ending `0.21 m` beyond its strict position bound
  amid repeated physics-overload frame drops; the same scenario passed
  immediately in isolation. The new travel-pad lifecycle passed in both its
  focused and loaded runs.
- Full Chromium regression: `WARN` — the latest loaded run reached 40 normal
  passes and 11 intentional skips, while four unrelated runtime timing checks
  failed amid repeated physics-overload warnings. The brake/drift, controller,
  and moving-platform cases pass when isolated. The remaining soak case still
  exceeds its frame-rate-dependent cumulative exhaust-emission threshold after
  repeated sandbox rebuilds; its bounded live-particle, world-resource, and
  cleanup checks are separate and remain intact. No runtime behavior or soak
  expectation was changed in this editor milestone.
- Editor browser flow: `PASS` — Create -> place -> wheel edit -> numeric
  transform -> direct snapped drag -> box/multi-select -> copy/paste ->
  duplicate -> delete -> undo -> camera controls -> tutorial -> autosave ->
  reopen.
- Group/prefab flow: `PASS` — multi-select -> group -> select as one unit ->
  shared-center turn/resize -> duplicate with independent IDs -> ungroup -> undo
  -> strict autosave/reload -> name and save a local prefab -> preview and rotate
  -> place an editable copy -> remove its definition without changing the map.
- Library safety flow: `PASS` — edit tags -> save -> search -> favorite/filter
  -> export portable JSON -> inspect restore history -> Trash -> restore ->
  permanent-delete confirmation -> strict import -> recover an old revision as
  a new independent copy.
- Surface/tutorial flow: `PASS` — automatic upward-surface stack -> opt-out to
  ground placement -> seven-step tutorial presentation/Show Me -> immutable Test
  Mode launch -> intact return to Edit Mode.
- Floor placement flow: `PASS` — click preset -> drag live rectangle -> grid
  dimensions -> aspect-preserving resize -> semantic undo/autosave.
- Construction catalog flow: `PASS` — search built-in cards -> place Block,
  Column, Circle Floor, Rounded Platform, Polygon Platform, Void Base, Barrier,
  Ramp, Jump, Road Straight, Road Corner, Bridge Deck, Guard Rail, and Overpass
  Support -> place and drive through the three-collider Tunnel -> draw a valid
  concave Freeform Floor -> reject crossed imports and
  impossible corner width -> inspect and resize -> canonical save/load -> compile
  matching static colliders -> drive a real vehicle up the solid Ramp without
  tunneling -> return from Test Mode with all objects.
- Dynamic-physics flow: `PASS` — place Physics Ball and Physics Cube -> edit
  Ball weight/grip/bounce -> strict save/load -> compile matching dynamic sphere
  and cuboid bodies -> verify ballistic movement -> force the Cube below the
  world -> recover it at its authored pose with cleared motion -> return to Edit
  Mode with both objects intact.
- Authored-motion flow: `PASS` — place a Moving Platform and Rotating Bar ->
  edit platform path/speed/dwell and signed bar speed -> preview the platform's
  rotated local path -> strict save/load -> compile passenger-compatible
  kinematic bodies -> observe deterministic translation and rotation -> return
  to Edit Mode with both objects intact.
- Travel-pad flow: `PASS` — place Boost, Launch, Bounce, and Slow objects ->
  follow distinct arrows/patterns -> edit bounded power, lift, retained-speed,
  and cooldown values -> strict save/load -> compile four non-blocking sensors
  -> enter each with a real vehicle -> observe authored forward, upward,
  minimum-bounce, and horizontal-slow effects -> suppress particles/audio for
  Slow -> return to Edit Mode with all four objects intact.
- Portal-pair flow: `PASS` — place two upright Portal endpoints -> Shift-select
  and link them -> render the blue pair line -> strict reciprocal save/load ->
  compile one two-way sensor pair -> enter with a moving vehicle -> exit once
  at the other endpoint in its authored forward direction -> retain bounded
  speed and prevent a re-entry loop -> return to Edit Mode with the pair intact.
- Decoration/guidance flow: `PASS` — place Direction Arrow, Arrow Sign, Point
  Light, and Color Strip -> edit color, glow, brightness, range, and starting
  state -> keep floor markers and strips non-blocking -> opt the sign into
  collision -> strict save/load -> compile four matching visuals, exactly two
  sign colliders, and one live light -> return with all objects intact.
- Race sensor flow: `PASS` — place Player Spawn, Checkpoint, Finish Gate,
  Shortcut Marker, Recovery Volume, Safe Recovery Pose, and Out-of-Bounds Volume
  -> register the finish reference -> compile five sensor colliders -> drive through Checkpoint and Finish without
  blocking or recovery -> return to Edit Mode with objects and references intact.
- Recovery-link flow: `PASS` — place a Recovery Volume and directional Safe
  Recovery Pose -> multi-select and assign in the inspector -> enter Test Mode
  -> send a moving/spinning car into the volume -> honor the authored delay ->
  restore at the linked pose with cleared linear and angular motion -> expose a
  visible, timed collision-protection window.
- Scored-route flow: `PASS` — choose Point to Point in Race Setup -> create two
  required checkpoint groups -> draw a directed route -> place a finish -> enter
  Test Mode -> lock input and trigger progress through the three-second
  countdown -> reject the premature finish -> advance the first group -> fall
  and recover at that checkpoint -> advance the second group -> accept the
  finish -> enter results and render `FINISHED #1` in the live race HUD.
- Track browser flow: `PASS` — draw -> live preview -> select -> wheel and
  numeric edits -> add/remove walls -> endpoint continuation -> autosave ->
  reopen.
- Track point flow: `PASS` — hover/select handle -> drag to reshape -> exact
  X/Y/Z, width, and bank edit -> insert midpoint -> safe remove -> semantic
  undo.
- Curve handle flow: `PASS` — select point -> reveal independent handles ->
  shape only the incoming or outgoing curve -> Shift-shape vertical curve ->
  preserve authored tangents through node edits -> reset automatic curve ->
  semantic undo/autosave.
- Bank geometry flow: `PASS` — positive and negative 22.5°/45° banks keep
  their low edge at the authored elevation; a native-quality 35° bank capture
  remains fully above the supporting floor with both walls visible.
- Endpoint bridge flow: `PASS` — snap to either endpoint -> draw toward the
  opposite endpoint -> magnetic closure -> one closed track -> full wall-range
  growth -> gap-free wrapped wall seam.
- Wall cleanup flow: `PASS` — tighten/overlap a hairpin -> add both walls ->
  Smooth Curves -> preserve jump elevations -> clamp impossible inner radii ->
  open walls through covered road joins without spikes, caps, or fragments.
- Multi-layer flow: `PASS` — snap to an existing endpoint -> select a different
  track height -> preview and commit an eased climb -> preserve the profile
  through later global elevation/width/bank edits.
- Elevated endpoint flow: `PASS` — click a persistent open-end pin -> inspect
  its exact height -> lower the drawing height -> draw from open space onto the
  elevated pin -> screen-space capture -> one smoothly connected editable road.
- Separate-track join flow: `PASS` — select compatible open ends on two track
  objects -> orient both routes -> create a bounded cross-height bridge -> merge
  them into one track -> preserve whole-track wall intent -> semantic undo.
- Track split flow: `PASS` — select an internal point -> Split Track Here -> two
  open roads with coincident visible endpoint pins -> proportional wall-range
  division -> exact total-length preservation -> one-step undo. Closed loops use
  the same control to become one length-preserving open road.
- Wall brush flow: `PASS` — choose left/right/both paint or erase -> drag over
  the selected road -> preview the highlighted interval -> merge or split only
  the affected side ranges -> autosave -> restore the complete stroke with one
  undo.
- Persistent wall-range flow: `PASS` — drag Select Range -> retain bright
  endpoint/centerline highlighting -> choose side, height, thickness, and style
  -> split only intersecting wall intervals -> render the styled section ->
  restore the complete property edit with one undo.
- Persistent road-range flow: `PASS` — reuse the highlighted selection -> set
  width, bank, one of ten built-in materials, a typed surface, bounded effect
  strength, and cooldown -> ease the geometry at both boundaries -> save/reload
  the non-overlapping interval -> restore the complete road edit with one undo.
- Track appearance flow: `PASS` — choose a solid, non-color pattern, rainbow,
  or gradient road style -> generate its texture locally -> preview consistent
  longitudinal UVs -> compile the same stable ID and appearance into Test Mode.
- Incremental rebuild flow: `PASS` — edit one road range -> regenerate only
  intersecting 16-segment preview chunks -> retain unrelated chunk, entity, and
  wall resources -> change physics-only strength -> regenerate no visual mesh.
- Chunk seam/stress flow: `PASS` — build adjacent runtime collision chunks ->
  compare exact shared boundary vertices -> generate the same 100-node banked
  and elevated stress track twice -> stay finite and within deterministic
  geometry and build-time budgets.
- Test Mode flow: `PASS` — preserve a dirty live editor session -> compile an
  immutable runtime blueprint -> drive authored collision -> pause -> reset the
  authored world -> return to the same document, tool, camera/top-down/zoom,
  undo history, and pending autosave state.
- Surface-contact flow: `PASS` — carry road/floor surface identity through
  generated collider handles -> resolve mixed supporting-wheel contacts with a
  stable priority and equal contact weights -> blend bounded slippery/sticky
  grip at the authored strength -> apply fractional continuous slow ->
  edge-trigger scaled boost, bounce, and hazard with authored cooldowns -> clear
  temporary state on teleport/reset.
  Unit fixtures cover mixtures, ties, cooldown entry/hold/re-entry, and reset;
  Chromium confirms authored normal contact reaches the live Test Mode vehicle.
- Runtime wall-contact flow: `PASS` — generate a thick closed wall -> overlap
  its buried base with the road -> strike it diagonally at 12 m/s -> remain
  contained -> suppress large outward/vertical rebound -> retain along-wall
  motion -> force a severe rail-tip case -> right the car without a vertical
  launch; the isolated browser scenario passed five consecutive runs. Unit
  coverage also verifies collision openings for same-track self-crossings and
  separate same-height road crossings.
- Wall escape and jump landing flow: `PASS` — use contact-manifold normals to
  separate a tipped car from an authored rail -> retain along-wall momentum ->
  suppress rail lift without an orientation snap -> remain fully ballistic
  after a ramp -> wait until the authored road is within `1.4 m` -> blend toward
  a safe wheel-down landing. The isolated wall case passed 5 consecutive runs
  and the complete ramp flight/landing case passed 3 consecutive runs.
- Layer depth flow: `PASS` — render depth for all road layers before visible
  color and bound extreme vertical Bezier controls, preventing far roads from
  showing through near roads or folding into hanging loops.
- Viewport usability flow: `PASS` — a start grid above a road wins the closest
  visible hover/click hit, receives a pre-click highlight, and remains selected
  while Alt+wheel or the permanent slider changes camera zoom.
- Editor visual evidence: `PASS` — 1536 × 864 object and spline/wall authoring
  captures inspected at native quality; a dense grid/angle-guided circular
  stroke and a two-stroke endpoint bridge both produce continuous circuits;
  an additional top-down tight-overlap stress capture has clean wall openings.
- Existing Sandbox entry and editor-focused Profile A Chromium regression
  coverage: `PASS`; see the full-suite timing warning above.
- Production build: `PASS`.
