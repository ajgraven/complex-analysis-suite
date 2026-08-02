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
    - **D1b-STAGE 3a — doSolveRadical guard (token GRANTED) — MERGED (#214, 0eee518).** `if (busyGuard()) return;` added;
      the inspector "Solve for a variable" now bails "Busy — wait…" while a worker op is in flight (was: still ran). The
      Stage-1 net's doSolveRadical pin FLIPPED runs→bails — a reviewed diff + logged delta; mutation-verified. **DONE. D1b's
      coded work is COMPLETE: net✓ (#212) runOp✓ (#213) guard✓ (#214).**
    - **D1b-STAGE 3b — guard-unification (silent→noisy) — SKIPPED (user decision at the gate, 2026-08-02).** The silent
      backstops stay; no token spent. Nearly unobservable (buttons js-busy-lock-disabled; keyboard path busyGuards upstream).

## Branches / PR
- Integration `refactor/main` @ **0eee518** (#210–#214 merged). Tree clean. **No open PR.**
- Merged stage PRs (37): A1 #178 … #213, **p3-d1b-solveradical-guard #214 (0eee518)**.

## Validation state (green bar)
- **`refactor/main` — ALL GREEN** at 0eee518 (#214 merged): build/typecheck/lint(+`dep:check`, 588 modules)/test exit 0;
  `pnpm test` **2219 / 262**.

## Uncommitted / unverified
- Nothing uncommitted. This STATE edit advances `refactor/main`.

## Known blockers / risks
- **RE-EVAL GATE PASSED (user decision 2026-08-02): "D1c + D1d both"** (full decomposition) + guard-unification SKIPPED.
  D1b's coded work is complete (#212/#213/#214).
- **▶ D1c UNDERWAY (verdict-unify, QD-ALG-5; token GRANTED via decision #3).** AUDIT DONE (task #8): scope is SMALLER than
  the plan implied. A prior carve-out already extracted **`classifyVerdict`** (pure, `algebra-labeling.mjs`) and routed
  **`doClassify`@3475** through it. **`_verdictBadge`@573** is a compact CHIP (different representation, already pure + on
  QD_UI) — stays. The genuine remaining drift is **`doAutoSolve`@3216 builds the verdict INLINE** (3239–3251) with wording
  drifted from `classifyVerdict` (e.g. "reduced system is inconsistent" vs "the system is inconsistent (1 ∈ I)"; "1 real
  algebraic solution" vs "A unique real algebraic solution … gauge copies merged, non-univalent filtered"). **D1c change:
  route doAutoSolve → `classifyVerdict(cl)` (keep its `+= sliceCaveat` + auto caveats).** AUTHORIZED string delta (both were
  honest — `upper bound` + `run Certify univalence` preserved). doAutoSolve is activeEnv-gated (un-drivable in the harness),
  so the net is `classifyVerdict`'s own tests (pin the canonical prose) + a source guard that doAutoSolve routes through it;
  LOG the before/after strings.
- **D1d next** (split installAlgebra — still a ~4085-line closure, 714–4799 — into ctx-injected sub-units). The big lift.

## Next concrete steps
1. **D1c — verdict-unify (net-first):** audit the 3 verdict builders + existing verdict tests (algebra-verdict-rigor/
   -badge, rigor-badge); pin the verdict PROSE each produces so the unification's string deltas are caught; unify onto one
   path; diff + LOG the string deltas; mutation-verify; green bar; PR; STATE checkpoint.
2. Then **D1d** (installAlgebra split, several PRs). Order: A✓ B✓ C✓ → **D (D1a✓ → D1b✓ → D1c → D1d)** → Phase 4 (D2) →
   E2 (Phase 5). E1 deferred.

## Resume commands
```
git fetch && git checkout refactor/main && git pull
pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm lint && pnpm test  # expect 2211/261
```
