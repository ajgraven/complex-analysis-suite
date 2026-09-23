# Polynomial Roots — app plan

> **Status.** A new app established by [ADR-0046](../DECISIONS.md#adr-0046). This is the **forward
> plan** — what the app is, what the literature and the repo already give it, the one design decision
> that organises it, and the milestones. **PR-0 and PR-1 are done** (see the Roadmap); nothing beyond
> them is committed, and each milestone is a separately-approved gate, green before and after
> (guardrail: working software at every step). Every
> number in §2 was measured on 2026-09-22 in Node on this container and is quoted so the plan can be
> refuted rather than trusted.

## 1. What this app is

The picture at the head of Baez, Christensen and Derbyshire's *The Beauty of Roots* (Notices AMS
70, 2023; [math.ucr.edu/home/baez/roots](https://math.ucr.edu/home/baez/roots/)): **every root of
every polynomial whose coefficients are drawn from a small finite alphabet**, painted by density.
For the Littlewood alphabet `{−1, +1}` at degree 24 that is 2²⁴ polynomials and about 400 million
roots, and the cloud is not a blur — it has holes at the roots of unity, a bright line along the
real axis, a dense ring at the unit circle, and, inside the disk, *dragon curves*: near a point `q`
the cloud looks like the attractor `D_q` of the iterated function system `{w ↦ 1 + qw, w ↦ 1 − qw}`.

The app is an **explorer plus a named gallery**, in the suite's house style:

| Surface | Content | Honesty |
| --- | --- | --- |
| The stage | The root cloud of a chosen alphabet, degree range and view: a density heat-map you pan, zoom and scrub by degree, in two engines that hand over as you zoom (§3). | `≈` — finite degree, numerical roots; the limit-set view says which |
| The dragon | Hover: `D_z` for the point under the cursor, as an inset. Click a root `α`: the Michelen–Yakir picture, `D_α` rescaled by `1/P′(α)` and laid over the actual roots. | `≈` illustration of a theorem, never a certificate |
| The probe | The polynomial(s) owning the root under the cursor, its coefficient string, the root to full float64 precision. | `≈` with a residual |
| The gallery | Named phenomena from the literature, each a permalink with a caption that cites its source. | Cited theorems read as theorems; anything about the picture reads `≈` |
| The statistics | Real roots (count and share) and the share within `δ` of the unit circle, per degree and cumulative, at the loaded degree. | `≈`, labelled with the degree they were counted at |

**Alphabets.** Presets `{−1, +1}` (Littlewood), `{0, 1}` (Odlyzko–Poonen), `{−1, 0, 1}` (Bandt's `M`),
`{−n, …, n}` (Christensen's `C_{d,n}`), the cube roots of unity (3-fold symmetry), plus a free list of
complex numbers typed as `1, -1, i, -i`. A polynomial is **proper**: its constant and leading
coefficients are non-zero, so `0` is never a root and no polynomial is counted twice across degrees
(Odlyzko–Poonen's convention; for `{±1}` it is vacuous). The symmetry group used to cut the
enumeration is **derived from the alphabet** — conjugation when the alphabet is closed under it,
`z ↦ −z` when it is closed under negation, `z ↦ 1/z` when reversal keeps it in the alphabet (for
`{±1}` these are the 8-fold symmetry Christensen exploited) — never assumed.

## 2. What the research found

Two things reshape the design and are worth carrying in the doc rather than in the chat that found
them.

### 2.1 There are two engines in the literature, and they share one object

| | Root-driven | Pixel-driven |
| --- | --- | --- |
| Who | Christensen (SciPy, 8-fold symmetry, degree 26 in 6.5 h), Derbyshire (Mathematica, degree 24 in 4 days), Scheidegger (WebGL, degree 15 precomputed), Vanderbei (WebGL), Egan (Java applet, degree 36 outside an annulus) | Chris Foster (`c42f/polyroots`, degree 42, deep zooms in seconds), Bandt's Algorithm 1 (2002), Calegari–Koch–Walker's `schottky` program (which drew every picture in their paper, to depth > 60) |
| What | Enumerate polynomials, solve for all roots, splat a density image | Per pixel, walk the coefficient tree `s_k = s_{k−1} + a_k z^k` and **prune when the partial sum cannot reach zero**: `|s_k| > Σ_{j>k} |a| |z|^j` |
| Gives | Per-degree layers, colour by polynomial, per-root attribution, honest counts | The **limit set** (roots of all power series over the alphabet), zoom that never runs out, any alphabet, and — because the values `{P(z)}` at a point **are** the dragon `D_z` — the local self-similarity for free |
| Cost | `|A|^{d+1} / |symmetry| × O(d²)` | Per pixel, proportional to nodes visited; explodes near the unit circle |
| Measured | Aberth–Ehrlich in JS, real ±1 coefficients: **12 µs/poly at degree 12, 11 µs at 16, 16 µs at 20**. With the 8-fold symmetry, all of degree 20 is **4.3 s single-threaded** (≈ 0.6 s on 8 workers); degree 24 is 16× that | Same tree in JS, `D = 24`: **14 µs/pixel** (38 nodes) at the `0.42 + 0.48i` dragon, 17 µs at `½e^{i/5}`, **157 µs at `0.8 + 0.2i`, 4.8 ms at `0.9 + 0.1i`** (601 k nodes) — the annulus is 300× slower, which is exactly why Egan's applet excludes `0.8 < |z| < 1.25` |

The app uses **both, on one tree** (§3), and adds a third reader of the same tree: Foster's
`polysInBound` — prune the polynomials that cannot have a root in a small region, then root-solve
the survivors — which is what a **probe** is.

### 2.2 The theorems the gallery may cite

- **Bousch (1988, 1993).** Every root of a Littlewood polynomial has `½ < |z| < 2` (one line: `1 ≤
  |z| + … + |z|^n < |z|/(1−|z|)`, and `z ↦ 1/z`). Roots are **dense in the annulus `2^{−1/4} ≤ |z|
  ≤ 2^{1/4}`**. The closure `D̄` is connected and locally path-connected. For `|q| < 1`, **`q ∈ D̄
  iff `0 ∈ D_q`**, and then `D_q` is connected. The closure is the set of roots of all *Littlewood
  series* `Σ ±z^k` — which is what the pixel engine draws.
- **Odlyzko–Poonen (1993)** for `{0, 1}`: the root set lies in `Re z < 3/2` and in `1/Φ < |z| < Φ`
  (`Φ` the golden ratio, in fact between two subtler curves); its closure is path-connected and not
  simply connected. They drew it by a per-point test — the same idea as the pixel engine.
- **Barnsley–Harrington (1985), Bandt (2002), Calegari–Koch–Walker (2017)** for `{−1, 0, 1}`: `M`
  is the connectedness locus of `{x ↦ zx, x ↦ z(x−1)+1}`; it has a visible hole with two real
  "whiskers", **infinitely many exotic holes** (the "hexaholes" near `0.372368 + 0.517839i`, the
  picture 0.0005 wide), and its interior is dense away from the real axis. Bandt's Algorithm 1
  (CKW §5.3) is the tree walk with the pruning radius `R = 2·radius(D_z)`.
- **Michelen–Yakir (2026), *Dragon curves in Littlewood roots*.** The resemblance is a theorem: for a
  Littlewood series `P` with a root `α` in a compact `K ⊂ 𝔻` and `|P′(α)| ≥ κ`, the roots of all
  degree-`n` extensions of its prefix, magnified about `α` by `T_{n,α}(z) = (z − α)/α^{n+1}`,
  converge in Hausdorff distance to **`𝒟_α = P′(α)^{−1} D_α`**. The random model (i.i.d. `±1`) almost
  surely has no double zero in `𝔻`, so the picture is typical. This is the "theorem mode" of the
  dragon overlay, and it says exactly what to draw.
- **Egan's heuristic** (the one Baez's slides use): `f(p) ≈ f(q) + f′(q)(p − q)`, so a root sits
  near `p − q ≈ −f(q)/f′(q)` — the cloud near `q` is a union of distorted copies of `D_q`.
- **Thurston / Tiozzo.** `M₀` (the `{±1}` closure) contains the Galois conjugates of the growth rates
  of postcritically-finite real quadratic maps — the "master teapot" — a caption fact, not a
  feature.

### 2.3 Named places (the gallery's seed)

| Place | Where | Source |
| --- | --- | --- |
| The hole at `1` and the real-axis line | `z = 1`, height ~0.3 | Baez slides: "more Littlewood polynomials have real roots than nearly real roots" |
| Holes at `i` and `e^{iπ/4}` | `z = i`, `z = (1+i)/√2` | Derbyshire's plot; all sixth roots of unity too |
| The Bousch ring | `2^{−1/4} ≤ |z| ≤ 2^{1/4}` | Bousch 1988 — roots dense there; the "haze" |
| `4/5` and `4i/5` | feathers along the real and imaginary axes | Baez slides |
| `½e^{i/5}` | "a metaphor of how mathematical patterns emerge from confusion" | Azimuth post |
| The dragon at `0.372 − 0.542i` | the headline zoom | Baez, Notices |
| The feather at `0.8 + 0.2i` | | Azimuth post |
| The zoom story at `0.42065 + 0.48354i` | height `0.62508 → 0.0024456` (nine halvings) at degree 20, then degree 20 → 27 filling in, then the dragon at the same heights | Baez slides — a scrubbable story, not a still |
| Egan's point `−0.0572 + 0.72229i`, Baez's `0.375453 + 0.544825i` | dragon-match showcases | Egan's applet, Baez slides |
| Bandt's hole and whiskers | `{−1, 0, 1}`, the visible hole on the real axis | CKW Fig. 2 |
| The hexaholes | `{−1, 0, 1}` near `0.372368 + 0.517839i`, width `0.0005`; the limit point `ω ≈ 0.371859 + 0.519411i`, a root of `1 − 2z + 2z² − 2z⁵ + 2z⁸` | CKW Fig. 4, Thm 9.1.1 |
| Odlyzko–Poonen's set | `{0, 1}` with its `1/Φ < |z| < Φ` and `Re z < 3/2` bounds drawn | Odlyzko–Poonen 1993 |

## 3. The design spine

**One coefficient tree, three readers.** Fix an alphabet `A` and a point `z`. The tree of partial
sums `s_k = s_{k−1} + a_k z^k` (`a_k ∈ A`) is the app's single data structure:

1. **The root engine reads its leaves.** Every leaf at depth `d` is a polynomial; enumerate one
   representative per symmetry orbit, solve, and accumulate roots — per degree — into a density
   texture. Roots are **not retained** (degree 24 is 3 GB of them); the layer *is* the texture.
2. **The pixel engine prunes it.** At a pixel `z`, walk the tree and cut every branch whose partial
   sum is farther from `0` than its remaining tail can travel; what survives to the depth cap is
   the set of polynomials with a root within the pixel. The output is the **limit set**, coloured by
   density or by first-hit depth.
3. **The dragon is its set of values.** At the lamp `z`, the leaves at depth `n` *are* `D_z` to
   within `|z|^{n+1}`; the same walk, un-pruned, draws the inset. The theorem mode rescales it.

The two engines hand over by **zoom**: the root engine owns the overview (scrub, degree colour,
counts), the pixel engine owns the zoom, the threshold is the pixel size at which the loaded degree
stops resolving the picture (`≈ |z|^{d}`), and both can be forced. **Precision is handled by a
reference point, not by a wider float** ([ADR-0046](../DECISIONS.md#adr-0046) decision 3):

- **Shallow** (`pixel ≳ D·ε₃₂·|z| ≈ 2·10⁻⁶`): the walk runs per pixel in a float32 fragment
  shader with an explicit stack.
- **Deep**: every pixel in the view shares the reference `z₀` to within the view, and the tail
  bounds that drive pruning are `O(1)`, so **the set of survivors is identical for every pixel**.
  The walk runs **once per frame, on the CPU, at `z₀`** (float64; below a pixel size of ~10⁻¹³ on
  the JS double-float reference `@cas/gpu/df64`), and yields each survivor's root as a small offset
  `δ* = −P(z₀)/P′(z₀)` Newton-polished in the same precision. The GPU only splats float32 offsets —
  which carry full *relative* precision because they are never added to an `O(1)` number. Floor
  ≈ 10⁻³⁰; zero cost when shallow; one handover to parity-test.
- The **probe** is the deep walk at the cursor: survivors solved, sorted by `|δ*|`, shown with their
  coefficient strings and residuals.

**WebGL2 is required** (fatal banner otherwise, as in Complex Dynamics); the walk has no CPU
full-plane path. **Web Workers** run the root engine and the reference walk; there is no WebGPU.

## 4. The reuse foundation (north star: zero new packages)

| Need | Source | Note |
| --- | --- | --- |
| Shell | `@cas/ui` — `runWithFatalBoundary`, `attachCanvasA11y` (`role="application"` on the stage, `role="img"` on the inset) | as 2D Hydrodynamics |
| Worker offload | `@cas/ui` `createComputeClient` for the **reference walk** (one in flight, coalescing, sync fallback) | fits exactly |
| Worker **pool** | **app-local** `src/engine/pool.ts` (N workers, chunked orbits, progress, cancel) — QD's `param-slice-pool.mjs` is the prior art but is `.mjs` inside an app | extract to `@cas/ui` on the second consumer |
| Root solver | **app-local** Aberth–Ehrlich specialised to small real/complex integer coefficients, `src/engine/aberth.ts`; `@cas/core`'s `rootsMonic` (Durand–Kerner) **pins it** in the node gate on a fixed corpus (every root within `1e−12`, same multiset) | `@cas/core` gains nothing until a second consumer needs Aberth |
| Density accumulation | **new**: `gl.POINTS` into an `R32F` framebuffer with `gl.blendFunc(gl.ONE, gl.ONE)` — CD's `renderAccumulate` is the only additive blend in the repo and it accumulates frames, not points | `EXT_color_buffer_float` required; probed at boot, refused by name |
| Tone mapping | `apps/complex-dynamics/src/render/histogram.ts` `buildEqualizedCdf` → **extracted to `@cas/gpu`** at PR-1 (this app is its second consumer, ADR-0007) — log density with an equalised CDF and an exposure slider | CD rewired, byte-identical output pinned |
| Colour ramps | `@cas/gpu/colormap` (`buildGradientLUT`, `makeColormapTexture`) with an app-local "hot" ramp (black → dark red → yellow → white, Derbyshire's) and a sequential ramp for degree | the viridis stop tables exist twice already (CD, Argument Principle); a third copy is refused — noted as a follow-up extraction, not done here |
| CET-C6 | `apps/contour-integration/src/ui/stage/cetC6.ts` → **`@cas/gpu`** when the **Egan hue mode** lands (M6): hue from the low-order coefficient bits is cyclic, which is what C6 is for; this app is then the second consumer | CC-BY 4.0 attribution travels with the table |
| Deep zoom | `@cas/gpu/df64` (`df`, `dfAdd`, `dfMul`, …) — the **JS** half, on the CPU reference walk | `DF64_GLSL` is deliberately not used (§3) |
| Pan / zoom | `@cas/flow` `pixelToWorld` / `panView` / `zoomView` (`View`, `Viewport`) | Riemann Map's `attachPanZoom` is app-local; a second consumer would extract it — this app takes `@cas/flow`'s instead |
| Permalink | `@cas/interchange` `encodeViewState` / `decodeViewState`, app tag **`pr`** | fields optional-on-decode with named defaults, as 2D Hydrodynamics |
| PNG export | `@cas/export` `injectPngText`, keys **`Software` + `cas:state`** (the documented convention; three of six apps follow it) | copy `2d-hydrodynamics/src/pngExport.ts` |
| Polynomial on the wire | `@cas/interchange` `RationalMap` `{form:"rational", num, den:[1]}` | the hand-off to the plotter / Argument Principle is a **later** milestone; the form already exists, no bump |

So: consumes `@cas/ui`, `@cas/gpu`, `@cas/core`, `@cas/flow`, `@cas/interchange`, `@cas/export`;
**zero new packages**; **two second-consumer extractions** into `@cas/gpu` (`buildEqualizedCdf` at
PR-1, `CET_C6` at M6), each rewiring its first consumer and pinning byte-identical output.

## 5. Engine specifications

### 5.1 The root engine (`src/engine/roots/`)

- **Enumeration** (`orbits.ts`): a `Alphabet` is `{ values: Complex[], symmetries }`; `symmetries`
  is *derived* — `conj` (values closed under conjugation), `neg` (`a_k ↦ (−1)^k a_k` stays in the
  alphabet), `rev` (reversal stays in the alphabet), `scale` (multiplying all coefficients by a unit
  `u ∈ A` stays in `A`, which is how `P` and `−P` collapse). Orbit representatives are enumerated by
  a canonical-form test on the index; the roots of the representative are mirrored on the GPU by
  the orbit's images (`z`, `−z`, `1/z`, `−1/z`, and conjugates). Pinned by a test that the union over
  the orbit of the mirrored roots equals the roots of every member, at degree ≤ 8, for each preset.
- **Solver** (`aberth.ts`): Aberth–Ehrlich with Gauss–Seidel updates, roots-of-unity seeding
  rotated off the real axis, Horner for `p, p′`, stop at `max|step|² < 10⁻²⁶` or 60 iterations; a
  polynomial that has not converged is **reported, not dropped** (a counter on the layer). Pinned
  against `@cas/core` `rootsMonic` on a corpus of 2,000 random polynomials per preset at degrees
  4–24 (multisets equal to `1e−12`), and against the closed forms `z^n ± 1` (roots of unity) and the
  cyclotomic factors of `1 + z + … + z^n`.
- **Pool** (`pool.ts`): `navigator.hardwareConcurrency − 1` module workers, each given a chunk of
  orbit indices and the alphabet; each replies with a `Float32Array` of roots for one degree
  (transferred, not copied), the main thread uploads it to that degree's texture and drops it.
  Progressive: degree ascending, so the picture refines in front of the reader; **cancel** on any
  state change; **progress** on the bar as `orbits done / orbits total` per degree.
- **Ceilings**: degrees ≤ 20 render live; 21–24 behind an explicit **Compute** button with a time
  estimate and cancel; above 24 the limit-set view takes over and says so.

### 5.2 The density stage (`src/stage/`)

- One `R32F` texture per degree (`1024²` = 4 MB; the count is the degree span, ≤ 25), accumulated
  by `gl.POINTS` at 1 px with additive blending. The view is re-projected by **recomputing** (roots
  are not retained), which the pool makes cheap for degree ≤ 20 and the probe/limit-set engines
  cover above it.
- The **composite** pass sums the selected degrees (the scrub is a `[d_min, d_max]` range with an
  animate button) and tone-maps: `log(1 + c)` then the equalised CDF (`buildEqualizedCdf`, read
  back once per composite from a low-resolution copy) then the ramp; **exposure** and **gamma**
  sliders. **Colour by degree** composites each layer through a sequential ramp keyed by degree and
  blends by density.
- The stage is `role="application"` with keyboard pan/zoom (`@cas/flow`), and its description is
  **generated** from the state (alphabet, degrees loaded, roots counted, view) on every recompute —
  the M6.4 lesson.

### 5.3 The pixel engine (`src/engine/limit/`)

- **Shader** (`walk.glsl.ts`, generated per alphabet): an iterative DFS with an explicit stack of
  `(re, im, depth, next-child)` in registers/arrays, depth cap `D` as a uniform (`≤ 48`), the
  alphabet as a `uniform vec2[]`, powers `z^k` precomputed in the loop, tail bounds `T_k = (max|a|)
  Σ_{j>k} |z|^j = (max|a|)·|z|^{k+1}(1 − |z|^{D−k})/(1 − |z|)` computed in closed form per pixel.
  Prune when `|s_k| − T_{k+1} > ε`, with `ε` the pixel radius times a `|P′|` estimate (Foster's
  "fudge"). Output per pixel: **the escape depth** `reach`, the deepest level any branch survived to.
  *(PR-2 replaced this line's "hit count (density), first-hit depth": counting survivors spent the whole
  node budget on 98% of the texels at the app's own flagship window, where existence exits early and
  costs 152 nodes — and `reach` is monotone in the cap, so it is the deepest approximation of the limit
  set a point belongs to rather than a number that depends on the traversal order. See the roadmap.)*
  The tail is the INFINITE one, `Σ_{j>k}`, not the finite `Σ_{j=k+1}^{D}` also written above: the finite
  one decides "is there a degree-`D` polynomial vanishing here", which is the root engine's object and
  already has an engine.
- **`|z| > 1`** is folded onto `1/z` with the reversed alphabet (exact when `rev` is a symmetry;
  otherwise the reversed alphabet is used honestly) — Foster's fold.
- **The annulus** `0.8 < |z| < 1.25` is **excluded by default**, painted in a distinct neutral with
  a legend entry "not computed here — the root engine covers it, and Bousch proves the roots are
  dense in `2^{−1/4} ≤ |z| ≤ 2^{1/4}`"; a toggle computes it under a per-pixel **node budget** and
  paints "budget exhausted" in a second neutral, so an incomplete pixel is never a black one.
- **Parity**: the shader against the float64 JS walk on a fixed grid of ~200 points per preset
  (hit/no-hit and first-hit depth agree everywhere the JS walk's margin exceeds the float32 error;
  the `sin`/`cos`-free walk should agree to ~1e−6), in the browser suite; the JS walk against
  Bandt's Algorithm 1 as an independent formulation on `{−1, 0, 1}` (both decide `z ∈ M` on a grid).

### 5.4 The reference walk and the handover (`src/engine/reference.ts`)

- The float64 walk at `z₀` with the pruning radius set by the **view** (`ε = view radius × |P′|`
  bound), returning survivors as `{ digits, degree, δ*, |P′(z₀)|, residual }` with `δ*` Newton-
  polished; below a half-height of `1e−11`, the same code on **double-double** numbers (the walk is
  written against a tiny `Num<T>` interface so the two are one function). Runs in a worker through
  `createComputeClient`; the GPU splats `δ*` around `z₀` in float32.
  *(PR-3 corrected this line's `@cas/gpu/df64`: that module is a pair of FLOAT32s, ~47 bits, so on the
  CPU it is a downgrade from a plain double. The step up is a pair of float64s — the same Dekker/Knuth
  transforms at one higher radix, `src/engine/deep/dd.ts`. See the roadmap.)*
- **Handover parity** is the milestone's gate: on a ladder of views straddling the threshold, the
  per-pixel shader and the reference walk paint the same hit set (measured as a per-pixel
  agreement rate `> 99.5 %`, the remainder within one pixel of a root) — the suite's dual-backend
  discipline.

### 5.5 The dragon (`src/engine/dragon.ts`, `src/stage/inset.ts`)

- **Hover mode**: `D_z` for the lamp `z` at depth `n` with `|z|^{n+1} < inset pixel`, drawn from
  the un-pruned tree (2ⁿ points, `n ≤ 20`) in a `role="img"` inset with a generated description;
  `|z| ≥ 1` says "no attractor: the maps do not contract".
- **Theorem mode** (on a probed root `α` of a survivor `P` of degree `n`): draw `𝒟_α =
  P′(α)^{−1} D_α`, mapped through `T_{n,α}^{−1}`, over the actual roots of the extensions of `P`'s
  prefix, with `n` scrubbable so the reader watches the Hausdorff distance fall. Labelled *"an
  illustration of Michelen–Yakir Thm 1; `|P′(α)| = …` (their κ)"*. If `|P′(α)|` is small the
  overlay says the theorem's hypothesis is weak here rather than drawing a confident picture.

### 5.6 State and permalink (`src/state.ts`, `src/viewState.ts`)

```ts
interface ShellState {
  alphabet: { preset: "littlewood" | "zero-one" | "trinary" | "range" | "cube-roots" | "custom";
              n?: number; custom?: Complex[] };
  degrees: { min: number; max: number };         // the scrub
  engine: "auto" | "roots" | "limit";            // the handover, forced or not
  view: { cx: number; cy: number; halfHeight: number };   // cx, cy as strings when deep (§3)
  colour: "density" | "degree" | "depth";        // "egan" at M6
  tone: { exposure: number; gamma: number };
  annulus: boolean;                              // compute the excluded band
  lamp?: Complex;                                // the dragon's hover point, if pinned
  stats: { delta: number };
}
```

The permalink carries a **diff against defaults** (Contour Integration's rule), refuses by name a
link it cannot honour (unknown preset, non-finite number, foreign app), and is gated **by picture**:
encode → decode → the same engine choice, the same survivors at the reference, the same generated
stage description. Deep views carry `cx`, `cy` as decimal strings so a `1e−30` view survives JSON.

### 5.7 The gallery and the statistics (`src/gallery.ts`, `src/stats.ts`)

- A gallery entry is `{ id, title, state: Partial<ShellState>, caption, cites[] }`, applied through
  `applyState`; the zoom story is an entry with a `steps[]` of states and a scrubber. Captions are
  KaTeX-free plain text with the theorem sentence quoted and its citation; the a11y roster audits
  two entries through their permalinks (M7.4's lesson: a panel nothing opens is never audited).
- Statistics are read from the root engine's replies before the roots are dropped: per degree,
  `real` (|Im| < 1e−9 after polishing), `nearCircle(δ)`, total; the panel shows counts and shares at
  the loaded degree and says so.

## 6. Roadmap

Milestones are **PR-n**, one PR each, with the gate (`pnpm lint && pnpm typecheck && pnpm test &&
pnpm build`) after the last edit, a mutation sweep over the slice's engine code against a
verified-green baseline (survivors killed or recorded as equivalent with a reason), and a browser
pass where the stage changed. Sizes: *S* / *M* / *L*.

- **PR-0 — ADR + plan (this) · *S*. DONE.** ADR-0046, this document, the `future-app-ideas.md` note.
- **PR-1 — scaffold, the root engine, the density stage, publish · *L*. DONE.** `apps/polynomial-roots`
  from the 2D Hydrodynamics template (port **5184**, tag `pr`); `orbits.ts` + `aberth.ts` + `pool.ts`
  with their goldens; the `R32F` point-accumulation stage, per-degree layers, the scrub, density and
  degree colour; `buildEqualizedCdf` **extracted to `@cas/gpu`** with CD rewired; `#vs=` permalink,
  PNG export with `cas:state`; a **places** list (Baez's set, as `PLACES` in Complex Dynamics) so the
  first published version already knows where to look; the wiring — `vitest.workspace.ts`, the census
  `PROJECTS`, `scripts/check-built-artifacts.mjs` (**required** — it verifies the worker chunk), the
  launcher card (badge *Root fractals*), `deploy-pages.yml`, the a11y roster + baseline,
  `eslint.config.js` `APP_NAMES` (adding the four apps missing from it), README, ARCHITECTURE §8/§11,
  CLAUDE.md decision 11. Gate: degree 20 Littlewood renders progressively under 2 s on the CI
  runner's core count; the a11y tree has no unnamed node; the browser suite compiles the stage and
  reads back a non-flat density texture.

  > **DONE.** 113 node tests across 9 files plus 6 browser tests; the repo gate green at 609 files /
  > 6940 tests; `pnpm a11y` clean on both new roster entries, 35 interactive nodes and 0 unnamed.
  >
  > **The extraction is narrower than this plan said**, and correctly so: `@cas/gpu` gets
  > `equalizedCdfLut` — the inclusive-CDF-and-resample arithmetic — not `buildEqualizedCdf` whole, whose
  > input is Complex Dynamics' own `k = R + 256·G` escape-count pre-pass. This app bins log-density; the
  > decode stays app-side on both ends. ADR-0046 action item 2 records it, with the one consequence: the
  > width cap samples each texel's CENTRE bin, so the last texel tops out at 254/255 and the highest few
  > bins are in the distribution without being addressable — changing it would alter seven apps' output
  > for one part in 255.
  >
  > **A SMALL STEP IS NOT CONVERGENCE.** The first Aberth settled a root whose step had fallen below a
  > floor; two iterates within ~1e-15 drive the repulsion sum to ~1e15, which divides the correction to
  > nothing — the roots are FROZEN. On `−1 + iz + iz²` it returned a double root at `−(1+i)/√2` with
  > residual 1.47 and said `converged`, and the density drew two roots that do not exist. The residual
  > is the only certificate, and it is strictly better rather than a trade: over six alphabets to degree
  > 18, nothing fails under it, including the five Littlewood polynomials to degree 12 the step rule had
  > failed. A polynomial that does fail is not painted and is counted on screen.
  >
  > **The parity test was measuring its own grid, twice.** `y = 0` on a bin boundary put every real root
  > either side by the sign of its 1e-16 noise; an odd cell count fixed that and exposed the primitive
  > cube roots of unity at `x = −1/2`, exactly on a vertical boundary (`1 + z + z² − z³ − z⁴ − z⁵` is
  > Littlewood). Offset off those values, all 25 cases agree EXACTLY, bin for bin.
  >
  > **Root agreement splits by MULTIPLICITY**: 1e-13 on simple roots, 4.8e-8 on the double root of
  > `(z−1)²(z+1)`, 1.19e-5 on the triple root of `1 − z − z² + z³ − z⁴ + z⁵ + z⁶ − z⁷` — `√ε` and `∛ε`.
  > One tolerance loose enough for the triple root stops testing the rest.
  >
  > **The hexahole place could not be honest at these degrees**: the nearest trinary root to
  > `0.372368 + 0.517839i` at degree 12 is 7.1e-4 away, so CKW's own 0.0005-wide window is EMPTY here.
  > It opens at half-height 0.008 and its caption says so; the holes are PR-2's, as that gate names.
  >
  > **And two instrument defects.** An a11y `expect` selector present in the DEFAULT state verifies
  > nothing (the first keyed on a caption every page carries), so it keys on the decoded alphabet;
  > `scripts/check-built-artifacts.mjs` hardcoded its app names while counting from the roster, so a
  > third app made it say "across 3 published apps (quadrature-domains, complex-dynamics)". Both fixed.
  > `eslint.config.js`'s `APP_NAMES` was stale by four apps and is brought current.  >
  > **Sweep: 47 mutants, 42 killed, 5 recorded.** Three of the five are provably EQUIVALENT — negating
  > the even-index coefficients instead of the odd gives `−P(−z)`, whose root set is `P(−z)`'s and whose
  > normalised digit vector is identical because `−1` is a unit whenever negation is available at all;
  > dropping the units' bijection check can never fire, since the candidates are ratios of non-zero
  > values so `u ≠ 0` and injectivity on a finite set forces it; and `buildToneMap`'s empty-frame early
  > return produces the same all-zero ramp the general path does (`log1p(0) = 0`, an empty histogram, a
  > zero CDF). The fourth is equivalent IN OUTCOME and says something worth keeping: moving the seed
  > circle to radius 2 changes only the sweep count (worse on the mean at high degree, better on the
  > worst case, never outside the budget), which is exactly what the residual stopping rule is for. The
  > fifth is UNREACHABLE rather than equivalent — painting a polynomial whose solve failed would
  > reintroduce the fabricated-root defect, and no legal alphabet reaches it (0 failures in ~20,000
  > polynomials over nine alphabets); the guard stays, and `sweep.test.ts` asserts the unreachability, so
  > if it ever becomes reachable that test fails first.
  >
  > **Four survivors bought tests or code changes.** The seed radius was REMOVED (above). `clampState`
  > gained its ordering test: with `maxDegree < minDegree` the pool's `for (d = min; d <= max)` queues
  > nothing, so the stage is blank while every control looks right. And the statistics' SHARE was being
  > divided by nothing a test checked — the mutant divided by the polynomial count instead of the root
  > count, a factor of the degree, and the first repair still passed it because `"150.0%"` contains
  > `"50.0%"` and the assertion used `toContain`.
  >
  > **A browser pass then found two more, and both were invisible to every test that existed.** The
  > statistics panel and the stage's generated description were refreshed only when a sweep FINISHED, so
  > a multi-million-polynomial sweep filled the picture in beside a panel reading zero and an alternative
  > text saying *"No roots have been computed yet"* — for its whole duration, measured at 13% progress
  > with 12.2M roots already counted. They refresh on a throttle now, with the pending one cancelled at
  > completion so the final counts are what is left on screen. And **the hexahole place rendered BLACK**:
  > at CKW's own 0.0005-wide window the trinary cloud of bounded degree puts 1,610 roots into 730,000
  > pixels, measured at 0.05% lit and TWO distinct colours. The node places test passed it, because *are
  > there roots in this window* and *is there a picture* are different questions and only a rendered
  > frame answers the second. The place opens at half-height 0.06 now (1.92% lit, in line with the other
  > deep zooms) and says plainly that it shows the region and not the holes; the browser suite gained the
  > pairing that tells the two apart — the same alphabet, degrees and centre at both window sizes, with
  > the wide one above the floor and the tight one below it, so a floor both cleared would assert nothing.
- **PR-2 — the limit-set engine and the handover · *L*. DONE.** The generated walk shader, the annulus
  policy, the escape-depth colour, the `auto` engine switch by pixel size with a visible "engine:
  roots / limit set" label, the JS walk and its parity corpus (shader vs JS; JS vs Bandt's
  Algorithm 1 on `{−1, 0, 1}`). Gate: the CKW hexaholes resolve at `0.372368 + 0.517839i` with the
  view 0.0005 wide; the limit-set picture of `{±1}` at the overview agrees with the degree-24 root
  picture where the latter is resolved (a pixel-wise correlation, measured and quoted).

  > **DONE.** `src/engine/limit/` (`walk.ts`, `bandt.ts`, `walkGlsl.ts`, `handover.ts`) +
  > `src/stage/limitPass.ts`; 47 new node tests across 5 files and 4 new browser tests; three new places
  > and one split in two. Both gate clauses are met, and the second is met more strongly than it was
  > asked for.
  >
  > **COUNTING SURVIVORS IS UNAFFORDABLE, and the escape depth is the better quantity anyway.** The
  > first design reported the survivor count per pixel, which is what §5.3 specified. Measured at the
  > app's own flagship window — the CKW hexaholes — **2,675 of 2,720 texels spent a 40,000-node budget
  > without finishing**, so the picture was one decided hole on a field of "undecided". Existence exits
  > EARLY: the moment one branch reaches the cap there is nothing left to learn. The same window then
  > costs **152 nodes a texel**, the Littlewood overview 23, and nothing exhausts anywhere. And the
  > quantity that falls out is the right one: survival to depth `k` is MONOTONE in `k`, so `reach` — the
  > deepest level any branch survived to — is the deepest approximation of the limit set the point
  > belongs to, which is the escape-time function of this set. It is order-independent where a
  > first-hit depth under an early exit would not have been; points at the cap are exactly the ones the
  > chosen depth cannot separate, which is what makes the depth slider mean something. One field
  > replaces two, the present pass needs no change at all, and the two colour modes become two RAMPS
  > over one quantity rather than a third `ColourMode`.
  >
  > **The node budget bites ONLY inside the excluded band, which is the measurement that justifies
  > both.** Over a 120² grid of `[−2.3, 2.3]²` at depth 40 with the band off, not one texel runs out and
  > the worst spends 5,546 nodes; with the band walked, 14 of 8,100 texels over `[−1.3, 1.3]²` do. So
  > the band is not a performance excuse bolted onto a slow engine — it is the only place the engine is
  > slow. `0.8` is Egan's choice and its reciprocal `1.25` is exact in binary, so the band is its own
  > image under the `1/z` fold and a texel cannot be inside it on one side and outside on the other.
  >
  > **The gate asked for a correlation; an exact INCLUSION was available and is strictly stronger.** The
  > limit set at depth `D` is a superset of the limit set, which is the closure of the root set
  > (Bousch), so every pixel holding a root of any degree must be lit by the walk. Measured over a 128²
  > grid of the opening view with the band excluded: **at every degree from 2 to 20, 100.00% — not one
  > root pixel missed** (4,460 at degree 14, 4,668 at 16, 4,744 at 20). And the walk's own surplus falls
  > as the degree climbs — 5,702 pixels at degree 2, 1,874 at 12, 960 at 20 — which is the root cloud
  > converging onto the limit set, the one thing a correlation could have shown and did not need to. A
  > correlation would have passed with a systematic offset, a wrong fold or a wrong aspect; this fails
  > on a single pixel, and the suite asserts that it can, by comparing against a deliberately shifted
  > window and requiring the misses.
  >
  > **Shader against float64: 46,532 texels, ZERO disagreements**, over four views and three alphabets.
  > So the assertion is equality rather than a tolerance. Worth saying why float32 suffices: `reach` is
  > DISCRETE, decided by `|s_k| > tail + ε`, and float32 can only move it where that comparison is
  > within ~1e-7 of a tie. A future disagreement is a finding to reproduce, not a line to widen — and
  > the anti-vacuity check (the same frame against the walk one level shallower) requires the comparison
  > to bite.
  >
  > **Bandt's Algorithm 1 is the same predicate in the other coordinate system, and that is exactly what
  > makes it a check.** `v_k = −s_k/z^k` turns the walk's SHRINKING tail bound into a FIXED radius
  > `R = max|a|·|z|/(1−|z|)`, derived by summing the future rather than by rearranging the walk; it
  > divides by `z` where the walk multiplies by a precomputed power, and runs breadth-first where the
  > walk is depth-first. The two agree on the frontier COUNTS — not merely on the booleans — over 468
  > points decided by both, 88 in the set and 380 out.
  >
  > **The hexaholes are a DEPTH phenomenon, not a window one.** At the place's own window, escaped
  > texels: 0 at depths 8, 12 and 16; 12 at depth 20; 37 at 30, 40 and 48, where it has converged. PR-1
  > opened that place wide and said honestly that it showed the region and not the holes; it is now two
  > places — `hexaholes-region` under the root engine and `hexaholes` under the limit engine at
  > half-height 0.00025 — and the browser suite renders both. `limit-littlewood` and `limit-bandt` join
  > them: Bousch's set and Barnsley–Harrington's `M`, each as a SET rather than as a sample of one.
  >
  > **A browser pass over the built app found three more, and the third is the honest-labelling
  > guardrail.** **(1) The statistics panel described the LAST FRAME.** `syncStats` runs before `render`
  > on a recompute, so a link opening at depth 40 announced *"to depth 26"* — the frame before it — while
  > the controls beside it said 40. It is a pure function of the state now, and `limitPixelRadius` is
  > shared with the pass so the legend's `ε` and the shader's cannot drift. **(2) The depth has to follow
  > the zoom.** The depth-`D` walk cannot separate points closer than about `|z|^D`, so a deep view at a
  > shallow depth over-reports: measured at the zoom story at half-height 4e-4, depth 16 calls 50% of the
  > frame in-set against 18% at depth 24 and 16% at 34, where it has converged. Zooming now raises the
  > depth to `log(pixel)/log|z|` — on the slider, so it is visible and reversible — and stops the moment
  > the reader touches it or a link or place names a depth of its own. **(3) A FRAME WITH NOTHING IN THE
  > SET DOES NOT LOOK EMPTY.** The tone map equalises the escape depth over the occupied texels, so a
  > window that misses the limit set entirely has its one or two escape levels stretched across the whole
  > ramp and comes out as a full, evenly-coloured picture. Measured: `0.372 − 0.542i` at half-height 1e-3
  > and below is **0% in the set at depths 16, 24, 34 and 48 alike** — the set is genuinely thin there,
  > and no depth changes that — and the frame was painted in two bright colours with nothing saying so.
  > `measureLimit` counts the frame from the stage's own read-back, the panel carries an *In the set*
  > line, and at 0% both it and the generated description say plainly that the limit set does not reach
  > this view.
  >
  > **And a CSS defect older than this slice, found by the a11y roster.** `[hidden]` is a UA rule and
  > `.row { display: grid }` is an author rule, so every row the shell hides was on screen — since PR-1
  > the `n` spinner and the custom-alphabet box under presets that have neither, and now the depth slider
  > and the band toggle under the root engine. All three Polynomial-Roots roster entries reported 44
  > interactive nodes, and the one that opens the limit-set engine — whose two controls do not exist under
  > the root engine — should have reported more. With `.row[hidden] { display: none }` they read 40 / 40 /
  > **42**. The guard is a browser test, because jsdom cannot decide a cascade.
  >
  > **Two smaller findings.** A read-back is a COPY and the composite is live state: the first draft
  > of the neutral-colour test presented a frame it had already overwritten and measured zero neutral
  > pixels, correctly. The old browser suite's floor — *"every place's window is at least as wide as the
  > one that rendered black"* — carried a comment predicting this milestone (*"a place that needs a
  > tighter window needs PR-2's limit-set engine"*), so it now exempts limit places and asserts that the
  > exception is used. And the a11y roster gained a third entry, because the depth slider and the band
  > toggle are `hidden` under the root engine and a hidden element is not in the accessibility tree — the
  > Contour-Integration M7.1 lesson, which this app has now met twice.
  >
  > **Sweep: 45 mutants, 45 killed, no survivors and no equivalents.** Eight survived the first pass and
  > every one bought a test. Three were about a TIE: `z = ½` exactly is in the Littlewood limit set —
  > `tail[k] = 2^{−k}` and `s_k = −2^{−k}` at every level, in powers of two, so float64 reproduces
  > Bousch's own boundary bit for bit — and a `≥` in either formulation's prune drops it. Two were about
  > CONJUGATION: over a real alphabet `1/z` and `1/conj z` agree everywhere, so the fold could have been
  > conjugating in both the walk and Bandt's iteration with every picture still right; `{1, ½+½i, −1}`
  > disagrees with its own conjugate at 772 of 2,816 points inside the band. One was `max|a|` in Foster's
  > fudge, which is 1 for every preset but `range` and a custom list. One was the grid taking the larger
  > side of a non-square texel (1,600 of 1,600 cells reproduced against 1,300). One was the generated
  > `LEAD` table built from the wrong array — identical for every preset but `{0, 1}`, where `0` sorts
  > first, so the mutant emits a shader whose `a_0` is ZERO and which compiles, links and draws the wrong
  > family. And one was `toPrecision(9)`'s own decimal point, which it writes for everything the app
  > normally carries and drops at nine integer digits: `vec2(123456789, 0.0)` is a GLSL compile error no
  > node test could see, and the custom alphabet lets a reader type it.
- **PR-3 — deep zoom by reference, the probe · *M*. DONE.** `reference.ts` over a `Num<T>` (float64,
  then a double-double), the worker through `createComputeClient`, the float32 offset splat, the
  handover ladder test, decimal-string coordinates in the permalink, and the **probe** (survivors at
  the cursor with coefficient strings and residuals). Gate: the zoom story at `0.42065 + 0.48354i`
  continues past height `1e−12` and the picture at the handover differs by `< 0.5 %` of pixels.

  > **DONE.** `src/engine/deep/` (`dd.ts`, `num.ts`, `reference.ts`, `reference.worker.ts`) +
  > `src/stage/deepPass.ts`; the view centre becomes a decimal string throughout and the camera a
  > double-double one; two new places, a probe panel, a fourth a11y roster entry. 34 new node tests
  > across 3 new files (plus additions to four existing ones — 37 net) and 4 new browser tests. Both gate clauses are met — the first needed restating,
  > and the second, as at PR-2, turned out to have an exact form.
  >
  > **`@cas/gpu/df64` IS A FLOAT32 PAIR, so on the CPU it is a downgrade** — and ADR-0046 decision 3
  > said to reuse it. Measured by reading it: every operation in `df64Ref.ts` runs through
  > `Math.fround`, because its job is to be the spec for GLSL, where float32 IS the native type. A df64
  > carries ~47 bits where a plain JS number already has 53, so the plan's ladder — *"float64, then
  > `@cas/gpu/df64` below a pixel of 1e-13"* — steps DOWN at exactly the point it means to step up.
  > What the decision was asking for is the same ALGORITHMS at one higher radix, and that is what
  > `dd.ts` is: Dekker's split and Knuth's two-sum over float64, the split factor moved from `2^12 + 1`
  > to `2^27 + 1`, `Math.fround` removed. `@cas/gpu/df64` stays what it is — the GPU's tool, and the
  > shader's. Every operation is pinned against exact BigInt rationals rather than against another
  > float computation.
  >
  > **The floor is reached rather than assumed.** At a half-height of 1e-30 the walk returns 2,223
  > polynomials from 15,871 nodes in 2.2 s, worst residual **1.6e-32**; float64's on the same view is
  > 1.8e-16, which is 53 bits and 106 bits made visible. The two agree on the root SET **exactly** from
  > 1e-10 to 1e-13 (offsets differing by 9.1e-7 of a view height at 1e-10 and 1.0e-3 at 1e-13), part
  > company at 1e-14, differ by a whole view height at 1e-16, and by 1e-24 float64 finds nothing at
  > all. The switch sits at 1e-11.
  >
  > **A CENTRE IS NEVER INHERITED, and that is what makes a deep view reachable.** A `ReferenceRoot`
  > carries a float64 OFFSET, so a centre built by adding one to the old centre is good to about 1e-17;
  > at a half-height of 1e-24 the walk then finds NOTHING there — including the very polynomial the
  > centre was taken from. The same trap one level up cost the first measurement its whole ladder: the
  > root engine's points are a `Float32Array`, because they are GPU vertex data, so a centre read off
  > one is good to seven digits and `|P|` at the supposed root measured 6.4e-8. `centreOnRoot`
  > re-derives the root at the view's own precision, and it is the probe's "Centre on this root".
  >
  > **The permalink's centre is a decimal STRING, and the codec had to become exact.** A JSON number is
  > a double and cannot hold the 32 significant figures a 1e-30 view needs. The first printer and parser
  > both accumulated in double-double and the round trip was not stable — `π` printed, parsed and
  > printed again differed in its last three digits, so the same view shared twice would have been two
  > URLs. Both go through BigInt now: exact digits out of the value's own bits, correctly-rounded limbs
  > back in. A link carrying its centre as a NUMBER still opens, because every link minted before this
  > milestone does.
  >
  > **`@cas/flow` is dropped from this app.** `panView`/`zoomView` return an absolute float64
  > `{cx, cy}`, and recovering "how far did the view move" from one at a half-height of 1e-30 means
  > subtracting two numbers thirty orders apart — the exact cancellation the reference point exists to
  > avoid. The camera is `centre + a small increment` in double-double, which is three lines, and one
  > camera is safer than two that must be kept in step. The app consumes five packages now.
  >
  > **The float32 texel wall is measured, not assumed.** Counting distinct float32 `z` across a
  > 1024-texel row at `|z| ≈ 0.42`: **1024 of 1024 down to a half-height of 1e-5, then 329 at 1e-5.5,
  > 105 at 1e-6 and 11 at 1e-7.** One ulp a texel is where the limit-set shader's grid collapses, so the
  > hand-over is at four, and the three engines are a ladder the zoom only ever descends.
  >
  > **The walk reaches each polynomial ONCE, but a polynomial can have two roots in the view.** Measured
  > against the root engine over a window at `0.6 + 0.45i`: three of the sweep's 147 roots were second
  > roots of polynomials already found, with `z₀` in the basin of a root just outside the rect. Each
  > root is deflated out and Newton runs again, stopped by a NECESSARY condition on what is left —
  > `|Q(z₀)| ≤ r·max|Q′|`, one Horner pass against a Newton's dozen. That is also the performance of
  > the whole engine: the suite went 64 s → **7.5 s**, and the 1e-30 case 16.6 s → **2.2 s**. A second
  > bound on the search, `ε/|P′(z₀)|`, was written and then REMOVED: the mutant that deleted it changed
  > no result, and measuring it showed why — the necessary condition already refuses everything it
  > would have, so it was 0.7 s of a 7.5 s suite spent deciding nothing. PR-1's Aberth seed radius
  > again.
  >
  > **And the root engine's own list has duplicates**, which the first draft of that comparison read as
  > roots the walk had missed: the sweep mirrors each orbit representative over the whole group, so a
  > polynomial fixed by a group element yields the same root twice, while the walk enumerates up to
  > UNITS and lists each polynomial once. 150 points, 147 distinct.
  >
  > **At depth the same root comes from MANY polynomials.** If `P` is Littlewood with a root at `α`, so
  > is `P·(1 + z^(d+1))`, and `P·(1 + z^(d+1) + z^(2(d+1)))`, for ever. Measured at 1e-30: **2,223
  > polynomials on 140 distinct points**, their degrees running 26, 53, 80, 107, 134 — steps of
  > `deg P + 1`. So the deep picture's density is a MULTIPLICITY, "how many roots are here" and "how
  > many dots are here" are different questions, and the panel reports both.
  >
  > **Two strides for one vertex layout.** `DeepPass` read four floats per root where `packFrame` writes
  > six, so the pass took each position out of the middle of the previous record — and the picture still
  > looked like a scatter of dots. One constant now, imported rather than agreed by inspection.
  >
  > **The depth margin is a measurement.** Each level beyond what the view's scale demands roughly
  > doubles both the root count and the cost. At 1e-30: margin 4 gives 140 points in 2.2 s, margin 5
  > gives 280 in 4.5 s, margin 6 gives 562 in 8.9 s. Four is the picture.
  >
  > **The gate, restated with its reason.** The slide deck's own centre `0.42065 + 0.48354i` is not a
  > limit point below about 1e-4 — measured, the nearest root of degree ≤ 20 is 2.19e-4 away and the
  > walk dies at 45 nodes at any half-height below 1e-6, so there is nothing there to continue INTO. The
  > zoom story continues past 1e-12, and to 1e-30, **at a root near it**: an exact root of one degree-26
  > Littlewood polynomial, which is what Michelen–Yakir's theorem is about in the first place. And the
  > hand-over clause has an exact form, as PR-2's did — every root the reference walk finds lands in a
  > texel the limit-set shader calls in-set, **0 of 50+ outside**, an inclusion rather than a
  > pixel-difference percentage.
  >
  > **Sweep: 38 mutants, 35 killed, 3 recorded equivalents.** Two of the four first-pass survivors were
  > real and both hid behind a test that pinned an outcome without pinning a reason.
  > **Removing `couldReach` puts PHANTOM ROOTS in the picture**, which is not the performance-only
  > change it reads as: with the deflation loop free to run its full eight passes, Newton on an
  > over-deflated polynomial converges back into a basin already visited and the re-polish on the
  > ORIGINAL lands on a root already in the list — measured at 1e-12, **414 rows for 399 roots, 15 of
  > them exact repeats** (same polynomial, same offset to ten digits), with **no root missed in either
  > direction**, at 31× the cost (150 ms → 4,689 ms; 3.4 s → 374.5 s at 1e-30). The deep picture's
  > density IS the multiplicity, so a duplicate is a dot that does not exist. And **the 1e-30 gate's
  > `residual < 1e-30` was fifteen orders looser than what it was testing**: the double-double's own
  > eps at `|α| ≈ 0.64` is `2⁻¹⁰⁶ = 1.2e-32` and the measured worst is 1.549e-32, so the bound is
  > `1e-31` now — eight eps, against float64's 1.8e-16 on the same view.
  >
  > The three equivalents, each with its measurement. **`DOUBLE_DOUBLE.bits 106 → 53`**: the Newton
  > break is checked AFTER the update and the iteration is quadratic, so stopping when the step falls
  > below `|z|·2⁻⁵¹` still leaves ~106 correct bits. Measured at the floor it moves the worst backward
  > error **within the arithmetic's own noise and in either direction** — 1.549e-32 → 1.417e-32 at the
  > gate's depth of 158 (2,223 roots both), 1.784e-32 → 2.179e-32 one level deeper (4,431 against
  > 4,447). A bound tight enough to catch the second reading passes the first, which is a test pinned
  > to a depth rather than to a claim, so the field keeps its honest `106` and the mutant is recorded.
  > **`SPLITTER 2²⁷+1 → 2²⁷`**: with the `+1` the rounding of `c = fl(a·(2²⁷+1))` and of `fl(c − a)`
  > cancel; without it `a·2²⁷` is exact and `fl(c − a)` rounds off the same 27 bits — either way
  > `hi = c − fl(c − a)` is `a` rounded to the grid of `ulp(2²⁷·a)`. Measured over 300,002 operands
  > spanning exponents −200…200 plus subnormals: **identical `hi`/`lo` in every case**, and `twoProd`
  > exact in 150,001 of 150,002 with the SAME single underflow exception both ways. Dekker's published
  > constant is kept. **`level >= 1 → level >= 0`** is unobservable by construction: at level 0 the
  > polynomial is the constant `a₀`, so `original.length` is 1 and `solve`'s loop condition
  > `working.length > 1` is false before anything is computed.

- **PR-4 — the dragons · *M*. DONE.** Hover inset from the un-pruned tree; theorem mode on a probed
  root with the extension scrubber and the paired-distance readout; the honest label when `|P′(α)|` is
  small. Gate: at Baez's `0.375453 + 0.544825i` the overlay lands on the roots to within the inset
  pixel for `n ≥ 24`, measured, and the number is in the test.

  > **DONE.** `src/engine/dragon.ts` + `src/stage/inset.ts`, a pinned `lamp` and a `theorem` mode in the
  > state and the permalink, two new places and a fourth a11y roster entry for the app. The gate is met
  > with room: at a degree-30 prefix through Baez's point the worst PAIRED distance is **1.2e-5 in a
  > picture of radius 0.542** — 2.2e-5 of it, and 0.002 of an inset pixel.
  >
  > **THE INSET IS THE LIMIT ENGINE'S OWN QUESTION, DRAWN.** Bousch's theorem is `q ∈ D̄ ⟺ 0 ∈ D_q`, so
  > the cloud beside the picture is not a second view of it: the picture is a map of where that cloud
  > swallows the origin. The two are the same predicate computed in opposite directions — one keeps the
  > values and takes a minimum, the other throws them away and keeps a depth — and the suite requires
  > them to AGREE rather than to correlate: **1,352 of 1,352 points, no disagreements.**
  >
  > **And the first falsification of that was measuring the wrong thing.** Perturbing the tail at a
  > realistic pixel broke 4 of 1,352 — which read as a weak test and was in fact a measurement of
  > FOSTER'S FUDGE: at a pixel radius of 0.01 the fudge is ~0.04 where the depth-12 tail is ~2e-4, so
  > `ε` decides every point and halving, quartering or deleting the tail all give the same 4. At
  > `ε = 0` the tail is the whole criterion and the response is proportional: **0 broken at the true
  > tail, 60 at half, 144 at a quarter, 288 — every in-set point there is — at zero.**
  >
  > **An alphabet containing 0 holds the origin for free**, so the membership question is asked of the
  > PROPER set and the second enumeration is not an optimisation to remove: the all-zero prefix is a
  > value of the full attractor at every depth and every point, so reading membership off the drawn
  > cloud would call the whole plane in-set for `{0, 1}` and `{−1, 0, 1}`. Littlewood has no zero
  > coefficient, which is exactly why the trap survives unnoticed on the flagship alphabet.
  >
  > **THE PAIRING SEES WHAT A HAUSDORFF DISTANCE CANNOT.** Michelen–Yakir state convergence in Hausdorff
  > distance; the extensions' tails INDEX both sides (`R` ranges over the same `|A|^m` truncations), so
  > every predicted point has a named partner and the number reported is the largest distance between
  > partners. That is not a convenience. The derivation gives `T(w) → −R(α)/P′(α)`, and the paper can
  > drop the minus because it is about Littlewood, where `−A = A` makes the predicted SET its own
  > negation — measured, exactly — so a Hausdorff reading is blind to the sign on the very alphabet the
  > theorem is stated for. The pairing is not: **6.8e-3 honest against 1.09 with the sign dropped, 159×**.
  > Over `{0, 1}` the sign moves the set too (1.2e-2 against 8.8e-1), so neither reading could miss it
  > there.
  >
  > **The convergence is a U, and the far side is float64 rather than the theorem.** `P·(1 + z^{d+1})`
  > keeps `α` a root and doubles the prefix degree exactly, so one root can be read at 16, 33, 67 and
  > 135 with no search. The theorem's error falls as `|α|^{n+1}`; the magnification's own noise,
  > `1e-16/|α|^{n+1}`, rises the same way:
  >
  > | degree | 16 | 33 | 67 | 135 |
  > | --- | --- | --- | --- | --- |
  > | worst | 6.83e-3 | 1.21e-5 | 1.80e-4 | 5.42e-1 |
  > | float64 noise | 1.12e-13 | 1.25e-10 | 1.57e-4 | 2.47e+8 |
  >
  > So a deep probe's HIGHEST-degree polynomials are the worst prefixes to illustrate the theorem with,
  > not the best. The mode refuses past `MAGNIFIED_NOISE_FLOOR` of the overlay's own radius and names
  > the repair ("a lower-degree prefix through the same root"), and because the prediction is cheap and
  > the `|A|^m` Newton solves are not, the refusal is decided before them and costs nothing.
  >
  > **`putImageData` REPLACES, it does not composite** — alpha included — so the first draft's painted
  > background was obliterated by the cloud's own buffer and every unlit pixel came back transparent
  > black. Found by the browser suite reading two distinct colours where the count ramp should give
  > several. The background is written into the buffer now. **And the test that found it was itself
  > wrong**: it asked for "> 20 distinct colours", which is a threshold a flat fill can pass. The frame
  > carries exactly one colour per distinct per-pixel count plus the background — measured, 16,384 values
  > over 6,179 lit pixels with a busiest pixel of 9, so **ten** — and that is what is asserted, because
  > nothing but the ramp produces that number.
  >
  > **Near `|z| = 1` the dragon is not slow to draw, it is beyond drawing.** A depth-`D` enumeration is
  > `|A|^{D+1}` points and pins the attractor to its own tail: at `|z| = 0.66` a fifth of a percent takes
  > depth 15 (65,536 values); at `|z| = 0.91` it takes depth ~50, which is 2⁵¹. The plan says `capped`
  > rather than drawing a coarse blob that looks finished — the annulus again, arriving in the third
  > engine.
  >
  > **The seed is refined before anything is decided**, so "the root is outside the disk" is a statement
  > about the root and not about where the reader clicked: seeding at `3` on a prefix whose roots are
  > inside is not an error, because Newton walks in. The refusal needs a polynomial whose root really is
  > out, which is what the test uses.
  >
  > **Sweep: 38 mutants, 38 killed, no survivors and no equivalents.** Four survived the first pass and
  > every one bought a test. **A COMPLEX alphabet was missing from the corpus**: over a real alphabet the
  > imaginary half of the shift `a·z^k` is identically zero, so a sign error there is invisible on
  > Littlewood, `{0,1}`, `{−1,0,1}` and `{−n…n}` alike — every preset the file used. The fourth roots of
  > unity are the cheapest alphabet that is not real. **`|α|^{n+1}` against `|α|^n`** changes only the
  > reported magnification and the noise read from it, both of which the panel prints, so it is pinned
  > directly rather than through a picture. **The `x ≥ width` half of the raster's bounds test is the one
  > a far-away point cannot exercise** — a huge index falls off the end of a typed array and is dropped
  > for free, while a point just past the RIGHT edge has a perfectly valid index one row down, so
  > removing the check does not lose ink, it MOVES it. And the cloud's coverage ramp moved out of the
  > canvas half into `cloudAlpha`, where the node gate can reach it: a constant paints a flat silhouette
  > and would make the browser suite's "one colour per distinct count" meaningless. Measuring it found
  > the ramp **saturates at 26 hits**; the inset's busiest pixel at Baez's point is 9, so the flat top is
  > never reached there, and the test says where it would be.
  >
  > **PR-1's caption guard caught PR-4's own caption.** `seen` is the app's `≈` description of its own
  > image and may not contain "theorem" or "proves" — those belong in `fact`, which carries a source —
  > and both new places had put Bousch and Michelen–Yakir in the wrong field. The rule was written three
  > milestones ago against exactly this.
- **PR-5 — the gallery and the statistics · *M*.** Captioned entries (§2.3, all four groups), the
  zoom story as a scrubbable entry, the `{0, 1}` and `{−1, 0, 1}` bounds drawn as overlays, the
  statistics panel, two gallery permalinks in the a11y roster. Gate: every entry's state decodes,
  runs, and reaches its named place; captions pass a denylist for `=` on any sentence about the
  picture.
- **M6 (later, not committed) — Egan's hue, CET-C6 extraction, custom alphabets polish.** Hue by
  the low-order coefficient bits (root engine only), which is the second consumer of `CET_C6` and
  extracts it to `@cas/gpu`; the custom alphabet editor's symmetry readout ("this alphabet has
  conjugation and negation; reversal is not a symmetry, so `|z| > 1` is computed with the reversed
  alphabet").
- **Deferred with their reasons.** An **exact BigInt reference** (`@cas/exact`) below `1e−30` —
  unbounded zoom, cost growing with depth; **Bohemian matrices** (eigenvalues of bounded-height
  matrices) — a different enumeration on the same stage; **hand-offs** (click a root → its
  polynomial in the Function Plotter as a `RationalMap`; count roots in a box in the Argument
  Principle) — the wire form exists, a receiving-tool gate on the ADR-0007 rule; a **precomputed
  atlas** for degree > 24 — declined, the limit-set engine covers the need.

## 7. Risks and open questions

- **`EXT_color_buffer_float` is not universal** (older mobile GPUs). The stage probes it at boot and
  falls back to an `RGBA8` accumulation with 8-bit-per-channel packing of a 16-bit count, labelled;
  measured before it is promised (PR-1).
- **The float32 walk's `ε`** couples the picture to a `|P′|` estimate; too small and the limit set
  looks sparse, too large and it looks fat. The parity corpus against the JS walk decides it, and
  the reader has an "ε" readout in the legend rather than a hidden constant.
- **The annulus in the root engine**: Bousch says it is dense, so at degree 24 the density there is
  a saturated band; the equalised CDF handles it, but the "haze" is a real feature the tone map must
  not flatten — the Baez plot is the reference image (a browser test compares the band's mean
  intensity ratio to the interior against a recorded value).
- **The pool's memory** is the transferred `Float32Array`s in flight (≤ N workers × one chunk), not
  the roots; the layer textures are the budget (≤ 25 × 4 MB).
- **Symmetry derivation on custom alphabets** must never claim a symmetry the alphabet lacks — the
  test enumerates every preset and a dozen random alphabets and checks each claimed symmetry by
  brute force at degree ≤ 6.

## 8. Non-goals

Certified root boxes (`@cas/rigor` promotion of a probed root) — the app is a picture, labelled
`≈` throughout except for cited theorems; WebGPU; a precomputed atlas; cross-app hand-offs and
Bohemian matrices in the first arc (deferred above, not dropped); Vanderbei's non-monomial bases
(`Σ a_k T_k(z)` etc.) — an extension of the tree's "power" step that is noted, not planned.

## 9. References

- J. Baez, J. D. Christensen, S. Derbyshire, *The Beauty of Roots*, Notices AMS 70 (2023)
  1495–1497; arXiv:2310.00326; the site <https://math.ucr.edu/home/baez/roots/> and its slide deck
  (`beauty.pdf`, the zoom story's coordinates).
- J. Baez, *The Beauty of Roots* parts 1–3, Azimuth (2011–12) — Egan's heuristic, Christensen's
  8-fold symmetry and timings, Chris Foster's degree-42 renderer, Scheidegger's WebGL viewer.
- G. Egan, *Littlewood applet* — the annulus exclusion, hue by low-order coefficients, SHIFT-click
  dragons. <https://www.gregegan.net/SCIENCE/Littlewood/Littlewood.html>
- C. Foster, `c42f/polyroots` — the per-pixel `min|P(z)|` walk with the triangle-inequality tail
  bound, the `1/z` fold, and `polysInBound`.
- T. Bousch, *Paires de similitudes* (1988); *Connexité locale et par chemins hölderiens pour les
  systèmes itérés de fonctions* (1993).
- A. Odlyzko, B. Poonen, *Zeros of polynomials with 0,1 coefficients*, Enseign. Math. 39 (1993)
  317–348.
- C. Bandt, *On the Mandelbrot set for pairs of linear maps*, Nonlinearity 15 (2002) 1127–1147.
- D. Calegari, S. Koch, A. Walker, *Roots, Schottky semigroups, and a proof of Bandt's conjecture*,
  Ergodic Theory Dynam. Systems 37 (2017) 2487–2555; arXiv:1410.8542 (Algorithm 1 in §5.3, the
  hexaholes in §2.5, `ω` in Thm 9.1.1).
- M. Michelen, O. Yakir, *Dragon curves in Littlewood roots*, arXiv:2606.25440 (2026).
- B. Solomyak, H. Xu, *On the "Mandelbrot set" for a pair of linear maps and complex Bernoulli
  convolutions* (2003); G. Tiozzo, *Galois conjugates of entropies of real unimodal maps* (2020).
- R. Reyna, S. Damelin, *On the structure of Littlewood polynomials and their zero sets*,
  arXiv:1504.08058 — the Hadamard-group view of `L_d` and the "evaluate `L_d(z₀)` beside `D_{z₀}`"
  figure.
- P. Kovesi, *Good colour maps: how to design them*, arXiv:1509.03700 — CET-C6 (CC-BY 4.0).
