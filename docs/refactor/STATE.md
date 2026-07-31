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
- **Phase D — Execute. Group A + B1 + B2 MERGED.** B2 = #182 (`e74d3e6`): solvers 4-way shard; long-pole 77s→37s.
- **Stage B4-1 (ui-solve orchestration net) — IMPLEMENTED, GREEN, PR #183 OPEN (CI in progress).** Cadence:
  merge on green (user delegated). Then B4-2.
- **B4 SCOPE CORRECTION (verified, flagged to user in PR #183):** `ui.mjs` has **no test seam** (0 exports, boots
  on import) ⇒ not characterizable without a source change; the "~15 source-text tests" are **`algebra-ui.mjs`**
  (a different module). So B4 narrowed to the no-source-change net: **B4-1** = `ui-solve.mjs` orchestration ✅;
  **B4-2** = worker-lane net (6 lanes + shared fake-Worker helper); **DEFERRED** ui.mjs-seam (own stage before D2)
  + algebra source-text conversion (→ D1). Proceeded on the recommendation per user "proceed"/"continue"; user may redirect.
- Roadmap (PLAN §8): A✓ / B(B1✓, B2✓, B3 skipped, **B4-1 in review**, B4-2 next) / C / D / E / F. `APPROVED: PLAN.md v1`.

## Branches / PR
- Integration `refactor/main` @ 5dd28b6. Tree clean.
- **PR #183 OPEN (CI in progress):** `refactor/B4-ui-charnet` (d17e9df test + bb8d87a docs) → `refactor/main`.
  Merge on green per cadence. **Do NOT start B4-2 impl until #183 merges** (one stage branch in flight).
- Merged stage PRs: A1 #178, A3 #179, A2 #180, B1 #181, B2 #182 (e74d3e6).

## Validation state (green bar)
- **B4-1 branch @ bb8d87a — ALL GREEN:** build/typecheck/lint exit 0; `pnpm test` **2071 passed / 237 files**
  (+12 / +1 vs 2059/236). Net is tests-only; `git diff` touched only the new test file.
- Mutation-verified the net BITES (broke `ui-solve.mjs:411` abort-guard → exactly 1/12 failed → reverted, byte-identical).
- `refactor/main` @ e74d3e6 was green (236/2059; oracle 2332/0). browser not run for B4 (jsdom/test-infra only, no GPU).

## Uncommitted / unverified
- None. B4-1 fully committed (d17e9df test, bb8d87a docs) + pushed; PR #183 open, CI running. This STATE commit direct to main.

## Known blockers / risks
- **Awaiting PR #183 CI green** (build + browser), then merge. CI health: #182 CI was green — July budget note likely stale.
- Scope forks deferred (ui.mjs-seam, algebra source-text) — flagged in PR #183; user may redirect.

## Next concrete steps
1. **When PR #183 CI goes green → merge** (merge-commit, title + `(#183)`), `git checkout refactor/main && git pull`, re-confirm green.
2. **B4-2 — worker-lane lifecycle net** on a fresh `refactor/B4-2-worker-lanes`: extract shared
   `vitest/helpers/fake-worker.mjs` (from the inline fakes in `psw-lifecycle.test.ts` + `schwarz-cpu-worker-crash.test.ts`),
   then behavioral tests for all 6 lanes (PSW primary/aux/live + sym/schwarz/param-slice-pool): per-lane spawn-fault
   fallback, supersede→`{aborted,superseded}`, cancel→terminate/settle, crash→settle. Tests-only, no source change.
   Templates: psw-lifecycle.test.ts (gold), web-worker-shim.mjs (real-thread helper).
3. Then the DEFERRED B4 items decision (ui.mjs-seam stage / algebra→D1), then C → D → E → F.

## Resume commands
```
git fetch && git checkout refactor/main && git pull        # after #183 merges
pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm lint && pnpm test  # expect 2071/237 after B4-1
# B4-2 work: git checkout -b refactor/B4-2-worker-lanes
```
