# PLAN — refactor of complex-analysis-suite

> Version: **v1** (Phase C — the plan of record). Supersedes v0 (pre-plan).
> **Approval gate:** implementation begins only after the user replies with the literal token
> `APPROVED: PLAN.md v1`. Agreement, praise, or silence is NOT approval. Bump `v<n>` on revision.

## 1. Run configuration
| Setting | Value |
|---|---|
| Integration branch | `refactor/main`, cut from `master` @ b1e3004. Never commit to `master`. |
| Stage branches | `refactor/<stage-id>-<slug>`, cut from `refactor/main`; one PR each → `refactor/main`; never self-merge. |
| Docs directory | `docs/refactor/` |
| Green-bar commands | `pnpm build` · `pnpm typecheck` · `pnpm lint` · `pnpm test` (browser: `pnpm test:browser`) |
| Baseline (2026-07-30) | all green; 206 files / 2017 tests; no pre-existing failures |
| Approval granularity | Token `APPROVED: PLAN.md v<n>`; each stage ends with an open PR I do not merge |
| Numerical equivalence | Tolerance-based; bit-exactness NOT required/pursued; never widen a tolerance to pass a test |
| Visual output | In scope; small rendering diffs acceptable, structural diffs are not (prompt §2.2) |
| Repository scale | ~616 files; ~87k code lines (JS+TS); QD ~60% & untyped `.mjs` |
| Off-limits (default) | `@cas/exact` ℚ(i) kernel + QD `sym-core.mjs` internals; shader source; interchange + share-link formats; deploy/CI workflows — each unless a stage explicitly needs it with approval |

## 2. Goals (priority order)
Maintainability & extensibility → conceptual clarity & readability → reliability & testability →
architectural coherence → debuggability → long-term development velocity. Speed is not a goal.

## 3. Constraints
- CLAUDE.md **ADRs 0001–0008 locked** (supersede only via a new ADR, with approval).
- **Behavior-preserving by default.** Preserve each app's share-link URL formats and the interchange format.
- Honest labeling (`=`/`≤`/`≈`). One dependency direction; no cycles.
- **No refactor without a passing characterization net** pinned against pre-refactor code (prompt §2.2).

## 4. Phase A/C — questions & answers
**Round 1 (2026-07-30, pre-review):** branch model = follow prompt (`refactor/main`); altitude = fresh
architectural review (don't re-derive July findings); pain = QD internals + testability + clarity;
appetite = deeper redesign where warranted.

**Round 2 (2026-07-30, post-review, plan-shaping):**
- Ambition = **broad structural sweep** — *refined by the finer answers below.*
- Test infrastructure = **Stage 0, before any structural change.**
- CD scope = **cheap wins only** (this refines the sweep → **no full CD decomposition**).
- QD god-module decomposition depth = **full decomposition into sub-units.**

**Reconciled scope (governs this plan):** a broad sweep **concentrated on QD** — full decomposition of the
QD god-modules, folderization, and the S2 duplication collapse — gated behind a test-infra Stage 0; **CD is
limited to the near-free type-only-cycle fix** (+ optional façade getters), *not* its god-module work.
Standing assumptions still in force: no QD→TS migration (ADR-0002); local green bar is source of truth;
July's ~48 open findings folded in only where a structural stage subsumes them.

## 5. Current-state assessment
**Genuine strengths (leave alone).** The `@cas/*` packages (strict TS, cycle-free, strong test ratios),
`prove-plan.mjs` (pure, DI, DOM-free), `algebra-store.mjs` (disciplined DAG store + undo/redo), the solver
*math* (already factored into shared commons), and `apps/correspondences` (clean, modular) are well-built.
The team knows how to build clean modules.

**Most consequential weaknesses.** All debt sits in the **orchestration / UI / wiring layer** that never got
the same extraction treatment — see ASSESSMENT §3–4. Principal complexity sources: (a) god-modules that
accrete because sub-pieces close over shared handles instead of a context (S1); (b) duplication by parallel
family instead of parameterization (S2) — which *already shipped a user-visible bug*; (c) informal,
multiplicative state/message contracts (S3); (d) the god-modules have no test seam, so the safety net is
thinnest exactly where the debt is deepest (S4 — the gating constraint); (e) flat organization hides
boundaries (S5).

**Likely/known defects surfaced (all minor, all verified):** QD-SOLV-1 (mis-ordered dispatch → silently
wrong φ), QD-SOLV-3 (5th open-coded centroid + divergent empty-pole fallback), QD-UI-1 (worker-lane drift —
already shipped the Schwarz "stuck on Pass 1/3" bug), QD-SOLV-2 (stale doc). The CD render cycle is **not** a
runtime defect (type-only, erased by `verbatimModuleSyntax`).

## 6. Findings (classified; full evidence in ASSESSMENT §3 / ISSUES register)
36 findings, all with re-verified file:line evidence. Classification:
- **Confirmed defects (3):** QD-SOLV-2 (doc), QD-SOLV-3 (centroid copy+fallback), and QD-UI-1's shipped
  drift bug (design-problem that *manifested* as a defect).
- **High-confidence design problems (14):** the S1 god-modules (QD-ALG-1/2, QD-UI-2, CD-1/2), S2 duplication
  (QD-SOLV-1/4/5, QD-UI-1, CD-3), S4 test seams (QD-TEST-1/2, QD-ALG-3), S3 contracts (QD-UI-3).
- **Plausible concerns (needing care, not investigation):** QD-ALG-6, QD-SOLV-6, QD-UI-4/9, CD-4/5/6.
- **Optional improvements:** QD-UI-6/S5 folderization, QD-TEST-5/6/7, CD-7.
- **Style:** QD-ALG-7, QD-UI-7/8, S6 doc drift.
Priorities and per-item proposed-change/benefit/risk/validation/effort are carried in the roadmap (§8),
grouped by stage rather than repeated per finding.

## 7. Target architecture (where change is warranted)
The end state is the **current architecture with its wiring layer extracted along seams the codebase already
uses** — no new frameworks, no ADR changes, dependency direction unchanged (apps→packages, no cycles).

| Concern | Now | Target |
|---|---|---|
| QD worker clients | lifecycle copy-pasted ×6, drifted | one `createWorkerLane({url,kind})` factory; 6 call-sites = config |
| QD worker messages | untyped `{kind,jobId,…}` repeated ~11× | one `workers/protocol.mjs` (typed envelope builders + `dispatch(handlers)`) |
| QD solver families | ~17-key shell re-typed ×10 + seeds ×10 | `defineFamily(config)` assembles the shell (NOT the math); `seeds-common` for perturb/clamp |
| QD dispatch order | invariant triplicated across 3 lists | startup assertion (base-before-singular) + single ordered source |
| `installAlgebra` (4.2k) | one closure, DOM+state+logic | composition root mounting `sidebar` / `verdict` / `op-runner` / `session` sub-units (ctx-injected) |
| `ui.mjs` (1.9k) | DI hub + god-module | thin composition root; DOM-wiring / cross-tab / help lifted into `installX(uiCtx)` factories |
| QD tab state | 7+ containers, 3 propagation channels | each tab-state behind a small get/subscribe shim (à la `PrimarySolution`); one tab-lifecycle contract |
| QD `app/` layout | 102-file flat pile | folders by existing prefix: `core/ solvers/ qd/ sym/ analysis/ ui/` |
| CD render cycle | type-only madge cycle | `render/laminationTypes.ts` leaf; cycle gone from the graph |
| Invariant enforcement | ESLint boundary rule only | + wired `dependency-cruiser` (the planned CLAUDE.md check) |

**Migration path:** seam-first. Build the characterization net (Stage 0) → collapse duplication behind it →
decompose god-modules behind it → unify contracts → folderize → lock invariants. Every stage green,
behavior-preserving, independently reviewable/revertible.

## 8. Staged roadmap
Notation per stage: **Prereq** · **Char tests (pin BEFORE)** · **Done-when** · **Footprint** · **Risk**.
Each stage = one PR to `refactor/main`, leaves the repo green, does not mix formatting with logic, and does
not touch a public interface/format without a called-out sign-off. Quick wins (Group A) and the type-only
cycle can land in parallel with Stage 0; all QD structural work (C/D/E) is gated behind the Stage-0 net (B).

### Group A — Quick wins & confirmed defects (low risk, mostly independent)
- **A1 — confirmed-defect & encapsulation fixes.** QD-SOLV-3 (route the 5th centroid to `QD.poleCentroid`;
  *reconcile the `{re:1}`→`{re:0}` empty-pole fallback — a tiny behavior change, flagged for sign-off*),
  QD-SOLV-2 (fix stale `CONTRIBUTING.md:84`), QD-ALG-7 (`edges` getter `.slice()`), QD-SOLV-6 (centralize the
  `identityOK` tol). · Prereq: none · Char: add a test pinning centroid value + empty-pole fallback before the
  change · Done-when: green + the fallback change recorded in LOG · Footprint: ~5 files, ~40 LOC · Risk: low.
- **A2 — dispatch-order safety (QD-SOLV-1).** Add a startup assertion that every `_singular` precedes its base
  in `familyDispatchOrder` (additive, no behavior change); begin a single ordered source for the 3 load lists
  (or defer the unification to E2). · Prereq: none · Char: a test asserting singular-before-base + a dispatch
  test for a singular input · Done-when: assertion in place, green · Footprint: ~4 files · Risk: low.
- **A3 — CD type-only cycle (CD-4).** Extract `render/laminationTypes.ts` (leaf); re-export from `lamination`;
  point `overlay` at it. · Prereq: none · Char: existing `lamination`/`inspect` tests + `madge --circular` clean ·
  Done-when: `madge --circular apps/complex-dynamics/src` = 0, green, zero emitted-JS delta · Footprint: 3 files ·
  Risk: very low.

### Group B — Test-infra foundation (Stage 0; prerequisite for C/D/E)
- **B1 — parallelize the QD node-suite.** Port the 26 `export async run()` files to native Vitest specs
  (`beforeAll(bootstrap.init)`); keep `harness.ok` wrapped (minimal change), retire `FLOORS` as Vitest reports
  per-file counts. · Prereq: none · Char: **assertion parity** — same 2302 assertions, all pass; a guard that
  every ported file still runs · Done-when: node-suite no longer a single serial spec; `pnpm test` wall time
  measured & reduced (~40%); green · Footprint: medium (harness + 26 files, mechanical) · Risk: medium (port fidelity).
- **B2 — shard `solvers.test.js`.** Split into ~4 parallel specs (bounded/unbounded/LQD/PQD); blocks are
  independent (verified). · Prereq: B1 · Char: same assertions across shards · Done-when: node-suite ≈ 25–30s;
  green · Footprint: small-med · Risk: low.
- **B3 — QD coverage visibility (QD-TEST-6, optional).** Give QD `.mjs` a coverage path (targets get line/branch
  visibility). · Prereq: B1 · Done-when: `test:coverage` reports QD · Footprint: small · Risk: low.
- **B4 — characterization seams for the QD-UI god-modules (the NET).** Fake-`Worker` harness + jsdom DOM tests
  pinning current behavior of `ui.mjs` / `ui-solve.mjs` / the worker lanes (input→dispatch→render; supersede;
  error-settle); convert the ~15 source-text algebra tests to behavioral where feasible (QD-TEST-2/3/4, QD-ALG-3).
  · Prereq: B1 · Char: these tests ARE the net — they must pass against unmodified code · Done-when: the C/D
  targets have executable behavioral coverage green on today's code · Footprint: medium-large (new tests only) ·
  Risk: medium. **This stage is the safety net that authorizes Groups C & D.**

### Group C — Duplication collapse (S2), behind the B4 net
- **C1 — `createWorkerLane()` factory (QD-UI-1).** Collapse the 6 worker lifecycles to config; makes
  `messageerror`/error-settle uniform (kills the shipped-bug class). · Prereq: B4 · Char: B4 fake-Worker tests
  green before/after; add one asserting error-settle on every lane · Done-when: 6 lanes = config, green ·
  Footprint: medium · Risk: medium.
- **C2 — typed worker protocol (QD-UI-4).** One `workers/protocol.mjs` (envelope builders + `dispatch`); unknown
  `kind` no longer silently hangs. · Prereq: C1 · Char: a test for unknown-kind handling · Footprint: small-med ·
  Risk: low-med.
- **C3 — `defineFamily(config)` + `seeds-common` (QD-SOLV-4/5).** Factor the solver **shell only** (residual
  locator/coeff skeleton, Z/2 canonicalize, pack/unpack, seed-alias, register) and the perturb/clamp mechanics;
  **do not** touch `evalPhi`/`phiTaylorAt`/`computeTargetA` math. · Prereq: golden per-family residual-vector tests
  (add as C3's first commit) · Char: golden residual vectors identical before/after per family · Done-when:
  ~600–900 LOC removed, all solver batteries green · Footprint: medium-large · Risk: medium.

### Group D — QD god-module decomposition (S1), behind the B4 net (full, per Round-2)
- **D1 — decompose `installAlgebra` (multi-commit).** (a) sidebar-as-data + single-pass render/wire (QD-ALG-2);
  (b) `runOp()` async runner — uniform single-flight guard (QD-ALG-4); (c) unify the verdict path (QD-ALG-5);
  (d) split into mounted sub-units (sidebar / verdict / op-runner / session). · Prereq: B4 · Char: B4 behavioral
  algebra tests + the source-text→DOM conversions · Done-when: `algebra-ui.mjs` is a composition root, each
  sub-unit importable/testable, green · Footprint: **large** (most-churned file) · Risk: med→high — land as ≥4 PRs.
- **D2 — shrink `ui.mjs` to a composition root (QD-UI-2).** Lift DOM-wiring, cross-tab hooks, help-mounting into
  `installX(uiCtx)` factory modules. · Prereq: B4 · Char: B4 `ui.mjs` behavioral tests · Done-when: `ui.mjs` is a
  thin root; extracted modules unit-tested; green · Footprint: large · Risk: medium.

### Group E — Contracts & organization
- **E1 — state/lifecycle unification (S3; QD-UI-3/9).** Put each tab-state behind a small get/subscribe shim
  (à la `PrimarySolution`); define one tab mount/activate/receive-solution contract. · Prereq: D2 · Char: cross-tab
  behavioral tests (solve → each tab observes) · Done-when: no tab reads a foreign container directly; green ·
  Footprint: medium-large · Risk: medium. *(Most architectural stage — see decision D-3.)*
- **E2 — folderize QD `app/` (S5; QD-UI-6).** Codemod to `core/ solvers/ qd/ sym/ analysis/ ui/`; rewrite import
  paths; regenerate `main.mjs` (via its gen script, preserving load order) + `workers/solver-graph.mjs`. · Prereq:
  after D1/D2/C3 settle (avoid double-moves) · Char: `vite build` + full suite green (pure path edits) · Done-when:
  flat pile gone, green, no behavior delta · Footprint: **large but mechanical** · Risk: low-but-broad (own PR).

### Group F — Lock invariants
- **F1 — wire `dependency-cruiser` (S6 / CLAUDE.md guardrail).** Enforce strictly-downward package imports +
  no-cycles (now that CD-4 is fixed) in CI. · Prereq: A3 · Done-when: check runs & passes in `ci.yml` · Footprint:
  small · Risk: low.

**Sequencing:** A (any time) → **B (Stage 0, esp. B4 net)** → C → D → E → F. ~15 PRs total — a large engagement,
consistent with the broad-sweep mandate; can pause at any group boundary.

## 9. Decision points requiring your input
- **D-1 — QD-SOLV-3 fallback (A1).** Aligning the 5th centroid to `QD.poleCentroid` changes one empty-pole
  fallback from `{re:1,im:0}` to `{re:0,im:0}`. It only affects a degenerate no-finite-pole PQD-singular input.
  *Recommendation:* align to `{re:0}` (consistency) — but it is a (tiny) behavior change needing your OK per §3.
- **D-2 — folderization timing (E2).** *Recommendation:* do it LATE (after D1/D2/C3) so files aren't moved twice.
  Alternative: a coarse early move of the already-stable `solvers/` family. Your call on churn tolerance.
- **D-3 — is E1 (state/lifecycle unification) in scope now, or deferred?** It is the most architectural stage and
  the highest-risk. *Recommendation:* include it (it's core to the "each new tool builds fewer primitives"
  north-star) but schedule it LAST before folderization, so it can be dropped without unwinding C/D.
- **D-4 — harness style in B1.** *Recommendation:* keep `harness.ok` wrapped (smallest change) rather than convert
  every `ok`→`expect` (a larger, report-changing diff). Say if you'd prefer full Vitest-native assertions.

## 10. Roadmap status
- **A1 — IN REVIEW** (PR → `refactor/main`): QD-SOLV-3 + QD-SOLV-2 done & green; QD-ALG-7/QD-SOLV-6
  deferred out of A1 (scope narrowed — see LOG 2026-07-30). Approved & underway per `APPROVED: PLAN.md v1`.
- All other stages (A2, A3, B1–B4, C1–C3, D1–D2, E1–E2, F1): NOT STARTED.
