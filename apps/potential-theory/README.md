# Potential Theory

A compact set **K** as a grounded **conductor** — the electrostatic lens on logarithmic potential
theory, made literal. The equilibrium measure μ_K *is* the charge density on K; the logarithmic
capacity cap(K) *is* its capacitance; the Green's function g_K(·, ∞) *is* its exterior potential. One
pane draws all of it, with three overlays that each recover μ_K a different way.

## What it shows

- **The equilibrium charge** μ_K = Ψ⁎(dθ/2π) — the images of uniform-θ points under the exterior map,
  coloured by local density.
- **Capacity** cap(K) = |c| (the exterior map's leading coefficient) and the **Green equipotentials**
  g_K = t ⇔ Ψ(|w| = eᵗ), with field lines.
- **Faber-polynomial zeros** (`@cas/faber`) — a road to μ_K that equidistributes to ∂K only when ∂K has
  corners (honest caveat shown otherwise).
- **Fekete / Leja points** — greedy points maximising ∏|z − zⱼ|, with the transfinite diameter
  dₙ ↓ cap(K) (Fekete's theorem — the third road, tying back to capacity).

## Two domain classes, honestly labelled

- **Exterior-map K** (`=`): Schwarz–Christoffel polygons (via `@cas/flow`'s exterior SC fit) and the
  closed-form disk / ellipse / segment / deltoid. Every quantity is an exact pushforward Ψ(circles).
- **General K** (`≈`): smooth blobs with no closed-form map — capacity / Green / charge come from a
  **log-lightning** fit (log-charges just inside ∂K, a boundary least-squares solve on `@cas/core`'s
  Householder QR), and the Green equipotentials are marching-squares level curves of the g_K field.

## Why its own app

Split out of `2d-electrostatics` (ADR-0036). The sandbox / airfoil / polygon pages are *interactive
field and flow*; this is the *analysis* view — a static conductor and the measures / potentials attached
to it, a distinct mental model with its own overlays. It shares the exterior-map machinery with the rest
through `@cas/flow`, and nothing else.

## Built on

`@cas/flow` (the exterior Schwarz–Christoffel fit + the `Net2D` line-art drawer + polygon presets),
`@cas/faber` (the Faber polynomials for the zero overlay), `@cas/core` (the Householder-QR least squares
behind the log-lightning fit), and `@cas/ui` (the shared browser shell).

## Develop

```
pnpm --filter potential-theory dev       # http://localhost:5182
pnpm --filter potential-theory test      # the node-tested potential-theory math
pnpm --filter potential-theory build
```
