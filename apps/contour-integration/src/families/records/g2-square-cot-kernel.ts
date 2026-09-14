// G2 — `series-cot-kernel`, transcribed from `docs/contour-integration/gallery/tier-efg.md` §7.
//
// **THE FIRST RECORD IN THE GALLERY WHOSE UNKNOWN IS NOT ON THE CONTOUR.** All four sides vanish, so
// the left-hand side of the identity is identically zero and `∮ → 0` is the RESULT rather than the
// bookkeeping; what the argument establishes sits among the residues, as the kernel's own poles at
// the integers. `families/solveResidueTerm.ts` is the route that reads the identity that way, and
// `engine/summationTheorem.ts` is the identity itself.
//
// **Taken before G1 because it is the non-colliding member.** `f = 1/(z²+a²)` has its poles at `±ia`,
// which for real `a ≠ 0` are never integers — the only purely imaginary integer is 0 — so the
// theorem's hypothesis holds without argument and every residue in sight is simple. G1's `1/z²`
// violates that hypothesis at the one point where the kernel also has a pole, and the merged residue
// lands in ℚ(i)(π): a different ring, and therefore a different solve rather than a harder case of
// this one.
//
// **`cot` and `1/z` are both odd, so the two residues ADD.** `Res[K f, ±ia] = π cot(±iπa)/(±2ia) =
// −(π/2a)coth(πa)` — the same value at both poles, the two sign flips cancelling — and the reflex
// that a conjugate pair cancels would return 0 for a sum that is 4.26. The engine never uses that
// symmetry: it evaluates `cot(πz₀)` at each pole as an exact Möbius function of `e^{2πiz₀}` and adds
// the two quotients, so the fact is arithmetic rather than a step a reader must trust.
//
// **The bookkeeping is where sign errors breed, and two of the traps below are about the one term.**
// The identity produces `Σ_{n∈ℤ}`, which INCLUDES `n = 0` contributing `f(0) = 1/a²`; the one-sided
// sum is `½[(π/a)coth(πa) − 1/a²]`, and the tempting `(π/2a)coth(πa)` is wrong by `1/(2a²)` — at
// `a = 3/4`, 2.132 in place of 1.243. The engine makes that structural rather than detected:
// `residueSelection.targetTerms[].weight` is DERIVED from the target's own declared range and
// checked against the record, and halving additionally requires the cofactor to be even with a
// vanishing `n = 0` term. This record declares the two-sided sum, so its weight is 1 and the
// one-sided fixture below is a variant the engine does not solve — it is the `oneSided` closed form's
// own arithmetic, and the trap is what the corpus carries about it.
import { pt } from "../../engine/contour/model.js";
import type { Family } from "../schema.js";

/** `N + ½` and `−(N + ½)` — the half-integer half-width, affine in the one live parameter. */
const hi = { param: "N", mul: 1, add: 0.5 } as const;
const lo = { param: "N", mul: -1, add: -0.5 } as const;

const CORNERS = [
  [hi, lo],
  [hi, hi],
  [lo, hi],
  [lo, lo],
] as const;

const SIDE_NAMES = [
  "the right side x = N+½",
  "the top side y = N+½",
  "the left side x = −(N+½)",
  "the bottom side y = −(N+½)",
];

export const g2SquareCotKernel: Family = {
  id: "series-cot-kernel",
  title: "Σ_{n∈ℤ} 1/(n²+a²) = (π/a)coth(πa): the π cot(πz) kernel on half-integer squares",
  taxonomySection: "8",
  tier: "G",

  targets: [
    {
      id: "S",
      // The target is a SUM, not an integral — `variable: "n"` and a `summand` rather than an
      // `integrand`. The schema has carried the shape since D1's arc; G2 is its first user.
      kind: "sum",
      variable: "n",
      lower: "-inf",
      upper: "inf",
      summand: "1/(n^2 + a^2)",
      convergence: "absolute",
      symbols: {},
    },
  ],

  auxiliary: {
    integrand: "pi*cot(pi*z)/(z^2 + a^2)",
    // Not a complexification: the target is not the real part of anything. The kernel's residue at
    // each integer IS the summand, so the relation is the identity and the sum route never asks for
    // one — the field is filled because the integrand differs from the target's, which is what
    // `auxiliary` means.
    relation: "Re",
    note:
      "the summand is not integrated at all: `π cot(πz)` has residue exactly 1 at every integer, so " +
      "Res(K·f, n) = f(n) and the series appears inside the residue sum rather than on the contour",
  },

  parameters: [{ name: "a", domain: "real", constraints: ["a > 0"] }],

  hypotheses: [
    {
      id: "no-pole-of-f-at-an-integer",
      statement:
        "f = 1/(z²+a²) has poles only at ±ia; for real a ≠ 0 neither is an integer, since the only purely imaginary integer is 0",
      check: "lattice:disjoint(poles(f), Z)",
      // The gallery proposes `escalate` here, for G1's sake: there the hypothesis FAILS while a
      // stronger argument (merge the colliding poles) applies. That outcome is SG-6 and belongs to
      // the record that needs it. For G2 the hypothesis holds, and `refuse` is the honest reading of
      // what this record's own argument does if it ever did not: a collision is G1's theorem, not a
      // recoverable case of this one.
      onFail: "refuse",
    },
    {
      id: "decay-exponent",
      statement:
        "|f| ≤ M/|z|^k with k = 2 > 1; concretely |f| ≤ 1/((N+½)² − a²) on Γ_N once (N+½)² > a²",
      check: "algebraic:ge(degree(denom(f)) - degree(num(f)), 2)",
      onFail: "refuse",
    },
    {
      id: "contour-avoids-kernel-poles",
      statement:
        "Γ_N has half-width N+½, so its sides miss every pole of π cot(πz) — the integers — and every pole of f",
      check: "geom:minDistance(contour, poles(K) ∪ poles(f)) > 0",
      onFail: "refuse",
    },
    {
      id: "kernel-uniformly-bounded",
      statement:
        "sup_{Γ_N}|cot πz| = coth(π(N+½)) ≤ coth(π/2) for every N ≥ 0, uniformly — which is what makes a LIMIT argument possible rather than four separate bounds",
      check: "symbolic:kernelBound('cot', 'halfIntegerSquare') == coth(pi/2)",
      onFail: "refuse",
    },
  ],

  contour: {
    template: "square",
    limitParams: [{ name: "N", to: "inf", through: "halfIntegers", start: 4 }],
    pieces: CORNERS.map((from, k) => ({
      id: `side-${k + 1}`,
      name: SIDE_NAMES[k] ?? `side ${k + 1}`,
      geom: {
        kind: "segment" as const,
        from: pt(from[0], from[1]),
        to: pt(CORNERS[(k + 1) % 4][0], CORNERS[(k + 1) % 4][1]),
      },
      role: "vanish" as const,
      lemma: "L2" as const,
      colour: (k % 6) as 0 | 1 | 2 | 3 | 4 | 5,
    })),
    orientation: "ccw",
    // Per-pole, and the kernel's are a lattice rather than a list — so what is stated here is the
    // two the COFACTOR has, which are the ones carrying the answer. The integers' windings are read
    // off the geometry by `analyse`'s own band, because a record cannot enumerate infinitely many.
    windings: [
      { pole: "i*a", n: "1" },
      { pole: "-i*a", n: "1" },
    ],
  },

  vanishingLemmas: CORNERS.map((_from, k) => ({
    piece: `side-${k + 1}`,
    lemma: "L2" as const,
    sideCondition:
      k % 2 === 1
        ? "on y = ±(N+½): |cot πz|² = (cos²πx + sinh²πy)/(sin²πx + sinh²πy) ≤ coth²(πy) ≤ coth²(π/2); and |f| ≤ 1/((N+½)² − a²)"
        : "on x = ±(N+½): cos πx = 0 so |cot πz| = |tanh πy| < 1 — a DIFFERENT reason from the horizontal sides, and the stronger one; and |f| ≤ 1/((N+½)² − a²)",
    discharge: "symbolic:squareSideBound(2*pi*coth(pi/2)*(N+1/2)*max|f|, limit=N->inf)",
    rigorOfBound: "≤",
    rigorOfLimit: "=",
    rigorIfNumericOnly: "≈",
  })),

  residueSelection: {
    rule: "inside",
    set: "|Re z| < N+1/2 and |Im z| < N+1/2",
    // SG-1: the unknown is a TERM of the residue sum. `weight: 1` because `Σ_{n∈ℤ}` IS the sum over
    // every kernel pole — and it is checked against the target's declared range rather than trusted.
    targetTerms: [{ targetId: "S", terms: "poles(K) ∩ Z", weight: 1 }],
  },

  closedForm: {
    expr: "-(Res(pi*cot(pi*z)/(z^2+a^2), i*a) + Res(pi*cot(pi*z)/(z^2+a^2), -i*a))",
    simplified: "(pi/a)*coth(pi*a)",
  },

  rigor: {
    policy: "min",
    inputs: ["hypotheses.*", "vanishingLemmas.*.rigor", "residues.*.rigor", "kernelBound.rigor"],
  },

  traps: [
    {
      id: "square-at-arbitrary-radius",
      detect: "lattice:notHalfInteger(contour.halfWidth)",
      message:
        "The half-width must be N+½. At an INTEGER half-width the vertical sides pass through the kernel's poles at z = ±N and |cot πz| is unbounded there (sampled max 8.2e15 at half-width 1) — the residue theorem does not apply to a contour through a pole at all. At any other half-width the sup is finite for that one contour but is NOT uniformly bounded as the half-width approaches an integer, so there is no limit argument. The half-integers are the unique pole-free, uniformly-bounded family: sup|cot πz| = coth(π(N+½)) ≤ coth(π/2) = 1.0903314107273683.",
    },
    {
      id: "forgot-the-n-equals-zero-term",
      detect: "structural:excludesZero(residueSelection.targetTerms) && structural:eq(target.lower, '-inf')",
      message:
        "Σ_{n∈ℤ} includes n = 0, contributing f(0) = 1/a². Dropping it is invisible in the closed form but wrong by 1/a²: at a = 0.75 the true Σ_ℤ is 4.2647306427126592 and the n ≠ 0 sum is 2.4869528649348815.",
    },
    {
      id: "double-counted-by-naive-halving",
      detect: "structural:eq(target.lower, '1') && structural:eq(closedForm.simplified, '(pi/(2*a))*coth(pi*a)')",
      message:
        "Σ_{n≥1} = ½(Σ_ℤ − f(0)), NOT ½Σ_ℤ. The naive halving double-counts the n = 0 term into the one-sided sum: at a = 0.75 it gives 2.1323653213563296 instead of 1.2434764324674408. This is research/03 §8's trap (iii) and the commonest bookkeeping error in the tier — which is why the engine DERIVES the weight from the target's range and additionally requires an even cofactor with a vanishing n = 0 term before it will halve anything.",
    },
    {
      id: "residues-cancel-by-symmetry",
      detect: "numeric:agree(sum(residues), 0)",
      message:
        "The two residues at ±ia are EQUAL, not opposite: cot and 1/z are both odd, so the two sign flips cancel and Res[Kf, ia] = Res[Kf, −ia] = −(π/2a)coth(πa). Assuming a conjugate pair cancels returns 0 for a sum that is 4.2647306427126592 at a = 0.75.",
    },
    {
      id: "decay-exponent-one",
      detect: "algebraic:eq(decayExponent(f), 1)",
      message:
        "k > 1 is necessary. At k = 1 the square bound is O(1) — a constant, not o(1) — so vanishing is NOT established, whatever the integral actually does. Even where the limit exists, what the identity delivers is lim_N Σ_{|n|≤N} f(n): a SYMMETRIC, principal-value sum. For f = 1/z that symmetric sum is 0 while Σ_{n≥1}1/n diverges.",
    },
    {
      id: "pole-of-f-near-an-integer",
      detect: "numeric:minDistance(poles(f), Z) < 1e-3",
      message:
        "Legal but ill-conditioned: the residue Res[Kf, z_j] contains cot(πz_j), which blows up as z_j approaches an integer. Exact arithmetic is fine; float residues are not. Report the conditioning rather than the digits.",
    },
  ],

  golden: [
    {
      params: { a: 0.75 },
      value: "(pi/a)*coth(pi*a)",
      numeric: 4.2647306427126592,
      verifiedTo: 5.8e-15,
      method:
        "direct summation to n = 200000 plus a 4-term Euler–Maclaurin tail; and independently, the engine's own contour quadrature over the four sides of Γ_N",
    },
    {
      params: { a: 1 },
      value: "pi*coth(pi)",
      numeric: 3.1533480949371619,
      verifiedTo: 8.5e-15,
      method: "same",
    },
    {
      params: { a: 2.3 },
      value: "(pi/a)*coth(pi*a)",
      numeric: 1.3659112958955153,
      verifiedTo: 2.0e-15,
      method: "same",
    },
    {
      params: { a: 0.2 },
      value: "(pi/a)*coth(pi*a)",
      numeric: 28.20641417901556,
      verifiedTo: 1.7e-14,
      method: "same — small a pushes ±ia close to the integer 0 and is the conditioning stress case",
    },
    {
      // A VARIANT: `sided` is no parameter of this family, so the loader reads it as selecting an
      // alternative derivation rather than a binding. It is the one-sided corollary
      // `½[(π/a)coth(πa) − 1/a²]`, which this contour does not establish on its own — the target it
      // declares is the two-sided sum — and the record carries it because the halving is the tier's
      // commonest error and the number is what a reader needs to check against.
      params: { a: 0.75, sided: "one" },
      value: "((pi/a)*coth(pi*a) - 1/a^2)/2",
      numeric: 1.2434764324674408,
      verifiedTo: 0,
      method: "direct one-sided summation plus the same Euler–Maclaurin tail; exact float agreement",
    },
  ],
};
