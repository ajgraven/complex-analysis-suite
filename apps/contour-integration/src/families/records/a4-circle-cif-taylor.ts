// A4 — `circle-cif-taylor`, from `docs/contour-integration/gallery/tier-ab.md` §1.
//
// **The entry where there is no residue and the answer is still 2π.** `g(z) = e^z` is entire: the
// singular set of the integrand *as posed* is empty, the pole finder correctly returns nothing, and
// Cauchy's theorem correctly reports `∮ g dz = 0` — all true, all irrelevant. What is being
// integrated is `g(z)·(dz/(iz))`, and the JACOBIAN supplies the only pole there is. Its residue is
// `g(0)/i`, i.e. the `n = 0` Taylor coefficient, i.e. the Cauchy integral formula, i.e. the
// mean-value property of harmonic functions.
//
// Exposing the index `n` turns the record into CIF for derivatives: `Res = cₙ = g⁽ⁿ⁾(0)/n!`, so the
// value is `2π/n!`. What this teaches is the one fact A1 and A3 have been circling: **residue
// selection operates on the CONTOUR integrand, and its singular set differs from the posed
// integrand's whenever the substitution has a Jacobian.**
//
// A4 was the last entry in tiers A–C to load, and the reason is worth recording: its residue is the
// Taylor coefficient of an ENTIRE function, which needs the exponential series rather than the
// rational machinery. `residueAtZero` supplies it, on `@cas/exact`'s `splitOrder` / `seriesInverse` /
// `seriesMul` — the identical three steps the rational path already took.
import { pt } from "../../engine/contour/model.js";
import type { Family } from "../schema.js";

export const a4CircleCifTaylor: Family = {
  id: "circle-cif-taylor",
  title: "∫₀^{2π} e^{cos θ} cos(sin θ − nθ) dθ by Cauchy's integral formula",
  titleLatex: "$\\int_0^{2\\pi}e^{\\cos\\theta}\\cos(\\sin\\theta-n\\theta)\\,d\\theta$ by Cauchy's integral formula",
  taxonomySection: "Trigonometric integrals over [0, 2π]",
  tier: "A",

  description: {
    contour: "the unit circle; the integrand is $\\operatorname{Re}\\bigl[e^{e^{i\\theta}}e^{-in\\theta}\\bigr]$, so $\\oint e^{z}\\,dz/(iz^{n+1})$",
    point:
      "The only singularity is supplied by $dz/(iz)$ and the factor $z^{-n}$; the residue is the $n$-th Taylor coefficient of $e^z$, i.e. Cauchy's formula for derivatives.",
    citations: [
      { book: "Ahlfors", where: "Ch. 4 §2.3", text: "Cauchy's integral formula, higher derivatives" },
      { book: "Brown–Churchill", where: "§85", text: "" },
    ],
  },

  targets: [
    {
      id: "I",
      kind: "integral",
      variable: "theta",
      lower: "0",
      upper: "2*pi",
      integrand: "exp(cos(theta))*cos(sin(theta) - n*theta)",
      convergence: "absolute",
      symbols: {
        g: { kind: "entireFn", var: "z" }, // g(z) = exp(z) for this instance
        n: { kind: "integerParam" },
      },
      substitution: {
        map: "exp(i*theta)",
        // Never evaluated: the substitution is used in the FORWARD direction only, which is why the
        // multivaluedness of log raises no branch question here.
        inverse: "-i*log(z)",
        jacobian: "1/(i*z)",
      },
    },
  ],

  // The auxiliary is PRE-Jacobian, so this times dθ = dz/(iz) is the contour integrand
  // g(z)/(i z^{n+1}) the record names. The recognition step — that e^{cos θ}cos(sin θ − nθ) IS
  // Re[g(e^{iθ})e^{−inθ}] — is what `hypotheses.recognition` records; it can fail, so it is checked.
  auxiliary: {
    integrand: "exp(z)/z^n",
    relation: "Re",
    note: "e^{cos θ}cos(sin θ − nθ) = Re[e^{e^{iθ}} e^{−inθ}]; the imaginary part is the free companion ∫ e^{cos θ}sin(sin θ − nθ) dθ = 0",
  },

  parameters: [{ name: "n", domain: "integer", constraints: ["n >= 0"] }],

  hypotheses: [
    {
      id: "integrand-entire",
      statement: "g is entire, so it contributes no pole of its own; the singular set of g is empty",
      check: "algebraic:poleCount(g, C) == 0",
      onFail: "refuse",
    },
    {
      id: "recognition",
      statement:
        "the real integrand IS Re[g(e^{iθ})·e^{−inθ}] — a recognition step that can fail, so it is checked",
      check: "symbolic:equalsRealPartOf(target.integrand, g(exp(i*theta))*exp(-i*n*theta))",
      onFail: "refuse",
    },
    {
      id: "jacobian-pole-is-the-only-pole",
      statement:
        "the contour integrand's singular set is exactly {0}, of order n+1, contributed entirely by dθ = dz/(iz) and the e^{−inθ} factor",
      check: "structural:polesOf(contourIntegrand) == {0} && structural:poleOrderAt(0) == n + 1",
      onFail: "refuse",
    },
    {
      id: "taylor-radius",
      statement:
        "g is holomorphic on a disc of radius > 1, so its Taylor coefficients at 0 are what the contour reads off",
      check: "structural:holomorphicOnClosedDisc(g, 1)",
      onFail: "refuse",
    },
  ],

  // branch: DELIBERATELY OMITTED. exp is entire and single-valued; the only multivaluedness in sight
  // is in `inverse: -i*log(z)`, which is never evaluated.

  contour: {
    template: "circle",
    limitParams: [],
    pieces: [
      {
        id: "unitCircle",
        name: "the unit circle $|z| = 1$",
        geom: { kind: "arc", center: pt(0, 0), radius: 1, theta0: 0, theta1: 2 * Math.PI },
        role: "target",
        colour: 0,
      },
    ],
    orientation: "ccw",
    // g contributes NO pole. The order-(n+1) pole at the origin is manufactured entirely by the
    // Jacobian and the e^{−inθ} factor.
    windings: [{ pole: "0", n: "1" }],
  },

  vanishingLemmas: [],

  residueSelection: { rule: "inside" },

  closedForm: {
    expr: "2*pi*taylorCoefficient(g, 0, n)", // = 2π·g⁽ⁿ⁾(0)/n!, i.e. CIF for derivatives
    simplified: "2*pi/factorial(n)",
  },

  rigor: {
    policy: "min",
    inputs: ["hypotheses.*", "residues.*.rigor", "windingNumbers.*", "contour.closed"],
  },

  traps: [
    {
      id: "entire-implies-zero",
      detect: "structural:singularSetOf(integrandAsPosed) == {} && structural:valueReported == 0",
      message:
        "g entire ⇒ ∮_{|z|=1} g(z) dz = 0 by Cauchy's theorem. That is TRUE, and it is not the integral being evaluated. ∫₀^{2π} g(e^{iθ}) dθ = ∮ g(z)·dz/(iz), and the substitution's own Jacobian supplies the pole. The residue machinery is right to report no poles OF g and the value is still 2π·g(0) = 2π — the Cauchy integral formula, equivalently the mean value of a harmonic function over a circle. Reporting 0 here is the commonest way this example is got wrong, and it is a reasoning error about WHICH function is being integrated, not an arithmetic slip.",
    },
    {
      id: "real-part-taken-too-early",
      detect:
        "structural:substitutionAppliedTo(target.integrand) && structural:isRationalIn(cos(theta), sin(theta)) == false",
      message:
        "e^{cos θ}cos(sin θ) is not a rational function of cos θ and sin θ, so §1's substitution table does not apply to it as written — there is nothing to clear. It must first be RECOGNISED as Re e^{e^{iθ}}. Taking the real part at the end is legitimate because the contour integral was computed exactly; taking it at the start leaves nothing holomorphic to integrate. This is the §1 analogue of research 03 §3's 'replace cos(ax) by e^{iaz}, not by cos(az)'.",
    },
    {
      id: "companion-imaginary-part-nonzero",
      detect: "numeric:abs(im(2*pi*i*residueSum)) > tol",
      message:
        "The same contour delivers the companion ∫₀^{2π} e^{cos θ} sin(sin θ − nθ) dθ = Im(2π/n!) = 0 for free — numerically −5.2×10⁻¹⁶. A nonzero imaginary part is an orientation or sign bug, not a second result. Free companions like this are the cheapest self-tests in the gallery and should be ledger rows, not footnotes.",
    },
    {
      id: "order-grows-with-n",
      detect: "structural:poleOrderAt(0) != n + 1",
      message:
        "At n = 0 the manufactured pole is SIMPLE and the shortcut Res = g(0)/i works. At n ≥ 1 it has order n+1 and the same shortcut silently returns the wrong Taylor coefficient. The order is a function of the substitution's exponent, so it must be recomputed whenever n changes — a cached 'this family has a simple pole' is wrong for every n ≥ 1.",
    },
  ],

  golden: [
    {
      params: { g: "exp(z)", n: 0 },
      value: "2*pi",
      numeric: 6.283185307179586,
      verifiedTo: 1e-15,
      method:
        "the manufactured pole is SIMPLE here, so Res = g(0)/i = −i and 2πi·Res = 2π — the mean-value property of a harmonic function over a circle, and the base case of the order ladder",
    },
    {
      params: { g: "exp(z)", n: 1 },
      value: "2*pi",
      numeric: 6.283185307179586,
      verifiedTo: 1e-15,
      method:
        "the order rises to 2 while the VALUE is unchanged (1/1! = 1/0!), which is the fixture that separates 'the order changed' from 'the answer changed'",
    },
    {
      params: { g: "exp(z)", n: 2 },
      value: "pi",
      numeric: 3.141592653589793,
      verifiedTo: 1e-15,
      method: "order 3; Res = c₂/i = −i/2, and the value halves",
    },
    {
      params: { g: "exp(z)", n: 3 },
      value: "pi/3",
      numeric: 1.0471975511965976,
      verifiedTo: 1e-15,
      method: "order 4; Res = c₃/i = −i/6",
    },
    {
      params: { g: "exp(z)", n: 5 },
      value: "pi/60",
      numeric: 0.05235987755982988,
      verifiedTo: 1e-14,
      method:
        "order 6, where a derivative-based residue would need d⁵/dz⁵ of a quotient and the series route needs no factorial at all; verified against quadrature for n = 0…5 with max relative error 6.1e-15",
    },
  ],
};
