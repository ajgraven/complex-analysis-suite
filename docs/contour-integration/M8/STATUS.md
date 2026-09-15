# M8 status — read first, update last

Plan: [`../M8-plan.md`](../M8-plan.md). Branch: `claude/inspiring-keller-5sizwl`.
Rule: do the step named under **Current**, update this file, commit, push. Never end a session with
unpushed work. A step that cannot be done as written is recorded under **Findings**, not silently
changed.

## Current

- **Plan drafting:** complete (Parts 1–3, §0–§9). No drafting action remains.
- **Execution:** Phase 0 in progress. The owner approved the five blanket decisions.
  **Step 0.5b is SPLIT** (see Findings) and **0.5b is now COMPLETE** — 0.5b-i (the ledger's own
  sentences and the renderer), 0.5b-ii (the bound modules, the theorem identities and the solve) and
  0.5b-iii (the rest of `kernel/*`, `engine/*` and `families/*`). The review document reads
  **0 flagged, 0 unapplied**, against 191 flagged when the five decisions were approved.
  **Step 0.6 is done** — all 28 records carry the four-line standard, the taxonomy is the eight
  groups, and the front row is declared. **Next execution action: step 0.7**, the Phase 0 gate and
  the solo merge of Phase 0 to `master`.
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

| 2026-09-15 | **0.6** | 1732f42 | the four-line standard on all 28 records — human `title` + `titleLatex`, `description.{contour, point, citations}` over an eight-book enum, `taxonomySection` reduced to the eight groups, `frontRow` on the eight classics; `Golden.label` names each variant derivation; loader invariant 5 + corpus-level front-row uniqueness; `test/records.test.ts` (7 tests); GALLERY.md §0 |

| 2026-09-15 | **0.5b-iii** | 788e292 | the five rules through the rest of `kernel/*`, `engine/*` and `families/*`; **152 → 0 flagged, 0 unapplied**; `everySentence` made the one corpus walk; two new corpus checks (balanced `$`, KaTeX strict); 41 wording-pinned node tests + 2 browser tests updated; new `ledger-dump.txt` baseline |

| 2026-09-15 | **0.5b-ii** | 573fb8c | the five rules through `kernel/bounds/*`, the three theorem identities, `derivation.ts`'s solve stage and `solveTarget.ts`; `latex` on the solved value; 65 wording-pinned tests updated; 191 → 152 flagged |

## Findings (things learned while executing; each names its step)

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
- **(0.6) THE FRONT ROW IS NOT A TOUR OF THE TAXONOMY, and the test found it.** Eight classics and
  eight groups look designed to pair, but the plan's list puts D1 and D4 both among the keyholes and
  leaves *dogbones and the residue at infinity* unrepresented. I kept the plan's eight rather than
  silently swapping D4 for D6, pinned the real number (7 distinct groups) so a later change is
  deliberate, and raised it as an open question.
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

- **(0.6) Should the front row be a tour of the taxonomy?** The plan names A1, A6, B1, C1, D1, D4,
  F2, G1 as the eight classics, and they cover seven of the eight groups — D1 and D4 are both
  keyholes, and *dogbones and the residue at infinity* has no front-row entry. Swapping D4 for D6
  would make the row one-per-group at the cost of dropping a more famous integral. Built as the plan
  names it; one line in `d4-log-squared-keyhole.ts` and `d6-dogbone-inverse-sqrt.ts` either way.
- Otherwise none open. The five blanket decisions are approved and **applied in full**: the review document reads 0 flagged, 0 unapplied.
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
