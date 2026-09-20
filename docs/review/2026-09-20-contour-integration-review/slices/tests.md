# Test quality — apps/contour-integration/test/ (node suite, 158 entries; `*.browser.test.ts` excluded)

Method: mechanical AST + grep scan over all non-browser specs; close reading of the specs the brief
names; eight throwaway jsdom/tsx probes run from the app dir against the real shell; per-file
`npx vitest run` timings. No repo file was modified (`git status --porcelain` clean).

**Headline: the suite is unusually strong.** No `it.skip`/`.only`/`it.todo`, no `expect()` without a
matcher, no `expect.assertions` misuse, no test whose only assertions are `toBeDefined`/`toBeTruthy`,
no `as any` cast bypassing a checked type, and every hardcoded count I looked at is a deliberate
tripwire with an anti-vacuity clause beside it. The real findings are two places where a rule the
suite states and enforces twice is **violated in a third place that no instrument looks at** — and
one of them puts a house constraint id in front of a reader.

### Findings (ordered by severity)

- **[BUG] `KILL` reaches a reader, in visible text — the denylist's two instruments both miss it**
  - Where: `apps/contour-integration/src/kernel/bounds/wedgeArc.ts:157`; test gap at
    `apps/contour-integration/test/denylist.test.ts:150` (the AST half's directory list) and
    `test/wedgeArc.test.ts:220`
  - What: the refusal composed for a diverging wedge arc ends `"… the wedge cannot be closed this
    way, and the failing constraint is KILL"`. It is the row's `evidence.method`, which
    `shell/cards/derivation.ts:121` renders. Reproduced: sandbox, `wedge` template, integrand
    `exp(z^2)`, the arc's lemma set to the wedge bound (the role `<select>` the sandbox offers) —
    the page's visible text (math nodes removed, exactly `denylist.test.ts`'s `visibleText()`)
    contains `…and the failing constraint is KILL`. Neither half of `denylist.test.ts` can see it:
    the AST half reads only `src/shell/**` and `src/engine/**`, and the rendered half's 43 states
    are all default/successful ones that never declare L6 on a diverging arc. `wedgeArc.test.ts:220`
    asserts `certificate.claim` matches `/diverges/` and never reads `certificate.method` — the
    outcome without the reason.
  - Confidence: CONFIRMED (probe `p12.mts`: `VISIBLE TEXT contains 'KILL'? true`)
  - Fix: reword the sentence (the row already *is* the KILL row); and widen the AST sweep's
    directory list to `src/kernel/**` + `src/families/**` — measured, `src/kernel` has 13 offending
    literals under the denylist's own rules and `src/families` 213 (most of the latter are
    `traps`/`notes` fields that never render, so that half wants the shape rule the ids get).

- **[BUG] Shouted words in the same refusal family also reach the screen**
  - Where: `src/kernel/bounds/linearMinorant.ts:131` (and 11 more in `src/kernel/**`)
  - What: `"the range runs past π/2, where cos ψ < 0 and e^{−κ cos ψ} GROWS — at ψ = π it is
    e^{+κ}."` renders verbatim in the Derivation card for sandbox `exp(-z^2)` on the wedge. Same
    blind spot as above; the denylist's CAPS rule would flag `GROWS` if it read the file.
  - Confidence: CONFIRMED (probe `p13.mts`: `VISIBLE TEXT contains 'GROWS'? true`)
  - Fix: same as above.

- **[BUG] The Contour card announces raw LaTeX — six `aria-label`s built with `mathPlain`, where
  every other module in the shell uses `mathSpoken`**
  - Where: `src/shell/cards/contour.ts:233, 267, 319, 322, 344` (the file imports `mathPlain` and
    not `mathSpoken`); the rule is asserted at `test/contrasts.test.ts:249` and
    `test/drillPanel.test.ts:319` and is untested here
  - What: M8 step 3.6 established that `mathPlain` "strips the `$` and nothing else", added
    `mathSpoken`, and `spoken.test.ts` sweeps the corpus for a leftover backslash. The Contour card
    was not converted, and step 4.3's piece editor then built six more names with `mathPlain`.
    Measured over the real DOM across the 43 denylist states: **45 distinct `aria-label`s and 52
    distinct `title`s carry a LaTeX macro** — e.g. `"delete the R \to \infty circle"`,
    `"rename the \varepsilon \to 0 circle"`, `"what the R \to \infty circle is for"`,
    `"certified — the R \to \infty semicircle"`. 25 of the 57 piece names in the corpus + templates
    (44%) carry a macro that `mathPlain` leaves in; `mathSpoken` renders all 25 correctly
    (`"the R to infinity circle"`, `"the epsilon to 0 circle"`). `drillPanel.ts:283` builds the
    *identical sentence* (`what ${…} is for`) with `mathSpoken` and says in a comment why.
  - Confidence: CONFIRMED (probes `p4.mts`, `p6.mts`)
  - Fix: `mathPlain` → `mathSpoken` at those five call sites; add the `not.toContain("\\")`
    assertion `contrasts.test.ts` and `drillPanel.test.ts` already carry.

- **[BUG] `title: mathPlain(status.claim)` — the comment beside it is wrong on both halves**
  - Where: `src/shell/cards/contour.ts:320-322`
  - What: the comment says *"A pointer can have the sentence; it is an attribute rather than text,
    so it is not on screen and not in the accessible name either."* A `title` **is** rendered by the
    browser as a visible tooltip, and it **is** in the accessibility tree (as the accessible
    *description* where an `aria-label` is present). The content is a certified bound's LaTeX:
    `"the arc: \left|\int f\,dz\right| \le 4.928e-2 at R = 4, and \to 0 as R \to \infty, since
    \deg Q - \deg P = 4 \ge 2 makes the bound O(R^{-3})"` — 52 such titles measured. This is exactly
    what `denylist.test.ts:363` ("puts no `$` and no backslash on screen") exists to stop, and its
    instrument is `visibleText()`, which reads text nodes only and never an attribute.
  - Confidence: CONFIRMED (probe `p4.mts`, attribute breakdown `[aria-label 45] [title 52]`)
  - Fix: drop the `title` (the typeset sentence is already in the Result card, which the comment two
    lines above says is where a reader goes for it), or run it through `mathSpoken`; and extend the
    `$`/backslash sweep to `aria-label`/`title`/`alt`/`placeholder`, which `onScreen()` already
    collects for the word rules.

- **[TEST-GAP] `test/spoken.test.ts`'s docblock claims more coverage than it has**
  - Where: `test/spoken.test.ts:3` ("**Every NAME this app speaks, over the whole corpus**"); the
    sweep is `everyTitle()` at :34, which reads `argumentOf(...).steps[].title` only
  - What: the corpus sweep covers the stepper's step titles and nothing else. Every other accessible
    name in the app is out of scope, which is why the 97 LaTeX-bearing names above are green. The
    test pins the outcome (the stepper is clean) without pinning the reason (that every name goes
    through `mathSpoken`).
  - Confidence: CONFIRMED (reading + the probe above)
  - Fix: add a DOM sweep — mount, collect every `aria-label`/`title`, require no `\` — which is 15
    lines and would have caught all four bugs above. (`denylist.test.ts` already mounts 43 states
    and collects those attributes; the assertion is the only missing part.)

- **[TEST-GAP] `pieceEditor.test.ts` finds the seven piece tools by `startsWith(label)`, so the
  half of the name that is broken is never read**
  - Where: `test/pieceEditor.test.ts:49-54`
  - What: `toolIn` matches `aria-label` with `startsWith("delete")` etc. The LaTeX tail is the part
    that is wrong, and no assertion in the file touches it. Classic outcome-without-reason: the
    control is found, its name is never judged.
  - Confidence: CONFIRMED
  - Fix: assert the full name against `\`what ${mathSpoken(piece.name)}\`` the way
    `drillPanel.test.ts:334` does.

- **[TEST-GAP] `shell2State.test.ts`'s "both directions, EVERY field" pair does not differ in three
  fields, so their loss on a round trip is invisible to it**
  - Where: `test/shell2State.test.ts:273-360`
  - What: the test's own premise is *"with every field differing between them — which is what makes
    each field's loss observable rather than mutually cancelling"* and it asserts eight explicit
    `not.toBe` pairs. `ShellState` has 20 fields; `stageMode`, `showStep` and `contourSource` are
    identical in `a` and `b` (both inherit the default / the sandbox's keyhole recipe), so a
    `currentState` that forgot one and an `applyState` that never read it would pass — M6.1's own
    consistently-lossy trap, one level down. Not a live defect: all three are covered by
    `viewState.test.ts:298-355` and `shell2.test.ts:1866` through different routes.
  - Confidence: CONFIRMED (field-by-field read of the constructed pair against `src/shell/state.ts`
    `ShellState`)
  - Fix: add `stageMode`, `showStep` and `contourSource` to the differing set and to the `not.toBe`
    block.

- **[TEST-GAP] `onScreenClaims.test.ts:122` swallows a non-evaluating general form and carries on**
  - Where: `test/onScreenClaims.test.ts:118-124`
  - What: `catch { continue; }` skips any `general` form that will not evaluate, on the stated
    grounds that D4/D5 state relations in words. But the skip is unbounded — if a record whose
    general form *does* evaluate today stopped evaluating, the test would silently stop checking it
    rather than fail. The file knows this pattern (its sibling at :101 collects into `wrong` instead).
  - Confidence: PLAUSIBLE (reading; I did not build the regression)
  - Fix: count the skips and pin the count, or require the skipped ids to be exactly the declared
    `simplifiedWhen`/prose set — the same shape `latexCoverage.test.ts:121` uses for `PROSE_SIMPLIFIED`.

- **[STALE-DOC] `denylist.test.ts`'s own numbers are three milestones out of date**
  - Where: `test/denylist.test.ts:20`, `:290`, `:335`
  - What: ":20 — *"mounts the app across fourteen states"*; measured 43. ":335 — *"mounting the app
    forty-one times takes fifteen seconds"*; measured 43 mounts, 39.84 s of collection. ":290 says
    *"Eleven of the twenty-eight carried a shouted word"* then *"would have found two of the
    thirteen"* in the next clause.
  - Confidence: CONFIRMED (probe `p1.mts` prints `STATE COUNT: 43`; timing below)
  - Fix: derive the sentence from `states().length`, or just correct the three numbers.

- **[PERF] `denylist.test.ts` spends 39.8 s of its 42.2 s in COLLECTION, before any test runs**
  - Where: `test/denylist.test.ts:334` (`const swept = states().map(...)` inside the `describe` body)
  - What: measured `Duration 42.15s (transform 1.87s, collect 39.84s, tests 1.39s)`. Vitest runs a
    `describe` body during collection, so the 43 mounts are paid up front — `-t` cannot filter them,
    and the cost does not appear against any named test. Same shape at `ledgerDump.test.ts:24`
    (`const dump = dumpCorpus()` at module scope: `collect 14.29s, tests 13ms`), where it is
    deliberate and documented. The `denylist` one is 2.7× its own comment's budget.
  - Confidence: CONFIRMED
  - Fix: move the sweep into a lazily-memoised function called from the first `it`, so the work is
    attributed and filterable. (The five slowest files are `shell2` 77.6 s, `sweepApp` 67.4 s,
    `cards` 55.6 s, `denylist` 42.2 s, `familyGolden` 26.5 s; then `ledger` 25.1 s, `viewState`
    23.3 s. Nothing in the `piLower()` class — no file is slow because of recomputed exact
    arithmetic; the four mount-heavy jsdom files are slow because they mount the app 20–60 times.)

- **[IDEA] The Target card's accessible name is the record's ASCII source, not prose**
  - Where: `src/families/describe.ts:39` (`targetText`), pinned as intended at `test/cards.test.ts:698`
  - What: the Target formula's `aria-label` is `"∫ (0 → 2*pi)  1/(a + b*cos(theta))  dtheta"` and,
    with the value, `"… = 2*pi/sqrt(3)"`. A screen reader says "two star pi", "d theta", "sqrt of
    three" beside a typeset `2π/√3`. `targetText`'s docblock calls this "the spoken form", so it is
    a decision rather than an oversight — but it is the one place in the app where the spoken form
    is source syntax, and `cards.test.ts:698` pins `toContain("= 2*pi/sqrt(3)")`, so the decision is
    now load-bearing. Worth revisiting alongside the `mathSpoken` fix above.
  - Confidence: CONFIRMED (probe `p2.mts`/`p3.mts`: the string is the `aria-label` of the
    `role="math"` span; `visibleText()` does not contain it)

### Checked and found sound

- Mechanical sweep: zero `it.skip`/`it.todo`/`describe.skip`/`.only`/`xit`; zero `expect()` without
  a matcher (TypeScript AST scan over all 141 non-browser specs); zero `expect.assertions`; zero
  `toBeGreaterThan(0)` as a sole pin; the two `as any` hits are in comments, not casts.
- Three `it()`s with no literal `expect` (`kernelResidue.test.ts:74`, `logResidue.test.ts:179,185`)
  all assert through a named helper — legitimate.
- Every `try/catch` in a test collects into a failure list (`records.test.ts:96`,
  `familyLatex.test.ts:18`, `onScreenClaims.test.ts:101`) except the one filed above.
- Hardcoded counts are deliberate tripwires with anti-vacuity clauses: `28` records
  (`tierEFG:22`, `arcBoundEvaluated:88`, `shareCard:310`, `contrast:62`, `steps:57`,
  `viewState:100`, `shell2State:243`), `79`+ fixtures, `10` variant labels (`records:120`),
  `256` CET-C6 entries, `1` import (`imported:39`).
- `familyGolden.test.ts` — pins the closed-form **text** for all 28 (`EXPECTED`, with `undefined`
  for B3 and a covers-every-record guard), the refusing fixtures by refusal *reason*, R-independence
  both ways (including the tier-G inversion, with the family lists spelled out so the filters cannot
  silently empty), and A6's closing-down trap with the enclosed-pole anti-coincidence clause.
- `ledgerDump.test.ts` — 592 kB byte-for-byte baseline over 28 records × 79 fixtures, with a
  per-tag (`R/D/P/T/S/H`) presence floor so an emptied dump cannot compare equal to itself.
- `ledger.test.ts` — refusals pinned by claim *and* by `claimData.template` *and* by provenance
  `ok` flags; the "no invariance sentence about an empty cut set" case is real.
- `crossCheck.test.ts` — the wiring is break-tested with a getter that answers differently on the
  second read; relative-vs-absolute tolerance pinned in both directions.
- `viewState.test.ts` — verdict-level round trip (closed form, exact value, and every row's
  constraint/status/level/claim) into a FRESH default, 94+ fixtures; refusals pinned by reason as
  well as by outcome after the M6.2 `dec-template` finding; `showStep`/`stageMode` tri-state and
  enum round trips covered explicitly.
- `declaredSide.test.ts` — all four claims live, including the >10× gap ratio, the verdict-level
  consequence (`agrees false`, `verdict ⚠`, `crossCheck undefined`) and the 4× accumulation-trail
  ratio; `sideResolves` asserted in both cut directions.
- `contrastGrid.test.ts` — declared difference sets checked in both directions, incidental rows
  forbidden from being status changes, the failing first-appearance ordering implemented in the test.
- `g1g3.test.ts` — a wrong declaration is shown to stop `solveFamily`, not just the checker, and the
  loader-drop cases are pinned by message.
- `drill.test.ts` — the wedge false-friend, the four templates that stopped being false friends, the
  second right answer at `a = 0`, and rung iv's enclosure sign are all measured rather than declared.
- `spoken.test.ts`, `contrasts.test.ts`, `drillPanel.test.ts` — each carries the right assertion
  (`mathSpoken` equality, `not.toContain("\\")`) with an explicit anti-vacuity clause; the rule is
  correct, it is only the Contour card that escaped it.
- `undo.test.ts` — `changeKey` tested against a reordered state object and against a `Frac`-bearing
  branch that `JSON.stringify` throws on; commit shapes taken from the real call sites.
- `claims.test.ts` / `claimsDoc.test.ts` — all 40 templates pinned, the 20 the corpus cannot reach
  spelled out byte for byte, and `REPAIRS` checked to still be present in `engine/ledger.ts`.
- Test helpers and fixtures: all six helpers and the one fixture are live; nothing stale.
- All 25 test files I executed passed on the clean tree (595 tests).

### Not covered

- `*.browser.test.ts` (another agent's slice).
- I did not read every one of the 141 non-browser specs line by line: the mechanical scan covered
  all of them, the close read covered the ~30 the brief names plus `spoken`, `contrasts`,
  `claims*`, `records`, `latexCoverage`, `wedgeArc`, `steps`, `undo`, `contourEdit`, `pieceEditor`.
- `PROPOSED` in `test/helpers/claimsProposals.ts` is checked for rule-compliance and (via `REPAIRS`)
  for having been applied, but the `PROPOSED` map itself is not checked to have reached the code the
  way `REPAIRS` is. I did not determine whether that is intended; worth one look.
- No mutation sweeps (src is read-only for this pass), so the gaps above are the ones reading and
  probing found, not a measured survivor rate.
