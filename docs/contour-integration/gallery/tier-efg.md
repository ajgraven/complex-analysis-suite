# Gallery tiers E, F, G — Family records

> Companion to [`../DESIGN.md`](../DESIGN.md) §5 (the locked `Family` v1 format) and §4 (the Ledger
> algorithm), and to [`../research/03-method-taxonomy.md`](../research/03-method-taxonomy.md) §6, §7,
> §8, §13, §15. Tiers A–D live in the sibling file.
>
> **Verification status.** Every closed form below was **independently recomputed in this session**
> — not taken from research/03's table — to the relative error recorded in each `golden[]` entry
> (worst case 2.0×10⁻¹², typical 10⁻¹⁵). Method per entry is named in `golden[].verifiedBy`. **Four
> disagreements with research/03 and six schema gaps** are recorded in [§10](#10-findings) and are
> flagged inline where they bite. Two are substantive: **D-1**, L6's arc range, whose stated majorant
> diverges; and **D-2**, the §8 square-contour bound, which drops a `π` and as printed is *not an
> upper bound* — it falls 30–40 % below the measured integral at every `N` tested.

Tiers A–D establish that the engine can *close a contour and collect residues*: rational arithmetic,
arc decay, Jordan, indentation, and one branch cut. **E, F and G collectively establish the three
structures that lie beyond "one auxiliary piece vanishes and the rest is a residue sum"** — a piece
that comes back as a multiple of the unknown, a piece whose exact value is imported from outside the
contour argument, and a contour on which *everything* vanishes and the vanishing is itself the
conclusion. Tier **E** (rectangle / strip) is the showcase for the `reproduces` role: the horizontal side that *comes back as a constant
multiple of the unknown* rather than vanishing, so the answer falls out of a division by `1 − λ`
instead of a residue sum alone — **E1** introduces the quasi-period `λ = e^{2πia}` and the
`(1 − λ)∫ = 2πi ΣRes_strip` identity; **E2** makes `λ` a negative real and delivers a whole Fourier
transform in one contour, with sech's self-reciprocality as a free invariant; **E3** removes the
residues altogether — its contour encloses *nothing*, and the engine must report an empty singular
set and still print `√π e^{−b²/4}`. Tier **F** (wedge) replaces translation symmetry with rotation:
**F1** adds the rotational factor `−ω·μ` and a second, branch-cut-free provenance for a D-tier
keyhole integral (a free cross-family invariant); **F2** adds the one bound in the whole taxonomy
that textbooks routinely hand-wave — the L6 wedge/Jordan estimate — and must carry a
conditional-convergence label on the target. Tier **G** is not an integral at all: the contour
integral over the expanding half-integer square **tends to zero**, and *that vanishing is what forces
the sum*; **G2** adds the uniform kernel bound `|cot πz| ≤ coth(π/2)` and the half-integer contour
family, **G3** adds the `π csc` kernel whose residues carry the alternation `(−1)ⁿ`, and **G1** adds
the capability the tier exists for — **a pole of the kernel and a pole of `f` colliding at `n = 0`,
merging into an order-3 pole whose residue `−π²/3` is the entire source of `π²/6`.**

---

## 0. Conventions used by every record below

**Quasi-period (tier E).** `P > 0` is a *real* height and the relation is `f(z + iP) = λ f(z)`,
matching `DESIGN.md` §5 and the `Piece.factor` semantics. Research/03 §6 writes "`P = 2πi`" for E1,
which under this convention would mean `f(z − 2π)`; the height is `P = 2π`. The `reproduces` factor
is **`−λ`**, not `λ` — the minus sign is the reversed traversal of the top side, exactly as the
keyhole's lower edge carries `−e^{2πis}` rather than `+e^{2πis}`.

**Rotational factor (tier F).** With `ω = e^{2πi/n}` (or `e^{iφ}` for a general wedge angle `φ`) and
`f(ωz) = μ f(z)`, the return ray `{ωt : t = R → 0}` contributes `−ω·μ ∫₀^R f(t)dt`. So the
`reproduces` factor is **`c = −ω·μ`**, and Pass 5's denominator is `1 + c = 1 − ωμ`. F1 has `μ = 1`
and `c = −ω`; the general D3 member `z^{a−1}/(1+zⁿ)` has `μ = ω^{a−1}` and `c = −ω^a = −e^{2πia/n}`.

**Pass 5.** `T·(1 + Σⱼcⱼ) + ΣᵢVᵢ + ΣₗFₗ = S`, `S = 2πi Σₖ n(γ,aₖ)·Res(f,aₖ)`. E1, E2 and F1 use it
with `Σc ≠ 0` and `ΣF = 0`; E3 and F2 use it the other way round — `Σc = 0`, `ΣF ≠ 0`, and `S = 0`;
**tier G breaks it**, because there is no `target` piece at all and the unknown sits inside `S` —
see [§6](#6-g-tier--a-prefatory-note-this-is-not-an-integral) and finding **SG-1**.

**Verdict levels** are `DESIGN.md` §3's: `=` `≤` `≥` `≈` `?` `⚠`.

---

## 1. E1 — `∫ℝ e^{ax}/(1+e^x) dx = π/sin(πa)`, `0 < a < 1`

This is the `reproduces` role in its purest form, and the entry exists to teach **one thing: the
denominator of the answer and the denominator of the method are the same object.** `f(z + 2πi) =
e^{2πia} f(z)`, so the top side of the rectangle does not decay — it returns `−λ` times the bottom
— and Pass 5 divides by `1 + c = 1 − λ = 1 − e^{2πia}`. That factor is `−e^{iπa}·2i sin(πa)`, so the
`sin(πa)` in `π/sin(πa)` is *literally* the Pass-5 denominator, not a coincidence of simplification.
Three further facts the record must make visible. First, the parameter window `0 < a < 1` is not a
convergence footnote bolted on afterwards: `a > 0` is exactly what makes the **left** vertical side
vanish and exactly what makes the integral converge at `x → −∞`; `a < 1` is exactly the **right**
side and exactly `x → +∞`. One condition, two jobs, and the engine derives both from the same ML
bound. Second, the degenerate case `1 − λ = 0` happens precisely at `a ∈ ℤ` — where the closed form
has a pole and the integral diverges — so `DESIGN.md` §4's structural refusal on a zero denominator
fires for the *right* reason without a bespoke detector. Third, E1 is the logarithmic image of D1
(`x = log t`), which is a free cross-family invariant and is recorded as one.

```jsonc
{
  "id": "strip-exponential-quasiperiod",
  "title": "Exponential fraction on a strip (quasi-period λ = e^{2πia})",
  "taxonomySection": "6",
  "tier": "E",

  "target": {
    "variable": "x", "lower": "-inf", "upper": "inf",
    "integrand": "exp(a*x)/(1 + exp(x))",
    "symbols": {}
  },

  "parameters": [
    { "name": "a", "domain": "real", "constraints": ["a > 0", "a < 1"] },
    { "name": "R", "domain": "real", "constraints": ["R > 0"] }      // geometry, R -> inf
  ],

  "hypotheses": [
    { "id": "quasi-periodic",
      "statement": "f(z + 2πi) = λ f(z) with λ = e^{2πia} constant  (L7)",
      "check": "symbolic:quasiPeriod(f, P=2*pi) == exp(2*pi*i*a)",
      "onFail": "refuse" },
    { "id": "left-vertical-and-minus-infinity",
      "statement": "a > 0 — one condition doing two jobs: it makes |f| → 0 on the LEFT vertical side and makes the target converge at x → −∞",
      "check": "algebraic:gt(a, 0)", "onFail": "refuse" },
    { "id": "right-vertical-and-plus-infinity",
      "statement": "a < 1 — likewise for the RIGHT vertical side and x → +∞",
      "check": "algebraic:lt(a, 1)", "onFail": "refuse" },
    { "id": "no-pole-on-the-boundary",
      "statement": "1 + e^z = 0 only at z = iπ + 2πik, so no pole lies on Im z ∈ {0, 2π}",
      "check": "algebraic:noRootOnHorizontalLines(1 + exp(z), [0, 2*pi])",
      "onFail": "refuse" },
    { "id": "nondegenerate-solve",
      "statement": "1 + Σc = 1 − λ ≠ 0, i.e. a ∉ ℤ",
      "check": "algebraic:ne(1 - exp(2*pi*i*a), 0)", "onFail": "refuse" }
  ],

  // no branch: exp(a*z)/(1+exp(z)) is single-valued meromorphic on C.

  "contour": {
    "template": "rectangle",
    "limitParams": [ { "name": "R", "to": "inf" } ],
    "pieces": [
      { "id": "bottom", "name": "the real axis", "kind": "segment",
        "from": "-R", "to": "R", "role": "target", "colour": 0 },
      { "id": "right", "name": "right vertical x = R", "kind": "segment",
        "from": "R", "to": "R + 2*pi*i", "role": "vanish", "lemma": "L1", "colour": 1 },
      { "id": "top", "name": "the line Im z = 2π", "kind": "segment",
        "from": "R + 2*pi*i", "to": "-R + 2*pi*i",
        "role": "reproduces", "factor": "-exp(2*pi*i*a)", "colour": 2 },
      { "id": "left", "name": "left vertical x = −R", "kind": "segment",
        "from": "-R + 2*pi*i", "to": "-R", "role": "vanish", "lemma": "L1", "colour": 3 }
    ],
    "orientation": "ccw",
    "encloses": "exactly one pole, z = iπ (simple), in the open strip 0 < Im z < 2π"
  },

  "vanishingLemmas": [
    { "lemma": "L1", "piece": "right",
      "sideCondition": "for all y in [0,2π]: |f(R+iy)| ≤ e^{aR}/(e^R − 1), from |1+e^z| ≥ |e^z| − 1; hence |∫| ≤ 2π e^{aR}/(e^R − 1)",
      "discharge": "symbolic:mlBound(piece=right, M=exp(a*R)/(exp(R)-1), L=2*pi, limit=R->inf, requires=[a<1])",
      "rigorIfDischarged": "=", "rigorIfNumericOnly": "≈" },
    { "lemma": "L1", "piece": "left",
      "sideCondition": "for all y in [0,2π]: |f(−R+iy)| ≤ e^{−aR}/(1 − e^{−R}), from |1+e^z| ≥ 1 − |e^z|; hence |∫| ≤ 2π e^{−aR}/(1 − e^{−R})",
      "discharge": "symbolic:mlBound(piece=left, M=exp(-a*R)/(1-exp(-R)), L=2*pi, limit=R->inf, requires=[a>0])",
      "rigorIfDischarged": "=", "rigorIfNumericOnly": "≈" }
  ],

  "residueSelection": { "rule": "inside", "set": "0 < Im z < 2*pi" },

  "closedForm": {
    "expr": "(2*pi*i/(1 - exp(2*pi*i*a))) * Res(exp(a*z)/(1+exp(z)), i*pi)",
    "simplified": "pi/sin(pi*a)"
    // Res(f, iπ) = e^{az}/(e^z) at z=iπ = −e^{iπa}  (simple pole: P/Q' with Q' = e^z)
    // 1 − e^{2πia} = −e^{iπa}·2i·sin(πa)  ⇒  T = −2πi·(−e^{iπa}) / (−e^{iπa}·2i·sin πa) = π/sin(πa)
  },

  "rigor": { "policy": "min",
             "inputs": ["hypotheses.*", "vanishingLemmas.*.rigor",
                        "residues.*.rigor", "reproduces.*.rigor", "solve.conditioning"] },

  "traps": [
    { "id": "horizontal-side-is-not-a-vanishing-side",
      "detect": "contour.pieces.some(p => p.role == 'vanish' && geom:isHorizontalTranslate(p, piece('bottom'), 'i*P'))",
      "message": "The top side is a translate of the bottom, so |f| on it equals |λ|·|f| on the bottom — and |λ| = 1 for real a. Its ML bound is proportional to the length 2R and DIVERGES. The top side does not vanish; it REPRODUCES (L7 is not a vanishing lemma). Set role='reproduces' with factor −λ." },
    { "id": "a-out-of-range",
      "detect": "!(a > 0 && a < 1)",
      "message": "|a| ≥ 1 (or a ≤ 0) breaks convergence, and breaks it on the side you can see: for a ≥ 1 the integrand tends to e^{(a−1)x} ≥ 1 as x → +∞ and the right vertical bound e^{aR}/(e^R−1) no longer tends to 0; for a ≤ 0 the same happens at x → −∞ on the left. The residue sum still returns a finite number — refuse it." },
    { "id": "lambda-one-degenerate",
      "detect": "algebraic:eq(1 + sum(contour.pieces.filter(role=='reproduces').factor), 0)",
      "message": "λ = 1 (a ∈ ℤ) makes 1 + Σc = 0: the top side cancels the bottom exactly and the closed-contour identity carries NO information about T. Pass 5 divides by zero — which is the correct behaviour, not a bug. Note the residue sum must then vanish identically; a nonzero sum means the strip height or the pole list is wrong." },
    { "id": "wrong-strip-height",
      "detect": "!symbolic:isQuasiPeriod(f, contour.height)",
      "message": "P must be a genuine quasi-period AND the strip must contain exactly the poles you count. Height 4π here reproduces with λ² but encloses z = iπ and z = 3iπ; height π reproduces with nothing at all (f(z+iπ) is not a constant multiple of f(z))." },
    { "id": "factor-sign",
      "detect": "contour.pieces.filter(role=='reproduces').some(p => !expr:startsWithMinus(p.factor))",
      "message": "The factor is −λ, not +λ. The minus is the reversed traversal of the top side (R+iP → −R+iP), not part of the quasi-period. Dropping it turns 1 − λ into 1 + λ and silently returns π/sin(πa) evaluated at the wrong point." }
  ],

  "golden": [
    { "params": { "a": 0.3 }, "value": "pi/sin(pi*a)", "numeric": 3.8832220774509327,
      "verifiedTo": 1.2e-16,
      "verifiedBy": "composite 40-pt Gauss–Legendre on [−60,60] + exact geometric tail series; cross-checked by tanh–sinh on the Beta form ∫₀¹ u^{a−1}(1−u)^{−a}du (rel 1.4e-15)" },
    { "params": { "a": 0.5 }, "value": "pi", "numeric": 3.1415926535897931, "verifiedTo": 0.0,
      "verifiedBy": "same; exact agreement in float64" },
    { "params": { "a": 0.91 }, "value": "pi/sin(pi*a)", "numeric": 11.260547686233595,
      "verifiedTo": 7.9e-16, "verifiedBy": "same (near the a → 1⁻ edge where the closed form blows up)" },
    { "params": { "a": 0.05 }, "value": "pi/sin(pi*a)", "numeric": 20.082484079079745,
      "verifiedTo": 3.5e-16, "verifiedBy": "same (near the a → 0⁺ edge)" },

    // structural goldens — these pin the MECHANISM, not just the value
    { "params": { "a": 0.3, "probe": "quasiPeriod" }, "value": "exp(2*pi*i*a)",
      "numeric": [-0.309016994374947, 0.951056516295154], "verifiedTo": 2.0e-16,
      "verifiedBy": "f(z+2πi)/f(z) at z = 0.37+0.91i" },
    { "params": { "a": 0.3, "probe": "residue" }, "value": "-exp(i*pi*a)",
      "numeric": [-0.587785252292473, -0.809016994374947], "verifiedTo": 8.5e-16,
      "verifiedBy": "trapezoid on |z − iπ| = 0.05, 512 nodes" },
    { "params": { "a": 0.3, "R": 9, "probe": "closedContour" }, "value": "2*pi*i*Res(f, i*pi)",
      "numeric": [5.08320369231526, -3.69316366098092], "verifiedTo": 1.6e-15,
      "verifiedBy": "sum of the four sides at finite R = 9 (Cauchy: exact at every R)" },
    { "params": { "a": 0.3, "R": 9, "probe": "reproducesFactor" }, "value": "top == -lambda*bottom",
      "numeric": [1.12994750025262, -3.47762081939980], "verifiedTo": 3.7e-15,
      "verifiedBy": "top side vs −e^{2πia}·bottom side at R = 9 — Pass 3's 'verified numerically before use'" }
  ],

  "invariants": [
    { "id": "E1-equals-D1-under-x-log-t",
      "statement": "x = log t maps ∫ℝ e^{ax}/(1+e^x)dx onto ∫₀^∞ t^{a−1}/(1+t)dt: with t = e^x, dx = dt/t and e^{ax} = t^a, so the integrand becomes t^{a−1}/(1+t). The keyhole's phase e^{2πis} and the strip's λ are the same number with s = a.",
      "check": "numeric:agree(E1(a), D1(alpha=a), tol=1e-12)",
      "verifiedTo": 5.6e-15, "verifiedBy": "a = 0.37: 3.4231291956152639 both sides" }
  ]
}
```

---

## 2. E2 — `∫ℝ sech(x) e^{iξx} dx = π sech(πξ/2)`

E2 exists to teach that **one contour can compute a whole transform, and that the quasi-period can be
negative.** `sech(z + iπ) = −sech(z)` and `e^{iξ(z+iπ)} = e^{−πξ}e^{iξz}`, so `λ = −e^{−πξ}` — a
*negative real* number, which makes `1 − λ = 1 + e^{−πξ}` strictly positive for every real `ξ` and
therefore makes the Pass-5 solve **unconditionally well-posed**. Contrast E1, whose denominator
vanishes at integer `a`: here `1 − λ = 0` would need `e^{−πξ} = −1`, i.e. `ξ = ±i(2k+1)`, which are
exactly the poles of the answer `sech(πξ/2)` — the degeneracy locus of the method and the pole set of
the result coincide, and that is an invariant worth testing. The second contrast with E1 is sharper
still: **E2's vertical sides need no parameter condition at all.** `|sech z| ≤ 1/sinh R` on
`Re z = ±R` regardless of `ξ`, and `|e^{iξz}| = e^{−ξy}` is bounded on a *horizontal strip* of finite
height for every real `ξ`; the decay is supplied entirely by `sech`, not by the exponential. E1's
`0 < a < 1` and E2's "no condition" come out of the same ML machinery — which is the point. Finally,
the record carries the self-reciprocality as an invariant, because it is the cleanest possible
regression test: substituting `x = πt`, `ξ = 2u` turns the closed form into
`∫ℝ sech(πt)e^{2πiut}dt = sech(πu)`, i.e. **`sech(πt)` is a fixed point of the Fourier transform** in
the `e^{2πiut}` convention. A sign error anywhere in the strip machinery breaks the fixed point.

```jsonc
{
  "id": "strip-sech-fourier",
  "title": "Fourier transform of sech by a strip contour (λ = −e^{−πξ})",
  "taxonomySection": "6",
  "tier": "E",

  "target": {
    "variable": "x", "lower": "-inf", "upper": "inf",
    "integrand": "sech(x)*exp(i*xi*x)",
    "symbols": {}
  },

  "parameters": [
    { "name": "xi", "domain": "real", "constraints": [] },   // NO constraint: see hypotheses
    { "name": "R", "domain": "real", "constraints": ["R > 0"] }
  ],

  "hypotheses": [
    { "id": "quasi-periodic",
      "statement": "f(z + iπ) = λ f(z) with λ = −e^{−πξ}: sech(z+iπ) = −sech z and e^{iξ(z+iπ)} = e^{−πξ}e^{iξz}",
      "check": "symbolic:quasiPeriod(f, P=pi) == -exp(-pi*xi)",
      "onFail": "refuse" },
    { "id": "verticals-need-nothing",
      "statement": "|f| ≤ e^{π·max(0,−ξ)}/sinh(R) on Re z = ±R for EVERY real ξ — the decay comes from sech, not from the exponential factor",
      "check": "symbolic:true", "onFail": "warn" },
    { "id": "no-pole-on-the-boundary",
      "statement": "cosh z = 0 only at z = iπ/2 + ikπ, so no pole lies on Im z ∈ {0, π}",
      "check": "algebraic:noRootOnHorizontalLines(cosh(z), [0, pi])", "onFail": "refuse" },
    { "id": "nondegenerate-solve",
      "statement": "1 − λ = 1 + e^{−πξ} > 0 for every real ξ; it vanishes only at ξ = ±i(2k+1), which are exactly the poles of sech(πξ/2)",
      "check": "algebraic:ne(1 + exp(-pi*xi), 0)", "onFail": "refuse" }
  ],

  "contour": {
    "template": "rectangle",
    "limitParams": [ { "name": "R", "to": "inf" } ],
    "pieces": [
      { "id": "bottom", "name": "the real axis", "kind": "segment",
        "from": "-R", "to": "R", "role": "target", "colour": 0 },
      { "id": "right", "name": "right vertical x = R", "kind": "segment",
        "from": "R", "to": "R + pi*i", "role": "vanish", "lemma": "L1", "colour": 1 },
      { "id": "top", "name": "the line Im z = π", "kind": "segment",
        "from": "R + pi*i", "to": "-R + pi*i",
        "role": "reproduces", "factor": "exp(-pi*xi)", "colour": 2 },
        // factor = −λ = −(−e^{−πξ}) = +e^{−πξ}.  The two minus signs (reversed traversal, and
        // sech's own sign flip) cancel — the ONLY entry in the tier whose factor is positive.
      { "id": "left", "name": "left vertical x = −R", "kind": "segment",
        "from": "-R + pi*i", "to": "-R", "role": "vanish", "lemma": "L1", "colour": 3 }
    ],
    "orientation": "ccw",
    "encloses": "exactly one pole, z = iπ/2 (simple), in the open strip 0 < Im z < π"
  },

  "vanishingLemmas": [
    { "lemma": "L1", "piece": "right",
      "sideCondition": "for all y in [0,π]: |sech(R+iy)| ≤ 1/sinh R (from |e^z + e^{−z}| ≥ e^R − e^{−R}) and |e^{iξz}| = e^{−ξy} ≤ e^{π·max(0,−ξ)}; hence |∫| ≤ π e^{π·max(0,−ξ)}/sinh R",
      "discharge": "symbolic:mlBound(piece=right, M=exp(pi*max(0,-xi))/sinh(R), L=pi, limit=R->inf, requires=[])",
      "rigorIfDischarged": "=", "rigorIfNumericOnly": "≈" },
    { "lemma": "L1", "piece": "left",
      "sideCondition": "identical bound by x → −x symmetry of |sech|",
      "discharge": "symbolic:mlBound(piece=left, M=exp(pi*max(0,-xi))/sinh(R), L=pi, limit=R->inf, requires=[])",
      "rigorIfDischarged": "=", "rigorIfNumericOnly": "≈" }
  ],

  "residueSelection": { "rule": "inside", "set": "0 < Im z < pi" },

  "closedForm": {
    "expr": "(2*pi*i/(1 + exp(-pi*xi))) * Res(exp(i*xi*z)/cosh(z), i*pi/2)",
    "simplified": "pi*sech(pi*xi/2)"
    // Res = e^{iξz}/sinh(z) at z = iπ/2 = e^{−πξ/2}/i = −i e^{−πξ/2}
    // ⇒ (1−λ)T = 2πi·(−i e^{−πξ/2}) = 2π e^{−πξ/2}
    // ⇒ T = 2π e^{−πξ/2}/(1 + e^{−πξ}) = 2π/(e^{πξ/2} + e^{−πξ/2}) = π sech(πξ/2)
  },

  "rigor": { "policy": "min",
             "inputs": ["hypotheses.*", "vanishingLemmas.*.rigor",
                        "residues.*.rigor", "reproduces.*.rigor", "solve.conditioning"] },

  "traps": [
    { "id": "horizontal-side-is-not-a-vanishing-side",
      "detect": "contour.pieces.some(p => p.role == 'vanish' && geom:isHorizontalTranslate(p, piece('bottom'), 'i*P'))",
      "message": "|f| on the top side is |λ| = e^{−πξ} times |f| on the bottom — a fixed nonzero multiple. Any ML bound on it is proportional to 2R and diverges. L7 is not a vanishing lemma: the top REPRODUCES." },
    { "id": "lambda-sign-dropped",
      "detect": "contour.pieces.filter(role=='reproduces').some(p => expr:equals(p.factor, '-exp(-pi*xi)'))",
      "message": "Two sign flips live here and they cancel: sech(z+iπ) = −sech(z) contributes one, the reversed traversal of the top side contributes the other, so the factor is +e^{−πξ}. Writing −e^{−πξ} turns the denominator 1 + e^{−πξ} into 1 − e^{−πξ}, which vanishes at ξ = 0 and reports the finite integral ∫sech = π as a division by zero." },
    { "id": "strip-height-2pi",
      "detect": "algebraic:eq(contour.height, 2*pi)",
      "message": "sech has quasi-period π, not 2π. A height of 2π is also a quasi-period (λ = e^{−2πξ}) but the strip then contains TWO poles, iπ/2 and 3iπ/2; counting one of them gives half the answer. The strip must contain exactly the poles you count." },
    { "id": "cos-instead-of-exponential",
      "detect": "structural:containsTrigOfComplexArgument(problem.integrand)",
      "message": "Replacing e^{iξx} by cos(ξx) before complexifying is fatal here for the same reason as in §3: |cos(ξz)| grows like e^{|ξ||y|} in both directions, so cos(ξz)·sech(z) need not decay on the verticals at all. Complexify to the exponential, take the real part at the end — and note the imaginary part vanishes by oddness, which is a free check." }
  ],

  "golden": [
    { "params": { "xi": 0 }, "value": "pi", "numeric": 3.1415926535897931, "verifiedTo": 9.9e-16,
      "verifiedBy": "2400-panel × 32-pt Gauss–Legendre on [−45,45]; |sech| ≤ 2e^{−|x|} bounds the tail at 5e-20" },
    { "params": { "xi": 1 }, "value": "pi*sech(pi/2)", "numeric": 1.2520403312521475, "verifiedTo": 1.8e-15, "verifiedBy": "same" },
    { "params": { "xi": 1.3 }, "value": "pi*sech(pi*xi/2)", "numeric": 0.80183154059201112, "verifiedTo": 1.4e-15, "verifiedBy": "same" },
    { "params": { "xi": -2.5 }, "value": "pi*sech(pi*xi/2)", "numeric": 0.12374876239269540, "verifiedTo": 1.2e-15,
      "verifiedBy": "same — negative ξ exercises the e^{π|ξ|} factor in the vertical bound" },
    { "params": { "xi": 4.7 }, "value": "pi*sech(pi*xi/2)", "numeric": 0.0039074665495647748, "verifiedTo": 6.7e-15, "verifiedBy": "same" },

    { "params": { "xi": 1.3, "probe": "quasiPeriod" }, "value": "-exp(-pi*xi)",
      "numeric": [-0.0168387845411068, 0.0], "verifiedTo": 6.3e-16, "verifiedBy": "f(z+iπ)/f(z) at z = 0.41+0.22i" },
    { "params": { "xi": 1.3, "probe": "residue" }, "value": "-i*exp(-pi*xi/2)",
      "numeric": [0.0, -0.129764342332964], "verifiedTo": 2.1e-16, "verifiedBy": "trapezoid on |z − iπ/2| = 0.05" },
    { "params": { "xi": 1.3, "R": 9, "probe": "closedContour" }, "value": "2*pi*i*Res(f, i*pi/2)",
      "numeric": [0.815333409142304, 0.0], "verifiedTo": 1.8e-15, "verifiedBy": "four sides at R = 9" }
  ],

  "invariants": [
    { "id": "sech-is-its-own-fourier-transform",
      "statement": "Put x = πt and ξ = 2u in the closed form: ∫ℝ sech(πt)e^{2πiut}dt = sech(πu). So sech(πt) is a FIXED POINT of the Fourier transform in the e^{2πiut} convention (and, being even, in the e^{−2πiut} convention too). Any sign error in λ, in the residue, or in the orientation breaks the fixed point.",
      "check": "numeric:agree(E2(xi=2*u)/pi, sech(pi*u), tol=1e-12)",
      "verifiedTo": 3.8e-15, "verifiedBy": "u = 0.4 → 0.52656588504173651; u = 1.1 → 0.063064296042890225" },
    { "id": "degeneracy-locus-equals-pole-locus",
      "statement": "1 − λ = 1 + e^{−πξ} = 0 ⟺ ξ = ±i(2k+1) ⟺ cosh(πξ/2) = 0 ⟺ the closed form sech(πξ/2) has a pole. The method degenerates exactly where the answer is undefined.",
      "check": "algebraic:setEqual(roots(1 + exp(-pi*xi)), poles(sech(pi*xi/2)))" },
    { "id": "xi-zero-reduces-to-the-classical-integral",
      "statement": "ξ = 0 gives ∫ℝ sech x dx = π, and λ = −1 there, so 1 − λ = 2: the top side reproduces the bottom with factor +1 and the two horizontal sides ADD.",
      "check": "numeric:agree(E2(0), pi, tol=1e-12)" }
  ]
}
```

---

## 3. E3 — `∫ℝ e^{−x²}cos(bx) dx = √π e^{−b²/4}` — **the empty singular set**

Every other entry in this file ends in a residue. **E3 has none**, and that is the entire content:
`f(z) = e^{−z²+ibz}` is entire, the rectangle `−R → R → R+ib/2 → −R+ib/2` encloses nothing, and the
residue theorem's conclusion is `∮ = 2πi·(empty sum) = 0` — which is Cauchy's theorem. The engine
must report `poles: []`, `S = 0`, and still print the answer, because **an empty residue sum is
information, not the absence of it**: `0` is a number, and it is the number that closes the argument.
An engine built on "contour method ⇒ residues" mis-handles this (research/03 §6 trap iv), and an
engine that treats an empty singular set as "nothing to compute, therefore refuse" is worse. What
the record teaches about the residue theorem itself is precise: the theorem does not assert "the
integral equals the residues", it asserts **"the integral equals `2πi` times a sum over the enclosed
singularities, whatever that sum contains — including nothing."** The second lesson is that the shift
height is not free. `f(z + ih)/f(z)` is not constant for any `h`, so there is **no `reproduces` piece
here and no L7**; instead the top side is a `free` piece whose value happens to be known. It is known
only at `h = b/2` — the saddle of `−z² + ibz` — where the oscillation cancels and the top side becomes
the real Gaussian. At any other height the top side is `e^{c(h)}∫ℝ e^{−x²}e^{i(b−2h)x}dx`, i.e. **the
same unknown at a different parameter**: the identity stays true and becomes vacuous. Verified: with
`b = 1.7` and the wrong-way shift `h = −b/2`, the closed contour is still `0` to `3.8×10⁻¹⁵` and the
top side `−0.860591739572559` is exactly `−e^{3b²/4}·T(2b)`, the target evaluated at `2b`. The third lesson is that the one
known value in the argument — `∫ℝ e^{−x²}dx = √π` — **does not come from this contour.** It is
`Γ(1/2)`, a polar-coordinates fact, imported. Research/03 §7 makes exactly this honesty point about
`∫₀^∞ e^{−xⁿ}dx = Γ(1+1/n)`; the same discipline applies here, and the v1 schema has nowhere to put
it (finding **SG-2**).

```jsonc
{
  "id": "gaussian-shift-zero-residue",
  "title": "Fourier transform of a Gaussian by a shifted rectangle (empty singular set)",
  "taxonomySection": "6",
  "tier": "E",

  "target": {
    "variable": "x", "lower": "-inf", "upper": "inf",
    "integrand": "exp(-x^2)*cos(b*x)",
    "symbols": {}
  },

  "parameters": [
    { "name": "b", "domain": "real", "constraints": ["b >= 0"] },
      // WLOG b ≥ 0: cos is even in b, so the family is reduced to b ≥ 0 at load time.
      // ⚠ SCHEMA GAP (SG-3): without that reduction the rectangle height b/2 changes SIGN with b
      // and the traversal flips from ccw to cw, but `contour.orientation` is a fixed string.
    { "name": "R", "domain": "real", "constraints": ["R > 0"] }
  ],

  "hypotheses": [
    { "id": "entire-integrand",
      "statement": "f(z) = e^{−z²+ibz} is entire: the singular set is EMPTY and S = 2πi·Σ(∅) = 0",
      "check": "structural:isEntire(exp(-z^2 + i*b*z))", "onFail": "refuse" },
    { "id": "shift-is-the-saddle",
      "statement": "h = b/2 is the unique height at which the top side becomes a KNOWN integral: d/dz(−z²+ibz) = 0 at z = ib/2, and there e^{−z²+ibz} = e^{−x²−b²/4}",
      "check": "symbolic:eq(solve(diff(-z^2 + i*b*z, z) == 0, z), i*b/2)", "onFail": "refuse" },
    { "id": "target-is-real",
      "statement": "the bottom side gives ∫ℝ e^{−x²}e^{ibx}dx, whose imaginary part ∫ℝ e^{−x²}sin(bx)dx = 0 because the integrand is odd; so the bottom side IS the target, with no real part to take",
      "check": "parity:isOdd(exp(-x^2)*sin(b*x))", "onFail": "warn" },
    { "id": "gaussian-value-is-imported",
      "statement": "∫ℝ e^{−x²}dx = √π is Γ(1/2), established by polar coordinates — NOT by this contour. This argument consumes it; it does not prove it.",
      "check": "provenance:external('Gamma(1/2) = sqrt(pi)', method='polar coordinates')",
      "onFail": "warn" }
  ],

  "contour": {
    "template": "rectangle",
    "limitParams": [ { "name": "R", "to": "inf" } ],
    "pieces": [
      { "id": "bottom", "name": "the real axis", "kind": "segment",
        "from": "-R", "to": "R", "role": "target", "colour": 0 },
      { "id": "right", "name": "right vertical x = R", "kind": "segment",
        "from": "R", "to": "R + i*b/2", "role": "vanish", "lemma": "L1", "colour": 1 },
      { "id": "top", "name": "the saddle line Im z = b/2", "kind": "segment",
        "from": "R + i*b/2", "to": "-R + i*b/2", "role": "free", "colour": 2,
        "knownValue": {                                  // ⚠ PROPOSED FIELD — see SG-2
          "expr": "-sqrt(pi)*exp(-b^2/4)",
          "method": "on Im z = b/2 the integrand collapses to e^{−x²−b²/4}; the remaining ∫ℝe^{−x²}dx = Γ(1/2) = √π is IMPORTED, not derived here",
          "rigor": "=" } },
      { "id": "left", "name": "left vertical x = −R", "kind": "segment",
        "from": "-R + i*b/2", "to": "-R", "role": "vanish", "lemma": "L1", "colour": 3 }
    ],
    "orientation": "ccw",
    "encloses": "NOTHING. The enclosed singular set is empty; this is Cauchy's theorem, i.e. the residue theorem with an empty sum."
  },

  "vanishingLemmas": [
    { "lemma": "L1", "piece": "right",
      "sideCondition": "on z = R+iy, y ∈ [0,b/2]: |f| = e^{−R²+y²−by} ≤ e^{−R²}, because y² − by ≤ 0 on [0,b]; hence |∫| ≤ (b/2)·e^{−R²}",
      "discharge": "symbolic:mlBound(piece=right, M=exp(-R^2), L=b/2, limit=R->inf, requires=[])",
      "rigorIfDischarged": "=", "rigorIfNumericOnly": "≈" },
    { "lemma": "L1", "piece": "left",
      "sideCondition": "identical bound: at z = ±R+iy, Re(−z²+ibz) = −R² + y² − by in BOTH cases (the ∓2iRy and ±ibR terms are purely imaginary), so |f(−R+iy)| ≤ e^{−R²} on [0,b/2] too; |∫| ≤ (b/2)·e^{−R²}",
      "discharge": "symbolic:mlBound(piece=left, M=exp(-R^2), L=b/2, limit=R->inf, requires=[])",
      "rigorIfDischarged": "=", "rigorIfNumericOnly": "≈" }
  ],

  "residueSelection": { "rule": "inside", "set": "the rectangle −R < Re z < R, 0 < Im z < b/2" },
  // the rule is the ordinary one; it correctly returns the EMPTY set. No special case is needed
  // or wanted: Pass 2 emits zero pole rows, S = 0 with certificate level "=", and Pass 6 still closes.

  "closedForm": {
    "expr": "-knownValue(top)",           // T·1 + (V_right + V_left = 0) + F_top = S = 0
    "simplified": "sqrt(pi)*exp(-b^2/4)"
  },

  "rigor": { "policy": "min",
             "inputs": ["hypotheses.*", "vanishingLemmas.*.rigor",
                        "freePieces.*.knownValue.rigor", "residues.*.rigor"] },
  // residues.* is an EMPTY list here, and an empty meet is the lattice top "=" — not "?".
  // meet over ∅ = "=" is the rule that lets a zero-residue family close. Getting this wrong
  // (treating "no evidence" as "?") is the single most likely way to break E3.

  "traps": [
    { "id": "contour-method-implies-residues",
      "detect": "engine:requiresNonEmpty(residues)",
      "message": "The residue theorem asserts ∮f = 2πi Σ n(γ,aₖ)Res(f,aₖ) — over WHATEVER singularities are enclosed, including none. An empty sum is 0, and 0 is the number that closes this argument. Reporting 'no poles found, cannot evaluate' is a bug; so is silently hunting for a pole to make the machinery fire." },
    { "id": "shift-height-must-be-the-saddle",
      "detect": "!algebraic:eq(contour.height, b/2)",
      "message": "At height h the integrand on the top line is e^{h²−bh}·e^{−x²}·e^{i(b−2h)x}, so the top side is e^{h²−bh} times the SAME unknown at parameter b−2h. The closed-contour identity stays true and says nothing. Verified at b = 1.7, h = −b/2, R = 8: the rectangle still closes (|∮| = 3.8e-15) and the top side −0.860591739572559 equals −e^{3b²/4}·T(2b) = −8.73641567748283 × 0.0985062720619669 = −0.860591739572556 — a true statement expressing T(b) in terms of T(2b). Only h = b/2, the saddle of −z²+ibz, kills the oscillation and makes the top side a known real Gaussian." },
    { "id": "gaussian-value-claimed-as-contour-output",
      "detect": "!provenance:declaresExternal(closedForm, 'Gamma(1/2)')",
      "message": "This contour does not prove ∫ℝe^{−x²}dx = √π; it CONSUMES it. Presenting √π as an output of the residue machinery is the same category error as claiming ∫₀^∞e^{−xⁿ}dx = Γ(1+1/n) is a contour result (research/03 §7's honesty note). Label the import." },
    { "id": "quasi-period-assumed",
      "detect": "symbolic:isQuasiPeriod(f, contour.height)",
      "message": "f(z+ih)/f(z) = e^{h²−bh}e^{−2ihz}·… is NOT constant in z, so E3 is not an L7 family at all and has no `reproduces` piece. Do not reach for λ here — verified: f(z+ib/2)/f(z) takes the values 0.595−0.333i and −0.245+0.022i at two different points." },
    { "id": "cos-not-complexified",
      "detect": "structural:contains(problem.contourIntegrand, 'cos(b*z)')",
      "message": "cos(bz) grows like e^{|b||y|} in BOTH half-planes, so the vertical sides would not vanish. Use e^{ibz} on the contour and rely on the oddness of e^{−x²}sin(bx) to recover the cosine target exactly — no real part needs to be taken." }
  ],

  "golden": [
    { "params": { "b": 0 }, "value": "sqrt(pi)", "numeric": 1.7724538509055159, "verifiedTo": 0.0,
      "verifiedBy": "1200-panel × 32-pt Gauss–Legendre on [−12,12]; e^{−144} tail" },
    { "params": { "b": 1 }, "value": "sqrt(pi)*exp(-1/4)", "numeric": 1.3803884470431429, "verifiedTo": 6.4e-16, "verifiedBy": "same" },
    { "params": { "b": 1.7 }, "value": "sqrt(pi)*exp(-b^2/4)", "numeric": 0.86059173957255597, "verifiedTo": 5.2e-16, "verifiedBy": "same" },
    { "params": { "b": 3 }, "value": "sqrt(pi)*exp(-b^2/4)", "numeric": 0.18681526145713168, "verifiedTo": 5.9e-16, "verifiedBy": "same" },
    { "params": { "b": 6.5 }, "value": "sqrt(pi)*exp(-b^2/4)", "numeric": 4.5850013855253130e-5, "verifiedTo": 2.0e-12,
      "verifiedBy": "same — worst case in this file; the target is 4e-5 against an integrand of order 1, so cancellation costs ~4 digits. Worth keeping as the entry that shows the quadrature label honestly degrading while the exact label does not." },

    { "params": { "b": 1.7, "R": 8, "probe": "closedContour" }, "value": "0",
      "numeric": [4.2e-15, -1.7e-16], "verifiedTo": "absolute 4.2e-15 against side magnitudes ~0.86",
      "verifiedBy": "four sides at R = 8 — Cauchy with an EMPTY singular set" },
    { "params": { "b": 1.7, "R": 8, "probe": "topSide" }, "value": "-sqrt(pi)*exp(-b^2/4)",
      "numeric": [-0.860591739572556, 0.0], "verifiedTo": 5.2e-16, "verifiedBy": "top side at R = 8" },
    { "params": { "b": 1.7, "probe": "oddPartVanishes" }, "value": "0", "numeric": -1.4e-16,
      "verifiedTo": "absolute 1.4e-16", "verifiedBy": "∫ℝ e^{−x²}sin(1.7x)dx — the COVER obligation" },
    { "params": { "b": 1.7, "R": 8, "h": -0.85, "probe": "wrongShiftHeight" },
      "value": "top == -exp(3*b^2/4)*T(2*b)  — an INFORMATION-FREE identity",
      "numeric": [-0.860591739572559, -0.860591739572556], "verifiedTo": 3.5e-15,
      "verifiedBy": "measured top side vs −e^{3b²/4}·∫ℝe^{−x²}cos(2bx)dx; the rectangle still closes (|∮| = 3.8e-15). This is a REFUSAL fixture: the ledger must report the top piece as `free` with NO known value, and the argument as not closing." }
  ],

  "invariants": [
    { "id": "b-zero-is-the-gaussian-itself",
      "statement": "At b = 0 the rectangle degenerates to the real axis and the identity reads √π = √π. The family is consistent but carries no content at b = 0 — a useful boundary to display rather than hide.",
      "check": "numeric:agree(E3(0), sqrt(pi), tol=1e-14)" },
    { "id": "even-in-b",
      "statement": "E3(b) = E3(−b); the rectangle for b < 0 is the mirror image below the axis and is traversed clockwise. The load-time reduction to b ≥ 0 is what keeps `orientation` a constant.",
      "check": "numeric:agree(E3(b), E3(-b), tol=1e-14)", "verifiedBy": "b = ±1.7, both 0.86059173957255597" }
  ]
}
```

---

## 4. F1 — `∫₀^∞ dx/(1+x³) = 2π/(3√3)`

F1 replaces translation symmetry by rotation and is the tier's cheapest lesson: **`f(ωz) = μ f(z)`
makes the return ray reproduce the outgoing ray with factor `−ω·μ`, and the wedge angle must be
`2π/n` exactly** or the two rays are not related at all. With `f = 1/(1+z³)` and `ω = e^{2πi/3}` we
have `ω³ = 1` so `μ = 1` and `c = −ω`; the wedge catches the single pole `z₀ = e^{iπ/3}`, whose
residue is `1/(3z₀²) = −z₀/3` by `P/Q'`; and `1 − ω = √3 e^{−iπ/6}` conspires with `e^{iπ/3}` to
produce `2π/(3√3)` through `e^{iπ/3+iπ/6} = i`. The entry's real job in the corpus, though, is as a
**cross-provenance check**: the very same number is D3 at `a = 1, n = 3`, computed by a *keyhole with
a branch cut* and a `−e^{2πia/n}` phase. F1's wedge needs **no branch cut at all** — `1/(1+z³)` is
single-valued — so two structurally different arguments, one with monodromy and one without, must
produce the same `2π/(3√3)`. Research/03 §13 lists `§5.1 ≡ §7 under u = xⁿ`; stated precisely enough
to become a test, the substitution is: **`u = xⁿ` carries `∫₀^∞ x^{a−1}/(1+xⁿ)dx` to
`(1/n)∫₀^∞ u^{s−1}/(1+u)du` with `s = a/n`**, since `x = u^{1/n}`, `dx = (1/n)u^{1/n−1}du` and
`x^{a−1} = u^{(a−1)/n}` combine to `u^{a/n−1}`. The fundamental-strip condition `0 < s < 1` is
*exactly* the wedge condition `0 < a < n`, which is itself worth surfacing: one method's convergence
window maps onto the other's.

```jsonc
{
  "id": "wedge-rational-power",
  "title": "Sector contour for ∫₀^∞ dx/(1+x³) (rotational factor −ω·μ)",
  "taxonomySection": "7",
  "tier": "F",

  "target": {
    "variable": "x", "lower": "0", "upper": "inf",
    "integrand": "1/(1 + x^n)",
    "symbols": {}
  },

  "parameters": [
    { "name": "n", "domain": "integer", "constraints": ["n >= 2"] },   // n = 3 for the headline entry
    { "name": "R", "domain": "real", "constraints": ["R > 1"] }
  ],

  "hypotheses": [
    { "id": "rotational-quasi-symmetry",
      "statement": "f(ωz) = μ f(z) with ω = e^{2πi/n} and μ = 1, because ωⁿ = 1",
      "check": "symbolic:rotationalFactor(f, omega=exp(2*pi*i/n)) == 1", "onFail": "refuse" },
    { "id": "wedge-angle-exact",
      "statement": "the wedge angle is exactly 2π/n — the rays must be related by the symmetry, and an approximate angle relates nothing",
      "check": "algebraic:eq(contour.wedgeAngle, 2*pi/n)", "onFail": "refuse" },
    { "id": "no-pole-on-either-ray",
      "statement": "1 + zⁿ = 0 has no root on arg z ∈ {0, 2π/n}: the roots are e^{iπ(2k+1)/n} and none has argument 0 or 2π/n for n ≥ 2",
      "check": "algebraic:noRootOnRays(1 + z^n, [0, 2*pi/n])", "onFail": "refuse" },
    { "id": "convergence-at-infinity",
      "statement": "deg(denominator) − deg(numerator) = n ≥ 2, so ∫₀^∞ converges and L2 applies on the arc",
      "check": "algebraic:ge(n, 2)", "onFail": "refuse" },
    { "id": "nondegenerate-solve",
      "statement": "1 + c = 1 − ω ≠ 0, i.e. n ≥ 2 (n = 1 makes ω = 1, and ∫dx/(1+x) genuinely diverges)",
      "check": "algebraic:ne(1 - exp(2*pi*i/n), 0)", "onFail": "refuse" }
  ],

  // no branch: 1/(1+z^n) is single-valued rational. THIS IS THE POINT of the D3 cross-check below.

  "contour": {
    "template": "wedge",
    "limitParams": [ { "name": "R", "to": "inf" } ],
    "pieces": [
      { "id": "ray0", "name": "the positive real axis", "kind": "segment",
        "from": "0", "to": "R", "role": "target", "colour": 0 },
      { "id": "arc", "name": "the R→∞ sector arc", "kind": "arc",
        "radius": "R", "from": "0", "to": "2*pi/n", "role": "vanish", "lemma": "L2", "colour": 1 },
      { "id": "ray1", "name": "the return ray arg z = 2π/n", "kind": "segment",
        "from": "exp(2*pi*i/n)*R", "to": "0",
        "role": "reproduces", "factor": "-exp(2*pi*i/n)", "colour": 2 }
        // general member: factor = −ω·μ = −ω^a = −exp(2πi a/n) for f = z^{a−1}/(1+z^n)
    ],
    "orientation": "ccw",
    "encloses": "exactly one pole, z₀ = e^{iπ/n} (simple), inside the sector 0 < arg z < 2π/n"
  },

  "vanishingLemmas": [
    { "lemma": "L2", "piece": "arc",
      "sideCondition": "|1 + zⁿ| ≥ Rⁿ − 1 > 0 for R > 1, so |f| ≤ 1/(Rⁿ − 1) on |z| = R; with arc length (2π/n)R this gives |∫| ≤ (2π/n)·R/(Rⁿ − 1) = O(R^{1−n}) → 0 for n ≥ 2",
      "discharge": "symbolic:degreeBound(numerator=1, denominator=1+z^n)  // exact-ℚ ML bound of DESIGN §6.2; den(R) > 0 certifies both the bound and 'all poles strictly inside |z| = R'",
      "rigorIfDischarged": "≤", "rigorIfNumericOnly": "≈" }
      // ≤ not = : the piece's certificate is a one-sided bound plus the asymptotic verdict B(R) → 0.
      // The VALUE it contributes is 0 exactly; the EVIDENCE is a bound. DESIGN §4 Pass 3's table.
  ],

  "residueSelection": { "rule": "inside", "set": "0 < arg z < 2*pi/n" },

  "closedForm": {
    "expr": "(2*pi*i/(1 - exp(2*pi*i/n))) * Res(1/(1+z^n), exp(i*pi/n))",
    "simplified": "(pi/n)/sin(pi/n)"
    // Res(1/(1+zⁿ), z₀) = 1/(n z₀^{n−1}) = z₀/(n z₀ⁿ) = −z₀/n   (P/Q′, and z₀ⁿ = −1)
    // 1 − ω = √3 e^{−iπ/6} at n = 3;  e^{iπ/3}·e^{iπ/6} = i  ⇒  T = −2πi(−e^{iπ/3}/3)/(√3e^{−iπ/6}) = 2π/(3√3)
  },

  "rigor": { "policy": "min",
             "inputs": ["hypotheses.*", "vanishingLemmas.*.rigor",
                        "residues.*.rigor", "reproduces.*.rigor", "solve.conditioning"] },

  "traps": [
    { "id": "wedge-angle-not-2pi-over-n",
      "detect": "!algebraic:eq(contour.wedgeAngle, 2*pi/n)",
      "message": "At any other angle the return ray is not e^{2πi/n}·(the outgoing ray) and f(ωz) = f(z) is false, so the `reproduces` factor does not exist. There is nothing to solve for: the closed-contour identity relates the target to a DIFFERENT, unknown integral along an unrelated ray." },
    { "id": "n-equals-one",
      "detect": "algebraic:eq(n, 1)",
      "message": "n = 1 gives ω = 1 and 1 + c = 0: the two rays coincide and cancel. The structural division by zero is correct — ∫₀^∞dx/(1+x) diverges logarithmically. Do not report a finite limit." },
    { "id": "factor-omega-not-omega-mu",
      "detect": "contour.pieces.filter(role=='reproduces').some(p => !expr:equals(p.factor, '-omega*mu'))",
      "message": "The factor is −ω·μ, not −ω. For the plain 1/(1+zⁿ) member μ = 1 and the two coincide, which is exactly why this entry hides the bug; the general member z^{a−1}/(1+zⁿ) has μ = ω^{a−1} and factor −ω^a. Write −ω·μ so the D3 generalisation is correct by construction." },
    { "id": "l2-used-where-degree-fails",
      "detect": "algebraic:lt(degree(denom) - degree(num), 2)",
      "message": "L2 needs |f| ≤ M/|z|^p with p > 1. At n = 1 the arc bound is O(1) and does not vanish; the arc is then an L5 case (zf(z) → L gives iα L), not an L2 case." },
    { "id": "wrong-pole-counted",
      "detect": "residues.some(r => !geom:inSector(r.at, 0, 2*pi/n))",
      "message": "1 + zⁿ has n roots on the unit circle; exactly ONE of them, e^{iπ/n}, lies in the open sector. Counting the roots by |z| < R rather than by argument catches all n and multiplies the answer by n." }
  ],

  "golden": [
    { "params": { "n": 3 }, "value": "2*pi/(3*sqrt(3))", "numeric": 1.2091995761561452, "verifiedTo": 1.8e-16,
      "verifiedBy": "x = 1/t folds [1,∞) onto [0,1], giving ∫₀¹(1+t)/(1+t³)dt — smooth, 64×48 composite Gauss–Legendre; cross-checked by truncation at X = 30 plus the exact tail series Σ(−1)^k X^{−2−3k}/(2+3k) (rel 5.1e-15)" },
    { "params": { "n": 2 }, "value": "pi/2", "numeric": 1.5707963267948966, "verifiedTo": 5.7e-16,
      "verifiedBy": "same folding: ∫₀¹dx/(1+xⁿ) + ∫₀¹ t^{n−2}/(1+tⁿ)dt" },
    { "params": { "n": 5 }, "value": "(pi/5)/sin(pi/5)", "numeric": 1.0689593321155950, "verifiedTo": 4.2e-16, "verifiedBy": "same folding" },
    { "params": { "n": 7 }, "value": "(pi/7)/sin(pi/7)", "numeric": 1.0343760552667964, "verifiedTo": 6.4e-16, "verifiedBy": "same folding" },

    { "params": { "n": 3, "probe": "mu" }, "value": "1", "numeric": [1.0, 0.0], "verifiedTo": 2.5e-16,
      "verifiedBy": "f(ωz)/f(z) at z = 0.7+0.31i" },
    { "params": { "n": 3, "probe": "residue" }, "value": "-exp(i*pi/3)/3",
      "numeric": [-0.166666666666667, -0.288675134594813], "verifiedTo": 7.1e-16,
      "verifiedBy": "trapezoid on |z − e^{iπ/3}| = 0.05" },
    { "params": { "n": 3, "R": 25, "probe": "closedContour" }, "value": "2*pi*i*Res(f, exp(i*pi/3))",
      "numeric": [1.81379936423422, -1.04719755119660], "verifiedTo": 2.0e-15,
      "verifiedBy": "ray0 + arc + ray1 at R = 25 (Cauchy: exact at every R > 1)" },
    { "params": { "n": 3, "R": 25, "probe": "reproducesFactor" }, "value": "ray1 == -omega*ray0",
      "numeric": [0.604199798317664, -1.04650474860906], "verifiedTo": 1.7e-15, "verifiedBy": "return ray vs −e^{2πi/3}·ray0 at R = 25" },
    { "params": { "n": 3, "R": 25, "probe": "arcBound" }, "value": "|arc| <= (2*pi/3)*R/(R^3-1)",
      "numeric": [1.386e-3, 3.351e-3], "verifiedTo": "bound holds at R = 5, 10, 25, 50 (ratio ~0.41 throughout)",
      "verifiedBy": "direct arc quadrature vs the ML bound" }
  ],

  "invariants": [
    { "id": "F1-equals-D3-at-a1-n3",
      "statement": "F1 is D3 at (a, n) = (1, 3). Two structurally different arguments: D3 is a KEYHOLE with a branch cut along [0,∞), a z^{a−1} monodromy and a −e^{2πia/n} phase; F1 is a WEDGE with no branch cut at all. They must agree at 2π/(3√3).",
      "check": "numeric:agree(F1(n=3), D3(a=1, n=3), tol=1e-12)",
      "verifiedTo": 1.8e-16, "verifiedBy": "1.2091995761561452 vs (π/3)/sin(π/3) = 1.2091995761561452" },
    { "id": "wedge-equals-keyhole-under-u-equals-x-to-the-n",
      "statement": "u = xⁿ, x = u^{1/n}, dx = (1/n)u^{1/n−1}du, x^{a−1} = u^{(a−1)/n} ⇒ ∫₀^∞ x^{a−1}/(1+xⁿ)dx = (1/n)∫₀^∞ u^{s−1}/(1+u)du with s = a/n. The wedge condition 0 < a < n IS the Mellin fundamental strip 0 < s < 1.",
      "check": "numeric:agree(wedge(a,n), mellin(s=a/n)/n, tol=1e-12)",
      "verifiedTo": 6.8e-15,
      "verifiedBy": "(a,n) = (1,3): (1/3)·3.6275987284684104 = 1.2091995761561367 vs 1.2091995761561449; also (1.5,4), (2.3,5), (0.4,2) all ≤ 8.4e-15" },
    { "id": "closing-the-other-way",
      "statement": "The wedge may equally be taken as the sector from arg z = −2π/n to 0; the enclosed pole is then e^{−iπ/n} and the factor is −ω̄. The two routes must agree — DESIGN §9's 'closing up vs closing down' invariant, in its rotational form.",
      "check": "numeric:agree(wedgeUp(n), wedgeDown(n), tol=1e-12)" }
  ]
}
```

---

## 5. F2 — `∫₀^∞ cos(x²)dx = ∫₀^∞ sin(x²)dx = √(π/8)` — **the bound everyone hand-waves**

F2 is in the gallery for one reason: **the arc bound is the one place in the whole taxonomy where
textbook treatments cheat, and it is completely dischargeable.** `|e^{−z²}| = e^{−R²cos 2θ}` tends to
`1`, not to `0`, as `θ → π/4`, so plain ML gives `πR/4 · 1 → ∞` and proves nothing. The fix is the
linear minorant, and the record writes it out so a machine can check it. Along the way two things
must be stated correctly and research/03 states them inconsistently (finding **D-1**). With
`f(z) = e^{−zⁿ}` on the arc `θ ∈ [0, α]` we have `|f| = e^{−Rⁿcos nθ}`, and `cos nθ` is **negative**
once `nθ > π/2`; the majorant `R∫₀^α e^{−Rⁿcos nθ}dθ` then *diverges* — numerically `2.7×10¹⁵` at
`n = 2, α = π/2, R = 6`. So the admissible range is `α ≤ π/(2n)`, not `π/n`. On `[0, π/(2n)]`:

```
|∫_arc e^{−zⁿ}dz| ≤ R ∫₀^{π/(2n)} e^{−Rⁿ cos nθ} dθ            (ML, pointwise)
                  ≤ R ∫₀^{π/(2n)} e^{−Rⁿ(1 − 2nθ/π)} dθ         (cos φ ≥ 1 − 2φ/π on [0, π/2])
                  = (π/(2n)) · (1 − e^{−Rⁿ}) / R^{n−1}
                  ≤ π / (2 n R^{n−1})  →  0   for n > 1.
```

For `n = 2` that is `π/(4R)`; verified against direct arc quadrature at `R = 2, 4, 8, 16` for
`n = 2, 3, 4`, tight to within a factor `1.6`. And there is a small discovery in it: **`cos φ ≥
1 − 2φ/π` on `[0, π/2]` and Jordan's `sin ψ ≥ 2ψ/π` on `[0, π/2]` are the same inequality**, related
by `φ = π/2 − ψ` (`cos(π/2−ψ) = sin ψ` and `1 − 2(π/2−ψ)/π = 2ψ/π`, both identically). L3 and L6
should therefore share one dischargeable side condition in the engine, not two. The record below
uses the `e^{iz²}` orientation (ccw wedge `[0, π/4]`, Jordan form), which has the further merit that
the outgoing ray is `∫₀^R e^{ix²}dx` — **one complex target carrying both real integrals at once**,
`C` as its real part and `S` as its imaginary part. Two more things the record must be honest about:
the target converges only **conditionally** (`∫₀^∞|cos(x²)|dx = ∞`), which is a label, not a
footnote; and the return ray's value `e^{iπ/4}·√π/2` again imports `Γ(1/2)` from outside the contour
argument (**SG-2** again).

```jsonc
{
  "id": "wedge-fresnel",
  "title": "Fresnel integrals by the π/4 wedge (the L6 arc bound, fully discharged)",
  "taxonomySection": "7",
  "tier": "F",

  "target": {
    "variable": "x", "lower": "0", "upper": "inf",
    "integrand": "exp(i*x^2)",
    "symbols": {},
    "conditionallyConvergent": true,      // ⚠ PROPOSED FIELD — see SG-4
    "components": {                       // the one complex target carries BOTH real ones
      "cos": "Re(T) = int_0^inf cos(x^2) dx",
      "sin": "Im(T) = int_0^inf sin(x^2) dx"
    }
  },

  "parameters": [
    { "name": "n", "domain": "integer", "constraints": ["n >= 2"] },   // n = 2 for Fresnel
    { "name": "R", "domain": "real", "constraints": ["R > 0"] }
  ],

  "hypotheses": [
    { "id": "entire-integrand",
      "statement": "f(z) = e^{izⁿ} is entire: the singular set is EMPTY, S = 0, and the argument is Cauchy's theorem — as in E3",
      "check": "structural:isEntire(exp(i*z^n))", "onFail": "refuse" },
    { "id": "wedge-angle-at-most-pi-over-2n",
      "statement": "α = π/(2n): on the arc |e^{izⁿ}| = e^{−Rⁿ sin nθ} and sin nθ ≥ 0 needs nθ ≤ π; α = π/(2n) is the angle at which the return ray becomes e^{−tⁿ}, which is what makes it a KNOWN integral",
      "check": "algebraic:le(n*contour.wedgeAngle, pi)", "onFail": "refuse" },
    { "id": "return-ray-is-real-gaussian",
      "statement": "on arg z = π/(2n), zⁿ = Rⁿ e^{iπ/2} = iRⁿ so e^{izⁿ} = e^{−tⁿ}; the return ray is −e^{iπ/(2n)}∫₀^R e^{−tⁿ}dt",
      "check": "symbolic:eq(subs(exp(i*z^n), z, t*exp(i*pi/(2*n))), exp(-t^n))", "onFail": "refuse" },
    { "id": "gamma-value-is-imported",
      "statement": "∫₀^∞ e^{−tⁿ}dt = Γ(1+1/n) is a REAL substitution (u = tⁿ), not a contour result — research/03 §7's honesty note. At n = 2 it is √π/2 = Γ(3/2).",
      "check": "provenance:external('Gamma(1+1/n)', method='real substitution u = t^n')",
      "onFail": "warn" },
    { "id": "target-convergence-is-conditional",
      "statement": "∫₀^∞ cos(x²)dx converges as an improper Riemann integral but NOT absolutely: ∫₀^∞|cos(x²)|dx = ∞. Every downstream claim must carry that.",
      "check": "analytic:absolutelyConvergent(target) == false", "onFail": "warn" }
  ],

  "contour": {
    "template": "wedge",
    "limitParams": [ { "name": "R", "to": "inf" } ],
    "pieces": [
      { "id": "ray0", "name": "the positive real axis", "kind": "segment",
        "from": "0", "to": "R", "role": "target", "colour": 0 },
      { "id": "arc", "name": "the R→∞ sector arc, angle π/(2n)", "kind": "arc",
        "radius": "R", "from": "0", "to": "pi/(2*n)", "role": "vanish", "lemma": "L6", "colour": 1 },
      { "id": "ray1", "name": "the return ray arg z = π/(2n)", "kind": "segment",
        "from": "exp(i*pi/(2*n))*R", "to": "0", "role": "free", "colour": 2,
        "knownValue": {                                   // ⚠ PROPOSED FIELD — see SG-2
          "expr": "-exp(i*pi/(2*n))*Gamma(1 + 1/n)",
          "method": "on this ray e^{izⁿ} = e^{−tⁿ}; ∫₀^∞e^{−tⁿ}dt = Γ(1+1/n) is IMPORTED (real substitution u = tⁿ)",
          "rigor": "=" } }
    ],
    "orientation": "ccw",
    "encloses": "NOTHING — e^{izⁿ} is entire. Like E3, this argument is Cauchy's theorem plus one bound."
  },

  "vanishingLemmas": [
    { "lemma": "L6", "piece": "arc",
      "sideCondition": "on |z| = R, arg z = θ ∈ [0, π/(2n)]:  |e^{izⁿ}| = e^{−Rⁿ sin(nθ)}, and sin φ ≥ 2φ/π for φ = nθ ∈ [0, π/2] (Jordan's inequality; IDENTICAL to cos ψ ≥ 1 − 2ψ/π under φ = π/2 − ψ). Hence |∫_arc| ≤ R∫₀^{π/(2n)} e^{−Rⁿ·2nθ/π} dθ = (π/(2n))(1 − e^{−Rⁿ})/R^{n−1} ≤ π/(2 n R^{n−1}) → 0 for n > 1.",
      "discharge": "symbolic:wedgeArcBound(f=exp(i*z^n), alpha=pi/(2*n), minorant='sin(phi) >= 2*phi/pi on [0,pi/2]', bound='pi/(2*n*R^(n-1))', requires=[n > 1])",
      "rigorIfDischarged": "≤", "rigorIfNumericOnly": "≈",
      "equivalentForm": "for f = e^{−zⁿ} on θ ∈ [0, π/(2n)]: |f| = e^{−Rⁿ cos nθ} and cos φ ≥ 1 − 2φ/π on [0,π/2] gives the SAME bound π/(2nR^{n−1}). The two forms are one lemma reflected; the engine should discharge them through one predicate.",
      "counterexample": "the range θ ∈ [0, π/n] quoted in research/03 §0.3 for f = e^{−zⁿ} makes cos nθ < 0 on the second half and the majorant R∫₀^{π/n}e^{−Rⁿcos nθ}dθ DIVERGES — measured 2.7e15 at n = 2, R = 6; 1.1e93 at n = 3, R = 6; overflow at n = 4. See finding D-1." }
  ],

  "residueSelection": { "rule": "inside", "set": "0 < arg z < pi/(2*n)" },
  // correctly returns the empty set; S = 0.

  "closedForm": {
    "expr": "-knownValue(ray1)",          // T·1 + (V_arc = 0) + F_ray1 = S = 0
    "simplified": "exp(i*pi/(2*n))*Gamma(1 + 1/n)",
    "components": {
      "cos": "Gamma(1 + 1/n)*cos(pi/(2*n))",
      "sin": "Gamma(1 + 1/n)*sin(pi/(2*n))",
      "atN2": "sqrt(pi/8) for both, since Gamma(3/2) = sqrt(pi)/2 and cos(pi/4) = sin(pi/4) = sqrt(2)/2"
    }
  },

  "rigor": { "policy": "min",
             "inputs": ["hypotheses.*", "vanishingLemmas.*.rigor",
                        "freePieces.*.knownValue.rigor", "residues.*.rigor",
                        "target.convergenceClass"] },

  "traps": [
    { "id": "arc-bound-hand-waved",
      "detect": "vanishingLemmas.find(l => l.piece == 'arc').discharge startsWith 'numeric:'",
      "message": "This is THE hand-waved step of the classical Fresnel derivation. |e^{−z²}| = e^{−R²cos 2θ} → 1 as θ → π/4, so plain ML gives (πR/4)·1 → ∞ and establishes nothing. Only the linear minorant sin φ ≥ 2φ/π (equivalently cos ψ ≥ 1 − 2ψ/π) turns the R out front into a 1/R. A numeric-only discharge caps the whole result at ≈." },
    { "id": "arc-range-too-large",
      "detect": "algebraic:gt(n*contour.wedgeAngle, pi/2) && lemma == 'L6' && integrandForm == 'exp(-z^n)'",
      "message": "For f = e^{−zⁿ} the majorant R∫₀^α e^{−Rⁿcos nθ}dθ diverges as soon as nα > π/2, because cos nθ goes negative and e^{−Rⁿcos nθ} blows up. The admissible range is α ≤ π/(2n). (For f = e^{izⁿ} the modulus is e^{−Rⁿ sin nθ} and the range extends to α ≤ π/n — a different lemma instance, not the same one.)" },
    { "id": "absolute-convergence-assumed",
      "detect": "verdict.level == '=' && !verdict.restrictions.includes('improper Riemann integral, not absolutely convergent')",
      "message": "∫₀^∞|cos(x²)|dx diverges. The value √(π/8) is the limit of ∫₀^X as X → ∞, which exists; any rearrangement, any interchange with another limit, and any quadrature error estimate that assumes absolute convergence is invalid. The restriction must travel with the verdict (DESIGN §3's restriction rule)." },
    { "id": "gamma-claimed-as-contour-output",
      "detect": "!provenance:declaresExternal(closedForm, 'Gamma(1+1/n)')",
      "message": "∫₀^∞e^{−xⁿ}dx = Γ(1+1/n) follows from the real substitution u = xⁿ, not from this contour. Its genuine contour sibling is ∫₀^∞e^{−e^{iφ}xⁿ}dx, which needs the wedge and |φ| < π/(2n). Claiming contour provenance for a calculus fact is the honesty failure research/03 §7 names." },
    { "id": "residues-expected",
      "detect": "engine:requiresNonEmpty(residues)",
      "message": "Same as E3: e^{izⁿ} is entire, S = 2πi·Σ(∅) = 0, and the empty residue sum is what the argument runs on." }
  ],

  "golden": [
    { "params": { "n": 2, "component": "cos" }, "value": "sqrt(pi/8)", "numeric": 0.62665706865775006,
      "verifiedTo": 8.9e-16,
      "verifiedBy": "PRIMARY, handles the conditional convergence honestly: split at the sign changes x_k = √((k+½)π) into a strictly alternating series of smooth 80-pt Gauss–Legendre panels, then Cohen–Rodriguez Villegas–Zagier acceleration over 140 terms. INDEPENDENT CROSS-CHECK: 80-panel-per-oscillation quadrature to X = 40 plus the 5-term asymptotic tail from repeated integration by parts of ∫_{X²}^∞ cos u · u^{−1/2}/2 du (rel 2.4e-13); and at X = 60 (rel 5.0e-13)." },
    { "params": { "n": 2, "component": "sin" }, "value": "sqrt(pi/8)", "numeric": 0.62665706865775006,
      "verifiedTo": 1.8e-15, "verifiedBy": "same two methods (sin panels split at x_k = √(kπ))" },
    { "params": { "n": 3, "component": "cos" }, "value": "Gamma(4/3)*cos(pi/6)", "numeric": 0.77334294207799015,
      "verifiedTo": 7.2e-16, "verifiedBy": "alternating + CVZ, exercising the general n form" },

    { "params": { "n": 2, "R": 6, "probe": "closedContour" }, "value": "0", "numeric": 4.07e-15,
      "verifiedTo": "absolute 4.1e-15 against piece magnitudes 0.8389 (ray0) and 0.8862 (ray1)",
      "verifiedBy": "ray0 + arc + ray1 at R = 6" },
    { "params": { "n": 2, "R": 6, "probe": "returnRay" }, "value": "-exp(i*pi/4)*int_0^R exp(-t^2) dt",
      "numeric": [-0.626657068657750, -0.626657068657750], "verifiedTo": 4.5e-16, "verifiedBy": "return ray at R = 6" },
    { "params": { "n": 2, "probe": "arcBound" }, "value": "|arc| <= pi/(4*R)",
      "numeric": [0.2431, 0.1247, 0.06249, 0.03125], "verifiedTo": "holds at R = 2,4,8,16; ratio to the bound ~0.62-0.64 throughout — the bound is TIGHT, not slack",
      "verifiedBy": "direct arc quadrature vs π/(2nR^{n−1}); also checked at n = 3, 4" }
  ],

  "invariants": [
    { "id": "cos-equals-sin-only-at-n-2",
      "statement": "∫₀^∞cos(xⁿ)dx = Γ(1+1/n)cos(π/(2n)) and ∫₀^∞sin(xⁿ)dx = Γ(1+1/n)sin(π/(2n)) are equal iff cos(π/(2n)) = sin(π/(2n)) iff n = 2. The famous equality is a coincidence of the wedge angle being π/4, not a general fact.",
      "check": "numeric:agree(fresnelCos(2), fresnelSin(2), tol=1e-12) && numeric:differ(fresnelCos(3), fresnelSin(3))" },
    { "id": "modulus-is-the-gamma-value",
      "statement": "|T| = Γ(1+1/n): the wedge rotates the known real Gaussian-type integral into the complex plane without changing its modulus. At n = 2, √(C² + S²) = √π/2.",
      "check": "numeric:agree(hypot(fresnelCos(n), fresnelSin(n)), Gamma(1+1/n), tol=1e-12)",
      "verifiedBy": "n = 2: hypot(0.62665706865775006, 0.62665706865775006) = 0.88622692545275794 = √π/2" },
    { "id": "L3-and-L6-share-one-inequality",
      "statement": "Jordan's sin ψ ≥ 2ψ/π on [0,π/2] and L6's cos φ ≥ 1 − 2φ/π on [0,π/2] are the SAME inequality under φ = π/2 − ψ. The engine should carry one predicate and one discharge, used by both lemmas.",
      "check": "symbolic:identical(cos(pi/2 - psi) - (1 - 2*(pi/2 - psi)/pi), sin(psi) - 2*psi/pi)",
      "verifiedTo": "exact to 1e-15 on 5001 sample points of [0, π/2]" }
  ]
}
```

---

## 6. G tier — a prefatory note: **this is not an integral**

The three G entries share one mechanism, and it is the opposite of every other family in the gallery.
There is **no `target` piece.** Every side of the contour is `vanish`, the whole closed integral tends
to zero, and *that vanishing is the entire content*: the sum appears inside `S`, as the residues of
the kernel's own poles, and setting `S = 0` is what evaluates it. The machinery, stated once:

**The kernels.** `K(z) = π cot(πz)` has a simple pole at every `n ∈ ℤ` with residue exactly `1`.
`K(z) = π csc(πz)` has a simple pole at every `n ∈ ℤ` with residue exactly `(−1)ⁿ` — the alternation
is carried by the **kernel**, not by `f`, which is the whole reason G3 costs nothing extra once G1
exists. Both residues verified numerically (`Res[π cot, n=3] = 1.000000000000000`;
`Res[π csc, n=3] = −1`, `n=4` `= +1`).

**The contour and why it must be at half-integers.** `Γ_N` is the square with vertices
`(N+½)(±1±i)`, `N ∈ ℤ≥0`, counterclockwise. The half-integer offset is not a convenience — it is what
makes the kernel *uniformly* bounded over the whole family:

| side of `Γ_N` | why `cot` is bounded there | bound |
|---|---|---|
| horizontal, `y = ±(N+½)` | `\|cot πz\|² = (cos²πx + sinh²πy)/(sin²πx + sinh²πy) ≤ coth²(πy)` | `coth(π(N+½)) ≤ coth(π/2)` |
| vertical, `x = ±(N+½)` | `cos(πx) = 0` there, so `\|cot πz\| = \|tanh πy\| < 1` | `1` |

so `sup_{Γ_N}|cot πz| = coth(π(N+½))`, **maximised over the whole family at `N = 0`**, giving the
uniform constant `coth(π/2) = 1.0903314107273683` — verified by dense sampling: `N=0` → `1.090331410727368`
(the constant is attained), `N=1` → `1.000161412061016`, `N=2` → `1.000000301403500`, `N=3` →
`1.000000000562854`, each equal to `coth(π(N+½))` to `2.2e-16`. For `csc` the same split gives
`≤ 1/sinh(π/2) = 0.4345` on the horizontal sides and `1/cosh(πy) ≤ 1` on the vertical ones, so
`sup_{Γ_N}|csc πz| = 1` exactly, for every `N` (verified to `1.00000000000000` at `N = 0,1,2,5,12`).
**At any other half-width the family fails.** At an integer half-width the vertical sides pass through
the kernel's poles at `z = ±N` and `|cot|` is unbounded — measured `8.2×10¹⁵` at half-width `1`, i.e.
the sampled maximum limited only by float precision. At a non-integer, non-half-integer half-width the
sup is finite for each individual contour but **not uniformly bounded as the half-width approaches an
integer**, so no limit argument is available. The half-integers are the unique choice that is both
pole-free and uniformly bounded.

**The vanishing theorem, with the constant written out.** If `f` is meromorphic with finitely many
poles, none of them at an integer, and `|f(z)| ≤ M/|z|^k` with `k > 1` for `|z|` large, then on `Γ_N`
(where `|z| ≥ N+½` and the perimeter is `8(N+½)`):

```
|∮_{Γ_N} K f dz|  ≤  π·coth(π/2) · M/(N+½)^k · 8(N+½)  =  8π coth(π/2) M (N+½)^{1−k}  →  0.
```

Research/03 §8 writes this bound as `(M/N^k)·coth(π/2)·4(2N+1)`, which drops the `π` from `π cot(πz)`
(`4(2N+1) = 8(N+½)` is the perimeter and is right). **That is not a slack bound — it is not a bound:**
against the measured `|∮_{Γ_N} π cot(πz)/z²dz|` it reads `3.392` vs `3.567` at `N = 3` and `0.356` vs
`0.493` at `N = 25`, failing at every `N` tested. See finding **D-2**. *(M5.5 correction: the shortfall is 4.9% at
`N = 3` and 27.8% at `N = 25` — it GROWS, because the ratio between the two bounds is exactly
`π·(N/(N+½))^k`, so 30–40% is the ASYMPTOTE rather than the typical case. Both figures are
recomputed in the app's own suite; the finding stands, only its magnitude was overstated at
small `N`.)* The derived bound
above was checked against the actual closed-contour integral at `N = 3..25` for all three entries and
holds with slack `2.2×` (G1), `2.3×` (G2), `14×`–`62×` (G3, where `|csc| ≤ 1` beats `coth(π/2)` and
the summand's alternation makes the partial sums oscillate toward the limit rather than climb to it).

**Then** `S = 2πi[Σ_{|n|≤N} f(n)·Res(K,n) + Σ_j Res(Kf, z_j)]` and `S = ∮_{Γ_N} → 0` gives
`Σ_{n∈ℤ} f(n) = −Σ_j Res(Kf, z_j)` (or its `(−1)ⁿ` counterpart). **The unknown is inside `S`**, which
Pass 5 as specified cannot express — see finding **SG-1**.

---

## 7. G2 — `Σ_{n∈ℤ} 1/(n²+a²) = (π/a)coth(πa)` — the clean case

> **LOADED AND SOLVING (M5.6c)** as `series-cot-kernel` — the twenty-fourth record and the first in
> tier G. All four fixtures print their closed form labelled `=` and the ledger closes. Four
> departures from the JSONC below, each with its reason: the template is `square` (not `rectangle`)
> and the half-integer constraint is enforced from the GEOMETRY, which catches a dragged contour as a
> declared field could not; `targetWeight` is a per-entry `weight` inside `targetTerms`, as DESIGN §5
> always had it; the `n = 0` hypothesis takes `onFail: "refuse"` rather than `escalate`, because a
> collision is G1's theorem and not a recoverable case of this one (SG-6 belongs to the record that
> needs it); and the four sides carry `L2` with the M5.5c square bound rather than `L1`. A fifth trap
> is added — `residues-cancel-by-symmetry` — because the reflex that a conjugate pair cancels returns
> 0 for a sum of 4.26, and nothing else in the record says so. **Measured, against this section's own
> reading:** the half-integer family does not close at every `N`; at `a = 3/4` the square of
> half-width ½ leaves both cofactor poles outside, which is the "once N+½ > a" above, enforced.

Taken first because it is the *non-colliding* member and therefore the honest baseline: `f(z) =
1/(z²+a²)` has its poles at `±ia`, which are never integers for real `a ≠ 0` (the only purely
imaginary integer is `0`), so the theorem's hypothesis holds without argument and every residue in
sight is simple. `Res[K f, ±ia] = π cot(±iπa)/(±2ia) = −(π/2a)coth(πa)` — the *same* value at both
poles, because `cot` and `1/z` are both odd — so the two residues add rather than cancel and the sum
is `−(π/a)coth(πa)`. The entry exists to establish the square-contour bound and the `n = 0`
bookkeeping in a setting where nothing else is going on. The bookkeeping is where sign errors breed:
the theorem produces `Σ_{n∈ℤ}`, which **includes** `n = 0` contributing `1/a²`; the one-sided sum is
`Σ_{n≥1} = ½[(π/a)coth(πa) − 1/a²]`, and the tempting `(π/2a)coth(πa)` is wrong by `1/(2a²)` —
verified: at `a = 0.75` the truth is `1.2434764324674408` and the naive halving gives
`2.1323653213563296`.

```jsonc
{
  "id": "series-cot-kernel",
  "title": "Summation by the π cot(πz) kernel on half-integer squares (no collision)",
  "taxonomySection": "8",
  "tier": "G",

  "target": {
    // ⚠ SCHEMA GAP (SG-5): DESIGN §5 fixes target.variable to "x" | "theta" and names the field
    // `integrand`. A SUM is not an integral. Proposed: kind, variable "n", field `summand`.
    "kind": "sum",                        // ⚠ PROPOSED
    "variable": "n",                      // ⚠ PROPOSED (v1 union is "x" | "theta")
    "lower": "-inf", "upper": "inf",
    "summand": "1/(n^2 + a^2)",           // ⚠ PROPOSED (v1 field name is `integrand`)
    "symbols": {}
  },

  "parameters": [
    { "name": "a", "domain": "real", "constraints": ["a > 0"] },
    { "name": "N", "domain": "integer", "constraints": ["N >= 0"] }
  ],

  "hypotheses": [
    { "id": "no-pole-of-f-at-an-integer",
      "statement": "f = 1/(z²+a²) has poles only at ±ia; for real a ≠ 0 neither is an integer (the only purely imaginary integer is 0)",
      "check": "lattice:disjoint(poles(f), Z)", "onFail": "escalate" },
      // ⚠ SCHEMA GAP (SG-6): v1 onFail is "refuse" | "warn". G1 needs a third outcome — the
      // hypothesis fails and a DIFFERENT, stronger argument (merge the colliding poles) applies.
    { "id": "decay-exponent",
      "statement": "|f(z)| ≤ M/|z|^k with k = 2 > 1; concretely |f| ≤ 1/((N+½)² − a²) on Γ_N once (N+½)² > a²",
      "check": "algebraic:ge(degree(denom(f)) - degree(num(f)), 2)", "onFail": "refuse" },
    { "id": "contour-avoids-kernel-poles",
      "statement": "Γ_N has half-width N+½, so its sides miss every pole of π cot(πz) (the integers) and every pole of f",
      "check": "geom:minDistance(contour, poles(K) ∪ poles(f)) > 0", "onFail": "refuse" },
    { "id": "kernel-uniformly-bounded",
      "statement": "sup_{Γ_N}|cot πz| = coth(π(N+½)) ≤ coth(π/2) for every N ≥ 0, uniformly",
      "check": "symbolic:kernelBound('cot', 'halfIntegerSquare') == coth(pi/2)", "onFail": "refuse" }
  ],

  "contour": {
    "template": "rectangle",
    // ⚠ SCHEMA GAP: Γ_N is a CENTRED SQUARE whose half-width must run through half-integers.
    // `rectangle` carries the geometry; nothing in v1 carries the admissible-value constraint.
    // Proposed: template "square" + limitParams[].through: "halfIntegers".
    "limitParams": [ { "name": "N", "to": "inf", "through": "halfIntegers" } ],   // ⚠ PROPOSED
    "pieces": [
      { "id": "bottom", "name": "y = −(N+½)", "kind": "segment",
        "from": "-(N+1/2) - i*(N+1/2)", "to": "(N+1/2) - i*(N+1/2)",
        "role": "vanish", "lemma": "L1", "colour": 0 },
      { "id": "right", "name": "x = +(N+½)", "kind": "segment",
        "from": "(N+1/2) - i*(N+1/2)", "to": "(N+1/2) + i*(N+1/2)",
        "role": "vanish", "lemma": "L1", "colour": 1 },
      { "id": "top", "name": "y = +(N+½)", "kind": "segment",
        "from": "(N+1/2) + i*(N+1/2)", "to": "-(N+1/2) + i*(N+1/2)",
        "role": "vanish", "lemma": "L1", "colour": 2 },
      { "id": "left", "name": "x = −(N+½)", "kind": "segment",
        "from": "-(N+1/2) + i*(N+1/2)", "to": "-(N+1/2) - i*(N+1/2)",
        "role": "vanish", "lemma": "L1", "colour": 3 }
    ],
    "orientation": "ccw",
    "encloses": "the 2N+1 kernel poles n = −N..N (each simple, Res(K,n) = 1) AND, once N+½ > a, the two poles ±ia of f. THERE IS NO `target` PIECE: the target lives inside the residue sum."
  },

  "vanishingLemmas": [
    { "lemma": "L1", "piece": "bottom|top",
      "sideCondition": "on y = ±(N+½): |cot πz|² = (cos²πx + sinh²πy)/(sin²πx + sinh²πy) ≤ coth²(πy) ≤ coth²(π/2); and |f| ≤ 1/((N+½)² − a²)",
      "discharge": "symbolic:mlBound(M=pi*coth(pi/2)/((N+1/2)^2 - a^2), L=2*(2*N+1), limit=N->inf)",
      "rigorIfDischarged": "≤", "rigorIfNumericOnly": "≈" },
    { "lemma": "L1", "piece": "left|right",
      "sideCondition": "on x = ±(N+½): cos(πx) = 0 so |cot πz| = |tanh πy| < 1 — a DIFFERENT reason from the horizontal sides, and the stronger one; and |f| ≤ 1/((N+½)² − a²)",
      "discharge": "symbolic:mlBound(M=pi/((N+1/2)^2 - a^2), L=2*(2*N+1), limit=N->inf)",
      "rigorIfDischarged": "≤", "rigorIfNumericOnly": "≈" }
  ],
  // total: |∮| ≤ π coth(π/2)·8(N+½)/((N+½)² − a²) = O(1/N) → 0.

  "residueSelection": {
    "rule": "inside", "set": "|Re z| < N+1/2 and |Im z| < N+1/2",
    "targetTerms": "poles(K) ∩ Z",        // ⚠ PROPOSED — see SG-1
    "targetWeight": 1                     // Σ over ALL integers is the target itself: weight 1
  },

  "closedForm": {
    "expr": "-(Res(pi*cot(pi*z)/(z^2+a^2), i*a) + Res(pi*cot(pi*z)/(z^2+a^2), -i*a))",
    "simplified": "(pi/a)*coth(pi*a)",
    "oneSided": "sum_{n>=1} 1/(n^2+a^2) = ((pi/a)*coth(pi*a) - 1/a^2)/2"
    // Res[K f, ±ia] = π cot(±iπa)/(±2ia) = −(π/2a)coth(πa) — the SAME at both poles (cot and 1/z
    // are both odd, so the two sign flips cancel), hence they ADD to −(π/a)coth(πa).
  },

  "rigor": { "policy": "min",
             "inputs": ["hypotheses.*", "vanishingLemmas.*.rigor", "residues.*.rigor",
                        "kernelBound.rigor"] },

  "traps": [
    { "id": "square-at-arbitrary-radius",
      "detect": "!lattice:isHalfInteger(contour.halfWidth)",
      "message": "The half-width must be N+½. At an INTEGER half-width the vertical sides pass through the kernel's poles at z = ±N and |cot πz| is unbounded there (sampled max 8.2e15 at half-width 1) — the residue theorem does not apply to a contour through a pole at all. At any other half-width the sup is finite for that one contour but is NOT uniformly bounded as the half-width approaches an integer, so there is no limit argument. The half-integers are the unique pole-free, uniformly-bounded family: sup|cot πz| = coth(π(N+½)) ≤ coth(π/2) = 1.0903314107273683." },
    { "id": "forgot-the-n-equals-zero-term",
      "detect": "residueSelection.targetTerms excludes 0 && target.lower == '-inf'",
      "message": "Σ_{n∈ℤ} includes n = 0, contributing f(0) = 1/a². Dropping it is invisible in the closed form but wrong by 1/a²: at a = 0.75 the true Σ_ℤ is 4.2647306427126592 and the n≠0 sum is 2.4869528649348815." },
    { "id": "double-counted-by-naive-halving",
      "detect": "target.lower == '1' && closedForm.simplified == '(pi/(2*a))*coth(pi*a)'",
      "message": "Σ_{n≥1} = ½(Σ_ℤ − f(0)), NOT ½Σ_ℤ. The naive halving double-counts the n = 0 term into the one-sided sum: at a = 0.75 it gives 2.1323653213563296 instead of 1.2434764324674408. This is research/03 §8's trap (iii) and it is the commonest sign/bookkeeping error in the tier." },
    { "id": "decay-exponent-one",
      "detect": "algebraic:eq(decayExponent(f), 1)",
      "message": "k > 1 is necessary. At k = 1 the ML bound is π coth(π/2)·(M/(N+½))·8(N+½) = O(1) — a constant, not o(1) — so vanishing is NOT established, whatever the integral actually does. (Measured: for f = 1/(z−c) the symmetric square integral does decay, so the failure is in the BOUND, not necessarily in the limit — see finding D-3.) Even where the limit exists, what the identity delivers is lim_N Σ_{|n|≤N} f(n): a SYMMETRIC, principal-value sum. For f = 1/z that symmetric sum is 0 while Σ_{n≥1}1/n diverges. Like p.v. for integrals, a symmetric sum must be a distinct result type, never a value with a footnote." },
    { "id": "pole-of-f-near-an-integer",
      "detect": "numeric:minDistance(poles(f), Z) < 1e-3",
      "message": "Legal but ill-conditioned: the residue Res[Kf, z_j] contains cot(πz_j), which blows up as z_j approaches an integer. Exact arithmetic is fine; float residues are not. Report the conditioning rather than the digits." }
  ],

  "golden": [
    { "params": { "a": 0.75 }, "value": "(pi/a)*coth(pi*a)", "numeric": 4.2647306427126592, "verifiedTo": 5.8e-15,
      "verifiedBy": "direct summation to n = 200000 plus a 4-term Euler–Maclaurin tail (∫ + f/2 − f′/12 + f‴/720)" },
    { "params": { "a": 1 }, "value": "pi*coth(pi)", "numeric": 3.1533480949371619, "verifiedTo": 8.5e-15, "verifiedBy": "same" },
    { "params": { "a": 2.3 }, "value": "(pi/a)*coth(pi*a)", "numeric": 1.3659112958955153, "verifiedTo": 2.0e-15, "verifiedBy": "same" },
    { "params": { "a": 0.2 }, "value": "(pi/a)*coth(pi*a)", "numeric": 28.206414179015560, "verifiedTo": 1.7e-14,
      "verifiedBy": "same — small a pushes ±ia close to the integer 0 and is the conditioning stress case" },
    { "params": { "a": 0.75, "sided": "one" }, "value": "((pi/a)*coth(pi*a) - 1/a^2)/2", "numeric": 1.2434764324674408,
      "verifiedTo": 0.0, "verifiedBy": "direct one-sided summation + EM tail; exact float agreement" },

    { "params": { "a": 0.75, "probe": "residue" }, "value": "-(pi/(2*a))*coth(pi*a)",
      "numeric": [-2.13236532135633, 0.0], "verifiedTo": 3.7e-15, "verifiedBy": "trapezoid on |z ∓ 0.75i| = 0.2, both poles, identical value" },
    { "params": { "a": 0.75, "N": 20, "probe": "closedContour" }, "value": "2*pi*i*[partial - (pi/a)coth(pi a)]",
      "numeric": [0.0, -0.6125993], "verifiedTo": 4.9e-15,
      "verifiedBy": "four sides of Γ_20 vs 2πi[Σ_{|n|≤20} f(n) − (π/a)coth(πa)]; also N = 4, 9" },
    { "params": { "probe": "kernelBound" }, "value": "coth(pi/2)", "numeric": 1.0903314107273683,
      "verifiedTo": 2.2e-16,
      "verifiedBy": "40001-point sampling of all four sides of Γ_N for N = 0,1,2,5,12; sup equals coth(π(N+½)) each time, maximised at N = 0" }
  ],

  "invariants": [
    { "id": "a-to-zero-recovers-G1",
      "statement": "As a → 0⁺, (π/a)coth(πa) − 1/a² → π²/3, which is Σ_{n≠0}1/n² = 2ζ(2). The non-colliding family degenerates continuously into the colliding one — G2 and G1 are the same theorem at a = 0 and a ≠ 0, and the order-3 merged pole of G1 is the confluence of G2's two simple poles ±ia with the kernel's pole at 0.",
      "check": "numeric:limit((pi/a)*coth(pi*a) - 1/a^2, a->0) == pi^2/3",
      "verifiedTo": "a = 1e-4 gives 3.289868133696... → π²/3 = 3.2898681336964528" },
    { "id": "csc-companion",
      "statement": "The same contour with the π csc kernel gives Σ_{n∈ℤ}(−1)ⁿ/(n²+a²) = (π/a)csch(πa) — one contour family, two kernels, and the alternation lives entirely in Res(K,n).",
      "check": "numeric:agree(altSum(a), (pi/a)/sinh(pi*a), tol=1e-12)" }
  ]
}
```

---

## 8. G1 — `Σ_{n≥1} 1/n² = π²/6` — **the collision**

This is the most instructive entry in the gallery and the one that most stresses the schema. The
theorem's hypothesis is *"`f` has no pole at an integer"*, and `f(z) = 1/z²` **violates it at the one
point where the kernel also has a pole.** The correct response is neither to refuse nor to pretend:
it is to observe that `π cot(πz)/z²` is a perfectly good meromorphic function whose pole at `0` has
order `1 + 2 = 3` — **orders add at a collision** — and to compute the merged residue directly. From
`cot w = 1/w − w/3 − w³/45 − …`,

```
π cot(πz) = 1/z − (π²/3) z − (π⁴/45) z³ − …
π cot(πz)/z² = 1/z³ + 0·z⁻² − (π²/3)·z⁻¹ + 0 − (π⁴/45) z − …      ⇒  Res₀ = −π²/3.
```

Verified two ways: a 4096-point circle trapezoid on `|z| = 0.25` gives `−3.28986813369646` against
`−π²/3 = −3.2898681336964528` (rel `1.1×10⁻¹⁵`), and extracting the individual Laurent coefficients on
`|z| = 0.3` returns `c₋₃ = 1`, `c₋₂ = 0`, `c₋₁ = −π²/3`, `c₀ = 0`, `c₁ = −π⁴/45 = −2.1646` — the full
predicted series. Then `∮_{Γ_N} = 2πi[Σ_{0<|n|≤N} n⁻² + (−π²/3)] → 0` gives `Σ_{n≠0} n⁻² = π²/3` and
`ζ(2) = π²/6`. Note which residue formula is right here: DESIGN §6.3 / research/03 §0.2 prefer the
**Laurent-coefficient route (formula 4)** for `m ≥ 3` because the order-`m` derivative formula
explodes symbolically — and `m = 3` is exactly the first case where that matters, so G1 is also the
entry that justifies the series layer. What the entry costs the schema is spelled out below: the
hypothesis needs an outcome other than `refuse`/`warn` (**SG-6**), and the target `Σ_{n≥1}` appears in
`S` with **weight 2**, because the kernel poles at `n ≠ 0` sum to `2T` (**SG-1**). That weight is the
`halving` bookkeeping made structural — the same arithmetic that trap `double-counted-by-naive-halving`
catches in G2, here promoted to a field the solve depends on.

```jsonc
{
  "id": "series-cot-collision",
  "title": "ζ(2) by the π cot(πz) kernel — kernel pole and f pole COLLIDE at n = 0",
  "taxonomySection": "8",
  "tier": "G",

  "target": {
    "kind": "sum",                        // ⚠ PROPOSED — SG-5
    "variable": "n",                      // ⚠ PROPOSED
    "lower": "1", "upper": "inf",
    "summand": "1/n^2",                   // ⚠ PROPOSED
    "symbols": {}
  },

  "parameters": [
    { "name": "N", "domain": "integer", "constraints": ["N >= 1"] }
  ],

  "hypotheses": [
    { "id": "no-pole-of-f-at-an-integer",
      "statement": "FAILS: f = 1/z² has a double pole at z = 0, which is an integer and is also a pole of the kernel. This is the collision case.",
      "check": "lattice:disjoint(poles(f), Z)",
      "onFail": "escalate",                          // ⚠ PROPOSED outcome — SG-6
      "escalateTo": "merge-collision" },
    { "id": "collision-is-handleable",
      "statement": "At a collision the orders ADD: ord(K·f, 0) = ord(K,0) + ord(f,0) = 1 + 2 = 3, finite, so K·f is meromorphic at 0 and the residue theorem applies to the PRODUCT. (This is not available at an essential singularity.)",
      "check": "series:isMeromorphicAt(K*f, 0) && series:order(K*f, 0) == 3",
      "onFail": "refuse" },
    { "id": "decay-exponent",
      "statement": "|f| = 1/|z|² ≤ M/|z|^k with k = 2 > 1; on Γ_N, |f| ≤ 1/(N+½)²",
      "check": "algebraic:ge(decayExponent(f), 2)", "onFail": "refuse" },
    { "id": "contour-avoids-kernel-poles",
      "statement": "Γ_N has half-width N+½, missing every integer — including the collision point 0, which is strictly inside for every N ≥ 0",
      "check": "geom:minDistance(contour, poles(K*f)) > 0", "onFail": "refuse" },
    { "id": "kernel-uniformly-bounded",
      "statement": "sup_{Γ_N}|cot πz| = coth(π(N+½)) ≤ coth(π/2), uniformly in N",
      "check": "symbolic:kernelBound('cot', 'halfIntegerSquare') == coth(pi/2)", "onFail": "refuse" }
  ],

  "contour": {
    "template": "rectangle",              // ⚠ see SG-5: wants "square" + `through: halfIntegers`
    "limitParams": [ { "name": "N", "to": "inf", "through": "halfIntegers" } ],   // ⚠ PROPOSED
    "pieces": [
      { "id": "bottom", "name": "y = −(N+½)", "kind": "segment",
        "from": "-(N+1/2) - i*(N+1/2)", "to": "(N+1/2) - i*(N+1/2)", "role": "vanish", "lemma": "L1", "colour": 0 },
      { "id": "right", "name": "x = +(N+½)", "kind": "segment",
        "from": "(N+1/2) - i*(N+1/2)", "to": "(N+1/2) + i*(N+1/2)", "role": "vanish", "lemma": "L1", "colour": 1 },
      { "id": "top", "name": "y = +(N+½)", "kind": "segment",
        "from": "(N+1/2) + i*(N+1/2)", "to": "-(N+1/2) + i*(N+1/2)", "role": "vanish", "lemma": "L1", "colour": 2 },
      { "id": "left", "name": "x = −(N+½)", "kind": "segment",
        "from": "-(N+1/2) + i*(N+1/2)", "to": "-(N+1/2) - i*(N+1/2)", "role": "vanish", "lemma": "L1", "colour": 3 }
    ],
    "orientation": "ccw",
    "encloses": "2N simple poles at n = ±1..±N (Res = 1/n² each) and ONE MERGED pole of order 3 at z = 0 with Res = −π²/3. No `target` piece exists."
  },

  "vanishingLemmas": [
    { "lemma": "L1", "piece": "bottom|top",
      "sideCondition": "|cot πz| ≤ coth(π(N+½)) ≤ coth(π/2) on the horizontal sides; |f| ≤ 1/(N+½)²",
      "discharge": "symbolic:mlBound(M=pi*coth(pi/2)/(N+1/2)^2, L=2*(2*N+1), limit=N->inf)",
      "rigorIfDischarged": "≤", "rigorIfNumericOnly": "≈" },
    { "lemma": "L1", "piece": "left|right",
      "sideCondition": "|cot πz| = |tanh πy| < 1 on the vertical sides; |f| ≤ 1/(N+½)²",
      "discharge": "symbolic:mlBound(M=pi/(N+1/2)^2, L=2*(2*N+1), limit=N->inf)",
      "rigorIfDischarged": "≤", "rigorIfNumericOnly": "≈" }
  ],
  // total |∮| ≤ 8π coth(π/2)/(N+½); measured 3.5666 at N=3 vs bound 7.8294, 0.49274 at N=25 vs 1.0746.

  "residueSelection": {
    "rule": "inside", "set": "|Re z| < N+1/2 and |Im z| < N+1/2",
    "collisions": [                       // ⚠ PROPOSED — the schema has no way to say this in v1
      { "at": "0",
        "kernelOrder": 1, "fOrder": 2, "mergedOrder": 3,
        "residue": "-pi^2/3",
        "method": "series:laurentCoefficient(pi*cot(pi*z)/z^2, 0, -1)",
        "why": "formula (4) not (3): the order-m derivative formula is symbolically explosive for m >= 3 (research/03 §0.2, DESIGN §6.3)" }
    ],
    "targetTerms": "poles(K) ∩ Z \\ {0}", // ⚠ PROPOSED — SG-1
    "targetWeight": 2                     // Σ_{n≠0} n^-2 = 2·Σ_{n>=1} n^-2 = 2T
  },

  "closedForm": {
    "expr": "-Res(pi*cot(pi*z)/z^2, 0) / 2",
    "simplified": "pi^2/6",
    "twoSided": "sum_{n != 0} 1/n^2 = pi^2/3"
    // 0 = lim ∮ = 2πi[2T + Res₀]  ⇒  T = −Res₀/2 = (π²/3)/2 = π²/6.
    // The factor 2 IS the targetWeight; it is the halving bookkeeping, made structural.
  },

  "rigor": { "policy": "min",
             "inputs": ["hypotheses.*", "vanishingLemmas.*.rigor", "residues.*.rigor",
                        "collisions.*.rigor", "kernelBound.rigor"] },

  "traps": [
    { "id": "collision-refused",
      "detect": "hypotheses['no-pole-of-f-at-an-integer'].onFail == 'refuse'",
      "message": "Refusing here is wrong. The hypothesis 'f has no pole at an integer' is a SUFFICIENT condition for the clean form of the theorem, not a necessary condition for the contour argument. π cot(πz)/z² is meromorphic at 0 with a pole of order 3; the residue theorem applies to the product. What must be refused is a collision at an ESSENTIAL singularity, where no finite order exists and no residue formula applies." },
    { "id": "kernel-residue-used-at-the-collision",
      "detect": "residues.find(r => r.at == '0').residue == 'f(0)*Res(K,0)'",
      "message": "At a collision the residue does NOT factor. Res(K,0)·f(0) is meaningless here — f(0) is infinite. The merged residue −π²/3 comes from the z⁻¹ coefficient of the PRODUCT's Laurent series, and it depends on the second-order term of cot: π cot(πz) = 1/z − (π²/3)z − …, so the −(π²/3)z term multiplied by 1/z² is what lands on z⁻¹. The π²/6 comes from cot's Taylor tail, not from its pole." },
    { "id": "order-3-by-derivative-formula",
      "detect": "residues.find(r => r.at == '0').method startsWith 'derivative:'",
      "message": "Formula (3) needs d²/dz²[z³·π cot(πz)/z²] = d²/dz²[z·π cot(πz)], which is symbolically explosive and numerically unstable (two derivatives of a function with a pole). Formula (4) — read c₋₁ off the truncated Laurent quotient — is exact, cheap and the route DESIGN §6.3 mandates for m ≥ 3. G1 is the first entry in the gallery where the choice matters." },
    { "id": "forgot-the-collision-term",
      "detect": "!residueSelection.collisions.some(c => c.at == '0')",
      "message": "Dropping Res₀ leaves 0 = 2πi·Σ_{n≠0}n⁻², i.e. ζ(2) = 0. The vanishing of the contour integral is the WHOLE content of the argument, so every enclosed residue must be present or the conclusion is nonsense rather than merely inaccurate." },
    { "id": "weight-2-forgotten",
      "detect": "residueSelection.targetWeight != 2 && target.lower == '1'",
      "message": "The kernel poles at n = ±1..±N contribute Σ_{n≠0}n⁻² = 2·Σ_{n≥1}n⁻², so the target enters S with weight 2. Forgetting it reports π²/3 instead of π²/6 — a factor-of-two error that looks entirely plausible, which is precisely why the weight has to be a field rather than a habit." },
    { "id": "square-at-arbitrary-radius",
      "detect": "!lattice:isHalfInteger(contour.halfWidth)",
      "message": "See G2: at an integer half-width the vertical sides run through the kernel's poles (|cot| sampled at 8.2e15), and off the half-integers the kernel bound is not uniform in N, so no limit argument exists. coth(π/2) = 1.0903314107273683 is available only on the half-integer family." }
  ],

  "golden": [
    { "params": {}, "value": "pi^2/6", "numeric": 1.6449340668482264, "verifiedTo": 0.0,
      "verifiedBy": "direct summation of 200000 terms plus the Euler–Maclaurin tail 1/N + 1/2N² + 1/6N³ − 1/30N⁵; exact float64 agreement with π²/6" },
    { "params": { "sided": "two" }, "value": "pi^2/3", "numeric": 3.2898681336964528, "verifiedTo": 0.0, "verifiedBy": "2× the above" },

    { "params": { "probe": "mergedResidue" }, "value": "-pi^2/3", "numeric": -3.28986813369646,
      "verifiedTo": 1.1e-15, "verifiedBy": "4096-point circle trapezoid on |z| = 0.25" },
    { "params": { "probe": "laurentCoefficients" },
      "value": "[c_-3, c_-2, c_-1, c_0, c_1] = [1, 0, -pi^2/3, 0, -pi^4/45]",
      "numeric": [1.0, 0.0, -3.2898681336964528, 0.0, -2.1646464674222758],
      "verifiedTo": 1e-15, "verifiedBy": "Fourier extraction on |z| = 0.3, 4096 nodes — confirms order exactly 3 and the full predicted series" },
    { "params": { "N": 12, "probe": "closedContour" }, "value": "2*pi*i*[sum_{0<|n|<=N} n^-2 - pi^2/3]",
      "numeric": [0.0, -1.004775], "verifiedTo": 4.5e-16,
      "verifiedBy": "four sides of Γ_12; also N = 3, 6, 25. Bound 8π coth(π/2)/(N+½) holds with ~2.2× slack throughout" }
  ],

  "invariants": [
    { "id": "zeta-4-by-the-same-collision",
      "statement": "Res₀[π cot(πz)/z⁴] = −π⁴/45 (the z³ coefficient of π cot, promoted), giving Σ_{n≠0}n⁻⁴ = π⁴/45 and ζ(4) = π⁴/90. Same kernel, same contour, order-5 merged pole. The collision machinery generalises to ζ(2m) with no new ideas — only a longer series.",
      "check": "series:laurentCoefficient(pi*cot(pi*z)/z^4, 0, -1) == -pi^4/45",
      "verifiedBy": "the c₁ = −π⁴/45 = −2.1646464674222758 coefficient measured above is the same number" },
    { "id": "confluence-with-G2",
      "statement": "G1's order-3 pole is the a → 0 confluence of G2's kernel pole at 0 with f's two simple poles at ±ia. lim_{a→0}[(π/a)coth(πa) − 1/a²] = π²/3 = Σ_{n≠0}n⁻². The colliding and non-colliding entries are one family.",
      "check": "numeric:limit(G2(a) - 1/a^2, a->0) == pi^2/3" },
    { "id": "csc-companion-is-G3",
      "statement": "The identical collision with the π csc kernel gives Res₀ = +π²/6 and hence −π²/12 — see G3. One contour, one collision, two kernels, two classical constants.",
      "check": "series:laurentCoefficient(pi*csc(pi*z)/z^2, 0, -1) == pi^2/6" }
  ]
}
```

---

## 9. G3 — `Σ_{n≥1} (−1)ⁿ/n² = −π²/12`

G3 costs almost nothing once G1 exists, and that is exactly what it is here to demonstrate: **the
alternation is a property of the kernel, not of the problem.** `π csc(πz)` has the same simple poles
at the integers as `π cot(πz)` but with residue `(−1)ⁿ` instead of `1`, so `f` is untouched, the
contour is untouched, the bound is *better* (`|csc πz| ≤ 1` on `Γ_N` exactly, for every `N`, versus
`coth(π/2)` for `cot`), and only the merged residue changes — and it changes sign as well as size.
From `csc w = 1/w + w/6 + 7w³/360 + …`, `π csc(πz) = 1/z + (π²/6)z + …`, so
`π csc(πz)/z² = 1/z³ + (π²/6)z⁻¹ + …` and `Res₀ = +π²/6` (measured `1.64493406684823`, rel
`3.2×10⁻¹⁵`). Then `0 = 2πi[2T + π²/6]` gives `T = −π²/12`. The sign flip relative to G1 —
`cot`'s `−π²/3` versus `csc`'s `+π²/6`, a factor of `−1/2` — is the whole numerical difference between
`ζ(2) = π²/6` and `η(2) = π²/12`, and an engine that shares one code path between the two kernels gets
it right or gets it wrong in exactly one place.

```jsonc
{
  "id": "series-csc-kernel-collision",
  "title": "η(2) by the π csc(πz) kernel — the alternation lives in the kernel's residues",
  "taxonomySection": "8",
  "tier": "G",

  "target": {
    "kind": "sum",                        // ⚠ PROPOSED — SG-5
    "variable": "n",                      // ⚠ PROPOSED
    "lower": "1", "upper": "inf",
    "summand": "(-1)^n/n^2",              // ⚠ PROPOSED
    "symbols": {}
  },

  "parameters": [
    { "name": "N", "domain": "integer", "constraints": ["N >= 1"] }
  ],

  "hypotheses": [
    { "id": "kernel-residues-alternate",
      "statement": "Res(π csc(πz), n) = (−1)ⁿ for every n ∈ ℤ — the alternation belongs to the KERNEL. f = 1/z² is the same f as in G1.",
      "check": "series:residueAt(pi*csc(pi*z), n) == (-1)^n", "onFail": "refuse" },
    { "id": "no-pole-of-f-at-an-integer",
      "statement": "FAILS at z = 0, exactly as in G1: collision of the kernel's simple pole with f's double pole",
      "check": "lattice:disjoint(poles(f), Z)",
      "onFail": "escalate", "escalateTo": "merge-collision" },     // ⚠ PROPOSED — SG-6
    { "id": "collision-is-handleable",
      "statement": "ord(K·f, 0) = 1 + 2 = 3; Res₀[π csc(πz)/z²] = +π²/6 from π csc(πz) = 1/z + (π²/6)z + 7π⁴z³/360 + …",
      "check": "series:isMeromorphicAt(K*f, 0) && series:order(K*f, 0) == 3", "onFail": "refuse" },
    { "id": "decay-exponent",
      "statement": "|f| ≤ 1/(N+½)² on Γ_N; k = 2 > 1",
      "check": "algebraic:ge(decayExponent(f), 2)", "onFail": "refuse" },
    { "id": "kernel-uniformly-bounded",
      "statement": "sup_{Γ_N}|csc πz| = 1 EXACTLY, for every N: on the horizontal sides |sin πz|² = sin²πx + sinh²πy ≥ sinh²(π/2) gives |csc| ≤ 1/sinh(π/2) = 0.4345; on the vertical sides sin(π(±(N+½)+iy)) = ±cosh(πy) gives |csc| = 1/cosh(πy) ≤ 1, attained at y = 0.",
      "check": "symbolic:kernelBound('csc', 'halfIntegerSquare') == 1", "onFail": "refuse" }
  ],

  "contour": {
    "template": "rectangle",              // ⚠ wants "square" — SG-5
    "limitParams": [ { "name": "N", "to": "inf", "through": "halfIntegers" } ],   // ⚠ PROPOSED
    "pieces": [
      { "id": "bottom", "name": "y = −(N+½)", "kind": "segment",
        "from": "-(N+1/2) - i*(N+1/2)", "to": "(N+1/2) - i*(N+1/2)", "role": "vanish", "lemma": "L1", "colour": 0 },
      { "id": "right", "name": "x = +(N+½)", "kind": "segment",
        "from": "(N+1/2) - i*(N+1/2)", "to": "(N+1/2) + i*(N+1/2)", "role": "vanish", "lemma": "L1", "colour": 1 },
      { "id": "top", "name": "y = +(N+½)", "kind": "segment",
        "from": "(N+1/2) + i*(N+1/2)", "to": "-(N+1/2) + i*(N+1/2)", "role": "vanish", "lemma": "L1", "colour": 2 },
      { "id": "left", "name": "x = −(N+½)", "kind": "segment",
        "from": "-(N+1/2) + i*(N+1/2)", "to": "-(N+1/2) - i*(N+1/2)", "role": "vanish", "lemma": "L1", "colour": 3 }
    ],
    "orientation": "ccw",
    "encloses": "2N simple poles at n = ±1..±N with residues (−1)ⁿ/n², and ONE merged order-3 pole at 0 with Res = +π²/6. No `target` piece."
  },

  "vanishingLemmas": [
    { "lemma": "L1", "piece": "bottom|top",
      "sideCondition": "|sin πz|² = sin²πx + sinh²πy ≥ sinh²(π(N+½)) ≥ sinh²(π/2) on the horizontal sides, so |csc πz| ≤ 1/sinh(π/2) = 0.43453720809469581; |f| ≤ 1/(N+½)²",
      "discharge": "symbolic:mlBound(M=pi/(sinh(pi/2)*(N+1/2)^2), L=2*(2*N+1), limit=N->inf)",
      "rigorIfDischarged": "≤", "rigorIfNumericOnly": "≈" },
    { "lemma": "L1", "piece": "left|right",
      "sideCondition": "sin(π(±(N+½)+iy)) = ±cosh(πy), so |csc πz| = 1/cosh(πy) ≤ 1 with equality only at y = 0; |f| ≤ 1/(N+½)²",
      "discharge": "symbolic:mlBound(M=pi/(N+1/2)^2, L=2*(2*N+1), limit=N->inf)",
      "rigorIfDischarged": "≤", "rigorIfNumericOnly": "≈" }
  ],
  // total |∮| ≤ 8π/(N+½); measured 0.48562 at N=3 vs bound 7.1808 — much slacker than G1 because
  // the summand alternates and the partial sums oscillate toward the limit rather than climbing to it.

  "residueSelection": {
    "rule": "inside", "set": "|Re z| < N+1/2 and |Im z| < N+1/2",
    "collisions": [                       // ⚠ PROPOSED — SG-6 / SG-1
      { "at": "0", "kernelOrder": 1, "fOrder": 2, "mergedOrder": 3,
        "residue": "pi^2/6",
        "method": "series:laurentCoefficient(pi*csc(pi*z)/z^2, 0, -1)",
        "why": "π csc(πz) = 1/z + (π²/6)z + …, so the z-coefficient +π²/6 lands on z⁻¹ after dividing by z². Note the SIGN and the SIZE both differ from cot's −π²/3 — that single number is the whole difference between ζ(2) and −η(2)." }
    ],
    "targetTerms": "poles(K) ∩ Z \\ {0}", // ⚠ PROPOSED — SG-1
    "targetWeight": 2                     // Σ_{n≠0}(−1)ⁿ/n² = 2·Σ_{n≥1}(−1)ⁿ/n² = 2T (the summand is even in n)
  },

  "closedForm": {
    "expr": "-Res(pi*csc(pi*z)/z^2, 0) / 2",
    "simplified": "-pi^2/12",
    "twoSided": "sum_{n != 0} (-1)^n/n^2 = -pi^2/6"
    // 0 = lim ∮ = 2πi[2T + π²/6]  ⇒  T = −π²/12.
  },

  "rigor": { "policy": "min",
             "inputs": ["hypotheses.*", "vanishingLemmas.*.rigor", "residues.*.rigor",
                        "collisions.*.rigor", "kernelBound.rigor"] },

  "traps": [
    { "id": "alternation-put-into-f",
      "detect": "structural:contains(problem.contourIntegrand, '(-1)^z')",
      "message": "(−1)ⁿ has no meromorphic extension to ℂ that is useful here — (−1)^z = e^{iπz} is entire but grows in the lower half-plane and destroys the square bound. The alternation must come from the KERNEL: Res(π csc(πz), n) = (−1)ⁿ. f stays 1/z², literally the same f as G1." },
    { "id": "cot-kernel-with-alternating-target",
      "detect": "kernel == 'cot' && target.summand contains '(-1)^n'",
      "message": "The π cot kernel has residue 1 at every integer and computes Σf(n); the π csc kernel has residue (−1)ⁿ and computes Σ(−1)ⁿf(n). Mixing them returns ζ(2) where η(2) was asked for — same magnitude family, wrong constant (π²/6 vs π²/12)." },
    { "id": "collision-sign-borrowed-from-cot",
      "detect": "residueSelection.collisions[0].residue == '-pi^2/3'",
      "message": "csc's merged residue is +π²/6, cot's is −π²/3: different sign AND different magnitude, because csc's Laurent tail is 1/z + (π²/6)z + … while cot's is 1/z − (π²/3)z − …. Sharing one code path between the kernels is right; sharing one constant is not." },
    { "id": "forgot-the-collision-term",
      "detect": "!residueSelection.collisions.some(c => c.at == '0')",
      "message": "Without Res₀ the identity reads 0 = 2πi·Σ_{n≠0}(−1)ⁿ/n², i.e. η(2) = 0. As in G1, the contour integral's vanishing is the entire argument, so a missing residue does not degrade the answer — it destroys it." },
    { "id": "weight-2-forgotten",
      "detect": "residueSelection.targetWeight != 2 && target.lower == '1'",
      "message": "(−1)ⁿ/n² is EVEN in n, so Σ_{n≠0} = 2Σ_{n≥1} exactly as in G1. Reporting −π²/6 instead of −π²/12 is the resulting error, and it is indistinguishable from a correct answer to a different question." }
  ],

  "golden": [
    { "params": {}, "value": "-pi^2/12", "numeric": -0.82246703342411320, "verifiedTo": 1.4e-16,
      "verifiedBy": "Cohen–Rodriguez Villegas–Zagier alternating-series acceleration over 60 terms of Σ(−1)^{n−1}/n², negated" },
    { "params": { "sided": "two" }, "value": "-pi^2/6", "numeric": -1.6449340668482264, "verifiedTo": 1.4e-16, "verifiedBy": "2× the above" },

    { "params": { "probe": "mergedResidue" }, "value": "pi^2/6", "numeric": 1.64493406684823,
      "verifiedTo": 3.2e-15, "verifiedBy": "4096-point circle trapezoid on |z| = 0.25" },
    { "params": { "probe": "kernelResidues" }, "value": "Res(pi*csc(pi*z), n) = (-1)^n",
      "numeric": [-1.0, 1.0], "verifiedTo": 1.4e-15, "verifiedBy": "trapezoid on |z−3| = 0.2 → −1; |z−4| = 0.2 → +1" },
    { "params": { "probe": "kernelBound" }, "value": "sup|csc(pi z)| on Gamma_N = 1", "numeric": 1.00000000000000,
      "verifiedTo": 0.0, "verifiedBy": "40001-point sampling of all four sides for N = 0,1,2,5,12 — exactly 1 every time, attained at y = 0 on the vertical sides" },
    { "params": { "N": 15, "probe": "closedContour" }, "value": "2*pi*i*[partial + pi^2/6]",
      "numeric": [0.0, -0.02607175], "verifiedTo": 9.1e-14,
      "verifiedBy": "four sides of Γ_15; also N = 3, 7. Bound 8π/(N+½) holds with 14×–62× slack" }
  ],

  "invariants": [
    { "id": "eta-2-equals-half-zeta-2",
      "statement": "|Σ_{n≥1}(−1)ⁿ/n²| = π²/12 = ½·π²/6 = ½ζ(2), the classical η(s) = (1 − 2^{1−s})ζ(s) at s = 2. The contour route reproduces it without ever mentioning the Dirichlet eta function: it falls out of the ratio of the two merged residues, (+π²/6)/(−π²/3) = −½.",
      "check": "numeric:agree(abs(G3()), G1()/2, tol=1e-14)" },
    { "id": "csc-companion-of-G2",
      "statement": "The same kernel swap on G2 gives Σ_{n∈ℤ}(−1)ⁿ/(n²+a²) = (π/a)csch(πa), and a → 0 confluence recovers G3 — closing the 2×2 square of {cot, csc} × {collision, no collision}.",
      "check": "numeric:agree(altSumG2(a), (pi/a)/sinh(pi*a), tol=1e-12)" }
  ]
}
```

---

## 10. Findings

### 10.1 Disagreements with `research/03-method-taxonomy.md`

**Every closed-form VALUE in research/03's §13 table for E1, E2, E3, F1, F2, G1, G2 and G3 is
correct** — all eight were recomputed independently here and agree to between `0` and `2.0×10⁻¹²`
relative. The disagreements are in *lemma statements and bound constants*, all of which matter
because a Family record's `sideCondition` and `discharge` must be machine-checkable.

- **D-1 (substantive) — L6's arc range is wrong as written.** §0.3 states L6 for `f = e^{−zⁿ}` on the
  arc `θ ∈ [0, π/n]`, justified by `cos φ ≥ 1 − 2φ/π` on `[0, π/2]`. The two halves are individually
  right and jointly inconsistent: on `[0, π/n]` we have `nθ` up to `π`, where `cos nθ < 0` and
  `e^{−Rⁿcos nθ}` **grows**. The stated majorant `R∫₀^{π/n}e^{−Rⁿcos nθ}dθ` diverges — measured
  `2.7×10¹⁵` at `n = 2, R = 6`, `1.1×10⁹³` at `n = 3`, float overflow at `n = 4`. Moreover `cos φ ≥
  1 − 2φ/π` **reverses** on `[π/2, π]` (verified: `cos φ ≤ 1 − 2φ/π` there, both being equal at the
  endpoints, `cos` concave on the first half and convex on the second). Correct statements: for
  `f = e^{−zⁿ}` the range is `θ ∈ [0, π/(2n)]` with bound `π/(2nR^{n−1})`; for `f = e^{izⁿ}` the range
  `[0, π/n]` *is* admissible, with `|f| = e^{−Rⁿ sin nθ}` and **Jordan's** `sin φ ≥ 2φ/π`. The
  Fresnel wedge is `π/4 = π/(2n)` at `n = 2`, consistent with the corrected form and with §7's
  generalised `∫₀^∞cos(xⁿ)dx = Γ(1+1/n)cos(π/(2n))`, whose wedge is `π/(2n)`. Both corrected forms
  are checked at `n = 2,3,4` and `R = 2,4,8,16` in F2's `golden`.
  **Implemented in M5.2**, and the correction is structural rather than restated: the arc's range and
  the inequality's range are ONE question, asked in `kernel/bounds/linearMinorant.ts`, and the two
  faces part company past `π/2` (the sin face folds and costs a factor of two; the cos face changes
  sign and costs everything). The divergence above is recomputed in `test/wedgeArc.test.ts` at
  `n = 2,3,4`, and both corrected forms are checked against the true arc integral at `n = 2,3,4` and
  `R = 2,4,8,16`. Note that research 03 §0.3 (as corrected) quotes the *oscillatory* range as
  `[0, π/(2n)]` where this file quotes `[0, π/n]`: both are right — the first is the wedge Fresnel
  uses, the second the largest range on which the form still vanishes — and the engine quotes
  neither, reading the arc's range off the geometry.
- **D-2 (substantive) — the §8 square-contour bound drops a `π`, and the result is not an upper
  bound.** §8 writes `(M/N^k)·coth(π/2)·4(2N+1)`. The kernel is `π cot(πz)`, not `cot(πz)`, so the
  constant must be `π coth(π/2)`; the perimeter `4(2N+1) = 8(N+½)` is right, and `|z| ≥ N+½` on `Γ_N`
  (not `N`). The missing `π` is a factor `3.14` too small and outweighs the `(1 + 1/2N)^k` the
  looser `|z| ≥ N` buys back, so the stated expression **falls below the true value**. Measured
  against `|∮_{Γ_N} π cot(πz)/z² dz|` (G1, `M = 1`, `k = 2`): `N=3` bound `3.392` vs actual `3.567`;
  `N=6` `1.575` vs `1.930`; `N=12` `0.757` vs `1.005`; `N=25` `0.356` vs `0.493` — it fails at every
  `N` tested, by 30–40 %. The derived bound `8π coth(π/2)·M·(N+½)^{1−k}` holds at all four with
  ~2.2× slack. The asymptotic conclusion (`→ 0` for `k > 1`) is unaffected; the *finite-`N` numeric
  bound the ledger would print* is not, and printing a `≤` that is false is precisely what
  `PLAN.md` §9's R2 ("certification theatre") names.
- **D-3 (minor) — §8's trap (i) overstates the `k = 1` failure.** It says "for `k = 1` the square
  integral does **not** vanish". Measured, for `f = 1/(z−c)` at `c = 0.3`, `0.37`, `−1.6` and
  `0.3+0.7i`, the symmetric square integral *does* decay (`≈ 0.68 → 0.18 → 0.062` as `N = 5 → 20 →
  60`). What actually fails at `k = 1` is (a) the **bound**, which is `O(1)` and therefore establishes
  nothing, and (b) **absolute convergence** — the identity delivers only `lim_N Σ_{|n|≤N}f(n)`, a
  symmetric/principal-value sum, which for `f = 1/z` is `0` while `Σ_{n≥1}1/n` diverges. The record
  states the weaker, true version.
- **D-4 (cosmetic) — §6 writes the E1 quasi-period as `P = 2πi`.** Under `DESIGN.md`'s
  `f(z + iP) = λf(z)`, `P` is a real height and equals `2π`.
- **Not a disagreement, but worth recording:** `cos φ ≥ 1 − 2φ/π` (L6) and `sin ψ ≥ 2ψ/π` (L3,
  Jordan) are **the same inequality** under `φ = π/2 − ψ`, verified identically on 5001 sample points.
  Two of the eight catalogued lemmas share one side condition, and the engine should discharge them
  through one predicate.

### 10.2 Schema gaps

Reported, not worked around. Proposed fields appear inline above marked `⚠ PROPOSED`; nothing here
changes a v1 field's meaning.

- **SG-1 — the unknown can live inside `S`, and Pass 5 cannot say so.** `DESIGN.md` §4's solve is
  `T·(1 + Σⱼcⱼ) + ΣᵢVᵢ + ΣₗFₗ = S`. In the whole G tier there is **no `target` piece at all**: every
  side is `vanish`, the left-hand side is identically `0`, and the target appears among the residues
  that make up `S`. Pass 5 as written computes `T = (0 − 0 − 0)/1 = 0`. The fix is small and additive:
  `residueSelection.targetTerms` (a predicate selecting the poles whose residues constitute the
  target) and `residueSelection.targetWeight` (`1` for two-sided sums, `2` for one-sided sums of an
  even summand), generalising the solve to
  `T·(1 + Σⱼcⱼ − 2πi·w) + ΣVᵢ + ΣFₗ = 2πi Σ_known n·Res`. **This is the largest gap in the file**, and
  it is worth noting that the `targetWeight` field is not bureaucracy: it is exactly the halving
  bookkeeping that research/03 §8 names as the tier's commonest error, promoted from a habit into a
  value the solve depends on.

  > **BUILT (M5.6b), with two corrections to the above.** The weight is a per-entry `weight` field
  > *inside* `targetTerms`, not a sibling `targetWeight` — the JSONC below and the paragraph here
  > both name a field that does not exist; `DESIGN.md` §5 always had it nested, and nested is also
  > strictly more expressive. And **the one-equation generalisation cannot be built**: its
  > coefficient adds a dimensionless `1 + Σⱼcⱼ` (a keyhole's is `1 − e^{2πiα}`, whose coefficients
  > are `ℚ(i)(√d)`) to a `2πi·w` carrying π, and neither the exponential basis nor ℚ(i)(π) holds
  > both — this app's standing position that neither ring contains the other. It is never needed:
  > `a = 0` is tier G's definition, not an accident, and `w` is absent everywhere else. So the solve
  > is a third ROUTE (`families/solveResidueTerm.ts`), `0 = 2πi[w·T + π·ρ]` gives `T/π = −ρ/w`, and
  > the mixed case is refused by name. The weight is DERIVED from the target's declared range and
  > checked against the record; halving additionally requires the cofactor to be even and its `n = 0`
  > term to vanish, both decided exactly over ℚ(i).
- **SG-2 — no role for a piece with an exactly-known, externally-imported value.** E3's top side is
  `√π e^{−b²/4}` and F2's return ray is `e^{iπ/(2n)}Γ(1+1/n)`. Both are exact, neither is a residue,
  neither vanishes, and neither is proved by the contour: `Γ(1/2)` comes from polar coordinates and
  `Γ(1+1/n)` from the real substitution `u = tⁿ`. Under v1 these are `role: "free"`, which Pass 3
  prices at `≈` via quadrature — so a perfectly exact argument would be capped at `≈` by the one
  step that is *most* certain. Proposed: `pieces[].knownValue: { expr, method, rigor }`, with
  `method` carrying provenance so the derivation can say **"imported, not derived here"**. Without
  it, honest labelling and the correct verdict are in direct conflict for two of the eight entries.
- **SG-3 — `contour.orientation` is a constant, but E3's rectangle flips with `sign(b)`.** The
  height `b/2` is negative for `b < 0` and the same vertex order is then clockwise. Worked around
  here by an evenness reduction to `b ≥ 0` declared in `parameters[].constraints` — legitimate, but
  only because `cos` happens to be even. A parameter-dependent orientation (or a documented rule that
  templates must be reduced to a canonical parameter range at load time) is the real answer.
- **SG-4 — no convergence class on `target`.** F2's target converges conditionally
  (`∫₀^∞|cos x²|dx = ∞`), B2 is the same, and research/03 §3 trap (ii) says the label must record it.
  `principalValue?: boolean` exists but is a different notion. Proposed:
  `target.convergenceClass: "absolute" | "conditional" | "principalValue" | "symmetricSum"`, feeding
  `Verdict.restrictions` — which is also where `k = 1`'s symmetric sums (D-3) would land.
- **SG-5 — the G tier's `target` is not an integral.** `target.variable` is typed `"x" | "theta"`,
  the field is named `integrand`, and `RealIntegral` in `DESIGN.md` §2.3 has the same shape. A sum
  needs `kind: "sum"`, an integer index, and a `summand`. Relatedly, `contour.template` has no
  `square`, and `limitParams[].to` has no way to say **"through half-integers only"** — which is not
  cosmetic, because "the square may be taken at any radius" is one of the tier's two real traps and
  the constraint that refutes it is currently unrepresentable.
- **SG-6 — `hypotheses[].onFail` has only `refuse` and `warn`.** G1 and G3 *violate* the stated
  hypothesis ("no pole of `f` at an integer") and are nonetheless completely rigorous, because a
  different and stronger argument applies: merge the colliding poles. `refuse` is wrong (the answer
  is correct), `warn` is wrong (nothing is uncertain). Proposed: `onFail: "escalate"` with
  `escalateTo` naming the alternate handling — here `"merge-collision"`, whose own preconditions
  (finite merged order; *not* an essential singularity) are then checkable in the normal way.
  **Direct answer to the brief's question:** the v1 schema **cannot** express the collision. With
  `escalateTo` plus `residueSelection.collisions[]` (order arithmetic, the merged residue, and the
  mandated Laurent-coefficient method for `m ≥ 3`) it can, and the addition is purely additive.

### 10.3 Not verified

- The `invariants[]` blocks marked with a `check` but no `verifiedBy` are *specifications for tests*,
  not results: `F1.closing-the-other-way`, `G2.csc-companion`, `G3.csc-companion-of-G2`, and
  `F2.cos-equals-sin-only-at-n-2`'s `differ` half were reasoned but not run.
- `ζ(4) = π⁴/90` is asserted from the measured `c₁ = −π⁴/45` coefficient of `π cot(πz)/z²`, which is
  the same number as `Res₀[π cot(πz)/z⁴]`, but the `ζ(4)` sum itself was not summed independently.
- `G2.a-to-zero-recovers-G1` was checked by evaluating the closed form at `a = 10⁻⁴`, not by a
  rigorous confluence argument.
- No entry's **exact** (`ℚ(i)`/RUR) path was exercised — every number above is float64. The `=`
  labels in the records are claims about what the engine *will* be able to discharge symbolically,
  and remain `?` until the exact residue and exact ML machinery of M2/M3 exists.
