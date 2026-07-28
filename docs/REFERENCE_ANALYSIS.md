# Mini Wheels visual reference analysis

This document translates the six supplied PNG references and the visual sections of the reconstruction GDD into browser-rendering targets. It is a capture and review aid, not a replacement for the GDD.

## Evidence and usage rules

- **Authoritative values** are copied from the GDD: geometry dimensions, player colors, arena palette, camera orientation, particle behavior, lighting model, and object transforms.
- **Observed values** describe what is visibly present in a supplied image.
- **Capture recommendations** are reproducible fixture choices needed to make a comparable browser image. They are not claims about values recovered from the Alpha.
- Promotional captions and the `MINI WHEELS ALPHA` logo are composited marketing elements, not gameplay HUD. Do not copy them into the browser build or visual-regression baseline unless use is separately authorized. For `VIS-008`, reproduce the game subject, framing, palette, and hierarchy while leaving the caption/logo regions empty or representing them only as non-shipping layout masks.
- Screenshot pixel colors are the result of lighting, shadows, transparency, color management, post-processing, compression, and possible promotional grading. They are not material albedos. The GDD palette remains authoritative.

## Reference set

| File             | Native size | Aspect | Frame type            | Principal target                                   |
| ---------------- | ----------: | -----: | --------------------- | -------------------------------------------------- |
| `1000006011.png` |  1536 × 863 |  1.780 | Promotional composite | Ten-player readability and color ring              |
| `1000006010.png` |  1536 × 863 |  1.780 | Promotional composite | Scattered cube stack and exhaust arc               |
| `1000006009.png` |  1536 × 863 |  1.780 | Promotional composite | Booster/ramp launch and height readability         |
| `1000006008.png` | 1536 × 1023 |  1.501 | Gameplay crop         | Car, intact green mass, exhaust, and long shadow   |
| `1000006007.png` | 1536 × 1023 |  1.501 | Gameplay crop         | Elevated moving platform beside a column           |
| `1000006006.png` | 1536 × 1039 |  1.478 | Gameplay crop         | Horizontal/upright portal material and orientation |

The one-pixel-short 16:9 promotional images should be captured at their native 1536 × 863 size rather than resized to 1536 × 864. The three gameplay crops have intentionally different, taller aspects; do not force them into 16:9.

## Shared visual target

### Composition and camera

- Use an orthographic camera with the GDD's fixed isometric-like orientation: approximately 45° yaw, 30° downward pitch, and world forward vector `(-0.6124, -0.5, -0.6124)`.
- The fixed gameplay camera has a minimum orthographic half-height of 13, a 4-unit framing buffer, and 0.25-second center/size damping. Several references are tighter promotional or gameplay crops and cannot be matched with that minimum. Use a debug-only fixed camera override for reference captures; never change the gameplay camera constants to make a promotional composition fit.
- Preserve the absence of horizon, skybox, scenery, and camera perspective. The arena and blue-gray clear color blend into a sparse, almost infinite studio floor.
- Large negative areas are deliberate. Do not fill them with decoration, HUD, grid lines, texture noise, or environmental storytelling.
- In every capture, lock the camera center and half-height after arranging the fixture. Dynamic car-only group framing is tested separately.

### Geometry language

- Geometry is primitive and toy-like: rectangular slabs, cubes, low-segment spheres/cylinders, and simple wedges.
- The car is a three-box body with four visibly detached wheel meshes. Its effective envelope is about 0.7 wide × 0.4 high × 1.3 long. It has no windows, cabin detail, driver, suspension mesh, or texture.
- Wheels read as squat round lobes at this camera scale and use the same player color as the body.
- Edge beveling, if used, must remain subtle. The references are defined by silhouettes and lighting rather than modeled detail.

### Authoritative material palette

| Role                  | GDD value                   |
| --------------------- | --------------------------- |
| Clear/void background | `#A5B3C4`                   |
| Ground/static neutral | approximately `#B2B2B2`     |
| Green physics objects | approximately `#1ED936`     |
| Green emission        | RGB `(0.293, 0.721, 0)`     |
| Booster red           | approximately `#BF4444`     |
| Portal base           | RGB `(0.046, 0.346, 0.610)` |
| Portal emission       | RGB `(0.189, 0.548, 0.802)` |
| Ambient sky tint      | RGB `(0.514, 0.596, 0.659)` |
| Sun                   | RGB `(1.0, 0.978, 0.919)`   |

Player colors, in order, are `#FF0000`, `#FF7B00`, `#FFFF00`, `#7C00FF`, `#00FF00`, `#00FFFF`, `#0000FF`, `#FF00FF`, `#E1E1E1`, and `#000000`.

The screenshots commonly resolve the clear/ground field near a pale blue-gray around `#B8C0CD`, while shadowed neutrals fall into slate blue. That observed result is useful for checking exposure, but must be reached through the documented materials, sRGB output, and lighting rather than by replacing the authoritative clear color.

### Lighting and shadows

- Use one warm directional light, a cool gray-blue hemisphere/ambient contribution, `PCFSoftShadowMap`, and mild ambient occlusion.
- The dominant light reads from the upper-left of the frame. Contact and cast shadows travel toward the lower-right, making wheels, airborne cars, portal height, and platform elevation legible.
- Shadows are blue/slate rather than neutral black, with soft edges and strong enough value contrast to ground objects. Contact AO should be visible under wheels, cubes, and slabs without forming black halos.
- Preserve long shadows on tall/elevated objects. Disable fog and dramatic bloom. Vignetting, when enabled, should be mild.
- Use the medium shadow profile (2048²) for reference baselines unless a separate high-quality baseline is intentionally approved.

### Particles

- Exhaust is a dotted trail of partially transparent player-colored spheres/blobs, approximately alpha 0.75.
- Emit behind a moving car using the frame-rate-independent GDD mapping `60 × clamp(speed / 50, 0, 1)` particles per second at a 60 FPS visual reference.
- Particles must remain smaller than a wheel, have modest size/lifetime variation, and never become a continuous ribbon. Their spacing should widen behind a fast car.
- Pause emission outside `Playing`. Capture fixtures must use a seeded particle RNG and a fixed pool state.
- A booster activation emits exactly five pad-red particles. Cube impacts do not create an extra canned explosion. Portal flash is optional and should be disabled for a strict match to `1000006006.png`.

## Reproducible browser-capture contract

Every fixture described below should be available through a development-only capture selector such as `visualFixture=<id>` and must never ship as an alternate gameplay mode.

For every baseline:

1. Set the browser viewport and canvas CSS size to the PNG's native dimensions.
2. Use DPR 1, render scale 1.0, sRGB display output, medium soft shadows, AO on, mild vignette on, fog off, and bloom off. Record the exact Three.js/browser versions with the baseline.
3. Initialize the world at the normal fixed 0.02-second step. Use the numeric seed listed by the fixture for authored randomness and particle variation.
4. Precompile/warm the renderer, run the stated setup, pause at the fixture's event or restored pose, then render two additional frames so matrices, transparent sorting, shadow maps, and post-processing are current.
5. Hide all gameplay markers and DOM UI for reference matching. Marker readability is covered by `VIS-007`, not these source frames.
6. Lock the debug camera center/orientation/half-height. Store these values with the approved baseline rather than relying on the live group camera.
7. For chaotic cube poses, store and restore a serialized visual pose after first generating it through normal physics. Retain a separate live-physics capture test so a frozen regression fixture cannot conceal broken interaction.
8. Save the final PNG without browser chrome or subsequent image resampling.

Suggested orthographic half-heights below are starting bands inferred from frame occupancy, not recovered source values. Tune once against the source, then commit the exact camera center and half-height in the fixture data.

## `1000006011.png` — ten-player ring

### Composition

- A loose oval/ring of ten cars surrounds a large central caption area. The car field occupies roughly x 20–80% and y 24–82% of the frame.
- Clockwise from the upper-left, the visible color sequence is cyan, blue, magenta, light gray, black, red, orange, yellow, purple, and green.
- The central area is the primary marketing-caption region; cars are the secondary ring and their colored trails point back toward the center.
- The logo occupies the upper-left corner. For the browser regression image, preserve that negative-space allowance but omit the logo and central caption. A layout mask may mark those regions without entering the rendered baseline.
- No arena props, boundaries, horizon, or HUD are visible.

### Geometry

- All ten cars use the same primitive car silhouette and differ only by color, transform, and trail.
- The detached wheels remain readable even for the black and dark-blue cars. Upper body blocks make headings legible.
- Car headings vary around the ring. The composition reads as cars having driven outward from a common center, rather than ten identical cars parked in one orientation.

### Palette

- All ten authoritative player colors must appear once.
- The saturated cars are isolated against the pale blue-gray field. The light-gray car is separated mainly by its darker shadow and silhouette; the black and blue cars need clean lit edges.
- The omitted marketing layer used white block lettering, dark blue-gray extrusion/shadow, teal title, and orange `ALPHA`. Those colors are reference evidence only and must not become gameplay UI by accident.

### Lighting and shadow

- Each car has a compact soft contact/cast shadow displaced lower-right.
- Shadow direction and softness are consistent across the ring. No car appears lit by a local player-colored light.
- Ambient fill prevents the black car from becoming a featureless cutout while retaining it as the darkest player.

### Particles

- Every car has a short trail in its own player color.
- Trails sit on the inward side of each car, supporting outward travel. They range from a few tiny dots to several larger, softer blobs without becoming ribbons.
- Particle density must remain low enough that colors do not merge behind the central caption region.

### Camera

- Orthographic, fixed 45°/30° orientation.
- A capture-only half-height around 5–6 is a useful initial range; center on the ten-car ring. This is much tighter than the runtime minimum and must stay fixture-only.
- Keep the floor/void seamless. Frame the ring as a horizontally broad ellipse caused by the view of the XZ plane.

### Reproducible scenario

- Fixture ID/seed: `ref-6011-ten-player`, seed `6011`.
- Create ten cars with the source player palette. Start from the exact ten-player source ring (`radius = 5`, 36° steps, +1° offset), all facing center.
- To create the reference hierarchy, either restore an approved pose or run a short deterministic outward-input script so every car finishes just outside the original ring, heading radially outward. Prewarm each exhaust trail during that movement, then freeze the pose.
- Arrange the approved camera so the outermost cars remain inside a 10% horizontal and 18% vertical safe margin and the central 35% × 28% rectangle remains visually open.
- Acceptance focus: ten unique cars, readable wheels/headings, matching color order around a ring, colored inward trails, consistent shadows, and empty central/upper-left promotional safe areas. Exact text and logo are explicitly excluded.

## `1000006010.png` — wacky-physics cube impact

### Composition

- The disrupted green cube stack dominates the left 45% of the frame. It forms a tall triangular pile with a partially standing back/top region and scattered cubes across the lower-left.
- A broad caption region occupies the upper-right. Omit its text but retain enough open blue-gray space for the original hierarchy.
- A red exhaust path crosses the middle/lower-right toward the impacted wall. The red car is largely obscured by the green pile, so the particle line carries the motion.
- The logo region remains open in the upper-left but is excluded from the browser render.

### Geometry

- The source object is the 96-body formation: 6 cubes wide × 4 high × 4 deep, each cube 1 × 1 × 1.
- Even after impact, every piece remains a complete cube. There is no fracture mesh, debris shard, scale change, or canned explosion.
- The reference moment is neither an intact wall nor a fully settled flat pile: multiple cubes are airborne/tilted, a tall back section still reads as the original mass, and foreground cubes have separated.
- The car should be allowed to disappear partly behind or among the cubes; do not force it on top merely for visibility.

### Palette

- Cubes are extremely bright neon/emissive green but still show light/shadow differences on their faces.
- Red exhaust provides the only strong complementary accent outside the omitted white caption.
- The pale blue-gray background remains visible through gaps, and cube shadows are dark slate blue.

### Lighting and shadow

- Directional face shading is essential to keep dozens of same-colored cubes individually readable.
- Cubes cast overlapping lower-right shadows, forming a dark base under the pile. AO should clarify contacts but not muddy the neon mass.
- The uppermost cubes remain luminous rather than clipping to featureless white/green.

### Particles

- The long dotted red path is exhaust, not cube-impact debris.
- Use a range of small blob sizes and alpha near 0.75. The trail should be sparse and legible across the empty right half.
- Do not add green dust, sparks, screen shake, or explosion sprites.

### Camera

- Orthographic, fixed source orientation, looking slightly down onto the face/top of the wall.
- Start with a fixture-only half-height around 6–7.5 and bias the camera center right of the stack so the pile occupies the left half and the trail has room to traverse the right.
- Keep the complete pile and its lower-right shadow inside frame; clipping a few far trail particles at the right edge is acceptable.

### Reproducible scenario

- Fixture ID/seed: `ref-6010-cube-impact`, seed `6010`.
- Build the exact source stack at its authored transform: x centers 7.81–12.81, y centers 0.5–3.5, z centers -34.83–-31.83.
- Launch the red P1 car perpendicular to the six-wide face at a calibrated full-throttle collision speed. Capture the first frame after at least 20 cubes have moved more than 0.25 units from their spawn poses while a recognizable standing rear/top portion remains.
- Generate the approved chaotic pose through Rapier once, serialize all cube/car transforms and particle state for pixel regression, and keep the event-driven live capture as a physics acceptance companion.
- Prewarm a red trail on the approach side. Freeze simulation without clearing particles.
- Acceptance focus: one mass before/behind the contact, independent cubes after contact, partial car occlusion, a red dotted motion path into the pile, readable face shading, and an open upper-right caption-safe region.

## `1000006009.png` — exciting-map launch

### Composition

- A long elevated strip/ramp crosses from the lower-left toward the middle-right. Its top has a vivid green lane, neutral white/gray sides, and a red directional arrow/chevron near the right end.
- The red car is airborne beyond the open right edge, around x 72–78% and y 39–49%.
- The car's shadow is far below it near the lower-right, producing the strongest height cue in the set.
- A red dotted trail runs along the green strip and continues toward the launched car.
- The omitted caption covered much of the lower center/right; retain the strong platform/car silhouette even when that overlay is absent.

### Geometry

- The platform/ramp is a low-detail extruded slab with a thin top lane and a deep neutral side. The far right edge is open; no guardrail or invisible decorative boundary is visible.
- The pad uses a low rectangular surface and large red chevron/arrow motif that is readable before contact.
- The car retains the same small three-box/four-wheel silhouette and is visibly separated from both surface and shadow.
- This promotional map geometry is visual evidence for launch language, not authority to add an unshipped map to Profile A. Reproduce it with the existing Sandbox ramp/ramp booster or an isolated debug fixture.

### Palette

- Green lane: brighter than the source green albedo after emission and direct light.
- Booster: muted warm red around the GDD's `#BF4444`, clearly distinct from the P1 red car.
- Sides: very light neutral on the lit face, falling to slate blue in shadow.
- Background/ground: low-contrast blue-gray; the airborne red car remains the focal accent.

### Lighting and shadow

- The slab casts a very long, soft blue shadow down and right, explaining its elevation.
- The car shadow is detached by a large screen-space distance and remains shaped enough to associate with the car.
- The lit top/side edge is bright, while the underside stays cool and dark. Do not use a black underside.

### Particles

- Red exhaust forms a dotted lead-in across the green lane. Particles should not obscure the red pad arrow.
- If the booster fires during the setup, its five activation particles must remain distinguishable from the longer exhaust trail.
- No smoke plume, flame, or speed-line overlay is present.

### Camera

- Orthographic source orientation with a wider fixture framing than the close gameplay crops.
- Begin near half-height 11–13, then frame the platform as a long lower-left-to-right diagonal with the airborne car and detached shadow both visible.
- Pan slightly toward the structure rather than centering the car; empty upper space is part of the promotional composition.

### Reproducible scenario

- Fixture ID/seed: `ref-6009-ramp-launch`, seed `6009`.
- Use the Sandbox ramp booster at approximately `(-12.49, 4.19, -8.83)` with its source delta velocity `(-1, +1, +5)`, or a geometry-isolated duplicate inside the non-shipping capture harness.
- Drive the red P1 car through the red chevrons and capture near the jump apex, when vertical velocity crosses from positive to non-positive. Require a clearly detached projected shadow and an open landing edge.
- Prewarm exhaust during the approach and retain the exact five booster particles if they are still alive at the apex.
- Acceptance focus: green runway, readable red direction motif, red trail, airborne car, detached lower-right shadow, open-edge risk, and broad negative space. Do not reproduce the source logo or `EXCITING MAPS` lettering.

## `1000006008.png` — close car, green wall, and exhaust

### Composition

- A large bright green cuboid mass fills the left half and is cropped by the top edge. The red car sits just right of it near the frame center, facing left toward the mass.
- A dotted red trail begins at the car's rear and continues to the right edge. Small near-emitter dots transition to more widely spaced, varied blobs farther back.
- The green object's shadow spreads across most of the lower-left/lower-middle. The car and its compact shadow sit against a relatively clean ground patch.
- There is no logo, caption, gameplay marker, or HUD.

### Geometry

- Treat the green mass as the pristine 6 × 4 × 4 cube formation with zero/small gaps so it reads as one block at this distance. Its top and two side planes must remain apparent even when seams are visually subdued by emission.
- The car is shown at the best close silhouette scale in the set: long main block, shorter raised block, narrow lower body, and four separate round wheels.
- The car is about one wheel-to-one-car-length away from contact. This is a pre-impact composition, not a collision pose.

### Palette

- Observed output ranges from a yellow-green lit top to a slightly darker saturated green front/side; representative sampled screenshot pixels are near `#73FF6B` on a lit top and `#60EC45` on a front face.
- The ground/void appears around pale `#B8C0CD`; the large cast shadow reaches cool slate values near `#4B6387`.
- The P1 car ranges from bright red on lit faces to deep maroon on occluded faces. Preserve face contrast instead of using an unlit flat red.

### Lighting and shadow

- This is the primary reference for shadow direction and length. The green mass casts a broad lower-right shadow whose footprint extends well beyond its base.
- Wheel contact shadows and AO ground the car. Each wheel remains distinct from the body.
- Softness increases away from the caster, while the contact region remains firmer. The shadow must not turn neutral black.

### Particles

- This is the primary exhaust-scale reference.
- Use roughly 10–15 visible red blobs from the emitter to the right crop, with a sparse dotted rhythm. Near-car particles are tiny; older particles can vary but must stay no larger than a wheel.
- Keep alpha near 0.75 so the ground and small particle shadows remain visible. Particles cast small, soft shadows in the source appearance; if particle shadow casting is too expensive, visually compare both cost and fidelity before omitting it.

### Camera

- Orthographic 45°/30° with a close fixture-only half-height around 5.5–6.5.
- Aim between the green mass and car, placing the wall against the left/top crop and retaining the full trail direction to the right.
- The long wall shadow must remain inside the bottom crop; do not center exclusively on the car.

### Reproducible scenario

- Fixture ID/seed: `ref-6008-close-approach`, seed `6008`.
- Reset the exact 96-cube stack so all cubes are sleeping in formation. Position the red P1 car on the face normal, heading toward the stack, with a gap of approximately 0.5–1.0 car lengths.
- Run a deterministic straight approach long enough to fill the exhaust pool, then restore/freeze the car at the approved pre-impact pose without clearing its particles.
- Lock the close camera and render at 1536 × 1023. Exclude all DOM and promotional layers.
- Acceptance focus: block-like intact green read, recognizable car proportions, visible wheel separation, varied dotted red exhaust, pale field, and long cool lower-right shadow.

## `1000006007.png` — elevated shuttle platform

### Composition

- A tall neutral column dominates the left half and continues out of the bottom crop. Its top plane enters from the upper-left.
- A square moving platform projects from the column toward the right at the same top elevation. The red car sits on the platform near its inner/top edge.
- Most of the upper-right is empty pale blue-gray, emphasizing height and exposure.
- The platform's thin slab edge is visible; the deep dark area below belongs to the column/elevation, not a thick platform body.
- No caption, logo, particles of consequence, marker, or HUD is present.

### Geometry

- Use the source horizontal shuttle: a 4 × 0.2 × 4 slab moving between `(-28, 7.9, -32)` and `(-22, 7.9, -32)`.
- At endpoint A, the slab touches the side of the 4 × 8 × 4 column centered near `(-32, 4, -32)`, matching the adjacent platform/column relationship in the image.
- The column and platform use plain neutral geometry. A narrow value seam should separate them even when their top surfaces are nearly coplanar.
- The car remains physically on the slab; do not parent it visually to the platform.

### Palette

- Nearly the entire scene is a restrained range of cool neutral blue-grays. The P1 car is the single saturated red focal point.
- Top planes are pale and low-contrast against the background. Vertical faces and the gap beneath the platform fall to medium/dark slate blue.
- Do not introduce green portal/booster cues into this frame.

### Lighting and shadow

- Car contact shadow falls compactly lower-right on the platform.
- The platform lip and column side create the main depth separation. Mild AO at the platform/column seam helps without becoming a black line.
- The background is slightly lighter/cooler than the platform top in the source crop; retain a subtle silhouette edge.

### Particles

- Only a few faint red exhaust specks are visible, if any. A strict fixture may use a settled stationary car and no live trail.
- Do not add platform motion particles, dust, or wind effects.

### Camera

- Orthographic source orientation, close cropped. A half-height near 4–5 is a strong initial estimate for a 4-unit isometric platform spanning roughly 40% of the 1536-pixel width.
- Target the join between the column and platform rather than the car alone. Allow the column to crop at left and bottom.
- Lock the camera during the endpoint wait so group tracking cannot pull the platform out of the intended composition.

### Reproducible scenario

- Fixture ID/seed: `ref-6007-platform`, seed `6007`.
- Advance the horizontal shuttle to endpoint A `(-28, 7.9, -32)` and enter its 2-second wait.
- Place or drive the red P1 car onto the platform, let suspension/contact settle for at least 0.5 seconds, then capture during the wait with negligible chassis velocity.
- Center the fixture near the column/platform join and tune the committed half-height within the 4–5 band.
- Acceptance focus: exact 4-unit platform relationship to the 4 × 8 × 4 column, thin slab edge, stable car contact, red-on-neutral hierarchy, and large empty upper-right region.

## `1000006006.png` — paired horizontal and upright portals

### Composition

- A shallow horizontal cyan portal occupies the upper-left. It reads as a translucent square volume floating above or sitting on a dark base, with a separate long shadow below-right.
- An upright cyan portal occupies the right-middle. Its broad translucent face, brighter top/side strips, and dark lower-right shadow make its orientation unambiguous.
- A small red car sits near the lower center-right between/below the portals, providing scale and color contrast.
- The two portals form a strong upper-left-to-lower-right diagonal with a large empty center.
- No caption, logo, HUD, marker, animated texture, or obvious portal-flash particle is visible.

### Geometry

- Use one linked pair with one endpoint horizontal like a shallow glass pad and one endpoint vertical like an upright glass panel.
- Portal surfaces are rectangular volumes, not rings, swirling discs, or detailed sci-fi frames.
- A small amount of thickness is visible on the horizontal slab and along the vertical panel's top/side. Underlying neutral surfaces remain visible through the cyan.
- The red car stays much smaller than either portal face and does not intersect a trigger at the captured moment.

### Palette

- Use the GDD portal base `(0.046, 0.346, 0.610, 0.90)` and emission `(0.189, 0.548, 0.802)`.
- Observed lit/transmitted screenshot pixels reach pale cyan near `#95D9FE`; denser front/side areas appear near `#45B2F5`–`#4AB3F5`. Reach those variations through transparency, emission, overlap, and lighting rather than multiple opaque blue materials.
- Portal shadows are dark slate blue. The P1 red car is the sole warm accent.

### Lighting and shadow

- Both portal orientations cast long lower-right shadows. The horizontal portal's displaced shadow is a crucial height cue.
- Transparent faces remain luminous without washing out their edges. The vertical portal's rear/base geometry and shadow must remain visible through/around it.
- Disable portal shadow casting only if the material cannot produce a stable result; if disabled, supply a separate non-visible shadow caster matching the portal volume.

### Particles

- No sustained portal particles are required. Disable the optional blue teleport flash for the strict baseline.
- The red car appears stationary or slow enough that no meaningful exhaust trail is visible.

### Camera

- Orthographic source orientation with a close-to-medium fixture half-height around 5.5–7.
- Center between the two portal endpoints, biased downward enough to include the car and both long shadows.
- Validate transparent sorting at this exact view and at the mirrored approach view. Use `depthWrite = false` and explicit render order as required by the GDD.

### Reproducible scenario

- Fixture ID/seed: `ref-6006-portals`, seed `6006`.
- Use the source pair with approximate endpoints `(32.8, 2, -33.6)` and `(22.8, 5, -33.6)`. Orient one sensor/visual horizontally and its mate upright with exit-forward pointing into safe space.
- Place the red P1 car between the endpoints, approximately one car length clear of the upright trigger, and let it settle. The scenario tests material/orientation, not the teleport event itself.
- Freeze animation, disable optional flash, and capture at 1536 × 1039 after two transparency-sorting/shadow refresh frames.
- Acceptance focus: clearly different portal orientations, cyan translucency with readable thickness, correct overlap/sorting, long cool shadows, small red scale reference, and open diagonal negative space.

## Review checklist

Use this checklist alongside GDD tests `VIS-001` through `VIS-009`.

- All captures use the exact native reference aspect and contain no browser chrome.
- The documented GDD palette is supplied as material input and evaluated after sRGB output.
- Camera projection is orthographic; no perspective convergence or horizon is visible.
- Car body/wheel proportions are consistent in all six frames.
- The directional-light shadow vector is consistently lower-right, soft, and cool.
- AO grounds contacts without black outlines; fog and dramatic bloom are absent.
- Exhaust remains dotted, seeded, partially transparent, player-colored, and smaller than wheels.
- The intact 96-cube stack reads as one mass; the impacted stack reads as independent whole cubes.
- Horizontal and vertical portals remain translucent, emissive, thick enough to read, and correctly sorted.
- The platform fixture uses the documented source endpoints and column dimensions.
- The launch fixture shows a readable red direction motif, an airborne car, and a detached shadow.
- The ten-player fixture includes every source color exactly once and remains readable in grayscale with Profile B markers tested separately.
- Protected promotional text/logo assets are absent from the browser-render baseline.
- Each committed baseline records fixture ID, seed, simulation step or restored-pose hash, viewport, DPR, render scale, camera transform, post-processing settings, browser, GPU, and dependency versions.
