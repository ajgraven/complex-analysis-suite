# Review — the M8 shell's presentation layer (`src/shell/cards/`, panels, CSS, `index.html`)

### Findings (ordered by severity: BUG > REGRESSION > STALE-DOC > TEST-GAP > PERF > IDEA)

- **[BUG] The exported figure's caption prints raw LaTeX in every sandbox state that closes — on the plate AND in `cas:verdict`**
  - Where: `apps/contour-integration/src/shell/figure.ts:127,131,151` (`verdict: headline`), drawn at `figure.ts:250` (`ctx.fillText(caption.verdict, …)`), stamped at `figure.ts:172`
  - What: `ledgerHeadline` returns `HEADLINES.sandbox` = `"$\\oint_\\gamma f(z)\\,dz$ is established exactly."` whenever a sandbox contour closes with no target (`engine/ledger.ts:1818`). `figureCaption` passes it through untouched; `drawFigure` writes it with `fillText` and `figureMetadata` stamps it. Measured, sandbox `f(z)=1/z` on the default circle: `verdict: "$\\oint_\\gamma f(z)\\,dz$ is established exactly."`, `cas:verdict: "= $\\oint_\\gamma f(z)\\,dz$ is established exactly."`. `math.ts`'s own doc names *"a PNG's text chunk, the accumulator's canvas caption"* as exactly what `mathPlain`/`mathSpoken` exist for, and `figure.ts` uses neither. All 28 records are clean (their headline is `The argument is complete.`), which is why no test sees it.
  - Confidence: CONFIRMED (measured; probe in scratch `probe/p4.mts`)
  - Fix: run `caption.verdict` (and `refused.claim`, which is also a `$…$` engine sentence) through `mathSpoken` in `figureCaption`; add a sandbox case to `figure.test.ts`.

- **[BUG] The Contour card announces 25 distinct accessible names carrying raw LaTeX — M8 step 3.6's defect, still live**
  - Where: `apps/contour-integration/src/shell/cards/contour.ts:319` (also `:233`, `:267`, `:344`, and `title:` at `:322`)
  - What: the status tag's name is `` `${said} — ${mathPlain(piece.name)}` ``. `mathPlain` strips only the `$`; step 3.6 established that an accessible name must go through `mathSpoken` (*"the stepper announced … `the R \to \infty semicircle` — the backslashes read out"*), and `drillPanel.ts:283` and `frontDoor.ts:488` do exactly that for the same strings. Measured over the 28 records at fixture 0: **72 attribute values carry a backslash — 25 `aria-label`, 47 `title`** — e.g. `aria-label="certified — the R \to \infty semicircle"`, `title="the arc: \left|\int f\,dz\right| \le 4.928e-2 at R = 4, and \to 0 as R \to \infty…"`. The `title` is a visible tooltip for a mouse user, and the comment above it ("it is an attribute rather than text, so it is not on screen") is wrong about that.
  - Confidence: CONFIRMED (measured; `probe/p14.mts`)
  - Fix: `mathSpoken` for all four names; for `title`, either `mathSpoken(status.claim)` or drop it (the typeset claim is in the Result card anyway).

- **[BUG] The front door's focus trap cycles through controls in the `hidden` tab panel, so Tab dead-ends in a real browser**
  - Where: `apps/contour-integration/src/shell/modal.ts:38-45` (`FOCUSABLE`, *"No visibility filter. Every control in these dialogs is visible by construction"*) + `frontDoor.ts:562-576` (`syncTabs` hides a panel but never empties it) + `src/ui/shell.css:1254` (`.doorPanel[hidden] { display: none }`)
  - What: `onTab` computes `items = dialog.querySelectorAll(FOCUSABLE)` and calls `items[next].focus()`. The selector does not exclude a `hidden` ancestor. Measured on the mounted front door: **records tab first open — 19 focusables, 0 hidden; Practice tab — 23 focusables, 16 of them inside the hidden records panel; back on Records — 23, 4 inside the hidden practice panel.** `focus()` on a `display: none` element is a no-op in a browser, so Tab stops advancing; on the Practice tab the 16 hidden items sit between the tab strip and the practice list, so Tab from the tab strip stalls immediately. The premise in the comment is false for this dialog because it has two panels.
  - Confidence: CONFIRMED for the DOM shape (measured, `probe/p16.mts`); PLAUSIBLE for the browser stall (jsdom focuses hidden elements, which is why the existing trap tests pass).
  - Fix: filter `focusables()` by `el.closest("[hidden]") === null` (works in jsdom too, unlike `offsetParent`), or have `syncTabs` `patch(panel, [])` the panel it hides.

- **[BUG] B3's own answer is withheld with no sentence saying why — the `note` guard is too narrow**
  - Where: `apps/contour-integration/src/shell/cards/result.ts:312` (`… && solved === null`)
  - What: the note exists because *"the card showed `∮` and left the integral the example set out to determine unmentioned"*. For `jordan-quartic` (both fixtures) Pass 5 returns `solved.value = 1.5442760096181358` with `text` and `latex` both `undefined`, so the solved block at `:167` is skipped (it needs one of them) — and the note is *also* skipped, because `solved !== null`. Measured: the Result card leads with `∮ = (π√2/4 − πi√2/4)·e^{…} + …` and the record's answer appears nowhere on the card. 2 of the 92 (record, fixture) pairs that solve.
  - Confidence: CONFIRMED (`probe/p10.mts`, `probe/p12.mts`)
  - Fix: guard on "no printable solved value" (`solved === null || (solved.text === undefined && solved.latex === undefined)`) and give that case its own sentence.

- **[BUG, minor] The branch-point controls are named by their internal id**
  - Where: `apps/contour-integration/src/shell/cards/cuts.ts:426,439`
  - What: `aria-label: \`order of branch point ${point.id}\`` and `\`remove branch point ${point.id}\``. Measured on the sandbox keyhole: `"order of branch point b1"`, `"remove branch point b1"` — `b1` is the id M6.1's `SINGLE_POINT_ID` bug was about, and the point carries a reader-facing `label` the card typesets two lines above (`mathText(\`$${point.label}$\`)`). The denylist's rendered half reads `aria-label`s but only applies the WORD list to them, so a bare id passes.
  - Confidence: CONFIRMED (`probe/p8.mts`)
  - Fix: `mathSpoken(\`$${point.label}$\`)` in both names.

- **[BUG, minor] The Parameters card prints `R_lim` and `sgnA`, where `paramSymbol` exists to print `R`**
  - Where: `apps/contour-integration/src/shell/cards/parameters.ts:56` (readout) and `:78` (slider name)
  - What: `` `${p.name} = ${fmt(p.value)}` `` uses the raw parameter id. `engine/vocabulary.ts`'s `paramSymbol` maps `R_lim → R` with the reason spelled out — *"Tier B renames its radius `R_lim` … an internal disambiguation … Printing `R_{\mathrm{lim}}` on the step beside it would introduce a second name for one quantity at the one place the two are read together"* — and the derivation's limit step, on screen at the same moment, prints `R`. Measured on `jordan-cosine-kernel`: card text `"a = 1 b = 1 sgnA = 1 derived R_lim = 4 →∞"`, slider names `['a, currently 1', 'b, currently 1', 'R_lim, currently 4']`.
  - Confidence: CONFIRMED (`probe/p7.mts`)
  - Fix: route the readout through `paramSymbol` (typeset, as the tag beside it already is) and the `aria-label` through `mathSpoken`.

- **[STALE-DOC] `parity.md`'s "the contrast grid" section describes a modal and a grid that step 3.5 replaced; none of the counterpart tests it names exist**
  - Where: `docs/contour-integration/M8/parity.md:79-92`, also `:210` and `:261`
  - What: rows claim `contrasts.test.ts › moves focus INTO the dialog on open and RETURNS it to the opener on close`, `› draws the five columns and a row for every ledger row`, `› gives EVERY header cell a non-empty accessible name, the corner included`, `› names every status in text, not in a glyph alone`, `› marks the DECLARED difference apart from a mere rewording`, `› closes on Escape` — the file now contains none of those; its tests are all `the contrast strip — …`. The notes say *"`aria-expanded` is deliberately gone: the control opens a MODAL"*, but `bar.ts:246` sets `aria-expanded` and `contrasts.ts` renders a `<section class="ladder2">` inline. `:210` (*"the ladder is a centred modal mounted on `root`"*) and `:261` (*"the ladder's is a centred modal dialog (`max-width: min(92vw, 68rem)`, `max-height: 88vh`)"*) are false for the same reason. The brief's instruction was to check each "survived" row is still there; these are the rows that are not.
  - Confidence: CONFIRMED
  - Fix: re-port the section against `test/contrasts.test.ts`'s real names, or mark it superseded by step 3.5.

- **[STALE-DOC] Two modules still say the front door is not built**
  - Where: `apps/contour-integration/src/shell/cards/card.ts:206` (*"Declared now and **deliberately inert** … It announces that it is not built rather than doing nothing silently"*) and `src/shell/bar.ts:141` (*"The front door is step 1.8's and `openFrontDoor` announces that it is not built yet"*)
  - What: `app.ts:898` opens the real dialog. Both comments describe the step-1.7 scaffold.
  - Confidence: CONFIRMED
  - Fix: delete the two clauses.

- **[STALE-DOC] `bar.ts`'s `aria-pressed` rationale contradicts `dom.ts`, and two other call sites follow `dom.ts`**
  - Where: `apps/contour-integration/src/shell/bar.ts:39-44` vs `src/shell/dom.ts:148`
  - What: bar.ts says *"`dom.ts` maps a boolean prop to attribute presence … so `aria-pressed: mode === m.id` would leave the two unpressed segments with no `aria-pressed` at all"*. `dom.ts:148` has special-cased `aria-*` booleans since step 1.7 (`if (typeof value === "boolean" && name.startsWith("aria-")) el.setAttribute(name, String(value))`), and `drillPanel.ts:443,495` pass the boolean and are correct. Not a bug — but a reader following bar.ts would "fix" the two correct call sites.
  - Confidence: CONFIRMED
  - Fix: rewrite the note as "dom.ts handles this; the string is redundant", or use the boolean for consistency.

- **[STALE-DOC] `denylist.test.ts` says "fourteen states"; it mounts 43**
  - Where: `apps/contour-integration/test/denylist.test.ts:20`
  - What: `states()` is 1 + 1 + 1 + 28 records + 1 + 2 + 1 + 1 + 1 + 1 + 4 drill stages + 1 = 43, and the test itself asserts `> 38`. Also `frontDoor.ts:156` cites `contrasts.ts`'s `columnHead`, a function step 3.5 removed (it is `caseCard` now).
  - Confidence: CONFIRMED

- **[STALE-DOC / dead code] `result.ts`'s identity line does a `.replace` that can never match**
  - Where: `apps/contour-integration/src/shell/cards/result.ts:220`
  - What: `(theorem.identity ?? RESIDUE_THEOREM_IDENTITY).replace("∮ f dz = ", "")` — every identity in the app starts `$\oint_\gamma f(z)\,dz = …` (`residueTheorem.ts:83`, `exteriorTheorem.ts:74`, `summationTheorem.ts:46`), so the literal never occurs and the LHS is never stripped. Measured on screen: the line reads the whole identity followed by `, from exact residues over ℚ(i)`. Harmless but the code says it intends otherwise.
  - Confidence: CONFIRMED (`probe/p10.mts`)

- **[TEST-GAP] `figure.test.ts`'s corpus gate has a dead `else` branch asserting a string the app never composes**
  - Where: `apps/contour-integration/test/figure.test.ts:148-150` — `expect(meta["cas:verdict"]).toContain(closes ? "The argument is complete." : "does not close")`
  - What: measured, **0 of 28 records fail to close at fixture 0**, so the `else` is never taken. It is also wrong: `ledgerHeadline` never produces the substring `does not close` (its open headlines are `The argument is incomplete.` / `The argument is incomplete: …`). The day a record stops closing this fails for the wrong reason.
  - Confidence: CONFIRMED (`probe/p6.mts`)
  - Fix: assert against `ledgerHeadline(run.ledger)` itself, and drive the open case from a hand-built ledger.

- **[TEST-GAP] Nothing sweeps mounted `aria-label`s for raw LaTeX, and the denylist explicitly exempts them on a premise step 3.6 retired**
  - Where: `apps/contour-integration/test/denylist.test.ts:239-247` (`visibleText()`: *"no accessible names, because those legitimately carry LaTeX … `math()` puts the formula's plain-text form in an `aria-label`, which is the app's convention and is full of backslashes by design"*)
  - What: since step 3.6 `math()` labels with the PLAIN-TEXT twin and puts the source in `data-tex`, so an `aria-label` no longer legitimately carries LaTeX. The exemption is what lets the 25 backslash-bearing names in finding 2 through. `test/spoken.test.ts` sweeps only the stepper's step TITLES, not mounted labels.
  - Confidence: CONFIRMED
  - Fix: extend the `$`/backslash sweep to `aria-label`/`title`/`placeholder` with `mathSpoken` applied, allowing the `$`-free residue.

- **[TEST-GAP] `figureCaption` is never exercised on a sandbox resolution**
  - Where: `apps/contour-integration/test/figure.test.ts` — every caption case is either hand-built or a gallery record
  - What: this is precisely why finding 1 shipped. One `resolveState` on a sandbox state would have caught it.
  - Confidence: CONFIRMED

- **[IDEA] The Result card's `restrictions` are the one engine sentence rendered as plain text**
  - Where: `result.ts:207` — `h("p", …, r)`. Measured: 94 distinct restriction strings across all fixtures, **0** carrying `$` today, so nothing is broken — but every other engine sentence on the card goes through `mathText`, and the card's own comment about the repair line argues for "one rule, one spelling, rather than two lines of the same block disagreeing about the convention the moment [one] grows a `$`". Same argument applies here.

- **[IDEA] `.phoneNotice { min-height: 100vh }` and `.shell2 { height: 100vh }` should be `dvh`**
  - `shell.css:60,1008`. The app is hidden below 900 px so the phone case is the NOTICE, where `100vh` overshoots a mobile viewport with browser chrome and makes a one-paragraph page scrollable. `min-height: 100dvh` costs nothing. (The M7.1 `footer.strip` horizontal-scroll finding is properly CLOSED — the app is `display: none` under 900 px with a notice in its place, recorded at `shell.css:985-1030`.)

- **[IDEA] The `∮` numerics table numbers its pieces `piece 1 … piece n` while every other surface names them**
  - `integrate.ts:283` mints the label and `result.ts:391` prints it. Nothing on screen connects `piece 2` to *the $R\to\infty$ semicircle*. The card already has `run.contour.pieces` in `Facts` (it carries `{id, role}` for `rowKeys`); carrying `name` too would let the table say what the Contour card says. (Good news: no house id leaks — `pieceId` here is the ordinal, not `realAxis`.)

- **[IDEA, pedagogy] Rung iii's menu is drawn from four templates for every task**, so a reader meets the same four options in all four tasks and the discriminating one is always a semicircle. A fifth option that is wrong for a *different* reason each time (the circle is already that for one task) would make the menu a diagnosis rather than a two-way choice.

### Checked and found sound
- **Every typeset formula is valid LaTeX.** Swept all 43-ish states (cold, sandbox, keyhole, declared, 28 records × 3 fixtures, contrasts, front door, 4 tasks × 4 rungs) collecting `data-tex`: **1270 distinct formulas, 0 failures under `throwOnError: true, strict: "error"`, and no `.katex-error` node anywhere.**
- KaTeX XSS surface: `render()` uses the default `trust: false`, so `\href`/`\url`/`\includegraphics` are inert; `throwOnError: false` is the documented deliberate choice and degrades visibly.
- Front-door taxonomy: **28 records, sum of the eight groups = 28, 0 unfiled, 8 front-row entries with `frontRow` 1–8, exactly one per group.** Thumbnails: `thumbnails.test.ts` frames all 28 inside the plate; `drawThumbnail` refuses before its first draw call.
- Honest labelling of the badges: every badge in `result.ts` comes from a verdict (`ledger.verdict.level`, `theorem.verdict.level`, `integral.verdict.level`, `row.evidence.level`) or is the `⚠` that replaces one. `levelOfSolved` vs `figureCaption`'s `assembleVerdict(solved.certificates)` disagree on exactly 2 of 92 fixtures — both where `solved.text`/`latex` are undefined and **neither surface prints the value**, so the two never contradict each other on screen.
- The "no quadrature to compare against" arm: **0 records skip their quadrature at any fixture** (M5.0's own result), so the fabricated `≈ 0.0000000` path is genuinely unreachable, and `figureCaption` refuses to invent one anyway.
- No record's `restrictions` (94), solve `note` (2) or `quadratureSkipped` (0) string carries `$` or a backslash.
- `figureBytes` captures caption, permalink and layout before the first `await` (`app.ts:1033-1059`); `drawFigure` composites stage layers then accumulator then caption; `figureLayout` puts the accumulator at the stage's width (asserted).
- `drillProgress.ts`: versioned key `ci.drill.v2` with a read-only `v1` fallback, total parsing (absence ≡ garbage), monotone `withCleared`, first-answer-wins `withPrediction`, write failures swallowed.
- `drillMask` is one decision with three readers; rung iii masks by drawing an EMPTY piece list (not by skipping the call); `checkDrawing` matches the singular set in both directions (M7.4's vacuous-pass fix is in place).
- Contrast strip: `openContrast` is the three-write action, `changesAt` reads the grid's own `highlight`, `contrastGrid.test.ts` (33 tests) and `contrasts.test.ts` both green; the card prints the record's ANSWER not `∮`, and its only badge (`⚠`) comes from `ledger.closes`.
- `dom.ts` writes `aria-*` booleans as `"true"`/`"false"` (the step-1.7 fix), so both the string and the boolean call sites are correct.
- Theme contrast: dark muted-on-ground **7.29:1**, muted-on-panel **6.72:1**, text-on-ground **15.56:1**; light muted-on-ground **5.92:1**, muted-on-panel **6.29:1**. `FIGURE_THEMES` asserted ≥4.5/≥3 by the suite. `:focus-visible` rings on buttons, inputs, selects, summaries, `.tableScroll` and `.scrub`.
- `prefers-reduced-motion`: the single `@keyframes stepPulse` is the app's only animation and is cancelled under the query (`shell.css:1161`) — the M6.4 "nothing to act on" claim is now correctly superseded rather than stale.
- No CSS `content:` text anywhere, so nothing reaches a reader outside the TS AST's view by that route.
- Slice test files all green: `cards` (62), `derivationCard`, `frontDoor`, `strip`, `bar`, `modal`, `thumbnails`, `figure` (14), `shareCard` — 208 passed; `drill` (39), `drillPanel`, `contrastGrid` (33), `contrasts`, `stepPanel`, `format`, `formatExact`, `formatLatex`, `stepStage`, `denylist` (10), `onScreenClaims` (17) — 181 passed.

### Not covered
- The browser-only behaviour of the focus-trap finding (no Chromium run; the DOM shape is measured, the stall is inferred from `display: none` + `.focus()`).
- `derivation.ts` (749 lines) was read only for its badge sources and the `claimText` `$`-splitting; its stepper/sweep-table internals and `stepDetail`/`stepFocus` were not reviewed in depth.
- `src/ui/shell.css` was read for layout, motion, focus and the phone breakpoint only — not swept rule by rule for dead selectors (`.contrastGrid`, `.cellAnswer` etc. are already gone; I did not audit the rest).
- `STATUS.md` (2,395 lines) and `browser-pass.md` were not read end to end; only `parity.md` was checked row by row for the contrast/ladder section.
