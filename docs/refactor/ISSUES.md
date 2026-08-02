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
