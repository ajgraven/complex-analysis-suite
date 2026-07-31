# LOG — append-only work & decision record

> Append-only. Never edit, compact, reorder, or delete entries.

## 2026-07-30 — Phase A (orient, baseline, clarify) + scaffold
- Bootstrap: no prior `docs/refactor/STATE.md` → **new engagement**. Repo on
  `claude/repository-refactor-project-5zikwd` == `master` == `origin/master` @ `b1e3004` (0 divergence).
- Tooling: node 22.22.2, pnpm 9.15.9. `gh`/`cloc`/`tokei`/`madge` absent (use GitHub MCP for PRs;
  install cloc/madge in Phase B). `pnpm install --frozen-lockfile` OK (595 pkgs, lockfile untouched).
- **Baseline green bar** (all exit 0): build, typecheck, lint, test (206 files / 2017 tests, ~156s;
  QD headless node-suite ~128s of that). No pre-existing failures recorded. The `getContext` /
  `Worker unavailable` lines in the test log are handled jsdom/worker fallbacks, not failures.
- **Scale correction:** prompt states ~30k lines; actual ~122k total / ~84k non-test code across 616
  files. QD ~66% of code and untyped `.mjs`.
- **Discovered prior engagements:** whole-codebase review 2026-07-25 (112 findings, HIGHs fixed, ~48
  open) and a closed algebra-maturity review (`docs/algebra-review/`, merged as PR #81 + follow-ons).
- **Deferred** creating `refactor/main` + scaffold by one turn to resolve the branch-model conflict
  first (prompt's `refactor/main` vs the session's designated `claude/…` branch).
- Asked 4 structured + 3 prose questions. **Answers:** (1) branch model = follow prompt (refactor/main);
  (2) altitude = fresh architectural review; (3) pain = QD internal structure + testability/dev-loop +
  clarity/onboarding (cross-app extraction NOT selected); (4) appetite = deeper redesign where warranted.
  Recorded in PLAN.md v0 §4.
- Created `refactor/main` from `master`; scaffolded `docs/refactor/{STATE,PLAN,ASSESSMENT,LOG,ISSUES}.md`;
  committed to `refactor/main`. Next: Phase B breadth pass. Will STOP before Phase C per user request.

## 2026-07-30 — Phase B (breadth + 5 depth passes + systemic) COMPLETE
- Breadth pass (cloc/madge): committed c160973. Scale ~87k code LOC; QD ~60% & untyped; QD `app/` a flat
  102-file/~57k pile; god-modules ranked; QD 0 import cycles; CD render 2 madge cycles; packages healthy.
- 5 delegated read-only depth reviews (QD algebra, solver family, UI/coupling, CD main+render, test infra).
  **Re-verified every material file:line claim against the code before recording.** Verified spot-checks:
  installAlgebra 687-4921 (~4.2k-line fn); algebra-store `edges` getter leak 3115 vs `.slice()` 3120-21;
  algebra-eliminate-section source-text test 13-29; algebra guard inconsistency (doSolveRadical 2603 no guard
  vs `_abort`/`busyGuard`); solver `registerFamily` unshift 1283 + 3 load lists (main/solver-graph/bootstrap);
  QD `CONTRIBUTING.md:84` stale-doc; 5th pole-centroid solver-pqd-singular 496-503 vs solver-qd 333-36;
  schwarz-cpu-worker 95-96 shipped-bug note; primary-solver-worker 3 lanes + messageerror only on primary;
  parse-check.test.js 43-47 source-text test; CD overlay `import type {Leaf}` 18 + verbatimModuleSyntax 17
  (cycle is TYPE-ONLY — corrected breadth §1.3); node-suite `execFileSync` + serial loop 97-104; coverage
  config excludes QD (no `src/`). Recorded ASSESSMENT §3.1-3.5 + §4 (S1–S6 + concentrated-value framing);
  36 findings in ISSUES register. Committed cc86106.
- Green bar unchanged (docs-only). Presented findings; asked round-2 plan-shaping questions.

## 2026-07-30 — Phase C (PLAN.md v1 written) — STOP for approval
- Round-2 answers: ambition = **broad structural sweep**; test-infra = **Stage 0**; CD = **cheap wins only**;
  QD decomposition = **full**. Reconciled (finer answers refine the master dial): broad sweep **concentrated on
  QD**; CD limited to the type-only-cycle fix (no CD god-module work).
- Wrote PLAN.md v1: current-state assessment (§5), classified findings (§6), seam-based target architecture
  (§7), a ~15-stage roadmap (§8) in groups A(quick wins)/B(**test Stage 0 — B4 is the net**)/C(dup collapse:
  worker-lane factory, typed protocol, defineFamily)/D(full god-module decomposition: installAlgebra, ui.mjs)/
  E(state-lifecycle unification + folderize)/F(dependency-cruiser), and 4 decision points (§9).
- **STOP. Awaiting the literal approval token `APPROVED: PLAN.md v1` before any implementation.**

## 2026-07-30 — Phase D · Stage A1 (solver-family confirmed defects) — PR opened
- `APPROVED: PLAN.md v1` received (D-1 aligned, D-2 late, D-3 include-last, D-4 keep-wrapped). Cut
  `refactor/A1-confirmed-defects` from `refactor/main` @ 6bea36c.
- **Scope narrowed (logged, no expansion):** A1 = QD-SOLV-3 (centroid) + QD-SOLV-2 (its doc) — both
  solver-family, fast-verifiable. **Deferred** QD-ALG-7 (algebra-store encapsulation → Group D, its
  natural home) and QD-SOLV-6 (identity-tol → needs its own behavior analysis at solver.mjs:1774).
- Inspection (verified first-hand): `poleCentroid(hData,fallback)` (solver.mjs:1718) documents PQD→0 /
  LQD→1; solver-pqd-singular open-coded `{re:1}` was the stray LQD value. `ZERO_THRESHOLD=1e-20`
  (solver.mjs:99) → a `{re:0}` w0 trips the w0≠0 guard (pqd-singular:508). `bootstrap.js` keeps its OWN
  module list (47-56), does NOT import `solver-graph.mjs` → CONTRIBUTING:84 was misleading. `edges`
  getter consumed read-only only (algebra-canvas:206,539).
- Commit 3241cca: characterization spec (green on unmodified code, 5/5). Commit 10e0b63: QD-SOLV-3 fix
  (`QD.poleCentroid(hData,{re:0})`) — **D-1 behavior change**: empty-pole PQD-singular now fails closed
  (throws "w0 must be nonzero") instead of proceeding with w0=1; char spec now 6/6. Commit 3b39c4a:
  QD-SOLV-2 doc.
- **Green bar (this session):** build/typecheck/lint exit 0; `pnpm test` exit 0 — **2023 passed / 207
  files** (+6 tests / +1 file vs baseline). (node-suite ran ~78s this pass — machine variance, not this change.)
- Pushed branch; PR opened to `refactor/main`. **STOP for review — do not start A2/A3.**
- **A1 MERGED** (user delegated: "merge once CI goes green"). CI on #178 went green (build success
  22:56:02Z, browser success 22:52:29Z); merged via merge-commit b331ae2. Pulled to `refactor/main`
  (fast-forward, tree clean, fix present at solver-pqd-singular.mjs:503). Session auto-unsubscribed from
  #178. Note: the user's merge delegation overrode the default "never merge your own PR" for this PR only.
  Stage A1 complete. Awaiting go-ahead on the next stage (A3 or Group B).

## 2026-07-30 — Phase D · Stage A3 (CD type-only render cycle, CD-4) — PR opened
- User set cadence to **auto-merge on green** and chose A3 next. Cut `refactor/A3-cd-cycle` from `refactor/main` @ 3f26a6f.
- Baseline `madge --circular apps/complex-dynamics/src` = **2 cycles**, both closed by `overlay.ts:18`
  `import type { Leaf } from "./lamination"`.
- Change: new dependency-free `render/laminationTypes.ts` holds `Leaf`; `lamination.ts` re-exports it
  (`import type { Leaf } from "./laminationTypes"; export type { Leaf };`); `overlay.ts:18` repointed to
  `./laminationTypes`. Type-only (verbatimModuleSyntax) → **zero emitted-JS change**; `plotView.ts` /
  `main.ts` importers unchanged (via the re-export).
- Verify: `madge --circular` **2 → 0**; build/typecheck/lint exit 0; `pnpm test` 2023 passed / 207 files.
  No new characterization test — nothing runtime changed; the existing green suite + typecheck + madge are
  the net, and the dependency-cruiser gate (F1) will lock the no-cycle invariant. Commit 852a9a1.
- PR to be opened; auto-merge once CI (build + browser) is green, then continue to A2.
- **A3 MERGED** (#179, merge commit e657769, CI green build+browser); pulled to `refactor/main`.

## 2026-07-30 — Phase D · Stage A2 (dispatch-order safety, QD-SOLV-1) — PR opened
- Cut `refactor/A2-dispatch-order` from `refactor/main` @ e657769.
- Inspection: `familyDispatchOrder` (solver.mjs:1137); `selectFamily` walks front-to-back, first `matches()`
  wins (1139); `registerFamily` unshift (1283). 10 families; 4 singular (boundedLQD/powerQD/unboundedLQD/
  unboundedPQD `_singular`), each base present. Precedence = reverse load order; the load lists load
  base-before-singular → singular outranks base (correct today).
- Commit 11e2d99: characterization spec (`selectFamily` routes a singular request to the singular family) —
  green on unmodified code (4/4). Commit d22e247: added `checkDispatchOrder` (pure) + `assertDispatchOrder`,
  run once lazily on the first `selectFamily` call. No-op for the correct order → behavior-preserving; fails
  loud on a mis-order. +4 guard assertions (spec now 8/8). **Mitigates** QD-SOLV-1's footgun; the underlying
  3-list triplication is **deferred to E2**.
- Green bar: build/typecheck/lint exit 0; `pnpm test` 2031 passed / 208 files — the live assertion passes
  under the node-suite (bootstrap.js order), the worker graph, AND the spec → all three load paths are correctly ordered.
- PR to be opened; auto-merge on green, then continue to **Group B** (test Stage 0).
- **A2 MERGED** (#180, merge commit 3a5d18f, CI green build+browser); pulled to `refactor/main`.

## 2026-07-30 — Milestone: GROUP A (quick wins) COMPLETE
- A1 (#178), A2 (#180), A3 (#179) all merged to `refactor/main` (@ 3a5d18f). Shipped: QD-SOLV-3, QD-SOLV-2,
  QD-SOLV-1 (guarded), CD-4. Deferred/still open: QD-ALG-7 (→ Group D), QD-SOLV-6 (own analysis).
- Every stage: characterization-test-first, behavior-preserving, full green bar (now 2031 tests / 208 files),
  auto-merged on green CI. No regressions; no plan deviations beyond the logged A1 scope-narrowing.
- **PAUSED before Group B** (test Stage 0) to confirm the approach with the user — B1 (node-suite → parallel
  Vitest) + B4 (ui.mjs/ui-solve.mjs char net) are a substantial migration and the gate for all QD structural work.

## 2026-07-30 — Phase D · Stage B1 (parallelize node-suite): DESIGNED, checkpoint before implementing
- User chose "proceed now, auto-merge" for Group B. Cut `refactor/B1-parallelize-node-suite` (no commits).
- Inspected the harness end-to-end and **confirmed the port is feasible**: `bootstrap.init()` is memoized
  (test/bootstrap.js:127-130 `_initPromise`) → safe in `beforeAll`; `harness.js` counters are module-scoped /
  per-Vitest-worker (12,40) → a per-spec `report().fail===0` is exact parity; the 26 `TESTS` are declared
  order-independent (node-test.js:19-20); all 26 run DOM-free in node today (the 4 grep-"DOM-ish" files —
  cas-export/observables/ui-inputs/worker — pass under plain `node` in node-test.js, so node env is correct).
- Full B1 implementation design recorded in STATE.md "Next concrete steps" (26 thin node-env specs +
  `_run.ts` helper carrying the FLOORS map; delete the serial `node-suite.test.ts`; verify assertion parity).
  **Decision: KEEP FLOORS** (contra the test-infra subagent) because D-4 keeps `harness.ok` wrapped, so per-file
  assertion counts stay invisible to Vitest and the silent-shrink guard is still needed.
- **CHECKPOINT (not a plan deviation):** did NOT implement B1 — a delicate assertion-parity migration + a very
  long session. Recommend implementing with fresh context. Group A remains a clean, complete, merged deliverable.

## 2026-07-30 — Phase D · Stage B1 (parallelize node-suite) IMPLEMENTED + honest findings — PR opened
- User chose "continue now". Implemented per the recorded design: `vitest/node/_run.ts` (`runNodeSuiteFile`,
  lazy requires) + 26 generated thin specs `vitest/node/<name>.test.ts` (`// @vitest-environment node`);
  deleted the serial `vitest/node-suite.test.ts`; updated the config comment. `app/node-test.js`, the 26
  test files, and the harness are UNCHANGED. **KEPT FLOORS** (D-4 keeps `harness.ok` wrapped → per-file counts
  invisible to Vitest, so the silent-shrink guard is still needed) — a deliberate deviation from the subagent's
  "retire FLOORS" suggestion, justified.
- **Parity verified:** oracle `node app/node-test.js` = **2329 passed / 0 failed**; full `pnpm test` =
  **2056 passed / 233 files** (was 2031/208: −1 wrapper, +26 specs); build/typecheck/lint exit 0.
- **HONEST speed result: B1 is NEUTRAL on wall time** (~132s ≈ baseline ~105-131s). `solvers.test.js` (~77s)
  is the long pole; on ~4 cores the per-spec bootstrap overhead offsets the smaller-file parallelism. The
  review's "~40% cut from B1 alone" was wrong. B1's real value: **per-file reporting/isolation** (a failing
  node file is named) + it **enables B2**. (First measure showed collect 34s from a module-scope require in
  _run.ts; fixed by lazy requires → collect 573ms.)
- **SCOPE DISCOVERY for B2 (recorded for the fresh session):** `solvers.test.js` is a **1,915-line monolithic
  `run()`** (10-1915) — shared helpers + `vm` setup + 8 `runFamilyBattery` blocks with huge inline preset
  arrays, interleaved; **no `section()` dividers / clean sub-function seams.** The review's "flat independent
  blocks" was optimistic. Sharding it parity-safely is a **delicate refactor of the safety net**, not the
  low-risk change B2 was scoped as → per the abort criteria ("footprint materially exceeds plan"; "migration
  risk significant"), **deferred B2 to a fresh session** (user agreed: "land B1 now, do B2 fresh").
- Committed c3cd354. Pushing B1; PR to `refactor/main`; auto-merge on green (honest PR — isolation, not speed).
- **B1 MERGED** (#181, merge commit 08b0fab, CI green build+browser); pulled to `refactor/main` (26 node specs
  present, serial wrapper removed, tree clean). Session auto-unsubscribed. **Group A done + B1 done; B2
  (shard solvers) is the resume point for a fresh session** (STATE Next steps has the plan). Session concluding.

## 2026-07-31 — Phase D · Stage B2 (shard solvers.test.js, QD-TEST-5) IMPLEMENTED + PR opened
- Resumed engagement (fresh session). **Correction:** this session first mis-concluded "new engagement"
  because it checked for `STATE.md` BEFORE `git fetch` — the fresh clone lacked the `refactor/*` refs. User
  flagged it; `git fetch` surfaced `refactor/main` + the 4 stage branches. Lesson: fetch before the §1 check.
  Re-confirmed green on `refactor/main` @ d74fd2e (233 files / 2056 tests; oracle 2329/0; `solvers` S=451).
- Delegated a full statement-map of the 1,915-line `run()` to a subagent; spot-verified every load-bearing
  claim against the code: exactly ONE top-level local (`const verifyQuadratureIdentity` @62, consumed only
  @77/129 — both in region 1); NO shared mutable state; `run()` returns nothing (assertions tally via injected
  global `ok()` side-effect). ⇒ the B1 "no clean seams" worry was overstated: contiguous slices are
  behavior-preserving BY CONSTRUCTION. **Risk re-assessed med-high → low.**
- Time-profiled the body per-block: cost concentrates in 3 atomic top-level blocks — §PB [826-935] ~38s
  (three independent solve-loops sharing a pure `poleAt` helper — indivisible without editing block internals),
  §CONT [1182-1233] ~22s, §23 [1234-1321] ~21s; all else ~7s combined. §PB caps the fastest longest-shard ~38s.
- **Implementation:** 4 contiguous shards `app/test/solvers-{1..4}.test.js` at block boundaries 816/935/1233
  (isolating §PB in shard 2); original module preamble preserved verbatim. 4 new `vitest/node/solvers-*.test.ts`;
  `app/node-test.js` TESTS + FLOORS and `vitest/node/_run.ts` FLOORS updated (both maps); monolith + old spec
  deleted. **No test content changed.**
- **PARITY — three independent proofs:** (a) reconstruction `concat(4 shard bodies) == HEAD original body`,
  byte-identical (100718 chars); (b) oracle `node app/node-test.js` = **2332 passed / 0 failed** (was 2329/0;
  +3 runner lines from +3 files; content assertions unchanged at 2302); (c) per-shard contributions
  187/10/71/183 = **451** == pre-split S. Zero failing assertions anywhere.
- **DECISION (autonomous, logged per §D):** contiguous NUMBERED shards, NOT the PLAN's
  "(bounded/unbounded/LQD/PQD)" family split — the map shows the families are interleaved, so a family split
  would REORDER blocks (higher risk, not reconstruction-provable). Contiguous slicing is byte-identical-provable.
  Same intent as PLAN B2, safer method — flagged in the PR as a deviation from the plan's wording.
- **MEASURED speed win (the point of B2):** full `pnpm test` wall **156.6s → 109.0s (−30%)**; the QD node
  long-pole spec **~77s → 37s** (solvers-2 = §PB). Vitest spec times: s1 6.3s / s2 37.0s / s3 36.1s / s4 30.7s.
  (Absolute wall varies ~±10% with load; the long-pole halving is structural.) The ~25–30s target from the
  plan was NOT reached because §PB is one atomic ~38s block — dissecting its 3 solve-loops (copy the pure
  `poleAt` helper) is a content edit, higher risk, LEFT AS A FOLLOW-UP (ISSUES QD-TEST-5 note).
- Green bar: build/typecheck/lint exit 0; `pnpm test` = **2059 passed / 236 files**. Browser harness not run
  (test-infra only, no GPU/shader). Committed ac5f894; pushed `refactor/B2-shard-solvers`; PR → `refactor/main`;
  auto-merge on green (honest PR — real win, §PB cap disclosed).

## 2026-07-31 — Phase D · Stage B4-1 (ui-solve orchestration characterization net) — PR opened
- User: "merge when CI green, then proceed." Merged B2 (#182, `e74d3e6`); re-confirmed refactor/main GREEN
  (236 files / 2059 tests; oracle 2332/0). Skipped optional B3. Cut `refactor/B4-ui-charnet`.
- **B4 SCOPE DISCOVERY (verified; confirms + sharpens ASSESSMENT §3.5 / QD-TEST-2):** `ui.mjs` (1931 L) has
  **no test seam** — 0 exports, boots on import (`:413/:1723/:1737`), no `installUI()` factory ⇒ its internals
  can't be characterized without a brittle full-boot harness OR **adding a seam (a source change)**, which is out
  of a tests-only stage. The "~15 source-text tests" target **`algebra/algebra-ui.mjs`** (a *different* god-module),
  not ui.mjs/ui-solve.mjs. Cleanly testable NOW (DI seam, no source change): **`ui-solve.mjs`** (`installSolve`) +
  the 6 worker lanes. → **Narrowed B4 to the no-source-change net**; DEFERRED the ui.mjs seam (its own small stage
  before D2) and the algebra source-text conversion (→ D1). Flagged to the user; proceeded on the recommendation
  (user said "proceed"/"continue").
- **B4-1 delivered (this PR): `vitest/ui-solve-orchestration.test.ts` — 12 behavioral tests, TESTS-ONLY, no source
  change.** Drives `QD_UI.installSolve(fakeUiCtx)` with a real `$` over jsdom + a stubbed
  `QD.PrimarySolverWorker`/`QD.solveInverseQD` (mutated on the shared solver-namespace object, since ui-solve
  `import`s `_QD` from solver.mjs), controlling the solve outcome via a deferred promise. No real solver/worker;
  no solve is allowed to SUCCEED, so the heavy success-render path is intentionally NOT exercised here (a later
  slice). Pins: input guards (no poles / built.error / norm.error → no dispatch); dispatch target (PSW when
  present; `QD.solveInverseQD` fallback when absent); settle (rejection → visible "Solver error"; `{aborted:true}`
  → SILENT); supersede (stale rejection dropped, no paint); busy-indicator OWNERSHIP (`:465` — a stale solve's
  finally must not hide the newer solve's spinner); `cancelSolve` (PSW.cancel + token bump + alt-search stop +
  "Solve cancelled"); auto-escalation (first fail + enabled → 2nd exhaustive dispatch).
- **Mutation-verified the net BITES:** breaking the abort-settle guard (`ui-solve.mjs:411`) failed exactly the
  "aborted settles silently" test (1/12), then reverted → ui-solve.mjs byte-identical to HEAD (`git diff` clean).
- Green: build/typecheck/lint exit 0; `pnpm test` **2071 passed / 237 files** (+12 / +1 vs 2059/236). Browser
  harness not run (jsdom/test-infra only, no GPU). Committed d17e9df; PR → refactor/main; auto-merge on green.
- **Addresses QD-TEST-4** (ui-solve orchestration untested) + part of QD-UI-5. **QD-TEST-2 (ui.mjs) REMAINS OPEN**
  — needs the seam (deferred). Follow-up **B4-2**: worker-lane lifecycle net + shared `vitest/helpers/fake-worker.mjs`.

## 2026-07-31 — Phase D · Stage B4-2a (PSW worker-lane crash net) — PR opened
- Continued B4 per user "proceed"/"pick up". B4-1 (#183) merged (`e1a148a`); refactor/main re-confirmed green
  (2071/237). Cut `refactor/B4-2-worker-lanes`. Scoped B4-2 with a verified subagent map: the 6 lanes + the
  **messageerror matrix** — primary/schwarz/pool HAVE a `messageerror` handler; aux/live/sym do NOT (silent
  copy-paste divergence). Existing coverage: `psw-lifecycle.test.ts` (round-trip/supersede/cancel/spawn-fault),
  `schwarz-cpu-worker-crash.test.ts` (schwarz crash), `sym-worker-*.test.ts`, `param-slice-pool.test.ts` —
  **PSW crash-settle is the zero-coverage gap.**
- **Split B4-2 into two ADDITIVE PRs** (map's recommendation — leave the 2 existing green lane tests untouched;
  DRY them onto the shared helper later during C1/C2 when those files may change anyway): **B4-2a** = shared
  helper + PSW crash net (this PR); **B4-2b** = sym + schwarz + param-slice-pool gaps (follow-up).
- **B4-2a delivered (TESTS-ONLY, no source change):**
  - `vitest/helpers/fake-worker.mjs` — shared fake `Worker` unifying the inline `makeStubWorker` (spawn-fault)
    + `FakeWorker` (message/crash delivery): `.fire(type,ev)`, `.posted`, `.terminated`, static
    `instances`/`lastInstance`, `failNext`.
  - `vitest/psw-crash-char.test.ts` — 7 tests, pins verified against source: primary `error`→
    `Error(/solver worker crashed/)` + dispose + `_isMainThreadFallback()===false` (a crash is not a latch)
    (primary-solver-worker.mjs:99-112); primary `messageerror`→`/structured-clone/` (:113-121); aux `error`→
    `/alt-search worker crashed/` (:227-236); live `error`→`/live-solve worker crashed/` (:321-330); the
    **messageerror ASYMMETRY** — aux/live have NO handler, so `.fire('messageerror')` leaves the job in-flight
    (freezes current behavior for C2); 3rd fallback-latch independence direction (live-fails-first doesn't
    demote primary/aux — mirrors psw-lifecycle's two directions).
  - Driven with `vi.stubGlobal("Worker", FakeWorker)` + the freshPSW `resetModules` re-import (module-scoped
    lane singletons). node env; no DOM.
- **Mutation-verified the net BITES:** adding an aux `messageerror` handler failed exactly the "aux messageerror
  does NOT settle" test (1/7), then reverted → primary-solver-worker.mjs byte-identical to HEAD.
- Green: build/typecheck/lint exit 0; `pnpm test` **2078 passed / 238 files** (+7 / +1 vs 2071/237). Browser not
  run (node/test-infra, no GPU). Committed 48f89cb; PR → refactor/main; merge on green.
- **Addresses part of QD-UI-1** (the worker-lane crash + messageerror contract now pinned before the C1 lane
  dedup) + QD-UI-4 (the untyped/asymmetric envelope behavior frozen). Remaining: **B4-2b** (sym/schwarz/pool gaps).

## 2026-07-31 — Phase D · Stage B4-2b (SymWorker crash net) — PR opened
- Continued per user "keep going after merging #184". B4-2a (#184) merged (`7a025e3`); refactor/main
  re-confirmed green (2078/238). Cut `refactor/B4-2b-lanes`; **reused** `vitest/helpers/fake-worker.mjs`.
- **B4-2b delivered (TESTS-ONLY, no source change): `vitest/sym-worker-crash-char.test.ts`, 3 tests.**
  Completes the worker-CRASH-contract net for the solver lanes (PSW in B4-2a + sym here). Pins, verified
  against `algebra/sym-worker.mjs`: worker `error` WHILE A JOB is in flight → reject `/sym-worker crashed/`
  + `detachAbort` (F3) + teardown, and it is NOT the sticky latch (:59-69); **F4** — an IDLE `error` (no job)
  → sticky `_fallback = true` (permanent main-thread fallback; a subsequent `ensureReady()` does not respawn)
  (:70-72); `messageerror` absence — sym has no handler, so `.fire('messageerror')` leaves the job in-flight.
  (sym-worker-lifecycle/sym-worker-thread already cover cancel/supersede/the caught-job-`m.error` path; the
  worker-level error EVENT + F4 were the gap.)
- **Mutation-verified the net BITES:** breaking F4 (`if (!hadJob) _fallback = true` → `if (false && …)`) failed
  exactly the F4 test (1/3), then reverted → sym-worker.mjs byte-identical to HEAD.
- Green: build/typecheck/lint exit 0; `pnpm test` **2081 passed / 239 files** (+3 / +1 vs 2078/238). Committed
  932fb64; PR → refactor/main; merge on green.
- **Scope note:** B4-2b completes the high-value worker-CRASH contract (PSW + sym). The remaining P2 lane-polish
  gaps — schwarz `isUsable()`/renderField-preempt/`handle.cancel`/`onUnavailable` (schwarz crash-settle is
  ALREADY covered by `schwarz-cpu-worker-crash.test.ts`), and param-slice-pool event-wiring/survivor-re-dispatch
  (a different, N-worker shape) — are **optional → B4-2c, or fold into Group C** when those files change for the
  lane dedup. **QD-UI-1** further addressed (all three solver-worker lanes' crash contract now pinned).

## 2026-07-31 — Phase D · Stage C1a (createWorkerLane factory — PSW lanes) — PR opened
- User "keep going" → took up **Group C** (duplication collapse — the payoff the B4 net was built to guard).
  Merged B4-2b (#185, `ecb5124`); re-confirmed refactor/main green (2081/239). Cut `refactor/C1a-psw-lane-factory`.
- **First STRUCTURAL refactor since Group A — but BEHAVIOR-PRESERVING and fully net-guarded.** Char-first per §D:
  the net (`psw-crash-char` 7 + `psw-lifecycle` 13) was already green on the UNMODIFIED code (my baseline).
- **C1a (this PR): `apps/quadrature-domains/app/primary-solver-worker.mjs` ONLY — 395 → 238 lines (−40%).**
  Extracted `createWorkerLane(cfg)`; the primary/aux/live lanes (near-verbatim copies of ensureReady/dispose/
  run-supersede-post-settle/cancel/isBusy + a per-lane spawn-fault latch) are now 3 config objects differing only
  in: message `kind` (solve/altSearch/liveSolve), payload builder, main-thread fallback fn+args, `hasMessageError`
  (primary=true, aux/live=false), crash/log labels, and the primary-only AbortSignal (`getSignal`). Each lane keeps
  its OWN closure state → the fallback latches stay INDEPENDENT (qd-psw-fallback-latch-01, the shipped-bug class).
- **Behavior preserved — proven by the net staying green:** `psw-crash-char` + `psw-lifecycle` = **20/20**; full
  `pnpm test` **2081 passed / 239 files** (count unchanged — source refactor, no test added). Preserved exactly:
  the primary-only messageerror handler + its `/structured-clone/` reject; the `/…worker crashed/` strings; the
  warn/error console text; supersede (reuse worker) vs cancel (terminate); the AbortSignal forwarding. `git diff`
  = 1 file; build/typecheck/lint exit 0. **No intended behavior change; no sign-off needed (Group C is approved,
  behavior-preserving).** Committed 86c7bcf; PR → refactor/main; merge on green.
- **Remaining C1 → C1b:** apply `createWorkerLane` (or its shape) to the sym / schwarz / param-slice-pool lanes —
  a separate PR (different files, and schwarz/pool have their own quirks). C2 (typed protocol) follows.
  **QD-UI-1: the 3× PSW lane duplication is eliminated.**

## 2026-07-31 — Phase D · Stage B4-2c (schwarz + param-slice-pool lane nets) — PR opened
- After C1a merged (#186, `007681a`; refactor/main re-confirmed green 2081/239, PSW net 20/20), user chose
  **"C1b — finish lanes."** Per the guardrail (no refactor without a pinned net), started net-first: this stage
  (B4-2c) closes the deferred P2 lane-net gaps for the lanes C1b would touch, BEFORE any structural change.
- **FINDING (evidence over assertion) — the remaining 3 lanes do NOT fit `createWorkerLane`.** Read all four lane
  sources against the C1a factory. Only primary/aux/live shared its ENTIRE shape (single warm worker · Promise
  resolve/reject · supersede=REUSE · no progress · one messageerror asymmetry). The other three are DIFFERENT
  abstractions:
    · **sym-worker.mjs** — supersede=TERMINATE (entry runs runJob synchronously), an F4 idle-error PERMANENT
      fallback latch, a `progress` message channel, an F3 detach-late-abort guard, Blob/fetch env checks.
    · **schwarz-cpu-worker.mjs** — a synchronous `isUsable()` gate + `renderField(params, cbs)` returning a
      `{cancel()}` HANDLE that STREAMS the pyramid via onPass/onError/onUnavailable callbacks (not one Promise).
    · **param-slice-pool.mjs** — an N-worker POOL (idle queue, load-balanced `_dispatch`, A5 scenario caching,
      survivor drop, MainThreadPool twin) — not a single lane at all.
  Forcing these onto one factory would grow it into a config-flag monster (supersedeMode/onProgress/streaming/
  isUsable/onUnavailable/poolSize/survivor…) — OVER-generalization, against the refactor's clarity north-star and
  ADR-0007/0008's "don't merge engines without a genuine shared need." **So C1b is NOT a blind lane-collapse.** The
  genuine shared duplication among all six is NARROW: the worker-level `error`/`messageerror` → settle-in-flight +
  teardown fragment (whose ABSENCE shipped the schwarz "Pass 1/3" bug — QD-UI-1's cited harm) + the lazy-ensureReady
  fallback-latch. The sound C1b = extract THAT fragment as a helper used by all lanes (incl. retrofit the C1a
  factory), leaving each lane's run/return/supersede model intact. **Flagged for the user at the C1b design gate;
  PLAN v1's C1 "6 lanes = config / Done-when" premise needs revision → NOT rewritten in this tests-only PR.**
- **This PR (B4-2c, TESTS-ONLY, no source change):**
    · `vitest/schwarz-cpu-worker-lifecycle.test.ts` (NEW, 9 tests) — pins the schwarz paths the crash net omits:
      `isUsable()` gate (Worker present / absent / post-load-failure latch), `onUnavailable` (no worker built),
      multi-pass streaming (onPass per pass; only last `done`; stale-jobId dropped), in-flight preempt
      (terminate+fresh), `handle.cancel()`, and the cancel-before-spawn guard.
    · `vitest/param-slice-pool.test.ts` (+2) — the two pool paths the existing net omits: `runSweep` row-dispatch
      → onTile → done tally, and the survivor=0 branch of `_onWorkerError` (LAST worker dying must drain `pending`,
      not just the in-flight tile). The existing file already covered survivor≥1 / canAccept / cancel+arm.
- **Mutation-verified (net bites, each fails ONLY its target):** schwarz `onUnavailable` disabled → onUnavailable
  test fails; schwarz preempt disabled → preempt test fails; pool survivor=0 drain resolves non-null → drain test
  fails. All three reverted byte-identically via Edit (no git checkout). Sources pristine (`git diff app/` empty).
- **Green bar:** build/typecheck/lint exit 0; full `pnpm test` **2092 passed / 240 files** (+11 tests, +1 file vs
  refactor/main's 2081/239). Cut `refactor/B4-2c-schwarz-pool-lane-nets`; PR → refactor/main; merge on green.
- **QD-UI-1:** all six solver-worker lanes now have their crash + lifecycle contract pinned → the shared-fragment
  extraction (revised C1b) is fully net-guarded.

## 2026-07-31 — Phase D · Stage C1b (worker crash-detail formatter — QD-UI-1 close-out) — PR opened
- User "continue" (after B4-2c #187 merged; refactor/main @ 8df5487 green 2092/240) → proceeded with the
  RIGHT-SIZED C1b per the B4-2c finding (the 3 remaining lanes do NOT fit `createWorkerLane`).
- **Analysis outcome:** the ONLY primitive all six lanes genuinely share is the worker-`error` **detail formatter**
  (`<message> @ <filename>:<lineno>`), copied verbatim in primary-solver + sym + schwarz (prefixed) + param-slice-
  pool (`e &&`-guarded). The surrounding settle/teardown is legitimately per-lane (reject a Promise / call `onError`
  / pool-survivor) — which is WHY C1a's collapse correctly stopped at the 3 PSW lanes. So C1b = extract that one
  primitive, NOT a lane-collapse (which would have over-generalized the factory into a config-flag monster).
- **This PR (source refactor, behavior-preserving):**
    · NEW `app/workers/worker-crash-detail.mjs` — `formatWorkerErrorDetail(ev)` (1 pure fn). Output identical for
      any truthy event: `(ev.message||ev)` and `((e&&e.message)||e)` both reduce to `(ev&&ev.message||ev)`.
    · 4 call sites retrofit (import + the one line): primary-solver-worker.mjs, algebra/sym-worker.mjs,
      schwarz/schwarz-cpu-worker.mjs (keeps its `'schwarz CPU worker crashed: '` prefix on the call),
      param-slice/param-slice-pool.mjs. `git diff` = +8/−5 across 4 files + 1 new file.
- **Behavior preserved — proven by the net (no new test; the refactor keeps the count):** the complete 6-lane
  worker net stays green — psw-crash-char 7 + psw-lifecycle 13 + sym-crash 3 + sym-lifecycle 5 + schwarz-crash 5 +
  schwarz-lifecycle 9 + param-slice-pool 12 = **54/54**; full `pnpm test` **2092/240** (unchanged). build/typecheck/
  lint exit 0. Cut `refactor/C1b-worker-crash-detail`; PR → refactor/main; merge on green.
- **QD-UI-1 CLOSED.** C1a collapsed the 3 verbatim PSW lanes (−40%); C1b factors the one cross-cutting primitive;
  the residual per-lane divergence is documented as legitimate (distinct abstractions), not debt. The messageerror/
  error-settle drift class that shipped the schwarz Pass-1/3 bug is now frozen by the 6-lane net + the shared
  formatter. **Group C worker-lane work (C1) is DONE.** Next: C2 (typed protocol) / C3 (defineFamily).

## 2026-07-31 — Phase D · Stage C2 (typed worker protocol — QD-UI-4) — PR opened
- User chose C2 after C1 complete (refactor/main @ a6332d5, 2092/240). Char-net-first per §D.
- **Char net FIRST (committed aa0b98e, green on unmodified code):** `vitest/worker-protocol.test.ts` drives the
  REAL `solver-worker-entry.mjs` via a stubbed `self` + stubbed solver methods, pinning the known-kind round-trip
  (solve/altSearch/liveSolve → `{kind,jobId,result}`; throw → `{kind,jobId,error}`; falsy msg ignored) AND the
  CURRENT unknown-kind behavior (silently dropped — the QD-UI-4 hang). Mutation-verified (drop the solve `result`
  → the round-trip test bites). Also begins closing QD-UI-5 (worker-entry dispatch had zero executable coverage).
- **Refactor (this PR, commit 2):**
    · NEW `app/workers/protocol.mjs` — `reply(kind,jobId,result)` / `replyError(kind,jobId,err)` (the envelope every
      entry hand-rolled) + `dispatch(msg, handlers, post)`: runs `handlers[kind]` (owning the try/catch + envelope),
      and — the fix — replies with an error envelope for an UNHANDLED kind (echoing the request kind so the caller's
      kind-filtered listener settles) instead of dropping it.
    · `solver-worker-entry.mjs` 53→31 lines: the 3-kind `if / else-if` chain (no `else`) → a `handlers` map + one
      `dispatch` call. Known-kind behavior byte-identical (the round-trip net stays green); unknown-kind now settles.
- **Behavior:** known kinds PRESERVED (the round-trip net stays green); unknown kind **CHANGED** drop→error-reply —
  the one APPROVED change (PLAN v1 C2 "unknown kind no longer hangs"); the char test's unknown-kind assertion was
  flipped to the new behavior in the refactor commit. 6 new `protocol.mjs` unit tests.
- **Green bar:** build/typecheck/lint exit 0; `pnpm test` **2103 passed / 241 files** (+11 tests, +1 file vs
  refactor/main). Cut `refactor/C2-worker-protocol`; PR → refactor/main; merge on green.
- **Scope (bounded, honest):** C2 covers the PRIMARY entry (the 3-kind chain — the actual hang site) + the shared
  protocol module. The other entries hand-roll the same reply envelope but don't dispatch on input kind
  (sym = single type; param-slice / schwarz = streaming/pool shapes) — routing their reply builders through
  `protocol.mjs` is a clean **follow-on (C2b)**, noted not done. **QD-UI-4: the silent-hang class is fixed on the
  primary path and the typed protocol is established.**

## 2026-07-31 — Phase D · Stage C3a (golden solver-family net — QD-SOLV-4/5 net-first) — PR opened
- User chose C3 (defineFamily) after C2 merged (refactor/main @ 3cc3e0d, 2103/241). C3 is the delicate SOLVER
  stage, so per §D the golden residual-vector net lands FIRST, as its own PR (mirroring B4→C1).
- **Understanding (evidence; subagent-mapped + runtime-verified, I checked the anchors):** the 10 families share a
  uniform ~17-key `QD.Family.<name>` record (boundedQD = solver-qd.mjs:327). Diffs: +1 key `sampleBoundary` on the
  4 PQD families (→18); `computeTargets` returns `{A,F:null}` bounded / `{A,F:[…]}` unbounded, and uniquely
  `{A,F,G}` for unboundedLQD_singular; every method shares an identical external signature; the math fns are
  per-family. `defineFamily(config)` is feasible — factor the record scaffolding + normalize the seed-arg
  convention (3 families unwrap `norm` positionally, 7 pass it whole); the math is injected, NOT unified.
- **This PR (tests-only):** `vitest/solver-family-golden.test.ts` (11 tests) — for each of the 10 families, pins
  `residual`/`packPhi`/`computeTargets` on the deterministic `initialGuess` phi for a test-derived (hData, opts)
  input (refs the solvers-*.test.js battery inline). Tolerance-compared (abs 1e-6 + rel 1e-6) to absorb
  ~1e-17..1e-34 structurally-zero FP noise. NOTE `normalizeOpts({})` throws for 8/10 (each needs its real opts
  bag: c/alpha/w0/q). Green on the unmodified families (11/11); mutation-verified (scale boundedQD packPhi → only
  that family fails). Golden vectors captured headlessly via solver-graph.mjs, deterministic across 2 runs.
- **Green bar:** build/typecheck/lint exit 0; `pnpm test` **2114 passed / 242 files** (+11, +1 file). Cut
  `refactor/C3a-family-golden-net`; PR → refactor/main; merge on green.
- **Next → C3b:** `defineFamily(config)` + seeds-common — factor the 17-key record scaffolding across all 10
  solver-*.mjs (math untouched: evalPhi / phiTaylorAt / computeTargetA / residual), guarded by THIS net staying
  bit-(near)identical before/after per family. QD-SOLV-4/5 resolved there.

## 2026-07-31 — Phase D · Stage C3b part 1 (defineFamily + 3 families — QD-SOLV-4) — PR opened
- User chose "Go — incremental" for C3b (defineFamily). Doing it in per-batch commits, each re-verified against
  the C3a golden net + full green bar so every commit is a safe stopping point.
- **NEW `app/solvers/define-family.mjs`** — `defineFamily(config)` assembles the `QD.Family.<name>` record,
  factoring the mechanical scaffolding: `enforceInDisk`/`enforceOutDisk` from a single `unbounded` flag; the
  `computeTargets` `{A[,F][,G]}` composition from the supplied target computers; a DEFAULT `diverseInitialGuess`
  = `QD.diverseInitialGuess` delegation; the fixed key layout. The per-family math + seed/continuation kernels are
  injected verbatim (never unified — ADR-0007/0008).
- **FINDING (evidence, read the literals firsthand):** the shells diverge MORE than the C3a map implied —
  `diverseInitialGuess` is per-family for LQD (its own `diverseInitialGuess_LQD`, NOT the shared delegation), and
  the seed/continuation arg convention varies (boundedQD/unboundedQD unwrap `norm.w0`/`norm.c` positionally;
  boundedLQD passes `norm` whole). So defineFamily is a **scaffolding-factor with injected kernels**, a
  real-but-modest DRY win, NOT a collapse — `diverseInitialGuess` is injectable (default only when omitted);
  seed/continuation thunks stay per-family. (The C1b lesson: don't over-generalize.)
- **This PR (part 1 of 2) — retrofit 3 families spanning the divergences:** boundedQD (bounded · positional
  `norm.w0` · default diverse), unboundedQD (unbounded · F-array · positional `norm.c`), boundedLQD (whole-`norm`
  · own `diverseInitialGuess_LQD`). Each `QD.Family.X = {…}` literal → `QD.Family.X = defineFamily({…})`.
- **Behavior-preserving:** the C3a golden net stays **11/11** (per-family residual/packPhi/computeTargets
  identical) and the full suite is green (build/typecheck/lint exit 0; node oracle **2332/0**; 2114/242). No test
  added — guarded by the pre-existing golden net + the end-to-end solver suite. Cut `refactor/C3b-define-family`.
- **Part 2 (next):** the remaining 7 families — unboundedLQD, boundedLQD_singular, unboundedLQD_singular (the
  `{A,F,G}` case → `computeTargetG`), powerQD (positional `norm.w0`+`alpha`), powerQD_singular, unboundedPQD +
  unboundedPQD_singular (the `sampleBoundary` key). QD-SOLV-4/5 resolved when all 10 are on defineFamily.

## 2026-07-31 — Phase D · Stage C3b part 2 (remaining 7 families — QD-SOLV-4 RESOLVED) — PR opened
- Continued C3b (user chose "Go — incremental"). Part 2 retrofits the remaining 7 families onto `defineFamily`,
  completing the 10/10 migration. Executed via a subagent on `refactor/C3b2-define-family`: batch 1 (commit
  0794629) = unboundedLQD / boundedLQD_singular / unboundedLQD_singular (incl. the only `{A,F,G}` family →
  `computeTargetG`). The subagent then **stalled** with batch 2 (the 4 PQD families) edited-but-uncommitted and
  terminated without a completion signal.
- **Main session took over** (safe — TaskStop reported the agent already gone; no live process): confirmed all 10
  families call `defineFamily`; independently re-verified the tree — **golden net 11/11**, `pnpm test` green
  (**2114/242**, node oracle 0 failed), build/typecheck/lint exit 0; reviewed the diffs (each confined to the
  Family literal + import — the only non-config lines are old literal `};` → `});`; **NO math touched**); then
  committed the PQD batch (b9f0b9a: powerQD / powerQD_singular / unboundedPQD / unboundedPQD_singular, with
  `sampleBoundary` passed through).
- **Behavior-preserving throughout.** ~50 lines of record scaffolding removed across the 10 files (enforce flags,
  computeTargets thunks, default-diverse thunks, literal structure).
- **QD-SOLV-4 → RESOLVED:** the ~17-key Family shell is no longer re-typed 10×; all 10 are assembled by
  `defineFamily(config)`. **QD-SOLV-5 (seeds mirror) → REMAINS OPEN** — defineFamily made the seed *wiring*
  uniform, but the seed *strategy* files (`solvers/seeds/*`) are still per-family; a `seeds-common` extraction was
  NOT pursued (out of C3b scope — the seed math is genuinely per-family; own follow-on if wanted).
- **Group C (dedup collapse) COMPLETE:** C1 worker lanes, C2 typed protocol, C3 family factory. Cut
  `refactor/C3b2-define-family`; PR → refactor/main; merge on green. Next: Group D (installAlgebra, ui.mjs) or pause.

## 2026-07-31 — Phase D · Stage D-ui-seam (ui.mjs first seam: domain-mode algebra) — PR opened
- User: "Proceed with Group D." Group D = god-module decomposition (installAlgebra, ui.mjs). Started with the
  net-first **ui.mjs-seam** stage (ui.mjs = QD-UI-2, ~1931 lines, ZERO characterization coverage, no export seam).
- **Read-only mapping (subagent, verified firsthand):** ui.mjs is the Phase-2 PORT — most god-module
  responsibilities are ALREADY extracted into siblings (ui-modes / ui-solve / ui-pole-grid / ui-domain-plot / …)
  and just installed here via `QD_UI.installX(uiCtx)`; the file is mostly DOM wiring + install glue. The
  genuinely-pure, still-trapped pieces are the domain-mode algebra cluster + a geometry pair. Chose the domain-mode
  cluster (more central; an inverse-pair invariant to pin).
- **This PR (behavior-preserving extraction):** NEW `app/ui-domain-mode.mjs` — `composeMode` / `decomposeMode` /
  `modeSummary` (the "10 modes = {weight}×{bounded|unbounded}×{singular}" algebra), copied VERBATIM as named
  exports; ui.mjs imports them (+1 import, −~28 def lines, comment repointed; ZERO call-site edits — the 5 sites
  681/713/732/1687/1818 now call the imports). All 3 are PURE (zero DOM/state/QD refs).
- **Net-first + mutation-verified:** NEW `vitest/ui-domain-mode.test.ts` (19) pins the mapping, the compose∘
  decompose round-trip (10 modes), and the two DELIBERATE quirks — classical drops `singular`; modeSummary emits
  the ungrammatical "a unbounded" (pinned, not "fixed"). Mutation (fallback domain bounded→unbounded) → only the
  fallback test fails. This is the FIRST executable coverage ui.mjs's logic has ever had (chips QD-TEST-2/QD-UI-5).
- **Green bar:** build/typecheck/lint exit 0; `pnpm test` **2133 passed / 243 files** (+19, +1 file). Cut
  `refactor/D-ui-seam-domain-mode`; PR → refactor/main; merge on green.
- **Revised Group-D understanding:** ui.mjs's bulk is DOM-wiring (the logic is already in siblings), so ui.mjs
  "decomposition" is more about grouping the wiring than extracting logic. Remaining pure seam = the geometry pair
  (boundarySelfIntersectsSimple / segmentsIntersect). **installAlgebra (algebra-ui.mjs, ~4.2k-line fn, QD-ALG-1) is
  the bigger, still-monolithic Group-D target** — its own net-first stage next if we continue D.

## 2026-07-31 — Phase D · Stage D-ui-seam-2 (ui.mjs geometry seam) — PR opened
- Continuing Group D. Extracted the SECOND (and last) pure piece the ui.mjs map found: the geometry pair
  `boundarySelfIntersectsSimple` + `segmentsIntersect` (the Direct-tab univalence-preview self-intersection check)
  → NEW `app/ui-geometry.mjs`, copied verbatim as named exports; ui.mjs imports `boundarySelfIntersectsSimple`
  (its one call site, 1740). +2/−21 lines in ui.mjs.
- **Net-first + mutation-verified:** NEW `vitest/ui-geometry.test.ts` (6) — segment crossing/parallel/collinear
  (the strict-`>` CCW MISSES collinear overlap — pinned, not fixed) + boundary square/bow-tie/N<4. Mutation
  (N<4 guard → true) → only the N<4 test fails.
- **Green bar:** build/typecheck/lint exit 0; `pnpm test` **2139 passed / 244 files** (+6, +1 file). Cut
  `refactor/D-ui-seam-geometry`; PR → refactor/main; merge on green.
- **ui.mjs pure-seam extraction is now COMPLETE** (both pure pieces the map identified are out + netted). ui.mjs's
  residual bulk is DOM wiring (logic already in siblings). The remaining Group-D monolith is **installAlgebra**
  (algebra-ui.mjs, ~4.2k-line fn, QD-ALG-1) — big + DOM-heavy; needs its own char-strategy proposal + scope
  agreement before implementation (NOT auto-started).
