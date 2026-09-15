# M8 status — read first, update last

Plan: [`../M8-plan.md`](../M8-plan.md). Branch: `claude/inspiring-keller-5sizwl`.
Rule: do the step named under **Current**, update this file, commit, push. Never end a session with
unpushed work. A step that cannot be done as written is recorded under **Findings**, not silently
changed.

## Current

- **Plan drafting:** Part 1 written (§0–§3). **Next drafting action:** write Part 2 (§4, Phase 1 in
  full) — a Fable session, about one S step.
- **Execution:** not started. **Next execution action:** Phase 0, step 0.1 (an Opus session; suggested
  session A = steps 0.1 + 0.2).
- **Last commit:** see `git log -1` on the branch; this file is updated in the same commit as the work
  it describes.

## Done

| date | step | commit | notes |
|---|---|---|---|
| 2026-09-14 | review | 3f3c9da | review published; working materials under `review-inputs/` |
| 2026-09-15 | plan Part 1 | (this commit) | §0–§3, ADR-0043, CLAUDE.md pointer; the brief's "even" sentence corrected |

## Findings (things learned while executing; each names its step)

- (review) `@cas/expr` already exports `toLatex` (`packages/expr/src/latex.ts`), used by three sibling
  apps. Step 0.4 measures its coverage rather than writing a printer.
- (review) The shell review's claim that no LaTeX printer exists was wrong on that one point; its other
  findings were verified.

## Open questions for the owner

- none at present. (0.5a will ask for a review of `claims.md` before Phase 0 merges.)

## Decisions taken during execution

- none yet.
