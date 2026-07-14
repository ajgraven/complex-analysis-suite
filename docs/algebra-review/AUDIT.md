# QD Algebra Module — Maturity Audit

> **Status: COMPLETE** (Phase 2). §1 workflow + §2 strengths from direct source reading; §3
> claim-vs-implementation matrix, §4 findings, §5 taxonomy integrated from all 7 Phase-1 audit
> tracks (`audit/A`…`audit/G`) + orchestrator pre-findings. Severity + evidence per finding.
> See `orchestrator-notes.md` for the verdict-chain code model, `PLAN.md` for the value-ordered
> slices. **Headline:** the exact kernel + engineering are sound; every material gap is at the
> workflow/labeling edge — the certificate chain does not fully imply the displayed "# genuine QDs"
> (missing `|z_j|<1` gate; unsaturated count; approximate-point cert; upper-bound-as-QD-count;
> domain-dropping default gauge pin), and there is no single legibly-rigorous entry point.

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

| Documented claim (ALGEBRA_MODULE.md / THEORY_MAP.md) | Actual state | Verdict |
|---|---|---|
| "count the REAL solutions (= actual quadrature domains)" (`doClassify` tooltip :907) | `realCount` = real points of the **cleared** variety = QD set ∪ {`|z_j|=1`} ∪ {`|z_j|>1` interior-pole maps}; a certified **upper bound** on #QD, not #QD | **Overstated** (B-1, C-1, A-1) |
| "Certified univalence verdict (authoritative) … # GENUINE quadrature domains" | Sound chain (regime + Schur–Cohn fold + boundary double-point + gauge quotient) **except** it never checks `|z_j|<1`, so interior-pole maps pass all filters | **Gap** (D-1) |
| "EXACT local fold (Schur–Cohn)", "real-solution count + locations certified (RUR + exact Sturm)" | Count/locations genuinely certified; but the per-solution fold/boundary test runs on `ratApprox(numeric coord)`, not the exact algebraic root (the isolating box `sym-core.mjs:1968` is discarded) | **Overstated** for the per-solution cert (PF-1, C-MED-1, D-2, E2) |
| "= exact, ≤ bound, ≈ estimate" honest labeling is binding | Held in most places; but flat-text verdict has **no badge**, and `doAutoSolve`/`doClassify(==1)` print `=`-strength "quadrature domain" from an unfiltered count | **Gap** (G-1, G-2, C-1) |
| "saturation `I:f^∞`" available and used | `saturate` correct (`sym-core.mjs:5228`) but **never invoked** in the count path | **Gap** (B-1) |
| Gauge quotient / "up to rotation" | `canonicalizeByRotation` correct; but the default `φ(0)=w₀` pin is the **translation** gauge, mislabeled "rotation gauge", and restricts to domains containing w₀ | **Overstated / mislabeled** (A-2) |
| "generateClassicalBounded emits the (●)/(★)/gauge system" exactly | (★) forward form exact (Jabotinsky-dual `M·N=I`), reimSplit faithful, Schwarz Blaschke correct, A&S cardioid reproduced | **Holds** (A) |
| Exact kernel (Gröbner/RUR/resultant/factor), worker parity, reproducible DAG, lossless round-trip | Confirmed sound (positive-dim gating fail-closed; single `runJob`; exact ℚ(i) serialization; terminate-on-cancel; no Date/random; DOM-free) | **Holds** (C, F) |

## 4. Findings (severity-ranked, with evidence)

Detail + repros in `audit/<track>.md`; `orchestrator-notes.md` for the verdict-chain model.

| ID | Sev | Finding (evidence) | Fix (plan slice) |
|---|---|---|---|
| **B-1** | **HIGH** | Unsaturated Möbius denominators counted as QDs: count path analyzes `V(cleared)=V(QD)∪{|z_j|=1}`; `saturate` (`sym-core.mjs:5228`) never called. **Live: unit disk h=1/w ⇒ "4 real quadrature domains" (true 2)**; `algebra-ui.mjs:1577`. | S2 |
| **D-1** | **CRITICAL** | Genuine-QD certificate has no `|z_j|<1` / `a_j∈Ω` gate; a solution with `|z_j|≥1` reconstructs a φ with a pole in 𝔻 yet passes all four univalence filters (repro `z₁=2`). Direct solver enforces `0<|z₀|<1` (`direct-common.mjs:1475`); algebra omits it. | S1 |
| **G-1** | **CRITICAL (UX)** | No single "prove existence/uniqueness" orchestrator; 3 overlapping buttons of differing rigor; authoritative `Certify univalence` (`:1785`) is collapsed + doesn't auto-reduce ⇒ dead-ends positive-dim on a fresh seed. | S5 |
| **G-2** | **CRITICAL (UX)** | Rigor legibility broken: verdict card is one flat text node (`algebra-canvas.mjs:438`), no `=`/`≤`/`≈` badge; PARTIAL/cross-check/slice caveats are prose ⇒ certified and estimate look identical. | S4 |
| **C-1** | **HIGH** | `doClassify(==1)` (`:1647`) + `doAutoSolve` (`:1574-1578`) print the certified **algebraic** count as the **QD** count (no univalence filter) — inconsistent with the app's own honest `count>1` branch (`:1648`). | S3 |
| **A-2** | **HIGH** | `φ(0)=w₀` pin (default pole centroid, ON by default) restricts to domains **containing** w₀ ⇒ a non-convex Ω excluding the centroid is dropped → possible **false "unique"**; ledger mislabels it "rotation gauge" (`:1534`). | S3 |
| **PF-1 / C-MED-1 / D-2 / E2** | **HIGH (rigor)** | The "exact"/"certified" per-solution univalence test runs on the `ratApprox` **midpoint**, not the exact algebraic root; the isolating-box witness (`sym-core.mjs:1968`) is discarded (`poleSubst` `:1735`). "certified" wording overstates when the filter was numeric or the coords approximate. | S4 wording now; **deferred** exact-at-box later |
| **A-1** | **MEDIUM** | `clearDenominators` (`sym-core.mjs:5440`) returns only the numerator, dropping the Möbius/φ′ factors and recording **no excluded locus** ⇒ nothing to saturate. | S2 (record locus) |
| **B-2** | **MEDIUM** | Interactive "Eliminate" uses raw Sylvester `resultant` (injects extraneous factors; `Res_x(yx+1,yx²−x)=2y` vs true ⟨1⟩); `eliminationIdeal` (Gröbner) exists but isn't the default. | S6 batch |
| **E1** | **MEDIUM** | Only a **numeric** check that the reconstructed φ reproduces h (`residualAtSolution` 1e-4, `:1931`); no exact symbolic verify of the displayed map. | S6 batch / deferred |
| **F5** | **MEDIUM** | CAS export dumps the current column verbatim (`algebra-store.mjs:2372/2366`); a conjugate-model (complex-coeff) export makes Maple/msolve "real solutions" a different quantity than the verdict. No guard. | S6 |
| **C-MED-2** | **MEDIUM** | `discriminantVariety` picks the separating form by max-degree with no separation certificate (`sym-core.mjs:4330-4343`); a missed form silently yields an incomplete boundary. | S6 batch |
| **B-3** | **MEDIUM** | `triangularize` surfaces freeVars/contradiction but not the regular-chain **initials**, so the chain is shown without its over/under-decompose-off-initials caveat. | S6 batch |
| **E3 / E4 / D-3 / D-4 / F1 / F2-4 / F6 / A-3 / G-misc / B-4** | **LOW** | numeric dedup under "certified" framing (E3); cross-check-failed φ not removed from count (E4); crossCheck `.some()` masks a spurious solution (D-3); user constraints absent from the ledger (D-4); `_CAP_KEYS` omits worker-read caps (F1); sync/worker opt-threading + abort-listener + load-error (F2-4); differential test gap (F6); realAxisSymmetry comment over-claims (A-3); console coord dump / cap-export-not-a-button (G); classify test asserts only `>=1` (B-4). | S6 batch |

## 5. Taxonomy

- **Correctness bugs (over/under-count):** B-1 (unsaturated count, HIGH — flagship), D-1 (missing admissibility
  gate, CRITICAL), B-2 (extraneous elimination factors, MED), E4 (cross-check-failed φ retained, LOW).
- **Missing mathematical foundations / certificates:** A-1 (excluded locus not recorded ⇒ no saturation),
  PF-1/E2/D-2 (per-solution univalence not certified at the exact algebraic point — the deep rigor item),
  E1 (no exact verify of the reconstructed map), C-MED-2 (no separation certificate).
- **Honest-labeling / over-claim:** C-1 (algebraic count = "QD"), A-2 (w₀ restriction + gauge mislabel),
  G-2 (no rigor badge), D-2 (certified wording on a numeric filter), B-3 (initials caveat), A-3.
- **Workflow / UX:** G-1 (no orchestrator; buttons of mixed rigor; authoritative path buried), G-misc.
- **Engineering (defensive, all LOW):** F1 (caps), F2/F3/F4 (opt-threading, abort listener, load-error), F6
  (differential test gap), F5 (export fidelity, MED).
- **Confirmed sound (not defects):** exact ℚ(i) kernel, positive-dim gating (fail-closed), RUR self-cert,
  Hermite radical-free distinct count, reducedDiscriminant, parametric Gröbner elim, boundaryCurve resultant,
  worker parity + exact serialization + reproducible DAG + lossless round-trip, faithful reconstruction
  (no branch bug), rotation gauge quotient, PROV_STORE/UI sync.
