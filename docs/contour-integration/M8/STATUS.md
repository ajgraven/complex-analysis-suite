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
  **Next execution action: step 1.9** (stage modes and the CET-C6 map). The branch may be
  red between 1.1 and 1.12 and must be green at 1.13; it is green now. The look is recorded at
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
  [`1.8-shell2-cold-start-1440x900.png`](screens/1.8-shell2-cold-start-1440x900.png).
- **Last commit:** see `git log -1` on the branch; this file is updated in the same commit as the work
  it describes.

## Done

| date | step | commit | notes |
|---|---|---|---|
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

| 2026-09-16 | **1.8** | 52c4174 · 2b302f7 · 3cd424e · afa49c0 · fbe811a · 7a98e89 · c434fe4 · 602b102 | **`modal.ts`** extracted from `contrasts.ts` on the second-consumer rule, proved a no-op by `contrasts.test.ts` being UNCHANGED across the move; **the front door** (eight `frontRow` cards, eight taxonomy groups building lazily, arrows + Enter, thumbnails injected); **`thumbnails.ts`** (240x110 on the light ground, cache holding the PIXELS because the front row appears twice); and **the cold start on A6**, framed. Four agents in parallel on disjoint files; the review, the sweeps, the browser passes and the gate here. **The plan was wrong in four places and each was measured rather than argued.** (i) *"the app opens on A6"* would have shipped a BLANK BACKDROP: the new shell drew no portrait for any gallery record and had not since 1.3 — 1 distinct colour against the sandbox's 3,556 — and it survived five steps because step 1.7's own rung-iii test read the pixel's ALPHA, which a cleared, opaque canvas satisfies. (ii) The acceptance string *"Hypotheses verified."* exists NOWHERE in the app; A6 says **"The argument is complete."**, and `result.ts` records a decision against that word here. (iii) *"quiet stage"* is 1.9's `stageMode`, which does not exist. (iv) `defaultState` was the wrong lever — `coldStartState` layers on it instead, 121 failures in 16 files become **27 in 3**, and the plan's own next clause (`1/z` on the circle for Sandbox) comes out true for free. Also found: `drawContour` took a theme and read `DARK_INK.pieces` for the strokes (1.61:1 on the light ground against WCAG AA's 3:1; 5.11:1 now), three functions saying *sandbox* that meant *whatever boots*, and `toSandbox` never framing. Sweeps: 17/18 modal, 17/18 thumbnails, 1.8's own PENDING. Axe 0 rules across the cold start, the front door, a group expanded and the sandbox — by hand, since the roster audits default states only. **Note for 1.12:** the roster audits `index.html` without `?shell=new`, so it still measures the OLD shell; when that is deleted its baseline is re-recorded against shell2. Full gate: PENDING |

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
  textbook are one click away. Rationale in plan §4 step 1.9.
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
