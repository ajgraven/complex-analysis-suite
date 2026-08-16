# Faber Transform Visualizer — Roadmap: arbitrary inputs & richer visualization

> Follow-up to `faber-transform-plan.md` (the shipped v1, merged in #268). Scopes two author requests:
> **(1)** render the image only on the bounded complement $K$; **(2)** support **arbitrary analytic
> inputs** (starting with arbitrary rational) and **multiple visualization modes** beyond basic domain
> coloring. This is a proposal — decisions marked **◇** are open (see the end).

## Where v1 stands

- **Inputs:** monomial $z^n$ (→ $F_n$, exact), a single pole $1/(z-z_0)^k$, $k\in\{1,2\}$ (→ closed-form
  rational image, exact), and free-form $f$ via `@cas/expr` (→ truncated Faber series $\sum_{n\le N}b_nF_n$,
  `≈`).
- **Rendering:** GPU phase portrait on the shared `@cas/gpu` `PHASE_COLORING_GLSL` (one rational
  `num(z)/den(z)` kernel), over the whole panel; ∂K + convergence equipotential $\Gamma_R$ overlays;
  Faber-root markers; per-panel pan/zoom.

## 1. Render on the bounded complement $K$ (request 1) — DONE

**Decision (author):** mask **strictly to the interior of $K$**, always; **drop $\Gamma_R$**. The right panel
now composites a $\partial K$ clip on its overlay (fill background, punch out $\partial K$ for the GPU
portrait / keep-inside for the CPU fallback), so $\Phi_\varphi(f)$ shows only inside $\partial K=\varphi(\{|z|=1\})$.
The equipotential curve is gone (the render sits well inside the convergence region, so the truncation is
where it converges fastest; $R$ is still reported in the readout text). The **interval** preset is
degenerate under this rule ($K$ is a slit) — hidden from the domain menu (kept for the Chebyshev test), and
the default domain is now the **deltoid**. Verified in-browser (deltoid $F_3$ inside $K$, outside masked).

Design notes retained below.



$\Phi_\varphi(f)\in\mathcal{A}(K)$, so the right panel should mask to $K$ rather than paint the whole
plane. **Implementation is cheap and needs no shader change** — composite on the 2-D overlay canvas: fill
it with the panel background, then punch out the $\partial K$ polygon (`globalCompositeOperation =
"destination-out"`) so the GPU portrait shows through **only inside $\partial K = \varphi(\{|z|=1\})$**;
draw axes/∂K/roots on top. `∂K` is already computed (`mapCircle(map, 1)`).

The **degenerate interval** ($K=[-2,2]$, empty 2-D interior) and the **entire-image** case (a monomial's
$F_n$ is defined on all of $\mathbb{C}$) are where "inside $K$" and "where the image is analytic" diverge —
that's the **◇ question at the end**, and it decides the exact mask. Once masked to $K$, the render sits
strictly inside the convergence region, so the truncation is shown only where it is most accurate and the
"divergent outside $\Gamma_R$" region disappears — the $\Gamma_R$ curve's warning role is superseded (keep
it as a faint reference, or drop it — **◇**).

## 2. Arbitrary **rational** input, exactly (the near-term win) — DONE

Implemented in `@cas/faber`: **`faberImageOfPole` now handles arbitrary order** (the residue formula
`terms[k−1] = [s^{m−1}](Φ(s)^{k−1}Φ'(s))`, only truncated-series multiplies), and
**`faberTransformRational(map, num, den)`** partial-fractions any $f=p/q$ (polynomial long division +
clustered-root multiplicities + series-division residues) and assembles the exact rational image
$N(w)/D(w)$, throwing if a pole is on/inside the unit disk. The app's **free-form input auto-detects a
rational $f$** (via `@cas/expr`'s `fToRational`) and routes to this exact path (`=`), falling back to the
truncated series (`≈`) for transcendental $f$ and to a `⚠` for a pole inside the disk. 33 `@cas/faber`
tests (single/double/arbitrary-order poles, sums, polynomial part vs series, guards) + app tests; verified
in-browser (`(z+1)/((z−2)(z−3))` → exact, poles at $\varphi(z_j)$ outside $K$; `1/(z−2.2)^3` → exact;
`exp(z)` → `≈`; `1/(z−0.5)` → `⚠`).

Design notes below.



Generalize the exact path from "one pole" to **any rational** $f=p/q$ analytic on the disk (all poles
$|z_j|>1$), with **no truncation** — a `=` result for the whole rational family:

1. **Decompose.** `@cas/expr`'s `fToRational(f)` already returns ascending `num`/`den` polynomials (or
   `null`). Factor $q$ (roots via `@cas/faber`'s `polynomialRoots` / Durand–Kerner — already there),
   validate every pole $|z_j|>1$ (else $f\notin\mathcal{A}(\mathbb{D})$ → warn), and partial-fraction into a
   **polynomial part** $+\ \sum_j\sum_{k=1}^{m_j} a_{jk}/(z-z_j)^k$.
2. **Transform term-by-term, exactly.**
   - polynomial part $\to$ via the Faber polynomials ($\sum b_nF_n$, finite — already `faberTransform`);
   - each pole term $1/(z-z_j)^k \to$ the closed-form image with pole at $\varphi(z_j)\in\Omega$.
3. **Sum** $\to$ one exact rational $N(w)/D(w)$, evaluated by the existing GPU `num/den` kernel.

**New `@cas/faber`:** generalize `faberImageOfPole` from order $\le 2$ to **arbitrary order $m$** (the
image of $1/(z-z_0)^m$ is $\sum_{j=1}^{m}$ (Bell-polynomial in $\varphi',\dots,\varphi^{(j)}$)$/(w-\varphi(z_0))^j$
— a Faà-di-Bruno expansion of $\Phi_\varphi$, built on the derivative jet we already compute), plus a small
`partialFractions` helper (or lift `@cas/core`'s). This **subsumes the current pole mode** and makes the
UI's "pole" input just a special case of "type any rational $f(z)$".

## 3. Arbitrary **analytic** input (the general case) — DONE

Accuracy + honesty for the free-form path, both feeding the same truncated Faber sum $\sum_{n\le N}b_nF_n$:
- **Exact coefficients (`src/series.ts`).** A power-series (Taylor-mode) evaluator walks the `@cas/expr` AST
  in the ring $\mathbb{C}[[z]]/(z^{N+1})$: every node maps to a coefficient array, and
  `exp`/`log`/`sin`/`cos`/`tan`/`sinh`/`cosh`/`tanh`/`sqrt`/powers each carry an exact recurrence, so $b_n$
  come out exact to floating point — **no sampling, no aliasing, no noise floor**. This subsumes "symbolic
  Taylor for the standard library" and goes further: *any composition* of the supported operations is exact
  (e.g. `exp(z)/(z−3)` is handled in closed form, $R$ auto-detected). Returns `null` — deferring to the FFT
  — for a construct without an exact rule (special functions, the non-analytic `re`/`im`/`abs`/`conjugate`,
  comparisons/`if`, or a `log`/`sqrt`/reciprocal on a zero constant term).
- **Adaptive sample radius (`taylorAdaptive`).** The FFT fallback probes at $r=0.9$, estimates $R$, and
  re-samples at Bornemann's optimum $r^*=R\,\varepsilon^{1/M}$ — pushing the circle toward the nearest
  singularity ($r^*$ may exceed 1), balancing aliasing $\sim(r/R)^M$ against the roundoff amplification
  $\sim\varepsilon(R/r)^N$ that wrecks the high-order tail at a fixed small radius. Entire $f$ keeps the probe.
- **Domain honesty:** with request 1 masking to $K$ (well inside $\Gamma_R$), the shown region is where the
  truncation converges fastest — the `≈` is trustworthy by construction; the readout labels which path
  produced the coefficients (`exact Taylor coefficients` vs `coefficients by adaptive FFT sampling`).
- **Detect rational → route to §2** automatically (exact when `fToRational` succeeds), so the user just
  types $f(z)$ and gets the exact rational image whenever it is available.

## 4. Visualization modes beyond domain coloring

The shared `@cas/gpu` `PHASE_COLORING_GLSL` **already supports most of these via uniforms the app currently
hardcodes** — exposing them is nearly free:

- **4a — Coloring controls (cheap; shader-ready) — DONE (Phase A).** A `ColoringOptions` block now drives
  both the GPU renderer and the CPU fallback, exposed as UI toggles: the enhancement overlay (**none /
  modulus rings / phase sectors / conformal grid / polar chessboard / Re/Im grid**, `uEnhance`), the
  modulus→lightness transfer (**constant / linear / rational / log / log-log**, `uModulus`/`uModScale`),
  an overlay **density** (`uSectors`, sector/grid modes only), and **crisp-vs-shaded lines** (`uCrisp`).
  `render/coloring.ts` ports the shaded (non-`fwidth`) GLSL branches so the two paths agree; the block
  rides the serializable view-state (guarded + back-filled) and round-trips in the `#vs=` permalink.
  Still hardcoded / deferred (no UI yet): hue rotation/reflection, level-set contours $|f|=c$/$\arg f=c$
  (`uLevelAbs`/`uLevelArg`), the CVD preview, the uncertainty hatch.
- **4b — 3-D analytic landscape.** $|\Phi_\varphi(f)|$ as height over $K$, colored by $\arg$ (the same
  `colorAt`). **Extract the plotter's `render3d/surfaceShader` into `@cas/gpu`** (ADR-0007 second consumer:
  plotter + Faber), then consume it. A rotatable surface — the natural "see the poles/zeros as
  peaks/funnels" view.
- **4c — Riemann sphere.** Stereographic view of $\Phi_\varphi(f)$; extract the plotter's `sphereShader`
  alongside 4b.
- **4d — Contour / level-set mode.** Pure $|\Phi_\varphi(f)|$ or $\arg$ contour lines (grayscale or on a
  faint hue) — already expressible via the level-set + enhancement uniforms.
- **4e — Conformal-grid transport.** Overlay $\varphi(\text{polar grid on }\mathbb{D}^*)$ — the geometry of
  the exterior map that *defines* the transform — so the coordinate flow into $K$ is visible, not just the
  colors. Uses `evalPhi` (already present); pure 2-D overlay.
- **4f — Vector field / streamlines (optional).** $\Phi_\varphi(f)$ as a field with integral curves.

## 5. Extractions & packaging (ADR-0007)

- `@cas/faber`: `faberImageOfPole` → arbitrary order; `faberTransformRational(map, num, den)` (partial
  fractions + exact assembly); keep the `{c, laurent}` contract.
- `@cas/gpu`: expose the coloring uniforms through a small typed options object; **extract the plotter's
  `render3d` (surface + sphere)** as a shared module (plotter becomes its second consumer, green
  before/after — same playbook as the M1.5 `colorAt` lift).

## 6. Suggested phasing

- **Phase A — render-on-$K$ + coloring controls (4a) — DONE.** Request 1 (mask to $K$), plus the
  enhancement / modulus-transfer coloring toggles surfaced from the shared shader. (Level-set contours,
  hue rotation, CVD, and the uncertainty hatch are left in the shader for a later pass.)
- **Phase B — arbitrary rational, exact (§2).** The `@cas/faber` order-$m$ + partial-fraction work; the
  "pole" UI mode becomes "type any rational."
- **Phase C — 3-D surface + Riemann sphere (4b, 4c).** Extract the plotter's `render3d` into `@cas/gpu`.
- **Phase D — conformal-grid transport (4e), streamlines (4f), polish.** *(Arbitrary-analytic accuracy §3
  is DONE — the exact power-series evaluator + adaptive-radius FFT landed alongside Phase A.)*

## Open decisions ◇

- **The $K$-boundary (request 1).** For a fat domain with $f$ analytic on exactly the disk, "inside $K$" and
  "where the image is analytic" coincide (the interior of $K$). They diverge in two cases that decide the
  mask: the **interval** ($K$ is a slit — empty interior, but the image is analytic on the Bernstein-ellipse
  region), and a **monomial** (image $F_n$ is entire — defined everywhere, though its roots cluster on $K$).
  → asked separately.
- **$\Gamma_R$ once masked to $K$:** keep as a faint reference or drop.
- **Viz priority:** which of 4a–4f first (my default: 4a now, 4b/4c next).
- **Arbitrary analytic:** ~~is the truncated series enough, or is symbolic/enhanced coefficient extraction
  wanted?~~ **Resolved (§3): both** — an exact power-series evaluator for the closed-form analytic library
  and an adaptive-radius FFT for everything else.
