# 06 — Branch cuts and multivalued functions: the implementation problem

> Track: representing, computing with, and visualising branch cuts in `apps/contour-integration`.
> Companion to [`03-method-taxonomy.md`](03-method-taxonomy.md) §5/§15 (which sketches a
> `"branch": { function, cut: { ray, argRange }, crossingPhase }` block) and
> [`02-pedagogy-misconceptions.md`](02-pedagogy-misconceptions.md) requirement 15 (`M-branch`).
> Status of the repo: **nothing in the suite currently does analytic continuation or carries a
> sheet index.** `@cas/expr` and the `@cas/gpu` GLSL stdlib are principal-branch-only with no way
> to request an offset cut. This is greenfield work.

---

## 0. The one-paragraph recommendation

Restrict v1 to the **closed class**

$$f(z) \;=\; R(z)\cdot\prod_{k}(z-b_k)^{\alpha_k}\cdot\big(\log(z-b_\ell)\big)^{m},\qquad \alpha_k\in\mathbb{Q}\ \text{or}\ \mathbb{R},\ m\in\{0,1,2\}$$

with $R$ rational. This covers **every** gallery item in doc 03 §13 — keyhole, Mellin, log-trick,
log²-trick, dogbone, fractional powers — and its branch structure is *exactly known in closed
form*, so no root-tracking, no Puiseux, no monodromy computation is needed. Represent a branch
choice as `{ branchPoints, cutArcs, basePoint, baseLift, sheet }`; evaluate on the CPU by
**continuous-argument accumulation along the contour** (this produces the *answer*) and on the GPU
by a **cut-crossing correction to the principal branch** (this produces the *picture*); prove the
two agree with the existing `dualBackend` corpus discipline. Algebraic $w^n = R(z)$ is v2 and needs
a different machine entirely.

---

## 1. Conventions and the computer-algebra literature

### 1.1 The unwinding number

Everything begins with the observation that $\operatorname{Log} e^z \neq z$. Corless and Jeffrey
(SIGSAM Bulletin 30(2), 1996) name the defect:

$$\mathcal{K}(z) \;=\; \frac{z - \operatorname{Log} e^{z}}{2\pi i}, \qquad\text{equivalently}\qquad \operatorname{Log} e^{z} = z - 2\pi i\,\mathcal{K}(z).$$

It is always an integer, and has a closed form:

$$\boxed{\;\mathcal{K}(z) \;=\; \left\lceil \frac{\operatorname{Im} z - \pi}{2\pi} \right\rceil\;}$$

(Check: $\operatorname{Im} z\in(-\pi,\pi]$ gives $\mathcal{K}=0$; $\operatorname{Im} z\in(\pi,3\pi]$ gives $\mathcal{K}=1$.)

Every false identity is repaired by inserting it:

| naive identity | correct statement |
|---|---|
| $\operatorname{Log}(z_1z_2)=\operatorname{Log} z_1+\operatorname{Log} z_2$ | $\operatorname{Log}(z_1z_2)=\operatorname{Log} z_1+\operatorname{Log} z_2-2\pi i\,\mathcal{K}(\operatorname{Log} z_1+\operatorname{Log} z_2)$ |
| $\sqrt{z_1z_2}=\sqrt{z_1}\sqrt{z_2}$ | $\sqrt{z_1z_2}=\sqrt{z_1}\sqrt{z_2}\,(-1)^{\mathcal{K}(\operatorname{Log} z_1+\operatorname{Log} z_2)}$ |
| $(z^a)^b=z^{ab}$ | $(z^a)^b=z^{ab}\,e^{-2\pi i\,b\,\mathcal{K}(a\operatorname{Log} z)}$ |
| $\operatorname{Log}(z^n)=n\operatorname{Log} z$ | $\operatorname{Log}(z^n)=n\operatorname{Log} z-2\pi i\,\mathcal{K}(n\operatorname{Log} z)$ |

**Why this matters for a contour app and not just for a CAS.** The dogbone derivation turns
entirely on $\sqrt{z-a}\sqrt{z-b}\neq\sqrt{(z-a)(z-b)}$ — the two differ by exactly the
$(-1)^{\mathcal{K}}$ factor above, and the region where they differ *is* the difference between
"two rays to infinity" and "one segment $[a,b]$" as the cut system. So the unwinding number is not
CAS pedantry here; it is the mechanism behind a gallery item. Ship $\mathcal{K}$ as a one-line
function and use it in the *explanation panel*, not merely in the simplifier.

Related warning: Davenport's *Series Crimes* (arXiv:1203.5846) documents that CAS series expansions
**at or inside a branch cut are wrong for some approach directions**. Any Laurent/Puiseux machinery
the app grows must carry a direction with it.

### 1.2 Where the cuts are: the C99 / Kahan consensus

Kahan's *Branch cuts for complex elementary functions, or much ado about nothing's sign bit* (1987)
is the source of the conventions that C99 Annex G, Python's `cmath`, SciPy, Common Lisp and
Mathematica all now implement. Kahan's claim is strong: the *locations* of the slits are
deducible and not a matter of taste; only the values **on** the slit were historically ambiguous.

The verified table (Python `cmath` docs, which state they follow Kahan and C99 Annex G):

| function | cut(s) | on-cut side with `+0.0` |
|---|---|---|
| `log`, `log10` | $(-\infty,0]$ | from above |
| `sqrt` | same as `log` | from above |
| `phase`/`arg` | $(-\infty,0)$, range $[-\pi,\pi]$ | sign follows `z.imag` even when it is zero |
| `acos`, `asin` | $[1,\infty)$ and $(-\infty,-1]$ | from above |
| `atan` | $[i,i\infty)$ and $(-i\infty,-i]$ | from the **right** |
| `asinh` | $[i,i\infty)$ and $(-i\infty,-i]$ | from the right |
| `acosh` | $(-\infty,1]$ | from above |
| `atanh` | $[1,\infty)$ and $(-\infty,-1]$ | from above |

The operational rule is the **signed-zero rule**, quoted from the `cmath` documentation: *"for a
branch cut along (a portion of) the real axis we look at the sign of the imaginary part, while for
a branch cut along the imaginary axis we look at the sign of the real part."* Hence
`cmath.sqrt(-2+0j) = +1.414j` but `cmath.sqrt(-2-0j) = -1.414j`, and `phase(-1+0j) = +π` while
`phase(-1-0j) = -π`. The frequently quoted *counterclockwise continuity* slogan ("continuous as the
cut is approached coming around the finite endpoint counterclockwise") reproduces this for
`log`/`sqrt`, but is awkward to apply to cuts running out to $+\infty$; **do not implement from the
slogan, implement from a pinned on-cut value corpus.** That is the single most reusable engineering
lesson from this literature.

Note that JavaScript has no signed-zero-preserving complex type by accident: `Math.atan2(-0, -1)`
does return $-\pi$, so the mechanism *is* available in the existing `@cas/expr` evaluator, and it
is available in GLSL only unreliably (drivers flush denormals and signed zeros). This is a real
CPU/GPU asymmetry and a reason not to rely on signed zero as the app's primary side-selector
(see §3.4).

### 1.3 Where the systems actually disagree

Systems agree on cut *locations* far more than folklore suggests. The live disagreements:

- **`arccot` / `arccoth` — the real one.** Wolfram Language documents `ArcCot[z]` as having its cut
  running **from $i$ to $-i$** (the *segment* through the origin), real range $(-\pi/2,\pi/2)$
  excluding $0$, and it is *discontinuous at $z=0$*. That is $\operatorname{arccot} z=\arctan(1/z)$.
  The A&S / Maple-flavoured convention takes $\operatorname{arccot} z=\pi/2-\arctan z$, range
  $(0,\pi)$, **continuous on the whole real line**, cuts on the two imaginary rays *outside*
  $[-i,i]$. These functions differ by $\pi$ on a half-line. Corless, Davenport, Jeffrey and Watt
  ("*According to Abramowitz and Stegun*, or arccoth needn't be uncouth", SIGSAM Bull. 34(2), 2000)
  give the tiebreaker: a pair $(\mathrm{arcfoo},\mathrm{arcfooh})$ is **couth** when
  $i\,\mathrm{arcfoo}(w)=\mathrm{arcfooh}(cw)$ holds except at finitely many points
  ($c=i$ for sin/tan, $1$ for cos/sec, $-i$ for csc/cot). $(\arcsin,\operatorname{arcsinh})$ and
  $(\arctan,\operatorname{arctanh})$ are couth; $(\arccos,\operatorname{arccosh})$ and
  $(\operatorname{arcsec},\operatorname{arcsech})$ are not. **`arccot` is couth iff you define it as
  $\arctan(1/z)$ with $\operatorname{arccoth} z=\operatorname{arctanh}(1/z)$** — i.e. the
  Mathematica choice. The two candidate definitions agree at $z=1$ and differ at $z=-1$, which
  makes a lovely one-click demo.
- **A&S and the DLMF are themselves under-specified on the cuts** — that is the point of the paper's
  title. "Follow A&S" is not an implementable instruction.
- **Maple vs Kahan on composites.** Chyzak, Davenport, Koutschan and Salvy (*On Kahan's Rules for
  Determining Branch Cuts*, SYNASC 2011) report that Maple 17 will not accept Kahan's formula in
  some cases; they adapt Kahan's rules to functions defined by differential equations.

### 1.4 What a teaching tool should adopt, and how to display it

1. **Default to the C99/Kahan principal branch** everywhere, because it matches `@cas/expr`'s
   existing `complexJs.ts` (`arg = Math.atan2(im, re) ∈ (-π,π]`), matches the GLSL twin
   (`carg(a) = atan(a.y, a.x)`), and matches what a student's Python/NumPy session will print.
2. **Make the convention a first-class, visible, serialised object — never an implicit constant.**
   This is ADR-0006 applied to branches: `@cas/core` and `@cas/expr` stay convention-neutral; the
   branch convention lives at the app edge and travels on the wire. `Conventions` in
   `packages/interchange/src/schema.ts` already has `area` and `contour: "standard" |
   "suppressed-2pii"`; add `branch` to it (§8).
3. **Display it as a chip, always on.** `arg ∈ (−π, π]` — cut on ℝ₋ with a one-click switch to
   `arg ∈ [0, 2π)` — cut on ℝ₊. The keyhole gallery items *require* the second; silently switching
   for them is precisely the misconception doc 02 warns about.
4. **Ship the disagreement as content.** An "conventions" panel showing `arccot(−1)` under both
   definitions, `sqrt(-2±0j)`, and `√(z₁z₂)` vs `√z₁√z₂` with the $\mathcal{K}$ correction, is
   three rows of table and teaches the whole §1.

---

## 2. Movable cuts: a cut is a choice, not a property

### 2.1 The admissibility criterion (the core new idea)

Let the branch points be $b_1,\dots,b_m$ (possibly including $\infty$) with local exponents
$\alpha_k$ (for a $\log$ factor, $\alpha_k=\text{“}\infty\text{''}$, i.e. infinite-order monodromy).
The monodromy of $f$ around a loop $\gamma$ is

$$f \;\longmapsto\; f\cdot\exp\!\Big(2\pi i \sum_k \alpha_k\,\mathrm{wind}(\gamma,b_k)\Big).$$

A **cut system** $\Gamma$ is a finite set of simple arcs whose endpoints are branch points (or
$\infty$), pairwise disjoint except at shared endpoints. $\Gamma$ is **admissible** iff every loop
in $\hat{\mathbb{C}}\setminus\Gamma$ has trivial monodromy. Because $\Gamma$ is a forest, this
reduces to a check a program can run in microseconds:

> **Admissibility.** (a) Every branch point with $\alpha_k\notin\mathbb{Z}$ lies on $\Gamma$.
> (b) For every connected component $T$ of $\Gamma$ that does **not** touch $\infty$,
> $\sum_{b_k\in T}\alpha_k\in\mathbb{Z}$. (c) Any component containing a $\log$-type branch point
> must touch $\infty$.

This single rule explains the whole gallery:

- **Keyhole, $z^{\alpha-1}$:** branch points $0$ (exponent $\alpha-1\notin\mathbb{Z}$) and $\infty$.
  No bounded component is possible, so the cut *must* join $0$ to $\infty$ — but it may be *any*
  arc doing so. Dragging it from ℝ₋ to ℝ₊ is legal and is the whole lesson.
- **Dogbone, $((z-a)(z-b))^{-1/2}$:** $\alpha_a=\alpha_b=-\tfrac12$. Individually
  $-\tfrac12\notin\mathbb{Z}$, so both are genuine branch points; but
  $\alpha_a+\alpha_b=-1\in\mathbb{Z}$, so the single arc $a\to b$ is admissible. So is the pair of
  arcs $a\to\infty$, $b\to\infty$. **Both are offerable as presets and the user can drag between
  them** — this is the single most valuable interaction in the app.
- **$\log$:** infinite order at $0$ and $\infty$; no bounded cut ever exists. The UI should refuse
  to let the user close a log cut and say why.

Implement admissibility as a live validator with a visible invalid state, in the spirit of the QD
algebra workspace's "refuses, not guesses" discipline.

### 2.2 Prior art

- **`TradeIdeasPhilip/riemann-surfaces`** (TypeScript/Vite, browser). Plots all $w$ solving
  $z=w^2$, $z=e^w$, $w^3-zw-2=0$ simultaneously; the user clicks to save path points and *"the
  branch cut is automatically moved as far from that point as possible"*. The README's own
  description of the algorithm — *"when I'm calculating the next output point I can clearly choose
  which point will make the path smooth and continuous"* — is nearest-root continuation, and the
  auto-relocation is a consequence rather than a designed feature. §2.3 explains exactly why.
- **Fernando Zigunov's *Interactive Branch Cuts of Complex Functions*** (`3dfernando.github.io/BranchCut.html`):
  a $z$-plane / $f(z)$-plane pair, both domain-coloured by $\arg f$, with a **draggable black ball
  that rotates the branch cut**, and a free-text $f(z)$ entry. This is the rotatable-ray technique
  of §5.2 and is a direct existence proof for the interaction.
- **Maple 17's `BranchCuts` package** (Bradford/Davenport/England/Cheb-Terrab/Wilson) computes and
  plots cuts of composite expressions using cylindrical algebraic decomposition. Its central lesson
  for us: the union of sub-expression cuts is **not** the discontinuity set of the whole expression;
  there are *spurious* cuts that cancel. Rendering the union is dishonest.
- **Mathematica `ComplexPlot`** does not draw cuts at all; it lets the colour discontinuity imply
  them, and `ComplexContourPlot` "will usually not render branch cuts" because of its argument
  function. Wolfram's own docs frame this as "identify jumps and cuts" — an inference task for the
  reader. We can do better (§5.3).

### 2.3 Cuts as a derived consequence of the base point

A result worth building on: **if you define $f(z)$ by continuing along the straight segment
$[z_0,z]$ from the base point, the induced cut system is exactly the set of rays from each $b_k$
pointing directly away from $z_0$** (the "shadow" of each branch point). Move $z_0$ and the cuts
swing like shadows around a lamp. This is free — it requires no cut data structure at all — and it
is very likely what `riemann-surfaces` is doing.

Offer it as a mode ("cuts follow the base point") *and* offer explicit editable cuts. The shadow
mode is the cheap intuition-builder; the explicit mode is needed for the dogbone and for anything
whose cut must be a bounded arc.

---

## 3. Numerical continuation along a path

### 3.1 Continuous-argument accumulation (the whole algorithm)

For each branch point $b_k$ maintain a running lift $\theta_k$. Given contour samples
$z_0,z_1,\dots,z_N$:

```ts
// one step; quotient trick — no wrap test, no modular arithmetic
const d = cdiv(csub(z[n+1], b_k), csub(z[n], b_k));
const dTheta = Math.atan2(d[1], d[0]);      // ∈ (−π, π] automatically
theta_k += dTheta;
```

Then $\log(z-b_k)=\ln|z-b_k|+i\theta_k$ and $(z-b_k)^{\alpha}=\exp(\alpha(\ln|z-b_k|+i\theta_k))$
are continuous along the path by construction. This is exact and allocation-free, and it is the
*only* mechanism the answer depends on.

**Step control.** The quotient trick is correct iff each step subtends less than a half-turn about
every $b_k$. Enforce $|\Delta\theta_k|\le\pi/4$ for all $k$; halve the step otherwise. This single
rule automatically refines near branch points, where the angle changes fastest, and it is a much
better robustness knob than an arc-length tolerance. Also guard $|z-b_k|\ge r_{\min}$ and surface a
"contour passes within $r$ of a branch point" warning rather than silently returning garbage.

**Sheet/monodromy readout.** $\Theta(t)=\sum_k\alpha_k\theta_k(t)$ is a single scalar; its net rise
over a closed contour, divided by $2\pi$, is the monodromy exponent. Non-integer ⇒ the contour does
not close on this sheet. Display it (§7).

### 3.2 Crossing a cut

A cut crossing is not a numerical event — nothing happens to $\theta_k$ — it is a *bookkeeping and
UI* event: the continued value now differs from the displayed principal/cut-relative field. Detect
it by segment–polyline intersection against $\Gamma$ and act on it explicitly. Per doc 02's
`M-branch` requirement, the app must either **refuse** the crossing or **change sheet and say so**,
with the multiplicative factor shown: *"crossed the cut — the integrand is now $e^{2\pi i\alpha}$
times the displayed branch."* Silently continuing is the misconception generator.

### 3.3 The ε-offset for keyhole contours — and why to avoid it

The textbook keyhole integrates along $z=x+i\varepsilon$ and $z=x-i\varepsilon$. Doing that
numerically is a mistake on two counts: it injects an $O(\varepsilon)$ error into the *answer*, and
near $b$ the integrand varies on scale $\varepsilon$, so quadrature cost explodes.

**Don't offset the contour; offset the branch.** Give each contour segment an explicit
`side: 'above' | 'below' | null` tag; when set, the evaluator pins $\theta_k$ to its limiting value
from that side instead of computing it from a perturbed geometry. The contour then lies *exactly on*
$\mathbb{R}_+$ and the integrand is exactly the limiting boundary value. This is the same idea as
C99's signed zero, lifted from a float bit to a data field — which also makes it serialisable and
inspectable, unlike a float sign.

### 3.4 The monodromy factor, precisely

With the cut on $\mathbb{R}_{\ge0}$ and $\arg z\in(0,2\pi)$, for $x>0$:

$$\log(x-i0)=\log(x+i0)+2\pi i,\qquad\qquad \frac{(x-i0)^{\beta}}{(x+i0)^{\beta}} = e^{2\pi i\beta}.$$

So for $f(z)=z^{\alpha-1}g(z)$ with $g$ single-valued near $\mathbb{R}_+$:

$$\boxed{\;f(x-i0) \;=\; e^{2\pi i(\alpha-1)}f(x+i0) \;=\; e^{2\pi i\alpha}f(x+i0)\;}$$

The two exponents are *equal* ($e^{-2\pi i}=1$); the first is the literal form coming from the
exponent in the integrand, the second the reduced form. Show both in the UI — students who see only
$e^{2\pi i\alpha}$ often mis-generalise it to $x^{s}$ integrands, where the factor is
$e^{2\pi i s}$ and the "$-1$" does not appear.

---

## 4. Monodromy and the algebraic structure (v2)

For $w^n=R(z)$ the monodromy group is the image of $\pi_1(\hat{\mathbb{C}}\setminus B)\to S_n$
generated by the local permutations at each branch point $b\in B$. For pure $n$-th roots the local
monodromy is a cyclic shift and the global group is cyclic of order $n$ — the **deck transformation**
being $w\mapsto \zeta_n w$; for $\log$ it is the infinite cyclic $w\mapsto w+2\pi i$. The group
generated by the branch cycles is independent of the choice of cuts, even though the individual
branch cycles are not — a nice invariance to state in the UI.

For general $F(z,w)=0$ the established machinery is Deconinck–van Hoeij (Maple `algcurves`,
Python `abelfunctions`): follow paths along a **minimal spanning tree of the discriminant points**,
lift by numerical analytic continuation on generic sub-paths, and **bypass each critical point
using a truncated Puiseux expansion** (Newton polygon: $cx^\mu$ is a leading term iff $-1/\mu$ is
the slope of a Newton-polygon edge, then iterate on the characteristic equation).

**Root-tracking and swap avoidance.** The naive approach — Durand–Kerner or homotopy at each $z_n$,
then match roots to the previous step by nearest neighbour — fails exactly where it matters. Two
mitigations, both already proven inside this repo:

- **Deflate algebraically rather than match numerically.** `apps/correspondences/src/correspondence.ts`
  removes the trivial branch by synthetic division precisely so it "can never be mislabelled at a
  cusp collision". Where a branch is algebraically distinguishable, never identify it by proximity.
- **Never warm-start into a basin you have not verified.** `apps/correspondences/src/gpu.ts` seeds
  its Newton solve for $\varphi^{-1}$ from a *cold* seed; the inline comment records that warm
  starting landed Newton in the wrong basin and produced fake bounded sets.

Add a **separation gate**: compute the minimum pairwise root distance; if it falls below a
multiple of the step displacement, the tracker is near a branch point — refuse the match, subdivide,
and if it still fails, switch to the local Puiseux model. And take the standing warning from
`apps/correspondences/src/orbitTree.ts`: its `label` is an `atan2` sort order the file itself flags
as *not* analytic continuation, provisional near cusps. **Do not reuse that labelling for sheets.**

---

## 5. Rendering

### 5.1 The dishonesty to design against

Domain colouring renders a cut as a hard colour seam, which reads as a *singularity of the
function*. Three cheap counter-devices, in order of value:

1. **Draw the cut as an explicit stroked, labelled, draggable curve**, visually distinct from
   anything the function does. A cut the user can grab cannot be mistaken for an intrinsic feature.
2. **Overlay modulus contours.** For $f=\prod(z-b_k)^{\alpha_k}$, $|f|=\exp(\sum\alpha_k\ln|z-b_k|)$
   is **single-valued and perfectly continuous across every cut**. Level curves of $|f|$ flowing
   straight through the seam are the most direct possible visual proof that the cut is an artefact
   of the phase choice. This is nearly free and is the strongest honest device available.
3. **A "continuous phase" mode** rendering $\Theta=\sum\alpha_k\theta_k$ unwrapped from the base
   point, with a cyclic colormap. The monodromy shows as the colour wheel *failing to close* after
   a loop, rather than as a seam.

Render the **true discontinuity set of the composite**, never the union of sub-expression cuts
(the Maple `BranchCuts` "spurious cut" lesson, §2.2). For the closed class of §0 this is exact and
combinatorial: a candidate arc is a real cut iff its jump weight (§6) is $\notin\mathbb{Z}$.

### 5.2 GPU: a rotatable branch line

The rotatable-ray primitive, to live beside `carg` in a new `branchGlsl` module and mirrored
textually in a JS twin (the parity discipline of `complexJs.ts` ↔ `complexSingle.glsl.ts`):

```glsl
const float TAU = 6.28318530717958647693;

// arg of z with the cut along the ray of direction theta0; value in [theta0, theta0 + TAU)
float cargCut(cvec z, float theta0) {
    return mod(carg(z) - theta0, TAU) + theta0;     // GLSL mod() = x - y*floor(x/y)
}
cvec clogCut(cvec z, float theta0) {
    return vec_(log(cabsf(z)), cargCut(z, theta0));
}
cvec cpowCut(cvec z, cvec a, float theta0) {        // z^a with a chosen cut
    return cexp(cmul(a, clogCut(z, theta0)));
}
```

Anchor at a branch point with `cargCut(csub(z, b), theta0)`. `theta0 = PI` reproduces the principal
branch exactly (a required agreement test); `theta0 = 0` gives $\arg\in[0,2\pi)$, the keyhole
convention. The df64 path gets the same treatment via `df_atan2`, which `complexDf64.glsl.ts`
already exposes.

For **general (non-ray) dragged cuts**, rays are not enough. Use the crossing-count correction:

```glsl
// m(z): the integer/rational exponent correction taking the reference branch to the cut branch
float cutCorrection(vec2 z) {
    float m = 0.0;
    for (int j = 0; j < MAX_CUT_SEGS; ++j) {
        if (j >= uCutSegCount) break;
        // signed crossing of segment [uBase, z] with cut segment j
        m -= float(signedCross(uBase, z, uCutA[j], uCutB[j])) * uCutJump[j];
    }
    return m;
}
// f(z) = fRef(z) * cexp(vec_(0.0, TAU * cutCorrection(z)))
```

`signedCross` is a standard 2-D segment intersection returning $\{-1,0,+1\}$ by orientation; the
loop is $O(\#\text{segments})$ per pixel, trivial for the $\le 64$ segments a hand-dragged polyline
will ever have. `uCutJump[j]` is the arc's jump weight (§6), uploaded as a uniform array.

**Correctness check worked through.** $f=\sqrt{z}$, cut dragged to $\mathbb{R}_+$, base
$z_0=i$ where $\sqrt{i}=e^{i\pi/4}$. Evaluate at $z=1-0.001i$ (just *below* the new cut). Truth:
$\arg\in(0,2\pi)$ gives $\arg z\approx 2\pi$, so $\sqrt z\approx e^{i\pi}=-1$. Formula: the segment
$[i,\,1-0.001i]$ crosses $\mathbb{R}_+$ once downward (clockwise about $0$, so the signed crossing is
$-1$), $J=\alpha=\tfrac12$, giving $m=-(-1)(\tfrac12)=\tfrac12$, hence
$f=f_{\text{ref}}\cdot e^{i\pi}=-1$. ✓

### 5.3 Sheet selection

`sheet: number` multiplies by $e^{2\pi i\alpha s}$ (power type) or adds $2\pi i s$ (log type). One
integer, one spinner, one badge. Render "other sheets" as faint ghost curves of the contour's image
rather than as extra surfaces.

---

## 6. Keyhole mechanics, exactly

### 6.1 $\displaystyle\int_0^{\infty}\frac{x^{\alpha-1}}{1+x}\,dx$, $0<\alpha<1$

Take $f(z)=z^{\alpha-1}/(1+z)$ with $\log z=\ln|z|+i\arg z$, $\arg z\in(0,2\pi)$; cut on
$\mathbb{R}_{\ge0}$. Four pieces, positively oriented: top edge $\varepsilon\to R$ at
$\arg\approx0^+$; $C_R$ counterclockwise; bottom edge $R\to\varepsilon$ at $\arg\approx2\pi^-$;
$C_\varepsilon$ clockwise.

- top $\to I$;
- bottom $\to -e^{2\pi i(\alpha-1)}I=-e^{2\pi i\alpha}I$;
- $|{\textstyle\int_{C_\varepsilon}}|\le 2\pi\varepsilon\cdot\dfrac{\varepsilon^{\alpha-1}}{1-\varepsilon}=\dfrac{2\pi\varepsilon^{\alpha}}{1-\varepsilon}\to0$ **iff $\alpha>0$**;
- $|{\textstyle\int_{C_R}}|\le 2\pi R\cdot\dfrac{R^{\alpha-1}}{R-1}\approx 2\pi R^{\alpha-1}\to0$ **iff $\alpha<1$**.

Single pole at $z=-1=e^{i\pi}$ ($\arg=\pi\in(0,2\pi)$ ✓), residue $e^{i\pi(\alpha-1)}=-e^{i\pi\alpha}$. So

$$(1-e^{2\pi i\alpha})\,I=-2\pi i\,e^{i\pi\alpha},\qquad 1-e^{2\pi i\alpha}=e^{i\pi\alpha}(-2i\sin\pi\alpha)\;\Longrightarrow\; I=\frac{\pi}{\sin\pi\alpha}.$$

**The standard errors, all worth building as guard-rail messages.**
(1) Using $\arg\in(-\pi,\pi]$ — then the cut lies on $\mathbb{R}_-$, the two "sides" of $\mathbb{R}_+$
are the same side, and the method silently yields $0=0$.
(2) Evaluating the residue with $\arg(-1)=-\pi$ instead of $+\pi$ — the answer is off by
$e^{2\pi i(\alpha-1)}$, and nothing warns you.
(3) Dropping the reversal sign on the bottom edge.
(4) Writing $\log(x-i0)=\log x-2\pi i$; under the $(0,2\pi)$ convention it is $+2\pi i$.
(5) Asserting the circles vanish without stating $0<\alpha<1$ — the hypothesis *is* the content.

### 6.2 The $\log$ trick and the $\log^2$ trick

Same keyhole, $\arg\in(0,2\pi)$, $R$ rational with no poles on $\mathbb{R}_{\ge0}$ and enough decay.

**$\log$**, for $f=R(z)\log z$: top gives $R\log x$; bottom reversed gives $-R(\log x+2\pi i)$.
The $\log x$ terms **cancel**:

$$-2\pi i\int_0^{\infty}R(x)\,dx=2\pi i\sum\operatorname{Res}\big(R(z)\log z\big)\;\Longrightarrow\; \int_0^{\infty}R(x)\,dx=-\sum\operatorname{Res}\big(R(z)\log z\big).$$

The point students miss: $\log$ is inserted **not** because the integrand has one, but as a device
whose multivaluedness *manufactures* the surviving term.

**$\log^2$**, for $f=R(z)\log^2 z$: bottom reversed gives $-R(\log x+2\pi i)^2$, so the sum is
$-4\pi i\,R\log x+4\pi^2R$:

$$-4\pi i\int_0^{\infty}\!R\log x\,dx \;+\; 4\pi^2\!\int_0^{\infty}\!R\,dx \;=\; 2\pi i\sum\operatorname{Res}\big(R(z)\log^2 z\big).$$

Real and imaginary parts separate (for real $R$), delivering $\int R\log x$ **and** $\int R$ at once.
Common failure: dropping the $4\pi^2$ term, or mixing the parts. Worked instance:
$\int_0^{\infty}\frac{\log x}{(1+x^2)^2}dx=-\frac{\pi}{4}$.

### 6.3 Dogbone

For $g(z)=\sqrt{(z-a)(z-b)}$ define $g=\exp\big(\tfrac12(\log(z-a)+\log(z-b))\big)$ with each
$\arg\in[0,2\pi)$. Crossing the real axis right of $b$ or left of $a$, **both** arguments jump by
$2\pi$; half of $4\pi$ is $2\pi$, so $g$ is continuous. Between $a$ and $b$ only one jumps, so
$g\mapsto-g$. **The cut is exactly $[a,b]$** — the $\sqrt{z_1z_2}$ vs $\sqrt{z_1}\sqrt{z_2}$
identity of §1.1 in geometric form.

The dogbone $D$ (top edge, small circles at $a$ and $b$, bottom edge) has top and bottom
contributions **adding** rather than cancelling. Deform outward to a large circle: with $C_R$
enclosing everything, $\oint_{C_R}f=-2\pi i\operatorname{Res}_{\infty}f$, and the annulus between
contains only the poles outside the cut, so

$$\boxed{\;\oint_{D}f \;=\; -2\pi i\Big(\operatorname{Res}_{z=\infty}f \;+\!\!\sum_{\text{poles outside }[a,b]}\!\!\operatorname{Res}f\Big),\qquad \operatorname{Res}_{\infty}f=-\operatorname{Res}_{w=0}\big[w^{-2}f(1/w)\big].}$$

Standard errors: forgetting $\operatorname{Res}_\infty$ entirely; choosing the branch with two rays
to $\infty$ instead of the segment (both are admissible cut systems by §2.1 — but only the segment
makes the dogbone work); and evaluating the residue at an outside pole with the wrong determination
of the square root.

---

## 7. Riemann surfaces, lightly: cheap 2-D sheet devices

No 3-D in v1. Four devices, in cost order:

1. **Unwrapped-argument strip chart.** Plot $\Theta(t)=\sum_k\alpha_k\theta_k(t)$ against the contour
   parameter, beside the plane. The monodromy is the *net rise*; a closed contour that returns to a
   different sheet shows as a visible step. One line chart, and it is the most honest sheet device
   there is.
2. **Sheet badge.** `sheet 1 of 3 · ω = e^{2πi/3}`, updating live as the tracer moves.
3. **Monodromy clock.** A unit circle with a marker at $e^{2\pi i\Theta}$ plus a turn counter — makes
   "$\log$ never closes" visible in one glance.
4. **Contour colour-band.** Recolour the contour stroke by sheet index; the hue change *at* the cut
   crossing is the payload.

---

## 8. Deliverable: the data model

```ts
// apps/contour-integration/src/branch/model.ts
import type { Complex } from "@cas/expr";        // = [re, im]

export type BranchPointId = string;
export const AT_INFINITY = "∞" as const;

export interface BranchPoint {
  id: BranchPointId;
  z: Complex;
  atInfinity?: boolean;
  /** local behaviour (z - b)^alpha, or logarithmic (infinite-order) */
  order: { kind: "power"; alpha: number; exact?: { p: number; q: number } }
       | { kind: "log"; power: 1 | 2 };
}

export interface CutArc {
  id: string;
  from: BranchPointId;
  to: BranchPointId | typeof AT_INFINITY;
  /** interior control points; [] = straight segment, or straight ray when `to` is ∞ */
  via: Complex[];
  /** Σ α over one of the two subtrees obtained by cutting this arc, mod 1.
   *  NEVER hand-derived: computed, then verified by a numeric continuation probe. */
  jump: { value: number; verified: boolean };
}

export interface BranchChoice {
  /** "principal" pins to the C99/Kahan convention of @cas/expr; "custom" uses cuts[] */
  convention: "principal" | "zeroToTwoPi" | "custom";
  branchPoints: BranchPoint[];
  cuts: CutArc[];
  basePoint: Complex;
  /** chosen lift θ_k(z₀), one per branch point, radians */
  baseLift: number[];
  /** integer sheet stamp applied on top of everything */
  sheet: number;
  /** true ⇒ cuts are the shadows of basePoint and `cuts` is ignored (§2.3) */
  shadowMode?: boolean;
}

export interface ContourSegment {
  /** pins the argument limit instead of geometrically offsetting the path (§3.3) */
  side?: "above" | "below";
  /* … geometry … */
}
```

**Algorithms, in the order to build them.**

| # | algorithm | where | notes |
|---|---|---|---|
| 1 | `validateCutSystem(BranchChoice) → Diagnostic[]` | CPU, pure | the §2.1 rule; live in the editor |
| 2 | `computeJumpWeights(BranchChoice)` | CPU, pure | subtree sums, then **verify each numerically** before use |
| 3 | `liftAlongPath(contour, branchPoints) → θ_k[]` | CPU | §3.1 quotient trick + $\pi/4$ step control; produces the **answer** |
| 4 | `cutCorrection(z)` | CPU + GLSL twin | §5.2 crossing count; produces the **picture** |
| 5 | `cargCut / clogCut / cpowCut` | CPU + GLSL twin | rotatable ray; `theta0 = π` must equal principal exactly |
| 6 | `shadowCuts(basePoint, branchPoints)` | CPU | §2.3, free |
| 7 | `unwindingNumber(z)` | CPU | §1.1, for the explanation panel |

**Serialisation.** Reuse the `#vs=` view-state codec (`packages/interchange/src/viewstate.ts`,
`encodeViewState("ci", state)`), which already guarantees unknown-field preservation and
forward-compatible `v`. Serialise a `BranchChoice` as a **diff against the named convention** so the
common case is a few bytes: `{c:"2pi"}` for the keyhole preset, and only `{c:"custom", bp:[…],
cuts:[[from,to,[…via]]], z0:[x,y], lift:[…], s:0}` when the user has actually dragged something.
Quantise coordinates to ~6 significant figures. For cross-app hand-off, add
`branch: "principal-c99" | "zero-2pi" | "custom"` to `Conventions` in
`packages/interchange/src/schema.ts` (which already carries `contour: "standard" |
"suppressed-2pii"`) and bump `VERSION`; ADR-0006 requires the tag to be *on the wire*, not inferred.

**How it affects the answer, not just the picture.** This is the part to get right.

- For a **closed** contour lying in $\hat{\mathbb{C}}\setminus\Gamma$, the value of $\oint f$ depends
  on the branch choice only through the global `sheet` stamp — a factor $e^{2\pi i\alpha s}$. Cut
  *geometry* is invisible to the answer.
- The moment a dragged cut **crosses the contour**, that hypothesis fails and the answer jumps by the
  monodromy factor. The app must detect this, refuse or announce it, and show the factor. This is the
  central pedagogical claim of the whole track: *a cut is a free choice right up until you fix a
  contour, and then it is not.*
- The keyhole's $(1-e^{2\pi i\alpha})$ **is** the monodromy factor. Choosing $\arg\in(-\pi,\pi]$ does
  not merely relabel the picture; it destroys the derivation.
- Honest labelling (CLAUDE.md): residue arithmetic under a stated convention is `=`; numerically
  continued quadrature is `≈`; and **every exported result carries its branch convention line.** A
  result whose convention is non-default must say so at the point of display, not in a tooltip.

---

## 9. Top implementation risks

1. **Sign and orientation errors in `jump` and the crossing count.** Invisible, and they produce a
   plausible-looking wrong picture. Mitigation: never trust the derived weight — verify each arc with
   a numeric continuation probe at build time and refuse to render an unverified cut system.
2. **CPU/GPU divergence.** The `@cas/expr` ↔ GLSL parity guarantee rests on the formulas being kept
   *textually identical* (`packages/expr/test/complexParity.test.ts`). Any new branch helper needs a
   JS reference, a GLSL twin, **and** a `DUAL_BACKEND_CORPUS` entry, or it silently desyncs — exactly
   the failure `emitPow`'s integer-exponent folding was written to prevent. Browser tolerances:
   `2e-6`, relaxed to `5e-3` for transcendentals under SwiftShader.
3. **Signed zero does not survive the GPU.** Do not make it the primary side-selector; use the
   explicit `side` tag (§3.3) and treat signed zero as a CPU-only nicety.
4. **Near-branch-point evaluation.** Catastrophic cancellation plus unbounded angular rate. Mitigate
   with the $|\Delta\theta|\le\pi/4$ step rule and a hard $r_{\min}$ guard that *reports* rather than
   silently clamps.
5. **Invalid cut systems.** Self-intersections, arcs not ending at branch points, bounded log cuts,
   components with non-integer exponent sums. Needs a live validator with a visible invalid state.
6. **Scope creep into algebraic functions.** $w^n=R(z)$ needs root tracking, Puiseux and monodromy —
   a different program. The §0 closed class covers the entire v1 gallery; hold the line.
7. **Reusing the wrong precedent.** `orbitTree.ts`'s `label` is an `atan2` sort order the file itself
   flags as provisional near cusps, and `docs/RISKS.md` §3 marks correspondence branch continuation
   uncertified. Borrow its *discipline* (algebraic deflation over numeric matching; cold seeds over
   warm ones; `=`/`≈` labelling) — not its labelling scheme.

---

## Sources

- W. M. Kahan, *Branch cuts for complex elementary functions, or much ado about nothing's sign bit*, in **The State of the Art in Numerical Analysis** (Iserles & Powell, eds.), OUP 1987, 165–211. Scan: <https://people.freebsd.org/~das/kahan86branch.pdf>
- R. M. Corless & D. J. Jeffrey, *The unwinding number*, **ACM SIGSAM Bulletin** 30(2), 1996, 28–35. <https://dl.acm.org/doi/10.1145/235699.235705> · <https://faculty.e-ce.uth.gr/akritas/CE102/p28-corless.pdf>
- R. M. Corless, J. H. Davenport, D. J. Jeffrey, S. M. Watt, *"According to Abramowitz and Stegun", or arccoth needn't be uncouth*, **ACM SIGSAM Bulletin** 34(2), 2000, 58–65. <https://www.uwo.ca/apmaths/faculty/jeffrey/pdfs/couth.pdf> · <https://dl.acm.org/doi/10.1145/362001.362023>
- R. J. Bradford, R. M. Corless, J. H. Davenport, D. J. Jeffrey, S. M. Watt, *Reasoning about the elementary functions of complex analysis*, **Annals of Mathematics and AI** 36 (2002) 303–318; AISC 2000, LNCS 1930. <https://link.springer.com/chapter/10.1007/3-540-44990-6_9>
- F. Chyzak, J. H. Davenport, C. Koutschan, B. Salvy, *On Kahan's Rules for Determining Branch Cuts*, SYNASC 2011. <https://arxiv.org/abs/1109.2809>
- M. England, E. Cheb-Terrab, R. Bradford, J. H. Davenport, D. Wilson, *Understanding Branch Cuts of Expressions*, 2013. <https://arxiv.org/pdf/1304.7223> · <https://matthewengland.coventry.domains/Conferences/UW.pdf>
- M. England et al., *Branch Cuts in Maple 17*, 2013. <https://arxiv.org/pdf/1308.6523>
- J. H. Davenport, *Series Crimes*, 2012. <https://arxiv.org/abs/1203.5846>
- D. J. Jeffrey, *Branch cuts and Riemann surfaces*, 2023. <https://arxiv.org/abs/2302.13188>
- H. Aslaksen, *Can your computer do complex analysis?* <https://faculty.e-ce.uth.gr/akritas/CE102/cacas-2.pdf>
- Python `cmath` documentation — branch cuts and signed zeros (C99 Annex G / Kahan). <https://docs.python.org/3/library/cmath.html>
- ISO/IEC 9899:1999 (C99) Annex G, IEC 60559-compatible complex arithmetic. <https://busybox.net/~landley/c99-draft.html> · cppreference `catanh`/`casin`: <https://en.cppreference.com/c/numeric/complex/catanh>
- J. D. Cook, *Branch cuts for elementary functions* (2022) and *Couth and uncouth function pairs* (2026). <https://www.johndcook.com/blog/2022/09/06/branch-cuts-for-elementary-functions/> · <https://www.johndcook.com/blog/2026/05/21/couth-and-uncouth-function-pairs/>
- Wolfram Language `ArcCot` reference (cut from $i$ to $-i$; range $(-\pi/2,\pi/2)\setminus\{0\}$). <https://reference.wolfram.com/language/ref/ArcCot.html> · MathWorld *Inverse Cotangent*: <https://mathworld.wolfram.com/InverseCotangent.html>
- Wolfram Language 12, *Identify Jumps and Cuts* (`ComplexPlot`). <https://www.wolfram.com/language/12/complex-visualization/identify-jumps-and-cuts.html>
- Wolfram Function Repository, `UnwindingNumber`. <https://resources.wolframcloud.com/FunctionRepository/resources/UnwindingNumber/>
- P. Smolen, `TradeIdeasPhilip/riemann-surfaces` (auto-relocating branch cuts, TS/Vite). <https://github.com/TradeIdeasPhilip/riemann-surfaces> · live: <https://tradeideasphilip.github.io/riemann-surfaces/>
- F. Zigunov, *Interactive Branch Cuts of Complex Functions* (draggable cut rotation). <https://3dfernando.github.io/BranchCut.html>
- J. Orloff, *Complex Variables with Applications* §10.4, "Integrands with branch cuts" (keyhole worked examples). <https://math.libretexts.org/Bookshelves/Analysis/Complex_Variables_with_Applications_(Orloff)/10:_Definite_Integrals_Using_the_Residue_Theorem/10.04:_Integrands_with_branch_cuts>
- Wikipedia, *Methods of contour integration* (keyhole, $\log^2$ and residue-at-infinity examples). <https://en.wikipedia.org/wiki/Methods_of_contour_integration>
- A. Kovalev, *The keyhole contour*. <https://www.dpmms.cam.ac.uk/~agk22/keyhole.pdf> · UCSD Math 120B lecture 8: <https://mathweb.ucsd.edu/~jmckerna/Teaching/19-20/Spring/120B/l_8.pdf>
- Bristol MATH30800, *Contour integration in the presence of branch cuts*. <https://people.maths.bris.ac.uk/~mayt/MATH30800/2012/handouts/branchCuts.pdf>
- B. Deconinck & M. van Hoeij, *Computing with plane algebraic curves and Riemann surfaces: the algorithms of the Maple package `algcurves`*; B. Deconinck & M. S. Patterson, *Computing the Abel map*. <https://depts.washington.edu/bdecon/papers/pdfs/abel.pdf> · <https://depts.washington.edu/bdecon/papers/pdfs/RSbook.pdf>
- *The Newton–Puiseux algorithm and effective algebraic series*. <https://arxiv.org/pdf/2209.00875>
- S. Timmerman et al., *A Robust Numerical Path Tracking Algorithm for Polynomial Homotopy Continuation*. <https://arxiv.org/pdf/1909.04984>
- *GPU-based visualization of domain-coloured algebraic Riemann surfaces*. <https://arxiv.org/abs/1507.04571>
- S. Kivelä, *On the visualization of Riemann surfaces*, **The Mathematica Journal**. <https://content.wolfram.com/sites/19/2011/01/Kivela.pdf>
- R. M. Corless & D. J. Jeffrey, *Graphing elementary Riemann surfaces*, ACM SIGSAM. <https://dl.acm.org/doi/pdf/10.1145/294833.294839>
- R. Reusser, `glsl-domain-coloring` and *Domain Coloring with Adaptive Contouring*. <https://github.com/rreusser/glsl-domain-coloring> · <https://observablehq.com/@rreusser/adaptive-domain-coloring>
- H. Haber, *The complex inverse trigonometric and hyperbolic functions* (UCSC Physics 116A notes). <https://scipp.ucsc.edu/~haber/ph116A/arc_11.pdf>
