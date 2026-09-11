// B1 — `jordan-cosine-kernel`, transcribed from `docs/contour-integration/gallery/tier-ab.md` §2.
//
// The entry where **the side you close on stops being a matter of taste**. `|e^{iaz}| = e^{−a·Im z}`
// is bounded only where `a·Im z ≥ 0`, so the sign of `a` picks the half-plane — and the same exact-ℚ
// bound code that prints `|∫_arc| ≤ 1.257140×10⁻³` for the right choice prints `3.258950×10²⁰` for
// the wrong one. One code path, success and diagnostic, with no "wrong contour" detector anywhere.
//
// It also carries research 03 §3's *fatal* trap: complexify to `e^{iaz}` and take `Re` at the end,
// because `|cos(az)|` grows like `e^{|a||Im z|}` in BOTH half-planes and no closing direction exists
// at all. Worth noting against B2: here `deg Q − deg P = 2`, so plain L2 would discharge this arc
// too — B1 is Jordan *by family*, not Jordan *by necessity*.
import { pt } from "../../engine/contour/model.js";
import type { Family } from "../schema.js";

export const b1JordanCosineKernel: Family = {
  id: "jordan-cosine-kernel",
  title: "∫_ℝ cos(ax)/(x²+b²) dx = (π/b) e^{−ab} — Jordan, and the sign of a as a hard branch",
  taxonomySection: "3",
  tier: "B",

  targets: [
    {
      id: "I",
      kind: "integral",
      variable: "x",
      lower: "-inf",
      upper: "inf",
      integrand: "cos(a*x)/(x^2 + b^2)",
      convergence: "absolute",
      symbols: {
        a: { kind: "realParam" },
        b: { kind: "realParam" },
        R: { kind: "rationalFn", var: "x" }, // R(x) = 1/(x²+b²), real-valued on ℝ
      },
    },
  ],

  // The contour integrand is R(z)·e^{iaz} and the target is its REAL part — legitimate only because
  // R ∈ ℝ(x), which `hypotheses.real-on-R` is the executable form of.
  auxiliary: {
    integrand: "exp(i*a*z)/(z^2 + b^2)",
    relation: "Re",
    note: "cos(ax) = Re e^{iax}; the contour sees the exponential and the target takes the real part at the end",
  },

  parameters: [
    // UNCONSTRAINED DELIBERATELY. Every a ∈ ℝ is legal, INCLUDING a = 0, which degenerates to §2 and
    // still closes because deg Q − deg P = 2 ≥ 2. What the sign of a constrains is the CONTOUR, not
    // the parameter — hence `closing-side-matches-sign-of-a` below, where a would-be constraint like
    // "a > 0" actually belongs.
    { name: "a", domain: "real", constraints: ["isReal(a)"] },
    // b ↦ −b is a symmetry of the integrand, so the engine normalises to |b|. See traps.
    { name: "b", domain: "real", constraints: ["b != 0"] },
  ],

  hypotheses: [
    {
      id: "no-real-poles",
      statement: "z² + b² has no real zero ⟺ b ≠ 0",
      check: "algebraic:noRealRoot(x^2 + b^2)",
      onFail: "refuse",
    },
    {
      id: "real-on-R",
      statement:
        "R ∈ ℝ(x), so Re/Im of the contour value are the cos/sin integrals — false for complex-coefficient R",
      check: "structural:hasRealCoefficients(R)",
      onFail: "refuse",
    },
    {
      id: "closing-side-matches-sign-of-a",
      statement:
        "the arc lies in the half-plane where a·Im z ≥ 0, i.e. upper for a > 0 and lower for a < 0",
      check: "structural:arcHalfPlane(contour) == halfPlaneOf(sign(a))",
      onFail: "refuse",
    },
    {
      id: "decay-to-zero-in-closing-half-plane",
      statement:
        "M_R = max_{C_R}|R(z)| → 0, which is all Jordan needs (deg Q ≥ deg P + 1 suffices)",
      check: "algebraic:decayExponent(numer(R), denom(R)) >= 1",
      onFail: "refuse",
    },
  ],

  // branch: DELIBERATELY OMITTED. R(z)·e^{iaz} is single-valued on all of ℂ — exp is entire, R is
  // rational. exp does have an ESSENTIAL singularity at ∞, which matters for B3's cross-checks but
  // creates no branch point and no cut.

  contour: {
    template: "semicircle",
    limitParams: [{ name: "R_lim", to: "inf" }], // named R_lim: `R` is the rational function
    // The record settles for a prose caveat on `orientation` and calls the gap G5. This is the field
    // that closes it: `theta1 = π·sgn(a)` is not affine in `a`, but it IS affine in `sgnA`.
    derived: [{ name: "sgnA", expr: "if(a < 0, -1, 1)" }],
    pieces: [
      {
        id: "realAxis",
        name: "the real segment [−R, R]",
        geom: {
          kind: "segment",
          from: pt({ param: "R_lim", mul: -1 }, 0),
          to: pt({ param: "R_lim" }, 0),
        },
        role: "target",
        colour: 0,
      },
      {
        id: "arc",
        name: "the R → ∞ semicircle (upper when a > 0, lower when a < 0)",
        geom: {
          kind: "arc",
          center: pt(0, 0),
          radius: { param: "R_lim" },
          theta0: 0,
          // θ₁ − θ₀ = π·sgn(a): positive ⇒ ccw upper arc, negative ⇒ cw lower arc. DESIGN §2.2:
          // "orientation of an arc is the sign of (theta1 − theta0); no separate flag."
          theta1: { param: "sgnA", mul: Math.PI },
        },
        role: "vanish",
        lemma: "L3",
        colour: 1,
      },
      // GAP G1, still open: this arc is ALSO dischargeable by L2 (deg gap 2), and there is no way to
      // record a second, independent lemma for one piece. That redundancy is exactly what
      // distinguishes B1 from B2, and it remains inexpressible.
    ],
    orientation: { expr: "if(a < 0, -1, 1)" },
    windings: [
      { pole: "i*abs(b)", n: "if(a < 0, 0, 1)" },
      { pole: "-i*abs(b)", n: "if(a < 0, 1, 0)" },
    ],
  },

  vanishingLemmas: [
    {
      piece: "arc",
      lemma: "L3",
      sideCondition:
        "a·Im z ≥ 0 on the arc (so |e^{iaz}| = e^{−a Im z} ≤ 1), and M_R = max_{C_R}|R| → 0",
      // Jordan's bound is R-free in the leading factor: |∫_{C_R} e^{iaz}R(z) dz| ≤ (π/|a|)·M_R. Its
      // entire content is ∫₀^π e^{−κ sin θ}dθ ≤ π/κ, from sin θ ≥ 2θ/π on [0,π/2] (PLAN §3.2).
      // At R = 50, a = b = 1: M_R ≤ 4.001601e-4, |∫_arc| ≤ π·M_R = 1.257140e-3, O(R⁻²) → 0.
      // (Plain ML would give π·R·M_R = 6.285700e-2 — also → 0 here, since deg gap = 2. See G1.)
      discharge: "symbolic:jordanBound(R, a, R_lim)",
      rigorOfBound: "≤",
      rigorOfLimit: "=",
      rigorIfNumericOnly: "≈",
    },
  ],

  residueSelection: { rule: "upperHalfPlane", set: "poles of R with sign(a)·Im z > 0" },
  // GAP G4, still open: the `rule` enum has `lowerHalfPlane` but no PARAMETERISED half-plane, so the
  // a < 0 branch is expressible only by qualifying `set` — which the enum then contradicts.

  closedForm: {
    expr: "re(2*pi*i*sign(a)*Sum(Res(R(z)*exp(i*a*z), z_k), sign(a)*im(z_k) > 0))",
    // The textbook form (π/b)e^{−ab} is valid only on a > 0, b > 0. Both |·| are load-bearing.
    simplified: "(pi/abs(b))*exp(-abs(a)*abs(b))",
  },

  rigor: {
    policy: "min",
    inputs: [
      "hypotheses.*",
      "vanishingLemmas.*.rigor",
      "residues.*.rigor",
      "windingNumbers.*",
      "target.convergence",
    ],
  },

  traps: [
    {
      id: "wrong-half-plane-for-sign-of-a",
      detect: "numeric:sign(a) * structural:arcImSign(contour) < 0",
      message:
        "|e^{iaz}| = e^{−a·Im z}. On the LOWER arc with a > 0 that is e^{+aR|sin θ|}, so at R = 50, a = b = 1 the same ML/Jordan code path returns a bound of 3.258950×10²⁰ instead of 1.257140×10⁻³, and the bound DIVERGES as R → ∞. This is not a sign to be patched at the end: the closed-contour identity itself is false, because the arc's contribution does not vanish. The ledger row reads '⚠ — this argument does not close', produced by exactly the same code that produces the success row (DESIGN §4 Pass 3). The residue at the lower pole −ib carries e^{+ab} = 2.71828 at a = b = 1, which is the same divergence seen from the other side.",
    },
    {
      id: "cosine-not-exponential",
      detect: "structural:contourIntegrandContains(cos(a*z))",
      message:
        "The fatal one (research 03 §3 trap (i)). Replacing cos(ax) by cos(az) rather than by e^{iaz} produces an integrand whose modulus grows like e^{|a||Im z|}/2 in BOTH half-planes — max_{|z|=10}|cos z| ≈ cosh 10 = 1.1013×10⁴, max_{|z|=50}|cos z| ≈ 2.5924×10²¹ — so NO closing direction works and the method has no repair. Complexify to the exponential, evaluate the contour integral exactly, and take the real part at the very end. The engine can detect this structurally before computing anything.",
    },
    {
      id: "sine-companion-nonzero",
      detect: "numeric:abs(im(2*pi*i*residueSum)) > tol",
      message:
        "R(x) = 1/(x²+b²) is even and real on ℝ, so ∫_ℝ sin(ax)/(x²+b²) dx = 0 by parity — and the same contour delivers it as Im[(π/b)e^{−ab}] = 0, for free. A nonzero imaginary part means a sign or orientation bug, not a new result (research 03 §3 trap (iv)). Note the companion over the HALF line is not zero: ∫₀^∞ sin x/(x²+1) dx = 0.6467611228, so the parity argument must be tied to the actual limits.",
    },
    {
      id: "b-sign-not-normalised",
      detect: "numeric:b < 0",
      message:
        "(π/b)e^{−ab} is ODD in b while the integrand 1/(x²+b²) is EVEN in b, so the closed form must use |b|. The residue machinery is fine either way — for b < 0 the pole in the upper half-plane is −ib = i|b| and everything follows — but the printed form is not. This is the same failure as A1's textbook-form-drops-sign: a legality hypothesis (b ≠ 0) that is strictly weaker than the closed form's hypothesis (b > 0).",
    },
    {
      id: "a-zero-degenerates",
      detect: "numeric:a == 0",
      message:
        "At a = 0 the exponential disappears and this is §2, not §3. Jordan's bound (π/|a|)M_R is π/0 = ∞ and says nothing — correctly, since Jordan has no content without exponential decay. Here it does not matter, because deg Q − deg P = 2 and L2 discharges the arc anyway, giving π/b. But the family must notice the degeneration and switch lemmas rather than report an infinite bound as a failure (research 03 §3 trap (iii)).",
    },
  ],

  golden: [
    {
      params: { a: 1, b: 1 },
      value: "pi/e",
      numeric: 1.1557273497909217,
      verifiedTo: 1e-15,
      method:
        "Res(e^{iz}/(z²+1), i) = e^{−1}/(2i) exactly in the exponential basis, giving 2πi·Res = π/e; cross-checked against a small-circle quadrature (−0.183939720585721 i) and the contour quadrature",
    },
    {
      params: { a: 2, b: 3 },
      value: "(pi/3)*exp(-6)",
      numeric: 0.0025957432094282466,
      verifiedTo: 1e-14,
      method: "a ≠ b, so the exponent −ab = −6 is neither the frequency nor the pole location alone",
    },
    {
      params: { a: 0.5, b: 2 },
      value: "(pi/2)*exp(-1)",
      numeric: 0.57786367489546087,
      verifiedTo: 1e-15,
      method: "a fractional frequency: ab = 1 again, from a different pair",
    },
    {
      params: { a: -1, b: 1 },
      value: "pi/e",
      numeric: 1.1557273497909217,
      verifiedTo: 1e-15,
      method:
        "THE SIGN CASE: a < 0 closes through the LOWER half-plane, the enclosed pole becomes −i, the closed path runs clockwise, and the two sign flips cancel to the same π/e — which is what `derived.sgnA` exists to make executable rather than commented",
    },
    {
      params: { a: 3, b: 0.5 },
      value: "2*pi*exp(-1.5)",
      numeric: 1.4019681438332423,
      verifiedTo: 1e-15,
      method: "b < 1, so the pole is close to the real axis and the exponent is not an integer",
    },
    {
      params: { a: 0, b: 1 },
      value: "pi",
      numeric: 3.1415926535897931,
      verifiedTo: 1e-15,
      method:
        "THE DEGENERATION: at a = 0 the exponential is 1, Jordan's π/|a| is infinite and says nothing, and plain ML discharges the arc instead — the fixture that catches an engine treating π/0 as a failure",
    },
  ],
};
