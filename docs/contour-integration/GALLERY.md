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
together with Pass 5's exact rational linear algebra, which invariant 4 rests on, the unit-circle
substitution `z = e^{iθ}` (`src/engine/substitution.ts`), and the exponential output basis
`Σ cₖ e^{βₖ}` (`src/kernel/expSum.ts`), and **Pass 5's solve** (`src/families/solveTarget.ts`). Ten
records are loaded: **A1–A3** (circle), **A5–A7** (semicircle), **B1–B3** (Jordan) and **C1** (the
indented semicircle) — every entry in tiers A and B except A4, plus the Dirichlet integral.

**A4 is deliberately absent.** Its integrand `e^{cos θ} cos(sin θ − nθ)` complexifies to
`e^z/(i z^{n+1})`, whose exact residue is the Taylor coefficient of an *entire* function — `1/n!` —
and the residue engine's exact path stops at rational functions over ℚ(i) and one quadratic
extension of it. A4 needs a table of known entire functions with exact truncated ℚ(i) series, which
is its own piece of work. Tier B needs the Jordan branch wired to a family; C–G need indentation,
branch cuts and the kernel families of M4/M5. A record loaded before its machinery exists would be a
worked example that cannot be worked.

Each loaded record is **executed against the engine in the test suite**, not merely parsed. *Every*
fixture is run, not only the flagship one — which is where the parameterised families earn their
keep: A1's `a < 0` case (where the textbook closed form is wrong and the residue route is right),
A2's `|a| ≶ 1` switch and its `a = 0` pole-*count* change, and A3's order ladder `2π/3 · 2⁻ⁿ` for
`n = 0…4`. The residue-theorem value is also checked to be *identical* at `R = 3` and `R = 40`
(which is what makes the instantiation radius a display default rather than a claim), the quadrature
cross-check is required to agree, and A6's `closing-down-disagrees` trap is executed directly.

### 5.0b C1 is where `∮` stops being the answer

Tiers A and B never needed Pass 5. There the target piece IS the whole contour (A) or the arc
vanishes and the real axis is all that remains (B), so `∮ f dz` and the target are the same number
and reading the closed-contour value was enough. **C1 is where that stops.** Its contour encloses
nothing — `∮ = 0` — and the entire answer comes from the indentation's `iα·Res`. Reading `∮` there
reports 0 for an integral whose value is π/2.

So `solveTarget` solves `a·t + Σbᵢ = S` in **units of π**: `2πi Σ Res` is `π·(2iΣ)` and L4's `iα·Res`
is `π·(i(α/π)Res)`, so the whole solve stays exact and π is never evaluated. `π/2` stays `π/2`.

**L4 is the one lemma in the catalogue whose piece does not vanish**, and the role `vanish` on it is
not a contradiction: DESIGN §4 Pass 5's table gives such a piece `aᵢ = 0` and `bᵢ = 0, *or a known
limit such as iα·Res from L4*`. The role says it touches no unknown, not that it contributes nothing.
The two classical wrong answers are each one factor away — `2πi·Res` (a FULL turn around an
*enclosed* pole, and this one is detoured around) gives π, and "the small arc vanishes" gives 0.

L4 **refuses at order ≥ 2**, where `∫_{C_ρ}` grows like `ρ^{1−m}`: no limit exists, so the contour
argument does not close and no principal value exists either. And C1's own free self-test is
executed: indenting *below* flips both the winding number and the sign of `iα·Res`, `∮` becomes
`2πi` instead of 0, and the two changes cancel to the same π/2 — an engine that flipped only one
would land on −π/2 or 3π/2 and look plausible either way.

### 5.0a The exponential basis: `=` on the form, `≈` on the decimal

Tier B's residues are not algebraic numbers. `Res(g·e^{iaz}, z₀) = Res(g,z₀)·e^{iaz₀}` at a simple
pole, and `e^{iaz₀}` lies outside ℚ(i)(√d) — so until now the whole residue fell back to floating
point and tier B could only be `≈`. But **the exponential factor does not need to be evaluated to be
exact, only carried.** Carrying it is what turns `1.1557273` into `π/e`.

B3 is the record that makes the distinction unavoidable, and it says so itself: its residue's
algebraic factor is *literally the same element* as A6's, yet `Σ_all Res = 0` — free for A6 — is
false there, because `e^{iz}` has an essential singularity at ∞. The `=` is on the symbolic form; the
decimal stays `≈`, and not merely by PLAN §3.3's general rule — certifying it needs enclosures for
`exp`, `cos` and `sin`, which PLAN §3.2 cut because ECMA-262 gives them no ulp bound.

Two limits are held honestly rather than papered over. **Simple poles only:** at order `m > 1` the
residue is `p(z₀)·e^{iaz₀}` for a polynomial built from derivatives, so a repeated pole under an
exponential keeps its exact locations and declines to claim a residue. **A zero frequency switches
lemmas:** `e^{i·0·z} = 1` is an ordinary rational integrand, Jordan's `π/|a|` is infinite there and
says nothing, and B1's own trap warns that an engine treating that as a failure "will paper over
exactly the case it was built to catch".

### 5.0 The substitution is engine code, not a rewrite convenience

`z = e^{iθ}` **manufactures singularities the posed integrand does not have**, which is research 03
§1's "single commonest error" in the whole subject. `cos 2θ/(5 − 4cos θ)` is smooth at every real θ;
the contour integrand it becomes has a pole of order exactly 2 at the origin, and running pole
detection on the posed form returns `17π/12` where the answer is `π/6` — a factor of 8.5. So the
rule is structural rather than remembered: `contourIntegrandOf` binds parameters, substitutes, and
attaches the Jacobian, and **there is no other route to an integrand**. Nothing downstream can see
the θ-form. A1 is the deliberate contrast — there the Jacobian's `z` cancels exactly and the origin
is a *removable* singularity the engine names rather than fails to look for; both are pinned by
tests.

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

Three more found by a review pass after A1–A3 landed, all in the same class — **a field the schema
calls machine-readable that nothing had ever tried to read**:

4. **`windings` did not parse.** DESIGN §5 specifies it as "per-pole, not a prose blurb", and three
   of the transcribed entries were neither: `sign(a)`, which `@cas/expr` does not have, and
   `if … then … else`, which is spelled `if(c, t, e)`. The loader now requires both halves to parse,
   so this cannot recur.
5. **`traps[].detect` has a form the namespace convention did not anticipate.** A1 and A2 both write
   `hypotheses.<id> == false` — a back-reference saying "this trap explains that hypothesis's
   refusal". Admitted as a recognised form, and it buys a stronger check than the namespace one: the
   referenced hypothesis must exist.
6. **Three languages share this schema.** `@cas/expr` for geometry and windings; a namespaced
   predicate DSL for `check` / `detect` / `constraints` (which *cannot* be `@cas/expr` — it has no
   `>=` or `!=`); and display notation for `closedForm`, whose `Sum`, `Res` and `sign` exist in no
   grammar. Tabulated in DESIGN §5.0, because conflating them is how a field ends up looking
   executable while being prose.

Also corrected in the same pass: `restrictions` on A1 and A2 was explanatory prose duplicating their
traps. The field scopes a claim *narrower than the parameter domain*; both families' closed forms
hold on their whole legal domain, so both correctly have none.

Tier B added two more, and closed one the records had left open:

7. **Gap G5 is closed.** B1's arc must lie where `a·Im z ≥ 0`, i.e. `theta1 = π·sgn(a)` — and §2.2's
   `Scalar` is the affine subset, in which that is not expressible at all. The record settles for a
   prose caveat on `orientation`. A new `contour.derived` field computes `sgnA` from the parameters,
   which makes the geometry affine in it again and the `a = −1` fixture actually executable.
8. **`auxiliary.relation` is load-bearing, and a test keyed off the wrong half would have hidden it.**
   B1 and B3 take `Re` of `∮`; B2 takes `Im`. Reading the real part for all three passes twice and
   fails once, and the failure looks like an engine bug rather than a missing step in the argument.
   The other half is the *free companion* — `∫ sin(ax)/(x²+b²)` and `∫ x cos x/(1+x²)`, both zero by
   parity — and is now asserted to vanish for every entry.
9. **A variant fixture is decided by NAME, not by type.** `halfRange` and `closeDown` are booleans,
   but B2's `companion: "re"` is a string; keying off the type silently treats it as a parameter
   binding. A key the family does not declare as a parameter is a variant flag.

C1 added two more:

10. **The namespace set was closed over the wrong sample.** The loader's predicate-namespace guard was
    built from tiers A and B and admitted four names; C1's `analytic:dirichletTest(...)` is
    legitimate and was rejected. A scan of all 28 records finds **thirteen**. A closed set is only as
    good as the sample it was closed over, and the list now carries the full census.
11. **The lemma has to reach the runtime piece.** DESIGN §2.2 gives `Piece` a `lemma` field and the
    runtime type had dropped it, so the ledger had to infer the lemma from the integrand's shape.
    No shape test distinguishes an indentation from a closing arc — in C1 they share a centre — and
    the indentation silently took the Jordan path, solving to 0 instead of π/2.

Two rendering bugs also surfaced, neither visible to a numeric check: a unit value printed as the
**empty string** (the unit-numerator elision needs a symbol to elide in favour of), and a compound
coefficient was not bracketed before an exponential multiplied it, so B3's
`(π√2/4 − πi√2/4)·e^{β}` printed as `π√2/4 − πi√2/4·e^{β}` — right value, different formula.

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
