# CLAUDE.md — project context & working agreement

> This file is read automatically by Claude Code at the start of a session. It is the
> **authoritative** brief. The full reasoning lives in [`docs/`](docs/); read those for
> the *why*, but the decisions and guardrails here are binding.

## What this repository is

`complex-analysis-suite` — a monorepo for a growing **suite of complex-analysis /
complex-dynamics visualization tools** that share common packages and hand data off to
one another. North-star property: **each new tool builds fewer primitives from scratch
than the last.** It currently unifies two mature apps (Complex Dynamics; Quadrature
Domains) and will host a third (anti-holomorphic correspondences).

Read the docs in this order before making changes: [`docs/VISION.md`](docs/VISION.md) →
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) → [`docs/DECISIONS.md`](docs/DECISIONS.md)
→ [`docs/MIGRATION.md`](docs/MIGRATION.md) → [`docs/INTERCHANGE.md`](docs/INTERCHANGE.md)
→ [`docs/RISKS.md`](docs/RISKS.md).

## Locked decisions (do not re-litigate; supersede via a new ADR if they must change)

1. **Monorepo**, pnpm workspaces, `packages/*` + `apps/*`. ([ADR-0001](docs/DECISIONS.md), [ADR-0004](docs/DECISIONS.md))
2. **TypeScript is the common language.** Shared packages are strict TS. App internals
   migrate to TS *incrementally, leaves-first*; gnarly app glue may stay
   `allowJs`/`// @ts-nocheck` **indefinitely** — full typing is NOT a goal. ([ADR-0002](docs/DECISIONS.md))
3. **Vite for both apps.** The Quadrature app moves onto Vite as a **bundler swap first,
   code still 100% JS** (`allowJs`), TS later. ([ADR-0003](docs/DECISIONS.md))
4. **`expr` + `interchange` are the keystone** (executable + serializable map
   representation). Single-valued hand-off first; multivalued/branch-aware later. ([ADR-0005](docs/DECISIONS.md))
5. **Core packages are convention-neutral.** The Quadrature app's `dA = dx dy/π` and
   `1/(2πi)`-suppressed contour conventions live at the app/domain edge; `@cas/core`
   contains **no** `π`/`2πi` normalization constants; the interchange format is canonical
   (standard) and convention-tagged. This prevents a *silent* factor-of-π/2πi error.
   ([ADR-0006](docs/DECISIONS.md))
6. **Extraction is demand-driven:** a primitive becomes a package when a **second
   consumer** needs it. ([ADR-0007](docs/DECISIONS.md))
7. **Package scope `@cas/*`** (internal, `workspace:*`, not published).
8. **Topology:** separate apps + a **unified menu** (a launcher page in `apps/launcher`,
   plus a shared nav header later). **No** unified single-page shell.
9. **Correspondence tool** is a **separate app** (`apps/correspondences`), quadratic-first
   (deltoid + circle-and-cardioid), with the **deltoid** as the first ground-truth
   milestone.
10. **Node 22 LTS** (`.nvmrc` = `22`, `engines.node >= 22`). *(This supersedes the "20"
    mentioned in some docs.)*
11. **Deployment:** each app builds static (`base: "./"`) and deploys to GitHub Pages
    independently; the launcher sits at the top-level Pages URL.

## Non-negotiable guardrails

- **Working software at every step.** Never leave the repo in a broken state; each
  [MIGRATION](docs/MIGRATION.md) phase gate is a shippable point.
- **Test-guard every refactor.** Consolidate on Vitest early; a module never moves
  without its tests green *before and after*; shared packages ship *with* a golden-value
  corpus representing both apps' needs.
- **One dependency direction:** packages import downward only; apps import packages; no
  app imports another app; no cycles. Enforce with lint / dependency-cruiser.
- **Honest labeling** of computed results (`=` exact, `≤` rigorous bound, `≈` estimate) —
  especially anything from the correspondence tool's straightening/surgery, which is
  exploratory and must never read as certified.
- **Preserve provenance and backward-compat:** bring apps in with git history
  (`git subtree`); preserve or migrate each app's existing share-link URL formats before
  touching that code.
- **Don't over-reach.** Follow the phase order; extract only when a second consumer needs
  it; ask before large speculative refactors.

## Source repositories (fill in before running Phase 0)

```
CD_SRC=<path-or-URL to ComplexDynamicsJS>      # already Vite + TypeScript
QD_SRC=<path-or-URL to QuadratureDomains>      # currently vanilla JS, no build
```
`scripts/bootstrap-subtrees.sh` uses these to pull both apps in with history preserved.

## Immediate task (this session)

Execute the runbook up to the first shared package:

1. **Phase 0 — Genesis** ([MIGRATION Phase 0](docs/MIGRATION.md#phase-0--genesis-the-workspace-skeleton)):
   workspace skeleton (`pnpm-workspace.yaml`, root `package.json` with
   `packageManager`/`engines`, `.nvmrc`=22, `tsconfig.base.json`, ESLint flat config +
   boundary rule, Prettier, `.gitignore`); pull in both apps via
   `scripts/bootstrap-subtrees.sh` (history preserved); give each app a workspace
   `package.json` (the QD app likely needs one created); stub `apps/launcher` listing the
   two apps. **Do not modify app source in Phase 0.** Gate: both apps launch as before;
   git history present.
2. **Phase 1 — Tooling & tests** ([MIGRATION Phase 1](docs/MIGRATION.md#phase-1--unify-tooling-and-the-test-harness)):
   shared tsconfig/eslint/prettier; **one Vitest runner** (port/adapt the Quadrature
   app's `node-test.js` + `test/*.test.js`); a CI workflow running
   install→lint→typecheck→test→build. Gate: `pnpm lint && pnpm typecheck && pnpm test &&
   pnpm build` green from the root; both apps' original tests pass.
3. **Phase 3 (first extraction) — `@cas/core`** ([MIGRATION Phase 3](docs/MIGRATION.md#phase-3--extract-cascore)):
   start with **complex arithmetic**, then formal series, then polynomial/Durand–Kerner —
   unifying the duplicated copies across both apps. Consolidate their unit tests into a
   `@cas/core` golden corpus. Point both apps at the package and delete the dead copies.
   **Benchmark the CPU orbit path before/after** (watch for regression). Gate: both apps
   import `@cas/core`; duplicates gone; corpus + both suites green; no meaningful perf
   regression.

> Phase 2 (QD→Vite ESM-ification) sits between 1 and 3 and is the largest mechanical
> chunk; do it as its own reviewed step. Phases 4–6 (interchange + σ hand-off; gpu/expr;
> `apps/correspondences`) come after and are specified in [MIGRATION](docs/MIGRATION.md).

Work in small, reviewable commits. Pause at each phase gate for review before proceeding.
When a command or path in the docs is marked `⚠ verify`, check it against the actual repo
contents rather than assuming.
