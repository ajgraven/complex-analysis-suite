# Suite-wide review — 2026-08 — PROGRESS TRACKER

> **This file is the resumable source of truth.** If the session is interrupted (usage
> limit, crash), a fresh context should read this file first, check which
> `findings/*.md` exist and are committed, and continue from the first unchecked box.

## Task

Comprehensive review of the whole `complex-analysis-suite` for: **(1) errors**,
**(2) stale documentation**, **(3) consolidation candidates for the shared `@cas/*`
libraries.** Requested 2026-08-17 by andrew@graven.com.

### Operating decisions (from clarifying questions)

- **Action posture: Report + safe fixes.** Agents produce findings only (read-only).
  The orchestrator afterward applies *only low-risk* fixes (typos, stale doc lines,
  obvious bugs already covered by tests). Anything substantive / refactor-shaped stays
  **report-only** for the user to triage.
- **Error depth: Deep + domain-math.** Scrutinize the numerical methods themselves
  (convergence, branch selection, quadrature, conformal-map correctness, convention
  factors π / 2πi, honesty labels `=`/`≤`/`≈`), not just software engineering.
- **Consolidation: include speculative.** Flag real ADR-0007 duplication (≥2 consumers)
  **and** forward-looking single-consumer opportunities, each clearly labeled.

### Guardrails (from CLAUDE.md)

- Core packages are **convention-neutral** (no π / 2πi constants) — a silent factor error
  is a CRITICAL-class bug. Honest labeling of results is a guardrail. One-directional deps
  (packages import downward; apps import packages; no app imports another app; no cycles).

### Prior art (do NOT re-plow; cross-reference instead)

- `docs/review/CODEBASE_REVIEW_2026-07.md` (114 KB) + `docs/review/RAW_FINDINGS_2026-07.md`
  (464 KB) — a comprehensive review from **2026-07**. Agents should grep these for their
  area to avoid re-reporting already-known/fixed issues, and to flag **regressions**.
- Churn since that review: PRs #268–#282 (Faber Transform + `@cas/faber`, exterior
  Schwarz–Christoffel, Argument Principle phases 2–4, riemann-map redesign). These newest
  areas deserve the most scrutiny.

## Health baseline (orchestrator-run, background) — ✅ ALL GREEN

Logs in `health/`. `node_modules` was absent at start → script ran `pnpm install` first.
**Result: every CI gate passes.** So any real errors the review finds are *latent* (not
caught by the current suite) — test-gap findings are therefore valuable.

- [x] `00-install` — exit 0 (frozen lockfile OK)
- [x] `01-typecheck` — exit 0 (22s)
- [x] `02-lint` — exit 0 (29s; eslint + dep:check + per-pkg/app)
- [x] `03-test` — exit 0 (104s): **375 test files, 3137 tests, all passing**; census gate OK
      (17 projects; QD 159 / CD 83 / plotter 18 / corr 17 / expr 16 / arg-principle 14 /
      riemann-map 12 / conformal 11 / schwarz 8 / faber-transform 8 / faber 7 / core 7 /
      gpu 6 / dynamics 3 / exact 3 / interchange 2 / export 1). Worker-unavailable lines are
      expected test-env stubs (main-thread fallback), not failures.
- [x] `04-build` — exit 0 (18s; apps + check-built-artifacts)
- [ ] Health summary folded into REPORT.md

## Review agents (each writes ONE file to `findings/`, read-only otherwise)

Sizes (source lines) noted to calibrate depth. Mega-apps get strategic (not exhaustive) reads.

### Batch 1 (heavy math packages + prime consumers + docs)
- [ ] **01 ALG** — `@cas/core` (1777) + `@cas/exact` (1318) → `findings/01-core-exact.md`
- [ ] **02 EXPR** — `@cas/expr` (3881) + `@cas/interchange` (1155) → `findings/02-expr-interchange.md`
- [ ] **03 CONF** — `@cas/conformal` (2503) + `apps/riemann-map` (3615) → `findings/03-conformal-riemann-map.md`
- [ ] **04 FABER** — `@cas/faber` (1307) + `apps/faber-transform` (3680) → `findings/04-faber.md`
- [ ] **05 CD** — `apps/complex-dynamics` (34564) + `@cas/dynamics` (998) → `findings/05-complex-dynamics-dynamics.md`
- [ ] **09 DOCS** — all docs vs code/status, cross-ref prior review → `findings/09-documentation-staleness.md`

### Batch 2 (remaining apps + cross-cutting consolidation)
- [ ] **06 CORR** — `apps/correspondences` (4270) + `@cas/schwarz` (3250) → `findings/06-correspondences-schwarz.md`
- [ ] **07 QD** — `apps/quadrature-domains` (85266, strategic) → `findings/07-quadrature-domains.md`
- [ ] **08 RENDER** — `apps/complex-function-plotter` (7312) + `apps/argument-principle` (5319) + `@cas/gpu` (2115) + `@cas/export` (230) + `apps/launcher` (8) → `findings/08-render-group.md`
- [ ] **10 CONSOL** — cross-cutting duplication/consolidation hunt (real + speculative) → `findings/10-consolidation-duplication.md`

## Synthesis & fixes (orchestrator, after both batches)

- [ ] Read all `findings/*.md` + health logs
- [ ] Write `REPORT.md` (executive summary, severity-ranked findings, consolidation roadmap)
- [ ] Apply **safe fixes only** (doc-only / typo / test-covered obvious bug); list each in REPORT
- [ ] Commit + push; report back to user (report-only items await user triage)

## Findings-file format (each agent follows)

Per finding: `### [SEVERITY] title` then bullets — Area · Location `path:line` · Type
(bug|numerical|convention|stale-doc|consolidation|test-gap|style) · Confidence (high|med|low)
· Fix-safety (safe-now|needs-review) · Evidence · Why it matters · Recommendation.
Severity ∈ CRITICAL/HIGH/MEDIUM/LOW/NIT. End each file with a "Coverage" note (what was and
was NOT examined).

## Log

- 2026-08-17: Scaffolding created; health baseline + Batch 1 launched.
