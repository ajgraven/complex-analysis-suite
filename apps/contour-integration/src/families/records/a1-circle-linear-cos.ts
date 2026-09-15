// A1 — `circle-linear-cos`, transcribed from `docs/contour-integration/gallery/tier-ab.md` §1.
//
// The cheapest `=` in the engine, and the entry that teaches WHICH ROOT IS INSIDE. The two poles are
// a reciprocal pair, so exactly one is enclosed — but which one flips with the sign of `a`, and the
// textbook closed form `2π/√(a²−b²)` is silently wrong for `a < −|b|`, where the residue machinery,
// asked properly, still returns the right (negative) answer. That split is the whole point: the
// hypothesis that keeps the contour legal (`|a| > |b|`) is strictly weaker than the hypothesis the
// printed closed form needs (`a > |b|`), and an engine that conflates them prints a positive number
// for a negative integral.
import { pt } from "../../engine/contour/model.js";
import type { Family } from "../schema.js";

export const a1CircleLinearCos: Family = {
  id: "circle-linear-cos",
  title: "∫₀^{2π} dθ/(a + b cos θ) — the reciprocal-root pair",
  taxonomySection: "1",
  tier: "A",

  targets: [
    {
      id: "I",
      kind: "integral",
      variable: "theta",
      lower: "0",
      upper: "2*pi",
      integrand: "1/(a + b*cos(theta))",
      // Not a principal value: the integrand is continuous on [0, 2π] once the hypotheses hold.
      convergence: "absolute",
      symbols: {
        a: { kind: "realParam" },
        b: { kind: "realParam" },
      },
      // θ: 0→2π traverses |z| = 1 once, positively. dθ = dz/(iz); cos θ = (z + 1/z)/2.
      substitution: {
        map: "exp(i*theta)",
        inverse: "-i*log(z)",
        jacobian: "1/(i*z)",
      },
    },
  ],

  parameters: [
    { name: "a", domain: "real", constraints: ["abs(a) > abs(b)"] },
    { name: "b", domain: "real", constraints: ["abs(b) < abs(a)"] },
  ],

  // restrictions: DELIBERATELY ABSENT. The field scopes a claim to something NARROWER than the
  // parameter domain (DESIGN §5's examples are a branch selection), and this family's sign-general
  // closed form holds on the whole legal domain |a| > |b|. The gap between that and what the
  // TEXTBOOK form needs is a trap, not a restriction — see traps.textbook-form-drops-sign.

  hypotheses: [
    {
      id: "no-pole-on-circle",
      // The denominator is palindromic, so its roots pair as {r, 1/r}; a unimodular root means BOTH
      // are on the contour.
      statement:
        "b z² + 2a z + b has no root on |z| = 1  ⟺  |a| > |b|  ⟺  a + b cos θ ≠ 0 for all θ",
      check: "algebraic:noUnitCircleRoot(b*z^2 + 2*a*z + b)",
      onFail: "refuse",
    },
    {
      id: "nondegenerate-quadratic",
      statement:
        "b ≠ 0, so the z-denominator really is quadratic (b = 0 degenerates to ∫dθ/a = 2π/a)",
      check: "algebraic:degree(b*z^2 + 2*a*z + b, z) == 2",
      onFail: "warn",
    },
    {
      id: "enclosed-root-verified",
      statement:
        "the root selected as enclosed satisfies |z| < 1 — tested, never inferred from the ± branch",
      check: "algebraic:insideUnitCircle(selectedRoot)",
      onFail: "refuse",
    },
  ],

  // branch: DELIBERATELY OMITTED. The integrand is a rational function of z; single-valued; no
  // branch point, no cut, no crossing phase. This absence is a decision, not an oversight.

  contour: {
    template: "circle",
    limitParams: [], // nothing tends to a limit: the contour is already closed
    pieces: [
      {
        id: "unitCircle",
        name: "the unit circle $|z| = 1$",
        geom: {
          kind: "arc",
          center: pt(0, 0),
          radius: 1,
          theta0: 0,
          theta1: 2 * Math.PI,
        },
        // §1 is the only family whose pieces are ALL `target` — there is no auxiliary piece to kill.
        role: "target",
        colour: 0,
      },
    ],
    orientation: "ccw",
    windings: [
      // `a/abs(a)` is sgn(a) written in the grammar the expression language actually has; a = 0 is
      // not a legal parameter here, since |a| > |b| ≥ 0.
      { pole: "(-a + a/abs(a)*sqrt(a^2 - b^2))/b", n: "1" },
      { pole: "(-a - a/abs(a)*sqrt(a^2 - b^2))/b", n: "0" },
    ],
  },

  // EMPTY, and legitimately so: the contour is closed with no auxiliary piece. §1 is the only family
  // in the taxonomy with an empty list (research 03 §1), which is exactly why it is A1. Invariant 1
  // constrains `vanish` pieces only, so an empty list is well-formed.
  vanishingLemmas: [],

  residueSelection: { rule: "inside" },

  closedForm: {
    expr: "2*pi*sign(a)/sqrt(a^2 - b^2)",
    simplified: "2*pi/sqrt(a^2 - b^2)",
    // The familiar textbook form drops `sign(a)`; at `a = -2` it is positive where the value is not.
    simplifiedWhen: "a > 0",
  },

  rigor: {
    policy: "min",
    inputs: ["hypotheses.*", "residues.*.rigor", "windingNumbers.*", "contour.closed"],
  },

  traps: [
    {
      id: "wrong-root-inside",
      detect: "algebraic:insideUnitCircle(selectedRoot) == false",
      message:
        "z₊z₋ = b/b = 1, so the two poles are a reciprocal pair and exactly one lies inside |z| = 1 — but which one is NOT always the +√ branch. For a > 0 it is z₊ = (−a+√(a²−b²))/b; for a < 0 it is z₋. In general the enclosed root is (−a + sgn(a)√(a²−b²))/b. Choosing by the sign in front of the radical instead of by testing |z| < 1 flips the residue from −i·sgn(a)/√(a²−b²) to its negative and returns −2π/√(a²−b²): the right magnitude with the wrong sign, which no magnitude check will catch.",
    },
    {
      id: "textbook-form-drops-sign",
      detect: "numeric:a < 0",
      message:
        "2π/√(a²−b²) is positive for every legal (a,b), but for a < −|b| the integrand a + b cos θ is negative everywhere and so is the integral: at a = −2, b = 1 the true value is −2π/√3 = −3.62759872846844. The residue computation is NOT wrong here — it selects z₋, gets Res = +i/√3, and returns −2π/√3 correctly. Only the *printed closed form* is wrong, because a² > b² (the legality hypothesis) is strictly weaker than a > |b| > 0 (the closed form's hypothesis). A restriction that travels with a certificate but not with a formula is how a true claim becomes a false one.",
    },
    {
      id: "pole-on-circle",
      detect: "hypotheses.no-pole-on-circle == false",
      message:
        "Two distinct failures wear the same face. |a| = |b| collides the pair at z = ∓1, a DOUBLE pole on the contour, and 2π/√0 = ∞ is not a limit. |a| < |b| makes a²−b² negative, and since z₊z₋ = 1 with z₋ = conj(z₊), BOTH poles land on |z| = 1: at a = 1, b = 2 they sit at −1/2 ± (√3/2)i with modulus exactly 1, the integrand blows up at θ = arccos(−a/b), and truncating at ε gives 1.53 at ε = 10⁻² and −79.2 at ε = 10⁻⁴ — no limit exists. Refuse; do not return √ of a negative.",
    },
    {
      id: "jacobian-pole-is-removable",
      detect: "structural:jacobianIntroducesPoleAt(0) && structural:polesOf(contourIntegrand) excludes 0",
      message:
        "dθ = dz/(iz) looks as though it makes z = 0 a pole, and in A3 and A4 it does. Here it does not: clearing the z⁻¹ inside cos θ multiplies the numerator by z, which cancels the Jacobian's z exactly, leaving f(z) = −2i/(b z² + 2a z + b) with f(0) = −2i/b finite. The engine must decide this by gcd-cancelling num against den over ℚ(i) (DESIGN §6.3 step 1) and reporting z = 0 as a *named removable singularity*, not by failing to look. Contrast A3 (order n) and A4 (the only pole present).",
    },
  ],

  golden: [
    {
      params: { a: 2, b: 1 },
      value: "2*pi/sqrt(3)",
      numeric: 3.6275987284684357,
      verifiedTo: 1e-14,
      method:
        "exact residue −i/√(a²−b²) at the enclosed root of the reciprocal pair, in ℚ(i)(√3); cross-checked against a small-circle quadrature at r = 1e-4 and against the contour quadrature",
    },
    {
      params: { a: 5, b: 3 },
      value: "pi/2",
      numeric: 1.5707963267948966,
      verifiedTo: 1e-14,
      method:
        "the rational case — b z² + 2a z + b = (3z+1)(z+3) splits over ℚ, so the whole computation stays in ℚ(i) and no quadratic extension is needed",
    },
    {
      params: { a: 2, b: -1 },
      value: "2*pi/sqrt(3)",
      numeric: 3.6275987284684357,
      verifiedTo: 1e-14,
      method:
        "b < 0: the enclosed root MOVES and the value does not — the fixture that separates 'which root' from 'what answer'",
    },
    {
      params: { a: -2, b: 1 },
      value: "-2*pi/sqrt(3)",
      numeric: -3.6275987284684357,
      verifiedTo: 1e-14,
      method:
        "the sign case, and the fixture that guards traps.textbook-form-drops-sign: the residue route returns the correct negative value while the textbook closed form returns its positive negation",
    },
    {
      params: { a: 10, b: -9.5 },
      value: "2*pi/sqrt(9.75)",
      numeric: 2.012229726507833,
      verifiedTo: 1e-14,
      method:
        "a pole near the circle (|z| ≈ 0.724 against a companion at 1.381): legal, stiff, and exact only because the root split happens in ℚ(i)(√39) rather than in floating point",
    },
  ],
};
