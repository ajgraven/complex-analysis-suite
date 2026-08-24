# A7 — Consolidation & Performance (cross-cutting) re-review

**Scope:** whole-suite cross-cutting duplication/consolidation-into-`@cas/*` and cross-cutting
performance anti-patterns — the two themes the user weighted most. I (1) **verified the three
consolidations the prior review landed** (`pointInPolygon`→`@cas/core/geometry.ts`,
`rootsMonic`→`@cas/core`, SC corner-cluster→`@cas/conformal/cornerClustering.ts`) are clean with no
orphaned copies; (2) hunted **new/remaining** duplication across the brief's primitive categories; and
(3) scrutinized the two big recent perf PRs (#294 CD render, #292 QD live-solver) for both latent
regressions and **perf-consolidation** opportunities (a technique one app applied that another should).
READ-ONLY; no builds/tests run. **Headline: the shared substrate is in good shape** — the three landed
consolidations are bit-clean, the exterior-SC engine and GLSL substrate are well-factored, and the two
riskiest perf rewrites I traced are correct. Findings are modest (LOW/NIT), most-severe first.

---

## Part 1 — Consolidation

### [PASS] The three landed consolidations are clean — verified, no orphans
- **Area:** `@cas/core`, `@cas/conformal` · **Location:** `packages/core/src/geometry.ts:28`,
  `packages/core/src/rootsMonic.ts`, `packages/conformal/src/cornerClustering.ts`
- **Type:** consolidation (verification)
- **Confidence:** high · **Fix-safety:** safe-now (nothing to change)
- **Evidence:**
  - **`pointInPolygon`** — the only TS function body is `geometry.ts:28`. `@cas/schwarz`
    (`index.ts:14`), `apps/riemann-map/src/domains.ts:48`, and `apps/argument-principle/src/contour.ts:45`
    each *re-export* from `@cas/core`; `@cas/conformal/cornerClustering.ts:19` and `.../contour.ts:70`
    *import* it. A repo-wide grep for `function pointInPolygon`/`pointInPolygon =` in TS returns only
    `geometry.ts` (+ its `dist/`). QD's `{re,im}` variant + binned accelerator
    (`schwarz-common.mjs:144`/`:194`) is correctly left at the QD edge per ADR-0008.
  - **`rootsMonic`** — CD `render/critical.ts:23` imports `evalPolyHorner/trimPoly/rootsMonicClosure`
    (used `:173,:210,:215,:216`); AP `singularities.ts:16` imports `rootsMonic` (used `:234,:235,:272`).
    No local `evalPoly`/`trimPoly`/`0.4, 0.9` spiral seed survives in either file (grepped). The
    caller-side residual policy split (`rootsMonicClosure` raw for CD, `rootsMonic` filtered for AP) is
    exactly right and mirrors ADR-0018's rank-policy pattern. Correspondences deliberately left as a
    divergent 3rd consumer (roots-of-unity seed + deflation + d≤2 closed forms) — documented and correct.
  - **`cornerClustering`** — `clusteredRadii`/`clusteredEdgeSamples`/`outwardCornerDir` exported from
    `@cas/conformal/index.ts:22`; consumed by `scMap.ts:107,118,124`, `forwardMap.ts:38`, and
    `riemann-map/domains.ts:57,73,75`. The root-exponential law `exp(−σ(√N−√k))` now appears **only** in
    `cornerClustering.ts:37` (grepped). The divergent policies are preserved as params: scMap passes
    `offset 0.5` + `onStraight:"normal"` + `probeEps 1e-4·scale`; domains passes `offset 0` +
    `onStraight:"skip"` + `probeEps 0.01·L`; forwardMap uses only `clusteredRadii` (the pole side). The
    overload signature on `outwardCornerDir` (`"normal"`⇒non-null, `"skip"`⇒nullable) is well-typed.
- **Why it matters:** confirms the prior review's headline fixes actually delegate — a future robustness
  fix now lands in one place, not 3–5.
- **Recommendation:** none.

### [LOW] Faber `mathText.ts` inline-math markup→DOM renderer — speculative (single consumer, NOT yet ADR-0007)
- **Area:** `apps/faber-transform` · **Location:** `apps/faber-transform/src/mathText.ts:26` (`parseMath`),
  `:56` (`mathFrag`), vs `apps/argument-principle/src/main.ts:565,1203,1219` (hardcoded `<sub>` in innerHTML)
- **Type:** consolidation · **Confidence:** high · **Fix-safety:** needs-review
- **Evidence:** Faber added (churn #293/#295) a tiny `_{…}`/`^{…}` markup → real `<sub>/<sub>` DOM
  renderer (safe: text-nodes only, no innerHTML). It is **complementary, not duplicative**, of
  `@cas/core/format`'s `subscript`/`superscript` (which emit Unicode chars for canvas legends — faber's
  own header notes it uses those for the 2-D context). `packages/faber/src/format.ts` even added an
  optional `sup` callback (churn) so its poly formatter can feed *either* the Unicode helper *or*
  mathText's `^{k}` markup — clean interop, no duplication there. **But** AP currently typesets its math
  with hand-written `<sub>γ</sub>` string fragments in innerHTML — the exact job `mathText` does more
  safely. This is a *speculative* (B) candidate: `mathText` has one consumer today, so ADR-0007 is **not**
  met. If AP (or any app) is migrated off hardcoded `<sub>` markup onto a shared markup renderer, that
  becomes the second consumer and the trigger to lift `mathText` into `@cas/core` (beside `format.ts`).
- **Why it matters:** low now; a latent DRY win and an XSS-safety upgrade for AP's innerHTML sites if a
  2nd consumer appears.
- **Recommendation:** leave as-is (single consumer). Record as the ADR-0007 trigger for a future
  `@cas/core` inline-math renderer; if AP's typesetting is ever touched, prefer adopting `mathText` (and
  then extract) over adding a second markup parser.

### [NIT] Prior-review roadmap #4 (trivial complex helpers) & #5 (`formatComplex`) remain unlanded
- **Area:** cross-cutting · **Location:** as enumerated in `.../2026-08-suite-review/findings/10-consolidation-duplication.md:130,154`
- **Type:** consolidation (status) · **Confidence:** high · **Fix-safety:** needs-review
- **Evidence:** Only consolidations #1/#2/#3 landed (PROGRESS.md). The prior review's **#4** (per-app
  `cabs`/`cdiv`/`cmul`/`finite` re-declared despite `@cas/expr/complexJs` + `@cas/core` `tupleAlgebra`)
  and **#5** (`formatComplex`/`fmtComplex` per-app, `@cas/core/format` holds only `subscript`/
  `superscript`) are still open. Both were already classified **B / speculative** there (single-consumer
  convenience, or per-app-tuned display), and no churn since Aug 17 changed that. Not re-litigating — I
  confirm they remain open and remain correctly B (low payoff, no forced ADR-0007).
- **Recommendation:** leave for opportunistic cleanup as those files are touched, per finding 10.

### [PASS] Negative confirmations — checked, NOT duplication
- **Exterior Schwarz–Christoffel engine is well-factored (no new duplication).**
  `exteriorScParameterProblem.ts:20-21` reuses the interior solver's `dampedGaussNewton` driver
  (`gaussNewton.ts`) **and** its prevertex parametrization helpers (`interiorAngles`,
  `logitsFromPrevertices`, `minGap`, `prevertsFromLogits`, `uniformPrevertices` from
  `scParameterProblem.ts`). The exterior family is `@cas/conformal`'s 2nd SC family (ADR-0020 interior +
  exterior), sharing the driver as intended — not a copy. The #296 change (expose `orderedVertices` so the
  faber editor can match input↔prevertex order) is a clean API addition.
- **Möbius / Blaschke are not duplicated.** The many hits are preset *formula strings*
  (`riemann-map/presets.ts:21,27,29`, plotter/CD presets) evaluated by `@cas/expr`, plus an **unrelated
  number-theoretic** μ(n) (`complex-dynamics/combinatorics/dynatomic.ts:32`). No shared geometric
  Möbius/Blaschke numeric primitive exists to duplicate. No action.
- **GPU/GLSL substrate stays consolidated (ADR-0016).** The only package GLSL changes since Aug 17 are
  the shared `cabs2` additions + the `@cas/expr` peephole (Part 2). All GLSL-emitting apps still inject
  the shared `@cas/gpu` stdlibs (verified colorShader/surfaceShader/sphereShader in the plotter, faber
  `render/gpu.ts`, correspondences `gpu.ts`/`paramGpu.ts`).
- **`debounce` is not a cross-cutting extraction case.** Only QD defines a named `debounce`
  (`ui/ui.mjs:231`); other apps inline `requestAnimationFrame`/`setTimeout`. No 2nd consumer of a shared
  debounce helper. Leave.

---

## Part 2 — Performance

### [LOW] Perf-consolidation gap: sqrt-free escape/threshold tests not applied to Correspondences' CPU escape loops
- **Area:** `apps/correspondences` · **Location:** `apps/correspondences/src/tricorn.ts:35`
  (`Math.hypot(z[0], z[1]) > escapeR`, inside `tricornEscape`'s per-iteration loop, driven per-pixel by
  `classifyTricornBand` `:42`), `apps/correspondences/src/family.ts:123` (`criticalEscape` guard) and its
  `escapeToInfinity` orbit loop, `apps/correspondences/src/orbitTree.ts:49`
  (`Math.hypot(node.point…) > escapeR`)
- **Type:** perf · **Confidence:** high (the transform is exact) · **Fix-safety:** needs-review
- **Evidence:** #294 (CD, GLSL peephole `abs(E)>k ⟹ cabs2(E)>k·k`) and #292 (QD S4, JS `distBoundarySq`/
  `distPoleSq`) both established the same sqrt-free technique: for a threshold test `|z| op R` with
  `R ≥ 0`, `|z| op R ⟺ |z|² op R²` (x↦x² monotone on [0,∞)). Correspondences' CPU escape classifiers were
  **not** given this treatment. `classifyTricornBand` is the clear case: W×H pixels × up to `maxIter`
  (64) iterations, each doing a `Math.hypot` that could be `z[0]*z[0]+z[1]*z[1] > escapeR*escapeR` with
  `escapeR²` hoisted out of the loop. (Same op count improvement CD's peephole gets per shader iteration,
  here on the CPU.) `orbitTree` shows the team already did an allocation pass here (`corr-orbittree-01`),
  so the codebase is receptive to this class of fix.
- **Why it matters:** removes one `sqrt`/hypot per pixel per iteration on the correspondences param
  planes. **Priority is LOW** only because `apps/correspondences` is built-but-**not-published**
  (CLAUDE.md status; launcher shows "Coming soon"), so no user is currently affected. It is the cleanest
  remaining place to apply the suite's now-established sqrt-free pattern when correspondences is next
  touched.
- **Recommendation:** hoist `escapeR*escapeR` and compare squared magnitude in `tricornEscape`,
  `escapeToInfinity`, and `orbitTree`. Node-testable, exact (no boundary shift — unlike the GLSL peephole,
  the CPU version compares the same `dot` on both sides). Pin the existing escape-count corpus before/after.

### [LOW] CD `JuliaMetricsClient` has response-side stale-drop but no send-side worker coalescing (QD #292-O1 pattern)
- **Area:** `apps/complex-dynamics` · **Location:** `apps/complex-dynamics/src/render/juliaMetricsClient.ts:56`
  (`request` posts every message), mitigated by `apps/complex-dynamics/src/main.ts:2094` (`scheduleJuliaMeasure`, 350 ms debounce)
- **Type:** perf · **Confidence:** medium · **Fix-safety:** needs-review
- **Evidence:** `request()` calls `this.worker.postMessage(...)` for **every** request; the `reqId` guard
  (`:45`) only drops **stale responses** — it does not stop the worker from *computing* every queued job.
  This is exactly the stale-backlog QD's O1 fixed (worker drains a backlog of superseded solves before
  the newest). **However**, the sole caller is debounced 350 ms (`scheduleJuliaMeasure` clears+resets a
  timer) and gated on the metrics panel being open, and the grid is 128², so a burst coalesces to ~one
  request per settle. The residual exposure is narrow: on a slow machine where a single 128² metrics
  compute outlasts 350 ms, a second settle can queue a job behind the running one (the worker computes
  both; only the latest paints). That is the same waste QD O1 removes with a busy-gate + single pending
  slot, but here it is bounded to at most a couple of jobs, not a per-rAF backlog.
- **Why it matters:** low — the debounce already covers the common case; this is a belt-and-suspenders
  win for slow machines / heavy formulas, and a place the QD O1 technique transfers directly.
- **Recommendation:** optional. Add a send-side busy-gate to `JuliaMetricsClient` (stash latest `req` if
  a compute is in flight; dispatch it on the next response), mirroring QD's `_pendingLiveArgs`. Not
  urgent given the upstream debounce.

### [NIT] CD P1-c peephole is documented as the "escape predicate" but applies to ALL `compileF` conditionals — the plotter inherits it (mostly good)
- **Area:** `@cas/expr` (blast radius: plotter) · **Location:** `packages/expr/src/glsl.ts:107`
  (`emitAbsSquaredCompare`), `:151` (call site in `emitBool`)
- **Type:** perf / stale-doc · **Confidence:** high · **Fix-safety:** needs-review
- **Evidence:** The peephole fires in `emitBool` for any `compare` node `abs(E) op k` (or mirrored) with
  `k` a non-negative real compile-time constant. `emitBool` is reached by every conditional in every
  `compileF`/`compileEscape` output — not just CD's escape test. So a **plotter** user expression like
  `abs(z) < 1 ? z : 1/z` now also lowers to `cabs2(z) < 1.0`. I verified this is **safe**: (a) the
  transform is mathematically sound for `<,>,<=,>=,!=` (a,k≥0 ⇒ a op k ⟺ a² op k²; `==` is handled
  earlier and never reaches it; negative k is correctly excluded); and (b) every consumer that could emit
  `cabs2` injects a stdlib that defines it — plotter `colorShader.ts:45`/`render3d/surfaceShader.ts:78`/
  `sphereShader.ts:34` all inject `COMPLEX_SINGLE_GLSL`, which now has `cabs2`; faber/correspondences
  inject it too but don't route user comparisons through `compileF`. So the plotter gets a **free
  sqrt-free win** on user conditionals — a genuine perf-consolidation already achieved at the package
  level. The only caveat: the documented ≤1-ulp boundary shift (`dot(E,E)` vs `length(E)²`) now also
  applies to **plotter user conditionals**, not only CD's escape count. The commit message + P1-c doc
  frame this purely as "the escape predicate," understating the reach.
- **Why it matters:** benign and net-positive, but the doc under-describes the blast radius; a reader
  auditing plotter image goldens for a boundary seam wouldn't know this peephole touches them.
- **Recommendation:** add one sentence to `docs/perf/cd-render-review.md` P1-c (and/or the `glsl.ts`
  comment) noting the peephole applies to **all** `compileF` conditionals, so the plotter inherits both
  the speedup and the ≤1-ulp boundary shift; A/B any pinned plotter image goldens once (they render
  continuous domain-coloring, so a sub-pixel branch flip is extremely unlikely to move a golden — the
  `@cas/expr` 153-test suite stayed green).

### [NIT] QD `branchTaylorAccumulate` "allocation-free" is slightly overstated (still 8 typed-array allocs/call)
- **Area:** `apps/quadrature-domains` · **Location:** `apps/quadrature-domains/app/solvers/solver-taylor-common.mjs:44`
- **Type:** perf / stale-doc · **Confidence:** high · **Fix-safety:** safe-now (doc/comment only)
- **Evidence:** The S4-part-3 rewrite (commit 43bd076) replaces per-term `Complex`/`Taylor` object churn
  with flat `Float64Array` scalar buffers — a real, large win (`Taylor.mul` self-time 1371 ms → 2 ms per
  the doc). But it allocates **8 fresh `Float64Array(n)`** per call (`resRe,resIm,uRe,uIm,pRe,pIm,tRe,tIm`)
  plus the final `result[i]={re,im}` objects; the commit title and code comment call it "allocation-free."
  It is *object-churn-free* / *per-term-allocation-free*, not allocation-free. (I **traced the numerics
  and found them correct**: α = 1−conj(zⱼ)·z0, αInv = conj(α)/|α|², the incremental
  conj(zⱼ)^{l−1}·αInv^{l+1} power ladder, conj(A) accumulation, and the truncated convolution
  t[i]=Σⱼ p[j]·u[i−j] all match the original `Taylor` path; the aliasing concern is correctly resolved by
  writing fresh objects and only reading the caller's originals. No regression.)
- **Why it matters:** cosmetic; the buffers could be hoisted to module-level scratch (reused across calls)
  to make it truly per-call allocation-free, since the function is single-threaded and non-reentrant — a
  further small GC win on the hottest numeric-core frame.
- **Recommendation:** soften the "allocation-free" wording to "per-term-allocation-free," or (optional
  perf) hoist the six scratch buffers to module scope sized to the max `n` seen. Low priority.

### [PASS] Recent perf rewrites I traced are correct — no regressions found
- **QD S4-part-2 sqrt-free clearance** (commit 4bb98f5, `chooseHoleTestPoints`): `distBoundarySq`/
  `distPoleSq` feed only a *ranking* and a `> 0` *filter*; x↦x² is monotone on [0,∞) and min(a²,b²) =
  (min a,b)² for a,b≥0, so the selected test points are provably unchanged. Correct. (Trivial comment
  typo "monotincreasing".)
- **CD Fix-L two-pass recolour** (commit 0453f52): correctly **excludes lighting** (needs an orbit
  re-walk a stored scalar can't reproduce) and gates the recolour path off when lighting is on; the
  self-flagged ordering subtlety (recolour check must precede temporal-accumulate) is handled; a
  real-WebGL2 `recolorParity.browser.test.ts` pins byte-identity. This is CD-internal (a CD-focused agent
  should own the deep read of `glPlot.ts`'s new field-texture/FBO plumbing); from the cross-cutting lane I
  found no correctness gap and no cross-app duplication introduced.
- **Faber & Riemann-map draggable-vertex editors already do the draft/final split** the perf PRs
  advocate: faber refits SC on **pointerup** only (`main.ts:406,731`; live redraw during drag), and the
  RM SC studio refits fast/lightning while dragging + precise/warm on release (CLAUDE.md, ADR-0020's
  drag-then-refine). No missing-draft perf gap in either.

---

## Coverage

**Examined (read source):** the three landed consolidation targets in full
(`core/geometry.ts`, `core/rootsMonic.ts`, `conformal/cornerClustering.ts`) + every consumer/re-export
site (grepped and read the import lines); `@cas/expr/glsl.ts` `emitAbsSquaredCompare`/`emitBool` peephole
and the `@cas/gpu` `cabs2` additions, tracing every `compileF`/`compileEscape` consumer
(plotter plot/colorShader/surfaceShader/sphereShader, faber, correspondences, CD shaderBuilder, gpu
dualBackend) for `cabs2` availability; the QD S4 diffs 46f5bbc/4bb98f5/43bd076/edbedda
(`branchTaylorAccumulate` traced numerically end-to-end; `distBoundarySq` clearance verified monotone);
the CD perf review doc + `JuliaMetricsClient` + its debounced caller; faber `handleEdit.ts`/`mathText.ts`/
`polygon.ts`/`format.ts`; the `@cas/conformal` exterior-vs-interior SC factoring; correspondences
`tricorn.ts`/`family.ts`/`orbitTree.ts` escape loops. Cross-referenced ADR-0007/0008/0016/0018/0020 and
the prior `findings/10-consolidation-duplication.md` (to avoid re-reporting) and PROGRESS.md follow-ups.
Confirmed only 5 package-source files changed since the last review (6c43a92) — all reviewed.

**Grepped (categories from the brief):** complex helpers (`cabs/cdiv/cmul/finite`), `formatComplex`,
Möbius/Blaschke, Chebyshev/clustering, `pointInPolygon`, DK-seeding/Horner, `debounce`/throttle/RAF,
worker coalescing/`inFlight`, `Math.hypot`/`Math.sqrt` in loops, sub/superscript renderers, base64/url
codecs (confirmed still interchange-shared, no app-local copies — matches finding 10).

**NOT covered / honest gaps:** I did **not** deep-read the QD `.mjs` solver split's *internal* structure
(new `solver-*-common.mjs` files) beyond `solver-taylor-common.mjs` — QD is intentional-separate
(ADR-0008) and any duplication there is within-QD, not cross-`@cas`, so out of my lane (a QD-focused
agent should confirm the split didn't drift the per-family kernels). I did not exhaustively diff the
mega-apps' UI/event glue (`main.ts` 3–7k lines each) for micro-duplication — I targeted numerical/geometry
hotspots and the churned files. I did **not** re-derive the CD Fix-L field-texture/colourise GLSL
correctness beyond confirming the design guards and the parity test exist (deferred to the CD render
agent). No builds/tests run (READ-ONLY); numeric claims (`branchTaylorAccumulate`, the sqrt-free
transforms) are from tracing the code and each names the corpus/golden that pins equivalence.
