# Gallery tiers A and B — `Family` records

> Content specification for `apps/contour-integration`. Ten fully-specified `Family` records
> (DESIGN.md §5) covering research [03 §13](../research/03-method-taxonomy.md)'s tiers **A**
> (§1 unit circle, §2 large semicircle) and **B** (§3 Fourier / Jordan). The schema is
> [DESIGN.md §5](../DESIGN.md); the algorithm that consumes it is [DESIGN.md §4](../DESIGN.md);
> the rigor ladder is [PLAN.md §3](../PLAN.md).
>
> Everything here was **re-verified from scratch** — see [§0.2](#02-verification-status).
> Schema gaps found while writing are in [§3](#3-schema-gaps-found-while-writing-these), and they
> are findings, not complaints.

---

## 0. What tiers A and B establish

Tiers A and B exist to prove that **one mechanism — closed-contour identity × one vanishing lemma,
with every piece carrying a `role` — reaches a real answer without any family-specific code**, and
to install the four engine primitives everything later depends on: exact residues in
`ℚ(i)[z]/⟨Q⟩`, exact-ℚ ML/Jordan bounds, exact pole-order via squarefree decomposition, and a
half-plane selection that refuses rather than guesses. Tier A is the cheapest possible `=`: §1's
unit circle needs *no* vanishing lemma at all (the contour is already closed), so A1–A4 isolate the
residue machinery with nothing else in the way, while A5–A7 introduce exactly one auxiliary piece
and one lemma. Tier B then changes only one thing — the integrand acquires `e^{iaz}` — and that
single change exposes the two facts a plotter can never show you: that the *side* you close on is
determined by the sign of `a` and not by taste, and that a bound can fail by converging to
something finite and nonzero rather than by blowing up. Per-entry capability, following research 03
§13's last column:

| id | adds | first use of |
|---|---|---|
| **A1** | unit-circle substitution; Schur–Cohn pole test | `algebraic:noUnitCircleRoot`; reciprocal-root pairing; a closed form with a `sgn` in it |
| **A2** | parameter-dependent pole selection (`\|a\|≶1`) | `residueSelection` computed rather than declared; a positivity post-check |
| **A3** | `cos nθ ↦ (zⁿ+z⁻ⁿ)/2`; order-`n` pole at `z = 0` | Yun squarefree decomposition; a pole invisible in the real integrand |
| **A4** | entire integrand; the CIF path | empty singular set with a nonzero answer; residue ≡ Taylor coefficient |
| **A5** | L2; order-2 residue | exact-ℚ `mlRational`; the derived degree condition; `P/Q′` refusing at a repeated root |
| **A6** | irrational algebraic poles | `P·(Q′)⁻¹ mod Q`; the half-plane ladder (rung 2); `Σ_all Res = 0` as a cross-check |
| **A7** | order-3 residue ⇒ series route | truncated Laurent over `ℚ(i)`; the `1/(m−1)!` that formula (4) never introduces |
| **B1** | Jordan; sign-of-`a` branch | `symbolic:jordanBound`; an arc bound that *diverges*, from the same code path |
| **B2** | Jordan strictly beyond L2; conditional convergence | a bound with a finite nonzero limit; convergence of the target tracked separately |
| **B3** | complex residues at algebraic poles | algebraic × transcendental residue factors; `=` on the form, `≈` on the decimal |

### 0.1 One structural fact worth reading before A1–A3

Substituting `cos θ = (z+z⁻¹)/2` into a **real** rational `R(cos θ, sin θ)` and clearing powers of
`z` always produces a **self-inversive (palindromic)** denominator: `b z² + 2a z + b` (A1),
`a z² − (1+a²) z + a` (A2), `2z² − 5z + 2` (A3). Its roots therefore come in pairs `{r, 1/r}`, so
exactly one member of each pair is inside `|z| = 1` — *unless* the pair is unimodular, in which case
both are **on** the contour and the integral genuinely diverges. That single fact supplies §1's only
hypothesis (an exact Schur–Cohn test for a unimodular root, reusing QD's interval kernel) and the
shape of its commonest error (taking the wrong member of the pair). A1, A2 and A3 are the same
statement at three difficulty settings.

A second thread runs through A1 → A3 → A4: **what the Jacobian `dθ = dz/(iz)` does to the singular
set.** In A1 the `z⁻¹` from `cos θ` cancels it and `z = 0` is *removable*. In A3 it survives as a
pole of order exactly `n`. In A4 it is the *only* pole there is. The engine's pole detector runs on
the **contour integrand**, never on the integrand as posed, and these three entries are the
regression test for that distinction.

### 0.2 Verification status

Every closed form below was recomputed independently of research 03 and of this document's own
residue algebra, **twice, by two disjoint quadrature families**:

- pass 1 — periodic trapezoid (`N` up to 2×10⁵) for §1; composite Gauss–Legendre under `x = tan t`
  for §2; oscillatory panel sums between consecutive zeros of the oscillating factor plus repeated
  averaging (van Wijngaarden) for §3;
- pass 2 — periodic midpoint; exp–sinh (double exponential) on `(0,∞)`; Clenshaw–Curtis panels with
  a different panel count and averaging depth.

Every value agreed with research 03 to between `0` and `2.6 × 10⁻¹⁴` relative — **no disagreements**
(see §3.0 for the one place research 03's *table* is under-constrained, which is not an error in its
§1 text). Each residue was additionally checked against a numerical contour integral on a small
circle about the pole, and `2πi Σ n·Res` reproduced the quadrature value in all ten cases.

### 0.3 Conventions used in these records

- **`hypotheses[].check`** uses the namespaces `algebraic:` (exact over `ℚ`/`ℚ(i)` — Sturm,
  Schur–Cohn, resultants, degrees), `structural:` (a property of the AST or of the detected singular
  set), `numeric:` (float64, and therefore never able to earn better than `≈`).
  **`vanishingLemmas[].discharge`** uses `symbolic:` / `numeric:`, matching research 03 §15. The two
  namespace families are not reconciled by the design docs — gap **G6**.
- **Geometry `Scalar`s** are written as `@cas/expr` source strings; the loader lifts a string `s` to
  `{ expr: parse(s) }` and leaves numbers alone (research 03 §15 writes `"radius": "R"`; DESIGN §2.1's
  `Scalar` has no string arm — gap **G7**).
- `branch` is **omitted with an explicit note** in all ten records: every tier-A/B integrand is
  single-valued (rational, or rational × `exp`), so there is no branch point, no cut, and no
  `crossingPhase`. A silently absent `branch` and a deliberately absent one must not look alike.
- `side` is absent on every piece for the same reason (`side` pins an argument limit *at a cut*;
  there are no cuts here), and `factor` is absent on every piece because no tier-A/B contour has a
  `reproduces` piece — `1 + Σⱼ cⱼ = 1` in DESIGN §4's Pass 5 for all ten, so the famous degenerate
  divide-by-zero cannot arise until tier D.
- `rigorIfDischarged: "="` follows research 03 §15. It is **not** what DESIGN §4's Pass-3 table says
  (`≤`); see gap **G2** — this is a real conflict in the design docs and it changes every label in
  this file.

---

## 1. Tier A

### A1 — `circle-linear-cos`

The cheapest `=` in the engine, and the entry that teaches **which root is inside**. The two poles
are a reciprocal pair, so exactly one is enclosed; but *which* one flips with the sign of `a`, and
the textbook closed form `2π/√(a²−b²)` is silently wrong for `a < −|b|` — where the residue
machinery, asked properly, still returns the right (negative) answer. That split is the whole point:
the hypothesis that keeps the contour legal (`a² ≠ b²`, no unimodular root) is strictly weaker than
the hypothesis the printed closed form needs (`a > |b|`), and an engine that conflates them prints a
positive number for a negative integral. Its neighbour A2 varies the same structure with a
parameter; A1 varies it with a *sign*.

```jsonc
{
  "id": "circle-linear-cos",
  "title": "∫₀^{2π} dθ/(a + b cos θ) — the reciprocal-root pair",
  "taxonomySection": "1",
  "tier": "A",

  "target": {
    "variable": "theta",
    "lower": "0", "upper": "2*pi",
    "integrand": "1/(a + b*cos(theta))",
    "symbols": {
      "a": { "kind": "realParam" },
      "b": { "kind": "realParam" }
    },
    // NOTE: DESIGN §5's `target` omits `substitution`, which DESIGN §2.3's RealIntegral has. Gap G8.
    "substitution": {
      "to": "z",
      "map": "exp(i*theta)",          // θ: 0→2π traverses |z| = 1 once, positively
      "inverse": "-i*log(z)",
      "jacobian": "1/(i*z)"           // dθ = dz/(iz); cos θ = (z + 1/z)/2.  `jacobian` is NOT in
                                      // the v1 schema — gap G9. It is load-bearing for A1/A3/A4.
    }
    // principalValue: absent — the integrand is continuous on [0,2π] once the hypotheses hold.
  },

  "parameters": [
    { "name": "a", "domain": "real", "constraints": ["abs(a) > abs(b)"] },
    { "name": "b", "domain": "real", "constraints": ["abs(b) < abs(a)"] }
  ],

  "hypotheses": [
    { "id": "no-pole-on-circle",
      "statement": "b z² + 2a z + b has no root on |z| = 1  ⟺  |a| > |b|  ⟺  a + b cos θ ≠ 0 for all θ",
      // the denominator is palindromic, so its roots pair as {r, 1/r}; a unimodular root means BOTH
      // are on the contour. Exact interval Schur–Cohn, reusing the QD algebra kernel.
      "check": "algebraic:noUnitCircleRoot(b*z^2 + 2*a*z + b)",
      "onFail": "refuse" },

    { "id": "nondegenerate-quadratic",
      "statement": "b ≠ 0, so the z-denominator really is quadratic (b = 0 degenerates to ∫dθ/a = 2π/a)",
      "check": "algebraic:degree(b*z^2 + 2*a*z + b, z) == 2",
      "onFail": "warn" },

    { "id": "enclosed-root-verified",
      "statement": "the root selected as enclosed satisfies |z| < 1 — tested, never inferred from the ± branch",
      "check": "algebraic:insideUnitCircle(selectedRoot)",
      "onFail": "refuse" }
  ],

  // branch: DELIBERATELY OMITTED. The integrand is a rational function of z; single-valued;
  // no branch point, no cut, no crossing phase. This absence is a decision, not an oversight.

  "contour": {
    "template": "circle",
    "limitParams": [],                 // nothing tends to a limit: the contour is already closed
    "pieces": [
      { "id": "unitCircle",
        "name": "the unit circle |z| = 1",
        "geom": { "kind": "arc",
                  "center": { "kind": "cart", "x": 0, "y": 0 },
                  "radius": 1, "theta0": "0", "theta1": "2*pi" },
        "role": "target",              // §1 is the only family whose pieces are ALL `target`
        "colour": 0 }
        // lemma: n/a (no vanish piece).  factor: n/a (no reproduces piece).
        // side:  n/a (no cut to pin an argument limit against).
    ],
    "orientation": "ccw",
    "encloses": "the unique root of b z² + 2a z + b with |z| < 1"
  },

  "vanishingLemmas": [],
  // EMPTY, and legitimately so: the contour is closed with no auxiliary piece. §1 is the only
  // family in the taxonomy with an empty list (research 03 §1), which is exactly why it is A1.
  // DESIGN §5 invariant 1 constrains `vanish` pieces only, so an empty list is well-formed.

  "residueSelection": { "rule": "inside" },

  "closedForm": {
    // sign-general over the whole legal domain |a| > |b|:
    "expr": "2*pi*sign(a)/sqrt(a^2 - b^2)",
    // the textbook form, valid ONLY on a > |b| > 0. See traps.textbook-form-drops-sign.
    "simplified": "2*pi/sqrt(a^2 - b^2)"
  },

  "rigor": { "policy": "min",
             "inputs": ["hypotheses.*", "residues.*.rigor", "windingNumbers.*", "contour.closed"] },

  "traps": [
    { "id": "wrong-root-inside",
      "detect": "algebraic:insideUnitCircle(selectedRoot) == false",
      "message": "z₊z₋ = b/b = 1, so the two poles are a reciprocal pair and exactly one lies inside |z| = 1 — but which one is NOT always the +√ branch. For a > 0 it is z₊ = (−a+√(a²−b²))/b; for a < 0 it is z₋. In general the enclosed root is (−a + sgn(a)√(a²−b²))/b. Choosing by the sign in front of the radical instead of by testing |z| < 1 flips the residue from −i·sgn(a)/√(a²−b²) to its negative and returns −2π/√(a²−b²): the right magnitude with the wrong sign, which no magnitude check will catch." },

    { "id": "textbook-form-drops-sign",
      "detect": "numeric:a < 0",
      "message": "2π/√(a²−b²) is positive for every legal (a,b), but for a < −|b| the integrand a + b cos θ is negative everywhere and so is the integral: at a = −2, b = 1 the true value is −2π/√3 = −3.62759872846844. The residue computation is NOT wrong here — it selects z₋, gets Res = +i/√3, and returns −2π/√3 correctly. Only the *printed closed form* is wrong, because a² > b² (the legality hypothesis) is strictly weaker than a > |b| > 0 (the closed form's hypothesis). A restriction that travels with a certificate but not with a formula is how a true claim becomes a false one." },

    { "id": "pole-on-circle",
      "detect": "hypotheses.no-pole-on-circle == false",
      "message": "Two distinct failures wear the same face. |a| = |b| collides the pair at z = ∓1, a DOUBLE pole on the contour, and 2π/√0 = ∞ is not a limit. |a| < |b| makes a²−b² negative, and since z₊z₋ = 1 with z₋ = conj(z₊), BOTH poles land on |z| = 1: at a = 1, b = 2 they sit at −1/2 ± (√3/2)i with modulus exactly 1, the integrand blows up at θ = arccos(−a/b), and truncating at ε gives 1.53 at ε = 10⁻² and −79.2 at ε = 10⁻⁴ — no limit exists. Refuse; do not return √ of a negative." },

    { "id": "jacobian-pole-is-removable",
      "detect": "structural:jacobianIntroducesPoleAt(0) && structural:polesOf(contourIntegrand) excludes 0",
      "message": "dθ = dz/(iz) looks as though it makes z = 0 a pole, and in A3 and A4 it does. Here it does not: clearing the z⁻¹ inside cos θ multiplies the numerator by z, which cancels the Jacobian's z exactly, leaving f(z) = −2i/(b z² + 2a z + b) with f(0) = −2i/b finite. The engine must decide this by gcd-cancelling num against den over ℚ(i) (DESIGN §6.3 step 1) and reporting z = 0 as a *named removable singularity*, not by failing to look. Contrast A3 (order n) and A4 (the only pole present)." }
  ],

  "golden": [
    { "params": { "a": 2, "b": 1 },
      "value": "2*pi/sqrt(3)", "numeric": 3.6275987284684357, "verifiedTo": 1e-14 },
    { "params": { "a": 5, "b": 3 },
      "value": "pi/2", "numeric": 1.5707963267948966, "verifiedTo": 1e-14 },
    { "params": { "a": 2, "b": -1 },          // b < 0: the enclosed root moves, the value does not
      "value": "2*pi/sqrt(3)", "numeric": 3.6275987284684357, "verifiedTo": 1e-14 },
    { "params": { "a": -2, "b": 1 },          // the sign case — the fixture that guards the trap
      "value": "-2*pi/sqrt(3)", "numeric": -3.6275987284684357, "verifiedTo": 1e-14 },
    { "params": { "a": 10, "b": -9.5 },       // a pole near the circle: legal, stiff, exact test required
      "value": "2*pi/sqrt(9.75)", "numeric": 2.0122297265078330, "verifiedTo": 1e-14 }
  ]
}
```

**Residues (recomputed, checked against a circle quadrature at `r = 10⁻⁴`).** With
`f(z) = −2i/(b z² + 2a z + b)` and `a = 2, b = 1`: poles `z₊ = −2+√3 = −0.267949192431` (inside,
`n(γ,z₊) = +1`) and `z₋ = −2−√3 = −3.73205080757` (outside, `n = 0`), product exactly `1`; both
simple. `Res(f, z₊) = −2i/(b(z₊−z₋)) = −i/√(a²−b²) = −0.577350269189626 i`, numeric
`−0.577350269189624 i`. `2πi · Res = 3.6275987284684361` vs. quadrature `3.6275987284684357`.
`z = 0` is **removable**, not a pole.

---

### A2 — `circle-poisson`

A1's structure with the sign replaced by a **parameter-dependent switch**: the poles `z = a` and
`z = 1/a` are a reciprocal pair whose membership of the unit disc trades places at `|a| = 1`, and
the closed form is `2π/(1−a²)` on one side and `2π/(a²−1)` on the other. Unlike A1, this entry can
be *caught*: the integrand is `|1 − a e^{iθ}|² > 0`, so a negative result is a proof that the wrong
pole was enclosed, and that positivity test costs one comparison. A2 is therefore the entry that
demonstrates `residueSelection` must be **computed** — the two branches share a single tidy closed
form `2π/|1−a²|` that conceals the fact that the enclosed pole is not the same point.

```jsonc
{
  "id": "circle-poisson",
  "title": "∫₀^{2π} dθ/(1 + a² − 2a cos θ) — the Poisson kernel and its |a| ≶ 1 switch",
  "taxonomySection": "1",
  "tier": "A",

  "target": {
    "variable": "theta",
    "lower": "0", "upper": "2*pi",
    "integrand": "1/(1 + a^2 - 2*a*cos(theta))",
    "symbols": { "a": { "kind": "realParam" } },
    "substitution": { "to": "z", "map": "exp(i*theta)", "inverse": "-i*log(z)",
                      "jacobian": "1/(i*z)" }
    // 1 + a² − 2a cos θ = |1 − a e^{iθ}|² = −(az−1)(z−a)/z  ⇒  f(z) = i/((a z − 1)(z − a))
  },

  "parameters": [
    { "name": "a", "domain": "real", "constraints": ["abs(a) != 1"] }
  ],

  "hypotheses": [
    { "id": "no-pole-on-circle",
      "statement": "a z² − (1+a²) z + a has no unimodular root  ⟺  |a| ≠ 1",
      "check": "algebraic:noUnitCircleRoot(a*z^2 - (1 + a^2)*z + a)",
      "onFail": "refuse" },

    { "id": "selection-is-computed",
      "statement": "the enclosed pole is determined by testing |z| < 1 on each detected pole, not by a rule keyed to the formula",
      "check": "structural:residueSelectionIsComputed(contour, poles)",
      "onFail": "refuse" },

    { "id": "positivity",
      "statement": "1 + a² − 2a cos θ = |1 − a e^{iθ}|² ≥ (1−|a|)² > 0, so the value must be > 0",
      // a post-condition on the ANSWER, executed after SOLVE. Cheap, and it mechanically catches
      // the pole-selection error below.
      "check": "numeric:value > 0",
      "onFail": "refuse" }
  ],

  // branch: DELIBERATELY OMITTED — rational in z, single-valued.

  "contour": {
    "template": "circle",
    "limitParams": [],
    "pieces": [
      { "id": "unitCircle", "name": "the unit circle |z| = 1",
        "geom": { "kind": "arc", "center": { "kind": "cart", "x": 0, "y": 0 },
                  "radius": 1, "theta0": "0", "theta1": "2*pi" },
        "role": "target", "colour": 0 }
    ],
    "orientation": "ccw",
    "encloses": "z = a when |a| < 1; z = 1/a when |a| > 1; z = 0 (from the Jacobian) when a = 0"
  },

  "vanishingLemmas": [],

  "residueSelection": { "rule": "inside" },

  "closedForm": {
    "expr": "2*pi/abs(1 - a^2)",
    "simplified": "2*pi/(1 - a^2)"      // valid only on |a| < 1 — see traps.branch-hidden-by-closed-form
  },

  "rigor": { "policy": "min",
             "inputs": ["hypotheses.*", "residues.*.rigor", "windingNumbers.*", "contour.closed"] },

  "traps": [
    { "id": "pole-selection-switch",
      "detect": "numeric:abs(selectedPole) > 1",
      "message": "z = a and z = 1/a are a reciprocal pair. For |a| < 1 the enclosed pole is a, with Res = i/(a²−1); for |a| > 1 it is 1/a, with Res = i/(1−a²). These differ by a SIGN, not by a relabelling, so taking z = a unconditionally returns 2π/(1−a²), which at a = 2 is −2π/3 = −2.0944 — negative, for an integrand that is a squared modulus. The switch is at |a| = 1 and nothing in the algebra announces it; only testing |z| < 1 on each detected pole does." },

    { "id": "positivity-violated",
      "detect": "numeric:value < 0",
      "message": "1 + a² − 2a cos θ = |1 − a e^{iθ}|², so the integral is positive for every legal a. A negative result is not a small error to be patched with a sign: it is a certificate that a pole outside the contour was summed, or that one inside was missed. Refuse and report which pole carried the wrong winding number." },

    { "id": "modulus-one-refusal",
      "detect": "hypotheses.no-pole-on-circle == false",
      "message": "At |a| = 1 the two poles collide ON the contour at z = a = ±1, and 1 + a² − 2a cos θ = 2 ∓ 2cos θ vanishes to second order there. The integral diverges like 2/ε: truncating the θ-range at ε gives 2.00×10³ at ε = 10⁻³ and 1.95×10⁵ at ε = 10⁻⁵. 2π/(1−a²) = ∞ is a division by zero, not a limit, and must not be rendered as one." },

    { "id": "branch-hidden-by-closed-form",
      "detect": "structural:closedFormIsSingleExpression && residueSelection.dependsOnParameters",
      "message": "2π/|1−a²| is one continuous-looking expression covering both sides of |a| = 1, which is precisely why it is dangerous to treat the closed form as the family. The DERIVATION is discontinuous there — a different point is enclosed — even though the VALUE is not. The record must carry the selection rule; a family reduced to its closed form has thrown away the only thing that could have caught the error." },

    { "id": "pole-escapes-to-infinity",
      "detect": "numeric:a == 0",
      "message": "At a = 0 the pole z = 1/a leaves the finite plane and the z-denominator drops to degree 1: f(z) = −i/z, one simple pole at the origin, Res = −i, value 2π. The answer is right and the pole COUNT changed. An engine that caches 'this family has two poles' from a previous parameter value reports a phantom." }
  ],

  "golden": [
    { "params": { "a": 0.5 },  "value": "8*pi/3",     "numeric": 8.3775804095727811, "verifiedTo": 1e-14 },
    { "params": { "a": -0.5 }, "value": "8*pi/3",     "numeric": 8.3775804095727811, "verifiedTo": 1e-14 },
    { "params": { "a": 2 },    "value": "2*pi/3",     "numeric": 2.0943951023931953, "verifiedTo": 1e-14 },
    { "params": { "a": -3 },   "value": "pi/4",       "numeric": 0.78539816339744828, "verifiedTo": 1e-13 },
    { "params": { "a": 0 },    "value": "2*pi",       "numeric": 6.2831853071795862, "verifiedTo": 1e-15 },
    { "params": { "a": 0.9 },  "value": "2*pi/0.19",  "numeric": 33.069396353576778, "verifiedTo": 1e-14 }
  ]
}
```

**Residues.** `f(z) = i/((az−1)(z−a))`. At `a = 1/2`: enclosed pole `z = 1/2`, simple,
`Res = i/(a²−1) = −1.33333333333333 i` (numeric `−1.33333333333333 i`), `2πi·Res = 8.3775804095727811`.
At `a = 2`: enclosed pole `z = 1/2 = 1/a`, simple, `Res = i/(1−a²) = −0.333333333333333 i`
(numeric `−0.333333333333333 i`), `2πi·Res = 2.0943951023931953`. Both match quadrature exactly.

---

### A3 — `circle-cos-n-theta`

The entry that makes the **pole the substitution manufactures at the origin** impossible to miss.
`cos 2θ = (z² + z⁻²)/2` contributes `z⁻²`, the Jacobian contributes `z⁻¹`, clearing the denominator
returns one `z`, and the net is a pole of order exactly `n = 2` at `z = 0` — a point at which the
*real* integrand `cos 2θ/(5 − 4cos θ)` is perfectly smooth for every θ. Unlike A1 (where the
Jacobian's pole cancels) the pole is real, and unlike A5 (where `P/Q′` at least refuses loudly) the
only way to get it wrong is to **not look at `z = 0` at all**, which returns `17π/12 ≈ 4.4506`
instead of `π/6 ≈ 0.5236`. Exposing `n` as a parameter makes "the manufactured order equals the
harmonic index" a testable statement rather than an anecdote.

```jsonc
{
  "id": "circle-cos-n-theta",
  "title": "∫₀^{2π} cos nθ/(5 − 4 cos θ) dθ — the order-n pole the substitution manufactures at z = 0",
  "taxonomySection": "1",
  "tier": "A",

  "target": {
    "variable": "theta",
    "lower": "0", "upper": "2*pi",
    "integrand": "cos(n*theta)/(5 - 4*cos(theta))",
    "symbols": { "n": { "kind": "intParam" } },
    "substitution": { "to": "z", "map": "exp(i*theta)", "inverse": "-i*log(z)",
                      "jacobian": "1/(i*z)" }
    // cos nθ = (zⁿ + z⁻ⁿ)/2 ; 5 − 4cos θ = −(2z−1)(z−2)/z
    // ⇒ f(z) = (i/2)·(z^{2n} + 1) / ( z^n (2z − 1)(z − 2) )        [n = 2 is gallery entry A3]
  },

  "parameters": [
    { "name": "n", "domain": "integer", "constraints": ["n >= 0"] }
  ],

  "hypotheses": [
    { "id": "no-pole-on-circle",
      "statement": "2z² − 5z + 2 has no unimodular root (its roots are 1/2 and 2, a reciprocal pair)",
      "check": "algebraic:noUnitCircleRoot(2*z^2 - 5*z + 2)",
      "onFail": "refuse" },

    { "id": "origin-order-known-exactly",
      "statement": "the pole at z = 0 has order exactly n, from Yun squarefree decomposition of the z-denominator — never inferred from a cluster of floating roots",
      // DESIGN §6.3 step 2: squarefree-decompose FIRST, so multiplicity is exact.
      "check": "algebraic:squarefreeMultiplicityAt(denom(f), 0) == n",
      "onFail": "refuse" },

    { "id": "origin-in-the-enclosed-set",
      "statement": "z = 0 appears in the enclosed singular set whenever n ≥ 1",
      "check": "structural:enclosedPoles contains 0 || n == 0",
      "onFail": "refuse" },

    { "id": "shortcut-inapplicable-at-origin",
      "statement": "for n ≥ 2, Q′(0) = 0 so the quotient shortcut P/Q′ is unavailable at z = 0 and must refuse rather than divide",
      "check": "algebraic:derivative(denom(f))(0) != 0 || n < 2",
      "onFail": "warn" }
  ],

  // branch: DELIBERATELY OMITTED — rational in z.

  "contour": {
    "template": "circle",
    "limitParams": [],
    "pieces": [
      { "id": "unitCircle", "name": "the unit circle |z| = 1",
        "geom": { "kind": "arc", "center": { "kind": "cart", "x": 0, "y": 0 },
                  "radius": 1, "theta0": "0", "theta1": "2*pi" },
        "role": "target", "colour": 0 }
    ],
    "orientation": "ccw",
    "encloses": "z = 1/2 (simple) and z = 0 (order n). z = 2 is OUTSIDE: n(γ,2) = 0."
  },

  "vanishingLemmas": [],

  "residueSelection": { "rule": "inside" },

  "closedForm": {
    "expr": "(2*pi/3)*2^(-n)",
    "simplified": "pi/6"                // at n = 2, the gallery value
  },

  "rigor": { "policy": "min",
             "inputs": ["hypotheses.*", "residues.*.rigor", "windingNumbers.*", "contour.closed"] },

  "traps": [
    { "id": "forget-origin-pole",
      "detect": "structural:poleOrderAt(0) > 0 && structural:enclosedPoles excludes 0",
      "message": "The substitution, not the integrand, creates this pole: cos 2θ = (z²+z⁻²)/2 supplies z⁻², dθ = dz/(iz) supplies z⁻¹, clearing 5 − 4cos θ returns z, and the order is exactly n. Nothing in cos 2θ/(5 − 4cos θ) hints at it — the real integrand is smooth at every θ. Summing only Res(f,1/2) = −17i/24 returns 2πi(−17i/24) = 17π/12 = 4.45058959258554, against the true π/6 = 0.523598775598299: a factor of 8.5. This is research 03 §1's 'single commonest error', and the fix is structural — run pole detection on the CONTOUR integrand, whose denominator carries zⁿ, not on the integrand as posed." },

    { "id": "origin-treated-as-simple",
      "detect": "structural:poleOrderUsedAt(0) < algebraic:squarefreeMultiplicityAt(denom(f), 0)",
      "message": "lim_{z→0} z·f(z) = 0 at an order-2 pole, so the simple-pole formula reports Res(f,0) = 0 — a plausible number that silently discards the entire c₋₁ = 5i/8, and lands on the same wrong 17π/12 as forgetting the pole outright. The quotient shortcut is safer: Q = 2z⁴ − 5z³ + 2z² has Q′(0) = 0 while P(0) = i/2 ≠ 0, so P/Q′ divides by zero and REFUSES. A residue of exactly 0 at a pole the engine has just certified to be order 2 is a contradiction, not a result." },

    { "id": "reciprocal-pair-wrong-member",
      "detect": "numeric:abs(selectedPole) > 1",
      "message": "2z² − 5z + 2 is palindromic, so its roots 1/2 and 2 are a reciprocal pair and exactly one is enclosed. Including z = 2 (Res = +17i/24) as well gives Σ = 5i/8 and a value of −5π/4 — negative, and unlike A2 the integrand cos 2θ/(5−4cos θ) does take negative values, so no positivity check will save you here. The winding number n(γ,2) = 0 is the only thing that does, which is why DESIGN §4 Pass 2 reports winding number and enclosed-pole count as SEPARATE rows." }
  ],

  "golden": [
    { "params": { "n": 2 }, "value": "pi/6",    "numeric": 0.52359877559829882, "verifiedTo": 1e-14 },
    { "params": { "n": 0 }, "value": "2*pi/3",  "numeric": 2.0943951023931953, "verifiedTo": 1e-14 },
    { "params": { "n": 1 }, "value": "pi/3",    "numeric": 1.0471975511965976, "verifiedTo": 1e-14 },
    { "params": { "n": 3 }, "value": "pi/12",   "numeric": 0.26179938779914941, "verifiedTo": 1e-14 },
    { "params": { "n": 4 }, "value": "pi/24",   "numeric": 0.13089969389957470, "verifiedTo": 1e-14 }
  ]
}
```

**Residues at `n = 2`.** `f(z) = (i/2)(z⁴+1)/(z²(2z−1)(z−2))`.

| pole | order | `n(γ,·)` | `Res` | numeric check |
|---|---|---|---|---|
| `z = 1/2` | 1 | `+1` | `−17i/24 = −0.708333333333333 i` | `−0.708333333333333 i` |
| `z = 0`   | 2 | `+1` | `g′(0) = 5i/8 = 0.625 i`, `g = (i/2)(z⁴+1)/(2z²−5z+2)` | `0.624999999999944 i` |
| `z = 2`   | 1 | `0`  | `+17i/24` — **not summed** | — |

`Σ = −i/12`; `2πi·Σ = 0.523598775598299` vs. quadrature `0.523598775598299`. At `n = 0` the
origin is not a pole at all, which is the base case of "order = `n`".

---

### A4 — `circle-cif-taylor`

The entry where **there is no residue and the answer is still `2π`.** `g(z) = e^z` is entire: the
singular set of the integrand *as posed* is empty, the engine's pole finder correctly returns
nothing, and Cauchy's theorem correctly reports `∮ g dz = 0` — all true, all irrelevant. What is
being integrated is `g(z)·(dz/(iz))`, and the Jacobian supplies the only pole there is; its residue
is `g(0)/i`, i.e. the `n = 0` Taylor coefficient, i.e. the Cauchy integral formula, i.e. the
mean-value property of harmonic functions. Exposing the index `n` turns the record into CIF for
derivatives: `Res = cₙ = g⁽ⁿ⁾(0)/n!`, verified against `2π/n!` for `n = 0…5`. What this teaches is
the one fact A1 and A3 have been circling: **`residueSelection` operates on the contour integrand,
and its singular set differs from the posed integrand's whenever the substitution has a Jacobian.**

```jsonc
{
  "id": "circle-cif-taylor",
  "title": "∫₀^{2π} e^{cos θ} cos(sin θ − nθ) dθ — an entire integrand, no residue of its own, and 2π/n!",
  "taxonomySection": "1",           // §1 / CIF, research 03 §13 row A4
  "tier": "A",

  "target": {
    "variable": "theta",
    "lower": "0", "upper": "2*pi",
    "integrand": "exp(cos(theta))*cos(sin(theta) - n*theta)",
    "symbols": {
      "g": { "kind": "entireFn", "var": "z" },   // g(z) = exp(z) for this instance
      "n": { "kind": "intParam" }
    },
    "substitution": { "to": "z", "map": "exp(i*theta)", "inverse": "-i*log(z)",
                      "jacobian": "1/(i*z)" }
    // e^{cos θ}cos(sin θ − nθ) = Re[ g(e^{iθ}) e^{−inθ} ]  with g = exp
    // ⇒ contour integrand f(z) = g(z) / (i z^{n+1})
  },

  "parameters": [
    { "name": "n", "domain": "integer", "constraints": ["n >= 0"] }
  ],

  "hypotheses": [
    { "id": "integrand-entire",
      "statement": "g has NO finite singularity — the residue machinery returns an empty singular set for g",
      // If g were meromorphic this would be the general §1 family, not this one. The emptiness is
      // the enabling condition, not a nuisance.
      "check": "structural:singularSetOf(g) == {}",
      "onFail": "refuse" },

    { "id": "complexification-verified",
      "statement": "the real integrand IS Re[g(e^{iθ}) e^{−inθ}] — a recognition step that can fail, so it is checked",
      "check": "structural:equalsRealPartOf(target.integrand, g(exp(i*theta))*exp(-i*n*theta))",
      "onFail": "refuse" },

    { "id": "jacobian-pole-is-the-only-pole",
      "statement": "the contour integrand's singular set is exactly {0}, of order n+1, contributed entirely by dθ = dz/(iz) and the e^{−inθ} factor",
      "check": "structural:polesOf(contourIntegrand) == {0} && structural:poleOrderAt(0) == n + 1",
      "onFail": "refuse" },

    { "id": "taylor-radius",
      "statement": "g is holomorphic on a disc of radius > 1, so its Taylor coefficients at 0 are what the contour reads off",
      "check": "structural:holomorphicOnClosedDisc(g, 1)",
      "onFail": "refuse" }
  ],

  // branch: DELIBERATELY OMITTED. exp is entire and single-valued; the only multivaluedness in
  // sight is in `inverse: -i*log(z)`, which is never evaluated — the substitution is used in the
  // forward direction only.

  "contour": {
    "template": "circle",
    "limitParams": [],
    "pieces": [
      { "id": "unitCircle", "name": "the unit circle |z| = 1",
        "geom": { "kind": "arc", "center": { "kind": "cart", "x": 0, "y": 0 },
                  "radius": 1, "theta0": "0", "theta1": "2*pi" },
        "role": "target", "colour": 0 }
    ],
    "orientation": "ccw",
    "encloses": "z = 0 only — order n+1, manufactured by the Jacobian and e^{−inθ}. g contributes NO pole."
  },

  "vanishingLemmas": [],

  "residueSelection": { "rule": "inside" },

  "closedForm": {
    "expr": "2*pi*taylorCoefficient(g, 0, n)",   // = 2π·g⁽ⁿ⁾(0)/n!, i.e. CIF for derivatives
    "simplified": "2*pi/factorial(n)"            // for g = exp; at n = 0 this is 2π
  },

  "rigor": { "policy": "min",
             "inputs": ["hypotheses.*", "residues.*.rigor", "windingNumbers.*", "contour.closed"] },

  "traps": [
    { "id": "entire-implies-zero",
      "detect": "structural:singularSetOf(integrandAsPosed) == {} && structural:valueReported == 0",
      "message": "g entire ⇒ ∮_{|z|=1} g(z) dz = 0 by Cauchy's theorem. That is TRUE, and it is not the integral being evaluated. ∫₀^{2π} g(e^{iθ}) dθ = ∮ g(z)·dz/(iz), and the substitution's own Jacobian supplies the pole. The residue machinery is right to report no poles OF g and the value is still 2π·g(0) = 2π — the Cauchy integral formula, equivalently the mean value of a harmonic function over a circle. Reporting 0 here is the commonest way this example is got wrong, and it is a reasoning error about WHICH function is being integrated, not an arithmetic slip." },

    { "id": "real-part-taken-too-early",
      "detect": "structural:substitutionAppliedTo(target.integrand) && structural:isRationalIn(cos(theta), sin(theta)) == false",
      "message": "e^{cos θ}cos(sin θ) is not a rational function of cos θ and sin θ, so §1's substitution table does not apply to it as written — there is nothing to clear. It must first be RECOGNISED as Re e^{e^{iθ}}. Taking the real part at the end is legitimate because the contour integral was computed exactly; taking it at the start leaves nothing holomorphic to integrate. This is the §1 analogue of research 03 §3's 'replace cos(ax) by e^{iaz}, not by cos(az)'." },

    { "id": "companion-imaginary-part-nonzero",
      "detect": "numeric:abs(im(2*pi*i*residueSum)) > tol",
      "message": "The same contour delivers the companion ∫₀^{2π} e^{cos θ} sin(sin θ − nθ) dθ = Im(2π/n!) = 0 for free — numerically −5.2×10⁻¹⁶. A nonzero imaginary part is an orientation or sign bug, not a second result. Free companions like this are the cheapest self-tests in the gallery and should be ledger rows, not footnotes." },

    { "id": "order-grows-with-n",
      "detect": "structural:poleOrderAt(0) != n + 1",
      "message": "At n = 0 the manufactured pole is SIMPLE and the shortcut Res = g(0)/i works. At n ≥ 1 it has order n+1 and the same shortcut silently returns the wrong Taylor coefficient. The order is a function of the substitution's exponent, so it must be recomputed whenever n changes — a cached 'this family has a simple pole' is wrong for every n ≥ 1." }
  ],

  "golden": [
    { "params": { "g": "exp(z)", "n": 0 }, "value": "2*pi",   "numeric": 6.2831853071795862, "verifiedTo": 1e-15 },
    { "params": { "g": "exp(z)", "n": 1 }, "value": "2*pi",   "numeric": 6.2831853071795862, "verifiedTo": 1e-15 },
    { "params": { "g": "exp(z)", "n": 2 }, "value": "pi",     "numeric": 3.1415926535897931, "verifiedTo": 1e-15 },
    { "params": { "g": "exp(z)", "n": 3 }, "value": "pi/3",   "numeric": 1.0471975511965976, "verifiedTo": 1e-15 },
    { "params": { "g": "exp(z)", "n": 5 }, "value": "pi/60",  "numeric": 0.052359877559829883, "verifiedTo": 1e-14 }
  ]
}
```

**Residues.** `f(z) = e^z/(i z^{n+1})`. Singular set of `g = e^z`: **empty**. Singular set of `f`:
`{0}`, order `n+1`, `n(γ,0) = +1`. At `n = 0`: `Res(f,0) = g(0)/i = 1/i = −i` (numeric
`−0.999999999999999 i`), `2πi·(−i) = 6.2831853071795862`. In general
`Res(f,0) = cₙ/i = g⁽ⁿ⁾(0)/(n!·i)` and `2πi·Res = 2π cₙ = 2π/n!` — verified against quadrature for
`n = 0…5`, max relative error `6.1×10⁻¹⁵`.

---

### A5 — `semicircle-order2`

The first entry with an auxiliary piece, and the first place the **degree condition is computed
rather than asserted**. `deg Q − deg P = 4` is nowhere in `hypotheses`; it falls out of the exact-ℚ
ML bound `M(R) = num(R)/den(R)` as an asymptotic statement about `θ·R·M(R)`, and the same code path
that prints `|∫_arc| ≤ 2.515287×10⁻⁵ at R = 50, O(R⁻³) → 0` prints the diverging bound when the user
closes the wrong way (B1). Its residue lesson is the **order-2 pole**: the quotient shortcut `P/Q′`
does not merely lose accuracy at a repeated root, it divides by zero — `Q′(i) = 4i(1+i²) = 0` — so
the engine refuses, which is the right behaviour and the reason A5's error mode is a *human* one:
dropping the `d/dz` from formula (3) and reporting `1/(2i)² = −1/4`, hence `−iπ/2`, a purely
imaginary number for a manifestly positive real integral.

```jsonc
{
  "id": "semicircle-order2",
  "title": "∫_ℝ dx/(1+x²)² = π/2 — the large semicircle and an order-2 pole",
  "taxonomySection": "2",
  "tier": "A",

  "target": {
    "variable": "x",
    "lower": "-inf", "upper": "inf",
    "integrand": "1/(1 + x^2)^2",
    "symbols": {
      "P": { "kind": "polynomial", "var": "x" },   // P = 1
      "Q": { "kind": "polynomial", "var": "x" }    // Q = (1+x²)² = x⁴ + 2x² + 1
    }
    // substitution: NONE. The real axis IS a piece of the contour; there is no Jacobian and
    // therefore no manufactured pole. Contrast A1/A3/A4.
    // principalValue: absent, and that is a claim: the integral converges absolutely (below).
  },

  "parameters": [],
  // EMPTY DELIBERATELY: A5 is a fixed instance, not a family in a parameter. P and Q are `symbols`
  // (structural inputs the hypotheses run on), not `parameters` (numbers with domains and knobs).
  // The distinction matters — `parameters` drive the UI sliders and the `constraints` predicates.

  "hypotheses": [
    { "id": "coprime",
      "statement": "gcd(P,Q) = 1 over ℚ(i) — any common factor is a removable singularity and must be cancelled and NAMED first",
      "check": "algebraic:gcd(P, Q) == 1",
      "onFail": "refuse" },

    { "id": "no-real-poles",
      "statement": "Q has no real zero (else §4's indented contour applies, not this family)",
      "check": "algebraic:noRealRoot(Q)",          // exact, by Sturm
      "onFail": "refuse" },

    { "id": "target-absolutely-convergent",
      "statement": "∫_ℝ |P/Q| dx converges. This is the TARGET's convergence — a different fact from the arc's vanishing, which is DERIVED in vanishingLemmas[0] and not asserted anywhere.",
      // Both reduce to deg Q − deg P ≥ 2 for this family. They are recorded separately on purpose:
      // at deg Q = deg P + 1 the arc bound still tends to a finite limit while the target fails to
      // converge, and only this row catches that (research 03 §2 trap (i)).
      "check": "algebraic:decayExponent(P, Q) >= 2",
      "onFail": "refuse" },

    { "id": "pole-order-exact",
      "statement": "pole multiplicities come from Yun squarefree decomposition of Q, not from clustering floating roots",
      "check": "algebraic:squarefreeDecompose(Q) is well-defined",
      "onFail": "refuse" }
  ],

  // branch: DELIBERATELY OMITTED — P/Q is rational, hence single-valued on ℂ.

  "contour": {
    "template": "semicircle",
    "limitParams": [ { "name": "R", "to": "inf" } ],
    "pieces": [
      { "id": "realAxis", "name": "the real segment [−R, R]",
        "geom": { "kind": "segment",
                  "from": { "kind": "cart", "x": "-R", "y": 0 },
                  "to":   { "kind": "cart", "x": "R",  "y": 0 } },
        "role": "target", "colour": 0 },
        // side: n/a (no cut). factor: n/a (not a reproduces piece).

      { "id": "arc", "name": "the R → ∞ semicircle",
        "geom": { "kind": "arc",
                  "center": { "kind": "cart", "x": 0, "y": 0 },
                  "radius": "R", "theta0": "0", "theta1": "pi" },
        "role": "vanish", "lemma": "L2", "colour": 1 }
    ],
    "orientation": "ccw",
    "encloses": "every pole of P/Q with Im z > 0, all strictly inside |z| = R once den(R) > 0"
  },

  "vanishingLemmas": [
    { "lemma": "L2", "piece": "arc",
      "sideCondition": "∃ p > 1, M, R₀ : |P(z)/Q(z)| ≤ M/|z|^p on C_R for all R ≥ R₀",
      // DESIGN §6.2, in exact ℚ via @cas/exact's Frac and the sqrtUp/sqrtDown of §6.1:
      //   num(R) = Σ_{k≤p} sqrtUp(|a_k|²) R^k                  (interval Horner, rounded up)
      //   den(R) = sqrtDown(|b_q|²) R^q − Σ_{k<q} sqrtUp(|b_k|²) R^k      (rounded down)
      //   require den(R) > 0  — which ALSO certifies every pole is strictly inside |z| = R
      //   M(R) = num/den ≥ max_{|z|=R}|f| ;  |∫_arc| ≤ π·R·M(R)
      // Here num(R) = 1, den(R) = R⁴ − 2R² − 1 > 0 ⟺ R > 1.5538 (Cauchy's sufficient bound
      // R > 1 + max|b_k/b_q| = 3 is also available and cheaper to state).
      // At R = 50: den = 6244999, M = 1.601281e-7, |∫_arc| ≤ 2.515287e-5.
      // THE DEGREE CONDITION IS THE OUTPUT, NOT THE INPUT: M(R) ~ (|a_p|/|b_q|) R^{p−q} so the arc
      // bound is O(R^{p−q+1}) = O(R^{-3}) here, and vanishes iff q ≥ p + 2. Nothing asserts that.
      "discharge": "symbolic:mlRational(P, Q, arc='upper', R)",
      "rigorIfDischarged": "=",       // see gap G2 — DESIGN §4 Pass 3 says "≤"; research 03 §15 says "="
      "rigorIfNumericOnly": "≈" }
  ],

  "residueSelection": { "rule": "upperHalfPlane" },

  "closedForm": {
    "expr": "2*pi*i*Sum(Res(P(z)/Q(z), z_k), im(z_k) > 0)",
    "simplified": "pi/2"
  },

  "rigor": { "policy": "min",
             "inputs": ["hypotheses.*", "vanishingLemmas.*.rigor", "residues.*.rigor",
                        "windingNumbers.*", "residueSelection.ladderRung"] },

  "traps": [
    { "id": "simple-pole-formula-at-multiple-pole",
      "detect": "algebraic:derivative(Q)(z_k) == 0",
      "message": "Res = P(z₀)/Q′(z₀) is formula (2) and its hypothesis is Q′(z₀) ≠ 0, i.e. z₀ is a SIMPLE root of Q. Here Q = (1+z²)², Q′ = 4z(1+z²), and Q′(i) = 0: the shortcut is 0/0 and the engine must refuse, not round. The order-2 formula Res = (1/1!)·d/dz[(z−i)²f]|_{z=i} = −2(z+i)⁻³|_{z=i} = 1/(4i) = −i/4 is mandatory, and the DERIVATIVE is where the answer lives — evaluating (z−i)²f at z = i without it gives 1/(2i)² = −1/4 and hence 2πi(−1/4) = −iπ/2, a purely imaginary number for an integral of a positive function. Any repeated root of Q is the same story; Yun's squarefree decomposition finds them all before any residue is attempted." },

    { "id": "degree-gap-one",
      "detect": "algebraic:decayExponent(P, Q) == 1",
      "message": "At deg Q = deg P + 1 the residue sum still returns a finite, plausible number and the target does not converge — ∫ x dx/(1+x²) exists only as a principal value. This family must REFUSE, not report, and the refusal comes from hypotheses.target-absolutely-convergent, which is why that row exists separately from the arc's discharge: the arc's ML bound at gap 1 tends to a finite nonzero limit rather than diverging (see B2), so the arc alone raises no alarm." },

    { "id": "closing-down-sign",
      "detect": "structural:arcSide(contour) == 'lower' && structural:residueSign == '+'",
      "message": "The lower semicircle is traversed CLOCKWISE as part of the closed path, so the identity is ∫_ℝ = −2πi Σ_{Im z<0} Res, not +2πi. Here Res(f,−i) = +i/4 and −2πi(i/4) = π/2, agreeing exactly with the upward closure — a free consistency check that research 03 §2 recommends and that the engine should run on every §2 entry. Getting −π/2 means the orientation was read from the arc's angle sign but not applied to the residue sum." },

    { "id": "half-range-requires-even",
      "detect": "structural:isEven(P/Q) == false && target.lower == '0'",
      "message": "∫₀^∞ = ½∫_ℝ holds only for an EVEN integrand. 1/(1+x²)² is even, so ∫₀^∞ dx/(1+x²)² = π/4 is a legitimate free corollary; x/(1+x²)² is not, and the same manipulation there converts a convergent odd integral (value 0 by symmetry) into a nonzero claim." }
  ],

  "golden": [
    { "params": {}, "value": "pi/2", "numeric": 1.5707963267948966, "verifiedTo": 1e-14 },
    { "params": { "halfRange": true }, "value": "pi/4", "numeric": 0.78539816339744828, "verifiedTo": 1e-14 }
  ]
}
```

**Residues.** `f(z) = 1/(1+z²)²`. `Q = (z²+1)²`; Yun gives the multiplicity-2 factor `z²+1`, so both
poles are order **2** exactly — never inferred from two nearly-coincident floating roots at `±i`.
`z = i`, `n(γ,i) = +1`, `Res = d/dz[(z+i)⁻²]|_{z=i} = −2/(2i)³ = 1/(4i) = −0.25 i` (numeric
`−0.250000000040 i` at `r = 10⁻⁴`). Laurent route, `w = z−i`: `1+z² = 2iw(1 − iw/2)`, so
`f = (1 + iw + …)/(−4w²)` and `c₋₁ = −i/4` — agreeing, and needing no factorial.
`2πi·(−i/4) = 1.5707963267948966` vs. quadrature `1.5707963267948966`. `z = −i` (order 2,
`Res = +i/4`) has `n(γ,−i) = 0`.

---

### A6 — `semicircle-quartic`

The first **irrational algebraic poles**, and the entry that makes the half-plane selection problem
concrete. The residue is a single element of `ℚ(i)[z]/⟨Q⟩`: since `z⁴ ≡ −1` we have `z³·z ≡ −1`, so
`(4z³)⁻¹ ≡ −z/4` and `Res ≡ −z/4` **at all four roots simultaneously**, computed without factoring
`Q` at all. What cannot be done that way is the restriction to `Im z > 0` (PLAN §3.3): `z⁴+1` is
irreducible over `ℚ`, and over `ℚ(i)` it splits as `(z²−i)(z²+i)` — but a factor `z²−c` has roots
`±√c`, an **antipodal pair**, so *every* such factor straddles the real axis and **rung 1 fails**.
`deg Q = 4` puts it on **rung 2** (radical split), which is exactly what PLAN §3.3 says. The
cross-check is free and beautiful: `Σ` over *all four* residues is `−e₁/4 = 0`, which is
`Res(f,∞) = 0`, which is the degree condition again — so summing all the residues returns a clean,
plausible, completely wrong `0`, and the half-plane restriction is the entire content of the formula.

```jsonc
{
  "id": "semicircle-quartic",
  "title": "∫_ℝ dx/(1+x⁴) = π/√2 — algebraic poles, P·(Q′)⁻¹ mod Q, and the half-plane ladder",
  "taxonomySection": "2",
  "tier": "A",

  "target": {
    "variable": "x",
    "lower": "-inf", "upper": "inf",
    "integrand": "1/(1 + x^4)",
    "symbols": { "P": { "kind": "polynomial", "var": "x" },    // P = 1
                 "Q": { "kind": "polynomial", "var": "x" } }   // Q = x⁴ + 1 = Φ₈(x)
    // substitution: NONE.
  },

  "parameters": [],   // EMPTY DELIBERATELY — a fixed instance; see A5's note on symbols vs parameters

  "hypotheses": [
    { "id": "coprime", "statement": "gcd(P,Q) = 1 over ℚ(i)",
      "check": "algebraic:gcd(P, Q) == 1", "onFail": "refuse" },

    { "id": "no-real-poles", "statement": "Q = x⁴+1 ≥ 1 has no real zero",
      "check": "algebraic:noRealRoot(Q)", "onFail": "refuse" },

    { "id": "target-absolutely-convergent",
      "statement": "∫_ℝ|P/Q| converges (the TARGET's convergence; the arc's is derived, not asserted)",
      "check": "algebraic:decayExponent(P, Q) >= 2", "onFail": "refuse" },

    { "id": "squarefree",
      "statement": "Q is squarefree, so every pole is simple and P/Q′ is the right formula",
      "check": "algebraic:gcd(Q, derivative(Q)) == 1", "onFail": "refuse" },

    { "id": "half-plane-count-exact",
      "statement": "#{roots with Im z > 0} = 2, by the Möbius map w = (z−i)/(z+i) followed by Schur–Cohn, cross-checked by Routh–Hurwitz",
      // COUNTING is exact and cheap; SELECTING is the hard part (PLAN §3.3). They are separate rows
      // for the same reason winding number and enclosed-pole count are (research 02 P0 #7).
      "check": "algebraic:upperHalfPlaneRootCount(Q) == 2", "onFail": "refuse" },

    { "id": "half-plane-selection-exact",
      "statement": "the restricted sum Σ_{Im z>0} Res is obtained EXACTLY; the engine refuses rather than guesses at every rung",
      // Ladder attempt log for this entry (PLAN §3.3, in order):
      //   rung 1 half-plane-homogeneous factor split .... FAILS (see traps.factor-split-assumed-homogeneous)
      //   rung 2 degree ≤ 4 radical split ................ SUCCEEDS  ← A6 LANDS HERE
      //   rung 3 cyclotomic recogniser (Q = Φ₈) .......... would also fire; not reached
      //   rung 4 certified interval enclosure ............ not reached
      //   rung 5 RootSum with visible half-plane predicate not reached
      "check": "algebraic:halfPlaneLadderRung(Q, 'upper') <= 3", "onFail": "refuse" }
  ],

  // branch: DELIBERATELY OMITTED. 1/(1+z⁴) is rational and single-valued. The √2 in the ANSWER is a
  // radical in the value, not a branch of the integrand — a distinction worth stating because
  // "there's a square root in the answer" is a common reason to reach for a cut that isn't there.

  "contour": {
    "template": "semicircle",
    "limitParams": [ { "name": "R", "to": "inf" } ],
    "pieces": [
      { "id": "realAxis", "name": "the real segment [−R, R]",
        "geom": { "kind": "segment",
                  "from": { "kind": "cart", "x": "-R", "y": 0 },
                  "to":   { "kind": "cart", "x": "R",  "y": 0 } },
        "role": "target", "colour": 0 },
      { "id": "arc", "name": "the R → ∞ semicircle",
        "geom": { "kind": "arc", "center": { "kind": "cart", "x": 0, "y": 0 },
                  "radius": "R", "theta0": "0", "theta1": "pi" },
        "role": "vanish", "lemma": "L2", "colour": 1 }
    ],
    "orientation": "ccw",
    "encloses": "e^{iπ/4} and e^{3iπ/4}; den(R) > 0 certifies both are strictly inside |z| = R"
  },

  "vanishingLemmas": [
    { "lemma": "L2", "piece": "arc",
      "sideCondition": "∃ p > 1, M, R₀ : |1/(1+z⁴)| ≤ M/|z|^p on C_R for R ≥ R₀",
      // num(R) = 1, den(R) = R⁴ − 1 > 0 ⟺ R > 1 (Cauchy's sufficient form gives R > 2).
      // At R = 50: den = 6249999, M = 1.600000e-7, |∫_arc| ≤ π·50·M = 2.513275e-5.
      // Derived, not asserted: deg Q − deg P = 4 ⇒ arc bound O(R^{-3}) → 0.
      "discharge": "symbolic:mlRational(P, Q, arc='upper', R)",
      "rigorIfDischarged": "=", "rigorIfNumericOnly": "≈" }
  ],

  "residueSelection": { "rule": "upperHalfPlane" },
  // GAP G3: nothing here records WHICH LADDER RUNG made the selection exact, which is the only
  // thing separating "=" from "≤"/RootSum. Smuggled into hypotheses.half-plane-selection-exact.

  "closedForm": {
    "expr": "2*pi*i*Sum(Res(1/(1+z^4), z_k), im(z_k) > 0)",
    "simplified": "pi/sqrt(2)"
  },

  "rigor": { "policy": "min",
             "inputs": ["hypotheses.*", "vanishingLemmas.*.rigor", "residues.*.rigor",
                        "windingNumbers.*", "residueSelection.ladderRung"] },

  "traps": [
    { "id": "factor-split-assumed-homogeneous",
      "detect": "algebraic:existsIrreducibleFactorStraddling(Q, 'realAxis')",
      "message": "z⁴+1 factors over ℚ(i) as (z²−i)(z²+i), and it is tempting to read that as one factor per half-plane — it is not. A factor z²−c always has roots ±√c, an ANTIPODAL pair, so each of these two quadratics contributes exactly one root above the axis and one below: z²−i gives e^{iπ/4} (upper) and e^{5iπ/4} (lower); z²+i gives e^{3iπ/4} (upper) and e^{−iπ/4} (lower). Rung 1 of PLAN §3.3's ladder therefore FAILS here and the engine must fall to rung 2 rather than sum a factor's residues wholesale. Summing z²−i's two residues gives −(e^{iπ/4}+e^{5iπ/4})/4 = 0, so the error is invisible in the arithmetic." },

    { "id": "all-roots-summed",
      "detect": "structural:selectedResidueCount == algebraic:degree(Q)",
      "message": "Σ over all four roots of −z/4 is −e₁/4 = 0, because z⁴+1 has no z³ term. That zero is not an accident: it IS Res(f,∞) = 0, and by research 03 §15's cross-family identity it is equivalent to the degree condition deg Q ≥ deg P + 2. So dropping the half-plane restriction returns exactly 0 — clean, plausible, and the negation of the whole method. The restriction is not a detail of the formula; it is the formula." },

    { "id": "floating-roots-downgrade",
      "detect": "structural:rootProvenance == 'float'",
      "message": "Reporting π/√2 from Durand–Kerner roots of z⁴+1 earns ≈, not =, however many digits agree. The exact claim rests on two things that have nothing to do with the float roots: Res ≡ −z/4 as an element of ℚ(i)[z]/⟨z⁴+1⟩ (verify: 4z³·(−z/4) = −z⁴ ≡ 1), and rung 2's radical split delivering the upper pair as e^{iπ/4}, e^{3iπ/4} ∈ ℚ(i,√2). Per PLAN §3.3, a decimal rendering of the exact result is itself labelled ≈." },

    { "id": "closing-down-disagrees",
      "detect": "numeric:abs(closeUpValue - closeDownValue) > tol",
      "message": "−2πi Σ_{Im z<0} Res must equal +2πi Σ_{Im z>0} Res; both give 2.2214414690791831. Since the two sums are −i√2/4 and +i√2/4, a disagreement means either the orientation sign or the half-plane predicate was applied inconsistently — and because the two sums are exact negatives here, an engine that got the predicate backwards AND the orientation backwards would agree with itself while being wrong twice." }
  ],

  "golden": [
    { "params": {}, "value": "pi/sqrt(2)", "numeric": 2.2214414690791831, "verifiedTo": 1e-14 },
    { "params": { "closeDown": true }, "value": "pi/sqrt(2)", "numeric": 2.2214414690791831, "verifiedTo": 1e-14 }
  ]
}
```

**Residues.** `Q = z⁴+1`, `Q′ = 4z³`. In `ℚ(i)[z]/⟨z⁴+1⟩`: `z⁴ ≡ −1 ⇒ z³·z ≡ −1 ⇒ (z³)⁻¹ ≡ −z`,
hence `(4z³)⁻¹ ≡ −z/4` and `Res ≡ −z/4` — one expression, all four roots, no factoring.

| root | half-plane | `n(γ,·)` | `Res = −z/4` | numeric check |
|---|---|---|---|---|
| `e^{iπ/4} = 0.707106781187 + 0.707106781187 i` | upper | `+1` | `−0.176776695297 − 0.176776695297 i` | agrees to 12 s.f. |
| `e^{3iπ/4} = −0.707106781187 + 0.707106781187 i` | upper | `+1` | `+0.176776695297 − 0.176776695297 i` | agrees to 12 s.f. |
| `e^{5iπ/4}` | lower | `0` | `+0.176776695297 + 0.176776695297 i` | — |
| `e^{−iπ/4}` | lower | `0` | `−0.176776695297 + 0.176776695297 i` | — |

`Σ_upper = −i√2/4 = −0.353553390593274 i`; `2πi·Σ = 2.2214414690791831` vs. quadrature
`2.2214414690791831`. `Σ_all = 0` exactly.

---

### A7 — `semicircle-order3`

Same contour as A5, one order higher, and that is enough to change the *method*. Formula (3) needs
`d²/dz²` of a quotient, and research 03 §0.2 is explicit that the `(m−1)`-th derivative of a
quotient blows up superlinearly, so at `m ≥ 3` the engine should prefer formula (4): Taylor-shift to
`w = z−i`, invert the truncated series over `ℚ(i)`, read `c₋₁`. A7 is therefore the entry that
justifies `kernel/exactSeries.ts` existing at all. Its trap is the sibling of A5's and strictly
nastier: dropping the `1/(m−1)!` returns `π/4`, which is real, positive, and of the right order of
magnitude — it passes every cheap sanity check a reader is likely to apply. The series route never
introduces a factorial, so running both is a genuine differential test rather than a restatement.

```jsonc
{
  "id": "semicircle-order3",
  "title": "∫_ℝ x² dx/(1+x²)³ = π/8 — an order-3 pole and why the series route wins",
  "taxonomySection": "2",
  "tier": "A",

  "target": {
    "variable": "x", "lower": "-inf", "upper": "inf",
    "integrand": "x^2/(1 + x^2)^3",
    "symbols": { "P": { "kind": "polynomial", "var": "x" },    // P = x²
                 "Q": { "kind": "polynomial", "var": "x" } }   // Q = (1+x²)³ = x⁶+3x⁴+3x²+1
  },

  "parameters": [],   // EMPTY DELIBERATELY — a fixed instance; see A5's note on symbols vs parameters

  "hypotheses": [
    { "id": "coprime", "statement": "gcd(x², (1+x²)³) = 1 over ℚ(i)",
      "check": "algebraic:gcd(P, Q) == 1", "onFail": "refuse" },
    { "id": "no-real-poles", "statement": "(1+x²)³ ≥ 1 has no real zero",
      "check": "algebraic:noRealRoot(Q)", "onFail": "refuse" },
    { "id": "target-absolutely-convergent",
      "statement": "∫_ℝ|P/Q| converges (deg gap 4; the arc's vanishing is derived separately)",
      "check": "algebraic:decayExponent(P, Q) >= 2", "onFail": "refuse" },
    { "id": "pole-order-exact",
      "statement": "Yun gives Q = (z²+1)³ ⇒ both poles have order exactly 3; m is KNOWN, never guessed",
      "check": "algebraic:squarefreeMultiplicityAt(Q, i) == 3", "onFail": "refuse" },
    { "id": "series-route-preferred",
      "statement": "for m ≥ 3 the Laurent route (formula 4) is used; formula (3) is retained as a differential check",
      "check": "structural:residueMethodFor(order = 3) == 'laurent'", "onFail": "warn" }
  ],

  // branch: DELIBERATELY OMITTED — rational, single-valued.

  "contour": {
    "template": "semicircle",
    "limitParams": [ { "name": "R", "to": "inf" } ],
    "pieces": [
      { "id": "realAxis", "name": "the real segment [−R, R]",
        "geom": { "kind": "segment",
                  "from": { "kind": "cart", "x": "-R", "y": 0 },
                  "to":   { "kind": "cart", "x": "R",  "y": 0 } },
        "role": "target", "colour": 0 },
      { "id": "arc", "name": "the R → ∞ semicircle",
        "geom": { "kind": "arc", "center": { "kind": "cart", "x": 0, "y": 0 },
                  "radius": "R", "theta0": "0", "theta1": "pi" },
        "role": "vanish", "lemma": "L2", "colour": 1 }
    ],
    "orientation": "ccw",
    "encloses": "z = i, order 3, n(γ,i) = +1"
  },

  "vanishingLemmas": [
    { "lemma": "L2", "piece": "arc",
      "sideCondition": "∃ p > 1, M, R₀ : |P/Q| ≤ M/|z|^p on C_R for R ≥ R₀",
      // num(R) = R², den(R) = R⁶ − 3R⁴ − 3R² − 1 > 0 ⟺ R > 1.8832 (Cauchy: R > 4).
      // At R = 50: den = 15606242499, M = 1.601923e-7, |∫_arc| ≤ π·50·M = 2.516295e-5.
      // deg Q − deg P = 4 ⇒ O(R^{-3}) → 0.  Derived from the bound; not an input.
      "discharge": "symbolic:mlRational(P, Q, arc='upper', R)",
      "rigorIfDischarged": "=", "rigorIfNumericOnly": "≈" }
  ],

  "residueSelection": { "rule": "upperHalfPlane" },

  "closedForm": {
    "expr": "2*pi*i*Sum(Res(z^2/(1+z^2)^3, z_k), im(z_k) > 0)",
    "simplified": "pi/8"
  },

  "rigor": { "policy": "min",
             "inputs": ["hypotheses.*", "vanishingLemmas.*.rigor", "residues.*.rigor",
                        "windingNumbers.*", "residueSelection.ladderRung"] },

  "traps": [
    { "id": "order-m-factorial-dropped",
      "detect": "structural:residueMethod == 'derivative' && structural:factorialDivisorApplied == false",
      "message": "Formula (3) is (1/(m−1)!)·d^{m−1}/dz^{m−1}[(z−z₀)^m f]. At m = 3 the divisor is 2!, and dropping it returns Res = −i/8 and hence π/4 = 0.785398163397448 instead of π/8 = 0.392699081698724 — exactly twice the truth. That factor of 2 is the most dangerous kind of error available here: the answer stays real, stays positive, and stays the right order of magnitude, so it survives every cheap check. The Laurent route (formula 4) never introduces a factorial at all, which is what makes running both a genuine differential test rather than a restatement of the same arithmetic." },

    { "id": "wrong-multiplicity",
      "detect": "structural:poleOrderUsedAt(i) != algebraic:squarefreeMultiplicityAt(Q, i)",
      "message": "The error is ONE-SIDED, which is why guessing m feels safe and is not. Too small: m = 2 forms d/dz[(z−i)²f], which still has a simple pole at z = i and diverges — loudly, so you notice. Too large: m = 4 forms (1/3!)·d³[(z−i)⁴f] and returns −i/16, the correct answer, because d^{m−1} extracts the coefficient of w^{m−1} from Σ c_n w^{n+m}, which is c₋₁ for EVERY m ≥ the true order. So an engine that over-estimates m is silently right and one that under-estimates is loudly wrong, and neither behaviour tells you the order. Yun's squarefree decomposition (DESIGN §6.3 step 2) fixes m exactly and removes the guess." },

    { "id": "quotient-shortcut-at-triple-root",
      "detect": "algebraic:derivative(Q)(z_k) == 0",
      "message": "Q′ = 6z(1+z²)² vanishes to order 2 at z = i, so P/Q′ is not merely inaccurate, it is 0/0 — as it was in A5. Formula (2) is exact and cheap precisely BECAUSE its hypothesis is checkable: Q squarefree. Check it once on Q, not root by root." },

    { "id": "half-range-requires-even",
      "detect": "structural:isEven(P/Q) == false && target.lower == '0'",
      "message": "x²/(1+x²)³ is even, so ∫₀^∞ = π/16 follows legitimately. The guard exists because the same one-line manipulation applied to an odd integrand turns a symmetric-limit zero into a nonzero claim." }
  ],

  "golden": [
    { "params": {}, "value": "pi/8", "numeric": 0.39269908169872414, "verifiedTo": 1e-14 },
    { "params": { "halfRange": true }, "value": "pi/16", "numeric": 0.19634954084936207, "verifiedTo": 1e-14 }
  ]
}
```

**Residues.** `f(z) = z²/(1+z²)³`. Pole `z = i`, order **3** (verified by Laurent coefficients at
`r = 0.05`: `c₋₄ = 0`, `c₋₃ = −0.125 i ≠ 0`), `n(γ,i) = +1`.

*Series route (preferred).* `w = z−i`: `P = −1 + 2iw + w²`, `1+z² = 2iw(1 − iw/2)`, so
`Q = −8i w³(1 − iw/2)³` and `(1−iw/2)⁻³ = 1 + (3i/2)w − (3/2)w² + O(w³)`. Then
`P·(1−iw/2)⁻³ = −1 + (i/2)w − (1/2)w² + O(w³)` and
`f = [−w⁻³ + (i/2)w⁻² − (1/2)w⁻¹ + …]/(−8i)`, giving `c₋₁ = (−1/2)/(−8i) = 1/(16i) = −i/16`.

*Derivative route (check).* `(1/2!)·d²/dz²[z²(z+i)⁻³]|_{z=i} = (1/2)(−i/8) = −i/16`. Numeric
circle quadrature: `−0.062500000382 i`. `2πi·(−i/16) = 0.39269908169872414` vs. quadrature
`0.39269908169872414`.

---

## 2. Tier B

### B1 — `jordan-cosine-kernel`

The entry where **the side you close on stops being a matter of taste**. `|e^{iaz}| = e^{−a·Im z}`
is bounded only where `a·Im z ≥ 0`, so the sign of `a` picks the half-plane, and the same exact-ℚ
bound code that prints `|∫_arc| ≤ 1.257140×10⁻³ at R = 50` for the right choice prints
`3.258950×10²⁰` for the wrong one — one code path, success and diagnostic, no "wrong contour"
detector anywhere (DESIGN §4 Pass 3). It also carries research 03 §3's *fatal* trap: complexify to
`e^{iaz}` and take `Re` at the end, because `|cos(az)|` grows like `e^{|a||Im z|}` in **both**
half-planes (`max_{|z|=10}|cos z| ≈ 1.10×10⁴`) and no closing direction exists at all. Worth noting
against B2: here `deg Q − deg P = 2`, so plain L2 would also discharge this arc — B1 is Jordan *by
family*, not Jordan *by necessity*.

```jsonc
{
  "id": "jordan-cosine-kernel",
  "title": "∫_ℝ cos(ax)/(x²+b²) dx = (π/b) e^{−ab} — Jordan, and the sign of a as a hard branch",
  "taxonomySection": "3",
  "tier": "B",

  "target": {
    "variable": "x", "lower": "-inf", "upper": "inf",
    "integrand": "cos(a*x)/(x^2 + b^2)",
    "symbols": {
      "a": { "kind": "realParam" },
      "b": { "kind": "realParam" },
      "R": { "kind": "rationalFn", "var": "x" }     // R(x) = 1/(x²+b²), real-valued on ℝ
    }
    // The contour integrand is R(z)·e^{iaz}; the target is its REAL part, which is only legitimate
    // because R ∈ ℝ(x) (hypothesis real-on-R below).
  },

  "parameters": [
    { "name": "a", "domain": "real", "constraints": ["isReal(a)"] },
      // UNCONSTRAINED DELIBERATELY. Every a ∈ ℝ is legal, INCLUDING a = 0 (which degenerates to §2
      // and still closes, because deg Q − deg P = 2 ≥ 2). What the sign of a constrains is the
      // CONTOUR, not the parameter — hence hypotheses.closing-side-matches-sign-of-a below, which
      // is where a would-be constraint like "a > 0" actually belongs.
    { "name": "b", "domain": "real", "constraints": ["b != 0"] }
      // b ↦ −b is a symmetry of the integrand, so the engine normalises to |b|. See traps.
  ],

  "hypotheses": [
    { "id": "no-real-poles",
      "statement": "z² + b² has no real zero ⟺ b ≠ 0",
      "check": "algebraic:noRealRoot(x^2 + b^2)", "onFail": "refuse" },

    { "id": "real-on-R",
      "statement": "R ∈ ℝ(x), so Re/Im of the contour value are the cos/sin integrals — false for complex-coefficient R",
      "check": "structural:hasRealCoefficients(R)", "onFail": "refuse" },

    { "id": "closing-side-matches-sign-of-a",
      "statement": "the arc lies in the half-plane where a·Im z ≥ 0, i.e. upper for a > 0 and lower for a < 0",
      // The geometry below writes theta1 = pi*sign(a) so the ARC is honest; `contour.orientation`
      // is a literal string and cannot be, which is gap G5. This hypothesis re-derives what the
      // orientation should have been and refuses on a mismatch.
      "check": "structural:arcHalfPlane(contour) == halfPlaneOf(sign(a))", "onFail": "refuse" },

    { "id": "decay-to-zero-in-closing-half-plane",
      "statement": "M_R = max_{C_R}|R(z)| → 0, which is all Jordan needs (deg Q ≥ deg P + 1 suffices)",
      "check": "algebraic:decayExponent(numer(R), denom(R)) >= 1", "onFail": "refuse" }
  ],

  // branch: DELIBERATELY OMITTED. R(z)·e^{iaz} is single-valued on all of ℂ — exp is entire, R is
  // rational. exp does have an ESSENTIAL singularity at ∞, which matters for B3's cross-checks but
  // creates no branch point and no cut.

  "contour": {
    "template": "semicircle",
    "limitParams": [ { "name": "R_lim", "to": "inf" } ],   // named R_lim: `R` is the rational fn
    "pieces": [
      { "id": "realAxis", "name": "the real segment [−R, R]",
        "geom": { "kind": "segment",
                  "from": { "kind": "cart", "x": "-R_lim", "y": 0 },
                  "to":   { "kind": "cart", "x": "R_lim",  "y": 0 } },
        "role": "target", "colour": 0 },

      { "id": "arc", "name": "the R → ∞ semicircle (upper when a > 0, lower when a < 0)",
        "geom": { "kind": "arc", "center": { "kind": "cart", "x": 0, "y": 0 },
                  "radius": "R_lim", "theta0": "0", "theta1": "pi*sign(a)" },
        // theta1 − theta0 = π·sgn(a): positive ⇒ ccw upper arc, negative ⇒ cw lower arc.
        // DESIGN §2.2: "orientation of an arc is the sign of (theta1 − theta0); no separate flag."
        "role": "vanish", "lemma": "L3", "colour": 1 }
        // GAP G1: this arc is ALSO dischargeable by L2 (deg gap 2), and there is no way to record a
        // second, independent lemma for one piece. That redundancy is exactly what distinguishes
        // B1 from B2 and it is inexpressible here.
    ],
    "orientation": "ccw",
    // ^ TRUE ONLY FOR a ≥ 0. For a < 0 the closed path runs clockwise and the identity carries
    // −2πi. See gap G5: `orientation` is a literal where the family needs a parameter expression.
    "encloses": "z = i·sgn(a)·|b| — the single pole of R in the closing half-plane"
  },

  "vanishingLemmas": [
    { "lemma": "L3", "piece": "arc",
      "sideCondition": "a·Im z ≥ 0 on the arc (so |e^{iaz}| = e^{−a Im z} ≤ 1), and M_R = max_{C_R}|R| → 0",
      // Jordan's bound is R-free in the leading factor: |∫_{C_R} e^{iaz}R(z) dz| ≤ (π/|a|)·M_R.
      // Its entire content is ∫₀^π e^{−κ sin θ}dθ ≤ π/κ, from sin θ ≥ 2θ/π on [0,π/2] (PLAN §3.2).
      // M_R is bounded in exact ℚ by the same den(R) machinery as L2: M_R ≤ 1/(R² − b²).
      // At R = 50, a = b = 1: M_R ≤ 4.001601e-4, |∫_arc| ≤ (π/1)·M_R = 1.257140e-3, O(R^{-2}) → 0.
      // (Plain ML would give π·R·M_R = 6.285700e-2 — also → 0 here, since deg gap = 2. See G1.)
      "discharge": "symbolic:jordanBound(R, a, R_lim)",
      "rigorIfDischarged": "=", "rigorIfNumericOnly": "≈" }
  ],

  "residueSelection": { "rule": "upperHalfPlane", "set": "poles of R with sign(a)·Im z > 0" },
  // GAP G4: the `rule` enum has no `lowerHalfPlane` and no parameterised half-plane, so the a < 0
  // branch is expressible only by qualifying `set` — which the enum then contradicts.

  "closedForm": {
    "expr": "2*pi*i*sign(a)*Sum(Res(R(z)*exp(i*a*z), z_k), sign(a)*im(z_k) > 0)",
    "simplified": "(pi/abs(b))*exp(-abs(a)*abs(b))"
    // The textbook form (π/b)e^{−ab} is valid only on a > 0, b > 0. Both |·| are load-bearing.
  },

  "rigor": { "policy": "min",
             "inputs": ["hypotheses.*", "vanishingLemmas.*.rigor", "residues.*.rigor",
                        "windingNumbers.*", "target.convergence"] },

  "traps": [
    { "id": "wrong-half-plane-for-sign-of-a",
      "detect": "numeric:sign(a) * structural:arcImSign(contour) < 0",
      "message": "|e^{iaz}| = e^{−a·Im z}. On the LOWER arc with a > 0 that is e^{+aR|sin θ|}, so at R = 50, a = b = 1 the same ML/Jordan code path returns a bound of 3.258950×10²⁰ instead of 1.257140×10⁻³, and the bound DIVERGES as R → ∞. This is not a sign to be patched at the end: the closed-contour identity itself is false, because the arc's contribution does not vanish. The ledger row reads '⚠ — this argument does not close', produced by exactly the same code that produces the success row (DESIGN §4 Pass 3). The residue at the lower pole −ib carries e^{+ab} = 2.71828 at a = b = 1, which is the same divergence seen from the other side." },

    { "id": "cosine-not-exponential",
      "detect": "structural:contourIntegrandContains(cos(a*z))",
      "message": "The fatal one (research 03 §3 trap (i)). Replacing cos(ax) by cos(az) rather than by e^{iaz} produces an integrand whose modulus grows like e^{|a||Im z|}/2 in BOTH half-planes — max_{|z|=10}|cos z| ≈ cosh 10 = 1.1013×10⁴, max_{|z|=50}|cos z| ≈ 2.5924×10²¹ — so NO closing direction works and the method has no repair. Complexify to the exponential, evaluate the contour integral exactly, and take the real part at the very end. The engine can detect this structurally before computing anything." },

    { "id": "sine-companion-nonzero",
      "detect": "numeric:abs(im(2*pi*i*residueSum)) > tol",
      "message": "R(x) = 1/(x²+b²) is even and real on ℝ, so ∫_ℝ sin(ax)/(x²+b²) dx = 0 by parity — and the same contour delivers it as Im[(π/b)e^{−ab}] = 0, for free. A nonzero imaginary part means a sign or orientation bug, not a new result (research 03 §3 trap (iv)). Note the companion over the HALF line is not zero: ∫₀^∞ sin x/(x²+1) dx = 0.6467611228, so the parity argument must be tied to the actual limits." },

    { "id": "b-sign-not-normalised",
      "detect": "numeric:b < 0",
      "message": "(π/b)e^{−ab} is ODD in b while the integrand 1/(x²+b²) is EVEN in b, so the closed form must use |b|. The residue machinery is fine either way — for b < 0 the pole in the upper half-plane is −ib = i|b| and everything follows — but the printed form is not. This is the same failure as A1's textbook-form-drops-sign: a legality hypothesis (b ≠ 0) that is strictly weaker than the closed form's hypothesis (b > 0)." },

    { "id": "a-zero-degenerates",
      "detect": "numeric:a == 0",
      "message": "At a = 0 the exponential disappears and this is §2, not §3. Jordan's bound (π/|a|)M_R is π/0 = ∞ and says nothing — correctly, since Jordan has no content without exponential decay. Here it does not matter, because deg Q − deg P = 2 and L2 discharges the arc anyway, giving π/b. But the family must notice the degeneration and switch lemmas rather than report an infinite bound as a failure (research 03 §3 trap (iii))." }
  ],

  "golden": [
    { "params": { "a": 1, "b": 1 },   "value": "pi/e",           "numeric": 1.1557273497909217,    "verifiedTo": 1e-15 },
    { "params": { "a": 2, "b": 3 },   "value": "(pi/3)*exp(-6)", "numeric": 0.0025957432094282466, "verifiedTo": 1e-14 },
    { "params": { "a": 0.5, "b": 2 }, "value": "(pi/2)*exp(-1)", "numeric": 0.57786367489546087,   "verifiedTo": 1e-15 },
    { "params": { "a": -1, "b": 1 },  "value": "pi/e",           "numeric": 1.1557273497909217,    "verifiedTo": 1e-15 },
    { "params": { "a": 3, "b": 0.5 }, "value": "2*pi*exp(-1.5)", "numeric": 1.4019681438332423,    "verifiedTo": 1e-15 },
    { "params": { "a": 0, "b": 1 },   "value": "pi",             "numeric": 3.1415926535897931,    "verifiedTo": 1e-15 }
  ]
}
```

**Residues** (`a = 1, b = 1`). `f(z) = e^{iaz}/(z²+b²)`, simple poles at `±ib`.
`z = ib`: `n(γ,ib) = +1` for `a > 0`, `Res = e^{ia(ib)}/(2ib) = e^{−ab}/(2ib) = −0.183939720585721 i`
(numeric `−0.183939720585721 i`). `2πi·Res = 1.1557273497909217 + 0 i`; the real part is the cosine
integral (`π/e`, matching quadrature to `0` relative error) and the imaginary part is the sine
integral (`0`). `z = −ib` has `n = 0` and `Res = e^{+ab}/(−2ib) = 1.35914 i` — the `e^{+ab}` is the
divergence of the wrong-side closure, visible in the residue itself.

---

### B2 — `jordan-strict`

The one entry in tiers A and B where **Jordan is not a convenience but the only thing that works**,
and the one where the failure of the alternative is *quiet*. With `deg Q − deg P = 1`, the ML bound
on the semicircle is `πR·M_R → π`: it does not diverge, so nothing looks alarming, and it does not
vanish, so it proves nothing — a bound with a finite nonzero limit is the worst possible outcome and
the hardest to notice. Jordan trades the factor `R` for the constant `π/a` by using the actual
exponential decay, and lands within a factor of two of the true arc integral. B2 is also the first
entry whose **target converges only conditionally**: `∫|x sin x/(1+x²)| dx` diverges like
`(2/π) ln L` (measured `6.0829` at `L = 4000π` against `(2/π)ln(4000π) = 6.0089`), so the value
`π/e` is a Dirichlet limit and *not* a principal value — and the schema has no way to say that.

```jsonc
{
  "id": "jordan-strict",
  "title": "∫_ℝ x sin x/(1+x²) dx = π/e — where ML is not merely loose but useless",
  "taxonomySection": "3",
  "tier": "B",

  "target": {
    "variable": "x", "lower": "-inf", "upper": "inf",
    "integrand": "x*sin(x)/(1 + x^2)",
    "symbols": { "R": { "kind": "rationalFn", "var": "x" } },   // R(x) = x/(1+x²)
    "principalValue": false
    // ^ FALSE, AND THAT IS A SUBSTANTIVE CLAIM, NOT A DEFAULT. ∫₀^A converges as A → ∞ by
    // Dirichlet (x/(1+x²) ↓ 0 monotonically for x > 1, ∫sin bounded), so both limits may be taken
    // independently and no symmetric pairing is needed. It is simply not ABSOLUTELY convergent —
    // a third state the schema cannot express. See gap G10.
  },

  "parameters": [],
  // a is pinned at 1 by the gallery entry. The Jordan constant below is (π/a) = π.

  "hypotheses": [
    { "id": "no-real-poles", "statement": "1 + x² has no real zero",
      "check": "algebraic:noRealRoot(1 + x^2)", "onFail": "refuse" },

    { "id": "real-on-R", "statement": "R ∈ ℝ(x), so Im of the contour value is the sine integral",
      "check": "structural:hasRealCoefficients(R)", "onFail": "refuse" },

    { "id": "jordan-decay",
      "statement": "M_R = max_{C_R}|R| → 0 — Jordan's ONLY hypothesis on R, weaker than L2's p > 1",
      "check": "algebraic:decayExponent(numer(R), denom(R)) >= 1", "onFail": "refuse" },

    { "id": "L2-unavailable",
      "statement": "deg Q − deg P = 1, so no p > 1 exists and L2 is INAPPLICABLE — recorded so the engine cannot silently substitute it",
      "check": "algebraic:decayExponent(numer(R), denom(R)) < 2", "onFail": "warn" },

    { "id": "target-converges-conditionally",
      "statement": "∫_ℝ x sin x/(1+x²) dx converges (Dirichlet) but NOT absolutely; the label must carry that",
      "check": "algebraic:absolutelyConvergent(target) == false", "onFail": "warn" }
  ],

  // branch: DELIBERATELY OMITTED — R(z)e^{iz} is single-valued (rational × entire).

  "contour": {
    "template": "semicircle",
    "limitParams": [ { "name": "R_lim", "to": "inf" } ],
    "pieces": [
      { "id": "realAxis", "name": "the real segment [−R, R]",
        "geom": { "kind": "segment",
                  "from": { "kind": "cart", "x": "-R_lim", "y": 0 },
                  "to":   { "kind": "cart", "x": "R_lim",  "y": 0 } },
        "role": "target", "colour": 0 },
      { "id": "arc", "name": "the R → ∞ semicircle (upper: a = 1 > 0)",
        "geom": { "kind": "arc", "center": { "kind": "cart", "x": 0, "y": 0 },
                  "radius": "R_lim", "theta0": "0", "theta1": "pi" },
        "role": "vanish", "lemma": "L3", "colour": 1 }
        // Unlike B1 and B3, L2 is NOT an alternative here. This is the only tier-A/B arc for which
        // exactly one lemma applies.
    ],
    "orientation": "ccw",
    "encloses": "z = i only, simple, n(γ,i) = +1"
  },

  "vanishingLemmas": [
    { "lemma": "L3", "piece": "arc",
      "sideCondition": "a = 1 > 0 and the arc is in the upper half-plane (|e^{iz}| ≤ 1 there); M_R = max_{C_R}|z/(1+z²)| → 0",
      // |∫_{C_R} e^{iz} z/(1+z²) dz| ≤ (π/a)·M_R with M_R ≤ R/(R²−1), exact in ℚ.
      // At R = 50: M_R ≤ 2.000800e-2, Jordan bound 6.285700e-2, O(R^{-1}) → 0.
      // The three quantities, measured:
      //       R        true |∫_arc|      ML  πR·M_R        Jordan  π·M_R
      //      10        1.733e-1          3.17333           3.173e-1
      //     100        1.714e-2          3.14191           3.142e-2
      //    1000        1.126e-3          3.14160           3.142e-3
      //   10000        1.902e-4          3.14159           3.142e-4
      // ML converges to π. Jordan stays within a factor ~2 of the truth at every R.
      "discharge": "symbolic:jordanBound(R, 1, R_lim)",
      "rigorIfDischarged": "=", "rigorIfNumericOnly": "≈" }
  ],

  "residueSelection": { "rule": "upperHalfPlane" },

  "closedForm": {
    "expr": "im(2*pi*i*Sum(Res(z*exp(i*z)/(1+z^2), z_k), im(z_k) > 0))",
    "simplified": "pi/exp(1)"
  },

  "rigor": { "policy": "min",
             "inputs": ["hypotheses.*", "vanishingLemmas.*.rigor", "residues.*.rigor",
                        "windingNumbers.*", "target.convergence"] },

  "traps": [
    { "id": "ml-insufficient",
      "detect": "algebraic:decayExponent(numer(R), denom(R)) <= 1 && structural:lemmaUsed == 'L2'",
      "message": "With deg Q − deg P = 1 the ML bound on the semicircle is πR·M_R with M_R ~ 1/R, so it tends to π — a FINITE NONZERO limit. That is the worst failure mode available: the bound does not diverge, so nothing looks broken, and it does not vanish, so it proves nothing. Measured: 3.17333 at R = 10, 3.14159 at R = 10⁴. Jordan's lemma trades the factor R for the constant π/a by using the real exponential decay, ∫₀^π e^{−aR sin θ}dθ ≤ π/(aR), itself from sin θ ≥ 2θ/π on [0,π/2]; its bound is 3.142×10⁻⁴ at R = 10⁴ against a true arc integral of 1.902×10⁻⁴. The hypothesis weakens from R = O(|z|^{−1−ε}) to merely R → 0, and that gap is exactly what makes this integral reachable." },

    { "id": "conditional-convergence-unlabelled",
      "detect": "algebraic:absolutelyConvergent(target) == false && structural:labelClaims('absolute')",
      "message": "|x sin x/(1+x²)| ~ |sin x|/x, and ∫₁^L |sin x|/x dx ~ (2/π) ln L → ∞ (measured 6.0829 at L = 4000π versus (2/π)ln(4000π) = 6.0089). So π/e is a conditionally convergent value: a Dirichlet limit of ∫_{−A}^{B} as A, B → ∞ independently. It is NOT a principal value — setting principalValue would be a DIFFERENT and also false claim, since no symmetric pairing is needed. The practical consequence is that Fubini and differentiation under the integral sign are not automatically licensed on this integrand, which matters the moment anyone tries to get a parameterised family out of it." },

    { "id": "wrong-half-plane",
      "detect": "structural:arcHalfPlane(contour) == 'lower'",
      "message": "Closing downward puts the pole at −i, where the residue involves e^{+1}, and makes |e^{iz}| = e^{R|sin θ|} on the arc: the bound diverges like e^R. Since a = 1 is fixed and positive here, the upper half-plane is the only legal closure and the engine should refuse rather than report the lower-closure residue sum, which is finite and wrong." },

    { "id": "jordan-with-zero-rate",
      "detect": "numeric:a == 0 && structural:lemmaUsed == 'L3'",
      "message": "Jordan's constant is π/a where a is the EXPONENTIAL RATE, not the pole location and not the degree. At a = 0 it is π/0 = ∞, correctly reporting that Jordan has no content without exponential decay — and indeed ∫_ℝ x/(1+x²) dx exists only as a principal value (research 03 §2 trap (i)). An engine that treats an infinite Jordan constant as a numerical overflow rather than as a statement will paper over exactly the case it was built to catch." }
  ],

  "golden": [
    { "params": {}, "value": "pi/exp(1)", "numeric": 1.1557273497909217, "verifiedTo": 1e-15 },
    { "params": { "companion": "re" }, "value": "0", "numeric": 0, "verifiedTo": 1e-14 }
    // the companion ∫_ℝ x cos x/(1+x²) dx = Re(iπ/e) = 0 — the integrand is odd AND the integral
    // converges (Dirichlet), so this is a genuine zero, not just a symmetric-limit zero.
  ]
}
```

**Residues.** `f(z) = z e^{iz}/(1+z²)`, simple poles at `±i`. `z = i`, `n(γ,i) = +1`,
`Res = i e^{−1}/(2i) = e^{−1}/2 = 0.183939720585721` (numeric `0.183939720585720`).
`2πi·Res = 0 + 1.1557273497909217 i`; the **imaginary** part is the target `π/e`, matching
quadrature to `7.7×10⁻¹⁶` relative, and the real part gives the free companion
`∫_ℝ x cos x/(1+x²) dx = 0`.

---

### B3 — `jordan-quartic`

A6 × B1, and the record where **`=` is earned on the form while the decimal remains `≈`.** The
algebraic factor of the residue is literally the same element as A6's — `P·(Q′)⁻¹ ≡ −z/4` in
`ℚ(i)[z]/⟨z⁴+1⟩` — but the residue is `−α e^{iα}/4`, which is not an algebraic number, so the
symmetric-function machinery that makes A6's cross-check free (Rothstein–Trager, Newton's
identities, `Σ_all Res = 0`) is **unavailable**: here `Σ_all Res = −0.166468279019598 i ≠ 0`,
because `e^{iz}` has an essential singularity at `∞` and `Res(f,∞)` is not zero. Rung 2 of the
half-plane ladder still delivers `=`, because the radical split gives `iα = −1/√2 ± i/√2` and hence
`e^{iα}` in closed form — but certifying the resulting *decimal* needs enclosures for `exp`, `cos`,
`sin` at `1/√2`, which PLAN §3.2 explicitly removed from tier 2 (ECMA-262 gives `Math.exp` no ulp
bound) and deferred to tier 3.

```jsonc
{
  "id": "jordan-quartic",
  "title": "∫_ℝ cos x/(1+x⁴) dx — algebraic poles with transcendental residues",
  "taxonomySection": "3",
  "tier": "B",

  "target": {
    "variable": "x", "lower": "-inf", "upper": "inf",
    "integrand": "cos(x)/(1 + x^4)",
    "symbols": { "R": { "kind": "rationalFn", "var": "x" } },   // R(x) = 1/(1+x⁴)
    "principalValue": false      // absolutely convergent: |cos x/(1+x⁴)| ≤ 1/(1+x⁴)
  },

  "parameters": [],
  // a = 1 pinned by the gallery entry; the family generalises to cos(ax)/(1+x⁴) unchanged.

  "hypotheses": [
    { "id": "no-real-poles", "statement": "x⁴ + 1 ≥ 1 has no real zero",
      "check": "algebraic:noRealRoot(1 + x^4)", "onFail": "refuse" },
    { "id": "real-on-R", "statement": "R ∈ ℝ(x), so Re/Im give the cos/sin integrals",
      "check": "structural:hasRealCoefficients(R)", "onFail": "refuse" },
    { "id": "squarefree", "statement": "z⁴+1 is squarefree, so all four poles are simple and P/Q′ applies",
      "check": "algebraic:gcd(Q, derivative(Q)) == 1", "onFail": "refuse" },
    { "id": "jordan-decay", "statement": "M_R = max_{C_R}|R| → 0",
      "check": "algebraic:decayExponent(numer(R), denom(R)) >= 1", "onFail": "refuse" },
    { "id": "half-plane-count-exact",
      "statement": "#{roots of z⁴+1 with Im z > 0} = 2 (Möbius + Schur–Cohn, cross-checked by Routh–Hurwitz)",
      "check": "algebraic:upperHalfPlaneRootCount(Q) == 2", "onFail": "refuse" },
    { "id": "half-plane-selection-exact",
      "statement": "the restricted sum is exact via the ladder; this entry lands on rung 2",
      //   rung 1 factor split .............. FAILS — (z²−i)(z²+i) each straddle (see A6)
      //   rung 2 degree ≤ 4 radicals ....... SUCCEEDS ← B3 LANDS HERE, same rung as A6
      //   rung 3 cyclotomic (Q = Φ₈) ....... would fire; not reached
      //   rung 4 interval enclosure ........ not reached (and would need transcendental enclosures)
      //   rung 5 RootSum ................... not reached
      // The rung is the same as A6's; the OUTPUT FIELD is not. A6 lands in ℚ(i,√2); B3 lands in
      // ℚ(√2, e^{−1/√2}, cos(1/√2), sin(1/√2)).
      "check": "algebraic:halfPlaneLadderRung(Q, 'upper') <= 3", "onFail": "refuse" },
    { "id": "residue-is-not-algebraic",
      "statement": "Res = −α e^{iα}/4 lies outside ℚ(i)[z]/⟨Q⟩; symmetric-function shortcuts over the residues are INVALID here",
      "check": "structural:residueFieldIsAlgebraic(f) == false", "onFail": "warn" }
  ],

  // branch: DELIBERATELY OMITTED. e^{iz}/(1+z⁴) is single-valued. The 1/√2 in the answer is a
  // radical in the VALUE; there is no branch point and no cut anywhere in the problem.

  "contour": {
    "template": "semicircle",
    "limitParams": [ { "name": "R_lim", "to": "inf" } ],
    "pieces": [
      { "id": "realAxis", "name": "the real segment [−R, R]",
        "geom": { "kind": "segment",
                  "from": { "kind": "cart", "x": "-R_lim", "y": 0 },
                  "to":   { "kind": "cart", "x": "R_lim",  "y": 0 } },
        "role": "target", "colour": 0 },
      { "id": "arc", "name": "the R → ∞ semicircle (upper: a = 1 > 0)",
        "geom": { "kind": "arc", "center": { "kind": "cart", "x": 0, "y": 0 },
                  "radius": "R_lim", "theta0": "0", "theta1": "pi" },
        "role": "vanish", "lemma": "L3", "colour": 1 }
        // Like B1 and unlike B2, L2 also discharges this arc (deg gap 4). Gap G1 again.
    ],
    "orientation": "ccw",
    "encloses": "e^{iπ/4} and e^{3iπ/4}, both simple, n(γ,·) = +1"
  },

  "vanishingLemmas": [
    { "lemma": "L3", "piece": "arc",
      "sideCondition": "a = 1 > 0, arc in the upper half-plane (|e^{iz}| ≤ 1), M_R = max_{C_R}|1/(1+z⁴)| → 0",
      // M_R ≤ 1/(R⁴ − 1), exact in ℚ; den(R) > 0 ⟺ R > 1.
      // At R = 50: M_R ≤ 1.600000e-7, Jordan bound π·M_R = 5.026549e-7, O(R^{-4}) → 0.
      // (Plain ML would give πR·M_R = 2.513275e-5, also → 0 — see gap G1.)
      "discharge": "symbolic:jordanBound(R, 1, R_lim)",
      "rigorIfDischarged": "=", "rigorIfNumericOnly": "≈" }
  ],

  "residueSelection": { "rule": "upperHalfPlane" },

  "closedForm": {
    "expr": "re(2*pi*i*Sum(Res(exp(i*z)/(1+z^4), z_k), im(z_k) > 0))",
    "simplified": "(pi/sqrt(2))*exp(-1/sqrt(2))*(cos(1/sqrt(2)) + sin(1/sqrt(2)))"
  },

  "rigor": { "policy": "min",
             "inputs": ["hypotheses.*", "vanishingLemmas.*.rigor", "residues.*.rigor",
                        "windingNumbers.*", "residueSelection.ladderRung", "display.renderingMode"] },

  "traps": [
    { "id": "total-residue-theorem-misapplied",
      "detect": "structural:isRational(contourIntegrand) == false && structural:usedTotalResidueIdentity",
      "message": "For A6 (rational, deg gap ≥ 2) the sum over ALL four roots of −z/4 is exactly 0, which is Res(f,∞) = 0, and it is a free cross-check. Here f = e^{iz}/(1+z⁴) is NOT rational: e^{iz} has an ESSENTIAL singularity at ∞, the total-residue theorem does not apply, and the sum over all four roots is −0.166468279019598 i ≠ 0. Reusing A6's shortcut here silently changes the answer by 2πi × 0.0793108814094 i. The two entries share a denominator, a ladder rung and an algebraic residue factor, and differ on exactly this — which is why they are separate gallery entries." },

    { "id": "transcendental-factor-evaluated-at-a-float-root",
      "detect": "structural:residueFieldIsAlgebraic(f) == false && structural:rootProvenance == 'float'",
      "message": "P·(Q′)⁻¹ mod Q gives −z/4 exactly — the same element of ℚ(i)[z]/⟨z⁴+1⟩ that A6 uses — but that is only the ALGEBRAIC FACTOR. The residue is −α e^{iα}/4 and the transcendental factor must be evaluated at the actual root, so exactness depends entirely on rung 2 producing α = (±1+i)/√2 in closed form, whence iα = −1/√2 ± i/√2 and e^{iα} = e^{−1/√2}(cos(1/√2) ± i sin(1/√2)). Without that, the engine must fall to rung 5 and print RootSum_{Im α > 0}(−α e^{iα}/4) WITH its half-plane predicate visible (PLAN §3.3) rather than a decimal." },

    { "id": "decimal-rendering-claims-exactness",
      "detect": "structural:renderingMode == 'decimal' && verdict.level == '='",
      "message": "The `=` is on the SYMBOLIC form (π/√2)e^{−1/√2}(cos(1/√2)+sin(1/√2)). Rendering 1.5442760096181360 is ≈, and not merely by PLAN §3.3's general rule: certifying that decimal requires enclosures for exp, cos and sin at 1/√2, and PLAN §3.2 cut tier 2 precisely because ECMA-262 gives Math.exp/cos/sin NO ulp bound — every JS interval library's transcendental is a heuristic wearing a proof's clothes. Tier 3 (Arb/FLINT WASM) is the documented escape hatch. Contrast A6, whose non-π factor 1/√2 IS rationally enclosable by DESIGN §6.1's sqrtUp/sqrtDown." },

    { "id": "sine-companion-nonzero",
      "detect": "numeric:abs(im(2*pi*i*residueSum)) > tol",
      "message": "cos x/(1+x⁴) is even and sin x/(1+x⁴) is odd, so the same contour gives ∫_ℝ sin x/(1+x⁴) dx = 0 for free — measured Im(2πi Σ) = 0 exactly. The two upper residues are complex conjugates in their real parts and equal in their imaginary parts (−0.00964090124667 ∓ … and +0.00964090124667 ∓ …), so the real parts cancel in the sum: that cancellation IS the parity statement, and losing it means a root was mis-assigned to a half-plane." }
  ],

  "golden": [
    { "params": {},
      "value": "(pi/sqrt(2))*exp(-1/sqrt(2))*(cos(1/sqrt(2)) + sin(1/sqrt(2)))",
      "numeric": 1.5442760096181360, "verifiedTo": 1e-15 },
    { "params": { "companion": "sin" }, "value": "0", "numeric": 0, "verifiedTo": 1e-14 }
  ]
}
```

**Residues.** `f(z) = e^{iz}/(1+z⁴)`. `Res = P·(Q′)⁻¹·e^{iz} = (−z/4)·e^{iz}` — algebraic factor
`−z/4 ∈ ℚ(i)[z]/⟨z⁴+1⟩` (identical to A6), transcendental factor `e^{iz}` at the root.

| root | half-plane | `n(γ,·)` | `Res = −α e^{iα}/4` | numeric check |
|---|---|---|---|---|
| `e^{iπ/4}` | upper | `+1` | `−0.00964090124667 − 0.122889580214 i` | agrees to 12 s.f. |
| `e^{3iπ/4}` | upper | `+1` | `+0.00964090124667 − 0.122889580214 i` | agrees to 12 s.f. |
| `e^{5iπ/4}` | lower | `0` | `+0.505475612366 + 0.0396554407047 i` | — |
| `e^{−iπ/4}` | lower | `0` | `−0.505475612366 + 0.0396554407047 i` | — |

`Σ_upper = −0.245779160428954 i`, which is `−(i/2)(1/√2)e^{−1/√2}(cos(1/√2)+sin(1/√2))` =
`−0.245779160428954 i` — agreement to `3×10⁻¹⁷`. `2πi·Σ_upper = 1.5442760096181356` vs. quadrature
`1.5442760096181360` (relative `2.9×10⁻¹⁶`). **`Σ_all = −0.166468279019598 i ≠ 0`** — the A6
cross-check is unavailable, by design.

---

## 3. Schema gaps found while writing these

Reported as findings per the brief. None was papered over; each is marked in the record where it
bites.

### 3.0 The one place research 03 is under-constrained (not a disagreement)

Every closed form in research 03 §13's table reproduced to ≤ `2.6×10⁻¹⁴` relative. But the table's
**Value** column for **A1** reads `2π/√(a²−b²)` with no constraint, while §1's worked-example list
correctly carries `a > |b| > 0`. Those are different claims: at `a = −2, b = 1` the legality
hypothesis (`a² ≠ b²`, no unimodular root) passes, the residue machinery returns the correct
`−2π/√3 = −3.6275987284684`, and the table's formula returns `+3.6275987284684`. The general form
is `2π·sgn(a)/√(a²−b²)`, verified for `(a,b) ∈ {(±2,±1), (±5,3), (10,−9.5)}`. §13 is a summary
table, so this is a scoping omission rather than an error — but since §13 is what a gallery author
transcribes, it is worth a constraint column.

### 3.1 Gaps in `Family` (DESIGN §5)

| # | gap | where it bites | suggested shape |
|---|---|---|---|
| **G1** | **One lemma per piece.** `Piece.lemma` is singular and `vanishingLemmas[]` is keyed by piece, so there is no way to record that a piece is discharged by two *independent* lemmas. B1's and B3's arcs are dischargeable by both L3 and L2 (deg gap ≥ 2); B2's by L3 only. That redundancy is a free cross-check *and* is precisely the fact that distinguishes B2 from its neighbours — and it is currently inexpressible. | `lemma: LemmaId \| LemmaId[]`, with Pass 3 discharging all of them and meeting the results (agreement is then a testable invariant). |
| **G2** | **`rigorIfDischarged` conflates two claims.** DESIGN §4 Pass 3's table says a symbolic `vanish` row earns `≤`; research 03 §15 says `rigorIfDischarged: "="`. Both are right about different things: the finite-`R` bound is `≤`, the limit statement `Vᵢ = 0` (which is what Pass 5 actually substitutes) is `=`. With `rigor.policy: "min"` the two readings differ on **every label in this file** — `≤` would cap all ten at `≤`, contradicting PLAN §2's own worked ledger, which prints `[≤]` on the KILL row and `[=]` on the conclusion. | Split into `rigorOfBound` and `rigorOfLimit`, or make the row emit two `Certificate`s. This is the highest-severity gap here because it silently changes every verdict. |
| **G3** | **No record of which ladder rung was reached.** `residueSelection` says *what* subset; nothing says *how* the restriction was made exact, which is the only thing separating `=` from `≤`/RootSum for A6 and B3 (PLAN §3.3). I smuggled it into a `hypotheses[].check`. | `residueSelection.ladder?: { attempted: Rung[]; reached: Rung; why: string }`. |
| **G4** | **`residueSelection.rule` enum is incomplete.** `"all" \| "inside" \| "upperHalfPlane" \| "notOn"` has no `lowerHalfPlane` and no parameterised half-plane, so B1's `a < 0` branch is expressible only by qualifying `set` — which the `rule` then contradicts. | Add `"lowerHalfPlane"`, or make `rule` a predicate expression like `hypotheses[].check`. |
| **G5** | **`contour.orientation` is a literal where a family needs an expression.** B1's closed path is ccw for `a > 0` and cw for `a < 0`. The arc geometry *can* say this (`theta1: "pi*sign(a)"`, since DESIGN §2.2 derives arc orientation from the angle sign), but the contour-level string cannot, so the two can disagree — the exact failure §2.2 says it eliminated. | `orientation: "ccw" \| "cw" \| { expr: ExprNode }`, or derive it from the pieces and assert, as `closed` already is. |
| **G6** | **Two unreconciled check namespaces.** `hypotheses[].check` uses `algebraic:`/`structural:`; `vanishingLemmas[].discharge` uses `symbolic:`. Nothing says whether `algebraic:` and `symbolic:` are the same evaluator. Since `discharge` is the honest-labelling hinge, the distinction cannot be left to convention. | One registry, one prefix set, with the tier (PLAN §3.2) attached to each namespace. |
| **G7** | **`Scalar` has no string arm.** DESIGN §2.1 defines `Scalar = number \| { expr: ExprNode }`, but research 03 §15 (and every record here) writes geometry as bare strings (`"radius": "R"`). The loader must lift strings; the type should say so. | `Scalar = number \| string \| { expr: ExprNode }`, with `string` normalised at load. |
| **G8** | **`Family.target` omits `substitution`,** which DESIGN §2.3's `RealIntegral` has. Pass 4 (COVER) explicitly needs it ("under the declared substitution if any"), and half of tier A is unrepresentable without it. Probably an oversight in §5 rather than a decision. | Add `substitution?` to `Family.target`, mirroring `RealIntegral`. |
| **G9** | **The substitution's Jacobian has nowhere to live**, so "the contour integrand's singular set ≠ the posed integrand's" — the single most instructive fact in tier A (A1 removable, A3 order `n`, A4 the only pole) — is recordable only as prose in a trap message. | `substitution.jacobian: string`, and a Pass-2 row that reports manufactured singularities separately from intrinsic ones. |
| **G10** | **No way to distinguish absolute from conditional convergence.** `target.principalValue?: boolean` is the only nearby field and it is the *wrong* one: B2 converges as a genuine improper integral (Dirichlet), is not absolutely convergent, and is not a principal value. research 03 §3 trap (ii) requires the label to record the failure of absolute convergence. | `target.convergence?: "absolute" \| "conditional" \| "principalValue"`, subsuming the boolean. |
| **G11** | **No Family-level restriction field.** `@cas/rigor`'s `Certificate.restriction` exists and DESIGN §3 insists restrictions must travel with a verdict — but `closedForm.expr` is a single expression with no scope attached, so A1's `sgn(a)` and A2's `\|a\|≶1` switch have no structural home. A restricted formula that loses its restriction becomes false, which is §3's own stated rule. | `closedForm.cases?: { when: string; expr: string }[]`, or a `restriction` field feeding `Verdict.restrictions`. |

### 3.2 Smaller things

- **`SymbolSpec`, `FamilyPiece`, `TemplateId`, `LemmaId` and `Rung` are referenced but never
  defined.** I used `{kind: "realParam" | "intParam" | "polynomial" | "rationalFn" | "entireFn", var?}`
  for `SymbolSpec` and DESIGN §2.2's `Piece` (minus nothing) for `FamilyPiece`; research 03 §15 uses
  a *different* piece shape (`{id, kind:"segment", from, to, argOffset, role}`) that does not match
  `Piece` at all. One of the two needs to give.
- **`parameters[].constraints` has no namespace**, unlike `hypotheses[].check`, so "executable
  predicate" is asserted but unenforceable. I wrote them as `@cas/expr`-evaluable booleans over the
  parameter scope.
- **`golden[].numeric: number | [number, number]`** — the tuple is presumably an enclosure, but
  nothing says so and nothing says what `verifiedTo` means against one (width? containment?). All
  fixtures here are scalars.
- **`golden[]` has no provenance field.** PLAN §8.1 wants agreement "to the estimator's own bound",
  but the estimator is not in the record. I overloaded `verifiedTo` with the observed relative
  agreement; a `method` string would be more honest. My own golden params also use ad-hoc keys
  (`halfRange`, `closeDown`, `companion`) that are not parameters of the family — `golden[].params`
  is typed `Record<string, string|number>` and so accepts them silently, which is convenient and
  probably wrong.
- **`traps[].detect` has no declared namespace and needs a third kind.** Research 03 §15 mixes
  data-shape predicates (`branch.argRange != (0,2pi)`) with hypothesis back-references
  (`hypotheses.no-poles-on-cut == false`). Half the traps here are a third kind — *"the derivation
  did X"* (used the simple-pole formula at an order-2 pole; dropped the `1/(m−1)!`; summed a pole
  with winding number 0) — which is an event in the ledger, not a property of the Family. Those are
  written as `structural:` predicates over derivation state, which is an invention.
- **Research 03 §15's example trap `branch-point-is-not-a-pole` has no `detect` field**, though
  `traps[].detect: string` is not optional in DESIGN §5. Every trap here has one; some are
  necessarily post-conditions on the computed answer (A2's `numeric:value < 0`) rather than
  preconditions, which the Ledger's six passes have no slot for — there is no Pass 7.

### 3.3 What I could not verify

- **Nothing numerical.** All ten closed forms, all residues, all pole orders, all winding-number
  assignments and every quantitative claim in a trap message (the `17π/12`, the `π/4`, the ML/Jordan
  tables, `cosh R`, `(2/π)ln L`, `3.258950×10²⁰`) were computed and are reproduced above.
- **Not checked:** that `algebraic:upperHalfPlaneRootCount` via Möbius + Schur–Cohn actually reuses
  QD's kernel unmodified — the *mathematics* is standard and the QD interval Schur–Cohn exists, but
  whether it accepts a `ℚ(i)` polynomial in this shape is an implementation question for M2, not a
  paper one.
- **Not checked:** whether `@cas/exact` ships a certified rational enclosure of `π`. Every value in
  this file has a `π` in it, so **no tier-A/B decimal can be certified without one**, independently
  of G-anything and independently of B3's transcendental problem. If it does not exist, that is a
  small, well-scoped kernel task (`piUp`/`piDown` alongside `sqrtUp`/`sqrtDown`, DESIGN §6.1) and it
  gates the honesty of every rendered number in the gallery.
