# Comprehensive suite re-review — 2026-08-23 — PROGRESS TRACKER

> **This file is the resumable source of truth.** If the session is interrupted (usage
> limit, crash, container loss), a fresh context should read this file first, check which
> `findings/*.md` exist, read the health logs, and continue from the first unchecked box.

## Task

Extremely thorough comprehensive review of the whole `complex-analysis-suite` for: bugs,
errors, performance issues, stale docs, duplications, and any standard-code-review concern.
Evaluate consolidation opportunities into the shared `@cas/*` library and performance
enhancements. Requested 2026-08-23 by andrew@graven.com.

### Operating decisions (from clarifying questions)

- **Posture: REPORT ONLY.** No code changes. Deliver a prioritized findings + proposed-fixes
  document. (User decides what to implement later.)
- **Verification: RUN FULL TOOLCHAIN.** install + typecheck + lint + test + dep:check + build,
  so findings are grounded in real output. (Logs in `health/`.)
- **Deliverable: committed to branch.** This progress log + the final REPORT.md are markdown
  on `claude/comprehensive-codebase-review-8g26az`, pushed so they survive container loss.
- **Focus: cover everything evenly, EXTRA WEIGHT on consolidation & performance.**

### Critical context — this is a RE-review

A full suite-wide review landed **2026-08-17** (PR #283) in `docs/review/2026-08-suite-review/`.
Most of its ~80 findings were fixed (DK-NaN, 3 consolidations, GPU-cap parity, findCycles
Jacobian, freehand cap, interchange nested validation, M₀ relabel, ADR-0026). **We must not
re-report fixed issues.** Priorities this round:
1. **Unreviewed churn since Aug 17** — PRs #284–#296 (perf(cd) render #294, perf(qd)
   live-solver #292, faber editing #293/#295/#296, riemann-map SC studio #285/#286/#288,
   QD solver #287/#289/#290). Perf rewrites of hot loops = #1 place for latent regressions.
2. **Coverage gaps the prior review skipped** — QD algebra tab + sym-core Gröbner/FGLM +
   per-family solver kernels; CD df64 (`glPlot`/`bla`) + Julia/σ overlays; algebra docs.
3. **New issues anywhere**, weighted to consolidation & perf.

Shared reviewer brief: `AGENT_BRIEF.md` (in this dir).

## Health baseline (orchestrator-run, background) — ✅ ALL GREEN (HEAD 300c775)

Logs in `health/`. `pnpm install` (frozen lockfile) succeeded. Every CI gate passes ⇒ all
findings below are *latent* (not caught by the current suite).

- [x] `01-typecheck` — exit 0
- [x] `02-lint` — exit 0 (eslint + dep:check + per-pkg/app)
- [x] `03-test` — exit 0: **383 test files / 3197 tests passing** (~112s); census gate OK (17
      projects; QD 162 / CD 83 / plotter 18 / corr 17 / expr 16 / arg-principle 15 / RM 12 /
      conformal 11 / faber-transform 10 / core 9 / schwarz 8 / faber 7 / gpu 6 / dynamics 3 /
      exact 3 / interchange 2 / export 1). jsdom getContext/worker-unavailable lines are
      expected test-env stubs, not failures.
- [x] `04-build` — exit 0 (apps + check-built-artifacts)
- [ ] Baseline result folded into REPORT.md

## Review agents (each writes ONE file to `findings/`, read-only otherwise)

### Batch 1 — churn + coverage-gap hotspots
- [ ] **A1 CD-RENDER** — `apps/complex-dynamics/src/render/*` perf rewrite (#294) → `findings/A1-cd-render-perf.md`
- [ ] **A2 QD-SOLVER** — QD live-solver perf (#292) + solvers/workers/ui-solve → `findings/A2-qd-solver-perf.md`
- [ ] **A3 QD-ALGEBRA** — `sym/sym-core.mjs` + `algebra/*` (coverage gap) → `findings/A3-qd-algebra-symcore.md`
- [ ] **A4 FABER** — `apps/faber-transform/*` + `@cas/faber` churn (#293/#295/#296) → `findings/A4-faber.md`
- [ ] **A5 RIEMANN-SC** — `apps/riemann-map/*` + `@cas/conformal` churn (#285/#286/#288) → `findings/A5-riemann-sc.md`
- [ ] **A6 CORE-PKGS** — `@cas/core` `@cas/exact` `@cas/expr` `@cas/interchange` fresh pass → `findings/A6-core-pkgs.md`

### Batch 2 — remaining apps/packages + cross-cutting
- [ ] **A7 CONSOLIDATION** — whole-suite duplication + perf anti-patterns + verify landed consolidations → `findings/A7-consolidation-perf.md`
- [ ] **A8 CD-INTERNALS** — CD df64 (`glPlot`/`bla`) + Julia/σ overlays + `@cas/dynamics` + state/ui (coverage gap) → `findings/A8-cd-internals.md`
- [ ] **A9 CORR-SCHWARZ-GPU** — `apps/correspondences` + `@cas/schwarz` + `@cas/gpu` + `@cas/export` → `findings/A9-corr-schwarz-gpu.md`
- [ ] **A10 AP-PLOTTER** — `apps/argument-principle` + `apps/complex-function-plotter` → `findings/A10-ap-plotter.md`
- [ ] **A11 DOCS** — all docs incl. algebra-review/* + ADR bodies vs current code → `findings/A11-docs.md`

## Synthesis & report (orchestrator, after batches)
- [ ] Read all `findings/*.md` + health logs
- [ ] Write `REPORT.md` (exec summary, severity-ranked findings, consolidation roadmap, perf roadmap)
- [ ] Commit + push; present prioritized list to user

## Findings-file format
Per finding: `### [SEVERITY] title` then bullets — Area · Location `path:line` · Type
(bug|numerical|convention|perf|stale-doc|consolidation|test-gap|style) · Confidence · Fix-safety
· Evidence · Why it matters · Recommendation. Severity ∈ CRITICAL/HIGH/MEDIUM/LOW/NIT. End with Coverage.

## Log
- 2026-08-23: Scaffolding created. Health baseline started (background). Read prior review
  (PR #283) to scope this as a re-review. Churn since Aug 17 mapped (PRs #284–#296). Agent
  brief written. Launching review agents.
