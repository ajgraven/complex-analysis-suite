# M8 status — read first, update last

Plan: [`../M8-plan.md`](../M8-plan.md). Branch: `claude/inspiring-keller-5sizwl`.
Rule: do the step named under **Current**, update this file, commit, push. Never end a session with
unpushed work. A step that cannot be done as written is recorded under **Findings**, not silently
changed.

## Current

- **Plan drafting:** complete (Parts 1–3, §0–§9). No drafting action remains.
- **Execution:** not started. **Next execution action:** Phase 0, step 0.1 (an Opus session; suggested
  session A = steps 0.1 + 0.2).
- **Last commit:** see `git log -1` on the branch; this file is updated in the same commit as the work
  it describes.

## Done

| date | step | commit | notes |
|---|---|---|---|
| 2026-09-14 | review | 3f3c9da | review published; working materials under `review-inputs/` |
| 2026-09-15 | plan Part 1 | 5efe5b9 | §0–§3, ADR-0043, CLAUDE.md pointer; the brief's "even" sentence corrected |
| 2026-09-15 | plan Part 2 | a50b5ed | §4, Phase 1 in full: architecture, thirteen steps, ten suggested sessions |
| 2026-09-15 | plan Part 3 | (this commit) | §5–§9: Phases 2–5 in full, the M8 risk register, the step index (42 steps, 28 sessions) |

## Findings (things learned while executing; each names its step)

- (review) `@cas/expr` already exports `toLatex` (`packages/expr/src/latex.ts`), used by three sibling
  apps. Step 0.4 measures its coverage rather than writing a printer.
- (review) The shell review's claim that no LaTeX printer exists was wrong on that one point; its other
  findings were verified.

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
