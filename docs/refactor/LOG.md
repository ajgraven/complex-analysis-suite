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
