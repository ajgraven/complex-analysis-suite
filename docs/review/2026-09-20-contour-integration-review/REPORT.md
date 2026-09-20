# Contour Integration — review (2026-09-20)

A full-app review of `apps/contour-integration` at `master` = `5ebfa54` (immediately after M8, the
shell rebuild, and ADR-0044). Ten reviewers worked disjoint slices in parallel — the exact kernel,
the bounds and branch machinery, the engine and contour model, the families and all 28 records, the
shell's state layer, the shell's cards, the stage/GPU layer with the browser suite, a live
click-through of the running app in headless Chromium (SwiftShader, 1440×900 and 390×844), the
documentation, and the test suite — each under a read-only brief that preferred a measurement to a
reading. The ten slice reports, with every reproduction and number, are in [`slices/`](slices/);
this document is the consolidation. Every item says how it was established: **CONFIRMED** means
reproduced (a script, a mounted shell, a browser), **PLAUSIBLE** means from reading alone.

**The mathematics is sound.** All 28 closed forms and all 94 fixture values were re-derived from
scratch (tanh-sinh / exp-sinh quadrature, Euler–Maclaurin for the sums) and agree to 1e-12 or better;
the merged residues, log residues, sine/cosh recognisers, cyclotomic sums, `Res(f,∞)`, the
exponent-fold rule and Gauss–Legendre all check against independent computations; the ML, Jordan
(on its own arc), dogbone, strip, Gaussian and wedge bounds dominate the integrals they bound.
The browser suite is green (20 files / 220 tests, 48.5 s), the a11y tree has 0 unnamed nodes in every
state visited, every permalink round-trips, the M5.1c refusal flow works live, and there is no heap
leak across 56 record switches.

**The defects are in the gating of what may be SHOWN, and there is one theme.** The app's central
guarantee — nothing prints a value the argument has not earned — is implemented as a gate on some
surfaces and not others, and as a gate on LEGALITY only where the same argument applies to KILL.
Nine of the confirmed bugs below are instances of that one gap (§1). The rest are a keyed-DOM
collision that leaves a stale exact answer on screen (§1.1, the worst single defect because it is one
slider drag away on seven records), a regression from the M8 cutover (the record's own branch cut is
no longer drawn, §2.1), a tab-wedging loop (§1.10), and a set of accessibility-name and typesetting
leaks that the denylist's two instruments structurally cannot see (§3).

---

## 1. A value shown that the argument did not earn (fix first)

### 1.1 [BUG · CONFIRMED · browser] A duplicate DOM key throws on every REFUSING gallery state, leaving the previous binding's `=` answer on screen beside the new refusal, and freezing the permalink

`src/shell/cards/result.ts:147` (the refusal's `key: "why"`) and `:313` (the *"No value for the
target: …"* note, also `key: "why"`) are both direct children of the Result card, so
`dom.ts:197` throws `patch: two children of <section> share the key 'why'` out of `render2` and
`commit`. Reproduced on 12 parameter states across 7 of 19 records swept — A1 `a = 0`/`b = 32.9`,
B1 `b = 0`, C1/C3 `ρ → 1e-6`, D1 `ε = 1`, D2 `p = −3.04`, D6 `a = 0`/`η = 1`. Consequences
measured: the headline updates to *"The argument is incomplete: the residue theorem does not
apply."* while the two `=`-badged values stay at the previous binding (`= π√6/6` from `a = 5` after
dragging to `a = 0`), the check list reads "1 of 1 failed", and the `#vs=` hash stays at the OLD state
because the throw precedes `scheduleDraw`/`syncHash`. A third `key: "why"` sits at `:341`.
No node test renders a refusing gallery state through `patch` (`cards.test.ts:930,950` iterate
fixture 0 with no bindings). Fix: distinct keys; add the 12 measured states to the patch-through test.

### 1.2 [BUG · CONFIRMED · measured] A record whose KILL row FAILS still prints an `=`-badged closed form — for a divergent integral (15 reachable cases, 6 records)

`families/runFamily.ts:386-398` gates Pass 5 on `legalityRefusal` alone; `result.ts:124`'s
`integralRefusal` reads the quadrature verdict + LEGALITY; `levelOfSolved` reads the residue sum.
So D1 at `α = 1.5` (slider range −10…10, the record declares `0 < α < 1`) shows the ledger's
*"incomplete: a boundary term does not vanish"* with the arc row `KILL/failed/⚠` — and directly
beneath it `= −π` for `∫₀^∞ x^{1/2}/(1+x) dx`, which diverges. Swept: `mellin-keyhole α ∈ {−0.3,
1.3, 2.3}`, `keyhole-two-poles s ∈ {−1.5, 2.5, 3.5, 4.5}`, `keyhole-x-to-the-n a ∈ {−1.5, 4.5}`,
`dogbone-two-fractional-powers μ ∈ {2.25, 2.75}`, `strip-exponential-quasiperiod a ∈ {−0.3, 1.3,
2.3}`, `wedge-rational-power n = −3`; all fifteen integrals diverge, every badge `=`. Root causes:
(a) `solveWithin`'s own comment makes the LEGALITY argument and stops one constraint short — gate on
`ledger.closes`; (b) `instantiate.ts:88-92` gives every parameter `[−max(10, 2|v|), +…]` and never
reads `parameters[].constraints`, which is also what makes §1.10 reachable.

### 1.3 [BUG · CONFIRMED · measured] Six bound producers return a `⚠` REFUSAL carrying `asymptotics: "vanishes"`, and the ledger reads only that field — so a refused KILL row is marked *satisfied* and the headline says "The argument is complete."

`engine/ledger.ts:1609` (`ok = disposal.asymptotics === "vanishes"`) against `mlArcBound`,
`jordanArcBound`, `branchArcBound`, `dogboneArcBound`, `logArcBound`, `stripSideBound`, whose
refusals carry the degree-gap asymptotics. `1/(1+z²)` on the semicircle at `R = 0.5` (the slider
starts at 0.1): KILL row `status = satisfied` beside a `⚠` certificate reading *"…a pole may lie on or
outside the arc — take a larger R"*, then `closes = true`, headline complete, `target = 0` (true value
0.9273). The value's badge is the meet and shows `⚠`, but `closes`, `failedAt`, the headline and the
row all say the argument stands. `squareSideBound`, `gaussianSideBound`, `wedgeArcBound` already
return `"bounded"`/`"diverges"` on refusal. Fix at the ledger: `ok` must also require
`certificate.level !== "⚠"`, so it cannot be forgotten a seventh time.

### 1.4 [BUG · CONFIRMED · measured] Jordan's lemma certifies a `≤` on an arc that leaves its half-plane — false by 88×

`kernel/bounds/mlRational.ts:261-360`: `jordanArcBound` takes `R` and `half`, never the arc's
extent (`SEMICIRCLE = Frac.ONE` hardcoded at `:259`), and reads `half` from `sin(mid) ≥ 0` without
checking containment. Circle template at `R = 4`, `exp(i·z)/(1+z²)`, the piece's role set to
"vanishes by L3" in the Contour card's menu: the ledger prints at level `≤`, satisfied,
*"the upper semicircle: |∫| ≤ 2.094e-1"* — for a full circle on which `∫|f||dz| = 18.41` and the
integrand grows like `e^R` on the lower half. Reached by the declared-L3 route and the shape-driven
chain (`ledger.ts:372,430`). Every other producer in the directory takes the extent. Fix: give
Jordan `from`/`to` in units of π and refuse anything not inside `[0,π]` / `[−π,0]` by name.

### 1.5 [BUG · CONFIRMED · measured] `role = "reproduces"` turns a demonstrably failing argument into "The argument is complete." on one click, with an `=` certificate nothing checks

`engine/ledger.ts:1439-1457` mints `exact("the piece reproduces the unknown", …)` on faith; the
sandbox role menu (`cards/contour.ts`) offers it. `z/(1+z²)` on the upper semicircle at `R = 50`
(arc → iπ, does not vanish): before, `closes = false, failedAt = KILL`; after setting the arc's role,
`closes = true, value = πi`, headline complete. M7.3 measured this and worked around it in the drill
MENU only. The evidence exists — `integral.pieces[k].value` for both pieces — so the row can check
`∫_piece ≈ μ·∫_target` numerically, the posture `splitCheck.ts` already takes.

### 1.6 [BUG · CONFIRMED · measured] The Derivation card and the Stepper print `∮ f dz = …` at level `=` past a LEGALITY refusal the Result card correctly withholds

`engine/derivation.ts:317-325` adds the `solve` line whenever `theorem.exactValue !== undefined`
without consulting `integralRefusal`; `steps.ts` and `shell/argument.ts` inherit it. On
`ledger.test.ts`'s own fixture (`1/(z+3)`, circle, cut down ℝ₋, no side): `[legality] ⚠ failed` and
`[solve] = $\oint f dz = 2\pi i$`, and `STEP target "Solution" = 2πi`. The Result card and figure
caption refuse; the derivation beside them does not. `test/ledger.test.ts:551` calls
`legalityRefusal` "the one gate on printing a value at all" — it is one of four surfaces.
Related: `applyBranchTheorem`/`applyLogTheorem` have no `integral.closed` guard where the other four
routes do (`branchTheorem.ts:63`, `logTheorem.ts`).

### 1.7 [BUG · CONFIRMED · measured] The accumulator draws the full partial-sum trail, and its readout reaches the value the Result card is refusing

`engine/contour/accumulate.ts:143-159` asks only `integral.value === undefined`; a LEGALITY refusal
leaves it defined. Same fixture as 1.6: `⚠ Refused` on the card, `6.283005874i` at the end of the
strip's readout. Its own doc says this must not happen. Fix: take the ledger, return `null` on
`legalityRefusal`, and give `strip.ts:184`'s `withheldBecause` the third sentence. The live pass saw
the same shape one level down: a refused sandbox declaration still prints `≈ 6.283i` in the
Numerics disclosure, which opens by default in that case (`result.ts:127` says "No number").

### 1.8 [BUG · CONFIRMED · browser] Moving a parameter slider changes the answer but not the Target or Integrand card

`cards/integrand.ts:27` and `cards/target.ts:55-56` render at `resolution.golden.params`, never
merged with `state.bindings` (`state.ts:527`). A1 at `a = 5`: Result `= π√6/6`, INTEGRAND
`1/(2 + 1·cos θ)`, TARGET `∫ dθ/(2 + cos θ) = 2π/√3` — the `a = 2` fixture, under the rail headed
"what is being integrated". Fix: render both at `{...golden.params, ...state.bindings}`.

### 1.9 [BUG · CONFIRMED · browser+measured] `jordan-quartic` (B3): the Result card says `=` with a closed form, the Derivation's conclusion says `?` with a bare decimal, and the card's "no printable answer" note is skipped

`engine/derivation.ts:434-437` uses `solved.text ?? "≈ …"` and `assembleVerdict(solved.certificates)`
where `result.ts:319-328` uses `levelOfSolved` — one mismatch in 28. And `result.ts:312`'s note guard
is `solved === null`, but B3's `solved` has `value` with `text`/`latex` both `undefined`, so neither the
value nor the note appears: the record's own answer is withheld with no sentence saying why (2 of 92
fixtures). Also its Result value overflows the card by 163 px (§3.4).

### 1.10 [BUG · CONFIRMED · browser] D7 wedges the tab at `μ ≈ −1.9`, a value its slider offers

Same root as 1.2(b): D7 declares `0 < μ < 1`, the slider runs −10…10. At stop 405 no paint arrives in
45 s, the renderer sits at 100 % CPU, and `page.goto("about:blank")` times out — 13 min 32 s of
renderer CPU accumulated in one run. Two fixes: derive slider ranges from `constraints` (and refuse
by name outside them), and cap whatever iterates in the D7 route at `μ < −1`.

### 1.11 [BUG · CONFIRMED · measured] `windingNumber` reports `decided: true` with the WRONG number once `polygonise` silently hits its 1e6-vertex cap

`kernel/geom.ts:118` caps at 1,000,001 points without saying so; the delivered sagitta then exceeds
the requested `cl/4` by 9.40× at every radius, below the `1e-12·scale` clearance floor. Circle of
radius 1e6, points genuinely inside at clearance 2.1e-6…4.8e-6: `n = 0, decided: true` — 24 of 36
sampled points wrong and reported decided. A wrong winding changes `∮` by a whole residue. Each such
query also allocates a million-element array (0.49 s). Fix: make the cap a named refusal (or raise
the floor to the cap-implied sagitta). `winding.test.ts:123-136` stops at `eps = 1e-9`, above the band.

### 1.12 [BUG · CONFIRMED · measured] Closure and join are judged by an ABSOLUTE `1e-9`, and neither `setParam` nor the codec clamps to the declared range

`kernel/geom.ts:125`, `contour/edit.ts:303`: the semicircle's closure gap is `1.22e-16·R`, so
`R = 1e7` reads `closed = false` and LEGALITY refuses a closed contour. Sliders stop at 1e6 (margin
1.22×), but `setParam` (`edit.ts:146`) and the `#vs=` decoder (`viewState.ts:297`) accept any finite
number. Fix: tolerances relative to the contour's scale (`integrateContour` already computes
`scaleHint`), and clamp `setParam` to `param.range`. `sameShape`'s `SHAPE_EPS` (`pen.ts:389`) and
`smallArc.ts`'s `CENTRE_TOLERANCE = 1e-12` are the same class.

### 1.13 [BUG · CONFIRMED · measured] `polesInBand` refuses with a FALSE reason, and `cofactorResidues` over-refuses, because both call `exactPolesOf` with no root finder

`kernel/expLattice.ts:301`, `kernel/kernelResidue.ts:124`. `1/(1+e^z+e^{2z}+e^{3z})` (roots −1, ±i,
all Gaussian) refuses with *"not every root of D(w) is expressible in ℚ(i) or one quadratic
extension"* — untrue; `findPoles`, which injects the finder, pins all three. Fix: pass the same
Durand–Kerner closure `poles.ts:249-252` builds.

### 1.14 [BUG · CONFIRMED · measured] `simplestRational` throws an uncaught `RangeError` on a subnormal, so `findPoles("1/(z - 5e-324)")` crashes instead of refusing

`kernel/exactRational.ts:49-60`: `1/frac` overflows to `Infinity` and `BigInt(Infinity)` throws
past `toExactRational`'s `Refusal`-only catch. Fix: `if (!Number.isFinite(r)) break;` and refuse on
a non-`Refusal` throw.

### 1.15 [BUG · CONFIRMED · measured] `smallArc.ts` still holds the angle whitelist M5.4 replaced with a cap

`kernel/bounds/smallArc.ts:211-229` (`signedSweepOverPi`, the reader for L4 and L5) lists eight
angles; `largeArcLimit` on a `2π/5` arc of `1/(1+z⁵)` refuses *"the swept angle is not a recognised
rational multiple of π"* — the M5.4 finding, on the other two lemmas. Route it through
`ledger.ts:180-201`'s cap.

---

## 2. Stage and GPU

### 2.1 [REGRESSION · CONFIRMED · measured] All seven tier-D records lost their drawn branch CUT at the M8 cutover

`shell/stageView.ts:498` draws `drawnCuts(effectiveBranch(d.state.branch), …)`, and
`ShellState.branch` is by its own doc the SANDBOX's cut system. Every tier-D record mounts with
`state.branch.points = 0`: no hatched cut, no `J = …` label, no admissibility colour, and the cuts
card's "Crossing a cut" block absent. The old shell drew `run.branch` under a record
(`708c6db:app.ts:383`, with the comment *"a figure without it is missing the thing it is teaching"*);
`run.branch` is still computed (`analyse.ts:293`) and read by nothing. `M8/parity.md` does not
record the drop. Fix: source the branch from the resolution in gallery mode; AND gate
`stageController`'s `nearestBranch`/`cycleGrab` on `mode === "sandbox"`, or a record's cut becomes
draggable the moment it reappears.

### 2.2 [BUG · CONFIRMED · measured] The "modulus contours" control reads PRESSED on every branch record while the stage draws none; its first click is a no-op

`cards/cuts.ts:83` defaults `isoOn = state.iso ?? declaredProduct !== null`; `stageView.ts:460`
draws only for `state.iso === true`. Two clicks to turn the feature on. One reader for the default.

### 2.3 [BUG · CONFIRMED · measured] `ISO_CONTOURS = 8` is a COUNT fed into a `[0,1]` STRENGTH uniform, so the contours are extrapolated through `mix` and 7.9 % of the frame crushes to black

`stageView.ts:798` → `glStage.ts:161` → `phase.glsl.ts:258-263` (`mix(rgb, rgb·0.6, iso·uIsoStrength)`).
At 1: 7,223 darkened, 0 black; at 8: 5,183 pure black pixels of 256². The parity test passes `1`.
The modulus branch also lacks the `wIso` pole guard the phase-isoline branch has.

### 2.4 [BUG · CONFIRMED · code] The GPU cut-correction layer is dead: `uCutCount` is pinned to 0, so a dragged cut (or the shadow lamp) moves the hatching while the colour seam stays put

`glStage.ts:173-175`; `cutSegments` (`correction.ts:184`) has zero callers in `src/`. The sandbox
program key `d:${expr}:${declaration}:${sheet}` carries no cut geometry. Three comments say
otherwise (`glStage.ts:173` "M4.7d uploads them"; `cut.glsl.ts:5-9`; `correction.ts:55-58`
"truncated and SAID to be" — nothing says it; 40 points produce 80 segments, 64 read).

### 2.5 [BUG · CONFIRMED · measured] No `webglcontextlost` handling — a lost context leaves the stage black under live exact answers, with `defaultPrevented: false` so no restore is attempted

`ui/stage/glStage.ts` constructor. Three sibling apps handle it.

### 2.6 [BUG · CONFIRMED · browser] Rail formulas overflow their cards; on B3 the answer is unreadable

`.katex-display` is unconstrained in the 285 px rail card; 6 of 28 records overflow — `jordan-quartic`
143 px past the Target card and its Result value to x = 1528 in a 1440 px window; D7 +89, `circle-poisson`
+38, `circle-cif-taylor` +38, `keyhole-two-poles` +39, `series-cot-kernel` +28. Page-level
`scrollWidth` never exceeds `innerWidth`, so no overflow test sees it.

---

## 3. Names, vocabulary and typesetting that reach a reader

The denylist has two instruments — string literals from `src/shell/**` + `src/engine/**`, and the
visible text of 43 mounted states. Everything here is outside both: `src/kernel/**` and
`src/families/**` are not scanned, interpolated strings are invisible to the AST half, attributes
are exempt from the `$`/backslash sweep on a premise step 3.6 retired, and no mounted state refuses.

- **3.1 [BUG · CONFIRMED] The Contour card announces raw LaTeX: 45 distinct `aria-label`s and 52 `title`s carry a macro** (`cards/contour.ts:233,267,319,322,344`, built with `mathPlain` where every other module uses `mathSpoken`): `"certified — the R \to \infty semicircle"`, `"delete the R \to \infty circle"`. The `title` at `:322` is a visible tooltip and the accessible description, and its comment says it is neither. `pieceEditor.test.ts:49-54` finds the tools by `startsWith(label)`, so the broken half of the name is never read. (Found independently by two reviewers.)
- **3.2 [BUG · CONFIRMED] The exported figure's caption prints raw LaTeX in every closing sandbox state, on the plate and in `cas:verdict`** — `HEADLINES.sandbox` is `"$\oint_\gamma f(z)\,dz$ is established exactly."` and `figure.ts:127-172` passes it to `fillText` untouched. All 28 records are clean, so no test sees it; `figure.test.ts` never builds a sandbox resolution.
- **3.3 [BUG · CONFIRMED] `KILL` and shouted words reach visible text from `src/kernel/bounds/`**: `wedgeArc.ts:157` ends *"…the failing constraint is KILL"* and `linearMinorant.ts:131` says `GROWS`; both render in the Derivation card for a wedge with `exp(z²)` / `exp(−z²)`. `runFamily.ts:396` composes *"semicircle-order2: LEGALITY refuses — …"* and `result.ts:313` prints it (a record slug and a house id). `viewState.ts:458,467` interpolate a lemma id and a role id into a refusal.
- **3.4 [BUG · CONFIRMED] The front door's focus trap cycles through the HIDDEN tab panel** (`modal.ts:38-45` has no visibility filter; `frontDoor.ts:562-576` hides a panel without emptying it): Practice tab — 23 focusables, 16 inside the hidden records panel, and `focus()` on `display: none` is a no-op, so Tab stalls. jsdom focuses hidden elements, which is why the trap tests pass.
- **3.5 [BUG · CONFIRMED] Branch-point controls are named by their internal id** (`cuts.ts:426,439`: `"order of branch point b1"`), and the Parameters card prints `R_lim`/`sgnA` where `paramSymbol` exists to print `R` (`parameters.ts:56,78`).

---

## 4. Shell state and control

- **4.1 [BUG · CONFIRMED] A running sweep's rAF loop survives a permalink, a contrast cell, a drill rung, an undo and `destroy()`** — the two paths `M8/STATUS.md:1357-1367` names as fixed. `endSweep()` is called only from `commit` when the argument moved (`app.ts:1112`); `resetTransient` nulls `session.sweep` so `advanceSweep` returns before the branch that would cancel the frame. Measured: after Ctrl+Z, and after `destroy()`, one rAF still pending every frame; the closure retains the whole shell. `sweepApp.test.ts:184` drives `stepOnce: true`, the one branch that cannot have the defect.
- **4.2 [BUG · CONFIRMED] One press of Play leaves FIVE undo entries; Ctrl+Z walks the sweep's own ladder** (`R` = 83255 → 6931 → 577 → 48 → 4) because the full-budget row capture commits `"edit"` mid-gesture and closes the run (`app.ts:395`, `undo.ts:152`).
- **4.3 [BUG · CONFIRMED] The pen stays armed when its rail folds or on "Worked example"** — M7.4's finding through a different door: `session.pen` non-null with no Contour card on screen, `pointerdown` still takes the pen's click first, and Escape is bound on the ink canvas only.
- **4.4 [PERF · CONFIRMED] Every keystroke in the integrand box is a synchronous FULL-budget solve**: typing `1/(1+z^4)/(z^2+2)` on the keyhole costs 685, 317, 155 and 98 ms on four of the keystrokes; the intermediate `"1"` alone is 503 ms at full budget against 3.2 ms at the draft budget (157×). Treat typing as the sliders are treated.
- **4.5 [PERF · CONFIRMED] `panelPlan(len, Infinity)` returns the MAXIMUM plan with a false `capped: true`** — no singularity is lumped with a singularity ON the contour (`kernel/quadrature.ts:165,189`). F2 1.57 M nodes / 2813 ms, E3 2.10 M / 2007 ms, C2 1.05 M / 1083 ms per recompute (every other record 0.8–26 ms); sandbox `z²` on a semicircle 139× slower than `1/(1+z²)`. F2 converges at 32 panels; 16384 are used. And the `capped` flag is a labelling defect: those records' provenance says *"the evaluation budget bound the resolution"* when nothing did, so the sweep table withholds their quadrature for a reason that did not happen.
- **4.6 [PERF · CONFIRMED] `piUpper()` is recomputed from Machin's series on every call** (`packages/exact/src/piBounds.ts:54-73`, no memo): 0.83 ms per call, 61 % of a semicircle ledger recompute, several calls per keyhole/square — M5.5's `cothHalfPi` memo one level up, with the π beneath it unmemoised.
- **4.7 [PERF · CONFIRMED] The GL portrait re-renders on every pointer MOVE** (`stageController.ts:673-690` → `stage.render` unconditionally): 33–35 ms per frame under SwiftShader for a hover that changes only DOM; the drag path is 93.6 ms/move, 2 rAF/move (stage and strip coalescing separately). Cache the render key; the buffer is already persistent.
- **4.8 [IDEA] `saveFigure`'s promise has no rejection handler; the envelope's `v` is never read; `math.ts`'s KaTeX cache is unbounded on user input; a record that cannot run draws the parked sandbox contour; Escape does nothing once a handle is grabbed.**

---

## 5. Documentation — stale, with the measured truth

Nineteen items from the docs sweep plus the ones the code reviewers hit. Each is a quote against a measurement; see [`slices/docs.md`](slices/docs.md) for every line number.

| Where | Says | Measured |
|---|---|---|
| `CLAUDE.md:100`, `README.md:46` | 593 files / 6649 tests | **592 / 6643** (HEAD's own commit message says so) |
| `CLAUDE.md:1327`, app README, `PLAN.md:987` | 845 interactive nodes across 20 pages | **682** after ADR-0044 (the 845/792 pair is itself unreconciled) |
| `CLAUDE.md:102` | 34 QD jsdom specs | **33** (`_algebra-mount.ts` is a helper, docblock on line 10) |
| `CLAUDE.md:101-103`, `vitest.workspace.ts` | QD maths "wrapped as one Vitest spec" | 29 per-file specs under `vitest/node/` since QD-TEST-1 |
| `CLAUDE.md:107-112`; app `vitest.browser.config.ts:13-23` | CI reads env only; "ONE LINE THE OTHER THREE DO NOT HAVE" | CI, CD and `packages/gpu` all take both; two of the three took the line |
| `CLAUDE.md:60`, `ARCHITECTURE.md:377` | `ci.yml` has `build` + `browser` | three jobs — `a11y` too |
| `CLAUDE.md:114` | `launch.json` one entry per app | four of twelve |
| `CLAUDE.md:491` | the "eight-app idiom" | ten apps use `encodeViewState` |
| `CLAUDE.md:466,599`, `PLAN.md:903,942`, app README:712 | `test/shell.test.ts`, `pen.test.ts`, `drillShell.test.ts` as live evidence | deleted at the M8 cutover; `shell2Page`/`shell2State`/`drawnArgument` carry the assertions |
| `CLAUDE.md` M6.1, `state.ts:3`, `PLAN.md:959` | `app.ts` "2,511 lines reached by nothing" | 1,422 lines, five suites reach it |
| `CLAUDE.md` M4.1 | crossing classifier "three-valued" | five values (`endpoint`, `along` make the keyhole legal) |
| `CLAUDE.md:637`, `PLAN.md:451,928,1010` | prediction prompts deferred out of v1 | M8 step 3.4 shipped one; the a11y roster audits it |
| `GALLERY.md:241-246` | tier-D quadrature cross-check SKIPPED | closed at M5.0; §5.2 says so two paragraphs later |
| `GALLERY.md:72,76,102,583,737` | tier E introduces `reproduces`; "six templates"; §5.8/§6 back-refs | tier D; eight; sections misnumbered |
| `schema.ts:505-514`, `GALLERY.md:575`, `PLAN.md:834`, `M5-plan.md:358` | `through: "halfIntegers"` "DECLARED AND STILL UNREAD" | read twice in `instantiate.ts` since M8 3.2 |
| `schema.ts:3-7` | "nothing is prose-for-humans-only except…" | 31,694 chars of unread record text (133 hypotheses, 45 lemmas, 136 traps, `rigor`, `restrictions`, `residueSelection.rule`…) |
| `schema.ts:468`, `:256` | `restrictions` "travels into the verdict"; `rigorOfLimit` "what the verdict consumes" | neither is read |
| `DESIGN.md:472-527,546,608` | v1 schema; four predicate namespaces; four invariants | thirteen namespaces; five invariants; `branch` reshaped |
| `M8/parity.md:79-92,210,261` | contrast grid is a modal with named counterpart tests | step 3.5 made it an inline strip; none of the named tests exist |
| `DECISIONS.md:4003` (ADR-0043) | "the `@cas/ui` nav header stays hard-coded dark" | deleted by ADR-0044, unmarked |
| five `docs/design/*-plan.md` | adopt `mountNavHeader` / `SUITE_APPS` | deleted; ADR-0044's N4 grep missed them |
| `scripts/a11y-audit.mjs:78`, `eslint.config.js:70-88`, `a11y` roster reason | nav header; `app.ts` holds `branch`/`contour`/`mode` as `let`s | gone; three `let`s (`state`, `compiled`, `resolution`) |
| `app.ts:1-5`, `render.ts:9-11,57,82`, `card.ts:206`, `bar.ts:39,141`, `branchEdit.ts:34`, `shell.css:204,349-378`, `theme.css:4,82` | two shells, `?shell=new`, placeholders, front door "not built", `app.css` cancellation block | one shell; all dead |
| `undo.ts:15,107`, `app.ts:1098` | `resetTransient` clears the undo stacks | it deliberately does not (`session.ts:284`) |
| `squareSide.ts:27-32` | D-2 shortfall "30–40 % at every N" | 4.9 % / 27.8 %, corrected everywhere but here |
| `mlRational.ts:325`, `wedgeArc.ts:30`, `solveResidueTerm.ts:90`, `solveTarget.ts:194,385`, `index.ts:74-86`, `summationKernel.ts:163-180`, `exactPredicates.ts:202`, `cyclotomic.ts:43`, `exactResidue.ts:94`, `ledger.ts:1712`, `vocabulary.ts`, `stageController.ts:29-45` | cites `jordanUnified.test.ts`; F2 "not loaded"; `coth` "has no formatter"; "no `free` piece"; M4.2 corpus; orphaned/dead doc blocks | each false or dangling; details in the slices |
| `denylist.test.ts:20,290,335`, `penInk`/`figureInk.browser.test.ts` | 14 / 41 states; "FOUR stylesheets" | 43; three (one from `main.ts`, two from `index.html`) |
| `package.json:6` | "Fifth app in the suite" | eleventh published |

---

## 6. Test gaps (the outcome pinned without the reason)

- Nothing asserts the Derivation or Stepper withhold `∮` past a refusal (1.6), nor that the accumulator does (1.7), nor a refusing gallery state through `patch` (1.1).
- `shell2State.test.ts:273`'s "every field differing" pair has `contourSource`, `showStep`, `stageMode` identical — the M6.1 lossy trap in three of twenty fields (two reviewers).
- No DOM sweep of `aria-label`/`title` for backslashes (3.1); `spoken.test.ts`'s "every NAME this app speaks" reads the step titles only.
- `denylist.test.ts` scans neither `src/kernel/**` (13 offending literals) nor `src/families/**`, and cannot see interpolations.
- `branchArc.test.ts` / `logArc.test.ts` never check the bound dominates the integral (measured sound: ratios 1.00–1.18 and 1.9–6.7), the two producers whose value is a float.
- `Golden.value` (the printed closed form) is never evaluated against `Golden.numeric` (94/94 pass when done externally); `contour.windings[]` is never compared to the engine (45/45 agree); loader invariant 3's bonus clause is vacuous over the corpus (0 records declare `bonus`); `residueSelection.rule` is declared by 19 records and read by nothing.
- `declaredParity.browser.test.ts:263` hardcodes `toHaveLength(7)` — the class the suite was red on for three milestones.
- `figure.test.ts:148`'s `else` branch asserts a substring the app never composes; `f2.test.ts:175` can go vacuous on a route change; `onScreenClaims.test.ts:122` swallows unboundedly.
- `kernel/quadrature.ts` has no direct test.
- `denylist.test.ts` spends 39.8 of 42.2 s in COLLECTION (the sweep runs in the `describe` body).

Otherwise the suite is unusually strong: no skips, no `.only`, no matcher-less `expect`, every hardcoded count a deliberate tripwire with an anti-vacuity clause, the golden corpus pinning closed-form TEXT and refusal REASONS, `ledgerDump` a 592 kB byte baseline with presence floors.

---

## 7. Ideas (not defects)

- A `≈`-labelled numeric hint beside a refused declaration is the number the reader takes away (1.7); consider hiding the Numerics disclosure under a refusal.
- Rung iii's menu is the same four templates for every task; a distractor wrong for a different reason each time would make it a diagnosis.
- The `∮` numerics table labels pieces `piece 1…n`; carrying `name` would connect it to the Contour card.
- `parameters[].domain: "integer"` (7 records) could drive `Param.admits` the way `halfIntegers` does.
- `liftInto` decides an exact question with a `1e-12` float nudge; `Exponent.scale` throws where its siblings refuse; `branchArc`/`logArc` use `Math.PI` where `piUpper()` keeps the direction.
- `GLStage.dispose()` leaks the vertex buffer; `initGeometry` hardcodes attribute location 0 without `layout(location = 0)`; the hover path resolves the contour five times per event.
- The Target card's accessible name is ASCII source (`2*pi/sqrt(3)`), pinned as intended; "vertexes" → "vertices"; the fixture refusal reads "that worked example does not have"; no favicon.

---

## 8. What was checked and found sound

Recorded so the next reviewer can skip it: all 28 closed forms + 94 fixtures independently; every kernel numeric primitive listed in `slices/kernel-core.md`; the ML/Jordan-on-its-arc/dogbone/strip/Gaussian/wedge bounds dominate their integrals; `admissibility`, `jumpWeights`, `argCut`, the declaration invariants, `SIDE_DISPLACEMENT`, the crossing order; `analyse` routes on geometry, all six theorem routes refuse undecided windings, a skipped quadrature cannot render as agreement, `edit.ts`'s six ops replay deterministically and commute with `setParam`; the loader's five invariants, D5's borrow at the same binding, `knownValue` in both directions, `Golden.refuses` both ways; `applyState`/`currentState` lose nothing (20 fields), every codec refusal by name, payloads ≤ 1.15 kB, `dom.ts` keyed reconciliation and focus preservation, one global listener removed on destroy, `syncHash`; the cut-parity gate's two mutants asserted directly, the record count pinned dynamically in `shaderCompile`, one program per mode with no relink, `preserveDrawingBuffer`, the canvas a11y wiring, CET-C6; 1270 distinct typeset formulas all valid under `strict: "error"`, no `trust`, the taxonomy 28 = 8 groups, every badge from a verdict, theme contrasts 5.9–15.6:1, `prefers-reduced-motion` honoured, the phone breakpoint; live — 28/28 records, 8/8 groups, every permalink round-trips, the stepper, all ten templates, the M5.1c flow, drag across a pole, the pen, piece editing, undo/redo, four stage modes, the drill's four rungs and their permalinks, the ladder, figure export with `iTXt`/`tEXt` per entry, 43 tab stops all named, focus surviving a recompute, eight link refusals, no phone overflow, no heap leak.

## 9. Not covered

The browser-only half of the focus-trap stall; a hand-driven cut-vertex drag to photograph 2.4; the last nine records of the parameter sweep (stopped by 1.10); Safari/Firefox; real-GPU checks; mutation sweeps (forbidden by the read-only brief, so "outcome without reason" was found by reading and probing rather than by killing mutants); the predicate DSL strings' correctness; a field-by-field diff of the gallery docs' JSONC against the 28 records.
