# 04 — Numerics: quadrature, pole/residue detection, and certified bounds

> Research track for `apps/contour-integration`. Scope: *which* numerical algorithms to
> implement, with *what* error control, and an honest feasibility verdict on sound interval
> arithmetic in a browser TS bundle. Conventions per [ADR-0006](../../DECISIONS.md): the core
> numerics stay convention-neutral; `1/(2πi)` normalisation lives at the app edge.

## 0. Recommended stack (summary)

| Job | Algorithm | Label it |
|---|---|---|
| Closed contour, analytic integrand | **periodic trapezoidal rule** (equispaced in the parameter) | `≈` with estimated `a`, or `≤` when the strip is certified |
| Open arc | **Clenshaw–Curtis** (FFT weights, nested) — Gauss–Legendre only if nodes are precomputed | `≈` |
| Adaptive / non-analytic | **Gauss–Kronrod (7,15)** panels, `|G₇−K₁₅|` estimator | `≈` |
| Endpoint singularity `x^{α−1}` | **tanh–sinh** with `φ(x)=tanh(½π sinh x)` | `≈` |
| Contour near a pole | **pole subtraction** driven by AAA, then trapezoid | `≈` / `=` for the subtracted part |
| Poles + residues from samples | **AAA** (Nakatsukasa–Sète–Trefethen) | `≈` |
| Zero/pole *counting* in a region | argument principle + trapezoid, rounded to an integer with a certified `<½` error bound | `=` |
| Polynomial roots | **Durand–Kerner** (already in `@cas/core`) + Smith a-posteriori inclusion disks | `≤` radii |
| Winding number of the drawn path | exact-sign crossing number in double-double | `=` |
| Auxiliary-arc `ML` bound for rational `f` | coefficient triangle inequality + Cauchy root bound | `≤` |

The through-line: **AAA is the hub.** It turns the samples the renderer already produces into a
pole/residue/zero model, which then (a) locates the poles, (b) supplies the residues,
(c) provides the pole-subtraction preconditioner that keeps the trapezoidal rule fast when the
user drags the contour near a singularity, and (d) supplies the analyticity radius that drives
the *a priori* error bound.

---

## 1. Quadrature on contours

### 1.1 The periodic trapezoidal rule — precise statements

Let `u` be analytic on an annulus about the unit circle, `I = ∫₀^{2π} u(e^{iθ})dθ`,
`I_N = (2π/N) Σ_{k=1}^{N} u(z_k)` at the `N`-th roots of unity. Trefethen & Weideman
(SIAM Rev. 56 (2014) 385–458) give, with all constants sharp:

- **Thm 2.1 (disk).** `|u| ≤ M` on `|z| < r`, `r > 1` ⇒ `|I_N − I| ≤ 2πM/(r^N − 1)`.
- **Thm 2.2 (annulus).** `|u| ≤ M` on `r^{−1} < |z| < r` ⇒ `|I_N − I| ≤ 4πM/(r^N − 1)`.
- **Thm 3.1 / 3.2 (periodic strip).** `v` 2π-periodic, `|v| ≤ M` on `−a < Im θ < a` ⇒
  `|I_N − I| ≤ 4πM/(e^{aN} − 1)` (and `2πM/(e^{aN}−1)` for the half-plane variant).
- **Thm 5.1 / 5.2 (real line).** `w` analytic on `|Im x| < a` with `∫|w(x+ib)|dx ≤ M` ⇒
  `|I_h − I| ≤ 2M/(e^{2πa/h} − 1)` (`M/(…)` for the half-plane variant).

The mechanism is aliasing, not smoothness: `I_N − I = 2π Σ_{j≥1} (c_{jN} + c_{−jN})` where
`c_j` are the Laurent coefficients. This identity is the single most useful thing in the paper
for us — it is simultaneously the proof, the error *estimator*, and the debugging tool.

### 1.2 The analyticity-strip parameter for a user-drawn contour

Parametrise the closed contour as `z(t)`, `t ∈ [0,2π]`, arclength `L`, node spacing
`h_s = L/N`. If `f` has its nearest singularity at Euclidean distance `d` from the curve and
the parametrisation is near-arclength (`|z'| ≈ L/2π`), then `f∘z` is analytic in the strip of
half-width

```
a ≈ 2π d / L      ⇒      error ≈ M · e^{−aN} = M · e^{−2π d / h_s}.
```

**Practical rule.** For a relative accuracy `ε` you need `d/h_s ≥ log(1/ε)/(2π)`. For
`ε = 10⁻¹²` that is `d/h_s ≥ 4.4` — you need roughly **4–5 quadrature points inside the
distance to the nearest pole**. This is the same "5 points per panel" heuristic as in boundary
integral practice and it should be the app's live node-density controller: compute
`d = min_j dist(pole_j, γ)` from the AAA model, then set `N = ⌈4.4 L / d⌉`, capped.

Degradation is brutal: `d = 0.01·L/2π` needs `N ≈ 2.8×10³`; `d` ten times smaller needs
`N ≈ 2.8×10⁴`. Hence §1.5.

### 1.3 Open arcs: Gauss–Legendre vs Clenshaw–Curtis

Map the arc to `[−1,1]`. For `f` analytic and bounded by `M` in the Bernstein ellipse `E_ρ`
(foci `±1`, semi-axis sum `ρ`), the standard bounds (Trefethen, *ATAP* Thm 19.3/19.5) are

```
Gauss (n nodes):            |I − I_n| ≤ (64/15) M ρ^{−2n} / (1 − ρ^{−2})
Clenshaw–Curtis (n+1):      |I − I_n| ≤ (144/35) M ρ^{−n} / (1 − ρ^{−2})
```

For a singularity at `p ∉ [−1,1]`, `ρ = |p + √(p²−1)|` (inverse Joukowski). Trefethen's
*"Is Gauss quadrature better than Clenshaw–Curtis?"* (SIAM Rev. 50 (2008) 67–87) shows the
nominal factor-of-2 rarely materialises: until `n` reaches the resolution level, CC's
coefficient aliasing makes it track Gauss almost exactly. **Recommendation: Clenshaw–Curtis** —
nested nodes (free `N → 2N` estimate), FFT weights in `O(n log n)` with no eigenvalue solve.

### 1.4 Per-frame error estimators

1. **Coefficient tail (free, closed contours).** One FFT of the `N` samples gives `ĉ_j`; fit
   `|ĉ_k| ≈ M e^{−ak}` by least squares over the middle third of the spectrum, then report
   `4πM/(e^{aN}−1)`. This *also* recovers the strip half-width `a`, which is the number the UI
   should display. Cost at `N = 4096`: ~50 µs. Run every frame.
2. **Halving (`|I_N − I_{N/2}|`).** Free for the trapezoid and for CC (nested nodes). Geometric
   convergence makes it a safe *upper* proxy, never a proof. Run on every `N` change.
3. **Gauss–Kronrod (7,15) per panel**, QUADPACK scaling
   `err = |I|·min(1,(200|G₇−K₁₅|/|I|)^{1.5})`, heap-driven bisection of the worst panel. For
   non-analytic integrands or declared branch cuts only — ~3× the work of a trapezoid at equal
   accuracy when `f` is analytic. On demand.

### 1.5 Near-singular behaviour — the fix that actually works

When a pole `p` (residue `R`) sits at distance `d ≪ h_s` from the contour, do **not** refine
blindly. Subtract the principal part, which integrates in closed form:

```
∮_γ f dz = 2πi · R · n(γ,p)  +  ∮_γ [ f(z) − R/(z−p) ] dz
```

and for order-`m ≥ 2` parts, `∮_γ (z−p)^{−m} dz = 0` on any closed contour avoiding `p`. The
remainder is analytic in a far larger neighbourhood, so the trapezoid recovers its original
rate. `(p, R)` come free from AAA (§2). This is the cheap cousin of QBX / Helsing–Ojala
"singularity swap" — those are overkill here because we *know* the singularity structure rather
than having to discover it from a layer potential.

Second-line defences: adaptive panel splitting with CC per panel near the close approach; and
locally deforming the contour away from `p` (legal by Cauchy, worth exposing as a UI affordance
with the winding number as the held invariant).

Trefethen–Weideman §12 notes the dual disease: evaluating a Cauchy integral at a target *near*
the contour. The fix is the "second-kind"/barycentric quotient
`mean(z u(z)/(z−a)) / mean(z/(z−a))`, full precision where the raw Cauchy sum gets 1.5 digits.
Use it if the app ever evaluates `f` inside a contour from boundary data.

### 1.6 Endpoint singularities: tanh–sinh

For `∫_{−1}^{1} y(ξ)dξ` with algebraic/logarithmic endpoint singularities, substitute
`ξ = φ(x) = tanh(α sinh x)`, `φ'(x) = α cosh x · sech²(α sinh x)`, then trapezoid on `x ∈ ℝ`.
Poles of the transformed integrand sit where `cosh(α sinh x) = 0`, i.e. `sinh x = ±iπ/(2α)`.
**`α = π/2` is optimal**: it simultaneously maximises the strip half-width (to `π/2`) and gives
doubly-exponential decay `~exp(−(π/2)cosh x)`, hence error `≈ exp(−cN/log N)`. The known
limitation (Trefethen–Weideman §14) is floating point: `φ(x)` saturates to `±1` long before the
sum is truncated, so endpoint values must be computed as `1 − φ` cancellation-free (via
`sech²`/`exp(−2α sinh x)` directly) or the method silently loses half its digits.

Use it for the "integrate `x^{α−1}g(x)` along a keyhole edge" case and for branch-cut-hugging
segments generally.

---

## 2. Pole and zero finding

### 2.1 AAA (Nakatsukasa, Sète & Trefethen, SISC 40 (2018) A1494–A1522)

Represent the approximant in **barycentric** form over `m` support points `z_j` chosen from a
sample set `Z` (`|Z| = M`):

```
r(z) = n(z)/d(z) = ( Σ_j w_j f_j /(z − z_j) ) / ( Σ_j w_j /(z − z_j) )
```

which is a type-`(m−1, m−1)` rational function — "of a smaller type than it looks, and its
poles can be anywhere except where they appear to be".

**Iteration.** At step `m`: (i) *greedy* — pick `z_m ∈ Z^{(m−1)}` maximising the nonlinear
residual `|f(z) − r_{m−1}(z)|`; (ii) form the `(M−m) × m` **Loewner matrix**
`A_{ij} = (F_i − f_j)/(Z_i − z_j)` over the non-support points; (iii) `w` = last right singular
vector of `A` (SVD), i.e. `min ‖Aw‖₂` s.t. `‖w‖₂ = 1`. Stop when
`‖f − r‖_∞ ≤ tol · ‖f‖_∞`, default `tol = 10⁻¹³`. Complexity **`O(M m³)`**; `m` is typically
10–40.

**Poles, zeros, residues.** The poles are the zeros of `d`, obtained from an `(m+1)×(m+1)`
generalised eigenproblem in **arrowhead** form

```
[ 0   w₁ … w_m ]        [ 0          ]
[ 1   z₁       ]  x = λ [   1        ] x ,      B = diag(0,1,…,1)
[ …       ⋱    ]        [     ⋱      ]
[ 1        z_m ]        [        1   ]
```

Two eigenvalues are infinite; the remaining `m−1` are the poles. Replacing `w_j` by `w_j f_j`
gives the zeros. Residues are computed in the reference implementation by a **4-point
trapezoidal rule on a tiny circle**:

```
Res(r, p) ≈ (1/4) Σ_{k=1}^{4} r(p + δω^k) · δω^k ,   ω = i,  δ = 10⁻⁵
```

— i.e. the `N = 4` discretisation of `(1/2πi)∮ r dz`, which is *exact to machine precision*
for a simple pole because `r` is rational and the aliasing tail is tiny at that radius.

**Froissart doublets.** Spurious poles — either poles with tiny residues, or pole–zero pairs so
close they nearly cancel. They arise even in exact arithmetic (which is why Padé convergence
theorems need convergence *in capacity*). Published cleanup: flag poles with `|Res| < 10⁻¹³`,
delete the nearest support point for each, re-solve with a fresh SVD. At the default tolerance
you typically get zero or one; `tol = 0` deliberately produces dozens. **Two kinds exist**:
rounding-induced (zero radius of influence, killed by the residue filter) and genuine
under-sampling doublets (larger radius of influence, killed by denser sampling). For us: run
cleanup, and additionally reject any pole with residue below `10⁻¹⁰·max|f|` or sitting within
`10⁻⁸` of one of the model's own zeros.

**Why AAA first.** Domain-agnostic (arbitrary contours, disconnected sample sets, poles in the
midst of the samples), no basis choice, needs only *samples* of `f` — which the renderer already
produces — and returns poles, residues and zeros in one shot. It is the one modern algorithm
that maps onto this app's data flow with no impedance mismatch.

### 2.2 Argument principle, subdivision, Delves–Lyness, Kravanja–Van Barel

Counting is easy and *certifiable*:

```
ν = (1/2πi) ∮_γ f'/f dz ≈ (1/N) Σ_j z_j f'(z_j)/f(z_j)      (unit circle)
```

converges geometrically to an **integer**; e.g. `sin³(2z)+cos³(2z)` gives 2.99863 at `N = 40`
and 2.9999999256 at `N = 100`. Because the limit is an integer, an error bound `< ½` promotes
the answer to `=`. Get that bound from §1.4(1) plus a certified lower bound on `|f|` along `γ`
(interval evaluation, §5) — this is the app's cleanest "earned `=`".

Locating: the power sums `s_k = (1/2πi)∮ z^k f'/f dz = Σ_j ζ_j^k` are the Laurent coefficients
of `f'/f`, so one FFT gives `s_0 … s_{2K}`. Build Hankel matrices
`H = [s_{i+j}]_{1..K}`, `H^< = [s_{i+j+1}]` and solve the generalised eigenproblem
`H^< x = λ H x`; the eigenvalues are the zeros (Vandermonde factorisation
`H = VV^T`, `H^< = V·diag(ζ)·V^T`). This is **Delves–Lyness (1967)** as improved by
**Kravanja–Van Barel** via *formal orthogonal polynomials* (their `ZEAL` package: rectangular
region, boundary integrals of the logarithmic derivative, distinct zeros from a generalised
eigenproblem, multiplicities from a Vandermonde solve). Two variants matter:

- `[Cz1]` uses `f'/f` — accurate but **unstable for nearly-equal zeros**.
- `[Cz2]` (Luck–Stevens / Kravanja §1.6) replaces `f'/f` by `1/f`, so `s_m = Σ ζ_j^m / f'(ζ_j)`,
  same Hankel machinery, **handles multiple and near-multiple zeros**, and needs no derivative.

Both involve possibly ill-conditioned Hankel matrices. Austin–Kravanja–Trefethen (SINUM 52
(2014) 1795–1821) show `[Cz2]` is mathematically equivalent to finding the poles of a
*linearised rational interpolant* to `1/f` — a AAA-shaped computation with a fixed pole cage at
the roots of unity. Their `ratdisk` regularises via an SVD of the Hankel matrix of Laurent
coefficients to kill Froissart doublets, and they state plainly that this regularisation is
crucial for the reliability of rational-approximation methods.

**Recursive subdivision** is the right *outer* loop: quadtree the viewport, evaluate `ν` per
cell, subdivide any cell with `ν ≠ 0` until `ν = 1` (or the resolution floor with `ν > 1` ⇒
clustered/multiple root), then polish with Newton. Per-cell `ν` reuses edge samples between
siblings, and the tree parallelises trivially into a worker.

### 2.3 Beyn's contour-integral method

For `T(z)x = 0` holomorphic (matrix case `T(z) = zI − A`), Beyn (*Linear Algebra Appl.* 436
(2012) 3839–3863) forms, with a probe matrix `V ∈ ℂ^{n×ℓ}`, `ℓ ≥ k` = eigenvalue count inside,

```
A₀ = (1/2πi) ∮ T(z)^{-1} V dz ,    A₁ = (1/2πi) ∮ z T(z)^{-1} V dz .
```

By **Keldysh's theorem** `A₀` has rank `k`; take the SVD `A₀ = V₀Σ₀W₀^H`, truncate at a
tolerance to read off `k`, and the eigenvalues are those of the `k × k` matrix
`B = V₀^H A₁ W₀ Σ₀^{-1}`. The integrals use the trapezoidal rule, inheriting §1.1's exponential
convergence. Failure modes: eigenvalues near the contour (the strip `a` collapses) and an
ambiguous singular-value gap when `ℓ` is too small or the probe unlucky. For us this is mostly
*conceptual furniture* — it shows FEAST/Sakurai–Sugiura, `[Cz2]`, `ratdisk` and AAA to be one
idea — but it becomes directly useful if we ever add resolvent/transfer-function polefinding.

### 2.4 Comparison with Durand–Kerner

`@cas/core`'s Durand–Kerner is the right tool when `f` is *known* to be a polynomial with known
coefficients: it is globally convergent in practice, gives all `n` roots simultaneously,
`O(n²)` per iteration, and needs no contour. It is the *wrong* tool for a user-typed
transcendental `f` (no coefficients) and for meromorphic `f` (it finds zeros only). The clean
division of labour:

- polynomial / rational with exact coefficients → Durand–Kerner (+ `@cas/exact` for `=` labels);
- anything else → AAA on the rendered samples, cross-checked by the argument principle.

Durand–Kerner output can be *certified* a posteriori: by Smith's theorem, for approximations
`z_1…z_n` of the roots of `P` with leading coefficient `a_n`, every root lies in
`⋃_i D_i` where `D_i = { z : |z − z_i| ≤ n|P(z_i)| / (|a_n| Π_{j≠i}|z_i − z_j|) }`, and an
isolated `D_i` contains exactly one root. Evaluated in interval arithmetic (§5) this yields an
honest `≤` radius per root — the one place the app can put rigorous error bars on root
locations with a few dozen flops.

---

## 3. Residues numerically

### 3.1 Small-circle Cauchy integral and the radius trade-off

With `z = z₀ + r e^{iθ}`,

```
Res(f, z₀) = (1/2πi)∮ f dz = (1/2π)∫₀^{2π} f(z₀ + re^{iθ}) r e^{iθ} dθ
          ≈ (r/N) Σ_{k=0}^{N−1} f(z₀ + r ω^k) ω^k ,    ω = e^{2πi/N}.
```

By the aliasing identity, the **truncation error** is `Σ_{j≥1}(c_{−1+jN} r^{jN} + c_{−1−jN} r^{−jN})`,
dominated by `|c_{N−1}| r^{N−1}` when `r` is below the next singularity. The **round-off error**
is `≈ ε · r · max_{|z−z₀|=r}|f|`; for a pole of order `m`, `max|f| ≈ |c_{−m}| r^{−m}`, so

```
round-off ≈ ε |c_{−m}| r^{1−m}          truncation ≈ |c_{N−1}| r^{N−1}.
```

Small `r` ⇒ catastrophic cancellation for `m ≥ 2`; large `r` ⇒ truncation as `r` approaches the
next singularity. **Fornberg (1981)** gave an adaptive radius algorithm; **Bornemann**
(*Found. Comput. Math.* 11 (2011) 1–63) showed that for wide classes of functions an optimal `r`
makes the condition number essentially `O(1)` even for very high-order derivatives, with `r`
growing with the derivative order. Practical default: `r = ½·dist(z₀, nearest other
singularity)`, `N = 32` or `64`, refined by comparing `N` and `2N`.

### 3.2 Many Laurent coefficients at once, by FFT — the important trick

Sample `f` at `N` points on `|z − z₀| = r` and take one FFT. Because `c_j^{[N]} r^j` is exactly
the `j`-th DFT coefficient of the samples:

```
c_j ≈ c_j^{[N]} = (1 / (N r^j)) Σ_{k=0}^{N−1} f(z₀ + r ω^k) · ω^{−jk} ,   j = −N/2 … N/2−1
```

so **one `O(N log N)` FFT delivers the entire Laurent segment** `c_{−N/2} … c_{N/2−1}`
simultaneously — the residue `c_{−1}`, the order of the pole (largest `m` with
`|c_{−m}| r^{−m}` above the noise floor), the whole principal part for pole subtraction (§1.5),
and `f^{(j)}(z₀) = j! c_j` for the analytic part. Theorem 12.1 of Trefethen–Weideman gives the
sharp bound: if `|u| ≤ M` on `r^{−1} < |z| < r` then

```
|c_j^{[N]} − c_j| ≤ M (r^j + r^{−j}) / (r^N − 1) ,
```

equivalently `|f^{(j)}(0) − j! c_j^{[N]}| ≤ M j!(r^j + r^{−j})/(r^N − 1)`. This is the
Lyness–Moler / Lyness–Sande (`ENTCAF`/`ENTCRE`) technique. Their canonical example — the 5th
derivative of `e^z/(sin³z + cos³z)` at 0, exact value `−164` — gets 2 digits from a 7-point real
finite difference and **14 digits** from a 20–80 point trapezoid on `|z| = 0.5`.

Practical notes: power-of-two `N`, complex FFT; apply the `r^{−j}` scaling *after* the FFT, and
guard it — `r^{−j}` overflowing the useful range for large `j` and small `r` *is* the round-off
wall above.

### 3.3 High-order poles and the honest label

For `m ≥ 3` the cancellation is structural: extracting `c_{−1}` from data dominated by
`c_{−m}r^{−m}` costs `(m−1)·log₁₀(1/r)` digits. Mitigations, best first:

1. **Symbolic** — for rational `f`, `Res = (1/(m−1)!) lim d^{m−1}/dz^{m−1}[(z−z₀)^m f]` exactly
   over ℚ(i) via `@cas/exact`. Earns a genuine `=`.
2. **Multiply out** — compute `g(z) = (z−z₀)^m f(z)`, which has no pole, and take
   `c_{−1} = g^{(m−1)}(z₀)/(m−1)!` by §3.2. Removes the `r^{−m}` amplification entirely; this is
   the recommended numeric path.
3. **AAA caveat** — a simple-pole model splits an order-`m` pole into `m` nearby simple poles
   whose residues *sum* usefully but individually are noise. Detect the signature (tight cluster,
   alternating-sign residues) and *refuse* rather than report.

Default label for numeric residues: `≈`, upgraded to `=` only via path 1.

---

## 4. Winding number, robustly

Three computations, three guarantees.

**(a) Continuous argument accumulation** — for a sampled path `z_0 … z_n = z_0` and a point `p`:

```
n(γ,p) = (1/2π) Σ_{k} Arg( (z_{k+1} − p) / (z_k − p) )
```

where `Arg` is the principal value via `atan2`. Each term lies in `(−π, π]`, so the sum is
`2π·(integer)` **provided no single step subtends an angle ≥ π at `p`**. That proviso is
checkable: `Re[(z_k−p)·conj(z_{k+1}−p)] > 0` guarantees the subtended angle is `< π/2` for that
step; if it fails, bisect the segment (the true curve between control points is known, so this
is a refinement, not a guess). With the check in place this is *exact* up to the trivial
rounding of a sum of `n` bounded quantities, and rounding to the nearest integer is provably
correct once `n·(a few ulps) < π`.

**(b) Crossing / ray-casting number** — the integer-arithmetic version. Cast a `+x` ray from
`p`; for each segment `z_k → z_{k+1}` straddling the ray's `y`-level, add `±1` by the sign of
`orient2d(p, z_k, z_{k+1})`. The whole algorithm reduces to **exact sign evaluation of a 2×2
determinant**, computable exactly with Shewchuk-style adaptive predicates (two-product +
two-sum expansions, §5) or trivially over ℚ if the control points are rational. This earns `=`
**unconditionally**: no trigonometry, no branch cuts, no sampling condition, and the degenerate
cases (point on an edge, edge on the ray level) are *decidable*. **Recommendation: make (b) the
authoritative winding number; keep (a) as a cross-check and for the animated argument dial.**

**(c) Argument principle via quadrature** (§2.2) — geometric convergence to a non-integer;
promote to `=` only with a certified `< ½` bound.

**Near-degenerate `p`.** Within a few ulps of the path the *mathematical* answer is undefined,
not merely hard. Compute a certified lower bound on `dist(p, γ)` by interval-evaluating the
point–segment distance over all segments; if it is `> 0` the winding number is certified,
otherwise report "`p` lies on the contour" and refuse.

**The unwinding number** (Corless & Jeffrey, 1996) is the bookkeeping device that makes (a)
rigorous. Defined by

```
U(z) = (z − Log e^z) / (2πi) = ⌈ (Im z − π) / (2π) ⌉ ,    U(z) = 0 ⟺ Im z ∈ (−π, π],
```

it repairs `Log(e^z) = z − 2πi U(z)` and
`Log(z₁z₂) = Log z₁ + Log z₂ − 2πi U(Log z₁ + Log z₂)`. Read in reverse: the winding number of
a discrete path is exactly the accumulated sum of the `U`-corrections that the principal-branch
logarithm discards. Concretely this is what you implement to continue `arg f(z(t))` or
`log f(z(t))` smoothly along the contour for a phase-ribbon visualisation: at each step add the
principal increment and accumulate the unwinding correction — never `atan2` the accumulated
value. Aprahamian & Higham's matrix unwinding function is the same idea one level up.

---

## 5. Certified / interval arithmetic in a browser TS app — the honest verdict

### 5.1 What JavaScript actually guarantees

- `+ − * /` on `Number` are specified as **IEEE 754-2019 binary64, roundTiesToEven** —
  correctly rounded, deterministic, cross-engine identical. Good.
- **There is no directed-rounding control.** No `fesetround`; the 2012 `esdiscuss` proposal for
  directed-rounding intrinsics went nowhere. WebAssembly is the same: round-to-nearest only.
- **There is no FMA.** WASM's `relaxed-simd` `relaxed_madd` is explicitly *non-deterministic*
  (fused or unfused depending on hardware), so it is unusable for error-free transformations.
- `Math.exp`, `log`, `log2`, `log10`, `log1p`, `expm1`, `pow`/`**`, `sin`, `cos`, `tan`, the
  hyperbolics, the inverse trigs, `cbrt` **and `Math.sqrt`** are all **"implementation-approximated"**
  in ECMA-262: the spec defers the definition entirely, recommending (not requiring) fdlibm.
  There is *no* ulp bound of any kind. Engines differ; V8 has changed its `sin`/`cos` more than
  once, and Firefox switched to fdlibm partly for fingerprinting reasons.

### 5.2 Sound directed rounding without rounding modes — this part works

Emulating directed rounding in round-to-nearest via **error-free transformations** is a solved
problem (Kashiwagi; used by default in `IntervalArithmetic.jl` through `RoundingEmulator.jl`).
The pattern, verbatim in structure:

```
add_up(a,b):  (x,y) = TwoSum(a,b);   return y > 0 ? nextafter(x,+∞) : x
add_down(a,b):(x,y) = TwoSum(a,b);   return y < 0 ? nextafter(x,−∞) : x
mul_up(a,b):  (x,y) = TwoProduct(a,b);
              if |x| > 2^(e_minsub+2p) then return y > 0 ? nextUp(x) : x
              else  rescale by 2^⌈−e_minsub/2⌉ and compare exactly   // subnormal path
div_up(a,b):  d = a/b; (x,y) = TwoProduct(d,b);
              return (x < a || (x == a && y < 0)) ? nextUp(d) : d     // self-verifying
sqrt_up(a):   d = √a;  (x,y) = TwoProduct(d,d);
              return (x < a || (x == a && y < 0)) ? nextUp(d) : d
```

plus `±∞`/`floatmax` clamping at overflow. `TwoSum` is Knuth's branch-free 6-operation algorithm
(exact, no ordering assumption). `TwoProduct` without FMA is **Dekker's Veltkamp splitting**
(17 operations, exact provided `|a|,|b| < 2^996` in binary64) — a real cost but a small
constant. `nextafter` is a `Float64Array`/`BigInt64Array` bit bump, ~5 lines. Note `div_up` and
`sqrt_up` are *self-verifying* — they check the candidate against the exact product — so they
are sound whenever the underlying `/` and `√` are within one ulp. That covers the `Math.sqrt`
spec gap in practice (every engine uses hardware `sqrtsd`, correctly rounded by IEEE-754), but
it must be recorded as an explicit, *tested* axiom rather than assumed silently.

### 5.3 Where it breaks: transcendental functions

`exp_up(x) = nextafter(Math.exp(x))` is **not sound**. It is a one-ulp inflation of a quantity
with *no specified error bound at all*. It will be right on every engine you test and wrong on
the one you don't. Any library that does this — and the JS ecosystem's libraries do — is a
heuristic wearing a proof's clothes. This is precisely the failure mode the survey of interval
libraries (Bréhard et al., "Testing interval arithmetic libraries, including their IEEE-1788
compliance") identifies: the serious libraries route elementary functions through **CRlibm** or
**MPFR**, and a library that does not is not IEEE-1788 conformant.

### 5.4 Library survey

| Library | Status |
|---|---|
| `interval-arithmetic` (mauriciopoppe, BSL-1.0) | Port of Boost.Interval. Does have typed-array `nextafter`. Small (~20 kB). But transcendentals are round-to-nearest + 1 ulp ⇒ **not sound**; no IEEE-1788 decorations; low maintenance velocity. |
| `interval-arithmetic-eval` | Expression-level wrapper over the above; same soundness ceiling. Has an explicit toggle to disable outward rounding entirely — telling. |
| `mathjs` | No interval type. Not a candidate. |
| `decimal.js` / `big.js` | Arbitrary-precision *decimal*, correctly rounded arithmetic, but **no interval semantics and no rigorous transcendental error bounds**. Useful for exact rational work, not for enclosures. |
| Arb / FLINT (ball arithmetic, mid-rad) | The gold standard; Arb merged into FLINT in 2023. Rigorous transcendentals, adaptive precision. **`wasm-flint` (sagemathinc)** builds MPFR + MPIR + FLINT to WASM via Emscripten. Real, but multi-megabyte and a heavy integration. |
| `mpfr.js` | Not a maintained project; do not plan around it. |

### 5.5 Verdict

**Sound interval arithmetic in a browser TS app is achievable — with a precisely bounded
scope.** Specifically:

- **Yes, soundly, today, in-bundle, for `+ − × ÷ √` and anything built from them** — i.e. for
  **polynomials and rational functions**, exactly the class where our `=`/`≤` ambitions are
  strongest and where `@cas/exact` and Durand–Kerner already live. Implement a small
  `@cas/interval` (~400 lines, <5 kB gzipped): EFT directed rounding per §5.2, real intervals,
  complex rectangles *and* mid-rad disks (disks are far better behaved for `|f|` bounds on
  circles), interval Horner, and the `|P/Q|` bounds of §6.
- **No, not soundly, for `exp/log/sin/cos/pow` via the platform `Math`.** Two escapes, both real
  work: (i) write our own with *proven* remainders — exact Cody–Waite/Payne–Hanek argument
  reduction plus a minimax polynomial with an explicit interval remainder, for the handful of
  functions the grammar admits (~1–2 kloc, genuinely provable); or (ii) lazily load **Arb/FLINT
  WASM** behind a "Prove it" button, paying the multi-MB download only on that path.
- **Architecture: three explicitly labelled tiers.** `float64` (`≈`, per-frame) →
  `@cas/interval` EFT enclosures (`≤`/`=`, rational `f`, milliseconds) → WASM Arb (`≤`/`=`, any
  `f`, on demand, seconds). Ship tiers 1–2; make tier 3 a documented extension point, not a
  Phase-1 commitment.
- **Do not** ship a "certified" badge backed by `nextafter(Math.exp(x))` — that is precisely the
  silent-error class the repo's honest-labelling guardrail exists to prevent.

---

## 6. Certifying the vanishing of auxiliary arcs

This is the best-value certification target in the whole app, because for rational `f` it needs
**no transcendental functions at all** — so it is fully sound in tier 2 today, and cheap enough
to run per frame.

### 6.1 The coefficient bound for `f = P/Q`

Let `P(z) = Σ_{k=0}^{p} a_k z^k`, `Q(z) = Σ_{k=0}^{q} b_k z^k`, `b_q ≠ 0`. On `|z| = R`:

```
|P(z)| ≤ Σ_{k=0}^{p} |a_k| R^k                                    (triangle inequality)
|Q(z)| ≥ |b_q| R^q − Σ_{k=0}^{q−1} |b_k| R^k   =: q_min(R)        (reverse triangle)
```

`q_min(R) > 0` is guaranteed as soon as `R > 1 + max_{k<q}|b_k/b_q|` — the **Cauchy root bound**,
which simultaneously certifies that *every* pole of `f` lies strictly inside `|z| = R`. Then

```
M(R) := ( Σ |a_k| R^k ) / q_min(R)   ≥   max_{|z|=R} |f(z)| ,
```

and by the `ML` inequality on an arc of angular extent `θ` (length `L = θR`):

```
| ∫_{arc} f dz |  ≤  θ · R · M(R).
```

Asymptotics: `M(R) ~ (|a_p|/|b_q|) R^{p−q}`, so the arc bound behaves like
`θ (|a_p|/|b_q|) R^{p−q+1} → 0` **iff `q ≥ p + 2`** — the classical degree condition, now
*derived* rather than asserted, and displayable: *"|∫_arc| ≤ 3.2×10⁻⁴ at R = 50, and → 0 as
R → ∞ because deg Q − deg P = 3 ≥ 2, giving an `O(R^{−2})` bound."*

Every operation here is `+ × ÷` on non-negative reals, so evaluating the whole thing in tier-2
intervals (round `Σ|a_k|R^k` up, `q_min` down) is `O(p+q)` flops and **sound**. Compute the
powers by interval Horner, not by `Math.pow`.

### 6.2 A sharper lower bound on `|Q|`, when you have certified roots

If `Q(z) = b_q Π_j (z − ζ_j)` and every root satisfies `|ζ_j| ≤ ζ_max` (certified by Smith
inclusion disks around Durand–Kerner output, §2.4), then for `R > ζ_max`

```
|Q(z)| ≥ |b_q| Π_j (R − |ζ_j|) ≥ |b_q| (R − ζ_max)^q .
```

This is much tighter than §6.1 when the roots are clustered well inside `R`, at the cost of
needing certified root enclosures. Use §6.1 as the always-available default and §6.2 as an
opportunistic improvement.

### 6.3 Jordan's lemma with its honest constant

For `f(z) = g(z)e^{iaz}` with `a > 0` and `Γ_R` the upper semicircle:

```
| ∫_{Γ_R} g(z) e^{iaz} dz |  ≤  (π/a) · max_{z∈Γ_R} |g(z)| ,
```

whose entire content is the elementary inequality `∫_0^π e^{−κ sinθ} dθ ≤ π/κ` (from Jordan's
inequality `sinθ ≥ 2θ/π` on `[0, π/2]` plus symmetry). Note the bound is **independent of `R`**
— it beats the naive `ML` bound `πR·max|g|` by the full factor `aR`. Combine with §6.1 applied
to `g`: display *"`|∫_{Γ_R}| ≤ (π/a)·M_g(R)`, and `M_g(R) = O(R^{−1})`, so the arc vanishes."*
For the lower semicircle use `e^{−iaz}`; for quarter/keyhole arcs the same argument runs with
the corresponding angular range and a correspondingly adjusted constant.

### 6.4 When `f` is not rational

Fall back to **interval evaluation over the arc parameter with branch-and-bound bisection**:
enclose `θ ∈ [0,Θ]`, evaluate `|f(Re^{iθ})|` in the natural interval extension, bisect the
sub-interval with the largest upper bound, stop when the global upper and largest lower bounds
meet. Two caveats: the dependency problem makes the natural extension loose — use the mean-value
form `f(c) + f'(I)(I − c)` on small panels, quadratically convergent under bisection; and this
needs sound `exp/sin/cos`, making it a tier-3 (WASM Arb) feature per §5.5. **Prefer the
modulus-only bounds of §6.1 wherever `f`'s structure permits — they sidestep both problems.**

---

## 7. Principal values numerically

For `PV ∫_a^b g(x)/(x − c) dx` with `c ∈ (a,b)`:

1. **Subtract the singularity** (the accuracy workhorse):
   `PV∫ g/(x−c) dx = ∫ (g(x) − g(c))/(x−c) dx + g(c)·log|(b−c)/(c−a)|`.
   The first integrand has a removable singularity; evaluate it cancellation-safely near `x = c`
   — as a divided difference from §3.2's Cauchy/FFT method, not by direct subtraction — and
   integrate with CC. The log term is closed form.
2. **Midpoint rule with the singularity centred.** Trefethen–Weideman §5: for the Hilbert
   transform `PV∫ w(x)/x dx`, the trapezoidal rule converges at essentially the rate of a regular
   integral *provided the singularity is placed midway between two grid points*, i.e. the rule
   becomes the midpoint rule (Kress & Martensen prove it by subtracting `w(0)e^{−x²}/x`). Free
   and exponentially convergent, and for a user-drawn contour we *can* control node placement.
3. **Indented contour / half-residue.** An `ε`-semicircular indentation around a **simple** pole
   contributes `∓iπ·Res` (sign by orientation) — half the residue. This is the analytic bridge
   between "PV of a real integral" and "closed contour with residues"; surface it in the UI as
   the reason the two agree. For order `≥ 2` the symmetric limit does not exist and the app must
   say so (Hadamard finite part is out of scope).
4. **Symmetric-limit display.** Compute `I(ε_k)`, `ε_k = ε_0 2^{−k}`, Richardson/Aitken
   extrapolate in `ε`, show the extrapolation residual as the error bar. Round-off binds — the
   integrand grows like `1/ε` while the integral stays bounded — so cap `k` at the observed noise
   floor and always label `≈`.

---

## 8. Real-time budget

Frame budget at 60 fps is **16.7 ms**; target ≤ 4 ms for math, leaving the rest for layout and
paint. Treat the numbers below as engineering estimates to be replaced by measurements —
`@cas/gpu`'s dual-backend harness already gives us the comparison rig.

**GPU domain colouring.** 1920×1080 is `2.07 × 10⁶` fragments; a degree-10 rational function by
complex Horner is ~40 complex mul-adds ≈ 160 scalar flops, so ~`3.3 × 10⁸` flops/frame — a
rounding error for any GPU of the last decade (integrated parts do multiple TFLOP/s).
**Domain colouring is not the bottleneck at fp32.** `df64` (already in `@cas/gpu`) costs ~10–20×
and is still comfortable at 1080p for moderate degree; gate it behind a zoom threshold. If
needed: cap `devicePixelRatio`, half-resolution during drag, full pass on `pointerup`.

**CPU expression evaluation at ~10⁴ contour points.** A *compiled* evaluator — emit a JS
`Function` body, or a flat register VM over `Float64Array` SoA `re[]`/`im[]`, from the
`@cas/expr` AST — runs simple float ops at roughly `10⁸`/s in a warm JIT. At ~50 ops per point
that is `5 × 10⁵` ops ≈ **well under 1 ms**. A naive AST tree-walk allocating a `{re,im}` per
node is 10–50× slower *and* generates garbage, surfacing as GC jank rather than frame time —
this is the single most consequential implementation choice in the app. `@cas/expr` already has
`evaluate.ts` / `complexJs.ts`; benchmark both shapes before committing.

**Incremental re-evaluation on control-point drag.** Moving one control point of a polyline or
spline perturbs only `O(1)` panels. Keep per-panel partial sums in a **segment tree** (or a flat
array plus a Kahan/Neumaier-compensated total) so a single-point move costs `O(log N)`, not
`O(N)` — and so the total does not drift over thousands of drag frames. Re-run the full
quadrature on `pointerup` and reconcile; disagreement beyond the estimator's bound is a bug
signal worth logging.

**AAA cadence.** `O(Mm³)`: at `M = 10³`, `m = 20` the SVD chain is `≈ Mm³/3 ≈ 2.7 × 10⁶` flops
plus SVD constants — **several milliseconds** in JS, so *not* a per-frame item. Run it in a
module worker (the QD app's worker pattern is the template), debounced to ~10 Hz during drag and
fired eagerly on `pointerup`, with the main thread using the last model for pole subtraction.
The same worker should host the subdivision tree and the tier-2 certification pass.

**Whole-loop rule of thumb.** Per frame: sample `f` at the nodes (<1 ms), trapezoid + one FFT
estimator (~0.1 ms at `N = 4096`), GPU render (GPU-bound), winding number by exact predicates
(`O(N)`, microseconds). Everything expensive — AAA, subdivision root-finding, interval
certification, Arb — is asynchronous and labelled provisional until it lands.

---

## Sources

- L. N. Trefethen and J. A. C. Weideman, *The Exponentially Convergent Trapezoidal Rule*, SIAM Review **56** (2014) 385–458. <https://people.maths.ox.ac.uk/trefethen/publication/PDF/2014_149.pdf> — Theorems 2.1, 2.2, 3.1, 3.2, 5.1, 5.2, 12.1, 12.2; §12 Cauchy integrals; §14 double-exponential rules. [DOI 10.1137/130932132](https://epubs.siam.org/doi/10.1137/130932132)
- Y. Nakatsukasa, O. Sète and L. N. Trefethen, *The AAA Algorithm for Rational Approximation*, SIAM J. Sci. Comput. **40** (2018) A1494–A1522. <https://people.maths.ox.ac.uk/trefethen/AAAfinal.pdf> — barycentric form, Loewner/SVD step, arrowhead pencil (3.11), `prz` residues, §5 Froissart cleanup. [arXiv:1612.00337](https://arxiv.org/abs/1612.00337)
- Y. Nakatsukasa, O. Sète and L. N. Trefethen, *The first five years of the AAA algorithm*. <https://people.maths.ox.ac.uk/trefethen/nak_sete_tref_revised.pdf>
- A. P. Austin, P. Kravanja and L. N. Trefethen, *Numerical Algorithms Based on Analytic Function Values at Roots of Unity*, SIAM J. Numer. Anal. **52** (2014) 1795–1821. <https://people.maths.ox.ac.uk/trefethen/austin_kravanja_trefethen_revised.pdf> — algorithms `[McCune]`, `[Cz1]`, `[Cz2]`, `[LuckStevens]`, `[ratdisk_K]`; Hankel pencil; Froissart regularisation.
- L. N. Trefethen, *Is Gauss Quadrature Better than Clenshaw–Curtis?*, SIAM Review **50** (2008) 67–87. <https://dl.acm.org/doi/10.1137/060659831>
- P. Kravanja and M. Van Barel, *Computing the Zeros of Analytic Functions*, Lecture Notes in Math. 1727, Springer (2000); and *ZEAL: a mathematical software package for computing zeros of analytic functions*, Comput. Phys. Comm. **124** (2000). <https://www.sciencedirect.com/science/article/abs/pii/S0010465599004294>
- L. M. Delves and J. N. Lyness, *A numerical method for locating the zeros of an analytic function*, Math. Comp. **21** (1967) 561–577.
- J. N. Lyness and C. B. Moler, *Numerical differentiation of analytic functions*, SIAM J. Numer. Anal. **4** (1967) 202–210; J. N. Lyness and G. Sande, *Algorithm 413: ENTCAF and ENTCRE*, Comm. ACM **14** (1971) 669–675.
- W.-J. Beyn, *An integral method for solving nonlinear eigenvalue problems*, Linear Algebra Appl. **436** (2012) 3839–3863. <https://www.sciencedirect.com/science/article/pii/S0024379511002540>; overview slides: <https://personal.math.vt.edu/embree/enla_talk.pdf>
- F. Bornemann, *Accuracy and Stability of Computing High-Order Derivatives of Analytic Functions by Cauchy Integrals*, Found. Comput. Math. **11** (2011) 1–63. <https://arxiv.org/abs/0910.1841>; *Optimal Contours for High-Order Derivatives*, <https://arxiv.org/abs/1107.0498>
- R. M. Corless and D. J. Jeffrey, *The Unwinding Number*, SIGSAM Bulletin (1996). <https://faculty.e-ce.uth.gr/akritas/CE102/p28-corless.pdf>; N. J. Higham, *What Is the Matrix Unwinding Function?* <https://nhigham.com/2020/12/01/what-is-the-matrix-unwinding-function/>; Corless & Jeffrey, *Winding Numbers, Unwinding Numbers, and the Lambert W Function*, CMFT (2021). <https://link.springer.com/article/10.1007/s40315-021-00398-1>
- L. af Klinteberg and A.-K. Tornberg, *Adaptive quadrature by expansion for layer potential evaluation in two dimensions*. <https://arxiv.org/abs/1704.02219>; *Accurate quadrature of nearly singular line integrals … by singularity swapping*. <https://arxiv.org/abs/1910.09899>
- Interval arithmetic soundness: N. Revol et al., *Testing interval arithmetic libraries, including their IEEE-1788 compliance*. <https://arxiv.org/pdf/2205.11837> — EFT-based rounding emulation in `IntervalArithmetic.jl`; conformance failure modes.
- `RoundingEmulator.jl` (JuliaIntervals) — `add_up`/`mul_up`/`div_up`/`sqrt_up` reference implementations. <https://github.com/JuliaIntervals/RoundingEmulator.jl> (source: `src/rounding.jl`); after M. Kashiwagi, *Emulation of rounded arithmetic in rounding to nearest*.
- `interval-arithmetic` (Boost port, typed-array `nextafter`). <https://github.com/mauriciopoppe/interval-arithmetic>; `interval-arithmetic-eval`. <https://www.npmjs.com/package/interval-arithmetic-eval>
- Arb / FLINT ball arithmetic: F. Johansson, *Arb: Efficient Arbitrary-Precision Midpoint-Radius Interval Arithmetic*. <https://arxiv.org/pdf/1611.02831>; <https://flintlib.org/doc/overview.html>; WASM build: <https://github.com/sagemathinc/wasm-flint>
- ECMA-262 §21.3 Math object, "implementation-approximated" facilities and the fdlibm recommendation. <https://tc39.es/ecma262/multipage/numbers-and-dates.html>; discussion of exactly which operations are guaranteed: <https://zenn.dev/uhyo/articles/javascript-math-accuracy?locale=en>; directed-rounding proposal history: <https://esdiscuss.org/topic/directed-rounding>
- WebAssembly relaxed-SIMD FMA non-determinism. <https://github.com/WebAssembly/relaxed-simd/blob/main/proposals/relaxed-simd/Overview.md>, issue #44 "Add a deterministic FMA".
- Jordan's lemma statement and the `∫₀^π e^{−κ sinθ}dθ ≤ π/κ` constant. <https://en.wikipedia.org/wiki/Jordan%27s_lemma>
- Gauss–Kronrod adaptive error estimation. <https://arxiv.org/pdf/1003.4629>; MATLAB `quadgk` complex-waypoint contour integration. <https://www.mathworks.com/help/matlab/ref/quadgk.html>
