# The "Fuller Orchestrator" Redesign — Design & Plan

> **Status: COMPLETE — every phase shipped & merged (PRs #82–#97).** Phases **A** (pure StrategyPlan
> engine, #82), **B** (branch/case ProofTree + pool-then-quotient aggregation, #83), **D** (from-data
> entry, #84), and **E** (auditable rigor badge + reproducible proof export, #85) shipped in that
> order. **Phase C pivoted** away from the originally-planned reality/imaginary slice-completion —
> found math-limited for the conjugate model (the general system stays positive-dimensional; §8
> grounding finding) — to **three tractable, real, zero-dimensional "prove routes"**: **C1** moment /
> Aharonov–Shapiro (single-node, polynomial φ; #86–#88), **C2** rational-φ (2-node, degree-2; #89–#92),
> **C3** equilateral-triangle (3-node, degree-3; #93–#96), followed by a review-driven honest-labeling
> + gauge-canonicalization fix pass (#97). **The C-routes are documented in full in
> [`RATIONAL_MOMENT_C2.md`](RATIONAL_MOMENT_C2.md)** (the (P,s) triangle formulation, the residue-vs-π
> convention finding, and its §8 "Phase C is COMPLETE"); this doc points there rather than duplicating.
> §§1–4 remain the design/ADR rationale (still current); §5 records the shipped phase plan; §8 is the
> re-entrant progress log.
>
> Originating from the deferred item (iii) of [`FINAL_REPORT.md`](FINAL_REPORT.md) §"Status" and
> [`PLAN.md`](PLAN.md) — "the larger *fuller orchestrator* redesign (a first-class strategy plan +
> branch-case tree)". This was the authoritative spec; it was value-ordered into independently-shippable
> PRs, shipped **A → B → D → E**, then **Phase C reborn as C1/C2/C3**, then a review-fix pass.
>
> **Binding decisions (design session; retained below as ADR history):**
> 1. **Persist this doc, then implement Phase A** (the pure StrategyPlan extraction, no behavior change). — done (#82).
> 2. **Aggregation = POOL-THEN-QUOTIENT** (§3.2) — not sum-with-seam-dedup. Recorded as an ADR-style
>    decision below; do not re-litigate without a note here.

## 1. What "fuller" means (and doesn't)

The maturity review shipped `doProveExistenceUniqueness` ([`algebra/algebra-ui.mjs`](../../apps/quadrature-domains/app/algebra/algebra-ui.mjs)) as **one-click orchestration of sound
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
  id,                    // 'regime' | 'solve-real' | 'filter' | 'gauge' | 'assemble'
  title, why,            // legible: what this stage proves and why it's needed
}
CERTIFY_STAGES = [ Stage, … ]   // module-level, ordered — the declarative stage descriptors
runCertifyPlan(ctx) → ProofResult   // async; walks the stages over an injected ctx (store async
                                     // ops, hData, oracle, signal), emits ctx.onStage(id) per stage,
                                     // short-circuits when a terminal regime carries its own verdict
```

**As shipped** (`prove-plan.mjs`), the stages are *declarative* `{ id, title, why }` descriptors and
the driver (`analyzeLeaf` + `runCertifyPlan`) holds the per-stage logic and emits `ctx.onStage(id)` —
rather than each Stage carrying its own `run`/`terminal`/`rigorContribution`, as the sketch above
first imagined. `doCertifyUnivalence`'s body became the five `CERTIFY_STAGES` (regime → solve-real →
filter → gauge → assemble) calling the same helpers; `algebra-ui.mjs` is a thin binding. **Behavior
identical; the win is introspection + a stage transcript + the substrate for branching.** The engine
later grew sibling stage-lists + plans for the C-routes — `MOMENT_STAGES`/`runMomentPlan` (C1),
`RATIONAL_STAGES`/`runRationalPlan` (C2), `TRIANGLE_STAGES`/`runTrianglePlan` (C3) — and the
tree walker `runProofTree` (§3.2), all in the same module.

### 3.2 ProofTree — branches as data, aggregated by POOLING (the correctness heart)

```
ProofNode = { branchKind: 'root' | 'factor-case' | 'pin' | 'slice',
              label, systemIds, children[], localResult, genuinePhis[] }
```

When a stage detects a split — a `spuriousFactors` hit (factor union), a forced pin (positive-dim),
or a reality/imaginary slice — the driver **auto-forks** a child node per branch (via
`store.applyFactor` / `store.substituteValues` on a child column), **recurses on each** (as shipped:
`runProofTree` walking the fork, `analyzeLeaf` certifying each determined leaf), then aggregates.
*(The shipped tree wires the factor-union + forced-pin forks; the `'slice'` branchKind stayed a design
intent — Phase C pivoted away from slice-completion, §4/§5.)*

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

As shipped, from-data is a **branch inside the single entry point `doProveExistenceUniqueness()`**
(no args) — `const fromData = !activeEnv`: when there is no active numeric solve it takes
`hData = lastHData` (captured from the solve subscription, present even on a *failed* solve) provided
`state.mode === 'bounded'` (classical bounded), seeds directly via `seedFromDataDirect(hData)`, and
builds the plan context with `buildPlanCtx(ctrl, { hData, numPhi: null, … })` — no `activeEnv`
precondition. The numeric cross-check (`crossCheckPhis`) reports `oracleAvailable`; when no numeric φ
exists the assemble step passes on the residual alone (`residual < 1e-4 && (oracleMatch ||
!oracleAvailable)`), so the oracle is **optional corroboration, never a gate**. This makes it a genuine
*from-scratch* existence prover. *(The `proveFromData(hData, opts)` name in the original sketch was
never a standalone export — the logic lives in the `fromData` branch + `buildPlanCtx` opts.)*

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

> **As shipped:** the Phase-B tree (`runProofTree` / `assembleTreeVerdict`) wired the **factor-union**
> and **forced-pin** rows above — variable PINs (`substituteValues`) are enterable, general splits
> (`applyFactor`, needs a store node id) are flagged `truncated` = an honest LOWER BOUND. The two
> **slice rows never shipped**: Phase C pivoted away from slice-completion (§5, §8 grounding finding),
> so there is no slice-branch kind in the tree. Instead, the certified `=` for symmetric/off-slice
> multi-node cases comes from the **C1/C2/C3 prove routes** (§5), each of which carries its own honest
> labeling per the #97 fix — `=` only when zero-dim + certified count + exact ℚ(i) verification +
> *reliable* Schur–Cohn univalence + exact boundary-simple; *"locally-univalent candidate"* when only
> local univalence is certified; `≈` otherwise — and emits the `bound` field this table anticipates.

## 5. The plan — value-ordered phases (one PR each, gate-green, branch-first) — **all shipped**

Repo flow: branch off master, tests green at every commit, `lint && typecheck && test && build`
before each PR, append-only DAG + worker parity + honest labeling preserved throughout. Each phase
below is annotated with its shipped status; the blow-by-blow (with commits + gate counts) is in §8.
**Note the shipped order was A → B → D → E → C** (Phase C was deferred, then rebuilt last as the
C1/C2/C3 routes), not the A→B→C→D→E the numbering suggests.

### Phase A — Extract the pipeline into a pure StrategyPlan engine *(no behavior change)* — ✅ **SHIPPED (PR #82)**
- **Goal:** new `prove-plan.mjs`; refactor `doCertifyUnivalence`'s body into injected stages calling
  the same helpers; emit a `ProofResult`; `setVerdict` renders it. Zero user-visible change.
- **Why first:** the **safety net**. A golden test pinning the current disk + cardioid verdicts to
  the new `ProofResult` guards every phase after it.
- **Footprint:** `prove-plan.mjs` (new, pure); `algebra-ui.mjs` (thin binding); store ops injected.
- **Tests:** node vitest drives `runCertifyPlan` on canned hData through an injected store; asserts
  `ProofResult` reproduces today's verdict for disk (unique) + cardioid (cusped-simple).
- **Acceptance:** identical output; gate green + browser-verify. **Risk:** Low (pure refactor under a golden).

### Phase B — Branch/case tree + pool-then-quotient aggregation *(the capability core)* — ✅ **SHIPPED (PR #83)**
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

### Phase C — three tractable "prove routes" (moment / rational / triangle) — ✅ **SHIPPED (PRs #86–#96, fix #97)**

> **⚠ Pivoted from the original plan.** Phase C was first specced as *slice completion*: when a
> reality/imaginary slice is taken, auto-run the complement + the general system and aggregate
> slice ∪ complement into the §3.2 tree to promote a lower bound to `=`. Grounding (§8, `ffcc8ef`)
> showed this is **math-limited for the conjugate `(●)/(★)` model**: real-symmetric data leaves the
> general system positive-dimensional (z̄, Ā stay independent), so the tree usually truncates and `=`
> is unreachable without a *certified* symmetry argument. Phase C was deferred, then **rebuilt as three
> real, zero-dimensional routes** that sidestep the conjugate model entirely. **Full design + status:
> [`RATIONAL_MOMENT_C2.md`](RATIONAL_MOMENT_C2.md).**

- **Goal (as shipped):** route ✦ Prove, by node structure of the quadrature data, to whichever exact
  route is tractable, each REAL and generically zero-dimensional:
  - **C1 — moment / Aharonov–Shapiro (single node, polynomial φ = Σ wₖzᵏ):** `MOMENT_STAGES` +
    `runMomentPlan`; captures OFF-SLICE domains the reality slice can't see. Global univalence certified
    at **all orders** via the exact boundary double-point count (`momentBoundarySimple`, C1-ext-A);
    order ≤ 2 also confirmed by A&S. Reconstructed-φ thumbnail (C1-ext-B). *(#86–#88)*
  - **C2 — rational φ = w₀ + R(z + dz²)/(1 − cz²) (2 real nodes, degree 2):** `RATIONAL_STAGES` +
    `runRationalPlan`, solved in the shape (t = √c, d). *(#89–#92)*
  - **C3 — equilateral triangle φ = Rz/(1 − cz³) (3 equal-magnitude real-weight nodes, centroid 0,
    degree 3):** the 3-fold-symmetric collapse to a REAL (P = R², s = c^{1/3}) system; `TRIANGLE_STAGES`
    + `runTrianglePlan`. *(#93–#96)*
  - Everything else → the honest `(●)/(★)` Phase-B tree (a lower bound).
- **Footprint:** `prove-plan.mjs` (the three stage-lists / plans / `assemble*Verdict` / univalence +
  `boundarySimpleFromN`); `qd-equations.mjs` (`pointFunctionalSystem`, `rationalMomentSystem`,
  `triangleMomentSystem`); `algebra-ui.mjs` routing (`pointFunctionalMoments` → `multiNodeRationalData`
  → `multiNodeTriangleData` inside `doProveExistenceUniqueness`); `domain-mini-plot.mjs` thumbnails.
- **Honest labeling (fix pass #97):** each route's `*Univalence` propagates a Schur–Cohn `reliable`
  flag (an unreliable fold/cusp count never feeds a `=`); `allVerified` is gated on **genuine (kept)**
  candidates only; a verdict reads *"N locally-univalent candidate(s)"* — not *"Unique ✓ genuine QD"* —
  when only LOCAL univalence is certified; the 2-node order is canonicalized (a₁ = larger Re, +t branch
  ⇒ R > 0); and every `assemble*Verdict` emits a `bound` field (`=` when exact, `≈` when estimate).
- **Rigor:** `=` only when zero-dim + certified real count + exact ℚ(i) root verification (PF-1) +
  univalence (reliable Schur–Cohn φ′≠0 in 𝔻 **and** exact boundary-simple) + gauge quotient; otherwise
  honest `≈`. Irrational-shape QDs (e.g. `two-point-symmetric`, `c = (3−√5)/2`) can't PF-1-snap and
  correctly read `≈` — upgrading them needs the deferred interval / number-field certifier.
- **Deferred frontier:** general asymmetric / off-centre multi-node (needs the complex reim-split
  builder + higher-degree ansätze); interval / number-field `=` for irrational shapes. The original
  slice-completion idea is **not** revived (superseded, per the grounding finding).

### Phase D — From-data entry (PF-2) — ✅ **SHIPPED (PR #84)**
- **Goal:** a `fromData` branch in `doProveExistenceUniqueness` with no `activeEnv` (§3.4); cross-check
  becomes optional corroboration; a "Prove from data" UI path.
- **Footprint:** `prove-plan.mjs` entry + `algebra-ui.mjs` binding; `crossCheckPhis` guarded on
  oracle presence.
- **Tests:** the from-data path (`buildPlanCtx(ctrl, { hData, numPhi: null })` → `runCertifyPlan`) on
  canned h with no activeEnv → full verdict; cross-check marked "not run (no numeric oracle)" without
  downgrading a certified `=`.
- **Acceptance:** from-scratch proof works with no prior numeric solve; gate green + browser-verify. **Risk:** Low.

### Phase E — Proof transcript UI + reproducible proof export *(Phase-4 clarity)* — ✅ **SHIPPED (PR #85)**
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
*prove*) → D (from-data, drops the numeric-solve precondition) → E (make the richer proof legible +
exportable) → C (the tractable prove routes). Each PR leaves the tool strictly more capable and no
less honest. **A and B carry the design weight** (~⅓ the total); D/E are additive and low-risk. **The
shipped Phase C grew into its own sub-program** — C1/C2/C3 plus a boundary-rigor extension and a
honest-labeling fix pass (PRs #86–#97) — because slice-completion proved math-limited and the
moment/rational/triangle routes replaced it (§5, [`RATIONAL_MOMENT_C2.md`](RATIONAL_MOMENT_C2.md)).
Order-of-magnitude as shipped: PRs #82–#97, larger than the original 5-PR estimate because of the
Phase-C pivot.

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
- **2026-07-15 — C1-ext-B: surface the reconstructed moment map φ in the verdict thumbnail.** The moment
  route's genuine map is the POLYNOMIAL Riemann map φ(z) = a + Σ_{k=1}^{order} w_k zᵏ (a = φ(0) = the
  quadrature node), so its boundary φ(∂𝔻) is a direct trig sum of the coefficients — no elimination, no
  (z_j,A) ansatz, no `evalPhi`. New pure helper `momentPlotData(w, order, node, opts)` in
  `domain-mini-plot.mjs` returns the same `{boundary,nodes,view}` the canvas already renders; `renderProofVerdict`
  computes it inline for the `'moment'` kind (first genuine when several) and passes `plot` + a `plotCaption`
  override ("reconstructed domain φ(∂𝔻) = a + Σ wₖzᵏ · node a = φ(0)"); `doProveMoment` threads `pr.node =
  pf.node`; the canvas gained a one-line `data.plotCaption ||` fallback. +5 tests (incl. a cross-check that the
  coefficient route ≡ the app's `QD.evalPhi` on the cardioid to 1e-9). 1372 vitest + 2261 QD headless green;
  browser-verified — the cardioid ✦ Prove now draws the cardioid (boundary path starts at the nose φ(1)=1.5,
  single node at the origin, viewBox matches the true extent). **C1 (point-functional / moment) is now
  complete: certified real solve → Schur–Cohn + exact boundary count (rigorous `=` at all orders) → gauge
  quotient → verdict → reconstructed-φ thumbnail.** C2 (general multi-pole) remains DEFERRED (conjugate
  model intractable).
- **2026-07-15 — C2 REOPENED (user: attempt it) → grounded + spun off to its own thread.** The multi-node
  case needs a RATIONAL φ (the conjugate `(●)/(★)` model is positive-dim/intractable, C0; C1's polynomial φ is
  single-node-only). Two throwaway spikes proved a **rational-φ moment route** is tractable + rigorous `=` for
  degree-2 (symmetric AND general asymmetric: zero-dim, exact, `realCount=1` on the full data). Design + phased
  plan: **[`RATIONAL_MOMENT_C2.md`](RATIONAL_MOMENT_C2.md)**. **C2-1 SHIPPED:** `QE.rationalMomentSystem(nodeData,
  {degree:2})` — the rational analog of `pointFunctionalSystem` — emits the reduced zero-dim (t=√c, d) shape
  system (gauge unknowns w0,R eliminated analytically to avoid a spurious positive-dim component), guarded by
  the two ground-truth oracles (exact-satisfaction + zero-dim + recovers the truth). +6 tests. NEXT = C2-2
  (univalence for rational φ) → C2-3 (gauge quotient + verdict) → C2-4 (UI + thumbnail). Degree-2 real first;
  complex/off-axis + higher degree deferred.
- **2026-07-15 — C2 COMPLETE (degree-2 rational-φ route SHIPPED, PRs #89–#92).** **C2-2** (#90)
  `rationalUnivalence` (Schur–Cohn on 1+2dz+cz² + the pole `|c|<1` constraint) + `rationalBoundarySimple`,
  factoring the exact double-point test into the shared `boundarySimpleFromN`. **C2-3** (#91)
  `reconstructRationalMap` / `rationalCertifyLeaf` / `assembleRationalVerdict` / `runRationalPlan`
  (`RATIONAL_STAGES`, honest `=`/`≈`). **C2-4** (#92) UI: `multiNodeRationalData(hData)` → `doProveRational`,
  `renderProofVerdict` kind `'rational'`, `rationalPlotData` thumbnail. **Convention finding (browser + node
  verified):** the app's h-data residue **IS** the quadrature weight b_j — NO π factor (the `dA = dxdy/π`
  convention), so residues pass straight through as weights. `two-point-symmetric` (nodes ±1, weight 1.5) ⇒
  **Unique QD ✓**, recovering the golden-ratio shape R=(1+√5)/2, c=(3−√5)/2, d=0 — but the shape is IRRATIONAL,
  so PF-1 can't snap and it correctly reads `≈`; rational-shape families (c=¼, d=¼) read `=`. Detail:
  [`RATIONAL_MOMENT_C2.md`](RATIONAL_MOMENT_C2.md) §6. NEXT = C3 (equilateral triangle, degree-3).
- **2026-07-15 — C3 COMPLETE (equilateral-triangle degree-3 route SHIPPED, PRs #93–#96).** The 3-fold-symmetric
  (φ(ωz)=ωφ(z)) case collapses the three OFF-AXIS nodes to a REAL single-shape-parameter map φ = Rz/(1−cz³),
  avoiding the complex reim-split. **C3-1** (#93) `QE.triangleMomentSystem(data)` — the reduced zero-dim
  **(P=R², s=c^{1/3})** system (solving in P keeps the equations LINEAR in P; the raw R² form degenerates the
  RUR resolvent), guarded by the rational ground-truth oracle + the symmetry rejections (non-equilateral /
  off-centre / unequal weights). **C3-2** (#94) `triangleUnivalence(c)` (Schur–Cohn on 1+2cz³, pole `|c|<1`) +
  `triangleBoundarySimple(c)` (N=1+c·z₁z₂(z₁+z₂) → `boundarySimpleFromN`). **C3-3** (#95)
  `reconstructTriangleMap` / `triangleCertifyLeaf` / `assembleTriangleVerdict` / `runTrianglePlan`. **C3-4**
  (#96) `multiNodeTriangleData(hData)` → `doProveTriangle` (routed AFTER the 2-node rational check),
  `renderProofVerdict` kind `'triangle'`, `trianglePlotData`. **Browser-verified:** the equilateral-triangle
  preset (nodes 1, ω, ω², weight 1) reads *"Unique quadrature domain ✓ … rational-φ (equilateral triangle,
  degree-3, Gustafsson)"* and draws the rounded triangle, recovering c≈0.221 (a root of 2v³−3v+1) — irrational
  shape ⇒ honest `≈`. Degree-3 EQUILATERAL only; general asymmetric 3-node stays the frontier. Detail:
  [`RATIONAL_MOMENT_C2.md`](RATIONAL_MOMENT_C2.md) §7–§8.
- **2026-07-15 — REVIEW FIX PASS (honest-labeling + gauge canonicalization for C1/C2/C3, PR #97 `83fff3d`).**
  A review of the three routes found no wrong verdicts but five labeling/gauge gaps, now closed: **(1)**
  `momentUnivalence` / `rationalUnivalence` / `triangleUnivalence` return a Schur–Cohn `reliable` flag
  (`!degenerate || resolved`); each `*CertifyLeaf` treats an UNRELIABLE result as non-exact and skips the
  boundary-simple test (an unreliable `cusps` could make `count===cusps` pass falsely) — a latent false-`=`
  vector (needs φ′ degree > 64) now shut. **(2)** `allVerified` is gated on GENUINE (kept) candidates only —
  a rejected irrational root no longer downgrades a certified-exact unique QD to `≈` (the c=⅛ triangle now
  correctly earns `=`). **(3)** wording: *"N locally-univalent candidate(s)"* replaces *"Unique ✓ — genuine
  QD"* when only LOCAL univalence is certified (global not certified). **(4)** the 2-node order is
  canonicalized in `rationalMomentSystem` + `reconstructRationalMap` (a₁ = larger Re, the +t branch) so R>0
  regardless of caller node order (was a 180°-rotated thumbnail). **(5)** every `assembleMoment/Rational/
  TriangleVerdict` emits a `bound` field (`=`/`≈`) threaded through the ProofResult, so Export-proof JSON no
  longer writes `bound:null` for C1–C3. +4 tests; 1411 vitest + 2261 QD headless green; browser-verified.
- **2026-07-16 — ▓▓ THE FULLER-ORCHESTRATOR REDESIGN IS COMPLETE. ▓▓** All phases merged to master
  (PRs #82–#97): **A** engine → **B** ProofTree → **D** from-data → **E** transcript/export → **C** reborn as
  the three tractable prove routes **C1** (moment/A&S), **C2** (rational-φ), **C3** (equilateral triangle),
  hardened by the #97 fix pass. ✦ Prove now routes, in order: single-node-with-real-M₀ → C1, 2-real-node → C2,
  3-equal-magnitude-real-weight-node → C3, everything else → the honest `(●)/(★)` Phase-B tree (lower bound);
  each tractable route is REAL, zero-dimensional, certified-solved, univalence-filtered (Schur–Cohn + exact
  boundary double-point count), gauge-quotiented, thumbnailed, and honestly badged (`=` when PF-1 snaps the
  exact root, `≈` otherwise). This doc synced to that reality; the C-route detail lives in
  [`RATIONAL_MOMENT_C2.md`](RATIONAL_MOMENT_C2.md). **NEXT = the deferred frontier only** — general asymmetric /
  off-centre multi-node (needs the complex reim-split builder + higher-degree ansätze) and an interval /
  number-field certifier to upgrade irrational-shape `≈` to `=`. Phase-C slice-completion is NOT revived
  (superseded — math-limited for the conjugate model, per the grounding finding above).
