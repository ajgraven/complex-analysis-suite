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
- **Phase D — Execute. Group A + B COMPLETE. Group C in progress: C1a MERGED (#186).**
- **B4-2c (net-first for C1b) — PR #187 OPEN (CI pending).** Tests-only: pins the schwarz + param-slice-pool
  lane paths the crash net omitted (schwarz `isUsable`/`onUnavailable`/streaming/preempt/`handle.cancel`/
  cancel-before-spawn = 9; pool `runSweep` event-wiring + survivor=0 drain = 2). Mutation-verified; green 2092/240.
  **QD-UI-1: all 6 solver-worker lanes' crash+lifecycle contract is now pinned.**
- **⚠ FINDING — C1b REVISED.** Read all 4 lane sources vs the C1a factory: the 3 remaining lanes do NOT fit
  `createWorkerLane`. sym = terminate-on-supersede + progress + F4 idle-latch; schwarz = `isUsable` gate + streaming
  `{cancel()}` handle; param-slice = an N-worker POOL. Collapsing them onto one factory = over-generalized config-flag
  monster (against the clarity north-star + ADR-0007/0008). **So C1b = extract only the genuinely-shared FRAGMENT**
  (worker `error`/`messageerror` → settle-in-flight + teardown — the drift-prone piece that shipped the schwarz
  Pass-1/3 bug; + lazy ensureReady+fallback-latch), used by all lanes incl. retrofitting the C1a factory — NOT a
  lane-collapse. PLAN v1 C1 "6 lanes = config" done-criterion needs revision → **design-gate confirm before I implement.**
- Cadence: merge on green (user delegates). `APPROVED: PLAN.md v1`. Roadmap §8: A✓ / B✓ / **C (C1a✓; B4-2c in review; C1b-frag/C2/C3)** / D / E / F.

## Branches / PR
- Integration `refactor/main` @ **e38d035** (this STATE commit advances it). Tree clean.
- **PR #187 OPEN (CI pending):** `refactor/B4-2c-schwarz-pool-lane-nets` (bf5f49f) → `refactor/main`.
- Merged stage PRs: A1 #178, A3 #179, A2 #180, B1 #181, B2 #182, B4-1 #183, B4-2a #184, B4-2b #185, **C1a #186 (007681a)**.

## Validation state (green bar)
- **B4-2c branch @ bf5f49f — ALL GREEN:** build/typecheck/lint exit 0; `pnpm test` **2092 passed / 240 files**
  (+11 tests, +1 file vs refactor/main). Mutation-verified (3 guards → each fails only its target → reverted via Edit).
- `refactor/main` @ e38d035 (post-C1a) green: 2081/239, PSW net 20/20.

## Uncommitted / unverified
- None. B4-2c committed (bf5f49f) + pushed; PR #187 open. This STATE commit direct to `refactor/main`.

## Known blockers / risks
- **Awaiting PR #187 CI green**, then merge (per cadence). Tests-only, zero behavior risk.
- **C1b needs a design-gate confirm** (fragment-extraction, not lane-collapse — see FINDING). Behavior-preserving +
  fully net-guarded (the complete 6-lane net) once B4-2c lands.

## Next concrete steps
1. **When PR #187 CI greens → merge** (merge-commit, title + `(#187)`), pull, re-confirm green (expect 2092/240).
2. **C1b (revised): extract the shared worker crash-settle + ensureReady-latch fragment** as a helper used by all
   6 lanes (retrofit the C1a factory too). Behavior-preserving, guarded by the complete 6-lane net. Present the
   1-paragraph design at the gate for a quick confirm (it revises PLAN v1's C1 premise), then implement.
3. Then **C2** (typed worker protocol) / **C3** (defineFamily). Group order: C → D → E → F.

## Resume commands
```
git fetch && git checkout refactor/main && git pull        # after #187 merges
pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm lint && pnpm test  # expect 2092/240
```
