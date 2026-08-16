# Faber on polygonal / cornered K via the Schwarz–Christoffel engine — implementation plan

> Realizes feature **T2.3** of [`faber-transform-research-features.md`](faber-transform-research-features.md):
> extend `apps/faber-transform` from closed-form finite-Laurent domains (ellipse, deltoid, star) to
> **arbitrary polygons** `K`, using an exterior Schwarz–Christoffel map. Includes the results of the M0
> de-risk spike (2026-08), which validated the architecture and caught an exponent-sign subtlety.

## 1. The seam: everything downstream of `{c, laurent[]}` is already built

The whole Faber engine is parametrized by one contract (`@cas/faber` `types.ts`):

```ts
interface ExteriorMap { c: number; laurent: readonly Cx[]; }   // φ(z) = c·z + c₀ + c₁/z + c₂/z² + …
```

The recurrence, `faberTransform`, the exact rational-image path (`faberImageOfPole` / `exteriorMapJet`),
`polynomialRoots`, the GPU render, and the app's exact/series input modes **all** consume this struct and
nothing else. The `types.ts` comment records the precedent: *"both Quadrature Domains (which adapts its
solved φ via `phiLaurentAtInfinity`) and the Faber-transform app feed the same shape."* `@cas/dynamics`
does the same for Julia sets (`rationalLaurentAtInfinity`).

**So the entire task reduces to: produce a truncated `{c, laurent[]}` for the exterior conformal map of a
polygon.** No change to `@cas/faber`.

## 2. The gap

`@cas/conformal`'s `fitSchwarzChristoffel` is **interior-only** (`𝔻 → bounded polygon`). Faber needs the
**exterior** map `φ: 𝔻* → Ω`, `Ω = ℂ∖P` unbounded, `K = P` the compact polygon. That map must be built.

## 3. M0 de-risk spike — findings (DONE)

Regular polygons have a *closed-form* exterior map (by symmetry the prevertices are the n-th roots of
unity — no parameter problem), so the spike validated the construction and the seam directly.

### 3.1 The exterior SC map and its Laurent expansion (validated)

For a polygon with prevertices `zₖ ∈ ∂𝔻` and interior angles `αₖπ`, the exterior map's derivative is

```
φ'(z) = C · ∏ₖ (1 − zₖ/z)^{1 − αₖ}
```

**The exponent is `1 − αₖ`, NOT `αₖ − 1`.** The mapped region is the *exterior* Ω, whose interior angle at
each vertex is `(2 − αₖ)π`, giving SC exponent `(2 − αₖ) − 1 = 1 − αₖ` — sign-flipped from the interior
engine. The spike's first run used `αₖ − 1` and failed the straight-edge + capacity checks; `1 − αₖ` passes
to machine precision. **This is the #1 thing M1 must get right and golden-test.**

A **"no-log-at-∞" side condition** `Σₖ (1 − αₖ) zₖ = 0` makes the `z⁻¹` term of `φ'` vanish, so `φ` has a
clean simple pole `φ(z) ~ Cz` (the `ExteriorMap` normalization, capacity `= |C|`). For regular polygons it
holds automatically (`Σ ωᵏ = 0`).

**Laurent extraction is exact and cheap** — expand `φ'` as a truncated series in `1/z` and integrate,
no FFT / no boundary sampling. For the **regular n-gon** (αₖ = (n−2)/n, so `1 − αₖ = 2/n`):

```
φ'(z) = C·(1 − z⁻ⁿ)^{2/n} = C·Σ_{m≥0} dₘ z^{−nm},   dₘ = C(2/n, m)(−1)ᵐ  [dₘ = dₘ₋₁·(m−1−2/n)/m, d₀=1]
φ(z)  = C·z + C·Σ_{m≥1} [dₘ/(1−nm)]·z^{−(nm−1)}
```

i.e. `laurent[nm−1] = C·dₘ/(1−nm)`, all other entries 0. **This closed form IS the M1a implementation.**

### 3.2 Validation results (all pass)

- Rotational symmetry `φ(ωz)=ωφ(z)` exact (≤1e-15) for n=3,4,5.
- **Straight edges** (the exponent test): image of an inter-prevertex arc is collinear to ~1.3e-4 of edge length.
- Interior angles `(n−2)π/n` exact.
- **Capacity golden (square):** apothem `0.84721` vs the closed form `cap(square, side s) = s·Γ(1/4)²/(4π^{3/2})`
  (`κ₄ = 0.5901703`); with `C = 1` the traced square has **capacity `1.00000`** to 5 digits.
- **`@cas/faber` seam:** the extracted `{c, laurent[]}` drives the real `faberPolynomials` (F₁=z, F₂, F₃),
  `faberTransform`, `polynomialRoots`, and `faberImageOfPole` (φ(2)=2.021 for the square) correctly.

The spike script (`scratchpad/sc-spike.mjs`) becomes the M1a golden corpus.

### 3.3 Lightning `fast` mode is NOT free

`fitConformalMap` assumes a **bounded** Jordan domain with `0 ∈ Ω` and a polynomial basis; the unbounded
polygon exterior breaks both (`0` is inside `P`, not in `Ω`; polynomials diverge at ∞). A fast mode would
need a reciprocal change of variable (`w = 1/(z−a)` mapping the exterior to a bounded domain) plus explicit
∞-handling — real work. **Drop "fast-mode-first"; M1 targets the precise parameter solve.**

## 4. Architecture — three components

1. **Exterior SC engine** (`@cas/conformal`) — the one piece of real new numerics (M1b). For general
   polygons: the exterior parameter problem (prevertices `zₖ` + accessory constant `C` + the `Σ(1−αₖ)zₖ=0`
   constraint) and an exterior forward integral. Reuses `scParameterProblem`'s solver *structure* (softmax
   gap gauge + damped Gauss–Newton, one `lstsqHouseholder` per step) and `gaussJacobi`/`scQuadrature`; only
   the integrand and ∞-handling change. Regular polygons skip this entirely (§3.1).
2. **Laurent-at-∞ extractor** (`@cas/conformal`) — `SCMap → {c, laurent[]}`. Expand each factor
   `(1 − zₖ/z)^{1−αₖ} = Σⱼ C(1−αₖ, j)(−zₖ)ʲ z⁻ʲ`, multiply the `n` truncated series with `@cas/core`'s
   `makeSeries` (the kernel `@cas/dynamics` already uses), then integrate term-by-term (`φ'` coefficient
   `eₚ` at `z⁻ᵖ` → `φ` coefficient `−C·eₚ/(p−1)` at `z^{−(p−1)}`; `e₁ = 0` by the no-log constraint; the
   integration constant `c₀` is the conformal-centre offset). Exact, deterministic, unit-testable.
3. **App wiring** (`apps/faber-transform`) — a `PolygonDomain` source feeding the existing pipeline; polygon
   presets / editor; viewState serialization; honesty flags.

## 5. Milestones (each gated: typecheck / lint / test / build + goldens + browser-verify)

### M1a — Regular-polygon presets, closed-form (the vertical slice) — DONE
Ship square / triangle / pentagon / hexagon as domains, rendered through the *unchanged* Faber pipeline.
- Add the Laurent extractor (component 2) — start with the regular-symmetric closed form (§3.1); it is the
  general extractor specialized to `zₖ = ωᵏ`.
- Add a `PolygonDomain` source in the app (parallel to `PhiPreset`) yielding `{ map, meta }` where
  `meta = { converged, degraded, residual, corners }`; build `{c, laurent[]}` from the closed form.
- **Goldens (from the spike):** square capacity vs `Γ(1/4)²/(4π^{3/2})`; `c → 1` as `n → ∞`
  (regular n-gon → disk); straight-edge collinearity; the `{c,laurent}`→`@cas/faber` recurrence outputs.
- Browser-verify a Faber image renders inside the polygon (masked to `K`), roots on/inside `∂K`.

### M1b — General exterior parameter solve — DONE
Arbitrary bounded simple polygons now work end-to-end, in three landed increments:
- **Step 1 (`exteriorSchwarzChristoffel.ts`):** the exterior forward map via the reciprocal `u=1/z`
  (`Ψ'(u)=C·u⁻²·∏(1−u/uₖ)^{1−αₖ}`), reusing `integrateSegment`. Validated on the regular n-gon (equal
  sides, closure, angles, Γ(1/4) capacity).
- **Step 2 (`exteriorScParameterProblem.ts`):** `solveExteriorParameterProblem` +
  `fitExteriorSchwarzChristoffel` — the polygon→prevertices solve, mirroring `scParameterProblem` with the
  closure/no-log residual `Σ(1−αₖ)/uₖ=0` appended and one gauge frozen (the exterior has only a rotation
  gauge). Validated: convergence from a skewed seed, the square's Γ(1/4) capacity, and a **chiral**
  quadrilateral (pinning the CW orientation).
- **Step 3 (`exteriorMapLaurentAtInfinity` + app wiring):** the Laurent-at-∞ extractor (generalized-binomial
  series of the SC product via `@cas/core` `makeSeries`) → `{c, laurent}`; the app's `polygonMap` fits +
  extracts (memoized), and three general presets (rectangle, tall isosceles triangle, house pentagon) render
  through the unchanged Faber pipeline. The extractor reproduces M1a's closed form for regular polygons.

Reentrant corners (αₖ>1) and a draggable editor are **M2**.

### M2 — Reentrant polygons, diagnostics & UI (DONE)
- **Reentrant corners — DONE.** The exterior solve already handles `αₖ > 1` (exponent `1−αₖ ∈ (−1,0)` is
  singular but integrable via the Gauss–Jacobi panel; an L-shape converges to residual ~1e-12). Added an
  L-shape preset.
- **Adaptive truncation — DONE.** Reentrant/sharp corners give algebraically-decaying coefficients (an
  L-shape's `|c₁₄₀|/max ≈ 1.7e-3` vs a square's `1e-17`). `polygonMap` extracts at a geometry-aware order
  (200 convex / 400 reentrant) then trims to the last coefficient above `tailTol·max`, keeping `≥ minOrder`
  for Faber-degree coverage — a sharp boundary either way.
- **Corner-norm annotations — DONE.** `cornerNorms(angles)` → `Λₖ = max{αₖ, 2−αₖ}` (Miña-Díaz–Rubin–Wennman
  2025), shown as `max corner-norm Λ = …` in the readout on polygon domains; computed from the angles alone.
- **Solver hygiene (review) — DONE.** The damped Gauss–Newton loop is extracted to a shared
  `dampedGaussNewton` (interior + exterior), the exterior closure residual is normalized by `Σ|1−αₖ|` so the
  ‖F‖∞ tolerance means the same for both residual families, and `polygonMap` returns the fit's
  `converged`/`degraded`/`residual` (a bad fit is no longer discarded).
- **Draggable-vertex polygon editor — DONE.** A "Custom polygon" domain opens an editor canvas
  (`render/polygonEditor.ts`): drag vertices to shape K, ＋/－ vertex (the add offsets outward so the new
  vertex is a genuine corner, not a degenerate straight one), reset. The fit runs on drag-release / button
  (not every pointer-move), so the SC solve isn't hammered; vertices serialize in the `#vs=` permalink
  (bounded 3–16 verts, coords ≤ 20), the K-panel frames to the fitted boundary, and the editor shows the
  fit's `converged`/`degraded` status (the runtime home for the honesty signal). The domain is designed up
  to similarity — the right panel renders the canonical K, exactly as the polygon presets do.
- **Solver seed-robustness (found by the editor) — DONE.** A valid convex hexagon could stall the single
  cold-start Gauss–Newton for some cyclic vertex orderings; the exterior solve now tries multiple seeds
  (a side-length-proportional gap seed + the uniform cold start), keeping the lowest-residual result — every
  cyclic rotation now converges (regression-tested).

M2 is complete; **M3** (corner-suppressing weighted Faber `Q_{n,m}`) is de-risked (spike below) and next.

### M3 — Corner-suppressing weighted Faber `Q_{n,m}`

**Construction (Miña-Díaz–Rubin–Wennman 2025, eq. 1.9–1.10).** `Q_{n,m}` = polynomial part of
`G_m(z)·φ(z)ⁿ`, where `G_m(z) = ∏ₖ (1 − φ(zₖ)/φ(z))^{1/m}` is analytic in Ω with `G_m(∞)=1`. It has the
same degree `n` and leading coefficient `cap⁻ⁿ` as `Fₙ` (still a valid trial polynomial, `Wₙ ≤ ‖Q_{n,m}‖`),
but suppresses the corner overshoot: `limsup ‖Q_{n,m}‖ → 1` as `m → ∞`. `m` is a small-integer strength knob.

**Key simplification — no new numerics.** Writing `G_m = Σⱼ gⱼ·φ(z)⁻ʲ`, the polynomial part splits
term-by-term:

  **`Q_{n,m}(ζ) = Σ_{j=0}^{n} gⱼ · F_{n−j}(ζ)`**   (`F_j = 0` for `j<0`, `F₀ = 1`)

— a finite linear combination of the Faber polynomials the app already builds. Every ingredient exists:
the `F_{n−j}` from `faberPolynomials`; the `gⱼ` as a product of generalized-binomial series
`(1 − wₖ·s)^{1/m}` (the same `@cas/core` series machinery the M1b Laurent extractor uses); and the corner
images `wₖ = φ(zₖ)` — which **are the exterior-SC prevertices' reciprocals**, `wₖ = 1/uₖ`.

#### M3.0 de-risk spike — findings (DONE)
Built `Q_{n,m} = Σ gⱼ F_{n−j}` from `fit.prevertices` and sampled `|F_n|` / `|Q_{n,m}|` along `∂K` at `n=40`
(`scratchpad/qnm-spike.test.ts`). All three claims confirmed:
- **(A)** `wₖ = 1/uₖ` lies on `|w|=1` to machine precision (`max ‖1/uₖ|−1| = 0` square / `2.2e-16` L-shape) —
  the weight is built from data the M1b solve already returns; no new solve.
- **(B)** the convolution builds cleanly with `g₀ = 1.000` (so `G_m(∞)=1`, degree and leading coeff preserved).
- **(C)** the corner peak is suppressed **monotonically in `m`**. `|F₄₀|` peak on `∂K`: **square 1.478**
  (≈ `λ = 3/2`, independently confirming the eq-1.7 corner limit) → `Q,m=8` **1.093** (toward the smooth-arc
  floor 1); **L-shape (reentrant) 1.550** → `Q,m=8` **1.324**.

Two findings that shape the UI:
1. **`m=1` makes it worse** (exponent 1 is too aggressive: square `2.001`, L-shape `7.392`) — the useful range
   is **`m ≥ 2`**; the slider starts at 2.
2. **Reentrant corners need larger `m`** (the L-shape only dips below `|Fₙ|` at `m ≈ 8`) — consistent with
   reentrant being the hard case; the UI should honestly note suppression is milder there at fixed `m`.

Gate passed: M3 rides entirely on existing primitives — no new package, no new numerics.

#### M3 build steps
- **M3.1 — engine (`@cas/faber`) — DONE.** `weightSeries(cornerImages, m, N)` + `weightedFaberPolynomial(map,
  cornerImages, n, m)` + a batch `weightedFaberPolynomials` (the validated spike helpers), pure + unit-tested
  (9 tests: `g₀=1`, no-corner reduction `Q=F`, degree/leading-coeff preservation, the explicit convolution).
- **M3.2 — app wiring — DONE.** `PolygonMapResult` and the polygon presets expose the corner images
  `wₖ = 1/uₖ` (regular n-gon: closed-form roots of unity; arbitrary/custom: from the fit); a "suppress
  corners" toggle + `m` slider (2–8) show for polygonal domains + monomial input only; monomial inputs route
  through `Q_{n,m}` (badge stays `≈`, readout shows `Q_{n,m}(w) = …`); the toggle + `m` round-trip in the
  `#vs=` permalink (guarded). Browser-verified on the square (toggle → flatter K-image, `w¹²` leading term
  preserved; toggle hidden for pole/expr inputs).
- **M3.3 — before/after demo.** Overlay `|Fₙ|` vs `|Q_{n,m}|` along `∂K` (paper Fig. 2 style), reusing the
  M2 corner-norm annotations.

Still `≈`-labeled (rides the truncated SC map — an approximation-quality gain, not an exactness one). The
old "optional lightning fast-mode" is dropped from M3 (unrelated to `Q_{n,m}`, low-value now the multi-seed
solver is robust) and left as a standalone deferred item.

## 6. Integration details & honesty guardrails

- **`ExteriorMap.c` is real** — rotate the prevertices so `C` is real-positive (standard SC normalization);
  no contract change.
- **Everything from a polygon is `≈`** (truncated Laurent + numerical solve). The exact-rational-image path
  still *runs* on the truncated map, but the map is approximate — so the app's `=` badge must **downgrade to
  `≈`** for polygon domains even for rational `f`. This is the one place the existing exact/approx branch
  needs to become domain-aware.
- A truncated `φ` needn't be exactly univalent; the render stays meaningful, labelled `≈`.
- **Dependency direction** stays clean: `@cas/conformal → @cas/core`; the app adds `@cas/conformal` to its
  deps. The exterior map + extractor live in `@cas/conformal`, cohesive with the SC machinery they extend
  (single-consumer for now, same extract-ahead judgement as ADR-0018 for `@cas/conformal` itself).

## 7. Risk & effort (retrospective)

The risk sat, as forecast, in **M1b** (the general exterior parameter solve — classical per
Driscoll–Trefethen Ch. 4, but a real nonlinear solver; reentrant corners are where conditioning bit). M0
de-risked M1a to ~zero: regular polygons were closed-form and validated up front. Both landed — M1a as a
same-day vertical slice, then M1b + M2 — with the nonlinear solve made robust by the multi-seed damped
Gauss–Newton driver (a single cold start stalled on some cyclic vertex orderings). **M3** (corner-suppressing
weighted Faber `Q_{n,m}`, optional lightning fast-mode) remains.

## 8. References

- T. A. Driscoll & L. N. Trefethen, *Schwarz–Christoffel Mapping*, Cambridge Univ. Press, 2002 — Ch. 4
  (exterior maps): the `φ'(z) = C ∏ (1 − zₖ/z)^{1−αₖ}` formula and the exterior parameter problem.
- E. Miña-Díaz, O. Rubin, A. Wennman, *Norms of Chebyshev and Faber polynomials on curves with corners and
  cusps*, arXiv:2509.22588 (2025) — the corner bound `Λₖ = max{αₖ, 2−αₖ}` and corner-suppressing weighted
  Faber polynomials `Q_{n,m}` (M2/M3).
- Logarithmic capacity of the square: `cap = s·Γ(1/4)²/(4π^{3/2})` (κ₄ ≈ 0.5901703) — the M1a golden.
- Existing in-repo: `docs/design/schwarz-christoffel-plan.md`, `schwarz-christoffel-research-notes.md`
  (the interior SC engine this extends); `@cas/dynamics` `rationalLaurentAtInfinity` (the Laurent-at-∞
  precedent).
