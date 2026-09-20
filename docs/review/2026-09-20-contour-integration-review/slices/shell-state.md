# Review — the M8 shell's STATE and CONTROL layer (`apps/contour-integration/src/shell/`)

All measurements were taken by mounting the real `mountShell2` under jsdom from a throwaway
`tsx` script (scratch `probe*.mts`), with `getContext` stubbed to `null` and `requestAnimationFrame`
replaced by a hand-drained queue. No repo file was touched. Targeted node suites run and green:
`shell2`, `shell2State`, `shell2Page`, `shell2Drill`, `viewState`, `undo`, `sweep`, `sweepApp`,
`scrub`, `errors`, `stepFocus`, `stepDetail`, `readout`, `drawnArgument`, `onScreenClaims`,
`camera` — 16 files / 403 tests.

### Findings (ordered by severity)

- **[BUG] A running sweep's rAF loop survives a permalink, a contrast cell, a drill rung, an undo and `destroy()` — the two paths STATUS.md names as fixed**
  - Where: `src/shell/app.ts:1112` (`commit`'s `argumentMoved` guard), `src/shell/app.ts:345`
    (`endSweep`'s own doc), `src/shell/app.ts:1409` (`destroy`); doc claim
    `docs/contour-integration/M8/STATUS.md:1357–1367`
  - What: `endSweep()` is the only thing that cancels `sweepFrame`, and `commit` calls it only when
    `next.record/fixture/mode/expr` moved. `resetTransient` nulls `session.sweep`, so `advanceSweep`
    returns at its own guard *before* reaching the `value === null` branch that would call
    `endSweep` — so the loop re-schedules itself every frame, forever. Measured: press Play, then
    Ctrl+Z → `session.sweep` null, `scrubbing` false, and one rAF callback still pending after 10
    further frames (rAF calls 19 → 29 over 10 ticks); same for `applyState` of an
    argument-identical state; and **after `destroy()` the loop is still scheduling** (probe4). The
    retained closure keeps the whole shell (state, resolution, session, DOM) alive.
    STATUS.md §(3.2) states the repair as covering exactly *"Press Play, then Ctrl+Z or open a
    `#vs=` link"*, and the decision being taken "in `commit` from the STATE" is precisely why it
    does not.
  - Confidence: CONFIRMED (measured, probe3 + probe4)
  - Fix: call `endSweep()` from `applyStateNow` and `restore` (beside `resetTransient`/
    `controller?.reset()`) and from `destroy()`. `resetTransient` cannot do it — that is the
    field's own note — so the two callers that reset the session must do it themselves.

- **[BUG] One press of Play leaves FIVE undo entries; Ctrl+Z walks the sweep's own ladder instead of undoing it**
  - Where: `src/shell/app.ts:395` (`advanceSweep`'s full-budget row commit), `src/shell/undo.ts:152`
    (rule 3: `if (why !== "gesture") runOpen = false`)
  - What: the row capture commits `(state, "edit")` mid-animation, which closes the gesture run;
    the next frame's `"gesture"` commit therefore opens a new run and pushes again. Measured on the
    cold start (A6, `R`): one Play press → `undo.length` 0 → **5**, and pressing Ctrl+Z gives
    `R` = 83255.3 → 6931.4 → 577.1 → 48.0 → 4 (probe13/probe14). `undo.ts`'s own rule 6 says a
    drag is worth exactly one entry, and `playSweep`'s comment calls the sweep "a gesture the app
    is making on the reader's behalf". Side effect: ~20 sweeps evict the whole 100-entry history.
  - Confidence: CONFIRMED (measured)
  - Fix: take the row's full-budget resolve without going through `commit` (it changes no state —
    `changeKey` is already `null` for it), or give it a reason that does not close the run
    (`"gesture"` would be wrong for the budget; a dedicated `"resolve"` that `record` ignores is
    the smaller change).

- **[BUG] The pen stays armed when the rail holding its controls is folded — M7.4 finding #1, reopened through a different door**
  - Where: `src/shell/app.ts:829` (`setRail`), `src/shell/app.ts:805` (`setMode`, which folds the
    left rail via `railsFor("worked")`), `src/shell/render.ts:146` (`railOf`: a folded rail draws
    its toggle and its name and nothing else), `src/shell/stageController.ts:962` (Escape is on the
    ink canvas only)
  - What: measured (probe12) — with the pen out, `session.pen !== null` and the Contour card is
    present with `Close / Undo / Cancel`; one click on the rail's fold toggle, or on
    **Worked example**, removes `[data-card="contour"]` from the DOM entirely while `session.pen`
    stays non-null. `pointerdown` still takes the pen's click before any grab test (deliberately),
    so the reader's next click on the stage places a vertex into a path with no visible controls
    and Enter commits it — M7.4's exact sentence. There is no keyboard escape either: `Escape`/
    `Backspace`/`Enter` are bound on the ink canvas, and after clicking the fold toggle focus is on
    the button. M7.4 recorded the rule as "it is put away on leaving the sandbox and on every
    `applyState`"; folding a rail is neither.
  - Confidence: CONFIRMED (measured)
  - Fix: `controller?.penStop()` in `setRail` when the left rail folds and in `setMode` when it
    changes — or, better, make the pen's controls unconditional (a floating chip on the stage), so
    "armed" and "has controls" cannot come apart.

- **[TEST-GAP] `sweepApp.test.ts`'s `applyState` test drives the one branch that cannot have the defect it is named for**
  - Where: `test/sweepApp.test.ts:184` — *"is put away by `applyState`, which is the permalink and
    the undo stack both"*
  - What: it calls `playSweep({ …, stepOnce: true })`, which never enters the rAF branch, then
    asserts `session.sweep === null` and `session.scrubbing === false` — both of which
    `resetTransient` gives for free. The sibling test three lines above says in its own comment
    *"what [`resetTransient`] cannot do is stop the loop"*, and the loop is exactly what this test
    does not exercise. The two tests that DO assert by effect cover `setScrubbing(true)` and
    `setFixture(1)` (which moves the argument) — the two paths that work. Outcome pinned, reason
    not; and the reason is the defect above.
  - Confidence: CONFIRMED (read + reproduced the live failure the test would have caught)
  - Fix: drop `stepOnce`, flush frames, then `applyState(currentState())` and assert the parameter
    stops moving when the clock advances — the assertion style the sibling test already uses.

- **[TEST-GAP] The "both directions, every field" round trip has three ShellState fields identical between its two states**
  - Where: `test/shell2State.test.ts:273`
  - What: the test's premise is *"with every field differing between them — which is what makes each
    field's loss observable rather than mutually cancelling"*, and it asserts `not.toBe` for eight
    fields. Measured by building the same A and B through the app (probe2): the fields identical
    between them are **`contourSource`, `showStep`, `stageMode`** (both `{template:"keyhole",
    shift:[0,0]}`, `null`, `"quiet"`). A `currentState` that forgot any of the three and an
    `applyState` that never read it would pass this test — which is the M6.1 lossy-pair trap the
    test was written to close, surviving in three of twenty fields.
  - Confidence: CONFIRMED (measured)
  - Fix: give B a different template recipe, `stageMode: "textbook"` and `showStep: false`, and add
    them to the `expect(b.X).not.toEqual(a.X)` block so the premise stays checkable as fields are
    added.

- **[STALE-DOC] `app.ts`'s header describes a two-shell world that `main.ts` says is gone**
  - Where: `src/shell/app.ts:1–5`
  - What: *"Reached with `?shell=new`; `src/main.ts` boots the old shell otherwise … At 1.12 this
    directory becomes `src/shell/` and there is one shell again."* Present tense, and false on all
    three clauses: `src/main.ts` has no `?shell=` branch (its own doc says "there is nothing left to
    choose between"), the directory IS `src/shell/`, and the old shell is deleted. This is the first
    thing a reader of the largest file in the slice sees.
  - Confidence: CONFIRMED
  - Fix: past-tense the paragraph, or cut it to the "One door" clause that is still live.

- **[STALE-DOC] Three comments claim `resetTransient` clears the undo stacks; it deliberately does not**
  - Where: `src/shell/undo.ts:15–16`, `src/shell/undo.ts:107`, `src/shell/app.ts:1098–1102`
  - What: `undo.ts` says *"`resetTransient` already empties them"* and *"The stacks live on the
    SESSION, so `resetTransient` keeps clearing them"*; `app.ts` says a link *"clears the stacks
    twice over — once there and once through `record`'s `"link"` rule … belt and braces"*.
    `session.ts:284–290` explains at length why the stacks were REMOVED from that list (clearing
    them in `restore` wiped the redo stack the undo had just filled). Measured (probe19): four
    entries survive a direct `resetTransient(session)` call unchanged; only the `"link"` rule
    clears them. Behaviour is correct; three comments are not, and two of them are in the module
    that owns the policy.
  - Confidence: CONFIRMED (measured)
  - Fix: one line in each — the stacks are cleared by `record`'s `"link"` rule alone.

- **[STALE-DOC] `state.ts`'s premise ("`app.ts` is 2,500 lines reached by no test at all") is twice false**
  - Where: `src/shell/state.ts:3`
  - What: `app.ts` is 1,422 lines, and five node suites reach it (`shell2`, `shell2State`,
    `shell2Page`, `shell2Drill`, `sweepApp`). The paragraph is the file's stated reason for
    existing, so it reads as a live claim rather than as history.
  - Confidence: CONFIRMED
  - Fix: mark it as the state of things at M6.1.

- **[STALE-DOC] `render.ts` describes placeholders that can no longer be reached, and keeps the code for them**
  - Where: `src/shell/render.ts:9–11`, `:57` (`placeholder`), `:82` (`CARDS: Partial<…>`)
  - What: *"At 1.1 the rails hold placeholder cards … Steps 1.4 and 1.5 replace each placeholder
    with a real card"*. All nine ids in `LEFT_CARDS ∪ RIGHT_CARDS` now have an entry in `CARDS`
    (`engine/vocabulary.ts:160,170`), so `CARDS[id] ?? placeholder(id)` never takes the right-hand
    branch and `placeholder` is dead. The `Partial` also removes the compile-time guarantee that a
    newly added `CardId` gets a card — the failure would be a silent `—` placeholder instead.
  - Confidence: CONFIRMED (read; the two id lists and the `CARDS` keys match exactly)
  - Fix: make `CARDS` a total `Record<Exclude<CardId, "drill">, Card>` and delete `placeholder`.

- **[STALE-DOC] `math.ts`'s cache note ("the corpus of formulas is finite and small") is false on the sandbox path**
  - Where: `src/shell/math.ts:17–18`
  - What: `RENDERED` is a module-level unbounded `Map`, and `cards/integrand.ts:90` typesets the
    LaTeX of the reader's own parsed expression, so the key set is user input. Measured (probe5):
    typing one 21-character integrand adds 3 entries; a second adds 6 more; one display formula's
    cached HTML is ~3.3 kB. Slow, but the growth is unbounded and per-tab, not per-shell — the Map
    outlives `destroy()`.
  - Confidence: CONFIRMED (measured)
  - Fix: either say so in the comment, or bound it (an LRU of a few hundred, or key the sandbox
    preview separately and keep only the current one).

- **[STALE-DOC] CLAUDE.md calls `"ci"` "the eight-app idiom"; there are nine other apps**
  - Where: `CLAUDE.md` (M6.2 paragraph); `src/shell/viewState.ts:3` says "nine other apps" and is
    the correct one
  - What: `encodeViewState` is used by 10 apps (`2d-electrostatics`, `2d-hydrodynamics`,
    `argument-principle`, `complex-dynamics`, `complex-function-plotter`, `contour-integration`,
    `faber-transform`, `potential-theory`, `quadrature-domains`, `riemann-map`).
  - Confidence: CONFIRMED (measured by grep)

- **[PERF] Every keystroke in the integrand box is a synchronous FULL-budget solve — 503 ms for one intermediate expression**
  - Where: `src/shell/app.ts:520` (`setExpr: (src) => commit({…}, "edit")`), `src/shell/app.ts:1126`
    (the draft-budget rule reads `session.gesture`/`scrubbing`/`why === "gesture"`)
  - What: typing is never a gesture, so every prefix a reader types is resolved at the full
    quadrature budget on the main thread. Measured on the keyhole template typing
    `1/(1+z^4)/(z^2+2)` (probe6/probe7, warm, best of three runs): per-keystroke commits of
    **684.8, 316.7, 154.5 and 97.8 ms** among 17, total 1,410 ms. Isolating `resolveState`
    (probe8): the intermediate expression `"1"` on the keyhole costs **503.3 ms at the full budget
    against 3.2 ms at `{maxEvaluations: 768}`** — 157×. The app is frozen for half a second on a
    single character.
  - Confidence: CONFIRMED (measured)
  - Fix: treat typing the way the sliders are treated — commit at the draft budget on `input` and
    make one full-budget settle after a short idle (or on blur/Enter), which is exactly
    `setScrubbing`'s existing shape.

- **[IDEA] The envelope's version is never read**
  - Where: `src/shell/viewState.ts:846` (`decodeShell` uses `env.app` and `env.state`, not `env.v`)
  - What: `@cas/interchange`'s own doc says *"the caller checks `app` (and `v`, if it cares)"*.
    Measured (probe18): a hash carrying `{v: 9, app: "ci", …}` decodes **ok**. Harmless today (the
    app has never bumped `v`, and the suite's convention is additive fields), but it means a future
    incompatible payload would be read as v1 rather than refused by name — which is the one thing
    this codec's header says it exists to prevent.

- **[IDEA] `saveFigure`'s promise has no rejection handler**
  - Where: `src/shell/app.ts:781`
  - What: `void figureBytes(theme).then((bytes) => {…})`. The `bytes === null` path is handled
    (`FAILED.drawFigure`), but a THROW inside `figureBytes` — `stageView.plate`, `getComputedStyle`,
    `drawFigure`, `injectPngText` — becomes an unhandled rejection with no notice and no banner
    (the fatal boundary is synchronous around `mountShell2` only). `copyFigure` is covered, because
    the inner rejection propagates through `clipboard.write`'s `.then(ok, fail)`.
  - Confidence: PLAUSIBLE (the jsdom reproduction is masked by jsdom's own `toBlob` stub)
  - Fix: `.then(ok, () => say(FAILED.drawFigure, "⚠"))`.

- **[IDEA] A gallery record that cannot be run draws the parked SANDBOX contour**
  - Where: `src/shell/state.ts:508` (`drawnContour` → `resolution.run?.contour ?? state.contour`)
  - What: in gallery mode `state.contour` is the reader's parked sandbox curve (M6.1's finding). If
    `solveFamily` fails outright (`run === null`, `fatal` set), the stage, `describeStage`'s piece
    count and `sweepRow`'s piece lookup all fall back to it — a plausible picture of a different
    problem beside a card saying the record could not be run. Unreachable with the shipped corpus
    (all 28 run), so this is a latent honesty gap rather than a live defect.
  - Fix: return an empty contour, and let the stage draw nothing.

### Checked and found sound

- `applyState`/`currentState`: `applyStateNow` is `{...next, view: clampView(next.view)}` and
  `currentState` returns the live object, so no field can be dropped by either half; a
  field-by-field codec round trip of a sandbox state with all 20 fields off-default loses nothing
  (probe16, 570-char hash, `step: 4` carried).
- Session fields cleared on `applyState`: `pen`, `held`, `gesture`, `scrubbing`, `hover`,
  `drillGraded`, `step`, `sweep` (the object), `drillAnswers`/`drillDrawn`/`drillPredicted`,
  `notice`, `contrast`, `renaming`, `frontDoorOpen`, `linkRefusal` — all present in
  `resetTransient`; `contrastsOpen`, `open` and `rails` deliberately survive, each with its reason.
- `restore` (undo) clears the same transient half plus `controller.reset()`, keeps the reader's
  camera, and `record` ignores `"restore"` so an undo is not itself an entry.
- Gallery contour as an OUTPUT: a stale snapshot carrying a foreign contour is corrected rather
  than obeyed (`shell2State.test.ts:366` asserts it, and `drawnContour` routes through the run).
- The codec's refusals by name: foreign app, truncated envelope, unknown record, fixture past the
  end, gallery-with-no-record, unknown template, unknown stage mode, unknown comparison, a
  declaration on an absent branch point, unknown drill task/stage, every op shape, every annotation
  shape (probe18 + `errors.test.ts`'s AST sweep of every `reason:` literal in `viewState.ts`).
  `null` (no link) and a named reason are properly distinguished, and the refusal box is
  `role="alert"`, outside `<main>`, and survives subsequent renders (it is drawn from the field on
  every `render2`, not written at its setters).
- Encode-side verification: structural equality with no ops, `sameShape` with ops. Replaying a
  structural edit made BEFORE a parameter move still reproduces the live contour on all ten
  templates (probe10: insert-then-`setParam`, shape match true, piece counts equal, decode ok) —
  `setParam` only writes `contour.params`, and a split holds its FRACTION, so ops and params
  commute exactly.
- Payload sizes, measured on the M8 shell: cold start 102 chars, sandbox default 96, keyhole
  sandbox 358, + declared factor 462, + 6 inserts 774, + 5 roles and 5 long names 1,148 — all well
  inside research 07's ~2 kB warning.
- `dom.ts`: 50 patches of the same keyed button leave exactly ONE handler firing; a duplicate key
  throws by name; a three-child reorder preserves node identity and lands in the right order;
  focus on the integrand `<input>` survives a full recompute + render of bar, both rails and the
  ladder (probe15). The `<select>`-value-after-children second pass and the `aria-*` boolean
  special case are both correct as documented.
- `syncHash`: single 250 ms `setTimeout`, guarded once on `hashReady`, `replaceState` only when the
  hash differs, cleared in `destroy`; the phone notice's address is refreshed even when the state
  cannot be encoded.
- Global listeners: exactly one (`document keydown`, removed in `destroy`); `ResizeObserver`
  disconnected; `controller`/`frontDoor`/`stageView`/`stripView` all destroyed.
- Ctrl+Z routing: skipped in `INPUT`/`TEXTAREA`/`SELECT`/`contenteditable`, and taken by the pen
  while a path is open (measured: undo depth unchanged at 4 with the pen out).
- `scrub.ts`: the anchor is keyed by NODE, not by a closure, so a recompute mid-drag cannot lose
  it; `pointercancel` clears the draft flag; `stopPropagation` keeps one arrow press from also
  advancing the stepper; both endpoints return the declared bound exactly.
- `sweep.ts`'s driver arithmetic: one checkpoint per call, the clock held monotone, `undefined`
  for a frame that moved nothing, endpoints returned exactly.
- `compile`'s probe-at-an-ordinary-point guard for `makeComplexFn`'s lazy structural throws.

### Not covered

- The browser suite (`shell2.browser.test.ts`, `stageMode.browser.test.ts`, `penInk`, `stepInk`…) —
  out of scope per the brief; BUG 3's consequence on the stage (a click placing a vertex with the
  rail folded) is inferred from `stageController.ts`'s documented `pointerdown` order rather than
  reproduced in a browser.
- `stageController.ts`, `stageView.ts`, `strip.ts`, `frontDoor.ts`, `drill*.ts`, `cards/*` — other
  slices.
- Real-browser timings for the per-keystroke cost (PERF 1) — measured under jsdom + tsx, where the
  DOM half is cheap and the arithmetic half (the part that dominates: 503 of 685 ms) is the same
  code a browser runs.
