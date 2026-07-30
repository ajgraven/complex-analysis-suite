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
