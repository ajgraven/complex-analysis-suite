# Algebra Maturity Review — STATE

> **Re-entrant control file.** A fresh session with zero memory resumes from here.
> Read this top-to-bottom, then read every artifact it references, then verify repo
> state (`git status`; `git log --oneline -20` on branch `algebra-maturity-review`),
> then continue from **Next action** at the bottom. Do not redo completed units.

## Mission (from the review prompt)

Make the QD Algebra module a genuinely powerful, trustworthy pure-math research tool
for **proving existence and uniqueness of classical bounded quadrature domains**, with
a **semi-autonomous proof workflow** and a **clear, intuitive UI**. Given exact
quadrature data, the mature tool must produce exactly one of: (1) a reproducible
certified existence/uniqueness result; (2) a rigorously stated partial result/bound; or
(3) an explicit explanation of why it is unresolved. Rigor conventions binding on every
output: `=` exact, `≤` rigorous bound, `≈` estimate, `unknown/incomplete` otherwise. A
**uniqueness verdict = uniqueness among ALL admissible domains in the stated class,
modulo stated equivalences** — never "unique among solutions found".

## Working rules (binding — from CLAUDE.md + project memory)

- **Branch:** `algebra-maturity-review` (created off `master` @ `355ed9c`). BRANCH FIRST for any code.
- **Gate:** `corepack pnpm@9.15.9 -C <root> run lint && … typecheck && … test && … build`.
  NEVER pipe the gate through tail/head (drops errors + exit code). QD headless (`node app/node-test.js`,
  wrapped by vitest `node-suite.test.ts`) takes ~85-100s. Local Node 21 ⇒ harmless "Unsupported engine" WARN.
- **Commit discipline:** commit after each atomic unit; tests green at every code commit; commit msg names its
  place in the plan. Never start a unit with uncommitted work.
- **Commit/PR text:** use `-F <file>` or bash `<<'EOF'` heredoc — NOT PowerShell `@'…'@` in the Bash tool.
- One-way deps: apps import packages; NO app→app; shared `@cas/*` strict-TS. Kernel stays DOM-free;
  heavy ops worker-offloadable with main-thread fallback. Exact arithmetic + append-only DAG are sacrosanct.
- Do NOT `git worktree remove` harness `.claude/worktrees/*`.
- This review's artifacts all live under `docs/algebra-review/`. Persist findings to files AS produced.

## Phase checklist

- [x] **Phase 0 — Ground truth.** Baseline gate + read core docs/source structure. Baseline ALL GREEN:
      lint ✓(0) typecheck ✓(0) test ✓(0) build ✓(0). vitest 147 files / **1280 tests passed** (102s);
      QD headless `node-suite.test.ts` 93s. jsdom `getContext` messages are render-test noise (tests pass).
- [ ] **Phase 1 — Audit** (7 parallel read-only tracks → `audit/<track>.md`). Dispatched: see log below.
- [ ] **Phase 2 — Consolidated `AUDIT.md` + `PLAN.md`.**
- [ ] **Phase 3 — Semi-autonomous "Prove existence/uniqueness" orchestrator** (design + implement slices).
- [ ] **Phase 4 — UI clarity / guided front-end.**
- [ ] **Testing & validation** (woven through Phase 3–4 slices).
- [ ] **Final — STATE=COMPLETE + `FINAL_REPORT.md`.**

## Baseline results (Phase 0)

- `lint` → exit 0 ✓
- `typecheck` → exit 0 ✓
- `test` → exit 0 ✓ — vitest 147 files / **1280 tests passed** (102.6s). jsdom `getContext` messages = render-test noise.
- `build` → exit 0 ✓
- Full log: scratchpad `baseline.log`. Re-run to reconfirm on resume.

## Module scope (ground truth, verified against tree)

Two test suites: **vitest** (42 `.test.ts` under `apps/quadrature-domains/vitest/`) + legacy **headless**
(`app/test/*.test.js`, run by `node app/node-test.js`, wrapped in vitest `node-suite.test.ts`).

Core algebra source (`apps/quadrature-domains/app/`):
- `sym-core.mjs` (5727 L) — the exact `QD.Sym` CAS engine (ℚ(i) → MPoly → Gröbner/RUR/resultants/factor).
- `sym-radical.mjs` (490), `solver.mjs` (1833), `qd-equations.mjs` (888), `qd-constraints.mjs` (307),
  `qd-varscheme.mjs` (66), `univalence.mjs` (177), `symmetry.mjs` (150), `taylor.mjs` (270).
- `algebra/` — `algebra-store.mjs` (2730), `algebra-ui.mjs` (2671), `algebra-canvas.mjs` (511),
  `cas-export.mjs` (365), `sym-worker.mjs` (132), `expr-parser.mjs` (176), `domain-mini-plot.mjs` (45).
- `schwarz/` (12 files, ~7.4k L) — Schwarz function analysis/render (reconstruction side).
- `solver-*.mjs` family (14 files, ~7.2k L) — the numeric inverse-problem solvers (oracle/cross-check side).
- `workers/` — worker entries incl. `sym-worker-entry.mjs`.

## Proof pipeline (as documented — TO BE VERIFIED, not trusted)

Quadrature data `h` → `QDEquations.generateClassicalBounded` (●/★/gauge, conjugate model over ℚ(i)) →
optional `reimSplit` + reality assumptions + `fixW0` gauge → Algebra-tab reductions (resultant / Gröbner /
saturate / triangularize / factor, each an append-column DAG node) → `currentReimSystem` → `classify` /
`solveReal` / `solveRealCertified` (Hermite + RUR + Sturm) → `doCertifyUnivalence` (regime + Schur–Cohn local
fold + boundary double-point count + gauge quotient + numeric cross-check) → "# genuine QDs" verdict +
reconstructed-boundary thumbnail. External-CAS escape: Maple RCTD export/import.

**Audit lens (the whole point):** not "are the primitives correct" (prior reviews found the ℚ(i) engine
sound) but "does the WORKFLOW use them correctly to actually prove existence/uniqueness" — silent
specialization, genericity assumptions, unsaturated denominator/degeneracy ideals, dropped branches,
numeric heuristics over-claimed, incomplete decompositions read as complete, and certificate chains that do
not actually imply the displayed verdict. And: does "uniqueness" mean uniqueness among ALL admissible
domains, or only among solutions found?

## Phase-1 audit tracks (dispatch log)

| Track | File | Scope | Status |
|---|---|---|---|
| A system-generation | audit/A-system-generation.md | qd-equations, qd-constraints, qd-varscheme, reim/conjugate models, gauge, point-functional | RUNNING |
| B elimination-decomposition | audit/B-elimination-decomposition.md | sym-core Gröbner/resultant/saturate/elim/minimalPrimes/triangular/radical; denom clearing, excluded loci, positive-dim | RUNNING |
| C certified-solving-counting | audit/C-certified-solving-counting.md | solveZeroDim/RUR/realSolutionCount/solveRealCertified/parametricRealCount1D/discriminantVariety/Schur-Cohn | RUNNING |
| D univalence-admissibility | audit/D-univalence-admissibility.md | univalence, qd-constraints univalence forms, doCertifyUnivalence chain, pole/node location, boundary collisions | RUNNING |
| E reconstruction-verification | audit/E-reconstruction-verification.md | phiFromAlgebraSolution, exact Schwarz curve, exact data verification, sameDomain dedup | RUNNING |
| F store-worker-export | audit/F-store-worker-export.md | algebra-store DAG, sym-worker cancel/parity/determinism, cas-export round-trip, PROV_STORE/UI | RUNNING |
| G ui-workflow | audit/G-ui-workflow.md | algebra-ui/canvas, verdict card, rigor badges, terminology, first-time-user walk (feeds Phase 4) | RUNNING |

All 7 dispatched 2026-07-13 as background general-purpose subagents (read-only; each persists to its
audit/<track>.md before returning). Orchestrator integrates on completion.

Each subagent persists its full findings (severity + evidence: file:line / failing input / repro test) to its
file BEFORE returning. Orchestrator alone integrates + adjudicates + commits.

## Decisions log

- 2026-07-13: Fresh run. Branch `algebra-maturity-review` off master `355ed9c`. 7-track read-only audit
  partition chosen to match the proof pipeline's stages (generation→elimination→solving→univalence→
  reconstruction→engineering→UI). Rationale: disjoint file footprints ⇒ safe parallel dispatch.

## Next action

Phase 1 audit subagents are RUNNING (all 7 dispatched). As each completes, READ its `audit/<track>.md`
(NOT the transcript .output file) and integrate into `AUDIT.md`. When all 7 are in, adjudicate severity,
write `AUDIT.md` (workflow + claim-vs-impl matrix + findings taxonomy) and `PLAN.md` (value-ordered slices),
commit both, then begin Phase 3 implementation with the highest-value self-contained slice.
