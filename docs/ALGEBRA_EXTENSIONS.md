# ALGEBRA_EXTENSIONS.md — a prioritized roadmap for extending the QD Algebra module

> Output of a six-agent investigation (2026-07): three agents mapped the existing
> `apps/quadrature-domains` Algebra module (engine, workflow/UI, interop + app-math
> context); three researched the CAS-algorithm literature, the numerical-algebraic-
> geometry / external-tool landscape, and the quadrature-domain mathematics. This file
> is the synthesis. It is a **roadmap of possible NEW functionality** — correctness,
> performance, and structure were already reviewed separately and are out of scope here.

## The core finding

The Algebra engine is a genuine crown jewel — an exact ℚ(i) stack (Gröbner/FGLM, zero-dim
solving via eigenvalues, RUR, resultants, Schur–Cohn, Hermite/Sturm real-counting, series
with reversion) that most browser CAS libraries can't touch. Three structural facts shape
every recommendation:

1. **Its most on-mission power is latent.** Quadrature-domain theory is organized around one
   algebraic equivalence — the **"QD trinity"**: `quadrature data ⟺ rational Schwarz function
   S(z) ⟺ real boundary polynomial Q(z,z̄)=0`. **Every arrow is a resultant / elimination /
   real-root-count** — exactly the primitives already shipped. Existence/uniqueness of QDs is
   *literally a symbolic-computation result* (Ameur–Helmer–Tellander, arXiv:2001.09431, via real
   comprehensive triangular decomposition).
2. **The biggest architectural gap is a missing algebra→geometry channel.** The module already
   *reconstructs a domain from an algebraic solution* (`phiFromAlgebraSolution`, `algebra-ui.mjs:1595`)
   and *certifies univalence exactly* (Schur–Cohn fold) — but that exact result never reaches the
   geometric views, and a symbolically-solved QD can't leave the app. Most high-value wins are
   "route an already-exact result to where the user looks."
3. **Two capability axes are genuinely beyond the exact engine** — positive-dimensional solving
   and certified numerics — best filled by client-side WASM or opt-in backends, not reimplementation.

## Master priority table

| # | Extension | Value | Effort | Builds on (already present) |
|---|-----------|-------|--------|------------------------------|
| **1 ✅** | **Exact Schwarz function + boundary curve Q(z,z̄) from a solved QD** | ★★★ | Moderate | resultant/elimination Gröbner, `saturate`, series inverse |
| **2 ✅** | **Certify QD existence/uniqueness** — #2a certified verdict · #2b-1 1-param bifurcation · #2b-2a ≥2-param boundary equation · #2b-2b legible Maple-RCTD round-trip (count-per-region) | ★★★ | Moderate | `realSolutionCount` (Hermite), `triangularize`, Schur–Cohn |
| **3 ✅** | **Close the algebra→geometry loop (plot ℂ solutions, show domain, interchange export)** | ★★★ | Easy–Mod | `phiFromAlgebraSolution`, verdict `actions[]`, `@cas/interchange` |
| **4 ✅** | **Certified real solving via RUR + exact Sturm isolation (rigorous locations)** | ★★★ | Moderate | `rationalUnivariateRep` (self-certifying), `realRootIsolate` |
| **5 ✅** | **Wire the built-but-unexposed Aharonov–Shapiro moment system to a seed** | ★★★ | Easy | `pointFunctionalSystem` (tested, no UI), `seedFromSystem` |
| 6 ✅ | Ideal toolkit: colon `I:f`, intersection, 1-call elimination, membership | ★★ | Easy | `saturate` pattern, `mpolyExactDiv`, `normalForm` |
| 7 ✅ | Series calculus (log/exp/deriv/∫) + Laurent orders | ★★ | Easy | `seriesMul/Recip/ScaleByCoeff` |
| 8 ✅ | Hilbert series → dimension + degree (answer for positive-dim families) | ★★ | Easy–Mod | `standardMonomials`, `leadingMonomials` |
| 9 ✅ | Power sums / QD moments of the solution set via `trace(Mᵥᵏ)` | ★★ | Easy | `multiplicationMatrix` |
| 10 ◐ | Rational/Padé reconstruction ✅ + CRT-modular Gröbner (scaling cure) ◻ | ★★ | Easy | GCD/EEA, series |
| 11 ◐ | Dimension-in-verdict ✅ · staircase diagram ◻, session save/load ◻, `.ipynb` export ◻, rigor badges (already present) | ★★ | Easy–Mod | `standardMonomials`, `exportDAG`, `sympyDerivation` |
| 12 ◐ | Primary decomposition + minimal primes (decompose boundary variety) — `minimalPrimes` (factorizing Buchberger) ✅; full GTZ / embedded primes ◻ | ★★ | Moderate | factorization (present!), zero-dim radical, saturation |
| 13 ✅ | Triangular decomposition / regular chains (positive-dim solving) — `triangularDecomposition` (minimalPrimes + triangularize) | ★★ | Moderate | subresultants, GCD, squarefree, FGLM |
| 14 ✅ | Discriminant variety + parametric real-root classification (family bifurcation set) — `discriminantVariety` (any #params) + the 1-param count via #2b-1 | ★★ | Moderate | subresultants, elimination, real-root isolation |
| 15 | Curve parametrization + genus + Puiseux (rational boundary maps, cusps) | ★★ | Moderate | series/reversion, resultants, factorization |
| 16 | **Exact correspondence curves + σ (retire Correspondences' numeric branch engine)** | ★★ | Moderate | conjugate-var scheme, exact poly division (deflation), resultants |
| 17 | Dynatomic / Gleason / multiplier polynomials (exact CD/Tricorn component data) | ★★ | Moderate | resultants, exact division, zero-dim solve |
| 18 | Shape-from-moments (Prony–Hankel) reconstruction + QD-order rank test | ★★ | Moderate | zero-dim root-find, exact null-space/Vandermonde |
| 19 | Positive-dim / real radical; multivariate factorization; Hele-Shaw; mother bodies | ★–★★ | Mod–Hard | various above |
| 20 | **Certified numerics + positive-dim solving via tooling** (see Tier 5) | ★★★ | Varies | Arb/PARI WASM (client) · msolve/HC.jl (server) |

> **Build status (updated 2026-07-12) — ✅ done · ◐ core shipped, extensions deferred.** The **keystone
> trio** (#1, #3, #5), the **cheap-infra sprint** (#6–#11), and **"certified answers"** (#4 + #2a) are
> merged to `master`:
> #1 exact Schwarz curve + boundary `Q(z,z̄)` (PRs #25/#27) · #3 algebra→geometry loop, both slices
> (#28/#30) · #5 Aharonov–Shapiro moment seed (#29) · #6 ideal toolkit — colon/intersection/elimination/
> membership (#31) · #7 series calculus — log/exp/deriv/∫ (#32) · #8 Krull dimension + degree (#33) ·
> #9 power sums / moments via `trace(Mᵥᵏ)` (#34) · **◐ #10** rational/Padé reconstruction (#35) —
> CRT-modular Gröbner still deferred · **◐ #11** the true Krull dimension is now surfaced in positive-
> dimensional verdicts (#36); rigor badges already existed; staircase diagram, session save/load, and
> `.ipynb` export deferred · **#4** certified real solving — `solveRealCertified` = RUR + exact Sturm
> isolating boxes (#38) · **◐ #2** existence/uniqueness — #2a the verdict now solves certified-first
> (RUR + Sturm), so the count is exact instead of a "≥ k" hedge (PRs #39/#40); **#2b-1** the 1-parameter
> **bifurcation** — `parametricRealCount1D` (eliminant border + Sturm criticals + Hermite count per cell)
> + an Algebra "Bifurcation over [param]" panel (PRs #42/#43/#44); **#2b-2a** the ≥2-parameter bifurcation-set
> **equation** — `discriminantVariety` (any #params: eliminant → reducedDisc·lc strata → factored boundary,
> PR #46) — together completing **#14**; **#2b-2b** the imported Maple-RCTD result now renders legibly per cell
> ("n real solutions where [constraints]", PR #48), closing the count-per-region round-trip (in-house CAD
> deliberately not built) · **◐ #12** `minimalPrimes` — irreducible components by factorizing Buchberger
> (PR #49; `complete` honest about the ℚ(i) factorizer's univariate/monomial/variable-disjoint reach; full GTZ
> deferred) · **#13** `triangularDecomposition` — regular chains per component (minimalPrimes + triangularize,
> PR #51). **Not started:** #15–#20.

---

## Tier 1 — Keystone QD capabilities (do first)

These realize the QD trinity as exact computation. Each is a near-pure recombination of
existing primitives and directly serves the app's mission + honest-labeling guardrail.

**1. Exact Schwarz function + boundary algebraic curve.** From a solved QD (rational φ = p/q)
eliminate the disk parameter from `w = φ(z)` and the reflection relation to get
`Q(z,z̄) = Res_w(F, G) = 0` (the boundary curve, degree ≤ 2N) and `S(z)` with `P(z,S(z)) ≡ 0`.
This *is* the meromorphic-resultant / exponential-transform of Gustafsson–Putinar
(arXiv:1212.0678). Turns the numerically-traced boundary into an exact algebraic curve
(honest `=`). The single most on-mission capability the tool could add, and the foundation
everything else reuses.

**2. Certified existence/uniqueness.** Build the polynomial system relating map coefficients
to prescribed quadrature data; count real solutions and select branches bounding a genuine
region. Ameur–Helmer–Tellander do exactly this via **real comprehensive triangular decomposition** —
a bullseye for `realSolutionCount` + `triangularize` + Schur–Cohn. Lets the app *certify*
"these data yield exactly k QDs" rather than guess.

**3. Close the algebra→geometry loop.** When `solve` returns, plot the solution's pole-preimages/
nodes in the disk, draw the reconstructed φ(∂𝔻), add "send to plot tab," and emit a
`quadrature-domain` interchange envelope so a symbolically-solved QD hands off to Complex
Dynamics like the Schwarz tab's φ does. Highest leverage-to-effort ratio — the machinery
(`phiFromAlgebraSolution`, verdict `actions[]`, the `PrimarySolution` bus, the interchange schema)
all exists; today the coordinates only reach `console.table`.

**4. Certified real solving (rigorous locations).** Take the RUR's real minimal polynomial,
isolate its real roots *exactly* (rational boxes via Sturm), push each through the coordinate
maps → certified isolating boxes for every real QD, no floating-point eigenvalue step. Closes
the gap between `realSolutionCount` (the *number*, no locations) and `solveByEigenvalues`
(locations, numeric, undercounts clusters).

**5. Expose the Aharonov–Shapiro moment system.** `pointFunctionalSystem` (`qd-equations.mjs:680`) —
"enumerate QDs from prescribed moments" — is built and unit-tested but wired to no UI. A one-click
seed + the existing real-count/Schur–Cohn filter delivers the flagship parametric-uniqueness story
(the cardioid = the A–S cusp) for almost pure UI work.

## Tier 2 — Cheap, high-leverage (expose latent power + recombine primitives)

- **Ideal toolkit** — colon `I:f` (finite sibling of `saturate`; removes the spurious `|zⱼ|=1`
  boundary components that block shape-position), intersection, one-call multivariate elimination
  (beyond the 10×10 resultant cap), ideal/radical membership. Gröbner-elimination one-liners.
- **Series calculus** — `log/exp/deriv/integral` (~10-line loops) + Laurent (negative) orders →
  Schwarzian derivative, Grunsky/Faber generating functions, Schwarz-function expansions about poles.
- **Hilbert series → Krull dimension + degree** — from one GB; the staircase data is already computed.
  For positive-dimensional QD moduli families, report dimension/degree instead of refusing.
- **Power sums / moments via `trace(Mᵥᵏ)`** — read Σzⱼ, Σ|zⱼ|², QD moments over all solutions
  *without solving*.
- **Rational/Padé reconstruction + CRT-modular Gröbner** — the standard cure for exact-coefficient
  blow-up (the main scaling bottleneck); highest infrastructure leverage-to-effort.
- **Surface shipped-but-hidden engine functions** — `buchbergerSig`, `comprehensiveGroebnerSystem`,
  `verifySOS`, `rationalUnivariateRep`, `radicalZeroDim`, `schurCohn`, `realSolutionCount`,
  `triangularize` are exported but unused by the store. Several Tier-1/2 wins are *exposure*, not math.
- **Workflow** — staircase/standard-monomial diagram (data already computed), session save/load +
  share-link (`exportDAG` round-trips), `.ipynb` export (`sympyDerivation` exists), systematic
  `= / ≤ / ≈` rigor badges, branch diff/compare, parameter-sweep bifurcation explorer.

## Tier 3 — Decomposition tier (moderate, unusually reachable)

Key feasibility fact: the engine **already has polynomial factorization over ℚ and ℚ(i)** plus
zero-dim radical + saturation — the primitives that normally gate this tier — which promotes these
from "hard" to "moderate."

- **Primary decomposition + minimal/associated primes** (GTZ) — split the boundary variety into
  irreducible components; separate genuine boundary from spurious/embedded pieces.
- **Triangular decomposition / regular chains** — positive-dimensional geometric solving (where
  RUR/eigenvalues don't apply) and the on-ramp to the AHT uniqueness engine and real geometry.
- **Discriminant variety + parametric real-root classification** — the bifurcation set of a QD
  family: where the boundary develops a cusp, self-intersects, or an oval appears.
- **Curve parametrization + genus + Puiseux** — genus-0 test + parametrization recovers an explicit
  boundary map; Puiseux analyzes boundary cusps. Reuses the series/reversion code.
- Supporting: positive-dimensional radical, real radical, multivariate factorization (if not present).

## Tier 4 — Cross-app exact computations (numeric → exact for the sibling apps)

- **Exact anti-holomorphic correspondence curves + Schwarz reflection σ.** The deleted d:d
  correspondence `[f(w) − f(η(z))]/[w − η(z)] = 0` — the deflation is exact polynomial division.
  Retires the Correspondences app's fragile cold-seed-Newton branch engine (documented branch-drift)
  with an exact algebraic scaffold + certified cusps/fixed points.
- **Dynatomic / Gleason / multiplier polynomials** via resultants — exact centers, roots,
  Misiurewicz/bifurcation points for CD's Mandelbrot/Multibrot/Tricorn presets. Caveat: Tricorn
  odd-period components need the critical-value map, not the multiplier.
- **Shape-from-moments** (Prony–Hankel; QD-order = exponential-moment rank drop) — a new input
  modality where exact arithmetic beats ill-conditioned floating-point Prony.
- **Hele-Shaw / Laplacian growth** — polynomial-map evolution with conserved Richardson moments and
  certified cusp times (exact root of a resultant in ℚ(i)[t]). The one genuinely new primitive: an
  exact power-series/ODE-coefficient integrator.
- **Mother body / balayage skeleton** (branch points of S = discriminant roots) and
  **algebraic-but-not-QD / null-QD classification** (the ellipse: algebraic Schwarz function but
  two-valued → not a QD) — the honest-labeling boundary cases.

## Tier 5 — Beyond the exact engine: tooling for the two axes it can't reach

**Certified numerics (fits honest-labeling; client-side options keep the app static):**
- **python-flint / Arb via Pyodide** — rigorous arbitrary-precision ball arithmetic (proven error
  radius → legitimate `≤`). Pyodide wheels exist today. Cost: one-time Pyodide load.
- **PARI/GP WASM** (Bordeaux build) — certified `polroots`, number-field factoring, LLL; fully static.
- **In-house Descartes isolation + Krawczyk/α-theory** in the existing BigInt engine —
  dependency-free rigor, the cleanest philosophical fit.

**Positive-dimensional + all-complex-solution + large systems (opt-in backend):**
- **msolve** — you already export to it; wrap the binary behind one HTTP endpoint for certified real
  solving at scale (smallest step to big new power).
- **HomotopyContinuation.jl** — witness sets / numerical irreducible decomposition (positive-dim),
  all complex solutions, a Krawczyk `certify`, monodromy solving for family sweeps. Server-only.
- **SageCell** — zero-infrastructure public bridge for prototyping before hosting.
- **Skip:** pure-JS CAS libs (weaker than what's built), SymPy-as-solver (duplicative), Magma (licensing).

---

## Recommended build order

1. ✅ **Prove the keystone (highest value, mostly existing primitives):** #1 exact Schwarz-curve/boundary
   extraction → #3 the algebra→geometry loop → #5 expose the moment system. This trio turns the tool's
   central theory into visible, exact, shareable results. **DONE (PRs #25–#30).**
2. ✅ **Certified answers:** #4 RUR-based certified real solving + #2a a certified-first existence/uniqueness
   verdict + #2b-1 the exact 1-parameter bifurcation (`parametricRealCount1D` + an Algebra panel) + #2b-2a the
   ≥2-parameter bifurcation-set **equation** (`discriminantVariety`) — together completing **#14**. **DONE (PRs
   #38–#46).** The remaining ≥2-parameter *count-per-region* uses the already-wired **Maple RCTD** export/import
   (`cas-export.mjs` → `RealComprehensiveTriangularize` → `parseRCTD`); in-house CAD is deliberately not built.
3. ✅ **Cheap infrastructure sprint (compounding):** #6 ideal toolkit + #7 series calculus + #8 Hilbert/
   dimension + #9 power sums + #10 Padé/CRT + the Tier-2 workflow wins. **DONE (PRs #31–#36);** CRT-modular
   Gröbner and the staircase/save-load/`.ipynb` workflow items deferred (rigor badges already present).
4. **Decomposition tier (mostly done):** ✅ #12 minimal primes (`minimalPrimes`, factorizing Buchberger) + ✅ #13
   regular chains (`triangularDecomposition`) + ✅ #14 discriminant variety (`discriminantVariety`); still open —
   #15 curve parametrization / genus / Puiseux, and genuine multivariate factorization (would deepen #12/#13 past
   the current univariate/monomial/variable-disjoint reach).
5. **Cross-app exact upgrades:** #16 exact correspondence curves + #17 dynatomic/Gleason/multiplier.
6. **Tooling axes, as demand appears:** client-side Arb/PARI for certified `≤`; an opt-in msolve →
   HomotopyContinuation.jl service for positive-dimensional / large / all-solution work.

## Honest-labeling boundary + caveats

- The engine produces the **algebraic scaffolding exactly** (`=`): boundary curve, Schwarz function,
  correspondence curves, cusp times, real-solution counts. But **matings and straightening are
  conformal-conjugacy/surgery theorems, not polynomial identities** — "σ is the mating of z̄² and
  PSL(2,ℤ)" must be labeled a theorem, never engine-certified. This maps onto the `=` vs.
  labeled-conjugacy line.
- Before hard-coding domain formulas: use boundary degree **≤ 2N**; "subordination QD" is nonstandard —
  the correct referent is **partial balayage / subharmonic QDs**; re-verify the exponential-moment
  matrix indexing and the dynatomic/Gleason sign conventions against primary sources.

## Key references

- QD theory: Aharonov–Shapiro 1976 (https://link.springer.com/article/10.1007/BF02786704); Gustafsson
  1983 (https://link.springer.com/article/10.1007/BF00046600); Gustafsson–Shapiro "What is a QD?"
  (https://link.springer.com/chapter/10.1007/3-7643-7316-4_1).
- Exponential transform / moments / resultants: Gustafsson–Putinar (https://arxiv.org/abs/1212.0678).
- Uniqueness (symbolic computation): Ameur–Helmer–Tellander (https://arxiv.org/abs/2001.09431).
- Correspondences / matings: LLMM (https://arxiv.org/abs/1811.04979); Lyubich–Mazor–Mukherjee
  (https://arxiv.org/abs/2303.02459).
- Algorithms: Cox–Little–O'Shea, *Ideals, Varieties, and Algorithms*; Singular `primdec.lib`
  (https://www.singular.uni-kl.de/Manual/4-2-0/sing_1437.htm); regular chains
  (https://arxiv.org/abs/1104.0689).
- Tooling: msolve (https://msolve.lip6.fr/); HomotopyContinuation.jl
  (https://www.juliahomotopycontinuation.org/); python-flint/Arb (https://github.com/flintlib/python-flint);
  PARI WASM (https://pari.math.u-bordeaux.fr/gpexpwasm.html).
