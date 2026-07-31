# STATE — refactor engagement

> Living control file. Always current; keep under 100 lines. Committed directly to `refactor/main`
> at every checkpoint (it describes not-yet-merged work, so it must not sit behind an unmerged PR).
> Git and the working tree are authoritative for *what is true*; this file is authoritative only for
> *where we are*. On disagreement, trust git and correct this file.

## Objective
Multi-session architectural refactor of `complex-analysis-suite` — prioritizing maintainability/
extensibility, conceptual clarity, reliability/testability, and architectural coherence.
Behavior-preserving by default; no behavioral change without an explicit approval token.

## Phase / stage
- **Phase D — Execute. Group A + B COMPLETE. Group C: C1 DONE, C2 DONE, C3a DONE, C3b-1 DONE; C3b-2 in review.**
- **C3b part 2 — PR #192 OPEN (CI pending).** Retrofits the remaining 7 families onto `defineFamily` →
  **all 10 families now on the factory.** Behavior-preserving (C3a golden net 11/11; `pnpm test` 2114/242; node
  oracle 0 failed; build/typecheck/lint exit 0). Diffs confined to the Family literal + import (math untouched).
- **Process note:** part 2 ran via a subagent that committed batch 1 (0794629: unboundedLQD/boundedLQD_singular/
  unboundedLQD_singular incl. `{A,F,G}`) then **stalled** with the 4 PQD families edited-but-uncommitted and
  terminated silently. Main session took over — verified the tree (golden 11/11 + green bar), reviewed diffs (no
  math touched), committed the PQD batch (b9f0b9a). Nothing merged unverified.
- **On #192 merge → Group C (dedup collapse) COMPLETE** (C1 worker lanes, C2 typed protocol, C3 family factory).
  **QD-SOLV-4 RESOLVED.** **QD-SOLV-5 (seeds mirror) REMAINS OPEN** — seed wiring unified, but the seed *strategy*
  files (`solvers/seeds/*`) stay per-family; `seeds-common` not pursued (out of scope).
- Cadence: merge on green (user delegates). `APPROVED: PLAN.md v1`. Roadmap §8: A✓ / B✓ / **C (C1✓, C2✓, C3✓ on #192)** / D / E / F.

## Branches / PR
- Integration `refactor/main` @ **e0eed4b** (this STATE commit advances it). Tree clean.
- **PR #192 OPEN (CI pending):** `refactor/C3b2-define-family` (0794629 + b9f0b9a + 6895b6b docs) → `refactor/main`.
- Merged stage PRs: A1 #178, A3 #179, A2 #180, B1 #181, B2 #182, B4-1 #183, B4-2a #184, B4-2b #185, C1a #186,
  B4-2c #187, C1b #188, C2 #189, C3a #190, **C3b-p1 #191 (3ac7dc2)**.

## Validation state (green bar)
- **C3b2 branch @ 6895b6b — ALL GREEN (main-session-verified):** golden net 11/11 (all 10 families identical);
  build/typecheck/lint exit 0; `pnpm test` 2114/242; node oracle 0 failed.
- `refactor/main` @ e0eed4b (post-C3b-p1) green: 2114/242.

## Uncommitted / unverified
- None. C3b part 2 committed + pushed; PR #192 open. This STATE commit direct to `refactor/main`.

## Known blockers / risks
- **Awaiting PR #192 CI green**, then merge (per cadence). Behavior-preserving; net-guarded (golden 11/11 + oracle).

## Next concrete steps
1. **When PR #192 CI greens → merge** (title + `(#192)`), pull, re-confirm green (2114/242) → **Group C COMPLETE.**
2. Then the next big block is **Group D** (god-module decomposition: installAlgebra ~4.2k-line fn / ui.mjs ~20
   responsibilities; the deferred **ui.mjs-seam** stage comes first) — OR the smaller C2b/QD-SOLV-5 follow-ons, or
   pause. Present the choice at the post-merge gate.
3. Group order: C (DONE on #192) → D → E → F.

## Resume commands
```
git fetch && git checkout refactor/main && git pull        # after #192 merges
pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm lint && pnpm test  # expect 2114/242
```
