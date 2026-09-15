// D7 — `dogbone-two-fractional-powers`, transcribed from `docs/contour-integration/gallery/tier-cd.md`.
//
// **TWO DIFFERENT FRACTIONAL EXPONENTS SHARING ONE CUT, AND A RESIDUE AT INFINITY THAT CARRIES THE
// ANSWER.** `z^μ(b−z)^ν/(c−z)` has branch points at `0` and `b` with exponents `μ` and `ν = 1 − μ`.
// Neither is an integer, so both must lie on the cut; their sum is `1 ∈ ℤ`, so by research 06 §2.1(b)
// the *bounded* arc `[0,b]` is admissible and the dogbone exists. That condition is not bookkeeping —
// it is exactly the statement that the phase acquired between the upper and lower edges is well
// defined **independently of which end you route around**: counterclockwise about `0` multiplies by
// `e^{2πiμ}`, about `b` by `e^{−2πiν}`. Equal, and equal *because* `Σαₖ ∈ ℤ`.
//
// Then the payoff. `f → e^{iπμ} ≠ 0` at infinity, so the outer circle does **not** vanish and
// `Res(f,∞) = −e^{iπμ}(c − νb)` contributes a term of magnitude 18.9 in an answer of magnitude 1.2.
// Drop it and you are not slightly wrong: keeping only `Res(f, c)` gives a value that is **still
// perfectly real**, so the usual "the answer came out complex, I made a mistake" check does not fire;
// it is simply wrong by a factor of 14.5 and by a sign. D7 is where "forgetting `Res(f,∞)` silently
// drops a term" stops being a footnote.
//
// **THE TWO FACTORS ARE READ IN DIFFERENT WINDOWS, AND ONE OF THEM IS WRITTEN BACKWARDS.** `z^μ` uses
// `arg z ∈ [0,2π)`; `(b−z)^ν` uses the principal window, and it is `(b − z)` rather than `(z − b)` —
// the same number and not the same power, because the argument read in the window is the argument of
// whichever difference the record wrote. At `z = c > b` this is the difference between `arg = −π` and
// `arg = +π`, which rotates the residue by `e^{iπ/2}` and leaves the answer real and plausible.
//
// ── TRANSCRIPTION NOTES ───────────────────────────────────────────────────────────────────────────
//
// **The outer circle is not a piece**, for the reason D6's record says: drawing `C_R` beside the
// dogbone makes two disjoint loops into one path and every winding number `1`. It is `Res(f,∞)`,
// exactly, and appears as that row — which is what the gallery's ⚠ GAP G5 asks for from the other
// side ("the same piece must become a `residue` row instead").
//
// **`μ = 1` is excluded by the parameters and is not a fixture.** The record asks the app to "degrade
// to `≈` with a stated condition number before refusing" as `1 − e^{2πiμ} → 0`; what the engine does
// instead is refuse a zero coefficient outright, which is the honest end of the same requirement and
// is what `solveTarget` already does for every other family.
import { pt } from "../../engine/contour/model.js";
import type { Family } from "../schema.js";

export const d7DogboneTwoFractionalPowers: Family = {
  id: "dogbone-two-fractional-powers",
  title: "∫₀^{b} x^{μ}(b−x)^{1−μ} dx/(c−x) by a dogbone",
  titleLatex: "$\\int_0^{b}\\frac{x^{\\mu}(b-x)^{1-\\mu}}{c-x}\\,dx$ by a dogbone",
  taxonomySection: "Multivalued integrands: dogbones and the residue at infinity",
  tier: "D",

  description: {
    contour: "the dogbone about $[0,b]$; $\\arg z\\in[0,2\\pi)$, $\\arg(b-z)\\in(-\\pi,\\pi]$",
    point:
      "The exponents sum to $1$, so the bounded cut is admissible; $f\\to e^{i\\pi\\mu}\\ne0$ at $\\infty$, and $\\operatorname{Res}(f,\\infty)$ is the larger part of the answer. No standard text treats this exact integral; the method is the dogbone with the residue at infinity.",
    citations: [
      { book: "Ahlfors", where: "Ch. 4 §5", text: "residue at infinity" },
      { book: "Marsden–Hoffman", where: "§4", text: "dogbone" },
    ],
  },

  targets: [
    {
      id: "T",
      kind: "integral",
      variable: "x",
      lower: "0",
      upper: "b",
      integrand: "x^mu * (b-x)^(1-mu) / (c-x)",
      convergence: "absolute",
      symbols: { R: { kind: "rationalFn", var: "x" } },
    },
  ],

  auxiliary: {
    integrand: "z^mu * (b-z)^(1-mu) / (c-z)",
    relation: "Re",
    note: "the upper edge is the target itself; the lower edge is the target times −e^{2πiμ}, which at μ = 3/4 is +i — so the two edges neither cancel nor add, and the solve divides by 1 + i",
  },

  parameters: [
    { name: "mu", domain: "real", constraints: ["mu > 0", "mu < 1", "mu not in Z"] },
    { name: "b", domain: "real", constraints: ["b > 0"] },
    { name: "c", domain: "real", constraints: ["c > b"] },
  ],

  hypotheses: [
    {
      id: "exponent-sum-integral",
      statement:
        "mu + nu ∈ ℤ with nu = 1 − mu: the bounded component {0, b} has integer exponent sum, so [0,b] is an ADMISSIBLE cut (research 06 §2.1(b))",
      check: "branch:exponentSum(component({0, b})) in Z",
      onFail: "refuse",
    },
    {
      id: "infinity-not-a-branch-point",
      statement:
        "because mu + nu ∈ ℤ the monodromy round a large circle is exp(2 pi i (mu+nu)) = 1, so f is single-valued near infinity and Res(f, inf) exists at all",
      check: "branch:monodromy(largeCircle) == 1",
      onFail: "refuse",
    },
    {
      id: "endpoints-integrable",
      statement: "mu > -1 and nu > -1: x^mu and (b-x)^nu are integrable at their endpoints",
      check: "algebraic:mu > -1 && (1-mu) > -1",
      onFail: "refuse",
    },
    {
      id: "pole-off-the-cut",
      statement: "c > b, so the simple pole z = c is strictly outside [0, b]",
      check: "algebraic:noRealRootIn(denom(R), [0, b])",
      onFail: "refuse",
    },
    {
      id: "residue-at-infinity-nonzero",
      statement:
        "f -> exp(i pi mu) != 0 at infinity, so the outer circle does NOT vanish and its value is −2 pi i Res(f, inf)",
      check: "algebraic:laurentAtInfinity(f, 0) != 0",
      onFail: "warn",
    },
    {
      id: "nondegenerate-solve",
      statement: "1 − exp(2 pi i mu) != 0, i.e. mu not an integer; at mu = 3/4 it is 1 + i",
      check: "algebraic:abs(1 - exp(2*pi*i*mu)) > cond_min",
      onFail: "refuse",
    },
  ],

  branch: {
    function: "z^mu * (b-z)^(1-mu)",
    rationalPart: "1/(c-z)",
    factors: [
      { at: "0", order: { kind: "power", alpha: "mu" }, argRange: ["0", "2"] },
      // `(b − z)`, not `(z − b)`: the same number and NOT the same power, because the window is
      // applied to whichever difference is written. At z = c > b that is `arg = −π`, not `+π`.
      {
        at: "b",
        order: { kind: "power", alpha: "1-mu" },
        argRange: ["-1", "1"],
        orientation: "b-minus-z",
      },
    ],
    cuts: [{ from: "0", to: "b" }],
    crossingPhase: { kind: "multiplicative", factor: "exp(2*pi*i*mu)" },
    admissibility:
      "the one component {0, b} is BOUNDED and Σα = mu + (1−mu) = 1 ∈ ℤ. Individually neither exponent is an integer, so BOTH points must lie on the cut — and the equality of the two routing phases IS this condition rather than a separate one to remember",
    effectiveCut:
      "the per-factor cuts are [0,∞) and [b,∞); on (b,∞) the two jumps are e^{−2πiμ} and e^{−2πiν}, whose product is e^{−2πi} = 1, so f is continuous there and the EFFECTIVE cut is exactly [0, b] (research 06 §2.2: rendering the union of sub-expression cuts is dishonest)",
  },

  contour: {
    template: "dogbone",
    limitParams: [{ name: "eta", to: "0+" }],
    pieces: [
      {
        id: "top",
        name: "the upper edge, left to right ($\\arg z = 0$, $\\arg(b-z) = 0$)",
        geom: {
          kind: "segment",
          from: pt({ param: "eta" }, 0),
          to: pt({ param: "eta", mul: -1, add: { param: "b" } }, 0),
        },
        role: "target",
        side: "above",
        colour: 0,
      },
      {
        id: "endB",
        name: "the $\\eta$-circle round $z = b$, upper lip to lower",
        geom: {
          kind: "arc",
          center: pt({ param: "b" }, 0),
          radius: { param: "eta" },
          theta0: Math.PI,
          theta1: -Math.PI,
        },
        role: "vanish",
        lemma: "L1",
        colour: 3,
      },
      {
        id: "bottom",
        name: "the lower edge, right to left ($\\arg z = 2\\pi$)",
        geom: {
          kind: "segment",
          from: pt({ param: "eta", mul: -1, add: { param: "b" } }, 0),
          to: pt({ param: "eta" }, 0),
        },
        role: "reproduces",
        side: "below",
        // Convention F: the FULL multiplier of the target, reversal included. At μ = 3/4 this is
        // `−e^{3πi/2} = +i`, so `1 + c = 1 + i` — the two edges neither cancel nor add, and the
        // solve's division by `1 − e^{2πiμ}` is where `π/sin(πμ)` comes from.
        coefficients: [{ targetId: "T", coefficient: "-exp(2*pi*i*mu)" }],
        colour: 2,
      },
      {
        id: "endA",
        name: "the $\\eta$-circle round $z = 0$, lower lip to upper",
        geom: {
          kind: "arc",
          center: pt(0, 0),
          radius: { param: "eta" },
          theta0: 2 * Math.PI,
          theta1: 0,
        },
        role: "vanish",
        lemma: "L1",
        colour: 3,
      },
    ],
    orientation: "cw",
    windings: [{ pole: "c", n: "0" }],
  },

  vanishingLemmas: [
    {
      piece: "endA",
      lemma: "L1",
      sideCondition: "|f| ~ C·eta^mu near z = 0, length 2*pi*eta, so |int| = O(eta^(1+mu))",
      discharge: "symbolic:endpointBound(alpha = mu) about z = 0 => O(eta^(7/4)) -> 0 iff mu > -1",
      rigorOfBound: "≤",
      rigorOfLimit: "=",
      rigorIfNumericOnly: "≈",
    },
    {
      piece: "endB",
      lemma: "L1",
      sideCondition: "|f| ~ C·eta^nu near z = b, length 2*pi*eta, so |int| = O(eta^(1+nu))",
      discharge: "symbolic:endpointBound(alpha = 1-mu) about z = b => O(eta^(5/4)) -> 0 iff nu > -1",
      rigorOfBound: "≤",
      rigorOfLimit: "=",
      rigorIfNumericOnly: "≈",
    },
  ],

  residueSelection: {
    rule: "notOn",
    set: "[0, b] — the one simple pole z = c, which the dogbone leaves OUTSIDE and the exterior identity weights by n − σ = 0 − (−1) = 1",
  },

  closedForm: {
    expr: "( 2*pi*i*( Res(f, c) + Res(f, inf) ) ) / (1 - exp(2*pi*i*mu))",
    simplified: "(pi/sin(pi*mu)) * ( c - (1-mu)*b - c^mu*(c-b)^(1-mu) )",
  },

  rigor: {
    policy: "min",
    inputs: ["hypotheses.*", "vanishingLemmas.*.rigor", "residues.*.rigor", "branch.*"],
  },

  traps: [
    {
      id: "forgot-the-residue-at-infinity",
      detect: "structural:residueAtInfinityMissing",
      message:
        "f -> exp(3 i pi/4) != 0 at infinity, so the outer circle does NOT vanish: its value is 2 pi i (17/4) exp(3 i pi/4), of magnitude 26.7, in an answer of magnitude 1.216. Keeping only Res(f, 5) gives T = 2 pi i Res(f,5)/(1+i) = -17.665 - still perfectly REAL, so the usual 'the answer came out complex, I made a mistake' check does not fire; it is simply wrong by a factor of 14.5 and by a sign. Unlike D6, where Res(f, inf) = 0 and the omission is harmless, here it is the larger half of the identity.",
    },
    {
      id: "exponent-sum-not-checked",
      detect: "branch:exponentSumNotInteger",
      message:
        "With mu + nu not in Z the bounded arc [0,b] is NOT an admissible cut: a loop around both branch points has non-trivial monodromy exp(2 pi i (mu+nu)), f is not single-valued off the segment, and the dogbone identity is meaningless. Operationally: the top -> bottom phase would depend on which END you route around - exp(2 pi i mu) via 0 versus exp(-2 pi i nu) via b - and 'the phase' would not exist. The admissibility check IS this well-definedness, not a separate condition to remember.",
    },
    {
      id: "rendering-the-union-of-sub-cuts",
      detect: "branch:renderedCutIsTheUnionOfSubCuts",
      message:
        "z^(3/4) alone cuts [0, inf) and (b-z)^(1/4) alone cuts [b, inf). Their union is [0, inf), but on (b, inf) the two jumps multiply to exp(-2 pi i) = 1 and the product is CONTINUOUS. Drawing [0, inf) is dishonest (research 06 s2.2, the Maple BranchCuts lesson): the discontinuity set of the composite is exactly [0, b].",
    },
    {
      id: "residue-at-c-with-the-wrong-determination",
      detect: "branch:argOf(polePoint) not in argRange(factors[1])",
      message:
        "At z = c > b approached from above, arg(b - z) = -pi (not +pi), so (b-c)^(1/4) = (c-b)^(1/4) exp(-i pi/4) and Res(f, 5) = -5^(3/4) 2^(1/4) exp(-i pi/4) = -2.81171 + 2.81171 i. Using +pi with arg z = 0 instead rotates the residue by exp(i pi/2) and the final answer stays real and plausible.",
    },
    {
      id: "branch-points-are-not-poles",
      detect: "branch:residueRequestedAtBranchPoint(0)",
      message:
        "z = 0 and z = b are branch points. No residue exists at either; the end circles are discharged by ML with O(eta^(1+mu)) and O(eta^(1+nu)), which is where the integrability hypotheses mu, nu > -1 are spent.",
    },
    {
      id: "dogbone-alone-encloses-nothing",
      detect: "structural:enclosedCountReadAsTheAnswer",
      message:
        "n(D, c) = 0. As in D6, the identity is the residue theorem for the EXTERIOR region: int_D f = 2 pi i [Res(f,c) + Res(f,inf)]. Report the winding numbers and the enclosed-pole count as separate rows and never let one imply the other.",
    },
    {
      id: "pole-lands-on-the-cut",
      detect: "algebraic:c <= b",
      message:
        "If c is moved into [0, b] the simple pole sits ON the cut: the dogbone cannot separate them, the integral diverges, and the method does not apply. Refuse - do not slide c through b and keep printing the closed form, which stays finite and real on the far side and is simply not the value of anything.",
    },
  ],

  golden: [
    {
      params: { mu: 0.75, b: 3, c: 5 },
      value: "(pi/(2*sqrt(2)))*(17 - 40^(3/4))",
      numeric: 1.2157787268935614,
      verifiedTo: 2e-15,
      method:
        "(a) tanh-sinh on [0, b] with the two endpoint powers from the transform's own cancellation-free distances; (b) x = b u^2 then 1 - u = v^4, desingularising both endpoints, then composite 60-pt Gauss-Legendre. 40^(3/4) = 15.905414575341013 = 4*250^(1/4), and Res(f,5) + Res(f,inf) = exp(-i pi/4)*(17/4 - 250^(1/4))",
    },
    {
      params: { mu: 0.25, b: 3, c: 5 },
      value: "(pi/sin(pi/4))*(5 - 2.25 - 5^(1/4)*2^(3/4))",
      numeric: 1.0446690187189636,
      // 3e-15 rather than the gallery's 1.1e-15: that number says how well the GOLDEN was verified,
      // and this one has to cover the engine's own rounding as well. Its closed form evaluates
      // `2^{3/4}·5^{1/4}` in floats, which costs a few ulps that the flagship fixture's `2^{1/4}`
      // happens not to.
      verifiedTo: 3e-15,
      method: "as above; the mirror exponent, where nu = 3/4 carries the endpoint at z = b instead",
    },
    {
      params: { mu: 0.5, b: 2, c: 7 },
      value: "pi*(7 - 1 - sqrt(35))",
      numeric: 0.26364313690190516,
      verifiedTo: 1.2e-14,
      method:
        "as above; at mu = 1/2 the crossing phase is exp(i pi) = -1 and the coefficient 1 - (-1) = 2 is REAL, which is the fixture where a lost i would not show as a complex answer",
    },
    {
      params: { mu: 0.25, b: 4, c: 10 },
      value: "(pi/sin(pi/4))*(10 - 3 - 10^(1/4)*6^(3/4))",
      numeric: 0.81164274340719644,
      verifiedTo: 8e-15,
      method: "as above, with b and c moved so that neither the pole's modulus nor the gap c − b is shared with another fixture",
    },
  ],
};
