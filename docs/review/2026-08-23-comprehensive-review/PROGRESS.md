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
- [x] **A2 QD-SOLVER** — QD live-solver perf (#292) + solvers/workers/ui-solve → `findings/A2-qd-solver-perf.md` — 1 MED (live-vs-authoritative RACE: live lane never invalidated at drag-end; late live solve can land after authoritative settle ⇒ final state stuck at method='live' 96-sample verdict + 160-sample boundary instead of 500; "authoritative is final writer" holds only by timing), 2 NIT. All four S4 numeric rewrites re-derived CORRECT; no π/2πi leak. Gap: per-family kernels not touched by S4.
- [x] **A3 QD-ALGEBRA** — `sym/sym-core.mjs` + `algebra/*` (coverage gap) → `findings/A3-qd-algebra-symcore.md` — 1 MED (Berlekamp–Zassenhaus uncapped 2ʳ recombination, main-thread reachable), 2 LOW. Core exceptionally solid; no new duplication.
- [x] **A4 FABER** — `apps/faber-transform/*` + `@cas/faber` churn (#293/#295/#296) → `findings/A4-faber.md` — 4 LOW (corner-image comment fix only partial: 6 sites incl. weighted.ts:50 still stale; in-panel drag skips toCCW normalization → spurious ⚠; residual guard silent no-op on degraded fits), 1 NIT. #296 wrong-vertex fix verified CORRECT & COMPLETE; GPU/CPU cap parity intact; math sound.
- [x] **A5 RIEMANN-SC** — `apps/riemann-map/*` + `@cas/conformal` churn (#285/#286/#288) → `findings/A5-riemann-sc.md` — 4 LOW ("machine precision" prose vs nGaussLegendre:12 solve; Ω→𝔻 hover discards inverseWithStatus converged/residual → silent wrong preimage outside Ω under "exact" label; no simple-polygon check on dragged shapes; exterior-map φ~C·z sign comment should be −C·z), 4 NIT. Editor NOT subject to #296 bug (interior engine preserves order). cornerClustering consolidation complete.
- [x] **A6 CORE-PKGS** — `@cas/core` `@cas/exact` `@cas/expr` `@cas/interchange` fresh pass → `findings/A6-core-pkgs.md` — 2 MED (new GLSL peephole has no in-package codegen test; constExp/constReal duplicate const-folder still not hoisted), 5 LOW, 2 NIT. Keystone solid; all prior fixes correctly landed; ADR-0006 neutrality holds.

### Batch 2 — remaining apps/packages + cross-cutting
- [ ] **A7 CONSOLIDATION** — whole-suite duplication + perf anti-patterns + verify landed consolidations → `findings/A7-consolidation-perf.md`
- [ ] **A8 CD-INTERNALS** — CD df64 (`glPlot`/`bla`) + Julia/σ overlays + `@cas/dynamics` + state/ui (coverage gap) → `findings/A8-cd-internals.md`
- [x] **A9 CORR-SCHWARZ-GPU** — `apps/correspondences` + `@cas/schwarz` + `@cas/gpu` + `@cas/export` → `findings/A9-corr-schwarz-gpu.md` — 2 LOW (corr README:93 stale "σ engine in deltoid.ts" — moved to @cas/schwarz; dead DEFAULT_DENSITY.maxDepth=18 behind maxNodes cap), 2 NIT (sqrt-free peephole fp32 overflow at k>1.8e19, unreachable; maxIter 48 vs 64 two-defaults). All churn (2 cabs2 GLSL adds) verified correct; prior findings fixed; PNG tEXt injection-safe; schwarz GPU shader throws not clamps.
- [x] **A10 AP-PLOTTER** — `apps/argument-principle` + `apps/complex-function-plotter` → `findings/A10-ap-plotter.md` — 1 MED (mapSpecToExpr/envelopeToMapSpec triplicated CD+plotter+AP and ALREADY DIVERGED — CD copy missing empty-denominator guard + pole-Laurent refusal ⇒ CD yields NaN/silent-wrong where others fail loudly; real ADR-0007 case), 2 LOW (B4 analytic readout no reliability gate; per-frame cumulativeArg recompute), 2 NIT. Cores unchanged since prior review.
- [x] **A11 DOCS** — all docs incl. algebra-review/* + ADR bodies vs current code → `findings/A11-docs.md` — 3 LOW (README:159 ADR cap "…0024" should be …0026; riemann-map exterior-disk gallery #288 undocumented everywhere + RM has no README; refactor/STATE.md only partially current), 2 NIT (broken LOG.md link; ALGEBRA_MODULE.md import path drift). Docs in very good shape; algebra docs well-maintained; ADR-log integrity repaired.

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
