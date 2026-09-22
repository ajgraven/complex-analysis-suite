> Research track 1 for `apps/polynomial-root-analysis`. Surveyed 2026-09-22 by a research agent; every
> `[verified here]` claim was recomputed in exact arithmetic during the survey, everything else carries
> a citation, and anything marked `⚠ verify` could not be confirmed from a primary source. Kept verbatim
> as the evidence base for [`../PLAN.md`](../PLAN.md) §3 and §7 PRA-4/PRA-5; corrections go in as dated
> italic notes, never as silent rewrites.

# Computing the Galois group of a user-entered polynomial in the browser — feasibility study

*Research note, 2026-09-22. Scope: an educational/research web app (TypeScript, BigInt, no external CAS,
static hosting) that must label every claim `=` (certified) or `≈` (heuristic).*

Everything marked **[verified here]** was recomputed in this session (Python, exact arithmetic) rather than
taken from a source; everything else carries a citation. Where a source could not be reached (LMFDB is
behind a browser check for two of the five example fields; Magma's handbook returns 401) it is said so.

---

## 0. Summary of the landscape

| Method | What it needs | Certifies? | Degree reach in practice |
|---|---|---|---|
| Discriminant square test | exact `disc f` (resultant over ℤ) + integer sqrt | `=` for "G ≤ A_n or not" | any |
| Dedekind / Frobenius cycle types | factorisation mod p (distinct-degree factorisation suffices) | `=` for **membership** ("G contains an element of this type"); `=` for S_n/A_n via Conrad/Jordan-type theorems; **never** certifies absence | any (polynomial time) |
| Cycle-type statistics vs. transitive-group table (Chebotarev) | table of cycle-type distributions per nTj | `≈` only; fails outright for pairs with identical statistics (first at degree 8: 8T10 vs 8T11) | table-limited (≤ 15 comfortably, ≤ 23 possible) |
| Absolute (linear) resolvents, Soicher–McKay / Cohen ch. 6 | numeric roots to certified precision → integer resolvent → exact factorisation over ℤ | `=` (when resolvent is squarefree; else Tschirnhaus) | ≤ 7 with a handful of resolvents; ≤ 11 with PARI's `galdata` tables |
| Stauduhar relative resolvents (descent through the transitive-subgroup lattice) | roots (complex or p-adic) to certified precision, invariants for every maximal-subgroup pair, transitive-group lattice | `=` when precision bound is honoured; `≈` with the "short-coset / low precision" shortcuts | 7 (Stauduhar 1973) → 15 (Geissler–Klüners 2000) → 23 (Geissler 2003) → no degree bound (Fieker–Klüners 2014, Magma) |

The consensus of the literature is that for a fixed small degree the linear-resolvent method is a
self-contained, fully certifiable algorithm that needs nothing but (a) high-precision roots with rigorous
error bounds, (b) exact integer polynomial factorisation, and (c) a small table; that is exactly what a
browser can do with `BigInt`.

---

## 1. The standard algorithms

### 1.1 Stauduhar (1973) — "The determination of Galois groups"
R. P. Stauduhar, *Math. Comp.* 27 (1973), 981–996,
<https://www.ams.org/journals/mcom/1973-27-124/S0025-5718-1973-0327712-4/S0025-5718-1973-0327712-4.pdf>.

* Computes high-precision approximations to the roots, fixes an ordering, and walks **down** the lattice
  of transitive subgroups of S_n: given `Gal(f) ≤ G` and a maximal `H < G`, take a *G-relative
  H-invariant* `F ∈ ℤ[x_1..x_n]` (fixed by H, moved by every element of G∖H) and evaluate
  `F^σ(α)` for right-coset representatives `σ ∈ G//H`. If one value is a (simple) rational integer then
  `Gal(f) ≤ σ^{-1} H σ` and the ordering of the roots is refined; otherwise `Gal(f) ≰ any conjugate of H`.
* The relative resolvent `R_F(T) = ∏_{σ∈G//H} (T − F^σ(α)) ∈ ℤ[T]` has degree `(G:H)`.
  Statement and proof: Fieker–Klüners, Lemma 3.1, Thm 3.2, Cor. 3.4 (see 1.5); Krumm–Sutherland,
  Lemma 2.8 ("Stauduhar's lemma"): *if the resolvent is separable, `Gal(f) ⊆ σ^{-1}Hσ` for some σ iff
  it has a root in K*.
* **Needs:** all transitive groups of degree n with their maximal-subgroup chains and one invariant per
  pair (tables), numeric roots, and a precision bound. Stauduhar implemented n ≤ 7; the Wolfram Function
  Repository `StauduharGaloisGroup` reimplements it for n ≤ 10 with a user tolerance
  (<https://resources.wolframcloud.com/FunctionRepository/resources/StauduharGaloisGroup/>).
* Certification issue (Fieker–Klüners §7.3, quoting): *"Using K = ℂ as Stauduhar did is possible, but
  makes it difficult to decide if F(α) ∈ ℤ, this would involve a careful analysis of the numerical
  properties of F."* Hulpke's 1999 survey says the same: *"approximation is not a ring homomorphism and
  thus error propagation is difficult to keep under control … neither theoretical results, nor
  implementations ('validated numerics') which analyze error propagation in these cases"*. Both
  objections are answered today by interval/disc arithmetic (see §3(d)): with rigorous complex intervals
  the numerical route *is* a proof.

### 1.2 Soicher–McKay (1985) — linear (absolute) resolvents
L. Soicher, J. McKay, "Computing Galois groups over the rationals", *J. Number Theory* 20 (1985) 273–281,
<https://www.sciencedirect.com/science/article/pii/0022314X85900228>.

* Use *absolute* resolvents built from **linear** invariants `x_1 + x_2`, `x_1 + x_2 + x_3`, `x_1 − x_2`
  (orbits of r-sets and 2-sequences under S_n) plus `∏(x_i − x_j)` (i.e. `y² − disc f`). The
  **orbit-length partition** of `Gal(f)` on the roots of the resolvent equals the degree pattern of its
  factorisation over ℤ — so one factors an *integer* polynomial exactly and looks the pattern up.
* They show every transitive group of degree 3–7 is distinguished this way, and (per Bright's account of
  their table) the resolvents needed are:
  * degree 3: `p_Δ` (or `x_1 − x_2`);
  * degree 4: `p_Δ`, `x_1 + x_2` (deg 6), `x_1 − x_2` (deg 12);
  * degree 5: `p_Δ`, `x_1 − x_2` (deg 20), `(x_1 + x_2 − x_3 − x_4)²` (deg 15);
  * degree 6: `p_Δ`, `x_1 + x_2` (deg 15), `x_1 + x_2 + x_3` (deg 20), `x_1 − x_2` (deg 30),
    `x_1 + x_2 + x_3 + p_Δ`;
  * degree 7: `p_Δ`, `x_1 + x_2 + x_3` (deg 35) — **one resolvent plus the discriminant decides all
    seven groups** C7, D7, F21, F42, L(3,2), A7, S7.
  (C. Bright, "Computing the Galois group of a polynomial", 2013, §5.3,
  <https://cs.uwaterloo.ca/~cbright/reports/computing-galois-group.pdf>.)
* Bright on how the integer coefficients are obtained: *"approximate the roots of f via numerical
  root-finding methods, form all combinations of the roots as specified by p, and then expand the product
  … Since the coefficients are known to be integers, if the approximations are known with sufficient
  accuracy (absolute error less than 0.5) then the approximations may simply be rounded to the nearest
  integer."* The linear resolvents can alternatively be computed symbolically (resultants / Newton sums)
  without any floating point; for `x_1 + x_2` this is `Res_x(f(x), f(y − x))` up to a square factor.
* Hulpke: the Soicher–McKay approach *"is implemented in Maple up to degree 7"*, extended by the author in
  GAP 3 to degree 15, *"but for some groups calculations in degrees 12 and beyond become infeasibly slow"*;
  resolvent factorisations *"not arising from the symmetric group"* are tabulated up to degree 11 in
  Arnaudiès–Valibouze.

### 1.3 Cohen, *A Course in Computational Algebraic Number Theory*, §6.3 (1993)
Springer GTM 138. Chapter 6.3 = "Computing Galois Groups": 6.3.1 the resolvent method, then degree 3
(Prop. 6.3.5, discriminant), degree 4 (Alg. 6.3.6/6.3.7: resolvent cubic of `x_1x_2 + x_3x_4`), degree 5
(Alg. 6.3.9: the **sextic** resolvent of the F20-invariant + discriminant; C5 vs D5 needs a second,
ordering-dependent invariant), degree 6 (Alg. 6.3.10: two resolvents + discriminant), degree 7 (Alg.
6.3.11: a single degree-35 resolvent + discriminant). This is the algorithm PARI's `polgalois` implements
for n ≤ 7, and — via Eichenlaub–Olivier's tables — for n ≤ 11 (see 1.4).

`sympy`'s implementation is a faithful port (source
<https://github.com/sympy/sympy/blob/master/sympy/polys/numberfields/galoisgroups.py>, docs
<https://docs.sympy.org/latest/modules/polys/numberfields.html>): `galois_group(f, by_name, max_tries=30,
randomize=False)` handles **degree ≤ 6 only**, returns `(G, alt)` with `alt = G ≤ A_n`; internally
`_galois_group_degree_3` (Prop 6.3.5), `_galois_group_degree_4_root_approx` (Alg 6.3.7) /
`_galois_group_degree_4_lookup` (Alg 6.3.6 with precomputed resolvent-coefficient formulas),
`_galois_group_degree_5_hybrid` (Alg 6.3.9, "combining resolvent coeff lookup, with root approximation") /
`_galois_group_degree_5_lookup_ext_factor`, `_galois_group_degree_6_lookup` (Alg 6.3.10). Non-squarefree
resolvents trigger Tschirnhausen transformations (`tschirnhausen_transformation`, tried "along lines of
constant sum" or randomly, `MaxTriesException` after `max_tries`). Names come from Cohen and live in
`sympy.combinatorics.galois` (`S1TransitiveSubgroups` … `S6TransitiveSubgroups`,
<https://docs.sympy.org/latest/modules/combinatorics/galois.html>). **So the reference Python CAS stops at
degree 6, using exactly the recipe proposed for the browser.**

### 1.4 PARI/GP `polgalois` and `galdata` (Eichenlaub–Olivier)
PARI manual (2.19.0): *"T must be irreducible and the degree d of T must be less than or equal to 7. If
the galdata package has been installed, degrees 8, 9, 10 and 11 are also implemented."* Output
`[n, s, k, name]` = order, sign (±1 for ⊆ A_d), Butler–McKay T-number, GAP transgrp name; e.g. degree 5:
`C5=[5,1,1], D5=[10,1,2], M20=[20,-1,3], A5=[60,1,4], S5=[120,-1,5]`; degree 7:
`C7, D7, M21, M42, PSL2(7)=PSL3(2)=[168,1,5], A7, S7`
(<https://pari.math.u-bordeaux.fr/dochtml/html/General_number_fields.html>, entry `polgalois`). The
library signature `polgalois(GEN T, long prec)` carries a *real precision* argument — it is the
numeric-root resolvent method. `galdata.tgz` is 52 KB (packages listing,
<https://pari.math.u-bordeaux.fr/pub/pari/packages/>): the degree-8–11 resolvent data are *small*; source:
Y. Eichenlaub, M. Olivier, "Computation of Galois groups for polynomials with degree up to eleven",
preprint Univ. Bordeaux I (1995); Y. Eichenlaub, PhD thesis Bordeaux 1996 (cited in Hulpke [17]).

### 1.5 Geissler–Klüners (2000), Geissler (2003), Fieker–Klüners (2014), Elsenhans, Magma
* K. Geissler, J. Klüners, "Galois group computation for rational polynomials", *J. Symbolic Comput.* 30
  (2000) 653–674, <https://www.sciencedirect.com/science/article/pii/S0747717100903778>: Stauduhar with
  **p-adic** root approximations in an unramified extension of ℚ_p (a ring homomorphism, so no error
  propagation), subfield-based improvements for imprimitive groups, implemented to degree 15. Klüners'
  2014 slides give the history: *"Stauduhar 1973 ≤ 7; Geyer 1992 ≤ 9; Eichenlaub–Olivier 1995 ≤ 11;
  Geißler 1997 ≤ 12 (complex approximations); Geißler–Klüners 2000 ≤ 15 (p-adic); Geißler 2003 ≤ 23;
  current Magma: Fieker–Klüners, no degree restriction; many improvements by Elsenhans (invariant theory)"*
  (<https://bmd2014.iec.cat/files/2014/11/Slides_Klueners.pdf>).
* C. Fieker, J. Klüners, "Computation of Galois groups of rational polynomials", *LMS J. Comput. Math.*
  17 (2014) 141–158, arXiv:1211.3588. Key facts for us:
  * the precision needed to *prove* `F(α) = θ ∈ ℤ` from `F(α) ≡ θ (mod p^k)` is
    `p^k > (|θ| + N)^{(G:H)}` where `N` bounds `|F^σ(α)|` over ℂ — *"k = O(G:H), so k is too large to be
    useful in general"*; Magma therefore uses exponent 10 and "short cosets" and *"rel[ies] on a final
    proof step"* by absolute resolvents (§7.4). For **degree ≤ 7 the indices are tiny** (max
    `(S7:A7)=2`, `(A7:L(3,2))=15`, `(S5:F20)=6`, `(S6:PGL2(5))=6`), so the full proof precision is cheap.
  * it needs both complex roots (for bounds) and p-adic roots (for exactness).
  * A.-S. Elsenhans, "Improved methods for the construction of relative invariants for permutation
    groups", *J. Symb. Comput.* 79 (2017); Elsenhans–Klüners, "Computing subfields of number fields and
    applications to Galois group computations", arXiv:1610.06837 (2016/18): subfields give a good
    starting group.
* **Magma** (handbook, search excerpt; the page itself returns 401): *"based on an extension of the
  method of Stauduhar by Klüners, Geißler and, more recently, Fieker and Sutherland. There is no longer
  any limit on the degree … as this algorithm does not use the classification of transitive groups …
  computations in degree > 50 [can be] impossible, although computations in degree > 200 have been
  successful … the older version which is restricted to a maximum degree of 23 is still available"*; the
  Frobenius (p-adic) or complex conjugation supplies a known element to shrink coset lists.
  Nicole Sutherland, "Computing Galois groups of polynomials (especially over function fields of prime
  characteristic)", *J. Symb. Comput.* 71 (2015), and Krumm–Sutherland (§6 below) describe the ℚ(t)
  version (Magma V2.23/V2.24).
* Hulpke's survey (A. Hulpke, "Techniques for the computation of Galois groups", in *Algorithmic Algebra
  and Number Theory*, Springer 1999, <https://www.math.colostate.edu/~hulpke/paper/gov.pdf>) is the best
  single overview; its capability statement (1999 hardware): *"degree 8 will usually finish in under a
  minute, degree 10 may take a few minutes, but degree 12 … may take an hour or even much more"*; the
  hard cases are *"highly transitive groups which do not contain the alternating group"* (Mathieu
  groups).

### 1.6 What each approach needs — checklist

| Ingredient | Linear resolvents (Cohen/S–M) n ≤ 7 | Stauduhar descent | Chebotarev heuristic |
|---|---|---|---|
| squarefree + irreducibility test over ℤ | yes | yes | yes (Dedekind needs irreducible + squarefree mod p) |
| factorisation over ℤ | resolvents of degree ≤ 35 (n ≤ 7); ≤ 462 = C(11,5)… for n ≤ 11 tables | only to *verify* (`R_F(θ)=0`, squarefreeness) | no |
| numeric roots + rigorous error | yes (or symbolic resultants) | yes (ℂ or p-adic) | no |
| transitive-group table | orbit-length patterns per group (tiny) | lattice + invariants per maximal pair | cycle-type distributions |
| Tschirnhaus transformations | when a resolvent is not squarefree | same | no |

---

## 2. The Frobenius / Chebotarev heuristic — what it certifies and what it does not

**Dedekind's theorem** (K. Conrad, "Galois groups over ℚ and factorizations mod p",
<https://kconrad.math.uconn.edu/blurbs/gradnumthy/galois-Q-factor-mod-p.pdf>): for monic irreducible
`f ∈ ℤ[T]` and a prime `p ∤ disc f`, if `f ≡ π_1⋯π_k (mod p)` with distinct irreducibles of degrees
`d_1..d_k`, then `Gal(f)` contains a permutation of cycle type `(d_1,…,d_k)` (the Frobenius at a prime
above p). Only squarefreeness mod p is required. **Membership statements obtained this way are `=`.**

**Chebotarev / Frobenius density**: the density of primes with a given factorisation type equals the
proportion of elements of `G` with that cycle type (Wikipedia, "Chebotarev density theorem"; Frobenius
1880 for cycle types). Effective versions: Lagarias–Odlyzko 1977 (under GRH, error
`O(√x (n log x + log|Δ|))`), so the least prime with a prescribed class is `≪ (log |d_K|)²` under GRH —
`d_K` being the discriminant of the **splitting field**, this bound is astronomically large in practice
and useless as a certificate for "no transposition exists".

### 2.1 Certificates available in polynomial time (all `=`)

From K. Conrad, "Recognizing Galois groups S_n and A_n",
<https://kconrad.math.uconn.edu/blurbs/galoistheory/galoisSnAn.pdf> (proofs adapted from Gallagher 1973
and Serre's *Lectures on the Mordell–Weil theorem*):

* **Thm 2.1.** For n ≥ 2, a transitive subgroup of S_n containing a **transposition** and a **p-cycle for
  a prime p > n/2** is S_n.
* **Thm 2.2.** For n ≥ 3, a transitive subgroup containing a **3-cycle** and a p-cycle, p > n/2 prime, is
  A_n or S_n.
* **Thm 3.1.** A transitive subgroup containing a transposition and an **(n−1)-cycle** is S_n.
* **Thm 3.2** (Serre): a transitive subgroup containing a transposition and generated by cycles of prime
  order is S_n (used to prove `Gal(x^n − x − 1) = S_n`).
* Conrad's practical tricks: a transposition need not be *seen* directly — a permutation of type
  `(2,3)` cubed, or `(2,5)` to the 5th power, is a transposition; likewise `(2,2,3)` squared is a 3-cycle.
  He notes the first prime giving type `(1,1,1,1,1,2)` for `X^6+X^4+X+3` is 311 while `(1,2,3)` appears at
  p = 2.
* Jordan's theorem (1873) in its classical form — *a primitive group containing a p-cycle for a prime
  p ≤ n − 3 contains A_n* — is the group-theoretic engine; Conrad's theorems package it with the observation
  that transitive + prime cycle with p > n/2 forces primitivity. (Note: the "n-cycle + (n−1)-cycle" pair
  by itself is **not** a certificate: `PGL(2,5) = 6T14` of order 120 contains a 6-cycle and a 5-cycle
  but is not S_6.)
* The discriminant-square test is `=` at any degree: `G ≤ A_n ⇔ disc f ∈ ℚ^{×2}` (Klüners' slides;
  Cohen Prop. 6.3.1). `disc f` is an exact resultant over ℤ — a Sylvester determinant with Bareiss
  elimination in BigInt, or Newton sums.
* Together: **S_n / A_n identification is a polynomial-time, fully certified procedure** — factor mod a
  few primes (distinct-degree factorisation only, no need to split), collect cycle types, test the
  discriminant. Hulpke: *"This however permits to identify symmetric and alternating groups quickly [15],
  which is of practical importance as asymptotically all polynomials have the symmetric group as Galois
  group [48] … very cheap and should always be run as a first filter."* [15] = J. H. Davenport,
  G. C. Smith, "Fast recognition of alternating and symmetric Galois groups", *J. Pure Appl. Algebra* 153
  (2000) 17–25, <https://www.sciencedirect.com/science/article/pii/S002240499900078X>: returns either
  "definitely S_n or A_n" or "likely smaller"; after transitivity, four further failures make the
  probability of wrongly rejecting S_n/A_n < 10 %. (Davenport–Smith also use the "very transitive" trick:
  a prime cycle of length p with fixed points shows G is (n−p+1)-transitive, which excludes e.g. M_11.)

### 2.2 What is only probabilistic (`≈`)

* **Absence** of a cycle type is never certified by finitely many primes. So "the group is *not* S_n"
  (e.g. F20, A5-with-non-square-disc impossible anyway, L(3,2)…) is `≈` from statistics alone; it becomes
  `=` only via a resolvent (a rational root of the F20 sextic *proves* solvability, cf. §5).
* **Identification by distribution** compares empirical frequencies with each transitive group's
  cycle-type distribution. Hulpke: *"this approach gets into problems if the shape distribution does not
  identify groups uniquely. It happens first in degree 8 with the groups T8N10 = [2²]4 and T8N11 = Q8:2."*
  **[verified here]** LMFDB class tables: 8T10 (`C_2^2 : C_4`, order 16) and 8T11 (`Q_8 : C_2`, order 16)
  both have cycle-type counts `1^8:1, 2^4:5, 2^2 1^4:2, 4^2:8`
  (<https://www.lmfdb.org/GaloisGroup/8T10>, <https://www.lmfdb.org/GaloisGroup/8T11>). Such pairs are
  exactly the Gassmann-equivalent (arithmetically equivalent) situations; Perlis: no non-trivial ones for
  degree ≤ 6, first examples at degree 7 (for fields) / 8 (for these transitive pairs). LMFDB records
  "arithmetically equivalent" siblings per group, which a table can carry so the UI can say "cycle
  statistics cannot separate these two".
* **How many primes?** The *Chebotarev invariant* `C(G)` (Kowalski–Zywina, "The Chebotarev invariant of a
  finite group", *Exp. Math.* 21 (2012), arXiv:1008.4909) is the expected number of random conjugacy
  classes needed to invariably generate G; `c(S_n) ≍ 1`, `c(A_n) ≍ 1` (Thm 6.1), so a handful of primes
  suffices *in expectation* for S_n/A_n, while Frobenius groups `F_q ⋊ F_q^×` (Galois groups of
  `x^q − a`) have unusually large invariants (≈ 8.9 for degree 17). Lucchini–Tracey proved
  `C(G) ≤ β√|G|` (arXiv:1509.05859, 2001.06484). Practical rule: sample primes until every cycle type of
  the *candidate* group has appeared (that is a certified lower bound `G ⊇ ⟨those types⟩`), and report
  the number of primes tested.
* **Van der Waerden (1936)** conjectured, and Bhargava proved (arXiv:2111.06507, 2021), that among monic
  degree-n integer polynomials of height ≤ H only `O(H^{n−1})` fail to have Galois group S_n (Gallagher
  1973 gave `O(H^{n−1/2} log H)` via the large sieve). So for *random* user input the cheap S_n
  certificate is the answer almost always; the interesting cases (solvable quintics, PSL-type groups)
  are the exception and are exactly those the resolvent tier must handle.

---

## 3. Sub-tasks and their feasibility in-browser with `BigInt`

### (a) Factorisation of integer polynomials
* **Berlekamp–Zassenhaus** (Wikipedia; Klüners, "The van Hoeij algorithm for factoring polynomials",
  <https://math.uni-paderborn.de/fileadmin-eim/mathematik/AG-Computeralgebra/Publications-klueners/factor_lll.pdf>):
  squarefree part → pick a prime p with `f` squarefree mod p → factor in `F_p[x]` (distinct-degree +
  Cantor–Zassenhaus equal-degree splitting; Berlekamp is fine for small p) → Hensel-lift to `p^a ≥ 2·L`
  with `L` the Landau–Mignotte bound `‖g‖_∞ ≤ 2^{deg f}‖f‖_2` → try subsets of the r modular factors
  (`2^{r−1}` subsets in the worst case).
* **Is van Hoeij (LLL knapsack, 2002) needed below degree ~12?** No. The exponential step is in the
  number `r` of modular factors, and `r ≤ deg`. For `deg ≤ 12`, `2^{11}` subset products at
  a few hundred bits each is microseconds-to-milliseconds; choosing the best of ~5 primes (fewest
  factors) and intersecting the achievable factor-degree sets across primes (Musser's trick) prunes it
  further. The genuinely bad inputs are Swinnerton-Dyer polynomials (degree `2^k`, split into
  linear/quadratic factors mod every prime) — at degree 8 or 16 that is still `2^7`/`2^15` products, i.e.
  trivial; LLL becomes necessary around degree 50–100 with many modular factors (van Hoeij's paper opens
  with degree ~100 examples). Sage's own default before FLINT/PARI-vanHoeij was "PARI for degrees at most
  11, GAP 12–15, KASH ≥ 16".
* For the **resolvents** (degree 15–35 at n ≤ 7) the same holds: their modular factor counts are bounded
  by the number of orbits of the Frobenius, and one only needs the *degree pattern*, so one can (i) pick
  the prime with the fewest modular factors, and (ii) stop when the pattern found is the unique one
  consistent with the tables. Worst case for the degree-35 resolvent is `r ≈ 35`, but `p` can be chosen
  so that the Frobenius is an n-cycle in `Gal(f)` (an irreducible reduction), which makes the resolvent
  split into few factors mod p. Alternatively use the Stauduhar test (§1.1) which needs **no**
  factorisation.
* Time in JS: BigInt polynomial arithmetic at degree ≤ 35 with 200–500-bit coefficients is sub-second.

### (b) Squarefree factorisation
Yun's algorithm over ℚ (gcd with derivative); trivial. Needed before anything else, and Dedekind needs
`p ∤ disc f`.

### (c) Resolvent degrees for n ≤ 7
From §1.2: n = 5 → sextic (F20 invariant; Dummit's `f_20`, Cohen 6.3.9) plus, for C5 vs D5, a
degree-2 relative resolvent or the degree-20 `x_1 − x_2` orbit pattern (C5: 5+5+5+5; D5: 10+10);
n = 6 → degrees 15 (`x_1+x_2`), 20 (`x_1+x_2+x_3`), 30 (`x_1−x_2`), plus discriminant (Cohen 6.3.10 uses
essentially two resolvents); n = 7 → degree 35 (`x_1+x_2+x_3`) plus discriminant. Nothing above degree
35 is required through n = 7. For n = 8–11 PARI's `galdata` (52 KB) encodes the Eichenlaub–Olivier
resolvent data, but reproducing it means re-deriving invariants and decision trees for 50+34+45+8 = 137
groups — a project in itself.

### (d) Numeric roots to certified precision
* **Root finding**: Durand–Kerner/Weierstrass (simultaneous, quadratically convergent near roots;
  start on a circle enclosing all roots, e.g. Cauchy/Fujiwara bound, with offsets `(0.4+0.9i)^k`) or
  Aberth–Ehrlich in double precision, then **Newton polishing in BigInt fixed point** (or double-double)
  to the required precision — each Newton step doubles the correct bits, so 200–1000 bits cost ~10 steps
  of degree-n BigInt evaluations. Hubbard–Schleicher–Sutherland ("How to find all roots of complex
  polynomials by Newton's method", *Invent. Math.* 146 (2001)) give a universal starting set of
  `1.11 d log² d` points guaranteeing every root is found — useful as a fallback when Durand–Kerner
  cycles.
* **Certified inclusion discs** (the rounding certificate): with
  `W_i = f(z_i)/∏_{j≠i}(z_i − z_j)` (the Weierstrass correction, monic f), every root lies in the union of
  the discs `D(z_i, n|W_i|)`, and a disc disjoint from the others contains exactly one root
  (B. T. Smith, "Error bounds for zeros of a polynomial based upon Gerschgorin's theorems", *J. ACM* 17
  (1970) 661–674; Braess–Hadeler, "Simultaneous inclusion of the zeros of a polynomial", *Numer. Math.* 21
  (1973) 161–165; Wikipedia's Durand–Kerner page states the `(n−1)|W_k|` disc about `z_k + W_k`). These
  bounds are evaluated with **outward-rounded interval arithmetic** — in BigInt fixed point one tracks a
  radius `BigInt` alongside each value with explicit rounding slack, which is easy since every operation
  is exact except the final truncation.
* **Rounding a resolvent coefficient to an integer, certified**: evaluate the invariant and expand the
  product in complex *disc* arithmetic (centre + radius); if each coefficient's disc has radius < 1/2 it
  contains exactly one integer, which is the coefficient. Required precision: a priori,
  `|coeff_i(R)| ≤ C(deg R, i)·B^{deg R}` with `B` a bound on `|F(α)|` (e.g. `B ≤ (#terms of F)·ρ^{deg F}`
  for a root bound ρ) — Krumm–Sutherland §3.4 use precisely `max_i C(deg R, i)·B^{deg R}`; for the
  degree-35 cubic-invariant resolvent of a degree-7 polynomial with `ρ ≈ 10` this is ~10^{170}, i.e.
  ~600 bits of working precision, trivially affordable. In practice one iterates: double the precision
  until all radii < 1/2. **Then verify exactly**: the rounded `R ∈ ℤ[T]` is factored / evaluated with
  exact integer arithmetic; the certificate is the exact computation, the numerics only *suggest*
  the integer. This is the "compute numerically, round, verify exactly" pattern of Cohen §6.3 and of
  PARI's `polgalois(T, prec)`; Fieker–Klüners do the same p-adically (`p^k > 2N` to *find* θ, then
  `R_F(θ) = 0` exactly to *prove* it).
* For the **Stauduhar variant** the certificate is: (i) `R_F` rounded and exact; (ii) `R_F(θ) = 0` and
  `R_F'(θ) ≠ 0` (θ a simple root) in ℤ; then `Gal(f) ≤ σ^{-1}Hσ` (Cor. 3.4 of Fieker–Klüners, which
  assumes `R_F` squarefree — with `θ` simple the argument in Bright §6 goes through: `Gal(f)` fixes θ,
  θ belongs to a unique coset, so `Gal(f)` stabilises that coset). Non-containment is certified when
  every coset value's disc excludes all integers (radius < distance to nearest integer). A p-adic
  implementation is equally feasible in BigInt (Hensel lifting of the roots of `f mod p` when `f` splits
  completely mod p, else in `F_{p^m}`), and avoids any floating point — but the complex route reuses the
  root finder the suite already has.

### (e) Transitive-group tables
* Counts (OEIS A002106, <https://oeis.org/A002106>): n = 1..24 →
  `1, 1, 2, 5, 5, 16, 7, 50, 34, 45, 8, 301, 9, 63, 104, 1954, 10, 983, 8, 1117, 164, 59, 7, 25000`;
  n = 32 → 2,801,324; n = 48 → 195,826,352. Cumulative: **37 groups for n ≤ 7, 174 for n ≤ 11, 475 for
  n ≤ 12, 651 for n ≤ 15, 2605 for n ≤ 16, 4953 for n ≤ 23**. Sources per degree: Butler–McKay 1983
  (≤ 11, *Comm. Algebra* 11, 863–911), Royle 1987 (12), Butler 1993 (14, 15), Hulpke 1996/2005 (16–30,
  <https://www.math.colostate.edu/~hulpke/smalldeg.html>), Cannon–Holt (32), Holt–Royle 2020 (34–46 and
  the census paper *J. Symb. Comp.* 101), Holt–Royle–Tracey (48).
* **Data size for a web table**: per group one needs order, parity, solvable, primitive, nilpotent,
  name/label, the cycle-type distribution (a vector indexed by partitions of n: `p(n)` = 7, 11, 15, 22,
  30, 42, 56, 77, 101, 135, 176, 231 for n = 5..16), and the list of transitive overgroups/maximal
  subgroups (for the lattice). For n ≤ 11: 174 groups × ≤ 56 partitions ≈ **< 50 KB of JSON**; n ≤ 15:
  651 groups × ≤ 176 ≈ 300 KB; n ≤ 23 ≈ 5000 groups ≈ a few MB (still shippable but pointless without an
  algorithm that reaches those degrees). Hulpke: *"the number of transitive groups grows substantially for
  higher n (301 classes of degree 12, 1954 of degree 16, 26813 of degree 24) and therefore such a
  preparation will not be reasonable beyond degree 15."*
* **Where to get it**: GAP `transgrp` package (<https://docs.gap-system.org/pkg/transgrp/htm/CHAP001.htm>;
  degrees ≤ 47 except 32/48 shipped, licence "free to distribute provided you make no modifications";
  `TransitiveGroup(n,k)`, `TransitiveIdentification` ≤ 30; cycle-type distributions are one line of GAP
  over `ConjugacyClasses`). LMFDB Galois groups (<https://www.lmfdb.org/GaloisGroup/>, 512,614 groups,
  all degrees ≤ 47 except 32) with nTj labels, class tables with cycle types and sizes, parity,
  solvability, primitivity, "arithmetically equivalent" siblings, low-degree resolvents, and a JSON API
  (`/api/gps_transitive/?n=7&_format=json&_fields=label,order,parity,solv,prim,cyc,name,gapid` returned
  the seven degree-7 groups in this session — note the site puts a browser check in front of `curl`).
  Test polynomials for every transitive group up to degree 15 (and most signatures): Klüners–Malle,
  "A database for field extensions of the rationals", *LMS JCM* 4 (2001) 182–196, and "Explicit Galois
  realization of transitive groups of degree up to 15", *J. Symb. Comput.* 30 (2000);
  <http://galoisdb.math.uni-paderborn.de/> — the natural golden corpus for the suite's tests.

---

## 4. Solvability and the quintic families

Solvability is a lookup once the group is known (`solv` flag in GAP/LMFDB; for n ≤ 7 the non-solvable
transitive groups are exactly A5, S5, PSL(2,5)=A5 and PGL(2,5)=S5 in degree 6, A6, S6, L(3,2), A7, S7).
For prime degree p the solvable transitive groups are the subgroups of `AGL(1,p) = F_{p(p−1)}`, so for
quintics: **solvable ⇔ G ≤ F20 ⇔ G ∈ {C5, D5, F20}** (Dummit, Thm 1 and §1).

The five families, with what certifies each **[all numbers verified here; mod-p statistics over the 78
primes < 400 with p ∤ disc]**:

| f | disc f | cycle types seen (fraction) | Group | Certificate |
|---|---|---|---|---|
| `x^5 − x − 1` | 2869 = 19·151, not square | (3,2) .24, (3,1,1) .24, (4,1) .22, (5) .18, (2,2,1) .07, (2,1,1,1) .05 | **S5** (5T5) | 5-cycle at p=3, type (3,2) at p=2 ⇒ cube is a transposition ⇒ Conrad 2.1 (p=5 > 5/2). Fully `=`, polynomial time. Also Mattman et al.: the sextic `x^6−8x^5+40x^4−160x^3+400x^2−3637x+9631` has no integer root. |
| `x^5 − 5x + 12` | 64,000,000 = 8000² = 2^12·5^6, square | (2,2,1) .54, (5) .37, (1^5) .09 | **D5** (5T2) | disc square ⇒ ≤ A5; Dummit's sextic `x^6−40x^5+1000x^4−20000x^3+250000x^2−66400000x+976000000` has the integer root θ = 40 ⇒ solvable ⇒ C5 or D5; type (2,2,1) at p = 3 ⇒ contains an involution ⇒ **not C5** ⇒ D5. All three steps `=`. LMFDB: the field `5.1.1000000.1` (`x^5−5x−12`, the `x↦−x` twin) has Galois group 5T2 = D5. Spearman–Williams, "Dihedral quintic polynomials and a theorem of Galois", parametrise this family. |
| `x^5 + 20x + 16` | 1,024,000,000 = 32000² = 2^16·5^6, square | (5) .45, (3,1,1) .35, (2,2,1) .20 | **A5** (5T4) | disc square ⇒ ≤ A5; 5-cycle at p=3 and a 3-cycle (3,1,1) at p=7 ⇒ Conrad 2.2 ⇒ A5. Fully `=`. Mattman: sextic constant term 2^18·5^6, no integer root — consistent. Conrad's "all but three roots in F_7" is the (3,1,1) at 7. |
| `x^5 − 2` | 50,000 = 2^4·5^5, not square | (4,1) .55, (2,2,1) .22, (5) .18, (1^5) .04 | **F20** (5T3, PARI "M20") | Theory: splitting field ℚ(2^{1/5}, ζ_5), degree 20. Algorithmically: Dummit's sextic for `x^5+ax+b` is `x^6+8ax^5+40a²x^4+160a³x³+400a⁴x²+(512a⁵−3125b⁴)x+(256a⁶−9375ab⁴)`; at a=0, b=−2 it is `x(x^5 − 50000)`, rational root 0 ⇒ solvable; disc not a square ⇒ not C5/D5 ⇒ F20. `=`. (A 4-cycle at p = 3 independently excludes C5, D5, A5.) |
| `x^5 + x^4 − 4x^3 − 3x^2 + 3x + 1` | 14641 = 11^4, square | (5) .81, (1^5) .19 | **C5** (5T1) | It is the minimal polynomial of `2cos(2π/11)`, i.e. `ℚ(ζ_11)^+`, cyclic of order 5. Algorithmically: disc square + sextic rational root ⇒ {C5, D5}; C5 vs D5 needs a resolvent (Stauduhar's `σ_1 = r_1r_2² + r_2r_3² + … ` integrality with certified rounding, or the orbit pattern 5+5+5+5 vs 10+10 of the degree-20 `x_1 − x_2` resolvent) — cycle statistics alone (no involution ever seen) are only `≈`. |

The observed frequencies match the theoretical class proportions (S5: 5-cycles 24/120 = .20, D5:
involutions 5/10, A5: 5-cycles 24/60 = .40 / 3-cycles 20/60 / involutions 15/60, F20: 4-cycles 10/20,
C5: 4/5), which is the Chebotarev heuristic doing its job.

For Mattman–Robertson-Figaniak–Steele, "Galois theory by calculator", arXiv:2508.18595 (2025): the whole
degree ≤ 5 decision reduces to "is an integer a square?" and "does an integer polynomial have an integer
root?" (rational-root test on the sextic) plus, for C5 vs D5, Newton-approximated roots and Stauduhar's
integrality test — implemented in Desmos. That is a proof of concept that the degree-≤ 5 tier is
calculator-sized.

---

## 5. Quintic-specific literature and exhibiting the radical solution

* D. S. Dummit, "Solving solvable quintics", *Math. Comp.* 57 (1991) 387–401,
  <https://www.ams.org/journals/mcom/1991-57-195/S0025-5718-1991-1079014-X/S0025-5718-1991-1079014-X.pdf>.
  For `f = x^5 + p x^3 + q x^2 + r x + s` (after removing the `x^4` term) the invariant
  `θ = x_1²(x_2x_5 + x_3x_4) + x_2²(x_1x_3 + x_4x_5) + x_3²(x_1x_5 + x_2x_4) + x_4²(x_1x_2 + x_3x_5) + x_5²(x_1x_4 + x_2x_3)`
  has stabiliser exactly F20 = ⟨(12345),(2354)⟩; its six conjugates are the roots of the explicit sextic
  `f_20` (coefficients printed in Dummit eq. (2), reproduced in Mattman et al. §4 as A…F). **Theorem 1:**
  *f is solvable by radicals iff `f_20` has a rational root; then `f_20` = linear × irreducible quintic.*
  Then G = F20 if disc is not a square, else C5 or D5. Errata: the `x³` coefficient in example 2 is
  −20000; the constant term in example 3 is −360260685644469671875.
* Radical formulas (Dummit §§2–5): with θ rational and Δ = √D, the four quantities `l_1..l_4` (the
  `ζ^i`-components of the fifth power of the Lagrange resolvent `(x_1, ζ)^5 = l_0 + l_1ζ + … + l_4ζ^4`)
  are roots of a **cyclic quartic over ℚ(θ) = ℚ that factors over ℚ(√D) into two conjugate quadratics**
  `[x² + (T_1 + T_2Δ)x + (T_3 + T_4Δ)][x² + (T_1 − T_2Δ)x + (T_3 − T_4Δ)]`, with `T_1..T_4 ∈ ℚ` given as
  degree-5 polynomials in θ over `p,q,r,s` (general case in the microfiche appendix; for `x^5 + ax + b`
  printed as (8.1′)–(8.4′)); an *ordering* element `O` with `(l_1−l_4)(l_2−l_3) = O·Δ` fixes the pairing;
  then `R_i = r_i^5 = l_0 + l_1ζ^{…}…` and the roots are `x_i = (ζ^{…}r_1 + … )/5` with the fifth roots
  `r_i` pinned by `r_1r_4, r_2r_3 ∈ ℚ(Δ√5)` and two equations `r_1r_2² + r_4r_3² = u + vΔ√5`,
  `r_3r_1² + r_2r_4² = u − vΔ√5` (`u = −25q/2`, v explicit). Dummit himself obtained the coefficient
  tables by 100-digit numerics plus p-adic reconstruction.
* **Feasibility of exhibiting the radicals in-browser**: yes, but it is real work. Needed: exact
  arithmetic in ℚ(√D) (and ℚ(√5D)) to solve the two quadratics; then the five values `R_i` live in
  ℚ(√D, ζ_5) — one must choose fifth roots consistently (Dummit's Lemma) and verify by evaluating the
  resulting expression numerically against the certified roots. A *symbolic* display (nested radicals)
  is straightforward once `T_i`, `O`, `u`, `v` are transcribed; the general-`p,q,r,s` tables are on
  microfiche (not in the PDF) — either re-derive them (Dummit's method: numeric evaluation at many
  integer specialisations + exact linear algebra) or restrict the exhibit to Bring–Jerrard / trinomial
  form `x^5 + ax + b`, for which all coefficients are printed in the paper, and reduce a general quintic
  to it by a Tschirnhaus transformation (which is itself a cubic/quartic radical step). Alternatives:
  Kobayashi–Nakagawa, "Resolution of solvable quintic equation", *Math. Japonica* 37 (1992) 883–886;
  Lazard, "Solving quintics by radicals" (2004, in *The Legacy of Niels Henrik Abel*), which gives a
  cleaner Lagrange-resolvent derivation; the Wikipedia "Quintic function" article and MathWorld "Quintic
  equation" summarise these. Recommendation: exhibit radicals for `x^5 + ax + b` (`=`, exact
  verification by re-expanding) and for D5/C5 in general via the sextic root and the cyclic-quartic route
  only if the tables are re-derived and unit-tested against the Klüners–Malle corpus.

---

## 6. Algebraic Galois group vs. monodromy of a one-parameter family

* **Definitions and containments.** For `P(t,x) ∈ ℚ[t][x]` separable of degree n let `Ω` be its
  splitting field over ℚ(t). The *arithmetic* Galois group is `A = Gal(Ω/ℚ(t))`; the *geometric* one is
  `G = Gal(Ω/L(t))` with `L = Ω ∩ ℚ̄` the constant field; `G ⊴ A` with `A/G ≅ Gal(L/ℚ)`. G does not change
  under further constant-field extension, so `G = Gal(P / ℂ(t))`, and **over ℂ the Galois group equals the
  monodromy group** of the branched cover `{P = 0} → ℂ_t` (Hermite 1851; J. Harris, "Galois groups of
  enumerative problems", *Duke Math. J.* 46 (1979) 685–724; restated in Hauenstein–Rodriguez–Sottile §2.2:
  *"Hermite realized that Galois and monodromy groups coincide and Harris gave a modern treatment"*).
  Hence `Mono(P) = G ≤ A ≤ S_n`, and `Mono = A` iff `L = ℚ` (no new constants).
* **Hilbert irreducibility.** For all `c ∈ ℚ` outside a *thin* set (Serre, *Lectures on the Mordell–Weil
  theorem*, §9; *Topics in Galois theory*), the specialisation `P(c,x)` has the same factorisation type
  and `Gal(P(c,x)/ℚ) ≅ A`. Krumm–Sutherland, "Galois groups over rational function fields and explicit
  Hilbert irreducibility", *J. Symb. Comput.* 103 (2021), arXiv:1708.04932, make the exceptional set
  `E(P) = {c : F(P_c) ≠ F(P) or G_c ≇ A}` explicit: `G_c ≤ A` always (Prop. 2.3, via reduction modulo the
  prime `(t − c)`), and `G_c` drops into a conjugate of a maximal subgroup `M_i` iff the specialised
  Stauduhar resolvent `q_i(c, x)` has a rational root (their Lemma 2.8 + Thm 2.7) — so the exceptional
  set is the union of the rational points of finitely many curves `q_i(t, x) = 0` (Magma
  `HilbertIrreducibilityCurves`). Their Galois-group-over-ℚ(t) algorithm is Fieker–Klüners' descent with
  p-adic places replaced by places of ℚ(t) (Magma V2.23/24), and proofs again via absolute resolvents.
* **The generic case and `x^5 − x − t`.** The trinomial `X^n + tX^a + u` with independent
  indeterminates and `gcd(n,a) = 1` has Galois group S_n over `F(t,u)` (Cohen–Movahhedi–Salinier, "Galois
  group of a polynomial with two indeterminate coefficients", *Pacific J. Math.* 90 (1980),
  <https://msp.org/pjm/1980/90-1/pjm-v90-n1-p07-s.pdf>). For the one-parameter family
  **`x^5 − x − t`** one can see `Mono = S_5` directly **[verified here]**: `disc_x = 3125t^4 − 256` has
  four simple roots, at each of which exactly one pair of roots collides (a simple branch point), so each
  local monodromy is a transposition; the polynomial is irreducible over ℂ(t) (it is linear in t), so
  the monodromy group is transitive and generated by transpositions, hence S_5 (Conrad Thm 3.2 / the
  standard lemma). Therefore `G = A = S_5` and, by HIT, `Gal(x^5 − x − c) = S_5` for all `c` outside a
  thin set — `c = 1` is the S5 example of §4. Contrast: the trinomial family `ax^7 + bx + c` is generically
  S_7 but the Trinks–Matzat member `x^7 − 7x + 3` (and exactly three other equivalence classes, Elkies
  1999 / Bruin 2001) has Galois group L(3,2) of order 168
  (<https://people.math.harvard.edu/~elkies/trinomial.html>) — a beautiful "specialisation lands in the
  thin set" example for the app, with cycle types 7, 4+2+1, 3+3+1, 2+2+1+1+1 and full splitting first at
  p = 1879.
* **Computing monodromy numerically.** Hauenstein–Rodriguez–Sottile, "Numerical computation of Galois
  groups", *Found. Comput. Math.* 18 (2018), arXiv:1605.07806: locate the branch locus `B` (roots of the
  discriminant in t), lift loops around each branch point from a base point (a "flower" of loops), track
  the n roots along each loop by homotopy continuation, read off permutations, generate the group; they
  also use fiber products to compute transitivity and decide S_n/A_n; results from heuristic
  continuation are **not certified** (path-jumping). Braid-level output (which root goes around which)
  is the *braid monodromy* (Guillemot slides, Sept. 2025; "Computing braids from approximate data",
  arXiv:2601.23073).
* **Certified continuation** (the `=` route for monodromy): Beltrán–Leykin, "Certified numerical homotopy
  tracking", *Exp. Math.* 21 (2012) and "Robust certified numerical homotopy tracking", *FoCM* 13 (2013)
  253–295 (α-theory step control, rational arithmetic); Xu–Burr–Yap, "An approach for certifying homotopy
  continuation paths: univariate case", ISSAC 2018, 399–406 (well-isolated root clusters, **univariate** —
  the exact setting of a one-parameter polynomial family); Duff–Lee, "Certified homotopy tracking using
  the Krawczyk method", ISSAC 2024 (arXiv:2402.07053); Guillemot–Lairez, "Validated numerics for
  algebraic path tracking", ISSAC 2024 (arXiv:2401.17973; Rust library *Algpath*, interval arithmetic +
  Taylor models, "tremendous improvement over existing software"); "A priori bounds for certified
  Krawczyk homotopy tracking", arXiv:2512.01355; Guillemot–Voight, "Belyi map verification using
  certified path tracking", arXiv:2604.15562 (2026: end-to-end certified monodromy triples for LMFDB
  Belyi maps — the same problem shape as ours). The univariate special case needed here is much easier
  than the general one: along a path `t(s)` the Weierstrass discs of §3(d) give, at each step, a proof
  that the n discs are disjoint and each contains one root; choosing the step so that the discs at the
  next `t` are still disjoint from the *previous* ones (and Newton contracts) proves no root swap
  occurred. That is a few hundred lines of BigInt-interval code and gives `=` monodromy permutations
  (what Guillemot–Lairez's Moore/Krawczyk test specialises to in one variable). The branch points
  themselves are roots of `disc_x P(t,x)` (exact integer polynomial in t; isolated with the same
  machinery), and the loops can be chosen as piecewise-linear paths avoiding the isolating discs.

---

## 7. Existing JavaScript/WebAssembly options

| Option | Factor over ℤ? | Galois groups? | Size / status |
|---|---|---|---|
| **PARI/GP WebAssembly** (official demo <https://pari.math.u-bordeaux.fr/gpexpwasm.html>, emscripten, "≈15 % of native speed") | yes (van Hoeij/Belabas) | `polgalois` n ≤ 7; 8–11 only with `galdata` | **[measured here]** `gp-sta.wasm` = 14,485,229 bytes raw, 4,500,382 bytes gzip-9 (≈4.5 MB over the wire), `gp-sta.js` 78 KB; `galdata.tgz` is 52 KB and is *not* bundled in the demo build (would need a custom emscripten build with `--preload-file`). GPL. |
| `@sagemath/pari` (sagemathinc/wasm-pari, npm) | yes | as PARI | 29 MB unpacked, v1.0.5 (2021), **Node only** ("browser support via webpack5 is a TODO"), 2 commits, cannot interrupt long computations. |
| Sage.js / flint-wasm (rkirov/sagejs) | yes (FLINT `fmpz_poly_factor`) | no | FLINT+GMP+MPFR proof-of-concept 4.7 MiB browser module, "early alpha" 0.3.0. |
| Giac/Xcas wasm (geogebra/giac, npm `giac`) | yes | no Galois-group function | ≈12–18 MB; GeoGebra's CAS engine; 2–15× slower than native. |
| Algebrite (JS/TS CAS) | limited (rational roots / simple patterns; no Zassenhaus) | no | small |
| nerdamer / nerdamer-prime | `factor` is heuristic, known bugs (issues #40, #261), "solves polynomials up to 3rd degree" | no | small, semi-maintained |
| math.js | no polynomial factorisation | no | — |

**Assessment.** Embedding PARI-wasm on a static site is *technically* realistic (single 14.5 MB `.wasm`,
4.5 MB compressed, loads in a worker) but (i) it is a 4.5 MB download to answer a question that at
n ≤ 7 needs ~50 KB of TypeScript and tables, (ii) the shipped build is capped at degree 7 anyway unless
one maintains a custom emscripten build with `galdata` (reaching 11), (iii) `polgalois` returns only the
group, not the root permutations / invariants the app wants to *show*, and its certification story is
"numeric with rounding" — no better than what can be built natively with rigorous intervals, and (iv) it
would sit outside the suite's convention-neutral `@cas/*` packages, breaking the "each tool builds fewer
primitives" north star. Native TypeScript for n ≤ 7 is the right call; PARI-wasm is at most an
optional, lazily-loaded "cross-check with PARI" button.

---

## 8. Complexity and cost estimates (BigInt in a browser worker)

* Exact discriminant (Sylvester/Bareiss, degree n ≤ 12): `O(n^3)` BigInt ops on numbers of ~`n·log‖f‖`
  bits — sub-millisecond.
* Distinct-degree factorisation mod p for 20–50 primes < 1000, degree ≤ 12: `O(n^2 log p)` per prime —
  milliseconds. (Reuse for irreducibility over ℤ: if `f` is irreducible mod some p, or the achievable
  degree sets across primes have empty intersection, `f` is irreducible — exactly Conrad's Example 1.1.)
* Zassenhaus over ℤ at degree ≤ 35 with 200–600-bit coefficients: Hensel lifting is `O(n^2)` BigInt
  ops per lifting step over ~10 steps; recombination ≤ `2^{r−1}` trial divisions but with degree-set
  pruning typically a few hundred — well under a second.
* Root finding to 600 bits: Durand–Kerner in doubles (~50 iterations) then ~10 BigInt Newton steps of
  `O(n)` multiplications at ≤ 600 bits — milliseconds.
* Resolvent expansion for degree 35: product of 35 linear factors in disc arithmetic — negligible.
* Degree 8–11 (if ever): the Stauduhar descent through the 50/34/45/8 groups needs invariants per
  maximal-subgroup pair (Fieker–Klüners §4–5 give constructive recipes; the generic
  `Σ_{σ∈H} x_{σ(1)} x_{σ(2)}² ⋯ x_{σ(n)}^n` always works but is huge) and indices up to
  `(S_8 : PGL(2,7)) = 120`, `(A_11 : M_11) = 2520` — the proof precision `(|θ|+N)^{(G:H)}` is then
  thousands of bits, still fine for BigInt, but the group-theoretic table work (lattice, invariants,
  coset representatives for 137 groups) is the real cost; this is what `galdata` (52 KB) and Hulpke's
  GAP code encode. Suggested only as a later milestone, with tables generated offline in GAP and
  shipped as JSON.

---

## 9. Recommendation — a tiered, honestly-labelled offering

**Tier 0 — always (`=`, any degree, milliseconds).**
Squarefree/irreducibility over ℤ (rational roots + mod-p degree sets, or Zassenhaus); exact
discriminant and the square test (`G ≤ A_n` or not); Dedekind cycle types from 20–50 primes, displayed as
a growing certified list "G contains elements of type …" with the primes that witnessed them (this is
the visualisable, teachable object); **S_n / A_n certificate** by Conrad 2.1/2.2/3.1 with the power
trick (a transposition or 3-cycle extracted as a power of an observed type). Label: `= S_n` / `= A_n`
when the certificate closes; otherwise "`G` contains … ; not yet S_n".

**Tier 1 — degree ≤ 7 (`=`, the Cohen / Soicher–McKay / Stauduhar engine).**
Numeric roots with Weierstrass/Smith inclusion discs in BigInt fixed point; resolvents `x_1 ± x_2`,
`x_1 + x_2 + x_3`, the F20 sextic (Dummit's explicit coefficients for n = 5, so no numerics at all there),
rounded under a radius-<½ certificate and then handled **exactly** (integer factorisation / integer root
test / simple-root check); Tschirnhaus retry when a resolvent is not squarefree; orbit-length lookup
against a 37-group table; solvability from the table. Output the group as nTj + name, the parity,
solvability, and — because Stauduhar's descent orders the roots — an explicit set of generators acting
on the *numbered, plotted* roots (the suite's visual asset). Ship Klüners–Malle / LMFDB test polynomials
for all 37 groups as the golden corpus. Reference implementation to port: sympy's
`galoisgroups.py` (degrees 3–6) plus Cohen 6.3.11 / Soicher–McKay for degree 7.

**Tier 2 — degree 8–15 (`≈`, statistics + table).**
Embed the transitive-group table for n ≤ 15 (651 groups; cycle-type distributions, order, parity,
solvable, primitive, arithmetically-equivalent siblings; generated offline from GAP `transgrp` /
LMFDB, < 300 KB gzip) and report the *set* of transitive groups consistent with (a) every observed
type, (b) parity, (c) the factorisation patterns of any cheap linear resolvent the engine can afford
(`x_1 + x_2` of degree `C(n,2) ≤ 105`, still fine to factor). Rank by χ²/likelihood against the
observed frequencies and show it as "≈ probably nTj (k primes; alternatives …)". Say explicitly when
two candidates have identical statistics (8T10/8T11 and the LMFDB "arithmetically equivalent" list).
Never print `=` here unless Tier 0 closed the case.

**Tier 3 — optional later work.** (a) Stauduhar descent for n ≤ 11 with offline-generated invariant
tables (matches PARI+galdata); (b) Dummit's radical formulas for solvable quintics, first for
`x^5 + ax + b`; (c) a **certified monodromy tracker** for one-parameter families (`x^5 − x − t` as the
showpiece: four branch points, four transpositions, S_5), using the same interval root machinery, with
the theorem "monodromy ≤ Gal over ℚ(t), equal iff no new constants; specialisations agree outside a
thin set (HIT)" as the explanatory bridge to the arithmetic tiers; (d) a lazily-loaded PARI-wasm
cross-check (4.5 MB) if an independent oracle is wanted in the UI — not as the engine.

**Do not**: ship PARI-wasm as the primary engine; claim a group from cycle statistics with `=`; attempt
van Hoeij/LLL (unneeded below degree ~50); or attempt degree ≥ 12 identification beyond the statistical
tier.
