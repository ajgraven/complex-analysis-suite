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
- **Phase D — Execute. Group A + B COMPLETE. Group C in progress: C1a + B4-2c MERGED.**
- **B4-2c (DONE, merged 551c9c6):** tests-only net — pinned the schwarz + param-slice-pool lane paths the crash
  net omitted (schwarz isUsable/onUnavailable/streaming/preempt/handle.cancel/cancel-before-spawn = 9; pool
  runSweep event-wiring + survivor=0 drain = 2). Mutation-verified. **QD-UI-1: all 6 solver-worker lanes' crash +
  lifecycle contract is now pinned** — the safety net for whatever Group-C lane work comes next.
- **AWAITING USER DIRECTION at the C1b DESIGN GATE** (holding — do not auto-start). The B4-2c finding revised C1b:
  the 3 remaining lanes do NOT fit `createWorkerLane` (sym = terminate-on-supersede + progress + F4 latch; schwarz
  = isUsable gate + streaming handle; param-slice = N-worker pool). Sound options:
  - **(a) C1b-fragment** — extract ONLY the shared worker `error`/`messageerror` → settle-in-flight + teardown +
    lazy-ensureReady-fallback-latch as a helper used by all 6 lanes (retrofit the C1a factory too). Behavior-
    preserving, fully net-guarded. Revises PLAN v1 C1 "6 lanes = config" → wants this confirm.
  - **(b) C2** — typed worker protocol (QD-UI-4); orthogonal to the lane shapes.
  - **(c) declare C1 DONE at C1a** — file the fragment as optional debt, move to C2/C3 or Group D.
  - **(d) pause.**
- Cadence: merge on green (user delegates). `APPROVED: PLAN.md v1`. Roadmap §8: A✓ / B✓ / **C (C1a✓, B4-2c✓; C1b?/C2/C3)** / D / E / F.

## Branches / PR
- Integration `refactor/main` @ **551c9c6** (B4-2c merge-commit). Tree clean. **No open stage PR.**
- Merged stage PRs: A1 #178, A3 #179, A2 #180, B1 #181, B2 #182, B4-1 #183, B4-2a #184, B4-2b #185, C1a #186,
  **B4-2c #187 (551c9c6)**.

## Validation state (green bar)
- **`refactor/main` @ 551c9c6 — ALL GREEN (re-confirmed post-merge):** build/typecheck/lint exit 0; `pnpm test`
  **2092 passed / 240 files**. The 6-lane worker net (psw-crash+lifecycle 20, sym-crash+lifecycle, schwarz-crash+
  lifecycle, param-slice-pool) is green.

## Uncommitted / unverified
- None. B4-2c merged; this STATE commit direct to `refactor/main`.

## Known blockers / risks
- No open PR; **holding at the C1b design gate** (see options above). No blockers.

## Next concrete steps
1. **HOLD** — await user's choice: (a) C1b-fragment / (b) C2 / (c) declare C1 done / (d) pause.
2. If (a): extract the shared crash-settle + ensureReady fragment; retrofit all 6 lanes incl. the C1a factory;
   behavior-preserving, guarded by the 6-lane net; own PR → refactor/main.
3. Group order: C → D (god-module decomp) → E (state+folderize) → F (dependency-cruiser).

## Resume commands
```
git fetch && git checkout refactor/main && git pull
pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm lint && pnpm test  # expect 2092/240
```
