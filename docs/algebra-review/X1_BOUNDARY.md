# X1 — certified boundary injectivity for irrational-algebraic quadrature domains

> Design record for the boundary half of **X1** (`≈`→`=` for irrational-algebraic QDs). The fold
> half (φ′≠0 in 𝔻) is settled and its primitive is merged — `Sym.schurCohnInterval`, interval
> Schur–Cohn at the isolating box (PR #146). This doc settles the *boundary* half (φ(∂𝔻) simple),
> which was the research-grade crux gating the actual label flip. **Verdict: reachable, soundly,
> with shipped primitives.**

## The problem

For a genuine QD whose shape parameters are irrational algebraic numbers, the `=` badge is currently
withheld because the two univalence filters run at a **rationalized float** of the true root
(`poleSubst` → `QE.ratApprox`, `prove-plan.mjs:78`), not *on* the variety. The boundary filter
`boundaryDoublePointCount` (`qd-constraints.mjs:248`) builds the divided-difference system

```
N = (φ(ζ₁) − φ(ζ₂)) / (ζ₁ − ζ₂)          # phiDividedDifference, diagonal divided out exactly
system = [ Re N, Im N, |ζ₁|²−1, |ζ₂|²−1 ] # in (x₁,y₁,x₂,y₂), after ζ_k = x_k + i y_k
count  = realSolutionCount(system)        # # ordered off-diagonal boundary double points
```

`count === 0 ⇔ φ(∂𝔻) simple`. Its precondition is φ′≠0 on the closed disk (so `N(ζ,ζ)=φ′(ζ)·(≠0)`
has no on-circle zero ⇒ no diagonal solutions) — supplied by the fold certificate.

## Why the obvious routes fail

The count is the **signature of a rational Hermite trace form** `H` (`realSolutionCount`,
`sym-core.mjs:4176`). `H` is built from a Gröbner quotient — leading-term choices, the
standard-monomial staircase, and a `hasImag` realness gate are all **exact discrete decisions**. An
interval coefficient that straddles 0 corrupts the *combinatorial* object, not just a number, and
there is no "refine-and-retry" that repairs a wrong leading-term choice mid-Buchberger. So:

- **(A) number-field Hermite over ℚ(i)[t]/(minPoly)** — *blocked*. The engine's coefficient ring is
  hardwired to ℚ(i); there is no number-field domain. Worse, the RUR `minPoly` is only **squarefree,
  not irreducible** (`rationalUnivariateRep`, `sym-core.mjs:1860` — built on the radical, accepted by
  `squareFreePart(f).degree === D`), so ℚ(i)[t]/(minPoly) is a **product ring with zero-divisors** and
  `realSolutionCount` presupposes a field. Mathematically unsound over the un-factored minPoly.
- **(C) interval subdivision of the (θ₁,θ₂) torus** — *research-grade*. No 2-D interval machinery
  exists, and termination near a genuine tangency needs an a-priori separation bound.
- **(D) resultant to a univariate-in-t certificate** — *dominated by (B)*; its only sound realization
  is (B)'s transition certificate, with more extraneous-factor exposure.

## The route we take — (B), specialized to the `count===0` question

We do **not** need the exact count at `t*`; the `=` badge only needs **simple** (`count===0`). That
collapses the hard part.

**Augmented `count===0` certificate (non-negativity).** Substitute the RUR coordinate maps `g_v(t)`
for the barred pole values in `phiDividedDifference`, adjoin `minPoly(t)=0`, and count real solutions
of the zero-dimensional system in `(x₁,y₁,x₂,y₂,t)` over ℚ(i) with the shipped `realSolutionCount`:

```
augmented = [ Re N(x,y,t), Im N(x,y,t), |ζ₁|²−1, |ζ₂|²−1, minPoly(t) ]
total     = realSolutionCount(augmented, vars = x₁,y₁,x₂,y₂,t)
```

- The real roots of `minPoly` are exactly the **real QD solutions**; `total` is the **sum** of
  boundary double-point counts over all of them.
- By **Hermite's theorem** the trace-form signature = the number of *distinct real points* — always
  **≥ 0**. Therefore **`total === 0` ⇒ every real QD solution's boundary count is 0**, including the
  one under test. **Sound.** Conservative: it refuses (`total > 0`) when *any* sibling/real-conjugate
  solution self-intersects, even if `t*` does not — an honest `≈`, never a false `=`.
- No separating form, no transition locus `Δ(t)`, no box restriction — so it sidesteps the
  `parametricRealCount1D` LOW-1 gap (a non-generic separating form can miss a transition; unacceptable
  for `=`). The diagonal ζ₁=ζ₂ is excluded by the fold precondition (φ′≠0), which is co-certified.
- **Capacity, not correctness, is the only limit.** The Hermite dimension is
  `D × (#complex boundary double points)`; over the 64-term cap `realSolutionCount` returns `ok:false`
  and we fall back to the numeric boundary test (honest `≈`). Fine for the small irrational-algebraic
  QDs this targets.

The exact-count-at-`t*` route (parametric specialization + an independent `Δ(t)`-has-no-real-root-in-box
certificate, complete because the circle quadrics make the fiber compact ⇒ no escape branch) remains the
fallback if a future need wants the *value* of a non-zero count; it is **not** required for the `=` flip.

## Slice plan (boundary first, then fold wiring, then the flip)

> **✅ COMPLETE — all six X1 slices shipped (PRs #146–#151, master `b6db624`).** Fold primitive
> `schurCohnInterval` (#146) · boundary certificate `boundaryDoublePointCountParametric` (#147) · shared RUR
> channel (#148) · boundary wire `barredSubstFromRUR`/`boundaryCertifiedAtRoot` (#149) · fold wire
> `schurCohnAtBox`/`foldCertifiedAtRoot` (#150) · the flip in `certifyLeaf`/`assembleVerdict` (#151). An
> irrational-algebraic quadrature domain now earns a certified `=`. Follow-up: a real end-to-end
> irrational-QD fixture (the flip is validated by the unit certificates + the `intervalCertified` verdict
> characterization, not yet by a full solve-to-`=`).

1. **B1 — the augmented `count===0` certificate** (this branch). A glue function that builds the
   augmented system (substitute `g_v(t)` into `phiDividedDifference`, reim-split, adjoin `minPoly`) and
   calls `realSolutionCount`; returns `{ simple, certified }` with `certified` only on a clean
   zero-dimensional `total`. Test end-to-end against `QD.isBoundaryUnivalent` on a known
   irrational-algebraic QD. The reim-split↔barred-pole variable mapping built here is **shared** with
   the fold wiring.
2. **B-wire** — consume it in `certifyLeaf`/`schurCohnFold`'s sibling boundary step when a certified
   RUR box exists and there is no exact `barSub`; record `boundaryCertifiedAtRoot`.
3. **Fold wiring** — the deferred Stage-1 slices: feed the RUR box into `schurCohnInterval` (the merged
   primitive) via the same channel; record `foldCertifiedAtRoot`.
4. **The flip** — define "certified at the true root = fold ∧ boundary certified-at-root"; let
   `allExactVerified` be satisfied by it; promote `≈`→`=` with an honest provenance line
   ("interval Schur–Cohn fold + augmented boundary count, at the true algebraic root"); rigor tests.

## Non-negotiable

A false "simple boundary" is a false `=` — the one unacceptable bug. Every step above either certifies
by an **exact** decision (Hermite signature over ℚ(i)) or **refuses** (`ok:false` / non-zero total /
over-cap) and falls back to the numeric `≈`. The certificate never guesses.
