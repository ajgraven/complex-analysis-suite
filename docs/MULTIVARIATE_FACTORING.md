# Multivariate (bivariate-first) polynomial factorization over ℚ(i) — design plan

> **Status: IN PROGRESS.** Phase 0 (spike) ✅ validated; Phase 1 (infra) ✅ merged; Phase 2 (absolute factor *count* + irreducibility) ✅ merged. Roadmap item #19 (the "genuine multivariate factorizer" that
> several done tiers were capped by). Decisions recorded (2026-07-13): **(a) Gao's PDE / linear-algebra
> method first** (it plays to this engine's linear-algebra strength and deletes the two most bug-prone
> subsystems); **(b) the classical Zassenhaus–Hensel path ships as a Phase-5 independent cross-check
> oracle** (differential testing, per this project's established dual-backend / independent-oracle culture).
> Scope: **bivariate first**; general n-variate is a later, separately-scoped extension.

This document is the implementable brief. It is grounded in a code inventory of `apps/quadrature-domains/
app/sym-core.mjs` and a cited literature survey (see §11). Honest-labeling (CLAUDE.md): a factorization is
exact (`=`); the `complete` flag must stay truthful; anything past the degree cap fails closed with the
standard "export to CAS" error.

---

## 1. What it unblocks

`factor` (`sym-core.mjs`, `factor`/`_factorRec`) currently applies only three methods: peel **monomial**
factors, split a **variable-disjoint** product `f(x)·g(y)` (`_separableSplit`), and fully factor a
**truly-univariate** remainder over ℚ(i) (`_qiFactor` → `_factorOverQ`, Berlekamp–Zassenhaus + Hensel +
recombine). Anything genuinely bivariate that is none of these — `x²−y²`, `x²+y²`, a reducible boundary
curve `Q(z,z̄)` — is pushed back **whole and mislabeled "irreducible."**

A genuine bivariate factorizer upgrades every consumer whose quality is capped by this:

- **`minimalPrimes` (#12)** — the honest `complete` flag is limited by the ℚ(i) factorizer's univariate/
  monomial/variable-disjoint reach; genuine bivariate factoring makes more components certifiable.
- **`curveGenus` singular cases (#15)** — deeper singular decomposition.
- **`triangularDecomposition` (#13)** — regular chains per genuine irreducible component.
- **`discriminantVariety` (#14)** — factoring the boundary polynomial into its true components.
- **#19 deeper prime splits.**

It is also a first-class capability in its own right: factor `Q(z,z̄)`, correspondence curves, and
resultant/discriminant outputs into their irreducible pieces.

## 2. Scope — bivariate first (the key decision)

Every real use case in this suite is a **plane curve**: the QD boundary polynomial `Q(z,z̄)`, the
correspondence curve `C(w,z̄)`, a generic `f(x,y)`. Bivariate factorization is dramatically simpler and more
robust than general n-variate — a single-variable lift; the leading-coefficient "polynomial" is univariate
in `y`; recombination is bounded by the small `x`-degree. General n-variate (recursive reduction to
bivariate, or full multivariate machinery) is a **separate, later** extension, flagged and not in v1.

The **ℚ(i)** angle is essential, not incidental (a ℚ(i)-factorizer is strictly more than a ℚ-factorizer):

- `x² + 1` is irreducible over ℚ but `= (x − i)(x + i)` over ℚ(i).
- `x⁴ + 1` (Φ₈) is irreducible over ℚ but `= (x² − i)(x² + i)` over ℚ(i) — **two irreducible quadratics**.
  It does *not* split further over ℚ(i) (that needs `√i = ±(1+i)/√2`, i.e. `√2 ∉ ℚ(i)`).

That last one is a clean three-way regression fixture: **ℚ says irreducible, ℚ(i) says two quadratics,
ℂ says four linears.** The engine's univariate ℚ(i) factorizer `_qiFactor` (Trager-norm method) already
handles this and is the shared base case for both algorithms below.

## 3. Build-on inventory (what already exists in `sym-core.mjs`)

The genuinely-new code is small in either design; the engine is overwhelmingly a **linear-algebra engine**
(Bareiss, FGLM, Hermite, Möller–Stetter, `_gaussSolveG`) — the fact that drives the Gao-first decision.

| Need | Existing primitive (approx. line) |
|---|---|
| evaluation homomorphism `y = b` | `MPoly.subst({y: MPoly.constant(b)})` (`:299`) |
| "poly in `x` over ℚ(i)[y]" view | `coeffsIn` / `degreeIn` / `_lcInV` (`:381 / :361 / :961`) |
| bad-point / squarefree tests | `discriminant` (`:629`), `resultant` (`:592`), `univariateGCD` (`:763`), `squareFreePart` (`:766`) |
| univariate ℚ(i) factorization (base case) | `_qiFactor` (`:1597`) → `_factorOverQ` (`:1560`) — Trager norm + Berlekamp–Zassenhaus + Hensel + recombine |
| exact ℚ(i) linear algebra | Bareiss `mpolyDet` (`:548`), `_gaussSolveG` (`:1186`), `_gaussianMatrixRank` (#18) |
| characteristic polynomial of a ℚ(i) matrix | `charPolyByTraces` (`:3014`) |
| exact division / trial division / mod-`f` reduction | `mpolyExactDiv` (`:525`), `mpolyDivMod` |
| variable-disjoint fast-path | `_separableSplit` (`:707`) |

**Genuinely-new for Gao (Option B):** the Ruppert linear-system assembly, an exact ℚ(i) **nullspace-basis**
routine (a small extension of `_gaussianMatrixRank` to emit kernel vectors), and the factor-extraction GCD.
**Genuinely-new for the Hensel oracle (Option A, Phase 5):** the single-variable Hensel lift recurrence, the
leading-coefficient distribution, and the recombination driver.

## 4. The two algorithms and the decision

**Option A — classical bivariate Zassenhaus–Hensel.** Evaluate `y = b`, factor `f(x,b)` over ℚ(i),
**Hensel-lift** the single variable `y` back up, **recombine** subsets by trial division. Maximal reuse of
the univariate factorizer; the most documented path. But the three net-new subsystems — the bivariate
Hensel lift, leading-coefficient distribution (Wang's "distribute-LC" trick), and recombination — are where
bugs hide, and the engine has *no* second-variable-Hensel machinery today.

**Option B — Gao 2003 (PDE / linear algebra).** Solve one homogeneous linear system (Ruppert's closedness
condition); its **nullspace dimension *is* the number of absolutely-irreducible factors**, and each factor
drops out via a small characteristic polynomial + a GCD. **No Hensel lift, no leading-coefficient problem,
no exponential recombination.** In characteristic 0 (ℚ(i)) the dimension theorem holds *unconditionally*.

**Decision — Gao first (Option B).** It plays directly to this engine's strength (exact ℚ(i) linear algebra,
all present) and deletes the two most error-prone new subsystems (LC distribution + recombination). It
bottoms out in primitives that already exist plus one small kernel-basis extension. The risk concentrates in
a **single, highly-testable place** — the exact ℚ(i) nullspace — rather than spread across three fragile
subsystems. Every factor it produces is a genuine divisor of `f`, so it self-verifies by re-multiplication.

**Decision — Option A ships as a Phase-5 cross-check oracle.** Because Gao and Hensel share none of each
other's fragile logic, running both on a fuzz corpus and comparing catches shared-primitive and logic bugs
on both sides — the same independent-oracle pattern already used elsewhere (Sympy golden corpora, ℚ(i)
BigInt reference fuzzers, dual-backend GLSL≈JS).

## 5. Gao's algorithm, concretely (the implementable spec — Option B)

Reference: S. Gao, "Factoring multivariate polynomials via partial differential equations," *Math. Comp.*
**72**(242) (2003) 801–822, building on Ruppert 1986/1999. For primitive `f ∈ ℚ(i)[x,y]` with
`gcd(f, f_x) = 1` (strip the `x`-content — any pure-`y` factor — first), bidegree `(m, n)`:

1. **Ruppert linear system.** Solve for polynomials `g, h` the linear PDE (Ruppert's closedness condition):

   ```
   f·(∂g/∂y − ∂h/∂x) + h·(∂f/∂x) − g·(∂f/∂y) = 0
   ```

   with degree bounds `deg_x g ≤ m−1, deg_y g ≤ n` and `deg_x h ≤ m, deg_y h ≤ n−1`. Matching coefficients
   to zero gives a homogeneous linear system over ℚ(i) (≈ `O(d²)` unknowns, ≤ `4mn` equations). Let
   `g₁,…,g_r` be a **basis of the solution space in `g`**.

2. **The dimension theorem (Gao Thm 2.3).** `dim(g-space) = r`, the number of absolutely-irreducible
   factors of `f`. In characteristic 0 this is unconditional — so this alone is an exact **factor count /
   irreducibility test** (`r = 1` ⇔ absolutely irreducible). Each `g` in the space has the form
   `g = Σ λᵢ·Eᵢ` where `Eᵢ = (f/fᵢ)·(∂fᵢ/∂x)` (the bivariate analogue of Berlekamp).

3. **Eigenvalue separation (Gao Thm 2.8 / Cor 2.6).** Take a random `g = Σ aᵢgᵢ`. Build the unique `r×r`
   matrix `A` over ℚ(i) defined by `g·gᵢ ≡ Σ_j A_{ij}·gⱼ·f_x  (mod f)` (uses `mpolyDivMod` for the mod-`f`
   reductions). Its characteristic polynomial `E_g(x) = ∏(x − λᵢ)` (`charPolyByTraces`) has the distinct
   splitting values as roots. A random `g` gives a squarefree `E_g` with high probability; the test (is
   `E_g` squarefree?) is self-checking — retry (~2 expected) otherwise.

4. **Factor extraction — rational factorization over ℚ(i).** Factor `E_g` over ℚ(i) (`_qiFactor`). For each
   irreducible `φ` of `E_g` (degree `t`), the corresponding ℚ(i)-rational factor of `f` is

   ```
   gcd( f,  f_xᵗ · φ(g / f_x) )   ∈ ℚ(i)[x,y]      (equivalently  Res_z(φ(z), f − z·f_x) )
   ```

   This stays entirely in ℚ(i)[x,y] — **no field extension is needed** for the ℚ(i)-rational factorization.
   (An absolute factorization, if ever wanted, uses `L = ℚ(i)[x]/(φ)` and `gcd(f, g − α·f_x) ∈ L[x,y]`.)

Preconditions and edges: `gcd(f, f_x) = 1` (strip pure-`y` content first); run a squarefree decomposition
up front and factor each squarefree part separately, recording multiplicities. **Gao §4 caveat:** compute
the *factors* by exact linear algebra, **not** by CRT / modular reconstruction of the factors (it can fail
for certain Galois structures regardless of prime size); modular methods are safe only for *counting* `r`.

## 6. The Hensel oracle, concretely (Option A — Phase 5)

Kept as an independent cross-check. Write `f ∈ ℚ(i)[y][x]`, primitive and squarefree in `x`,
`d_x = deg_x f`, `d_y = deg_y f`.

1. **Good point.** Random small `b ∈ ℤ[i]` with `lc_x(f)(b) ≠ 0` and `Res_x(f, ∂f/∂x)(b) ≠ 0` (⇒ `f(x,b)`
   squarefree, `x`-degree preserved). Only finitely many `b` are bad. Translate `f ← f(x, y+b)` so the point
   becomes `y = 0`.
2. **Univariate factor.** Factor `f(x,0)` over ℚ(i) (`_qiFactor`) into `g₀^{(1)}⋯g₀^{(s)}`. If `s = 1`, `f`
   is irreducible — done.
3. **Leading coefficient — the distribute-LC trick** (Wang–Rothschild 1975; not Wang's full 1978 LCC, which
   only pays off for large sparse inputs): let `L(y) = lc_x(f)`. Replace `f ← L(y)^{s−1}·f`, impose
   `lc_x = L(y)` on each image factor, lift, then recover each true factor as `primpart_x(·)` over ℚ(i)[y].
   (For the bivariate case `L(y)` is a *univariate* polynomial, so this is trivial to factor if ever needed.)
4. **Linear lift** (Gao–Lauder 2002, §3 — one `y`-degree per step; exact over ℚ(i), so it terminates
   exactly at `y^{d_y+1}` with no coefficient-growth / Mignotte bound). Two-factor core, generalized to `s`
   factors via a precomputed multi-term Bézout relation:

   ```
   f = Σ f_k y^k,  g = Σ g_k y^k,  h = Σ h_k y^k    (coeffs in ℚ(i)[x])
   base:  f₀ = g₀·h₀    (g₀,h₀ coprime since f₀ squarefree)
   Bézout cofactors u,v ∈ ℚ(i)[x]:  u·g₀ + v·h₀ = 1,  deg u < deg h₀,  deg v < deg g₀
   for k = 1..N (N = 2·d_x + 1 for exhaustive recombination):
       e_k = f_k − Σ_{i=1}^{k-1} g_i·h_{k-i}
       g_k = (v·e_k) mod g₀        h_k = (u·e_k) mod h₀
   ```

5. **Recombination.** Enumerate subsets in increasing cardinality (up to `⌊s/2⌋`); trial-divide the
   candidate product into `f` (`mpolyExactDiv`). Naive is fine here: `s ≤ d_x ≤ ~12`, worst case `2¹² ≈ 4096`
   small trial divisions. (van Hoeij / Belabas LLL-recombination is future work, unneeded at this degree.)
6. **Translate back** `f_i ← f_i(x, y−b)`.

## 7. Build phases (gated PRs, the established cadence)

- **Phase 0 — SPIKE (scratch, before touching sym-core).** Validate the Ruppert nullspace + factor
  extraction on `x²−y²`, `x²+y²`, `x⁴+1 → (x²−i)(x²+i)`, a reducible curve, and an irreducible curve — the
  same "spike the math first" discipline #16/#17/#18 used.
- **Phase 1 — infra.** Content-in-`x` / primitive-part, the `gcd(f, f_x)` strip, and the exact ℚ(i)
  **nullspace-basis** routine (extend `_gaussianMatrixRank` to emit a kernel basis). Goldens.
- **Phase 2 — factor *count* + irreducibility ✅ (merged).** `bivariateAbsFactorCount` / `isAbsolutelyIrreducible`
  from the Ruppert-nullspace dimension alone (Gao Thm 2.3). Named for **absolute** (over-ℂ) counting — honest,
  since the count is an upper bound on the ℚ(i)-rational factor count (`x²−2y² → 2` absolute, but
  ℚ(i)-irreducible; the rational split is Phase 3). Cheap, high-value, standalone-testable — and the honest
  oracle `minimalPrimes` wants. Goldens `vitest/qd-factor-count.test.ts` (the Phase-0 battery + preconditions).
- **Phase 3 — factor *extraction*.** The `r×r` matrix → `E_g` → `_qiFactor` → GCD extraction ⇒
  `factorBivariate`. Round-trip + field-sensitivity goldens + Sympy cross-check.
- **Phase 4 — integrate.** Route genuine bivariate through the new path inside `factor` (keep the
  monomial / separable / univariate fast-paths and the exact-division verify); flip the honest `complete`
  flags in `minimalPrimes` / `curveGenus` / `triangularDecomposition` now that factoring is genuine.
- **Phase 5 — the Hensel cross-check oracle** (§6): implement Option A and add a differential test that
  factors a fuzz corpus with both engines and asserts identical factor sets.
- **Later / separate:** general n-variate.

## 8. Test / verification strategy

- **Round-trip property test** — multiply random ℚ(i) bivariate irreducibles → factor → recover the set.
- **Field-sensitivity fixtures** — `x²+1 → (x−i)(x+i)`; `x⁴+1 → (x²−i)(x²+i)`; genuinely ℚ(i)-irreducible
  curves (`r = 1`, no recombination).
- **Edge fixtures, one per failure mode** — pure-`y` content `(y−1)·(irreducible)`; non-squarefree
  `(x²+y²+1)²·(x−y)`; non-monic lc `((y²+1)x + y)·(x²+y)`; a Swinnerton-Dyer-style recombination stress
  (many local factors, irreducible globally — bounded and safe at `x`-degree ≤ 12).
- **External-CAS goldens** — extend the existing Sympy corpus generator (`fixtures/gen-cas-corpus.py`;
  CI runs no Python) with bivariate-over-ℚ(i) `factor` cases.
- **Exact-division verify** on every returned factor (`factor` already enforces this — keep it).
- **Phase 5** — Gao vs Hensel differential testing on the fuzz corpus.

## 9. Risks & honest-labeling

- The one concentrated risk is **exact ℚ(i) nullspace correctness** — highly testable in isolation.
- **Expression swell** on the `O(d²)` system → cap the degree and throw the standard *"export to CAS"* error
  beyond it (matching the Gröbner / resultant cap discipline; never hang).
- **Gao preconditions** (`gcd(f, f_x) = 1`) — strip content first; squarefree-decompose for multiplicities.
- **Gao §4 modular caveat** — extract factors by exact linear algebra, not modular reconstruction.
- **Honest-labeling** — factorization is `=` exact; the `complete` flag stays truthful; past the cap, fail
  closed with the CAS-export guidance.

## 10. Effort

Gao path (Phases 1–4): **~200–400 lines of new code + tests**, ~5 gated PRs, dominated by test-corpus
construction rather than the algorithm. Phase 5 (the Hensel oracle) adds a comparable but self-contained
chunk. General n-variate is a separate, later undertaking.

## 11. References

**Primary (read end-to-end for this plan):** S. Gao, *Math. Comp.* 72 (2003) 801–822 (the PDE method);
W. Ruppert, *J. Reine Angew. Math.* 369 (1986) 167–191 and *J. Number Theory* 77 (1999) 62–70 (the
closedness PDE); S. Gao & A. Lauder, *Math. Comp.* 71 (2002) 1663–1676 (the bivariate Hensel-lift
recurrence, for the Phase-5 oracle).

**Leading coefficient / classical scheme:** P. Wang & L. Rothschild, *Math. Comp.* 29 (1975) 935–950
(distribute-LC); P. Wang, *Math. Comp.* 32 (1978) 1215–1231 (EEZ / LC predetermination); D. Musser,
*J. ACM* 22 (1975) 291–308 (evaluation-point selection).

**ℚ(i) univariate factorization (the shared base case, already in the engine):** B. Trager, SYMSAC '76,
219–226 (the norm method `_qiFactor` uses); H. Cohen, *A Course in Computational Algebraic Number Theory*,
GTM 138 (1993).

**Textbooks:** K. Geddes, S. Czapor, G. Labahn, *Algorithms for Computer Algebra*, Kluwer (1992), Ch. 6
(Hensel) & Ch. 8 (factorization); J. von zur Gathen & J. Gerhard, *Modern Computer Algebra*, Cambridge
(2nd ed. 2003), Ch. 15.

**Bivariate-specific / recombination (future work):** G. Lecerf, *Les cours du CIRM* 3 (2013), Exposé II
(self-contained bivariate); A. Bostan, G. Lecerf, B. Salvy, É. Schost, B. Wiebelt, ISSAC 2004, 42–49;
M. van Hoeij, *J. Number Theory* 95 (2002) 167–189 and K. Belabas et al., *J. Théor. Nombres Bordeaux* 21
(2009) 15–39 (LLL recombination — not needed at degree ≤ 12).
