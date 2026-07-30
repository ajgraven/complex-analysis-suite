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

## 1. Architecture map (breadth pass) — 2026-07-30

### 1.1 Stack & build topology
- Monorepo: pnpm workspaces (`packages/*`, `apps/*`), Node 22. Root scripts are the green bar; one
  Vitest workspace runner spans 5 packages + 3 apps (launcher has no tests).
- Apps built by Vite, `base: "./"`. QD additionally ships a PWA (workbox precache ~2.8 MiB).
- CI: `ci.yml` (build + browser gate) and `deploy-pages.yml` (auto-deploy launcher + CD + QD on push
  to `master`; correspondences is built-but-not-published).
- Lint: the root ESLint flat config enforces ONLY the dependency-boundary rule (no app→app, no
  package→app); each app lints itself. Strictly-downward + cycle detection between packages is a
  *planned* dependency-cruiser follow-on, **not yet wired** (`eslint.config.js:6-8`).

### 1.2 Scale & language split (cloc, git-tracked)
Total source ≈ **87k code lines (JS+TS)**; QD is ~60% and untyped. (JS 48,898 / 145 files — all QD
`.mjs`; TS 38,235 / 347 files; Markdown 21,935.)

| Area | files | code | typing |
|---|---|---|---|
| apps/quadrature-domains | 264 | 79,599 | untyped `.mjs` (dominant) |
| apps/complex-dynamics | 153 | 29,172 | TS (`allowJs:true, checkJs:false, strict`) |
| apps/correspondences | 43 | 3,640 | TS strict; exploratory |
| apps/launcher | 4 | 191 | trivial |
| packages/expr | 27 | 2,213 | TS strict; **src-exported** |
| packages/gpu | 21 | 1,233 | TS strict; **src-exported** |
| packages/core | 17 | 1,046 | TS strict; built→dist |
| packages/exact | 15 | 1,031 | TS strict; built→dist |
| packages/interchange | 15 | 695 | TS strict; built→dist |

### 1.3 Dependency graph & cycles (madge)
- **Packages: 0 cycles.** Boundary rule holds.
- **QD (131 modules): 0 import cycles**, but 7 imports unresolved by madge (dynamic / worker
  `new URL()` loads). QD's coupling is largely **invisible as import edges** — it flows through the
  store + worker message protocols + shared globals. Depth-pass target.
- **complex-dynamics (87 modules): 2 cycles**, both in `render/`:
  `angleOfPoint → angleParameter → inspect → overlay → lamination →` (back to `angleOfPoint`), plus
  the inner `angleParameter → … → lamination →` (back to `angleParameter`). A tangled render cluster.
- **correspondences: 0 cycles.**

### 1.4 God-modules (largest non-test source files; churn = all-history commits touching file)
| Lines | File | Churn | Note |
|---|---|---|---|
| 6,017 | qd `app/sym-core.mjs` | 6× | exact ℚ(i) symbolic core — **off-limits (behavior)**; structural review only |
| 4,948 | qd `app/algebra/algebra-ui.mjs` | **20×** | most-churned file in the repo |
| 4,637 | cd `src/main.ts` | 7× | app entry/orchestration god-module |
| 3,133 | qd `app/algebra/algebra-store.mjs` | 8× | QD state store |
| 2,527 | cd `src/render/glPlot.ts` | 4× | WebGL plot |
| 2,222 | qd `app/direct/direct-common.mjs` | — | |
| 1,931 | qd `app/ui.mjs` | 6× | |
| 1,833 | qd `app/solver.mjs` | — | |
| 1,372–1,475 | qd `schwarz/schwarz-ui`, `ui-domain-plot`, `ui-solve`, … | — | ~12 more files 1,000–1,500 lines |

### 1.5 QD internal layout (the focus area)
QD has *some* subsystem folders, but the **majority of its code is a flat pile** under `app/`:

| QD area | files | code | contents |
|---|---|---|---|
| `app/*.mjs` (flat top level) | **102** | **~57k** | sym-core, ui, solver, qd-equations, parse-h, ui-solve, ui-domain-plot, ui-strings, ui-state … |
| `app/algebra/` | 8 | 10,985 | algebra-ui + algebra-store + prove-plan + algebra-canvas |
| `app/schwarz/` | 12 | 7,509 | Schwarz reflection / WebGL |
| `app/direct/` | 4 | 3,979 | direct solver UI |
| `app/param-slice/` | 4 | 2,449 | parameter-slice UI |
| `app/sphere/` | 3 | 1,615 | Riemann-sphere view |
| `app/solvers/` | 10 | 1,145 | solver kernels |
| `app/workers/` | 5 | 252 | thin worker entrypoints |

Read: **102 files / ~57k lines in one flat directory is QD's dominant navigation/clarity problem**;
the foldered subsystems are better grouped but each still harbors god-modules.

### 1.6 Package boundaries / packaging inconsistency
- `@cas/core`, `@cas/exact`, `@cas/interchange`: built to `dist/`, single `.` export, emit `.d.ts`.
- `@cas/expr`, `@cas/gpu`: exported as **raw `./src/*.ts`** via many subpath exports (`./ast`,
  `./parser`, `./glsl`, `./df64`, …), no `dist`/`types`; consumed by bundler resolution.
- Minor inconsistency (two packaging strategies). Likely intentional (bundler-only consumers), but
  undocumented — candidate ADR note.

### 1.7 Prior review corpus (context — NOT to be re-derived)
- `docs/review/CODEBASE_REVIEW_2026-07.md` + `RAW_FINDINGS_2026-07.md`: 112 findings; all 12 HIGH
  fixed; **~48 medium/low open** (15 medium, 33 low).
- `docs/algebra-review/*`: closed algebra-maturity engagement (merged PR #81 + follow-ons).

## 2. Prioritized subsystems for depth review (and what is deliberately NOT reviewed)

Given the mandate (QD internals · testability · clarity; deeper-redesign appetite) and §1 evidence:

**Depth targets (ordered):**
1. **QD `algebra/` subsystem** (~11k LOC) — the flagship "prove bounded QDs" workflow; `algebra-ui`
   (5k, churn 20×) + `algebra-store` (3k) + `prove-plan` + `algebra-canvas`. Highest churn & clarity risk.
2. **QD core solve/UI orchestration + coupling layer** — the flat top-level cluster (`ui.mjs`,
   `ui-solve.mjs`, `ui-state.mjs`, `ui-domain-plot.mjs`, `solver*.mjs`, `qd-equations.mjs`,
   `parse-h.mjs`) and how it wires via the **store + worker protocol + globals** (coupling madge can't see).
3. **Test infrastructure & the ~128s node-suite** — why QD's headless `app/node-test.js` dominates the
   loop; characterization-test seams; brittle/low-value tests; coverage gaps. (Testability pain point.)
4. **CD `main.ts` (4.6k) + `render/` cycles** — a god-module entry + the only real cycle knot
   (structure/clarity; lower priority — CD was not a stated pain point).
5. **QD `sym-core.mjs` + the `@cas/exact` boundary** — **structural/role review only** (behavior
   off-limits, heavily audited). Goal: decide "leave alone" vs. "narrowly seam."

**Light pass (confirm health, don't belabor):** the five `@cas/*` packages (small, strict, cycle-free,
well-tested) and `apps/correspondences` (recent, TS, cycle-free).

**Explicitly NOT reviewed:** `apps/launcher` (trivial); shader source (opaque, off-limits per PLAN §1);
`@cas/exact` / `sym-core` numerics internals (off-limits); deploy/CI workflow internals.

Method for depth passes: delegate per-module reading to read-only subagents that return written
summaries; **verify their file:line claims against the code before recording any finding**; write
ASSESSMENT §3 + ISSUES entries after each subsystem and commit before the next.

## 3. Depth findings (per subsystem)
_Pending — traced execution paths end-to-end; lenses: structure / clarity / correctness-risk /
verifiability / developer-experience. Report only what evidence supports._

## 4. Systemic patterns (across subsystems)
_Pending._
