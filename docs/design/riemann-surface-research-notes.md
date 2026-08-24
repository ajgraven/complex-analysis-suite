# Riemann-surface rendering — research notes & ground-truth corpus

> Companion to [`riemann-surface-plan.md`](riemann-surface-plan.md). The *why*, the literature, the
> algorithm choices, and the golden values the tests pin. Sources are cited inline.

## 1. Visualization paradigms

The graph of `w = f(z)` lives in ℝ⁴ = (Re z, Im z, Re w, Im w); every tool picks a **3-of-4 projection**
plus color. The two axes are always (Re z, Im z) — the base plane. The vertical axis is a real coordinate
that **separates the sheets** — Jeffrey (2023) names it the *charisma*: `Re w` gives interlocking
algebraic sheets, `Im w` gives the log helicoid. Color is chosen independently (domain coloring of the
value w). The single-sheet special case (height = `|f|`, color = `arg f`) is Wolfram's **ComplexPlot3D**;
the plotter's existing analytic landscape already occupies it.

## 2. Constructing the true surface

### 2.1 Parametrize-by-w (the M0/M1 method)

If `w = f(z)` is multivalued but its inverse `z = g(w)` is single-valued, sample a regular grid in the
**w-plane** and plot `(Re g(w), Im g(w), charisma(w))`. The w-domain is one connected sheet, so the
surface's sheets glue automatically — **no branch tracking, no cut healing, no monodromy bookkeeping.**
Applies to exactly the primitives with a known single-valued inverse:

| `w = f(z)` | `z = g(w)` | sheets | natural height |
|---|---|---|---|
| √z | w² | 2 | Re w |
| z^{1/n} | wⁿ | n | Re w |
| z^{p/q} | w^{q/p} | q | Re w |
| log z | eʷ | ∞ (spiral) | Im w |
| arcsin z | sin w | ∞ | Re w |
| arccos z | cos w | ∞ | Re w |
| arctan z | tan w | ∞ | Re w |

Sources: Corless & Jeffrey; Trott, *The Return of the Riemann Surface* (Mathematica Journal 2008)
<https://www.mathematica-journal.com/2008/11/14/the-return-of-the-riemann-surface/>; Wolfram
`RiemannSurfacePlot3D` <https://resources.wolframcloud.com/FunctionRepository/resources/RiemannSurfacePlot3D>;
Jeffrey, *Branch Cuts and Riemann Surfaces* <https://arxiv.org/abs/2302.13188>.

### 2.2 Algebraic-curve triangulation (M2, deferred)

For algebraic composites reducible to `P(z,w)=0` (+−×÷, integer/rational powers, rationals): triangulate
the z-domain, solve all `n = deg_w P` roots per vertex, stitch each domain triangle's `3n` root values
into `n` surface triangles by **nearest-root proximity**, adaptively subdivide where the **w-discriminant**
`disc_w P(z)=0` (the exact branch-point locus), and drop triangles containing a ramification point
(leaving holes that shrink with depth). Height = `Re w`; lift the domain-coloring image as texture. Cuts
never render as walls — they simply don't exist in the glued mesh. Nieser–Poelke–Polthier / Kranich,
*GPU-based visualization of domain-coloured algebraic Riemann surfaces* <https://arxiv.org/abs/1507.04571>.
The suite already has the exact tools: `@cas/exact` `discriminant`/`resultant` (Bareiss) and `@cas/core`
`rootsMonic` / Durand–Kerner.

### 2.3 Transcendental composites (no finite sheet count)

`log(sin(√z))` etc. have no global inverse and infinitely many sheets. Honest fallback: the
principal-branch landscape / domain coloring, explicitly labeled; an optional local monodromy explorer
(M3) teaches the branch structure without a full mesh. Trott truncates log to a finite `LogSheets`.

## 3. Branch points, cuts, conventions

### 3.1 Detection (composed over the AST)

- `√g(z)` / `g(z)^{1/n}`: zeros of `g` (odd multiplicity for √); ∞ if the total degree is fractional.
- `log g(z)`, `g(z)^a` (a∉ℤ): zeros **and** poles of `g`.
- `arcsin`/`arccos`: `±1`. `arctan`/`arccot`: `±i`.
- rational `P/Q`: **no branch points** — only poles at `Q=0` (do not glue around a pole).
- `exp`, `sin`, `cos`, `tan` (forward): single-valued — no cuts (their multivaluedness is in the inverse).
- algebraic `P(z,w)=0`: zeros of `disc_w P(z)` (and leading-coefficient zeros / ∞).

### 3.2 Monodromy / sheet counts

√z → 2 sheets, transposition (1 2); z^{1/n} → n-cycle; z^{p/q} (lowest terms) → q sheets, phase winds p×;
log → ℤ sheets, shift k↦k+1 (the helicoid never closes); algebraic → n sheets, product of local
ramification cycles.

### 3.3 Principal-branch cuts (DLMF)

`log z`: cut on `(−∞, 0]`, principal `−π < ph z ≤ π`. `z^a`, `√z`, `z^{1/n}`: cut on `(−∞, 0]`.
`arcsin`/`arccos`: cuts on `(−∞,−1] ∪ [1,∞)`. `arctan`/`arccot`: cuts on the imaginary axis outside `[−i,i]`.
Sources: DLMF §4.2 <https://dlmf.nist.gov/4.2>, §4.23 <https://dlmf.nist.gov/4.23>. A composite inherits
cuts from every multivalued sub-node, so the evaluation order matters — the parametrize-by-w method
sidesteps this for the single-primitive case by never sampling the z-plane.

## 4. Coloring (Wegert)

Color by `arg f` (phase); an analytic f is determined by its phase portrait up to a positive scalar.
Enhanced portraits add isochromatic (equal-phase) stripes + **log-spaced** modulus contours + a conformal
chessboard. Zeros wind the hue wheel CCW, poles CW, order-n multiplies the winding n×. Prefer
perceptually-uniform ramps (M3). The plotter's `colorAt` already implements this shared scheme, so the
Riemann surface inherits it for free. Wegert, *Visual Complex Functions* (Springer 2012)
<https://link.springer.com/book/10.1007/978-3-0348-0180-5>.

## 5. Golden values the tests pin

- **√z (g(W)=W²), height = Re W.** `W=(1,0) → z=(1,0), h=+1`; `W=(−1,0) → z=(1,0), h=−1`: same z, opposite
  height ⇒ the two sheets meet over `z=1`. `W=(0,0) → z=(0,0)`: the branch point. Reflection `W↦−W` fixes
  `z` and negates `h` (two-sheet symmetry).
- **log z (g(W)=e^W), height = Im W.** `W=(0,0) → z=(1,0), h=0`; `W=(0,2π) → z=(1,0), h=2π`: same z,
  height +2π ⇒ one turn of the helicoid; `Im W` is monotone in the turn index (the ramp never closes).
- **z^{1/3} (g(W)=W³), height = Re W.** three W with `arg` differing by `2π/3` map to the same z at three
  heights ⇒ 3 sheets.
- **CPU↔GPU parity.** `makeComplexFn(inverseAst)` and `compileF(inverseAst)` must agree (the dual-backend
  contract) — checked to float32 tolerance on a sample grid.

## 6. Tools surveyed (UX)

Kranich (the M2 blueprint); Wolfram ComplexPlot3D / RiemannSurfacePlot3D (defaults, "small cuts not
walls"); Reusser's adaptive domain coloring (screen-space-derivative crisp contours, our WebGL stack)
<https://observablehq.com/@rreusser/adaptive-domain-coloring>; Ponce Campuzano
<https://www.dynamicmath.xyz/> and cplot <https://github.com/nschloe/cplot> (coloring menu,
perceptually-uniform color). Pitfalls: unlabeled vertical cliffs at cuts (the #1 error — parametrize-by-w
avoids it by construction); z-fighting on coplanar sheets (use Re/Im-w height so sheets separate
vertically); the `atan2` seam; pole blow-up (clamp/compress + label); unlabeled truncation/approximation
(violates the guardrail).
