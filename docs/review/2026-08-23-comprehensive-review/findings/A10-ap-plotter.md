# A10 AP-PLOTTER — findings

Scope: the Argument-Principle app (`apps/argument-principle/src/*`) and the Complex-Function-Plotter
app (`apps/complex-function-plotter/src/*`) — winding / argument-principle integral, cumulative-arg
tracking, singularity finding, contour sampling, view-state / hostile-input guards, the #284 accessible
tooltips, and the plotter's domain-coloring / expr-eval / export paths. This is a **re-review**:
cross-referenced against `docs/review/2026-08-suite-review/findings/08-render-group.md` (agent 08 RENDER).

**Churn since the last review (6c43a92..HEAD):** the plotter has **zero** source churn; the AP app has
**one** commit in scope — #284 (`79613ed`, accessible hover/focus tooltips). So the numerical cores are
unchanged from the last review and its correctness verdict still holds. My value here is (a) confirming
the prior fixes landed, (b) reviewing #284, (c) covering areas the prior review admitted it skipped, and
(d) one consolidation case the prior review **missed/mischaracterized**.

**Headline:** the AP core math remains correct (winding sign/orientation, `1/(2πi)` normalization, the
`Z−P` count, honest `=`/`≈` labeling), the freehand-path DoS cap prior review flagged is **fixed and
correct**, the `rootsMonic` consolidation delegates cleanly, and #284 is clean. One MEDIUM: the
`mapSpecToExpr` interchange→expr converter is **triplicated** across CD + plotter + AP and has already
**diverged** into a latent correctness gap — a genuine ADR-0007 case the prior consolidation pass filed
under "not duplicated." No CRITICAL/HIGH.

---

### [MEDIUM] `mapSpecToExpr` / `envelopeToMapSpec` interchange→expr converter is triplicated (CD + plotter + AP) and has already diverged — an ADR-0007 consolidation candidate the prior review mischaracterized
- **Area:** `apps/complex-function-plotter` + `apps/argument-principle` (+ `apps/complex-dynamics`) · **Location:** `complex-function-plotter/src/interchange/importMap.ts:23-97`, `argument-principle/src/interchange/importMap.ts:23-89`, `complex-dynamics/src/interchange/importMap.ts:32-90`
- **Type:** consolidation (real ADR-0007) · **Confidence:** high · **Fix-safety:** needs-review
- **Evidence:** the six functions `coeffExpr`, `polyExpr`, `rationalExpr`, `laurentExpr`, `mapSpecToExpr`,
  `envelopeToMapSpec` — the `@cas/interchange` `MapSpec`/`Envelope` → `@cas/expr` source-string converter —
  exist in **three** apps. The plotter and AP copies are logic-identical (a `diff` of the two bodies shows
  only comment/formatting and error-message wording differ). Each app's own header admits the copy: plotter
  `importMap.ts:8` "ported from the Complex-Dynamics app's `interchange/importMap.ts`"; AP `importMap.ts:8`
  "Ported from the Complex-Function-Plotter's `interchange/importMap.ts`." Crucially the three have **already
  drifted in correctness-relevant ways**: the plotter (`importMap.ts:51-57`) and AP (`importMap.ts:47-51`)
  `rationalExpr` throw on an empty / all-zero denominator (a 0/0 map), and their `mapSpecToExpr`
  laurent case throws on `m.branches?.length > 0` (pole-bearing Laurent QD) — **but the CD ancestor copy
  has neither guard**: CD `rationalExpr` (`importMap.ts:52-57`) returns `(…)/(0)` for an all-zero denominator
  (a NaN map), and CD `mapSpecToExpr` (`importMap.ts:75-77`) calls `laurentExpr(m.c, m.F, v)` directly with
  no `branches` check, silently dropping a pole-bearing QD's finite-pole terms into a subtly-wrong map. No
  ADR governs this converter's (non-)merge — ADR-0025 defers only the *winding/singularity* primitive, and
  DECISIONS §"mapSpecToExpr" (lines 1654, 1727-1728) only records the *mirroring*, not a deliberate defer.
  The prior consolidation pass (`10-consolidation-duplication.md:236`) listed `interchange/importMap.ts`
  under "Share-link / URL-state codecs — **not duplicated**", conflating it with the per-app *URL schema*
  (`state/viewState.ts`) — but the URL codec and the `MapSpec`→expr converter are different code, and the
  converter *is* triplicated.
- **Why it matters:** this is exactly the drift ADR-0007 exists to prevent. Two guards (degenerate
  denominator, pole-bearing branches) were added to the two newer copies and never back-ported to CD, so the
  *same* interchange payload imported into Complex Dynamics yields a NaN / silently-wrong map where the
  plotter and AP fail loudly (guardrail: "honest labeling" / "fail loudly rather than emit a subtly-wrong
  map"). Three consumers of one identical bridge, drifting, is a live correctness liability, not just tidiness.
- **Recommendation:** extract the converter into a shared home (`@cas/interchange` is the natural owner — it
  already defines `MapSpec`/`Envelope` and is imported by all three; a `mapSpecToExpr(spec): string` +
  `envelopeToMapSpec(env)` producing `@cas/expr`-grammar text, with the two guards unified) — or, if coupling
  `@cas/interchange` to the expr string grammar is unwanted, `@cas/expr` as a `fromMapSpec`. Land it with all
  three apps' import tests green and a golden that exercises the degenerate-denominator + pole-bearing-Laurent
  refusals across consumers, so CD picks up the guards it currently lacks. (RM's `interchange/importMap.ts` is
  a *different* converter — CD→RM Böttcher `LaurentMap` — per `03-conformal-riemann-map.md:193`; not part of
  this triple.)

### [LOW] AP analytic-integral (B4) readout still asserts `→ round(val) = zeros − poles` without the reliability gate the verdict panel uses — prior RENDER-04, still open
- **Area:** `apps/argument-principle` · **Location:** `src/main.ts:1226-1232` (idle branch) vs the panel gate `src/main.ts:1320-1322`
- **Type:** numerical (honest-labeling) · **Confidence:** medium · **Fix-safety:** needs-review
- **Evidence:** unchanged since 08-render-group RENDER-04. The verdict panel suppresses any agreement claim
  when `!reliable || !windFinite` (`main.ts:1320-1322`, "γ passes near a singularity — the winding estimate
  is unreliable; nudge γ"). The B4 integral line has only a `branchCut` gate (`main.ts:1215`); the idle
  `else` branch (`main.ts:1227-1230`) computes `val = normalizeByTwoPiI(logDerivIntegral(...))[0]` and, when
  finite, renders `≈ analytic check: (1/2πi) ∮ f′/f dz = <val> → ${Math.round(val)} = zeros − poles`. When γ
  merely grazes a root (radially clear enough that `logDerivIntegral` still returns finite, but the
  trapezoidal `f′/f` sum is ill-conditioned) `val` can round to the wrong integer, so the B4 line asserts a
  `round(val) = zeros − poles` that contradicts the count the verdict panel shows one row up (which is
  correctly gated to `⚠ … unreliable`).
- **Why it matters:** the two honest readouts disagree exactly when the tool is warning the user not to trust
  the number — a pedagogy/honesty seam (mitigated by the `≈` prefix and the panel's own warning, so not a
  false `=` certification, but a visible self-contradiction).
- **Recommendation:** gate the "→ N = zeros − poles" tail on the same `reliable && windFinite` the panel uses
  (fall back to showing the raw `val` with a "nudge γ" note). A unit test placing γ tangent to a root and
  asserting the B4 tail suppresses the `round(val)` claim would pin it.

### [LOW] AP per-frame draw recomputes `cumulativeArg` 4–6× over the identical contour (redundant O(n) + fresh allocations each call)
- **Area:** `apps/argument-principle` · **Location:** `src/main.ts:1129, 1176, 1177, 1251, 1252, 1273` (all consuming the frame-constant `wPts`/`about` from `main.ts:970-972`); primitives `src/winding.ts:38-89`
- **Type:** perf · **Confidence:** high · **Fix-safety:** needs-review
- **Evidence:** within one `draw()`, `wPts`, `zPts`, and `about` are computed once (`main.ts:970-972`) and are
  constant for the rest of the frame. Then `cumulativeArg(wPts, about)` is recomputed up to six times over
  that same data: directly at `main.ts:1176` (A1 strip chart), and indirectly via `windingTurns` at `:1177`,
  `:1252`, `:1273` (each `windingTurns` calls `cumulativeArg` internally — `winding.ts:60`) and via
  `partialWindingTurns` at `:1129`, `:1251` (likewise — `winding.ts:77`). Each call is an O(n) atan2 pass and
  allocates a fresh `Array(n+1)` (`winding.ts:41`). At the default `resolution=300` this is negligible, but
  the `res` slider goes to 5000 (`viewState.ts:160`); during traversal animation at high res that is ~30k
  redundant `atan2` calls **plus ~6 discarded 5000-element arrays per frame** of GC pressure. The strip-chart
  branch (`:1176`) already holds the full `turns` array whose last entry *is* `windingTurns`.
- **Why it matters:** a pre-existing (not a regression — no churn) but real redundant hot-path recompute; the
  brief weights performance heavily and this is low-risk to fix.
- **Recommendation:** compute `const turns = cumulativeArg(wPts, about)` once per draw and read
  `windingTurns` as `turns[turns.length-1]`; give `winding.ts` a `partialWindingTurnsFrom(cArr, upto)` /
  `windingTurnsFrom(cArr)` that accept a precomputed cumulative array, and pass the one array through the
  strip-chart, wedge, readout, and anim lines. Purely mechanical; the primitives are already structured
  around the shared `cumulativeArg` array.

### [NIT] `windingReliable` detects only radial grazing, not angular under-sampling — an under-sampled fast-spinning image reads "reliable" while under-winding
- **Area:** `apps/argument-principle` · **Location:** `src/winding.ts:95-108`
- **Type:** numerical (honest-labeling) · **Confidence:** medium · **Fix-safety:** needs-review
- **Evidence:** `windingReliable` guards only that the nearest approach `minR > 1e-6 * maxR` (radial
  clearance from the target). It does **not** check the per-edge angular step. With the `res` slider min of 3
  (`viewState.ts:159`, `contour.ts:24`), a coarse contour whose *image* rotates > π between two samples
  (a high-order zero, or a low-`res` circle of a high-degree polynomial) aliases the `wrapPi` accumulation
  (`winding.ts:23-28`) and under-counts the winding — yet `windingReliable` returns `true` and
  `crossesBranchCut` returns `false` (it keys on a single dominant *edge-length* jump, `winding.ts:151`, not
  smooth fast rotation).
- **Why it matters:** mostly benign — the verdict panel cross-checks the aliased winding against the exact
  root count (`nmp === winding`, `main.ts:1323`), so an aliased winding surfaces as a `≠` mismatch, not a
  false `=`. The residual exposure is the B4 integral line (previous finding), which asserts `round(val)`
  independently. So this is a supporting reason to gate B4, not a standalone bug.
- **Recommendation:** optionally add a max-per-edge-`|Δarg|` sentinel to `windingReliable` (flag unreliable
  when any edge's `wrapPi` increment exceeds, say, 0.9π) so a coarse-`res` fast-spinning image is honestly
  flagged rather than silently under-wound; or document that reliability is radial-only.

### [NIT] Plotter `decodeState` leaves several numeric fields unclamped (fail-soft finite, but out of range)
- **Area:** `apps/complex-function-plotter` · **Location:** `src/state/viewState.ts:153-162`
- **Type:** bug (robustness) · **Confidence:** medium · **Fix-safety:** needs-review
- **Evidence:** `num()` guarantees finiteness but not range: `span: num(s.span, 2)` accepts `0`, negative, or
  `1e300`; `colormap: num(s.colormap, 0)`, `modulus`, `enhance`, `sectors`, `crisp`, `hueShift`, `hueSign`
  are passed through unclamped, unlike the carefully clamped `cleanV3d` block (`viewState.ts:104-123`, which
  clamps distance/elevation/heightMode/etc). A hostile or hand-edited `#vs=` link with `span<=0` yields a
  degenerate/flipped viewport; an out-of-range `colormap` indexes past the LUT.
- **Why it matters:** client-side garbage figure only — **not** a DoS (the finder grid stays fixed at
  56×56 regardless of span, and no unbounded iteration is reachable). But it slips the validator's stated
  intent ("a stale or hand-edited link must fail soft, not render garbage", `viewState.ts:4-5`), and is
  inconsistent with the sibling `cleanV3d`/`cleanParams`/`cleanAnim` clamps.
- **Recommendation:** clamp `span` to the same `[1e-9, 1e6]` the live `zoomAt` uses (`render/plot.ts:899`),
  and clamp `colormap`/`sectors` to their valid discrete ranges. Low priority.

---

## Confirmations (prior findings verified fixed / still-open; no re-report needed)

- **FIXED — freehand `path` vertex cap (prior RENDER-01, MEDIUM).** `isFinitePointArray` now rejects
  `v.length > MAX_RESOLUTION` (5000) as well as `< 3` (`viewState.ts:168-175`), with a load-bearing comment
  explaining the self-DoS it closes; `decodeArgPrincipleState` → `isArgPrincipleViewState` enforces it for
  `kind:"path"` (`viewState.ts:213`). Correct and matches the 20000 circle backstop in `contour.ts:24`.
- **CLEAN — `rootsMonic` delegation (consolidation #2).** AP `singularities.ts` imports `rootsMonic` from
  `@cas/core` (`:16`) and uses it for the rational num/den roots and rational-critical
  (`:234-235, :272`); the old app-local Durand–Kerner is gone, documented at `:52-54`. Delegates cleanly.
- **CLEAN — #284 accessible tooltips.** `render/tooltip.ts` follows the WAI-ARIA APG pattern; the single
  `createTooltip()` is instantiated once in `main()` (`main.ts:310`) so its global `keydown`/`scroll`
  listeners (`tooltip.ts:120-123`) are added once (no per-control leak); hover/focus only (never
  click/touch), Esc/scroll-dismiss, `aria-describedby` linkage. `hit.ts` and `nav.ts` reviewed alongside —
  clean pure geometry / gesture wiring, listeners symmetric in `detach()`.
- **STILL OPEN (ADR-0025-deferred, not a regression) — plotter/AP grid-finder + winding near-duplicate
  (prior RENDER-02).** `complex-function-plotter/src/analysis/singularities.ts:81-163` vs
  `argument-principle/src/singularities.ts:100-211` remain copy-adapted; the winding accumulators
  (`winding`/`windingAround`, N=72, `wrapPi`, `round(total/2π)`, return-0-on-singular) are still
  byte-identical (ADR-0025 Action Item 3 hand-sync intact), but the pre-existing tuning divergence persists:
  grid density `NX=NY=56` (plotter) vs `64` (AP), and the plotter keeps its `inView(p)` margin re-check
  (`:149,:155`) that the AP copy dropped. Respect ADR-0025's deferral; no action beyond noting no
  reconciliation happened this cycle.
- **STILL OPEN (prior NITs, unchanged).** AP view-state accepts `radius: Infinity`
  (`viewState.ts:212`, prior RENDER-08 NIT); `rationalCritical` uses an absolute `|f′|<1e-5` gate
  (`singularities.ts:278`, prior RENDER-09 NIT). Both unchanged; both low impact as prior review noted.
- **CLEAN — plotter export via `@cas/export`.** `exportBlob` (`render/plot.ts:911-935`) is write-only
  `injectPngText`, restores the live buffer after read-back, and correctly narrows the returned buffer;
  matches 08-render-group's assessment. No new drift.
- **CLEAN — plotter finder is debounced, not per-frame.** `recomputeSings` vs debounced `recomputeSingsSoon`
  (`main.ts:466-481`); play/scrub frames use GPU-only `redraw(true)` (`main.ts:548`). AP likewise debounces
  via `scheduleRefresh`/`refreshPending` and skips the refit for exact/rational maps
  (`scheduleRegionRefresh`, `main.ts:834-835`) since global roots don't move with the region. Good design.
- **CLEAN — plotter permalink / import hostile-input.** `decodeState` fails soft field-by-field; decoded
  `params` only supply *values* for names the AST declares via `freeParameters` (`plot.ts:272-283`), so extra
  keys can't inflate the shader; `importEnvelopeText` trusts `@cas/interchange`'s `validateEnvelope` for array
  bounds (INTERCHANGE agent's scope). No AP-freehand-style unbounded-iteration gap found in the plotter.

## Coverage

**Examined closely:** AP `winding.ts` (full), `integral.ts` (full — re-confirmed the `1/(2πi)` app-edge
normalization and trapezoidal `∮ f′/f`), `singularities.ts` (full — `rootsMonic` delegation + grid finder),
`contour.ts` (full), `viewState.ts` (full — freehand cap + all guards), `hit.ts`, `render/nav.ts`,
`render/tooltip.ts` (full — the #284 change), `interchange/importMap.ts` (full), and the `main.ts` verdict/
equality/B4 panel + draw loop (`main.ts:960-1330`), finder scheduling, and #284 tooltip wiring diff.
Plotter: `render/colorShader.ts` (full), `analysis/singularities.ts` (full), `state/viewState.ts` (full),
`interchange/importMap.ts` (full), `render/plot.ts` export + program/uniform lifecycle + `compileSource`
(targeted), and finder scheduling in `main.ts`. Cross-checked CD's `interchange/importMap.ts` and grepped
`docs/DECISIONS.md` + the prior `2026-08-suite-review/findings/*` for governing ADRs and prior coverage.

**NOT covered (honestly recorded):** AP `render/plane.ts` beyond its structure + the `drawPolyline`/
`drawDirectionTicks` per-frame shape (skimmed — canvas drawing, presentation), `render/argGraph.ts` (prior
review verified `turnsAt ≡ partialWindingTurns`; not re-audited), `crossing.ts`/`announce.ts`/`presets.ts`,
and the bulk of AP `main.ts`'s UI/animation wiring. Plotter `render3d/*` (camera/mesh/sphere/surface/height/
pick/mat4), `render/colormaps.ts`, `render/exportImage.ts`, all `ui/*` (animate/autocomplete/axes/legends/
markers/navigation/params/sweep), `interchange/exportView.ts`, and the bulk of `main.ts` — largely
presentation; the math + hostile-input + hand-off cores were the priority and were covered. `@cas/expr`
CPU↔GPU parity was treated as EXPR-agent scope (prior RENDER-07 verified the plotter is not desynced by it);
not re-derived here. Could not execute code (read-only rule) — the B4-gate and angular-undersampling
concerns are reasoned with confirming tests suggested inline.
