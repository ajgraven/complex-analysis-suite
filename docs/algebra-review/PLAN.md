# QD Algebra Module — Implementation Plan (value-ordered)

> **Status: DRAFT** (finalize after tracks B + E land). Slices ordered strictly by value:
> correctness first, then proof-workflow honesty, then the orchestrator + UI, then engineering
> hardening. Each slice is independently completable, testable, committable; tests green at every
> code commit; the gate (`lint && typecheck && test && build`) runs before each PR. Every slice
> keeps the exact kernel DOM-free and the append-only DAG intact, and preserves honest labeling.

## Guiding principle from the audit

The exact ℚ(i) primitives and the store/worker/export engineering are **sound** (tracks C, F +
prior reviews). Every material gap is at the **workflow/labeling edge**: the certificate chain
does not fully imply the displayed "# genuine QDs" (missing admissibility gate; approximate-point
certificate; upper-bound count mislabeled as QD count; a default gauge pin that can drop domains),
and there is no single orchestrated, legibly-rigorous entry point. So the plan is **harden + unify,
not rewrite.**

## Slice list

### Slice 1 — Exact node-location admissibility gate `|z_j|<1` (CRITICAL correctness) — [D-1, A-1]
**Goal:** stop counting algebraic solutions whose reconstructed φ has a pole inside 𝔻 (pole at
`1/conj(z_j)`, modulus `1/|z_j|` < 1 when `|z_j|>1`). The ansatz's Möbius denominators were cleared
away (A-1), so all four current univalence filters are blind to this — a solution with `|z_j|≥1` is
counted as a genuine QD though φ is not even analytic on 𝔻.
**Footprint:** `algebra/algebra-ui.mjs` (`doCertifyUnivalence` per-solution loop; a new
`nodeInsideDisk(sol,hData)` helper next to `poleSubst`). Exact test: reuse `poleSubst`'s rationalized
`z_j` (already ℚ(i)); require `z_j·conj(z_j) < 1` as an exact rational comparison; classify `|z_j|≥1`
as a rejection row ("pole preimage on/outside 𝔻 — not a bounded QD"), and `|z_j|=1` as a degenerate
boundary case. Gate BEFORE the fold/boundary tests and BEFORE `genuinePhis.push`.
**Tests:** a vitest (node) case building a one-pole solution with `|z_1|>1` → verdict rejects it
(genuine count unchanged), and a genuine `|z_1|<1` case still certifies. Reuse `repro-nodeloc` mechanism.
**Acceptance:** the D-1 repro solution is no longer counted; existing cardioid/disk cases still certify;
gate green.

### Slice 2 — Honest count labeling: "algebraic solutions" ≠ "quadrature domains" (HIGH) — [C-1, A-1]
**Goal:** `doClassify` (count==1) and `doAutoSolve` currently print "Unique/N real **quadrature
domains**" from the certified *algebraic* count, with no univalence filter — an over-claim (`realCount`
is a certified **upper bound** on #QD). The app's own `doClassify` count>1 branch is already honest.
**Footprint:** `algebra/algebra-ui.mjs` (`doAutoSolve` verdict strings :1574-1578; `doClassify` ==1
branch :1647). Reword to "real algebraic solution(s) — an upper bound on the number of quadrature
domains; run **Certify univalence** for the genuine-QD count" and keep the count. No math change.
**Tests:** assert the verdict strings for a known case include "algebraic" + the pointer, not a bare
"quadrature domain(s)".
**Acceptance:** no surface prints a certified-QD claim from an unfiltered count; gate green.

### Slice 3 — Gauge-pin honesty: w₀ restriction + correct gauge label (HIGH soundness) — [A-2]
**Goal:** pinning `φ(0)=w₀` (default = pole centroid, ON by default) restricts to domains **containing
w₀**; a non-convex admissible Ω excluding the centroid is dropped → possible **false "unique."** Also the
ledger mislabels it "(rotation gauge)" — it is the **center/translation** gauge.
**Footprint:** `algebra/algebra-ui.mjs` (`specializationLedger`/`sliceCaveat` and the ledger tag :1534).
When w₀ is pinned, the verdict/ledger must state "among domains centered at w₀ = … (a restriction: a
domain not containing w₀ is not counted)"; fix the gauge-name label. Optionally: a note that clearing the
w₀ pin explores other centers.
**Tests:** ledger/verdict for a w₀-pinned run contains the restriction wording + correct gauge name.
**Acceptance:** a "unique" verdict under a w₀ pin is legibly conditional; gate green.

### Slice 4 — Structured `rigor` verdict field + colored `=`/`≤`/`≈`/`⚠` badge (HIGH UX/rigor) — [G-1, G-2]
**Goal:** the verdict card is one flat text node (`algebra-canvas.mjs:438`), so a certified `=` and an
`≈`/lower-bound verdict look identical. Give the verdict a structured `{ rigor, headline, class,
equivalence, caveats[] }` and render a prominent colored badge + a class/equivalence headline
("exactly k bounded QDs up to rotation").
**Footprint:** `algebra/algebra-canvas.mjs` (`setVerdict` render), a small rigor-tag helper; verdict
producers in `algebra-ui.mjs` pass the structured field (back-compatible: keep `text`). No engine change.
**Tests:** vitest that `setVerdict({rigor:'estimate',…})` renders the badge class; certified vs estimate
differ in the DOM.
**Acceptance:** every verdict shows an unmissable rigor badge; gate green + browser-verify.

### Slice 5 — Unified "Prove existence/uniqueness" orchestrator (Phase 3 core) — [G-1, PF-2, PF-4]
**Goal:** one action that runs the whole pipeline (auto-reality → linear-propagate → certified regime +
count → certified real solve → **admissibility gate (Slice 1)** → univalence filter → gauge quotient →
cross-check) and emits a structured proof result (verdict + rigor + assumption ledger + per-solution rows
+ a reproducible derivation summary), with live per-stage progress and explicit branch/case handling.
Wraps the existing sound pieces (`doAutoSolve` + `doCertifyUnivalence`); does NOT replace them.
**Footprint:** `algebra/algebra-ui.mjs` (new `doProveExistenceUniqueness` orchestration + a pinned button;
reuse existing store async ops). Possibly a small store helper to expose the derivation summary.
**Tests:** an end-to-end vitest driving the orchestrator on a canned hData → structured result with the
right rigor + count; a positive-dim input → honest "underdetermined + fix gauge" (no dead-end).
**Acceptance:** from a seeded system, one click yields the authoritative verdict with rigor legibility and
no manual op-chaining; gate green + browser-verify.

### Slice 6 — CAS-export fidelity guard (MEDIUM) — [F5]
**Goal:** exporting a conjugate-model (complex-coeff / barred-var) column to Maple/msolve makes their
"real solutions" a *different* quantity than the in-browser verdict. Warn/refuse (or offer auto-reim-split)
when a term has `coeff.im[0]!=='0'` or a barred variable.
**Footprint:** `algebra/cas-export.mjs` + the store `casColumn`/`_columnItems` call sites.
**Tests:** exporting a complex-coeff column raises the guard; a reim column exports clean.
**Acceptance:** no silent semantic-mismatch export; gate green.

### Deferred / follow-on (record; do NOT auto-start beyond budget)
- **PF-1 / C-MED-1 / D-2 — exact-at-the-algebraic-point univalence certificate.** Evaluate the Schur–Cohn
  fold + boundary tests at the EXACT algebraic root (carry the RUR coordinates / a certified interval),
  not `ratApprox(numeric)`. Harder; the current path is exact-arithmetic-on-approximate-point. Until then,
  Slice 4's per-solution badge should read `≈` when the filter used the numeric fallback (partial credit
  from Slice 1/4). **Highest-value remaining rigor item after the slices above.**
- **A-1 saturation with a recorded excluded locus** — have `clearDenominators` record the dropped
  Möbius/φ′ factors on the `system` object so `classify` can `saturate` them out and report a clean count
  (not just an upper bound). Structural; larger.
- **C-MED-2** discriminantVariety separating-form certificate; **F1** cap-forwarding; **F6** differential
  test gap; **D-3/D-4** crossCheck `.some()` masking + constraint-ledger omission; **G** misc (console
  dump, cap-export button). Low individually; batch if budget remains.

## Sequencing rationale

1 (correctness — stop over-counting) → 2,3 (stop over-claiming in words) → 4 (make rigor legible) →
5 (unify into one workflow) → 6 (export safety). 1–4 are small, self-contained, and each independently
raises trustworthiness; 5 is the Phase-3 capstone that depends on 1 (the gate) + 4 (the rigor field).
At every commit the tool is strictly more honest than before. **Finalize ordering after B + E** (B may
add a saturation/decomposition slice; E may add a reconstruction/dedup slice).
