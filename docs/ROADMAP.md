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

- [ ] Audit every screen and editor panel; record click depth for each action.
- [ ] Editor: an always-visible icon toolbar for the main tools (select, move, road,
      walls, objects, test drive, undo/redo, save) with text labels on hover/focus.
- [ ] Object tray as icon tiles grouped by category, with search kept.
- [ ] Context panel shows only what applies to the current selection; rarely used
      settings fold away instead of moving to a separate screen.
- [ ] Front end: big icon buttons for Play, Create, Settings; fewer steps to a race.
- [ ] Keyboard and controller still reach everything; existing accessibility tests pass.

## Stage 5: split-screen cameras

- [ ] Split the view when players drive apart and merge when they regroup (1–10 players),
      as planned in `LEVEL_EDITOR_GDD.md` phase 6.
