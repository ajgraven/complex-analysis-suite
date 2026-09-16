// D6 — `dogbone-inverse-sqrt`, transcribed from `docs/contour-integration/gallery/tier-cd.md` §D6.
//
// **A CONTOUR THAT ENCLOSES NO POLE AT ALL, AND IS NOT ZERO.** Every pole of `1/((z²+a²)√(1−z²))`
// lies off the dogbone, so `n(γ, ±ia) = 0` — and the naive reading of the residue theorem gives
// `∮ = 0`, which is wrong by `2π/(a√(1+a²))`. The hypothesis that fails is not about poles: the
// function is not holomorphic inside, because the CUT is inside. What holds is the identity for the
// EXTERIOR region, which contains ∞ (`engine/exteriorTheorem.ts`), and the app reports the enclosed
// count and the value as SEPARATE rows so that neither can be read off the other.
//
// **THE BRANCH DETERMINATION BITES, AND IT IS THE SECOND TRAP.** The branch pinned by
// `W(x + i0) = +√(1−x²)` takes `+√(1+a²)` at `+ia` and `−√(1+a²)` at `−ia`. Using `+` at both — the
// natural symmetry reflex, since the poles are a conjugate pair — makes the two residues equal and
// opposite, the sum is 0, and the answer is 0 instead of `π/(a√(1+a²))`. Nothing about the result
// looks wrong; it is just gone. `kernel/branchResidue.ts`'s `multiPowerAtPole` decides it: the two
// arguments `π − arctan a` and `arctan a` are not rational multiples of π and only their HALF-SUM is,
// which is why the question is asked once about the product rather than twice about the factors.
//
// **`Res(f,∞) = 0`, AND IT IS CERTIFIED RATHER THAN ASSUMED.** `f = O(|z|⁻³)`, and the SAME degree
// computation discharges the outer circle by L2 — research 03 §9(d)'s unification, in one number
// (`kernel/atInfinity.ts`). D7 is where the term is not zero and carries most of the answer.
//
// ── TRANSCRIPTION NOTES ───────────────────────────────────────────────────────────────────────────
//
// **The outer circle is NOT a piece**, though the gallery record lists one. Drawing `C_R` beside the
// dogbone is drawing two disjoint loops and calling them one path, and it would make every winding
// number `1` — the one fact this entry exists to deny. `∮_{C_R,ccw} = −2πi·Res(f,∞)` is the
// DEFINITION of the residue at infinity, so the circle appears as that row instead, exactly. The
// record's own ⚠ GAP G5 is this, from the other side.
//
// **The exponents are the ones the INTEGRAND has**, not the ones `√(1−z²)` has: `f` carries
// `1/√(1−z²)`, so each branch point has `α = −1/2` and the constant is `i = 1/(−i)`. The gallery
// states the same numbers for the same reason.
import { pt } from "../../engine/contour/model.js";
import type { Family } from "../schema.js";

export const d6DogboneInverseSqrt: Family = {
  id: "dogbone-inverse-sqrt",
  title: "∫_{−1}^{1} dx/((x²+a²)√(1−x²)) by a dogbone",
  titleLatex: "$\\int_{-1}^{1}\\frac{dx}{(x^2+a^2)\\sqrt{1-x^2}}$ by a dogbone",
  taxonomySection: "Multivalued integrands: dogbones and the residue at infinity",
  tier: "D",

  description: {
    contour: "the dogbone about the cut $[-1,1]$ — both edges and the circles $|z\\mp1|=\\eta$; $\\sqrt{1-z^2}$ taken positive on the upper edge",
    point:
      "The contour encloses no pole, yet $\\oint\\ne0$: the integrand is not holomorphic inside because the cut is. The exterior form of the residue theorem applies, with $\\operatorname{Res}(f,\\infty)=0$ here.",
    citations: [
      { book: "Marsden–Hoffman", where: "§4", text: "" },
      { book: "Ahlfors", where: "Ch. 4 §5.3", text: "compare the substitution $x=\\sin\\theta$, which reduces it to a unit-circle integral" },
    ],
  },
  frontRow: 6,

  targets: [
    {
      id: "T",
      kind: "integral",
      variable: "x",
      lower: "-1",
      upper: "1",
      integrand: "1/((x^2+a^2)*sqrt(1-x^2))",
      convergence: "absolute",
      symbols: { R: { kind: "rationalFn", var: "x" } },
    },
  ],

  auxiliary: {
    integrand: "1/((z^2+a^2)*sqrt(1-z^2))",
    relation: "Re",
    note: "the upper edge is the target itself; the lower edge is the target times +1, because W changes sign across the cut and the traversal is reversed — two minus signs, and the edges ADD",
  },

  parameters: [{ name: "a", domain: "real", constraints: ["a > 0"] }],

  hypotheses: [
    {
      id: "poles-off-the-cut",
      statement: "the poles ±ia are not on [−1, 1]",
      check: "algebraic:noRealRootIn(denom(R), [-1, 1])",
      onFail: "refuse",
    },
    {
      id: "a-nonzero",
      statement: "a ≠ 0: at a = 0 the poles collide with the cut at z = 0 and the integral diverges",
      check: "algebraic:a != 0",
      onFail: "refuse",
    },
    {
      id: "cut-admissible",
      statement:
        "branch points −1 and 1 with alpha = −1/2 each; the component {−1, 1} does not touch infinity and Σα = −1 ∈ ℤ, so the segment [−1, 1] is an admissible cut (research 06 §2.1(b))",
      check: "branch:validateCutSystem(branch) == ok",
      onFail: "refuse",
    },
    {
      id: "residue-at-infinity-zero",
      statement:
        "f = O(|z|^-3) at infinity, hence Res(f, inf) = 0 (research 03 §9(c)) — the SAME degree computation that would discharge an outer circle by L2",
      check: "algebraic:laurentAtInfinity(f, -1) == 0",
      onFail: "warn",
    },
    {
      id: "branch-normalised-on-the-upper-edge",
      statement:
        "the branch is pinned by W(x + i0) = +sqrt(1-x^2) for x in (−1,1), so the target piece carries +T and not a phase multiple of it",
      check: "branch:evaluateAt(W, upperEdge) == +sqrt(1-x^2)",
      onFail: "refuse",
    },
  ],

  branch: {
    function: "1/sqrt(1 - z^2)",
    rationalPart: "1/(z^2+a^2)",
    // `i`, because `W := −i·exp(½(Log_[0,2π)(z−1) + Log_[0,2π)(z+1)))` and the integrand carries
    // `1/W`. Drop it and every residue is off by a factor of `i`: the answer comes out imaginary,
    // and the only thing that looks wrong is a number that should have been real.
    constant: "i",
    factors: [
      { at: "-1", order: { kind: "power", alpha: "-1/2" }, argRange: ["0", "2"] },
      { at: "1", order: { kind: "power", alpha: "-1/2" }, argRange: ["0", "2"] },
    ],
    cuts: [{ from: "-1", to: "1" }],
    // Crossing the segment, `arg(z−1)` runs through π continuously while `arg(z+1)` jumps from 0 to
    // 2π — so only the branch point at −1 contributes, and the phase is `e^{2πi(−1/2)} = −1`.
    crossingPhase: { kind: "multiplicative", factor: "exp(2*pi*i*(-1/2))" },
    admissibility:
      "the one component {−1, 1} is BOUNDED and Σα = −1 ∈ ℤ, so research 06 §2.1(b) is satisfied — which is exactly the statement that W returns to itself around the pair, and the reason the dogbone exists",
    effectiveCut:
      "the per-factor cuts are [−1, ∞) and [1, ∞); on (1, ∞) the two jumps are e^{−πi} each and their product is e^{−2πi} = 1, so f is continuous there and the EFFECTIVE cut is exactly [−1, 1]",
  },

  contour: {
    template: "dogbone",
    limitParams: [{ name: "eta", to: "0+" }],
    pieces: [
      {
        id: "top",
        name: "the upper edge of the cut, left to right",
        geom: {
          kind: "segment",
          from: pt({ param: "eta", mul: 1, add: -1 }, 0),
          to: pt({ param: "eta", mul: -1, add: 1 }, 0),
        },
        role: "target",
        side: "above",
        colour: 0,
      },
      {
        id: "endB",
        name: "the $\\eta$-circle round $z = 1$, upper lip to lower",
        geom: {
          kind: "arc",
          center: pt(1, 0),
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
        name: "the lower edge of the cut, right to left",
        geom: {
          kind: "segment",
          from: pt({ param: "eta", mul: -1, add: 1 }, 0),
          to: pt({ param: "eta", mul: 1, add: -1 }, 0),
        },
        role: "reproduces",
        side: "below",
        // Convention F: the FULL multiplier of the target, reversal included. `−(−1) = +1`, so the
        // two edges ADD and `∮ = 2T`. A reader who expects a cut to make the edges cancel has it
        // exactly backwards — the cancellation is what would happen if there were no cut at all.
        coefficients: [{ targetId: "T", coefficient: "-exp(2*pi*i*(-1/2))" }],
        colour: 2,
      },
      {
        id: "endA",
        name: "the $\\eta$-circle round $z = -1$, lower lip to upper",
        geom: {
          kind: "arc",
          center: pt(-1, 0),
          radius: { param: "eta" },
          theta0: 2 * Math.PI,
          theta1: 0,
        },
        role: "vanish",
        lemma: "L1",
        colour: 3,
      },
    ],
    // Clockwise ABOUT THE CUT, which is convention O and the sign the exterior identity is written
    // in. The app measures it rather than reading it: σ = n(γ, branch point) = −1.
    orientation: "cw",
    windings: [
      { pole: "i*a", n: "0" },
      { pole: "-i*a", n: "0" },
    ],
  },

  vanishingLemmas: [
    {
      piece: "endB",
      lemma: "L1",
      sideCondition: "|f| ~ C·eta^(-1/2) near z = 1 and the length is 2*pi*eta, so |int| = O(eta^(1/2))",
      discharge:
        "symbolic:endpointBound(alpha = -1/2) => |int| <= 2*pi*eta^(1/2)*C -> 0 iff alpha > -1; the bound is taken about z = 1, not about the origin",
      rigorOfBound: "≤",
      rigorOfLimit: "=",
      rigorIfNumericOnly: "≈",
    },
    {
      piece: "endA",
      lemma: "L1",
      sideCondition: "the same at z = −1",
      discharge: "symbolic:endpointBound(alpha = -1/2) about z = -1",
      rigorOfBound: "≤",
      rigorOfLimit: "=",
      rigorIfNumericOnly: "≈",
    },
  ],

  residueSelection: {
    rule: "notOn",
    set: "[−1, 1] — the two simple poles ±ia, which the dogbone leaves OUTSIDE and the exterior identity therefore weights by n − σ = 0 − (−1) = 1",
  },

  closedForm: {
    expr: "( 2*pi*i*( Res(f, i*a) + Res(f, -i*a) + Res(f, inf) ) ) / (1 + 1)",
    simplified: "pi/(a*sqrt(1+a^2))",
  },

  rigor: {
    policy: "min",
    inputs: ["hypotheses.*", "vanishingLemmas.*.rigor", "residues.*.rigor", "branch.*"],
  },

  traps: [
    {
      id: "no-poles-inside-so-the-integral-is-zero",
      detect: "structural:enclosedCountReadAsTheAnswer",
      message:
        "n(D, +-ia) = 0 - the dogbone encloses no pole - and yet int_D f = 2T = 2 pi/(a sqrt(1+a^2)) != 0. The residue theorem's hypothesis is not 'no poles inside' but 'holomorphic inside except at isolated singularities', and the CUT is inside. The identity that applies is the one for the EXTERIOR region, which contains infinity. Reporting the enclosed-pole count as if it were the answer is the exact conflation the dogbone exists to break (research 02, P0 #7).",
    },
    {
      id: "wrong-sqrt-determination-at-an-outside-pole",
      detect: "branch:argOf(polePoint) not in argRange(factors[0])",
      message:
        "The branch pinned by W(x + i0) = +sqrt(1-x^2) takes W(+ia) = +sqrt(1+a^2) but W(-ia) = -sqrt(1+a^2). Using +sqrt(1+a^2) at BOTH poles - the natural symmetry reflex, since the poles are a conjugate pair - makes the two residues equal and opposite, the sum is 0, and the answer is 0 instead of pi/(a sqrt(1+a^2)). Nothing about the result looks wrong; it is just gone.",
    },
    {
      id: "forgot-the-residue-at-infinity",
      detect: "structural:residueAtInfinityMissing",
      message:
        "For the dogbone, Res(f, inf) is part of the identity, not an optimisation (research 03 s9(b)). Here it happens to be 0 because f = O(|z|^-3), but that must be CERTIFIED, not assumed - the same degree computation that would discharge an outer circle by L2 proves it, and in D7 the analogous term carries most of the answer. 'Regular at infinity' and 'zero residue at infinity' are different statements: f = 1/z is regular at infinity with Res(f, inf) = -1.",
    },
    {
      id: "branch-point-is-not-a-pole",
      detect: "branch:residueRequestedAtBranchPoint(1)",
      message:
        "z = +-1 are branch points of sqrt(1-z^2), not poles: no Laurent series, no residue. The end circles are killed by ML with |int| = O(eta^(1/2)), which is where the hypothesis alpha > -1 - the integrability of the endpoint singularity - is spent.",
    },
    {
      id: "two-rays-instead-of-the-segment",
      detect: "branch:cutReachesInfinity",
      message:
        "Both cut systems are admissible by research 06 s2.1 - the segment [-1,1] (Sum alpha = -1 in Z) and the pair of rays -1 -> inf, 1 -> inf. But only the SEGMENT makes the dogbone work: with two rays to infinity the region around [-1,1] is no longer cut-free and the dogbone crosses a cut. The app should let the drag happen and then refuse the contour, naming the crossing.",
    },
    {
      id: "pole-on-the-cut",
      detect: "algebraic:anyPoleIn(cut)",
      message:
        "A pole inside [-1,1] - e.g. replacing x^2 + a^2 by x^2 - a^2 with 0 < a < 1 - breaks the method outright (research 03 s5.3 trap iii): the pole is on the cut, the dogbone cannot avoid it, and the integral needs a principal value the dogbone does not supply.",
    },
  ],

  golden: [
    {
      params: { a: 1 },
      value: "pi/sqrt(2)",
      numeric: 2.2214414690791831,
      verifiedTo: 6e-16,
      method:
        "(a) tanh-sinh on [-1,1] with sqrt(1-x^2) from the transform's own cancellation-free endpoint distances; (b) x = sin(theta), which turns the integral into int_{-pi/2}^{pi/2} dtheta/(sin^2 theta + a^2), a smooth periodic integrand and a tier-A unit-circle problem. The two agree to <= 8e-16",
    },
    {
      params: { a: 2 },
      value: "pi/(2*sqrt(5))",
      numeric: 0.70248147310407261,
      verifiedTo: 8e-16,
      method: "as above; 1 + a^2 = 5, so the residue's modulus is 1/sqrt5 and no rational factor hides a dropped logarithm",
    },
    {
      params: { a: 0.5 },
      value: "pi/(0.5*sqrt(1.25))",
      numeric: 5.6198517848325809,
      verifiedTo: 4e-16,
      method:
        "as above; 1 + a^2 = 5/4 is the fixture where the modulus needs BOTH a numerator and a denominator prime - ln(5/4) = ln5 - 2ln2 - so a basis keyed by the rational rather than by primes would carry it as one uncancelled atom",
    },
    {
      params: { a: 3.7 },
      value: "pi/(3.7*sqrt(14.69))",
      numeric: 0.22153239909292310,
      verifiedTo: 6e-16,
      method:
        "as above; 1 + a^2 = 1469/100 = (13 * 113)/(2^2 * 5^2), the fixture that exercises the trial division rather than a prime anyone would have guessed",
    },
  ],
};
