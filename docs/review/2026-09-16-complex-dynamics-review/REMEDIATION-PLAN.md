# Remediation plan — Complex Dynamics review of 2026-09-16

A sequenced plan to close **every** finding in [`REPORT.md`](REPORT.md) except the suite nav header
(see _Decisions to record_ at the end). Twelve work packages (WPs), each a self-contained,
independently reviewable PR that leaves the gate green. Ordered by value ÷ risk and by dependency.
Effort: S = under half a day, M = half to one day, L = one to two days. Finding ids (R1, I3, S1, U4 …)
refer to the report.

**Rules honoured throughout** (CLAUDE.md guardrails): working software at every step; every behaviour fix
lands with the regression test that pins it, negative-control checked where practical; a module never
moves without its tests green before and after; honest labelling; small commits, every session ends
pushed. Because the owner's usage is metered, each WP is sized to one session and carries its own
STATUS line in a `STATUS.md` next to this file (the M8 pattern: read it first, do the step it names,
update it, push).

**Suggested order:** WP1 → WP2 → WP3 (one-liners and the test scaffold that every later WP needs) →
WP4 → WP5 → WP6 (the instruments, ordered by how wrong the printed number is) → WP7 → WP8 (state and
shell logic) → WP9 (render parity) → WP10 (shell UX) → WP11 (a11y) → WP12 (docs, last so it describes
the code as it ends up). Pause for review at each WP gate.

---

## WP1 — Five one-line fixes with outsized effect · effort S · closes R1, R2, R3, S1, U1

**Why first:** each is a handful of lines, each is user-visible on the first frame, and none needs the
test scaffold.

**Changes**

- **R1 vignette.** `src/render/glPlot.ts` `drawPost` (~1980): upload `this._post ? this._vignette : 0`
  and `this._post ? this._gamma : 1`. Keep `drawPost` as the accumulate display path (it is also the
  average-scaling blit). Test: `test/glContextRestore.test.ts` already builds a `GLPlot` against a
  mock context — extend that mock to record `uniform1f` calls and assert `uVignette === 0` after
  `setPost(false, 0.3, 1)` followed by an accumulate frame, and `0.3` after `setPost(true, …)`.
- **R2 collar feedback loop.** `ensureCollarTex` (~1890): `gl.bindTexture(gl.TEXTURE_2D, null)` after the
  allocation, and in `renderCollar` bind unit 0 to `null` before `setupDraw` as belt-and-braces. Test:
  a new case in `test/schwarzMask.browser.test.ts`'s sibling file `test/collar.browser.test.ts`
  (browser suite — this is a real-GL defect the node gate structurally cannot see): mount a
  `GLPlot`, render, wait two frames, and assert `console.warn` was never called with
  "interaction collar disabled" **and** that `gl.getError()` is `NO_ERROR`. Negative control: revert
  the unbind and confirm the test goes red.
- **R3 legends.** `src/render/legend.ts:48, 64, 97, 104`: rewrite the four notes to match the shader
  (multiplier: "bright = superattracting centre, dark = component edge"; distance: "dark = the
  boundary"; orbit trap: "bright = hugs the trap"; period: "hue = period (not ordered)"). Change the
  period legend's `visual` from a ramp to swatches so it stops implying an order. Test:
  `test/legend.test.ts` — assert the note strings and that period's visual is not `"ramp"`.
- **S1 global Enter.** `src/main.ts:5609`: gate on `event.target` being one of `INPUT_IDS` /
  `CENTER_SUB_IDS` (the deferred text fields) and not a `TEXTAREA`; Enter in the formula textareas
  should apply only with Ctrl/Cmd (document it in the Help "Controls" list). Test: WP3's shell test —
  dispatch `keyup Enter` on `#view-name` and on a button and assert `applyChanges` was not invoked
  (count renders via the stubbed plot).
- **U1 preset select.** `src/main.ts:6543`: add a `change` listener on `#fractal_presets` that calls
  `applyPreset` directly (a select is expected to act), and remove the separate `#apply_preset` button
  from `index.html:1405` (or keep it as "re-apply" only if you want a way back to a preset's defaults
  after edits — recommended: remove, since **reset** already does that). Update the tour step and
  README "Presets" line. Test: shell test — change the select, assert `#inpf` holds the preset's `f`.

**Gate:** `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, then
`pnpm --filter complex-dynamics test:browser` for R2.

---

## WP2 — Instruments, tier 1: the numbers that are wrong by orders of magnitude · effort M · closes I1, I2

**I1 distance to set** (`src/render/inspect.ts:255-278`). Replace the "break on first escape" with the
standard DE loop: keep iterating `z` and `D` until `|z| > DE_RADIUS` (1e10 is conventional and safe in
float64 for degree ≤ 8) or `MAX_DE_ITER`, with a NaN/overflow guard on `D`. Keep the existing
`esc(z,c)` test only to decide _whether_ the point escapes; the formula reads the large-radius state.
Tag the result `≈` when it reaches `MAX_DE_ITER` before `DE_RADIUS`. Test (`test/inspect.test.ts`):
pin `c = −2.01 → 0.01 ± 20 %`, `c = 0.2501 → 1e-4 ± 20 %`, and the dynamical-plane `c = 0, z₀ = 1.01 →
0.01 ± 20 %` (exact for the unit circle); negative control: the old code fails all three.

**I2 Herman ring** (`src/render/hermanRing.ts:112-127`, `weightedBirkhoff.ts:348-360`). Add a
periodicity rejection before the quasiperiodic test: an orbit whose tail returns within `1e-6` of an
earlier point with period ≤ 64, or whose consecutive-point distances shrink geometrically (ratio < 0.99
over the last 200 steps), is _not_ a ring candidate. Also require the measured rotation number to be
irrational-looking (no continued-fraction convergent with denominator ≤ 64 within `1e-6`). Rename the
status "Ring confirmed" → "Ring detected (≈)"; the panel's `?` glossary entry says what the test can and
cannot see. Test (`test/hermanRing.test.ts`): the shipped family at τ = 0, 0.5, 0.25, 0.1 returns
`isRing: false`; golden-mean τ still returns the ring with α ≈ 0.618 and the same modulus as today.

**Gate:** as WP1. Both tests are node-only.

---

## WP3 — A shell test for `main.ts` (the scaffold every later WP relies on) · effort M · closes U11 (tests), enables S-fixes

**Why now:** every remaining shell fix (S2–S7, U2, U4–U7) needs a way to assert what the DOM does, and
today `main.ts` (6,881 lines) is imported by nothing. Contour-integration proved the pattern:
`// @vitest-environment jsdom`, `getContext` stubbed to `null`, the fatal boundary catches WebGL2's
absence, and everything else is ordinary DOM.

**Changes**

- `src/main.ts`: wrap the boot so it is importable — export `init` (already a function at `:1036`)
  and move the `runWithFatalBoundary(init, …)` call behind `if (!import.meta.env.VITEST)` or into a
  two-line `src/boot.ts` that `index.html` loads instead. Also export the handful of pure helpers the
  tests need (`readFullState`, `applyFullState`, `updateViewChips`) — or, better, move them to
  `src/state/appState.ts` where `SHARE_IDS` already lives.
- `test/shell.test.ts` (new, jsdom): load `index.html` into jsdom (`fs.readFileSync` + `document.body.innerHTML`
  of the `<body>` — the contour-integration test does this), stub `HTMLCanvasElement.prototype.getContext`
  to `null`, stub `localStorage`/`matchMedia`/`ResizeObserver`, call `init()`, and assert the
  invariants the report found broken: preset change applies (WP1), Enter is scoped (WP1), the
  applied chips match the applied state (WP7), share/restore round-trips every field in `SHARE_IDS`
  plus the sphere ids (WP7), Esc closes one layer (WP8).
- `eslint.config.js` (root): extend the `no-shadow: "error"` block to `apps/complex-dynamics/**`
  (currently contour-integration only); fix what it flags (expect a few renames).
- `vite.config.ts`: `test.environment` stays `node`; the new file opts in per-file via the docblock.

**Guard:** the test itself; `pnpm test` count rises by one file. Risk: `init` has side effects at
module scope (the `__views` debug handle, the a11y announcer) — keep them inside `init`.

---

## WP4 — Instruments, tier 2: the combinatorial panels · effort L · closes I3, I4, I7 (findNucleus / refineCycle)

**I3 laminations, QML, angles of a point, Yoccoz.** The 4e-3 / 5e-3 clusters are the defect; the
repair is one rule applied in four places: **two rays land at the same point only if their
Newton-refined landings coincide to `1e-9·max(1,|z|)`, and an unrefined landing never pairs.**

- `src/render/lamination.ts:63, 282-318`: `DEFAULT_TOL = 1e-9`; skip `refined: false` landings; keep
  the 4e-3 value only as the _pre-filter_ that decides which pairs are worth refining (so cost does
  not explode).
- `src/render/angleOfPoint.ts:67, 163-184`: same rule; the snap-to-nearest (0.06) stays, but valence
  is counted over refined coincident landings only; report `valence ≥ n (≈)` when any candidate was
  unrefined rather than a bare number.
- `src/render/yoccozPuzzle.ts:75-76`: build the α-angles from the closed-form α fixed point and the
  orbit-portrait machinery (`combinatorics/orbitPortrait.ts`) instead of the clustering finder; refuse
  (by name) when `c` is outside M (Cantor set) instead of returning a puzzle.
- Tests: rewrite `test/lamination.test.ts:33-36` to assert the _exact_ leaf sets — basilica at detail
  6 is `{1/3,2/3}, {1/6,5/6}` and their preimages up to the period bound, nothing else; the rabbit's α
  is the triangle `{1/7,2/7,4/7}`; the β-ray `0` is in no leaf at any detail ≤ 8. `test/angleOfPoint.test.ts`:
  `c = 0.1+0.1i` reports valence 1 at every sampled point; basilica α ← `{1/3,2/3}`. QML at detail 6:
  `{1/3,2/3}, {1/7,2/7}, {3/7,4/7}, {5/7,6/7}, {1/15,2/15}…` and no leaf pairs an unrefined endpoint.
  Measure the run time of `updateLamination` at detail 8 before and after (it was ~150 ms); if the
  refinement pass pushes it past ~250 ms, move it onto the existing `JuliaMetricsClient` worker.

**I4 internal angle.** `src/render/inspect.ts:189-230`: compute the rotation number about the **α fixed
point** (closed-form for z²+c; for a general polynomial fall back to "—") and only for a cycle whose
points surround α (a satellite of the main cardioid); otherwise leave `internalAngle` null so "Limb",
"Show bulb rays" (`main.ts:1427-1431`) and the orbit-portrait button (`:1442-1448`) do not appear.
Use `combinatorics/stripping.ts`'s satellite-vs-primitive tower to name the case ("primitive
component — no internal angle on the cardioid"). Test: the primitive period-4 centre
`−0.1565+1.0322i` reports no internal angle; the 1/3 bulb centre reports `1/3`; a satellite of the
1/3 bulb reports "satellite of 1/3, no cardioid angle".

**I7 Newton guards.** `inspect.ts:349-378` `findNucleus`: reject a root farther than the cycle's
own diameter (or 0.1) from the seed, or of the wrong period, and return `null` → the button toasts
"no period-p centre near here". `refineCycle:144-180`: return a `converged` flag; callers print `≈`
when false. `angleParameter.ts:503-532` and `:407-414`: the same distance-to-seed guard
`refineParabolicRoot:470` already has. Test: `findNucleus` from `(−0.9, 0.05)`, period 4 → `null`;
from `(−0.15, 1.03)`, period 4 → the known centre to 1e-12.

**Gate:** as WP1; update the README "Lamination" and "Angles of a point" paragraphs to say what a
leaf now _is_ (two refined landings that coincide).

---

## WP5 — Instruments, tier 3: fixed-point classification and the critical point · effort M · closes I5, I6, I7 (Ruelle, Brjuno)

**I5 Siegel / Cremer / parabolic.** For `z²+c` the fixed points are closed-form
(`yoccozPuzzle.ts:29`, `siegelCurves.ts:353`): add `classifyFixedPointExact(c)` in `inspect.ts`
returning λ = 1 − √(1−4c) (the α root), and route `fatouComponentType` through it whenever the
formula is `z²+c` and the clicked orbit does not converge to a cycle. `siegelCurves.ts:340, 361`:
require `||λ| − 1| ≤ 1e-9` (indifferent, not "almost") _and_ a Brjuno-positive rotation number, and
draw nothing otherwise. `brjuno.ts:228, 305`: a rotation number with a continued-fraction convergent
of denominator ≤ 10⁶ within float64 rounding is rational → "parabolic (p/q)", never Siegel; print the
disc radius as "order of magnitude ≈" with the glossary noting Yoccoz's constant is dropped. Tests:
golden-mean `c` → "Siegel disc, θ ≈ 0.618…"; `c = −¾` → "parabolic, λ = −1"; `c = 0.25` →
"parabolic, λ = 1"; `|λ| = 0.985` → attracting, `siegelCurves` returns `[]`; `θ = 355/113` →
parabolic.

**I6 critical point.** `glPlot.ts:2314` and the six call sites (`main.ts:1109, 2104, 5657, 6188`;
`juliaProperties.ts:173`; `inspect`): derive `criticalPoints` from `findCriticalPoints(f)`
(`critical.ts:160`) whenever the formula parses as a polynomial; the _parameter plane_ iterates the
first (or, per the user's choice, a selected one — a small select appears under the formula when
there is more than one), the critical-orbit overlay draws all of them in distinct dashes, and the
Lyapunov / class rows are computed per critical point (print the list). A non-polynomial keeps `0`
but the README caveat becomes a visible note under the formula ("critical point assumed at 0").
Test: `z^3−3z+c` → critical points `±1`, Lyapunov at `c = 0` from the orbit of `1` (bounded, ≈ 0),
not `log 3`.

**Ruelle.** `juliaProperties.ts:205, 224-229`: show the `1 + |c|²/(4 ln 2)` row only for `|c| ≤ 0.1`
and label it "Ruelle, O(|c|³) omitted"; elsewhere print the box-count only. Test: `c = −0.7+0.1i` has
no exact-dimension row.

**Gate:** as WP1.

---

## WP6 — Instruments, tier 4: matings, worker errors, honest labels in the inspector · effort S · closes I7 (matings, worker), U9

- `matingEngine.ts` `generalMate`: when the pullback diverges, return a _reason_ (`{refused: "obstructed"
| "did not converge in N"}`) rather than `null`, and the panel prints it; add the Tan-Lei conjugate-limb
  gate that `mateableLimbs` already encodes so an obstructed pair is refused by name before any
  compute. Test: `1/7 ⊔ 2/7` reports "did not converge (limit N)" not silence; `1/3 ⊔ 2/3` reports
  "obstructed (conjugate limbs)".
- `packages/ui/src/computeClient.ts:102`: when `result === undefined` call `cb` with an error object
  (or add an `onError` option) so the Julia-properties rows show "failed: …" instead of "measuring…"
  forever; `juliaMetrics.worker.ts:327-329` posts the error message. Test in `packages/ui/test`:
  a worker error reaches the callback. (Package change — `createComputeClient` has three consumers,
  so add the golden for all three.)
- Inspector rows (`main.ts:356-419`): every numerically-derived row carries `≈` (multiplier, distance,
  Lyapunov) and only closed-form rows carry `=`; import `@cas/rigor`'s branded labels so a bare `=`
  string is a compile error (the app has `@cas/rigor` available via the workspace; add the dependency).
  Herman panel: "Ring detected (≈)". Glossary "Profiles" entry: Artist's AA is 1 with temporal
  accumulation — say so (`ui/glossary.ts:72`).

**Gate:** as WP1 plus `pnpm --filter @cas/ui test`.

---

## WP7 — State integrity: share links, chips, profiles · effort M · closes S2, S3, S6 (hashchange, keyframes), U2

- **S3 sphere state.** `src/state/appState.ts:15-72`: add `sphere-param`, `sphere-dyn`, `sphere-light`
  to `SHARE_IDS`; `applyFullState` applies them after the plane state (the sphere toggle re-renders).
  Test: WP3 shell test round-trips a state with the sphere on and asserts the toggle is on after
  `applyFullState` into a fresh default (M6.1's "restore a state the app is not in" rule — field
  equality is not enough).
- **U2 chips.** `main.ts:2240` `updateViewChips`: read `plot.n` / `plot.nplot` (the applied values),
  not the input; call it from `applyPreset`, `applyChanges`, the profile apply and the suggestion
  "Raise to N" action; move `refreshProfileLabel`'s listener to `document` (`:6834`) so the plots-pane
  inputs count. Test: after first load both chips say `200 it` when the profile set 200 (or the
  profile no longer rewrites iterations at load — decide; recommended: chips reflect applied state,
  and the Explore profile does not touch iterations).
- **S2 copy properties.** `main.ts:2217-2231`: await the metrics client's promise (add a
  `requestOnce()` returning a promise to `JuliaMetricsClient`) before building the clipboard text;
  disable the button while "measuring…". Test: the copied text never contains "measuring".
- **hashchange.** `main.ts:6852`: `window.addEventListener("hashchange", loadFromHash)`, guarded
  against the app's own `replaceState` writes (compare with the last hash it wrote). Test: dispatch
  `hashchange` with a `#vs=` and assert the state applied.
- **Keyframes at depth.** `main.ts:5449`: store `plot.centerDD` (the double-double) in a keyframe
  and interpolate in dd when both ends carry it; playback sets `centerDD`. Test in
  `test/keyframes.test.ts`: a path between two views at 1e15× reproduces the endpoints bit-exactly.

**Gate:** as WP1.

---

## WP8 — Shell logic: modes, errors, Esc, orbit start · effort S · closes S4, S5, S6 (Newton banner, σ error), S7, U7

- **S4 silent mode change.** `main.ts:2851-2861`: when `updateDerivativeGating` has to move `#mode`,
  toast "Distance (analytic) needs a holomorphic f — showing Smooth" and set a `title` on the disabled
  option; under perturbation, _disable_ the modes the kernel does not render (`glPlot.ts:1492`) rather
  than listing them, and make the note at `index.html:1757` visible text. Same visible-reason rule for
  `laurent-*` and the keyframe buttons: a `<small class="why">` under each disabled control.
- **U7 gating text.** Overlay checkboxes (`index.html:1602, 1619, 1650, 1659, 1668`): move the
  "(z²+c only)" from `title` into the label text; the seven z²+c panels: disable their action buttons
  and show one line "needs f = z²+c — current f: …" when the formula is not quadratic, instead of
  toasting on use.
- **S5 Escape stack.** Replace the six document-level listeners with one `escapeStack` (push on open,
  pop on close, Esc closes the top only) in `src/ui/dom.ts`. Test: expand a plot, open the glossary,
  press Esc → glossary closed, plot still expanded.
- **S6.** `applyNewton` (`main.ts:2767`) calls `clearInputErrors()` on untick; the σ Esc path (`:4546`)
  clears `#schwarz-error` like the ↩ button (`:4684`).
- **S7 orbit start.** `plotView.ts:450` `fireInspect` uses the same `z₀ = c` convention as the drawn
  orbit (`overlay.ts:645`) for the parameter plane, or the overlay switches to the critical point —
  pick the critical point (it is what the parameter plane _means_, and WP5 makes it exact) and fix
  the overlay + shader start to match (`shaderBuilder` param-plane iterator). Test: the inspector's
  "escapes (n = k)" equals the overlay label's k.

**Gate:** as WP1.

---

## WP9 — Render parity and robustness · effort L · closes R4–R9

- **R4 projections.** `usePerturbation` (`glPlot.ts:1315`) and `desiredPrecision` (`:1007`) return
  the linear path only when `_projection === "linear"`; when a projection is active at deep zoom,
  show the existing precision advisory ("projections render in single precision — switch to linear
  for deep zoom") instead of silently snapping. Test: node test on the pure gating function (extract
  `chooseRenderPath(state)` as a pure function and pin its table).
- **R5 degree mismatch.** `compile()` (`:787`) passes `_polyPerturb?.degree ?? _monicDegree` so both
  shaders use the same `LOG_DEGREE`. Test: `test/glslCodegen.test.ts` — the emitted constant for
  `z^3−z+c` is `log(3)` in both programs.
- **R6 export consistency.** `renderToImageData` (`:2245`) snapshots `{draft:false, aa, outline,
light, mode}` into an `ExportOptions` object at entry and `setupDraw` reads that object while
  `_exporting` is set; ignore pointer input on the plots during export (the progress overlay already
  covers them — make it `pointer-events: all`). `renderExportCanvas` (`plotView.ts:279`) skips the
  overlay and scale bar in sphere/projection mode, matching the on-screen path. Histogram export:
  build the CDF from a bounded-size render (≤ 1024²) rather than the full export size, and build it
  once before the first strip. Test: browser suite — export at 2000 px with a synthetic pointer drag
  mid-export and assert strip-to-strip parity (the recolour-parity harness already compares frames).
- **R7 temporal AA.** After the recolour fast path, if `_accumulate` is on, reset the accumulator and
  `requestFrame()` so refinement resumes. Test: mock-GL count of accumulate frames after a palette
  change is > 0.
- **R8 robustness.** df64 compile failure sets a `df64Failed` latch (`:930, 945`) and surfaces one
  toast; `renderToImageData` checks `contextLost` and `checkFramebufferStatus` and rejects the
  promise (the UI already handles a rejected export); `schwarzGL.ts` registers
  `webglcontextlost/restored` and `paintSchwarz` falls back to the CPU path while lost; `set zoom` /
  `set center` clamp non-finite input and refuse `zoom ≤ 0`; `hiResExport.getMaxTextureSize` takes
  the live `GLPlot.maxTextureSize` and also honours `MAX_RENDERBUFFER_SIZE`.
- **R9 performance.** Recorder: drop the synchronous `plot.render()` after setting state and await
  the scheduled frame (`main.ts:5408, 5426, 5492, 5573, 5597`); `ensureBLA` (`:1436`) rebuilds only
  when the required radius crosses a power of two; `orbitKeyFor` (`:1334`) keys on the reference
  centre and a quantised iteration cap; the field pre-pass (`shaderBuilder.ts:641, 966`) gets the
  cardioid/period shortcuts. Measure before/after with the existing perf notes in `docs/perf/`.

**Gate:** as WP1 plus both browser suites (`pnpm --filter complex-dynamics test:browser` and
`packages/gpu`).

---

## WP10 — Shell UX: first run, sidebar, σ as a peer, import, labels · effort L · closes U3, U4, U6, U8, U11 (duplication)

Decisions the owner should confirm before this WP (recommended defaults in bold):

1. Default view: **`c = −0.7+0.27015i` (a connected dendrite-ish Julia set with a visible interior)**
   or the rabbit `−0.1226+0.7449i`. Either fixes U3; the rabbit shows period-3 structure but hides
   the "outside M ⇒ Cantor dust" lesson, which the tour can teach instead.
2. Sidebar shape: **tabs — Function · Look · Precision · Instruments · Studio** (five tabs, the
   Instruments tab holding the z²+c panels with the gating line from WP8) vs. keeping one accordion
   with group headers. Tabs cut the 2,200 px column to one screen.
3. σ view: **keep the sidebar visible with a σ-specific tab active** (peer, not takeover), vs. the
   current full takeover with the ↩ button.

**Changes**

- **U3.** `presets.ts` Mandelbrot `c`/`z0`; legend swatch text for a disconnected set reads "Julia
  set (no interior)" when connectivity says so; one `formatComplexDisplay` used by the caption, the
  overlay label and the inspector (the input keeps the parseable `-.7-.4*i` form). Test: three
  places print the same string for the same `c`.
- **U4.** `index.html` + `main.css`: the tab shell (or grouped accordion); the Point inspector shows
  only the hint until a point is inspected, and its Siegel / Misiurewicz / Pin controls move into the
  report (they act on the inspected point); the phone sheet opens at 50 % height with a drag handle
  to full (`setupMobileSheet`, `main.ts:563`), and the FAB is hidden in σ mode or the sheet shows the
  σ tab. Test: shell test asserts the inspector's action inputs are hidden before the first inspect;
  a11y roster re-baseline.
- **U6.** σ overlays become part of `schwarzState` (`main.ts:3123-3160` stop marking them transient;
  the state module already clamps hostile input) so a link carries what a researcher built; entering
  σ twice in a session restores the previous σ window unless the builder fields changed (key the
  regeneration on the builder's values, as the stage's rebuild guard already does); add a tour step
  for the σ button. Test: `schwarzState` round-trip with an orbit family and a level-curve set.
- **Import.** Replace `window.prompt` (`main.ts:5164-5171`) with a small dialog (paste area + "Load"
  - a link to the QD app's Export map) using the glossary dialog's `withModalFocus`. Test: shell
    test pastes a `QD_TO_CD` golden payload and asserts σ mode entered.
- **U8.** `overlay.ts` label placement: flip the label to the left of the point when it would clip
  the right edge, and clamp vertically; the Herman preset's parameter plane opens on a view where
  the tongues are visible (`center [0.25, 0], zoom 2`) with `nplot` small enough that the polyline
  stays in frame; a custom `f` legend says "in the set" not "the set".
- **U11 duplication.** Extract `snapCAndReinspect(c)` (five copies → one), `drawSchwarzOverlays(ctx,
opts)` (six → one, export passes `{hover:false}`), and fold `applyPreset` into `applyChanges` with a
  `source` argument. Pure refactors, each proven a no-op the M6.1 way: dump the rail/strip before and
  after across the presets and diff.

**Gate:** as WP1; `pnpm a11y --update-baseline` only after WP11 (so the new layout is audited clean,
not baselined dirty).

---

## WP11 — Accessibility · effort S · closes U10

- Exterior-map lists (`#exterior-param-list`, `#exterior-dyn-list`): `tabindex="0"` + `role="region"`
  - `aria-label`; wrap the panel's status/labels in the group's landmark (the `region` findings) —
    and add the Exterior panel's open state to the a11y roster (`scripts/a11y-audit.mjs`) via a
    permalink that opens it, the way the drill rung is audited, so non-default states are covered.
- Gradient editor (`ui/gradient.ts:519-528`): a keyboard path — focused stop handle moves with
  arrows, `Insert`/`+` adds a stop at the focused position, `Delete` removes; expose values in
  `aria-valuenow`.
- Onboarding dialog: use `withModalFocus` like glossary/help; return focus to the opener.
- `#inspector`: move `aria-live="polite"` to a single status line inside the report ("Inspected
  c = … : period 2, attracting") rather than the whole region.
- Suggestion severity: an `aria-label`/visible word ("warning" / "tip") next to the icon.
- σ notes: raise `.schwarz-formula-note` / `.schwarz-inspect-steps` to ≥ 4.5:1 (drop the `opacity`,
  use the `--muted` token at 0.75 rem) — measure with axe after the change.
- σ capture-phase keyboard handler (`main.ts:4535-4614`): act only when focus is on the σ canvas
  (or body), not on any focusable element.

**Gate:** as WP1 plus `node scripts/a11y-audit.mjs --strict`, then re-baseline.

---

## WP12 — Documentation currency · effort M · closes §3 of the report

Written last so it describes the app as it ends up after WP1–11.

- `apps/complex-dynamics/README.md`: rewrite _Architecture_ (the real tree: `state/`, `combinatorics/`,
  `interchange/`, the render modules by group, and that `expr`/`glsl` live in `@cas/expr`/`@cas/gpu`);
  _Known limitations_ (delete the "BLA not yet wired" sentence; state the projection/precision rule
  from WP9); a new **Schwarz reflection σ** section and an **Interchange** section (QD → CD import,
  CD → Riemann-Map export, the `#s=` link, the paste dialog); the full function list from
  `packages/expr/src/ast.ts`; the CI sentence; `pnpm` not `npm` in _Running_; the Lamination /
  Angles / Herman / Siegel paragraphs per WP2–5; the Presets line per WP1; the phone-sheet sentence
  per WP10. Delete `apps/complex-dynamics/package-lock.json`.
- `CONTRIBUTING.md`: the three gotchas point at the packages; the `uMode` list gains interior-DE,
  Marty and Newton-basins.
- `index.html:2644, 2834-2845` and `main.ts:2451, 4269`: the suite URL and `Software:
"complex-dynamics (complex-analysis-suite)"`; write `cas:state` alongside `cdjs:state` for one
  release, then drop the old key (a reader that opens any suite figure is the point of the documented
  key); fix the two "Latin-1, ASCII only" comments (`main.ts:2441`, `schwarzState.ts:628`).
- `FEATURE_RESEARCH.md` §0, `FRONTIER_ROADMAP.md` §4 A2, `PERFORMANCE_REVIEW.md` deep-zoom track,
  `docs/design/SIGMA-HANDOFF.md` status header, root `README.md` CD row and test count: bring each
  to the shipped state (one commit per file, each a pure doc change).
- `CLAUDE.md`: the CD status paragraph gains one line pointing at this review folder.

**Gate:** `pnpm format:check` and the full gate (docs only, but the `Software` tag change touches
`hiResExport.test.ts` expectations).

---

## Decisions to record (outside this plan's scope, but they must be written down)

- **No suite nav header, in this app or any other — RECORDED.**
  [ADR-0044](../../DECISIONS.md#adr-0044-withdraw-the-in-app-suite-navigation-header-the-launcher-is-the-unified-menu)
  withdraws the in-app header suite-wide (the launcher stays; only decision 8's "plus a shared nav
  header later" clause goes), closes ADR-0032's U7 as _withdrawn, not done_, and closes ADR-0016
  AI-5 as moot. The removal — five apps, seven pages, plus the `@cas/ui` primitive and the doc sweep
  — is staged in [`NAV-WITHDRAWAL-PLAN.md`](NAV-WITHDRAWAL-PLAN.md) (N1–N6), which runs independently
  of WP1–WP12. Report finding **U5 is therefore closed as won't-fix**; its other half (CD's hand-off
  controls sitting in unrelated panels) is answered by ADR-0044 §4 — a hand-off belongs in the panel
  that owns the state — and the CD end of it is WP10's import dialog.
- **Default parameter and sidebar shape** (WP10's three questions).
- **Whether `#apply_preset` survives** (WP1, U1) — recommended: no.

## Not in this plan (report §4, features rather than fixes)

Multi-critical parameter planes beyond WP5's first step, internal rays / wakes / Hubbard trees,
`z^d+c` rays and puzzles, deep zoom for abs-maps and past 1e28×, the rational-map exterior overlay,
the mating engine's Misiurewicz parent, tiled export and post-processing in exports, palette studio
and compare views. Each is a milestone with its own plan; this document only closes defects.
