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
- **Phase D — Execute. Group A + B1 + B2 + B4-1 MERGED.** (B2 #182 solvers shard 77s→37s; B4-1 #183 ui-solve net.)
- **Stage B4-2a (PSW worker-lane crash net) — IMPLEMENTED, GREEN, PR #184 OPEN (CI pending).** Tests-only, no
  source change. Shared `vitest/helpers/fake-worker.mjs` + `vitest/psw-crash-char.test.ts` (7 tests): PSW crash-
  settle × 3 lanes, primary messageerror, the aux/live messageerror ASYMMETRY (frozen for C2), 3rd fallback-latch
  independence direction. Mutation-verified. Merge on green per cadence.
- **B4-2 split** (per scoping map, additive — existing lane tests untouched): **B4-2a** ✅ (this PR); **B4-2b** =
  sym + schwarz + param-slice-pool lane gaps (follow-up). The 6× lane dedup itself → **Group C** (this net guards it).
- **B4 scope forks still DEFERRED** (flagged to user): ui.mjs seam (→ own stage before D2); algebra source-text
  conversion (→ D1). User may redirect.
- Cadence: merge on green (user delegates). `APPROVED: PLAN.md v1`. Roadmap §8: A✓/B(B1✓,B2✓,B3 skip,B4-1✓,**B4-2a in review**,B4-2b)/C/D/E/F.

## Branches / PR
- Integration `refactor/main` @ 6ebc079. Tree clean.
- **PR #184 OPEN (CI pending):** `refactor/B4-2-worker-lanes` (48f89cb test + 5845056 docs) → `refactor/main`.
- Merged stage PRs: A1 #178, A3 #179, A2 #180, B1 #181, B2 #182, B4-1 #183 (e1a148a).

## Validation state (green bar)
- **B4-2a branch @ 5845056 — ALL GREEN:** build/typecheck/lint exit 0; `pnpm test` **2078 passed / 238 files**
  (+7 / +1 vs 2071/237). Mutation-verified (aux messageerror handler → 1 fail → reverted, byte-identical).
- `refactor/main` @ e1a148a was green (2071/237). browser not run for B4 (node/jsdom test-infra, no GPU).

## Uncommitted / unverified
- None. B4-2a committed (48f89cb, 5845056) + pushed; PR #184 open. This STATE commit direct to main.

## Known blockers / risks
- **Awaiting PR #184 CI green**, then merge (per cadence). CI health: prior stages green — July budget note likely stale.
- Scope forks (ui.mjs-seam, algebra) deferred, flagged; user may redirect.

## Next concrete steps
1. **When PR #184 CI greens → merge** (merge-commit, title + `(#184)`), pull refactor/main, re-confirm green.
2. **B4-2b — remaining lane gaps** on a fresh `refactor/B4-2b-lanes` (tests-only, reuse `fake-worker.mjs`):
   sym (error-with-job → reject + detach; F4 idle-error → sticky fallback; messageerror absence); schwarz
   (`isUsable()` matrix incl. file://; renderField preempt; `handle.cancel`; `onUnavailable`); param-slice-pool
   (event-WIRING → `_onWorkerError`; survivor re-dispatch with N>1). Map has file:line for each. Mutation-verify.
3. Then the DEFERRED B4-scope decision (ui.mjs-seam stage / algebra→D1), then **C (dup collapse — the lane
   factory this net guards)** → D → E → F.

## Resume commands
```
git fetch && git checkout refactor/main && git pull        # after #184 merges
pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm lint && pnpm test  # expect 2078/238
# B4-2b work: git checkout -b refactor/B4-2b-lanes   (reuse vitest/helpers/fake-worker.mjs)
```
