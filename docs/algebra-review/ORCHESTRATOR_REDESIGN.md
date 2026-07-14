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
