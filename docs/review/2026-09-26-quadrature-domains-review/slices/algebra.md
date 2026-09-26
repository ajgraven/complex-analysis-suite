# algebra — summary

Covered `app/sym/sym-core.mjs`, `app/sym/sym-radical.mjs`, and the algebra engine and labelling files (`prove-plan.mjs`,
`algebra-store.mjs` (classify, factor, eliminate and decompose paths), `sym-worker.mjs`, `expr-parser.mjs`, `cas-export.mjs`, `algebra-labeling`,
`-format`, `-latex`, `-moment-parse`), plus the verdict-deciding parts of `algebra-ui.mjs`, the algebra docs, and `docs/algebra-review/`.
I ran node probes against sympy 1.x as an external oracle: 60 random Gröbner bases over ℚ and ℚ(i) (grevlex and lex), 300 random
Schur–Cohn cases, and 120 random ℚ(i) factorisations. I also ran 16 targeted spec files (247 tests, all green).
**Headline:** the Gröbner bases, Hermite counting, Schur–Cohn (exact and interval), RUR and Sturm isolation all agree with the oracles
(0/60 GB mismatches, 0/300 Schur–Cohn mismatches). The defects are elsewhere:
- a reachable **false "Irreducible over ℚ(i) ✓"** certificate in the univariate ℚ(i) factoriser;
- an **uncapped exponential `gcdMV`** that the render path calls synchronously on the main thread;
- **four labelling gaps** where a float-derived or overlapping quantity is shown as exact.

Scratch probes: `/tmp/claude-0/-home-user-complex-analysis-suite/7d83a4a1-9cc2-5097-8eba-a8efea56452d/scratchpad/algebra/`.

## Findings

### ALG-1 [P1] `_qiFactor` returns a false "irreducible" when its shift budget runs out, and the UI prints "Irreducible over ℚ(i) ✓"
- Category: maths / labelling
- Location: `app/sym/sym-core.mjs:2315` (`SMAX = 2*deg+8`), `:2342` (`return [work]; // irreducible (or no clean shift found)`);
  consumed by `factor()` (`:2451-2455`, status `'irreducible'`), `minimalPrimes`' `isCertPrime` (`:5250`), `mvHenselLift:1366`,
  `henselFactorBivariate:1729`, and `sym-radical.mjs:448` (Abel–Ruffini refusal); shown by `algebra-ui.mjs:2407-2411`.
- Claim: Trager's shifted-norm loop tries only shifts s = 0…2·deg+8 of `x − s·i`. When every one of those shifts makes the norm
  non-squarefree, it falls through and returns the whole polynomial as a single factor. `factor()` then reports
  `status:'irreducible'`, the "proved" status that the UI renders as "Irreducible over ℚ(i) ✓". The number of bad shifts is bounded
  by deg², not by 2·deg+8.
- Evidence (measured, `p1.mjs`, `p2.mjs`, `p1b.mjs`):
  - f = ∏ (x − 1 + 2a·i) for a ∈ {0,…,8,16,24} is 11 distinct linear factors. The bad shifts are s = a_j + a_k, which covers 0…32.
    Output: `deg 11 irreducible nfactors 1 55ms irreducible over ℚ(i) (no nontrivial factorization exists)`.
  - Degree 12 gives the same result.
  - `minimalPrimes([f])` returns `count 1 complete true`, a certified-prime claim for a product of 11 lines.
  - Patching `SMAX = deg*deg + 2` in a scratch copy of sym-core returns `reducible 11 176ms`.
- Confidence: high
- Prior review: new. The 2026-08-23 A3 review called `factor`'s labelling honest, and the cas-corpus has no univariate ℚ(i) case.
- Fix (S): set `SMAX = deg*deg + 1`, which Trager's bound guarantees is enough. On exhaustion, throw a `recombineCap`-style error so the
  status becomes `undetermined` rather than returning `[work]`. Add the product above as a golden test.

### ALG-2 [P1] `gcdMV` blows up exponentially with no cap, and the render path calls `factor()` synchronously on the main thread (tab freeze)
- Category: perf / bug (resource safety)
- Location:
  - `sym-core.mjs:1150-1178` (`gcdMV`: primitive PRS with recursive content gcds; only a 1e5 iteration guard, no cost or time cap);
  - reached through `multivariateSquarefreePart:1224`, `bivariateSquarefreeInX:1205` and `factorMultivariate:1463`;
  - `algebra-ui.mjs:2592` (`FACTOR_AUTO_CAP = 120` *terms*) and `:2604` (`_factorInfo` → sync `store.factorOf`), plus `:2398`
    (`doFactor` sync), `:3536` (suggested actions) and `algebra-store.mjs:3057` (`spuriousFactors`, sync over every reim polynomial).
- Claim:
  - The render-path guard is a term count, not a cost bound. Small trivariate polynomials send `gcdMV(f, f_x)` into minutes of BigInt
    PRS arithmetic.
  - `_factorInfo` runs `S.factor` synchronously whenever the node inspector or the suggested-actions builder renders. The tab
    therefore freezes with no cancel.
  - The 2026-08-23 review said "cap/guard discipline is universal except `_recombine`". `gcdMV` is a second uncapped exponential.
- Evidence (measured):
  - `gcdMV(f, ∂f/∂x)`:
    - f = (x²−y²−2z²)(x²−2xyz−3y): 9 terms, 1516 ms.
    - f = (x³−y²−2z²)(x³−2x²yz−3xy)/x: 9 terms, degree 5 in x, **did not finish in 110 s** (`pmv5.mjs`).
    - f = (x³−y²−2z²)(x²−2xyz−3y): 9 terms, degree 5, **still running after about 25 min** when killed (`pgcd.mjs`).
  - `factor()` on the 9-term product (x³−y²−2z²)(x³−2x²yz−3xy) did not finish in over 240 s (`pmv4.mjs`, killed).
  - Profile of a 12-term trivariate product (3.57 s): 99% of the time is in `gcdMV`, via `multivariateSquarefreePart` (1.3 s) and
    `mpolyExactDiv` (1.2 s). 2.0 s of that is BigInt `bgcd`.
- Confidence: high
- Prior review: reported (A3 MEDIUM, `_recombine`) and partly fixed with the 2 s deadline. The main-thread render-path call it named
  (`algebra-ui.mjs:2602`, `:2398`) is still open, and `gcdMV` is new.
- Fix (M):
  1. Before any gcd, certify squarefreeness by specialisation. If some degree-preserving evaluation of the other variables is squarefree
     in the main variable (`nvarEvaluationPoint` already finds one), the polynomial is squarefree and the gcd can be skipped.
  2. Give `gcdMV` a deadline that throws a cap error, so `factor` returns `'undetermined'`.
  3. Take `factor` off the render path: use the async path only, and show "not scanned" until it returns.
  4. Longer term, use a modular or sparse (Zippel) gcd.

### ALG-3 [P1] Branch-count prose states the wrong direction: branches of a factor split do not "add up to the original", and a decomposition with `complete:false` is not "a lower bound"
- Category: labelling / maths
- Location: `algebra-ui.mjs:3366-3374` (classify verdict), `:555-556`, `:584-586`, `:2362-2369` (decompose card);
  `algebra-store.mjs:1895-1914` (`_factorBranchInfo`); `sym-core.mjs:5210`, `:5277` (`minimalPrimes` complete logic).
- Claim:
  - **(a)** V(p) = ⋃V(fᵢ), but branches overlap wherever the fᵢ share zeros on V(I). The per-branch real counts therefore add up to an
    **upper** bound, not to the total. The verdict says "the branches add up to the original".
  - **(b)** When `minimalPrimes` hits its cap it pushes the unfinished work items onto `leaves` (`:5210`), so the components still
    **cover** V(I). It also sets `complete:false` when a component merely could not be certified prime (`:5277`), which is not a cap
    at all. Yet the UI says "a cost cap stopped the decomposition … may not cover the whole variety … counts add to a LOWER BOUND".
    That is wrong about the cause and about the direction.
- Evidence (measured, `p2.mjs`):
  - I = ⟨xy, x+y⟩ has 1 real solution. The factor-split branches ⟨x, x+y⟩ and ⟨y, x+y⟩ give 1 and 1, which sum to 2.
  - `minimalPrimes([x²−2, y²−2])` returns `count 1, complete false` (the true count is 2 components). Its leaf covers V(I), and no cap
    fired.
- Confidence: high
- Prior review: new. B-4(b) touched the "lower bound" wording for slices only.
- Fix (S):
  - Factor split: "branch counts sum to an upper bound (branches may share points); ✦ Prove pools and dedups them."
  - Decomposition, `complete:false`: "components cover V(I) but may not all be irreducible (not certified prime)". Keep a separate cap
    flag if one is ever needed.
  - Note that the pooled ✦ Prove tree already dedups (numerically; see ALG-8).

### ALG-4 [P1] Shape-from-moments reports an "exact QD-order" and an "exact Prony polynomial" computed from float-snapped input; rounded decimals give a wrong order with a clean residual
- Category: labelling / maths
- Location:
  - `algebra-moment-parse.mjs:14-35` (moments parsed with `Number()`);
  - `sym-core.mjs:3840-3869` (`_ratFromNumber`, continued fraction with denominator ≤ 1e12), `:3947-3957` (`hankelRank`);
  - `algebra-ui.mjs:3808-3810` ("#nodes = the exact QD-order (Hankel rank)", "Prony polynomial (exact)");
  - `algebra-latex.mjs:23-40` (the "exact" polynomial is printed rounded to 1e-6).
- Claim: the Hankel rank is decided exactly, but on rationals snapped from floats. Decimal input approximating any non-trivially-rational
  moment makes the Hankel generically full rank. The card then states a false lower bound on the order, "Order s (≥ …)", and draws
  spurious nodes. The reconstruction residual is computed against the same snapped data, so it cannot detect the error.
- Evidence (measured, `pmom2.mjs`):
  - Input: the 1-node data z = 1/√2, weight 1, typed to 6 decimals: `1, 0.707107, 0.5, 0.353553, 0.25, 0.176777`.
  - Output: `order 3, saturated true`, nodes 0.7071 and −0.243 ± 1.133i, `maxResidual 3.3e-16`.
  - The same happens for node 1/3 typed as `0.333333, …`. Exact input (`1/2, 1/4, …`) correctly gives order 1.
- Confidence: high
- Prior review: new
- Fix (S): parse tokens exactly (expr-parser's `numToMPoly` already turns "0.2" into 1/5). Label the order `=` only when every input was an
  exact rational. For decimal input, report a numerical rank from the singular-value gap, marked `≈`. Print the Prony coefficients
  exactly.

### ALG-5 [P1] "Show exact boundary curve" carries the verdict's `=` badge, but the curve is computed from ratApprox'd coordinates
- Category: labelling
- Location: `algebra-ui.mjs:3586-3600` (`rigor: pr.rigor`); `qd/qd-equations.mjs:1052-1061` (`boundaryCurveFromPhi` runs `_ratApprox`
  on each float coordinate).
- Claim: since X1, an **irrational** algebraic QD earns `pr.rigor = 'exact'`. The boundary-curve action re-uses that badge, but
  Q(w,w̄) comes from continued-fraction approximations of the float coordinates. It is the exact curve of a nearby rational domain,
  not of the proved one. The note says "rationalized solution", but the pill reads `=`.
- Evidence (inferred from code):
  - `showResult({... rigor: pr.rigor ...})` is passed unchanged.
  - `boundaryCurveFromPhi` builds the spec from `_ratApprox(c.re)` and `_ratApprox(c.im)`.
  - `verifySolutionExact`'s exact point, and the RUR, are both available in `certifyLeaf` but never reach this action.
- Confidence: high (code path); I did not run it in the browser.
- Prior review: reported as E2 (`audit/E-reconstruction-verification.md:144`). FINAL_REPORT §9–§12 closed E2 for the fold and boundary
  tests only. It is still open for the displayed curve.
- Fix (S): pass `'estimate'` unless the solution was exact-verified rational. Longer term, see IMP-2.

### ALG-6 [P1] "No real quadrature domain" is labelled `=` when the real count is unknown and only the float filter found nothing
- Category: labelling
- Location: `prove-plan.mjs:444-449` (`analyzeLeaf`).
- Claim:
  - `rigor` is `'exact'` whenever `cl.realCount` is null (for example past the 64-dimension Hermite cap).
  - In that regime the certified RUR also fails (same cap), so `solveNumeric` runs. `real` is then the float filter `|Im| < 1e-4`
    applied to a numeric solve that can be partial.
  - "No real QD" then reads as certified.
- Evidence (inferred): `rigor: (cl.realCount != null && cl.realCount > 0) ? 'partial' : 'exact'`. With realCount null this evaluates to
  `'exact'`, regardless of whether `r.certified` was set.
- Confidence: medium. The logic is certain; I did not construct a quotient of dimension > 64.
- Prior review: new
- Fix (S): return `'exact'` only when `cl.realCount === 0` or `r.certified`. Otherwise return `'estimate'`.

### ALG-7 [P2] The `|z_j|<1` admissibility gate runs on a rationalised float midpoint, not on the certified box; it is the one gate in the `=` chain not decided at the true root
- Category: labelling
- Location: `prove-plan.mjs:103-115` → `qd/qd-equations.mjs:121-127` (`_ratApprox(re)`, `_ratApprox(im)`).
- Claim: X1 moved the fold and boundary tests to the isolating box, but admissibility still compares `ratApprox(mid)` against 1. A node
  within about the box width (tol 1e-12) of |z| = 1 can be classified either way while the verdict keeps `=`.
- Evidence: inferred from code. `saturateMobius` removes |z_j| = 1 exactly, so only near-circle irrational nodes are exposed.
- Confidence: medium
- Prior review: D-1/S1 called this "exact", and it is exact arithmetic on a rationalised point. This is the same pattern PF-1 fixed
  for fold and boundary.
- Fix (S): enclose |z|² with `_intervalPolyEval` over the RUR box, and certify only when the interval excludes 1. Otherwise mark the
  candidate "undecided" and downgrade the verdict.

### ALG-8 [P2] Still open from the prior review: the genuine-QD count D is decided by a numeric 1e-4 comparison yet carries `=`
- Category: labelling
- Location: `prove-plan.mjs:318-322` (`gaugeQuotient`), `solvers/solver.mjs:1779` (`sameDomain(a, b, tol = 1e-4)`, absolute).
- Claim: `certRigor = 'exact'` does not depend on the dedup. Two distinct domains within 1e-4 would merge into an undercount labelled
  `=`. The 1e-4 tolerance is absolute, not scaled to coefficient size.
- Evidence: code, unchanged since the audit.
- Confidence: medium
- Prior review: reported as E3 (LOW–MEDIUM) and still open. FINAL_REPORT §10 calls it a "documented known limit", but the badge does not
  say so.
- Fix (M): see IMP-3. At minimum, downgrade to `≈` when any pair falls in a "close" band (for example 1e-4 to 1e-2 relative).

### ALG-9 [P2] `factor()` skips the squarefree reduction before the bivariate (Gao) path, so repeated factors under-factor or go "undetermined", and the success card hides the caps
- Category: maths (completeness) / labelling
- Location: `sym-core.mjs:2388-2394` (bivariate branch needs a squarefree main variable); `algebra-ui.mjs:2429-2458` (the reducible path
  never shows `fr.caps`).
- Claim:
  - 15 of 120 random ℚ(i) products with repeated factors were wrong against sympy's `factor_list(gaussian=True)`: 10 under-factored,
    reported as `reducible` with a still-reducible factor, and 5 `undetermined`. There were no false irreducibles.
  - (x+y)²(x−y) is `undetermined` while (x+y+z)²(x−y) factors, because the n-variate path does take `multivariateSquarefreePart`.
  - When status is `reducible` with caps, the case list gives no hint that a case may split further.
- Evidence (measured, `puni.mjs`): `{ match: 105, mismatch: 10, undet: 5 }`. For example 4x⁶y⁶−… = x⁴y²(2y−3)²(xy+2)² comes back as 3
  factors, with the last being (2y−3)(xy+2) unsplit.
- Confidence: high
- Prior review: new
- Fix (S): apply `multivariateSquarefreePart` (or a squarefree decomposition) to `cur` before the bivariate branch, as the univariate and
  n-variate paths already do. Render `fr.caps` on the reducible card.

### ALG-10 [P2] `curveGenus` calls reducible or degenerate conics "rational, genus 0"; it and several other engine features are unreachable from the product but documented as capabilities
- Category: maths / structure
- Location: `sym-core.mjs:5363` (`pa === 0` branch ignores `irreducible === null` and smoothness); dead exports `curveGenus:5336`,
  `comprehensiveGroebnerSystem:5009`, `verifySOS:4591`, `sturmHabicht`/`realRootCountSturm:1048-1086` (flagged "pinned EMPIRICALLY"),
  `idealQuotient:5615`. There are no references outside sym-core and tests (grep).
- Evidence (measured, `p3.mjs`):
  - `x²+1`, `y²−y` and `(x+y)²` each give `irr null genus 0 rational true | a conic`. All three are pairs of lines or a double line.
  - `y²−x³` (irreducible, pa = 1, singular) gives genus null, although genus < 1 forces it to be 0.
- Confidence: high
- Prior review: new
- Fix (S): for d = 2, require `smooth` (a conic is irreducible iff smooth) or `irreducible === true`. When pa = 1, irreducible and singular,
  return genus 0 and rational. Either wire the dead features into the UI or mark them "engine-only, untested in product" in
  ALGEBRA_MODULE.md §4.

### ALG-11 [P2] Test gaps shaped like the defects above
- Category: test
- Location: `vitest/exact-symcore-differential.test.ts` (field operations only); `vitest/fixtures/cas-corpus.json` (11 bivariate,
  8 multivariate, 6 GB, 14 real-root, 11 resultant cases; **no univariate ℚ(i) factorisation and no repeated-factor bivariate case**).
- Claim:
  - Both engines implement the Bareiss resultant, the discriminant and squarefree decomposition (`@cas/exact` `resultant.ts` and
    `squarefree.ts` against sym-core `resultant`, `discriminant` and `squareFreePart`), but the ADR-0008 differential compares only
    `+ − × ÷`.
  - ALG-1 and ALG-9 would each have been caught by one corpus entry.
  - No test puts a time bound on `factor`/`gcdMV` for small inputs (ALG-2).
- Confidence: high
- Prior review: new
- Fix (S): extend the differential to resultant, discriminant and squarefree on random ℚ(i) univariates. Add ALG-1's product, and ALG-9's
  repeated-factor cases, to the corpus. Add a "factor of any ≤ 20-term input returns in < 2 s or `undetermined`" test.

### ALG-12 [P2] Expression parser: unbounded exponent combined with linear-time `MPoly.pow` hangs the tab
- Category: bug (resource safety)
- Location: `algebra/expr-parser.mjs:133-140`; `sym-core.mjs:287-291` (`pow`: `for (i < k) out = out.mul(this)`; the same loop appears
  at `:5665` and `:5737`).
- Evidence (measured, `pexp.mjs`): `parse('x^100000000000000000000')` did not return within 60 s. The same happens for any large exponent
  typed into Define-substitution.
- Confidence: high
- Prior review: new
- Fix (S): cap the exponent (for example at 1000, with an error message) and use binary powering.

### ALG-13 [P2] `mvHenselLift` recombination returns "irreducible" without verifying it, and can drop an unmatched remainder
- Category: maths (robustness)
- Location: `sym-core.mjs:1320-1335` (`_mvDioph` solves only up to `e.degreeIn(w)`, not the final factor's degree bound), `:1407-1421`
  (`if (!found.length) return { ok:true, factors:[fp] }`; a partially-found list returns without `remaining`).
- Claim:
  - If a lift is inaccurate (the diophantine truncation bound, or a bad image), recombination finds no factor, and the code returns f as
    **irreducible** with `complete:true`. If it finds some factors, the leftover `remaining` is not appended, which silently drops a
    component from a case split.
  - Compare `_recombine`, which pushes its leftover `Bcur`.
- Evidence (inferred from code; 7 hand-picked trivariate products factored correctly, `pmv2.mjs`): the randomised trivariate battery
  (`pmv6.mjs`, products of two irreducible monic-in-x trivariates) printed no failure before I terminated it after about 5 CPU-minutes,
  and throughput was throttled by ALG-2, so the number of completed cases is unknown and small.
- Confidence: low (a defensive gap; not reproduced)
- Prior review: new
- Fix (S): after recombination, append `remaining` if it is non-constant. Return `complete:false` rather than "irreducible" when
  `found` is empty but the image split into two or more factors. Use the degree bound deg_w F in `_mvDioph`.

### ALG-14 [P3] Stale or over-claiming documentation
- Category: stale-doc
- Location and claims in `docs/ALGEBRA_MODULE.md`:
  - §1/§7 say "everything … is computed in exact arithmetic … its results are proofs, not estimates". Moment input, gauge dedup,
    admissibility and the displayed boundary curve are float-derived (ALG-4/5/7/8).
  - §4 says "Hilbert degree". `dimensionDegree` returns null for positive-dimensional ideals.
  - §4 lists `curveGenus`, `verifySOS` and comprehensive Gröbner systems as capabilities. None is reachable from the UI (ALG-10).
  - §6 says "Offload: Heavy jobs … run in a native-module Web Worker". Render-path `factor` runs synchronously on the main thread
    (ALG-2).
- `algebra-ui.mjs:3810`: "Prony polynomial (exact)" is printed rounded to 1e-6.
- Confidence: high
- Prior review: new
- Fix (S): reword, and add a short "where floats enter" list.

### ALG-15 [P3] Still open from the prior review: `parametricRealCount1D` samples one point per cell
- Category: maths
- Location: `sym-core.mjs:4340-4360`.
- Claim: C LOW-1's fix (two samples per cell with a mismatch check, or stating the genericity assumption) has not been done. Cell counts
  are labelled `=`.
- Confidence: high (code unchanged)
- Prior review: reported (`audit/C-certified-solving-counting.md:209`) and still open.
- Fix (S): as recommended there.

## Structure (focus 4): ADR-0008

**Is the separation still justified?** Yes, for the multivariate and Gröbner layer: there is still no second consumer, and the
oracles agree. The duplication is now wider than the ADR's stated cost of "ℚ and ℚ(i) twice":
- resultant and discriminant are implemented in both engines;
- squarefree decomposition is implemented in both engines;
- ADR-0047 (proposed) adds a third copy of Berlekamp–Zassenhaus, Cantor–Zassenhaus and Hensel to `@cas/exact`, where
  `_factorOverQ:2270` is already a working one.

**Recommendations:**
- ADR-0047's planned golden cross-check with QD should include ℚ(i) inputs whose norm needs several shifts (ALG-1) and repeated factors
  (ALG-9).
- The ADR-0008 differential should grow past field arithmetic (ALG-11).
- A cheap consolidation, allowed because apps may import packages, is to have QD's `_factorOverQ` delegate to `@cas/exact`'s
  `factorOverZ` once that lands, leaving the multivariate stack in QD.
- Dead code: see ALG-10.
- `sym-core.mjs` is 6,045 lines in one IIFE. It would split along its own section headers (field / MPoly / factor / Gröbner / zero-dim /
  real / series) with no API change.

## Improvements

- **IMP-1: special points and the δ-invariant of ∂Ω.** Value: high (research). Cost: M.
  - The QD boundary curve Q(w,w̄) = 0 is rational: it is parametrised by φ, so its genus is 0. Its degree ≥ 3 makes it singular, which
    is why `curveGenus` returns null exactly on QD curves.
  - Compute the singular locus ⟨Q, Q_w, Q_w̄⟩, which is zero-dimensional. Count and classify its real points exactly with
    `realSolutionCount` over reim: nodes, cusps, and acnodes, which are the isolated "special points" of Gustafsson and Shapiro.
  - Check pa − Σδ = 0 as a certificate.
  - This gives a certified readout of "degree d, arithmetic genus pa, r special points in Ω, cusps on ∂Ω". It is directly a thesis-level
    invariant, and it also fixes ALG-10's use case.
- **IMP-2: the exact boundary curve at an irrational algebraic root.** Value: high. Cost: M.
  - Use the RUR the prover already carries: substitute g_v(t) into the boundary construction, then take
    Q̂(w,w̄) = Res_t(Q(w,w̄;t), minPoly(t)). This is a ℚ(i)-rational curve, the product over Galois conjugates.
  - Factor Q̂ and pick the component through a numeric boundary point.
  - The curve then honestly earns `=` (ALG-5).
- **IMP-3: an exact gauge quotient.** Value: medium to high. Cost: M.
  - Put the rotation normalisation into the certified system (Im φ′(0) = 0 as an equation, and Re φ′(0) > 0 decided at the RUR box by
    interval arithmetic). Each domain then appears exactly once, and `sameDomain` is no longer needed on the `=` path (ALG-8).
- **IMP-4: a fast squarefree test, fast gcd and a factor deadline.** Value: medium (unfreezes the workspace on ordinary 3-variable
  systems). Cost: M. See ALG-2.
- **IMP-5: exact and decimal moment input with honest labels, plus a numerical-rank mode.** Value: medium. Cost: S. See ALG-4.
- **IMP-6: certified admissibility at the box.** Value: medium. Cost: S. See ALG-7. Together with IMP-3 this closes the last
  float-derived step in the `=` chain.

## Coverage

- Not reviewed in depth:
  - the internals of `algebra-ui.mjs` beyond the verdict, label and factor paths (UI slice);
  - `qd-equations.mjs` and `qd-constraints.mjs` system generation (read only `nodeInsideDisk` and `boundaryCurve*`);
  - the correctness of `triangularize`, `discriminantVariety` and `comprehensiveGroebnerSystem`;
  - FGLM and `solveZeroDim`'s eigenvalue fallback;
  - the Series and Padé layer;
  - the packed GVW kernel, which was exercised only indirectly through `buchberger`;
  - `cas-export`'s `parseRCTD`/msolve import;
  - ADR-0006 convention checks (the algebra is pure ring and ideal work, with no π or 2πi found).
- Not run:
  - the full QD vitest project (about 20 min). I ran 16 targeted files, 247 tests, all green;
  - the browser;
  - a quotient of dimension > 64 for ALG-6.
- Oracle limits:
  - sympy gaussian factorisation of random trivariate products was too slow to use as an oracle (timed out), so 3-variable
    factorisation correctness rests on hand cases and self-consistency.
  - The randomised trivariate battery was throughput-limited by ALG-2 itself.
