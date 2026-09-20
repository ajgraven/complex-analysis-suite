# Stage & GPU slice — review findings

**Browser suite, as asked:** from `apps/contour-integration`,
`CAS_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx vitest run --config vitest.browser.config.ts`
→ **20 files / 220 tests, all passed, 48.52 s** (exit 0). Matches the expected count exactly.
Measurements below were taken with throwaway probes run under a config in my scratch dir (removed
afterwards); `git status` is clean.

### Findings (ordered by severity)

- **[BUG] The "modulus contours" control reads PRESSED on every branch record while the stage draws none, and its first click is a no-op**
  - Where: `apps/contour-integration/src/shell/cards/cuts.ts:83` against `apps/contour-integration/src/shell/stageView.ts:460`
  - The card computes `const isoOn = state.iso ?? declaredProduct !== null` — so with the default
    `iso: null` (`src/shell/state.ts:250`) the button is `aria-pressed="true"` for every record that
    has a declared product. The stage draws contours only for `d.state.iso === true`. Measured in
    Chromium by mounting the app and opening three tier-D records:
    `mellin-keyhole / dogbone-two-fractional-powers / log-squared-keyhole → state.iso=null, button
    aria-pressed=true`, and `stageView` passes no `iso` at all. The card also prints the explanatory
    sentence *"$|f|$ does not depend on the determination, so these contours run through any cut"*
    about contours that are not on screen. Clicking once calls `setIso(!isoOn)` = `setIso(false)`,
    which merely un-presses the button; it takes **two clicks to turn the feature on**.
  - Confidence: CONFIRMED (measured)
  - Fix: one reader for the default — either `stageView` takes `state.iso ?? hasDeclaredProduct`, or
    the card drops the context default and reads `state.iso === true`. A shared helper beside
    `showStepDetail` in `state.ts` is the house idiom.

- **[BUG] `ISO_CONTOURS = 8` is a COUNT fed into a STRENGTH uniform, so the modulus contours are drawn ~8× over and crush to black**
  - Where: `apps/contour-integration/src/shell/stageView.ts:797-798` → `src/ui/stage/glStage.ts:161` → `src/ui/stage/phase.glsl.ts:258-263`
  - The comment says *"How many modulus contours `iso: true` means"*, but `uIsoStrength` is
    documented in the shader as a strength (`0 = no modulus contours`) and used as
    `rgb = mix(rgb, rgb * 0.6, iso * uIsoStrength)` with `iso ∈ [0,1]`. `mix` extrapolates for
    `t > 1`: at `t = 8` the result is `rgb·(1 − 3.2·iso)`, negative for `iso > 0.3125` and clamped
    to black. Measured on the real `buildPhaseFrag` program (`1/(1+z²)`, `full`, 256²,
    `uRange = [−3,3]²`): `uIsoStrength=0` → 0 black pixels; `=1` → 7,223 darkened, **0 black**;
    `=8` → 7,871 darkened, **5,183 pure black (7.9 % of the frame)**. The one browser test that
    exercises the overlay (`test/declaredParity.browser.test.ts:239`, `pixelAt(..., iso)`) passes
    `1`, and its comment reasons about *"the shader multiplies the colour by 0.6 — a darkening of
    roughly 40 %"* — i.e. the tested value is not the shipped one.
  - Secondary, same block: the phase-isoline branch guards against a pole with
    `(1.0 - smoothstep(0.5, 1.5, wPhase))` — *"twelve lines inside one pixel is not a picture of
    twelve lines"* — and the modulus-contour branch below it has **no such guard**, so where
    `fwidth(log2|f|)` is large (any pole neighbourhood, and any deep zoom out) `dIso ≤ 0.5` never
    clears the ramp and the whole region inks. That is most of the 5,183 pixels.
  - Confidence: CONFIRMED (measured)
  - Fix: pass a strength in `[0,1]` (`ISO_CONTOURS` is not a count the shader can use — the band
    spacing is one per doubling of `|f|` and is not a parameter), and add the `wIso` guard the
    phase branch already has.

- **[REGRESSION] A gallery record's branch CUT is no longer drawn on the stage — all seven tier-D records lost it at the M8 cutover**
  - Where: `apps/contour-integration/src/shell/stageView.ts:521` (`cuts: drawnCuts(effectiveBranch(d.state.branch), …)`), `src/shell/state.ts:89-90`
  - `ShellState.branch` is by its own doc *"The **sandbox's** declared cut system. A record's own
    cuts are the record's and are not stored here."* The M8 stage reads it unconditionally.
    Measured by mounting the app on each record: `mellin-keyhole`, `dogbone-two-fractional-powers`
    and `log-squared-keyhole` all report `state.branch.points = 0, state.branch.cuts = 0`, so the
    stage draws no hatched cut, no jump-weight label `J = …`, no admissibility colour, and
    `cutsCard`'s "Crossing a cut" monodromy block (which reads the same `effectiveBranch(state.branch)`)
    is absent too. The only trace of D7's dogbone or D1's keyhole is the colour seam.
  - The old shell drew it: at `708c6db:apps/contour-integration/src/shell/app.ts:383`,
    `effectiveBranch(mode === "sandbox" ? branch : (recordBranch ?? NO_BRANCH))` with
    `recordBranch = run.branch ?? null` (line 1759), under the comment *"THE RECORD'S OWN CUT, under
    a record. D1's `argRange` decides where the cut runs and the whole record is about what happens
    when it runs somewhere else, so a figure without it is missing the thing it is teaching."*
    `docs/contour-integration/M8/parity.md` does not list this as a deliberate drop (its row 214 is
    about the branch *handles*, which were restored at step 1.12).
  - **`run.branch` is still there and still correct** — `Analysis` returns it
    (`src/engine/analyse.ts:293`) and `runFamily` spreads it into the run. Measured over the corpus:
    `mellin-keyhole / keyhole-two-poles / keyhole-x-to-the-n` → 1 point, cut `Γ`, finite `J`;
    `log-squared-keyhole / log-cubed-keyhole` → 1 point, cut `Γ`, `J = ∞`;
    `dogbone-inverse-sqrt / dogbone-two-fractional-powers` → 2 points, cut `Γ1`, finite `J`.
    Nothing in `src/` reads it.
  - Confidence: CONFIRMED (measured, plus the deleted code it replaced)
  - Fix: in `stageView.drawNow`, source the branch from the resolution in gallery mode —
    `d.resolution.kind === "gallery" ? (d.resolution.run?.branch ?? NO_BRANCH) : d.state.branch` —
    and thread the same choice through `handles()`. **Note when fixing:** `stageController`'s
    `nearestBranch` / `cycleGrab` hit-test `branchHandles(getState().branch)` with **no sandbox
    gate**, so the moment a record's branch reaches the stage its points and cut vertices become
    draggable, contradicting the card's *"A record's cuts are the record's."* Gate the grabs on
    `state.mode === "sandbox"` in the same change.

- **[BUG] The GPU cut-correction layer is dead code: `uCutCount` is pinned to 0, so a dragged cut moves the hatching while the colour seam stays put**
  - Where: `apps/contour-integration/src/ui/stage/glStage.ts:173-175`; `src/kernel/branch/correction.ts:184` (`cutSegments`)
  - `GLStage.render` writes `gl.uniform1i(uCutCount, 0)` unconditionally and `GLStage` exposes no
    way to upload segments (`render`'s options have no `cuts` field; `uCutSeg`/`uCutJump`/`uCutBase`
    are not even in the uniform-location list at line 109). Measured: `cutSegments` has **zero
    callers in `src/`** — its only consumer is `test/cutParity.browser.test.ts`; `git log -S uCutSeg`
    shows the uniforms have never been written outside that test.
  - The consequence is the one M4.7 exists to prevent, one level down. The sandbox's declared
    colouring is a pure function of `(expr, declaration, sheet)` — that is literally `programOf`'s
    key, `d:${state.expr}:${stableKey(state.declaration)}:${state.branch.sheet}`, which carries no
    cut geometry — so dragging a cut vertex (`branchHandles` offers one per `cut.via` entry, and the
    keyhole template seeds `via: [[1,0]]`) moves the hatched curve and leaves the phase seam where
    it was. Shadow-cut mode is the same case: `effectiveBranch` swings the drawn rays with the lamp
    and the portrait does not move at all. M4.7c's own recorded decision was that *"the correction
    keeps its job one level up, where the declared product is the reference and a dragged cut is
    measured from it"* — that job was never wired.
  - Confidence: CONFIRMED (code + the zero-caller measurement); the visible symptom is PLAUSIBLE
    only in the sense that I did not drive the drag by hand.
  - Fix: either upload `cutSegments(effectiveBranch(branch), radius, referenceDirections)` from
    `stageView.drawNow` (the shader side is complete and gated by `cutParity.browser.test.ts`), or
    record the layer as deferred and correct the three comments below that say otherwise.

- **[BUG] No `webglcontextlost` handling — a lost context leaves the stage permanently black with no message**
  - Where: `apps/contour-integration/src/ui/stage/glStage.ts` (constructor, no listener)
  - Measured with `WEBGL_lose_context` in headless Chromium: after `loseContext()`,
    `gl.isContextLost() === true`, the event fires with **`defaultPrevented: false`** (so the
    browser will not attempt a restore), and `stage.clear()` / `stage.render(...)` throw nothing and
    draw nothing. The ink layer, the rails and the ledger all carry on printing exact answers over a
    dead portrait. Three sibling apps handle this —
    `apps/complex-dynamics/src/render/glPlot.ts:663`, `.../schwarzGL.ts:439`,
    `apps/complex-function-plotter/src/render/plot.ts:431`.
  - Confidence: CONFIRMED (measured)
  - Fix: `preventDefault()` on `webglcontextlost`, drop `program`/`programKey`/`vao`/`ramp`, and on
    `webglcontextrestored` re-init and force a relink; surface the interim state the way
    `glError` is surfaced in the bar.

- **[STALE-DOC] Three comments assert a cut-correction upload that does not exist**
  - Where: `src/ui/stage/glStage.ts:173-174` — *"No cut segments yet — **M4.7d uploads them**"*;
    M4.7d shipped (CLAUDE.md, "M4.7d completes M4") and does not.
    `src/ui/stage/cut.glsl.ts:5-9` — *"the GLSL is what the reader SEES … A drift between them is an
    app that draws one branch and reports another"*; with `uCutCount` at 0 the GLSL half is
    unreachable from the app, so the parity gate is guarding an unused path.
    `src/kernel/branch/correction.ts:55-58` — *"A cut system that would need more is truncated and
    SAID to be, rather than quietly drawn short"*; nothing says it — `cutSegments` returns every
    segment and `cutCorrection` silently takes `Math.min(segments.length, MAX_CUT_SEGMENTS)`.
  - Confidence: CONFIRMED

- **[STALE-DOC] `src/ui/shell.css` and `src/ui/theme.css` still describe a two-shell page and carry a cancellation block the comment says should be gone**
  - Where: `src/ui/shell.css:204-206`, `:349-378`; `src/ui/theme.css:4`, `:82`
  - *"`index.html` loads `app.css` for both shells"* — `app.css` was deleted at M8 step 1.12 and
    `index.html` now loads `theme.css` + `shell.css` only (checked: `find src -name app.css` is
    empty). The block's own last line reads *"This whole block goes away at step 1.12 with
    `app.css`"*; it did not. The three surviving rules (`.shell2 .num { font-family: inherit }`,
    `.shell2 .muted { margin: 0 }`, `.shell2 .badge { border:0; padding:0; margin:0; min-width:0;
    font-family: inherit }`) now cancel nothing in `theme.css`, so they are inert — but they sit
    ahead of `.shell2 .badge`'s real definition and are a trap for the next badge property added.
  - Confidence: CONFIRMED
  - Fix: delete the block and the two paragraphs of prose about the old sheet.

- **[STALE-DOC] `engine/branchEdit.ts` still says its exports are "shared by both shells"**
  - Where: `src/engine/branchEdit.ts:34`, `:56-60` (*"A copy in the new shell would be exactly the
    drift both rules forbid"*). There is one shell; `drawnCuts` and `sameBranchGrab` have one
    consumer each. The ADR-0007 justification quoted for their location no longer holds as written.
  - Confidence: CONFIRMED

- **[STALE-DOC] `WHEEL_FACTOR_MAX` carries two stacked doc comments and the first is dangling**
  - Where: `src/shell/stageController.ts:29-45`. The first block (*"How far a wheel may zoom … a
    trackpad flick reaches `halfHeight = 1e-12`"*) describes `clampView`'s job and is attached to
    nothing; TypeScript takes only the second as the JSDoc.
  - Confidence: CONFIRMED

- **[TEST-GAP] Nothing tests the value the app actually passes for `iso`, or the card/stage default disagreement**
  - Where: `test/declaredParity.browser.test.ts:239` (`iso` = 0 or 1), `test/cards.test.ts:52`
    (`setIso` is only recorded as a call, never its default), `test/viewState.test.ts:287,770`
    (`iso: true` round-trip only).
  - Both BUGs above are reachable from one assertion: mount a tier-D record and require the
    control's `aria-pressed` to equal whether the stage got contours.
  - Confidence: CONFIRMED

- **[TEST-GAP] `declaredParity.browser.test.ts` pins a HARDCODED record count**
  - Where: `test/declaredParity.browser.test.ts:263` — `it("covers all seven", () => expect(cases).toHaveLength(7))`.
    This is the class CLAUDE.md warns about (*"the contour-integration browser suite was red for
    three milestones on a hardcoded record count"*). `shaderCompile.browser.test.ts:71` gets this
    right — it derives from `FAMILIES.length` with a floor. Here the number should be derived from
    the corpus (`FAMILIES.filter(f => f.branch !== undefined).length`) so an added branch record is
    covered rather than turning the gate red.
  - Confidence: CONFIRMED

- **[PERF] The GL portrait is re-rendered on every pointer move over the stage**
  - Where: `src/shell/stageController.ts:673-690` (`redrawStage`) → `src/shell/app.ts:187`
    (`redrawStage: scheduleDraw`) → `stageView.drawNow` → `stage.render(...)` unconditionally.
  - The portrait depends only on (program, view, viewport, mode, iso, plate); a hover changes none
    of them, and the readout/chips it exists to move are DOM. Measured under SwiftShader at
    900 × 600, DPR 1: **`render` 32.8–34.6 ms per frame**, `setIntegrand` (compile + link)
    9.2–9.9 ms, for `dogbone-two-fractional-powers` and `mellin-keyhole`. On a real GPU this is
    small; on software rendering and at DPR 2 (4× the pixels) it is the frame.
  - Confidence: CONFIRMED (measured)
  - Fix: cache the last `(programKey, view, vp, mode, iso, plate)` in `drawNow` and skip
    `stage.render` when nothing in it moved — the drawing buffer is already persistent
    (`preserveDrawingBuffer: true`), so the last frame is still there.

- **[IDEA] `GLStage.dispose()` leaks the vertex buffer**
  - Where: `src/ui/stage/glStage.ts:61-78` creates `buffer` in `initGeometry` and never stores it;
    `dispose()` (`:211`) deletes the program, the VAO and the ramp only. One orphan buffer per
    mounted stage — negligible in the app, visible across a 220-test browser run.

- **[IDEA] `initGeometry` hardcodes attribute location 0 while `createProgram` never binds one**
  - Where: `src/ui/stage/glStage.ts:73-74` (`enableVertexAttribArray(0)` / `vertexAttribPointer(0, …)`)
    against `packages/gpu/src/shader.ts:50` (no `bindAttribLocation`) and `PHASE_VERT`'s
    `in vec2 aPos` with no `layout(location = 0)`. Every driver assigns 0 to a single attribute in
    practice — and both parity tests carefully call `getAttribLocation` instead — but the app's own
    stage is relying on unspecified behaviour. One `layout(location = 0)` in `PHASE_VERT` closes it.

- **[IDEA] The hover path resolves the contour five or six times per pointer event**
  - Where: `src/shell/stageController.ts:645-670` — the `gesture === "none"` branch calls `draw()`
    (→ `handlesOf` + `resolveAll`), `pieces()` (`resolveAll` again), `drawnContour()`, then
    `updateCursor()` which calls `draw()` and `pieces()` once more, then schedules a draw that
    resolves again. `resolveAll` is cheap for a four-piece contour, but one memoised resolution per
    event would remove the whole redundancy and is what `redrawStage` was added for.

- **[IDEA] The sandbox's modulus-contour caption can claim determination-independence about a `log`**
  - Where: `src/shell/cards/cuts.ts:110-118`. The sentence is chosen by
    `(declaredProduct?.factors ?? []).some(f => f.kind === "log")`, and a plain (undeclared) sandbox
    expression has `declaredProduct === null` — so `log(z)/(1+z)` with the overlay switched on is
    told *"$|f|$ does not depend on the determination"*, which is exactly the case
    `declaredParity.browser.test.ts` asserts is false. Harmless only because an undeclared sandbox
    has no declared cut to run through; the honest answer is to say nothing until a factor is
    declared.

### Checked and found sound

- `cutParity.browser.test.ts` — both mutants CLAUDE.md records are asserted **directly** and still
  are: exact-equality on `cargCut(z, −π) − atan(y,x) ∈ {0, −τ}` (the whole-turns claim, in float32
  on the GPU) and the strict-inequality block with six exactly-representable on-cut samples per
  system plus a `nonzero > 0` anti-vacuity clause. The excused-disagreement count is capped at 4
  and reported. `POW_RELATIVE` is derived from GLSL ES §4.5.1's `2^-11` sin/cos allowance, not
  fitted.
- `declaredProductGlsl` orientation: `factor.sign === -1` emits `csub(b, z)` rather than negating
  `csub(z, b)` — `(b − z)^ν` is the same number and not the same power, correct, and the comment
  says why. Window origin per factor, `log^m` by repeated multiplication (never `exp(m·log log z)`),
  float literals at `toPrecision(17)` so they are valid GLSL floats.
- Cut-correction signs: GLSL `m -= casSignedCross(...) * uCutJump[j]` is predicate-for-predicate the
  TS `cutCorrection`; declared arcs enter `cutSegments` at `+J` and reference rays at `−α`
  (`correction.ts:213`), and `MAX_CUT_SEGMENTS` equality is asserted across the twins.
- `shaderCompile.browser.test.ts` pins the record count **dynamically** — `cases` is built from
  `FAMILIES` and asserted `toHaveLength(FAMILIES.length)` with a `>= 20` floor. The stale-count
  hazard is closed here.
- `precision highp float` on every generated fragment program; the NaN/overflow guard
  (`!(re == re) || abs(re) > 1e30`) paints a pole white before the colour map sees it, so a
  division by zero at a pole or a branch point cannot reach `atan`/`log`.
- Stage-mode programs: the four modes are one program and one `uniform1i`, with `STAGE_MODE_CODE`
  declared once and interpolated into the GLSL — a mode switch **cannot** relink (verified by
  reading `programOf`: the key is `p:`/`d:`/`g:`-prefixed and carries no mode), and `textbook`
  deliberately keeps the key so leaving it needs no relink.
- Program cache keyed by VALUE, and the gallery/sandbox mix M5.1 worried about is now structural:
  the key's prefix differs per resolution kind, so `adopt` has nothing left to clear. `stableKey`
  is used because `JSON.stringify` refuses the `Frac` bigints.
- `preserveDrawingBuffer: true` is still set (`glStage.ts:38`) and `figureInk.browser.test.ts:228`
  still asserts the PRIMITIVE (`the GL layer reads back > 12 distinct colours`), which is M6.3's
  "a number is only evidence if nothing else could have produced it" lesson kept intact.
- Canvas a11y: `attachCanvasA11y(inkCanvas, { role: "application", render: glCanvas })` puts
  `role`/`aria-label`/`tabindex` on the ink canvas and `aria-hidden="true"` on the GL canvas
  (`packages/ui/src/mountCanvas.ts:209`), and `app.ts:1005` refreshes `aria-label` from
  `stageLabel()` on every render — so `describeStage`'s generated sentence (piece count, poles
  WOUND not enclosed, value, verdict, and the per-mode backdrop clause) is regenerated on recompute.
- DPR is capped at 2 in both `GLStage.resize` and `stageView.sized`; the ink layer's export scale
  rides one module-level `inkScale` restored in a `finally`.
- `schedule()` is a proper single-slot rAF coalescer and `destroy()` cancels the pending frame.
- Accumulator: `accumulatorFrame` skips non-finite points (the `±Infinity` case is the one the
  guard catches, and the comment corrects its own first draft about `NaN`), one isotropic scale for
  both axes, the frame fitted over ALL steps so scrubbing does not rescale, and `stepNear` /
  `drawAccumulator` share `walkOnScreen` so the hit test and the drawing cannot disagree.
- CET-C6 is the published 256-entry table uploaded once as a 256×1 RGBA8 texture, `REPEAT` on S and
  `CLAMP_TO_EDGE` on T, rebound on every draw rather than once at link.
- `test/__screenshots__` holds four PNGs, but they are Vitest failure captures and are gitignored
  (`.gitignore:38-39`) — not an uncompared baseline.
- Browser-test quality generally: the weak-looking `toBeGreaterThan(0)` assertions are all
  deliberate anti-vacuity floors with a stated reason; `stageMode.browser.test.ts` reads the canvas
  at native size and asserts the textbook plate's COLOUR as well as its count (a dead canvas is also
  one colour); `declaredParity`'s modulus-contour block solves for its sample points rather than
  grid-sampling a hairline.

### Not covered

- I did not drive a cut-vertex drag or shadow-cut toggle by hand to photograph the seam/hatching
  mismatch; the finding rests on `uCutCount` being hardwired and the program key carrying no cut
  geometry.
- Isoline aliasing at deep zoom was reasoned from the missing `wIso` guard, not swept over a zoom
  range.
- `src/ui/stage/ink.ts` (937 lines) was read for the cut/handle/pole/plate paths and `screenPath`'s
  sampling; `drawTextbookPlate`, `drawStepDetail` and `drawPoleGlyph` were read only in outline.
- `figurePlates.browser.test.ts`, `panelLayout.browser.test.ts`, `phoneNotice.browser.test.ts` and
  `renameBox.browser.test.ts` were not read (they passed; they are mostly outside the GPU slice).
- No mutation sweeps (forbidden by the brief).
