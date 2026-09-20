# Slice: documentation staleness — Contour Integration

Tree: clean at `5ebfa54` (ADR-0044), verified with `git status --porcelain` (empty). Every number
below was measured against that tree, not remembered.

### Findings (ordered by severity: BUG > REGRESSION > STALE-DOC > TEST-GAP > PERF > IDEA)

No BUG or REGRESSION found in this slice — the code all backs its live claims; what follows is
documentation and code-comment drift.

---

- **[STALE-DOC] The repo-wide test census is wrong in CLAUDE.md and the root README, and HEAD's own commit message says so**
  - Where: `CLAUDE.md:100`, `README.md:46`
  - What: CLAUDE.md: *"Green is **593 test files / 6649 tests** with lint and typecheck silent."*
    README: *"The whole workspace is green (**6649 Vitest tests** across 593"*. Measured two ways:
    (a) the green `--reporter=json` artefact at the repo root reports **592 files / 6643 tests,
    0 failed, `success: true`**; (b) counting collectible spec files independently (all `*.test.*`
    under `packages/` + `apps/` minus browser specs minus QD's 30 uncollected `app/test/*` files)
    gives 593 candidates, one of which is `apps/quadrature-domains/vitest/__snapshots__/
    algebra-sidebar-html.test.ts.snap` — a snapshot, not a spec — so **592**. HEAD's own commit
    message (`git show 5ebfa54`) states *"Green: 592 files / 6,643 tests"*, and the commit touched
    both files without updating the census line.
  - Confidence: CONFIRMED
  - Fix: `593 → 592`, `6649 → 6643` in both files.

- **[STALE-DOC] "845 interactive nodes across 20 pages" is superseded by 682, measured in the very commit that is HEAD**
  - Where: `CLAUDE.md:1327`, `apps/contour-integration/README.md:861`, `docs/contour-integration/PLAN.md:987` (M8 gate block)
  - What: CLAUDE.md: *"`scripts/a11y-audit.mjs` **now** walks each page's accessibility tree beside
    axe — **845 interactive nodes across 20 pages, 0 unnamed**"*; the app README: *"845 across the
    whole suite"*. ADR-0044 (`docs/DECISIONS.md:4200`, and `git show 5ebfa54`'s message) measured the
    removal at **792 → 682 interactive nodes**, *"eleven per page … across the ten audited pages that
    carried the bar, 10 × 11 = 110"*. So the live number is 682, not 845 — and the 845/792 pair is
    itself inconsistent by 53 between M8 step 5.2 and ADR-0044 N5, which nothing reconciles.
  - Confidence: CONFIRMED (from the two committed measurements; I did not re-run `pnpm a11y`, which
    needs 20 built dists + Chromium)
  - Fix: re-run `node scripts/a11y-audit.mjs --strict` once and write the one number into all three
    places, or drop the total and keep only the per-contour-page figures (57/71/50/54), which ADR-0044
    did not move.

- **[STALE-DOC] PLAN.md still defers "prediction prompts" out of v1 — M8 step 3.4 shipped one, and the a11y roster audits it**
  - Where: `docs/contour-integration/PLAN.md:1010` (Deferred), `:451` (§5.2), `:928` + `:1088` (§7 M7 scope, §12)
  - What: PLAN §7 *Deferred (explicitly out of v1)*: *"… prediction and self-explanation prompts …"*,
    and §5.2 closes *"§7's round-3 scoping takes two of them: contrasting triads and fading, **without
    the prompts**"* — with PLAN's own M8 note at §5 saying *"§5.2 … stand[s]"*. But the prediction is
    built and shipped: `apps/contour-integration/src/shell/drillPanel.ts:389` (*"The prediction comes
    FIRST, and the menu does not exist until it is answered — M8 step 3.4"*), `predictionRows` /
    `data-predict-option` at `:422`/`:442`, and `scripts/a11y-audit.mjs:208` audits it as its own
    roster entry `contour-integration-predict` guarded by `[data-card="drill"] [data-predict-option]`.
    M8-plan.md §3.4 specifies it; nothing in PLAN.md records the reversal. CLAUDE.md:637 repeats
    the old scope (*"M7's scope excludes prose, prediction prompts and self-explanation prompts on
    the record"*) without noting M8 took one on.
  - Confidence: CONFIRMED
  - Fix: strike "prediction" from PLAN §7's deferred list and add a one-line note at §5.2 and §7 M7
    saying M8 step 3.4 took exactly one, forced-choice, graded from the ledger.

- **[STALE-DOC] CLAUDE.md's "Getting set up" still describes QD's maths suite as one wrapper spec around `node app/node-test.js`**
  - Where: `CLAUDE.md:101-103`
  - What: *"the Quadrature-Domains maths runs as a separate headless runner wrapped as one Vitest
    spec (`node app/node-test.js`)"*. Measured: `apps/quadrature-domains/vitest.config.ts`'s own
    header says *"Refactor Stage B1 runs each file as its OWN Vitest spec under `vitest/node/` (via
    `vitest/node/_run.ts`) … **replacing the earlier single serial wrapper that spawned
    `node app/node-test.js`** (finding QD-TEST-1)"*. There are **29** specs under
    `apps/quadrature-domains/vitest/node/`, and QD collects **165** spec files in total (per the
    census JSON). The same stale sentence is in `vitest.workspace.ts`'s header comment
    (*"wrapped in a single Vitest spec"*).
  - Confidence: CONFIRMED
  - Fix: one sentence — QD's `app/test/*.test.js` files run as 29 per-file specs under `vitest/node/`;
    `app/node-test.js` is kept for standalone runs.

- **[STALE-DOC] The browser-config paragraph understates contour-integration, and the app's own config comment is now false**
  - Where: `CLAUDE.md:107-112`; `apps/contour-integration/vitest.browser.config.ts:13-23`
  - What: CLAUDE.md: *"contour-integration reads `CAS_CHROMIUM_EXECUTABLE`, quadrature-domains probes
    `/opt/pw-browsers/chromium`, and complex-dynamics and `packages/gpu` take both in that order."*
    Measured across all six configs: contour-integration **takes both** (`CAS_CHROMIUM_EXECUTABLE ??
    existsSync("/opt/pw-browsers/chromium")`, lines 25-27), as do complex-dynamics and `packages/gpu`;
    quadrature-domains probes only; complex-function-plotter and `packages/schwarz` take neither. So it
    is three-both / one-probe / two-neither, not one-env / one-probe / two-both.
    Separately, contour-integration's own config still says **"ONE LINE THE OTHER THREE DO NOT HAVE"**
    and *"The other three configs could take the same line and would be better for it"* — but
    `apps/complex-dynamics/vitest.browser.config.ts:19` and `packages/gpu/vitest.browser.config.ts:18`
    both now carry it and both cite *"apps/contour-integration's line"*. Two of the three took it.
  - Confidence: CONFIRMED
  - Fix: correct CLAUDE.md's three-way split; in the app config, change the claim to "two of the other
    five have since taken this line; complex-function-plotter and `packages/schwarz` have not".

- **[STALE-DOC] The repo-root ESLint `no-shadow` rule justifies itself with a closure that no longer exists**
  - Where: `eslint.config.js:70-88`
  - What: *"`apps/contour-integration/src/shell/app.ts` holds its whole state — `branch`, `contour`,
    `mode`, `input` — as `let` bindings in one module closure"*. Measured: `app.ts` has exactly three
    `let` bindings (`state: ShellState`, `compiled`, `resolution`, lines 125-127); `branch`, `contour`,
    `mode` and `input` are fields of `ShellState` and have been since M6.1, and the M8 rebuild kept
    that. The rule and the M5.1 finding behind it are still worth keeping; the present-tense premise
    is false.
  - Confidence: CONFIRMED
  - Fix: reword to the past tense ("held … until M6.1 lifted them into `ShellState`") and keep the
    rule with its reason.

- **[STALE-DOC] `scripts/a11y-audit.mjs` justifies three roster entries by a nav header ADR-0044 deleted**
  - Where: `scripts/a11y-audit.mjs:78-79`
  - What: *"The three ADR-0036 apps carry the shared nav header (mountNavHeader) + the @cas/ui
    canvas/boundary a11y, so all their pages are audited here."* `mountNavHeader` and
    `packages/ui/src/nav.css` were deleted in HEAD (`git show 5ebfa54 --stat`); repo-wide,
    `mountNavHeader` survives only in comments and in `packages/ui/src/index.ts:5`'s historical note.
    The roster entries are still right; the reason given for them is not.
  - Confidence: CONFIRMED
  - Fix: drop the nav clause; the `@cas/ui` canvas/boundary half still justifies the entries.

- **[STALE-DOC] Three deleted spec files are still cited as the live evidence for met gates**
  - Where: `docs/contour-integration/PLAN.md:903` (M6 note), `:942` (M7 gate note), `CLAUDE.md:466`, `CLAUDE.md:599`, `apps/contour-integration/README.md:712`
  - What: `test/shell.test.ts`, `test/pen.test.ts` and `test/drillShell.test.ts` were **deleted at the
    M8 cutover** (`git show f318fe8 --diff-filter=D --name-only`; `M8/parity.md` says so explicitly and
    is the correct record). They are still named as current evidence:
    PLAN M7 gate — *"a hand-drawn contour closes … (`test/pen.test.ts`)"*;
    PLAN M6 — *"carrying `test/shell.test.ts`, the first test to reach `src/shell/app.ts`"*;
    CLAUDE.md:599 — *"the four structural invariants … **are asserted in `test/shell.test.ts`, which
    blocks**"*. The assertions survived — the four invariants are in
    `apps/contour-integration/test/shell2Page.test.ts:401-405` (`querySelectorAll("main")` /
    `("h1")` both length 1), and the drawn-contour gate is `test/drawnArgument.test.ts` — so this is
    a pointer defect, not a lost behaviour. `test/shell.test.ts` now exists only in
    `apps/complex-dynamics/`, so a reader following the path lands in a different app.
  - Confidence: CONFIRMED
  - Fix: repoint to `shell2State.test.ts` / `shell2Page.test.ts` / `drawnArgument.test.ts`, per
    `M8/parity.md`'s own rows. CLAUDE.md's blanket M8 caveat covers "the SCREEN", not file paths.

- **[STALE-DOC] `test/denylist.test.ts`'s own comments say 14 and 41 states; the sweep runs 43**
  - Where: `apps/contour-integration/test/denylist.test.ts:20`, `:333`
  - What: line 20 — *"It mounts the app across **fourteen** states"*; line 333 — *"mounting the app
    **forty-one** times takes fifteen seconds"*. Counted from `states()` (lines 274-330):
    3 fixed + 28 records (`loadFamilies().families.keys()`) + 1 declared + 2 empty + 4
    (worked / front door / contrasts / practice chooser) + `DRILL_STAGES.length` = 4
    (`src/shell/drill.ts:78` = `[1,2,3,4]`) + 1 graded = **43**. CLAUDE.md's M8 paragraph ("across
    43 states") is the one that is right.
  - Confidence: CONFIRMED
  - Fix: both comments → 43 (and re-time the fifteen-second claim if it is quoted again).

- **[STALE-DOC] Two browser specs claim `src/main.ts` loads four stylesheets; it loads one, and there are three**
  - Where: `apps/contour-integration/test/penInk.browser.test.ts:24`, `test/figureInk.browser.test.ts:16`
  - What: *"this file loads the stylesheets `src/main.ts` loads — **FOUR of them** since step 1.12,
    `app.css` having gone with the old shell"*. Measured: `src/main.ts` imports exactly one stylesheet
    (`katex/dist/katex.min.css`); `index.html` links `./src/ui/theme.css` and `./src/ui/shell.css`.
    The tests themselves import **three** (`penInk.browser.test.ts:57-59`). So the count is wrong and
    so is the attribution — two of the three come from `index.html`, not from `main.ts`.
    `figureInk.browser.test.ts:16` says *"all four of them"* likewise.
  - Confidence: CONFIRMED
  - Fix: "the three stylesheets the page loads — one from `main.ts`, two from `index.html`".

- **[STALE-DOC] GALLERY.md §5 still states the tier-D quadrature cross-check is skipped**
  - Where: `docs/contour-integration/GALLERY.md:241-246`
  - What: *"And **the quadrature cross-check is SKIPPED for all seven**, by an explicit decision the
    run reports rather than by omission … Tiers A–C are corroborated by an independent numeric route
    and tier D is not"*, with the correction one paragraph later (*"it is now closable rather than
    structural … See §5.2"*, and §5.2 is headed *"closed in M5.0"*). M5.0 closed it: `src/engine/
    branchTheorem.ts:165` calls `checkAgainstQuadrature` unconditionally, with the comment at `:156`
    *"THE CROSS-CHECK, WHICH THIS ROUTE COULD NEVER HAVE (M5.0). The quadrature was skipped for…"*.
    A reader who stops at §5 takes away the opposite of what the engine does.
  - Confidence: CONFIRMED
  - Fix: change the §5 sentence to past tense and keep the §5.2 pointer.

- **[STALE-DOC] The jsdom census says 34 Quadrature-Domains specs; there are 33**
  - Where: `CLAUDE.md:102-107`
  - What: *"**34 Quadrature-Domains** specs, **23 Contour-Integration** ones … and **3
    Complex-Dynamics** ones"*. Measured (first line of each file must be the docblock, which is what
    CLAUDE.md itself states): CI **23** ✓, CD **3** ✓, QD **33**. Thirty-four files under
    `apps/quadrature-domains/vitest/` contain the docblock, but one is
    `vitest/_algebra-mount.ts` — a shared mount helper, not a collected spec, and its docblock is on
    **line 10**, where Vitest does not read it. The other 33 all have it on line 1.
  - Confidence: CONFIRMED
  - Fix: `34 → 33`.

- **[STALE-DOC] `ci.yml` has three jobs; two documents say two**
  - Where: `docs/ARCHITECTURE.md:377`, `CLAUDE.md:60`
  - What: ARCHITECTURE §8: *"There are **two** workflows: `ci.yml` (jobs `build` + `browser`)"*;
    CLAUDE.md decision 11: *"There are **two** workflows: `ci.yml` (the `build` + `browser` gate)"*.
    Measured: `.github/workflows/ci.yml` defines `build:` (46), `browser:` (131) and **`a11y:` (187)**.
    Both docs describe the a11y job correctly elsewhere, so this is a stale enumeration rather than a
    missing fact. (The "two workflows" half is right — there are exactly two files.)
  - Confidence: CONFIRMED
  - Fix: "jobs `build` + `browser` + the non-blocking `a11y`".

- **[STALE-DOC] `apps/contour-integration/package.json` calls itself the fifth app**
  - Where: `apps/contour-integration/package.json:6`
  - What: *"… **Fifth app in the suite**; rides the shared `@cas/*` packages."* There are 12 tool apps
    plus the launcher (`ls -d apps/*/` = 13); the root README calls Contour Integration the eleventh
    published app, and CLAUDE.md lists it eleventh. The string is also the one npm/pnpm shows.
  - Confidence: CONFIRMED
  - Fix: drop the ordinal, or say "the eleventh published app".

- **[STALE-DOC] `.claude/launch.json` is described as one entry per app; it has four**
  - Where: `CLAUDE.md:114-115`
  - What: *"Dev servers go through `.claude/launch.json` (**one entry per app**, each with its port)"*.
    Measured: the file has four configurations — `qd-esm` (5199), `cd-esm` (5188), `corr` (5176) and
    `contour` (5177) — against 12 tool apps. The `contour` entry itself is correct: port 5177 matches
    `apps/contour-integration/vite.config.ts`'s `server: { port: 5177, strictPort: true }`.
  - Confidence: CONFIRMED
  - Fix: "one entry per app that has one" or add the missing eight.

- **[STALE-DOC] Two spec comments still cite deleted specs as live**
  - Where: `apps/contour-integration/test/drillPanel.test.ts:6`, `test/thumbnails.test.ts:398`
  - What: `drillPanel.test.ts` — *"`drillShell.test.ts` pins the OLD shell's masks"* (present tense; the
    file was deleted at the cutover). `thumbnails.test.ts` — *"house idiom (`shell.test.ts` stubs the
    same method to null)"*, pointing at a file that no longer exists in this app. Both are pointers a
    reader would follow and find nothing.
  - Confidence: CONFIRMED
  - Fix: repoint at `shell2Drill.test.ts` / `shell2.test.ts`, or mark as historical.

- **[STALE-DOC] Two small counts in CLAUDE.md's narrative paragraphs are now wrong**
  - Where: `CLAUDE.md:491`, `CLAUDE.md:466` / `docs/contour-integration/PLAN.md:959`
  - What: (a) *"namespace `"ci"`, the **eight-app idiom**"* — measured, ten apps import
    `encodeViewState`/`decodeViewState` (2d-electrostatics, 2d-hydrodynamics, argument-principle,
    complex-dynamics, complex-function-plotter, contour-integration, faber-transform,
    potential-theory, quadrature-domains, riemann-map), which `src/shell/viewState.ts:3`'s own header
    already states correctly as *"nine other apps"*. (b) *"`src/shell/app.ts` is **2,511 lines**
    reached by nothing"* / PLAN's *"2,511 lines reached by ZERO tests"* — `wc -l src/shell/app.ts` is
    **1,422** after the M8 rebuild (the old one was 3,700 per `M8/STATUS.md` step 1.12), and it is now
    reached by `test/shell2*.test.ts`. Both are historical narrative, but neither is marked as such.
  - Confidence: CONFIRMED
  - Fix: "the ten-app idiom"; and date the 2,511 to M6.1 / the pre-M8 file.

- **[STALE-DOC] ADR-0043's Consequences still assume a nav header**
  - Where: `docs/DECISIONS.md:4003`
  - What: *"The `@cas/ui` nav header stays hard-coded dark; a full light theme is deferred (plan P3)."*
    ADR-0044 deleted the header. DECISIONS marks the *related* items (`:1518` ADR-0016 AI-5 as MOOT,
    `:2993` U7 as WITHDRAWN) but not this bullet, so the one ADR a reader opens for the M8 shell
    carries an unmarked consequence about a component that is gone.
  - Confidence: CONFIRMED
  - Fix: strike the bullet or append "(moot — ADR-0044)".

- **[STALE-DOC] Four per-app design plans still describe adopting the withdrawn nav header, unmarked**
  - Where: `docs/design/hele-shaw-flow-plan.md:57`, `docs/design/potential-theory-plan.md:54`, `docs/design/2d-hydrodynamics-plan.md:47,67`, `docs/design/2d-electrostatics-plan.md:60`, `docs/design/complex-potential-studio-plan.md:51,65,282`
  - What: e.g. potential-theory — *"**PT-1 — the shell (done, ADR-0036 stage 3).** The shared
    `mountNavHeader` (`@cas/ui`) + `@cas/ui/nav.css` …"*; 2d-hydrodynamics — *"**The shell** —
    `@cas/ui` (`mountNavHeader` + …)"* and a wiring checklist naming `SUITE_APPS`. Both symbols and
    `nav.css` were deleted at HEAD. ADR-0044's own verification grep
    (`NAV-WITHDRAWAL-PLAN.md:221`) covers `docs`, so these were in scope of N4 and were missed.
    Outside my app slice, flagged because ADR-0044 residue was in my brief.
  - Confidence: CONFIRMED
  - Fix: one "(withdrawn — ADR-0044)" note per plan; the new-app checklists should stop naming
    `SUITE_APPS`, which no longer exists.

---

### Checked and found sound

- **593→592 aside, the census machinery is honest**: `scripts/assert-test-census.mjs`'s 26 `PROJECTS`
  match `vitest.workspace.ts` exactly, including `contour-integration`.
- **Record count**: 28 record files, 28 distinct top-level `id`s, 28 imports in
  `src/families/index.ts`; GALLERY.md §5's "ALL TWENTY-EIGHT RECORDS ARE LOADED" and its tier split
  (A1–A7, B1–B3, C1–C3, D1–D7, E1–E3, F1–F2, G1–G3) match the files.
- **Contour-Integration jsdom roster**: exactly 23 specs with the docblock on line 1, and they are the
  `src/shell/` surface CLAUDE.md describes (cards, bar, front door, drill, strip, contrasts, readout,
  scrub, denylist, shell2*). `packages/ui` is indeed the only project setting `environment: "jsdom"`
  in its Vitest config; the app's own config says `environment: "node"`.
- **Browser suite**: 20 `*.browser.test.ts` files — matches ADR-0044's "20 files / 220 tests". (I did
  not run it; 124 static `it(`/`test(` calls is consistent with 220 after `.each`.)
- **a11y roster**: all four contour entries (`contour-integration`, `-drill`, `-predict`, `-worked`)
  have `{}` baselines, and every `expect` guard selector exists in `src` — `.pickRow`
  (`drillPanel.ts:211,269`), `[data-predict-option]` (`drillPanel.ts:442`), `.stepBody[data-step]`
  (`cards/derivation.ts:571`), `data-card` (`cards/card.ts:249`, `render.ts:60`). Every wire key the
  roster's `viewState()` uses (`m`, `r`, `bi`, `dr`, `we`, `st`) is declared on `Wire`
  (`viewState.ts:187-256`), and the drill task ids `oscillatory` / `rational` exist in
  `contrastGrid.ts:131,138`, from which `DRILL_TASKS` is derived.
- **`M8/browser-pass.md`'s eight `#vs=` links**: base64-decoded all of them; the five record links name
  `semicircle-quartic`, `mellin-keyhole`, `dogbone-two-fractional-powers`, `series-cot-collision` —
  all real ids — the sandbox and declared links parse, and the ninth is the deliberate
  `no-such-record` refusal case.
- **`M8/claims.md` is in step with the code**: ran `npx vitest run test/claimsDoc.test.ts` — 5 passed,
  including *"covers every ledger template, so a new sentence cannot arrive unreviewed"* and *"reads
  the templates from the live code, not from a copy"*.
- **Every backticked file path in the 15 primary docs resolves** except the ones listed above and the
  ones that are deliberately historical (`src/shell2/*` throughout `M8-plan.md` and `M8/STATUS.md`,
  `src/ui/app.css`, `cards/parseError.ts`, `test/narrowLayout.browser.test.ts`) — 456 backticked paths
  checked against `git ls-files`.
- **Every backticked identifier in CLAUDE.md's contour paragraphs exists in code**: 102 checked, 0
  missing (`integralRefusal`, `legalityRefusal`, `syncHash`, `describeStage`, `figureLayout`,
  `sameShape`, `contourOut`, `SINGLE_POINT_ID`, `setCutFromWindow`, `drillGraded`, `checkDrawing`,
  `stripTemplate`, `wedgeTemplate`, `polesInStrip`, `disposeArc`, `unitRoot`, `cofactorResidues`,
  `mergedResidue`, `collisionCheck`, `cothForm`, `denominatorOf`, `linearMinorant`, `exactInPi`,
  `bareRecipe`, `applyOps`, `splitFraction`, `originArc`, `isOriginCentred`, `editPieces`, …). The
  three the brief listed that are gone — `penNodes`, `moveContour`, `errorBox` — are named in
  `M7-plan.md` / M7 narrative only, which the M8 caveat covers.
- **`M8/parity.md` is the correct record**: it names the three deleted specs as deleted, and its
  "did not survive" rows are the only place the vanished symbols (`recordCard`, `ledgerCard`,
  `poleCard`, `legacyCopy`, `applyExpression`, `budgetNow`) appear — which is its job.
- **DESIGN.md carries its own M8 caveat** (§1 *"As built (M8 step 2.5)"*, naming `shell/url.ts` →
  `shell/viewState.ts`, `shell/keys.ts` folded away, no `worker/`, no `aaa.ts`, `ui/panels/*` gone),
  and so does `apps/contour-integration/README.md`'s Status head and PLAN §5's superseding note.
- **Research 08 carries an explicit ⚠ stale-checkout banner** with its corrections; research 01–07 are
  dated research tracks, not claims about current code.
- **`.claude/launch.json`'s `contour` entry**: port 5177, matching `vite.config.ts`.
- **`deploy-pages.yml`**: 11 published `cp -r` lines plus the launcher, with `contour-integration`
  among them; `ci.yml`'s "Six harnesses" matches the root `test:browser` script exactly.
- **ADR-0044 residue in the app's own code is correctly historical**: `src/shell/app.ts:133` explains
  the removal in the past tense, `test/shell2.test.ts:342` and `test/shell2.browser.test.ts:128`
  assert `nav.cas-nav` is **null**. `mountNavHeader`, `SUITE_APPS`, `nav.css` and `navHeader.ts` are
  gone from `packages/ui`.
- **INTERCHANGE.md §7b** is accurate for the hand-off table; Contour Integration is correctly absent
  (it produces and consumes no payload kind — only the `ci` view-state namespace, which §7b is not
  about).
- **CLAUDE.md's M8 paragraph's fresh counts check out**: four stage modes
  (`ui/stage/mode.ts:26` `["quiet","full","iso","textbook"]`), eight classics (8 records with
  `frontRow`), eight-group taxonomy (`schema.ts:347-356`), 43 denylist states, `engine/vocabulary.ts`
  present, `LEGALITY/CATCH/KILL/COVER` confined to data keys.
- **`pnpm test` does build package dists first** (root `package.json` `test` script), as CLAUDE.md says.

### Not covered

- I did not re-run `pnpm a11y` (needs 20 built dists + a Chromium), so the 682-vs-845 correction rests
  on the two committed measurements rather than on my own run.
- I did not run the contour browser suite, so "220 tests" is unverified (20 files is measured).
- `docs/contour-integration/M8/review-inputs/{shell-review,content-review}.md` and `mockups/` were
  scanned for dead paths only (they are dated review inputs, and `review-inputs/README.md` says so);
  I did not check their per-string proposals against what shipped — `test/claimsDoc.test.ts` does.
- `docs/contour-integration/M4-plan.md` … `M7-plan.md` were checked for dead paths and identifiers but
  not read end-to-end for superseded prose; they are per-milestone plans, and PLAN.md is the doc a
  reader is pointed at.
