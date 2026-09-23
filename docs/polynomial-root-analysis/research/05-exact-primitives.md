> Research track 5 for `apps/polynomial-root-analysis`. Surveyed 2026-09-22 against the tree at HEAD by a
> read-only agent. The source of PLAN §6 (reuse) and DESIGN §1; its closing table is the extraction
> ledger. Re-verify paths before each lift: the survey is a snapshot.

# 05 — Exact & numeric primitives for a "polynomial roots + Galois group" app

---

## ~15-line summary

1. `packages/exact` is a clean, well-tested **ℚ(i) polynomial kernel**: `Frac`/`Gauss` (BigInt field), `QiPoly` (mul/divmod/divExact/gcd/extendedGcd/invMod/eval/derivative/Taylor-`shift`/`squarefreePart`), `yunSquarefree`/`multiplicityAt`, `resultant`/`discriminant`/`bareissDet`/`primitivePoly`, `BiPoly` (monic division only), `QiSeries`, `SqrtExt` (ℚ(i)(√d)), `piBounds`, `render`.
2. **Absent from every TypeScript package**: polynomial _factorisation_ over ℤ/ℚ (Zassenhaus, Berlekamp, Cantor–Zassenhaus), Hensel lifting, **any finite-field/mod-p arithmetic**, real-root isolation (Sturm), resolvents, and certified root discs. Confirmed by grep: zero hits in `packages/`.
3. **But all of it exists** in `apps/quadrature-domains/app/sym/sym-core.mjs` (6045 lines, plain `.mjs`, attaches to `globalThis.QD.Sym`): `_qiFactor` (shifted-norm + **Berlekamp–Zassenhaus over ℚ**), `factor`, `factorOverQ`, full 𝔽ₚ layer (`_pmMul/_pmDivModF/_modInv/_ddf/_edf/_czFactor` = distinct-degree + equal-degree **Cantor–Zassenhaus**), Hensel lifting (`mvHenselLift`, `henselFactorBivariate`), `realRootIsolate` (**Sturm**), `sturmHabicht`, `resolvent`, `schurCohn`/`unitCircleRootCount` (certified root counts in a disc), `rationalUnivariateRep`, `charPolyByTraces`. **This is the single biggest reuse opportunity — and the single biggest packaging problem** (it is untyped, app-internal, global-side-effect).
4. The **monodromy → permutation → group** stack already exists in `apps/complex-function-plotter/src/riemann/`: `computeMonodromy` (nearest-match continuation along a resampled loop, returns permutation + cycles + confidence), `permGroup.ts` (`generatedGroup`, `isTransitive`, `namedGroup` → Cₙ/Sₙ/Aₙ/Dₙ, `riemannHurwitzGenus`), `generatorLoop.ts` (`lassoLoop`, `commonBasePoint`, `enclosingLoop`, `generatorRadius`), `permDiagram.ts` (canvas permutation diagram). This is ~90% of a Galois-group-by-monodromy app.
5. **AST → exact ℚ(i) polynomial** already exists: `apps/contour-integration/src/kernel/exactRational.ts` `toExactRational(ast, variable)` (+ `simplestRational`), returning `{num: QiPoly, den: QiPoly}` with honest refusals. `packages/expr`'s own `fToRational` is the float version.
6. Numeric roots: `@cas/core` `rootsMonic`/`rootsMonicClosure`/`makeDurandKerner` — **no Newton polish**. Polish exists twice in app/package code: `packages/faber/src/roots.ts` `polynomialRoots({polish})` and `apps/contour-integration/.../poles.ts` `polish()`. Both are second-consumer candidates for `@cas/core`.
7. Generic **`Field<T>` + exact Gaussian elimination** (`rref`, rank/kernel/contradiction report) lives in `apps/contour-integration/src/families/{field,linear}.ts` — the cleanest lift-to-package candidate in the repo under ADR-0007.
8. Cyclotomic machinery (`kernel/cyclotomic.ts`, `kernel/unitRoot.ts`) is real but narrow (roots of unity in ℚ(i)(√d), m ∈ {1,2,3,4,6}); `unitRoot` is already a 3-consumer extraction inside the app.
9. Integer-rounding-with-certification exists as `rationalCandidate` (snap → _verify by exact evaluation_ → reject) in `kernel/exactResidue.ts` — exactly the guess-then-verify idiom a rational-root/factor-recombination step needs.
10. `packages/rigor` gives branded `Certificate`/`Verdict` with `exact`/`bound`/`estimate`/`unknown`/`refuse` and `meet`-based level computation — use it to keep "Galois group = S₅" honestly labelled `≈` unless proved.
11. `packages/gpu` gives GLSL domain colouring (`PHASE_COLORING_GLSL` `colorAt(cvec w)` with 7 colormaps + 5 enhancement modes), `createProgram`, `makeColormapTexture`, `buildPolygonMaskTexture`. **No point/disc marker primitive on the GPU** — every app draws markers on a 2D overlay canvas.
12. `packages/ui` gives `mountCanvas`/`attachCanvasA11y`/`runWithFatalBoundary`/`createComputeClient` (worker offload, coalescing, sync fallback), exemplified by CD's `JuliaMetricsClient`.
13. Animation: `apps/complex-function-plotter/src/ui/animate.ts` (`stepT` + `createAnimator`, rAF transport over `t ∈ [t0,t1]`) and `apps/contour-integration/src/shell/sweep.ts` (ease-out sweep planner). Both reusable for animating roots around a loop.
14. Extended precision: `@cas/gpu/df64` is a **complete double-double library** (`twoSum`, Dekker `split`, `twoProd`, `dfAdd/Mul/Div/Sqrt/Exp/Log/SinCos/Atan2`) plus its GLSL twin. No BigInt-based float/interval arithmetic anywhere.
15. Permalink codec (`@cas/interchange` `encodeViewState`/`decodeViewState`) and PNG metadata export (`@cas/export` `injectPngText`/`readPngText`) are ready to use as-is.

---

## 1. `packages/exact/src` — module by module

Package `@cas/exact`; `exports` map is **dist-only** (`./dist/index.d.ts` + `./dist/index.js`), unlike `@cas/gpu`/`@cas/ui` which are source-consumed. Consumers today: correspondences, complex-function-plotter, quadrature-domains, contour-integration, complex-dynamics.

### `gaussian.ts` (224 lines)

- `bigGcd(a, b): bigint` — Euclidean gcd on magnitudes; `bigGcd(0,0)=0`.
- `class Frac` — ℚ over BigInt, lowest terms, `d > 0`. `Frac.of(n, d=1n)`, `Frac.ZERO/ONE`, `isZero`, `equals`, `add/sub/mul/div/neg`, `toNumber()`. `toNumber` is carefully written (independent 60-bit reduction of each side + chunked `2^e` rescale) so huge/huge ratios don't return NaN — the _only_ exact→float crossing in the package.
- `class Gauss` — ℚ(i) = `{re: Frac, im: Frac}`. `Gauss.int(re, im=0)`, `Gauss.rat(reN, reD, imN, imD)`, `ZERO/ONE/I`, `isZero/equals/add/sub/mul/neg/conj/norm2/inv/div/toTuple()`. `mul` has a real×real fast path (3–3.6× measured), bit-identical.
- **It is a field**, which is what makes `QiPoly.divmod` and Bareiss exact.
- Tests: `test/exact.test.ts` (normalisation, arithmetic, invertibility, `toNumber` at extremes incl. the `[2^1000, 2^1024)` window), `test/fracToNumber.test.ts` (6 cases incl. underflow/sign).

### `qiPoly.ts` (281 lines) — the workhorse

`class QiPoly`, little-endian trimmed `readonly coeffs: readonly Gauss[]`; zero poly = `[]`, `degree() = -1`.

- Constructors: `fromCoeffs`, `zero`, `constant(g)`, `int(n)`, `variable()`, `monomial(k, coeff=ONE)`.
- Accessors: `degree`, `isZero`, `coeff(i)`, `leadingCoeff`, `equals`.
- Ring ops: `add`, `sub`, `neg`, `scale(g: Gauss)`, `mul`, `pow(n)` (square-and-multiply).
- **Division**: `divideByVar()` (exact /z, throws on nonzero constant term), `divmod(b): {q, r}` (field division-with-remainder), `divExact(b)` (throws on remainder).
- **Evaluation**: `eval(x: Gauss): Gauss` (Horner).
- **Calculus**: `derivative()`.
- **Normalisation**: `monic()`.
- **GCD**: `gcd(o)` → monic Euclidean gcd; `squarefreePart()` = `p / gcd(p, p')`.
- **`shift(a: Gauss): QiPoly`** — exact Taylor shift `p(var + a)` by repeated synthetic division, O(deg²). This is the primitive a root-isolation / Vincent–Akritas / Graeffe step would build on.
- Free functions: `extendedGcd(a, b): {g, s, t}` with `s·a + t·b = g`, g monic; `invMod(a, m): QiPoly | null` (null ⇔ not coprime ⇔ repeated root — a _result_, not an error).
- **No composition** (`p(q(x))`), **no modular reduction mod a prime**, **no factorisation**, **no root finding**.
- Tests: `test/exact.test.ts` (build/trim/degree, mul, divmod, divideByVar, Horner, derivative, gcd, squarefreePart, rendering); `test/qiSeries.test.ts` (shift: coefficient-for-coefficient, Gaussian-integer shift, `p(z+a)|_0 = p(a)`; extendedGcd cofactor identity; invMod returns null exactly when non-squarefree).

### `qiSeries.ts` (82 lines)

`type QiSeries = Gauss[]` (truncated formal power series).

- `seriesFromPoly(p, n)`, `seriesMul(a, b, n)`, `seriesInverse(c, n)` (requires nonzero constant term, else throws), `splitOrder(p): {order, rest}` (order of vanishing at 0).
- Tests: multiply, invert-and-verify, geometric series `1/(1−z)`, refusal without constant term, splitOrder.

### `squarefree.ts` (72 lines)

- `yunSquarefree(p): SquarefreeFactor[]` — Yun's algorithm (char 0), returns `{factor (monic), multiplicity}` ascending, `p = c · Π aₘ^m`. Constants/zero → `[]`.
- `multiplicityAt(p, root: Gauss): number` — repeated `divExact` by `(x − root)`; throws on the zero polynomial.
- Explicitly **not** factorisation ("far cheaper than factorisation, which it does not need and does not do").
- Tests (`qiSeries.test.ts`): separates multiplicities of `(z−1)²(z+2)³`, reconstructs the input, squarefree input → all multiplicity 1, constant → empty; `multiplicityAt` at a Gaussian point; **"distinguishes a genuine double root from two nearby distinct roots"**.

### `sqrtExt.ts` (216 lines)

- `squarefreeSplit(n: bigint): {square, free} | null` — trial division with `FACTOR_LIMIT = 1_000_000n`; **declines** rather than guessing (a wrong radicand would break equality).
- `class SqrtExt` — `a + b√d`, `a, b ∈ ℚ(i)`, `d` squarefree positive; `d=1` normalises to ℚ(i). `SqrtExt.of(a, b, d)`, `fromGauss`, `ZERO/ONE`, `isRational`, `isZero`, `asGauss(): Gauss|null`, `add/sub/neg/mul/conjExt/inv/div/equals/toTuple`.
- `sqrtOfGauss(g): SqrtExt | null`, `sqrtOfFrac(f): {rational, radicand} | null`.
- Deliberately **one** square root: ℚ(i,√2,√3) is declined.
- Tests: `test/sqrtExt.test.ts` (134 lines).

### `piBounds.ts` (89 lines)

- `interface RationalInterval {lo: Frac, hi: Frac}`.
- `arctanBounds(x: Frac, terms = 24)`, `piBounds(terms = 24)` (Machin), `piUpper(terms)`, `piLower(terms)`.
- Tests: brackets π against an independent 50-digit value; sound at every truncation; nesting; memoised (same `Frac` objects); **"never touches `Math` to produce the bound"**.

### `biPoly.ts` (156 lines)

`class BiPoly` — polynomial in an outer variable whose coefficients are `QiPoly` (inner). `fromCoeffs`, `zero`, `constant(p)`, `variable()`, `monomial(k, coeff)`, `degree`, `isZero`, `coeff(i)`, `leadingCoeff`, `equals`, `add/sub/neg/scaleInner(p)/mul/pow`, **`divmodMonic(b)` / `divExactMonic(b)` — monic divisor only** (the inner ring is not a field). No gcd, no resultant at this layer.

- Tests: `test/biPoly.test.ts` — builds `f_c(z) = z²+c`, `(z+c)(z−c)`, monic division exact + with remainder, rejects non-unit leading coefficient, bivariate text rendering.

### `resultant.ts` (174 lines)

- `integerPrimitive(polys: readonly QiPoly[]): QiPoly[]` — clears denominators _jointly_ by one common rational, divides out integer content, fixes sign from the last poly's leading coefficient.
- `primitivePoly(p)` — the single-polynomial case.
- `bareissDet(matrix: QiPoly[][]): QiPoly` — fraction-free determinant over the integral domain ℚ(i)[inner], with row-swap pivoting.
- `resultant(A: QiPoly[], B: QiPoly[]): QiPoly` — Sylvester resultant in the outer variable; lists trimmed to true degree; degenerate zero-list cases resolved deliberately (`0 vs deg≥1 ⇒ 0`, `0 vs const ⇒ 1`).
- `discriminant(coeffs: QiPoly[]): QiPoly` — `(−1)^{d(d−1)/2}·Res(A, A′)/lc(A)`, **classical sign and magnitude intact** (disc(x²+1) = −4, disc(x²−2) = 8, disc(x³−1) = −27); degree < 2 ⇒ 1.
- Tests: `test/resultant.test.ts` (183 lines) — matches classical values, vanishes exactly when a root is shared, etc.

### `render.ts` (92 lines)

`renderGaussMag(g): {sign, mag, isUnit}`, `renderQiPolyText(p, varSym)`, `renderBiPolyText(p, outerSym, innerSym)`.

### **What is categorically ABSENT from `packages/exact` (and from all of `packages/`)**

|                                                                        | status                                                                       |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Factorisation over ℤ or ℚ (Zassenhaus / Berlekamp / Cantor–Zassenhaus) | **absent**                                                                   |
| Hensel lifting                                                         | **absent**                                                                   |
| Finite-field / mod-p arithmetic (any `𝔽ₚ`, `modInv`, `_pm*`)           | **absent** — grep over `packages/**/*.ts` returns zero hits                  |
| Real or complex root isolation (Sturm, Descartes, Vincent, Budan)      | **absent**                                                                   |
| Resolvent computation (Galois or otherwise)                            | **absent**                                                                   |
| Integer-rounding-with-certification                                    | **absent from the package**; exists app-side (see §2)                        |
| Polynomial composition `p∘q`                                           | absent                                                                       |
| Cyclotomic polynomials Φₙ                                              | absent from the package; app-side `asCyclotomic` recognises only `bₙzⁿ + b₀` |
| Interval / ball arithmetic over ℚ                                      | only `piBounds`' `RationalInterval` (π/arctan specific)                      |
| LLL                                                                    | absent                                                                       |

### **The offsetting discovery: `apps/quadrature-domains/app/sym/sym-core.mjs` (6045 lines)**

Plain `.mjs`, IIFE attaching `QD.Sym` to `globalThis` — **no ESM export**, loaded in QD's own Node test harness via `loadInCtx('sym-core.js')` (`app/test/bootstrap.js`). Not a workspace package; QD is deliberately excluded from `@cas/ui` adoption (ADR-0002/0008). It contains its own ℚ(i) tower (`Rational`, `Gaussian`, `MPoly`, `RatFn`) — **parallel to, not built on, `@cas/exact`**.

Directly relevant exports on `QD.Sym`:

- `factor(poly, opts)` — radical factorisation with verified divisibility; caps report `undetermined`, never false irreducibility.
- `factorOverQ(poly, v)` (`_factorOverQ`, line 2270) — monic transform `B(y) = lc^{n−1}·A(y/lc)`, prime selection with squarefree `B mod p`.
- `qiFactor(f, v)` (`_qiFactor`, line 2307) — **the shifted-norm trick + Berlekamp–Zassenhaus over ℚ**, returning the complete irreducible factorisation over ℚ(i).
- The 𝔽ₚ layer (lines ~2048–2170): `_modInv(a,p)`, `_pmDivModF`, `_pmRemF`, `_pmDivModMonic`, `_pmPowMod`, `_prodMod`, `_ddf` (distinct-degree), `_edf` (equal-degree), **`_czFactor` = Cantor–Zassenhaus**, `_bezout`.
- Hensel: `mvHenselLift`, `henselFactorBivariate` (Zassenhaus–Hensel oracle), `factorBivariate`, `factorMultivariate`, `bivariateAbsFactorCount`, `isAbsolutelyIrreducible`.
- **Real-root isolation**: `realRootIsolate(p, v, opts)` (line 921) — Sturm chains, exact bisection, exact rational roots reported as `lo == hi`; `realRootCount`, `sturmHabicht`, `realRootCountSturm` (parametric, signed subresultants).
- **Certified complex root counts**: `schurCohn(coeffs)` (line 4726) — certified open-disk / outside counts _with multiplicity_, singular case resolved by peeling the self-inversive factor; `schurCohnInterval`, `schurCohnAtBox`, `unitCircleRootCount`.
- **`resolvent(input, varName, vars, opts)`** (line 5048) — `χ_v(x) = det(x·I − M_v)`, the characteristic polynomial of multiplication-by-v on the quotient ring. Plus `multiplicationMatrix`, `charPolyByTraces`, `powerSums`, `newtonToElementary`, `rationalUnivariateRep`, `solveRealCertified`, `minimalPrimes`, `curveGenus`, Gröbner/FGLM.
- `sym-radical.mjs` (641 lines): solution by radicals with the **quartic resolvent cubic** (lines 178, 251, 267) and an honest Abel–Ruffini refusal for irreducible degree ≥ 5.
- Docs: `apps/quadrature-domains/THEORY_MAP.md` (rows for factorisation and resolvent/discriminant), `docs/MULTIVARIATE_FACTORING.md`, `docs/NVARIATE_FACTORING.md`, `docs/ALGEBRA_EXTENSIONS.md`.

**Implication for the new app:** the algorithms exist and are battle-tested, but a new TS app cannot `import` them. Options: (a) port `_qiFactor` + the 𝔽ₚ layer into `@cas/exact` as TS over `Gauss`/`QiPoly` (the ADR-0007 second-consumer justification is now genuine), (b) re-export `sym-core.mjs` via a thin ESM shim, (c) reimplement. (a) is the right call and is a bounded job: the 𝔽ₚ layer is ~120 lines and `_qiFactor` ~130.

---

## 2. `apps/contour-integration/src/kernel/` — number types built on `@cas/exact`

32 kernel modules + `bounds/` (12) + `branch/` (8), ~12k lines.

### Lift-worthy (generic)

- **`families/field.ts`** — `interface Field<T> { zero, one, add, sub, mul, inv, neg, isZero, equals, format }`. Deliberately _not_ an algebra: no ordering (no pivoting by magnitude), no `div`. Instances: `FRAC_FIELD` (ℚ), `RAT_PI_FIELD` (ℚ(i)(π)). **This is the cleanest generic abstraction in the repo and should be lifted into `@cas/exact` verbatim** — a Galois app wants it instantiated at ℚ, ℚ(i), 𝔽ₚ and ℚ[x]/(f).
- **`families/linear.ts`** — exact Gaussian elimination over `Field<T>`: `rref` (first-nonzero pivot, tracks the transform so `T·M = rref(M)`), `solveOver(field, matrix, unknowns, rhs?): SolveReport<T>` with `{rank, unknowns, pivotColumns, kernel, determined, combination?, contradictions}`, `combineOver`, `describeKernel`, plus ℚ specialisations `solveExact`/`applyCombination` and `realifyRows`/`realifyRhs`. **Rank is decided, never thresholded.** Directly reusable for: a Berlekamp Q-matrix nullspace over 𝔽ₚ, a Ruppert/Gao nullspace, an LLL-free factor-recombination system, and any "which symmetric functions does this contour/loop pin down" question.
- **`kernel/exactRational.ts`** — `simplestRational(x: number): Frac` (continued-fraction convergent that round-trips through the double, with a checked dyadic fallback; subnormal-safe) and **`toExactRational(ast: Node, variable = "z"): {ok: true, value: {num: QiPoly, den: QiPoly}} | {ok: false, reason: string}`**. Accepts `num`, `const i`, `var === variable`, `neg`, `arith + − * / ^` with constant integer exponent; refuses π/e, other free vars, all `call` nodes. Guards: `MAX_DEGREE = 256`, `MAX_COEFFICIENT_BITS = 256`. **NOT reduced to lowest terms**, so removable singularities stay visible. **This is the AST → exact ℚ(i) polynomial extractor the new app should reuse as-is** (lift to `@cas/exact` or a new `@cas/exact/ast` subpath).
- **`kernel/exactResidue.ts`** — `rationalCandidate(z: Cx, tol = 1e-7): Gauss | null` via `snap()` (round to a short decimal at 0/1/2/3/4/6/9 digits, then `simplestRational`). Used as **guess-then-verify**: `if (!factor.eval(a).isZero()) continue; // the snap was wrong; reject rather than report`. This is the integer-rounding-with-certification idiom — the exact shape needed for rational-root testing and for promoting a floating root to an exact one.

### App-shaped (reusable ideas, not code)

- **`kernel/ratPi.ts`** — `class RatPi`: ℚ(i)(π) as a quotient of two `QiPoly` in lowest terms with monic denominator (π transcendental ⇒ a genuine field). `of/fromGauss/ZERO/ONE/add/sub/mul/inv/neg/isZero/equals/re()/im()`, `formatRatPi`. A template for "quotient field over `QiPoly`" — which is exactly `ℚ(i)[x]/(f)` if you swap the quotient for a modulus. **A Galois app's number field ℚ[x]/(f) should be written the same way but with `divmod`-by-`f` instead of a fraction.**
- **`kernel/exponent.ts`** (294 lines) — `class Exponent` + `jordanExponent(a: Frac, at: SqrtExt)` + `formatExponent`; the `e^{iaz}` exponent basis.
- **`kernel/unitRoot.ts`** (63 lines) — `unitRoot(k: bigint, m: bigint): SqrtExt | null` = `e^{i(k/m)π}` exactly, for the **only** `m ∈ {1,2,3,4,6}` where ℚ(i)(ζ) is a quadratic extension; `DENOMINATORS` read off the primitive table. Already a 3-consumer extraction inside the app. **Too narrow for a Galois app** (needs general ℚ(ζₙ)) but the honesty pattern is right.
- **`kernel/cyclotomic.ts`** (250 lines) — `asCyclotomic(q: QiPoly): CyclotomicForm | null` (recognises `bₙzⁿ + b₀` with unit-modulus roots, `−b₀/bₙ = e^{iψπ}`, guessed from floats then **verified exactly**), `cyclotomicRoots`, `cyclotomicWeightedSum`, `cyclotomicResidueSum`. Key idea worth stealing: **compute the symmetric sum over a Galois orbit without ever naming an individual root** — precisely what a Galois-resolvent app needs when degree > 4.
- **`kernel/sineForm.ts`** (485 lines) — `SineForm`, `denominatorOf`, `divideCarryingSine`, `formatSineForm`, `sineFormToNumber`, `sineArgument`; geometric-sum recogniser collapsing exponent sums to `sin(πa/n)`.
- **`kernel/logPart.ts`** (229 lines) — `factorise(n: bigint): ReadonlyMap<bigint,bigint> | null` (**integer factorisation by trial division, with a decline**), `class LogPart`, `LogTerm`, `formatLogPart`, `formatLogPower`. The `factorise` helper is the only integer-factorisation primitive in TypeScript in the repo.
- **`kernel/algebraic.ts`** (269 lines) — `splitRoots(F: QiPoly): SqrtExt[] | null` (degree 1; degree 2 by the quadratic formula via `sqrtOfGauss`; `a·z^{2k}+c` by recursive difference-of-squares), `evalSqrt`, `type RootFinder = (p: QiPoly) => readonly Cx[]`, `exactPolesOf(num, den, findRoots?)`, `weightedSum`. **This is the repo's only "solve a polynomial exactly" routine and it stops at quadratics + even binomials.**
- **`kernel/poles.ts`** (611 lines) — `findPoles(ast, c, a): PoleReport`. Exact path: `toExactRational` → `exactPolesOf` (with `numericRoots` injected as candidate finder) → `yunSquarefree` per factor → `rationalCandidate` snap → exact verify → `multiplicityAt`. Numeric path: Cauchy bound → Aberth-style seeds → Durand–Kerner (`tol 1e-13`, `maxIter 300`) → **`polish()` = 3 Newton steps** → `cluster()` (tolerance-based multiplicity, flagged `orderCertain: false`). Every claim carries a `@cas/rigor` `Certificate`. **This is the exact template for "find the roots of a ℚ polynomial and say honestly how well you know them."**
- No Bernoulli numbers anywhere except a passing mention in `kernel/mergedResidue.ts`.
- `kernel/winding.ts` (156 lines) — exact winding number by a homotopy argument with exact sign predicates (`kernel/exactPredicates.ts`, 65 lines). Directly reusable for certifying that a drawn loop encircles exactly one root.

---

## 3. `packages/core/src` + root finding + extended precision + tracking

### `poly.ts` (126 lines)

`type Poly<C> = C[]` ascending. `makePoly(alg: ComplexAlgebra<C>): PolyOps<C>` with:
`zero, one, variable, trim (|c| < 1e-14, keeps ≥ 1 term), add, neg, mul, scale(s: C), pow(n), linearPower(z0, m) = (z−z0)^m, eval (Horner), monic`.
**No division, no gcd, no derivative, no composition, no deflation.** Trimming is deliberately _not_ automatic (the σ⁻¹ root count is the degree).

### `durand-kerner.ts` (145 lines)

`makeDurandKerner<C>(alg)` → `(evalMonic, initialGuesses, opts) => DurandKernerResult<C> | null`.
`DurandKernerOptions = { tol = 1e-12, maxIter = 200, mode: "jacobi"|"seidel", onCoincident: "skip"|"nudge", nudgeEps = 1e-7, bailOnNonFinite = false }`.
`DurandKernerResult = { roots: C[], converged: boolean, iterations: number }`.
Careful details: NaN-sticky `maxDelta` so a NaN root can never report `converged`; `skipped` flag blocks false convergence on an unresolved coincidence. **Seeding, monic normalisation, polish and the degree-1/2 closed forms are explicitly caller-owned.**

### `rootsMonic.ts` (85 lines)

- `evalPolyHorner(p, z)`, `trimPoly(p, tol = 1e-12)`.
- `spiralSeeds(m)` — the classic `(0.4 + 0.9i)^i` geometric spiral (private).
- `rootsMonicClosure(pMonic, m, opts = {mode:"seidel", bailOnNonFinite:true}): ComplexTuple[] | null`.
- `rootsMonic(coeffs, residualTol = 1e-6): ComplexTuple[]` — trim, monic, solve, **filter by residual `|p(root)| ≤ residualTol`**. Residual _policy_ is caller-side by design (CD rejects the whole set; AP filters per root).
- **No Newton polish, no deflation, no multiplicity, no error/inclusion radius.**

### Newton polishing — where it does exist

- `packages/faber/src/roots.ts`: `polynomialRoots(coeffs: Cx[], opts: {maxIter = 200, tol = 1e-12, polish = true}): {roots, converged, iterations, degree}`. Trims at 1e-14, monic-normalises, **Cauchy bound `R = 1 + max|aₖ|`**, seeds on the circle of radius R at `2πj/d + 0.4`, runs `makeDurandKerner(objAlgebra)`, then **up to 8 Newton steps per root, stopping at `|step| < 1e-15`**. Returns `converged: false` rather than garbage at high degree.
- `apps/contour-integration/src/kernel/poles.ts`: private `polish(p, z0, steps = 3)`.
- `apps/argument-principle/src/singularities.ts`: `findSingularities(ast, region, target)`, `countInside(roots, inside)`.
- **Second-consumer rule is already satisfied twice over — `polishRoots` belongs in `@cas/core`.**

### `series.ts` (67 lines), `complex.ts` (336), `algebra.ts` (91)

`makeSeries(alg)` — truncated power-series multiply. `Complex` (`{re, im}` object algebra, default export, `Cx` type). `ComplexAlgebra<C>` contract + `objAlgebra` / `tupleAlgebra` (`ComplexTuple = [number, number]`). `sphere.ts` (stereographic), `lstsq.ts` (`lstsqHouseholder`), `dft.ts` (`dftOnCircle`), `geometry.ts` (`pointInPolygon`, `signedArea`, `orientCCW`), `format.ts` (`subscript`, `superscript`).

### Extended precision

- **`packages/gpu/src/glsl/df64Ref.ts`** is a full JS double-double library simulating GLSL float32 via `Math.fround`: private `twoSum`, `quickTwoSum`, Dekker `split` (overflow-safe, factor 2¹²+1), `twoProd`; exported `DF = [hi, lo]`, `df(x)`, `toNumber`, `dfNeg/dfAdd/dfSub/dfMul/dfDiv/dfSqrt/dfExp/dfLog/dfSinCos/dfAtan2`. Its GLSL twin is `df64.glsl.ts` + `complexDf64.glsl.ts`. **Note: it targets float32→~46–48 bits, i.e. it _extends single_ precision, not double.** A `double → ~106 bit` version would be a small edit (drop the `fround`s) and is exactly what a certified-root-disc computation would want.
- No BigInt-based floating point, no interval/ball arithmetic, no MPFR-style library anywhere. `grep -l bigint` over `packages/core|conformal|faber` returns nothing.

### Continuation / path-tracking of roots

- **`apps/complex-function-plotter/src/riemann/monodromy.ts` is the only true root-tracking engine in the repo** — see §9 below. `resampleClosedLoop`, `nearest`, `distinctSheets` are exported for the live-draw tracker in `render/plot.ts` (which mirrors the offline engine step for step, growing the 3-D lift as the loop is dragged).
- `apps/correspondences/src/orbitTree.ts` tracks correspondence branches but its header candidly says continuation is _exploratory_ and branches swap near cusps.
- `apps/complex-dynamics/src/render/matingEngine.ts` — Thurston pullback tracking postcritical orbits; "the full slow-mating homotopy remains deferred".
- `apps/contour-integration/src/kernel/branch/lift.ts` — sampled continuation along a contour, verified per-arc by a numeric probe, labelled `≤` not `=`.
- **No generic `trackRoots(p(t), t0 → t1)` predictor–corrector exists.** This is the main numerics gap for the new app.

---

## 4. `packages/expr` (AST, parser, compile, derivative, polynomial extraction)

Barrel `@cas/expr` re-exports `ast`, `lexer`, `parse`, `evaluate`, `glslFloat/compileF/compileEscape/CompileOptions`, `differentiate/newtonIteration`, `toLatex`, `fToRational`, `* as C` (complexJs). Subpaths: `@cas/expr/ast`, `/parser`, `/complex`, etc.

### AST (`ast.ts`, 382 lines)

```ts
type Node =
  | { kind: "num"; value: number }
  | { kind: "const"; name: "i" | "e" | "pi" | "tau" | "phi" | "γ" }
  | { kind: "var"; name: string }
  | { kind: "bool"; value: boolean }
  | { kind: "neg" | "not"; operand: Node }
  | { kind: "arith"; op: "+" | "-" | "*" | "/" | "^"; left: Node; right: Node }
  | { kind: "compare"; op: ">" | "<" | "=="; left: Node; right: Node }
  | { kind: "call"; name: string; args: Node[] }
  | { kind: "if"; cond; then; otherwise }
  | { kind: "assign"; name: string; value: Node }
  | { kind: "seq"; stmts: Node[] };
```

Helpers: `COMPLEX_FUNCTIONS` (33 names incl. `gamma`, `zeta`, `lambertw`, `factorial`), `BINARY_FUNCTIONS` (`arctan2`, `mod`), `ExprError`, `isFreeParameter`, **`freeParameters(node): string[]`** (sorted; excludes reserved formals `z`, `c`), `calledFunctions`, `substitute`, `referencesVar`, `nodeIsBool`, `constReal`.

### Parser (`parser.ts` 255, `lexer.ts` 134)

`parse(src: string): Node`. CindyScript subset: statement sequences with local assignment, `^` right-associative, identifiers (multi-char, so named parameters work), the six named constants, function calls, comparisons, `if`. **Number literals are JS `number` — there is no rational literal syntax `3/4` beyond ordinary division, and no exact/BigInt literal.**

### Compilation

- **JS**: `evaluate(...)`, `makeComplexFn`, `makeEscapeFn`, `getComplexFn(ast, params)`, `getEscapeFn` (closure-cached). `Params = Complex | Record<string, Complex>`.
- **GLSL**: `compileF(ast, name = "fFn", opts?: {params?: readonly string[]}): string` → `cvec <name>(cvec z, cvec c) { … }`; `compileEscape(ast, opts?)` → `bool escapeFn(cvec z, cvec c) { … }`; `glslFloat(n)`. Named parameters alias from `uParam_<name>` uniforms (legacy: sole `a` → `uA`). Built via `vec_(u.x, u.y)` so it stays valid in the df64 build.
- `latex.ts`: `toLatex(node)`.

### Symbolic derivative

`derivative.ts`: `differentiate(node, v = "z"): Node` — full product/quotient/chain rules with simplification helpers; throws `ExprError` on non-differentiable nodes. `newtonIteration(fAst): {iter: Node, escape: Node}` builds `z − f/f′` and `|f| < 3e-4`.

### Polynomial extraction from an AST

- **`fToRational(ast, c: Complex, a: Complex): {num: Poly, den: Poly} | null`** (`rational.ts`, 188 lines) — evaluates the AST over ℂ(z) with **floating** `Complex` coefficients. `z ↦ z/1`; any z-independent subtree is evaluated numerically (so `sqrt(c)` works); `+ − × /` rational arithmetic; `^` only for constant integer exponents. Returns null for `sin(z)`, `conjugate(z)`, `z^c`. `MAX_POLY_LEN = 1_000_001`. Not reduced to lowest terms. Sparse-aware `pMul`.
- Grep for `isPolynomial` / `degree(` / `coeff(` inside `packages/expr`: **no `isPolynomial` predicate, no degree/coefficient API**. `fToRational` with `den.length === 1` is the de-facto polynomial test.
- **The exact counterpart is `toExactRational` (§2), and the plotter's `parseImplicitExact` (§9) generalises it to two variables.** Both are app-local today.

---

## 5. `packages/rigor` — full public API (25-line barrel, 227 lines total)

```ts
// level.ts
type Level = "=" | "≤" | "≥" | "≈" | "?" | "⚠";
const LEVELS: readonly Level[];
function meet(a: Level, b: Level): Level; // ⚠ absorbs; "?" beats "="; meet("≤","≥") === "≈"
function meetAll(levels: readonly Level[]): Level; // EMPTY LIST ⇒ "?"
function describeLevel(level: Level): string; // "exact" | "rigorous upper bound" | "estimate — not proved" | …

// certificate.ts  — BRANDED
declare const CERTIFICATE_BRAND: unique symbol;
interface Step {
  readonly ok: boolean;
  readonly text: string;
}
interface CertificateOptions {
  readonly restriction?: string;
  readonly provenance?: readonly Step[];
}
interface Certificate {
  readonly [CERTIFICATE_BRAND]: true;
  level;
  claim;
  method;
  restriction?;
  provenance;
}
function exact(claim, method, opts?): Certificate;
function bound(dir: "≤" | "≥", claim, method, opts?): Certificate;
function estimate(claim, method, opts?): Certificate;
function unknown(claim, method = "not attempted", opts?): Certificate;
function refuse(claim, reason, opts?): Certificate;

// verdict.ts — BRANDED
declare const VERDICT_BRAND: unique symbol;
interface Verdict {
  readonly [VERDICT_BRAND]: true;
  level;
  certificates;
  restrictions: readonly string[];
}
function assembleVerdict(certificates: readonly Certificate[]): Verdict; // the ONLY Verdict producer
function mayReportValue(v: Verdict): boolean; // false iff level === "⚠"
function failures(v: Verdict): readonly string[];
```

Design intent: **make `=` impossible to write by hand.** A `Certificate` can only come from the five constructors; a `Verdict` only from `assembleVerdict`; the level is the _meet_ over evidence, never chosen. `restriction` must be rendered **at the point of display**, not behind a disclosure.

**UI rendering**: there is no renderer in the package. Apps render the glyph + `describeLevel` inline. Example prose from `apps/complex-function-plotter/src/main.ts:1970`: `"≈ Uncertified estimate: the permutations are analytic continuation (RISKS §3). The Riemann–Hurwitz formula and its parity/bound check are exact."` — i.e. a badge glyph plus a one-line justification, with exact sub-claims called out separately. Contour-integration's `shell/cards/` is the richest consumer (certificate lists with provenance steps).

---

## 6. `packages/gpu` — domain colouring, colormaps, masks, markers

`exports`: `.` → `src/index.ts` (df64Ref + glsl barrel + shader), `./df64`, `./glsl`, `./shader`, `./colormap`, `./mask`, `./dual-backend`. Source-consumed (no dist).

### Building a domain-colouring program from a GLSL expression

1. `compileF(ast, "fFn", { params })` from `@cas/expr` → a GLSL function string.
2. Concatenate the stdlib + coloring core. The canonical assembly is `apps/complex-function-plotter/src/render/colorShader.ts`:
   `buildFragmentShader(fGlsl: string, paramNames: readonly string[] = []): string` → `#version 300 es` + `COMPLEX_SINGLE_GLSL` + `COMPLEX_DERIVED_GLSL` + `PLANE_FROM_FRAG_GLSL` + uniforms + `uniform vec2 uParam_<n>;` per param + `PHASE_COLORING_GLSL` + `${fGlsl}` + a `main()` that does `cvec z = planeFromFrag(gl_FragCoord.xy, uCenter, uHalfSpan, uResolution); fragColor = vec4(colorAt(fFn(z, vec_(0,0))), 1);`
3. `createProgram(gl, vsSource, fsSource)` from `@cas/gpu/shader` (plus `compileShader`, `linkProgram`). Vertex shader = `FULLSCREEN_VERTEX_GLSL`.

GLSL exports (`@cas/gpu/glsl`): `DF64_GLSL`, `COMPLEX_SINGLE_GLSL`, `COMPLEX_DF64_GLSL`, `COMPLEX_DERIVED_GLSL`, `FULLSCREEN_VERTEX_GLSL`, `HSV2RGB_GLSL`, `PLANE_FROM_FRAG_GLSL`, `PHASE_COLORING_GLSL`.

`PHASE_COLORING_GLSL` provides `vec3 colorAt(cvec w)` driven by uniforms: `uPhaseLUT` (sampler2D atlas), `uPhaseRow`, `uModulus` (0 constant, 1 linear, 2 rational, 3 log, 4 log-log), `uModScale`, `uEnhance` (0 none, 1 modulus rings, 2 phase sectors, 3 conformal proportional grid, 4 polar chessboard, 5 Re/Im grid), `uSectors`, `uCrisp`, `uHueShift`, `uHueSign`, `uCvd` (0/protan/deutan/tritan), `uUncertainty`, `uLevelAbs`, `uLevelArgOn`, `uLevelArg`. `fwidth`-antialiased gridlines.

### Colormaps

- `@cas/gpu/colormap`: `type RGB`, `type ColorStop = {t, color}`, `sampleStops(stops, t)`, `buildGradientLUT(stops, width = 256): Uint8Array`, `buildColormapLUT(colors, width = 256)`, `makeColormapTexture(gl, colors, …): WebGLTexture`.
- The **cyclic phase colormaps** live app-side in `apps/complex-function-plotter/src/render/colormaps.ts`: `oklchCyclic`, `hsvCyclic`, `twilightCyclic`, `cvdSafeCyclic`, `dlmfWarped`, `dlmfQuadrant`, with `COLORMAPS`, `bakeRow(cm, width)`, `bakeAtlas(width): Atlas`. **These are a third-consumer extraction waiting to happen** (the new app would be the third).

### Masks

`@cas/gpu/mask`: `type Point`, `MaskFrame {center, halfExtent}`, `PolygonMask extends MaskFrame {texture: WebGLTexture}`, `PolygonMaskOptions {padFactor = 4, size, conservativeOmega?: "inside"|"outside"}`, `polygonMaskFrame(polygon, padFactor)`, **`buildPolygonMaskTexture(gl, polygon, options): PolygonMask`**.

### Point markers / many small discs

**Nothing on the GPU.** Every app draws markers on a 2D overlay canvas:

- `apps/complex-function-plotter/src/ui/markers.ts`: `drawMarkers(canvas, view, cssW, cssH, sings, crits)` — hollow circles (zeros), `×` (poles), filled diamonds (critical points), order labels for multiplicity > 1, every glyph with a dark halo (`stroke()` helper draws twice: 3.5px black then 1.75px white). **Directly reusable pattern for drawing n roots.**
- `packages/ui/src/canvasOverlay.ts`: `drawDirectionTicks(ctx, toPx, pts, opts)` for orientation arrows along a polyline.
- For "many small discs" at high count, an instanced/point-sprite pass would be new work; at n ≤ a few hundred roots the 2D canvas path is fine.

---

## 7. `packages/ui` — shell primitives and the worker-offload pattern

```ts
// mountCanvas.ts
interface MountCanvasOptions { /* container-driven; see src:113 */ }
interface MountedCanvas { /* src:127 */ }
function mountCanvas(container: HTMLElement, opts: MountCanvasOptions): MountedCanvas;
interface AttachCanvasOptions { role: "application"|"img"; label: string; onKey?(action: CanvasKeyAction, ev: KeyboardEvent): void; /* + liveHost */ }
interface AttachedCanvas { /* src:192 */ }
function attachCanvasA11y(overlay: HTMLCanvasElement, opts: AttachCanvasOptions): AttachedCanvas;
type CanvasKeyAction;   // pan/zoom/select keyboard verbs, routed to the app

// fatalBoundary.ts
interface FatalBoundaryOptions { /* src:16 */ }
function showFatalBanner(message: string, opts?: FatalBoundaryOptions): void;
function runWithFatalBoundary(init: () => void | Promise<void>, opts?: FatalBoundaryOptions): void;

// computeClient.ts
interface ComputeClientOptions<Req, Res> {
  compute: (req: Req) => Res;                    // REQUIRED synchronous fallback / source of truth
  worker?: () => Worker;
  toMessage?: (req: Req, reqId: number) => unknown;
  fromMessage?: (data: unknown) => { reqId: number; result?: Res; error?: string };
  onBusy?: (busy: boolean) => void;
  onError?: (message: string) => void;
  deferSync?: boolean;                           // default true — lets the busy state paint first
}
interface ComputeClient<Req, Res> { request(req, cb): void; busy(): boolean; cancel(): void; dispose(): void }
function createComputeClient<Req, Res>(opts): ComputeClient<Req, Res>;

// canvasOverlay.ts
function drawDirectionTicks(ctx, toPx: (w: Vec2) => [number, number], pts: readonly Vec2[], opts: DirectionTicksOptions): void;
```

Behaviour: single-in-flight lane with **coalescing** (a request arriving mid-flight is queued, only the latest paints), stale-response drop, worker-death recovery (re-runs the in-flight request on the main thread), busy hook.

**The one real consumer — the pattern to copy:** `apps/complex-dynamics/src/render/juliaMetricsClient.ts` + `juliaMetrics.worker.ts`.

- `JuliaMetricsRequest = Omit<JuliaMetricsMessage, "reqId">` — **the request carries `fSource`/`escSource` as strings and the worker re-`parse`s them**, because ASTs don't survive structured clone cleanly. Do the same for a polynomial: send coefficients as strings/numbers, not `Frac` objects (BigInt _does_ clone, but `Frac`'s class identity does not).
- `runSync(req)` is the same function the worker calls.
- `worker: () => new Worker(new URL("./x.worker.ts", import.meta.url), { type: "module" })` — Vite resolves this.
- `deferSync: false` for headless parity in tests.
- `onBusy(false)` (idle transition), **not** result delivery, is what releases `settled()` waiters — because coalescing means a delivery can answer a stale question.

For the new app the natural worker boundary is: **exact factorisation / Galois resolvent evaluation off-thread; root-finding + animation on the main thread.**

---

## 8. Animation of points along paths

- **`apps/complex-function-plotter/src/ui/animate.ts` (the best fit).**
  `interface AnimConfig { t0, t1, speed, loop }`; `DEFAULT_ANIM = { t0: 0, t1: 2π, speed: 1, loop: true }`.
  **`stepT(t, dt, cfg): { t: number; ended: boolean }`** — pure, unit-tested; wraps into `[t0,t1)` when looping, clamps + reports `ended` otherwise; a non-positive span is a no-op reporting `ended`.
  `interface AnimHooks { getT(): number; setT(t: number, committed: boolean): void }` — **`committed: false` during play (draft render), `true` on pause/scrub-release (full render + instrument recompute)**. Exactly the distinction a root-permutation animation wants: cheap per-frame root update while moving, full monodromy/group recompute on settle.
  `createAnimator(root: HTMLElement, config: AnimConfig, hooks: AnimHooks): Animator` with `sync()`, `stop()`, `isPlaying()`. Wires play/pause button, scrubber (`input` = preview, `change` = settle), speed and loop controls found by class inside `root`. `frame(ts)` computes `dt` from timestamps, calls `stepT`, `hooks.setT(t, false)`, and on `ended` pauses + re-sets committed.
  Tests: `apps/complex-function-plotter/test/animate.test.ts`.
- **`apps/contour-integration/src/shell/sweep.ts` (easing).** `planSweep(p: Param, opts?: {reducedMotion?}): SweepPlan | null`, `sweepValueAt(plan, tMs): number` (**ease-out** over ~3 s, applied in the parameter's own scale — log parameters eased in log space), `createSweep(plan): SweepDriver`, plus an inverse of `sweepValueAt`. Honours `prefers-reduced-motion`. Notable correctness detail: a frame whose eased value passes a rung commits **the rung**, not the eased value.
- `apps/correspondences/src/main.ts` deliberately uses **`setTimeout`-chunked** rendering (`chunk`, `chunkImageBands`) rather than rAF, because rAF is suspended in hidden tabs — relevant if the new app needs a long background solve.
- `apps/complex-dynamics/src/ui/recorder.ts` — canvas-capture / MediaStream recording of an animation, if the new app wants to export a GIF/WebM of a root permutation.
- **No easing library, no tween/keyframe abstraction, no path-following interpolator exists.** Interpolating a root's position along a computed continuation path is `monodromy.paths[k]` + linear interpolation by index — trivial to write.

---

## 9. The pre-existing Galois-adjacent stack (`apps/complex-function-plotter/src/riemann/`, 2582 lines)

This was not in the brief but is the most important finding for the new app.

- **`monodromy.ts` (244)** — `distinctSheets(values)` (finite, deterministically ordered by `arg` then `|·|`, near-duplicate-clustered at `max(1e-7, 1e-3·maxAbs)`), `nearest(cand, w): {idx, d}`, `resampleClosedLoop(loop, samples)` (arc-length resample, start point appended so continuation returns home), and **`computeMonodromy(sheetsAt: (z: Complex) => Complex[], loop: readonly Complex[], opts?: {samples = 256, expected?}): MonodromyResult | null`**.
  `MonodromyResult = { sheetCount, permutation: number[], cycles: number[][], isPermutation, gapMin, maxJumpRatio, lowConfidence, samples, paths: {z, w}[][] }`.
  Robustness: censuses every loop point once, picks a modal (or caller-`expected`) sheet count `N`, rotates to a clean start point, tracks by nearest-match, gauges separation on the **tracked** sheets, flags `lowConfidence` when `!isPermutation || countDrift || gapMin ≤ 1e-6 || maxJumpRatio > 0.5`. **`paths` is exactly the per-root animation data the new app needs.**
- **`permGroup.ts` (161)** — `type Perm = number[]`, `identityPerm(n)`, `compose(a,b)` (`a[b[i]]`), `inverse`, `isIdentity`, `cycles(p)` (incl. fixed points), `cycleCount`, **`generatedGroup(gens, n, cap = 100_000): {order, capped, transitive}`** (BFS closure), `isTransitive(gens, n)` (orbit of 0 under gens and inverses), `riemannHurwitzGenus(cycleCounts, n): {genus, ramification, consistent}`, **`namedGroup(order, n, transitive): string | null`** → `"trivial"`, `"Cₙ (cyclic)"`, `"Sₙ (symmetric)"`, `"Aₙ (alternating)"`, `"Dₙ (dihedral)"`, else null.
  **Gap for a Galois app:** no group _classification_ beyond those five families (no transitive-group tables T(n,k), no Sym/Alt test by parity of generators, no subgroup lattice, no resolvent-based discrimination).
- **`generatorLoop.ts` (112)** — `generatorLoopAround(center, radius, n = 64)`, `generatorRadius(index, branchPts, viewSpan): number | null` (`min(0.4·nearest-neighbour, 0.25·viewSpan)`, null if `< 0.03·viewSpan`), `commonBasePoint(branchPts, viewSpan)` (placed below the cluster so every lasso shares a sheet labelling), **`lassoLoop(base, center, radius, arcN = 48)`** (out-and-back so lassos compose), `enclosingLoop(branchPts, viewSpan, n = 96)` (for σ_∞). **This is a complete π₁-generator construction — precisely what "drag a loop around a root" needs.**
- **`permDiagram.ts` (106)** — `DIAGRAM_HEIGHT`, `permDiagramWidth(n)`, `sheetColorCss(k, n)` (hue law `hsv(k/n, 0.85, 1)`, shared with the 3-D lift so a diagram node and its surface arc match), plus a canvas draw of `n` nodes with bowed arrows for moved sheets.
- **`implicitExact.ts` (55)** — `parseImplicitExact(ast): {coeffs: QiPoly[], degreeW} | null` (the bivariate exact extractor, built on an `exactScalar: Scalar<Gauss>` instance and `expandBivariate` from `implicitPoly.ts`), and **`exactBranchLocus(ast): Complex[] | null`** = `rootsMonic(discriminant(coeffs).coeffs.map(toTuple))`. Honest labelling: the discriminant's **zero set is `=`**, the root **coordinates are `≈`**. Declines on any float coefficient.
- **`implicitPoly.ts` (233)** — `interface Scalar<T> { zero, one, add, mul, neg, isZero, literal(x): T|null, constant(name): T|null, reciprocal(a): T|null }`, `expandBivariate(ast, scalar)`, `degreeWOf`. **A second generic-field abstraction, parallel to `families/field.ts` — the two should be unified when either is lifted.**
- `branchPoints.ts` (163) — `findBranchPoints(sheetsAt, box, opts?: {grid = 40, maxPoints = 24, mergeFraction = 0.12})`, the `≈` scan fallback (local minima of sheet separation, clustered, refined by 8-direction descent).
- `winding.ts` (31) — `windingNumber`, exact homotopy class in ℂ∖{center}, used to verify a generator loop is clean.
- `algebraicCurve.ts` (303), `inverse.ts` (505), `curveMesh.ts` (231), `pickMesh.ts` (379) — the sheet enumerators and 3-D machinery.
- Tests: `test/monodromy.test.ts`, `test/branchPoints.test.ts`, `test/implicit-exact.test.ts`.

---

## 10. Other ready-to-use suite infrastructure

- **Permalink**: `@cas/interchange` — `encodeViewState<S>(app, state)` / `decodeViewState<S>(hash)` / `VIEWSTATE_VERSION = 1`, wire format `#vs=<url-safe-base64-json>` of `{v, app, state}`. Forward-compat contract: validates only the envelope, **preserves unknown fields in `state`**, never rejects a higher `v`. Distinct hash key from the map-envelope codec's `#s=` (`encodeLink`/`decodeLink`). Also `validateEnvelope`, `hasForbiddenKey`, `mapSpecToExpr` (`coeffExpr`, `polyExpr`, `rationalExpr`, `laurentExpr`), and `goldens.ts` cross-app pinned artifacts.
- **PNG export**: `@cas/export` — `PNG_SIGNATURE`, `crc32(bytes)`, `pngChunk(type, data)`, **`injectPngText(png, entries: Record<string,string>)`**, `readPngText(png)`. The "a figure carries its own recipe" mechanism: splice the permalink + params as `tEXt` before `IEND`, pixels untouched.
- **Draggable handles**: no shared primitive. Closest working example is `apps/2d-electrostatics/src/interaction.ts` — `attachInteraction(...)` with a private `hitTest(state, size, p): Id | null` and `clampHalfSpan`; pointer events + world↔screen mapping are re-rolled per app (also `apps/argument-principle/src/main.ts`, `apps/complex-dynamics/src/transforms.ts`). **A `@cas/ui` draggable-handle primitive would be a genuine ADR-0007 candidate and the new app makes it a third+ consumer.**
- **ADR-0007** (`docs/DECISIONS.md`): "incremental extraction driven by real need" — the second-consumer rule. ADR-0018 records the one deliberate break (extraction _ahead_ of a second consumer). The follow-on chain (0012 mat4, 0014 dynamics, 0015 poly+format, 0016 png+glsl) is the precedent for lifting `Field<T>`/`linear.ts`/`toExactRational`.
- `docs/RISKS.md` §3 — **analytic continuation is never certified**; every monodromy result must be `≈` and quarantined from badges/permalinks/exports. This constrains any Galois-group-by-monodromy claim.

---

## 11. Needed by the new app → exists where / missing

| Need                                                              | Status                                    | Where                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Exact ℚ polynomial arithmetic**                                 | ✅ **exists** (over ℚ(i), a superset)     | `packages/exact/src/qiPoly.ts` — `QiPoly` add/sub/mul/pow/divmod/divExact/gcd/extendedGcd/invMod/eval/derivative/`shift`/`monic`/`squarefreePart`; `gaussian.ts` `Frac`/`Gauss`. Missing only: composition `p∘q`, deflation, mod-`f` quotient-ring wrapper.                                                                                                                                                                                                                                                                                                 |
| **Factorisation over ℤ / ℚ**                                      | ⚠️ **exists but unreachable**             | `apps/quadrature-domains/app/sym/sym-core.mjs` — `_qiFactor` (shifted norm + **Berlekamp–Zassenhaus**), `_factorOverQ`, `factor`, `mvHenselLift`, `henselFactorBivariate`. Untyped `.mjs` on `globalThis.QD.Sym`, not importable from a TS app. **Nothing in `packages/`.** → port to `@cas/exact` (~250 lines).                                                                                                                                                                                                                                            |
| **mod-p factorisation / finite-field arithmetic**                 | ⚠️ **exists but unreachable**             | Same file, lines ~2048–2170: `_modInv`, `_pmDivModF`, `_pmPowMod`, `_ddf`, `_edf`, **`_czFactor` (Cantor–Zassenhaus)**, `_bezout`. **Zero hits anywhere in `packages/**/\*.ts`.\*\* → port (~120 lines).                                                                                                                                                                                                                                                                                                                                                    |
| **Discriminant**                                                  | ✅ **exists**                             | `packages/exact/src/resultant.ts` `discriminant(coeffs: QiPoly[])` — classical sign/magnitude; consumed by `riemann/implicitExact.ts` `exactBranchLocus`. For a _univariate_ ℚ poly wrap the coefficients as constant `QiPoly`s. `reducedDiscriminant` also in QD's `Sym`.                                                                                                                                                                                                                                                                                  |
| **Resultant**                                                     | ✅ **exists**                             | `packages/exact/src/resultant.ts` `resultant(A, B)` + `bareissDet` + `primitivePoly`/`integerPrimitive`. (Multivariate `resultant` also in QD's `Sym`.)                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Numeric roots with polishing**                                  | 🟡 **roots yes, polish is app-local**     | `@cas/core` `rootsMonic` / `rootsMonicClosure` / `makeDurandKerner` (seidel, NaN-sticky, residual filter) — **no polish**. Newton polish exists in `packages/faber/src/roots.ts` `polynomialRoots({polish})` (Cauchy bound + circle seeds + 8 Newton steps) and `apps/contour-integration/.../poles.ts` `polish()` (3 steps). Also `cauchyBound`, Aberth-style `seeds`, `cluster` for multiplicity. → **lift `polishRoots` into `@cas/core`** (second-consumer rule already satisfied).                                                                     |
| **Certified root discs** (Smale α/γ, Gerschgorin, Weyl, Krawczyk) | ❌ **missing entirely**                   | The nearest things: `@cas/rigor` labels; `piBounds`' `RationalInterval`; `poles.ts` residual + cluster heuristics with `orderCertain: false`; QD's **`schurCohn`/`unitCircleRootCount`** (certified counts in a disc — a _count_, not a radius) and `realRootIsolate` (Sturm brackets on **ℝ** only). No interval/ball arithmetic, no double-double-based error bound. **New work.**                                                                                                                                                                        |
| **Root path tracking / continuation**                             | 🟡 **one engine, app-local, uncertified** | `apps/complex-function-plotter/src/riemann/monodromy.ts` `computeMonodromy` — nearest-match continuation, `paths` per sheet, `gapMin`/`maxJumpRatio`/`lowConfidence`; `resampleClosedLoop`, `nearest`, `distinctSheets` exported for the live tracker in `render/plot.ts`. Plus `generatorLoop.ts` for π₁ generators. **No predictor–corrector, no adaptive step, no certification** (RISKS §3 forbids claiming one). → lift to a package, optionally upgrade to Newton-corrector tracking.                                                                 |
| **AST → polynomial**                                              | ✅ **exists twice**                       | **Exact:** `apps/contour-integration/src/kernel/exactRational.ts` `toExactRational(ast, variable) → {num: QiPoly, den: QiPoly}` + `simplestRational`. **Bivariate exact:** `riemann/implicitExact.ts` `parseImplicitExact` + `implicitPoly.ts` `expandBivariate(ast, Scalar<T>)`. **Float:** `packages/expr/src/rational.ts` `fToRational(ast, c, a)`. Parser/AST: `@cas/expr` `parse`, `Node`, `freeParameters`, `substitute`, `differentiate`. **No `isPolynomial`/`degree`/`coeff` API in `@cas/expr`.** → lift `toExactRational` into `@cas/exact`.     |
| **GPU domain colouring**                                          | ✅ **exists**                             | `@cas/gpu/glsl` `PHASE_COLORING_GLSL` (`colorAt`), `COMPLEX_SINGLE_GLSL`, `COMPLEX_DF64_GLSL`, `PLANE_FROM_FRAG_GLSL`, `FULLSCREEN_VERTEX_GLSL`; `@cas/gpu/shader` `createProgram`; `@cas/gpu/colormap` `makeColormapTexture`/`buildColormapLUT`; assembly template `apps/complex-function-plotter/src/render/colorShader.ts` `buildFragmentShader(fGlsl, paramNames)`. Cyclic colormaps (`oklchCyclic`, `twilightCyclic`, `cvdSafeCyclic`, `dlmf*`) + `bakeAtlas` are app-local → third-consumer extraction. `buildPolygonMaskTexture` in `@cas/gpu/mask`. |
| **Draggable point handles**                                       | 🟡 **patterns, no primitive**             | `apps/2d-electrostatics/src/interaction.ts` `attachInteraction` + `hitTest`; `apps/argument-principle/src/main.ts` (pin/path/move modes); `apps/complex-dynamics/src/transforms.ts` (world↔screen). `@cas/ui` `attachCanvasA11y` gives keyboard verbs but no drag model. **New shared primitive recommended.**                                                                                                                                                                                                                                              |
| **Animation loop**                                                | ✅ **exists**                             | `apps/complex-function-plotter/src/ui/animate.ts` — `stepT(t, dt, cfg)` (pure, tested), `createAnimator(root, config, hooks)`, `AnimConfig`/`AnimHooks`/`Animator`, draft-vs-committed render split. Easing: `apps/contour-integration/src/shell/sweep.ts` `planSweep`/`sweepValueAt`/`createSweep` (ease-out, reduced-motion aware). Chunked non-rAF alternative: `apps/correspondences/src/main.ts` `chunk`. Recording: `apps/complex-dynamics/src/ui/recorder.ts`. Both app-local → extractable.                                                         |
| **Permalink codec**                                               | ✅ **exists**                             | `@cas/interchange` `encodeViewState` / `decodeViewState` / `VIEWSTATE_VERSION`, `#vs=` base64url, forward-compat (preserves unknown state fields, accepts higher `v`). Plus `encodeLink`/`decodeLink` + `validateEnvelope` for cross-app map hand-off.                                                                                                                                                                                                                                                                                                      |
| **PNG export**                                                    | ✅ **exists**                             | `@cas/export` `injectPngText(png, entries)`, `readPngText(png)`, `pngChunk`, `crc32`, `PNG_SIGNATURE`. App example: `apps/complex-function-plotter/src/render/exportImage.ts`.                                                                                                                                                                                                                                                                                                                                                                              |
| **Rigor labels**                                                  | ✅ **exists**                             | `@cas/rigor` — branded `Certificate` (`exact`/`bound`/`estimate`/`unknown`/`refuse` + `restriction` + `provenance: Step[]`), branded `Verdict` (`assembleVerdict` only), `meet`/`meetAll`/`describeLevel`, `mayReportValue`, `failures`. No renderer — apps render glyph + `describeLevel` + restrictions inline (richest example: `apps/contour-integration/src/shell/cards/`).                                                                                                                                                                            |

### Recommended extraction order (ADR-0007-justified by this app as second/third consumer)

1. `toExactRational` + `simplestRational` → `@cas/exact` (AST→ℚ(i) poly). Zero new algorithms.
2. `Field<T>` + `linear.ts` (`solveOver`, rank/kernel/contradiction) → `@cas/exact` or `@cas/core`. Unify with `implicitPoly.ts`'s `Scalar<T>`.
3. `polishRoots` (Newton) + `cauchyBound` + Aberth `seeds` + `cluster` → `@cas/core`.
4. `permGroup.ts` + `permDiagram.ts` + `generatorLoop.ts` + `monodromy.ts` → a new `@cas/monodromy` (or `@cas/perm`).
5. **Port the 𝔽ₚ layer + `_qiFactor` from `sym-core.mjs` into `@cas/exact` as TS over `Gauss`/`QiPoly`** — the one piece of genuinely new engineering, and the gate for everything Galois-specific (mod-p Frobenius cycle types → Chebotarev-style group identification, resolvent factorisation, rational-root tests).
6. New work with no precedent: certified root discs (needs interval/ball arithmetic, or a double-precision variant of `df64Ref`), predictor–corrector root tracking, transitive-group classification beyond Cₙ/Dₙ/Aₙ/Sₙ, and a shared draggable-handle primitive.
