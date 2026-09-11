// C1 — `indented-sinc`, transcribed from `docs/contour-integration/gallery/tier-cd.md` §C1.
//
// **The indentation is a half-turn, and a half-turn pays `iα·Res`.** Everything else about
// `∫₀^∞ sin x/x` is standard; the one irreducible idea is that `e^{iz}/z` has a genuine simple pole
// sitting exactly on the path, that the ρ-semicircle detouring *over* it EXCLUDES it — so it
// contributes nothing to the residue sum — and that in the limit it contributes `i·(−π)·Res = −iπ`,
// a FRACTION of `2πi·Res` fixed by the angle swept and its sign, never by taste.
//
// The two classical wrong answers are each one factor away: `2πi·Res` gives π instead of π/2, and
// "the small arc vanishes" gives 0.
//
// C1 is also the first entry where `∮ ≠ target`. The contour encloses NOTHING, so `∮ f dz = 0`, and
// the entire answer comes from the indentation. Reading the closed-contour value here — which is all
// tiers A and B ever needed — would report 0 for an integral whose value is π/2.
import { pt } from "../../engine/contour/model.js";
import type { Family } from "../schema.js";

export const c1IndentedSinc: Family = {
  id: "indented-sinc",
  title: "Dirichlet integral: ∫₀^∞ sin x / x dx = π/2, by the indented semicircle",
  taxonomySection: "4",
  tier: "C",

  targets: [
    {
      id: "I",
      kind: "integral",
      variable: "x",
      lower: "0",
      upper: "inf",
      integrand: "sin(x)/x",
      // The TARGET converges — conditionally, by Dirichlet — and needs no principal value, because
      // sin(x)/x extends continuously to 0. The AUXILIARY is the one that needs p.v.; see
      // `hypotheses.pv-provenance`. Conflating the two is `traps.pv-mislabelled`.
      convergence: "conditional",
      symbols: {},
    },
  ],

  auxiliary: {
    integrand: "exp(i*z)/z",
    // Im because sin x = Im e^{ix}; the /2 because sin(x)/x is EVEN, so ∫₀^∞ = ½∫_ℝ.
    relation: "Im/2",
    note: "sin x = Im e^{ix} on ℝ; the real part ∫cos x/x diverges at the origin, which is why the auxiliary needs a principal value and the target does not",
  },

  parameters: [],

  hypotheses: [
    {
      id: "aux-pole-simple",
      statement: "exp(iz)/z has a SIMPLE pole at z = 0 (L4 is false for order ≥ 2)",
      check: "algebraic:poleOrder(auxiliary, 0) == 1",
      onFail: "refuse",
    },
    {
      id: "jordan-half-plane",
      statement: "a = 1 > 0, so the closing arc must lie in Im z ≥ 0",
      check: "structural:arcHalfPlane(contour.bigarc) == halfPlaneOf(sign(a))",
      onFail: "refuse",
    },
    {
      id: "jordan-decay",
      statement: "M_R = max_{|z|=R, Im z≥0} |1/z| = 1/R → 0",
      check: "symbolic:maxOnArc(1/z, R) -> 0",
      onFail: "refuse",
    },
    {
      id: "no-other-poles",
      statement: "exp(iz)/z is holomorphic on Im z > 0, so the residue sum is empty",
      check: "algebraic:poleCount(auxiliary, upperHalfPlane) == 0",
      onFail: "warn",
    },
    {
      id: "target-converges",
      statement:
        "∫₀^∞ sin x/x converges CONDITIONALLY (Dirichlet test); it is not absolutely convergent",
      check: "analytic:dirichletTest(sin, 1/x) && absolutelyConvergent(target) == false",
      onFail: "warn",
    },
    {
      id: "pv-provenance",
      statement:
        "sin(x)/x extends continuously to x = 0, so the TARGET needs no p.v.; exp(ix)/x does",
      check: "algebraic:isRemovable(target.integrand, 0) && isRemovable(auxiliary.integrand, 0) == false",
      onFail: "warn",
    },
  ],

  // branch: DELIBERATELY OMITTED. exp(iz)/z is single-valued; z = 0 is a POLE, not a branch point.

  contour: {
    template: "indentedSemicircle",
    limitParams: [
      { name: "R", to: "inf" },
      { name: "rho", to: "0+" },
    ],
    pieces: [
      {
        id: "left",
        name: "the real axis, left of the indentation",
        geom: { kind: "segment", from: pt({ param: "R", mul: -1 }, 0), to: pt({ param: "rho", mul: -1 }, 0) },
        role: "target",
        // NEITHER SEGMENT IS INDIVIDUALLY A MULTIPLE OF THE UNKNOWN — only their sum is, and that sum
        // is the principal value. Pass 5 uses only `Σ aᵢ`, so the split between them is a convention;
        // writing ½ and ½ says that plainly, where 1 and 0 would look like a claim about each half.
        coefficients: [{ targetId: "I", coefficient: "1/2" }],
        colour: 0,
      },
      {
        id: "indent",
        name: "the ρ → 0 indentation over z = 0",
        // θ: π → 0 sweeps CLOCKWISE over the origin, so α = −π and the piece pays −iπ·Res.
        geom: { kind: "arc", center: pt(0, 0), radius: { param: "rho" }, theta0: Math.PI, theta1: 0 },
        role: "vanish",
        lemma: "L4",
        colour: 3,
      },
      {
        id: "right",
        name: "the real axis, right of the indentation",
        geom: { kind: "segment", from: pt({ param: "rho" }, 0), to: pt({ param: "R" }, 0) },
        role: "target",
        coefficients: [{ targetId: "I", coefficient: "1/2" }],
        colour: 0,
      },
      {
        id: "bigarc",
        name: "the R → ∞ semicircle",
        geom: { kind: "arc", center: pt(0, 0), radius: { param: "R" }, theta0: 0, theta1: Math.PI },
        role: "vanish",
        lemma: "L3",
        colour: 1,
      },
    ],
    orientation: "ccw",
    // The indentation EXCLUDES the pole. This is the whole geometric content of the method, and it
    // is why the residue sum is empty while the answer is not zero.
    windings: [{ pole: "0", n: "0" }],
  },

  vanishingLemmas: [
    {
      piece: "indent",
      lemma: "L4",
      sideCondition: "z = 0 is a simple pole; the swept angle is α = −π (clockwise, π → 0)",
      discharge: "symbolic:fractionalResidue(auxiliary, 0, alpha = -pi)",
      // L8 (Sokhotski–Plemelj): lim_{ε→0+} 1/(x − x₀ ∓ iε) = P 1/(x−x₀) ± iπ δ(x−x₀). Indenting ABOVE
      // the pole is the −iε prescription and fixes the sign; the sign is DERIVED from the i·ε choice,
      // never chosen by hand (research 03 §4 trap iv). Here it is derived from the signed sweep
      // (θ₁ − θ₀), which is the same choice in geometric form.
      //
      // The ROLE is `vanish` and the piece does NOT vanish, which looks contradictory and is not:
      // DESIGN §4 Pass 5's table gives a `vanish` piece `aᵢ = 0` and `bᵢ = 0, or a known limit such
      // as iα·Res from L4`. The role says it touches no unknown, not that it contributes nothing.
      rigorOfBound: "=",
      rigorOfLimit: "=",
      rigorIfNumericOnly: "≈",
    },
    {
      piece: "bigarc",
      lemma: "L3",
      sideCondition: "f = e^{iaz} g(z) with a = 1 > 0 on the UPPER arc; M_R = max|g| → 0",
      discharge: "symbolic:jordanBound(g = 1/z, a = 1, R)",
      // |∫| ≤ π/(a·R) = π/R → 0.
      rigorOfBound: "≤",
      rigorOfLimit: "=",
      rigorIfNumericOnly: "≈",
    },
  ],

  residueSelection: { rule: "upperHalfPlane", set: "{} — empty; the whole answer is the indentation" },

  closedForm: {
    expr: "Im( 2*pi*i*Sum(Res(f,z_k) : im(z_k) > 0) - i*pi*Sum(Res(f,x_j) : x_j in R) ) / 2",
    simplified: "pi/2",
  },

  rigor: {
    policy: "min",
    inputs: [
      "hypotheses.*",
      "vanishingLemmas.*.rigor",
      "residues.*.rigor",
      "auxiliary.relation",
      "target.convergence",
    ],
  },

  traps: [
    {
      id: "full-residue-at-an-indentation",
      detect: "structural:indentationWeight == 2*pi*i",
      message:
        "The indentation is a HALF turn. L4 gives iα·Res with α the signed swept angle; here α = −π, so the piece contributes −iπ·Res. 2πi·Res is the value of a FULL circle around an ENCLOSED pole — and this pole is not enclosed, it is detoured around. Using 2πi·Res gives p.v.∫ = 2πi and hence ∫₀^∞ sin x/x = π, exactly twice the right answer.",
    },
    {
      id: "l4-needs-a-simple-pole",
      detect: "algebraic:poleOrder(auxiliary, indentedPoint) > 1",
      message:
        "L4 is FALSE at a pole of order m ≥ 2: there is no fractional residue for a double pole. ∫ over the ρ-semicircle of exp(iz)/z² dz = −2/ρ + O(1) (measured |∫| = 1.6958e1, 1.9687e2, 1.9969e3, 1.9997e4 at ρ = 1e-1…1e-4, against 2/ρ = 2e1…2e4) — the limit does not exist, so the contour argument does not close and no p.v. exists either (Hadamard finite part is a different object). The simple-pole case for contrast converges: −3.12159, −3.14139, −3.14159 i at ρ = 1e-2, 1e-4, 1e-6.",
    },
    {
      id: "wrong-half-plane",
      detect: "numeric:sign(a) * structural:arcImSign(contour) < 0",
      message:
        "|exp(iaz)| = exp(−a·Im z) is bounded only where a·Im z ≥ 0. With a = +1, closing downward makes M_R grow like exp(R) and the Jordan bound DIVERGES. This is not a sign slip to patch up; the argument does not close.",
    },
    {
      id: "pv-mislabelled",
      detect: "structural:targetPrincipalValue != structural:auxiliaryPrincipalValue",
      message:
        "p.v.∫ exp(ix)/x dx exists ONLY as a principal value: ∫cos x/x diverges at the origin. ∫sin x/x converges outright. Attaching the p.v. qualifier to the target, or dropping it from the auxiliary, are both correctness bugs — p.v. existence does not imply integral existence (p.v.∫₀² dx/(x−1) = 0 while the integral diverges).",
    },
    {
      id: "indent-below-not-checked",
      detect: "structural:invariantChecked('indent-up == indent-down') == false",
      message:
        "Indenting BELOW puts the pole inside: the −iπ·Res becomes +iπ·Res AND a 2πi·Res appears. The two routes must agree; that agreement is a free self-test, not a variant to choose by taste.",
    },
    {
      id: "indentation-sign-set-by-hand",
      detect: "structural:indentationSignSource == null",
      message:
        "The ± of iπ·Res must be tied mechanically to the i·ε prescription (L8, Sokhotski–Plemelj: lim 1/(x − x₀ ∓ iε) = P 1/(x−x₀) ± iπ δ), not read off a picture. Physics conventions — Feynman iε, retarded vs advanced Green's functions — ARE exactly this choice of which side to indent, so the app should display the prescription alongside the geometry. A sign chosen by inspection is the single most common error in this family and it leaves no trace in the arithmetic.",
    },
  ],

  golden: [
    {
      params: {},
      value: "pi/2",
      numeric: 1.5707963267948966,
      verifiedTo: 3e-16,
      method:
        "the residue sum is EMPTY and the whole value is L4's iα·Res at α = −π: Res(e^{iz}/z, 0) = 1, so p.v.∫_ℝ e^{ix}/x dx = iπ and the target is Im(iπ)/2 = π/2. Independently verified two ways in research: (a) half-period decomposition at multiples of π with repeated-averaging acceleration of the alternating tail; (b) 64-point Gauss–Legendre per half period to A = 40π plus the alternating asymptotic tail — both give 1.5707963267948961, relative 2.8e-16",
    },
    {
      params: { form: "pv" },
      value: "i*pi",
      numeric: [0, 3.141592653589793],
      verifiedTo: 1e-5,
      method:
        "the auxiliary's own value, p.v.∫_ℝ e^{ix}/x dx = iπ, before Im and the evenness fold — the fixture that separates the auxiliary's principal value from the target's ordinary convergence",
    },
  ],
};
