# Agent 07 — Quadrature Domains (`apps/quadrature-domains`) findings

**Scope.** The largest app in the suite (~58k non-test + ~12k test `.mjs`, vanilla-JS/allowJs). Per the
brief I targeted the math hotspots and spot-checked the rest: (1) the **convention edge** (`dA = dx dy/π`,
`1/(2πi)`) and the interchange export tagging; (2) the **least-squares / cusp-Newton solver**
(`solver.mjs` houseQR/condEst divergence from `@cas/core`); (3) `sym-core.mjs` exact algebra;
(4) the **Schwarz function** + the QD families (`schwarz-common/forward/inverse`); (5) test-coverage
gaps; plus share-link back-compat and honest labeling. I did **not** deep-audit the algebra tab
(`algebra-*.mjs`, `prove-plan.mjs`), the Gröbner/FGLM/GVW machinery inside `sym-core`, the WebGL/sphere
renderers, or the individual family solver kernels beyond the shared `solver.mjs` core — see Coverage.

Headline: the **export convention is correct and well-golden-tested** (a genuine strength), and the
Schwarz family algebra I checked by hand is correct. The real issues are (a) a **dual meaning of "M₀"**
across subsystems that undermines the ADR-0006 π-defense at the doc level, (b) a **holomorphic Newton
applied to the anti-holomorphic σ** in the cycle finder, and (c) an un-consolidated **near-duplicate of
`@cas/schwarz`**.

---

### [MEDIUM] `observables.mjs` computes GEOMETRIC moments but labels them "QD harmonic moments" — the exact π-ambiguity ADR-0006 exists to prevent
- **Area:** apps/quadrature-domains · **Location:** `app/analysis/observables.mjs:36-38` (doc) and `:142-155` (code); cf. `app/qd/qd-equations.mjs:743-747`
- **Type:** convention / stale-doc
- **Confidence:** high · **Fix-safety:** needs-review (doc-only fix is safe, but the label choice is the substance)
- **Evidence:** `observables.mjs` computes `M_k = ½ Σ w^k·conj(w)·φ′·z·Δθ` (line 145-155) — this is the
  **standard** area moment `∬_Ω w^k dx dy` (I verified the Stokes derivation; `Re(M_0) = signedArea`,
  the geometric area). The disk oracle confirms the convention: `thesis-examples.mjs:58` sets
  `M0: Math.PI` and `observables.test.js:46` locks `M₀.re ≈ π` — i.e. **unit-disk M₀ = π (geometric)**.
  But the docstring (line 37-38) calls these "the Hele-Shaw / QD **harmonic moments**". The **solver's**
  own point-functional formulation uses the app convention — `qd-equations.mjs:743` "area measure
  normalized so π→1", giving `M₀ = Σ_k k|w_k|²`, which for the disk (`w₁=1`) is **M₀ = 1**. So the
  symbol "M₀" means **π** in `observables`/thesis-oracle and **1** in `pointFunctionalSystem` — they
  differ by exactly the factor of π that ADR-0006 calls the "silent factor-of-π" landmine.
- **Why it matters:** No *active* miscalculation today — I traced the consumers of
  `boundaryObservables().moments` (`ui-solve.mjs:768`, `ui-domain-plot.mjs:1031`, `thesis-examples.mjs:171`,
  all display/geometric-oracle) and none feed the normalized-convention solver, so the two never cross.
  But the mislabel *is* the ADR-0006 defense failing at the doc layer: a future consumer wiring
  `observables.moments` into a π→1 path (or a user comparing the geometry card's M₀ to a solver M₀) hits
  a silent factor-of-π. For a research tool whose worst failure mode is silent wrongness, the naming
  should be loud.
- **Recommendation:** In the `observables.mjs` docstring, state explicitly that these are the **geometric
  (standard `dA = dx dy`) moments**, equal to **π × the app's π→1 harmonic moments**; drop or qualify
  "QD harmonic moments". Optionally add a one-line note in `qd-equations.mjs` cross-referencing the two
  M₀ conventions. Concrete guard test: assert `boundaryObservables(disk).moments[0].re ≈ π` AND
  `pointFunctionalSystem`-reconstructed disk has normalized `M₀ ≈ 1`, in one file, with a comment naming
  the π factor — so the divergence is visible in one place.

---

### [MEDIUM] `findCycles` runs a holomorphic-style Newton on σⁿ, but σ is ANTI-holomorphic (and n=1 "fixed points" are non-isolated)
- **Area:** apps/quadrature-domains · **Location:** `app/schwarz/schwarz-forward.mjs:147-266` (Newton at `:202-213`)
- **Type:** numerical
- **Confidence:** medium (reasoned; I could not execute) · **Fix-safety:** needs-review
- **Evidence:** `findCycles` solves `G(w) = σⁿ(w) − w = 0` by Newton, computing the derivative from a
  **single real-axis** finite difference and treating it as a complex derivative:
  `sNh = sigmaN({re: w.re + h, im: w.im})`, `fpR = (sNh.re−sN.re)/h − 1`, `fpI = (sNh.im−sN.im)/h`,
  then complex-divides `step = −G/G_x` (`:205-210`). That is exact Newton **only if σⁿ is holomorphic**.
  But σ is a Schwarz reflection, `σ(w) = conj(F(ψ(w)))` — **anti-holomorphic** (`schwarz-common.mjs:1113`
  returns `conj`). So σⁿ is holomorphic only for **even** n; for **odd** n (including **n=1**) the
  single-column difference is not the true real Jacobian and the step is a wrong linearization.
  Worse, σ fixes ∂Ω **pointwise** (on ∂Ω, `S(w)=conj(w)` ⇒ `σ(w)=w`), so the n=1 fixed-point set is the
  **entire boundary curve** — non-isolated — where `G′ = σ′−1` is singular in the tangent direction, and
  isolated-root Newton is degenerate. The interior grid seeds (`:189-194`) that don't leave Ω can only
  drift toward boundary samples and be reported as "period-1 cycles".
- **Why it matters:** The code comment (`:142-145`) hedges ("advisory", "spurious convergence") but
  claims "n=1 (fixed points) is typically reliable" — which is the *least* reliable case. And the UI
  surfaces a plain count (`schwarz-ui.mjs:783` `schwarz-cycle-count`) with **no advisory/≈ caveat**,
  so an exploratory-and-questionable result reads as a definite one (honest-labeling guardrail).
- **Recommendation:** For fixed points, don't Newton on σ directly — either (a) use the full 2×2 real
  Jacobian of `G`, or (b) exploit that period-2k points solve the **holomorphic** `σ²ᵏ(w)=w` and recover
  odd periods by filtering. Add an "≈ advisory" caveat to the cycle-count UI. Concrete test: on the
  deltoid, seed near ∂Ω and confirm n=1 "cycles" are just boundary samples; separately verify genuine
  period-2 points via `σ²(w)=w` (holomorphic, well-posed) and check `findCycles(n=2)` agrees.

---

### [MEDIUM] Consolidation: `@cas/schwarz`'s bounded / unbounded-Laurent engines are near-duplicates of QD's `schwarz-common.mjs` — a real ADR-0007 second consumer that was never rewired
- **Area:** apps/quadrature-domains ↔ packages/schwarz · **Location:** `app/schwarz/schwarz-common.mjs` (adapters + `branchSchwarzContribution` `:286-300`, `sigmaInverse`) vs `packages/schwarz/src/{bounded,unbounded-laurent,branches,preimage-tree,limit-set,forward}.ts`
- **Type:** consolidation (ADR-0007 — second consumer *exists*)
- **Confidence:** high (duplication is real) · **Fix-safety:** needs-review (large refactor; do not auto-apply)
- **Evidence:** `@cas/schwarz` was extracted for CD + Correspondences to reconstruct σ. Its
  `bounded.ts:5` documents `F(z) = conj(w₀) + Σⱼ Σₖ A_{j,k}/(z − z_j)ᵏ` — byte-for-byte the same kernel
  as QD's `adaptBounded`/`branchSchwarzContribution` (`schwarz-common.mjs:286-300, 363-367`), and it
  ships `preimage-tree.ts` / `limit-set.ts` / `forward.ts` that mirror QD's `buildPreimageTree` /
  `sampleLimitSet` / `iterateCurveForward`. Yet QD **does not depend on `@cas/schwarz`** (no import in
  `package.json` or `app/`). So the classical bounded + unbounded-Laurent subset is genuinely duplicated.
- **Why it matters:** The suite's north-star is "each tool builds fewer primitives than the last"; here
  QD (the *origin* of the σ math) kept a full private copy while the extraction serves only the two
  newer apps. Drift risk: a σ fix in one won't reach the other.
- **Recommendation:** This is a legitimate consolidation candidate, **not** a silent ADR-0008 non-merge
  (nothing documents a deliberate split). But QD's `schwarz-common` is a **superset** — it also carries
  LQD/PQD/singular adapters (`:459-987`) `@cas/schwarz` doesn't have — so a full merge is non-trivial.
  Recommend rewiring only QD's `boundedQD` + `unboundedQD` (+ the shared `preimage-tree`/`limit-set`)
  onto `@cas/schwarz`, leaving the weighted families in-app, and record the decision as an ADR
  (or, if the split is intentional, document it as such — right now it reads as forgotten duplication).

---

### [LOW] 81 `.mjs` files carry stale "twin of X.js (classic stays frozen)" headers — the classic `.js` twins were deleted in the ESM migration
- **Area:** apps/quadrature-domains · **Location:** header line 1 of ~81 files (e.g. `observables.mjs:1`, `schwarz-common.mjs:1`, `thesis-examples.mjs:1`, `ui-url-state.mjs:19`)
- **Type:** stale-doc
- **Confidence:** high · **Fix-safety:** safe-now (doc-only)
- **Evidence:** Every ESM module opens with `// ESM (Phase 2 port) — twin of <name>.js (classic stays
  frozen).` but the only non-test `.js` files left in `app/` are `test/bootstrap.js` and `test/harness.js`
  (test infra) — the classic twins no longer exist. `grep -rl "classic stays frozen"` → 81 files.
- **Why it matters:** Every one of these headers asserts a "frozen classic" reference file that a reader
  will look for and not find; it also implies the `.mjs` is a secondary copy when it is now the sole
  source.
- **Recommendation:** Bulk-strip the "twin of … (classic stays frozen)" clause (keep any real content
  after it). Pure comment edit.

---

### [LOW] `houseQR` "singular" gate is an ABSOLUTE `|diag|<1e-13` test (not a true rcond), and `condEst` is a diag-ratio that under-estimates the true condition number
- **Area:** apps/quadrature-domains · **Location:** `app/solvers/solver.mjs:215` (`QR_SINGULAR_TOL`), `:268-277` (`condEst`), `:305` (`backSolve` throw)
- **Type:** numerical
- **Confidence:** medium · **Fix-safety:** needs-review
- **Evidence:** `rank`/`backSolve` compare `|diag[k]|` to a fixed `1e-13` absolute, and
  `condEst = max|diag| / min|diag|` (line 277). The documented divergence from `@cas/core`
  (`packages/core/src/lstsq.ts:54` zero-fills at `1e-300`; QD **throws** at `1e-13`) is confirmed and
  correctly matches CLAUDE.md — good. But: (a) an absolute pivot tolerance means a **uniformly
  small-scaled yet well-conditioned** Jacobian (all `|diag|~1e-11`) would spuriously throw "singular";
  CLAUDE.md/comments frame this as "rcond ~1e-13", which is imprecise — it is not a *reciprocal
  condition* test. (b) `max|diag|/min|diag|` is only a lower-bound proxy for cond(R), so the
  `condEst`-keyed triggers (`ILL_COND_REFINE_THRESHOLD=1e6` line 325, `CENTRAL_DIFF_COND_TRIGGER=1e5`
  line 339) can **under-fire** on a genuinely ill-conditioned matrix whose diagonal ratio is modest.
- **Why it matters:** Both effects only degrade the *accuracy-optimization* path (Newton still gates
  success on `Fnorm < tolerance`, `:548`), so no wrong "success" is emitted — hence LOW. But near a cusp
  (the exact regime these thresholds target) the under-estimate could delay the central-difference
  upgrade. The label is honest ("cheap estimate", `:208`); the "rcond" framing elsewhere is the doc slip.
- **Recommendation:** Either scale the singular tolerance relative to `max|diag|` (a real rcond gate), or
  document that it is an absolute-pivot test that assumes O(1)-scaled QD Jacobians. Test: build a
  well-conditioned system pre-scaled by `1e-11` and confirm `solveLinearSystem` does not throw.

---

### [LOW] Newton singular-recovery perturbs with un-seeded `Math.random()` — a non-deterministic solve branch in a research/repro tool
- **Area:** apps/quadrature-domains · **Location:** `app/solvers/solver.mjs:586`
- **Type:** bug (reproducibility) · **Confidence:** high · **Fix-safety:** needs-review
- **Evidence:** On a singular Jacobian, recovery nudges the iterate by
  `(Math.random() − 0.5) * noiseScale` (`:585-586`). `noiseScale` is bounded and the event is recorded
  in `recoveryEvents` (`:593`, honest telemetry), but the RNG is process-global and unseedable.
- **Why it matters:** Two runs on the same near-cusp input can converge to different roots / take
  different iteration counts, which is awkward for a tool whose figures are meant to be reproducible, and
  can make any test that exercises this path flaky.
- **Recommendation:** Thread an optional seeded RNG through `options` (default to `Math.random` for back-
  compat) so the recovery path is deterministic in tests and reproducible research runs.

---

### [LOW] Share-link uses `#vs=` (`@cas/interchange`) with no legacy-format fallback — verify against pre-monorepo QD links
- **Area:** apps/quadrature-domains · **Location:** `app/ui/ui-url-state.mjs:114,127`
- **Type:** bug (back-compat) / test-gap · **Confidence:** low (could not verify a prior format existed) · **Fix-safety:** needs-review
- **Evidence:** `writeUrlState` encodes via `encodeViewState('qd', s)` → `#vs=…`; `applyUrlState` only
  reads `decodeViewState(location.hash)` and returns `false` for anything else. No legacy decoder is
  present. QD correctly has **no** `#s=` import path (it is the σ/φ *exporter*; CD is the importer) —
  that separation is right. The guardrail is "preserve or migrate each app's existing share-link URL
  formats." I could not confirm whether pre-monorepo QD (vanilla JS) shipped a different hash format.
- **Why it matters:** If any older QD share format exists in the wild, those links now silently no-op
  (fall through to the default-config solve) rather than restoring state.
- **Recommendation:** Confirm against the `QD_SRC` pre-migration source what hash format (if any) shipped;
  if a legacy format existed, add a compatibility decoder or record in the migration notes that old links
  are intentionally dropped.

---

### [NIT] Confirmations / non-findings worth recording
- **Export convention is CORRECT and well-tested (strength).** `schwarz-export.mjs` tags φ/σ payloads
  `conventions: CANONICAL`, and `schwarz-export.test.ts:52,97` pins `{area:"standard", contour:"standard"}`
  with cross-app **byte goldens** (`QD_TO_CD_DELTOID_LINK`, `…_SIGMA_LINK`, single-pole, bounded-lobe).
  φ is a geometric map so "standard" is the right tag (no double-π on the CD side). The pole-free wire
  stays byte-identical (`:36-40`, tested `:208`). This is the ADR-0006 boundary done right.
- **Schwarz family algebra verified by hand.** I checked `blaschkeSchwarz` (`schwarz-common.mjs:623-632`)
  against `b#(z)=conj(b(1/conj z))` and `rHashAtInfinity` (`:640-656`) against `u_j(∞)=−1/conj(z_j)` —
  both correct. The σ = `conj(F(ψ(w)))` wrapper and disk-side `acceptZ` (`:1097-1114`) are consistent.
- **`sym-core.mjs` foundational exact arithmetic is correct** (Rational/Gaussian/MPoly ops, `:80-279`),
  and the fraction-free Bareiss determinant has a Laplace cofactor **oracle cross-check**
  (`mpolyDetLaplace`, `:560`) — I did not exhaustively audit Gröbner/FGLM/GVW/triangularize.
- **Prior finding `qd-ui-algebra-badge-01` is FIXED.** `showQDSolution` now threads `rigor` +
  `univalenceCertified` (`ui.mjs:1600-1604`) and `qdValidityBadge` emits
  "⚠ … univalence ≈ estimated, not certified" for the non-exact case (`ui-solve.mjs:42-44`). No regression.

---

## Coverage

**Examined closely (read in full or near-full):**
- Convention edge: `analysis/observables.mjs` (whole), `qd/qd-equations.mjs:720-840` (the moment-identity /
  π→1 derivation + `pointFunctionalSystem`), and the interchange **export** path `schwarz/schwarz-export.mjs`
  (whole) + its test `vitest/schwarz-export.test.ts` (whole) + `app/test/observables.test.js` +
  `analysis/thesis-examples.mjs:1-70`.
- Solver core: `solvers/solver.mjs:195-723` (houseQR, solveLinearSystem, `_qrIterativeRefine`,
  `leastSquaresWithCond`, `solveLeastSquares`, `numericalJacobian`, `newtonSolve` incl. Armijo/deflation/
  disk-clamp/central-diff-upgrade/singular-recovery, `isBoundaryUnivalent`). Cross-checked the documented
  divergence against `packages/core/src/lstsq.ts`.
- Schwarz function: `schwarz/schwarz-common.mjs` (whole, all 8 family adapters), `schwarz-forward.mjs`
  (whole), `schwarz-inverse.mjs` (whole).
- `sym/sym-core.mjs`: header + `:80-279` (Rational/Gaussian/MPoly/monomial ops), elimination-layer map
  `:505-577` (Bareiss + Laplace oracle) — **spot-check only**.
- Share-link: `ui/ui-url-state.mjs` (whole); badge honesty in `ui/ui.mjs:1583-1608` + `ui/ui-solve.mjs:35-47`.

**NOT examined (honest gaps):**
- The **algebra tab** (`algebra/algebra-ui.mjs` 4.6k lines, `algebra-store.mjs` 3.1k, `prove-plan.mjs`,
  `cas-export.mjs`) beyond the badge hand-off and export formatter headline.
- The **Gröbner / FGLM / GVW / triangularize / zero-dim / realSolutionCount** interior of `sym-core.mjs`
  (~5k of its 6k lines) — only foundational arithmetic + Bareiss were checked. Its tests
  (`sym-core.test.js`, `sym-radical.test.js`, `algebra-store.test.js`) exist but I did not assess their
  golden depth.
- The individual **family solver kernels** (`solver-uqd*/-lqd*/-pqd*/-cmax/-continuation`, and `seeds/`) —
  I audited the shared `solver.mjs` engine they all call, not each family's residual/verifier/seeding.
  Note `sym-core`/solvers carry the prior review's known within-QD duplication (`continuationInC` ×3,
  finite-pole branch-Taylor ×8) — not re-investigated.
- **WebGL/GPU + sphere + param-slice + direct-tab** rendering (`schwarz-webgl.mjs`, `sphere-*`,
  `param-slice-*`, `direct-*`) — the σ CPU path was checked; the GLSL twin was not re-derived (prior
  review covered it).
- **Test-gap note for the math above:** export convention and the geometric-moment oracle are well
  golden-pinned; but the **σ forward-dynamics** (`findCycles`, `sampleLimitSet`, `boxCountingDimension`)
  have thin/no golden coverage for correctness (I found no test pinning cycle results against a known
  deltoid σ), which is where the anti-holomorphic-Newton finding lands. No cross-check test asserts the
  `observables` (geometric, M₀=π) vs `pointFunctionalSystem` (normalized, M₀=1) π-relationship in one place.
