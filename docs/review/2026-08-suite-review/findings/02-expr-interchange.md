# Findings — Agent 02 "EXPR" (`@cas/expr` + `@cas/interchange`)

Scope: the map-representation keystone (ADR-0005) — `packages/expr` (parser, AST, JS/GLSL/LaTeX/derivative/rational passes, complex stdlib) and `packages/interchange` (schema, validator, codec, view-state codec, cross-app goldens). Emphasis per brief: expression-evaluation correctness (branch cuts / principal values / poles), interchange round-trip fidelity + schema-validation completeness + version migration, and the ADR-0006 convention-tagging neutrality end-to-end, plus the CD→RM Böttcher and QD→CD `schwarz` hand-offs. Read-only static inspection; no code executed — numerical claims come with a concrete confirming test. The prior review (2026-07) already fixed `expr-eval-01`, `expr-glsl-01`, `expr-glsl-02`, `expr-parser-01` — I confirmed all four fixes are present and **not regressed** (comments cite the codes; the guards/coercions are in place).

---

### [MEDIUM] `interchange-validate-01` is still open: `sourceDomain` / `hData` / `tilingSetHint` bypass validation *and* the ADR-0006 canonical-wire guard
- **Area:** `@cas/interchange` · **Location:** `packages/interchange/src/validate.ts:175-207` (`validatePayload`); fields declared `packages/interchange/src/schema.ts:130-149`
- **Type:** convention | bug
- **Confidence:** high · **Fix-safety:** needs-review
- **Evidence:** The `schwarz-reflection` branch (`validate.ts:178-186`) validates only `payload.sigma`, `payload.conventions`, `payload.escape`; the `quadrature-domain` branch (`:187-195`) validates only `phi`, `conventions`, `boundarySamples`. `SchwarzReflection.sourceDomain?: QuadratureDomain` (schema.ts:144) — which carries its **own** `phi: MapSpec` and its **own** `conventions` — is never touched, nor is `SchwarzReflection.tilingSetHint.fundamentalTile: Complex[]` (schema.ts:147), nor `QuadratureDomain.hData?: MapSpec` (schema.ts:133). So `assertCanonicalWire` (`validate.ts:103`) — which documents itself as *the* ADR-0006 π/2πi guard, "an un-caught non-canonical payload becomes a mis-scaled picture with no other guardrail" — is applied **only** to the top-level `conventions`, never to a nested `sourceDomain.conventions`. A nested `{area:"normalized", contour:"suppressed-2pii"}` passes `validateEnvelope` while claiming a canonical wire, and `fundamentalTile` / nested `phi` coefficient arrays skip the `MAX_COEFF_LEN` DoS cap. The adjacent sibling gaps this same finding named (`view.viewport`, `escape`, `boundarySamples`) *were* closed — there is now a test block for them (`test/interchange.test.ts:235` "the non-MapSpec structural fields") — but these three were left, so the omission is a visible asymmetry, not an oversight-in-progress.
- **Why it matters:** Directly in this review's convention-tagging emphasis: the one hole in the ADR-0006 defense-in-depth is a *nested* convention tag the guard never inspects. Today it is latent (a repo-wide grep finds `sourceDomain`/`tilingSetHint` **nowhere outside schema.ts** — no producer emits them, CD's importer reads only `payload.phi`/`sigma`/`map`), which is why the prior verifier rated it "defense-in-depth, not a live defect." But `validateEnvelope` is also reachable from a **paste-JSON entry point with no transport size cap** (`apps/complex-dynamics/src/main.ts`, `t.startsWith("{") ? validateEnvelope(JSON.parse(t)) : decodeLink(t)`), so the `fundamentalTile` cap-bypass is real for a pasted payload, and the moment any tool starts reading `sourceDomain` the silent-π hole opens.
- **Recommendation:** Factor the `quadrature-domain` body into `validateQuadratureDomain(qd)` (bringing `isMapSpec(phi)` + `assertCanonicalWire(conventions)` with it) and call it for `payload.sourceDomain` when present; validate `hData` with `isMapSpec` when present; validate `tilingSetHint` (`fundamentalTile === undefined || isComplexArray(fundamentalTile)`). Add a test asserting a non-canonical `sourceDomain.conventions` throws `/non-canonical/`. (This is the prior review's proposed fix, still unapplied.)

---

### [MEDIUM] Duplicated constant-folder: `constExp` (derivative) and `constReal` (glsl) are byte-identical and must stay in lockstep for JS↔GLSL fold-parity
- **Area:** `@cas/expr` · **Location:** `packages/expr/src/derivative.ts:99-140` (`constExp`) and `packages/expr/src/glsl.ts:151-193` (`constReal`)
- **Type:** consolidation (real, both consumers exist — but **within one package**, so an internal shared-helper extract, not a cross-package `@cas/*` one)
- **Confidence:** high · **Fix-safety:** needs-review
- **Evidence:** The two functions are logically identical, line for line: same `num`/`const` (e/pi/tau/phi/γ → value, else null)/`neg`/`arith` (`+ - * /` with `r===0?null`, `^`→`Math.pow`) cases, same `default → null`. `derivative.ts:98` even comments "Mirrors glsl.ts's constReal." Both decide *what counts as a compile-time real constant, and its value* — the input to a fold that must agree on both backends (glsl's `constReal` gates the exact-`intPow` fold; derivative's `constExp` gates the power-rule `k·u^(k-1)`).
- **Why it matters:** This is the exact pattern the codebase has already committed to de-duplicating on parity grounds: `nodeIsBool` was lifted into shared `ast.ts` precisely because "the copies were byte-identical, and a silent divergence would desync the CPU overlay from the GPU shader" (`ast.ts:299-306`). Two copies of the constant-folder are the same latent desync: add a new constant (e.g. a future `catalan`) to the lexer + one copy and the backends' fold decisions drift. (In fairness the *derivative* side degrades gracefully — a missed constant there still gets the correct value via the general power rule, since `dw=0` kills its `log(u)` term — so the sharper live risk is `constReal`'s own correctness, but the DRY/parity precedent stands.)
- **Recommendation:** Hoist one `constReal(node): number | null` into a shared spot (e.g. `ast.ts`, beside `nodeIsBool`) and import it in both `derivative.ts` and `glsl.ts`, following the `nodeIsBool` precedent exactly.

---

### [LOW] `arccosh` docstring says "principal branch" but `log(z + √(z²−1))` is not the standard principal value on `(−∞, −1]`
- **Area:** `@cas/expr` · **Location:** `packages/expr/src/complexJs.ts:128-129`
- **Type:** numerical | stale-doc (honest-labeling)
- **Confidence:** medium (math reasoned, not executed) · **Fix-safety:** needs-review
- **Evidence:** `arccosh(z) = log(add(z, sqrt(sub(mul(z, z), ONE))))` with the principal `sqrt`. For a real `z < −1`, e.g. `z = −2`: `z²−1 = 3`, principal `√3 = +1.732`, `z + √ = −0.268`, `log(−0.268) = −1.317 + iπ` → **Re < 0**. The C99/DLMF principal `arccosh` (what numpy/mpmath return) has **Re ≥ 0**: `arccosh(−2) = +1.317 + iπ`, obtained from the `√(z−1)·√(z+1)` form. So the code returns the *reflected* branch (`−arccosh`) on the ray `(−∞, −1]`. `arcsinh` (`:127`) does **not** have this problem (checked at `2i`: code gives `1.317 + iπ/2`, matching `i·arcsin(2)`).
- **Why it matters:** Squarely in the brief's branch-cut / principal-value / honest-labeling emphasis: the docstring promises "principal branch" but the value is off by a sign of the real part on part of the cut. Practical impact is low — JS and GLSL use the *same* closed form (`complexJs.ts:117-119`, pinned by `complexParity.test.ts`), so the two backends agree with each other, and a domain-colored plot merely shows the reflected value on that ray rather than a NaN or a backend mismatch.
- **Recommendation:** Either switch to the standard `log(z + √(z−1)·√(z+1))` form (in both JS and the GLSL twin, keeping parity), or soften the docstring to state the branch explicitly ("principal for Re z ≥ 0 / off the ray z ≤ −1"). Confirming test: assert `arccosh([-2,0])` against a reference (`mpmath.acosh(-2)` = `1.31696 + πi`); today's code yields `≈ −1.31696 + πi`.

---

### [LOW] `z^a` with an integer-valued *parameter* diverges JS↔GLSL: JS promotes runtime integers to exact `intPow`, GLSL only folds compile-time constants
- **Area:** `@cas/expr` · **Location:** `packages/expr/src/complexJs.ts:73-79` (`pow`) vs `packages/expr/src/glsl.ts:196-202` (`emitPow`)
- **Type:** numerical (JS↔GLSL parity)
- **Confidence:** medium · **Fix-safety:** needs-review
- **Evidence:** JS `pow` decides at **runtime**: `if (w[1] === 0 && Number.isInteger(w[0]) && |w[0]| ≤ 1024) return intPow(...)` (exact, entire). GLSL `emitPow` decides at **compile time** via `constReal(exp)` — a bare parameter `a` folds to `null`, so `z^a` always emits `cpow(z, a)` (principal `exp(a·log z)`). When a host sets parameter `a` to an exact integer (say 2) and evaluates near the negative-real axis, the CPU overlay runs `intPow` while the GPU runs `cpow`. This is a *different* gap from `expr-glsl-03` (which is about the `intPow` tree shape for **constant** exponents); here the JS runtime-integer promotion simply has no GLSL analogue. The `constReal` comment (`glsl.ts:144-150`) frames the constant-fold as necessary because "GLSL routes it through cpow's principal branch and silently disagrees with the CPU reference across the negative-real axis" — the residual runtime-parameter case is not mentioned.
- **Why it matters:** A latent asymmetry in exactly the class (integer powers across the negative axis) the constant-fold exists to protect. For small `|a|` it stays inside the harness's float32 tolerance (for even integer `a`, `cpow` is continuous across the axis, so the gap is only ~1 ulp of `exp/log` rounding), but it grows with `|a|` and is a real intent mismatch (JS exact vs GLSL principal).
- **Recommendation:** Document the residual gap next to `constReal`, and/or have the host that binds an integer-valued parameter feed it as a folded literal for the `^` fast-path. Confirming test: `makeComplexFn(parse("z^a"), {a:[2,0]})([-1,0]) === [1,0]` exactly, whereas the GLSL emit is `cpow(z, a)`; a dual-backend probe with a parameterized integer exponent near `z = −1` would show the ~1e-7 float32 imaginary residue the constant-exponent corpus never exercises.

---

### [LOW] `expr-glsl-03` still open: GLSL inline `intPow` (left-linear) differs from JS `intPow` (square-and-multiply) for 4 ≤ n ≤ 8
- **Area:** `@cas/expr` · **Location:** `packages/expr/src/glsl.ts:212-224` (`intPow`) vs `packages/expr/src/complexJs.ts:82-93` (`intPow`)
- **Type:** numerical | test-gap
- **Confidence:** high · **Fix-safety:** needs-review
- **Evidence:** GLSL emits a left-linear chain `((z·z)·z)·z` for `n ≤ 8` (`for (let k = 1; k < n; k++) acc = cmul(acc, baseExpr)`); JS `intPow` squares (`z⁴ = (z²)²`). The trees differ for `n ≥ 4` by ~1 float64 ulp (~1e-7 relative in float32) — no wrong answer, inside the harness tolerance. Prior review confirmed and downgraded this to a corpus-coverage nit; it remains unaddressed on the emit side.
- **Why it matters:** Minor today, but the dual-backend corpus that would catch a future retune of `INTPOW_INLINE_MAX` lives in `@cas/gpu` (`dualBackend.ts`, out of my scope) and reportedly contains only `z²`/`z³` — the two exponents where the trees coincide.
- **Recommendation:** Either emit the same square-and-multiply tree here, or (gpu agent's call) add `z^6`/`z^8` to `DUAL_BACKEND_CORPUS`. Flagging the `@cas/expr` half; defer the corpus half to the `@cas/gpu` reviewer.

---

### [LOW] `@cas/expr` README is stale: function list omits the hyperbolics; `newtonIteration` signature is wrong
- **Area:** `@cas/expr` · **Location:** `packages/expr/README.md:36` and `:87`
- **Type:** stale-doc
- **Confidence:** high · **Fix-safety:** safe-now (doc-only)
- **Evidence:** (1) Line 36's `functions` list — `re im conjugate abs arg sqrt exp log sin cos tan arcsin arccos arctan arctan2 mod lambertw gamma zeta round floor ceil` — omits the nine B3 builtins that **are** supported (present in `ast.ts` `COMPLEX_FUNCTIONS:44-55`, and in the JS/GLSL/LaTeX/derivative passes): `sinh cosh tanh sec csc cot arcsinh arccosh arctanh`. The same README's "Special functions" section (line 59) even says "Like the hyperbolics," so the list simply predates their addition. (2) The API table (line 87) documents `newtonIteration(f, df)` "(GLSL Newton step)", but the actual signature is `newtonIteration(fAst: Node): { iter: Node; escape: Node }` (`derivative.ts:224`) — **one** argument (it differentiates internally), returning `{iter, escape}` ASTs, not a "GLSL Newton step."
- **Why it matters:** A reader can't tell `sinh`/`cosh`/`arctanh`/etc. are available, and would call `newtonIteration` with the wrong arity.
- **Recommendation:** Add the nine builtins to line 36; correct line 87 to `newtonIteration(fAst) → { iter, escape }`.

---

### [LOW] Convention-neutrality guarantee does not cover `map` / `view` payloads (boundary worth documenting)
- **Area:** `@cas/interchange` · **Location:** `packages/interchange/src/schema.ts:124` (`MapSpec` has no `conventions`), `validate.ts:196-206` (`map`/`view` cases call no `assertCanonicalWire`)
- **Type:** convention (informational)
- **Confidence:** high · **Fix-safety:** needs-review
- **Evidence:** `assertCanonicalWire` runs only for `quadrature-domain` and `schwarz-reflection`. `MapSpec` (and therefore a bare `kind:"map"` payload) and `View` carry no `Conventions` field, so the ADR-0006 defense-in-depth does not extend to them. The CD→RM Böttcher hand-off is a `kind:"map"` `LaurentMap` (`goldens.ts:145`) with no convention tag.
- **Why it matters:** Correct **today** — a Böttcher/Laurent conformal map is convention-neutral (capacity γ₁ and the bₖ carry no π/2πi normalization), so there's nothing to tag. But the guarantee's boundary is implicit: the first time a bare `kind:"map"` is used to carry a QD-convention-sensitive quantity (a normalized-area `h`, say), there is no tag and no guard. Also note the RM consumer *assumes* a bare `LaurentMap` is exterior ("Laurent at ∞", `goldens.ts:131-132`) — an implicit interior/exterior contract not expressed in the schema (a bare map has no `disk` field).
- **Recommendation:** No code change needed now; add a one-line note to `INTERCHANGE.md` / the `MapSpec` doc that `map`/`view` payloads are assumed convention-neutral and must not carry normalized quantities, so a future producer doesn't route a QD quantity through an untagged `kind:"map"`.

---

### [NIT] Lambert-W docstring says "5 Halley steps"; the iteration is Newton's method
- **Area:** `@cas/expr` · **Location:** `packages/expr/src/complexJs.ts:178` (docstring) / `:181-184` (loop)
- **Type:** stale-doc
- **Confidence:** high · **Fix-safety:** safe-now (doc-only)
- **Evidence:** The docstring reads "seeded approximation refined by 5 Halley steps," but the update `w = (w² + z·e^{−w}) / (w + 1)` is exactly the **Newton** step for `f(w) = w·e^w − z` (`w − (w e^w − z)/((w+1)e^w)` simplifies to `(w² + z e^{−w})/(w+1)`). Halley's iteration for W carries the extra second-derivative term and is visibly larger.
- **Why it matters:** Cosmetic, but a reader auditing the convergence order would be misled (Newton is quadratic; the "Halley" label implies cubic).
- **Recommendation:** Change "5 Halley steps" → "5 Newton steps."

---

## Coverage

**Examined in full:** `@cas/expr` — `complexJs.ts` (the whole complex stdlib: arithmetic, `sqrt`/`log`/`pow`/`intPow`, trig + inverse, hyperbolic + inverse, `lambertw`, `gamma` (Lanczos g=7 + reflection), `zeta` (Borwein `d_k` recurrence + functional equation) — I re-derived the Borwein `t_i` ratio recurrence and the ζ functional equation and both are correct, and `gamma`'s reflection split at `Re < 0.5` is right); `evaluate.ts` (interpreter + compiled-closure tree + the memo caches); `ast.ts` (traversals, `nodeIsBool`, `substitute`, `freeParameters`); `parser.ts` + `lexer.ts` (precedence, right-assoc `^`, unary/power depth guards, `2i` imaginary literal, sci-notation `e` disambiguation); `derivative.ts` (every chain-rule outer factor verified correct; the `constExp` pole-avoidance reasoning is sound); `glsl.ts` (emit paths, param bindings, `emitBody` redeclaration handling, `==`/ordering df64 accessors); `rational.ts` (`pMul`/`pPow` zero-skip + binary-exp, memory caps); `latex.ts`. `@cas/interchange` — `schema.ts`, `validate.ts`, `codec.ts`, `base64url.ts`, `viewstate.ts`, `goldens.ts`, `index.ts`, both READMEs, and the two test files' titles.

**Hand-offs checked (schema adequacy — no defect found):** QD→CD `form:"schwarz"` σ recipe supports all three shipped families — deltoid Laurent φ, single-exterior-pole (`branches`, 1.2.0), and bounded-lobe (`form:"bounded"`, 1.3.0) — each with a golden that pins producer↔consumer bytes and a frozen `(w₀, σ(w₀))` value. CD→RM Böttcher `kind:"map"` `LaurentMap` (γ₁→c, bₖ→F) is supported and honestly `≈`-labels the truncated tail in its `note`. Version-migration handling (gate on MAJOR=1, ignore unknown optional fields, reject unknown vocabulary via `isMapSpec` default) is sound and tested (`2.0.0` rejected, forward-compat optional fields accepted, top-level non-canonical tag rejected).

**Not covered / deferred:** the GLSL *runtime* stdlib (`carccosh`, `cpow`, `cintpow`, the df64 limbs) lives in `@cas/gpu` — I relied on `complexJs.ts`'s "same closed form" docstring + `complexParity.test.ts` for JS↔GLSL correspondence rather than reading the shaders (that's the `@cas/gpu` agent's scope, incl. the `DUAL_BACKEND_CORPUS` half of `expr-glsl-03`). I did not execute any test or numerically verify the `arccosh`/`z^a` claims (read-only) — both carry a concrete confirming test above. The app-side convention **conversion shims** (QD normalized→standard at export, CD's importer) live in the apps and are other agents' scope; I confirmed only that the interchange boundary *enforces* canonical on decode for the two convention-bearing payload kinds.
