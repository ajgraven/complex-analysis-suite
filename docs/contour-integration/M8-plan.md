# M8 — the Contour Integration shell rebuild

> **Status: plan in progress.** Part 1 (this document's §0–§3: method, phase map, Phase 0 in full) is
> written. Parts 2 and 3 (§4 Phase 1 in full; §5–§7 Phases 2–5 in full) are written in later sessions
> and appended here. The live state of execution is in [`M8/STATUS.md`](M8/STATUS.md) — **read that
> first**, every session.

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
the figure export's print and light variants. The gallery's front door is eight classics as cards over a
seven-group taxonomy, each record carrying a standardised four-line description with chapter-level
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

## 4. Phase 1 — the new shell *(Part 2; to be written)*

Will specify, in the same step format: the `src/shell2/` skeleton and its keyed renderer (a small
`h()`-style DOM builder with keyed children, no framework — the suite has none and ADR-0007 forbids one
without a second consumer); the `Session` record beside `ShellState`; the two rails' cards and the
stage controller lifted from the old gesture machine; the stage modes and the CET-C6 map in
`phase.glsl.ts`; the front door; hover; undo; the numerics disclosure; ergonomics; cold start; the
phone notice; the parity checklist and the test re-expression; deleting `src/shell/app.ts`.

## 5. Phase 2 — prose and figures *(Part 3)*
## 6. Phase 3 — the teaching layer *(Part 3)*
## 7. Phases 4 and 5 — the piece editor, and closing *(Part 3)*
