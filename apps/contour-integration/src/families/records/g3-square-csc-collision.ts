// SERIES-CSC-KERNEL-COLLISION — `Σ_{n≥1} (−1)ⁿ/n² = −π²/12: the π csc(πz) kernel, same collision`, transcribed from
// `docs/contour-integration/gallery/tier-efg.md` §9.
//
// **THE HYPOTHESIS FAILS, AND THE ARGUMENT IS STILL RIGOROUS.** `f = 1/z²` has its pole at the one
// point where the kernel has one too, so *"f has no pole at an integer"* is false — and refusing
// would be wrong (the answer is correct) while warning would be wrong (nothing is uncertain). That
// hypothesis is SUFFICIENT for the clean form of the theorem and not NECESSARY for the contour
// argument: `pi*csc(pi*z)/z^2` is meromorphic at 0 with a pole of order **1 + 2 = 3**, orders ADD,
// and the residue theorem applies to the product. `onFail: "escalate"` is the schema's first
// three-valued hypothesis outcome, and it costs the record MORE precision rather than less — an
// escalating record must DECLARE the merged order and residue, and `families/collisionCheck.ts`
// falsifies both against the Laurent route.
//
// **The merged residue is the whole difference between this record and its companion.** `π csc(πz) = 1/z + (π²/6)z + (7π⁴/360)z³ + …`,
// so the `+(π²/6)z` term multiplied by `1/z²` is what lands on `z⁻¹`: `Res₀ = pi^2/6`. It comes from
// the kernel's TAYLOR TAIL, not from its pole — `Res(K,0)·f(0)` is meaningless here, because `f(0)`
// is infinite — and `π cot(πz)'s −π²/3` is the same computation on the other kernel, which is why the two
// entries differ by one number and nothing else.
//
// **Its ring is ℚ(i)(π), not G2's.** The kernel's Laurent expansion at an integer is EVEN, so a
// merged residue is a rational multiple of an even power of π; G2's `coth` is a quotient of
// exponentials. A collision is therefore a different RING rather than a harder case, and this
// record's cofactor has no pole but the collision — so `ρ = 0` and the whole identity lives here.
//
// **Weight 2, and the excluded term.** `Σ_{n≠0}` is `2·Σ_{n≥1}` because the summand is even, and
// `n = 0` is EXCLUDED from the target's own terms — so unlike G2 this record is not asked whether
// `f(0)` vanishes (it is infinite), only whether the cofactor is even. Forgetting the weight reports
// `−π²/6` instead of `-pi^2/12`, a factor-of-two error that looks entirely plausible, which is
// precisely why the weight is DERIVED from the target's declared range and checked.
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

export const g3SquareCscCollision: Family = {
  id: "series-csc-kernel-collision",
  title: "Σ_{n≥1} (−1)ⁿ/n² = −π²/12: the π csc(πz) kernel, same collision",
  taxonomySection: "8",
  tier: "G",

  targets: [
    {
      id: "S",
      kind: "sum",
      variable: "n",
      lower: "1",
      upper: "inf",
      summand: "(-1)^n/n^2",
      convergence: "absolute",
      symbols: {},
    },
  ],

  auxiliary: {
    integrand: "pi*csc(pi*z)/z^2",
    relation: "Re",
    note:
      "the summand is not integrated at all: the kernel's residue at every integer IS the summand, " +
      "and at n = 0 the two poles MERGE into one of order 3 whose residue is pi^2/6",
  },

  parameters: [],

  hypotheses: [
    {
      id: "kernel-residues-alternate",
      statement:
        "Res(π csc(πz), n) = (−1)ⁿ exactly, so the ALTERNATION belongs to the kernel and not to f — which is why this record's cofactor is 1/z², identical to G1's, and the two differ by one number",
      check: "symbolic:kernelResidue('csc', 'n') == (-1)^n",
      onFail: "refuse",
    },
    {
      id: "no-pole-of-f-at-an-integer",
      statement:
        "f = 1/z² has a pole at z = 0, which IS an integer — so this hypothesis fails, and the stronger argument applies: π·K(z)/z² is meromorphic at 0 with a pole of order 1 + 2 = 3, and the residue theorem applies to the product",
      check: "lattice:disjoint(poles(f), Z)",
      onFail: "escalate",
      escalateTo: "merge-collision",
    },
    {
      id: "collision-is-handleable",
      statement:
        "the merged pole has FINITE order 3, so a residue exists and the Laurent route computes it; an essential singularity would be the case no escalation could rescue",
      check: "series:finiteOrder(K*f, 0)",
      onFail: "refuse",
    },
    {
      id: "decay-exponent",
      statement: "|f| ≤ 1/(N+½)² on Γ_N, so k = 2 > 1 and the square bound is O(1/N)",
      check: "algebraic:ge(degree(denom(f)) - degree(num(f)), 2)",
      onFail: "refuse",
    },
    {
      id: "kernel-uniformly-bounded",
      statement:
        "sup_{Γ_N}|cot πz| = coth(π(N+½)) ≤ coth(π/2) for every N ≥ 0, uniformly — what makes a LIMIT argument possible rather than four separate bounds",
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
    // The one pole that is not a kernel pole is the MERGED one, and it is at an integer too.
    windings: [{ pole: "0", n: "1" }],
  },

  vanishingLemmas: CORNERS.map((_from, k) => ({
    piece: `side-${k + 1}`,
    lemma: "L2" as const,
    sideCondition:
      k % 2 === 1
        ? "on y = ±(N+½): |cot πz| ≤ coth(π|y|) ≤ coth(π/2); and |f| ≤ 1/(N+½)²"
        : "on x = ±(N+½): cos πx = 0 so |cot πz| = |tanh πy| < 1 — a DIFFERENT reason from the horizontal sides, and the stronger one",
    discharge: "symbolic:squareSideBound(2*pi*coth(pi/2)*(N+1/2)*max|f|, limit=N->inf)",
    rigorOfBound: "≤",
    rigorOfLimit: "=",
    rigorIfNumericOnly: "≈",
  })),

  collisions: [
    {
      at: "0",
      mergedOrder: 3,
      residue: "pi^2/6",
      note:
        "formula (4), not (3): the order-m derivative formula needs d²/dz²[z·πK(πz)] and is " +
        "symbolically explosive from m = 3, which is exactly this case. Read c₋₁ off the truncated " +
        "Laurent quotient instead — DESIGN §6.3's mandated route, and the entry that justifies it.",
    },
  ],

  residueSelection: {
    rule: "inside",
    set: "|Re z| < N+1/2 and |Im z| < N+1/2",
    targetTerms: [{ targetId: "S", terms: "poles(K) ∩ Z \\ {0}", weight: 2 }],
  },

  closedForm: { expr: "-Res(pi*csc(pi*z)/z^2, 0) / 2", simplified: "-pi^2/12" },

  rigor: {
    policy: "min",
    inputs: ["hypotheses.*", "vanishingLemmas.*.rigor", "collisions.*.rigor", "kernelBound.rigor"],
  },

  traps: [
    {
      id: "collision-refused",
      detect: "structural:eq(hypotheses['no-pole-of-f-at-an-integer'].onFail, 'refuse')",
      message:
        "Refusing here is wrong. The hypothesis 'f has no pole at an integer' is a SUFFICIENT condition for the clean form of the theorem, not a necessary condition for the contour argument. The product is meromorphic at 0 with a pole of order 3, and the residue theorem applies to it. What must be refused is a collision at an ESSENTIAL singularity, where no finite order exists and no residue formula applies.",
    },
    {
      id: "kernel-residue-used-at-the-collision",
      detect: "structural:eq(residues['0'].method, 'f(0)*Res(K,0)')",
      message:
        "At a collision the residue does NOT factor. Res(K,0)·f(0) is meaningless — f(0) is infinite. The merged residue pi^2/6 comes from the z⁻¹ coefficient of the PRODUCT's Laurent series: π csc(πz) = 1/z + (π²/6)z + (7π⁴/360)z³ + …, so the +(π²/6)z term multiplied by 1/z² is what lands on z⁻¹. It comes from the kernel's Taylor TAIL, not from its pole.",
    },
    {
      id: "order-3-by-derivative-formula",
      detect: "structural:startsWith(residues['0'].method, 'derivative:')",
      message:
        "Formula (3) needs two derivatives of a function with a pole — symbolically explosive and numerically unstable. Formula (4), reading c₋₁ off the truncated Laurent quotient, is exact and cheap, and this is the first entry in the gallery where the choice matters.",
    },
    {
      id: "forgot-the-collision-term",
      detect: "structural:excludes(residueSelection.collisions, '0')",
      message:
        "Dropping Res₀ leaves 0 = 2πi·Σ_{n≠0}, i.e. the sum is zero. The vanishing of the contour integral is the WHOLE content of the argument, so every enclosed residue must be present or the conclusion is nonsense rather than merely inaccurate.",
    },
    {
      id: "weight-2-forgotten",
      detect: "structural:eq(target.lower, '1') && structural:ne(residueSelection.targetTerms.weight, 2)",
      message:
        "The kernel poles at n = ±1…±N contribute Σ_{n≠0} = 2·Σ_{n≥1}, so the target enters the residue sum with weight 2. Forgetting it reports −π²/6 instead of -pi^2/12 — a factor-of-two error that looks entirely plausible, which is precisely why the weight is a value the solve DERIVES from the target's range and checks.",
    },
    {
      id: "alternation-put-into-f",
      detect: "structural:contains(auxiliary.integrand, '(-1)^z')",
      message:
        "`(−1)ⁿ` is not a function of a complex z and cannot go into the cofactor. The alternation is the KERNEL's: Res(π csc(πz), n) = (−1)ⁿ while Res(π cot(πz), n) = 1, and the cofactor is 1/z² in both records.",
    },
  ],

  golden: [
    {
      params: {},
      value: "-pi^2/12",
      numeric: -0.8224670334241132,
      verifiedTo: 1.4e-16,
      method:
        "the merged residue against a 4096-point circle trapezoid on |z| = 0.25, and the sum itself against its own accelerated series",
    },
    {
      // A VARIANT: `sided` is no parameter of this family, so the loader reads it as selecting an
      // alternative derivation. It is the two-sided sum this contour establishes directly, before
      // the halving the target's declared range asks for.
      params: { sided: "two" },
      value: "-pi^2/6",
      numeric: -1.6449340668482264,
      verifiedTo: 1.4e-16,
      method: "2× the above",
    },
  ],
};
