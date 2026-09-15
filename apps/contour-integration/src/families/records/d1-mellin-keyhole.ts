// D1 — `mellin-keyhole`, transcribed from `docs/contour-integration/gallery/tier-cd.md` §D1.
//
// **The `argRange` is an input to the answer, and the wrong one is a division by zero.** The keyhole
// works because `z^{α−1}` returns to the positive real axis multiplied by `e^{2πi(α−1)}`: the two
// straight edges therefore FAIL to cancel, and `1 − e^{2πiα}` is the whole mechanism. Choose
// `arg ∈ (−π,π]` instead and three things go wrong at once, each caught at a different pass — the
// cut moves to ℝ₋ and the pole of `1/(1+z)` at `z = −1` lands ON it (LEGALITY step 1); the circles
// cross the cut with no `side` tag (LEGALITY step 2); and the lower edge, having gained no phase,
// reproduces the target with factor exactly `−1`, so `1 + Σcⱼ = 0` and Pass 5 divides by zero.
//
// The classical symptom is "the two edges cancel and my integral collapses to 0" — and the app never
// prints 0, because the DENOMINATOR is zero rather than the numerator. That is the difference between
// a hard-coded trap detector and a structural one, and it is worth the whole design.
import { pt } from "../../engine/contour/model.js";
import type { Family } from "../schema.js";

export const d1MellinKeyhole: Family = {
  id: "mellin-keyhole",
  title: "∫₀^∞ x^(α−1)/(1+x) dx = π/sin(πα): the keyhole and Euler reflection",
  taxonomySection: "5.1",
  tier: "D",

  targets: [
    {
      id: "I",
      kind: "integral",
      variable: "x",
      lower: "0",
      upper: "inf",
      integrand: "x^(alpha-1)/(1+x)",
      convergence: "absolute",
      symbols: { R: { kind: "rationalFn", var: "x" } },
    },
  ],

  auxiliary: {
    integrand: "z^(alpha-1)/(1+z)",
    // The contour integral IS the target times `1 − e^{2πiα}`; no real/imaginary part is taken, and
    // no evenness fold applies — the target already runs over `[0, ∞)`.
    relation: "Re",
    note: "the upper edge is the target itself; the lower edge is the target times −e^{2πi(α−1)}, and the two together multiply the unknown by 1 − e^{2πiα}",
  },

  parameters: [{ name: "alpha", domain: "real", constraints: ["alpha > 0", "alpha < 1", "alpha not in Z"] }],

  hypotheses: [
    {
      id: "R-rational",
      statement: "R is rational with finitely many poles",
      check: "structural:isRational(R)",
      onFail: "refuse",
    },
    {
      id: "no-poles-on-cut",
      statement: "R has no pole on [0, inf)",
      check: "algebraic:noRealNonnegativeRoot(denom(R))",
      onFail: "refuse",
    },
    {
      id: "fundamental-strip",
      statement:
        "-m < alpha < d with R = O(x^-d) at inf and O(x^m) at 0; here 0 < alpha < 1, and each end is spent by one circle",
      check: "algebraic:strip(alpha, ord0(R), decayExponent(R))",
      onFail: "refuse",
    },
    {
      id: "cut-admissible",
      statement:
        "branch points {0, inf}, exponent alpha-1 not in Z at 0, so the cut MUST join 0 to inf (research 06 s2.1(b): no bounded component is possible)",
      check: "branch:validateCutSystem(branch) == ok",
      onFail: "refuse",
    },
    {
      id: "nondegenerate-solve",
      statement: "1 + Sum(c_j) = 1 - exp(2 pi i alpha) != 0, i.e. alpha is not an integer",
      check: "algebraic:abs(1 - exp(2*pi*i*alpha)) > cond_min",
      onFail: "refuse",
    },
  ],

  branch: {
    function: "z^(alpha-1)",
    rationalPart: "1/(1+z)",
    factors: [
      {
        at: "0",
        order: { kind: "power", alpha: "alpha-1" },
        // `arg z ∈ [0, 2π)`, as multiples of π. NOT the principal determination, and the record's
        // whole first paragraph is about what happens if that is forgotten.
        argRange: ["0", "2"],
      },
    ],
    cuts: [{ from: "0", to: "infinity" }],
    // MULTIPLICATIVE: `f ↦ f·e^{2πi(α−1)}`. D4's `log z ↦ log z + 2πi` is the additive case, and the
    // tagged union exists so the two cannot be confused (M4-plan §1.3).
    crossingPhase: { kind: "multiplicative", factor: "exp(2*pi*i*(alpha-1))" },
    admissibility:
      "the one component {0, ∞} touches infinity, so research 06 §2.1(b) imposes nothing on Σα — which is why the cut may be ANY arc from 0 to ∞ and dragging it is legal",
  },

  contour: {
    template: "keyhole",
    limitParams: [
      { name: "R", to: "inf" },
      { name: "eps", to: "0+" },
    ],
    pieces: [
      {
        id: "upper",
        name: "the upper edge of the cut",
        geom: { kind: "segment", from: pt({ param: "eps" }, 0), to: pt({ param: "R" }, 0) },
        role: "target",
        side: "above",
        colour: 0,
      },
      {
        id: "outer",
        name: "the $R \\to \\infty$ circle",
        geom: { kind: "arc", center: pt(0, 0), radius: { param: "R" }, theta0: 0, theta1: 2 * Math.PI },
        role: "vanish",
        lemma: "L2",
        colour: 1,
      },
      {
        id: "lower",
        name: "the lower edge of the cut",
        geom: { kind: "segment", from: pt({ param: "R" }, 0), to: pt({ param: "eps" }, 0) },
        role: "reproduces",
        side: "below",
        // Convention F: the factor is the FULL multiplier of the target, reversal included. Dropping
        // the minus sign turns `1 − e^{2πiα}` into `1 + e^{2πiα}` and produces π/tan-shaped nonsense
        // that is finite and plausible-looking — the record's `missing-reversal-sign` trap.
        coefficients: [{ targetId: "I", coefficient: "-exp(2*pi*i*(alpha-1))" }],
        colour: 2,
      },
      {
        id: "inner",
        name: "the $\\varepsilon \\to 0$ circle",
        geom: {
          kind: "arc",
          center: pt(0, 0),
          radius: { param: "eps" },
          theta0: 2 * Math.PI,
          theta1: 0,
        },
        role: "vanish",
        lemma: "L1",
        colour: 3,
      },
    ],
    orientation: "ccw",
    // The keyhole's net winding about the BRANCH POINT is +1 − 1 = 0, which is what makes it a loop
    // in ℂ∖Γ; about the pole at z = −1 it is 1.
    windings: [{ pole: "-1", n: "1" }],
  },

  vanishingLemmas: [
    {
      piece: "outer",
      lemma: "L2",
      sideCondition:
        "|z^(alpha-1) R(z)| <= M/|z|^p with p = 2 - alpha > 1 on |z| = R; this is where alpha < 1 is spent",
      discharge: "symbolic:degreeBound(alpha, R) => |int| <= 2*pi*R^alpha/(R-1) -> 0 iff alpha < 1",
      rigorOfBound: "≤",
      rigorOfLimit: "=",
      rigorIfNumericOnly: "≈",
    },
    {
      piece: "inner",
      lemma: "L1",
      sideCondition: "eps * max_{|z|=eps} |z^(alpha-1) R(z)| -> 0; this is where alpha > 0 is spent",
      discharge: "symbolic:ord0Bound(alpha, R) => |int| <= 2*pi*eps^alpha/(1-eps) -> 0 iff alpha > 0",
      rigorOfBound: "≤",
      rigorOfLimit: "=",
      rigorIfNumericOnly: "≈",
    },
  ],

  residueSelection: { rule: "notOn", set: "[0, inf) — here the single simple pole z = −1 = e^{iπ}" },

  closedForm: {
    expr: "(2*pi*i/(1 - exp(2*pi*i*alpha))) * Sum(Res(z^(alpha-1)*R(z), z_k))",
    simplified: "pi/sin(pi*alpha)",
  },

  rigor: {
    policy: "min",
    inputs: ["hypotheses.*", "vanishingLemmas.*.rigor", "residues.*.rigor", "branch.*"],
  },

  traps: [
    {
      id: "wrong-branch",
      detect: "branch:argRange(factors[0]) != [0, 2]",
      message:
        "With arg in (−π, π] the cut lies on ℝ₋, so the two sides of ℝ₊ are THE SAME SIDE: the lower edge gains no phase, its factor is −exp(0) = −1, and 1 + Σcⱼ = 1 − 1 = 0. The system then carries no information about the target and the app REFUSES — the classical symptom 'the two edges cancel and the integral collapses to 0' appears as a division by zero, not as a numerator of zero. Two earlier refusals fire first: the pole z = −1 now lies ON the cut (LEGALITY step 1), and both circles cross the cut untagged (LEGALITY step 2). Report the earliest; attach this message to the degenerate SOLVE row.",
    },
    {
      id: "branch-point-is-not-a-pole",
      detect: "branch:residueRequestedAtBranchPoint(0)",
      message:
        "z = 0 is a BRANCH POINT of z^(alpha-1), not a pole: there is no Laurent series there and no residue to take. The inner circle is killed by the ML bound 2*pi*eps^alpha/(1-eps), which is exactly where the hypothesis alpha > 0 is spent. Asking for Res(f, 0) is a category error, and a numeric residue routine will happily return a meaningless number from a circle that crosses the cut.",
    },
    {
      id: "residue-with-the-wrong-argument",
      detect: "branch:argOf(polePoint) not in argRange(factors[0])",
      message:
        "The pole is at z = −1 = exp(i pi) with arg = pi, which IS in (0, 2pi). Evaluating (−1)^(alpha−1) as exp(−i pi (alpha−1)) — i.e. with arg = −pi, the principal determination — changes the answer by exp(2 pi i (alpha−1)) and NOTHING warns you. Every residue must be evaluated in the declared argRange; the check is arithmetic, not a convention.",
    },
    {
      id: "missing-reversal-sign",
      detect: "structural:coefficientOf(lower) == 'exp(2*pi*i*(alpha-1))'",
      message:
        "The lower edge is traversed R → eps. Its factor (convention F) is the full multiplier of the target INCLUDING the reversal: −exp(2 pi i (alpha−1)). Dropping the minus sign turns 1 − exp(2 pi i alpha) into 1 + exp(2 pi i alpha) and produces pi/tan(pi alpha)-shaped nonsense that is finite and plausible-looking.",
    },
    {
      id: "circles-asserted-not-proved",
      detect: "structural:vanishingLemmas.any(l => l.discharge == null)",
      message:
        "'The circles clearly vanish' is where the hypothesis 0 < alpha < 1 actually lives: the inner circle needs alpha > 0, the outer needs alpha < 1. At alpha = 1 the outer bound is 2*pi*R^0 = 2*pi and does NOT tend to zero; at alpha = 0 the inner bound is 2*pi. The bounds are the content of the theorem, not preamble.",
    },
    {
      id: "pole-on-cut",
      detect: "hypotheses.no-poles-on-cut == false",
      message:
        "A pole of R on [0, inf) sits on the contour: the residue theorem does not apply and the integral does not converge. Refuse.",
    },
  ],

  golden: [
    {
      params: { alpha: 0.3 },
      value: "pi/sin(pi*alpha)",
      numeric: 3.8832220774509327,
      verifiedTo: 7e-16,
      method:
        "double-exponential (exp-sinh) quadrature on (0, inf), which absorbs the x^(alpha-1) endpoint singularity; all five points agree with pi/sin(pi alpha) to <= 7e-16 relative. Contour bookkeeping verified independently: closed-contour total = 2*pi*i*exp(i pi (alpha-1)) to 8.7e-16 at eps=1e-9, R=1e9, and c = lower/I recovered as -exp(2 pi i alpha) to the same truncation as the edge itself — the inner circle is still 1.1e-2 at eps=1e-9, since it vanishes only like eps^0.3, which is a good live demonstration of a slow limit",
    },
    {
      params: { alpha: 0.5 },
      value: "pi",
      numeric: 3.1415926535897931,
      verifiedTo: 2e-16,
      method: "exp-sinh DE quadrature on (0, inf); sin(pi/2) = 1, so the sine leaves the answer",
    },
    {
      params: { alpha: 0.75 },
      value: "pi/sin(3*pi/4)",
      numeric: 4.4428829381583661,
      verifiedTo: 1e-16,
      method: "exp-sinh DE quadrature on (0, inf)",
    },
    {
      params: { alpha: 0.1 },
      value: "pi/sin(pi/10)",
      numeric: 10.166407384630521,
      verifiedTo: 4e-16,
      method: "exp-sinh DE quadrature on (0, inf); near the edge of the strip, where the inner circle vanishes slowest",
    },
    {
      params: { alpha: 0.9 },
      value: "pi/sin(9*pi/10)",
      numeric: 10.166407384630517,
      verifiedTo: 7e-16,
      method: "exp-sinh DE quadrature on (0, inf); the reflection partner of alpha = 0.1, and equal to it to 4e-16",
    },
  ],
};
