# Agent 03 (CONF) — `@cas/conformal` + `apps/riemann-map` review

Heavy numerical review of the conformal-map engines (Vandermonde–Arnoldi basis, lightning
`f:Ω→𝔻`, forward `g:𝔻→Ω`, interior **and** exterior Schwarz–Christoffel: Gauss–Jacobi/
Golub–Welsch quadrature, compound subdivision, the parameter problems, forward/inverse maps,
Laurent-at-∞ extraction) and the Riemann-map consumer (`fitRegion` SC routing, pan-lock #264,
univalence). **Headline: I found no hard numerical bug.** The engine is genuinely well built and
validated against *independent* closed forms — mpmath-checked regular n-gon circumradii (40
digits), the square conformal radius `2/K(1/√2)=1.0787…`, the exterior square capacity
`√2·Γ(1/4)²/(4π^{3/2})`, and the exterior square Laurent `c₃=1/6` (matching
`φ'=(1−w⁻⁴)^{1/2}⇒φ=w+w⁻³/6`). The Gauss–Jacobi three-term recurrence and Golub–Welsch
eigen-tracking are faithful; the `d<ℓ/(3√2)` subdivision criterion is *tested* to control
crowding error; the exterior closure `Σ(1−αₖ)uₖ=0` correctly enforces the no-log residue
(`g₁=0`), and the gauge DOF counts (3 frozen logits interior, 1 exterior) are correct. Findings
below are documentation/consolidation/coverage, plus one subtle sign-convention landmine.

---

### [MEDIUM] `@cas/conformal` README lists the exterior SC engine as "deferred" though it is implemented & exported
- **Area:** packages/conformal · **Location:** `packages/conformal/README.md:75-77` (and API block :30-40, Consumers :79-87, Tests :89-105)
- **Type:** stale-doc
- **Confidence:** high
- **Fix-safety:** safe-now
- **Evidence:** README §API/Tests describe only the interior engine, and the roadmap line reads
  *"Deferred (roadmap): CRDT … , **exterior/unbounded/circular-arc variants**, and `@cas/interchange`
  serialization."* But the exterior engine landed in #279 and is fully exported from
  `src/index.ts:26-29` (`buildExteriorForwardMap`, `exteriorSideIntegrals`,
  `exteriorMapLaurentAtInfinity`, `solveExteriorParameterProblem`, `fitExteriorSchwarzChristoffel`),
  with three dedicated test files (`exteriorSchwarzChristoffel.test.ts`,
  `exteriorScParameterProblem.test.ts`, `exteriorMapLaurent.test.ts`) and a live consumer
  (`apps/faber-transform/src/polygon.ts:18,111,116`). The README's Consumers section omits Faber
  Transform entirely.
- **Why it matters:** The package's own front-door doc materially understates what it contains —
  a reader looking for an exterior map would conclude it must be built, and the "second consumer"
  narrative (Consumers §) misses the exterior engine's actual consumer.
- **Recommendation:** Add an exterior-SC subsection to §API and §Tests, list Faber Transform under
  §Consumers, and move exterior maps out of the "Deferred" line (leave CRDT/circular-arc/interchange).

### [MEDIUM] Corner-clustered boundary sampling + exponential pole placement is triplicated (real ADR-0007 case)
- **Area:** apps/riemann-map, packages/conformal · **Location:** `apps/riemann-map/src/domains.ts:68` (`cornerBoundary`) + `:87` (`cornerPoles`); `packages/conformal/src/scMap.ts:112` (`sampleBoundary`), `:132` (`outwardDirs`), `:146` (`cornerPoles`); `packages/conformal/src/forwardMap.ts:35` (`forwardPoles`)
- **Type:** consolidation
- **Confidence:** high
- **Fix-safety:** needs-review
- **Evidence:** The root-exponential corner-clustering law `rho = L·exp(−σ·(√N − √k))` appears
  verbatim in three places (`domains.ts:100`, `scMap.ts:150`, `forwardMap.ts:40`), as does the
  outward-direction heuristic (angle-bisector + a `pointInPolygon` flip: `domains.ts:94-98` vs
  `scMap.ts:132-143`) and the Chebyshev-density edge sampling (`domains.ts:75` `0.5*(1−cos(πk/perEdge))`
  vs `scMap.ts:119`). These are two genuine consumers — the app's Ω→𝔻 lightning fit and the
  package's fast-mode lightning fit — so this satisfies ADR-0007's second-consumer rule (not
  speculative).
- **Why it matters:** A tuning change to the pole cluster (σ, the √-spacing, the outward test) must
  be made in ≥3 spots or the app's Ω→𝔻 map and the package's `fast` mode silently diverge — exactly
  the "fix lands on one copy" trap the prior review documented for QD.
- **Recommendation:** Export a small shared primitive from `@cas/conformal` — e.g.
  `clusteredCornerPoles(vertices, {nPer, sigma})` and `clusteredBoundary(vertices, perEdge)` (the
  lightning method's own machinery) — and have `domains.ts`, `scMap.ts`, and `forwardMap.ts` consume
  it. `forwardPoles` differs only in placing poles *outside* ∂𝔻 vs outside ∂Ω, so parametrize the
  side.

### [MEDIUM] Precise-mode `degraded` crowding wall is never tested true; SC `inverse` has no honest failure signal
- **Area:** packages/conformal · **Location:** `scParameterProblem.ts:156` / `exteriorScParameterProblem.ts:149` (`degraded: minGap(pv) < 1e-6`); `schwarzChristoffel.ts:43-65` (`invertMap`)
- **Type:** test-gap
- **Confidence:** medium
- **Fix-safety:** needs-review
- **Evidence:** (a) The only polygon in the corpus that trips `degraded` is the *fast*-mode L-shape
  (`scMap.test.ts:56-59`, `fast.degraded===true`). Every **precise** assertion is `degraded===false`
  (`scMap.test.ts:18`, `scParameterProblem.test.ts:38`). No strongly reentrant / elongated / slit
  polygon exercises the precise crowding wall, so there is no evidence the `minGap<1e-6` threshold
  actually trips *before* the forward/side integrals silently lose accuracy — the honest-labeling
  guardrail for crowding is unverified on the precise path. (b) `invertMap` runs a fixed 40-step RK4
  + ≤20 Newton iterations and `return w` unconditionally (`schwarzChristoffel.ts:59-64`): the `<1e-13`
  Newton check only `break`s, there is no `converged` flag and no check that `z` is inside the
  polygon. A point outside Ω, or a Newton stall near a corner, returns a wrong preimage with no ≈/⚠
  marker. (The app currently only calls `sc.forward` — `main.ts:505` — so this is a package-API
  robustness gap today, not a live app defect.)
- **Why it matters:** "degrade honestly on strongly reentrant polygons" is an explicit design claim
  (ADR-0020, CLAUDE.md); it is asserted for fast mode but not the precise mode that is *supposed* to
  be the reentrant path. The silent inverse is a latent honesty hole for any future consumer.
- **Recommendation:** Add a crowded golden (e.g. a thin L / a narrow-neck hexagon / a near-slit
  quadrilateral) asserting precise `degraded===true` **and** that `residual` reflects the true map
  error there. Give `invertMap`/`SCForwardMap.inverse` a `converged` boolean (or throw) when the
  Newton residual stays above tol, and surface it in `scMap`.

### [LOW] Exterior map leading coefficient is −C, not +C, as the comments state (capacity magnitude is fine)
- **Area:** packages/conformal · **Location:** `exteriorSchwarzChristoffel.ts:11` (header) and `:91` (the `constant` field doc)
- **Type:** convention
- **Confidence:** high (on the math)
- **Fix-safety:** safe-now
- **Evidence:** The map sets `Ψ'(u) = C·full(u)`, `full = u⁻²·∏(1−u/uₖ)^{1−αₖ}` (`:56-58`). Near
  `u=0`, `Ψ(u) = ∫C·u⁻²·(1+…)du ≈ −C·u⁻¹ = −C·z`, so **φ(z) ~ −C·z** as z→∞ — but the header and
  field doc both assert *"φ(z) ~ C·z at ∞"*. The `exteriorMapLaurentAtInfinity` derivation is itself
  consistent with −C: it takes `c=|C|` as the (rotated-to-real) leading coefficient and
  `laurent[k] = −|C|·g_{k+1}/k` (`:183`), which is exactly `+C·g_{k+1}/k` after rotating the leading
  −C to +|C| — and the square golden `c₃=+1/6` (`exteriorMapLaurent.test.ts:34`) confirms that sign
  bookkeeping is right. So the code is correct; only the two comments are sign-wrong.
- **Why it matters:** Not a functional bug: when `targetVertices` are supplied (the only real path,
  `exteriorScParameterProblem.ts:173`) `C=(v₁−v₀)/S₀` is re-fit to reproduce the polygon, and the
  Faber consumer reads the rotation-handled Laurent, never `.constant` (confirmed:
  `apps/faber-transform/src/polygon.ts` uses only `exteriorMapLaurentAtInfinity`). But the documented
  contract on `constant` ("the accessory constant C, φ(z) ~ C·z") is a landmine: a future consumer
  aligning rotation off `map.constant` would be off by π.
- **Recommendation:** Change both comments to "φ(z) ~ −C·z at ∞ (⇒ capacity = |C|)", or fold the sign
  into `constant` so it *is* the asymptotic leading coefficient.

### [LOW] `fitRegion` tags the reduced-quadrature SC polygon map "exact map" / "machine precision"
- **Area:** apps/riemann-map · **Location:** `apps/riemann-map/src/main.ts:497-517`
- **Type:** convention (honest-labeling)
- **Confidence:** medium
- **Fix-safety:** needs-review
- **Evidence:** The region SC fit is built with `{ nGaussLegendre: 12 }` (half the default 24, for
  interactivity), yet the card sets `tag: sc.converged ? "exact map" : …` and
  `desc: "The exact conformal map … machine precision …"` (`:514-517`). The
  `scQuadrature.test.ts` n=12 golden needed 24 nodes to reach 10 digits, so 12 nodes on a
  near-crowded region is a few digits short of "machine precision." The displayed `residual`
  *is* honest (≈, and `scMap` reports `max(paramResidual, vertexError)` so under-resolution is
  caught) — only the fixed tag/desc overclaim.
- **Why it matters:** The presets shipped (square/triangle/pentagon — regular, non-crowded) are fine
  at 12 nodes, so this is latent; but "exact / machine precision" next to a coarse-quadrature fit is
  the kind of label the guardrail warns against.
- **Recommendation:** Soften the desc to "≈ machine precision (subject to quadrature order)", or bump
  `nGaussLegendre` back toward 24 for the (small, one-off) region fit and keep the low order only for
  the per-pixel pushforward.

### [NIT] `jacobiPanel` rebuilds the Golub–Welsch eigenproblem on every panel call
- **Area:** packages/conformal · **Location:** `scQuadrature.ts:98-99`
- **Type:** style (perf)
- **Confidence:** high
- **Fix-safety:** needs-review
- **Evidence:** `const gj = gaussJacobi(nGJ, 0, ne.exponent);` runs the full symmetric-tridiagonal QL
  eigensolve inside `jacobiPanel`, which is invoked once per singular endpoint per side per residual
  evaluation. Across a damped-Gauss–Newton solve (finite-diff Jacobian × iterations × sides) this is
  many identical re-solves keyed only on `(nGJ, exponent)`.
- **Why it matters:** Pure overhead; correctness unaffected. Noticeable on the interactive
  `fitSchwarzChristoffel` path.
- **Recommendation:** Memoize `gaussJacobi` on `(n, a, b)` (or hoist the rule for each distinct corner
  exponent above the panel recursion).

### [NIT] `quadModulus` convention pinned only by the symmetric square
- **Area:** packages/conformal · **Location:** `scMap.ts:214-220`, test `scMap.test.ts:27`
- **Type:** test-gap
- **Confidence:** low
- **Fix-safety:** needs-review
- **Evidence:** `quadModulus` returns `AGM(1,√λ)/AGM(1,√(1−λ)) = K(k)/K'(k)` with `λ` the prevertex
  cross-ratio (`:218`). The only test is the square (`modulus≈1`), which is symmetric under `λ↔1−λ`
  and so does not disambiguate the `K/K'` vs `K'/K` orientation or the opposite-side-pair labeling.
- **Why it matters:** A non-square quadrilateral could report the reciprocal modulus with the square
  test still green.
- **Recommendation:** Add one rectangle golden (e.g. a 2:1 rectangle should give modulus 2 or 1/2 by
  a stated convention) to pin the orientation.

### [NIT] SC plan doc still lists exterior maps under "Deferred"
- **Area:** docs · **Location:** `docs/design/schwarz-christoffel-plan.md:301` (§8), also `:46-47`
- **Type:** stale-doc
- **Confidence:** low
- **Fix-safety:** safe-now
- **Evidence:** §8 lists *"Variants: exterior maps, unbounded polygons … deferred"*. This is a
  v1-scoped historical plan ("Status: v1 COMPLETE (Phases 0–3)") and the exterior engine landed under
  a *separate* plan (`faber-polygonal-sc-plan.md`), so it is defensible as a point-in-time record —
  but a reader cross-referencing it against the shipped code will be misled.
- **Recommendation:** Add a one-line "(exterior since landed — see faber-polygonal-sc-plan.md)" pointer
  at §8; lower priority than the README fix above.

---

## Coverage

**Examined in depth (read in full + cross-checked against tests and closed-form theory):**
- `gaussJacobi.ts` — Jacobi 3-term recurrence (α₀, αₖ, β₁, βₖ, μ₀) verified against standard
  formulas; Golub–Welsch first-eigenvector-component QL tracking verified faithful to `tqli`.
- `scQuadrature.ts` — compound `d<ℓ/(3√2)` subdivision, Jacobi/Legendre panel factors, branch
  consistency of the `(Δ/2)^{exponent+1}` mapping factor; confirmed the near-endpoint always coincides
  with the singularity `z0`.
- `scParameterProblem.ts` / `gaussNewton.ts` — interior angles (turn convention, Σαₖ=n−2), softmax
  gap parametrization + ordering-by-construction, 3-frozen-logit gauge (DOF = n−3), residual = n−1
  side-ratios (closure automatic via ∮f'=0), damped line search.
- `schwarzChristoffel.ts` — forward map, side-integral midpoint split, `integralToPrevertex`, and the
  ODE+Newton `invertMap`.
- `scMap.ts` — two-mode dispatch, `lightningFit`, `quadModulus`/`agm`, `areaCentroid`/`outwardDirs`.
- `exteriorSchwarzChristoffel.ts` + `exteriorScParameterProblem.ts` — the `u⁻²` pole integrand,
  exterior exponent `1−αₖ`, closure `Σ(1−αₖ)uₖ=0 ⟺ g₁=0` (verified equivalent to the residue
  condition), 1-frozen-logit gauge (correct: exterior automorphism group is 1-D), multi-seed
  robustness + NaN handling, and the **Laurent-at-∞ extractor** (generalized-binomial factor series,
  `cₖ=−|C|gₖ₊₁/k`, rotation-to-real, `g₁` drop) — verified against the square `c₃=1/6` closed form.
- `vandermondeArnoldi.ts`, `lightning.ts`, `forwardMap.ts` — Arnoldi MGS inner products, the real
  BVP `Re g=−log|z|` least-squares assembly, and the complex `g(uⱼ)≈pⱼ` real-stacked assembly.
- `apps/riemann-map`: `map.ts` (finite-diff derivative), `domains.ts` (ray-cast polygon radius,
  point-in-polygon, off-centre disk, ellipse polar form), `analysis/univalence.ts` (segment straddle
  + closed-loop wrap-around skip + downsample), `main.ts` `computeDomain`/`fitRegion`, `render/nav.ts`
  pan-lock (#264 verified correct: drag no-op + wheel-zoom-about-centre when region source).
- All 11 conformal test files + the relevant riemann-map tests were read to gauge the golden corpus.

**Not deeply covered (flag for another pass / lower relevance to the numerical scope):**
- `apps/riemann-map/src/interchange/importMap.ts` (CD→RM Böttcher `LaurentMap` import) — a different
  feature (ADR-0017 hand-off), only skimmed.
- `apps/riemann-map` UI/render plumbing: `ui/controls.ts`, `render/{grid,modes,overlay2d}.ts`,
  `presets.ts`, `viewState.ts` legend/nav wiring — not numerically central; not audited line-by-line.
- `@cas/core`'s `lstsqHouseholder` rank-deficiency behavior (it is relied on by a structurally-zero
  column — the imaginary part of the constant Arnoldi coefficient in `lightning.ts`, whose column is
  identically 0): correctness there is **another agent's scope**; lightning evidently works, so it is
  handled, but a `lightning`-specific rank-deficiency test would be worth confirming.
