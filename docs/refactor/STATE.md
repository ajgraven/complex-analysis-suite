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
- **Phase D — Execute. Group A + B1 + B2 MERGED** (B2 = #182, `e74d3e6`; solvers 4-way shard; `pnpm test`
  long-pole 77s→37s; oracle 2332/0). refactor/main GREEN @ e74d3e6 (236 files / 2059 tests, re-confirmed).
- **Stage B4 (UI characterization net) — IN FLIGHT on `refactor/B4-ui-charnet`.** Proceeding on the RECOMMENDED
  narrow scope (NO source change): `ui-solve` orchestration net + worker-lane net. ui.mjs-internals (needs a seam =
  source change) and algebra source-text conversion (different module) are **DEFERRED** to their own stages (flagged
  to user, not blocking — user may redirect). Skipped optional B3.
- **B4 SCOPE DISCOVERY (verified — changes the plan's B4):**
  - `app/ui.mjs` (1931 L) has **NO test seam** — boots on import (`:413/:1723/:1737`), no `installUI()` factory,
    no test hook. Its internals can't be characterized without a **brittle full-boot jsdom harness** OR **adding a
    seam (a SOURCE change)** — the latter is scope-expanding for a "tests-only" stage.
  - The "~15 source-text tests" (QD-ALG-3/QD-TEST-3) target **`algebra/algebra-ui.mjs`** (a *different* god-module),
    NOT ui.mjs/ui-solve.mjs. Converting them is Algebra-decomposition (D1) work, not this stage.
  - Cleanly testable NOW (DI seams already exist, **no source change**): **`ui-solve.mjs`** solve orchestration
    (`QD_UI.installSolve(ui)` :51, verified — 18 injected deps, reads `QD.PrimarySolverWorker` at call time :326
    w/ `QD.solveInverseQD` fallback :332, `_solveAndRenderToken` supersede :387/406/410/465, cancel :510) and the
    **6 worker lanes** (PSW primary/aux/live + sym/schwarz/param-slice-pool).
  - Templates to reuse: `vitest/psw-lifecycle.test.ts` (lane lifecycle + spawn-fault), `schwarz-cpu-worker-crash.test.ts`
    (crash/settle), `ui-domain-plot.test.ts` (jsdom install-factory), `qd-validity-badge.test.ts` (imports ui-solve).
    Only a *real-thread* worker helper exists (`vitest/helpers/web-worker-shim.mjs`); message-fakes are copy-pasted →
    B4 should extract a shared `vitest/helpers/fake-worker.mjs` (test-only).
- Cadence: auto-merge on green (user merges on green CI, delegated). `APPROVED: PLAN.md v1`. D-1..D-4 recorded.

## Branches / PR
- Integration `refactor/main` @ e74d3e6. Tree clean. Stage branch `refactor/B4-ui-charnet` cut (empty, local).
- Merged: A1 #178, A3 #179, A2 #180, B1 #181, B2 #182 (e74d3e6).

## Validation state (green bar) — refactor/main @ e74d3e6 ALL GREEN
- build/typecheck/lint exit 0; `pnpm test` 236 files / 2059 tests (wall varies 66–157s w/ load — the durable B2
  metric is the structural long-pole 77s→37s, not absolute wall). Oracle `node app/node-test.js` 2332/0.

## Uncommitted / unverified
- None. B4 has no commits yet; awaiting the scope decision before building the net.

## Known blockers / risks
- B4 scope forks flagged to user (NOT blocking; proceeding on the recommended narrow net): (2) algebra source-text
  conversion → DEFERRED to D1; (3) ui.mjs seam → DEFERRED to its own small stage before D2. User may redirect.
- CI health: #182 CI green (build+browser) — July "exhausted GH Actions budget" note may be stale. Local green = truth.

## Next concrete steps — Stage B4
1. **Building B4-1** (ui-solve orchestration net) on `refactor/B4-ui-charnet`, then a follow-up PR for B4-2 (worker lanes).
2. Recommended build order if (1): **B4-0** extract shared `vitest/helpers/fake-worker.mjs`; **B4-1** `ui-solve`
   orchestration net (supersede/abort-vs-error-settle/busy-ownership/cancel/auto-escalation/PSW-fallback), fake
   `uiCtx`+stub `QD.PrimarySolverWorker`, jsdom, model on ui-domain-plot+qd-validity-badge; **B4-2** worker-lane
   lifecycle net (all 6 lanes; per-lane fallback; supersede; crash/settle). All tests pass against UNMODIFIED code (§2.2).
3. Each sub-unit = its own PR → refactor/main, green, STOP for review. Then C → D → E → F.

## Resume commands
```
git fetch && git checkout refactor/main && git pull          # @ e74d3e6 or later
pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm lint && pnpm test
# B4 work: git checkout refactor/B4-ui-charnet
```
