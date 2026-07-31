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
- **Phase D — Execute. Group A + B (test Stage 0) COMPLETE. Group C STARTED: C1a MERGED (#186).**
- **C1a (DONE, merged 007681a):** first STRUCTURAL refactor — `createWorkerLane(cfg)` factory collapses the
  3 PSW lanes (primary/aux/live) to config; `primary-solver-worker.mjs` **395→238 (−40%)**. Behavior-preserving,
  proven by the B4-2a/b net staying green (psw-crash-char 7 + psw-lifecycle 13 = 20/20). Independent fallback
  latches kept; primary-only messageerror preserved.
- **AWAITING USER DIRECTION** (holding — do not auto-start). Decision point after this first Group-C win:
  - **(a) C1b** — sym / schwarz / param-slice-pool lanes onto the same `createWorkerLane` factory. ⚠ Guardrail:
    sym IS netted (B4-2b), but **schwarz** (isUsable/preempt/handle.cancel/onUnavailable) and **param-slice-pool**
    (event-wiring/survivor) net gaps are **open (deferred B4-2c P2)** — those must be closed BEFORE collapsing
    schwarz/pool (no refactor without a pinned net). So C1b likely = a B4-2c net-shoring stage first, then collapse.
  - **(b) C2** — typed worker protocol (QD-UI-4); orthogonal to the lane net gaps.
  - **(c) deferred scope fork** — ui.mjs seam (own stage before D2) / algebra source-text (→ D1).
  - **(d) pause.**
- Cadence: merge on green (user delegates). `APPROVED: PLAN.md v1`. Roadmap §8: A✓ / B✓ / **C (C1a✓; C1b/C2/C3 left)** / D / E / F.

## Branches / PR
- Integration `refactor/main` @ **007681a** (C1a merge-commit). Tree clean. **No open stage PR.**
- Merged stage PRs: A1 #178, A3 #179, A2 #180, B1 #181, B2 #182, B4-1 #183, B4-2a #184, B4-2b #185,
  **C1a #186 (007681a)**.

## Validation state (green bar)
- **`refactor/main` @ 007681a — ALL GREEN (re-confirmed post-merge):** build/typecheck/lint exit 0;
  `pnpm test` **2081 passed / 239 files** (unchanged — C1a was a source refactor, no test added). PSW net
  (psw-crash-char + psw-lifecycle) = **20/20**. Wall ~65s this run. browser: green on PR #186 CI.

## Uncommitted / unverified
- None. C1a merged; this STATE commit direct to `refactor/main`.

## Known blockers / risks
- No open PR; **holding for user direction** on the decision point above. No blockers.
- Guardrail note for C1b: schwarz/param-slice-pool lane nets are incomplete (B4-2c P2) — collapsing those
  lanes onto the factory requires closing those net gaps first.

## Next concrete steps
1. **HOLD** — await user's choice among (a) C1b / (b) C2 / (c) deferred scope fork / (d) pause.
2. If (a) C1b: shore schwarz + param-slice-pool nets (B4-2c, tests-only) FIRST, then collapse remaining lanes.
3. Group order: C (dup collapse) → D (god-module decomp) → E (state+folderize) → F (dependency-cruiser).

## Resume commands
```
git fetch && git checkout refactor/main && git pull
pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm lint && pnpm test  # expect 2081/239
```
