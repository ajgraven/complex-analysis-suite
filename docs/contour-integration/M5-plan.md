# M5 — the rest of the taxonomy: a staging plan

> Read [`PLAN.md`](PLAN.md) §7 (the milestone table) and [`gallery/tier-efg.md`](gallery/tier-efg.md)
> first. The eight remaining records are the *specification*; §10 of that file is the *work*.
>
> Same shape as [`M4-plan.md`](M4-plan.md): the slices below are ordered by which machinery each
> record needs, each is a shippable point, and the findings sections are written as each lands.

**Scope:** E1–E3, F1–F2, G1–G3 → **all 28 records**, plus the two edges M4 left.
**Gate (PLAN §7):** all 28 gallery integrals; the cross-family invariants (§8) green.

---

## 0. The finding that shapes this plan

**The eight records are not the work.** `tier-efg.md` §10 already did the analysis and recorded
**six schema gaps** (§10.2) and **four errors in research 03's lemma statements** (§10.1). Two of
those errors are guardrail-critical, one is a decision (now [ADR-0042](../DECISIONS.md)), and one is
a unification worth having:

| | what it is | why it matters here |
|---|---|---|
| **D-1** | **L6's arc range is wrong as written.** §0.3 states it for `e^{−zⁿ}` on `θ ∈ [0, π/n]`, where `cos nθ < 0` and the integrand GROWS — the stated majorant diverges (measured `2.7×10¹⁵` at `n=2, R=6`; float overflow at `n=4`). | Tier F cannot be built on it. Correct: `e^{−zⁿ}` on `[0, π/(2n)]` with bound `π/(2nR^{n−1})`; `e^{izⁿ}` on `[0, π/n]` via **Jordan's** `sin φ ≥ 2φ/π`. |
| **D-2** | **The square-contour bound drops a `π`, and is not an upper bound.** Measured against the true value it **fails at every `N` tested, by 30–40%** (`N=3`: bound 3.392 vs actual 3.567; `N=25`: 0.356 vs 0.493). | Printing it is exactly PLAN §9 R2's *certification theatre*. The derived `8π coth(π/2)·M·(N+½)^{1−k}` holds at all four with ~2.2× slack. |
| **D-3** | **The `k = 1` failure is overstated.** The square integral *does* decay; what fails is (a) the bound, which is `O(1)` and establishes nothing, and (b) absolute convergence — only `lim_N Σ_{|n|≤N}` is delivered. | Needs SG-4's `convergenceClass: "symmetricSum"` rather than a refusal. |
| **—** | **L6 and Jordan's L3 are the SAME inequality** under `φ = π/2 − ψ`, verified identically on 5001 points. | Two of the eight catalogued lemmas share one side condition, and **one predicate should discharge both.** |

And one fact to plan around rather than discover: **tier E–G's `=` labels are claims, not results.**
§10.3 is explicit — "no entry's **exact** path was exercised; every number above is float64", so the
labels "remain `?` until the exact residue and exact ML machinery of M2/M3 exists". Expect some
records to land on an honest `≈`. That is an outcome, not a failure.

### What already exists, verified against the repo

| | status |
|---|---|
| `reproduces` role | **exists** — `PieceRole` has it, and D1's keyhole uses it. Tier E's quasi-periodic strip is its second consumer. |
| `rectangleTemplate` | **exists** (`engine/contour/templates.ts`). |
| `wedge`, `square` templates | **missing.** |
| `LemmaId` L1–L8 | declared in the type; the ledger discharges **L1, L2, L4, L5** only. **L6 is unimplemented** (L7, L8 too). |
| A declared-determination evaluator | **exists** since M4.7c — `kernel/branch/declared.ts`. This is what M5.0 spends. |

---

## 1. The slices

### M5.0 — the two edges M4 left · *S* — **DONE**

[`GALLERY.md`](GALLERY.md) §5.2 named them. They were one gap: **`side` was declared, validated and
never honoured**, so research 06 §3.3's *"don't offset the contour; offset the branch"* was specified
and unbuilt — and **consequently the quadrature cross-check was skipped for all seven tier-D
records**, leaving tier D the one tier whose values had no independent numeric corroboration.

- **M5.0a** — `evaluateDeclared` takes a `side`: a point exactly on the cut takes `θ₀` or `θ₀ + 2π`,
  which is the C99-signed-zero idea as a data field. Then a declared-determination `f` for a branch
  record, alongside the compiled principal one.
- **M5.0b** — hand `analyse` that evaluator for a branch record and **drop the skip**. Seven records
  gain the corroboration the other thirteen already have, and `side` becomes load-bearing instead of
  merely required.

**Why first:** small, spends machinery that exists, and closes a stated evidence gap on *shipped*
work. A cross-check that has never run over seven records usually finds something — and that finding
would be about M4, so it is worth learning before M5's records are built on the same engine.

**Gate:** D1–D7 each report an agreeing quadrature; a deliberately mis-declared `side` makes the
cross-check *disagree* (which is the test that the tag is honoured rather than merely read).

> **Outcome.** Both parts landed as planned, and the gate is met on all seven records: each reports
> an agreeing quadrature, and integrating with both lips forced to `"above"` — the pre-M5.0
> cancellation — lands **more than 10× further** from the exact value. `Analysis` now hands back the
> `sides` it used, so the accumulation panel draws the same head-to-tail sum the quadrature
> integrated instead of recomputing them and risking a picture that contradicts its own number.
>
> Four things the plan did not anticipate, all in [`GALLERY.md`](GALLERY.md) §5.2.1:
>
> 1. **The cross-check found nothing wrong, and the reason it still earned its place is a ratio.**
>    Tier D's gap is **1e-3…1e0**, four orders looser than tiers A–C's 1e-14, because a lip carries
>    an endpoint singularity that Gauss–Legendre converges slowly against. So what the suite pins is
>    that the disagreement stays within a small multiple of the quadrature's *own* error estimate —
>    it is within ~1.5× on every record. A flat tolerance loose enough to pass would have asserted
>    nothing at all.
> 2. **One skip survives, narrower and better.** A side pins no limit where the cut runs *vertically*
>    through the piece: "above" displaces **along** it, `arg` does not move, and `atan2` picks a limit
>    by coin toss. `sideResolves` asks per record rather than assuming; no record is in that shape,
>    and one that were would be refused **by name**.
> 3. **The cross-check had to be wired into two more theorem routes.** `branchTheorem.ts` and
>    `logTheorem.ts` had never called `checkAgainstQuadrature` at all — there had been nothing to
>    compare against, so the comparison was simply absent, and dropping the skip alone would have
>    produced a quadrature nothing read. Only D6/D7 (the exterior route) reported one before this.
> 4. **Three test suites asserted the OLD behaviour**, and inverting them is the honest record of the
>    change: `familyGolden.test.ts` forked on `family.branch !== undefined` and that fork is now
>    **gone**, which is the real payoff — an uncorroborated record can no longer hide behind a
>    special case.
>
> 5. **`FamilyRun.f` changed meaning, and one suite had been relying on what it used to be.** It was
>    the compiled AST; `declaredProduct.test.ts` read that as "the principal determination" — true by
>    accident. Now that `f` is the DECLARED evaluator for a branch record, both halves of that
>    suite's central claim compared a function with itself: **"differs below the cut" went red, and
>    "agrees above the cut" passed VACUOUSLY.** The vacuous half is the one worth remembering. The
>    fix names `makeComplexFn(run.ast)` explicitly rather than borrowing whatever `f` means.
> 6. **The mutation sweep was unsound, and being unsound is what found items 1–4 of this list.** Its
>    first pass reported 16/16 killed while nine tests were already red on the clean tree, so "a test
>    failed" was true of every run including the unmutated one. Re-run against a verified-green
>    baseline: **13/17**, four real survivors, two new tests, then **16/17** with the last recorded as
>    equivalent (`sideResolves`' first clause is redundant *at* `1e-30` and kept because it is the
>    question being asked). Lesson for later slices: a sweep must assert its baseline is green, not
>    merely grep the output for "failed".
>
> The two tests those survivors bought are the strongest in the slice: a mis-declared side drops the
> **verdict** from `=` to `⚠` on all seven records (the contradiction certificate reaches the verdict,
> so the app cannot print an exact value beside a quadrature that denies it), and the accumulation
> trail tracks the integral **4.7× to 441×** better with the sides than without — which is the
> *picture* being in the determination the *number* is in, not just the number being right.
>
> The sandbox is *not* covered: it can declare cuts but not a branch FACTOR, so its quadrature stays
> in the principal determination whatever its lips say. Nothing regressed there and nothing improved;
> `AnalysisInput.f`'s doc names the gap, and M5.1 closes it.

### M5.1 — the sandbox declares a branch factor · *M* — **DONE (a–d)**

The sandbox's editor declares branch points, exponents and cuts — **not the factorisation.** So the
cut system reaches LEGALITY and the picture, and no sandbox value depends on it: `analyse` takes the
rational route and there is no `z^α` whose determination a residue could be read in.

That single absence is the root cause of **both** of M4's open items:

- PLAN §7's M4 gate clause *"dragging a cut across the contour **changes the answer**"* — half
  delivered (it says so, naming the factor; the complementary invariance is certified) because no
  sandbox answer can change.
- Research 06 §5.3's **sheet spinner**, deferred in M4.7d for the same reason: `sheet: s` has nothing
  to multiply.

Let the sandbox declare `c · ∏ⱼ (sⱼ(z − bⱼ))^{αⱼ} · R(z)` — the exponents are already per-point, so
what is new is the constant, the orientation, the per-factor window and the cofactor. Then moving a
cut moves `argRange`, moves the residues, and **changes the answer** — which is D1's entire trap,
reachable by hand for the first time. The sheet spinner follows: one integer, one spinner, one badge.

**Gate:** north-star #3 verbatim in the sandbox — drag a cut, nothing changes; drag it across the
contour, the answer jumps by the monodromy factor and the app says so. `BranchChoice.sheet` stops
being carried-unread.

> **CORRECTION (M5.1b): the second half of that gate cannot happen, and M4.7d's own result is why.**
> `∮` comes from `2πi Σ n·Res` with residues read in the declared WINDOW, and `powerAtPole` takes no
> geometry at all — so no deformation of a cut, crossing or not, can move the value. Measured:
> swinging the ray across the contour leaves D1's `2πi·e^(−7iπ/10)` **bit-identical** and fails
> LEGALITY, which names the piece and the cut. That is not a shortfall; it is the invariance M4.7d
> certified, arriving as a property of the call graph.
>
> The jump is real and belongs to the **determination**. Change the window and the pole's argument
> moves a full turn, so the answer jumps by exactly `e^{−2πiJ}` — asserted to twelve decimal places,
> with `J` the number already printed on the cut. In the browser: `∮ = 2π` at `arg ∈ [0, 2π)`, and
> `⚠ −2π` at `arg ∈ [−π, π)` with LEGALITY refusing, which is D1's `wrong-branch` trap reachable by
> one dropdown.
>
> **The gate as it should read:** drag a cut clear of the contour and the value is bit-identical;
> drag it across and the value is WITHHELD, with the crossing and its factor named; change the
> determination and the value jumps by the monodromy factor. All three are asserted in
> `test/declaredRun.test.ts`.
>
> **M5.1d (the sheet spinner) is done, and `BranchChoice.sheet` is read at last.** It needed no new
> machinery: **a sheet is a whole-turn offset of the declared window**, `[lo + 2s, hi + 2s]`. The
> residues then pick up `e^{2πisα}` exactly because `powerAtPole` reads the window; a LOG shifts
> ADDITIVELY instead, for free, with no branch anywhere in the code — which is the test that this is
> the right mechanism rather than a convenient one; the cut does not move; and the window stays one
> turn wide, so M5.1a's invariant is untouched. Verified in a browser at α = −1/2: sheet 1 turns
> `∮ = 2π` into `−2π` (`e^{−iπ}`), sheet 2 back to `2π`, with the badge naming the factor.
>
> Two details the slice forced. The geometry is computed from the window edge **reduced modulo whole
> turns**, because `Math.sin(6π)` is `−7.3e-16` and not `0` — the difference between "a sheet does not
> move the cut" being true and being true to rounding, and it drifts further the higher the sheet.
> And the convention LABEL is read modulo turns too, or sheet 1 of `[0, 2π)` would be called "custom"
> and a bookkeeping integer would have invented a third argument convention.

### M5.2 — one predicate for two lemmas, and the corrected L6 · *S–M* — **DONE**

The maths prerequisite for tier F, and a correction to the research.

- `cos φ ≥ 1 − 2φ/π` (L6) and `sin ψ ≥ 2ψ/π` (L3, Jordan) are **the same inequality**. One predicate
  discharges both; the engine should not have two.
- **The corrected L6**, both halves: `e^{−zⁿ}` on `[0, π/(2n)]` with `π/(2nR^{n−1})`, and `e^{izⁿ}` on
  `[0, π/n]` through Jordan. Certified in exact ℚ like every other bound, with the existing certified
  π brackets.
- Record D-1 against research 03, with the measured divergence, so the wrong statement cannot be read
  back out of the research and re-implemented.

> **Outcome.** All three landed. `kernel/bounds/linearMinorant.ts` is the predicate,
> `kernel/bounds/wedgeArc.ts` the bound, and the ledger routes an `e^{±zⁿ}` arc to it — which it had
> to, because before this such an arc reached **no lemma at all**: Jordan's reader wants a linear
> exponent and the exact rational reader refuses a `call`, so KILL reported "no lemma here applies"
> for the one integrand L6 exists for. The wedge TEMPLATE is still M5.4; the routing is exercised now
> through hand-built sectors rather than shipped as code nothing calls.
>
> Five things worth carrying forward, in [`GALLERY.md`](GALLERY.md) §5.3 in full:
>
> 1. **What the shared predicate decides is the SIDE CONDITION, not the inequality.** `sin ψ ≥ 2ψ/π`
>    is a theorem about concavity and no arithmetic here could establish it; whether the range asked
>    about lies inside `[0, π/2]` is decidable in exact ℚ — and that is exactly the half research 03
>    got wrong. A predicate that merely *named* the inequality would have shared a sentence.
> 2. **The two faces part company past `π/2`, and that asymmetry IS D-1.** `sin` folds by
>    `sin ψ = sin(π − ψ)` and costs a factor of two; `cos` changes sign and costs everything. The
>    research applied the sin face's tolerance to the cos face's integrand, which is now not
>    expressible rather than merely corrected. In the app the two are two ledger rows on one wedge.
> 3. **Two ranges are quoted for the oscillatory form and both are right** — research 03 §0.3's
>    `[0, π/(2n)]` is the wedge Fresnel uses, `tier-efg.md` §10.1's `[0, π/n]` the largest on which
>    the form still vanishes. The engine quotes neither and reads the arc's range off the geometry, so
>    the difference surfaces as the constant rather than as a disagreement between two documents.
> 4. **Jordan is this bound at `n = 1`** — both return `π/|a|` on a semicircle, asserted in ℚ. The two
>    bound functions stay separate (Jordan carries a rational cofactor's `max|g|`; the wedge carries
>    none), which is ADR-0007's merge rule read in the direction it is usually not.
> 5. **A uniform quadrature is not good enough to check this bound.** `e^{−κh}` is a spike of width
>    `1/κ`, and `κ` reaches 65536: a 40001-point uniform Simpson rule measured 2.1e-4 where the true
>    majorant is 1.2e-4 and reported a **correct** bound as violated. Textbook adaptive Simpson never
>    terminated. A mesh graded toward both endpoints does it in 20001 points and needs no case
>    analysis about which end the spike is at — and the two faces put it at different ends.
>
> Sweep 20/21, one recorded equivalent. Both real kills were about GEOMETRY rather than the
> inequality: reading a sector's start angle as `0` certifies `π/(4R)` for the clockwise arc
> `[π/2 → π/4]`, where the integrand reaches `e^{+R²}`, and a degenerate extent makes the plain ML
> bound `0·π·R·max|f| = 0` — a `≤ 0` on an arc whose integral is small and non-zero. The first
> initially survived a test that refused under the mutant anyway (the range check fired first), which
> is the lesson: a test can pin the outcome without pinning the reason.
>
> **Not done here, and not silently:** D-2's square-contour bound is still a document-only correction.
> It belongs with the summation kernel it is about, in M5.5.

### M5.3 — tier E · *M* — **DONE for E1 and E2 (a–d); E3 landed in M5.8c**

- **E1** `∫ℝ e^{ax}/(1+e^x) dx = π/sin(πa)` — the quasi-periodic strip on `rectangleTemplate`, with
  `reproduces` at `λ = e^{2πia}`. Mostly wiring: both pieces exist.
- **E2** `∫ℝ sech(x)e^{iξx} dx = π sech(πξ/2)` — the same machinery, a different `λ`.
- **E3** `∫ℝ e^{−x²}cos(bx) dx = √π e^{−b²/4}` — **the interesting one, and the empty singular set.**
  `e^{−z²}` has no poles at all, so `∮ = 0` and the *entire* answer is the sides. A new ledger shape:
  COVER has nothing to cover, and the argument is carried by the `reproduces` relation alone. Needs
  **ADR-0042's `knownValue`** (the top side is the Gaussian) and **SG-3** (the rectangle's orientation
  flips with `sign(b)`; reduced by evenness here, and the record says so).

> **Outcome — and "mostly wiring" was wrong, measured before anything was written.** `findPoles` on
> `e^{0.3z}/(1+e^z)` reported `rational: false` and **zero poles** — the same answer it gave for
> `1/cosh z`, which has infinitely many, and for `e^{−z²}`, which genuinely has none. So E1 and E2
> had no residue to take, and E3's `poles: []` was true by accident. That inverted the plan's
> ordering: deciding entirety is the PREREQUISITE for trusting a pole list, not the last slice.
>
> Four slices landed, each its own commit:
>
> - **M5.3a — entirety is a DECISION, not silence.** `kernel/entire.ts` decides it structurally and
>   `PoleReport.entire` carries it. The condition is SUFFICIENT and the type is shaped so a refusal
>   cannot be read as a claim: `sin(z)/z` is entire and refuses, and each refusal names which of
>   three walls it hit. Two wording defects fell out — the pole card said "no poles are claimed"
>   about an entire integrand, and the ledger's CATCH row gave an UNCONDITIONAL reason ("some poles
>   are not expressible in ℚ(i)(√d)") for `1/cosh z`, a difficulty it never reached.
> - **M5.3b — the strip's poles and residues.** `w = e^z` makes both integrands rational, the poles
>   become vertical LATTICES, and `polesInStrip` takes the band because a list of infinitely many is
>   not a list. Exactness rests on one stated restriction — each root of `D` is a root of unity — so
>   `log ρ = 2πi·q` exactly and the residue lands in M4.2's basis with **no new number field**.
> - **M5.3c — a vanishing SEGMENT, and E1's window DERIVED.** `disposeArc` declined anything that was
>   not an arc, so a rectangle's verticals reached no lemma at all. L1 on a vertical side gives
>   `κ = Re(a) + deg N − deg D` on the right and `−Re(a) − ord₀N + ord₀D` on the left — which read
>   `a < 1` and `a > 0`, the record's "one condition, two jobs", out of the geometry rather than
>   declared beside it. E2's "no condition at all" is the same expression at `Re(iξ) = 0`.
> - **M5.3d — the records, and a SECOND denominator shape.** `1 − λ` factors as a sine when λ is on
>   the unit circle and as a **hyperbolic cosine** when λ is a negative real — and E2 exists to teach
>   that λ can be negative. The sine recogniser refused E2 by name; `sineForm.ts` now carries both,
>   its one-rule warning spent deliberately. A cosh cannot degenerate (it vanishes only at an
>   imaginary argument), which is E2's "unconditionally well-posed" claim as a property of the
>   factoring rather than a range check.
>
> **The sharpest bug of the arc: a right value under a wrong form.** `solveTarget` rebuilt the solved
> form field by field and carried only `sine`, so E2's VALUE divided by the cosh while its TEXT did
> not — every fixture printed `π` for numbers that were 0.271, 1.252 and 0.590. Spreading instead of
> rebuilding fixes it and makes the class impossible for the next field. The `|γ|` normalisation kept
> as an equivalent mutant is insurance against exactly the same shape.
>
> **E3 is deferred, and not silently.** It needs ADR-0042's `knownValue`, which is decided and
> unimplemented — and **F2 needs the identical machinery** for `Γ(1+1/n)`. Doing them together
> implements the import set once against two consumers instead of once against one, which is this
> repo's own extraction rule pointed at a schema field. SG-3's canonical-range reduction rides with
> it. The plan's `M` sizing was low throughout: a–d were each engine work of M4.5's weight, and only
> d was the wiring the plan imagined.

### M5.4 — tier F · *M* — **DONE for F1 (a–d); F2 landed in M5.8d**

- The **wedge** template.
- **F1** `∫₀^∞ dx/(1+x³) = 2π/(3√3)` on the `2π/3` wedge, plus its `closing-the-other-way` invariant
  — currently a specification with no result (§10.3).
- **F2** `∫₀^∞cos(x²)dx = √(π/8)` — *"the bound everyone hand-waves"*. M5.2's corrected L6 at `n = 2`,
  ADR-0042's `knownValue` for the return ray's `Γ(1+1/n)`, and **SG-4** (`convergenceClass:
  "conditional"` — `∫₀^∞|cos x²|dx = ∞`, and research 03 §3 trap (ii) says the label must record it).

> **Outcome — F1 lands, and the slice is mostly about what it broke.** Three slices, each its own
> commit, and the pattern of M5.3 repeated: measuring first reordered them.
>
> - **M5.4a — the wedge, and a coefficient that is a parameter.** `wedgeTemplate` takes `n`, never an
>   angle, so "the angle must be exactly `2π/n`" is unrepresentable rather than checked. **The affine
>   `Scalar` did not cover it**, and `model.ts`'s own doc claimed it covered every template in the
>   gallery: the return ray's endpoint is `R·cos(2π/n)`, a product of two parameters. `derived` is
>   evaluated before the limit parameters exist, deliberately, and computed afterwards would freeze at
>   instantiation — leaving the ray behind while the arc followed a drag, silently opening a contour
>   the ledger had just certified closed. So `mul` may name a parameter, and the form stays affine in
>   every LIVE one.
> - **M5.4b — a residue theorem where no individual residue exists.** `1/(1+zⁿ)` has exact poles at
>   `n = 2, 3, 4` and none at `n = 5, 7`. D3 answered that for a KEYHOLE (every root once); a wedge
>   encircles ONE, so `cyclotomicResidueSum` became `Σ n(γ,zₖ)·Res` with the sum a wrapper. It is a
>   FALLBACK on purpose — the per-pole route returns `2π/(3√3)` where the structural one returns
>   `π/(3·sin(π/3))`, the same number carrying a transcendental it does not need. Two rows were false
>   on the way: `2π/5` was not in the angle whitelist, so KILL blamed the INTEGRAND for a geometry
>   failure (a cap replaces the list, with the same uniqueness guarantee); and CATCH asked "was every
>   pole pinned?" where the claim is about the SUM — so **D3 at `(a,n) = (2.3, 5)` printed the exact
>   `(π/5)/sin(23π/50)` beside "the total is an estimate" from M4.2e until now.**
> - **M5.4c — F1, and a fold that combines without introducing.** At `n = 3` the sine recogniser
>   leaves `(1/6 + i√3/6)·e^{−iπ/3}`, exactly `1/3`, which the old fold could not take — so the
>   flagship fixture printed a decimal. Folding every representable root of unity fixes that and
>   breaks D7's residue-at-infinity row, which became `17√2/8 − 17i√2/8` where `17/4·e^{−iπ/4}` shows
>   the magnitude of 4.25 the row exists to state. **A fold may COMBINE a radical the coefficient
>   already carries, never INTRODUCE one** — which subsumes the old collision worry rather than
>   answering it separately. `unitRoot` moved to its own module on the second-consumer rule, by which
>   time there were three.
>
> All four fixtures print `(π/n)/sin(π/n)`, by two routes the record cannot tell apart. The gallery
> writes the `n = 3` value `2π/(3√3)`; that is the same number, and the engine's normal form is the
> family's own closed form — nothing simplifies a sine into a radical, and the `n = 5` and `n = 7`
> fixtures could not be written that way at all. Its three gallery invariants are executed: the
> cross-provenance against D3, the `u = xⁿ` substitution (under which the wedge's `0 < a < n` IS the
> Mellin fundamental strip `0 < s < 1`), and closing the other way.
>
> **F2 is deferred with E3, as M5.3 said.** Both need ADR-0042's `knownValue` — F2's return ray for
> `Γ(1+1/n)`, E3's top side for the Gaussian — and doing them together implements the import set once
> against two consumers. SG-3 and SG-4 ride with it.

### M5.5 — the summation kernel, the square, and the corrected bound · *M* — **DONE (a–c)**

- The `πcot`/`πcsc` kernel pair.
- The **square** template — and `limitParams[].to` able to say **"through half-integers only"**, which
  is not cosmetic: it is the constraint that refutes *"the square may be taken at any radius"*, one of
  the tier's two real traps. *(Stale as written: `limitParams[].through` was added to the schema
  before this plan's M5.5 was reached, so the gap was never "unrepresentable" — it was declared and
  unread. And the SG-5 attribution is the gallery's own overloading: §10.2 defines SG-5 as the G
  tier's target being a SUM rather than an integral, which is M5.7's.)*
- **The corrected square bound** `8π coth(π/2)·M·(N+½)^{1−k}`, with D-2 recorded: the research's
  version is not an upper bound and printing it would be certification theatre.

> **Outcome — three slices, and the slice found that this plan's own source overstates a finding.**
>
> - **M5.5a — the square.** The first contour in the gallery with NO target piece: `∮ → 0` is the
>   result, and the sum sits inside the residue list as the kernel's poles. Its tests pin the
>   MECHANISM — `∮ = 2πi(2·S_N − π²/3)`, inverted to recover the partial sum from the engine's own
>   quadrature, with the residual then the tail bracketed in `(1/(N+1), 1/N)`.
> - **M5.5b — the kernels, and a hole in LEGALITY.** Residue exactly `1` and exactly `(−1)ⁿ` at every
>   integer, the alternation the KERNEL's rather than `f`'s. The leading `π` is counted rather than
>   pattern-matched, a numeric coefficient goes to the cofactor, and a COLLISION is named rather than
>   summed (G1's `1/z²`, whose merged residue lands in ℚ(i)(π) — M5.7's). And `findPoles` reports zero
>   poles for a `cot` integrand, so a square at an INTEGER half-width ran its sides through `z = ±N`
>   while the ledger said every singularity was clear. The band is read off the GEOMETRY, so a
>   contour that moves gets a new window on the same recompute.
> - **M5.5c — the bound, and D-2.** `8π·coth(π/2)·(N+½)·max|f|` exact in ℚ, with `max|f|` read at
>   `|z| = N+½` bounding `|f|` on the whole square by a term-by-term inequality rather than any
>   monotonicity, and `coth(π/2)` bracketed from a certified lower bound on `e^π` with both
>   truncations erring upward. The bound **refuses** any other half-width by name, which ENFORCES
>   what `through: "halfIntegers"` declares — from the geometry, not from the field, and stronger for
>   it (a dragged contour is caught too). **The field was still unread at M5.5** *(re-measured 2026-09-20: M8 step 3.2 gave it two
>   readers in `src/families/instantiate.ts` — it clamps the limit range to `MAX_SERIES_N` and
>   emits `admits: "integers"`)*, and SG-5 proper (the G
>   tier's target is a SUM, not an integral) is untouched and stays in M5.7.
>
> **D-2 executed, and corrected.** Research 03 §8's bound reads 3.392 against a measured 3.567 at
> `N = 3` and 0.356 against 0.493 at `N = 25` — not a bound. But `tier-efg.md` §6 calls that "30–40 %
> at every `N` tested", and measured it is **4.9% at `N = 3` and 27.8% at `N = 25`**, GROWING: the
> ratio between the two bounds is exactly `π·(N/(N+½))^k`, so 30% is the asymptote. The finding stands;
> its magnitude was overstated at small `N`, and the spec is corrected in place.
>
> Two arithmetic findings: the ledger spent 3.1 s per square side recomputing a CONSTANT (`piLower()`
> is far more precise than a 40-term series needs, and `x^40/40!` over it makes thousand-digit
> BigInts), and the resulting bracket is so tight that comparing it to `1/Math.tanh(π/2)` tests
> float64's rounding rather than the arithmetic — M5.2's `piUpper().toNumber() === Math.PI` again.
> Sweeps: 7/7, 15/15, 14/15 (one recorded equivalent).

### M5.6 — SG-1: the unknown inside `S` · *M–L*

**The largest gap in the file**, and the one that makes tier G possible. In the whole G tier there is
**no `target` piece at all**: every side is `vanish`, the left-hand side is identically `0`, and the
target appears among the residues that make up `S`. Pass 5 as written computes `T = (0 − 0 − 0)/1 = 0`.

`residueSelection.targetTerms` (a predicate selecting the poles whose residues *are* the target) plus
`residueSelection.targetWeight`, generalising the solve to

```
T·(1 + Σⱼcⱼ − 2πi·w) + ΣᵢVᵢ + ΣₗFₗ = 2πi Σ_known n·Res
```

`targetWeight` is not bureaucracy: it is exactly the halving bookkeeping research 03 §8 names as **the
tier's commonest error**, promoted from a habit into a value the solve depends on (`1` for two-sided
sums, `2` for one-sided sums of an even summand).

Lands with **G2** `Σ_{n∈ℤ} 1/(n²+a²) = (π/a)coth(πa)`, the clean case.

**Risk, and why this slice is late:** Pass 5's equation is what all 20 existing records flow through.
The generalisation must be a provable no-op for them — so it goes behind the full corpus, and the
whole golden suite is the regression test.

> **Outcome — M5.6a and M5.6b, and the plan's own equation is the thing that turned out to be
> wrong.**
>
> - **M5.6a — `Res(K·f, z₀)` at a pole of the cofactor.** The design question this plan left open
>   (how to name `coth`) dissolved on measurement: with `q = e^{2πiz₀}`,
>   `cot(πz₀) = i(q+1)/(q−1)` and `csc(πz₀) = 2i·e^{iπz₀}/(q−1)`, so both kernels are MÖBIUS
>   functions of one basis element and the value is an exact quotient needing nothing new. `coth` is
>   the *name* of that quotient at `z₀ = ia` — a property of the point, not of the arithmetic — so
>   naming belongs where the answer is formatted and not where residues are summed. `ExpRatio` is
>   that quotient; the `2πi` of the residue theorem CANCELS in this tier because `∮ → 0`, leaving
>   only the kernel's own π. Sweep 10/10.
> - **M5.6b — SG-1, and the generalisation as stated cannot be built.** The equation above,
>   `T·(1 + Σⱼcⱼ − 2πi·w) + ΣVᵢ + ΣFₗ = 2πi Σ_known n·Res`, has a coefficient adding a DIMENSIONLESS
>   number to one carrying π: `1 + Σⱼcⱼ` is a keyhole's `1 − e^{2πiα}`, whose coefficients are
>   `ℚ(i)(√d)`, and that basis has no seat for π while ℚ(i)(π), which does, has none for `e^{2πiα}`
>   — `system.ts`'s standing position that neither ring contains the other. **It is never needed**:
>   `a = 0` is not an accident of tier G but its DEFINITION (SG-1 *is* "there is no target piece"),
>   and `w` is absent everywhere else, so the two halves are never both present. The same argument
>   disposes of `ΣVᵢ`. So the honest build is a third ROUTE with the mixed case refused BY NAME,
>   and what is left is one line: `0 = 2πi[w·T + π·ρ]`, hence `T/π = −ρ/w`.
> - **The weight is derived, then checked.** `Σ_{n∈ℤ}` forces `w = 1` and `Σ_{n≥1}` forces `w = 2`,
>   read off the target's OWN declared range; halving additionally requires the cofactor to be even
>   (`N(−z)D(z) = N(z)D(−z)` as polynomials over ℚ(i)) and its `n = 0` term to vanish — otherwise the
>   identity is `Σ_ℤ = f(0) + 2Σ_{n≥1}` and the weight silently absorbs `f(0)`. All three are
>   decisions, which is research 03 §8's commonest error made arithmetic rather than recorded.
> - **The predicate is a closed VOCABULARY**, not an expression language: the corpus writes two
>   strings, and a parser for two instances would be a language with one consumer. `poles(K) ∩ Z \ {0}`
>   is accepted and then refused with its reason — an excluded integer's residue is `f(n)`, ALGEBRAIC
>   (the kernel's π spent on its own residue `π·(1/π) = 1`), or, where the cofactor also has a pole
>   there, the merged residue lands in ℚ(i)(π). Either way it is the mixed case a third time, and it
>   is why **G1 is a ℚ(i)(π) solve rather than a harder case of G2** — its cofactor `1/z²` has no
>   other pole, so `ρ = 0` and the whole identity lives in that ring. M5.7's shape, stated now.
> - **The no-op is PROVEN, not inferred.** Every one of the 23 records × 79 fixtures was dumped
>   before and after — the loader's violations, `buildSystem`'s field/rank/pivots/determined/kernel/
>   contradictions, every ledger row with its status, claim, evidence level, method and repair, every
>   piece limit, the theorem's `piUnits`, the quadrature's value, and the solve's route, value, text
>   and certificates — 1253 lines, byte-identical. The first attempt was INVALID and worth recording:
>   the harness itself was fixed between the two runs, so the diff measured the instrument.
> - **A survivor that mattered.** Dropping the kernel from `analyse`'s inputs left every test green
>   while reintroducing exactly the hole M5.5b closed — `findPoles` reports zero poles for a `cot`
>   integrand, so the ledger would call a contour clear of the integers it runs through, and the sum
>   route (which reads only LEGALITY and the piece limits) would still return the right number. **The
>   answer being right is not evidence that the ledger is honest**, and that is now asserted directly.
>   Sweep 25 mutants, 24 killed, one recorded equivalent: a global sign on `reflect` cancels because
>   `isEven` uses it once on each side of an equality.
>
> - **M5.6c — G2 loads and solves, and tier G has begun.** Three slices. **(1) the name.** A
>   two-pole conjugate cofactor's residues cross-multiply into exactly `2c·sinh(δ)` over
>   `−4sinh²(γ/2)`, and `δ` is `γ` or `γ/2` — *the two cases being the two KERNELS, not two patterns
>   to search among*, so `cothForm.ts` never sees the kernel and decides by comparing two exponents
>   exactly. `γ = 2πa`, so the halving prints the answer in the parameter the record declared.
>   A hyperbolic form **multiplies** where a sine divides, so it takes its own slot on `SineForm` and
>   `denominatorOf` becomes the single reader the formatter, the number and the argument accessor all
>   go through — the E2 lesson made structural. **(2) the theorem.** `∮` at finite N is
>   `2πi[S_N − T]`, a number the quadrature can be asked about: two routes sharing nothing agree to
>   5.8e-15 at N = 4. No `piUnits`, because the integer residues are algebraic and the cofactor's
>   carry a π. **(3) the record.** All four fixtures print their closed form labelled `=`, the ledger
>   closes, and the engine's quadrature corroborates each.
>
> **SG-1 inverts TWO invariants, and both would have dropped the record.** `rank(M) = m` fails because
> `M` is identically zero for a tier-G contour by construction — and full rank would mean the record
> also carries its target on the contour, the mixed case. And the corpus's *radius-independence* —
> `∮` identical at two widely separated radii — is false here for the same reason it is true
> elsewhere: a summation kernel has a pole at every integer, so more radius adds more POLES, and
> `∮`'s dependence on N is the argument's whole content rather than a defect in it. Asserting
> equality would demand that a partial sum not converge.
>
> **Three rows were saying something false, each found by running it.** CATCH claimed "no individual
> residue is expressible" — the cyclotomic route's sentence, where `ℚ(ζ₁₀)` has degree 4 over ℚ; here
> every residue is written down. The enclosed COUNT was short by exactly the poles carrying the
> answer, because `findPoles` reports none of `1/(z²+a²)`'s any more than it reports the integers' —
> it refuses the whole product, not just the `cot` — so a square dragged onto `±ia` had every
> singularity "clear of the contour" as surely as one dragged onto an integer did before M5.5b. And
> the shell printed "the target is Re of ∮ f dz" about a record whose target is a TERM of the residue
> sum and whose `∮` tends to zero.
>
> **The browser pass found the browser suite itself red**, on a hardcoded `toHaveLength(20)` that has
> been wrong since M5.3d — E1, E2, F1 and G2 each added a record, and the node gate deliberately does
> not run a browser. It is derived from `FAMILIES` now, so the next record cannot make it stale.
> (Verified in Chromium: the GLSL for `pi*cot(pi*z)/(z²+a²)` compiles, the answer reads
> `= (4π/3)·coth(3π/4)`, and the winding list shows `n(γ,±5) = 0` beside `n(γ,±4…0) = 1` — the band
> reaching one integer past the corner, visible rather than asserted.)
>
> Sweeps: 10/10, then 32 mutants with 29 killed, two recorded equivalents (`ExpSum.normalise`
> re-sorts, so orienting on the first term is indistinguishable from orienting on the positive
> exponent; and a contour winding differently about two cofactor poles needs a self-intersection none
> of the templates produces) and **one unreachable branch removed** — a `rank(M) = 0` assertion the
> sweep showed could not fire, since only `target` and `reproduces` pieces contribute a coefficient
> row and the shape check already refuses both.
>
> Still M5.7's: **G1 and G3**, the collision, which is a different RING rather than a harder case —
> `1/z²` merges with the kernel at 0, the merged residue is `−π²/3` in ℚ(i)(π), and G1's cofactor has
> no other pole, so `ρ = 0` and its whole identity lives there.

### M5.7 — SG-5 and SG-6: a sum, and the collision · *M–L*

- **SG-5** — the G tier's target **is not an integral.** `target.variable` is typed `"x" | "theta"`,
  the field is named `integrand`, and `RealIntegral` has the same shape. Needs `kind: "sum"`, an
  integer index and a `summand` — a union at the schema's root, which ripples into the loader's four
  invariants, the derivation panel and the target line in the UI. **Widest blast radius in M5.**
- **SG-6** — `hypotheses[].onFail` has only `refuse` and `warn`, and **G1 and G3 violate their stated
  hypothesis while being completely rigorous**, because a different and stronger argument applies:
  merge the colliding poles. `refuse` is wrong (the answer is correct); `warn` is wrong (nothing is
  uncertain). `onFail: "escalate"` with `escalateTo: "merge-collision"`, whose own preconditions
  (finite merged order; *not* an essential singularity) are then checkable in the normal way, plus
  `residueSelection.collisions[]` carrying the order arithmetic and the mandated Laurent method for
  `m ≥ 3`. The schema's first three-valued hypothesis outcome.
- **G1** `Σ_{n≥1}1/n² = π²/6` and **G3** `Σ_{n≥1}(−1)ⁿ/n² = −π²/12`, with D-3's correct `k = 1` story.

> **Outcome — tier G is COMPLETE, and SG-5 was already done.**
>
> **SG-5 cost nothing.** This plan calls it "the widest blast radius in M5" — `kind: "sum"`, an
> integer index, a `summand`, rippling into the invariants, the derivation and the UI. All of it
> landed with D1's arc and its readers with G2: the schema has the fields, `targetText` branches on
> them, `instantiate` refuses a sum with no auxiliary by name, and the invariants never touch
> `integrand`. Measured before planning, which is why M5.7 is SG-6's alone.
>
> - **M5.7a — the merged residue.** `Res(π cot(πz)/z², 0) = −π²/3`, from the Laurent route DESIGN
>   §6.3 mandates for `m ≥ 3` — and `m = 3` is the first case where it matters, so G1 is the entry
>   that justifies the series layer. What makes it cheap is that the kernel's expansion is EVEN:
>   `1/u + Σ t_k π^{2k} u^{2k−1}`, so reading the `u^{−1}` coefficient of the product picks out
>   `Res = c₀ + Σ t_k π^{2k} c_{−2k}` — only `f`'s constant term and its even negative coefficients,
>   and finitely many. Bernoulli numbers from `Σ C(m+1,j) B_j = 0` in exact ℚ, in-app (ADR-0007).
>   Every value checked twice, the second against a 4096-point circle trapezoid; two tests reach the
>   SECOND Bernoulli number, where the gallery's records never go (`−π⁴/45` for cot, `7π⁴/360` for
>   csc — more than a sign apart, which is the claim `2^{2k} − 2` makes).
> - **M5.7b — a partition, not two refusals.** `cofactorResidues` is the poles where the kernel is
>   REGULAR; at an integer the two merge. Before this both functions refused a collision from their
>   own side, each true of the identity it applies and beside the point. Skipping integer poles by
>   construction made one refusal unreachable, and it was removed. A collision family lives entirely
>   in **ℚ(i)(π)** — `Σ f(n)` is rational and that ring contains it — so `exactInPi` is the seat it
>   already has; with a cofactor pole away from the integers as well, the two halves are incomparable
>   and refused by name on both sides.
> - **M5.7c — SG-6, and the escalation is an OBLIGATION.** The hypothesis "f has no pole at an
>   integer" is SUFFICIENT for the clean form of the theorem and not NECESSARY for the contour
>   argument, so `refuse` stops a correct argument and `warn` flags a certainty. What makes
>   `escalate` more than the permissive third option is that the record must then DECLARE the merged
>   order and residue, and both are falsified against the Laurent route — a record that escalates and
>   declares nothing is dropped, and so is one escalating to a target the engine does not implement.
>   That turns two of G1's own traps into arithmetic.
>
> **The two records differ by ONE number.** Identical cofactor `1/z²`, contour and weight: `π cot`
> gives `−π²/3` at the collision and `π csc` gives `+π²/6`, and halving each is the whole gap between
> `ζ(2)` and `−η(2)`. The alternation is the KERNEL's, which is why `(−1)ⁿ` never appears in a
> cofactor.
>
> Sweep 27 mutants, 27 killed, no equivalents — three survivors, each closed by a test that bought
> something: `f`'s CONSTANT term is part of the residue and every bare `1/z^m` fixture hides that
> (`1/(z²(z²+1))` gives `−1 − π²/3`); a merged residue is weighted by its winding like every other,
> which a clockwise square shows; and a wrong declaration must STOP THE SOLVE rather than only fail
> the checker.

### M5.8 — the invariants that are specifications, and the gate · *S–M* — **DONE (a–e)**

§10.3 lists what was reasoned and never run. Each becomes a result or an honest refusal:

- `F1.closing-the-other-way`, `G2.csc-companion`, `G3.csc-companion-of-G2`, and
  `F2.cos-equals-sin-only-at-n-2`'s `differ` half.
- `ζ(4) = π⁴/90` is asserted from a *measured* coefficient and was never summed independently.
- `G2.a-to-zero-recovers-G1` was checked by evaluating the closed form at `a = 10⁻⁴`, not by a
  confluence argument.

**Gate:** 28 records loaded and executed; the cross-family invariants green; every `=` in tiers E–G
either earned or honestly demoted to `≈`.

> **Outcome — the gate is met, and the gallery is complete.** Five slices.
>
> - **M5.8a — the invariants, run, and THREE OF THEM ARE ONE IDENTITY.** `(π/a)coth(πa) − 1/a² =
>   Σ_{k≥1} (−1)^k t_k π^{2k} a^{2k−2}` with `t_k` the summation kernel's OWN Laurent coefficients —
>   the ones `mergedResidue` already computes from the Bernoulli recurrence. So `a → 0` is not an
>   evaluation at a small `a` (§10.3's own complaint) but a series: its `a⁰` term is exactly `−Res₀`,
>   which is G1's answer, its `a²` term is ζ(4)'s, and the same statement on `csc` closes the other
>   column. The 2×2 square of {cot, csc} × {collision, none} is one fact about one series, with no
>   limit taken numerically. ζ(4) is summed independently from the `m = 5` Bernoulli row and checked
>   against that `a²` coefficient, so the two routes share no arithmetic. And F1's invariant earns
>   its place because the two routes print **different closed forms for the same number** —
>   `(π/3)/sin(2π/3)` closing downward against `(π/3)/sin(π/3)` closing up, supplementary angles with
>   equal sines, which a shared formatter could not have produced.
> - **M5.8b — ADR-0042's `knownValue`, and the arithmetic of "imported".** The two errors are
>   opposite and both fatal: pricing an exactly-known piece by quadrature caps an exact argument at
>   `≈` by its most certain step, and a bare `=` launders the import as a derivation. **There is ONE
>   import**, because E3's own record says `√π` IS `Γ(1/2)` — so the closed set is the Gamma function
>   at a rational argument, and one independent check (`∫₀^∞e^{−tⁿ}dt`, F2's own declared method)
>   covers both records. An imported value **has no inverse**, which is what "imported" means
>   arithmetically: the solve works in the rank-1 module it generates, refusing a product of two
>   atoms and a division by one, and it REQUIRES `∮ = 0` since `2πi Σ Res` carries π and an import
>   does not. Three things the slice settled: the declared level is checked in BOTH directions (a
>   ceiling alone is satisfied by every level, `=` being the lattice top, so it would assert
>   nothing); the cross-check matches pieces by INDEX, since `integrateContour` labels them
>   `piece 1…n` positionally and never sees a family; and "is this an import at all?" is asked BEFORE
>   the leaves are walked, because a `knownValue` of `2*pi` otherwise gets a true and bewildering
>   sentence about additive crossing phases.
> - **M5.8c — E3, the contour that encloses NOTHING.** Its verticals needed the third integrand shape
>   to have a vanishing SEGMENT, and the first bound in the app whose `max|f|` is ATTAINED rather than
>   majorised: `Re Q(c+iy)` is an exact quadratic in `y`, so the maximum is a decision over three
>   candidates. The vertex is a real candidate — `e^{z²}` on `Re z = 0` over `y ∈ [−1,1]` has
>   `|∫| = 1.494` while an endpoint-only maximum certifies `0.736`, a FALSE bound rather than a loose
>   one. LEGALITY gained a row for the empty singular set, because with nothing to measure it had
>   said nothing at all — "there are none" and "none were looked for" looked the same on the ledger,
>   for the one record whose point is the former. Measuring corrected a claim: the ML slack is NOT
>   independent of the radius (6.84, 10.11, 7.69 at c = 3, 4, 6), because `Im Q` rotates at rate `2c`
>   and the inequality throws that cancellation away.
> - **M5.8d — F2, and it needed no new engine.** M5.2 built `linearMinorant.ts` as the single
>   predicate L3 and L6 share, two slices before its consumer existed. Measuring the discharged bound
>   gave the arc: it is asymptotically `1/(n R^{n−1})` against a certified `π/(2n R^{n−1})`, so **the
>   bound is loose by exactly `π/2` — and that factor IS the minorant's own slack at the origin**,
>   where the true `sin(nθ) ≈ nθ` against a claimed `≥ 2nθ/π`. The conditional convergence becomes
>   arithmetic: the partial integral's error is `(sin R², −cos R²)/(2R)`, envelope `1/(2R)` and phase
>   `R²`, so no component settles while the ANSWER is bit-identical at every radius — and `ray0 − T`
>   is exactly `−arc`, which makes the arc bound a bound on the truncation error. The accumulator
>   draws the **Cornu spiral**.
> - **M5.8e — the sweep, the docs and the gate.** One thing the doc sweep found: **`DESIGN.md` §4
>   Pass 3 had specified this all along** — its table reads *"`free` | quadrature, or an imported
>   exact constant declared by the family | `≈`, or `=` for a declared constant"*. SG-2 was never a
>   design gap; it was the v1 SCHEMA having no field with which a family could declare one. The
>   decision ADR-0042 records is therefore about the two errors either side of the field, not about
>   whether the behaviour was wanted.

---

## 2. Risks

1. **SG-1 changes Pass 5's equation** (M5.6). Twenty records depend on it. Mitigated by ordering —
   behind the full corpus — and by requiring the generalisation to be a *provable* no-op at `w = 0`.
2. **SG-5 changes the schema's root type** (M5.7). `target` becomes a union, and the loader's
   invariants, the derivation and the UI all read it. Mitigated by doing it *after* SG-1, so the solve
   is already general when the target stops being an integral.
3. **Tier E–G's `=` labels are unverified claims** (§10.3). Plan for honest `≈` outcomes; the failure
   mode to avoid is quietly printing `=` because the record says so.

   > **DISCHARGED (M5.8).** All eight records print a symbolic closed form and the decimals beside
   > them are `≈`, as every decimal in this app is. Nothing was demoted; nothing was printed on the
   > record's say-so either — every `=` is minted from a certificate the engine produced, and the two
   > that rest on a value from outside the argument (E3, F2) carry the import in their provenance
   > rather than in their label.
4. **The research is wrong in two places that matter** (D-1, D-2), and in both cases the wrong version
   is the *plausible* one. Both corrections are measured, and both belong in the code with the
   measurement beside them, or they will be re-introduced.
