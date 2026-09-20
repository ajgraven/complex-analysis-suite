# Performance & Optimization Review

A prioritized review of rendering performance, memory use, and optimization opportunities for
ComplexDynamicsJS, grounded in a code audit and a survey of the academic literature and competing
tools. Compiled 2026-06-29.

> **Status.** Tier 1 **#1 (cardioid/bulb interior bailout)**, **#2 (progressive-threshold fix)** and
> **#4 (compiled-closure cache)** are implemented; **#3** is subsumed by #4 and **#5** is deferred (see
> their entries). Tier 2 **#6 (coupled-drag panel debounce)**, **#7 (Julia metrics worker)** and
> **#8 (content-gated orbit/CDF invalidation)** are implemented too. Since then **#9 (general cycle
> detection)** and the deep-zoom **rebasing (D1)** + **BLA CPU foundation (D2a)** have landed (see their
> entries), and so has the deep-zoom **GPU BLA traversal (D2b)**; the remaining open item is **#5**. This
> document is the standing roadmap. Speedup figures from the literature are attributed; figures that
> could not be pinned to a primary source are marked **[UNVERIFIED]**.

## Diagnosis — why it feels slow at low/moderate zoom

The slowness is **not** precision (df64 is correctly gated to deep zoom only), **not** `sqrt`, and
**not** a WebGPU gap. It is **total fragment-shader iterations per settle**, multiplied by several
always-on factors that compound on the default view:

1. **Two live WebGL contexts** (parameter + dynamical), each refining on its own state changes.
2. **`renderScale = min(dpr, 2)`** → on a HiDPI display the default 500 px plot is a **1000×1000 =
   1 M-fragment** buffer (4× the naive budget).
3. That 1000 px buffer **trips the progressive heuristic** (`≥ 900` _device_ px), so even the trivial
   default view does a coarse **+** full pass (≈ +20–25 % fragments and a soft→sharp flash); a 1×
   display goes straight to full in one pass.
4. **No interior bailout** — the large black interior of the default Mandelbrot (main cardioid +
   period-2 bulb ≈ 91 % of the set's area) ran the **full iteration cap per pixel**, every pass,
   because the loop only early-exits on _escape_.

The code audit and the literature converge on the same top levers. Items are tagged **Impact /
Effort / Risk** and cite `file:line`.

---

## TIER 1 — shallow-zoom, high impact ÷ effort, low risk

### ✅ 1. Cardioid + period-2 bulb interior test for z²+c (parameter plane) — **DONE**

**[Impact L / Effort S / Risk low]** — `src/render/shaderBuilder.ts` (emitted `inMainCardioidOrBulb`

- shortcut in `colorAt`), gated by `src/render/glPlot.ts` `_interiorBailout` (`probeDivergenceEscape`).
  A `c` provably in the main cardioid or the period-2 bulb is in the Mandelbrot set, so its critical
  orbit never escapes — return the interior colour without iterating. ~6 multiplies skip ~91 % of the
  most expensive pixels. **Restrictions that keep it exact:** single precision only (deep zoom never
  lands inside these regions); parameter plane only (`uFractType == 1`); only when `f` is monic z²+c
  (`monicDegree === 2`) **and** the escape is a divergence test (`probeDivergenceEscape`, so a
  convergence/Newton escape can't be wrongly flattened); only for flat-interior colouring modes
  (escape/smooth/histogram/stripe/triangle/binary). The interior-structure modes (orbit-trap, period,
  multiplier) need the real orbit and correctly fall through.
  _Sources:_ [Wikipedia](https://en.wikipedia.org/wiki/Plotting_algorithms_for_the_Mandelbrot_set),
  [iquilez](https://iquilezles.org/articles/mset1bulb/),
  [mathr](https://mathr.co.uk/blog/2022-11-19_cardioid_and_bulb_checking.html).

### ✅ 2. Fix `wantsProgressive()` to use logical pixels, not device pixels — **DONE**

**[Impact M / Effort S / Risk low]** — `src/render/glPlot.ts:wantsProgressive`. Gates on
`Number(this._res) >= 900` (logical) and `targetIterations() >= 150` (effective, incl.
auto-iterations) instead of `_res · renderScale() >= 900`. A plain 500 px view now draws in a single
pass even at DPR 2; deep zoom / high-iteration views still progressive via the other clauses.

### 3. ~~Stop the hover preview from running a 512-iteration classification every frame~~ — subsumed by #4

The real per-frame cost on hover was the _closure recompile_, which #4 now caches. The residual
512-iteration walk is for a single point per frame (negligible), and lowering `maxIter` would degrade
the green/orange bounded-hint near the boundary — so it was deliberately left unchanged.

### ✅ 4. Cache compiled closures keyed on `(ast, a)` in `evaluate.ts` — **DONE (PR-2)**

**[Impact M–L / Effort M / Risk low]** — added `getComplexFn(ast, a)` + `getEscapeFn(escapeAst, fAst,
a)` to what is now `packages/expr/src/evaluate.ts` (`src/expr/evaluate.ts` when this was written —
the compiler moved out to `@cas/expr` in Phase 5) — a `WeakMap` on AST identity → a small `a`-keyed
map — and routed the
stable-AST hot paths (`overlay`, `orbitPreview`, `inspect`, `juliaProperties`, `critical`) through
them. The uncached `make*` primitives stay for the cold probes (`glPlot`, `rational`) and the
`differentiate(...)` callers (which build a fresh AST each call). Removes the per-frame recompile on
hover and the ~8× recompiles per coupled-drag move with panels open. Unit-tested in
`test/closureCache.test.ts` (cached result == uncached; memoised on a hit; fresh on a new key).

### 5. `dot(z,z) > R²` escape + larger bailout radius — **deferred**

**[Impact S / Effort S / Risk low]** — the `escapeFn` lowering emits a `length()` (`sqrt`) per
iteration. Doing this precision-agnostically needs a new squared-magnitude op in _both_ the single and
df64 stdlibs plus AST pattern-matching in `emitBool` — a broad touch for the smallest-impact item,
whose FPS delta is **[UNVERIFIED]** (modern GLSL compilers often fold `length(v) > c`). Deferred: the
cardioid bailout (#1) already removes the per-iteration cost for the bulk of interior pixels, and
exterior pixels escape in few iterations. (Raising R to 256 is a _quality_ change that costs more
iterations, not a perf win — intentionally not bundled here.)

---

## TIER 2 — targeted (medium effort, removes specific stalls / jank)

### ✅ 6. Debounce the c-dependent dyn panels during a coupled drag — **DONE (PR-3)**

**[Impact L when panel open / Effort M / Risk low]** — `updateDynCaption` ran `updateExteriorMap()`

- `applyLaurent()` + `updateJuliaProperties()` on **every** coupled white-point move (a 512-iteration
  classify + cycle Newton-refine + (general f) Durand–Kerner each time, when the panels are open). Now
  the caption text updates live, but the three panels are deferred behind a ~110 ms debounce **while a
  coupled drag is in progress** (tracked via `coupling.setDraft`) and recomputed once on release; all
  non-drag callers (clicks, applied inputs, init) still refresh inline. (`applyLaurent` already
  short-circuits its `polynomialCoeffs` probe for z²+c via `dMonic !== null ||`, so no reorder was
  needed once the per-move cost was gone.)

### ✅ 7. Move Julia-properties Tier-2 image metrics off the main thread — **DONE (PR-4)**

**[Impact L when panel open / Effort M–L / Risk med]** — `measureJuliaImage`'s ≈150–250 ms
synchronous burst (two `estimateExtent` passes + a 128² `interiorMask` + box-count / symmetry /
connectivity) now runs in a Web Worker. The compute is extracted into a pure `computeJuliaImageMetrics`
(`juliaProperties.ts`) that the worker (`juliaMetrics.worker.ts`) and a **synchronous fallback** both
call — so behaviour is identical where module workers are unavailable (headless / old browsers). The
`JuliaMetricsClient` posts source strings + scalars and **drops stale responses** (only the latest
request paints), which replaces the need for cancellation. Unit-tested via the pure core; verified
live (the measured pixel area sits under the analytic Gronwall bound; box-count dimension sensible).

### ✅ 8. Content-gate the orbit/CDF invalidation in `scheduleRender()` — **DONE (PR-3)**

**[Impact M for histogram/perturbation / Effort S / Risk low]** — `scheduleRender` set
`orbitDirty`/`cdfDirty` unconditionally, yet it's called by _every_ setter. Added a
`scheduleRender(invalidateContent = true)` param; the 8 appearance-only setters (colouring, trap,
lighting, post, gradient, gradient-rotation, outline, equipotential) now pass `false`. Content
changes keep the default, so the reference orbit (perturbation) and the histogram CDF rebuild only
when the view/c/f/n actually change — a palette tweak in histogram mode no longer triggers the
**synchronous `gl.readPixels`** CDF rebuild. Verified live: mode→histogram builds the CDF, a palette
change reuses it (identical structure), a view change rebuilds it. (Coarse-size CDF + `texSubImage2D`
reuse remain as further niceties.)

### 9. General periodicity (cycle) detection for interior early-out — ✅ DONE

**✅ DONE (2026-06-29, this PR):** `shaderBuilder.colorAt` now carries a stored reference point +
an every-20 refresh and jumps to `uN` (interior) when the orbit re-enters a cycle, using the
relative tolerance `1e-6·max(1,|z|)`. Gated to single precision + the flat-interior modes
(0/1/5/7/8/9 — orbit-trap/period/multiplier need the full orbit) + divergence-escape maps
(`glPlot._periodicityBailout = probeDivergenceEscape()`), so it generalises #1 to **all** components
and **any divergence-escape f / both planes**. Verified: smooth interior stays 21.78% (no false
interiors — escaping orbits never trip it), z³+c works with the cardioid shortcut off, period/trap
modes keep their interior structure. The histogram pass (`escapeCount`) is intentionally left full.

**[Impact M–L / Effort M / Risk med]** — the map-agnostic complement to #1; works on the **Julia
plane and any f**, where the cardioid test can't apply. Track a stored point + Brent-style geometric
schedule; jump to `uN` when the orbit re-enters a cycle. _Tradeoff:_ per-pixel state + a
data-dependent branch hurts GPU SIMD coherence, so start checking only after K iterations, compare
every N steps, use a relative tolerance, and (on the param plane) only where #1 didn't classify.
Measured ~⅓ render-time saved on interior-heavy CPU renders; the "23×" figure is **[UNVERIFIED]**.
_Source:_ [Wikipedia](https://en.wikipedia.org/wiki/Plotting_algorithms_for_the_Mandelbrot_set),
[Brent schedule](https://davidaramant.github.io/post/brents-cycle-detection-algorithm/).

### 10. Per-colouring-mode shader variants (or hoist dead per-iteration work)

**[Impact S–M / Effort M / Risk low-med]** — `src/render/shaderBuilder.ts:423-435`: `cvec zp = z;`
copies every iteration (only mode 8 needs it; a `vec4` copy in df64), and modes 3/7/8 branches sit
in the hot loop. Add a "mode class" to the shader build key and emit specialised loops (escape/smooth
share one), compiled lazily on first use. Removes dead branches + dead derivative emission.

---

## TIER 3 — structural (largest effort, do last)

### 11. Share one WebGL2 context / program cache across the two plots; add `GLPlot.dispose()`

**[Impact M / Effort H / Risk high]** — two contexts double driver overhead and compile the
byte-identical z²+c shader twice (df64 compiles are multi-second — paid twice on every `f` change). A
shared program cache keyed on `(fSrc, escSrc, precision, degree)` is the lower-risk partial.
`dispose()` is cheap future-proofing (no active leak today — context-loss teardown is clean).

### 12. Temporal reprojection (GPU analog of XaoS interframe coherence)

**[Impact M / Effort H / Risk med]** — sample the previous frame as a texture under the inverse
zoom/pan affine map for an instant draft, then refine. **Only worth it when the shader is
iteration-bound** (deep zoom / df64); at shallow zoom brute-force recompute already beats it and
reprojection just adds ghosting. The literal XaoS 1-D scheme does _not_ port to GPUs.
_Sources:_ [XaoS](https://en.wikipedia.org/wiki/XaoS), [iquilez](https://iquilezles.org/).

### 13. WebGPU compute backend — for ergonomics, not raw speed

The only Mandelbrot-specific measurements put WebGPU at **parity** with WebGL2 for this ALU-bound,
full-screen workload (1.8–3.1× at best on fragment-heavy work; _not_ the "35×" GPGPU headline). Don't
port for FPS. _Sources:_ [DiVA WebGPU paper](https://www.diva-portal.org/smash/get/diva2:1888104/FULLTEXT02.pdf),
[danini.dev](https://danini.dev/blog/mandelbrot-web-workers-wasm-and-webgpu/).

---

## Deep-zoom track (separate from the shallow complaint; high value)

The tool already has df64 + a CPU perturbation path for z²+c. The modern upgrade:

- **✅ Rebasing (Zhuoran) — DONE (D1).** The perturbation kernel (`PERTURBATION_FRAGMENT_SHADER`) now
  decouples the reference index `m` from the iteration count `k` and re-references to `Z_0` when
  `|(Z_m+δz) − Z_0| < |δz|` (or the stored orbit ends): an exact identity, so it's glitch-free and
  also removes the old fixed-length truncation — no Pauldelbrot threshold to tune. Also fixed a latent
  bug: `renderToImageData` used the df64 program, so deep exports bypassed perturbation; it now uses
  `drawFractal` (perturbation-aware). Verified by a CPU oracle (`test/rebasing.test.ts`: rebased ==
  direct iteration) + a live overlap test (rebased kernel ≈ df64 at 1e9: 99.1% pixel-identical,
  meanDiff 4/255, no glitch clusters). **[Effort M — done]**
- **✅ BLA (bivariate linear approximation) — D2a (CPU table) and D2b (GPU traversal) both done.** Where δz is
  small enough that δz² is negligible, the step is linear (`δz_{m+l} = A·δz_m + B·δc`, valid
  `|δz_m| < r`); a binary tree of merged BLAs lets the kernel skip many iterations at extreme zoom.
  **D2a (done):** `src/render/bla.ts` builds + queries the tree (single step `A=2Z, B=1`; the Zhuoran
  merge radius `r = min(rₓ, max(0,(r_y − |Bₓ|·maxC)/|Aₓ|))`; `lookupBLA` = largest valid skip), with a
  self-validating test (`test/bla.test.ts`) proving a skip reproduces the true per-step iteration
  within each radius — so the f32-precision-tied radius is provably safe (a conservative radius just
  skips less). **D2b (done):** `packBLATable` lays the tree out as an RGBA32F texture, `glPlot.ensureBLA`
  uploads it per orbit + zoom, and the kernel's `fetchBLA`/`lookupBLA` take the largest valid skip per
  fragment (else a single rebased step). `traverseBLA` is the CPU mirror of that loop, pinned against the
  per-step reference at d = 2…5 and in polynomial mode. Quoted 1.7×–36× over SA, activating only at
  ≳1e25. Not z²+c only, as this line used to say — the table builder takes a degree (d = 2…8) and
  `buildBLATablePoly` covers general polynomials, so the "100+ formulas" objection that made Kalles
  Fraktaler decline BLA does not apply here. **[Effort: D2a + D2b done]**
- **Generalize perturbation to multibrot z^d+c** (binomial) and **Burning Ship/tricorn** (`diffabs` +
  a 2×2 Jacobian). **[Effort M]**
- **Hard limit:** there is **no known perturbation/BLA/series scheme for rational, transcendental, or
  arbitrary-f deep zoom** — df64-per-pixel (~4× shallow cost) is the only general path, and that is
  confirmed correct as-is. Don't chase it.
  _Sources:_ [mathr deep-zoom](https://mathr.co.uk/web/deep-zoom.html),
  [BLA writeup](https://mathr.co.uk/blog/2022-02-21_deep_zoom_theory_and_practice_again.html),
  [Ultra Fractal perturbation docs](https://www.ultrafractal.com/help/writing/formulas/perturbationequations.html).

---

## General-f correctness ∩ performance

Fixes wrong-or-wasteful behavior for non-z²+c maps:

- **Family-specific bailout.** `|z| > 2` is _wrong_ for transcendental maps (they escape along rays,
  not radially) — use directional bailout (`Re(z) > R` for exp-type, `|Im(z)| > R` for sin-type;
  specifics **[UNVERIFIED]** — validate empirically). For Newton, the fate is `|z − root| < ε`
  (ε ≈ 1e-4…0.1), not magnitude escape.
- **Non-holomorphic distance estimation needs a real 2×2 Jacobian** (`d = ‖z‖·log‖z‖ / ‖z·J‖`), which
  the running complex derivative can't express. Tricorn is the cheap case (cross-term sign flip).
- **Newton/rational DE** needs `f''` (`F' = f·f''/f'²`); the symbolic-derivative codegen extends to
  2nd order.
- **Keep codegen-to-GLSL.** Every expression-driven fractal tool does this; an in-shader bytecode VM
  adds a permanent per-iteration interpreter tax — don't.

---

## Memory

Compute is the real story; memory is mostly clean. No leaks on context loss (all handles nulled +
rebuilt); export FBOs freed per call; no per-frame allocation on the main render path. Notable items,
none urgent:

- `RGBA16F` accumulation texture = **8 MB/plot** when temporal-AA is enabled (justified).
- `histoTex`/`cdfTex`/`orbitTex` use `texImage2D` (full realloc) per rebuild instead of
  `texSubImage2D`; histogram mode allocates fresh typed arrays per CDF rebuild (GC churn in that mode
  only).
- No `GLPlot.dispose()` — latent only (plots live for the page lifetime today).

---

## Do NOT bother (verified dead ends for a GPU web tool)

- **Border tracing / Mariani–Silver / solid-guessing on the GPU** — peer-reviewed result:
  intrinsically sequential; and the "avoid recompute" premise is moot when the GPU computes all
  pixels in parallel.
- **The `(x+y)²−x²−y²` squaring trick** — an anti-pattern on GPUs (full-rate FMA).
- **Forcing loop unrolling** — risks ANGLE/D3D `X3511` failures and minute-long compile hangs; the
  dynamic-bound `for` loop is the correct defensive pattern.
- **int vs float loop counter; f16 for the orbit** — negligible / mathematically impossible.

---

## Secondary — feature ideas

From the tool survey (Wolf Jung's **Mandel** is the academic benchmark; **dynamo**, **Fraktaler-3**,
**Ultra Fractal** also mined). Ranked by value × fit, favoring things that build on existing machinery
(rays, multipliers, cycles, potential):

**Best value-for-effort (Easy–Medium):**

1. **Ray portraits / ray-to-point** — "all rays of period q", ray orbit under angle-doubling,
   external-ray-to-a-point. Builds on the ray tracer + ray-pair landing.
2. **Equipotentials as a first-class tool** (both planes) — level sets of the potential already
   computed; prerequisite for Yoccoz puzzles.
3. **Misiurewicz self-similarity zoom** — auto-rescale param vs dynamic plane by the local multiplier
   (visualizes Tan Lei's theorem); preperiodic points already found.
4. **Expanded scripted "demos"** — Mandel's animated demos are _the_ reason it's the teaching
   standard; build on the existing tour.
5. **Period-colouring of parameter space** — colour components by attracting-cycle period (period /
   multiplier already classified).
6. **Lamination / pinched-disk overlay of M** — chords in a disk from the landing-angle pairs already
   computed; few tools have it.

**Higher-effort, research-grade:** internal rays / interior (Kœnigs–Böttcher) coordinate colouring;
Yoccoz puzzles; renormalization/tuning windows; spider algorithm (angle → parameter); core entropy /
kneading sequences; Riemann-sphere view (apt given rational/Newton support); zoom-video export
(zoomasm-style); meta-parameter planes for cubic/rational families.
_Sources:_ [Mandel](http://www.mndynamics.com/indexp.html), [dynamo](https://github.com/dannystoll1/dynamo).

---

## WP9/R9 — three redundant rebuilds, removed (review 2026-09-16)

Three places were repeating work whose inputs had not changed. None is a new algorithm; each is a
guard that was stricter than correctness required. Measured by reading what actually triggers a
rebuild, not by a profiler run — the counts below are exact, not sampled.

**1. The BLA skip-table rebuilt on every frame of a zoom.** `ensureBLA` reused its table only when
`this._zoom === this.blaBuiltZoom` — an EXACT match — so every wheel notch and every frame of a pinch
rebuilt the table from the reference orbit and re-uploaded it. The table is parameterised by
`maxC = √2 / zoom`, the largest |δc| over the viewport, and each level is accepted only if its
linearisation holds over the whole disc of that radius: **a table built for a larger `maxC` is
conservative for a smaller one** — it takes shorter skips than it could, and never a wrong one. The
guard is now coverage rather than equality (`maxC ≤ built` for validity, `maxC ≥ built/2` so it does
not stay needlessly conservative). A continuous ten-octave zoom-in costs **ten rebuilds instead of
one per frame**; a pan at fixed zoom costs none instead of one per frame.

**2. The double-double reference orbit rebuilt on every wheel notch, with auto-iterations on.**
`orbitKeyFor` keyed on the exact iteration cap, and `targetIterations()` moves with the zoom — at a
400 base and strength 1.5 that is **600 extra iterations per decade**, so the key changed on every
notch and the whole reference was recomputed. (The cost of one rebuild is already documented in
`ensureOrbit`: 3.8 ms at 4,000 iterations, 8.0 ms + 1.25 MB at 20,000, 35.7 ms + 4.00 MB at 65,536.)
The cap is now rounded **up** to a multiple of 512 for both the key and the computation. The orbit at
the rounded cap contains the one at the real cap as a prefix, so nothing is approximated; `uN` is
still the real cap, and a longer stored reference only delays the shader's rebasing. At the figures
above that is one rebuild per **~0.85 decades** of zoom instead of one per notch, for at most 511
extra iterations per build.

**3. Every recorded animation frame was drawn twice.** `recordAnimation`'s `apply(t)` sets
`plot.center` and `plot.zoom` — each of which calls `scheduleRender()` — and then calls
`plot.render()` synchronously, which is what makes the capture deterministic: the canvas must hold
this instant before `captureStream` samples it. Nothing cancelled the scheduled frame, so the rAF
fired on the next tick and drew **the same view again**, at full resolution with `_forceFull` set.
The plan's suggestion was to drop the synchronous render and await the scheduled one; that is the
wrong half to remove — it would put a frame of latency into every captured frame and let the
coalescing drop some entirely. A `renderSeq` counter retires a scheduled frame that a direct
`render()` has already covered, so the recorder now draws **once per frame instead of twice** and
the capture stays deterministic.

**One hazard found while writing (3), and it is the reason the pending sequence is re-stamped rather
than captured.** `requestFrame` returns early when a frame is already scheduled — that is the
coalescing — so if the pending frame carried the FIRST request's sequence, this order would lose a
change entirely: schedule, direct `render()`, schedule again (returns early), rAF fires and sees a
newer `renderSeq` and skips. Every request re-stamps `pendingSeq`, and
`test/renderRobustness.browser.test.ts` pins both directions.

---

## Recommended PR sequence

- **PR-1 (this)** — Tier 1 #1 + #2 (cardioid bailout + progressive-threshold fix).
- **PR-2** — Tier 1 #3 + #4 + #5 (hover-preview cap + closure cache + dot/escape).
- **PR-3** — Tier 2 #6 + #8 (panel debounce + invalidation split).
- **PR-4** — Tier 2 #7 or #9 (worker, or periodicity).

Each is verifiable via the `renderToImageData` checksum harness (pin `n`, `setForceFullRender(true)`,
render-until-stable) + `window.__views`. Note: screenshots time out on the live WebGL canvas — verify
via values, not pixels.
