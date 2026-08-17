# Agent 01 "ALG" — `@cas/core` + `@cas/exact` review

Scope: `packages/core` (complex arithmetic, algebra contract, Durand–Kerner, series, poly, sphere,
format, and the `lstsqHouseholder` least-squares primitive) and `packages/exact` (ℚ / ℚ(i) over
BigInt, `QiPoly`, `BiPoly`, the Bareiss resultant/discriminant layer, render). I read every `src/`
file and every `test/` file in both packages, confirmed convention-neutrality, and cross-referenced
the 2026-07 review (`CODEBASE_REVIEW_2026-07.md`, `RAW_FINDINGS_2026-07.md`) plus ADR-0006/0007/0008/0018.
**READ-ONLY**; I ran no code — the numerical claims below are hand-traced and each carries a concrete
test to confirm. Most-severe first.

---

### [HIGH] Durand–Kerner still reports `converged: true` with a NaN root — the PR #154 fix for CRITICAL `cd-dk-01` is incomplete (not NaN-sticky)
- **Area:** `@cas/core` · **Location:** `packages/core/src/durand-kerner.ts:126` (`if (!(dm <= maxDelta)) maxDelta = dm;`), gate at `:133`
- **Type:** numerical / bug (partial regression of a previously-CRITICAL finding)
- **Confidence:** high (deterministically hand-traced)
- **Fix-safety:** needs-review
- **Evidence:** The 2026-07 review found `cd-dk-01` (CRITICAL): DK returned `converged:true` with all-NaN
  roots because `if (dm > maxDelta)` never fires on a NaN `dm` (every NaN comparison is false), so
  `maxDelta` stayed `0 < tol`. PR #154 replaced it with `if (!(dm <= maxDelta)) maxDelta = dm;` and the
  code comment (`:120-126`) claims "a NaN delta … lets NaN through, and `NaN < tol` is false, so
  convergence is correctly withheld." **That is only true when the NaN is the last-updated root or is the
  running maximum.** The expression is *not NaN-sticky*: once `maxDelta = NaN`, a later root with a small
  finite `dm` makes `!(dm <= NaN)` → `!(false)` → `true`, so `maxDelta` is **overwritten back to the finite
  value** and the NaN is forgotten.
  A blow-up produces exactly this interleaving: one iterate reaches ~1e154+ (its `evalMonic` and `denom`
  both overflow to `Infinity`, so `delta = Inf/Inf = NaN`) while the *other* roots — whose `denom` now
  carries that huge factor — get near-zero deltas. Hand-trace, default (Jacobi, `bail=false`) mode,
  monic `(z−1)(z+1)(z−2)`, seeds `[{1e160,0},{1,0},{-1,0}]`:
  - i=0: `denom≈{Inf,0}`, `evalMonic≈{Inf,0}` ⇒ `delta={NaN,NaN}`, `dm=NaN` ⇒ `maxDelta=NaN`, `next[0]={NaN,NaN}`
  - i=1: `evalMonic({1,0})={0,0}` (exact) ⇒ `dm=0`; `!(0<=NaN)`→true ⇒ **`maxDelta=0`** (NaN lost)
  - i=2: `dm=0`; `!(0<=0)`→false ⇒ `maxDelta` stays `0`
  - end of sweep: `maxDelta=0 < tol`, `skipped=false` ⇒ `converged=true`, `iterations=1`,
    `roots=[{NaN,NaN},{1,0},{-1,0}]`.
- **Why it matters:** Certified NaN — a "non-answer labelled certified," which the repo's honest-labeling
  guardrail treats as unacceptable and which was rated **CRITICAL** as `cd-dk-01`. It is reachable: 7 of 8
  call sites leave `bailOnNonFinite=false`, and the prior review itself noted `|denom|` crosses 1.34e154 at
  ordinary sizes (degree 40 on `|z|=1e5`, degree 200 on `|z|=2`). The existing regression test
  (`durand-kerner.test.ts:171`) uses a *constant-`Infinity`* `evalMonic`, so **all** roots diverge with
  `dm=Inf` and `maxDelta` ends `Inf` — it never exercises the mixed NaN + small-delta interleaving, so this
  path is unguarded.
- **Recommendation:** Make the max NaN-sticky. Minimal: `maxDelta = Math.max(maxDelta, dm);` (`Math.max`
  propagates NaN from either argument, unlike the hand-rolled comparison, and still fixes the original
  `cd-dk-01`). Alternatively add a `sawNonFinite` flag (mirroring the existing `skipped` guard) set when
  `!alg.isFinite(ziNext)` and gate convergence on `&& !sawNonFinite`. Add the 3-root mixed-scenario test
  above (it fails against the current source, passes after the fix).

---

### [MEDIUM] `lstsqHouseholder` has no ill-conditioned / near-singular test coverage — only *exact* rank deficiency is pinned
- **Area:** `@cas/core` · **Location:** `packages/core/test/lstsq.test.ts` (whole file); behavior at `packages/core/src/lstsq.ts:27,54`
- **Type:** test-gap
- **Confidence:** high
- **Fix-safety:** needs-review
- **Evidence:** The corpus covers consistent fit, inconsistent least-squares, square full-rank, an
  **all-zero column** (exact rank deficiency → `x=0`), and the underdetermined throw. It does **not** cover:
  (a) a *near*-singular / ill-conditioned column, (b) the `b`-length-mismatch throw (`lstsq.ts:18`), or
  (c) a genuinely near-rank-deficient (not exactly-zero) column. The two rank guards catch only exact/denormal
  zeros: `if (norm === 0) continue;` (`:27`) fires only on an exactly-zero column, and the back-substitution
  `x[i] = Math.abs(d) < 1e-300 ? 0 : s / d;` (`:54`) zero-fills only a `<1e-300` pivot. A column that is
  *numerically* dependent leaves an `R[i][i]` around, say, `1e-16`, so `s/1e-16` **blows up** — there is no
  `continue` and no zero-fill. That is expected for un-pivoted Householder QR on a well-conditioned basis, but
  it is untested and undocumented, so a regression that changed the blow-up-vs-zero-fill boundary would be
  invisible. The brief explicitly asks for singular/near-singular/ill-conditioned coverage here.
- **Why it matters:** This primitive underpins every overdetermined fit in the suite (`@cas/conformal`
  lightning fits, and the anticipated QD consumer). The "stable choice for a rank-deficient column" the
  docstring advertises is only pinned for the exact-zero case; the far more common *numerical* rank deficiency
  has no golden value.
- **Recommendation:** Add tests that (1) feed a near-dependent column (e.g. col1 = col0 + 1e-14·noise) and
  assert the *actual, documented* behavior (pin that it blows up / is not zero-filled — i.e. that `1e-300` is
  an exact-zero guard, not an ill-conditioning guard), (2) hit the `b`-length throw, and (3) exercise a mildly
  ill-conditioned but full-rank system (e.g. a small Vandermonde) and assert a bounded residual. No source
  change required — this documents the contract for both consumers.

---

### [LOW] `Frac.toNumber` big-shift path returns `Infinity`/`0` for *representable* ratios in ~`[2^1000, 2^1024)` when one side exceeds the double range — a boundary hole in the `cd-frac-07` fix
- **Area:** `@cas/exact` · **Location:** `packages/exact/src/gaussian.ts:100-111` (`KEEP_BITS = 1000`, the shift-and-divide)
- **Type:** numerical
- **Confidence:** high (math), low (reachability — the whole slow path is unreachable from today's callers, per the docstring)
- **Fix-safety:** needs-review
- **Evidence:** The slow path is entered iff `Number(n)` or `Number(d)` is `±Infinity` (a side exceeds ~1.8e308).
  It shifts both sides right by `shift = max(bitlen(a),bitlen(b)) − 1000`. The smaller side keeps
  `1000 − gap` bits (`gap = |bitlen(a) − bitlen(b)|`), so it **shifts entirely to 0 whenever `gap ≥ 1000`**,
  after which `Number(a)/0 = Infinity` (or `0/Number(b) = 0`). But a ratio only genuinely overflows the double
  range at `gap ≳ 1024` (max double ≈ 2^1024). So ratios with `gap ∈ [1000, 1024)` — i.e. magnitude roughly
  `[1.07e301, 1.8e308)` — are **representable finite doubles returned as `Infinity`/`0`**. Concrete:
  `Frac.of(10n**310n + 1n, 10n**5n)` (coprime, so kept unreduced; numerator > 1.8e308 ⇒ slow path) is the
  ordinary value `≈1e305`, but `bitlen(num)≈1030`, `bitlen(den)≈17`, `shift=30`, `den>>30 = 0` ⇒ returns
  `Infinity`. The comment "If one side shifts away to 0 the true ratio really did overflow or underflow …
  0 / Infinity is then the right answer" is **false** in this window.
- **Why it matters:** This is the sole exact→numeric crossing (`Gauss.toTuple` delegates here) and its output
  feeds `= exact`-labeled read-outs. The original `cd-frac-07` (NaN for huge/huge) is genuinely fixed for the
  common tame-ratio case; this is a narrower residual hole in the *fix*. Both are unreachable from current
  callers (Gleason degrees capped well below), so LOW.
- **Recommendation:** Align the vanishing of the smaller side with true over/underflow: keep the larger side
  at ~1023 bits (`KEEP_BITS = 1023`, staying just under 2^1024 so `Number(larger)` cannot round to `Infinity`),
  which shrinks the bad window to a factor of ~2; or, better, when the smaller side shifts to 0, only report
  `Infinity`/`0` if `gap ≥ 1024` (true overflow) and otherwise recompute with a smaller shift. Add a test for a
  representable ratio near 1e305 with a > 1.8e308 numerator.

---

### [LOW] `@cas/core` exposes no conditioning signal for `lstsq`; docstring "rank-deficient column" reads broader than the exact-zero guard actually implemented
- **Area:** `@cas/core` · **Location:** `packages/core/src/lstsq.ts:12,27,54`; `packages/core/README.md:76-83`
- **Type:** stale-doc / clarity (+ informational on the ADR-0018 divergence)
- **Confidence:** medium
- **Fix-safety:** safe-now (doc-only wording)
- **Evidence:** The docstring says "A rank-deficient column (zero pivot) contributes 0 to x rather than a NaN";
  the README says it is "zero-filling a rank-deficient column." Both are literally true (they say *zero pivot*),
  but a reader tracking the ADR-0018 divergence ("RM zero-fills at `1e-300`, QD throws at `1e-13` with
  `condEst`-driven refinement") may read "rank-deficient" as numerical rank deficiency. Core implements **only**
  RM's policy and exposes **no** rcond / numerical-rank / reusable-factorization / throw-option — so a consumer
  cannot detect ill-conditioning from core's output at all. This is *correct* and *documented as deferred*
  (DECISIONS.md ADR-0018 item 5: "consolidate QD's `solver.mjs` … needs a selectable rank-deficiency policy"),
  not a bug — but the per-function docs don't say the `1e-300` is an *exact-zero* guard, not an ill-conditioning
  one.
- **Why it matters:** The brief asks whether core's rank/rcond handling is "correct and well-documented for
  both consumers." It is correct for RM and honestly deferred for QD at the ADR level, but the primitive's own
  docstring could mislead the future QD adopter into thinking near-rank-deficiency is handled.
- **Recommendation:** One clause in the docstring/README: the `1e-300` threshold catches only an *exactly*
  (or denormally) zero pivot; numerically rank-deficient columns are **not** regularized and will amplify — a
  consumer needing conditioning/rank must add it (the deferred QD "selectable rank policy"). No code change.

---

### [LOW] Speculative consolidation — `QiPoly` and `BiPoly` share near-identical coefficient-array scaffolding; and the still-open `cd-dup-05` DK-seeding case targets `@cas/core`
- **Area:** `@cas/exact` (`qiPoly.ts`, `biPoly.ts`); `@cas/core` (destination for `cd-dup-05`)
- **Type:** consolidation
- **Confidence:** medium
- **Fix-safety:** needs-review
- **Evidence:** `QiPoly` and `BiPoly` carry structurally identical `fromCoeffs`/`degree`/`isZero`/`coeff`/
  `leadingCoeff`/`equals`/`add`/`sub`/`neg`/`mul`/`pow` bodies (little-endian trimmed arrays over a ring
  element type) — the same relationship `makePoly` already abstracts over `ComplexAlgebra<C>` in `@cas/core`.
  They legitimately diverge only in division (`QiPoly.divmod` inverts over the field ℚ(i); `BiPoly.divmodMonic`
  requires a unit-leading divisor because ℚ(i)[inner] is not a field). **This is a *speculative*,
  single-package opportunity** (both already live in `@cas/exact`; no second consumer forces it), so under
  ADR-0007 it should stay as-is unless a third exact-poly layer appears — flagging per the brief, labeled
  speculative. Separately, the prior review's **`cd-dup-05`** (identical Cauchy-bound DK seeding + monic Horner
  duplicated across `apps/complex-dynamics` and `apps/correspondences`) is a **genuine ADR-0007 second-consumer**
  case whose *destination* is `@cas/core` (a `seedCauchy`/`monicHorner` helper next to `makeDurandKerner`); it
  appears unaddressed (no such export in `core/src/index.ts`). The duplicated *source* is app-side (out of my
  scope) — noting it because the landing site is my package.
- **Why it matters:** The suite's north-star is "each new tool builds fewer primitives from scratch." `cd-dup-05`
  is a real, sanctioned extraction still pending; the QiPoly/BiPoly overlap is a smaller internal cleanup to keep
  on the radar, not to action now.
- **Recommendation:** Leave QiPoly/BiPoly split until a real second consumer appears (respect ADR-0007). For
  `cd-dup-05`, when the app-side agents extract the shared DK seeding, land the helper in `@cas/core` with a
  golden test pinning both apps' current seeds.

---

### [NIT] Convention-neutrality confirmed; the `divScaled` duplication is an intentional non-merge
- **Area:** `@cas/core`, `@cas/exact` · **Location:** `complex.ts`, `algebra.ts`, `gaussian.ts`, `sphere.ts`
- **Type:** convention (positive confirmation) / consolidation (non-issue)
- **Confidence:** high
- **Fix-safety:** safe-now (nothing to change)
- **Evidence:** Grepping both `src/` trees for `Math.PI` / `2*Math` / `π` / `2πi` / numeric `PI` yields **only
  comment lines asserting the absence** (`lstsq.ts:7`, `sphere.ts:2`, `gaussian.ts:9`). No π / 2πi
  normalization constant leaks into either package — ADR-0006 holds. Note the `divScaled`-based two-path
  division appears in both `Complex.div` (`complex.ts:138`) and `tupleAlgebra.div` (`algebra.ts:76`); this is a
  **deliberate** copy (documented `cd-div-02`: the tuple instance carries its own body to avoid allocating a
  `{re,im}` per call), not a consolidation candidate.
- **Why it matters:** Confirms the CRITICAL-class "silent factor-of-π/2πi" risk is absent from the numeric and
  exact kernels, and pre-empts a false consolidation recommendation against an intentional duplication.
- **Recommendation:** None.

---

## Coverage

**Examined in full (read every line):** all `packages/core/src/*.ts` (`complex`, `algebra`, `durand-kerner`,
`series`, `poly`, `sphere`, `format`, `lstsq`, `index`) and all `packages/core/test/*.ts`; all
`packages/exact/src/*.ts` (`gaussian`, `qiPoly`, `biPoly`, `resultant`, `render`, `index`) and all
`packages/exact/test/*.ts`; both package READMEs; ADR-0006/0007/0008/0018 in `DECISIONS.md`; and a targeted
cross-reference of the 2026-07 review.

**Verified by hand (no execution):** the Durand–Kerner float trace above (deterministic); Householder QR
reflector sign choice (`lstsq.ts:28`, cancellation-avoiding — correct) and back-substitution; the Bareiss
resultant fraction-free divisibility and the Sylvester matrix layout / discriminant sign
(`disc(x²+1)=−4` reproduced by hand); `Frac`/`Gauss` normalization, `equals` semantics (all Fracs reach
`equals` normalized — safe), `bigGcd`, and the `Gauss.mul` real×real fast path.

**Confirmed still-fixed (no regression) from 2026-07 — not re-reported:** `cd-cpow-05` (cpow modulus overflow,
`complex.ts:191`), `cd-frac-07` common case (see LOW above for the residual boundary hole), `cd-res-11`
(resultant zero-poly guard), `cd-disc-06`/`cd-disc-12` (discriminant sign + untrimmed-list), `cd-test-08`
(resultant.test.ts now exists), `cd-doc-09` (README "error-free splits" corrected). `cd-dk-01` is the one whose
fix I found **incomplete** (HIGH above).

**Not deeply covered:** I did not exhaustively verify `render.ts` output formatting beyond correctness spot-checks
(display-only leaf, no numeric coupling; a couple of cosmetic edge cases — e.g. a negative real part in the
parenthesized `a+bi` form emitting `+ (-2 + 3i)` — are ugly but not wrong, so left unflagged). I did not run any
build/test/tooling (READ-ONLY per brief), so residual/conditioning magnitudes for `lstsq` and the exact-poly
divisibility guarantees are argued, not measured — each finding names the test that would confirm it.
