# Remediation plan — Complex Dynamics review of 2026-09-16

A sequenced plan to close **every** finding in [`REPORT.md`](REPORT.md) except the suite nav header
(U5 — withdrawn by ADR-0044, see _Scope_ below). **All work is confined to `apps/complex-dynamics/`.** Twelve work packages (WPs), each a self-contained,
independently reviewable PR that leaves the gate green. Ordered by value ÷ risk and by dependency.
Effort: S = under half a day, M = half to one day, L = one to two days. Finding ids (R1, I3, S1, U4 …)
refer to the report.

**Rules honoured throughout** (CLAUDE.md guardrails): working software at every step; every behaviour fix
lands with the regression test that pins it, negative-control checked where practical; a module never
moves without its tests green before and after; honest labelling; small commits, every session ends
pushed. Because the owner's usage is metered, each WP is sized to one session and carries its own
STATUS line in a `STATUS.md` next to this file (the M8 pattern: read it first, do the step it names,
update it, push).

## Scope — Complex Dynamics, and what its findings drive

**The app, plus any shared-package change a Complex Dynamics finding motivates** (owner's call,
2026-09-16). No sibling app is touched and no repo-level documentation is edited. A `packages/*` change
ships with tests covering that package's _other_ consumers, so a CD-motivated fix cannot regress them.
Three work packages were re-routed for reasons that outlive the scope question:

| was                                                             | now                                                                | WP   | why                                                     |
| --------------------------------------------------------------- | ------------------------------------------------------------------ | ---- | ------------------------------------------------------- |
| root `eslint.config.js` gains `no-shadow` for this app          | `apps/complex-dynamics/eslint.config.js` gains it                  | WP3  | the app has its own config; the rule belongs beside it  |
| `scripts/a11y-audit.mjs` audits the Exterior panel's open state | also asserted in this app's own jsdom shell test, which **blocks** | WP11 | the axe job never blocks, so the test is the real guard |
| repo-level docs refreshed alongside the app's                   | app-local docs only; the repo-level list is deferred below         | WP12 | out of scope                                            |

**Deferred, with the reason** (each is real, none is in this plan):

- **Repo-level documentation:** root `README.md`'s CD row and test count, `CLAUDE.md`'s CD paragraph,
  `docs/design/SIGMA-HANDOFF.md`'s stale status header, `docs/refactor/LOG.md`. All named in REPORT §3 and
  all outside the app.
- **The suite nav header** — REPORT finding U5 is closed as won't-fix by
  [ADR-0044](../../DECISIONS.md#adr-0044-withdraw-the-in-app-suite-navigation-header-the-launcher-is-the-unified-menu).
  **No app loses its header in this work.** The staged removal in
  [`NAV-WITHDRAWAL-PLAN.md`](NAV-WITHDRAWAL-PLAN.md) is a separate exercise for a separate session and is
  not started here.

**On the lockfile.** WP6 adds `@cas/rigor` to this app's `package.json`, which rewrites the root
`pnpm-lock.yaml`. That is consuming an existing package, not modifying one. If you would rather not touch
the lockfile at all, say so and WP6 ships the `≈` labels as plain strings — the honest-labelling fix still
lands, it just is not compiler-enforced.

---

**Suggested order:** WP1 → WP2 → WP3 (one-liners and the test scaffold that every later WP needs) →
WP4 → WP5 → WP6 (the instruments, ordered by how wrong the printed number is) → WP7 → WP8 (state and
shell logic) → WP9 (render parity) → WP10 (shell UX) → WP11 (a11y) → WP12 (docs, last so it describes
the code as it ends up). Pause for review at each WP gate.

---

## WP1 — Five one-line fixes with outsized effect · effort S · closes R1, R2, R3, S1, U1 · **DONE**

> **Landed** (commit `d670c1f`). Gate green: lint, typecheck, 553 files / 5,725 tests, build; browser
> suite 5 files / 26 tests. Every fix negative-control checked by reverting it and confirming red.
> Two things the work changed from what is written below. **R3's distance legend was NOT inverted** —
> its ramp ends are correct and only the boundary-darkening was unmentioned, so it keeps its labels
> and gains a note; only multiplier, orbit trap and period were flipped. And **R1's test is pinned as
> "the vignette slider cannot reach the image while post is off"** rather than as a corner-to-centre
> luminance ratio: the first draft of that test measured the Julia set's black interior, and its own
> anti-vacuity guard caught it.

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

## WP2 — Instruments, tier 1: the numbers that are wrong by orders of magnitude · effort M · closes I1, I2 · **DONE**

> **Landed** (commit `83db907`). Gate green: lint, typecheck, 553 files / 5,734 tests, build. Both
> fixes negative-control checked. **Measuring corrected the review twice, and the plan below with it.**
>
> **I1.** The bailout radius turns out to matter far less than written here: every ratio is stable
> from R = 4 to R = 1e10, so `DE_RADIUS = 1e6` is headroom rather than a tuned constant, and the 70×
> error exists only because the app's own predicate bails at |z| > 2. The real second defect was a
> leading **½** that the code carried and its README did not — a systematic 2× under-read, exactly
> visible on the unit disk (0.502 where the formula is an equality). And the review's true distances
> were wrong: c = 0.26 is **1.96e-3** from M, not the 1e-2 of "0.26 − 0.25", because the cusp wraps to
> the right of ¼. The new truths were computed by minimising over the cardioid. What cannot be fixed
> by any constant is the spread: 0.46×–1.99× on cases with an exact answer, which is the Koebe ¼
> theorem, so the row is labelled `≈` and the glossary says so.
>
> **I2.** The disqualifier is "the tail closes up on a cycle", since a rotation domain contains no
> periodic orbit — not the rationality test sketched here, whose resolution is worse than the
> rotation number's own measurement error (0.621 measured for a golden 0.618). The review's tongue
> list was also wrong: measured, τ = 0, ½, ⅓ and **1/√2** close up (periods 1, 2, 3, 7 — the last an
> Arnold tongue at an _irrational_ τ), while τ = ¼, 0.1 and 2/7 do **not** within 1500 iterations and
> are therefore asserted in neither direction.

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

## WP3 — A shell test for `main.ts` (the scaffold every later WP relies on) · effort M · closes U11 (tests), enables S-fixes · **DONE**

> **Landed** (commit `4ea4433`). Gate green: lint, typecheck, 554 files / 5,744 tests, build. Ten
> tests; negative-control checked against WP1's two untested fixes. Three notes.
>
> **The boot split is `src/boot.ts`, not a `VITEST` guard** — `runWithFatalBoundary(init, …)` was the
> only module-scope statement, so the extraction was three lines, and the app was re-verified in a
> real browser afterwards.
>
> **CD's stage is NOT contour-integration's.** `GLPlot`'s constructor _throws_ without a context
> instead of degrading, so a null `getContext` aborts `init()` before any control is wired. That is
> correct product behaviour and was left alone; the test supplies a minimal fake GL **and** 2D
> context instead. Neither is a renderer and nothing asserts a pixel.
>
> **`no-shadow` went in the app's own config**, not the root one, and found two real source
> shadowings: a σ view-apply button hiding the sidebar's `applyBtn`, and a destructured
> `boundingRadius` _number_ hiding the module's exported `boundingRadius` _function_ across a whole
> body. Four test-file cases were renamed as well.
>
> **Carried to WP7:** `readFullState` / `applyFullState` — the layer that adds `_z0`, `_notes`,
> `_profile` and `_sigma` on top of `SHARE_IDS` — are closures inside `init()` and still unreachable
> from a test. The shell test exercises `readAppState` / `applyAppState` through the real codec.

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
- `apps/complex-dynamics/eslint.config.js`: add `"no-shadow": "error"` to the app's own rule block
  (contour-integration sets it from the root config; this app has its own, so the rule stays in-app and
  `pnpm --filter complex-dynamics lint` enforces it). Fix what it flags — expect a few renames.
- `vite.config.ts`: `test.environment` stays `node`; the new file opts in per-file via the docblock.

**Guard:** the test itself; `pnpm test` count rises by one file. Risk: `init` has side effects at
module scope (the `__views` debug handle, the a11y announcer) — keep them inside `init`.

---

## WP4 — Instruments, tier 2: the combinatorial panels · effort L · closes I3, I7 · **DONE (I4 carved out)**

> **Landed** (commit `23289cc`). Gate green: lint, typecheck, 554 files / 5,757 tests, build.
>
> **I3 done, and it had a third part the review missed.** Both the lamination and the Yoccoz puzzle
> are models of a _connected_ Julia set and **neither checked**: at the Cantor parameter c = −2.1 the
> lamination drew **104 leaves** and the puzzle returned a valence-2 graph. Both now gate on a new
> `quadraticCriticalBounded`. The tolerance change is as planned (1e-9 on both sides, unrefined
> landings dropped); the choice was wide open, since genuine co-landings agree to 1e-16 while the
> nearest distinct pair is 1e-4 to 1e-6. The decisive check is **structural, not numeric**: every QML
> gap must be a 2-gon, which is what a component root is, and 4e-3 produced gaps of 17, 10 and 9.
> Measured valence repairs: the basilica's β 21 → 1, ∂M's tip 33 → 1.
>
> **I7 done** for `findNucleus`, with an exact period guard rather than the distance threshold
> sketched here — every period-2 centre is also a root of `f⁴(0) = 0`, so the failure was a genuine
> nucleus of the wrong period, and a distance test would not have named that. `refineCycle`'s
> converged flag is carried with I4 below.
>
> **I4 is NOT done, and the reason is a measurement.** This plan proposed deciding
> satellite-vs-primitive by whether the cycle winds about α. **It does not separate them**: the
> primitive period-4 component at −0.1565 + 1.0322i winds about α exactly once, like the 1/3 bulb,
> while the 1/2 bulb winds _zero_ times because a 2-gon is degenerate. The defect is real and
> reproduced — that primitive component is reported with internal angle 1/4, and "Limb", "Show bulb
> rays" and the orbit portrait all ride on it — but there is no verified criterion here, and guessing
> one would ship a wrong mathematical claim in a tool whose whole point is honest labelling. The
> orbit-portrait rotation number at α (`combinatorics/orbitPortrait.ts`, now that the valence finder
> is trustworthy) is the likely route and needs its own slice.

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

## WP5 — Instruments, tier 3: fixed-point classification · effort M · closes I5 + Ruelle · **DONE (I6 carved out)**

> **Landed** (commit `0004dfa`). Gate green: lint, typecheck, 554 files / 5,764 tests, build. Five new
> assertions, all negative-control checked.
>
> **I5 done, and the gap was wider than recorded here.** It is not only the indifferent parameters:
> an _attracting_ c at |λ| = 0.99 also reported `undetermined`, because the 512-iteration budget is a
> convergence-**speed** test and that λ needs ≈ 1,375. Fixed points are now solved for as roots of
> f(z) − z and certified by residual.
>
> **The cusp needed a second fix, and this plan's suggested lever was wrong.** It proposed treating a
> small-denominator rational within float64 reach as parabolic, inside `brjuno.ts`. That breaks
> Cremer: a near-Cremer θ is **closer** to its rational (1e-12) than the parabolic's own numerical
> error is (1e-8), so no tolerance on θ separates them. The real fact is structural — a _double root_
> of f(z) − z is exactly λ = 1 — and Durand–Kerner returns that pair 5.8e-9 apart, which |λ| survives
> and `arg λ` does not. The multiplier is snapped on the detected collision and the classifier is
> untouched.
>
> **Siegel curves** and the **Ruelle row** are gated as planned (1e-9 indifference, |c| ≤ 0.1). The
> Siegel test's golden constant turned out to be a 6-decimal rounding that was never an exact Siegel
> parameter; it is now computed the way the app's own button does.
>
> **I6 is NOT done, and again the plan's premise was wrong.** It is not "seed from
> `findCriticalPoints`": the GPU parameter plane seeds **z₀ = c**, for every family, not the critical
> point. Moving the CPU instruments alone would widen the CPU/GPU disagreement this review separately
> records as **S7** (WP8). The two must move together, which makes it a render change with its own
> blast radius and its own slice. `findCriticalPoints` itself is verified correct on every shipped
> family (±1 for `z³−3z+c`, −a/2 for `z²+az+c`).

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

## WP6 — Instruments, tier 4: matings, worker errors, honest labels in the inspector · effort S · closes I7 (matings, worker), U9 · **DONE**

> **Landed.** Gate green: lint, typecheck, **555 files / 5,781 tests**, build; CD browser suite 5 files /
> 26 tests. Each fix negative-control checked by reverting it and confirming red. **Measuring changed
> two of the three bullets below.**
>
> **The mating bullet's premise was wrong, and the fix is not the one written here.** `1/7 ⊔ 2/7` does
> not "fail to converge" — the pair is mateable and the map exists; the seed sweep simply never
> reached it. The comment above `GEN_SEED_SCALES` claimed the list was "broad enough … for periods up
> to ~7"; measured, it reaches every NON-DIAGONAL mating to period 6 and **none at period 7** —
> `1/7 ⊔ 2/7`, `1/7 ⊔ 1/3` and `1/3 ⊔ 1/7` all failed in both argument orders, while the diagonal
> `1/7 ⊔ 1/7` succeeded because it is gated by the cheaper self-swap `u·v = 1` rather than by
> cross-confirmation. So the repair is a **second, wider sweep as a fallback**, not a refusal message
> dressed up as mathematics: `generalMate` runs the narrow list, and only if that finds nothing runs a
> 13-scale one. It costs ~4.5× when it runs (a period-7 pair goes 450 ms → 2.0 s) and never runs for a
> pair the narrow sweep answers. **Widening cannot manufacture a wrong map** — swap-consistency and the
> period validation are the same gates either way, so extra seeds only supply more candidates for them
> to reject — and it was verified not to move an existing answer: every mating the narrow sweep already
> produced came back bit-identical to eight decimals.
>
> The other half of the bullet was **already done**: the Tan Lei conjugate-limb gate has always
> refused `1/3 ⊔ 2/3` by name before any compute. What was missing is the _distinction_ — a mateable
> pair the engine could not pin down printed "couldn't compute a trustworthy mating", which reads
> exactly like an obstruction. It now says which it is, and that the failure is a limit of the search
> rather than a proof that no mating exists.
>
> **The `@cas/rigor` adoption grew a module rather than a sprinkling of `≈` strings**, because the rows
> were being built **twice**. `main.ts`'s `showInspect` (the panel) and `ui/dataExport.ts`'s
> `inspectToText` (the clipboard copy) each assembled the same report independently, and they had
> already drifted: the panel labelled the Koebe distance `≈` after WP2 and **the copied text printed
> the same number bare**. Both now read `src/ui/inspectorRows.ts`, which is pure and runs in the node
> gate, so a row cannot be honest in one and not the other. Each row carries a `Verdict`, and the level
> is the **meet** over that row's certificates rather than a glyph typed at the call site. Two levels
> fall out that a hand-written `≈` would not have produced: an **undetermined fate is `?`**, not `≈` —
> nothing was established, and reporting it as an estimate would vouch for a classification nobody
> made — and the **Limb row is `≈` although its own arithmetic is exact**, because Tan Lei's criterion
> is exact _about a `p/q` that is not_. The escape time is the one `=`: it is a counted index.
> The glyph sits on the term as a badge rather than in front of the value, so rows whose value is a
> word ("escapes to ∞", "attracting basin") still read as English while carrying their level.
>
> The lockfile change is the single `link:../../packages/rigor` line and nothing else.

**Files:** `apps/complex-dynamics/src/ui/inspectorRows.ts` (new), `src/ui/dataExport.ts`, `src/main.ts`,
`src/render/matingEngine.ts`, `src/render/juliaMetricsClient.ts`, `src/ui/glossary.ts`,
`src/styles/main.css`, `package.json`, `packages/ui/src/computeClient.ts`, `pnpm-lock.yaml`;
tests `test/inspectorRows.test.ts` (new), `test/dataExport.test.ts`, `test/juliaMetricsClient.test.ts`,
`test/matingEngine.test.ts`, `packages/ui/test/computeClient.test.ts`.

- `matingEngine.ts` `generalMate`: when the pullback diverges, return a _reason_ (`{refused: "obstructed"
| "did not converge in N"}`) rather than `null`, and the panel prints it; add the Tan-Lei conjugate-limb
  gate that `mateableLimbs` already encodes so an obstructed pair is refused by name before any
  compute. Test: `1/7 ⊔ 2/7` reports "did not converge (limit N)" not silence; `1/3 ⊔ 2/3` reports
  "obstructed (conjugate limbs)".
- **Worker errors, fixed in `@cas/ui` where the defect is.** `juliaMetrics.worker.ts` already posts
  `{ reqId, error }` on a throw and `juliaMetricsClient.ts:50-53` maps that to `result: undefined` — but
  `createComputeClient` (`packages/ui/src/computeClient.ts:102`) drops an undefined result **without
  calling back**, so the Julia-properties rows sit at "measuring…" forever with no message. Add an
  `onError` option so a failure reaches the caller; `main.ts` then renders "failed: …". CD-motivated, so
  in scope — and because `createComputeClient` has three consumers it ships with tests in
  `packages/ui/test/computeClient.test.ts` proving the **default is unchanged** for a caller that passes
  no handler (the other two consumers keep today's silent drop). CD-side test in
  `test/juliaMetricsClient.test.ts`.
- Inspector rows (`main.ts:356-419`): every numerically-derived row carries `≈` (multiplier, distance,
  Lyapunov) and only closed-form rows carry `=`; import `@cas/rigor`'s branded labels so a bare `=`
  string is a compile error (the app has `@cas/rigor` available via the workspace; add the dependency).
  Herman panel: "Ring detected (≈)". Glossary "Profiles" entry: Artist's AA is 1 with temporal
  accumulation — say so (`ui/glossary.ts:72`).

**Gate:** as WP1 plus `pnpm --filter @cas/ui test` (the package changed).

---

## WP7 — State integrity: share links, chips, profiles · effort M · closes S2, S3, S6 (hashchange, keyframes), U2 · **DONE**

> **Landed.** Gate green: lint, typecheck, **555 files / 5,803 tests**, build; CD browser suite 5 files /
> 26 tests. Eight negative controls, one per fix, each reverted and confirmed red. **Measuring changed
> three of the five bullets, and the test harness turned out to be the biggest finding.**
>
> **The shell test was running TWO APPS AT ONCE.** `document.body.innerHTML = …` replaces the DOM but
> not the `window`, so a second `mount()` in the same file left the first `init()` still listening on
> `window` and `document` — with the first one's plots in its closure. Found by the sphere test: the
> stale init answered the `hashchange` first, cleared the checkbox in the LIVE document and set the
> sphere on its own DETACHED plots, so the box said off and the plot said on. Every earlier assertion
> in that file that mounts twice (the Enter tests, the share round trip) was running against both
> apps; they agreed on the answer, which is exactly why nothing noticed. `mount()` now records what
> `init()` attaches outside the body and detaches it on the next mount.
>
> **S3 (sphere).** Confirmed and fixed, and the checkbox is only half of it: `applyAppState` writes a
> checkbox and stops, so the ids alone would have produced a link that opens with the box ticked over
> a flat plot. One `applySphere()` is now the single path from checkbox to plot — the three change
> handlers, the reset (which had been dispatching synthetic `change` events to reach the same code)
> and `applyFullState` all go through it, after `setProjectionState` because the projection puts each
> plot back at its linear view on the way out.
>
> **U2 (chips) — the defect is worse than "stale", and it was on screen in every session.** The chip
> read the iterations INPUT while taking the centre and zoom from the plot, so it was a sentence about
> two different views. The markup ships 100, the startup profile applies 200, and `applyProfile` never
> refreshed the chip: **every session opened with both chips claiming a count the app was not using.**
> The chip now reads `plot.n`, and `applyProfile` and the "Raise to N" suggestion refresh it.
> **The plan's third clause is dropped, because measuring showed it would make things worse.** Moving
> `refreshProfileLabel`'s listener to `document` was meant to catch the iterations / resolution boxes,
> which live in `.plots-pane` — but those are DEFERRED fields, and a document listener would flip the
> picker to "Custom…" on a value the user had typed and not applied. `readControls` reads
> `plot.n` / `plot.res` instead, so the label describes the applied state by construction; the
> `.controls-pane` listener already covers every live control and `applyChanges` covers the rest.
>
> **S6 (hashchange) — the guard the plan asked for is not needed, measured.** `history.replaceState`
> does not fire `hashchange` (HTML spec), and the app has exactly one `replaceState`, in `shareLink`.
> The one-line `lastHashApplied` check is kept anyway — it costs an assignment and means the writer
> and the listener never have to know about each other — but it is recorded as insurance rather than
> as the fix. A link that carries no CD view now says so instead of doing nothing at all.
>
> **S6 (keyframes) — the plan asked for dd interpolation and measuring found a second bug underneath
> it.** The depth claim first: at 1e15× on a 500-pixel plot a pixel spans 8e-18 while one f64 ulp near
> |c| ≈ 0.74 is 1.65e-16 — **20.6 pixels** — so an f64-only keyframe cannot name the view it captured,
> and two keyframes a few pixels apart are the same keyframe. Then the endpoints: `interpolateView`
> reached `t = 1` through `a + (b − a)·1`, and over 200,000 random pairs that **misses `b` in 9.2% of
> cases** (the geometric zoom in 9.1%). The suite's own "hits the endpoints exactly" test passed
> because its keyframes were 0, 2, 4, 1 and 100. And the double-double form is **worse, not better —
> 38.7%** — two limbs giving it more ways to land an ulp out, so switching to dd alone would have made
> the endpoint less exact while making the interior more so. A segment endpoint now returns the
> captured keyframe itself. The recorders' restore path was dropping the lo limb too, so a clip
> recorded at depth left the plot somewhere else afterwards.
>
> **S2 (copy properties).** `requestOnce()` is built as `settled()`, because a per-request promise
> cannot work here: the client coalesces, a superseded request's callback never fires, and a promise
> tied to one request id would hang for ever with the button disabled behind it. `settled()` waits for
> "a result has been PAINTED (or a failure reported) since I asked", which a superseding result
> answers — plus a 5 s backstop, so a worker that never replies cannot strand the button. Any row that
> is still a placeholder when the wait ends is copied as "not measured" rather than as the app's
> spinner text. **Its test needed a stubbed Worker to mean anything**: under jsdom there is no
> `Worker`, the client falls back to a SYNCHRONOUS compute, and the defect cannot happen — so the
> obvious test would have passed with or without the fix. It also needed a NON-POLYNOMIAL `f`: for
> z²+c the Tier-1 analytic rows answer every question outright at every `c` tried (escaping, `c = 0`,
> `c = −1`), so no row is ever a placeholder and there is nothing to wait for.

**Files:** `apps/complex-dynamics/src/main.ts`, `src/state/appState.ts`, `src/render/keyframes.ts`,
`src/render/juliaMetricsClient.ts`; tests `test/shell.test.ts`, `test/keyframes.test.ts`,
`test/juliaMetricsClient.test.ts`.

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

## WP8 — Shell logic: modes, errors, Esc, orbit start · effort S · closes S4, S5, S6 (Newton banner, σ error), S7, U7 · **DONE**

> **Landed.** Gate green: lint, typecheck, **557 files / 5,825 tests**, build; CD browser suite 5 files /
> 26 tests. Nine negative controls, one per fix, each reverted and confirmed red. **S7's recommendation
> was measured and INVERTED**; S4 turned out to be twice the size the plan gave it.
>
> **S7 — the plan picked the wrong side, and the reason is in the distance estimate.** The plan said
> "pick the critical point … and fix the overlay + shader start to match". Measured, the shader and
> the overlay already AGREE (both seed `z₀ = c` on the parameter plane) and the inspector is the
> outlier — but the inspector is also the one that is right, and the shader is the one that must not
> move. Three measurements decided it. **(1)** On z²+c the two conventions differ by exactly one
> iteration at every escaping parameter (`f(0) = c`, so the orbit of `c` IS the critical orbit one
> step in) and the fate is identical at every interior one; on `z²−2z+c`, whose critical point is 1,
> the seeds 0 / 1 / c escape at 5, 2 and 4 and no two agree. **(2)** Seeding the INSPECTOR at `c` —
> the other way to make them agree — would have silently corrupted the distance estimate:
> `escapeDistance` carries `D₀ = 0`, which is `∂z₀/∂c` for a c-independent critical point, and with
> the pixel seed the same code returns **1.007× at c = 0.26, 1.05× near the boundary and 3.38× at
> c = 1+i**. **(3)** Seven of the eight CPU call sites already use the critical point (`inspect`,
> `computeJuliaProperties`, `findNucleus`, `exactCriticalPeriod`, the nucleus / Misiurewicz /
> component-data paths); the overlay is the sole exception. So the OVERLAY moves to the critical
> orbit, the label names which orbit it is reporting, and the shader is left alone — its loop count
> is never printed, only rendered as a colour band, and changing it would shift every parameter-plane
> image ever exported for a one-iteration cosmetic offset. A consequence worth stating: on the
> parameter plane the dashed "critical orbit" overlay would now trace the identical polyline over the
> solid one, so it becomes a dynamical-plane instrument. **What the plan's test asked for is the
> test that landed** — the inspector's escape count equals the overlay label's — read back off a
> recording 2-D context, since the overlay had no test at all.
>
> **S4 was two defects, and the plan named the smaller one.** The silent mode change is real and now
> toasts with the mode it took away, the reason, and what is showing instead. The larger one: the
> perturbation kernel draws `uMode = mode === 1 ? 1 : 0` — smooth, else escape — so **ten of the
> sixteen colouring modes were selectable while something else was drawn**, four of them already
> disabled for other reasons and six a silent substitution. `modeUnavailable` is now one function
> returning the SENTENCE, and the disabled state, the `title` on the greyed option and the toast all
> read it, so the three cannot drift.
>
> **U7.** The `(z²+c only)` lived in a `title` on a control that is DISABLED when it applies — which
> is the one state in which a title is least likely to be shown and impossible to reach by keyboard.
> It is label text now. The seven quadratic-only panels get one visible line naming the current `f`
> and their action controls disabled, instead of a toast when a button is pressed. The gate re-enables
> only what it itself disabled (`data-gated`), so it cannot hand back the depth / detail sliders that
> `updateYoccoz` and `updateLamination` grey out for their own reasons — asserted in both directions.
>
> **S5.** Six document-level Escape handlers, each testing its own visibility, became one stack. The
> defect is exactly what that arrangement implies — the glossary opened over an expanded plot took
> the plot down with it — and the σ handler already carried a hand-written exception for one of the
> five pairs ("a modal reachable from σ must close WITHOUT also exiting σ"), which is what a missing
> stack looks like just before it is written. Hooking it into `withModalFocus` means the glossary and
> the keyboard reference got it for free.
>
> **S6.** `reportCompileErrors` only ever ADDED, so a Newton error raised on a non-differentiable `f`
> could not be taken down by unticking Newton — it clears first now, a proven no-op for its other two
> callers, which both clear immediately before calling it. And only the ↩ button cleared σ's error
> box, so leaving by Escape (or by importing a non-σ map) left a stale "could not build φ" waiting to
> reappear; `exitSchwarzView` owns it now, and the button's own call is gone rather than duplicated.
> **σ turns out to open under jsdom**, so both halves are tested in the node gate.
>
> **Two test findings.** The Newton test passed VACUOUSLY at first — under jsdom no shader compile
> ever fails, so "the banner comes down" was a statement about a banner that never went up; it
> asserts the banner appears first (the error is CPU-side, from `updateIteration` refusing to build
> the Newton map without f′). And two of the three U7 tests passed with the whole gate removed, being
> regression guards rather than tests of the feature; each now asserts that the gate IS in effect at
> the moment it checks what the gate did not touch.

**Files:** `apps/complex-dynamics/src/ui/escapeStack.ts` (new), `src/main.ts`, `src/render/overlay.ts`,
`index.html`, `src/styles/main.css`; tests `test/escapeStack.test.ts` (new),
`test/overlayOrbit.test.ts` (new), `test/shell.test.ts`.

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

## WP9 — Render parity and robustness · effort L · closes R4–R9 · **DONE**

> **Landed.** Gate green: lint, typecheck, **558 files / 5,832 tests**, build; CD browser suite 6 files /
> **35 tests**. Eight negative controls, each reverted and confirmed red. **Two of the plan's
> prescriptions were measured and changed**, and one item turned out to need no code at all.
>
> **R4 — the plan's line numbers describe a check that does not exist.** `usePerturbation` and
> `desiredPrecision` do not consult `_projection` at all; `_projection === 0` gates the preview, the
> collar and the recolour instead. The defect is real and worse than "the linear path": measured, the
> **df64 shader does not declare `uProjection`** and the perturbation kernel's `dc` is the plain
> linear pixel offset, so past the threshold the picture became the linear view while the note still
> read "Poincaré disk view active", the pointer still inverse-projected and the overlay stayed
> hidden. Both paths refuse under a projection now — and the advisory that should fire there was
> `return null`, the one configuration that most needed a word getting none. It carries a "Switch to
> linear" action.
>
> **R5 — and the standard shader was the WRONG one, not merely the different one.** `_monicDegree` is
> null for anything that is not exactly z^d + c, so `z³ − z + c` emitted `LOG_DEGREE = log 2` while
> `perturbDegree()` handed the kernel 3. The smooth escape time normalises by the polynomial's
> DEGREE, so log 3 is correct and toggling perturbation was re-banding the exterior from wrong to
> right. Measured: `extractPolyPerturbation` reports 3 for `z³ − z + c` and 4 for `z⁴ − z² + c`,
> while `_monicDegree` is null for both.
>
> **R6 — the plan's pointer-events item needs no change, and the gap it leaves is the keyboard.**
> Measured: `.export-progress` is `position: fixed; inset: 0` with a backdrop and no
> `pointer-events: none`, so it already blocks the pointer. What it does not block is the keyboard on
> a focused canvas — and freezing the LOOK is not enough on its own, because every strip re-uploads
> the live centre, zoom and cap too. So the look is snapshotted at entry (with a `finally`, so a
> throw cannot leave the app frozen) AND the plot ignores its own input for the duration. The
> histogram export builds its CDF once, before the first strip, from a bounded 1024² render instead
> of a synchronous full-size `readPixels` — 268 MB at 8192², before the Cancel button could act. The
> overlay rule now matches the on-screen one: `drawOverlay` already bailed on a projection through
> its `projected` flag, but nothing bailed on the SPHERE, so a saved sphere image carried a
> flat-plane orbit and a scale bar computed from a zoom the picture was not using.
>
> **R7.** One line, and the comment beside it was the bug report: "Accumulation resumes on the next
> content change" — except a palette change IS the last change, so nothing resumed and the view
> stayed at the recolour's single un-anti-aliased sample. `scheduleRender(false)` already resets the
> counter; all that was missing was asking for one more frame. It does not cost the fast path:
> during a drag the next appearance event sets `wantRecolor` again before that frame runs.
>
> **R8.** `set zoom` / `set center` / `setCenterDD` refuse non-finite and non-positive input instead
> of storing it (the view span is `2/zoom`). The export refuses a lost context or an incomplete
> framebuffer rather than saving a blank PNG. `schwarzGL` had **no context-loss handling at all** and
> its `render()`'s return value was discarded at the call site, so a lost GPU painted an empty σ pane;
> it reports and the session degrades to the CPU field, as it already does for a GPU render that
> throws. A df64 build failure now reports once through a latch, where the only sign was a
> `console.warn`. And the export ceiling comes from THIS plot's live context as
> `min(MAX_TEXTURE_SIZE, MAX_RENDERBUFFER_SIZE, MAX_VIEWPORT_DIMS)` — it was probing a throwaway
> context for one of the three.
>
> **R9 — the plan's third item would have been a regression, and the real waste was next to it.**
> "Drop the synchronous `plot.render()` and await the scheduled frame" removes the half that makes
> the capture deterministic. The waste is that NOTHING CANCELLED the scheduled frame, so every
> recorded frame was drawn twice at full resolution. A `renderSeq` counter retires it. The other two
> items are real and are now octave-scale rather than frame-scale; **`orbitKeyFor` already keyed on
> the centre** (the plan's other half of that item), so only the cap needed quantising. Numbers,
> including the coalescing hazard found while writing the retirement, are in this app's
> [`PERFORMANCE_REVIEW.md`](../../../apps/complex-dynamics/PERFORMANCE_REVIEW.md). The field
> pre-pass shortcuts (`shaderBuilder.ts:641, 966`) are **not done** — they are a shader change whose
> only check is pixel parity, and the browser suite's SwiftShader timings are too noisy to show the
> gain; recorded rather than attempted.
>
> **One test finding.** The R7 case passed alone and failed in the full browser suite at 149 s: a
> fixed count of rAF ticks is not a safe wait when six specs share one SwiftShader context. Bounded
> polling instead — same assertion, 6 s, and still red when the fix is reverted.

**Files:** `apps/complex-dynamics/src/render/glPlot.ts`, `src/render/plotView.ts`,
`src/render/schwarzGL.ts`, `src/main.ts`, `PERFORMANCE_REVIEW.md`; tests
`test/renderParity.test.ts` (new), `test/renderRobustness.browser.test.ts` (new).

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
  cardioid/period shortcuts. Record the before/after numbers in this app's own
  `PERFORMANCE_REVIEW.md` (the repo-level `docs/perf/` notes are out of scope).

**Gate:** as WP1 plus this app's browser suite (`pnpm --filter complex-dynamics test:browser`).
`packages/gpu`'s suite is not run — nothing in that package changes.

---

## WP10 — Shell UX: first run, sidebar, σ as a peer, import, labels · effort L · closes U3, U4, U6, U8, U11 (duplication) · **DONE (one item deferred, below)**

> **Landed.** Gate green: lint, typecheck, **559 files / 5,855 tests**, build; CD browser suite 6 files /
> 35 tests. Seven negative controls, each reverted and confirmed red.
>
> **U3 — measured, and the old default was worse than "not the best choice".** At `c = −0.7 − 0.4i`
> the critical orbit ESCAPES, so the dynamical pane — half the app — opened on a Cantor dust:
> **0.00 % of the default window is inside the set**, against **13.75 %** for the Douady rabbit
> (measured by counting non-escaping pixels over a 400² grid at the preset's own centre and zoom).
> The first thing a reader saw was the degenerate case, with the properties panel saying "totally
> disconnected". The dynamical preset now starts at the CRITICAL POINT, so the drawn orbit is the
> superattracting 3-cycle and the inspector says so. The disconnected-set wording is fixed
> independently, since a reader can always drag to a dust: a disconnected Julia set has EMPTY
> interior, so "filled Julia set" named something not on screen — the black pixels are "did not
> escape within the cap", a statement about the cap. And the three-into-one formatter turned out to
> be **four** into one: the caption printed 4 significant figures spaced, the hover readout 6 the
> same way, and the overlay label and the inspector title 6 in the PARSEABLE `a+i*b` form — so the
> one that most looked like a value to copy was the one nobody was meant to copy.
>
> **U4 — the five tabs, built as a table rather than as a restructured document.** Each tab is a list
> of element ids and the groups are MOVED into the panels at mount, so the mapping lives in one place
> (`ui/sidebarTabs.ts`) and every group keeps the internal ids, handlers and styles it already had.
> Four controls are genuinely re-homed in the markup, each because the tab that owns its MEANING is
> not the one it was on: **Newton** changes what is iterated, not how accurately (→ Function);
> **anti-aliasing** and **refine while idle** are how hard the plot works, not how it is coloured (→
> Precision); the **colour legend** is about colour (→ Appearance). The global actions are pinned in
> a sticky footer, the strip lists every non-default render-changing setting and each entry switches
> tab and focuses the control, and the WAI-ARIA pattern (roving `tabindex`, Left/Right/Home/End,
> `aria-selected`, `aria-controls`/`aria-labelledby`) is asserted rather than promised. The open tab
> is in `localStorage` and a test pins that it is NOT in `SHARE_IDS`. The inspector shows its hint
> until a point is inspected — its three rows of action inputs used to sit open from first load under
> an empty heading, which is a good part of why the pane opened as tall as it did.
>
> **Three findings while wiring it.** The strip listed `refine while idle: off` at startup, because
> it rendered before `setupProfiles()` — and the profile writes checkboxes PROGRAMMATICALLY, which
> fires no `change` event, so it also needed refreshing from the profile, the preset, a shared view
> and the end of init. `reveal` could not find a control the strip names (`perturbation`) because the
> member table knows only the group that was moved (`precision-group`); it resolves by containment
> now. And an unguarded `scrollIntoView` threw out of the strip's click handler, taking the focus
> move — the point of `reveal` — with it.
>
> **U11 — the duplication was hiding a bug, which is the argument for the extraction.** Five copies
> of "move the white point to c and bring everything with it" had drifted into four spellings, and
> **none of them refreshed the legend**, so every one could leave "filled Julia set" over a parameter
> that had just become a dust. `snapCAndReinspect` fixes that by construction.
>
> **Import.** `window.prompt` cannot say what a valid payload looks like or where one comes from,
> cannot be made accessible, is blocked outright by some browsers, and throws away a long pasted link
> on a stray Escape. The dialog rides `withModalFocus`, so it traps Tab and joins the escape stack —
> and it KEEPS the text when the parse fails, which makes a mis-copied link one edit rather than one
> re-paste.
>
> **U6 — two of the three.** Re-entering σ used to discard the centre, the zoom, the coordinate view
> and the sphere camera every time, so a reader who stepped out to check the Julia set (the whole
> point of σ being a peer) paid for it by navigating back; the view is now kept unless the BUILDER'S
> VALUES changed, the same rule the stage's rebuild guard uses. And the mobile FAB is put away while
> σ has the workspace, where it opened a pane that was behind it.
>
> **DEFERRED, with its reason: the σ analysis overlays do not yet travel in a link.** `SigmaViewState`
> already carries the view, the colouring, the boundary and singularity toggles and the tiling
> params; what it does not carry is the orbit family, the level curves, the cycles, the forward
> curves and the limit set. Those are POINT CLOUDS — a limit set is a `Float64Array` of thousands of
> samples — so the only honest form is the recipe (parameters + which analyses were on) with a
> recompute on open, and a recompute costs seconds for the cloud and the cycle search. That is a
> design decision about what a link may make a reader wait for, not a wiring job, and it is recorded
> here rather than guessed at. The tour step for the σ button goes with it.

**Files:** `apps/complex-dynamics/src/ui/sidebarTabs.ts` (new), `src/ui/activeSettings.ts` (new),
`src/main.ts`, `src/presets.ts`, `src/complex.ts`, `src/render/overlay.ts`, `index.html`,
`src/styles/main.css`; tests `test/defaultView.test.ts` (new), `test/shell.test.ts`,
`test/appState.test.ts`.

**All three decisions are made** (2026-09-16), with the measurements behind them in
[`WP10-DESIGN-QUESTIONS.md`](WP10-DESIGN-QUESTIONS.md) and the sidebar mockups at
<https://claude.ai/artifact/7tFh8FBbjweE5PZfbK5fR4>:

1. **Default view = the Douady rabbit**, `c = −0.122561 + 0.744862i` (period 3, superattracting, 13.6 %
   of the default window interior). The legend's disconnected-set wording is fixed regardless, since a
   reader can always drag to a dust.
2. **Sidebar = five tabs** — _Function · Appearance · Precision · Instruments · Studio_ — **with an
   active-settings strip**. Measured: tabs cut the pane to 32 % of today's height, and are the only
   option that does; they are also the only option in which a picture-changing setting can sit in
   another mode, which the strip exists to cancel.
3. **σ stays a full takeover**; its three real defects are fixed (dead mobile button, overlays dropped
   from share links, re-entry discarding the σ window).

### The tab specification

**Tab contents** (every group keeps its current internals; only its home changes):

| tab             | holds                                                                                                                                   |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Function**    | `f(z,c)`, Import map…, Schwarz reflection σ…, the `a` slider, Presets, apply, **Newton's method** (moved — it changes what is iterated) |
| **Appearance**  | coloring, palette, trap shape, Appearance, Overlays, colour legend                                                                      |
| **Precision**   | iterations, auto-iterations + strength, perturbation, BLA, anti-aliasing, refine while idle, suggestions, orbit preview                 |
| **Instruments** | Julia set properties, Exterior map, and the seven z²+c panels + Herman ring, behind **one** gating line                                 |
| **Studio**      | Projection & Riemann sphere, Export image, Animate                                                                                      |

**Five rules the build must honour.**

1. **Global actions are pinned, not tabbed.** `apply changes / reset / ↶ undo / ↷ redo` sit in a sticky
   footer on the pane, visible from every tab. They are global; putting them on one tab would strand them.
2. **The active-settings strip is the condition of the whole option.** A sticky bar above the tabs listing
   every setting that is non-default _and_ changes the render — perturbation, Newton, auto-iterations,
   AA > 1, refine-while-idle, relief lighting, post-processing, a projection, the sphere. Each entry is a
   button that switches to the owning tab and focuses the control. Empty and hidden when everything is at
   its default, so the common case costs no height. This is what makes S4 visible from every tab.
3. **The `z²+c` gate is one line, once.** The Instruments tab opens with "These need `f = z²+c` — current
   `f` is …" and disables the panels below when the formula is not quadratic, replacing seven per-panel
   toasts (WP8's U7 fix, which lands there and is simply re-sited here).
4. **The open tab is a per-viewer convenience, not shared state.** It goes in `localStorage` under the
   app's existing `cdjs.*` key convention, wrapped in try/catch; it is **not** added to `SHARE_IDS`, since
   a permalink restores a mathematical view and which tab the sharer had open is not part of it. The
   citation block leaves the pane for the page footer.
5. **Accessibility is part of the definition of done**, not a follow-up: `role="tablist"` / `tab` /
   `tabpanel`, `aria-selected`, `aria-controls`, roving `tabindex` with Left/Right/Home/End, and a visible
   focus ring. WP3's shell test asserts the roles, that exactly one tab is selected, that every panel has
   an accessible name, and that the strip appears when perturbation is on.

**The mobile sheet keeps the same tabs** — the bottom sheet renders the identical tablist, so there is one
structure to learn, and the sheet opens at 50 % height with a drag handle to full.

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

## WP11 — Accessibility · effort S · closes U10 · **DONE**

> **Landed.** Gate green: lint, typecheck, **560 files / 5,867 tests**, build; CD browser suite 35
> tests; **`node scripts/a11y-audit.mjs` reports complex-dynamics CLEAN** and no regressions anywhere.
> Eight negative controls, each reverted and confirmed red.
>
> **The audit found a regression from WP10, and the plan's own rule made it a defect to fix.** The tab
> shell tripped axe's `region` rule on two nodes — and neither was caused by it. The controls pane has
> always sat OUTSIDE `<main class="plots">`, so its entire contents belonged to no landmark: a
> screen-reader user had no way to jump to the controls at all. What changed is that a `role="tablist"`
> outside a landmark is what axe notices. The pane is a named `region` now. The second node was the
> `<footer>`: a `<footer>` nested inside another sectioning container is NOT the `contentinfo`
> landmark, so the contact and citation block was outside every landmark **and** buried at the bottom
> of a scrolling controls column — a citation nobody scrolls past is a citation nobody finds. It moves
> to the page level, which is what WP10's own note ("the citation block leaves the pane") asked for.
> Both facts are now pinned in the BLOCKING shell test, not just the non-blocking axe job.
>
> **The contrast claim was measured and is wrong.** `opacity: 0.6` at 0.66 rem on the σ notes gives
> **4.54:1** against the light background and **5.84:1** against the dark one — a WCAG AA pass in
> both. It is still changed, for a reason the review did not give: 4.54 passes by **0.04**, and by a
> multiplier nobody can read off, so any token change puts it under with nothing saying so. The
> `--muted` token states the value (7.46:1 / 6.80:1), and 0.75 rem is a size a reader can read.
>
> **The gradient editor had no keyboard path at all** — the handles were focusable, named `<button>`s
> with no key handling, so the custom gradient (the whole point of the "Custom…" palette) could only
> be built with a pointer. Arrows move a stop (1 %, 10 % with Shift), Home/End send it to an end,
> Insert/+ adds one beside it, Delete/Backspace removes it down to the same two-stop floor the Remove
> button enforces, and each handle is a `role="slider"` carrying its position as `aria-valuenow`. **The
> defect underneath it is the one M7.2 found in contour-integration's pen**: `render()` rebuilds the
> handle row, so without restoring focus the second arrow press would have gone to the body — the
> keyboard path would have been unusable rather than merely awkward.
>
> **Two of the six gradient tests were VACUOUS in the first draft**, and the negative control is what
> showed it: the fixture already has a stop at each end, so "some stop is at 0" is true before a key
> is pressed; and "focus is still on a handle" is true when nothing re-rendered. They count stops and
> require a DIFFERENT element now.
>
> The rest as specified: the exterior coefficient lists are focusable named regions (the finding
> survived four audits because the roster audits each page in its DEFAULT state, so the shell test
> opens every `<details>` and asserts the invariants there); the inspector's `aria-live` moves from the
> whole `<aside>` — which read out all six rows on every recompute — to one status sentence; the
> suggestion severity was carried by a BORDER COLOUR and an `aria-hidden` glyph, so it reached neither
> a colour-blind reader (1.4.1) nor a screen reader (4.1.2), and the glyph now differs by severity and
> carries the word; the onboarding card goes through `withModalFocus` like every other dialog; and the
> σ capture-phase shortcuts name what MAY act (the σ canvas, or nowhere) instead of listing three tag
> names that may not — which had let `+`/`-`/`i` and the arrows fire from a focused button or a
> `<details>` summary, where Left/Right and Home/End have their own meanings.

**Files:** `apps/complex-dynamics/index.html`, `src/main.ts`, `src/ui/gradient.ts`,
`src/ui/suggestions.ts`, `src/styles/main.css`; tests `test/gradientKeyboard.test.ts` (new),
`test/shell.test.ts`.

- Exterior-map lists (`#exterior-param-list`, `#exterior-dyn-list`): `tabindex="0"` + `role="region"` +
  `aria-label`; wrap the panel's status and labels in the group's landmark (the `region` findings).
  **The non-default-state gap is closed in-app, not in the roster.** `scripts/a11y-audit.mjs` audits each
  page in its default state only, which is why this finding survived — but that script is out of scope
  here and the axe job does not block anyway. Instead WP3's shell test asserts the structural invariants
  directly with the panel **opened**: every scrollable list is focusable, every control is named, one
  `<main>`, one `<h1>`. That blocks on every push, which the axe job never did.
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

**Gate:** as WP1, plus `node scripts/a11y-audit.mjs` to confirm this app still reports zero findings.
Its baseline entry is already `{}`, so a clean run needs no edit — and a _new_ CD finding is a defect to
fix in the app, never a baseline to update. Adding the Exterior panel's open state to the roster is
permitted (CD-motivated) but optional: the blocking shell test is the stronger guard.

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
- `FEATURE_RESEARCH.md` §0, `FRONTIER_ROADMAP.md` §4 A2, `PERFORMANCE_REVIEW.md` deep-zoom track:
  bring each to the shipped state — perturbation is no longer z²+c-only, BLA is wired, `src/expr/` and
  `src/glsl/` live in the packages (one commit per file, each a pure doc change). These three are
  app-local, so they are in scope.
- **Out of scope, deferred:** `docs/design/SIGMA-HANDOFF.md`'s stale status header, root `README.md`'s CD
  row and test count, and `CLAUDE.md`'s CD paragraph. All are repo-level. They are listed here so the
  next person knows the app's own docs are current and the repo's are not.

**Gate:** `pnpm format:check` and the full gate (docs only, but the `Software` tag change touches
`hiResExport.test.ts` expectations).

---

## Decisions to record (outside this plan's scope, but they must be written down)

- **No suite nav header, in this app or any other — RECORDED, and not acted on here.**
  [ADR-0044](../../DECISIONS.md#adr-0044-withdraw-the-in-app-suite-navigation-header-the-launcher-is-the-unified-menu)
  withdraws the in-app header suite-wide (the launcher stays; only decision 8's "plus a shared nav
  header later" clause goes), closes ADR-0032's U7 as _withdrawn, not done_, and closes ADR-0016
  AI-5 as moot. The removal — five apps, seven pages, plus the `@cas/ui` primitive and the doc sweep
  — is staged in [`NAV-WITHDRAWAL-PLAN.md`](NAV-WITHDRAWAL-PLAN.md) (N1–N6), which runs independently
  of WP1–WP12 **and is deliberately not started in the same session as this plan** — no app loses its
  header as part of the Complex Dynamics work. Report finding **U5 is therefore closed as won't-fix**; its other half (CD's hand-off
  controls sitting in unrelated panels) is answered by ADR-0044 §4 — a hand-off belongs in the panel
  that owns the state — and the CD end of it is WP10's import dialog.
- **Default parameter and sidebar shape** (WP10's three questions).
- **Whether `#apply_preset` survives** (WP1, U1) — recommended: no.

## Not in this plan (report §4, features rather than fixes)

Multi-critical parameter planes beyond WP5's first step, internal rays / wakes / Hubbard trees,
`z^d+c` rays and puzzles, deep zoom for abs-maps and past 1e28×, the rational-map exterior overlay,
the mating engine's Misiurewicz parent, tiled export and post-processing in exports, palette studio
and compare views. Each is a milestone with its own plan; this document only closes defects.
