# Complex Function Plotting Tool

A research-grade browser tool for visualizing a single complex map **w = f(z)** — 2D domain
coloring and enhanced phase portraits, a 3D analytic-landscape surface, a Riemann sphere, a true
multi-sheeted **Riemann surface** (for invertible primitives and single-radical algebraic maps),
quantitative instruments, and honest labeling. It rides the shared `@cas/*` packages rather than
reimplementing them:

- **`@cas/expr`** — custom-function input: one expression string → GLSL shader body **and** a JS
  evaluator, plus symbolic `f'(z)`, `toLatex`, and positioned parse errors.
- **`@cas/gpu`** — the WebGL2 substrate: the complex GLSL stdlib (single + df64), shader
  compile/link, colormap LUTs.
- **`@cas/interchange`** — share-links (`#vs=`) and suite hand-off (import a Schwarz reflection from
  Quadrature Domains, export a view to Complex Dynamics).

The app rides those **three** shared packages. The zero/pole finder's root-finding (Newton + the
argument principle) is small and app-local — built on `@cas/expr`'s `Complex` and symbolic `f'`, not on
`@cas/core` (a future extraction target if a second consumer needs it, per ADR-0007).

Design record: [`docs/design/complex-function-plotter-plan.md`](../../docs/design/complex-function-plotter-plan.md)
(the phase-gated build plan) and
[`…-research-notes.md`](../../docs/design/complex-function-plotter-research-notes.md) (the
tool/literature survey).

## Running

From the repo root:

```bash
pnpm --filter complex-function-plotter dev      # Vite dev server (http://localhost:5176)
pnpm --filter complex-function-plotter build    # static build into dist/
pnpm --filter complex-function-plotter test     # Vitest suite
```

Single-page Vite app, `base: "./"` so it serves from any sub-path (it will publish under
`complex-function-plotter/` beneath the launcher).

## Status — complete (Phases 0–6)

Type `f(z)` (or pick a preset) and explore its domain-coloring phase portrait, with:

- **2D / 3D / sphere / linked / Riemann (5A–5D + ADR-0027)** — a five-way **View** toggle. **3D** lifts the flat portrait into an
  **analytic landscape**: the same map drawn as a height surface (height = log |f| / linear |f| / bounded
  stereographic, with an exaggeration slider), **coloured by the very same `colorAt`** so the surface reads
  like the portrait wrapped over relief (its enhancements — rings, the conformal grid — wrap too). **Left-drag
  pans** (recenters the domain), **right-drag orbits**, and **scroll zooms the domain** — the perspective
  framing tracks the view span so the surface fills the window at any zoom, and the mesh resolution adapts;
  **Top-down** snaps to the orthographic overhead view, which reproduces the 2D portrait pixel-for-pixel (the
  phase gate). Shading uses the **analytic surface normal from `f'/f`** for a
  holomorphic map (a smooth per-pixel normal; a geometric normal for Γ/ζ/anti-holomorphic), with an optional
  **specular** highlight and an adjustable **surface opacity** (a translucent landscape you can see through). **Sphere** draws the extended plane ℂ∪{∞} as a literal **Riemann sphere** (F7): a
  per-fragment ray-cast of an analytic unit sphere, stereographically projected (south pole = 0, equator =
  |z| = 1, **north pole = ∞**) and coloured by the same `colorAt`, so a pole is a bright patch you can rotate
  to the top; drag is a quaternion **arcball**, scroll dollies. **Linked** (5D / I7) shows the flat portrait
  and the landscape **side by side** in one canvas (split viewports), both reading the **same `view`** — so
  navigating the flat pane (drag-pan / scroll-zoom / keyboard) moves the surface's domain in lock-step, while
  a right-drag on the surface pane orbits it alone (a left-drag there pans both, like the flat pane); the
  shared-view coupling is the sync (no state to reconcile). **Riemann** (ADR-0027) draws the true
  multi-sheeted **Riemann surface** when the active map is a recognized invertible primitive — √, ⁿ√,
  `z^(p/q)`, log, arcsin/arccos/arctan, plus affine wraps `A·P(αz+β)+B` — by the **parametrize-by-w**
  method: it samples the value plane (the uniformizer `t`), positions each vertex at `(Re g(t), Im g(t))`
  from the single-valued inverse `z = g(t)`, and lifts it by the **charisma** height (Re w → interlocking
  algebraic sheets, Im w → the log helicoid), coloured by the same `colorAt`. The sheets **glue across the
  branch cut with no false cliff** (and none of the never-certified continuation of RISKS §3); a
  sheet-count control truncates the infinite (log / inverse-trig) families, and an honest badge names the
  form, its monodromy, and where the principal cut lies. It also handles **single-radical algebraic** maps
  `R(z)^(p/q)` with `R` rational (ADR-0028) — `√(z²−1)`, `√(z³−z)`, `(z²−1)^(1/3)`, `√((z−1)/(z+1))` — that
  the parametric path declines: a CPU-built **proximity-glued mesh** (Nieser–Poelke–Polthier / Kranich)
  over the z-view stitches the `q` sheets and drops ramification cells as small **holes** at the branch
  points (never a wall), badged if the triangle budget is hit. The tab is offered only for a recognized
  surface; otherwise the app stays on the principal-branch views. Values are `≈`; the glued topology is
  exact. **Hovering the surface** ray-casts its sheets (M3.1, ADR-0029) and reads the point the eye actually
  touches — the base point `z`, the value `w` on that sheet, `|w|`, `arg w`, and a **local sheet ordinal**
  (`k / N` — which of the `N` sheets over this `z`; near a branch point `N` honestly drops as they merge),
  all `≈`. A **Base-plane pane** toggle (M3.2) splits the view — the flat base plane beside the surface,
  **hover-linked**: touch a sheet and a crosshair marks its base point on the flat pane (and vice versa). Built on an app-local 3D kit (`render3d/`: mat4 · orbit camera · grid mesh · height law · surface
  shader · sphere arcball · **Riemann surface** (parametric + baked curve)) plus the recognizers
  (`riemann/inverse.ts` · `riemann/algebraicCurve.ts`), the NPP mesh (`riemann/curveMesh.ts`), and the
  hover-pick (`riemann/pickMesh.ts`).

- **Input** — name **autocomplete** (builtins, constants, `z`/`c`, and the map's parameters), two
  function slots **`f` / `g`** with a toggle (the active one is plotted), and **copy-as-LaTeX**. The
  language adds imaginary literals `2i` and the constants `tau` / `phi` / `γ` (B5, in `@cas/expr`), and
  the special functions **Γ** (`gamma`) and **ζ** (`zeta`) (Phase 4). Because the renderer evaluates in
  GLSL `float`, a map that uses one carries an **honest precision badge** (`ui/precision.ts`): ζ warns
  (Borwein in float32, ~1e-6, degrading up the critical strip), Γ gets a milder single-precision note —
  so a domain-coloured ζ/Γ reads as an estimate (`≈`), not certified structure.
- **Parameters** — any free variable that isn't `z`/`c` (e.g. `a*z*(1-z) + b`) becomes a live **named
  parameter** (via `@cas/expr`'s `freeParameters`, [ADR-0011](../../docs/DECISIONS.md)): each gets a
  draggable **ℂ-pad**, re/im fields, and a real slider. Values bind to a `uParam_<name>` uniform, so
  dragging re-renders without recompiling, the CPU instruments track the same values, and the parameter
  set round-trips in the share-link.
- **Animation** — the reserved parameter **`t`** (e.g. `a*z*exp(i*t)`) gets a **transport** instead of a
  pad: play / pause, a scrubber over a segment `[t0, t1]`, a speed, and a loop toggle. A
  `requestAnimationFrame` loop advances `t` as a re-uniform, so a formula that mentions `t` animates as a
  live family; the transport config travels in the share-link (which opens paused).
- **Parameter sweep** — pick a parameter, a real range, and a step count, and **Show sweep** renders a
  **small-multiples montage** — a grid of thumbnails of the map across that range (reusing the live GPU
  program per cell). Click any cell to jump the plot to that value.

Plus the Phase-2 research tool:

- **Coloring** — a swappable phase colormap (perceptual **Oklch**, HSV, Twilight, a
  **colorblind-safe** map, and the two **DLMF** schemes — see below) times a modulus transfer
  (phase-only / linear / rational / log / log-log), a NaN/Inf sentinel, and a **CVD-simulation preview**
  (protan / deutan / tritan).
- **DLMF mode (D8)** — the NIST DLMF's own domain-coloring conventions
  ([`aboutcolor`](https://dlmf.nist.gov/help/vrml/aboutcolor)), so a plot reads directly against the DLMF
  Γ / ζ figures: a **continuous warped-hue** map (its piecewise hue warp anchors red/yellow/cyan/blue at
  arg 0/π/2/π/3π/2) and a **four-colour quadrant** indicator (blue/green/red/yellow for the value's
  quadrant Q1–Q4, the DLMF's alphabetical mnemonic). They're two more colormaps, so a DLMF figure is one
  of them × a modulus transfer (the DLMF's "height"); the four-colour map's indicator hues are honestly
  not CVD-safe (the CVD preview shows it).
- **Enhanced portraits** — `fwidth`-antialiased modulus rings, phase sectors, the flagship
  **conformal proportional grid**, chessboards, and a Re/Im grid, with crisp/shaded and hue rotate/
  reverse controls.
- **Instruments** — a live cursor readout (`z, f(z), |f|, arg f`) — a **value inspector** that in 3D
  ray-casts the cursor against the height field to read the point actually **on the surface** under it
  (height + self-occlusion accounted for), not its base-plane shadow, and on the **Riemann surface**
  ray-casts its stacked sheets to read the front-most one — adding a **sheet** ordinal `k / N` (M3.1);
  **zeros & poles located, counted,
  and ordered** via the argument principle (marked, honestly labeled `≈`); **critical points** where
  **f′ = 0** (H6), found by running that same finder on f′ and marked with diamonds; user-set **level sets**
  (`|f| = c`, `arg f = c`); an **∞-inspector** (5C/F8) that plots **f(1/z)** so the origin shows the map's
  behaviour at infinity, and a **derivative overlay** (H9) that plots **f′(z)** — both are AST rewrites, so
  the 2D/3D render and the instruments track the same map; and an **honest-labeling / uncertainty layer**
  that hatches pixels near poles and essential singularities where the render is unreliable.
- **Navigation & output** — pan / zoom-to-cursor / reset, axes + grid + scale bar (aspect locked
  1:1, so angles read true), phase-wheel + modulus legends, share-links (`#vs=` via `@cas/interchange`),
  and **hi-resolution PNG export** (K1/K3/K9, Phase 6): pick a long-edge (up to the GPU's max texture
  size), and any view — 2D, landscape, or sphere — re-renders at that size and downloads with the
  **share-link embedded as `tEXt` metadata**, so the figure carries the exact map / params / view that
  produced it; a **copy-image-to-clipboard** button does the same to the clipboard. HiDPI + progressive
  rendering and WebGL2 context-loss recovery throughout.
- **Suite interop** (K7/K8, Phase 6) — the cross-app hand-off over `@cas/interchange` (the `#s=` map
  Envelope, distinct from the plotter's own `#vs=` share-link). **Import** a map from another tool — a
  Quadrature-Domains uniformizing map φ, a saved View, or a bare rational/Laurent/expr map — and it becomes
  a live plot (`src/interchange/importMap.ts`, ported from Complex-Dynamics). A **numerical Schwarz σ** is
  not a closed form, so the plotter plots its **generating map φ instead, honestly labelled** (σ needs the
  QD solver). **Export** the current map + view as a hand-off link, or **→ Dynamics** to open it straight in
  Complex Dynamics (which reads the `#s=` hash on load). Everything travels in the CANONICAL convention
  (ADR-0006), and every converted coefficient string is parsed back through the same `@cas/expr` the render
  uses, so a factor error can't slip through.
- **Accessibility** (L7/L8, Phase 6) — the plot canvas is keyboard-drivable (`ui/navigation.ts`): once
  focused, **arrow keys** pan / orbit / rotate, **`+` / `-`** zoom or dolly, and **`0` / `Home`** reset —
  mode-aware, the same operations as the pointer path. **Two-finger pinch** zooms (or dollies) on touch, on
  top of the single-finger pan / orbit / arcball the pointer handlers already give. The canvas carries a
  `role` + `aria-label` describing the controls, and a UI note points colorblind users at the
  **colorblind-safe** colormap + the CVD-simulation preview (the DLMF four-colour map is honestly flagged as
  not CVD-safe).

It visually matches the canonical Wegert enhanced-portrait plate (checked by hand against the reference
during development; render-consistency goldens run in the CI browser gate — see below), recovers the known zero/pole
counts of rational maps (unit-tested via the argument principle), and round-trips a map to Complex Dynamics
and back. It is built into CI and **published** — the launcher card links to it and `deploy-pages.yml`
copies it into the combined site.

**All phases (0–6) are complete.** Phase 4 (special functions & the DLMF mode); Phase 5 (the 3D engine —
analytic **landscape** with `f'/f` shading, the **Riemann sphere**, and **linked 2D↔3D navigation**); and
Phase 6 (**hi-res PNG export + metadata + copy-image (6A)**, **suite interop (6B, → Complex Dynamics)**,
**keyboard / touch / CVD accessibility (6C)**, and the **publish gate (6D)** — the 3D-slice extraction
[ADR-0012](../../docs/DECISIONS.md) written, the launcher flipped, and the deploy line added). See
[the plan](../../docs/design/complex-function-plotter-plan.md).

## Source layout (`src/`)

| File                        | Role                                                                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `main.ts`                   | wires everything: expression box + KaTeX preview + errors, presets, colormap/modulus controls, legends, cursor probe, pan/zoom/reset, share-link, export     |
| `render/colorShader.ts`     | the layered coloring GLSL (`colorAt` = phase LUT × modulus transfer, + NaN/Inf sentinel) and the fragment-program assembler                                  |
| `render/colormaps.ts`       | phase colormaps (perceptual Oklch + HSV) baked into one RGBA8 atlas; Oklab→sRGB conversion                                                                   |
| `render/plot.ts`            | the WebGL2 plot: context + loss/restore, program rebuild on `f` change, the atlas texture, HiDPI/progressive render, pan/zoom helpers, hi-res `exportBlob` (stamps the share-link via `@cas/export`'s `injectPngText`) |
| `render/exportImage.ts`     | pure export size algebra (K1): clamp a long-edge to the GPU max, derive aspect-preserving buffer dims, sanitise a filename                                   |
| `state/viewState.ts`        | share-link encode/decode over `@cas/interchange`'s `#vs=` codec (app namespace `cfp`)                                                                        |
| `interchange/importMap.ts`  | K7: `@cas/interchange` map Envelope → `@cas/expr` source (rational / Laurent / expr; σ → its φ, labelled) — ported from CD's `importMap`                     |
| `interchange/exportView.ts` | K8: the current map + view → a `view` Envelope + `#s=` link; `cdHandoffUrl` for the "→ Dynamics" deep-link                                                   |
| `presets.ts`                | the preset / example gallery (each expression is validated in the tests)                                                                                     |
| `ui/params.ts`              | live named-parameter controls (G1): the ℂ-pad ↔ value mapping, per-parameter pad + re/im fields + real slider                                                |
| `ui/animate.ts`             | the `t` animation transport (G2): pure frame-stepping `stepT` + the play/scrub/loop/speed controls and rAF loop                                              |
| `ui/sweep.ts`               | the parameter-sweep montage (G4): pure `sweepValues` spacing + the clickable thumbnail-grid builder                                                          |
| `ui/autocomplete.ts`        | the expression-box name autocomplete (A5): pure `wordAt` / `filterCandidates` + the menu / keyboard wiring                                                   |
| `ui/precision.ts`           | the float32 honest-labeling policy (Phase 4): `precisionNote(calledFns)` → the ζ warn / Γ note the badge shows                                               |
| `ui/navigation.ts`          | pure a11y + linked-view helpers: `keyToNav` (L7 arrows / ± / reset), the `pinchFactor` touch math, and `leftHalf` / `isLeftHalf` (the I7 split)              |
| `ui/legends.ts`             | phase-wheel and modulus-scale legend painters                                                                                                                |
| `ui/axes.ts`                | the axes / adaptive-grid / scale-bar overlay                                                                                                                 |
| `ui/markers.ts`             | draws located zeros (circles), poles (×), and critical points where f′=0 (diamonds), with order labels, on the overlay                                        |
| `analysis/singularities.ts` | locate / count / order zeros & poles: grid candidates → Newton refinement → argument-principle winding                                                       |
| `render3d/mat4.ts`          | Phase-5 3D kit: typed column-major `mat4`/`vec3` (identity, multiply, lookAt, perspective, ortho, transformPoint) — ported from QD's `sphere-common`         |
| `render3d/camera.ts`        | the orbit camera (F5): azimuth / elevation / dolly → view + projection in a Z-up world; the exact top-down ortho preset (top-down = the 2D portrait)         |
| `render3d/mesh.ts`          | the domain grid mesh (F5): `buildGridMesh(n)` → UV lattice + Uint32 triangle indices the landscape vertex shader displaces by height                         |
| `render3d/height.ts`        | the F1 height compression `heightAt` (log / linear / stereographic) — the JS mirror of the GLSL `surfaceHeight`                                              |
| `render3d/surfaceShader.ts` | the surface program (F1/F2): vertex evaluates `f` + displaces by height; fragment recomputes `f` + reuses `colorAt` + geometric shading                      |
| `render3d/sphere.ts`        | the Riemann-sphere kit (F7): quaternion + arcball for the drag and the stereographic `sphereToZ` (JS mirror of the shader) — ported from CD's `sphereView`   |
| `render3d/sphereShader.ts`  | the Riemann-sphere program (F7): a fullscreen ray-cast that intersects the unit sphere, projects the hit to `z`, and reuses `colorAt` so ∞ is the north pole |

## Tests

`test/` — `smoke.test.ts` (shared-package wiring), `colormaps.test.ts` (atlas dimensions, sRGB gamut,
cyclic continuity, HSV anchors, and the **DLMF** maps — warped-hue anchors + continuity, the four-colour
quadrant indicator + its step discontinuity, stable indices), `colorShader.test.ts` (fragment-program
assembly), `render3d.test.ts` (the Phase-5 3D kit — mat4 projections, the orbit camera's **top-down =
2D-portrait** mapping, and the grid mesh), `surface3d.test.ts` (the F1 height law + the surface program
assembly — `fFn` in both stages, `colorAt` reuse, `uShaded`), `sphere.test.ts` (the **Riemann-sphere**
kit — quaternion/arcball identities, the `worldToModel` inverse-orientation invariant, the stereographic
`sphereToZ` incl. its GLSL parity, and the ray-cast fragment assembly), `viewState.test.ts`
(share-link round-trip + namespace guard, incl. parameter values), `presets.test.ts` (every preset
parses/compiles/evaluates), `params.test.ts` (the ℂ-pad ↔ value coordinate mapping), `animate.test.ts`
(the `t` frame-stepping — wrap / clamp / ended), `sweep.test.ts` (the sweep value spacing),
`autocomplete.test.ts` (the token-under-caret + prefix matching), `precision.test.ts` (the float32
badge policy — ζ warn / Γ note, strongest-first, over the `parse → calledFunctions → precisionNote`
path), `exportImage.test.ts` (the hi-res export size algebra
— clamp to the GPU max, aspect-preserving dims, filename sanitising), `interop.test.ts` (the K7/K8 suite
hand-off — MapSpec→expr conversion **re-parsed through `@cas/expr`**, the σ→φ redirect, envelope
round-trip and validation, the `→ Dynamics` deep-link), `navigation.test.ts` (the a11y key→intent map, the
pinch-zoom factor — direction, clamp, guards — and the linked-view `leftHalf` / `isLeftHalf` split), and
`singularities.test.ts` (the zero/pole finder
recovers known counts and orders). Under `pnpm test:browser` (CI's `browser` job, in a real WebGL2
context) the app's **real GLSL is compiled** — all three programs (2D · surface · sphere) across a
15-function corpus (`shaderCompile.browser.test.ts`) — and **render-consistency goldens** run
(`renderGolden.browser.test.ts`): a non-blank portrait, z² 180°-rotation symmetry, and the top-down
landscape equal to the 2D portrait (the Phase-5 gate). A full pixel-diff of the canonical Wegert / DLMF
plates against committed images is still checked by hand during development.
