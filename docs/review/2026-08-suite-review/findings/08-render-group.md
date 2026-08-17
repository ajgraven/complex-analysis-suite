# Agent 08 "RENDER" — findings

Scope: the rendering / winding / shared-io cluster — `apps/argument-principle` (highest
scrutiny; PRs #269–#277), `apps/complex-function-plotter`, `packages/gpu` (`@cas/gpu`),
`packages/export` (`@cas/export`), and `apps/launcher`. Emphasis per the RENDER brief:
argument-principle correctness (winding = `(1/2πi)∮ f′/f` = `Z−P`, honest `=`/`≈`), the
plotter's expr→GLSL vs expr→JS dual path (Batch-1 z^a / arccosh asymmetry), the `@cas/gpu`
uniform-cap theme, and `@cas/export` round-trip fidelity across its four consumers.

**Headline:** the Argument-Principle core mathematics is **correct** — winding sign/orientation,
the `1/(2πi)` normalization, the `Z−P` count, and their agreement all check out, and the honest
`=`/`≈` labeling is sound. No CRITICAL or HIGH findings. The items below are a stale-doc, a
recorded-but-live consolidation obligation, a hostile-share-link gap, and several low/nit polish
points. The Batch-1 plotter concern is **verified benign** (see RENDER-07).

---

### [MEDIUM] Freehand `path` contours bypass the resolution cap that circle contours enforce
- **Area:** `apps/argument-principle` · **Location:** `src/viewState.ts:159-166` (`isFinitePointArray`), `src/contour.ts:19-32` vs `78-81`
- **Type:** bug (hostile-input) · **Confidence:** high · **Fix-safety:** needs-review
- **Evidence:** `sampleCircle` carries an explicit backstop — *"a hostile/garbled `resolution`
  (e.g. a crafted share-link) can never make this allocate billions of points"* — clamping to
  `Math.min(20000, …)` (`contour.ts:22`), and the view-state validator rejects any `resolution`
  outside `[3, 5000]` (`viewState.ts:169-170, 212-218`). But a `kind:"path"` contour's `points`
  are validated only by `isFinitePointArray`, which checks `v.length < 3` (lower bound) and
  finiteness — **no upper bound**. `contourSamples` then returns `c.points.map(...)` verbatim
  (`contour.ts:79`), and `cumulativeArg` / `logDerivCumulative` iterate every vertex each frame.
- **Why it matters:** a crafted `#vs=` permalink carrying a multi-million-vertex `points` array
  is accepted by `decodeArgPrincipleState` and rendered — the exact billions-of-points
  self-DoS the author explicitly guarded against for circles, reachable through the freehand
  path instead. Client-side jank/OOM only (not a security issue), but the asymmetry defeats a
  guard the code clearly intends to hold.
- **Recommendation:** bound `points.length` in `isFinitePointArray` (e.g. `≤ MAX_RESOLUTION`,
  or the 20000 circle backstop) so both contour kinds share one cap. A unit test decoding a
  crafted over-long-path link and asserting rejection would pin it.

### [MEDIUM] Plotter & Argument-Principle grid finder + winding classifier are near-duplicates — recorded (ADR-0020) but under a live hand-sync obligation, and already drifting
- **Area:** `apps/complex-function-plotter` + `apps/argument-principle` · **Location:** `complex-function-plotter/src/analysis/singularities.ts:44-163` vs `argument-principle/src/singularities.ts:134-245`
- **Type:** consolidation · **Confidence:** high · **Fix-safety:** needs-review
- **Evidence:** the plotter's `refine`/`winding`/grid loop and the AP app's
  `refine`/`windingAround`/`gridFind` are copy-adapted: identical winding sampler (`N = 72`,
  same `wrapPi` accumulation, same `Math.round(total/2π)`, same *"return 0 when a sample lands
  on a singularity"* semantics), identical Newton refine (`40` iters, `1e-30` guard, `1e-11`
  step tol), identical median-field gates (`ZERO_GATE = 0.5·scale`, `POLE_GATE = 2.0·scale`).
  **This is explicitly recorded as a deferred extraction in ADR-0020** ("Defer the winding /
  singularity primitive extraction"), so it is *not* a silent ADR-0007 violation. But ADR-0020
  Action Item 3 is a standing obligation: *"if either app's winding accumulator changes
  materially, mirror the change in the other until the primitive is extracted."* The two have
  **already diverged in tuning** — grid density `NX=NY=56` (plotter) vs `64` (AP), and the AP
  version dropped the plotter's `inView(p)` margin re-check (it relies on `countInside` instead).
- **Why it matters:** two hand-synced copies of a subtle numerical classifier is exactly the
  drift risk ADR-0020 flags; a future fix to one (e.g. the singular-sample policy, the gate
  constants) can silently fail to reach the other.
- **Recommendation:** no extraction now (respect ADR-0020's deferral). But surface the divergence:
  either document that `NX/NY` differences are intentional per-tool tuning, or, when the third
  consumer / unified-interface trigger fires, extract `windingNumber(points, { onSingular })` +
  the grid finder into `@cas/core` (convention-neutral per ADR-0020) with both suites green.
  Note also that the plotter would *gain* correctness from the AP app's later rational-exact
  path (Durand–Kerner `=` counting) — the plotter labels everything `≈` even for rational `f`.

### [LOW] `@cas/gpu` README and `glsl/index.ts` header omit the extracted `PHASE_COLORING_GLSL`
- **Area:** `packages/gpu` · **Location:** `README.md:57-65` (+ `88-95`), `src/glsl/index.ts:1-8`
- **Type:** stale-doc · **Confidence:** high · **Fix-safety:** safe-now
- **Evidence:** commit `f27aaba` ("refactor(gpu): extract the phase-portrait colorAt shader into
  @cas/gpu") added `PHASE_COLORING_GLSL`, now a real export (`glsl/index.ts:16`) and the
  plotter's whole coloring core (`colorShader.ts:27` — `COLORING_GLSL = PHASE_COLORING_GLSL`).
  The README's "GLSL standard library" section still enumerates only **three** shared building
  blocks — *"three small building blocks every renderer otherwise re-declares (ADR-0016):
  `FULLSCREEN_VERTEX_GLSL` … `HSV2RGB_GLSL` … `PLANE_FROM_FRAG_GLSL`"* — and the `glsl/index.ts`
  header comment likewise lists only *"the trivial fullscreen vertex program, the HSV→RGB
  helper, and the fragment-coordinate → complex-plane viewport map."* Neither mentions the
  phase-coloring shader, the largest and newest shared snippet.
- **Why it matters:** the README is the package's advertised API surface; a consumer (Faber
  Transform is the ADR-0007 second consumer named in `colorShader.ts:22-24`) won't discover the
  shared `colorAt` core from the docs.
- **Recommendation:** add `PHASE_COLORING_GLSL` to the README import block + prose and the
  `glsl/index.ts` header ("four … building blocks" / list it); note it composes after the
  `cvec`/`carg`/`cabsf` stdlib. Doc-only.

### [LOW] AP analytic-integral readout asserts `→ round(val) = zeros − poles` without the reliability gate the verdict panel uses
- **Area:** `apps/argument-principle` · **Location:** `src/main.ts:1203-1208` (idle branch) vs the panel gate `1297-1299`
- **Type:** numerical (honest-labeling) · **Confidence:** medium · **Fix-safety:** needs-review
- **Evidence:** the equality panel suppresses any agreement claim when `!reliable || !windFinite`
  ("γ passes near a singularity — the winding estimate is unreliable; nudge γ", `main.ts:1297`).
  The B4 integral line has **no** such reliability gate — only a `branchCut` gate (`1192`) — so
  when γ grazes a root it still renders `≈ analytic check: (1/2πi) ∮ f′/f dz = <val> →
  ${Math.round(val)} = zeros − poles`. Near a singularity the trapezoidal `logDerivIntegral` of
  `f′/f` is ill-conditioned; `val` can round to the *wrong* integer, so the line asserts a
  specific `round(val)` "= zeros − poles" that contradicts the count the panel shows one row up.
- **Why it matters:** the two honest readouts disagree exactly when the tool is warning the
  user not to trust the number — a mild pedagogy/honesty seam (mitigated by the `≈` prefix and
  the panel's own warning, so not a false `=` certification).
- **Recommendation:** gate the "→ N = zeros − poles" tail on the same `reliable && windFinite`
  as the panel (fall back to showing the raw `val` with a "nudge γ" note), so the analytic and
  topological readouts never contradict each other.

### [LOW] Plotter dual path (GLSL render vs JS markers) is NOT materially affected by the Batch-1 z^a / arccosh asymmetries — verified
- **Area:** `apps/complex-function-plotter` · **Location:** `src/render/plot.ts:273-277` (`compileF`→GLSL) vs `src/main.ts:317-319` + `analysis/singularities.ts` (`makeComplexFn`→JS)
- **Type:** numerical (verification of a Batch-1 flag) · **Confidence:** medium · **Fix-safety:** needs-review
- **Evidence:** the plotter renders the field via `@cas/expr` `compileF` (GLSL) but computes the
  probe/value-inspector and the zero/pole markers via `makeComplexFn` (float64 JS) — two codegen
  paths over the same AST, so a JS↔GLSL asymmetry would place markers where the rendered field
  shows no zero. Checking the two flagged cases: **(a) `z^a`** — `packages/expr/src/glsl.ts:151-201`
  now constant-folds the exponent (`constReal`) and routes a constant integer `|n|≤1024` to
  `intPow`, *matching* the JS `im===0 && Number.isInteger` runtime test
  (`complexJs.ts:73-74`); the comment at `glsl.ts:144-149` documents this as the fix for the
  negative-real-axis disagreement. The only residual divergence is a *variable/parameter*
  exponent whose runtime value is integer (GLSL → `cpow` principal branch, JS → `ipow`), and
  for integer exponents both are mathematically identical (no branch ambiguity) to ~1e-16.
  **(b) `arccosh`** — GLSL `carccosh(a) = clog(a + csqrt(a·a − 1))`
  (`gpu/src/glsl/complexDerived.glsl.ts:51`) is the *identical* formula to JS
  `arccosh(z) = log(z + sqrt(z²−1))` (`complexJs.ts:129`), so both backends share the same
  (nonstandard-branch) result — no plotter-internal inconsistency.
- **Why it matters:** answers the brief's "check whether the plotter is affected" — it is not,
  materially. The arccosh *branch* concern is a real `@cas/expr` correctness question (EXPR
  agent's scope) but does not desync the plotter's render vs markers.
- **Recommendation:** no plotter change needed. If the EXPR team fixes the arccosh branch to the
  standard cut, fix it in *both* `complexJs` and the `@cas/gpu` `carccosh` together (and add a
  `DUAL_BACKEND_CORPUS` case) so the plotter stays consistent.

### [LOW] `@cas/gpu` has no shared uniform-array cap constant/pattern — the CD-σ (512) and Faber (47) caps are app-local (uniform-cap theme)
- **Area:** `packages/gpu` · **Location:** package-wide (`src/*.ts`); nearest analogues `maskTexture.ts:34-79`, `colormap.ts:67-124`
- **Type:** consolidation (speculative) · **Confidence:** high · **Fix-safety:** needs-review
- **Evidence:** the Batch-1 GPU-uniform-cap theme (a GLSL `uniform X[N]` array whose fixed size
  must agree with a CPU iteration/degree limit — CD's 512-iter σ cap, Faber's degree-47 cap)
  has **no** counterpart in `@cas/gpu`: the package exposes shader compile/link plumbing
  (`shader.ts`), the complex/df64 GLSL stdlib, and LUT/mask **texture** sizes (`256`,
  `1024`/`2048`) — it uses no fixed-size uniform-array pattern at all, so each app that does
  (CD, Faber — both out of this agent's scope) manages its own CPU↔GPU cap agreement
  independently and undocumented. `@cas/gpu` is the natural home for a documented
  cap-agreement convention (or an `assertUniformArrayCap` helper), but per ADR-0007 there is
  no *second consumer of such a helper inside `@cas/gpu`'s API* yet.
- **Why it matters:** the theme's risk (silent CPU/GPU cap disagreement) lives in the apps; the
  shared substrate offers no guardrail, so the pattern is reinvented per app with no single
  reference.
- **Recommendation:** do **not** extract a helper now (ADR-0007 — no second consumer in-package).
  Instead consider a short "uniform-array caps" note in the `@cas/gpu` README documenting the
  CPU-limit-must-equal-GLSL-array-size convention, so CD and Faber cite one source. Flagging as
  *speculative* per the brief.

### [LOW] Stale "future-phase" narration and stale second-consumer framing in the AP primitives
- **Area:** `apps/argument-principle` · **Location:** `src/winding.ts:5-15`, `src/contour.ts:3-5`, `src/viewState.ts:50-51`, `src/main.ts:4`
- **Type:** stale-doc · **Confidence:** high · **Fix-safety:** safe-now
- **Evidence:** the app is fully shipped (Phases 0–6 complete), but several headers describe
  now-shipped features in future tense: `winding.ts:6-7` — *"the left-hand side (counting
  located zeros/poles inside γ) arrives in Phase 2"* (it exists, `singularities.ts`);
  `contour.ts:3` / `viewState.ts:50` — *"P1 makes it follow the cursor; P2 adds the freehand
  path"* (both shipped). More consequentially, `winding.ts:13-15` frames the extraction trigger
  as still-future — *"Once the complex-function-plotter's `singularities.ts` … becomes a
  co-consumer, this is the ADR-0007 second-consumer extraction candidate"* — but that
  co-consumer **already exists** and the decision was **already made** (ADR-0020: deferred).
- **Why it matters:** a reader is told a decision is pending when it is recorded; mildly
  misleading about the codebase's actual state.
- **Recommendation:** past-tense the phase narration and update `winding.ts:13-15` to cite
  ADR-0020's *recorded deferral* rather than a hypothetical future trigger. Doc-only.

### [NIT] AP view-state accepts a non-finite circle `radius`
- **Area:** `apps/argument-principle` · **Location:** `src/viewState.ts:207`
- **Type:** bug (robustness) · **Confidence:** high · **Fix-safety:** needs-review
- **Evidence:** `centerRe`/`centerIm` are checked with `Number.isFinite` (`:206`), but `radius`
  is checked only `typeof ct.radius !== "number" || !(ct.radius > 0)` — `Infinity` is a
  `number` and `> 0`, so a `radius: Infinity` (or a huge value) passes validation.
- **Why it matters:** `sampleCircle` then emits non-finite points; downstream this degrades
  gracefully (winding → NaN → `windFinite` false), so it's a nonsense figure, not a crash —
  but it slips the validator's intent.
- **Recommendation:** tighten to `Number.isFinite(ct.radius) && ct.radius > 0` (and optionally
  an upper bound consistent with the resolution/points caps).

### [NIT] `rationalCritical` filters critical points by an absolute `|f′| < 1e-5`
- **Area:** `apps/argument-principle` · **Location:** `src/singularities.ts:310-313`
- **Type:** numerical · **Confidence:** low · **Fix-safety:** needs-review
- **Evidence:** critical points (◆) from the `f′` numerator are kept only if
  `cabs(fp(r)) < 1e-5` — an **absolute** threshold. For a large-scale rational `f` (e.g.
  `1000·(z²−1)`), `f′` at a genuine critical root can exceed `1e-5` in floating residual, and
  for a tiny-scale `f` a non-critical root could slip under it.
- **Why it matters:** affects only the ◆ critical-point markers (not the `Z−P` theorem), and
  the whole readout is `≈` for transcendental / `=` for the count — so low impact.
- **Recommendation:** make the gate relative to the field/coefficient scale (mirror the
  finder's median-field scaling), or note the absolute tol as a known limitation.

### [NIT] `@cas/export` — no per-consumer round-trip drift (informational; answers the brief)
- **Area:** `packages/export` · **Location:** `src/png.ts`, `src/index.ts`; consumers `complex-dynamics/src/hiResExport.ts:99,136`, `complex-function-plotter/src/render/plot.ts:933`, `riemann-map/src/main.ts`, `argument-principle/src/main.ts:866`
- **Type:** test-gap/verification · **Confidence:** high · **Fix-safety:** needs-review
- **Evidence:** all four consumers call the *single-sourced* `injectPngText` codec; each builds
  its own key→value map (`Software` + an app-namespaced url key such as `ap:url`), which is
  by-design divergence, not drift. Crucially **no consumer calls `readPngText`** (only
  `png.test.ts` does) — the metadata is *write-only* reproducibility for external viewers, so
  there is no in-app inject→read round-trip to drift. The codec itself is Latin-1-lossy by spec
  (`png.ts:31-39`, chars > U+00FF → `?`), identical for all four.
- **Why it matters:** confirms the brief's round-trip-fidelity question — fidelity is a
  property of the one shared codec (tested), and there is no per-consumer divergence to fix.
- **Recommendation:** none required. If any app ever adds "drop a PNG to restore the view",
  add a cross-consumer round-trip test then. (Minor pre-existing: `readPngText:107-108` uses
  `String.fromCharCode(...data.subarray(...))` spread, which would stack-overflow on a
  pathologically large embedded text — not reachable via current write-only use.)

---

## Coverage

**Examined closely (math-critical core):**
- **Argument Principle:** `winding.ts` (full), `integral.ts` (full — verified `1/(2πi)`
  normalization, trapezoidal `∮ f′/f`, sign/orientation via the default `z³−1` example),
  `singularities.ts` (full — rational Durand–Kerner path + transcendental grid finder),
  `contour.ts` (full — orientation `orientCCW`/`signedArea`, point-in-polygon), `crossing.ts`,
  `announce.ts`, `viewState.ts` (full — share-link guards, back-compat), `interchange/importMap.ts`,
  `render/argGraph.ts` (full — verified `turnsAt` ≡ `partialWindingTurns`), and `main.ts`
  targeted sections (verdict/equality panel `1140-1312`, export `842-881`, search-region
  `747-766`, orientation commit `1497`).
- **Plotter:** `render/colorShader.ts`, `analysis/singularities.ts` (full), `ui/precision.ts`
  (full), and the dual-path wiring (`compileF` vs `makeComplexFn`). Cross-checked
  `@cas/expr` `glsl.ts` (`emitPow`/`constReal`) and `complexJs.ts` (`pow`/`arccosh`) *only* to
  judge plotter exposure (that file is EXPR agent's scope).
- **`@cas/gpu`:** `shader.ts` (full — compile/link resource handling is clean, no leak),
  `glsl/index.ts`, `glsl/df64Ref.ts` (full — the df64 JS oracle; carefully seed-matched to GLSL,
  no issues), `README.md`, `dualBackend.ts` (corpus + tolerance classification),
  `complexDerived.glsl.ts` (`carccosh`/`cpow` — grep-level), colormap/mask texture sizes.
- **`@cas/export`:** `png.ts` (full — crc32 verified against the canonical check value, chunk
  splice + read-back logic), `index.ts`, all four consumer call sites.
- **Launcher:** `index.html` (full — consistent with the six-published-apps status; no stale card).

**NOT covered (honestly recorded):**
- **Plotter:** the full `render/plot.ts`, the entire `render3d/*` (camera, mesh, sphere,
  surfaceShader, height, pick, mat4), `render/colormaps.ts`, `render/exportImage.ts`, all
  `ui/*` (animate/autocomplete/axes/legends/markers/navigation/params/sweep), `state/viewState.ts`,
  `interchange/*`, and `main.ts` UI wiring — largely presentation; the math cores were covered.
- **Argument Principle:** `render/plane.ts` (546 lines — the 2D renderer, skimmed via grep only),
  `render/nav.ts` (ADR-0022 pointer/pinch/mode layer), `hit.ts`, `presets.ts`, and the bulk of
  `main.ts`'s 1549 lines of UI/animation wiring.
- **`@cas/gpu`:** the GLSL source bodies of `complexSingle`/`complexDf64`/`df64`/
  `phaseColoring`/`planeFromFrag`/`hsv2rgb`/`fullscreenVertex` (only `df64Ref.ts` — the JS
  oracle — and grep-level checks of `complexDerived` were done). `phaseColoring.glsl.ts` is the
  newly-shared coloring core (f27aaba, two consumers) and deserves a dedicated pass I did not give it.
- **Tests:** existence noted, contents not audited for coverage gaps (beyond `png.test.ts` and
  the AP `palette.test.ts` / ADR-0023 validator, which I confirmed exist).
- I could not execute code (read-only rule); the numerical concerns (RENDER-04 integral
  reliability, RENDER-09 critical-point tol) are reasoned, with the confirming tests suggested inline.
