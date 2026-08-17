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

### Batch 1 (heavy math packages + prime consumers + docs) — ✅ ALL COMMITTED
- [x] **01 ALG** — `@cas/core` + `@cas/exact` → `findings/01-core-exact.md` — **1 HIGH** (Durand–Kerner still certifies NaN roots), 1 MED, 3 LOW, 1 NIT
- [x] **02 EXPR** — `@cas/expr` + `@cas/interchange` → `findings/02-expr-interchange.md` — 2 MED, 5 LOW, 1 NIT (no π/2πi leak; keystone sound)
- [x] **03 CONF** — `@cas/conformal` + `apps/riemann-map` → `findings/03-conformal-riemann-map.md` — 3 MED, 2 LOW, 3 NIT (engine validated vs closed forms)
- [x] **04 FABER** — `@cas/faber` + `apps/faber-transform` → `findings/04-faber.md` — 2 MED, 4 LOW, 3 NIT (recurrence + Q_{n,m} branch verified)
- [x] **05 CD** — `apps/complex-dynamics` + `@cas/dynamics` → `findings/05-complex-dynamics-dynamics.md` — 1 MED, 3 LOW, 3 NIT (core math re-derived, sound)
- [x] **09 DOCS** — all docs vs code/status → `findings/09-documentation-staleness.md` — **1 HIGH** (σ hand-off "awaiting review" but shipped), 5 MED, 5 LOW, 2 NIT

**Cross-cutting themes already visible (for REPORT synthesis):**
- **GPU-uniform-cap vs CPU-limit mismatch** — recurs independently: CD σ GPU caps orbit at 512 iters vs 4096 (finding 05-#1); Faber GPU caps series at degree 47 vs 128 (finding 04-#1). Batch-2 RENDER (`@cas/gpu`) should look for more; candidate for a shared cap-negotiation note.
- **Stale package READMEs** — conformal README lists shipped exterior-SC as "deferred" (03 + 09 corroborate); faber README omits M3 surface; expr README stale.
- **`=` exactness over-claims** where a numerical root-find backs an "exact" label (faber 04-#3; ties to honesty guardrail).
- **Duplicated small primitives** — expr constExp/constReal (02-#2); conformal corner-pole clustering triplicated (03-#2); CD matingEngine mul/div (05-#4). Feed to Batch-2 CONSOL.

### Batch 2 (remaining apps + cross-cutting consolidation) — ✅ ALL COMMITTED
- [x] **06 CORR** — `apps/correspondences` + `@cas/schwarz` → `findings/06-correspondences-schwarz.md` — 1 MED, 3 LOW, 1 NIT (σ math sound; √2 comment; CD-512 cap does NOT reproduce)
- [x] **07 QD** — `apps/quadrature-domains` (strategic) → `findings/07-quadrature-domains.md` — 3 MED, 4 LOW, 1 NIT (export convention correct; dual-M₀; anti-holo Newton; @cas/schwarz dup)
- [x] **08 RENDER** — plotter + argument-principle + `@cas/gpu` + `@cas/export` → `findings/08-render-group.md` — 2 MED, 5 LOW, 3 NIT (AP winding math correct; path-cap gap; plotter benign)
- [x] **10 CONSOL** — cross-cutting duplication/consolidation → `findings/10-consolidation-duplication.md` — 3 MED, 3 LOW (pointInPolygon ×5; rootsMonic ×3; SC cluster ×3)

## Synthesis & fixes (orchestrator, after both batches) — ✅ DONE

- [x] Read all `findings/*.md` + health logs
- [x] Write `REPORT.md` (executive summary, severity-ranked findings, consolidation roadmap)
- [x] Apply **safe fixes only** (31 edits / 16 files; doc + comment + honest-labeling) — listed in REPORT
- [x] Verify gates green after fixes (`health/verify-*.log`)
- [x] Commit + push; report back to user (report-only items await user triage)

## Findings-file format (each agent follows)

Per finding: `### [SEVERITY] title` then bullets — Area · Location `path:line` · Type
(bug|numerical|convention|stale-doc|consolidation|test-gap|style) · Confidence (high|med|low)
· Fix-safety (safe-now|needs-review) · Evidence · Why it matters · Recommendation.
Severity ∈ CRITICAL/HIGH/MEDIUM/LOW/NIT. End each file with a "Coverage" note (what was and
was NOT examined).

## Follow-up work (post-review, user-directed)

Remaining substantive items from REPORT.md, being worked in order at the user's direction.

- [x] **Durand–Kerner NaN fix (HIGH)** — `packages/core/src/durand-kerner.ts:126` now
      `maxDelta = Math.max(maxDelta, dm)` (NaN-sticky; identical on the finite path). New regression
      test in `packages/core/test/durand-kerner.test.ts` pins the mixed NaN + finite-dm sweep;
      negative-control-verified (fails pre-fix, passes post-fix); full gates green.
- [x] **Consolidation #1 — `pointInPolygon` → `@cas/core/geometry.ts`** (unblocks #3): new
      `geometry.ts` (canonical even-odd test, bit-identical to the blessed `@cas/schwarz` body) +
      golden `test/geometry.test.ts`; 4 TS copies removed — `@cas/schwarz` (re-exports from core, so
      CD + Correspondences are untouched), `@cas/conformal/scMap.ts`, `riemann-map/domains.ts`,
      `argument-principle/contour.ts` (both re-export). QD's `{re,im}` variant left per ADR-0008.
- [ ] Consolidation #2 — `rootsMonic` (monic-Horner + DK seed/certify) ×3 → `@cas/core`
- [ ] Consolidation #3 — SC corner-cluster ×3 → `@cas/conformal` (rides #1)
- [ ] ADR-0020 duplicate renumber + ~10 inbound-ref sweep
- [ ] GPU-cap parity fixes (CD σ 512→maxIter; Faber degree-47→N clamp) — each with a CPU↔GPU test
- [ ] QD `findCycles` anti-holomorphic Newton + ≈ caveat
- [ ] AP freehand-path vertex cap
- [ ] Interchange nested-payload validation (`sourceDomain`/`hData`/`tilingSetHint`)
- [ ] Bulk strip of QD's 81 stale `twin of X.js` headers (mechanical)
- [ ] (optional) remaining LOW numerical test-gaps + M₀ relabel + QD↔`@cas/schwarz` rewire ADR

## Log

- 2026-08-17: Scaffolding created; health baseline (green) + 10 review agents (2 batches) run;
  findings committed per-area; REPORT.md synthesized; 31 safe stale-doc/comment fixes applied
  (gates green).
- 2026-08-17: Follow-up — Durand–Kerner NaN certification fixed in `@cas/core` + regression test
  (negative-control-verified).
