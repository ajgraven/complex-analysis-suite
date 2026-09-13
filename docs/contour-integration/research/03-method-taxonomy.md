# Contour integration — a rigorous method taxonomy

> Research track 03 for `apps/contour-integration`. This is the **mathematical content
> specification** for the engine and gallery: for each family, the integrand shape, the exact
> hypotheses, the contour template, the auxiliary-arc lemma that kills the non-real pieces, the
> resulting formula, worked examples, and the classic traps.
>
> **Verification status.** Every closed form quoted below was independently re-derived and
> **numerically verified** to ≥ 1e-8 relative error (most to ~1e-14) with tanh–sinh quadrature
> (stable-endpoint form) plus half-period decomposition + Cesàro acceleration for oscillatory and
> conditionally-convergent cases. Numbers marked *(unverified)* were not checked; nothing in the
> v1 gallery is unverified. Where a source disagreed with computation, it is flagged in
> [§14 Corroboration](#14-corroboration-and-flags).

---

## 0. The shared toolkit

Everything in §1–§12 is the residue theorem plus *one lemma that makes an auxiliary piece vanish*.
That factorisation — **(closed-contour identity) × (vanishing lemma)** — is the single most
important structural fact for the engine: it is exactly where rigor labels are earned or lost.

### 0.1 Laurent series and the classification of isolated singularities

If $f$ is holomorphic on the punctured disc $0<|z-z_0|<R$ it has a unique Laurent expansion
$f(z)=\sum_{n=-\infty}^{\infty}c_n(z-z_0)^n$, and $\operatorname{Res}(f,z_0):=c_{-1}$.

| type | Laurent criterion | equivalent test |
|---|---|---|
| **removable** | $c_n=0\ \forall n<0$ | $f$ bounded near $z_0$ (Riemann); $\lim_{z\to z_0}f(z)$ exists |
| **pole of order $m$** | $c_{-m}\neq0$, $c_n=0$ for $n<-m$ | $|f(z)|\to\infty$; $(z-z_0)^mf(z)$ extends holomorphically and is $\neq0$ at $z_0$ |
| **essential** | infinitely many $c_n\neq0$, $n<0$ | Casorati–Weierstrass: image of every punctured nbhd is dense; Picard: omits at most one value |

The classification is a *hypothesis input*, not decoration: the order-$m$ derivative formula below
is **invalid** at an essential singularity, and the small-arc lemma (§0.3) is **false** at a pole of
order $\ge2$.

### 0.2 The four residue formulae, and when each wins

1. **Simple pole:** $\operatorname{Res}(f,z_0)=\lim_{z\to z_0}(z-z_0)f(z)$.
2. **Quotient shortcut:** $f=P/Q$ with $Q(z_0)=0$, $Q'(z_0)\neq0$, $P(z_0)\neq 0$ $\Rightarrow$
   $\operatorname{Res}=P(z_0)/Q'(z_0)$.
3. **Order $m$:** $\operatorname{Res}(f,z_0)=\dfrac{1}{(m-1)!}\lim_{z\to z_0}\dfrac{d^{m-1}}{dz^{m-1}}\big[(z-z_0)^mf(z)\big]$.
4. **Laurent coefficient:** compute the truncated series quotient and read $c_{-1}$.

**Computational preference (engine-relevant).** (2) is the cheapest and the only one that stays
*exact* when $z_0$ is an algebraic number known only as a root of $Q$ — you never factor $Q$, you
evaluate $P/Q'$ at the root, so the answer lives in $\mathbb{Q}(i)[z]/\langle Q\rangle$ and can be
handled by the repo's existing RUR/`@cas/exact` machinery. (3) is symbolically explosive: the
$(m-1)$-th derivative of a quotient blows up superlinearly, so prefer (4) for $m\ge3$. (4) is the
**only** option at an essential singularity — e.g. $\operatorname{Res}_{z=0}\big[z^{-1}e^{1/z}\big]=1$
has no derivative formula. (1) is really (2) specialised.

**Cauchy's integral formula for derivatives.** For $f$ holomorphic inside and on a positively
oriented simple closed $\gamma$, and $z_0$ inside,
$$f^{(n)}(z_0)=\frac{n!}{2\pi i}\oint_\gamma\frac{f(z)}{(z-z_0)^{n+1}}\,dz,\qquad n\ge0 .$$
Equivalently $\operatorname{Res}\big[f(z)(z-z_0)^{-(n+1)},z_0\big]=f^{(n)}(z_0)/n!$ — CIF for
derivatives *is* residue formula (3). One implementation serves both.

**Residue theorem (winding-number form).** $\gamma$ a closed rectifiable curve null-homotopic in an
open $U$, $f$ holomorphic on $U\setminus\{a_k\}$ with $\gamma$ missing every $a_k$:
$$\oint_\gamma f(z)\,dz=2\pi i\sum_k n(\gamma,a_k)\operatorname{Res}(f,a_k).$$
For a positively oriented simple closed curve $n=1$ inside, $0$ outside. **The winding number is not
optional**: the dogbone (§5.3) and Pochhammer (§11.3) contours are precisely the cases where
$n(\gamma,\cdot)\notin\{0,1\}$ or where homology $\neq$ homotopy.

### 0.3 The vanishing-lemma catalogue

This is the engine's real hypothesis surface. Each lemma has a *side condition* that must be
discharged before a result may be labelled `=`.

**(L1) Estimation lemma (ML inequality).** $f$ continuous on a contour $\gamma$ of finite length $L$
with $|f|\le M$ on $\gamma$ $\Rightarrow$ $\big|\int_\gamma f\big|\le ML$.

**(L2) Large-arc decay lemma.** If $|f(z)|\le M/|z|^{p}$ with $p>1$ for $|z|\ge R_0$ on the arc
$C_R=\{Re^{i\theta}:\theta\in[\theta_1,\theta_2]\}$, then $\int_{C_R}f\to0$ as $R\to\infty$.
(Proof: $ML$ gives $\le (\theta_2-\theta_1)MR^{1-p}$.) This is the workhorse for §2.

**(L3) Jordan's lemma.** Let $a>0$, $C_R=\{Re^{i\theta}:0\le\theta\le\pi\}$, $f(z)=e^{iaz}g(z)$ with
$g$ continuous on $C_R$, and $M_R:=\max_{\theta\in[0,\pi]}|g(Re^{i\theta})|$. Then
$$\Big|\int_{C_R}e^{iaz}g(z)\,dz\Big|\le\frac{\pi}{a}M_R .$$
Hence $\int_{C_R}\to0$ whenever $M_R\to0$. For $a<0$ the identical statement holds on the **lower**
semicircle.

*Why it beats ML.* Crude ML gives $\pi R\cdot M_R\cdot\max|e^{iaz}|=\pi R M_R$ (since
$|e^{iaz}|=e^{-a\,\mathrm{Im}\,z}\le1$ on the upper half-plane), which requires $M_R=o(1/R)$ — i.e.
decay *faster* than $1/z$. Jordan exploits the actual exponential decay: with
$\int_0^\pi e^{-aR\sin\theta}d\theta\le\pi/(aR)$, proved from **Jordan's inequality**
$\sin\theta\ge2\theta/\pi$ on $[0,\pi/2]$ (concavity of $\sin$), the factor $R$ is traded for the
constant $\pi/a$. Net effect: the hypothesis weakens from $g=O(|z|^{-1-\epsilon})$ to merely
$g\to0$. That gap is exactly what makes $\int_{\mathbb R}\frac{x\sin x}{1+x^2}dx$ reachable.

*Sign of $a$ is a hard branch, not a convention.* $|e^{iaz}|=e^{-a y}$ is bounded only where
$ay\ge0$. Closing the wrong way produces a divergent arc, silently.

**(L4) Small-arc / fractional-residue lemma.** Let $f$ have a **simple** pole at $z_0$ and let
$C_\rho(\theta)=z_0+\rho e^{i\theta}$, $\theta_0\le\theta\le\theta_0+\alpha$. Then
$$\lim_{\rho\to0}\int_{C_\rho}f(z)\,dz=i\alpha\operatorname{Res}(f,z_0).$$
A semicircle ($\alpha=\pi$) gives $i\pi\operatorname{Res}$; a full circle recovers
$2\pi i\operatorname{Res}$; a corner of interior angle $\alpha$ gives $i\alpha\operatorname{Res}$.
**If the pole is not simple the limit does not exist** — there is no "fractional residue" for a
double pole. A weaker sufficient form: if $(z-z_0)f(z)\to L$ uniformly in $\arg$, the limit is
$i\alpha L$.

**(L5) Large-arc residue lemma (companion to L4).** If $zf(z)\to L$ uniformly as $|z|\to\infty$
along an arc of angle $\alpha$, then $\int_{\text{arc}}f\to i\alpha L$. Used for the outer circle of
a keyhole when the integrand decays only like $1/z$.

**(L6) Wedge/Gaussian arc lemma.** ⚠ **CORRECTED — see [§14](#14-corroboration-and-flags).** The
original statement of this lemma in this document was **false**; it is restated here.

*Gaussian form.* On the sector arc $\{Re^{i\theta}:0\le\theta\le\pi/(2n)\}$,
$$\Big|\int_{\text{arc}}e^{-z^n}dz\Big|\le R\int_0^{\pi/(2n)}e^{-R^n\cos n\theta}\,d\theta\le\frac{\pi}{2nR^{\,n-1}}\longrightarrow0,$$
via $\cos\phi\ge1-2\phi/\pi$ on $[0,\pi/2]$ — which is why the arc must stop at $\theta=\pi/(2n)$,
i.e. $n\theta\le\pi/2$. **The angular range and the inequality's range are the same constraint.**
Beyond it $\cos n\theta<0$, the modulus $e^{-R^n\cos n\theta}$ *grows*, and at $\theta=\pi/n$ it is
$e^{+R^n}$. This is the lemma the $\int_0^\infty e^{-x^n}dx$ derivation needs.

*Oscillatory (Fresnel) form.* For $f=e^{iz^n}$ the arc $\{Re^{i\theta}:0\le\theta\le\pi/(2n)\}$ is
again the right one, with $|e^{iz^n}|=e^{-R^n\sin n\theta}$ and **Jordan's** inequality
$\sin\psi\ge2\psi/\pi$ on $[0,\pi/2]$ giving the same $\pi/(2nR^{\,n-1})$ bound. For $n=2$ this is
the classical $\pi/4$ wedge of the Fresnel integrals.

*Its maximal range, which is larger.* $\sin$ stays non-negative all the way to $\pi$ and is symmetric
about $\pi/2$, so $\int_0^{\Psi}e^{-\kappa\sin\psi}d\psi\le\int_0^{\pi}=2\int_0^{\pi/2}\le\pi/\kappa$:
the arc $\theta\in[0,\pi/n]$ is admissible too, at twice the constant,
$\pi/(nR^{\,n-1})$. That is the range quoted in [`gallery/tier-efg.md`](../gallery/tier-efg.md)
§10.1, and the two statements agree — $\pi/(2n)$ is the wedge the Fresnel derivation *uses*,
$\pi/n$ is the largest one on which the form still vanishes. **The Gaussian form has no such
latitude**, and that asymmetry is the whole of D-1: $\cos$ changes sign at $\pi/2$, so past it the
modulus grows rather than merely being bounded worse.

*Engine note — implemented in M5.2.* $\cos\phi\ge1-2\phi/\pi$ and $\sin\psi\ge2\psi/\pi$ are **the
same inequality** under $\phi=\pi/2-\psi$; L3 and L6 share one dischargeable predicate rather than
two (`kernel/bounds/linearMinorant.ts`, with `jordanArcBound` and `wedgeArcBound` both discharging
through it). The engine quotes **no** range: it reads the arc's own range off the geometry and asks
the predicate, so the difference between $\pi/(2n)$ and $\pi/n$ appears as the constant rather than
as a choice anyone has to remember. What the predicate decides is the *side condition* — is the
range inside $[0,\pi/2]$? — which is the decidable half and the half this document had wrong.

**(L7) Periodic-side cancellation (not a vanishing lemma).** If $f(z+iP)=\lambda f(z)$, the top side
of a rectangle does not vanish — it *reproduces* the bottom side with factor $-\lambda$, giving
$(1-\lambda)\int_{\mathbb R}f=2\pi i\sum\operatorname{Res}_{\text{strip}}$. Only the **vertical**
sides need a vanishing lemma (usually plain ML with exponential decay).

**(L8) Sokhotski–Plemelj.** As distributions on $\mathbb{R}$,
$$\lim_{\varepsilon\to0^+}\frac{1}{x-x_0\mp i\varepsilon}=\mathcal{P}\frac{1}{x-x_0}\pm i\pi\delta(x-x_0),$$
i.e. $\lim_{\varepsilon\to0^+}\int\frac{f(x)}{x-x_0\mp i\varepsilon}dx=\mathcal{P}\!\!\int\frac{f(x)}{x-x_0}dx\pm i\pi f(x_0)$.
This is L4 with $\alpha=\pi$ rewritten as an $i\varepsilon$ prescription; physics conventions
(Feynman $i\epsilon$, retarded/advanced Green's functions) are exactly a choice of which side to
indent.

---

## 1. Rational trigonometric integrals on the unit circle

**Form.** $\displaystyle\int_0^{2\pi}R(\cos\theta,\sin\theta)\,d\theta$, $R$ a rational function of
two real variables.

**Substitution identities.** With $z=e^{i\theta}$, $\theta:0\to2\pi$ traverses $|z|=1$ once
positively, and
$$\cos\theta=\frac{z+z^{-1}}{2},\quad \sin\theta=\frac{z-z^{-1}}{2i},\quad
\cos n\theta=\frac{z^n+z^{-n}}{2},\quad \sin n\theta=\frac{z^n-z^{-n}}{2i},\quad
d\theta=\frac{dz}{iz}.$$

**Hypotheses.** $R$ rational; the denominator of $R$ has **no zero on the circle $x^2+y^2=1$**.

**Contour.** $|z|=1$, counterclockwise. Closed — **no vanishing lemma needed**. This is the only
family in the taxonomy with an empty `vanishingLemmas` list, which makes it the cheapest `=` in the
whole engine.

**Formula.**
$$\int_0^{2\pi}R(\cos\theta,\sin\theta)\,d\theta=2\pi i\!\!\sum_{|z_k|<1}\!\!\operatorname{Res}(f,z_k),
\qquad f(z)=\frac{1}{iz}R\!\left(\frac{z+z^{-1}}{2},\frac{z-z^{-1}}{2i}\right).$$

**Hypothesis check is a Schur–Cohn problem.** After clearing $z^{-1}$'s, "no poles on $|z|=1$"
becomes "the denominator polynomial $D(z)\in\mathbb{Q}(i)[z]$ has no root on the unit circle" —
decidable exactly, and the repo **already ships an exact interval Schur–Cohn test** in the
Quadrature-Domains algebra kernel. Reuse it; do not re-implement numerically.

**Worked examples** (all verified):
- $\displaystyle\int_0^{2\pi}\frac{d\theta}{1+a^2-2a\cos\theta}=\frac{2\pi}{1-a^2}$, $|a|<1$ (Poisson kernel).
- $\displaystyle\int_0^{2\pi}\frac{d\theta}{a+b\cos\theta}=\frac{2\pi}{\sqrt{a^2-b^2}}$, $a>|b|>0$.
- $\displaystyle\int_0^{2\pi}\frac{\cos2\theta}{5-4\cos\theta}\,d\theta=\frac{\pi}{6}$.
- $\displaystyle\int_0^{2\pi}\frac{d\theta}{a+b\cos^2\theta}=\frac{2\pi}{\sqrt{a(a+b)}}$; at $a=1,b=3$ this is $\pi$.
- $\displaystyle\int_0^{2\pi}\cos^{2n}\theta\,d\theta=2\pi\binom{2n}{n}4^{-n}$.
- $\displaystyle\int_0^{2\pi}e^{\cos\theta}\cos(\sin\theta)\,d\theta=2\pi$ — pure CIF ($\oint e^z/z\,dz$), the natural bridge example.

**Traps.** (i) $z=0$ is *almost always* a pole of $f$, manufactured by $1/(iz)$ and the negative
powers — omitting it is the single commonest error. (ii) Forgetting the Jacobian $d\theta=dz/(iz)$.
(iii) Reducing $\int_0^{2\pi}\to2\int_0^{\pi}$ is valid only when the integrand is symmetric about
$\theta=\pi$; $\sin\theta$ breaks it. (iv) The boundary case $|a|=1$ puts a pole **on** the contour
and the integral genuinely diverges — refuse, don't return a limit. (v) A pole *near* the circle is
legal but numerically stiff; the exact test must be exact.

---

## 2. Improper rational integrals via the large semicircle

**Form.** $\displaystyle\int_{-\infty}^{\infty}\frac{P(x)}{Q(x)}\,dx$.

**Hypotheses.** $P,Q$ polynomials, $\gcd(P,Q)=1$; $Q$ has **no real zeros**;
$\deg Q\ge\deg P+2$.

**Contour.** $[-R,R]\cup C_R$, $C_R$ the upper semicircle; $R\to\infty$.
**Lemma:** L2 with $p=\deg Q-\deg P\ge2$.

**Formula.** $\displaystyle\int_{-\infty}^{\infty}\frac{P}{Q}\,dx=2\pi i\!\!\sum_{\operatorname{Im}z_k>0}\!\!\operatorname{Res}\frac{P}{Q}$.
Closing in the lower half-plane gives the same number as $-2\pi i\sum_{\operatorname{Im}z_k<0}$ —
a free consistency check, and a good engine self-test.

**Worked examples** (verified): $\int_{\mathbb R}\frac{dx}{(1+x^2)^2}=\frac{\pi}{2}$;
$\int_{\mathbb R}\frac{dx}{1+x^4}=\frac{\pi}{\sqrt2}$;
$\int_{\mathbb R}\frac{dx}{x^2+2x+2}=\pi$;
$\int_{\mathbb R}\frac{x^2\,dx}{(1+x^2)^3}=\frac{\pi}{8}$.

**Traps.** (i) $\deg Q=\deg P+1$ **fails**: $\int x/(1+x^2)dx$ exists only as a principal value, yet
the residue computation still returns a finite number — the engine must refuse, not report. (ii)
Real zeros of $Q$ push you to §4. (iii) Even integrands: $\int_0^\infty=\frac12\int_{-\infty}^\infty$
only for even $P/Q$. (iv) Orientation sign when closing downward.

---

## 3. Fourier-type integrals and Jordan's lemma

**Form.** $\displaystyle\int_{-\infty}^{\infty}R(x)e^{iax}\,dx$, $a\in\mathbb R\setminus\{0\}$.

**Hypotheses.** $R$ rational (more generally meromorphic with finitely many poles in the relevant
half-plane), **no real poles**, and $R(z)\to0$ as $|z|\to\infty$ in the closing half-plane —
$\deg Q\ge\deg P+1$ suffices.

**Contour.** $a>0$: $[-R,R]\cup C_R^{+}$ (upper). $a<0$: lower semicircle, negatively oriented.
**Lemma:** L3 (Jordan), with $g=R$, $M_R=\max_{C_R}|R|\to0$.

**Formula.**
$$\int_{-\infty}^{\infty}R(x)e^{iax}dx=\begin{cases}
2\pi i\sum_{\operatorname{Im}z_k>0}\operatorname{Res}\big[R(z)e^{iaz}\big], & a>0,\\[2pt]
-2\pi i\sum_{\operatorname{Im}z_k<0}\operatorname{Res}\big[R(z)e^{iaz}\big], & a<0.
\end{cases}$$
Cosine/sine integrals are $\operatorname{Re}$/$\operatorname{Im}$ of this — **valid only when $R$ is
real-valued on $\mathbb{R}$** (i.e. $R\in\mathbb{R}(x)$).

**Worked examples** (verified):
- $\displaystyle\int_{\mathbb R}\frac{\cos(ax)}{x^2+b^2}dx=\frac{\pi}{b}e^{-ab}$, $a,b>0$ (Cauchy/Poisson kernel pair).
- $\displaystyle\int_{\mathbb R}\frac{x\sin x}{1+x^2}dx=\frac{\pi}{e}$ — the Jordan-only case: $R=z/(1+z^2)=O(1/z)$, so L2 is unavailable.
- $\displaystyle\int_{\mathbb R}\frac{\cos x}{1+x^4}dx=\frac{\pi}{\sqrt2}e^{-1/\sqrt2}\!\left(\cos\tfrac1{\sqrt2}+\sin\tfrac1{\sqrt2}\right)$.

**Traps.** (i) **The fatal one:** replacing $\cos(ax)$ by $\cos(az)$ instead of $e^{iaz}$.
$|\cos(az)|$ grows like $e^{|a||y|}$ in *both* half-planes, so the arc never vanishes. Always
complexify to the exponential, then take a real part at the very end. (ii) $\deg Q=\deg P+1$ gives
only conditional convergence — the answer is right but the *label* must record that absolute
convergence failed. (iii) $a=0$ degenerates to §2 and needs the stronger degree condition. (iv)
$\sin$-integrals of *even* $R$ vanish by parity; returning a residue sum there indicates a sign bug.

---

## 4. Indented contours, principal values, Sokhotski–Plemelj

**Form.** $\displaystyle\mathcal{P}\!\!\int_{-\infty}^{\infty}f(x)\,dx$ where $f$ has **simple**
poles $x_1<\dots<x_m$ on $\mathbb{R}$.

**Definition.** $\mathcal{P}\!\int_{-\infty}^{\infty}f:=\lim_{\varepsilon\to0^+}\Big[\int_{-\infty}^{x_1-\varepsilon}+\sum\int_{x_j+\varepsilon}^{x_{j+1}-\varepsilon}+\int_{x_m+\varepsilon}^{\infty}\Big]$
(plus the usual symmetric limit at $\pm\infty$). If the integral converges outright, the p.v. equals
it; the converse is false.

**Contour.** The real axis with a small semicircle of radius $\rho$ **detouring above** each real
pole (so the pole is excluded), closed by a large semicircle in the upper half-plane.
**Lemmas:** L3/L2 on the big arc, **L4 with $\alpha=\pi$** on each indentation. Traversed as part of
this contour each indentation runs *clockwise*, contributing $-i\pi\operatorname{Res}$.

**Formula.**
$$\mathcal{P}\!\!\int_{-\infty}^{\infty}f(x)\,dx=2\pi i\!\!\sum_{\operatorname{Im}z_k>0}\!\!\operatorname{Res}(f,z_k)\;+\;\pi i\!\!\sum_{x_j\in\mathbb{R}}\!\!\operatorname{Res}(f,x_j).$$
Indenting *below* instead moves each real pole inside, changing $+\pi i$ to $-\pi i$ **and** adding
$2\pi i$ — the two routes agree, which is the second good self-test.

**Canonical case.** $f(z)=e^{iz}/z$: no poles in the upper half-plane, one simple real pole at $0$
with residue $1$, so $\mathcal{P}\!\int_{\mathbb R}\frac{e^{ix}}{x}dx=i\pi$; taking imaginary parts,
$$\int_{-\infty}^{\infty}\frac{\sin x}{x}\,dx=\pi,\qquad \int_0^{\infty}\frac{\sin x}{x}\,dx=\frac{\pi}{2}.$$
**Subtlety worth encoding:** $\int\sin x/x$ converges (conditionally) as a genuine improper
integral, so the p.v. *is* its value; but $\mathcal{P}\!\int e^{ix}/x\,dx$ exists **only** as a
principal value, since $\int\cos x/x$ diverges at $0$. The engine must track convergence of the
*target* separately from the *auxiliary* integrand.

**Worked examples** (verified): $\int_0^\infty\frac{\sin x}{x}dx=\frac\pi2$;
$\int_0^\infty\frac{1-\cos x}{x^2}dx=\frac\pi2$; $\int_0^\infty\frac{\sin^2x}{x^2}dx=\frac\pi2$;
$\mathcal{P}\!\int_{\mathbb R}\frac{\sin x}{x(x^2+1)}dx=\pi\!\left(1-e^{-1}\right)$.

**Traps.** (i) **Double poles on the axis kill the method** — L4 fails and no p.v. exists (Hadamard
finite part is a different object). (ii) p.v. existence $\neq$ integral existence:
$\mathcal{P}\!\int_0^2\frac{dx}{x-1}=0$ while the integral diverges. Labelling it `=` without
saying "principal value" is a correctness bug. (iii) Corner poles: if the contour has a corner at
$x_j$ of interior angle $\alpha$, the contribution is $i\alpha\operatorname{Res}$, not $i\pi$.
(iv) Getting the $\pm i\pi$ sign from the indentation direction — tie it mechanically to the
$i\epsilon$ prescription (L8), never by hand.

---

## 5. Branch cuts: keyhole, Mellin, logs, dogbone

### 5.1 The keyhole and the Mellin master formula

**Form.** $\displaystyle\int_0^{\infty}x^{s-1}R(x)\,dx$ — the Mellin transform $\mathcal{M}[R](s)$.

**Hypotheses.** $R$ meromorphic with finitely many poles, **none on $[0,\infty)$**; $s$ in the
*fundamental strip*: if $R(x)=O(x^{-d})$ as $x\to\infty$ and $O(x^{m})$ as $x\to0^+$, require
$-m<\operatorname{Re}s<d$. Branch: $z^{s-1}=e^{(s-1)\operatorname{Log}z}$ with $\arg z\in(0,2\pi)$.

**Contour.** Keyhole: upper edge $\arg z=0^+$ from $\varepsilon$ to $R$; outer circle $|z|=R$;
lower edge $\arg z=2\pi^-$ from $R$ back to $\varepsilon$; inner circle $|z|=\varepsilon$ reversed.
**Lemmas:** L2 (or L5) on $|z|=R$; ML on $|z|=\varepsilon$ (needs $\operatorname{Re}s>-m$).

**The cancellation.** The two straight edges do **not** cancel: the lower edge carries the factor
$e^{2\pi i(s-1)}=e^{2\pi is}$, giving $(1-e^{2\pi is})I=2\pi i\sum\operatorname{Res}$. Since
$1-e^{2\pi is}=-e^{\pi is}\cdot2i\sin(\pi s)$:
$$\boxed{\ \int_0^{\infty}x^{s-1}R(x)\,dx=\frac{2\pi i}{1-e^{2\pi is}}\sum_{z_k\notin[0,\infty)}\!\!\operatorname{Res}\big[z^{s-1}R(z)\big]=-\frac{\pi e^{-i\pi s}}{\sin(\pi s)}\sum_{z_k}\operatorname{Res}\big[z^{s-1}R(z)\big]\ }$$
with $\arg z\in(0,2\pi)$ throughout.

**Sanity instance.** $R=1/(1+x)$: the only pole is $z=-1=e^{i\pi}$, residue
$e^{i\pi(s-1)}=-e^{i\pi s}$, giving
$$\int_0^{\infty}\frac{x^{\alpha-1}}{1+x}\,dx=\frac{\pi}{\sin(\pi\alpha)},\qquad0<\alpha<1.$$
This *is* Euler's reflection formula in integral clothing: the left side is
$B(\alpha,1-\alpha)=\Gamma(\alpha)\Gamma(1-\alpha)$ (§11).

**More verified instances.** $\int_0^\infty\frac{x^{\alpha-1}}{(1+x)^2}dx=\frac{\pi(1-\alpha)}{\sin\pi\alpha}$ ($0<\alpha<2$);
$\int_0^\infty\frac{x^{\alpha-1}}{1+x^2}dx=\frac{\pi/2}{\sin(\pi\alpha/2)}$;
$\int_0^\infty\frac{x^{a-1}}{1+x^n}dx=\frac{\pi/n}{\sin(\pi a/n)}$ ($0<a<n$);
$\int_0^\infty\frac{\sqrt x}{x^2+6x+8}dx=\pi\!\left(1-\tfrac1{\sqrt2}\right)$;
$\int_0^\infty\frac{x^{1/3}}{1+x^2}dx=\frac{\pi}{\sqrt3}$;
$\int_0^\infty\frac{dx}{(1+x)\sqrt x}=\pi$.

### 5.2 Log-multiplied integrands and the $\log^2$ trick

Two legitimate routes, with different rigor costs.

**(a) Mellin differentiation.** $\frac{\partial}{\partial s}x^{s-1}=x^{s-1}\log x$, so
$\int_0^\infty R(x)\log x\,dx=\frac{d}{ds}\mathcal{M}[R](s)\big|_{s=1}$ — valid because
$\mathcal{M}[R]$ is *holomorphic* in the fundamental strip, so differentiation under the integral is
justified by local uniform convergence, not merely asserted. Cheap and exact once §5.1 is in place.
Example (verified): $\int_0^\infty\frac{x^{\alpha-1}\log x}{1+x}dx=-\frac{\pi^2\cos\pi\alpha}{\sin^2\pi\alpha}$.

**(b) The $\log^2$ trick.** Run the keyhole on $f(z)=R(z)(\log z)^2$, $\arg z\in(0,2\pi)$. Upper edge:
$(\log x)^2$. Lower edge: $(\log x+2\pi i)^2=(\log x)^2+4\pi i\log x-4\pi^2$. The $(\log x)^2$ terms
cancel and the remainder is linear in $\log x$:
$$-4\pi i\int_0^{\infty}R(x)\log x\,dx+4\pi^2\int_0^{\infty}R(x)\,dx=2\pi i\sum\operatorname{Res}\big[R(z)(\log z)^2\big].$$
**Both** integrals fall out of **one** contour — the imaginary part gives $\int R\log x$, the real
part gives $\int R$. (Correspondingly, plain $\log z$ on a keyhole yields only $\int R\,dx$ and
*loses* the $\log$ integral to cancellation — the classic "why did my log integral vanish?" moment.)

Verified: $\int_0^\infty\frac{\log x}{1+x^2}dx=0$;
$\int_0^\infty\frac{\log x}{(1+x^2)^2}dx=-\frac{\pi}{4}$;
$\int_0^\infty\frac{(\log x)^2}{1+x^2}dx=\frac{\pi^3}{8}$;
$\int_0^\infty\frac{\log x}{x^2+a^2}dx=\frac{\pi\log a}{2a}$;
$\int_0^\infty\frac{\log x}{1+x^3}dx=-\frac{2\pi^2}{27}$.

### 5.3 The dogbone (dumbbell) contour for a finite cut

**Form.** $\int_a^b w(x)g(x)\,dx$ where $w$ has a branch cut exactly on $[a,b]$ — typically
$w=(x-a)^{\mu}(b-x)^{\nu}$ or $(1-x^2)^{\pm1/2}$.

**Contour.** A closed curve hugging $[a,b]$: above the cut left→right, a small circle at $b$, below
the cut right→left, a small circle at $a$. Because $w$ changes by a fixed phase across the cut, the
two straight passes **add** rather than cancel.

**Key identity.** The dogbone $D$ (counterclockwise about the cut) is homologous, in
$\widehat{\mathbb C}\setminus[a,b]$, to a large circle; hence
$$\oint_D f\,dz=-2\pi i\Big[\sum_{z_k\notin[a,b]}\operatorname{Res}(f,z_k)+\operatorname{Res}(f,\infty)\Big],$$
which is why §9 (residue at infinity) is a *prerequisite*, not an optional extra.

**Verified examples.**
$\int_{-1}^{1}\frac{dx}{(x^2+a^2)\sqrt{1-x^2}}=\frac{\pi}{a\sqrt{1+a^2}}$;
$\int_{-1}^{1}\frac{\sqrt{1-x^2}}{1+x^2}dx=\pi(\sqrt2-1)$;
$\int_0^{3}\frac{x^{3/4}(3-x)^{1/4}}{5-x}dx=\frac{\pi}{2\sqrt2}\big(17-40^{3/4}\big)$.

**Traps for all of §5.** (i) **Branch choice is part of the answer.** $\arg z\in(0,2\pi)$ vs
$(-\pi,\pi]$ changes which residues are picked and the phase factor; a "wrong" cut placed along the
positive axis can make the target integral cancel itself to $0$. (ii) The contour must never cross
the cut — the residue theorem is simply inapplicable if it does. (iii) A pole **on** the cut (e.g.
the dogbone with a pole inside $[a,b]$) breaks the method. (iv) Branch points are not poles: no
residue exists at $z=0$ for $z^{s-1}$; the inner circle is killed by ML, not by a residue. (v) For
the dogbone, forgetting $\operatorname{Res}(f,\infty)$ silently drops a term.

---

## 6. Rectangular / strip contours: periodicity does the work

**Pattern.** Choose $f$ with $f(z+iP)=\lambda f(z)$ for a fixed period $P>0$ and constant $\lambda$.
Rectangle $-R\to R\to R+iP\to -R+iP\to -R$. Vertical sides $\to0$ by ML (exponential decay);
the top side reproduces $-\lambda\times$ the bottom (L7), so
$$(1-\lambda)\int_{-\infty}^{\infty}f(x)\,dx=2\pi i\!\!\sum_{0<\operatorname{Im}z_k<P}\!\!\operatorname{Res}(f,z_k).$$

**Verified instances.**
- $f(z)=\dfrac{e^{az}}{1+e^z}$, $0<a<1$: $P=2\pi$ *(corrected — the shift is $z\mapsto z+iP=z+2\pi i$, and $P$ is real by the convention above)*, $\lambda=e^{2\pi ia}$, one pole $z=i\pi$ with residue $-e^{i\pi a}$ $\Rightarrow$
  $$\int_{-\infty}^{\infty}\frac{e^{ax}}{1+e^{x}}\,dx=\frac{\pi}{\sin(\pi a)}.$$
- $\displaystyle\int_{-\infty}^{\infty}\frac{e^{ax}}{e^{x}+e^{-x}}dx=\frac{\pi}{2}\sec\!\frac{\pi a}{2}$, $|a|<1$ ($P=\pi$).
- $\displaystyle\int_{-\infty}^{\infty}\operatorname{sech}(x)e^{i\xi x}dx=\pi\operatorname{sech}\!\frac{\pi\xi}{2}$: $\lambda=-e^{-\pi\xi}$, single pole at $i\pi/2$, residue $-ie^{-\pi\xi/2}$; at $\xi=0$ this gives $\int\operatorname{sech}=\pi$.
- **Gaussian shift** (a *different* subpattern): $f(z)=e^{-z^2}$ is entire, so the rectangle
  $0,R,R+\frac{ib}{2},\frac{ib}{2}$ gives **zero residues** and Cauchy's theorem alone yields
  $$\int_{-\infty}^{\infty}e^{-x^2}\cos(bx)\,dx=\sqrt{\pi}\,e^{-b^2/4}.$$

**Structural insight for the engine.** $x=\log t$ maps $\int_{\mathbb R}\frac{e^{ax}}{1+e^x}dx$ onto
$\int_0^\infty\frac{t^{a-1}}{1+t}dt$. **§6 is the logarithmic image of §5**: the keyhole's two edges
become the strip's two horizontal sides, and the phase $e^{2\pi is}$ becomes $\lambda$. Encoding
that equivalence lets one gallery entry certify the other and gives a free cross-check.

**Traps.** (i) Choosing the wrong height: $P$ must be a genuine (quasi-)period, and the strip must
contain **exactly** the poles you count. (ii) $\lambda=1$ makes $(1-\lambda)=0$ — the method
degenerates and the residue sum must vanish identically; a nonzero sum signals a setup error.
(iii) Vertical-side decay fails at the endpoints of the parameter range ($a\to0^+$ or $a\to1^-$
above), exactly where the closed form blows up. (iv) The Gaussian-shift subpattern has no residues
at all — an engine that assumes "contour method $\Rightarrow$ residues" will mis-handle it.

---

## 7. Sector (wedge) contours

**Pattern.** Use a rotational quasi-symmetry $f(\omega z)=\mu f(z)$, $\omega=e^{2\pi i/n}$ (or
$e^{i\phi}$). Contour: ray $\arg z=0$ from $0$ to $R$; arc of angle $2\pi/n$; ray $\arg z=2\pi/n$
back to $0$. **Lemma:** L2 on the arc for algebraic decay, **L6** for Gaussian-type decay.

**Formula.** With $f(z)=1/(1+z^n)$ the return ray contributes $-\omega I$ and the wedge encloses the
single pole $z_0=e^{i\pi/n}$ ($\operatorname{Res}=-z_0/n$):
$$\int_0^{\infty}\frac{dx}{1+x^{n}}=\frac{\pi/n}{\sin(\pi/n)},\qquad n\ge2;\qquad
\int_0^{\infty}\frac{x^{a-1}}{1+x^{n}}dx=\frac{\pi/n}{\sin(\pi a/n)},\ 0<a<n.$$
Verified at $n=3$ ($2\pi/3\sqrt3$), $n=5$, and $(a,n)=(1.5,4)$. Note this coincides with §5.1 under
$u=x^n$ — a second cross-family identity.

**Fresnel integrals.** $f(z)=e^{-z^2}$ entire, wedge angle $\pi/4$. Cauchy's theorem plus L6 gives
$\int_0^\infty e^{-x^2}dx=e^{i\pi/4}\int_0^\infty e^{-it^2}dt$, hence
$$\int_0^{\infty}\cos(x^2)\,dx=\int_0^{\infty}\sin(x^2)\,dx=\frac12\sqrt{\frac{\pi}{2}}=\sqrt{\frac{\pi}{8}}\approx0.6266570687.$$
**Generalised** (verified at $n=3$): for $n>1$,
$$\int_0^{\infty}\cos(x^{n})dx=\Gamma\!\left(1+\tfrac1n\right)\cos\frac{\pi}{2n},\qquad
\int_0^{\infty}\sin(x^{n})dx=\Gamma\!\left(1+\tfrac1n\right)\sin\frac{\pi}{2n}.$$

**Honesty note.** $\int_0^\infty e^{-x^n}dx=\Gamma(1+1/n)$ is a *real* substitution ($u=x^n$), **not**
a contour result. Its genuine contour sibling is the rotated version
$\int_0^\infty e^{-e^{i\phi}x^n}dx$, which needs the wedge and $|\phi|<\pi/(2n)$ for convergence.
The gallery should say which is which rather than claiming contour provenance for a calculus fact.

**Traps.** (i) The wedge angle must be $2\pi/n$ *exactly*, or the rays are not related by the
symmetry. (ii) $n=1$ degenerates ($\int dx/(1+x)$ diverges). (iii) The arc bound for Fresnel is
**not** ML — $|e^{-z^2}|=e^{-R^2\cos2\theta}\to1$ as $\theta\to\pi/4$, so L6's linear lower bound on
$\cos$ is essential. Hand-waving here is the most common "proof" gap in textbook treatments.

---

## 8. Summation of series by residues

**Kernels.** $\pi\cot(\pi z)$ has simple poles at every $n\in\mathbb Z$ with residue $1$;
$\pi\csc(\pi z)$ has simple poles at $n$ with residue $(-1)^n$.

**Contour.** The square $\Gamma_N$ with vertices $(N+\tfrac12)(\pm1\pm i)$. The half-integer offset
is what makes the kernels *uniformly* bounded: on $\Gamma_N$, $|\cot(\pi z)|\le\coth(\pi/2)$ for all
$N$ (on the horizontal sides $|\cot\pi z|\le\coth(\pi y)\le\coth(\pi/2)$; on the vertical sides
$|\cot(\pi(N+\tfrac12+iy))|=|\tanh(\pi y)|<1$).

**Theorem.** Let $f$ be meromorphic with finitely many poles, **none at an integer**, and
$|f(z)|\le M/|z|^{k}$ with $k>1$ for $|z|$ large. Then $\oint_{\Gamma_N}\to0$ — ⚠ **the bound
originally printed here omitted the kernel's own factor of $\pi$ and was therefore not a bound at
all** (see [§14](#14-corroboration-and-flags)). Correctly, with $L(\Gamma_N)=4(2N+1)$ and
$|z|\ge N+\tfrac12$ on $\Gamma_N$:
$$\Big|\oint_{\Gamma_N}\pi\cot(\pi z)f(z)\,dz\Big|\;\le\;\pi\coth\tfrac{\pi}{2}\cdot\frac{M}{(N+\tfrac12)^{k}}\cdot4(2N+1)\;=\;O(N^{1-k})\longrightarrow0 .$$
The asymptotics are unchanged; the *constant* is what was wrong, and a ledger printing `≤` would
have printed a false one. And
$$\sum_{n=-\infty}^{\infty}f(n)=-\sum_{j}\operatorname{Res}\big[\pi\cot(\pi z)f(z);z_j\big],\qquad
\sum_{n=-\infty}^{\infty}(-1)^nf(n)=-\sum_{j}\operatorname{Res}\big[\pi\csc(\pi z)f(z);z_j\big],$$
sums over the poles of $f$.

**Verified examples.**
$\sum_{n\in\mathbb Z}\frac{1}{n^2+a^2}=\frac{\pi}{a}\coth(\pi a)$;
$\sum_{n\in\mathbb Z}\frac{(-1)^n}{n^2+a^2}=\frac{\pi}{a}\operatorname{csch}(\pi a)$.

**The collision case — and why it is pedagogically the best entry.** For $\sum1/n^2$ the hypothesis
"no poles at integers" **fails**: $f=1/z^2$ has its pole *at* $n=0$, where the kernel also has one.
The fix is to compute the merged residue directly: $\pi\cot(\pi z)/z^2$ has a pole of order $3$ at
$0$ with $\operatorname{Res}=-\pi^2/3$, giving $\sum_{n\neq0}n^{-2}=\pi^2/3$ and
$$\zeta(2)=\sum_{n\ge1}\frac1{n^2}=\frac{\pi^2}{6}.$$
Identically, $\operatorname{Res}_{0}\big[\pi\csc(\pi z)/z^2\big]=\pi^2/6$ gives
$\sum_{n\ge1}\frac{(-1)^n}{n^2}=-\frac{\pi^2}{12}$, and
$\operatorname{Res}_{0}\big[\pi\cot(\pi z)/z^4\big]=-\pi^4/45$ gives $\zeta(4)=\pi^4/90$.
(All verified.) Encoding "kernel pole and $f$ pole collide $\Rightarrow$ raise the order and merge"
is a real engine requirement, not an edge case.

**Abel–Plana formula.**
$$\sum_{n=0}^{\infty}f(n)=\int_0^{\infty}f(x)\,dx+\tfrac12f(0)+i\int_0^{\infty}\frac{f(iy)-f(-iy)}{e^{2\pi y}-1}\,dy,$$
under: $f$ analytic on $\{\operatorname{Re}z\ge0\}$; $|f(x\pm iy)|e^{-2\pi y}\to0$ uniformly in $x$ on
finite intervals; $\int_0^\infty|f(x+iy)-f(x-iy)|e^{-2\pi y}dy$ exists for each $x\ge0$ and $\to0$ as
$x\to\infty$. *Numerically verified here* on $f(x)=(1+x)^{-2}$, which reproduces $\pi^2/6$ to $5\times10^{-16}$ —
a good golden test because it exercises the complex-argument evaluation of $f$.

**Traps.** (i) $k>1$ is necessary *for the bound*: at $k=1$ (e.g. $f=1/z$) the estimate above is
$O(1)$ and establishes nothing, so only the symmetric/principal-value sum survives the argument.
⚠ *Corrected:* the original wording claimed the square integral itself "does not vanish", which is
measurably false for $f=1/z$ — by symmetry it does. What fails is the **bound**, not the limit, and
conflating the two is precisely the error the rigor labels exist to prevent. (ii) Poles of $f$ at non-integers but very
close to integers are legal yet ill-conditioned. (iii) $\sum_{n\in\mathbb Z}$ vs
$\sum_{n\ge1}$ bookkeeping (halving, and the $n=0$ term) is where sign errors breed.

---

## 9. Residue at infinity

**Definition.** For $f$ holomorphic on an annulus $R<|z|<\infty$,
$$\operatorname{Res}(f,\infty):=-c_{-1}\ \text{(Laurent at }\infty)=-\frac{1}{2\pi i}\oint_{|z|=r}f(z)\,dz
=\operatorname{Res}_{w=0}\!\left[-\frac{1}{w^2}f\!\left(\frac1w\right)\right],\quad r>R,$$
the circle positively oriented. The $1/w^2$ is the Jacobian of $z=1/w$ — residues are attached to
*differential forms* $f\,dz$, not functions.

**Theorem (total residue).** If $f$ is meromorphic on $\widehat{\mathbb C}$ with finitely many
singularities, then $\displaystyle\sum_{\text{finite }a_k}\operatorname{Res}(f,a_k)+\operatorname{Res}(f,\infty)=0$.

**When it simplifies work.** (a) Many poles inside a contour, few outside: replace $k$ residue
computations by $1$. (b) **Dogbone contours** (§5.3) — the exterior of the cut contains $\infty$, so
the identity is structural rather than an optimisation. (c) Quick criteria: $f=O(|z|^{-2})$ at
$\infty$ $\Rightarrow\operatorname{Res}(f,\infty)=0$; $f\sim c/z$ $\Rightarrow\operatorname{Res}(f,\infty)=-c$.
(d) A rational $P/Q$ with $\deg Q\ge\deg P+2$ has zero residue at infinity — which is *precisely* the
degree condition of §2, re-derived. That is a satisfying unification to surface in the UI.

**Trap.** $\operatorname{Res}(f,\infty)$ can be nonzero even when $f$ is holomorphic at $\infty$ —
e.g. $f=1/z$ is holomorphic at $\infty$ (value $0$) yet $\operatorname{Res}(f,\infty)=-1$. "Regular at
$\infty$" and "zero residue at $\infty$" are different statements.

---

## 10. Argument principle, Rouché, and counting

**Argument principle.** $f$ meromorphic inside and on a positively oriented simple closed $\gamma$,
with no zeros or poles **on** $\gamma$:
$$\frac{1}{2\pi i}\oint_\gamma\frac{f'(z)}{f(z)}\,dz=Z-P=n(f\circ\gamma,0)=\frac{1}{2\pi}\Delta_\gamma\arg f,$$
$Z,P$ counted with multiplicity/order. (Mechanism: a zero of order $k$ makes $f'/f$ have a simple
pole of residue $+k$; a pole of order $m$, residue $-m$.)

**Generalised (weighted) form.**
$\displaystyle\frac{1}{2\pi i}\oint_\gamma g(z)\frac{f'(z)}{f(z)}dz=\sum_j k_j\,g(a_j)-\sum_l m_l\,g(b_l)$
for $g$ holomorphic. With $g(z)=z^p$ this computes **power sums of the roots inside $\gamma$** — i.e.
Newton's identities by quadrature, which is exactly how contour-based root finders (and the repo's
existing Durand–Kerner work in `@cas/core`) relate.

**Rouché, classical.** $f,g$ holomorphic on a region containing $\overline K$; if $|g(z)|<|f(z)|$ on
$\partial K$ then $f$ and $f+g$ have the same number of zeros in $K$ (with multiplicity).

**Rouché, symmetric (Estermann).** If $|f(z)-g(z)|<|f(z)|+|g(z)|$ on $\partial K$ then $f$ and $g$
have the same number of zeros in $K$. Strictly stronger; the inequality just says $f(z)/g(z)$ is
never a negative real, so the image curves are homotopic in $\mathbb C^*$.

**Nyquist reading.** Plot $f\circ\gamma$ and count encirclements of the origin; for a feedback system
with open loop $L$, applying the principle to $1+L$ on a contour enclosing the right half-plane gives
$Z=N+P$ — closed-loop unstable poles from encirclements of $-1$ plus open-loop unstable poles. Good
interactive material: the winding number is *visually* the answer.

**Traps.** (i) Zeros or poles **on** $\gamma$ make $f'/f$ non-integrable — the count is undefined,
not zero. (ii) Rouché's inequality must be **strict**, and must hold at every boundary point.
(iii) Rouché counts zeros of $f+g$ (or of $g$), never of $g$ alone in the classical phrasing —
mis-ordering the roles is endemic. (iv) $Z-P$ is a *difference*: a contour with $3$ zeros and $3$
poles returns $0$, which does not mean "no zeros".

---

## 11. Gamma and Beta by contour methods

### 11.1 Reflection formula
$$\Gamma(s)\Gamma(1-s)=\frac{\pi}{\sin(\pi s)},\qquad s\notin\mathbb Z.$$
Contour proof: $B(s,1-s)=\Gamma(s)\Gamma(1-s)/\Gamma(1)=\int_0^\infty\frac{x^{s-1}}{1+x}dx=\frac{\pi}{\sin\pi s}$
for $0<\operatorname{Re}s<1$ by §5.1, then analytic continuation. So the reflection formula and the
keyhole are *the same theorem*, which is worth making explicit in the gallery.

### 11.2 Hankel loop integral
DLMF (5.9.2): with the contour beginning at $-\infty$, encircling the origin once positively, and
returning to $-\infty$, and $t^{-z}$ taking its principal value where the path crosses the positive
real axis (continuous elsewhere),
$$\frac{1}{\Gamma(z)}=\frac{1}{2\pi i}\int_{-\infty}^{(0+)}e^{t}t^{-z}\,dt,$$
valid for **all** $z\in\mathbb C$ — the contour representation is what exhibits $1/\Gamma$ as entire,
which Euler's integral cannot. The companion
$\Gamma(z)=\big(e^{i\pi z}-e^{-i\pi z}\big)^{-1}\!\int_{H}e^{t}t^{z-1}dt$ is *(single-sourced — see §14)*.

### 11.3 Pochhammer double-loop contour
Let $\gamma_0,\gamma_1$ be positively oriented loops about $0$ and $1$; the Pochhammer contour is the
commutator $P=\gamma_0\gamma_1\gamma_0^{-1}\gamma_1^{-1}$. Then
$$\oint_{P}t^{\alpha-1}(1-t)^{\beta-1}\,dt=\big(1-e^{2\pi i\alpha}\big)\big(1-e^{2\pi i\beta}\big)B(\alpha,\beta).$$
The integral converges for **all** $\alpha,\beta\in\mathbb C$, giving the analytic continuation of $B$.
The mechanism is topological: $P$ has winding number $0$ about each branch point, so the multivalued
integrand returns to its initial branch (the contour is null-homologous in the complement but **not**
null-homotopic). This is the cleanest demonstration in the whole taxonomy that *homology, not
homotopy, is what the residue theorem needs* — a first-class item for a branch-cut-aware tool.

---

## 12. Advanced tier: Bromwich and inverse Mellin

**Bromwich (inverse Laplace).**
$$f(t)=\frac{1}{2\pi i}\int_{\gamma-i\infty}^{\gamma+i\infty}F(p)e^{pt}\,dp,$$
$\gamma$ real and **to the right of every singularity of $F$** (i.e. $\gamma>$ the abscissa of
convergence). If $F$ has only poles and $F(p)\to0$ as $|p|\to\infty$:
- $t<0$: close to the **right**; the arc vanishes (a Jordan variant, since $|e^{pt}|\le e^{\gamma t}$
  there), no poles enclosed $\Rightarrow f(t)=0$ — **causality falls out of contour orientation**.
- $t>0$: close to the **left** $\Rightarrow f(t)=\sum_k\operatorname{Res}\big[F(p)e^{pt}\big]$.

Examples: $F=1/(p-a)\Rightarrow e^{at}$; $F=p^{-n}\Rightarrow t^{n-1}/(n-1)!$;
$F=e^{-p}/p\Rightarrow H(t-1)$ (absorb $e^{-p}$ into $e^{pt}$ with $\tilde t=t-1$, then apply Jordan).

**Branch cuts change the physics.** $F(p)=e^{-x\sqrt p}/p$ has a *branch point* at $p=0$, not a pole,
so the contour must be deformed into a Hankel-type path around the negative axis and the answer comes
from the **cut discontinuity**, not residues: poles $\to$ exponentials/oscillations, cuts $\to$
power-law/diffusive tails ($\operatorname{erfc}$, $t^{-1/2}$). Showing this side by side is the single
most illuminating thing an inverse-Laplace visualiser can do.

**Inverse Mellin / Mellin–Barnes.** $f(x)=\frac{1}{2\pi i}\int_{c-i\infty}^{c+i\infty}F(s)x^{-s}ds$
with $c$ in the fundamental strip $a<\operatorname{Re}s<b$ (where $\mathcal M$ converges absolutely).
Closing left/right and summing residues yields asymptotic expansions as $x\to0$/$x\to\infty$. For
Mellin–Barnes integrands (ratios of $\Gamma$'s of linear argument) the contour must be **indented to
separate** the poles of $\Gamma(a_j+A_js)$ from those of $\Gamma(b_j-B_js)$ — a genuine contour
*constraint*, and a natural interactive control.

**Rigor boundary.** Closing a Bromwich or Mellin contour with **infinitely many** poles requires
uniform bounds on a sequence of connecting arcs. Absent that bound, a residue sum is a *formal*
expansion. This is the taxonomy's clearest `≈`-vs-`=` line and the engine must draw it.

---

## 13. Prioritised v1 gallery (28 integrals)

Ordered to maximise taxonomy coverage per unit of engine surface. **Tier A** needs only: rational
arithmetic, root isolation, residues by $P/Q'$, and the closed-contour identity — i.e. essentially
the `@cas/exact` + `@cas/core` primitives the repo already has. Each later tier adds *one* capability.

| # | Integral | Value | Family | New engine capability |
|---|---|---|---|---|
| **A1** | $\int_0^{2\pi}\frac{d\theta}{a+b\cos\theta}$, $a>\lvert b\rvert>0$ | $\frac{2\pi}{\sqrt{a^2-b^2}}$ | §1 | unit-circle substitution; Schur–Cohn pole test |
| **A2** | $\int_0^{2\pi}\frac{d\theta}{1+a^2-2a\cos\theta}$ | $\frac{2\pi}{1-a^2}$ | §1 | parameter-dependent pole selection ($\lvert a\rvert\lessgtr1$) |
| **A3** | $\int_0^{2\pi}\frac{\cos2\theta}{5-4\cos\theta}d\theta$ | $\frac{\pi}{6}$ | §1 | $\cos n\theta\mapsto(z^n+z^{-n})/2$; pole at $z=0$ |
| **A4** | $\int_0^{2\pi}e^{\cos\theta}\cos(\sin\theta)\,d\theta$ | $2\pi$ | §1/CIF | entire integrand; CIF path |
| **A5** | $\int_{\mathbb R}\frac{dx}{(1+x^2)^2}$ | $\frac{\pi}{2}$ | §2 | L2; order-2 residue |
| **A6** | $\int_{\mathbb R}\frac{dx}{1+x^4}$ | $\frac{\pi}{\sqrt2}$ | §2 | irrational algebraic poles (exact via RUR) |
| **A7** | $\int_{\mathbb R}\frac{x^2dx}{(1+x^2)^3}$ | $\frac{\pi}{8}$ | §2 | order-3 residue $\Rightarrow$ series route |
| **B1** | $\int_{\mathbb R}\frac{\cos ax}{x^2+b^2}dx$ | $\frac{\pi}{b}e^{-ab}$ | §3 | Jordan; sign-of-$a$ branch |
| **B2** | $\int_{\mathbb R}\frac{x\sin x}{1+x^2}dx$ | $\frac{\pi}{e}$ | §3 | Jordan strictly beyond L2; conditional convergence flag |
| **B3** | $\int_{\mathbb R}\frac{\cos x}{1+x^4}dx$ | $\frac{\pi}{\sqrt2}e^{-1/\sqrt2}\big(\cos\tfrac1{\sqrt2}+\sin\tfrac1{\sqrt2}\big)$ | §3 | complex residues at algebraic poles |
| **C1** | $\int_0^\infty\frac{\sin x}{x}dx$ | $\frac{\pi}{2}$ | §4 | small-arc L4; p.v. bookkeeping |
| **C2** | $\int_0^\infty\frac{1-\cos x}{x^2}dx$ | $\frac{\pi}{2}$ | §4 | removable singularity detection |
| **C3** | $\mathcal P\!\int_{\mathbb R}\frac{\sin x}{x(x^2+1)}dx$ | $\pi(1-e^{-1})$ | §4 | real pole **and** complex pole together |
| **D1** | $\int_0^\infty\frac{x^{\alpha-1}}{1+x}dx$ | $\frac{\pi}{\sin\pi\alpha}$ | §5.1 | keyhole; $\arg\in(0,2\pi)$; symbolic exponent |
| **D2** | $\int_0^\infty\frac{\sqrt x}{x^2+6x+8}dx$ | $\pi\big(1-\tfrac1{\sqrt2}\big)$ | §5.1 | two poles off the cut |
| **D3** | $\int_0^\infty\frac{x^{a-1}}{1+x^n}dx$ | $\frac{\pi/n}{\sin(\pi a/n)}$ | §5.1/§7 | two-parameter family; §5$\equiv$§7 cross-check |
| **D4** | $\int_0^\infty\frac{\log x}{(1+x^2)^2}dx$ | $-\frac{\pi}{4}$ | §5.2 | $\log^2$ trick (yields D5 free) |
| **D5** | $\int_0^\infty\frac{(\log x)^2}{1+x^2}dx$ | $\frac{\pi^3}{8}$ | §5.2 | $\log^3$ / Mellin $\partial_s^2$ |
| **D6** | $\int_{-1}^{1}\frac{dx}{(x^2+a^2)\sqrt{1-x^2}}$ | $\frac{\pi}{a\sqrt{1+a^2}}$ | §5.3 | dogbone + residue at $\infty$ |
| **D7** | $\int_0^3\frac{x^{3/4}(3-x)^{1/4}}{5-x}dx$ | $\frac{\pi}{2\sqrt2}\big(17-40^{3/4}\big)$ | §5.3 | two distinct fractional powers on one cut |
| **E1** | $\int_{\mathbb R}\frac{e^{ax}}{1+e^x}dx$ | $\frac{\pi}{\sin\pi a}$ | §6 | strip contour; quasi-period $\lambda$ |
| **E2** | $\int_{\mathbb R}\operatorname{sech}(x)e^{i\xi x}dx$ | $\pi\operatorname{sech}\frac{\pi\xi}{2}$ | §6 | $\lambda=-e^{-\pi\xi}$; self-reciprocal pair |
| **E3** | $\int_{\mathbb R}e^{-x^2}\cos(bx)\,dx$ | $\sqrt{\pi}\,e^{-b^2/4}$ | §6 | **zero-residue** contour shift |
| **F1** | $\int_0^\infty\frac{dx}{1+x^3}$ | $\frac{2\pi}{3\sqrt3}$ | §7 | wedge $2\pi/n$; rotational symmetry |
| **F2** | $\int_0^\infty\cos(x^2)dx=\int_0^\infty\sin(x^2)dx$ | $\sqrt{\pi/8}$ | §7 | L6 wedge-Jordan bound; entire integrand |
| **G1** | $\sum_{n\ge1}n^{-2}$ | $\frac{\pi^2}{6}$ | §8 | $\pi\cot$ kernel; **kernel/$f$ pole collision** |
| **G2** | $\sum_{n\in\mathbb Z}\frac{1}{n^2+a^2}$ | $\frac{\pi}{a}\coth\pi a$ | §8 | non-colliding case; square-contour bound |
| **G3** | $\sum_{n\ge1}\frac{(-1)^n}{n^2}$ | $-\frac{\pi^2}{12}$ | §8 | $\pi\csc$ kernel |

**Coverage.** §1–§8 fully; §9 via D6/D7; §11 via D1 (reflection formula); §10 and §12 are v2 (they
are *not* "evaluate a definite integral" tasks and need different UI). **Minimal engine surface:**
28 entries need exactly — rational residues (exact), one fractional-power branch, one logarithm
branch, one $\pi\cot/\pi\csc$ kernel pair, and six contour templates (circle, semicircle, indented
semicircle, keyhole, dogbone, rectangle, wedge). Everything else is parameterisation.

---

## 14. Corroboration and flags

### 14.0 Corrections made after independent re-verification (2026-09-10)

Three agents independently re-derived and re-verified all 28 gallery entries while writing
[`../gallery/`](../gallery/), *without* reading the values in §13. **All 28 closed forms survived**
(agreement 0–2.6e-14). Three **lemma statements** did not, and are corrected in place above. All
three were caught by numerical evaluation, not by reading — which is the argument for the golden
corpus in one line.

**C1 is now carried by the engine, with its measurement (M5.2).** A correction that lives only in a
document is one someone re-derives the old way, so the divergence is computed in the suite
(`test/wedgeArc.test.ts` reproduces 2.7e15, 1.1e93 and the overflow) and the range test is a
predicate rather than a quoted number (`kernel/bounds/linearMinorant.ts`). The bound itself is
`kernel/bounds/wedgeArc.ts`, reachable from the ledger's KILL pass for any `λ·e^{w zⁿ}` arc measured
from the positive real axis. C2's square-contour bound is still a document-only correction; it lands
with the summation kernel in M5.5.

| # | what was wrong | where | status |
|---|---|---|---|
| C1 | **L6 was false as stated.** The arc ran to $\theta=\pi/n$ while the supporting inequality $\cos\phi\ge1-2\phi/\pi$ is valid only on $[0,\pi/2]$, i.e. $\theta\le\pi/(2n)$ — the statement contradicted itself. Past $n\theta=\pi/2$ the modulus $e^{-R^n\cos n\theta}$ *grows*; the stated majorant diverges (measured: 2.7e15 at $n{=}2,R{=}6$; 1.1e93 at $n{=}3$; overflow at $n{=}4$). | §0.3 | **fixed** — range $\pi/(2n)$, bound $\pi/(2nR^{n-1})$, oscillatory form given separately |
| C2 | **The §8 square-contour "bound" was not a bound.** It dropped the $\pi$ from the kernel $\pi\cot(\pi z)$; that 3.14× outweighs what $\lvert z\rvert\ge N$ buys, so the expression sits *below* the true integral (3.392 vs 3.567 at $N{=}3$; 0.356 vs 0.493 at $N{=}25$ — 30–40 % short at every $N$). Asymptotics were right; the constant was not. | §8 | **fixed** |
| C3 | **$P=2\pi i$ should be $P=2\pi$** — the section's own convention has $P$ real with the shift $z\mapsto z+iP$. | §6 | **fixed** |
| C4 | §13's A1 row omitted the constraint $a>\lvert b\rvert>0$ that §1's text carries. The general value is $2\pi\,\mathrm{sgn}(a)/\sqrt{a^2-b^2}$; at $a=-2,b=1$ the residue machinery returns $-2\pi/\sqrt3$ while the table's formula returns $+2\pi/\sqrt3$. §13 is what a gallery author transcribes, so the constraint belongs there. | §13 | **fixed** |
| C5 | §8's trap (i) claimed the square integral "does not vanish" at $k=1$; measurably it does (by symmetry, for $f=1/z$). The **bound** fails, not the limit. | §8 | **fixed** |

Two further observations from the same pass, recorded rather than fixed because they are design
input rather than errors: **L3 and L6 rest on the same inequality** under $\phi=\pi/2-\psi$ and
should share one dischargeable predicate; and **the total-residue identity $\sum\operatorname{Res}=0$
is a property of rationality, not of the pole set** — A6 and B3 share a denominator and an identical
algebraic residue factor, yet the identity holds for A6 and fails for B3 because $e^{iz}$ has an
essential singularity at $\infty$. An engine that caches the identity per-denominator is silently
wrong on every Fourier twin.

### 14.1 Original corroboration notes

- **Corroborated by ≥2 independent sources** *and* numerically verified: Jordan's lemma statement and
  bound; the estimation lemma; the small-arc/fractional-residue lemma; Sokhotski–Plemelj; the
  keyhole/Mellin cancellation factor; $\pi/\sin\pi\alpha$; the $\pi\cot$/$\pi\csc$ square-contour
  method and its $|{\cot}|\le\coth(\pi/2)$ bound; the residue-at-infinity definition and total-residue
  theorem; argument principle; Rouché (both forms); Pochhammer/Beta; Bromwich; Fresnel; the
  reflection formula; Abel–Plana.
- **Single-sourced — flagged.** (a) The Hankel representation
  $\Gamma(z)=(e^{i\pi z}-e^{-i\pi z})^{-1}\int_H e^{t}t^{z-1}dt$: I confirmed DLMF 5.9.2 for
  $1/\Gamma$ directly, but this companion form came from one secondary summary only. (b) The
  Abel–Plana **hypothesis list** (uniform-decay conditions) came from a single source family; the
  *formula* is corroborated and numerically verified, the precise regularity hypotheses are not
  double-checked. Treat both as `≈`-provenance until re-derived.
- **Resolved non-discrepancy.** An intermediate fetch reported Wikipedia's trigonometric example
  $\int_{-\pi}^{\pi}\frac{dt}{1+3\cos^2t}$ as $\pi\sqrt2/4$. Direct computation gives **$\pi$**
  (residues $-i/4$ at $z=\pm i/\sqrt3$, poles of $3z^4+10z^2+3$), and re-fetching the article
  confirms it states $\pi$. The discrepancy was a summarisation artifact, not a source error —
  recorded because it is exactly the failure mode a golden corpus is meant to catch.
- **Not verified, deliberately.** No §10 or §12 numeric checks were run (they are not definite-integral
  evaluations); their statements are source-corroborated only.

---

## 15. Schema sketch — encoding a family

Design goals: (1) hypotheses are **executable predicates**, not prose; (2) every vanishing lemma
carries its own dischargeable side condition; (3) the rigor label is *computed* from which checks
passed, never asserted; (4) contours are **templates with limit parameters**, so the UI can animate
$R\to\infty$, $\varepsilon\to0$.

```jsonc
{
  "id": "mellin-keyhole",
  "title": "Mellin transform of a rational function (keyhole)",
  "taxonomySection": "5.1",

  "target": {
    "variable": "x", "lower": "0", "upper": "inf",
    "integrand": "x^(s-1) * R(x)",          // @cas/expr AST
    "symbols": { "R": { "kind": "rationalFn", "var": "x" } }
  },

  "parameters": [
    { "name": "s", "domain": "complex",
      "constraints": ["Re(s) > -ord0(R)", "Re(s) < decayExponent(R)"] }
  ],

  // Executable preconditions. `refuse` means: do not emit a value at all.
  "hypotheses": [
    { "id": "R-meromorphic-finite-poles", "check": "structural:isRational(R)", "onFail": "refuse" },
    { "id": "no-poles-on-cut",
      "statement": "R has no pole on [0, inf)",
      "check": "algebraic:noRealNonnegativeRoot(denom(R))",   // exact: Sturm / Schur-Cohn
      "onFail": "refuse" },
    { "id": "fundamental-strip",
      "statement": "-m < Re(s) < d  (integrability at 0 and at inf)",
      "check": "algebraic:strip(s, ord0(R), decayExponent(R))",
      "onFail": "refuse" }
  ],

  "branch": {
    "function": "z^(s-1)",
    "cut": { "ray": "[0, inf)", "argRange": [0, 6.283185307179586] },   // arg in (0, 2pi)
    "crossingPhase": "exp(2*pi*i*s)"     // what the lower edge multiplies by
  },

  "contour": {
    "template": "keyhole",
    "limitParams": [ { "name": "R", "to": "inf" }, { "name": "eps", "to": "0+" } ],
    "pieces": [
      { "id": "upper", "kind": "segment", "from": "eps", "to": "R", "argOffset": "0+",
        "role": "target" },
      { "id": "outer", "kind": "arc", "radius": "R", "from": "0+", "to": "2pi-",
        "role": "vanish", "lemma": "L2" },
      { "id": "lower", "kind": "segment", "from": "R", "to": "eps", "argOffset": "2pi-",
        "role": "reproduces", "factor": "-exp(2*pi*i*s)" },
      { "id": "inner", "kind": "arc", "radius": "eps", "from": "2pi-", "to": "0+",
        "role": "vanish", "lemma": "ML" }
    ],
    "orientation": "ccw", "encloses": "all poles of R off [0,inf)"
  },

  "vanishingLemmas": [
    { "lemma": "L2", "piece": "outer",
      "sideCondition": "exists p>1, M: |z^(s-1) R(z)| <= M/|z|^p on |z|=R, R>=R0",
      "discharge": "symbolic:degreeBound(s, R)",     // exact for rationals
      "rigorIfDischarged": "=", "rigorIfNumericOnly": "~" },
    { "lemma": "ML", "piece": "inner",
      "sideCondition": "eps * max_{|z|=eps} |z^(s-1) R(z)| -> 0",
      "discharge": "symbolic:ord0Bound(s, R)",
      "rigorIfDischarged": "=", "rigorIfNumericOnly": "~" }
  ],

  "residueSelection": { "rule": "notOn", "set": "[0, inf)" },

  "closedForm": {
    "expr": "(2*pi*i/(1 - exp(2*pi*i*s))) * Sum(Res(z^(s-1)*R(z), z_k))",
    "simplified": "-(pi*exp(-i*pi*s)/sin(pi*s)) * Sum(Res(z^(s-1)*R(z), z_k))"
  },

  "rigor": { "policy": "min", "inputs": ["hypotheses.*", "vanishingLemmas.*.rigor",
                                         "residues.*.rigor"] },

  "traps": [
    { "id": "wrong-branch", "detect": "branch.argRange != (0,2pi)",
      "message": "With arg in (-pi,pi] the two edges cancel and the integral collapses to 0." },
    { "id": "pole-on-cut", "detect": "hypotheses.no-poles-on-cut == false" },
    { "id": "branch-point-is-not-a-pole",
      "message": "z=0 contributes via the ML bound on the inner circle, never as a residue." }
  ],

  "golden": [
    { "params": { "R": "1/(1+x)", "s": 0.3 },
      "value": "pi/sin(pi*s)", "numeric": 3.8832220774509327, "verifiedTo": 1e-14 },
    { "params": { "R": "sqrt-case: 1/(x^2+6x+8)", "s": 1.5 },
      "value": "pi*(1 - 1/sqrt(2))", "numeric": 0.9201511845, "verifiedTo": 1e-8 }
  ]
}
```

**The three fields that carry the design.** `vanishingLemmas[].discharge` is the honest-labeling
hinge: a *symbolic* discharge earns `=`, a merely numerical one caps the whole result at `≈`, and a
one-sided bound yields `≤`. `contour.pieces[].role` (`target` / `vanish` / `reproduces` /
`residue`) generalises **every** family in §1–§12 — §1 has only `target`; §6 and §5.1 differ solely in
whether the second edge's `factor` is $-\lambda$ or $-e^{2\pi is}$; §7 is the same with
$-\omega\mu$. `rigor.policy: "min"` makes the label a computed meet over evidence, so no code path
can hand-assert `=`.

**Engine constraints this taxonomy imposes.**
1. **Branch data is first-class input**, not a rendering detail: the `argRange` changes the *answer*.
2. **Exact residues at algebraic poles** are required for the interesting cases ($1+x^4$, $1+x^n$);
   floating roots downgrade `=` to `≈`. The existing RUR/`@cas/exact` channel is the right substrate,
   and $P/Q'$ is the formula that keeps everything inside $\mathbb Q(i)[z]/\langle Q\rangle$.
3. **Refusal must be a first-class outcome.** Poles on the contour, $\deg Q=\deg P+1$, double poles
   on the axis, $|a|=1$ — all produce plausible-looking residue sums that are *wrong*. The engine
   must decline rather than emit.
4. **p.v. is a distinct result type** from a convergent integral; conflating them is a correctness
   bug, not a presentation choice.
5. **Cross-family identities are free tests:** §5.1$\equiv$§6 under $x=\log t$; §5.1$\equiv$§7 under
   $u=x^n$; §2's degree condition $\equiv$ $\operatorname{Res}(\cdot,\infty)=0$; closing up vs down
   must agree. Wire these as invariants in the golden corpus.

---

## Sources

**Reference works and encyclopedic**
- Wikipedia, *Methods of contour integration* / *Contour integration* — https://en.wikipedia.org/wiki/Contour_integration
- Wikipedia, *Jordan's lemma* — https://en.wikipedia.org/wiki/Jordan%27s_lemma
- Wikipedia, *Residue theorem* — https://en.wikipedia.org/wiki/Residue_theorem
- Wikipedia, *Residue at infinity* — https://en.wikipedia.org/wiki/Residue_at_infinity
- Wikipedia, *Estimation lemma* — https://en.wikipedia.org/wiki/Estimation_lemma
- Wikipedia, *Rouché's theorem* — https://en.wikipedia.org/wiki/Rouch%C3%A9%27s_theorem
- Wikipedia, *Argument principle* — https://en.wikipedia.org/wiki/Argument_principle
- Wikipedia, *Pochhammer contour* — https://en.wikipedia.org/wiki/Pochhammer_contour
- Wikipedia, *Fresnel integral* — https://en.wikipedia.org/wiki/Fresnel_integral
- Wikipedia, *Cauchy principal value* — https://en.wikipedia.org/wiki/Cauchy_principal_value
- Wikipedia, *Mellin transform* — https://en.wikipedia.org/wiki/Mellin_transform
- NIST DLMF §5.9, *Gamma function — integral representations* (Hankel loop, eq. 5.9.2) — https://dlmf.nist.gov/5.9
- NIST DLMF §5.2, *Gamma function — definitions* — https://dlmf.nist.gov/5.2
- Encyclopedia of Mathematics, *Residue of an analytic function* — https://encyclopediaofmath.org/wiki/Residue_of_an_analytic_function
- Wolfram MathWorld, *Abel–Plana formula* — https://mathworld.wolfram.com/Abel-PlanaFormula.html
- Wolfram MathWorld, *Bromwich integral* — https://mathworld.wolfram.com/BromwichIntegral.html

**University lecture notes**
- J. Orloff, *MIT 18.04 Complex Variables with Applications*, Topic 9: "Definite integrals using the residue theorem" (Theorems 9.1, 9.2, 9.7, 9.13, 9.14) — https://ocw.mit.edu/courses/18-04-complex-variables-with-applications-spring-2018/f69bc227ae476839819fb18e5b283072_MIT18_04S18_topic9.pdf
- Orloff / LibreTexts, *Complex Variables with Applications*, Ch. 10 incl. §10.4 "Integrands with branch cuts" — https://math.libretexts.org/Bookshelves/Analysis/Complex_Variables_with_Applications_(Orloff)/10:_Definite_Integrals_Using_the_Residue_Theorem
- R. E. Hunt, *Cambridge DAMTP NST Mathematical Methods II*, Ch. 5: "Contour Integration and Transform Theory" (Jordan's lemma; Bromwich inversion) — https://www.damtp.cam.ac.uk/user/reh10/lectures/nst-mmii-chapter5.pdf
- J. McKernan, *UCSD Math 120B*, Lecture 8 "The keyhole contour" and Lecture 6 "Indented paths" — https://mathweb.ucsd.edu/~jmckerna/Teaching/19-20/Spring/120B/l_8.pdf , .../l_6.pdf
- R. Herman (UNC Wilmington), *Summation of Series via the Residue Theorem* — https://people.uncw.edu/hermanr/complex/summation-series-residue.pdf
- H. Haber, *UC Santa Cruz Physics 215: The Sokhotski–Plemelj Formula* — http://scipp-legacy.pbsci.ucsc.edu/~haber/ph215/Plemelj18.pdf
- P. Garrett (Minnesota), *Fourier transform of sech* — https://www-users.cse.umn.edu/~garrett/m/real/notes_2019-20/08e_Fourier_transform_sech.pdf
- Bristol MATH30800, *Contour integration in the presence of branch cuts* — https://people.maths.bris.ac.uk/~mayt/MATH30800/2012/handouts/branchCuts.pdf
- J. McCuan (Georgia Tech), *The Argument Principle and Rouché's Theorem* — https://mccuan.math.gatech.edu/courses/6321/rouche.pdf
- Y. Chong, *Complex Methods for the Sciences*, Ch. 9 (Physics LibreTexts) — https://phys.libretexts.org/Bookshelves/Mathematical_Physics_and_Pedagogy/Complex_Methods_for_the_Sciences_(Chong)/09:_Contour_Integration
- D. Zagier, *The Mellin transform and related analytic techniques* (appendix) — https://people.mpim-bonn.mpg.de/zagier/files/tex/MellinTransform/fulltext.pdf
- S. J. Miller (Williams), course notes: *Definite Integrals by Contour Integration* — https://web.williams.edu/Mathematics/sjmiller/public_html/372Fa15/coursenotes/Trapper_MethodsContourIntegrals.pdf
- Edinburgh, *Advanced Mathematical Methods*, §12 Laplace transforms / lecture 3 Gamma function — https://www2.ph.ed.ac.uk/~mevans/amm/section12.pdf
- J. Shurman (Reed), *Math 311: Complex Analysis — contour integrals* — https://people.reed.edu/~jerry/311/lec08.pdf

**Standard texts (consulted for framing; not quoted)**
- L. Ahlfors, *Complex Analysis*, 3rd ed. (Ch. 4: the residue theorem, argument principle).
- E. Stein & R. Shakarchi, *Complex Analysis* (Princeton Lectures II), Ch. 3 "Meromorphic functions and the logarithm".
- Gradshteyn & Ryzhik, *Table of Integrals, Series, and Products* — used only as a cross-check target for standard closed forms; see the arXiv companion series "Integrals in Gradshteyn and Ryzhik" (e.g. arXiv:1803.00632) for citable derivations.

**Independent numerical verification**
All closed forms above were recomputed in this session with double-exponential (tanh–sinh) quadrature
in a stable-endpoint formulation, plus half-period decomposition with Cesàro acceleration for
oscillatory/conditionally-convergent cases, and direct summation with Euler–Maclaurin tails for
series. 60 identities checked; agreement ≥1e-8 relative in all cases, ≥1e-13 in most.
