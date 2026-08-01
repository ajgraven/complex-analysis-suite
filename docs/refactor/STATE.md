# STATE — refactor engagement

> Living control file. Always current; keep under 100 lines. Committed directly to `refactor/main`
> at every checkpoint (it describes not-yet-merged work, so it must not sit behind an unmerged PR).
> Git and the working tree are authoritative for *what is true*; this file is authoritative only for
> *where we are*. On disagreement, trust git and correct this file.

## Objective
Multi-session architectural refactor of `complex-analysis-suite` — prioritizing maintainability/
extensibility, conceptual clarity, reliability/testability, and architectural coherence.
Behavior-preserving by default; no behavioral change without an explicit approval token.

## Phase / stage
- **Phase D — Execute. Groups A + B + C COMPLETE. Group D in progress.**
- **COMPLETION PLAN committed & APPROVED (2026-08-01)** → `docs/refactor/COMPLETION-PLAN.md`. Sequences the home
  stretch: **Phase 1** (F1 dependency-cruiser + A1 residuals QD-ALG-7/QD-SOLV-6) → **Phase 2** (source-text→behavioral
  net = the D1 enabler, QD-ALG-3: convert the **11** algebra readFileSync tests → jsdom) → **Phase 3** (D1a
  sidebar-as-data / D1b runOp single-flight → **re-eval gate** → **D1c verdict-unify [TOKEN GRANTED]** / D1d split)
  → **Phase 4** (D2 ui.mjs→root) → **Phase 5** (E2 folderize 58 files). **E1 DEFERRED.**
- **3 governing decisions (2026-08-01):** (1) pragmatic path — do the D1 enabler + D1a/b, re-evaluate before D1c/d;
  (2) defer E1; (3) grant the **D1c verdict-unification token** — the one authorized behavioral change (unifies the 3
  drifted verdict builders doClassify@3521 / doAutoSolve@3275 / _verdictBadge@4693; ships behind a net, honest
  labeling kept, string delta logged).
- **installAlgebra decomposition (QD-ALG-1):** 9 PURE carve-outs MERGED (#195–#203) into 4 companion modules + a badge
  lift, ~69 new char tests — a **prelude**. The real D1 (DOM-bound QD-ALG-2 sidebar + store-coupled bulk) is unstarted,
  gated by Phase 2's net. installAlgebra still ≈4.1k lines (algebra-ui.mjs:714; file 4,849).
- **Phase 1 — A1 residuals #204 MERGED (2862bf0); F1 PR #205 OPEN** (`refactor/p1-f1-depcruise`):
  · #204 — **QD-ALG-7** (`edges` getter → `.slice()`) + **QD-SOLV-6** (×3 `maxRelDiff < 1e-6` → one exported
  `IDENTITY_TOL`); net-first + mutation-verified; merged green 2211/254.
  · #205 (F1) — wired **dependency-cruiser** (`.dependency-cruiser.cjs` + `dep:check` folded into `pnpm lint`):
  `no-circular` + `no-package-to-app` + `no-cross-app`, `tsPreCompilationDeps:true` (type-only imports, so the
  CD-4 class is gated). Passes on the current graph (580 modules, 0 violations); all 3 rules mutation-verified incl.
  a type-only cycle. No app/package code changed. **Merging #205 completes Phase 1.**
- Cadence: merge on green (delegated). `APPROVED: PLAN.md v1` + `APPROVED: D1c verdict-unification`.
  Roadmap: A✓ / B✓ / C✓ / **D (9 carve-outs merged; real D1 → Phases 2–3)** / E (E1 deferred, E2=Phase 5) / **F1 (PR #205 open)**.

## Branches / PR
- Integration `refactor/main` @ **f0d24b9** (this STATE edit advances it). Tree clean. **Open PR #205** →
  `refactor/p1-f1-depcruise` (Phase 1 F1; dependency-cruiser gate).
- Merged stage PRs (27): A1 #178 … D-alg-carve-9 #203, **p1-a1-residuals #204 (2862bf0)**.

## Validation state (green bar)
- **`refactor/main` — ALL GREEN** at f0d24b9 (post-#204-merge): build/typecheck/lint exit 0; `pnpm test` **2211 / 254**.
- **PR #205 branch — ALL GREEN:** build/typecheck/lint(+`dep:check`)/test exit 0; `pnpm test` **2211 / 254** (F1 adds
  no unit tests — its net is the passing depcruise gate: 580 modules / 0 violations + the 3-rule mutation-verify).

## Uncommitted / unverified
- PR #205 work (`.dependency-cruiser.cjs`, `dep:check`/lint fold, ci.yml comment, LOG/ISSUES) is committed on
  `refactor/p1-f1-depcruise` (9453ae9) and pushed; this STATE edit advances `refactor/main`. Nothing uncommitted.

## Known blockers / risks
- **Open PR #205** (awaiting merge-on-green). No blockers.
- **Phase 2 gates Phase 3:** the 11 source-text algebra tests (QD-ALG-3) pin *text*, not *behavior*, so they cannot
  guard a decomposition — they must be converted to behavioral jsdom first. No installAlgebra structural work before that.

## Next concrete steps
1. **Merge #205 on green** (build + browser complete), then pull + re-confirm green on `refactor/main`. That closes
   **Phase 1** (A1 residuals + F1).
2. **Phase 2 — the D1 enabler:** convert the 11 QD-ALG-3 source-text (`readFileSync`+regex) algebra tests → behavioral
   jsdom, + jsdom coverage of the sidebar build + op-runner dispatch. Tests-only; gates all Phase-3 installAlgebra work.
   Group order: A✓ B✓ C✓ → **D (→ Phases 2–3)** → E2 (Phase 5). E1 deferred.

## Resume commands
```
git fetch && git checkout refactor/main && git pull
pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm lint && pnpm test  # expect 2211/254
```
