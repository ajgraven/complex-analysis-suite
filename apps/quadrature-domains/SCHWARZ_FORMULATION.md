# The Schwarz-function formulation of the bounded-QD inverse system

A second, algebraically-distinct way to write the same bounded quadrature-domain
inverse equations the Algebra tab solves. The default **classical (forward)** system
([`qd-equations.mjs`](app/qd-equations.mjs) `generateClassicalBounded`) and this
**Schwarz** system (`generateSchwarzBounded`) cut out the **same solution variety**
over the same `{z_j, A_{j,k}}` unknowns — they differ only in *which* polynomial
identities express the principal-part matching. Pick it from **Quadrature ↔ map
equations ▸ Formulation ▸ Schwarz function**, or seed it into the Algebra workspace via
**Open in Algebra workspace** (the workspace follows the card's formulation choice).

## Background — the Schwarz function

For a bounded simply-connected QD `Ω = φ(𝔻)`, the **Schwarz function** `σ(w)` is the
unique function with `σ(w) = w̄` on `∂Ω` that extends meromorphically into `Ω`. Its
poles sit at the quadrature nodes `a_j`, and the quadrature data is exactly its singular
part: *h is the sum of σ's principal parts at its finite poles* (THEORY_MAP §3.4; thesis
§3.2). In the conformal model, on `|z| = 1`,

```
σ(φ(z)) = conj(φ(z)) = F(z),   F(z) = conj(w₀) + Σ_j Σ_k A_{j,k} / (z − z_j)^k
```

i.e. `F` is the rational "Schwarz extension" already built numerically in
[`schwarz/schwarz-common.mjs`](app/schwarz/schwarz-common.mjs).

## The (★_S) block — what `generateSchwarzBounded` builds

The locator block `(●_j): φ(z_j) = a_j` and the gauge block `Σ_j Im A_{j,1} = 0` are
**reused verbatim** from the classical generator. Only the principal-part block changes:

- **Classical (★)** — forward: `C_{j,s} = Σ_{k≥s} (k/s)·A_{j,k}·[t^k] φ̃_j^s`, computing
  the quadrature coefficients from `A` via the local power series of `φ` at `z_j` (no
  compositional inverse — the design that keeps the `(1−z̄z)` denominators bounded).

- **Schwarz (★_S)** — inverse: match `C_{j,s}` to the principal part of `σ` at
  `a_j = φ(z_j)`. With `c_{j,l} = [t^l] φ(z_j+t)` the local Taylor coefficients of `φ`,
  `ψ̃_j` the compositional inverse of `φ̃_j = [0, c_{j,1}, …]`, and `ψ̃_j(ζ) =
  ψ̃_j[1]·ζ·u_j(ζ)` with `u_j(0)=1`:

  ```
  (★_S)_{j,k}:  C_{j,k} − Σ_{l=k}^{m_j} A_{j,l} · c_{j,1}^{l} · [ζ^{l−k}] u_j(ζ)^{−l}  =  0.
  ```

  The numerator is the **map coefficient `A_{j,l}`**, not `conj(c_{j,l})`. Reason: the
  Schwarz function pulls back through the uniformization as `S(φ(z)) = φ*(1/z) =
  Σ_l A_{j,l}/(z−z_j)^l` — the disk reflection `z ↦ 1/z̄` turns the parametric map's
  Blaschke factors into simple poles at `z_j` carrying the map coefficients `A_{j,l}`.
  Re-expanding that principal part in `w − a_j` via the local reversion (`u_j`, `c_{j,1}`)
  gives the sum above. The compositional inverse is `Sym.seriesReversion` over the
  factored-rational `FRatFn` field with **bounded denominators** (no blow-up). *(A
  `conj(c_{j,l})` numerator — the local `conj(φ)` shortcut, valid only when `z_j = 0` — was
  a bug: it dropped the disk-reflection Blaschke factor. See the `z_j ≠ 0` oracle test.)*

### Same variety, different polynomials

At the true `φ` the residual of **both** systems is `0` (exactly, in rational arithmetic —
see the oracle tests, now including a `z_j ≠ 0` two-pole case). The `(★_S)` polynomials are
*not* termwise equal to `(★)` at higher pole orders — per-pole reversion and the forward
`[t^k] φ̃^s` recurrence give different combinatorial forms — but they cut out the **same
variety**. For a simple pole both give the same residue, `C_{1,1} = A_{1,1}·φ′(z_j)`, which
on the reality slice is `|φ′(z_j)|²·(1−|z_j|²)²` — the Blaschke–Jacobian of the disk
reflection, **not** `|φ′(z_j)|²` (that holds only at `z_j = 0`).

The cleared `(★_S)` equations carry `(1−z̄z)` / `φ′(z_j)` denominator factors that are
nonzero on the QD regime (`|z_j| < 1`, `φ′ ≠ 0` in `𝔻`) — the same "clear the
Möbius/critical denominator" philosophy as the forward block — so both presentations agree
on the physical domain.

### Why use it

- **Cross-validation** of a reduction: solve the classical system and the Schwarz system
  and confirm they land on the same domain (`sameDomain`).
- It is the form in which the **Aharonov–Shapiro uniqueness** arguments are naturally
  stated (the Schwarz function is the central object), so it is the right starting point
  for Schwarz-based uniqueness work.

Honest caveat: the Schwarz form is a *different / literature-aligned* presentation of the
same variety, **not** guaranteed to be *smaller* — per-pole reversion can yield equations
of comparable size to the forward block. The same-variety residual check is the
correctness anchor.

## Scope

`generateSchwarzBounded` mirrors `generateClassicalBounded`'s scope: **bounded
simply-connected classical QD**, same `maxPoleOrder` cap, both the conjugate and the
real/imaginary (`reimSplit`) representations, and the `w₀ = φ(0)` fix all compose
unchanged. Unbounded / weighted (LQD/PQD) / multiply-connected Schwarz systems are out of
scope (the symbolic generator is bounded-only today).

## Verification

`app/test/qd-equations.test.js` (the "Schwarz-function formulation" section) and
`app/test/algebra-store.test.js` (the "Schwarz-function formulation seeds cleanly"
section). The load-bearing checks: the Schwarz residual is `≈0` at the exact translated
cardioid `φ = ¼ + z + z²/2`, at the unit disk, and at the genuine numeric solver
solution; the `(★_S)` polynomials differ from `(★)`; a perturbed `φ` drives the residual
up; the formulation tag threads through seed → snapshot → undo → exportDAG.

## Follow-on (not built) — the global rational reflection identity

A second, heavier Schwarz formulation remains for a later engagement: assemble `φ` as a
single rational `P(z)/Q(z)` (clear the Möbius branches) and impose the global
Aharonov–Shapiro identity `S(φ(z)) = φ*(1/z)` as **one** polynomial identity in `z` (no
local series), matching coefficients. It is closest to the published parametric-uniqueness
machinery but needs from-scratch rational-`φ` assembly and grows in degree with the pole
orders. Deferred.
