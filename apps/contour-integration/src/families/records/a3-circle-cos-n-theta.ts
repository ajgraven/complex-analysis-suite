// A3 — `circle-cos-n-theta`, transcribed from `docs/contour-integration/gallery/tier-ab.md` §1.
//
// The entry that makes THE POLE THE SUBSTITUTION MANUFACTURES AT THE ORIGIN impossible to miss.
// `cos 2θ = (z² + z⁻²)/2` contributes `z⁻²`, the Jacobian contributes `z⁻¹`, clearing the
// denominator returns one `z`, and the net is a pole of order exactly `n = 2` at `z = 0` — a point
// at which the REAL integrand `cos 2θ/(5 − 4cos θ)` is perfectly smooth for every θ.
//
// Unlike A1 (where the Jacobian's pole cancels) the pole is real, and unlike A5 (where `P/Q′` at
// least refuses loudly) the only way to get it wrong is to NOT LOOK AT z = 0 AT ALL, which returns
// `17π/12 ≈ 4.4506` instead of `π/6 ≈ 0.5236`. Exposing `n` as a parameter makes "the manufactured
// order equals the harmonic index" a testable statement rather than an anecdote.
import { pt } from "../../engine/contour/model.js";
import type { Family } from "../schema.js";

export const a3CircleCosNTheta: Family = {
  id: "circle-cos-n-theta",
  title: "∫₀^{2π} cos nθ/(5 − 4 cos θ) dθ — the order-n pole the substitution manufactures at z = 0",
  taxonomySection: "1",
  tier: "A",

  targets: [
    {
      id: "I",
      kind: "integral",
      variable: "theta",
      lower: "0",
      upper: "2*pi",
      integrand: "cos(n*theta)/(5 - 4*cos(theta))",
      convergence: "absolute",
      symbols: { n: { kind: "integerParam" } },
      // cos nθ = (zⁿ + z⁻ⁿ)/2 ; 5 − 4cos θ = −(2z−1)(z−2)/z
      //   ⇒  f(z) = (i/2)·(z^{2n} + 1) / ( zⁿ (2z − 1)(z − 2) )      [n = 2 is the gallery entry]
      substitution: {
        map: "exp(i*theta)",
        inverse: "-i*log(z)",
        jacobian: "1/(i*z)",
      },
    },
  ],

  parameters: [{ name: "n", domain: "integer", constraints: ["n >= 0"] }],

  hypotheses: [
    {
      id: "no-pole-on-circle",
      statement:
        "2z² − 5z + 2 has no unimodular root (its roots are 1/2 and 2, a reciprocal pair)",
      check: "algebraic:noUnitCircleRoot(2*z^2 - 5*z + 2)",
      onFail: "refuse",
    },
    {
      id: "origin-order-known-exactly",
      // DESIGN §6.3 step 2: squarefree-decompose FIRST, so multiplicity is exact.
      statement:
        "the pole at z = 0 has order exactly n, from Yun squarefree decomposition of the z-denominator — never inferred from a cluster of floating roots",
      check: "algebraic:squarefreeMultiplicityAt(denom(f), 0) == n",
      onFail: "refuse",
    },
    {
      id: "origin-in-the-enclosed-set",
      statement: "z = 0 appears in the enclosed singular set whenever n ≥ 1",
      check: "structural:enclosedPoles contains 0 || n == 0",
      onFail: "refuse",
    },
    {
      id: "shortcut-inapplicable-at-origin",
      statement:
        "for n ≥ 2, Q′(0) = 0 so the quotient shortcut P/Q′ is unavailable at z = 0 and must refuse rather than divide",
      check: "algebraic:derivative(denom(f))(0) != 0 || n < 2",
      onFail: "warn",
    },
  ],

  // branch: DELIBERATELY OMITTED — rational in z.

  contour: {
    template: "circle",
    limitParams: [],
    pieces: [
      {
        id: "unitCircle",
        name: "the unit circle |z| = 1",
        geom: { kind: "arc", center: pt(0, 0), radius: 1, theta0: 0, theta1: 2 * Math.PI },
        role: "target",
        colour: 0,
      },
    ],
    orientation: "ccw",
    windings: [
      { pole: "0", n: "if(n > 0, 1, 0)" }, // n ≥ 1, for an integer parameter
      { pole: "1/2", n: "1" },
      { pole: "2", n: "0" },
    ],
  },

  vanishingLemmas: [],

  residueSelection: { rule: "inside" },

  closedForm: {
    expr: "(2*pi/3)*2^(-n)",
    simplified: "pi/6", // at n = 2, the gallery value
  },

  rigor: {
    policy: "min",
    inputs: ["hypotheses.*", "residues.*.rigor", "windingNumbers.*", "contour.closed"],
  },

  traps: [
    {
      id: "forget-origin-pole",
      detect: "structural:poleOrderAt(0) > 0 && structural:enclosedPoles excludes 0",
      message:
        "The substitution, not the integrand, creates this pole: cos 2θ = (z²+z⁻²)/2 supplies z⁻², dθ = dz/(iz) supplies z⁻¹, clearing 5 − 4cos θ returns z, and the order is exactly n. Nothing in cos 2θ/(5 − 4cos θ) hints at it — the real integrand is smooth at every θ. Summing only Res(f,1/2) = −17i/24 returns 2πi(−17i/24) = 17π/12 = 4.45058959258554, against the true π/6 = 0.523598775598299: a factor of 8.5. This is research 03 §1's 'single commonest error', and the fix is structural — run pole detection on the CONTOUR integrand, whose denominator carries zⁿ, not on the integrand as posed.",
    },
    {
      id: "origin-treated-as-simple",
      detect: "structural:poleOrderUsedAt(0) < algebraic:squarefreeMultiplicityAt(denom(f), 0)",
      message:
        "lim_{z→0} z·f(z) = 0 at an order-2 pole, so the simple-pole formula reports Res(f,0) = 0 — a plausible number that silently discards the entire c₋₁ = 5i/8, and lands on the same wrong 17π/12 as forgetting the pole outright. The quotient shortcut is safer: Q = 2z⁴ − 5z³ + 2z² has Q′(0) = 0 while P(0) = i/2 ≠ 0, so P/Q′ divides by zero and REFUSES. A residue of exactly 0 at a pole the engine has just certified to be order 2 is a contradiction, not a result.",
    },
    {
      id: "reciprocal-pair-wrong-member",
      detect: "numeric:abs(selectedPole) > 1",
      message:
        "2z² − 5z + 2 is palindromic, so its roots 1/2 and 2 are a reciprocal pair and exactly one is enclosed. Including z = 2 (Res = +17i/24) as well gives Σ = 5i/8 and a value of −5π/4 — negative, and unlike A2 the integrand cos 2θ/(5−4cos θ) does take negative values, so no positivity check will save you here. The winding number n(γ,2) = 0 is the only thing that does, which is why DESIGN §4 Pass 2 reports winding number and enclosed-pole count as SEPARATE rows.",
    },
  ],

  golden: [
    {
      params: { n: 2 },
      value: "pi/6",
      numeric: 0.5235987755982988,
      verifiedTo: 1e-14,
      method:
        "Σ over the two ENCLOSED poles: Res(f,1/2) = −17i/24 and the order-2 origin Res(f,0) = 5i/8, giving Σ = −i/12; cross-checked against a small-circle quadrature at r = 1e-4 (0.624999999999944 i at the origin) and against the contour quadrature",
    },
    {
      params: { n: 0 },
      value: "2*pi/3",
      numeric: 2.0943951023931953,
      verifiedTo: 1e-14,
      method:
        "the base case of 'order = n': at n = 0 the origin is NOT a pole at all and the enclosed set has one member",
    },
    {
      params: { n: 1 },
      value: "pi/3",
      numeric: 1.0471975511965976,
      verifiedTo: 1e-14,
      method: "a simple pole at the origin — the one order at which the quotient shortcut still applies there",
    },
    {
      params: { n: 3 },
      value: "pi/12",
      numeric: 0.2617993877991494,
      verifiedTo: 1e-14,
      method:
        "order 3, where the derivative route needs d²/dz² and the Laurent route needs no factorial",
    },
    {
      params: { n: 4 },
      value: "pi/24",
      numeric: 0.1308996938995747,
      verifiedTo: 1e-14,
      method:
        "order 4, and with n = 0..4 together the ladder 2π/3 · 2⁻ⁿ makes 'the manufactured order equals the harmonic index' a tested statement rather than an anecdote",
    },
  ],
};
