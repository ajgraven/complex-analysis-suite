# Prior art: interactive tools for complex integration

Research track 1 for `apps/contour-integration`. Surveyed 2026-09-10. Where a tool was
reachable it was driven hands-on in a browser, not just read about; those sections are
marked **(hands-on)**.

---

## 1. The nearest neighbour: Samuel J. Li, *Complex Function Plotter* **(hands-on)**

`samuelj.li/complex-function-plotter` (source: `wgxli/complex-function-plotter`, GPL-3.0,
React + WebGL, ~69 stars, live since 2018). This is the only web tool found that ships
**"computation of arbitrary contour integrals and residues"** as a headline feature, so it
is the direct incumbent.

*What it does.* Expression bar at top (`1/z`, `zeta(z)`, `wp(z, tau)`, elliptic/modular
functions, `sum`/`product`/`derivative` higher-order forms). The whole plane is
domain-coloured in a fragment shader: hue = arg, brightness cycles dark→light with
`|f|`, jumping at every power of two, so "edges" are `|f| = 2^n` contours. Toggles for
checkerboard (re/im), inverted gradient, continuous vs stepped magnitude, axes. User
variables get sliders with editable bounds and an animate button. Full plot state is
encoded in the URL. An escape hatch lets you write raw GLSL (`vec2` complex, `cmul`,
`cdiv`, `csin`, `C_PI`).

*Contour UI.* A "Contour Integrals" section with three radio modes: **Freeform**,
**Freeform (Closed Loop)**, **Circular Contour**. Select a mode, the plot dims and prints
"Click and drag to draw a contour", you drag once, and a MathJax-rendered callout appears
beside the curve: `∫_γ f(z) dz = …`. It prettifies exact-looking answers — a circle
centred on the pole of `1/z` printed literally `∫_γ f(z) dz = 2πi`, not `6.28319i`.

*Where it stops short — and this is the important part.* The drag defines a **diameter**,
not centre-and-radius, which is unguessable. Drawing a circle whose rim passed through
the pole of `1/z` produced `∫_γ f(z) dz = 6.71197 + 0.46361 i` — confidently wrong to six
significant figures, with no warning that the contour was singular. A second, smaller
circle not enclosing the pole printed a flat `= 0` (plausible but equally uncaveated).
Beyond that: the contour is **one-shot and non-persistent** — after the drag the mode
resets, the curve cannot be grabbed, re-dragged, or deformed, and there is no second
contour to compare against. Nothing is shown *accumulating*: no partial integral, no
winding number, no per-pole residue breakdown, no relation between the drawn loop and the
`2πi Σ Res` it equals. Branch cuts are invisible: `sqrt`/`log` are drawn with whatever cut
the shader happens to produce and there is no cut overlay, no cut-dragging, no warning
when a contour crosses one. The help itself concedes "custom functions and some of the
more intricate built-in functions are not yet supported" for integration. A hover readout
(`z = 0.323 + 0.067 i`, `f(z) = 2.963 − 0.617 i`) in the corner is the one piece of live
feedback and it is good.

**Verdict: this is the bar, and it is a low bar.** It proves the core gesture works and
that GPU colouring plus drawn contours is the right substrate. It fails exactly where our
locked design answers say we should be strong: persistence/deformability, honest
labelling, residue decomposition, branch cuts.

## 2. Teaching explorables: Ponce Campuzano, `complex-analysis.com` **(hands-on)**

The most complete free interactive complex-analysis text. CC BY-NC-SA, source at
`complex-analysis/complex-analysis.github.io` (231 stars), English/Spanish/Italian, with
applets in four stacks: **GeoGebra**, **p5.js**, **CindyJS/CindyGL**, **MathCell**.
Inspecting the DOM of `content/complex_integration.html` confirms the integration applets
are GeoGebra materials (`deployggb.js`, materials `uye8xbbj`, `am4gsavs`).

The integration chapter offers two explorations: `∫_C z̄ dz` and `∫_C (z²+z) dz` /
`∫_C dz/z²`, each with a **fixed menu of path types** — line segment, semicircle, circle
with either orientation — whose endpoints you drag, arrows marking direction, and a
domain-colouring toggle. There is a dedicated page, **Integrals of Functions with Branch
Cuts**, treating `z^(1/2)` on a semicircle from 3 to −3 and `z^i` on the upper unit
semicircle, and it explicitly invites you to "drag points… and explore what happens when
they cross the branch cut". That is the single most on-point piece of prior art for our
branch-cuts-first stance, and it is a couple of hand-built GeoGebra files.

*Limits.* The table of contents has **no residues section and no winding-number section**
— the book stops at Cauchy's integral formula, Laurent series, classification of
singularities. Paths are from a fixed menu, not free-form. GeoGebra applets are
multi-megabyte, CPU-rendered, and the hosted materials rot (the material id above 404s at
`geogebra.org/m/`). Nothing evaluates a real definite integral.

## 3. Wolfram **(hands-on where the SPA allowed)**

*Demonstrations Project.* Genuinely relevant entries exist, all frozen in the CDF era,
all CC BY-NC-SA with a downloadable `.nb`:
- **Contour Integration** (Ryan Keelty Smith, 2008) — a click-to-build expression builder
  (`f[z] : z`, `+ − * / ^`), a **"closed contour?" checkbox**, an **"integrate contour"**
  button, a **precision slider (0.1)**, a z-range and a reset. You assemble the function
  by clicking, place the contour in the z-plane, then press integrate.
- **Pólya Vector Fields and Complex Integration along Closed Curves** (Krug & Wilkinson,
  2011) — draws the Pólya field `conj(f)` along a curve and lets you toggle between the
  full field, its **tangential** component and its **normal** component, with sliders for
  vector count and length. Real part of the integral = tangential circulation, imaginary
  part = normal flux.
- **Mapping Contour Integrals** (Hayashi, 2017), **Contour Integral around a Simple Pole**
  (Blinder), **The Geometry of Integrating a Power around the Origin** (Custy).

The idiom throughout is **`Manipulate` sliders and buttons over a static plot** — no
direct manipulation of the curve, no live accumulation. They need the Cloud or a CDF
runtime, load slowly, and the project has been effectively dormant for years.

*Language.* `ContourIntegrate` / `NContourIntegrate` do the computation; `ComplexPlot` and
`ComplexPlot3D` define the de-facto colouring vocabulary worth matching:
`"CyclicLogAbs"` (constant-`|f|` bands at powers of 2), `"CyclicArg"` (constant-arg bands
at multiples of π/6), `"CyclicLogAbsArg"` for both. The convention "counterclockwise
around zeros, clockwise around poles" is the standard readers arrive with.

*Wolfram|Alpha.* Offers `residue of 1/(z^2+4)^2 at z=2i`, `show residues …`,
`Riemann surface log z`. It does **not** advertise contour integrals, and offers **no
step-by-step for residues**. Nobody, anywhere, shows the derivation.

## 4. The domain-colouring canon

- **Elias Wegert** — *Visual Complex Functions* (2012) and the phase-plot gallery at
  `visual.wegert.com`; the **Complex Beauties** calendar (14 editions, free PDFs, with
  Gorkin & Daepp) pairs each month's phase portrait with the mathematician behind the
  function. Wegert's "enhanced phase portrait" — phase colour plus iso-chromatic *and*
  iso-modulus contour overlays — is the reference rendering. Static images, no tool.
- **cplot** (Nico Schlömer, Python, GPL-3.0) — the best-argued modern convention:
  **OKLAB** rather than HSL so equal phase steps look equal, arg 0 → green, π/2 → blue,
  −π/2 → orange, π → pink; `|z| = 1` emphasised, other bands at 2, 4, 8 and ½, ¼, ⅛. Also
  plots on the Riemann sphere. Its critique of HSL streaking is directly applicable to our
  `@cas/gpu` ramps.
- **Poelke & Polthier** — *Lifted Domain Coloring* (CGF 2009) lifts the colouring off the
  plane onto the branched Riemann surface, plus *Domain Coloring of Complex Functions: An
  Implementation-Oriented Introduction* (IEEE CG&A 2012) and *Automatic Generation of
  Riemann Surface Meshes*. The academic backing for treating the cut as a chart boundary
  rather than a rendering artefact.
- **CindyJS / CindyGL** — `colorplot` gives per-pixel GPU evaluation from a
  live-editable CindyScript expression; Ponce Campuzano's live-coding and Taylor-series
  applets are built on it. The closest existing "edit the formula, the GPU plot updates
  instantly" authoring loop.
- **Open-source shaders worth reading**: `rreusser/glsl-domain-coloring` (glslify module),
  Ricky Reusser's *Adaptive Contouring in Fragment Shaders* (screen-space `fwidth` to hold
  contour lines at constant pixel width regardless of zoom — essential if we draw
  iso-bands over a deep-zoomable plane), `kisonecat/phase-plot`, `peterallenwebb/COMPLOT`
  (expression → GLSL → recompile on every keystroke), `wbolden/complex` (also dual and
  split-complex). David Bau's *Conformal Map Plotter* is the acknowledged ancestor of the
  whole genre: type `z^2`, `sin(z)`, `gamma(z)`, animate with `t`, progressive render
  (blurry sketch first, antialiased at 24 fps).

## 5. Branch cuts and Riemann surfaces

- **`TradeIdeasPhilip/riemann-surfaces`** (TypeScript + Vite, live at
  `tradeideasphilip.github.io/riemann-surfaces/`) is the single best *interaction* idea in
  this whole survey. You move `z` with the mouse and **all** `w` branches update live for
  `w² = z`, `e^w = z` (5 of infinitely many sheets), and `w³ − zw − 2 = 0` (three branch
  points). Click to pin a point and continue the path; **hold the button to record the
  entire path**; branch points render as brown dots and **the app silently repositions the
  branch cuts as you save points so continuation stays smooth**. Tiny project, 2 stars,
  but that "cuts move out of your way as you continue" behaviour is exactly what a
  branch-cut-first contour tool needs, and nobody else does it.
- **`analyticphysics.com` Three.js pages** — stacked multi-sheet surfaces with phase
  colouring, sliders for continuous/rational exponents, and draggable branch-point
  offsets. No integration.
- **ComplexGUI** (Uluışık & Sevgi, *IEEE Antennas & Propagation Magazine*, 2012) — MATLAB.
  Explicitly built around branch points, branch cuts, principal branches and Riemann
  surfaces, and it **evaluates integrals along user-specified contours and lets you deform
  the contour onto steepest-descent paths through saddle points**. Conceptually the
  richest prior art for deformable contours; MATLAB-only, engineering-audience, no longer
  maintained, and effectively invisible to students.
- **Wolfram** `RiemannSurfacePlot3D` / `Riemann surface log z`, Maple's `algcurves`
  package, and the GPU algebraic-Riemann-surface work (arXiv 1507.04571) are the
  heavyweight offline options.

## 6. How derivations get presented (the closed-form half of our app)

Nothing in the complex-analysis world presents a residue derivation. The transferable
craft is all from real integration:

- **integral-calculator.com** is the model. A Shunting-yard parser client-side renders
  your input as LaTeX via MathJax *while you type*, with a red underline on syntax error;
  the server hands the expression to Maxima; and — crucially — the steps come not from the
  Risch algorithm but from a **separate 17 000-line rule engine written in Maxima that
  applies the techniques a human would apply** (partial fractions, trig substitution,
  parts), because "showing the steps of calculation is very challenging". There is a
  Practice mode that generates a random exercise, lets you accept or reroll it, and
  checks an answer you type. Interactive canvas plots (Hammer.js gestures) sit alongside.
- **Rubi** (`rulebasedintegration.org`) — 6600+ pattern-matching rules; `Steps[Int[…]]`
  returns a list of `RubiRule` / `RubiIntermediateResult` objects, and each rule carries a
  human-readable **"Derivation"** (which technique) and **"Basis"** (which identity). If
  we want an auditable residue derivation, this is the data model: a rule with a name, a
  side condition, and a citation, not a rendered string.
- **SymPy** `sympy.series.residues.residue()` computes residues by series expansion, but
  `integrate()` does **not** apply the residue theorem to real integrals — that has been a
  standing proposal for years. Maxima is similar.

## 7. Explorable-explanation idioms worth borrowing

3Blue1Brown's *Winding numbers and domain coloring* (2018) is the canonical popular
framing — and note it is a **video** with Python source, not a tool; the winding-number
idea has no good interactive home on the web. Mathigon (open-source TypeScript, now free
via Amplify) and Seeing Theory are the reference implementations of "drag, build,
experiment" over "read then click Next"; Brilliant's step-and-check loop is the
commercial version. `ubavic/awesome-interactive-math` is the best index of the
substrate layer (CindyJS, MathBox, JSXGraph, Mafs, Grafar, MathCell, Observable).

---

## 8. The gap

Every tool in this survey does exactly one of four things, and none does two:

1. **Colours the plane beautifully** (Wegert, cplot, COMPLOT, Bau, CindyGL) — but has no
   notion of a path.
2. **Integrates along a path you draw** (Li's plotter, Wolfram 2008 demo, ComplexGUI) —
   one-shot, uncaveated, no residue decomposition, no winding number.
3. **Explains branch cuts** (Ponce Campuzano's branch-cut page, `riemann-surfaces`,
   ComplexGUI) — but never connects them to an integral you are computing.
4. **Shows a derivation** (integral-calculator, Rubi) — for real integration only; nobody
   derives `∫_{-∞}^{∞} dx/(1+x⁴)` through a semicircle and `2πi Σ Res`.

So the gap is precise: **there is no tool where a contour is a first-class, persistent,
deformable object that you can watch accumulate, that knows which poles it encloses and
with what winding number, that knows where the branch cuts are and refuses to lie when you
cross one or run onto a singularity, and that can hand you the closed-form derivation for
the real integral the loop was built to evaluate.** The residue theorem is the single most
famous computation in the subject and it has no interactive home.

The secondary gap is **honesty**. Li's plotter printing `6.71197 + 0.46361 i` for a
contour through a pole is not an edge case — it is what every numerical-quadrature tool
does. Our `=` / `≤` / `≈` discipline is not a nicety here; it is the differentiator.

## 9. Measure ourselves against these three

1. **Samuel J. Li's Complex Function Plotter** — feature-for-feature the incumbent.
   We must beat it on: persistent editable contours, live accumulation, residue
   decomposition, branch-cut awareness, and error honesty. We should match it on: URL
   state, GLSL escape hatch, closed-form prettification (`2πi`), hover `z`/`f(z)` readout,
   variable sliders with animation.
2. **integral-calculator.com** — the standard for derivation display and for the
   parse-as-you-type loop. If our closed-form panel is not as legible as its step list, we
   have not shipped the feature.
3. **`TradeIdeasPhilip/riemann-surfaces`** — the standard for branch behaviour under a
   dragged path. Continuation along the drag with cuts that move out of the way is the
   behaviour to reproduce (and then to *label*, which it does not).

Honourable mention: **Wegert / cplot** for rendering convention — we should be able to say
which published convention our colouring implements.

## 10. Patterns to steal outright

- Dim the plane and print an inline instruction while a draw tool is armed (Li).
- Float the result as rendered LaTeX **beside the curve**, not in a side panel (Li).
- Recognise and print closed forms — `2πi`, `πi`, `0` — rather than decimals (Li).
- Persistent corner readout of `z` and `f(z)` under the cursor (Li).
- Whole-state-in-the-URL sharing (Li; we already have the `@cas/interchange` view codec).
- Toggleable overlays: checkerboard, stepped vs continuous magnitude, inverted gradient,
  axes (Li) — plus Wegert's iso-chromatic/iso-modulus enhancement.
- Screen-space `fwidth` contour widths so iso-bands stay one pixel at any zoom (Reusser).
- Tangential/normal decomposition toggle for the Pólya field, tying Re and Im of the
  integral to circulation and flux (Wolfram 2011). This is the best available bridge from
  vector calculus and it costs us almost nothing on top of the domain-colouring shader.
- Hold-to-record a dragged path with live multivalued output and auto-relocating cuts
  (`riemann-surfaces`).
- Deform the contour onto steepest-descent paths through saddles as a named operation
  (ComplexGUI).
- Rule objects carrying `derivation` + `basis` + side conditions, rendered rather than
  stringly-typed (Rubi); a separate human-technique engine distinct from the engine that
  gets the answer (integral-calculator).
- Practice mode: generate an exercise, accept-or-reroll, type an answer, check it
  (integral-calculator) — cheap, and it fits "sandbox + gallery" better than a tutorial.
- Fixed template paths (segment / semicircle / circle ± orientation) as *seeds* on the
  free substrate, not as the only option (Ponce Campuzano).

Anti-patterns to avoid: one-shot non-editable contours; a precision slider with no error
estimate (Wolfram 2008); a `Manipulate` wall of sliders in place of direct manipulation;
and above all printing six significant figures of a number you cannot certify.

---

## Sources

- https://samuelj.li/complex-function-plotter/ — the incumbent; drove it hands-on, source of the contour-UI and honesty findings.
- https://github.com/wgxli/complex-function-plotter — its source, GPL-3.0, verbatim feature list, React+WebGL stack.
- https://complex-analysis.com/ — Ponce Campuzano's interactive text; applet stack (GeoGebra/p5/CindyJS/MathCell).
- https://complex-analysis.com/content/table_of_contents.html — proves there is no residues or winding-number chapter.
- https://complex-analysis.com/content/complex_integration.html — the two GeoGebra integration explorations; path-type menu idiom.
- https://complex-analysis.com/content/integrals_of_functions_with_branch_cuts.html — closest existing branch-cut-and-integral teaching page.
- https://complex-analysis.com/applets/cindyjs/livecoding/ — CindyGL `colorplot` live-coding loop and enhanced-portrait iso-lines.
- https://github.com/complex-analysis/complex-analysis.github.io — licence, repo layout, applet directory structure.
- https://math.libretexts.org/Bookshelves/Analysis/Complex_Analysis_-_A_Visual_and_Interactive_Introduction_(Ponce_Campuzano)/04%3A_Chapter_4/4.02%3A_Complex_Integration — mirrored prose describing the applets' affordances.
- https://www.dynamicmath.xyz/ — Ponce Campuzano's p5.js/three.js app collection (domain colouring, Fourier epicycles).
- https://demonstrations.wolfram.com/ContourIntegration/ — 2008 Manipulate: expression builder, closed-contour checkbox, precision slider.
- https://demonstrations.wolfram.com/PolyaVectorFieldsAndComplexIntegrationAlongClosedCurves/ — tangential/normal Pólya decomposition; CC BY-NC-SA notebook download.
- https://www.wolframcloud.com/obj/dcb40bea-3aca-4b21-b23f-b99d6ffacf16 — "Mapping Contour Integrals" (2017), image-of-contour + winding-number framing.
- https://reference.wolfram.com/language/ref/ComplexPlot3D — `"CyclicLogAbs"`/`"CyclicArg"` colouring vocabulary to match.
- https://reference.wolfram.com/language/ref/ContourIntegrate — symbolic contour integration semantics and conventions.
- https://www.wolframalpha.com/examples/mathematics/complex-analysis — confirms residues yes, contour integrals no, step-by-step no.
- https://github.com/nschloe/cplot — OKLAB colouring argument, modulus bands at powers of two, Riemann sphere; GPL-3.0.
- https://users.mai.liu.se/hanlu09/complex/ — Lundmark's index; pointers to Domkol, Li's plotter, Poelke–Polthier.
- https://www.3blue1brown.com/lessons/winding-numbers — the canonical popular winding-number treatment, with Python source.
- https://blogs.hrz.tu-freiberg.de/mathekalender/english/ — Complex Beauties; Wegert's phase-portrait house style, free PDFs.
- https://link.springer.com/book/10.1007/978-3-0348-0180-5 — Wegert, *Visual Complex Functions*, the phase-portrait reference text.
- https://www.semanticscholar.org/paper/Lifted-Domain-Coloring-Poelke-Polthier/6b01ea7ed9995438cd9b1a8765c2bf1737536288 — lifting domain colouring onto branched Riemann surfaces.
- https://arxiv.org/pdf/1507.04571 — GPU visualisation of domain-coloured algebraic Riemann surfaces; WebGL/MRT feasibility.
- https://github.com/TradeIdeasPhilip/riemann-surfaces — best branch-tracking interaction found: drag `z`, live `w` branches, hold-to-record, auto-moving cuts.
- https://tradeideasphilip.github.io/riemann-surfaces/ — its live demo.
- https://analyticphysics.com/Complex%20Variables/Visualizing%20Complex%20Functions%20with%20Three.js.htm — multi-sheet three.js surfaces, draggable branch-point offsets.
- https://ieeexplore.ieee.org/document/6209520/ — ComplexGUI: contour integrals + deformation onto steepest-descent paths, branch-cut-centric.
- https://observablehq.com/@rreusser/locally-scaled-domain-coloring-part-1-contour-plots — `fwidth`-based adaptive contouring for zoom-stable iso-lines.
- https://github.com/rreusser/glsl-domain-coloring — reusable glslify domain-colouring module.
- https://github.com/peterallenwebb/COMPLOT — expression-to-shader recompilation for smooth pan/zoom.
- https://github.com/kisonecat/phase-plot — minimal expression→GLSL phase plotter with pan-zoom/dat.gui.
- http://davidbau.com/conformal — the genre's ancestor; progressive render, `t`-animated function families.
- https://cindyjs.org/ — CindyJS/CindyGL framework; GPU `colorplot` authoring model.
- https://www.integral-calculator.com/ — the derivation-display benchmark: parse-as-you-type, Maxima backend, 17k-line human-technique rule engine, Practice mode.
- https://rulebasedintegration.org/ — Rubi; `Steps[]` returning rule objects with Derivation/Basis metadata.
- https://github.com/sympy/sympy/blob/master/sympy/series/residues.py — SymPy's series-expansion `residue()`; no residue-theorem path in `integrate()`.
- https://github.com/ubavic/awesome-interactive-math — index of interactive-maths substrates (MathBox, JSXGraph, Mafs, Grafar, MathCell).
- https://mathigon.org/course/complex/arithmetic — open-source explorable-course idiom (drag/build/experiment, free).
- https://www.geogebra.org/m/N7pjBU6t — representative GeoGebra Cauchy-formula applet; the drag-the-locator idiom and its ceiling.
