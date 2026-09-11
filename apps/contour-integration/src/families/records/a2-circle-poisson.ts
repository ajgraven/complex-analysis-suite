// A2 — `circle-poisson`, transcribed from `docs/contour-integration/gallery/tier-ab.md` §1.
//
// A1's structure with the sign replaced by a PARAMETER-DEPENDENT SWITCH: the poles `z = a` and
// `z = 1/a` are a reciprocal pair whose membership of the unit disc trades places at `|a| = 1`, and
// the closed form is `2π/(1−a²)` on one side and `2π/(a²−1)` on the other. Unlike A1 this entry can
// be *caught* — the integrand is `|1 − a e^{iθ}|² > 0`, so a negative result is a proof that the
// wrong pole was enclosed, and that costs one comparison. A2 is therefore the entry showing
// `residueSelection` must be COMPUTED: the two branches share one tidy closed form `2π/|1−a²|` that
// conceals the fact that the enclosed pole is not the same point.
import { pt } from "../../engine/contour/model.js";
import type { Family } from "../schema.js";

export const a2CirclePoisson: Family = {
  id: "circle-poisson",
  title: "∫₀^{2π} dθ/(1 + a² − 2a cos θ) — the Poisson kernel and its |a| ≶ 1 switch",
  taxonomySection: "1",
  tier: "A",

  targets: [
    {
      id: "I",
      kind: "integral",
      variable: "theta",
      lower: "0",
      upper: "2*pi",
      integrand: "1/(1 + a^2 - 2*a*cos(theta))",
      convergence: "absolute",
      symbols: { a: { kind: "realParam" } },
      // 1 + a² − 2a cos θ = |1 − a e^{iθ}|² = −(az−1)(z−a)/z  ⇒  f(z) = i/((a z − 1)(z − a))
      substitution: {
        map: "exp(i*theta)",
        inverse: "-i*log(z)",
        jacobian: "1/(i*z)",
      },
    },
  ],

  parameters: [{ name: "a", domain: "real", constraints: ["abs(a) != 1"] }],

  // restrictions: DELIBERATELY ABSENT. 2π/|1−a²| holds on the whole parameter domain |a| ≠ 1; what
  // changes across |a| = 1 is WHICH POLE is enclosed, and that is carried by `windings` below and
  // explained by traps.branch-hidden-by-closed-form.

  hypotheses: [
    {
      id: "no-pole-on-circle",
      statement: "a z² − (1+a²) z + a has no unimodular root  ⟺  |a| ≠ 1",
      check: "algebraic:noUnitCircleRoot(a*z^2 - (1 + a^2)*z + a)",
      onFail: "refuse",
    },
    {
      id: "selection-is-computed",
      statement:
        "the enclosed pole is determined by testing |z| < 1 on each detected pole, not by a rule keyed to the formula",
      check: "structural:residueSelectionIsComputed(contour, poles)",
      onFail: "refuse",
    },
    {
      id: "positivity",
      // A post-condition on the ANSWER, executed after SOLVE. Cheap, and it mechanically catches the
      // pole-selection error below.
      statement:
        "1 + a² − 2a cos θ = |1 − a e^{iθ}|² ≥ (1−|a|)² > 0, so the value must be > 0",
      check: "numeric:value > 0",
      onFail: "refuse",
    },
  ],

  // branch: DELIBERATELY OMITTED — rational in z, single-valued.

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
    // The winding numbers are the SWITCH, written out: neither pole has a fixed membership.
    windings: [
      { pole: "a", n: "if(abs(a) < 1, 1, 0)" },
      { pole: "1/a", n: "if(abs(a) > 1, 1, 0)" },
    ],
  },

  vanishingLemmas: [],

  residueSelection: { rule: "inside" },

  closedForm: {
    expr: "2*pi/abs(1 - a^2)",
    simplified: "2*pi/(1 - a^2)", // valid only on |a| < 1 — see traps.branch-hidden-by-closed-form
  },

  rigor: {
    policy: "min",
    inputs: ["hypotheses.*", "residues.*.rigor", "windingNumbers.*", "contour.closed"],
  },

  traps: [
    {
      id: "pole-selection-switch",
      detect: "numeric:abs(selectedPole) > 1",
      message:
        "z = a and z = 1/a are a reciprocal pair. For |a| < 1 the enclosed pole is a, with Res = i/(a²−1); for |a| > 1 it is 1/a, with Res = i/(1−a²). These differ by a SIGN, not by a relabelling, so taking z = a unconditionally returns 2π/(1−a²), which at a = 2 is −2π/3 = −2.0944 — negative, for an integrand that is a squared modulus. The switch is at |a| = 1 and nothing in the algebra announces it; only testing |z| < 1 on each detected pole does.",
    },
    {
      id: "positivity-violated",
      detect: "numeric:value < 0",
      message:
        "1 + a² − 2a cos θ = |1 − a e^{iθ}|², so the integral is positive for every legal a. A negative result is not a small error to be patched with a sign: it is a certificate that a pole outside the contour was summed, or that one inside was missed. Refuse and report which pole carried the wrong winding number.",
    },
    {
      id: "modulus-one-refusal",
      detect: "hypotheses.no-pole-on-circle == false",
      message:
        "At |a| = 1 the two poles collide ON the contour at z = a = ±1, and 1 + a² − 2a cos θ = 2 ∓ 2cos θ vanishes to second order there. The integral diverges like 2/ε: truncating the θ-range at ε gives 2.00×10³ at ε = 10⁻³ and 1.95×10⁵ at ε = 10⁻⁵. 2π/(1−a²) = ∞ is a division by zero, not a limit, and must not be rendered as one.",
    },
    {
      id: "branch-hidden-by-closed-form",
      detect: "structural:closedFormIsSingleExpression && residueSelection.dependsOnParameters",
      message:
        "2π/|1−a²| is one continuous-looking expression covering both sides of |a| = 1, which is precisely why it is dangerous to treat the closed form as the family. The DERIVATION is discontinuous there — a different point is enclosed — even though the VALUE is not. The record must carry the selection rule; a family reduced to its closed form has thrown away the only thing that could have caught the error.",
    },
    {
      id: "pole-escapes-to-infinity",
      detect: "numeric:a == 0",
      message:
        "At a = 0 the pole z = 1/a leaves the finite plane and the z-denominator drops to degree 1: f(z) = −i/z, one simple pole at the origin, Res = −i, value 2π. The answer is right and the pole COUNT changed. An engine that caches 'this family has two poles' from a previous parameter value reports a phantom.",
    },
  ],

  golden: [
    {
      params: { a: 0.5 },
      value: "8*pi/3",
      numeric: 8.377580409572781,
      verifiedTo: 1e-14,
      method:
        "enclosed pole z = a = 1/2 (simple), Res = i/(a²−1) = −4i/3 exactly in ℚ(i); cross-checked against a small-circle quadrature and the contour quadrature",
    },
    {
      params: { a: -0.5 },
      value: "8*pi/3",
      numeric: 8.377580409572781,
      verifiedTo: 1e-14,
      method: "the sign of a moves the enclosed pole to −1/2 and leaves the value unchanged",
    },
    {
      params: { a: 2 },
      value: "2*pi/3",
      numeric: 2.0943951023931953,
      verifiedTo: 1e-14,
      method:
        "|a| > 1, so the ENCLOSED pole is now z = 1/a = 1/2 and Res = i/(1−a²) = −i/3 — the fixture that catches an unconditional 'take z = a', which returns −2π/3 for a squared modulus",
    },
    {
      params: { a: -3 },
      value: "pi/4",
      numeric: 0.7853981633974483,
      verifiedTo: 1e-13,
      method: "|a| > 1 with a < 0: both the switch and the sign exercised at once",
    },
    {
      params: { a: 0 },
      value: "2*pi",
      numeric: 6.283185307179586,
      verifiedTo: 1e-15,
      method:
        "the degenerate case: z = 1/a leaves the finite plane, f = −i/z has ONE simple pole, and the pole count itself changes — the fixture that catches a cached pole set",
    },
    {
      params: { a: 0.9 },
      value: "2*pi/0.19",
      numeric: 33.06939635357678,
      verifiedTo: 1e-14,
      method:
        "a pole close to the contour (|z| = 0.9), where the exact route is unaffected and a floating one starts to lose digits",
    },
  ],
};
