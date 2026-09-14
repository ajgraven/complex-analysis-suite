// E2 — `strip-sech-fourier`, transcribed from `docs/contour-integration/gallery/tier-efg.md` §2.
//
// **One contour computes a whole transform, and the quasi-period can be NEGATIVE.**
// `sech(z + iπ) = −sech z` and `e^{iξ(z+iπ)} = e^{−πξ}e^{iξz}`, so `λ = −e^{−πξ}` — a negative real,
// which makes `1 − λ = 1 + e^{−πξ}` strictly positive for every real `ξ` and the Pass-5 solve
// **unconditionally well-posed**. Contrast E1, whose denominator vanishes at integer `a`: here
// `1 − λ = 0` would need `ξ = ±i(2k+1)`, which are exactly the poles of the answer `sech(πξ/2)` —
// the degeneracy locus of the METHOD and the pole set of the RESULT coincide.
//
// **Its factor is the only positive one in the tier**, and that is not a special case to remember:
// `−λ = −(−e^{−πξ}) = +e^{−πξ}` because two minus signs meet — the reversed traversal of the top
// side, and sech's own sign flip — and cancel.
//
// The second contrast with E1 is sharper still: **E2's vertical sides need no parameter condition at
// all.** `|sech z| ≤ 1/sinh R` on `Re z = ±R` regardless of `ξ`, and `|e^{iξz}| = e^{−ξy}` is
// bounded on a strip of FINITE height for every real `ξ` — the decay is supplied entirely by sech,
// not by the exponential. Since M5.3c both records' conditions come out of one exponent: E1's is
// `Re(a) + deg N − deg D`, E2's is the same expression at `Re(iξ) = 0`, which is `−1` whatever `ξ`
// is. "One condition, two jobs" and "no condition at all" are the same arithmetic, read twice.
import { pt } from "../../engine/contour/model.js";
import type { Family } from "../schema.js";

const P = Math.PI;

export const e2StripSechFourier: Family = {
  id: "strip-sech-fourier",
  title: "∫ℝ sech(x)e^(iξx) dx = π sech(πξ/2): a Fourier transform by one strip",
  taxonomySection: "6",
  tier: "E",

  targets: [
    {
      id: "I",
      kind: "integral",
      variable: "x",
      lower: "-inf",
      upper: "inf",
      integrand: "exp(i*xi*x)/cosh(x)",
      convergence: "absolute",
      symbols: {},
    },
  ],

  auxiliary: {
    integrand: "exp(i*xi*z)/cosh(z)",
    relation: "Re",
    note: "the bottom side is the target itself; the top side is the target times +e^{−πξ}, the tier's only positive factor, because the reversal's minus and sech's own cancel",
  },

  // NO CONSTRAINT on ξ, and that is the record's point — see `verticals-need-nothing`.
  parameters: [{ name: "xi", domain: "real", constraints: [] }],

  strip: { heightOverPi: "1" },

  hypotheses: [
    {
      id: "quasi-periodic",
      statement:
        "f(z + iπ) = λ f(z) with λ = −e^{−πξ}: sech(z+iπ) = −sech z and e^{iξ(z+iπ)} = e^{−πξ}e^{iξz}",
      check: "symbolic:quasiPeriod(f, P=pi) == -exp(-pi*xi)",
      onFail: "refuse",
    },
    {
      id: "verticals-need-nothing",
      statement:
        "|f| <= e^(pi*max(0,-xi))/sinh(R) on Re z = ±R for EVERY real xi — the decay comes from sech, not from the exponential factor",
      check: "symbolic:true",
      onFail: "warn",
    },
    {
      id: "no-pole-on-the-boundary",
      statement: "cosh z = 0 only at z = iπ/2 + ikπ, so no pole lies on Im z ∈ {0, π}",
      check: "algebraic:noRootOnHorizontalLines(cosh(z), [0, pi])",
      onFail: "refuse",
    },
    {
      id: "nondegenerate-solve",
      statement:
        "1 − λ = 1 + e^{−πξ} > 0 for every real ξ; it vanishes only at ξ = ±i(2k+1), which are exactly the poles of sech(πξ/2)",
      check: "algebraic:ne(1 + exp(-pi*xi), 0)",
      onFail: "refuse",
    },
  ],

  contour: {
    template: "rectangle",
    limitParams: [{ name: "R", to: "inf" }],
    pieces: [
      {
        id: "bottom",
        name: "the real axis",
        geom: { kind: "segment", from: pt({ param: "R", mul: -1 }, 0), to: pt({ param: "R" }, 0) },
        role: "target",
        colour: 0,
      },
      {
        id: "right",
        name: "the right vertical x = R",
        geom: { kind: "segment", from: pt({ param: "R" }, 0), to: pt({ param: "R" }, P) },
        role: "vanish",
        lemma: "L1",
        colour: 1,
      },
      {
        id: "top",
        name: "the line Im z = π",
        geom: { kind: "segment", from: pt({ param: "R" }, P), to: pt({ param: "R", mul: -1 }, P) },
        role: "reproduces",
        // `−λ = +e^{−πξ}`. The ONLY positive factor in the tier, and writing `−e^{−πξ}` here would
        // turn `1 + e^{−πξ}` into `1 − e^{−πξ}`, which vanishes at ξ = 0 — so the record's own
        // "unconditionally well-posed" claim would fail at the one fixture that checks it.
        coefficients: [{ targetId: "I", coefficient: "exp(-pi*xi)" }],
        colour: 2,
      },
      {
        id: "left",
        name: "the left vertical x = −R",
        geom: {
          kind: "segment",
          from: pt({ param: "R", mul: -1 }, P),
          to: pt({ param: "R", mul: -1 }, 0),
        },
        role: "vanish",
        lemma: "L1",
        colour: 3,
      },
    ],
    orientation: "ccw",
    windings: [{ pole: "i*pi/2", n: "1" }],
  },

  vanishingLemmas: [
    {
      piece: "right",
      lemma: "L1",
      sideCondition:
        "for all y in [0,pi]: |sech(R+iy)| <= 1/sinh R (from |e^z + e^(-z)| >= e^R - e^(-R)) and |e^(i xi z)| = e^(-xi y) <= e^(pi*max(0,-xi)); hence |int| <= pi*e^(pi*max(0,-xi))/sinh R",
      discharge: "symbolic:mlBound(piece=right, M=exp(pi*max(0,-xi))/sinh(R), L=pi, limit=R->inf, requires=[])",
      rigorOfBound: "≤",
      rigorOfLimit: "=",
      rigorIfNumericOnly: "≈",
    },
    {
      piece: "left",
      lemma: "L1",
      sideCondition: "identical bound by x -> -x symmetry of |sech|",
      discharge: "symbolic:mlBound(piece=left, M=exp(pi*max(0,-xi))/sinh(R), L=pi, limit=R->inf, requires=[])",
      rigorOfBound: "≤",
      rigorOfLimit: "=",
      rigorIfNumericOnly: "≈",
    },
  ],

  residueSelection: { rule: "inside", set: "0 < Im z < pi — here the single simple pole z = iπ/2" },

  closedForm: {
    expr: "(2*pi*i/(1 + exp(-pi*xi))) * Res(exp(i*xi*z)/cosh(z), i*pi/2)",
    simplified: "pi*sech(pi*xi/2)",
  },

  rigor: {
    policy: "min",
    inputs: ["hypotheses.*", "vanishingLemmas.*.rigor", "residues.*.rigor", "solve.conditioning"],
  },

  traps: [
    {
      id: "factor-sign-twice",
      detect: "structural:coefficientOf(top) == '-exp(-pi*xi)'",
      message:
        "TWO minus signs meet on the top side and cancel: the reversed traversal contributes one, and sech(z+i pi) = -sech z the other. The factor is +e^(-pi xi). Writing -e^(-pi xi) turns 1 + e^(-pi xi) into 1 - e^(-pi xi), which VANISHES at xi = 0 — so the record's 'unconditionally well-posed' claim would fail at the one fixture that tests it, and the failure would look like a degenerate solve rather than a sign error.",
    },
    {
      id: "condition-borrowed-from-E1",
      detect: "structural:parameterConstraints(xi).length > 0",
      message:
        "E1 needs 0 < a < 1 and E2 needs nothing, from the SAME ML machinery: the vertical exponent is Re(a) + deg N - deg D, and at a = i*xi the real part is 0 for every real xi. Importing E1's window here would refuse perfectly good transforms at large |xi|.",
    },
    {
      id: "degeneracy-and-the-answer-s-poles",
      detect: "algebraic:eq(1 + exp(-pi*xi), 0)",
      message:
        "1 - lambda = 0 needs e^(-pi xi) = -1, i.e. xi = ±i(2k+1) — which are exactly the poles of sech(pi xi/2). The method degenerates precisely where the result does not exist, which is the strongest possible sign that the denominator is not an artefact of the method.",
    },
  ],

  golden: [
    {
      params: { xi: 2 },
      value: "pi*sech(pi*xi/2)",
      numeric: 0.2710149513994184,
      verifiedTo: 2e-16,
      method:
        "composite Gauss-Legendre on [-40,40] with exact sech tail bound; cross-checked against the closed form pi/cosh(pi) = 0.27101495139941840",
    },
    {
      params: { xi: 0 },
      value: "pi",
      numeric: 3.1415926535897931,
      verifiedTo: 0,
      method:
        "int sech = pi exactly (the arctan(sinh) antiderivative); the fixture that tests 'unconditionally well-posed', since 1 - lambda = 2 here and a sign error would make it 0",
    },
    {
      params: { xi: 1 },
      value: "pi*sech(pi*xi/2)",
      numeric: 1.2520403312521475,
      verifiedTo: 3e-16,
      method: "same quadrature; pi/cosh(pi/2)",
    },
    {
      params: { xi: -1.5 },
      value: "pi*sech(pi*xi/2)",
      numeric: 0.59021960169103926,
      verifiedTo: 4e-16,
      method:
        "same quadrature at a NEGATIVE xi, where |e^{i xi z}| grows across the strip and the vertical bound picks up its e^{pi|xi|} constant — the evenness sech(pi xi/2) = sech(-pi xi/2) is the check",
    },
  ],
};
