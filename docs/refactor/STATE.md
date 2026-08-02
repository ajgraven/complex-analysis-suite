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
  Roadmap: A✓ / B✓ / C✓ / **D (Phase 1✓; Phase 2✓; Phase 3 D1: D1a✓ D1b✓ → D1c[PR] → D1d)** / E (E1 deferred, E2=Phase 5) / **F1✓**.
- **▶ PHASE 3 (D1 — installAlgebra decomposition), behind the Phase-2 net. User go-aheads 2026-08-02. Full detail per stage in LOG.**
  · **D1a COMPLETE** — #210 (full-DOM fingerprint net) + #211 (mountSidebar `#alg-sections` → `SIDEBAR_SECTIONS` data +
  `renderSection`, bodies verbatim). Behavior-preserving (fingerprint + mutation + a pre-flight `normalize()`-equal oracle).
  · **D1b COMPLETE** — 2 user decisions: "Also guard doSolveRadical" (behavioral TOKEN✓) + "Build harness first". Shipped
  #212 (seeded/canvas harness + `algebra-op-runner.test.ts` net), #213 (`_opBegin`/`_opEnd` busy-lifecycle fold — behavior-
  preserving, 19 setups + 35 teardowns), #214 (doSolveRadical `busyGuard()` — the ONE authorized delta; net pin flipped
  runs→bails). Guard non-uniformity noted; **guard-unification (3b) SKIPPED** by user. All mutation-verified.
  · **RE-EVAL GATE PASSED (user 2026-08-02): "D1c + D1d both."**
  · **D1c COMPLETE — MERGED (#215, dd990ca).** Routed the last inline drift `doAutoSolve` → `classifyVerdict(cl)` (both
  handlers share ONE builder); `_verdictBadge` chip stays. Authorized string delta logged; net = classifyVerdict's pinned
  prose + a NEW source guard (both route through it; drifted strings gone); mutation-verified. Detail in LOG.
  · **D1d NEXT — the big lift (planning first).** Split `installAlgebra` (~4085-line closure, 714–4799) into ctx-injected
  sub-units. Behind the Phase-2/op-runner/verdict nets. Several PRs; plan the seams before large edits.

## Branches / PR
- Integration `refactor/main` @ **dd990ca** (#210–#215 merged). Tree clean. **No open PR.**
- Merged stage PRs (38): A1 #178 … #214, **p3-d1c-verdict-unify #215 (dd990ca)**.

## Validation state (green bar)
- **`refactor/main` — ALL GREEN** at dd990ca (#215 merged): build/typecheck/lint(+`dep:check`, 588 modules)/test exit 0;
  `pnpm test` **2222 / 262**.

## Uncommitted / unverified
- Nothing uncommitted. This STATE edit advances `refactor/main`.

## Known blockers / risks
- **D1a✓ D1b✓ D1c✓ all merged. D1d NEXT = the big installAlgebra split (several PRs).** Gate note: the point to stop if
  cost/benefit turns. **Plan the seams + report to the user BEFORE large edits** (ask-don't-assume; don't over-reach).

## Next concrete steps
1. **D1d — plan the seam decomposition of installAlgebra (714–4799):** which ctx-injected sub-units (candidate seams:
   op-runner / verdict / sidebar-wiring / inspector+canvas / session-state), what each needs from the shared closure
   (store, _abort, canvas, activeEnv, pickers, …), dependency order; one behavior-preserving seam per PR behind the nets;
   keep `algebra-ui.mjs` a composition root. **Report the plan to the user first.** Then execute PR-by-PR.
2. Order: A✓ B✓ C✓ → **D (D1a✓ → D1b✓ → D1c✓ → D1d)** → Phase 4 (D2) → E2 (Phase 5). E1 deferred.

## Resume commands
```
git fetch && git checkout refactor/main && git pull
pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm lint && pnpm test  # expect 2211/261
```
