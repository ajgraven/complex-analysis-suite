// A5 — `semicircle-order2`, transcribed from `docs/contour-integration/gallery/tier-ab.md` §1.
//
// The first entry with an auxiliary piece, and the first place the DEGREE CONDITION IS COMPUTED
// RATHER THAN ASSERTED: `deg Q − deg P = 4` appears nowhere in `hypotheses`. It falls out of the
// exact-ℚ ML bound as an asymptotic statement about `θ·R·M(R)`, and the same code path that prints
// a vanishing bound here prints a diverging one when the user closes the wrong way (B1).
import { pt } from "../../engine/contour/model.js";
import type { Family } from "../schema.js";

export const a5SemicircleOrder2: Family = {
  id: "semicircle-order2",
  title: "∫_{−∞}^{∞} dx/(1+x²)² by a semicircle",
  titleLatex: "$\\int_{-\\infty}^{\\infty}\\frac{dx}{(1+x^2)^2}$ by a semicircle",
  taxonomySection: "Rational functions on ℝ",
  tier: "A",

  description: {
    contour: "$[-R,R]$ closed by $\\Gamma_R$, the upper semicircle $|z|=R$",
    point:
      "A double pole at $i$: the residue needs the derivative formula (or the Laurent series); the simple-pole quotient $P/Q'$ is $0/0$ there.",
    citations: [
      { book: "Ahlfors", where: "Ch. 4 §5.3", text: "type (ii)" },
      { book: "Brown–Churchill", where: "§79", text: "" },
      { book: "Conway", where: "Ch. V §2", text: "" },
    ],
  },

  targets: [
    {
      id: "I",
      kind: "integral",
      variable: "x",
      lower: "-inf",
      upper: "inf",
      integrand: "1/(1 + x^2)^2",
      // Not a principal value, and that is a claim, not an omission: the integral converges
      // absolutely, which `hypotheses.target-absolutely-convergent` is the executable form of.
      convergence: "absolute",
      symbols: {
        P: { kind: "polynomial", var: "x" }, // P = 1
        Q: { kind: "polynomial", var: "x" }, // Q = (1+x²)² = x⁴ + 2x² + 1
      },
      // substitution: NONE. The real axis IS a piece of the contour, so there is no Jacobian and
      // therefore no manufactured pole at the origin. Contrast A1/A3/A4.
    },
  ],

  // EMPTY DELIBERATELY: A5 is a fixed instance, not a family in a parameter. `P` and `Q` are
  // `symbols` (structural inputs the hypotheses run on), not `parameters` (numbers with domains and
  // UI knobs). The distinction drives which predicates can see them.
  parameters: [],

  hypotheses: [
    {
      id: "coprime",
      statement:
        "gcd(P,Q) = 1 over ℚ(i) — any common factor is a removable singularity and must be cancelled and NAMED first",
      check: "algebraic:gcd(P, Q) == 1",
      onFail: "refuse",
    },
    {
      id: "no-real-poles",
      statement: "Q has no real zero (else §4's indented contour applies, not this family)",
      check: "algebraic:noRealRoot(Q)",
      onFail: "refuse",
    },
    {
      id: "target-absolutely-convergent",
      // Recorded separately from the arc's vanishing on purpose: at deg Q = deg P + 1 the arc bound
      // still tends to a finite limit while the target fails to converge, and only this row catches
      // that (research 03 §2 trap (i)).
      statement:
        "∫_ℝ |P/Q| dx converges. This is the TARGET's convergence — a different fact from the arc's vanishing, which is DERIVED in vanishingLemmas[0] and not asserted anywhere.",
      check: "algebraic:decayExponent(P, Q) >= 2",
      onFail: "refuse",
    },
    {
      id: "pole-order-exact",
      statement:
        "pole multiplicities come from Yun squarefree decomposition of Q, not from clustering floating roots",
      check: "algebraic:squarefreeDecompose(Q) is well-defined",
      onFail: "refuse",
    },
  ],

  // branch: DELIBERATELY OMITTED — P/Q is rational, hence single-valued on ℂ.

  contour: {
    template: "semicircle",
    limitParams: [{ name: "R", to: "inf" }],
    pieces: [
      {
        id: "realAxis",
        name: "the real segment [−R, R]",
        geom: {
          kind: "segment",
          from: pt({ param: "R", mul: -1 }, 0),
          to: pt({ param: "R" }, 0),
        },
        role: "target",
        colour: 0,
      },
      {
        id: "arc",
        name: "the $R \\to \\infty$ semicircle",
        geom: {
          kind: "arc",
          center: pt(0, 0),
          radius: { param: "R" },
          theta0: 0,
          theta1: Math.PI,
        },
        role: "vanish",
        lemma: "L2",
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
      lemma: "L2",
      sideCondition: "∃ p > 1, M, R₀ : |P(z)/Q(z)| ≤ M/|z|^p on C_R for all R ≥ R₀",
      // DESIGN §6.2, in exact ℚ: num(R) = 1, den(R) = R⁴ − 2R² − 1 > 0 ⟺ R > 1.5538, and den(R) > 0
      // ALSO certifies every pole is strictly inside |z| = R. At R = 50: den = 6244999,
      // M = 1.601281e-7, |∫_arc| ≤ 2.515287e-5.
      // THE DEGREE CONDITION IS THE OUTPUT: M(R) ~ (|a_p|/|b_q|) R^{p−q}, so the arc bound is
      // O(R^{p−q+1}) = O(R⁻³) here and vanishes iff q ≥ p + 2. Nothing asserts that.
      discharge: "symbolic:mlRational(P, Q, arc='upper', R)",
      // The record wrote a single `rigorIfDischarged: "="` and flagged the conflict with DESIGN §4
      // Pass 3's "≤" as gap G2. v2 splits the two claims, which dissolves it: the finite-R bound is
      // a bound, the substituted limit is exact.
      rigorOfBound: "≤",
      rigorOfLimit: "=",
      rigorIfNumericOnly: "≈",
    },
  ],

  residueSelection: { rule: "upperHalfPlane" },

  closedForm: {
    expr: "2*pi*i*Sum(Res(P(z)/Q(z), z_k), im(z_k) > 0)",
    simplified: "pi/2",
  },

  rigor: {
    policy: "min",
    inputs: [
      "hypotheses.*",
      "vanishingLemmas.*.rigor",
      "residues.*.rigor",
      "windingNumbers.*",
      "residueSelection.ladderRung",
    ],
  },

  traps: [
    {
      id: "simple-pole-formula-at-multiple-pole",
      detect: "algebraic:derivative(Q)(z_k) == 0",
      message:
        "Res = P(z₀)/Q′(z₀) is formula (2) and its hypothesis is Q′(z₀) ≠ 0, i.e. z₀ is a SIMPLE root of Q. Here Q = (1+z²)², Q′ = 4z(1+z²), and Q′(i) = 0: the shortcut is 0/0 and the engine must refuse, not round. The order-2 formula Res = (1/1!)·d/dz[(z−i)²f]|_{z=i} = −2(z+i)⁻³|_{z=i} = 1/(4i) = −i/4 is mandatory, and the DERIVATIVE is where the answer lives — evaluating (z−i)²f at z = i without it gives 1/(2i)² = −1/4 and hence 2πi(−1/4) = −iπ/2, a purely imaginary number for an integral of a positive function. Any repeated root of Q is the same story; Yun's squarefree decomposition finds them all before any residue is attempted.",
    },
    {
      id: "degree-gap-one",
      detect: "algebraic:decayExponent(P, Q) == 1",
      message:
        "At deg Q = deg P + 1 the residue sum still returns a finite, plausible number and the target does not converge — ∫ x dx/(1+x²) exists only as a principal value. This family must REFUSE, not report, and the refusal comes from hypotheses.target-absolutely-convergent, which is why that row exists separately from the arc's discharge: the arc's ML bound at gap 1 tends to a finite nonzero limit rather than diverging (see B2), so the arc alone raises no alarm.",
    },
    {
      id: "closing-down-sign",
      detect: "structural:arcSide(contour) == 'lower' && structural:residueSign == '+'",
      message:
        "The lower semicircle is traversed CLOCKWISE as part of the closed path, so the identity is ∫_ℝ = −2πi Σ_{Im z<0} Res, not +2πi. Here Res(f,−i) = +i/4 and −2πi(i/4) = π/2, agreeing exactly with the upward closure — a free consistency check that research 03 §2 recommends and that the engine should run on every §2 entry. Getting −π/2 means the orientation was read from the arc's angle sign but not applied to the residue sum.",
    },
    {
      id: "half-range-requires-even",
      detect: "structural:isEven(P/Q) == false && target.lower == '0'",
      message:
        "∫₀^∞ = ½∫_ℝ holds only for an EVEN integrand. 1/(1+x²)² is even, so ∫₀^∞ dx/(1+x²)² = π/4 is a legitimate free corollary; x/(1+x²)² is not, and the same manipulation there converts a convergent odd integral (value 0 by symmetry) into a nonzero claim.",
    },
  ],

  golden: [
    {
      params: {},
      value: "pi/2",
      numeric: 1.5707963267948966,
      verifiedTo: 1e-14,
      method:
        "the exact residue by the order-2 derivative formula, cross-checked by the Laurent series in $w = z - i$, which needs no factorial, and by a small-circle quadrature at $r = 10^{-4}$",
    },
    {
      params: { halfRange: true },
      label: "half-range corollary",
      value: "pi/4",
      numeric: 0.78539816339744828,
      verifiedTo: 1e-14,
      method:
        "the half-range corollary $\\int_0^{\\infty} = \\tfrac12\\int_{\\mathbb{R}}$, which holds because the integrand is even",
    },
  ],
};
