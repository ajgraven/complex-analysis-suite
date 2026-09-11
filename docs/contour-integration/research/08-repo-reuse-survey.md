# 08 — Repo reuse survey: what `apps/contour-integration` can actually stand on

> # ⚠ Written against a stale checkout — read with this in mind
>
> This document surveyed the repository at commit `b1e3004` (2026-07-30), which the authoring session
> mistook for current. `origin/master` was **581 commits ahead** at the time: **twelve apps and
> thirteen packages**, not the four and five surveyed here. Everything below about the files it did
> read is accurate; everything it says about what the suite *contains*, and about what has or has not
> been extracted, is not.
>
> Known corrections:
>
> - **`@cas/ui` exists.** It was extracted ahead of adoption as the shared browser shell (ADR-0032).
>   This document's "planned but never built" is wrong, and so is the reasoning that treated the
>   contour app as its third consumer.
> - **Seven more packages exist** — `@cas/schwarz`, `@cas/dynamics`, `@cas/export`, `@cas/conformal`,
>   `@cas/faber`, `@cas/flow`, `@cas/ui` — and eight more apps.
> - **`apps/argument-principle` already has a contour, a winding number and contour-integral
>   quadrature.** A survey that had seen it would have started from there.
> - **`dependency-cruiser` is wired** (`pnpm dep:check`), not "a planned follow-on".
> - The `Frac.toNumber` defect this session found had **already been fixed on master**, better.
> - `@cas/expr` **already parses `2i`** (as an `imag` token, with `2i^2 = (2i)²`).
>
> The API-level findings it reports — `makeDurandKerner` is an iteration not a root-finder,
> `@cas/core/series` exports only `mul`, the publish mechanism is a `cp -r` list — were re-checked
> against real master and still hold.


> Research track 08 for `apps/contour-integration`. An exhaustive, verified inventory of the five
> shared `@cas/*` packages and the three existing apps, aimed at one question: **for each capability
> the contour tool needs, do we reuse, extend, or build?** Every path and symbol below was read from
> the working tree at `b1e3004`; nothing is quoted from memory. Where a claim rests on running code
> rather than reading it, it is marked *(probed)*.
>
> The north-star property (`CLAUDE.md`) is that each new tool builds fewer primitives from scratch
> than the last. The honest headline: **the numeric/algebraic substrate is in excellent shape and
> largely reusable; the UI substrate does not exist.** Section 8 is the verdict table.

---

## 0. The shape of the answer

Five packages ship: `@cas/core`, `@cas/exact`, `@cas/expr`, `@cas/gpu`, `@cas/interchange`. The
three planned *domain* packages — `@cas/ui`, `@cas/quadrature`, `@cas/dynamics` — were **never
built** (`docs/ARCHITECTURE.md` §3 says so explicitly, in a blockquote added after the fact). The
shipped layering is `core → { gpu, expr, interchange } → apps`, with `@cas/gpu` depending on
`@cas/expr` and `@cas/exact` standing alone.

So the contour tool inherits: an expression compiler with two backends, complex arithmetic in two
representations, exact ℚ(i) polynomials, WebGL2 plumbing and a complex GLSL stdlib, and a
versioned share-link codec. It inherits **no** UI kit, **no** honest-labelling machinery, **no**
numeric quadrature, **no** residue/Laurent-at-a-pole engine, and **no** path-editing code.

---

## 1. `@cas/expr` — the expression compiler

`packages/expr/package.json` exports **source TypeScript**, not a `dist/` (`"." : "./src/index.ts"`
plus per-pass subpaths `./ast ./lexer ./parser ./evaluate ./glsl ./derivative ./rational ./latex
./complexJs ./complex`). There is no `build` script; Vite/Vitest transpile it. Complex-Dynamics
always imports the subpaths, never the barrel — copy that.

### AST (`packages/expr/src/ast.ts`, 148 lines)

```ts
export type Node =
  | { kind: "num"; value: number }        | { kind: "const"; name: "i"|"e"|"pi" }
  | { kind: "var"; name: string }         | { kind: "bool"; value: boolean }
  | { kind: "neg"; operand: Node }        | { kind: "not"; operand: Node }
  | { kind: "arith"; op: "+"|"-"|"*"|"/"|"^"; left: Node; right: Node }
  | { kind: "compare"; op: ">"|"<"|"=="; left: Node; right: Node }
  | { kind: "call"; name: string; args: Node[] }
  | { kind: "if"; cond: Node; then: Node; otherwise: Node }
  | { kind: "assign"; name: string; value: Node }
  | { kind: "seq"; stmts: Node[] };
```

Also exported: `COMPLEX_FUNCTIONS` (a `Set` of 19 unary names), `BINARY_FUNCTIONS`
(`arctan2`, `mod`), `class ExprError extends Error { readonly pos }`, and the three analyses
`isFreeParameter`, `referencesVar`, `nodeIsBool`.

**The function set is exactly:** `re, im, conjugate, abs, arg, sqrt, exp, log, sin, cos, tan,
arcsin, arccos, arctan, lambertw, round, floor, ceil` + `arctan2, mod` + the special forms
`if(c,a,b)`, `not(x)`, `f(z,c)`.

### Lexer / parser (`lexer.ts` 123, `parser.ts` 225)

Recursive descent; precedence `cmp < +- < */ < unary- < ^` (right-assoc). Programs are
`;`-separated statements, last value wins; a statement must be followed by `;` or EOF, so two
adjacent expressions are a hard error rather than a silent sequence. `MAX_DEPTH = 256` guards every
self-recursive descent (`nested()` wraps `parseExpr`, `parseUnary` and `parsePower` — the fix for
`expr-parser-01`). The lexer is careful about `1e-3` vs the constant `e`.

### Two evaluation backends (`evaluate.ts` 430, `complexJs.ts` 152)

`complexJs.ts` is `[re, im]`-tuple float64 complex arithmetic: `add sub mul div neg conj re im abs
arg exp log sqrt pow intPow sin cos tan arcsin arccos arctan arctan2 round floor ceil mod lambertw`
+ `E`, `PI`. Branch choices are principal (`atan2 ∈ (-π, π]`) and mirror the GLSL port.

`evaluate.ts` ships three tiers: `evaluate(ast, z, c, fAst?, a?)` (the AST-walking reference);
`makeComplexFn(ast, a) : (z,c) => Complex` and `makeEscapeFn(escapeAst, fAst, a)` (closure-tree
compilers, bit-identical to the interpreter, no per-call `Map` allocation); and
`getComplexFn` / `getEscapeFn`, memoised on AST identity + the live `a` via a `WeakMap`
(`A_KEY_LIMIT = 16`).

### `derivative.ts` (200)

`differentiate(node, v = "z")` and `newtonIteration(fAst) → { iter, escape }`. It returns a **new
AST built from existing node kinds**, so derivatives compile through both backends for free. Local
identity folds (`0+x`, `1*x`, …) keep the output compact. `constExp()` folds a variable-free real
exponent so `z^(-2)` and `z^(4/2)` take the power rule instead of the general
`u^w(w'·log u + w·u'/u)` form — which would be `NaN` at a pole.

**Throws** (`ExprError`) on: `assign`, `seq`, `f(...)`, any binary function, and the
non-holomorphic unaries `re im conjugate abs arg round floor ceil`. `if` differentiates both
branches and keeps the condition unchanged.

### `latex.ts` (116), `glsl.ts` (264), `rational.ts` (188)

`toLatex(node)` is precedence-aware (`P_COMPARE=1 … P_ATOM=10`) with a `UNARY_TEX` table
(`\sqrt{}`, `\overline{}`, `\left|·\right|`, `\ln`, `W(·)`, `\lfloor\rfloor`, …) and an
`\operatorname{}` fallback.

`glsl.ts` emits GLSL ES 3.00 in terms of abstract ops (`cadd cmul cpow cexp clog …`) plus the
`cvec` / `vec_(re,im)` / `cre1` aliases, so **one emission serves both the single and df64 builds**.
`compileF(ast, name="fFn")`, `compileEscape(ast)`, `glslFloat(n)`. Integer exponents `|n| ≤ 8` with
a short base inline as repeated multiply; larger ones route to `cintpow`.

`fToRational(ast, c, a)` evaluates the AST over ℂ(z), returning `{ num: Complex[], den: Complex[] }`
(ascending) or `null`. It is **exactly the rational-function recogniser a residue engine wants** —
`z ↦ z/1`, constants and z-independent subtrees evaluated numerically, `+ − × ÷` as rational
arithmetic, `^` only for a constant integer exponent. It is *not* reduced to lowest terms and has a
`MAX_POLY_LEN = 1_000_001` memory bound.

### What is MISSING — the honest gap list

Probed by running the real parser/evaluator/differentiator:

| Need | Status |
|---|---|
| Complex literals `2i`, `3+4i` | **Absent.** `"2i"` → `ExprError: Expected ';' or end of input`. Must write `2*i`. *(probed)* |
| Implicit multiplication `2z`, `2(z+1)` | **Absent** — same error. *(probed)* |
| `log` | Present, **principal branch only**; `log(0)` returns `[-Infinity, 0]`. *(probed)* |
| `z^α`, α non-integer | Works via `exp(w log z)`, principal branch: `z^0.5`, `z^(1/3)` evaluate and differentiate correctly. *(probed)* |
| Branch-aware / multi-sheet functions | **Absent.** `ARCHITECTURE.md` §5 names multivalued maps as a *future* extension. Nothing tracks a sheet index. |
| `sinh cosh tanh`, `sec csc cot`, `Γ`, `ζ`, `erf`, `Ei`, `Si`, `Li` | **All absent.** `"sinh(z)"` → `Unknown function 'sinh'`. *(probed)* |
| Laurent / Taylor series expansion of an AST | **Absent** in `@cas/expr` (see §2 and §3 for what exists elsewhere). |
| Pole detection / order / residue | **Absent.** `1/z` at 0 returns `[null, null]` (`Infinity` JSON-serialised) — no signal. *(probed)* |
| Simplification (`z/z → 1`, collect like terms) | **Absent.** Only the derivative pass's local folds and `constReal`/`constExp` constant folding. |
| Symbolic integration | Absent, and out of scope for this package. |
| Free variables beyond `z`, `c`, `a` | Parser accepts any identifier as a `var`, but `evaluate`'s scope seeds only `z`, `c`, `a`; any other name throws `Unknown variable` at eval time. Adding `t` (the path parameter) is a scope change, not a grammar change. |
| Equality/ordering | `==` compares the whole complex value; `<`/`>` compare real parts only. |

**Extension shape.** Adding `sinh`/`Γ`/etc. means touching five coordinated tables —
`COMPLEX_FUNCTIONS` (ast), `UNARY`/`BINARY` (evaluate), `UNARY_GLSL` (glsl), `UNARY_TEX` (latex),
`chainOuter` (derivative) — plus a GLSL implementation in `@cas/gpu`'s stdlib. The dual-backend
harness then covers it. This is **additive and low blast-radius** (CD and correspondences can't
regress on a function they never use), but it *is* a shared-package change and needs the
`packages/expr/test` + `packages/gpu` browser gate green.

---

## 2. `@cas/core` — the numeric kernel

Dist-built (`tsc -p tsconfig.build.json` → `dist/`), strict TS, 712 source lines.

- **`complex.ts` (336)** — the `{re, im}` **object** representation (QD's native form), exported as
  `Complex` (a namespace object of pure functions) and `type Cx`. Highlights: `divScaled()` (Smith's
  1962 algorithm, used as the overflow/underflow tail of `div`/`inv`), in-place `mulInto/addInto/
  subInto/scaleInto/addMulInto` (documented alias-safe), `pow(a, n)` integer binary exponentiation,
  `cpow(a, p)` real non-integer principal power, `parse(str)` (accepts `"1+2i"`, `"-i"`,
  `"1.5e-3+2.1e2i"`, an anchored real-token regex rejecting `"2i3"`), `toString(a, digits)` and
  `format(a, {digits, tol})` (snap-to-integer, short forms `i`/`-i`/`1+i`).
- **`algebra.ts` (91)** — the keystone: `interface ComplexAlgebra<C>` (`make re im add sub neg mul
  div scale abs abs2 isFinite`) with two instances, `objAlgebra` (`Cx`) and `tupleAlgebra`
  (`ComplexTuple = [re, im]`). Generic algorithms are written once against the interface; each app
  keeps its native type.
- **`durand-kerner.ts` (142)** — `makeDurandKerner(alg)` returns
  `durandKerner(evalMonic, initialGuesses, opts) → DurandKernerResult<C> | null`.
  `DurandKernerOptions = { tol = 1e-12, maxIter = 200, mode: "jacobi"|"seidel", onCoincident:
  "skip"|"nudge", nudgeEps = 1e-7, bailOnNonFinite }`. Result is `{ roots, converged, iterations }`.
  **Accuracy caveats that matter for pole-finding:** the caller supplies the initial guesses, owns
  monic normalisation, owns any Newton polish, and owns the degree-1/2 closed forms. There is **no
  deflation** and **no multiplicity detection** — a double root drives the product-of-differences to
  ~0 and hits `COINCIDENT_EPS2 = 1e-300`, at which point `"skip"` leaves the estimate unrefined and
  *blocks* a `converged: true` report (a deliberate honesty guard), while `"nudge"` perturbs it.
  Non-finite deltas are caught by `!(dm <= maxDelta)` so `NaN` cannot be reported as converged.
- **`series.ts` (67)** — `makeSeries(alg)` returns **only** `{ zeros, unit, mul }`. Truncated
  multiply, zero-skipping. The header is explicit that `pow`/`inverse`/`compose`/`reversion`
  deliberately stayed app-side because the two apps implement them with different algorithms, and
  that "a complete generic series package is Phase-6 work driven by a third consumer". **The contour
  tool is that third consumer.**
- **`sphere.ts` (54)** — `planeToSphere(re, im)`, `sphereToPlane(x, y, z, eps = 1e-9)`
  (cancellation-safe for `z > 0`). Relevant only if we draw a Riemann-sphere view.

Consumers today: CD (`makeDurandKerner`, `tupleAlgebra`, `makeSeries`, `planeToSphere`),
correspondences (`makeDurandKerner`, `tupleAlgebra`), QD (`Complex`, `objAlgebra`, `makeSeries`,
`makeDurandKerner`, both sphere functions).

---

## 3. `@cas/exact` — and the `sym-core` question

`packages/exact/src`, 854 lines, strict TS, dist-built, dependency-free BigInt.

- **`gaussian.ts` (206)** — `bigGcd`, `class Frac` (ℚ over BigInt: `of add sub mul div neg isZero
  equals toNumber`, `ZERO`/`ONE`) and `class Gauss` (ℚ(i): `int rat add sub mul neg conj norm2 inv
  div isZero equals toTuple`, `ZERO`/`ONE`/`I`). A field, so division is exact.
- **`qiPoly.ts` (205)** — `class QiPoly`, exact univariate over ℚ(i) with an **abstract** variable:
  `fromCoeffs zero constant int variable monomial degree isZero coeff leadingCoeff equals add sub
  neg scale mul pow divideByVar divmod divExact eval derivative monic gcd squarefreePart`.
- **`biPoly.ts` (156)** — `class BiPoly`, a polynomial in an outer variable over `QiPoly`
  coefficients, with `divmodMonic` / `divExactMonic` (**monic division only**).
- **`resultant.ts` (174)** — `integerPrimitive`, `primitivePoly`, `bareissDet`, `resultant`,
  `discriminant` (fraction-free Bareiss over ℚ(i)[inner]).
- **`render.ts` (92)** — `renderGaussMag`, `renderQiPolyText(p, varSym)`, `renderBiPolyText`.

**What exists for a residue engine:** exact gcd → squarefree part → `derivative` → `divmod`. That is
enough to do an **exact partial-fraction decomposition over ℚ(i) once the poles are known**, and
enough to compute a residue at a *rational* pole. **What does not exist:** factorisation, root
isolation, any certified complex-root localisation, and multivariate anything.

### What QD's `sym-core.mjs` has that `@cas/exact` does not

`apps/quadrature-domains/app/sym-core.mjs` is **6,017 lines** and publishes one object, `QD.Sym`,
with ~120 members. Grouped:

- Field + representation: `Rational`, `Gaussian`, `MPoly` (multivariate), `RatFn`, `FRatFn`.
- Ideal theory: `buchberger`, `buchbergerSig`, `reduceGroebner`, `saturate`, `normalForm`,
  `eliminationIdeal`, `idealIntersect`, `idealQuotient`, `minimalPrimes`, `triangularDecomposition`,
  `radicalZeroDim`, `curveGenus`, `comprehensiveGroebnerSystem`.
- Zero-dimensional solving: `fglm`, `isZeroDimensional`, `standardMonomials`, `quotientDimension`,
  `krullDimension`, `solveZeroDim`, `solveByEigenvalues`, `multiplicationMatrix`, `charPolyByTraces`.
- **Real roots / certification:** `realRootIsolate` (Sturm + exact bisection, returns
  `{lo, hi, exact, approx}` per root with exact rational roots reported as `lo === hi`),
  `realRootCount`, `sturmHabicht`, `realRootCountSturm`, `schurCohn` / `schurCohnInterval` /
  `schurCohnAtBox` (unit-disc root counting), `unitCircleRootCount`, `rationalUnivariateRep`,
  `solveRealCertified`.
- **Factorisation:** `factor`, `factorOverQ`, `qiFactor`, `factorBivariate`, `henselFactorBivariate`,
  `factorMultivariate`, `isAbsolutelyIrreducible`, `bivariateAbsFactorCount` — with a three-valued
  honest status `'reducible' | 'irreducible' | 'undetermined'` plus a `caps[]` list saying *which*
  cap stopped the search.
- **Exact series calculus:** `seriesZero seriesConst seriesAdd seriesScale seriesMul seriesPow
  seriesCompose seriesInverse seriesReversion seriesRecip seriesDeriv seriesIntegral seriesLog
  seriesExp`, plus `padeApproximant(a, m, n)` and `rationalReconstruct(a)`.
- Moments: `powerSums`, `coordinateMoments`, `hankelRank`, `pronyPolynomial`, `shapeFromMoments`.

**Which of these a residue engine would actually want:** `qiFactor` / `factorOverQ` (factor the
denominator → poles and their multiplicities, exactly), `squareFreePart` + `univariateGCD` (already
in `@cas/exact`), `realRootIsolate` (real poles on ℝ for real-integral problems), the **series
calculus over ℚ(i)** (`seriesRecip`, `seriesMul`, `seriesDeriv`, `seriesLog`, `seriesExp`,
`seriesCompose`) — which is exactly a Laurent-coefficient machine — and `schurCohn`/
`unitCircleRootCount` (count poles inside |z| < 1, i.e. inside the unit contour, **exactly**).

**Does that constitute the "second consumer" that justifies extraction?** Honestly: *partly, and
not yet*. ADR-0008's revisit triggers are (a) a second consumer needing the multivariate/Gröbner
layer, (b) the two ℚ(i) implementations disagreeing, (c) `@cas/exact` growing a multivariate
representation. A residue engine needs **none of the multivariate/Gröbner machinery** — it wants
univariate factorisation, univariate series, and unit-circle/half-plane root counting. Those are
`@cas/exact`-shaped, not `sym-core`-shaped. The right move is therefore *not* to extract `sym-core`,
but to **grow `@cas/exact` with a univariate ℚ(i) factorisation + exact Laurent-series layer**,
ported in spirit (not by copy-paste) from `sym-core`'s `_qiFactor` / `series*` / `schurCohn`, with
its own golden corpus. That is squarely within ADR-0008's "@cas/exact grows" path and keeps the
risk-concentration argument intact. If we do that, add a differential test against `sym-core` in the
same style as `apps/quadrature-domains/vitest/exact-symcore-differential.test.ts` (43 assertions
comparing canonical `(n, d)` BigInt tuples, never `toNumber()`).

**One under-appreciated asset:** `apps/quadrature-domains/app/parse-h.mjs` (613 lines) already
implements `QD.parseH(expr, math, opts) → { poles: [{a, order, residues[]}], polyCoeffs }` — a
numeric partial-fraction extractor for rational `h(w)`, with a strict per-summand exact pass and a
general fallback (cross-multiply → long-divide → Durand–Kerner on the denominator → cluster roots →
recover each principal part by shift-and-series-divide). It is the closest thing in the repo to a
residue engine. It is app-local, `{re,im}`-based, and depends on `QD.Poly` (`app/poly-helpers.mjs`)
and mathjs — **not importable**, but the algorithm is directly liftable.

---

## 4. `@cas/gpu` — the WebGL2 substrate

Source-exported like `@cas/expr` (`. ./df64 ./glsl ./shader ./colormap ./dual-backend`); depends on
`@cas/expr`.

- **`shader.ts` (69)** — `compileShader(gl, type, src)`, `linkProgram(gl, vertex, fragment)`,
  `createProgram(gl, vsSource, fsSource)`. That is the whole compile API — there is no
  `compileProgram`, no uniform abstraction, no VAO helper. Each app hand-rolls its own uniform
  capture (CD: a private `getUniforms(program)` record; correspondences: a local
  `const u = (n) => gl.getUniformLocation(program, n)`).
- **`glsl/` (5 files)** — `COMPLEX_SINGLE_GLSL` (`#define cvec vec2`, `vec_`, `C_E`, `C_PI`,
  `C_SQRT2`, `C_SQRTE`, then `cre1 cabsf cadd csub cmul cdiv cneg cconj cre cim cabs carg csqrt cexp
  clog csin ccos cmod carctan2 cround cfloor cceil`), `COMPLEX_DF64_GLSL` (the **same 22 names** over
  `vec4` hi/lo pairs), `COMPLEX_DERIVED_GLSL` (`ctan cpow cintpow carcsin carccos carctan clambertw`
  + the two Lambert seeds — precision-agnostic, written against the base names), and `DF64_GLSL`
  (`quickTwoSum twoSum splitf twoProd df_add df_sub df_neg df_mul df_div df_sqrt df_exp df_log
  df_atan2`). `df64Ref.ts` is the JS mirror: `type DF`, `df toNumber dfNeg dfAdd dfSub dfMul dfDiv
  dfSqrt dfExp dfLog dfSinCos dfAtan2`.
- **`colormap.ts` (137)** — `type RGB`, `type ColorStop`, `sampleStops(stops, t)`,
  `buildGradientLUT(stops, width=256)` (positioned stops; CD's convention),
  `buildColormapLUT(colors, width=256)` (even-spaced; QD's convention),
  `makeColormapTexture(gl, colors, width)` → a `width×1` RGBA8 texture, `null` on allocation
  failure. Palette **data** is deliberately not shared.
- **`dualBackend.ts` (248)** — the GLSL≈JS agreement harness, split by capability so most of it is
  node-testable: `buildProbeGLSL(source)` and `buildEscapeProbeGLSL(source)` (pure string assembly),
  `jsReference(source, samples)` / `jsEscapeReference(...)` (pure), `runGLSL(gl, source, samples)`
  (renders each sample into a 1×1 `RGBA32F` FBO and reads back; needs `EXT_color_buffer_float`),
  `compareResults(name, samples, js, glsl) → { name, maxAbsError, worst }`, plus the corpora
  `DUAL_BACKEND_CORPUS`, `F_REGRESSION_CORPUS`, `ESCAPE_REGRESSION_CORPUS` and `defaultSamples()`.
  Measured agreement: **max absolute error ~1.5e-7** in single precision. Under SwiftShader in CI,
  transcendentals land at ~1e-3, so the browser test uses renderer-appropriate tolerances.

  **This is the template for domain colouring.** A contour-integration domain-colouring shader is
  `COMPLEX_SINGLE_GLSL + COMPLEX_DERIVED_GLSL + compileF(parse(src))` plus an `arg`→hue /
  `log|f|`→lightness fragment body. No new package work at all.

---

## 5. `@cas/interchange` — schema, codec, view-state

551 lines, dist-built.

- **`schema.ts` (143)** — `SCHEMA_ID = "complex-analysis-suite/interchange"`, `VERSION = "1.0.0"`,
  `Complex {re, im}`, `Conventions { area: "standard"|"normalized"; contour:
  "standard"|"suppressed-2pii" }` and `CANONICAL`. Map forms: `RationalMap { form:"rational", num,
  den, antiholomorphic? }`, `LaurentMap { form:"laurent", c, F[], antiholomorphic? }`,
  `ExprMap { form:"expr", expr, vars: ("z"|"c"|"a")[], antiholomorphic? }` → `MapSpec`. Payload kinds
  are exactly `map | quadrature-domain | schwarz-reflection | view`, wrapped in
  `Envelope<K> { schema, version, kind, payload, provenance }` with `Provenance { app, appVersion,
  createdAt, note? }`. `View { map, c?, viewport: { center, zoom, centerHiPrec? }, coloring? }`.

  **The schema cannot currently express a contour.** There is no path/arc payload and no
  `contour-problem` kind. Adding one is a payload-kind addition plus a `PayloadByKind` entry, a
  `validatePayload` branch, and (per the file header's own instruction) a version bump.
- **`validate.ts` (202)** — `InterchangeError`, `hasForbiddenKey` (iterative, node-budgeted;
  rejects `__proto__`/`constructor`/`prototype` *anywhere*), `isComplex`, `isConventions`,
  `isMapSpec`, `isEnvelopeOfKind`, `validateEnvelope`. Caps: `MAX_COEFF_LEN = 4096`,
  `MAX_EXPR_LEN = 8192`, `MAX_VARS_LEN = 16`. `assertCanonicalWire` **rejects a well-formed but
  non-canonical convention tag** — the ADR-0006 guard against a silent π/2πi mis-scale.
- **`codec.ts` (45)** — `encodeLink(env) → "#s=…"`, `decodeLink(link)` (validates).
  **`base64url.ts` (31)** — `toBase64Url`, `fromBase64Url`, `MAX_BASE64URL_LEN = 64 * 1024`.
- **`viewstate.ts` (75)** — **directly reusable, no changes needed.**
  `VIEWSTATE_VERSION = 1`, `interface ViewStateEnvelope<S> { v, app, state }`,
  `encodeViewState(app, state, version?) → "#vs=<base64url json>"`,
  `decodeViewState<S>(hashOrLink) → ViewStateEnvelope<S> | null`. It validates only the *envelope*
  shape, **preserves unknown fields inside `state`**, and does **not** reject a higher `v` — an
  explicit forward-compat contract. Each app owns its state schema. CD calls
  `encodeViewState("cd", state)` from `apps/complex-dynamics/src/state/appState.ts:111`; QD calls
  `encodeViewState('qd', s)` from `apps/quadrature-domains/app/ui-url-state.mjs:114`. We call
  `encodeViewState("ci", state)`. Nothing to extend.
- **`goldens.ts` (37)** — `GOLDEN_CREATED_AT`, `QD_TO_CD_DELTOID_LINK`,
  `QD_TO_CD_DELTOID_PHI_AT_2`. The pattern is worth knowing: an app may not import another app, so
  a producer↔consumer contract test lives in the shared package as a frozen wire artifact both sides
  pin against.

---

## 6. App-level patterns worth lifting

### 6.1 Complex-Dynamics — the camera and the GPU pipeline

`apps/complex-dynamics` is **68 `.ts` files, zero `.js`, zero `@ts-nocheck`**. Its
`tsconfig.json` still carries `allowJs: true, checkJs: false` — vestigial; do not copy it.

- **Build** — `vite.config.ts`: `base: "./"`, `server: { port: 5173, strictPort: true }`,
  `VitePWA({ registerType: "autoUpdate", workbox: { globPatterns: [...woff2], maximumFileSize… } })`,
  and an **embedded `test` block** that is the Vitest project entry. It imports `configDefaults`
  from `vitest/config` as a *value* import specifically so no `/// <reference types="vitest/config">`
  is needed (the typescript-eslint `triple-slash-reference` rule now forbids that).
  `vitest.browser.config.ts` is separate (`browser: { provider: "playwright", name: "chromium",
  headless: true }`) and deliberately **not** in `vitest.workspace.ts`.
- **Camera** — `src/transforms.ts` (39 lines) is the whole coordinate contract: canvas is the fixed
  rect `[0,2]²`, centre ↦ `(1,1)`, one plot unit spans `zoom` canvas units.
  `canvToPlot`, `plotToCanv`, `panDelta(from, to, zoom)` (**centre-free** — the docstring explains
  that `uvToPlot(from) − uvToPlot(to)` collapses to 0 once `zoom·|centre| ≳ 1e13`), `plotRange`.
  `src/render/dd.ts` holds the double-double centre (`type DD`, `dd ddToNumber ddNeg ddAdd
  ddAddNumber ddSub ddMul ddCenterToString ddCenterFromString`). `src/render/plotView.ts` (802)
  wires pointer/wheel/pinch: `uvOf(e)` → `[0,1]²`, wheel zoom anchors the cursor via
  `k = 1/oldZoom − 1/newZoom` then `plot.shift(...)`, `GRAB_RADIUS` 22/12 by pointer coarseness,
  `CLICK_SLOP = 4`, a 200 ms draft mode. DPR is a pure function: `bufferScale(dpr, res) =
  min(min(dpr,2), max(1, 1100/res))`, with `renderScale(res)` reading `devicePixelRatio`.
- **GPU wiring** — `src/render/shaderBuilder.ts` (966) exports `type Precision = "single"|"df64"`,
  `VERTEX_SHADER`, `POST_FRAGMENT_SHADER`, `COLOR_GLSL`, and
  `buildFragmentShader(fAst, escapeAst, precision, fZAst, fCAst, monicDegree, interiorBailout,
  periodicityBailout)`. `src/render/glPlot.ts` (2527) is `class GLPlot`, holding
  `programs: { single, df64 }`; `desiredPrecision()` switches on `zoom * max(1,|cx|,|cy|)`; the df64
  program builds **lazily and asynchronously** via `KHR_parallel_shader_compile` with a generation
  counter, falling back to single until ready.
- **UI** — plain DOM. `src/ui/dom.ts` is 18 lines: `byId<T>(id)` (throws), `valueOf`, `setValue`.
  `src/ui/controls.ts` centralises `INPUT_IDS` / `CENTER_SUB_IDS` and a bank of
  `getXInput`/`setXInput`, plus `markInvalid`/`clearAllInvalid`/`populateInputs`.
  `index.html` is 2260 lines of hand-written markup (`<section class="panel">`,
  `<details class="control-group">`); `src/styles/main.css` is 1784 lines with `:root` custom
  properties plus both a `prefers-color-scheme` block and a `[data-theme]` override.
  `src/main.ts` is **4637 lines** — the one thing not to copy.
- **Share link** — `src/state/appState.ts`: `SHARE_IDS` (a ~50-id `as const` allow-list),
  `readAppState`/`applyAppState`, `encodeState`/`decodeState` over `@cas/interchange`, and
  `loadSavedViews`/`saveSavedViews` on `localStorage["cdjs.savedViews"]`.
- **Boundary adapter** — `src/interchange/importMap.ts` exports `mapSpecToExpr(m)` and
  `envelopeToMapSpec(env)`, converting a foreign `MapSpec` into CD's own expression *source string*
  so everything downstream is unchanged. Copy this shape for any import path.
- **Export** — `src/hiResExport.ts`: `clampExportSize`, `flipRowsInPlace`, `ensurePngName`,
  `getMaxTextureSize`, `downloadCanvas`; orchestration in `plotView.exportPng`, with
  `render/pngMetadata.ts`'s `injectPngText` embedding reproducibility metadata.
- **Browser test** — `test/shaderCompile.browser.test.ts` builds a real WebGL2 context and sweeps
  `["single","df64"]` × four shader cases, asserting
  `expect(() => createProgram(gl, VERTEX_SHADER, src)).not.toThrow()`. Compile+link only, no pixels.

### 6.2 Quadrature-Domains — the honest-labelling and orchestration patterns

QD is ESM-JS (`.mjs`), `strict: false`, `allowJs`, a PWA, ~2 MB of app code, and imports only
`@cas/core`, `@cas/gpu`, `@cas/interchange` at **12 sites total**. Its `test` script is
`node app/node-test.js` (a CommonJS `vm` harness with per-file assertion **FLOORS**), wrapped for
Vitest by `vitest/node-suite.test.ts` via `execFileSync` with a 600 s timeout. It *also* has 99
native Vitest specs in `apps/quadrature-domains/vitest/`.

**Portable (copy the logic, rewrite in TS):**

- **The rigor vocabulary.** `apps/quadrature-domains/app/algebra/algebra-canvas.mjs:907`,
  `rigorMeta(level, bound)`:
  `exact → { '=', 'exact — certified', '#2e9e5b' }`;
  `bound → bound === '≥' ? { '≥', 'rigorous lower bound' } : { '≤', 'rigorous bound', '#3b82c4' }`;
  `estimate → { '≈', 'numerical estimate', '#c98a2e' }`;
  `partial → { '⚠', 'partial — may be incomplete', '#d1791f' }`;
  default `{ '?', 'undetermined', '#8a8a8a' }`. Twelve lines; port as a discriminated union
  `type Rigor = "exact"|"bound"|"estimate"|"partial"|"unknown"`.
- **The decision logic.** `apps/quadrature-domains/app/algebra/algebra-ui.mjs:461`
  `classifyRigor(r)` — `!r.ok → 'unknown'`; `r.inconsistent → 'exact'`;
  `!r.zeroDim || r.realCount == null → 'unknown'`; else `'bound'`. And
  `apps/quadrature-domains/app/algebra/prove-plan.mjs:336` `assembleVerdict(a)`, whose core is
  `certRigor = (undercount || rec.partial) ? 'partial' : (r.certified && allExactFilter &&
  allExactVerified && !rec.disagree && ccOk) ? 'exact' : 'estimate'`. It returns
  `{ verdict, rigor, bad, count, cc, rec, rigorProvenance }`. The sibling
  `assembleTreeVerdict` adds `bound: exactAggregate ? '=' : '≥'`.
- **The audit trail.** `rigorProvenance(f)` (prove-plan.mjs:394) returns a `✓`/`✗`-marked
  `string[]` — "why this rigor" — rendered as a `<details>` in the verdict card and included in the
  exported proof.
- **The caveat helpers** (all on `QD_UI`, all pure, all behaviour-tested in
  `vitest/algebra-verdict-rigor.test.ts`): `posDimDesc`, `scopeNote`, `droppedNote`, `latexPlain`,
  `sliceLabels`, `sliceCaveat` (appends "on the real slice only — a count here is a LOWER BOUND"),
  `scopeCaveat`, `specializationLedger` (returns the active narrowings and pushes a
  `⚠ could not scan…` entry from its own `catch` rather than failing silently).
- **The verdict-card data model** — `{ text, title?, rigor, bound?, stale?, assumptions?[],
  rigorProvenance?[], solutionsLatex?[], solutionsText?, plot?, plotCaption?, actions?[] }`, with a
  **pinned head** so a tall card can never clip its own badge.
- **The orchestrator.** `prove-plan.mjs` is 91 KB and **DOM-free**: stages as data
  (`CERTIFY_STAGES = [{id, title, why}]`), pure exported stage functions, all IO injected via
  `ctx`/`deps`, a discriminated-union `ProofResult`, and `runProofTree(ctx, {maxDepth:3,
  maxBranches:8})` that pools results across the branch tree and quotients **once**
  ("pool-then-quotient"), setting `truncated` at any cap. This is the single best architectural
  pattern in the repo for a derivation display.
- **Figure & export.** `app/ui-figure-export.mjs` (`ELEMENT_TOGGLES`, `DEFAULT_FIGURE`, `PRESETS`,
  a single `reflect()` model→controls sync, `repaint()`), the `state.figure` model
  (`app/ui-state.mjs:77`), and the **palette indirection** `_pal(key) = state.figure[key] ??
  DEFAULT_PALETTE[key]` (`app/ui-domain-plot.mjs:495`) so unset controls render byte-identically.
  `renderToCanvas(targetW, targetH, {transparent})` (`ui-domain-plot.mjs:460`) **re-draws** into an
  offscreen canvas by temporarily swapping `this.ctx` and `this.dpr` inside a `try/finally` — not an
  upscale. Clipboard uses `new ClipboardItem({'image/png': blobPromise})` so the write stays inside
  the click gesture. Honest-labelling rule baked in: `_boundaryStroke()` ignores a colour override
  when the curve is non-univalent, because red is a *validity signal*, not a style.
- **The draggable-plane class.** `app/ui-domain-plot.mjs` (1372 lines) `class DomainPlot` is the
  nearest existing analogue to a path editor: `toScreen(re,im)`, `toWorld(x,y)`, `attachEvents()`,
  `_hitTestPole(x, y, radius)` with separate click (9 px) and hover (12 px) radii, `setLivePole`,
  `fit()`, `reset()`, `niceStep()`, `drawGrid/drawTickLabels/drawAxes`, `render()`/`_renderNow()`.
- **The worker-offload pattern** (three layers, fully reimplementable): (1) one pure
  `runJob(kind, payload, onProgress)` dispatcher with **structured-clone-safe** payloads and results
  (`sym-core.mjs:5355`, 14 kinds); (2) a 30-line worker entry
  (`app/workers/sym-worker-entry.mjs`) that throttles progress with `if ((++steps & 63) === 0)`;
  (3) a main-thread wrapper `QD.SymWorker = { ensureReady, run, cancel, isBusy }`
  (`app/algebra/sym-worker.mjs`) whose key behaviours are **supersede = terminate-and-rebuild**, a
  detached abort on settle, a permanent main-thread `_fallback` on an idle `error`, and identical
  result shapes on both paths. Each store op splits `_xxxPlan(ids)` (pure) / `_xxxFinish(plan,
  result)` (mutating), shared by the sync and async variants so **only the heavy call differs** —
  see `algebra-store.mjs` `_saturatePlan`/`_saturateFinish`/`saturateMobius`/`saturateAsync`.
- **The differential test discipline.** `vitest/algebra-offload-kinds.test.ts`'s header is the
  lesson: `expect(viaJob.ok).toBe(inline.ok)` is **tautological** when both paths call the same
  function (verified by mutation — break it and both go `false`, test stays green). Every case
  therefore pins the expected *outcome* first, then compares paths.
- **The design-token test.** `vitest/qd-design-tokens.test.ts` reads the CSS text and enforces: every
  `var(--x)` is declared in `:root`; no token is declared-but-unused (scanning `.mjs` for
  `setProperty` too); no `var()` fallbacks and no token outside `:root`. Zero app coupling.
- **Share-link hygiene.** `app/ui-url-state.mjs` writes via rAF-coalesced `history.replaceState`,
  serialises only the **diff** of `state.figure` from defaults, and on restore re-validates every
  key (booleans coerced, numerics positive, enums whitelisted, colours matched against
  `/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/`, view scale clamped to `[1e-3, 1e7]`).

**Entangled — do not port:** the `QD`/`QD_UI` global namespace and `installX(uiCtx)` factories
(`app/ui-registry.mjs` itself calls them a classic-`<script>` transition artifact); `app/main.mjs`'s
generated 90-module side-effect import list; `app/node-test.js` + `app/test/*`; `app/sym-core.mjs`
and `sym-radical.mjs`; the eslint `QD_GLOBALS` block; the PWA `publicDir` + `manifest: false`
arrangement (copy only if we want offline, and then copy the comments exactly — the alternative
broke installability once).

### 6.3 Correspondences — the idiomatic template

19 files, 2851 lines, 97 `it()` calls across 17 test files, **five `@cas/*` deps and no third-party
runtime dependency at all**. This is the app to clone structurally.

- `tsconfig.json` — **copy verbatim**: extends the base, strict, `noUnusedLocals`,
  `noUnusedParameters`, `noImplicitOverride`, `verbatimModuleSyntax`, `types: []`, and it
  **deliberately omits `allowJs`/`checkJs`** with a comment saying "greenfield TypeScript app … strict
  from the start". Every relative import carries an explicit `.js` extension.
- `eslint.config.js` — `js.configs.recommended` + `tseslint.configs.recommended` + exactly three
  house rules: `eqeqeq: ["error","always"]`, `no-console: ["error", { allow: ["warn","info","error"] }]`,
  `@typescript-eslint/no-non-null-assertion: "error"`, with a `files: ["test/**","*.config.{js,ts}"]`
  override for node globals.
- `vite.config.ts` — `base: "./"`, `server: { port: 5175, strictPort: true }`, multi-page
  `build.rollupOptions.input`, inline `test` block. (It still uses the triple-slash reference; prefer
  CD's `configDefaults` value-import form.)
- **Module layering**: math engine (`deltoid.ts`) → derived structure (`correspondence.ts`,
  `family.ts`) → iteration (`orbitTree.ts`) → render (`render.ts`, `correspondenceRender.ts`) → GPU
  port (`gpu.ts`, `paramGpu.ts`) → entry (`main.ts`). Naming: `DEFAULT_*` consts, `createXRenderer`
  factories, `makeX` for configured closures, `xBand`/`xToImage` for the render split.
- **The pure/impure render split** — heavy compute is a pure function over a `Float32Array`
  (node-testable, chunkable); colouring is a separate function taking `ImageData` (browser-only).
  Applied three times (`classifyParamBand`/`paramFieldToImage`, `classifyTricornBand`/
  `tricornFieldToImage`, `accumulateBand`/`densityToImage`).
- **GPU factories return `null`** (`createDeltoidRenderer(canvas): GpuRenderer | null`), with the
  CPU path as the verified reference and the fallback; on a failed `createProgram` they call
  `gl.getExtension("WEBGL_lose_context")?.loseContext()` to release the orphaned context.
- **No `requestAnimationFrame`** — `chunkImageBands(ctx, size, rowsPerTick, renderRows, capId,
  progress, done)` driven by `setTimeout(tick, 0)`, because rAF is suspended in hidden tabs. (QD hit
  the same trap; it is worth treating as a house rule.)
- **View convention** — `interface View { centerX, centerY, halfSpan }` (world half-*height*), with
  a named inverse `pixelToParam(px, py, width, height, view)`. Note this is a **different**
  convention from CD's `center + zoom`; pick one deliberately.
- **Branch machinery** — `interface Correspondence { eta, branches, degree }`,
  `makeUnboundedLaurentCorrespondence(c, F, evalPhi)`; the algorithm deflates the known trivial root
  by exact synthetic division *before* solving, which is what prevents mislabelling near a cusp.
  `interface OrbitNode { point, label, depth, parent }` + `expandOrbitTree(corr, seed, opts)` —
  a flat array with index parents. Branch labels are ordered by argument and the header **flags in a
  ⚠ block that this is not analytic continuation**.
- **`src/exact/index.ts`** — a local barrel that re-exports the shared package's primitives
  alongside app-specific ones, so app code has one import point. Copy this.
- **Header comment discipline** — every file opens with a 5–20 line block giving the milestone id,
  the mathematics in prose with real symbols, *why this file exists separately*, and a ⚠ block for
  anything exploratory, with a pointer to `RISKS.md §3`. Refuted claims are kept with their
  counterexamples, and findings are cited by id (`corr-orbittree-01`).
- **What it is a non-model for:** UI and state. There is no state container, no controls, no URL
  state (verified: zero hits for `location.hash` / `URLSearchParams` / `encodeViewState` in `src/`),
  and `main.ts` injects the whole shell via one `innerHTML` template string.

---

## 7. Repo-wide conventions the new app must follow

**The dependency rule** (`docs/ARCHITECTURE.md` §4: *"Packages import only from packages below them.
Apps import packages. No app imports another app. No cycles."*). Enforced by the root
`eslint.config.js`, which does **only** this job:

```js
const APP_NAMES = ["complex-dynamics", "quadrature-domains", "correspondences", "launcher"];
// … applied to files: ["apps/**/*.{ts,tsx,mts,cts,mjs}", "packages/**/*.{js,mjs,cjs,jsx,ts,tsx,mts,cts}"]
rules: { "no-restricted-imports": ["error", { patterns: noCrossAppImports }] }
// message: "Dependency rule (ARCHITECTURE.md §4): an app may not import another app, and a package
//           may not import an app. Depend downward on packages instead."
```

→ **`"contour-integration"` must be added to `APP_NAMES`.** A `dependency-cruiser` check is a
planned follow-on, not wired.

**Vitest.** Root `vitest.config.ts` configures **coverage only** (v8, `include` lists
`packages/*/src` + CD + correspondences `src`, excludes `**/glsl/**`, no thresholds).
`vitest.workspace.ts` lists eight project configs explicitly — **a new app is invisible to
`pnpm test` until its config file is added there.** Root `pnpm test` is
`pnpm -r --filter "./packages/*" run build && vitest run`; it does *not* run `pnpm -r run test`, so
an app's own `test` script is irrelevant to the gate except through workspace registration.
Root `pnpm test:browser` is a **hardcoded** `pnpm -C packages/gpu … && pnpm -C apps/complex-dynamics
…` — a new browser suite must be appended there too.

**TS config layering.** `tsconfig.base.json` (ES2022, ESNext modules, `moduleResolution: "bundler"`,
`lib: [ES2022, DOM, DOM.Iterable]`, `strict`, `esModuleInterop`, `skipLibCheck`, `resolveJsonModule`,
`isolatedModules`, `forceConsistentCasingInFileNames`, `noEmit`). Every package/app extends it.
Shared packages add `noUnusedLocals`, `noUnusedParameters`, `noImplicitOverride`,
`verbatimModuleSyntax`; dist-built packages carry a separate `tsconfig.build.json`.

**Build.** Every app sets `base: "./"` (CLAUDE.md decision 11) so assets resolve from any Pages
sub-path. Ports in use: CD 5173, correspondences 5175, QD 5199 — pick a free one with `strictPort`.

**Scripts.** Root `pnpm lint` = `eslint . && pnpm -r --filter "./packages/*" run lint && pnpm -r
--filter "./apps/*" run lint`; `pnpm typecheck` and `pnpm build` are the analogous recursive forms.
`pnpm -r run <script>` silently **skips** a workspace member without that script (which is why the
launcher, with only `dev`/`build`/`preview`, passes lint and typecheck).

**The launcher.** `apps/launcher/index.html` is a hand-written static page with hard-coded
`<a class="card" href="complex-dynamics/">` entries and a `<span class="badge">Coming soon</span>`
for correspondences. **There is no registry** — adding the contour tool means editing that HTML
(and its `<meta>` descriptions).

**CI.** Two workflows. `ci.yml` — `build` job (install → lint → typecheck → test → build), run on
`pull_request` only (skipped on push to master, because `deploy-pages.yml` runs the identical gate);
plus a `browser` job (Playwright Chromium, `pnpm test:browser`) that runs on both and is **not** a
publish blocker. `deploy-pages.yml` — on push to `master` and `workflow_dispatch`: the same
lint/typecheck/test gate, `pnpm build`, then an **`Assemble _site` shell step**:

```
mkdir -p _site
cp -r apps/launcher/dist/.         _site/
cp -r apps/complex-dynamics/dist   _site/complex-dynamics
cp -r apps/quadrature-domains/dist _site/quadrature-domains
touch _site/.nojekyll
```

**That copy list is the entire publish mechanism.** `apps/correspondences` is built (by the root
`build`) but never copied, which is exactly why it is "built but not published". The contour app is
published by adding one `cp -r` line; left out of the list, it is built and gated but unpublished.

**New-app checklist.** (1) `apps/contour-integration/package.json` with `dev/build/preview/test/
test:watch/lint/typecheck` + `workspace:*` deps; (2) `tsconfig.json` copied from correspondences;
(3) `eslint.config.js` copied from correspondences; (4) `vite.config.ts` with `base: "./"`, a free
`strictPort`, and the embedded `test` block using CD's `configDefaults` value import;
(5) add the config to `vitest.workspace.ts`; (6) add `"contour-integration"` to root
`eslint.config.js`'s `APP_NAMES`; (7) add the app's `src` glob to root `vitest.config.ts` coverage
`include`; (8) launcher card; (9) the `deploy-pages.yml` `cp` line when we want it live; (10) if we
add a browser suite, append it to the root `test:browser` script.

---

## 8. Verdict table

`SHARED-CHANGE` marks anything that edits a `packages/*` file and therefore carries blast radius on
CD / QD / correspondences.

| Capability needed | Verdict | Detail & blast radius |
|---|---|---|
| Expression AST + parser | **EXTEND** (SHARED-CHANGE, low risk) | `@cas/expr` `ast.ts`/`parser.ts` are sound. Additive: complex literals (`3+4i`) and possibly implicit multiplication in the lexer; a `t` path parameter in `evaluate`'s scope. Purely additive grammar ⇒ no existing program changes meaning; pin with `packages/expr/test/parser.test.ts`. |
| Extra functions (`sinh`, `Γ`, `ζ`, `erf`, …) | **EXTEND** (SHARED-CHANGE, low risk) | Five coordinated tables in `@cas/expr` (`COMPLEX_FUNCTIONS`, `UNARY`, `UNARY_GLSL`, `UNARY_TEX`, `chainOuter`) + a GLSL body in `@cas/gpu`'s `complexDerived.glsl.ts`. Additive; CD/corr can't regress on functions they never call. Must keep the dual-backend browser gate green. |
| Symbolic derivative | **REUSE AS-IS** | `differentiate(node, v)` + `newtonIteration`. Holomorphic subset only, which is exactly the residue use case. Known throws are documented above. |
| LaTeX output | **EXTEND** (app-local first) | `toLatex(node)` covers the integrand. Integral signs, `\oint`, `\mathrm{d}z`, `\operatorname*{Res}`, aligned derivation steps are **app-local composition** around `toLatex` — no package change. Only add to `UNARY_TEX` when a new function lands. |
| Complex arithmetic (float) | **REUSE AS-IS** | `@cas/expr/complexJs` (tuple) for the expression pipeline; `@cas/core`'s `Complex`/`Cx` + `tupleAlgebra`/`objAlgebra` for algorithms. Alias one app-wide `type Complex = ComplexTuple` as correspondences does. |
| Polynomial root-finding (poles) | **EXTEND** (app-local wrapper) | `makeDurandKerner` is the iteration only — **no seeding, no deflation, no multiplicity detection, no polish**. Write an app-local `findPolesOf(num, den)` that seeds, deflates, Newton-polishes, and *clusters to recover pole order*. QD's `parse-h.mjs` Phase-2 fallback is the algorithm to follow. Extract to `@cas/core` only if a second consumer appears. |
| Rational-function decomposition of an AST | **REUSE AS-IS** | `fToRational(ast, c, a) → { num, den } \| null` in `@cas/expr/rational`. This is the entry point to the whole rational-residue path. |
| Laurent / Taylor series (float) | **EXTEND** (SHARED-CHANGE, medium) | `@cas/core/series` ships **only** `zeros/unit/mul`. `inverse`, `recip`, `pow`, `compose`, `reversion`, `deriv`, `integral`, `log`, `exp` exist **twice app-side** (CD `render/uniformize.ts`, QD `taylor.mjs`) with *different algorithms* — the header says unifying them would shift one app's rounding. **Build new app-local series ops first**; then propose the generic package the header itself anticipates ("Phase-6 work driven by a third consumer"), migrating the apps only with their tests green before and after. |
| Exact arithmetic over ℚ(i) | **REUSE AS-IS** | `@cas/exact`: `Frac`, `Gauss`, `QiPoly` (incl. `gcd`, `squarefreePart`, `divmod`, `derivative`, `monic`), `BiPoly`, `resultant`, `discriminant`, `render*`. |
| Exact pole orders / partial fractions | **EXTEND `@cas/exact`** (SHARED-CHANGE, additive) | Needs **univariate ℚ(i) factorisation** and an **exact Laurent-series layer** — present in QD's `sym-core.mjs` (`_qiFactor`, `series*`, `padeApproximant`) but *not* extractable under ADR-0008 (shape mismatch, risk concentration, no multivariate demand). Grow `@cas/exact` with new files instead; new exports are purely additive for CD/corr. Add a `sym-core` differential test in the style of `vitest/exact-symcore-differential.test.ts`. |
| Exact pole counting inside a contour | **BUILD NEW** (app-local, then maybe `@cas/exact`) | `schurCohn`/`unitCircleRootCount` (unit disc) and `realRootIsolate` (real axis) live only in `sym-core`. Port in spirit for the unit-circle and half-plane cases; for a general contour use the argument principle numerically and label `=` only with a certified `< ½` error bound (see 04-numerics). |
| Numeric quadrature (trapezoid / Clenshaw–Curtis / Gauss–Kronrod / tanh–sinh) | **BUILD NEW** (app-local) | **Nothing exists.** The repo has only ad-hoc trapezoid sweeps inside QD's LQD/PQD solvers, all `{re,im}`-typed and solver-entangled. Greenfield, and the whole of research track 04. |
| Winding number / argument principle | **BUILD NEW** (app-local) | The only prior art is `apps/quadrature-domains/app/solver-pqd-common.mjs` `rHashVanishingGuard` (unwrapped-argument accumulation → `Math.round(netDArg / 2π)`). Lift the algorithm, not the code. |
| GPU domain colouring | **REUSE AS-IS** | `@cas/gpu` `createProgram` + `COMPLEX_SINGLE_GLSL` + `COMPLEX_DERIVED_GLSL` + `@cas/expr`'s `compileF`. `buildProbeGLSL` in `dualBackend.ts` is a working minimal example. Only the fragment body (arg→hue, log\|f\|→lightness) is new. |
| Colormaps | **REUSE AS-IS** | `buildColormapLUT` / `buildGradientLUT` / `sampleStops` / `makeColormapTexture`. Palette **data** stays app-local by design. |
| df64 deep zoom | **REUSE AS-IS** (if wanted) | `DF64_GLSL` + `COMPLEX_DF64_GLSL` + `df64Ref.ts`; copy CD's lazy `ensureDf64()` + generation-counter pattern from `glPlot.ts`. Probably unnecessary for v1. |
| Plane / pan-zoom camera | **BUILD NEW** (port CD's, app-local) | Copy `src/transforms.ts` (39 lines, centre+zoom, centre-free `panDelta`), the `bufferScale`/`renderScale` DPR pair, and `plotView.ts`'s wheel-anchor + pinch logic. Not extractable yet (CD and correspondences use *different* view conventions — `center+zoom` vs `{centerX, centerY, halfSpan}`), so this is the second consumer of *neither*. |
| Draggable path editor (segments + arcs) | **BUILD NEW** (app-local) | Closest analogue is `DomainPlot`'s pole editor (`toScreen`/`toWorld`/`attachEvents`/`_hitTestPole` with split click/hover radii/`setLivePole`). Arc handles, path topology, orientation and self-intersection checks are all new. |
| Honest `=` / `≤` / `≈` labelling | **BUILD NEW** (app-local; TS port of QD's) | **Nothing shared exists** — zero rigor code in `packages/*`. Port `rigorMeta`'s five-level vocabulary, the verdict data model with a pinned badge head, `rigorProvenance`'s ✓/✗ audit trail, and the "a restricted count must carry its restriction" rule (`sliceCaveat`/`scopeCaveat`). Contour analogues: `=` for a residue sum with certified poles and exact winding; `≤`/`≥` for a truncated pole search or an ML-bound; `≈` for numeric quadrature; `⚠` for a singularity on the contour. |
| Derivation / proof display | **BUILD NEW** (app-local; copy `prove-plan.mjs`'s architecture) | Stages-as-data `{id, title, why}[]`, pure exported stage functions, all IO injected via `ctx`/`deps`, a discriminated-union result, pool-then-quotient aggregation, and an exportable `{ format, version, proof, derivation }` JSON blob. The single best pattern in the repo to steal wholesale — as an architecture, not as code (it is 91 KB of QD-specific `.mjs`). |
| Share-link view-state codec | **REUSE AS-IS** | `encodeViewState("ci", state)` / `decodeViewState`. Zero package change. Adopt QD's hygiene: rAF-coalesced `history.replaceState`, serialise only the diff from defaults, re-validate **every** key on restore. Note `navigate`-ing to a new `#vs=` is a hashchange, not a reload. |
| Cross-tool hand-off (import a map from QD/CD) | **EXTEND `@cas/interchange`** (SHARED-CHANGE, version bump) | The schema has no contour/path payload and no `contour-problem` kind. Importing an existing `MapSpec` as an integrand is **reuse as-is** (copy CD's `importMap.ts` adapter pattern). Emitting a contour problem needs a new `PayloadByKind` entry + `validatePayload` branch + a `VERSION` bump; add a golden to `goldens.ts`. Defer until a real hand-off exists — ADR-0007. |
| Figure export (hi-res PNG, clipboard, presets) | **BUILD NEW** (app-local; copy QD's + CD's) | QD's `_pal` palette indirection, `renderToCanvas`'s swap-ctx/re-draw-at-dpr trick, the sync `ClipboardItem(blobPromise)` idiom, `DEFAULT_FIGURE`/`PRESETS`/single-`reflect()` model, and the "an override must never repaint a validity signal" rule; CD's `clampExportSize`/`downloadCanvas`/`injectPngText`. Pure canvas API, nothing shared. |
| Worker offload for slow solves | **BUILD NEW** (app-local; copy QD's pattern) | `runJob(kind, payload, onProgress)` with clone-safe IO, the 30-line worker entry with `(++steps & 63)` progress throttling, terminate-on-supersede, permanent fallback on an idle error, the `_xxxPlan`/`_xxxFinish` split, and **outcome-pinned** differential tests (a bare path-vs-path compare is tautological). |
| Shared UI kit | **BUILD NEW app-local — and flag the `@cas/ui` trigger** | `@cas/ui` is documented as planned-but-never-built, and `docs/algebra-review/IMPROVEMENTS.md` records an explicit *defer* on a seed, naming `blob-download` + complex formatting as the cleanest first tenants and saying a third consumer would force it. **This app is that third consumer.** Start app-local (copy CD's `ui/dom.ts` + `ui/controls.ts` + `state/appState.ts`), then propose the seed once two or three helpers are genuinely identical. |

**The three things most likely to bite.** (1) `@cas/core/series` is a *single function* — every
Laurent computation we need is new code, and the two existing app-side implementations deliberately
disagree in rounding, so "just share theirs" is not available. (2) `makeDurandKerner` gives us an
iteration, not a root-finder: seeding, deflation and multiplicity are ours. (3) The honest-labelling
system that `CLAUDE.md` treats as a non-negotiable guardrail exists **only** as 6,000 lines of QD
`.mjs`; every new app has re-implemented it from scratch, and we will too unless we budget for the
`@cas/ui`-adjacent extraction.
