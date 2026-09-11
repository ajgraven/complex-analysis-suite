# Symbolic & exact algorithms for residues, partial fractions, and closed forms

> Research track 05 for `apps/contour-integration`. This is the **exact-engine specification**:
> which algorithm computes each exact quantity, what it costs, what it can honestly label `=`,
> and — per component — whether we reuse `@cas/exact` / `@cas/core` as-is, extend them, port from
> the Quadrature-Domains exact kernel, or build new.
>
> **Headline finding.** Everything about residues is exactly computable *without factoring the
> denominator* — the full residue multiset, all Laurent coefficients, the antiderivative's
> logarithmic part. The **one** genuinely hard thing is the half-plane restriction
> $\sum_{\operatorname{Im}\alpha>0}\operatorname{Res}$, and it is hard for a structural reason
> (§1.5): that subset is not Galois-stable, so no $\mathbb{Q}(i)$-rational closed form exists in
> general. The engine must be built around that fact, not around wishing it away.

---

## 1. Residues without factoring the denominator

Throughout: $f=P/Q$ with $P,Q\in\mathbb{Q}(i)[z]$, $\gcd(P,Q)=1$, $n=\deg Q$, coefficient bit
size $\tau$. "Exact ops" = field operations in $\mathbb{Q}(i)$.

### 1.1 The simple-pole formula, kept inside the quotient ring

For $Q(\alpha)=0$, $Q'(\alpha)\neq0$: $\operatorname{Res}_{z=\alpha}P/Q = P(\alpha)/Q'(\alpha)$.
Do **not** instantiate $\alpha$. Work in $A=\mathbb{Q}(i)[z]/\langle Q\rangle$ and compute the
single element

$$S \;:=\; P\cdot (Q')^{-1} \bmod Q \;\in\; A ,$$

whose value at each root *is* the residue there. $(Q')^{-1}\bmod Q$ exists iff $\gcd(Q,Q')=1$ iff $Q$ is squarefree; extended Euclid gives
$UQ'+VQ=1$, so $(Q')^{-1}\equiv U$. $O(n^2)$ exact ops. **Trap:** the textbook monic Euclidean
remainder sequence suffers exponential coefficient growth — use the fraction-free (subresultant)
PRS, or clear denominators once into $\mathbb{Z}[i]$ and run a primitive PRS; bit cost
$\tilde O(n^2\tau)$.

Output: one degree-$<n$ polynomial over $\mathbb{Q}(i)$ — "the residue as a function on the roots
of $Q$". Make this the engine's canonical residue representation; it is exactly what a `RootSum`
prints.

### 1.2 The *total* residue sum is free

$\sum_{\text{all poles}}\operatorname{Res}f = -\operatorname{Res}_\infty f$, and
$\operatorname{Res}_\infty(P/Q) = 0$ when $\deg P\le n-2$, $= -\mathrm{lc}(P)/\mathrm{lc}(Q)$ when
$\deg P=n-1$. Equivalently (Euler–Jacobi / Lagrange interpolation identity)

$$\sum_{Q(\alpha)=0}\frac{P(\alpha)}{Q'(\alpha)}=\begin{cases}0,&\deg P\le n-2\\ \mathrm{lc}(P)/\mathrm{lc}(Q),&\deg P=n-1.\end{cases}$$

More generally $\sum_\alpha S(\alpha)=\operatorname{Tr}_{A/\mathbb{Q}(i)}(S)$, the trace of the
multiplication matrix $M_S$ in the basis $1,z,\dots,z^{n-1}$; equivalently $\sum_k s_kp_k$ with the
power sums $p_k=\sum_\alpha\alpha^k$ from **Newton's identities** on $Q$'s coefficients
($p_k+e_1p_{k-1}+\dots+ke_k=0$ for $k\le n$; $p_k+e_1p_{k-1}+\dots+e_np_{k-n}=0$ for $k>n$, with
$e_i=(-1)^ia_{n-i}/a_n$). Pure $\mathbb{Q}(i)$ linear algebra, $O(n^2)$, always `=`. Worth saying
loudly in the derivation UI: **the total is trivial; the contour is what costs.**

### 1.3 Rothstein–Trager: the residue-annihilating polynomial

*Theorem (Rothstein 1976; Trager 1976; Bronstein §2.4).* Let $A,D\in K[z]$, $\deg A<\deg D$, $D$
squarefree. Then $\int A/D = \sum_i c_i\log v_i$, where the $c_i$ are the **distinct roots of**

$$\boxed{\;R(t)\;=\;\operatorname{Res}_z\bigl(D(z),\,A(z)-t\,D'(z)\bigr)\;\in\;K[t]\;}$$

and $v_i=\gcd\bigl(A-c_iD',\,D\bigr)\in K(c_i)[z]$.

The product formula is why it is the right object for *us*. With $D$ monic,
$\operatorname{Res}_z(D,G)=\prod_{D(\alpha)=0}G(\alpha)$, hence

$$R(t)=\prod_\alpha\bigl(A(\alpha)-tD'(\alpha)\bigr)=(-1)^n\Bigl(\prod_\alpha D'(\alpha)\Bigr)\prod_\alpha\bigl(t-r_\alpha\bigr)=\pm\operatorname{disc}(D)\prod_\alpha (t-r_\alpha).$$

So **$R$, made monic, is exactly the polynomial whose roots are the residues, with multiplicity =
number of poles sharing that residue** — no factorisation, no algebraic extension, $\deg_tR=n$.
Free consequences: every symmetric function of the residues (Newton on $R$), the exact count of
*distinct* residue values ($\deg$ of $R$'s squarefree part), and a certificate that two poles share
a residue. Cost: a $(2n-1)$ Sylvester determinant over $\mathbb{Q}(i)[t]$ with entries linear in
$t$; Bareiss works, subresultant PRS is better — $O(n^2)$ polynomial ops, $\tilde O(n^2\tau)$ bits.

### 1.4 Lazard–Rioboo–Trager: the log part with no algebraic extension

RT's defect: to get $v_i$ you must factor $R$ and then compute a gcd in $K(c_i)[z]$. LRT removes
both. Algorithm (this is exactly SymPy's `ratint_logpart`, and the shape to copy):

1. Compute the **subresultant PRS** of $D$ and $A-tD'$ w.r.t. $z$, retaining every $S_j(t,z)$;
   $S_0=R(t)$.
2. Index them by degree in $z$: `Rmap[deg_z S_j] = S_j`.
3. Squarefree-decompose $R(t)=\prod_i R_i(t)^i$ (Yun, §3.1).
4. For each $i$ with $\deg R_i>0$: if $i=\deg D$ take $h:=D$; else take $h:=\texttt{Rmap}[i]$, i.e.
   the subresultant **whose degree in $z$ equals the multiplicity $i$**.
5. Normalise: take the primitive part of $h$ in $z$ (strip the content in $t$), then make it monic
   by multiplying by $\mathrm{lc}_z(h)^{-1}\bmod R_i(t)$, and reduce all coefficients mod $R_i$.
6. Emit $\displaystyle\sum_i\ \sum_{R_i(c)=0} c\,\log h_i(c,z)$ — i.e.
   `RootSum(R_i, Lambda(t, t*log(h_i)))`.

**The classic correctness trap**, flagged in the LRT literature itself: a wrong reading of "which
subresultant", or skipping the content removal / `mod R_i` reduction, silently produces *wrong
answers*, not errors. Steps 4 and 5 are both load-bearing; both need golden tests.

To turn the RootSum into real elementary output, SymPy's `log_to_real` splits the roots of $R_i$
into real roots $r$ (contributing $r\log h(r,z)$) and conjugate pairs $u\pm iv$ (contributing
$u\log(A^2+B^2) + v\cdot\texttt{log\_to\_atan}(A,B)$). That conversion needs actual root
classification, so it is the first place rigor can drop from `=` to certified-numeric.

### 1.5 Restricting the sum to a half-plane — the actual hard part

We need $\Sigma_+=\sum_{\operatorname{Im}\alpha>0}\operatorname{Res}_\alpha f$, because
$\int_{-\infty}^{\infty}f = 2\pi i\,\Sigma_+$.

**Counting is easy and exact.** The Möbius map $w=(z-i)/(z+i)$ sends the upper half-plane to the
open unit disc, $\mathbb{R}\cup\{\infty\}$ to the unit circle, and $z=-i$ to $w=\infty$. With
$Q=\sum a_kz^k$,

$$\tilde Q(w):=(1-w)^n\,Q\!\left(\frac{i(1+w)}{1-w}\right)=\sum_k a_k\,i^k(1+w)^k(1-w)^{n-k},$$

a polynomial over $\mathbb{Q}(i)$ of degree $n$ unless $Q(-i)=0$ (that root went to $\infty$).
Then $\#\{\operatorname{Im}\alpha>0\}=\#\{|w|<1\}$, delivered exactly by **Schur–Cohn** (§6.4):
$O(n^2)$ for the transform, then the inertia. Alternatively **Routh–Hurwitz**: rotate to a left
half-plane, split $f(iy)=P_0(y)+iP_1(y)$ with $P_0,P_1\in\mathbb{R}[y]$, and
$p-q=\frac1\pi\Delta\arg f(iy)=w(+\infty)-w(-\infty)$, the variation count of the generalized Sturm
chain of $(P_0,P_1)$ — the *Cauchy index*. Both exact, $O(n^2)$–$O(n^3)$ ops.

**But counting is not selecting.** $\Sigma_+$ is a sum over a subset of roots cut out by a
*semi-algebraic* condition. That subset is not stable under $\mathrm{Gal}(\overline{\mathbb{Q}}/\mathbb{Q}(i))$,
so $\Sigma_+$ is generally an algebraic number of degree up to $\binom{n}{k}$ over $\mathbb{Q}(i)$ —
**it has no rational closed form in the coefficients of $P,Q$.** The one-line proof that we cannot
cheat: for real $P,Q$ with $\deg Q\ge\deg P+2$ and no real poles, conjugation gives
$\Sigma_-=\overline{\Sigma_+}$ and §1.2 gives $\Sigma_++\Sigma_-=0$, so $\operatorname{Re}\Sigma_+=0$
*automatically* — symmetry pins the real part and says nothing about the imaginary part, which is
the entire answer. (Check: $1/(1+x^2)$, $\Sigma_+=-i/2$, $2\pi i\Sigma_+=\pi$. And
$\int dx/(1+x^4)=\pi/\sqrt2$ is already irrational in the coefficients.)

Three honest routes, in the order the engine should try them:

* **(a) Rational half-plane-homogeneous split.** Factor $Q$ over $\mathbb{Q}(i)$; run Möbius +
  Schur–Cohn on each irreducible factor $g$. `inside == deg g` ⇒ wholly in the UHP;
  `inside == 0 && onCircle == 0` ⇒ wholly outside. If **every** factor is homogeneous then
  $\Sigma_+=\sum_{g\ \text{inside}}\operatorname{Tr}_{\mathbb{Q}(i)[z]/\langle g\rangle}(S)$ —
  exact `=`, pure linear algebra, no radicals. Covers a large share of real textbook integrands
  (poles rational or in conjugate quadratic pairs) for the price of one factorisation.
* **(b) Small-degree radicals.** A straddling factor of degree $\le4$ splits by radicals in
  $\mathbb{Q}(i)(\sqrt d)$ / the quartic tower; still `=`, at the price of ugly output.
  Abel–Ruffini forbids this from degree 5 — a theorem, not a missing feature; say so in the UI.
* **(c) Certified numeric.** Isolate the roots in rational boxes, classify each by
  $\operatorname{Im}>0$ (a box straddling $\mathbb{R}$ ⇒ refine or refuse), **cross-check the count
  against Schur–Cohn** (QD's confirm-by-verify pattern — geometry alone must not decide), then
  evaluate $S$ at each box in interval arithmetic. Output is an *enclosure*: `≤` for it, `≈` for
  its midpoint. Never `=`.

One exact-but-exponential ceiling, worth stating once: the subset-sum annihilator
$\Theta(t)=\prod_{|T|=k}\bigl(t-\sum_{\alpha\in T}r_\alpha\bigr)$ is computable by
symmetric-function/resultant methods and $\Sigma_+$ is one of its roots (selected numerically).
Degree $\binom nk$ — fine to $n\approx6$, useless beyond. Offer behind a cap, as `=`. Separately, if
the integrand is *presented* as $B(x)B(-x)/\bigl(A(x)A(-x)\bigr)$ with $A$ Hurwitz, the half-plane
split is given and the classical Hurwitz-determinant integral tables close it in form rational in
the coefficients — verify before shipping, and label `=` only with the hypothesis checked.

### 1.6 `RootSum` as honest output

When radicals are impossible, the *correct* closed form is a formal sum over roots. Mathematica's
`RootSum[f, form]` denotes $\sum_{f(\alpha)=0}\text{form}(\alpha)$ and auto-simplifies when `form`
is rational: put the sum over a common denominator, note that numerator and denominator are then
symmetric polynomials in the roots, `symmetrize` into elementary symmetric polynomials, substitute
Vieta (the SymPy SciPy-2011 tutorial's worked example gives $\sum1/(\alpha+2)=81/31$ over the roots
of $z^5+z+3$); `Normal` expands it into indexed `Root[]` objects. Maple's equivalent is
`RootOf(p, index=k)` + `allvalues`. SymPy emits `RootSum(q, Lambda(t, t*log(h)))` from `ratint`,
and `apart_list` returns structured quadruples $(D,\,\text{num }\lambda,\,\text{den }\lambda,\,e)$.
The app should print

$$\int_{-\infty}^{\infty}\frac{P}{Q}\,dx \;=\; 2\pi i\!\!\sum_{\substack{Q(\alpha)=0\\ \operatorname{Im}\alpha>0}}\!\!\frac{P(\alpha)}{Q'(\alpha)}$$

with the half-plane predicate *explicit and visible*, plus the certified numeric value beside it.
That expression is exact; the decimal is not. Label them separately. **Do not** hide the predicate
inside a `RootSum` over all roots — that would be a different (wrong) number.

---

## 2. Higher-order residues

### 2.1 Order-$m$ derivative formula vs. series

$\operatorname{Res}_{z_0}f=\frac{1}{(m-1)!}\lim_{z\to z_0}\frac{d^{m-1}}{dz^{m-1}}\bigl[(z-z_0)^mf(z)\bigr]$
is a pedagogy formula, not an algorithm: differentiating $P/g$ $m-1$ times roughly doubles the term
count each step and yields a numerator of degree $\sim(m-1)\deg g$ over $g^m$.

**Use the Taylor-shift + series algorithm.** Write $Q=(z-z_0)^m g$, $g(z_0)\neq0$.

1. **Shift.** $\tilde P(u)=P(z_0+u)$, $\tilde g(u)=g(z_0+u)$ by repeated synthetic division
   (Horner), $O(d^2)$ exact ops — the fast convolution method (von zur Gathen–Gerhard) is $O(M(d))$
   but not worth it at our sizes. Exact for $z_0\in\mathbb{Q}(i)$; for algebraic $z_0$ work in
   $\mathbb{Q}(i)[z]/\langle\text{minpoly}\rangle$.
2. **Invert.** $h=1/\tilde g\bmod u^{m}$ by $h_0=1/\tilde g_0$,
   $h_k=-\tilde g_0^{-1}\sum_{j=1}^{k}\tilde g_jh_{k-j}$ — $O(m^2)$ exact ops.
3. **Extract.** $\operatorname{Res}=[u^{m-1}](\tilde P\cdot h)=\sum_{j=0}^{m-1}\tilde P_jh_{m-1-j}$.
   One truncated convolution — where `@cas/core`'s series-multiply earns its keep, modulo §7's
   exactness caveat.

Total $O(d^2+m^2+md)$ exact ops; the real cost is coefficient growth, so scale once to
$\mathbb{Z}[i]$ and carry one common denominator. **Bonus:** the same product yields *all* Laurent
coefficients, $a_{-k}=[u^{m-k}](\tilde Ph)$ for $k=1..m$ — the whole principal part for the price of
the residue.

### 2.2 Residues of $f\cdot e^{iaz}$, $f\cdot\log z$, $f\cdot z^\alpha$ at an order-$m$ pole

All three are "multiply one more truncated series and read off $[u^{m-1}]$". Let
$\Phi(u):=\tilde P(u)h(u)$ truncated to $u^{m-1}$.

* $e^{iaz}$: $e^{ia(z_0+u)}=e^{iaz_0}\sum_k (ia)^ku^k/k!$. Residue
  $=e^{iaz_0}\,[u^{m-1}]\bigl(\Phi\cdot E\bigr)$ with $E_k=(ia)^k/k!$. Coefficients in
  $\mathbb{Q}(i)[a]$ (or $\mathbb{Q}(i)$ for rational $a$); $e^{iaz_0}$ stays a symbol. Exact `=`;
  output basis $\{e^{iaz_0}\}\times\mathbb{Q}(i)[a]$. This is the Jordan-lemma family's whole
  symbolic requirement.
* $\log z$: $\log(z_0+u)=\log z_0+\sum_{k\ge1}\frac{(-1)^{k-1}}{k}\frac{u^k}{z_0^k}$. Residue
  $=(\log z_0)\,[u^{m-1}]\Phi + [u^{m-1}](\Phi L)$. Exact over $\mathbb{Q}(i)\oplus\mathbb{Q}(i)\log z_0$
  for $z_0\in\mathbb{Q}(i)\setminus\{0\}$ — **but the branch must be pinned and printed**; a keyhole
  contour's answer depends on it. Honest-labelling hazard, not a numerical one.
* $z^\alpha$: $z^\alpha=z_0^\alpha\sum_k\binom{\alpha}{k}u^kz_0^{-k}$ with
  $\binom\alpha k=\alpha(\alpha-1)\cdots(\alpha-k+1)/k!$. Residue $=z_0^\alpha[u^{m-1}](\Phi B)$,
  a polynomial of degree $\le m-1$ in $\alpha$ over $\mathbb{Q}(i)$. Exact, same branch caveat.

### 2.3 The modern multiple-pole resultant

Bronstein generalised Rothstein–Trager to multiple poles, but at complexity **exponential in the
multiplicity**. The current best is Bostan–Dumont–Salvy's `AlgebraicResidues`: squarefree-decompose
$Q=Q_1Q_2^2\cdots Q_m^m$, build auxiliary $A_i,B_i$ by power-series expansion, and form
$R_i(z)=\operatorname{Res}_y(A_i-zB_i,\,Q_i)$ — for $m=1$ this *is* the RT resultant. $\prod R_i$
annihilates all residues at $O\!\bigl(m^2d_xd_y(m^2+d_y^2)\bigr)$ operations, polynomial in the
multiplicities. Implement only if we want §1.3's annihilator in the non-squarefree case; for plain
residue *values* the §2.1 series route is simpler and faster.

---

## 3. Partial fractions over $\mathbb{Q}(i)$ and beyond

### 3.1 Yun's squarefree decomposition (characteristic 0)

Given $A$: $C=\gcd(A,A')$, $D_1=A/C$, $E_1=A'/C$; then for $k=1,2,\dots$:
$P_k=\gcd(D_k,\,E_k-D_k')$, $D_{k+1}=D_k/P_k$, $E_{k+1}=(E_k-D_k')/P_k$. Output
$A=\prod_k P_k^{\,k}$. $O(\deg A)$ gcds in the worst case, $O(d^2)$ field operations; in practice
the loop length is the largest multiplicity. This is the prerequisite for Hermite reduction, for
LRT step 3, and for the multiplicity classification the UI shows. `QiPoly` currently has only
`squarefreePart` (i.e. $A/\gcd(A,A')$) — the full decomposition is a small addition.

### 3.2 Hermite reduction

For $B/V^k$ with $V$ squarefree and $k\ge2$: since $\gcd(V,V')=1$, extended Euclid gives $S,T$ with
$SV+TV'=B$, and

$$\int\frac{B}{V^k}\;=\;\frac{-T}{(k-1)V^{k-1}}\;+\;\int\frac{S+\dfrac{T'}{k-1}}{V^{k-1}} .$$

Iterate to $k=1$; what remains is $\int A/D$ with $D$ squarefree — purely logarithmic — which goes
to LRT. One extended Euclid per multiplicity level. Bronstein implemented exactly this in Axiom,
and the point of it (and of LRT) is that *only rational operations are used, so no unnecessary
algebraic numbers enter the answer.*

**Horowitz–Ostrogradsky** is the cheaper-to-implement alternative: with $u=\gcd(D,D')$, $v=D/u$,
posit $A/u$ and $B/v$ with undetermined coefficients, expand $H=f-A'v+A(u'v)/u-Bu$ and solve the
linear system on $H$'s coefficients. One linear solve over $\mathbb{Q}(i)$, no Euclid loop. SymPy
uses HO for the rational part and LRT for the log part; do the same (Hermite later if sizes demand).

### 3.3 Multi-factor Bézout / Hensel

Splitting $1/(D_1\cdots D_r)$ by $r-1$ successive extended Euclids is $O(rd^2)$ and grows
coefficients badly; the standard fix is a **product tree + linear Hensel (Diophantine) lifting**,
$O(M(d)\log r)$. Only worth it at $r\gtrsim8$ — unlikely here. Roadmap note, not a build item.

### 3.4 When is full factorisation actually needed?

* **Never** for: residue values, all Laurent coefficients, the residue-annihilating polynomial, the
  antiderivative (Hermite + LRT), all-pole sums, "are all poles simple", "is there a pole on the
  contour" (counts).
* **Yes** for: naming individual poles in the derivation, the §1.5(a) half-plane-homogeneous split,
  and converting a `RootSum` of logs to a real $\log/\arctan$ form.
* SymPy mirrors this split precisely: `apart(full=False)` uses undetermined coefficients over the
  *rational* factorisation (and simply fails to split irrational-root denominators), while
  `apart(full=True)` runs Bronstein's full PFD — "gcd operations over the algebraic closure … full
  partial fraction decomposition with fractions having linear denominators" — and returns
  `RootSum`s.

---

## 4. Recognising and printing closed forms

**The output-basis question is a design decision, not an algorithm.** Declare the basis, compute in
it exactly, and *refuse* (drop to `≈`) outside it. This is the same discipline as QD's exact
kernel, where every step refuses rather than guesses.

Proposed v1 basis, in tiers: (1) $\mathbb{Q}(i)$, free from `@cas/exact`; (2) **$\pi$ as a formal
symbol** — every $\int_{-\infty}^{\infty}P/Q$ is $\pi\times$(a real algebraic number), so $\pi$ must
never be a float or `π√2/2` degenerates to `2.2214`; (3) $\mathbb{Q}(i)(\sqrt d)$ for squarefree
rational $d$ — elements $a+b\sqrt d$, ~150 lines, and what makes $\pi\sqrt2/2$, $2\pi/\sqrt3$,
$\pi/(2\sqrt2)$ print correctly (highest value-per-line in the stack); (4) a general algebraic
number as **(minimal polynomial, rational isolating box)** — the RUR presentation, printed
`Root(m, box)` à la Maple `RootOf(...,index=k)` / Mathematica `Root[]`, with the decimal beside it
as `≈`; (5) logs of $\mathbb{Q}(i)$-algebraics and cyclotomic numbers $\zeta_n$.

**Radical denesting.** Landau's algorithm decides denestability in general (field theory + Galois +
factorisation over number fields) but is exponential in nesting depth; Blömer handles depth 2 in
polynomial time; Zippel gives a necessary-and-sufficient condition. Implement only the depth-2
square-root rule: $\sqrt{a+b\sqrt c}$ denests iff $a^2-b^2c$ is a perfect square in the base field,
giving $\sqrt{\tfrac{a+\sqrt{a^2-b^2c}}{2}}\pm\sqrt{\tfrac{a-\sqrt{a^2-b^2c}}{2}}$ — ~30 lines,
covering essentially everything that arises. Deeper nesting: print nested, still `=`.

**The cyclotomic family.** $\int_0^\infty dx/(1+x^n)=\dfrac{\pi}{n\sin(\pi/n)}$ deserves a
hard-coded *recogniser*: it is the most-requested example and the generic engine would return a
useless `RootSum`. Poles at $\zeta_k=e^{i\pi(2k+1)/n}$ with
$\operatorname{Res}_{\zeta_k}\frac{1}{1+z^n}=\frac{1}{n\zeta_k^{\,n-1}}=-\frac{\zeta_k}{n}$; on the
sector contour $0\to R\to Re^{2\pi i/n}\to0$ exactly one pole ($e^{i\pi/n}$) is enclosed, giving
$\bigl(1-e^{2\pi i/n}\bigr)I=2\pi i\cdot(-e^{i\pi/n}/n)$, i.e. $I=\pi/(n\sin(\pi/n))$. General
lesson: when $Q$ is $z^n-c$ or a cyclotomic $\Phi_n$, residues live in $\mathbb{Q}(\zeta_n)$ and the
sums collapse to $1/(1-\zeta)$ shapes whose parts are $\cot,\csc$ at rational multiples of $\pi$ —
so the basis must include cyclotomic units, and the engine should detect $Q\in\{z^n-c,\Phi_n\}$ and
route to a template, labelled as a recogniser.

**$\Gamma,\psi,\zeta$, Catalan, $\log2$.** These never appear for rational integrands with
polynomial denominators over $\mathbb{R}$; they arrive the moment you add $x^s$ (Beta/$\Gamma$),
$\log^kx$ ($\zeta,\psi$), or a keyhole with a fractional power. How the big CAS pick the basis:
Mathematica and Maple convert the integrand to **Meijer $G$** / Mellin–Barnes form
(Marichev–Adamchik), integrate there (definite integrals of $G$-functions are $G$-functions), then
apply **Slater's theorem** to return to ${}_pF_q$ and simplify; SymPy's `meijerint` is a partial
implementation of the same pipeline. **Verdict: out of scope.** Declare the basis, and for the one
family we do want ($\int_0^\infty x^{s-1}P/Q$, keyhole) hard-code $\Gamma$/reflection-formula
templates rather than building a $G$-function engine. Do not implement PSLQ / inverse-symbolic
constant-guessing as an `=` path; at most offer it as `≈ (conjectured)`.

---

## 5. Existing implementations — what to copy, what to avoid

| System | What it does | Verdict |
|---|---|---|
| **SymPy `residue`** (`series/residues.py`) | shifts $x\to x+x_0$, calls `series` at orders $n\in\{0,1,2,4,8,16,32\}$ until no `Order` term, pattern-matches the $1/x$ coefficient via `as_coeff_mul()`; `NotImplementedError` on unexpected shapes | **Anti-pattern.** Generic, slow, ignores rational structure; its own docstring points at Bronstein §2.4/2.5/2.7 as the right way. Do not imitate. |
| **SymPy `ratint`** (`integrals/rationaltools.py`) | `ratint_ratpart` = Horowitz–Ostrogradsky; `ratint_logpart` = LRT via `resultant(..., includePRS=True)`, `R_map[degree]`, squarefree factorisation of $R$, degree matching, normalise + reduce mod $q$; then `log_to_real`/`log_to_atan`, else `RootSum` | **The reference implementation.** Mirror its structure; steal its test corpus. |
| **SymPy `apart` / `apart_list`** (`polys/partfrac.py`) | undetermined coefficients, or Bronstein full PFD (`full=True`); `apart_list` returns $(D,\text{num }\lambda,\text{den }\lambda,e)$ quadruples | Copy the **structured output shape** — a ready-made IR for the derivation UI. |
| **Mathematica / Maple** `RootSum`, `Root[]`; `RootOf(p,index=k)`, `allvalues` | `RootSum` auto-simplifies for rational `form`; `Normal`/`allvalues` expand to indexed roots; `Integrate` emits `RootSum` routinely | Copy the **output convention**; the `index=` discipline is what makes `Root(m, box)` reproducible. `Residue` is reported inefficient as variable count grows. |
| **Maxima `residue`** | correct for small cases | Thin; no factorisation-free machinery. |
| **FriCAS/Axiom** | most complete Risch–Bronstein–Trager implementation; Hermite reduction by Bronstein; avoids introducing unnecessary algebraic numbers | **Copy the honesty model:** an unimplemented subroutine *errors naming the missing piece* rather than returning unevaluated, so "not elementary" is distinguishable from "not implemented". Known gaps: constant residues, polynomial part. |
| **Bronstein, *Symbolic Integration I*** (2nd ed. 2005) | §2.2 Hermite, §2.3 RT, §2.4 LRT, §2.5 rational part, §2.7 Laurent coefficients, §5.6 general residues | The canonical citation for the derivation UI. |
| **Bostan–Dumont–Salvy** `AlgebraicResidues` | multiple-pole residue annihilator without the exponential blow-up | Implement only if we need the annihilator for non-squarefree $Q$. |

---

## 6. Exact hypothesis checking

Every "`=`" the app prints must be gated on a hypothesis that was *checked*, not assumed. Costs
below are for $\deg Q=n$, coefficient bit size $\tau$.

1. **$\deg Q\ge\deg P+2$** — $O(1)$; gates the arc-vanishing lemma and $\sum_{\text{all}}\operatorname{Res}=0$.
2. **All poles simple?** $G=\gcd(Q,Q')$, simple $\iff\deg G=0$. $O(n^2)$ ops, $\tilde O(n^2\tau)$
   bits with a subresultant/primitive PRS; Yun (§3.1) gives the full multiplicity structure at the
   same time.
3. **Real root (pole on $\mathbb{R}$)?** Split $Q(x)=U(x)+iV(x)$ with $U,V\in\mathbb{Q}[x]$; the
   real roots of $Q$ are those of $\gcd(U,V)$. Count with a **Sturm chain**
   $(f,f',-\mathrm{rem}(f,f'),\dots)$: $\#(a,b]=\mathrm{Var}(a)-\mathrm{Var}(b)$, $\pm\infty$ from
   leading-coefficient signs. $O(n^2)$ ops; use **Sturm–Habicht** (subresultant) for
   $\tilde O(n^2\tau)$ bits instead of exponential growth.
4. **Root on $|z|=1$?** (the $\int_0^{2\pi}$ / trig-substitution family) — **Schur–Cohn**: form the
   Hermitian $C=AA^{\mathsf H}-BB^{\mathsf H}$ from the two Toeplitz blocks of the coefficients;
   $\mathrm{inertia}(C)=(\#\text{inside},\#\text{outside})$ and positive nullity flags roots on the
   circle. The classical recursive Schur transform is $O(n^2)$ but suffers exponential coefficient
   growth; the *subtransform* variant ("Schur–Cohn revisited") keeps growth ~linear. Literature
   bounds: $O(d\log^2d)$ field operations, $\tilde O(d^2\sigma)$ bit operations, with a simple
   $O(d^2)$ variant well suited to computer algebra. QD's `schurCohn(coeffs)` already returns
   `{inside, outside, onCircle, degenerate, degree}` and handles degeneracy by splitting off the
   singular part and recursing on the cofactor.
5. **Which roots are in the UHP?** In increasing cost: (a) Möbius $w=(z-i)/(z+i)$ + Schur–Cohn —
   counts only, cheapest, reuses QD verbatim; (b) Routh–Hurwitz / Cauchy index,
   $p-q=\frac1\pi\Delta\arg f(iy)=w(+\infty)-w(-\infty)$ from the generalized Sturm chain of the
   real/imaginary split, $O(n^2)$; (c) certified root isolation to rational boxes — the only route
   that *identifies* roots rather than counting, hence the only one that can restrict the residue
   sum. **Always cross-check (c) against (a) or (b); refuse on disagreement.**
6. **Exact winding numbers in general.** The algebraic-winding-number literature (formalised in
   Isabelle/HOL) computes $\frac1{2\pi i}\oint f'/f$ exactly by reducing the argument variation to
   **Cauchy indices** of $\operatorname{Im}/\operatorname{Re}$ along the path, evaluated with
   Sturm-like sign sequences — no floating point anywhere. The principled answer for non-standard
   contours (rectangles, sectors, keyholes) and the long-term home for "how many poles does this
   user-drawn contour enclose, exactly?"
7. **Residue at infinity / convergence.** $\operatorname{Res}_\infty f=-[u^{-1}]$ of $f(1/u)/u^2$ —
   same exact series kernel as §2.1.

---

## 7. The recommended exact-engine stack, with build/reuse/extend verdicts

Difficulty: **S** ≈ a day; **M** ≈ a few days; **L** ≈ a week or more.

| # | Component | Verdict | Diff. | Notes |
|---|---|---|---|---|
| 1 | $\mathbb{Q}(i)$ field arithmetic (`Frac`, `Gauss`) | **Reuse as-is** — `@cas/exact/gaussian.ts` | — | BigInt-backed, a real field, division exact. |
| 2 | $\mathbb{Q}(i)[z]$: `divmod`, `divExact`, `gcd`, `derivative`, `squarefreePart`, Horner `eval`, `monic` | **Reuse as-is** — `@cas/exact/qiPoly.ts` | — | Covers §1.1's arithmetic and §6.2's simple-pole test. |
| 3 | Extended Euclid / `invMod` over $\mathbb{Q}(i)[z]$ | **Extend** `QiPoly` | S | ~60 LOC. Needed by §1.1, §3.2, LRT step 5. |
| 4 | Subresultant PRS (retaining the whole chain) | **Extend** `@cas/exact/resultant.ts` | M | `resultant.ts` today returns only the Bareiss *determinant* — the resultant **value**. LRT needs every $S_j(t,z)$. The single most important extension in the stack; it also fixes the Euclidean coefficient growth flagged in §1.1 and §6.2. |
| 5 | Rothstein–Trager $R(t)=\operatorname{Res}_z(Q,P-tQ')$ | **Build new** on #4 | S–M | Sylvester over $\mathbb{Q}(i)[t]$; gives the residue-annihilating polynomial (§1.3) and, via Newton, all symmetric functions of the residues. |
| 6 | Yun squarefree decomposition | **Build new** in `@cas/exact` | S | `QiPoly` has only `squarefreePart`. ~40 LOC. |
| 7 | LRT log part (PRS + degree matching + primitive part + reduce mod $R_i$) | **Build new**; mirror `ratint_logpart` | M | The degree-matching and content-removal rules are the classic silent-wrong-answer trap — golden tests mandatory. |
| 8 | Rational part (Horowitz–Ostrogradsky first, Hermite later) | **Build new** | S–M | HO = one linear solve over $\mathbb{Q}(i)$. |
| 9 | Exact truncated series: `mul`, `inverse`, `shift` over $\mathbb{Q}(i)$ | **Extend `@cas/core`, else build new** | S | `@cas/core/series.ts` is structurally right but float-bound: `ComplexAlgebra<C>` requires `re(z): number`/`abs`/`isFinite`, and `mul`'s zero-skip is a float test — at `Gauss` it would test `toNumber()` for zero. Widening the contract with an optional `isZero` is a one-field, backward-compatible change that makes `makeSeries` genuinely representation-generic as advertised; fallback is ~100 exact lines in `@cas/exact/series.ts`. |
| 10 | Order-$m$ residue + full principal part (Taylor shift → series inverse → one convolution) | **Build new** on #9 | S | §2.1. |
| 11 | Residues of $f e^{iaz}$, $f\log z$, $f z^\alpha$ | **Build new** on #9 | S | §2.2; symbolic prefactor + a coefficient ring of $\mathbb{Q}(i)[a]$ or $\mathbb{Q}(i)[\alpha]$. |
| 12 | Schur–Cohn (unit circle) + Möbius UHP count | **Port from QD** `sym-core.mjs` (`schurCohn`, `schurCohnInterval`, `schurCohnAtBox`, `unitCircleRootCount`) | M | This app is the **ADR-0007 second consumer**, so promoting these into `@cas/exact` is now justified rather than speculative. Port `.mjs`→TS with QD's tests as the golden corpus (`vitest/algebra-interval-schur-cohn.test.ts`); the interval variant is exactly what §1.5(c) needs. |
| 13 | Sturm / Sturm–Habicht real-root counting and isolation | **Port from QD** (`sturmHabicht`, `realRootCountSturm`, `realRootIsolate`) | M | §6.3, §6.5(c). Second consumer again. |
| 14 | Routh–Hurwitz / Cauchy-index half-plane count | **Build new** (thin, on #13) | S | Independent cross-check for #12; disagreement ⇒ refuse. |
| 15 | Factorisation over $\mathbb{Q}(i)$ (Zassenhaus + Hensel) | **Port from QD** (`factor`, `qiFactor`, `_henselTree`, `_czFactor`) | L | Only for §1.5(a) and for naming poles. Biggest single port — gate it behind a real need; the engine stays correct without it (RT/LRT need no factorisation). |
| 16 | RUR + certified rational boxes | **Reuse QD only if we go multivariate** | M | For univariate $Q$, Sturm isolation (#13) suffices. Revisit for parameterised integrands. |
| 17 | $\mathbb{Q}(i)(\sqrt d)$ quadratic extension for printing | **Build new** | S | The `π√2/2` vs `2.2214` fix. Best value-per-line in the stack. |
| 18 | Algebraic number as (minPoly, isolating box) + `Root(m, box)` printer | **Build new**, thin | M | General-case honest output; reuses #13's boxes. |
| 19 | Depth-2 radical denesting | **Build new** | S | One perfect-square test + one formula. |
| 20 | Cyclotomic / $z^n-c$ recogniser + template library | **Build new** | S–M | §4. Explicitly labelled as a recogniser. |
| 21 | `RootSum` IR + LaTeX printer, half-plane predicate visible | **Build new**; shape from `apart_list` | M | §1.6. Must render the predicate, not hide it. |
| 22 | Expression → $P/Q$ extraction over $\mathbb{Q}(i)$ | **Extend** `@cas/expr/rational.ts` | S–M | `fToRational` already walks the AST over $\mathbb{C}(z)$, but with float `Complex` coefficients; needs a `Gauss` variant that *rejects* what it cannot represent exactly rather than rounding. |
| 23 | Meijer-$G$ / $\Gamma,\psi,\zeta$, Catalan | **Out of scope** | — | Declare the basis; refuse outside it with a named reason (FriCAS honesty model). |

**Rigor-label policy**, enforced by an `assembleVerdict`-style function rather than by convention —
copy QD's pattern where a verdict is *assembled from per-step certificates* and promoted to `=` only
when every step returned one:

* `=` — total residue sums; all Laurent coefficients at a $\mathbb{Q}(i)$ pole; the RT annihilator
  and its symmetric functions; the HO/Hermite + LRT antiderivative; half-plane sums when every
  $\mathbb{Q}(i)$-irreducible factor of $Q$ is half-plane-homogeneous (#12 + #15); degree-$\le4$
  radical splits; the cyclotomic templates; the **symbolic** `RootSum` form of a half-plane sum.
* `≤` — interval enclosures of a half-plane sum that cannot be made rational (#12 interval + #13
  boxes), and any arc/tail bound.
* `≈` — uncertified numeric root-finding; the decimal rendering of any `=` result; any PSLQ-style
  constant guess (mark it *conjectured*, not merely approximate).

**Build order.** (1–3) → (6, 9, 10) already gives exact residues of every order — a usable app.
(4, 5, 7, 8) adds antiderivatives and the annihilator. (12–14) adds the honest half-plane story and
unlocks the real-line gallery. (17, 19, 20, 21) is the presentation layer that makes output look
like a textbook answer. (15) last, and only if the homogeneous-factor path earns its weight.

---

## Sources

- Bronstein, *Symbolic Integration Tutorial* (ISSAC'98), INRIA — [www-sop.inria.fr/cafe/Manuel.Bronstein/publications/issac98.pdf](https://www-sop.inria.fr/cafe/Manuel.Bronstein/publications/issac98.pdf)
- Bronstein, *Symbolic Integration I: Transcendental Functions*, Springer (2nd ed. 2005) — §2.2 Hermite, §2.3 Rothstein–Trager, §2.4 Lazard–Rioboo–Trager, §2.5, §2.7, §5.6. Review/summary: [researchgate.net/publication/259815903](https://www.researchgate.net/publication/259815903_Symbolic_Integration_I_Transcendental_Functions_by_Manuel_Bronstein)
- Lazard & Rioboo, "Integration of rational functions: rational computation of the logarithmic part", *J. Symbolic Computation* — [sciencedirect.com/science/article/pii/S0747717108800260](https://www.sciencedirect.com/science/article/pii/S0747717108800260)
- Trager, "Algebraic factoring and rational function integration", SYMSAC'76 — [dl.acm.org/doi/10.1145/800205.806338](https://dl.acm.org/doi/10.1145/800205.806338)
- Du, Gao, Guo & Li, "Computing Logarithmic Parts by Evaluation Homomorphisms" — [mmrc.iss.ac.cn/~zmli/papers/DGGL2023.pdf](http://www.mmrc.iss.ac.cn/~zmli/papers/DGGL2023.pdf)
- Meurer, "Integration of rational functions" (SymPy blog) — [github.com/asmeurer/blog](https://github.com/asmeurer/blog/blob/master/wordpress/wordpress_md/integration-of-rational-functions.md)
- SymPy `sympy/integrals/rationaltools.py` (`ratint`, `ratint_ratpart`, `ratint_logpart`, `log_to_atan`, `log_to_real`) — [github.com/sympy/sympy](https://github.com/sympy/sympy/blob/master/sympy/integrals/rationaltools.py)
- SymPy `sympy/polys/partfrac.py` (`apart`, `apart_undetermined_coeffs`, `apart_list`, `apart_list_full_decomposition`) — [github.com/sympy/sympy](https://github.com/sympy/sympy/blob/master/sympy/polys/partfrac.py)
- SymPy `sympy/series/residues.py` (`residue`) — [github.com/sympy/sympy](https://github.com/sympy/sympy/blob/master/sympy/series/residues.py)
- Papadopoulos, "Summing roots of polynomials" (SymPy tutorial, SciPy 2011) — [mattpap.github.io/scipy-2011-tutorial/html/summation.html](https://mattpap.github.io/scipy-2011-tutorial/html/summation.html)
- Wolfram Language, `RootSum` — [reference.wolfram.com/language/ref/RootSum.html](https://reference.wolfram.com/language/ref/RootSum.html)
- Maple, `RootOf` / `RootOf,indexed` / `allvalues` — [maplesoft.com/support/help/Maple/view.aspx?path=RootOf](https://www.maplesoft.com/support/help/Maple/view.aspx?path=RootOf)
- FriCAS wiki, *Symbolic Integration* (Risch–Bronstein–Trager completeness and its gaps) — [wiki.fricas.org/SymbolicIntegration](http://wiki.fricas.org/SymbolicIntegration)
- Fateman, *Rational Function Computing with Poles and Residues* — [people.eecs.berkeley.edu/~fateman/papers/poles.pdf](https://people.eecs.berkeley.edu/~fateman/papers/poles.pdf)
- Bostan, Dumont & Salvy, *Algebraic Diagonals and Walks: Algorithms, Bounds, Complexity* (Algorithm 1 `AlgebraicResidues`, multiple-pole residues) — [arxiv.org/abs/1510.04526](https://arxiv.org/pdf/1510.04526)
- Bradford, Corless, Davenport, Jeffrey & Watt et al., *Symbolic-Numeric Integration of Rational Functions* — [arxiv.org/abs/1712.01752](https://arxiv.org/pdf/1712.01752)
- Wikipedia, *Routh–Hurwitz theorem* (Cauchy-index formulation, generalized Sturm chains) — [en.wikipedia.org/wiki/Routh–Hurwitz_theorem](https://en.wikipedia.org/wiki/Routh%E2%80%93Hurwitz_theorem)
- *Lectures on the Routh-Hurwitz problem* — [arxiv.org/abs/0802.1805](https://arxiv.org/pdf/0802.1805)
- Hermite–Biehler theorem and half-plane root counting — [arxiv.org/abs/1701.07912](https://arxiv.org/pdf/1701.07912), [uu.diva-portal.org/smash/get/diva2:1853336/FULLTEXT01.pdf](https://uu.diva-portal.org/smash/get/diva2:1853336/FULLTEXT01.pdf)
- Li & Paulson, *Algebraic Winding Numbers* (exact winding via Cauchy indices / Sturm sequences) — [arxiv.org/abs/2305.08638](https://arxiv.org/pdf/2305.08638)
- "The Schur–Cohn Algorithm Revisited" and "A Fast Version of the Schur–Cohn Algorithm" — [sciencedirect.com/science/article/pii/S0747717198902206](https://www.sciencedirect.com/science/article/pii/S0747717198902206), [sciencedirect.com/science/article/pii/S0885064X99905289](https://www.sciencedirect.com/science/article/pii/S0885064X99905289)
- MathWorld, *Schur-Cohn Algorithm* — [mathworld.wolfram.com/Schur-CohnAlgorithm.html](https://mathworld.wolfram.com/Schur-CohnAlgorithm.html)
- *The Hermitian Killing form and root counting of complex polynomials with conjugate variables* — [arxiv.org/abs/2406.15628](https://arxiv.org/html/2406.15628)
- *The multivariate Hermite method for counting real and complex solutions to polynomial systems* — [arxiv.org/abs/2510.23897](https://arxiv.org/html/2510.23897)
- Landau, *Simplification of nested radicals*; Blömer, *Denesting by bounded degree radicals* — [link.springer.com/article/10.1007/s004530010028](https://link.springer.com/article/10.1007/s004530010028); survey: [en.wikipedia.org/wiki/Nested_radical](https://en.wikipedia.org/wiki/Nested_radical)
- Bornemann, *How Mathematica and Maple Get Meijer's G-function into Problem 9* (Marichev–Adamchik Mellin-transform pipeline, Slater's theorem) — [www-m3.ma.tum.de/bornemann/Numerikstreifzug/Chapter9/MeijerG.pdf](https://www-m3.ma.tum.de/bornemann/Numerikstreifzug/Chapter9/MeijerG.pdf)
- von zur Gathen & Gerhard, *Fast algorithms for Taylor shifts and certain difference equations* — [researchgate.net/publication/221564511](https://www.researchgate.net/publication/221564511_Fast_algorithms_for_Taylor_shifts_and_certain_difference_equations)
- Wikipedia, *Sum of residues formula* (Tate's trace proof; residues as traces of endomorphisms) — [en.wikipedia.org/wiki/Sum_of_residues_formula](https://en.wikipedia.org/wiki/Sum_of_residues_formula)
- Repo sources inspected: `packages/exact/src/{gaussian,qiPoly,biPoly,resultant,render}.ts`, `packages/core/src/{series,algebra,durand-kerner}.ts`, `packages/expr/src/rational.ts`, `apps/quadrature-domains/app/sym-core.mjs` (`schurCohn`, `schurCohnInterval`, `schurCohnAtBox`, `unitCircleRootCount`, `sturmHabicht`, `realRootCountSturm`, `realRootIsolate`, `rationalUnivariateRep`, `solveRealCertified`, `factor`, `squareFreePart`).
