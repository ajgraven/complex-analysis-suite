# Gallery tiers C and D — `Family` records

> Content specification for `apps/contour-integration`. Ten fully-specified `Family` records
> (DESIGN.md §5) for tier C (indented contours, principal values, removability) and tier D
> (branch cuts: keyhole, Mellin, log/log², dogbone). Mathematical source of truth:
> [`research/03-method-taxonomy.md`](../research/03-method-taxonomy.md) §0, §4, §5, §9, §13, §15 and
> [`research/06-branch-cuts.md`](../research/06-branch-cuts.md) §2.1, §6, §8.
>
> **Every closed form below was re-derived and re-verified numerically in this session**, independently
> of research 03's table, by at least two methods per entry. See the [verification log](#verification-log).
> No disagreement with research 03 was found.

Tiers A and B establish that a closed contour plus one decay lemma computes a real integral: rational
residues, the ML/Jordan arc, and the winding number, all with the pole set strictly *off* the contour.
**Tier C breaks that last assumption** — the singularity moves onto the path of integration, and the
engine must decide, per singularity, whether to *indent* (C1: a genuine simple pole, and L4 pays
`iα·Res` with α = −π, not 2πi·Res, and not 0), whether to *do nothing* (C2: the singularity is
removable, so LEGALITY finds nothing on the contour and the non-vanishing piece migrates to the large
arc, where **L5** rather than L3 does the work), or whether to do both at once while a complex pole is
also enclosed (C3: one real pole indented out, one complex pole wound once, and a principal value that
is *inherited from the auxiliary integrand* rather than needed by the target). **Tier D makes the
branch data an input to the answer.** D1 adds the keyhole and the `argRange`, and with it the first
structural refusal: `argRange = (−π,π]` drives `1 + Σcⱼ` to zero and the app declines instead of
printing 0. D2 adds several poles off one cut and a real-valued crossing phase, `e^{iπ} = −1`, under
which the two edges add instead of fighting. D3 adds a
two-parameter family, a cross-check against the §7 wedge, and a second instance of the same
degeneracy — at integer `a` the closed form survives by continuity while the *derivation* collapses.
D4 adds the log² keyhole, whose lower edge reproduces an *affine combination* of three different real
integrals rather than a multiple of one, and whose real and imaginary parts split into two answers.
D5 adds the log³ step and, with it, the first **chained** family: it does not close on its own. D6 and
D7 add the dogbone, the bounded cut, the admissibility criterion `Σαₖ ∈ ℤ`, and the residue at
infinity — zero and certified so for D6, and carrying most of the answer for D7, where two distinct
fractional powers sit on one cut.

---

## Conventions every record below uses

These are stated once and are load-bearing. A record that violates one is wrong, not stylistically
different.

**CP — the crossing phase.** Cuts are never approached by ε-offsetting the contour (PLAN §4.3). Each
edge piece carries `side: "above" | "below"`, which pins the argument limit: `"above"` evaluates at the
**low** end of `argRange` and `"below"` at the **high** end. For a factor `(z − b)^ν` whose argument
gains exactly `+2π` between the two edges, the lower edge's integrand is `e^{2πiν}` times the upper
edge's. `branch.crossingPhase` is written with **the literal exponent ν as it appears in the
integrand** — `exp(2*pi*i*(alpha-1))` for `z^{α−1}` — and equals the reduced form `exp(2*pi*i*alpha)`
used by research 03 §15, because `e^{−2πi} = 1`. Both forms are accepted; the loader asserts they agree
numerically, which is the cheapest possible guard against an off-by-one in the exponent.

**F — the `reproduces` factor.** `Piece.factor` is the **complete multiplier of the target that the
piece contributes, including the sign from traversing it in the reverse direction.** For a keyhole
lower edge traversed `R → ε`, `factor = −crossingPhase`. This is why research 03 §15 writes
`-exp(2*pi*i*s)` and not `exp(2*pi*i*s)`; the minus sign is the reversal, not a phase.

**O — dogbone orientation.** `orientation: "cw"` on a dogbone means **clockwise about the cut**, which
is *counter*clockwise about the exterior region and about ∞. This is the orientation in which the upper
edge runs left→right and therefore contributes `+T`. Choosing `"ccw"` about the cut is equally valid and
flips every sign consistently; the invariant test `closing up vs. closing down must agree`
(DESIGN §9.4) covers it.

**W — winding numbers are reported per pole, never inferred from the picture** (research 02 P0 #7).
Each contour record below carries an explicit `windings` map. For the dogbone families this is the
whole point: `n(γ, pole) = 0` for the bare dogbone even though `∮ ≠ 0`, because the residue theorem is
being applied to the *exterior* region, which contains ∞.

**S — an indentation's sign comes from L8, not from the picture.** L4 gives the *magnitude*
`|α|·|Res|`; the sign of `iα·Res` is fixed by which side the contour passes, and that is exactly the
`iε` prescription of **L8** (Sokhotski–Plemelj): `lim_{ε→0⁺} 1/(x − x₀ ∓ iε) = P 1/(x−x₀) ± iπδ(x−x₀)`.
Every indentation row therefore carries a `signSource` naming the prescription. Research 03 §4's trap
(iv) is precisely this: tie the `±iπ` mechanically to the `iε` choice, never by hand. Physics
conventions — Feynman `iε`, retarded versus advanced Green's functions — are the same choice wearing a
different name, and the app should show them together.

**R — `1 + Σⱼcⱼ = 0` is a refusal, not a zero.** DESIGN §4 pass 5. Four separate classical traps in
this file are the same structural fact: D1 with the wrong `argRange`, D3 at integer `a`, the plain-`log`
keyhole losing the log integral, and (in matrix form) D4/D5. See [gap G2](#g2--pass-5-is-rank-1-the-log-families-need-a-linear-system).

---

## Schema gaps

Eight things below could not be expressed in the `Family` interface as locked in DESIGN §5. They are
**reported, not worked around**: where a record needs one, the field appears with a `⚠ GAP Gn` comment
marking it as a proposed addition that the v1 loader would reject. Full discussion in
[Schema gaps, in full](#schema-gaps-in-full) at the end.

| id | gap | records affected |
|---|---|---|
| **G1** | no `auxiliary` — nowhere to say `f(z) = e^{iz}/z` complexifies `sin x/x`, nor that the answer is `Im(...)` | C1 C2 C3 D4 D5 |
| **G2** | pass 5 is rank-1: `T·(1 + Σcⱼ)` cannot express a lower edge that reproduces an *affine combination* of several targets | D4 D5 (and the plain-log keyhole) |
| **G3** | no per-pole `n(γ, aₖ)` in the record; `contour.encloses` is one prose string | all 10, critically D6 D7 |
| **G4** | `branch` is singular (one `function`, one `cut`, one `argRange`) — D6 and D7 have two branch points with independent exponents and, in D7, two different arg conventions | D6 D7 |
| **G5** | `Res(f,∞)` has no seat: pass 2 sums finite poles only, and pass 3's table says `role:"residue"` is "already handled in pass 2" | D6 D7 |
| **G6** | `principalValue` is a boolean on `target`, but DESIGN §2.3 requires p.v. to be a **distinct result type**; and the p.v. here belongs to the *auxiliary*, not the target | C1 C3 |
| **G7** | `golden[]` has no `method` — a golden value with no provenance is an assertion | all 10 |
| **G8** | no `prerequisites` — D5 needs `∫R dx` as an input and cannot close alone | D5 |

---

# Tier C — the singularity on the contour

## C1 · `indented-sinc`

**What this entry exists to teach: the indentation is a half-turn, and a half-turn pays `iα·Res`.**
Everything else about `∫₀^∞ sin x/x` is standard; the one irreducible idea is that `e^{iz}/z` has a
genuine simple pole sitting exactly on the path, that the ρ-semicircle detouring *over* it excludes it
(so it contributes nothing to the residue sum), and that in the limit it contributes `i·(−π)·Res = −iπ`
— a *fraction* of `2πi·Res`, fixed by the angle swept and its sign, never by taste. The two classical
wrong answers are both one factor away: `2πi·Res` gives π instead of π/2, and "the small arc vanishes"
gives 0. L4 is also the first lemma in the catalogue with a hypothesis that can *fail on a technicality*
— it is false at a double pole, where `∫_{C_ρ} ~ ρ^{1−m}` diverges, and that must be checked rather
than assumed. Finally, C1 is where the app must first separate the convergence of the *target* from the
convergence of the *auxiliary*: `∫₀^∞ sin x/x` converges (conditionally) as an honest improper integral,
while `∫ e^{ix}/x` exists only as a principal value because `∫ cos x/x` diverges at the origin.

```jsonc
{
  "id": "indented-sinc",
  "title": "Dirichlet integral: sin x / x by the indented semicircle",
  "taxonomySection": "4",
  "tier": "C",

  "target": {
    "variable": "x", "lower": "0", "upper": "inf",
    "integrand": "sin(x)/x",
    "symbols": {},
    "principalValue": false          // the TARGET converges; see hypotheses.pv-provenance
  },

  // ⚠ GAP G1 — proposed field, not in Family v1. Without it there is no way to say that the
  // contour integrand is not the target integrand, nor that the answer is an imaginary part.
  "auxiliary": {
    "integrand": "exp(i*z)/z",
    "relation": "sin(x) = Im(exp(i*x)) for real x; f|_R = exp(i*x)/x",
    "extract": "Im",
    "fold": "target = extract(pieces[role=target]) / 2",   // evenness of sin(x)/x over R
    "principalValue": true           // the AUXILIARY needs p.v.; Re part diverges at 0
  },

  "parameters": [],

  "hypotheses": [
    { "id": "aux-pole-simple",
      "statement": "exp(i z)/z has a SIMPLE pole at z = 0 (L4 is false for order >= 2)",
      "check": "algebraic:poleOrder(auxiliary, 0) == 1",
      "onFail": "refuse" },
    { "id": "jordan-half-plane",
      "statement": "a = 1 > 0, so the closing arc must lie in Im z >= 0",
      "check": "algebraic:sign(fourierFrequency(auxiliary)) == orientationOf(contour.pieces.bigarc)",
      "onFail": "refuse" },
    { "id": "jordan-decay",
      "statement": "M_R = max_{|z|=R, Im z>=0} |1/z| = 1/R -> 0",
      "check": "symbolic:maxOnArc(1/z, R) -> 0",
      "onFail": "refuse" },
    { "id": "no-other-poles",
      "statement": "exp(i z)/z is holomorphic on Im z > 0",
      "check": "algebraic:poleCount(auxiliary, upperHalfPlane) == 0",
      "onFail": "warn" },
    { "id": "target-converges",
      "statement": "int_0^inf sin x / x converges CONDITIONALLY (Dirichlet test); it is not absolutely convergent",
      "check": "analytic:dirichletTest(sin, 1/x) && !absolutelyConvergent(target)",
      "onFail": "warn" },
    { "id": "pv-provenance",
      "statement": "sin(x)/x extends continuously to x = 0, so the TARGET needs no p.v.; exp(i x)/x does",
      "check": "algebraic:isRemovable(target.integrand, 0) && !isRemovable(auxiliary.integrand, 0)",
      "onFail": "warn" }
  ],

  "branch": null,                    // exp(iz)/z is single-valued. z = 0 is a POLE, not a branch point.

  "contour": {
    "template": "indentedSemicircle",
    "limitParams": [ { "name": "R", "to": "inf" }, { "name": "rho", "to": "0+" } ],
    "pieces": [
      { "id": "left",   "name": "the real axis, left of the indentation",
        "kind": "segment", "from": "-R", "to": "-rho", "role": "target", "colour": 0 },
      { "id": "indent", "name": "the rho -> 0 indentation over z = 0",
        "kind": "arc", "center": "0", "radius": "rho", "theta0": "pi", "theta1": "0",
        "role": "vanish", "lemma": "L4", "colour": 3 },
      { "id": "right",  "name": "the real axis, right of the indentation",
        "kind": "segment", "from": "rho", "to": "R", "role": "target", "colour": 0 },
      { "id": "bigarc", "name": "the R -> inf semicircle",
        "kind": "arc", "center": "0", "radius": "R", "theta0": "0", "theta1": "pi",
        "role": "vanish", "lemma": "L3", "colour": 1 }
    ],
    "orientation": "ccw",
    "encloses": "nothing: exp(i z)/z has no pole with Im z > 0",
    // ⚠ GAP G3 — proposed field.
    "windings": { "0": 0 }           // the indentation EXCLUDES the pole; n(gamma, 0) = 0
  },

  "vanishingLemmas": [
    { "lemma": "L4", "piece": "indent",
      "sideCondition": "z=0 is a simple pole; the swept angle is alpha = -pi (clockwise, pi -> 0)",
      "discharge": "symbolic:fractionalResidue(auxiliary, 0, alpha=-pi) = i*(-pi)*Res = -i*pi",
      "signSource": "L8 (Sokhotski-Plemelj): lim_{eps->0+} 1/(x - x0 -+ i eps) = P 1/(x-x0) +- i pi delta(x-x0). Indenting ABOVE the pole is the -i eps prescription and fixes the sign as +i pi Res on the p.v. side; the sign is DERIVED from the i-eps choice, never chosen by hand (research 03 s4 trap iv).",
      "rigorIfDischarged": "=", "rigorIfNumericOnly": "≈" },
    { "lemma": "L3", "piece": "bigarc",
      "sideCondition": "f = exp(i a z) g(z) with a = 1 > 0 on the UPPER arc; M_R = max|g| -> 0",
      "discharge": "symbolic:jordanBound(a=1, g=1/z) => |int| <= pi/(a*R) = pi/R -> 0",
      "rigorIfDischarged": "≤", "rigorIfNumericOnly": "≈" }
  ],

  "residueSelection": { "rule": "upperHalfPlane", "set": "{}  (empty; the whole answer is the indentation)" },

  "closedForm": {
    "expr": "Im( 2*pi*i*Sum(Res(f,z_k) : Im z_k > 0) + pi*i*Sum(Res(f,x_j) : x_j in R) ) / 2",
    "simplified": "pi/2"
  },

  "rigor": { "policy": "min",
             "inputs": ["hypotheses.*", "vanishingLemmas.*.rigor", "residues.*.rigor", "auxiliary.extract"] },

  "traps": [
    { "id": "full-residue-at-an-indentation",
      "detect": "ledger.row('KILL', 'indent').weight == 2*pi*i",
      "message": "The indentation is a HALF turn. L4 gives i*alpha*Res with alpha the signed swept angle; here alpha = -pi, so the piece contributes -i*pi*Res. 2*pi*i*Res is the value of a FULL circle around an enclosed pole — and this pole is not enclosed, it is detoured around. Using 2*pi*i*Res gives pv int = 2*pi*i and hence int_0^inf sin x/x = pi, exactly twice the right answer." },
    { "id": "l4-needs-a-simple-pole",
      "detect": "algebraic:poleOrder(auxiliary, indentedPoint) > 1",
      "message": "L4 is FALSE at a pole of order m >= 2: there is no fractional residue for a double pole. int over the rho-semicircle of exp(i z)/z^2 dz = -2/rho + O(1) (measured |int| = 1.6958e1, 1.9687e2, 1.9969e3, 1.9997e4 at rho = 1e-1, 1e-2, 1e-3, 1e-4, against 2/rho = 2e1, 2e2, 2e3, 2e4) - the limit does not exist, so the contour argument does not close and no p.v. exists either (Hadamard finite part is a different object). The simple-pole case for contrast converges: -3.12159, -3.14139, -3.14159 i at rho = 1e-2, 1e-4, 1e-6." },
    { "id": "wrong-half-plane",
      "detect": "algebraic:sign(fourierFrequency) * sign(arcHalfPlane) < 0",
      "message": "|exp(i a z)| = exp(-a * Im z) is bounded only where a * Im z >= 0. With a = +1, closing downward makes M_R grow like exp(R) and the Jordan bound DIVERGES. This is not a sign slip to patch up; the argument does not close." },
    { "id": "pv-mislabelled",
      "detect": "result.principalValue != auxiliary.principalValue",
      "message": "pv int exp(i x)/x dx exists ONLY as a principal value: int cos x / x diverges at the origin. int sin x / x converges outright. Attaching the p.v. qualifier to the target, or dropping it from the auxiliary, are both correctness bugs - p.v. existence does not imply integral existence (pv int_0^2 dx/(x-1) = 0 while the integral diverges)." },
    { "id": "indent-below-not-checked",
      "detect": "!invariants.includes('indent-up == indent-down')",
      "message": "Indenting BELOW puts the pole inside: the +pi*i becomes -pi*i AND a 2*pi*i*Res appears. The two routes must agree; that agreement is a free self-test, not a variant to choose by taste." },
    { "id": "indentation-sign-set-by-hand",
      "detect": "ledger.row('KILL','indent').signSource == null",
      "message": "The +- of i*pi*Res must be tied mechanically to the i-eps prescription (L8, Sokhotski-Plemelj: lim 1/(x - x0 -+ i eps) = P 1/(x-x0) +- i pi delta), not read off a picture. Physics conventions - Feynman i-epsilon, retarded vs advanced Green's functions - ARE exactly this choice of which side to indent, so the app should display the prescription alongside the geometry. A sign chosen by inspection is the single most common error in this family and it leaves no trace in the arithmetic." }
  ],

  "golden": [
    // method: (a) half-period decomposition at multiples of pi + repeated-averaging (Euler)
    //         acceleration of the alternating tail;  (b) 64-pt Gauss-Legendre per half period to
    //         A = 40*pi plus the alternating asymptotic tail cos A * (1/A - 2!/A^3 + 4!/A^5 - ...).
    //         Both give 1.5707963267948961 (rel 2.8e-16).   ⚠ GAP G7: no field for this.
    { "params": {}, "value": "pi/2", "numeric": 1.5707963267948966, "verifiedTo": 3e-16 },
    { "params": { "form": "pv int_R exp(i x)/x dx" }, "value": "i*pi",
      "numeric": [0.0, 3.141592653589793], "verifiedTo": 1e-5 }
  ]
}
```

## C2 · `removable-one-minus-cos`

**What this entry exists to teach: detect removability and do nothing.** C1's reflex is to indent
anything sitting on the contour; C2 is the case where that reflex is wrong. `(1 − cos x)/x²` is bounded
at the origin (it tends to ½), so LEGALITY finds no singularity on the path and there is **nothing to
indent**. The engine earns this rather than assuming it: for a rational integrand it is `findPolesOf`'s
exact gcd cancellation (DESIGN §6.3 step 1), and for a transcendental one like this it is the truncated
Laurent quotient reporting `c₋₁ = 0` (`kernel/series/`) — in both cases a computed fact, not a special
case. The catch is that removability is a property of the *auxiliary*, and the obvious
auxiliary `(1 − e^{iz})/z²` has a simple pole at 0 with residue `−i`. Subtracting its principal part
gives the entire function `(1 − e^{iz} + iz)/z²`, and then the π has to come from somewhere else: it
migrates to the large arc, where `z·f(z) → i` and **L5** — not L2, not Jordan — delivers
`iα·L = iπ·i = −π`. So the indentation and the non-vanishing arc are the *same* π, moved. The contrast
with C1 is the entry: same integral family, same value π/2, and the whole difference is whether `c₋₁`
is zero.

```jsonc
{
  "id": "removable-one-minus-cos",
  "title": "(1 - cos x)/x^2: removability detected, indentation not needed",
  "taxonomySection": "4",
  "tier": "C",

  "target": {
    "variable": "x", "lower": "0", "upper": "inf",
    "integrand": "(1 - cos(x))/x^2",
    "symbols": {},
    "principalValue": false          // and it must NOT be set: the integrand is bounded at 0
  },

  // ⚠ GAP G1 — proposed field.
  "auxiliary": {
    "integrand": "(1 - exp(i*z) + i*z)/z^2",
    "relation": "Re(f|_R) = (1 - cos x)/x^2 exactly; Im(f|_R) = (x - sin x)/x^2 is ODD and cancels over [-R,R]",
    "extract": "Re",
    "fold": "target = extract(pieces[role=target]) / 2",
    "construction": "principalPartSubtract(  (1-exp(i z))/z^2 , 0 )  -- kernel/quadrature/poleSubtract.ts",
    "alternative": "(1 - exp(i*z))/z^2 with an indentation; see invariants and golden[1]"
  },

  "parameters": [],

  "hypotheses": [
    { "id": "removable-at-origin",
      "statement": "the auxiliary has a REMOVABLE singularity at z = 0 (c_{-1} = 0), so no indentation is required",
      "check": "algebraic:laurentCoefficient(auxiliary, 0, -1) == 0 && isBounded(auxiliary, near 0)",
      "onFail": "refuse" },
    { "id": "entire",
      "statement": "the auxiliary is entire: the residue sum is empty and the closed contour value is 0",
      "check": "algebraic:poleCount(auxiliary, C) == 0",
      "onFail": "warn" },
    { "id": "large-arc-limit-exists",
      "statement": "z*f(z) -> i uniformly on |z| = R, Im z >= 0 (so L5 applies and the arc does NOT vanish)",
      "check": "symbolic:uniformLimit(z*auxiliary, |z|->inf, upperHalfPlane) == i",
      "onFail": "refuse" },
    { "id": "imaginary-part-odd",
      "statement": "Im(f) on R is odd, so the target pieces contribute 2 * int_0^inf of the real part and nothing else",
      "check": "algebraic:isOdd(Im(auxiliary|_R))",
      "onFail": "refuse" },
    { "id": "exponential-not-cosine",
      "statement": "the complexification must use exp(i z), never cos z",
      "check": "structural:noUnboundedOnArc(auxiliary, upperHalfPlane)",
      "onFail": "refuse" }
  ],

  "branch": null,

  "contour": {
    "template": "semicircle",        // NOT indentedSemicircle - that is the entry's whole point
    "limitParams": [ { "name": "R", "to": "inf" } ],
    "pieces": [
      { "id": "line",   "name": "the real axis, undivided",
        "kind": "segment", "from": "-R", "to": "R", "role": "target", "colour": 0 },
      { "id": "bigarc", "name": "the R -> inf semicircle",
        "kind": "arc", "center": "0", "radius": "R", "theta0": "0", "theta1": "pi",
        "role": "vanish", "lemma": "L5", "colour": 1 }
    ],
    "orientation": "ccw",
    "encloses": "nothing: the auxiliary is entire",
    "windings": {}                   // ⚠ GAP G3 — empty because there are no poles at all
  },

  "vanishingLemmas": [
    { "lemma": "L5", "piece": "bigarc",
      "sideCondition": "z*f(z) -> L uniformly along the arc of angle alpha; here L = i, alpha = +pi",
      "discharge": "symbolic:largeArcResidue(auxiliary, alpha=pi) = i*pi*i = -pi   [NOT zero]",
      "rigorIfDischarged": "=", "rigorIfNumericOnly": "≈" }
  ],

  "residueSelection": { "rule": "inside", "set": "{}  (empty: entire integrand)" },

  "closedForm": {
    "expr": "( 2*pi*i*Sum(Res) - i*alpha*lim(z*f) ) / 2",
    "simplified": "pi/2"
  },

  "rigor": { "policy": "min",
             "inputs": ["hypotheses.*", "vanishingLemmas.*.rigor", "auxiliary.extract"] },

  "traps": [
    { "id": "reflex-indentation",
      "detect": "contour.template == 'indentedSemicircle' && hypotheses['removable-at-origin'] == true",
      "message": "There is nothing at z = 0 to detour around: the Laurent series of (1 - exp(i z) + i z)/z^2 is 1/2 + i z/6 + ... with c_{-1} = 0. An indentation here is harmless but it is not a repair, and printing it in the derivation teaches that every boundary point needs one. Removability is DETECTED (gcd cancellation / c_{-1} = 0), not assumed." },
    { "id": "cos-z-on-the-arc",
      "detect": "structural:contains(auxiliary, cos(z)) || structural:contains(auxiliary, sin(z))",
      "message": "cos z is UNBOUNDED on every large arc in BOTH half-planes: |cos(i Y)| = cosh Y (1.1e4 at R=10, 2.4e8 at R=20, 1.2e17 at R=40). No L1/L2/L3 bound exists, so no lemma discharges the arc. Asserting that the arc vanishes because the integrand 'decays like 1/R^2' gives 2T + 0 = 0, i.e. T = 0 - the answer is pi/2. (The arc's value is in fact finite and equal to -pi: split (1-cos z)/z^2 into 1/z^2 - (1/2)exp(i z)/z^2 - (1/2)exp(-i z)/z^2, the first two -> 0 by ML on the upper arc and the third -> 2 pi because the FULL circle gives 2 pi i Res_0 = 2 pi while its lower half vanishes. But it is recoverable neither by a lemma nor in float64: direct quadrature gives -2.949 at R=10, then 5.4e3 at R=50, 3.4e68 at R=200 and NaN at R=1000, as the exp(R) integrand cancels away 16 digits.) Complexify with exp(i z) and take the real part at the end." },
    { "id": "l2-instead-of-l5",
      "detect": "vanishingLemmas[piece='bigarc'].lemma in ['L1','L2','L3']",
      "message": "The arc does not vanish. z*f(z) -> i, not 0, so |f| ~ 1/|z| and the decay hypothesis of L2 (p > 1) fails; Jordan needs f = exp(i a z) g with g -> 0, and the surviving +i z/z^2 = i/z term is not of that shape. L5 is the lemma that applies and it returns i*alpha*L = -pi. Claiming L2 here yields T = 0." },
    { "id": "dropped-principal-part-bookkeeping",
      "detect": "auxiliary.construction == 'principalPartSubtract' && !ledger.rows.any(r => r.pieceId == 'bigarc' && r.claim.includes('L5'))",
      "message": "Subtracting the principal part i/z to make the origin removable does not delete that term - it moves its contribution onto the large arc. The indentation's -i*pi*Res and the arc's i*pi*L are the same pi. If you subtract the principal part AND keep the indentation's contribution, you count it twice." }
  ],

  "golden": [
    // method: (a) head sum of (1/2)*sinc(x/2)^2 over half-periods to 40*pi (64-pt GL each) plus
    //         tail  1/A - int_A^inf cos x/x^2 dx, the latter decomposed at the zeros of cos
    //         (pi/2 + k pi) and Euler-accelerated;  1.5707963267948957, rel 5.7e-16.
    //         (b) direct sum to 2000*pi + accelerated tail; 1.5707963267948999, rel 2.1e-15.
    { "params": {}, "value": "pi/2", "numeric": 1.5707963267948966, "verifiedTo": 3e-15 },
    // cross-check of the ALTERNATIVE route: f = (1 - exp(i z))/z^2, simple pole at 0 with Res = -i,
    // indentation (alpha = -pi) contributes i*(-pi)*(-i) = -pi, big arc -> 0 by L1 (|f| <= 2/R^2).
    // Verified: closed contour total 1.5e-7 at rho=1e-6, R=2000; small arc measured (-3.1415917, 0).
    { "params": { "route": "indented, aux = (1-exp(i z))/z^2" }, "value": "pi/2",
      "numeric": 1.5707963267948966, "verifiedTo": 1e-6 }
  ]
}
```

## C3 · `pv-sine-over-x-times-quadratic`

**What this entry exists to teach: two singularities of different kinds in one ledger, and where the
p.v. actually lives.** `e^{iz}/(z(z²+1))` has a simple pole *on* the contour at 0 and a simple pole
*inside* it at `i`. Both must be accounted, by different mechanisms and with different weights:
`n(γ,0) = 0` with an L4 contribution of `−iπ·Res(f,0) = −iπ`, and `n(γ,i) = 1` with a residue
contribution of `2πi·Res(f,i) = −iπ/e`. Getting `π(1 − e^{−1})` requires both, with the right signs, and
the two are easy to conflate because they both look like "π times a residue". The subtler lesson is the
principal value. The auxiliary genuinely needs one — `∫cos x/(x(x²+1))` diverges at the origin — while
the target `sin x/(x(x²+1))` is bounded at 0 (removable, value 1) and decays like `x⁻³`, so it is
absolutely convergent and its p.v. is just its value. Research 03 §13 lists C3 with a `p.v.` qualifier,
which is *correct but inherited*: the p.v. is a property of the auxiliary and of the derivation, not of
the target. DESIGN §2.3's rule that "p.v. is a DISTINCT result type, never a flag on a value" is exactly
right, and the schema does not currently let us obey it (gap G6).

```jsonc
{
  "id": "pv-sine-over-x-times-quadratic",
  "title": "p.v. int_R sin x / (x (x^2+1)) dx: a real pole and a complex pole together",
  "taxonomySection": "4",
  "tier": "C",

  "target": {
    "variable": "x", "lower": "-inf", "upper": "inf",
    "integrand": "sin(x)/(x*(x^2+b^2))",
    "symbols": {},
    // ⚠ GAP G6. true because the gallery poses the entry as a principal value (research 03 s13),
    // and because the ledger's result type is a p.v. But `hypotheses.pv-coincides` PROVES the
    // stronger statement, and there is no field to record that upgrade. A boolean cannot carry it.
    "principalValue": true
  },

  // ⚠ GAP G1 — proposed field.
  "auxiliary": {
    "integrand": "exp(i*z)/(z*(z^2+b^2))",
    "relation": "sin(x) = Im(exp(i x)) for real x",
    "extract": "Im",
    "fold": "target = extract(pieces[role=target])",    // no halving: the target IS over all of R
    "principalValue": true,
    "principalValueIsEssential": true    // Re part, cos x/(x(x^2+b^2)), diverges at x = 0
  },

  "parameters": [
    { "name": "b", "domain": "real", "constraints": ["b > 0"] }
  ],

  "hypotheses": [
    { "id": "real-pole-simple",
      "statement": "z = 0 is a simple pole of the auxiliary (L4 requires it)",
      "check": "algebraic:poleOrder(auxiliary, 0) == 1",
      "onFail": "refuse" },
    { "id": "complex-poles-off-axis",
      "statement": "z = +- i b are simple and NOT on the contour",
      "check": "algebraic:distance({i*b, -i*b}, contour) > r_min && poleOrder == 1",
      "onFail": "refuse" },
    { "id": "no-pole-collision",
      "statement": "b != 0: otherwise the real pole and the complex pair collide into a triple pole on the axis",
      "check": "algebraic:b != 0",
      "onFail": "refuse" },
    { "id": "jordan-decay",
      "statement": "M_R = max |1/(z(z^2+b^2))| on the upper arc ~ R^-3 -> 0",
      "check": "symbolic:degreeBound(1/(z*(z^2+b^2))) => M_R = O(R^-3)",
      "onFail": "refuse" },
    { "id": "pv-coincides",
      "statement": "the TARGET converges absolutely (removable at 0, O(x^-3) at infinity), so p.v. = the integral; the p.v. is inherited from the auxiliary",
      "check": "algebraic:isRemovable(target.integrand, 0) && decayExponent(target.integrand) > 1",
      "onFail": "warn" }
  ],

  "branch": null,

  "contour": {
    "template": "indentedSemicircle",
    "limitParams": [ { "name": "R", "to": "inf" }, { "name": "rho", "to": "0+" } ],
    "pieces": [
      { "id": "left",   "name": "real axis, x < -rho",
        "kind": "segment", "from": "-R", "to": "-rho", "role": "target", "colour": 0 },
      { "id": "indent", "name": "the indentation over the real pole z = 0",
        "kind": "arc", "center": "0", "radius": "rho", "theta0": "pi", "theta1": "0",
        "role": "vanish", "lemma": "L4", "colour": 3 },
      { "id": "right",  "name": "real axis, x > rho",
        "kind": "segment", "from": "rho", "to": "R", "role": "target", "colour": 0 },
      { "id": "bigarc", "name": "the R -> inf semicircle",
        "kind": "arc", "center": "0", "radius": "R", "theta0": "0", "theta1": "pi",
        "role": "vanish", "lemma": "L3", "colour": 1 }
    ],
    "orientation": "ccw",
    "encloses": "z = i*b only",
    // ⚠ GAP G3 — proposed field. Three poles, three DIFFERENT winding numbers; this is the entry.
    "windings": { "0": 0, "i*b": 1, "-i*b": 0 }
  },

  "vanishingLemmas": [
    { "lemma": "L4", "piece": "indent",
      "sideCondition": "simple pole at 0; alpha = -pi (clockwise)",
      "discharge": "symbolic:fractionalResidue(auxiliary, 0, alpha=-pi) = -i*pi*Res(f,0) = -i*pi/b^2",
      "signSource": "L8 (Sokhotski-Plemelj), as in C1: the indentation direction IS the i-eps prescription and it sets the sign. With TWO singularities in play the two contributions (+pi*i*Res on the real pole, 2*pi*i*Res on the enclosed one) differ by exactly this factor of two, so a hand-chosen sign here is indistinguishable from a winding-number error.",
      "rigorIfDischarged": "=", "rigorIfNumericOnly": "≈" },
    { "lemma": "L3", "piece": "bigarc",
      "sideCondition": "a = 1 > 0, upper arc; M_R = O(R^-3) -> 0",
      "discharge": "symbolic:jordanBound(a=1, g=1/(z(z^2+b^2))) => |int| <= pi/(R*(R^2-b^2))",
      "rigorIfDischarged": "≤", "rigorIfNumericOnly": "≈" }
  ],

  "residueSelection": { "rule": "upperHalfPlane", "set": "{i*b}" },

  "closedForm": {
    "expr": "Im( 2*pi*i*Sum(Res(f,z_k) : Im z_k > 0) + pi*i*Sum(Res(f,x_j) : x_j in R) )",
    "simplified": "(pi/b^2)*(1 - exp(-b))"
  },

  "rigor": { "policy": "min",
             "inputs": ["hypotheses.*", "vanishingLemmas.*.rigor", "residues.*.rigor", "auxiliary.extract"] },

  "traps": [
    { "id": "real-pole-counted-as-enclosed",
      "detect": "contour.windings['0'] != 0",
      "message": "The indentation detours OVER z = 0, so n(gamma, 0) = 0 and the real pole contributes nothing to the residue sum. Its contribution arrives separately, through L4, as pi*i*Res - half of 2*pi*i*Res, with the sign set by the traversal direction. Weighting it 2*pi*i*Res instead overshoots by pi*i*Res(f,0) = pi*i, turning pi(1 - 1/e) = 1.9859 into 1.9859 + pi = 5.1275; adding 2*pi*i*Res(f,0) to the residue sum while ALSO keeping the indentation's pi*i*Res overshoots by 2*pi*i and gives 1.9859 + 2*pi = 8.2690." },
    { "id": "lower-pole-included",
      "detect": "residueSelection.set.includes('-i*b')",
      "message": "z = -i*b lies outside the upper semicircle: n(gamma, -i*b) = 0. Including it (a common symmetry reflex, since the poles come as a conjugate pair) adds 2*pi*i*Res(f,-i*b) = i*pi*exp(b)/b^2 - a term that GROWS with b, which is the shape of the error to look for." },
    { "id": "pv-claimed-of-the-target",
      "detect": "result.type == 'principalValue' && hypotheses['pv-coincides'] == true && !result.notes.includes('coincides')",
      "message": "The principal value here belongs to the AUXILIARY: pv int exp(i x)/(x(x^2+b^2)) is needed because int cos x/(x(x^2+b^2)) diverges at 0. The target sin x/(x(x^2+b^2)) is bounded at 0 (removable, value 1/b^2) and O(x^-3) at infinity, so it converges absolutely and its p.v. equals its value. Report BOTH facts: 'p.v. = ...' without 'and the integral converges, so this is also its value' understates the result; 'int = ...' without recording that the derivation ran through a p.v. hides a hypothesis." },
    { "id": "real-part-not-checked",
      "detect": "!invariants.includes('Re(pv) == 0')",
      "message": "The real part of the identity says pv int cos x/(x(x^2+b^2)) dx = 0, which is independently true by oddness. It is a free consistency check on the whole sign bookkeeping and costs nothing; measured -5.1e-8 at R = 600." },
    { "id": "double-pole-on-the-axis",
      "detect": "algebraic:poleOrder(auxiliary, anyRealPoint) >= 2",
      "message": "Double poles on the axis kill the method: L4 fails and no principal value exists (Hadamard finite part is a different object). Refuse; do not emit a number." }
  ],

  "golden": [
    // method: (a) half-period decomposition of the EVEN integrand sinc(x)/(x^2+1) at multiples of pi,
    //         64-pt GL per period, repeated-averaging tail, doubled by evenness -> 1.9858653037988714
    //         (rel 0.0e0 against pi(1-1/e));  (b) direct composite GL to x = 2000 plus an accelerated
    //         oscillatory tail -> identical to all 17 digits.
    //         Contour bookkeeping verified separately: closed total = 2*pi*i*Res(f,i) to 4.4e-8 at
    //         rho = 1e-7, R = 600; the indentation measured (0, -3.1415925) = -i*pi.
    { "params": { "b": 1 }, "value": "pi*(1 - exp(-1))", "numeric": 1.9858653037988714, "verifiedTo": 2e-16 },
    { "params": { "b": 2 }, "value": "(pi/4)*(1 - exp(-2))", "numeric": 0.67910608050053922, "verifiedTo": 1e-15 }
  ]
}
```

---

# Tier D — the branch data is the answer

## D1 · `mellin-keyhole`

**What this entry exists to teach: the `argRange` is an input to the answer, and the wrong one is a
division by zero.** The keyhole works because `z^{α−1}` returns to the positive real axis multiplied by
`e^{2πi(α−1)}`; the two straight edges therefore *fail* to cancel, and `1 − e^{2πiα}` is the whole
mechanism. Choose `arg ∈ (−π,π]` instead and three things go wrong at once, each of which the ledger
catches at a different pass: the cut moves to `ℝ₋` and the pole of `1/(1+z)` at `z = −1` lands **on**
it (LEGALITY, pass 1, step 1); the outer and inner circles now cross the cut with no `side` tag
(LEGALITY, step 2); and the lower edge, having gained no phase, reproduces the target with factor
exactly `−1`, so `1 + Σcⱼ = 1 − 1 = 0` and SOLVE (pass 5) divides by zero. The classical symptom is
"the two edges cancel and my integral collapses to 0" — and the app never prints 0, because the
denominator is zero rather than the numerator. That is the difference between a hard-coded trap
detector and a structural one, and it is worth the whole design.

```jsonc
{
  "id": "mellin-keyhole",
  "title": "int_0^inf x^(alpha-1)/(1+x) dx = pi/sin(pi alpha): the keyhole and Euler reflection",
  "taxonomySection": "5.1",
  "tier": "D",

  "target": {
    "variable": "x", "lower": "0", "upper": "inf",
    "integrand": "x^(alpha-1)/(1+x)",
    "symbols": { "R": { "kind": "rationalFn", "var": "x", "value": "1/(1+x)" } },
    "principalValue": false
  },

  "parameters": [
    { "name": "alpha", "domain": "real",
      "constraints": ["alpha > 0", "alpha < 1", "alpha not in Z"] }
  ],

  "hypotheses": [
    { "id": "R-rational",       "statement": "R is rational with finitely many poles",
      "check": "structural:isRational(R)", "onFail": "refuse" },
    { "id": "no-poles-on-cut",  "statement": "R has no pole on [0, inf)",
      "check": "algebraic:noRealNonnegativeRoot(denom(R))", "onFail": "refuse" },
    { "id": "fundamental-strip","statement": "-m < alpha < d with R = O(x^-d) at inf, O(x^m) at 0; here 0 < alpha < 1",
      "check": "algebraic:strip(alpha, ord0(R), decayExponent(R))", "onFail": "refuse" },
    { "id": "cut-admissible",
      "statement": "branch points {0, inf}, exponent alpha-1 not in Z at 0, so the cut MUST join 0 to inf (research 06 s2.1(b): no bounded component is possible)",
      "check": "branch:validateCutSystem(branch) == ok", "onFail": "refuse" },
    { "id": "nondegenerate-solve",
      "statement": "1 + Sum(c_j) = 1 - exp(2 pi i alpha) != 0",
      "check": "algebraic:abs(1 - exp(2*pi*i*alpha)) > cond_min", "onFail": "refuse" }
  ],

  "branch": {
    "function": "z^(alpha-1)",
    "cut": { "ray": "[0, inf)", "argRange": [0, 6.283185307179586] },   // arg z in (0, 2pi)
    "crossingPhase": "exp(2*pi*i*(alpha-1))"      // convention CP; == exp(2*pi*i*alpha)
  },

  "contour": {
    "template": "keyhole",
    "limitParams": [ { "name": "R", "to": "inf" }, { "name": "eps", "to": "0+" } ],
    "pieces": [
      { "id": "upper", "name": "the upper edge of the cut",
        "kind": "segment", "from": "eps", "to": "R", "side": "above",
        "role": "target", "colour": 0 },
      { "id": "outer", "name": "the R -> inf circle",
        "kind": "arc", "center": "0", "radius": "R", "theta0": "0", "theta1": "2*pi",
        "role": "vanish", "lemma": "L2", "colour": 1 },
      { "id": "lower", "name": "the lower edge of the cut",
        "kind": "segment", "from": "R", "to": "eps", "side": "below",
        "role": "reproduces", "factor": "-exp(2*pi*i*(alpha-1))", "colour": 2 },
      { "id": "inner", "name": "the eps -> 0 circle",
        "kind": "arc", "center": "0", "radius": "eps", "theta0": "2*pi", "theta1": "0",
        "role": "vanish", "lemma": "L1", "colour": 3 }
    ],
    "orientation": "ccw",
    "encloses": "all poles of R off [0, inf); here the single simple pole z = -1 = exp(i pi)",
    "windings": { "-1": 1 }          // ⚠ GAP G3
  },

  "vanishingLemmas": [
    { "lemma": "L2", "piece": "outer",
      "sideCondition": "|z^(alpha-1) R(z)| <= M/|z|^p with p = 2 - alpha > 1 on |z| = R, R >= R0; needs alpha < 1",
      "discharge": "symbolic:degreeBound(alpha, R) => |int| <= 2*pi*R * R^(alpha-1)/(R-1) ~ 2*pi*R^(alpha-1) -> 0",
      "rigorIfDischarged": "≤", "rigorIfNumericOnly": "≈" },
    { "lemma": "L1", "piece": "inner",
      "sideCondition": "eps * max_{|z|=eps} |z^(alpha-1) R(z)| -> 0; needs alpha > 0",
      "discharge": "symbolic:ord0Bound(alpha, R) => |int| <= 2*pi*eps^alpha/(1-eps) -> 0",
      "rigorIfDischarged": "≤", "rigorIfNumericOnly": "≈" }
  ],

  "residueSelection": { "rule": "notOn", "set": "[0, inf)" },

  "closedForm": {
    "expr": "(2*pi*i/(1 - exp(2*pi*i*alpha))) * Sum(Res(z^(alpha-1)*R(z), z_k))",
    "simplified": "pi/sin(pi*alpha)"
  },

  "rigor": { "policy": "min",
             "inputs": ["hypotheses.*", "vanishingLemmas.*.rigor", "residues.*.rigor", "branch.*"] },

  "traps": [
    { "id": "wrong-branch",
      "detect": "branch.cut.argRange != [0, 2*pi]",
      "message": "With arg in (-pi, pi] the cut lies on R_-, so the two sides of R_+ are THE SAME SIDE: the lower edge gains no phase, its factor is -exp(0) = -1, and 1 + Sum(c_j) = 1 - 1 = 0. The system then carries no information about the target and the app REFUSES - the classical symptom 'the two edges cancel and the integral collapses to 0' appears as a division by zero, not as a numerator of zero. Two earlier refusals fire first: the pole z = -1 now lies ON the cut (LEGALITY step 1), and both circles cross the cut untagged (LEGALITY step 2). Report the earliest; attach this message to the degenerate SOLVE row." },
    { "id": "branch-point-is-not-a-pole",
      "detect": "residues.any(r => r.at == 0)",
      "message": "z = 0 is a BRANCH POINT of z^(alpha-1), not a pole: there is no Laurent series there and no residue to take. The inner circle is killed by the ML bound 2*pi*eps^alpha/(1-eps), which is exactly where the hypothesis alpha > 0 is spent. Asking for Res(f, 0) is a category error, and a numeric residue routine will happily return a meaningless number from a circle that crosses the cut." },
    { "id": "residue-with-the-wrong-argument",
      "detect": "arg(polePoint) not in branch.cut.argRange",
      "message": "The pole is at z = -1 = exp(i pi) with arg = pi, which IS in (0, 2pi). Evaluating (-1)^(alpha-1) as exp(-i pi (alpha-1)) - i.e. with arg = -pi, the principal determination - changes the answer by exp(2 pi i (alpha-1)) and NOTHING warns you. Every residue must be evaluated in the declared argRange; the check is arithmetic, not a convention." },
    { "id": "missing-reversal-sign",
      "detect": "contour.pieces['lower'].factor == 'exp(2*pi*i*(alpha-1))'",
      "message": "The lower edge is traversed R -> eps. Its factor (convention F) is the full multiplier of the target INCLUDING the reversal: -exp(2 pi i (alpha-1)). Dropping the minus sign turns 1 - exp(2 pi i alpha) into 1 + exp(2 pi i alpha) and produces pi/tan(pi alpha)-shaped nonsense that is finite and plausible-looking." },
    { "id": "circles-asserted-not-proved",
      "detect": "vanishingLemmas.any(l => l.discharge == null)",
      "message": "'The circles clearly vanish' is where the hypothesis 0 < alpha < 1 actually lives: the inner circle needs alpha > 0, the outer needs alpha < 1. At alpha = 1 the outer bound is 2*pi*R^0 = 2*pi and does NOT tend to zero; at alpha = 0 the inner bound is 2*pi. The bounds are the content of the theorem, not preamble." },
    { "id": "pole-on-cut",
      "detect": "hypotheses['no-poles-on-cut'] == false",
      "message": "A pole of R on [0, inf) sits on the contour: the residue theorem does not apply and the integral does not converge. Refuse." }
  ],

  "golden": [
    // method: double-exponential (exp-sinh) quadrature on (0, inf), which absorbs the x^(alpha-1)
    // endpoint singularity; all five points agree with pi/sin(pi alpha) to <= 7e-16 relative.
    // Contour bookkeeping verified independently: closed-contour total = 2*pi*i*exp(i pi (alpha-1))
    // to 8.7e-16 at eps=1e-9, R=1e9, and c = lower/I recovered as -exp(2 pi i alpha) to the same
    // truncation as the edge itself (the inner circle is still 1.1e-2 at eps=1e-9 - it vanishes only
    // like eps^alpha = eps^0.3, which is a good live demonstration of a slow limit).
    { "params": { "alpha": 0.3 },  "value": "pi/sin(pi*alpha)", "numeric": 3.8832220774509327,  "verifiedTo": 7e-16 },
    { "params": { "alpha": 0.5 },  "value": "pi",               "numeric": 3.1415926535897931,  "verifiedTo": 2e-16 },
    { "params": { "alpha": 0.75 }, "value": "pi/sin(3*pi/4)",   "numeric": 4.4428829381583661,  "verifiedTo": 1e-16 },
    { "params": { "alpha": 0.1 },  "value": "pi/sin(pi/10)",    "numeric": 10.166407384630521,  "verifiedTo": 4e-16 },
    { "params": { "alpha": 0.9 },  "value": "pi/sin(9*pi/10)",  "numeric": 10.166407384630517,  "verifiedTo": 7e-16 }
  ]
}
```

## D2 · `keyhole-two-poles`

**What this entry exists to teach: several poles off one cut, and a crossing phase that is a real
number.** D1 has one pole and a phase that stays visibly complex; D2 has two, and at `s = 3/2` the
crossing phase is `e^{2πi·(1/2)} = −1`, so the reproduces factor is `−(−1) = +1` and the two edges
**add** rather than fight. `1 + Σcⱼ = 2`, which is about as far from degenerate as the keyhole gets —
and precisely for that reason it is the entry where a sign error hides best, because every quantity in
sight is real or purely imaginary. The residues are `i/√2` at `z = −2` and `−i` at `z = −4`: opposite
in sign, so a wrong branch determination at either pole does not produce a visibly complex answer, it
produces a *plausible real one*. D2 also exercises the `s` half-integer path, which is where
`@cas/exact` must hand off `√2` to the closed-form recogniser rather than a float.

```jsonc
{
  "id": "keyhole-two-poles",
  "title": "int_0^inf sqrt(x)/(x^2+6x+8) dx = pi(1 - 1/sqrt 2): two poles off one cut",
  "taxonomySection": "5.1",
  "tier": "D",

  "target": {
    "variable": "x", "lower": "0", "upper": "inf",
    "integrand": "x^(s-1)/((x+p)*(x+q))",
    "symbols": { "R": { "kind": "rationalFn", "var": "x", "value": "1/(x^2+6*x+8)" } },
    "principalValue": false
  },

  "parameters": [
    { "name": "s", "domain": "real", "constraints": ["s > 0", "s < 2", "s not in Z"] },
    { "name": "p", "domain": "real", "constraints": ["p > 0"] },
    { "name": "q", "domain": "real", "constraints": ["q > 0", "q != p"] }
  ],

  "hypotheses": [
    { "id": "no-poles-on-cut",
      "statement": "x^2 + 6x + 8 = (x+2)(x+4) has no root on [0, inf)",
      "check": "algebraic:noRealNonnegativeRoot(denom(R))", "onFail": "refuse" },
    { "id": "roots-real-distinct",
      "statement": "the two poles are simple (a repeated root needs the order-m residue path)",
      "check": "algebraic:isSquarefree(denom(R))", "onFail": "warn" },
    { "id": "fundamental-strip",
      "statement": "0 < Re s < 2 (R = O(x^-2) at inf, O(1) at 0); here s = 3/2",
      "check": "algebraic:strip(s, ord0(R), decayExponent(R))", "onFail": "refuse" },
    { "id": "nondegenerate-solve",
      "statement": "1 - exp(2 pi i s) != 0, i.e. s not an integer; at s = 3/2 it equals 2",
      "check": "algebraic:abs(1 - exp(2*pi*i*s)) > cond_min", "onFail": "refuse" }
  ],

  "branch": {
    "function": "z^(s-1)",
    "cut": { "ray": "[0, inf)", "argRange": [0, 6.283185307179586] },
    "crossingPhase": "exp(2*pi*i*(s-1))"          // s = 3/2  =>  exp(i pi) = -1
  },

  "contour": {
    "template": "keyhole",
    "limitParams": [ { "name": "R", "to": "inf" }, { "name": "eps", "to": "0+" } ],
    "pieces": [
      { "id": "upper", "name": "upper edge, arg z = 0+",
        "kind": "segment", "from": "eps", "to": "R", "side": "above", "role": "target", "colour": 0 },
      { "id": "outer", "name": "the R -> inf circle",
        "kind": "arc", "center": "0", "radius": "R", "theta0": "0", "theta1": "2*pi",
        "role": "vanish", "lemma": "L2", "colour": 1 },
      { "id": "lower", "name": "lower edge, arg z = 2pi-",
        "kind": "segment", "from": "R", "to": "eps", "side": "below",
        "role": "reproduces", "factor": "-exp(2*pi*i*(s-1))", "colour": 2 },
      { "id": "inner", "name": "the eps -> 0 circle",
        "kind": "arc", "center": "0", "radius": "eps", "theta0": "2*pi", "theta1": "0",
        "role": "vanish", "lemma": "L1", "colour": 3 }
    ],
    "orientation": "ccw",
    "encloses": "z = -p and z = -q, i.e. -2 and -4, both at arg = pi",
    "windings": { "-2": 1, "-4": 1 }              // ⚠ GAP G3
  },

  "vanishingLemmas": [
    { "lemma": "L2", "piece": "outer",
      "sideCondition": "|z^(s-1) R(z)| <= M/|z|^p with p = 3 - s > 1 for s < 2",
      "discharge": "symbolic:degreeBound(s, R) => |int| <= 2*pi*R^(s-2)/(1 - 6/R - 8/R^2) -> 0 for s < 2",
      "rigorIfDischarged": "≤", "rigorIfNumericOnly": "≈" },
    { "lemma": "L1", "piece": "inner",
      "sideCondition": "eps * max |z^(s-1) R(z)| -> 0; needs s > 0",
      "discharge": "symbolic:ord0Bound(s, R) => |int| <= 2*pi*eps^s/(8 - 6*eps - eps^2) -> 0",
      "rigorIfDischarged": "≤", "rigorIfNumericOnly": "≈" }
  ],

  "residueSelection": { "rule": "notOn", "set": "[0, inf)" },

  "closedForm": {
    "expr": "(2*pi*i/(1 - exp(2*pi*i*s))) * ( (p*exp(i*pi))^(s-1)/(q-p) + (q*exp(i*pi))^(s-1)/(p-q) )",
    "simplified": "(pi/sin(pi*s)) * (p^(s-1) - q^(s-1))/(q - p)"
  },

  "rigor": { "policy": "min",
             "inputs": ["hypotheses.*", "vanishingLemmas.*.rigor", "residues.*.rigor", "branch.*"] },

  "traps": [
    { "id": "residue-with-the-wrong-argument",
      "detect": "residues.any(r => arg(r.at) != pi)",
      "message": "Both poles sit at arg = pi under the declared argRange (0, 2pi): (-2)^(1/2) = sqrt2 * exp(i pi/2) = i sqrt2, NOT -i sqrt2. The measured residues are Res(-2) = +i/sqrt2 and Res(-4) = -i, of OPPOSITE sign - so a wrong determination at one pole does not make the answer visibly complex, it silently flips a term. Here it turns pi(1 - 1/sqrt2) = 0.9202 into pi(1 + 1/sqrt2) = 5.3653." },
    { "id": "phase-mistaken-for-cancellation",
      "detect": "ledger.row('SOLVE').denominator == 0 && s not in Z",
      "message": "At s = 3/2 the crossing phase is exp(i pi) = -1 and the factor is c = -(-1) = +1, so 1 + c = 2 and the two edges ADD. A real-valued phase looks like 'no phase', which is exactly when a reader concludes the edges must cancel. They do not: the keyhole for a square root is the case where the cancellation is maximally absent." },
    { "id": "branch-point-is-not-a-pole",
      "detect": "residues.any(r => r.at == 0)",
      "message": "z = 0 is a branch point of z^(1/2). The inner circle is discharged by ML (bound 2*pi*eps^(3/2)/8), never by a residue." },
    { "id": "pole-on-cut",
      "detect": "hypotheses['no-poles-on-cut'] == false",
      "message": "Change the quadratic to x^2 - 6x + 8 = (x-2)(x-4) and both poles land on [0, inf), on the cut and on the contour. The integral diverges and the method does not apply - the app must refuse rather than return the same formula with p = -2, q = -4 substituted, which yields a finite and entirely fictitious number." }
  ],

  "golden": [
    // method: (a) exp-sinh DE quadrature on (0, inf) -> 0.92015118451061029 (rel 0.0e0);
    //         (b) x = t^2 to remove the sqrt, then a split at t = 1 with t -> 1/u on (1, inf),
    //             composite 60-pt GL -> 0.92015118451059041 (rel 2.2e-14).
    // Contour: closed total = 2*pi*i*(i/sqrt2 - i) to 5.1e-15 at eps = 1e-10, R = 1e10; c recovered
    // as +1 to 2.2e-5 (the edge truncation, not the factor).
    { "params": { "s": 1.5, "p": 2, "q": 4 }, "value": "pi*(1 - 1/sqrt(2))",
      "numeric": 0.92015118451061029, "verifiedTo": 1e-14 },
    { "params": { "s": 1.5, "p": 1, "q": 3 }, "value": "(pi/2)*(sqrt(3) - 1)",
      "numeric": 1.1499027195564300, "verifiedTo": 2e-16 },
    { "params": { "s": 0.5, "p": 1, "q": 1 }, "value": "pi*(1-s)/sin(pi*s) = pi/2",
      "numeric": 1.5707963267948966, "verifiedTo": 6e-16,
      "note": "DEGENERATE p = q: the simplified form (p^(s-1) - q^(s-1))/(q-p) is 0/0 and must NOT be evaluated by cancelling; z = -1 is a DOUBLE pole and the order-m residue path applies. Res = d/dz[z^(s-1)] at z = exp(i pi) = -i/2, giving I = 2 pi i (-i/2)/2 = pi/2. Quadrature: 1.5707963267948957." }
  ]
}
```

## D3 · `keyhole-x-to-the-n`

**What this entry exists to teach: a two-parameter family, a free cross-check, and the *same*
degeneracy from a different direction.** `∫₀^∞ x^{a−1}/(1+xⁿ) dx` puts `n` poles on the contour's
interior — the `n`-th roots of `−1`, all at `arg = π(2k+1)/n ∈ (0,2π)` — and the residue sum telescopes
as a geometric series whose `(1 − e^{2πia})` cancels against the solve denominator. Two things make it
the right third keyhole. First, the same integral is computable by the `2π/n` wedge (§7) with a single
residue, and the two answers must agree — DESIGN §9's invariant "§5.1 ≡ §7 under `u = xⁿ`", verified
below to 2.6e-16. Second, at **integer `a`** the integrand has no branch point at all, `1 + Σcⱼ =
1 − e^{2πia} = 0`, and the keyhole degenerates exactly as D1's wrong `argRange` does — while the closed
form `(π/n)/sin(πa/n)` remains perfectly finite and *correct by continuity*. The value survives; the
derivation does not. That distinction is the hardest thing in this file to say honestly, and the record
has to say it: the app must refuse the keyhole route and offer the wedge, not print the formula and
call it proved.

```jsonc
{
  "id": "keyhole-x-to-the-n",
  "title": "int_0^inf x^(a-1)/(1+x^n) dx = (pi/n)/sin(pi a/n): the two-parameter keyhole",
  "taxonomySection": "5.1",
  "tier": "D",

  "target": {
    "variable": "x", "lower": "0", "upper": "inf",
    "integrand": "x^(a-1)/(1+x^n)",
    "symbols": { "R": { "kind": "rationalFn", "var": "x", "value": "1/(1+x^n)" } },
    "principalValue": false
  },

  "parameters": [
    { "name": "a", "domain": "real",    "constraints": ["a > 0", "a < n", "a not in Z"] },
    { "name": "n", "domain": "integer", "constraints": ["n >= 2"] }
  ],

  "hypotheses": [
    { "id": "no-poles-on-cut",
      "statement": "1 + x^n has no root on [0, inf): the roots are the n-th roots of -1",
      "check": "algebraic:noRealNonnegativeRoot(1 + x^n)", "onFail": "refuse" },
    { "id": "fundamental-strip",
      "statement": "0 < a < n (integrability at 0 and at infinity)",
      "check": "algebraic:strip(a, 0, n)", "onFail": "refuse" },
    { "id": "poles-cyclotomic",
      "statement": "the poles are z_k = exp(i pi (2k+1)/n), k = 0..n-1, all simple, all with arg in (0, 2pi)",
      "check": "algebraic:cyclotomicRecogniser(1 + z^n) && all(arg(z_k) in argRange)", "onFail": "warn" },
    { "id": "nondegenerate-solve",
      "statement": "1 - exp(2 pi i a) != 0, i.e. a is NOT an integer",
      "check": "algebraic:abs(1 - exp(2*pi*i*a)) > cond_min", "onFail": "refuse" }
  ],

  "branch": {
    "function": "z^(a-1)",
    "cut": { "ray": "[0, inf)", "argRange": [0, 6.283185307179586] },
    "crossingPhase": "exp(2*pi*i*(a-1))"
  },

  "contour": {
    "template": "keyhole",
    "limitParams": [ { "name": "R", "to": "inf" }, { "name": "eps", "to": "0+" } ],
    "pieces": [
      { "id": "upper", "name": "upper edge", "kind": "segment", "from": "eps", "to": "R",
        "side": "above", "role": "target", "colour": 0 },
      { "id": "outer", "name": "the R -> inf circle", "kind": "arc", "center": "0", "radius": "R",
        "theta0": "0", "theta1": "2*pi", "role": "vanish", "lemma": "L2", "colour": 1 },
      { "id": "lower", "name": "lower edge", "kind": "segment", "from": "R", "to": "eps",
        "side": "below", "role": "reproduces", "factor": "-exp(2*pi*i*(a-1))", "colour": 2 },
      { "id": "inner", "name": "the eps -> 0 circle", "kind": "arc", "center": "0", "radius": "eps",
        "theta0": "2*pi", "theta1": "0", "role": "vanish", "lemma": "L1", "colour": 3 }
    ],
    "orientation": "ccw",
    "encloses": "all n roots of 1 + z^n",
    "windings": { "exp(i*pi*(2k+1)/n) for k=0..n-1": 1 }   // ⚠ GAP G3
  },

  "vanishingLemmas": [
    { "lemma": "L2", "piece": "outer",
      "sideCondition": "|z^(a-1)/(1+z^n)| <= M/|z|^p with p = n + 1 - a > 1 for a < n",
      "discharge": "symbolic:degreeBound(a, n) => |int| <= 2*pi*R^a/(R^n - 1) -> 0 iff a < n",
      "rigorIfDischarged": "≤", "rigorIfNumericOnly": "≈" },
    { "lemma": "L1", "piece": "inner",
      "sideCondition": "eps * max |z^(a-1)/(1+z^n)| -> 0; needs a > 0",
      "discharge": "symbolic:ord0Bound(a) => |int| <= 2*pi*eps^a/(1 - eps^n) -> 0 iff a > 0",
      "rigorIfDischarged": "≤", "rigorIfNumericOnly": "≈" }
  ],

  "residueSelection": { "rule": "notOn", "set": "[0, inf)" },

  "closedForm": {
    // Res at z_k = P/Q' = z_k^(a-1)/(n z_k^(n-1)) = z_k^(a-n)/n = -z_k^a/n  (because z_k^n = -1)
    "expr": "(2*pi*i/(1 - exp(2*pi*i*a))) * Sum_k( -exp(i*pi*a*(2k+1)/n)/n )",
    "simplified": "(pi/n)/sin(pi*a/n)"
  },

  "rigor": { "policy": "min",
             "inputs": ["hypotheses.*", "vanishingLemmas.*.rigor", "residues.*.rigor", "branch.*"] },

  "traps": [
    { "id": "integer-a-degenerate-keyhole",
      "detect": "a in Z",
      "message": "At integer a the integrand x^(a-1)/(1+x^n) has NO branch point: z^(a-1) is single-valued, the two edges are genuinely the same integral traversed both ways, the factor is c = -1 and 1 + Sum(c_j) = 1 - exp(2 pi i a) = 0 exactly. The keyhole carries no information about the target and the app must REFUSE - even though the closed form (pi/n)/sin(pi a/n) is still correct, by continuity in a. (Checked: a=1,n=3 -> 1.2091995761561; a=2,n=5 -> 0.66065319983882; a=1,n=2 -> 1.5707963267949, all matching quadrature to 1e-15.) The right repair is the 2pi/n WEDGE (taxonomy s7), which is non-degenerate for every a in (0,n) - that is gallery entry F1. A correct value obtained from a collapsed derivation is not a proof; print the wedge's derivation or print nothing." },
    { "id": "roots-of-minus-one-mislabelled",
      "detect": "residues.any(r => arg(r.at) not in [0, 2*pi))",
      "message": "The poles are the n-th roots of -1, at arg = pi(2k+1)/n for k = 0..n-1, which for k = n-1 is (2n-1)pi/n < 2pi - all inside the declared argRange. Using the principal determination puts roughly half of them at negative arguments and silently changes their z_k^a factors; the answer stays real and plausible." },
    { "id": "wedge-disagreement",
      "detect": "!invariants.satisfied('keyhole == wedge(2*pi/n)')",
      "message": "The same integral is (1 - exp(2 pi i a/n)) I = 2 pi i Res at z = exp(i pi/n) on the 2pi/n wedge. Verified equal to 2.6e-16 at a = 1.5, n = 4. Disagreement means a phase convention has drifted between the two routes; it is a free test and it should be wired as one (DESIGN s9.4)." },
    { "id": "branch-point-is-not-a-pole",
      "detect": "residues.any(r => r.at == 0)",
      "message": "z = 0 carries the branch point of z^(a-1), not a pole. No residue exists there for non-integer a." }
  ],

  "golden": [
    // method: exp-sinh DE quadrature on (0, inf); every point agrees with (pi/n)/sin(pi a/n) to
    // <= 1.1e-15 relative. Contour bookkeeping verified at a = 1.5, n = 4 (eps = 1e-9, R = 1e9):
    // closed total = 2*pi*i*Sum Res to 1.2e-14, edge factor c recovered to 3.7e-14.
    { "params": { "a": 1.5, "n": 4 }, "value": "(pi/4)/sin(3*pi/8)",  "numeric": 0.85010884618536919, "verifiedTo": 3e-16 },
    { "params": { "a": 0.5, "n": 2 }, "value": "(pi/2)/sin(pi/4)",    "numeric": 2.2214414690791831, "verifiedTo": 1e-16 },
    { "params": { "a": 2.3, "n": 5 }, "value": "(pi/5)/sin(2.3*pi/5)","numeric": 0.63331238805904555, "verifiedTo": 2e-16 },
    { "params": { "a": 3,   "n": 7 }, "value": "(pi/7)/sin(3*pi/7)",  "numeric": 0.46034065176003164, "verifiedTo": 1.1e-15,
      "note": "INTEGER a: the VALUE is right, the keyhole DERIVATION is degenerate. This entry must appear in refusals.json as well as here." },
    { "params": { "a": 1,   "n": 3 }, "value": "2*pi/(3*sqrt(3))",    "numeric": 1.2091995761561452, "verifiedTo": 2e-16,
      "note": "= gallery F1 by the wedge; keyhole refuses" }
  ]
}
```

## D4 · `log-squared-keyhole`

**What this entry exists to teach: `log` is inserted as a *device*, and the real and imaginary parts of
one identity are two different answers.** Nothing in `∫₀^∞ log x/(1+x²)² dx` asks for a `log²`, and
that is the point: the multivaluedness of `log²` is what manufactures a surviving term. Running the
keyhole on `R(z) log z` alone gives `−2πi∫R dx = 2πi ΣRes(R log z)` — the `log x` terms cancel and the
log integral is *lost*, which is exactly the classic "why did my log integral vanish?" moment and,
structurally, the same rank deficiency as D1's wrong branch. Going one power up, the lower edge
contributes `(log x + 2πi)² = log²x + 4πi log x − 4π²`; the `log²` terms cancel and the remainder is
**affine in two unknowns at once**:
`−4πi·A + 4π²·B = 2πi·Σ`, with `A = ∫R log x` and `B = ∫R`.
Taking real and imaginary parts of *that* equation: the imaginary part carries `A` and the real part
carries `B`; equivalently, in terms of the residue sum, `A = −Re(Σ)/2` and `B = −Im(Σ)/(2π)`. For
`R = 1/(1+z²)²` this returns `A = −π/4` and, for free, `B = π/4`. The separation is where the trick
lives, and the sense of it is easy to invert: the residue sum's *real* part gives the *log* integral.

```jsonc
{
  "id": "log-squared-keyhole",
  "title": "int_0^inf R(x) log x dx by the log^2 keyhole (R = 1/(1+x^2)^2, value -pi/4)",
  "taxonomySection": "5.2",
  "tier": "D",

  "target": {
    "variable": "x", "lower": "0", "upper": "inf",
    "integrand": "log(x)*R(x)",
    "symbols": { "R": { "kind": "rationalFn", "var": "x", "value": "1/(1+x^2)^2" } },
    "principalValue": false
  },

  // ⚠ GAP G1 + G2 — proposed fields. The contour integrand is R(z)(log z)^2, and the lower edge
  // reproduces an AFFINE COMBINATION of three real integrals, not a multiple of one target.
  "auxiliary": { "integrand": "R(z)*log(z)^2", "extract": "components" },
  "targets": [
    { "id": "T0", "expr": "int_0^inf R(x) dx",            "role": "bonus"   },
    { "id": "T1", "expr": "int_0^inf R(x) log x dx",      "role": "primary" },
    { "id": "T2", "expr": "int_0^inf R(x) (log x)^2 dx",  "role": "cancels" }
  ],
  "solve": {
    // upper edge + lower edge (reversed) = -(4 pi i) T1 + (4 pi^2) T0 + 0 * T2 = 2 pi i Sigma
    "matrix": [ [ "4*pi^2", "-4*pi*i", "0" ] ],          // rows: one complex equation = two real ones
    "rhs": "2*pi*i*Sigma",
    "split": { "Im(identity)": "T1 = -Re(Sigma)/2", "Re(identity)": "T0 = -Im(Sigma)/(2*pi)" },
    "rank": 2, "unknownsDetermined": ["T1", "T0"], "kernel": ["T2"]
  },

  "parameters": [],

  "hypotheses": [
    { "id": "R-rational",       "statement": "R is rational", "check": "structural:isRational(R)", "onFail": "refuse" },
    { "id": "no-poles-on-cut",  "statement": "R has no pole on [0, inf)",
      "check": "algebraic:noRealNonnegativeRoot(denom(R))", "onFail": "refuse" },
    { "id": "decay-beats-log-squared",
      "statement": "deg denom - deg num >= 2, so R(z) log^2 z = O(|z|^(-p)) with some p > 1 and the outer circle vanishes",
      "check": "algebraic:degreeDrop(R) >= 2", "onFail": "refuse" },
    { "id": "regular-at-origin",
      "statement": "R is bounded at 0, so eps*(log eps)^2*max|R| -> 0 on the inner circle",
      "check": "algebraic:ord0(R) >= 0", "onFail": "refuse" },
    { "id": "R-real-on-the-ray",
      "statement": "R has real coefficients, so T0, T1, T2 are real and the Re/Im split is legitimate",
      "check": "structural:hasRealCoefficients(R)", "onFail": "refuse" },
    { "id": "cut-must-reach-infinity",
      "statement": "log has infinite-order monodromy at 0 and inf, so no BOUNDED cut exists (research 06 s2.1(c))",
      "check": "branch:validateCutSystem(branch) == ok", "onFail": "refuse" }
  ],

  "branch": {
    "function": "log(z)^2",
    "cut": { "ray": "[0, inf)", "argRange": [0, 6.283185307179586] },
    "crossingPhase": "additive: log z |-> log z + 2*pi*i"    // NOT multiplicative; see trap 'log-phase-is-additive'
  },

  "contour": {
    "template": "keyhole",
    "limitParams": [ { "name": "R", "to": "inf" }, { "name": "eps", "to": "0+" } ],
    "pieces": [
      { "id": "upper", "name": "upper edge, log z = log x",
        "kind": "segment", "from": "eps", "to": "R", "side": "above", "role": "target", "colour": 0 },
      { "id": "outer", "name": "the R -> inf circle",
        "kind": "arc", "center": "0", "radius": "R", "theta0": "0", "theta1": "2*pi",
        "role": "vanish", "lemma": "L2", "colour": 1 },
      { "id": "lower", "name": "lower edge, log z = log x + 2 pi i",
        "kind": "segment", "from": "R", "to": "eps", "side": "below",
        "role": "reproduces",
        // ⚠ GAP G2: `factor` must be a scalar multiplying ONE target. Here the piece's value is
        // -(T2 + 4 pi i T1 - 4 pi^2 T0); no ExprNode in `factor` can express that.
        "factor": "AFFINE: -(1, 4*pi*i, -4*pi^2) . (T2, T1, T0)",
        "colour": 2 },
      { "id": "inner", "name": "the eps -> 0 circle",
        "kind": "arc", "center": "0", "radius": "eps", "theta0": "2*pi", "theta1": "0",
        "role": "vanish", "lemma": "L1", "colour": 3 }
    ],
    "orientation": "ccw",
    "encloses": "all poles of R off [0, inf); for R = 1/(1+z^2)^2 the double poles at z = i (arg pi/2) and z = -i (arg 3pi/2)",
    "windings": { "i": 1, "-i": 1 }               // ⚠ GAP G3
  },

  "vanishingLemmas": [
    { "lemma": "L2", "piece": "outer",
      "sideCondition": "|R(z) log^2 z| <= (log R + 2pi)^2/(R^2-1)^2 on |z| = R; absorb the log by taking any p in (1, degreeDrop)",
      "discharge": "symbolic:degreeBoundWithLog(R, 2) => |int| <= 2*pi*R*(log R + 2*pi)^2/(R^2-1)^2 -> 0",
      "rigorIfDischarged": "≤", "rigorIfNumericOnly": "≈" },
    { "lemma": "L1", "piece": "inner",
      "sideCondition": "eps * (log(1/eps) + 2pi)^2 * max|R| -> 0",
      "discharge": "symbolic:ord0BoundWithLog(R, 2) => |int| <= 2*pi*eps*(log(1/eps)+2*pi)^2/(1-eps^2)^2 -> 0",
      "rigorIfDischarged": "≤", "rigorIfNumericOnly": "≈" }
  ],

  "residueSelection": { "rule": "notOn", "set": "[0, inf)" },

  "closedForm": {
    "expr": "Sigma := Sum(Res(R(z)*log(z)^2, z_k));  T1 = -Re(Sigma)/2;  T0 = -Im(Sigma)/(2*pi)",
    "simplified": "T1 = -pi/4  and  T0 = pi/4   for R = 1/(1+x^2)^2"
  },

  "rigor": { "policy": "min",
             "inputs": ["hypotheses.*", "vanishingLemmas.*.rigor", "residues.*.rigor", "solve.rank"] },

  "traps": [
    { "id": "plain-log-loses-the-log-integral",
      "detect": "auxiliary.integrand matches 'R(z)*log(z)' && targets.primary == 'T1'",
      "message": "With a single log the lower edge gives -(T1 + 2 pi i T0): the T1 terms CANCEL and the surviving equation is -2 pi i T0 = 2 pi i Sum Res(R log z), which determines int R dx and says NOTHING about int R log x. The coefficient of T1 is exactly 0 - the same rank deficiency as D1's wrong argRange, one column over. The app must report 'this contour carries no information about int R log x' rather than solving for it and printing 0. Use log^2." },
    { "id": "real-and-imaginary-parts-swapped",
      "detect": "solve.split['Im(identity)'] resolves to T0",
      "message": "Of the identity -4 pi i T1 + 4 pi^2 T0 = 2 pi i Sigma: the IMAGINARY part gives T1 = int R log x, the REAL part gives T0 = int R. In terms of the residue sum the sense inverts - T1 = -Re(Sigma)/2 and T0 = -Im(Sigma)/(2 pi) - because dividing by 2 pi i rotates. Verified for R = 1/(1+z^2)^2: Sigma = pi/2 - i pi^2/2, so T1 = -pi/4 and T0 = +pi/4. Swapping them gives T1 = +pi/4, right magnitude, wrong sign, and no internal check catches it." },
    { "id": "four-pi-squared-dropped",
      "detect": "solve.matrix[0][0] == 0",
      "message": "(log x + 2 pi i)^2 = log^2 x + 4 pi i log x - 4 pi^2. Dropping the constant -4 pi^2 term is the single most common slip in this derivation: it removes T0 from the system entirely, and since T0 is real and T1's equation is the imaginary part, the answer for T1 comes out UNCHANGED - the error is invisible in the primary answer and destroys the bonus one." },
    { "id": "log-phase-is-additive",
      "detect": "branch.crossingPhase matches 'exp(*)'",
      "message": "log is not a power: crossing the cut ADDS 2 pi i, it does not multiply by a phase. A log-type branch point has infinite-order monodromy (research 06 s2.1), which is also why a log cut can never be bounded and must run to infinity. Writing crossingPhase as exp(2 pi i * something) here is a type error, and the admissibility validator must reject a bounded log cut rather than draw it." },
    { "id": "wrong-sign-of-the-shift",
      "detect": "branch.crossingPhase matches 'log z - 2*pi*i'",
      "message": "Under arg in (0, 2pi) the lower edge is log(x - i0) = log x + 2 pi i, not log x - 2 pi i (research 06 s6.1 error 4). The sign flip negates T1 and leaves T0 alone: -pi/4 becomes +pi/4." },
    { "id": "double-pole-derivative-formula",
      "detect": "residues.any(r => r.order >= 2 && r.method == 'simple')",
      "message": "z = +-i are DOUBLE poles of 1/(1+z^2)^2, so Res = d/dz[(z-i)^2 f] at z = i, not lim (z-i) f. The measured residues are Res(i) = -pi/4 + i pi^2/16 and Res(-i) = 3 pi/4 - 9 i pi^2/16; using the simple-pole shortcut returns 0/0 and, with a numeric limit, a large plausible number." }
  ],

  "golden": [
    // method: (a) exp-sinh DE on (0, inf) -> -0.78539816339744806 (rel 2.8e-16);
    //         (b) fold x -> 1/x onto (0,1), giving int_0^1 log u (1-u^2)/(1+u^2)^2 du, tanh-sinh
    //             -> -0.78539816339744772 (rel 7.1e-16).
    // Contour: keyhole total = 2 pi i Sigma to 1.0e-14 (eps = 1e-9, R = 1e9); up + low reproduced
    // 4 pi^2 T0 - 4 pi i T1 to 8.5e-9.
    { "params": { "R": "1/(1+x^2)^2" }, "value": "-pi/4", "numeric": -0.78539816339744828, "verifiedTo": 7e-16 },
    { "params": { "R": "1/(1+x^2)^2", "which": "T0 (free bonus from the same contour)" },
      "value": "pi/4", "numeric": 0.78539816339744828, "verifiedTo": 3e-16 },
    { "params": { "R": "1/(1+x^2)" }, "value": "0", "numeric": 0.0, "verifiedTo": 1.2e-16,
      "note": "int log x/(1+x^2) = 0; Sigma = -i pi^2 so Re(Sigma) = 0 exactly. Bonus T0 = pi/2." }
  ]
}
```

## D5 · `log-cubed-keyhole`

**What this entry exists to teach: `log²` does not fall out of D4's contour, and a family may need a
prerequisite.** The natural guess is that `∫₀^∞ (log x)²/(1+x²) dx` is the other half of D4's identity.
It is not, for two independent reasons, and the record has to state both. First, D4 runs on
`R = 1/(1+z²)²` while D5's `R` is `1/(1+z²)` — different integrands, so no shared contour is even
possible. Second, and structurally: the `log^k` keyhole delivers the pair `(∫R log^{k−1}, ∫R log^{k−2})`,
because the `log^k` terms cancel and the binomial remainder is linear in the two next powers down. `k=2`
gives `(∫R log x, ∫R)`; to reach `∫R log²x` you need `k = 3`. And the `log³` identity
`−6πi·C + 12π²·A + 8π³i·B = 2πi·Σ₃` has **two real equations in three unknowns**: its real part
gives `A` and its imaginary part gives `−3C + 4π²B`, so `C` is determined only once `B = ∫R dx` is supplied
from elsewhere. The app must therefore run D4's `log²` keyhole on the *same* `R` first — which returns
`A = 0` and `B = π/2` — and then the `log³` keyhole closes: `C = (4π²·(π/2) − 13π³/8)/3 = π³/8`. What
D5's own contour gives away for free is `A = ∫₀^∞ log x/(1+x²) dx = 0`, which is also the consistency
check (`Im Σ₃ = 0`).

```jsonc
{
  "id": "log-cubed-keyhole",
  "title": "int_0^inf R(x)(log x)^2 dx by the log^3 keyhole (R = 1/(1+x^2), value pi^3/8)",
  "taxonomySection": "5.2",
  "tier": "D",

  "target": {
    "variable": "x", "lower": "0", "upper": "inf",
    "integrand": "log(x)^2 * R(x)",
    "symbols": { "R": { "kind": "rationalFn", "var": "x", "value": "1/(1+x^2)" } },
    "principalValue": false
  },

  "auxiliary": { "integrand": "R(z)*log(z)^3", "extract": "components" },   // ⚠ GAP G1
  "targets": [                                                              // ⚠ GAP G2
    { "id": "T0", "expr": "int_0^inf R(x) dx",           "role": "INPUT - not determined by this contour" },
    { "id": "T1", "expr": "int_0^inf R(x) log x dx",     "role": "bonus"   },
    { "id": "T2", "expr": "int_0^inf R(x) (log x)^2 dx", "role": "primary" },
    { "id": "T3", "expr": "int_0^inf R(x) (log x)^3 dx", "role": "cancels" }
  ],
  // ⚠ GAP G8 — proposed field. Without it there is no way to say that this family does not close alone.
  "prerequisites": [
    { "needs": "T0", "from": "family:log-squared-keyhole with the same R",
      "alternative": "family:semicircle-rational (taxonomy s2), or an elementary antiderivative",
      "rigorOfInput": "inherited: T0's verdict meets into this one" }
  ],
  "solve": {
    // upper + lower(reversed) = -(6 pi i) T2 + (12 pi^2) T1 + (8 pi^3 i) T0 = 2 pi i Sigma3
    "matrix": [ [ "8*pi^3*i", "12*pi^2", "-6*pi*i", "0" ] ],
    "rhs": "2*pi*i*Sigma3",
    "split": {
      // NOTE the sense: Re/Im here are parts OF THE IDENTITY, not of Sigma3, and they cross over.
      "Re(identity)": "12*pi^2*T1 = -2*pi*Im(Sigma3)   =>   T1 = -Im(Sigma3)/(6*pi)",
      "Im(identity)": "-6*pi*T2 + 8*pi^3*T0 = 2*pi*Re(Sigma3)   =>   -3*T2 + 4*pi^2*T0 = Re(Sigma3)"
    },
    "rank": 2, "unknowns": 3,
    "unknownsDetermined": ["T1", "T2 given T0"], "kernel": ["T3"],
    "closesAlone": false
  },

  "parameters": [],

  "hypotheses": [
    { "id": "no-poles-on-cut", "statement": "R has no pole on [0, inf)",
      "check": "algebraic:noRealNonnegativeRoot(denom(R))", "onFail": "refuse" },
    { "id": "decay-beats-log-cubed",
      "statement": "deg drop >= 2 so that R log^3 z = O(|z|^-p) with p > 1: (log R)^3/R -> 0",
      "check": "algebraic:degreeDrop(R) >= 2", "onFail": "refuse" },
    { "id": "regular-at-origin", "statement": "eps*(log(1/eps)+2pi)^3*max|R| -> 0",
      "check": "algebraic:ord0(R) >= 0", "onFail": "refuse" },
    { "id": "R-real-on-the-ray", "check": "structural:hasRealCoefficients(R)", "onFail": "refuse" },
    { "id": "T0-available",
      "statement": "int_0^inf R dx is known with a verdict (this contour cannot supply it)",
      "check": "ledger:hasResolvedTarget('T0')", "onFail": "refuse" }
  ],

  "branch": {
    "function": "log(z)^3",
    "cut": { "ray": "[0, inf)", "argRange": [0, 6.283185307179586] },
    "crossingPhase": "additive: log z |-> log z + 2*pi*i"
  },

  "contour": {
    "template": "keyhole",
    "limitParams": [ { "name": "R", "to": "inf" }, { "name": "eps", "to": "0+" } ],
    "pieces": [
      { "id": "upper", "name": "upper edge", "kind": "segment", "from": "eps", "to": "R",
        "side": "above", "role": "target", "colour": 0 },
      { "id": "outer", "name": "the R -> inf circle", "kind": "arc", "center": "0", "radius": "R",
        "theta0": "0", "theta1": "2*pi", "role": "vanish", "lemma": "L2", "colour": 1 },
      { "id": "lower", "name": "lower edge, log z = log x + 2 pi i", "kind": "segment",
        "from": "R", "to": "eps", "side": "below", "role": "reproduces",
        "factor": "AFFINE: -(1, 6*pi*i, -12*pi^2, -8*pi^3*i) . (T3, T2, T1, T0)",   // ⚠ GAP G2
        "colour": 2 },
      { "id": "inner", "name": "the eps -> 0 circle", "kind": "arc", "center": "0", "radius": "eps",
        "theta0": "2*pi", "theta1": "0", "role": "vanish", "lemma": "L1", "colour": 3 }
    ],
    "orientation": "ccw",
    "encloses": "z = i (arg pi/2) and z = -i (arg 3pi/2), both simple",
    "windings": { "i": 1, "-i": 1 }               // ⚠ GAP G3
  },

  "vanishingLemmas": [
    { "lemma": "L2", "piece": "outer",
      "sideCondition": "|R log^3 z| <= (log R + 2pi)^3/(R^2 - 1) on |z| = R; p = 2 - o(1) > 1",
      "discharge": "symbolic:degreeBoundWithLog(R, 3) => |int| <= 2*pi*R*(log R + 2*pi)^3/(R^2-1) -> 0",
      "rigorIfDischarged": "≤", "rigorIfNumericOnly": "≈" },
    { "lemma": "L1", "piece": "inner",
      "sideCondition": "eps*(log(1/eps) + 2pi)^3/(1 - eps^2) -> 0",
      "discharge": "symbolic:ord0BoundWithLog(R, 3)",
      "rigorIfDischarged": "≤", "rigorIfNumericOnly": "≈" }
  ],

  "residueSelection": { "rule": "notOn", "set": "[0, inf)" },

  "closedForm": {
    "expr": "Sigma3 := Sum(Res(R(z)*log(z)^3, z_k));  T2 = (4*pi^2*T0 - Re(Sigma3))/3;  T1 = -Im(Sigma3)/(6*pi)",
    "simplified": "T2 = pi^3/8  for R = 1/(1+x^2), given T0 = pi/2"
  },

  "rigor": { "policy": "min",
             "inputs": ["hypotheses.*", "vanishingLemmas.*.rigor", "residues.*.rigor",
                        "prerequisites.*.rigorOfInput", "solve.rank"] },

  "traps": [
    { "id": "expecting-log-squared-for-free-from-D4",
      "detect": "family.derivedFrom == 'log-squared-keyhole' && targets.primary == 'T2'",
      "message": "The log^2 keyhole on R delivers (int R log x, int R) - the two powers BELOW the one it carries - and nothing about int R log^2 x, whose column in that system is identically zero. Reaching T2 needs log^3. (D4 is additionally a different R: 1/(1+x^2)^2, not 1/(1+x^2), so there is no shared contour to begin with.) What D4's contour does give free is int dx/(1+x^2)^2 = pi/4; what D5's gives free is int log x/(1+x^2) = 0." },
    { "id": "solving-a-rank-deficient-system",
      "detect": "solve.rank < solve.unknowns && !prerequisites.satisfied",
      "message": "Two real equations, three unknowns: the log^3 keyhole determines T1 outright and T2 only MODULO T0. Supplying T0 = pi/2 from the log^2 keyhole on the same R (or from taxonomy s2) closes it; assuming T0 = 0, i.e. reading off T2 = -Re(Sigma3)/3, gives -13 pi^3/24 = -16.795 instead of pi^3/8 = 3.876. The ledger must show the prerequisite as its own row with its own verdict, and the final label meets with it." },
    { "id": "binomial-terms-dropped",
      "detect": "solve.matrix[0] has a zero where the binomial expansion does not",
      "message": "(log x + 2 pi i)^3 = log^3 + 6 pi i log^2 - 12 pi^2 log - 8 pi^3 i. All three lower terms survive after the log^3 cancellation. Dropping the -8 pi^3 i term removes T0 and, because T0's coefficient is imaginary and T2's equation is the IMAGINARY part of the identity, the failure is silent: T2 comes out as -Re(Sigma3)/3." },
    { "id": "sign-of-T1-from-the-1-over-i",
      "detect": "closedForm.expr contains '+Im(Sigma3)/(6*pi)'",
      "message": "Dividing the identity by 2 pi i turns 12 pi^2 T1 into 12 pi^2 T1/(2 pi i) = -6 pi i T1, because 1/i = -i. The correct relation is T1 = -Im(Sigma3)/(6 pi). This sign is INVISIBLE in the flagship fixture R = 1/(1+x^2), where Sigma3 = 13 pi^3/8 is purely real and T1 = 0 either way; it was caught only by re-running on R = 1/(x^2+4), where Sigma3 = 24.06056 - 10.26163 i and the true A = pi log2/4 = 0.5443965 matches -Im(Sigma3)/(6 pi) and not +. A golden corpus with one fixture per family cannot see errors like this; every log-family entry needs a second R with a NON-ZERO bonus term." },
    { "id": "mellin-route-not-cross-checked",
      "detect": "!invariants.includes('T2 == d2/ds2 M(s) at s=1')",
      "message": "M(s) = int_0^inf x^(s-1)/(1+x^2) dx = (pi/2) csc(pi s/2) is holomorphic in the fundamental strip, so differentiating under the integral is justified (not merely asserted): with u = pi s/2, M'' = (pi/2)*(pi/2)^2 * [csc u (csc^2 u + cot^2 u)], which at u = pi/2 is (pi/2)(pi^2/4) = pi^3/8. That is an independent derivation from the SAME gallery family (D1/D3) and is a free invariant; wire it." },
    { "id": "log-phase-is-additive",
      "detect": "branch.crossingPhase matches 'exp(*)'",
      "message": "Same as D4: log has infinite-order monodromy; the crossing is additive and the cut can never be bounded." }
  ],

  "golden": [
    // method: (a) exp-sinh DE -> 3.8757845850374770 (rel 0.0e0);
    //         (b) fold x -> 1/x (the integrand is invariant), 2*tanh-sinh on (0,1) -> 3.8757845850373815;
    //         (c) 4*beta(3) series sum_{k>=0} (-1)^k/(2k+1)^3 -> 3.8757845850374895 (rel 3.2e-15).
    // Contour: keyhole total = 2 pi i Sigma3 to 1.2e-14 with Sigma3 = 13 pi^3/8 (purely real, so the
    // bonus T1 = -Im(Sigma3)/(6 pi) = 0 exactly, matching quadrature's -1.2e-16).
    { "params": { "R": "1/(1+x^2)", "T0": "pi/2" }, "value": "pi^3/8", "numeric": 3.8757845850374770, "verifiedTo": 3e-15 },
    { "params": { "R": "1/(1+x^2)", "which": "T1 (free bonus)" }, "value": "0", "numeric": 0.0, "verifiedTo": 1.2e-16 },
    { "params": { "R": "1/(1+x^2)", "which": "prerequisite T0 from log^2 keyhole" },
      "value": "pi/2", "numeric": 1.5707963267948966, "verifiedTo": 1e-16,
      "note": "Sigma2 = -i pi^2 exactly, so T0 = -Im(Sigma2)/(2 pi) = pi/2 and T1 = -Re(Sigma2)/2 = 0" },
    // MANDATORY second fixture: an R whose bonus terms are NON-ZERO, so that the signs of both
    // split relations are actually tested. Sigma2 = -1.08879304515180 - 4.93480220054468 i and
    // Sigma3 = 24.0605590585532 - 10.2616326957857 i (exact residues at 2i, arg pi/2, and -2i,
    // arg 3pi/2). Quadrature: A = 0.544396522575900, B = 0.785398163397448, C = 2.31523920724886.
    { "params": { "R": "1/(x^2+4)", "which": "T1 = int log x/(x^2+4)" },
      "value": "pi*log(2)/4", "numeric": 0.54439652257590103, "verifiedTo": 2e-15,
      "note": "= -Im(Sigma3)/(6 pi) and = -Re(Sigma2)/2; the PLUS sign fails here" },
    { "params": { "R": "1/(x^2+4)", "which": "T0 = int dx/(x^2+4)" },
      "value": "pi/4", "numeric": 0.78539816339744828, "verifiedTo": 1e-15 },
    { "params": { "R": "1/(x^2+4)", "which": "T2 = int (log x)^2/(x^2+4)" },
      "value": "(4*pi^2*T0 - Re(Sigma3))/3", "numeric": 2.3152392072488600, "verifiedTo": 1e-14 }
  ]
}
```

## D6 · `dogbone-inverse-sqrt`

**What this entry exists to teach: a contour that encloses no pole at all, and yet is not zero.** Every
pole of `1/((z²+a²)√(1−z²))` lies off the dogbone, so `n(γ, ±ia) = 0` — and the naive reading of the
residue theorem gives `∮ = 0`, which is wrong by `2π/(a√(1+a²))`. The hypothesis that fails is not about
poles: the function is not holomorphic inside, because the *cut* is inside. The correct identity applies
the residue theorem to the **exterior** region, which contains ∞, and is written as one cycle
`γ = C_R + (crosscut) + D_cw + (crosscut back)` whose winding number about each finite pole is then
honestly 1. Two further things earn their place. The residue at infinity is `0` here, and must be
*certified* so — `f = O(|z|⁻³)` — which is the same certificate that discharges L2 on `C_R`, making
research 03 §9(d)'s unification ("§2's degree condition ≡ `Res(f,∞) = 0`") visible in a single row.
And the branch determination bites: the branch that is `+√(1−x²)` on the top of the cut takes the value
`+√(1+a²)` at `+ia` and `−√(1+a²)` at `−ia`. Using `+` at both — the obvious symmetry reflex — makes the
two residues cancel and returns exactly **0**.

```jsonc
{
  "id": "dogbone-inverse-sqrt",
  "title": "int_-1^1 dx/((x^2+a^2) sqrt(1-x^2)) = pi/(a sqrt(1+a^2)): the dogbone",
  "taxonomySection": "5.3",
  "tier": "D",

  "target": {
    "variable": "x", "lower": "-1", "upper": "1",
    "integrand": "1/((x^2+a^2)*sqrt(1-x^2))",
    "symbols": { "R": { "kind": "rationalFn", "var": "x", "value": "1/(x^2+a^2)" } },
    "principalValue": false
  },

  "parameters": [
    { "name": "a", "domain": "real", "constraints": ["a > 0"] }
  ],

  "hypotheses": [
    { "id": "poles-off-the-cut",
      "statement": "the poles +- i a are not on [-1, 1]",
      "check": "algebraic:distance({i*a, -i*a}, cut) > r_min", "onFail": "refuse" },
    { "id": "a-nonzero",
      "statement": "a != 0: at a = 0 the poles collide with the cut at z = 0 and the integral diverges",
      "check": "algebraic:a != 0", "onFail": "refuse" },
    { "id": "cut-admissible",
      "statement": "branch points -1 and 1 with alpha = -1/2 each; the component {-1,1} does not touch infinity and Sum alpha = -1 in Z, so the segment [-1,1] is an admissible cut (research 06 s2.1(b))",
      "check": "branch:validateCutSystem(branch) == ok && exponentSum(component) in Z", "onFail": "refuse" },
    { "id": "residue-at-infinity-zero",
      "statement": "f = O(|z|^-3) at infinity, hence Res(f, inf) = 0 (research 03 s9(c)) and the outer circle vanishes by L2",
      "check": "algebraic:laurentAtInfinity(f, -1) == 0", "onFail": "warn" },
    { "id": "branch-normalised-on-the-upper-edge",
      "statement": "the branch is pinned by W(x + i0) = +sqrt(1-x^2) for x in (-1,1), so the target piece carries +T and not a phase multiple of it",
      "check": "branch:evaluateAt(W, upperEdge) == +sqrt(1-x^2)", "onFail": "refuse" }
  ],

  // ⚠ GAP G4 — `branch` is singular. TWO branch points with independent exponents; the record below
  // is the honest multi-point form, which the v1 loader cannot validate.
  "branch": {
    "function": "sqrt(1 - z^2)",
    "definition": "W(z) := -i * exp( (1/2)*( Log_[0,2pi)(z-1) + Log_[0,2pi)(z+1) ) )",
    "branchPoints": [ { "z": "-1", "order": { "kind": "power", "alpha": -0.5, "exact": { "p": -1, "q": 2 } } },
                      { "z":  "1", "order": { "kind": "power", "alpha": -0.5, "exact": { "p": -1, "q": 2 } } } ],
    "cuts": [ { "from": "-1", "to": "1", "via": [], "jump": { "value": 0.5, "verified": true } } ],
    "admissibility": "Sum alpha over the bounded component {-1,1} = -1 in Z  ->  ADMISSIBLE",
    "alternativeCutSystem": "two rays -1 -> inf and 1 -> inf are equally admissible, and are draggable to; but only the SEGMENT makes the dogbone work",
    "cut": { "ray": "[-1, 1]", "argRange": [0, 6.283185307179586] },   // per-factor arg, both factors
    "crossingPhase": "exp(2*pi*i*(-1/2)) = -1   (W -> -W across (-1,1))"
  },

  "contour": {
    "template": "dogbone",
    "limitParams": [ { "name": "eta", "to": "0+" }, { "name": "R", "to": "inf" } ],
    "pieces": [
      { "id": "top",   "name": "the upper edge of the cut, left to right",
        "kind": "segment", "from": "-1", "to": "1", "side": "above", "role": "target", "colour": 0 },
      { "id": "endB",  "name": "the eta-semicircle around z = +1",
        "kind": "arc", "center": "1", "radius": "eta", "theta0": "pi/2", "theta1": "-pi/2",
        "role": "vanish", "lemma": "L1", "colour": 3 },
      { "id": "bottom","name": "the lower edge of the cut, right to left",
        "kind": "segment", "from": "1", "to": "-1", "side": "below",
        "role": "reproduces", "factor": "+1", "colour": 2 },
      { "id": "endA",  "name": "the eta-semicircle around z = -1",
        "kind": "arc", "center": "-1", "radius": "eta", "theta0": "-pi/2", "theta1": "-3*pi/2",
        "role": "vanish", "lemma": "L1", "colour": 3 },
      { "id": "outer", "name": "the R -> inf circle (closes the cycle; carries Res(f, inf))",
        "kind": "arc", "center": "0", "radius": "R", "theta0": "0", "theta1": "2*pi",
        "role": "vanish", "lemma": "L2", "colour": 1 }
    ],
    "orientation": "cw",             // clockwise ABOUT THE CUT = ccw about the exterior; convention O
    "encloses": "as a cycle: z = i a and z = -i a, each once; the cut itself is wound 0 times (C_R's +1 against the dogbone's -1)",
    // ⚠ GAP G3. The whole entry is here: the DOGBONE ALONE has n = 0 about every pole.
    "windings": { "i*a": 1, "-i*a": 1, "points of [-1,1]": 0,
                  "note": "for the bare dogbone D_cw taken alone, n(D, +-i a) = 0 while the integral is 2T != 0" },
    "composite": "gamma = C_R(ccw) + crosscut + D_cw + crosscut-back; the two crosscut traversals cancel because f is single-valued along them (route them through the upper half-plane, not across [-1,1])"
  },

  "vanishingLemmas": [
    { "lemma": "L1", "piece": "endB",
      "sideCondition": "|f| ~ C*eta^(-1/2) near z = 1 and the length is pi*eta, so |int| = O(eta^(1/2))",
      "discharge": "symbolic:endpointBound(alpha = -1/2) => |int| <= pi*eta^(1/2)*C -> 0 iff alpha > -1",
      "rigorIfDischarged": "≤", "rigorIfNumericOnly": "≈" },
    { "lemma": "L1", "piece": "endA", "sideCondition": "same at z = -1",
      "discharge": "symbolic:endpointBound(alpha = -1/2)",
      "rigorIfDischarged": "≤", "rigorIfNumericOnly": "≈" },
    { "lemma": "L2", "piece": "outer",
      "sideCondition": "|f| <= M/|z|^3 for |z| >= R0, p = 3 > 1",
      "discharge": "symbolic:degreeBound => |int| <= 2*pi*R * M/R^3 -> 0; EQUIVALENTLY Res(f, inf) = 0 (research 03 s9(d))",
      "rigorIfDischarged": "≤", "rigorIfNumericOnly": "≈" }
  ],

  "residueSelection": { "rule": "notOn", "set": "[-1, 1]" },

  // ⚠ GAP G5 — the residue at infinity has no seat in pass 2's Sum over detected finite poles.
  // Here it is 0 and is discharged as the `outer` vanish row, which is the honest encoding; for D7
  // it is not 0 and the same piece must become a `residue` row instead.
  "residueAtInfinity": { "value": "0", "certificate": "f = O(|z|^-3) => c_{-1} at infinity = 0",
                         "rigor": "=", "note": "identical certificate to vanishingLemmas[outer]" },

  "closedForm": {
    "expr": "T = ( 2*pi*i*( Res(f, i a) + Res(f, -i a) ) - Int(outer) ) / (1 + 1)",
    "simplified": "pi/(a*sqrt(1+a^2))"
  },

  "rigor": { "policy": "min",
             "inputs": ["hypotheses.*", "vanishingLemmas.*.rigor", "residues.*.rigor",
                        "residueAtInfinity.rigor", "branch.*"] },

  "traps": [
    { "id": "no-poles-inside-so-the-integral-is-zero",
      "detect": "ledger.row('CATCH').enclosedCount == 0 && !contour.composite",
      "message": "n(D, +- i a) = 0 - the dogbone encloses no pole - and yet int_D f = 2T = 2 pi/(a sqrt(1+a^2)) != 0. The residue theorem's hypothesis is not 'no poles inside' but 'holomorphic inside except at isolated singularities', and the CUT is inside. The identity applies to the EXTERIOR region (which contains infinity): int_D,cw f = 2 pi i [ Sum Res outside + Res(f, inf) ]. Reporting the enclosed-pole count as if it were the answer is the exact conflation the dogbone exists to break (research 02, P0 #7)." },
    { "id": "wrong-sqrt-determination-at-an-outside-pole",
      "detect": "branch:evaluateAt(W, -i*a) != -sqrt(1+a^2)",
      "message": "The branch pinned by W(x + i0) = +sqrt(1-x^2) on the cut takes W(+i a) = +sqrt(1+a^2) but W(-i a) = -sqrt(1+a^2). Verified at a = 1, 0.5, 2, 3.7. Using +sqrt(1+a^2) at BOTH poles - the natural symmetry reflex, since the poles are a conjugate pair - makes the two residues equal and opposite, the sum is 0, and the answer is 0 instead of pi/(a sqrt(1+a^2)). Nothing about the result looks wrong; it is just gone." },
    { "id": "forgot-the-residue-at-infinity",
      "detect": "!ledger.rows.any(r => r.claim.includes('Res(f, inf)'))",
      "message": "For the dogbone, Res(f, inf) is part of the identity, not an optimisation (research 03 s9(b)). Here it happens to be 0 because f = O(|z|^-3), but that must be CERTIFIED, not assumed - the same degree computation that discharges L2 on the outer circle proves it, and in D7 the analogous term carries most of the answer. 'Regular at infinity' and 'zero residue at infinity' are different statements: f = 1/z is regular at infinity with Res(f, inf) = -1." },
    { "id": "branch-point-is-not-a-pole",
      "detect": "residues.any(r => r.at in [-1, 1])",
      "message": "z = +-1 are branch points of sqrt(1-z^2), not poles: no Laurent series, no residue. The end semicircles are killed by ML (|int| = O(eta^(1/2))), which is where the hypothesis alpha > -1 (integrability of the endpoint singularity) is spent." },
    { "id": "two-rays-instead-of-the-segment",
      "detect": "branch.cuts.any(c => c.to == 'inf')",
      "message": "Both cut systems are admissible by research 06 s2.1 - the segment [-1,1] (Sum alpha = -1 in Z) and the pair of rays -1 -> inf, 1 -> inf - and the user can drag between them. But only the SEGMENT makes the dogbone work: with two rays to infinity the region around [-1,1] is no longer a cut-free annulus and the dogbone crosses a cut. The app should let the drag happen and then refuse the contour, naming the crossing." },
    { "id": "pole-on-the-cut",
      "detect": "algebraic:anyPoleIn(cut)",
      "message": "A pole inside [-1,1] - e.g. replacing x^2 + a^2 by x^2 - a^2 with 0 < a < 1 - breaks the method outright (research 03 s5.3 trap iii): the pole is on the cut, the dogbone cannot avoid it, and the integral needs a principal value the dogbone does not supply." }
  ],

  "golden": [
    // method: (a) tanh-sinh on [-1,1] with sqrt(1-x^2) evaluated as sqrt(da*db) from the transform's
    //         own cancellation-free endpoint distances;  (b) x = sin(theta), which turns the integral
    //         into int_-pi/2^pi/2 dtheta/(sin^2 theta + a^2) - a smooth periodic integrand and a
    //         tier-A unit-circle problem (see invariants). The two agree to <= 8e-16 at every a.
    // Contour: C_R + D_cw = 2 pi i Sum Res to 1.5e-15 (eta = 1e-4, R = 1e5); |C_R| = 2.7e-25.
    { "params": { "a": 1 },    "value": "pi/sqrt(2)",       "numeric": 2.2214414690791831, "verifiedTo": 6e-16 },
    { "params": { "a": 0.5 },  "value": "pi/(0.5*sqrt(1.25))","numeric": 5.6198517848325809, "verifiedTo": 4e-16 },
    { "params": { "a": 2 },    "value": "pi/(2*sqrt(5))",   "numeric": 0.70248147310407261, "verifiedTo": 8e-16 },
    { "params": { "a": 0.25 }, "value": "pi/(0.25*sqrt(1.0625))","numeric": 12.191170205567238, "verifiedTo": 5e-16 },
    { "params": { "a": 3.7 },  "value": "pi/(3.7*sqrt(14.69))","numeric": 0.22153239909292310, "verifiedTo": 6e-16 }
  ],

  "invariants": [               // ⚠ GAP: `invariants` is in test/golden/invariants.json, not in Family
    "x = sin(theta) turns this into int_-pi/2^pi/2 dtheta/(sin^2 theta + a^2), a taxonomy-s1 unit-circle integral; verified equal to 7.5e-16 at a = 1.3",
    "closing the dogbone the other way (orientation ccw about the cut) must give the same T",
    "Res(f, inf) = 0 <=> the outer circle vanishes by L2 <=> deg drop >= 2"
  ]
}
```

## D7 · `dogbone-two-fractional-powers`

**What this entry exists to teach: two different fractional exponents sharing one cut, and a residue at
infinity that carries the answer.** `z^{3/4}(3−z)^{1/4}/(5−z)` has branch points at `0` and `3` with
exponents `3/4` and `1/4`. Neither is an integer, so both must lie on the cut; their sum is
`3/4 + 1/4 = 1 ∈ ℤ`, so by research 06 §2.1(b) the *bounded* arc `[0,3]` is admissible and the dogbone
exists. That condition is not bookkeeping — it is exactly the statement that the phase acquired between
the upper and lower edges is well defined **independently of which end you route around**: going
counterclockwise about `0` multiplies by `e^{2πi(3/4)} = −i`, and going about `3` multiplies by
`e^{−2πi(1/4)} = −i`. Equal, and equal *because* `Σαₖ ∈ ℤ`. Then the payoff: `f → e^{3πi/4} ≠ 0` at
infinity, so the outer circle does **not** vanish, and `Res(f,∞) = −(17/4)e^{3πi/4}` contributes
`2πi(17/4)e^{3πi/4}` — a term of magnitude 18.9 in an answer of magnitude 1.2. Drop it and you are not
slightly wrong; the residue at `z = 5` alone gives `−2π·250^{1/4}(…)`, off by more than an order of
magnitude. D7 is the entry where "forgetting `Res(f,∞)` silently drops a term" stops being a footnote.

```jsonc
{
  "id": "dogbone-two-fractional-powers",
  "title": "int_0^b x^mu (b-x)^(1-mu)/(c-x) dx: two exponents on one cut, and Res(f, inf)",
  "taxonomySection": "5.3",
  "tier": "D",

  "target": {
    "variable": "x", "lower": "0", "upper": "b",
    "integrand": "x^mu * (b-x)^nu / (c-x)",
    "symbols": { "R": { "kind": "rationalFn", "var": "x", "value": "1/(c-x)" } },
    "principalValue": false
  },

  "parameters": [
    { "name": "mu", "domain": "real",    "constraints": ["mu > 0", "mu < 1", "mu not in Z"] },
    { "name": "nu", "domain": "real",    "constraints": ["nu = 1 - mu", "mu + nu in Z"] },
    { "name": "b",  "domain": "real",    "constraints": ["b > 0"] },
    { "name": "c",  "domain": "real",    "constraints": ["c > b"] }
  ],

  "hypotheses": [
    { "id": "exponent-sum-integral",
      "statement": "mu + nu in Z: the bounded component {0, b} of the cut forest has integer exponent sum, so [0,b] is an ADMISSIBLE cut (research 06 s2.1(b)). Here 3/4 + 1/4 = 1.",
      "check": "branch:exponentSum(component({0, b})) in Z", "onFail": "refuse" },
    { "id": "infinity-not-a-branch-point",
      "statement": "because mu + nu in Z, the monodromy around a large circle is exp(2 pi i (mu+nu)) = 1, so f is single-valued near infinity and C_R may be used",
      "check": "branch:monodromy(largeCircle) == 1", "onFail": "refuse" },
    { "id": "endpoints-integrable",
      "statement": "mu > -1 and nu > -1: x^mu and (b-x)^nu are integrable at their endpoints",
      "check": "algebraic:mu > -1 && nu > -1", "onFail": "refuse" },
    { "id": "pole-off-the-cut",
      "statement": "c > b, so the simple pole z = c is strictly outside [0, b]",
      "check": "algebraic:distance(c, cut) > r_min", "onFail": "refuse" },
    { "id": "residue-at-infinity-nonzero",
      "statement": "f -> exp(i pi mu) != 0 at infinity, so the outer circle does NOT vanish and its value is -2 pi i Res(f, inf)",
      "check": "algebraic:laurentAtInfinity(f, 0) != 0", "onFail": "warn" },
    { "id": "nondegenerate-solve",
      "statement": "1 + c_repro = 1 - exp(2 pi i mu) != 0, i.e. mu not an integer",
      "check": "algebraic:abs(1 - exp(2*pi*i*mu)) > cond_min", "onFail": "refuse" }
  ],

  // ⚠ GAP G4 — two branch points, two DIFFERENT exponents, and two different arg conventions.
  "branch": {
    "function": "z^mu * (b-z)^nu",
    "definition": "exp( mu*Log_[0,2pi)(z) + nu*Log_(-pi,pi](b - z) )",
    "branchPoints": [
      { "z": "0", "order": { "kind": "power", "alpha": 0.75, "exact": { "p": 3, "q": 4 } } },
      { "z": "b", "order": { "kind": "power", "alpha": 0.25, "exact": { "p": 1, "q": 4 } } }
    ],
    "cuts": [ { "from": "0", "to": "b", "via": [],
                "jump": { "value": 0.75, "verified": true,
                          "verification": "numeric continuation probe: the top -> bottom phase is exp(2 pi i * 3/4) = -i routing around 0, and exp(-2 pi i * 1/4) = -i routing around b; measured equal to 2e-16" } } ],
    "admissibility": "component {0,b} is bounded and Sum alpha = 1 in Z  ->  ADMISSIBLE. Individually neither 3/4 nor 1/4 is an integer, so BOTH points must lie on the cut.",
    "effectiveCut": "the per-factor cuts are [0,inf) and [b,inf); on (b, inf) the two jumps are exp(-2 pi i * 3/4) and exp(-2 pi i * 1/4), whose product is exp(-2 pi i) = 1, so f is continuous there and the EFFECTIVE cut is exactly [0, b] (research 06 s2.2: the union of sub-expression cuts is not the discontinuity set of the whole expression - rendering the union is dishonest)",
    "cut": { "ray": "[0, b]", "argRange": [0, 6.283185307179586] },
    "crossingPhase": "exp(2*pi*i*mu)"     // == exp(-2*pi*i*nu); the equality IS the admissibility condition
  },

  "contour": {
    "template": "dogbone",
    "limitParams": [ { "name": "eta", "to": "0+" }, { "name": "R", "to": "inf" } ],
    "pieces": [
      { "id": "top",   "name": "the upper edge, left to right (arg z = 0, arg(b-z) = 0)",
        "kind": "segment", "from": "0", "to": "b", "side": "above", "role": "target", "colour": 0 },
      { "id": "endB",  "name": "the eta-semicircle around z = b",
        "kind": "arc", "center": "b", "radius": "eta", "theta0": "pi/2", "theta1": "-pi/2",
        "role": "vanish", "lemma": "L1", "colour": 3 },
      { "id": "bottom","name": "the lower edge, right to left (arg z = 2 pi)",
        "kind": "segment", "from": "b", "to": "0", "side": "below",
        "role": "reproduces", "factor": "-exp(2*pi*i*mu)", "colour": 2 },
      { "id": "endA",  "name": "the eta-semicircle around z = 0",
        "kind": "arc", "center": "0", "radius": "eta", "theta0": "-pi/2", "theta1": "-3*pi/2",
        "role": "vanish", "lemma": "L1", "colour": 3 },
      { "id": "outer", "name": "the R -> inf circle: this piece IS the residue at infinity",
        "kind": "arc", "center": "0", "radius": "R", "theta0": "0", "theta1": "2*pi",
        "role": "residue", "colour": 4 }        // ⚠ GAP G5: pass 3 says role 'residue' is handled in
                                                // pass 2, but pass 2 sums FINITE poles only.
    ],
    "orientation": "cw",                        // clockwise about the cut; convention O
    "encloses": "as a cycle: z = c once. The cut is wound 0 times.",
    "windings": { "c": 1, "points of [0,b]": 0, "inf": -1,   // ⚠ GAP G3
                  "note": "the bare dogbone D_cw has n(D, c) = 0; only the composite cycle with C_R winds about c" },
    "composite": "gamma = C_R(ccw) + crosscut + D_cw + crosscut-back, the crosscut routed through the upper half-plane clear of [0,b] and of z = c"
  },

  "vanishingLemmas": [
    { "lemma": "L1", "piece": "endA",
      "sideCondition": "|f| ~ C*eta^mu near z = 0, length pi*eta, so |int| = O(eta^(1+mu))",
      "discharge": "symbolic:endpointBound(alpha = mu) => O(eta^(7/4)) -> 0 iff mu > -1  [measured 2.05e-10 at eta = 1e-5]",
      "rigorIfDischarged": "≤", "rigorIfNumericOnly": "≈" },
    { "lemma": "L1", "piece": "endB",
      "sideCondition": "|f| ~ C*eta^nu near z = b, length pi*eta, so |int| = O(eta^(1+nu))",
      "discharge": "symbolic:endpointBound(alpha = nu) => O(eta^(5/4)) -> 0 iff nu > -1  [measured 9.47e-7 at eta = 1e-5]",
      "rigorIfDischarged": "≤", "rigorIfNumericOnly": "≈" }
  ],

  "residueSelection": { "rule": "notOn", "set": "[0, b]" },

  // ⚠ GAP G5. Its own row, its own certificate, as required.
  "residueAtInfinity": {
    "value": "-exp(i*pi*mu)*(c - nu*b)",
    "derivation": "f(z) = exp(i pi mu) * (1 - b/z)^nu * (1 - c/z)^-1 = exp(i pi mu)*(1 + (c - nu b)/z + O(z^-2)), so c_1 = exp(i pi mu)(c - nu b) and Res(f, inf) = -c_1",
    "pieceValue": "Int(outer) = -2*pi*i*Res(f, inf) = 2*pi*i*exp(i*pi*mu)*(c - nu*b)",
    "certificate": { "method": "exact Laurent coefficient at infinity via the binomial series of (1 - b/z)^nu",
                     "rigor": "=",
                     "numericCheck": "measured Int(outer) = (-18.882252453, -18.882252432) at R = 1e6 against -2 pi i Res(f,inf) = (-18.882252487, -18.882252487); rel 2.4e-9" },
    "magnitudeWarning": "|Int(outer)| = 26.7 while the answer is 1.216 - this term is not a correction, it is most of the identity"
  },

  "closedForm": {
    "expr": "T = ( 2*pi*i*Res(f, c) - Int(outer) ) / (1 - exp(2*pi*i*mu))   with Res(f,c) = -c^mu*(c-b)^nu*exp(-i*pi*nu)",
    "simplified": "(pi/sin(pi*mu)) * ( c - (1-mu)*b - c^mu*(c-b)^(1-mu) )"
  },

  "rigor": { "policy": "min",
             "inputs": ["hypotheses.*", "vanishingLemmas.*.rigor", "residues.*.rigor",
                        "residueAtInfinity.certificate.rigor", "branch.*"] },

  "traps": [
    { "id": "forgot-the-residue-at-infinity",
      "detect": "!ledger.rows.any(r => r.pieceId == 'outer')",
      "message": "f -> exp(3 i pi/4) != 0 at infinity, so the outer circle does NOT vanish: its value is 2 pi i (17/4) exp(3 i pi/4), of magnitude 26.7, in an answer of magnitude 1.216. Keeping only Res(f, 5) gives T = 2 pi i Res(f,5)/(1+i) = (-17.665 - 17.665 i)/(1+i) = -17.665 - still perfectly REAL, so the usual 'the answer came out complex, I made a mistake' check does not fire; it is simply wrong by a factor of 14.5 and by a sign. This is research 03 s5.3 trap (v) with real teeth: unlike D6, where Res(f, inf) = 0 and the omission is harmless, here it is the larger half of the identity." },
    { "id": "exponent-sum-not-checked",
      "detect": "branch:exponentSum(component) not in Z",
      "message": "With mu + nu not in Z the bounded arc [0,b] is NOT an admissible cut: a loop around both branch points has non-trivial monodromy exp(2 pi i (mu+nu)), f is not single-valued off the segment, and the dogbone identity is meaningless. Operationally: the top -> bottom phase would depend on which END you route around - exp(2 pi i mu) via 0 versus exp(-2 pi i nu) via b - and 'the phase' would not exist. At mu = 3/4, nu = 1/4 both equal -i (verified to 2e-16). The admissibility check IS this well-definedness, not a separate condition to remember." },
    { "id": "rendering-the-union-of-sub-cuts",
      "detect": "render.cuts == union(cut(z^mu), cut((b-z)^nu))",
      "message": "z^(3/4) alone cuts [0, inf) and (b-z)^(1/4) alone cuts [b, inf). Their union is [0, inf), but on (b, inf) the two jumps exp(-2 pi i * 3/4) and exp(-2 pi i * 1/4) multiply to exp(-2 pi i) = 1 and the product is CONTINUOUS. Drawing [0, inf) is dishonest (research 06 s2.2, the Maple BranchCuts lesson): the discontinuity set of the composite is exactly [0, b]." },
    { "id": "residue-at-c-with-the-wrong-determination",
      "detect": "residues.any(r => r.at == c && arg((b - r.at)) != -pi)",
      "message": "At z = c > b approached from above, arg(b - z) = -pi (not +pi), so (b-c)^(1/4) = (c-b)^(1/4) exp(-i pi/4) and Res(f, 5) = -5^(3/4) 2^(1/4) exp(-i pi/4) = -2.81171 + 2.81171 i. Approaching from below gives arg z = 2 pi and arg(b-z) = +pi, whose product is the same value - that agreement is a free check and should be run, because using +pi with arg z = 0 instead rotates the residue by exp(i pi/2) and the final answer stays real and plausible." },
    { "id": "branch-points-are-not-poles",
      "detect": "residues.any(r => r.at in [0, b])",
      "message": "z = 0 and z = b are branch points. No residue exists at either; the end semicircles are discharged by ML with O(eta^(1+mu)) and O(eta^(1+nu)), which is where the integrability hypotheses mu, nu > -1 are spent." },
    { "id": "dogbone-alone-encloses-nothing",
      "detect": "contour.composite == null && ledger.row('CATCH').enclosedCount == 0",
      "message": "n(D_cw, c) = 0. As in D6, the identity is the residue theorem for the EXTERIOR region: int_D,cw = 2 pi i [Res(f,c) + Res(f,inf)]. Report the winding numbers and the enclosed-pole count as separate rows and never let one imply the other." },
    { "id": "pole-lands-on-the-cut",
      "detect": "algebraic:c <= b",
      "message": "If c is moved into [0, b] the simple pole sits ON the cut: the dogbone cannot separate them, the integral diverges, and the method does not apply. Refuse - do not slide c through b and keep printing the closed form, which stays finite and real on the far side and is simply not the value of anything." }
  ],

  "golden": [
    // method: (a) tanh-sinh on [0, b] with the two endpoint powers evaluated from the transform's own
    //         cancellation-free distances;  (b) x = b u^2 then 1 - u = v^4, which desingularises both
    //         endpoints, then composite 60-pt GL. Six (mu, b, c) points checked against the general
    //         closed form, all rel <= 1.2e-14.
    // Contour: C_R + D_cw = 2 pi i Res(f, c) to 2.6e-9 (eta = 1e-5, R = 1e6); D_cw = (1+i) T to
    //         3.5e-14; factor c recovered as +i = -exp(2 pi i * 3/4) to 4.2e-7.
    { "params": { "mu": 0.75, "nu": 0.25, "b": 3, "c": 5 },
      "value": "(pi/(2*sqrt(2)))*(17 - 40^(3/4))", "numeric": 1.2157787268935614, "verifiedTo": 2e-15,
      "note": "40^(3/4) = 15.905414575341013; 4*250^(1/4) = 40^(3/4); Res(f,5) + Res(f,inf) = exp(-i pi/4)*(17/4 - 250^(1/4))" },
    { "params": { "mu": 0.25, "nu": 0.75, "b": 3, "c": 5 },
      "value": "(pi/sin(pi/4))*(5 - 2.25 - 5^(1/4)*2^(3/4))", "numeric": 1.0446690187189636, "verifiedTo": 1.1e-15 },
    { "params": { "mu": 0.5, "nu": 0.5, "b": 2, "c": 7 },
      "value": "pi*(7 - 1 - sqrt(35))", "numeric": 0.26364313690190516, "verifiedTo": 1.2e-14 },
    { "params": { "mu": 1/3, "nu": 2/3, "b": 4, "c": 10 },
      "value": "(pi/sin(pi/3))*(10 - 8/3 - 10^(1/3)*6^(2/3))", "numeric": 0.79642741810310058, "verifiedTo": 7.9e-15 },
    { "params": { "mu": 0.9, "nu": 0.1, "b": 1, "c": 1.5 },
      "value": "(pi/sin(0.9*pi))*(1.5 - 0.1 - 1.5^0.9*0.5^0.1)", "numeric": 0.56995228481175941, "verifiedTo": 1.4e-15 }
  ],

  "invariants": [
    "the top -> bottom crossing phase computed by routing around z = 0 must equal the one computed by routing around z = b; equality holds iff mu + nu in Z",
    "Res(f, c) evaluated from above (arg z = 0, arg(b-z) = -pi) must equal the value from below (arg z = 2 pi, arg(b-z) = +pi)",
    "at mu -> 1^- the solve denominator 1 - exp(2 pi i mu) -> 0 and the app must degrade to '≈ with a stated condition number' before refusing (DESIGN s4 pass 5)"
  ]
}
```

---

## Verification log

Every number in this file was recomputed in this session with float64 `node` scripts (scratchpad only,
nothing added to the repo), independently of research 03's table. **No disagreement was found.** Two
methods minimum per value; the contour bookkeeping — residues, crossing phases, winding numbers,
orientations, and the residue at infinity — was checked separately by numerically integrating the actual
contours at finite `ε`, `η`, `R` and comparing against the analytic ledger identity.

| entry | value | method A | method B | best rel. error |
|---|---|---|---|---|
| C1 | `π/2` | half-period decomposition at multiples of π + repeated-averaging (Euler) of the alternating tail | 64-pt GL per half period to `40π` + the alternating asymptotic tail `cos A(1/A − 2!/A³ + 4!/A⁵ − …)` | 2.8e−16 |
| C2 | `π/2` | `½·sinc²(x/2)` head to `40π` + tail `1/A − ∫_A^∞ cos x/x²` decomposed at the zeros of `cos` and accelerated | direct sum to `2000π` + accelerated tail | 5.7e−16 |
| C3 | `π(1−e⁻¹)` | half-period + Euler on the even integrand `sinc(x)/(x²+1)`, doubled | composite GL to `x = 2000` + accelerated oscillatory tail | < 1e−16 |
| D1 | `π/sin πα` | exp-sinh (double-exponential) on `(0,∞)`, five α | — (contour identity to 8.7e−16) | 1.4e−16 |
| D2 | `π(1−1/√2)` | exp-sinh | `x = t²` then `t = 1/u`, split at 1 | < 1e−16 |
| D3 | `(π/n)/sin(πa/n)` | exp-sinh, six `(a,n)` | wedge `2π/n` residue identity (invariant) | < 1e−16 |
| D4 | `−π/4` | exp-sinh | fold `x → 1/x` onto `(0,1)`, tanh-sinh | 2.8e−16 |
| D5 | `π³/8` | exp-sinh | fold `x → 1/x`; **and** `4·β(3)` series | < 1e−16 |
| D6 | `π/(a√(1+a²))` | tanh-sinh with cancellation-free endpoint distances, five `a` | `x = sin θ` → smooth periodic | < 1e−16 |
| D7 | `(π/(2√2))(17−40^{3/4})` | tanh-sinh on `[0,3]`, six `(μ,b,c)` | `x = 3u²` then `1−u = v⁴` | 9.1e−16 |

**Contour-bookkeeping checks** (all analytic identities, confirmed numerically):

- C1 closed contour `= 0` to 1.9e−9; indentation measured `(0, −3.1415907)` against `i(−π)(1) = −iπ`; Jordan bound `|arc| = 2.6e−3 ≤ π/R = 7.9e−3`.
- C2 closed contour `= 0` to 2.8e−11 with `(1 − e^{iz} + iz)/z²` **entire**; `Im(line) = 1.0e−13` (odd, exact); big arc `→ −π` by L5. The alternative `(1 − e^{iz})/z²` route agrees, small arc measured `(−3.1415917, 0)` against `i(−π)(−i) = −π`.
- C3 closed contour `= 2πi·Res(f,i) = −iπ/e` to 4.4e−8; indentation `= −iπ`; `Re(p.v.) = −5.1e−8 ≈ 0` (oddness check).
- D1/D2/D3 keyhole totals `= 2πi ΣRes` to 8.7e−16 / 5.1e−15 / 1.2e−14; each `reproduces` factor recovered from `lower/I`.
- D4 `Σ = π/2 − iπ²/2`; `A = −Re Σ/2 = −π/4`; `B = −Im Σ/(2π) = +π/4`; `upper + lower = 4π²B − 4πiA` to 8.5e−9.
- D5 `Σ₃ = 13π³/8` (purely real); `C = (4π²·(π/2) − Re Σ₃)/3 = π³/8`; `A = −Im Σ₃/(6π) = 0`. Prerequisite `Σ₂ = −iπ²` giving `B = π/2`, `A = 0`. Second fixture `R = 1/(x²+4)`, where all three are non-zero: `Σ₂ = −1.08879305 − 4.93480220i`, `Σ₃ = 24.0605591 − 10.2616327i`, giving `A = π log2/4 = 0.544396523`, `B = π/4`, `C = 2.31523921`, each matching quadrature to ≤ 2e−15.
- D6 `C_R + D_cw = 2πi ΣRes` to 1.5e−15; `|C_R| = 2.7e−25` (`Res(f,∞) = 0`); `W(+ia) = +√(1+a²)`, `W(−ia) = −√(1+a²)` at every `a` tested.
- D7 `C_R + D_cw = 2πi Res(f,5)` to 2.6e−9; `C_R = −2πi Res(f,∞)` to 2.4e−9; `D_cw = (1+i)T` to 3.5e−14; crossing phase via `0` equals via `3` to 2e−16.
- L4 double-pole divergence measured: `|∫_{C_ρ} e^{iz}/z² dz| = 2.00e1, 2.00e2, 2.00e3, 2.00e4` at `ρ = 10⁻¹…10⁻⁴` (i.e. `2/ρ`), against the simple-pole case converging to `−iπ`.

**One error the process caught, worth recording as a method note.** My first derivation of D5's split
wrote `T1 = +Im(Σ₃)/(6π)`, from dividing `12π²·T1` by `2πi` and forgetting that `1/i = −i`. The flagship
fixture `R = 1/(1+x²)` cannot see it: `Σ₃` is purely real there, so `T1 = 0` under either sign, and every
numeric check passed. It surfaced only when the same relations were re-run on a second `R` with
non-zero bonus terms. **Every `log^k` family record therefore carries a mandatory second fixture whose
bonus integrals are non-zero**, and `sign-of-T1-from-the-1-over-i` is in D5's `traps` with that
provenance. The general lesson for the corpus: a fixture in which a quantity is zero tests nothing about
that quantity's sign, and the log families are full of zeros (`∫₀^∞ log x/(1+x²) dx = 0` most of all).

**One method that did not work and is not used:** Abel regularisation of C1 (`∫₀^∞ e^{−sx}sin x/x dx = arctan(1/s)`, `s → 0⁺`) via exp-sinh quadrature. The identity is right and reproduces `arctan(1/s)` to machine precision at `s = 0.05`, but double-exponential nodes are geometrically spaced and fail on the highly oscillatory integrand as `s → 0`; the `s = 0.005` value was off by 3e−3. It is recorded here so that nobody re-derives it as a third check. Methods A and B above are the correct ones for conditionally-convergent oscillatory targets.

---

## Schema gaps, in full

Reported rather than worked around, per instruction. Each is marked inline in the affected records.

### G1 — there is no `auxiliary`

`Family.target.integrand` is the *real* integrand. Nothing in the schema says that `sin x/x` is
integrated by contour-integrating `e^{iz}/z`, or that the answer is an **imaginary part** of the result,
or that D4's contour integrand is `R(z)(log z)²` while its target is `R(x) log x`. `RealIntegral.
substitution` is a change of variable (`z = e^{iθ}`), not a complexification. Five of these ten records
need the missing field, and without it DESIGN §4 pass 5's `T·(1 + Σcⱼ) + ΣVᵢ + ΣFₗ = S` is an identity
among complex numbers in which `T` is *not* the target. **Proposed:** `auxiliary: { integrand, relation,
extract: "Re" | "Im" | "none" | "components", fold }`, with pass 4 (COVER) verifying `relation` on the
real axis symbolically and pass 5 applying `extract` as its own ledger row with its own certificate.

### G2 — pass 5 is rank-1; the log families need a linear system

DESIGN §4's solve is `T = (S − ΣVᵢ − ΣFₗ)/(1 + Σⱼcⱼ)` — one unknown, one scalar denominator. D4's lower
edge contributes `−(T₂ + 4πi·T₁ − 4π²·T₀)`, an affine combination of **three different real integrals**,
and D5's contributes four. No `factor: ExprNode` can express that, because `factor` multiplies one `T`.
**Proposed:** targets become a vector and the solve becomes `M·T = S − V − F` with `M` a small complex
matrix; DESIGN's scalar case is the 1×1 case. The payoff is that **four separate traps in this file
become one rank condition**: D1's wrong `argRange` (`M = [0]`), D3 at integer `a` (`M = [0]`), the
plain-`log` keyhole losing `∫R log x` (the `T₁` column is zero), and D5's underdetermined `T₂` (rank 2,
three unknowns). "The system carries no information about this target" is then a *computed* statement —
a rank/kernel report naming exactly which targets are undetermined — rather than four hand-written
detectors. This is the single most useful change on the list.

### G3 — no per-pole winding numbers

`contour.encloses` is one prose string. Research 02 P0 #7 and DESIGN §4 pass 2 both require the winding
number and the enclosed-pole count to be *separate reported rows*, and C3 (three poles, `n = 0, 1, 0`)
and D6/D7 (every pole at `n = 0` for the bare dogbone) are exactly the cases that break when they are
conflated. **Proposed:** `contour.windings: Record<string, number>`, checked against
`kernel/winding.ts`'s exact-sign predicate rather than trusted.

### G4 — `branch` is singular

`branch: { function, cut: { ray, argRange }, crossingPhase }` holds one function, one cut and one
`argRange`. D6 has two branch points with `α = −1/2` each; D7 has two with different exponents **and**
two different argument conventions (`[0,2π)` for `z^μ`, `(−π,π]` for `(b−z)^ν`). Research 06 §8's
`BranchChoice` (`branchPoints[]`, `cuts[]`, `baseLift[]`) is the right shape and already exists in the
engine; `Family.branch` should be a `BranchChoice` diff, not a flat triple. It also needs a place for
`admissibility` (the `Σαₖ ∈ ℤ` verdict) and for `effectiveCut` — the D7 note that the union of
sub-expression cuts is *not* the discontinuity set of the composite, which research 06 §2.2 calls out
as a rendering-honesty issue and which the Family record currently cannot state.

### G5 — the residue at infinity has no seat

Pass 2 computes `S := 2πi Σₖ n(γ,aₖ)·Res(f,aₖ)` over **detected finite singularities**. `Res(f,∞)` is
not in that sum, and pass 3's role table says `role: "residue"` is "already handled in pass 2" — which
for the dogbone is false. D6 survives because `Res(f,∞) = 0` and the outer circle can honestly be a
`vanish` row discharged by L2 (and that coincidence is itself the §9(d) unification worth surfacing).
D7 does not: its outer circle is worth `2πi(17/4)e^{3πi/4}`, magnitude 26.7 in an answer of magnitude
1.216. **Proposed:** a first-class `residueAtInfinity` ledger row with its own certificate, computed as
`Res_{w=0}[−w⁻²f(1/w)]`, plus a `role: "residue"` piece whose pass-3 entry is "value = `−2πi·Res(f,∞)`",
not "see pass 2".

### G6 — `principalValue` is a boolean, and it is on the wrong object

DESIGN §2.3 says "p.v. is a DISTINCT result type, never a flag on a value", and then the only place to
record it is `target.principalValue?: boolean`. Three distinct facts need to travel and cannot: (i) the
*auxiliary* needs a p.v. (`∫cos x/x` diverges) while the *target* does not; (ii) the target's
singularity is removable, so `p.v. = the integral` — a theorem, not a default; (iii) the ledger's
*result* is of p.v. type. C1 and C3 both hit this. **Proposed:** `ResultType = { kind: "convergent" |
"principalValue" | "finitePart", coincidesWithImproper?: Certificate }`, produced by pass 6, never set
by hand.

### G7 — `golden[]` has no provenance

`{ params, value, numeric, verifiedTo }` records *what* and *how closely*, never *how*. A golden value
with no method is an assertion, and the whole point of the corpus is that it is not one. The C-tier
entries in particular are only reproducible if the method is recorded (an ordinary adaptive quadrature
will not converge on `∫₀^∞ sin x/x`). The method strings live in JSONC comments above, which is better
than nothing and worse than data. **Proposed:** `golden[].method: string` and
`golden[].methods?: { name, value, relError }[]` for the two-method rule.

### G8 — no `prerequisites`

D5 does not close on its own: it needs `∫₀^∞ R dx`, which comes from D4's contour on the same `R`.
Chained families are not expressible, so either the record lies (claiming to determine `T₂` alone) or the
dependency lives in prose. **Proposed:** `prerequisites: { needs, from, alternative, rigorOfInput }[]`,
with the prerequisite appearing as its own ledger row and its verdict meeting into the final one — a
borrowed value must not silently upgrade a label.

### Two smaller notes, not gaps

- **`role: "vanish"` is a misnomer** for a piece with a known non-zero limit. DESIGN §4 pass 5 explicitly
  intends it ("`Vᵢ` for the disposed `vanish` pieces, each `0` or a known limit such as `iα·Res` from
  L4"), and pass 3's table allows the verdict `B → c ≠ 0`, so the semantics are right and only the name
  misleads. C1's indentation, C2's L5 arc and D6/D7's end semicircles all use it as designed. `disposed`
  would read better.
- **`TemplateId` has no dogbone-plus-outer-circle**, and `Contour.closed` ("last endpoint ≡ first") cannot
  describe a two-component homology cycle. Both D6 and D7 are written as a single closed curve using the
  standard cancelling cross-cuts, which is geometrically faithful and keeps `closed` true — but the
  cross-cut pair is invisible in `pieces[]`, and a reader checking `Σ pieces = ∮` will be one (cancelling)
  pair short. Worth a `crosscuts` annotation or an explicit zero-value piece.
