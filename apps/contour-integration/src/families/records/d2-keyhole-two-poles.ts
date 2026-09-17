// D2 — `keyhole-two-poles`, transcribed from `docs/contour-integration/gallery/tier-cd.md` §D2.
//
// **Several poles off one cut, and a crossing phase that is a real number.** D1 has one pole and a
// phase that stays visibly complex; D2 has two, and at `s = 3/2` the phase is `e^{2πi·(1/2)} = −1`,
// so the reproduces factor is `−(−1) = +1` and the two edges **ADD**. `1 + Σcⱼ = 2`, about as far
// from degenerate as a keyhole gets — and precisely for that reason the entry where a sign error
// hides best, because every quantity in sight is real or purely imaginary. The residues are `i/√2`
// at `z = −2` and `−i` at `z = −4`: OPPOSITE in sign, so a wrong determination at either pole does
// not produce a visibly complex answer, it produces a plausible real one. `π(1 − 1/√2) = 0.9202`
// becomes `π(1 + 1/√2) = 5.3653`, and nothing else changes.
//
// **It is also the first record whose poles are off the unit circle**, which is why it waited for
// M4.5. `(−2)^{1/2} = e^{(1/2)(ln 2 + iπ)}`: the argument is decided in the declared determination as
// it always was, and the modulus arrives as a symbolic `ln 2` in the same exponent
// (`kernel/logPart.ts`). It folds to `i√2` because the weight is a half — the "radical factors" half
// of the same slice — so the answer prints as `π − π√2/2` rather than as an exponential.
//
// ── TRANSCRIPTION NOTE ────────────────────────────────────────────────────────────────────────────
// The gallery's third fixture, `s = 1/2, p = q = 1`, is NOT carried: with `p = q` the pole at `−1` is
// DOUBLE, and `Res(z^{s−1}R, z₀)` at order > 1 needs the Taylor expansion of `z^{s−1}` about the
// pole — the same shape as `kernel/logResidue.ts`'s but for a power, and not M4.5's work. The record
// is emphatic that the simplified form must not be evaluated by cancelling there, so omitting the
// fixture is better than carrying one the engine would answer by a route the record forbids.
import { pt } from "../../engine/contour/model.js";
import type { Family } from "../schema.js";

export const d2KeyholeTwoPoles: Family = {
  id: "keyhole-two-poles",
  title: "∫₀^{∞} x^{s−1} dx/((x+p)(x+q)) by a keyhole",
  titleLatex: "$\\int_0^{\\infty}\\frac{x^{s-1}\\,dx}{(x+p)(x+q)}$ by a keyhole",
  taxonomySection: "Multivalued integrands: keyholes",
  tier: "D",

  description: {
    contour: "the keyhole about $[0,\\infty)$, $\\arg z\\in[0,2\\pi)$",
    point:
      "Two poles on the negative axis, $-p=pe^{i\\pi}$, $-q=qe^{i\\pi}$: each $(-p)^{s-1}=p^{s-1}e^{i\\pi(s-1)}$ carries both the modulus and the branch argument.",
    citations: [
      { book: "Brown–Churchill", where: "§84", text: "" },
      { book: "Ahlfors", where: "Ch. 4 §5", text: "" },
    ],
  },

  targets: [
    {
      id: "I",
      kind: "integral",
      variable: "x",
      lower: "0",
      upper: "inf",
      integrand: "x^(s-1)/((x+p)*(x+q))",
      convergence: "absolute",
      symbols: { R: { kind: "rationalFn", var: "x" } },
    },
  ],

  auxiliary: {
    integrand: "z^(s-1)/((z+p)*(z+q))",
    relation: "Re",
    note: "the upper edge is the target itself; the lower edge is the target times −e^{2πi(s−1)}, which at s = 3/2 is +1 — so the two edges add rather than fight",
  },

  parameters: [
    { name: "s", domain: "real", constraints: ["s > 0", "s < 2", "s not in Z"] },
    { name: "p", domain: "real", constraints: ["p > 0"] },
    { name: "q", domain: "real", constraints: ["q > 0", "q != p"] },
  ],

  hypotheses: [
    {
      id: "no-poles-on-cut",
      statement: "(x+p)(x+q) has no root on [0, inf), i.e. p and q are positive",
      check: "algebraic:noRealNonnegativeRoot(denom(R))",
      onFail: "refuse",
    },
    {
      id: "roots-real-distinct",
      statement: "the two poles are simple (a repeated root needs the order-m residue path)",
      check: "algebraic:isSquarefree(denom(R))",
      onFail: "warn",
    },
    {
      id: "fundamental-strip",
      statement: "0 < Re s < 2 (R = O(x^-2) at inf, O(1) at 0); here s = 3/2",
      check: "algebraic:strip(s, ord0(R), decayExponent(R))",
      onFail: "refuse",
    },
    {
      id: "nondegenerate-solve",
      statement: "1 - exp(2 pi i s) != 0, i.e. s not an integer; at s = 3/2 it equals 2",
      check: "algebraic:abs(1 - exp(2*pi*i*s)) > cond_min",
      onFail: "refuse",
    },
    {
      id: "cut-admissible",
      statement:
        "the branch point at 0 has exponent s-1 not in Z, so the cut MUST join 0 to inf (research 06 s2.1(b))",
      check: "branch:validateCutSystem(branch) == ok",
      onFail: "refuse",
    },
  ],

  branch: {
    function: "z^(s-1)",
    rationalPart: "1/((z+p)*(z+q))",
    factors: [
      {
        at: "0",
        order: { kind: "power", alpha: "s-1" },
        // `arg z ∈ [0, 2π)`, as multiples of π. Both poles sit at arg = π under it, which is the
        // whole content of this record's `residue-with-the-wrong-argument` trap.
        argRange: ["0", "2"],
      },
    ],
    cuts: [{ from: "0", to: "infinity" }],
    crossingPhase: { kind: "multiplicative", factor: "exp(2*pi*i*(s-1))" },
    admissibility:
      "the one component {0, ∞} touches infinity, so research 06 §2.1(b) imposes nothing on Σα — the cut may be any arc from 0 to ∞",
  },

  contour: {
    template: "keyhole",
    limitParams: [
      // The default radius is 4 and this record's pole sits exactly on it; see `start`.
      { name: "R_lim", to: "inf", start: 8 },
      { name: "eps", to: "0+" },
    ],
    pieces: [
      {
        id: "upper",
        name: "the upper edge, $\\arg z = 0^+$",
        geom: { kind: "segment", from: pt({ param: "eps" }, 0), to: pt({ param: "R_lim" }, 0) },
        role: "target",
        side: "above",
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
        name: "the lower edge, $\\arg z = 2\\pi^-$",
        geom: { kind: "segment", from: pt({ param: "R_lim" }, 0), to: pt({ param: "eps" }, 0) },
        role: "reproduces",
        side: "below",
        // Convention F: the FULL multiplier of the target, reversal included. At s = 3/2 this is
        // `−(−1) = +1`, and a real-valued phase looks like "no phase" — which is exactly when a
        // reader concludes the edges must cancel. They do not.
        coefficients: [{ targetId: "I", coefficient: "-exp(2*pi*i*(s-1))" }],
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
      { pole: "-p", n: "1" },
      { pole: "-q", n: "1" },
    ],
  },

  vanishingLemmas: [
    {
      piece: "outer",
      lemma: "L2",
      sideCondition: "|z^(s-1) R(z)| <= M/|z|^k with k = 3 - s > 1 for s < 2",
      discharge:
        "symbolic:degreeBound(s, R) => |int| <= 2*pi*R^(s-2)/(1 - (p+q)/R - p*q/R^2) -> 0 for s < 2",
      rigorOfBound: "≤",
      rigorOfLimit: "=",
      rigorIfNumericOnly: "≈",
    },
    {
      piece: "inner",
      lemma: "L1",
      sideCondition: "eps * max |z^(s-1) R(z)| -> 0; needs s > 0",
      discharge: "symbolic:ord0Bound(s, R) => |int| <= 2*pi*eps^s/(p*q - (p+q)*eps - eps^2) -> 0",
      rigorOfBound: "≤",
      rigorOfLimit: "=",
      rigorIfNumericOnly: "≈",
    },
  ],

  residueSelection: {
    rule: "notOn",
    set: "[0, inf) — here the two simple poles z = −p and z = −q, both at arg = π",
  },

  closedForm: {
    expr: "(2*pi*i/(1 - exp(2*pi*i*s))) * ( (p*exp(i*pi))^(s-1)/(q-p) + (q*exp(i*pi))^(s-1)/(p-q) )",
    simplified: "(pi/sin(pi*s)) * (p^(s-1) - q^(s-1))/(q - p)",
  },

  rigor: {
    policy: "min",
    inputs: ["hypotheses.*", "vanishingLemmas.*.rigor", "residues.*.rigor", "branch.*"],
  },

  traps: [
    {
      id: "residue-with-the-wrong-argument",
      detect: "branch:argOf(polePoint) not in argRange(factors[0])",
      message:
        "Both poles sit at arg = pi under the declared argRange (0, 2pi): (-2)^(1/2) = sqrt2 * exp(i pi/2) = i sqrt2, NOT -i sqrt2. The measured residues are Res(-2) = +i/sqrt2 and Res(-4) = -i, of OPPOSITE sign - so a wrong determination at one pole does not make the answer visibly complex, it silently flips a term. Here it turns pi(1 - 1/sqrt2) = 0.9202 into pi(1 + 1/sqrt2) = 5.3653.",
    },
    {
      id: "phase-mistaken-for-cancellation",
      detect: "algebraic:abs(1 - exp(2*pi*i*s)) == 0 && s not in Z",
      message:
        "At s = 3/2 the crossing phase is exp(i pi) = -1 and the factor is c = -(-1) = +1, so 1 + c = 2 and the two edges ADD. A real-valued phase looks like 'no phase', which is exactly when a reader concludes the edges must cancel. They do not: the keyhole for a square root is the case where the cancellation is maximally absent.",
    },
    {
      id: "branch-point-is-not-a-pole",
      detect: "branch:residueRequestedAtBranchPoint(0)",
      message:
        "z = 0 is a branch point of z^(1/2). The inner circle is discharged by ML (bound 2*pi*eps^(3/2)/8), never by a residue.",
    },
    {
      id: "modulus-dropped-from-the-residue",
      detect: "structural:residueIgnoresPoleModulus",
      message:
        "(-2)^(s-1) is exp((s-1)(ln 2 + i pi)), NOT exp(i pi (s-1)). Dropping ln 2 - which is what a basis carrying only the argument would do - multiplies that residue by 2^(1-s) and returns pi(1 - 1/2) = pi/2 = 1.5708 instead of pi(1 - 1/sqrt2) = 0.9202. Both are plausible, and the second is the one a reader would not question.",
    },
    {
      id: "pole-on-cut",
      detect: "hypotheses.no-poles-on-cut == false",
      message:
        "Change the quadratic to x^2 - 6x + 8 = (x-2)(x-4) and both poles land on [0, inf), on the cut and on the contour. The integral diverges and the method does not apply - the app must refuse rather than return the same formula with p = -2, q = -4 substituted, which yields a finite and entirely fictitious number.",
    },
  ],

  golden: [
    {
      params: { s: 1.5, p: 2, q: 4 },
      value: "pi*(1 - 1/sqrt(2))",
      numeric: 0.92015118451061029,
      verifiedTo: 1e-14,
      method:
        "two routes: exp-sinh double-exponential quadrature on $(0,\\infty)$, giving $0.92015118451061029$; and $x = t^2$ to remove the square root, then a split at $t = 1$ with $t \\to 1/u$ on $(1,\\infty)$ and composite 60-point Gauss–Legendre, giving $0.92015118451059041$ (relative $2.2\\times10^{-14}$). The closed-contour total is $2\\pi i(i/\\sqrt2 - i)$ to $5.1\\times10^{-15}$ at $\\varepsilon = 10^{-10}$ and $R = 10^{10}$, with the edge factor recovered as $+1$ to $2.2\\times10^{-5}$ — the edge's own truncation, not the factor's",
    },
    {
      params: { s: 1.5, p: 1, q: 3 },
      value: "(pi/2)*(sqrt(3) - 1)",
      numeric: 1.1499027195564300,
      verifiedTo: 2e-16,
      method:
        "exp-sinh double-exponential quadrature on $(0,\\infty)$, agreeing with $(\\pi/2)(\\sqrt3 - 1)$ to $2\\times10^{-16}$; this second point exists because $p = 1$ makes $\\ln p = 0$, so it would still pass with the modulus dropped from the other pole alone",
    },
  ],
};
