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
- **complex-dynamics (87 modules): 2 madge cycles**, both in `render/`:
  `angleOfPoint → angleParameter → inspect → overlay → lamination →` (back to `angleOfPoint`), plus
  the inner `angleParameter → … → lamination →` (back to `angleParameter`). **[Corrected by depth pass
  §3.4: TYPE-ONLY — the sole closing edge is `import type { Leaf }` (overlay.ts:18), erased at runtime
  under `verbatimModuleSyntax:true`; NO runtime cycle, but it still blocks the planned dependency-cruiser gate.]**
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

> Method: each subsystem read by a delegated read-only subagent; **every file:line claim below was
> re-verified against the code by me** before recording (spot-checks in LOG.md 2026-07-30). Severity =
> maintainability impact, not user-facing bug severity. Findings feed PLAN.md v1 (Phase C).

### 3.1 QD `algebra/` — model & prove-engine are exemplary; the UI is a 4.2k-line god-function [verified]
`algebra-store.mjs` (disciplined DAG store w/ undo/redo, headless) and `prove-plan.mjs` (pure,
dependency-injected, DOM-free) are **sound and well-tested** — the healthy half. All debt sits in
`algebra-ui.mjs`: one `installAlgebra(ctx)` closure spanning **687→4921** (~4,234 lines, ~175 nested
fns over ~20 mutable `let`s) interleaving DOM (179 `document.`, 158 `createElement`, 35 `innerHTML=`),
store calls (260) and orchestration — the most-churned file in the repo (20 commits).

| ID | Sev | Class | Finding | Evidence |
|---|---|---|---|---|
| QD-ALG-1 | high | design-problem | `installAlgebra` is a ~4,234-line god-function; nothing in it is importable/testable in isolation | algebra-ui.mjs:687-4921 |
| QD-ALG-2 | high | design-problem | Whole sidebar built as one `innerHTML` string, wired ~300 lines away by stringly-typed ids → silent breakage on rename | algebra-ui.mjs:1888-2277 |
| QD-ALG-3 | high | design-problem | The god-function forces ~11 *source-text* test files (readFileSync+regex), not behavioral tests; pass while logic rots, break on rename (per #142) | algebra-eliminate-section.test.ts:13-29; algebra-verdict-rigor.test.ts:1-9 |
| QD-ALG-4 | med | design-problem | ~15 async ops copy the same abort/busy/error boilerplate; single-flight guard applied 3 ways — `doSolveRadical` omits it | algebra-ui.mjs:2603 (none) vs 3507/3115/3244 (`_abort`) vs 2447/2507 (`busyGuard`) |
| QD-ALG-5 | med | design-problem | Honest-labeling wording built twice (inline `doClassify` vs engine `assembleVerdict`) → hand-kept consistent | algebra-ui.mjs:3521-3553 vs prove-plan.mjs:336 |
| QD-ALG-6 | med | plausible-concern | Realness/verify tolerances (1e-4, 1e-6) scattered as magic literals across ui+engine | algebra-ui.mjs (22 sites); prove-plan.mjs:366 |
| QD-ALG-7 | low | style | Store getter leaks live internal `edges` array (neighbors `.slice()`) | algebra-store.mjs:3115 vs 3120-3121 |

Top moves: (1) sidebar-as-data (kills innerHTML string; converts source-text tests → DOM tests);
(2) one `runOp()` async runner (uniform guard, fixes QD-ALG-4, adds a test seam); (3) unify verdict path
then split `installAlgebra` — **after** (1)/(2) unlock characterization tests.

### 3.2 QD solver family — mid-DRY-refactor, far along; debt is the outer shell + a triplicated dispatch invariant [verified]
Inner math is **already well-factored** into shared commons (taylor/lqd/pqd-common, `packPhiBySchema`,
extracted seeds); big files are big from *essential* math, not copy-paste. Remaining: a load-order
invariant duplicated across three hand-maintained lists (a correctness footgun) + ~600–900 LOC of
mechanical shell boilerplate.

| ID | Sev | Class | Finding | Evidence |
|---|---|---|---|---|
| QD-SOLV-1 | high | design-problem | Dispatch precedence = reverse load order (`registerFamily` unshift); seed→solver order **triplicated** across 3 hand-maintained lists; a `_singular` mis-ordered before its base → silently wrong φ. Nothing asserts base-before-singular | solver.mjs:1283-1285; main.mjs / workers/solver-graph.mjs / test/bootstrap.js |
| QD-SOLV-2 | med | confirmed-defect | Stale doc: CONTRIBUTING.md:84 says the test bootstrap "imports the same graph" — it keeps its own copy · **[FIXED · stage A1]** | apps/quadrature-domains/CONTRIBUTING.md:84 |
| QD-SOLV-3 | med | confirmed-defect | 5th open-coded pole-centroid copy despite `QD.poleCentroid`; diverges on empty-pole fallback (`{re:1}` vs `{re:0}`) · **[FIXED · stage A1, D-1]** | solver-pqd-singular.mjs:496-503 vs solver-qd.mjs:333-336 |
| QD-SOLV-4 | med | design-problem | ~17-key `Family.X` record + IIFE/guard/seed-alias shell re-typed 10×; identical residual locator+coeff skeleton & Z/2 canonicalize duplicated verbatim | solver-qd.mjs:95-160; solver-lqd-singular.mjs:159-265 |
| QD-SOLV-5 | med | design-problem | Seeds mirror = 2nd parallel duplication axis (perturb/clamp ~80% mechanical) | seeds-lqd-singular.mjs:171-184; seeds-pqd-singular.mjs:48-58 |
| QD-SOLV-6 | low | plausible-concern | `identityOK` gate computed 3× w/ divergent tol (one hardcodes 1e-6 vs the option) | solver.mjs:1333, 1635, 1774 |

Top moves: (1) single source of truth for load order + startup assertion (or a `specificity` sort) —
highest-severity, near-zero risk; (2) `defineFamily(config)` factory for the shell only (NOT the math);
(3) `seeds-common` for perturb/clamp + fold the 5th centroid copy.

### 3.3 QD UI/orchestration/coupling — god-module `ui.mjs`, no single state SoT, 6×-duplicated worker lifecycle that already shipped a bug [verified]
`ui.mjs` (1931) is a DI hub + god-module; **7+ parallel state containers** propagate via 3 mechanisms;
the worker-client lifecycle is copy-pasted across 6 places and **already produced a shipped defect**.
The `installX(uiCtx)` factory seam exists and works — widen it.

| ID | Sev | Class | Finding | Evidence |
|---|---|---|---|---|
| QD-UI-1 | high | design-problem | Worker lifecycle duplicated 6× (3 lanes in primary-solver-worker + schwarz/sym/param-slice); drifted (primary has `messageerror`, aux/live don't) and **already shipped the "stuck on Pass 1/3" Schwarz bug** fixed in only one copy | primary-solver-worker.mjs:80/208/302,113; schwarz-cpu-worker.mjs:83-96 |
| QD-UI-2 | high | design-problem | `ui.mjs` god-module: ~20 responsibilities in one file (DI, modes, solve pipeline, DOM wiring, cross-tab hooks, help) | ui.mjs:12-46 (own banner); handlers 767-1078 |
| QD-UI-3 | med | design-problem | No single state SoT: 7+ containers × 3 propagation channels (imperative DOM / pub-sub / global reads) | ui-state.mjs:41; primary-solution.mjs:78; schwarz-ui.mjs:50; direct-ui.mjs:43 |
| QD-UI-4 | med | plausible-concern | Worker envelope `{kind,jobId,result|error}` hand-repeated in ~11 places, untyped; unknown `kind` silently dropped → mismatched client hangs | solver-worker-entry.mjs:20-50 |
| QD-UI-5 | med | design-problem | `ui.mjs`/`ui-solve.mjs`/`ui-domain-plot.mjs` + all worker message paths have **no executable coverage** (only source-text greps) | parse-check.test.js:43-46; worker.test.js:9-33 |
| QD-UI-6 | med | design-problem | Root "flat pile" (56 files) ignores a half-started folder taxonomy (`solvers/seeds/` a folder; 17 `solver-*` flat beside it) | apps/quadrature-domains/app/ |
| QD-UI-7 | low | style | Stale nav banner atop `ui.mjs` points to extracted code by old line numbers | ui.mjs:12-46 |
| QD-UI-8 | low | style | Papercuts: `direct-ui` redeclares `show` 3×; no shared `$`/`byId`; `sphere-ui` local `state` collides w/ global SoT | direct-ui.mjs:212/240/265; sphere-ui.mjs:49 |
| QD-UI-9 | low | plausible-concern | Tab integration uses 3–4 idioms (tab-changed / `_mountUI` / factory / PrimarySolution.subscribe) — no single lifecycle contract | schwarz-ui.mjs:192; direct-ui.mjs:142-156 |

Top moves: (1) one `createWorkerLane()` factory (kills the drift class that shipped QD-UI-1) — write
fake-Worker tests first; (2) continue `installX(uiCtx)` extraction to shrink `ui.mjs`; (3) folderize the
flat pile by existing prefixes (codemod; behavior-preserving; own commit).

### 3.4 CD `main.ts` + `render/` — two god-modules, a leaky `PlotView` façade; render "cycle" is type-only [verified]
`init()` is a **3,660-line** god-function (main.ts:958→4623); `GLPlot` a 2,527-line god-class; `main.ts`
reaches GLPlot internals **156×** through the `PlotView` façade (Law-of-Demeter break). **Correction to
§1.3:** the madge render cycle is **type-only** — sole closing edge is `import type { Leaf }`
(overlay.ts:18, used only in type positions), erased under `verbatimModuleSyntax:true`; no runtime cycle,
but it blocks the planned dependency-cruiser gate.

| ID | Sev | Class | Finding | Evidence |
|---|---|---|---|---|
| CD-1 | high | design-problem | `init()` ~3,660-line god-function (109 nested fns, ~40 `let`s, 141 listeners) holding a dozen responsibilities as closures | main.ts:958-4623 |
| CD-2 | high | design-problem | `GLPlot` 2,527-line god-class mixing GL plumbing + domain decisions + interaction (~90 methods) | render/glPlot.ts:344 |
| CD-3 | med-high | design-problem | `main.ts` reaches `plotView.plot.<GLPlot internal>` **156×** — façade bypassed, welds main to GLPlot field layout | main.ts (156 `.plot.`); plotView.ts:59 |
| CD-4 | med | design-problem | render/ 5-module import cycle — **type-only** (no runtime hazard) but blocks the dependency-cruiser guardrail; one value-import from real · **[FIXED · stage A3]** | overlay.ts:18; lamination.ts:32-33; tsconfig.json:17 |
| CD-5 | med | plausible-concern | 4 largest render/ modules (glPlot, shaderBuilder, overlay-draw, plotView) have no unit tests — only browser/manual | test/ (pure-fn tests only) |
| CD-6 | med | plausible-concern | `main.ts` imports 25 distinct render/ modules directly — no render-subsystem façade; the coupling bottleneck | main.ts (25 `./render/`) |
| CD-7 | low | optional | No `dispose()` on GLPlot/PlotView (fine at 2 page-lifetime plots; a leak if ever mount/unmount under a shared shell) | glPlot.ts / plotView.ts |

Top moves: (1) **D1** break the cycle via `render/laminationTypes.ts` (zero runtime change, very low
risk, unblocks the gate); (2) decompose `init()` behind an `AppContext` (pure per-cluster moves; the
`setup*` helpers prove the pattern); (3) extract GLPlot's pure decision layer + seal `PlotView` getters
for the 156 reaches.

### 3.5 Test infra & the ~128s node-suite — one serial child process defeats Vitest; QD has no coverage [verified]
The suite is honest and green (2017 tests; **0 abused mocks, 0 snapshots** — genuinely good discipline),
but the QD headless `node-test.js` runs as **one serial child process on one core** (`execFileSync`),
collapsing **2302 assertions into a single Vitest test** while the other ~205 files parallelize across 4
cores. Subagent instrumentation (**measured by subagent, not re-timed by me**): `solvers.test.js` ≈ **76s
of ~108s** standalone. QD `.mjs` is entirely **excluded from coverage** (config includes only `*/src`; QD
has no `src/`). Pure targets (`algebra-store`, `prove-plan`, `solver-*`) are well-characterized; the
DOM/worker targets (`ui.mjs`, `ui-solve.mjs`, the render half of `algebra-ui.mjs`) have **no seam and no
coverage** — exactly the risky part of the refactor.

| ID | Sev | Class | Finding | Evidence |
|---|---|---|---|---|
| QD-TEST-1 | high | design-problem | Node suite = one serial child process (`execFileSync`) → 2302 asserts in 1 Vitest test on 1 core; no parallelism/reporting/isolation; watch reruns full ~128s | node-suite.test.ts:14; node-test.js:97-104 |
| QD-TEST-2 | high | design-problem | `ui.mjs` (1931, a refactor target) has **zero** characterization coverage (0 exports; only `node --check` + one regex) | parse-check.test.js:38,43-47 |
| QD-TEST-3 | med | design-problem | ~15 QD specs assert on module **source text** (readFileSync+regex), concentrated on `algebra-ui.mjs`; break on behavior-preserving extraction and can stay green while behavior regresses | algebra-section-order.test.ts:9-13,95-102 |
| QD-TEST-4 | med | design-problem | `ui-solve.mjs` orchestration (`installSolve` DOM+worker closure) untested — only the pure badge helper is | ui-solve.mjs:49,51 |
| QD-TEST-5 | med | optional | `solvers.test.js` ≈76s is the floor unless the file itself is sharded (independent blocks verified) → shard → ~25–30s | solvers.test.js:677-1800 |
| QD-TEST-6 | low | design-problem | Coverage instrumentation excludes every QD target (QD has no `src/`) → no line/branch visibility | vitest.config.ts:23-27 |
| QD-TEST-7 | low | optional | `parse-check` spawns `node --check` per file serially (102×~35ms) | parse-check.test.js:29-37 |

Top moves (behavior-preserving, staged): (1) port the 26 node-suite files (already `export async run()`)
to native Vitest specs (`beforeAll(bootstrap.init)`) → parallelize → wall floor ≈ solvers 76s (~40% cut);
(2) shard `solvers.test.js` → node suite ≈ 25–30s; (3) build pure seams for `ui.mjs`/`ui-solve.mjs`
(the `installX(uiCtx)` + worker-shim pattern already models it) so the god-modules become
characterization-testable **before** restructuring. QD-TEST-2/3/4 are the safety-net gap that **gates**
the QD structural work (CLAUDE.md: "a module never moves without its tests green before and after").

## 4. Systemic patterns (across subsystems)

The findings are not ten unrelated problems; they are a **few patterns repeated**. Ranked by leverage:

**S1 — God-modules from un-extracted orchestration (highest leverage).** The same shape recurs: a huge
top-level closure/class accretes DOM + state + wiring because its sub-pieces close over shared handles
instead of taking a context object. Instances: QD `installAlgebra` (4.2k, §3.1), QD `ui.mjs` (1.9k, §3.3),
CD `init()` (3.6k, §3.4), CD `GLPlot` (2.5k, §3.4). **In every case the seam already exists and is used
elsewhere** — QD's `installX(uiCtx)` factories, CD's `setup*` helpers, CD's extracted render pure-fns.
The fix is to *widen an established local pattern*, not invent one; that keeps each step behavior-preserving.

**S2 — Duplication by parallel family instead of parameterization.** N near-identical files/lanes differing
by a small config. Instances: QD solver families ×10 + seeds mirror ×10 (shell boilerplate, §3.2), QD worker
lifecycle ×6 (§3.3), the 5th open-coded pole-centroid (§3.2), per-subsystem UI panels (direct/schwarz/
param-slice). Same antidote (a factory/config: `defineFamily`, `createWorkerLane`, shared helpers) and same
demonstrated risk: **copies drift and one always lags a fix** — QD-UI-1 already shipped a user-visible bug
(schwarz "stuck on Pass 1/3") that was fixed in only one of the copies.

**S3 — Informal, multiplicative contracts.** No single state source-of-truth (7+ containers in QD, §3.3);
the worker message envelope hand-repeated & untyped in ~11 places (§3.3); cross-tab integration in 3–4
idioms (§3.3); the cross-module dependency graph invisible because it rides the global `QD`/`QD_UI`
namespace, not imports (§3.1). Each new tool re-pays full integration cost — directly counter to the
repo's "each new tool builds fewer primitives from scratch" north-star.

**S4 — The safety net is thinnest exactly where the debt is deepest (the gating constraint).** Because the
god-modules expose no seam (S1), their tests either grep source text (QD ~15 files, §3.5/§3.1) or don't
exist (`ui.mjs`, `ui-solve.mjs`, CD `glPlot`/`init`). Meanwhile the *pure* subsystems (packages,
`prove-plan`, `algebra-store`, solver math) are well-tested. So the refactor's first job in any hot area is
to **build the characterization seam before moving code** — this is a stage, not a precondition to assume.

**S5 — Flat organization hides real boundaries.** QD's 102-file flat `app/` (folderization half-started —
`solvers/seeds/` exists, `solver-*` sit flat beside it, §3.3); CD `main.ts` importing 25 render modules
directly (§3.4). Navigation/onboarding tax; a behavior-preserving codemod fixes it.

**S6 — Manual bookkeeping drifts (low).** Stale nav banner in `ui.mjs`, stale `CONTRIBUTING.md:84`, the
triplicated solver load-order lists, `FLOORS` upkeep. These are symptoms of S2/S3 — a single-source-of-truth
removes the bookkeeping that rots.

### Honest framing (bearing on scope)
**The value is concentrated, not uniform.** The `@cas/*` packages, `prove-plan`, `algebra-store`, the solver
*math*, and `apps/correspondences` are genuinely good — well-factored, tested, cycle-free. The team clearly
knows how to build clean modules; the debt is specifically in the **orchestration / UI / wiring layer that
never received the same extraction treatment**, plus its missing test seams. Consequently a **narrow,
high-leverage intervention — widen the existing seams (S1), collapse the duplicated lanes/families (S2),
and build the missing test seams (S4)** — captures most of the available value. A sweeping rewrite is neither
warranted nor consistent with the locked ADRs; the plan should be staged, seam-first, and behavior-preserving,
and should explicitly recommend *against* touching the healthy subsystems.

The prior July-2026 review operated at the **finding level** (correctness, honest-labeling, test-integrity);
it did not address these **structural** patterns. This engagement's architectural altitude is therefore
additive, not a redo — the ~48 open July findings are folded in only where a structural stage naturally
subsumes them.
