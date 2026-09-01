# Hele-Shaw Flow

Free-boundary flow of a viscous fluid in a **Hele-Shaw cell** (two closely-spaced plates), where the
moving fluid boundary is a conformal map of the unit disk that **evolves in time**. Two facets of the
same physics, one per page:

- **`twist.html` — the exact "twisting" showpiece (`=`).** The Graven–Makarov one-point *unbounded*
  quadrature domain QD(α/(w−w₀)) at w₀ = 2, driven by a **complex** charge α = q + iγ: q grows the
  domain, γ spins it (the twist). The whole growing family {Ω_t} is **closed form** — the map, the
  conserved quadrature datum (the charge is recovered at every t as the conservation monitor), and the
  α > 0 critical time. The ill-posed cusp edge (RISKS §3) stops hard at t\* with a ⚠ and is never
  integrated past. This page is also the **hand-off target** of the Quadrature Domains app: a one-point
  unbounded QD authored there rides an `@cas/interchange` link and drives this family from the authored
  charge (ADR-0036 / M4d).
- **`droplet.html` — the numerical interior-droplet evolver (`≈`).** A bounded droplet D(t) = f(𝔻, t)
  grown from a central source by numerically integrating the classical **Polubarinova–Galin** equation.
  Injection (Q > 0) is the stable, smoothing direction; **suction (Q < 0) is ill-posed** — it fingers
  into a (3,2)-cusp — gated behind an opt-in and stopped hard at the cusp (min |f′| → 0, ⚠). The
  conserved **Richardson moments** ride along as the honest error bar.

## Why its own app

Split out of `2d-electrostatics` (ADR-0036). The rest of that app is **steady** potential/flow; these
two pages are the **time-evolving free-boundary** story — a different mental model, a different UI
(a scrub/play timeline, a conservation monitor, a hard critical-time stop). They share the marquee
"grow a quadrature domain and watch it cusp" idea with each other and nothing essential with the
steady pages, so they live together, apart.

## Built on

`@cas/flow` (the conformal-transplant kernel + the `Net2D` line-art drawer), `@cas/core` (the
`dftOnCircle` spectral primitive the PG stepper's Galin–Kufarev solve rides), `@cas/interchange` (the
QD → Hele-Shaw hand-off), and `@cas/ui` (the shared browser shell — fatal boundary + accessible canvas).

## Develop

```
pnpm --filter hele-shaw-flow dev       # http://localhost:5181
pnpm --filter hele-shaw-flow test      # the node-tested engines
pnpm --filter hele-shaw-flow build
```
