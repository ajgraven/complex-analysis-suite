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
- **2026-07-31 · stage D-ui-seam-2 (PR → refactor/main):** **QD-UI-2 → ui.mjs pure-seam extraction COMPLETE.**
  Extracted the geometry pair (boundarySelfIntersectsSimple/segmentsIntersect) → NEW `app/ui-geometry.mjs` + a
  6-test net (`vitest/ui-geometry.test.ts`, mutation-verified; pins the collinear-miss quirk). Behavior-preserving
  (green 2139/244). Both pure pieces the ui.mjs map found are now seamed out + netted; ui.mjs's residual bulk is
  DOM wiring (logic already in siblings). Remaining Group-D monolith = **installAlgebra** (QD-ALG-1) — big +
  DOM-heavy, needs its own char-strategy before implementation. D-ui-seam (#193) now **merged** (29a7f97).
- **2026-07-31 · stage D-alg-carve-1 (PR → refactor/main):** **QD-ALG-1 → decomposition begun; QD-ALG-5 →
  partially addressed + CORRECTED.** First installAlgebra carve-out (user chose "Carve-outs"): the pure
  verdict-prose decision tree in doClassify (algebra-ui.mjs:3521-3534) → NEW `app/algebra/algebra-labeling.mjs`
  (`classifyVerdict` + its only dep `posDimDesc`, moved from the IIFE) + an 11-test net
  (`vitest/algebra-classify-verdict.test.ts`, mutation-verified; imported directly — pure, no jsdom). Correction to
  QD-ALG-5's "built in two places": the wording is built in THREE — doClassify @3521, doAutoSolve @3275,
  `_verdictBadge` @4693 — and they have DRIFTED (different strings), so this is a per-site pure SEAM (first
  executable coverage of the =/≤ honest-labeling prose, behavior-preserving), NOT the cross-site de-dup QD-ALG-5
  implied. That de-dup would change strings ⇒ needs an approval token; deferred to a later characterization-first
  unification. `posDimDesc`'s QD_UI re-export is preserved, so `algebra-verdict-rigor.test.ts` stays green.
- **2026-07-31 · stage D-alg-carve-2 (PR → refactor/main):** **QD-ALG-1 → decomposition continues (carve-out 2).**
  Lifted the pure chip-badge builder `_verdictBadge` (classify result → `{badge,state,title}`, the THIRD of the three
  drifted verdict builders) out of installAlgebra to IIFE scope (the T1 in-file-lift pattern), giving it its first
  executable coverage. Chose an in-file lift over a module move because `_verdictBadge`'s dep chain
  (`sliceLabels`→`latexPlain`) is woven through ~50 installAlgebra references (label toasts, pickers, PROV_UI) — moving
  it would be a huge blast radius for netting one function. NEW 10-test net (`vitest/algebra-verdict-badge.test.ts`,
  jsdom + QD_UI, mutation-verified) pins the badge glyph/state/title, the C-1 honest-labeling guardrail (a lone real
  solution is state 'multi' + "upper bound on #QD", never a green 'unique'), and the slice/branch specialization
  suffix. In-file move ⇒ byte-identical strings (verified: the 24-line body is identical modulo indentation); callers
  (cacheActiveVerdict / classifyAllBranches) unchanged. QD-ALG-5 status unchanged (unification still deferred).
- **2026-07-31 · stage D-alg-carve-3 (PR → refactor/main):** **QD-ALG-1 → decomposition continues (carve-out 3);
  QD-ALG-6 → assessed, NOT the target.** Extracted the pure exact-ℚ(i) value formatter `exactValueStr` + its private
  helper `fmtRat` (float → exact rational via the store's continued-fraction rationalizer `QD.QDEquations.ratApprox`)
  out of installAlgebra → NEW `app/algebra/algebra-format.mjs` + an 8-test HEADLESS net
  (`vitest/algebra-exact-format.test.ts`, mutation-verified). The module side-effect-imports `qd-equations` (which
  registers `ratApprox` on the QD singleton — it has no direct export), so the net runs with no jsdom. Behavior-
  preserving: 8 behavior-critical literals byte-identity-checked vs source (incl. the typographic MINUS U+2212, pinned
  as a display guardrail); the 4 `exactValueStr` call sites unchanged; the installAlgebra `QE` binding (used 20× else)
  kept. **QD-ALG-6** (realness/verify tolerances as magic literals) assessed firsthand and **DECLINED as a carve-out**:
  the ~6 tolerance constants (1e-6 verify, 1e-6 realness, 1e-12 w0-match, 1e-10/1e-8 display-snap) sit at unrelated call
  sites with genuinely different meanings — no single pure computation to net, and unifying them would risk behavior.
  Remains **open** (a constants-table cleanup, not a pure carve-out).
- **2026-07-31 · stage D-alg-carve-4 (PR → refactor/main):** **QD-ALG-1 → decomposition continues (carve-out 4).**
  Extracted the two pure substitution ratio-prefix formatters `fmtRatio(g)` (live Gaussian) + `ratioStrRec(rec, sign)`
  (serialized `{re:[n,d],im:[n,d]}` record) — both render the "(c)·" coefficient before an identified variable — out of
  installAlgebra to EXTEND `app/algebra/algebra-format.mjs` (they call the co-located `exactValueStr`) + a 6-test HEADLESS
  net (`vitest/algebra-ratio-format.test.ts`, mutation-verified). Behavior-preserving: 8 fragments byte-identity-checked
  vs source (incl. the U+2212 minus + U+00B7 middot); `fmtRatio`'s 2 callers + `ratioStrRec`'s 2 PROV_UI ctx-inject
  sites resolve to the imports, the PROV_UI param-uses unaffected. `algebra-format.mjs` now holds the exact-value + the
  ratio-prefix formatters. **The pure low-hanging targets inside installAlgebra are now nearly exhausted** — a 5th
  carve-out would need a fresh scan, and the remaining bulk (QD-ALG-2 DOM-bound sidebar, QD-ALG-3 source-text tests)
  needs a different strategy than pure extraction.
- **2026-07-31 · stage D-alg-carve-5 (PR → refactor/main):** **QD-ALG-1 → decomposition continues (carve-out 5); the
  "nearly exhausted" note above is CORRECTED.** A read-only census of installAlgebra found the pure fruit is NOT
  exhausted — **~16 cleanly-pure + ~4 pure-if-injected** helpers remain. Carve-out 5 takes the census top pick: the
  complex-moment INPUT PARSER `_parseMomentToken` + its private `_parseMomentNum` (rational `n/d` / decimal / complex
  `a±bi` tokens, with explicit error paths: "empty moment", "i must be last", "bad rational/number") → NEW
  `app/algebra/algebra-moment-parse.mjs` (**ZERO external deps** — a pure leaf) + a 9-test HEADLESS net
  (`vitest/algebra-moment-parse.test.ts`, mutation-verified; pins the error MESSAGES too — they're user-facing).
  Behavior-preserving (carved verbatim; whitespace-normalized diff vs source = identical bar a blank-line separator);
  the one external caller (`doShapeFromMoments` `.map(_parseMomentToken)`) resolves to the import. Census-ranked next:
  `withGuidance`+`_isCapFailure` (honest-labeling guidance, ~19 sites), `_pronyLatex`, `valStr`+`substList` (whose real
  impls the PROV_UI tests currently MOCK), then cheap stragglers, then `latexOf`(+`reimSafeLatex`) pure-if-injected.
- **2026-07-31 · stage D-alg-carve-6 (PR → refactor/main):** **QD-ALG-1 → decomposition continues (carve-out 6).**
  Extracted the cap-failure guidance pair `withGuidance` + its `_isCapFailure` recognizer (a substring regex over a
  failure `reason` → looks like a resource/too-large cap? → append the CAS-export escape-hatch hint; else pass through)
  out of installAlgebra → EXTEND `app/algebra/algebra-labeling.mjs` (the honest-labeling module) + a 6-test HEADLESS net
  (`vitest/algebra-cap-guidance.test.ts`, mutation-verified; pins the guidance sentence verbatim incl. its leading
  double-space, and the substring-match quirk — "escape" contains "cap"). Behavior-preserving (3 fragments byte-identity-
  checked vs source). The ~19 `withGuidance` call sites (every op's failure path) resolve to the import; the DOM-coupled
  `capFailVerdict` stays but now calls the imported `_isCapFailure`. `algebra-labeling.mjs` now holds verdict prose +
  failure guidance.
- **2026-07-31 · stage D-alg-carve-7 (PR → refactor/main):** **QD-ALG-1 → decomposition continues (carve-out 7).**
  Extracted `_pronyLatex(coeffs)` — the Prony-polynomial math→LaTeX formatter (Σ cₖzᵏ=0: descending powers, 1e-6
  rounding, near-zero-term drop, unit-coeff elision on a z-power, leading-sign handling, parenthesised `(a±bi)zᵏ` for
  complex coeffs) — out of installAlgebra → NEW `app/algebra/algebra-latex.mjs` (pure, ZERO external deps — only
  Math/String + the `coeffs` arg) + an 8-test HEADLESS net (`vitest/algebra-prony-latex.test.ts`, mutation-verified).
  Behavior-preserving (byte-identity: the 20-line body is identical modulo indent + `export`). The one caller
  (`doShapeFromMoments`) resolves to the import. NEW `algebra-latex.mjs` is the intended home for the census's other
  pure LaTeX builders (`buildHForm` / `latexOf` / `reimSafeLatex`) as they get carved out.
- **2026-07-31 · stage D-alg-carve-8 (PR → refactor/main):** **QD-ALG-1 → decomposition continues (carve-out 8); the
  census's `valStr`+`substList` pair was SPLIT — `valStr` done, `substList` deferred.** Extracted `valStr(rec)` — the
  compact DECIMAL display of a stored `{approx:{re,im}}` value record ("re ± im·i", 1e-6 rounding, U+2212 minus; the
  per-card hovertext value, distinct from `exactValueStr`'s exact ℚ(i)) — out of installAlgebra → EXTEND
  `app/algebra/algebra-format.mjs` + a 6-test HEADLESS net (`vitest/algebra-valstr.test.ts`, mutation-verified). `valStr`
  is a pure leaf (Math/String only). It's INJECTED into the PROV_UI ctx (→ resolves to import); the PROV_UI param-uses
  and `substList`'s internal use now call the imported `valStr`. 5 fragments byte-identity-checked (incl. U+2212).
  **`substList` DEFERRED:** it calls `latexPlain` — the IIFE-scoped ~50-ref helper carve-out 2 showed is un-exportable
  (a module import would cycle; moving `latexPlain` is a ~50-site blast radius). Moving `substList` to a module needs
  `latexPlain` injected as a PARAMETER + edits to its 2 PROV_UI builder call sites (a signature change touching the
  tested registry), so it is NOT a verbatim carve — left for a deliberate step (e.g. bundled with a `latexPlain`-injection carve).
- **2026-07-31 · stage D-alg-carve-9 (PR → refactor/main):** **QD-ALG-1 → decomposition continues (carve-out 9).**
  Extracted `buildHForm(hData, numeric)` — the quadrature-data LaTeX builder (h(w) = Σⱼ Σ_{s≥1} C_{j,s}/(w−aⱼ)^s;
  symbolic `a_{j}`/`C_{j,s}` names, or the pole/coefficient values substituted via `QD.RiemannLatex.katexCmpxParen`)
  — out of installAlgebra → EXTEND `app/algebra/algebra-latex.mjs` + a 5-test HEADLESS net (`vitest/algebra-hform.test.ts`,
  mutation-verified). Its one dep is `QD.RiemannLatex.katexCmpxParen`, a QD-namespace method registered on the singleton
  by importing `riemann-latex.mjs` (no direct export), so the module side-effect-imports it (the same pattern
  `algebra-format` uses for QDEquations) → headless net (both symbolic + numeric modes covered). Carved VERBATIM (only
  QD→_QD; 4 fragments + the return line byte-identity-checked). The one caller (the φ/h reference card) resolves to the
  import. `algebra-latex.mjs` now holds `_pronyLatex` + `buildHForm`.
- **2026-08-01 · stage p1-a1-residuals (PR → refactor/main):** **QD-ALG-7 → FIXED; QD-SOLV-6 → FIXED** (COMPLETION-PLAN
  Phase 1, the two A1 residuals). QD-ALG-7: `edges` getter now returns `edges.slice()` (was leaking the live array;
  no caller mutated it, so behavior-preserving) — content-pin + isolation net in `app/test/algebra-store.test.js`.
  QD-SOLV-6: the ×3 open-coded `maxRelDiff < 1e-6` gate collapsed to one exported `IDENTITY_TOL = 1e-6` (default was
  uniformly 1e-6 — structural, not value, divergence; override semantics unchanged) — net `vitest/solver-identity-tol.test.ts`
  (mutation-verified). param-slice-common.mjs site D (already `opts.identityTol || 1e-6`) left as-is.
- **2026-08-01 · stage p1-f1-depcruise (PR → refactor/main):** **F1 → DONE** (COMPLETION-PLAN Phase 1 close-out).
  Wired dependency-cruiser (`.dependency-cruiser.cjs` + a `dep:check` folded into `pnpm lint`): `no-circular` +
  `no-package-to-app` + `no-cross-app`, with `tsPreCompilationDeps: true` (type-only imports in the graph). Passes on
  the current graph (580 modules, 0 violations); all 3 rules mutation-verified incl. a pure type-only cycle. **CD-4**
  (type-only render cycle, fixed A3) is now ACTIVELY GATED — a regression fails `pnpm lint` locally + in CI + at deploy.
- **2026-08-01 · stage p2-1-mount-harness (PR → refactor/main):** **QD-ALG-3 → STARTED** (Phase 2, the D1 enabler).
  NEW reusable jsdom mount harness `vitest/_algebra-mount.ts` (mounts installAlgebra headlessly — AlgebraCanvas is SVG,
  no canvas ctx needed). First conversion: `algebra-section-order.test.ts` node/source-regex → jsdom/behavioural
  (queries the rendered #alg-sections; mutation-verified by renaming a production section). 1 of 11 source-text algebra
  tests converted; the harness unblocks the rest (PRs 2.2/2.3). Behavioural pins survive the D1a sidebar-as-data refactor.
- **2026-08-01 · stage p2-2-algebra-dom (PR → refactor/main):** **QD-ALG-3 → 2/11** (Phase 2). eliminate-section
  converted as a SPLIT — NEW behavioural `algebra-eliminate-section-dom.test.ts` (8 jsdom tests: picker placement,
  caption grouping, js-busy-lock marker, ui-strings-materialised tooltip, elim-hint caption; mutation-verified) +
  slimmed node `algebra-eliminate-section.test.ts` (function-body/wiring/strings-data invariants). Audit refined: the
  11 are mixes of markup-regex (→behavioural) / function-body (→node, D1d) / strings-data (→node); resultStateOf
  already behavioural. 2209/255.
- **2026-08-01 · stage p2-3-labels-tooltips (PR → refactor/main):** **QD-ALG-3 → 4/11** (Phase 2, thorough splits per
  user calibration). honest-labels + tooltip-tiers each split — NEW behavioural `-dom` companions (button labels;
  materialised-title ≤120 + relocated-hook absence; both mutation-verified) + slimmed node files (wiring/guard-order/
  algebraOps DATA). 2210/257. Remaining: workflow-sections, scope-disclosure, tier6, shortcuts-table, canvas-chrome,
  verdict-labeling(→D1c).
- **2026-08-01 · stage p2-4-structure-banner (PR → refactor/main):** **QD-ALG-3 → 7/11** (Phase 2, thorough splits).
  workflow-sections + scope-disclosure + tier6 each split — NEW behavioural `-dom` companions (sections render +
  WORKFLOW_STEPS resolve; #alg-scope outside #alg-sections; the two re-seed controls + every heavy-op carry
  js-busy-lock; all mutation-verified) + slimmed node files (handler/registry/CSS/source residue). 2210/260.
  Remaining: shortcuts-table, canvas-chrome, verdict-labeling(→D1c).
- **2026-08-02 · Phase 2 CLOSEOUT (QD-ALG-3):** the D1a behavioural net is COMPLETE — all 7 sidebar-markup files
  converted to behavioural `-dom` companions (#206–#209), source-structural residue slimmed into node companions.
  Remaining source-text algebra tests stay node-source (assessed): canvas-chrome tests algebra-canvas.mjs (not
  D1-decomposed); verdict-labeling is a source-absence guard → revisit at **D1c**; shortcuts-table dispatch needs a
  seeded-store mount (buttons disabled + #alg-focus canvas-created at empty mount) — its target buttons already
  behaviourally guarded; results-drawer resultStateOf already behavioural. Phase 2 → Phase 3 (D1).
- **2026-08-02 · stage p3-d1a-sidebar-snapshot (PR → refactor/main):** **Phase 3 D1a kickoff (QD-ALG-2).** NET-FIRST:
  NEW `vitest/algebra-sidebar-html.test.ts` snapshots the whole normalized #controls-algebra DOM (mutation-verified —
  catches a control-attribute change the `-dom` net misses). Guards the upcoming mountSidebar → data-driven rewrite as
  behavior-preserving. 2211/261.
- **2026-08-02 · stage p3-d1a-sidebar-data (PR → refactor/main):** **Phase 3 D1a transformation (QD-ALG-2).**
  mountSidebar's inline `#alg-sections` string → a `SIDEBAR_SECTIONS` data array (8 `{summary,open?,body}` + 1
  `{divider}`) mapped through one `renderSection` helper; wrapper emitted once, section bodies verbatim; header/suggest/
  inspector/scope unchanged. Behavior-preserving: pre-flight node oracle proved `normalize()`-equal (12394 chars) before
  editing; #210 fingerprint + all 20 jsdom algebra files (166 tests) green; mutation-verified (drop-a-section fails).
  2211/261 (unchanged count — pure refactor). Next: D1b runOp single-flight → re-eval gate.
- **2026-08-02 · stage p3-d1b-oprunner-harness (PR → refactor/main):** **Phase 3 D1b Stage 1 (QD-ALG-4), NET-FIRST, no
  production change.** Harness `mountAlgebra(_, {withCanvas})` + `seedMoments`/`nodeCards`/`selectNode` make the op-runner
  seam behaviourally reachable in jsdom (seed via A–S moments = no solve; canvas opt-in keeps the #210 fingerprint +
  20 jsdom tests byte-identical). NEW `algebra-op-runner.test.ts` (8) pins the busy lifecycle, single-flight (button-
  disable primary + busyGuard backstop), and doSolveRadical's CURRENT run-while-busy. Mutation-verified (3 mutations,
  each caught the intended test + reverted byte-identically). QD.QoL not booted (would change the fingerprint) → guard
  proven by no-execution, not toast. 2219/262. Next: Stage 2 runOp extraction (behaviour-preserving).
- **2026-08-02 · stage p3-d1b-runop (PR → refactor/main):** **Phase 3 D1b Stage 2 (QD-ALG-4), behavior-preserving.**
  Extracted the shared busy lifecycle of the async ops into `_opBegin(label)` / `_opEnd()` (a single `runOp(run,onOk)`
  wrapper does not fit doAutoSolve's multi-step flow or the prove-family's `.then().catch()`). Scripted fold: 19 setups →
  `_opBegin`, 35 teardowns → `_opEnd`; guard style + control flow + error expression byte-preserved (NO guard-unification).
  doAutoSolve + doDecompose keep bespoke inline handling. Op-runner net + 21 jsdom files green; mutation-verified.
  2219/262 (no test delta). Next: Stage 3 (doSolveRadical guard [token✓] + guard-unify [ASK for token]).
- **2026-08-02 · stage p3-d1b-solveradical-guard (PR → refactor/main):** **Phase 3 D1b Stage 3a — the ONE authorized
  behavioral change (token granted).** doSolveRadical gained `if (busyGuard()) return;`. DELTA: the inspector's "Solve for
  a variable" (a synchronous, read-only main-thread solve whose button is not js-busy-lock) now BAILS "Busy — wait…" while
  a worker op is in flight instead of running (built the solve panel). Not a correctness fix (single-threaded, read-only) —
  UX-consistency with Duplicate/Delete. The Stage-1 net's doSolveRadical pin FLIPPED (STILL-runs → BAILS): a reviewed diff,
  mutation-verified. 2219/262 (assertion flip, no count change). Next: PAUSE at re-eval gate + ASK for the Stage-3b
  guard-unification token.
- **2026-08-02 · stage p3-d1c-verdict-unify (PR → refactor/main):** **Phase 3 D1c (QD-ALG-5) — authorized behavioral
  change (token✓).** Audit narrowed scope: classifyVerdict already extracted + doClassify routed through it; _verdictBadge
  is a chip (stays); the last inline drift was doAutoSolve. Routed doAutoSolve → classifyVerdict(cl) (both handlers now
  share ONE builder). String delta logged (LOG) — honest =/≤/≈ labeling preserved (every real-count case keeps "upper
  bound" + "run Certify univalence"). Net: classifyVerdict prose already pinned (algebra-classify-verdict.test.ts) +
  NEW source guard (doClassify & doAutoSolve both route through it; drifted strings gone); mutation-verified. 2222/262.
  Next: D1d (installAlgebra split).
- **2026-08-02 · stage p3-d1d-op-runner (PR → refactor/main):** **Phase 3 D1d seam 1 (QD-ALG-1) — behavior-preserving.**
  First installAlgebra-split seam: extracted the single-flight op-runner (`_abort`/`_busy` + setBusy/begin/end/guard/cancel)
  from the ~4085-line closure to `algebra-op-runner.mjs` (ctx-injected `createOpRunner`); ~90 call sites → `ops.*` (uniform
  global-replace + 2 bespoke begins hand-folded). Two teardown shapes kept distinct: `end()` (clears status) vs
  `end({ keepStatus:true })` (doGroebner/doAutoSolve, which write their own terminal status). Nets followed the code:
  op-runner net +1 Gröbner keepStatus case (net-first, green pre-refactor); tier6 setBusy-mechanism pin reads the module.
  Mutation-verified (guard() break → 2 net fails, reverted via Edit). Green: build/typecheck/lint(+dep:check 590)/test —
  **2223/262**. Next: seam 2 (verdict + results).
- **2026-08-03 · stage p3-d1d-results-drawer (PR → refactor/main):** **Phase 3 D1d seam 2 (QD-ALG-1) — behavior-preserving.**
  Extracted the results-drawer subsystem (`_results` history keyed by (track,branchSig); showResult/reshowResult/resultState/
  renderDrawer/setResultColCollapsed) from the ~4046-line closure to `algebra-results-drawer.mjs` (ctx-injected
  `createResultsDrawer`). Facade: `const showResult = results.showResult` + `const renderDrawer = results.render` keep the ~13
  call sites + rerender BYTE-unchanged; workflowFacts → results.hasResults()/hasCurrent(). Net repointed SRC→module for the
  structural invariants (+ a new "0 direct canvas.setVerdict in the root" pin); resultStateOf + rerender/autosave stay on SRC.
  Mutation-verified (break demotion → net fails). Green: build/typecheck/lint(+dep:check 591)/test — **2223/262**. Next: seam 3.
- **2026-08-03 · stage p3-d1d-picker (PR → refactor/main):** **Phase 3 D1d seam 3 (QD-ALG-1) — behavior-preserving.** The
  cleanest cut: the dropdown-checklist picker widget (`buildPicker` + the `_openMenu`/`_closeOpenMenu` single-open coordinator,
  ~65 lines) → `algebra-picker.mjs`, a **ctx-FREE** `createPickerManager() → { build, closeOpen }` (no store/canvas/$/toast).
  3 call sites: `const pickers = createPickerManager()`, `pickers.build(…)` ×2, `pickers.closeOpen()`; `friendlyVar` stays.
  **Net BUILT net-first** (algebra-picker.test.ts, 6 jsdom tests — open/toggle/single-open/Esc/outside-click; green pre-refactor)
  since the widget had no runtime coverage; shortcuts-table's escapability+aria pins repointed SRC→module (its context-menu pins
  stay). Mutation-verified (neutralize coordinator hide → both nets fail). Green: build/typecheck/lint(+dep:check 593)/test —
  **2229/262**. Next: seam 4.
- **2026-08-03 · stage p3-d1d-autosave (PR → refactor/main):** **Phase 3 D1d seam 4 (QD-ALG-1) — behavior-preserving.** The
  autosave CORE (localStorage debounce: `_writeAutosave`/`scheduleAutosave`/`_readAutosave` + `_saveTimer`/`_saveBlocked` +
  KEY/MAX/DEBOUNCE) → `algebra-autosave.mjs`, ctx-injected `createAutosaver({store,toast}) → {schedule,read,clear,flush,
  isBlocked}`. 4 touch points: rerender→schedule; offerRestore→read+clear; beforeunload→flush+isBlocked. offerRestore (restore
  UI) + confirmReplace (separate concern) stay in root, driving the core via its API. **Net BUILT net-first**
  (algebra-autosave.test.ts, 3 jsdom tests — debounced-not-synchronous / beforeunload-flush-commits / faithful-session; green
  pre-refactor); drawer's "not autosaved" cross-check repointed SRC→module (else vacuous). Mutation-verified (misdirect the
  write → net fails). Green: build/typecheck/lint(+dep:check 595)/test — **2232/262**. Next: seam 5 (inspector) or re-eval.
- **2026-08-03 · D1d seam-5 (inspector) SCOPED, not extracted (user → Phase 4).** The "inspector" is a ~350-line woven
  subsystem (renderInspector + the **shared** nodeActions [used by the sidebar panel AND openNodeMenu] + doFactor/doSolveRadical
  + updateCost/renderScopeBanner); a clean extraction needs ~15 ctx deps = re-exposing installAlgebra's internals, not
  decoupling. Architectural read: post-4-seams, the residue (inspector + node-action layer + canvas-selection + mutation→rerender)
  IS the composition core. D1d judged far enough; move to Phase 4.
- **2026-08-03 · stage p4-ui-seam (PR → refactor/main):** **Phase 4 D2 stage 1 (QD-UI-2) — behavior-preserving; the deferred
  B4 prerequisite.** ui.mjs (1891 lines, 0 exports) BOOTED ON IMPORT → un-importable/uncharacterizable. Wrapped the ENTIRE body
  (82–1891) in `function bootQdUi()` (0 exports ⇒ one scope, all hoisted, no boundary problem — incl. 4 fns called pre-boot) +
  EOF guard `typeof document !== 'undefined' && document.querySelector('#canvas')`. `indent:'off'` ⇒ wrapped WITHOUT re-indent
  ⇒ **12 insertions / 0 deletions, body byte-unchanged** (node --check OK). Real app unchanged (static #canvas precedes the
  deferred main.mjs module). Net BUILT (inverted net-first): ui-boot-seam.test.ts — import w/o DOM neither throws nor boots +
  source pin; mutation-verified (drop guard → both fail); browser CI covers the real boot. Green: build/typecheck/lint/test —
  **2234/262**. Next: Phase 4 stage 2+ (lift bootQdUi chunks into installX(uiCtx) factories).
- **2026-08-03 · stage p5-e2-folderize (PR → refactor/main):** **Phase 5 (E2) — mechanical, behavior-preserving.** Folderized
  the 57 flat app/*.mjs (main.mjs = entry) into ui/(17) solvers/(19) qd/(3) sym/(2) core/(7) analysis/(9) — by prefix + a
  primitives/analysis split of the 16 prefix-less singletons. Codemod (scratchpad/e2-codemod.mjs): uniform relative-STRING
  recompute over 308 files → **427 specifiers in 179 files** (imports + dynamic import() + worker `new URL` strings + readFileSync
  SRC nets); net = build + full suite (pure path edits, zero behavior delta). Four bare-name loaders hand-fixed (codemod skips
  non-`./` strings): bootstrap.js vm-manifest (added a disk-probing relocate() on its importApp choke-point; skip-keys unchanged),
  parse-check.test.js + parse-h-poly-modes.test.ts path.join segments. The 3 load-order lists (main/solver-graph/bootstrap)
  preserved in-order (paths only). git mv → 57 renames (14 R + 43 RM). Green: build/typecheck/lint(+dep:check)/test —
  **2234/265** (tests unchanged; `/262` file-count was stale). Phase 5 done.
- **2026-08-03 · stage p5-e2-docs (PR → refactor/main):** **E2 documentation follow-up — docs-only, zero behavior change.**
  **QD-UI-6 → fixed** (by E2 #221; documented here): the flat 56-file `app/` is now the folder taxonomy `core/ solvers/ qd/
  sym/ analysis/ ui/` (alongside the pre-existing `algebra/ direct/ schwarz/ sphere/ param-slice/ workers/`). Brought the app's
  navigational docs in line: README `## File layout` tree rewritten to the six folders (+ 15 inline `app/<flat>.mjs` prose refs
  repointed); `main.mjs` header's stale "GENERATED by gen-main.mjs" claim → an accurate hand-maintained / order-significant
  note. Dated review/audit + completed design-plan docs left as point-in-time records (not tidied). Green: build/typecheck/
  lint/test — **2234/265**.
- **2026-08-03 · stage qd-boot-harness-s1 (PR → refactor/main):** **Boot harness Stage 1 — NEW browser coverage.**
  **QD-TEST-2 → partially addressed** (ui.mjs now has real boot characterization — it boots + registers its QD_UI hooks; deeper
  UI behaviour still open) and **QD-UI-5 → partially addressed** (the module-graph boot path is covered; full-page assembly +
  a real solve are Stage 2). Vitest browser mode (Playwright/Chromium, unregistered so `pnpm test` never launches a browser;
  joins the existing CI `browser` job): `boot.browser.test.ts` assembles `index.html`'s `<body>` + imports the real `main.mjs`
  graph → `bootQdUi()`, pinning QD_UI hooks register / `#canvas` 2D-claimed / tab bar + controls present / no boot errors.
  Mutation-verified (break a `main.mjs` import → red; revert → green). Container-Chromium-revision + Vite-reload gotchas handled
  in-config. Green: build/typecheck/lint/test **2234/265**; `test:browser` (gpu+CD+QD) green. **Unblocks the paused D2 lifts.**
- **2026-08-04 · stage d2-lift-qolhelp (PR → refactor/main):** **Phase 4 D2 — first factory lift, behavior-preserving.**
  Resumed the paused D2 lifts now that the boot net (#223) backs them. Lifted ui.mjs's `mountQolHelp()` (inverse-tab "?" help
  buttons) → `ui/ui-qol-help.mjs` `QD_UI.installQolHelp()` (verbatim; globals-only, no uiCtx); one call + one main.mjs import.
  Net-first: extended boot.browser.test with a help-button assertion SPECIFIC to installQolHelp's headers (app title / #h-card /
  #domain-mode-card) — a broad `.help-btn` count didn't isolate it (ui-faber/-thesis/-qd-equations also attachHelp at boot), which
  the mutation-verify surfaced and the assertion was tightened for. Mutation-verified (no-op → red; revert → green). Green:
  build/typecheck/lint/test 2234/265; QD test:browser 7. ui.mjs a step closer to a thin composition root.
- **2026-08-04 · stage d2-lift-copybuttons (PR → refactor/main):** **Phase 4 D2 — lifts 2–3, behavior-preserving; D2 CLOSED.**
  Lifted ui.mjs's two QoL copy-button IIFEs → `ui/ui-copy-buttons.mjs` (`QD_UI.installCopyLink` + `installHTextCopy`; verbatim,
  globals-only; `$`→document.querySelector, identical). mountViewToggle LEFT in the root = composition core (coupled to
  setViewMode, which boot calls elsewhere + reads state cross-module — the D2 analog of D1d's inspector). Net-first: boot.browser
  assertions anchored to each button (#copy-link-host / #h-parse + .copy-btn); mutation-verified each isolates (MUT1/MUT2 → red;
  revert → green). Green: build/typecheck/lint/test 2234/265; QD test:browser 8. **QD-UI-2 → resolved: ui.mjs is now a thin
  composition root** (uiCtx assembly + installX calls + view/domain-mode wiring; the god-module is decomposed).
- **2026-08-05 · stage p0-solver-worker-bundle (PR → refactor/main):** **QD-BUILD-1 → FIXED** (post-review P0 — the whole-refactor
  review's one production regression; found by the folderize/build-integrity review slice, confirmed independently). The Stage-C1
  `createWorkerLane` unification collapsed the primary-solver worker's three literal `new URL('../workers/solver-worker-entry.mjs',
  import.meta.url)` into ONE `new URL(cfg.entryUrl, …)` VARIABLE. Vite's `worker-import-meta-url` transform only bundles a STRING
  LITERAL → the `solver-worker-entry` chunk was silently omitted from `vite build` (dist had param-slice/schwarz/sym entries, not
  solver); on the deployed build the URL 404s and — because the async load `error` never arms the `_fallback` latch (only the sync
  `.catch` does) — Solve + alt-search + live-drag hard-fail with NO main-thread fallback. INVISIBLE to the green bar (node/jsdom
  have no `Worker`; `vite dev` serves source; the browser boot net runs against source). FIX (behavior-RESTORING): literal restored
  at the `new Worker` site; dead `entryUrl`/`ENTRY` indirection removed (all 3 lanes share the one entry). NET-FIRST regression net
  `worker-url-static-literal.test.ts` (no `new Worker(new URL(<variable>))` in app/; primary uses the literal path) — RED on the
  bug @ :96, GREEN on the fix, mutation-verified (variable → red @ :102; revert → green). EMPIRICAL: post-fix `vite build` emits
  `solver-worker-entry-DJnyKXD5.js` (was absent). Green: build/typecheck/lint(+dep:check)/test **2236 / 266** (+1 file / +2 tests
  = the net). **DEFERRED to an explicit decision (a2):** hardening the async worker-LOAD failure to arm `_fallback` (self-heal to
  main-thread) — it would move the deliberately net-frozen "a crash is NOT a permanent fallback latch" line (psw-crash-char.test.ts:63).
- **2026-08-05 · stage p0-worker-load-fallback (PR → refactor/main):** **QD-BUILD-1 hardening (a2) — AUTHORIZED behavior
  refinement** (user token 2026-08-05: "Add it (scoped)"). Follow-on to #226: harden the async worker-LOAD-failure path so a
  FUTURE bundling/hosting failure self-heals instead of hard-failing. `createWorkerLane`'s `error` handler now latches the lane
  to the main-thread fallback (`_fallback = true`) IFF the worker errored WITHOUT ever returning a message (`!_everWorked`) — a
  bundle/load failure; a worker that HAD returned a message keeps terminate-and-retry (a transient crash retries on the worker
  path). This REFINES the deliberately-frozen "a crash is NOT a permanent fallback latch" contract: a never-loaded worker now
  latches (+ self-heals subsequent runs to main-thread), a worked-then-crashed worker still respawns — the frozen line's INTENT
  (transient-crash retry) is preserved, only the never-loaded gap closed. NET-FIRST: split psw-crash-char's primary `error` test
  into load-failure(A: latch + self-heal) / transient-crash(B: respawn) + per-lane latch pins for aux/live; RED on the 3
  new-behavior assertions pre-impl, GREEN after; mutation-verified (INVERTED `!_everWorked`→`_everWorked` → BOTH A & B red;
  revert → green). Green: build/typecheck/lint/test **2237 / 266** (+1 test = the A/B split). **Closes (a2); fix (a) complete.**
- **2026-08-05 · stage publish-gate-durability (PR → refactor/main):** **2 review P1 CI-gate findings → FIXED** (fix (b), user
  token "then (b)") — defence-in-depth for the QD-BUILD-1 class. The P0 reached prod because the publish gate had two blind
  spots: (#2) nothing verified the BUILT app before upload (`pnpm test` = node/jsdom, `vite dev`/boot-net serve SOURCE, and
  `vite build` succeeds while silently dropping a worker chunk); (#3) Vitest's aggregate stays green if a whole PROJECT collects
  0 specs. TWO deterministic gates: · **built-artifact** (`scripts/check-built-artifacts.mjs`, tail of `pnpm build`) derives every
  published-app worker from source (`new Worker(new URL('<literal>',…))`, comments stripped) and asserts each emitted a
  `dist/assets/<stem>-*.js` chunk — all 5 (QD solver/schwarz/sym/param-slice + CD juliaMetrics) + any future worker; rides
  local+CI+deploy-pages, so a dropped chunk fails the build not the deploy (build-OUTPUT layer under #226's SOURCE net). ·
  **test-census** (`scripts/assert-test-census.mjs`, tail of `pnpm test`) reads Vitest `--reporter=json` and asserts each of the 8
  projects ≥1 file (+ loose global floor 200). MUTATION-VERIFIED both (hide solver chunk → build gate fails naming it; doctor JSON
  emptying interchange → census fails naming it; real → pass). Green: build/typecheck/lint/test **2237 / 266** + census ✓. Chose
  built-OUTPUT assertions over a built-app browser smoke test (infra+flake) and over reversing the deliberate "browser not a
  publish blocker" topology — both noted optional. **Closes (b); post-review fixes (a)+(b) complete.**
- **2026-08-05 · stage aux-live-messageerror (PR → refactor/main):** **aux/live `messageerror` hang → FIXED** (the last
  worker-lifecycle inconsistency; the pre-existing footnote from the post-review arc report). Only PRIMARY installed a
  `messageerror` handler; a structured-clone failure on the aux (alt-search) or live (drag-solve) lane left the job unsettled
  forever (`isAuxBusy`/`isLiveBusy` wedged until reload). `createWorkerLane` already implemented the handler behind
  `hasMessageError`; flipped aux+live `false→true` → all three lanes now reject + dispose on a clone failure (respawn, no
  `_fallback` latch — a clone failure is data-specific, matching primary). NET-FIRST: the two frozen psw-crash-char "asymmetry
  — does NOT settle" specs rewritten to assert settle+dispose parity — RED pre-flip (promise never rejects → timeout), GREEN
  post-flip; per-lane isolation makes the RED→GREEN transition the mutation proof. Green: build/typecheck/lint/test **2237 / 266**
  (count unchanged). Low-probability in practice (plain numeric messages) → robustness completeness, not an urgent bug.
- **2026-08-06 · stage sym-worker-load-selfheal (PR → refactor/main):** **QD-SYM-LOAD → FIXED** — user-reported on the LIVE site:
  "Auto-reduce & solve: sym-worker crashed: [object Event] @ bundle:?" (cardioid, Algebra module). The bare event (empty
  message/filename/lineno) is a worker-script LOAD 404, not a runtime error — confirmed the chunk itself loads + computes in a real
  module-worker (Playwright). Root cause deploy-specific: the refactor changed every chunk hash + QD is an `autoUpdate` PWA, so a
  mid-session SW swap 404s a LAZILY-spawned worker at an old hash (hard-refresh clears it for the user). Code gap: sym-worker.mjs
  (outside the `createWorkerLane` factory) never got #227's `_everWorked` fix — a load failure WITH a job in flight rejected instead
  of falling back. FIX: `_everWorked` split — a never-loaded worker latches `_fallback` AND self-heals the in-flight op onto the main
  thread (`_QD.Sym.runJob`) so Auto-reduce & solve keeps working; a worked-then-crash still rejects+respawns. NET-FIRST +
  mutation-verified (invert `!_everWorked` → both new specs red). Green: **2238 / 266**. Behavior change authorized by the bug
  report. Follow-ups: built-app worker smoke test (the gap behind this + QD-BUILD-1); PWA autoUpdate→prompt; sym-lane messageerror.
