# A3 — QD Algebra subsystem & symbolic core (sym-core / algebra tab)

Scope: the Quadrature-Domains **algebra subsystem and symbolic core** — the prior review's
explicit coverage gap. I prioritized the mathematical kernels of
`apps/quadrature-domains/app/sym/sym-core.mjs` (6017 lines): exact ℚ/ℚ(i) arithmetic,
monomial orders, Buchberger (packed kernel + Gebauer–Möller + sugar + GVW signature
variant), reduceGroebner, FGLM, the zero-dim toolkit (dimension / standard monomials /
quotient dim / Krull), `solveZeroDim` (shape lemma + Möller–Stetter eigenvalue fallback),
`realSolutionCount` (Hermite trace / exact inertia), radical `factor`
(monomial/separable/univariate-ℚ(i)/bivariate-Gao/multivariate-Hensel), univariate GCD,
square-free part, Sturm real-root isolation, and `schurCohn` (exact + interval). I also
read the worker bridge (`algebra/sym-worker.mjs`), the store's heavy-op dispatch and
factor/classify paths (`algebra/algebra-store.mjs`), the factor UI paths in
`algebra/algebra-ui.mjs`, and the proof planner `algebra/prove-plan.mjs`. **No file in this
scope has changed since the Aug-17 review base** (`git log 6c43a92..HEAD` on `app/sym/` and
`app/algebra/` is empty) — this is pure coverage-gap territory, not churn.

**Headline: the symbolic core is exceptionally solid.** Exact arithmetic is genuinely
exact (BigInt rationals, Gaussian ℚ(i)); every "=" / "≈" boundary I checked is honestly
labeled; numeric results (root-finder solutions, shape-from-moments nodes) are never dressed
as exact; the file has near-universal cap-and-throw discipline against blow-ups. I found **one
real robustness/perf gap** (the single place that skips that discipline), plus two low-severity
doc/perf notes. No correctness or convention-factor errors found.

---

### [MEDIUM] Berlekamp–Zassenhaus recombination is uncapped exponential — reachable from the main-thread factor probe
- **Area:** QD sym-core / algebra-ui · **Location:** `apps/quadrature-domains/app/sym/sym-core.mjs:2194` (`_combinations`), `:2200` (`_recombine`); reachability via `apps/quadrature-domains/app/algebra/algebra-ui.mjs:2602` (`_factorInfo` guard) and `:2398` (`doFactor` sync `factorOf`)
- **Type:** perf / bug (robustness)
- **Confidence:** high
- **Fix-safety:** needs-review
- **Evidence:** `_recombine` does classic Zassenhaus subset recombination:
  ```js
  while (remaining.length > 0 && size <= remaining.length) {
    for (const idx of _combinations(remaining.length, size)) { ... }
    ...
    size++;
  }
  ```
  and `_combinations(n,k)` **fully materializes** every k-subset into an array (`out.push(idx.slice())`)
  before iterating. For an input with `r` non-recombining modular factors this is `Σ_k C(r,k) = 2^r − 1`
  subset products (each a BigInt polynomial multiply mod pᴷ) **plus** a C(r,⌊r/2⌋)-sized array allocation.
  Unlike the bivariate/multivariate factor branches (which cap degree at 12/8 and term count, and emit an
  honest `_cap` "use CAS export") and unlike the rest of the file (`GROEBNER_MAX_*`, `RESULTANT_MATRIX_CAP`,
  every `guard > …` throw), the **univariate ℚ path has no degree cap** and `_recombine` has **no guard at
  all**. The classic worst case (Swinnerton-Dyer polynomials, or a sparse `xⁿ − 2` that is irreducible over
  ℚ yet splits into many small factors mod p) triggers full 2^r enumeration.
  The auto/render-path probe `_factorInfo` guards only on **term count** (`if (sz > FACTOR_AUTO_CAP) return
  FACTOR_UNKNOWN`, cap 120 — `algebra-ui.mjs:2602`), so a **few-term high-degree** polynomial (e.g. `x^40 − 2`,
  2 terms) sails past the guard, and `_factorInfo`/`_factorCount` are called on the render/menu path
  (`algebra-ui.mjs:2692`, `:3536`). The explicit "Factor" click `doFactor` (`:2398`) also calls the
  **synchronous** `store.factorOf` (main-thread `S.factor`), not the async worker twin.
- **Why it matters:** a pathological (but user-typeable — the algebra tab is a general CAS workspace)
  polynomial freezes the tab (or spikes memory) with no cancel and no honest "past a cap" signal. The heavy
  case-split action (`applyFactorAsync`) IS offloaded to the worker, but the factorability *probe* and
  `doFactor` are not, so the freeze is on the main thread. This is the one spot that breaks the file's
  otherwise-exemplary "cap and throw, never hang" contract.
- **Recommendation:** (1) add a guard/cap to `_recombine` (bound the number of recombination trials, throw
  the same "use CAS export" error the rest of the file uses) — cheap and in the file's own idiom; a
  known-factor-degree-set (LLL-style) recombination is the heavier proper fix but not required here. (2) Add a
  **degree** cap to the univariate `_qiFactor`/`_factorOverQ` path mirroring the bivariate/multivariate branches.
  (3) Make the render-path `_factorInfo` guard consider degree, not just term count, and/or route `doFactor`
  through the existing `factorNodeAsync` worker path (setBusy + Cancel), as `applyFactorAsync` already does.

### [LOW] `sym-worker.mjs` API doc lists 3 ops; `runJob` now dispatches 14
- **Area:** QD algebra · **Location:** `apps/quadrature-domains/app/algebra/sym-worker.mjs:2-3,13`
- **Type:** stale-doc
- **Confidence:** high
- **Fix-safety:** safe-now
- **Evidence:** the module header (line 13) says `op ∈ {'groebner','solveZeroDim','dimension'}`, and the
  top comment (lines 2-8) frames the worker as only "Gröbner bases and zero-dimensional solving". But
  `runJob` (`sym-core.mjs:5355`) now dispatches: `groebner, solveZeroDim, solveRealCertified,
  shapeFromMoments, parametricRealCount1D, minimalPrimes, triangularDecomposition, dimension, classify,
  saturate, eliminate, triangularize, resolvent, factor`, and the store issues `SW.run('classify'|'factor'|
  'saturate'|'eliminate'|'triangularize'|'resolvent'|…)` (e.g. `algebra-store.mjs:1965,3015`). The "Q2:
  five previously main-thread-only heavy ops, offloaded" block (`sym-core.mjs:5452`) is exactly the work the
  doc predates.
- **Why it matters:** a reader trusting the worker doc would think classify/factor/eliminate run on the main
  thread. Purely documentation.
- **Recommendation:** update the op list (and the opening sentence) to the current `runJob` set, or point it
  at `runJob` as the authority.

### [LOW] prove-plan calls `realSolutionCount` / `schurCohn` synchronously on the main thread
- **Area:** QD algebra · **Location:** `apps/quadrature-domains/app/algebra/prove-plan.mjs:723` (`boundarySimpleFromN` → `Sym.realSolutionCount`), `:683,743` (`schurCohn`)
- **Type:** perf
- **Confidence:** medium
- **Fix-safety:** needs-review
- **Evidence:** the proof-tree walk (`runProofTree`/`analyzeLeaf`) awaits `ctx.classify()` /
  `ctx.solveCertified()` (worker-offloaded), but the boundary-univalence helpers it calls are **synchronous**
  and hit `Sym` directly: `boundarySimpleFromN` builds a 4-variable system `[Nr.realPart, Nr.imagPart, circ,
  circ]` and runs `Sym.realSolutionCount(...)` (exact grevlex Gröbner + O(D⁴) BigInt Hermite trace) inline.
  It is bounded (`realSolutionCount` fails past `maxHermiteDim = 64`, `sym-core.mjs:4227`), but for a mid-size
  quotient dimension the BigInt inertia can still stall the UI for a noticeable spell.
- **Why it matters:** these run during an explicit "prove / auto-reduce & solve" action (not a live drag), so
  it is a stall on a user-initiated op rather than a per-frame regression — hence LOW. But it is inconsistent
  with the deliberate Q2 offloading of the other heavy ops.
- **Recommendation:** if these boundary checks are ever wired onto a live/hover path, offload via a
  `runJob` op (there is no `boundarySimple`/`momentBoundarySimple` op today); for the explicit-action path a
  `setBusy` cursor is enough. Verify no live caller exists.

---

## Notable confirmations (calibration — these are clean)

- **Exact arithmetic is exact.** `Rational` (BigInt n/d, normalized) and `Gaussian` (ℚ(i)) never touch
  floats; `toNumber`/`toComplex` are output-only. The one float→rational coercion, `_ratFromNumber`
  (`sym-core.mjs:3812`, continued-fraction convergents, denominator-capped), is confined to
  `_momentToGaussian` (shape-from-moments input) and honestly documented ("a genuinely irrational float
  rounds to a close rational"); `shapeFromMoments` reports exact QD-order + Prony poly but **numeric**
  nodes/weights, not dressed as `=`.
- **No convention-factor (π / 2πi) leakage.** `sym-core` is pure ring/ideal machinery — no π, no 2πi, no
  `dA` normalization; consistent with ADR-0006. The `1/(2πi)` and `dA=dx dy/π` conventions live at the QD
  app edge, not here.
- **Honest labeling throughout.** `factor` distinguishes `reducible` / proved-`irreducible` / `undetermined`
  (a cap, not a claim) and verifies every returned factor divides the input via `mpolyExactDiv`
  (`sym-core.mjs:2423`). `schurCohn` resolves the singular/on-circle case exactly and returns
  `degenerate/resolved` flags; `schurCohnInterval`/`_hermitianInertiaInterval` return `certified:false`
  rather than guess a sign at a straddling pivot (`:4802`) — explicitly to avoid a false `=` on the univalence
  verdict. `solveZeroDim` returns numeric `{re,im}` solutions with a `complete` flag (never `exact:true`).
  `realSolutionCount` uses the exact Hermite trace form with exact rational inertia (`_rationalInertia`,
  symmetric congruence + hyperbolic fold, `:4175`).
- **Packed Buchberger kernel is careful.** Int32Array-lane monomials, the `_pKey` 16-bit-per-lane encoding
  bounded by `_P_EXP_MAX` with a clear throw at both growth points (`_pMul` `:2747`, `_ppFromMPoly` `:2765`),
  Gebauer–Möller pair pruning + sugar selection, content removal via exact Gaussian-integer gcd
  (`_gaussGCD` with a nearest-integer step and a loud guard, `:2984`). The reduced GB is unique so the packed
  path is bit-identical to the map path (differential-tested per the comments); the GVW signature variant is
  kept as an oracle.
- **Cap/guard discipline is universal — except `_recombine`** (the finding above). Every heavy loop
  (`buchberger`, `standardMonomials`, `fglm`, `_ppNormalForm`, `_ppExactDiv`, `reduceGroebner*`,
  `univariateGCD`, Sturm chains, `_rationalInertia`) throws a clear bounded-guard error instead of hanging.
- **Consolidation boundary respected (ADR-0008 / ADR-0015).** `sym-core.mjs` imports only `solver.mjs`;
  the algebra layer imports **no** `@cas/*`. No new duplication of `@cas/exact` (Gaussian ℚ(i)) or
  `@cas/core/poly` (float-only) has crept in — sym-core stays the separate *multivariate exact* engine ADR-0008
  deliberately did not merge, and `@cas/core/poly` is float-only per ADR-0015, so there is no overlap to
  consolidate. **No consolidation action recommended** (respecting ADR-0008/0015). The store correctly
  offloads groebner/dimension/solveZeroDim/classify/factor/… to `SymWorker`; the worker bridge's
  crash/supersede/self-heal handling is robust.

## Coverage

**Examined in depth:** the mathematical kernels of `sym/sym-core.mjs` — Rational/Gaussian arithmetic;
`monomialOrder` (map) + `_packedContext` (packed) for lex/grlex/grevlex/block; `monoKey`/`monoLcm`/`monoDivide`
identity; the full packed Buchberger stack (`_ppNormalForm`, `_ppSPoly`, `_ppMakePrimitive`, `_gaussGCD`,
`_buchbergerPacked`, `_reduceGroebnerPacked`), `buchberger`/`buchbergerSig`/`reduceGroebner`;
`isZeroDimensional`/`standardMonomials`/`quotientDimension`/`krullDimension`/`_minHittingSet`; `fglm` +
`_packedNFCoords`; `solveZeroDim` (shape path) + `linearReduce`; `realSolutionCount` + `_rationalInertia`;
`factor`/`_factorRec`/`_qiFactor`/`_factorOverQ`/`_recombine`/`_combinations`; `squareFreePart`,
`_uniGCDArr`/`univariateGCD`, Sturm isolation; `schurCohn`/`schurCohnInterval`; `runJob` dispatch (all 14 ops
skimmed, classify/factor/eliminate/saturate/triangularize/resolvent read). Plus `algebra/sym-worker.mjs`
(full), the store's classify/factor/heavy-op dispatch, and the ui factor paths + `prove-plan.mjs` univalence
helpers.

**Did NOT cover (honest gaps):** the deep interiors of `factorBivariate` (Gao/Ruppert nullspace) and
`factorMultivariate` (multivariate Hensel lift) — I confirmed both are degree/term-capped and gated on
verified exact division, but did not line-audit the nullspace/Hensel math; `discriminantVariety`,
`comprehensiveGroebnerSystem`, `triangularize`/`triangularDecomposition`/`minimalPrimes`, and `saturate`
internals (read signatures + caps, not full bodies); `sym-radical.mjs` (641 lines) not read; the bulk of
`algebra-store.mjs` (3133 lines) beyond the heavy-op/classify/factor/provenance paths; the bulk of
`algebra-ui.mjs` (4591 lines, mostly DOM glue) beyond the factor + verdict-labeling paths; `algebra-canvas.mjs`,
`cas-export.mjs`, `expr-parser.mjs`, `domain-mini-plot.mjs`, `prove-plan.mjs` beyond the univalence/boundary
core. I did not execute any code (read-only review); the `_recombine` blow-up finding is by inspection —
**concrete confirming test:** call `QD.Sym.factor` on `x^40 - 2` (or `Sym.runJob('factor', {poly:…})`) and
observe it does not return promptly / spikes memory, versus a capped throw.
