# Track A — System Generation & Models (audit)

Scope: `apps/quadrature-domains/app/qd-equations.mjs` (888 L), `qd-constraints.mjs` (307 L),
`qd-varscheme.mjs` (66 L). Read-only audit; no source modified. Evidence gathered by reading the
source + docs (`docs/ALGEBRA_MODULE.md`, `THEORY_MAP.md`, `AHARONOV_SHAPIRO.md`) and by running
standalone `node` experiments against the live modules (`solver.mjs` → `sym-core.mjs` →
`qd-equations.mjs`/`qd-constraints.mjs`).

## 1. Summary

This slice turns exact quadrature data `h` into the algebraic system whose real solutions are meant
to be the classical bounded QDs. `generateClassicalBounded` emits the `(●)` locator, `(★)`
principal-part, and `(gauge)` blocks in the conjugate-variable model over ℚ(i); `generateSchwarzBounded`
swaps `(★)` for the Schwarz-function `(★_S)` block; `reimSplit` produces the real/imaginary model;
`pointFunctionalSystem` builds the Aharonov–Shapiro interior-point-functional system; `realAxisSymmetry`
is the auto-reality lever; and the residual oracles are the numeric ground-truth check.

**The math the generator emits is correct.** The `(★)` forward form matches Thm 3.2.1/3.2.2 and is the
exact Jabotinsky-dual of the inverse-Faber statement (verified numerically — no off-by-one, correct
`(k/s)` factors and index range); `reimSplit` is algebraically faithful; the Schwarz `(★_S)` block
carries the Blaschke/Jacobian factor correctly (the previously-fixed HIGH bug is closed); the
point-functional builder reproduces the cardioid; the residual oracles are honestly numeric; ℚ(i)
rationalization is exact.

**Where the slice is weak is the gap between the emitted *variety* and the actual *set of QDs*.** The
cleared polynomial system's real variety strictly *contains* the QD solution set, and the generator
records neither (a) the Möbius/critical denominators it drops when clearing, nor (b) the `|z_j|<1`
in-disk admissibility, nor (c) the fact that fixing `φ(0)=w₀` restricts to *domains whose interior
contains `w₀`*. All three regime constraints live only in downstream filters (the certify path's
Schur–Cohn + reconstruction), so a consumer that counts the emitted variety directly (the
existence/uniqueness `classify` path) can over- or under-count relative to the true QD count while the
verdict text reads as a QD count. These are workflow/labeling gaps, not primitive bugs.

## 2. Confirmed strengths (brief)

- **`(★)` forward form is exactly the theorem, dual to the inverse form.** `qd-equations.mjs:213-231`
  emits `C_{j,s} = Σ_{k=s}^{m_j} (k/s)·A_{j,k}·[t^k] φ̃_j^s`. I verified numerically that the forward
  matrix `M[s][k]=(k/s)[t^k]φ̃^s` and the inverse-Faber matrix `N[k][s]=(s/k)[t^s]ψ̃^k` are exact
  matrix inverses (Jabotinsky/Lagrange-inversion duality; `M·N=I` to machine precision on a random
  `φ̃`). So forward and inverse cut the **same variety** over the field, the `(k/s)` factor is right,
  and starting `k` at `s` is correct (`[t^k]φ̃^s=0` for `k<s`). No off-by-one.
- **`reimSplit` is faithful.** `qd-equations.mjs:397-466` substitutes `z_j=x_j+i y_j`, `z̄_j=x_j−i y_j`,
  etc., then splits `E = Re(E)+i·Im(E)`. Faithfulness is machine-checked at arbitrary non-solution
  points (`qd-equations.test.js:200-242`), so the split is not merely `0≈0`-trivial. Dropping
  identically-zero parts is exact; the gauge's real part correctly vanishes (`Σ 2i·q_{j,1}` is pure
  imaginary), yielding exactly `2n+2d+1` real equations.
- **Schwarz `(★_S)` carries the Blaschke factor.** `qd-equations.mjs:357-375` uses the map coefficient
  `A_{j,l}` as numerator (not `conj(c_l)`); the `z_j≠0` oracle (`qd-equations.test.js:447-469`) passes,
  confirming the `(1−|z_j|²)²` Jacobian is present. This is the prior HIGH fix and it holds.
- **Point-functional reproduces Aharonov–Shapiro.** `pointFunctionalSystem` (order 2) emits the exact
  area law `M₀−(w₁²+2|w₂|²)`, `m₁−u₂w₁²`, `w₁²v₂`; `realSolutionCount = 2` (the ±w₁ pair) and
  `schurCohn([1,1]) → onCircle:1, degenerate:true` (the cusp) — all matching `AHARONOV_SHAPIRO.md`.
- **Residual oracles are honestly numeric.** `residualAtSolution`/`residualReimAtSolution`
  (`qd-equations.mjs:529-553`) return float magnitudes via `evalComplex`; verified to return e.g.
  `max ≈ 2.2e-16`. They are `≈`, never presented in-module as an exact certificate.
- **Honest complexity cap.** The `maxPoleOrder` guard (`qd-equations.mjs:190-195`) **throws** rather
  than silently truncating a too-large system.
- **`qd-varscheme` single-source decoder is sound.** `parseVar`/`encodeVar`/`conjVar`/`latexVar`
  round-trip, `conjVar` is a self-inverse bar toggle, and non-scheme names (reim/boundary/aux) pass
  through unchanged. I traced the regexes against collision cases (`ax1`, `Cx1_2`, `ab2`) — no reim
  name mis-parses as a scheme name, so there is **no v/v̄ desync** (question 7).
- **Exact ℚ(i) w₀ rationalization.** `_ratApprox` (`qd-equations.mjs:78-105`) uses continued fractions
  → exact `p/q`, so fixing `φ(0)` introduces no floating contamination.

## 3. Findings

### A-1 — Cleared system's variety strictly contains the QD set; dropped denominators and `|z_j|<1` admissibility are neither recorded nor saturated (SEVERITY: medium)

**What.** `(●)` and `(★)`/`(★_S)` are built as `FRatFn` (factored-denominator) expressions and turned
into polynomials by `clearDenominators()`, which returns **only the numerator** and discards the
denominator:

- `sym-core.mjs:5440` — `clearDenominators() { return this.num; }` with the comment "denominator is
  nonzero on the relevant domain, so the equation is just num = 0 … NOT inflated by the denominator".
- `qd-equations.mjs:207` (locator), `:230` (star), `:374` (Schwarz `(★_S)`) all call `.clearDenominators()`.

The dropped denominators are the pairwise Möbius factors `(1 − z̄_{j'}·z_j)` (and, for `(★_S)`, the
critical factor `φ′(z_j)`). I confirmed this directly: for the two-pole `±0.5` system the pole-1
locator's `FRatFn` denominator is exactly `(1 − z̄₁z₁)·(1 − z̄₂z₁)` before clearing (probe output):

```
locator1 FRatFn denominator factors:
   e=1 factor terms: [ {coeff:1}, {coeff:-1, mono:{zb1:1,z1:1}} ]   // 1 - z̄₁z₁
   e=1 factor terms: [ {coeff:1}, {coeff:-1, mono:{zb2:1,z1:1}} ]   // 1 - z̄₂z₁
```

and the `(★_S)` order-1 denominator is `(1−z̄₁z₁)²(1−z̄₂z₁)²` (= the `φ′` factor).

**Why it matters (the math).** `num/den = 0 ⟺ num = 0` **only where `den ≠ 0`**. Over the whole affine
space the variety `V(num)` also contains the sub-locus `{den = 0, num = 0}`. On the reality slice
`z̄=conj(z)`:
- `1 − z̄_j z_j = 1 − |z_j|² = 0` ⇒ `|z_j| = 1` (a preimage *on* the circle — not an interior preimage,
  so not a QD);
- `1 − z̄_{j'} z_j = 0` (`j'≠j`) ⇒ `z_j = 1/conj(z_{j'})` (the disk reflection, `|z_j|>1` — outside);
- `(★_S)` additionally admits `φ′(z_j)=0` (a critical point).

So the cleared real system can carry **spurious real solutions with `|z_j|≥1` or `φ′(z_j)=0`** that are
not QDs. Separately, the genuine-QD constraint `|z_j|<1` (preimages strictly inside 𝔻) is **not encoded
anywhere in the emitted system** — it is a domain restriction the polynomials do not see.

**Recorded for saturation? No.** `generateClassicalBounded`'s return object is
`{ model, n, orders, d, blocks, w0Fixed, vars, counts }` (`qd-equations.mjs:282-296`); probe confirms
no `excluded`/`denominators`/`excludedLocus`/`saturateBy` field. The Möbius/critical factors are
computable but **thrown away**, so a downstream saturator would have to re-derive `Π_{j,j'}(1−z̄_{j'}z_j)`
and `φ′` itself.

**Concrete downstream consequence.** The "Existence / uniqueness" `classify`/`realSolutionCount` path
counts real solutions of the cleared reim system **without** the in-disk / non-critical filter, yet the
verdict string calls them QDs: `algebra-ui.mjs:1577` prints "`<realCount> real quadrature domains`". A
different path is honest — `algebra-ui.mjs:1648` prints "`<realCount> real algebraic solutions … run
Certify univalence for the genuine-QD count (… non-univalent ones filtered)`". The authoritative
`doCertifyUnivalence` path *does* filter (it reconstructs `φ` and runs Schur–Cohn, rejecting `|z_j|≥1`
/ `φ′=0`), so the certified verdict is sound — but the raw `classify` verdict inherits the generation
gap and can **over-count**.

**Fix direction.** Have the generator return the excluded/regime locus alongside the blocks — e.g.
`system.excluded = { moebius: [ …(1−z̄_{j'}z_j) term lists… ], critical: <φ′ numerator> }` (both are
already in hand at clear-time) — and either (a) saturate the ideal by `Π(1−z̄_{j'}z_j)·φ′` before any
`realSolutionCount`, or (b) route every raw count through the same admissibility filter the certify
path uses, or at minimum (c) label the raw `classify` count "algebraic solutions" uniformly
(reconcile `:1577` with `:1648`). This is the single most important generation-side gap for the
"count = # QDs" claim.

### A-2 — Fixing `φ(0)=w₀` restricts to domains containing `w₀`; centroid default is not generic-safe and the fix is mislabeled "rotation gauge" (SEVERITY: medium)

**What.** `opts.w0` substitutes an exact constant for `w₀/w̄₀` and drops them from the inventory
(`qd-equations.mjs:251-266`). In the Algebra tab this is ON by default (`algebra-ui.mjs:445` —
`fixW0 = !w0cb || w0cb.checked`) and the value used is the **found solution's** `φ(0)`
(`algebra-ui.mjs:446` — `w0Sel = activeEnv.w0Used || primary.phi.w0`), which the numeric solver
defaults to the **centroid of the poles** (`solver-qd.mjs:359-368` —
`w0 = { re: Σa_j.re/n, im: Σa_j.im/n }`).

**Why it matters (the math).** For a fixed domain Ω the valid Riemann maps are `{φ₀∘A : A∈Aut(𝔻)}`, and
`φ(0)=φ₀(A(0))` ranges over **all of Ω**. So the `w₀`-fixed system has a solution for Ω **iff `w₀∈Ω`**
(given `w₀∈Ω` there is a unique-up-to-rotation map with `φ(0)=w₀`; the rotation is then killed by the
`(gauge)` equation). The quadrature nodes `a_j` lie in *every* admissible Ω, so their centroid lies in
`conv(a_j) ⊆ conv(Ω)` — but **not necessarily in Ω itself** when Ω is non-convex. Therefore:

> Fixing `w₀` = centroid silently restricts the count to **admissible domains whose interior contains
> the centroid**. For a second admissible domain that excludes that point (a non-convex QD sharing the
> same `h`), the domain produces *no* solution in the `w₀`-fixed system → it is dropped → the tool can
> report **"unique"** when there are ≥2 QDs.

This directly threatens the mission's "uniqueness among ALL admissible domains". It is mitigated in the
common convex/star case (centroid ∈ Ω) and by the fact that `w₀` is taken from a genuinely-solved φ (so
the *found* domain is always counted), but there is no guard or warning, and non-convexity is not known
a priori.

**Mislabel.** The specialization ledger tags this as `'φ(0) fixed (rotation gauge)'`
(`algebra-ui.mjs:1534`). But the rotation gauge is killed by the **`(gauge)` block**
`Σ_j(A_{j,1}−Ā_{j,1}) = 2i·Σ Im A_{j,1} = 0` (`qd-equations.mjs:234-240`), which is always present.
Fixing `w₀` pins the **center (translation) part** of the automorphism gauge — 2 real conditions,
different from and additional to the rotation condition. Calling it "rotation gauge" understates it: it
is a count-*restricting* normalization, not a count-preserving rotation quotient. (Dof check: for the
cardioid the `(●)+(★)+(gauge)` reim blocks are rank-deficient by 1 under `w₀` pinned — the
`locator+star` rows cut only the 1-dim rotation orbit, which the `(gauge)` row collapses to points; so
`w₀`-fix and the `(gauge)` equation are genuinely two different gauge conditions.)

**Fix direction.** Relabel to "φ(0) fixed (center/translation gauge — counts only domains through this
point)"; and, for the uniqueness verdict, add a check that the chosen `w₀` lies in the reconstructed
boundary of *each* found domain (cheap point-in-polygon on `φ(∂𝔻)`), or prefer the gauge-fix that does
not restrict the domain family (pin a preimage `z_j` as in `AHARONOV_SHAPIRO.md §5`, or quotient the
full `Aut(𝔻)` numerically as the certify path already does via `sameDomain`), rather than pinning the
center to a single point.

### A-3 — `realAxisSymmetry` doc-contract over-claims "a fully real solution exists" (SEVERITY: low)

**What.** `qd-equations.mjs:619-624` documents `allReal` as: "every pole `a_j` AND every principal
coeff `C_{j,s}` is real ⇒ **a fully real solution exists** ⇒ EVERY base variable may be taken real".

**Why it matters (the math).** `allReal` (a real `h`) makes the whole system **conjugation-invariant**,
so solutions come in conjugate pairs and the real-symmetric slice is a valid slice to search. It does
**not** imply a real solution *exists* (a real `h` can have no QD, or, in the non-unique regime,
genuinely non-symmetric QDs in conjugate pairs with no real-symmetric member). The used consequence
(restrict to the real slice) is fine as a *lower-bound slice*; the stated justification ("a fully real
solution exists") is not rigorous.

**Mitigation (why only low).** The downstream *uses* it correctly: the Auto path only applies
`assumeReal` when `allReal` (`algebra-ui.mjs:1554-1558`), and every specialized verdict is honestly
labeled as a slice — `sliceCaveat` (`algebra-ui.mjs:1515-1521`) explicitly says a count is "a LOWER
BOUND" and "an empty/inconsistent verdict rules out only on-slice solutions", and it is appended even
to the "No quadrature domain" auto verdict (`algebra-ui.mjs:1572-1580`). So the false-negative /
false-uniqueness risk of the reality slice is caught by labeling; this finding is a comment/contract
wording issue, not a workflow bug.

**Fix direction.** Reword the doc-comment: "`allReal` ⇒ the system is conjugation-invariant, so the
real-symmetric slice is admissible; a verdict on it is a lower bound on all QDs (off-slice conjugate
pairs are not counted)."

### A-4 — Minor model notes (SEVERITY: low / informational)

- **Conjugate model ≠ QD count without reim.** `generateClassicalBounded` treats `z_j` and `z̄_j` as
  independent (the complexification); the real QDs are the reality-slice points. Counting on the
  conjugate model directly would count the larger complex variety. This is handled — the store routes
  counts through `reimSplit`/`currentReimSystem` — but it is a sharp edge if any consumer counts the
  conjugate system.
- **Forward vs Schwarz have *different* off-regime spurious loci.** `(★)` drops `{1−z̄_{j'}z_j=0}` only;
  `(★_S)` additionally drops `{φ′=0}` (§A-1). "Same variety" (`qd-equations.mjs:315`) is true on the QD
  regime but the two cleared ideals can differ off-regime, so raw solution counts can differ by
  formulation. Folds into A-1.
- **Advertised `counts` assume `w₀` pinned.** `counts.realUnknowns = 2(n+d)` excludes `w₀` even when it
  is free (`qd-equations.mjs:288-294`), so `realUnknowns − realEquations = −1` reads as "over-determined"
  though the free system is actually positive-dimensional (the gauge/`w₀` freedom). Not wrong given the
  design (w₀ is a param/normalization) but easy to misread; a one-line note would help.
- **Aux-var conjugation passthrough.** `conjVarName` returns `cosL/sinL/Wsat` unchanged
  (`qd-constraints.mjs:64`, via `qd-varscheme` passthrough) ⇒ treated real under `conjMPoly`. Correct
  for `cos λ, sin λ` (which *are* real, and *are* conjugated in `qSpiral`); the Rabinowitsch witness
  `Wsat` is never actually conjugated in current code, so its "treated real" is moot. No bug today;
  a latent trap if a future consumer conjugates a `Wsat`-bearing polynomial.

## 4. Answers to the posed questions

1. **`(★)` per Thm 3.2.1/3.2.2?** Yes — exact forward form, correct `(k/s)`, `k∈[s,m_j]`, Jabotinsky-dual
   to the inverse form (numerically verified). No off-by-one. (Strength.)
2. **Denominator clearing (critical).** `clearDenominators` drops `(1−z̄_{j'}z_j)` (and `φ′` for `(★_S)`);
   this can add spurious `{den=0}` solutions and does **not** drop genuine ones. The excluded locus is
   **not recorded** anywhere for saturation. → **Finding A-1**.
3. **Conjugate vs reim faithful?** Yes — `reimSplit` encodes `z̄_j=conj(z_j)` structurally and is
   machine-verified faithful at arbitrary points; the solution set is preserved exactly. (Strength;
   caveat A-4 bullet 1.)
4. **Reality/imaginary assumptions honestly labeled?** The `realAxisSymmetry` *comment* over-claims
   (A-3), but the reality slice is honestly labeled downstream as a lower bound that cannot rule out
   off-slice QDs. So it does not silently pass as a full answer.
5. **Gauge fix `φ(0)=w₀`.** Pinning `w₀` quotients the **center/translation** gauge, not the rotation
   gauge (that is the `(gauge)` equation). It is valid **only if `w₀∈Ω` for every admissible Ω**; the
   centroid default is in `conv(Ω)`, not guaranteed in a non-convex Ω, so it can drop domains and is
   **mislabeled** "rotation gauge". → **Finding A-2**.
6. **`pointFunctionalSystem` / cardioid.** Correct — order 2 reproduces the exact A&S area law,
   `realSolutionCount=2`, and the Schur–Cohn cusp. (Strength.)
7. **`qd-varscheme` pairing.** Correct — sound single-source decoder; no v/v̄ desync; reim names do not
   collide with the scheme. (Strength.)
8. **Residual oracles.** Numeric (`≈`, float magnitudes) and correctly framed as such in-module; not a
   certificate. (Strength.)

## 5. Cross-track handoffs

- **B (elimination/decomposition):** A-1 is a saturation task — the elimination/count pipeline should
  saturate by `Π(1−z̄_{j'}z_j)·φ′` (not recorded by the generator; must be reconstructed).
- **C (certified solving/counting):** the raw `realSolutionCount`/`classify` count over the cleared
  reim system is **not** the QD count without the in-disk/non-critical filter (A-1); reconcile the
  "quadrature domains" vs "algebraic solutions" labels (`algebra-ui.mjs:1577` vs `:1648`).
- **D (univalence/admissibility) & E (reconstruction):** A-2's undercount is only certified-verdict-
  relevant if `doCertifyUnivalence` relies on the `w₀`-fixed system by default (it does — seed default
  `fixW0=true`); a non-convex two-domain witness excluding the centroid would confirm the false-
  uniqueness path (I did not construct one — flagged SUSPECTED for D/E).
- **G (UI/workflow):** the "(rotation gauge)" ledger label (A-2) and the split QD/algebraic-solution
  wording (A-1) are user-facing honesty items.
