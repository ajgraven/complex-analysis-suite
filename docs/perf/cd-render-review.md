# Complex Dynamics — Render / Shader Performance Review

**Scope:** the Complex-Dynamics app's *interactive render pipeline* — the WebGL2
escape-time renderer (`src/render/glPlot.ts` + `src/render/shaderBuilder.ts`), the
AST→GLSL emitter it drives (`@cas/expr` `src/glsl.ts`), the GLSL stdlibs
(`@cas/gpu` `complexSingle/Df64/Derived.glsl.ts`), and the orchestration that fires
renders (`src/main.ts`, `src/render/plotView.ts`, `src/render/overlay.ts`). Deep-zoom
precision paths (df64, perturbation + BLA) are in scope. The **CPU numeric core**
(`@cas/core`) is out of scope: the escape-time field is computed on the GPU in a
fragment shader, so `@cas/core` is not on this hot path.

**Goal:** a significant, user-noticeable speedup of the interactive path — live
pan / zoom, parameter drag (set-c), appearance controls, and deep zoom — on a modern
desktop GPU, without regressing image correctness.

**Method:** forward-looking (no git-history regression hunt). Findings are ranked by
impact × frequency vs. effort and grounded in measurement. Because a headless browser's
WebGL is **SwiftShader (software)**, absolute GPU *times* are not representative — but the
things that dominate WebGL responsiveness **are** counted faithfully: shader
recompiles/links per interaction, **draw calls** per interaction (RAF coalescing), and
**synchronous `gl.readPixels` stalls**. A profiler (`_render-prof.local.mjs`, not
committed) instruments the `WebGL2RenderingContext` prototype and drives the documented
controls. Per-iteration *shader* cost (the `sqrt` findings) can't be timed under
SwiftShader; those are established by code analysis and defended by correctness tests.

---

## Measured baseline (draw-call / readback counts per interaction)

SwiftShader; counts representative, absolute times not. Each row is one gesture of N steps.

| Interaction | draws | compile | link | readPixels | texImage |
|---|---:|---:|---:|---:|---:|
| dynamical: zoom `+` ×6 | 72 | 0 | 0 | 0 | 12 |
| dynamical: pan `→` ×6 | 54 | 0 | 0 | 0 | 12 |
| param: zoom `+` ×6 | 62 | 0 | 0 | 0 | 12 |
| param: pan `→` ×6 | 54 | 0 | 0 | 0 | 12 |
| **appearance: palette-rotation sweep ×8** | **140** | 0 | 0 | 0 | 0 |
| histogram: switch mode | 22 | 0 | 0 | **2** | 4 |
| **histogram: zoom `+` ×4 (mode active)** | 68 | 0 | 0 | **4** | 16 |
| param: drag set-c | 60 | 0 | 0 | 0 | 0 |

**What the baseline already does right** (do *not* redo these): no shader recompiles on
pan / zoom / param-drag / appearance change (compile = link = 0 everywhere); renders are
RAF-coalesced; the drag uses a preview-warp instead of re-iterating; orbit/BLA are cached;
there is no `gl.finish`. The interactive path is not naïve — the wins below are specific
wasted work, not a rewrite of a broken pipeline.

---

## TL;DR — the headline

**A pure colour change costs as much as a zoom, because escape-time and colouring are
fused into one fragment pass.** Eight palette-rotation ticks fired **140 draw calls**
(~17.5/tick, across both plots) — *more* per tick than a zoom step (~12) — even though
rotation only shifts a colour lookup. `setGradientRotation` → `scheduleRender(false)`
correctly avoids a recompile, but the render it schedules re-runs the **entire per-pixel
escape loop** to recompute a field that did not change. The same waste hits every
appearance control: lighting, post (vignette/gamma), outline, equipotential, trap, and
AA all re-iterate rather than recolour.

Two structural fixes, in order of confidence:

1. **Stop re-iterating for colour.** Short-term: treat appearance-slider *drags* as
   interactive gestures (low-res draft during the drag, full render on release) using the
   machinery already present for pan/zoom. Structural: **two-pass render** — compute the
   escape-time field into an offscreen float texture once, then a cheap fullscreen recolour
   pass for every appearance uniform. That makes *all* appearance controls O(pixels)
   instead of O(pixels × iterations).

2. **Cut the per-iteration `sqrt`s in the hot loop.** The default periodicity bailout does
   **two** `length()` calls per interior iteration (`shaderBuilder.ts:586`); the escape
   predicate `abs(z) > 2` compiles to a `length()` — a `sqrt` — **every iteration for
   every pixel** (`@cas/expr` `glsl.ts` → `cabs`). Both become squared-magnitude compares.
   The periodicity one is output-identical; the escape one shifts the boundary by ≤1
   iteration (golden regeneration required) but is the single largest per-iteration win,
   and in df64 deep zoom it removes a full double-float `hypot` per step.

Histogram colouring adds a **synchronous `gl.readPixels` stall per settle** (1 readback
per settle in the measurement) — real but conditional on that mode.

> **Why it may feel slower than early versions (forward-looking, not a bisect):** the
> render is *accretion*. The escape shader grew colouring, lighting, post, outline,
> equipotential, trap, interior-DE, and periodicity into one fused pass, so appearance
> tweaks now pay for iteration. The interactive path grew a two-margin "collar" (2 extra
> full frames per settle) and an overlay repaint per progressive rung. Each addition was
> individually cheap; together they multiply the draws per gesture. The fixes peel work
> back out of the per-frame path rather than rewrite the renderer.

---

## Findings, prioritized

### P1 — do first (best confidence, on by default)

**P1-a · Appearance changes re-iterate the whole escape field.** *(empirically confirmed:
140 draws / 8 palette ticks, both plots)* Escape-time and colouring are one fragment pass,
so `setGradientRotation` / `setColoring` / `setLighting` / `setPost` / `setOutline` /
`setEquipotential` all call `scheduleRender(false)`, which re-runs the full iteration.
- **Fix S (low-risk):** in `main.ts`, wrap appearance-slider `input` handlers to mark an
  interactive gesture — `invalidateInteractionPreview()` + a low-res/low-iter draft during
  the drag, one full render on `change`/pointerup. Reuses existing draft infra; no shader
  change. Big cut to *drag* cost immediately.
- **Fix L (structural, biggest win):** render escape-time → an offscreen float texture on
  content change; a second fullscreen pass samples it and applies palette/lighting/post/
  outline/equipotential. All appearance controls become an instant recolour. Larger change
  (an FBO + a colourise shader split out of the ubershader), highest payoff.

**P1-b · Periodicity bailout does two `sqrt`/iter.** *(`shaderBuilder.ts:586`)*
`cabsf(csub(z,pRef)) < 1e-6*max(1,cabsf(z))` → two `length()`. Replace with the squared
form `dot(d,d) < 1e-12*max(1,dot(z,z))` (algebraically identical: `max(1,s)² =
max(1,s²)`). **Output-identical** for the flat-interior modes it is restricted to —
interior stays interior, exterior orbits move outward and never trip it. Runs every
interior iteration when periodicity bailout is on (the default). Cheapest safe win.

**P1-c · Escape predicate `abs(z) > k` compiles to a `sqrt`/iter.** *(`@cas/expr`
`glsl.ts` `emitBool`; `abs` → `cabs` = `length`)* The dominant hot loop, every pixel every
iteration. Peephole: when a `compare` is `abs(E) op realConst`, emit `cabs2(E) op k*k`
using a new squared-magnitude helper in the `@cas/gpu` stdlibs (single **and** df64).
**Not byte-identical** — a boundary pixel may escape ±1 iteration — so escape-count
goldens (`glslBudget` / any pinned-image test) must be regenerated and the change A/B'd
visually. Largest per-iteration win; in df64 it removes a full double-float magnitude per
step. Touches shared packages, so stage it carefully.

### P2 — high value, narrower or higher-effort

**P2-a · `ApplyPreset` recompiles both plots even when f/escape are unchanged.**
*(`glPlot.ts:2069–2086`; `applyChanges` routes every param edit through it)* Editing
iterations / resolution / c triggers two shader compile+link stalls for an unchanged
formula. Guard `rebuild()` on `preset.f`/`preset.escape` actually differing from the
current `_f`/`_esc` (capture before overwrite), **and** still rebuild when a
precision/perturbation/derivative-mode switch demands it. Not on the drag hot path
(already 0 recompiles), but a visible stall on every "Apply".

**P2-b · Histogram mode: synchronous `readPixels` per settle.** *(empirically 1
readback/settle; `glPlot.ts` `updateCdf`)* Build the CDF only on the final full-res rung
(skip drafts/intermediates), downsample the readback to 256² (equalisation needs no more),
or move to an async PBO readback. Conditional on histogram mode.

**P2-c · Deep-zoom perturbation rebuilds the reference orbit + BLA on every pan.**
*(`glPlot.ts` orbit cache)* Reuse the reference within a drift bound instead of recomputing
(reported ~35.7 ms + 4 MB at 65k iters per pan). Deep-zoom only, but a large per-pan CPU
stall there.

**P2-d · Deep zoom defaults to df64 (~13×) instead of perturbation** for
perturbation-eligible maps. Auto-select the perturbation path when eligible.

### P3 — smaller / situational

- **P3-a · "Collar" renders 2 extra full escape frames per settle** (part of the 9–12
  draws/step). Reduced-res collar, or only the largest margin, or gate by iteration cost.
- **P3-b · Overlay repainted every progressive rung + AA frame + preview frame.** Skip
  `afterRender` on accumulate/intermediate frames.
- **P3-c · Param-plane c-drag** recomputes both planes' orbit walks + per-pointermove DOM
  writes; inverse-Julia cloud (360k evals) + Siegel curves recompute per frame when those
  overlays are enabled. Debounce/skip during the gesture.
- **P3-d · `intPow`** uses linear repeated-multiply for even degrees 4/6/8 instead of
  exponentiation-by-squaring (breaks `glslBudget.test.ts` — regenerate). Minor.
- **P3-e · df64 ubershader** carries all derivative-mode functions → slow first-deep-zoom
  compile. One-time; low.

---

## Recommended first batch

The three P1 items, as one reviewable batch, deliver the clearest user-visible wins:

- **P1-b** (periodicity squared-form) — safe, output-identical, on by default.
- **P1-c** (escape-predicate squared-magnitude) — the headline kernel change; ships with
  regenerated goldens + a visual A/B.
- **P1-a Fix S** (appearance-draft during slider drags) — kills the empirically worst
  wasted-work signal using existing infra.

P2 (two-pass recolour, recompile guard, histogram readback, deep-zoom perturbation) is a
natural second batch. Correctness is preserved throughout — every change keeps the vitest +
node-test corpus green; P1-c and P3-d regenerate the escape-count goldens deliberately and
document the ≤1-iteration boundary shift.

---

## Update — P1 batch implemented (2026-08-22)

All three P1 items landed together.

**P1-b · Periodicity bailout, sqrt-free** (`shaderBuilder.ts`). The interior period-detection
step `cabsf(z − pRef) < 1e-6·max(1,|z|)` is now the squared compare
`dot(pd,pd) < 1e-12·max(1, dot(z,z))` — two `length()`/`sqrt` per interior iteration removed.
Algebraically identical (`max(1,s)² = max(1,s²)`) and output-identical for the flat-interior
modes it is restricted to: interior stays interior, exterior orbits never trip it.

**P1-c · Escape predicate, sqrt-free** (`@cas/expr` `glsl.ts` + `@cas/gpu`
`complexSingle/Df64.glsl.ts`). A new peephole in `emitBool` lowers `abs(E) op k` (k a real,
non-negative compile-time constant) to `cabs2(E) op k·k`, dropping a `length()`/`sqrt` from the
escape test every pixel every iteration (a full df64 magnitude at deep zoom). New `cabs2`
(squared magnitude, real) added to both precision stdlibs. NOT byte-identical — a boundary pixel
may escape ±1 iteration; the full corpus (including `escapeRadius`, `underIteration`,
`juliaImageMetrics` pixel-area, and the GLSL↔JS dual-backend browser harness) stays green,
confirming no user-visible drift.

**Reach & guard (2026-08-23 review follow-up).** The peephole fires in `emitBool` for **every**
`abs(E) op const` comparison, not only CD's escape predicate — so any `if(abs(z) op k, …)` inside
`f`, and any consumer that routes user conditionals through `compileF` (notably the **plotter**),
inherits both the sqrt-free speedup and the ≤1-ulp boundary shift (the plotter renders continuous
domain-coloring, so a sub-pixel branch flip is extremely unlikely to move a golden). `emitBool`
now also declines the fold when `k·k` would overflow float32 (k ≳ 1.8e19), falling back to the
`cabsf` sqrt form so a gigantic escape radius keeps working. Pinned by
`packages/expr/test/glslPeephole.test.ts` (in the package that owns the transform).

**P1-a (Fix S) · Appearance-slider drafting** (`main.ts`). Palette-rotation, lighting, post,
outline, and equipotential range-slider drags now drop both plots to the coarse draft level for
the gesture (reusing the pan/zoom draft machinery — full iteration cap, reduced resolution) and
refine to full resolution once the slider rests (180 ms settle, mirroring the wheel-settle path).
Discrete toggles/selects still apply directly.

**Measured** (profiler; SwiftShader, so counts not times):

| Interaction | draws before | draws after |
|---|---:|---:|
| appearance: palette-rotation sweep ×8 | 140 | **40** (−71%) |

The per-iteration sqrt removals (P1-b, P1-c) are not visible in draw *counts* — they cut GPU time
inside each draw, which SwiftShader cannot time representatively — but they compile and link in
real WebGL2 (single **and** df64, via the `shaderCompile.browser` harness) and preserve the image
corpus. Validation: `@cas/expr` (153) + `@cas/gpu` (45 node + 17 browser) + `complex-dynamics`
(827 node + 19 browser) all green; `eslint` + `dep:check` clean.

The Fix L structural two-pass recolour (P1-a) — which would make appearance changes O(pixels)
instead of O(pixels × iterations), eliminating the draft entirely — remains the P2 follow-up.

---

## Update — Fix L (two-pass recolour) implemented (2026-08-22)

The structural version of P1-a landed. Appearance-only changes on the covered modes now **recolour
a cached escape-time field instead of re-iterating** — full resolution, instantly.

**Architecture.** A new fractal-shader output mode (`uMode == 16`, `fieldAt`) writes the colouring
scalars — smooth escape value *s* (= relief height), `kmax`, decomposition sign, escaped flag — into a
persistent `RGBA32F` field texture, reusing the existing single/df64 kernels (no new precision paths).
A new precision-independent **colourise** fullscreen pass (`COLORIZE_FRAGMENT_SHADER`) samples that
texture and applies palette / rotation / gradient (+ the screen-space outline / equipotential overlays).
The field is built **lazily** — on the first appearance change after a content change — then reused; a
content change (`scheduleRender(true)`) invalidates it. An explicit `wantRecolor` flag (set by
`scheduleRender(false)`) drives the fast path.

**Scope (bounded, byte-exact).** Escape-family modes (smooth [default], escape, histogram,
decomposition) at AA = Off [default], single + df64, no sphere / projection / perturbation. Lighting is
**excluded** — its analytic-relief variant for holomorphic maps needs an orbit re-walk that a stored
scalar can't reproduce — so the recolour path is gated off when lighting is on (it keeps the Fix-S
draft path). Outline and equipotential ARE covered (screen-space derivatives of the stored height).
Complex modes (orbit-trap, stripe, multiplier, period, …) and AA ≥ 2× keep the fused + Fix-S path.

**Correctness.** A new real-WebGL2 parity test (`recolorParity.browser.test.ts`) proves a recolour is
**byte-identical** to a full fused render of the same view (via `canvas.toDataURL()`), both on first
recolour and on field reuse. `COLORIZE_FRAGMENT_SHADER` joins the shader compile gate; `fieldAt` rides
the existing `buildFragmentShader` precision-sweep compile tests (single + df64).

**Key subtlety.** The recolour check MUST precede the temporal-accumulation ("refine while idle") path:
that path intercepts every render, so an appearance change would otherwise restart a from-scratch
accumulate and re-iterate every sample. Reordered so appearance changes recolour first; accumulation
resumes on the next content change.

**Measured** (profiler; SwiftShader, counts representative):

| Interaction | before Fix L | after Fix L |
|---|---:|---:|
| appearance: palette-rotation sweep ×8 | 40 (Fix S draft) / 140 (fused) | ~42, cheap colourise passes |
| appearance: mode round-trip (recolour, field reused) | (full re-iterate each) | **4 draws** |

The palette-sweep count is dominated by the initial idle-accumulate tail caught in the measurement
window and per-recolour overlay repaints (a separate P3 item); the mode round-trip (4 draws for two
recolours across both plots) is the true recolour cost — the escape field is **not** re-iterated. On a
real GPU an appearance change on a covered view is now a single fullscreen colourise pass instead of a
full per-pixel escape loop.

**Validation:** `complex-dynamics` 827 node + (2 parity + 12 compile) browser green; `eslint` +
`dep:check` clean.
