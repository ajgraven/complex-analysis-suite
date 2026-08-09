# Complex Function Plotting Tool

A research-grade browser tool for visualizing a single complex map **w = f(z)** — 2D domain
coloring and enhanced phase portraits, a 3D analytic-landscape surface and Riemann sphere,
quantitative instruments, and honest labeling. It rides the shared `@cas/*` packages rather than
reimplementing them:

- **`@cas/expr`** — custom-function input: one expression string → GLSL shader body **and** a JS
  evaluator, plus symbolic `f'(z)`, `toLatex`, and positioned parse errors.
- **`@cas/gpu`** — the WebGL2 substrate: the complex GLSL stdlib (single + df64), shader
  compile/link, colormap LUTs.
- **`@cas/interchange`** — share-links (`#vs=`) and suite hand-off (import a Schwarz reflection from
  Quadrature Domains, export a view to Complex Dynamics).
- **`@cas/core`** — complex arithmetic and root-finding (added when the instruments land).

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

## Status — Phase 3 complete (parameters & families)

Type `f(z)` (or pick a preset) and explore its domain-coloring phase portrait, with:

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

- **Coloring** — a swappable phase colormap (perceptual **Oklch**, HSV, Twilight, and a
  **colorblind-safe** map) times a modulus transfer (phase-only / linear / rational / log / log-log),
  a NaN/Inf sentinel, and a **CVD-simulation preview** (protan / deutan / tritan).
- **Enhanced portraits** — `fwidth`-antialiased modulus rings, phase sectors, the flagship
  **conformal proportional grid**, chessboards, and a Re/Im grid, with crisp/shaded and hue rotate/
  reverse controls.
- **Instruments** — a live cursor readout (`z, f(z), |f|, arg f`); **zeros & poles located, counted,
  and ordered** via the argument principle (marked, honestly labeled `≈`); user-set **level sets**
  (`|f| = c`, `arg f = c`); and an **honest-labeling / uncertainty layer** that hatches pixels near
  poles and essential singularities where the render is unreliable.
- **Navigation & output** — pan / zoom-to-cursor / reset, axes + grid + scale bar (aspect locked
  1:1, so angles read true), phase-wheel + modulus legends, share-links (`#vs=` via `@cas/interchange`),
  and PNG export; HiDPI + progressive rendering and WebGL2 context-loss recovery throughout.

It reproduces the canonical Wegert enhanced-portrait plate and recovers the known zero/pole counts of
rational maps. Built into CI, **not yet published** (the launcher lists it as "Coming soon").

Phase 4 is underway (special functions & the DLMF mode): **Γ and ζ are in `@cas/expr`** and carry the
honest float32 precision badge above; next is the **DLMF colouring mode**. See
[the plan](../../docs/design/complex-function-plotter-plan.md).

## Source layout (`src/`)

| File                        | Role                                                                                                                                                  |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main.ts`                   | wires everything: expression box + KaTeX preview + errors, presets, colormap/modulus controls, legends, cursor probe, pan/zoom/reset, share-link, PNG |
| `render/colorShader.ts`     | the layered coloring GLSL (`colorAt` = phase LUT × modulus transfer, + NaN/Inf sentinel) and the fragment-program assembler                           |
| `render/colormaps.ts`       | phase colormaps (perceptual Oklch + HSV) baked into one RGBA8 atlas; Oklab→sRGB conversion                                                            |
| `render/plot.ts`            | the WebGL2 plot: context + loss/restore, program rebuild on `f` change, the atlas texture, HiDPI/progressive render, pan/zoom helpers, PNG data-URL   |
| `state/viewState.ts`        | share-link encode/decode over `@cas/interchange`'s `#vs=` codec (app namespace `cfp`)                                                                 |
| `presets.ts`                | the preset / example gallery (each expression is validated in the tests)                                                                              |
| `ui/params.ts`              | live named-parameter controls (G1): the ℂ-pad ↔ value mapping, per-parameter pad + re/im fields + real slider                                         |
| `ui/animate.ts`             | the `t` animation transport (G2): pure frame-stepping `stepT` + the play/scrub/loop/speed controls and rAF loop                                       |
| `ui/sweep.ts`               | the parameter-sweep montage (G4): pure `sweepValues` spacing + the clickable thumbnail-grid builder                                                   |
| `ui/autocomplete.ts`        | the expression-box name autocomplete (A5): pure `wordAt` / `filterCandidates` + the menu / keyboard wiring                                            |
| `ui/precision.ts`           | the float32 honest-labeling policy (Phase 4): `precisionNote(calledFns)` → the ζ warn / Γ note the badge shows                                        |
| `ui/legends.ts`             | phase-wheel and modulus-scale legend painters                                                                                                         |
| `ui/axes.ts`                | the axes / adaptive-grid / scale-bar overlay                                                                                                          |
| `ui/markers.ts`             | draws located zeros (circles) and poles (×), with order labels, on the overlay                                                                        |
| `analysis/singularities.ts` | locate / count / order zeros & poles: grid candidates → Newton refinement → argument-principle winding                                                |

## Tests

`test/` — `smoke.test.ts` (shared-package wiring), `colormaps.test.ts` (atlas dimensions, sRGB gamut,
cyclic continuity, HSV anchors), `colorShader.test.ts` (fragment-program assembly), `viewState.test.ts`
(share-link round-trip + namespace guard, incl. parameter values), `presets.test.ts` (every preset
parses/compiles/evaluates), `params.test.ts` (the ℂ-pad ↔ value coordinate mapping), `animate.test.ts`
(the `t` frame-stepping — wrap / clamp / ended), `sweep.test.ts` (the sweep value spacing),
`autocomplete.test.ts` (the token-under-caret + prefix matching), `precision.test.ts` (the float32
badge policy — ζ warn / Γ note, strongest-first, over the `parse → calledFunctions → precisionNote`
path), and `singularities.test.ts` (the zero/pole finder recovers known counts and orders). Coloring
correctness is additionally checked visually against reference plates (the Wegert enhanced-portrait)
during development; an automated pixel-diff visual-regression harness is deferred.
