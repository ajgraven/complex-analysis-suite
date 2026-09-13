// D5 — `log-cubed-keyhole`, transcribed from `docs/contour-integration/gallery/tier-cd.md` §D5.
//
// **`log²` does not fall out of D4's contour, and a family may need a prerequisite.** The natural
// guess is that `∫₀^∞ (log x)²R dx` is the other half of D4's identity. It is not, and the reason is
// structural rather than incidental: the `log^k` keyhole delivers the pair `(∫R log^{k−1}, ∫R log^{k−2})`
// — the two powers BELOW the one it carries — because the `log^k` terms cancel and the binomial
// remainder is linear in the rest. `k = 2` gives `(∫R log x, ∫R)`; reaching `∫R log²x` needs `k = 3`.
//
// And `k = 3` does not close alone. Its identity
//
//     8π³i·T0 + 12π²·T1 − 6πi·T2 = 2πi·Σ₃
//
// is TWO real equations in three unknowns: the real part gives `T1` outright, and the imaginary part
// gives only `−3T2 + 4π²T0`. So `T2` is determined **modulo `T0 = ∫R dx`**, which this contour
// cannot supply — and D4's `log²` keyhole on the same `R` supplies it. That is the record's
// `prerequisites`, and the app runs it rather than taking the number on trust.
//
// The failure it exists to prevent is silent. Assuming `T0 = 0` — i.e. reading `T2 = −Re(Σ₃)/3` —
// gives `−13π³/24 = −16.795` in place of `π³/8 = 3.876`, and nothing in the arithmetic complains.
//
// ── TRANSCRIPTION NOTE ────────────────────────────────────────────────────────────────────────────
// As in D4, `R` is carried as the integer parameter `p` (the power of `1 + x²`), because a `symbol`
// is documentation in this schema and nothing binds a function into an integrand. That turns out to
// answer the record's own coverage complaint. Its `sign-of-T1-from-the-1-over-i` trap says the `1/i`
// sign is INVISIBLE at `R = 1/(1+x²)`, where `Σ₃` is purely real and `T1 = 0` either way, and asks
// for "a second R with a NON-ZERO bonus term" — the gallery's choice being `1/(x²+4)`, whose poles
// are off the unit circle and need `ln 2` (M4.5). `p = 2` gives a non-zero bonus inside this basis:
// `T1 = −π/4`, which is D4's own primary answer at the same `p`, so the two records cross-check each
// other on a number neither of them takes from the other.
import { pt } from "../../engine/contour/model.js";
import type { Family } from "../schema.js";

export const d5LogCubedKeyhole: Family = {
  id: "log-cubed-keyhole",
  title: "∫₀^∞ R(x) (log x)² dx by the log³ keyhole — which does not close alone",
  taxonomySection: "5.2",
  tier: "D",

  targets: [
    {
      id: "T0",
      role: "input",
      kind: "integral",
      variable: "x",
      lower: "0",
      upper: "inf",
      integrand: "1/(1+x^2)^p",
      convergence: "absolute",
      symbols: { R: { kind: "rationalFn", var: "x" } },
    },
    {
      id: "T1",
      role: "bonus",
      kind: "integral",
      variable: "x",
      lower: "0",
      upper: "inf",
      integrand: "log(x)/(1+x^2)^p",
      convergence: "absolute",
      symbols: { R: { kind: "rationalFn", var: "x" } },
    },
    {
      id: "T2",
      role: "primary",
      kind: "integral",
      variable: "x",
      lower: "0",
      upper: "inf",
      integrand: "log(x)^2/(1+x^2)^p",
      convergence: "absolute",
      symbols: { R: { kind: "rationalFn", var: "x" } },
    },
    {
      id: "T3",
      role: "cancels",
      kind: "integral",
      variable: "x",
      lower: "0",
      upper: "inf",
      integrand: "log(x)^3/(1+x^2)^p",
      convergence: "absolute",
      symbols: { R: { kind: "rationalFn", var: "x" } },
    },
  ],

  auxiliary: {
    integrand: "log(z)^3/(1+z^2)^p",
    relation: "components",
    note: "the upper edge carries log³x; the lower edge carries (log x + 2πi)³, so the log³ terms cancel and all THREE lower powers survive the binomial",
  },

  prerequisites: [
    {
      targetId: "T0",
      from: "family:log-squared-keyhole with the same R",
      value: "pi/2",
      rigor: "=",
      alternative: "the semicircle family (taxonomy §2), or an elementary antiderivative",
    },
  ],

  parameters: [{ name: "p", domain: "integer", constraints: ["p >= 1"] }],

  hypotheses: [
    {
      id: "no-poles-on-cut",
      statement: "R has no pole on [0, inf)",
      check: "algebraic:noRealNonnegativeRoot(denom(R))",
      onFail: "refuse",
    },
    {
      id: "decay-beats-log-cubed",
      statement: "deg drop >= 2 so that R log^3 z = O(|z|^-p) with p > 1: (log R)^3/R -> 0",
      check: "algebraic:degreeDrop(R) >= 2",
      onFail: "refuse",
    },
    {
      id: "regular-at-origin",
      statement: "eps*(log(1/eps)+2pi)^3*max|R| -> 0",
      check: "algebraic:ord0(R) >= 0",
      onFail: "refuse",
    },
    {
      id: "R-real-on-the-ray",
      statement: "R has real coefficients, so T0..T3 are real and the Re/Im split of the identity is legitimate",
      check: "structural:hasRealCoefficients(R)",
      onFail: "refuse",
    },
    {
      id: "T0-available",
      statement: "int_0^inf R dx is known with a verdict (this contour cannot supply it)",
      check: "ledger:hasResolvedTarget('T0')",
      onFail: "refuse",
    },
  ],

  branch: {
    function: "log(z)^3",
    rationalPart: "1/(1+z^2)^p",
    factors: [{ at: "0", order: { kind: "log", power: 3 }, argRange: ["0", "2"] }],
    cuts: [{ from: "0", to: "infinity" }],
    crossingPhase: { kind: "additive", increment: "2*pi*i" },
    admissibility:
      "the one component {0, ∞} touches infinity, which research 06 §2.1(c) requires of a log: no bounded cut exists",
  },

  contour: {
    template: "keyhole",
    limitParams: [
      { name: "R_lim", to: "inf" },
      { name: "eps", to: "0+" },
    ],
    pieces: [
      {
        id: "upper",
        name: "the upper edge, log z = log x",
        geom: { kind: "segment", from: pt({ param: "eps" }, 0), to: pt({ param: "R_lim" }, 0) },
        role: "target",
        side: "above",
        coefficients: [{ targetId: "T3", coefficient: "1" }],
        colour: 0,
      },
      {
        id: "outer",
        name: "the R → ∞ circle",
        geom: {
          kind: "arc",
          center: pt(0, 0),
          radius: { param: "R_lim" },
          theta0: 0,
          theta1: 2 * Math.PI,
        },
        role: "vanish",
        lemma: "L2",
        colour: 1,
      },
      {
        id: "lower",
        name: "the lower edge, log z = log x + 2πi",
        geom: { kind: "segment", from: pt({ param: "R_lim" }, 0), to: pt({ param: "eps" }, 0) },
        role: "reproduces",
        side: "below",
        // `−(log x + 2πi)³` expanded, reversal included. ALL THREE lower terms survive; dropping the
        // `−8π³i` one removes T0, and because T0's coefficient is imaginary while T2's equation is
        // the imaginary part of the identity, the failure is silent.
        coefficients: [
          { targetId: "T3", coefficient: "-1" },
          { targetId: "T2", coefficient: "-3*(2*pi*i)" },
          { targetId: "T1", coefficient: "-3*(2*pi*i)^2" },
          { targetId: "T0", coefficient: "-(2*pi*i)^3" },
        ],
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
    windings: [
      { pole: "i", n: "1" },
      { pole: "-i", n: "1" },
    ],
  },

  vanishingLemmas: [
    {
      piece: "outer",
      lemma: "L2",
      sideCondition: "|R log^3 z| <= (log R + 2pi)^3/(R^2 - 1)^p on |z| = R; p = 2 - o(1) > 1",
      discharge:
        "symbolic:degreeBoundWithLog(R, 3) => |int| <= 2*pi*R*(log R + 2*pi)^3/(R^2-1)^p -> 0 iff deg denom - deg num >= 2",
      rigorOfBound: "≤",
      rigorOfLimit: "=",
      rigorIfNumericOnly: "≈",
    },
    {
      piece: "inner",
      lemma: "L1",
      sideCondition: "eps*(log(1/eps) + 2pi)^3/(1 - eps^2)^p -> 0",
      discharge: "symbolic:ord0BoundWithLog(R, 3) => the bound is O(eps·(ln eps)^3) and vanishes",
      rigorOfBound: "≤",
      rigorOfLimit: "=",
      rigorIfNumericOnly: "≈",
    },
  ],

  residueSelection: {
    rule: "notOn",
    set: "[0, inf) — here the poles of R off the ray, at z = i (arg π/2) and z = −i (arg 3π/2)",
  },

  closedForm: {
    expr: "Sigma3 := Sum(Res(R(z)*log(z)^3, z_k));  T2 = (4*pi^2*T0 - Re(Sigma3))/3;  T1 = -Im(Sigma3)/(6*pi)",
    simplified: "T2 = pi^3/8 for R = 1/(1+x^2), given T0 = pi/2",
  },

  rigor: {
    policy: "min",
    inputs: [
      "hypotheses.*",
      "vanishingLemmas.*.rigor",
      "residues.*.rigor",
      "prerequisites.*.rigorOfInput",
      "solve.rank",
    ],
  },

  traps: [
    {
      id: "expecting-log-squared-for-free-from-D4",
      detect: "structural:derivedFrom == 'log-squared-keyhole' && structural:primaryTarget == 'T2'",
      message:
        "The log^2 keyhole on R delivers (int R log x, int R) - the two powers BELOW the one it carries - and nothing about int R log^2 x, whose column in that system is identically zero. Reaching T2 needs log^3. What D4's contour does give free is int dx/(1+x^2)^p; what D5's gives free is int log x/(1+x^2)^p.",
    },
    {
      id: "solving-a-rank-deficient-system",
      detect: "structural:rankBelowUnknowns && !structural:prerequisitesSatisfied",
      message:
        "Two real equations, three unknowns: the log^3 keyhole determines T1 outright and T2 only MODULO T0. Supplying T0 = pi/2 from the log^2 keyhole on the same R (or from taxonomy s2) closes it; assuming T0 = 0, i.e. reading off T2 = -Re(Sigma3)/3, gives -13 pi^3/24 = -16.795 instead of pi^3/8 = 3.876. The ledger must show the prerequisite as its own row with its own verdict, and the final label meets with it.",
    },
    {
      id: "binomial-terms-dropped",
      detect: "algebraic:coefficientRowOf(lower, 'T0') == 0",
      message:
        "(log x + 2 pi i)^3 = log^3 + 6 pi i log^2 - 12 pi^2 log - 8 pi^3 i. All three lower terms survive after the log^3 cancellation. Dropping the -8 pi^3 i term removes T0 and, because T0's coefficient is imaginary and T2's equation is the IMAGINARY part of the identity, the failure is silent: T2 comes out as -Re(Sigma3)/3.",
    },
    {
      id: "sign-of-T1-from-the-1-over-i",
      detect: "symbolic:closedForm contains '+Im(Sigma3)/(6*pi)'",
      message:
        "Dividing the identity by 2 pi i turns 12 pi^2 T1 into 12 pi^2 T1/(2 pi i) = -6 pi i T1, because 1/i = -i. The correct relation is T1 = -Im(Sigma3)/(6 pi). This sign is INVISIBLE at p = 1, where Sigma3 = 13 pi^3/8 is purely real and T1 = 0 either way; the p = 2 fixture is here because of it, where Sigma3 = 13 pi^3/16 + 3 i pi^2/2 and T1 = -pi/4. A golden corpus with one fixture per family cannot see errors like this; every log-family entry needs a second R with a NON-ZERO bonus term.",
    },
  ],

  golden: [
    {
      params: { p: 1 },
      value: "pi^3/8",
      numeric: 3.875784585037477,
      verifiedTo: 1e-13,
      method:
        "exp-sinh DE quadrature on (0, inf) via x = e^t -> 3.8757845850373167 (rel 4.2e-14); and the classical Mellin route M''(1) for M(s) = (pi/2)csc(pi s/2). Contour bookkeeping: Sigma3 = 13 pi^3/8 is purely REAL, which is also the consistency check Im Sigma3 = 0 <=> T1 = 0",
    },
    {
      params: { p: 2 },
      value: "pi^3/16",
      numeric: 1.9378922925187385,
      verifiedTo: 1e-13,
      method:
        "exp-sinh DE quadrature on (0, inf) via x = e^t -> 1.9378922925187103 (rel 1.5e-14). This is the fixture with a NON-ZERO bonus: Sigma3 = 13 pi^3/16 + 3 i pi^2/2, so T1 = -pi/4 — which is D4's own primary answer at the same p, reached by a different contour",
    },
  ],
};
