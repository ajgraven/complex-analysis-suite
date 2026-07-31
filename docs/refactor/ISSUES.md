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
- **2026-07-30 · stage B1 (PR → refactor/main):** **QD-TEST-1 → partially addressed** — node-suite now runs
  as 26 parallel Vitest specs (per-file reporting/isolation; parity 2329/0 preserved), BUT wall time is
  **NEUTRAL** (`solvers.test.js` ~77s long pole). The speed win + **QD-TEST-5** (shard solvers) → **B2,
  DEFERRED** (solvers is a 1,915-line monolith; med-high risk; fresh session). A2 (#180) now **merged** (3a5d18f).
- **2026-07-31 · stage B2 (PR → refactor/main):** **QD-TEST-5 → fixed** (ac5f894) — `solvers.test.js` sharded
  into 4 contiguous parallel node specs; parity by byte-identical reconstruction (oracle **2332/0**, per-shard
  Σ = 451 == pre-split). Risk was med-high (per B1) but a verified statement-map downgraded it to low.
  **QD-TEST-1 → the wall-time win B1 enabled is now delivered:** full `pnpm test` **157s → 109s (−30%)**; QD
  node long-pole **77s → 37s**. Residual: §PB [826-935] is one atomic ~38s block that caps the shard split
  below the ~25–30s target; a future sub-block split (copy the pure `poleAt` helper — higher risk, a content
  edit) is **noted, not scheduled**. B1 (#181) now **merged** (08b0fab).
- **2026-07-31 · stage B4-1 (PR → refactor/main):** **QD-TEST-4 → fixed** (d17e9df) — `ui-solve.mjs` solve
  orchestration now has a 12-test behavioral net (`vitest/ui-solve-orchestration.test.ts`): input guards,
  dispatch/fallback, error-vs-abort settle, supersede, busy-ownership, cancel, auto-escalation. Tests-only, no
  source change; mutation-verified to bite. **QD-UI-5 → partially addressed** (ui-solve orchestration covered; the
  worker-message paths + ui.mjs still open → B4-2 / later). **SCOPE DISCOVERY:** **QD-TEST-2 (ui.mjs, high) stays
  OPEN** — ui.mjs has 0 exports / no seam, so a behavioral net needs a seam first (a source change) → deferred to
  its own small stage before D2 (D2 shrinks ui.mjs). **QD-ALG-3 / QD-TEST-3** (algebra source-text tests) stay
  open → folded into D1 (they target `algebra-ui.mjs`, not ui-solve). B2 (#182) now **merged** (e74d3e6).
- **2026-07-31 · stage B4-2a (PR → refactor/main):** **QD-UI-1 → partially addressed** (48f89cb) — the PSW
  worker-lane **crash + messageerror contract** is now pinned (`vitest/psw-crash-char.test.ts`, 7 tests) so the
  Group-C lane dedup (C1 `createWorkerLane` / C2 typed protocol) can't silently change it; the messageerror
  ASYMMETRY (primary has a handler, aux/live don't) is frozen. Shared `vitest/helpers/fake-worker.mjs` extracted
  (additive — existing lane tests untouched). Tests-only; mutation-verified. **QD-UI-4 → partially addressed**
  (asymmetric envelope behavior frozen). **Remaining → B4-2b:** sym + schwarz + param-slice-pool lane gaps.
  The underlying 6× duplication itself remains **open → Group C** (this net is its safety net). B4-1 (#183) now
  **merged** (e1a148a).
- **2026-07-31 · stage B4-2b (PR → refactor/main):** **QD-UI-1 → further addressed** (932fb64) — the SymWorker
  crash contract is now pinned (`vitest/sym-worker-crash-char.test.ts`, 3 tests): worker-level `error` (job in
  flight → reject; F4 idle → sticky fallback), `messageerror` absence. Together with B4-2a, **all three
  solver-worker lanes' crash contract is frozen** before the Group-C lane dedup. Tests-only; mutation-verified.
  **Remaining lane gaps are P2** (schwarz `isUsable`/preempt/`handle.cancel`/`onUnavailable` — schwarz crash-settle
  already covered; param-slice-pool event-wiring/survivor) → **optional B4-2c / fold into Group C**. B4-2a (#184)
  now **merged** (7a025e3).
- **2026-07-31 · stage B4-2c (PR → refactor/main):** **QD-UI-1 → lifecycle net COMPLETE for all 6 lanes** — added
  `vitest/schwarz-cpu-worker-lifecycle.test.ts` (9: `isUsable` gate / `onUnavailable` / streaming passes + stale-jobId
  / preempt / `handle.cancel` / cancel-before-spawn) + 2 `param-slice-pool.test.ts` cases (`runSweep` event-wiring;
  survivor=0 drain). Tests-only, mutation-verified (3 guards broken → each fails only its target → reverted via Edit).
  Green 2092/240. **FINDING (evidence):** the remaining 3 lanes do NOT fit the C1a `createWorkerLane` factory —
  sym=terminate-on-supersede+progress+F4-latch, schwarz=`isUsable`+streaming-handle, param-slice=N-worker pool. So
  **C1b is revised** from "collapse onto the factory" to "extract the shared crash-settle + ensureReady-latch
  FRAGMENT" (the drift-prone piece that shipped the schwarz Pass-1/3 bug). PLAN v1 C1 "6 lanes = config" premise →
  flagged for revision at the C1b design gate (NOT rewritten in this tests-only PR). C1a (#186) now **merged**
  (007681a).
- **2026-07-31 · stage C1b (PR → refactor/main):** **QD-UI-1 → RESOLVED (C1a + C1b).** C1a (#186) collapsed the 3
  verbatim PSW lanes onto `createWorkerLane` (−40%); C1b extracted the one remaining cross-cutting primitive,
  `formatWorkerErrorDetail(ev)` (NEW `app/workers/worker-crash-detail.mjs`), retrofitting all 4 lane wrappers.
  Behavior-preserving (6-lane net **54/54**; full 2092/240). The residual per-lane divergence (sym terminate-on-
  supersede + F4 latch + progress; schwarz `isUsable` + streaming handle; param-slice N-worker pool) is documented
  as **legitimate distinct abstractions**, not duplication — so the "6× lifecycle" finding is closed to its true
  residual, not force-merged. The drift class (the schwarz Pass-1/3 bug) stays frozen by the net. B4-2c (#187) now
  **merged** (551c9c6). **Group C worker-lane work (C1) DONE** → next C2 (typed protocol) / C3.
- **2026-07-31 · stage C2 (PR → refactor/main):** **QD-UI-4 → addressed (primary path).** NEW
  `app/workers/protocol.mjs` (`reply`/`replyError`/`dispatch`); `solver-worker-entry.mjs` retrofit (53→31) — the
  3-kind chain → a `handlers` map + `dispatch`, which replies with an error envelope for an unhandled kind instead
  of dropping it (the silent-hang fix — an APPROVED behavior change per PLAN v1 C2). Char-net-first
  (`vitest/worker-protocol.test.ts`; known-kind round-trip pinned + mutation-verified BEFORE the refactor, then the
  unknown-kind assertion flipped to the fix) — also begins closing **QD-UI-5** (worker-entry dispatch had no
  executable coverage). Green 2103/241. **Remaining → C2b:** route the sym / param-slice / schwarz entry reply
  envelopes through `protocol.mjs` (they don't dispatch on input kind, so no hang there — envelope DRY only). C1b
  (#188) now **merged** (a6332d5).
- **2026-07-31 · stage C3a (PR → refactor/main):** **QD-SOLV-4/5 → net laid (net-first for C3b).**
  `vitest/solver-family-golden.test.ts` (11) pins `residual`/`packPhi`/`computeTargets` per family on the
  deterministic `initialGuess` phi (test-derived inputs) — the safety net for the `defineFamily(config)` shell
  factoring (C3b). Tests-only, mutation-verified, green **2114/242**. Family shells confirmed uniform (17-key base;
  +`sampleBoundary` on the 4 PQD → 18; `{A,F,G}` only on unboundedLQD_singular; math per-family). The underlying
  ~10× re-typed shell + seeds mirror **remains open → C3b** (this net guards it). C2 (#189) now **merged**
  (3cc3e0d).
- **2026-07-31 · stage C1a (PR → refactor/main):** **QD-UI-1 → PSW 3× lane duplication ELIMINATED** (86c7bcf) —
  primary/aux/live collapsed to a `createWorkerLane(cfg)` factory (primary-solver-worker.mjs 395→238, −40%),
  behavior-preserving (net stays green 20/20; full 2081/239), independent fallback latches kept. First structural
  refactor of Group C, guarded by the B4-2a crash net. **Remaining QD-UI-1 → C1b** (sym/schwarz/pool lanes onto the
  same factory) + **C2** (QD-UI-4 typed protocol). B4-2b (#185) now **merged** (ecb5124).
- **2026-07-31 · stage C3b part 1 (PR → refactor/main):** **QD-SOLV-4/5 → in progress.** NEW
  `app/solvers/define-family.mjs` (`defineFamily(config)` factors the record scaffolding); 3/10 families retrofit
  (boundedQD/unboundedQD/boundedLQD). Behavior-preserving (C3a golden net 11/11; suite 2332/0). **FINDING:** the
  shells diverge more than the C3a map showed — `diverseInitialGuess` is per-family for LQD (own kernel, not the
  shared delegation) and seed/continuation arg conventions vary — so defineFamily injects those (default diverse
  only when omitted), a scaffolding-factor not a collapse. Remaining 7 families → **C3b part 2** (incl. the
  `{A,F,G}` `computeTargetG` case + the 4 PQD `sampleBoundary` key). C3a (#190) now **merged** (8357d15).
- **2026-07-31 · stage C3b part 2 (PR → refactor/main):** **QD-SOLV-4 → RESOLVED.** All 10 solver families are now
  assembled by `defineFamily(config)`; the ~17-key record is no longer re-typed per file. Part 2 did the remaining
  7 (unboundedLQD, boundedLQD_singular, unboundedLQD_singular [`{A,F,G}`], powerQD, powerQD_singular, unboundedPQD,
  unboundedPQD_singular). Behavior-preserving — C3a golden net **11/11**, suite green (2114/242, oracle 0 failed);
  diffs confined to the Family literal + import (math untouched). Executed by a subagent that stalled with the PQD
  batch uncommitted → main session verified + committed it (b9f0b9a). **QD-SOLV-5 (seeds mirror) → REMAINS OPEN:**
  defineFamily unified the seed *wiring*, but the seed *strategy* files (`solvers/seeds/*`) stay per-family; a
  `seeds-common` extraction was NOT pursued (out of C3b scope). **Group C dedup COMPLETE** (C1/C2/C3). C3b-p1
  (#191) now **merged** (3ac7dc2).
- **2026-07-31 · stage D-ui-seam (PR → refactor/main):** **QD-UI-2 → first seam carved; QD-TEST-2 → partially
  addressed.** Extracted the pure domain-mode algebra (composeMode/decomposeMode/modeSummary) from ui.mjs into NEW
  `app/ui-domain-mode.mjs` + a 19-test characterization net (`vitest/ui-domain-mode.test.ts`, mutation-verified) —
  ui.mjs's FIRST executable coverage (also chips QD-UI-5). Behavior-preserving (green 2133/243). **Revised
  understanding:** ui.mjs is the Phase-2 port; most responsibilities already live in sibling modules (installX
  factories), so it's mostly DOM wiring — the "god-module" is less monolithic than QD-UI-2 implied. Remaining pure
  seam: the geometry pair (boundarySelfIntersectsSimple/segmentsIntersect). The bigger still-monolithic Group-D
  target is **installAlgebra** (QD-ALG-1). C3b-p2 (#192) now **merged** (be6a51e).
