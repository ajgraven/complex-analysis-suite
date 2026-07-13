# QD Algebra Module — Implementation Plan (value-ordered)

> **Status: FINAL** (all 7 tracks integrated). Slices ordered strictly by value: correctness first,
> then proof-workflow honesty, then the orchestrator + UI, then engineering hardening. Each slice is
> independently completable, testable, committable; tests green at every code commit; the gate
> (`lint && typecheck && test && build`) runs before each PR. Every slice keeps the exact kernel
> DOM-free and the append-only DAG intact, and preserves honest labeling.
>
> **The over-count has two disjoint spurious strata**, so two complementary correctness fixes:
> `{|z_j|=1}` (pole on the circle — the unit-disk "4 vs 2" case) removed by **S2 saturation** in the
> COUNT path; `{|z_j|>1}` (pole strictly inside 𝔻) + `{|z_j|=1}` removed by **S1's strict `|z_j|<1`
> gate** in the CERTIFY path. S1 (small/exact) fixes the authoritative verdict first; S2 (larger)
> then fixes the raw count on the canonical example.

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

> **Re-order note (post-S1):** S1 made the AUTHORITATIVE verdict (Certify univalence) correct — its strict
> `|z_j|<1` gate rejects both `{|z_j|=1}` (the disk's spurious `z=±1`) and `{|z_j|>1}`, and the gauge quotient
> collapses the disk to "unique ✓". So B-1's remaining harm is the **wrong label** on the *raw* count ("4
> quadrature domains"), not the number — fixed cheaply by the labeling slice. Baking saturation into the default
> `currentReimSystem` would also silently change `solveReal`/`resolvent`/`spuriousFactors` and cross the
> worker-parity boundary. **Therefore: do the labeling slice next (S2), and deliver saturation as a first-class
> DAG reduction op (S3) the orchestrator auto-applies — not a hidden default.**

### Slice 2 — Honest count labeling + gauge-pin honesty (HIGH) — [C-1, B-1, A-2, B-4]
**Goal (a):** `doClassify(==1)` (`:1647`) + `doAutoSolve` (`:1574-1578`) print the certified *algebraic*
count as "**quadrature domains**" with no univalence filter (over-claim; the app's own `count>1` branch
`:1648` is already honest). Reword to "real algebraic solution(s) — an upper bound on the number of
quadrature domains; run **Certify univalence** for the genuine-QD count." (After S2 the count is exact, but
the univalence/gauge quotient still separates algebraic solutions from genuine QDs, so the pointer stays.)
**Goal (b):** pinning `φ(0)=w₀` (default pole centroid, ON by default) restricts to domains *containing* w₀
(A-2) ⇒ possible false "unique"; the ledger mislabels it "(rotation gauge)" (`:1534`) — it is the
center/translation gauge. State the restriction in the verdict/ledger and fix the gauge name.
**Footprint:** `algebra/algebra-ui.mjs` verdict strings + `specializationLedger`/ledger tag. No math change.
**Tests:** verdict strings include "algebraic … upper bound … Certify univalence"; a w₀-pinned run's ledger
states the containment restriction + correct gauge name.
**Acceptance:** no surface prints a certified-QD claim from an unfiltered count; a w₀-pinned "unique" is
legibly conditional; gate green.

### Slice 3 — Möbius saturation as a first-class admissibility DAG op (HIGH correctness) — [B-1, A-1]
**Goal:** make the raw algebraic count EXACT (disk `h=1/w`: `realCount` 4 → 2) by removing the boundary
stratum `{|z_j|=1}` the cleared system carries. Deliver it as an explicit, provenance-tracked reduction —
`store.saturateMobius(ids)` appends a labeled "saturate (admissibility)" column whose system is the current
system with `⟨I⟩ : (∏_j (1 − z̄_j z_j))^∞` (in the conjugate model the factor is simply `1 − zb_j·z_j`;
`saturate` already exists at `sym-core.mjs:5228`). NOT baked into the default `currentReimSystem` (that would
silently change `solveReal`/`resolvent`/`spuriousFactors` + cross the worker boundary). The orchestrator (S5)
auto-applies it before counting; a toolbar button exposes it manually.
**Why safe (does not drop genuine QDs):** a genuine bounded QD has `|z_j|<1` ⇒ `1 − z̄_j z_j ≠ 0`, so the
saturated locus is disjoint from the QD set — unlike saturating by `z_j` (which the store already, correctly,
refuses to auto-suggest — `algebra-store.mjs:2652` — because it would delete the `z_j=0` disk).
**Footprint:** `algebra-store.mjs` (new `saturateMobius` op + provenance `saturate`; append-column); optionally
record the dropped factors at generation (`qd-equations.mjs`, closing A-1) or reconstruct them from the pole
structure. Worker-offload like other heavy ops (or keep sync — saturation of these small systems is cheap).
**Tests:** vitest — the disk column, after `saturateMobius`, classifies realCount 2 (not 4); a genuine
interior solution is retained; `z_j=0` disk NOT deleted. Golden the disk.
**Acceptance:** the canonical disk counts exactly after the op; no genuine solution dropped; gate green.
**Risk:** MED — saturate by the *right* factors only; test-guarded by the disk golden + a retain-genuine test.

### Slice 4 — Structured `rigor` verdict field + colored `=`/`≤`/`≈`/`⚠` badge (HIGH UX/rigor) — [G-1, G-2, D-2]
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
- **B-2** interactive "Eliminate" → default to `eliminationIdeal` (Gröbner) instead of raw Sylvester
  `resultant` (or warn on extraneous factors); **B-3** surface triangular-chain initials + caveat;
  **C-MED-2** discriminantVariety separating-form certificate; **F1** cap-forwarding; **F6** differential
  test gap; **E4** remove a cross-check-failed φ from the count; **D-3/D-4** crossCheck `.some()` masking +
  constraint-ledger omission; **E1** exact symbolic verify of the reconstructed map; **G** misc (console
  dump, cap-export button). Low/med individually; batch (S6) if budget remains.

## Sequencing rationale

S1 (fix the authoritative verdict — stop over-counting, exact+small) → S2 (fix the raw count on the
canonical disk — saturation) → S3 (stop over-claiming in words) → S4 (make rigor legible) → S5 (unify into
one workflow) → S6 (export safety + batch). S1, S3, S4 are small and self-contained; S2 is medium
(test-guarded by the disk golden); S5 is the Phase-3 capstone depending on S1 (gate) + S4 (rigor field). At
every commit the tool is strictly more honest than before. Deliver as one PR per slice (branch-first),
gate-green, auto-mergeable — matching the repo's established flow.
