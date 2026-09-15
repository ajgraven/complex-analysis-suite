# M8 — the Contour Integration shell rebuild

> **Status: plan in progress.** Parts 1 and 2 (§0–§4: method, phase map, Phase 0 and Phase 1 in full)
> are written. Part 3 (§5–§7: Phases 2–5 in full) is written in a later session and appended here.
> The live state of execution is in [`M8/STATUS.md`](M8/STATUS.md) — **read that first**, every session.

The review that motivates this milestone is the published page
`https://claude.ai/artifact/3uUWAhH4PM9qGR2siHvpjV`; its working materials are committed under
[`M8/review-inputs/`](M8/review-inputs/) (the shell read-through, the content read-through with all 28
draft descriptions and citations, and the mockup sources). ADR-0043 in
[`../DECISIONS.md`](../DECISIONS.md) records the decisions.

## 0. What M8 is, and the decisions it rests on

The engine is kept; the presentation layer is rebuilt. The app becomes an **exploration instrument
first** with a **user-driven worked-example mode**, laid out as **two rails** (left: what is being
integrated; right: what it proves) around the stage, with the accumulator strip beneath. Every piece of
mathematics on screen is **typeset with KaTeX**. The four ledger groups are displayed as **Hypotheses ·
Residues · Boundary terms · Target** (the internal ids `LEGALITY / CATCH / KILL / COVER` are kept as
data keys). All on-screen prose is **terse and textbook-neutral**. The stage has four colouring modes,
**quiet · full · isochromatic · textbook**, plus the modulus-contour toggle; textbook and light-phase are
the figure export's print and light variants. The gallery's front door is eight classics as cards over an
eight-group taxonomy, each record carrying a standardised four-line description with chapter-level
citations. Desktop and laptop only, with a short notice on phones. Contour pieces become an editable
list with roles, including vanishing lemmas the engine may refuse.

House notation: $\oint_\gamma f(z)\,dz$, $\operatorname{Res}(f,a)$, $\operatorname{Ind}_\gamma(a)$,
$\Gamma_R$ for the large arc, $\gamma_\rho$ / $\gamma_\varepsilon$ for a small one. Badges `=` / `≤` / `≈`
stay, with a one-line legend in the result card.

Priorities from the review, kept as the order of work: correctness of what is on screen, then the look
(typesetting, layout, vocabulary), then the instrument (hover, undo, numerics, ergonomics), then the
teaching layer, then the editor.

## 1. How the work is done (read this before any step)

The owner's usage is metered and a session can end at any moment. Every rule below exists so that an
interruption costs at most one step.

**Sessions and models.** Plan drafting sessions (Fable) fit about one S step. Execution sessions (Opus)
fit one to two M steps, or three to five S steps. Each step below is sized S or M and grouped into
suggested sessions; a session may stop after any step.

**The resume protocol.**
1. Read [`M8/STATUS.md`](M8/STATUS.md). It names the current step, the last commit, the next action, and
   the findings so far. Do not re-derive; trust it, then verify only what it says to verify.
2. Do the named step. If a step turns out larger than a session, make a **checkpoint commit** at the
   half-way point with `wip(contour): M8 step N.M — <what is done, what is not>` in the message and a
   note in STATUS.md. The branch is allowed to be broken between phase gates (owner decision), so a
   checkpoint may fail typecheck; say so in STATUS.md.
3. Before the session ends, and after every completed step: update STATUS.md (current step, last commit,
   next action, findings), commit, `git push -u origin claude/inspiring-keller-5sizwl`. **Never end a
   session with unpushed work.**
4. A finding that changes the plan (a step that cannot be done as written, a defect discovered, a
   decision needed) goes in STATUS.md under "Findings" with the step number, not in chat only.

**Verification cadence.** After every step: `pnpm --filter contour-integration typecheck` and
`pnpm --filter contour-integration test` (the app's own suite). At every phase gate and before any
merge: the full repo gate, `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, never piped
through `head` or `tail`. The browser suite (`CAS_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm
--filter contour-integration test:browser`) runs at the end of any step that touches the stage or adds a
record, and at every gate.

**Branch and merges.** One branch, `claude/inspiring-keller-5sizwl`. Phase 0 is invisible to users and
**merges to `master` on its own** (a PR at the Phase 0 gate) so the long-lived branch drifts less;
Phases 1–5 land in **one merge** at the end. Between the Phase 0 merge and the final merge the branch
may be broken between gates but must be green at each gate.

**Commits.** Small, one step or checkpoint per commit, message `feat|fix|docs|refactor(contour): M8
step N.M — <summary>`; end with the attribution lines the session is given. No model identifiers in
commits, code or docs.

**Guardrails carried from the brief.** Honest labelling (`=`, `≤`, `≈` come from verdicts, never typed
by hand); no π/2πi constants in `@cas/core`; packages import downward only; extraction only on a second
consumer; a wrong sentence on screen is a defect, not a nit.

**What "done" means for a step.** Its "Done when" list is satisfied, its tests exist and pass, STATUS.md
is updated, and the commit is pushed.

## 2. Phase map

| Phase | Content | Gate | Merge |
|---|---|---|---|
| **0** Foundations | Correctness fixes on screen; the display vocabulary; structured ledger claims with a plain-text renderer proven a no-op; LaTeX for targets, integrands and exact values; the textbook sentences with an owner sign-off document; record descriptions and citations; taxonomy. No visible change except the corrected claims and the vocabulary. | full gate; `M8/claims.md` signed off by the owner | **merges alone** |
| **1** The new shell | Layout B as a keyed renderer beside the old shell; modes Explore · Worked example (entry only) · Drill (entry only); the gallery front door; stage modes and the CET-C6 map; hover readout; undo; collapsed ledger; numerics disclosure; ergonomics; cold start; phone notice; the old shell deleted at parity; the shell tests re-expressed. | full gate + browser suite + a11y roster; parity checklist | on the branch |
| **2** Prose and figures | Every remaining on-screen surface in textbook voice (branch-cut card, drill, contrasts, share, errors); figure export with poles, light and print variants, typeset caption; README/PLAN doc sweep. | full gate | on the branch |
| **3** Teaching layer | The derivation stepper linked to the stage; scrubbable $R$, $\varepsilon$, $N$ with the limit as a scrubbed animation; the amplitwist detail; drill and contrasts rehoused; the wrong sums named. | full gate + browser suite | on the branch |
| **4** Piece editor | Contour pieces as an editable list with roles including vanishing lemmas (refused by name when not certifiable); the permalink carries roles; hand-drawn contours can carry an argument. | full gate + browser suite | on the branch |
| **5** Close | Real-GPU browser pass; a11y baseline; CLAUDE.md status paragraph; the final PR and merge. | full gate | **final merge** |

Phase 1 is the largest and is specified in Part 2 (§4). Phases 2–5 are specified in Part 3 (§5–§7).

## 3. Phase 0 — foundations (specified in full)

No user-visible change except that wrong sentences become right and the four group names change.
Everything here is engine-, data- or doc-side and is covered by the node gate.

Suggested sessions: **A** = 0.1 + 0.2 · **B** = 0.3 · **C** = 0.4 + 0.5a · **D** = 0.5b + 0.6 · **E** = 0.7 + the gate.

### Step 0.1 — the wrong claims on screen (S)

**Goal.** Nothing a colleague could call wrong is printed. Six items, each verified against the source
in the review.

**Files.** `apps/contour-integration/src/shell/app.ts` (`relationText`, `contourIntegrandText`, the
"record claims" line), `src/families/schema.ts`, `src/families/solveResidueTerm.ts`, the records
`b1-jordan-cosine-kernel.ts`, `f2-wedge-fresnel.ts`, `g1-square-cot-collision.ts`,
`g3-square-csc-collision.ts`, `a1`…`a3`, `d4`, `d5` (their `closedForm`), and `CLAUDE.md`.

**Do.**
1. **The relation sentence.** `relationText` composes `the target is ${relation} of ∮ f dz`, which is
   false whenever $\oint = 0$ (C1, C2) or the target is a multiple of $\oint$ (every keyhole, strip,
   dogbone, wedge). Replace with a sentence that is true for every record: *"the target is
   `${relation}` of the integral over the target piece(s) in the limit; the boundary terms below relate
   that integral to $\oint_\gamma f\,dz$."* Keep the record's `note` beneath it. Records whose target is
   a term of the residue sum (tier G) keep their own sentence, in lower case.
2. **"The record claims …".** Show `closedForm.expr` (the general form), not `simplified`. Add an
   optional `closedForm.simplifiedWhen?: string` (an `@cas/expr` boolean expression in the record's
   parameters); show `simplified` only when it evaluates true at the current fixture, otherwise omit it.
   Fill `simplifiedWhen` for A1 (`a > 0`), A2 (`abs(a) < 1`), A3 (`n == 2`), D4 and D5 (`p == 2`, or as
   the record's comment states). F2: the "claims" line shows the real primary target's form, not the
   complex combined value.
3. **The "even" sentence.** In `solveResidueTerm.ts` (the provenance text near line 363), the headers
   of `g1` and `g3`, and `CLAUDE.md` (the M5.7 paragraph): the kernel $\pi\cot\pi z$ is **odd** about
   every integer; the true statement is that $u\,K(n+u)$ is even in $u$, so the coefficient of
   $u^{2k-1}$ is a rational multiple of $\pi^{2k}$. Rewrite all four to say that.
4. **The Cauchy-formula record's contour integrand.** `contourIntegrandText` prints
   `auxiliary.integrand`, which for A4 is the pre-Jacobian expression. When the target has a
   substitution, print the product with the Jacobian (`(exp(z)/z^n) · 1/(i z)`), so the printed
   integrand has the pole order the residues table reports.
5. **Jordan's record title** gains its hypothesis: $(\pi/|b|)\,e^{-|ab|}$ (the record's own general form).
6. **G3's data.** The `kernel-uniformly-bounded` hypothesis and every `sideCondition` that quote
   $\sup|\cot\pi z|$ are replaced by the $\csc$ statement ($\sup_{\Gamma_N}|\csc\pi z| = 1$, as the
   on-screen certificate already says).

**Tests.** New `test/onScreenClaims.test.ts`:
- for every record and fixture, the displayed closed-form claim (as chosen by rule 2), evaluated with
  `@cas/expr` at the fixture's parameters, agrees with `golden.numeric` to 1e-9 — this fails on A1's
  `a = −2` fixture before the change and is what makes rule 2 structural;
- no relation sentence contains `∮`;
- for A4 at each fixture, the printed contour integrand, parsed and evaluated, has the order at $z = 0$
  the residues table reports (compare `findPoles` on the printed expression against the table);
- G3's hypothesis and side-condition strings do not contain `cot`.
Existing tests that pin the old sentences are updated.

**Done when.** The four tests pass; `pnpm --filter contour-integration test` and `typecheck` green; the
app opened on C1 no longer prints a sentence about $\oint$; STATUS.md updated; pushed.

### Step 0.2 — the display vocabulary (S)

**Goal.** The four constraint ids are never shown; one map renders them.

**Files.** New `src/engine/vocabulary.ts`; `src/engine/ledger.ts` (`ledgerHeadline`),
`src/engine/derivation.ts` (`STAGES` titles), `src/shell/app.ts` (ledger rows, derivation headings,
contrast panel corner and cells, drill legend), `src/shell/contrastGrid.ts` (row labels),
`src/shell/drill.ts` (any `KILL` in text), tests.

**Do.**
- `vocabulary.ts` exports `constraintLabel(id): string` (`LEGALITY → Hypotheses`, `CATCH → Residues`,
  `KILL → Boundary terms`, `COVER → Target`), `stageTitle(id)` (`The problem · Hypotheses · Residues ·
  Boundary terms · Target · Solution · Conclusion`), `roleLabel(role)` (`target → target`, `vanish →
  vanishing piece`, `known → known limit`, `reproduces → constant multiple of the target`, `free → free`),
  and the two headlines `headlineVerified()` = `Hypotheses verified.` and `headlineFails(id, piece?)` =
  `Hypotheses fail: <piece> does not vanish.` / `Hypotheses fail: <label>.` (the group label and, when
  the failing row names a piece, the piece).
- `ledgerHeadline` stops interpolating the id; it calls the map. Every other render site calls the map.
- Contrast row labels become `<group> · <role label> <ordinal>` (`Boundary terms · vanishing piece 2`).
- Tests that match `KILL`, `LEGALITY` etc. as displayed text are changed to import the map and match
  its output; tests that use the ids as data keys are untouched.

**Done when.** `grep -n '"LEGALITY"\|"CATCH"\|"KILL"\|"COVER"' src/shell src/engine/derivation.ts` finds
only data-key uses (documented in STATUS.md); app tests green; pushed.

### Step 0.3 — structured ledger claims, proven a no-op (M)

**Goal.** Every ledger row and derivation line is a `Claim` object (a template id and typed arguments),
rendered to text by one function. The rendered text is **byte-identical to today's** for all 28 records
× every fixture, so the change is proven a no-op before the sentences change in 0.5.

**Files.** New `src/engine/claims.ts`; `src/engine/ledger.ts` (every `claim:` construction, ~40 sites);
`src/engine/derivation.ts` (`DerivationLine.text` derived from the row's claim); `src/families/*` where
rows are minted (`solveTarget.ts`, `solveResidueTerm.ts`, `solveImported.ts`, `collisionCheck.ts`);
`src/kernel/bounds/*.ts` are **not** restructured (see below); the dump script
`scripts/`-local or `test/helpers/dumpLedger.ts`.

**Do.**
- `claims.ts`: `type ClaimArg = { kind: "piece"; id: string; name: string } | { kind: "count"; n: number }
  | { kind: "number"; value: number; digits?: number } | { kind: "exact"; text: string; latex?: string }
  | { kind: "cx"; value: Cx } | { kind: "cut"; name: string } | { kind: "text"; text: string }`;
  `interface Claim { readonly template: ClaimId; readonly args: Readonly<Record<string, ClaimArg>> }`;
  `renderClaim(claim): string` with one template string per `ClaimId`, reproducing today's wording
  exactly (including the `nearest at 0.0500` number formats — reuse the existing formatters).
- `LedgerRow` gains `claim: Claim`; the old string is available as `renderClaim(row.claim)`. The
  `Certificate.claim` string minted through `@cas/rigor` is set from `renderClaim` so the package is
  untouched.
- **Bounds and kernel certificates stay strings.** Their claims are minted in `src/kernel/bounds/*` and
  `src/kernel/branch/*` with numbers baked in; restructuring them buys little because the new shell will
  render a string with `$…$` delimiters (0.5 introduces the delimiter convention). Record this boundary
  in `claims.ts`'s header.
- The no-op proof: a helper that runs `analyse` for every record × fixture and dumps every row as
  `<constraint>\t<status>\t<claim text>\t<method>` plus every derivation line, run before the change
  (committed as `test/fixtures/ledger-dump.before.txt`) and after; a test asserts the after-dump equals
  the before-dump byte for byte. After 0.5 the before-file is deleted and the after-file becomes the
  baseline (`ledger-dump.txt`), asserted the same way from then on.

**Done when.** The dump test passes byte-identical; app tests green; pushed. If a claim cannot be
expressed as a template with typed args, STATUS.md says which and why, and it stays a `text` arg.

### Step 0.4 — LaTeX for everything the records and the engine print (M)

**Goal.** Every mathematical string the new shell will typeset has a LaTeX form: target integrals,
contour integrands, exact values, piece names, singularities. `@cas/expr` already exports `toLatex`;
this step measures its coverage and adds the app-side printers.

**Files.** `packages/expr/src/latex.ts` (only if coverage gaps are found — record them in STATUS.md
first; a package change is small but touches four apps' tests), new `src/kernel/formatLatex.ts`, new
`src/families/latex.ts`, `src/engine/contour/templates.ts` and `src/families/records/*` (piece names),
tests.

**Do.**
- A test that parses every record's `targets[].integrand | summand`, `auxiliary.integrand`,
  `closedForm.expr | simplified`, and every sandbox preset through `toLatex`, asserting no throw and no
  fallback marker; then a KaTeX `renderToString` (node, `throwOnError: true`) of each result, asserting
  no parse error. Coverage gaps (functions `toLatex` does not know: `sech`, `csc`, `cot`, `Gamma`,
  `sqrt`, `abs`, `log` with base…) are fixed in `latex.ts` with their own tests.
- `families/latex.ts`: `targetLatex(target, params?)` producing
  `\int_{0}^{\infty}\frac{x^{\alpha-1}}{1+x}\,dx` / `\sum_{n\ge1}\frac{1}{n^{2}}` from the target's
  bounds, variable and integrand; `contourIntegrandLatex(family)`; `closedFormLatex(family, fixture)`
  (the general or the conditional simplified form, per 0.1); parameter substitution as an option so a
  card can show `a = 2, b = 1` substituted or symbolic.
- `kernel/formatLatex.ts`: `latex` siblings for `formatFrac`, `formatGauss`, `formatSqrtExt`,
  `formatPiSqrt`, `formatTwoPiI`, `formatTwoPiISqrt`, `formatSineForm`, `formatExponent`,
  `formatLogPart`, `formatLogPower`, `formatRatPi`, `formatExpSum`, `formatTwoPiIExpSum`,
  `formatPiExpSum`, each tested against the text sibling on the same corpus of values the text
  formatters' tests already use (the two must agree on the number they denote: assert by evaluating
  both through KaTeX-free numeric readers where they exist, otherwise by a golden list).
- Piece names: each template piece and each record piece gains `nameLatex` (e.g. `\Gamma_R`,
  `[-R,\,R]`, `\gamma_\rho`, the keyhole's `\text{upper edge}`); `name` stays for text contexts. The pen's
  pieces get `\text{drawn segment } k`.
- Exact values carried on `ClaimArg.exact` get their `latex` filled at the mint site.

**Done when.** The coverage test passes for all 28 records and every preset; every formatter has a
LaTeX sibling with a test; pushed.

### Step 0.5 — the textbook sentences (M, in two halves)

**Goal.** Every sentence the engine composes is terse, textbook-neutral, in house notation, and says
exactly what was established. Because these are the ledger's assertions, the owner signs off on the
list before Phase 0 merges.

**0.5a — generate the review document (S).** A script (`scripts/m8-claims-doc.mjs` or a test-mode
helper) writes `docs/contour-integration/M8/claims.md`: one table row per `ClaimId` and per string
template in the bounds, branch, derivation-stage and headline code, with columns *today* / *proposed* /
*where*. The proposed column is drafted from `M8/review-inputs/content-review.md` §2 (the replacements
are already written there) and the review's §5.2 table; the rules are: no capitalised emphasis, no
citations of research notes or ledger passes, no lemma numbers (`L1`…`L6`), no "the solve"/"the
family"/"the record"/"golden value"; every number keeps its label; maths inside `$…$` (the delimiter
convention the shell renders: text outside, KaTeX inside). Commit the document; STATUS.md asks the
owner to review it. **The session stops here** if the owner has not yet reviewed.

**0.5b — apply (M).** With the owner's edits merged into `claims.md`: change the templates in
`claims.ts`, the strings in `kernel/bounds/*`, `kernel/branch/*`, `engine/derivation.ts` (the seven
stage `why` paragraphs become one line each or are dropped; the stage titles come from 0.2), the
headline, `residueTheorem.ts` / `exteriorTheorem.ts` / `summationTheorem.ts` method strings, and
`solveTarget.ts` / `solveResidueTerm.ts` provenance steps. Re-dump the ledger (0.3's helper) and commit
the new baseline `test/fixtures/ledger-dump.txt`, deleting the `.before` file. Update every test that
matched old wording to match through the map or the new baseline.

**Done when.** `claims.md` reviewed (STATUS.md records the date); no string in `src/engine`, `src/kernel`
or `src/families` contains `research 0`, `Pass 5`, `finding D-`, `L4`, `L5`, `L6`, or a word in capitals
longer than two letters other than the ids and `ML` (a test greps the built bundle); dump baseline
committed; pushed.

### Step 0.6 — record descriptions, citations, taxonomy (M)

**Goal.** Every record carries the four-line standard and a human title; the taxonomy is the eight
groups; the front row is declared.

**Files.** `src/families/schema.ts`, all 28 `src/families/records/*.ts`, `src/families/index.ts`
(loader invariants), `docs/contour-integration/GALLERY.md` (a paragraph noting the on-screen
description standard), tests.

**Do.**
- Schema: `title` becomes the human title (`∫₀^{2π} dθ/(a + b cos θ) by the unit circle` — text; a
  `titleLatex` sibling for the card); new `description: { readonly contour: string; readonly point:
  string; readonly citations: readonly Citation[] }` with `Citation = { readonly text: string; readonly
  book: "Ahlfors" | "Conway" | "Stein–Shakarchi" | "Brown–Churchill" | "Marsden–Hoffman" | "Needham" |
  "Freitag–Busam" | "Remmert"; readonly where: string }` — chapter-level, e.g. `Ahlfors, Ch. 4 §5`;
  `frontRow?: number` (1–8) on the eight classics A1, A6, B1, C1, D1, D4, F2, G1;
  `taxonomySection` values reconciled to exactly the eight groups: *Trigonometric integrals over
  [0, 2π]* · *Rational functions on ℝ* · *Fourier-type integrals and Jordan's lemma* · *Principal
  values and indented contours* · *Multivalued integrands: keyholes* · *Multivalued integrands: dogbones
  and the residue at infinity* · *Rectangles and sectors* · *Series by the residue theorem*.
- Fill all 28 from `content-review.md` §1 (the "Proposal" block of each record has the four lines; use
  chapter-level citations and drop the `[verify]` markers by citing the chapter only).
- Fixture labels: `fixtureLabel` prints parameters as `a = 2, b = 1`; variants marked `alternative
  derivation, not executable` are labelled by what they are (`principal-value form`, `two-sided sum`),
  with a `label` field on the golden entry where the flag name would otherwise show.
- Loader invariant 5: a record without `description`, a `frontRow` collision, or a `taxonomySection`
  outside the eight is **dropped, not thrown on**, like the other four.

**Tests.** The loader test asserts 28 loaded, 0 dropped, eight front-row records with distinct ranks,
every citation's `book` in the enum, every `where` non-empty, every `title` free of the words
`trap`, `collide`, `hand-waved`, `switch`, `ladder`.

**Done when.** Tests green; `GALLERY.md` paragraph added; pushed.

### Step 0.7 — Phase 0 gate and merge (S)

- Full gate: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`. Fix what it finds.
- Browser suite for the app (0.1 changed no stage code, but the a11y roster's drill page reads a
  headline; run it).
- Update the test census if `scripts/assert-test-census.mjs` pins counts.
- Open a PR from the branch to `master` titled `Contour Integration: M8 Phase 0 — foundations (no
  visible change)` with the Phase 0 summary; merge it. Then continue Phase 1 on the same branch name,
  restarted from `master` per the repo's merged-branch rule.
- STATUS.md: Phase 0 closed, Phase 1 step 1.1 next.

## 4. Phase 1 — the new shell (specified in full)

Phase 1 builds `src/shell2/` beside `src/shell/`, reaches parity with the old shell, swaps the entry
point, and deletes the old shell. Between 1.1 and 1.12 the app on the branch still boots the OLD
shell by default; the new one is reached with `?shell=new` on the URL, so every step is checkable in
a browser and the old one is never half-migrated. The branch may be red between steps (owner
decision); it must be green at 1.13.

Suggested Opus sessions (one to two M each): **S1** = 1.1 + 1.2 · **S2** = 1.3 · **S3** = 1.4 ·
**S4** = 1.5 + 1.6 · **S5** = 1.7 · **S6** = 1.8 · **S7** = 1.9 · **S8** = 1.10 + 1.11 · **S9** = 1.12 ·
**S10** = 1.13. Ten sessions at the owner's stated rate; a session may stop after any step.

### 4.0 Architecture (read before 1.1)

**The contract.** `ShellState` (`src/shell/state.ts`, kept where it is — it is DOM-free and the codec
depends on it) plus `resolveState(state, compiled, budget) → StateResolution` is the whole engine
surface the shell consumes. The new shell is a function `render(state, resolution, session)` that
patches a persistent DOM; nothing in it computes mathematics.

**`Session`** (`src/shell2/session.ts`) holds what a permalink must NOT carry and the old closure
kept in ~60 module-level variables: `gesture` (none / contour / handle / branch / view / pen), the pen
path, `hover` (piece index, handle index, pointer `z`), `undo` and `redo` stacks of `ShellState`,
`drillGraded`, which rails are collapsed, which disclosures are open, the stage mode, the chosen
figure theme. `stageMode` is the one item that also goes into `ShellState.view` (it is a view field
like `iso`; a link should open in the sharer's mode), added to the codec as an optional key with the
default `quiet`.

**The keyed builder** (`src/shell2/dom.ts`, ≈120 lines, no dependency — ADR-0007 admits no framework
without a second consumer). `h(tag, props, ...children)` returns a description; `patch(parent,
descriptions)` reconciles children by `key`, updating attributes, text and listeners in place and
creating or removing only what changed. Rules that make the old defects impossible: an element with a
`key` is never replaced while its key persists; `<details>` open state is read from `session`, never
from the DOM; form controls (`input`, `select`, `textarea`) are patched by property, and a control that
currently has focus is never re-created. KaTeX output is memoised by its LaTeX string
(`src/shell2/math.ts`: `math(latex, {display})` returns a keyed description whose innerHTML is
rendered once per distinct string and cached) so a drag that leaves a formula unchanged costs no
KaTeX call; `mathText(s)` renders a string with `$…$` spans (the 0.5 delimiter convention), escaping
the text outside. Every `math()` node carries `aria-label` = the plain-text form (the 0.4 text sibling),
since KaTeX's MathML is not reliably read.

**The recompute path.** Any state change goes through one door, `commit(next: ShellState, why)`:
it resolves (`resolveState`, at draft budget while `session.gesture !== "none"` or a slider is being
scrubbed, at full budget on settle), stores the resolution, calls `render`, schedules the stage draw
(one rAF coalescer, as today), regenerates the two canvas descriptions, and marks the hash dirty (the
250 ms coalesced `syncHash`, as today). `commit` is also where the undo stack is pushed (1.11).

**Layout.** One CSS grid: `nav` (the `@cas/ui` header in its own host before `<main>`), then `<main
class="shell">` with `bar / left / stage / right / strip` areas; `left` and `right` are `aside`
elements that collapse to a 38 px labelled strip; widths `--rail-left: 19rem`, `--rail-right: 24rem`,
`--strip: 12rem`, `--bar: 3.25rem`. No breakpoints below 1024 px (owner decision: desktop and
laptop); below 900 px the page shows the phone notice (1.12) instead of the grid.

**What is carried over unchanged.** `src/shell/state.ts`, `viewState.ts`, `templates.ts`,
`presets.ts`, `drill.ts`, `drillProgress.ts`, `contrastGrid.ts`, `figure.ts`; `src/ui/stage/glStage.ts`,
`ink.ts` (with a theme parameter, 1.2), `accumulator.ts` (same); `src/engine/contour/edit.ts`,
`pen.ts`, `branchEdit.ts`; `@cas/ui`'s `attachCanvasA11y`, `runWithFatalBoundary`, `mountNavHeader`.
At 1.12 the surviving `src/shell/*` files move into `src/shell2/` and the directory is renamed back to
`src/shell/`, so the final tree has one shell.

**Tests for the new shell** (rule from the review): query by role and accessible name or
`data-testid`, never by card position; keep the whole-rail `screen()` snapshot only for the
both-directions restore property; match vocabulary through `engine/vocabulary.ts`; jsdom with
`getContext` stubbed, as `test/shell.test.ts` does today. Each step below adds to
`test/shell2.test.ts` (or a per-card file) and the browser suite where the stage is touched.

### Step 1.1 — scaffold: entry switch, builder, session, layout, KaTeX (S)

**Files.** `package.json` (add `katex ^0.17.0`, the sibling apps' version), `src/main.ts` (boot
`shell2` when `new URLSearchParams(location.search).get("shell") === "new"`, else the old shell),
new `src/shell2/{dom.ts, math.ts, session.ts, app.ts, render.ts}`, `src/ui/shell2.css` (grid only for
now), `test/shell2.test.ts`.

**Do.** `dom.ts` per §4.0 with its own unit tests (keyed reorder keeps nodes; focused input survives a
patch; listener replacement does not double-fire). `math.ts` with memoisation and the `aria-label`.
`session.ts` with `defaultSession()`. `app.ts`: `mountShell2(root): { currentState, applyState }` that
builds the nav host + `<main>` grid with placeholder cards titled from `vocabulary.ts`, mounts the GL
stage inside a `try` (as the old shell does) and the ink canvas with `attachCanvasA11y`, and runs
`commit(defaultState(...))` once. Copy the four structural invariants from `test/shell.test.ts`
(one `<main>`, one `<h1>`, nav before the landmark, every canvas named or hidden) into
`test/shell2.test.ts`.

**Done when.** `?shell=new` boots to an empty two-rail layout over a live phase portrait of the default
state; `test/shell2.test.ts` passes the four invariants and the builder tests; the old shell is
untouched; pushed.

### Step 1.2 — the visual system (M)

**Files.** New `src/ui/theme.css` (tokens + type + surfaces + controls), `src/ui/shell2.css`
(layout, cards, rails, strip), new `src/ui/inkTheme.ts`, `src/ui/stage/ink.ts` and
`src/ui/accumulator.ts` (take a theme object instead of literals), `src/ui/app.css` untouched (the old
shell keeps it until 1.12).

**Do.**
- Tokens declared once on `:root` (dark is the app's committed look, so dark values on `:root`;
  `[data-theme="light"]` overrides for the figure export's light plate and a later light theme):
  ground, panel, border, text, muted, accent, ok, warn, bad; the six-entry piece ramp
  (`--piece-0..5`, the same hues `ink.ts` uses today so the semantic colours do not move); a type
  scale of five sizes (`--t-xs 11.5px, --t-s 12.5px, --t-m 14px, --t-l 16px, --t-xl 20px`); a humanist
  sans for UI (`Inter`-class system stack; no monospace anywhere except the expression input, code
  and tabular numbers) with `font-variant-numeric: tabular-nums` on `.num`; KaTeX for mathematics.
- Surfaces by role: cards have a panel ground and no border; the result card alone carries a 1 px
  accent rule on its left; buttons are rectangular with 6 px radius, a filled primary and a quiet
  secondary; segmented controls for mode and stage mode; badges `=` / `≤` / `≈` as 22 px squares in
  ok / accent / warn.
- `inkTheme.ts`: `{ halo, handleRing, cutInk, refusedInk, penPreview, axes, grid, pole, poleLabel,
  pieces[] }` for dark and light; `drawContour` and `drawAccumulator` take it as an option; the old
  shell passes the dark theme explicitly so its output is byte-identical (assert with the existing
  browser ink tests).
- No media queries below 1024 px in the new stylesheets.

**Done when.** The empty layout from 1.1 renders in the new system; `pnpm --filter
contour-integration test:browser` shows the old shell's ink unchanged; a screenshot at 1440×900 is
attached to STATUS.md's findings as a file path under `M8/screens/` (committed, small PNGs are fine
here because they are the record of the look); pushed.

### Step 1.3 — the stage controller (M)

**Files.** New `src/shell2/stageController.ts` (the gesture machine and the pen lifted from
`src/shell/app.ts` lines ≈1343–1530 and ≈3418–3717), `src/shell2/stageView.ts` (GL stage + ink +
overlay + pole markers + camera), `src/shell2/app.ts` (wire), tests.

**Do.**
- `createStageController({ host, getState, getResolution, getSession, commit })` returning
  `{ destroy }`. It owns pointer, wheel and keyboard on the ink canvas and reproduces the old
  behaviour: body drag translates a sandbox contour (`translateContour`), handle drag sets a parameter
  (`radiusDragValue` / `setParam`), branch handles (`applyBranchGrab`), view pan, wheel zoom, keyboard
  grab cycling (`cycleGrab` / `moveGrab`) with a **visible label** of what is held (a small chip near
  the handle, not only the live region), the pen (click = corner, drag = arc, click-start = close,
  Backspace / Escape / Enter, Alt suppresses snapping) with its snap name shown **on the stage** next
  to the pointer.
- Additions the review asked for: wheel zoom clamped to `halfHeight ∈ [0.05, 200]`; `fitContour()` on
  double-click and on a toolbar button; the draft budget honoured for slider scrubs too (the slider's
  `pointerdown`/`pointerup` set `session.scrubbing`); one cursor convention (`grab` over grabbables,
  `crosshair` in pen mode, `default` otherwise, set by the controller, never by CSS).
- `stageView.ts`: the GL stage is created once; `setIntegrand` is called only when the resolution's
  program key changes (value-keyed, as the old shell does after its M5.1 fix); **poles are drawn on
  the ink canvas** (a ring with an order glyph, hover-highlighted), so the export gets them; the DOM
  overlay keeps only transient labels (the snap chip, the held-handle chip, the hover readout host).
- Parse failure: when `resolution.kind === "empty"` with a reason, the GL stage is cleared to the
  ground colour and the ink draws nothing but the axes (no stale portrait).

**Tests.** `test/shell2.test.ts` gains the pen-at-the-shell cases from `test/pen.test.ts` (vertex count,
Undo, will not close with two vertices, Cancel keeps the prior contour, keys, put away on mode switch
and on `applyState`), driven through the controller; the browser suite gains a drag test (a body drag
moves the contour; a radius drag changes `R`; the pole ring is present in `canvas.ink` pixels — assert
the primitive, per the M6.3 lesson).

**Done when.** With `?shell=new`, every stage gesture of the old shell works and the two additions
(fit, zoom clamp) work; tests green; browser suite green; pushed.

### Step 1.4 — the left rail: what is being integrated (M)

**Files.** New `src/shell2/cards/{target.ts, integrand.ts, parameters.ts, contour.ts, cuts.ts,
singularities.ts}`, `src/shell2/render.ts`, tests.

**Do.** Each card is a function `(state, resolution, session, actions) → description`, keyed.
- **Target** (gallery only): the record's `titleLatex`, `targetLatex(target, bindings)` in display
  mode, the fixture picker (labels from 0.6), the description's contour phrase and citation line.
- **Integrand**: the expression input (monospace, `aria-label` "integrand f(z)"; under a declaration
  the label is "cofactor R(z)" and the declared factor is shown typeset above it, replacing the old
  `f(z) = / R(z) =` swap); a live typeset preview under the input from `toLatex(parse(expr))`, with
  parse errors rendered in plain language (`unbalanced parenthesis`, `unknown function "zz"`,
  `unexpected end of expression`) mapped from `@cas/expr`'s error kinds; the seven presets as a
  compact menu, not a row of pills.
- **Parameters**: one slider per live parameter with its value in tabular figures; a slider's element
  is keyed by parameter name and is never re-created during a scrub (test: keyboard arrows continue to
  work after ten presses).
- **Contour** (Phase 1 = read-only list; editing is Phase 4): one row per piece with its colour chip,
  `nameLatex`, role tag (`roleLabel`), its own partial value with badge; the template picker as a
  menu; **Draw** starting the pen; **Reverse orientation** (sandbox); hovering a row highlights the
  piece on the stage and its accumulator segment, and hovering the stage highlights the row (1.10
  completes the other direction).
- **Branch cuts**: the old `renderBranchCard` + `renderDeclaration` ported structurally (add / remove
  branch point, order, window, sheet, join / split, shadow toggle, declare / undeclare, the split
  check), with its prose left as it is (Phase 2 rewrites it) but its controls keyed so a `<select>`
  survives its own `change`.
- **Singularities**: one table (point, order, `Res` typeset, `Ind`), replacing the three places the
  old shell listed poles; rows hover-link to the pole on the stage.

**Tests.** Per card, in jsdom: the integrand preview updates and errors read as sentences; a slider
survives a recompute with focus (the M7.2 rule generalised); the piece list renders `nameLatex` and
role labels from the map; the singularities table shows `Ind` from the resolution.

**Done when.** All six cards render for the sandbox and for every record (a test iterates all 28 at
fixture 0 and asserts no throw and no empty table); pushed.

### Step 1.5 — the right rail: what it proves (M)

**Files.** New `src/shell2/cards/{result.ts, derivation.ts, share.ts}`, `src/shell2/format.ts`, tests.

**Do.**
- **Result**: the badge and the typeset value (from 0.4's `closedFormLatex` / the solved form's LaTeX);
  the headline from `vocabulary.ts`; **the hypothesis table collapsed by default**, opening on click
  and staying open across recomputes (state in `session`), and **opening automatically once when a row
  fails**; the quadrature line with its `≤` badge; the **Numerics** disclosure (value, convergence
  estimate, node count, per-piece values, residual against the certified value, "a convergence
  estimate, not a proved error bound") that opens by default when `integralRefusal(...) !== null` or
  the level is not `=`; the winding numbers folded into the singularities table (not repeated here).
- `format.ts`: `fmtApprox(value: Cx, err: number)` prints a complex number with digits limited by its
  error estimate and drops a component whose magnitude is below the estimate (`≈ 6.2832 i`, never
  `1.7641e-18 + 6.28318531i`); `fmtNum(x, digits)` for tabular readouts. Unit-tested on the review's
  examples.
- **Derivation** (Phase 1 form; the stepper is Phase 3): the stages as `<details>` keyed by stage id,
  open state in `session`, the failing stage open by default; each line as `mathText(text)` with its
  badge, method in muted small type, and the provenance as a nested disclosure; the per-pole table only
  in the Residues stage. `DerivationLine` gains `pieceId?: string` (engine touch, one line) so a line
  hover highlights its piece.
- **Share**: Copy link, Save figure (menu: dark / light / print — the light and print plates are
  Phase 2; in Phase 1 the menu offers dark only and the others are disabled with a title "Phase 2"),
  Copy figure; the "no link" refusal reasons from the codec shown in plain language.

**Tests.** The result card shows no `∮` value when `integralRefusal` refuses; the Numerics disclosure
is open for a sandbox `1/sin(z)` and closed for A6; the hypothesis table opens on failure (drag the
semicircle downward on B1's sandbox twin); `fmtApprox` cases.

**Done when.** With `?shell=new`, a record and a sandbox expression show the full right rail; pushed.

### Step 1.6 — the accumulator strip (S)

**Files.** New `src/shell2/strip.ts`, `src/ui/accumulator.ts` (unchanged unless the theme parameter
needs it), tests.

**Do.** Port the strip: the canvas with `role="img"` and its generated description; the side panel with
the partial-sum readout in tabular figures, the step counter, the play/scrub control, and the compare
toggles with `aria-pressed`; each toggle gets a one-line explanation shown while it is active (`Σ Δz`:
"the sum of the steps alone; it closes to 0 because the contour is closed", etc. — Phase 3 item 20
brought forward because it is three sentences). The scrub position maps to a **step index**
(`acc.steps[k]`) and the stage marker is drawn at `acc.steps[k].z`, so the two views agree exactly
(prep for the amplitwist detail in Phase 3).

**Done when.** The strip renders and scrubs; the browser ink test for the accumulator passes against
the new strip; pushed.

### Step 1.7 — modes, the bar, permalinks, contrasts and drill ported (M)

**Files.** `src/shell2/bar.ts`, `src/shell2/app.ts` (`currentState` / `applyState`, `syncHash`),
`src/shell2/contrasts.ts`, `src/shell2/drillPanel.ts`, tests.

**Do.**
- The bar: brand as the page `<h1>`; the segmented mode control **Explore · Worked example · Drill**;
  the record button showing the current record's typeset target (opens the front door, 1.8); a
  **Sandbox** button; Contrasts; Copy link; Save figure. Overflow is impossible by construction (the
  presets moved into the integrand card).
- Modes: Explore = both rails open. **Worked example** = the left rail collapsed, the right rail's
  derivation expanded with every stage open, the stage in the session's mode (the stepper replaces this
  in Phase 3; the mode exists now so the codec and tests can carry it). **Drill** = the drill's task
  card in the right rail's top slot and the drill's masks applied (ported from the old `renderDrill`
  and the two panels, as a rail card rather than a full-screen overlay); `ShellState.drill` unchanged.
  The mode is derived: `drill !== null` → Drill; else `session.workedExample` → Worked example; else
  Explore. `workedExample` is a view field added to `ShellState` and the codec (optional key).
- `currentState()` / `applyState(s)` with the old contract; `applyState` puts the pen away, clears
  `drillGraded`, resets the rail collapse to the mode's default, and forces a GLSL relink only when the
  program key changes. Hash sync as today; the three view-only changes the old shell forgot (scrub,
  iso, contrast) now mark the hash dirty.
- Contrasts: the existing grid rendered in a **modal** dialog (`role="dialog"`, `aria-modal`, focus
  trap, Escape, focus return, the page behind `inert`), with the row labels from `vocabulary.ts`, cells
  opening as `applyState`. Phase 3 rehouses it; Phase 1 only makes it correct.
- Drill: the four rungs with their masks (the KILL column → "the boundary terms" wording is Phase 2's
  sweep, the structure is now); masks asserted structurally as `test/drillShell.test.ts` does.

**Tests.** Move the behaviours from `test/shell.test.ts` (both-directions restore with the whole-rail
snapshot; the permalink suite: opens the linked state, carries the view, refusal box, single history
entry, URL carries the framed camera, copy control says why, a drawn contour gets a link; the declared
factor survives a window change and moves the cut so the hypothesis row refuses) and from
`test/drillShell.test.ts` into `test/shell2*.test.ts`, re-expressed by role/name.

**Done when.** Every behaviour test from the old shell's three jsdom files has a counterpart passing
against shell2 (a table in `M8/parity.md`, started here, lists each with its new test name); pushed.

### Step 1.8 — the front door, and the cold start (M)

**Files.** New `src/shell2/frontDoor.ts`, `src/shell2/thumbnails.ts`, `src/shell2/app.ts` (cold
start), tests.

**Do.**
- The front door is a modal panel (same dialog mechanics as 1.7) opened from the bar's record
  button: heading "Worked examples"; the eight `frontRow` records as cards in a four-column grid, each
  with a thumbnail, the **target integral with its answer** typeset
  (`\int_{-\infty}^{\infty}\frac{dx}{1+x^4}=\frac{\pi}{\sqrt2}`), the contour phrase, the point, the
  citation; below, the eight `taxonomySection` groups as rows with a count and a disclosure listing
  the group's records in the same card form. Keyboard: arrows move between cards, Enter opens, Escape
  closes. Opening a card = `applyState` to `{mode: "gallery", record, fixture: 0}` with Explore mode
  and the camera framed.
- Thumbnails: `thumbnails.ts` draws each record's contour at its first fixture on a 240×110 offscreen
  canvas with the ink layer in **textbook theme** (light ground, piece colours, pole rings, cuts) —
  no GL, so it works in jsdom and costs nothing; cached per record id for the session.
- Cold start: `defaultState` becomes gallery mode on `semicircle-quartic` (A6), fixture 0, Explore
  mode, quiet stage; the sandbox's default expression stays `1/z` on the circle for when Sandbox is
  chosen. `decodeShell` of an old link still opens whatever it names.

**Tests.** The front door lists eight front-row cards in `frontRow` order and eight groups totalling
28; opening a card lands on the record (verdict text from the resolution); the cold start is A6 with
"Hypotheses verified."; a thumbnail canvas draws >12 distinct colours for the keyhole (the primitive
assertion, as in M6.3).

**Done when.** The app opens on A6, the front door works with mouse and keyboard, pushed.

### Step 1.9 — stage modes and the CET-C6 map (M)

**Files.** `src/ui/stage/phase.glsl.ts`, `src/ui/stage/glStage.ts` (a `setMode(mode)` uniform),
new `src/ui/stage/cetC6.ts` (the colour table), `src/ui/stage/ink.ts` (textbook mode drawing),
`src/shell/state.ts` + `viewState.ts` (`stageMode` view field), the stage-mode segmented control in
the bar, browser tests.

**Do.**
- `stageMode: "quiet" | "full" | "iso" | "textbook"`, default **quiet** in every app mode (owner
  delegated the default; quiet is chosen because the contour and the verdict are the subject in all
  three modes and the full portrait is one click away; record this in STATUS.md as a decision taken).
- The shader: one integer uniform `uMode`. `full` = today's mapping with the CET-C6 table in place of
  the OKLCH ramp; `quiet` = the same hue table at chroma ×0.42 and lightness ×0.78 (the treatment the
  review mocked); `iso` = `full` at chroma ×0.75 with a dark line where `arg f` crosses a multiple of
  30° (computed from the phase directly: `abs(fract(hue/(π/6)) − 0.5)` within a pixel-derived width,
  using `fwidth`), the modulus banding kept; `textbook` = the GL canvas cleared to the theme's paper
  colour and the ink layer drawing axes with `Re` / `Im` labels, a unit grid, the contour with
  arrowheads in the piece colours, poles as ⊗ with typeset-style labels (plain text on canvas is
  acceptable here: `e^{iπ/4}` drawn as `e` with a raised `iπ/4`), cuts dashed with their label. The
  modulus toggle stays independent.
- The CET-C6 table: 256 RGB triples in `cetC6.ts`, sourced from Peter Kovesi's published CET-C6 data
  (CC-BY 4.0; cite in the file header). If the data cannot be fetched in the session, **keep the
  OKLCH ramp for `full`, record the finding, and leave `cetC6.ts` as a stub that the next session
  fills** — do not hand-type an approximation and call it CET-C6 (the current shader's comment already
  forbids that).
- `stageMode` in `ShellState.view` and the codec (optional key, default quiet on decode); the figure
  export uses the current mode.
- Re-run the CPU/GPU parity gate (`test/cutParity.browser.test.ts`) — the correction is unchanged but
  the sampling around it is.

**Tests.** Browser: for A6 in each mode, `canvas.gl` reads back the expected distinct-colour count
class (full > quiet > textbook = 1 for the GL layer) and the iso mode has more dark pixels than full;
node: the codec round-trips `stageMode` and defaults it.

**Done when.** The four modes switch live from the bar, the parity test is green, pushed.

### Step 1.10 — hover readout and hover linking (S)

**Files.** `src/shell2/stageController.ts`, `src/shell2/readout.ts`, the contour and derivation
cards, tests.

**Do.** With no gesture active, pointer moves update `session.hover = { z, piece, handle }`; the
readout (top-left of the stage, tabular figures) shows `z`, `f(z)`, `|f|`, `arg f` in degrees, and the
piece name when `onContour` reports one; under a declaration it shows which determination it reads
(the declared window). `f` comes from the resolution (`res.f` for plain and declared; `run.f` for
gallery). Hover on a piece row, a derivation line with `pieceId`, or an accumulator segment sets the
same `session.hover.piece`, and all three surfaces render the highlight from it.

**Done when.** The readout appears on hover and the three-way highlight works (jsdom test for the
row → stage → strip direction via the session; browser test that the ink highlight pixels change);
pushed.

### Step 1.11 — undo and redo (S)

**Files.** `src/shell2/undo.ts`, `commit`, the stage controller, tests.

**Do.** `commit(next, why)` pushes the previous state when `why` is a discrete edit or the **start** of
a gesture or scrub run (not per frame); gestures push once at `pointerdown` and scrubs once at the
first `input`; keyboard nudges coalesce by target within 800 ms. Ctrl/Cmd+Z undoes, Shift+Ctrl/Cmd+Z
redoes; the pen keeps its own Backspace while a path is open. Camera-only changes (pan, zoom, fit) are
not undo entries. `applyState` from a link clears both stacks. A cap of 100 entries.

**Done when.** A drag across a pole, undo, restores the verdict (jsdom test through the controller);
ten arrow nudges are one entry; pushed.

### Step 1.12 — parity, cutover, deletion (M)

**Files.** `M8/parity.md`, `src/main.ts`, `src/shell/app.ts` (deleted), `src/ui/app.css` (deleted),
`test/shell.test.ts`, `test/pen.test.ts` (DOM half), `test/drillShell.test.ts`,
`test/narrowLayout.browser.test.ts` (deleted), `scripts/a11y-audit.mjs` (selectors), `README.md`,
directory rename `src/shell2 → src/shell` (with the surviving old files moved in first).

**Do.**
- Complete `M8/parity.md`: every capability listed in `review-inputs/shell-review.md` §1–§2 and every
  behaviour test of the three old jsdom files, each with the shell2 test that covers it or an explicit
  "dropped, because …" (expected drops: the phone/tablet layouts; the three redundant pole listings;
  the full-screen overlays).
- Swap `main.ts` to the new shell unconditionally; delete the old shell, its stylesheet, its DOM tests
  and the narrow-layout test; move the surviving `src/shell/*` files and rename the directory; fix
  imports; update the a11y roster's selectors (the drill page's `select.drillPick` equivalent).
- The phone notice: below 900 px the grid is replaced by a centred card, "Contour Integration is built
  for a desktop or laptop screen. Open this link on one to explore it." with the permalink shown
  as text.
- Delete `src/ui/app.css`'s successor of anything not used; the CSS budget is `theme.css` + `shell.css`.

**Done when.** `pnpm --filter contour-integration test` and `test:browser` green; parity.md has no
row without a test or a reason; pushed.

### Step 1.13 — Phase 1 gate (S)

- Full gate; browser suite; `pnpm a11y` for the app's roster entries (the baseline may change since
  the page changed — record the new baseline and every new rule with its reason; the target is zero
  rules, as M6.4 achieved).
- Screenshots at 1440×900 and 1280×800 of A6, D1, G1, the sandbox with the keyhole, the front door,
  and each stage mode, committed under `M8/screens/phase1/`.
- STATUS.md: Phase 1 closed; Phase 2 step 2.1 next.

## 5. Phase 2 — prose and figures *(Part 3)*
## 6. Phase 3 — the teaching layer *(Part 3)*
## 7. Phases 4 and 5 — the piece editor, and closing *(Part 3)*
