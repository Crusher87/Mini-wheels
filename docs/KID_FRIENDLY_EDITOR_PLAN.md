# Kid-friendly creator plan

Status date: 2026-10-21. Goal from the owner: an 8-year-old should understand the map
creator on their own, the first time, without reading instructions. Everything the
creator can do today stays available; the simple version is what people see first.

## What successful creators do

| Creator                              | What makes it easy                                                                                                                                   | What we take from it                                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Super Mario Maker 2                  | A strip of big picture tiles; tap a tile, tap the level. One button flips between building and playing. Undo is always on screen. Almost no numbers. | Picture tiles, one big PLAY button, always-visible undo, no numbers in the simple view.  |
| Minecraft (Creative) / LEGO Fortnite | Items sorted into a few picture tabs; you pick from a short list instead of a long one.                                                              | Colour-coded category tabs with pictures, no more than about a dozen tiles per tab.      |
| ScratchJr / Toca Boca                | Icons first, one or two easy words, bright colours per group, big touch targets.                                                                     | Every button gets an icon and one or two words an 8-year-old can read.                   |
| Hot Wheels Unleashed / Trackmania    | The road is the main tool; you can test-drive at any moment and come straight back.                                                                  | ROAD and PLAY are the two biggest, always-visible buttons.                               |
| Roblox Studio / Fortnite Creative    | Powerful, but a beginner is buried in panels. Their own beginner modes hide the advanced panels until asked.                                         | An Easy/Pro switch: Easy hides numbers and expert panels; Pro shows today's full editor. |
| Nintendo Game Builder Garage         | Short guided lessons that make you do the thing, with a friendly voice that never blames.                                                            | Short friendly messages; mistakes are explained in kid words; the tutorial stays.        |

## Rules for every screen

1. **Easy first.** The creator opens in Easy mode. A clear PRO switch shows every
   advanced setting. Nothing is removed, only tucked away.
2. **Pictures plus one or two words.** Every button has an icon. Labels use words an
   8-year-old reads easily: Play, Road, Move, Spin, Bigger, Smaller, Copy, Bin, Undo.
3. **No numbers in Easy mode.** Positions, angles and power values become sliders,
   steppers or colour swatches, or stay hidden.
4. **Three things always on screen:** Undo, Play, and the save badge (saving is
   automatic, so a kid never loses work).
5. **Select something, get a big action bar** with Move, Spin, Bigger, Smaller, Copy and
   Bin, right under the play area.
6. **Short picture tabs.** Objects are grouped by colour and picture; a tab never needs
   a long scroll.
7. **Kind words.** Messages say what to do next, never what went wrong in tech words.
8. **Big targets.** Buttons are at least 48 pixels so small hands and trackpads hit them.
9. **Plain names.** No expert words in Easy mode (see the word list below).
10. **The one-minute test.** A first-timer must be able to draw a road, place a thing,
    drive it and undo a mistake within a minute, without help.

## Word list (shown names only; saved maps do not change)

| Today                           | Kid-friendly                          |
| ------------------------------- | ------------------------------------- |
| TEST NOW                        | PLAY                                  |
| SAVE MAP                        | SAVE                                  |
| TOP (top-down view)             | MAP VIEW                              |
| TURN                            | SPIN                                  |
| SIZE                            | SIZE                                  |
| OBJECTS / BUILD                 | BUILD                                 |
| PHYSICS BALL / CUBE / DOMINO    | BALL / BOX / DOMINO                   |
| MOVING PLATFORM / ROTATING BAR  | LIFT / SPINNER                        |
| BIG BUTTON / PRESSURE PLATE     | BUTTON / STEP PAD                     |
| TRIGGER ZONE / TIMER / COUNTER  | MAGIC ZONE / TIMER / COUNTER          |
| POINT LIGHT / COLOR STRIP       | LAMP / GLOW STRIP                     |
| EFFECT EMITTER / TOY SCULPTURE  | CONFETTI / STATUE                     |
| VOID BASE / FREEFORM / POLYGON  | SKY ISLAND / DRAW FLOOR / SHAPE FLOOR |
| START GRID / PLAYER SPAWN       | START LINE / START SPOT               |
| FINISH GATE / CHECKPOINT        | FINISH / CHECKPOINT                   |
| RECOVERY VOLUME / SAFE RECOVERY | RESPAWN ZONE / RESPAWN SPOT           |
| OUT OF BOUNDS / SHORTCUT MARKER | FALL ZONE / SHORTCUT                  |
| OVERPASS SUPPORT / GUARD RAIL   | PILLAR / RAIL                         |
| MY PREFABS / SAVE AS PREFAB     | MY BUILDS / SAVE THIS BUILD           |
| WHEN → DO (no-code link)        | WHEN → DO stays (with icons)          |

Small hint lines under tiles ("CLICK TO PLACE") disappear in Easy mode; the tile
picture and name are enough.

## Work, in order

### 1. Easy/Pro switch

- A PRO switch in the top bar; Easy is the default and the choice is remembered on
  this browser (safe if storage is blocked).
- Easy hides: numeric position/angle boxes, physics numbers, motion travel numbers,
  the WHEN → DO condition box, route and recovery linking panels, advanced world
  controls, tags, grid snap settings, the zoom slider, and the keyboard hint strip.
- Pro shows today's editor exactly as it is.
- Automated browser tests that drive expert panels run in Pro mode; new tests cover
  Easy mode.

### 2. Plain words and pictures

- Apply the word list to tiles, tabs, buttons and panel headings.
- Tabs get colours that match their tiles.
- Toasts and hover labels use the same plain names.

### 3. Big action bar for the selected thing

- When something is selected, a bar appears under the play area with Move, Spin,
  Bigger, Smaller, Copy, Bin and Done (deselect).
- Bigger/Smaller step the object's size; Copy duplicates; Bin deletes (undo brings it
  back).

### 4. Simple world and race choices

- Easy world panel: big Day / Sunset / Night buttons, a music picker, and gravity
  as Normal / Moon.
- Easy race panel: "Just drive" or "Race", and a laps stepper (– 3 +).

### 5. First-run help

- The first time, ROAD and PLAY gently pulse; the existing seven-step tutorial stays
  under HELP.

### Done when

- Easy mode passes the one-minute test on screenshots of each step.
- No expert word from the list appears in Easy mode.
- Format, lint, typecheck, unit tests and the browser suite pass; new Easy-mode tests
  pass; the change is on GitHub.
