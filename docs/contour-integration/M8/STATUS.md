# M8 status — read first, update last

Plan: [`../M8-plan.md`](../M8-plan.md). Branch: `claude/inspiring-keller-5sizwl`.
Rule: do the step named under **Current**, update this file, commit, push. Never end a session with
unpushed work. A step that cannot be done as written is recorded under **Findings**, not silently
changed.

## Current

- **Plan drafting:** complete (Parts 1–3, §0–§9). No drafting action remains.
- **Execution: PHASE 0 IS MERGED, and PHASE 1 HAS BEGUN.**
  Phase 0 (steps 0.1–0.7) landed as [#340](https://github.com/ajgraven/complex-analysis-suite/pull/340),
  squashed to `master` as `2a09ee0`; this branch was restarted from it. Its wording pass finished at
  **0 flagged, 0 unapplied** in the review document, against 191 flagged when the five blanket
  decisions were approved.
  **Steps 1.1 (the scaffold), 1.2 (the visual system), 1.3 (the stage controller) and 1.4a (four of
  the left rail's six cards) are done** — `src/shell2/` exists beside `src/shell/`, `?shell=new`
  boots it in the new visual system over a live, DRAGGABLE stage with **all six left-rail cards**
  working. Step 1.4 was SPLIT, on the pattern M5.1 and 0.5b used: 1.4a was Target / Integrand /
  Parameters / Singularities, and 1.4b the Contour and Branch-cuts cards — ~430 lines of the old
  shell between them — plus the rail → stage half of the three-way highlight. **Steps 1.5 and 1.6
  are done**: all nine cards render and the accumulator strip is mounted, scrubs, and carries a
  generated description. 1.5b and 1.6 were written by three agents in parallel, each owning a
  disjoint file set, with the shared plumbing landed first and the review, the sweep and the gate
  kept here.
  **Step 1.7 is done**: the bar (brand as the page's `<h1>`, the segmented Explore / Worked example /
  Drill control, the record button, Sandbox, Contrasts, Fit contour, Copy link, Save figure), the
  three modes with `workedExample` in the codec, the **permalink** (which did not exist —
  `syncHash` is called from `commit` and nowhere else, so the three view-only changes the old shell
  forgot are covered structurally), the contrasts **modal**, and the drill as a right-rail card with
  its masks applied and a task chooser. Written by four agents in parallel on disjoint files, with
  the plumbing landed first and the review, the sweep, the browser pass and the gate kept here.
  The step's gate is [`M8/parity.md`](parity.md) — every behaviour of the old shell's three jsdom
  specs against the new one, three gaps named and dated to the step that builds their surface.
  **Step 1.8 is done.** `modal.ts` is extracted from the contrasts dialog on the second-consumer
  rule and `contrasts.test.ts` is UNCHANGED across the move, which is the no-op proof; the front door
  is a modal picker over the eight `frontRow` records and the eight taxonomy groups, with thumbnails
  drawn from each record's own contour; and the app now **opens on A6**, framed, with a live phase
  portrait. 1.8b was done on a NARROWER lever than the plan named — `coldStartState` rather than
  flipping `defaultState`, which took the blast radius from 121 failures in 16 files to 27 in 3.
  **Step 1.9 is done.** The phase shader's hue path is Kovesi's published CET-C6 (CC-BY 4.0), read as
  a 256x1 texture; one `uMode` uniform gives four portraits — `quiet` (the default), `full`, `iso`
  (a dark line every 30 degrees of `arg f`) and `textbook` (no portrait at all: a paper plate with
  labelled axes, a unit grid, the contour in its piece colours, poles as ⊗ and dashed cuts);
  `stageMode` is in the state, in the codec and in a segmented control in the bar; and M6.4's
  generated stage description is ported, which closes [`parity.md`](parity.md)'s last two gaps.
  **Step 1.10 is done.** `readout.ts` puts `z`, `f(z)`, `|f|`, `arg f` and the piece under the
  pointer in the stage's top-left corner, with a word rather than a float64 token wherever the
  integrand has no value; the hover link now runs in all three directions (rail row ↔ stage ↔
  accumulator trail) through one identifier; and three defects the browser pass found are fixed —
  the readout printing LaTeX source, `repaint` never drawing the strip, and `compile` handing the
  app an evaluator that throws.
  **Step 1.11 is done.** `shell2/undo.ts` holds the stacks and the rules — a link clears them, a
  camera move is never an entry, a gesture pushes once at the start of its run, an edit coalesces
  with the previous push inside 800 ms, and the cap is 100 — with Ctrl/Cmd+Z and
  Shift+Ctrl/Cmd+Z on the document, the pen keeping the key while a path is open, and a text field
  keeping the browser's own undo.
  **PHASE 1 IS CLOSED (step 1.13).** The gate is green, the a11y roster is clean, the bundle is
  measured, and the phase's screenshots are committed under
  [`M8/screens/phase1/`](screens/phase1/).
  **PHASE 2 IS CLOSED (step 2.6).** Steps 2.1–2.5 rewrote the shell's own prose behind three label
  maps in `engine/vocabulary.ts` and a two-part denylist; typeset the ninety-four method strings and
  built the Target card that shows them; gave the figure export three plates; made
  `shell/errors.ts` the one module every machine message a reader can meet goes through; and swept
  six documents onto what is actually there. Between them they found a crash older than M8, two
  layouts that had never worked, an identity printed half in numbers and half in letters, two
  branches of the Result card with no reader at all, a worker protocol that was never built, and —
  at the gate itself — three surfaces still printing `@cas/expr`'s own words. The gate is green,
  the a11y roster is clean, the bundle is measured, and the phase's screenshots are committed under
  [`M8/screens/phase2/`](screens/phase2/).
  **PHASE 3 HAS BEGUN. Step 3.1 is SPLIT** — 3.1a the engine (`engine/steps.ts` + its corpus
  tests), 3.1b the card's stepper and the session's step index, 3.1c the stage's focus and callouts
  — on the pattern 1.4, 0.5b and M5.1 used, because the step as written is three separable pieces
  and the owner's usage is metered. **3.1a is done.**
  **3.1b is done.**
  **3.1c is done — STEP 3.1 IS COMPLETE.** The stage reads the step: the pieces it is about are
  emphasised and the others dimmed (`InkOptions.focus`, a set rather than an index), the pole it is
  about is ringed, and one callout carries the step's own claim on the plane — the vanishing arc's
  bound at the arc, the residue at its pole, the answer at the target piece, the limit at the
  handle it is taken on, that last one announcing itself once. `shell/argument.ts` is extracted so
  the card and the stage build the SAME step list, which is what makes `session.step` mean one
  thing on both.
  **3.2 is done.** `ArcBound.evaluated` on all nine bound producers (42 certified bounds over 28
  records), `shell/scrub.ts` (the number with a dashed underline, `role="slider"`, drag / ← → / ↑ ↓),
  `shell/sweep.ts` (the ladder, the ease-out in log space, the driver), `Param.admits` carrying tier
  G's integer lattice from the record to both controls, and the limit step's **Play** / **Step**
  controls with the checkpoint table that fills as the sweep passes each rung — `≤` for the certified
  bound, `≈` for the two quadrature columns, and a cell left EMPTY where the quadrature's own
  refinement does not stand behind it. Twelve defects, eleven of them invisible to the node suite
  (see **Findings**); the biggest is that the table could not gain a single row, on any record, under
  either control, while four test files were green over it.
  **3.3 is done.** `shell/stepDetail.ts` turns the scrubbed step into Needham's picture — `Δz` and
  `f(z_k)·Δz_k` drawn from `z_k` under ONE magnification, with the angle between them marked — plus
  the four numbers (`|f|`, `arg f` in degrees, `Δz`, the term) and a **Show step** toggle whose
  default follows the mode. What is true in the picture is not either length but the RATIO and the
  ANGLE, which are `|f|` and `arg f` and survive the magnification and the camera; the magnification
  is stated on the plane beside the arrows. Six defects, five of them found only by looking at a
  frame (see **Findings**) — including the arrows coming out `60/s²` px long because
  `camera.scale` is units-per-pixel and the engine wants pixels-per-unit.
  **3.4 is done.** The drill's task chooser is now a **Practice** tab on the front door (the rail
  card has ONE shape again, and `session.drillPicker` is gone with it), and rung iii asks a
  **prediction** before it offers its menu — the half-plane where the arc must lie, or, where no
  half-plane closes, whether the contour encloses anything at all. Which question is asked is
  DERIVED (both semicircles are run over the task's own integrand) rather than declared, the reason
  is the losing side's own ledger row, and the answer is written once into a `ci.drill.v2` key that
  reads `v1` as stages only. Eight defects (see **Findings**); the one that matters is that the rung
  whose question is *which contour?* was printing the answer in FIVE places, and the whole app suite
  stayed green through the repair.
  **Next execution action: step 3.5** (contrasts rehoused — the five cells become a collapsible
  strip of cards above the stage, applying state and highlighting the changed row; the 1.7 modal
  removed).
  **Step 1.12 is done — THE CUTOVER.** `main.ts` stops choosing, the old `src/shell/app.ts` (3,700
  lines), `src/ui/app.css` and four of its test files are deleted, and `src/shell2/` has BECOME
  `src/shell/`. [`parity.md`](parity.md) is complete. The parity sweep found two capabilities the new
  shell had lost — the cut system's handles and the pen's own path, both computed and drawn by
  nothing — and the cutover would have made both permanent.
  The branch may be
  red between 1.1 and 1.12 and must be green at 1.13; it is green. The look is recorded at
  [`M8/screens/1.2-shell2-1440x900.png`](screens/1.2-shell2-1440x900.png) and
  [`1.3-shell2-stage-1440x900.png`](screens/1.3-shell2-stage-1440x900.png) /
  [`1.3-shell2-chip.png`](screens/1.3-shell2-chip.png) /
  [`1.4-shell2-sandbox-1440x900.png`](screens/1.4-shell2-sandbox-1440x900.png) /
  [`1.4b-shell2-keyhole-1440x900.png`](screens/1.4b-shell2-keyhole-1440x900.png) /
  [`1.4b-shell2-declared-1440x900.png`](screens/1.4b-shell2-declared-1440x900.png) /
  [`1.5-shell2-result-1440x900.png`](screens/1.5-shell2-result-1440x900.png) /
  [`1.5-shell2-refused-1440x900.png`](screens/1.5-shell2-refused-1440x900.png) /
  [`1.5b-shell2-full-1440x900.png`](screens/1.5b-shell2-full-1440x900.png) /
  [`1.7-shell2-contrasts-1440x900.png`](screens/1.7-shell2-contrasts-1440x900.png) /
  [`1.7-shell2-drill-rung3-1440x900.png`](screens/1.7-shell2-drill-rung3-1440x900.png) /
  [`1.8-shell2-front-door-1440x900.png`](screens/1.8-shell2-front-door-1440x900.png) /
  [`1.8-shell2-cold-start-1440x900.png`](screens/1.8-shell2-cold-start-1440x900.png) /
  [`1.9-shell2-isolines-1440x950.png`](screens/1.9-shell2-isolines-1440x950.png) /
  [`1.9-shell2-textbook-1440x950.png`](screens/1.9-shell2-textbook-1440x950.png) /
  [`1.10-shell2-hover-1440x950.png`](screens/1.10-shell2-hover-1440x950.png).
- **Last commit:** see `git log -1` on the branch; this file is updated in the same commit as the work
  it describes.

## Done

| date | step | commit | notes |
|---|---|---|---|
| 2026-09-19 | **3.4** | (this commit) | **THE DRILL REHOUSED, AND RUNG iii ASKS BEFORE IT OFFERS.** The task chooser leaves the rail for a **Practice** tab on the front door (`DoorTab`, `openTask`, a stage mark and a complete mark per task), so the drill card has ONE shape again and `session.drillPicker` is deleted; and rung iii now puts a forced choice before its menu — `drill.ts`'s `predictionFor`, an option list, a reveal and a reason. **Which question is asked is DERIVED, not declared**: both semicircles are run over the task's own integrand, so a half-plane is offered exactly when one exists. Measured over the four tasks — `rational` closes BOTH ways (π either way: with no kernel nothing forces the side), `oscillatory` upper only, `forced-downward` lower only, and `indented` NEITHER, because its pole sits on the real axis and both semicircles fail LEGALITY before any limit is taken, which is what routes it to the enclosure question rather than a flag saying so. The reason on reveal is the losing side's own ledger row (`the lower semicircle diverges for $a = 1$`), or, where both sides answer, the two VALUES — the only form in which *either* is a claim. `drillProgress` goes to **`ci.drill.v2`**: `predicted` is tri-state on the wire, first-answer-wins, and `v1` is read as STAGES ONLY and never written, which is rule 1's exception rather than a lapse from it (the field `v1` lacks defaults to *not answered*, which is what a reader who has never seen the question already has). **AND THE RUNG WHOSE QUESTION IS *WHICH CONTOUR?* WAS PRINTING THE ANSWER IN FIVE PLACES** — the Target card's `= π/e`, the record's title naming Jordan's lemma, its strategy line giving the prediction's answer in words, the Contour card's *(upper when $a > 0$)*, the Singularities table's `Ind` column, and the accumulator drawing the record's own semicircle with `1.15565557035` under it. `drillMask("argument")` gains four readers, the strip going through the SAME path a refusal takes; **the whole app suite stayed green through the repair**, so each reader arrives with its own assertion and a pairing that shows the same record unmasked outside the drill. Look: [`3.4-practice-tab-1440x950.png`](screens/3.4-practice-tab-1440x950.png) · [`3.4-prediction-1440x950.png`](screens/3.4-prediction-1440x950.png) · [`3.4-prediction-revealed-1440x950.png`](screens/3.4-prediction-revealed-1440x950.png). Sweep **20/21, one recorded equivalent** (dropping the `decided` guard from the enclosure count is unobservable — all four `decided: false` returns in `kernel/winding.ts` carry `n: 0`, checked rather than recalled; M6.4's equivalent in a new reader). Full gate green: **582 files / 6,258 tests**, lint, typecheck and build silent; app suite re-run green after the sweep restored the tree (131 files / 2,467 tests); a11y roster clean with a new `contour-integration-predict` entry, and four non-default states hand-audited clean |

| 2026-09-14 | review | 3f3c9da | review published; working materials under `review-inputs/` |
| 2026-09-15 | plan Part 1 | 5efe5b9 | §0–§3, ADR-0043, CLAUDE.md pointer; the brief's "even" sentence corrected |
| 2026-09-15 | plan Part 2 | a50b5ed | §4, Phase 1 in full: architecture, thirteen steps, ten suggested sessions |
| 2026-09-15 | plan Part 3 | c014bdf | §5–§9: Phases 2–5 in full, the M8 risk register, the step index (42 steps, 28 sessions) |
| 2026-09-15 | **0.1** | 42bf3cd | the six wrong claims on screen; `families/describe.ts`; `test/onScreenClaims.test.ts` (17 tests, sweep 7/7). Full gate green: 543 files / 5640 tests, lint and typecheck silent, browser suite 132/132 |
| 2026-09-15 | **0.2** | 8f3aa97 | `engine/vocabulary.ts`; the four ids off every surface; `test/vocabulary.test.ts` (7 tests, incl. a corpus-wide sweep) + three shell assertions; sweep 12/12. Full gate green: 544 files / 5650 tests, browser suite 132/132 |

| 2026-09-15 | **0.3** | 0974f13 | `engine/claims.ts`; 40 templates; `LedgerRow.claimData`; `test/claims.test.ts` (6 tests) + `test/ledgerDump.test.ts` byte-identical over 3,918 lines; sweep 18/18. Baseline captured first in 2cad10c. Full gate green: 546 files / 5658 tests, lint and typecheck silent. Browser suite not run — the slice adds no record and does not touch the stage |

| 2026-09-15 | **0.4a** | 0b2a141 | the LaTeX coverage sweep (`test/latexCoverage.test.ts`); `sech`/`csch`/`coth`/`factorial` in `@cas/expr` + `@cas/gpu`; `packages/gpu/test/glslCoverage.test.ts`; 0.1's display rewriter dropped; sweep 13/13. Full gate green: 548 files / 5672 tests. Browser: `@cas/gpu` parity 21/21 in real WebGL2 |

| 2026-09-15 | **0.4b** | 321d595 | `kernel/notation.ts` (TEXT + LATEX, one set of formatters at two notations); `kernel/exprLatex.ts`; `families/latex.ts`; `latex` on every `exactValue` and on the imported row; `test/formatLatex.test.ts` + `test/familyLatex.test.ts`; sweep 20/20. Full gate green: 550 files / 5686 tests. `no-shadow` caught a blanket edit that renamed a map callback into its own parent's binding |

| 2026-09-15 | **0.5a** | aaad6e7 | `claims.md` generated — 202 sentences, five blanket decisions, 72 ledger sentences with 60 drafted; `test/helpers/claimsDoc.ts` + `claimsProposals.ts` + `test/claimsDoc.test.ts` (5 tests) |

| 2026-09-15 | **0.5b-i** | 597697d | the five decisions applied to the ledger's 72 own sentences; `shell/math.ts` + KaTeX; 43 wording-pinned tests re-keyed on templates; new `ledger-dump.txt` baseline |

| 2026-09-19 | **3.3** | (this commit) | **THE AMPLITWIST DETAIL — `f(z)dz` AS THE PRODUCT IT IS.** `shell/stepDetail.ts` turns the scrubbed step into Needham's picture: at `z_k`, an arrow for `Δz_k` and an arrow for `f(z_k)·Δz_k`, both under ONE magnification chosen so the longer is 60 px, with an arc marking the angle between them; the strip emphasises the same term as the `k`-th segment of the trail, where it needs no magnification at all; the panel prints `|f(z_k)|`, `arg f(z_k)` in degrees, `Δz_k` and the term; and a **Show step** toggle carries `ShellState.showStep`, a tri-state on `iso`'s pattern whose `null` follows the mode. **The superposition is a category error taken on purpose** — `Δz` is a displacement in the contour's plane and `f·Δz` is a value, so no camera makes the two lengths commensurable — and what is TRUE in the picture is neither length but the RATIO and the ANGLE, which are exactly `|f|` and `arg f` and survive both the magnification and the camera. That is why the magnification is stated on the plane rather than implied. **SIX DEFECTS, FIVE OF THEM VISIBLE ONLY IN A FRAME.** (a) **The arrows came out `60/s²` pixels long**, because `camera.scale` is plot units per PIXEL and the engine takes pixels per UNIT — reciprocals, both a bare `number` — so on A6 the term's arrow was tens of thousands of pixels, clipped to the canvas edge, and read as a bright bar lying along the real axis. The engine's own tests could not see it: its contract is pixels-per-unit and only the caller was wrong. (b) At `|f| = 0.9956` — A6's real axis near the pole — **equal strokes let the term's arrow hide the step's completely**, 980 term pixels against 0; a wider stroke UNDER a narrower one leaves the step as a fringe, which says what is true. (c) Widening changed nothing until **both haloes were drawn before either ink**: each arrow had drawn its own halo under its own ink, so the term's 5 px of near-black erased the fringe it was meant to fringe. (d) The **angle arc was invisible** — the term's hue at 55 % alpha with nothing under it, 12 pixels painted over a green portrait — and was drawn BEFORE the arrows, so their haloes covered most of it (25 px expected, 5 measured); it is opaque over a halo and on top now, and what tells it from an arrow is geometry rather than colour. (e) The **magnification label sat on the contour**: the plan put it in the readout, which is pointer-only, and the first draft stepped it along the shaft where `textAlign: center` put 90 px of dark halo over the arrow's own head — it steps ACROSS now, `labelAnchor`'s own lesson. (f) The **trail's emphasis was hidden under the head disc** at every scrub position but one: the emphasised segment is always the last drawn and the head is a 9 px disc on its far end, measured 0 painted pixels at 0.05, 0.1 and 0.3–1.0 against 45 at 0.2 — invisible at the default scrub with the whole wire connected. Drawn after the head, with a round cap so a term too short to be a line is still a dot: 4, 6, 58, 7, 5, 4, 4. **BOTH ARROW COLOURS WERE CHOSEN BY MEASURING A REAL FRAME**, which is the only way `inkTheme.ts`'s own rule — a colour says one thing — can be checked: over A6's 11,885 painted ink pixels with the detail off, the first draft's grey matched 75 (handle rings and pole glyphs) and its gold sits 29 from `refusedInk`; teal and lime match 0 and sit 64 and 62 from anything in either theme. **And the corpus inverted the constant it was written for**: `MIN_ARROW_PX` drops the shorter arrow, expected to be `Δz` beside an amplifying pole — but over 6,717 finite steps `|f| < 1` on **6,136 (91.4 %)** and the largest anywhere is 287, so it is nearly always the TERM's, which is not an awkward case but the vanishing-arc lemma drawn (`semicircle-order2` runs `|f| ≈ 1/R⁴` and drops it on 191 of 240 steps). The floor's value is not load-bearing and the measurement says so — 32.6 % of steps lose an arrow at 1 px, 37.9 % at 2, 51.6 % at 6 — and the panel now names which arrow is missing and why. Look: [`3.3-amplitwist-A6-1440x950.png`](screens/3.3-amplitwist-A6-1440x950.png) · [`3.3-amplitwist-damped-1440x950.png`](screens/3.3-amplitwist-damped-1440x950.png). Sweep **28/28, no equivalents** — first pass 19/28, and eight of the nine survivors were ONE gap: the shell's own wiring (does the toggle reach the stage, is the camera the right way up, does the strip pass the step) sat between three test files and was reachable from none, so `stepShellInk.browser.test.ts` mounts the real shell and counts pixels, which is the step's gate clause taken literally. Full gate green: **582 files / 6,240 tests**, lint, typecheck and build silent; browser suite 19 files / 216 tests; both contour pages audit clean and the detail's four states audit clean by hand |
| 2026-09-19 | **3.2** | (this commit) | **SCRUBBABLE NUMBERS, AND THE LIMIT AS A SWEPT LADDER.** `ArcBound.evaluated` on all nine bound producers (42 certified bounds over 28 records), so a claim can name its parameter as a typed argument rather than as a numeral in a sentence; `engine/claims.ts` gains a `param` `ClaimArg` and `certificateClaimAt`, which splits a certificate at `at $R = ‹4›$` and falls back silently everywhere else. `shell/scrub.ts` is the inline control — the number with a dashed underline, `role="slider"`, drag mapped through the parameter's own range, ← → ↑ ↓ by one step, and `Param.admits` carrying tier G's integer lattice so a press moves `N` by 1 rather than by a thousandth of six decades. `shell/sweep.ts` is the ladder and the driver: five rungs even in the parameter's scale, an ease-out in LOG space, and `advance` with three answers — a value, `null` for finished, and `undefined` for *this frame moved nothing*, which only a snapped parameter produces. The limit step gains **Play** and **Step** and the checkpoint table, badged `≤` for the engine's certified bound and `≈` for the two quadrature columns. **TWELVE DEFECTS, ELEVEN OF THEM INVISIBLE TO THE NODE SUITE.** The headline: **the table could never gain a single row** — `advanceSweep(driver.advance(t))` evaluates the driver first, so its "how many had we passed" snapshot always already included the crossing — while four test files were green over it, because each tests a part and the defect lived in the seam none of them looks at. `Step` planned a NEW ladder on every press (the reuse guard was `sweepFrame !== 0`, which a stepped run never sets), so tier G's `N` walked 9, 18, 30, 49, … converging on its limit without reaching it. A running sweep survived undo, a permalink, a record change and a drag, leaving a rAF loop re-scheduling from a closure the session cannot see and `session.scrubbing` pinned true, which holds the WHOLE APP at the draft budget for the rest of the session. One arrow press scrubbed the number AND advanced the stepper, destroying the focused node so a keyboard reader could not press the key twice. The table VANISHED at the moment it was complete. And it printed a target of `1.4e-7` for a number that is 2.22144, fixed by `converged()` — `integratePiece`'s own successive-refinement test, lifted out on the second-consumer rule so the table withholds exactly the cells the engine declines to certify. **The step's hardest measurement is that the wall above tier G's `N` is COST, not legality**: capping the range at `MAX_KERNEL_BAND` hung the gate for 37 minutes, and a resolve is 179 ms at `N = 256`, 2.2 s at 512 and **25.6 s at 1024**, doubling about every 64 — the exact residue sum, untouched by the draft budget. The range is 256, asserted with its timing. Two defects older than the step: the stepper spoke its own LaTeX source into every `aria-label` (3.1b), and `certificateClaimAt` planted a scrub inside *Re z* on 18 rows, right-hand side only, while its doc and its test both said that producer never splits. Look: [`3.2-scrub-A6-1440x950.png`](screens/3.2-scrub-A6-1440x950.png) · [`3.2-sweep-table-A6-1440x950.png`](screens/3.2-sweep-table-A6-1440x950.png). Sweep **31/33, two recorded equivalents and one mutant REMOVED rather than recorded** — the first pass was 14 of 34, and every survivor was the same gap, that twelve fixes had their measurement in a comment and nothing asserting it. `test/sweepApp.test.ts` is the seam's first test, mounting the real shell over a stubbed `requestAnimationFrame` and clock; its own first draft measured a working sweep as a dead one, by flushing ONE queued callback per tick where the shell schedules its draws through the same rAF. Full gate green: **580 files / 6,221 tests**, lint, typecheck and build silent; browser suite 17 files / 209 tests; both contour pages audit clean and the four new states (the scrub, the play control, the table part-filled, the ladder done) audit clean by hand |
| 2026-09-19 | **3.1c** | (this commit) | **THE STAGE READS THE STEP — AND STEP 3.1 IS COMPLETE.** `shell/stepFocus.ts` turns a `DerivationStep`'s `focus` into things on the plane: the pieces it is about drawn emphasised and the others dimmed (`InkOptions.focus`, a SET rather than an index, and deliberately not merged with `highlight` — hover is where the POINTER is, one piece and transient, and this is what the ARGUMENT is about, which survives a pointer that has left the stage and dims everything it does not name); the pole it is about ringed OUTSIDE its glyph, so the marker keeps its own two meanings; and one callout on the plane carrying the step's own claim — the vanishing arc's bound at the arc's midpoint, the residue at its pole, the answer at the target piece, the limit at the handle it is taken on. Callouts are DOM in the overlay because they are typeset and because the overlay's whole contract is *what must NOT be in a figure*. **`shell/argument.ts` is extracted on the second-consumer rule, and it is not tidying: `session.step` is an INDEX**, and `buildSteps` drops a step with nothing in it — so a stage that assembled the derivation without the card's problem statements would get a list one shorter and every index off by one from the card's. One set of arguments, one list, one clamp (`stepIndex`). The derivation is rebuilt on the draw path rather than cached, measured first: 0.016–0.135 ms per record, median 0.030 over the 28, which is 0.2% of a 16.7 ms frame. `derivationCard.test.ts` is UNCHANGED across the move, which is the no-op proof. **THREE CORPUS MEASUREMENTS, EACH OF WHICH CHANGED THE STEP.** (i) **A step can be about TWO pieces and `StepFocus` can only say one** — C1 and C3 split the real axis at the indentation and both halves are the target, so `[...targetIds][0]` would dim half of C1's own target, on one of the plan's five gate records. The set is `focus.pieceId` together with every piece the step's own LINES name; over 237 steps in 28 records that widens **exactly 2**, and both are that one shape. (ii) **A limit parameter need not have anything on the plane**: `handlesOf` makes a handle for a parameter-bound ARC radius and nothing else, so E1/E2/E3's `R` and G1/G2/G3's `N` have none — **6 limit steps** with nothing to pulse, and there is no chip there rather than a chip at an invented place. (iii) **Three boundary steps carry no bound**, because their piece reproduces the target (*the lower edge of the cut: a constant multiple of the target*) — 54 of 57 get a callout and those three get none. The callout is the FIRST `$…$` of the claim, because the KILL line is a paragraph; swept, that fragment is the bound for a vanishing piece, the relation for a reproducing one and the known limit for an indentation. **SIX DEFECTS, FOUR OF THEM OLDER THAN THIS STEP.** (a) **`setStep` redrew the chrome and not the stage** — with the stage reading the step, a `render2` alone left the emphasis, the ring and the callout showing the PREVIOUS step; no node test could see it, and the browser suite found it on its first run. (b) **Dimming the strokes and leaving the halos is worse than not dimming**: a 6.5 px dark halo under a faded 2.5 px stroke is a cord, more conspicuous than the piece was. Measured on A6: the ink layer's total alpha falls **0.17%** with the halos left alone and **20.4%** with them dimmed (2,028,695 → 1,615,064). (c) **The limit step printed a parameter's ID as mathematics** — `$eps \to 0^+$` sets as the product *e·p·s*, and `$R_lim$` subscripts the `l` alone — beside a piece the record calls *the ε→0 circle* and a bound that already writes `\varepsilon`. `vocabulary.ts` gains `paramSymbol`; four of the corpus's six limit parameters needed an entry, and `R_lim` maps to `R` because B1's own KILL line already states its bound *at $R = 4$*. (d) **`StepFocus.poleIndex`'s doc was false** — it indexes the DERIVATION's catch rows, not the step's own `poles` (A6's second residue step is `poleIndex: 3` over an array of length 1), and `steps.test.ts` had always resolved it the right way, so nothing could go red on the sentence. (e) **The callouts were computed with a position and rendered without one**, so every chip would have stacked at the overlay's corner with the right text; the jsdom test that reads the `style` attribute caught it immediately. (f) **A figure must not carry the reader's step**: `figureBytes` draws through the same path with the live session and the permalink it stamps does not carry the step, so a dimmed plate would be a picture its own link cannot reopen — suppressed for every plate. **The app's FIRST motion lands here**, which is what finally gives M6.4's vacuous `prefers-reduced-motion` something to act on — and it is an ANIMATION rather than the plan's "300 ms CSS transition", because a transition fires on a property CHANGE and the chip is created already in its final state; the keyed builder is what makes *once* true. One defect is recorded and NOT fixed: `4.928e-2` inside `$…$` typesets as *4.928e − 2*, in fifteen bound producers, predating M8 and only now on the picture — the repair belongs to every bound claim, not to the callout. Look: [`3.1c-step-bound-A6-1280x900.png`](screens/3.1c-step-bound-A6-1280x900.png) · [`3.1c-step-target-C1-1280x900.png`](screens/3.1c-step-target-C1-1280x900.png) · [`3.1c-step-residue-D1-1280x900.png`](screens/3.1c-step-residue-D1-1280x900.png). Sweep **23/24, one recorded equivalent — and TWO mutants removed rather than recorded**, which is the sweep's own finding: `stageFocus` asked whether a piece id was in the spec and then dropped an unknown id through `findIndex >= 0`, and `focusOf` returned early for `step === "all"` and then returned `NO_FOCUS` for the undefined step `stepIndex` hands back for it — one rule spelled twice in each case, and neither mutant could die because the second reader was doing the first one's job. Re-aimed at the surviving spelling, the filter needed a test (an id the drawn contour does not carry gives −1, and −1 in the focus set dims the WHOLE contour) and the clamp is the equivalent one, because `steps[0]` is always the problem step and its focus is `{}` by construction. The two real survivors each bought a test: nothing asserted that a boundary step emphasises its piece when NO claim was made about it (unreachable from the corpus, and not cosmetic — the step's heading names the piece), and nothing read the POLE pixels at all, so ringing every singularity at every residue step passed everything. Full gate green: **574 files / 6,119 tests**, lint, typecheck and build silent; the browser suite is 17 files / 209 tests; both contour pages audit clean and the stepper's nine states audit clean by hand (A6 at five steps, D1 at four — 0 rules and 0 nodes each) |
| 2026-09-17 | **3.1b** | (this commit) | **THE STEPPER.** The Derivation card walks `buildSteps`'s order: `‹` / dots / `›` / `All`, ← → on the whole stepped region, `session.step` (`number \| "all"`), and Worked-example mode opening at step 1. **`"all"` is the default and is the Phase 1 form** — every step expanded, the whole argument at once — so a reader who never touches the control sees what they saw before it existed; the stepper is an OFFER, not a mode the app puts them in. **The step is SESSION, not state**, by the rule that decides every field there: two readers of one permalink are looking at the same integral, and which step each has open is theirs — and `resetTransient` clears it, so a link, a contrast cell and a drill rung are covered by construction rather than by three callers remembering (M7.4's defect in its own shape). A stale index is **clamped where it is read**, because the step count changes with the record and a reader on step 6 of a keyhole who opens a unit-circle record has asked for a step that does not exist. The dots are BUTTONS — each is the step it names, so the shape of the argument is reachable as well as visible, and a reader who cannot see them gets the same controls named `step 4 of 8 — Residues`. `stageBlock` renders both forms, so `All` is the same picture it always was rather than a second renderer that drifts. **Four findings, three of them from looking at it in a browser.** (i) **A step's title can carry a FORMULA and the summary was plain text** — `Boundary terms · the $R \to \infty$ semicircle` is the piece's own name — so raw delimiters reached the screen, which step 2.1's rendered denylist catches. Typeset now, and `limitArrow` is split out of `limitTag` so the limit step's title is ONE formula rather than `Let $R$ $\to \infty$`. (ii) **One word, two things, on one card**: the head read `10 steps` (the ledger's LINES) above a stepper reading `4 / 8` (the argument's steps). A line is a CHECK — the Result card's own disclosure already says *What was checked* — so the head is `8 steps · 10 checks, each with its evidence` and a block counts checks. (iii) **The answer is not printed under every step**: it has its own step, and repeating it beneath step 2 gives away the ending of the argument the stepper exists to walk. (iv) **THE FOLD WAS BROKEN IN TWO WAYS, BOTH OLDER THAN THIS STEP, AND FOLDING ON THE MODE BUTTON IS WHAT MADE THEM REACHABLE.** `setRail` had **no caller anywhere in the app** — the only thing that ever folded a rail was a worked-example link, and there was no way back from one. And a folded rail went on rendering its cards into the 38 px column the grid leaves it: a stripe of one- and two-letter fragments down the left edge, with `.targetLine` an unreachable horizontal scroll region that `axe` flags `scrollable-region-focusable` — while the CSS comment beside it claimed the rail "shrinks to a labelled strip", which was never built. Each rail now carries its own toggle, named for what is BEHIND it, and a folded one draws that name and nothing else. Sweep **12/13** over the stepper (and 11/12 on the first pass): the survivor was a real hole — nothing asserted that `Prev` is DISABLED at step 0, which is a control that looks pressable and does nothing, the clamp having swallowed the −1. **One mutant was REMOVED rather than recorded equivalent**: the key handler's `INPUT`/`SELECT`/`TEXTAREA` guard is unreachable today, and measuring what will need it showed it would not have helped — step 3.2's inline scrub is a `role="slider"` span, not an input, so the guard read as though the case were handled. It arrives with its consumer. Look: [`3.1b-stepper-worked-1280x900.png`](screens/3.1b-stepper-worked-1280x900.png) · [`3.1b-stepper-step4-1280x900.png`](screens/3.1b-stepper-step4-1280x900.png). Full gate green: **572 files / 6,096 tests**, lint, typecheck and build silent; both contour pages audit clean, and the stepper's two states audit clean by hand |

| 2026-09-17 | **3.1a** | (this commit) | **THE ARGUMENT IN THE ORDER A LECTURER GIVES IT.** New `src/engine/steps.ts`: `buildSteps(derivation, {spec, params})` regroups `buildDerivation`'s four ledger passes into the plan's order — the problem · the hypotheses · the residues · one step per boundary term · the limit · the target · the conclusion — with a `focus` naming the piece, pole, cut or parameter each step is about, and `action: "limit"` marking the step step 3.2 gives a play control to. **It computes nothing**: every line, statement, pole row and level is the object `buildDerivation` produced, moved into a different bucket, which is what makes the invariant meaningful and why a step carries no verdict of its own. `test/steps.test.ts` asserts the plan's three — every derivation line in EXACTLY one step (by identity, not deep equality, so a step that rebuilt a line with a different level fails rather than reads plausibly); the problem first and the conclusion last; one boundary step per non-target piece, in contour order — over all 28 records, with the anti-vacuity clause that the corpus really does vary in piece count. **Two shapes were MEASURED rather than assumed, over 28 records × 94 fixtures.** (i) **The residues split per pole, except where the corpus says otherwise**: 24 records have every enclosed pole's residue individually expressible at every fixture, and the other case is the corpus's own — D3 at `n = 5` and `n = 7` encloses five and seven poles of which ONE is exact, because `ℚ(ζ₁₀)` has degree 4 over `ℚ` and the cyclotomic route computes the SUM without naming a root; F1 at the same `n` is the same fact on a wedge. So: one step per pole when each is expressible, one step for the sum when they are not. (ii) **One limit step per limit PARAMETER**, not one per record as the plan's singular wording implies: a record has 0, 1 or 2, never more, and 2 is always a keyhole's `R → ∞` with its `ε → 0⁺`, which a lecturer takes as two limits with two bounds. The four unit-circle records get no limit step at all, which is right — nothing is taken to a limit there. **Three findings, all from running it.** (i) **Fifteen pole rows across seven records reached NO step**: the per-pole branch dropped every pole the contour does not enclose, and A5's own prose is *the sum over all four residues is 0* — an argument that never mentions the other two has lost the reason the half-plane matters. They ride the first residue step now, with the CATCH lines that are about the singular set as a whole. (ii) **A step's rationale must come from `DERIVATION_STAGES`, not from the emitted stage**, because `buildDerivation` DROPS a stage that came out empty — so a caller who supplied no problem statements got a step whose "why this is in the argument" was the empty string. (iii) **A step with nothing in it is not a step** and is filtered out, which is the same cause seen from the other side. Sweep **10/11**, one recorded equivalent: `windingDecided` in the enclosure test is unobservable, because `poleRows` sets `winding` only when the winding was decided — M6.4's equivalent mutant again, kept for its reason, that a focus should not depend on an invariant established in another module. Both other first-pass survivors were real and unreachable from the corpus, and each bought a hand-built test: a boundary line naming a piece the spec does not carry (it rides the target step rather than vanishing), and the empty-step filter. Not yet wired to anything — the card is 3.1b, the stage 3.1c. Full gate green: **572 files / 6,088 tests**, lint, typecheck and build silent |

| 2026-09-17 | **2.6** | (this commit) | **THE PHASE 2 GATE — and the phase's own claim, checked, failed three times and fixed.** Full gate green: **571 files / 6,077 tests**, lint, typecheck and build silent; the app's browser suite **205/205**; `node scripts/a11y-audit.mjs --strict` over the whole roster reports **no regressions**, with both contour pages **clean**. **The gate found what the phase claimed and had not achieved.** Step 2.4's claim is that every machine message a reader can meet is a sentence; the screenshot of an empty integrand box shows the Integrand card saying *Type an integrand to begin.* while, three cards away and at the same moment, **the Derivation card printed `Empty expression` and the strip printed *Nothing is plotted — Empty expression.*** — `@cas/expr`'s own words — and a third reader was found by reading: **`Copy link` said the CODEC's reason** where the Share card beside it said the mapped one, so the same refusal read two ways and the notice is the one a reader gets at the moment they asked for a link and did not get one. All three are routed through `shell/errors.ts` now, which gains a CLAUSE form (`integrandEmptyClause`) because the strip's line is *Nothing is plotted — ⟨x⟩.* and a full stop inside it reads as a typo. **What failed was not the mapping but its READERS**, which is why the guard is not another table test: `test/denylist.test.ts`'s screen sweep gains two states (an empty box, an expression that will not parse) and an assertion that **no state puts any of the parser's own leading words on screen** — the needles taken from the real `compile`, so a reworded upstream message cannot quietly stop being checked for — with the anti-vacuity clause that the empty state must show the invitation **TWICE** (the Integrand card always did; the Derivation card is the fix), since one occurrence passes with the defect still there. Each of the three is separately pinned (`strip.test.ts` ×2, `shell2State.test.ts` ×1) and each fix reverted and shown red. **Three measurements.** (i) **The bundle: Phase 2 costs +7,789 B of JS**, 917,256 → 924,971 (+0.84 %; gzipped 285,757 → 287,929, +0.76 %) with CSS +74 B and `dist` 2,034,296 → 2,042,085. Phase 1 was +53,292 B and KaTeX was Phase 0's; a phase of prose, three figure plates and one error module is under a percent. (ii) **No page scrolls sideways** in any of the six captured states at 1440 or 1280 — `scrollWidth === clientWidth`, twelve measurements. (iii) **The three states the roster structurally cannot see audit clean under `axe`** — the empty box, the unparseable expression and a refused link, 0 rules and 0 nodes each, every one guarded by a string that must be on the page so a state that failed to open cannot audit clean under another name (M7.4's clause). **Twelve screenshots** under [`screens/phase2/`](screens/phase2/), two widths × six states: the Target card with *How the value was checked* open, the contrasts dialog that now fits, the drill, the empty box, the declared keyhole, and a refused link. **One thing measured and recorded rather than changed:** pasting a `#vs=` into the address bar of an ALREADY-OPEN tab does nothing — the app reads the fragment at boot and deliberately has no `hashchange` listener (a decision recorded in `app.ts`). The first draft of the screenshot script screenshotted the previous state and that is how it was found |

| 2026-09-17 | **2.5** | (this commit) | **THE DOCUMENTATION SWEEP.** Six documents brought onto what is actually there: the root README (its app row, and a test count 450 tests stale), the app README (a status head that stopped at M7, the layout block, and a second M8 paragraph for Phase 2), PLAN §2 and §5, DESIGN §1, §7 and §8, GALLERY §0, and the M8 plan's own status line. **The gate is that no document shows the four house ids as user-facing**, and the fix is not to delete them: `LEGALITY / CATCH / KILL / COVER` are the `ConstraintId` union and half the prose in these files is about the engine, so the app README declares the convention once — *ids where it describes the engine, labels where it describes the screen* — and PLAN §2's sample ledger, which calls itself "the app's primary UI surface", is re-set in the labels a reader sees, with the real disposal wording (`→ 0`, `a known limit`, `the target`) read off `vocabulary.ts` rather than invented. PLAN §5's region table is marked superseded by ADR-0043 with what shipped in its place, and §5.1–§5.3 marked as standing, which is what the ADR itself says. **Three measurements, and the first is the sweep's real find.** (i) **DESIGN §7's worker protocol was never built, and it should not be** — measured, the word `Worker` does not appear anywhere in `src/`: the two things it was written to offload never arrived, because AAA was for pole-subtracted quadrature and quadrature was demoted to a cross-check at M3, and the exact solves run in milliseconds. What a drag actually costs is answered by a draft evaluation budget keyed on `session.gesture`/`session.scrubbing` — a cheaper computation, not the same one somewhere else. The section stays, because "there is no worker" is worth saying where a reader would go looking for one. (ii) **Two of DESIGN §8's own rules were measured and NOT taken**: quantising coordinates to six significant figures is worth 4.0% of the payload (the bulk is structural), and the branch choice is not diffed against a named convention but omitted entirely or written whole, because a partial branch is the one thing a link must never restore. The link sizes are re-measured on the M8 shell rather than carried over from M6.2 — the sandbox's cold start is a **43**-character hash, a gallery link **84**, the longest of the 28 **102**. (iii) **`Session.figureTheme` and `INK_THEMES` had no reader** and are deleted: step 2.3 gave `saveFigure` its plate as an argument, so the field was written once at session start and never looked at, and a two-entry map could not have expressed the third plate anyway. Also re-measured rather than repeated: PLAN §5.1 rule 7's `prefers-reduced-motion` is satisfied vacuously on the NEW stylesheets too (zero `transition`/`animation`/`@keyframes` in `theme.css` + `shell.css`; both `requestAnimationFrame` calls are draw coalescers). No sweep — the step changes documents and deletes dead code; the gate is the measurement. Full gate green: **571 files / 6,073 tests**, lint, typecheck and build silent |

| 2026-09-17 | **2.4** | (this commit) | **ERRORS, REFUSALS AND EMPTY STATES IN PLAIN LANGUAGE.** `src/shell/errors.ts` is the one module every machine message a reader can meet goes through — the parser's sentences (moved in from `cards/parseError.ts`, which is deleted), the codec's refusals on both sides (`linkRefusal` for a link that will not open, `shareRefusal` for a state that cannot be put in one), the six action failures and three confirmations that `app.ts` carried inline beside the code that failed, and the Integrand card's empty state. **The codec's forty-odd refusals collapse to eight sentences and one fallback, and that split is the step's one real decision**: all but a handful differ only in which WIRE FIELD was wrong, which is a fact about this program rather than anything a reader can act on, so what stays distinct is what they could do something about — an example this build does not have, a fixture past the end, a contour or a backdrop this version does not know, a link from another app in the suite, a link cut short in the copying, a declaration standing on a branch point the state no longer carries, a practice stage that does not exist. The codec's own `reason` is unchanged and every wire-format test still reads it; what changed is that nothing shows it to a reader. **The table test is driven by the producer rather than by a transcription of it**: `test/errors.test.ts` reads every `reason:` literal out of `viewState.ts`'s own TypeScript AST — template literals come back with a `⟨x⟩` where each substitution goes, concatenations are folded — and requires each one to reach a sentence with no code identifier in it, ending in a full stop, with the fallback reached by the wire-shape reasons and by nothing else. A refusal added later cannot fall through quietly: it appears in the table the moment it is written. **Three findings.** (i) **Two branches of the Result card had no reader.** A gallery record whose run FAILED printed `There is no integrand.` — false in the one place a reader looks for an explanation, with the real reason reachable only from the Derivation card; and where Pass 5 refuses with the run intact, `StateResolution.note` has held that sentence since step 1.1 while the card showed `∮` and left the integral the example set out to determine unmentioned. The second is not hypothetical — measured over the whole corpus, **D3 at fixtures 3 and 4** reaches it, its own declared refusal at integer `α` where the two edges of the cut carry the same phase and cancel, so the test finds the case in the corpus instead of staging one. (ii) **An empty box is not an error**, and it was told it was one: `compile("")` refuses with `Empty expression`, which the parse rules turn into *there is no expression to read* — true, and addressed to somebody who has just cleared the box on purpose. It is an invitation now, and a broken expression still gets the reason. (iii) **`main.ts`'s own comment read "`src/shell/` beside `src/shell/`"** — step 1.12's rename ran through the prose as well as through the imports, leaving nothing to tell the two halves of the sentence apart. Sweep **12/12**, one closed on a second pass: nothing asserted the missing-target line, which is exactly the branch the step added. Full gate green: **571 files / 6,073 tests**, lint, typecheck and build silent, browser suite **205/205**, both contour pages audit clean |

| 2026-09-17 | **2.3** | (this commit) | **THE FIGURE EXPORT'S THREE PLATES.** `Save figure` offers **dark** (the stage as shown, including the reader's own stage mode), **light** (the portrait washed onto paper, the ink in the palette darkened for a light ground) and **print** (the textbook plate: no portrait, axes, a unit grid, the contour in its piece colours, poles as ⊗, cuts dashed, black on white) — each downloading a correct plate, each carrying the same permalink, value and verdict, and each stamped with `cas:theme`. Two of the three were disabled buttons reading `title="Phase 2"`. **The light plate is a UNIFORM, not a fifth stage mode**: `uWash` lifts the lightness into the upper two thirds, cuts the chroma by 45% and blends the result 35% toward the paper, because `stageMode` rides the codec and the bar and a fifth value there would be a portrait nobody can ask for appearing in every switch that handles the four. The print plate needed no new drawing code at all — it is the textbook mode, which step 1.9 built. `stageView.plate()` draws into the stage's OWN canvases and hands them back: a second GL context would need its own program, its own ramp and its own relink for every integrand, to draw a picture this one has already been built for. Nothing is composited in between, so the reader never sees the intermediate frame, and the live stage is restored before anything is awaited. The INK is re-rendered at 2× and the portrait is not — a smooth field loses nothing to `drawImage` and a hairline loses everything. **Four findings.** (i) **The caption's plate is not the app's**: the dark plate reads its colours off the shell's computed style, which on paper is near-white text on near-white ground; `FIGURE_THEMES` carries the other two, asserted at WCAG AA (4.5:1 for the value line, 3:1 for the title and verdict). (ii) **The accumulator's trail was drawn in the dark theme onto a white plate** — a pale hairline over paper with axes at 16% alpha that are not there at all. `StripDraw` already took a theme; the export now passes it. (iii) **The plan's KaTeX caption experiment: the route does NOT taint, and is unusable anyway.** Measured in Chromium — KaTeX → SVG `foreignObject` → `drawImage` → `getImageData` returns 1,972 ink pixels with no `SecurityError`. But an `<img>`-loaded SVG cannot fetch the KaTeX fonts: the same HTML drawn with `font-family:serif !important` is **byte-identical** (2,864 ink pixels, same bounding box) while `monospace` differs (3,083), so the face is a fallback — and the fallback lays the formula out at **699 px against the live document's 179**, overflowing its band. Inlining the four woff2 faces a cold start fetches (53,388 B, step 1.13) would be ~71 kB of base64 in the bundle for a caption. The plain-text caption stays, with the measurement rather than the plan's guess as the reason. (iv) **The print plate must have ONE ground**: its GL buffer is a flat clear of the ink theme's paper (`#f7f8fa`) where the plate's background is white, so compositing the portrait layer at all tints the picture band 3% grey against the caption band — not enough to move a luma bound or a colour count, and exactly the seam a printed figure shows. Sweep **7/7**; its one first-pass survivor was that seam. Recorded and not fixed: **twelve of the twenty-eight record titles carry `_{…}^{…}`** in the field the 0.6 standard calls the human title, and the caption prints it — `∫_{−∞}^{∞} dx/(1+x⁴) by a semicircle` on a plate somebody puts on a slide. Look: [`2.3-plate-light.png`](screens/2.3-plate-light.png) · [`2.3-plate-print.png`](screens/2.3-plate-print.png). Full gate green: **571 files / 6,066 tests**, lint, typecheck and build silent, browser suite **205/205**, both contour pages audit clean |

| 2026-09-17 | **2.2** | (this commit) | **RECORD-LEVEL PROSE ON SCREEN.** All **94** `Golden.method` strings rewritten for a reader and typeset, and the Target card rebuilt into the plan's order: the title, the identity, the fixture picker, the contour phrase, **what the argument turns on**, the citations, and **How the value was checked**. **Two of those were on no rail card at all.** `description.point` is the second line of every front-door card and appeared on no card in the rails, so the one sentence saying why THIS contour was chosen was reachable only from the picker; and `Golden.method` — required by the schema, because a value with no method is an assertion — was rendered NOWHERE. The old shell folded it away under *how the golden value was verified*; the rebuild dropped it, so ninety-four strings written for whoever was building the corpus went five milestones without a reader, and they read like it: trap ids, fixture flags, references to research documents nobody has, `PLAN §3.2`, `refusals.json`, and one capitalised word per sentence. **Four findings.** (i) **`golden.value` belongs to the record's FIRST target**, so at a variant fixture it is the value of a different quantity — A5's half-range corollary is `pi/4` under a target written `\int_{-\infty}^{\infty}`, worth `pi/2` — and appending it there would print an identity that is simply false. The card asks `isVariant` first. (ii) **The identity was half in numbers and half in letters**, on this card and on the front door's cards since they were built: the left-hand side has substituted the bindings since step 1.4 and the right-hand side is the record's own text, so D1 printed `\int_0^{\infty} x^{0.3-1}/(1+x)\,dx = \pi/\sin(\pi\alpha)`. Both sides are read at the same fixture now; the general form in symbols is the Result card's business. (iii) **The spoken twin had not substituted at all.** `identityText` was `targetText` of the symbolic target, so the moment the card passed an explicit label the picture said `1/(1+1\cdot\cos)` and the accessible name said `1/(a + b*cos(theta))` — the one place a reader who cannot see the formula would have been told the symbols were still there. `targetText` takes the same `at` as `targetLatex` now, through the `withParams` that moves down into `describe.ts` so both can reach it. (iv) **Two records cite a chapter in TeX's OTHER inline delimiters** — `\(x^{\alpha}R(x)\)` — which this app's `$…$` convention does not read, so the citation printed its own markup; step 2.1's on-screen sweep now bans a backslash as well as a `$`, and caught them. `disclosure` is lifted into `cards/card.ts` on the second-consumer rule, which was already past: `result.ts` and `derivation.ts` carried byte-identical copies and the Target card is the third. New test `test/methodVoice.test.ts`: the plan's five rules plus step 2.1's list, every formula inside `$…$`, and every one of them parsing under KaTeX with `throwOnError` — the flag shared with the test that checks the instrument, so a mutant turning it off fails both. Sweep **9/9, no equivalents**; its one first-pass survivor was real and is the finding above — a mutant that dropped the bindings from the LATEX alone passed, because the test read the accessible name and nothing read the typeset source, which KaTeX carries in its own `<annotation>`. Full gate green: **571 files / 6,064 tests**, lint, typecheck and build silent, browser suite **201/201**, both contour pages audit clean |

| 2026-09-16 | **2.1** | (this commit) | **THE SHELL'S OWN PROSE.** The branch-cuts card, the drill panel, the contrast grid and the contrasts dialog rewritten to the five rules of step 0.5a; `engine/vocabulary.ts` gains `templateLabel`, `disposalLabel`, `tagLabel` and `limitTag`, with `TemplateId` and `Disposal` moved there and re-exported on `ConstraintId`'s precedent; the nine tags that were written where they were rendered in four card modules become one map. The strip's compare-toggle sentences were **checked and left alone** — they already follow the rules. **The denylist is TWO tests** (`test/denylist.test.ts`): the SOURCE half reads every string literal in `src/shell/**` and `src/engine/**` out of the TypeScript AST, which is complete and sees no comments — where the house words legitimately live — and the RENDERED half mounts the app across **43 states**, every record among them, and reads what is on screen. **The plan's exemption list is a path list and could not be one**: it names four files, and measured, the ids appear as data in ten, the largest being `ledger.ts` with 48 — the module the denylist most exists to police. So the exemption is the literal's SHAPE and the rendered half is what stops an exempt id reaching a reader. **Nine findings.** (i) **The plan's own tag replacement is wrong twice**: `$R\to\infty$` and `$\rho\to0^+$` are right for the record the reviewer had open, and over the corpus the parameters carrying a limit are named `R`, `R_lim`, `N`, `eps`, `eta` and `rho` — a literal `R` mislabels three of the six — while naming the parameter at all is redundant beside the readout that has just named it. The tag carries the limit alone. (ii) **Two picker vocabularies cannot typeset**: templates and disposals are the text of an `<option>`, which renders no markup, so `$2\pi$` would be four characters and a backslash; their symbols are Unicode and every other sentence in the app is typeset. (iii) **The rendered half found what the source half structurally cannot** — eleven of the twenty-eight records carried a shouted word on screen and two of them said *the solve*, all in `families/` and `kernel/`, outside the two directories the plan's scan covers. (iv) **Typesetting the contrast labels made three accessible names read raw LaTeX**, because `mathPlain` only strips the `$`: a screen reader would have read `\int_0^{\infty}` out as "backslash int". A `labelText` twin now carries the spoken form — and that made `contrasts.test.ts`'s own `$`-freeness assertion falsifiable for the first time, which its comment had said it was not. (v) **A cell's `answer` is a VALUE, not prose**: `contrastGrid.test.ts` compares it against the engine's own text for that record, which is what makes the declaration falsifiable, so putting it in `$…$` broke the identity — reverted, with the reason recorded where the field is declared. (vi) **A crash older than M8**: `programOf` keyed the stage's shader program with a bare `JSON.stringify` of the declaration, whose exponent is a `Frac` carrying bigints — and `JSON.stringify` refuses a bigint rather than skipping it — so **declaring a branch factor in the sandbox threw out of the draw, every time, since M5.1c shipped the surface**. Nothing could see it: `drawNow` runs inside a `requestAnimationFrame` callback, where a throw is an uncaught error the jsdom specs never observe and the stage they cannot render anyway. `stableKey` is extracted from `undo.ts` on the second-consumer rule, the second consumer having arrived as a defect. (vii) **The contrasts table had never fitted its dialog**: it wore `numTable`, whose `th` rule is `white-space: nowrap`, so no column head ever wrapped — measured at 1440 px, **2,250 px of table in a 1,248 px dialog**, with the fourth and fifth columns drawn where nothing could reach them, and step 1.7's own screenshot has the third cut off mid-word. (viii) **A verdict was a flex row**, so every node of its sentence became a flex item: the split-check refusal, which is text, formula, text, formula, text, was laid out as columns two words wide — 129.9 px tall against 78.3, its first run of text 48.0 px against 140.4. `share.ts` had been doing the same since step 1.6. (ix) Three records' citation notes printed raw `$…$`, caught by the new rule that **no `$` may reach a reader**. Sweep **13/15**, one recorded equivalent (`table-layout: fixed` is unobservable once the nowrap is gone, and is kept so a longer note cannot re-grow a column) and one recorded uncovered cosmetic (a `.segmented` button is a flex container, which trims the whitespace at the edges of its anonymous text — measured, the label read `Cuts as rays fromz₀`, and the label is Unicode now). All four first-pass survivors were real: the five disposal answers could all read the same, the limit tag could name the wrong limit, the split refusal could print raw dollars because no swept state had declared a factor, and the source scan could drop `engine/` because `shell/` alone is 37 files. Full gate green: **570 files / 6,054 tests**, lint, typecheck and build silent, browser suite **201/201**, both contour pages audit clean |

| 2026-09-16 | **1.13** | (this commit) | **THE PHASE 1 GATE.** Full gate green: **569 files / 6,044 tests**, lint, typecheck and build silent; the app's browser suite **199/199**; `node scripts/a11y-audit.mjs --strict` over the whole roster reports **no regressions**, with both contour pages **clean** — so the baseline stays `{}` and there is no new rule to record, which is the target M6.4 set. It is also the first roster run that measures the NEW shell (1.12's finding: it had been auditing `index.html` without `?shell=new` since 1.8). **The bundle is measured, which the plan's risk register defers to this step.** Three builds of the same app: pre-M8 (`58bd0a7`) **587,129 B** of `dist`, JS 574,530 (180,923 gzipped), CSS 11,982 (3,340), **no KaTeX**; Phase 0 on `master` (`2a09ee0`) 1,978,426 B, JS 863,964 (266,536), CSS 40,897 (11,307), 59 KaTeX font files; and now 2,034,296 B, JS 917,256 (285,757), CSS 43,475 (11,770), the same 59. So **KaTeX and its fonts are PHASE 0's cost, already on `master`** — +289,434 B of JS and 1,072,948 B of fonts — and **Phase 1, the entire shell rebuild with the old 3,700-line shell deleted, is +53,292 B of JS (+6.2%, +7.2% gzipped)**. **The font total on disk is not what a reader downloads**: a cold start on A6 fetches **four files, 53,388 B**, all `woff2` (Main-Regular, Math-Italic, Size1, Size2) — the other 55 are the `woff` and `ttf` fallbacks and the faces this page does not set. The risk row's mitigation is verified and off by two: **six** apps ship KaTeX, not four (argument-principle, complex-dynamics, complex-function-plotter, quadrature-domains, riemann-map and this one). **The page does not scroll sideways at any width measured** — `scrollWidth === clientWidth` at 1440, 1280, 1024, 900, 899 and 400 — and the grid swaps to the phone notice at exactly 899. **Sixteen screenshots** under [`screens/phase1/`](screens/phase1/), two widths (1440×900 and 1280×800) × eight states: A6, D1, G1, the sandbox with the keyhole, the front door, and the three non-default stage modes. **The quiet mode's shot IS `a6-*`**: quiet is the default, and a separate capture of it differed by **15 pixels of 1,296,000**, all text antialiasing in the left rail, so it was dropped rather than committed as a second copy of the same frame |

| 2026-09-16 | **1.12** | 7a2f571 · (this commit) | **THE CUTOVER.** `main.ts` stops choosing; `src/shell/app.ts` (3,700 lines), `src/ui/app.css`, `test/shell.test.ts`, `test/pen.test.ts`, `test/drillShell.test.ts` and `test/narrowLayout.browser.test.ts` are deleted; `src/shell2/` has BECOME `src/shell/`; the stylesheet budget is `theme.css` + `shell.css`. [`parity.md`](parity.md) is complete — every capability of `shell-review.md` §1–§2 and every behaviour of the three old jsdom files, each with the test that covers it or a reason it was dropped. **The parity sweep found two capabilities the new shell had LOST**, both computed and painted by nothing, and neither visible to any test: the cut system's HANDLES (grabbable and announced since step 1.3, aimed at a spot on an empty plane) and the PEN's own path (the crosshair and the snap chip and nothing else, so every vertex was invisible until commit — which is why `inkTheme.ts` has carried a `penPreview` colour since step 1.2 that nothing drew with). Both are ported into `ink.ts`. **Deleting `app.css` took the DOCUMENT's typography with it** — every rule in `theme.css` is scoped under `.shell2`, which was right while two shells shared a page and left `body` on the browser's serif the moment the other sheet went, measured at 390 px where the phone notice is the only thing outside the grid. **Below 900 px the grid is replaced by a notice** naming a desktop and showing the address as text: a CSS swap rather than a resize listener, so a rotation and a split screen need no telling, and it goes LAST in the stylesheet because `.shell2 { display: grid }` has the same specificity — the first draft, at the top of the file, was overridden and the notice never appeared, having passed a test that asserted the media rule's CONTENTS rather than its effect. The page no longer scrolls sideways at 400 px, where the old shell laid out 656. `drillInk`'s `inkPixels === 0` at rung iii is re-expressed rather than dropped (the new shell draws the pole rings on the ink canvas — 367 pixels — so it is zero OUTSIDE a disk around each pole, positions read off the resolution). **Sweep 7/12 on the first pass and 12/12 after, no equivalents; all five survivors were real and three needed an instrument that did not exist.** (i) `pn-no-link`: nothing read the notice's address, closed by a test that waits out `syncHash`'s 250 ms coalescing. (ii) `doc-no-body`: closed on `getComputedStyle(body).fontFamily`, and that the notice INHERITS it. (iii) `mk-pen-one-node` took four attempts: two clicks do not reach the guard at all, because `penClick` sets the pending end to the vertex it just placed, so two placed vertices are THREE nodes — the state a `>= 3` guard decides is one vertex and the rubber band to the cursor, which is also the first thing the pen ever shows. Three earlier drafts asked only that SOME pixel had changed and passed with the draft undrawn, because the pointer events move `session.hover` and a hovered piece is re-stroked at 4 px against 2.5. In a clear corner the control window reads 0, the draft inks it, and the mutant leaves it at 0. (iv) `mk-pen-not-dashed` needed a THIRD instrument. Ink: 1,831 pixels dashed against 1,907 solid, 4%, because most of it is the halo's width rather than its length. Runs of ink: one either way — `drawPenPath` strokes the halo with the same `[6, 4]` and `lineCap: "round"`, so each 4 px gap is closed by two 2.25 px caps. What the gaps leave is the CORE colour, so the walk compares the centreline against a point 1.6 px off it (inside the 4.5 px halo, outside the 1.8 px core): **13 runs over 119 px, the dash period of 10, against 1**. (v) `mk-handle-shape`: "was clear, now inked" is unavailable, because the keyhole's inner circle and its two lips meet at the origin and the 25 px about the branch point are already ink in BOTH frames — so the instrument is a CHANGE at the corner, holding taking `r` from 5 to 7 so a square's halo sweeps (±8, ±8) where a diamond's stops at `|dx| + |dy| ≈ 9.8`. Four corners of four change; zero with `square` forced false. The a11y roster has been auditing `index.html` without `?shell=new` **since 1.8**, so it has been measuring the OLD shell all along; its drill selector follows the shell and both contour pages audit clean against a baseline that was already empty. Full gate green: **569 files / 6,044 tests**, lint, typecheck and build silent, browser suite **199/199** |

| 2026-09-16 | **1.11** | d45bc5b · (this commit) | **Undo and redo.** `shell2/undo.ts` owns the stacks and the rules; `commit` records the state it is about to overwrite and `record` decides whether that is an entry. A link clears both stacks; a camera move is never one; a gesture pushes once at the start of its run rather than per frame; an edit coalesces with the previous push when it has the same `changeKey` inside 800 ms, which is what makes **ten arrow nudges one entry**; a push clears redo and trims from the old end at 100. `"restore"` is its own commit reason — an `"edit"` there would push the state the reader has just stepped away from and the second Ctrl+Z would bring it back, and `"link"` would clear the stacks and leave redo with nothing to go forward to. **The camera is the READER's, not the entry's**: a camera move is not an entry, so an entry carries whatever the camera happened to be when it was pushed, and restoring that would teleport the view as a side effect of undoing an edit somewhere else. **Four findings.** (i) **The undo stacks come out of `resetTransient`** — they were on its list, which was right while `applyState` was its only caller and wrong the moment `restore` became the second: clearing them there wiped the redo stack the undo had just filled, so measured, redo after a drag returned the state it had just left. A link still clears them, through `undo.ts`'s own `"link"` rule, in the module that knows what a run and a coalescing window are. (ii) **`JSON.stringify` alone would have thrown out of `commit` on every tier-D record** — `Frac` carries bigints and `stringify` throws `TypeError` on one rather than skipping it, so the structural comparison carries a replacer and a test pins the throw so it cannot be removed as tidying. (iii) **`changeKey`'s sort is unobservable through a spread**, which reassigns fields in place, and bites only on a state built from scratch in its own field order — which is what a decoded link is, so ten nudges straddling a link would have been two entries for no visible reason. (iv) **While a path is open Ctrl+Z is the PEN's**: an undo that went to the app would put the path away (`restore` clears the transient half, M7.4's rule) and discard every vertex the reader had placed, to step back over an edit made before they started drawing — data loss under the key whose meaning is that nothing is lost. `CommitReason` moved to `undo.ts` with `app.ts` re-exporting it, after the second copy written to avoid a `no-circular` failure drifted within the hour. Verified in Chromium: Ctrl+Z inside the integrand box leaves the app's history alone and gets the browser's own undo — the stage mode stays put, the box steps back one typing run, `defaultPrevented` false. Sweeps: **12/12** on the module (by its author, two first-pass survivors both real) and **13/18 then 18/18** on the wiring — its five survivors were all real, among them a camera test whose first draft moved the view through `applyState`, which clears the stacks, so the surviving entry carried the same camera the app was already showing and the assertion compared a number with itself. Full gate green: **572 files / 6,133 tests**, lint, typecheck and build silent, browser suite **195/195**, axe clean |

| 2026-09-16 | **1.10** | 290cdda · (this commit) | **The hover readout** (`shell2/readout.ts`) — `z`, `f(z)`, `|f|`, `arg f` in degrees, the piece under the pointer, and under a declaration which determination the number was read in — and **the three-way link closed in all three directions**. The rail rows and the derivation lines have set `session.hover.piece` since step 1.4 and the stage READ it, so hovering a row lit the curve and hovering the curve lit nothing; `pieceAt` (nearest within tolerance, never first — near a join two pieces are inside any workable tolerance at once, measured 0.0943 against 0.3000 just off the indented semicircle's corner) answers WHICH, and the accumulator gains a `highlight` and a `stepNear` hit test that shares `walkOnScreen` with the drawing so the frame and the drawn slice cannot disagree. **The readout IS its refusals**: a compiled integrand throws, and `1/z` is `NaN` at the origin while `log z` is an infinity there — three different facts, three different words, because `fmtNum` prints a non-finite number as `String(v)` and `Infinity + NaNi` in the same column and face as `2.0000` reads as the app's ANSWER to a reader who does not yet know what a pole is. `|f|` and `arg f` carry the same word rather than a number derived from one just refused. The determination is read off the RESOLUTION and never off `state.declaration` (they come apart, and a state-keyed row would announce a determination the numbers were not computed in), which gets the sheet spinner for free. `drawnContour` is lifted into `shell/state.ts` on the second-consumer rule — it was written out in `stageView.ts` and again in `strip.ts` with a different signature, and this step would have been the third. **Three defects the browser pass found, none of them visible to any test that existed.** (i) The readout printed `piece the $R \to \infty$ semicircle` — piece names carry LaTeX, and `mathPlain` is the wrong tool by its own comment ("always a fallback rather than a display choice"); values go through `mathText` now, as the held-handle chip on the same overlay already did. (ii) **`repaint` drew both rails and the stage and never the STRIP** — the paragraph above it says "three-surface link" and then names two rails, so the accumulator's trail, the third surface, was never repainted on a hover: **0 pixels moved, 960 move now.** (iii) **`compile` handed the app an evaluator that THROWS.** `makeComplexFn` is lazy, so `1/(z-q)` parses, compiles, and throws `Unknown variable 'q'` on its first call — measured in Chromium, typing it threw an uncaught `ExprError` out of `resolveState` and left `∮ = 2πi`, the PREVIOUS integrand's answer, on screen beside the new expression. One probe at an ordinary point settles it and cannot reject a legitimate function, because those throws are structural while a merely undefined point returns `NaN` or an infinity. The old shell shows the same stale answer without the throw, so **the dishonest half is older than the rebuild**. Sweep **17/25 on the first pass**, and five of the eight survivors were real: a mid-gesture test that pressed without moving first, so `NO_HOVER` and "unchanged" were the same object and the guard it was aimed at was unobservable; nothing checking that the readout names the DRAWN contour's piece rather than the parked sandbox one (M6.1's trap, in a new place); nothing hovering a SECOND row, so a piece-index translation pinned to 0 passed; a `pieceAt` test that asserted a tie rather than a choice; and one mutant routed to a suite that could not see it. **22/25 after, three recorded equivalents** — two are the repaint-scope guards, which are cost and not behaviour, and the third is the probe point, which no expression can distinguish because `makeComplexFn`'s throws do not depend on where it is called. Full gate green: **571 files / 6,099 tests**, lint, typecheck and build silent, browser suite **195/195**, axe clean. Look: [`1.10-shell2-hover-1440x950.png`](screens/1.10-shell2-hover-1440x950.png) |

| 2026-09-16 | **1.9** | 0898cd0 · 4b677e2 · 482d824 | **CET-C6 lands** (`ui/stage/cetC6.ts`, CC-BY 4.0, cited) as a 256×1 `REPEAT`+`LINEAR` texture, replacing the interim OkLCh sweep whose own comment forbade calling it CET-C6 — measured, that sweep spaced hue uniformly in ANGLE where C6's Oklab hue-angle step runs 0.0048…0.0648 rad about a mean of 0.0245, so it was up to **2.6× too fast** in one part of the wheel. **The modulus band is SUBTRACTED from C6's own lightness rather than centred on it, and that is a gamut fact**: C6 rides the sRGB boundary, so `L + 0.06` at its own chroma puts **173 of 256** entries out of gamut with a worst overshoot of 0.209 of a channel, which the clamp would pay for by desaturating two thirds of the wheel; darkening costs at most 0.045, and nothing at `iso`'s or `quiet`'s reduced chroma. The obvious objection is measured too — C6 swings 0.267 in Oklab L over the wheel, 2.2× the band's whole 0.12, but SMOOTHLY, at most 0.00806 per entry against a sawtooth that resets by 0.12 in one pixel, so **the modulus signal is the 14.9× discontinuity and not the amplitude**. One `uMode` uniform, four portraits; **`quiet` is the default** (the plan delegated it — in all three app modes the subject is the contour and the verdict, and the full portrait is one click away). The textbook plate is `LIGHT_INK` in both app themes and composited `destination-over`, which is what lets it go UNDER a contour `drawContour` has already cleared the canvas to draw. `stageMode` rides the codec under `sm` through `put`, so quiet costs no bytes and an old link decodes to it; and M6.4's generated stage description is ported (`describeStage`), closing [`parity.md`](parity.md)'s last two gaps and gaining a clause the old shell could not have — **what the backdrop IS**, since the old keyboard preamble opened by claiming a phase portrait that the textbook plate does not draw. **Six findings.** (i) **The plan's own test for `iso` is false** — it asks for "more dark pixels than full" and iso has FEWER at every absolute threshold (3,328 below luma 60 against 7,875), because dropping chroma toward the neutral at the SAME Oklab L *raises* Rec. 709 luma: 92% of the frame goes up, burying a feature covering 6% of it. The claim is differential per pixel instead. (ii) The isoline ramp was measured from the MIDPOINT between lines, whose far edge only the exact multiple attains, so the lines carried a few per cent of their weight — 2,536 pixels below luma 60 against a black-multiply control's 17,384. (iii) **`declaredParity.browser.test.ts` went red looking like a shader defect and was a harness one**: its probe left its own RGBA32F render target bound to texture unit 0, harmless while the program sampled nothing and a *feedback loop* the moment `uRamp` read unit 0 — every pixel came back exactly black (measured), so both determinations agreed and twelve assertions about the DETERMINATION failed reporting "no ink". (iv) **The bar overflowed at 1024 px** and the numbers say so: the inelastic parts now total 1,086 (brand 146 + modes 223 + Sandbox 71 + stage modes 226 + tools 329 + gaps 64 + padding 27), so it spilled 62 px with the record button squeezed to nothing and the page grew a horizontal scrollbar — an ellipsis on the elastic child cannot rescue a line whose inelastic children already exceed it. The old refusal to wrap was never about the second line but about it being INVISIBLE under a fixed 3.25rem grid row; the row is `minmax(var(--bar2), auto)` now — 77 px below 1280, 52 at or above, and no scrollbar from 1024 to 1680. (v) A CPU-parity sample at `|f| = 1` straddles the band sawtooth's reset and the two backends land on opposite sides of it (every one of 24 samples off by ~0.15 in sRGB with the hue plainly right), so **no sample radius is a power of two** — the modulus analogue of "a grid never lands on a hair-thin isoline". (vi) `π` IS a multiple of 30°, so the table's seam is exactly where `iso` draws a line and a degenerate-range sample there measures the line rather than the wrap; the seam samples run in `full` and `quiet` only. **The first sweep was 15/30 and every survivor was a real hole** — a count of distinct colours is satisfied by any 85,000 colours at all, so replacing the table's LIGHTNESS, its CHROMA or its HUE with a constant, each of which throws CET-C6 away entirely, left every assertion green. `test/phaseColour.browser.test.ts` is the answer: `cutParity`'s discipline applied to the colour pipeline, a JS twin of the same steps compared per pixel (worst 1.6e-3 of 1). Two more survivors were tests passing for the wrong reason — the ⊗ glyph's centre is where the plate's two axes CROSS, and an off-screen axis is clipped away so only its LABEL makes the guard observable. **Final sweep 32/35, three recorded equivalents** — `gl-ramp-clamp` (measured: clamping instead of wrapping moves at most **1.50/255** in one channel, at exactly `arg f = ±π` and nowhere else, which is the table closing on itself), `desc-undecided-counts` (M6.4's own documented equivalent) and `bar-pressed-bool` (`dom.ts` already normalises `aria-*` booleans to `"true"`/`"false"`). Axe 0 rules in all four modes and at the wrapped 1024 width, by hand. Full gate green: **570 files / 6,061 tests**, lint, typecheck and build silent, browser suite **186/186** |

| 2026-09-16 | **1.8** | 52c4174 · 2b302f7 · 3cd424e · afa49c0 · fbe811a · 7a98e89 · c434fe4 · 602b102 | **`modal.ts`** extracted from `contrasts.ts` on the second-consumer rule, proved a no-op by `contrasts.test.ts` being UNCHANGED across the move; **the front door** (eight `frontRow` cards, eight taxonomy groups building lazily, arrows + Enter, thumbnails injected); **`thumbnails.ts`** (240x110 on the light ground, cache holding the PIXELS because the front row appears twice); and **the cold start on A6**, framed. Four agents in parallel on disjoint files; the review, the sweeps, the browser passes and the gate here. **The plan was wrong in four places and each was measured rather than argued.** (i) *"the app opens on A6"* would have shipped a BLANK BACKDROP: the new shell drew no portrait for any gallery record and had not since 1.3 — 1 distinct colour against the sandbox's 3,556 — and it survived five steps because step 1.7's own rung-iii test read the pixel's ALPHA, which a cleared, opaque canvas satisfies. (ii) The acceptance string *"Hypotheses verified."* exists NOWHERE in the app; A6 says **"The argument is complete."**, and `result.ts` records a decision against that word here. (iii) *"quiet stage"* is 1.9's `stageMode`, which does not exist. (iv) `defaultState` was the wrong lever — `coldStartState` layers on it instead, 121 failures in 16 files become **27 in 3**, and the plan's own next clause (`1/z` on the circle for Sandbox) comes out true for free. Also found: `drawContour` took a theme and read `DARK_INK.pieces` for the strokes (1.61:1 on the light ground against WCAG AA's 3:1; 5.11:1 now), three functions saying *sandbox* that meant *whatever boots*, and `toSandbox` never framing. Sweeps: 17/18 modal, 17/18 thumbnails, **13/14** for the step itself — its one survivor a mutant of bad construction (it prepends an unused constant and so changes no behaviour), and three of its four first-pass survivors were the same class of error, routed to a suite that could not see them. Axe 0 rules across the cold start, the front door, a group expanded and the sandbox — by hand, since the roster audits default states only. **Note for 1.12:** the roster audits `index.html` without `?shell=new`, so it still measures the OLD shell; when that is deleted its baseline is re-recorded against shell2. Full gate green: **569 files / 6047 tests**, lint, typecheck and build silent, browser suite **165/165** |

| 2026-09-16 | **1.7** | 5b10e44 | modes + the bar + the **permalink** + the contrasts modal + the drill as a rail card. `shellMode` derives the mode (drill wins, then `workedExample`, then Explore) and the codec carries `we`. The permalink DID NOT EXIST: `syncHash` is coalesced on a 250 ms timer and called from `commit` alone, so the scrub, the iso toggle and the contrast mode — the three the old shell forgot at three of its five call sites — are covered structurally; the boot link is read LAST and once, and one it cannot honour gets a `role="alert"` banner outside `<main>` rather than the notice region. `drillMask` was computed and read by NOTHING, so rung ii showed the full ledger and rung iii drew the answer; its three readers are wired (ink 6384 / 6384 / **344** / 7003, ledger rows 7 / 5 / 0 / 7). The drill had no DOOR — the bar refused with "Choose a drill task from the panel" about a panel nothing built. Four agents in parallel on disjoint files; the review, the sweep, the browser pass and the gate here. Gate: [`M8/parity.md`](parity.md) — 68 behaviours (35 + 19, plus the 14 of `pen.test.ts` that mount the app; its other 24 exercise the pure contour model and the codec and are untouched by the rebuild), with three gaps dated to 1.8 and 1.9. **Nine defects, none found by reading**: the pen's card dead in the live app (the controller's `redraw` reached the stage only), the unread mask, the missing door, a record offering a handle from the PARKED sandbox contour (an optional resolution three of four call sites omitted), the arrival banner outliving its own field, every left-rail card crushed by flex (22 px of 114), a `serious` axe finding the roster structurally cannot see (`overflow-x: auto` computes `overflow-y: auto`), and the browser harness leaking state through the address bar. Sweep **38/38, no equivalents** — ten survivors on the first pass, every one a real gap: the `workedExample` round trip through a real hash, a refused state overwriting a good link, the boot commit clobbering a refused one, the rails-follow-the-mode door, one write per settle, the chooser's dismissal, the masked rung's row count, the two-rail hover, and the parked handle's two halves (the controller's stops, and the DRAWN dot, which the node suite structurally cannot see — 142 lit pixels in Chromium where the record's contour is not). `write-before-ready` was DEAD CODE rather than a gap and was deleted: `syncHash` is the only way to `writeHash` and guards first, so the second test could never be false. A `clampView` that bounded the zoom and passed the CENTRE through landed with it (7/7 of its own) — one `deltaY: 100000` left the camera 1e64 from the origin at a half-height of 200, in the test called *a flick cannot lose the plane*, which asserted the half-height alone; `syncHash` then minted a permalink to that camera and the next mount in the same document opened it, which is how `test/shell2.test.ts` came to be red deterministically. Full gate green: **566 files / 6006 tests**, lint and typecheck silent, browser suite **162/162**, axe 0 rules and 0 nodes across all seven of the step's states |

| 2026-09-16 | **1.5b + 1.6** | 68ce2dc | the **Derivation** card (stages as `<details>`, the failing one open, lines typeset with their method / restriction / repair, provenance nested, the pole table in Residues only, `pieceId` hover-linked), the **Share** card, and the **accumulator strip** (`src/shell2/strip.ts` — cached accumulation, a scrub that maps to a STEP INDEX shared with the drawn head, compare toggles, a generated `role="img"` description) wired into `mountShell2`. Written by three agents in parallel on disjoint files; plumbing, review, sweep and gate here. Sweeps: 35/35 (derivation), 11/11 (strip), 10/10 (share), 8/9 mine with one recorded gap. Full gate green: 560 files / 5870 tests, lint and typecheck silent, browser suite 160/160, a11y no regressions |

| 2026-09-15 | **1.5a** | 3a6404d | `src/shell2/format.ts` (`fmtApprox` / `fmtNum` — the error estimate decides the digits AND what is shown at all) + the **Result** card: headline, the solved value and the exact `∮` each badged from their OWN evidence, the hypothesis table opening on failure, the Numerics disclosure opening when the approximate value IS the answer, and `session.open` as the tri-state that lets a click win. `ShellActions` gains `setOpen`. `test/format.test.ts` (9) + 7 card tests + 1 live; sweep **17/18 applicable, one recorded equivalent, one guard removed as dead**. Full gate green: 558 files / 5829 tests, lint and typecheck silent, browser suite 148/148, a11y no regressions |

| 2026-09-15 | **1.4b** | 159f985 | the last two left-rail cards: `cards/contour.ts` (template menu, pen, **Reverse orientation**, the piece list with colour / name / role / its own value) and `cards/cuts.ts` (the old `renderBranchCard` + `renderDeclaration` ported structurally and KEYED); `reverseContour` in `engine/contour/edit.ts`; the rail → stage half of the three-way highlight; `ShellActions` gains eleven members. `test/contourEdit.test.ts` (3) + 11 card tests + 2 live + 1 browser; sweep **22/23, one recorded equivalent**. Full gate green: 557 files / 5810 tests, lint and typecheck silent, browser suite 148/148, a11y no regressions |

| 2026-09-15 | **1.4a** | 207e197 | four of the six left-rail cards: `src/shell2/cards/` (`card.ts` the contract + `ShellActions`, `target.ts`, `integrand.ts`, `parameters.ts`, `singularities.ts`, `parseError.ts`); `render.ts` builds from a card registry; `paramChannel`/`withParam` lifted into `shell/state.ts` (the old shell's `channelOf` delegates); `fmt`/`fmtCx` → `kernel/decimal.ts` and `fixtureLabel` → `families/describe.ts` on the second-consumer rule; `Pole.residue` gains a `latex` twin. `test/cards.test.ts` (23) + `test/parseError.test.ts` (3) + 5 live tests; sweep **27/28, one recorded equivalent**. Full gate green: 556 files / 5789 tests, lint and typecheck silent, browser suite 147/147, a11y no regressions |

| 2026-09-15 | **1.3** | e9b52c9 | the stage controller: `stageView.ts` (three layers, poles moved onto the INK canvas, value-keyed program, a cleared portrait on a parse failure) + `stageController.ts` (pointer / wheel / keyboard / pen, one cursor convention, a `[0.05, 200]` zoom clamp, `fitContour` on double-click and a toolbar button); `render` gains plan §4.0's `actions`; `Session` gains `PenDraft`, `held` and `scrubbing`; `drawnCuts`/`sameBranchGrab` lifted into `engine/branchEdit.ts` so both shells share one implementation. 19 node + 7 browser tests; sweep **27/30, 2 recorded equivalents, 1 line deleted as dead**. Full gate green: 554 files / 5757 tests, lint and typecheck silent, browser suite 147/147, a11y no regressions |

| 2026-09-15 | **1.2** | 4fb54cb | the visual system: `theme.css` (tokens, five-size type scale, surfaces, controls, badges), `shell2.css` rewritten onto the tokens, `inkTheme.ts` (dark = the literals moved, light provided and not yet consumed); `drawContour`/`drawAccumulator` take a REQUIRED theme; 4 browser tests + sweep 8/8; screenshot committed |

| 2026-09-15 | **1.1** | 072f74b | the shell2 scaffold: the keyed builder (`dom.ts`), memoised KaTeX (`math.ts`), the `Session` (`session.ts`), `mountShell2` with one `commit` door, the grid, and `?shell=new`; `test/shell2.test.ts` (17) + `test/shell2.browser.test.ts` (3); sweeps 8/8, 5/5, 2/2 after four real survivors |

| 2026-09-15 | **0.7** | 45cb6d5 | Phase 0 gate: 553 files / 5721 tests green on a base merged to `origin/master`, browser suite 8/132, a11y roster no regressions; front row swapped to one-per-group (D6 for D4, the 0.6 open question); `pnpm a11y` and the app's browser suite both run with nothing set; Phase 0 PR opened |

| 2026-09-15 | **0.6** | 1732f42 | the four-line standard on all 28 records — human `title` + `titleLatex`, `description.{contour, point, citations}` over an eight-book enum, `taxonomySection` reduced to the eight groups, `frontRow` on the eight classics; `Golden.label` names each variant derivation; loader invariant 5 + corpus-level front-row uniqueness; `test/records.test.ts` (7 tests); GALLERY.md §0 |

| 2026-09-15 | **0.5b-iii** | 788e292 | the five rules through the rest of `kernel/*`, `engine/*` and `families/*`; **152 → 0 flagged, 0 unapplied**; `everySentence` made the one corpus walk; two new corpus checks (balanced `$`, KaTeX strict); 41 wording-pinned node tests + 2 browser tests updated; new `ledger-dump.txt` baseline |

| 2026-09-15 | **0.5b-ii** | 573fb8c | the five rules through `kernel/bounds/*`, the three theorem identities, `derivation.ts`'s solve stage and `solveTarget.ts`; `latex` on the solved value; 65 wording-pinned tests updated; 191 → 152 flagged |

## Findings (things learned while executing; each names its step)

- **(3.4) THE RUNG WHOSE QUESTION IS "WHICH CONTOUR?" WAS PRINTING THE ANSWER, IN FIVE PLACES.** The
  drill card's own sentence at rung iii is *"Only the integral is given"*, and what was given — read
  off a browser, not off the code — was the Target card's closed form (`= π/e`), the record's TITLE
  naming the lemma (*by Jordan's lemma*), its strategy line (*closed by $\Gamma_R$ in the half-plane
  $a\operatorname{Im} z \ge 0$*, which is the prediction's answer in words), the Contour card's piece
  list (*the $R \to \infty$ semicircle (upper when $a > 0$)*), the Singularities table's
  `Ind(γ, z₀)` column (1 beside the upper pole, 0 beside the lower), and the **accumulator drawing
  the record's own semicircle with `1.15565557035` under it — `π/e` to eleven figures**. All of it
  older than this step, and the step is what made it acute: a forced choice whose answer is three
  inches to the left is a reading exercise. `drillMask` gains four readers, and each takes the form
  the mask already had — the strip goes through the SAME path a refusal takes (`acc === null` clears
  the canvas and prints one sentence), because a mask that cleared it some other way would be the
  masking-by-omission `drillPanel.ts`'s own header warns about. **The whole app suite stayed green
  through the repair**, which is the finding under the finding: nothing asserted any of it, so the
  mask's four new readers arrived with their own assertions and the pairing that makes them claims —
  the same record outside the drill shows all of it back.

- **(3.4) The prediction's QUESTION is derived from the ledgers, not declared — and so is which
  question gets asked.** The plan named the two ("the half-plane one, except the indented task gets
  the enclosure one"), and declaring that would be a fifth thing to keep in step with the corpus.
  `predictionFor` runs both semicircles over the task's own integrand instead: if either closes with
  the target on it there is a half-plane to choose, and if neither does there is no side to ask
  about. Measured over the four tasks — `rational` answers in BOTH (π either way; nothing forces the
  side without a kernel), `oscillatory` upper only, `forced-downward` lower only, and `indented`
  neither, because its pole sits ON the real axis so both semicircles fail LEGALITY before any limit
  is taken. That last case is the routing, not a special case for it.

- **(3.4) And the REASON is the ledger's own row, except where there is no losing row to quote.**
  `oscillatory`'s reveal says *"the lower semicircle diverges for $a = 1$"* — the corpus's sentence,
  not a gloss written beside the control. Where both sides answer there is no failing row at all,
  and the honest reason is then the two VALUES, which is also the only form in which "either" is a
  claim rather than a shrug. The right option is named whether or not the reader had it, because an
  unnamed "right" is a mark and not a reason.

- **(3.4) `v1` IS read, and that is the exception its own rule permits rather than a lapse from it.**
  `drillProgress.ts` rule 1 says a schema change takes a new key rather than a migration, and its
  reason is the clause after the colon — *a half-read stale shape that silently un-fades a rung*.
  Reading `v1` cannot un-fade anything: the stage is exactly what `v1` carries, and the field it does
  not carry (`predicted`) defaults to "not answered", which is what a reader who has never seen the
  question already has. The half the rule does forbid is still not done — every write goes to `v2` —
  and `v1` is a FALLBACK rather than a merge: a readable `v2` wins outright, so an old value can
  never reach back into a reader who has started under the new shape. `predicted` is tri-state on the
  wire too (`predicted: "yes"` is not evidence either way), and first-answer-wins, because a store
  that flipped on a revisit would be recording the visit rather than the prediction.

- **(3.4) The chooser moved to the front door, and the card has ONE shape again.** It was a rail card
  that was sometimes a menu and sometimes a rung, sharing an id between two things, with a session
  flag whose only job was to say which — so every reader of the drill card had to know. The Practice
  tab puts it where the app's other *which one shall I open?* already lives, and a task now opens the
  way a record does. `session.drillPicker` is gone with it.

- **(3.4) The test that guarded `drillPicker` could not survive the move, and saying why is the
  point.** It drove "press Drill, then press Explore" to prove the chooser was put away. The dialog
  is MODAL and `inert`s the page behind it, so that sequence is one only a test can perform — a
  reader cannot reach the bar while the list is up. What replaces it is the two claims that are now
  load-bearing: the bar's Drill segment opens the door on the right TAB, and dismissing it leaves no
  flag set.

- **(3.4) Two verdicts on one card, and the selector could not tell them apart.** `drillPanel.test`'s
  `.verdict .tag` had been the menu's mark; the prediction's reveal is also a `.verdict` carrying a
  `.tag`, and it comes first — so the assertion went from `answers` to `right`, which is the
  prediction's word. Found by the assertion failing rather than by reading, and the repair is a
  selector that names which verdict it means.

- **(3.4) The accumulator's mask had to be asserted in `strip.test.ts`, not at the shell.** The strip
  draws on a COALESCED frame (`schedule`, not `drawNow`), so in jsdom it has drawn nothing at all by
  the time a shell test reads it — and an assertion that passes because a canvas is empty for an
  unrelated reason is exactly the vacuity these files forbid. The shell test says so where the
  assertion would have gone.

- **(3.4) The sweep's one survivor is M6.4's equivalent again, in a new reader.** Dropping the
  `decided` guard from `predictionFor`'s enclosure count changes nothing, because every
  `decided: false` return in `kernel/winding.ts` carries `n: 0` — checked, all four of them, rather
  than taken from the note that recorded it the first time. The guard stays for the reason M6.4 kept
  its own: a question put to a reader should not rest on an invariant established in another module,
  and a synthetic `{ decided: false, n: 1 }` would be a run the engine cannot produce. **20/21.**

- **(3.3) THE MAGNIFICATION WAS OFF BY `s²`, AND THE TYPE SYSTEM COULD NOT SAY SO.**
  `kernel/camera.ts`'s `scale(view, vp)` is plot units per PIXEL; `stepDetail` takes pixels per
  UNIT. They are reciprocals, both are a bare `number`, and the first draft passed one straight into
  the other — so the arrows came out `60/s²` instead of 60 px, which on A6 at `halfHeight ≈ 6` is
  tens of thousands of pixels. The stage drew the term's arrow clipped to the canvas edge and it
  read as **a bright bar lying along the real axis**, i.e. as part of the contour. Nothing in the
  node suite could see it: the engine's contract is pixels-per-unit and its own tests honour it;
  only the caller was wrong, and the caller's output is pixels.

- **(3.3) THE PICTURE'S ONE CLAIM IS THE RATIO, AND THE PICTURE KEPT DESTROYING IT.** `Δz` and
  `f(z)·Δz` live in different planes — one is a displacement in the contour's plane, the other is a
  value — so drawing both from `z_k` is a category error taken on purpose, and what is true in it is
  not either length but the ratio (`|f|`) and the angle (`arg f`) between them. Three separate
  defects all came from that, each found by looking at a frame and none reachable from a test that
  had not been written yet. **(i)** With equal strokes and `|f| = 0.9956` — A6's real axis near the
  pole — the term's arrow, drawn second, hid the step's completely: 980 term-coloured pixels and
  **0** of `Δz`'s. Stacking them the other way only mirrors it, and nudging one aside would misstate
  the very angle the arc exists to show; a wider stroke UNDER a narrower one leaves the step as a
  fringe, which says what is true. **(ii)** Widening alone changed nothing, because each arrow drew
  its own halo immediately under its own ink, so the term's 5 px of near-black painted over the
  step's 4.5 px of teal — the fringe erased by the thing it was fringing. Both haloes before either
  ink. **(iii)** The angle arc was the term's hue at 55 % alpha with nothing under it, and on the
  sandbox's circle at `arg f = −44°` the portrait behind it is green: 12 pixels painted, and
  invisible. It is opaque over a halo now, like every other stroke on that canvas — and it was also
  drawn BEFORE the arrows, so their haloes had been covering most of it (25 px expected, 5
  measured).

- **(3.3) THE GALLERY IS A GALLERY OF DAMPING TERMS, WHICH INVERTED THE CONSTANT IT WAS WRITTEN
  FOR.** `MIN_ARROW_PX` drops the shorter arrow, and its first doc said the case was an amplifying
  term near a pole leaving `Δz` too short to see. Measured over 6,717 finite steps in 28 records:
  `|f| < 1` on **6,136 of them (91.4 %)** and the largest anywhere is 287 — so it is nearly always
  the TERM's arrow that goes. That is not an awkward case, it is the argument: a vanishing-arc
  record has `|f| ≪ 1` on the arc BY CONSTRUCTION, because that is what makes the arc vanish.
  `semicircle-order2` runs `|f| ≈ 1/R⁴` out there and drops the term's arrow on 191 of its 240
  steps, which is the KILL lemma drawn. **The floor's exact value is not load-bearing and the
  measurement says so**, which is worth writing down because a bare `2` reads as tuned: 32.6 % of
  steps lose an arrow at 1 px, 37.9 % at 2, 41.0 % at 3, 44.2 % at 4, 51.6 % at 6 — a 6× change in
  the floor moves it by a fifth, because the distribution is dominated by terms orders of magnitude
  below any of them. The panel now SAYS which arrow is missing and why; one arrow with four numbers
  beside it and no sentence reads as broken rather than as the lemma.

- **(3.3) The plan put the magnification in the readout, and the readout is pointer-only.** *"stated
  in the readout (arrows ×12)"* — but `shell/readout.ts` renders nothing when the pointer is off the
  stage (step 1.10: `if (z === null) return []`), so a picture drawn whether or not anyone is
  hovering would have carried an unstated scale factor for most of the time it was on screen. It is
  drawn beside the arrows instead, which also puts it on the export plate — and the plate carries the
  arrows, so a figure showing two vectors at an undisclosed relative-to-nothing scale is exactly what
  the honest-labelling guardrail is about one level below numbers.

- **(3.3) The label was placed along the shaft, and `labelAnchor` had already learned not to.** It
  stepped 16 px further along the longer arrow's own direction with `textAlign: center`, and on A6 —
  where `arg f = 0`, so both arrows lie along the real axis — the box's 90 px of dark halo covered
  the arrow's whole head and the contour beneath it. Perpendicular, on the side away from the other
  arrow, which is the rule the cut labels already use for the same reason.

- **(3.3) The arrows are on the export plate although step 3.1c's callouts are not, and the
  difference is the CODEC.** A callout is keyed to `session.step`, which a permalink does not carry,
  so a plate showing one is a picture its own link cannot reopen. The scrub position and this toggle
  are both STATE and both in the codec, so these arrows are reproducible from the link the figure is
  stamped with. The rule is *nothing a link cannot restore*, not *nothing but the contour*.

- **(3.3) Both arrow colours were changed after measuring a real frame.** The first draft took a
  grey for `Δz` and the gold `#ffd166` for the term. Counted over A6's ink layer with the detail off
  — 11,885 painted pixels — the grey matched **75** of them (handle rings and pole glyphs
  antialiasing against the dark paper), so neither a test nor a reader could have had a clean
  answer; and the gold is 29 away from `refusedInk` in the widest channel, which on a refused
  contour is two ambers on one canvas. Teal and lime match **0** on that same frame and sit 64 and
  62 from the nearest colour in either theme. This is the one way `inkTheme.ts`'s own rule — a
  colour must say one thing — can actually be checked.

- **(3.3) The drill takes Explore's default, not Worked example's.** A rung IS a worked example
  faded, so `workedExample` is true there; but two arrows naming the very term a rung may be asking
  about is the app answering its own question, so `showStepDetail` reads the MODE (`shellMode`)
  rather than the flag. A reader who wants them can still turn them on; what they cannot get is them
  arriving unasked.

- **(3.3, the instrument again) A KaTeX panel read through `allTextContents()` gives numbers that
  are coincidences.** A typeset formula renders its glyphs, its MathML annotation AND its LaTeX
  source into the same subtree, so a flattened read interleaves all three — and the first browser
  pass concluded from one that the four numbers never changed with the scrub. They always had:
  read through `[data-testid=…] .num`, and against the same states in jsdom, the panel tracks the
  step exactly. M6.4 recorded twice that the accessibility tree is the instrument and not the DOM;
  this is the same lesson for a rendered formula.

- **(3.3) The sweep's first pass was 19 of 28, and eight of the nine survivors were one gap: the
  SHELL's own wiring had no test.** `stepDetail.test.ts` covers the arithmetic, `stepArrowInk` the
  drawing primitive on a bare canvas, `stepPanel` the panel in jsdom — and between them sat
  `stageView` (does the toggle reach the stage? is the camera converted the right way up?), the
  strip's `step:` argument and the codec's two ends, none of them reachable from any of the three.
  `stepShellInk.browser.test.ts` mounts the real shell and counts pixels, which is the step's own
  gate clause taken literally. Two of the four I closed by hand were worth the trip: the finite
  check refuses a non-finite `z` ALONE, and every other non-finite value is caught three lines
  further down by `amplitwistScale`, so the mutant survived until a hand-built step named the one
  case the check owns; and the codec's `false` cannot be tested by round-tripping the decoded
  state, because a codec that dropped the field decodes to `null`, which in Explore resolves to
  off — the wire has to be read.

- **(3.2) The checkpoint table could never gain a single row, and four test files were green over
  it.** `advanceSweep(driver.advance(t))` evaluates the driver's call FIRST, so by the time
  `advanceSweep` took its "how many checkpoints had we passed" snapshot from `driver.passed()`, the
  crossing was already in it — `passed.length <= before` was true on every tick, under Play and
  Step alike, on every record. The settle's limit row was gated on `rows.length === 5` and so never
  fired either, and `sweepTable` renders only when `rows.length > 0`, so the step's headline
  feature was **the control doing nothing visible at all**. `scrub.test.ts` pins the element,
  `sweep.test.ts` the driver's arithmetic and `limitSweep.test.ts` the card's rendering with rows
  INJECTED by hand: the defect lived in the seam none of the three looks at, and it took pressing
  the button in a browser to see it. `test/sweepApp.test.ts` is that seam's first test — it mounts
  the real shell and presses the real action — and the row count is now kept against the ROWS
  rather than against the driver, which also pins each row to its own rung instead of to the newest.

- **(3.2) `Step` planned a new ladder on every press, so it converged on the limit without ever
  reaching it.** The reuse guard was `sweepFrame !== 0`, which a stepped run never sets — so each
  press built a fresh `planSweep` from the value the previous press had moved to. From tier G's
  `N = 4` that gives 9, 18, 30, 49, … , a geometric walk whose rungs are not the plan's, with
  `rows` emptied each time so the table could hold exactly one. `planSweep`'s own doc says a
  shorter ladder would make the two controls report DIFFERENT tables; this was the code making
  them do it. A run is resumed now whenever the ask names the same step and parameter and the
  driver has rungs left. It also set `running: true` for a stepped run, so the Play button read
  `Stop` while nothing was running.

- **(3.2) THE WALL ABOVE TIER G'S `N` IS COST, NOT LEGALITY, AND IT IS NOT LINEAR.** `analyse.ts`
  refuses a kernel band wider than `MAX_KERNEL_BAND` (4096), so the first draft capped the sweep
  there — and the gate HUNG, a worker at 99% for 37 minutes with `halfIntegerParam.test.ts`
  running the real ledger at the top of its own ladder. Measured on `series-cot-kernel`: a resolve
  is 50 ms at `N = 128`, 179 ms at 256, 342 ms at 320, 700 ms at 384, **2.2 s at 512 and 25.6 s at
  1024**, doubling about every 64 past 256 — the exact residue sum's arithmetic growing with the
  number of poles AND with their digits. The draft budget does not touch it (25.5 s against 25.8 s
  at 1024), so it is the exact half rather than the quadrature. A ladder ending at 4095 is the
  better part of an hour in ONE commit. The range is 256, where the worst of the three records is
  still under 200 ms; and the test asserts both the number and the TIME, because a change that
  keeps the cap and moves the arithmetic is the same defect. **This was never only the sweep's
  problem**: the rail's slider has been able to drag `N` to 1e6 since the record landed, and
  nothing had ever dragged it there.

- **(3.2) A frame that crosses a rung commits the RUNG, and that turned out to be a contract rather
  than a nicety.** The row is labelled with the checkpoint and its three numbers are read off the
  resolution the commit produced, so committing the eased value 4.07 and labelling the row `4`
  prints one value's evidence under another's name. Clamping to the rung also makes at most ONE
  checkpoint pass per frame, which is what lets the caller append rows in step with `passed()`
  instead of guessing how many it missed — and it forced the driver to answer the case where the
  clock is spent but the ladder is not (a backgrounded tab, a slow commit): the remaining rungs are
  walked one call each rather than filled from the endpoint's numbers, so the sweep runs a little
  past `durationMs`, which is the honest direction.

- **(3.2) A row is taken at the FULL budget, mid-animation included — otherwise the table is a
  picture of a table.** A sweep's frames commit at the draft budget on purpose, sixty a second, but
  a row is a rung's EVIDENCE and the draft budget is exactly what cuts the quadrature the two `≈`
  columns come from. Measured on A6 under Play: every one of the five rows read `—` in the target
  column, where the same rungs under `Step` read 2.22144. Five extra resolves over a three-second
  sweep, at the five moments the reader is being asked to look at a number. `Step` is a full-budget
  commit for the same reason — it is a deliberate jump, not a frame, and `setParam`'s own
  `why: "gesture"` had been making it a draft one.

- **(3.2) The table printed a target of `1.4e-7` for a number that is 2.22144, and the fix was the
  quadrature's own verdict rather than a rule of the table's.** Far out along the ladder a uniform
  rule over a segment of length `2R` stops resolving the integrand: A6's target reads 2.0766 at
  `R = 1e6` at the full budget, and collapses three rungs earlier at the draft one. `integratePiece`
  already decides this — `errorEstimate` against `1e-10·max(1,|value|)`, plus `capped`, which says
  the budget bound the resolution so the spacing rule was never met — so the threshold moved into
  `converged()` on the second-consumer rule and the table withholds exactly the cells the engine
  declines to certify. A6's target column now reads 2.22144, 2.22144, —, —, — beside a bound column
  falling 2.8e-5 → 3.1e-18, which is the honest-labelling guardrail applied to a number nobody had
  thought of as a claim.

- **(3.2) The table vanished at the moment it was complete.** `limitPlay` returned `[]` when
  `planSweep` was null, and a finished sweep leaves the parameter ON its endpoint, where there is
  nothing left to plan — so four presses of `Step` filled four rows with the `≤` column falling
  2.6e-5 → 5.3e-15 and the fifth took the whole table off the screen. The buttons still come and go
  with the plan (a control that cannot act teaches a reader the app is broken, step 1.4's lesson);
  the evidence stays.

- **(3.2) One arrow press scrubbed the number AND advanced the stepper, and the second press had
  nowhere to land.** The scrub is a `role="slider"` span inside the Derivation card's `.stepper`,
  whose own `keydown` moves the argument on ← / →. Without `stopPropagation` both fired, `repaint`
  replaced the step body, the focused node was destroyed and focus fell to `<body>` — so a keyboard
  reader could not press the key twice. `onStepKey`'s own doc had named this span as the case a tag
  test would miss and concluded "the guard arrives with its consumer"; the consumer arrived and the
  guard did not. Two more from the same read: ARIA's slider pattern wants Up/Down as well as
  Left/Right, and there was no `aria-valuetext`, so with `digits` set the element showed `0.333`
  while announcing `0.3333333333333333`.

- **(3.2) A sweep outlived everything, and one path leaked a loop plus a permanent draft budget.**
  `resetTransient` nulls `session.sweep`, so `advanceSweep` returned at its own guard — but the rAF
  loop re-schedules itself from a closure the session cannot see, and `session.scrubbing` stayed
  `true`, pinning every number in the app at the draft budget for the rest of the session with
  nothing on screen to say why. Press Play, then Ctrl+Z or open a `#vs=` link. Without a
  `resetTransient` in the path it is worse in a different way: `setStep`, `setFixture`, `setMode`
  and `toSandbox` are ordinary commits, so a run started on one record went on calling `setParam`
  against the next one's contour for its remaining three seconds. `endSweep()` is the one place
  that ends a run completely, and the decision to call it is taken in `commit` from the STATE —
  record, fixture, mode or expression — rather than in each of five actions, because a sixth would
  have to remember.

- **(3.2) Dragging the number did not interrupt the sweep, and releasing it took the sweep off the
  draft budget.** The plan's sentence is *the sweep is a scrub, so dragging the number interrupts
  it*, and `sweep.ts`'s own header asserted it; nothing implemented it. Both writers committed on
  every frame so the value visibly fought the drag, and `pointerup` cleared `scrubbing` mid-run so
  the rest of the sweep ran at the full budget. It is `setScrubbing`'s job now, which is one place
  and covers the stage's handles too.

- **(3.2) `certificateClaimAt` planted a scrub inside *Re z*, on 18 rows, and only ever on the
  right-hand side.** The locator required the value to sit in an `at $… = ‹value›$` group; E3's
  vertical side prints `at $\operatorname{Re} z = 6$` and its abscissa IS `R`, so the match
  succeeded — while the mirror side prints `= -6$` and fell through, which is precisely the
  asymmetry `ledger.ts` says must not happen. Both the function's doc and
  `arcBoundEvaluated.test.ts` listed `gaussianSide` among the four producers that never split, and
  both were false; the `split >= 27` floor could not see it, and had in fact been RAISED by it. The
  `=`'s left-hand side must now be the parameter's own symbol, the floor is 26, and the test asserts
  the reason rather than the count.

- **(3.2) `limitPlay` guarded an `"all"` case that cannot occur.** It is reached from `openBlock`
  alone, which the card calls only while it is STEPPING, and `stepIndex` returns null for `"all"` —
  so the branch was dead and implied a control rendering with no piece. Removed rather than
  recorded, the sweep's own rule.

- **(3.2, older than this step — 3.1b) A screen reader heard the step's LaTeX source.** The
  stepper's dots carry `aria-label` and the open step an `srOnly` span, both built from
  `step.title` raw — and two steps of every record with a limit are titled *Let $R \to \infty$* and
  *Boundary terms · the $R \to \infty$ semicircle*. `mathPlain` is the app's own convention for the
  places a typeset fragment cannot go; it was simply not applied here. Found by reading the
  accessible name in a browser, which is the instrument M6.4 recorded twice.

- **(3.2) `dc-worst-min` is unkillable on tier G, and the reason is worth keeping.** The card picks
  the piece the limit has to kill as the one with the LARGEST certified bound. Tier G declares four
  — the square's four sides — and measured across all three records × every fixture × `N` at 3, 9
  and 21, **all four certify the same number to the last bit** (1.5659 on `series-cot-kernel`), so
  `>` and `<` name the same piece. The corpus's two records where they differ are E1
  (`strip-exponential-quasiperiod`, right 3.892e-1 against left 1.928e+0) and D6
  (`dogbone-two-fractional-powers`), and E1 is the one where the largest is also the SECOND in
  argument order, so a "take the first" reducer falls there too.

- **(3.2) Two mutants are equivalent, and one was REMOVED rather than recorded.** The equivalents:
  indexing the new row by `passed()[passed.length - 1]` instead of by `passed()[rows.length]` cannot
  differ, because the rung clamp guarantees at most one checkpoint passes per call — the clamp is
  what makes the simpler indexing safe, so the guard is kept for the invariant rather than for a
  case; and the `$`-between-opener-and-match half of `certificateClaimAt`'s guard is subsumed by the
  symbol half, since `trim` removes whitespace only and no `paramSymbol` output contains a `$`
  (brute-forced over 111,110 generated sentences from an atom grammar aimed at exactly that case,
  zero disagreements). The guard predates the symbol clause and is about the group's shape, so it
  stays. **The removed one is the interesting one**: `advanceSweep` committed a STEP at the full
  budget and a frame at the draft one, on the reasoning that a step is a deliberate jump. The sweep
  could not kill the difference, and the reason is that the row re-resolves at the full budget
  whenever a checkpoint passes — which under `stepOnce` is every press. So the conditional bought
  nothing and cost a resolve, 179 ms of one near the top of tier G's ladder. The rule is simpler
  than the first draft's: **the parameter moves at the draft budget, the ROW is taken at the full
  one**, for both controls.

- **(3.2) The sweep's first mutation pass was 14 of 34, and every survivor was the same gap: the
  fixes had no tests.** Twelve defects were found by pressing the control in a browser and by a
  read of the diff, and each fix went in with the measurement in its comment and nothing asserting
  it. The survivors clustered in three places — the seam between the driver and the app (ten of
  them), the accessible names (four), and the two convergence clauses — which is the same shape as
  the headline defect: `scrub.test.ts` tests the element, `sweep.test.ts` the arithmetic,
  `limitSweep.test.ts` the card with rows injected by hand, and NOTHING tested what happens when
  the control is pressed. `test/sweepApp.test.ts` now mounts the real shell over a **stubbed
  `requestAnimationFrame` and clock**, so the animated path is assertable at all — and the first
  draft of that harness measured a working sweep as a dead one, because it flushed ONE queued
  callback per tick while the shell schedules its own draw and its strip redraw through the same
  rAF, so most ticks went to those. A frame drains the queue as it stood; that is what a frame is.
  For the same reason the leak assertions are by EFFECT — twenty more frames at a moving clock must
  change no number — rather than by counting callbacks, which says nothing about whose callbacks
  they are.

- **(3.1c) A step can be about TWO pieces, and `StepFocus` can only say one.** `buildSteps` fills
  the target step's focus with `[...targetIds][0]`; C1 and C3 split the real axis at the
  indentation and BOTH halves are the target, so emphasising `left` and dimming `right` says the
  argument is about half of its own target — on C1, which is one of the plan's own five gate
  records. The stage's emphasis set is therefore `focus.pieceId` together with every piece the
  step's own LINES name, read from the data rather than re-derived from the roles. Measured over
  237 steps in 28 records, that widens **exactly 2** — and both are that one shape, so the rule is
  a strict widening where it is needed and a no-op everywhere else.
- **(3.1c) `StepFocus.poleIndex`'s own doc was false, and no test could go red on it.** It said
  *an index into the step's own `poles`, which is also an index into `Derivation`'s pole rows*; the
  first residue step carries `[its row, ...the unenclosed ones]` and every later one carries a
  single row, so A6's second residue step has `poleIndex: 3` over a `poles` array of length 1.
  `test/steps.test.ts` had always resolved it against the derivation's rows — the right thing — so
  the sentence sat beside working code until a second reader came to implement from it.
- **(3.1c) A limit parameter need not have anything on the plane.** `handlesOf` makes a handle for a
  parameter-bound ARC radius and for nothing else, so E1/E2/E3's `R` (a rectangle's width) and
  G1/G2/G3's `N` (a square's half-width) have none — **6 limit steps** with nothing to pulse. The
  plan's *"the focused parameter's handle pulsing once"* assumes one exists. There is no chip there,
  rather than a chip at an invented place.
- **(3.1c) Three boundary steps carry no bound, because their piece reproduces the target.** *The
  lower edge of the cut: a constant multiple of the target* (D1, D3, D6) is a sentence with no
  formula in it. 54 of the corpus's 57 boundary steps get a callout and those three get none:
  there is no number to show, and a chip would have to invent one.
- **(3.1c) The callout is the first `$…$` of the claim, and that fragment is the right one in every
  case.** The KILL line is a paragraph — *"the arc: ⟨bound⟩ at R = 4, and → 0 as R → ∞, since
  deg Q − deg P = 4 ≥ 2 makes the bound O(R⁻³)"* — and the plan's example chip is its first formula
  alone. Swept: a vanishing piece gives its bound, a reproducing piece its relation (`$\arg z =
  2\pi^-$`, `$\log z = \log x + 2\pi i$`), an indentation its known limit
  (`$i\alpha\operatorname{Res} = \pi(-i)$`).
- **(3.1c) `setStep` redrew the chrome and not the stage, which this step turned into a defect.**
  Until the step had a consequence outside the card, `render2()` was the whole job; with the stage
  reading the step, a `render2` alone left the emphasis, the ring and the callout showing the
  PREVIOUS step — the card saying one thing and the picture beside it another, which is the one
  failure a stepper linked to a stage must not have. **No node test could see it**: jsdom has no
  canvas, and the jsdom stage test calls `drawNow` itself rather than going through an action. The
  browser suite found it on its first run.
- **(3.1c) Dimming the strokes and leaving the halos is worse than not dimming at all.** Each piece
  is drawn as a 6.5 px dark halo under a 2.5 px coloured stroke; fading only the stroke leaves a
  dark cord with a faint colour down the middle, MORE conspicuous than the piece was. Measured on
  A6 at the cold-start camera: the ink layer's total alpha falls **0.17%** with the halos left
  alone and **20.4%** with them dimmed too (2,028,695 → 1,615,064). It is not the 72% the alpha
  removes from a dimmed piece, and should not be — the focused piece is thickened from 2.5 px to 4,
  and the poles, handles, cuts and marker are not pieces of the contour.
- **(3.1c) A parameter's id is an identifier and its symbol is a letter.** The limit step printed
  `$eps \to 0^+$` — which KaTeX sets as the product *e·p·s* — and headed its card `Let eps→0+`,
  beside a piece the record itself calls *the ε→0 circle* and beside a bound that already writes
  `\varepsilon`. `R_lim` is the same defect the other way: it subscripts the `l` alone. Measured:
  the corpus's twenty parameter names include six that carry a limit, of which **four** typeset
  wrongly. `vocabulary.ts` gains `paramSymbol`, and `R_lim` maps to `R` because B1's own KILL line
  already states its bound *at $R = 4$* — two names for one quantity, side by side, is what the map
  removes. Anything multi-character and unmapped is set upright, which is the general form of the
  same defect (`wedgeAngle` is a name, not nine factors).
- **(3.1c) The callouts were computed with a position and rendered without one.** Every chip would
  have stacked at the overlay's top-left corner — "positioned from the camera" not happening, with
  the right text. The jsdom test that asserts the `style` attribute found it on its first run;
  nothing that only read the text could have.
- **(3.1c) A figure must not carry the reader's step.** `figureBytes` draws through the same path
  with the live session, and the permalink stamped into that same PNG does NOT carry the step —
  which is 3.1b's own decision, that where a reader is in an argument is theirs. A plate dimmed to
  one step would be a picture the link beside it cannot reopen, which is M6.3's verdict-drift in
  another register. The focus is suppressed for every plate.
- **(3.1c) The app's first motion is what finally gives `prefers-reduced-motion` something to act
  on.** M6.4 measured zero `transition`, `animation` and `@keyframes` rules and recorded that
  research 07 rule 7 was satisfied VACUOUSLY. The limit chip's pulse is the first, and it is an
  **animation rather than the plan's "300 ms CSS transition"**, because a transition fires on a
  property CHANGE and this node is created already in its final state — there is nothing to
  transition from. The keyed builder is what makes *once* true: a chip that stays put keeps its
  node, so the pulse runs when the step changes and not on every pointer move over the stage.
- **(3.1c) TWO MUTANTS WERE REMOVED RATHER THAN RECORDED EQUIVALENT, and both were the same
  mistake: a rule spelled twice.** `stageFocus` asked `pieces.some(p => p.id === id)` before adding
  an id AND then dropped an unknown id through `findIndex(...) >= 0`; `focusOf` returned early for
  `session.step === "all"` AND then returned `NO_FOCUS` for the undefined step `stepIndex` hands
  back for `"all"`. Neither mutant could die, because in each case the second reader was doing the
  first one's job. The membership test that survives is the one that produces the INDEX, and the
  clamp is the one place a step index is read — which is the reason `stepIndex` exists.
- **(3.1c) The other two survivors were real, and each bought a test.** Nothing asserted that a
  boundary step emphasises its piece when no claim was made about it — unreachable from the corpus
  (all 57 have their line) and not cosmetic, since the step's heading NAMES the piece, so a stage
  that dimmed it would contradict the card beside it. And nothing read the POLE pixels at all, so
  ringing every singularity at every residue step passed everything; the test that kills it asks
  where the ink moved, because A6's residue step focuses no piece and the ring is therefore the
  whole difference from `All` — one ring is a box under 80 device pixels, four are the square the
  poles sit on.
- **(3.1c) One recorded equivalent, and it is equivalent because of a literal in another module.**
  Re-aimed at the clamp, `d.session.step === "all" ? 0 : stepIndex(...)` changes nothing a test can
  see — `steps[0]` is always the PROBLEM step and `buildSteps` gives it `focus: {}` unconditionally,
  so focusing it and focusing nothing draw the same picture. The rule itself is tested directly
  (`stepIndex(steps, "all")` is `null`) and the card reads it too; what is unobservable is this one
  consumer's view of it. Kept, for M6.4's reason: a focus should not depend on an invariant
  established somewhere else.
- **(3.1c, NOT FIXED — for the owner) `4.928e-2` inside `$…$` typesets as *4.928e − 2*.** Fifteen
  bound producers in `kernel/bounds/` write `toExponential(3)` straight into LaTeX math mode, where
  `e` is a letter and `-2` is a subtraction: a reader sees Euler's number minus two. It predates
  M8 — the Derivation card has printed it this way since 1.5b — and 3.1c only moved it onto the
  picture, at the one place a reader is looking. It is left alone deliberately: the repair belongs
  to every bound claim in the app (a LaTeX-safe `4.928 \times 10^{-2}`), not to the callout, and
  fixing it at the chip alone would make the chip and the card print one number two ways.

- **(3.1b) A control with no caller is not a feature, and the state it reaches is not a state.**
  `setRail` was typed, implemented, exercised by a permalink and pressable from nowhere — so the
  folded rail it produced had never been looked at, and it was drawing every card into 38 px. The
  step that made it reachable is the step that had to fix it: shipping a mode whose default layout
  is unreachable and wrong is worse than not folding at all.
- **(3.1b) A card that counts two different things must not call them both by one word.** `10
  steps` over `4 / 8` was not wrong in either place and was unreadable in both.
- **(3.1a) The plan's step 3.1 is three separable pieces and is split.** `engine/steps.ts` is pure
  and testable against the whole corpus with no DOM at all; the card's stepper is DOM and session
  state; the stage's focus and callouts are ink and overlay. Doing them in one session would mean
  one push covering three subjects, against the working agreement above.
- **(3.1a) A regrouping's invariant is IDENTITY, not equality.** *Every derivation line appears in
  exactly one step* is worth asserting only if a step must carry the very object `buildDerivation`
  produced; deep equality would pass a step that rebuilt a line with a different level, which is
  precisely the failure a module sitting between the ledger and the screen could introduce.
- **(2.6) A table test over a mapping says nothing about who CALLS it.** `test/errors.test.ts`
  drives every sentence `shell/errors.ts` can produce and passed perfectly while three surfaces
  printed the parser's own words instead. The guard that catches that class is the screen sweep —
  mount the app in the state, read what is on it, and require the raw message to be absent — and it
  generalises to a reader added next year, which a fourth table row would not.
- **(2.6) A phase gate is where the phase's own claim gets tested, and the screenshots are the
  instrument.** Two of the three defects above were visible in one PNG of an empty integrand box:
  the invitation in the left rail and the parser's message in the right, in the same frame. Nothing
  in the node gate could see it, and no test was going to be written for a surface nobody had
  thought about.
- **(2.5) A design document that specifies something unbuilt should say so where it specifies it.**
  DESIGN §7's worker protocol, §8's coordinate quantisation and §8's branch-convention diff are each
  a decision the milestones reversed with a reason, and the reason is only findable in a STATUS row
  five documents away. Each now carries an *as built* note at the point of specification, saying
  what is there and why the specified thing is not. Deleting the specification instead would lose
  the reasoning; leaving it alone sends a reader looking for a `worker/` directory.
- **(2.5) The four ledger ids cannot be swept out of these documents, and should not be.** They are
  the `ConstraintId` union, and the engine half of every one of these files is about them. What the
  gate actually asks is that no document show them as what a READER sees — so the convention is
  declared once per document and the two on-screen samples are re-set in the display labels, read
  off `vocabulary.ts` rather than transcribed.
- **(2.4) A refusal names a field of the wire format, and a reader cannot act on a field.** Forty-odd
  codec reasons say the same thing to a reader — *part of this link is not what it should be* — and
  eight do not. `shell/errors.ts` keeps those eight and gives the rest one honest fallback; the
  codec's own `reason` is untouched, so the wire-format tests and anybody debugging a link still have
  it. The test reads every reason out of `viewState.ts`'s AST rather than transcribing them, which is
  what makes the table complete: several are unreachable except through a hand-built wire object.
- **(2.4) `test/errors.test.ts` asserts the SPLIT, not the sentences.** Every rule has to be reached
  by a reason the codec really writes — a rule matching nothing is a sentence a reader can never see
  — and the fallback has to be reached by something, or it is dead. Both directions, plus a check
  that the identifier regex itself still fires on each kind of token, since without that the
  no-code-identifiers assertion is satisfied by a broken instrument.
- **(1.13) The suite nav is 1,557 px wide and scrolls inside itself at EVERY width measured**,
  1440 included: `.cas-nav` computes `overflow-x: auto`, so the eleven app links are clipped and the
  last of them — the app the reader is in — is off screen at 1280. It is `@cas/ui`'s `mountNavHeader`
  + `nav.css`, shared by eleven apps and older than M8, and the page itself never scrolls, so this is
  recorded rather than fixed at a gate whose subject is one app's shell.
- **(1.12) The `shell2` and `card2` CSS class names are deliberately NOT renamed** — recorded as a
  deferral so it is not mistaken for an oversight. The directory moved because the imports had to be
  correct on the far side of the cutover; a class name is read by the stylesheet and by test
  selectors alone, so renaming it now is churn across two sheets and every browser spec, in the one
  step whose whole subject is that nothing was lost. The `2` is a scar rather than a claim about a
  second shell: there is only one now.
- **(1.12) The a11y roster had been auditing the OLD shell since 1.8.** `scripts/a11y-audit.mjs`
  loads `index.html` without `?shell=new`, so every "axe clean" recorded for steps 1.8–1.11 was a
  measurement of the shell being replaced. Nothing false follows — the new shell was audited by hand
  at each of those steps, which is what those rows say — but the roster itself only started measuring
  the thing under construction at the cutover, and it audits clean against a baseline that was
  already empty.
- **(1.5b) `fmtApprox` printed `0` for a `NaN`** — the drop rule asks `Math.abs(x) > floor`, which is
  false for `NaN`, so a pair of them read as an exact-looking zero and a single one vanished leaving
  a plausible purely-imaginary answer. `removable-one-minus-cos` reaches it: a midpoint lands on the
  removable singularity and every later partial sum is `NaN`. Found by the strip, which was the
  formatter's SECOND consumer — which is what a second consumer is for.
- **(1.5b) A card keyed on `state.declaration !== null` calls the box a cofactor when the declaration
  is ORPHANED.** A declaration names a branch POINT; remove the point and `declaredOrder` returns
  null, so `resolveState` falls through to the plain branch and integrates the box WHOLE while the
  label still says `R(z)` — M6.1's own finding in a new place. Both cards key on `declaredOrder` now.
  **And the 1.4a test built exactly that state and asserted the buggy answer**, which is how it would
  have survived; it is replaced, and the orphan is now its own test.
- **(1.5b) `encodeShell` held two postures.** The contour's recipe is rebuilt and compared before a
  link is minted; a declaration was written straight out and `decodeShell` refused it on arrival —
  loud rather than silent, so nothing was ever wrong, but the failure was deferred onto whoever
  OPENED the link, who is exactly the reader who cannot act on it. It refuses at encode now.
- **(1.5b) The Result card spent the vocabulary's word for ONE constraint on all four.** `Hypotheses`
  is LEGALITY's name (`vocabulary.ts` `GROUP`), and 1.5a used it for the whole ledger — so a browser
  pass showed `Hypotheses — 6 checked` in Result beside `Hypotheses — 2 steps` in Derivation two
  cards down, inviting a reader to take one for a subset of the other. It reads `What was checked`
  now. Step 0.2's decision read from the other end: a card that spends a decided word on a wider set
  is the same drift.
- **(1.5b) A `role="status"` region must be rendered UNCONDITIONALLY**, contents only coming and
  going. One inserted with its text already inside is not reliably announced, so the natural
  `notice === null ? null : h(...)` would make every notice silent for exactly the readers who
  cannot see the badge.
- **(1.6) The step index had to be `drawAccumulator`'s, not the plan's.** The plan says
  `round(scrub·(N−1))`; the renderer derives its drawn head from `upTo` alone as
  `max(1, round(upTo·N)) − 1`, and the two differ at almost every position — so the readout and the
  stage marker would have named a term the picture does not end on. The strip takes the renderer's
  rule, and the off-by-one is killed by a browser test comparing bytes against the same renderer
  re-driven at `(index + 1)/N` rather than by a centroid, because consecutive steps are 0.75 px apart
  and a tolerance loose enough for antialiasing absorbs a whole one-term error.
- **(1.6) Alpha alone cannot separate the two accumulator trails.** Measured: with no comparison
  drawn, the band `60 < a ≤ 200` already held 128 pixels of the real trail's own antialiased edges.
  The test separates by HUE — chromatic piece colours against the achromatic axes and head dot —
  which survives antialiasing on an un-premultiplied read.
- **(1.6) `.strip2` had to become two columns.** It was a block with the canvas `position: absolute;
  inset: 0`, which painted over the side panel the moment one existed; a sibling panel needs the
  canvas laid out rather than taken out of flow.
- **(1.6) Two live regions is the PACKAGE's behaviour, not this step's** — measured: the old shell
  has two as well, because `attachCanvasA11y` makes one per attached canvas and defaults its host to
  the canvas's parent. Not changed.
- **(1.5b/1.6) One agent claim did NOT hold, and checking is why it matters.** The strip's report
  said `.shell2 .num` lacks `font-variant-numeric: tabular-nums`; it is set in `theme.css`, and the
  report had read only `shell2.css`'s rule cancelling the old sheet's monospace. Everything else in
  all three reports checked out against the code.
- **(1.5b) One gap left open and named: nothing asserts the strip is in the FIGURE.** The sweep's
  `strip-not-in-figure` survives — `stripView.drawNow` inside `figureBytes` guarantees the plate
  carries this frame's trail rather than the last coalesced one, and the honest instrument for that
  is the figure-export test Phase 2 step 2.3 builds. Recorded rather than contrived.

- **(1.5a) A TEST THAT PASSED ON THE WRONG SENTENCE.** The numerics note is asserted to say "a
  convergence estimate, not a proved error bound" — and the quadrature's own verdict carries a
  RESTRICTION with that exact phrase, which the card prints at the top. So the first draft passed
  with the note reworded to "Δ refine is the error.": the phrase was on screen, from somewhere else.
  The assertion is on the note itself now, keyed by the column it names (`Δ refine`,
  `|I_fine − I_coarse|`). M5.2's lesson again — pinning the outcome without pinning the reason.
- **(1.5a) The digit count is the WRONG discriminator between `fmtApprox` and `fmtCx`.** `1/sin(z)`
  round the circle converges to ~1e-13, so twelve decimals is exactly what its estimate supports and
  a test forbidding long decimals fails on a correct value. What `fmtCx` actually adds is
  `4.9564e-17 + ` — a real part that is the quadrature's rounding and not a number the app has. The
  DROPPED component is the property.
- **(1.5a) `fmtNum` needs no `-0` guard, measured:** `(-0).toFixed(2)` is already `"0.00"` and
  `(-0).toExponential(3)` is `"0.000e+0"`. `kernel/decimal.ts`'s `fmt` needs one because it rounds
  through `String(Math.round(…))`, which does not. The guard was removed rather than left as a line
  nothing can falsify (step 1.3's precedent).
- **(1.5a) `session.open` is TRI-STATE, and that is the whole design.** `undefined` means "never
  touched", which is what lets the hypothesis table open itself the moment a row fails and stay shut
  afterwards if the reader has shut it. A boolean with a false default cannot express that; one with
  a true default re-opens on every recompute. Verified in a browser: shut it on a failing state,
  edit the expression, it stays shut.
- **(1.5a) `setOpen` deliberately re-renders NOTHING.** The `<details>` the reader clicked is already
  in the state they clicked it into, and re-rendering would fight the browser's own toggle; the next
  commit reads the session. The sweep's `open-not-stored` mutant is what makes that falsifiable.

- **(1.4b) THE OLD SHELL PRINTS RAW LaTeX in its Branch-cuts card.** `CrossingMonodromy.literal` and
  `.reduced` are bare LaTeX fragments, and the old card assembles them into a string it sets as
  TEXT — so it reads `× e^{2\pi i \cdot \frac{1}{2}} = −1` on screen, backslashes and all. The new
  card prints `detail` instead, which is the same content as one `$…$` sentence, already in step
  0.5b's convention and already carrying BOTH of §3.4's forms and the reason they agree. Seen in a
  browser; the fix also removes a second wording of a sentence the kernel already writes.
- **(1.4b) "Any ink" is the wrong instrument for an emphasised stroke.** Every contour stroke is laid
  over a dark halo at a fixed width, so widening the coloured line from 2.5 px to 4 px adds NO pixel
  above an alpha threshold — it recolours pixels the halo already lit. The first browser test read
  10963 both times and looked like a product defect; counting the piece's own HUE reads the
  difference. (`vi.spyOn` on a module namespace is not available in the browser build, and would
  anyway assert that a function was CALLED with a number rather than that a curve looks different.)
- **(1.4b) A badge in a flex row collapses to a hairline.** The `⚠` on the split check's long refusal
  was a red vertical line 2 px wide — the one glyph that must not be missable. `flex: none` on a
  badge inside `.verdict`; a picker row's trailing note also wraps now instead of being clipped
  mid-word ("the determina as declare").
- **(1.4b) `reverseContour`'s piece ORDER is invisible to connectivity and to the integral.**
  Measured: for a closed two-piece contour, reversing each piece and leaving the list alone also
  joins up, and the sum over pieces is identical — so the first test passed under the mutant. What
  the order decides is which piece is walked FIRST, which is the accumulator's trail and an open
  contour's endpoints, and that is asserted directly.
- **(1.4b) A picker bound to nothing still looks right when the value IS the default.** The
  branch-point order select reads `√ (α = 1/2)` either way, because `addBranchPoint` gives a fresh
  point `OFFERED_ORDERS[0]`; the binding is only observable on a point whose order is something
  else. The same shape as 1.4a's `<select>` value bug, found by the sweep rather than by a browser.
- **(1.4b) The `not sampled` branch is unreachable and stays**, for the reason 1.4a recorded and
  M6.4 set the precedent for: M5.0 dropped the quadrature skip for all seven tier-D records, and the
  one skip it left needs a cut running VERTICALLY along a piece, which no template and window this
  card offers produces. The corpus is asserted to reach it nowhere, so a regression in M5.0's claim
  turns that test red rather than leaving the branch merely untested. Sweep **22/23**.

- **(1.4) THE PLAN ASKS FOR ERROR KINDS `@cas/expr` DOES NOT HAVE.** Its `ExprError` carries a
  free-text `message` and a `pos`, and every throw site writes its own prose. So the mapping to plain
  language is from the MESSAGE — another package's wording — and it is made falsifiable rather than
  accepted: `test/parseError.test.ts` drives the real `compile` over the shapes a reader types and
  requires every one to reach a mapped sentence **with the fallback unused**. It earned its keep on
  its first run: the end-of-input token prints as `eof`, not as the empty string the draft guessed,
  so the card would have told a reader that *“eof” cannot appear there*.
- **(1.4) And then the mapping was not WIRED.** The card printed `resolution.reason` straight, so the
  whole module existed, passed its own suite, and reached no reader. Caught by asserting both halves
  in `test/cards.test.ts` — the sentence appears AND the parser's own wording does not.
- **(1.4) A DUPLICATE KEY STRANDED A NODE, and only a screenshot saw it.** The Singularities card
  gave its table the key `card()` had already spent on the `<h2>`; `patch` holds one node per key, so
  the first heading was never matched and never removed and the app drew **SINGULARITIES twice**.
  Two repairs, both structural: a repeated key among one parent's children now **throws by name**
  (silently suffixing would keep the collision as a permanent source of lost identity), and removal
  is by *not wanted* rather than by *left in the key map*, which also makes the contract statable —
  **a patched parent's children are the patch's**. The product-level test is that every card has
  exactly one heading, for every record; nothing had counted them.
- **(1.4) A `<select>`'s `value` means nothing until its `<option>`s exist.** `applyProps` ran before
  the children, so the write was silently dropped and the fixture picker showed the first option
  while the app ran a different fixture. The properties are written AGAIN after the children, and
  rule 2's differs-guard makes the second write a no-op everywhere it was already right.
- **(1.4) `text-transform: uppercase` on a table heading destroyed the mathematics** — `Res(f, z₀)`
  drew as `RES(F, Z₀)`, which is a different function. A heading that is mathematics is set as
  mathematics; the residue column is `nowrap` and the card scrolls, because a residue broken across
  three lines mid-radical is unreadable.
- **(1.4) The old shell FREEZES each parameter track and this card does not, measured.** Over all 28
  records, moving the limit parameter by 1.7× moved ZERO tracks: the ranges come from the templates
  and are constants. So the freeze is carried as a question in a comment rather than as code.
- **(1.4) The circle's `R` slider spans twelve decades** (`[1e-6, 1e6]`, log), so 95 % of the track
  is `1e6` and the span a reader wants — say 0.5 to 5 — is about 8 % of it. **Identical in the old
  shell**, so it is not a regression, and the range is deliberate (`R → ∞` is the argument's own
  limit). What is wrong is the mapping, not the range; recorded for Phase 2/4 rather than changed
  from inside a card.
- **(1.4) `Pole.residue` had no LaTeX twin**, so "Res typeset" would have meant re-formatting from a
  string. It gains one the way step 0.4b's `exactValue` did — `formatSqrtExt`/`formatExpSum` at
  `LATEX`, the same formatter at a second notation, never a second rendering — and making the field
  REQUIRED is what named the three other construction sites for the compiler.
- **(1.4) The Target card is verified in jsdom only.** `?shell=new` has no record picker until step
  1.6 and does not decode `#vs=` yet, so there is no way to reach gallery mode in a browser; the
  sandbox cards are browser-verified, and all 28 records are covered by `test/cards.test.ts`.
- **(1.4) Sweep 27/28, one recorded equivalent.** `missing-as-zero` — printing `0` for a pole the
  contour was never ASKED about — survives because `integrateContour` weighs every pole the report
  found, so the branch is unreachable from any state the tests can build. It is kept for M6.4's
  reason: a description should not depend on an invariant established in another module.

- **(1.3) THE STAGE WAS DEAD TO A REAL MOUSE, and fifteen green tests said otherwise.** `app.css`
  carries an unscoped `.ink { pointer-events: none }` — correct for the old shell, whose gestures
  land on a separate `.overlay` div — and `index.html` loads that sheet for both shells, so the new
  shell's controller, which listens on the ink canvas itself, never saw a pointer. Every gesture
  test dispatches an event straight AT the canvas, which skips hit testing entirely, so nothing in
  either suite could see it; a probe with a real mouse against the dev server found it in one sweep
  (`cursor 'grab' first at x = NEVER`). The primitive is `document.elementFromPoint`, now asserted at
  three points over the stage, and the GL layer is explicitly denied the pointer — it is DATA and
  `aria-hidden`, and a click landing there lands on the layer that has no idea what a contour is.
- **(1.3) The same collision again within the hour, and then measured as a class.** `.chip` is the
  old shell's 9 × 9 colour swatch, so the stage's snap and held chips collapsed to a 9 px square with
  their text spilling out of them — `width: 14.78px` for a border box whose content width was zero.
  **Step 1.2's comment states only half the rule**: scoping `theme.css` under `.shell2` protects the
  OLD shell from the NEW rules and does nothing in the other direction. Measured across the new
  shell's whole class vocabulary, **nine collide** — `.num`, `.small`, `.muted`, `.badge`, `.chip`,
  `.gl`, `.ink`, `.navHost`, `.expr`. Two are RENAMED (`stageChip`, `shell2Nav`) because the old
  meaning is a different object; the rest mean the same thing in both shells and are cancelled in a
  named block in `shell2.css`, because what leaks is the old rule's extras rather than its intent —
  `.num` was arriving MONOSPACE, which inverts step 1.2's own rule that monospace is a signal the
  text is machine syntax. The block goes away at 1.12 with `app.css`; a browser test pins all three.
- **(1.3) The chip printed its `$…$` delimiters on screen.** A piece name is a SENTENCE in this
  app's convention — the circle is called `the circle $|z - a| = R$` — and the chip set it as plain
  text. It goes through `mathText` now, with `aria-label` carrying `mathPlain`. **No node assertion
  on `textContent` could have seen it**, because a KaTeX span's `textContent` is not the sentence
  either; the test asserts the label, that no `$` appears in the visible text, and that a `.katex`
  node is there.
- **(1.3) jsdom gives the stage a 1 × 1 box, so the 11 px grab radius covers the entire plane** and
  every `pointerdown` landed on a handle. The harness stubs `clientWidth`/`clientHeight` at
  900 × 600 rather than weakening the assertion — M7.2's "a test aimed at an unsized stage is aiming
  at an artefact", and step 1.1's `|| 1` guard magnifying the pen's geometry by 4, for the third time.
- **(1.3) The overlay is DOM and must not be gated on a CANVAS fact.** Drawing it at the end of
  `drawNow` put it after two returns — an absent 2D context and an empty resolution — so a reader's
  snap chip depended on whether the ink layer could get a context. It is drawn first and
  unconditionally; the mutant that moves it back is killed.
- **(1.3) A finished pointer gesture must LET GO.** Keeping the grab after `pointerup` left the chip
  pinned to the stage after every drag (seen in a browser) and silently rebound the arrow keys to
  whatever the mouse last touched. The keyboard's grab is something a reader ASKS for with Enter.
- **(1.3) `reset()` at the door, because `grab` is the controller's own local.** `resetTransient`
  clears the session's transient half, but it cannot see a variable it does not own — which is
  exactly M7.4's `drillGraded`, so `applyState` calls `controller.reset()` and a test drives it.
- **(1.3) The draft evaluation budget does not bite on the app's DEFAULT state**, measured: `1/z`
  inside `|z| = 1.5` puts the pole 1.5 away from every node, so the rule wants 56 nodes and the
  768/3 ceiling never comes near it. The test uses a pole just inside the circle, which is what a
  reader dragging a contour actually has under the pointer. (`session.scrubbing` is read by the
  budget now; the sliders that SET it arrive with the cards at 1.4/1.5.)
- **(1.3) A strengthened assertion was still bought by the piece name.** `toContain(handle.param)`
  passes for a label that drops the parameter entirely, because the circle is named
  `the circle $|z - a| = R$` and that contains `R`. The parenthesised suffix is the content — WHICH
  parameter of this piece — so the assertion is `toContain("(R)")` and `not.toBe(pieceName)`.
- **(1.3) Sweep 27/30, two recorded equivalents and one line deleted as dead.** `setPen(null)` in
  `reset()` was unobservable — the pen lives on the session, which the door already clears — and a
  line nothing can falsify is a line that will be wrong one day without anything saying so. The two
  survivors are kept with their reasons: the view's `session.pen === null` guard on the held chip is
  UNREACHABLE (`penStart` clears the grab, and `onPointerDown` returns before `setGrab` while the pen
  is out) and is kept defensively on M6.4's precedent, and `resetTransient` clearing `held` is
  redundant with `controller.reset()` doing the same, deliberately, since each clears what it owns.

- (review) `@cas/expr` already exports `toLatex` (`packages/expr/src/latex.ts`), used by three sibling
  apps. Step 0.4 measures its coverage rather than writing a printer.
- (review) The shell review's claim that no LaTeX printer exists was wrong on that one point; its other
  findings were verified.
- **(0.1) The plan's rule 2 could not be done as written, and measuring said so before any code was
  written.** It asks the claim line to show `closedForm.expr` and gate `simplified`. But `expr` is the
  **derivation**, not the answer: probed across all 28 records, 2 of them parse as expressions at all,
  and the rest read `2*pi*i*Sum(Res(P(z)/Q(z), z_k), im(z_k) > 0)` or `-knownValue(ray1)`. Showing it
  would have replaced a claim that is sometimes wrong with one that is never an answer. What the
  corpus already has is better than either: **`Golden.value` is the closed form AT THIS FIXTURE**
  (`-2*pi/sqrt(3)` at A1's `a = -2`, `sqrt(pi/8)` for F2's real primary target), and `Golden.numeric`
  is its value, pinned against the engine by the golden corpus. The claim line shows that; the
  family's `simplified` is a second line, shown only where it holds.
- **(0.1) The restriction is wider than the plan's five records — eight more fixtures, by a different
  mechanism.** The new test found `simplified` contradicting the value at six records through their
  **variant** fixtures (`halfRange`, `closeDown`, `companion`, `form`, `sided`), which compute a
  different quantity from the family's headline one. Fixed structurally with the existing `isVariant`
  rather than with eight more conditions.
- **(0.1) A3 needed no gate; it needed its fields the right way round.** Its `simplified` was `pi/6` —
  the value at `n = 2` and at no other `n`, the gallery's headline number masquerading as the family's
  closed form — while its `expr` held the general `(2*pi/3)*2^(-n)`, correct at all five fixtures.
  `simplified` is now the general form and the record carries no condition.
- **(0.1) D5's condition is `p == 1`, not the `p == 2` the plan suggested.** Its `simplified` states
  `R = 1/(1+x^2)`, which is `p = 1`; D4's states `R = 1/(1+x^2)^2`, which is `p = 2`.
- **(0.1) The plan's test bullet "no relation sentence contains `∮`" contradicts its own replacement
  sentence**, whose second clause names `∮` correctly ("the boundary terms below relate that integral
  to `∮ f dz`"). The property pinned instead is the one that was false: no sentence says the target is
  a **functional of** `∮`, and every record with a named functional says it is of the integral over
  the target pieces.
- **(0.1) G3 carried one more copied `cot` field than the plan listed**: its `discharge` bound was
  `2*pi*coth(pi/2)*(N+1/2)*max|f|`, where the engine's own csc certificate
  (`kernel/bounds/squareSide.ts`) has no `coth` factor because `sup|csc πz| = 1`.
- **(0.1) The card's refusal branch is unreachable, and was removed rather than kept as decoration.**
  DESIGN §5's invariant 4 requires a refusing fixture to be rank-deficient, which is what makes Pass 5
  refuse, so `solved` is null and the claim block is skipped — measured on D3's two integer-`a`
  fixtures, where the card shows Pass 5's own refusal instead. `ClosedFormClaim.refusal` is kept and
  tested, because Phase 1's result card will want it.
- **(0.1) Nothing asserted any of these six sentences before.** The suite was green through all of
  them, at 1863 tests, because the three functions lived inside `shell/app.ts`'s closure and the
  shell's own tests are jsdom. That is why they moved to `families/describe.ts` (DOM-free) and why the
  new file tests them in node. Sweep: 7 mutants, 7 killed, no survivors.
- **(0.2) A grep over the source could not find all of them; three more needed the corpus and the
  browser.** The plan's completion check is a grep for the four ids under `src/shell` and
  `derivation.ts`. Run, it passed while three ids were still on screen: the `cover` stage's own
  paragraph ("COVER is vacuous"), the solve's `from KILL · <piece>` statement label, and the dogbone
  records' exterior-theorem provenance ("is LEGALITY's business"). The first two fell to the new
  test's **corpus-wide sweep** — every ledger row, stage, line, statement and provenance step of all
  28 records, scanned for the ids — and the third fell to the same sweep once it ran. A fourth was
  invisible to BOTH, because it is interpolated rather than written: the contrast grid's answer cell
  builds `⚠ does not close (${cell.failedAt})` from a data key, and only driving the built app found
  it. Three instruments, three different finds.
- **(0.2) "Hypotheses verified." cannot be the success headline, now that `Hypotheses` is one of the
  four group names.** The plan (from the review) proposed it; above a table whose first group is
  `Hypotheses` it reads as that group alone having been checked. The existing sentences — "This
  argument closes." / "The closed-contour value is established exactly." — are already unambiguous
  and textbook-neutral, so they stay and only the FAILING headline changed, from
  "does not close: KILL fails" to a clause naming the group. `headlineVerified()` is therefore not
  exported: it would have had one caller and no id in it.
- **(0.2) The headline names the group, not the piece.** The plan's signature was
  `headlineFails(id, piece?)`. `LedgerRow` carries a `pieceId`, not a piece NAME, so naming the piece
  means plumbing the piece list into the headline to duplicate what the failing row directly beneath
  already says. Dropped; the clause per group is exact enough (`CATCH` has exactly one failure mode,
  an undecided winding, so its clause states it).
- **(0.2) `COVER` never fails** — `ledger.ts` emits it `satisfied` or `unknown`, because the sandbox
  having no target is not a failure. Its failure clause is written out anyway (the type is total) and
  is unreachable today; recorded in the module rather than left to be rediscovered.
- **(0.2) The `residue` role's label came from the ledger's own row, after the test guessed wrong.**
  The first draft assumed the sandbox circle's piece was `free`; it is `residue`, the role
  `circleTemplate` gives its one closed loop, and the ledger's row for it says "is computed directly".
  That is now its label, so the tag and the row agree.

- **(0.3) No ledger row is minted outside `ledger.ts`.** The plan lists `families/solveTarget.ts`,
  `solveResidueTerm.ts`, `solveImported.ts` and `collisionCheck.ts` as row-minting sites; measured,
  none of them constructs a row — `rowFrom` is the only constructor in the app, and those four mint
  CERTIFICATES, which the step's own boundary leaves as strings. Nothing to convert there.
- **(0.3) `claim` stays the string and `claimData` is the new object, against the plan's letter.**
  The plan has `LedgerRow.claim` BECOME the `Claim`, with the text as `renderClaim(row.claim)`.
  Measured, 122 sites read `.claim` as text and **108 of them are tests**; converting them buys no
  behaviour and buries a no-op proof in a 120-file diff, which is the one thing this step must keep
  reviewable. `rowFrom` computes `claim = renderClaim(claimData)` and is the ONLY constructor of a
  row, so the derived field cannot drift — and `test/claims.test.ts` asserts `claim ===
  renderClaim(claimData)` for every row of every fixture rather than trusting that sentence.
- **(0.3) `rowFrom` is exported, because three tests built rows as literals.** A literal row can
  carry a `claim` and a `claimData` that disagree; the pair is only worth anything because nothing
  can write the two separately, so the tests go through the constructor too.
- **(0.3) THE CORPUS REACHES 20 OF THE 40 TEMPLATES.** The byte-identical dump — 28 records × 79
  fixtures, 3,918 lines — proves the restructure a no-op for exactly half the ledger's sentences.
  The other twenty are the failure paths and the sandbox (a contour that does not close, a cut
  crossed with no side declared, a piece no lemma disposes of, an inadmissible cut system, a sandbox
  with no target), which is precisely where a silently moved sentence would go unnoticed. So
  `test/claims.test.ts` pins those twenty byte for byte and asserts that the union of "reached by a
  record" and "listed in the table" is ALL of `CLAIM_IDS` — a template added later cannot arrive
  unpinned.
- **(0.3) The twenty were verified against the pre-restructure source, not against my transcription.**
  Every template's static fragments were required to appear verbatim in `2cad10c:ledger.ts`; all do,
  except five SEAMS where the old code concatenated two literals — the grazed cut, the crossed cut,
  the two cut-invariance wordings and the weighted target — each of which was checked by hand as the
  concatenation of two fragments that are both present.
- **(0.3) Two shapes the plan's `ClaimArg` lists are not carried.** `cx` has no use: no ledger row
  renders a complex number (values reach the reader through the result card and the solve stage,
  neither of which is a row). And `count` gained a `noun`, so no template spells a plural — the two
  plural sites (`piece(s)`, `declared collision(s)`) were the kind of `${n === 1 ? "" : "s"}` that a
  reworded template would drop.
- **(0.3) The placeholder pattern is deliberately narrow, because a template contains mathematics
  that looks like one.** `kill.l5-unreadable` says `f could not be read as (Σ Nₖ e^{iaₖz})/D`; a
  renderer treating every brace as a placeholder would delete the exponent from the one claim that
  names the decomposition L5 needs. `{iaₖz}` fails an ASCII-identifier test because `ₖ` is not one.
- **(0.3) CLAUDE.md's test census was two steps stale** — it read 543 files / 5640 tests, the number
  0.1 left, while 0.2 had already added a file. Now 546 / 5658. A stale census in the setup
  instructions tells the next session its clean tree is broken, so it is bumped per step rather than
  at the phase gate.
- **(0.3) The sweep's one survivor was the behaviour nothing can yet observe, and 0.5 is when it
  starts to matter.** A missing argument leaves its placeholder STANDING rather than deleting it —
  unobservable today, since no claim in the corpus or the table is incomplete. Step 0.5 rewrites
  every template, where renaming a placeholder and forgetting its argument is exactly the slip that
  would otherwise delete a piece's name in silence. Standing text is a defect a reader can see; an
  empty gap is not. 18/18 after the test.

- **(0.4) The step is SPLIT into 0.4a and 0.4b.** As written it is three M items — a coverage sweep,
  a records/targets LaTeX module, and fifteen formatter siblings — where the plan's own session budget
  is one to two. 0.4a is the sweep and the language gap it found; 0.4b is
  `families/latex.ts` + `kernel/formatLatex.ts` + piece `nameLatex` + `ClaimArg.exact.latex`. Both end
  pushed, which is the point.
- **(0.4a) THE PLAN LOOKED FOR THE GAP IN THE WRONG PLACE, and measuring said so.** It expects
  `toLatex` coverage gaps and names seven functions. Run over every expression in the corpus,
  `toLatex` has **none**: nothing throws, nothing prints `undefined`, and its `\operatorname{…}`
  fallback is correct LaTeX. The gaps are in the **PARSER** — `sech`, `coth`, `factorial` and a
  capitalised `Gamma` are not names the language knows, so those strings never reach the printer at
  all. Six of the seven functions the plan lists (`csc`, `cot`, `sqrt`, `abs`, `log`, `gamma`) were
  already there.
- **(0.4a) The two repairs are opposite, and ONE rule chooses between them: preserve the printed
  FORM, normalise only the spelling.** `sech`/`csch`/`coth` became builtins because rewriting them as
  `1/cosh` and `1/tanh` would typeset a different form of the same number — and the form is part of
  the claim in an app that prints `17/4·e^{−iπ/4}` rather than `17√2/8 − 17i√2/8` on purpose, and
  whose G2 headline IS `(π/a)coth(πa)`. `Gamma` was normalised to the table's `gamma` in the one
  record that spelled it that way, because `gamma` PRINTS `\Gamma` and nothing is lost. `factorial`
  is a builtin for the first reason: `2π/Γ(n+1)` is correct and no longer the formula a reader knows.
- **(0.4a) `Golden.value` and the engine's `solved.text` are two different notations, and nothing
  compares them.** Measured: E3's record says `sqrt(pi)*exp(-1/4)` where the engine prints
  `e^(−1/4)·√π`, and the golden corpus compares `numeric`. So the records are written in `@cas/expr`
  INPUT notation, which is what 0.4a made readable, and the engine's answers are in its own OUTPUT
  notation from `kernel/format*.ts` — which is exactly 0.4b.
- **(0.4a) 0.1's display-notation rewriter is gone.** `onScreenClaims.test.ts` rewrote three spellings
  before parsing; with the gap closed from both ends it parses every fixture's value **verbatim**, so
  what the test evaluates is what the card displays.
- **(0.4a) NOTHING JOINED THE LANGUAGE TO THE SHADER LIBRARY.** A builtin added to `@cas/expr` without
  its GLSL half compiles, links, and passes every node test — and fails only when a user types it into
  a plotter, from the one surface with no node coverage. `packages/gpu/test/glslCoverage.test.ts` is
  the join: it reads the emitted CALL rather than the private name map, and covers all 32 functions
  rather than the four new ones. It passes today, so this is a guard and not a repair.
- **(0.4a) `@cas/gpu`'s parity gate could not be run in this container at all** — Playwright pins an
  exact Chromium and `pnpm` skips its postinstall. Its browser config now takes
  `CAS_CHROMIUM_EXECUTABLE`, the line `apps/contour-integration`'s config already carries and whose
  own comment says the other three would be better for having. With it, 21 GLSL≈JS cases run here.
- **(0.4a) The parity classifier is keyed on SPELLING, and `z!` does not look transcendental.** The
  sweep found `cfactorial` losing its `+1` surviving — Γ(z) is a perfectly good function and the wrong
  one, and no node test can tell, because the emitted call is `cfactorial` either way. Putting it in
  `DUAL_BACKEND_CORPUS` then held it to the ARITHMETIC tolerance, which the float32 Lanczos series
  cannot meet, because the regex matches `gamma` and not `factorial`. Both fixed, and the mutant dies
  in a real WebGL2 context. Sweep 13/13.
- **(0.4a) Two records' `closedForm.simplified` is PROSE.** D4's and D5's determine several unknowns
  at once, so their general form is a sentence about which — `T1 = -pi/4 and T0 = pi/4 for
  R = 1/(1+x^2)^2` — which is true and is not a closed form, so no printer can typeset it as one.
  Declared by id in the coverage test and CHECKED to still be prose, so a third record that quietly
  becomes a sentence fails rather than being absorbed by a regex.

- **(1.2) "Byte-identical" is proven by the MAPPING, not by the tests passing.** The browser ink
  tests assert properties of the frame, so a mis-mapped literal — `halo` where `haloStrong` belonged
  — would pass them. Every replaced literal was instead checked against the theme field that
  replaced it: **12 plain assignments carry the same string character for character**, and the five
  ternaries (`#f0b45e`→`refusedInk`, `#c77dff`→`cutInk`, `#ffffff`/`#e7e9ee`→`handleGrabbed`/
  `handleRing`) map identically. The old shell's whole rendered page is then the same PNG hash
  before and after, which is the claim end to end.
- **(1.2) `theme` is a REQUIRED option on both drawing calls, not a defaulted one.** A default would
  be a second place for the palette to live, which is the thing `inkTheme.ts` exists to prevent —
  and the old shell stating `DARK_INK` explicitly is what makes "the old shell is unchanged" a
  compile-time fact rather than a hope. Five call sites; the type error named each one.
- **(1.2) Everything in `theme.css` that is not a token is scoped under `.shell2`.** `index.html`
  loads the sheet for BOTH shells, so a bare `button { … }` rule would restyle the old shell — which
  this step's own file list says to leave alone until 1.12.
- **(1.2) Eighty lines of control and badge CSS render NOWHERE until steps 1.4 and 1.5**, so they
  are exercised now against the real sheet and the real cascade rather than carried unverified
  through a phase and found wrong when a card first uses them. Sweep **8/8** — the result card's
  accent rule, borderless cards, 22 px badges, three distinct badge colours, the segmented
  control's pressed position, prose not monospace, tabular numbers.
- **(1.2) One of my own assertions compared a value with itself** and passed regardless: the result
  card's rule colour, written as `expect(x).toBe(… ? x : x)` while fumbling the token lookup. It
  resolves `--g-accent` through the browser now, so a hex and a computed `rgb(...)` compare as the
  same thing — and the sweep's "the rule is not the accent" mutant confirms it bites.
- **(1.2) `no-shadow` caught a shadow in my own test** — a `probe` canvas and a `probe()` helper in
  one file. The rule M5.1 made an error for this app, doing its job on the first file since.
- **(1.2) The light ink theme is provided and NOTHING consumes it**, which is stated in the module
  rather than left for the next reader to discover: the figure export's plate is chrome only
  (`FigureTheme`) and composites canvases drawn in the dark theme, so a light figure is a later
  step's work. Its piece hues are darkened rather than reused — `#6ea8fe` on white is 1.9:1.
- **(1.2) The plan's token list names things the canvas layers do not draw** (`pole`, `poleLabel`,
  `grid`): poles and the grid come from the GLSL phase shader, not from `ink.ts`. `InkTheme` carries
  what the code actually uses, and gains `haloStrong`, `cutHandle` and `markerFill` — which the
  plan's list omits and the code has always had two of.
- **(1.1) THE FIRST DRAFT REINTRODUCED A DEFECT THIS APP HAS ALREADY SHIPPED ONCE.** `.shell2` used
  `height: 100%`, which needs a sized ancestor that `#app` is not — so the shell collapsed to 440 px
  in a 900 px window and the stage was **186 px tall** — and, worse, it was anchored at `y = 0`
  underneath the `position: fixed` suite nav, which sits at z-index 6 and swallows every click in
  that band. The old shell's own CSS carries the comment recording the first time. `margin-top` and
  `calc(100vh - var(--cas-nav-h, 0px))` fix it, and the browser test now measures the shell against
  the WINDOW rather than against a host the test itself sized.
- **(1.1) The browser harness was the next defect, exactly as in M7.2.** The viewport test then
  failed claiming the nav was 287 px tall: the harness imported `app.css` and `shell2.css` but not
  `@cas/ui/nav.css`, so the nav rendered as an unstyled block instead of a fixed bar. **Mounting
  without a stylesheet does not give a plainer layout, it gives a different one** — the harness now
  loads what `main.ts` loads, all of it.
- **(1.1) Four sweep survivors, and every one was a test asserting the outcome without the reason.**
  *(a)* "writes a property only when it differs" passed with the guard removed, because the test
  patched twice with the same string and jsdom does not move the selection on a same-value write —
  what the guard does is skip the WRITE, so the write is now counted through a spy. *(b)* KaTeX
  "memoised" passed with the cache written and never read, because the html strings match and the
  map still grows — so the test counts CALLS to `renderToString`. *(c)* Listener removal has two
  paths and only one was covered; a card writing `onClick: enabled ? fn : undefined` keeps the key
  and drops the function, which the previous-props loop never sees. *(d)* `resetTransient` was
  tested on the helper, which was always right — **M7.4's actual defect is that `applyState` did not
  CALL it**, so the property is now tested at the door.
- **(1.1) One survivor is browser-only and is tested there rather than recorded as equivalent**: the
  stage's program must be relinked for a new INTEGRAND and not for a moved camera (M5.1's review
  found the old shell relinking on every frame of a contour drag). In jsdom there is no stage to
  relink, so the node sweep cannot kill it; `test/shell2.browser.test.ts` spies on `setIntegrand`
  and counts.
- **(1.1) Two of the plan's items for this step were already done, and are recorded rather than
  redone**: `katex ^0.17.0` has been a dependency since 0.5b-i (the renderer had to arrive with the
  delimiter convention), and `splitMath` is reused rather than restated — it is DOM-free and already
  the single reader of the `$…$` rule, and a second copy is a second place for the rule to drift.
- **(1.1) The card titles go in `vocabulary.ts`, not in the cards.** Step 0.2's decision is that the
  file is the one place the reader's words are decided; a title living in its own module would be a
  title nothing can survey. `LEFT_CARDS` / `RIGHT_CARDS` carry the reading order with them, and the
  Target card is filtered out in the sandbox — a card reading "—" forever would teach a reader that
  the app has a target it is failing to find.
- **(0.7) The plan's PR title is FALSE and is not used.** It says *foundations (no visible change)*,
  and Phase 0 rewrote every ledger sentence (0.5b), every record title and every variant fixture
  label (0.6), and made the record card typeset its title. Merging it under a title promising no
  visible change would misdescribe the diff to the one reader most likely to trust the title.
- **(0.7) The local `master` ref was 3 commits stale**, so the first read of the branch's diff
  reported `scripts/a11y-baseline.json` as changed by Phase 0 when the change was M7's, already
  merged upstream. Fetched and merged `origin/master` before opening the PR, resolving two conflicts:
  `packages/gpu/vitest.browser.config.ts` takes UPSTREAM's version (it adds a `/opt/pw-browsers`
  probe this side lacked) and CLAUDE.md's test census takes the real number.
- **(0.7) `pnpm a11y` could not run in this container at all**, and the reason was a second name for
  one thing: the script reads `PLAYWRIGHT_CHROMIUM_EXECUTABLE` while the browser suites and CLAUDE.md
  say `CAS_CHROMIUM_EXECUTABLE`. Both are accepted now, and both the a11y roster and the app's
  browser suite took `packages/gpu`'s `/opt/pw-browsers/chromium` probe, so each runs here with
  NOTHING set. A gate CLAUDE.md tells a session to run, that needs an undocumented incantation
  first, is a gate that gets skipped — which is exactly how the browser suite went red for three
  milestones.
- **(0.6) THE FOUR-LINE STANDARD IS THREE FIELDS, because the fourth is already the engine's.** The
  identity is `targets` + `closedForm` — the two things the app computes — so `description` carries
  only the contour, the point and the citations. A `description.identity` would have been a second
  source of truth for the one line that must agree with the number beside it, which is X1 (the
  review's own first cross-cutting finding) rebuilt in a new field.
- **(0.6) A literal reading of the plan's citation rule would have discarded VERIFIED precision.**
  It says "use chapter-level citations and drop the `[verify]` markers by citing the chapter only";
  taken literally that turns a confirmed `Ahlfors, Ch. 4 §5.3` into `Ch. 4 §5`. The review marks
  `[verify]` on the narrowest clause it could not confirm, so the rule applied is: always drop the
  exercise or example (never confirmed anywhere in the review), and widen a sub-section decimal only
  where the reference itself was flagged. 67 citations across 28 records, every one with a non-empty
  `where` and no exercise number.
- **(0.6) Two of invariant 5's three stated conditions are TYPES, not checks.** A record without a
  `description` and a `taxonomySection` outside the eight are compile errors once the fields are
  required and the union is closed, so a runtime check for them would be unreachable — and a check
  that cannot fail teaches a reader that it might. Invariant 5 asks what the type system cannot: a
  citation with no chapter, an empty description, an unbalanced `$`, a rank outside 1–8, and an
  unlabelled variant fixture. Front-row collisions are corpus-level and live in `loadFamilies`.
  Every branch was probed and fires.
- **(0.6) THE FRONT ROW WAS NOT A TOUR OF THE TAXONOMY, and the test found it.** Eight classics and
  eight groups look designed to pair, but the plan's list puts D1 and D4 both among the keyholes and
  leaves *dogbones and the residue at infinity* unrepresented. Raised as an open question rather than
  fixed silently; **the owner's answer was to choose, and the choice is D6 at rank 6** (0.7), so the
  row is one per group and the ranks run in group order — an index that skips a whole group is worse
  than one omitting a famous integral still one click away inside its group. The test asserts the
  group sequence, not just a count.
- **(0.6) The variant fixture picker had been offering the IMPLEMENTATION's name.** `halfRange = true`,
  `companion = re`, `form = pv` — flag keys sharing a field with parameter bindings (the schema's own
  recorded finding 2 of 3). `Golden.label` names the derivation instead (`half-range corollary`, `the
  cosine companion`, `principal-value form`), required on a variant by invariant 5 and forbidden
  elsewhere, and `fixtureLabel` still prints real bindings from `params` — so `series-cot-kernel`
  reads `a = 0.75, one-sided sum` with the number coming from one place.
- **(0.6) My own first draft of the label test was too strong and would have banned a correct
  label:** it refused any label containing a flag key, and `the cosine companion` contains
  `companion`. What must never reach a reader is the MACHINE rendering, so the assertion is that the
  label reads as prose — no `=`, no camelCase identifier.
- **(0.6) Nothing in the suite pinned a record title before this step**, which is why rewriting all
  28 broke no test. They are user-facing strings; `test/records.test.ts` now asserts their shape
  (no ` — ` explainer, none of the words `trap`, `collide`, `hand-waved`, `switch`, `ladder`) and
  runs every `$…$` in the record's own sentences through KaTeX at `strict: "error"`, the instrument
  0.5b-iii built for the ledger's.
- **(0.5b-iii) A BLANKET REPLACEMENT CORRUPTED A SENTENCE AND SHIPPED GREEN.** `branchArc.ts`'s
  float-honesty row read *"the limit depends only on the sign of the exponentt rests on the sign
  alone"* — the tail of the phrase it replaced, welded on mid-word — and it was committed in 0.5b-ii,
  because no test reads provenance prose and the five rules it was checked against are about caps,
  citations and delimiters rather than grammar. Found by diffing the commit's own replacements for a
  new line that ends with a suffix of the old one starting mid-word; **exactly one**, confirmed by
  pairing removed and added lines WITHIN a hunk (pairing across the whole diff reported nine, eight of
  them unrelated sentences that happen to end alike).
- **(0.5b-iii) The same sweep had rewritten 21 lines of DOC COMMENT**, turning `∈ ℤ` into
  `\\in \\mathbb{Z}$` inside prose that is never rendered — invisible to every check, since the
  review document reads what the app COMPOSES and a comment composes nothing. Comments are not
  shipped sentences and are reverted. A blanket replacement over source needs a comment guard; the
  one here (`^\s*(\*|//|/\*)`) missed a `/**`-opening line on its first pass, which is the smaller
  version of the same mistake.
- **(0.5b-iii) THE `$`-BALANCE CHECK HAD A NARROWER REACH THAN THE THING IT CHECKED, and reported a
  clean corpus it had not read.** It walked the ledger's rows; the review document walks those AND
  the derivation's lines. Twenty sentences opened a `$` and never closed it — every one of them on a
  derivation certificate, which is where the bound modules and the solve do most of their talking.
  `everySentence` is now the single corpus walk both read, and the count went 0 → 20 → 0. A second
  reader with its own walk is not a weaker check; it is a check that answers about a different corpus.
- **(0.5b-iii) A BALANCED `$…$` PROVES NOTHING ABOUT ITS BODY, and that class is larger.** Six
  sentences shipped `$I = e^(−1/4)·√π$` — delimited, and in engine notation, which KaTeX renders as
  upright letters and a raw `√`. No count of delimiters can tell it from LaTeX, so the instrument is
  **KaTeX at `strict: "error"`**, now a corpus test beside the balance check. Its first draft used
  `throwOnError` alone and reported **zero**: KaTeX does not throw on unknown Unicode, it warns — the
  suite's own log had been printing those warnings all along. The app keeps `throwOnError: false` and
  the default `strict: "warn"` on purpose (a malformed sentence must not blank a panel); the test is
  what stops one existing. Mutation-checked: dropping the fix takes it red.
- **(0.5b-iii) The review document's hand-written rows FROZE `today` and so reported finished work as
  outstanding** — eight repairs and three headlines, all applied in 0.5b-i, still printing their
  pre-0.5b sentences. The headlines are named in `vocabulary.ts` (`HEADLINES`) and read live; the
  repairs cannot be (they are composed only on a FAILING row, and every gallery record closes), so
  the column decides by looking in the source. A review document that misreports the code is worse
  than none, because it is believed.
- **(0.5b-iii) `renderArg` returning `$latex$` was right in one place and wrong in another.** Three
  claims printed an engine-notation value beside an already-typeset piece name, and wrapping the
  argument fixed those while nesting delimiters inside the templates that already put their
  placeholder in maths (`… \\alpha_j = {sum} \\in \\mathbb{Z}$`). The question is about the SITE,
  so `renderClaim` answers it there: count the `$` before the placeholder — odd means inside, take
  the bare LaTeX. The balance check caught the nesting on its first run, which is the instrument
  earning its keep the same day it was widened.
- **(0.5b-iii) The browser suite was red on wording from 0.5b-i**, two assertions in
  `penInk.browser.test.ts` pinning `legality.closed` and the enclosed-count claim. The node gate is
  structurally unable to see it, which is the standing warning in CLAUDE.md met again — the rule is
  to run `test:browser` when a slice touches what the stage shows, and a wording slice does.
- **(0.5b-iii) The dump's 1,457 changed lines are proven wording-only by the SHAPE of the change**,
  not by reading them: every row's structural prefix — kind, constraint, status, verdict, piece id —
  is byte-identical, keyed on the row kind, because the sentence sits in a different column for each
  (a first attempt excluded only the LAST column and reported 653 false "structural" changes). The
  values are pinned by the green suite, whose golden corpus fixes every record's closed form.
- **(0.5b-ii) 65 tests broke, and the reason is worth keeping: they SCRAPE the sentences.** A bound
  test reads its number back out of the claim with `/≤ ([0-9.e+-]+)/`, and `≤` is now `\le` — so a
  wording change silently turned a measured bound into `NaN` and the comparison into
  `NaN < NaN`. The certificates already carry `value`, `asymptotics` and `exponent` as fields; the
  tests read the prose instead. They are updated rather than restructured here, and the restructure
  is worth its own slice.
- **(0.5b-ii) A stray `$` was visible on every record, and only the browser found it.** One
  provenance sentence in `branchArc.ts` opened a delimiter it never closed. `splitMath` re-joins an
  odd trailing delimiter as TEXT — the safe direction, since the line renders plainly instead of the
  rest of it disappearing — so the defect shows as a lone dollar sign and nothing else. There is now
  a corpus test for it: no sentence may ship an unbalanced `$`.
- **(0.5b-ii) The solved value now carries its LaTeX**, because the derivation's answer line
  (`the integral = π/2` → `$I = \frac{\pi}{2}$`) is the one sentence in the app a reader is most
  likely to copy. `SolvedValue`/`SolvedSummary` gained a `latex` sibling from the same formatter at
  `LATEX`, which is 0.4b's arrangement applied one level up.
- **(0.5b) THE CONVENTION NEEDS ITS RENDERER IN THE SAME STEP, and the plan has them two phases
  apart.** It puts the `$…$` delimiters in 0.5 and KaTeX in Phase 1. Applied in that order, Phase 0 —
  which merges to `master` alone — would ship a page of literal dollar signs; and writing the 200
  sentences in Unicode first and rewriting them in Phase 1 is the same work twice. So `shell/math.ts`
  lands here, at its smallest: split on the delimiters, typeset the odd spans, leave everything else
  as text. A sentence with no dollars comes back unchanged, which is exactly what lets the remaining
  bound and provenance strings keep their Unicode until 0.5b-ii reaches them.
- **(0.5b) The step is SPLIT.** 0.5b-i is the ledger's own 72 sentences plus the renderer; 0.5b-ii is
  the same five rules through `kernel/bounds/*`, `kernel/branch/*` and `families/solve*.ts`. The
  document's own count is why: 191 sentences break at least one rule, and the ones left are the
  bound and provenance strings the review flagged without rewriting.
- **(0.5b) THE REVIEW DOCUMENT UNDER-REPORTED BY MORE THAN HALF, and only applying it showed that.**
  0.5a collected ledger rows and derivation STATEMENTS; it did not collect the derivation's own
  LINES, whose evidence is a whole verdict rather than a ledger row — which is where
  `solveTarget.ts` and `solveResidueTerm.ts` do their talking. It reported 4 internal citations
  where there are 26, and 98 flagged sentences where there are 191. Fixed, and the corrected
  document is committed with this step.
- **(0.5b) Four tests reported a refusal that had not happened**, and the wording pass is what
  exposed them: `ledger.test.ts` found its cut rows by searching the claim TEXT for "cut" and for
  "admissible". The new admissibility sentence does not contain the word, so the helper returned that
  row — satisfied — and four refusal tests passed against the wrong row. They are keyed on
  `claimData.template` now, which is what a row IS rather than what it happens to say; step 0.3's
  restructure is what made that possible.
- **(0.5b) The new argument check found three of my own drafts dropping a value.** `cover.in-sum`,
  `cover.in-sum-weighted` and `catch.escalation` no longer named arguments the ledger still supplied
  — so the target's own name would have vanished from the tier-G row. Two templates got the name
  back; the third stopped being supplied. That check (an argument the template never mentions) went
  in during 0.4b's review and fired on its first real use.
- **(0.5b) `{piece} $= ${value}$` was one dollar too many**, and produced `the saddle line $= $−e^(…)·√π$`
  on screen. The value is the engine's own Unicode notation, not LaTeX, so it belongs OUTSIDE the
  delimiters; a `$…$` span would have to carry the `latex` sibling instead, which is a real extension
  rather than a wording change.
- **(0.5a) The proposals are CODE, not a column in the markdown.**
  `test/helpers/claimsProposals.ts` holds them and the document is a view of it, so regenerating
  cannot lose an edit and an edit cannot be made in the document without reaching the code — which
  is what step 0.5b reads. The alternative, a hand-edited table, would have had to be re-transcribed
  by hand into 200 string literals.
- **(0.5a) The four wording rules are DECIDABLE, so the document computes them.** That is what makes
  the 140 rows with no draft useful rather than a silent backlog: every sentence says which rule it
  still breaks, and a row that HAS a draft is judged on the draft, since that is what will ship. A
  test requires every proposal to break none of them — a review asking the owner to approve the very
  thing it exists to remove would be worse than no review.
- **(0.5a) The delimiter rule had to be strengthened before it meant anything.** "Does the sentence
  contain a `$`?" is satisfied by a sentence that typesets half its formulas and leaves the rest as
  characters, which is the likelier mistake; it now strips every `$…$` span first and checks what is
  left.
- **(0.5a) The repairs cannot be collected by running the corpus** — every gallery record closes, so
  no repair line is ever composed. They are a static list quoted from `ledger.ts`, and a test
  requires each quoted string to still be IN that file, which is what stops the list drifting from
  what it claims to quote.
- **(0.5a) The document is 202 sentences, and 98 of them still break a rule.** Measured rather than
  estimated: 29 shout a word, 4 cite an internal document, 10 name a lemma by number, 4 use a house
  word, and 90 carry mathematics that has to move inside `$…$`. Sixty of the ledger's own 72
  sentences are drafted; the rest are the certificate and provenance strings, where the review
  flagged more than it rewrote.
- **(0.4b) The plan asks for a second set of formatters; there is ONE set at two notations.** Its
  `src/kernel/formatLatex.ts` would be a parallel implementation of a five-module layered printer —
  `formatPiExpSum` → `formatSqrtExt` + `formatExponent` → `formatLogPart`/`formatPiPart` — roughly
  200 lines that can drift from the text it is supposed to agree with. What differs between
  `π√2/2` and `\frac{\pi\sqrt{2}}{2}` is not the STRUCTURE but the spelling of each join, so
  `kernel/notation.ts` declares those joins and every formatter takes the notation it writes in,
  defaulting to the text the app has always printed. A term one form drops is a term the other drops,
  because it is the same line. The text output is unchanged and 0.3's byte-identical ledger dump
  proves it.
- **(0.4b) `\pi` followed by `i` is `\pii`, and EVERY `2πi` in the gallery came out that way.** An
  undefined control sequence, which KaTeX refuses outright — so the first draft rendered nothing at
  all for most of the corpus. Concatenating rendered symbols is not string concatenation in LaTeX,
  and `Notation.juxtapose` is where that lives: a space goes in exactly when a control sequence is
  followed by a letter. Found by the corpus KaTeX sweep on its first run.
- **(0.4b) An optional second parameter on a formatter silently binds to `Array.map`'s INDEX.**
  `summed.totals.map(formatRatPi)` passes `0, 1, 2…` as the notation. TypeScript caught it here
  because `Notation` is an object type — a formatter whose second parameter were number-ish would
  not be caught at all. Nine call sites, two of them in `src/`, all now wrapped.
- **(0.4b) The sweep's three survivors were three different holes, and each bought a test.** A LaTeX
  form emitting the text notation's own `−`, `π`, `√`, `·` and Unicode superscripts is invisible to a
  canonical comparison that normalises both sides, and KaTeX renders several of them — so the forms
  are now required to contain **no Unicode mathematics at all**, which is what makes them LaTeX
  rather than something that happens to render. A compound coefficient losing its brackets before a
  `·` prints a DIFFERENT FORMULA (the text formatter's own comment records finding that by eye on
  B3), and the canonical comparison strips every bracket, so the two shapes are pinned outright. And
  an imported value's `latex` was asserted PRESENT rather than correct, which `latex: ""` satisfies.
  20/20 after.
- **(0.4b) `imported.text` is the ENGINE's notation, not the record's, so it cannot be re-parsed.**
  It reads `−e^(−1/4)·√π`, built by `formatImported` from `formatExpSum` — 0.4a's finding about the
  two notations, arriving in a second place. The repair is the one this step is built on: the LaTeX
  is carried from the FORMATTER, so `ImportedAtom` gains a `latex` and `formatImported` takes a
  notation, rather than the ledger trying to read the engine's own prose back as an expression.
- **(0.4b) `nameLatex` is moved to 0.5, because the piece names are PROSE.** The plan expects symbols
  (`\Gamma_R`, `[-R,\,R]`, `\gamma_\rho`); measured, the 137 piece names in the corpus are
  sentences with mathematics inside them — `the real segment [−R, R]`, `the lower edge, log z = log x
  + 2πi`, `the R → ∞ semicircle`. Giving each a LaTeX SYMBOL would invent a naming scheme the records
  do not have, by hand, in 137 places, which is the drift M6.4 recorded. What they actually need is
  0.5's `$…$` delimiter convention applied to prose — a WORDING change, which is what 0.5a puts in
  front of the owner.
- **(0.4b) Two `toLatex` refinements are recorded rather than made.** It prints every product with
  `\cdot`, so `\sin(\pi \cdot \alpha)` where a textbook writes `\sin(\pi\alpha)`; and a leading
  minus stays inside a fraction, `\frac{-\pi}{4}` where a textbook writes `-\frac{\pi}{4}`. Both
  are small and both are in a package three other apps print through, so they belong in the
  presentation pass where the rendered page can judge them. The proposed rules: juxtapose a product
  unless the right operand starts with a digit; lift a negated numerator's sign out of the fraction.
- **(0.4b) A record's parameters are SPELLED for their Greek letters** — `alpha`, `mu`, `xi`, `eta`,
  `theta` — which `toLatex` prints verbatim as italic words. `kernel/exprLatex.ts` applies the
  convention, in the app rather than in the package: a plotter's `a, b, c` are not Greek, and a
  user's variable named `eta` may not be either.

## Open questions for the owner

- none open. The five blanket decisions are approved and **applied in full**: the review document reads 0 flagged, 0 unapplied.
  (Historic, kept for the record: **read [`claims.md`](claims.md) and say what you want changed.** It is every
  sentence the app composes — 202 of them — with what it says today, what is proposed, and which of
  the plan's wording rules each still breaks. **The fastest way through it is the section "The five
  decisions, if you would rather not read 200 rows"**: each rule is offered as a blanket decision
  with its count and a sample, and approving the five settles most of the document. The tables are
  then only for sentences you want worded differently. Reply however suits — line edits, "the five
  are fine, apply them", or a rule that is not on the list. Phase 0 does not merge until this is
  settled; step 0.5b is the application.) — **answered: "the five are fine, apply them".**

## Decisions taken during execution

- (plan Part 2) Default stage mode is **quiet** in all three app modes; full, isochromatic and
  textbook are one click away. Rationale in plan §4 step 1.9. **(1.9) Taken as written**, and the
  reason now lives in `src/ui/stage/mode.ts` beside the list rather than only here: in all three app
  modes the subject is the contour and the verdict, and a full-chroma portrait behind them competes
  with something that is not the argument.
- **(1.9) The modulus band DARKENS rather than straddling C6's lightness**, which is a gamut fact and
  not a preference: measured, `L + 0.06` at the table's own chroma puts 173 of 256 entries out of
  sRGB with a worst overshoot of 0.209 of a channel, where `L − 0.12` overshoots by at most 0.045.
  The plan's "today's mapping with the table in place of the ramp" is met in every other respect.
- **(1.11) The undo stacks are NOT part of `resetTransient`.** A link clears them, but it does so
  through `undo.ts`'s own `"link"` rule rather than through the session's transient list, because
  `restore` is that list's second caller and needs the opposite — the redo stack it has just filled.
  One clearing rule, in the module that owns the stacks.
- **(1.11) A camera move is never an undo entry, and a restore keeps the READER's camera.** The two
  halves are one decision: if the camera is not part of the history then an entry's camera is not a
  camera anybody chose, so putting it back would be a jump the reader did not ask for.
- **(1.10) `compile` PROBES its own evaluator**, so an expression that parses and cannot be evaluated
  is refused at the box rather than thrown out of `resolveState`. Recorded as a decision because it
  narrows what `Compiled.ok` means: it was "parsed", it is now "parsed and callable". One probe at an
  ordinary point is enough — `makeComplexFn`'s throws are structural, not point-dependent — and a
  merely undefined point returns `NaN` or an infinity, which the app shows rather than refuses.
- **(1.10) A minus-sign inconsistency is LEFT ALONE and recorded.** The readout prints
  `-45.0000°` with an ASCII hyphen and `1.0000 − 1.0000i` with U+2212, because that is what the app
  already does everywhere: `fmtCx` and `fmtApprox` carry the imaginary sign in the OPERATOR as
  U+2212 and pass the real part straight through `fmt`/`fmtNum`, which is `toFixed`'s hyphen.
  Changing it means changing every formatted number in the app and every wording-pinned test, which
  is not this step's, and fixing it inside one module would create a second convention.
- **(1.9) The bar WRAPS below 1280 px**, superseding step 1.7's `flex-wrap: nowrap`. That decision
  was measured against a fixed 3.25rem grid row, in which a wrapped line spilled invisibly under the
  stage; 1.9 makes the row `minmax(var(--bar2), auto)`, which removes the objection, and the
  stage-mode control takes the one-line arrangement 62 px past what 1024 px can hold whatever the
  elastic record button does.
- (plan Part 2) The drill and the contrasts move out of full-screen overlays in Phase 1 only as far as
  a correct modal dialog and a rail card; their rehousing proper is Phase 3.
- (plan Part 3) In the sandbox the piece roles are target · vanishes (by a chosen lemma) · known limit ·
  free; `reproduces` stays record-only because it needs a coefficient and a solve the sandbox does not
  have (plan §7). The sandbox gains a target value instead: $\oint$ minus the known limits, when every
  other piece is certified.
- **(0.1) `src/families/describe.ts` is the DOM-free home for what a record says about itself** —
  `targetText`, `relationText`, `contourIntegrandExpr`/`Text`, `closedFormClaim`, and now `isVariant`
  (moved from `runFamily.ts`, which re-exports it so no call site changed). Step 0.4's LaTeX siblings
  go beside them.
- **(0.2) `src/engine/vocabulary.ts` is the one place the reader's words are decided** — the four
  group labels, the seven derivation titles (which READ the group labels, so a heading and the rows
  beneath it cannot drift), the piece-role names, and the failing headline. `ConstraintId` and
  `StageId` are declared there and re-exported by `ledger.ts` and `derivation.ts`, because both need
  the labels and a type-only import back would be a cycle (`no-circular` runs over type-only edges).
- **(0.2) `roleLabel` is applied to the contour card's piece tags as well as the contrast grid.** The
  plan named only the grid, but the tag printed the raw `PieceRole`, and labelling one while leaving
  the other would have introduced the inconsistency this step exists to remove.
- **(1.2) `src/ui/theme.css` is the visual system and `src/ui/shell2.css` is the layout.** Nothing
  in the layout sheet declares a colour; every coloured rule reads a token. `app.css` is untouched —
  the old shell keeps it until 1.12.
- **(1.2) `src/ui/inkTheme.ts` is the one home for the canvas palette**, and `PIECE_COLOURS` is now
  a view of it rather than a second copy.

- **(1.1) `src/shell2/dom.ts` is the app's DOM layer** — `h` + `patch`, no dependency. Unkeyed
  children get a positional key, so the reconciler has ONE path rather than a keyed mode and an
  unkeyed one that could diverge.
- **(1.1) `render(state, resolution, session)` computes no mathematics.** The engine surface is
  `ShellState` + `resolveState`, and the shell is a pure function of the two plus the session.
- **(1.1) `Session` is the half a permalink must not carry** — gesture, pen path, hover, undo/redo,
  `drillGraded`. `applyState` clears the transient fields through `resetTransient` and deliberately
  keeps the reader's own preferences (folded rails, open disclosures, figure theme).

- **(0.6) `description` is three fields, not four** — the identity stays in `targets`/`closedForm`.
- **(0.6) `Citation` is `{ text, book, where }` over a closed eight-book enum**, with `text` the
  optional gloss (`Jordan's lemma`) and the display line composed from `book` + `where`. Composing
  beats storing a third string that could disagree with the two beside it.
- **(0.6) `TAXONOMY_SECTIONS` is the eight groups as a `const` array and `TaxonomySection` its union**,
  so a ninth group is a compile error rather than a dropped record.
- **(0.6) `Golden.label` names a variant derivation; `params` keeps every real binding.**

- **(0.5b-iii) `everySentence` (in `test/helpers/claimsDoc.ts`) is the ONE walk over everything the
  app composes** — the ledger's rows and the derivation's lines and statements — and the review
  document, the `$`-balance check and the KaTeX-strict check all read it. Any future check over the
  corpus goes through it rather than growing its own walk.
- **(0.5b-iii) `renderClaim` decides text-vs-LaTeX at the PLACEHOLDER, by counting the delimiters
  before it.** An argument carrying a `latex` sibling renders bare inside a `$…$` span and wrapped
  outside one. `renderArg` stays notation-free.
- **(0.5b-iii) `HEADLINES` in `vocabulary.ts` names the three headlines that cite no constraint**, so
  the review document reads them instead of holding a copy.

- **(0.4b) `src/kernel/notation.ts` is where the app's two alphabets are decided** — `TEXT` (what it
  has always printed) and `LATEX` — and every exact-value formatter takes one. `kernel/exprLatex.ts`
  holds the expression printer plus the Greek convention, below `families/` so that `engine/` may use
  it too (its second consumer is the ledger's own exact claims). `families/latex.ts` is
  `describe.ts`'s sibling: the target, the contour integrand and the closed form, typeset.
- **(0.4b) `exactValue` carries `latex` alongside `text` on all seven theorems**, from the same
  formatter at `LATEX`. That is how Phase 1's result card gets its typeset `∮`, and why the card and
  the page cannot come to disagree.
- **(0.4a) `katex` is a devDependency of `apps/contour-integration`** — the coverage test renders
  every printed form through `renderToString` with `throwOnError`, because `toLatex` emitting a string
  does not mean KaTeX accepts it. Phase 1 promotes it to a dependency when the shell renders.
- **(0.4a) `sech`, `csch`, `coth` and `factorial` are `@cas/expr` builtins**, each with its evaluator,
  GLSL call, LaTeX form and — for the three hyperbolics — its symbolic derivative. `factorial` is a
  NAME for `gamma(z+1)` in both backends rather than a second implementation. The sandbox can now be
  typed `coth(z)` and see it rendered, which is a product gain the gallery paid for.
- **(0.3) `src/engine/claims.ts` is where the ledger's wording lives**, as 40 templates keyed by id,
  with `renderClaim` the one place a claim becomes text. The boundary the plan draws is recorded in
  its header: a claim minted in `kernel/bounds/*` or `kernel/branch/*` stays a string and reaches a
  row through `certificateClaim`, because it bakes its own numbers in next to the arithmetic that
  produced them and step 0.5 will render it with `$…$` delimiters instead.
- **(0.3) `derivation.ts` needed no change at all.** `lineFromRow` already reads `row.claim`, which
  is now rendered from a template, so every derivation line moves with the ledger for free. A
  `claimData` on `DerivationLine` is step 0.4's to add if it wants LaTeX in the derivation too.
- **(0.1) `Family.closedForm` gains `simplifiedWhen`** — an `@cas/expr` boolean in the family's
  parameters, absent meaning unrestricted. A condition that cannot be decided withholds the general
  form rather than showing it unguarded: the guard exists because an unguarded form was wrong, so
  "could not tell" falls on the side of saying less.
