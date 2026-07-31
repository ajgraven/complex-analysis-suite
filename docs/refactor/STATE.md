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
- **Phase D — Execute. Group A + B COMPLETE. Group C: C1 (worker-lane) DONE; C2 in review.**
- **C2 (typed worker protocol, QD-UI-4) — PR #189 OPEN (CI pending).** NEW `app/workers/protocol.mjs`
  (`reply`/`replyError` + `dispatch`); `solver-worker-entry.mjs` 53→31 (the 3-kind `if/else` chain → a handlers
  map + `dispatch`). Char-net-first (`vitest/worker-protocol.test.ts`: known-kind round-trip pinned + mutation-
  verified on the UNMODIFIED entry, commit aa0b98e; then the refactor, cb8fc86). Known kinds byte-identical;
  **unknown kind drop→error-reply is the one APPROVED change** (PLAN v1 C2 "unknown kind no longer hangs").
  Green 2103/241 (+11, +1 file). Merge on green.
- **AWAITING USER DIRECTION for the next stage** (after #189 merges). Options: **C2b** (route the sym/param-slice/
  schwarz entry reply-envelopes through `protocol.mjs` — envelope-DRY only, no hang there); **C3** (defineFamily,
  QD-SOLV-4/5 — golden residual-vector tests first); **Group D** (installAlgebra + ui.mjs decomp; ui.mjs-seam
  stage first); or **pause**.
- Cadence: merge on green (user delegates). `APPROVED: PLAN.md v1`. Roadmap §8: A✓ / B✓ / **C (C1✓; C2 in review; C2b?/C3)** / D / E / F.

## Branches / PR
- Integration `refactor/main` @ **5456ff1** (this STATE commit advances it). Tree clean.
- **PR #189 OPEN (CI pending):** `refactor/C2-worker-protocol` (aa0b98e char-net + cb8fc86 refactor) → `refactor/main`.
- Merged stage PRs: A1 #178, A3 #179, A2 #180, B1 #181, B2 #182, B4-1 #183, B4-2a #184, B4-2b #185, C1a #186,
  B4-2c #187, **C1b #188 (a6332d5)**.

## Validation state (green bar)
- **C2 branch @ cb8fc86 — ALL GREEN:** build/typecheck/lint exit 0; `pnpm test` **2103 passed / 241 files**
  (+11 tests, +1 file). Char net: known-kind round-trip green before AND after the refactor; unknown-kind
  assertion flipped to the fix; 6 `protocol.mjs` unit tests.
- `refactor/main` @ 5456ff1 (post-C1b) green: 2092/240.

## Uncommitted / unverified
- None. C2 committed (aa0b98e, cb8fc86) + pushed; PR #189 open. This STATE commit direct to `refactor/main`.

## Known blockers / risks
- **Awaiting PR #189 CI green**, then merge (per cadence). One approved behavior change (unknown-kind hang→settle);
  known-kind paths behavior-preserving + net-guarded.
- Next-stage direction open (C2b / C3 / Group D / pause) — decision at the post-merge gate.

## Next concrete steps
1. **When PR #189 CI greens → merge** (merge-commit, title + `(#189)`), pull, re-confirm green (2103/241).
2. Then the next stage (user's call): **C2b** (other entries' envelope DRY) / **C3** (defineFamily — golden-residual
   -first) / **Group D** (installAlgebra + ui.mjs; ui.mjs-seam first) / pause.
3. Group order: C (C1✓, C2✓; C2b/C3 optional) → D → E → F.

## Resume commands
```
git fetch && git checkout refactor/main && git pull        # after #189 merges
pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm lint && pnpm test  # expect 2103/241
```
