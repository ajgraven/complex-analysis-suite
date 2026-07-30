# ISSUES — defects & debt found but not (yet) in scope

> Append-only entries; the **Status** field is the only mutable part. Do not tidy this file.
> Populated during Phase B (review) and Phase D (as incidental findings surface). Per-entry format:
>
> ### <ID> — <short title>
> - **Severity:** blocker | high | medium | low
> - **Kind:** confirmed defect | design problem | plausible concern | optional improvement | style
> - **Evidence:** file:line (+ how observed)
> - **Blocks current work?:** yes / no
> - **Status:** open | planned (stage X) | fixed (commit) | wontfix (reason) | invalid
>
> The July-2026 review's ~48 open findings already live in `docs/review/RAW_FINDINGS_2026-07.md`;
> reference them by ID here rather than duplicating, when relevant.

## Phase B review register (2026-07-30)

All entries below: **Blocks current work? no** (pre-implementation review), **Status: open**. Full
evidence & recommended moves in `ASSESSMENT.md` §3–4; systemic roll-up in §4 (S1–S6). Severity =
maintainability impact, not user-facing bug severity. IDs are referenced by PLAN.md v1 stages (Phase C).

**QD algebra/ (§3.1)**
| ID | Sev | Kind | Summary |
|---|---|---|---|
| QD-ALG-1 | high | design-problem | `installAlgebra` ~4,234-line god-function (algebra-ui.mjs:687-4921) |
| QD-ALG-2 | high | design-problem | Sidebar = one `innerHTML` string, wired by stringly-typed ids (1888-2277) |
| QD-ALG-3 | high | design-problem | ~11 source-text (readFileSync+regex) tests instead of behavioral |
| QD-ALG-4 | med | design-problem | Single-flight guard applied 3 ways; `doSolveRadical` omits it (2603) |
| QD-ALG-5 | med | design-problem | Honest-labeling wording built in two places (3521-3553 vs prove-plan) |
| QD-ALG-6 | med | plausible-concern | Realness/verify tolerances scattered as magic literals |
| QD-ALG-7 | low | style | Store getter leaks live `edges` array (algebra-store.mjs:3115) |

**QD solver family (§3.2)**
| ID | Sev | Kind | Summary |
|---|---|---|---|
| QD-SOLV-1 | high | design-problem | Dispatch order (unshift) triplicated across 3 lists; mis-order → wrong φ |
| QD-SOLV-2 | med | confirmed-defect | Stale doc CONTRIBUTING.md:84 ("imports the same graph") |
| QD-SOLV-3 | med | confirmed-defect | 5th open-coded pole-centroid copy; divergent empty-pole fallback |
| QD-SOLV-4 | med | design-problem | ~17-key Family shell + residual skeleton re-typed 10× |
| QD-SOLV-5 | med | design-problem | Seeds mirror = 2nd parallel duplication axis |
| QD-SOLV-6 | low | plausible-concern | `identityOK` gate computed 3× with divergent tol |

**QD UI/orchestration/coupling (§3.3)**
| ID | Sev | Kind | Summary |
|---|---|---|---|
| QD-UI-1 | high | design-problem | Worker lifecycle duplicated 6×; drifted; **already shipped the Schwarz "Pass 1/3" bug** |
| QD-UI-2 | high | design-problem | `ui.mjs` god-module (~20 responsibilities) |
| QD-UI-3 | med | design-problem | No single state SoT: 7+ containers × 3 propagation channels |
| QD-UI-4 | med | plausible-concern | Worker message envelope untyped, hand-repeated ~11×; unknown kind hangs |
| QD-UI-5 | med | design-problem | `ui.mjs`/`ui-solve.mjs`/`ui-domain-plot.mjs` + worker paths: no executable coverage |
| QD-UI-6 | med | design-problem | Flat 56-file `app/` ignores half-started folder taxonomy |
| QD-UI-7 | low | style | Stale nav banner atop `ui.mjs` |
| QD-UI-8 | low | style | Papercuts: `direct-ui` `show`×3; no shared `$`; `sphere-ui` local `state` |
| QD-UI-9 | low | plausible-concern | Tab integration uses 3–4 idioms; no lifecycle contract |

**CD main.ts + render/ (§3.4)**
| ID | Sev | Kind | Summary |
|---|---|---|---|
| CD-1 | high | design-problem | `init()` ~3,660-line god-function (main.ts:958-4623) |
| CD-2 | high | design-problem | `GLPlot` 2,527-line god-class (render/glPlot.ts:344) |
| CD-3 | med-high | design-problem | `main.ts` reaches `plotView.plot.<internal>` 156× (façade bypassed) |
| CD-4 | med | design-problem | render/ 5-module cycle — **type-only**; blocks dependency-cruiser gate |
| CD-5 | med | plausible-concern | 4 largest render/ modules have no unit tests |
| CD-6 | med | plausible-concern | `main.ts` imports 25 render/ modules directly — no façade |
| CD-7 | low | optional | No `dispose()` on GLPlot/PlotView (latent leak under a shared shell) |

**Test infra (§3.5)**
| ID | Sev | Kind | Summary |
|---|---|---|---|
| QD-TEST-1 | high | design-problem | Node suite = 1 serial child process; 2302 asserts in 1 test on 1 core |
| QD-TEST-2 | high | design-problem | `ui.mjs` has zero characterization coverage |
| QD-TEST-3 | med | design-problem | ~15 specs assert on module source text (brittle vs refactor) |
| QD-TEST-4 | med | design-problem | `ui-solve.mjs` orchestration untested |
| QD-TEST-5 | med | optional | `solvers.test.js` ≈76s; shardable → ~25–30s |
| QD-TEST-6 | low | design-problem | Coverage excludes all QD targets (no `src/`) |
| QD-TEST-7 | low | optional | `parse-check` spawns `node --check` per file serially |

**Cross-refs into the July-2026 review** (not re-derived; folded in only where a structural stage subsumes them):
`docs/review/RAW_FINDINGS_2026-07.md` — e.g. `cd-shell-02` (_pcdd precedence), `cd-shell-07` (missing control),
`cd-overlay-01` (per-frame redraw), `cd-metricsworker-01` (worker leak) touch code CD-1/CD-3 would move.

## Status updates (mutable)
- **2026-07-30 · stage A1 (PR → refactor/main):** **QD-SOLV-3 → fixed** (solver-pqd-singular routed to
  `QD.poleCentroid`; D-1 behavior change, char-tested). **QD-SOLV-2 → fixed** (CONTRIBUTING.md corrected).
- **QD-ALG-7 → deferred out of A1** to Group D (algebra work — its natural home). **QD-SOLV-6 → deferred**
  (needs its own behavior analysis at solver.mjs:1774). Both remain **open**.
- **2026-07-30 · stage A3 (PR → refactor/main):** **CD-4 → fixed** (type-only render cycle broken via
  `render/laminationTypes.ts`; madge 2→0; zero runtime change). A1 (#178) now **merged** (b331ae2).
- **2026-07-30 · stage A2 (PR → refactor/main):** **QD-SOLV-1 → guarded** (`assertDispatchOrder`: every
  `_singular` must outrank its base; lazy on first `selectFamily`; behavior-preserving). Underlying 3-list
  triplication **remains open → E2**. A3 (#179) now **merged** (e657769).
