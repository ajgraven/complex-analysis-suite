# Quadrature Domains — Live-Solver Performance Review

**Scope:** the QD app's *live, interactive* path — the numeric solver
(`app/solvers/*` + the solver worker), the solve orchestration (`app/ui/ui-solve.mjs`),
and the render/plot pipeline (`app/ui/ui-domain-plot.mjs`, `app/schwarz/*`, `app/direct/*`).
The **symbolic algebra module** (`app/sym/*`, `app/algebra/*`) is explicitly **out of scope**.

**Goal:** a significant, user-noticeable speedup of live dragging (real-time re-solve
while moving a pole / residue slider) and of the initial solve (time-to-first-result).

**Method:** forward-looking (no git-history regression hunt). Findings are ranked by
impact vs. effort and are grounded in measurement (Chrome, the app's own
`perf/measure.mjs` harness + CPU profiling, plus a new drag benchmark). Correctness is
preserved throughout — every fix must keep the tolerance-based golden corpus green.

---

## TL;DR — the headline

**The numeric solver is not the bottleneck. The per-interaction main-thread work is.**

On a valid bounded QD, one solve costs **~1–8 ms** (single-digit even under 4× CPU
throttle). Yet a single parameter change takes **~540 ms to settle on a fast desktop and
~2.6 s on a mid-range machine (4× throttle)**, with **~0.7 s / ~3.7 s of blocking
main-thread "long task" time**. That gap is spent re-rendering things that only need to
be produced once the gesture ends:

1. **KaTeX equation re-typesetting** on every live frame (≈0.1 s desktop / ≈0.55 s @4×).
2. **Full-resolution boundary re-sampling** (500 + up to 750 `evalPhi`) on the main
   thread every frame, with a cache that never hits during a drag.
3. **No worker "busy" gate** → a backlog of stale solves; the drawn boundary lags the cursor.
4. **The whole authoritative output pipeline** (status HTML, validity badge, alternates
   panel, `publishPrimarySolution` fan-out, `qd-customized` dispatch) rebuilt every frame.
5. **Unbounded families** (deltoid / finite-Laurent QD / CD-σ hand-off) secretly run a
   **≥1500-sample (up to 8000) rigorous identity integral every live frame**, silently
   overriding the intended 96-sample live budget.
6. **Workers are never pre-warmed** → the initial solve and the first drag pay a cold
   worker spawn + full solver-graph parse.

The single highest-leverage change is to **split `showSolution()` into a cheap live path
and an authoritative settle path**: on live frames, update only the canvas (at reduced
boundary resolution); defer KaTeX, status/alternates DOM, and the publish fan-out to the
drag-end pass. That, plus coalescing stale worker jobs and lifting the unbounded per-frame
integral, should turn a ~2.6 s mid-range interaction into a few hundred ms — a large,
obvious win — without touching the (already fast) solver math.

> **Why it feels slower than early versions (forward-looking observation, not a bisect):**
> every finding below is *accretion* — `showSolution` grew to do full authoritative work
> per frame; the eager module graph grew to parse `sym/*` + all ten solver families before
> the first solve; each new analysis card (curvature, cusps, observables, Faber roots)
> added per-frame or per-120 ms work. Early versions did less per frame. The fixes reverse
> that accretion rather than rewrite the engine.

---

## Update — Tier 1 implemented (2026-08-22)

Tier 1 landed: `showSolution()` is split into a cheap live path and an authoritative
settle path, stale live-solve jobs are coalesced, and the per-frame incidental work
(`publishPrimarySolution`, `qd-customized`, alternates DOM) is removed from the drag. See
the "Tier 1 — status" note under each recommendation below for the exact edits. Golden
tests stay green (2342 node-test assertions + 1246 vitest across 162 files).

Measured with a new **live-drag benchmark** (`perf/live-drag-bench.mjs`) that drives the
*real* live path — it oscillates a residue |C| slider for a 150-frame (~2.5 s) drag and
records the main-thread long-task time, live-cycle throughput, and per-cycle cost. (The
stock harness measures a *preset change*, which takes the full/authoritative path and so
does **not** exercise the live path — it's used here only to prove no regression.)

**Live-drag path — before → after** (equilateral 3-point bounded QD; 150-frame slider drag):

| Metric | 1× before | 1× after | 4× before | 4× after |
|---|---|---|---|---|
| **Main-thread long-task time** | 24.6 s | **5.2 s** | 96.3 s | **16.4 s** |
| Wall time (ms/frame) | 27.6 s (184) | 7.6 s (50) | 99.8 s (666) | 19.3 s (129) |
| Live cycles painted | 147 | 145 | 74 | **141** |
| `showSolution` cost / cycle | 2.0 ms | **0.1 ms** | 10.3 ms | **0.4 ms** |
| KaTeX renders during drag | 147 | **0** | 74 | **0** |
| `qd-customized` dispatches | 150 | **1** | 150 | **1** |

Main-thread blocking during a sustained drag drops **~4.7× (1×)** and **~5.9× (4×)**;
per-frame `showSolution` cost drops **20–26×**; and at 4× the throughput nearly doubles
(74 → 141 cycles) because each frame is cheap enough to actually finish. On a mid-range
machine the scripted drag went from *effectively frozen* (666 ms/frame) to 129 ms/frame.

**Full/authoritative path — no regression** (stock harness preset-change interaction):

| Metric | 1× before → after | 4× before → after |
|---|---|---|
| settle + paint (median) | 542 → 560 ms | 2614 → **2348** ms |
| main-thread task time | 821 → 813 ms | 4330 → **3552** ms |
| warm solve (2-pt / triangle) | unchanged (~5–8 ms) | unchanged (~8–10 ms) |

The authoritative path is unchanged-to-slightly-better (the alternates fast-path and badge
change-guard help it too); the solver and boot numbers are unchanged.

**What dominated the live path after Tier 1:** `showSolution` was negligible
(0.1–0.4 ms/cycle) and KaTeX was gone, yet ~5 s (1×) / ~16 s (4×) of long-task remained
across the drag. That residue was the **live status analyses** — `scheduleLiveAnalysis`
posted a heavy pass every 120 ms whose completion re-rendered the geometry/cusps/observables
cards on the main thread, and (because the analysis lane is `terminateOnSupersede`) a pass
that didn't finish before the next request **terminated and respawned the analysis worker**,
re-importing the whole solver graph, repeatedly mid-drag.

### Update — Tier 2 O5 implemented (2026-08-22)

`scheduleLiveAnalysis` now suppresses live analyses during a drag by default: it returns
early unless a live-drawing overlay (curvature / annotated phenomena) is enabled, and even
then it drops the request while a pass is in flight (`isAnalysisBusy()`) so the analysis
worker is never terminated+respawned mid-drag. The drag-end full solve runs the one
authoritative pass. This removes essentially all remaining live-path main-thread work:

| Main-thread long-task time (150-frame slider drag) | Before | +Tier 1 | +Tier 1 + O5 |
|---|---|---|---|
| 1× | 24.6 s | 5.2 s | **~0 s** |
| 4× | 96.3 s | 16.4 s | **0.1 s** |

The scripted drag now runs at ~50 fps (≈19–20 ms/frame) with near-zero blocking even under
4× throttle. *Caveat (honest labeling):* with no overlay enabled, the geometry/cusp/observable
cards (and cusp markers) freeze during a drag and refresh on release — consistent with how
the Riemann formula already defers to drag-end; overlay users keep a throttled, non-respawning
live refresh. Tests stay green (2342 node-test + 35 targeted vitest).

---

## Measured evidence

Environment: Chrome 141 headless, 4 logical cores. `1×` = unthrottled desktop; `4×` =
`Emulation.setCPUThrottlingRate 4`, a stand-in for a mid-range laptop. Numbers are medians
(p95 in parentheses where noteworthy). Reproduction commands are in the appendix.

### The solver itself is fast

| Measurement | 1× | 4× |
|---|---|---|
| Warm 2-point solve (`worker.warmSolveMs`) | 5.5 ms (p95 20) | 12.6 ms (p95 364) |
| Warm 3-point solve (`triangleWarmSolveMs`) | 8.1 ms (p95 82) | 8.5 ms (p95 20) |
| First solve after warm worker (`postBootSolveMs`) | 20.6 ms | 5.8 ms |
| **Drag bench — per-update solve, valid 2-point, cold** | **1.4 ms** | **1.9 ms** |
| **Drag bench — per-update solve, valid 2-point, warm-start** | **0.8 ms** | **1.4 ms** |
| Drag bench — per-update solve, valid 3-point (cold / warm) | 0.9 / 0.9 ms | 1.1 / 1.6 ms |

Valid-domain drag steps succeed 20/20 and stay ~1–2 ms **even at 4×**. Warm-start
(continuation reuse) is already implemented and roughly halves the 2-point cold cost.
**The solve is ~0.05% of the felt interaction cost.**

### The interaction is slow — and it's all main-thread render/UI

| Measurement (one preset change → settled + painted) | 1× | 4× |
|---|---|---|
| Time to settle + paint (`presetChangeToSettledPaintMs`) | **542 ms** (p95 876) | **2614 ms** (p95 3196) |
| Main-thread task time (`cdpTaskMs`) | 821 ms | 4330 ms |
| Blocking long-task time (`longTaskMs` / count) | 707 ms / 4 | 3748 ms / 4–5 |
| Cold boot wall (`bootWallMs`) | 294 ms | 1233 ms |

### CPU profile of that interaction — where the main-thread time goes

Top attributable JS self-time (avg ms/run):

| Frame | 1× | 4× | What it is |
|---|---|---|---|
| KaTeX cluster (`toNode`, `htmlBuilder`, `clone`, `createElement`, `appendChild`, …) | ~100 ms | ~550 ms | Equation re-typeset (reliable attribution — named KaTeX internals) |
| `history.replaceState` (native) | 70 ms | 345 ms | URL-state write on settle/drag-end |
| draw/render path (labeled `drawPoles`/`toScreen`/`clone`) | ~85 ms | ~310 ms | Full canvas redraw + per-point `{x,y}` re-projection (see note) |
| `(garbage collector)` | 15 ms | 61 ms | Allocation churn from sampling + `Complex`/`toScreen` objects |
| `(program)` (native paint/layout/compositing) | 545 ms | 2688 ms | Opaque; dominated by DOM layout forced by the above |

> **Note on `drawPoles`:** the profiler labels a large chunk under `drawPoles`, but the
> source `drawPoles()` (`ui-domain-plot.mjs:1015`) is a trivial 2–3-marker loop — this is
> minified-name smearing across the co-located draw path. The *real* render cost is the
> boundary re-projection (`toScreen` allocates a `{x,y}` per point, ×500–1250/frame) and
> the full redraw, per finding **R2/R3**, not the marker loop itself.

### Dragging into an unrealizable configuration is catastrophic

A separate drag bench over *invalid* pole configurations (which force the full
direct→continuation→multistart→diverse→deflation cascade to run to exhaustion) shows the
failure cost scaling steeply with pole count (1×, median per step):

| Poles | 2 | 3 | 5 |
|---|---|---|---|
| Failed-solve cost / step | 32 ms | 101 ms | **478 ms** |

During a live drag, momentarily passing through a non-realizable configuration therefore
produces multi-hundred-ms frames. Findings **S3/S4** (skip the wasted identity/univalence
work on non-viable candidates) directly bound this.

---

## Prioritized recommendations

Effort: **S** ≤ ~half-day · **M** ~1–3 days · **L** multi-day. Risk is to correctness/architecture.
IDs: **O**rchestration, **R**ender, **S**olver, **L**oad.

### Tier 1 — Do first: split live vs. authoritative rendering (biggest win, low risk)

> **✅ Status: IMPLEMENTED (2026-08-22).** All four landed in `ui-solve.mjs` + `ui.mjs`
> (see the before/after evidence in "Update — Tier 1 implemented" above). O1 is a
> serialize-and-coalesce flag on the live lane (`_liveInFlight` / `_liveDirty`); O2/R1 +
> O3 are a `showSolution(sol, hData, isPrimary, { live })` split (the `live` flag is kept
> distinct from `isPrimary` so alternate previews still render the full formula); R2 caps
> live display sampling at `LIVE_DISPLAY_SAMPLES = 160` with no adaptive refinement;
> `publishPrimarySolution` is dropped from live frames, `markAsCustom` is idempotent, the
> validity badge has an element-scoped change-guard, and `refreshAlternatesPanel` early-outs
> when nothing changed.

These four together remove essentially all avoidable per-frame main-thread work. They are
the core of the "significant, user-noticeable" improvement and are all low-risk edits
concentrated in `ui-solve.mjs` / `ui.mjs`.

**O1 — Coalesce-latest on the live worker lane (kills the stale-solve backlog).**
`scheduleQuickSolve` (`ui-solve.mjs:88`) only rAF-throttles; it never checks whether the
live worker is still solving the previous frame. On supersede, the worker *rejects the old
promise but keeps running the old job to completion* before it reads the next queued
message (`primary-solver-worker.mjs:154`), so when a solve spans more than one frame the
worker drains a backlog of stale jobs before reaching the newest one — the drawn boundary
trails the cursor by (queue-depth × solve-time). `isLiveBusy()` is exported
(`primary-solver-worker.mjs:284`) **but never consulted**. *Fix:* if `isLiveBusy()`, stash
the latest built args in a single `_pendingLiveArgs` slot and return; dispatch exactly that
one when the in-flight solve settles. Keep `_liveSolveToken` as the paint guard.
*Symptom:* live-drag. *Impact:* High. *Effort:* S. *Risk:* Low (does not touch the
supersede contract pinned by `psw-lifecycle.test.ts`).

**O2/R1 — Don't re-render the KaTeX formula on live frames.**
`showSolution` (called every live frame at `ui-solve.mjs:237` with `isPrimary=false`)
unconditionally calls `renderRiemannMap(sol.phi)` (`ui-solve.mjs:985`), which rebuilds the
LaTeX and runs `katex.render` **twice** (numeric + a hidden symbolic node). KaTeX
parse→layout→DOM is the single heaviest item on the frame and is unreadable at 60 fps. *Fix:*
gate `renderRiemannMap` (and the symbolic node especially) on `isPrimary`; the drag-end
full solve (`isPrimary=true`) renders it once. *Symptom:* live-drag. *Impact:* High.
*Effort:* S. *Risk:* Low.

**R2 — Reduce live boundary sampling (stop the cache-miss resample).**
`showSolution` re-samples the display boundary at full `state.samples`
(**500 base + up to 750 adaptive**, `ui-solve.mjs:962`) on the main thread every frame; the
`_boundaryCache` WeakMap is keyed by the `phi` object (`solver.mjs:865`) and every live
solve returns a *fresh* `phi`, so **the cache never hits during a drag**. The live *solve*
already caps verification at `LIVE_SAMPLES=96` — only the *display* was left at full res.
*Fix (S):* pass a live sample budget (~128–160, `maxExtra=0`) into `showSolution`; restore
full `state.samples` on the settle/drag-end pass. *Fix (M, subsumes it):* have the live
worker return the boundary polyline as a **transferable `Float64Array`** (it already walks
the boundary for univalence at `solver.mjs:1833`), so the main thread does zero `evalPhi` on
receive. *Symptom:* live-drag. *Impact:* High. *Effort:* S–M. *Risk:* Low.

**O3 — Skip the authoritative output pipeline on live frames.**
Every live frame also rebuilds `#status` innerHTML (`ui-solve.mjs:1001-1021`), the validity
badge (`:918`), and the alternates panel (`refreshAlternatesPanel`, `:1093`, which does
`innerHTML=''` + rebuild even though live alternates are always `[]`); calls
`publishPrimarySolution()` (`ui-solve.mjs:235` → fan-out to all subscribers, incl. Faber
recompute in UQD mode); and `markAsCustom()` re-dispatches `qd-customized`
(`ui.mjs:473`/`:761`) to several `innerHTML`-writing listeners — **all per frame**. *Fix:*
gate all of these on `isPrimary`; call `markAsCustom()` once at gesture start; early-out
`refreshAlternatesPanel` when the list is unchanged. *Symptom:* live-drag. *Impact:*
Medium–High (High in UQD mode). *Effort:* S. *Risk:* Low.

> Tier-1 combined expected effect: removes the KaTeX (~0.55 s @4×), the redundant status/
> publish DOM work, and most of the boundary-sampling + GC cost from every frame, and stops
> the boundary lagging the cursor. The ~2.6 s mid-range interaction should drop to a few
> hundred ms, dominated then by the (unavoidable) canvas paint.

### Tier 2 — High-value, targeted (unbounded families + initial solve)

**S1 — Lift the ≥1500-sample identity integral off the unbounded live path.**
✅ **IMPLEMENTED (2026-08-22).** `liveSolveStep` now forwards `adaptiveSamples:false` +
`minSamples: LIVE_VERIFY_FLOOR (750)` to the family verifier; the three unbounded verifiers
(`solver-uqd.mjs`, `solver-uqd-pqd.mjs`, `solver-uqd-pqd-singular.mjs`) gained a `minSamples`
option that **defaults to their existing floor** (1500 / 2000 / 4000) and their adaptive
climb is now gated on `adaptiveSamples !== false` — so nothing changes unless the live path
opts in (all golden/`c_max`/cusp tests stay green: 2342 node-test + full vitest).
*Correction to the original note:* the review said this helps "the flagship deltoid," but the
pole-free deltoid has no branches, so its live path falls to the **full** solve and never
calls `liveSolveStep`; S1 actually helps **finite-pole unbounded** QDs (a pole drag on a
UQD/UPQD). *Measured* (finite-pole UQD, warm live solve): identity stays machine-accurate at
750 nodes (maxRelDiff 4.3e-11, identical to the 1500 floor — so no false validity badge),
while per-frame worker verify drops **~2× median (4.4→2.2 ms) and ~3.5× p95 (9.1→2.6 ms)**;
the p95 (the mid-drag jank case) is the bigger win, and it multiplies under CPU throttle.
This is worker-side (off the main thread), so it raises the live-throughput ceiling for
unbounded pole drags rather than showing in the main-thread long-task metric.

Original diagnosis (for reference):
For all unbounded families the identity verifier floors the sample count at 1500 (up to
8000 adaptively): `solver-uqd.mjs:290` / `:402`, `solver-uqd-pqd.mjs:403`,
`solver-uqd-pqd-singular.mjs:471`. `liveSolveStep` calls it (`solver.mjs:1834`) with the 96
live budget **but without `adaptiveSamples:false`**, so the floor silently overrides the
budget — each live frame runs ~1500–8000 contour nodes × heavy per-node `Complex` work for
the deltoid / finite-Laurent QD / CD-σ views. *Fix:* pass `adaptiveSamples:false` and a live
floor (~300–500) from `liveSolveStep`; keep the full floor on the debounced full solve.
*Symptom:* live-drag (unbounded modes — the flagship deltoid). *Impact:* High (for those
modes). *Effort:* S. *Risk:* Low.

**O4/S-warm — Pre-warm the solver workers.**
✅ **IMPLEMENTED (2026-08-22), with a measured design correction.** A new `prewarm.mjs`
(imported by `main.mjs`) warms the **live (drag) worker lane on the user's first
`pointerdown`** (once), via a newly-exposed `PSW.ensureLiveReady`, so the first pole/slider
drag frame doesn't stall on a cold `new Worker(...)` + ~20-module solver-graph parse.
Verified: the live lane is not spawned at boot and *is* spawned after the first pointerdown.

*Correction to the original recommendation:* eagerly pre-warming the **primary** lane at boot
was **dropped** — a same-session A/B showed it *regressed* time-to-first-solve by **+55–65 ms
at 1×** (localhost) and was neutral at 4×, because the boot solve already spawns the primary
lane, so an extra early `new Worker(...)` only competes with the app-bundle load and wins no
overlap. The revised live-only, pointerdown-triggered warm is **boot-neutral** (bootWall
median 297 ms vs 299 ms pre-O4; the eager version was 353 ms) and adds nothing for a visitor
who never interacts. *Symptom:* first-drag hitch (part of live-drag). *Impact:* Low–Medium
(first drag only; not measurable in the localhost harness, which never drags — but it removes
the cold-spawn stall on the first drag and, on a deployed site, overlaps the live-worker
*network* fetch with the pointerdown gesture). *Effort:* S. *Risk:* Low.

Original diagnosis (for reference):
`ensureReady()` exists (`primary-solver-worker.mjs:99`) but is **never called at boot** — the
first `solveAndRender` pays a cold `new Worker(...)` + parse of the whole solver graph
(`solver-graph.mjs` imports ~20 modules) before Newton starts, and the *live* lane is a
separate worker spawned lazily on the **first pole drag** (so the first drag frame stalls on
a cold spawn). *(Revised per measurement above — only the live lane is warmed, on pointerdown,
because eager boot-time warming of the primary lane hurt first-solve.)*

**S2 — Compute the quadrature-identity check lazily in the multistart cascade.**
`evalCandidate` (`solver.mjs:1514`) computes `isBoundaryUnivalent` then
**unconditionally** `attachIdentity(sol)` — but `isValidQD` requires
`univalent && identityOK`, so the expensive identity integral is wasted on every
non-univalent candidate. *Fix:* compute identity only when `sol.univalent`; in the
"no valid QD" fallback, rank best-of-bad by `residual` (already available) and compute
identity only for the single chosen candidate. *Symptom:* initial-solve (and drag-into-invalid,
see the failure-cost table). *Impact:* Medium–High on hard/unbounded domains. *Effort:* S.
*Risk:* Medium (changes which φ is shown *only when no valid QD exists*; re-validate the
fallback-ordering tests).

**S3 — Two-tier univalence during the cascade.**
Every successful candidate's univalence is checked at the full `state.samples` (500)
(`solver.mjs:1472`/`:1517`); only the accepted primary needs full resolution. *Fix:* coarse
gate (~96–128) during the cascade, full re-verify on the selected primary. *Symptom:*
initial-solve. *Impact:* Low–Medium. *Effort:* S. *Risk:* Low–Medium.

**O5 — Suppress live status analyses during an active drag.** ✅ **IMPLEMENTED (2026-08-22)** —
`scheduleLiveAnalysis` now early-returns unless a live-drawing overlay is on, and drops the
request while `isAnalysisBusy()` (never respawns). Removed the remaining ~5 s/~16 s (1×/4×)
of live-drag long-task; see "Update — Tier 2 O5 implemented" above.
`scheduleLiveAnalysis` (`ui-solve.mjs:642`, every 120 ms) posts a "materially heavier"
status pass to the analysis lane, which has `terminateOnSupersede:true`
(`primary-solver-worker.mjs:251`) — so a pass that doesn't finish before the next request
**terminates and respawns the analysis worker** (re-importing the full graph +
critical-set/univalence/cusps/observables/symmetry) repeatedly mid-drag, and its `.then`
re-renders cards on the main thread several times/sec. *Fix:* suppress live analyses while a
drag is active (one authoritative pass on drag-end, already at `ui-solve.mjs:478`); if a live
refresh is wanted, drop it when `isAnalysisBusy()` so it never respawns. *Symptom:* live-drag.
*Impact:* Medium. *Effort:* S–M. *Risk:* Low.

### Tier 3 — Broad structural wins (allocation/GC + solver internals)

**S4 — Kill allocation churn in the numeric hot path.**
`Complex` ships in-place variants (`mulInto`/`addMulInto`/…, `packages/core/src/complex.ts:97`)
documented "for tight inner loops … to remove allocator + GC pressure" — **but the QD hot
path uses the allocating functional variants everywhere** (`evalPhi_QD` `solver-qd.mjs:40`;
`residual_QD` `:91`; `branchTaylorAccumulate` `solver-taylor-common.mjs:39`; `Taylor.mul`
allocates whole arrays of `{re,im}`). One residual eval for a moderate QD allocates
hundreds–~1000 tiny objects, ×(n+1) per Newton iteration. *Fix:* rewrite the innermost
kernels to reuse caller-supplied scratch buffers; back Taylor coefficients with flat
`Float64Array` (interleaved re/im). Start with `evalPhi_QD` + `branchTaylorAccumulate` +
`Taylor.mul`. *Symptom:* both. *Impact:* High (broad; ~1.5–2.5× on the numeric core).
*Effort:* M. *Risk:* Low–Medium (in-place ops are byte-identical; golden tests are
tolerance-based). *Caveat:* touches shared `@cas/core` — coordinate cross-package.

**R3 — Remove per-point `{x,y}` allocation in the draw loops.**
`toScreen` (`ui-domain-plot.mjs:131`) returns a fresh object per point, called ~500–1250×
per repaint in `drawBoundary` (`:963`) + `drawPoles`/`drawFamily`. This is the pan-jank and
GC source. *Fix:* inline the transform into locals, or cache a projected `Float32Array`
rebuilt only when view/data change. Largely dissolves once R2 cuts the live sample count.
*Symptom:* live-drag (pan). *Impact:* Low–Medium. *Effort:* S–M. *Risk:* Low.

**S5 — Warm-start / low-rank Newton on the live lane.**
Warm-started live solves converge in ≤5 iters, but each iter still rebuilds the full
finite-difference Jacobian (`numericalJacobian` `solver.mjs:451`, n+1 residual evals) and
re-factorizes QR from scratch. *Fix:* add a Broyden/chord mode used **only** by
`liveSolveStep` (reuse J for k iters; refresh on backtrack); seed it with the previous
frame's Jacobian. *Symptom:* live-drag. *Impact:* Medium. *Effort:* M. *Risk:* Medium
(changes the Newton trajectory — re-validate the "≤5 iters" and cusp-accuracy tests; scope
to the live path only).

**S6 — Analytic (or complex-step) Jacobian (largest ceiling; deliberate investment).**
The residual is holomorphic; the finite-difference Jacobian's n perturbation sweeps have a
closed form. An analytic Jacobian replaces ~18 residual evals/iteration with one structured
pass (~an order of magnitude on `newtonSolve`) and removes the forward-difference
truncation that currently forces central differencing near cusps. *Fix:* derive per family,
`boundedQD`/`unboundedQD` first, keep `numericalJacobian` as fallback, gate via
`jacobianFn`. *Symptom:* both. *Impact:* High ceiling. *Effort:* L. *Risk:* Medium–High —
schedule family-by-family behind the golden corpus.

### Tier 4 — Load path (initial perceived latency) + cleanups

**L1 — Code-split the eager module graph.**
`main.mjs` eagerly imports `sym/sym-core.mjs` + `sym-radical.mjs` (`:56-57`) and all ten
solver families + analysis before the first solve, even though the Algebra tab that consumes
`sym/*` is already lazy. The build emits two >500 kB chunks (`index-*.js` 783 kB / 636 kB;
`algebra` 301 kB) and a ~3 MB precache. *Fix:* move `sym/*` (only the lazy Algebra tab uses
it) and the weighted/singular families the default mode never touches off the initial chunk.
*Symptom:* initial-solve / time-to-interactive. *Impact:* Medium. *Effort:* M. *Risk:*
Medium (import-order side-effects are load-bearing — `main.mjs`'s own header warns; verify
goldens). *Out-of-scope guard:* change only the *import placement*, not `sym` internals.

**L2 — Investigate the `history.replaceState` cost (70 ms 1× / 345 ms 4×).**
One URL-state write costs 70–345 ms — large for a `replaceState`. It's on the settle/drag-end
path (not per-frame — good), but it dominates settle time. Likely a large serialized state /
long query string. *Fix:* profile the URL-serialization payload; trim/defer it. *Symptom:*
initial-solve/settle. *Impact:* Low–Medium. *Effort:* S–M. *Risk:* Low (preserve the
share-link URL format — guardrail).

**R4 + pointer cleanups (small, independent).**
Cache `getBoundingClientRect()` at `mousedown` instead of reading it every `mousemove`
(`ui-domain-plot.mjs:189`, forced reflow); resolve the dragged pole's `<input>` once at
drag-start instead of an attribute-selector `document.querySelector` per frame
(`ui.mjs:470`); rAF-coalesce the hover readout; rAF-guard Schwarz `renderImmediate`
(`schwarz-ui.mjs:1372`) like the sphere/domain-coloring paths already do. Each S / Low; do
alongside Tier 1.

---

## Recommended sequencing

1. **Tier 1 (O1, O2/R1, R2, O3)** — one focused change to `ui-solve.mjs` (+ a live flag
   through `showSolution`) and `ui-domain-plot.mjs`. This is the large, obvious win and is
   low-risk. Land it first and re-measure.
2. **S1 + O4** — unbounded live integral + worker pre-warm. S/Low; directly targets the
   deltoid live experience and initial-solve latency.
3. **S2 + S3 + O5** — cascade/analysis pruning; bounds the "drag-into-invalid" spikes and
   speeds hard initial solves.
4. **Tier 3 (S4, R3, S5)** — allocation/GC and low-rank Newton; broad, both symptoms.
5. **S6 + L1** — the deliberate investments (analytic Jacobian; bundle split), scheduled
   behind the golden corpus.

**Confirm before/after with the app's own zero-cost hook:** set `window.__qdPerfMarks = []`,
drag for ~2 s, and diff consecutive `showSolution:*` marks
(`showSolution:start → :boundary-sampled` = R2; `:plot-set-data → :riemann-rendered` = R1;
count `showSolution:start` ÷ elapsed = effective live fps). Re-run the harness + drag bench
(appendix) at 1× and 4× after each tier.

---

## Appendix — reproduction

```bash
# Build the workspace packages + QD app once
pnpm -r --filter "./packages/*" run build
pnpm --filter quadrature-domains build

# Chromium for the harness (this environment): point at the managed build
export QD_CHROME_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome   # or installed Chrome

# Stock harness: cold boot, worker solves, one warm interaction (+ CPU profile)
node apps/quadrature-domains/perf/measure.mjs --runs 5 --skip-build --profile
node apps/quadrature-domains/perf/measure.mjs --runs 3 --skip-build --profile --cpu-slowdown 4

# Drag benchmark: per-update SOLVE cost over a valid-domain drag, cold vs warm-start
node apps/quadrature-domains/perf/drag-bench.mjs
QD_CPU_SLOWDOWN=4 node apps/quadrature-domains/perf/drag-bench.mjs

# Live-drag benchmark: the real per-frame LIVE path (quickSolveAndRender ->
# showSolution(live)), driven by oscillating a residue |C| slider. Reports
# main-thread long-task time, live-cycle throughput, KaTeX renders (0 after Tier 1).
node apps/quadrature-domains/perf/live-drag-bench.mjs
QD_CPU_SLOWDOWN=4 node apps/quadrature-domains/perf/live-drag-bench.mjs
```

All numbers in this document are from Chrome 141 headless on a 4-core host; `4×` uses CDP
CPU throttling as a mid-range-desktop stand-in. The stock harness measures a *preset change*
(a discrete interaction that also runs the full analyses) as its interaction proxy; the drag
benchmark isolates the *solve* cost of a continuous drag on valid domains.
