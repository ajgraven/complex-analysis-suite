# General n-variate polynomial factorization over ℚ(i) — design plan

> **Status: PLANNED (not started).** This is the one deferred extension of roadmap item #19, whose
> **bivariate** core (Phases 0–5) is complete and merged (see [`MULTIVARIATE_FACTORING.md`](MULTIVARIATE_FACTORING.md)).
> Decisions recorded (2026-07-13): **(a)** reduce n-variate → bivariate and lift, reusing the trusted
> `factorBivariate` as the base case (not a from-scratch multivariate Gao); **(b)** initial scope is
> **monic in the main variable** — Wang leading-coefficient distribution is a later refinement. This
> document is the implementable brief; it is grounded in a code survey (see §1) and follows the same
> gated-PR, independent-oracle discipline the bivariate core used.

Honest-labeling (CLAUDE.md) carries over: a factorization is exact (`=`); the `complete`/`ok` flags stay
truthful; anything past the scope (non-monic main variable, degree caps, a non-generic evaluation the
search can't fix) **fails closed** — the polynomial is returned whole, never mislabeled as irreducible.

---

## 1. Why — the grounded consumers

The honest headline first: **the suite's headline objects are all bivariate** and already fully served —
the QD "trinity" boundary `Q(z, z̄)`, the correspondence curve `C(w, z̄)`, and plane curves for genus.
A general n-variate factorizer is a **completeness / rigor** feature for the *algebra layer*, not a
hot-path one. The genuine ≥3-variable consumers, from a code survey:

| Consumer | Where | Current limitation |
|---|---|---|
| **`discriminantVariety`** (multi-parameter) | `sym-core.mjs` `discriminantVariety` → `factor(boundary)` | **The only site that directly factors a genuine trivariate+ polynomial.** For a family with **≥3 parameters** the boundary of the bifurcation set lives in ≥3 parameter variables; `factor` can't split it, so it is returned whole and its documented contract ("its irreducible factors — the distinct curves/surfaces") is not met. |
| **`minimalPrimes`** | `sym-core.mjs` `minimalPrimes` → `isCertPrime` | Phase 4 extended prime-certification of a principal hypersurface `⟨g⟩` to **bivariate** `g`. A genuine trivariate+ irreducible hypersurface (e.g. `⟨x²+y²+z²⟩`) cannot be certified → `complete:false`. A trivariate *reducible* generator also isn't split, so the decomposition can under-resolve. |
| **`triangularDecomposition`** | `sym-core.mjs` `triangularDecomposition` | Returns `complete: mp.complete` — inherits the cap directly. |
| **QD Algebra "Attempt to factor" + spurious-component detection** | `algebra-store.mjs` `factorOf` / `applyFactor` / `spuriousFactors` → `S.factor(poly)` | **The UI-facing benefit.** The conjugate / real-imaginary model *doubles* variables (`currentReimSystem` maps each base variable to `X__re` / `X__im`), so a QD system in ≥2 complex unknowns becomes a **≥3–4 real-variable** system. A genuinely entangled reducible reim equation returns `ok:false` (whole) → the UI reports "no nontrivial factorization" and misses a legitimate case-split / spurious-component peel. (In practice the *final* boundary reduces to bivariate `Q(z,z̄)`; this bites intermediate multi-node / reim systems.) |
| **Radical solver split** | `sym-radical.mjs` `_factorSplit` → `S.factor(poly)` (its own comment flags the ceiling) | A trivariate reducible factor of the solve variable won't be peeled. |
| **`factor()` public API** | `_factorRec` | Any remainder with `vars().size ≥ 3` that is **not variable-disjoint** falls through to `_factorPush(out, cur)` — pushed whole, labeled "irreducible by our methods." Every consumer above inherits this. |

**Two honesty notes from the survey:**

- **The CD `δ_n(λ, c)` surface is *not* a factorizer consumer.** `dynatomic.ts` defers it, but the deferral
  is about **trivariate elimination** (eliminating `z` from `Φ_n(z,c)` and `(f_cⁿ)′(z) − λ`, a system in
  `z, c, λ`); the resulting `δ_n(λ, c)` surface is itself **bivariate**. What unblocks it is an elimination
  engine, not this factorizer. Listed here only to close the loop.
- **`minimalPrimes` / `triangularDecomposition` / `discriminantVariety` are programmatic `QD.Sym` API**,
  not wired into the Web-Worker dispatcher or the Algebra UI. The genuinely *user-facing* payoff flows
  through `factor()` → `factorOf` / `spuriousFactors`.

## 2. What already exists to build on

The pleasant structural fact: **the two ingredients are exactly Phases 3 and 5 of the bivariate core.**

| Primitive | What it already gives us |
|---|---|
| **`factorBivariate`** (Phase 3) | The trusted, doubly-cross-checked bivariate factorizer = the **base case** of the reduction. |
| **`henselFactorBivariate`** (Phase 5) | Single-variable Hensel-lift machinery — `_gaModInv`, the multifactor Bézout `σ_i`, `_truncInVar`, `_subsetsOfSize`, the recombination loop = the **lift to generalize** to more variables. |
| **`gcdMV` / `gcdList`** | A **true n-variate GCD** over ℚ(i) (recursive primitive PRS on the smallest-sorted variable; content recurses on one-fewer variables). Multivariate content-stripping is done. |
| **`bivariateContent` / `bivariatePrimitivePart`** | Content / primitive part in a **chosen explicit main variable** — the exact form a recursive n-variate reducer needs. |
| **`_separableSplit`** | Already splits **variable-disjoint** products in **2–8 variables** (union-find on co-occurring variables, verified by exact product). ⟹ the genuine gap is only the **entangled** (non-disjoint) multivariate case; the disjoint case is handled. |
| **`bivariateAbsFactorCount`** (Phase 2) | A factor-count **consistency check** for evaluation-point genericity. |
| **`_qiFactor`**, `resultant`, `mpolyExactDiv`, `pseudoRemainder`, `_ambientVars` | Shared base machinery both bivariate algorithms already recurse to. |

## 3. The algorithm — reduce to bivariate, then iterated multivariate Hensel lift (Wang "EEZ")

For `f ∈ ℚ(i)[x₁, …, xₙ]`, `n ≥ 3`, primitive and squarefree in a chosen main variable `x₁`, **monic in
`x₁`** (initial scope):

0. **Content in `x₁`** (an (n−1)-variate polynomial) — strip via `gcdMV`, recurse `factorMultivariate`
   on it. Require monic-in-`x₁` (a non-constant leading `x₁`-coefficient ⇒ fail closed; Wang LC
   distribution deferred).
1. **Evaluate** `x₃, …, xₙ → a₃, …, aₙ` (Gaussian integers), reducing to a **bivariate** `f₀(x₁, x₂) =
   f(x₁, x₂, a₃, …, aₙ)`. Require: `deg_{x₁}` preserved (leading coeff nonzero at the point), `f₀`
   squarefree, and the **Hilbert-genericity** condition — the number of bivariate factors of `f₀` equals
   the number of true factors of `f`. Detect and retry on a bad point (bounded search over small Gaussian
   integers); the factor-count check reuses `bivariateAbsFactorCount`-style counting.
2. **Base factor** `factorBivariate(f₀)` → monic-in-`x₁` factors `u₁(x₁,x₂), …, u_s(x₁,x₂)`
   (`s = 1 ⇒ f` irreducible, early exit — a generic univariate/bivariate specialization of an irreducible
   is irreducible).
3. **Multivariate Hensel lift** — lift `{u_i}` from `ℚ(i)[x₁, x₂]` back to `ℚ(i)[x₁, …, xₙ]`, reintroducing
   `x₃, …, xₙ` **one variable at a time** in the `(x_j − a_j)`-adic direction. This is the *same* `σ_i` /
   Bézout diophantine machinery as the Phase-5 oracle, iterated per variable; the multivariate diophantine
   solve at each step bottoms out on the bivariate gcd / `factorBivariate` already trusted.
4. **Recombine** by exact trial division — the smallest subset whose lifted product divides `f` exactly is
   an irreducible factor (smallest-first ⇒ irreducibility), exactly as in the bivariate oracle.
5. **Un-normalize** (reattach content, undo the monic scaling) and canonicalize each factor.

**Alternative considered — a from-scratch multivariate Gao** (the Ruppert / logarithmic-derivative space
generalized to n variables). *Not* the primary: its linear system is `O(d^{2n})` and its extraction is
heavier, whereas reduction+lift is the standard (Maple / Magma) route, is incremental, and **reuses the
trusted bivariate core**. Keep multivariate-Gao in reserve as a possible independent oracle (§5).

## 4. The hard parts (honest)

- **Leading-coefficient distribution (Wang).** A non-monic-in-`x₁` polynomial needs its leading coefficient
  reconstructed and distributed among the true factors on lift-back. **Scope decision: require monic-in-`x₁`
  first** (mirrors the Phase-5 oracle; a good main-variable choice plus content-stripping covers many app
  cases). Full Wang LC distribution = a deferred refinement.
- **Bad evaluation points / Hilbert irreducibility.** A non-generic point merges or splits factors.
  Mitigation: retry over Gaussian integers + the factor-count consistency check. Over ℚ(i) there are plenty
  of good points; the search is bounded and fails closed if none is found.
- **Lift precision / the multivariate diophantine solve.** Each per-variable lift needs the correct
  `(x_j − a_j)`-adic precision (≥ `deg_{x_j} f`). Bounded but fiddly — the P0 spike de-risks it.
- **Recombination blow-up** (`2^s`). Bounded by the small bivariate factor count `s` in app cases; add a
  cap and honest fall-through past it.
- **Content recursion depth.** The content is (n−1)-variate; recursion strictly drops the variable count,
  so it terminates.

## 5. Verification — the established independent-oracle culture

- **Bivariate consistency (free):** `factorMultivariate` restricted to 2 variables must equal
  `factorBivariate`.
- **Round-trip fuzz:** multiply random n-variate ℚ(i) irreducibles → recover the exact set.
- **Sympy golden corpus:** extend `fixtures/gen-cas-corpus.py` with n-variate `factor(…, gaussian=True)`
  cases (trivariate + reim-style 4-variable), consumed by `sym-core-cas-corpus.test.ts` (CI runs no Python).
- **Second-reduction differential:** a *different* evaluation point / different main variable must yield the
  same factor set — a built-in adversarial check, exactly like the Hensel oracle.

## 6. Build phases (gated PRs, auto-merge on green — the established cadence)

- **P0 — spike (scratch, before touching `sym-core`).** Validate reduce-to-bivariate + the iterated lift +
  recombination on trivariate cases, exact over ℚ(i); confirm the genericity / factor-count check and the
  lift precision. The same "spike the math first" discipline the bivariate phases used.
- **P1 — infra.** Multivariate content / primitive / squarefree in a chosen main variable (mostly wrapping
  `gcdMV`) + evaluation-point selection with the Hilbert-genericity / factor-count check. Goldens.
- **P2 — the multivariate Hensel-lift engine.** Generalize `henselFactorBivariate`'s lift to iterate over
  `x₃, …, xₙ` (the multivariate ideal-adic Hensel + diophantine). *The concentration of risk — de-risked by
  P0.*
- **P3 — `factorMultivariate`.** reduce → `factorBivariate` → multi-lift → recombine (monic-in-main-var
  scope); round-trip + Sympy + bivariate-consistency goldens.
- **P4 — integrate.** A fifth method in `_factorRec` (after the bivariate branch): a ≥3-variable *entangled*
  remainder → `factorMultivariate`. Extend `minimalPrimes` / `triangularDecomposition` `isCertPrime` to
  n-variate hypersurfaces (flips more `complete` flags); `spuriousFactors` / `discriminantVariety` /
  `sym-radical` benefit automatically since they call `factor`.
- **P5 — the independent oracle.** The second-reduction differential + the n-variate Sympy corpus.

Deferred within this extension: **Wang LC distribution** (non-monic main variable); a **multivariate
absolute-factor count**; and the adjacent (separate) **trivariate-elimination** engine the CD `δ_n(λ, c)`
surface actually needs.

## 7. Effort & risk

Larger than any single bivariate phase — the lift generalization (P2) and the genericity handling (P1) are
the genuinely new hard parts — but each phase is independently gated and reuses trusted cores (the bivariate
factorizer and the Phase-5 lift machinery). Risk concentrates in **P2**, de-risked by the **P0 spike**. The
payoff is completeness / rigor across the algebra layer — the user-facing win being multi-node QD
`spuriousFactors`, plus certified `complete` flags in ideal decomposition and genuine component-splitting in
multi-parameter `discriminantVariety`. Honest framing: this closes the last "we did not actually factor
this" gap, not a performance one.

## 8. References

- S. Gao, "Factoring multivariate polynomials via partial differential equations," *Math. Comp.* **72**
  (2003) — the bivariate base case (already implemented).
- P. S. Wang, "An improved multivariate polynomial factoring algorithm," *Math. Comp.* **32** (1978) — the
  EEZ (evaluation-enhanced Zassenhaus) reduction + lift + leading-coefficient distribution.
- E. Kaltofen, "Effective Hilbert irreducibility," *Information and Control* **66** (1985) — genericity of
  the evaluation and preservation of the factorization pattern.
- J. von zur Gathen & J. Gerhard, *Modern Computer Algebra*, §6 (Hensel lifting) & §16 (multivariate
  factorization) — the standard reference for the lift and recombination.
