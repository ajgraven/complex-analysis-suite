# Track B — Elimination & Decomposition (audit)

Scope: `apps/quadrature-domains/app/sym-core.mjs` (5727 L) — the elimination/ideal/decomposition
layer (`resultant`, `discriminant`, `reducedDiscriminant`, `pseudoRemainder`, `buchberger`,
`normalForm`, `saturate`, `eliminationIdeal`, `idealQuotient`, `idealIntersect`, `minimalPrimes`,
`triangularize`, `triangularDecomposition`, `radicalZeroDim`, `isZeroDimensional`, `krullDimension`,
`quotientDimension`, `resolvent`, `realSolutionCount`, `solveZeroDim`, `factor`) — and how
`apps/quadrature-domains/app/algebra/algebra-store.mjs` DRIVES them (`classify`/`_classifyImpl`,
`_eliminate`, `resolventOf`, `triangularizeNodes`, `currentReimSystem`, `spuriousFactors`). Read-only.
Evidence = source reading + standalone `node` experiments against the live modules
(`solver.mjs`→`qd-varscheme.mjs`→`sym-core.mjs`→`qd-equations.mjs`).

## 1. Summary

**The elimination/decomposition PRIMITIVES are sound; the WORKFLOW that drives them for
existence/uniqueness is not saturation-correct, and this produces a concrete, demonstrable over-count
of quadrature domains on the simplest possible input (a disk).** The individual operators are correct
and honestly labeled: `saturate` (Rabinowitsch), `eliminationIdeal` (Gröbner elimination trick),
`idealQuotient`/`idealIntersect` (colon/intersection), `reducedDiscriminant` (strips the leading-
coefficient degree-drop stratum by one exact division), `minimalPrimes` (facstd + a genuine
`isCertPrime` re-check of completeness), and the whole zero-dim count stack (`isZeroDimensional` →
`realSolutionCount` via the Hermite trace form) are all mathematically right, and the count stack is
correctly **radical-free** (it counts *distinct* real/complex points, not multiplicities). The
zero-dimensionality gate is consistently applied before every finite-count routine, so a genuinely
positive-dimensional ideal is refused a count rather than mis-counted.

**The defect is that the existence/uniqueness path never saturates the Möbius denominators that the
generator cross-multiplied into the equations.** `generateClassicalBounded` clears `φ`'s
`(1−z̄_{j'}z_j)` denominators by *lifting the pure-polynomial terms onto them* (so `(●)` and `(★)`
literally contain `a_j·(1−z̄z)` and `C_{j,s}·(1−z̄z)^{…}`), and the count pipeline
(`currentReimSystem` → `classify`) then analyzes `V(cleared system)` directly — which is
`V(genuine QDs) ∪ {denominator = 0}`. The correct operator to remove the `{1−z̄z=0}` degeneracy
locus, `saturate` (`I : f^∞`), is present and correct in the Sym API but is **never invoked in the
generation, reim, or classify path** and is not wired to any UI action. Consequences, both proven by
`node` repro against the live code:

- **Over-count (false positive).** For the genuine single-pole DISK QD, after the documented
  `assumeReal` slice (the same lever the `★ Auto-reduce` flow auto-applies), `classify` returns
  `realCount = 4` — labeled "4 real quadrature domains" — when the truth is 1 (2 up to the `±A`
  gauge). The extra 2 are `z₁=±1`, i.e. the pole preimage *on* `|z|=1` (an unbounded, non-QD
  degeneracy). Saturating by `(1−z₁²)` recovers the correct `realCount = 2`.
- **False positive-dimensional (can't-certify).** For the same disk without the slice, `classify`
  returns `zeroDim:false` ("positive-dimensional family — add a constraint"), because the `{|z₁|=1}`
  locus is a spurious 1-dimensional circle. Saturating recovers `zeroDim:true`, quotient dim 2.

This is exactly the audit's stated #1 risk ("unsaturated denominator/degeneracy ideals ⇒ spurious
components counted as QDs"), realized end-to-end. It is the downstream, count-side confirmation of
**Track A's Finding A-1** (the generator drops-and-does-not-record the denominators); A-1 explicitly
delegates the saturation to this track. The secondary findings are the interactive `eliminate`
injecting extraneous resultant leading-coefficient factors (a Gröbner `eliminationIdeal` exists and is
correct but is not the default elimination action), and `triangularize`'s regular-chain *initials*
being dropped by the store/UI so the triangular decomposition is presented without its own documented
"may over/under-decompose off the initials" caveat.

Soundness verdict: **primitives sound; the existence/uniqueness verdict is neither an upper nor a
lower bound on the true QD count** (it over-counts on the disk and can under-certify via false
positive-dimensionality), because a mathematically-required saturation step is missing from the
pipeline that Track A handed to this track.

## 2. Confirmed strengths (brief)

- **Zero-dimensionality is gated before every finite count.** `isZeroDimensional`
  (`sym-core.mjs:3241`) is the standard test (each variable has a pure-power leading monomial) and is
  checked before `solveZeroDim` (`:3554`, `:3719`), `realSolutionCount` (`:4147`), `resolvent`
  (`:4823`), `fglm` (`:3379`), and in `_classifyImpl` (`algebra-store.mjs:1774`). A positive-dim ideal
  gets `realCount:null` + a `krullDimension` (`:3310`, `dim = n − minHittingSet(support)`, correct),
  not a nonsense finite count. (Answers Q5 positively.)
- **Real counting is radical-free (Hermite trace form).** `realSolutionCount` (`sym-core.mjs:4138`)
  builds `H[i][j]=trace(M_{b_i}M_{b_j})` and returns `realCount = signature`, `complexCount = rank`,
  `multiplicityCount = D`. The signature/rank of the trace form count *distinct* real/complex zeros
  regardless of multiplicity, so no explicit radical is needed. Verified: `(x−1)²` →
  `realCount=1, complexCount=1, multiplicityCount=2`. (Answers Q6: the radical is not needed, and the
  distinct counts are exact.)
- **`reducedDiscriminant` strips the spurious degree-drop stratum.** `sym-core.mjs:640-644`:
  `disc/lc_v(p)` by one exact division yields `±disc_v`, whose zero set is exactly the genuine
  double-root locus — no `{lc_v=0}` branch. The comment correctly warns single-division, not
  `gcd(Res,lc^k)`, is the right reduction. (Answers Q2 for discriminants.)
- **`parametricRealCount1D` / `discriminantVariety` are the model of correct elimination here.**
  Both build the univariate eliminant by **Gröbner `eliminationIdeal`** (`sym-core.mjs:4236`, `:4335`)
  — the comment `:4197` "eliminated by Gröbner projection — no extraneous factors" is accurate — and
  take the border as `reducedDisc_u(f) ∪ lc_u(f)` (`:4250-4253`, `:4345-4347`), i.e. they track BOTH
  the double-root stratum AND the escape-to-∞ (`lc=0`) stratum, with the certified Hermite count as an
  independent oracle per cell. This is exactly how the boundary elimination *should* be done.
- **`boundaryCurve`'s raw resultant is clean.** `qd-equations.mjs:843` uses
  `Res_t(w·q−p, w̄·q̃−p̃)`. Its two eliminands' leading coefficients depend on *disjoint* variables
  (`lc_t(f)=L·w−c_f` in `w` only; `lc_t(h)=L̄·w̄−c_h` in `w̄` only), so the extraneous
  `{lc_t f = lc_t h = 0}` locus is a single point (codim 2), never a spurious curve factor. Verified:
  unit disk → `1−ww̄`; `w₀=1` shifted disk → `w+w̄−ww̄`; two branches / double pole → irreducible,
  no extraneous factor. (Answers Q2 for the boundary-curve resultant: no bug.)
- **`minimalPrimes` reports completeness honestly.** `sym-core.mjs:4950` facstd-decomposes and
  re-verifies via `isCertPrime` (`:5018-5041`): `complete` is set true only if it terminated AND every
  leaf is *certified* prime (linear ideal, or a principal hypersurface the univariate/bivariate/
  n-variate factorizer certifies irreducible). Verified: `V(xy)`→2 primes complete; `V(x²+y²−1)`→1
  complete; the height-2 prime `V(x²−y,xy−z)`→`complete:false` (honestly conservative — it cannot
  certify the non-principal leaf, even though it is prime). The Wang non-monic limitation of the
  n-variate factorizer surfaces as `factorMultivariate` returning `complete:false`, which `isCertPrime`
  propagates to `complete:false`. (Answers Q3: honest, sometimes conservatively incomplete, never
  over-claims.)
- **The ideal-op primitives themselves are correct.** `saturate` (`:5228`, Rabinowitsch `1−w·f` under
  an elimination order, fresh-witness guard), `eliminationIdeal` (`:5266`), `idealIntersect` (`:5280`,
  `t·A+(1−t)·B ∩ k[x]`), `idealQuotient` (`:5297`, `(1/f)(I∩⟨f⟩)`) are textbook-correct. The problem
  (Finding B-1) is that they are *not called*, not that they are wrong.

## 3. Findings

### B-1 — Existence/uniqueness `classify` over-counts QDs (and falsely reports positive-dimensional) because the cleared Möbius denominators are never saturated (SEVERITY: high)

The count pipeline analyzes the raw cleared variety, which is `V(QDs) ∪ {1−z̄z = 0}`. On the simplest
QD this over-counts by exactly the number of denominator-degeneracy points on the analyzed slice.

**Evidence — the denominator is cross-multiplied in at clear time.** `generateClassicalBounded` forms
each block as an `FRatFn` difference and calls `.clearDenominators()`:
- `qd-equations.mjs:206-207` locator `(●)_j`: `phiS[0].sub(rfVar(a_j))` then `.clearDenominators()`.
- `qd-equations.mjs:229-230` principal `(★)_{j,s}`: `rfVar(C_{j,s}).sub(rhs)` then `.clearDenominators()`.

`FRatFn.clearDenominators()` returns `this.num` (`sym-core.mjs:5440`), but the *subtraction that
precedes it* already lifted the pure-polynomial term onto `φ`'s Möbius denominator: `FRatFn.add`
(`:5422-5427`) computes the common denominator (`_denMergeMax`) and `_liftToCommon`
(`:5397-5405`) multiplies the denominator-free operand by the common `D`. So the cleared numerator
literally contains `a_j·D` and `C_{j,s}·D^{…}`. Printed from the live generator, single simple pole:

```
[(●)_1]     Ab1_1 z1 - a1 + a1 z1 zb1              =  Ab1_1·z1 − a1·(1 − z1·zb1)
[(★)_{1,1}] -A1_1 Ab1_1 + C1_1 - 2 C1_1 z1 zb1 + C1_1 z1^2 zb1^2
                                                  =  −A1_1·Ab1_1 + C1_1·(1 − z1·zb1)^2
[(gauge)]   A1_1 - Ab1_1
```

Both `(●)` and `(★)` vanish on `{D=0}={1−z1·zb1=0}` with `A=Ab=0` — a spurious component. Under the
reim transform `z1·zb1 → x1²+y1² = |z1|²` (`algebra-store.mjs:1708`), so the spurious locus is
`{|z1|=1}`.

**Evidence — the pipeline never saturates.** `currentReimSystem` (`algebra-store.mjs:1725-1732`) is
just `equality nodes → _applyParamValues → _reimTransform`: no saturation, no univalence, no
`|z|<1`. `_classifyImpl` (`:1764-1780`) runs `buchberger → isZeroDimensional → realSolutionCount`
on that system directly. A repo-wide grep shows `saturate` is called nowhere in the generation/reim/
classify/solve path (only defined `sym-core.mjs:5228`, exported `:5705`, and *declined* in
`spuriousFactors` with the comment "saturate is deliberately NOT suggested — saturating by z₁ would
delete the z₁=0 QD component", `algebra-store.mjs:2652`). `saturate`/`idealQuotient` are not wired to
any UI action.

**Evidence — concrete over-count (repro, live modules).** Genuine centered disk QD: single simple
pole `a=1/3`, residue `1`, `w₀` fixed `=1/3` (the solve default = pole centroid), then
`assumeReal(z1, A1_1)` (the reim `x/y` split with `z1,A1_1` held real — exactly what
`realAxisSymmetry`/`★ Auto-reduce` applies, `algebra-ui.mjs:1502` "the ★ Auto-reduce path
auto-applies assumeReal"). The reim system reduces to `{A·z1 = 0, (1−z1²)² − A² = 0}` and:

```
RAW classify:  zeroDim=true  realCount=4  complexCount=4  multiplicityCount=6   → "4 real quadrature domains"
SATURATE by (1−z1²):  realCount=2  complexCount=2  multiplicityCount=2          → the TRUE count
```

Solving by hand: `A=±(1−z1²)`, `A·z1=0` ⇒ (i) `z1=0, A=±1` — the physical disk (2 = the `±A` gauge =
**1 domain**); (ii) `z1=±1, A=0` — **spurious**: the pole preimage lies on `|z|=1`, so
`φ(t)=w₀+Ā t/(1−z̄₁t)` has a pole *on* the unit circle and `Ω=φ(𝔻)` is unbounded — not a bounded QD.
`classify` counts all four and the verdict text labels them "quadrature domains".

**Evidence — false positive-dimensional (repro).** Same disk WITHOUT the slice (full reim,
`w₀` fixed): `classify → {zeroDim:false, krullDim:1}` (the spurious `{|z1|=1}` circle). Saturating the
complex system by `(1−z1·zb1)` → `zeroDim:true, quotientDim:2, krullDim:0`. So the tool refuses to
certify the disk's uniqueness. With `w₀` free, `krullDim:3`.

**Evidence — the verdict presents `realCount` as the QD count.** `algebra-ui.mjs:1574-1578`:
`… : cl.realCount + ' real quadrature domains'`, `'Unique quadrature domain (1 real solution)'`; the
store comment `algebra-store.mjs:1736-1738` says "the number of REAL solutions (= actual QDs, via the
Hermite trace form)". So there is no honest re-label at the count site; the over-count is surfaced as
QDs. (A separate manual "Certify univalence" tool, `algebra-ui.mjs:910`, WOULD filter the non-univalent
`z1=±1` solutions — a partial mitigation, but it is not part of the existence/uniqueness verdict, and
the `assumeReal` "lower bound" caveat, `:1519`, is not a lower bound on TRUE QDs once the count is
inflated.)

**Evidence — this is untested.** The store test only asserts existence, not correctness:
`algebra-store.test.js:731-732` `ok('… at least one real solution (exists)', cl.realCount >= 1)`. The
`cardioid-uniqueness.test.js` case that DOES get the right count (`realCount=2`) uses `a₁=0`, pole at
the origin, where `z₁=0` is forced and `substituteValues([z1=0])` (`:126`) removes the `z1` freedom
*before* the denominator bites — a special case the `spuriousFactors` pin-`z₁` suggestion handles.
For `a_j≠0` the locator does not factor through `z₁` (verified: `Ab1_1 z1 − a1(1−z1 zb1)` has no `z₁`
factor), so `spuriousFactors` finds nothing to pin and the user gets the over-count / false
positive-dim with no suggested resolution.

**Math.** Clearing `num/D = 0` to `num = 0` enlarges the solution set from `{num=0} \ {D=0}` to
`{num=0} ⊇ {num=0}∩{D=0}`. Here `{D=0}={|z_j|=1}` carries genuine points of the cleared ideal
(`A_{j,·}=0` makes every block vanish there). The correct object is the saturation
`I : (Π_{j,j'}(1−z̄_{j'}z_j))^∞`, which removes exactly the components contained in `{D=0}`. When
`{D=0}` is positive-dimensional the gate returns "positive-dimensional" (false negative); when a
slice (`assumeReal`) cuts it to isolated points those points are counted (false positive). Both are
wrong relative to the true bounded-QD count, and `realCount` is neither an upper nor a lower bound.

**Fix direction.** In the count/solve path (`_classifyImpl`, `solveReal`, `realSolutionCount` callers),
saturate the reim ideal by the Möbius denominator product before `isZeroDimensional`/
`realSolutionCount` — `I : (Π_{j,j'}(1−z̄_{j'}z_j))^∞`, using the existing correct `saturate`. Track A
(A-1) recommends the generator *record* `Π(1−z̄_{j'}z_j)·φ′` as an `excludedLocus`/`saturateBy` field
at clear-time (it is in hand there); this track is the consumer that must then call `saturate` with it.
Cheaper interim: after a zero-dim solve, drop any solution with `|z_j|≥1−ε` (the univalence/in-disk
filter) *before* forming the count, and/or route the existence/uniqueness verdict through the
univalence certifier rather than presenting raw `realCount` as "quadrature domains". Minimum honest
step: relabel the `classify` count "real algebraic solutions (may include boundary/degenerate
non-univalent maps)" until saturation lands.

### B-2 — Interactive `eliminate` uses the raw Sylvester resultant, injecting extraneous leading-coefficient factors that `eliminationIdeal` (Gröbner) would not (SEVERITY: medium)

**Evidence.** `_eliminate` (`algebra-store.mjs:1461-1481`) does `res = S.resultant(a.poly, b.poly,
varName)` and emits `res` as the derived node, rejecting only `res.isZero()`. `resultant`
(`sym-core.mjs:592`) is the raw Sylvester resultant. Repro (live):

```
Res_x(y·x + 1,  y·x² − x) = 2y          ← "y = 0 is necessary"
TRUE elimination ideal ⟨f,g⟩ ∩ k[y] = ⟨1⟩   (Gröbner eliminationIdeal)  ← f,g have NO common root
```

The resultant is *purely* the extraneous `{lc_x(f)=lc_x(g)=0}={y=0}` factor: at `y=0`, `f=1≠0`, so
there is no common root, yet `Res=2y` claims `y=0`. The derived node `2y=0` is a spurious constraint.

**Math.** `Res_x(f,g)=0 ⟺` (common root) `OR` `(lc_x f = lc_x g = 0)`. When `lc_x f` and `lc_x g`
share a factor, that factor is codim-1 in `V(Res)` but absent from the true elimination ideal
`⟨f,g⟩∩k[y]`. The classical gap `⟨f,g⟩∩k[y] ⊆ ⟨Res⟩` can be strict. `reducedDiscriminant` performs the
analogous strip for the `Res(p,p')` case (divide out `lc`), but no such strip is applied to the
general elimination resultant.

**Propagation.** After `eliminate`, `currentReimSystem` defaults to `lastColumnNodes()`
(`algebra-store.mjs:1727`), so a `classify`/`solve` on the post-elimination column analyzes the
resultant's (spurious-inflated) variety, and the `{lc=0}` locus can reach the verdict. The correct
tool is already present — `eliminationIdeal` (Gröbner, `sym-core.mjs:5266`) returns `⟨1⟩` here — and is
exposed via the "Gröbner / eliminate-vars" action (`ui-strings.mjs:302`), but the single-shared-var
"Eliminate" button (`algebra-ui.mjs:1381`) uses the raw resultant.

**Fix direction.** Either strip the extraneous factors from the resultant (divide by
`gcd(Res, lc_v(f)·lc_v(g))`, or the reduced-resultant analogue), or make the pairwise "Eliminate"
route through `eliminationIdeal` for the shared variable (Gröbner projection, no extraneous factor) —
at least when the user then classifies/solves the derived column. At minimum, label a resultant node as
"necessary condition (⊇ the projection; may carry `lc=0` branches)".

### B-3 — `triangularize`'s regular-chain `initials` (the `initial≠0` regularity conditions) are dropped by the store/UI; the triangular decomposition is presented without its documented over/under-decomposition caveat (SEVERITY: medium)

**Evidence.** `triangularize` (`sym-core.mjs:4886-4938`) explicitly returns `initials`/`mainVars` and
warns (`:4879-4885`): "⚠ The chain is TRIANGULAR, NOT a regular chain: it is not saturated by the
pivots' initials, so where an initial vanishes the chain may describe a SUPERSET (spurious branches)
or MISS components. The returned `initials`/`mainVars` are provided so the caller can check them — the
chain is UNCERTIFIED without that check." The store's `triangularizeNodes`
(`algebra-store.mjs:2059-2084`) consumes `res.chain`, `res.mainVars`, `res.freeVars`,
`res.contradiction` — but **not `res.initials`**; it emits only the chain polynomials. `grep -n
initials apps/quadrature-domains/app/algebra/*.mjs` returns nothing. The UI `doTriangular`
(`algebra-ui.mjs:1476-1488`) reports only `freeVars` ("⇒ a positive-dimensional family") and
`contradiction`, with no initial-vanishing caveat.

**Math.** A Wu triangular set `T` computes `V(I) ⊆ V(T) ⊆ V(I) ∪ V(init T)`; the equality
`V(I)\V(init T) = V(T)\V(init T)` holds only off the initials. Presenting the chain (and the "free
variable ⇒ positive-dimensional" reading) without the `init≠0` conditions can (a) drop the
`init=0` branches — missing QDs that live where an initial vanishes — or (b) show spurious branches on
`init=0`. Since bounded-QD systems routinely have parametric initials that vanish on the same
Möbius/degeneracy loci as B-1, this is not hypothetical.

**Fix direction.** Surface `res.initials` alongside the chain (as companion `init_i ≠ 0` side
conditions / a caveat line), and either (i) split the `init_i = 0` cases as their own branches, or
(ii) label the triangular column "uncertified off the initials — the Gröbner solve is the oracle" (the
sym-core comment already says the reduced GB is the correctness oracle, `:4854`). Do not let the
`freeVars ⇒ positive-dimensional` message stand without the initials, since it can be an artifact of an
unsaturated pivot.

### B-4 — Honest-labeling / coverage gaps around the count verdict (SEVERITY: low)

**Evidence.** (a) `classify.realCount` is presented verbatim as "N real quadrature domains"
(`algebra-ui.mjs:1574-1578`) with no re-label acknowledging it counts the *algebraic* variety
(inclusive of non-univalent / `|z|=1` degeneracies) — see B-1. (b) The `assumeReal` slice caveat
(`algebra-ui.mjs:1511-1519`) states the sliced count is a "LOWER BOUND on the general one"; that is a
lower bound on the (inflated) *algebraic* count, not on the true QD count — and B-1 shows the sliced
count can *exceed* the true QD count, so a reader taking "lower bound" as "≤ #QDs" is misled. (c) The
`classify` correctness test asserts only `realCount >= 1` (`algebra-store.test.js:731-732`), so no test
would catch the B-1 over-count; there is no golden `realCount == (known QD count)` assertion for a
non-origin-pole case.

**Fix direction.** Fold into B-1's relabel; add a golden test that `classify` (post-saturation) returns
the *exact* known QD count for a non-origin single-pole disk (currently 4, should be 2) and for a
2-pole case, so the saturation fix is regression-locked.

## 4. Question-by-question

1. **Saturation (critical).** Denominators are cleared at `qd-equations.mjs:207,230` (locator/star)
   and `:374` (Schwarz `(★_S)`) via `FRatFn.sub(...).clearDenominators()`, which cross-multiplies the
   Möbius `D=Π(1−z̄_{j'}z_j)` into the numerator (`FRatFn.add`/`_liftToCommon`,
   `sym-core.mjs:5397-5427`). **No saturation follows anywhere in the existence/uniqueness path.**
   `saturate` (`:5228`) is correct and exported but never invoked there and unwired in the UI. → **B-1**
   (proven over-count `4 vs 2` on the disk; false positive-dimensional without the slice).
2. **Resultant extraneous factors.** For `boundaryCurve` — **clean** (disjoint `w`/`w̄` leading
   coefficients ⇒ codim-2 extraneous locus; proven). For discriminants — `reducedDiscriminant` strips
   `lc` correctly. For the interactive pairwise `eliminate` — **not stripped**; raw resultant injects
   the `{lc=0}` factor (`Res_x=2y` vs true `⟨1⟩`). → **B-2**.
3. **`minimalPrimes` completeness.** Returns the minimal primes with an honest `complete` (re-checked
   by `isCertPrime`, `:5018-5041`); `complete:false` on any uncertifiable leaf incl. the Wang non-monic
   limitation. Verified under/over-decomposition are avoided; conservative-incomplete, never
   over-claiming. **No bug.**
4. **`triangularDecomposition`/`triangularize`.** Free vars, no-solution (contradiction), and initials
   are all *computed* correctly (`:4930-4936`), but the store/UI **drop the `initials`** and present the
   chain without the initial-vanishing caveat. → **B-3**.
5. **Dimension/zero-dim gating.** Correct and consistent: `isZeroDimensional` precedes every finite
   count; positive-dim ⇒ `realCount:null` + `krullDimension`. **No bug** (Q5).
6. **Radical.** `realSolutionCount` uses the Hermite trace form, which counts *distinct* zeros without
   an explicit radical (multiplicity separated as `multiplicityCount`). `radicalZeroDim` (`:1783`) is
   only used inside `rationalUnivariateRep` and is guarded zero-dim. **No bug** (Q6).
7. **Dropped/kept branches.** The spurious `{D=0}` component is *kept* and counted (B-1); the resultant
   `{lc=0}` branch is *injected* (B-2); the triangular `init=0` branches are *dropped silently* (B-3).
   `applyFactor` case-splits (`algebra-store.mjs:2623`) are sound (`V(I)=⋃V(I+⟨f_i⟩)`, branch counts
   ADD, `_factorBranchInfo` labels it) — the deliberate non-use of `saturate` in `spuriousFactors`
   (`:2652`) is the *right* call for a factor that might be the QD; the wrong call is the *absence* of
   denominator saturation elsewhere.

## 5. Cross-cutting handoff

- **Track A (A-1).** Same root cause, opposite end: A-1 = the generator drops-and-does-not-record the
  denominators (medium, generation-side); B-1 = the count pipeline does not saturate them and this
  concretely over-counts (high, count-side). The fix is jointly owned — A records `saturateBy`, B
  calls `saturate`.
- **Track C/D (counting & univalence).** B-1's spurious solutions are exactly the `|z_j|=1`
  boundary-degeneracy maps the univalence/Schur–Cohn filter is meant to reject; wiring that filter (or
  the saturation) into the existence/uniqueness verdict — not only the separate "Certify univalence"
  action — closes the labeling gap.

*Repro scripts used (scratchpad, not committed): boundary-curve factorization, `currentReimSystem`
replication + complex/reim saturation deltas, the `assumeReal` over-count, and the resultant/minimal-
primes/Hermite confirmations — all against the live `solver.mjs`→`sym-core.mjs`→`qd-equations.mjs`.*
