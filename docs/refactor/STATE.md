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
- **Phase D — Execute. Stage A1: PR #178 OPEN, awaiting your review. I do NOT merge my own PR.**
  **Do NOT start the next stage until #178 merges** (one stage branch in flight).
- `APPROVED: PLAN.md v1` received; decisions recorded (D-1 align `{re:0}`, D-2 folderize late,
  D-3 include E1 last, D-4 keep `harness.ok` wrapped).
- A1 done & green on `refactor/A1-confirmed-defects`: QD-SOLV-3 (centroid → `QD.poleCentroid`, D-1
  behavior change, char-tested) + QD-SOLV-2 (CONTRIBUTING doc). QD-ALG-7 & QD-SOLV-6 **deferred out of
  A1** (scope narrowed — see LOG).
- Roadmap (PLAN §8): A(quick wins)/B(test Stage 0, B4=net)/C(dup collapse)/D(god-module decomp)/
  E(state+folderize)/F(dependency-cruiser). Phase B complete; ASSESSMENT §1–4; 36 findings in ISSUES.

## Branches / PR
- Integration branch: `refactor/main` @ 6bea36c (cut from `master` @ b1e3004).
- Stage branch in flight: `refactor/A1-confirmed-defects` @ 35e7d31.
- **Open PR: #178** (`refactor/A1-confirmed-defects` → `refactor/main`) — awaiting review.
  https://github.com/ajgraven/complex-analysis-suite/pull/178

## Validation state (green bar) — established 2026-07-30 @ b1e3004; all green, no pre-existing failures
- build:      `pnpm build`      → exit 0
- typecheck:  `pnpm typecheck`  → exit 0
- lint:       `pnpm lint`       → exit 0
- test:       `pnpm test`       → exit 0  (206 files / 2017 tests, ~156s; QD node-suite ~128s of that)
- browser (not in core bar): `pnpm test:browser` (Chromium preinstalled; not yet run)
- format:     `pnpm format:check`

## Uncommitted / unverified
- None. A1 work is committed & pushed on its branch; PR #178 open. `refactor/main` tree clean.
- A1 branch green bar (this session): build/typecheck/lint exit 0; `pnpm test` 2023 passed / 207 files.

## Known blockers / risks
- CI health unknown (July review reported an exhausted GH Actions spending limit). Treat the LOCAL
  green bar as source of truth; report CI per PR without blocking on it.

## Next concrete steps
1. **WAIT for PR #178 review/merge.** Do not start A2/A3 while it is open. I never merge my own PR.
2. If #178 gets change requests: address on `refactor/A1-confirmed-defects`, re-run the green bar, push.
3. On merge: `git checkout refactor/main && git pull`; confirm green + clean; cut the next stage branch.
   Recommended next: **A3** (CD type-only cycle, zero-risk) or **A2** (dispatch-order assertion), then
   **Group B** (test Stage 0 — B1 port node-suite, B2 shard solvers, B4 the characterization net).

## Resume commands
```
git fetch && git checkout refactor/main && git log --oneline -10 refactor/main
pnpm install --frozen-lockfile
pnpm build && pnpm typecheck && pnpm lint && pnpm test
```
