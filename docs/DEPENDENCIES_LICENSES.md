# Dependencies, assets and licenses

Audit date: 2026-07-28 (America/Vancouver)  
Package: `tiny-traction-alpha@0.1.0`  
Inventory status: `PARTIAL — ENGINEERING INVENTORY, NOT LEGAL SIGN-OFF`

This document records package metadata and repository provenance. It is not
legal advice, does not determine trademark rights, and does not certify that
the project is ready for public or commercial distribution.

## Manifest and lockfile

- `package.json` uses exact versions for every direct dependency.
- `package-lock.json` is npm lockfile version 3 and resolves 176 non-root
  package entries.
- Every resolved lockfile entry currently has a package-license identifier.
  The identifiers present are `0BSD`, `Apache-2.0`, `BSD-2-Clause`,
  `BSD-3-Clause`, `BlueOak-1.0.0`, `ISC`, `MIT` and `MPL-2.0`.
- `npm ls --all --depth=2` completed successfully in this workspace. Reported
  unmet entries are optional platform/tool integrations, not missing required
  production dependencies.
- `npm ci` has not been repeated after the final documentation/test edits.
- The final Git revision and Sites version are assigned during deployment; the
  committed lockfile remains the dependency-resolution authority.

Package metadata is not a substitute for reviewing the license text, notices,
patents, trademarks and distribution obligations of the exact releases.

## Direct runtime dependencies

| Package              | Exact version | Role                                                      | Declared license | Installed text inspected                  | Production handling                                   |
| -------------------- | ------------: | --------------------------------------------------------- | ---------------- | ----------------------------------------- | ----------------------------------------------------- |
| `three`              |       0.185.1 | Renderer, scene graph and official post-processing addons | MIT              | `node_modules/three/LICENSE`              | Bundled JS, including imported `three/addons` modules |
| `@dimforge/rapier3d` |        0.19.3 | Rapier 3D JavaScript/WASM physics                         | Apache-2.0       | `node_modules/@dimforge/rapier3d/LICENSE` | Hashed JS plus external hashed WASM                   |

`@dimforge/rapier3d-compat@0.12.0` appears only as a development transitive of
`@types/three`; application source imports the normal
`@dimforge/rapier3d@0.19.3` package. It is not the runtime physics selection.

## Direct development dependencies

| Package             | Exact version | Role                                | Declared license |
| ------------------- | ------------: | ----------------------------------- | ---------------- |
| `@eslint/js`        |        10.0.1 | ESLint recommended rules            | MIT              |
| `@playwright/test`  |        1.62.0 | Chromium/Firefox/WebKit automation  | Apache-2.0       |
| `@types/node`       |        26.1.2 | Node.js typings                     | MIT              |
| `@types/three`      |       0.185.1 | Three.js typings                    | MIT              |
| `eslint`            |        10.8.0 | Static analysis                     | MIT              |
| `globals`           |        17.8.0 | ESLint globals data                 | MIT              |
| `prettier`          |         3.9.6 | Formatting                          | MIT              |
| `typescript`        |         6.0.3 | Strict type checking                | Apache-2.0       |
| `typescript-eslint` |        8.65.0 | TypeScript ESLint integration       | MIT              |
| `vite`              |         8.1.5 | Development server and static build | MIT              |
| `vitest`            |        4.1.10 | Unit tests                          | MIT              |

Installed direct-package texts were located for Three.js, Rapier, Vite,
TypeScript, Vitest, Playwright (including `NOTICE`), ESLint and Prettier.
Verbatim copies of the two shipped runtime license texts and a runtime package
notice live under `public/` and are included in the production build. This does
not complete a line-by-line legal review of the runtime, development, or
transitive dependency inventory.

## Transitive inventory

The lockfile currently contains 176 resolved package entries. All have a
declared license field, but only package metadata and selected direct texts were
audited in this pass. Notable non-MIT/Apache identifiers include:

- `MPL-2.0` for Lightning CSS packages used by the development/build toolchain;
- `BlueOak-1.0.0` for `minimatch`;
- BSD, ISC and 0BSD packages in the development tree.

Before distribution, generate and retain a complete direct/transitive notice
artifact from the exact lockfile, review packages actually used by the build,
and decide whether build-tool notices must accompany the intended form of
distribution. No conclusion is made here about that legal question.

## Production bundle inspection

The currently present `dist/` contains:

- `index.html` and `embed-example.html`;
- `_headers`;
- `THIRD_PARTY_NOTICES.txt` and the two direct runtime license texts;
- one hashed CSS bundle;
- a hashed application/Three.js bundle;
- a hashed Rapier JavaScript bundle;
- an external hashed `rapier_wasm3d_bg-*.wasm`;
- no source maps.

No image, texture, model, font or audio file appears in the inspected output.
This is an engineering inspection of the final generated build, not an
independent immutable-release or legal audit.

The production bundle imports Three.js addon code rather than copying examples
into project source. Those modules are covered by the shipped Three.js MIT
license text. Formal review of the final notice set remains open.

## Project-authored asset inventory

| Asset group                                 | Implementation source                                                  | Provenance                             | Current release state                             |
| ------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------- |
| Car, arena, props and interactable geometry | TypeScript-created Three.js primitives and project-authored wedge data | Original reconstruction work           | Implemented; human clean-room review pending      |
| Materials and palette                       | Project-authored constants plus Three.js materials                     | Original configuration / Three.js API  | Implemented                                       |
| Vignette shader                             | `src/render/VignetteShader.ts`                                         | Project-authored shader                | Implemented                                       |
| Particles                                   | `src/render/ParticlePool.ts`, one procedural instanced pool            | Original procedural VFX                | Implemented                                       |
| Audio                                       | `src/audio/AudioService.ts`, Web Audio oscillators/gain/panning        | Original procedural audio; no samples  | Implemented; listening review pending             |
| UI text and styling                         | `index.html`, `src/styles.css`, marker CSS                             | Original browser UI                    | Implemented                                       |
| Title/identity                              | “Tiny Traction” text treatment                                         | Deliberately distinct project identity | Implemented; trademark clearance not performed    |
| Fonts                                       | CSS system stack; no font file bundled                                 | User-agent/OS fonts                    | No redistributable font asset                     |
| Reference screenshots                       | Read-only reconstruction evidence under the supplied package           | User-supplied reference material       | Excluded from `dist/`                             |
| Original executable/code/assets             | Not used                                                               | Prohibited clean-room input            | Absent from project source and `dist/` inspection |

The supplied six screenshots and GDD remain reference evidence. They are not
declared redistributable game assets and are not copied into the application.

## Clean-room boundary

The application uses a distinct title and project-authored procedural
geometry, UI, shader, VFX and audio. No original executable, recovered source,
logo, traced branding, model, texture, font, particle file, sound sample or
promotional artwork was used as a shipping asset.

Visual similarity to public screenshots is a behavioral/compositional target,
not a claim of ownership or permission. A clean-room engineering process does
not itself grant trademark, copyright or other distribution rights.

## Release checklist

| Check                                        | Status    | Evidence / next action                                                   |
| -------------------------------------------- | --------- | ------------------------------------------------------------------------ |
| Exact direct pins                            | `PASS`    | `package.json`                                                           |
| npm lockfile v3 present                      | `PASS`    | `package-lock.json`                                                      |
| Installed tree matches required dependencies | `PASS`    | `npm ls --all --depth=2`                                                 |
| Clean `npm ci` from release revision         | `NOT RUN` | Run from an immutable revision                                           |
| Direct runtime license texts                 | `PASS`    | Verbatim Three.js and Rapier texts are shipped under `public/licenses/`  |
| Complete transitive review                   | `NOT RUN` | 176 entries require notice/obligation review                             |
| Production file/checksum inventory           | `PARTIAL` | Final generated file list inspected; independent immutable audit open    |
| Runtime notices included with distribution   | `PASS`    | `public/THIRD_PARTY_NOTICES.txt` and both runtime license texts          |
| Complete notice/legal review                 | `NOT RUN` | Transitive obligations and intended distribution still require approval  |
| No copied source assets                      | `PARTIAL` | Source/dist inspection supports this; independent release review pending |
| Trademark/title clearance                    | `NOT RUN` | Separate legal review                                                    |
| Legal release approval                       | `NOT RUN` | This document does not provide it                                        |

Release sign-off remains open until the exact deployed artifact, complete
notice set and intended distribution terms have been reviewed by the
appropriate project/legal owner.
