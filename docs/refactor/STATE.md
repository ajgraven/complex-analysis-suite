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
  · **D1a NET-FIRST: PR #210 MERGED (60e1406).** `vitest/algebra-sidebar-html.test.ts` snapshots the WHOLE normalized
  #controls-algebra DOM (mutation-verified). Guards the transformation below as behavior-preserving.
  · **D1a TRANSFORMATION: PR #211 MERGED (b80429c)** — mountSidebar's inline `#alg-sections` string (8 sections +
  "Beyond the main route" divider) → a `SIDEBAR_SECTIONS` data array (`{summary,open?,body}` + `{divider}`) mapped through
  one `renderSection`; wrapper emitted once, **bodies verbatim**; header/suggest/inspector/scope unchanged. Behavior-
  preserving three ways (#210 fingerprint unchanged + all 20 jsdom algebra files 166 tests + mutation-verified); a
  pre-flight node oracle proved `normalize()`-equal (12394 chars) before editing. Pure refactor (2211/261, no test delta).
  **D1a COMPLETE.**
  · **D1b — DECISION MADE (user 2026-08-02): "Also guard doSolveRadical" → D1b BEHAVIORAL-CHANGE TOKEN GRANTED.**
  The 2nd authorized behavioral change in the engagement (after D1c's). Scope: (1) extract a `runOp()` async runner and
  route the ~15 async worker ops through it — behavior-preserving, each op's current `busyGuard()`→`_abort`→`setBusy()`→
  `.then(cleanup,errCleanup)` behavior net-verified unchanged; (2) **AUTHORIZED CHANGE** — add `busyGuard()` to
  `doSolveRadical` (algebra-ui.mjs:2574; synchronous, read-only "Solve for a variable" inspector op whose button is NOT
  `js-busy-lock` and which today runs while a worker op is in flight) so it bails "Busy — wait…" instead — matching
  Duplicate/Delete. Not a correctness fix (JS single-threaded, read-only); a UX-consistency change. **Log the exact
  behavioral delta.** Ships behind the op-runner net (net-first).

## Branches / PR
- Integration `refactor/main` @ **b80429c** (#210 + #211 merged; this STATE edit advances it). Tree clean. **No open PR.**
- Merged stage PRs (34): A1 #178 … #210, **p3-d1a-sidebar-data #211 (b80429c)**.

## Validation state (green bar)
- **`refactor/main` — ALL GREEN** at b80429c (#211 merged): build/typecheck/lint(+`dep:check`, 588 modules)/test exit 0;
  `pnpm test` **2211 / 261**.

## Uncommitted / unverified
- Nothing uncommitted. This STATE edit advances `refactor/main` (D1a complete; D1b decision pending).

## Known blockers / risks
- **D1b UNDERWAY (token granted).** No blockers. Net-first: characterize op-runner dispatch + doSolveRadical's current
  (unguarded) behavior BEFORE extracting `runOp()` / adding the guard. Delicate (~15 call sites); keep each op's behavior
  net-verified; the ONLY intended behavioral delta is doSolveRadical's guard (log it).
- **Re-eval gate** sits after D1b, before D1c/D1d.

## Next concrete steps
1. **Phase 3 · D1b (QD-ALG-4), net-first, token granted:** (a) build/extend the op-runner net (pin the ~15 async ops'
   busy/guard/abort/error behavior + doSolveRadical's current run-while-busy), mutation-verify; (b) extract `runOp()`,
   route async ops through it (behavior-preserving); (c) add `busyGuard()` to doSolveRadical (authorized delta, logged);
   full green bar; PR; STATE checkpoint. Then the **re-eval gate** before D1c✓/D1d.
2. Order: A✓ B✓ C✓ → **D (D1a✓ → D1b)** → Phase 4 (D2) → E2 (Phase 5). E1 deferred.

## Resume commands
```
git fetch && git checkout refactor/main && git pull
pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm lint && pnpm test  # expect 2211/261
```
