// E1 — `strip-exponential-quasiperiod`, transcribed from
// `docs/contour-integration/gallery/tier-efg.md` §1.
//
// **The denominator of the answer and the denominator of the method are the same object.** That is
// the whole record. `f(z + 2πi) = e^{2πia} f(z)`, so the top side of the rectangle does not decay —
// it returns `−λ` times the bottom — and Pass 5 divides by `1 + c = 1 − λ = 1 − e^{2πia}`. That
// factor is `−e^{iπa}·2i sin(πa)`, so the `sin(πa)` in `π/sin(πa)` is LITERALLY the Pass-5
// denominator, not a coincidence of simplification.
//
// Three further things the record makes visible, each of which the engine now derives rather than
// accepts:
//
// - **The window `0 < a < 1` is not a convergence footnote.** `a > 0` is exactly what makes the LEFT
//   vertical side vanish and exactly what makes the integral converge at `x → −∞`; `a < 1` is
//   exactly the RIGHT side and `x → +∞`. One condition, two jobs — and since M5.3c each half is the
//   sign of one exact rational exponent (`κ = Re(a) + deg N − deg D` on the right, `−Re(a) − ord₀N +
//   ord₀D` on the left), so the window falls out of the geometry instead of being declared beside it.
// - **The degenerate case `1 − λ = 0` is `a ∈ ℤ`** — where the closed form has a pole and the
//   integral diverges — so DESIGN §4's structural refusal on a zero denominator fires for the right
//   reason, with no bespoke detector.
// - **E1 is the logarithmic image of D1** (`x = log t`), which is a free cross-family invariant: the
//   keyhole's phase `e^{2πis}` and the strip's `λ` are the same number at `s = a`.
import { pt } from "../../engine/contour/model.js";
import type { Family } from "../schema.js";

const P = 2 * Math.PI;

export const e1StripExponentialQuasiperiod: Family = {
  id: "strip-exponential-quasiperiod",
  title: "∫_{−∞}^{∞} e^{ax} dx/(1+eˣ) by a rectangle",
  titleLatex: "$\\int_{-\\infty}^{\\infty}\\frac{e^{ax}}{1+e^{x}}\\,dx$ by a rectangle",
  taxonomySection: "Rectangles and sectors",
  tier: "E",

  description: {
    contour: "the rectangle with vertices $\\pm R,\\ \\pm R+2\\pi i$",
    point:
      "$f(z+2\\pi i)=e^{2\\pi ia}f(z)$, so the top side returns $-e^{2\\pi ia}$ times the target; one pole, $i\\pi$, lies inside. The substitution $x=\\log t$ turns this into the keyhole integral $\\int_0^\\infty t^{a-1}dt/(1+t)$.",
    citations: [
      { book: "Conway", where: "Ch. V §2", text: "" },
      { book: "Freitag–Busam", where: "Ch. III §7", text: "" },
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
      integrand: "exp(a*x)/(1 + exp(x))",
      convergence: "absolute",
      symbols: {},
    },
  ],

  auxiliary: {
    integrand: "exp(a*z)/(1 + exp(z))",
    // The bottom side IS the target: `f` is real and positive on ℝ, so no functional is taken.
    relation: "Re",
    note: "the bottom side is the target itself; the top side is the target times −e^{2πia}, and the two together multiply the unknown by 1 − e^{2πia}",
  },

  parameters: [{ name: "a", domain: "real", constraints: ["a > 0", "a < 1", "a not in Z"] }],

  strip: { heightOverPi: "2" },

  hypotheses: [
    {
      id: "quasi-periodic",
      statement: "f(z + 2πi) = λ f(z) with λ = e^{2πia} constant (L7)",
      check: "symbolic:quasiPeriod(f, P=2*pi) == exp(2*pi*i*a)",
      onFail: "refuse",
    },
    {
      id: "left-vertical-and-minus-infinity",
      statement:
        "a > 0 — one condition doing two jobs: it makes |f| → 0 on the LEFT vertical side and makes the target converge at x → −∞",
      check: "algebraic:gt(a, 0)",
      onFail: "refuse",
    },
    {
      id: "right-vertical-and-plus-infinity",
      statement: "a < 1 — likewise for the RIGHT vertical side and x → +∞",
      check: "algebraic:lt(a, 1)",
      onFail: "refuse",
    },
    {
      id: "no-pole-on-the-boundary",
      statement: "1 + e^z = 0 only at z = iπ + 2πik, so no pole lies on Im z ∈ {0, 2π}",
      check: "algebraic:noRootOnHorizontalLines(1 + exp(z), [0, 2*pi])",
      onFail: "refuse",
    },
    {
      id: "nondegenerate-solve",
      statement: "1 + Σc = 1 − λ ≠ 0, i.e. a ∉ ℤ",
      check: "algebraic:ne(1 - exp(2*pi*i*a), 0)",
      onFail: "refuse",
    },
  ],

  contour: {
    template: "rectangle",
    limitParams: [{ name: "R", to: "inf" }],
    pieces: [
      {
        id: "bottom",
        name: "the real axis",
        geom: { kind: "segment", from: pt({ param: "R", mul: -1 }, 0), to: pt({ param: "R" }, 0) },
        role: "target",
        colour: 0,
      },
      {
        id: "right",
        name: "the right vertical $x = R$",
        geom: { kind: "segment", from: pt({ param: "R" }, 0), to: pt({ param: "R" }, P) },
        role: "vanish",
        lemma: "L1",
        colour: 1,
      },
      {
        id: "top",
        name: "the line $\\operatorname{Im} z = 2\\pi$",
        geom: { kind: "segment", from: pt({ param: "R" }, P), to: pt({ param: "R", mul: -1 }, P) },
        role: "reproduces",
        // Convention F: the factor is the FULL multiplier of the target, reversal included. The minus
        // is the reversed traversal, not part of the quasi-period — dropping it turns `1 − λ` into
        // `1 + λ` and silently returns π/sin(πa) evaluated at the wrong point.
        coefficients: [{ targetId: "I", coefficient: "-exp(2*pi*i*a)" }],
        colour: 2,
      },
      {
        id: "left",
        name: "the left vertical $x = -R$",
        geom: {
          kind: "segment",
          from: pt({ param: "R", mul: -1 }, P),
          to: pt({ param: "R", mul: -1 }, 0),
        },
        role: "vanish",
        lemma: "L1",
        colour: 3,
      },
    ],
    orientation: "ccw",
    windings: [{ pole: "i*pi", n: "1" }],
  },

  vanishingLemmas: [
    {
      piece: "right",
      lemma: "L1",
      sideCondition:
        "for all y in [0,2π]: |f(R+iy)| <= e^(aR)/(e^R - 1), from |1+e^z| >= |e^z| - 1; hence |int| <= 2*pi*e^(aR)/(e^R - 1)",
      discharge: "symbolic:mlBound(piece=right, M=exp(a*R)/(exp(R)-1), L=2*pi, limit=R->inf, requires=[a<1])",
      rigorOfBound: "≤",
      rigorOfLimit: "=",
      rigorIfNumericOnly: "≈",
    },
    {
      piece: "left",
      lemma: "L1",
      sideCondition:
        "for all y in [0,2π]: |f(-R+iy)| <= e^(-aR)/(1 - e^(-R)), from |1+e^z| >= 1 - |e^z|; hence |int| <= 2*pi*e^(-aR)/(1 - e^(-R))",
      discharge: "symbolic:mlBound(piece=left, M=exp(-a*R)/(1-exp(-R)), L=2*pi, limit=R->inf, requires=[a>0])",
      rigorOfBound: "≤",
      rigorOfLimit: "=",
      rigorIfNumericOnly: "≈",
    },
  ],

  residueSelection: { rule: "inside", set: "0 < Im z < 2*pi — here the single simple pole z = iπ" },

  closedForm: {
    expr: "(2*pi*i/(1 - exp(2*pi*i*a))) * Res(exp(a*z)/(1+exp(z)), i*pi)",
    simplified: "pi/sin(pi*a)",
  },

  rigor: {
    policy: "min",
    inputs: ["hypotheses.*", "vanishingLemmas.*.rigor", "residues.*.rigor", "solve.conditioning"],
  },

  traps: [
    {
      id: "horizontal-side-is-not-a-vanishing-side",
      detect: "structural:vanishRoleOnHorizontalTranslate(piece('bottom'), 'i*P')",
      message:
        "The top side is a translate of the bottom, so |f| on it equals |lambda|*|f| on the bottom — and |lambda| = 1 for real a. Its ML bound is proportional to the length 2R and DIVERGES. The top side does not vanish; it REPRODUCES (L7 is not a vanishing lemma). Set role='reproduces' with factor -lambda.",
    },
    {
      id: "a-out-of-range",
      detect: "algebraic:outsideOpenInterval(a, 0, 1)",
      message:
        "|a| >= 1 (or a <= 0) breaks convergence, and breaks it on the side you can see: for a >= 1 the integrand tends to e^((a-1)x) >= 1 as x -> +inf and the right vertical bound e^(aR)/(e^R-1) no longer tends to 0; for a <= 0 the same happens at x -> -inf on the left. The residue sum still returns a finite number — refuse it.",
    },
    {
      id: "lambda-one-degenerate",
      detect: "algebraic:eq(1 + sum(contour.pieces.filter(role=='reproduces').factor), 0)",
      message:
        "lambda = 1 (a in Z) makes 1 + Sum(c) = 0: the top side cancels the bottom exactly and the closed-contour identity carries NO information about T. Pass 5 divides by zero — which is the correct behaviour, not a bug. Note the residue sum must then vanish identically; a nonzero sum means the strip height or the pole list is wrong.",
    },
    {
      id: "wrong-strip-height",
      detect: "symbolic:notQuasiPeriod(f, contour.height)",
      message:
        "P must be a genuine quasi-period AND the strip must contain exactly the poles you count. Height 4*pi here reproduces with lambda^2 but encloses z = i*pi and z = 3*i*pi; height pi reproduces with nothing at all (f(z+i*pi) is not a constant multiple of f(z)).",
    },
    {
      id: "factor-sign",
      detect: "structural:coefficientOf(top) == 'exp(2*pi*i*a)'",
      message:
        "The factor is -lambda, not +lambda. The minus is the reversed traversal of the top side (R+iP -> -R+iP), not part of the quasi-period. Dropping it turns 1 - lambda into 1 + lambda and silently returns pi/sin(pi a) evaluated at the wrong point.",
    },
  ],

  golden: [
    {
      params: { a: 0.3 },
      value: "pi/sin(pi*a)",
      numeric: 3.8832220774509327,
      verifiedTo: 1.2e-16,
      method:
        "composite 40-point Gauss–Legendre on $[-60, 60]$ plus the exact geometric tail series; cross-checked by tanh-sinh on the Beta form $\\int_0^1 u^{a-1}(1-u)^{-a}\\,du$ (relative $1.4\\times10^{-15}$)",
    },
    {
      params: { a: 0.5 },
      value: "pi",
      numeric: 3.1415926535897931,
      verifiedTo: 0,
      method: "the same pair of routes; they agree exactly in float64, since $\\sin(\\pi/2) = 1$ leaves the sine out of the answer",
    },
    {
      params: { a: 0.91 },
      value: "pi/sin(pi*a)",
      numeric: 11.260547686233595,
      verifiedTo: 7.9e-16,
      method: "the same pair of routes, near the $a \\to 1^-$ edge where the closed form blows up",
    },
    {
      params: { a: 0.05 },
      value: "pi/sin(pi*a)",
      numeric: 20.082484079079745,
      verifiedTo: 3.5e-16,
      method: "the same pair of routes, near the $a \\to 0^+$ edge",
    },
  ],
};
