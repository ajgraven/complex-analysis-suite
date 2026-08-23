# A0 — Orchestrator hygiene sweep

Cheap suite-wide "standard code-review hygiene" checks run directly by the orchestrator
(complementing the per-area agents). HEAD 300c775. Overall: **the suite is exceptionally
clean on hygiene** — the items below are all NIT-level.

## Results

| Check | Result | Verdict |
|-------|--------|---------|
| `describe.only` / `it.only` in tests | **0** | ✅ clean (no silently-skipped sibling tests) |
| `.skip` / `xit` / `xdescribe` / `it.todo` | **0** | ✅ clean |
| `@ts-nocheck` files | **0** | ✅ (CLAUDE.md permits it for gnarly app glue; none present. QD app is `.mjs`, so N/A there) |
| `@ts-ignore` | **0** | ✅ |
| `@ts-expect-error` | **1** | ✅ acceptable (typed negative test) |
| `debugger` statements | **0** | ✅ clean |
| `eslint-disable` (non-test) | **3** | ✅ all justified with an inline `-- reason` comment |
| `dist/` build artifacts tracked in git | **0** | ✅ correctly gitignored (`.gitignore` covers `dist/`, `build/`, `*.tsbuildinfo`, vite timestamp scratch, coverage, `.vitest-census.json`) |
| `console.log`/`.debug`/`.info` in shipped src (non-test) | **~7 real** | see below |
| TODO/FIXME/HACK/XXX in shipped src (non-test) | **5** | all documented deferrals |

## [NIT] Leftover perf-timing `console.log` in shipped code
- **Area:** quadrature-domains · **Location:** `apps/quadrature-domains/app/param-slice/param-slice-render.mjs:260,295,340`
- **Type:** style
- **Evidence:** three `console.log('[param-slice] coarse pass: … in …s')` timing logs fire on every param-slice render in production.
- **Why it matters:** console noise for end users; minor. (The `console.warn/error` in `apps/complex-dynamics/src/render/glPlot.ts` — WebGL context loss, shader-build failures — are legitimate and should stay. The `console.log('[interchange] deep link:', url)` in `schwarz/schwarz-ui.mjs:543-587` are intentional clipboard-unavailable fallbacks, acceptable.)
- **Recommendation:** gate the param-slice timing logs behind a debug flag or remove.

## [NIT] Documented TODOs (informational, not defects)
- `apps/quadrature-domains/app/solvers/solver-uqd-pqd-singular.mjs:37,313` — PQD `h` with a pole at z₀ (Prop 4.6.3) not yet handled. Honest deferral.
- `apps/quadrature-domains/app/solvers/solver-uqd-lqd-singular.mjs:726` — LQD-identity-polyPart per HANDOFF.md §10.
- `apps/quadrature-domains/app/schwarz/schwarz-paint.mjs:211` + `schwarz-ui.mjs:121` — "TODO #16" preimage-tree / tiling-set double-click viz.
- These are legitimate roadmap markers, not stale. Worth confirming they're still tracked somewhere (RISKS.md / an issue) so they aren't silently forgotten.

## Coverage
Ran: grep-based sweeps for test-focus/skip, TS suppressions, debugger, eslint-disable, tracked
build artifacts, console.* in shipped code, and TODO-class markers, across `apps/` + `packages/`
(excluding node_modules, test, perf, and dist). Did NOT: run a formatter-diff check (prettier
`format:check` is a CI gate and was green in the health baseline).
