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

Milestones are numbered **PT-n**. PT-0 and PT-1 have shipped; **PT-6 is the in-progress build** (B1 + C1
from the idea backlog below) — its sub-parts **PT-6a (the draw-your-own-K polygon editor) and PT-6b (the
hover probe + draggable test charge) have landed**; **PT-6c (the Brownian Monte Carlo) is next**. PT-2 …
PT-5 remain queued.

- **PT-0 — carve the app (done, ADR-0036 stage 2).** `apps/potential-theory`; the conductor view + its
  engines (`potentialDomain` / `generalDomains` / `logLightning` / `faberZeros` / `feketePoints` /
  `marchingSquares`) moved off `2d-electrostatics` as the single-page `index.html`. Deps `@cas/flow`,
  `@cas/faber`, `@cas/core`, `@cas/ui`.
- **PT-1 — the shell (done, ADR-0036 stage 3).** The shared `mountNavHeader` (`@cas/ui`) + `@cas/ui/nav.css`
  now render on the page — back-to-launcher + sibling nav, restoring cross-app navigation.
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
- **PT-6 — Brownian Monte Carlo + draw-your-own-K + probe (IN PROGRESS — B1 + C1 below).** The chosen next
  build. Three parts: **(a) — DONE.** A custom-K editor: a draggable-vertex polygon routed through the exact
  exterior Schwarz–Christoffel engine (`@cas/flow`'s `fitPolygonFlow` via `polygonDomain`, `=`), so a
  hand-drawn K earns the same exact capacity / μ_K / Green as the presets. Direct-manipulation vertex drag
  with a view LOCK during editing (so the shape doesn't swim), ＋/－ vertex and Reset, a degenerate-shape
  `⚠` guard, and a compact `#vs=` permalink (the app's first — domain + rounded corners). The pure helpers
  (`customK.ts`) are node-tested; the SC refit runs on drag-release, the outline+handles redraw live. (The
  optional smoothed-freehand-curve-through-log-lightning `≈` variant is deferred — polygon-only for now.)
  **(b) — DONE.** A hover probe reading the three potential-theory quantities at an ARBITRARY point z: the
  Green's function g_K(z), the equilibrium logarithmic potential U^μ(z) = −log cap − g_K (= the Robin
  constant γ on/inside K), and the field magnitude |E| = |∇g_K| with its outward direction. Exact (`=`) for
  exterior-map K — a Newton inverse of Ψ (`probeField.ts`, node-tested against the disk 1/|z|, the segment
  1/|√(z²−1)|, and the ellipse) — and `≈` for general K (the log-lightning greenFn + a central-difference
  gradient). Rendered as a floating readout at the cursor plus an on-canvas marker + outward field arrow,
  with an optional **draggable test charge** (a pinned probe) reusing the same evaluator. The conductor pane
  also became a `<main>` landmark (a11y). **(c)** a
  walk-on-spheres **harmonic-measure Monte Carlo** — random walkers escaping to ∞ reconstruct μ_K as a live
  "fourth road," honestly `≈` with the far-field radius + sample count shown, and validated against the
  exact μ_K (arcsine on a segment, uniform on the disk, cusp-concentration on the deltoid). App-local (no
  new package, per ADR-0007); reuses `@cas/flow`, `@cas/ui` (accessible canvas + optional worker offload),
  and `@cas/core`.

## Future expansions — idea backlog (researched Sept 2026)

A menu of larger extensions, researched against the potential-theory / approximation-theory literature and
the suite's packages, recorded so future passes can refer back. Effort is S/M/L; honesty is the `=`/`≈` the
feature can honestly claim. **B1 + C1 are being built now as PT-6**; the rest await selection.
(Sources in References.)

**Tier A — deepen the object.**
- **A1 — external fields / weighted equilibrium (headline).** Add a background field / draggable external
  charges; the equilibrium measure then minimizes *weighted* energy, and its support forms, shrinks, and
  splits into intervals/arcs with genuine phase transitions ("the drop"). The Saff–Totik theory made
  interactive; the mathematics behind random-matrix / Coulomb-gas eigenvalue laws; connects to weighted
  quadrature domains (a QD-app tie). `≈` (a weighted-equilibrium / obstacle solve). Effort **L** (a
  one-external-charge first slice is **M**).
- **A2 — condensers & multiply-connected K.** Two conductors at ±V (a capacitor), ring domains, and K with
  several components/holes; the condenser capacity, the field between the plates, and μ_K splitting across
  components by capacity. `=`/`≈`. Effort **L** (multiply-connected log-lightning / condenser solve).

**Tier B — new lenses on μ_K (the app's spine is "roads to the equilibrium measure").**
- **B1 — Brownian Monte Carlo = harmonic measure (SELECTED, PT-6).** Random walkers from ∞ hitting ∂K
  reconstruct μ_K (harmonic measure from ∞ = equilibrium measure); a live probabilistic fourth road, plus
  the h-function. `≈`. Effort **S–M**.
- **B2 — polynomial-approximation lab (Bernstein–Walsh).** Type an `f`; draw its degree-n Chebyshev / Faber
  / best approximant on K, its zeros equidistributing to μ_K, and the error contours coinciding with the
  Green equipotentials (error^{1/n} → 1/e^{g}). The "why capacity matters" payoff; subsumes PT-2 and extends
  the Faber/Leja overlays. `=`/`≈`. Effort **M**. Reuses `@cas/faber`, `@cas/expr`.
- **B3 — Stieltjes electrostatic model of orthogonal-polynomial zeros.** n movable charges + fixed endpoint
  charges relax to the zeros of a Jacobi / Hermite / Laguerre polynomial; animate the relaxation, check
  against the known zeros. The electrostatic framing made literal; bridges Fekete (n-point equilibrium) to
  A1 (the endpoint charges are a baby external field). `=` (closed-form check). Effort **S–M**.

**Tier C — interactivity & authorship.**
- **C1 — draw-your-own-K + a hover probe (SELECTED, PT-6).** A draggable-vertex K editor (polygon → exact
  exterior SC; smooth → log-lightning `≈`), permalinked, plus a hover readout of g_K / potential / field.
  Turns "gallery" into "instrument." `=`/`≈`. Effort **M**. Reuses the draggable-editor pattern (Faber /
  Riemann-map) + the existing g_K sampler.

**Tier D — cross-app resonance (the suite's north star: hand-offs).**
- **D1 — import a K + the Complex-Dynamics tie (enriches PT-4).** Accept a K over `@cas/interchange`: a
  polygon from the Riemann-map SC studio, a QD's ∂Ω from Quadrature Domains, or a filled Julia set from
  Complex Dynamics — whose Green's function *is* the escape-rate / Böttcher potential and whose external
  rays (`@cas/dynamics`) are its Green field lines (a "same object, two apps" showpiece). `=`/`≈`. Effort
  **M**.

**Smaller wins (already queued above).** PT-2 (growth-law readout, subsumed by B2), PT-3 (corner-clustered
log-charges for cusped K, `⚠`-honest), PT-5 (the three-roads benchmark panel).

## Non-goals

Higher-dimensional potential theory, signed/complex equilibrium problems with external fields (weighted
potential theory beyond a passing nod), and certified error bars on the general-K `≈` fits are out of scope
— this app is the planar, logarithmic, honestly-labelled conductor story.

## References

Ransford, *Potential Theory in the Complex Plane*; Saff–Totik, *Logarithmic Potential Theory with External
Fields*; Gopal–Trefethen (2019, the lightning solver); Brubeck–Nakatsukasa–Trefethen (2021, the stable
basis); and the author's paper *Complex Analysis as Two-Dimensional Electrostatics and Hydrodynamics* for
the electrostatic reading of μ_K / cap(K) / g_K.

Idea-backlog research (Sept 2026): Trefethen, *Log-lightning computation of capacity and Green's function*
(2021); Marshall & Rossi / Walden–Ward, *harmonic-measure distribution functions* (harmonic measure = the
Brownian first-hit law, the basis of B1); Marcellán–Martínez-Finkelshtein–Martínez-González and
Martínez-Finkelshtein et al., *electrostatic (Stieltjes) interpretation of orthogonal-polynomial zeros*
(B3); the Bernstein–Walsh theory of polynomial approximation on a compact set (B2); Nasser–Vuorinen,
*numerical computation of the capacity of generalized condensers* (A2); and Balogh et al., *point-source
equilibrium problems with connections to weighted quadrature domains* (A1's QD tie). The walk-on-spheres
Monte Carlo (B1) follows Muller's method for the exit distribution of Brownian motion.
