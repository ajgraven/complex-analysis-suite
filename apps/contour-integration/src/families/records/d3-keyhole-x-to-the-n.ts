// D3 — `keyhole-x-to-the-n`, transcribed from `docs/contour-integration/gallery/tier-cd.md` §D3.
//
// **A two-parameter family, a free cross-check, and the *same* degeneracy from a different
// direction.** `∫₀^∞ x^{a−1}/(1+xⁿ) dx` puts `n` poles inside the contour — the `n`-th roots of `−1`,
// all at `arg = π(2k+1)/n ∈ (0,2π)` — and the residue sum telescopes as a geometric series whose
// `(1 − e^{2πia})` cancels against the solve denominator. That cancellation is the record's whole
// engine content: without it the answer is numerically right and reads as `(π/n)·(Σₖ e^{…})/sin(πa)`,
// and at integer `a` it is `0/0` rather than a decided refusal.
//
// At **integer `a`** the integrand has no branch point at all, `1 + Σcⱼ = 1 − e^{2πia} = 0`, and the
// keyhole degenerates exactly as D1's wrong `argRange` does — while the closed form `(π/n)/sin(πa/n)`
// remains perfectly finite and *correct by continuity*. **The value survives; the derivation does
// not.** That distinction is the hardest thing in the tier to say honestly, and the record says it:
// the app must refuse the keyhole route and offer the wedge, not print the formula and call it
// proved. Two of the five fixtures below are exactly that case, and they are here so the refusal is
// executed rather than described.
import { pt } from "../../engine/contour/model.js";
import type { Family } from "../schema.js";

export const d3KeyholeXToTheN: Family = {
  id: "keyhole-x-to-the-n",
  title: "∫₀^∞ x^(a−1)/(1+xⁿ) dx = (π/n)/sin(πa/n): the two-parameter keyhole",
  taxonomySection: "5.1",
  tier: "D",

  targets: [
    {
      id: "I",
      kind: "integral",
      variable: "x",
      lower: "0",
      upper: "inf",
      integrand: "x^(a-1)/(1+x^n)",
      convergence: "absolute",
      symbols: { R: { kind: "rationalFn", var: "x" } },
    },
  ],

  auxiliary: {
    integrand: "z^(a-1)/(1+z^n)",
    relation: "Re",
    note: "the residue sum over the n-th roots of −1 is a geometric series in e^{2πia/n}, and the (1 − e^{2πia}) it produces is the SAME factor the two edges contribute — so the two cancel and what is left is sin(πa/n)",
  },

  parameters: [
    { name: "a", domain: "real", constraints: ["a > 0", "a < n", "a not in Z"] },
    { name: "n", domain: "integer", constraints: ["n >= 2"] },
  ],

  hypotheses: [
    {
      id: "no-poles-on-cut",
      statement: "1 + x^n has no root on [0, inf): the roots are the n-th roots of -1",
      check: "algebraic:noRealNonnegativeRoot(1 + x^n)",
      onFail: "refuse",
    },
    {
      id: "fundamental-strip",
      statement: "0 < a < n (integrability at 0 and at infinity); the inner circle spends a > 0 and the outer a < n",
      check: "algebraic:strip(a, 0, n)",
      onFail: "refuse",
    },
    {
      id: "poles-cyclotomic",
      statement:
        "the poles are z_k = exp(i pi (2k+1)/n), k = 0..n-1, all simple, all with arg in (0, 2pi)",
      check: "algebraic:cyclotomicRecogniser(1 + z^n) && all(arg(z_k) in argRange)",
      onFail: "warn",
    },
    {
      id: "nondegenerate-solve",
      statement: "1 - exp(2 pi i a) != 0, i.e. a is NOT an integer",
      check: "algebraic:abs(1 - exp(2*pi*i*a)) > cond_min",
      onFail: "refuse",
    },
  ],

  branch: {
    function: "z^(a-1)",
    rationalPart: "1/(1+z^n)",
    factors: [{ at: "0", order: { kind: "power", alpha: "a-1" }, argRange: ["0", "2"] }],
    cuts: [{ from: "0", to: "infinity" }],
    crossingPhase: { kind: "multiplicative", factor: "exp(2*pi*i*(a-1))" },
    admissibility:
      "the one component {0, ∞} touches infinity, so research 06 §2.1(b) imposes nothing on Σα; the n poles are not branch points and place no constraint of their own",
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
        name: "the R → ∞ circle",
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
        coefficients: [{ targetId: "I", coefficient: "-exp(2*pi*i*(a-1))" }],
        colour: 2,
      },
      {
        id: "inner",
        name: "the ε → 0 circle",
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
    windings: [{ pole: "exp(i*pi*(2*k+1)/n)", n: "1" }],
  },

  vanishingLemmas: [
    {
      piece: "outer",
      lemma: "L2",
      sideCondition: "|z^(a-1)/(1+z^n)| <= M/|z|^p with p = n + 1 - a > 1 for a < n",
      discharge: "symbolic:degreeBound(a, n) => |int| <= 2*pi*R^a/(R^n - 1) -> 0 iff a < n",
      rigorOfBound: "≤",
      rigorOfLimit: "=",
      rigorIfNumericOnly: "≈",
    },
    {
      piece: "inner",
      lemma: "L1",
      sideCondition: "eps * max |z^(a-1)/(1+z^n)| -> 0; needs a > 0",
      discharge: "symbolic:ord0Bound(a) => |int| <= 2*pi*eps^a/(1 - eps^n) -> 0 iff a > 0",
      rigorOfBound: "≤",
      rigorOfLimit: "=",
      rigorIfNumericOnly: "≈",
    },
  ],

  residueSelection: { rule: "notOn", set: "[0, inf) — all n roots of 1 + z^n" },

  closedForm: {
    expr: "(2*pi*i/(1 - exp(2*pi*i*a))) * Sum_k( -exp(i*pi*a*(2k+1)/n)/n )",
    simplified: "(pi/n)/sin(pi*a/n)",
  },

  rigor: {
    policy: "min",
    inputs: ["hypotheses.*", "vanishingLemmas.*.rigor", "residues.*.rigor", "branch.*"],
  },

  traps: [
    {
      id: "integer-a-degenerate-keyhole",
      detect: "algebraic:isInteger(a)",
      message:
        "At integer a the integrand x^(a-1)/(1+x^n) has NO branch point: z^(a-1) is single-valued, the two edges are genuinely the same integral traversed both ways, the factor is c = -1 and 1 + Sum(c_j) = 1 - exp(2 pi i a) = 0 exactly. The keyhole carries no information about the target and the app must REFUSE — even though the closed form (pi/n)/sin(pi a/n) is still correct, by continuity in a. (Checked: a=1,n=3 -> 1.2091995761561; a=2,n=5 -> 0.66065319983882; a=1,n=2 -> 1.5707963267949, all matching quadrature to 1e-15.) The right repair is the 2pi/n WEDGE (taxonomy s7), which is non-degenerate for every a in (0,n) — that is gallery entry F1. A correct value obtained from a collapsed derivation is not a proof; print the wedge's derivation or print nothing.",
    },
    {
      id: "roots-of-minus-one-mislabelled",
      detect: "branch:anyRootOutside(argRange)",
      message:
        "The poles are the n-th roots of -1, at arg = pi(2k+1)/n for k = 0..n-1, which for k = n-1 is (2n-1)pi/n < 2pi — all inside the declared argRange. Using the principal determination puts roughly half of them at negative arguments and silently changes their z_k^a factors; the answer stays real and plausible.",
    },
    {
      id: "wedge-disagreement",
      detect: "engine:invariantChecked('keyhole == wedge(2*pi/n)') == false",
      message:
        "The same integral is (1 - exp(2 pi i a/n)) I = 2 pi i Res at z = exp(i pi/n) on the 2pi/n wedge. Verified equal to 2.6e-16 at a = 1.5, n = 4. Disagreement means a phase convention has drifted between the two routes; it is a free test and it should be wired as one (DESIGN s9.4).",
    },
    {
      id: "branch-point-is-not-a-pole",
      detect: "branch:residueRequestedAtBranchPoint(0)",
      message:
        "z = 0 carries the branch point of z^(a-1), not a pole. No residue exists there for non-integer a.",
    },
    {
      id: "sum-over-unrepresentable-roots",
      detect: "algebraic:individualRootRepresentable(1 + z^n) == false",
      message:
        "At n = 5 the roots of 1 + z^5 generate Q(zeta_10), degree 4 over Q, and at n = 7 degree 6 — neither fits in ONE quadratic extension, so no individual root can be written down and a per-pole residue walk cannot start. The SUM needs no root: each residue is -z_k^a/n and the n of them are a geometric progression in e^{2 pi i a/n}, which is carried term by term. An engine that only knew the per-pole route would report 'poles not pinned' for a record whose answer is exact.",
    },
  ],

  golden: [
    {
      params: { a: 1.5, n: 4 },
      value: "(pi/4)/sin(3*pi/8)",
      numeric: 0.85010884618536919,
      verifiedTo: 3e-16,
      method:
        "exp-sinh DE quadrature on (0, inf); contour bookkeeping verified at a = 1.5, n = 4 (eps = 1e-9, R = 1e9): closed total = 2*pi*i*Sum Res to 1.2e-14, edge factor c recovered to 3.7e-14. The same integral by the 2pi/n wedge agrees to 2.6e-16",
    },
    {
      params: { a: 0.5, n: 2 },
      value: "(pi/2)/sin(pi/4)",
      numeric: 2.2214414690791831,
      verifiedTo: 1e-16,
      method: "exp-sinh DE quadrature on (0, inf); the two roots ±i are Gaussian, so this fixture is reachable by the per-pole route as well as by the sum",
    },
    {
      params: { a: 2.3, n: 5 },
      value: "(pi/5)/sin(2.3*pi/5)",
      numeric: 0.63331238805904555,
      verifiedTo: 2e-16,
      method:
        "exp-sinh DE quadrature on (0, inf). NOT reachable pole by pole: the roots of 1 + z^5 generate a degree-4 field and none of them is expressible in one quadratic extension. The geometric sum needs none of them",
    },
    {
      params: { a: 3, n: 7 },
      value: "(pi/7)/sin(3*pi/7)",
      numeric: 0.46034065176003164,
      verifiedTo: 1.1e-15,
      method:
        "INTEGER a: the VALUE is right and the keyhole DERIVATION is degenerate. This entry must appear in refusals.json as well as here",
      refuses:
        "at integer a the integrand has no branch point, the two edges are the same integral traversed both ways, and 1 + Σcⱼ = 0 exactly — the value stands by continuity, the derivation does not",
    },
    {
      params: { a: 1, n: 3 },
      value: "2*pi/(3*sqrt(3))",
      numeric: 1.2091995761561452,
      verifiedTo: 2e-16,
      method: "INTEGER a: equals gallery F1 by the 2pi/n wedge; the keyhole refuses",
      refuses: "a = 1 is an integer; the repair is the 2π/n wedge (gallery F1), not this contour",
    },
  ],
};
