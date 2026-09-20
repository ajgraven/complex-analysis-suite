# Review — `apps/contour-integration/src/kernel/*.ts` (exact-arithmetic core, excluding `bounds/` and `branch/`)

Files covered: `algebraic.ts`, `atInfinity.ts`, `camera.ts`, `cothForm.ts`, `cyclotomic.ts`, `decimal.ts`,
`entire.ts`, `exactPredicates.ts`, `exactRational.ts`, `exactResidue.ts`, `expLattice.ts`, `expSum.ts`,
`exponent.ts`, `exponentialFactor.ts`, `exponentialSum.ts`, `geom.ts`, `kernelResidue.ts`, `logPart.ts`,
`logResidue.ts`, `mergedResidue.ts`, `poles.ts`, `quadrature.ts`, `ratPi.ts`, `sineForm.ts`,
`summationKernel.ts`, `unitRoot.ts`, `winding.ts` (+ `formatExact.ts`/`notation.ts`/`exprLatex.ts` skimmed;
`branchResidue.ts` skimmed only — it is the branch agent's).

### Findings (ordered by severity)

- **[BUG] `simplestRational` throws an uncaught `RangeError` on a subnormal literal, and `findPoles` crashes**
  - Where: `src/kernel/exactRational.ts:49-60` (the CF loop), reached via `toExactRational` → `findPoles`
  - What: `Number.isFinite(x)` passes for a subnormal, so `x = 1e-310` enters the loop, `r = 1/frac` overflows
    to `Infinity`, and `BigInt(Math.floor(Infinity))` throws. `toExactRational`'s `catch` only converts
    `Refusal`, so the `RangeError` escapes. Measured:
    `findPoles(parse("1/(z - 5e-324)"))` → `THREW RangeError The number Infinity cannot be converted to a BigInt`;
    same for `z*4e-324` and `1/(z-1e-310)`. The docstring's promised fallback ("if no convergent round-trips
    within the iteration budget, the exact dyadic value is used instead", lines 35-36) is unreachable on this
    input — the loop throws before it. A sandbox user typing `1e-310` gets a thrown error, not a refusal by name.
  - Confidence: CONFIRMED (reproduced)
  - Fix: `if (!Number.isFinite(r)) break;` inside the loop (falling through to the dyadic path), and have
    `toExactRational` refuse rather than rethrow a non-`Refusal`.

- **[BUG] `windingNumber` reports `decided: true` with the WRONG number when `polygonise` silently hits its vertex cap**
  - Where: `src/kernel/geom.ts:118` (`Math.min(..., 1_000_000)`) and `src/kernel/winding.ts:104-134`
  - What: `winding.ts`'s exactness rests on `maxSagitta = cl/4` actually being honoured ("their winding
    contributions are *equal*, not merely close", file header). `polygonise` caps at 1,000,001 points and
    returns **without saying so**, at which point the delivered sagitta exceeds the requested one by a
    constant **9.40×** at every radius (measured at R = 1, 1e3, 1e6). The clearance floor
    (`1e-12 × contourScale`) is then below the sagitta the polygon actually achieves, so there is a live
    window in which a point clear of the contour is classified on the wrong side. Measured on a circle of
    radius 1e6 (floor = 2.0e-6, cap sagitta = 4.93e-6), sampling near chord midpoints:
    `n = 0, decided: true` for points genuinely **inside**, at clearances 2.1e-6, 3.0e-6, 4.0e-6, 4.8e-6 —
    **24 of 36 sampled points wrong and reported as decided**; correct again from 6e-6 up. The same window
    exists at unit scale, roughly `(2e-12, 2e-11)`. A wrong winding number does not perturb `2πi Σ n·Res`,
    it changes it by a whole residue — which is the file header's own argument for deciding it exactly.
  - Confidence: CONFIRMED (reproduced, 24/36)
  - Fix: have `polygonise` report that it capped (or return the sagitta it achieved) and make
    `windingNumber` return `decided: false` with a named reason in that case — equivalently, raise the
    clearance floor to the cap-implied sagitta `r(1 − cos(π/1e6))` rather than to `1e-12 × scale`.

- **[BUG] `polesInBand` refuses with a reason that is FALSE, and `cofactorResidues` over-refuses, because both call `exactPolesOf` with no root finder**
  - Where: `src/kernel/expLattice.ts:301` and `src/kernel/kernelResidue.ts:124` (both `exactPolesOf(num, den)`,
    the optional `findRoots` omitted); refusal text at `expLattice.ts:303-308`
  - What: without a finder, `splitWithDeflation` has no candidates to deflate, so any denominator that is
    neither degree ≤ 2 nor an even binomial is declined — even when every root is a Gaussian rational.
    Measured on `D(w) = 1 + w + w² + w³` (roots `−1, ±i`): `exactPolesOf` without a finder reports
    `complete = false, poles = 0`, and `polesInBand` on `1/(1+e^z+e^{2z}+e^{3z})` refuses with
    *"not every root of D(w) is expressible in ℚ(i) or one quadratic extension of it"* — which is untrue;
    `findPoles("1/(1+z+z^2+z^3)")`, which does inject the finder, pins all three exactly and returns
    `Σ Res = 0`. Same for `cofactorResidues` on the cubic cofactor `(z²+¼)(z−⅓)`: refused as "not every pole
    of the cofactor was pinned exactly" where the finder-bearing path pins all three. This is the class the
    app's own comment (`summationKernel.ts:125-129`) calls out: "a refusal that names a pole that is not
    there is the kind of row this whole arc has been removing."
  - Confidence: CONFIRMED (reproduced)
  - Fix: pass the same Durand–Kerner candidate closure `poles.ts:249-252` builds (or at minimum reword the
    refusal to say the engine did not attempt deflation, rather than asserting the roots are inexpressible).

- **[STALE-DOC] `kernelResidues` has no docstring at all; the block written for it is orphaned above `collisionsOf`, and its content is stale**
  - Where: `src/kernel/summationKernel.ts:163-180`
  - What: two `/** … */` blocks sit back to back; TypeScript attaches only the second, so the block describing
    `Res(K·f, n)` at every integer, the COLLISION refusal and the `asSummationKernel` reduction documents
    `collisionsOf` (whose own doc follows it) and `kernelResidues` at line 189 is undocumented. Its closing
    sentence — *"**Its consumer is M5.6**… Until then it is exercised only by the suite"* — is also out of
    date: `src/engine/summationTheorem.ts:109` consumes it.
  - Confidence: CONFIRMED (read + grep)
  - Fix: move the first block below `collisionsOf` and drop the "until then" clause.

- **[STALE-DOC] `cmpExact` names a consumer that does not exist, and is dead code**
  - Where: `src/kernel/exactPredicates.ts:202-205`
  - What: the doc says "Exact comparison of two doubles as rationals — **for the ray test's `y` straddle**",
    but the ray test (`winding.ts:127-131`) uses bare `<=` / `>`, and a repo-wide grep finds no reference to
    `cmpExact` outside its own declaration. The body is also not "as rationals" — it compares the doubles
    directly (which is exact, but not what the sentence says). `expLattice.ts:377`'s `stripRefusal` is dead
    the same way ("for a caller that wants to show why the strip was not read" — there is none), which is the
    situation `summationKernel.ts:172-173` says it wrote a paragraph specifically to avoid.
  - Confidence: CONFIRMED (grep)
  - Fix: delete both, or wire `cmpExact` into the straddle test it claims to serve.

- **[STALE-DOC] `cyclotomic.ts` keeps a second copy of the root-of-unity denominator list, two entries of which can never match**
  - Where: `src/kernel/cyclotomic.ts:43` (`RATIO_DENOMINATORS = [1n, 2n, 3n, 4n, 6n]`) against
    `src/kernel/unitRoot.ts:54-63`
  - What: `unitRoot.ts` exports `DENOMINATORS` precisely so there is one list, with a docstring saying
    "A second list would be a second source of truth, and the kind that fails silently". `branchResidue.ts`
    imports it; `cyclotomic.ts` writes its own. Worse, `asCyclotomic` requires `candidate.asGauss() !== null`,
    and the ratio `−b₀/b_n` is a Gaussian rational by construction, so the only roots of unity reachable are
    `±1, ±i` — the `3n` and `6n` entries are structurally unreachable, i.e. the list looks load-bearing while
    two fifths of it does nothing. That is exactly the failure mode the other file's comment names.
  - Confidence: CONFIRMED (read + the `asGauss()` gate at `cyclotomic.ts:70`)
  - Fix: import `DENOMINATORS`, or reduce the list to `[1n, 2n, 4n]` with the reason stated.

- **[STALE-DOC] `exactPoleAt`'s zero-numerator branch is dead — the line above it throws first**
  - Where: `src/kernel/exactResidue.ts:94` vs `101-104`
  - What: `const m = multiplicityAt(den, a) - multiplicityAt(num, a)` runs before the `num.isZero()` ternary,
    and `multiplicityAt` on the zero polynomial throws. Measured: `exactPoleAt(QiPoly.zero(), z, 0)` →
    `THREW: multiplicityAt: the zero polynomial`. The guard therefore protects nothing. (No live path reaches
    it — `findPoles("0/z")`, `"(z-z)/z"`, `"0/(z^2+1)"`, `"(z*0)/(z-1)^2"` all come back cleanly with
    0 poles, because `cancelCommon` removes the whole denominator first.)
  - Confidence: CONFIRMED (reproduced)
  - Fix: hoist the `num.isZero()` test above line 94 and return `null`, or delete the branch.

- **[STALE-DOC] `mergedResidue`'s comment claims a caller-side invariant it does not depend on**
  - Where: `src/kernel/mergedResidue.ts:145-146`
  - What: *"`asSummationKernel` reduces `num/den` by their gcd, so a numerator vanishing at `n` … has already
    been cancelled and `m` is the true one."* `mergedResidue` is exported and called with arbitrary
    `(num, den)`; if the numerator does vanish at `n`, the residue arithmetic is still correct (the series
    `a_i` absorb it) and only the reported `order` is overstated. Stating it as a precondition of the
    arithmetic misplaces what is actually at stake.
  - Confidence: PLAUSIBLE (read; the arithmetic's robustness follows from `c_j = a_{j+m}` holding regardless)
  - Fix: reword to say the gcd reduction is what makes the reported `order` right.

- **[TEST-GAP] `winding.test.ts`'s "stays decided arbitrarily close" stops exactly above the band where the property fails**
  - Where: `test/winding.test.ts:123-136`
  - What: the test's stated claim — *"shrinking the clearance refines the polygon rather than degrading the
    answer. This is the property that makes arcs admissible"* — is tested at `eps ∈ {1e-3, 1e-6, 1e-9}` on a
    unit circle. It is false below ~2e-11 at unit scale and false at 4.8e-6 on a radius-1e6 circle (see the
    second BUG). Nothing in the suite exercises `polygonise` against its cap, and no test asserts the
    sagitta guarantee `polygonise`'s own docstring makes.
  - Confidence: CONFIRMED
  - Fix: add a case at a large contour radius, and an assertion that the delivered sagitta is ≤ the requested
    one (which would fail today).

- **[TEST-GAP] `kernel/quadrature.ts` has no direct test**
  - Where: `src/kernel/quadrature.ts`; grep over `test/` finds no reference to `gaussLegendre`, `panelPlan`,
    `nodeCount` or `compensatedSum` by name
  - What: the independent cross-check that the whole "honest labelling" story leans on (a disagreement beyond
    the quadrature's own error estimate is *reported*) rests on primitives only covered end-to-end. The
    docstring's "the symmetry of the output is a free check on it" is not cashed anywhere. I measured them and
    they are sound (below), but nothing in the gate would catch a regression in the node/weight recurrence
    other than as a diffuse cross-check failure.
  - Confidence: CONFIRMED (grep)
  - Fix: a ~15-line test asserting exactness to degree `2n−1` and inexactness at `2n` (the non-vacuity clause).

- **[PERF] a winding query can allocate a 1,000,001-point polyline and take ~0.5 s**
  - Where: `src/kernel/geom.ts:118-121`, called from `winding.ts:105` on every `windingNumber`
  - What: `n` grows like `sweep / (2√(cl/2r))`, so a pole at relative clearance 1e-10 already asks for ~444k
    vertices and anything tighter saturates the 1e6 cap. Measured: 36 `windingNumber` calls at the cap took
    17.8 s, i.e. **0.49 s per query**, each building and discarding a million-element array. During a contour
    drag this is once per pole per frame.
  - Confidence: CONFIRMED (measured)
  - Fix: the cap should be a refusal (see the BUG above), which also removes the pathological cost — or the
    ray test should consume the polygonisation lazily instead of materialising it.

- **[PERF] `factorise` and `simplestRational` can each mint work far out of proportion to the input**
  - Where: `src/kernel/logPart.ts:100-116`; `src/kernel/exactRational.ts:38-70`
  - What: `factorise` on a ~1e12 atom runs ~500k trial divisions — measured **31 ms** for `999999000001`
    (13 ms to refuse a product of two primes just over the limit). `LogPart.ln` calls it twice (numerator and
    denominator), and `branchResidue.ts:97-102` calls `logModulusOf` per pole; a dragged float whose
    `simplestRational` has a 16-digit denominator would pay that per pole per recompute. Separately,
    `simplestRational(1e-300)` legitimately returns a **300-digit** denominator (measured), which then
    propagates through every `QiPoly` product; `MAX_DEGREE` bounds the degree but nothing bounds coefficient
    size.
  - Confidence: CONFIRMED (measured)
  - Fix: memoise `factorise` (its inputs repeat across frames), and consider a magnitude guard in
    `simplestRational` that refuses rather than returning a 300-digit atom.

- **[IDEA] `liftInto` decides an exact-rational question with a `1e-12` float nudge**
  - Where: `src/kernel/atInfinity.ts:541-545`
  - What: `Math.ceil(range[0].sub(theta).div(2).toNumber() - 1e-12)` inside `leadingConstant`, whose
    certificate text says "every one an exact rational, so the constant is a root of unity **and not a fit**".
    The quantity is a ceiling of a `Frac` and is computable exactly (`-floorDiv(-n, d)`); the tolerance is the
    one float decision in a routine that advertises itself as tolerance-free.
  - Confidence: PLAUSIBLE (read; no wrong output produced — the boundary case is caught by the caller's
    `lifted.equals(point.argRange[0])` test)

- **[IDEA] `Exponent.scale` throws where every sibling refuses by name**
  - Where: `src/kernel/exponent.ts:105-107`
  - What: scaling a logarithmic exponent by a non-real Gaussian throws an `Error` rather than returning a
    result type, in a module family where "a refusal cannot be read as a claim" is the stated standard. The
    docstring on `scale` even says the *absence* of an exponent-times-exponent method is "that refusal
    expressed as a missing method" — the throw beside it is the inconsistent one. No caller reaches it today.
  - Confidence: PLAUSIBLE (read)

### Checked and found sound

- **`mergedResidue` / `kernelSeries`** — merged residue agrees with a 40,000-point circle quadrature to
  **≤ 2.5e-13** across 10 cases: orders 3, 4, 5 and 7, both kernels, `n = 0` and `n = 1` (the csc sign flip),
  a cofactor with a non-zero constant term, and a cofactor with extra poles away from the integer. `t_k`
  matches `−2ζ(2k)/π^{2k}` and `s_k` matches `2η(2k)/π^{2k}` for `k = 1…5` to ≤ 2.6e-13; `t₁ = −1/3`,
  `s₁ = 1/6`, `s₂ = 7/360`, `s₅ = 73/3421440` all exact.
- **`logResidue`** — `Res(1/(1+z²)²·log^m z, i)` in `[0, 2π)` agrees with a 200,000-point quadrature to
  **≤ 1.0e-14** for `m = 0,1,2,3` at a **double** pole (so the two-coefficient mixing is confirmed, not just
  the simple-pole collapse). The incremental `binomial` is exact; the `uPowers[t][p]` indexing cannot go out
  of range for either ordering of `m` against `n`.
- **`sineForm.divideCarryingSine`** — `1/(1 − e^{2πiα})` in units of π matches the direct complex value to
  **≤ 4.4e-16** at `α = 3/10, 1/2, 3/4, 7/10, 1/3`, printing `π/sin(3π/10)` etc.; integer `α` refuses with
  `degenerate: true`; the cosh branch on `1 + e^{−π}` gives `π/(1+e^{−π})` correctly.
- **`cothForm.asHyperbolicForm` + `cofactorResidues`** — `−π·Σ Res` reproduces `(π/a)coth(πa)` and
  `(π/a)csch(πa)` to **≤ 4.4e-16** at `a = 1/2, 1, 3/2`, printing `−2π·coth(π/2)`, `(−2π/3)·csch(3π/2)`; the
  coth/csch selection really is decided by the exponent comparison and the double-angle algebra checks out.
- **`kernelResidue.kernelOverPi`** — `cot(πz₀)`/`csc(πz₀)` from the Möbius form agree with direct evaluation
  to **≤ 2.3e-16** at `z₀ = ±i/2, 1/2, 1/3+i/4`, and return `null` at every integer (the collision) from the
  `z₀` test rather than from a vanishing denominator.
- **`exactResidue.residueAtInfinity`** — `1/z → −1`, `1/(1+z²) → 0`, `z/(1+z²) → −1`, `(z³+1)/(z³+z) → 0`
  (the one-way-implication witness), a polynomial → 0, `1/(2z) → −1/2`, zero denominator → `null`.
- **`ratPi`** — `re()`/`im()` via the conjugate agree with `toNumber()` to 1e-15 on a genuinely complex
  quotient; `asPiMonomial` and the negative-`piPower` guard behave as documented.
- **`exponent.splitAlgebraicFactor`** — the "a fold may COMBINE a radical, never INTRODUCE one" rule holds
  as stated: `e^{iπ/2} → i`; `e^{iπ/3}` refuses at radicand 1 and at radicand 2 (returning the π uncarried),
  folds to `(1+i√3)/2` at radicand 3; `e^{iπ/4}` folds to `(1+i)/√2` at radicand 2; `e^{π}` never folds.
  `SqrtExt` rejects a negative radicand, so `isImaginary`'s `a.re/b.re` test cannot be fooled by an imaginary √d.
- **`logPart`** — `factorise` refuses 0 and negatives, returns the empty map for 1, refuses past the trial
  limit; `e^{ln2} = 2`, `e^{(ln2)/2} = √2`, `e^{(ln2)/3}` carried (null); prime-by-prime split behaves.
- **`expLattice.turnsOf`** — `1 → 0`, `−1 → 1/2`, `i → 1/4`, `−i → 3/4`, `(1+i√3)/2 → 1/6`,
  `(1+i)/√2 → 1/8`, `2 → null`. The order is decided exactly before the argument is read numerically.
- **`quadrature`** — Gauss–Legendre is exact to degree `2n−1` (≤ 2.9e-15) and **inexact at `2n`** at
  `n = 1…32` (so the check is not vacuous), weights sum to 1, nodes/weights symmetric to 0 ulp; the periodic
  trapezoid is exact on `∮dz/z` at `N = 4, 8, 16`; `compensatedSum([1e16, 1, −1e16]) = 1` where the naive sum
  is 0; `panelPlan`/`nodeCount` handle 0, negative and `NaN` singularity distances by capping and flagging.
- **Refusal wording** — every refusal I read in `sineForm`, `cothForm`, `kernelResidue`, `summationKernel`,
  `mergedResidue`, `cyclotomic`, `atInfinity`, `entire` and `expLattice` names its reason and distinguishes
  "engine limit" from "mathematical fact" (`SineDivision.degenerate`, `EntireDecision`'s shape, `unknown` vs
  `refuse` in `entireRefusal`). The one exception found is `polesInBand`'s (BUG 3 above).
- **`entire.ts`** — the decision is genuinely sufficient-only and its three walls (quotient / poles /
  non-holomorphic) are worded apart; `exp(1/z)` refuses through the quotient wall.
- **Node gate** — `poles, exactResidue, algebraic, winding, entire, exponent, logPart, ratPi` = 144 tests,
  all green (no edits made).

### Not covered

- `branchResidue.ts` (lives directly in `kernel/` but is branch-factor machinery — read only for its
  `LogPart`/`unitRoot` call sites; assigned to the branch agent).
- `formatExact.ts`, `notation.ts`, `exprLatex.ts`, `imported.ts` — skimmed only, no numeric probing.
- `exponentialFactor.ts` / `exponentialSum.ts` — read for structure and for the shared `simplestRational`
  crash path; their series arithmetic was not independently verified against quadrature.
- `camera.ts` — read in full, nothing found; not probed. Note only that `fitView` can return a `halfHeight`
  outside `[HALF_HEIGHT_MIN, HALF_HEIGHT_MAX]` and its only consumer (`shell/thumbnails.ts:112`) does not
  `clampView` it — harmless for thumbnails, but it is the one `camera` export that escapes the clamp.
- No mutation sweeps (brief forbids), no browser suite.
