# Track D — Univalence & Admissibility Certification (audit)

Scope: `apps/quadrature-domains/app/univalence.mjs`, `qd-constraints.mjs`,
and the verdict orchestration `doCertifyUnivalence` + helpers in
`apps/quadrature-domains/app/algebra/algebra-ui.mjs`; cross-ref `sym-core.mjs`
`schurCohn`/`unitCircleRootCount`, the bounded ansatz in `solver-qd.mjs`, and the
numeric primitives in `solver.mjs`/`critical-set.mjs`.

READ-ONLY audit. No source was modified. All line numbers are against the repo state on
branch `refactor/provenance-ui-registry`.

---

## 1. Summary & soundness

`doCertifyUnivalence` assembles a genuinely valid *sufficient* argument for injectivity —
**local univalence** (φ′≠0 in 𝔻, via the exact Schur–Cohn inertia of the cleared φ′
numerator) **AND** **global boundary-simplicity** (φ(∂𝔻) a simple/Jordan curve, via the
exact real circle double-point count), with on-circle criticals (cusps) detected and
handled honestly, a correct gauge quotient, and honest slice labeling. Given the standing
**QD-regime precondition that φ is analytic and bounded on the closed disk 𝔻̄
(equivalently every pole pre-image satisfies |z_j| < 1)**, that chain does imply "genuine
bounded QD", and the individual exact primitives are sound.

The problem is that **the chain never verifies that precondition.** The bounded ansatz
`φ(z) = w₀ + Σ_j Σ_k conj(A_{j,k})·zᵏ/(1 − conj(z_j) z)ᵏ` has poles at `z = 1/conj(z_j)`;
a solution with `|z_j| ≥ 1` puts a genuine pole of φ **inside** 𝔻, so φ is not
holomorphic, not bounded, and not a quadrature-domain map at all. The whole certificate
(and every one of its numeric fallbacks) is **blind** to this: it works on `num(φ′)` with
the Möbius denominators *cleared away*, which is exactly the information that encodes the
pole location. There is **no `|z_j| < 1` check, and no `a_j ∈ Ω` check, anywhere between
the real solve and the "K genuine quadrature domains" verdict.** This is a **CRITICAL**
soundness gap: the "# genuine QDs" count can over-claim, counting algebraic solutions that
satisfy (●)/(★) but are not admissible bounded QDs. Everything else I checked is sound or
is a lower-severity honesty-labeling refinement.

Net: the exact machinery is correct; the *certificate chain is incomplete* because it
omits the node-location admissibility leg that the direct/forward solvers in this very
codebase already enforce (`direct-common.mjs:1475`, `:2022`).

---

## 2. Confirmed strengths

- **The assembled implication is valid (Q1).** Local (φ′≠0 in 𝔻) + global (φ(∂𝔻) a
  simple closed curve) + φ analytic on 𝔻̄ ⇒ φ injective on 𝔻 is a correct sufficient
  condition (argument principle: a Jordan φ(∂𝔻) forces the with-multiplicity pre-image
  count to be ≤ 1 for every target). `doCertifyUnivalence` does compute *both* legs
  (`schurCohnFold`, `algebra-ui.mjs:1864`, and `boundarySimpleExact`, `:1875`) rather than
  proving local and asserting global.
- **Cusp / on-circle handling is honest (Q3).** `schurCohn` (`sym-core.mjs:4610`) resolves
  the singular (self-inversive / on-circle) case exactly by peeling the self-inversive
  factor and counting on-circle roots via `unitCircleRootCount`; it returns
  `degenerate:true` iff `onCircle>0`, `resolved:true` when trustworthy. The certify loop
  treats `onCircle` as the cusp count, still runs the boundary test, and certifies a
  cusped Jordan boundary (the cardioid) as a genuine QD (`:1868`, `:1882-1884`). A truly
  ambiguous (over-cap) matrix falls back to numeric, never mis-certifying from a singular
  matrix.
- **Boundary-simple test is exact and complete for its job (Q4).** The divided difference
  `(φ(ζ₁)−φ(ζ₂))/(ζ₁−ζ₂)` removes the diagonal by exact division (`qd-constraints.mjs:215`);
  `boundaryDoublePointCount` (`:248`) counts real circle solutions of `{N_re, N_im, ζ₁ζ̄₁−1,
  ζ₂ζ̄₂−1}` via the Hermite trace form and the caller certifies simple ⟺ `count === cusps`
  (`algebra-ui.mjs:1764`). A tangential self-contact `φ(ζ₁)=φ(ζ₂), ζ₁≠ζ₂` still makes the
  divided difference vanish, contributing the ordered pair (and its swap) ⇒ `count > cusps`
  ⇒ correctly rejected. `ok:false` (positive-dim / over the Hermite cap) → numeric fallback.
- **Gauge quotient is correct (Q1).** `sameDomain` (`solver.mjs:1709`) canonicalizes each
  φ by the disk rotation making φ′(0) real-positive and compares coefficients, so the
  ±φ′(0) rotation pair collapses to one geometric domain (`algebra-ui.mjs:1888-1890`).
- **Regime dispatch is sound (Q5).** inconsistent ⇒ 0 QDs; positive-dimensional ⇒
  "underdetermined, fix the gauge / pin a forced variable" with one-click factor/pin
  actions (`:1805-1827`); zero-dimensional ⇒ count. For fixed quadrature data the classical
  QD is finite up to the rotation gauge, so a positive-dimensional variety genuinely means
  the gauge (or a forced locator) is unpinned — the advice is correct, and the positive-dim
  branch never attempts a count.
- **Numeric cross-check is labeled as a cross-check, not the certificate (Q6).**
  `crossCheckPhis` (`:1985`) uses `residualAtSolution` (< 1e-4) and `sameDomain`; its result
  is appended as "· cross-check ✓ (residual …; matches the numeric solver)" (`:1931`),
  distinct from the exact "Schur–Cohn + real-count certified" per-row tags (`:1884`). The
  exact certificate does not depend on it.
- **Honest slice/branch labeling.** `sliceCaveat` / `specializationLedger` (`:1515`,
  `:1532`) annotate real/imaginary slices, the φ(0) gauge fix and factor branches; the
  inconsistent and count verdicts both append `sliceCaveat(cl)` (`:1804`, `:1940`), so an
  on-slice inconsistency does not read as ruling out the general system.
- **Convex/star/spiral are correct sufficient conditions and are labeled sufficient (Q7).**
  `univalence.mjs` states the hierarchy convex ⟹ star ⟹ spiral and "a criterion is only
  asserted yes when φ is univalent" (`:30-31`, `:157-159`); they are shape *classifiers*
  and are **not** part of the genuine-QD count.
- **`reconcileRealCount` undercount guard.** A clustered/non-radical undercount by the
  eigenvalue solver is flagged "⚠ PARTIAL … LOWER BOUND" rather than read as a clean count
  (`:1906-1925`); `isBoundaryUnivalent` fails closed on a non-finite boundary sample
  (`solver.mjs:705-707`).

---

## 3. Findings

### FINDING 1 — No pole-pre-image / node-location admissibility check (`|z_j| < 1`, `a_j ∈ Ω`). The genuine-QD count can over-claim. **[CRITICAL]**

**What is missing.** For a classical bounded QD the Riemann map must be analytic, bounded
and univalent on 𝔻, with each quadrature node `a_j = φ(z_j)` interior, i.e. every pole
pre-image `z_j` must satisfy `|z_j| < 1`. `doCertifyUnivalence` tests φ′≠0-in-𝔻 (fold) and
boundary-simplicity, then a gauge quotient — but **never tests `|z_j| < 1`** (nor the
implied `a_j ∈ Ω`). Exhaustive search of the certification chain (`doCertifyUnivalence`,
`schurCohnFold`, `boundarySimpleExact`, `phiFromAlgebraSolution`, `poleSubst`,
`crossCheckPhis`, and `store.classify`/`solveReal`) finds no modulus/interior test on the
reconstructed `z_j`. The only "inside 𝔻" logic present concerns φ′'s *roots* (the fold
test), not the pole pre-image *locations*.

**The ansatz makes this necessary.** `solver-qd.mjs:13,37`:
```
//   φ(z) = w_0 + Σ_j Σ_k conj(A_{j,k}) · z^k / (1 - conj(z_j) z)^k
```
The Möbius factor `(1 − conj(z_j) z)` vanishes at `z = 1/conj(z_j)`, whose modulus is
`1/|z_j|`. So `|z_j| < 1` ⇔ the pole is strictly outside 𝔻̄; `|z_j| > 1` ⇔ a genuine pole
of φ **inside** 𝔻. The module comments *assume* this regime but do not enforce it:

- `qd-constraints.mjs:83-84` — "φ′ ≠ 0 in 𝔻 ⇔ this ≠ 0 in 𝔻 (the Möbius denominators are
  nonzero on the closed disk)". True **only if `|z_j|<1`**; the equivalence is asserted, not
  guarded.
- `qd-equations.mjs:318` — "denominator factors that are nonzero on the QD regime
  (`|z_j|<1`, φ′≠0 in 𝔻)". The regime is named as an assumption, never checked in the count.

**Why the certificate is blind to it.** `schurCohnFold` (`algebra-ui.mjs:1705`) counts
roots of `QC.phiPrimeNumerator` (`qd-constraints.mjs:85`), which is φ′ **with the Möbius
denominators cleared**. Clearing `(1 − conj(z_j) z)^{k+1}` discards exactly the factor that
carries the pole location, so the numerator's in-disk root count says nothing about whether
φ itself has a pole in 𝔻. The exact boundary test evaluates the divided difference of φ on
`|ζ|=1`, which does not pass through an interior pole, so it too can report a "simple"
boundary for a map with an interior pole.

**Repro (actual engine, `QC.phiPrimeNumerator` + `Sym.schurCohn` + `QC.boundaryDoublePointCount`
+ the numeric fallbacks).** One order-1 pole, `hData = { poles:[{ a:0, principal:[1] }] }`,
so `φ = w₀ + conj(A)·z/(1 − conj(z₁) z)` and `φ′ = conj(A)/(1 − conj(z₁) z)²`, i.e.
`num(φ′) = conj(A)` — a nonzero constant, independent of `z₁`:

| substitution | `schurCohn(num φ′)` | fold? | `boundaryDoublePointCount` | numeric `findCriticalPoints` in-domain | `isBoundaryUnivalent` | `evalPhi(1/z̄₁)` |
|---|---|---|---|---|---|---|
| `z₁=0` (interior, genuine) | inside 0, onCircle 0 | no | count 0 (simple) | 0 | true | finite |
| **`z₁=2`** (`|z₁|=2>1`, pole at `z=½ ∈ 𝔻`) | **inside 0, onCircle 0** | **no** | **count 0 (simple)** | **0** | **true** | **throws "division by zero"** |

For `z₁=2`, **all four filter primitives certify the map as no-fold + simple boundary
(⇒ "genuine quadrature domain")**, yet `evalPhi(0.5)` throws because φ has a genuine pole
at the interior point `z=½`. An order-2 single pole reproduces the same false "no fold" for
`z₁=2` (there the boundary count happens to be 2 and rejects it *for the wrong reason* —
self-intersection, not the interior pole — showing the boundary test is not a reliable
backstop either). Repro script:
`scratchpad/repro-nodeloc.js` (run from `apps/quadrature-domains/app/test`).

**The codebase already knows this condition — only the algebra path omits it.** The direct
solver enforces it explicitly:
- `direct/direct-common.mjs:1475` — `if (C.abs(z0) >= 1 - 1e-9) throw … 'z₀ must satisfy 0 < |z₀| < 1.'`
- `direct/direct-common.mjs:2022` — exterior sibling requires `|z₀| > 1`.
- `solver-pqd.mjs:592-593` — "A spurious Newton root can land on a state whose R# has a zero
  inside 𝔻" (the numeric solver actively rejects exactly this exterior/spurious class).

So `|z_j| ≥ 1` "solutions" are a real, known phenomenon that the numeric machinery rejects
and the algebraic certification does not.

**Consequence.** A real solution of the denominator-cleared (●)/(★) system with `|z_j| ≥ 1`
(such solutions are admitted precisely because the reality slice constrains `z_j`'s value,
not its modulus, and clearing the Möbius denominators symmetrizes the variety across the
circle) is reconstructed, passes fold + boundary, survives the gauge quotient, and is
**counted as a genuine bounded QD**. The reported "K distinct quadrature domains" and the
"N real algebraic solutions" denominator (`cl.realCount`, also unfiltered) can both be
inflated. The verdict is displayed with "✓ … certified", i.e. an `=`-strength claim, for a
configuration that is not a QD.

**Confidence.** The *absence of the check* and the *blindness of every filter primitive*
are CONFIRMED (search + repro). Exhibiting a specific dataset whose (●)/(★) real-solution
set contains such a counted spurious point end-to-end I did not fully construct — that is
the one remaining confirming step (SUSPECTED that the cardioid-family exterior root or any
multi-pole datum with a free `z_j` yields one; the denominator-clearing symmetry and the
direct solver's explicit guards strongly indicate it). Regardless, a certificate that omits
a necessary admissibility condition and cannot reject the omitted class is unsound as a
"genuine QD" filter.

**Fix direction.** After `phiFromAlgebraSolution`, gate each candidate on `|z_j| < 1` for
every branch before counting it as genuine:
- Exact: the rationalized solution already gives `z_j ∈ ℚ(i)`; test `sign(1 − z_j·conj(z_j))
  > 0` exactly (mirrors how `poleSubst` already rationalizes, `algebra-ui.mjs:1735`).
- A `|z_j| = 1` pre-image is a boundary degeneracy (pole on ∂𝔻) — reject or label as a
  degenerate/limit case, not a clean interior QD.
- `a_j ∈ Ω` then follows from `|z_j| < 1` + certified univalence (`a_j = φ(z_j) ∈ φ(𝔻) = Ω`),
  so no separate ray-cast is needed once the pre-image gate is in place.
Report a candidate failing this gate as rejected ("pole pre-image outside 𝔻 ⇒ not a bounded
QD"), exactly parallel to the existing `folded` / `selfInt` / `unrec` buckets (`:1878-1879`).

---

### FINDING 2 — The headline genuine-QD verdict does not downgrade its certainty marker when a counted domain's univalence was decided by the numeric fallback. **[MEDIUM]**

**Evidence.** When `schurCohnFold` returns null / over-cap, the fold decision comes from the
numeric `QD.findCriticalPoints` (`algebra-ui.mjs:1869`) and simplicity from the numeric
`QD.isBoundaryUnivalent(phi, 360)` (`:1876`) — both floating-point (`≈`) tests. The
per-row detail records "(numeric)" vs "(Schur–Cohn + real-count certified)" (`:1878-1884`),
but the **headline** verdict is identical either way:
```
:1915  else if (D === 1) verdict = … 'Unique quadrature domain ✓ — 1 genuine QD of ' + nReal …
```
and the "certified" tail keys on the *solve* being certified, not on the per-solution
univalence being exact:
```
:1938  if (r.certified && D > 0 && !undercount && !rec.disagree && !rec.partial)
           verdict += ' · real-solution count + locations certified (RUR + exact Sturm)';
```
So a domain whose univalence was established by a 360-sample numeric boundary test can be
reported as "Unique quadrature domain ✓ … real-solution count + locations certified (RUR +
exact Sturm)" — the `=`-strength framing of a count/location certificate bleeding onto the
univalence conclusion, which was `≈`. This is the honest-labeling binding (`=` exact vs `≈`
estimate) at the headline level.

**Fix direction.** Track an aggregate `allUnivalenceExact` over the counted domains (true
iff every genuine φ used `exact && simpleExact`); when false, tag the headline "≈
(univalence numeric)" or move the ✓ to a qualified marker, so the certainty of the
univalence leg is not overstated by the solve-count certificate.

---

### FINDING 3 — The numeric cross-check only bites when *all* genuine solutions are absent, so it is not a backstop for a spurious solution mixed with genuine ones. **[LOW]**

**Evidence.** `crossCheckPhis` oracle agreement is `phis.some(p => sameDomain(p, numPhi))`
(`algebra-ui.mjs:1993`) — a **single** genuine match sets `oracleMatch=true` for the whole
batch, and `residualAtSolution` (`:1991`) is ≈0 for *any* true algebraic solution, including
a spurious `|z_j|>1` one (it evaluates the generated-system polynomials at the solution's
coordinates, which the spurious point satisfies by construction). Hence when a spurious
solution is counted alongside ≥1 genuine QD, the cross-check reports "✓ (residual …;
matches the numeric solver)" and provides no protection. It only flips to "⚠ no match to the
numeric solver" when there is *no* genuine domain at all. This compounds Finding 1: the
cross-check cannot be relied on to catch the spurious-count case.

**Fix direction.** Subsumed by Finding 1 (add the `|z_j|<1` gate at the source).
Independently, the oracle could require corroboration per *distinct* domain rather than a
single batch-wide `some`.

---

### FINDING 4 — User-added geometric/univalence constraints are not recorded in the specialization ledger, so a restricted count can read as the full genuine-QD count. **[LOW]**

**Evidence.** `qd-constraints.mjs` lets the user add `convex`/`star`/`spiral` inequalities,
the `localUniv` Rabinowitsch witness, `geometricBorder`, and `injectivity` as system
columns. `specializationLedger` (`algebra-ui.mjs:1532-1537`) records only real/imaginary
slices, the φ(0) gauge fix, and factor branches — **not** any added constraint column. If a
user adds, say, a convexity constraint and then runs Certify, the resulting count is "convex
QDs" but the verdict card's assumptions banner does not surface that restriction, so it can
be read as the complete genuine-QD count. The constraint forms themselves are correct
sufficient conditions and are labeled sufficient in `univalence.mjs` (`:30-31`, `:157-159`);
severity is low because the user adds them deliberately, but the honest-labeling guardrail
argues for surfacing them.

**Fix direction.** Include any active added-constraint columns (convex/star/spiral/localUniv/
injectivity/border) in `specializationLedger` so a count computed under one is banner-labeled
as restricted.

---

## 4. Answers to the posed questions (condensed)

1. **Does the chain imply global univalence?** The *assembled* implication (Schur–Cohn fold
   ⇒ φ′≠0 in 𝔻) ∧ (exact circle double-point count ⇒ φ(∂𝔻) simple) ⇒ injective **is
   valid**, cusps included, **but only under the unstated precondition that φ is analytic on
   𝔻̄ (`|z_j|<1`)**, which is never checked — the gap in Finding 1. The boundary test is on
   the closed-disk boundary and does cover on-circle φ′ zeros (cusps, subtracted).
2. **Pole/node location check:** **absent** (Finding 1, CRITICAL). No `|z_j|<1`, no `a_j∈Ω`.
3. **Schur–Cohn fold — which disk:** open-disk inside count with exact on-circle detection;
   on-circle roots are classified as cusps (`degenerate` with `resolved`) and handled
   honestly, not silently counted as clean interior QDs. Sound.
4. **Boundary-simple exactness:** genuine — diagonal removed by exact division, cusps
   subtracted, tangential self-contact caught, `ok:false` → numeric fallback. Sound.
5. **Regime handling:** sound; positive-dim → gauge-fix advice is correct for fixed
   quadrature data; inconsistent verdicts carry the slice caveat so a sliced inconsistency
   does not over-rule the general system.
6. **Cross-check labeling:** correctly a cross-check (`≈`), separate from the exact
   certificate (but see Finding 2 for the headline certainty marker, and Finding 3 for its
   limited reach).
7. **Convex/star/spiral:** correct sufficient conditions, labeled sufficient, not part of
   the count; minor ledger-labeling gap if added as constraints (Finding 4).

---

## 5. Artifacts

- Repro: `scratchpad/repro-nodeloc.js` — drives `QC.phiPrimeNumerator`, `Sym.schurCohn`,
  `QC.boundaryDoublePointCount`, `QD.findCriticalPoints`, `QD.isBoundaryUnivalent`,
  `QD.evalPhi` via the test bootstrap; demonstrates the `|z_j|>1` false certification.
