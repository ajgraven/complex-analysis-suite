# Riemann Map

A research-grade **Riemann-map / conformal-mapping studio**. Pick a simply-connected region Ω and the app
draws a conformal map between Ω and the unit disk 𝔻 in two linked canvas panes — the source region beside
its conformal image, with a draggable grid/point probe. It renders **pure-2D** (no dynamics / GPU stack):
it either *computes* a conformal map numerically or *imports* one another tool produced, riding the shared
`@cas/*` packages rather than reimplementing them:

- **`@cas/conformal`** — the numerical conformal-map engine: the lightning solver + forward-map builder for
  smooth regions, and the **Schwarz–Christoffel** engine (interior 𝔻 ↔ bounded simple polygon, precise +
  fast modes) for polygonal regions.
- **`@cas/core`** — complex / dense-polynomial algebra and the Householder-QR least-squares primitive the
  solvers stand on.
- **`@cas/expr`** — the custom-region path (a boundary/region formula → JS evaluator).
- **`@cas/export`** — PNG `tEXt` reproducibility metadata on exported figures.
- **`@cas/interchange`** — the `#vs=` share-link codec (app namespace `rm`) **and** the map hand-off: it
  imports a filled-Julia Böttcher map exported by Complex Dynamics (`kind:"map"` `LaurentMap`) as a
  disk-image source rather than computing dynamics itself.

Architecture decisions: [ADR-0017](../../docs/DECISIONS.md) (Riemann Map becomes a pure-2D *consumer* — CD
produces a Böttcher map, RM imports it — dropping its old dynamics/GPU stack),
[ADR-0018](../../docs/DECISIONS.md) (the `@cas/conformal` extract-ahead), and
[ADR-0020](../../docs/DECISIONS.md) (the two-mode Schwarz–Christoffel engine). Plan + literature:
[`docs/design/schwarz-christoffel-plan.md`](../../docs/design/schwarz-christoffel-plan.md) and
[`schwarz-christoffel-research-notes.md`](../../docs/design/schwarz-christoffel-research-notes.md).

## Running

From the repo root:

```bash
pnpm --filter riemann-map dev      # Vite dev server (http://localhost:5176)
pnpm --filter riemann-map build    # static build into dist/
pnpm --filter riemann-map test     # Vitest suite
```

Single-page Vite app, `base: "./"` so it serves from any sub-path (it publishes under `riemann-map/`
beneath the launcher).

## Region sources

- **Formula regions** — a region described by a `@cas/expr` formula; fit with the lightning conformal-map
  builder (Ω → 𝔻) and its forward map (𝔻 → Ω).
- **Polygon regions (SC studio)** — convex **and reentrant** polygons (L-shape, cross, and presets) routed
  through the exact Schwarz–Christoffel engine, so **both directions are exact** (the conformal grid is
  drawn by the precise forward map; the ODE inverse serves the single hover query). The **prevertices wₖ ↔
  corners vₖ** correspondence is drawn colour-matched across the two panes with interior-angle `αₖ·π`
  labels, and polygon **vertices are draggable** directly on the pane showing Ω: a drag forks to an
  editable "Custom polygon" (fast/lightning while dragging, precise/warm-started on release) that rides in
  the `#vs=` permalink. Fits carry honest `=`/`≈` labels with `converged` / `degraded` / `residual` stats.
- **Exterior-disk preset gallery** (PR #288) — a gallery of closed-form univalent maps ψ: 𝔻* = {|z| ≥ 1} →
  the exterior of a compact set `K` (Joukowski, vertical slit, ellipse, deltoid/astroid, star), shown in an
  interactive pan/drag/zoom **image pane**.
- **Imported disk-image map** — a Böttcher `LaurentMap` exported from Complex Dynamics via `@cas/interchange`
  (the CD→RM "Riemann Map ↗" deep link), consumed as a disk-image source; pinned by the cross-app golden
  `CD_TO_RM_BOTTCHER_LINK`.

## Honest labeling

Exact SC fits (polygons) read `=`; lightning fits, reduced-quadrature results, and reentrant/crowded shapes
read `≈` with their residual and a `degraded` flag when the conformal accuracy drops — the studio is
exploratory and never presents an estimate as certified.
