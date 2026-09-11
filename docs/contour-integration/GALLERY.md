# The v1 gallery — 28 definite integrals as Family records

> Index and verification record. The records themselves are in [`gallery/`](gallery/):
> [tier A–B](gallery/tier-ab.md) · [tier C–D](gallery/tier-cd.md) · [tier E–F–G](gallery/tier-efg.md)
> — 4,772 lines, 28 complete `Family` records against [`DESIGN.md`](DESIGN.md) §5.
>
> The gallery is not a list of examples bolted onto an engine. **It is the engine's specification:**
> the 28 entries are ordered so that each tier adds exactly one capability, and anything not needed
> by one of them is not needed by v1.

---

## 1. What the tiers establish

| tier | entries | adds |
|---|---|---|
| **A** | A1–A7 | the unit-circle substitution, Schur–Cohn's "no poles on \|z\|=1", exact residues at rational and at algebraic poles, orders 1–3 |
| **B** | B1–B3 | Jordan's lemma and the sign-of-`a` half-plane branch; conditional convergence |
| **C** | C1–C3 | indented contours, the small-arc lemma L4, removable-singularity detection, principal values as a distinct result type |
| **D** | D1–D7 | **branch cuts** — keyhole, Mellin, log, log², dogbone; the residue at infinity; two fractional powers on one cut |
| **E** | E1–E3 | the `reproduces` role: quasi-periodic strips, and the zero-residue contour shift |
| **F** | F1–F2 | wedge contours and the L6 bound; the `§5.1 ≡ §7` cross-check |
| **G** | G1–G3 | summation by residues; the kernel/`f` pole collision |

Six contour templates (circle, semicircle, indented semicircle, keyhole, dogbone, rectangle, wedge)
plus `square` for tier G; one fractional-power branch; one logarithm branch; one `πcot`/`πcsc` kernel
pair. Everything else in the taxonomy is parameterisation, not new machinery.

---

## 2. Verification record

All 28 were **independently re-derived and re-verified** by three authors working on disjoint tiers,
each forbidden from reading the values in research 03 §13. Two independent numerical methods per
entry; contour bookkeeping verified separately by integrating the actual contours, not just checking
endpoints.

**All 28 closed forms survived**, agreeing to between 0 and 2.6×10⁻¹⁴ relative. Spot checks worth
recording: keyhole totals reproduced `2πi ΣRes` to ~1e-15; D7's `C_R = −2πi·Res(f,∞)` to 2.4e-9;
D6's outer arc to 2.7e-25; F2's conditionally-convergent Fresnel value to 8.9e-16 by alternating-series
acceleration, cross-checked to 2.4e-13 by oscillation-resolved quadrature with an asymptotic tail.

**Three lemma statements did not survive, and are corrected in research 03 §14.0:**

1. **L6 (the wedge lemma) was false as written** — its arc ran to `θ = π/n` while its own supporting
   inequality holds only to `π/(2n)`. Past `nθ = π/2` the integrand's modulus *grows*; the stated
   majorant diverges (2.7e15 at `n=2, R=6`; overflow at `n=4`).
2. **The tier-G square-contour "bound" was not a bound** — it dropped the `π` from `π cot(πz)`,
   leaving it 30–40 % *below* the true integral at every `N`. The asymptotics were right; the
   constant was not, and a ledger would have printed a false `≤`.
3. **`P = 2πi` should have been `P = 2π`** in the strip family, against the section's own convention.

All three were caught by evaluation, not by reading. That is the argument for the golden corpus,
made once, concretely.

**One bug found in the work itself, worth keeping.** A log-family solve dropped a `1/i = −i` and
still passed every numeric check, because the flagship fixture `R = 1/(1+x²)` makes the affected
term vanish identically. It surfaced only on `R = 1/(x²+4)`. Hence DESIGN.md §5's loader
invariant 3: **every family needs a fixture in which no bonus constant is zero.**

---

## 3. What writing the records did to the design

The gallery was written against a locked v1 schema. It broke it in 19 places — which is the most
useful thing it did, and why the records were written before any code. The findings deduplicate into
one structural change and a set of missing fields.

### 3.1 The structural change

**Pass 5 was a scalar division; it had to become a real linear system.** Three authors hit this
independently, from three directions:

- the log keyhole's lower edge reproduces an **affine combination** of several targets, not a
  multiple of one (D4/D5);
- **tier G has no `target` piece at all** — its unknown sits inside the residue sum, so the scalar
  form degenerates to `T = 0/1 = 0`;
- one complex equation is **two real equations**, which is precisely how D4 and D5 both fall out of
  a single contour.

The corrected formulation (DESIGN.md §4, Pass 5) stacks one row per piece into `M t = r` over `ℝ`
and reports `rank(M)` and `ker(M)`. It is simpler than what it replaced, and it **collapses four
classical traps into one computation**: the keyhole's wrong `argRange`, `∫₀^∞x^{a−1}/(1+xⁿ)` at
integer `a`, the plain-log keyhole "losing" the log integral, and D5's underdetermined `∫R log²` are
all the same rank condition. Instead of four hand-written detectors, one kernel report naming which
targets are undetermined.

### 3.2 The missing fields

| # | gap | from |
|---|---|---|
| 1 | `rigorIfDischarged` conflated the finite-`p` bound (`≤`) with the substituted limit (`=`); under `policy: "min"` this decides **every label in the gallery** | A–B |
| 2 | no `auxiliary` — nowhere to say `e^{iz}/z` complexifies `sin x/x`, or that the answer is `Im(…)`; affects 5 records | C–D |
| 3 | one lemma per piece, but B1/B3's arcs take L2 *and* L3 while B2's takes only L3 — and that redundancy is exactly what distinguishes them | A–B |
| 4 | no per-pole `n(γ,·)`; `encloses` was a prose blurb | C–D |
| 5 | `Res(f,∞)` had no seat — Pass 3 claimed `role: "residue"` was "handled in pass 2", which sums finite poles only | C–D |
| 6 | `branch` was singular; D6/D7 have two branch points, D7 with two arg conventions | C–D |
| 7 | `principalValue` was a boolean on the target though §2.3 demands a distinct result type — and the p.v. belongs to the *auxiliary* | C–D |
| 8 | no convergence class: B2 is conditionally convergent and **not** a principal value | A–B |
| 9 | no record of which half-plane-ladder rung was reached — the only thing separating `=` from `RootSum` | A–B |
| 10 | `residueSelection` had no `lowerHalfPlane`, and tier G needs `targetTerms` + a one-sided/two-sided `weight` | A–B, E–G |
| 11 | `orientation` was a literal, but B1 needs `sgn(a)` | A–B |
| 12 | `target` had no `substitution` (which `RealIntegral` has and Pass 4 needs), and the Jacobian had nowhere to live | A–B, C–D |
| 13 | no family-level `restrictions`: A1's `sgn(a)` and A2's `\|a\| ≶ 1` switch were homeless | A–B |
| 14 | `onFail` had only `refuse`/`warn`, but **G1 violates its hypothesis while being fully rigorous** — needs `escalate` plus a `collisions[]` block | E–G |
| 15 | no seat for an imported exact constant, so E3's and F2's `√π` were capped at `≈` as `free` pieces | E–G |
| 16 | `golden[]` had no `method`, and no rule forcing a fixture with non-zero bonus terms | C–D |
| 17 | no `prerequisites`: D5 cannot close alone | C–D |
| 18 | `targets` could not be a sum; no `square` template; no way to constrain a limit parameter to half-integers | E–G |
| 19 | no `admissibilityCheck` on the cut system (research 06 §2.1) at the family level | C–D |

All 19 are folded into DESIGN.md §5's v2 schema.

---

## 4. Mathematical findings worth carrying into the code

Things learned writing the records that are not obvious from the taxonomy, each of which changes an
implementation decision.

- **The total-residue identity `ΣRes = 0` is a property of rationality, not of the pole set.**
  A6 and B3 share a denominator, a ladder rung, *and* an identical algebraic residue factor —
  `P·(Q′)⁻¹ ≡ −z/4` in `ℚ(i)[z]/⟨z⁴+1⟩` — yet the identity holds for A6 and fails for B3, because
  `e^{iz}` has an essential singularity at `∞`. **An engine that caches the identity per-denominator
  is silently wrong on every Fourier twin.**
- **L3 and L6 rest on the same inequality** under `φ = π/2 − ψ`. Two of the eight catalogued lemmas
  should share one dischargeable predicate — and the derivation panel should say so, since it is a
  rare place where two apparently different contour tricks are visibly the same trick.
- **The dogbone's winding numbers are 0-or-1, not otherwise.** `n(γ, pole) = 0` for *every* pole
  while `∮ ≠ 0` — homology is not pole-counting. (The genuine `n ∉ {0,1}` case is Pochhammer, which
  is v2.) This corrects an assumption in the original brief.
- **D6's `Res(f,∞) = 0`, and that is the point** — it is being *certified* zero by the same degree
  bound that discharges L2. D7 is where the residue at infinity actually carries the answer
  (magnitude 26.7 inside a result of 1.216).
- **C1 and C2 exist to be contrasted.** C1 needs the indentation and L4 (`iπ·Res`, not `2πi·Res`,
  not zero); C2's singularity at the origin is **removable**, so the engine should detect that and
  need no indentation at all.
- **A3's order-2 pole at the origin** appears only *after* the `z = e^{iθ}` substitution, which is
  why it is the one students miss.
- **A4, E3 and F2 have no poles at all.** The residue machinery correctly reports an empty singular
  set and the value still comes out — from the Cauchy integral formula, from a legal contour shift,
  from the wedge. Worth keeping as a set: they are what stop "residue theorem" being read as
  "find poles, sum residues".
- **Every tier-A/B value contains a `π`**, so a certified *enclosure* needs a rational `π`
  (DESIGN.md §6.4). The common case is covered by policy — decimals are `≈` anyway.

---

## 5. Status

**The loader and its four invariants are implemented** (`apps/contour-integration/src/families/`),
together with Pass 5's exact rational linear algebra, which invariant 4 rests on. Three records are
loaded: **A5, A6, A7** — the pure-rational semicircle families, which are the ones the engine can run
end to end today. A1–A4 need the `z = e^{iθ}` substitution, tier B needs the Jordan branch wired to a
family, and C–G need indentation, branch cuts and the kernel families of M4/M5. A record loaded
before its machinery exists would be a worked example that cannot be worked.

Each loaded record is **executed against the engine in the test suite**, not merely parsed: its
golden value is reproduced through `findPoles → integrateContour → applyResidueTheorem`, the
residue-theorem value is checked to be *identical* at `R = 3` and `R = 40` (which is what makes the
instantiation radius a display default rather than a claim), and the quadrature cross-check is
required to agree. A6's `closing-down-disagrees` trap is executed directly.

### 5.1 What transcription found

Three gaps, in the same spirit as the 19 that writing the records found:

1. **`FamilyPiece` was declared and never defined.** DESIGN §5 wrote `pieces: FamilyPiece[]`; §2.2's
   runtime `Piece` carries no coefficient information, and Pass 5 cannot build `M` without knowing
   *which* unknown a `target` piece is the target of. Now defined in DESIGN §5.1.
2. **`golden[].params` holds variant flags, not only parameter bindings.** A5's `halfRange`, A6's
   `closeDown` and A7's `halfRange` are booleans selecting an alternative *derivation*, and the field
   was typed `string | number`. Widened; a family with a parameter actually named `closeDown` would
   collide, which is the argument for a separate `variant` field if a later tier needs one.
3. **`M` is not always rational.** Tiers A and B use only `1` and `0`, but the log keyhole's `2πi`
   coefficient has no rational entry. The loader refuses rather than rounds — rank is the whole
   Pass-5 report, and a rounded `2π` would make it a matter of tuning. Deferred to M4.

One conflict **dissolved** rather than being carried: the records wrote a single `rigorIfDischarged`
and flagged its clash with DESIGN §4 Pass 3 (`"="` vs `"≤"`) as gap G2. v2's split into
`rigorOfBound` / `rigorOfLimit` settles it — the finite-`R` bound is a bound, the substituted limit
is exact — so both readings were right about different claims.

And one thing the tests corrected in the *implementation*, worth recording because the record was
right and the implementer was not: closing A6 downward does **not** negate `∮`. The lower template's
traversal is clockwise, so its identity carries the opposite sign, and the two closures land on the
same `π/√2` — exactly as the record's prose says ("both give 2.2214414690791831"). The test now also
asserts the two contours enclose *different* poles, since agreement alone is the one thing an engine
with both the orientation and the half-plane predicate backwards would also produce.
