> Research track 3 for `apps/polynomial-root-analysis`. Surveyed 2026-09-22 by a research agent; `⚠ verify`
> marks a constant or section number not confirmed from a primary source, and four named explorables
> could not be confirmed to exist and are listed as unverified leads. The overlay catalogue behind PLAN
> §7 PRA-2/PRA-9. Corrections as dated notes.

# Research 03 — Visualising and analysing the roots of a complex polynomial

_For the planned "Polynomial Roots" app: roots in ℂ, draggable coefficients (roots follow) and
draggable roots (coefficients follow via Vieta), a root pane and a coefficient pane with an overlay
toggle, GPU domain colouring of p(z). TypeScript + Canvas/WebGL2. Written 2026-09-22._

Conventions used below: `p(z) = Σ_{k=0}^{n} a_k z^k`, monic unless said otherwise, roots `r_1..r_n`,
critical points `c_1..c_{n-1}` (roots of `p'`), discriminant `Δ = ∏_{i<j}(r_i − r_j)²`. Where a
constant or a chapter number could not be verified from a primary source it is marked **⚠ verify**.
Labels follow the suite's honest-labelling rule: `=` exact, `≤` certified bound, `≈` estimate.

---

## 0. The two facts everything else hangs on

1. **Vieta is a polynomial map and its inverse is not.** `V: ℂⁿ → ℂⁿ`, `(r_1..r_n) ↦ (a_0..a_{n−1})`,
   `a_{n−k} = (−1)^k e_k(r)`. It is a polynomial (so dragging a root moves every coefficient
   smoothly and cheaply — `O(n)` per root move by multiplying out, or `O(n)` incremental update via
   synthetic division/multiplication by `(z − r_new)/(z − r_old)`). Its inverse is the root-finding
   problem: continuous, but only _analytic away from the discriminant_ and with _fractional-power_
   behaviour on it. Every pedagogical surprise in the app (roots "exploding", roots swapping after a
   loop, Wilkinson) is a consequence of this asymmetry. §1 and §6.
2. **`log|p(z)| = Σ log|z − r_i|` is the 2-D electrostatic potential of unit charges at the roots.**
   So domain colouring of `p` is a picture of a charge configuration, critical points are the field's
   equilibria, lemniscates are equipotentials, phase lines are field lines, and the suite's
   2D Electrostatics / Potential Theory apps are already drawing the same object. §2.7–2.9.

---

## 1. Continuous dependence of roots on coefficients

### 1.1 The theorem, and the shape of the continuity

**Statement.** The map from coefficient space to the unordered `n`-tuple of roots, `ℂⁿ → Symⁿ(ℂ)`, is
continuous; equivalently, for every `ε > 0` there is `δ` such that `‖a − b‖ < δ` implies the roots of
`p_a` and `p_b` can be matched one-to-one with `|r_i − s_i| < ε` (the _matching distance_). Proofs:
Rouché (each root of `p_a` of multiplicity `m` has a small disc that `p_b` still has exactly `m` roots
in), or the implicit function theorem at simple roots + a compactness argument. Recent short proofs written for teaching:
**"Yet another proof that the roots of a polynomial depend continuously on the
coefficients"** (arXiv 2207.00123, 2022) and **"Continuity of the roots of a polynomial"**
(arXiv 2206.13013, 2022).

- https://arxiv.org/abs/2207.00123 · https://arxiv.org/abs/2206.13013

**Analyticity off the discriminant.** At a simple root `r` (`p'(r) ≠ 0`), the implicit function
theorem gives `r = r(a)` holomorphic in all `n` coefficients, with

    ∂r/∂a_k = − r^k / p'(r),           p'(r) = ∏_{j≠i}(r − r_j)  (monic).

This is the whole "roots follow coefficients" differential: a first-order drag of `a_k` by `δ` moves
root `r_i` by `−δ r_i^k / p'(r_i)`. The sensitivity is large exactly when `p'(r_i)` is small, i.e.
when other roots are near.

**Puiseux behaviour at a multiple root.** If `r` has multiplicity `m` and the coefficients are moved
by `ε` along a generic direction, the `m` roots split as

    r_j(ε) = r + ω^j · (m! · ε·q(r) / p^{(m)}(r))^{1/m} + O(ε^{2/m}),   ω = e^{2πi/m}, j = 0..m−1

— a _regular `m`-gon_ of radius `~ ε^{1/m}` about `r`, rotating by `2π/m` (i.e. permuting cyclically)
as `ε` circles once around 0. The exponent `1/m` is the "explosive sensitivity": at a double root a
coefficient perturbation of `1e−16` moves roots by `1e−8`; at a 20-fold root by `1e−0.8 ≈ 0.16`.
Reference: Puiseux's theorem; for a modern account of the whole perturbation theory (Rellich,
splitting lemma, Newton polygon for which power appears), **Rainer, "Perturbation theory of polynomials
and linear operators"** (arXiv 2308.01299, 2023; handbook chapter).

- https://arxiv.org/abs/2308.01299

**How to compute and draw.**

- _Local sensitivity discs (`≈`, first order):_ around each simple root draw the disc of radius
  `ε · Σ_k |r_i|^k / |p'(r_i)|` (absolute coefficient perturbation `|δa_k| ≤ ε`) or
  `ε · Σ_k |a_k||r_i|^k / |p'(r_i)|` (relative). This is the linearised pseudozero component (§1.4)
  and Wilkinson's condition number (§1.3) made visible. `O(n)` per root, trivial.
- _Puiseux fan (`≈`):_ when the user drags two roots together (or the drag crosses the discriminant),
  show the `m`-gon of predicted split directions with radius `ε^{1/m}`; animate `ε` circling to show
  the cyclic permutation. Compute `p^{(m)}(r)` by Taylor shift (Horner `m` times).
- _Continuity strip:_ dragging a coefficient along a path draws the root trajectories (§3.5 root locus;
  §6.3 braid).

### 1.2 Ostrowski's theorem with explicit bounds

Ostrowski (1940; _Solution of Equations_, 1966/1973, Appendix A) gives the quantitative form. In the
statement of Rahman & Schmeisser, _Analytic Theory of Polynomials_ (OUP 2002), Thm 1.3.1 **⚠ verify
constants**: for monic `f = Σ a_ν z^ν`, `g = Σ b_ν z^ν` of degree `n`, put

    γ = 2 · max_{0≤ν<n} ( |a_ν|^{1/(n−ν)}, |b_ν|^{1/(n−ν)} ),
    ε = ( Σ_{ν=0}^{n−1} |a_ν − b_ν| · γ^ν )^{1/n} ;

then the zeros can be enumerated so that `|α_ν − β_ν| ≤ 2n · ε` for all `ν`. The point to teach is the
**`1/n`-th power**: the worst case (all roots coincident) really does behave like `ε^{1/n}`, and no
bound linear in the coefficient perturbation can hold uniformly. Sharper matching-distance bounds:
**Bhatia, Elsner & Krause (1990), "Bounds for the variation of the roots of a polynomial and the
eigenvalues of a matrix", Lin. Alg. Appl. 142** (constant `4·2^{−1/n}` in terms of
`(Σ|a_k − b_k| M^k)^{1/n}` with all roots in `|z| ≤ M` **⚠ verify**); and the survey of what is better
"by a factor n to 2n" than Ostrowski in special situations is **Rump, "Ten methods to bound multiple
roots of polynomials", J. Comput. Appl. Math. 156 (2003) 403–432**.

- https://www.sciencedirect.com/science/article/pii/S0377042703003819
- Beauzamy's local Lipschitz version: "How the roots of a polynomial vary with its coefficients: a
  local quantitative result" (Canad. Math. Bull. 42, 1999) **⚠ verify citation**.

_Draw:_ a "guaranteed matching radius" `≤` circle of radius `2nε` about each root when the user
compares two polynomials (e.g. the exact one and the float one, or before/after a drag) — almost
always uselessly large (it is a worst case over all configurations), which is itself the lesson: the
_global_ bound is `ε^{1/n}`, the _local_ one at a well-separated root is linear.

### 1.3 The Vieta map as a branched covering; Wilkinson; conditioning

**Branched covering.** `V` is invariant under `S_n` and induces a biholomorphism `ℂⁿ/S_n = Symⁿ(ℂ) → ℂⁿ`
(the fundamental theorem of symmetric polynomials). So `V: ℂⁿ → ℂⁿ` is a branched covering of degree
`n!`, branched exactly over the **discriminant hypersurface** `Δ = 0`, and the Jacobian is the
Vandermonde:

    det ∂(e_1,…,e_n)/∂(r_1,…,r_n) = ± ∏_{i<j} (r_i − r_j)   (so |det| = |Δ|^{1/2}).

The complement `ℂⁿ \ {Δ = 0}` (monic squarefree polynomials = unordered configuration space
`UConf_n(ℂ)`) has fundamental group the **braid group `B_n`** (Fox–Neuwirth 1962; Arnold, "On some
topological invariants of algebraic functions", 1970). A loop of coefficients avoiding `Δ = 0` returns
the root _set_ to itself but permutes the roots (monodromy) — and, more finely, braids them (§6.3).

- Jenny Wilson, "Five definitions of the (pure) braid group": https://websites.umich.edu/~jchw//RTG-Braids.pdf
- Fang, "Braid groups in configuration spaces and mapping class groups" (REU 2025): http://math.uchicago.edu/~may/REU2025/REUPapers/Fang.pdf

**Wilkinson's polynomial** `w(x) = ∏_{k=1}^{20}(x − k)`: perturbing the `x^{19}` coefficient by
`2^{−23} ≈ 1.2e−7` sends roots 10…19 into five complex-conjugate pairs with imaginary parts up to
`≈ 2.8`. Wilkinson (1963, _Rounding Errors in Algebraic Processes_; 1984 "The perfidious polynomial",
in _Studies in Numerical Analysis_, ed. Golub, MAA, pp. 1–28: "the most traumatic experience in my
career as a numerical analyst"). The mechanism is exactly `∂r/∂a_19 = −r^{19}/w'(r)`: at `r = 20`,
`w'(20) = 19!` while `20^{19}` is `≈ 5e24`, ratio `≈ 4.3e7`, so the root moves `4.3e7 × 1.2e−7 ≈ 5`.

- https://en.wikipedia.org/wiki/Wilkinson%27s_polynomial
- Corless & Sevyeri, "The Runge example for interpolation and Wilkinson's examples for rootfinding"
  (arXiv 1804.08561, 2018) — Wilkinson in the Lagrange basis is _well_ conditioned; the basis, not the
  polynomial, is perfidious. Directly relevant: a root-pane app can carry the polynomial in
  **root form** and never suffer this.
- thatsmaths, "The rambling roots of Wilkinson's polynomial" (2020) — the standard picture of the
  roots' paths as the perturbation grows: https://thatsmaths.com/2020/01/30/the-rambling-roots-of-wilkinsons-polynomial/

**Condition number of a simple root** (Wilkinson; Gautschi 1973): for perturbations
`|δa_k| ≤ ε|a_k|` (componentwise relative),

    |δr| ≲ ε · κ(r),    κ(r) = Σ_k |a_k| |r|^k / |p'(r)|      (absolute form: Σ_k |r|^k / |p'(r)|).

`κ` is dimensionless-ish, cheap (`O(n)`), and is the natural per-root readout ("this root is
`1e7`× more sensitive than the coefficients"). For a root of multiplicity `m` the linear `κ` is infinite
and the honest readout is the Puiseux radius `(m! ε Σ|a_k||r|^k / |p^{(m)}(r)|)^{1/m}`.

### 1.4 Pseudozero sets — the exact, drawable version of conditioning

**Definition (Mosier 1986; Toh–Trefethen 1994).** The `ε`-pseudozero set is the set of all roots of all
polynomials within `ε` of `p`:

    Z_ε(p) = { z : p̃(z) = 0 for some p̃ with ‖p̃ − p‖ ≤ ε }
           = { z : |p(z)| ≤ ε · ‖(1, z, …, z^n)‖_* }

where `‖·‖_*` is the dual of the norm used on coefficient vectors. Three useful choices:

- absolute ∞-norm on coefficients (Mosier's "root neighbourhoods"): `|p(z)| ≤ ε Σ_k |z|^k`;
- 2-norm (Toh–Trefethen): `|p(z)| ≤ ε (Σ_k |z|^{2k})^{1/2}`;
- componentwise relative: `|p(z)| ≤ ε Σ_k |a_k||z|^k` (the one matching floating-point coefficient
  rounding, `ε = u`).
  The set is a _generalised lemniscate_. **Mosier's theorem:** each connected component of `Z_ε(p)`
  contains at least one root of `p`, and _every_ polynomial within `ε` of `p` has the _same number_ of
  roots in each component (by Rouché). So a component enclosing `k` roots is an honest `=`-labelled
  statement about the whole `ε`-ball of polynomials — "any polynomial this close to yours has exactly
  `k` roots in this blob". **Toh–Trefethen:** for the companion matrix `C` of `p` and a suitable weighted
  norm, `Z_ε(p)` coincides with the `ε`-pseudospectrum of `C`, which is why MATLAB's `roots` (eig of
  the balanced companion) is backward-stable in the _matrix_ sense but not the _polynomial_ sense
  (Edelman & Murakami, "Polynomial roots from companion matrix eigenvalues", Math. Comp. 64, 1995).
- Mosier, "Root neighborhoods of a polynomial", Math. Comp. 47 (1986) 265–273: https://www.ams.org/journals/mcom/1986-47-175/S0025-5718-1986-0842134-4/
- Toh & Trefethen, "Pseudozeros of polynomials and pseudospectra of companion matrices", Numer. Math. 68 (1994) 403–425 (doi 10.1007/s002110050069).
- Trefethen & Embree, _Spectra and Pseudospectra_ (Princeton 2005), the section on companion matrices / polynomial zeros (the book is 60 self-contained sections; **⚠ verify section number**): https://press.princeton.edu/books/hardcover/9780691119465/spectra-and-pseudospectra
- Graillat & Langlois, "Real and complex pseudozero sets for polynomials with applications", RAIRO-ITA 41 (2007): http://www.numdam.org/item/ITA_2007__41_1_45_0/ (also the _real_ pseudozero set — only real perturbations allowed — which is a different, thinner shape, relevant when the app is in "real coefficients" mode).
- Hinrichsen & Kelb, "Root neighborhoods, generalized lemniscates, and robust stability" (AAECC 2007): https://link.springer.com/article/10.1007/s00200-006-0027-4

**GPU computation (the natural fit).** Per pixel: Horner for `p(z)` (`n ≤ 30` is ~30 complex fmas),
`w(z) = Σ|a_k||z|^k` by a real Horner in `|z|`, then `g(z) = log|p(z)| − log w(z)`. Draw

- the level sets `g = log ε` for a ladder `ε = 10^{−16}, 10^{−12}, …, 10^{−2}` as isolines (the same
  isoline machinery as the suite's contour-integration stage modes), and/or
- a fill: colour by `⌊−log10(|p|/w)⌋` — "how many digits of coefficient perturbation would it take to
  put a root here" — this is the most informative single picture of conditioning there is, and it
  is _free_ given the domain-colouring shader.
  Precision: `|p(z)|` itself underflows/rounds in float32 near a root, but `g` only needs to be right
  where `|p|/w > 1e−7`; for smaller `ε` compute on the CPU in float64 along a coarse grid or use the
  suite's df64 path. The pseudozero level `ε = u ≈ 1.1e−16` (float64 rounding of coefficients) is
  the honest "numerical root cloud" and should be drawn by default around each root, labelled `≈`
  unless computed in float64 with a certified evaluation bound (Higham: `|fl(p(z)) − p(z)| ≤ γ_{2n} Σ|a_k||z|^k`).

**Value.** Research-grade: it _is_ the conditioning picture used in numerical analysis. Pedagogic:
makes Wilkinson visible as a single blob around `10..19` at `ε = 1e−7`, and shows that the same
`ε` gives tiny circles for roots of unity.

---

## 2. Geometric theorems to overlay

### 2.1 Gauss–Lucas (critical points lie in the convex hull of the roots)

`p'/p = Σ_i 1/(z − r_i)`. At a critical point `c` that is not a root, `Σ 1/(c − r_i) = 0`; conjugating,
`Σ (c − r_i)/|c − r_i|² = 0`, i.e. `c = Σ w_i r_i / Σ w_i` with `w_i = 1/|c − r_i|² > 0` — a convex
combination. Gauss stated it in 1836 (in the electrostatic language of §2.7); Lucas published 1874.
Corollary: the convex hull of the critical points is inside that of the roots; iterating derivatives
gives nested hulls ("Lucas–Gauss Theorem" Wolfram Demonstration draws exactly the nested polygons).
Strengthening for roots strictly inside: Dimitrov / Rüdinger, "Strengthening the Gauss–Lucas theorem
for polynomials with zeros in the interior of the convex hull" (arXiv 1405.0689).

- https://en.wikipedia.org/wiki/Gauss%E2%80%93Lucas_theorem
- https://demonstrations.wolfram.com/LucasGaussTheorem/

_Compute:_ critical points = roots of `p'` (same root finder, degree `n−1`); convex hull by Andrew's
monotone chain, `O(n log n)`. _Draw:_ hull polygon; critical points as a second glyph; optional nested
hulls of `p'', p''', …`. _Value:_ the first overlay any student expects; cheap; the app's drag makes it
a live theorem (drag a root outside — the critical points _cannot_ escape).

### 2.2 Marden's theorem (Siebeck 1864 / Bôcher 1892 / Grace 1902 / Marden 1945–66; Kalman 2008)

For a cubic with non-collinear roots, the critical points are the **foci of the Steiner inellipse** —
the unique ellipse inscribed in the root triangle, tangent to the sides at their midpoints. Its centre
is the centroid `(r_1+r_2+r_3)/3`, which is also the root of `p''`. Siebeck's general theorem: the
critical points of a degree-`n` polynomial are the foci of a curve of class `n−1` that touches each
segment `[r_i, r_j]` at its midpoint (a class-`(n−1)` curve — not simply drawable for `n ≥ 4`; state it, don't draw it).

- Kalman, "An elementary proof of Marden's theorem", Amer. Math. Monthly 115 (2008) 330–338.
- https://en.wikipedia.org/wiki/Marden%27s_theorem · https://en.wikipedia.org/wiki/Steiner_inellipse
- Bogosel, "A geometric proof of the Siebeck–Marden theorem" (AMM 2017); Northshield's generalisation and
  the Siebeck–Marden–Northshield theorem for real roots (Results Math. 2022, arXiv 2107.01847).
- "A generalization of the Bôcher–Grace theorem" (arXiv 0910.2446) — the `n = 3` case as `N`-body vortex equilibria.
- Wolfram Demonstration "Marden's Theorem" (Torrence 2008); GeoGebra https://www.geogebra.org/m/sKTVQnC8

_Compute (`=`, degree 3 only):_ `c_{1,2}` from the quadratic `p'`; the ellipse has foci `c_1, c_2`
and passes through a side midpoint `m`, so `2a = |m − c_1| + |m − c_2|`, `2c = |c_1 − c_2|`,
`b = √(a² − c²)`, axis direction `arg(c_2 − c_1)`. Draw with `ctx.ellipse`. Show the three tangency
points. _Value:_ high — the most beautiful cubic fact there is, and dragging a root shows the
ellipse deform and the foci move; also the natural "why does the centroid = root of `p''`" moment.

### 2.3 Sendov's conjecture (1958)

If all roots lie in `|z| ≤ 1`, then for each root `r_i` the closed unit disc `|z − r_i| ≤ 1` contains
a critical point. Proven for `n ≤ 8` (Brown & Xiang 1999) and for all sufficiently large `n`
(**Tao, Acta Math. 229 (2022), arXiv 2012.04125, posted Dec 2020**). Tao's blog in Aug 2026 is titled
"A digestion of the proof of Sendov's conjecture" — **⚠ verify whether a full proof has since appeared**
(https://terrytao.wordpress.com/2026/08/12/a-digestion-of-the-proof-of-sendovs-conjecture/).
Extremal case: `z^n − 1`, where every root is at distance exactly 1 from the only critical point (0).

- https://en.wikipedia.org/wiki/Sendov%27s_conjecture · https://arxiv.org/abs/2012.04125
- Bogosel, "Sendov's conjecture and the geometry of cubic polynomials": https://beniamin-bogosel.github.io/pdfs/Sendov.pdf

_Compute/draw:_ a "Sendov mode" that rescales so the roots fit `|z| ≤ 1` (scaling `z ↦ λz` scales
roots and critical points together), draws the unit disc and a unit circle about each root, colours
each circle by whether it contains a critical point, and prints the **Sendov slack**
`s = max_i min_j |r_i − c_j|` (`≈`, conjecture says `s ≤ 1`). Let the user _try_ to break it. _Value:_
research-flavoured, cheap, and open at small `n` only in the sense of being proven — an honest
"conjecture" badge.

### 2.4 Root bounds as circles

All from |z| large ⇒ leading term dominates; each is a `≤`-certified circle containing all roots:

- **Cauchy (1829):** `|z| ≤ 1 + max_{k<n} |a_k/a_n|`. Sharper: the **Cauchy radius** = the unique
  positive root of `|a_n| x^n − Σ_{k<n} |a_k| x^k` (one real Newton/bisection solve; the best bound of
  the "modulus polynomial" type).
- **Lagrange:** `|z| ≤ max(1, Σ_{k<n} |a_k/a_n|)`.
- **Fujiwara (1916):** `|z| ≤ 2 max( |a_{n−1}/a_n|, |a_{n−2}/a_n|^{1/2}, …, |a_1/a_n|^{1/(n−1)}, |a_0/(2a_n)|^{1/n} )`.
- **Kojima:** `|z| ≤ 2 max( |a_{n−1}/a_n|, |a_{n−2}/a_{n−1}|, …, |a_0/(2a_1)| )` (nonzero coefficients).
- **Hölder-norm family:** `|z| ≤ (1/|a_n|) ‖( |a_n|, ‖(|a_{n−1}|,…,|a_0|)‖_h )‖_k`, `1/h + 1/k = 1`.
- **Lower bounds** by applying any of these to the reversed polynomial `z^n p(1/z)`: an annulus.
- **Eneström–Kakeya (1893/1912):** real `a_k > 0` ⇒ all roots in the annulus
  `min_k a_k/a_{k+1} ≤ |z| ≤ max_k a_k/a_{k+1}`; in particular `0 < a_0 ≤ a_1 ≤ … ≤ a_n` ⇒ `|z| ≤ 1`.
  Only meaningful in the app's "positive real coefficients" mode.
- Survey with all formulas: https://en.wikipedia.org/wiki/Geometrical_properties_of_polynomial_roots ;
  E–K generalisations: Gardner & Govil, "Eneström–Kakeya theorem and some of its generalizations" (Springer 2014),
  https://arxiv.org/pdf/1711.09517 ; near-optimal worst-case max-modulus bounds: arXiv 2411.16385 (2024).
- Wolfram Demonstration: "The Eneström–Kakeya bounds for roots of a polynomial with positive coefficients".

_Draw:_ a "bounds" picker drawing each circle in the root pane with its name and radius; show how
loose each is (ratio to `max|r_i|`). _Value:_ medium pedagogically (every textbook has them), but they
are the certified `≤` rows for the analysis panel (§5) and the outer radius for Rouché counts.

### 2.5 Rouché / the argument principle as a root counter

`#{roots in D} = (1/2πi) ∮_{∂D} p'/p dz = winding number of p(∂D) about 0`. The suite already has an
Argument Principle app; the root app can draw `p(∂D)` for a user-dragged disc in the _value_ pane and
count the winding — exactly decided if the disc boundary is polygonised and winding computed with
exact-sign predicates (the contour-integration app has this kernel). **Pellet's theorem (1881)** is the
algebraic cousin and the workhorse of certified counting (§5): if for some `k` and `r > 0`

    |a_k| r^k > Σ_{j≠k} |a_j| r^j

then `p` has exactly `k` roots in `|z| < r` and none on `|z| = r` (Rouché applied to `a_k z^k`).
Apply it to the Taylor-shifted polynomial `p(c + r w)` to test any disc `D(c, r)`: `O(n²)` per test.

### 2.6 Grace–Walsh–Szegő and apolarity

Two degree-`n` polynomials `f = Σ C(n,k) a_k z^k`, `g = Σ C(n,k) b_k z^k` are **apolar** if
`Σ_k (−1)^k C(n,k) a_k b_{n−k} = 0`. **Grace's theorem (1902):** if `f, g` are apolar and all roots of `f`
lie in a closed circular region `C` (disc, half-plane, or disc exterior), then `g` has at least one root
in `C`. **Walsh's coincidence theorem (1922) / Szegő (1922):** for a symmetric multiaffine `F(z_1..z_n)`
and points `ζ_i` in a circular region `C` (convex, or `F` of full degree), there is `ζ ∈ C` with
`F(ζ_1..ζ_n) = F(ζ,…,ζ)`. Gauss–Lucas, Laguerre's theorem and much of Marden's _Geometry of Polynomials_
(AMS 1949/1966) follow. Modern importance: the Borcea–Brändén theory of stability preservers.

- https://en.wikipedia.org/wiki/Grace%E2%80%93Walsh%E2%80%93Szeg%C5%91_theorem ;
  "A converse to the Grace–Walsh–Szegő theorem" (arXiv 0809.3225); "Slices of stable polynomials and
  connections to the GWS theorem" (arXiv 2402.05905); Rahman & Schmeisser ch. 3.

_Draw:_ an "apolar partner" panel: given `p`, let the user pick a circular region containing all roots
and a second polynomial constrained to be apolar (one linear condition on its coefficients — solve for
one coefficient); highlight the guaranteed root in `C`. _Value:_ low-to-medium for the general public,
high for the research audience (this is the engine behind half the geometry-of-polynomials
literature). Cost small once the two-polynomial UI exists.

### 2.7 Jensen's theorem (real coefficients)

For `p` with real coefficients, every **non-real** critical point lies in the union of the **Jensen
discs** — the closed discs whose diameters are the segments `[r, r̄]` joining conjugate non-real root
pairs (Jensen 1913, Walsh 1920; Walsh's generalisations AMM 1955, 1961). Sharper than Gauss–Lucas for real
polynomials. Real critical points lie between consecutive real roots by Rolle.

- https://mathworld.wolfram.com/JensensTheorem.html

_Draw:_ in "real coefficients" mode (roots dragged in conjugate pairs), draw the Jensen discs; show
that as a conjugate pair moves towards the axis the disc shrinks and the two critical points it
carries are squeezed onto the axis. Cheap. _Value:_ medium-high; it is the theorem about the app's
most common state (real polynomials).

### 2.8 The electrostatic interpretation, and the link to the suite

`Φ(z) = log|p(z)| = Σ log|z − r_i|` is the potential of `n` unit positive 2-D charges (or vortices) at
the roots; the field is `∇Φ = conj(p'/p)`. Hence:

- critical points of `p` ⇔ equilibrium points of the field (Gauss's own reading, 1836);
- `|p| = c` lemniscates ⇔ equipotentials; `arg p = const` ⇔ field lines; domain colouring of `p` _is_
  the electrostatics picture;
- Gauss–Lucas ⇔ "a test charge outside the hull is pushed away";
- Bôcher–Grace / vortex equilibria (arXiv 0910.2446).
  The suite's **2D Electrostatics** app draws `W = Σ q_k log(z − z_k)`, i.e. `log p` when all `q_k = 1`
  — a one-line `@cas/interchange` hand-off _roots → charges_ (and back: a charge configuration with
  integer charges is a polynomial with multiplicities). The **Potential Theory** app's equilibrium
  measure / Fekete overlays connect via §4.5.

### 2.9 Lemniscates and level sets of |p|

`Λ_c = {|p(z)| = c}`. Facts worth showing:

- Topology changes only at **critical values** `c = |p(c_j)|`: for `c` below the smallest critical
  value the set `{|p| < c}` has `n` components (one per root, if roots simple); each time `c` passes a
  critical value two components merge (a figure-eight at the critical point); above the largest it is
  a single Jordan curve. The "lemniscate tree" (Epstein, Hanin & Lundberg, "The lemniscate tree of a
  random polynomial", 2018, arXiv 1806.00521) is the binary tree of these merges.
- **Capacity:** for monic `p` of degree `n`, `cap({|p| ≤ c}) = c^{1/n}` exactly — a `=` fact the
  Potential Theory app can verify numerically.
- Hilbert's lemniscate theorem: any Jordan curve is approximable by polynomial lemniscates.
- Erdős–Herzog–Piranian (1958) problems: the conjecture that among monic degree-`n` polynomials the
  unit lemniscate `|p| = 1` of `z^n + 1` (the "Erdős lemniscate") has maximal length; Eremenko & Hayman,
  "On the length of lemniscates" (1999), proved the length is `≤ 9.173 n` **⚠ verify constant**:
  https://www.math.purdue.edu/~eremenko/dvi/erdos23.pdf ;
  components problem: arXiv 2312.13673; area: arXiv 2503.18270; Khavinson et al. "Polynomial lemniscates
  and their fingerprints" (survey): http://shell.cas.usf.edu/~dkhavins/files/Polynomial%20lemniscates.pdf

_Draw (GPU):_ isolines of `log|p|` at the critical values — the singular lemniscates through each
critical point — on top of the domain colouring; a slider `c` sweeping through them; the merge tree
in a side panel. All per-pixel Horner. _Value:_ high; it is the picture that explains what the
modulus colouring means and why critical points matter.

---

## 3. Iterative root-finding as a visual

### 3.1 Newton fractal / basins

`N(z) = z − p(z)/p'(z)`; each root is a superattracting fixed point; the basin boundary is the Julia
set of `N`, common to all basins (Cayley 1879 for the cubic; the picture is the origin of complex
dynamics). Per pixel: iterate `N` (Horner for `p`, `p'` together), stop when within `tol` of a root,
colour by root index, shade by iteration count or by the last step's log-distance for smooth shading.
Trivial in GLSL at `n ≤ 30`; `≈` labelled (a pixel's basin is decided numerically).

- **Hubbard, Schleicher & Sutherland, "How to find all roots of complex polynomials by Newton's
  method", Invent. Math. 146 (2001) 1–33**: a universal set of `≈ 1.11 d log² d` starting points on
  `⌈0.26 log d⌉` circles (roots normalised into the unit disc) from which Newton finds _all_ roots; the
  immediate basin of each root has as many _channels to ∞_ as it has critical points, each of modulus
  `≥ π/log d`. https://www.math.stonybrook.edu/~scott/Papers/Newton-HSS.pdf ;
  https://pi.math.cornell.edu/~hubbard/NewtonInventiones.pdf
- "How to split a tera-polynomial" (Schleicher et al., arXiv 2402.06083) — Newton at degree 10¹².
- Cubic Newton parameter space (Roesch–Wang, "Moduli space of cubic Newton maps", arXiv 1512.05098) —
  the "Mandelbrot set inside the Newton fractal" picture popularised by 3Blue1Brown (2021).

_Draw:_ GPU basins as a stage mode; overlay the HSS starting circles (a nice `=`-labelled statement:
"from these points Newton provably finds every root"); on hover, draw the Newton orbit from the cursor
as a polyline. **Newton on the sphere:** render the same basins on an orthographic/stereographic
Riemann sphere (the suite's CD app has sphere rendering idioms) — `∞` is a repelling fixed point of
`N` with multiplier `n/(n−1)`, and the channels are visible as "rays" reaching the north pole.

### 3.2 Kalantari's Basic Family and polynomiography

The Basic Family `B_m` (`B_2` = Newton, `B_3` = Halley, …, order `m` convergence) built from the
determinants `D_m` of Toeplitz matrices of `p^{(k)}/k!`. **Kalantari's Voronoi theorem** (Discrete
Comput. Geom. 46 (2011) 187–203): as `m → ∞`, the basins of `B_m` converge to the **Voronoi cells of
the roots**. "Polynomiography" (Kalantari's term, patented) = colouring by iteration function; Leonardo
38 (2005) "Polynomiography: from the Fundamental Theorem of Algebra to art"; SIGGRAPH Educators 2003/2004;
book _Polynomial Root-Finding and Polynomiography_, World Scientific 2008 (492 pp).

- https://www.amazon.com/Polynomial-Root-Finding-Polynomiography-Bahman-Kalantari/dp/9812700595 ;
  https://history.siggraph.org/wp-content/uploads/2022/07/2004-Educators-Forum-Kalantari_Animation-of-Mathematical-Concepts.pdf ;
  "An invitation to polynomiography via exponential series" (arXiv 1707.09417);
  "A globally convergent Newton method for polynomials" (arXiv 2003.00372).

_Draw:_ an `m` slider on the basin shader plus the Voronoi diagram (Fortune / or per-pixel nearest
root in the shader — free) as an overlay: watching the fractal boundary iron itself out into straight
Voronoi edges is a genuinely surprising and cheap picture. _Value:_ high visual, medium math.

### 3.3 Simultaneous iterations — Durand–Kerner (Weierstrass) and Aberth–Ehrlich

- **Weierstrass/Durand–Kerner (1891/1960/1966):** `z_i ← z_i − p(z_i)/∏_{j≠i}(z_i − z_j)`
  (quadratic); **Aberth–Ehrlich (1967):** `z_i ← z_i − 1/( p'(z_i)/p(z_i) − Σ_{j≠i} 1/(z_i − z_j) )`
  (cubic) — note the second term is _exactly the electrostatic repulsion_ from the other
  approximations (§2.8). MPSolve (Bini & Fiorentino, Numer. Algorithms 23 (2000) 127–173; Bini & Robol,
  J. Comput. Appl. Math. 272 (2014)) uses Aberth with initial points on circles given by the **Newton
  polygon** of `(k, log|a_k|)` — a drawable object in the coefficient pane! — and Gershgorin-type
  inclusion discs for stopping.
- **Not generally convergent:** Reinke, Schleicher & Stoll, "The Weierstrass–Durand–Kerner root finder
  is not generally convergent" (Math. Comp. 2022, arXiv 2004.04777): open sets of initial conditions
  for degree ≥ 3 converge to attracting cycles, not roots. A striking thing to _show_.
- https://en.wikipedia.org/wiki/Aberth_method ; https://arxiv.org/abs/2004.04777 ;
  https://numpi.dm.unipi.it/mpsolve-2.2/doc.htm

_Draw:_ "iteration trails" — `n` moving points with fading polylines, one iteration per frame,
starting from the Newton-polygon circles (or from user-placed points); show the Weierstrass
corrections `W_i` as arrows and the Gershgorin discs of radius `n|W_i|` (§5.4) shrinking to the roots.
_Value:_ high for teaching how root finders actually work; the app can _use_ Aberth as its root
finder (Leo Stein's toy does), so the visual is the algorithm running.

### 3.4 Companion matrix picture

Roots = eigenvalues of the Frobenius companion `C` (last row `−a_0, …, −a_{n−1}`, ones on the
subdiagonal). MATLAB `roots`, NumPy `roots` do exactly `eig(balance(C))`. **Gershgorin (1931):** eigenvalues
lie in the union of the row discs; for `C` these are `n−1` copies of `|z| ≤ 1` and one disc
`|z + a_{n−1}| ≤ Σ_{k<n−1}|a_k|`; the column discs give Cauchy's bound; diagonal similarities
`D C D^{−1}` give a family of bounds. Melman, "Modified Gershgorin disks for companion matrices",
SIAM Review 54 (2012) 355–373, gives strictly smaller discs exploiting the structure.

- https://epubs.siam.org/doi/10.1137/100797667 ; Edelman & Murakami, Math. Comp. 64 (1995) 763–776.
- Chebfun uses the **colleague matrix** (Chebyshev basis; Specht 1957 / Good 1961) with recursive
  subdivision: https://www.chebfun.org/docs/guide/guide03.html

_Draw:_ the companion matrix as a heat-mapped grid in a side panel; Gershgorin discs (row / column /
scaled) in the root pane; `k` discs forming a connected component contain exactly `k` eigenvalues —
a `=`-labelled count. _Value:_ medium; useful bridge to linear algebra and the reason the pseudozero
= pseudospectrum identity (§1.4) matters.

### 3.5 Stability counts and the root locus

- **Routh–Hurwitz (1877/1895):** number of roots in the open left half-plane from sign changes in the
  first column of the Routh array (or the Hurwitz determinants); exact in ℚ for rational coefficients,
  needs care for zero rows. **Schur–Cohn (1917/22) / Jury (1964) / Bistritz (1984)** do the unit disc.
  https://en.wikipedia.org/wiki/Routh%E2%80%93Hurwitz_stability_criterion ; https://en.wikipedia.org/wiki/Jury_stability_criterion ;
  https://en.wikipedia.org/wiki/Bistritz_stability_criterion
- **Root locus (Evans, "Graphical analysis of control systems", Trans. AIEE 67 (1948) 547–551; "Control
  system synthesis by root locus method", 1950):** the roots of `D(s) + K N(s) = 0` as `K` runs from
  `0` to `∞`: they start at the roots of `D`, end at the roots of `N` or at `∞` along `n − m` asymptotes
  through the centroid `(Σ poles − Σ zeros)/(n − m)` at angles `(2k+1)π/(n−m)`; _breakaway points_
  where `dK/ds = 0`, i.e. where two roots collide — exactly where the segment in coefficient space
  crosses the discriminant. https://en.wikipedia.org/wiki/Root_locus_analysis
- **Unification for this app:** dragging coefficient `a_k` from `α` to `β` _is_ the root locus of
  `p + t·z^k`, `t ∈ [0, β − α]`: the trajectory of each root is an algebraic curve, the classic Evans
  rules apply with `N = z^k` (all `k` "zeros" at the origin: `k` roots head for `0`, `n − k` head to
  `∞` along `n − k` asymptotes as `|t| → ∞`). The complex-`t` generalisation is the braid of §6.3.

_Draw:_ LHP / unit-disc shading with an exact `= k roots inside` badge (Routh/Schur–Cohn in exact
arithmetic when coefficients are exact, else the Rouché/Pellet count); "trace" mode that records root
trajectories during a coefficient drag, with the Evans asymptotes drawn as dashed rays. _Value:_
high — it is the general answer to "what happens to the roots when I move this", and connects to an
entire engineering discipline.

---

## 4. Root distributions (many polynomials at once)

### 4.1 Random polynomials

- **Kac (1943):** i.i.d. `N(0,1)` coefficients ⇒ expected number of real roots `~ (2/π) log n`;
  Hammersley (1956, Proc. 3rd Berkeley Symp.) gave the joint density of the complex zeros; **Shepp &
  Vanderbei, "The complex zeros of random polynomials", Trans. AMS 347 (1995)**: explicit density
  concentrating on the unit circle. Ibragimov & Zeitouni (1997), Ibragimov & Maslova: for any i.i.d.
  law the zeros equidistribute to the uniform measure on `|z| = 1`.
  https://web.williams.edu/Mathematics/sjmiller/public_html/ntprob19/handouts/polyzeros/IbragimovZeitouni_RootsRandomPoly.pdf
- **Erdős–Turán (1950):** if `p` is small on the unit circle relative to `√|a_0 a_n|` then the roots
  cluster at the unit circle _and_ are angularly equidistributed: the number of roots with argument in
  `[α, β]` differs from `n(β − α)/2π` by at most `C √( n log( ‖p‖_∞ / √|a_0 a_n| ) )`, `C = 16`
  (E–T) → Ganelius (1954) → Mignotte 1992 `√(2π)` ≈ 2.56 → Soundararajan 2019 `8/π ≈ 2.55` → Carneiro et al.
  via Hilbert transforms (arXiv 2104.00105). This is an honest `≤`-labelled _discrepancy bound_ the app
  can print for any polynomial.
- **Kostlan / Shub–Smale / Edelman–Kostlan (Bull. AMS 32, 1995, "How many zeros of a random polynomial
  are real?")**: coefficients `√C(n,k) ξ_k` (the "elliptic" ensemble) give roots that are **uniformly
  distributed on the Riemann sphere** and exactly `√n` expected real roots. The natural companion to the
  "Newton on the sphere" view.
- Chebfun example "Roots of random polynomials" (Trefethen): http://www.chebfun.org/examples/roots/RandomPolynomials.html

_Compute/draw:_ sample `M` polynomials per frame on the CPU (Aberth, `n ≤ 30`, `M ~ 200`/frame is fine)
and accumulate a log-density heatmap in a float texture; ensemble picker Kac / Kostlan / Weyl / ±1 /
{0,1}; overlay unit circle + the E–T discrepancy bar chart by angle. _Value:_ very high visual and
research value; no existing interactive tool lets you switch ensembles live.

### 4.2 Littlewood polynomials and restricted coefficients — the Derbyshire set

Roots of all `±1` polynomials of degree `≤ 24` (Derbyshire 2006; Baez, Christensen & Derbyshire,
"The beauty of roots", Notices AMS Oct 2023, arXiv 2310.00326): a fractal with 4-fold symmetry, holes at
roots of unity, and local dragon-curve structure explained by iterated function systems `z ↦ ±1 + z·w`
(Bousch 1988/1993 on the "M set" `{q : IFS z ↦ 1 ± qz ...}`; Bandt 2002; Calegari, Koch & Walker,
"Roots, Schottky semigroups, and a proof of Bandt's conjecture", ETDS 2017). Odlyzko & Poonen, "Zeros of
polynomials with 0,1 coefficients", Enseign. Math. 39 (1993) 317–348: closure of the {0,1}-root set is
path-connected, contained in `1/2 < |z| < 2`… Egan's applet and Vanderbei's WebGL page draw these.

- https://math.ucr.edu/home/baez/roots/ ; https://www.gregegan.net/SCIENCE/Littlewood/Littlewood.html ;
  https://vanderbei.princeton.edu/WebGL/roots_PlusMinusOne.html ; "Dragon curves in Littlewood roots" (arXiv 2606.25440, 2026).

_Compute:_ `2^{25}` polynomials × 24 roots is too many for the browser per frame; precompute a tile
pyramid offline (or do degree ≤ 16 live: 65k polys × 16 roots ≈ 1M points, feasible in a worker with
Aberth at ~1–2 s) and render as an additive point sprite layer. _Value:_ iconic picture; but every
existing tool draws it — its _distinctive_ use here is §8 (drag the current polynomial _inside_ the
Derbyshire set: which ±1 polynomial is nearest?).

### 4.3 Special families with known limit curves

- **Szegő curve (1924):** roots of the Taylor polynomials `s_n(z) = Σ_{k≤n} z^k/k!` of `e^z`, scaled by
  `1/n`, accumulate on `{ |z e^{1−z}| = 1, |z| ≤ 1 }`. Cheap and famous.
- **Bernoulli polynomials `B_n(x)`:** roots accumulate on an "H"-shaped curve; rescaled, on
  `e^{∓2π Im z} = 2πe|z|` (Dilcher 1987; Veselov & Ward 2005 on real zeros, J. Math. Anal. Appl.); number
  of real roots `~ 2n/(πe)` (arXiv math/0606361). Euler polynomials similar; Eulerian polynomials'
  roots converge to a log-Cauchy law (arXiv 2507.15908).
- **Orthogonal polynomials:** zeros real, simple, interlacing, and equidistributed to the equilibrium
  measure of the support (Chebyshev/Legendre → arcsine on `[−1,1]`; Hermite → semicircle after `√(2n)`
  scaling; Laguerre → Marchenko–Pastur). Saff & Totik, _Logarithmic Potential Theory with Applications to
  Approximation Theory_ (Springer 1997): http://www.math.vanderbilt.edu/saffeb/texts/230.pdf
- **Fekete points / Fekete polynomials:** the `n`-point configuration on `K` maximising `∏|z_i − z_j|`
  (= maximising the Vandermonde, i.e. _the best-conditioned root configuration on `K`_, §6.4); the monic
  polynomial with those roots is the Fekete polynomial and its roots equidistribute to the equilibrium
  measure `μ_K`. The Potential Theory app already computes Fekete/Leja points — hand them over as a
  polynomial. (Simon, "Asymptotics of Chebyshev polynomials IV", arXiv 1812.10667, for the complex case.)
- **Iterated polynomials / Julia sets (link to Complex Dynamics):** for `q(z) = z² + c`, the roots of
  `q^{∘k}(z) − w` (the `2^k` preimages of any `w`) equidistribute to the harmonic measure of the filled
  Julia set — Brolin's theorem (1965). Roots of the **Mandelbrot polynomials** `p_k(c) = p_{k−1}(c)² + c`
  (centres of period-`k` components) equidistribute to the harmonic measure of `M`
  (Levin 1990 / Bini & Robol, "Numerical computation of the roots of Mandelbrot polynomials", arXiv 2307.12009,
  Ehrlich–Aberth + FMM at degree `2^{k−1}` up to millions).
- "Roots of unity perturbation" pictures: `z^n − 1 + ε q(z)`; roots move by `≈ −ε q(ω^j)/(n ω^{j(n−1)})`
  — draw the displacement arrows (a "hedgehog") to show the linear response along the circle; and the
  Wilkinson "rambling roots" path family as `ε` grows.

_Value:_ medium-high as a "gallery" (the suite's contour-integration gallery pattern: each entry is a
record with a closed-form limit curve overlaid and an `=`/`≈` label).

---

## 5. Analysing one specific polynomial (the "analysis panel")

The suite has `@cas/exact` (ℚ(i), quadratic extensions) and `@cas/rigor`. For coefficients typed as
exact rationals/Gaussian rationals, most of the following is `=`; for dragged float coefficients it is
`≈` or `≤` with a certified evaluation bound. Everything below is feasible in the browser at `n ≤ 30`
(BigInt for exact arithmetic; the Sylvester determinant at `n = 30` is `59 × 59` over ℚ — fine with
fraction-free Bareiss).

### 5.1 Exact vs numeric roots

- Degree ≤ 4: closed forms (but for the _app_ the quadratic-extension machinery already in `@cas/exact`
  covers degree 2 exactly and degree 3/4 with a cube-root extension — probably not worth building;
  label numeric roots `≈` and certify with §5.4).
- Numeric: Aberth–Ehrlich (cubic convergence, all roots at once, `O(n²)` per sweep) started from the
  Newton-polygon circles (Bini), then polish each root with Newton in float64 (or df64); companion-matrix
  eig as a cross-check only (the pseudozero identity says it is not the sharper method).

### 5.2 Multiplicity detection

`g = gcd(p, p')` (Euclid over ℚ(i), exact) gives the multiple roots; **Yun's squarefree factorisation
(1976)** gives `p = ∏ f_k^k` with `f_k` the product of the roots of multiplicity exactly `k` — a `=`
statement "this polynomial has exactly 2 double roots and 1 triple root" without ever computing a
root. Numerically (inexact coefficients) multiplicity is not decidable; Zeng's "pejorative manifold"
method (Zeng, "Computing multiple roots of inexact polynomials", Math. Comp. 74 (2005); ISSAC 2003
https://doi.org/10.1145/860854.860907) finds the nearest polynomial _with_ a given multiplicity
structure — a nice `≈` badge: "distance to the nearest polynomial with a double root = 3.2e−4"
(and this distance is a lower bound on the drag needed to hit the discriminant).

### 5.3 Discriminant and resultant

`Disc(p) = (−1)^{n(n−1)/2} Res(p, p') / a_n`. Exact via Sylvester matrix (Bareiss over ℤ[i]/ℚ(i)) or a
subresultant PRS; numeric via `a_n^{2n−2} ∏_{i<j}(r_i − r_j)²` (`≈`). Show `|Δ|` live as the user
drags — it goes to 0 as two roots approach — and the _sign_ of the real discriminant in real-coefficient
mode (cubic: `Δ > 0` ⇔ three real roots).

### 5.4 Real roots: Sturm, Descartes, Budan–Fourier, Vincent/VCA/VAS, ANewDsc

- **Sturm (1829):** exact count of distinct real roots in `(a, b]` = `V(a) − V(b)` for the Sturm
  sequence; needs exact arithmetic (sign decisions) — in ℚ this is `=`.
- **Descartes' rule (1637)** (upper bound with parity) and **Budan–Fourier (1807/1820)** (the same on
  an interval via Taylor shift): cheap `≤` statements.
- **Vincent (1834) → VCA (Collins–Akritas 1976, bisection) / VAS (Akritas–Strzeboński 2005, continued
  fractions)** — real-root _isolation_: intervals each containing exactly one real root, `=`.
  https://en.wikipedia.org/wiki/Vincent%27s_theorem ; Tsigaridas & Emiris (arXiv cs/0604066).
- **ANewDsc (Kobel, Rouillier & Sagraloff, ISSAC 2016, arXiv 1605.00410)** — Descartes + Newton +
  approximate arithmetic; the state of the art (Maple's default). Overkill for `n ≤ 30`, but the
  design (a Descartes test on an interval, Newton to accelerate clusters) is what to implement.
- Interval Newton / Krawczyk for refinement with certified enclosures (JS has no rounding modes; use
  error-free transformations or exact ℚ).

### 5.5 Complex root isolation with certified discs ("exactly k roots in this disc")

Ranked by implementability:

1. **Smith's Gershgorin discs (B. T. Smith, J. ACM 17 (1970) 661–674, "Error bounds for zeros of a
   polynomial based upon Gerschgorin's theorems"):** for _any_ `n` distinct points `z_1..z_n` (e.g. the
   current Aberth iterates), with Weierstrass corrections `W_i = p(z_i) / (a_n ∏_{j≠i}(z_i − z_j))`,
   every root lies in `∪_i D(z_i, n|W_i|)`, and a connected component made of `k` discs contains
   exactly `k` roots. `O(n²)`, one line of code, and it certifies the _numeric_ roots (with exact or
   error-bounded evaluation of `p(z_i)`) — this is the obvious `=`-badge engine. Neumaier, "Enclosing
   clusters of zeros of polynomials", J. Comput. Appl. Math. 156 (2003), tightens it for clusters.
2. **Pellet / soft-Pellet test on a Taylor-shifted disc** (§2.5): exact count for a user-chosen disc.
   This is the primitive of **Becker, Sagraloff, Sharma & Yap, "A near-optimal subdivision algorithm
   for complex root isolation based on the Pellet test and Newton iteration", J. Symb. Comp. 86 (2018)
   51–96** (arXiv 2015) and of Imbach–Pan–Yap's implementation `Ccluster` ("Implementation of a
   near-optimal complex root clustering algorithm", ICMS 2018) — quadtree subdivision + Pellet +
   Newton, returning _clusters_ with exact multiplicity counts, which is the right notion when
   coefficients are inexact (a cluster of `k` roots is what a near-multiple root looks like).
   https://www.sciencedirect.com/science/article/pii/S0747717117300378 ;
   https://link.springer.com/chapter/10.1007/978-3-319-96418-8_28
3. **Smale's α-theory (1986):** `α(p, z) = β γ`, `β = |p/p'|`, `γ = sup_{k≥2} |p^{(k)}/(k! p')|^{1/(k−1)}`
   (finite sup for a polynomial — compute from the Taylor shift). If `α < (13 − 3√17)/4 ≈ 0.1577`, `z`
   is an _approximate zero_: Newton converges quadratically to a root within `2β` of `z`.
   Hauenstein & Sottile, "Algorithm 921: alphaCertified", ACM TOMS 38 (2012), arXiv 1011.1091. Also
   Kantorovich (1948). Gives a per-root `=` certificate of _existence and uniqueness_ in a disc.
4. Schönhage's splitting-circle (1982), Pan's near-optimal algorithms (Pan, "Solving a polynomial
   equation: some history and recent progress", SIAM Review 39 (1997) 187–220; arXiv 1805.12042) — theory
   background, not to implement.
5. **Rump 2003** ("Ten methods…") for _multiple_ roots: enclosures for a `k`-cluster.

_Draw:_ certified discs as a distinct glyph (thin ring with the count), the analysis panel listing
`= 1 root in D(z_i, ρ_i)` rows; where discs overlap, merge and print `= k roots in this component`.

---

## 6. Coefficient-space pictures

### 6.1 The discriminant locus in a 2-parameter slice

- Cubic `z³ + a z + b`: `Δ = −4a³ − 27b²`; for real `(a, b)` the **cusp** `4a³ + 27b² = 0`, with three
  real roots inside the cusp and one outside. Draw the curve in the `(a,b)` pane; the cursor's `(a,b)`
  is the current polynomial; crossing the curve is where two real roots become a conjugate pair.
- Reduced quartic `z⁴ + a z² + b z + c`: `Δ = 256c³ − 128a²c² + 144ab²c − 27b⁴ + 16a⁴c − 4a³b²`; the real
  zero set is the **swallowtail** surface (Arnold's `A_4`; Thom; Poston & Stewart, _Catastrophe Theory
  and its Applications_, 1978; Arnold, _Catastrophe Theory_, 1984/1992; Brieskorn & Knörrer, _Plane
  Algebraic Curves_, has the classic figure). Parametrisation of the surface: `x = u v² + 3 v⁴`,
  `y = −2uv − 4v³`, `z = u` (MathWorld). Draw 2-D slices `c = const` (the swallowtail cross-sections,
  which are curves with two cusps and a self-crossing) or a small 3-D view.
  https://mathworld.wolfram.com/SwallowtailCatastrophe.html ; AMS Feature Column "Catastrophe theory":
  https://www.ams.org/publicoutreach/feature-column/fcarc-syntax6
- The **complex** discriminant in a 1-complex-parameter slice: for the pencil `p + t q` the
  discriminant `D(t) = Disc_z(p + t q)` is a polynomial in `t` of degree `≤ 2n − 2` whose roots
  `t_1, …` are the collision parameters; draw them in the `t`-plane (Leo Stein's toy draws exactly the
  "roots of the discriminant" for a single coefficient). A loop in `t` around one `t_j` transposes two
  roots (generically); around several, composes the transpositions — the **braid monodromy**. This is the
  operational content of "Vieta is a branched covering".

_Compute:_ `D(t)` exactly by Sylvester/Bareiss over ℚ[t] (degree ≤ 58 in `t` at `n = 30` — fine), or
numerically by sampling `t` and fitting; then its roots by the same Aberth solver. The app's own
coefficient pane _is_ a 1-complex-parameter slice for each coefficient `a_k` — the discriminant points
should be drawn there by default when the user picks a coefficient to drag.

### 6.2 Real discriminant curve vs complex monodromy locus

In the real `(a, b)` slice the discriminant curve separates _root-type_ regions (how many real roots).
In a complex 1-parameter slice the discriminant is a _finite set of points_, and what changes across
them is not the root count but the _identification_ of roots (monodromy) — worth making the two
pictures side by side, because students conflate them.

### 6.3 The root-trajectory braid

As `t` moves along a path `γ(t)`, `t ∈ [0,1]`, the roots trace `n` strands in `ℂ × [0,1]`; project to the
real axis `× [0,1]` and record crossings with over/under by the imaginary part to read a **braid word**
in `B_n`. Draw as (a) a 2-D "time-coloured" trajectory overlay in the root pane (hue = `t`), (b) a 3-D
ribbon (WebGL lines in `ℂ × t`), or (c) the braid diagram. Closed loops give the monodromy permutation
(the toy does this) _and_ the braid class (nobody does this). Reference for the theory: Arnold 1970;
Wilson's notes above; "Polynomial covering maps" (Hansen, _Braids and Coverings_, CUP 1989).

### 6.4 The Vieta Jacobian as local conditioning of the drag

`|det DV| = ∏_{i<j}|r_i − r_j| = |Δ|^{1/2}` measures how a root-space volume element maps to
coefficient space; its inverse blows up on the discriminant. Per root, the differential of the inverse
is the row `∂r_i/∂a = −(1, r_i, …, r_i^{n−1}) / p'(r_i)` with `p'(r_i) = ∏_{j≠i}(r_i − r_j)`: so
**dragging a coefficient** moves root `i` with gain `‖(1, r_i, …)‖ / ∏_{j≠i}|r_i − r_j|` and
**dragging a root** moves coefficient `a_k` with gain `|e_{n−k−1}(r_{−i})|` (the elementary symmetric
function of the _other_ roots). Both are cheap to show as a live per-root/per-coefficient "gain"
number or as the sensitivity discs of §1.1. Fekete configurations (§4.3) are the _best-conditioned_
root sets on a given `K` (they maximise the Vandermonde), roots of unity being the case `K` = unit
circle — the natural explanation of why `z^n − 1` is perfectly conditioned and Wilkinson is not.

---

## 7. Existing tools (what exists, what each does, what none does)

| Tool                                                                                                                                           | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Notes                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Leo C. Stein, "Complex polynomial roots toy"** (2019, JSXGraph) https://duetosymmetry.com/tool/polynomial-roots-toy/                         | Drag roots _or_ coefficients; Aberth–Ehrlich; optional roots of the discriminant (Bézout matrix) in the coefficient's plane; loops in coefficient space permute roots                                                                                                                                                                                                                                                                                               | **The closest existing thing to the planned app.** No domain colouring, no overlays, no certification, degree small.                                                                                                                                                           |
| **Wolfram Demonstrations**                                                                                                                     | "Polynomial Roots"; "Polynomial Roots in the Complex Plane"; "Roots of a Polynomial with Complex Coefficients" (Hafner 2016); "Complex Roots of a Polynomial and Its Derivative" (Gauss–Lucas with locators); "Lucas–Gauss Theorem" (nested hulls); "Marden's Theorem" (Torrence 2008); "Vieta's Formulas for Polynomial Roots"; "How the Roots of a Polynomial Depend on Its Constant Coefficient"; "The Eneström–Kakeya Bounds…"; "nth Roots of a Complex Number" | One theorem per demo; needs the CDF/cloud player; no GPU, no root↔coefficient two-way drag in one place. https://demonstrations.wolfram.com/                                                                                                                                   |
| **GeoGebra**                                                                                                                                   | "Complex Root Visualizer" (m/G7xgSTMV); "Conjectures about complex roots of polynomials" (quadratic with a `(P,Q)` coefficient pane — the two-pane idea at degree 2); "Marden's Theorem" (sKTVQnC8); "Visualising complex roots of polynomials" (the 3-D graph-over-plane picture)                                                                                                                                                                                  | Classroom-level; degree ≤ 3 mostly.                                                                                                                                                                                                                                            |
| **Desmos "Draggable polynomial roots"** https://www.desmos.com/calculator/upb5mhmuoq                                                           | Real roots on the real line                                                                                                                                                                                                                                                                                                                                                                                                                                         | Real only.                                                                                                                                                                                                                                                                     |
| **M4TH5 "Complex polynomial visualiser"** https://m4th5.co.uk/classroom-interactives/complex-polynomial-visualiser/                            | "interactive workstation… algebraic theory ↔ geometric intuition"                                                                                                                                                                                                                                                                                                                                                                                                   | Could not be fetched (403) **⚠ verify** features.                                                                                                                                                                                                                              |
| **Jason Davies / Christian Lawson-Perfect / Kevin Kwok / Pierre Baudin**                                                                       | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | **Not confirmed**: no polynomial-root explorable by these authors was found in the searches (Davies' site is D3 visualisations; Lawson-Perfect's "everything" page has many interactives but none was identified as this). Treat the names as unverified leads, not citations. |
| **MATLAB `roots`**                                                                                                                             | `eig(balance(companion))`                                                                                                                                                                                                                                                                                                                                                                                                                                           | Edelman–Murakami 1995 explains its (matrix-) backward stability.                                                                                                                                                                                                               |
| **Chebfun `roots`**                                                                                                                            | Colleague matrix + recursive subdivision; examples "Roots of random polynomials", "Does a chebfun of degree n have n roots?"                                                                                                                                                                                                                                                                                                                                        | https://www.chebfun.org/docs/guide/guide03.html                                                                                                                                                                                                                                |
| **Sage**                                                                                                                                       | `p.roots()` exact over number fields; `complex_roots()` via PARI (Schönhage–Gourdon); `real_roots` (Carl Witty's Descartes/Vincent implementation with interval refinement)                                                                                                                                                                                                                                                                                         | The reference for "exact roots + certified real-root isolation" behaviour to emulate.                                                                                                                                                                                          |
| **MPSolve** (Bini–Fiorentino 2000; Bini–Robol 2014)                                                                                            | Aberth + Newton polygon start + Gershgorin/Rouché inclusion discs; any precision                                                                                                                                                                                                                                                                                                                                                                                    | The reference _numeric_ root finder; its inclusion-disc output is the `=`-badge model.                                                                                                                                                                                         |
| **Polynomiogram** (Nguyen, Pham & Nguyen, arXiv 2512.04263, Dec 2025)                                                                          | Root-density maps over 2-parameter coefficient families (NumPy companion + MPSolve)                                                                                                                                                                                                                                                                                                                                                                                 | The "root density of a family" idea, offline/Python. https://arxiv.org/abs/2512.04263                                                                                                                                                                                          |
| **Kalantari's polynomiography** (2005–2011; book 2008)                                                                                         | Basin colourings for the Basic Family; Voronoi limit                                                                                                                                                                                                                                                                                                                                                                                                                | Art + algorithms; software historically desktop/patented.                                                                                                                                                                                                                      |
| **Baez–Christensen–Derbyshire; Egan applet; Vanderbei WebGL**                                                                                  | Littlewood root sets                                                                                                                                                                                                                                                                                                                                                                                                                                                | Static/precomputed picture explorers.                                                                                                                                                                                                                                          |
| **Shadertoy**                                                                                                                                  | "solve polynomial roots" (ltXfDs, GLSL solver tips); many domain-colouring shaders                                                                                                                                                                                                                                                                                                                                                                                  | Ideas for the GLSL; nothing interactive on roots.                                                                                                                                                                                                                              |
| **Cem Yuksel, "High-performance polynomial root finding for graphics"** (HPG 2022; cyCodeBase) https://www.cemyuksel.com/research/polynomials/ | Real-root finder for GPUs (monotonic intervals + robust Newton), ≤ degree ~20                                                                                                                                                                                                                                                                                                                                                                                       | Relevant if real-root isolation is ever wanted _per pixel_.                                                                                                                                                                                                                    |
| **3Blue1Brown "Newton's fractal" (2021)**                                                                                                      | The popular picture of §3.1 + the cubic parameter-space Mandelbrot                                                                                                                                                                                                                                                                                                                                                                                                  | Sets audience expectations.                                                                                                                                                                                                                                                    |
| Mandel & Robins, "Dragging the roots of a polynomial to the unit circle" (arXiv 1908.03208, 2019)                                              | Research paper using the _drag_ idea: thresholds at which a parametric family becomes unit-circle-rooted / interlacing                                                                                                                                                                                                                                                                                                                                              | Evidence that "drag the roots" is a research instrument, not only a toy.                                                                                                                                                                                                       |

**Gap none of them fills:** two-way drag _plus_ GPU domain colouring _plus_ certified (`=`/`≤`/`≈`)
statements _plus_ the coefficient-space discriminant picture _plus_ theorem overlays, in one place.

---

## 8. Ranked: the 12 most valuable overlays / views for the planned app

1. **Critical points + Gauss–Lucas hull** — cost: trivial (one extra root solve at degree `n−1`, a hull); value: the first thing everyone asks for, and it makes the live drag a theorem.
2. **Pseudozero level sets on the GPU** (`|p|/w(z)` ladder, default `ε = u`) — cost: ~20 lines of GLSL on top of the existing domain colouring; value: the conditioning picture of numerical analysis, Wilkinson made visible, Mosier's `=` root counts per component.
3. **Certified root discs (Smith/Gershgorin from the Aberth iterates; α-theory per root)** — cost: `O(n²)`, small; value: the app's honest-labelling spine — every displayed root carries `= 1 root within ρ`.
4. **Discriminant points in the coefficient pane for the coefficient being dragged, + loop monodromy** — cost: Sylvester/Bareiss or numeric fit + a root solve; value: the branched-covering story, the one thing the coefficient pane is _for_.
5. **Root trajectories during a coefficient drag = root locus** (time-coloured trails, Evans asymptotes, breakaway points = discriminant crossings) — cost: record positions per frame, tiny; value: unifies §1, §3.5 and §6.
6. **Singular lemniscates (isolines of `|p|` at critical values) + the electrostatic reading** — cost: isoline pass already exists in the suite; value: explains the modulus colouring; hand-off to 2D Electrostatics.
7. **Marden's Steiner inellipse (cubic) + Jensen discs (real mode)** — cost: closed form / trivial; value: two exact, beautiful, and mode-appropriate refinements of Gauss–Lucas.
8. **Newton basins as a stage mode, hover orbit, HSS starting circles, sphere view** — cost: one shader + the existing sphere idiom; value: the most recognisable picture; the HSS circles give it an `=`.
9. **Sensitivity discs / per-root condition number `κ(r_i)` and per-coefficient drag gain** — cost: `O(n)`; value: the first-order version of (2), always on, numerically explains every "explosion".
10. **Ensemble density heatmap (Kac / Kostlan / Littlewood / {0,1}) with the Erdős–Turán discrepancy readout** — cost: worker + float texture accumulation; value: research-grade, unique as a _live_ switch.
11. **Root bounds picker (Cauchy radius, Fujiwara, Kojima, E–K annulus) + Rouché/Pellet disc counter** — cost: trivial; value: the certified `≤` rows and a cross-link to the Argument Principle app.
12. **Basic-Family `m`-slider basins with the Voronoi overlay (Kalantari)** — cost: generalise the Newton shader; value: a surprising, cheap, attributable picture; low math depth beyond the theorem.

Also-rans (worth a gallery entry, not a default overlay): Sendov mode (cheap, conjecture badge);
swallowtail slice for the reduced quartic; Szegő curve / Bernoulli-H / Mandelbrot-polynomial gallery;
Gershgorin discs of the companion matrix; apolar partner (research audience only); Sturm/real-root
isolation table (analysis panel row rather than a picture).

## 9. Ideas that would make the app distinctive (nothing found does these)

- **Certified `=`/`≤`/`≈` labelling on a root plot.** Every root glyph carries a Smith/α-theory disc and
  a count; pseudozero components carry Mosier's `= k roots for every polynomial within ε`. No explorable
  does certification at all; Sage/MPSolve do it without a picture.
- **The drag itself as root locus + braid.** Recording a coefficient path and returning a braid word
  (not just a permutation) — the toy gives the permutation only. Show the braid as a 3-D ribbon in `ℂ × t`.
- **Discriminant points auto-drawn in the coefficient pane for the selected coefficient**, with
  "snap to a collision" (drag _onto_ a discriminant point to create an exact double root, then show the
  Puiseux `m`-gon splitting as you leave).
- **Root-form as the primary representation** (Wilkinson is well-conditioned in root form, Corless):
  the app never loses roots to rounding while dragging roots; only _coefficient_ drags meet the covering.
  Display both `κ` gauges (root→coeff and coeff→root) live.
- **Pseudozero ladder colouring on the GPU** as a stage mode ("how many digits to put a root here"),
  with the real-perturbation pseudozero set in real mode (Graillat–Langlois) — never done interactively.
- **Fekete "best-conditioned" mode:** a button that relaxes the roots toward the Fekete configuration of
  a chosen `K` (gradient ascent on `Σ log|r_i − r_j|`, i.e. the electrostatic energy), showing the
  Vandermonde and every `κ` improving — ties §6.4 to the Potential Theory app.
- **Cross-app hand-offs via `@cas/interchange`:** roots → charges (2D Electrostatics, exact identity
  `W = log p`); roots ↔ Fekete/Leja points (Potential Theory); a chosen disc → the Argument Principle app's
  winding picture; `q^{∘k} − w` / Mandelbrot polynomials ← Complex Dynamics. The suite is the only place
  these four pictures of the same object coexist.
- **Ensemble switch with live Erdős–Turán discrepancy** (a bound printed as `≤`, sharpened
  Soundararajan constant) — the random-polynomial picture with the theorem attached.
- **Kalantari `m → ∞` → Voronoi** as an animated slider with the Voronoi diagram drawn exactly on top.
- **Zeng's "distance to the nearest polynomial with a multiple root"** as a live number (how far the
  current polynomial is from the discriminant, in coefficient norm), with the direction drawn as an
  arrow in the coefficient pane.
- **A "conjecture" badge class** (Sendov slack) — an overlay that is honest about being unproven at
  the displayed degree, letting a user hunt for counterexamples with the drag.
