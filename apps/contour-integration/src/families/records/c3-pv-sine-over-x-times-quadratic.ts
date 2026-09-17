// C3 — `pv-sine-over-x-times-quadratic`, from `docs/contour-integration/gallery/tier-cd.md` §C3.
//
// **Two singularities of different kinds in one ledger, and where the p.v. actually lives.**
// `e^{iz}/(z(z²+b²))` has a simple pole *on* the contour at 0 and a simple pole *inside* it at `ib`.
// Both must be accounted, by different mechanisms and with different weights:
//
//   n(γ, 0)  = 0  and an L4 contribution of  −iπ·Res(f,0) = −iπ/b²
//   n(γ, ib) = 1  and a residue contribution of  2πi·Res(f,ib) = −iπe^{−b}/b²
//
// Getting `(π/b²)(1 − e^{−b})` requires both, with the right signs — and the two are easy to conflate
// because they both look like "π times a residue". They differ by exactly a factor of two, which is
// why C3's record warns that a hand-chosen sign here is indistinguishable from a winding-number error.
//
// The subtler lesson is the principal value. The AUXILIARY genuinely needs one — `∫cos x/(x(x²+b²))`
// diverges at the origin — while the TARGET is bounded at 0 (removable, value 1/b²) and decays like
// `x⁻³`, so it converges absolutely and its p.v. is just its value. The record calls the inability to
// say both at once its gap G6; `convergence: "absolute"` on the target plus
// `auxiliary.principalValue` is what closes it.
import { pt } from "../../engine/contour/model.js";
import type { Family } from "../schema.js";

export const c3PvSineOverXTimesQuadratic: Family = {
  id: "pv-sine-over-x-times-quadratic",
  title: "∫_{−∞}^{∞} sin x dx/(x(x²+b²)) by an indented semicircle",
  titleLatex: "$\\int_{-\\infty}^{\\infty}\\frac{\\sin x}{x(x^2+b^2)}\\,dx$ by an indented semicircle",
  taxonomySection: "Principal values and indented contours",
  tier: "C",

  description: {
    contour: "real axis indented over $0$, closed by $\\Gamma_R$; integrand $e^{iz}/(z(z^2+b^2))$",
    point:
      "The pole at $ib$ contributes $2\\pi i\\operatorname{Res}$; the pole at $0$, on the path, contributes $-i\\pi\\operatorname{Res}$ through the indentation. The principal value belongs to the auxiliary integral; the target converges absolutely.",
    citations: [
      { book: "Brown–Churchill", where: "§82", text: "" },
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
      integrand: "sin(x)/(x*(x^2 + b^2))",
      // ABSOLUTE, and that is the substantive claim — see the header and `hypotheses.pv-coincides`.
      // The gallery poses this entry with a p.v. qualifier, which is correct but INHERITED from the
      // auxiliary; the target itself is removable at 0 and O(x⁻³) at infinity.
      convergence: "absolute",
      symbols: {},
    },
  ],

  auxiliary: {
    integrand: "exp(i*z)/(z*(z^2 + b^2))",
    // Im, and no fold: the target is over ALL of ℝ, unlike C1's ∫₀^∞.
    relation: "Im",
    principalValue: true,
    note: "sin x = Im e^{ix}; the real part ∫cos x/(x(x²+b²)) diverges at the origin, so the auxiliary needs a principal value while the target does not",
  },

  parameters: [{ name: "b", domain: "real", constraints: ["b > 0"] }],

  hypotheses: [
    {
      id: "real-pole-simple",
      statement: "z = 0 is a simple pole of the auxiliary (L4 requires it)",
      check: "algebraic:poleOrder(auxiliary, 0) == 1",
      onFail: "refuse",
    },
    {
      id: "complex-poles-off-axis",
      statement: "z = ±ib are simple and NOT on the contour",
      check: "algebraic:distance({i*b, -i*b}, contour) > r_min && poleOrder == 1",
      onFail: "refuse",
    },
    {
      id: "no-pole-collision",
      statement:
        "b ≠ 0: otherwise the real pole and the complex pair collide into a triple pole on the axis",
      check: "algebraic:b != 0",
      onFail: "refuse",
    },
    {
      id: "jordan-decay",
      statement: "M_R = max |1/(z(z²+b²))| on the upper arc ~ R⁻³ → 0",
      check: "symbolic:degreeBound(1/(z*(z^2+b^2)))",
      onFail: "refuse",
    },
    {
      id: "pv-coincides",
      statement:
        "the TARGET converges absolutely (removable at 0, O(x⁻³) at infinity), so p.v. = the integral; the p.v. is inherited from the auxiliary",
      check: "algebraic:isRemovable(target.integrand, 0) && decayExponent(target.integrand) > 1",
      onFail: "warn",
    },
  ],

  // branch: DELIBERATELY OMITTED — rational × entire, single-valued.

  contour: {
    template: "indentedSemicircle",
    limitParams: [
      { name: "R", to: "inf" },
      { name: "rho", to: "0+" },
    ],
    pieces: [
      {
        id: "left",
        name: "the real axis, $x < -\\rho$",
        geom: { kind: "segment", from: pt({ param: "R", mul: -1 }, 0), to: pt({ param: "rho", mul: -1 }, 0) },
        role: "target",
        // As in C1: only the SUM of the target coefficients is identifiable, since Pass 5 sums the
        // piece rows. Here the sum is 1 because the target is the whole real line.
        coefficients: [{ targetId: "I", coefficient: "1/2" }],
        colour: 0,
      },
      {
        id: "indent",
        name: "the indentation over the real pole $z = 0$",
        geom: { kind: "arc", center: pt(0, 0), radius: { param: "rho" }, theta0: Math.PI, theta1: 0 },
        role: "vanish",
        lemma: "L4",
        colour: 3,
      },
      {
        id: "right",
        name: "the real axis, $x > \\rho$",
        geom: { kind: "segment", from: pt({ param: "rho" }, 0), to: pt({ param: "R" }, 0) },
        role: "target",
        coefficients: [{ targetId: "I", coefficient: "1/2" }],
        colour: 0,
      },
      {
        id: "bigarc",
        name: "the $R \\to \\infty$ semicircle",
        geom: { kind: "arc", center: pt(0, 0), radius: { param: "R" }, theta0: 0, theta1: Math.PI },
        role: "vanish",
        lemma: "L3",
        colour: 1,
      },
    ],
    orientation: "ccw",
    // THREE POLES, THREE DIFFERENT WINDING NUMBERS. This is the entry.
    windings: [
      { pole: "0", n: "0" },
      { pole: "i*b", n: "1" },
      { pole: "-i*b", n: "0" },
    ],
  },

  vanishingLemmas: [
    {
      piece: "indent",
      lemma: "L4",
      sideCondition: "simple pole at 0; α = −π (clockwise)",
      discharge: "symbolic:fractionalResidue(auxiliary, 0, alpha = -pi)",
      // = −iπ·Res(f,0) = −iπ/b². The sign comes from the traversal direction, which IS the i·ε
      // prescription (L8). With TWO singularities in play the two contributions — iπ·Res on the real
      // pole, 2πi·Res on the enclosed one — differ by exactly a factor of two, so a hand-chosen sign
      // here is indistinguishable from a winding-number error.
      rigorOfBound: "=",
      rigorOfLimit: "=",
      rigorIfNumericOnly: "≈",
    },
    {
      piece: "bigarc",
      lemma: "L3",
      sideCondition: "a = 1 > 0, upper arc; M_R = O(R⁻³) → 0",
      discharge: "symbolic:jordanBound(g = 1/(z*(z^2+b^2)), a = 1, R)",
      // |∫| ≤ π/(R(R²−b²)).
      rigorOfBound: "≤",
      rigorOfLimit: "=",
      rigorIfNumericOnly: "≈",
    },
  ],

  residueSelection: { rule: "upperHalfPlane", set: "{i*b}" },

  closedForm: {
    expr: "Im( 2*pi*i*Sum(Res(f,z_k) : im(z_k) > 0) - i*pi*Sum(Res(f,x_j) : x_j in R) )",
    simplified: "(pi/b^2)*(1 - exp(-b))",
  },

  rigor: {
    policy: "min",
    inputs: [
      "hypotheses.*",
      "vanishingLemmas.*.rigor",
      "residues.*.rigor",
      "windingNumbers.*",
      "auxiliary.relation",
    ],
  },

  traps: [
    {
      id: "real-pole-counted-as-enclosed",
      detect: "structural:windingAt(0) != 0",
      message:
        "The indentation detours OVER z = 0, so n(γ,0) = 0 and the real pole contributes nothing to the residue sum. Its contribution arrives separately, through L4, as ±iπ·Res — half of 2πi·Res — with the sign set by the traversal direction. Weighting it 2πi·Res instead overshoots by iπ·Res(f,0) = iπ, turning π(1 − 1/e) = 1.9859 into 5.1275; adding 2πi·Res(f,0) to the residue sum while ALSO keeping the indentation's contribution overshoots by 2πi and gives 8.2690.",
    },
    {
      id: "lower-pole-included",
      detect: "structural:selectedPoles includes -i*b",
      message:
        "z = −ib lies outside the upper semicircle: n(γ,−ib) = 0. Including it — a common symmetry reflex, since the poles come as a conjugate pair — adds 2πi·Res(f,−ib) = iπe^{b}/b², a term that GROWS with b, which is the shape of the error to look for.",
    },
    {
      id: "pv-claimed-of-the-target",
      detect: "structural:resultIsPrincipalValue && hypotheses.pv-coincides == true",
      message:
        "The principal value here belongs to the AUXILIARY: p.v.∫ e^{ix}/(x(x²+b²)) is needed because ∫cos x/(x(x²+b²)) diverges at 0. The target sin x/(x(x²+b²)) is bounded at 0 (removable, value 1/b²) and O(x⁻³) at infinity, so it converges absolutely and its p.v. equals its value. Report BOTH facts: 'p.v. = …' without 'and the integral converges, so this is also its value' understates the result; '∫ = …' without recording that the derivation ran through a p.v. hides a hypothesis.",
    },
    {
      id: "real-part-not-checked",
      detect: "structural:invariantChecked('Re(pv) == 0') == false",
      message:
        "The real part of the identity says p.v.∫ cos x/(x(x²+b²)) dx = 0, which is independently true by oddness. It is a free consistency check on the whole sign bookkeeping and costs nothing; measured −5.1e-8 at R = 600.",
    },
    {
      id: "double-pole-on-the-axis",
      detect: "algebraic:poleOrder(auxiliary, anyRealPoint) >= 2",
      message:
        "Double poles on the axis kill the method: L4 fails and no principal value exists (Hadamard finite part is a different object). Refuse; do not emit a number.",
    },
  ],

  golden: [
    {
      params: { b: 1 },
      value: "pi*(1 - exp(-1))",
      numeric: 1.9858653037988714,
      verifiedTo: 2e-16,
      method:
        "both mechanisms at once: the enclosed pole at $i$ contributes $2\\pi i\\operatorname{Res} = -i\\pi/e$ and the indented pole at 0 contributes $-i\\pi\\operatorname{Res} = -i\\pi$, and the imaginary part of their difference is $\\pi(1 - 1/e)$. Verified independently two ways — half-period decomposition of the even integrand with a repeated-averaging tail, and composite Gauss–Legendre to $x = 2000$ with an accelerated oscillatory tail — identical to all seventeen digits; the contour bookkeeping was checked separately, with the indentation measured at $(0, -3.1415925) = -i\\pi$",
    },
    {
      params: { b: 2 },
      value: "(pi/4)*(1 - exp(-2))",
      numeric: 0.6791060805005392,
      verifiedTo: 1e-15,
      method:
        "$b \\neq 1$ separates the $1/b^2$ prefactor from the $e^{-b}$ exponent, which coincide at $b = 1$ in a way that would hide a confusion between them",
    },
  ],
};
