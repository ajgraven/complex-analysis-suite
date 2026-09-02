# Potential Theory

A compact set **K** as a grounded **conductor** — the electrostatic lens on logarithmic potential
theory, made literal. The equilibrium measure μ_K *is* the charge density on K; the logarithmic
capacity cap(K) *is* its capacitance; the Green's function g_K(·, ∞) *is* its exterior potential. One
pane draws all of it, with **four roads** that each recover μ_K a different way.

## What it shows

- **The equilibrium charge** μ_K = Ψ⁎(dθ/2π) — the images of uniform-θ points under the exterior map,
  coloured by local density.
- **Capacity** cap(K) = |c| (the exterior map's leading coefficient) and the **Green equipotentials**
  g_K = t ⇔ Ψ(|w| = eᵗ), with field lines.
- **Faber-polynomial zeros** (`@cas/faber`) — a road to μ_K that equidistributes to ∂K only when ∂K has
  corners (honest caveat shown otherwise).
- **Fekete / Leja points** — greedy points maximising ∏|z − zⱼ|, with the transfinite diameter
  dₙ ↓ cap(K) (Fekete's theorem — the third road, tying back to capacity).
- **Brownian Monte Carlo** — walk-on-spheres walkers released from a far circle reconstruct μ_K where they
  first strike ∂K (harmonic measure from ∞ = the equilibrium measure). A live probabilistic *fourth road*,
  honestly `≈`, with the far-field radius + sample count and a uniform-in-θ convergence check shown.

## Make your own K, and probe it

- **Draw your own K** — a "Custom polygon" with draggable vertices (＋/－ vertex, Reset), routed through the
  exact exterior Schwarz–Christoffel path, so a hand-drawn conductor earns the same `=` capacity / μ_K /
  Green as the presets. The shape rides in a `#vs=` permalink.
- **Hover probe** — reads g_K(z), the equilibrium potential U^μ(z) = −log cap − g_K, and the field
  |E| = |∇g_K| at the cursor (`=` for exterior-map K via a Newton inverse of Ψ, `≈` for general K), with a
  marker + outward field arrow and an optional draggable **test charge**.
- **Navigate** — scroll to zoom toward the cursor, drag the background to pan, double-click to reset to the
  auto-fit; the focusable pane also takes arrow-key pan, `+`/`−` zoom, and `Enter` to reset (so the outer
  Green curves and field lines that run past the default frame are reachable). Panning/zooming suppresses
  the per-paint auto-fit until a reset or a domain switch; the pan/zoom math lives in `@cas/flow`'s
  `Net2D` (`viewTransform`).

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
