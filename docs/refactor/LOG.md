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

## 2026-07-31 — Phase D · Stage D-alg-carve-1 (installAlgebra carve-out 1 — classifyVerdict) — PR opened
- **First installAlgebra carve-out** (user chose "Carve-outs (recommended)"): begin decomposing the god-function by
  its PURE sub-computations. A read-only map + firsthand verification found the honest-labeling verdict prose as the
  best first target. **Correction to QD-ALG-5** ("built in two places → de-dup"): there are THREE similar-but-DISTINCT
  builders — doClassify @3521, doAutoSolve @3275, `_verdictBadge` @4693 — with DRIFTED wording (e.g. "the system is
  inconsistent (1 ∈ I)." vs "the reduced system is inconsistent."). Merging would CHANGE strings (behavioral, needs an
  approval token), so this carves ONE site as a pure seam; unification is a later characterization-first step.
- **This PR (behavior-preserving extraction):** NEW `app/algebra/algebra-labeling.mjs` — `classifyVerdict(r)` (the
  classify-result → existence/uniqueness verdict decision tree, carved VERBATIM from doClassify:3521-3534) +
  `posDimDesc` (its only dep, a pure size-of-positive-dim leaf; moved from the IIFE T1 scope, so it belongs with the
  prose). algebra-ui imports both; doClassify's 13-line inline block → `let verdict = classifyVerdict(r)` (the
  slice/scope/branch caveat appends stay put — they read DOM/store: `sel`, the current column). QD_UI re-exports
  preserved (keeps `algebra-verdict-rigor.test.ts`'s `QD_UI.posDimDesc` read green). −21/+7 in the god-file.
- **Net-first + mutation-verified:** NEW `vitest/algebra-classify-verdict.test.ts` (11) pins every verdict string
  (imported DIRECTLY from the module — pure, no jsdom/QD_UI), incl. two DELIBERATE quirks: the ==1-vs-≥2 "upper bound"
  asymmetry (C-1 honest labeling — pinned, not "harmonized") + the loose `== null` routing `undefined`→"real count
  unavailable". A byte-identity check (16 literals, module vs live source) guarded the transcription BEFORE the source
  block was removed. Mutation (`mult > cx`→`>=`) → only the two `mult===cx` cases fail.
- **Green bar:** build/typecheck/lint exit 0; `pnpm test` **2150 passed / 245 files** (+11, +1 file). Cut
  `refactor/d-alg-carve-1-classify-verdict`; PR → refactor/main; merge on green.
- **installAlgebra decomposition underway** (QD-ALG-1): carve-out 1 of N, mirroring the ui.mjs seam pattern (pure
  sub-computation → small netted module, one PR). Next candidates: a later char-first UNIFICATION of the three drifted
  builders (needs an approval token — changes strings), or QD-ALG-6 realness/verify tolerance predicates.

## 2026-07-31 — Phase D · Stage D-alg-carve-2 (installAlgebra carve-out 2 — _verdictBadge) — PR opened
- **Second installAlgebra carve-out** (continuing "Carve-outs", merge-on-green cadence): the pure chip-badge builder
  `_verdictBadge` (classify result → `{badge, state, title}`), the THIRD of the three drifted verdict builders and,
  like carve-out 1's target, previously reachable only through a full DOM+solver mount → zero executable coverage.
- **Shape decision (evidence-driven):** an IN-FILE lift to IIFE scope (the T1 pattern), NOT a module move like
  carve-out 1. Reason: `_verdictBadge`'s dep chain is `_verdictBadge → sliceLabels → latexPlain`, and `latexPlain` is
  referenced ~50× across installAlgebra (label toasts, pickers, PROV_UI derivation labels, solution formatting) —
  relocating it (required to move `sliceLabels`, required to move `_verdictBadge`) is a huge blast radius for netting
  ONE function. The T1 lift keeps `sliceLabels`/`latexPlain`/all ~50 sites untouched: hoist `_verdictBadge` out of
  installAlgebra to IIFE scope (where the imported `posDimDesc` + IIFE `sliceLabels` are already in scope), expose
  `QD_UI._verdictBadge`. Callers (cacheActiveVerdict / classifyAllBranches, both inside installAlgebra) resolve it
  unqualified — ZERO call-site churn. +30/−25 in algebra-ui.mjs (installAlgebra shrinks; the god-FUNCTION is QD-ALG-1's target).
- **Behavior-preserving by construction:** an in-file move ⇒ the string literals are byte-identical (verified
  mechanically: the 24-line body is identical to HEAD's modulo leading whitespace; only the 4→2-space indent changed).
- **Net-first + mutation-verified:** NEW `vitest/algebra-verdict-badge.test.ts` (10; jsdom + `QD_UI._verdictBadge`,
  the T1 test pattern) pins the badge glyph / colour-`state` / `title` for all four base verdicts + the defensive
  null/`?` paths, the **C-1 honest-labeling guardrail** (a lone real ALGEBRAIC solution is state `'multi'` with an
  "upper bound on #QD" tooltip — never a green `'unique'`), and the slice/branch specialization suffix (`*` + LOWER
  BOUND note). Mutation (the `===1` return's `state 'multi'→'none'`) → only the C-1 guardrail test fails.
- **Green bar:** build/typecheck/lint exit 0; `pnpm test` **2160 passed / 246 files** (+10, +1 file). Existing
  `algebra-verdict-rigor.test.ts` (jsdom/QD_UI) stays green (the QD_UI additions didn't disturb it). Cut
  `refactor/d-alg-carve-2-verdict-badge`; PR → refactor/main; merge on green.
- **installAlgebra carve-outs 1+2 done** — all three verdict builders (doClassify prose, `_verdictBadge` chip) now have
  executable honest-labeling coverage (doAutoSolve's prose still inline). Next: QD-ALG-6 tolerance predicates, another
  pure helper, or (with an approval token) the char-first unification of the drifted builders.

## 2026-07-31 — Phase D · Stage D-alg-carve-3 (installAlgebra carve-out 3 — exact ℚ(i) value formatter) — PR opened
- **Third installAlgebra carve-out** ("Take the next carve out"). First firsthand-assessed the two standing candidates:
  **QD-ALG-6** (realness/verify tolerances) — DECLINED: the ~6 literals (1e-6 verify, 1e-6 realness, 1e-12 w0-match,
  1e-10/1e-8 display-snap) are scattered at unrelated call sites with different meanings, no single pure computation to
  net, unifying risks behavior (left open as a constants cleanup). **`exactValueStr`/`fmtRat`** — chosen: a clean pure pair.
- **This PR (behavior-preserving extraction):** NEW `app/algebra/algebra-format.mjs` — `exactValueStr(re, im)` (complex
  → exact ℚ(i) string: "1/2 + 1/4i", "−1/2i") + its private helper `fmtRat` (float → rational via the store's
  continued-fraction rationalizer). Carved VERBATIM. The one external dep is `QD.QDEquations.ratApprox`; QDEquations
  registers on the QD singleton as an IMPORT SIDE-EFFECT (no direct `ratApprox` export — verified), so the module
  side-effect-imports `qd-equations.mjs` (+ solver.mjs), making it self-contained and headlessly testable — cleaner
  than carve-out 2's jsdom/QD_UI net. algebra-ui imports `exactValueStr` (its 4 call sites unchanged; `fmtRat` was
  private); the installAlgebra `QE = QD.QDEquations` binding stays (used 20× elsewhere). +4/−13; `QD_UI.exactValueStr` added.
- **Net-first + mutation-verified:** NEW `vitest/algebra-exact-format.test.ts` (8; HEADLESS — imports the module, no
  jsdom) pins the rationalizer (0.2→1/5, 3→3, denom-1 drop, the `x||0` guard) and the complex assembly (re-only /
  im-only / both, the ' + ' vs ' − ' sign) — expected values GROUND-TRUTHED against `ratApprox` (which returns BigInt
  pairs), not guessed. A **display guardrail** pins the sign as the typographic MINUS U+2212, never an ASCII hyphen.
  8 behavior-critical literals byte-identity-checked vs source before removal. Mutation (`=== '1'`→`'9'` denom-drop) →
  4 tests fail (all denom-1 cases, across fmtRat + exactValueStr).
- **Green bar:** build/typecheck/lint exit 0; `pnpm test` **2168 passed / 247 files** (+8, +1 file). Cut
  `refactor/d-alg-carve-3-exact-format`; PR → refactor/main; merge on green.
- **installAlgebra: 3 carve-outs done.** algebra-labeling.mjs (verdict prose + posDimDesc) + algebra-format.mjs (exact
  value formatter) now hold pulled-out pure logic; `_verdictBadge` lifted in-file. Remaining pure candidates thinning;
  deeper decomposition (the DOM-bound sidebar build QD-ALG-2, source-text tests QD-ALG-3) needs a different strategy.

## 2026-07-31 — Phase D · Stage D-alg-carve-4 (installAlgebra carve-out 4 — ratio-prefix formatters) — PR opened
- **Fourth installAlgebra carve-out** ("keep carving"). The two pure substitution ratio-prefix formatters —
  `fmtRatio(g)` (a live Gaussian ratio → prefix) + `ratioStrRec(rec, sign)` (a serialized `{re:[n,d],im:[n,d]}`
  provenance record → prefix) — both render the "(c)·" coefficient in front of an identified variable ("x = (c)·y")
  and were reachable only through a live DOM mount ⇒ zero executable coverage. They call `exactValueStr` (carve-out 3),
  so their natural home is `algebra-format.mjs` — this carve-out EXTENDS that module rather than making a new one.
- **This PR (behavior-preserving extraction):** `fmtRatio` + `ratioStrRec` carved VERBATIM into `algebra-format.mjs`
  (they call the co-located `exactValueStr`, so no new deps). algebra-ui imports both; `fmtRatio`'s 2 callers
  (1015/1021) + `ratioStrRec`'s 2 PROV_UI ctx-inject sites (4236/4245) resolve to the imports; the PROV_UI param-uses
  (`(p, { ratioStrRec }) => …`, 176-182) are unaffected (they read the injected value). +26/−20 across the two files.
- **Net-first + mutation-verified:** NEW `vitest/algebra-ratio-format.test.ts` (6; HEADLESS — the module chains
  qd-equations for `exactValueStr`'s rationalizer, so no jsdom) pins the two compacting unit cases (c=1→'', c=−1→'−')
  + the "(…)·" wrap for both a Gaussian (duck-typed `.toNumber()` stub) and a serialized record, plus the sign-fallback
  and the defensive `(c)·` catch. 8 fragments byte-identity-checked vs source (incl. U+2212 minus + U+00B7 middot).
  Mutation (`ratioStrRec` `re === 1`→`9`) → exactly the unit-case test fails.
- **Green bar:** build/typecheck/lint exit 0; `pnpm test` **2174 passed / 248 files** (+6, +1 file). Cut
  `refactor/d-alg-carve-4-ratio-format`; PR → refactor/main; merge on green.
- **installAlgebra: 4 carve-outs done; pure low-hanging fruit now essentially exhausted.** `algebra-format.mjs` holds
  the exact-value + ratio-prefix formatters; `algebra-labeling.mjs` the verdict prose. A 5th carve-out would need a
  fresh scan for any remaining pure helper; otherwise the remaining bulk is DOM-bound (QD-ALG-2) and needs a strategy
  shift (jsdom-drive the sidebar build, or convert the source-text tests QD-ALG-3), or the deferred verdict unification.

## 2026-07-31 — Phase D · Stage D-alg-carve-5 (installAlgebra carve-out 5 — complex-moment parser) — PR opened
- **Fifth installAlgebra carve-out** ("keep carving"). FIRST ran a read-only census of installAlgebra (a subagent, then
  spot-verified firsthand) to correct the "pure fruit exhausted" claim from carve-out 4: it is NOT exhausted — **~16
  cleanly-pure + ~4 pure-if-injected** helpers remain. Census top pick = the complex-moment INPUT PARSER (highest-value
  untested logic: a real parser with branches + error paths, not just a formatter).
- **This PR (behavior-preserving extraction):** `_parseMomentToken(t)` (one moment token `a`/`a+bi`/`a-bi`/`bi`/`i`/`-i`
  → `{re, im}`, throwing on empty / stray-`i` / bad component) + its private helper `_parseMomentNum(s)` (a real
  component `n/d` / decimal → number) → NEW `app/algebra/algebra-moment-parse.mjs`. **ZERO external deps** (only
  String/Number + each other) — a pure leaf, the cleanest carve yet (no side-effect import, no injected helper). Carved
  VERBATIM (whitespace-normalized diff vs source = identical bar a blank-line separator). algebra-ui imports only
  `_parseMomentToken` (its one external use, `doShapeFromMoments`'s `.map(_parseMomentToken)`); `_parseMomentNum` was
  private and moves entirely. +3/−23 in algebra-ui.
- **Net-first + mutation-verified:** NEW `vitest/algebra-moment-parse.test.ts` (9; HEADLESS) pins the number forms
  (integer/decimal/rational + the ''/'+'→1, '-'→−1 shorthands), every complex token form, whitespace stripping, and the
  three user-facing ERROR MESSAGES (empty moment / i-must-be-last / bad rational|number — pinned exactly, since they
  reach the user). Mutation (`d === 0`→`d === 999` in the rational guard) → exactly the zero-denominator test fails.
- **Green bar:** build/typecheck/lint exit 0; `pnpm test` **2183 passed / 249 files** (+9, +1 file). Cut
  `refactor/d-alg-carve-5-moment-parse`; PR → refactor/main; merge on green.
- **installAlgebra: 5 carve-outs done.** Three pure modules now (`algebra-labeling` / `algebra-format` / `algebra-moment-parse`)
  + the in-file badge lift. Census-ranked next: `withGuidance`+`_isCapFailure` (honest-labeling guidance, ~19 sites),
  `_pronyLatex`, `valStr`+`substList`, cheap stragglers, then `latexOf` (pure-if-injected). Genuine pure work remains.

## 2026-07-31 — Phase D · Stage D-alg-carve-6 (installAlgebra carve-out 6 — cap-failure guidance) — PR opened
- **Sixth installAlgebra carve-out** (census #2 pick, "keep carving"): the cap-failure guidance pair. `_isCapFailure(reason)`
  is a substring regex recognizer (`/export|cap|exceed|too large|step|basis|degree|terms/i`) — does a failure look like a
  resource / too-large cap? `withGuidance(reason)` appends the CAS-export escape-hatch hint to such a failure and passes
  everything else through. Both pure, ZERO external deps. This is the honest-labeling of the FAILURE side (say WHY it
  failed + the documented escape hatch), so it extends `algebra-labeling.mjs` rather than a new module.
- **This PR (behavior-preserving extraction):** `_isCapFailure` + `withGuidance` carved VERBATIM into `algebra-labeling.mjs`.
  algebra-ui extends its existing labeling import; the ~19 `withGuidance` call sites (every op's failure path — doGroebner,
  doSaturate, all four doProve*, doClassify, doResolvent, doBifurcation, doDimension, doSolve, importJson, …) resolve to
  the import, and the DOM-coupled `capFailVerdict` (which STAYS in installAlgebra) now calls the imported `_isCapFailure`.
  +18/−8 across the two files. 3 fragments byte-identity-checked vs source (regex + the double-space guidance sentence).
- **Net-first + mutation-verified:** NEW `vitest/algebra-cap-guidance.test.ts` (6; HEADLESS) pins each recognized keyword,
  the false/empty/null cases, the guidance sentence verbatim (incl. its leading double space), and the SUBSTRING-match
  quirk ("escape" contains "cap" ⇒ true — pinned, not "fixed"). Mutation (drop `|terms` from the regex) → only the
  keyword test fails.
- **Green bar:** build/typecheck/lint exit 0; `pnpm test` **2189 passed / 250 files** (+6, +1 file). Cut
  `refactor/d-alg-carve-6-cap-guidance`; PR → refactor/main; merge on green.
- **installAlgebra: 6 carve-outs done.** `algebra-labeling.mjs` now holds the verdict prose + the failure guidance;
  `algebra-format.mjs` the value/ratio formatters; `algebra-moment-parse.mjs` the input parser. Census-ranked next:
  `_pronyLatex` (math→LaTeX), `valStr`+`substList` (the PROV_UI tests mock the real impls), then cheap stragglers.

## 2026-07-31 — Phase D · Stage D-alg-carve-7 (installAlgebra carve-out 7 — Prony-poly math→LaTeX) — PR opened
- **Seventh installAlgebra carve-out** (census #3, "keep carving"): `_pronyLatex(coeffs)` — renders the reconstructed
  Prony polynomial Σ cₖzᵏ=0 as LaTeX on the "Shape from moments" card. Branchy formatting (descending powers, 1e-6
  rounding, near-zero-term drop, unit-coeff elision on a z-power → "z" not "1z", leading-sign handling, parenthesised
  `(a±bi)zᵏ` for complex coeffs) that had zero coverage (reachable only through a live DOM mount). Pure, ZERO external
  deps (only Math/String + the `coeffs` arg).
- **This PR (behavior-preserving extraction):** `_pronyLatex` carved VERBATIM into NEW `app/algebra/algebra-latex.mjs`.
  This starts a dedicated LaTeX-formatter module (distinct from `algebra-format.mjs`'s plain-text ℚ(i)/ratio formatters)
  — the intended home for the census's other pure LaTeX builders (`buildHForm`, `latexOf`, `reimSafeLatex`) as they're
  carved. algebra-ui imports `_pronyLatex`; its one caller (`doShapeFromMoments`) resolves to the import. +2/−22.
- **Net-first + mutation-verified:** NEW `vitest/algebra-prony-latex.test.ts` (8; HEADLESS) pins the all-zero '0 = 0'
  case, a bare constant, unit-coeff elision, the leading-'-' vs joined-' - ', z^{k} for k≥2, multi-term joining, the
  parenthesised complex form, and the 1e-6 rounding + sub-1e-9 drop. Byte-identity: the 20-line body is identical to
  source modulo indent + `export`. Mutation (drop the leading-'-' branch) → only the leading-negative test fails.
- **Green bar:** build/typecheck/lint exit 0; `pnpm test` **2197 passed / 251 files** (+8, +1 file). Cut
  `refactor/d-alg-carve-7-prony-latex`; PR → refactor/main; merge on green.
- **installAlgebra: 7 carve-outs done, 4 pure companion modules** (labeling / format / moment-parse / latex) + the
  in-file badge lift; ~58 new characterization tests. Census-ranked next: `valStr`+`substList` (PROV_UI tests mock the
  real impls), then `buildHForm`/`friendlyReim`/`isForkedColumn`/`_relKey`/… , then `latexOf` (pure-if-injected).

## 2026-07-31 — Phase D · Stage D-alg-carve-8 (installAlgebra carve-out 8 — valStr; substList deferred) — PR opened
- **Eighth installAlgebra carve-out** (census #4, "keep carving" — merged #201 first via the chained fallback). The
  census paired `valStr`+`substList`; on firsthand inspection I **split the pair**: `valStr` is a clean verbatim pure
  leaf, but `substList` calls `latexPlain` — the IIFE-scoped ~50-ref helper carve-out 2 showed is un-exportable (a
  module import would cycle; moving latexPlain is a ~50-site blast radius). Moving substList needs latexPlain injected
  as a PARAMETER + edits to its 2 PROV_UI builder call sites — a signature change touching the tested registry, so NOT
  a verbatim carve. **Deferred substList; did valStr only** (behavior-preserving + verbatim > completeness).
- **This PR:** `valStr(rec)` — compact DECIMAL display of a stored `{approx:{re,im}}` record ("re ± im·i", 1e-6
  rounding, U+2212 minus; the per-card hovertext value, distinct from `exactValueStr`'s exact ℚ(i)) — carved VERBATIM
  into `algebra-format.mjs`. It's INJECTED into the PROV_UI ctx (→ resolves to import); the PROV_UI param-uses and
  substList's internal use now call the imported valStr. +12/−9. 5 fragments byte-identity-checked (incl. U+2212).
- **Net-first + mutation-verified:** NEW `vitest/algebra-valstr.test.ts` (6; HEADLESS) pins the '?' no-approx fallback,
  re-only / im-only / both-parts (' + ' vs ' − '), 1e-6 rounding, and the U+2212 display guardrail. This is the FIRST
  real coverage of valStr — the PROV_UI tests inject a MOCK valStr. Mutation (im-only 'i'→'j') → only the im-only test fails.
- **Green bar:** build/typecheck/lint exit 0; `pnpm test` **2203 passed / 252 files** (+6, +1 file). Cut
  `refactor/d-alg-carve-8-valstr`; PR → refactor/main; merge on green.
- **installAlgebra: 8 carve-outs done.** Census-ranked next: `substList` (as a latexPlain-injection carve), then the
  cheap stragglers (`buildHForm`, `friendlyReim`, `isForkedColumn`, `_relKey`, …), then `latexOf`(+`reimSafeLatex`).

## 2026-07-31 — Phase D · Stage D-alg-carve-9 (installAlgebra carve-out 9 — buildHForm h(w) LaTeX) — PR opened
- **Ninth installAlgebra carve-out** (census straggler, "keep carving" — merged #202 first via the chained fallback).
  `buildHForm(hData, numeric)` renders the quadrature data h(w) = Σⱼ Σ_{s≥1} C_{j,s}/(w−aⱼ)^s as LaTeX on the φ/h
  reference card — symbolic `a_{j}`/`C_{j,s}` names, or the pole/coefficient values substituted (numeric=true). Pure;
  reachable only through a live DOM mount before, so zero coverage.
- **This PR (behavior-preserving extraction):** `buildHForm` carved VERBATIM into `algebra-latex.mjs` (only `QD` →
  the imported `_QD` singleton). Its one dep is `QD.RiemannLatex.katexCmpxParen` — a QD-namespace method registered on
  the singleton by importing `riemann-latex.mjs` (no direct export) — so the module now side-effect-imports
  riemann-latex.mjs (the same pattern algebra-format.mjs uses for QDEquations/ratApprox). algebra-ui imports buildHForm;
  its one caller (the φ/h reference card) resolves to the import. +2/−16 in the god-file (algebra-latex +24).
- **Net-first + mutation-verified:** NEW `vitest/algebra-hform.test.ts` (5; HEADLESS — the module chains riemann-latex,
  so katexCmpxParen is wired) pins the empty-poles '0', symbolic 1-coeff/2-coeff (power-1 no exponent vs `^{2}`),
  multi-pole `a_{j}`/`C_{j,s}` indexing, and numeric substitution (real→bare, complex→parenthesised). 4 fragments + the
  return line byte-identity-checked. Mutation (`^{power}`→`^[power]`) → only the 2-coeff test fails.
- **Green bar:** build/typecheck/lint exit 0; `pnpm test` **2208 passed / 253 files** (+5, +1 file). Cut
  `refactor/d-alg-carve-9-hform`; PR → refactor/main; merge on green.
- **installAlgebra: 9 carve-outs done.** `algebra-latex.mjs` now holds `_pronyLatex` + `buildHForm`. Census-ranked next:
  the cheap predicates (`isForkedColumn`, `_relKey`, `_substKey`, `friendlyReim`, `refMeaning`, …), then the
  latexPlain-injection carves (substList, latexOf, reimSafeLatex).

## 2026-08-01 — Planning checkpoint · COMPLETION-PLAN committed (direct to refactor/main)
- **Milestone, not a code stage.** After the 9-carve-out inflection I presented a 5-phase completion plan and asked
  three decisions; user answered: **"1. Take the pragmatic path. 2. Defer. 3. Do the D1c verdict-unification token.
  Commit this so it's tracked."** Committed as a tracked doc so the home stretch is on record.
- **NEW `docs/refactor/COMPLETION-PLAN.md`** (APPROVED 2026-08-01): sequences PLAN.md Groups D/E/F into 5 phases and
  records the decisions. (1) pragmatic path = do D1 enabler + D1a/D1b, **re-evaluate at a gate before D1c/D1d**;
  (2) **E1 deferred** (resolves PLAN §9 D-3); (3) **D1c verdict-unification token GRANTED** — the one authorized
  behavioral change (unifies the 3 drifted verdict builders doClassify@3521 / doAutoSolve@3275 / _verdictBadge@4693;
  ships behind a net, honest labeling preserved, string delta logged).
- **Grounded firsthand before committing the figures:** installAlgebra still ≈4.1k lines (algebra-ui.mjs:714, file
  4,849) — the carve-outs were a prelude; the remaining mass is DOM-bound (QD-ALG-2) + store-coupled. The true D1
  enabler is Phase 2: convert the **11** algebra source-text (readFileSync+regex) tests → behavioral jsdom (QD-ALG-3)
  — corrected my earlier "17" (15 total readFileSync in QD vitest, 11 algebra). F1 unstarted (no dependency-cruiser
  config or CI). ui.mjs 1,891 lines / 0 exports / 16 ui-*.mjs factories. 58 flat app/*.mjs (E2). Green 2208/253.
- **PLAN.md updated (surgical):** §9 marked RESOLVED → COMPLETION-PLAN §1; §10 status appended. No change to the
  approved v1 body/findings.
- **Recommended immediate next step: Phase 1** (F1 dependency-cruiser + A1 residuals QD-ALG-7 `.slice()` /
  QD-SOLV-6 `identityOK` tol). Behavior-preserving, unblocked, needs no new net.

## 2026-08-01 — Phase 1 · Stage p1-a1-residuals (QD-ALG-7 edges copy + QD-SOLV-6 identity-tol) — PR opened
- **First Phase-1 PR** (COMPLETION-PLAN Phase 1; the two A1 residuals, one small behavior-preserving PR). Both are
  low-severity encapsulation/consistency fixes; net-first + mutation-verified; no token needed (value-identical).
- **QD-ALG-7 (algebra-store.mjs:3115):** the `edges` store getter returned the LIVE internal array (its siblings
  `realVars`/`imagVars` already `.slice()`). Fixed → `return edges.slice()`. Verified NO caller mutates the returned
  array (only `algebra-canvas.mjs` read-only `for…of` + read-only test `.length`/`.some`), so observationally
  behavior-preserving. Net: a block in `app/test/algebra-store.test.js` (the store's bootstrapped home) — a content
  pin (edges reflected, GREEN both sides) + an isolation assertion (external push does not leak — RED before, GREEN
  after). Reverse mutation-verified in the pre-change run: only the isolation assertion failed on unmodified code.
- **QD-SOLV-6 (solver.mjs):** the identity-check gate `maxRelDiff < 1e-6` was open-coded ×3 with the bare literal —
  _computeIdentity (site A, via solveInverseQD), searchAlternates (site B), liveSolveStep (site C). The DEFAULT was
  uniformly 1e-6 at every site (the "divergence" was structural: repeated literal, C non-overridable — NOT a value
  difference). Centralized to one named `const IDENTITY_TOL = 1e-6`, exposed on the namespace, override semantics
  UNCHANGED (C stays non-overridable). Behavior-preserving. Net: NEW `vitest/solver-identity-tol.test.ts` (3, headless
  via solver-graph.mjs) — value pin `QD.IDENTITY_TOL===1e-6` [after-only] + site-A (solveInverseQD certifies the disk)
  and site-C (liveSolveStep identityOK) accept-anchors [GREEN both sides]. Forward mutation-verified (IDENTITY_TOL→1e-30
  ⇒ all 3 fail). The accept/REJECT boundary at 1e-6 stays pinned by the node batteries (solvers-1..4 identityOK true on
  genuine QDs, !identityOK on spurious). **param-slice-common.mjs site D** (`opts.identityTol || 1e-6`, already
  parameterized) left as-is — noted; it can reference `QD.IDENTITY_TOL` in a later param-slice touch.
- **Green bar:** build/typecheck/lint exit 0; `pnpm test` **2211 passed / 254 files** (+3, +1 file). Cut
  `refactor/p1-a1-residuals`; PR → refactor/main; merge on green.

## 2026-08-01 — Phase 1 · Stage p1-f1-depcruise (F1 — wire dependency-cruiser) — PR opened
- **Phase 1 close-out (F1):** the "planned follow-on" the root ESLint config header + MIGRATION.md "Ongoing"
  anticipated — a dependency-cruiser graph gate for the two invariants ESLint's `no-restricted-imports` can't do:
  NO import cycles, and the strictly-downward shape (no package→app, no app→app). No app/package CODE changed.
- **Config** (`.dependency-cruiser.cjs`, root): 3 error rules — `no-circular`, `no-package-to-app` (^packages/ → ^apps/),
  `no-cross-app` (apps/$1 → apps/other via the `$1` backref). `tsPreCompilationDeps: true` so TYPE-ONLY imports are in
  the graph — load-bearing: CD-4 was a type-only render cycle (fixed A3) a runtime-only crawl can't see; this keeps a
  type-only cycle from silently reappearing. node_modules not followed; dist/build/coverage/.vite excluded.
- **Wiring:** new `dep:check` script (`depcruise packages apps`) folded into `pnpm lint` (`eslint . && pnpm dep:check
  && …`). One source ⇒ enforced in the LOCAL green bar, the CI `build` job's Lint step, AND deploy-pages.yml's lint (so
  the graph rules gate publishing too). ci.yml Lint step comment updated to name it.
- **Net + mutation-verify:** the config PASSES on the current graph (580 modules / 1361 deps, 0 violations — the codebase
  already conforms, so behavior-preserving). Mutation-verified ALL THREE rules — planted a runtime cycle + a package→app
  import + an app→app import (each fired with the right rule name) — and separately a pure `import type` cycle (fired ⇒
  tsPreCompilationDeps genuinely catches the CD-4 class). All temp files removed; clean re-run.
- **Green bar:** build/typecheck/lint(+dep:check)/test exit 0; `pnpm test` **2211 / 254** (unchanged — F1 adds no unit
  tests; its "net" is the passing graph gate + the mutation-verify). Cut `refactor/p1-f1-depcruise`; PR → refactor/main.
- **Phase 1 COMPLETE** (A1 residuals #204 + F1). Next: Phase 2 (the D1 enabler — convert the 11 QD-ALG-3 source-text tests → jsdom).

## 2026-08-01 — Phase 2 · Stage p2-1-mount-harness (jsdom mount harness + section-order conversion) — PR opened
- **Phase 2 kickoff (the D1 enabler, QD-ALG-3):** replace the brittle source-text algebra tests (readFileSync + regex
  over algebra-ui.mjs's sidebar HTML STRING) with BEHAVIOURAL jsdom tests that mount installAlgebra and assert the
  RENDERED DOM — so they survive the D1a "sidebar as data" refactor (same DOM, new construction) instead of breaking on
  it. Tests-only; no production code changed.
- **AUDIT (recorded):** the mount is PROVEN feasible — AlgebraCanvas renders with SVG (no canvas 2D/GL ctx jsdom lacks);
  installAlgebra reads ~10 mockable ctx props and mounts lazily behind a `tab-changed` listener; the panel builds into
  #controls-algebra. The 11 source-text tests are a MIX: clean DOM-structure conversions (section-order, honest-labels,
  tooltip-tiers, eliminate-section placement), interaction tests (shortcuts dispatch, scope-disclosure, tier6 setBusy,
  canvas focus), a pure fn pinned via regex (resultStateOf → extract+call), and genuine source-invariants (comment
  hygiene, "no nth-of-type", WCAG color tokens, "every setVerdict has rigor" → best handled at D1c). The node-vs-jsdom
  env split is load-bearing (jsdom breaks fileURLToPath), so source-hygiene residue stays in node-env files.
- **NEW `vitest/_algebra-mount.ts`** — the reusable harness: boot the QD kernels (11 imports) → scaffold (tab btn +
  #controls-algebra + #algebra-graph) → stub ctx → installAlgebra → dispatch `tab-changed` → returns {container, $, $$,
  sectionNames, …}. Throws if the sidebar doesn't render. Call once per file (installAlgebra adds a listener per call).
- **CONVERTED `algebra-section-order.test.ts`** node/source → jsdom/behavioural (8 tests): section count vs nested
  disclosures, the 8 sections in DOM order, workflow-step sequence, Export last, divider "Beyond the main route" between
  Analyze & Univalence, "does not touch the workspace". **Mutation-verified:** renaming a production section
  (Reduce→Reduxe) failed exactly the 3 Reduce-dependent assertions (the other 5 held), then reverted byte-identically.
  Retired the one source-only assertion (header comments numbered 1..8 — comment hygiene, not behaviour; the sections
  are now verified in the DOM). −1 test net (9→8).
- **Green bar:** build/typecheck/lint(+dep:check 581 modules)/test exit 0; `pnpm test` **2210 / 254**. Cut
  `refactor/p2-1-mount-harness`; PR → refactor/main; merge on green.
- **Phase 2 remaining:** PR 2.2 (honest-labels, eliminate-section, tooltip-tiers + resultStateOf extract; workflow-
  sections behavioural part + source-hygiene split), PR 2.3 (interaction tests + op-runner/verdict-prose coverage).

## 2026-08-01 — Phase 2 · Stage p2-2-algebra-dom (eliminate-section split: DOM→behavioural) — PR opened
- **Second Phase-2 conversion (QD-ALG-3), and a refinement of the audit.** Reading the targets firsthand showed the
  "11 source-text tests" are MIXES of three assertion kinds, not uniform sidebar-string regexes:
  (1) sidebar-MARKUP regexes (brittle under D1a) → convert to behavioural DOM;
  (2) FUNCTION-BODY / wiring regexes (doGroebner reads elimSel, guard ordering, addEventListener) — brittle under D1d
      code-movement, NOT D1a, not cleanly behavioural → stay node-env;
  (3) STRINGS-registry data (ui-strings algebraOps) / other-file (style.css WCAG) — not D1-brittle → stay.
  So each mixed file converts as a SPLIT (behavioural jsdom companion + slimmed node file), matching the existing
  workflow-sections/-steps + shortcuts-table/-focus convention. Also: **resultStateOf is ALREADY behavioural**
  (algebra-results-drawer calls QD_UI.resultStateOf directly) — the audit's "extract+call" was wrong; only its
  recorder-wiring block is source-text.
- **eliminate-section split:** NEW `algebra-eliminate-section-dom.test.ts` (jsdom, 8 tests via the harness) — picker
  mounted-once / not-in-Advanced / under the Eliminate-variables heading above the buttons; the Rewrite-vs-Narrow
  caption grouping (solution-preserving vs solution-changing ops); the eliminate button's js-busy-lock marker; its
  tooltip materialised from ui-strings (rendered `title` === QD.Strings.tooltips.eliminateVars — STRONGER than the old
  "no literal title= in markup"); the elim-hint caption text. **Mutation-verified:** removing js-busy-lock from the
  production button failed exactly that assertion, reverted byte-identically.
- **Slimmed `algebra-eliminate-section.test.ts`** (node) to the kind-(2)/(3) invariants: the Gröbner/elimSel/
  doEliminateVars function-body checks + the click wiring + the 120-char ui-strings rule. 15 → 14 tests net (−1:
  combined the two elim-hint assertions; dropped the querySelectorAll('.js-busy-lock') source check — that is
  algebra-tier6's setBusy domain).
- **Green bar:** build/typecheck/lint(+dep:check 582 modules)/test exit 0; `pnpm test` **2209 / 255** (+1 file, −1 test).
  Cut `refactor/p2-2-algebra-dom`; PR → refactor/main; merge on green.
- **Phase 2 remaining (re-scoped):** the D1a-brittle markup assertions in honest-labels (≈2), tooltip-tiers (≈2), and
  the interaction tests (shortcuts / scope-disclosure / tier6 / canvas). Given how few markup assertions honest-labels /
  tooltip-tiers carry, PR 2.3 will likely CONSOLIDATE them into a shared behavioural sidebar spec rather than a
  companion per file — flagged to the user for calibration.

## 2026-08-01 — Phase 2 · Stage p2-3-labels-tooltips (honest-labels + tooltip-tiers splits) — PR opened
- **Thorough per-file splits (user calibration: "thorough")** — continue converting each mixed algebra source-text
  test the eliminate-section way: markup assertions → behavioural jsdom companion, source-structural residue slimmed
  into the node file. Tests-only; no production code changed.
- **honest-labels split:** NEW `algebra-honest-labels-dom.test.ts` (2 jsdom tests) — the Gröbner button label reads
  "Gröbner basis (current column)" (and no control still says "all eqns"); Copy-LaTeX is labelled "Copy all LaTeX".
  Mutation-verified (Gröbner label → "all eqns" failed the label test). Slimmed `algebra-honest-labels.test.ts` 11→10:
  removed the label markup it; dropped the Copy-LaTeX button-label line (kept its ui-strings record check). Kept the
  source-structural rest (button-passes-no-selection wiring, export guard ordering, tooltip DATA, canvas 2-node cap,
  fix-φ(0) confirmReplace).
- **tooltip-tiers split:** NEW `algebra-tooltip-tiers-dom.test.ts` (2 jsdom tests) — no MATERIALISED title (after
  Strings.apply/applyOpHelp) exceeds 120 chars; the six relocated tooltips (assumeReal/gaugeElim/groebner/dimension/
  solveNumeric/algFixW0) no longer reach a control via data-str-title="tooltips.*". Mutation-verified (re-adding
  data-str-title="tooltips.groebner" failed the hooks-gone test). Slimmed `algebra-tooltip-tiers.test.ts` 10→8: removed
  the two markup its; kept the algebraOps DATA checks (short≤120, detail>short, 36 records, sections, header fallback)
  + the mount wiring-order.
- **Green bar:** build/typecheck/lint(+dep:check 584 modules)/test exit 0; `pnpm test` **2210 / 257** (+2 files, +1
  test net). Cut `refactor/p2-3-labels-tooltips`; PR → refactor/main; merge on green.
- **QD-ALG-3: 4 of 11 converted** (section-order, eliminate-section, honest-labels, tooltip-tiers). Remaining:
  workflow-sections, scope-disclosure, tier6 (sidebar/banner/wiring); the interaction tests (shortcuts-table,
  canvas-chrome); verdict-labeling (→ D1c). results-drawer has no markup (resultStateOf already behavioural).

## 2026-08-01 — Phase 2 · Stage p2-4-structure-banner (workflow-sections + scope-disclosure + tier6 splits) — PR opened
- **Thorough per-file splits, batch 3** — three more mixed algebra source-text tests split the eliminate-section way:
  markup assertions → behavioural jsdom companions, source-structural residue slimmed. Tests-only; no production change.
- **workflow-sections split:** NEW `algebra-workflow-sections-dom.test.ts` (2 jsdom) — the sidebar renders its named
  sections (≥8, incl. Reduce); every QD_UI.WORKFLOW_STEPS.section resolves to a rendered
  details.algebra-section[data-section]. Slimmed node 5→3 (kept the no-nth-of-type / openSection-by-data-section /
  verdict-routes-through-openSection source guards; dropped the source-parsed SUMMARIES/STEP_SECTIONS pair).
- **scope-disclosure split:** NEW `algebra-scope-disclosure-dom.test.ts` (1 jsdom) — #alg-scope renders OUTSIDE
  #alg-sections, ahead of it (so the inspector opacity-fade cannot dim the warning). Slimmed node 16→15 (the many
  handler/registry/CSS invariants — which ops read getSelection, SELECTION_SCOPED, scopeCaveat/scopeNote wiring,
  renderScopeBanner nodes-not-innerHTML, the style.css opacity override — all stay).
- **tier6 split:** NEW `algebra-tier6-dom.test.ts` (2 jsdom) — the two re-seeding controls (alg-seed-moment, alg-w0-fix)
  carry js-busy-lock; EVERY rendered .heavy-op control carries js-busy-lock. Slimmed node 11→9 (setBusy mechanism,
  dynamic .classList.add sites, WCAG colour-token contrast on style.css, Undo/_busy, export-stamp all stay).
- **Mutation-verified (all 3 companions in one pass):** renamed Reduce (workflow resolve-test failed), removed
  js-busy-lock from a heavy-op (tier6 every-heavy failed), renamed #alg-scope→#alg-scope-x (scope placement failed);
  the unaffected tier6 test stayed green. All three reverted byte-identically.
- **Green bar:** build/typecheck/lint(+dep:check 587 modules)/test exit 0; `pnpm test` **2210 / 260** (+3 files, 0 net
  tests: −5 node its ↔ +5 behavioural). Cut `refactor/p2-4-structure-banner`; PR → refactor/main; merge on green.
- **QD-ALG-3: 7 of 11 converted.** Remaining: the interaction tests (shortcuts-table, canvas-chrome) + verdict-labeling
  (→ D1c) — PR 2.5. results-drawer needs nothing (no markup).

## 2026-08-02 — Phase 2 CLOSEOUT (QD-ALG-3) — the D1a behavioural net is complete
- **Phase 2's goal — a behavioural net guarding the D1a sidebar-as-data decomposition of installAlgebra — is MET.**
  All SEVEN files that carried D1a-brittle sidebar-MARKUP assertions are now behavioural (query the mounted DOM via
  vitest/_algebra-mount.ts): section-order (#206), eliminate-section (#207), honest-labels + tooltip-tiers (#208),
  workflow-sections + scope-disclosure + tier6 (#209). Each split preserved its source-structural residue in a node
  companion; every behavioural test mutation-verified against unmodified algebra-ui.mjs.
- **The remaining source-text algebra tests are NOT D1a-brittle and stay node-source (assessed firsthand):**
  · **canvas-chrome** reads `algebra-canvas.mjs` — a module D1 does NOT decompose (D1 is the installAlgebra split), so
    its focus-mode / .is-dimmed / corner-slot checks are canvas-MODULE structure, not sidebar markup. Node-source.
  · **verdict-labeling** is by its own header a SOURCE-absence guard (every setVerdict call site declares a rigor pill);
    those call sites are exactly what **D1c (verdict unification)** restructures → revisit at D1c, not now.
  · **shortcuts-table** — the accelerator DISPATCH (keydown → button.click, honouring the disabled gate) needs a SEEDED
    store to test: at an empty mount the action buttons are disabled, the canvas-created #alg-focus is not rendered, and
    the document keydown handler bails while the surface is hidden (algebra-ui.mjs:4304). Its target buttons are ALREADY
    behaviourally guarded (they render in the sidebar); the dispatch mechanism stays a node source-guard — a seeded-mount
    harness (paired with a future canvas-focus behavioural test) is a D1d-era nicety, not a D1a gate.
  · **results-drawer** — resultStateOf is ALREADY behavioural (calls QD_UI.resultStateOf); its recorder-wiring block is
    source-structural (setVerdict call counts), a D1d concern.
- **Net:** the sidebar structure/buttons/labels/tooltips/captions/banner/markers a D1a "sidebar as data" rewrite will
  touch are ALL pinned behaviourally. Phase 2 done → **Phase 3 (D1) proceeds** (user go-ahead recorded 2026-08-02).
- Green unchanged (no code touched): `refactor/main` @ 8ab5693, 2210/260.

## 2026-08-02 — Phase 3 · Stage p3-d1a-sidebar-snapshot (D1a net: full-DOM sidebar fingerprint) — PR opened
- **Phase 3 (D1) kickoff — NET-FIRST for D1a (sidebar-as-data, QD-ALG-2).** Before rewriting mountSidebar's ~390-line
  innerHTML string into a data-described build, pin the ENTIRE rendered #controls-algebra as one normalized fingerprint
  so the rewrite is provably behavior-preserving at the DOM level — beyond the structural `-dom` companions, which only
  assert specific facts. No production change.
- **NEW `vitest/algebra-sidebar-html.test.ts`** (jsdom via the mount harness) — snapshots normalize(container.innerHTML)
  where inter-tag whitespace is collapsed (not semantic; a renderer indents differently) and text within elements is
  preserved. Deterministic (empty-store mount; verified stable run-to-run). The `.snap` captures every control in order
  with its attributes.
- **Mutation-verified:** perturbing a control the `-dom` net does NOT assert (the alg-steps-x button `title`) fails the
  fingerprint while the structural companions stay green — proving the snapshot catches drift the specific assertions miss.
  Reverted byte-identically.
- **Green bar:** build/typecheck/lint(+dep:check 588 modules)/test exit 0; `pnpm test` **2211 / 261** (+1). Cut
  `refactor/p3-d1a-sidebar-snapshot`; PR → refactor/main; merge on green.
- **Next (D1a PR-2):** transform mountSidebar → a SECTIONS data model + renderer (section structure as data, bodies
  verbatim first), one increment at a time, this fingerprint + the `-dom` net green after each.

## 2026-08-02 — Phase 3 · Stage p3-d1a-sidebar-data (D1a: mountSidebar → SECTIONS data + renderer) — PR opened
- **The D1a transformation (QD-ALG-2), behind the #210 fingerprint.** mountSidebar's inline `#alg-sections` string
  (8 collapsible sections + the "Beyond the main route" divider, ~195 lines of `'…' +` concatenation) is now built
  from a `SIDEBAR_SECTIONS` data array (each `{ summary, open?, body }`, plus one `{ divider }` entry) mapped through a
  single `renderSection(s)` helper. The `<details>/<summary>/<div class="algebra-section-body">` wrapper — previously
  hand-repeated 8× — is emitted once, in renderSection. Section **bodies are verbatim** (moved character-for-character);
  no control markup edited. The pinned header / `#alg-suggest` / `#alg-inspector` / `#alg-scope` stay a literal template
  (unchanged) — only `#alg-sections` became data-driven, as scoped.
- **Deterministic pre-flight oracle.** A throwaway node script eval'd BOTH the original inline concatenation and the new
  `SIDEBAR_SECTIONS.map(renderSection)` build and asserted `normalize()`-equal BEFORE editing the file — byte-identical
  at 12394 chars / 9 entries. So the rewrite was proven equivalent at the string level independent of jsdom, then the
  edit was applied by the same script (guaranteeing the verified text is what landed).
- **Behavior-preserving, proven three ways:** (1) the #210 full-DOM fingerprint `algebra-sidebar-html.test.ts` passes
  unchanged (byte-identical rendered `#controls-algebra`); (2) all 20 jsdom-env algebra test files green (166 tests),
  incl. every `-dom` companion + the in-place `algebra-section-order.test.ts`; (3) **mutation-verified** — rendering
  `SIDEBAR_SECTIONS.slice(1)` (drop a section) fails the fingerprint AND section-order; reverted byte-identically (via
  Edit, not git).
- **Green bar:** build/typecheck/lint(+dep:check 588 modules)/test exit 0; `pnpm test` **2211 / 261** — identical count
  to the pre-change baseline (no test added or removed; pure structural refactor). Diff: one file, +132 / −147 (net −15;
  the repeated wrapper is gone). Cut `refactor/p3-d1a-sidebar-data`; PR → refactor/main; merge on green.
- **Next (D1b):** runOp single-flight (QD-ALG-4), then the **re-eval gate** before D1c/D1d.

## 2026-08-02 — Phase 3 · Stage p3-d1b-oprunner-harness (D1b Stage 1: behavioural harness + op-runner net) — PR opened
- **D1b is harness-first (2 user decisions 2026-08-02): (i) "Also guard doSolveRadical" → behavioural-change TOKEN
  GRANTED; (ii) "Build harness first."** Investigation reframed D1b: the ~15 async ops are un-nettable at unit level
  (all gated behind `activeEnv`, set only by a real QD solve via `PrimarySolution`); the guards are non-uniform (silent
  `if(_abort)return` / noisy `busyGuard()` / none); `doSolveRadical` is canvas-inspector-gated. So this stage builds the
  behavioural harness + net FIRST, with NO production change, exactly as net-first requires.
- **Harness (`vitest/_algebra-mount.ts`):** `mountAlgebra(overrides, { withCanvas })` — opt-in real AlgebraCanvas (adds
  `#plot-area` so `mountSurface` builds it). Default stays the sidebar-only bare `#algebra-graph` (mountSurface no-ops,
  canvas null) so the 20 existing jsdom tests + the #210 fingerprint are byte-identical — verified. New helpers:
  `seedMoments` (clicks `#alg-seed-moment` — the ONE seed needing no geometric solve: `store.seedFromPolys`, no
  activeEnv), `nodeCards`, `selectNode` (a real canvas click → onSelect → renderInspector). Enabler: in Node,
  `QD.SymWorker` falls back to a resolved-Promise job, so `_abort` is set SYNCHRONOUSLY on op-start and cleared on the
  next microtask — the single-flight window is observable between a synchronous op-start and the following await.
- **Net (`vitest/algebra-op-runner.test.ts`, 8):** the busy lifecycle (entered synchronously — cancel shown, graph +
  js-busy-lock buttons locked — left on completion); single-flight (every heavy-op button disabled while busy = the
  primary guard; `busyGuard()` backs the NON-disabled paths — an inspector Duplicate BAILS while busy vs. works idle);
  and **doSolveRadical's CURRENT run-while-busy pinned** (idle: opens the solve panel; BUSY: STILL opens it — the
  QD-ALG-4 gap the granted Stage-3 guard will close, so that change lands as a REVIEWED test diff).
- **NET-FIRST + mutation-verified:** green against unmodified `algebra-ui.mjs` (zero production change), then 3 mutations
  each caught exactly the intended test and were reverted byte-identically — (i) add busyGuard to doSolveRadical → the
  BUSY pin fails, idle still passes; (ii) busyGuard always-false → the backstop test fails; (iii) setBusy stops disabling
  → the disabled-while-busy test fails.
- **Note:** `QD.QoL` is deliberately NOT booted in the harness — its presence changes the sidebar fingerprint (measured:
  it fails the #210 snapshot). So single-flight is asserted by the STRONGER signal — the guarded action does not EXECUTE
  while busy — not merely that a toast appeared.
- **Green bar:** build/typecheck/lint(+dep:check 588)/test exit 0; `pnpm test` **2219 / 262** (+8 op-runner; +0 prod).
  Cut `refactor/p3-d1b-oprunner-harness`; PR → refactor/main; merge on green.
- **Next (Stage 2):** extract `runOp()` for the ~15 async ops behind this net (behaviour-preserving; each op's guard style
  preserved). Then Stage 3 — doSolveRadical guard [token✓] + guard-unification [ASK for a broader token].

## 2026-08-02 — Phase 3 · Stage p3-d1b-runop (D1b Stage 2: _opBegin/_opEnd lifecycle extraction) — PR opened
- **The QD-ALG-4 DRY, behind the Stage-1 net, BEHAVIOR-PRESERVING.** The ~15 async ops copied one busy lifecycle:
  `const ctrl = _newAbort(); _abort = ctrl; setBusy(true, label)` … `_abort = null; setBusy(false); setStatus('')`.
  A single `runOp(run, onOk)` WRAPPER does not fit them — doAutoSolve is a multi-step `(async()=>{})()` with bespoke
  per-exit teardowns (Cancelled / showError / refreshPickers+showResult), and the prove-family uses `.then().catch()`
  with `((e&&e.message)||e)` not `||String(e)`. So the extraction is the shared **lifecycle pair**, not a runner:
  · `function _opBegin(label) { const ctrl = _newAbort(); _abort = ctrl; setBusy(true, label); return ctrl; }`
  · `function _opEnd() { _abort = null; setBusy(false); setStatus(''); }`
- **Applied deterministically (scripted string transform, verified counts):** folded **19** adjacent setup+`setBusy(true,…)`
  pairs → `const ctrl = _opBegin(label);` (labels — incl. string-concat, ternary, inner-paren prose, and 2 trailing
  comments — preserved verbatim) and replaced **35** identical teardowns → `_opEnd();`. Left inline by design: doAutoSolve's
  non-adjacent setup + its 6 bespoke teardowns, and doDecompose's `_abort = new AbortController()` (a direct-controller
  variant `_newAbort()` would subtly change in AbortController-less envs). Each op's guard style (silent `if(_abort)return`
  vs. noisy `busyGuard()`), control flow, and error EXPRESSION are byte-preserved — NO guard-unification (that is Stage 3,
  needs a broader token). `_opBegin`/`_opEnd` do EXACTLY the statements they replace, so the change is behavior-preserving
  by construction.
- **Verified:** op-runner net (Stage 1) drives saturate through the new pair — green; all 21 jsdom algebra files (174) green;
  **mutation-verified** — dropping `setBusy(false)` from `_opEnd` fails the net's "leaves busy on completion" test; reverted.
- **Green bar:** build/typecheck/lint(+dep:check 588)/test exit 0; `pnpm test` **2219 / 262** — identical to baseline (no
  test delta; pure refactor). Diff: one file, +60 / −73 (net −13). Cut `refactor/p3-d1b-runop`; PR → refactor/main.
- **Next (Stage 3):** doSolveRadical `busyGuard()` (token GRANTED — the op-runner net's BUSY pin flips to a reviewed diff)
  + guard-unification (silent→noisy) — **ASK the user for the broader token first.** Then the re-eval gate.

## 2026-08-02 — Phase 3 · Stage p3-d1b-solveradical-guard (D1b Stage 3a: doSolveRadical single-flight) — PR opened
- **THE ONE AUTHORIZED BEHAVIORAL CHANGE of D1b (token granted 2026-08-02, "Also guard doSolveRadical").** doSolveRadical
  gained `if (busyGuard()) return;` as its first statement.
- **Exact behavioral delta:** the node inspector's **"Solve for a variable"** action is a SYNCHRONOUS, main-thread radical
  solve, and its button is NOT `js-busy-lock`, so `setBusy` never disabled it.
  · BEFORE: clicking it while a worker op was in flight RAN the solve anyway (built the `.algebra-solve-panel`) — the
    QD-ALG-4 gap: every other inspector action (Duplicate / Delete / Attempt-to-factor) already `busyGuard()`-ed; this one
    did not.
  · AFTER: it BAILS — toasts "Busy — wait for the current computation to finish (or Cancel)." and builds NO panel — while a
    worker op is in flight. Unchanged when idle (opens the panel as before).
- **NOT a correctness fix:** JS is single-threaded and the solve is read-only (nothing is added to the DAG), so it never
  corrupted state; this is a UX-CONSISTENCY change that makes the last un-guarded user-initiated op match the rest.
- **The Stage-1 net made it a REVIEWED diff, not a silent change:** `algebra-op-runner.test.ts`'s doSolveRadical block flips
  from pinning "BUSY: it STILL runs (opens the panel)" to asserting "BUSY: it BAILS (no solve panel)"; the idle test stays.
  Mutation-verified: disabling the guard (`if (false && busyGuard())`) fails the flipped BUSY test (the solve runs, verified
  ✓), idle passes — so the assertion catches the guard's presence. Reverted byte-identically.
- **Green bar:** build/typecheck/lint(+dep:check 588)/test exit 0; `pnpm test` **2219 / 262** (no test count change — the
  one test's assertion flipped). Diff: algebra-ui.mjs +4; the net's one test updated. Cut
  `refactor/p3-d1b-solveradical-guard`; PR → refactor/main.
- **Next: PAUSE at the RE-EVALUATION GATE** (report D1b churn/remaining-mass/risk) + **ASK the user for a broader token**
  to unify the silent `if(_abort)return` guards to noisy `busyGuard()` (Stage 3b) — or leave them (nearly unobservable).
  Then, on go, D1c (verdict-unify, token✓) / D1d (split), or stop.

## 2026-08-02 — Phase 3 · Stage p3-d1c-verdict-unify (D1c: unify the verdict path, QD-ALG-5) — PR opened
- **AUTHORIZED BEHAVIORAL CHANGE (token granted via decision #3; re-eval gate: user chose "D1c + D1d both").** AUDIT
  finding: scope is narrower than the plan implied. A prior carve-out already extracted **`classifyVerdict`** (pure,
  `algebra-labeling.mjs`) and routed **doClassify** through it; **`_verdictBadge`** is a compact CHIP (different
  representation, already pure + on QD_UI) and stays. The genuine remaining drift was **doAutoSolve building the
  existence/uniqueness line INLINE** — the last un-unified copy. D1c routes doAutoSolve → `classifyVerdict(cl)` (its
  `+= sliceCaveat(cl)` and the ★ Auto-reduce caveats are unchanged), so both handlers now share ONE builder and cannot
  re-diverge.
- **EXACT STRING DELTA (doAutoSolve's verdict card; honest `=`/`≤`/`≈` labeling preserved — every real-count case still
  says "upper bound" + "run Certify univalence"). OLD (inline) → NEW (classifyVerdict, = what doClassify already showed):**
  · inconsistent: "…the **reduced** system is inconsistent." → "…the system is inconsistent **(1 ∈ I)**."
  · positive-dim: "**A positive-dimensional family of solutions** (…) — **add a constraint or fix a value to pin it.**" →
    "**Infinitely many: a positive-dimensional family** (…)."
  · real count unavailable: "**⟨mult⟩ solution(s) with multiplicity.**" → "**Zero-dimensional:** ⟨mult⟩ **complex**
    solution(s) with multiplicity **(real count unavailable: ⟨reason⟩)**."
  · 0 real: "(of ⟨cx⟩ distinct complex)." → "(of ⟨cx⟩ distinct complex**[; ⟨mult⟩ with multiplicity]**)." (mult>cx clause)
  · 1 real: "**1 real algebraic solution** … an upper bound on **the number of quadrature domains**; run Certify univalence
    for the genuine-QD count." → "**A unique real algebraic solution** … an upper bound on **the quadrature-domain count**;
    run Certify univalence for the genuine-QD count **(gauge copies merged, non-univalent ones filtered)**."
  · ≥2 real: gains the "**(gauge copies merged, non-univalent ones filtered)**" clause; drops the redundant "an upper
    bound…" phrase (the ≥2 canonical line conveys the bound via "run Certify univalence …").
- **Net:** `classifyVerdict`'s exact prose is already pinned by `algebra-classify-verdict.test.ts` (its header explicitly
  anticipated this unification). Added a SOURCE guard there (doAutoSolve is activeEnv-gated, un-drivable in the harness):
  doClassify AND doAutoSolve both route through `classifyVerdict`, and the drifted inline strings are GONE from the source
  — so a third path can't silently re-drift. **Mutation-verified:** re-introducing the inline verdict fails both guards.
- **Green bar:** build/typecheck/lint(+dep:check 588)/test exit 0; `pnpm test` **2222 / 262** (+3 source guards; the
  doAutoSolve prose change is not behaviorally driven — activeEnv-gated). Diff: algebra-ui.mjs −13 net; +3 guard tests.
  Cut `refactor/p3-d1c-verdict-unify`; PR → refactor/main.
- **Next: D1d** — split installAlgebra (~4085-line closure) into ctx-injected sub-units. The big lift, several PRs.

## 2026-08-02 — Phase 3 · Stage p3-d1d-op-runner (D1d seam 1: extract the op-runner) — PR opened
- **BEHAVIOR-PRESERVING (D1d seams need no token — STATE working-rules).** First seam of the installAlgebra split: lift the
  single-flight worker-op runner — the `_abort`/`_busy` state + `setBusy`/`_opBegin`/`_opEnd`/`busyGuard`/`cancelOp`/
  `_newAbort` — out of the ~4085-line closure into **`app/algebra/algebra-op-runner.mjs`**, a ctx-injected factory
  `createOpRunner({ $, setStatus, toast, cancelWorker })`. installAlgebra builds `const ops = createOpRunner(…)` up front
  (right after setStatus, BEFORE the #alg-cancel wire — the old defs sat ~1200 lines *below* the wire, so a same-spot
  `const` would TDZ at the wire) and the ~25 worker ops call `ops.begin/end/guard/isBusy/cancel`.
- **Every method body is the old inline code, verbatim.** Call-site transforms — all deterministic global-replace except the
  two bespoke begins: `_opBegin(`×19 → `ops.begin(`; `_opEnd()`×35 → `ops.end()`; `busyGuard()`×31 → `ops.guard()`; the 16
  silent `if (_abort) return` → `if (ops.isBusy()) return` (`isBusy() === !!_abort`); the 3 `_busy` reads (refreshStatusBar +
  the two undo/redo disables) → `ops.busyFlag()`; the #alg-cancel wire → `ops.cancel`.
- **The two teardown SHAPES are kept distinct** — the one subtlety that is *not* a pure rename. `_opEnd()` clears the status
  line (`setStatus('')`); but doGroebner + doAutoSolve wound down via bare `_abort=null; setBusy(false)` (NO setStatus) so
  their own per-branch result/verdict line stands. Modeled as `end()` vs **`end({ keepStatus: true })`** (6 sites: doGroebner
  + doAutoSolve×5); collapsing them into `end()` would have blanked the status bar between op-end and result.
- **The two bespoke begins folded into `ops.begin`:** doDecompose (`setBusy(true,label)` + `_abort=new AbortController()`)
  and doAutoSolve (`_newAbort();_abort=ctrl` + a separate `setBusy(true,label)`). Same synchronous end-state (no await between
  the folded statements); doDecompose additionally gains `_newAbort`'s `typeof AbortController` guard — a no-op in every real
  (browser/jsdom/Node) env.
- **Nets followed the code to the module.** (1) op-runner behavioural net gained a **Gröbner keepStatus-lifecycle** case
  (net-first: green on pre-refactor code) so BOTH teardown shapes are pinned end-to-end; begin/end/guard were already covered
  via Saturate + inspector Duplicate + doSolveRadical. (2) tier6's `setBusy`-mechanism source pin now reads the *module*
  (`querySelectorAll('.js-busy-lock')` moved there); its undo-guard pins updated `_busy`→`ops.busyFlag()`,
  `busyGuard()`→`ops.guard()`. tier6-dom (rendered js-busy-lock markers) unchanged.
- **Mutation-verified:** breaking the module's `guard()` (`if(_abort)`→`if(false && …)`) fails exactly the 2 "bails while
  busy" net tests (Duplicate + doSolveRadical); reverted byte-identically via Edit.
- **Green bar:** build/typecheck/lint(+dep:check **590 modules**, no new violations — the new import edge is same-package,
  downward)/test exit 0; `pnpm test` **2223 / 262** (+1 Gröbner lifecycle test). Diff: algebra-ui.mjs −26 net (def block
  removed) + the new module. Cut `refactor/p3-d1d-op-runner`; PR → refactor/main.
- **Next: D1d seam 2** — verdict + results rendering, one behavior-preserving PR behind the nets. (Then seam 3 sidebar-wire,
  inspector+canvas, ops; installAlgebra stays a composition root.)

## 2026-08-03 — Phase 3 · Stage p3-d1d-results-drawer (D1d seam 2: extract the results drawer) — PR opened
- **BEHAVIOR-PRESERVING (D1d seams need no token).** Second seam: lift the results-drawer subsystem — the `_results` verdict
  history keyed by `(track, branchSig)`; `showResult`/`reshowResult`/`resultState`/`renderDrawer`/`setResultColCollapsed`; and
  the `_drawerOpen`/`_colCollapsed` state (~120 lines, split across the top AND bottom of the ~4046-line closure) — into
  **`app/algebra/algebra-results-drawer.mjs`**, a ctx-injected factory
  `createResultsDrawer({ getCanvas, store, branchSig, trackLabelOf, resultStateOf, rigorMeta })`.
- **Facade to keep the call surface still.** installAlgebra builds `const results = createResultsDrawer(…)` up front (after
  store/canvas; `_branchSig`/`trackLabelOf`/`resultStateOf` are hoisted / module-scope) and aliases `const showResult =
  results.showResult` + `const renderDrawer = results.render`. So the ~13 `showResult(…)` call sites AND `rerender`'s
  `renderDrawer()` read BYTE-UNCHANGED; only `workflowFacts` changed (→ `results.hasResults()` / `results.hasCurrent()`).
  `reshowResult`/`resultState`/`setResultColCollapsed` are fully internal (only reached from `renderDrawer`) → not exposed.
- **Stayed in the root:** `_branchSig` + `_lastColIds` (the verdict-badge cache + track bar use them too) → handed to the
  drawer via ctx; the ~13 verdict-producing analyses (they call the `showResult` facade). `canvas.setVerdict` now appears 0×
  in algebra-ui.mjs and 3× in the module (showResult + reshowResult) — the honest-labeling routing invariant, made stronger.
- **Net followed the code.** `algebra-results-drawer.test.ts`: the pure `resultStateOf` tests unchanged (still on `UI`); the
  structural invariants (only showResult/reshowResult touch the canvas, the `(track,sig)` key, the stale-demotion, the
  surfaced cap) **repointed SRC → the module**; **NEW** assertion pins `canvas.setVerdict` count = 0 in algebra-ui.mjs; the
  `rerender`-calls-renderDrawer and results-not-autosaved pins **stay on SRC** (both hold through the facade). Mutation-
  verified: flipping the demotion (`stale: true`→`false`) in the module fails the "demotes it" test; reverted byte-identically.
- **Green bar:** build/typecheck/lint(+dep:check **591 modules**)/test exit 0; `pnpm test` **2223 / 262** (no test delta —
  repoint + 1 new assertion). Diff: algebra-ui.mjs −95 net (subsystem out) + the new module. Cut
  `refactor/p3-d1d-results-drawer`; PR → refactor/main.
- **Next: D1d seam 3** — sidebar wiring / pickers, or the inspector+canvas surface — one behavior-preserving PR behind the nets.

## 2026-08-03 — Phase 3 · Stage p3-d1d-picker (D1d seam 3: extract the variable-picker widget) — PR opened
- **BEHAVIOR-PRESERVING (D1d seams need no token).** Third seam, and the cleanest cut yet: the dropdown-checklist picker
  (`buildPicker`) + its single-open-menu coordinator (`_openMenu`/`_closeOpenMenu`) — a self-contained, **reusable** UI widget
  (two consumers: the eliminate + assume-real pickers) — lifted out of the ~65-line region into
  **`app/algebra/algebra-picker.mjs`**, a **ctx-FREE** factory `createPickerManager() → { build, closeOpen }`. The widget
  touches **no** store / canvas / `$` / toast — only DOM globals + the caller's `opts` — so it needs zero injected context.
- **Wiring (3 call sites).** installAlgebra builds `const pickers = createPickerManager()`; the two sidebar wirings become
  `pickers.build(host, opts)`; the outside-click handler calls `pickers.closeOpen()`. `friendlyVar` (the app-specific label
  fn, uses `latexPlain`) stays in the root and is passed as `opts.friendly`. buildPicker's body + the coordinator are verbatim.
- **Net was BUILT (net-first), not just repointed.** The widget had NO runtime coverage — the #210 snapshot pins only the
  static host, and algebra-shortcuts-table pinned only the coordinator's SOURCE shape. NEW **`algebra-picker.test.ts`** (6
  jsdom tests, sidebar-only mount + seedMoments) drives it: open → one checkbox per current variable, toggle → select + relabel
  the button, one-menu-open-at-a-time, Esc + outside-click close. **Green on pre-refactor code first** (committed separately),
  then the carve. algebra-shortcuts-table's escapability + aria-honesty pins (`ev.key !== 'Escape'`, `btn.focus()`,
  `function _closeOpenMenu`, the single direct `_openMenu.classList.add('hidden')`) **repointed SRC → the module**; its
  context-menu pins (role menu/menuitem, `_ctxReturn`, ArrowDown — a DIFFERENT component) **stay on SRC**.
- **Mutation-verified:** neutralizing the coordinator's hide (`add('hidden')`→`add('hidden-x')`) fails BOTH the behavioural net
  (single-open + Esc + outside-click) AND the structural pin (count→0); reverted byte-identically.
- **Green bar:** build/typecheck/lint(+dep:check **593 modules**)/test exit 0; `pnpm test` **2229 / 262** (+6 picker net).
  Diff: algebra-ui.mjs −59 net + the new module. Cut `refactor/p3-d1d-picker`; PR → refactor/main.
- **Next: D1d seam 4** — the next unit (scope first): autosave/session-persistence (coherent, ~110 lines, store+localStorage
  coupling) or the inspector+canvas surface. installAlgebra continues toward a composition root.

## 2026-08-03 — Phase 3 · Stage p3-d1d-autosave (D1d seam 4: extract the session-autosave core) — PR opened
- **BEHAVIOR-PRESERVING (D1d seams need no token).** Fourth seam. The "session persistence" region held THREE concerns; the
  clean cut is the **autosave CORE** — the debounced localStorage mirror (`AUTOSAVE_KEY`/`MAX`/`DEBOUNCE` +
  `_saveTimer`/`_saveBlocked` + `_writeAutosave` / `scheduleAutosave` / `_readAutosave`, ~33 lines) — into
  **`app/algebra/algebra-autosave.mjs`**, a ctx-injected `createAutosaver({ store, toast }) → { schedule, read, clear, flush,
  isBlocked }`. **Left in the root** (they call the core through its API, not the other way): `offerRestore` (the restore-offer
  banner — heavily UI-coupled: importDAG/rerender/refreshPickers/seedFromCurrent/$) and `confirmReplace` (a *different* concern
  — the replace-a-derivation prompt — that merely shared the region). `_agoStr` stays with offerRestore.
- **Wiring — 4 touch points.** `const autosave = createAutosaver({ store, toast })`; rerender's mutation hook →
  `autosave.schedule()`; offerRestore → `autosave.read()` (the saved session) + `autosave.clear()` (Discard); the beforeunload
  handler → `autosave.flush()` + `if (store.size && autosave.isBlocked())` (warn only when the save could not be taken). The
  write/schedule/read bodies are verbatim; `_writeAutosave` keeps its name so the drawer cross-check can follow it.
- **Net was BUILT (net-first).** The core had no dedicated coverage (only the drawer net cross-checks that `_writeAutosave`
  doesn't serialize the results). NEW **`algebra-autosave.test.ts`** (3 jsdom tests, sidebar-only mount + seedMoments +
  jsdom localStorage): a mutation schedules a **DEBOUNCED** write (asserts NOT written synchronously), a `beforeunload` flush
  commits it, and the payload is a faithful restorable session (exported DAG + node/column/timestamp summary). **Green on
  pre-refactor first.** The results-drawer net's "results are not autosaved" pin (a `_writeAutosave` slice) **repointed SRC →
  the autosave module** (else it would go vacuous — `indexOf` of a moved function returns −1).
- **Mutation-verified:** misdirecting the write (`setItem(KEY…)`→`setItem(KEY+'X'…)`) fails the flush-commits + faithful-session
  tests; reverted byte-identically.
- **Green bar:** build/typecheck/lint(+dep:check **595 modules**)/test exit 0; `pnpm test` **2232 / 262** (+3 autosave net).
  Diff: algebra-ui.mjs −27 net + the new module. Cut `refactor/p3-d1d-autosave`; PR → refactor/main.
- **Next: D1d seam 5** (or a pause/re-eval) — the remaining large tenant is the inspector+canvas surface (bigger, more coupled;
  op-runner net partially covers it). Four clean seams in, installAlgebra ≈3850 lines and steadily a composition root.

## 2026-08-03 — D1d re-eval gate (user) → seam 5 SCOPED, then move to Phase 4
- **Scoped seam 5 (inspector) at the user's request; recommended NOT extracting it, and the user chose Phase 4.** Finding: the
  "inspector" is not one function but a ~350-line woven subsystem — `renderInspector` (86) + `nodeActions` (100, **shared** by
  the sidebar panel AND `openNodeMenu`, the context menu) + `doFactor`/`doSolveRadical` (the heavy async handlers) +
  `updateCost`/`renderScopeBanner`. A clean `createInspector(ctx)` would need ~15 ctx deps (canvas selection, store node-ops,
  ops, showResult, the action handlers, render helpers) — i.e. it would **re-expose installAlgebra's internals**, not decouple.
  Architectural read: after the four clean seams, what remains (inspector + node-action layer + canvas-selection + the
  mutation→rerender loop) **IS the composition core** — exactly what a composition root should hold. So D1d has largely done
  its job. Recommended (1) move to Phase 4 / (2) a smaller sub-cut / (3) stop. **User: Phase 4.**

## 2026-08-03 — Phase 4 · Stage p4-ui-seam (D2 stage 1: the ui.mjs testability seam) — PR opened
- **BEHAVIOR-PRESERVING; the deferred B4 prerequisite.** `ui.mjs` (1891 lines, **0 exports**) BOOTED ON IMPORT — `import
  './ui.mjs'` ran the whole QD-tab DOM wiring, so without the full QD HTML it threw and could not be imported/characterized.
  Statement-mapped the whole file: the executable boot is interleaved with 41 fn declarations, and FOUR boot-region functions
  (`markAsCustom`, `applyModeVisuals`, `mountQolHelp`, `setMode`) are called from pre-boot code — so a partial "wrap 414–1891"
  would break scope. Because ui.mjs has 0 exports, the clean cut is to **wrap the ENTIRE body (82–1891) in one
  `function bootQdUi()`** — one scope, everything mutually hoisted, zero boundary problem — and gate it at EOF on
  `typeof document !== 'undefined' && document.querySelector('#canvas')`.
- **Minimal, provably-behavior-preserving diff:** ESLint `indent:'off'`, so the body is wrapped **without re-indenting** →
  **12 insertions, 0 deletions** (the wrapper + guard only; the 1809-line body is BYTE-UNCHANGED). `node --check` OK. Real app
  unchanged: index.html's static `<canvas id="canvas">` precedes the deferred `main.mjs` module script, so the guard is true at
  import → bootQdUi() runs immediately, as before. `#canvas` is static (verified); the 3 awaits are inside async fns → boot stays sync.
- **Net (inverted net-first — the seam ENABLES a test):** NEW `ui-boot-seam.test.ts` (node env, no DOM) — importing ui.mjs now
  neither throws nor registers its QD_UI boot hooks (snapshotScenario / loadScenarioIntoQdTab), + a source pin on the wrap +
  #canvas guard. Mutation-verified: dropping the guard fails both (import throws + pin gone). The real-app boot on a present
  #canvas is covered by the **browser CI** job (loads the actual HTML).
- **Green bar:** build (vite bundles the wrapped module)/typecheck/lint/test exit 0; `pnpm test` **2234 / 262** (+2 seam net).
  Cut `refactor/p4-ui-seam`; PR → refactor/main.
- **Next: Phase 4 stage 2+** — lift chunks of bootQdUi() into `installX(uiCtx)` factory modules (DOM-wiring / cross-tab / help)
  until ui.mjs is a thin composition root, behind the seam's importability net + browser CI.

## 2026-08-03 — Phase 4 PAUSED at the seam (user decision) + a correction
- **CORRECTION to the p4-ui-seam entry above.** While scoping stage 2, verified what the `browser` CI job actually runs:
  `test:browser` = `packages/gpu` + `apps/complex-dynamics` **WebGL2/GLSL shader** harnesses. It does **NOT** load the QD app,
  navigate tabs, or run `bootQdUi()`. There is **no** Playwright/e2e test for `apps/quadrature-domains` at all. So the seam
  entry's "the real-app boot … is covered by the browser CI job" (and #220's PR note) were **wrong** — that job is GPU shaders.
  `ui.mjs`'s only coverage is `build` (vite *bundles* it — not a runtime boot) + the new import-without-boot net.
- **Implication → Phase 4 lifts PAUSED.** The stage-1 seam was safe because it was a **verbatim wrap** (body byte-unchanged). A
  factory *lift* is not: it changes dependency resolution at runtime (closure var → `uiCtx.X`), so it can introduce a boot
  regression that passes ALL of CI and only fails in a real browser. A jsdom boot net is blocked (jsdom has no WebGL2 for
  `new DomainPlot($('#canvas'))`); a real net needs a Playwright QD harness that doesn't exist. Under **binding net-first**, the
  lifts cannot proceed without that net. Presented the finding + options; **user chose: pause Phase 4 at the seam.**
- **Net state of the engagement (all merged, green @2234/262):** Phases 1–2 ✓, Phase 3 (D1a–c) ✓, D1d (4 seams) ✓, F1 ✓,
  Phase 4 D2 **seam** ✓. Deferred/paused: the D2 factory lifts (need a Playwright QD boot harness), the inspector (composition
  core), E1 (state/lifecycle). Remaining plan work: **Phase 5 (E2)** — mechanical folderization of the 58 flat `app/*.mjs`.

## 2026-08-03 — Phase 5 · Stage p5-e2-folderize (E2: folderize the 58 flat app/*.mjs) — PR opened
- **MECHANICAL, behavior-preserving; net = build + full suite (pure path edits, zero behavior delta).** Moved the 57 remaining
  flat `apps/quadrature-domains/app/*.mjs` (main.mjs stays as the entry) into six domain folders by existing prefix + a
  primitives/analysis split for the 16 prefix-less singletons: **ui/** (17: the `ui-*` set + ui.mjs), **solvers/** (19: `solver*`
  + primary-solution/-solver-worker, joining the pre-existing solvers/{define-family,seeds}), **qd/** (3: qd-constraints/
  equations/varscheme), **sym/** (2: sym-core/-radical — symbolic algebra), **core/** (7 primitives: complex, poly-helpers,
  taylor, parse-h, vendor-globals, qol, and qd — the namespace façade), **analysis/** (9 φ-analysis features: univalence,
  cusps, critical-set, faber-analysis, observables, symmetry, family-sweep, riemann-latex, thesis-examples). `git mv` → **57
  renames preserved** (14 R + 43 RM).
- **Codemod (scratchpad/e2-codemod.mjs), not by-hand.** A uniform relative-STRING rewrite (NOT import-statement parsing) over
  all 308 app/** + vitest/** source files: for every `'./…'`/`'../…'` literal that resolves to a real file, recompute it from the
  importer's NEW dir to the target's NEW dir — so it catches `import` / `export … from` / dynamic `import()` / `new URL(…,
  import.meta.url)` worker strings / `readFileSync` SRC-net paths alike. **427 specifiers rewritten in 179 files.** Two edges the
  approach got right that a naive path-swap misses: a MOVED file's runtime worker string `const ENTRY='./workers/solver-worker-
  entry.mjs'` (primary-solver-worker → solvers/) lengthened to `../workers/…`; and the 10 `solvers/seeds/*` `../../solver.mjs` →
  `../solver.mjs` (solver.mjs moved INTO solvers/, i.e. CLOSER to the seeds).
- **Four bare-name loaders the codemod (by design) skipped, hand-fixed:** `app/test/bootstrap.js` (the vm-harness manifest,
  keyed by classic names) — added a disk-probing `relocate(bare)` wrapping its single `importApp` choke-point (keeps the
  `loadInCtx` skip-keys on the classic `.js` names, zero duplicated mapping); `app/test/parse-check.test.js` `path.join(APP_DIR,
  'ui.mjs')` → `'ui','ui.mjs'`; `vitest/parse-h-poly-modes.test.ts` `join(…,'app','ui-modes.mjs')` → +`'ui'`. (index.html →
  ./main.mjs only; vite.config entry = app/index.html; no cross-app refs — all unaffected.)
- **The 3 hand-maintained load-order lists stay in-order:** main.mjs (paths repointed line-by-line), workers/solver-graph.mjs,
  and bootstrap.js — folderization changed PATHS only, never import order, so the side-effect boot order is preserved by construction.
- **Green bar:** build (vite resolves the whole graph incl. worker URLs) / typecheck / lint (+dep:check — intra-app move, package/
  app boundaries untouched) / test exit 0; `pnpm test` **2234 / 265** (tests UNCHANGED — E2 adds/removes none; the `/262`
  file-count in recent records was stale, already 265 at the seam stage after the picker/autosave/seam nets). Cut
  `refactor/p5-e2-folderize`; PR → refactor/main.
- **Next: Phase 5 complete → the plan's remaining work is shipped** (Phases 1–3, F1, D1d×4, the D2 seam, E2). Deferred: the D2
  factory lifts (need a Playwright QD boot harness), the inspector (composition core), E1, further correspondence families.

## 2026-08-03 — Phase 5 · Stage p5-e2-docs (E2 documentation follow-up) — PR opened
- **DOCS-ONLY follow-up to E2 (#221); no code-logic change.** After the folderize merged, the app's primary navigational doc
  still described the OLD flat layout. Brought the docs in line with the on-disk structure + marked the issue E2 resolved:
  · **apps/quadrature-domains/README.md `## File layout`** — rewrote the flat-file tree into the six E2 folders (core/ solvers/
    qd/ sym/ analysis/ ui/) with per-folder purpose + per-file annotations (kept the existing ones; added the previously-
    unlisted poly-helpers, qol, qd, vendor-globals, univalence, cusps, riemann-latex, solver-cmax/-continuation/-taylor-common,
    primary-*, ui-domain-mode/-domain-plot/-geometry/-presets/-state/-registry, qd-varscheme, sym-radical). Plus **15 inline
    `app/<flat>.mjs` prose refs** → their new folder paths.
  · **app/main.mjs header** — the stale "GENERATED from asset-manifest.js by scratchpad/gen-main.mjs" claim (neither exists) →
    an accurate note: HAND-MAINTAINED, import ORDER is significant (mirrored by workers/solver-graph.mjs + test/bootstrap.js),
    modules live in the six E2 folders.
  · **ISSUES QD-UI-6 → fixed** (the "flat app/ ignores half-started folder taxonomy" finding — resolved by E2 #221).
- **Deliberately NOT touched:** the dated review/audit records (docs/review/*, docs/algebra-review/audit/*) and the completed
  design-plan briefs (MULTIVARIATE_FACTORING.md, …) keep their original path references — point-in-time records, not living
  navigation. Subfolder READMEs (direct/ schwarz/ …) had no stale moved-file paths.
- **Green bar:** build/typecheck/lint/test exit 0; `pnpm test` **2234 / 265** (docs + one comment; zero behavior change).
  Cut `refactor/p5-e2-docs`; PR → refactor/main.

## 2026-08-03 — Boot harness · Stage 1 (QD module-graph boot net, Vitest browser mode) — PR opened
- **NEW coverage — the enabler that unblocks the paused D2 lifts.** The QD app booted on import with ZERO executable coverage
  (QD-UI-5 / QD-TEST-2): the `browser` CI job is GPU shaders (packages/gpu + CD), jsdom can't give a WebGL2/canvas context, so
  nothing ran the real boot — even E2 (427 rewritten imports) shipped with the app's boot unverified. First real QD boot net.
- **What shipped (mirrors the CD/gpu browser pattern; zero new CI infra):** `apps/quadrature-domains/vitest.browser.config.ts`
  (Playwright/Chromium, headless, NOT registered in the workspace so `pnpm test` never launches a browser; `include` narrowed to
  `vitest/browser/*.browser.test.ts`) + a `test:browser` script appended to the root `test:browser` (the existing CI `browser`
  job runs it). `boot.browser.test.ts`: assembles the app's real DOM from `index.html`'s `<body>` (Vite `?raw`), imports the real
  `main.mjs` graph → `bootQdUi()`, and pins: QD_UI boot hooks register (mirror of the no-DOM node seam test), `#canvas` is
  2D-claimed by DomainPlot (`webgl2===null` proves it — a fresh canvas returns webgl2), static tab bar + `#controls-qd` present,
  and NO console.error / uncaught error/rejection during boot. `smoke.browser.test.ts` guards the WebGL2 premise so that
  null-check isn't vacuous.
- **Empirically built + mutation-verified.** Two bring-up findings fixed: the container's pre-provisioned Chromium is a different
  revision than the installed Playwright wants → the config points at `/opt/pw-browsers/chromium` only when it exists (CI installs
  its own, revision-matched); and Vite mid-run dep-optimization reloaded the test → `optimizeDeps.include:[katex,mathjs]`. My
  WebGL2-canvas assumption was WRONG (DomainPlot is a 2D canvas) — the test caught it, and the assertion is now the meaningful
  2D-claimed signal. **Mutation-verified:** breaking a `main.mjs` import (`./core/complex.mjs` → bad path) turns the suite RED (boot
  import throws); reverted byte-identically → green.
- **Green bar:** build/typecheck/lint(+dep:check)/test exit 0; `pnpm test` **2234 / 265** (browser config unregistered → node gate
  unchanged); `pnpm test:browser` (gpu + CD + **QD**) green (QD: 6). Cut `refactor/qd-boot-harness-s1`; PR → refactor/main.
- **Next: Stage 2** (full-page Playwright against the served build — tab switching + boot-loading clears + a canonical solve); the
  paused **D2 factory lifts** are now net-backed and resumable.

## 2026-08-04 — Phase 4 · Stage d2-lift-qolhelp (D2 factory lift 1: QoL help buttons) — PR opened
- **BEHAVIOR-PRESERVING; the first D2 factory lift, now net-backed by the boot harness (#223).** ui.mjs's remaining in-body work
  is a handful of `mount*` chunks + the composition root (the ~11 installX(uiCtx) factories were the Phase-3 item-E splits).
  Lifted the cleanest: `mountQolHelp()` (the inverse-tab "?" help buttons, HANDOFF #33) → **`ui/ui-qol-help.mjs`**, a
  `QD_UI.installQolHelp()` factory (body VERBATIM). It uses only runtime globals (window.QD / QD.Strings / document), so it takes
  NO uiCtx — the lift is a pure move + one `QD_UI.installQolHelp()` call + one side-effect import in main.mjs (before ui.mjs).
- **Net-first, extended the boot net (this is why Stage 1 came first).** Added a boot.browser.test assertion that installQolHelp's
  output is present — the "?" `button.help-btn` INSIDE the app intro title + the #h-card / #domain-mode-card headers. Made SPECIFIC
  to headers only installQolHelp touches: a plain `.help-btn` count stayed >0 from the OTHER boot-time attachHelp callers
  (ui-faber/-thesis/-qd-equations attach to their own cards), so the first (broad) assertion didn't isolate the lift — the
  mutation-verify caught that, and the assertion was tightened. **Mutation-verified:** no-op installQolHelp → the specific
  assertion goes RED; reverted byte-identically → green (boot 7/7).
- **Green bar:** build/typecheck/lint/test exit 0; `pnpm test` **2234 / 265** (node gate unchanged — ui-qol-help.mjs isn't
  node-imported; it boots only in the browser net); `pnpm test:browser` QD **7** (+1 the QoL-help pin). Cut
  `refactor/d2-lift-qolhelp`; PR → refactor/main.
- **Next: the remaining mount lifts** (mountViewToggle / mountCopyLink / mountHTextCopyButton) the same way, each pinned by its
  boot-output assertion; then ui.mjs is a thin composition root. (Stage 2 full-page Playwright still valuable for interaction depth.)

## 2026-08-04 — Phase 4 · Stage d2-lift-copybuttons (D2 factory lifts 2–3 + D2 CLOSED) — PR opened
- **BEHAVIOR-PRESERVING; the last two clean mount lifts, then D2 closes.** Lifted ui.mjs's two QoL copy-button IIFEs →
  **`ui/ui-copy-buttons.mjs`**: `QD_UI.installCopyLink()` (the "🔗 Copy link" in #copy-link-host) + `QD_UI.installHTextCopy()`
  (the copy button after #h-parse), bodies VERBATIM (only change: mountCopyLink's `$('#copy-link-host')` → the identical
  `document.querySelector('#copy-link-host')`, since ui.mjs `$` IS querySelector). Globals-only, no uiCtx; two call sites +
  one main.mjs import, ORDER preserved (the search-options-relocate block stays between them).
- **D2 CLOSED at 3 lifts — mountViewToggle stays in the composition root (the D2 analog of D1d's inspector).** It's coupled to
  `setViewMode` (the inverse/direct view-state machine), which boot ALSO calls at line 1793 and whose `state.viewMode` is read
  cross-module (ui-solve.mjs); extracting it would re-expose internals (uiCtx.state + uiCtx.setViewMode), not decouple. After
  these lifts ui.mjs's remaining body IS the composition root: uiCtx assembly + the QD_UI.installX(uiCtx) calls + the
  view-switching / domain-mode wiring.
- **Net-first + mutation-verified (each isolates).** Extended boot.browser.test with a copy-buttons assertion pinned to each
  lift's anchor (#copy-link-host button / #h-parse + button.copy-btn). MUT1 (no-op installCopyLink) → copy-link red; MUT2 (no-op
  installHTextCopy) → h-text red; both reverted byte-identically → green (boot 8/8).
- **Green bar:** build/typecheck/lint/test exit 0; `pnpm test` **2234 / 265** (node gate unchanged — the module isn't
  node-imported); `pnpm test:browser` QD **8** (+1 copy-buttons pin). Cut `refactor/d2-lift-copybuttons`; PR → refactor/main.
- **Next: Phase 4 (D2) COMPLETE — ui.mjs is a thin composition root (QD-UI-2 resolved).** Remaining engagement work is all
  deferred/optional (Stage 2 full-page Playwright for interaction depth; E1 state/lifecycle; further correspondence families).

## 2026-08-05 — Post-review fix · Stage p0-solver-worker-bundle (QD-BUILD-1) — PR opened
- **THE whole-refactor review's one production regression — a bundler-visibility bug; behavior-RESTORING fix.** The 7-slice
  adversarial review (green bar re-confirmed genuinely 2234/265, internals faithful) found ONE severe, production-ONLY defect,
  invisible to the green bar: the primary-solver worker is silently dropped from the `vite build` output. ROOT CAUSE — the
  Stage-C1 `createWorkerLane` dedup replaced three literal worker URLs with one shared `new URL(cfg.entryUrl, import.meta.url)`
  VARIABLE; Vite's static `worker-import-meta-url` transform only recognizes a string LITERAL, so the `solver-worker-entry` chunk
  was never emitted (dist had only param-slice/schwarz/sym entries; the runtime string is baked into index-*.js and 404s on the
  deployed site). A 404 module doesn't throw synchronously → it hits the async `error` handler (rejects the solve as "…crashed")
  but does NOT arm the `_fallback` latch (only the sync `.catch` does), so it never degrades to main-thread and each retry
  respawns the same doomed worker. All 3 lanes affected (primary/aux/live shared ENTRY) → deployed Solve/alt-search/live-drag
  hard-fail. Invisible to CI: node/jsdom have no `Worker` (tests take the main-thread fallback); `vite dev` serves source; the
  browser boot net also runs against source — only inspecting `dist/` or the live site reveals it.
- **Fix (behavior-restoring, minimal).** Restored the string literal at the `new Worker` site
  (`new URL('../workers/solver-worker-entry.mjs', import.meta.url)`) and removed the now-dead `entryUrl` config field + the
  `const ENTRY` (all three lanes spawn the SAME entry bundle → the literal lives once at the construction site). The three other
  workers (param-slice/schwarz/sym) already used literals and were unaffected. A code comment at the site documents WHY it must
  stay a literal.
- **Net-first (regression net, red→green).** New `vitest/worker-url-static-literal.test.ts` scans `app/**/*.mjs` and asserts
  (1) NO `new Worker(new URL(<variable>))` anywhere (Vite would drop the chunk), (2) primary-solver-worker uses the literal
  `solver-worker-entry` path. RED on the pre-fix variable (offender @ :96); GREEN after the fix. **Mutation-verified:** variable
  reintroduced (`cfg.messageKind`) → net RED @ :102; reverted byte-identically via Edit → green.
- **Empirical build proof.** Post-fix `pnpm build` emits `apps/quadrature-domains/dist/assets/solver-worker-entry-DJnyKXD5.js`
  (was ABSENT pre-fix — the definitive proof the P0 is closed). Green bar: build/typecheck/lint(+dep:check)/test exit 0;
  `pnpm test` **2236 / 266** (+1 file / +2 tests = the net). Cut `refactor/p0-solver-worker-bundle`; PR → refactor/main.
- **Deferred to an explicit decision (a2).** Hardening the async worker-LOAD failure to arm the main-thread `_fallback` latch
  (so a FUTURE bundling regression self-heals instead of hard-failing) is NOT in this stage — it would move the deliberately
  net-frozen contract "a crash is NOT a permanent fallback latch" (psw-crash-char.test.ts:63). Scoped design if approved:
  `_everWorked`-gated (never-loaded → arm fallback; post-success transient crash → keep respawn), preserving the transient-crash
  retry the frozen line protects. Flagged to the user for a token.

## 2026-08-05 — Post-review fix · Stage p0-worker-load-fallback (QD-BUILD-1 hardening, a2) — PR opened
- **AUTHORIZED behavior refinement (user token "Add it (scoped)").** Follow-on to #226: the literal-URL fix stops THIS bug and
  the new regression net stops its recurrence — but a worker bundle can still fail to load in production for reasons a source
  scan can't see (a deploy/hosting/CDN quirk, a future Vite change). Today such a failure hits the async `error` handler, which
  rejects the solve but never arms `_fallback` (only the SYNC `.catch` does), so the lane never degrades to main-thread and each
  retry respawns the same doomed worker — the exact hard-fail severity of the P0.
- **The scoped fix (`_everWorked`).** Added a per-lane `_everWorked` latch (set in `onMessage` once the worker round-trips a
  message). The `error` handler now does `if (!_everWorked) _fallback = true;` — a worker that errored WITHOUT ever having worked
  (a bundle/load failure) latches the lane to the main-thread fallback so it SELF-HEALS; a worker that HAD worked keeps
  terminate-and-retry (a transient crash retries on the fast worker path). This deliberately REFINES the frozen
  psw-crash-char.test.ts contract "a crash is NOT a permanent fallback latch": never-loaded → latch; worked-then-crashed →
  respawn. The frozen line's INTENT (don't permanently demote on a transient crash) is preserved; only the never-loaded gap is
  closed. Per-lane `_everWorked`/`_fallback` closures keep the three latches independent (still pinned by the independence test).
- **Net-first + mutation-verified.** Split psw-crash-char's primary-`error` test into (A) load-failure → rejects the in-flight
  job + latches fallback + subsequent solve self-heals to main-thread, and (B) worked-then-error → settles + does NOT latch +
  respawns on the WORKER path; added per-lane `_isAuxFallback`/`_isLiveFallback` latch pins. **RED** on the 3 new-behavior
  assertions before the source change; **GREEN** after. **Mutation-verify:** inverting `!_everWorked`→`_everWorked` made BOTH A
  (never latches) and B (wrongly latches) go red — proving the net pins the scoping in both directions — reverted
  byte-identically. psw-lifecycle (round-trip/supersede/cancel/spawn-fault) unaffected.
- **Green bar:** build/typecheck/lint(+dep:check)/test exit 0; `pnpm test` **2237 / 266** (+1 test = the A/B split; no new file).
  Cut `refactor/p0-worker-load-fallback` off the #226 fix; PR → refactor/main.
- **This closes the (a2) decision and completes fix (a).** Next: (b) — publish-gate hardening (#2) + the collected-count assertion (#3).

## 2026-08-05 — Post-review fix · Stage publish-gate-durability (fix (b): 2 CI-gate P1 findings) — PR opened
- **Why (b).** The P0 (#226) reached the DEPLOYED site because the publish gate had two blind spots the whole-refactor review
  flagged as P1: (#2) nothing verifies the BUILT app before upload — `pnpm test` is node/jsdom, `vite dev` serves source, the
  browser boot net runs against source, and `vite build` SUCCEEDS while silently dropping a worker chunk; (#3) Vitest's aggregate
  run stays green even if a whole workspace PROJECT silently collects 0 specs. Two deterministic gates close them.
- **(b#2) built-artifact gate** — `scripts/check-built-artifacts.mjs`, run as the tail of `pnpm build`. Scans each PUBLISHED app's
  source (QD `app/`, CD `src/`; comments stripped) for `new Worker(new URL('<literal>', import.meta.url))`, derives the chunk stem
  (basename minus final ext — Vite names the worker chunk `<stem>-<hash>.js`, keeping `.worker`), and asserts each is present in
  `dist/assets/`. Detection is source-derived, so a NEW worker is covered with no list to maintain; it found exactly the 5 real
  workers (QD solver/schwarz/sym/param-slice + CD juliaMetrics), the two comment references correctly excluded. Because it rides
  `pnpm build`, it runs locally, in ci.yml `build`, AND in deploy-pages.yml `build` (the step that uploads the site) — a dropped
  chunk now fails the build instead of publishing. Complements #226's SOURCE-level worker-url-static-literal.test.ts (this is the
  build-OUTPUT layer). Mutation-verified: hiding `solver-worker-entry-*.js` → gate fails naming the chunk + spawn site (exit 1);
  restore → pass. Full `pnpm build` ends with the gate ✓, exit 0.
- **(b#3) test-census gate** — `scripts/assert-test-census.mjs`, run as the tail of `pnpm test`. `vitest run` now also writes a
  `--reporter=json` report (`.vitest-census.json`, gitignored); the script buckets the collected files by workspace project
  (path prefix) and asserts each of the 8 projects ≥ 1 file plus a loose global floor (200), so a project silently emptied
  (relocated files / glob typo / passWithNoTests) fails CI. Mirrors the repo's node-test.js FLOORS idiom. Real run: 266 files —
  core:4 exact:3 interchange:2 expr:11 gpu:4 CD:68 corr:17 QD:157, 0 unbucketed. Mutation-verified: a doctored JSON with
  interchange emptied → gate fails naming 'interchange' (exit 1), global floor still satisfied so the per-project guard is
  isolated; the real JSON → pass.
- **Scope choice.** Deterministic built-OUTPUT assertions over (a) a heavier built-app browser smoke test (serve dist + Playwright
  → new infra + flake) and (b) reversing the deliberate "browser is not a publish blocker" topology — both left as optional
  follow-ups; neither is needed to close the QD-BUILD-1 class.
- **Green bar:** build(+b#2 gate)/typecheck/lint(+dep:check)/test(+b#3 census) all exit 0; `pnpm test` **2237 / 266** + census ✓.
  Cut `refactor/publish-gate-durability` off refactor/main; PR → refactor/main.

## 2026-08-05 — Post-review follow-up · Stage aux-live-messageerror (worker-robustness completeness) — PR opened
- **The last worker-lifecycle inconsistency.** After the QD-BUILD-1 arc hardened the worker LOAD/crash paths, one gap remained
  (the pre-existing footnote from the arc report): only the PRIMARY lane installed a `messageerror` handler; aux (alt-search) and
  live (drag-solve) did not. `messageerror` fires when a message from the worker fails structured-clone on receipt — on aux/live
  that left the in-flight job UNSETTLED forever (`isAuxBusy`/`isLiveBusy` stuck true → that lane wedged until reload). Frozen (not
  endorsed) by psw-crash-char.test.ts's "asymmetry" specs since B4-2a. Low-probability in practice (messages are plain numeric
  data), so this is robustness COMPLETENESS, not an urgent bug.
- **The fix (2 flags).** `createWorkerLane` already implements the handler behind `cfg.hasMessageError`; flipped aux + live from
  `false` → `true`. Now all three lanes reject the in-flight job (`<crashLabel> message error (structured-clone failed)`) and
  dispose the worker on a clone failure — a fresh run respawns (a clone failure is data-specific, so it does NOT arm the
  main-thread `_fallback` latch, matching primary + the transient-crash contract). Per-lane closures keep the latches independent.
- **Net-first + mutation-verified.** Rewrote the two frozen "asymmetry — does NOT settle" specs to assert settle+dispose parity
  (reject `/structured-clone/` + `isAux/LiveBusy` false + `_hasAux/LiveWorker` false + `_isAux/LiveFallback` false). RED against
  the pre-fix source (both specs time out — no handler → the promise never rejects), GREEN after the flip. Because each spec
  exercises only its own lane, the RED→GREEN transition proves each pins its lane's flag (no separate isolated mutation needed).
- **Green bar:** build(+gate)/typecheck/lint(+dep:check)/test(+census) all exit 0; `pnpm test` **2237 / 266** (count unchanged —
  2 specs rewritten, none added). Cut `refactor/aux-live-messageerror` off refactor/main; PR → refactor/main.

## 2026-08-06 — Post-ship bug fix · Stage sym-worker-load-selfheal (QD-SYM-LOAD) — PR opened
- **User-reported (deployed):** "Auto-reduce & solve: sym-worker crashed: [object Event] @ bundle:?" on the cardioid, QD Algebra
  module, on the freshly-shipped live site. DIAGNOSIS: the sym-worker CHUNK is fine — served the prod build + spawned it in a real
  module-worker (Playwright/headless-Chromium): it loaded and returned a correct `dimension` result; `cardioid-uniqueness` passes in
  the node suite (SymWorker uses the main-thread fallback there). `[object Event] @ bundle:?` = an ErrorEvent with empty
  message/filename/lineno = a worker-script LOAD failure (404), not a runtime error. Root cause deploy/cache-specific: the refactor
  changed EVERY chunk hash and QD is a `registerType:"autoUpdate"` PWA — when the new SW takes over a still-open old page mid-session,
  a LAZILY-spawned worker (sym-worker only spawns on ★ Auto-reduce & solve) is requested at an OLD hash the new deploy no longer has
  → 404 → the bare event. Immediate user remedy: hard-refresh / clear site data (loads the consistent new chunk set).
- **The code gap fixed.** sym-worker.mjs predates + sits OUTSIDE the `createWorkerLane` factory, so it never got #227's `_everWorked`
  load-failure hardening. Its F4 latch fired only for an IDLE error (`if (!hadJob) _fallback = true`); a load failure WITH a job in
  flight (the user's case) rejected with "sym-worker crashed" and did NOT fall back → the next op re-spawned + re-failed. FIX (the
  sym analog of #227): add `_everWorked` (set in onMessage, reset per worker build), carry `op/payload/onProgress` on `_inflight`,
  and in the `error` handler, when `!_everWorked` (never loaded) latch `_fallback` AND SELF-HEAL the in-flight op — re-run it via
  `_QD.Sym.runJob` on the main thread and RESOLVE the original promise — so Auto-reduce & solve keeps working. A worker that HAD
  returned a message then errors = a transient crash → still rejects + respawns (unchanged).
- **Net-first + mutation-verified.** Rewrote sym-worker-crash-char's load-failure spec to assert the self-heal (in-flight op
  RESOLVES via a stubbed `QD.Sym.runJob` + `_isFallback` latches + a subsequent run goes straight to main thread) and added a
  worked-then-crash spec (message first → error → rejects, no latch). RED on the pre-fix source (rejects), GREEN after; inverting
  `!_everWorked` reddens BOTH new specs (+ F4) → reverted byte-identically. Green bar: build(+gate)/typecheck/lint/test **2238 / 266**
  (+1 spec). Cut `refactor/sym-worker-load-selfheal` off refactor/main; PR → refactor/main.
- **Behavior change — authorized by the bug report** (hard-error → graceful main-thread fallback). **Follow-ups flagged (NOT in this
  PR):** (1) a built-app browser smoke test exercising the worker paths — the coverage gap that let BOTH QD-BUILD-1 and this reach
  prod; (2) the PWA `autoUpdate` strategy (→ `prompt`, or drop skipWaiting) so a deploy can't strand lazy workers; (3) sym-worker
  still lacks a `messageerror` handler (the #229 gap, in the sym lane).

## 2026-08-06 · stage qd-cd-export-link — QD→CD "Export map → copy link" targeted the wrong app (QD-HANDOFF-1)
- **The bug (user-reported).** The Schwarz tab's "Export map → copy link" hand-off produced a link that reopened the QD app instead
  of Complex Dynamics. `_exportMap` (schwarz-ui.mjs) built `location.origin + location.pathname + link`, where `link` is only the
  payload hash `#s=…` (encodeLink) — so it stapled the interchange payload onto QD's OWN URL. Opening it reloaded QD, which reads
  only its own `#vs=` view-state key and ignores `#s=` (CD is the consumer, main.ts:2961) → "simply links back to QD".
- **The fix (de-risked, per the pre-fix downside review the user asked for).** Added a PURE resolver in schwarz-export.mjs:
  `resolveHandoffBase(loc, cdBase)` → `{base, resolvable, reason}` + `exportPhiDeepLink(phi, loc, opts)`. Combined Pages deploy = the
  apps are siblings, so it swaps the path segment `…/quadrature-domains/…` → `…/complex-dynamics/`; an explicit `cdBase` override
  wins; a location with no QD segment (local split-port dev, where the sibling can't be resolved) is flagged `resolvable:false`.
  `_exportMap` now routes through it, reads `import.meta.env.VITE_CD_BASE` (dev override), and the status message is truthful per
  `resolvable` (never claims it copied a CD link when it can't resolve one). `exportPhiLink`'s golden-pinned payload is byte-unchanged.
- **Design.** Kept the resolver IN QD (single consumer today) rather than extracting a package — ADR-0007; a promotion note to
  @cas/interchange is left in a comment. `CD_APP_ID` equals the interchange provenance `app` id / deploy subpath.
- **Net-first + mutation-verified.** NEW `vitest/schwarz-handoff-link.test.ts` (10): resolver behavior (sibling-swap incl.
  index.html + domain-root, override-normalize, dev-unresolvable) + `exportPhiDeepLink` builds the full CD URL carrying the exact
  cross-app golden (asserts `/complex-dynamics/` present, `/quadrature-domains/` absent) + a source-pin (the worker-url-static-literal
  idiom) that `_exportMap` routes through `exportPhiDeepLink` and no longer hand-rolls `location.origin + location.pathname`. RED on
  the pre-fix wiring (both source-pins failed), GREEN after; the resolver net mutation-verified (swap CD→QD id → 4 red → reverted).
- **Behavior change — authorized by the bug report** (broken link → CD-targeted link). Green bar: build(+gate)/typecheck/lint/test
  **2248 / 267** (+1 file / +10 tests). Cut `refactor/qd-cd-export-link` off refactor/main; PR → refactor/main. **Known limit
  (documented, not a regression):** cross-app deep-linking still can't resolve automatically in local split-port dev — set
  `VITE_CD_BASE`; true end-to-end confidence needs the still-pending built-app browser smoke test.
- **2026-08-07 · stage schwarz-s0a-relabel (PR → refactor/main):** **σ-handoff S0a — honest relabel (behavior: labels;
  bug-report authorized).** User reported the Schwarz "Export map → copy link" exports the Riemann map φ, not the Schwarz reflection
  σ — the documented plumbing-first design (schwarz-export.mjs:4-8), but the label over-promised. Relabeled the export button
  "Export map → copy link" → "Export **Riemann map φ** → copy link" and the card copy to state it hands off φ (the Riemann map), NOT
  σ(w)=conj(F(φ⁻¹(w))), with a "faithful σ export is planned" note (schwarz-ui.mjs `makeOverlaysCard`). NET-FIRST: exposed
  `makeOverlaysCard` on the `__schwarzUiTest` hook (test-only, sentinel-gated) + NEW behavioral assertions in `vitest/schwarz-ui.test.ts`
  (button names the Riemann map φ; card disclaims σ) — RED on the old label, GREEN after, mutation-verified (disclaimer "not"→"indeed"
  → red → reverted). Green: build(+gate)/typecheck/lint/test **2249 / 267** (+1 test). First step of the APPROVED σ hand-off plan
  (`docs/design/SIGMA-HANDOFF.md`, S0→S4a).
- **2026-08-07 · stage schwarz-s0b-antiholo (PR → refactor/main):** **σ-handoff S0b — anti-holomorphic import correctness (CD +
  interchange).** Two audit-found latent bugs. (1) CD's `mapSpecToExpr` (importMap.ts) IGNORED the MapSpec `antiholomorphic` flag —
  a rational/laurent map so tagged would render as its HOLOMORPHIC twin. Parametrized the build variable: `antiholomorphic` ⇒ build
  on `conjugate(z)` (rational/laurent); the `expr` form threads its own conjugate and passes through verbatim. NET-FIRST: new case in
  `importMap.test.ts` (a c=1 antiholomorphic laurent maps z=2−3i → 2+3i, not 2−3i) — RED on the old code, GREEN after, mutation-
  verified (`? "z":"z"` → red → reverted). (2) The interchange schema's ExprMap example spelled `conj(z)^2+c`, but the expr language
  only knows `conjugate` — a producer copying it would fail CD's parser. Aligned the schema comment + interchange test sample to
  `conjugate` (the language owns its vocabulary; no expr alias added). Both latent today (QD emits holomorphic φ) — preventive for the
  anti-holomorphic σ ahead. Green: build(+gate)/typecheck/lint/test **2250 / 267** (+1 test).
- **2026-08-07 · stage schwarz-s2a-pkg (PR → refactor/main):** **σ-handoff S2a — NEW shared package @cas/schwarz (on @cas/core).**
  **Reorder** (flagged): went deltoid-direct — S2a before S1 — because deltoid.ts is already clean TS on @cas/core, whereas the S1
  poly extraction touches load-order-sensitive QD glue; and S1 + the full QD cutover are NOT on the deltoid-σ critical path (deferred
  to a generalize phase). Created `packages/schwarz` (source-consumed, modeled on @cas/gpu): the unbounded-Laurent σ engine
  `makeUnboundedLaurentSchwarz(c,F) → {evalPhi,evalPhiDeriv,evalF,invertPhi,sigma}` + `escapeTime` + `pointInPolygon`, LIFTED VERBATIM
  (`cp`) from `apps/correspondences/src/deltoid.ts` (itself a clean-room TS port of QD's schwarz-common adaptUnbounded+sigma). Golden
  net `test/unbounded-laurent.test.ts` (5): the σ(φ(z₀))=conj(F(z₀)) round-trip identity + exterior-branch φ⁻¹ (|z|>1) + escapeTime —
  mutation-verified (drop `conj` in σ → round-trip red → reverted). Registered in `vitest.workspace.ts` + `assert-test-census.mjs`
  (now 9 projects, schwarz:1). **Consumer repoint (ADR-0007 dedup, first family):** `deltoid.ts` now imports the engine from
  @cas/schwarz and re-exports its surface, keeping only DELTOID_C/F/DELTOID + deltoidBoundary; its 18 consumers + `deltoid.test.ts`
  UNCHANGED (behavior-preserving). Green: build(+gate)/typecheck/lint/test **2255 / 268** (+1 file). Next: S3 → S4a.
- **2026-08-07 · stage schwarz-s3a-interchange (PR → refactor/main):** **σ-handoff S3a — @cas/interchange gains the `schwarz`
  vocabulary (v1.1.0).** The wire can now carry the Schwarz reflection as a RECIPE, not just φ. `schema.ts`: new `SchwarzMap`
  (`form:"schwarz"; phi:LaurentMap|RationalMap; disk:"D"|"D*"; inverse:"newton-dk"; antiholomorphic:true`) added to the `MapSpec`
  union; `VERSION` 1.0.0 → **1.1.0** (honest-labeling: adding vocabulary must move the version — leaving 1.0.0 would silently redefine
  it; major-gated validator ⇒ every prior φ link still decodes). `validate.ts`: `isMapSpec` `case "schwarz"` — recurse `phi` (laurent|
  rational ONLY; the engine reads coefficients), `disk` enum, `inverse` ∈ `KNOWN_INVERSES`, `antiholomorphic===true`; the `phi`
  recursion inherits MAX_COEFF_LEN so no uncapped field is added. NET-FIRST: `interchange.test.ts` schwarz accept + 6 reject cases —
  RED on the missing case, GREEN after; mutation-verified twice (weaken case → disk/inverse/flag rejects go red; drop phi-form
  restriction → expr-phi reject goes red; both reverted). **Goldens:** the φ golden was regenerated from QD's REAL `exportPhiLink`
  (1.0.0 → 1.1.0, version field only — QD's byte-exact golden test stays green with no QD edit) and a NEW deltoid-σ golden added
  (`QD_TO_CD_DELTOID_SIGMA_LINK` + a frozen `σ(1+0.75i)=0.5−0.5i`, derived via σ(φ(z₀))=conj(F(z₀)) at z₀=1+i to exercise the anti-
  holomorphic conj). `@cas/schwarz` test pins those frozen σ values against the REAL numerical engine. **CD guard (minimal, forced by
  the enlarged union — not S4a's feature):** `mapSpecToExpr` `case "schwarz"` now THROWS (σ has a numerical inverse ⇒ not expr-
  compilable) instead of falling through to an implicit `undefined` (noImplicitReturns is off, so this was a latent crash: main.ts
  would set `inpf=undefined`); `importInterchange` recognizes a schwarz map and declines with an honest toast rather than crash. NET-
  FIRST in `importMap.test.ts` (mapSpecToExpr(schwarz) throws; envelopeToMapSpec surfaces the recipe) — RED (returned undefined),
  GREEN after, mutation-verified (throw → silent return → red → reverted). Additive; behavior-preserving for every existing map.
  Green: build(+gate)/typecheck/lint/test **2259 / 268** (+4 tests, census 9 projects). Next: **S3b** (QD "Export σ" button alongside
  φ) → **S4a** (CD reconstructs the deltoid σ, CPU, `≈`).
- **2026-08-07 · stage schwarz-s3b-qd-export (PR → refactor/main):** **σ-handoff S3b — QD "Export σ" button, ALONGSIDE φ
  (behavior change — token granted, decision 2).** QD can now hand off the Schwarz reflection, not just the Riemann map.
  `schwarz-export.mjs`: `buildSigmaEnvelope(phi, opts)` → an `Envelope<"schwarz-reflection">` whose `sigma` is the
  `form:"schwarz"` recipe (`phi:<phiToMapSpec>`, `disk:"D*"`, `inverse:"newton-dk"`, `antiholomorphic:true`) + `conventions:
  CANONICAL`; `exportSigmaLink` / `exportSigmaDeepLink` mirror the φ pair (reuse `resolveHandoffBase` — VITE_CD_BASE / sibling
  path). **Scoped to the unbounded-Laurent family** (φ → a `laurent` MapSpec): that is the only σ @cas/schwarz's exterior-branch
  engine reconstructs today, so a rational/bounded/non-exportable φ returns **null** — we never emit a σ recipe no consumer can
  rebuild (honest labeling). Payload CANONICAL (φ is geometric; QD's dA/2πi normalizations touch h/areas, not φ). `schwarz-ui.mjs`
  `makeOverlaysCard`: second button **"Export Schwarz reflection σ → copy link"** beside the φ button + an `_exportSigma` handler
  mirroring `_exportMap` (null-case toast names the family limit); card copy rewritten to describe BOTH hand-offs (supersedes S0a's
  "σ planned" disclaimer). `_exportMap` left byte-unchanged. NET-FIRST: `schwarz-export.test.ts` σ block (recipe shape + null cases +
  codec round-trip + **the exact byte-match to the S3a golden** — closing the producer↔consumer loop S3a opened hand-built) — GREEN
  after impl, mutation-verified (`disk:"D*"`→`"D"` → recipe + golden tests red → reverted); `schwarz-ui.test.ts` S0a card test
  rewritten to assert BOTH buttons present + honestly labeled — RED on the missing σ button, GREEN after. Green:
  build(+gate)/typecheck/lint/test **2263 / 268** (+4 tests). Next: **S4a** (CD reconstructs the deltoid σ — CPU, `≈`), the approved
  end-state; then the σ button reaches a consumer that renders it.
- **2026-08-07 · stage schwarz-s4a-cd-sigma (PR → refactor/main):** **σ-handoff S4a-1 — CD reconstructs the
  deltoid σ (engine + ground-truth net).** The CD half of the hand-off, split into the verifiable core
  (this PR) and the CPU render (S4a-2). Added `@cas/schwarz` to CD's deps and
  `schwarzEngineFromMapSpec(sigma: SchwarzMap)` (`src/interchange/importMap.ts`): σ is not expr-compilable
  (numerical inverse), so instead of `mapSpecToExpr` it rebuilds the evaluator from `sigma.phi` via
  `makeUnboundedLaurentSchwarz` — converting interchange `{re,im}` coeffs to the engine's `[re,im]` tuples;
  throws for a shape the engine can't rebuild (non-Laurent φ, complex leading c) rather than returning a
  subtly-wrong σ. **THE GROUND-TRUTH NET** (`importMap.test.ts`): decode the S3a σ golden → `envelopeToMapSpec`
  → `schwarzEngineFromMapSpec` → `.sigma([w₀])` reproduces the frozen `σ(1+0.75i)=0.5−0.5i` to 1e-9, END TO
  END through CD's real import path — the reproduction the whole arc was built to reach. Mutation-verified
  (swap the `{re,im}→[re,im]` tuple order → σ(w₀)=1.066 ≠ 0.5 → net red → reverted). Behavior-preserving:
  `schwarzEngineFromMapSpec` is a new tested capability; `importInterchange` still shows the S3a decline
  (S4a-2 wires the reconstruction into a CPU-rendered σ view). Green bar **2264 / 268** (+1 test).
- **2026-08-07 · stage schwarz-s4a2-cd-render (PR → refactor/main):** **σ-handoff S4a-2 — CD renders the
  deltoid σ (CPU), the approved end-state.** Built on S4a-1's reconstruction. NEW `src/render/schwarzView.ts`
  (pure, unit-tested): `schwarzBoundaryPoly` (φ of the unit circle — Ω is its exterior), `pixelToPlot`
  (the app's uvToPlot mapping), `schwarzEscapeAt`, and `renderSchwarzField(engine, poly, view, size)` →
  RGBA escape-time buffer, mirroring `render/orbitPreview.ts`'s CPU pattern (σ is not GPU/expr-renderable).
  Coloring by EscapeKind: fundamental (the tiling) ramps by n, escaped/interior/invalid flat. Net
  `test/schwarzView.test.ts` (3): origin ∈ K → fundamental n=0, far point → escaped; pixelToPlot window;
  buffer opaque + has structure. Mutation-verified (drop the `!` in isInOmega → origin misclassifies as
  'invalid' → net red → reverted). **CD integration** (small, self-contained): a new full-size 2D canvas
  `#JCSSchwarz` in the dyn `.canvas-stack` (reuses `.overlay` positioning; the stack is square so the 256²
  buffer isn't distorted) + an `≈`-badge; `renderSchwarzView`/`exitSchwarzView` in main.ts; `importInterchange`
  now RECONSTRUCTS + paints σ (replacing the S3a decline); `exitSchwarzView()` at the top of `applyAllControls`
  (safe — boot shows σ AFTER the last applyAllControls) and on a click of the σ raster. **Visual verification:**
  Playwright-loaded the σ deep-link against the built app — the 3-fold-symmetric deltoid σ tiling renders,
  `≈`-labeled, ZERO console errors. Green bar **2267 / 269** (+1 file, +3 tests). **QD-HANDOFF-2 CLOSED end
  to end: QD emits σ → CD reconstructs + renders it.** (S4b GPU σ + other families remain separate approvals.)
- **2026-08-07 · branch claude/repository-refactor-project-pg5ktu:** **σ/φ export legibility + the missing
  LIVE net (Phase 1 of the "σ for more domains such as the deltoid" ask).** A Phase-0 repro that runs the
  REAL solver → REAL exporter in one process found the pure **deltoid already σ-exports end to end** — so the
  reported "deltoid unsupported" was a mislabel: `_exportSigma`/`_exportMap` printed ONE blind line ("needs an
  unbounded-Laurent φ (e.g. the deltoid)") for EVERY refusal — nothing captured, a Direct rational φ, a
  bounded domain, or a pole-bearing unbounded QD — pointing each at the deltoid, the one shape that works. Why
  it survived to prod: the σ test asserted a **hand-built** `deltoidPhi` literal; the live solve→capture→export
  chain was never exercised. FIX (`schwarz-export.mjs`, pure + tested): `classifyPhiForExport` +
  `explainSigmaUnavailable`/`explainPhiUnavailable` — return **null ⇔ exportable** (the ok-decision defers to
  `phiToMapSpec`, so a reason can never drift from the serializer), else the real cause (names the manual
  **"Use this φ"** capture step; "rational → use φ export"; "bounded"; "N pole terms → pole-free Laurent only,
  planned"). `schwarz-ui.mjs`: both handlers route through the explainers; `_autoCaptureIfPending` grabs a
  pending Inverse solve when nothing is captured yet (safe — never overrides an existing capture, reuses the
  "Use this φ" path, no new failure mode). NET-FIRST: 10 classifier/reason unit tests (RED→GREEN); **NEW
  `vitest/schwarz-export-live.test.ts`** boots the real QD solver and runs a genuinely-solved deltoid through
  the real exporter (valid `schwarz` envelope) + pins the single-pole boundary (σ+φ null, reason names the
  pole) — the net that was missing; a jsdom wiring test asserts the precise status line for nothing-captured /
  pole-bearing / bounded. Mutation-verified (`explainSigmaUnavailable`→always-null → all three nets red →
  reverted). Green: typecheck/lint/test **2282 / 270** (+15 tests, +1 file). σ COVERAGE UNCHANGED —
  pole-bearing/other-family σ stays the deferred generalize phase (S2b/S5); this only makes the refusal honest
  and nets the deltoid path that shipped in S3b/S4a.
- **2026-08-07 · branch claude/repository-refactor-project-pg5ktu (Phase 2 — pole-bearing σ, 5 increments):**
  **the σ hand-off now covers unbounded QDs with finite-pole branch terms (a single exterior pole, a
  cardioid, …), not just the pole-free deltoid.** The "domains such as the deltoid" broadening, end to end.
  Five net-first, mutation-verified increments:
  **(1) `@cas/schwarz`** (`faaa6af`) — `makeUnboundedLaurentSchwarz(c, F, branches?)`: ported QD's canonical
  branch term (schwarz-common `adaptUnbounded`) into φ = c·z + Σ F_l/zˡ + Σⱼ Σₖ conj(A_{j,k})·u_j(z)ᵏ
  (u_j = z/(1−conj(z_j)z)), its derivative, and the reflected Schwarz extension Σⱼ Σₖ A_{j,k}/(z−z_j)ᵏ. The
  branch term has poles in 𝔻*, so no cleared DK polynomial — the inverse factors into `newtonFrom(seed)` and
  retries cold exterior seeds for branches; **the pole-free path (Newton + DK) is byte-identical**, deltoid σ
  unchanged. Net: hand-computed φ/F values pin order-1/order-2(k=2)/Σⱼ; the boundary identity F(z)=conj(φ(z))
  on |z|=1 pins the reflection; the round-trip σ(φ(z₀))=conj(F(z₀)) pins the inverse.
  **(2) `@cas/interchange`** (`4f2effb`) — optional `branches` on `LaurentMap` + `isBranchArray` seatbelt;
  **VERSION 1.1.0 → 1.2.0** (MINOR; consumers gate on MAJOR=1). Deltoid goldens regenerated — only the
  embedded `version` changed (deltoid is pole-free).
  **(3) QD emit** (`3477392`) — `phiToMapSpec` maps `phi.branches` into the wire (omitted when empty ⇒
  deltoid byte-identical); the "pole-bearing σ is planned" refusal is gone. Phase-1 "does not export"
  boundary tests flipped; the LIVE single-pole solve now emits a valid branch-bearing envelope.
  **(4) CD reconstruct** (`819229d`) — `schwarzEngineFromMapSpec` threads `branches` into the engine; a new
  cross-app single-pole σ golden (fixture c=1, z_j=0.2, A=0.3) pins the loop from all three sides — interchange
  decodes it, QD reproduces the exact bytes, CD reconstructs the frozen **σ(w₀)=2/3** (a dropped branch would
  give the pole-free 1/3). This is the end-to-end ground truth: QD emits a pole-bearing σ → CD rebuilds it.
  **(5) CD render + docs** (this commit) — the CPU render path is generic over the engine, so a pole-bearing
  engine paints via the same `schwarzBoundaryPoly`/`renderSchwarzField` (smoke-tested); SIGMA-HANDOFF/ISSUES
  updated. Green bar: typecheck/lint/test **2299 / 270** (+17 tests). Still deferred: complex leading c, the
  non-Laurent families (bounded/LQD/PQD — S2b–d), GPU σ (S4b), df64 deep-zoom.
- **2026-08-08 · branch claude/repository-refactor-project-pg5ktu (S4b-i — GPU σ evaluator + CPU-parity net):**
  **the first half of S4b: QD's hand-written σ fragment shader is now a shared `@cas/schwarz/gpu` GLSL module
  with a proven CPU↔GPU parity net.** Foundation for native interactive σ in CD; nothing in an app imports it
  yet (the CD render swap is S4b-ii). Two increments:
  **(I0) `@cas/schwarz/gpu` homed** — new `src/gpu/` on `@cas/gpu` (`workspace:*`; dep-cruiser accepts the edge
  — acyclic, downward, the second package↔package edge after gpu→expr). `./gpu` export subpath; a
  `vitest.browser.config.ts` + `test:browser` script mirroring `@cas/gpu`, appended to the root `test:browser`
  chain (CI's `browser` job runs it).
  **(I1) σ GLSL lifted + parity proven** — `sigma.glsl.ts` lifts QD's `FRAG_SRC` σ evaluator
  (branchPhi/branchSchwarz/evalPhi/evalPhiDeriv/evalF/invertPhi/newtonSeedFresh/acceptZ/sigma) as reusable
  GLSL strings, **specialized to the ONE family CD reconstructs** — the unbounded-Laurent map with finite-pole
  branches (`makeUnboundedLaurentSchwarz`). QD's other five families (bounded/LQD/singular/β) have no CD
  consumer, so per **ADR-0007** they stay in QD's app-local shader; the `u_family` dispatch is specialized away
  (no `u_w0`/`cexp`/`blaschke`, unbounded-only seeding/acceptance). The **EPS-guarded** complex ops are kept
  local (deliberately NOT `@cas/gpu`'s `COMPLEX_SINGLE_GLSL`, which lacks `cinv` and the pole guard) — the same
  pole-safety reason QD keeps them, documented in-file. `probe.ts`: `packPhi` (φ → fixed-size cap-checked
  uniforms), `uploadPhi`, and `runSigmaGLSL` (RGBA32F readback) — the `@cas/gpu` `dualBackend.ts` split.
  NET: a **node** structural guard pins the specialized cut (asserts the family-1 math is present and NONE of
  QD's other-family vocabulary rode along) + `packPhi` byte-correctness; a **browser** numeric harness (real
  WebGL2 / SwiftShader) proves **GPU σ(w) = CPU σ(w)** at round-trip samples w = φ(z₀) across the deltoid + a
  single-pole, a complex order-2 pole, and a two-branch domain — **measured max \|GPU−CPU\| = 1.9e-7**
  (float32 ε; matches `@cas/gpu`'s 1.5e-7 dual-backend figure), plus σ=null for a point in the hole K. Green
  bar: typecheck / lint(+dep:check) / test **2305 / 271** (+6 node tests, +1 file), build, browser σ-parity
  6/6. Next: **S4b-ii** composes this GLSL into CD's escape-time shader and swaps the CPU putImageData σ raster.
- **2026-08-08 · branch claude/repository-refactor-project-pg5ktu (S4b-ii — CD's σ render is now GPU):**
  **CD paints the reconstructed σ escape-time field on the GPU**; the CPU `putImageData` raster is now a
  fallback. Two increments:
  **(I2a) `@cas/gpu/mask`** — extracted a polygon→R8 mask-texture primitive (`buildPolygonMaskTexture` + the
  pure `polygonMaskFrame` sampling geometry). CD's σ renderer is the SECOND consumer of what QD's
  `schwarz-webgl buildMaskTexture` does, so per **ADR-0007** it becomes a `@cas/gpu` primitive; QD's entangled
  copy (it carries QD-specific phiState) is left in place per the **ADR-0008** precedent — migrating it is a
  separate, reviewable change (noted in ISSUES). Node-tests the frame math; the GL upload is exercised by CD's
  browser render + shader-compile gate.
  **(I2b) CD σ GPU renderer** (`src/render/schwarzGL.ts`) — composes the lifted σ evaluator GLSL
  (`@cas/schwarz/gpu`) with CD's OWN view→w mapping, Ω mask (in Ω ⟺ outside K), escape loop, and palette —
  every classification/color mirrored from `schwarzView.ts` so GPU ≈ CPU. It renders to a PRIVATE offscreen
  WebGL2 canvas; `renderSchwarzView` `drawImage`s that onto the existing 2D `#JCSSchwarz`, so the
  DOM / dismiss / label path AND the CPU fallback are untouched — the GPU is only a faster pixel source.
  `renderSchwarzView(spec)` now reconstructs the engine (CPU fallback + boundary poly) + φ (GPU uniforms, via
  a shared `schwarzPhiFromMapSpec`), tries GPU, falls back to CPU on any failure, and labels the mode
  ("≈, GPU" / "≈, CPU"). NET: the σ shader joins CD's browser SHADER-COMPILE gate; a browser render test
  proves the whole pipeline (deltoid opaque + structured + the exact K-base color; a pole-bearing domain
  structured). VISUAL: three REAL solved pole-bearing σ links (single-pole ×2, two-pole) rendered in the
  BUILT app via GPU are structurally identical to the CPU renders — K interior exact `[30,60,140]`; only
  **55 / 65536 px (0.08%)** differ, as float32 boundary `invalid` speckle (the honest ≈ tradeoff, matching
  QD's own GPU σ). Green: typecheck / lint(+dep:check) / test **2309 / 272** (+4 node: mask frame math), build,
  CD browser **14/14**. Next: **S4b-iii** makes the σ view interactive (pan/zoom/pinch via PlotView) + adds the
  native φ preset/custom UI.
- **2026-08-08 · branch claude/repository-refactor-project-pg5ktu (S4b-iii — the σ view is interactive):**
  **the reconstructed σ view now pans and zooms like a standard fractal**, GPU-rendered live. Was a fixed
  [-2.5,2.5]² static overlay dismissed on click; now: **drag to pan, scroll to zoom** (about the cursor), **Esc**
  (or any control change) to exit. `renderSchwarzView` became a **session** — it stores the reconstructed
  engine / φ / boundary once (`schwarzSession`) and repaints at the current `schwarzView` on each gesture,
  rAF-coalesced. GPU mode paints a crisp 512² in one pass; the CPU fallback stays 256² so pan/zoom is
  responsive. The pan/zoom math is pure + exported (`uvToPlotFrac` / `panSchwarzView` / `zoomSchwarzView` in
  `render/schwarzView.ts`) and unit-tested (the grabbed point follows the cursor; a corner-anchored zoom pins
  that point; a center zoom leaves the center fixed). VERIFIED in the BUILT app (Playwright drag + wheel + Esc):
  GPU label + interaction hint, the view pans and zooms in (the K oval magnifies), Esc hides the canvas, no
  console errors. Green: typecheck / lint / test **2309 / 272** (+4 node: view math), build. Next: **S4b-iv** —
  the native φ entry (a preset picker + a custom-φ input form: c, Laurent F, poles A_j at z_j), so a σ fractal
  can be GENERATED in CD from a Riemann map, not only imported.
- **2026-08-08 · branch claude/repository-refactor-project-pg5ktu (S4b-iv — native φ → σ in CD):**
  **CD now GENERATES a Schwarz-reflection σ fractal from a Riemann map φ**, not only from an imported link —
  the headline of native σ support. A "Schwarz reflection σ…" button opens a compact builder: a **preset
  picker** (Deltoid, Ellipse, Single exterior pole) + a **custom-φ form** (leading c, Laurent F, finite-pole
  branches as "z ; A₁, A₂, …" lines). "Generate σ" builds the φ coefficients and enters the interactive GPU
  σ view (S4b-ii/iii). The φ-form parsing + validation is a PURE module (`render/schwarzPhiForm.ts`:
  `parseComplex` / `parseComplexList` / `parsePoles` / `buildSchwarzPhi` + `SCHWARZ_PRESETS`), unit-tested
  (12 cases: complex-literal spellings, `z ; A` pole lines, |z_j|<1 + real-c + non-trivial-boundary
  validation, every preset builds). `main.ts` factors the σ entry into a shared `enterSchwarz(engine, phi)`
  used by BOTH the import path (`renderSchwarzView`) and the native path (`renderSchwarzFromPhi`). The 4 form
  fields are opted out of `SHARE_IDS` as one-shot tool inputs (a σ-view permalink is deferred) — appState's
  DOM-coverage guard pinned that decision. VERIFIED in the BUILT app (Playwright): open → prefilled deltoid →
  Generate → the classic 3-cusp deltoid σ tiling (512² GPU, 32 colors); switch to single-pole → fields update
  → Generate → the pole domain; empty c → the error line "enter a leading coefficient c" with no σ shown; no
  console errors. Green: typecheck / lint / test **2325 / 273** (+12 node: φ-form; +1 file), build. This
  closes the native σ feature end to end: **lift (S4b-i) → GPU render (ii) → interactive (iii) → native φ
  entry (iv)**. Remaining are enhancements: σ orbit inspection + a σ-view permalink (deferred).
- **2026-08-08 · branch claude/repository-refactor-project-pg5ktu (ADR-0009 R1 — σ is a first-class peer view):**
  **the Schwarz-reflection σ is no longer a transient overlay on the Dynamical plane — it is its own peer
  view/mode** (ADR-0009 action item 1), alongside Parameter Space and Dynamical Plane. A third
  `#schwarz-plot` `.plot` section (inside `main.plots`) now holds the σ canvas + its OWN controls (the φ
  builder moved here, plus a "↩ back to plots" exit); σ mode is a `.workspace.schwarz-active` class modeled
  on the per-plot `expand` layout (hides the two plots + the sidebar and single-columns the σ pane), active
  at all widths. LIFECYCLE: the control-apply → dismiss coupling is **gone** — σ persists across control
  applies; you enter via the sidebar "Schwarz reflection σ…" button (or a σ import) and leave via the pane's
  ↩ / Esc (or by importing a non-σ map, which `importInterchange` now exits σ for). `#JCSSchwarz` restyled
  from an `.overlay` to the pane's primary canvas. NET: a structural guard (`test/schwarzPeerView.test.ts`)
  pins σ-as-peer-section (canvas + builder + exit INSIDE `#schwarz-plot`, NOT `#dyn-plot`); appState's
  DOM-coverage guard stays green (the moved builder fields remain opted out as one-shot tool inputs).
  VERIFIED in the BUILT app (Playwright): on load, the two standard plots; open → the σ pane replaces them
  (deltoid, 512² GPU); an in-pane preset-switch + regenerate stays in σ mode; both ↩ and Esc return to the
  plots; no console errors. Green: typecheck / lint / test, build. **ADR-0009 action item 1 done**;
  remaining: σ-view state serialization (permalink / saved views) + folding the generic parity features
  (colormaps + scale modes, orbit inspection, legend) into the σ controls section.
- **2026-08-08 · branch claude/repository-refactor-project-pg5ktu (ADR-0009 R2 — σ colormaps + scale modes):**
  **the σ pane gets coloring parity with the standard fractals** (ADR-0009 action item 3, first slice): a
  **colormap picker** (viridis / magma / inferno / plasma / cividis / Turbo / grayscale) and an
  **escape-time scale mode** (linear / log / sqrt / discrete / cyclic), both in the σ controls section. σ
  now colors its escape count `n` through the shared **`@cas/gpu` colormap texture** — the field-agnostic
  ramp-building primitive the feature review told us to reuse — NOT CD's byte-frozen procedural-palette
  GLSL. The shader (`render/schwarzGL.ts`) grows `u_colormap` (a 256×1 ramp, bound on TEXTURE1),
  `u_scaleMode` + `u_modK`, and a `computeT(n)` that mirrors QD's σ re-keyed to CD's scale ids; a
  `setColormap(name)` rebuilds the ramp on demand. The palette DATA is app-local
  (`render/schwarzColormaps.ts`: the matplotlib ramps QD's σ already ships), matching the
  `@cas/gpu/colormap` header's fits-vs-stop-tables split — the picker names overlap CD's standard palettes
  so it reads consistently. `main.ts` persists the choice per-device and repaints (rAF-coalesced) on
  change; the two `<select>`s are opted out of `SHARE_IDS` (a σ-view permalink is deferred — same rule as
  the standard `palette`), pinned by appState's DOM-coverage guard. NET: a node test
  (`test/schwarzColormaps.test.ts`, 12 cases) pins the palette tables (valid ramps, working fallback,
  scale ids contiguous with the shader) and the browser test (`test/schwarzGL.browser.test.ts`) is now
  **colormap-aware** — the K-interior center pixel tracks the chosen ramp's t=0 end (viridis `[68,1,84]` →
  turbo → grayscale `[0,0,0]`), the whole frame moves on a colormap switch, and linear vs sqrt recolor the
  n≥1 band. VERIFIED in the BUILT app (Playwright): open σ → deltoid tiling in viridis (48% chromatic) →
  switch to grayscale → same tiling, fully achromatic (0% chroma) → switch scale to sqrt → repaints, no
  console errors; both selects populate from the tables (7 colormaps, 5 scale modes). Green: typecheck /
  lint / test **2340 / 275** (+12 node: colormaps; +1 file) + the 5-test σ browser suite in real WebGL2,
  build. **ADR-0009 action item 3: colormaps + scale modes done**; remaining in item 3: orbit inspection,
  legend + scale bar, precise nav.
- **2026-08-08 · branch claude/repository-refactor-project-pg5ktu (ADR-0009 R3 — σ orbit inspection):**
  **clicking the σ pane now traces that point's σ-orbit** (ADR-0009 item 3, orbit inspection — parity with
  the Dynamical plane's point inspector, which is hidden in σ mode). A click (disambiguated from the pan-
  drag by a 4px travel threshold) computes the orbit w₀ → σ(w₀) → σ²(w₀) → … and draws it over the field:
  a polyline + per-iterate dots + a ringed w₀ marker, coloured by fate in CD's own orbit-preview idiom
  (`render/orbitPreview.ts`): green enters K, orange escapes → ∞, violet lingers (non-escaping), gray
  inverse-failed. A σ-pane readout names the fate honestly (σ is `≈`): "enters K after n steps" / "escapes
  → ∞ (n)" / "non-escaping after n" / "inverse failed (n)", with a "clear". The overlay is redrawn on every
  paint, so it stays pinned to w₀ as the view pans/zooms. NEW pure core in `render/schwarzView.ts`:
  `schwarzOrbitAt` (the trajectory — the SAME loop as `@cas/schwarz`'s `escapeTime`, so the reported fate
  matches the pixel under the click; both now run off ONE hoisted `SCHWARZ_ESCAPE` = {maxIter 48, escapeR
  1e4} the field also uses) + `plotToPixel` (the exact inverse of `pixelToPlot`) + `schwarzOrbitLabel`;
  drawing lives in `render/schwarzOrbitOverlay.ts`. Kept app-local (not in `@cas/schwarz`) per ADR-0007 —
  no second consumer yet. NET: `test/schwarzOrbit.test.ts` (9 cases) pins the tracer to `schwarzEscapeAt`
  over a K/Ω grid (kind + n identical), the chaining invariant (every iterate is a real σ step from the
  last, points[0] = w₀), a fundamental orbit ending inside K, a far point escaping, and `plotToPixel`
  round-tripping `pixelToPlot`. VERIFIED in the BUILT app (Playwright): click the tiling → green orbit
  polyline + ringed seed + "enters K after 2 steps" readout; click the K interior → "in K (n = 0)"; clear
  removes it; no console errors. Green: typecheck / lint / test **2349 / 276** (+9 node: orbit tracer +
  plotToPixel; +1 file), build. **ADR-0009 item 3: + orbit inspection done**; remaining in item 3: legend +
  scale bar, precise nav.
- **2026-08-08 · branch claude/repository-refactor-project-pg5ktu (ADR-0009 R4 — σ legend + scale bar + precise nav):**
  **ADR-0009 action item 3 is now COMPLETE** — the last two parity pieces land, so the σ pane matches the
  standard plots' generic coloring/nav surface. (1) **Legend + scale bar.** A σ legend chip (top-right,
  `#schwarz-legend`) shows the current colormap ramp as a CSS gradient + the flat classification swatches
  (escapes → ∞ / non-escaping / off-branch), REUSING the standard plots' `legend-*` CSS so it reads
  identically; the scale bar REUSES CD's own `drawScaleBar` overlay verbatim (the σ view shares the
  center/zoom convention, span = 2/zoom), drawn on the σ canvas each paint. The three flat colours are
  now exported from `render/schwarzView.ts` (`SCHWARZ_FLAT_RGB`) as the single source the GPU shader, the
  CPU render, and the legend all read. (2) **Precise nav.** Centre-re / centre-im / zoom fields + apply /
  reset in the σ controls (parity with the standard plots' centre/zoom inputs); the fields mirror the live
  view as you drag/zoom (`syncSchwarzViewFields`, skipped while a field is focused) and apply back to it,
  Enter-to-apply. The parse/format is a pure, unit-tested pair (`parseSchwarzViewInput` /
  `formatSchwarzViewFields`) sharing the wheel gesture's zoom clamp (`SCHWARZ_ZOOM_MIN/MAX`). NEW pure
  module `render/schwarzLegend.ts` (`schwarzColormapGradientCss` + `renderSchwarzLegend`). NET:
  `test/schwarzLegend.test.ts` (5 cases: the gradient anchors the palette endpoints, grayscale is
  achromatic, unknown-name fallback, the flat-colour pins vs the shader literals) + 5 new
  `test/schwarzView.test.ts` cases (parse clamps zoom / keeps the fallback on a bad field / round-trips
  format→parse). The two nav-field ids are opted out of `SHARE_IDS` (they mirror the view; the σ-view
  permalink that will carry them is item 2). VERIFIED in the BUILT app (Playwright): the legend shows the
  viridis ramp (`rgb(68,1,84)` → `rgb(253,231,37)`) + 3 swatches and goes achromatic on grayscale; the
  scale bar is drawn (bottom-left white pixels); the nav fields read the default (0, 0, 0.4), apply
  (0.6, −0.3, 1.2) moves the render + mirrors back, reset restores; no console errors. Green: typecheck /
  lint / test **2359 / 277** (+10 node: legend + view parse; +1 file), build. **ADR-0009 item 3 DONE**
  (colormaps + scale modes, orbit inspection, legend + scale bar, precise nav — all four); remaining on
  ADR-0009: item 2 (σ-view serialization / permalink) + item 4 (SIGMA-HANDOFF.md target-shape update).
- **2026-08-08 · branch claude/repository-refactor-project-pg5ktu (ADR-0009 item 2, Stage A — σ permalink + saved views):**
  **a σ view now round-trips through a permalink AND a saved view** (ADR-0009 item 2, first two of its three
  surfaces). The σ peer view is not control-based, so it can't ride `SHARE_IDS`; instead the σ view state —
  the φ recipe (`c`, Laurent `F`, finite-pole `branches`) + the window (centre, zoom) + the coloring
  (colormap, scale) — is layered onto the `AppState` as a single `_sigma` key, exactly as `_z0` / `_grad` /
  `_proj` layer their non-control state. Because permalinks (`shareLink` / `loadFromHash`) AND saved views
  (`save` / `loadSelectedView`) both flow through `readFullState` / `applyFullState`, ONE hook there lights
  up both: `readFullState` emits `_sigma` when σ is showing; `applyFullState`, LAST (after the standard
  plots so exiting σ reveals the right fractal), re-enters σ for a state carrying `_sigma` and leaves σ for
  one without. NEW pure codec `state/schwarzState.ts` (`encodeSigmaState` / `parseSigmaState`) is
  hostile-link hard: it rejects non-finite / malformed input, caps every coefficient list (≤ 64), enforces
  the engine's `|z_j| < 1` pole invariant, clamps zoom, and normalises an unknown colormap/scale to the
  defaults — a corrupt link yields `null` (ignored, stay on the plots), never a hung engine or NaN render.
  `schwarzSession` now carries the φ recipe so it can be serialized; `restoreSchwarzFromState` rebuilds the
  engine, restores the exact window + coloring, and syncs the σ controls. The σ builder / coloring / nav
  input ids stay opted out of `SHARE_IDS` — the σ view travels as `_sigma`, not through those control ids
  (appState's DOM-coverage guard comments updated to say so). NET: `test/schwarzState.test.ts` (11 cases:
  encode→parse round-trips a pole-free + a pole-bearing state; the parser rejects zero/non-finite c, a bad
  F tuple, `|z_j| ≥ 1`, an empty pole A, a missing centre, non-finite zoom, and oversized lists; clamps
  zoom; falls back on an unknown colormap/scale). VERIFIED in the BUILT app (Playwright): build a
  distinctive σ view (turbo + sqrt + centre 0.6−0.3i, zoom 1.2) → "Share link" → open the permalink in a
  fresh page → σ restores identically and the render is **pixel-identical** to the settled original
  (checksum 86040483 = 86040483); save a view, perturb (grayscale + reset), load it back → σ restores; no
  console errors. Green: typecheck / lint / test **2370 / 278** (+11 node: σ-state codec; +1 file), build.
  ADR-0009 item 2: permalink + saved views done; remaining: PNG-metadata export (Stage B).
- **2026-08-08 · branch claude/repository-refactor-project-pg5ktu (ADR-0009 item 2, Stage B — σ PNG export):**
  **ADR-0009 action item 2 is now COMPLETE** — a "Save PNG" button in the σ pane downloads the σ image with
  the reproducible state embedded, the third of item 2's three surfaces. It re-renders the field CLEAN (no
  orbit overlay) at **1024²** on the GPU when available — crisper than the on-screen 512² — with the scale
  bar, falling back to the current canvas on the CPU path, then reuses `hiResExport.downloadCanvas`
  (`toBlob` → `injectPngText` → download). The PNG carries two tEXt chunks: `cdjs:state` = the SAME
  permalink `readFullState` builds (so it now carries `_sigma`), and `cdjs:sigma` = a human-readable,
  ASCII-safe one-line summary (`schwarzStampParams`, pure + tested — PNG tEXt is Latin-1, so no σ/≈/Unicode
  minus). `readFullState`'s `_sigma` layer + the PNG stamp both source the view through one
  `currentSigmaState()` helper. NET: +2 `schwarzState.test.ts` cases pin `schwarzStampParams` (ASCII-only,
  reports c / poles / centre / colormap / scale). VERIFIED in the BUILT app (Playwright): build a
  distinctive σ view (turbo + sqrt + centre 0.6−0.3i, zoom 1.2) → "Save PNG" → the download is a valid
  **1024² PNG** whose metadata contains `cdjs:sigma` (colormap=turbo, scale=sqrt) + `cdjs:state` (`#vs=`),
  and **the embedded permalink, opened fresh, reopens the exact σ view** (turbo/sqrt/zoom 1.2); no console
  errors. Green: typecheck / lint / test **2372 / 278** (+2 node: stamp-params), build. **ADR-0009 item 2
  DONE** (permalink + saved views + PNG metadata — all three surfaces). Remaining on ADR-0009: only item 4
  (SIGMA-HANDOFF.md target-shape update, docs-only).
- **2026-08-08 · branch claude/repository-refactor-project-pg5ktu (ADR-0009 item 4 — docs; ADR-0009 COMPLETE):**
  **docs-only.** Updated [SIGMA-HANDOFF.md](design/SIGMA-HANDOFF.md) so the peer view is the recorded target
  shape (ADR-0009 item 4): its "Target shape — ADR-0009" section now reads **REALIZED (items 1–3)** and states
  the peer view **supersedes the transient S4a `#JCSSchwarz` overlay** (that overlay was the ground-truth
  stepping-stone; the `#schwarz-plot` pane is the shipped shape); the map-specific instruments (rays /
  Böttcher / matings / Julia-set properties / Yoccoz / laminations / the inspector's
  period-multiplier-nucleus math) are called out **explicitly out of scope for σ by nature**; and the
  "Deferred enhancements" list moves items 1–3 (peer-view/mode, coloring, orbit inspection, legend + scale
  bar + precise nav, serialization) to **done**, leaving only **S5** deferred (non-Laurent families on the
  wire, branch-aware continuation through cusps [uncertified — RISKS §3], df64 σ, PQD GPU αth-root).
  DECISIONS.md's ADR-0009 item 4 checked + an "ALL FOUR ACTION ITEMS COMPLETE" note added. **ADR-0009 is now
  fully executed** — σ is a first-class peer view (item 1) with generic-parity coloring / orbit inspection /
  legend / precise nav (item 3) and serializable state across share links / saved views / PNG (item 2),
  recorded as the realized target shape (item 4). No code change; gates unaffected (test-census unchanged at
  278 files). Next σ work, if any, is S5 — a separate, larger effort.
- **2026-08-08 · branch claude/repository-refactor-project-pg5ktu (S5 Phase A1 — σ export options):**
  first slice of the post-ADR-0009 S5 render-polish workstream. The σ "Save PNG" export gains an **export-size
  picker** (512 / 1024 / 2048 / 4096, capped at this GPU's max texture size via `getMaxTextureSize` +
  `disableUnsupportedSizes`) and **scale-bar / include-orbit toggles** — parity with the standard plots'
  export options. The GPU path re-renders clean at the chosen size (single-pass), optionally baking in the
  scale bar and/or the currently-inspected orbit; the CPU fallback keeps the on-screen field. The three
  controls are file properties (not the view), so they join the export-settings opt-out in appState's
  DOM-coverage guard. VERIFIED in the BUILT app (Playwright): export at 2048 → a 2048² PNG; scale-bar OFF/ON →
  bottom-left white pixels 0 → 120; include-orbit ON vs OFF → the PNG changes (orbit baked in); no console
  errors. Green: typecheck / lint / test, build. Branch restarted from the freshly-merged master (#246);
  Phase A stacks on top. Next: A2 (σ hover orbit-preview).
- **2026-08-08 · branch claude/repository-refactor-project-pg5ktu (S5 Phase A2 — σ hover orbit-preview):**
  hovering the σ canvas now **traces a transient σ-orbit under the cursor** (parity with CD's orbit preview),
  drawn faint beneath the bold, pinned click-inspect orbit. `drawSchwarzOrbit` gains a `preview` style
  (lower alpha + thinner strokes + a plain seed dot, no ring); `main.ts` adds a `schwarzHover` orbit that
  the pointermove handler sets (when NOT dragging — off on touch, off during a pan) via the same
  `schwarzOrbitAt` the pinned inspect uses, and `pointerleave` / a fresh pointerdown clear it (rAF-coalesced
  repaint). The hover is view-only — it is never baked into the σ PNG export (only the pinned orbit is).
  Reuses the existing tested tracer, so no new pure logic. VERIFIED in the BUILT app (Playwright): moving
  over a point draws a preview (checksum 22591461 → 22602474), leaving the canvas clears it (back to
  22591461 exactly), and a click still pins the bold orbit; no console errors. Green: typecheck / lint /
  test 75 files, build. Next: A3 (σ image-space coloring).
- **2026-08-08 · branch claude/repository-refactor-project-pg5ktu (S5 Phase A3 — σ image-space tone):**
  the σ pane gains three **image-space tone** controls — **palette rotation** (cycle the colour ramp),
  **gamma**, and **vignette** (radial edge darkening) — parity with the standard fractals' post controls.
  `schwarzGL.ts` gains `u_paletteRotation` / `u_gamma` / `u_vignette`; `main()` is refactored into a
  `fieldColor()` (the classification / escape-ramp lookup, unchanged) plus a small tone post-pass, and
  `fundamentalColor` rotates the colormap coordinate — every tone step is applied **conditionally** (only
  when non-default), so a default view is **byte-identical** to pre-A3. The tone rides the σ view: it is
  serialized into `_sigma` (new `SIGMA_TONE_DEFAULTS`), and `encodeSigmaState` **omits** each tone key when
  it holds its identity default (a plain view's link stays exactly as small as pre-A3); `parseSigmaState`
  **clamps** each into its band (rotation 0–1, gamma 0.2–5, vignette 0–1) and — because tone is cosmetic —
  **defaults** a bad/absent value rather than rejecting the whole (otherwise valid) view. `schwarzStampParams`
  appends `rotation` / `gamma` / `vignette` to the PNG summary line. The three sliders join the σ-coloring
  opt-out in appState's DOM-coverage guard (they travel inside `_sigma`, not as their own share ids), and
  `restoreSchwarzFromState` syncs them from a loaded view. NET: +4 `schwarzState.test.ts` tone cases
  (defaults when the keys are absent [old links]; round-trips a non-default tone AND the encoding omits
  identity keys; clamps out-of-range into band; a non-finite tone value defaults rather than nulls the view)
  + the stamp cases now assert the three tone fields. VERIFIED in the BUILT app (Playwright): each slider
  visibly changes the σ render (gamma 1→2.4 Δ=23, rotation 0→.5 Δ=26, vignette 0→.9 Δ=2.9), and a full toned
  view (rotation .3 / gamma 1.7 / vignette .5) → "Share link" → fresh page restores all three sliders and the
  render is **pixel-identical** (Δ=0.00); the shader stays byte-identical at defaults (`schwarzGL.browser.test.ts`
  5 tests, GPU). Green: typecheck / lint / test 75 files / 764, build. Phase A render-polish shipped (A1
  export options, A2 hover-preview, A3 tone); deferred A3 sub-slices — custom gradient (reuse the gradient
  editor), relief lighting, idle anti-aliasing accumulation — are clearly-scoped follow-ons, not started.
- **2026-08-09 · branch claude/repository-refactor-project-pg5ktu (S5 Phase B1 — σ orbit-stat coloring):**
  the σ pane gains a **field-coloring** picker choosing WHAT the colormap ramp encodes: **escape time**
  (the ADR-0009 default), **orbit trap**, or **stripe average** — the latter two are statistics of the
  σ-orbit σⁿ(w) the engine already produces, so **no new map math** (that is B2's derivative modes). Orbit
  trap adds a **trap-shape** sub-picker (cross · point · origin · real axis · unit circle · integer lattice)
  shown only in trap mode. `schwarzGL.ts` gains `u_colorMode` + `u_trapType`; `main()`'s escape loop
  accumulates the closest trap approach / the stripe running-average **only in the respective mode** and
  dispatches at K-entry via `fundamentalStatColor`, so **escape-time mode is byte-identical to pre-B1**
  (proven — the σ GPU browser test still passes: opaque, K-vs-Ω structure, colormap/scale still drive the
  pixels). CD's **triangle-inequality** average is deliberately *not* ported — it is z²+c-specific (uses
  |c| and the quadratic |zₙ₊₁|/|zₙ|²/|c| relation), meaningless for σ. The mode + shape ride the σ view
  (`_sigma`, new short keys `md`/`tp`, omitted at their `escape`/`cross` defaults so a plain link is
  unchanged from pre-B1; an unknown name normalises to the default like the colormap/scale). The **legend
  stays honest** — its title + end labels now read "Orbit trap · <shape>" (far → near trap) or "Stripe
  average" (low → high) instead of "Escape time", and `schwarzStampParams` reports `colormode=…`. New
  registries (`SCHWARZ_COLOR_MODES` / `SCHWARZ_TRAP_SHAPES` + id lookups) mirror the scale-mode pattern; the
  ids are the shader contract. NET: +8 `schwarzColorModes.test.ts` (id maps contiguous from 0, defaults,
  unknown→0) + 3 `schwarzState.test.ts` cases (default when absent, round-trip + omit-default keys,
  normalise unknown) + stamp assertions; the two selects join the σ-coloring opt-out. VERIFIED in the BUILT
  app (Playwright): each mode visibly changes the render (escape→trap Δ=20, cross→circle Δ=16,
  circle→lattice Δ=9, trap→stripe Δ=13), the trap-shape row gates on trap mode, and a trap view (point)
  round-trips through a permalink — selects restored, row shown, render **pixel-identical** (Δ=0.00). Green:
  typecheck / lint / test 76 files / 775 (+11 node), build; σ GPU browser test 5/5 + shader-compile 11/11.
  Next: B2 (derivative-dependent smooth + distance-estimator modes — needs dσⁿ/dw).
- **2026-08-09 · branch claude/repository-refactor-project-pg5ktu (S5 Phase B2 — σ derivative coloring):**
  two more σ-field color modes, on the **escaping** set (orbits → ∞, currently flat black): **"Smooth
  escape (≈)"** (continuous escape count) and **"Distance estimate (≈)"** (the analytic distance to the
  σ-Julia set). σ is anti-holomorphic (σ = conj∘F∘φ⁻¹), so its per-step local scaling is |σ'(w)| =
  |F'(z)|/|φ'(z)| with z = φ⁻¹(w), and — because each step is (anti)conformal — the n-fold magnitude is the
  product ∏|F'(z_k)|/|φ'(z_k)| = |D(σⁿ)|. **Shared-package math (net-first):** `@cas/schwarz` gains
  `evalFDeriv` (CPU + the GLSL twin in `@cas/schwarz/gpu`); near ∞, F(z) ~ conj(F[d])·z^d with z ~ w/c, so
  σ ~ const·conj(w)^d and the escape degree d (highest nonzero Laurent index) drives the smooth log-degree
  normalisation. DE = ½·|wₙ|·log|wₙ| / |D(σⁿ)|, rendered as CD's `distanceColorAnalytic` does — the smooth
  ramp darkened toward the boundary (a few-pixel-wide σ-Julia outline). Both are **estimates (≈)**: K-entry
  (the tiling) is a discrete event with no smooth interpolation, and D(σⁿ) rides the numerically-inverted
  φ'. Escape-time / trap / stripe and the whole tiling are **unchanged** — only the escaped branch is
  recoloured, and only in modes 3/4 (mode 0 stays byte-identical; the derivative product is accumulated only
  in the distance mode). NET (net-first, shared package first): CPU `evalFDeriv` **finite-difference
  golden** (deltoid hand values F'(z)=z−1/z² + a central-diff cross-check across the deltoid and 5
  pole-bearing domains, so a dropped branch k-factor fails outright); the GLSL structure guard pins
  `evalFDeriv` + its −c/z² leading term; a new **GPU↔CPU parity** test (`runSigmaDerivGLSL`, reading
  |F'|/|φ'| from the probe's .w channel) confirms the shader F' tracks the CPU engine on all 4 corpus
  domains. CD-side: +2 registry cases (smooth 3 / distance 4) + a state round-trip. VERIFIED in the BUILT
  app (Playwright): smooth colours the escaped set (black area 50% → 0%, Δ=25 vs escape), distance adds the
  DE boundary filament (6970 darkened px, 2.7% — the σ-Julia outline), and the mode round-trips through a
  permalink (pixel Δ=0.00). Green: full monorepo — typecheck all workspaces; node tests packages (schwarz
  21, +core/exact/expr/gpu/interchange) + apps (CD 776, correspondences 97, QD 2334); CD build; σ GPU
  browser 5/5; @cas/schwarz browser parity 10/10 (σ + derivative). **Phase B complete** (B1 orbit-stat + B2
  derivative modes). Remaining S5: C (engine/family breadth), D (df64 deep-zoom), E (branch-aware, uncertified).
- **2026-08-09 · branch claude/repository-refactor-project-pg5ktu (S5 Phase C1 — complex leading coefficient c):**
  the σ engine now accepts a **complex leading coefficient c** — a CD-native map QD's real-c family never
  emits. The correctness crux: the Schwarz extension reflects the leading term to **conj(c)/z** (and
  F'(z) to −conj(c)/z²), which equals the pre-C1 c/z ONLY when c is real — so a naive type-widen would be a
  silent factor-of-c σ error. Confirmed against QD's canonical `adaptUnbounded` (it uses `C.scale(z, c)` /
  `{re:c,im:0}` throughout — the family is real-c by construction). `makeUnboundedLaurentSchwarz` widens to
  `c: number | Complex` (**backward-compatible** — every existing real-c caller and the wire keep working;
  a number and its `[c,0]` tuple build the identical engine), normalises once, and threads conj(c) through
  `evalF` / `evalFDeriv` plus complex division through the exterior-root polynomial and the Newton seed. The
  GLSL twin follows: `u_c` becomes a **vec2**, with `cmul` / `cconj(u_c)` / `cdiv` (packPhi / uploadPhi pack
  c as the vec2). CD: `SchwarzPhi.c → Complex`, `buildSchwarzPhi` drops the "c must be real" gate (the form
  parser already reads "1+0.5i"), `_sigma` serialises a real c as a bare number (compact, byte-identical to
  pre-C1 links) and a complex c as `[re,im]` (parse accepts either), and the wire reconstruct
  (`schwarzPhiFromMapSpec`) now passes a complex c through too (the engine handles it; QD still emits real).
  NET (net-first, shared package first): a CPU **boundary-reflection golden** F(z)=conj(φ(z)) on |z|=1 for a
  complex-c domain (the pin a c/z fails) + σ=identity on ∂Ω + round-trip + F' finite-diff + a
  number/[c,0]-equivalence case; GLSL-structure guards on the conj(c) fragments; a **complex-c row added to
  the GPU↔CPU browser parity corpus** (σ AND |F'|/|φ'| match); CD state round-trip (real c stays a bare
  number, complex c a pair) + a `buildSchwarzPhi` complex-c case. VERIFIED in the BUILT app (Playwright):
  entering c = 1+0.5i is accepted (no error) and renders a **distinct** σ field (Δ=19 vs the real-c deltoid
  — conj(c) is live), and the complex-c view round-trips through a permalink **pixel-identical** (Δ=0.00).
  Green: full monorepo — typecheck all workspaces; node tests packages (schwarz 25) + apps (CD 778,
  correspondences 97 [unchanged — backward-compat holds], QD 2334); CD build; σ GPU browser 5/5;
  @cas/schwarz browser parity 12/12 (incl. complex-c σ + derivative). Follow-up (pre-existing, out of scope):
  the one-shot σ-builder fields (c/F/poles) are not re-populated from a restored view — the render + share
  are correct, but "Generate σ" after a restore uses the stale field. Remaining C: C2 (non-Laurent families
  — bounded / PQD / LQD, one PR each).
- **2026-08-09 · branch claude/repository-refactor-project-pg5ktu (S5 Phase C2a — bounded-QD σ engine):**
  first slice of C2 (non-Laurent families): the **bounded-QD** Schwarz engine, lifted from QD's
  `adaptBounded` into `@cas/schwarz` (engine-first, mirroring S2a for the unbounded family). For the
  conformal map φ: {|z|<1} → Ω onto a **bounded** domain, φ(z) = w₀ + Σⱼ Σₖ conj(A_{j,k})·u_j(z)ᵏ, the σ
  reflection is σ(w)=conj(F(φ⁻¹(w))) with F(z)=conj(w₀)+Σⱼ Σₖ A_{j,k}/(z−z_j)ᵏ and φ⁻¹ the **interior**
  branch |z|<1 (cold-seeded Newton near 0). Three differences from unbounded-Laurent: no leading c·z term,
  F carries conj(w₀) instead of the c/z pole, and the inverse is the interior disk branch. **The finite-pole
  branch math is identical to the unbounded family**, so per ADR-0007 (bounded = the second consumer) the
  four branch helpers (branchPhi / branchPhiDeriv / branchF / branchFDeriv) were **extracted** from
  `unbounded-laurent.ts` into a shared `branches.ts`, taking `branches` as a parameter; the unbounded engine
  now imports them and re-exports the shared types, so the package's public surface is unchanged and the
  extraction is **behavior-preserving** (the 19-case unbounded golden stays green before and after). NEW
  `makeBoundedSchwarz(w₀, branches)` + `BoundedSchwarz` exported. NET: a bounded golden — the **unit disk**
  (w₀=0, z_j=0, A=[1] ⇒ φ(z)=z) reflects as the exact inversion **σ(w)=1/conj(w)** (closed-form ground
  truth); hand values on a single-lobe domain; the **boundary reflection F(z)=conj(φ(z)) on |z|=1** (the
  Schwarz-extension pin ⟺ σ=identity on ∂Ω) across the disk + a complex + a two-branch domain; the interior
  round-trip σ(φ(z₀))=conj(F(z₀)); the interior-branch inverse; and an evalFDeriv finite-difference. Green:
  full monorepo — typecheck all workspaces; node tests packages (schwarz **31**, +6 bounded) + apps (CD 778,
  correspondences 97, QD 2334 — all unchanged, the extraction is transparent). This is the CPU engine +
  ground-truth foundation; the bounded family is **not yet wired** into the GPU shader, the interchange
  wire, or CD's render — those are the next C2 slices (C2b GPU GLSL + CPU↔GPU parity; C2c interchange schema
  + QD emit + CD reconstruct; C2d CD render / presets + cross-app golden).
- **2026-08-09 · branch claude/repository-refactor-project-pg5ktu (S5 Phase C2b — bounded-QD GPU σ):**
  the GPU σ shader (`@cas/schwarz/gpu`) gains the **bounded family** via a `u_family` dispatch (0
  unbounded-Laurent · 1 bounded) + a `u_w0` uniform — reintroducing QD's family-dispatch idea that had been
  "specialized away". The family-specific LEADING terms are guarded so the **unbounded path stays
  byte-identical** (each `evalPhi`/`evalPhiDeriv`/`evalF`/`evalFDeriv` is `(u_family==1) ? <bounded> :
  <unchanged unbounded>`, and the branch accumulation order is untouched); bounded gives φ=w₀+branchPhi,
  φ'=branchPhiDeriv, F=conj(w₀)+branchF, F'=branchFDeriv. The **inverse** is family-aware: `newtonSeedFresh`
  seeds the interior branch z≈(w−w₀)/φ'(0) with φ'(0)=Σⱼ conj(A_{j,1}) (computed in-shader), `acceptZ` takes
  |z|<1 (vs |z|>1), the retry ladder's push-out seed becomes a pull-in for bounded, and the tiny-z guard
  (unbounded's c/z pole) is skipped. `packPhi`/`uploadPhi` pack `u_family` + `u_w0`; `SigmaPhi` gains
  `family` + `w0` (and `c`/`F` become optional, defaulting for bounded). CD's shader is **untouched** — it
  packs no `family`, so `u_family=0` and it renders exactly as before (proven: CD σ GPU browser 5/5, the
  deltoid/pole renders unchanged). NET: the node structure guard now asserts the bounded dispatch is present
  (`u_family`, `u_w0`, `conj(w₀)` in F, the interior-branch accept) AND that QD's remaining families still
  did NOT ride along (no LQD/PQD/singular/β — `u_gamma`/`u_lqdBeta`/`u_alpha`/`cexp`/`blaschke`/`cpow`);
  packPhi packs `family`/`w0`; and the **browser CPU↔GPU parity corpus gains three bounded domains** (the
  exact-inversion disk, a single-lobe, a two-branch+centre) checked for both σ and the derivative ratio
  against `makeBoundedSchwarz` — **18/18**, and the unbounded rows (deltoid / poles / complex-c) confirm the
  byte-identity. Parity TOL loosened 1e-6→3e-6 to cover a bounded single-lobe interior sample that sits near
  F's pole (|σ|≈2.5 ⇒ ~1.5e-6 absolute = ~6e-7 relative, still float32 ε; a gross bug lands ≫1e-5). Green:
  full monorepo — typecheck all workspaces; node (schwarz **32**; CD 778, correspondences 97, QD 2334
  unchanged). Next: C2c (interchange bounded schema + QD emit + CD reconstruct), C2d (CD render/presets +
  cross-app golden).
- **2026-08-09 · branch claude/repository-refactor-project-pg5ktu (S5 Phase C2c — bounded-QD σ interchange
  hand-off, both ends):** the bounded family crosses the **wire** — QD emits it, CD reconstructs it, and a
  cross-app golden pins the producer↔consumer contract. **interchange 1.3.0:** a new `BoundedMap`
  (`form:"bounded"`: w₀ + optional finite-pole `branches`) joins the `SchwarzMap.phi` union, deliberately
  **NOT** a `MapSpec` member — a bounded φ is σ-only (its σ has a numerical inverse; it is never an
  expr-compilable standalone map), so keeping it off `MapSpec` avoids rippling into `mapSpecToExpr`. The
  validator's `schwarz` case validates a bounded φ **inline** (w₀ complex + branches length-capped by
  `isBranchArray`) rather than recursing through `isMapSpec`. VERSION 1.2.0→1.3.0; per the schema's own
  "each MINOR bump moves every stamped export to the new label" rule the **three Laurent goldens were
  re-stamped** to 1.3.0 (byte-identical bar the embedded version — they use none of the new vocabulary),
  and a **new bounded golden** added: a single-lobe QD (w₀=0, one branch z_j=0.3, A=[0.5], `disk:"D"`) with
  frozen ground truth w=φ(½)=**5/17**, σ(w)=conj(F(½))=conj(0.5/0.2)=**2.5**. **QD emit:** a σ-only
  `boundedClassicalMapSpec` helper (kept **out** of `phiToMapSpec`, so a bounded map never rides the φ /
  quadrature-domain hand-off — it is not a MapSpec) detects the bounded-CLASSICAL family by its **unset
  `phi.family`** tag (LQD/PQD/rational-bounded all tag it — schwarz-common's family dispatch, "gotcha #1");
  `buildSigmaEnvelope` emits `form:"bounded"`, `disk:"D"` for it, and the `explain*` prose is corrected —
  bounded-classical now σ-exports (no refusal), a **weighted** (log-/power-) bounded QD earns the "bounded +
  weighted, not reconstructable yet" reason, and φ-export points bounded users at "Export σ". **CD
  reconstruct:** `schwarzPhiFromMapSpec` returns a `family`-tagged coeffs object (unbounded reads c/F,
  bounded reads w₀; unused slots zero-filled) and `schwarzEngineFromMapSpec` **dispatches** — bounded →
  `makeBoundedSchwarz` (interior branch), Laurent → `makeUnboundedLaurentSchwarz` (exterior); the union
  return type flows unchanged through the render/orbit helpers (both engines share the evaluator surface).
  The live **import path declines the bounded render honestly** ("reconstruction ready, interior-domain
  render coming next") — the σ field paint is exterior-oriented (Ω is OUTSIDE ∂Ω for the Laurent family; a
  bounded Ω is INSIDE) and the GPU family switch isn't wired, so rather than paint a bounded domain
  inside-out, the interactive view waits for C2d. NET (producer↔consumer meet on the golden): QD's
  `exportSigmaLink` reproduces the bounded golden **byte-for-byte** (+ a `form:"bounded"`/`disk:"D"` shape
  assertion, + a validate pass, + weighted-bounded and φ-path-null negatives); CD decodes the **same bytes**
  and reconstructs σ(5/17)=**2.5** through its real import path (decode → envelopeToMapSpec →
  schwarzEngineFromMapSpec → .sigma), the **interior** branch — the exterior-branch engine would miss it;
  the interchange seatbelt gains a bounded-φ validator case (accepts bounded + branchless, rejects missing
  w₀ / bad branches / over-cap). Latent fix surfaced by the package rebuild: CD's `schwarzGL.setPhi` read
  `phi.F` (optional on `SigmaPhi` since C2b) unguarded — guarded (a bounded φ has no Laurent tail, so the
  escape-degree default d=2 stands). Green: full monorepo — **typecheck** all workspaces + **lint**
  (eslint + dep-cruiser) + **2410 tests** (interchange **35**, +1 bounded validator; QD schwarz-export +4
  bounded-emit incl. the byte golden, schwarz-ui reason-string updated; CD importMap **11**, +1 bounded
  reconstruct ground-truth). The bounded family is now emit + reconstruct + wire-validated end to end; the
  remaining slice is **C2d** — CD's interior-Ω render (GPU `family` forward + the "Ω is inside ∂Ω" escape
  orientation) + bounded presets, which makes it user-visible.
