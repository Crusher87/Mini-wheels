# Mini Wheels roadmap

Status date: 2026-10-21. Owner's goal: finish the creator so maps can be built and
played end to end, then make the whole UI easy for a first-time player: icon menus,
everything within one or two clicks, nothing buried, modern and readable.

Every stage ends the same way: format, lint, typecheck, unit tests, the Chromium
browser suite and a production build pass; the change is committed and pushed to
`origin/main`; and the owner gets a short plain-English summary of what to try in game.

## Stage 1: every WHEN → DO choice works

The editor already offers events and actions per object (`linkEvents` / `linkActions`
in `src/editor/EditorAssetCatalog.ts`), but Test Mode only carries out a few of them
(`WorldSession` `onAction`: doors, platforms, effect emitters).

- [x] Actions on every linkable target: enable/disable/pulse/reset on boost, launch,
      bounce and slow pads; enable/disable/toggle on portals; start/stop/reverse on
      rotating bars; show/hide/enable/disable/pulse on point lights and color strips;
      enable/disable on buttons, plates, zones, timers and counters.
- [x] Events from every linkable source: pads and portals fire `activated` when a car
      uses them; lights and emitters fire `activated`/`deactivated` when switched.
- [x] Copying or prefab-placing a group keeps the links that are internal to the group.
- [x] Unit tests for the new runtime behaviour and the link-preserving copy.

## Stage 2: play custom maps with friends

- [x] A clear route from the main menu to play a saved map with the normal 1–10 player
      setup, countdown and results (not only editor Test Mode).
- [x] Fair start-grid placement for 1–10 players on any authored grid.
- [x] Results screen with finish order and times, then Play Again / Back.
- [ ] Repeated play/edit cycles stay stable (browser test).

## Stage 3: safety and limits

- [x] Flush pending editor changes when the page is hidden or closed.
- [x] Warn before a map gets too heavy to run well (object, light and track budgets).

## Stage 4: UI pass for first-time players

Rule: every common action is reachable in one or two clicks from where the player is.

- [x] Audit the main screens (2026-10-21): the road tool sat about 25 tiles down the
      object tray, saved maps sat below the starter card, and the prefab form sat above
      the selected object's settings.
- [x] Editor: an always-visible icon toolbar (undo, redo, road, move, turn, size, top
      view, help) next to Test Now and Save, each icon with a short label and tooltip.
- [x] Object tray: eight category tabs (all, roads, floors, race, moving, boosts,
      switches, decor); search still looks across everything.
- [x] Context panel: the selected object's settings come first; prefab saving follows.
- [x] Front end: Play → My Maps reaches saved maps in two clicks; the library lists
      your maps before the starter card.
- [x] Keyboard and controller still reach everything; existing accessibility tests pass.
- [ ] After the owner's play-test: fold world and race settings into one-click
      sections if the right panel still feels long (the selection now shows first, and
      the seven-step tutorial already points new creators at roads and Test Now).

## Stage 5: split-screen cameras

- [ ] Split the view when players drive apart and merge when they regroup (1–10 players),
      as planned in `LEVEL_EDITOR_GDD.md` phase 6.

Scope note: today one `GroupCameraController` drives one `OrthographicCamera`, and
`RenderSystem` sends that camera through one post-processing chain (GTAO, FXAA) and one
DOM marker overlay. Split-screen needs a camera per cluster, scissored viewports through
post-processing, per-view markers and HUD, and a frame-time check on 2/4/10 views. It is
the largest remaining piece, so it starts after the owner has play-tested stages 1–4.
