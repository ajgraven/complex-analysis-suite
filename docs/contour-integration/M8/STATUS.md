# M8 status — read first, update last

Plan: [`../M8-plan.md`](../M8-plan.md). Branch: `claude/inspiring-keller-5sizwl`.
Rule: do the step named under **Current**, update this file, commit, push. Never end a session with
unpushed work. A step that cannot be done as written is recorded under **Findings**, not silently
changed.

## Current

- **Plan drafting:** complete (Parts 1–3, §0–§9). No drafting action remains.
- **Execution:** Phase 0 in progress. **Next execution action:** step 0.4 (LaTeX for everything the
  records and the engine print) — an M step, suggested session C.
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

## Open questions for the owner

- none at present. (0.5a will ask for a review of `claims.md` before Phase 0 merges.)

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
