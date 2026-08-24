# Argument Principle

An educational visualizer for the **argument principle**: the winding number of the image curve f(γ) about
the origin equals the number of **zeros minus poles** of `f` enclosed by the contour γ,

$$\frac{1}{2\pi i}\oint_{\gamma}\frac{f'(z)}{f(z)}\,dz \;=\; Z - P.$$

It renders **pure-2D** — a dual z-plane / w-plane view of a draggable contour γ and its image f(γ) — and
rides the shared `@cas/*` packages:

- **`@cas/expr`** — the custom `f(z)` path (one expression → JS evaluator).
- **`@cas/core`** — exact rational zeros/poles via `rootsMonic` (monic-Horner + Durand–Kerner), and the
  shared `pointInPolygon` geometry primitive.
- **`@cas/interchange`** — the permalink codec (app namespace `ap`) and the `MapSpec`/`Envelope` map hand-off.
- **`@cas/export`** — PNG `tEXt` reproducibility metadata on exported figures.

A separate suite app per CLAUDE.md decision 8; architecture decision
[ADR-0019](../../docs/DECISIONS.md). Plan: [`docs/design/argument-principle-plan.md`](../../docs/design/argument-principle-plan.md).

## Running

From the repo root:

```bash
pnpm --filter argument-principle dev      # Vite dev server (http://localhost:5177)
pnpm --filter argument-principle build    # static build into dist/
pnpm --filter argument-principle test     # Vitest suite
```

Single-page Vite app, `base: "./"` so it serves from any sub-path (it publishes under `argument-principle/`
beneath the launcher).

## Honest labeling

The verdict panel cross-checks the (aliasing-prone) winding estimate against the exact enclosed zero/pole
count and flags `⚠ unreliable` when γ grazes a singularity; readouts carry honest `=`/`≈` labels.
