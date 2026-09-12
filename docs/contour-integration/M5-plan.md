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

### M5.1 — the sandbox declares a branch factor · *M*

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

### M5.2 — one predicate for two lemmas, and the corrected L6 · *S–M*

The maths prerequisite for tier F, and a correction to the research.

- `cos φ ≥ 1 − 2φ/π` (L6) and `sin ψ ≥ 2ψ/π` (L3, Jordan) are **the same inequality**. One predicate
  discharges both; the engine should not have two.
- **The corrected L6**, both halves: `e^{−zⁿ}` on `[0, π/(2n)]` with `π/(2nR^{n−1})`, and `e^{izⁿ}` on
  `[0, π/n]` through Jordan. Certified in exact ℚ like every other bound, with the existing certified
  π brackets.
- Record D-1 against research 03, with the measured divergence, so the wrong statement cannot be read
  back out of the research and re-implemented.

### M5.3 — tier E · *M*

- **E1** `∫ℝ e^{ax}/(1+e^x) dx = π/sin(πa)` — the quasi-periodic strip on `rectangleTemplate`, with
  `reproduces` at `λ = e^{2πia}`. Mostly wiring: both pieces exist.
- **E2** `∫ℝ sech(x)e^{iξx} dx = π sech(πξ/2)` — the same machinery, a different `λ`.
- **E3** `∫ℝ e^{−x²}cos(bx) dx = √π e^{−b²/4}` — **the interesting one, and the empty singular set.**
  `e^{−z²}` has no poles at all, so `∮ = 0` and the *entire* answer is the sides. A new ledger shape:
  COVER has nothing to cover, and the argument is carried by the `reproduces` relation alone. Needs
  **ADR-0042's `knownValue`** (the top side is the Gaussian) and **SG-3** (the rectangle's orientation
  flips with `sign(b)`; reduced by evenness here, and the record says so).

### M5.4 — tier F · *M*

- The **wedge** template.
- **F1** `∫₀^∞ dx/(1+x³) = 2π/(3√3)` on the `2π/3` wedge, plus its `closing-the-other-way` invariant
  — currently a specification with no result (§10.3).
- **F2** `∫₀^∞cos(x²)dx = √(π/8)` — *"the bound everyone hand-waves"*. M5.2's corrected L6 at `n = 2`,
  ADR-0042's `knownValue` for the return ray's `Γ(1+1/n)`, and **SG-4** (`convergenceClass:
  "conditional"` — `∫₀^∞|cos x²|dx = ∞`, and research 03 §3 trap (ii) says the label must record it).

### M5.5 — the summation kernel, the square, and the corrected bound · *M*

- The `πcot`/`πcsc` kernel pair.
- The **square** template — and `limitParams[].to` able to say **"through half-integers only"**, which
  is not cosmetic: it is the constraint that refutes *"the square may be taken at any radius"*, one of
  the tier's two real traps, and is currently unrepresentable (**SG-5**).
- **The corrected square bound** `8π coth(π/2)·M·(N+½)^{1−k}`, with D-2 recorded: the research's
  version is not an upper bound and printing it would be certification theatre.

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

### M5.8 — the invariants that are specifications, and the gate · *S–M*

§10.3 lists what was reasoned and never run. Each becomes a result or an honest refusal:

- `F1.closing-the-other-way`, `G2.csc-companion`, `G3.csc-companion-of-G2`, and
  `F2.cos-equals-sin-only-at-n-2`'s `differ` half.
- `ζ(4) = π⁴/90` is asserted from a *measured* coefficient and was never summed independently.
- `G2.a-to-zero-recovers-G1` was checked by evaluating the closed form at `a = 10⁻⁴`, not by a
  confluence argument.

**Gate:** 28 records loaded and executed; the cross-family invariants green; every `=` in tiers E–G
either earned or honestly demoted to `≈`.

---

## 2. Risks

1. **SG-1 changes Pass 5's equation** (M5.6). Twenty records depend on it. Mitigated by ordering —
   behind the full corpus — and by requiring the generalisation to be a *provable* no-op at `w = 0`.
2. **SG-5 changes the schema's root type** (M5.7). `target` becomes a union, and the loader's
   invariants, the derivation and the UI all read it. Mitigated by doing it *after* SG-1, so the solve
   is already general when the target stops being an integral.
3. **Tier E–G's `=` labels are unverified claims** (§10.3). Plan for honest `≈` outcomes; the failure
   mode to avoid is quietly printing `=` because the record says so.
4. **The research is wrong in two places that matter** (D-1, D-2), and in both cases the wrong version
   is the *plausible* one. Both corrections are measured, and both belong in the code with the
   measurement beside them, or they will be re-introduced.
