# The "Fuller Orchestrator" Redesign — Design & Plan

> **Status: DESIGN APPROVED; Phase A in progress.** The deferred item (iii) from
> [`FINAL_REPORT.md`](FINAL_REPORT.md) §"Status" and [`PLAN.md`](PLAN.md) — "the larger *fuller
> orchestrator* redesign (a first-class strategy plan + branch-case tree)". This is the authoritative
> spec; it survives interruption and is value-ordered into five independently-shippable PRs (A–E).
>
> **Binding decisions (this session):**
> 1. **Persist this doc, then implement Phase A** (the pure StrategyPlan extraction, no behavior change).
> 2. **Aggregation = POOL-THEN-QUOTIENT** (§3.2) — not sum-with-seam-dedup. Recorded as an ADR-style
>    decision below; do not re-litigate without a note here.

## 1. What "fuller" means (and doesn't)

The maturity review shipped `doProveExistenceUniqueness` ([`algebra/algebra-ui.mjs`](../../apps/quadrature-domains/app/algebra/algebra-ui.mjs) `:1689`) as **one-click orchestration of sound
pieces**: a best-effort prelude (auto-reality → linear-propagate ×4 → `saturateMobius`) then the
authoritative `doCertifyUnivalence` pipeline. That closed finding G-1 and is **correct and honestly
labeled**. But it is *control flow*, not a *proof engine*.

"Fuller" (the review's PF-4) means promoting three things from implicit control flow to **first-class
data objects**, plus one new entry path:

1. **StrategyPlan** — the pipeline as an ordered, introspectable list of stages (§3.1).
2. **ProofTree** — branches (factor splits, forced pins, reality slices) as an auto-walked,
   auto-aggregated tree, not a user-clicked manual recursion (§3.2).
3. **ProofResult** — the verdict as a structured object, not a string with caveats appended (§3.3).
4. **From-data entry (PF-2)** — prove existence from raw quadrature data `h`, no prior numeric
   solve required (§3.4).

**It is explicitly NOT a rewrite.** The exact ℚ(i) kernel, the per-solution univalence certificate
(`nodeInsideDisk` → `verifySolutionExact` → `schurCohnFold` + `boundarySimpleExact`), the gauge
quotient, the reconcile oracle, and the cross-check are **sound and reused verbatim**. The redesign
changes only how they are *sequenced, branched, and reported*. This matches the audit's core finding:
the primitives are sound; every gap was at the workflow/labeling edge.

## 2. Where we are today — three concrete limitations

Reading `doCertifyUnivalence` ([`algebra-ui.mjs`](../../apps/quadrature-domains/app/algebra/algebra-ui.mjs) `:1917`) precisely:

**(L1) The plan is a promise chain, not data.** `classifyAsync → solveRealCertifiedAsync →
per-solution loop → gauge quotient → reconcile → crossCheck` is nested `.then()`s. It cannot be
introspected, paused, explained ("what stage, and why"), or re-entered after interruption. Progress
is a single status string.

**(L2) Branching is manual and un-aggregated.** The store *knows* about branches —
`_factorBranchInfo` ([`algebra-store.mjs`](../../apps/quadrature-domains/app/algebra/algebra-store.mjs) `:1830`) tags a column as "case *i* of *N*" of a split
`V(p)=⋃ₖ V(fₖ)`, and the verdict honestly says *"this counts THIS branch only; the branches add
up."* But **nothing walks the sibling cases and adds them up.** The user manually clicks "Split into
cases," analyzes each column, and mentally sums. Likewise:
- A positive-dimensional result offers one-click pin/split *actions* that **re-invoke**
  `doCertifyUnivalence` (`:1950`) — user-driven recursion, no tree.
- A reality/imaginary slice is a **lower bound** (`sliceCaveat`, `_assumptionInfo` `:1843`) with no
  mechanism to close the complementary slice and recover the general count.

**(L3) The result is a string.** The verdict is assembled by concatenation (`verdict += … · … · …`)
and `certRigor` is computed inline (`:2103`). There is no `ProofResult` object, so the aggregate
rigor is ad-hoc per call site, and a machine-checkable proof transcript doesn't exist.
`store.exportDAG()` exports the *algebraic* derivation but not the *proof strategy / branch* layer.

## 3. Target architecture — three objects + one entry

All new logic lands in a **pure, DOM-free module** `apps/quadrature-domains/app/algebra/prove-plan.mjs`
(vitest-testable in node), with `algebra-ui.mjs` reduced to a thin DOM binding (progress, verdict
card, action buttons). Heavy ops stay behind `store.*Async` (worker parity preserved). The
append-only DAG semantics are untouched.

### 3.1 StrategyPlan — pipeline as data

```
Stage = {
  id,                    // 'regime' | 'solve-real' | 'per-solution-filter' | 'gauge' | …
  title, why,            // legible: what this stage proves and why it's needed
  run(ctx) → StageResult // pure over an injected ctx (store async ops, hData, signal)
  terminal?,             // true ⇒ short-circuit (inconsistent / positive-dimensional)
  rigorContribution      // how this stage can cap the aggregate rigor
}
runPlan(ctx, stages, { onStage, signal }) → { stageResults[], proofResult }
```

`doCertifyUnivalence`'s body becomes ~7 named stages calling the same helpers. The driver threads one
shared context, emits per-stage progress, and short-circuits on a terminal stage. **Behavior
identical; the win is introspection + a stage transcript + the substrate for branching.**

### 3.2 ProofTree — branches as data, aggregated by POOLING (the correctness heart)

```
ProofNode = { branchKind: 'root' | 'factor-case' | 'pin' | 'slice',
              label, systemIds, children[], localResult, genuinePhis[] }
```

When a stage detects a split — a `spuriousFactors` hit (factor union), a forced pin (positive-dim),
or a reality/imaginary slice — the driver **auto-forks** a child node per branch (via
`store.applyFactor` / `store.substituteValues` on a child column), **recurses `runPlan` on each**,
then aggregates.

**ADR — Aggregate by pooling genuine φ's across the whole tree, then gauge-quotient the pool ONCE;
do NOT sum per-branch counts.**

*Context.* For a factor split `V(p) = V(f₁) ∪ V(f₂)`, the cases overlap on `V(f₁) ∩ V(f₂)`, so naive
summation double-counts any genuine QD on the intersection (inclusion-exclusion:
`|A∪B| = |A|+|B|−|A∩B|`). Today's "the branches add up" label glosses this. Separately, a domain can
appear as a gauge/rotation copy across two branches.

*Decision.* The gauge quotient already *pools* `genuinePhis` and dedups by `QD.sameDomain`
([`algebra-ui.mjs`](../../apps/quadrature-domains/app/algebra/algebra-ui.mjs) `:2041`). Widen that pool from one system to the whole branch tree: collect every
genuine φ from every leaf into one pool, then apply the gauge quotient + `sameDomain` dedup **once,
globally**. One mechanism fixes *both* the intersection double-count *and* cross-branch gauge copies.

*Consequences.* Correct by construction (a QD reachable via two cases is one φ up to `sameDomain` ⇒
counted once); reuses existing, tested code; the "count" is a derived property of the pool, not an
accumulator. Rejected alternative: keep per-branch counts and subtract pairwise `V(fᵢ)∩V(fⱼ)`
intersections (explicit inclusion-exclusion) — more moving parts, more error-prone, and it would need
its own intersection-solve per pair.

*Rigor of the aggregate* = **min over the tree**: one numeric fallback, one unclosed branch, or one
partial slice downgrades the whole. Unexplored branches (hit a `maxBranches` / `maxDepth` / cap
budget) ⇒ honest *"k of N cases closed — lower bound,"* naming the outstanding cases. Abort mid-tree
⇒ a partial tree, honestly labeled.

### 3.3 ProofResult — verdict as data

```
ProofResult = {
  headline, class, equivalence,        // "exactly 2 bounded QDs, up to rotation"
  count, bound: '=' | '≥' | '≤' | '≈', // machine-checkable, not string-parsed
  rigor, rigorProvenance[],            // "= because: certified count ∧ exact filters
                                       //  ∧ all branches closed ∧ cross-check ✓"
  perSolution[], assumptions[],
  branchTree, stageTranscript, derivationDAG
}
```

The verdict *string* becomes a **render** of this object. Aggregate rigor is computed **from the
tree** by one rule (§3.2), not re-derived per call site. The `bound` field is the seam where a future
interval-certified irrational (the *other* deferred item) flips `≈`→`=` — this design leaves the seam
without doing that work.

### 3.4 From-data entry (PF-2)

`proveFromData(hData, opts)` seeds directly from raw quadrature data — no `activeEnv` precondition
(today all three entry points require a prior numeric geometry-tab solve, `:1691` / `:1919`). The
numeric cross-check (`crossCheckPhis`' oracle match against `activeEnv.primary.phi`, `:2184`) becomes
an **optional corroboration** run iff a numeric φ exists — never a gate. This makes it a genuine
*from-scratch* existence prover.

## 4. Honesty semantics (binding — the aggregation rules)

Extends the review's honest-labeling guardrail (`=` exact / `≤` bound / `≈` estimate). The tree must
enforce:

| Situation | Aggregation rule | `bound` |
|---|---|---|
| Factor union, all branches closed & exact | Pool φ's, gauge-quotient once, dedup seam | `=` |
| Factor union, ≥1 branch partial/unexplored | Pool what's closed | `≥` (names the gap) |
| Reality slice **only** | On-slice pool | `≥` (names outstanding complement) |
| Slice **+** complement both closed | Union, dedup across seam | `=` |
| Any numeric fallback in any branch | — (aggregate min) | `≈` |
| Abort mid-tree | Partial tree | `≥` / `≈`, "cancelled — partial" |

The gauge/equivalence class is stated on the **aggregate**, once. A slice-only proof is *never*
silently promoted to `=`.

## 5. The plan — five value-ordered phases (one PR each, gate-green, branch-first)

Repo flow: branch off master, tests green at every commit, `lint && typecheck && test && build`
before each PR, append-only DAG + worker parity + honest labeling preserved throughout.

### Phase A — Extract the pipeline into a pure StrategyPlan engine *(no behavior change)*
- **Goal:** new `prove-plan.mjs`; refactor `doCertifyUnivalence`'s body into injected stages calling
  the same helpers; emit a `ProofResult`; `setVerdict` renders it. Zero user-visible change.
- **Why first:** the **safety net**. A golden test pinning the current disk + cardioid verdicts to
  the new `ProofResult` guards every phase after it.
- **Footprint:** `prove-plan.mjs` (new, pure); `algebra-ui.mjs` (thin binding); store ops injected.
- **Tests:** node vitest drives `runPlan` on canned hData through an injected store; asserts
  `ProofResult` reproduces today's verdict for disk (unique) + cardioid (cusped-simple).
- **Acceptance:** identical output; gate green + browser-verify. **Risk:** Low (pure refactor under a golden).

### Phase B — Branch/case tree + pool-then-quotient aggregation *(the capability core)*
- **Goal:** auto-fork factor-splits + forced pins into a `ProofTree`; aggregate per §3.2; bounded
  walk with honest partial labeling; abort threads through.
- **Footprint:** `prove-plan.mjs` (tree walk + `aggregate`); reuses `applyFactor` /
  `substituteValues` / `spuriousFactors`.
- **Tests:** a factorable locator → one aggregated verdict = pooled count (no manual case-clicking); a
  **seam-dedup correctness case** (a QD on `V(f₁)∩V(f₂)` counted once); a budget-bounded walk labels
  "k of N closed"; abort → partial.
- **Acceptance:** a factorable existence problem yields one honest aggregated verdict; gate green +
  browser-verify. **Risk:** Med — the intersection double-count is the subtle point; pool-then-quotient
  + the seam-dedup test are the mitigation.

### Phase C — Slice completion (reality/imaginary) into the tree
- **Goal:** when a slice is taken, auto-offer/run the complement (+ general when feasible) and
  aggregate slice ∪ complement; else stay a lower bound that *names* the outstanding slice.
- **Footprint:** `prove-plan.mjs` (slice-branch kind); reuses `assumeReal` / `assumeImaginary`.
- **Tests:** a real-axis-symmetric h where slice + complement recover the general `=`; an un-closable
  complement → labeled `≥` with the gap named.
- **Acceptance:** slice proofs promoted to `=` when closable, else legibly bounded; gate green. **Risk:** Low–Med.

### Phase D — From-data entry (PF-2)
- **Goal:** `proveFromData(hData)` with no `activeEnv`; cross-check becomes optional corroboration; a
  "Prove from data" UI path.
- **Footprint:** `prove-plan.mjs` entry + `algebra-ui.mjs` binding; `crossCheckPhis` guarded on
  oracle presence.
- **Tests:** `proveFromData` on canned h with no activeEnv → full verdict; cross-check stage marked
  "not run (no numeric oracle)" without downgrading a certified `=`.
- **Acceptance:** from-scratch proof works with no prior numeric solve; gate green + browser-verify. **Risk:** Low.

### Phase E — Proof transcript UI + reproducible proof export *(Phase-4 clarity)*
- **Goal:** render the `ProofResult` as an expandable transcript — strategy stages (with *why* +
  rigor each), the branch tree (each case's local verdict + how the pool sums), per-solution rows,
  assumption ledger, and the aggregate badge **with its provenance**. Export the whole `ProofResult`
  (strategy + tree + DAG) as reproducible, re-importable JSON (superset of `exportDAG`).
- **Footprint:** `algebra-canvas.mjs` (transcript render, extends `setVerdict`); `prove-plan.mjs`
  (serialize).
- **Tests:** jsdom render asserts tree/stages/badge-provenance; export round-trips.
- **Acceptance:** the verdict is a legible, auditable proof; gate green + browser-verify. **Risk:** Low.

## 6. Out of scope / non-goals

- **No change** to: the exact ℚ(i) kernel, the per-solution certificate math (reused verbatim as a
  stage), worker parity, or append-only DAG semantics.
- **Not this redesign** (orthogonal deferred items; `ProofResult.bound` leaves the seam): (i) interval
  / number-field Schur–Cohn to promote irrational `≈`→`=`; (ii) A-1's literal `φ′`-denominator
  record-at-generation.
- **Not** speculative strategy search / autonomous "try many tactics." The plan is a fixed, legible
  pipeline with deterministic branching, consistent with the honest-labeling guardrail. (A pluggable
  stage list leaves room to add tactics later without inviting a black box now.)

## 7. Sequencing rationale & effort

A (safety-net refactor, no behavior change) → B (auto-aggregated branches — changes what the tool can
*prove*) → C (slice completion, promotes lower bounds to `=`) → D (from-data, drops the
numeric-solve precondition) → E (make the richer proof legible + exportable). Each PR leaves the tool
strictly more capable and no less honest. **A and B carry the design weight** (~½ the total); C/D/E
are additive and low-risk. Order-of-magnitude: 5 PRs, comparable in aggregate to the P1–P4 backlog.

## 8. Progress log (re-entrant)

- **2026-07-14** — Design approved; pool-then-quotient chosen (§3.2 ADR). Doc persisted. Phase A started
  on branch `refactor/prove-plan-engine`.
- **2026-07-14** — **Phase A DONE (gate-green).** New pure engine `apps/quadrature-domains/app/algebra/prove-plan.mjs`
  (`CERTIFY_STAGES` + `runCertifyPlan` + the moved per-solution helpers `reconstructPhi`/`poleSubst`/
  `nodeInsideDisk`/`schurCohnFold`/`boundarySimpleExact`/`crossCheckPhis` + `certifyLeaf`/`gaugeQuotient`/
  `assembleVerdict`), all deps injected. `doCertifyUnivalence` reduced to a thin DOM binding (build
  deps/oracle + async op bindings → `runCertifyPlan` → `renderProofVerdict`/`renderPositiveDimVerdict`);
  verdict strings byte-identical. New `vitest/prove-plan.test.ts` (18): pure-fn units, a full
  `assembleVerdict` characterization (locks every verdict shape), `runCertifyPlan` control-flow, and a
  real-seed disk end-to-end proving the S1 admissibility gate fires + genuine certified + cross-check ✓.
  Gate: 155 vitest files + node-suite + 4 app builds green. NB node's `QD.sameDomain` doesn't merge ±ζ
  (so the node disk reads "2 distinct", not "unique") — a pre-existing behavior, unchanged by the refactor;
  the browser merges them. **MERGED to master via PR #82 (`6a40617`).**
- **2026-07-14** — **Phase B part 1 (engine core) DONE (gate-green), on branch `feat/prove-tree` (not yet a PR).**
  `analyzeLeaf(ctx)` extracted (regime → solve → filter → the UNquotiented genuine pool); `runCertifyPlan`
  = `analyzeLeaf` + gauge + assemble (byte-identical, Phase-A tests unchanged). New `runProofTree(ctx,
  {maxDepth,maxBranches})` walks the tree via an injected `ctx.fork = {detectSplits, enter, leave}`, pools
  genuine φ's across the whole tree, and gauge-quotients ONCE (`assembleTreeVerdict`, honest `=`/`≥`). +7
  tests (25 total) incl. the **seam-dedup** correctness case. Gate: 155 files / 1347 tests + 4 builds.
  **Remaining (Phase B part 2 — UI wiring):** build the real `ctx.fork` over the store and invoke
  `runProofTree` from `doProveExistenceUniqueness`. Design decisions found while mapping the store:
  (a) **escalation-only** — keep the prelude + `runCertifyPlan`, and escalate to `runProofTree` ONLY when
  the result is `positive-dim`; this makes the tree a pure improvement over today's manual pin/split
  dead-end with zero regression risk to the disk "Unique ✓" path. (b) `_appendReduction` self-checkpoints,
  so `fork.leave` should `undo()` down to a recorded `maxColumn()` fence (robust to multi-column
  `substituteValues` propagation), not a single `undo()`. (c) `spuriousFactors` returns a reim-poly `index`,
  NOT a store node id — so **variable PINs** (`substituteValues`) are directly enterable, but **general
  splits** (`applyFactor`, needs a node id) are not; enter the pins, and honestly flag any un-enterable case
  as `truncated` (LOWER BOUND). Then browser-verify NO regression on the disk + find a genuinely positive-dim
  factorable case that auto-aggregates, and open the Phase B PR.
- **2026-07-14** — **Phase B part 2 (UI wiring) DONE + browser-verified.** `buildPlanCtx(ctrl)` extracted
  (shared by Certify + Prove); `buildProveFork(params)` (the real store fork: `spuriousFactors` → enterable
  variable-PINs via `substituteValues`, general splits returned non-enterable, `leave` undoes to the
  `maxColumn` fence). `doProveExistenceUniqueness` now ESCALATES: prelude → `runCertifyPlan` → on
  `positive-dim`, `runProofTree` (mutate-then-revert, so the DAG is untouched) → aggregate verdict; if the
  walk closed NO branch (every case an un-enterable general split), it FALLS BACK to the manual pin/split
  card (no UX regression). `renderProofVerdict` accepts the `'tree'` kind. **Browser-verified on the fresh
  `dist/` build:** (a) disk = "Unique quadrature domain ✓" unchanged (zero-dim never escalates); (b) a
  φ(0)-free disk (positive-dim) escalates — the tree walks + honestly truncates ("LOWER BOUND"); (c) the
  fully-truncated tree falls back to the manual card; no console errors throughout. **⚠ browser gotcha:
  the `qd-esm` preview serves a production `dist/` BUILD, not a Vite dev server — a source edit is invisible
  until `pnpm -C apps/quadrature-domains build` + SW-clear + reload (paths like `/app/algebra/*.mjs` hit the
  SPA fallback = index.html, which misled the freshness check).** Phase B COMPLETE + MERGED (PR #83, `718b165`).
- **2026-07-14 — Phase C GROUNDING FINDING (⚠ revises the Phase-C plan).** Investigating `assumeReal` /
  `assumeImaginary` + `realAxisSymmetry` (qd-equations.mjs:697): `allReal` ⇒ the complex solution set is
  **closed under conjugation** (z↦z̄). The real slice (`z̄≡z`) captures the self-conjugate (real) solutions;
  off-slice solutions come in **conjugate pairs**, and a QD's conjugate is a DISTINCT domain (conjugation ≠
  the rotation gauge), so the real-slice count genuinely undercounts. **To promote a slice lower bound to `=`
  you must close the GENERAL (un-sliced) conjugate-model system — but that is POSITIVE-DIMENSIONAL** (z̄, Ā
  are independent; only the reality assumption ties them down enough to be zero-dimensional — even with the
  rotation-gauge node + φ(0) fixed, confirmed by Phase A's real-seed DIAG). So the Phase-B tree on the general
  system usually truncates → no `=`. **Consequence: Phase C's headline "promote lower bounds to `=`" is
  MATH-LIMITED for the conjugate model.** Honest achievable Phase C = run the complementary imaginary slice +
  the general system as tree branches, pool-then-quotient to *improve* the lower bound (surface off-slice
  conjugate-pair QDs when the general tree closes) + label the outstanding gap precisely — rarely `=`. A true
  `=`-closure needs a CERTIFIED symmetry argument ("real-symmetric data ⇒ every QD is real-symmetric"), proven
  not asserted. **Decision pending: honest-but-limited Phase C now, vs. reprioritize to Phase D (from-data,
  a clean mechanical win) / E (transcript UI).**
- **2026-07-14 — Phase C DEFERRED (user's call); Phase D (from-data / PF-2) DONE.** *(engine core `ae8f238`,
  UI entry this commit)*. **Engine (part 1):** `crossCheckPhis` now reports `oracleAvailable`;
  `assembleVerdict` + `assembleTreeVerdict` pass the cross-check when `residual<1e-4 && (oracleMatch ||
  !oracleAvailable)` — a from-data proof (no numeric φ) certifies on the residual alone (the oracle was
  always a bonus, not the basis of exactness). +4 tests (29 total). **UI (part 2):** `hDataParamValues(hData)`
  + `buildPlanCtx(ctrl, opts)` generalized to take an explicit hData/oracle; `lastHData` captured from the
  solve subscription (present even on a FAILED solve); `seedFromDataDirect(hData)` + `poleCentroid(hData)`;
  `doProveExistenceUniqueness` routes to from-data when `!activeEnv && state.mode==='bounded' && lastHData`
  — seeds directly from hData, runs with `numPhi=null`. **The clean signal is `state.mode==='bounded'`** (=
  classical bounded; not `lqd-*`/`pqd-*`/`unbounded`) from the shared `ui-state` — no QD-tab DOM coupling.
  This answers "does a QD exist?" even when the numeric solver failed. **NB the live positive trigger (a
  classical-bounded config whose numeric solve FAILS) is hard to reproduce with the built-in presets (they
  all solve), so the from-data verdict path is covered by the engine unit tests + no-regression (the
  activeEnv path is unchanged by construction: `buildPlanCtx(ctrl)` with no opts == the old behavior).**
  Phase D COMPLETE. Remaining: Phase E (transcript UI + export); Phase C deferred.
- **2026-07-14 — Phase E (proof transcript + reproducible export) DONE.** The rigor badge is now
  AUDITABLE + the proof is EXPORTABLE. **Engine:** `rigorProvenance(flags)` (pure, exported) — the audit
  trail behind the badge: each binding condition marked ✓ (met) / ✗ (not met) — certified real count,
  exact ℚ(i) filters, exact-verified roots, cross-check (matches / residual-only), branch-tree closed,
  complete. `assembleVerdict` + `assembleTreeVerdict` compute it; `runCertifyPlan` + `runProofTree` surface
  it on the ProofResult. **UI:** `setVerdict` renders `data.rigorProvenance` as an expandable **"Why this
  rigor"** `<details>` (so a `=`/`≥` is justified, not merely asserted); the derivation export became a
  full **"Export proof (JSON)"** — `{format:'qd-proof', version:1, proof:{kind, verdict, rigor, bound,
  count, rigorProvenance, perSolution, assumptions, stages:CERTIFY_STAGES}, derivation:store.exportDAG()}`
  (reproducible + re-importable). +3 tests (32 total): exact ⇒ all ✓; numeric-fold ⇒ filters ✗; the
  `rigorProvenance` helper marks conditions + notes a truncated tree / residual-only cross-check. Gate +
  browser-verify pending. **▓▓ Phase E is the LAST phase — the fuller-orchestrator redesign is COMPLETE
  (A engine → B tree → [C deferred] → D from-data → E transcript). ▓▓**
- **2026-07-15 — Phase C REVISED + BUILT (C0 pivot + C1 moment route).** User: off-slice QDs DO occur;
  do C0 grounding first, then build C1. **C0 spikes (throwaway) found:** the conjugate `(●)/(★)` reim system
  keeps z̄,Ā INDEPENDENT (disk = 8 reim vars) ⇒ POSITIVE-DIMENSIONAL (disk Krull 2) even after
  assumeReal+propagate+saturate; certified solve FAILS; two-point solve HANGS; cardioid Gröbner > 300 gens.
  **The conjugate model is intractable exactly for the multi-QD / off-slice cases** — "add the imaginary
  slice" is a dead end (it's identically positive-dim). **PIVOT: the MOMENT (point-functional / Aharonov–
  Shapiro) formulation** (`QE.pointFunctionalSystem`) is REAL-variable, generically ZERO-DIM, tractable, and
  its certified real solutions are ALL candidate polynomial maps φ=Σw_k zᵏ — capturing off-slice domains,
  with NO reality slice. Validated: cardioid {1.5,0.5}→certReal 2, φ′ Schur–Cohn ⇒ w₁=±1 (both univalent,
  cusp), w₁>0 gauge ⇒ **Unique** (A&S); **complex moment {2, 0.7+0.3i} (OFF-SLICE) ⇒ certReal 4, 2 folds
  rejected, w₁>0 ⇒ Unique** — the domain the real slice can't see; {1,0.4}→0 (no QD). **C1 ENGINE + UI
  BUILT** on branch `feat/prove-moment-route`: `prove-plan.mjs` gains `MOMENT_STAGES`, `reconstructMomentW`,
  `momentUnivalence` (Schur–Cohn on φ′), `momentExactVerify` (PF-1), `momentCertifyLeaf`,
  `assembleMomentVerdict` (order ≤ 2 rigorous `=` via A&S; order ≥ 3 LOCAL-only, honest), `runMomentPlan`;
  `algebra-ui.mjs` gains `pointFunctionalMoments(hData)` (single node, real M₀) + `doProveMoment` — ✦ Prove
  ROUTES point-functional data to the moment plan; `renderProofVerdict` handles kind `'moment'`. +5 tests
  (37 total). **Scope:** C1 = point-functional (`=`, off-slice-complete, order ≤ 2 rigorous); C2 = general
  multi-pole (conjugate model, research-limited, honest lower bound) — DEFERRED. Gate + browser-verify + PR
  in progress.
- **2026-07-15 — C1-ext-A: exact boundary double-point count (global univalence for order ≥ 3), MERGED
  as PR #86 follow-on.** C1's headline gap was that global univalence (⇒ rigorous `=`) was only proven for
  order ≤ 2 (the A&S theorem); order ≥ 3 read a LOCAL-only `estimate`. Fix: `momentBoundarySimple(w, order,
  cusps, deps)` builds the divided-difference N(Z₁,Z₂)=Σ_k w_k Σ_{j<k} Z₁ʲZ₂^{k-1-j}, substitutes ζ→x+iy
  with two circle quadrics, and runs `Sym.realSolutionCount` on the reim system — `φ(∂𝔻)` is **simple ⟺
  count === cusps** (each boundary cusp is one diagonal solution). Exact over ℚ(i), so it CERTIFIES global
  univalence for ANY order. `momentCertifyLeaf` now runs it per genuine candidate (tracks `allBoundaryExact`,
  rejects `selfInt`); `assembleMomentVerdict` grants `=` when `allBoundaryExact` (all orders), else the
  order ≤ 2 A&S fallback, else honest order ≥ 3 LOCAL-only. **Empirical finding (exact sweep, throwaway):
  across 116 locally-univalent order-3 points, EVERY one is also boundary-simple** — for order 3 the local
  Schur–Cohn test already implies global univalence in this coefficient region, so the boundary test never
  *rejects* here; its value is the **rigor UPGRADE** (order ≥ 3 now certifies `=` instead of `estimate`).
  The `selfInt` reject path stays as a correctness guard (reachable at higher order). +8 tests (45 total);
  1367 vitest + 2261 QD headless green; browser-verified (cardioid ✦ Prove now reads "φ′≠0 in 𝔻 + φ(∂𝔻)
  simple certified (Schur–Cohn + exact boundary double-point count) ⇒ globally univalent", row "+ boundary-
  simple", still Unique ✓ `=`). **NEXT = C1-ext-B: surface the moment φ=Σw_k zᵏ in the QD plot.**
