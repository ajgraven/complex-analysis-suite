# A4 — Algebra tab: the exact symbolic engine (`sym/`) and everything built on it

## Scope covered

**Read end to end:** `app/sym/sym-core.mjs` (6,045 lines — the whole API surface; in depth: `Rational`/
`Gaussian`, `MPoly` incl. `fromTermList`/`pow`, `mpolyDet`/`mpolyDetLaplace`/`resultant`/`discriminant`/
`reducedDiscriminant`, `univariateGCD`/`squareFreePart`, `_factorOverQ`/`_qiFactor`/`_factorRec`/`factor`/
`_recombine`, `monomialOrder`/`buchberger`/`reduceGroebner`/`normalForm`/`sPoly`, `schurCohn`/
`unitCircleRootCount`, `comprehensiveGroebnerSystem`, `multivariateSquarefreePart` & the n-variate P1 infra,
series + Padé); `app/sym/sym-radical.mjs` (`solveByRadicals`/`_factorSplit`); `app/algebra/sym-worker.mjs`,
`workers/sym-worker-entry.mjs`, `algebra-op-runner.mjs`, `algebra-autosave.mjs`, `expr-parser.mjs`,
`algebra-moment-parse.mjs`, `cas-export.mjs`, `algebra-latex.mjs`; `prove-plan.mjs` (all four routes'
assemble/verdict/rigor paths); the relevant halves of `algebra-store.mjs` (export/importDAG, `_eliminate`/
`eliminateWithGauge`, `factorOf`/`applyFactor`, `defineSubstitution`/`_validateDefine`, `sympyDerivation`,
`importRCTD`) and `algebra-ui.mjs` (`doFactor`, `_factorInfo`/`_factorInfoAsync`, `previewSubst`/
`previewEquation`/`doDefineSubst`/`doAddEquation`, the Cancel wiring).
**Docs checked against code:** `AHARONOV_SHAPIRO.md`, `GROEBNER_INVESTIGATION.md`, `docs/ALGEBRA_MODULE.md`,
`docs/MULTIVARIATE_FACTORING.md`, `docs/NVARIATE_FACTORING.md` (skim), `docs/ALGEBRA_EXTENSIONS.md` (skim).
The moment/π convention was verified against the **faithful** thesis extraction
(`scratchpad/pdftool/thesis-pdfjs.txt`, `dA = dx dy/π`, contour `2πi` suppressed), not `thesis.txt`.
**Ran:** ~2,700 randomised differential cases (details in Health), the QD headless suite, 8 vitest specs.

**NOT covered, honestly:** the deep interiors of `factorBivariate` (Gao/Ruppert nullspace),
`factorMultivariate`/`mvHenselLift`, `fglm`, `solveZeroDim`'s Möller–Stetter fallback, `realSolutionCount`'s
`_rationalInertia`, `rationalUnivariateRep`/`solveRealCertified`, `triangularize`/`minimalPrimes`/`saturate`,
`discriminantVariety`, `verifySOS`, `curveGenus`, `shapeFromMoments`, `schurCohnAtBox` (read signatures +
caps, exercised some as black boxes only). `algebra-ui.mjs`'s DOM bulk, `algebra-canvas.mjs`,
`domain-mini-plot.mjs`, `algebra-picker.mjs`, `algebra-results-drawer.mjs`. I did **not** drive the app in a
browser (findings ALG-2/ALG-4/ALG-6 are reproduced against the modules, and I name the UI call site and the
event that reaches it, but the on-screen behaviour is `[code]`, not `[confirmed]`).

## Health

| command | result |
|---|---|
| `node app/node-test.js` | 1,389 lines, **0 `FAIL`** (all PASS) |
| `vitest run` on the 8 sym/algebra specs (oracles, cas-corpus, recombine-cap, exact-differential, worker-lifecycle/crash-char/thread, moment-parse) | **142 passed / 142**, 9.86 s |
| my GB fuzz — 300 random ideals (2–3 vars, lex/grlex/grevlex, ℚ and ℚ(i)): every S-pair of the returned basis reduces to 0, every input generator reduces to 0, basis is idempotent under re-`buchberger` | **300 runs, 0 caps, 0 failures** |
| my GB differential vs **sympy** `groebner(..., domain=QQ_I)` — QD's basis and the input generators must have the *same* sympy reduced GB (195 cases incl. fractions + Gaussian coefficients) | **195 ok / 0 bad** |
| `resultant` vs the exact closed form `lc_f^n·lc_g^m·∏(αᵢ−βⱼ)` on split inputs over ℤ[i] | **600 runs, 0 failures** |
| `mpolyDet` (Bareiss, packed) vs `mpolyDetLaplace` on 200 random 2×2–4×4 multivariate matrices | **200 runs, 0 failures** |
| univariate + bivariate `factor` multiply-back (radical semantics) — 500 random polys | **0 wrong factorisations** (3 "misses" were correct radical reductions of repeated factors) |
| `factor` **status** vs sympy `factor_list(..., domain=QQ_I)` on 500 random polys | 213 `irreducible` correct, **14 FALSE `irreducible`**, 225 `reducible` with matching factor counts, 35 honest caps → **ALG-1** |
| `schurCohn` vs `numpy.roots` on 600 random ℤ[i] polynomials (degree 1–5), applying the documented distinct-vs-multiplicity switch | **600 ok / 0 bad** |
| `realSolutionCount` vs an independent Newton-from-random-starts oracle, 145 random 2×2 systems in (x,y) | 136 agree; **all 9 disagreements are oracle artefacts** at multiple/degenerate roots — hand-adjudicated t=10, 38, 70, 130, 167 and QD is right in every one. Separately, sympy's `solve` *missed* a real solution QD found (t=26: the second branch is a real root of `48y⁵+64y⁴−27y+18`, verified at residual 8.9e-16) |
| `git status --short` at finish | empty |

**Calibration:** the exact-arithmetic core is genuinely solid. ℚ/ℚ(i), MPoly, resultant, Bareiss determinant,
Buchberger/`reduceGroebner`, `schurCohn` and `realSolutionCount` survived every differential test I could
build, including two where QD beat sympy. No π / 2πi leakage anywhere in `sym-core` (ADR-0006 respected).
The prior review's one MEDIUM (uncapped `_recombine`) **is fixed** and its cap is real, not vacuous (see
Tests). Everything below is at the *edges*: the `factor` status triage, three unvalidated input boundaries,
and one worker-degradation path.

## Findings

### ALG-1 [CRITICAL] [confirmed] `factor` reports a FALSE certificate — the UI prints "Irreducible over ℚ(i) ✓" for `p = c·fᵏ`, k ≥ 2

- **Where:** `app/sym/sym-core.mjs:2446-2449` (the `out.length <= 1` branch returns `factors: [poly]` and
  `status: 'irreducible'`, reason *"irreducible over ℚ(i) (no nontrivial factorization exists)"*) ←
  `_factorRec` at `:2364` (monomial peel) / `:2370` (`_qiFactor`) / `:2412` (multivariate) has already
  *found* the radical factor and put it in `out`; surfaced by `app/algebra/algebra-store.mjs:2979`
  (`factorOf` is a pass-through) → `app/algebra/algebra-ui.mjs:2407-2412`
  (`lead.textContent = 'Irreducible over ℚ(i) ✓'` + *"this equation has no nontrivial factorization, so
  there is no case split to make here"*).
- **What:** when the radical factorisation has exactly **one** distinct factor, `factor()` discards that
  factor, returns the **input** as the sole element of `factors`, and labels it `irreducible` with a
  certificate string. So `w1² = 0`, `(w1−1)² = 0`, `(2s−1)³ = 0` and `(x+y+z)² = 0` are all certified
  irreducible over ℚ(i). They are not: each is a proper power of a lower-degree factor the engine had in
  hand one line earlier. The condition is exactly `p = c·fᵏ` with `f` ℚ(i)-irreducible and `k ≥ 2` — and a
  **double root is the cusp's own algebraic fingerprint** (`AHARONOV_SHAPIRO.md` §"What the tool shows" item
  2), so this is not an exotic input for this app.
- **Evidence:** 500-case differential vs sympy `factor_list(domain=QQ_I)` found 14 false certificates, all of
  this shape (`scratch/A4/check-fac.py`); then directly, with negative controls
  (`scratch/A4/repro2.mjs`, `node repro2.mjs`):
  ```
  w1^2                       | irreducible   | factors: 1 term, deg 2   | "no nontrivial factorization exists"
  (w1 - 1)^2                 | irreducible   | factors: 3 terms, deg 2  | "no nontrivial factorization exists"
  (2*s - 1)^3                | irreducible   | factors: 4 terms, deg 3  | "no nontrivial factorization exists"
  (x + y + z)^2              | irreducible   | factors: 1 factor        | "no nontrivial factorization exists"
  -- negative controls (all correct) --
  w1^2 - 1                   | reducible     | 2 factors
  w1^2 + 1                   | reducible     | 2 factors   (splits over ℚ(i))
  w1^2 - 2                   | irreducible   | 1 factor    (genuinely irreducible over ℚ(i))
  (s^2 + 1)^2                | reducible     | 2 factors   (≥2 distinct factors → the bug does not fire)
  ```
  The engine *knows*: `x^2*y` → `reducible`, factors `[x, y]`, i.e. the multivariate monomial path de-powers
  correctly; only the single-factor case is thrown away.
- **Why it matters:** honest-labelling guardrail, inverted. A green ✓ and the words *"no nontrivial
  factorization exists"* are a mathematical claim the app is making about the user's equation, and it is
  false. A user reading it will not split the case, and will not look for the cusp.
- **Fix:** in `factor()` at `:2446`, distinguish `out.length === 1 && out[0]` being a **proper** divisor of
  `poly` (degree strictly lower in some variable, or `mpolyExactDiv(poly, out[0])` non-constant) from
  `out[0]` equalling `poly` up to a unit. Only the latter is `irreducible`. The former is a genuine radical
  reduction — `V(p) = V(f)` with `deg f < deg p` — so return `{ ok: true, status: 'reducible', factors: out }`
  (the UI's case-chooser then correctly offers the single case `f = 0`, which is a *strictly better* system),
  or at minimum a new honest status. **Pin it** with the four rows above plus the four negative controls;
  there is currently **no test at all** on `factor`'s status triage (see Tests).
- **Prior:** new.

### ALG-2 [HIGH] [confirmed] `MPoly.fromTermList` validates no exponent — a string or negative exponent in an imported DAG / RCTD cell silently corrupts every later computation

- **Where:** `app/sym/sym-core.mjs:227-238` (`fromTermList` does `mono.set(k, m[k])` verbatim; `t.coeff` is
  checked only by `BigInt(...)` throwing) ← reachable from `app/algebra/algebra-store.mjs:2650`
  (`importDAG` → `S.polyFromTermList(nd.terms || [])`), `:2917` (`importRCTD` → same), the autosave restore
  (`algebra-autosave.mjs:56` `read()` → `importDAG`), and every `SymWorker` result deserialisation
  (`algebra-store.mjs:1543`). `app/algebra/cas-export.mjs:216-227` (`_checkTerms`) validates the coefficient
  shape and that `mono` is an object — **and nothing about the exponents**.
- **What:** exponents are stored as whatever JSON supplied. A **string** exponent makes `monoKey` concatenate
  instead of add, so `x^"2"` squared becomes `x^22`; a **negative** exponent produces a Laurent monomial the
  engine cannot represent, and `degreeIn` then reports **0** for `x^-1` — so a resultant/Gröbner routine
  treats it as a constant in `x` and returns an arbitrary wrong polynomial with no error anywhere. This is
  not a hostile-input hypothetical: `AHARONOV_SHAPIRO.md` §"Maple post-script" instructs the user to
  hand-write a Maple serialiser that emits `{var: exp}`, and a Maple/`sprintf` JSON writer emitting `"2"`
  rather than `2` is an ordinary mistake.
- **Evidence:** `scratch/A4/tl-adv.mjs` and `scratch/A4/rctd-adv.mjs`:
  ```
  negative exponent  x^-1 + 1    OK terms=2  degreeIn(x)=0   latex=1 + x^{-1}   p*p keys=x^-2;x^-1;   GBlen=1
  string exponent    x^"2"       OK terms=1  degreeIn(x)=2   latex=x^{2}        p*p keys=x^22
  fractional         x^0.5       OK terms=1  degreeIn(x)=0.5 latex=x^{0.5}      p*p keys=x^1
  huge               x^1e9       OK                                             GB throws (packed kernel) ✓
  ```
  and end to end through the documented import bridge:
  ```
  parseRCTD ok = true
  constraint poly (M0^"2" - 1): -1 + M0^{2} | squared: 1 - M0^{02} - M0^{2} + M0^{22}
  chain poly (w1^-1 + 1): 1 + w1^{-1} | degreeIn(w1) = 0
  ```
  Negative control: only the *huge* exponent is caught, and only at the packed Gröbner kernel
  (`_ppFromMPoly`'s `_P_EXP_MAX` throw) — never at the boundary.
- **Why it matters:** every "exact" claim downstream is about a different polynomial than the one on screen,
  and the LaTeX renders the corrupt monomial without complaint. This is the one place in the module where a
  wrong number can be produced with no cap, no throw and no `⚠`.
- **Fix:** in `fromTermList`, require `Number.isSafeInteger(e) && e >= 0` (and reject `e > _P_EXP_MAX`) per
  entry, throwing the file's usual located error — `importDAG` already wraps the call in `try` and aborts
  before mutating, so the failure mode becomes a clean *"could not parse node polynomials"*. Mirror the
  check in `cas-export.mjs`'s `_checkTerms` so `parseRCTD` refuses by name (its whole job is validating
  untrusted CAS output). Pin both with the four rows above.
- **Prior:** new.

### ALG-3 [HIGH] [confirmed] `ExprParser` has no exponent cap — a typed `(z1+zb1)^6000` runs 131 s on the main thread, from the per-keystroke live preview

- **Where:** `app/algebra/expr-parser.mjs:139-145` (`base.pow(e)` with `e` bounded only by
  `Number.isInteger(e) && e >= 0`) over `app/sym/sym-core.mjs:287-292` (`MPoly.pow` is a naive
  `for (i<k) out = out.mul(this)` loop — no repeated squaring); called from
  `app/algebra/algebra-ui.mjs:1663` (`previewSubst`) and `:1716` (`previewEquation`), both wired to the
  **`input`** event at `:2140-2145`, plus `doDefineSubst` `:1680` and `doAddEquation` `:1731`.
- **What:** the parser will expand any exponent up to 2⁵³. Nothing between the keystroke and the BigInt
  multiply loop caps degree, term count or wall clock, and the whole thing is synchronous on the main
  thread (the parse is *not* worker-offloaded — only the heavy ops are).
- **Evidence:** `scratch/A4/pow-bench.mjs` / `parse-fuzz.mjs`, `node pow-bench.mjs`:
  ```
  z1^10000                 85 ms   terms=1
  z1^100000                84 ms   terms=1
  z1^1000000             1,669 ms  terms=1        ← a single monomial, all loop overhead
  z1^100000000         115,687 ms  terms=1
  (z1+zb1)^1000          2,472 ms  terms=1001
  (z1+zb1)^3000         28,391 ms  terms=3001
  (z1+zb1)^6000        131,030 ms  terms=6001
  ```
  Negative control: every *malformed* input is rejected instantly and correctly (23 adversarial strings in
  `parse-fuzz.mjs`: `z1^-1`, `z1^2.5`, `z1//2`, `z1/0`, `(z1`, `z1 z1`, `Z1`, 200 unary minuses, deep
  parens — all 0 ms, all with a positioned message). The defect is purely the unbounded *legal* exponent.
- **Why it matters:** an unrecoverable tab freeze (no worker, so no Cancel, no `setBusy` repaint) triggered
  by ordinary typing in a box whose entire purpose is exploratory expression entry. `(z1+zb1)^6000` is 13
  characters.
- **Fix:** cap in `parseFactor` — reject `e > EXPR_MAX_EXP` (a few hundred is generous for a substitution
  abbreviation) with the file's positioned-error idiom, and additionally refuse when the *predicted* result
  size `C(e + nvars − 1, nvars − 1)` exceeds a term budget, so `z1^400` stays legal while `(z1+zb1)^400`
  is refused. Separately give `MPoly.pow` repeated squaring (`O(log k)` multiplies) — a one-liner that makes
  the legal range far wider for free. Pin with a timed test asserting `(z1+zb1)^100000` refuses in < 50 ms.
- **Prior:** new.

### ALG-4 [MEDIUM] [confirmed] `factor` cannot split a multivariate perfect power at all — `(t−a)²(t+a)` returns `undetermined`, although `multivariateSquarefreePart` in the same file solves it

- **Where:** `app/sym/sym-core.mjs:2374-2400` (the bivariate branch gates on
  `bivariateSquarefreeInX(cur, …)` for *both* variable orders and otherwise
  `_cap(caps,'bivariate-squarefree', …)`) and `:2404-2419` (the ≥3-var branch, likewise no squarefree
  reduction); the remedy `multivariateSquarefreePart` is defined at `:1224-1230` and exported at `:6029`.
- **What:** the bivariate/multivariate factorisers require the input to be squarefree in a main variable and
  there is no reduction step, so **any** repeated factor makes the whole polynomial unfactorable. The
  refusal is honest (`undetermined`, naming the reason), but `(t−a)²(t+a)` is about the easiest reducible
  polynomial there is, and elimination produces exactly this shape: `Res_x((x−t)², x−a) = (t−a)²` is a
  double-contact locus the workspace's `resolvent`/`eliminate` ops generate routinely.
- **Evidence:** `scratch/A4/repro-irr.mjs`, `repro3.mjs`, `repro4.mjs`:
  ```
  factor(Res_x((x−t)², x−a)) = factor((t−a)²)   → undetermined: "neither variable is squarefree as the main variable"
  factor((t−a)²(t+a))                          → undetermined: same reason, 0 factors
  but:  multivariateSquarefreePart((t−a)²,   't') = a − t          → factor → irreducible ✓
        multivariateSquarefreePart((t−a)²(t+a),'t') = a² − t²      → factor → reducible, 2 factors ✓
  ```
  (`multivariateSquarefreePart(p)` with the `mainVar` argument omitted silently returns `p` unchanged —
  `:1227` `if (d.isZero()) return f` — worth a throw.)
- **Why it matters:** the case-split action — the app's route out of a reducible system — is unavailable on a
  whole common class, and the same root cause as ALG-1 (a single-radical-factor result is treated as "no
  factorization") means the *univariate* version of this input gets the false ✓ instead of the honest cap.
- **Fix:** insert `cur = multivariatePrimitivePart` → `multivariateSquarefreePart(cur, mainVar)` before the
  bivariate and ≥3-var branches (the main-variable choice is already there: `nvarMainVariable`), then factor
  the reduction. `factor` is documented as RADICAL, so replacing `cur` by its squarefree part is exactly the
  contract. Fix ALG-1 in the same pass so the single-factor result survives.
- **Prior:** new.

### ALG-5 [MEDIUM] [confirmed] a user-defined variable named `i` or `I` silently breaks every CAS export — and Singular's ring declaration collides outright

- **Where:** `app/algebra/algebra-store.mjs:1003` (`_validateDefine` accepts any
  `/^[A-Za-z0-9_]+$/` name — no reserved list) → `app/algebra/cas-export.mjs:40-52` (`DIALECTS`: the
  imaginary unit is the *literal* `I` for maple/sage/mathematica and `i` for singular/msolve; `name` only
  rewrites `_` for mathematica) → `:139-181` (`systemToCAS` declares `ring r = (0,i),(<vars>),dp` /
  `K.<I> = NumberField(...)` / `PolynomialRing([<vars>])`).
- **What:** the coefficient field's generator and a user variable can be the same token, with nothing
  rejecting or renaming either. `expr-parser.mjs:159` deliberately supports a variable named `i` (`if (tk.v
  === 'i' && !varSet.has('i'))`), so the app itself is consistent — the collision is introduced at export.
- **Evidence:** `scratch/A4/cas-collide.mjs` — the system `i² + i·z1 − 1 = 0` (variable `i`, coefficient `i`):
  ```
  maple:        R := PolynomialRing([i, z1]):        sys := [ i^2 + I*z1 - 1 = 0 ]      ← OK for `i`, fatal for a variable named `I`
  singular:     ring r = (0,i),(i, z1),dp;  minpoly = i^2+1;   ideal Id = i^2 + i*z1 - 1;
                                                     ^^^ `i` is BOTH the field generator and a ring variable,
                                                     and the two `i`s in the polynomial mean different things
  sage:         K.<I> = NumberField(x^2 + 1);  R.<i, z1> = PolynomialRing(K, ...)       ← fatal for `I` (shadows the generator)
  mathematica:  {i^2 + I*z1 - 1 == 0}                                                   ← fatal for `I`
  ```
  The msolve dialect is worse by construction: it maps the imaginary unit **to the variable `i`**
  (`cas-export.mjs:52`), so a user variable `i` merges with it and the minimal polynomial `i²+1` is imposed
  on the user's unknown.
- **Why it matters:** the CAS bridge exists precisely because the hard cases must go out to Maple/Singular
  and come back (`AHARONOV_SHAPIRO.md`'s whole round trip). A silently-wrong export is worse than no export:
  the returned RCTD cells land in the workspace as `op:'rctd'` nodes carrying a real-solution count computed
  for the wrong system.
- **Fix:** reject `i`/`I` (and the other per-dialect reserved names — Maple `D`, `Pi`, `gamma`, `O`;
  Mathematica `I`, `E`, `N`, `D`, `C`, `K`, `Pi`) in `_validateDefine`, *or* sanitize at export by giving
  each dialect a `name` that prefixes a colliding identifier (e.g. `i → qdi`) consistently across the
  variable list and the polynomials. Rejecting at define time is smaller and honest; pin it with the
  Singular ring line above.
- **Prior:** new.

### ALG-6 [MEDIUM] [code] a permanently-latched worker fallback is never surfaced — Cancel stays visible and does nothing, and every heavy op freezes the tab

- **Where:** `app/algebra/sym-worker.mjs:76-88` (a LOAD failure sets `_fallback = true` **permanently** —
  "Rebuilding would re-fail identically, so latch to the main thread PERMANENTLY") and `:106`
  (`if (_fallback || !_worker) return _QD.Sym.runJob(op, payload, runOpts.onProgress)` — a *synchronous*
  call inside the async function); `:158` exports `_isFallback()`, which has **zero production callers**
  (`grep -rn _isFallback app/` → only `sym-worker.mjs:158`, `primary-solver-worker.mjs` (a different
  module), and tests); `app/algebra/algebra-op-runner.mjs:79` (`cancel()` aborts the controller and calls
  `cancelWorker()`) and `:51` (`setBusy` reveals `#alg-cancel`).
- **What:** the load-failure path is the realistic one for a PWA — a stale service-worker cache serving an
  old chunk hash is exactly what `algebra-autosave.mjs:3` calls out ("a service-worker update is itself a
  routine reload"). Once latched, `SymWorker.run` executes `Sym.runJob` synchronously; the only `await`
  before it is `ensureReady()`, a microtask, so the browser cannot repaint between `ops.begin()` and the
  computation. The spinner and Cancel never render, `cancel()` has nothing to abort (the abort signal is
  never wired on this path — `:106` returns before the `signal` handling at `:129`), and a multi-second
  Gröbner is an unbreakable freeze. The UI is never told, because `_isFallback()` is never read.
- **Evidence:** the chain above, plus `vitest/sym-worker-crash-char.test.ts:57,94` which *assert* the
  permanent latch as intended behaviour ("a never-loaded worker latches to the main thread permanently"),
  and `app/test/algebra-store.test.js:498` which asserts `_isFallback() === true` in Node — so the fallback
  path is exercised and proven, but no code ever asks about it. **What would close it to `[confirmed]`:**
  serve `dist/`, delete/rename the built `sym-worker-entry-*.js` chunk, and click ★ Auto-reduce & solve on
  the cardioid preset; observe no spinner, an inert Cancel, and a frozen tab.
- **Why it matters:** the one degradation mode where the app's responsiveness contract (offload + Cancel)
  silently stops holding, and the user has no signal at all.
- **Fix:** read `_isFallback()` once in `installAlgebra` after the first op (or expose an
  `onFallback` callback from `sym-worker.mjs`) and (a) toast once — *"the background engine could not load;
  heavy computations will run on the main thread and cannot be cancelled"* — and (b) keep `#alg-cancel`
  hidden while `_isFallback()`. Ideally also honour `runOpts.signal` on the fallback path by threading a
  cancellation check into the existing `opts.onProgress` seam (`sym-core.mjs:3246` documents it as exactly
  that), so Cancel is at least *approximately* real on the main thread.
- **Prior:** new.

### ALG-7 [MEDIUM] [code] the three C-route prove plans stamp `rigor: 'exact'` on "no real solution" from a `1e-4` float test, without consulting the certified count the general route uses

- **Where:** `app/algebra/prove-plan.mjs:898` (moment / Aharonov–Shapiro route), `:1028` (rational-φ),
  `:1144` (triangle) — each `const real = (r.solutions || []).filter((s) => Object.keys(s).every((k) =>
  Math.abs(s[k].im) < 1e-4)); if (!real.length) return { kind: 'no-real', verdict: 'No quadrature domain:
  … has no real solution …', rigor: 'exact', bad: true, … }`. Contrast the **general** certify route,
  `:442-448`, which for the identical situation checks `cl.realCount` and returns
  `'⚠ PARTIAL: N certified real solution(s), but the numeric solver separated none (clustered /
  non-radical)'` with `rigor: 'partial'`.
- **What:** which solutions count as real is decided by a `1e-4` absolute float threshold on a numeric
  imaginary part, and the resulting *negative* existence claim is then labelled `exact`. `cl.realCount` —
  the exact Hermite-trace real count — is already on the same `cl` object the general route reads, and is
  not consulted. The same object's own comment at `:866-871` records that this class of gate was audited
  and fixed for `assembleMomentVerdict`'s `D === 0` case ("the moment route was the lone exception,
  stamping a green `=` on a possibly-wrong 'no QD'") — the `no-real` branch one function up was missed.
- **Why it matters:** honest-labelling guardrail. *"No quadrature domain"* with `=` is the strongest
  negative statement the app makes; a clustered root (the cusp case is a double root by construction,
  and `eps^{1/4} ≈ 1.2e-4` for a quadruple root) makes it wrong while it still reads certified.
- **Evidence:** the code chain above. **What would close it:** construct moment data whose resolvent has a
  root of multiplicity ≥ 4 (or an `M0` for which the certified count is positive and `solveZeroDim`'s
  eigenvalue separation exceeds 1e-4 in `Im`), run `runMomentPlan`, and observe `kind:'no-real'` with
  `rigor:'exact'` beside `cl.realCount > 0`. I could not construct one inside my budget.
- **Fix:** copy the general route's guard verbatim into all three C routes: when `cl.realCount > 0` and the
  numeric filter is empty, return the `⚠ PARTIAL` verdict with `rigor: 'partial'`. Better still, factor the
  `no-real` branch into one shared helper so a fourth route cannot reintroduce it.
- **Prior:** new.

### ALG-8 [MEDIUM] [confirmed] `sym-radical` refuses a perfect power it can solve — `solveByRadicals((x³−x−1)², 'x')` reports Abel–Ruffini

- **Where:** `app/sym/sym-radical.mjs:443-444` (`if (fs && fs.length > 1) return …` after `S.qiFactor`) and
  `:449-452` (`if (r && r.ok && r.factors && r.factors.length > 1)` after `S.factor`) — both require **two**
  factors, so a single lower-degree radical factor is discarded; then `:420+` falls through to the degree
  dispatch and refuses at degree ≥ 5.
- **What:** `_qiFactor((x³−x−1)², 'x')` correctly returns `[x³−x−1]` (it takes `squareFreePart` internally),
  but `_factorSplit` throws that away because the list has length 1. The roots of the square are exactly the
  roots of the cube, which Cardano gives in closed form.
- **Evidence:** `scratch/A4/rad.mjs`:
  ```
  factor(x^3-x-1)     → irreducible
  factor((x^3-x-1)^2) → irreducible        (the radical IS x^3-x-1)
  solveByRadicals(x^3-x-1,      'x') → ok, 3 roots
  solveByRadicals((x^3-x-1)^2,  'x') → REFUSED: "degree 6 in x with no radical reduction
                                        (Abel–Ruffini) — use numeric Solve"
  ```
  Negative control: `(x³−2)²` *is* solved, because its exponents `{6,3,0}` let the independent
  quasi-polynomial path (`:404`) reduce it — so the defect is specific to a perfect power with no common
  exponent divisor.
- **Why it matters:** a closed form the engine can produce is replaced by a refusal that names the wrong
  reason (Abel–Ruffini is a theorem about the *general* quintic, not about this input). Same root cause as
  ALG-1: "one distinct radical factor" is read as "no factorization" at three independent sites.
- **Fix:** in `_factorSplit`, accept a length-1 split when its degree in `varName` is **strictly less** than
  the input's, returning `[thatFactor]`; `_solveRadicals`'s factor branch already handles a one-element
  `split` correctly (it recurses on each and concatenates). Pin with the two rows above.
- **Prior:** new.

### ALG-9 [LOW] [confirmed] the render-path factorability probe still guards on term count only — a 2-term high-degree equation freezes a render for the full recombination deadline

- **Where:** `app/algebra/algebra-ui.mjs:2591` (`FACTOR_AUTO_CAP = 120`) and `:2601`
  (`if (sz > FACTOR_AUTO_CAP) return FACTOR_UNKNOWN` — `sz` is `n.poly.size()`, the **term count**), called
  from the suggested-actions builder at `:2692` and the node badges at `:3536`;
  `app/sym/sym-core.mjs:2215` `RECOMBINE_DEADLINE_MS = 2000`.
- **What:** the prior review's recommendations (1) and (2) landed (`_recombine` now has a real wall-clock
  cap, and it is honest), but recommendation (3) — *"make the render-path `_factorInfo` guard consider
  degree, not just term count"* — did not. `x^40 − 2` has `sz = 2`, sails past the guard, and is factored
  **synchronously on the render path** until the deadline fires.
- **Evidence:** the repo's own test measures the degree-40 case: `vitest/sym-factor-recombine-cap.test.ts`
  — *"x^40 − 2 returns promptly as 'undetermined' (capped)"* — **passes in 3,609 ms** (my run,
  `pnpm exec vitest run vitest/sym-factor-recombine-cap.test.ts`). Directly, and it grows with degree
  (`scratch/A4/deg1.mjs`, all 2-term so all `sz = 2 < 120`):
  ```
  x^20 - 2 :    506 ms  status=irreducible   (recombination succeeded — correctly: x²⁰−2 is ℚ(i)-irreducible)
  x^40 - 2 :  2,727 ms  status=undetermined  (the 2 s deadline + shift-loop overhead)
  x^60 - 2 :  7,499 ms  status=undetermined
  x^80 / x^120                                 > 110 s each (my 300 s batch run was killed at d=80)
  ```
  So the deadline bounds `_recombine`, but not the `s = 0…2·deg+8` shift loop around it in `_qiFactor`
  (`sym-core.mjs:2316`), and the total is well past a frame budget.
- **Why it matters:** a multi-second stall on a *render* rather than on a click; bounded per `(id, size)`
  key and cached, hence LOW — but at degree 80+ the "bounded" claim stops holding.
- **Fix:** add `|| maxDegree(n.poly) > FACTOR_AUTO_DEG` (say 16) to the `:2601` guard, so the explicit
  "Scan for factorizations" (already worker-offloaded via `_factorInfoAsync`) owns that case. Separately,
  put the wall-clock deadline around `_qiFactor`'s shift loop rather than around `_recombine` alone, so the
  bound is on the whole factorisation and not on one inner search.
- **Prior:** re-report of the third recommendation under A3's MEDIUM "Berlekamp–Zassenhaus recombination is
  uncapped exponential" — the cap itself is **fixed and real**; this sub-item is still open.

### ALG-10 [LOW] [code] `prove-plan`'s boundary-univalence helpers still run `realSolutionCount` / `schurCohn` synchronously on the main thread

- **Where:** `app/algebra/prove-plan.mjs:696` (`momentBoundarySimple` → `Sym.realSolutionCount`), `:683`,
  `:713` (`Sym.schurCohn` / the boundary double-point count), reached from the awaited proof-tree walk whose
  other heavy steps are worker-offloaded.
- **Prior:** re-report of A3's LOW *"prove-plan calls `realSolutionCount` / `schurCohn` synchronously on the
  main thread"* — **still open**, unchanged. There is still no `boundarySimple` op in `runJob`
  (`sym-core.mjs:5355`'s 14-op dispatch).

### ALG-11 [LOW] [confirmed] the "exact rational `n/d`" moment token is parsed as a float and round-tripped through a denominator-capped continued fraction

- **Where:** `app/algebra/algebra-moment-parse.mjs:18` (`const p = s.split('/'); … return n / d;` — a JS
  float division) against the module header at `:5` ("with each real part an **exact rational** `n/d` or a
  decimal"); the value then reaches `sym-core.mjs:3861` `_momentToGaussian` → `_ratFromNumber`, whose
  convergents stop at `q2 > 1e6` (`:3840`), or `qd-equations.mjs:78` `_ratApprox` with the same `1e6` cap.
- **What:** nothing between the box and the ideal carries the typed numerator/denominator. Simple rationals
  survive (I verified `M0 = 146/9` and `M1 = 16/3`, typed as the *floats* `146/9` and `16/3` in
  `app/test/cardioid-uniqueness.test.js:105`, rationalise back to exactly `146/9` and `16/3` —
  `scratch/A4/cardioid-probe.mjs` prints the recovered constants), but a denominator past 1e6 does not, and
  the header calls the path exact.
- **Why it matters:** documentation honesty on the one input boundary of an otherwise exact pipeline. LOW
  because `_ratFromNumber`'s own comment is honest and `shapeFromMoments` never labels its nodes/weights `=`.
- **Fix:** parse `n/d` as a `Rational` (both are already integer strings in the common case) and thread it
  through, or amend the header to say "a rational **snapped from** the float, denominator ≤ 1e6".
- **Prior:** new.

## Structural observations

- **One design mistake, three call sites.** "The radical factorisation has exactly one distinct factor" is
  read as "there is no factorisation" at `sym-core.mjs:2446` (ALG-1, which then *also* mislabels it
  `irreducible`), and at `sym-radical.mjs:443` and `:449` (ALG-8). The honest primitive is "did the degree
  drop?", and the module already has the tool (`squareFreePart`, `multivariateSquarefreePart`). What better
  looks like: `factor` returns `{ status, factors, radicalReduced: boolean }`, where `radicalReduced` means
  `∏factors` is a proper divisor of the input; `irreducible` then means what it says.
- **`schurCohn`'s `inside` silently changes units.** `sym-core.mjs:4711-4725`: with a nonsingular
  Hermitian form the counts are **with multiplicity**; on the singular branch they become **distinct root
  locations** (after `squareFreePart`). Both semantics are documented in the header, and the only tell at
  runtime is `resolved: true`, which the header presents as the resolution flag. My 600-case check confirms
  both branches are *correct* under their own semantics, and the app's only consumer — `inside === 0` for
  φ′ ≠ 0 in 𝔻 — is insensitive. But a field named `countsMultiplicity` would cost nothing and would remove
  a trap for the next consumer that compares counts.
- **A large, well-built part of `Sym` has no consumer.** `comprehensiveGroebnerSystem`, `radicalZeroDim`,
  `rationalUnivariateRep`, `verifySOS`, `curveGenus`, `idealIntersect`, `idealQuotient`, `hankelRank`,
  `padeApproximant`, `rationalReconstruct`, `seriesLog`, `seriesExp` each have **zero** callers anywhere in
  `app/` outside `sym-core.mjs` itself (one test file each). Several are dispatchable through
  `runJob` (`:5355`) and so are worker-ready but unreachable from the UI. This is not dead code — it is a
  built capability with no door, and `comprehensiveGroebnerSystem` in particular is the parametric tool the
  docs say is not in-engine (see Improvements 1 and the Documentation table).
- **`_validateDefine` is the only gate on a user-chosen symbol name** (`algebra-store.mjs:1003`) and it
  checks one regex. Everything downstream — four CAS dialects, the SymPy transcript, the LaTeX renderer,
  the `__re`/`__im` reim split, `substConj`'s barred partner naming — assumes the name is inert. ALG-5 is
  the CAS half; a name colliding with the reim suffix convention (`foo__re`) is the other half and is
  equally unguarded.
- **`eliminateWithGauge` picks `shared[0]`** (`algebra-store.mjs:1579`), the first shared variable in a
  `[...keep].sort()` alphabetical list, as the elimination variable for every target equation. Variable
  choice swings elimination cost and extraneous-factor count by orders of magnitude
  (`GROEBNER_INVESTIGATION.md` L5(c) says so about ordering); choosing the lowest-degree shared variable
  would be a two-line improvement with no new machinery.
- **ADR-0008 boundary respected.** `sym-core.mjs` imports only `../solvers/solver.mjs`; the algebra layer
  imports no `@cas/*`; `@cas/exact` appears only as a QD **devDependency** for
  `vitest/exact-symcore-differential.test.ts`. No consolidation action recommended. That differential spec's
  coverage is exactly the field — `Rational`/`Gaussian` construction, the four binary ops, division by zero,
  unary ops, equality, and four field laws over a 15-entry normalisation-stressing corpus (142 assertions
  total across the 8 specs I ran). It does **not** reach `MPoly`, resultants or Gröbner — correctly, since
  `@cas/exact` has no counterpart for those, so there is nothing to differ against. ADR-0008 Action Item 4
  is genuinely closed at the scope it names.
- **ADR-0026/`@cas/ui`:** nothing in this scope reaches for `@cas/ui`; QD's deliberate non-consumption is
  intact.

## Improvement proposals (core functionality)

1. **Expose the parametric case-split that is already built (`comprehensiveGroebnerSystem`) — S/M.**
   `AHARONOV_SHAPIRO.md` §"Scope and the parametric frontier" says the fully parametric statement "is *real
   comprehensive triangular decomposition* … That parametric step is **not** in-engine here", and routes the
   user to Maple. But a **comprehensive Gröbner system** *is* in-engine (`sym-core.mjs:5009`, Suzuki–Sato
   style with segment/depth caps, `runJob`-dispatchable) and it runs on the A&S parametric system in **22 ms**
   (`scratch/A4/cgs.mjs`): 2 segments over `['M0','m1','n1']`, splitting on `m1·n1·(m1²+n1²)`. What is
   genuinely missing is only the **real** layer on top. So: (a) surface CGS as an "Analyse parametrically"
   op producing one column per segment (each carrying its parameter constraints — the same node shape
   `importRCTD` already builds, so the canvas/verdict work is done); (b) on each 1-parameter segment call
   the *already-wired* `parametricRealCount1D` for the real count. That turns "export to Maple and paste
   back" into an in-app answer for the 1-parameter slices the parameter-slice feature already sweeps.
   **Caveat, measured:** the A&S run returns `defective: true` and duplicates a generator across segments
   (`_cgsRec` at `:4999` emits a defective stratum honestly rather than looping), and the split is not the
   natural one (the genuine stratification is the resolvent cubic's discriminant). So step 0 is to make CGS
   non-defective on this input — which is the real work. **Prereq:** none. **Risk:** medium (CGS
   correctness on defective strata is the one part I did not line-audit).
2. **A radical/squarefree normalisation pass on every derived node — S.** Grounded in ALG-1/ALG-4/ALG-8:
   the engine has `squareFreePart` (univariate) and `multivariateSquarefreePart` (any main variable) and
   uses neither at the `factor` entry or on the nodes the elimination ops create. A derived node that is
   `c·fᵏ` carries `k`× the degree it needs into every later Gröbner/resultant/Hermite step, and
   `quotientDimension` / `realSolutionCount` on a non-radical ideal counts with multiplicity where the user
   wants domains. `radicalZeroDim` (`:1783`) exists and has **no caller**. Offering "replace this equation
   by its radical (same variety)" as an explicit, audit-trailed reduction is small, exact, and makes every
   downstream cap reach further. **Prereq:** ALG-1's fix. **Risk:** low (the variety is provably unchanged).
3. **Give `MPoly.pow` repeated squaring and a size predictor — S.** `:287` is `for (i<k) out = out.mul(this)`.
   Beyond fixing ALG-3, this is on the hot path of every `resultant` (`a[0].pow(n)` / `b[0].pow(m)` at
   `:597-598`), `_factorOverQ`'s monic transform (`_bpow` is already fast, but the MPoly side is not), and
   `pointFunctionalSystem`'s `φ^p`. **Prereq:** none. **Risk:** very low (a pure-function change with an
   exact differential test: `p.pow(k)` old vs new over random `p`, `k ≤ 40`).
4. **Certify that a numerically-found QD is exactly algebraic — M.** The pieces are all present and only
   the last link is missing: `solveInverseQD` gives a numeric φ; `_ratApprox` / `verifySolutionExact`
   already do the rational snap (`prove-plan.mjs` PF-1); `padeApproximant`/`rationalReconstruct`
   (`sym-core.mjs:5972`, **no callers**) reconstruct a rational function from a truncated series *exactly*;
   `Sym.inIdeal` decides membership. So "is this numerically-traced boundary an exact algebraic curve?"
   becomes: reconstruct the Schwarz function's Laurent jet → `rationalReconstruct` → clear denominators →
   `inIdeal` against the generated system → report `=` or a residual bound. `docs/ALGEBRA_MODULE.md:138`
   already advertises "turning a numerically-traced boundary into an exact curve (honest `=`)"; the
   reconstruction half is unwired. **Prereq:** proposal 2 (a non-radical reconstruction defeats
   `inIdeal`). **Risk:** medium (the jet order needed is data-dependent; `padeApproximant` returns
   `{ok:false, reason}` honestly, so a failure is a refusal not a wrong answer).
5. **Make elimination-variable choice cost-aware — S.** `eliminateWithGauge` takes `shared[0]`
   alphabetically (`algebra-store.mjs:1579`), and `_eliminate` falls back to a Sylvester resultant whose
   matrix cap is 10 (`sym-core.mjs:583`). Choosing the shared variable of **lowest degree** (and preferring
   one where a generator is degree-1 so `linearReduce` substitutes instead — `GROEBNER_INVESTIGATION.md`'s
   L2, whose premise has since changed, see Documentation) would let the gauge batch succeed on systems
   that currently hit the cap. **Prereq:** none. **Risk:** low; the audit trail records the variable, so
   the change is visible.
6. **An exponent/size budget on the parse path, shared with the store — S.** ALG-3's fix, generalised:
   one `estimateSize(poly, op)` predicate the parser, `defineSubstitution` and `addEquation` all consult, so
   the app refuses *before* allocating rather than after freezing. `algebra-ui.mjs` already has
   `previewCost` in the store's API (`:3106`) — the seam exists.

## Documentation drift

| doc file:line | claims | reality (file:line) | severity |
|---|---|---|---|
| `apps/quadrature-domains/AHARONOV_SHAPIRO.md:120-127` | the fully parametric statement "is *real comprehensive triangular decomposition* … That parametric step is **not** in-engine here" | the **complex** parametric case-split *is* in-engine and works on this very system in 22 ms: `comprehensiveGroebnerSystem` (`app/sym/sym-core.mjs:5009`), `runJob`-dispatchable (`:5355`). Only the *real/semialgebraic* layer is external. Measured: `scratch/A4/cgs.mjs` → ok, 2 segments, `defective:true` | MEDIUM |
| `GROEBNER_INVESTIGATION.md:59-61` (L2) | "`eliminateWithGauge` currently uses a *resultant* even though the gauge is linear … `algebra-store.js:248`" | `_eliminate` now **prefers the exact elimination ideal** (`S.eliminationIdeal`) and uses the resultant only as a fallback (`app/algebra/algebra-store.mjs:1513-1524`); the function is at `:1565`, in a `.mjs`, not at `.js:248`. L2's premise and its line reference are both stale | MEDIUM |
| `GROEBNER_INVESTIGATION.md:28-31` | "L2–L6 … remain open" | L5(a)-adjacent routing and L6's `saturate` are wired (`Sym.saturate` has store callers + `vitest/algebra-saturate-offload.test.ts`); L2 is superseded rather than open. The STATUS block was not revisited after the elimination-ideal change | LOW |
| `apps/quadrature-domains/app/algebra/algebra-store.mjs:33` (module header) | "eliminate / eliminateWithGauge (**Sylvester resultant**)" | same as above — the ideal path is preferred, `:1513` | LOW |
| `docs/ALGEBRA_MODULE.md:14` | "everything in the Algebra module is computed in exact arithmetic over ℚ(i) … so its results are *proofs*, not estimates" | qualified correctly 50 lines later (`:64`, `:120`, `:178`, `:198`) but the opening sentence is unconditional, and `solveZeroDim`'s solutions, `shapeFromMoments`' nodes/weights and the whole `≈` rigor tier are not proofs | LOW |
| `apps/quadrature-domains/app/algebra/algebra-moment-parse.mjs:5` | "with each real part an **exact rational** `n/d` or a decimal" | `_parseMomentNum` (`:18`) returns `Number(p[0]) / Number(p[1])`, a float; exactness is recovered only by a denominator-capped continued fraction downstream (ALG-11) | LOW |
| `apps/quadrature-domains/app/sym/sym-core.mjs:1222-1223` | `multivariateSquarefreePart` "Returns f unchanged if already squarefree in mainVar **or free of it**" | also returns `f` unchanged when `mainVar` is **omitted/undefined** (`:1227`), which is a silent no-op rather than a refusal — confirmed, `scratch/A4/repro4.mjs` | NIT |
| `apps/quadrature-domains/AHARONOV_SHAPIRO.md:44` | "M₀ = area(Ω) > 0 (= area)" | under the module's own `π → 1` normalisation (thesis `dA = dx dy/π`, faithful extraction line 502) M₀ is area/π; internally consistent given the stated normalisation but the bare "= area" invites the factor-of-π confusion ADR-0006 exists to prevent | NIT |

**Verified correct (no drift):** the whole A&S mathematics. `M₀ = w₁² + 2|w₂|²`, `M₁ = w₁²w̄₂`, the resolvent
`s³ − M₀s² + 2|M₁|²`, the cardioid `2s³−3s²+1 = (s−1)²(2s+1)`, the two-root data `M₀ = 146/9, M₁ = 16/3 →
s ∈ {2, 16, −16/9}`, `w₁ = 4, w₂ = ⅓` univalent and `w₁ = √2, |w₂| = 8/3` not, and the A&S-normalised
`φ = (√3/6)(2z+z²)` sitting exactly on the double root `s = 1/3` — all re-derived by hand against the
thesis's `dA = dx dy/π` and `∫_𝔻 z^a z̄^b dA = δ_{ab}/(a+1)`. The prior review's LOW on
`sym-worker.mjs`'s 3-op doc list **is fixed** (`:15-18` now names all 14).

## Tests

**Vacuous / missing, with the surviving mutant:**

- **`factor`'s status triage has no test at all.** `vitest/sym-core-cas-corpus.test.ts:91,120` checks
  `factorBivariate` and `factorMultivariate` *directly* against sympy, and
  `vitest/sym-factor-recombine-cap.test.ts` checks three specific statuses — but nothing checks the
  top-level `factor()`'s `status` on a **perfect power**, which is the exact hole ALG-1 lives in. Surviving
  mutant, in effect already present in the tree: `factor()` returns `factors: [poly]` (the input) instead of
  `out` on the single-factor path and calls it `irreducible`; the whole suite is green
  (1,389 node-test lines, 142 vitest assertions, 0 failures). The test that kills it is four lines:
  `expect(S.factor(V('x').sub(I(1)).pow(2)).status).not.toBe('irreducible')`.
- **`unitCircleRootCount` / `realSolutionCount` (multivariate) have no external oracle.**
  `sym-core-cas-corpus.test.ts:63` pins `realRootCount` (univariate, distinct real roots) against sympy;
  the **multivariate** Hermite-trace `realSolutionCount` — on which every uniqueness verdict, every
  `boundaryDoublePointCount` and the cardioid test's cusp count rest — is pinned only by app-level cases
  with known answers. My independent Newton oracle agrees on 145/145 after adjudication, so this is a
  coverage gap rather than a defect; a 30-case `cas-corpus` extension (systems whose real count sympy can
  settle) would close it cheaply.
- **`MPoly.fromTermList` has no adversarial test.** `importDAG`'s fail-closed handling of a bad `track`/
  `column` *is* tested (`algebra-store.mjs:2670-2675`'s comment names the ghost-node bug), but no test feeds
  it a bad **exponent** — ALG-2's whole surface. Surviving mutant: none needed; the current code already
  accepts `{"x": "2"}` and `{"x": -1}`.
- **`ExprParser` has 23 adversarial inputs' worth of good coverage on *malformed* input** (`app/test/
  expr-parser.test.js`) and none on *large legal* input — ALG-3.
- **`_isFallback()` is asserted by three test files and read by no production code** (ALG-6): the tests
  prove the latch works, which is precisely why nobody noticed the UI never learns about it.

**Passing for the right reason (checked, not assumed):**

- `app/test/cardioid-uniqueness.test.js:57` — *"symbolic resolvent … is entailed by the system
  (normalForm = 0)"* is **not** vacuous. The GB has 7 generators and does **not** contain 1, and four
  nearby wrong resolvents all fail to reduce (`scratch/A4/cardioid-probe.mjs`): coefficient 3 instead of 2,
  the sign of `M₀` flipped, `w₁⁴` instead of `w₁⁶`, and `n₁²` dropped — each `normalForm ≠ 0`. The test
  pins the **proof step**, not the conclusion.
- `vitest/sym-factor-recombine-cap.test.ts` — the cap is real, not a count threshold: its fourth case
  (`∏ₖ(x²+k)`, k = 1…8, whose norm splits into r = 24 modular factors) factors cleanly into 10 factors in
  well under the budget, so the deadline does not over-reject. Confirmed by running it (3.9 s total).
- `vitest/exact-symcore-differential.test.ts` compares canonical `(n, d)` BigInt pairs, never `toNumber()`,
  and includes a `covers a non-trivial number of pairs` guard on its own loops (`:124`).
