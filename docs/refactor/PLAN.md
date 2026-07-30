# PLAN — refactor of complex-analysis-suite

> Version: **v0 (pre-plan)** — run configuration, requirements, constraints, and Phase A answers only.
> The architectural plan proper (findings, target architecture, staged roadmap) is written as **v1**
> at the end of Phase C. Bump `v<n>` on every substantive revision.
> **Approval token required before any implementation: `APPROVED: PLAN.md v<n>`.** Agreement, praise,
> or silence is not approval.

## 1. Run configuration
| Setting | Value |
|---|---|
| Integration branch | `refactor/main`, cut from `master` @ b1e3004. Never commit to `master`. |
| Stage branches | `refactor/<stage-id>-<slug>`, cut from `refactor/main`; one PR each → `refactor/main`; never self-merge. |
| Docs directory | `docs/refactor/` |
| Green-bar commands | `pnpm build` · `pnpm typecheck` · `pnpm lint` · `pnpm test`  (browser: `pnpm test:browser`) |
| Baseline (2026-07-30) | all green; 206 files / 2017 tests; no pre-existing failures |
| Approval granularity | Explicit token `APPROVED: PLAN.md v<n>`; each stage ends with an open PR I do not merge |
| Numerical equivalence | Tolerance-based; bit-exactness NOT required and not pursued |
| Visual output | In scope; small rendering diffs acceptable, structural diffs are not (prompt §2.2) |
| Repository scale | ~616 tracked files; ~122k total / ~84k non-test code lines (corrects the prompt's "~30k") |
| Out of scope / off-limits (default) | `@cas/exact` ℚ(i) kernel + QD `sym-core.mjs`; shader source (flag/isolate per §2.2); interchange format + share-link URL formats; deploy/CI workflows — each unless a stage explicitly needs it with approval |

## 2. Goals (priority order)
Maintainability & extensibility → conceptual clarity & readability → reliability & testability →
architectural coherence → debuggability → long-term development velocity. Speed is not a goal.

## 3. Constraints
- CLAUDE.md **ADRs 0001–0008 are locked** (monorepo/pnpm; TS common language, apps typed
  incrementally leaves-first, full typing NOT a goal; Vite both apps; `expr`+`interchange` keystone;
  convention-neutral core — no π/2πi constants in `@cas/core`; demand-driven extraction on the
  second-consumer rule; `@cas/*` internal; separate apps + launcher, no unified shell; correspondence
  a separate app; Node 22; auto-deploy on `master`). Supersede only via a new ADR, with approval.
- Behavior-preserving by default. Preserve each app's share-link URL formats and the interchange format.
- Honest labeling of computed results (`=` exact / `≤` rigorous bound / `≈` estimate).
- One dependency direction: packages import downward only; apps import packages; no app imports another
  app; no cycles.

## 4. Phase A — questions & answers (2026-07-30)
1. **Branch model** → *Follow the prompt:* `refactor/main` + `refactor/<id>` stage branches, one PR
   each, I never merge. (Session's designated `claude/…` branch superseded for this engagement, with
   the user's explicit approval.)
2. **Review altitude vs. the July-2026 review** → *Fresh architectural review.* Do NOT re-derive the
   112 line findings; read the prior reviews to verify against / avoid duplication; fold in only the
   ~48 remaining findings where they intersect structural work.
3. **Top pain points** → *QD internal structure; testability & dev loop; clarity & onboarding.*
   Cross-app `@cas/*` extraction was **not** selected → de-prioritize new extractions unless they
   fall out naturally from structural work.
4. **Appetite** → *Deeper redesign where warranted* — larger diffs / more regression risk acceptable
   when justified, still ADR-bound and behavior-preserving unless separately approved.

**Standing assumptions (proceed on these unless redirected):** no QD→TS migration (ADR-0002); local
green bar is source of truth (CI may be unreliable); existing suite is the safety net + characterization
tests added before each refactor; the ~128s QD headless node-suite is left structurally alone unless a
stage targets it with approval; off-limits list per §1.

## 5. Target architecture
_TBD — written in Phase C (v1)._

## 6. Staged roadmap
_TBD — written in Phase C (v1). Small ordered stages, each a reviewable PR that leaves the repo green._
