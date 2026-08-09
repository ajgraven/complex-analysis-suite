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

## Status — Phase 1, Milestone 1A (live 2D domain coloring)

Type a function `f(z)` and see its live domain-coloring phase portrait. The expression is parsed and
compiled by `@cas/expr` (to GLSL for the render), typeset live with KaTeX (`toLatex`), and drawn by the
layered coloring engine: a **swappable phase colormap** (perceptually-uniform **Oklch** by default,
plus the classic **HSV** wheel) times a **modulus transfer** (phase-only / linear / rational / log /
log-log), with a NaN/Inf sentinel so unreliable pixels never read as a false zero. **Pan** (drag),
**zoom-to-cursor** (scroll), and **reset view**, with HiDPI + progressive (half-resolution while
dragging) rendering and WebGL2 context-loss recovery. Built into CI, **not yet published** (the
launcher lists it as "Coming soon").

Next — Milestone 1B: coordinate axes/grid + aspect-lock, the phase-wheel and modulus legends, a cursor
`z, f(z), |f|, arg f` probe, a preset gallery, share-links, and PNG export, validated against a Wegert
plate. See [the plan](../../docs/design/complex-function-plotter-plan.md).

## Source layout (`src/`)

| File                   | Role                                                                                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main.ts`              | boots the plot; wires the expression box + KaTeX preview + error line, the colormap / modulus controls, and pan / zoom / reset                          |
| `render/colorShader.ts`| the layered coloring GLSL (`colorAt` = phase LUT × modulus transfer, + NaN/Inf sentinel) and the fragment-program assembler                             |
| `render/colormaps.ts`  | phase colormaps (perceptual Oklch + HSV) baked into one RGBA8 atlas; Oklab→sRGB conversion                                                              |
| `render/plot.ts`       | the WebGL2 plot: context + loss/restore, program rebuild on `f` change, the atlas texture, HiDPI / progressive render, pan/zoom helpers, PNG data-URL   |

## Tests

`test/` — `smoke.test.ts` (shared-package wiring), `colormaps.test.ts` (atlas dimensions, sRGB gamut,
cyclic continuity, HSV anchors), and `colorShader.test.ts` (fragment-program assembly). Coloring
correctness is additionally checked visually against reference plates during development.
