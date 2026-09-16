// B2 — `jordan-strict`, transcribed from `docs/contour-integration/gallery/tier-ab.md` §2.
//
// The one entry in tiers A and B where **Jordan is not a convenience but the only thing that
// works**, and the one where the failure of the alternative is *quiet*. With `deg Q − deg P = 1` the
// ML bound on the semicircle is `πR·M_R → π`: it does not diverge, so nothing looks alarming, and it
// does not vanish, so it proves nothing. A bound with a finite non-zero limit is the worst possible
// outcome and the hardest to notice. Jordan trades the factor `R` for the constant `π/a` by using
// the actual exponential decay, and lands within a factor of two of the true arc integral.
//
// B2 is also the first entry whose **target converges only conditionally**: `∫|x sin x/(1+x²)| dx`
// diverges like `(2/π) ln L`, so `π/e` is a Dirichlet limit and *not* a principal value.
import { pt } from "../../engine/contour/model.js";
import type { Family } from "../schema.js";

export const b2JordanStrict: Family = {
  id: "jordan-strict",
  title: "∫_{−∞}^{∞} x sin x dx/(1+x²) by Jordan's lemma",
  titleLatex: "$\\int_{-\\infty}^{\\infty}\\frac{x\\sin x}{1+x^2}\\,dx$ by Jordan's lemma",
  taxonomySection: "Fourier-type integrals and Jordan's lemma",
  tier: "B",

  description: {
    contour: "$[-R,R]$ closed by $\\Gamma_R$, integrand $ze^{iz}/(1+z^2)$",
    point:
      "$\\deg Q-\\deg P=1$, so the $ML$-estimate on $\\Gamma_R$ tends to $\\pi$, not $0$; Jordan's lemma, which needs only $\\max_{\\Gamma_R}|z/(1+z^2)|\\to0$, is required.",
    citations: [
      { book: "Ahlfors", where: "Ch. 4 §5", text: "" },
      { book: "Brown–Churchill", where: "§81", text: "Jordan's lemma" },
      { book: "Marsden–Hoffman", where: "§4", text: "" },
    ],
  },

  targets: [
    {
      id: "I",
      kind: "integral",
      variable: "x",
      lower: "-inf",
      upper: "inf",
      integrand: "x*sin(x)/(1 + x^2)",
      // CONDITIONAL, AND THAT IS A SUBSTANTIVE CLAIM, NOT A DEFAULT. ∫₀^A converges as A → ∞ by
      // Dirichlet (x/(1+x²) ↓ 0 monotonically for x > 1, ∫sin bounded), so both limits may be taken
      // independently and no symmetric pairing is needed — it is simply not ABSOLUTELY convergent.
      // The record called this gap G10; v2's three-state `convergence` is what closed it.
      convergence: "conditional",
      symbols: { R: { kind: "rationalFn", var: "x" } }, // R(x) = x/(1+x²)
    },
  ],

  auxiliary: {
    integrand: "z*exp(i*z)/(1 + z^2)",
    relation: "Im",
    note: "sin x = Im e^{ix}; the imaginary part is the target here, and the real part is the free companion ∫ x cos x/(1+x²) = 0",
  },

  parameters: [], // a is pinned at 1 by the gallery entry; the Jordan constant is π/a = π.

  hypotheses: [
    {
      id: "no-real-poles",
      statement: "1 + x² has no real zero",
      check: "algebraic:noRealRoot(1 + x^2)",
      onFail: "refuse",
    },
    {
      id: "real-on-R",
      statement: "R ∈ ℝ(x), so Im of the contour value is the sine integral",
      check: "structural:hasRealCoefficients(R)",
      onFail: "refuse",
    },
    {
      id: "jordan-decay",
      statement: "M_R = max_{C_R}|R| → 0 — Jordan's ONLY hypothesis on R, weaker than L2's p > 1",
      check: "algebraic:decayExponent(numer(R), denom(R)) >= 1",
      onFail: "refuse",
    },
    {
      id: "L2-unavailable",
      statement:
        "deg Q − deg P = 1, so no p > 1 exists and L2 is INAPPLICABLE — recorded so the engine cannot silently substitute it",
      check: "algebraic:decayExponent(numer(R), denom(R)) < 2",
      onFail: "warn",
    },
    {
      id: "target-converges-conditionally",
      statement:
        "∫_ℝ x sin x/(1+x²) dx converges (Dirichlet) but NOT absolutely; the label must carry that",
      check: "algebraic:absolutelyConvergent(target) == false",
      onFail: "warn",
    },
  ],

  // branch: DELIBERATELY OMITTED — R(z)e^{iz} is single-valued (rational × entire).

  contour: {
    template: "semicircle",
    limitParams: [{ name: "R_lim", to: "inf" }],
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
        name: "the $R \\to \\infty$ semicircle (upper: $a = 1 > 0$)",
        geom: {
          kind: "arc",
          center: pt(0, 0),
          radius: { param: "R_lim" },
          theta0: 0,
          theta1: Math.PI,
        },
        // Unlike B1 and B3, L2 is NOT an alternative here. This is the only tier-A/B arc for which
        // exactly one lemma applies — which is why gap G1 (no second lemma per piece) is invisible
        // in this record and load-bearing in the other two.
        role: "vanish",
        lemma: "L3",
        colour: 1,
      },
    ],
    orientation: "ccw",
    windings: [
      { pole: "i", n: "1" },
      { pole: "-i", n: "0" },
    ],
  },

  vanishingLemmas: [
    {
      piece: "arc",
      lemma: "L3",
      sideCondition:
        "a = 1 > 0 and the arc is in the upper half-plane (|e^{iz}| ≤ 1 there); M_R = max_{C_R}|z/(1+z²)| → 0",
      // |∫_{C_R} e^{iz} z/(1+z²) dz| ≤ (π/a)·M_R with M_R ≤ R/(R²−1), exact in ℚ.
      // At R = 10⁴: Jordan gives 3.142e-4 against a true arc integral of 1.902e-4 — within a factor
      // of two. ML would give πR·M_R = 3.14159, a finite non-zero limit that proves nothing.
      discharge: "symbolic:jordanBound(R, 1, R_lim)",
      rigorOfBound: "≤",
      rigorOfLimit: "=",
      rigorIfNumericOnly: "≈",
    },
  ],

  residueSelection: { rule: "upperHalfPlane" },

  closedForm: {
    expr: "im(2*pi*i*Sum(Res(z*exp(i*z)/(1+z^2), z_k), im(z_k) > 0))",
    simplified: "pi/exp(1)",
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
      id: "ml-insufficient",
      detect: "algebraic:decayExponent(numer(R), denom(R)) <= 1 && structural:lemmaUsed == 'L2'",
      message:
        "With deg Q − deg P = 1 the ML bound on the semicircle is πR·M_R with M_R ~ 1/R, so it tends to π — a FINITE NONZERO limit. That is the worst failure mode available: the bound does not diverge, so nothing looks broken, and it does not vanish, so it proves nothing. Measured: 3.17333 at R = 10, 3.14159 at R = 10⁴. Jordan's lemma trades the factor R for the constant π/a by using the real exponential decay, ∫₀^π e^{−aR sin θ}dθ ≤ π/(aR), itself from sin θ ≥ 2θ/π on [0,π/2]; its bound is 3.142×10⁻⁴ at R = 10⁴ against a true arc integral of 1.902×10⁻⁴. The hypothesis weakens from R = O(|z|^{−1−ε}) to merely R → 0, and that gap is exactly what makes this integral reachable.",
    },
    {
      id: "conditional-convergence-unlabelled",
      detect: "algebraic:absolutelyConvergent(target) == false && structural:labelClaims('absolute')",
      message:
        "|x sin x/(1+x²)| ~ |sin x|/x, and ∫₁^L |sin x|/x dx ~ (2/π) ln L → ∞ (measured 6.0829 at L = 4000π versus (2/π)ln(4000π) = 6.0089). So π/e is a conditionally convergent value: a Dirichlet limit of ∫_{−A}^{B} as A, B → ∞ independently. It is NOT a principal value — setting principalValue would be a DIFFERENT and also false claim, since no symmetric pairing is needed. The practical consequence is that Fubini and differentiation under the integral sign are not automatically licensed on this integrand, which matters the moment anyone tries to get a parameterised family out of it.",
    },
    {
      id: "wrong-half-plane",
      detect: "structural:arcHalfPlane(contour) == 'lower'",
      message:
        "Closing downward puts the pole at −i, where the residue involves e^{+1}, and makes |e^{iz}| = e^{R|sin θ|} on the arc: the bound diverges like e^R. Since a = 1 is fixed and positive here, the upper half-plane is the only legal closure and the engine should refuse rather than report the lower-closure residue sum, which is finite and wrong.",
    },
    {
      id: "jordan-with-zero-rate",
      detect: "numeric:a == 0 && structural:lemmaUsed == 'L3'",
      message:
        "Jordan's constant is π/a where a is the EXPONENTIAL RATE, not the pole location and not the degree. At a = 0 it is π/0 = ∞, correctly reporting that Jordan has no content without exponential decay — and indeed ∫_ℝ x/(1+x²) dx exists only as a principal value (research 03 §2 trap (i)). An engine that treats an infinite Jordan constant as a numerical overflow rather than as a statement will paper over exactly the case it was built to catch.",
    },
  ],

  golden: [
    {
      params: {},
      value: "pi/exp(1)",
      numeric: 1.1557273497909217,
      verifiedTo: 1e-15,
      method:
        "Res(z e^{iz}/(1+z²), i) = i e^{−1}/(2i) = e^{−1}/2 exactly in the exponential basis, so 2πi·Res = iπ/e and the IMAGINARY part is the target; cross-checked against a small-circle quadrature (0.183939720585720) and the contour quadrature to 7.7e-16 relative",
    },
    {
      params: { companion: "re" },
      label: "the cosine companion",
      value: "0",
      numeric: 0,
      verifiedTo: 1e-14,
      method:
        "the free companion ∫_ℝ x cos x/(1+x²) dx = Re(iπ/e) = 0 — the integrand is odd AND the integral converges (Dirichlet), so this is a genuine zero, not just a symmetric-limit zero",
    },
  ],
};
