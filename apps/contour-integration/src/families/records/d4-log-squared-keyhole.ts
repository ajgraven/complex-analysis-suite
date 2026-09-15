// D4 — `log-squared-keyhole`, transcribed from `docs/contour-integration/gallery/tier-cd.md` §D4.
//
// **`log` is inserted as a DEVICE, and the real and imaginary parts of one identity are two
// different answers.** Nothing in `∫₀^∞ log x/(1+x²)² dx` asks for a `log²`; that is the point. Run
// the keyhole on `R(z) log z` and the `log x` terms CANCEL — the surviving equation determines
// `∫R dx` and says nothing about `∫R log x`, which is the classic "why did my log integral vanish?"
// moment and, structurally, the same rank deficiency as D1's wrong branch, one column over. Go one
// power up and the lower edge contributes `(log x + 2πi)² = log²x + 4πi log x − 4π²`: the `log²`
// terms cancel instead, and what is left is **affine in two unknowns at once**,
//
//     −4πi·T1 + 4π²·T0 = 2πi·Σ,   T1 = ∫R log x,   T0 = ∫R.
//
// Taking real and imaginary parts of THAT is the whole trick, and the sense of it inverts on the way
// through: the residue sum's REAL part gives the LOG integral. For `R = 1/(1+x²)²`, `Σ = π/2 − iπ²/2`
// and the contour returns `T1 = −π/4` and, free, `T0 = +π/4`.
//
// ── TRANSCRIPTION NOTE ────────────────────────────────────────────────────────────────────────────
// The gallery record carries `R` as a SYMBOL and varies it across fixtures (`1/(1+x²)²` and
// `1/(1+x²)`). A symbol is documentation in this schema — nothing binds a function into an integrand
// — so the one degree of freedom those two fixtures actually use is transcribed as an integer
// PARAMETER `p`, the power of `1 + x²`. Both of the record's `R`s are `p = 2` and `p = 1`, and the
// hypothesis `deg Q − deg P ≥ 2` holds for both.
//
// Its third golden — `T0 = π/4`, "the free bonus from the same contour" — is not a fixture at all.
// It is the OTHER unknown of the same solve, and `solveFamily`'s `targets` reports it; `test/d4.test.ts`
// checks it there rather than pretending it is a second run.
import { pt } from "../../engine/contour/model.js";
import type { Family } from "../schema.js";

export const d4LogSquaredKeyhole: Family = {
  id: "log-squared-keyhole",
  title: "∫₀^{∞} log x dx/(1+x²)² by a keyhole with (log z)²",
  titleLatex: "$\\int_0^{\\infty}\\frac{\\log x}{(1+x^2)^2}\\,dx$ by a keyhole with $(\\log z)^2$",
  taxonomySection: "Multivalued integrands: keyholes",
  tier: "D",

  description: {
    contour: "the keyhole about $[0,\\infty)$; integrand $(\\log z)^2/(1+z^2)^2$, $\\arg z\\in[0,2\\pi)$",
    point:
      "With $\\log z$ alone the log-integral cancels between the two edges; with $(\\log z)^2$ the $(\\log x+2\\pi i)^2$ on the lower edge leaves an identity linear in $\\int R\\log x$ and $\\int R$, whose real and imaginary parts determine both.",
    citations: [
      { book: "Stein–Shakarchi", where: "Ch. 3", text: "" },
      { book: "Ahlfors", where: "Ch. 4 §5 (the \\(R(x)\\log x\\) case, by the upper half-plane)", text: "" },
      { book: "Brown–Churchill", where: "§83", text: "" },
    ],
  },

  targets: [
    {
      id: "T0",
      role: "bonus",
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
      role: "primary",
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
      role: "cancels",
      kind: "integral",
      variable: "x",
      lower: "0",
      upper: "inf",
      integrand: "log(x)^2/(1+x^2)^p",
      convergence: "absolute",
      symbols: { R: { kind: "rationalFn", var: "x" } },
    },
  ],

  auxiliary: {
    integrand: "log(z)^2/(1+z^2)^p",
    // `components`: the extraction IS the real/imaginary split of the single complex identity, and
    // it is legitimate only because `R` has real coefficients, so T0, T1 and T2 are real. That is
    // the `R-real-on-the-ray` hypothesis below, and `buildSystem` refuses to split without it.
    relation: "components",
    note: "the upper edge carries log²x; the lower edge carries (log x + 2πi)², so the log² terms cancel and the remainder is affine in ∫R log x and ∫R",
  },

  parameters: [{ name: "p", domain: "integer", constraints: ["p >= 1"] }],

  hypotheses: [
    {
      id: "R-rational",
      statement: "R is rational",
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
      id: "decay-beats-log-squared",
      statement:
        "deg denom - deg num >= 2, so R(z) log^2 z = O(|z|^-p) with some p > 1 and the outer circle vanishes",
      check: "algebraic:degreeDrop(R) >= 2",
      onFail: "refuse",
    },
    {
      id: "regular-at-origin",
      statement: "R is bounded at 0, so eps*(log eps)^2*max|R| -> 0 on the inner circle",
      check: "algebraic:ord0(R) >= 0",
      onFail: "refuse",
    },
    {
      id: "R-real-on-the-ray",
      statement:
        "R has real coefficients, so T0, T1 and T2 are real and the Re/Im split of the identity is legitimate",
      check: "structural:hasRealCoefficients(R)",
      onFail: "refuse",
    },
    {
      id: "cut-must-reach-infinity",
      statement:
        "log has infinite-order monodromy at 0 and inf, so no BOUNDED cut exists (research 06 s2.1(c))",
      check: "branch:validateCutSystem(branch) == ok",
      onFail: "refuse",
    },
  ],

  branch: {
    function: "log(z)^2",
    rationalPart: "1/(1+z^2)^p",
    factors: [
      {
        at: "0",
        // `arg z ∈ [0, 2π)`, as multiples of π — the keyhole's determination, not the principal one.
        order: { kind: "log", power: 2 },
        argRange: ["0", "2"],
      },
    ],
    cuts: [{ from: "0", to: "infinity" }],
    // ADDITIVE, and the type is what keeps it from being confused with D1's multiplicative phase:
    // a log's monodromy has infinite order, so `log z ↦ log z + 2πi` can never be written as a
    // multiplier. `buildSystem` DERIVES the coefficient row from this increment and checks it
    // against what the pieces declare, which is what makes the three sign traps below structural.
    crossingPhase: { kind: "additive", increment: "2*pi*i" },
    admissibility:
      "the one component {0, ∞} touches infinity, which research 06 §2.1(c) requires of a log: no bounded cut exists, so the cut must run to ∞ and Σα is unconstrained",
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
        name: "the upper edge, $\\log z = \\log x$",
        geom: { kind: "segment", from: pt({ param: "eps" }, 0), to: pt({ param: "R_lim" }, 0) },
        role: "target",
        side: "above",
        coefficients: [{ targetId: "T2", coefficient: "1" }],
        colour: 0,
      },
      {
        id: "outer",
        name: "the $R \\to \\infty$ circle",
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
        name: "the lower edge, $\\log z = \\log x + 2\\pi i$",
        geom: { kind: "segment", from: pt({ param: "R_lim" }, 0), to: pt({ param: "eps" }, 0) },
        role: "reproduces",
        side: "below",
        // `−(log x + 2πi)²` expanded, with the reversal's minus sign included (convention F). The
        // `4π²` is the single most common casualty of this derivation, and dropping it leaves T1's
        // answer UNCHANGED — the error is invisible in the primary answer and destroys the bonus.
        coefficients: [
          { targetId: "T2", coefficient: "-1" },
          { targetId: "T1", coefficient: "-2*(2*pi*i)" },
          { targetId: "T0", coefficient: "-(2*pi*i)^2" },
        ],
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
    windings: [
      { pole: "i", n: "1" },
      { pole: "-i", n: "1" },
    ],
  },

  vanishingLemmas: [
    {
      piece: "outer",
      lemma: "L2",
      sideCondition:
        "|R(z) log^2 z| <= (log R + 2pi)^2/(R^2-1)^(2p) on |z| = R; the log is absorbed because it is weaker than every power",
      discharge:
        "symbolic:degreeBoundWithLog(R, 2) => |int| <= 2*pi*R*(log R + 2*pi)^2/(R^2-1)^(2p) -> 0 iff deg denom - deg num >= 2",
      rigorOfBound: "≤",
      rigorOfLimit: "=",
      rigorIfNumericOnly: "≈",
    },
    {
      piece: "inner",
      lemma: "L1",
      sideCondition: "eps * (log(1/eps) + 2pi)^2 * max|R| -> 0",
      discharge:
        "symbolic:ord0BoundWithLog(R, 2) => |int| <= 2*pi*eps*(log(1/eps)+2*pi)^2/(1-eps^2)^(2p) -> 0 iff R is bounded at 0",
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
    expr: "Sigma := Sum(Res(R(z)*log(z)^2, z_k));  T1 = -Re(Sigma)/2;  T0 = -Im(Sigma)/(2*pi)",
    simplified: "T1 = -pi/4 and T0 = pi/4 for R = 1/(1+x^2)^2",
    simplifiedWhen: "p == 2",
  },

  rigor: {
    policy: "min",
    inputs: ["hypotheses.*", "vanishingLemmas.*.rigor", "residues.*.rigor", "solve.rank"],
  },

  traps: [
    {
      id: "plain-log-loses-the-log-integral",
      detect: "branch:logPower(factors[0]) == 1 && structural:primaryTarget == 'T1'",
      message:
        "With a single log the lower edge gives -(T1 + 2 pi i T0): the T1 terms CANCEL and the surviving equation is -2 pi i T0 = 2 pi i Sum Res(R log z), which determines int R dx and says NOTHING about int R log x. The coefficient of T1 is exactly 0 — the same rank deficiency as D1's wrong argRange, one column over. The app must report 'this contour carries no information about int R log x' rather than solving for it and printing 0. Use log^2.",
    },
    {
      id: "real-and-imaginary-parts-swapped",
      detect: "structural:realPartRowDetermines('T1')",
      message:
        "Of the identity -4 pi i T1 + 4 pi^2 T0 = 2 pi i Sigma: the IMAGINARY part gives T1 = int R log x, the REAL part gives T0 = int R. In terms of the residue sum the sense inverts — T1 = -Re(Sigma)/2 and T0 = -Im(Sigma)/(2 pi) — because dividing by 2 pi i rotates. Verified for R = 1/(1+z^2)^2: Sigma = pi/2 - i pi^2/2, so T1 = -pi/4 and T0 = +pi/4. Swapping them gives T1 = +pi/4, right magnitude, wrong sign, and no internal check catches it.",
    },
    {
      id: "four-pi-squared-dropped",
      detect: "algebraic:coefficientRowOf(lower, 'T0') == 0",
      message:
        "(log x + 2 pi i)^2 = log^2 x + 4 pi i log x - 4 pi^2. Dropping the constant -4 pi^2 term is the single most common slip in this derivation: it removes T0 from the system entirely, and since T0 is real and T1's equation is the imaginary part, the answer for T1 comes out UNCHANGED — the error is invisible in the primary answer and destroys the bonus one.",
    },
    {
      id: "log-phase-is-additive",
      detect: "branch:crossingPhaseKind(branch) == 'multiplicative'",
      message:
        "log is not a power: crossing the cut ADDS 2 pi i, it does not multiply by a phase. A log-type branch point has infinite-order monodromy (research 06 s2.1), which is also why a log cut can never be bounded and must run to infinity. Writing crossingPhase as exp(2 pi i * something) here is a type error, and the admissibility validator must reject a bounded log cut rather than draw it.",
    },
    {
      id: "wrong-sign-of-the-shift",
      detect: "branch:crossingIncrement(branch) == '-2*pi*i'",
      message:
        "Under arg in (0, 2pi) the lower edge is log(x - i0) = log x + 2 pi i, not log x - 2 pi i (research 06 s6.1 error 4). The sign flip negates T1 and leaves T0 alone: -pi/4 becomes +pi/4.",
    },
    {
      id: "double-pole-derivative-formula",
      detect: "structural:residues.any(r => r.order >= 2 && r.method == 'simple')",
      message:
        "z = +-i are DOUBLE poles of 1/(1+z^2)^2, so Res = d/dz[(z-i)^2 f] at z = i, not lim (z-i) f. The measured residues are Res(i) = -pi/4 + i pi^2/16 and Res(-i) = 3 pi/4 - 9 i pi^2/16; using the simple-pole shortcut returns 0/0 and, with a numeric limit, a large plausible number.",
    },
  ],

  golden: [
    {
      params: { p: 2 },
      value: "-pi/4",
      numeric: -0.78539816339744828,
      verifiedTo: 7e-16,
      method:
        "(a) exp-sinh DE quadrature on (0, inf) -> -0.78539816339744806 (rel 2.8e-16); (b) the fold x -> 1/x onto (0,1), giving int_0^1 log u (1-u^2)/(1+u^2)^2 du, tanh-sinh -> -0.78539816339744772 (rel 7.1e-16). Contour bookkeeping verified independently: the keyhole total = 2 pi i Sigma to 1.0e-14 at eps = 1e-9, R = 1e9, and upper + lower reproduced 4 pi^2 T0 - 4 pi i T1 to 8.5e-9",
    },
    {
      params: { p: 1 },
      value: "0",
      numeric: 0.0,
      verifiedTo: 1.2e-16,
      method:
        "int_0^inf log x/(1+x^2) dx = 0 by the fold x -> 1/x, which maps the integrand to its own negative; Sigma = -i pi^2 so Re(Sigma) = 0 exactly and the bonus is T0 = pi/2",
    },
  ],
};
