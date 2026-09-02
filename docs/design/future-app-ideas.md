# Future app ideas for the suite

> A catalogue of candidate new apps for `complex-analysis-suite`, recorded from the
> Aug 2026 ideation pass. Each is chosen to be **in the suite's spirit** (rigorous,
> interactive, honestly-labelled complex-analysis / complex-dynamics visualization) and
> to **reuse existing `@cas/*` machinery** — the north-star property that each new tool
> builds fewer primitives from scratch than the last ([VISION §1](../VISION.md)).
>
> Status key: **▶ selected** (plan in progress) · **○ candidate** · **◇ honourable mention**.
> Nothing here is a locked decision; a chosen app graduates to its own `*-plan.md` and,
> where it changes a shared contract, an ADR.

The existing eleven apps span: complex dynamics (Böttcher / rays / matings), quadrature
domains + Schwarz reflection, the domain-coloring plotter (incl. a Riemann-surface mode,
with algebraic-curve **M2** and monodromy **M3** deferred — so that ground is *claimed*),
Riemann / conformal maps (lightning + interior/exterior Schwarz–Christoffel), the argument
principle, the Faber transform, 2D electrostatics (complex-potential fields + the polygon
conformal transplant), 2D hydrodynamics (ideal flow past a body via a conformal transplant — the
airfoil + a closed-form gallery, ADR-0037), Hele-Shaw flow (free-boundary evolution — the twist +
droplet showpieces), potential theory (equilibrium measure / capacity / Green's function — idea #1
below, since built and now its own app after the ADR-0036 split), and anti-holomorphic correspondences.
The ideas below deliberately avoid all of those.

---

## ✅ 1. Complex-Potential Studio — *built (shipped as `apps/2d-electrostatics`, ADR-0034)*

Two-dimensional electrostatics / ideal hydrodynamics as one interactive object: the
complex potential `w(z) = φ + iψ`. Drop and drag sources / sinks / vortices / doublets
(a complex residue `c = q + iγ` is charge + vortex, with logarithmic-spiral streamlines);
**transplant** any reference flow through a conformal map of an arbitrary region; and a
potential-theory tab for **equilibrium measure, Fekete points, and logarithmic capacity**.

- **Reuses:** `@cas/conformal` (the biggest new consumer — the transplant), `@cas/faber`
  (capacity + Faber/Chebyshev zeros → equilibrium measure, an exact `=` spine),
  `@cas/gpu` (field / streamline render), `@cas/core`, `@cas/expr`, `@cas/export`.
- **Unlocks:** a `ConformalMap` form in `@cas/interchange` (the deferred SC/conformal
  hand-off, ADR-0007 "gate on a receiving tool" — this *is* that tool; Riemann-Map becomes
  the producer).
- **Grounding:** the author's own writeup *"Complex Analysis as Two-Dimensional
  Electrostatics and Hydrodynamics"* is the conceptual spec — same normalizations as the
  QD app (`∮ dz/z = 1`, `dA = dx dy/π`); the unbounded-QD **"twisting by complex charge"**
  (Hele-Shaw with spin) is a showpiece QD-app hand-off.
- **Open online:** elementary-flow toys exist (potentialflow.com, airfoil playgrounds);
  transplant-through-arbitrary-maps and interactive equilibrium-measure / capacity are not.
- **Built:** shipped as `apps/2d-electrostatics` (ADR-0034), through M3; design record in
  `docs/design/complex-potential-studio-plan.md`.

## ○ 3. Conformal Welding & Shape Fingerprints

Map inside and outside of a Jordan curve to the disk, compare boundary parametrizations →
a circle diffeomorphism (the **fingerprint**); weld one back to a curve. Exact oracle: a
degree-`n` polynomial lemniscate's fingerprint is the `n`-th root of a Blaschke product
(Ebenfelt–Khavinson–Shapiro).

- **Reuses / adds:** a **third conformal engine in `@cas/conformal` — the zipper /
  geodesic algorithm (Marshall–Rohde)** — alongside lightning + Schwarz–Christoffel. The
  `VISION.md` already named "the Zipper conformal mapper" as a future tool; this realizes
  it. Plus a small Blaschke / hyperbolic-disk module (second consumer lined up below).
- **Open online:** no interactive fingerprint tool exists. `=` on the lemniscate↔Blaschke
  oracle, `≈` on numerical welding.

## ○ 5. SLE / Loewner Evolution & Loewner Energy

Grow the conformally-invariant random curve SLE(κ) by composing slit maps driven by
`√κ·Bₜ`; the κ=4 / κ=8 phase transitions; **Loewner energy** (Dirichlet energy of the
driver) for the deterministic large-deviation story; draw-a-curve → recover its driving
function.

- **Reuses / adds:** `@cas/core`; a **slit-map / zipper primitive shared with #3** (both
  are slit-map compositions — a `@cas/loewner` or `@cas/conformal` addition with two
  consumers). Kennedy's fast algorithm keeps it real-time.
- **Open online:** essentially no browser SLE tool. Intrinsically `≈` / seed-tagged; the
  exact deterministic driver↔trace solutions are the `=` corpus.

## ○ 2. Riemann Zeta & L-function Explorer

ζ(s) domain-colored across the critical strip; the real Riemann–Siegel `Z(t)` whose sign
changes are the zeros; the **explicit formula** assembling the prime-counting staircase as
a sum of one wave per zero; generalize to Dirichlet L-functions.

- **Reuses:** `@cas/gpu` (`PHASE_COLORING_GLSL`, already colors ζ/Γ in the plotter),
  `@cas/expr`, `@cas/core`, `@cas/export`. Riemann–Siegel remainder `≈`.

## ○ 4. Elliptic Functions & the Lattice–Torus–Cubic

One draggable lattice driving, in sync: domain-colored `℘/ζ/σ`, the fundamental
parallelogram, the torus `ℂ/Λ`, and the plane cubic `(℘′)² = 4℘³ − g₂℘ − g₃` with the
group law as chord-and-tangent. Modular tab: SL₂(ℤ) on ℍ, `j`, fundamental domains, Ford /
Farey / Stern–Brocot.

- **Reuses:** `@cas/gpu` (domain-color shader wholesale — ℘ is a per-pixel lattice sum),
  `@cas/core`, `@cas/exact` (Farey / mediant integer geometry), and it is an interchange
  **producer** (export the cubic as a `map`). Fills the suite's biggest classical gap.

## ○ 6. Beltrami µ-Painter (quasiconformal maps)

Paint a Beltrami coefficient `µ(z)` (ellipse field) and watch the quasiconformal map it
generates via `∂f/∂z̄ = µ ∂f/∂z`; `µ → 0` recovers the Riemann map. Surfaces the
measurable Riemann mapping theorem that underlies the suite's own mating/surgery work
(correspondences, [RISKS §3](../RISKS.md)).

- **Reuses:** `@cas/conformal` (the `µ→0` limit + side-by-side comparison), `@cas/core`,
  `@cas/gpu`. `≈` throughout; `⚠` as `|µ|→1`.

## ○ 7. Circle Packing & Discrete Conformal Maps

Koebe–Andreev–Thurston: pack circles with a prescribed tangency pattern → a *discrete*
conformal map that converges (Rodin–Sullivan) to the analytic Riemann map. The demo is the
**side-by-side** against `@cas/conformal`'s analytic map of the same region — a live
validator and a golden-corpus generator.

- **Reuses:** `@cas/conformal` (analytic comparison), `@cas/core`. Discrete map `≈`.

## ◇ Honourable mentions (near-free given the stack)

- **Newton / rational-map basins** — one shader off the dynamics engine (`@cas/gpu`,
  `@cas/dynamics`, `@cas/expr`).
- **Transcendental Cantor-bouquet Julia sets** (`λeᶻ`, `λsin z`) — dynamics-engine extension.
- **Kleinian / Schottky "Indra's Pearls"** — reuses `@cas/schwarz`'s under-exploited
  `sampleLimitSet` / `boxCountingDimension` / `buildPreimageTree` and the correspondences
  ideal-triangle-group code.
- **Nevanlinna–Pick interpolation & Schwarz–Pick** — reuses #3's Blaschke / hyperbolic-disk
  module (its second consumer).
- **Harmonic measure & Brownian motion** — the conformal invariant bridging #1's
  equilibrium measure and #5's conformal-invariant randomness.
- **Apollonian gaskets / integral circle packings** — `@cas/exact` integer curvatures.

## Cross-cutting reuse notes

- **#3 and #5 co-build one slit-map / zipper primitive** — two consumers, one extraction
  (ADR-0007).
- **#1 opens the `ConformalMap` interchange form** (interchange → 1.4.0), which #3 and #7
  then reuse for hand-offs — the deferred lane pays for itself across three apps.
- **#3's Blaschke module** has its second consumer (Nevanlinna–Pick) waiting.
- **#6 and #7 are consumers / validators** of `@cas/conformal`, not new engines.

Suggested build order: **#1 first** (opens the interchange form, biggest `@cas/conformal`
consumer), then **#3** (adds the zipper), then **#5** (reuses the zipper), with **#6 / #7**
as lighter consumers slotting in on momentum.
