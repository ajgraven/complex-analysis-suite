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
- **✅ PHASE 1 COMPLETE — #204 + #205 both MERGED.**
  · #204 (2862bf0) — **QD-ALG-7** (`edges` getter → `.slice()`) + **QD-SOLV-6** (×3 `maxRelDiff < 1e-6` → one
  exported `IDENTITY_TOL`); net-first + mutation-verified.
  · #205 (c1ae7e6, F1) — **dependency-cruiser** gate live (`.dependency-cruiser.cjs` + `dep:check` folded into
  `pnpm lint`): `no-circular` + `no-package-to-app` + `no-cross-app`, `tsPreCompilationDeps:true` (type-only imports,
  so the CD-4 class is gated). 580 modules / 0 violations; 3 rules mutation-verified incl. a type-only cycle. Now
  enforced in the local green bar, CI `build`, and the deploy gate. No app/package code changed.
- **✅ PHASE 2 COMPLETE (QD-ALG-3) — the D1a behavioural net is done.** harness `vitest/_algebra-mount.ts` + per-file
  SPLITS (markup → behavioural jsdom `-dom` companion; source-structural residue slimmed into the node file). The
  **7 files with D1a-brittle sidebar markup** are all behavioural now: #206 (harness + section-order), #207
  (eliminate-section), #208 (honest-labels + tooltip-tiers), #209 (workflow-sections + scope-disclosure + tier6). Every
  behavioural test mutation-verified. **The remaining source-text tests are NOT D1a-brittle and stay node-source
  (assessed 2026-08-02, LOG closeout):** canvas-chrome tests `algebra-canvas.mjs` (not D1-decomposed); verdict-labeling
  is a source-absence guard → **revisit at D1c**; shortcuts-table dispatch needs a SEEDED-store mount (buttons disabled
  + #alg-focus canvas-created at empty mount) — its target buttons already behaviourally guarded; results-drawer
  resultStateOf already behavioural. **User calibration was THOROUGH per-file splits — honoured for every D1a-relevant file.**
- Cadence: merge on green (delegated). `APPROVED: PLAN.md v1` + `APPROVED: D1c verdict-unification`.
  Roadmap: A✓ / B✓ / C✓ / **D (Phase 1✓; Phase 2✓; Phase 3 D1: D1a✓ [#210 net + #211 xform] → D1b)** / E (E1 deferred, E2=Phase 5) / **F1✓**.
- **▶ PHASE 3 UNDERWAY (D1 — installAlgebra decomposition), behind the Phase-2 behavioural net. User go-ahead
  (2026-08-02).** D1a sidebar-as-data (QD-ALG-2) → D1b runOp single-flight (QD-ALG-4) → **re-eval gate** → D1c
  verdict-unify (QD-ALG-5, **token APPROVED**) → D1d split into ctx-injected sub-units.
  · **D1a COMPLETE — #210 (net: `algebra-sidebar-html.test.ts` full-DOM fingerprint) + #211 (xform: mountSidebar's
  `#alg-sections` → `SIDEBAR_SECTIONS` data + `renderSection`; bodies verbatim) both MERGED (b80429c).** Behavior-preserving
  (fingerprint + 20 jsdom files + mutation-verified + a pre-flight `normalize()`-equal oracle). Full detail in LOG.
  · **D1b — 2 user decisions (2026-08-02): (i) "Also guard doSolveRadical" → BEHAVIORAL-CHANGE TOKEN GRANTED** (2nd of the
  engagement, after D1c's); **(ii) "Build harness first."** (Guards are non-uniform — silent `if(_abort)return` / noisy
  `busyGuard()` / none — so *unifying* them is extra behavioral change beyond the doSolveRadical token.) **Multi-stage:**
    - **D1b-STAGE 1 (harness + net, NO production change) — MERGED (#212, cd2301b).** Harness `mountAlgebra(_, {withCanvas})`
      + `seedMoments`/`nodeCards`/`selectNode`; NEW `algebra-op-runner.test.ts` (8): busy lifecycle, single-flight (button-
      disable + busyGuard backstop), doSolveRadical's CURRENT run-while-busy pinned. Net-first + mutation-verified. Full
      detail in LOG. **DONE.**
    - **D1b-STAGE 2 (runOp lifecycle extraction) — MERGED (#213, ebdefee).** A single `runOp(run,onOk)` wrapper does NOT
      fit (doAutoSolve multi-step; prove-family `.then().catch()` with `||e`), so extracted the **`_opBegin(label)`/`_opEnd()`
      pair** via a scripted fold: 19 setups → `_opBegin`, 35 teardowns → `_opEnd`; guard style/control flow/error expression
      byte-preserved (NO guard-unification). Behavior-preserving by construction; mutation-verified. Full detail in LOG. **DONE.**
    - **D1b-STAGE 3a — doSolveRadical guard (token GRANTED) — UNDERWAY.** Add `if (busyGuard()) return;` to doSolveRadical
      so it bails "Busy — wait…" while a worker op is in flight (matching Duplicate/Delete). The Stage-1 net's
      "doSolveRadical BUSY: STILL runs" pin FLIPS to "BAILS" — a reviewed test diff + a logged behavioral delta. Mutation-
      verify; then PAUSE at the **re-eval gate**.
    - **D1b-STAGE 3b — guard-unification (silent→noisy) — NEEDS A BROADER TOKEN. ASK the user at the gate** (or leave the
      silent backstops as-is; they are nearly unobservable — buttons are js-busy-lock-disabled, keyboard path busyGuards upstream).

## Branches / PR
- Integration `refactor/main` @ **ebdefee** (#210–#213 merged). Tree clean. **Open PR → `refactor/p3-d1b-solveradical-guard`
  (6acb31d)** — D1b Stage 3a (doSolveRadical guard; the ONE authorized behavioral change).
- Merged stage PRs (36): A1 #178 … #212, **p3-d1b-runop #213 (ebdefee)**.

## Validation state (green bar)
- **`refactor/main` — ALL GREEN** at ebdefee: `pnpm test` **2219 / 262**.
- **Stage-3a branch — ALL GREEN:** build/typecheck/lint(+`dep:check`, 588 modules)/test exit 0; `pnpm test` **2219 / 262**
  (no count change — the net's doSolveRadical BUSY pin flipped runs→bails; mutation-verified).

## Uncommitted / unverified
- Nothing uncommitted. Stage-3a committed on `refactor/p3-d1b-solveradical-guard` (6acb31d) + pushed; this STATE edit
  advances `refactor/main`.

## Known blockers / risks
- **D1b Stage 3a PR open (awaiting merge-on-green).** No blockers.
- **▶ AT THE RE-EVAL GATE once Stage 3a merges — PAUSE.** Report D1b churn/mass/risk + **ASK the user for the Stage-3b
  guard-unification token** (silent `if(_abort)return` → noisy `busyGuard()`) — or leave the silent backstops (nearly
  unobservable). Then, on go: **D1c** (verdict-unify, token✓) / **D1d** (split), or stop.

## Next concrete steps
1. **Merge Stage 3a on green**, then pull + re-confirm green.
2. **PAUSE at the RE-EVAL GATE** — report + the guard-unification token ask; await user go/no-go for D1c✓ / D1d / Stage 3b.
   Order: A✓ B✓ C✓ → **D (D1a✓ → D1b: net✓ runOp✓ guard✓)** → Phase 4 (D2) → E2 (Phase 5). E1 deferred.

## Resume commands
```
git fetch && git checkout refactor/main && git pull
pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm lint && pnpm test  # expect 2211/261
```
