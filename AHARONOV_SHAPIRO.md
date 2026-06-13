# Reproducing the Aharonov–Shapiro cardioid uniqueness with the algebra tool

This note records how the QD app's symbolic engine reproduces the **order‑2
quadrature‑domain uniqueness theorem** of Aharonov & Shapiro. It is a worked
demonstration that the in‑engine pieces — `Sym.realSolutionCount` (Hermite trace
form), `Sym.schurCohn` (exact root‑in‑disk count), `Sym.buchberger`/`normalForm`
(elimination) — are exactly the ingredients of the published automated proof.

The corresponding regression lives in
[`app/test/cardioid-uniqueness.test.js`](app/test/cardioid-uniqueness.test.js); the
builder is `QDEquations.pointFunctionalSystem` in
[`app/qd-equations.js`](app/qd-equations.js).

## The theorem

Aharonov & Shapiro, *Domains on which analytic functions satisfy quadrature
identities*, J. Analyse Math. **30** (1976), 39–73: a solid (simply‑connected)
quadrature domain with a single order‑2 node,

> ∫_Ω f dA = M₀·f(0) + M₁·f′(0),  M₀ = area(Ω) > 0,  M₁ ∈ ℂ,  for all integrable analytic f,

is **unique**. The **cardioid** φ(z) = (√3/6)(2z + z²) is the cusp case. An automated
proof (real triangular decomposition + a Schur–Cohn univalence constraint) is given by
Ameur, Helmer & Tellander, *On the Uniqueness Problem for Quadrature Domains*
([arXiv:2001.09431](https://arxiv.org/abs/2001.09431), §5.1).

## The system (derived from first principles)

For a degree‑2 Riemann map φ(z) = w₁z + w₂z² (φ(0)=0, rotation gauge w₁ = φ′(0) > 0),
Ω = φ(𝔻). With the area measure normalized so that π → 1, the moment computation
∫_Ω f dA = ∫_𝔻 f(φ)·|φ′|² dA together with ∫_𝔻 z^a z̄^b dA = δ_{ab}/(a+1) gives

- **M₀ = w₁² + 2|w₂|²**  (= area),  **M₁ = w₁²·w̄₂.**

Writing w₂ = u₂ + i·v₂ and M₁ = m₁ + i·n₁, the real system is

- M₀ = w₁² + 2(u₂² + v₂²),  m₁ = w₁²·u₂,  n₁ = −w₁²·v₂.

Eliminating w₂ yields the **resolvent cubic** in s = w₁²:

- **s³ − M₀·s² + 2|M₁|² = 0.**

Because deg φ = 2, **univalence ⇔ φ′(z) = w₁ + 2w₂z ≠ 0 in 𝔻 ⇔ w₁ ≥ 2|w₂|** is
necessary *and* sufficient — i.e. `Sym.schurCohn([w₁, 2w₂])` reports no root inside the
disk. **Uniqueness = exactly one root of the cubic with w₁ > 0 gives a univalent map.**

## What the tool shows (all exact over ℚ)

Worked over the unnormalized rational representative **φ = z + ½z²** (data M₀ = 3/2,
M₁ = 1/2; the A&S map √3/6·(2z+z²) is the same shape at conformal radius √3/3):

1. **Interior system, cardioid.** `realSolutionCount = 2` — the ±w₁ rotation‑gauge pair,
   i.e. a unique map under w₁ > 0, namely φ = z + ½z².
2. **Resolvent.** The symbolic resolvent s³ − M₀s² + 2|M₁|² is entailed by the system
   (`normalForm = 0` modulo the Gröbner basis). For the cardioid it factors
   **2s³ − 3s² + 1 = (s − 1)²(2s + 1)**: the single positive root s = w₁² = 1 is a
   **double root** — the algebraic fingerprint of the cusp.
3. **Univalence filter (Schur–Cohn trichotomy).** φ′ = w₁ + 2w₂z:
   - cardioid [1, 1] → root −1 **on the circle** (cusp; degenerate),
   - a univalent member [4, ⅔] → root −6 **outside** → certified (inside 0),
   - an overshoot [1, 2] → root −½ **inside** → φ′ vanishes in 𝔻 → rejected.
4. **Uniqueness mechanism.** For data with two positive resolvent roots (M₀ = 146/9,
   M₁ = 16/3 → s = w₁² ∈ {2, 16}), `realSolutionCount = 4` (two candidates × ±w₁); the
   Schur–Cohn filter certifies exactly one (w₁ = 4, w₂ = ⅓) and rejects the other —
   the published "exactly one univalent solution."
5. **Exterior‑h pipeline (same domain).** The app preset `h = 1.5/w + 0.5/w²` is the same
   cardioid. Its seeded (●)/(★)/gauge reim system is *positive‑dimensional* because the
   locator factors through the pole preimage z₁; since φ(0) = a₁ = 0 forces z₁ = 0,
   pinning it (the store's `substituteValues` + propagate) makes the system
   **zero‑dimensional with realCount = 2**, and `solveInverseQD` recovers φ = z + ½z²
   numerically. (No "area equation" is needed — the earlier hypothesis was wrong; the
   cause was the unpinned z₁.)

## Scope and the parametric frontier

The reproduction is **exact and pointwise**: for the cardioid and any specific (M₀, M₁)
the engine certifies uniqueness without floating‑point root‑finding. The **fully
parametric** statement — "exactly one univalent root for *all* M₀ > 0, M₁ ∈ ℂ" — is *real
comprehensive triangular decomposition* (parametric quantifier elimination over the
parameter space), which AHT ran in Maple's RegularChains. That parametric step is **not**
in‑engine here; it is the external‑CAS bridge noted as deferred elsewhere in the project.
What the tool delivers in its place is the symbolic resolvent cubic, its discriminant (the
cusp/double‑root locus), and exact certification across a parameter sweep.

## Order‑n generalization (`pointFunctionalSystem({order: n})`)

The builder is not limited to the A&S order‑2 case. For a degree‑`n` Riemann map
φ(z) = Σ_{k=1}^{n} w_k z^k (φ(0)=0, gauge w₁ > 0 real) and an **order‑n point functional**
∫_Ω f dA = Σ_{p=0}^{n-1} M_p f^{(p)}(0), the same moment computation (now with
∫_𝔻 z^a z̄^b dA = δ_{ab}/(a+1)) gives, for p = 0,…,n−1,

> **p! · M_p = Σ_{a=p}^{n-1} c_a^{(p)} · w̄_{a+1},   c_a^{(p)} = [z^a]( φ(z)^p φ′(z) ).**

The p = 0 row is the polynomial‑image **area law** M₀ = Σ_k k|w_k|²; the order ↔ degree
match is exact because φ^p φ′ has lowest z‑degree p, so ∫_Ω w^p dA ≡ 0 for p ≥ n. Splitting
each complex moment into Re + i·Im yields **2n−1 real equations in 2n−1 real unknowns**
(w₁ real; w_k = u_k + i v_k for k ≥ 2). `QDEquations.pointFunctionalSystem(data, {order: n})`
emits this system — symbolic params `M0, m1, n1, …, m_{n-1}, n_{n-1}`, or exact ℚ(i)
constants when `data` supplies the moments — in variables `[w1, u2, v2, …, un, vn]`. Order 2
is bit‑identical to the A&S system above.

**Scope for n ≥ 3.** The system is delivered for *per‑instance* solving (`realSolutionCount`
/ `solveZeroDim` + the `schurCohn` univalence filter, exactly as in the order‑2 worked
example); the *fully parametric* uniqueness count for general n is the same RCTD/CAS frontier
noted above, not claimed in‑engine. Correctness of the generated system is regression‑checked
in [`app/test/qd-equations.test.js`](app/test/qd-equations.test.js) against an independent 2‑D
disk‑quadrature of the moments (the built system vanishes at the generating φ).

## References

- D. Aharonov, H. S. Shapiro, *Domains on which analytic functions satisfy quadrature
  identities*, J. Analyse Math. 30 (1976), 39–73.
- Y. Ameur, M. Helmer, F. Tellander, *On the Uniqueness Problem for Quadrature Domains*,
  [arXiv:2001.09431](https://arxiv.org/abs/2001.09431).
