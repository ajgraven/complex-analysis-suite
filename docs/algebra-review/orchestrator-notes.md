# Orchestrator notes — the current existence/uniqueness verdict (read for Phase 3)

> My own architectural read of the authoritative verdict path, captured so Phase 3 design
> survives interruption. Complements the Phase-1 audit tracks (which report FINDINGS); this
> is the CODE MODEL of what Phase 3 must orchestrate/improve. All line refs `algebra/algebra-ui.mjs`.

## The three current entry points (all operate on the CURRENT reduced system)

1. **`doClassify` (1625)** — "Existence / uniqueness": `store.classifyAsync` (reim Gröbner + Hermite real
   count, params pinned) → inconsistent / positive-dim / zero-dim + realCount/complexCount/multiplicity.
   Honest `sliceCaveat` for reality-assumed slices; `partialBranch` note for factor cases.
2. **`doAutoSolve` (1542)** — "★ Auto-reduce & solve": (a) auto-reality if `realAxisSymmetry(hData).allReal`;
   (b) up to 4 `reducePropagate` linear passes to fixpoint; (c) `classifyAsync`; (d) `solveRealAsync` for
   explicit real solutions. Does NOT chain into univalence certification. Does NOT do elimination/Gröbner
   strategy or factor-branching.
3. **`doCertifyUnivalence` (1785)** — THE authoritative verdict. Chain:
   - regime via `classifyAsync` → inconsistent ⇒ "no QD"; positive-dim ⇒ "underdetermined, fix gauge/pin"
     with one-click pin/split actions from `store.spuriousFactors`; zero-dim ⇒ continue.
   - `solveRealCertifiedAsync` (RUR + exact Sturm boxes) FIRST; fall back to `solveRealAsync` (numeric
     eigenvalue) — the latter can silently drop clustered/non-radical roots.
   - per real solution (im < 1e-4 filter): `phiFromAlgebraSolution` → `schurCohnFold` (exact local fold,
     φ′≠0 in 𝔻) + `boundarySimpleExact` (exact real double-point count; simple ⟺ count===cusps), each with a
     numeric fallback (`findCriticalPoints`/`isBoundaryUnivalent`).
   - gauge quotient via numeric `QD.sameDomain`.
   - `reconcileRealCount` oracle: certified Hermite count vs numeric-found → PARTIAL/undercount/disagree notes.
   - numeric cross-check `crossCheckPhis` (residual vs freshly regenerated system + `sameDomain` to the
     live numeric solver).
   - verdict strings with honest cusp / PARTIAL / slice caveats; one-click "Show exact boundary curve"
     (`QE.boundaryCurveFromPhi`) and "View in the QD plot".

## Strengths (already mature — do NOT regress)

- The certificate chain is thoughtfully assembled and HONESTLY LABELED: certified Hermite/RUR/Sturm count,
  exact Schur–Cohn fold, exact boundary double-point, gauge quotient, reconcile oracle, numeric cross-check,
  slice caveats. The distinction "N real algebraic solutions" vs "K genuine QDs" (balayage-vs-algebra) is
  explicitly reconciled. This is the backbone Phase 3 should preserve and orchestrate, not replace.

## Pre-findings (to corroborate against the audits, then fold into AUDIT.md)

- **PF-1 (rigor, HIGH — SUSPECTED, expect C/D/E to corroborate):** the per-solution univalence certificate
  is exact ARITHMETIC but on a RATIONALIZED point. `poleSubst` (1722) builds the substitution from
  `QE.ratApprox(v.re||0)` of the NUMERIC solution coords, so `schurCohnFold`/`boundarySimpleExact` prove
  φ′≠0 / boundary-simple for `ratApprox(numeric root)`, NOT the exact algebraic root. The COUNT is certified
  (Hermite/RUR/Sturm over the exact system); the ADMISSIBILITY FILTER (univalence) that converts
  solutions→genuine-QDs is evaluated at approximate coordinates. Verdict still prints "Schur–Cohn … certified"
  and "locations certified (RUR + exact Sturm)". Honest fix: evaluate the fold/boundary tests at the EXACT
  algebraic point (substitute the RUR/number-field coordinates), or bound the ratApprox error and certify the
  count is stable in that interval; otherwise downgrade the per-solution certificate wording to reflect the
  approximation. **This is likely the single most important rigor finding.**
- **PF-2 (workflow coupling, MEDIUM):** all three entry points require `activeEnv` (1544/1787: "No classical
  bounded QD solved yet") — i.e. the ALGEBRA proof presupposes a NUMERIC QD was already solved in the geometry
  tab (activeEnv.hData + activeEnv.primary.phi). A from-scratch existence proof (raw data → verdict, no prior
  numeric solve) isn't a first-class path. Phase 3's autonomous pipeline should accept quadrature data directly.
- **PF-3 (pole/node location, HIGH — SUSPECTED, Track D owns):** I found NO check that the reconstructed nodes
  satisfy |z_j|<1 (inside 𝔻) or that poles a_j ∈ Ω. `phiFromAlgebraSolution` (1667) builds φ from (z_j,A_{j,k})
  with no disk-membership gate. An algebraic solution can satisfy (●)/(★) with |z_j|>1 (node outside the disk)
  — not an admissible bounded QD — yet still pass the fold/boundary tests. Confirm in Track D; if real, the
  genuine-QD count can OVER-count.
- **PF-4 (Phase 3 scope):** `doCertifyUnivalence` is ALREADY a semi-autonomous pipeline; Phase 3 is best framed
  as (a) UNIFYING doAutoSolve+doClassify+doCertifyUnivalence into one orchestrated action with an explicit
  strategy plan + branch/case tree as first-class objects; (b) closing PF-1/PF-3 rigor gaps; (c) a from-data
  entry (PF-2); (d) a guided front-end (Phase 4). NOT a rewrite — the primitives + honest chain are sound.
