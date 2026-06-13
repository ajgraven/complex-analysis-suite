# Theory → Code Map

This file is the bridge between the math in
[Andrew Graven's PhD thesis](Andrew_Graven_Thesis.pdf), *Weighted
Quadrature Domains and the Faber Transform* (Caltech, 2026), and the
specific code that implements each result. Equation labels match the
thesis.

Line numbers are accurate as of the P3 docs pass. If a file is edited,
the symbol name is the source of truth — search for it.

---

## Core inverse-problem identity (Theorem 3.2.2)

**Statement.** For a bounded simply connected QD with quadrature
function `h(w) = Σ Σ C_{j,s} / (w − a_j)^s`, the Riemann map φ : 𝔻 → Ω
satisfies

  φ(z) = w₀ + Φ_φ⁻¹(h)^#(z),

where Φ_φ⁻¹ is the inverse Faber transform and `f^#(z) = conj(f(1/conj(z)))`.

**Code.** The forward + inverse Faber primitives live in
[`app/solver-faber.js`](app/solver-faber.js):

| Symbol | Where | Maps to |
| --- | --- | --- |
| `QD.Faber.inverseFaberAtPole(residues, phiTilde)` | `solver-faber.js:60` | Per-pole inverse Faber transform yielding A_{j,k} |
| `QD.Faber.inverseFaberAtInfinity(polyPart, f, c)` | `solver-faber.js:109` | Inverse Faber at ∞ for h's polynomial part (unbounded families) |

The **forward** Faber polynomials F_n(ζ) of the complement K = ℂ∖Ω of a *classical
unbounded* QD are read off φ's Laurent expansion at ∞ (φ is the exterior map of K),
`φ(z) = c·z + c₀ + c₁/z + …`, via `F₀ = 1`, `F₁ = (ζ − c₀)/c`,
`c·F_{n+1}(ζ) = (ζ − c₀)·Fₙ(ζ) − Σ_{k=1}^{n} c_k·F_{n−k}(ζ) − n·cₙ` — used by the
**Faber-polynomials analysis card** (display + root plot). Oracles: disk ⇒ F_n = ζ^n,
interval [−2,2] ⇒ F_n = 2·T_n(ζ/2) (Chebyshev). Code in
[`app/faber-analysis.js`](app/faber-analysis.js):

| Symbol | Where | Maps to |
| --- | --- | --- |
| `QD.FaberAnalysis.faberPolynomials(phi, N)` | `faber-analysis.js` | F₀..F_N coefficient lists from the φ-Laurent recurrence |
| `QD.FaberAnalysis.polynomialRoots(coeffs, opts)` | `faber-analysis.js` | Complex polynomial roots (Durand–Kerner + Newton polish) |
| `QD.FaberAnalysis.faberConvergence(phi, N)` | `faber-analysis.js` | Per-order roots + convergence flag (high-degree conditioning) |

---

## The (★) and (●) system (Theorems 3.2.1, 3.2.2)

**Statement.** Writing ψ̃_j(t) = φ⁻¹(a_j + t) − z_j (the local
Taylor series of φ⁻¹), the inverse problem is

  **(★)** A_{j,k} = Σ_{s=k}^{m_j} (s/k) · C_{j,s} · [t^s] ψ̃_j(t)^k,
  **(●)** φ(z_j) = a_j,

for n+d complex unknowns (z_j, A_{j,k}), with d = Σ m_j.

**Code (bounded classical, Family.boundedQD).**

| Block | Symbol | Where |
| --- | --- | --- |
| Compute (★) RHS (the target A) | `computeTargetA_QD` | `solver-qd.js:93` |
| Build φ evaluation | `evalPhi_QD` | `solver-qd.js:36` |
| ψ̃ Taylor series | `phiTaylorAt_QD` | `solver-qd.js:57` |
| Full residual (block (★) ⊕ block (●)) | `residual_QD` | `solver-qd.js:114` |
| Pack/unpack to flat real vector | `packPhi_QD`, `unpackPhi_QD` | `solver-qd.js:142`, `:149` |
| Initial guess (disk seed) | `diskInitialGuess_QD` | `solver-qd.js:189` |
| Continuation along a_j(t) | `continuationSolve_QD` | `solver-qd.js:244` |
| Identity verifier (∂Ω test) | `verifyQuadratureIdentity_QD` | `solver-qd.js:322` |
| Register on registry | `QD.registerFamily('boundedQD')` | `solver-qd.js:427` |

The same shape repeats for every other family (`solver-uqd.js`,
`solver-lqd*.js`, `solver-uqd-lqd*.js`) — see
[CONTRIBUTING.md](CONTRIBUTING.md#adding-a-new-family) for how to add one.

### Symbolic generation of this system (`QD.QDEquations`)

The numeric solver assembles the (●)/(★)/gauge residual at floating-point values. A separate
**symbolic** track emits the same system as exact polynomials in the coefficients, feeding the
in-browser elimination / Gröbner reducer (the Algebra tab; an external-CAS / RCTD bridge is the
remaining future step). The Riemann-map center φ(0)=w₀ can be FIXED into the symbolic system as an
exact rational — `generateClassicalBounded(hData, {w0})` substitutes it and drops w₀/w̄₀ from the
inventory (`system.w0Fixed`); the UI defaults it to the centroid of the poles.

| Block | Symbol | Where |
| --- | --- | --- |
| Exact symbolic core (Rational/Gaussian/MPoly/RatFn/**FRatFn** + power series, Lagrange reversion) | `QD.Sym` | [`app/sym-core.js`](app/sym-core.js) |
| Generate `{(●), (★), gauge}` as cleared `MPoly = 0` (conjugate model over ℚ(i)) | `QDEquations.generateClassicalBounded` | [`app/qd-equations.js`](app/qd-equations.js) |
| Real/imaginary-split representation (`z_j = x_j+i y_j`, …) | `QDEquations.reimSplit` | `app/qd-equations.js` |
| Correctness oracle — every equation ≈0 at the numeric solution | `QDEquations.residualAtSolution` / `residualReimAtSolution` | `app/qd-equations.js` |
| LaTeX / CAS-agnostic export for display + reduction | `QDEquations.systemToLatex` / `systemToExport` | `app/qd-equations.js` |
| Display card (`#qd-equations-card`, classical bounded QD only) | `QD_UI.installQdEquations` | [`app/ui-qd-equations.js`](app/ui-qd-equations.js) |

The (★) block uses the **forward** form `C_{j,s} = Σ_{k=s}^{m_j} (k/s)·A_{j,k}·[t^k] φ̃_j(t)^s`
(the dual of the inverse-Faber statement above) — only `seriesPow`, no compositional inverse — and a
factored-denominator engine that never expands `(1−z̄_j z)`. Verified against the live solver and the
family `φ(z)=z+zⁿ/n ⇒ h(w)=((n+1)/n)/w+(1/n)/wⁿ`.

### Univalence constraints + interactive elimination (`QD.QDConstraints`, Algebra tab)

The Algebra tab lets the user ADD univalence constraints to the generated system and ELIMINATE
variables — pairwise by **resultant**, or across several equations / variables at once by **Gröbner
basis** (Phases 1–2 of the symbolic-reduction track; RCTD bridge is Phase 3). All exact over ℚ(i);
see arXiv:2001.09431 for the RCTD-of-QDs method this anticipates.

| Object | Symbol | Where |
| --- | --- | --- |
| Sylvester resultant / discriminant (fraction-free Bareiss) | `QD.Sym.resultant` / `discriminant` / `mpolyDet` | [`app/sym-core.js`](app/sym-core.js) |
| Monomial orders (lex/grlex/grevlex + block/elimination) + normal form + S-poly | `QD.Sym.monomialOrder` / `eliminationOrder` / `normalForm` / `sPoly` | [`app/sym-core.js`](app/sym-core.js) |
| Gröbner basis (Buchberger over ℚ(i): Gebauer–Möller + sugar; bit-packed kernel + content removal; reduced) + saturation `I:f^∞` | `QD.Sym.buchberger` / `reduceGroebner` / `saturate` | [`app/sym-core.js`](app/sym-core.js) |
| Signature-based Gröbner (GVW, POT; bit-identical, fewer S-pairs) — opt-in `buchberger(…,{signature:true})` | `QD.Sym.buchbergerSig` | [`app/sym-core.js`](app/sym-core.js) |
| Linear-substitution preprocessing (strip degree-1-with-constant-coeff variables, lift back) | `QD.Sym.linearReduce` (in `solveZeroDim`'s `preprocess` step) | [`app/sym-core.js`](app/sym-core.js) |
| Zero-dim toolkit: standard monomials / quotient dimension / solution count | `QD.Sym.standardMonomials` / `isZeroDimensional` / `quotientDimension` | [`app/sym-core.js`](app/sym-core.js) |
| FGLM (grevlex→lex) + shape-lemma numeric solving, with a Möller–Stetter **eigenvalue** fallback for non-shape-position ideals | `QD.Sym.fglm` / `solveZeroDim` / `solveByEigenvalues` / `multiplicationMatrix`; `QD.AlgebraStore.dimension` / `solve` | [`app/sym-core.js`](app/sym-core.js) |
| Off-main-thread Gröbner/solve (Web Worker, progress + cancel) | `QD.SymWorker` (via `Sym.runJob` / `MPoly.fromTermList`); `AlgebraStore.groebnerAsync` / `solveAsync` / `dimensionAsync` | [`app/algebra/sym-worker.js`](app/algebra/sym-worker.js) |
| Reality assumption (assert variables real → an appended labeled column; v̄→v post-conjugation) | `AlgebraStore.assumeReal(vars)` (or `seedFromSystem(…, {realVars, bakeAssumptions})` for the compact path) | [`app/algebra/algebra-store.js`](app/algebra/algebra-store.js) |
| Auto-reality: real-axis symmetry of h (w↦w̄) ⇒ assume all base vars real (the 478→118 collapse) | `QD.QDEquations.realAxisSymmetry(hData)` → Algebra "Auto" button | [`app/qd-equations.js`](app/qd-equations.js) |
| Audit-trail reductions (each appends a labeled column; column 0 = original): fix one/several values (exact ℚ(i), each also fixing the conjugate) + auto-propagate the linear cascade, fix φ(0)=w₀ | `AlgebraStore.substituteValue` / `substituteValues` / `reducePropagate` / `fixW0` | [`app/algebra/algebra-store.js`](app/algebra/algebra-store.js) |
| Triangular decomposition (Wu pseudo-elimination) — alternative eliminator; exhibits free vars / no-solution | `QD.Sym.pseudoRemainder` / `triangularize`; `AlgebraStore.triangularize` | [`app/sym-core.js`](app/sym-core.js) |
| Radical polynomial factorization (monomial + variable-separable via the mixed-partial test + univariate via verified numeric roots) → case-split a variety V(p)=⋃V(fᵢ) | `QD.Sym.factor`; `AlgebraStore.factorOf` / `applyFactor` ("Attempt to factor" → a `case fₖ=0` column) | [`app/sym-core.js`](app/sym-core.js) |
| Export a column / node / all columns as paste-ready Mathematica (Wolfram-Language list) | `AlgebraStore.mathematicaColumn` / `mathematicaNode` / `mathematicaAll` | [`app/algebra/algebra-store.js`](app/algebra/algebra-store.js) |
| Certified REAL-solution count (= #quadrature domains) via the Hermite trace form (signature=#real, rank=#complex; exact inertia over ℚ) | `QD.Sym.realSolutionCount` (`_rationalInertia`) | [`app/sym-core.js`](app/sym-core.js) |
| Existence / uniqueness verdict over the real (reim) system, known parameters pinned; explicit real solutions; semi-autonomous reduce+solve | `AlgebraStore.currentReimSystem` / `classify` / `solveReal`; Algebra "Existence / uniqueness" + "★ Auto-reduce & solve" | [`app/algebra/algebra-store.js`](app/algebra/algebra-store.js) |
| Certified univalence verdict (authoritative): regime (inconsistent / positive-dim ⇒ "fix the gauge" / zero-dim) + EXACT local fold (Schur–Cohn) + EXACT boundary-simple (real double-point count) + gauge quotient + numeric cross-check → # GENUINE quadrature domains | Algebra "Certify univalence" (`doCertifyUnivalence`) | [`app/algebra/algebra-ui.js`](app/algebra/algebra-ui.js) |
| EXACT count of a ℚ(i) polynomial's roots inside the unit disk (Hermitian Schur–Cohn matrix `C=A·Aᴴ−B·Bᴴ` + exact inertia; the local φ′≠0-in-𝔻 fold test) | `Sym.schurCohn` (+ `_hermitianInertia`); UI `schurCohnFold` | [`app/sym-core.js`](app/sym-core.js) |
| EXACT boundary injectivity: # real circle double points of φ(∂𝔻) (reim divided difference + circle quadrics → `realSolutionCount`; 0 ⇔ simple) | `QDConstraints.phiDividedDifference` / `boundaryDoublePointCount`; UI `boundarySimpleExact` | [`app/qd-constraints.js`](app/qd-constraints.js) |
| Same quadrature domain up to the rotation gauge (canonicalize φ′(0)>0 real, then compare) — the gauge quotient in the verdict | `sameDomain` / `canonicalizeByRotation` | [`app/solver.js`](app/solver.js) |
| Univariate resolvent χ_v(x)=det(x·I−M_v) + discriminant/degeneracy (cusp = repeated root) | `Sym.resolvent`; `AlgebraStore.resolventOf`; Algebra "Resolvent / discriminant" | [`app/sym-core.js`](app/sym-core.js) / [`app/algebra/algebra-store.js`](app/algebra/algebra-store.js) |
| Spurious-component detection: factor the positive-dim system, suggest a one-click pin/split | `AlgebraStore.spuriousFactors`; positive-dim verdict actions | [`app/algebra/algebra-store.js`](app/algebra/algebra-store.js) |
| Numeric-oracle cross-check of a genuine QD (residual vs the regenerated original system; `sameDomain` to the numeric solver) | UI `crossCheckPhis` (reuses `QDEquations.residualAtSolution`) | [`app/algebra/algebra-ui.js`](app/algebra/algebra-ui.js) |
| Interior point-functional QD system ∫f dA = M₀f(0)+M₁f′(0) (the Aharonov–Shapiro degree-2 formulation; reproduces the cardioid uniqueness) | `QDEquations.pointFunctionalSystem`; `AHARONOV_SHAPIRO.md` | [`app/qd-equations.js`](app/qd-equations.js) |
| Fixed φ(0)=w₀ remembered + substituted into later constraints (e.g. star form φ−w₀) | `AlgebraStore` `w0Fixed` / `seedFromSystem` (from `system.w0Fixed`) | [`app/algebra/algebra-store.js`](app/algebra/algebra-store.js) |
| Gröbner workspace op (selected/all equality nodes) | `QD.AlgebraStore.groebner` | [`app/algebra/algebra-store.js`](app/algebra/algebra-store.js) |
| φ, φ′, φ″ at a generic boundary point ζ | `QDConstraints.phiData` (reuses `phiSeriesAt` at ζ) | [`app/qd-constraints.js`](app/qd-constraints.js) |
| convex `Re(1+ζφ″/φ′)>0`, star `Re(ζφ′/(φ−w₀))>0`, spiral (∃λ) | `QDConstraints.convexIneq` / `starIneq` / `spiralIneq` | `app/qd-constraints.js` |
| local univalence φ′≠0 in 𝔻 (Schur–Cohn) + saturation witness | `QDConstraints.localUnivalence` | `app/qd-constraints.js` |
| geometric border (discriminant of the on-circle polynomial) | `QDConstraints.geometricBorder` | `app/qd-constraints.js` |
| global boundary injectivity `(φ(ζ₁)−φ(ζ₂))/(ζ₁−ζ₂)` | `QDConstraints.injectivity` | `app/qd-constraints.js` |
| equation-DAG store / SVG-KaTeX canvas / tab | `QD.AlgebraStore` / `QD.AlgebraCanvas` / `QD_UI.installAlgebra` | [`app/algebra/`](app/algebra/) |

Inequalities use the Hermitian numerator `Re(N/D) ∝ N·D̄ + N̄·D` (conjugate-variable bar); the circle
`|ζ|=1` is carried as a companion relation `ζζ̄−1=0`. Borders are `discriminant_ζ` of the on-circle
polynomial. Each generated object is verified numerically (`qd-constraints.test.js`) against the float
criteria in `univalence.js` and the known `φ=z+z²` boundary self-crossing.

---

## LQD families (Thesis Chapter V)

The Blaschke factor `b_{z_0}(z)` and its companion `r#(z)` form the
shared LQD machinery used by all four LQD families.

| Symbol | Where | Role |
| --- | --- | --- |
| `blaschkeEval(z, z0)` | `solver-lqd-common.js:52` | Standard Blaschke factor `(z − z_0) / (1 − conj(z_0) z)` |
| `blaschkeTaylor(zc, z0, L)` | `solver-lqd-common.js:65` | Taylor expansion of `b_{z_0}` at `zc` (length L+1) |
| `rHashLaurentAtInfinity(phi, L)` | `solver-lqd-common.js:132` | Laurent of `r#(z)` at z = ∞ |
| `blaschkeLaurentAtInfinity(z0, L)` | `solver-lqd-common.js:170` | Laurent of `ln(b_{z_0}(z))` at ∞ |
| `phiLaurentAtInfinity_UQDL(phi, L)` | `solver-lqd-common.js:204` | φ-Laurent at ∞ for unbounded non-singular LQD (HANDOFF #21) |
| `phiLaurentAtInfinity_UQDLS(phi, L)` | `solver-lqd-common.js:237` | φ-Laurent at ∞ for unbounded singular LQD (HANDOFF #22) |

---

## Theorem 5.3.2 (bounded LQD existence)

**Statement.** Ω ∈ QD₀(α/(w−w₀)) iff `0 < α ≤ π²`, with explicit form
`Ω = {|ln(w/w₀)|² < α}`; double-point at α = π².

**Code.** [`app/solver-lqd.js`](app/solver-lqd.js); presets that exercise
the bound at `LQD_PRESETS_BOUNDED` in
[`app/ui-presets.js`](app/ui-presets.js:88).

Tests covering the closed-form solutions live in
[`app/node-test.js`](app/node-test.js) (search for `Thm 5.3.2`).

---

## Theorem 5.6.2 (bounded singular LQD family)

**Statement.** Bounded LQD with `0 ∈ Ω`; q (the residue of h at 0) is
the family parameter. q = 0 is the degenerate edge case.

**Code (Family.boundedLQD_singular).**

| Block | Symbol | Where |
| --- | --- | --- |
| (★) target | `computeTargetA_LQDS` | `solver-lqd-singular.js:137` |
| φ evaluation | `evalPhi_LQDS` | `solver-lqd-singular.js:99` |
| ψ̃ Taylor | `phiTaylorAt_LQDS` | `solver-lqd-singular.js:109` |
| Residual (★ ⊕ ● ⊕ q-equation at 0) | `residual_LQDS` | `solver-lqd-singular.js:151` |
| Schema (pack/unpack via `packPhiBySchema`) | `SCHEMA_LQDS` | `solver-lqd-singular.js:273` |
| Initial guess | `initialGuess_LQDS` | `solver-lqd-singular.js:299` |
| Diverse seeds (Blaschke z₀ multistart) | `diverseInitialGuess_LQDS` | `solver-lqd-singular.js:463` |
| Identity verifier | `verifyQuadratureIdentity_LQDS` | `solver-lqd-singular.js:549` |
| Register on registry | `QD.registerFamily('boundedLQD_singular')` | `solver-lqd-singular.js:629` |

---

## Polynomial-h support for unbounded LQDs (HANDOFF #21, #22, #24)

These three handoffs derived and shipped the β / γ corrections that
extend polynomial-h support to unbounded non-singular / singular LQDs
and the higher-order-pole-at-origin case.

| Concept | Symbol | Where |
| --- | --- | --- |
| β-correction (polynomial-at-∞ part) | `phi.lqdBeta` | populated in `solver-uqd-lqd.js`, `solver-uqd-lqd-singular.js`; carried through `clonePhi` everywhere |
| γ synthetic-branch at z₀ | `phi.lqdGamma` | `solver-uqd-lqd-singular.js`; merged into branches via `_phiWithSyntheticBranch` |
| (★)_F equations match β to h's poly-at-∞ | via `inverseFaberAtInfinity` + `phiLaurentAtInfinity_UQDL` | `solver-lqd-common.js:204` |
| (★)_Γ block (γ matches principal at w=0) | uses `inverseFaberAtPole` directly | `solver-uqd-lqd-singular.js` |
| Schwarz GPU support | `u_lqdBeta` uniforms, γ-merged branches | `schwarz/schwarz-webgl.js` |

---

## Direct problem (Thesis §3.4)

**Statement.** Given φ : 𝔻 → Ω, the Schwarz function σ satisfies σ(w)
= conj(w) on ∂Ω and extends meromorphically into Ω. h is the sum of
σ's principal parts at its finite poles in Ω.

**Code.** [`app/direct/direct-common.js`](app/direct/direct-common.js) —
see [`app/direct/README.md`](app/direct/README.md) for the four
φ-shape kernels (polynomial, rational, Laurent, numerical) and the
Durand–Kerner root finder.

---

## Schwarz dynamics

**Statement.** Iterating σ : Ω → Ω partitions the plane into the
"tiling set" (orbits stay bounded forever) and its complement (orbits
escape after `n` steps). The boundary of the tiling set is the
classical Schwarz limit set, a fractal.

**Code.** [`app/schwarz/schwarz-common.js`](app/schwarz/schwarz-common.js) —
see [`app/schwarz/README.md`](app/schwarz/README.md) for the CPU + GPU
adapters and per-family translations.

---

## Critical-set image (φ' zeros mapped to w-plane)

**Statement.** A zero of φ' inside the relevant disk causes φ to fail
univalence. Zeros near `|z| = 1` predict imminent failure as
parameters vary.

**Code.** [`app/critical-set.js`](app/critical-set.js); UI overlay in
the inverse-tab plot. Severity classifier maps `|z|` to colours
(critical / near / safe).

**Critical conformal radius.** For an unbounded QD the scale `c = φ′(∞)` is a
free gauge; as `c` grows the domain grows until `c*` — usually a **cusp** (a zero
of φ′ migrates onto `|z| = 1`, then the boundary self-overlaps), occasionally a
**fold** (the branch ends with φ′ still non-vanishing). `c*` is found
automatically by [`app/solver-cmax.js`](app/solver-cmax.js)
(`QD.estimateMaxConformalRadius`) with a **two-regime gate**: away from the cusp it
requires a genuine QD (univalent **and** the quadrature identity holds); near the
cusp the complement (hole) thins until the identity verifier can no longer place
interior test points, so it switches to the geometric cusp criterion
`g = max|z|` over φ′ zeros ([`QD.findCriticalPoints`](app/critical-set.js), valid
while `g < 1`). Returns `mechanism: 'cusp' | 'fold'`, `critAtMax`, and a
`confidence ∈ [0,1]` (mechanism cleanliness × bracket tightness). UI: the
**Estimate max c** button in the inverse tab's `#c-card`.

The identity verifier's interior test points come from
[`QD.chooseHoleTestPoints`](app/solver.js) — inside the hole (even-odd ray-cast),
ranked by clearance from both ∂Ω and h's poles. The naive `centroid + 0.18·maxDev`
placement it replaced drifted onto a pole as `c` grew, giving a spurious 100%
identity error and the old c\* under-estimate (HANDOFF).

**Accuracy near a cusp (#11).** As `c → c*` the identity integrand on ∂Ω stays
smooth and periodic but *sharpens*, so a fixed uniform-θ node count under-resolves
it and a genuine QD reads identity-failing (grading the nodes only hurts the
spectrally-accurate trapezoid — verified). `verifyQuadratureIdentity_UQD` therefore
**escalates** its uniform node count (doubling to a cap) when a cheap near-cusp gate
fires (`min|φ′|/mean|φ′| < 0.08`) and the error is still converging; the
well-resolved case is untouched. Newton itself sharpens its numerical Jacobian
(forward → central differences) once `condEst` flags ill-conditioning, with bounded
iterative refinement. `QD.estimateAccuracy` reports `nearCusp` / `cuspDistance` /
`trustedSignal` so the UI can say plainly that near a cusp the geometric criterion —
not the identity verifier — governs validity. See `app/test/cusp-accuracy.test.js`.

---

## Numerical primitives

| Primitive | Where | Notes |
| --- | --- | --- |
| Householder QR (real, m ≥ n) | `houseQR` — `solver.js:195` | P1.2. Backward-stable; replaces Gauss-Jordan on the normal equations. Surfaces `condEst`. |
| Square linear solve | `solveLinearSystem` — `solver.js` (post-QR) | Now routes through `houseQR.applyQt` + `backSolve`. |
| Least-squares solve | `solveLeastSquares` — `solver.js` (post-QR) | Direct QR; no `A^T A` formation. |
| Newton with Armijo + deflation | `newtonSolve` — `solver.js` | Damped Newton, finite-diff Jacobian (auto forward→central when ill-conditioned, #11), bounded iterative refinement, optional pluggable analytic Jacobian. |
| Top-level inverse solver | `solveInverseQD` — `solver.js:790` | Stages A1-A5 (direct / continuation / multistart / diverse seeds / deflation). |
| Boundary sampler (adaptive) | `sampleBoundaryAdaptive` — `solver.js` | Used everywhere φ(∂𝔻) is needed. |
| Univalence check | `isBoundaryUnivalent` — `solver.js` | Polygon self-intersection on sampled boundary. |
| Identity test points | `chooseHoleTestPoints` — `solver.js` | Picks interior points in the hole (ray-cast) ranked by clearance from ∂Ω + poles; shared by the unbounded identity verifiers. |
| Max conformal radius c\* | `estimateMaxConformalRadius` — `solver-cmax.js` | Bracket+bisection with a two-regime gate: genuine-QD (univalent + identity) away from the cusp, cusp criterion `g = max|z|` over φ′ zeros (`< 1`) near it. Reports `mechanism` (cusp/fold) and `confidence ∈ [0,1]` (#11). Warm-start gauge injection + confirm-invalid guard; dependency-injected `solveFn` (worker in browser, sync solver in tests). |
| Near-cusp identity resolution | `verifyQuadratureIdentity_UQD` — `solver-uqd.js` | Escalates the uniform-θ node count (doubling to a cap) when the near-cusp gate fires (`min/mean |φ′| < 0.08`) and the error is still converging, so a genuine QD near c\* is not mis-rejected. Uniform spectral trapezoid is kept away from cusps (grading would hurt it); `adaptiveSamples:false` forces single-pass (#11). |
| Boundary observables | `boundaryObservables` / `harmonicMeasure` / `estimateAccuracy` — `observables.js` (page-only) | From a solved φ via one φ/φ′/φ″ sweep (`phiTaylorAt`): signed curvature κ(θ)=Im(conj γ′·γ″)/|γ′|³ (κ→∞ at cusps), area (shoelace) + perimeter + centroid + complex area moments `M_k=∬_Ω w^k dA` (Stokes); harmonic-measure density `ρ=1/(2π|φ′|)`; multi-resolution identity error → significant-digits + condition estimate. Foundational primitives for the dynamics features. |
| Symmetry detector | `detectSymmetry` — `symmetry.js` (page-only) | Domain symmetry group from φ via the Riemann-map **intertwining** φ(e^{2πi/n}z)=c+e^{2πi/n}(φ(z)−c): EXACT index-shift / reflection tests on M=2520 boundary samples ⇒ `{rotationalOrder, reflectionAxes, center, continuous}`. Robust for non-star-shaped ∂Ω. Drives the #9 symmetry-axis overlay; partial TODO #11 (#9). |
| Analytic oracles | `ThesisExamples` / `checkOracle` — `thesis-examples.js` (page-only) | Curated canonical QDs each with closed-form expectations; `checkOracle(phi,hData,oracle)` routes each field to the matching detector (observables / cusps / symmetry / accuracy / c\*) and grades pass/warn/fail. Powers the #8 example gallery + oracle card and a regression test. |

---

## Conventions (matching the thesis)

- Contour integrals suppress the `1/(2πi)` factor: `∮_∂Ω F dw` in
  this codebase means `(1/(2πi)) · (literal integral)`. Unit-disk QD
  identity reads `∫_D f dA = ∮_∂D f · (1/w) dw`, so h = 1/w (not
  `2/w` as the textbook convention).
- `dA = dx dy / π` — normalised area measure; area of unit disk = 1.
- Complex values are `{re, im}` everywhere; never math.js objects in
  the solver hot path (math.js used only for parsing user input).
