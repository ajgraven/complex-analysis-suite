# QD Algebra Module — Maturity Review: Final Report

> Branch `algebra-maturity-review` (off `master` @ `355ed9c`). Full evidence: `AUDIT.md` (findings),
> `PLAN.md` (slices), `audit/A`…`audit/G` (per-track), `orchestrator-notes.md` (verdict-chain model),
> `STATE.md` (re-entrant log). This report is the closeout.

## 1. The most important findings

The exact ℚ(i) kernel and the store/worker/export engineering are **sound** (7-track audit + prior
reviews). Every material gap sat at the **workflow / labeling edge** — the certificate chain did not
fully imply the displayed "# genuine quadrature domains", and rigor was not legible. Ranked:

1. **CRITICAL — no `|z_j|<1` admissibility gate (D-1).** `doCertifyUnivalence` counted an algebraic
   solution whose reconstructed `φ = w₀ + Σ conj(A_{j,k})ζᵏ/(1−conj(z_j)ζ)ᵏ` has a pole at `1/conj(z_j)`
   *inside* 𝔻 (when `|z_j|≥1`) as a genuine bounded QD. `clearDenominators` drops the `(1−z̄_j z)` factors,
   so all four univalence filters were blind to it (repro `z₁=2`: filters pass, `evalPhi(0.5)` throws at
   the interior pole). The numeric direct solver already enforced `0<|z₀|<1`; only the algebra omitted it.
2. **HIGH (flagship) — unsaturated count over-counts (B-1).** The existence count analyzed
   `V(cleared)=V(QD)∪{|z_j|=1}` directly, so the *unit disk* `h=1/w` reported **"4 real quadrature
   domains"** (true 2; the extra two are `z=±1`). `saturate` existed but was never invoked.
3. **HIGH — the raw count was mislabeled a QD count (C-1) and the default gauge pin could drop domains
   (A-2).** `doClassify(==1)`/`doAutoSolve`/the track chip printed the certified *algebraic* count as
   "Unique/N real **quadrature domains**"; and pinning `φ(0)=w₀` (default = pole centroid, on by default)
   silently restricts to domains *containing* w₀ — a possible false "unique" — mislabeled "rotation gauge".
4. **CRITICAL (UX) — no rigor legibility + no single entry point (G-2, G-1).** The verdict card was one
   flat text node with **no `=`/`≤`/`≈` badge**, so a certified result and an estimate looked identical;
   and the authoritative `Certify univalence` was buried and didn't auto-reduce (dead-ended positive-dim).
5. **HIGH (rigor) — the per-solution "certified" cert ran on a rationalized point (PF-1/D-2/E2).** The
   Schur–Cohn fold + boundary tests are exact *arithmetic* but on `ratApprox(numeric coord)`, not the exact
   algebraic root (the certified isolating box at `sym-core.mjs:1968` is discarded); "certified" was not
   downgraded when a candidate's filter fell back to numeric.

## 2. What was implemented, and why (all gate-green, value-ordered)

| Slice | Finding | What | Why |
|---|---|---|---|
| **S1** | D-1 | Exact `|z_j|<1` admissibility gate: pure `QDEquations.nodeInsideDisk(re,im)` (ℚ/BigInt `|z|²` vs 1) + a gate in `doCertifyUnivalence` that rejects any candidate with a node on/outside 𝔻 **before** the fold/boundary filters. | Stops the authoritative verdict counting non-QDs (pole inside 𝔻). Exact. |
| **S2** | C-1, A-2 | Honest labeling: `doClassify`/`doAutoSolve`/the chip say "real algebraic solution(s) — an upper bound on #QD; run Certify univalence", not "quadrature domains"; the w₀ ledger states the containment restriction + the correct **center/translation** gauge name. | The count is a certified *upper bound*, not #QD; a w₀-pinned "unique" is legibly conditional. |
| **S3** | B-1 | Möbius saturation as a first-class DAG op: `store.saturateMobius` appends a labeled `saturate` column `⟨I⟩:∏(1−z_j·z̄_j)^∞` + a toolbar button + PROV_STORE/UI entries. | Makes the raw count **exact** (disk 4→2) by dropping the `{|z_j|=1}` stratum — safe (disjoint from the genuine `|z_j|<1` set). |
| **S4** | G-2, D-2 | Structured `rigor` field + colored `=`/`≤`/`≈`/`⚠`/`?` pill: pure `QD.AlgebraCanvas.rigorMeta` + a pill in `setVerdict`; every verdict gets a rigor level. `certRigor` is `'exact'` **only** when the count is certified AND every candidate's filter was exact (`allExactFilter`) AND cross-check clean — closing D-2. | Rigor is unmissable; an estimate can never read as certified at a glance. |
| **S5** | G-1 | The one-click **"✦ Prove existence/uniqueness"** orchestrator: chains the reduce prelude (auto-reality → propagate) into the full S1-gated, S4-badged Certify pipeline; falls back to the positive-dim pin/split verdict — never ambiguous. | A single legibly-rigorous entry point from seed → authoritative verdict; reuses the sound pieces (no new math). |

## 3. Files changed

- `apps/quadrature-domains/app/qd-equations.mjs` — `nodeInsideDisk` predicate (S1).
- `apps/quadrature-domains/app/algebra/algebra-ui.mjs` — S1 gate + `allExactFilter`; S2 wording + gauge ledger;
  S3 button/handler; S4 `certRigor`/`classifyRigor` + rigor on every verdict; S5 orchestrator + button + PROV_UI `saturate`.
- `apps/quadrature-domains/app/algebra/algebra-canvas.mjs` — `rigorMeta` + the verdict pill (S4).
- `apps/quadrature-domains/app/algebra/algebra-store.mjs` — `saturateMobius` + PROV_STORE `saturate` (S3).
- Tests: `vitest/qd-node-location.test.ts` (15), `algebra-rigor-badge.test.ts` (6), `qd-saturate-mobius.test.ts` (4).
- Docs: `docs/algebra-review/*` (this review). ALGEBRA_MODULE.md updated to match shipped code.

## 4. Tests & results

- Baseline (pre-change): lint/typecheck/test/build all exit 0; vitest 147 files / **1280 tests**.
- After S1–S5: lint/typecheck/test/build all exit 0; vitest **150 files / 1305 tests** (+25 new). QD headless
  `node-suite` ~90s. No regressions at any commit; PROV_STORE/UI sync test passes with the new `saturate` op.
- **Browser-verified live** (after busting the PWA service-worker cache): `nodeInsideDisk`, `rigorMeta`,
  `saturateMobius` exposed + correct in the running app; the verdict card renders the rigor pill (gray `?` for
  a positive-dim verdict), the honest center-gauge ledger, and the "Saturate (admissibility)" + "✦ Prove
  existence/uniqueness" buttons.

## 5. What is now genuinely certified

For a **classical bounded QD** given exact quadrature data, "**✦ Prove existence/uniqueness**" now yields a
verdict whose rigor is legibly badged and honestly bounded:

- **`=` (exact/certified)** — when the system is zero-dimensional, the real-solution count is certified
  (RUR + exact Sturm / Hermite), **every** counted candidate passes the **exact** `|z_j|<1` gate + exact
  Schur–Cohn fold + exact boundary double-point test, the gauge quotient is applied, and the numeric
  cross-check matches. This is a genuine "exactly *k* bounded QDs (up to rotation, among domains containing
  w₀ if pinned)". An **inconsistent** system certifies `=` "no QD".
- **`≤` (bound)** — the raw algebraic count is a certified upper bound on #QD; `saturateMobius` tightens it
  to the exact algebraic count by removing the `{|z_j|=1}` stratum.
- **`≈` (estimate)** — when a candidate's fold/boundary filter fell back to numeric, or the coordinates were
  approximate; **`⚠` (partial)** when the numeric solver under-separated a cluster; **`?`** for
  positive-dimensional / over-cap. None of these can be misread as certified.

## 6. Remaining gaps

- **Mathematical (the deep rigor item — PF-1/E2/D-2):** the per-solution univalence certificate is exact
  arithmetic on the `ratApprox`'d *midpoint*, not the exact algebraic root. To make `=` unconditional,
  evaluate the Schur–Cohn fold + boundary tests at the exact algebraic point using the certified isolating
  box already computed at `sym-core.mjs:1968` (interval Schur–Cohn, or substitute the RUR coordinates).
- **A-1 (generation):** `clearDenominators` records no excluded locus; S3 reconstructs the Möbius factors in
  the store. Recording them at generation would let `classify` saturate automatically + generalize to Schwarz.
- **Engineering (all LOW, from track F):** `_CAP_KEYS` omits some worker-read caps (F1); the differential
  worker/main test omits solveRealCertified/shapeFromMoments/parametricRealCount1D (F6); CAS export of a
  complex-coeff column can mean a different quantity than the verdict (F5 — a warn/guard).
- **Decomposition (B-2/B-3):** interactive "Eliminate" uses the raw Sylvester resultant (extraneous factors);
  `triangularize` doesn't surface regular-chain initials.

## 7. Next three highest-value milestones

1. **Exact-at-the-box univalence certificate (PF-1).** Turn the `=` badge from "certified-count +
   exact-arithmetic-on-rationalized-point" into a genuine exact-at-the-algebraic-root certificate. This is
   the single highest-value remaining rigor item; the isolating box is already in hand.
2. **Orchestrator depth (extend S5).** Add the explicit strategy plan + live per-stage progress + a
   branch/case tree as first-class objects, auto-apply `saturateMobius` before counting, and one-click export
   of the derivation DAG (JSON / LaTeX / Maple RCTD) — the fuller Phase-3 vision on the S5 foundation.
3. **Generation-side saturation + export fidelity (A-1 + F5).** Record the dropped denominators at
   generation so `classify` reports the exact count by default (not just via the manual op), and guard the
   CAS export against the conjugate-model semantic mismatch.

**Bottom line:** the module was already a sound exact CAS; this review made its **proof workflow honest and
its rigor legible** — closing the two critical correctness gaps (the missing admissibility gate and the
unsaturated over-count), the over-claiming labels, and the rigor-legibility gap, and adding the one-click
orchestrated path. A certified `=` now means what it says, modulo one clearly-documented, well-scoped
rationalization refinement (PF-1).

## 8. Addendum — P1 backlog shipped (post-review continuation)

Three further gate-green slices closed the P1 tier of the prioritized backlog (§7):

| Slice | Finding | What |
|---|---|---|
| **P1.1** | B-2 | `store.eliminate` now computes the exact **elimination ideal** `⟨A,B⟩∩k[rest]` (Gröbner), not the raw Sylvester resultant — no extraneous factors (`{yx+1,yx²−x}`→`⟨1⟩`, the spurious `2y` discarded); flagged resultant fallback. |
| **P1.2** | A-1 | `saturateMobius` extended to **all ordered Möbius pairs** (self `{|z_j|=1}` + cross `{z̄_a z_b=1}`), so the exact count also drops the cross stratum a multi-pole `(●)` clears (2-pole test: count 2→1). Safe — all disjoint from the genuine `|z_j|<1` set. |
| **P1.3** | S5-depth | The orchestrator **auto-applies `saturateMobius`** before certify; the verdict states the **class + equivalence** ("classical bounded QDs, up to the rotation gauge [+ containing w₀ if pinned]"); a one-click **"Export derivation (JSON)"** verdict action (`exportDAG` → download). Browser-verified. |

Tests: `qd-eliminate-ideal.test.ts` (2) + a cross-term case in `qd-saturate-mobius.test.ts`; **1308 tests**,
all gate-green.

## 9. Addendum — PF-1 shipped (the #1 rigor item)

`QDEquations.verifySolutionExact` snaps each reconstructed coordinate to a nearby simple ℚ(i) rational and
checks the snapped point solves the (●)/(★) blocks **exactly over ℚ(i)**. If it does, the solution *is* that
exact rational point (proven by the exact-zero residual), so `schurCohnFold`/`boundarySimpleExact` now run at
that **exact-verified substitution** — certified at the **true algebraic root**, not a `ratApprox`'d float.
`certRigor='exact'` now also requires this (`allExactVerified`), with the honest note *"· exact ℚ(i) root —
univalence certified at the true root"* vs *"· ⚠ univalence certified at RATIONALIZED coordinates"* for an
irrational (only-≈) solution. This closes PF-1 **and E1** (an exact verification of the reconstructed map).
Test `qd-verify-exact.test.ts` (5); **1313 tests**; browser-verified (the default QD certifies at the exact
root). **A certified `=` now means what it says unconditionally for rational solutions.**

## 10. Addendum — P2 honesty-gap batch shipped

- **C-MED-2:** `discriminantVariety` now **certifies its separating form** — it computes the generic fiber
  size `N` (max distinct-complex count over generic parameter points) and prefers a form whose eliminant
  `deg_u = N`, returning `{ separated, genericFiberCount }` (an unseparated boundary is honestly flagged, not
  silently under-counted).
- **B-3:** `store.triangularize` surfaces the **regular-chain initials** (`initialCount`,
  `hasRegularityConditions`); the UI shows the "a Wu chain is not saturated by its pivots — spurious branches /
  missed components off the initials" caveat.
- **D-4:** active **univalence constraints** (convex/star/spiral/injectivity) now appear in the "Computed
  under:" ledger, so a constraint-restricted count never reads as the full one.
- **E4/D-3/E3/E5** needed no separate change: a cross-check failure already forces `certRigor ≠ 'exact'` (via
  `ccOk`), and **S1 + PF-1 filter the spurious solutions E4/D-3 worried about**; E3 (numeric gauge dedup) and
  E5 (boundary curve, empirically clean) are documented known limits.

Tests: `qd-discriminant-variety` (+2), `qd-triangular-initials` (2); **1316 tests**, gate-green.

## 11. Addendum — P3 engineering-hardening batch shipped

Track-F hardening (all LOW except F5 MEDIUM), no behavior change to a correct result:

- **F5** — `store.casColumn` prepends a **warning** for a Maple (real) export of a conjugate-model (ℚ(i))
  column; `casColumnComplex` + a `copyCAS` toast warn that a real-CAS "real count" of a complex system is not
  the QD count (reim-split first). `qd-cas-export-guard.test.ts` (3).
- **F1** — `_CAP_KEYS` completed (the `maxDim`/`maxTries`/`maxCalls`/`maxSegments`/`formTries` the RUR /
  parametric ops read) so the worker path honours the same caps as the sync fallback; the coverage test's
  ground-truth `OP_CAPS` was de-omitted (it had shared the omission).
- **F2** — sync `_classifyImpl` threads `_capOpts` to `buchberger`/`realSolutionCount` (== the worker).
- **F3** — the `sym-worker` abort listener is removable + detached on every settle (a late abort can't cancel a
  successor); **F4** — a worker LOAD error now falls back to the main thread instead of re-erroring forever.
- **F6** — the worker↔main differential test covers `solveRealCertified` / `shapeFromMoments` /
  `parametricRealCount1D` (bit-identical across the boundary).

**1322 tests**, gate-green.

## 12. Addendum — P4 polish; the prioritized backlog is CLOSED

- **A-3** — the `realAxisSymmetry` comment no longer over-claims: `allReal` ⇒ conjugation-*invariance* (a
  valid symmetric slice), not "a real solution exists" (comment-only; the downstream slice caveat was already honest).
- **G-misc-1** — the numeric `Solve` surfaces its coordinates in the **verdict card** (with an `estimate`/`partial`
  rigor badge), not only a `console.table` dump behind DevTools.
- **G-misc-2** — a cap / too-large failure is now **actionable**: it renders in the verdict card with a one-click
  **"Copy Maple RCTD export"** button (at `doSolve`/`doGroebner`/`doClassify`/`doCertifyUnivalence`), so the
  documented external-CAS escape is one click away instead of only named in prose.

**Status: the entire prioritized backlog (P0/PF-1, P1, P2, P3, P4) is complete.** The only work not done is what
was *explicitly deferred by design*: (i) interval / number-field Schur–Cohn to keep `=` for genuinely
**irrational** solutions (they honestly read `≈` today); (ii) A-1's literal record-at-generation for the Schwarz
`φ′` denominator; (iii) the larger "fuller orchestrator" redesign (a first-class strategy plan + branch-case
tree). All three are noted here and in `PLAN.md` for a future session; none blocks the shipped result.

**Final tally:** 20 commits on `algebra-maturity-review`, **1280 → 1322 tests**, gate-green at every commit;
a 7-track audit + 5 core slices + PF-1 + the full P1–P4 backlog. The QD Algebra module is now a legibly-rigorous,
one-click existence/uniqueness prover whose `=` badge is trustworthy and whose engineering is hardened.
