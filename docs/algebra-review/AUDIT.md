# QD Algebra Module — Maturity Audit

> **Status: IN PROGRESS** (Phase 2 synthesis). Backbone (§1 workflow, §2 strengths) written from
> direct source reading; §3 claim-vs-implementation matrix, §4 findings, and §5 taxonomy are
> integrated from the 7 Phase-1 audit tracks (`audit/A`…`audit/G`) as they land. Severity +
> evidence per finding. See `orchestrator-notes.md` for the verdict-chain code model.

## 1. The actual current proof workflow (as built)

The module's purpose: given exact quadrature data `h(w)=Σⱼ Σ_s C_{j,s}/(w−aⱼ)^s`, decide how many
classical bounded quadrature domains realize it, exactly. What the code actually does today:

**Precondition (coupling).** The Algebra tab operates on an `activeEnv` — a quadrature problem that
has *already been numerically solved* in the geometry tab (`activeEnv.hData` + `activeEnv.primary.phi`).
All three verdict entry points bail with "No classical bounded QD solved yet" without it. There is no
from-raw-data entry point.

**Stage 1 — Generate.** `QDEquations.generateClassicalBounded(hData,{w0})` emits the (●) `φ(zⱼ)=aⱼ`,
(★) `C_{j,s}=Σ_k (k/s)A_{j,k}[t^k]φ̃ⱼ^s`, and gauge equations as cleared `MPoly=0` over ℚ(i) in the
**conjugate model** (zⱼ and z̄ⱼ independent). `{w0}` optionally substitutes the Riemann-map center φ(0)=w₀
(default: centroid of poles) and drops w₀/w̄₀ from the inventory (`system.w0Fixed`).

**Stage 2 — Model + assumptions.** `reimSplit` converts to the flat real/imaginary model (zⱼ=xⱼ+iyⱼ);
per-track assumptions assert variables real (`v̄≡v`) or imaginary (`v̄≡−v`); `realAxisSymmetry(hData)`
auto-detects real-axis symmetry to assume all base vars real. Each is an appended labeled DAG column.

**Stage 3 — Reduce (interactive or auto).** Append-column DAG ops: resultant elimination, Gröbner,
saturate, triangularize, factor (case-split), substitute/pin, linear-propagate. `doAutoSolve` chains
auto-reality → up to 4 linear-propagation passes to a fixpoint.

**Stage 4 — Regime + count.** `store.classifyAsync` runs the reim Gröbner + dimension test + Hermite
real-solution count (params pinned): → **inconsistent** (1∈I ⇒ no QD) / **positive-dimensional**
(underdetermined ⇒ "fix the gauge / pin") / **zero-dimensional** (+ realCount, complexCount, multiplicity).

**Stage 5 — Solve.** Zero-dim: `solveRealCertifiedAsync` (RUR + exact Sturm isolating boxes) first;
fall back to `solveRealAsync` (numeric multiplication-matrix eigenvalues, which can drop clustered roots).

**Stage 6 — Admissibility filter (per real solution).** `phiFromAlgebraSolution` reconstructs a candidate
φ; then `schurCohnFold` (exact Schur–Cohn inertia of num(φ′): #zeros in 𝔻 = local folds; #zeros on ∂𝔻 =
cusps) and `boundarySimpleExact` (exact real circle double-point count; simple ⟺ count===cusps) test
univalence, each with a numeric fallback (`findCriticalPoints` / `isBoundaryUnivalent`). **NB: both exact
tests are computed at the `ratApprox`-rationalized numeric coordinates, not the exact algebraic root** —
see finding [PF-1].

**Stage 7 — Gauge quotient + reconcile + cross-check.** Numeric `QD.sameDomain` merges rotation copies;
`reconcileRealCount` reconciles the certified Hermite count vs the numeric-found count (⇒ PARTIAL/undercount
notes); `crossCheckPhis` checks each φ against a freshly regenerated original system (residual) + the live
numeric solver (`sameDomain`). Verdict prints "# distinct genuine quadrature domains" + honest cusp/PARTIAL/
slice caveats + one-click "Show exact boundary curve" / "View in the QD plot".

**External escape.** `cas-export.mjs` exports Maple `RealComprehensiveTriangularize` (the primary parametric
real-QE path, deliberately not in-browser), Singular/Sage/Mathematica/msolve/SymPy/LaTeX; imports Maple RCTD +
msolve results.

## 2. Confirmed strengths (do not regress)

- **Exact ℚ(i) foundation is sound** (established by prior review passes; not re-litigated here): Rational →
  Gaussian → MPoly → Gröbner/RUR/resultant/factor, with an external-Sympy golden corpus + Hensel/second-
  reduction cross-checks.
- **The certificate chain is thoughtfully assembled and HONESTLY LABELED** where it counts: certified
  Hermite/RUR/Sturm real count; exact Schur–Cohn fold + exact boundary double-point tests; explicit
  balayage-vs-algebra reconciliation ("N real solutions" ≠ "K genuine QDs"); PARTIAL/undercount/slice
  caveats; a "Computed under:" assumption ledger for slices/gauge/factor cases.
- The store is a DOM-free append-column audit-trail DAG; heavy ops are worker-offloaded with a main-thread
  fallback; PROV_STORE/PROV_UI are in sync (Track G: sound, one deliberate non-DAG omission).

## 3. Claim-vs-implementation matrix

_(Filled from the audits. Columns: documented claim · actual state · verdict [holds / overstated / gap].)_

<!-- FILL FROM AUDITS A–G -->

## 4. Findings (severity-ranked, with evidence)

_(Integrated from tracks A–G + orchestrator pre-findings. Each: ID · severity · evidence file:line ·
the math · fix direction.)_

<!-- FILL FROM AUDITS A–G -->

## 5. Taxonomy (bugs / missing foundations / missing certificates / performance / UX)

<!-- FILL FROM AUDITS A–G -->
