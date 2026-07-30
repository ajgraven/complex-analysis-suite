# ASSESSMENT — architecture map & findings

> Living document, written during Phase B (Review). Every structural finding carries file:line
> evidence, verified against the code before being recorded. Resumable at subsystem granularity.

## 0. Preliminary breadth snapshot (Phase A orientation — superseded by the full breadth pass in §1)
Scale (raw line counts over tracked source; cloc-style refinement pending in §1):

| Area | files | code LOC | test LOC |
|---|---|---|---|
| packages/core | 17 | 808 | 566 |
| packages/exact | 15 | 865 | 453 |
| packages/expr | 27 | 1880 | 910 |
| packages/gpu | 21 | 1041 | 521 |
| packages/interchange | 15 | 562 | 277 |
| apps/complex-dynamics (TS) | 158 | 19918 | 8281 |
| apps/correspondences (TS) | 43 | 2899 | 1582 |
| apps/quadrature-domains (.mjs, untyped) | 268 | 57673 | 23714 |
| apps/launcher | 4 | 8 | 0 |

Most-churned files (all history): `apps/quadrature-domains/app/algebra/algebra-ui.mjs` (20×),
`app/style.css` (12), `app/index.html` (8), `app/algebra/algebra-store.mjs` (8),
`app/algebra/prove-plan.mjs` (7), `apps/complex-dynamics/src/main.ts` (7).
**QD is the center of gravity by both size and churn.**

Prior review corpus (context, NOT to re-derive): `docs/review/CODEBASE_REVIEW_2026-07.md`
(112 findings; ~48 medium/low still open) and `docs/algebra-review/*` (closed algebra-maturity engagement).

## 1. Architecture map (breadth pass)
_Pending — directory LOC (cloc/tokei), import/dependency graph + cycles (madge/dependency-cruiser),
change frequency, entry points & build targets, package boundaries & public exports, test-to-source ratio._

## 2. Prioritized subsystems for depth review (and what is deliberately NOT reviewed)
_Pending._

## 3. Depth findings (per subsystem)
_Pending — traced execution paths end-to-end; lenses: structure / clarity / correctness-risk /
verifiability / developer-experience. Report only what evidence supports._

## 4. Systemic patterns (across subsystems)
_Pending._
