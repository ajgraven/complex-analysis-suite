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
  "fudge"); a leaf within `ε` **hits**. Outputs per pixel: hit count (density), first-hit depth,
  nodes visited (the budget).
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
  bound), returning survivors as `{ coeffIndex, degree, δ*, P′(z₀), residual }` with `δ*` Newton-
  polished; below a pixel size of `1e−13`, the same code on `@cas/gpu/df64` numbers (the walk is
  written against a tiny `Field` interface so the two are one function). Runs in a worker through
  `createComputeClient`; the GPU splats `δ*` around `z₀` in float32.
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
- **PR-2 — the limit-set engine and the handover · *L*.** The generated walk shader, the annulus
  policy, first-hit-depth colour, the `auto` engine switch by pixel size with a visible "engine:
  roots / limit set" label, the JS walk and its parity corpus (shader vs JS; JS vs Bandt's
  Algorithm 1 on `{−1, 0, 1}`). Gate: the CKW hexaholes resolve at `0.372368 + 0.517839i` with the
  view 0.0005 wide; the limit-set picture of `{±1}` at the overview agrees with the degree-24 root
  picture where the latter is resolved (a pixel-wise correlation, measured and quoted).
- **PR-3 — deep zoom by reference, the probe · *M*.** `reference.ts` over a `Field` (float64, then
  `@cas/gpu/df64`), the worker through `createComputeClient`, the float32 offset splat, the handover
  ladder test, decimal-string coordinates in the permalink, and the **probe** (survivors at the
  cursor with coefficient strings and residuals). Gate: the zoom story at `0.42065 + 0.48354i`
  continues past height `1e−12` and the picture at the handover differs by `< 0.5 %` of pixels.
- **PR-4 — the dragons · *M*.** Hover inset from the un-pruned tree; theorem mode on a probed root
  with the `n`-scrubber and the Hausdorff-distance readout; the honest label when `|P′(α)|` is
  small. Gate: at Baez's `0.375453 + 0.544825i` the overlay lands on the roots to within the inset
  pixel for `n ≥ 24`, measured, and the number is in the test.
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
