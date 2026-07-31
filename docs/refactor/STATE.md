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
- **Phase D — Execute. Group A + B1 + B2 + B4-1 + B4-2a + B4-2b MERGED. Group B (test Stage 0) COMPLETE.**
- **Group C STARTED — Stage C1a: IMPLEMENTED, GREEN, PR #186 OPEN (CI pending).** The first STRUCTURAL refactor:
  `createWorkerLane(cfg)` factory collapses the 3 PSW lanes (primary/aux/live) to config — primary-solver-worker.mjs
  **395→238 (−40%)**. **Behavior-preserving** (proven: the B4-2a/b net stays green — psw-crash-char 7 + psw-lifecycle
  13 = 20/20; full 2081/239). Independent fallback latches kept; primary-only messageerror preserved. Merge on green.
- **Remaining C1 → C1b:** sym / schwarz / param-slice-pool lanes onto the same factory (own PR — different files +
  schwarz/pool quirks). Then **C2** (QD-UI-4 typed protocol), **C3** (defineFamily). **B4 scope forks still DEFERRED**
  (flagged): ui.mjs seam (own stage before D2); algebra source-text (→ D1); B4-2c P2 lane polish (optional).
- Cadence: merge on green (user delegates). `APPROVED: PLAN.md v1`. Roadmap §8: A✓ / B✓ / **C (C1a in review, C1b/C2/C3)** / D / E / F.

## Branches / PR
- Integration `refactor/main` @ ecb5124 (this STATE commit advances it). Tree clean.
- **PR #186 OPEN (CI pending):** `refactor/C1a-psw-lane-factory` (86c7bcf refactor + 81dacdf docs) → `refactor/main`.
- Merged stage PRs: A1 #178, A3 #179, A2 #180, B1 #181, B2 #182, B4-1 #183, B4-2a #184, **B4-2b #185 (ecb5124)**.

## Validation state (green bar)
- **C1a branch @ 81dacdf — ALL GREEN:** build/typecheck/lint exit 0; `pnpm test` **2081 passed / 239 files** (count
  UNCHANGED — source refactor, no test added). The PSW net (psw-crash-char + psw-lifecycle) = **20/20** before AND after.
- `refactor/main` @ ecb5124 (post-B4-2b) was green: 2081/239. browser not run for C1a (worker-client glue, no GPU).

## Uncommitted / unverified
- None. C1a committed (86c7bcf, 81dacdf) + pushed; PR #186 open. This STATE commit direct to main.

## Known blockers / risks
- **Awaiting PR #186 CI green**, then merge (per cadence). C1a is the first behavior-adjacent (but behavior-PRESERVING)
  change of Group C; guarded by the net. CI: prior stages green.
- Deferred (flagged; user may redirect): C1b lanes, C2/C3; the scope forks (ui.mjs-seam, algebra); B4-2c P2.

## Next concrete steps
1. **When PR #186 CI greens → merge** (merge-commit, title + `(#186)`), pull, re-confirm green.
2. Then (natural boundary after the first Group-C win): (a) **C1b** — sym/schwarz/pool lanes onto `createWorkerLane`
   (behavior-preserving, net-guarded — the schwarz/pool nets from B4-2b's deferred P2 may want shoring up first);
   (b) **C2** typed worker protocol; (c) a **deferred scope fork** (ui.mjs seam / algebra); or (d) pause.
3. Group order: C (dup collapse) → D (god-module decomp) → E (state+folderize) → F (dependency-cruiser).

## Resume commands
```
git fetch && git checkout refactor/main && git pull        # after #186 merges
pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm lint && pnpm test  # expect 2081/239
```
