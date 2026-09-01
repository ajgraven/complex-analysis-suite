# Potential Theory — app plan

> **Status.** Split out of **2D Electrostatics** per [ADR-0036](../DECISIONS.md). The built work carried
> over intact — it originated as 2D-Electrostatics milestone **M3** (M3.1–M3.4), whose full construction
> record stays in [`complex-potential-studio-plan.md`](complex-potential-studio-plan.md). This document is
> the **forward plan** for the app now that it is its own thing.

## What this app is

The **analysis** corner of the old single app. Where the 2D-Electrostatics sandbox is an *interactive
field you poke*, this is a *static object you study*: a compact set **K** as a grounded conductor, and the
measures and potentials attached to it by logarithmic potential theory. The electrostatic lens made
literal — the equilibrium measure μ_K **is** the charge on K, the logarithmic capacity cap(K) **is** its
capacitance, the Green's function g_K(·, ∞) **is** its exterior potential — with three independent roads to
μ_K drawn over one picture.

## Carried-over foundation (built)

- **M3.1 — the conductor view.** `potentialDomain.ts` unifies every exterior-map class behind one
  Ψ(w) = c·w + Σ aₖw⁻ᵏ (SC polygons via `@cas/flow`'s exterior fit; disk / ellipse / segment / deltoid as
  explicit finite Laurent maps): **capacity** = |c|, the **equilibrium measure** μ = Ψ⁎(dθ/2π), the
  **Green equipotentials** g_K = t ⇔ Ψ(|w| = eᵗ), + field lines. All `=`; ground-truthed against a golden
  capacity table and the arcsine law on [−1, 1].
- **M3.2 — the Faber-zero overlay** (`faberZeros.ts`, `@cas/faber`). Zeros of F₁…F_N via the Faber
  recurrence + Durand–Kerner, with the honest caveat that they equidistribute to μ_K only when ∂K has
  corners (smooth ∂K keeps them interior).
- **M3.3 — the Fekete/Leja overlay** (`feketePoints.ts`). Greedy Leja points maximising ∏|z − zⱼ| + the
  transfinite diameter dₙ ↓ cap(K) (Fekete's theorem — the third road, tying back to capacity). Coexists
  with the Faber overlay: two roads to μ_K on one picture.
- **M3.4 — general K via log-lightning** (`logLightning.ts`, `≈`). For a compact K with no closed-form
  map: log-charges just inside ∂K, weights + Robin constant from a boundary least-squares solve on
  `@cas/core`'s Householder QR, so cap = e^γ, g_K = U − γ, charge density ∝ |∂g/∂n|; the Green
  equipotentials are `marchingSquares.ts` level curves. Fekete/Leja works on general K; Faber is disabled
  (no map).

## The design spine

**Three roads to the equilibrium measure** on one canvas — the charge (M3.1), the Faber zeros (M3.2), the
Fekete/Leja points (M3.3) — plus capacity three ways (|c|, dₙ ↓ cap, e^γ). The honest split is
**exterior-map K** (`=`, exact pushforwards) vs. **general K** (`≈`, the log-lightning fit); the app never
lets an `≈` quantity read as `=`, and Faber is switched off where it has no map to stand on.

## Roadmap

Milestones are numbered **PT-n**. Nothing below is committed beyond PT-0.

- **PT-0 — carve the app (done, ADR-0036 stage 2).** `apps/potential-theory`; the conductor view + its
  engines (`potentialDomain` / `generalDomains` / `logLightning` / `faberZeros` / `feketePoints` /
  `marchingSquares`) moved off `2d-electrostatics` as the single-page `index.html`. Deps `@cas/flow`,
  `@cas/faber`, `@cas/core`, `@cas/ui`.
- **PT-1 — the shell.** Adopt `mountNavHeader` (`@cas/ui`) — back-to-launcher + sibling nav — replacing the
  ad-hoc toolbar back-link (the split dropped its cross-app page links; this restores real cross-app nav).
- **PT-2 — the growth-law readout** (deferred at M3). Draw (1/n)·log|Fₙ(z)| → g_K(z) as an on-canvas
  convergence readout, closing the loop between the Faber overlay and the Green's function (the "Faber
  polynomials as an approximate exterior map" story).
- **PT-3 — cusped general K.** Corner-clustered log-charges (the lightning method's corner refinement)
  for general K with corners/cusps, where the smooth-boundary log-lightning fit degrades — honestly
  `≈`/`⚠`.
- **PT-4 — import a K.** Accept a compact set K over `@cas/interchange` (a polygon from Riemann Map's SC
  studio, or a quadrature domain's ∂Ω from the QD app) and run the conductor analysis on it — the analysis
  counterpart to the flow hand-offs, gated on the receiving-tool rule (ADR-0007).
- **PT-5 — benchmarks & comparison.** A capacity/energy comparison panel across the three roads and against
  known closed forms (the didactic "they all agree, and here's the rate" view).

## Non-goals

Higher-dimensional potential theory, signed/complex equilibrium problems with external fields (weighted
potential theory beyond a passing nod), and certified error bars on the general-K `≈` fits are out of scope
— this app is the planar, logarithmic, honestly-labelled conductor story.

## References

Ransford, *Potential Theory in the Complex Plane*; Saff–Totik, *Logarithmic Potential Theory with External
Fields*; Gopal–Trefethen (2019, the lightning solver); Brubeck–Nakatsukasa–Trefethen (2021, the stable
basis); and the author's paper *Complex Analysis as Two-Dimensional Electrostatics and Hydrodynamics* for
the electrostatic reading of μ_K / cap(K) / g_K.
