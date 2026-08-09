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

## Status — Phase 0 (walking skeleton)

Renders **one fixed compiled function** (`f(z) = z²`) as a phase portrait, to prove the
`@cas/expr → @cas/gpu` compile chain end to end in a fresh app: the string `"z^2"` is parsed and
compiled to a GLSL `fFn` body (`@cas/expr`), concatenated with the complex GLSL stdlib (`@cas/gpu`),
and drawn per-pixel — hue = arg f, brightness = |f|. Built into CI, but **not yet published** (the
launcher lists it as "Coming soon").

Phase 1 replaces the hardcoded map with a live expression box + typeset preview and the layered
`colorAt` coloring shader. See the plan's phase runbook.

## Source layout (`src/`)

| File      | Role                                                                                                                                                          |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main.ts` | boots the WebGL2 context (with loss/restore), compiles `f` via `@cas/expr`, assembles the fragment program from the `@cas/gpu` stdlib, renders the portrait |

## Tests

`test/smoke.test.ts` — asserts the shared-package wiring: `@cas/expr` evaluates and compiles `z²`
(CPU + GLSL), `@cas/gpu` supplies the complex GLSL stdlib, and `@cas/interchange` exposes the
canonical convention for hand-off.
