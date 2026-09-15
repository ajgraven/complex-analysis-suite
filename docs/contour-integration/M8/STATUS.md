# M8 status — read first, update last

Plan: [`../M8-plan.md`](../M8-plan.md). Branch: `claude/inspiring-keller-5sizwl`.
Rule: do the step named under **Current**, update this file, commit, push. Never end a session with
unpushed work. A step that cannot be done as written is recorded under **Findings**, not silently
changed.

## Current

- **Plan drafting:** complete (Parts 1–3, §0–§9). No drafting action remains.
- **Execution:** Phase 0 in progress. **Next execution action:** step 0.2 (the display vocabulary),
  an S step — the rest of suggested session A.
- **Last commit:** see `git log -1` on the branch; this file is updated in the same commit as the work
  it describes.

## Done

| date | step | commit | notes |
|---|---|---|---|
| 2026-09-14 | review | 3f3c9da | review published; working materials under `review-inputs/` |
| 2026-09-15 | plan Part 1 | 5efe5b9 | §0–§3, ADR-0043, CLAUDE.md pointer; the brief's "even" sentence corrected |
| 2026-09-15 | plan Part 2 | a50b5ed | §4, Phase 1 in full: architecture, thirteen steps, ten suggested sessions |
| 2026-09-15 | plan Part 3 | c014bdf | §5–§9: Phases 2–5 in full, the M8 risk register, the step index (42 steps, 28 sessions) |
| 2026-09-15 | **0.1** | (this commit) | the six wrong claims on screen; `families/describe.ts`; `test/onScreenClaims.test.ts` (17 tests, sweep 7/7). Full gate green: 543 files / 5640 tests, lint and typecheck silent, browser suite 132/132 |

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
- **(0.1) `Family.closedForm` gains `simplifiedWhen`** — an `@cas/expr` boolean in the family's
  parameters, absent meaning unrestricted. A condition that cannot be decided withholds the general
  form rather than showing it unguarded: the guard exists because an unguarded form was wrong, so
  "could not tell" falls on the side of saying less.
