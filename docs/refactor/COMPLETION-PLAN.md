# COMPLETION-PLAN — the home stretch

> **Status: APPROVED (2026-08-01).** Execution plan for finishing the refactor. It does **not**
> supersede [`PLAN.md`](PLAN.md) v1 (still the authoritative roadmap and findings register); it
> **sequences and resolves** PLAN.md's remaining Groups **D / E / F** into an executable order and
> records the user's three governing decisions. Where this file and PLAN.md disagree on *sequencing*,
> this file wins; where they disagree on *findings/evidence*, PLAN.md + git win.

## 1. Governing decisions (2026-08-01, recorded verbatim)

> User: **"1. Take the pragmatic path. 2. Defer. 3. Do the D1c verdict-unification token."**

| # | Decision | Resolves | Effect |
|---|---|---|---|
| 1 | **Take the pragmatic path** | how much of D1 to pre-commit | Do the D1 **enabler + duplication collapse** (Phase 2 + D1a/D1b) and **re-evaluate at a gate before the D1c/D1d structural split** — do **not** pre-commit to the full a–d decomposition up front. |
| 2 | **Defer** | PLAN.md §9 **D-3** | **E1** (state/lifecycle unification, QD-UI-3/9) is **OUT of scope** for this engagement. Deferred, not cancelled — revisitable in a later engagement. |
| 3 | **Do the D1c verdict-unification token** | the §3 behavior-change sign-off for D1c | **APPROVAL TOKEN GRANTED.** D1c (QD-ALG-5) unifies the **three drifted** verdict builders onto one path; that changes some user-facing verdict strings. This is now an **authorized behavioral change** — the only one in scope. It still ships behind a characterization net and with honest labeling preserved. |

**PLAN.md §9 decision points, now resolved:** D-1 → align empty-pole fallback to `{re:0}` (already landed in A1 #178). D-2 → folderize **LATE** (E2, Phase 5). D-3 → **E1 deferred** (decision #2). D-4 → `harness.ok` kept wrapped (B1, done).

## 2. Where we actually are (grounded 2026-08-01, `refactor/main @ 3d4080d`)

- **Green:** build/typecheck/lint exit 0; `pnpm test` **2208 passed / 253 files**. 26 stage PRs merged.
- **Groups A, B, C, and the ui.mjs pure-seam: done.** Group **D is underway**: `installAlgebra` had **9
  behavior-preserving PURE carve-outs** (#195–#203) into 4 companion modules (labeling/format/moment-parse/latex)
  + one in-file badge lift, adding ~69 characterization tests over logic that had **zero** coverage.
- **The honest reality the plan must own:** the carve-outs were a **prelude**, not D1. `installAlgebra` is still
  **≈4.1k lines** (`algebra-ui.mjs:714`, file total **4,849**). The remaining mass is **DOM-bound** (QD-ALG-2:
  the sidebar is one `innerHTML` string wired by stringly-typed ids) and **store-coupled** — it cannot be carved
  as pure functions. Decomposing it is a **strategy shift to jsdom-driven behavioral tests**, and it is **gated**
  by **11 brittle source-text (`readFileSync`+regex) algebra tests** (QD-ALG-3) that pin *source text*, not
  *behavior*, and so would not catch a behavior regression. **Converting those is the true D1 enabler.**
- **Unstarted downstream:** **F1** (no `dependency-cruiser` config or CI wiring exists), **D2** residual (`ui.mjs`
  = 1,891 lines, 0 exports, 16 `ui-*.mjs` factories — pure logic already in siblings; what's left is DOM wiring),
  **E2** (58 flat `app/*.mjs` files). A1 residuals **QD-ALG-7** + **QD-SOLV-6** deferred here from Group A.

## 3. The five phases (recommended order)

Each phase = one or more PRs to `refactor/main`, each green + behavior-preserving (except the one D1c token in
Phase 3), each independently reviewable/revertible. **Merge-on-green** cadence (delegated). Pause at any phase
boundary.

### Phase 1 — Low-risk residuals + invariant lock (independent, unblocked) — ~2–3 PRs, risk **low**
Small, high-confidence items that need no new net and unblock nothing downstream — done first to clear the deck.
- **F1** — wire **`dependency-cruiser`**: strictly-downward package imports + no-cycles, run in `ci.yml`. (CLAUDE.md
  guardrail; PLAN.md §8 F1. CD-4 already fixed, so no-cycles is enforceable.)
- **QD-ALG-7** — `edges` store getter returns a `.slice()` (stop leaking the live array; `algebra-store.mjs:3115`).
  Char: a test asserting the returned array is a copy.
- **QD-SOLV-6** — centralize the `identityOK` tolerance (computed 3× with divergent tol). Char: pin current
  accept/reject at each of the 3 sites **before** unifying; **do not widen** any tol to make them agree — if they
  genuinely differ, keep the strictest and record the change in LOG for sign-off.
- *Optional here:* **QD-SOLV-5** (seeds-common, still OPEN) and **B3** (QD coverage for `.mjs`) — take only if cheap.

### Phase 2 — The D1 enabler: source-text → behavioral tests (tests-only) — ~2–3 PRs, risk **medium**
**This is the gate that authorizes Phase 3.** No production code changes — pure test work on today's code.
- Convert the **11 algebra source-text tests** (QD-ALG-3) from `readFileSync`+regex assertions to **behavioral,
  jsdom-driven** assertions that exercise `installAlgebra` through a real (fake-`Worker`, jsdom) mount.
- Add jsdom behavioral coverage of the two seams Phase 3 will cut: the **sidebar build/wire** (QD-ALG-2) and the
  **op-runner dispatch** (QD-ALG-4) — input → dispatch → rendered DOM, plus the verdict prose paths (QD-ALG-5) so
  D1c's string change is caught and reviewed, not silent.
- **Done-when:** every new/converted test passes against **unmodified** `algebra-ui.mjs`; the D1 targets have
  executable behavioral coverage. This *is* the net (PLAN.md §3: no refactor without a passing net pinned to
  pre-refactor code).

### Phase 3 — Decompose `installAlgebra` (D1), behind the Phase 2 net — ≥4 PRs, risk **med → high**
The big one. One concern per PR. **Pragmatic-path gate inside this phase (decision #1):**
- **D1a — sidebar-as-data (QD-ALG-2).** Replace the `innerHTML` string + stringly-typed id wiring with a
  data-described sidebar rendered/wired in a single pass. Behavior-preserving. Char: Phase-2 sidebar tests.
- **D1b — `runOp()` single-flight (QD-ALG-4).** One async op-runner with a uniform single-flight guard;
  fold in `doSolveRadical` (which currently omits it). Behavior-preserving. Char: Phase-2 op-runner tests.
- **↳ RE-EVALUATION GATE.** After D1a/D1b land + green: report state (churn, remaining mass, risk read) and
  confirm go/no-go into D1c/D1d. Decision #3 pre-grants D1c's token, so **no new approval round is needed to
  proceed** — the gate is a sequencing checkpoint, and D1d in particular is the point to stop if the cost/benefit
  has turned.
- **D1c — unify the verdict path (QD-ALG-5). [TOKEN APPROVED — decision #3.]** Collapse the **three drifted**
  verdict builders (`doClassify @3521`, `doAutoSolve @3275`, `_verdictBadge @4693`) onto one path. **Authorized
  behavioral change:** some verdict strings change. Ships behind the Phase-2 verdict net (diffs reviewed, not
  silent) with `=`/`≤`/`≈` honest labeling preserved; the string delta is recorded in LOG.
- **D1d — split into mounted sub-units** (sidebar / verdict / op-runner / session), ctx-injected, each
  importable/testable; `algebra-ui.mjs` becomes a composition root. **Go/no-go at the gate above.**

### Phase 4 — `ui.mjs` → composition root (D2) — ~2–3 PRs, risk **medium**
- First the small deferred **`ui.mjs` seam** (B4's deferred piece — `ui.mjs` boots on import with 0 exports, so it
  needs a minimal seam before it's characterizable), then lift the residual DOM-wiring / cross-tab / help mounting
  into `installX(uiCtx)` factory modules until `ui.mjs` is a thin root. Char: the seam's behavioral tests.

### Phase 5 — Folderize (E2), mechanical & LAST — 1 PR, risk **low-but-broad**
- Codemod the **58 flat `app/*.mjs`** into `core/ solvers/ qd/ sym/ analysis/ ui/` by existing prefix; rewrite
  import paths; regenerate `main.mjs` (via its gen script, preserving load order) + `workers/solver-graph.mjs`.
  Char: `vite build` + full suite green (pure path edits, zero behavior delta). Done last so files aren't moved twice.

## 4. Out of scope / deferred

- **E1 — state/lifecycle unification (QD-UI-3/9): DEFERRED** (decision #2). Highest-risk, most architectural; can be
  a later engagement without unwinding D/E2/F.
- **QD-ALG-6** (scattered realness/verify tolerances): DECLINED as a carve-out earlier — not a pure computation;
  reconsider only if a Phase-3 sub-unit makes it a clean parameter.
- CD god-module work (CD-1/2): out per the reconciled scope (PLAN.md §4 — CD is cheap-wins-only).

## 5. Approval tokens in force

- **`APPROVED: PLAN.md v1`** — implementation authorization (standing).
- **`APPROVED: D1c verdict-unification`** — the one in-scope behavioral change (decision #3, 2026-08-01). All other
  stages remain **behavior-preserving by default**; any *other* behavior change still needs its own token.

## 6. Sequencing summary

`Phase 1 (F1 + A1 residuals)` → `Phase 2 (net: source-text→behavioral)` → `Phase 3 (D1a, D1b → gate → D1c✓, D1d?)`
→ `Phase 4 (D2)` → `Phase 5 (E2)`.  **E1 deferred.**  ~12–15 PRs. Recommended immediate next step: **Phase 1**.
