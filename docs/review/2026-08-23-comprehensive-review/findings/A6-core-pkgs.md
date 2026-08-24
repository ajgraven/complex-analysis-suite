# A6 CORE-PKGS — fresh pass on `@cas/core`, `@cas/exact`, `@cas/expr`, `@cas/interchange`

Scope: the four foundational shared packages (keystone; a bug or convention leak here is high-blast-radius).
This is a RE-review: I first confirmed the prior round's fixes (DK NaN-stickiness, geometry `pointInPolygon`,
interchange nested-payload validation, `lstsq` docs, `lambertw` docstring) are correctly and completely
landed, then made an independent pass hunting for what was missed — with extra scrutiny on the one piece of
churn in my scope since Aug 17: the `perf(cd)` commit `0527fe5` that added the `emitAbsSquaredCompare` GLSL
peephole to `packages/expr/src/glsl.ts` (+~27 lines). READ-ONLY; no code run — numerical/parity claims are
hand-traced and each carries a concrete confirming test.

**Bottom line:** the prior fixes are all correctly landed and I found no new correctness bug. The new peephole
is mathematically sound and type-safe, but ships with **no in-package codegen test**. Several prior LOWs
remain open (arccosh branch, z^a parity, Frac.toNumber boundary, constExp/constReal duplication). Convention
neutrality (ADR-0006) holds end-to-end, including the new `glsl.ts` imports.

---

### [MEDIUM] New GLSL `abs(E) op k` peephole has NO `@cas/expr`-side codegen test — a keystone hot-loop optimization pinned only by cross-package/browser corpora
- **Area:** `@cas/expr` · **Location:** `packages/expr/src/glsl.ts:103-119` (`emitAbsSquaredCompare`), call site `:151-152`
- **Type:** test-gap (perf-churn)
- **Confidence:** high
- **Fix-safety:** needs-review
- **Evidence:** Commit `0527fe5` added `emitAbsSquaredCompare`, lowering `abs(E) > k` / `k > abs(E)` (k a real,
  non-negative compile-time constant) to the sqrt-free `cabs2(E) > k·k`. The logic carries three correctness
  assumptions that a regression could silently break: (a) the `k !== null && k >= 0` guard (a negative k makes
  `abs(E) op k` trivially decidable and squaring flips the sense); (b) emitting **`k·k`**, not `k`; (c) the
  mirrored form for `k op abs(E)`. Grepping `packages/expr/test/**` for `cabs2` returns **nothing** — no unit
  test asserts the emitted string. The many `abs(z) > 2` tests (`expr.test.ts:32`, `evaluateCompile.test.ts`,
  `namedParams.test.ts:210`, …) only check `compileEscape(...)` is non-empty or that the *JS* evaluator escapes.
  The commit message says "the glslCodegen codegen assertion is updated and the image/dual-backend corpus stays
  green" — but those live in `@cas/gpu` / `apps/complex-dynamics` (cross-package, and `ci.yml`'s `browser` job is
  explicitly "not a publish blocker" per CLAUDE.md §11). So this @cas/expr-owned string transform has coverage
  only outside its own package, gated on a non-blocking browser job.
- **Why it matters:** The brief calls perf rewrites of hot loops "the #1 place to find latent regressions." This
  one changed the escape predicate — run every pixel every iteration — and its correctness contract (k≥0, k·k)
  is exactly the sort a future edit could drop. A `toContain`-style assertion in @cas/expr is cheap and would
  fail fast, in the package that owns the code, on the `lint`/`typecheck`/`test`-gated path.
- **Recommendation:** Add an @cas/expr test asserting `compileEscape(parse("abs(z) > 2"))` emits `cabs2(` and
  `4.` (and NOT `cabs(`/`length`); the mirror `2 > abs(z)`; that a *parameter* threshold `abs(z) > k` does NOT
  fire the peephole — stays `cre1(...)`; and that a hypothetical negative constant would not be squared into a
  flipped test). No source change.

---

### [MEDIUM] Prior consolidation still OPEN: `constExp` (derivative.ts) and `constReal` (glsl.ts) are byte-identical duplicated constant-folders that must stay in lockstep for JS↔GLSL fold-parity
- **Area:** `@cas/expr` · **Location:** `packages/expr/src/derivative.ts:99-140` (`constExp`) and `packages/expr/src/glsl.ts:178-220` (`constReal`)
- **Type:** consolidation (both consumers exist, within one package)
- **Confidence:** high
- **Fix-safety:** needs-review
- **Evidence:** The 2026-08 review (`findings/02-expr-interchange.md`, its 2nd finding) flagged these two as
  logically identical line-for-line (same `num`/`const` e·pi·tau·phi·γ mapping / `neg` / `arith` cases, same
  `default → null`) and recommended hoisting one shared `constReal` beside `nodeIsBool` in `ast.ts`. **It was not
  done.** Both bodies are still present and still diverge-able: `derivative.ts:98` still carries the comment
  "Mirrors glsl.ts's constReal." Both decide *what counts as a compile-time real constant, and its value* — the
  gate for the exact-`intPow` fold (glsl) and the power-rule fold (derivative). Adding a future language constant
  (e.g. `catalan`) to the lexer + one copy silently desyncs the two backends' fold decisions, the exact desync
  `nodeIsBool` was lifted into `ast.ts` to prevent (`ast.ts:299-306`).
- **Why it matters:** Re-review must "flag if a prior finding is still open." This is a real, sanctioned
  DRY/parity cleanup (the precedent already exists in the same file) left unaddressed.
- **Recommendation:** Hoist one `constReal(node): number | null` into `ast.ts` beside `nodeIsBool`; import in both
  `derivative.ts` and `glsl.ts`. Follows the `nodeIsBool` precedent exactly.

---

### [LOW] The peephole broadens a documented ≤1-ulp JS↔GLSL divergence from "escape predicate" to every `abs(E) op const` boolean context (incl. `if` conditions inside `f`)
- **Area:** `@cas/expr` · **Location:** `packages/expr/src/glsl.ts:144-152` (peephole) vs `packages/expr/src/evaluate.ts:170-171,364-365` (JS `>`/`<` compare) and `complexJs.ts:46` (`abs` = `Math.hypot`)
- **Type:** numerical (parity, informational)
- **Confidence:** high
- **Fix-safety:** needs-review
- **Evidence:** JS evaluates `abs(E) op k` as `hypot(E) op k` (real-part ordering, `evaluate.ts:170-171`,
  `364-365`); GLSL now emits `cabs2(E) op k·k` = `dot(E,E) op k·k`. `dot(E,E)` vs `hypot(E)²` differ by ≤1 ulp,
  so a boundary point may flip. The `glsl.ts:146-150` comment and the commit frame this purely as the *escape
  predicate* (`abs(z) > R`), and the goldens were regenerated for escape counts. But `emitAbsSquaredCompare` runs
  in **`emitBool` for any comparison node**, so it also fires for an `if` condition inside `f` — e.g.
  `if(abs(z) > 1, z, c)` — where the ≤1-ulp flip now changes the returned complex value (not just an escape
  count) on the measure-zero boundary. The `f`-side branch selection has no regenerated golden mentioned.
- **Why it matters:** Small and on a measure-zero set, but the caveat as written under-scopes where the new
  divergence reaches. @cas/expr itself cannot run GLSL, so nothing in-package pins even the escape-side ≤1-ulp
  agreement (that's the @cas/gpu dual-backend corpus).
- **Recommendation:** Widen the `glsl.ts` comment to say the peephole applies to *every* `abs(E) op const`
  boolean, so an `if`-condition boundary in `f` shifts by ≤1 ulp too (not only escape counts). Optionally confirm
  the @cas/gpu dual-backend corpus includes an `if(abs(...) > k, …)` inside `f`, not just an escape predicate.

---

### [LOW] Peephole emits an out-of-float32-range literal for an extreme constant threshold (`k·k > 3.4e38`)
- **Area:** `@cas/expr` · **Location:** `packages/expr/src/glsl.ts:112,116` (`glslFloat(k * k)`)
- **Type:** numerical (edge)
- **Confidence:** medium (reasoned, not run) · **Fix-safety:** needs-review
- **Evidence:** `k·k` is computed in JS float64, so it stays finite (and `glslFloat` only throws on non-finite),
  but both stdlibs' `cabs2` returns a 32-bit GLSL `float` and the literal is a 32-bit float. For `k > ~1.84e19`,
  `k·k > 3.4e38` overflows float32 → the emitted literal becomes `+Inf`, so `cabs2(E) > Inf` is always false and
  the escape test never fires (an infinite-loop-shaped bug at the shader's iteration cap). The pre-peephole form
  `length(E) > k` had no such issue (it compared against `k`, not `k·k`).
- **Why it matters:** Requires a user to type an absurd escape radius (`abs(z) > 2e19`); realistic radii (2 … 1e5
  → k·k = 4 … 1e10) are far inside range. Genuinely an edge NIT, but it is a new failure mode the sqrt form
  didn't have.
- **Recommendation:** Guard the fold on `k*k` being within float32 range (e.g. `k*k <= 3.4e38`) and fall back to
  the `length()` form otherwise; or document the ceiling next to the peephole. Confirming test:
  `compileEscape(parse("abs(z) > 2e19"))` currently emits a `> 4e+38` literal.

---

### [LOW] Interchange: `View.c?`, `QuadratureDomain.bounded`, and `weight?` are schema-declared but never validated (a narrower sibling of the now-fixed interchange-validate-01)
- **Area:** `@cas/interchange` · **Location:** `packages/interchange/src/validate.ts:179-188` (`validateQuadratureDomain`), `:221-228` (`view` case); schema `schema.ts:130-137,169`
- **Type:** bug (validation gap)
- **Confidence:** high · **Fix-safety:** needs-review
- **Evidence:** The nested-payload fix (interchange-validate-01) is correctly and completely landed —
  `validateQuadratureDomain` now covers `phi`, `conventions` (+`assertCanonicalWire`), `hData`,
  `boundarySamples`, and is called for the nested `sourceDomain`; `tilingSetHint`/`escape`/`viewport` are all
  validated (I enumerated every `Complex[]`/`Conventions`/`MapSpec` field in `schema.ts` against the guards —
  none escapes the canonical-wire check or the `MAX_*` caps). What's still unvalidated are three *non*-convention,
  *non*-array declared fields: `View.c?: Complex` (validated: `map`, `viewport`; `c` present-but-garbage passes,
  and a consumer reading `payload.c.re` gets `undefined`/NaN — the exact class the prior review closed for
  `escape`/`viewport`); and `QuadratureDomain.bounded: boolean` (non-optional, unchecked) + `weight?` enum
  (unchecked), for both the top-level and nested `sourceDomain`.
- **Why it matters:** Much lower stakes than validate-01 — none of these carries a π/2πi convention tag or an
  unbounded array, so there is no silent-scaling or DoS risk, only a NaN/garbage read for a hand-edited payload.
  But `View.c` is the same "present-yet-malformed optional field is trusted" pattern the fix set out to close,
  and it was missed.
- **Recommendation:** In the `view` case, `if (payload.c !== undefined && !isComplex(payload.c)) throw …`. In
  `validateQuadratureDomain`, check `typeof qd.bounded === "boolean"` and (if present) `weight ∈ {unweighted,
  log, power}`. Add a test that a `view` with `c: {re: "x"}` throws.

---

### [LOW] Prior finding STILL OPEN: `arccosh` returns the reflected branch on `(−∞, −1]` while its docstring says "principal branch"
- **Area:** `@cas/expr` · **Location:** `packages/expr/src/complexJs.ts:128-129`
- **Type:** numerical | stale-doc (honest-labeling)
- **Confidence:** medium (math reasoned) · **Fix-safety:** needs-review
- **Evidence:** Unchanged since the prior review flagged it (`findings/02`, 3rd finding). `arccosh(z) = log(z +
  √(z²−1))` with principal `sqrt`: at `z = −2`, `√3 = +1.732`, `z+√ = −0.268`, `log(−0.268) = −1.317 + iπ` →
  **Re < 0**, whereas the C99/DLMF principal `arccosh(−2) = +1.317 + iπ` (Re ≥ 0, via `√(z−1)·√(z+1)`). Docstring
  still says "principal branch." JS and GLSL use the same closed form (so they agree with each other), so this is
  a branch/label issue, not a backend mismatch.
- **Why it matters:** Re-review should note prior findings still open. Low practical impact (domain-colored plot
  shows the reflected value on that ray, not a NaN).
- **Recommendation:** As before — switch to `log(z + √(z−1)·√(z+1))` in both JS and the GLSL twin, or soften the
  docstring. Confirming test: `arccosh([-2,0])` should be `≈ 1.31696 + πi` (mpmath); today it is `≈ −1.31696 + πi`.

---

### [LOW] Prior finding STILL OPEN: `z^a` with an integer-valued *parameter* diverges JS (exact `intPow`) vs GLSL (`cpow` principal branch)
- **Area:** `@cas/expr` · **Location:** `packages/expr/src/complexJs.ts:73-79` (`pow`, runtime test) vs `packages/expr/src/glsl.ts:223-229` (`emitPow`, compile-time `constReal` only)
- **Type:** numerical (JS↔GLSL parity)
- **Confidence:** medium · **Fix-safety:** needs-review
- **Evidence:** Unchanged. JS `pow` promotes at runtime (`w[1]===0 && Number.isInteger(w[0]) && |w[0]|≤1024 ⇒
  intPow`); GLSL folds only compile-time constants via `constReal(exp)`, so a bare parameter `a` bound to integer
  `2` runs `cpow(z, a)` (principal branch) on the GPU while the CPU overlay runs exact `intPow`. Disagreement
  grows with `|a|` near the negative-real axis. Distinct from the (now largely settled) constant-exponent
  `intPow` tree-shape nit.
- **Why it matters:** Re-review status note; a latent asymmetry in exactly the class (integer powers across the
  negative axis) the constant-fold exists to protect.
- **Recommendation:** Document the residual gap by `constReal`, and/or have hosts feed integer-valued parameters
  as folded literals for the `^` fast path.

---

### [LOW] Prior finding STILL OPEN: `Frac.toNumber` returns `Infinity`/`0` for representable ratios in the ~[2^1000, 2^1024) window; comment claims true overflow
- **Area:** `@cas/exact` · **Location:** `packages/exact/src/gaussian.ts:98-111` (`KEEP_BITS = 1000`)
- **Type:** numerical
- **Confidence:** high (math), low (reachability) · **Fix-safety:** needs-review
- **Evidence:** Unchanged from `findings/01` (3rd finding). The slow path shifts both sides right by
  `max(bitlen(a),bitlen(b)) − 1000`; the smaller side vanishes to 0 whenever the bit-gap ≥ 1000, but a ratio only
  truly overflows the double range at gap ≳ 1024 — so ratios of magnitude ~[1.07e301, 1.8e308) return
  `Infinity`/`0` despite being representable. The comment at `:98-99` ("If one side shifts away to 0 the true
  ratio really did overflow or underflow … 0 / Infinity is then the right answer") is still false in that window.
- **Why it matters:** Sole exact→numeric crossing feeding `= exact`-labeled read-outs. Unreachable from today's
  capped Gleason degrees, hence LOW, but it is a library boundary.
- **Recommendation:** As before — `KEEP_BITS = 1023`, or only report `Infinity`/`0` when the bit-gap ≥ 1024.

---

### [NIT] Speculative perf: `makePoly.pow` uses naive repeated-multiply while sibling `linearPower` uses exponentiation-by-squaring
- **Area:** `@cas/core` · **Location:** `packages/core/src/poly.ts:94-98` (`pow`) vs `:100-110` (`linearPower`)
- **Type:** perf | consolidation (speculative, single behavior)
- **Confidence:** high · **Fix-safety:** needs-review
- **Evidence:** `pow(a, n)` loops `n` full dense `mul`s; the adjacent `linearPower` already does binary
  exponentiation. For a high-degree base raised to large `n` the naive form is asymptotically worse. This is a
  faithful port of QD's `QD.Poly` (header says so) and current callers use small `n`, so no ADR-0007 trigger.
- **Why it matters:** Minor; flagged per the brief's perf/consolidation emphasis, labeled speculative — not to
  action now.
- **Recommendation:** If a future consumer raises a non-trivial polynomial to a large power, switch `pow` to the
  same square-and-multiply shape as `linearPower` (guard with a golden pinning current outputs).

---

### [NIT] Positive confirmations (nothing to change)
- **Area:** all four packages · **Type:** confirmation
- **DK NaN-stickiness (prior HIGH `cd-dk-01`) — FIXED, correctly.** `durand-kerner.ts:129` is now
  `maxDelta = Math.max(maxDelta, dm)`. I hand-traced through the *actual* algebra: a blow-up gives
  `alg.div([Inf,0],[Inf,0])` → `divScaled` → `[NaN,NaN]` → `alg.abs = hypot(NaN,NaN) = NaN`, and
  `Math.max(finite, NaN) = NaN` is sticky for the rest of the sweep, so `maxDelta < tol` stays false and no
  `{NaN}` root is reported `converged`. The mixed-NaN-plus-small-finite interleaving the prior form let slip is
  now closed. (`complex.ts:151` `abs = Math.hypot`, `algebra.ts:88` same, confirm NaN propagates.)
- **geometry `pointInPolygon` — correct.** `geometry.ts:35` `(yi > p[1]) !== (yj > p[1])` guard makes the
  `/(yj − yi)` safe (straddling forces `yj ≠ yi`); consolidated home per ADR-0007.
- **interchange nested-payload validation (prior MEDIUM interchange-validate-01) — FIXED, completely.**
  `validateQuadratureDomain` factored out and applied to nested `sourceDomain` (`:210-211`); `hData`,
  `boundarySamples`, `tilingSetHint`, `escape`, `viewport` all validated; `assertCanonicalWire` now reaches
  nested `sourceDomain.conventions`; every nested `Complex[]` goes through `isComplexArray`'s `MAX_COEFF_LEN`
  cap and `branches` through `MAX_BRANCHES`. No `Complex[]`/`Conventions`/`MapSpec` field escapes (schema
  enumerated). `SchwarzMap.phi` cannot be `schwarz`, so no unbounded validation recursion / DoS.
- **`lambertw` docstring (prior NIT) — FIXED.** `complexJs.ts:178` now reads "5 Newton steps" (the update at
  `:183` is indeed the Newton step for `w·e^w − z`).
- **Convention neutrality (ADR-0006) — holds end-to-end.** `@cas/core` + `@cas/exact` contain only comment
  lines asserting the absence of π/2πi normalization. `@cas/expr`'s `PI`/`TAU` occurrences are mathematically
  *required* (Γ reflection `π/(sin πz …)`, ζ `π^{s−1}`, `arccos = π/2 − arcsin`) or the language constants
  `tau`/`phi`/`γ`; the new `glsl.ts` `import { TAU, PHI, EGAMMA }` emits those as literal float values — none is
  a QD area/contour normalization. `@cas/interchange` keeps convention as an explicit tag with the canonical-wire
  guard. No leak.
- **`@cas/exact` resultant/discriminant — sign/magnitude fixes intact.** `discriminant` applies
  `(−1)^{d(d−1)/2}` (`:173`) and divides by `lc` un-wrapped (prior `cd-disc-06`); `trimTop` guards the degenerate
  lists (`cd-res-11`/`cd-disc-12`); `bareissDet` fraction-free division by the previous pivot is correct.
- **`lstsq` docs** now correctly state the `1e-300` guard is an *exact*-zero test, not an ill-conditioning gate
  (`lstsq.ts:14-20`) — the prior LOW doc clarification landed.
- **`emitAbsSquaredCompare` is type-safe:** both stdlibs define `cabs2` returning a scalar `float`
  (`complexSingle.glsl.ts:19`, `complexDf64.glsl.ts:22`), so `cabs2(E) op k·k` is `float op float` in both builds
  — no `vec` vs `float` mismatch. Only `>`/`<` reach it (`==` returns early; `CompareOp = ">"|"<"|"=="`, so no
  `!=`/`<=`/`>=` exist). The `k ≥ 0 ⇒ (a op k ⟺ a² op k²)` equivalence is sound (`abs(E) ≥ 0` always).

---

## Coverage

**Read in full:** `packages/core/src/{durand-kerner, geometry, rootsMonic, lstsq, complex, algebra, poly}.ts`
and `index.ts`; `packages/exact/src/{gaussian, resultant}.ts`; `packages/expr/src/{glsl, complexJs, ast,
derivative(partial: constExp region)}.ts` + the `git show 0527fe5` diff of `glsl.ts`; `packages/interchange/src/
{validate, schema}.ts` and `index` exports. Cross-referenced both prior findings files
(`2026-08-suite-review/findings/01-core-exact.md`, `02-expr-interchange.md`) and enumerated every schema field
against the validators. Verified `@cas/gpu` `cabs2` signatures (for peephole type-safety only — that package is
out of scope). Grepped all four `src/` trees for π/2πi normalization constants.

**Confirmed still-fixed (not re-reported):** `cd-dk-01` (now complete), `cd-cpow-05`, `cd-div-02`,
`cd-frac-07` common case, `cd-res-11`, `cd-disc-06`/`-12`, `expr-eval-01`/`expr-glsl-01`/`-02`/`parser-01`,
interchange-validate-01 sibling fields, `lambertw` docstring.

**Prior LOWs re-confirmed OPEN (status notes above, not re-argued in depth):** arccosh reflected branch, z^a
runtime-integer parity, Frac.toNumber [2^1000,2^1024) hole, constExp/constReal duplication (raised to MEDIUM as
an unaddressed sanctioned consolidation).

**Did NOT deeply re-examine** (prior review read every line and found clean; no churn since, and I spot-checked
rather than re-tracing): `series.ts`, `sphere.ts`, `format.ts`, `exact/{qiPoly, biPoly, render}.ts`,
`expr/{evaluate (beyond the compare paths), parser, lexer, latex, rational}.ts`, `interchange/{codec, base64url,
viewstate, goldens}.ts`. The Borwein ζ `d_k` ratio recurrence and Lanczos Γ I re-derived and both are correct
(`complexJs.ts:234-265`, `204-219`). I ran no code (READ-ONLY); every numerical/parity claim above names a
concrete confirming test.
