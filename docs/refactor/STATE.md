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
- **✅ PHASE 1 COMPLETE — #204 + #205 both MERGED.**
  · #204 (2862bf0) — **QD-ALG-7** (`edges` getter → `.slice()`) + **QD-SOLV-6** (×3 `maxRelDiff < 1e-6` → one
  exported `IDENTITY_TOL`); net-first + mutation-verified.
  · #205 (c1ae7e6, F1) — **dependency-cruiser** gate live (`.dependency-cruiser.cjs` + `dep:check` folded into
  `pnpm lint`): `no-circular` + `no-package-to-app` + `no-cross-app`, `tsPreCompilationDeps:true` (type-only imports,
  so the CD-4 class is gated). 580 modules / 0 violations; 3 rules mutation-verified incl. a type-only cycle. Now
  enforced in the local green bar, CI `build`, and the deploy gate. No app/package code changed.
- **Phase 2 UNDERWAY (the D1 enabler, QD-ALG-3) — PR #206 OPEN** (`refactor/p2-1-mount-harness`): NEW reusable jsdom
  mount harness `vitest/_algebra-mount.ts` (mounts installAlgebra headlessly — AlgebraCanvas is SVG, no canvas ctx;
  boot kernels → scaffold → stub ctx → `tab-changed`) + first conversion `algebra-section-order.test.ts`
  node/source-regex → jsdom/behavioural (mutation-verified). **1 of 11** source-text algebra tests converted.
  Audit recorded (LOG): the 11 are a MIX — clean DOM conversions, interaction tests, `resultStateOf` (extract+call),
  and genuine source-invariants (comment hygiene / WCAG tokens / "every setVerdict has rigor" → node-env or D1c).
- Cadence: merge on green (delegated). `APPROVED: PLAN.md v1` + `APPROVED: D1c verdict-unification`.
  Roadmap: A✓ / B✓ / C✓ / **D (Phase 1✓; Phase 2 = QD-ALG-3 net, 1/11 → PR #206; then Phase 3 D1)** / E (E1 deferred, E2=Phase 5) / **F1✓**.

## Branches / PR
- Integration `refactor/main` @ **79641b6** (this STATE edit advances it). Tree clean. **Open PR #206** →
  `refactor/p2-1-mount-harness` (Phase 2; jsdom mount harness + section-order conversion).
- Merged stage PRs (28): A1 #178 … #204, **p1-f1-depcruise #205 (c1ae7e6)**.

## Validation state (green bar)
- **`refactor/main` — ALL GREEN** at 79641b6 (post-#205): build/typecheck/lint(+`dep:check`, 580 modules)/test exit 0;
  `pnpm test` **2211 / 254**.
- **PR #206 branch — ALL GREEN:** build/typecheck/lint(+`dep:check`, 581 modules)/test exit 0; `pnpm test` **2210 / 254**
  (net −1: one retired comment-hygiene assertion; the new harness file is not a test file so file count holds at 254).

## Uncommitted / unverified
- PR #206 work (`vitest/_algebra-mount.ts`, converted `algebra-section-order.test.ts`, LOG/ISSUES) is committed on
  `refactor/p2-1-mount-harness` (d967f66) and pushed; this STATE edit advances `refactor/main`. Nothing uncommitted.

## Known blockers / risks
- **Open PR #206** (awaiting merge-on-green). No blockers.
- **Phase 2 gates Phase 3:** the source-text algebra tests (QD-ALG-3) pin *text*, not *behavior*; they must become
  behavioral jsdom (mount harness now exists) before any installAlgebra structural work. 1 of 11 converted.

## Next concrete steps
1. **Merge #206 on green**, then pull + re-confirm green on `refactor/main`.
2. **Phase 2 · PR 2.2:** convert the DOM-structure + label tests (honest-labels, eliminate-section placement,
   tooltip-tiers) + extract `resultStateOf` for direct testing; handle `workflow-sections` (behavioural part via the
   harness + slimmed node-env source-hygiene). Then **PR 2.3** (interaction tests + op-runner/verdict-prose coverage).
   Group order: A✓ B✓ C✓ → **D (Phase 2 → Phase 3 D1)** → Phase 4 (D2) → E2 (Phase 5). E1 deferred.

## Resume commands
```
git fetch && git checkout refactor/main && git pull
pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm lint && pnpm test  # expect 2211/254
```
