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
- **Phase 1 UNDERWAY — PR #204 open** (`refactor/p1-a1-residuals`): the two A1 residuals, one behavior-preserving PR —
  **QD-ALG-7** (`edges` getter → `.slice()` defensive copy; no caller mutated it) + **QD-SOLV-6** (the ×3 open-coded
  `maxRelDiff < 1e-6` identity gate → one exported `IDENTITY_TOL`; default uniformly 1e-6, override semantics
  unchanged). Net-first + mutation-verified; green 2211/254. Awaiting merge-on-green.
- Cadence: merge on green (delegated). `APPROVED: PLAN.md v1` + `APPROVED: D1c verdict-unification`.
  Roadmap: A✓ / B✓ / C✓ / **D (9 carve-outs merged; real D1 → Phases 2–3)** / E (E1 deferred, E2=Phase 5) / **F1=Phase 1 (in progress)**.

## Branches / PR
- Integration `refactor/main` @ **b74cb3e** (this STATE edit advances it). Tree clean. **Open PR #204** →
  `refactor/p1-a1-residuals` (Phase 1 A1 residuals; QD-ALG-7 + QD-SOLV-6).
- Merged stage PRs (26): A1 #178 … D-alg-carve-9 #203 (eaff289).

## Validation state (green bar)
- **`refactor/main` — ALL GREEN** at b74cb3e (docs-only completion-plan commit): `pnpm test` **2208 / 253 files**.
- **PR #204 branch — ALL GREEN:** build/typecheck/lint exit 0; `pnpm test` **2211 / 254 files** (+3 tests, +1 file —
  the new `solver-identity-tol.test.ts`; the QD-ALG-7 assertions live inside the existing store spec).

## Uncommitted / unverified
- PR #204 work (code + both nets + LOG/ISSUES) is committed on `refactor/p1-a1-residuals` (61d593d) and pushed;
  this STATE edit advances `refactor/main`. Nothing uncommitted.

## Known blockers / risks
- **Open PR #204** (awaiting merge-on-green). No blockers.
- **Phase 2 gates Phase 3:** the 11 source-text algebra tests (QD-ALG-3) pin *text*, not *behavior*, so they cannot
  guard a decomposition — they must be converted to behavioral jsdom first. No installAlgebra structural work before that.

## Next concrete steps
1. **Merge #204 on green** (build + browser complete), then pull + re-confirm green on `refactor/main`.
2. **Continue Phase 1:** **F1** — wire `dependency-cruiser` (downward-only + no-cycles in `ci.yml`). Then **Phase 2**
   (the D1 enabler: convert the 11 QD-ALG-3 source-text tests → behavioral jsdom). Group order: A✓ B✓ C✓ →
   **D (→ Phases 2–3)** → E2 (Phase 5). E1 deferred.

## Resume commands
```
git fetch && git checkout refactor/main && git pull
pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm lint && pnpm test  # expect 2208/253
```
