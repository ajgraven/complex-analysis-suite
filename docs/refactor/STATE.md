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
- **Phase D — Execute. Group A + B1 + B2 + B4-1 + B4-2a MERGED.** (B2 #182 solvers 77s→37s; B4-1 #183 ui-solve net;
  B4-2a #184 PSW crash net, merge `7a025e3`.)
- **Stage B4-2b (SymWorker crash net) — IMPLEMENTED, GREEN, PR #185 OPEN (CI pending).** Tests-only, no source
  change. `vitest/sym-worker-crash-char.test.ts` (3 tests, reuses `fake-worker.mjs`): worker `error` in-flight →
  reject /sym-worker crashed/; **F4** idle error → sticky `_fallback`; messageerror absence. Mutation-verified.
- **⭐ The worker-CRASH contract net is now COMPLETE for all 3 solver lanes** (PSW ×3 via B4-2a + sym via B4-2b) —
  the high-value part of the worker-lane net that gates Group C's `createWorkerLane` dedup.
- **Remaining B4-2 = P2 polish only** (schwarz `isUsable`/preempt/`handle.cancel`/`onUnavailable` — schwarz
  crash-settle already covered; param-slice-pool event-wiring/survivor, N-worker shape) → **optional B4-2c or fold
  into Group C**. **B4 scope forks still DEFERRED** (flagged): ui.mjs seam (own stage before D2); algebra source-text (→ D1).
- Cadence: merge on green (user delegates). `APPROVED: PLAN.md v1`. Roadmap §8: A✓/B(B1✓,B2✓,B3 skip,B4-1✓,B4-2a✓,**B4-2b in review**)/C/D/E/F.

## Branches / PR
- Integration `refactor/main` @ 7a025e3 (this STATE commit advances it). Tree clean.
- **PR #185 OPEN (CI pending):** `refactor/B4-2b-lanes` (932fb64 test + 831e5ab docs) → `refactor/main`.
- Merged stage PRs: A1 #178, A3 #179, A2 #180, B1 #181, B2 #182, B4-1 #183, **B4-2a #184 (7a025e3)**.

## Validation state (green bar)
- **B4-2b branch @ 831e5ab — ALL GREEN:** build/typecheck/lint exit 0; `pnpm test` **2081 passed / 239 files** (+3/+1).
  Mutation-verified (break F4 → 1 fail → reverted, byte-identical).
- `refactor/main` @ 7a025e3 (post-B4-2a) was green: 2078/238. browser not run for B4 (node/jsdom test-infra, no GPU).

## Uncommitted / unverified
- None. B4-2b committed (932fb64, 831e5ab) + pushed; PR #185 open. This STATE commit direct to main.

## Known blockers / risks
- **Awaiting PR #185 CI green**, then merge (per cadence). CI: prior stages green.
- Deferred (flagged; user may redirect): B4-2c P2 gaps; the scope forks (ui.mjs-seam, algebra source-text).

## Next concrete steps
1. **When PR #185 CI greens → merge** (merge-commit, title + `(#185)`), pull, re-confirm green.
2. Then a **decision point** (natural boundary — the high-value B4 net is done): (a) **B4-2c** schwarz/pool P2 gaps
   (tests-only, optional); (b) take up a **deferred scope fork** — the `ui.mjs` seam stage (a small sign-off-worthy
   SOURCE change) or the algebra source-text conversion; (c) **Group C** (dup collapse — the `createWorkerLane`
   factory + typed protocol, now guarded by this crash net); or (d) pause. Group B is essentially complete.
3. Group order after B: C (dup collapse) → D (god-module decomp) → E (state+folderize) → F (dependency-cruiser).

## Resume commands
```
git fetch && git checkout refactor/main && git pull        # after #185 merges
pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm lint && pnpm test  # expect 2081/239
```
