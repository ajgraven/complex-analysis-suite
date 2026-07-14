# The QD Algebra Module — functionality & capabilities

> **A capabilities overview** of the Quadrature Domains app's Algebra module (the exact
> symbolic-algebra track). For the *roadmap* of possible new functionality see
> [`ALGEBRA_EXTENSIONS.md`](ALGEBRA_EXTENSIONS.md); for the app's overall structure see
> [`../apps/quadrature-domains/ARCHITECTURE.md`](../apps/quadrature-domains/ARCHITECTURE.md). This document
> describes what the module can do *today*.

## 1. What it is

The **Algebra module** is a self-contained **exact computer-algebra system (CAS)** embedded in the
Quadrature Domains app. Unlike the app's numerical tracks (which trace boundaries in floating point),
everything in the Algebra module is computed in **exact arithmetic over ℚ(i)** (the Gaussian rationals) —
so its results are *proofs*, not estimates.

Its reason for existing is a single organizing principle of quadrature-domain theory, the **"QD trinity"**:

> **quadrature data ⟺ rational Schwarz function `S(z)` ⟺ real boundary polynomial `Q(z, z̄) = 0`**

Every arrow in that equivalence is a **resultant / elimination / real-root-count** — exactly the primitives
the engine ships. So existence and uniqueness of a quadrature domain becomes a *symbolic-computation
question* the module can answer exactly, rather than guess numerically. It is, in effect, a browser-native
CAS with an exact ℚ(i) Gröbner / solver / factorization stack that most in-browser math libraries can't
match — purpose-built for QD theory but general enough to stand alone as a polynomial-algebra engine.

## 2. Architecture — a one-way, four-layer stack

All exact math lives at the bottom; data flows one way from generators to view.

```
 generators              store (DOM-free)         view                heavy ops
 ──────────              ────────────────         ────                ─────────
 qd-equations.mjs ─┐                            algebra-canvas.mjs
 qd-constraints.mjs├─seed→ algebra-store.mjs ─→  (column lanes,       sym-worker.mjs
 (●/★/gauge system)┘       (append-column         SVG edges,          (Web Worker:
                            audit-trail DAG;       verdict)            groebner / solve /
 sym-core.mjs ◀──exact      classify/solve/                           dimension; main-
 (QD.Sym: ℚ(i), MPoly,      factor/reduce)   ↑    algebra-ui.mjs       thread fallback)
  Gröbner, solvers,         │       ▲        │    (node-editor sidebar,
  factor)                   └───────┘        │     inspector, toolbar,
                            offload heavy ops──→   breadcrumb, exports)
```

| Layer | Role |
|---|---|
| **`sym-core.mjs` (`QD.Sym`)** | The exact engine — no DOM, no dependencies. The subject of §3–§4. |
| **`qd-equations.mjs` / `qd-constraints.mjs`** | Generate the classical-QD `(●)/(★)/gauge` polynomial system and the univalence constraints the workspace starts from. |
| **`algebra-store.mjs` (`QD.AlgebraStore`)** | DOM-free state model — an **append-column audit-trail DAG** of equation nodes (column 0 = original; each reduction appends a labeled column). Orchestrates analysis and routes heavy ops to the worker. |
| **`algebra-canvas.mjs` / `algebra-ui.mjs`** | Render the store as column lanes with arrowed edges; the node-editor sidebar, inspector, toolbar, and export controls. |
| **`sym-worker.mjs` (`QD.SymWorker`)** | Web-Worker offload for the expensive ops (Gröbner / solve / dimension), with a main-thread fallback. |

## 3. The exact foundation

The engine is built up in strict layers, each exact:

- **`Rational`** — arbitrary-precision `BigInt` fractions, normalized.
- **`Gaussian`** — `a + b·i` with rational `a, b`: the coefficient **field ℚ(i)** (so division is exact).
- **`MPoly`** — sparse multivariate polynomials over ℚ(i) (`Map<monomial, Gaussian>`); variables are bare
  names (`z1`, `zb1`, `A_1_1`, …).
- **`RatFn` / `FRatFn`** — the fraction field `MPoly/MPoly`, needed because the QD ansatz introduces
  `(1 − z̄·z)` and `φ′` denominators.
- **Truncated power series** — coefficients in `RatFn`, with composition and compositional inverse.

No floating point enters the algebra; it appears only in a numeric-residual *oracle* and in the numeric
eigenvalue/root steps of the two solvers.

## 4. Core CAS capabilities (the `QD.Sym` engine)

Grouped by area — every item is exact over ℚ(i):

**Polynomial algebra & elimination**
- Multivariate arithmetic, exact division (`mpolyExactDiv`), multivariate GCD (`gcdMV`, `gcdList`),
  squarefree part.
- **Resultants & discriminants** via fraction-free Bareiss determinants (`resultant`, `discriminant`,
  `reducedDiscriminant` — the latter strips the spurious leading-coefficient stratum), plus subresultant
  PRS / `pseudoRemainder`.

**Factorization**
- Univariate over ℚ(i) (`qiFactor`, Trager norm) and over ℚ (`factorOverQ`, Berlekamp–Zassenhaus).
- **Bivariate over ℚ(i)** (roadmap #19): `factorBivariate` (Gao resultant-eigenvalue), an independent
  `henselFactorBivariate` cross-check oracle, and `bivariateAbsFactorCount` / `isAbsolutelyIrreducible`
  (Gao Ruppert-nullspace absolute factor count / irreducibility).
- **General n-variate over ℚ(i)** (roadmap #19, complete): `factorMultivariate` — reduce to univariate,
  multivariate Hensel-lift back one variable at a time (`mvHenselLift`), recombine. The public `factor()`
  routes monomial / variable-disjoint / univariate / bivariate / n-variate cases uniformly; the one honest
  limit is a polynomial non-monic in *every* variable (Wang leading-coefficient distribution — returned
  whole, `complete:false`).

**Gröbner bases & ideal theory**
- Buchberger (Gebauer–Möller + sugar) and a signature-based GVW variant; reduced bases, normal form,
  S-polynomials, saturation; monomial orders lex / grlex / grevlex / block / elimination.
- **Ideal toolkit**: membership (`inIdeal`), elimination (`eliminationIdeal`), intersection, quotient/colon
  (`idealQuotient`), and comprehensive Gröbner systems.
- **Decomposition**: `minimalPrimes` (irreducible components by factorizing Buchberger, #12),
  `triangularDecomposition` (regular chains, #13).

**Solving (zero-dimensional)**
- `solveZeroDim` (shape lemma + Möller–Stetter eigenvalue fallback), `solveByEigenvalues` (multiplication
  matrices), FGLM (grevlex→lex), RUR (`rationalUnivariateRep`, self-certifying).

**Dimension & structure**
- Krull dimension, Hilbert degree, quotient dimension, standard monomials, leading-monomial ideal.

**Real solving & counting (certified)**
- Sturm real-root isolation with exact rational boxes (`realRootIsolate`, `realRootCount`, `sturmHabicht`),
  Hermite real-solution counting (`realSolutionCount`), and **`solveRealCertified`** (RUR + certified Sturm
  boxes, #4 — exact counts, not "≥ k" hedges).
- **Schur–Cohn** unit-circle root counting (`schurCohn`, `unitCircleRootCount`) — the exact **univalence
  certificate**.

**Parametric / bifurcation analysis**
- `parametricRealCount1D` (1-parameter bifurcation: eliminant border + Sturm criticals + Hermite count per
  cell, #2b), `discriminantVariety` (the ≥2-parameter bifurcation-set equation, #14).

**Moments & reconstruction**
- Power sums / QD moments of a solution set via `trace(Mᵥᵏ)` (`powerSums`, `coordinateMoments`, #9),
  Newton↔elementary symmetric conversion, `charPolyByTraces`.
- **Padé / rational reconstruction** (`padeApproximant`, `rationalReconstruct`, #10).
- **Shape-from-moments** (Prony–Hankel, #18): `hankelRank` (the QD-order = exact Hankel rank drop),
  `pronyPolynomial` (the exact `Π(z−zⱼ)`), `shapeFromMoments` (numeric nodes via Durand–Kerner on the exact
  Prony polynomial + Vandermonde weights + a reconstruction residual).

**Series calculus**
- Full truncated-Taylor calculus: `+ · ^`, composition, compositional inverse & reversion, reciprocal,
  derivative, integral, log, exp (#7) — driving the QD `(★)` Faber block.

**Positivity & radicals**
- `verifySOS` (sum-of-squares / Positivstellensatz certificates), `radicalZeroDim` (zero-dimensional
  radical), `curveGenus` (plane-curve geometric genus + rationality via an exact projective smoothness
  test, #15).

## 5. The QD-specific workflow (what the exact stack is *for*)

The keystone capabilities that turn the engine on the app's mission:

- **Exact Schwarz function + boundary curve** (#1): from a solved QD `φ = p/q`, eliminate the disk
  parameter to produce the exact algebraic boundary `Q(z, z̄) = Res_w(F, G) = 0` and the Schwarz function
  `S(z)` — turning a numerically-traced boundary into an exact curve (honest `=`).
- **Certified existence/uniqueness** (#2): build the coefficient↔data system and certify "these data yield
  exactly *k* QDs" via certified real counting + triangular decomposition + Schur–Cohn — including
  1-parameter bifurcation and the multi-parameter bifurcation-set equation. The **genuine-QD certificate**
  (`Certify univalence`) filters the algebraic solutions to bounded QDs: an **exact `|z_j|<1` node-location
  gate** (`QDEquations.nodeInsideDisk` — a solution whose reconstructed φ has a pole in 𝔻 is rejected), then
  the exact Schur–Cohn fold + exact boundary double-point tests, the rotation-gauge quotient, and a numeric
  cross-check. The raw real-solution *count* is a rigorous **upper bound** on #QD; **`saturateMobius`** (a
  labeled `saturate` DAG column, `⟨I⟩:∏(1−z_j·z̄_j)^∞`) removes the `{|z_j|=1}` boundary stratum the cleared
  denominators carry to make it exact (e.g. the unit disk `h=1/w`: 4→2). A single **"✦ Prove
  existence/uniqueness"** action orchestrates the whole path (auto-reality → propagate → the certificate),
  falling back to a positive-dimensional "pin/split" verdict rather than failing ambiguously.
- **The algebra→geometry loop** (#3): plot the ℂ solutions and reconstruct the quadrature domain from an
  algebraic solution (`phiFromAlgebraSolution`) — the certify-univalence verdict even draws a thumbnail of
  the reconstructed boundary `φ(∂𝔻)` with its quadrature nodes `φ(zⱼ)` — closing the exact result back to
  the geometric views.
- **Spurious-factor detection**: `factor()` on the (real/imaginary-split) system flags reducible components
  that can be pinned or case-split — separating genuine QD components from artifacts.
- **The Aharonov–Shapiro moment seed** (#5) and the **shape-from-moments** panel (#18): go from prescribed
  moments to a candidate configuration.

## 6. The user experience

- **A node-graph audit trail.** The workspace is an append-column DAG of immutable equation nodes: column 0
  is your original system; each operation (from a fixed contract of ~two dozen `provenance.op`s —
  generate, conjugate, resultant, Gröbner, constraint, substitute, linear-reduce, assume-real, assume-
  imaginary, fix-w₀, triangular, factor, rctd, …) appends a **labeled** column, leaving column 0 pristine,
  so the full derivation is inspectable and reproducible. The graph can **fork into parallel tracks** (each
  a branch of the derivation with its own assumptions). The op labels are rendered by two synchronized
  registries — `PROV_STORE` (store side) and `PROV_UI` (UI side).
- **Modeling conventions.** Polynomials are carried in a **conjugate-variable model** (`zⱼ` and `z̄ⱼ` as
  independent unknowns) or a flat **real/imaginary (reim) model**, with per-track **assumptions** —
  variables asserted real (`v̄ ≡ v`) or imaginary (`v̄ ≡ −v`), and a fixable Riemann-map gauge `φ(0)=w₀`.
  Verdicts computed under an assumption are honestly labeled with a **"Computed under:"** ledger, and a
  slice restriction is flagged as a *lower bound* (it can drop off-slice domains).
- **The one-click proof action.** A pinned **"✦ Prove existence/uniqueness"** button runs the whole pipeline
  from the seeded system to the authoritative genuine-QD verdict (auto-reality → linear propagation → the
  certificate), with no manual op-chaining — the single entry point for the semi-autonomous proof workflow.
- **Panels & readouts.** A KaTeX-typeset node canvas with arrowed derivation edges, a lineage-highlighting
  minimap, and collapsible cards; a certify-univalence **verdict card** led by a prominent color-coded
  **rigor badge** (`=` exact/certified · `≤` bound · `≈` estimate · `⚠` partial · `?` undetermined, so an
  estimate can never be misread as certified) and carrying the "Computed under:" assumptions ledger, solution
  rows, one-click remediation actions, and the reconstructed-domain thumbnail; a palette of
  **univalence-constraint forms** (convex, star-like, spiral-like, local `φ′≠0`, global injectivity, and
  export-only convex/star border loci); the **Bifurcation over [param]** panel; the **Shape from moments**
  panel; a **resolvent / discriminant** readout; and **rigor badges** on every result.
- **Input.** A no-`eval` recursive-descent expression parser: exact fractions (`0.2 → 1/5`), `i` as the
  imaginary unit, and conjugate variables treated as single names (`zb1` is one variable, never `z·b1`).
- **Export & interchange.** The workspace saves/loads as a JSON DAG, and exports to external CAS dialects —
  **Maple** (the primary target: a `RealComprehensiveTriangularize` script for the parametric real
  quantifier elimination that deliberately does *not* run in-browser), Singular, Sage, Mathematica, and
  msolve — plus a reproducible **SymPy** derivation script and **LaTeX**; it also imports results back
  (Maple RCTD cells, msolve solutions).
- **Offload.** Heavy jobs — Gröbner, zero-dimensional / certified-real solve, classify, dimension,
  bifurcation, shape-from-moments — run in a native-module **Web Worker** with a synchronous main-thread
  fallback (for `file://` and headless test contexts).

## 7. Honest-labeling — the binding convention

Every computed result is tagged for rigor, a hard project guardrail: **`=` exact**, **`≤` rigorous bound**,
**`≈` estimate**. `complete` flags are truthful (e.g. a decomposition says so when the factorizer can't
certify a component), specialization results carry the **"Computed under:"** assumption ledger, and nothing
exploratory is allowed to read as certified. Because the whole stack is exact ℚ(i), an `=` genuinely means
proven.

## 8. The shared `@cas/exact` package (brief)

Separate from the QD engine, `@cas/exact` is the suite's **shared** exact-arithmetic kernel, extracted
(roadmap #17, per ADR-0007) when a third consumer appeared. It is convention-neutral and comprises:

- **`Frac` / `Gauss`** — ℚ over `BigInt`, and ℚ(i).
- **`QiPoly`** — exact univariate polynomials over ℚ(i) (divmod, exact division, Horner; the variable is
  abstract — `z̄` for a correspondence curve, `c` for a Gleason polynomial).
- **`BiPoly`** — exact bivariate polynomials (an outer variable over `QiPoly` coefficients, monic division)
  — the layer CD's dynatomic `Φ_n(z,c)` needs.
- **`resultant` / `discriminant`** — Sylvester resultant / discriminant via fraction-free Bareiss, plus
  content-clearing.
- **`render`** — shared polynomial / coefficient string formatting.

**Consumers:** `apps/correspondences` (the exact deleted-correspondence curve `C(w, z̄)` + cusp locus, #16)
and `apps/complex-dynamics` (dynatomic / Gleason / multiplier "Component data", #17).

**Relationship to the QD engine (important).** `@cas/exact` and the QD `sym-core.mjs` are **independent**
exact stacks — `sym-core.mjs` imports only `./solver.mjs` and does not build on `@cas/exact`. The QD Algebra
module predates the package and carries its own, far larger engine; `@cas/exact` is the leaner, shared kernel
for the *other* apps' cross-app exact needs. They share the mathematics (ℚ(i), exact polynomials, Bareiss
resultants) but not code — a future consolidation is conceivable but has not been done.

## 9. Status

The Algebra engine is mature: the extensions roadmap ([`ALGEBRA_EXTENSIONS.md`](ALGEBRA_EXTENSIONS.md)) items
**#1–#18 are complete** in feasible form, and **#19's factorizer is complete** — univariate → bivariate →
**general n-variate** ([`NVARIATE_FACTORING.md`](NVARIATE_FACTORING.md)) — all routed through the public
`factor()` and the ideal-decomposition certification, and triply cross-checked (Hensel-vs-Gao bivariate
consistency, a second-reduction differential, and an external Sympy corpus). Deferred / exploratory items
remain: Wang leading-coefficient distribution (a polynomial non-monic in every variable is returned whole);
Puiseux singular genus & rational parametrization; Hele-Shaw / mother bodies; and certified numerics /
positive-dimensional solving via client-WASM or opt-in backends (roadmap #20).

A **maturity review of the existence/uniqueness proof workflow** ([`docs/algebra-review/`](algebra-review/))
hardened the genuine-QD certificate: an exact `|z_j|<1` node-location admissibility gate (a solution whose φ
has a pole in 𝔻 is no longer counted), Möbius `saturateMobius` to make the raw count exact (the unit disk
now reads 2, not 4), honest labeling of the algebraic count as an upper bound, a color-coded `=`/`≤`/`≈`
rigor badge on every verdict, and the one-click "✦ Prove existence/uniqueness" orchestrator. The per-solution
univalence certificate is verified at the **exact algebraic root** when the solution is rational
(`verifySolutionExact` — a snap-to-ℚ(i) + exact-zero residual check, so a `=` badge is then unconditional);
a genuinely-irrational solution honestly reads `≈`. Keeping `=` for irrational solutions (interval /
number-field Schur–Cohn) is the remaining refinement. See `docs/algebra-review/FINAL_REPORT.md`.
