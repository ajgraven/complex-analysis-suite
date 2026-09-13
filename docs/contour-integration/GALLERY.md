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
  rare place where two apparently different contour tricks are visibly the same trick. **Done in
  M5.2** (`kernel/bounds/linearMinorant.ts`; the certificates name the identity, so the derivation
  panel shows it without a special case). What the sharing bought was not code reuse: it is that the
  *side condition* is asked in one place, and that is the half of the lemma D-1 got wrong. See §5.3.
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
`Σ cₖ e^{βₖ}` (`src/kernel/expSum.ts`), and **Pass 5's solve** (`src/families/solveTarget.ts`).
**Twenty records are loaded, none dropped:** **A1–A7** (circle and semicircle), **B1–B3** (Jordan),
**C1–C3** (indentation, removability, and the two-singularity ledger) — the M3 gate's thirteen — and
**D1–D7** (branch cuts), which is the M4 gate's seven. **Every entry in tiers A, B, C and D.**

Each solves to a **symbolic closed form**, asserted by name in `familyGolden.test.ts` and, for tier
D, in one test per record (`test/d1.test.ts` … `d7.test.ts`):

| tier | | | |
|---|---|---|---|
| A–C | `2π√3/3` · `8π/3` · `π/6` · `π/2` | `π√2/2` · `π/8` · `π/e` · `π/e` | `π/2` · `π/2` · `π − π/e` · `2π` |
| D | D1 `π/sin(3π/10)` · D2 `π − π√2/2` | D3 `(π/5)/sin(23π/50)` · D4 `−π/4` (and `π/4` free) | D5 `π³/8` · D6 `π√2/2` · D7 `(−π·2^(1/4)·5^(3/4) + 17π/4)/sin(3π/4)` |

Each tier-D form is at that record's primary fixture; the parameterised ones are solved at every
fixture they declare, and D1's five run `π/sin(3π/10)`, `π`, `π/sin(3π/4)`, `π/sin(π/10)`,
`π/sin(9π/10)`.

B3 is the one entry in A–C without a symbolic form, and its own record says why: its exponents are
complex, so `Re` does not distribute over the terms and `e^{β}` contributes `cos` and `sin` of an
irrational.

**Two things about tier D that the table cannot show.**

Its forms are **carried, not reduced** (ADR-0041): `π/sin(3π/10)` is the exact answer, not a step
before one, because reducing it would need a general algebraic number field — D3's `sin(23π/50)` is
degree 20. The FORM is `=` and the decimal is `≈`, exactly as tier B carries `e^{β}`.

And **the quadrature cross-check is SKIPPED for all seven**, by an explicit decision the run reports
rather than by omission: sampling `z^α` needs a determination, and `@cas/expr`'s compiled evaluator
uses the principal one, so a quadrature of a keyhole would answer a different question with
confidence. Tiers A–C are corroborated by an independent numeric route and tier D is not — which is
the one respect in which tier D's evidence is thinner than tier A's, and it is now closable rather
than structural: M4.7c's `kernel/branch/declared.ts` evaluates the DECLARED determination on the CPU,
which is the evaluator the cross-check was missing. See §5.2.

**Tier E–G need the kernel families of M5** (rectangle/strip quasi-period, wedge, `πcot`/`πcsc`
summation). A record loaded before its machinery exists would be a worked example that cannot be
worked.

Each loaded record is **executed against the engine in the test suite**, not merely parsed. *Every*
fixture is run, not only the flagship one — which is where the parameterised families earn their
keep: A1's `a < 0` case (where the textbook closed form is wrong and the residue route is right),
A2's `|a| ≶ 1` switch and its `a = 0` pole-*count* change, and A3's order ladder `2π/3 · 2⁻ⁿ` for
`n = 0…4`. The residue-theorem value is also checked to be *identical* at `R = 3` and `R = 40`
(which is what makes the instantiation radius a display default rather than a claim), the quadrature
cross-check is required to agree, and A6's `closing-down-disagrees` trap is executed directly.

### 5.2 The two limits tier D left — **closed in M5.0**

Both were about the same missing piece, and both were found by reviewing M4 rather than by a test
going red, which is why they were written down here instead of being carried as intentions. **M5.0
closed them**; §5.2.1 below records what they were and what closing them cost, because the *shape*
of the gap is the part worth keeping.

**1. `side` was declared, validated, and not honoured.** Research 06 §3.3 is emphatic about the
mechanism: *"Don't offset the contour; offset the branch"* — give each piece a `side: 'above' |
'below'` tag and let the evaluator pin `θₖ` to its limiting value from that side, so the contour lies
exactly on `ℝ₊` and the integrand is exactly the limiting boundary value, "the same idea as C99's
signed zero, lifted from a float bit to a data field". The field exists (`contour/model.ts`), records
declare it, `instantiate.ts` carries it onto the resolved piece, and LEGALITY requires it of any
piece that meets a cut. **Nothing reads it to evaluate anything.** The exact answers do not need it —
a lip's determination reaches the algebra through the record's declared `crossingPhase` and its
role's coefficient, which M4.3 derives and checks — so no tier-D value is wrong. But the tag is
currently a well-formedness requirement rather than the branch-offsetting device §3.3 specifies.

**2. Which was why the quadrature was skipped for all seven.** The two were one gap: the cross-check
needs an evaluator that can sample the declared determination, and on the lips it needs `side` to say
which edge of the window a point on the cut belongs to. `runFamily` reported the skip in full rather
than quietly not integrating, and the exact route was unaffected — but it meant tier D was the one
tier whose values had no independent numeric corroboration, while every other record's `∮` is checked
against floating Gauss–Legendre panels that share no machinery with it.

#### 5.2.1 How M5.0 closed them, and the one thing that surprised it

M4.7c had already built `kernel/branch/declared.ts` to draw the picture in the declared
determination, evaluating `c·∏ⱼ(sⱼ(z − bⱼ))^{αⱼ}` on the CPU with each factor in its own window —
the evaluator both gaps were waiting on. So M5.0 was: give `evaluateDeclared` a `side`, hand
`analyse` that evaluator for a branch record, and drop the skip.

**The side is a signed zero, taken literally.** §3.3 objects to an `ε`-offset contour on two counts —
it injects an `O(ε)` error, and near a branch point the integrand varies on scale `ε` so the
quadrature cost explodes — and both objections are about a *geometric* offset at `ε ~ 1e-6`. The
displacement here is `1e-30` and lives only inside the evaluator: the contour's nodes and its `dz`
are untouched and exact, and it exists for the one purpose of telling `argCut` which edge of the
window the point belongs to. Every lip in the corpus runs from `η ≈ 0.1` outward, so it moves `arg`
by `~1e-29` — enough for `atan2` to return `θ₀ + 0⁺` rather than a coin toss — and moves `|·|` by
`O(1e-60)`, below float64's resolution. The value is therefore the limiting boundary value *to full
precision*, which is what §3.3 asks for and what an offset contour cannot give. Deriving the edge by
parity instead (from `sⱼ`, the window direction and the side) was the first design; it is four XORs
that are easy to write backwards and impossible to check by reading, so taking the limit won.

**The tag has to DECIDE the number, and that needs its own test.** "Seven records now agree" would
also pass against an evaluator that ignored `side` and happened to be right, so the suite integrates
each record a second time with both lips declared `"above"` — the pre-M5.0 cancellation, forced — and
requires the honest declaration to be more than **10× closer** to the exact value. It is, on all
seven.

**What the cross-check found, which is the reason M5.0 went first.** Nothing wrong: all seven agree,
each within ~1.5× the quadrature's *own* error estimate. But tier D's gap is **1e-3…1e0**, not tiers
A–C's 1e-14, because the lips carry an endpoint singularity (`z^{α−1}` is unbounded at the branch
point) and Gauss–Legendre converges slowly against it. So the claim the suite pins is a ratio rather
than a magnitude: the disagreement must stay within a small multiple of the estimator, since a
systematic error in either route would show as a gap the estimator does not explain. A flat
tolerance would have had to be loose enough (1e0!) to be worthless.

**One skip survives, and it is narrower and better.** A side resolves nothing when the cut runs
*vertically* through the piece: "above" then displaces **along** the cut rather than across it, `arg`
does not move, and whichever limit `atan2` returns would be taken — wrong half the time, silently. No
record is in that shape, but `sideResolves` asks per record rather than assuming, and a record that
were would be refused *by name* instead of answered. The old skip's general reason is gone; this one
is a decided property of the pair (cut, piece).

**And one regression, which is the most instructive part.** `FamilyRun.f` used to be the compiled
AST, and `declaredProduct.test.ts` read it as *"the principal determination"* — true, but true by
accident. M5.0 made `f` the DECLARED evaluator for a branch record, so both halves of that suite's
central claim started comparing a function with itself: **"differs below the cut" went red, and
"agrees above the cut" kept passing vacuously.** The red half is how it was found; the vacuous half
is the one worth remembering, and it is the same shape as the three M4.7 discovered (an unused GLSL
function links perfectly; `expect(x).toBeLessThan` without a call asserts nothing). The fix names the
principal branch explicitly — `makeComplexFn(run.ast)` and nothing else — instead of borrowing
whatever `f` means this milestone.

**The mutation sweep was unsound until that was fixed, and said so.** Its first pass reported 16 of
16 mutants killed — while nine tests were *already* failing on the clean tree, so "a test failed"
was true of every run including the unmutated one. Re-run against a verified-green baseline it was
**13 of 17**, and each of the four survivors was a real gap: `agrees` was never asserted to be
`false` (so forcing it `true` changed nothing), and neither the accumulation panel's determination
nor `Analysis.sides` was checked at all. Closing them produced the two strongest claims in the
slice — a mis-declared side drops the verdict from `=` to **`⚠`** on all seven records, and the
accumulation trail tracks the integral 4.7× to 441× better with the sides than without — so the
unsound sweep cost a re-run and bought two tests. The survivor that remains is genuinely equivalent:
`sideResolves`' first clause is redundant *at* `1e-30`, and is kept because it is the question being
asked rather than an optimisation.

### 5.3 Tier F's prerequisite — **M5.2**, and what one predicate is actually for

M5.2 built no record. It built the inequality two of the eight lemmas share, and corrected the one
the research states wrongly (**D-1**) — the maths F1 and F2 stand on.

**The sharing is not code reuse.** `sin ψ ≥ 2ψ/π` and `cos φ ≥ 1 − 2φ/π` are one statement under
`φ = π/2 − ψ` — measured on 5001 points, the two slacks agree to 2.2e-16 — but neither is something
arithmetic could establish: they are theorems about the concavity of `sin`. What the predicate
decides is the **side condition**, in exact ℚ: does the range asked about lie inside `[0, π/2]`?
That is the decidable half, and it is precisely the half research 03 got wrong. A predicate that
merely named the inequality would have shared a sentence; one that decides the range makes the
mistake unrepresentable.

**And the two faces part company past `π/2`, which IS D-1.** `sin` stays non-negative to `π` and is
symmetric about `π/2`, so exceeding the range folds — `∫₀^Ψ ≤ ∫₀^π = 2∫₀^{π/2}` — and costs a factor
of two. `cos` changes SIGN, so `e^{−κcos ψ}` stops being damped and starts growing; at `ψ = π` it is
`e^{+κ}`. The research applied the sin face's tolerance to the cos face's integrand. Measured, the
majorant it states for `e^{−zⁿ}` on `[0, π/n]` is **2.7e15** at `n = 2, R = 6`, **1.1e93** at
`n = 3`, and **overflows float64** at `n = 4` — all three are computed in `test/wedgeArc.test.ts`, so
the wrong statement is refuted by the suite and not only by a paragraph. In the app the two sit side
by side as two ledger rows: on the `π/2` wedge, `e^{iz²}` is killed and `e^{−z²}` is refused.

**Two ranges are quoted for the oscillatory form, and both are right.** Research 03 §0.3 (as
corrected) gives `[0, π/(2n)]` with `π/(2nR^{n−1})`; §10.1 of [`tier-efg.md`](gallery/tier-efg.md)
gives `[0, π/n]` with Jordan. The first is the wedge the Fresnel derivation actually uses; the second
is the largest range on which the form still vanishes, at twice the constant. The engine quotes
neither: it takes the arc's range from the geometry and asks the predicate, so `π/4` and `π/2` at
`n = 2` both get the right answer and the difference shows up as the constant rather than as a
disagreement between two documents.

**Jordan turns out to be this bound at `n = 1`.** `π/(n·c·R^{n−1})` at `n = 1, c = a` is `π/|a|` —
Jordan's own constant, asserted equal in ℚ. The two bound functions are still separate, because
Jordan carries a rational cofactor's `max|g|` and the wedge carries none, and merging them would
make one function's asymptotics come from two unrelated places (ADR-0007's rule, read the way it is
meant to be read in both directions). One predicate, two lemmas.

**What the sweep found.** 20 of 21 mutants killed; the survivor is equivalent (a zero rate cannot
reach the clause that refuses it, because the face reader has already declined `w = 0`). Two kills
were real and both were about geometry rather than about the inequality: reading a sector's START
angle as `0` certifies `π/(4R)` for the CLOCKWISE arc `[π/2 → π/4]`, where `cos 2θ ≤ 0` and the
integrand reaches `e^{+R²}` — a `≤` that is false, not merely loose — and a degenerate extent makes
the plain ML bound `0·π·R·max|f| = 0`, a `≤ 0` on an arc whose integral is small and non-zero. The
first survived a test that refused under the mutant anyway, by the range check firing first: the
test pinned the outcome without pinning the reason.

**And one finding on the test side.** `e^{−κ h(ψ)}` is a spike of width `~1/κ`, and `κ = c·Rⁿ`
reaches 65536 at `n = 4, R = 16`. A uniform 40001-point Simpson rule has a step of 2e-5 against a
spike 1.5e-5 wide: it measured the majorant at 2.1e-4 where the true value is 1.2e-4, and reported a
**correct** bound as violated. Textbook adaptive Simpson halves its tolerance per level and never
terminated on it. The rule that works grades its mesh toward both endpoints (`ψ ∝ u²(3 − 2u)`, whose
Jacobian vanishes there), which needs no case analysis about which end the spike is at — and the two
faces put it at different ends.

### 5.4 Tier E begins — **M5.3**, and the sign of λ decides everything

E1 and E2 are a matched pair: one rectangle in a quasi-periodic strip, differing only in `λ`. Every
contrast between them follows from that, and the engine now derives each rather than accepting it.

**"Mostly wiring" was wrong, and measuring it first is what reordered the work.** `findPoles` gave
`e^{0.3z}/(1+e^z)` `rational: false` and **zero poles** — the same report it gave `1/cosh z`, which
has infinitely many, and `e^{−z²}`, which genuinely has none. E1 and E2 had no residue to take, and
E3's `poles: []` was true by accident. So deciding **entirety** turned out to be the prerequisite for
trusting any pole list, not the last slice.

**`w = e^z` is the whole substitution, and the poles become LATTICES.** `e^z = ρ` has solutions every
`2πi`, so a strip integrand has vertical lattices rather than finitely many poles, and the record has
to declare which band its argument is about — a list of infinitely many is not a list, and truncating
one silently is how a residue sum quietly loses terms. Exactness rests on one stated restriction:
each root of `D(w)` is a root of unity, so `log ρ = 2πi·q` exactly and `e^{az₀}` lands in M4.2's
existing basis with **no new number field**.

**E1's parameter window is DERIVED.** The record asks for it in as many words — "*`a > 0` is exactly
what makes the LEFT vertical side vanish and exactly what makes the integral converge at `x → −∞` …
one condition, two jobs*" — and L1 on a vertical side gives `κ = Re(a) + deg N − deg D` on the right
and `−Re(a) − ord₀N + ord₀D` on the left, whose signs are `a < 1` and `a > 0`. E2's contrasting "no
condition at all" is the same expression at `Re(iξ) = 0`. Two claims, one exponent.

**A strip has TWO denominator shapes, and which one is the SIGN of λ.** `1 − λ` factors as a sine
when λ sits on the unit circle (E1, `π/sin(πa)`) and as a **hyperbolic cosine** when λ is a negative
real (E2, `π/cosh(πξ/2)` — the record's `π sech(πξ/2)`). The sine recogniser refused E2 correctly and
by name. `sineForm.ts`'s own header warns that "a second and third rule accreting into a simplifier
is the failure mode", and that warning is spent deliberately here: this is not a pattern hunt but the
other half of one fact, selected by an exact comparison of two coefficients, with everything else
still refusing. Two consequences worth keeping — **a cosh cannot degenerate** (it vanishes only at an
imaginary argument, and the branch requires γ real), which is E2's "unconditionally well-posed"
claim arriving as a property of the factoring rather than a range check; and `1 + e^0 = 2` collapses
to one term, so `ξ = 0` prints a bare `π`.

**The sharpest bug of the arc was a RIGHT VALUE under a WRONG FORM.** `solveTarget` rebuilt the
solved form field by field and carried only `sine`, so E2's value divided by the cosh while its text
did not: every fixture printed `π` for numbers that were 0.271, 1.252 and 0.590. Nothing about that
looks wrong. Spreading instead of rebuilding fixes it and makes the class impossible for the next
field — and the one mutant kept as equivalent (normalising `|γ|`, since `ExpSum.sort` already orders
the pair) is insurance against exactly the same shape, `cosh` being even.

**The strip is declared and the declaration is CHECKED.** `stripTheorem.ts` asks the lattice points
one period either side of the band for their winding numbers and refuses if the contour encloses one
— or passes through one, which is worse. That is E1's `wrong-strip-height` trap at run time rather
than at load time. The check was INERT when first written, because margin poles never reach
`integrateContour` and so had no winding to look up; it computes them directly now.

Three smaller things the slices found, each older than the slice that found it: the pole card said
"no poles are claimed" about an entire integrand (understating what the engine had established); the
ledger's CATCH row gave an **unconditional** reason, telling a reader of `1/cosh z` that "some poles
are not expressible in ℚ(i)(√d)" — a difficulty it never reached; and `PoleReport.rational`'s doc had
drifted from its meaning, since C2's `(1 − e^{iz} + iz)/z²` is not rational and sets it `true`.

**E3 is deferred with F2, not dropped.** Both need ADR-0042's `knownValue`, which is decided and
unimplemented, and doing them together implements the import set once against two consumers rather
than once against one — this repo's own extraction rule pointed at a schema field. SG-3's
canonical-range reduction rides with it.

### 5.5 Tier F begins — **M5.4**, and three rows that were saying something false

F1 is the strip's ROTATION. Every structural fact about E1 has a twin here: `f(ωz) = μ f(z)` where
`f(z + iP) = λ f(z)`, a return RAY where there was a top side, `−ω·μ` where there was `−λ`, and a
Pass-5 denominator `1 − ω` where there was `1 − λ`. What is *not* a twin is everything below.

**The affine `Scalar` did not cover the gallery, and its own doc said it did.** A wedge's return ray
runs from `R·e^{2πi/n}` to `0`, so its endpoint is `R·cos(2π/n)` — a product of two parameters, which
no affine form in one of them can write. The two routes that look like they avoid the widening both
fail for reasons worth keeping. `derived` is evaluated in `instantiate.ts` BEFORE the limit parameters
exist, deliberately, so `R·cos(2π/n)` cannot be one; and were it computed afterwards it would be
frozen at instantiation, leaving the ray behind while the arc — bound to `{param:"R"}` — followed a
drag, silently opening a contour the ledger had just certified closed. So a coefficient may now name
a parameter. What the widening does NOT do is make the form nonlinear where it matters: a `derived`
coefficient never moves under a drag, so the product still has exactly ONE live factor. That was
always the real claim — until F1 there was no record in which "one parameter" and "one LIVE
parameter" differed.

**A residue theorem where no individual residue exists.** `1/(1 + zⁿ)` has poles in ℚ(i)(√d) at
`n = 2, 3, 4` and none at `n = 5, 7`, because ℚ(ζ₁₀) has degree 4 over ℚ and ℚ(ζ₁₄) degree 6. D3 met
this first and answered it for a KEYHOLE, which encircles every root once; F1's wedge encircles
exactly ONE of the `n`, so "the sum over every root" had to become what the residue theorem actually
says — `Σ n(γ,zₖ)·Res` — with the sum left as the wrapper `wₖ ≡ 1`. Two invariants came with it. An
undecided weight REFUSES rather than contributing zero, because a term dropped that way is a term
missing from a sum still reported as exact. And a determination may be omitted only for an INTEGER
power: a window is a property of the integrand, and D3's `z^{a−1}` has one to declare where F1's plain
`1/(1+zⁿ)` does not — defaulting one would put a convention on an integrand that admits none.

**And the route is a FALLBACK on purpose.** Trying the structure first would work, and would be
worse: the per-pole route returns `2π/(3√3)` in the algebraic basis where the structural one returns
`π/(3·sin(π/3))`, the same number carrying a transcendental it does not need. The record's own
goldens say exactly that — a radical at `n = 2, 3` and a sine at `n = 5, 7` — and the ordering falls
out of the existing flow rather than needing a preference.

**Three rows were false, and two of them older than the slice that found them.** `2π/5` was not among
the thirteen fractions of the angle whitelist, so KILL reported that no lemma applied *to the
integrand* — for `1/(1 + z⁵)`, which is precisely the integrand the plain ML bound is for, and whose
degree gap is 5 ≥ 2. The same shape is discharged at `n = 4`. A CAP replaces the list and is the same
guarantee: two distinct rationals with denominators at most 12 differ by at least 1/144, so a `1e-12`
window admits one candidate or none, and every fraction the list held has denominator ≤ 12. The row
now distinguishes an unreadable sweep from an unsupported integrand, because sending a reader to
inspect the one thing that was fine is worse than saying nothing. **The third is the sharpest:** CATCH
read `poles.exactlyComplete` — *was every pole pinned?* — where the claim beside it is about the SUM.
So D3 at `(a, n) = (2.3, 5)` has printed the exact closed form `(π/5)/sin(23π/50)` beside "not every
residue is known exactly, so the total is an estimate" **since M4.2e**, which is exactly what the
cyclotomic route exists to deny. F1 would have been the third such record.

**A fold may COMBINE a radical; it may never INTRODUCE one.** At `n = 3` the sine recogniser leaves
`(1/6 + i√3/6)·e^{−iπ/3}` — a product that is exactly `1/3`, in the very extension the coefficient is
already using — and the fold took only `e^{iπr}` with `2r ∈ ℤ`, so F1's flagship fixture printed a
decimal and no closed form at all. Folding every representable root of unity fixes it and breaks two
other things, which is how the rule was found: D7's residue-at-infinity row became
`17√2/8 − 17i√2/8` where `17/4·e^{−iπ/4}` is the same number with its magnitude of 4.25 visible — and
that row exists to say `2π·4.25 = 26.7` in an answer of 1.216. So the caller passes the coefficient's
own radicand and a root needing a different one is CARRIED, which subsumes the collision question
rather than answering it separately: matching radicands cannot collide. `asAlgebraicFactor`, asked in
the abstract with no coefficient to match, keeps refusing.

**What F1 is for.** All four fixtures then print `(π/n)/sin(π/n)` by two routes the record cannot tell
apart — which is the strongest statement that the fallback is a route to the same answer and not a
second answer. And `2π/(3√3)` is ALSO D3 at `(a, n) = (1, 3)`, computed by a keyhole with a branch
cut along `[0,∞)`, a `z^{a−1}` monodromy and a `−e^{2πia}` phase, where F1's wedge has no cut at all.
D3 REFUSES there — its phase collapses to `0/0` at integer `a` — and its own trap names this record as
the repair, so the pair is a working relationship rather than a coincidence: the value stands, the
keyhole's derivation does not, and the wedge's does. The record declares no `branch` block, and a
test pins that absence, because two arguments agreeing is evidence only while they are actually
different arguments.

**F2 stays deferred with E3**, as M5.3 said: both need ADR-0042's `knownValue`, and doing them
together implements the import set once against two consumers.

### 5.6 Tier G's machinery — **M5.5**, and D-2 executed

M5.5 builds no record. It builds the three things all three G entries share, and it finds that this
document overstates its own finding.

**The square is the first contour with no target piece.** `∮ → 0` IS the result, and the sum being
evaluated sits inside the residue list as the kernel's own poles at the integers — the opposite of
every other family in the gallery. So four `vanish` sides and nothing else is the shape of the
argument rather than an omission, and a test pins the ABSENCE of a target as a positive claim about
the tier. What the rest of the tests pin is the MECHANISM rather than a number that shrinks:
`∮ = 2πi(2·S_N − π²/3)`, so inverting it recovers the partial sum from the engine's own quadrature,
and the residual is then the tail `Σ_{n>N} 1/n²`, bracketed in `(1/(N+1), 1/N)`. That is why `∮ → 0`
is the whole content: the square does not approximate the sum, it differs from it by exactly the
contour integral. A first draft asserted `|∮| < 0.12` at `N = 30` and was simply wrong — the true
value is `≈ 4π/N = 0.41` — which is what a guessed threshold buys.

**The alternation belongs to the KERNEL, and that is the tier's economy.** `π cot(πz)` has residue
exactly `1` at every integer and `π csc(πz)` exactly `(−1)ⁿ`, so `Res(K·f, n)` is `f(n)` or
`(−1)ⁿ f(n)` and G3 costs nothing extra once G1 exists. What the module computes is `f(n)`, exactly
over ℚ(i); what it ASSERTS is the kernel's own residue, with the derivation in the certificate and an
independent contour quadrature as the check — deriving `1` from a limit numerically would be a worse
claim about a better-known fact. Two things are structural: the leading `π` is COUNTED rather than
pattern-matched, because `cot(πz)` has residue `1/π` and an integrand written without it is a
different sum by a factor of π on every term; and a numeric coefficient goes to the COFACTOR, so
`2π cot(πz)/z²` is the kernel times `2/z²`. A COLLISION is named, not summed — G1's `f = 1/z²` merges
with the kernel at `n = 0`, where `Res(K·f, n) = Res(K,n)·f(n)` is not inaccurate but undefined, the
true residue is `−π²/3`, and it lands in ℚ(i)(π) rather than the exponential basis (`π²` has no seat
there, which is the same wall the log families met).

**A hole in LEGALITY closes with it.** `findPoles` reports ZERO poles for `π cot(πz)/(z²+1)` — no
reader in the app sees a transcendental, and reporting nothing is honest. What was not honest is the
row built on top of it: a square at an INTEGER half-width runs its vertical sides exactly through
`z = ±N`, and the ledger said "every singularity is clear of the contour" about a contour passing
through infinitely many. Measured both ways: blind, every LEGALITY row is satisfied at half-width 2;
with the kernel handed over, it refuses. The band is read off the GEOMETRY, which is what makes a
window on an infinite set honest rather than arbitrary — the question is local to the contour drawn.

**The bound, and the half-integers it forces.** `|∮| ≤ 8π·coth(π/2)·(N+½)·max|f|`, exact in ℚ. The
subtle factor is the third: `max|f|` is read at `|z| = N+½` and bounds `|f|` on the whole square,
because dividing the reverse-triangle quotient by `r^{deg D}` leaves the numerator's exponents
non-positive and shrinks the denominator's subtracted sum — a term-by-term inequality using only
`|z| ≥ h`, with no monotonicity of `|f|` assumed. `coth(π/2) = 1 + 2/(e^π − 1)` is bracketed from a
certified LOWER bound on `e^π` (`e^x ≥ Σ x^k/k!` at `piLower()`), and both truncations push the same
way — the only direction a bound may err. It **refuses** a half-width that is not `N + ½` by name. That ENFORCES what
`limitParams[].through = "halfIntegers"` declares — but from the GEOMETRY, not from the field, which
is still unread. The distinction is worth keeping: a check on the geometry catches a contour the user
has dragged, which a record's declaration cannot, so this is the stronger of the two and not a
substitute waiting to be replaced.

**D-2, executed rather than described — and a correction to the correction.** Research 03 §8's
`(M/N^k)·coth(π/2)·4(2N+1)` drops the `π` from `π cot(πz)`, and is then not a bound: 3.392 against a
measured 3.567 at `N = 3`, 0.356 against 0.493 at `N = 25`, both recomputed from the engine's own
quadrature. **§6 above says it fails "by 30–40 % at every `N` tested", and that is wrong.** Measured,
the shortfall is **4.9% at `N = 3` and 27.8% at `N = 25`**, and it GROWS — because the ratio between
the two bounds is exactly `π·(N/(N+½))^k`, the missing π times a factor tending to 1. So 30% is the
ASYMPTOTE, not the typical case. The finding itself is untouched: at every `N` the stated quantity is
below the thing it is supposed to bound, which is what makes it not a bound. Only its magnitude was
overstated at small `N`.

Two findings about the arithmetic came with it. The ledger spent **3.1 seconds per square side
recomputing a constant** — `piLower()` is accurate to far more digits than a 40-term series needs, and
`x^40/40!` over it produces thousand-digit BigInts; truncating π to 20 digits (downward, so still a
lower bound, so still sound) and memoising took the suite from 88 s to 2.7 s, and the bracket is still
above the truth by 2.5e-22. And that tightness broke the first test, which compared `toNumber()`
against `1/Math.tanh(π/2)`: the nearest double to `coth(π/2)` is ABOVE both the true value and the
bracket, so the assertion was testing float64's rounding. M5.2's `piUpper().toNumber() === Math.PI`
again, with the same fix — compare in ℚ.

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

### 5.0e A4: no residue of its own, and the answer is still 2π

`g(z) = e^z` is entire. The singular set of the integrand *as posed* is empty, the pole finder
correctly returns nothing, and Cauchy's theorem correctly reports `∮ g dz = 0` — all true, all
irrelevant. What is being integrated is `g(z)·(dz/(iz))`, and **the Jacobian supplies the only pole
there is**. Its residue is `g(0)/i`: the Cauchy integral formula, equivalently the mean-value
property of a harmonic function over a circle.

With the index `n` exposed it becomes CIF *for derivatives*: `Res(g(z)/z^{n+1}, 0)` is the `n`-th
Taylor coefficient of `g`, so `e^z/(i z^{n+1})` has residue `−i/n!` and the value is `2π/n!` —
verified at `n = 0, 1, 2, 3, 5`. What it teaches is the fact A1 and A3 have been circling: **residue
selection operates on the CONTOUR integrand, and its singular set differs from the posed integrand's
whenever the substitution has a Jacobian.**

A4 was the last of the thirteen to load, and the reason is worth recording. Its residue needs the
series of an ENTIRE function, not the rational machinery — and the three steps are exactly the ones
`exactResidue.ts` already took for a rational `f`: `splitOrder`, `seriesInverse`, `seriesMul`, all
`@cas/exact`'s. The only thing added was the expansion of `e^{λw}` itself. The exponent coefficient
`λ` also had to widen from `i·a` to a general Gaussian rational, because A4's is `1`, not imaginary;
the algebra is closed either way and only the ARC BOUNDS care, so `imaginaryFrequency` is where they
ask — and correctly refuse `e^z` on an arc, where it grows along the real axis.

### 5.0d C3: two singularities of different kinds in one ledger

`e^{iz}/(z(z²+b²))` has a simple pole **on** the contour at 0 and a simple pole **inside** it at `ib`,
and both must be accounted — by different mechanisms, with different weights:

```
n(γ, 0)  = 0   and an L4 contribution of   −iπ·Res(f,0)  = −iπ/b²
n(γ, ib) = 1   and a residue contribution of  2πi·Res(f,ib) = −iπe^{−b}/b²
```

They differ by **exactly a factor of two**, which is why the record warns that a hand-chosen sign
here is indistinguishable from a winding-number error. Three poles, three different winding numbers,
and `(π/b²)(1 − e^{−b})` needs all of it.

**Gap G6 is closed.** C3 is posed as a principal value, and the record calls that "correct but
inherited": `∫cos x/(x(x²+b²))` diverges at the origin so the AUXILIARY needs one, while the target
`sin x/(x(x²+b²))` is removable at 0 and `O(x⁻³)` at infinity and so converges absolutely — its p.v.
*is* its value. A boolean on the target cannot carry that. The target's three-state `convergence` plus
a new `auxiliary.principalValue` says both at once, which is what the record's
`pv-claimed-of-the-target` trap asks for.

### 5.0c C2 is the same π, moved

C1's reflex is to indent whatever sits on the contour. **C2 is where that reflex is wrong**, and the
engine earns it: the numerator of `(1 − e^{iz} + iz)/z²` vanishes to order 2 at the origin — exactly
matching the denominator — computed by an exact Taylor expansion. That is decidable *at the origin
only*, because `e^{ia·0} = 1` is a Gaussian rational; about any other point the constant `e^{iar}`
appears and whether such a sum vanishes is a transcendence question, so it refuses there.

The auxiliary was built by subtracting the principal part `i/z` to make the origin removable — and
subtracting a principal part does not DELETE that term, it **moves its contribution onto the large
arc**. There `z·f(z) → i`, not 0, so **L5** — not L2, not Jordan — returns `iα·L = iπ·i = −π`. C1's
indentation pays `−iπ·Res = −π` and C2's arc pays `iπ·L = −π`: the same π, different piece, and both
land the target on π/2. The test asserts they produce the identical `−1` in units of π.

Two things this needed. `(1 − e^{iz} + iz)/z²` is a **sum** of exponential terms, which the tier-B
single-factor reader cannot see, so `asExponentialSum` reads `f` as `(Σ Nₖ(z)e^{iaₖz})/D(z)` — and
that one decomposition serves both the removability test and L5's limit. And **L5 is declared, not
inferred**: the degree test that would pick L2 is exactly the one that fails here, so guessing would
pick the wrong lemma and silently return 0. When L5 is *not* declared the engine declines the arc
rather than claiming a bound, which is what stops the 0 being printed — that refusal is tested.

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
