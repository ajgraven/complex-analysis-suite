// A7 — `semicircle-order3`, transcribed from `docs/contour-integration/gallery/tier-ab.md` §1.
//
// Same contour as A5, one order higher, and that is enough to change the METHOD: the (m−1)-th
// derivative of a quotient blows up superlinearly, so at m ≥ 3 the engine prefers formula (4) —
// Taylor-shift to w = z−i, invert the truncated series over ℚ(i), read c₋₁. A7 is why
// `@cas/exact`'s series module exists. Its trap is A5's sibling and strictly nastier: dropping the
// 1/(m−1)! returns π/4, which is real, positive, and of the right order of magnitude, so it
// survives every cheap check a reader is likely to apply.
import { pt } from "../../engine/contour/model.js";
import type { Family } from "../schema.js";

export const a7SemicircleOrder3: Family = {
  id: "semicircle-order3",
  title: "∫_ℝ x² dx/(1+x²)³ = π/8 — an order-3 pole and why the series route wins",
  taxonomySection: "2",
  tier: "A",

  targets: [
    {
      id: "I",
      kind: "integral",
      variable: "x",
      lower: "-inf",
      upper: "inf",
      integrand: "x^2/(1 + x^2)^3",
      convergence: "absolute",
      symbols: {
        P: { kind: "polynomial", var: "x" }, // P = x²
        Q: { kind: "polynomial", var: "x" }, // Q = (1+x²)³ = x⁶+3x⁴+3x²+1
      },
    },
  ],

  parameters: [], // EMPTY DELIBERATELY — a fixed instance; see A5 on symbols vs parameters.

  hypotheses: [
    {
      id: "coprime",
      statement: "gcd(x², (1+x²)³) = 1 over ℚ(i)",
      check: "algebraic:gcd(P, Q) == 1",
      onFail: "refuse",
    },
    {
      id: "no-real-poles",
      statement: "(1+x²)³ ≥ 1 has no real zero",
      check: "algebraic:noRealRoot(Q)",
      onFail: "refuse",
    },
    {
      id: "target-absolutely-convergent",
      statement:
        "∫_ℝ|P/Q| converges (deg gap 4; the arc's vanishing is derived separately)",
      check: "algebraic:decayExponent(P, Q) >= 2",
      onFail: "refuse",
    },
    {
      id: "pole-order-exact",
      statement:
        "Yun gives Q = (z²+1)³ ⇒ both poles have order exactly 3; m is KNOWN, never guessed",
      check: "algebraic:squarefreeMultiplicityAt(Q, i) == 3",
      onFail: "refuse",
    },
    {
      id: "series-route-preferred",
      statement:
        "for m ≥ 3 the Laurent route (formula 4) is used; formula (3) is retained as a differential check",
      check: "structural:residueMethodFor(order = 3) == 'laurent'",
      onFail: "warn",
    },
  ],

  // branch: DELIBERATELY OMITTED — rational, single-valued.

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
      sideCondition: "∃ p > 1, M, R₀ : |P/Q| ≤ M/|z|^p on C_R for R ≥ R₀",
      // num(R) = R², den(R) = R⁶ − 3R⁴ − 3R² − 1 > 0 ⟺ R > 1.8832 (Cauchy: R > 4).
      // At R = 50: den = 15606242499, M = 1.601923e-7, |∫_arc| ≤ π·50·M = 2.516295e-5.
      // deg Q − deg P = 4 ⇒ O(R⁻³) → 0. Derived from the bound; not an input.
      discharge: "symbolic:mlRational(P, Q, arc='upper', R)",
      rigorOfBound: "≤",
      rigorOfLimit: "=",
      rigorIfNumericOnly: "≈",
    },
  ],

  residueSelection: { rule: "upperHalfPlane" },

  closedForm: {
    expr: "2*pi*i*Sum(Res(z^2/(1+z^2)^3, z_k), im(z_k) > 0)",
    simplified: "pi/8",
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
      id: "order-m-factorial-dropped",
      detect:
        "structural:residueMethod == 'derivative' && structural:factorialDivisorApplied == false",
      message:
        "Formula (3) is (1/(m−1)!)·d^{m−1}/dz^{m−1}[(z−z₀)^m f]. At m = 3 the divisor is 2!, and dropping it returns Res = −i/8 and hence π/4 = 0.785398163397448 instead of π/8 = 0.392699081698724 — exactly twice the truth. That factor of 2 is the most dangerous kind of error available here: the answer stays real, stays positive, and stays the right order of magnitude, so it survives every cheap check. The Laurent route (formula 4) never introduces a factorial at all, which is what makes running both a genuine differential test rather than a restatement of the same arithmetic.",
    },
    {
      id: "wrong-multiplicity",
      detect: "structural:poleOrderUsedAt(i) != algebraic:squarefreeMultiplicityAt(Q, i)",
      message:
        "The error is ONE-SIDED, which is why guessing m feels safe and is not. Too small: m = 2 forms d/dz[(z−i)²f], which still has a simple pole at z = i and diverges — loudly, so you notice. Too large: m = 4 forms (1/3!)·d³[(z−i)⁴f] and returns −i/16, the correct answer, because d^{m−1} extracts the coefficient of w^{m−1} from Σ c_n w^{n+m}, which is c₋₁ for EVERY m ≥ the true order. So an engine that over-estimates m is silently right and one that under-estimates is loudly wrong, and neither behaviour tells you the order. Yun's squarefree decomposition (DESIGN §6.3 step 2) fixes m exactly and removes the guess.",
    },
    {
      id: "quotient-shortcut-at-triple-root",
      detect: "algebraic:derivative(Q)(z_k) == 0",
      message:
        "Q′ = 6z(1+z²)² vanishes to order 2 at z = i, so P/Q′ is not merely inaccurate, it is 0/0 — as it was in A5. Formula (2) is exact and cheap precisely BECAUSE its hypothesis is checkable: Q squarefree. Check it once on Q, not root by root.",
    },
    {
      id: "half-range-requires-even",
      detect: "structural:isEven(P/Q) == false && target.lower == '0'",
      message:
        "x²/(1+x²)³ is even, so ∫₀^∞ = π/16 follows legitimately. The guard exists because the same one-line manipulation applied to an odd integrand turns a symmetric-limit zero into a nonzero claim.",
    },
  ],

  golden: [
    {
      params: {},
      value: "pi/8",
      numeric: 0.39269908169872414,
      verifiedTo: 1e-14,
      method:
        "the Laurent route (c₋₁ of the truncated series in w = z−i, no factorial anywhere) cross-checked against the (m−1)-derivative route (1/2!)·d²[z²(z+i)⁻³]|_{z=i} and against a small-circle quadrature at r = 1e-4 — two routes that share no arithmetic, which is what makes the factorial trap detectable",
    },
    {
      params: { halfRange: true },
      value: "pi/16",
      numeric: 0.19634954084936207,
      verifiedTo: 1e-14,
      method:
        "the even-integrand half-range corollary ∫₀^∞ = ½∫_ℝ, guarded by traps.half-range-requires-even",
    },
  ],
};
