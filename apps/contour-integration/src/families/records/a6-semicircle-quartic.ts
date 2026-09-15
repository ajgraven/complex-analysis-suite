// A6 — `semicircle-quartic`, transcribed from `docs/contour-integration/gallery/tier-ab.md` §1.
//
// The first IRRATIONAL ALGEBRAIC POLES, and the entry that makes the half-plane selection problem
// concrete. The residue is one element of `ℚ(i)[z]/⟨Q⟩`: since `z⁴ ≡ −1`, `(4z³)⁻¹ ≡ −z/4`, so
// `Res ≡ −z/4` at all four roots simultaneously, computed without factoring `Q` at all. What cannot
// be done that way is the restriction to `Im z > 0` — and that restriction is the entire content of
// the formula, because summing ALL four residues returns a clean, plausible, completely wrong `0`.
import { pt } from "../../engine/contour/model.js";
import type { Family } from "../schema.js";

export const a6SemicircleQuartic: Family = {
  id: "semicircle-quartic",
  title: "∫_{−∞}^{∞} dx/(1+x⁴) by a semicircle",
  titleLatex: "$\\int_{-\\infty}^{\\infty}\\frac{dx}{1+x^4}$ by a semicircle",
  taxonomySection: "Rational functions on ℝ",
  tier: "A",

  description: {
    contour: "$[-R,R]$ closed by $\\Gamma_R$ in the upper half-plane",
    point:
      "Only the two poles $e^{i\\pi/4},e^{3i\\pi/4}$ in the upper half-plane are summed; the sum over all four residues is $0$.",
    citations: [
      { book: "Brown–Churchill", where: "§79", text: "" },
      { book: "Marsden–Hoffman", where: "§4", text: "" },
      { book: "Stein–Shakarchi", where: "Ch. 3 §2", text: "" },
    ],
  },
  frontRow: 2,

  targets: [
    {
      id: "I",
      kind: "integral",
      variable: "x",
      lower: "-inf",
      upper: "inf",
      integrand: "1/(1 + x^4)",
      convergence: "absolute",
      symbols: {
        P: { kind: "polynomial", var: "x" }, // P = 1
        Q: { kind: "polynomial", var: "x" }, // Q = x⁴ + 1 = Φ₈(x)
      },
      // substitution: NONE.
    },
  ],

  parameters: [], // EMPTY DELIBERATELY — a fixed instance; see A5 on symbols vs parameters.

  hypotheses: [
    {
      id: "coprime",
      statement: "gcd(P,Q) = 1 over ℚ(i)",
      check: "algebraic:gcd(P, Q) == 1",
      onFail: "refuse",
    },
    {
      id: "no-real-poles",
      statement: "Q = x⁴+1 ≥ 1 has no real zero",
      check: "algebraic:noRealRoot(Q)",
      onFail: "refuse",
    },
    {
      id: "target-absolutely-convergent",
      statement:
        "∫_ℝ|P/Q| converges (the TARGET's convergence; the arc's is derived, not asserted)",
      check: "algebraic:decayExponent(P, Q) >= 2",
      onFail: "refuse",
    },
    {
      id: "squarefree",
      statement: "Q is squarefree, so every pole is simple and P/Q′ is the right formula",
      check: "algebraic:gcd(Q, derivative(Q)) == 1",
      onFail: "refuse",
    },
    {
      id: "half-plane-count-exact",
      // COUNTING is exact and cheap; SELECTING is the hard part (PLAN §3.3). Separate rows for the
      // same reason winding number and enclosed-pole count are separate (research 02 P0 #7).
      statement:
        "#{roots with Im z > 0} = 2, by the Möbius map w = (z−i)/(z+i) followed by Schur–Cohn, cross-checked by Routh–Hurwitz",
      check: "algebraic:upperHalfPlaneRootCount(Q) == 2",
      onFail: "refuse",
    },
    {
      id: "half-plane-selection-exact",
      // Ladder attempt log (PLAN §3.3, in order):
      //   rung 1 half-plane-homogeneous factor split .... FAILS (traps.factor-split-assumed-homogeneous)
      //   rung 2 degree ≤ 4 radical split ................ SUCCEEDS  ← A6 LANDS HERE
      //   rung 3 cyclotomic recogniser (Q = Φ₈) .......... would also fire; not reached
      //   rung 4 certified interval enclosure ............ not reached
      //   rung 5 RootSum with visible half-plane predicate not reached
      statement:
        "the restricted sum Σ_{Im z>0} Res is obtained EXACTLY; the engine refuses rather than guesses at every rung",
      check: "algebraic:halfPlaneLadderRung(Q, 'upper') <= 3",
      onFail: "refuse",
    },
  ],

  // branch: DELIBERATELY OMITTED. 1/(1+z⁴) is rational and single-valued. The √2 in the ANSWER is a
  // radical in the value, not a branch of the integrand — worth stating, because "there's a square
  // root in the answer" is a common reason to reach for a cut that isn't there.

  contour: {
    template: "semicircle",
    limitParams: [{ name: "R", to: "inf" }],
    pieces: [
      {
        id: "realAxis",
        name: "the real segment [−R, R]",
        geom: {
          kind: "segment",
          from: pt({ param: "R", mul: -1 }, 0),
          to: pt({ param: "R" }, 0),
        },
        role: "target",
        colour: 0,
      },
      {
        id: "arc",
        name: "the $R \\to \\infty$ semicircle",
        geom: {
          kind: "arc",
          center: pt(0, 0),
          radius: { param: "R" },
          theta0: 0,
          theta1: Math.PI,
        },
        role: "vanish",
        lemma: "L2",
        colour: 1,
      },
    ],
    orientation: "ccw",
    windings: [
      { pole: "exp(i*pi/4)", n: "1" },
      { pole: "exp(3*i*pi/4)", n: "1" },
      { pole: "exp(5*i*pi/4)", n: "0" },
      { pole: "exp(-i*pi/4)", n: "0" },
    ],
  },

  vanishingLemmas: [
    {
      piece: "arc",
      lemma: "L2",
      sideCondition: "∃ p > 1, M, R₀ : |1/(1+z⁴)| ≤ M/|z|^p on C_R for R ≥ R₀",
      // num(R) = 1, den(R) = R⁴ − 1 > 0 ⟺ R > 1 (Cauchy's sufficient form gives R > 2).
      // At R = 50: den = 6249999, M = 1.600000e-7, |∫_arc| ≤ π·50·M = 2.513275e-5.
      // Derived, not asserted: deg Q − deg P = 4 ⇒ arc bound O(R⁻³) → 0.
      discharge: "symbolic:mlRational(P, Q, arc='upper', R)",
      rigorOfBound: "≤",
      rigorOfLimit: "=",
      rigorIfNumericOnly: "≈",
    },
  ],

  residueSelection: { rule: "upperHalfPlane" },

  // The record flagged as gap G3 that nothing recorded WHICH LADDER RUNG made the selection exact —
  // the only thing separating "=" from "≤"/RootSum — and smuggled it into a hypothesis. v2 gives it
  // a field, so it is no longer inferable only from prose.
  halfPlaneLadder: "radicalsDeg4",

  closedForm: {
    expr: "2*pi*i*Sum(Res(1/(1+z^4), z_k), im(z_k) > 0)",
    simplified: "pi/sqrt(2)",
  },

  rigor: {
    policy: "min",
    inputs: [
      "hypotheses.*",
      "vanishingLemmas.*.rigor",
      "residues.*.rigor",
      "windingNumbers.*",
      "residueSelection.ladderRung",
    ],
  },

  traps: [
    {
      id: "factor-split-assumed-homogeneous",
      detect: "algebraic:existsIrreducibleFactorStraddling(Q, 'realAxis')",
      message:
        "z⁴+1 factors over ℚ(i) as (z²−i)(z²+i), and it is tempting to read that as one factor per half-plane — it is not. A factor z²−c always has roots ±√c, an ANTIPODAL pair, so each of these two quadratics contributes exactly one root above the axis and one below: z²−i gives e^{iπ/4} (upper) and e^{5iπ/4} (lower); z²+i gives e^{3iπ/4} (upper) and e^{−iπ/4} (lower). Rung 1 of PLAN §3.3's ladder therefore FAILS here and the engine must fall to rung 2 rather than sum a factor's residues wholesale. Summing z²−i's two residues gives −(e^{iπ/4}+e^{5iπ/4})/4 = 0, so the error is invisible in the arithmetic.",
    },
    {
      id: "all-roots-summed",
      detect: "structural:selectedResidueCount == algebraic:degree(Q)",
      message:
        "Σ over all four roots of −z/4 is −e₁/4 = 0, because z⁴+1 has no z³ term. That zero is not an accident: it IS Res(f,∞) = 0, and by research 03 §15's cross-family identity it is equivalent to the degree condition deg Q ≥ deg P + 2. So dropping the half-plane restriction returns exactly 0 — clean, plausible, and the negation of the whole method. The restriction is not a detail of the formula; it is the formula.",
    },
    {
      id: "floating-roots-downgrade",
      detect: "structural:rootProvenance == 'float'",
      message:
        "Reporting π/√2 from Durand–Kerner roots of z⁴+1 earns ≈, not =, however many digits agree. The exact claim rests on two things that have nothing to do with the float roots: Res ≡ −z/4 as an element of ℚ(i)[z]/⟨z⁴+1⟩ (verify: 4z³·(−z/4) = −z⁴ ≡ 1), and rung 2's radical split delivering the upper pair as e^{iπ/4}, e^{3iπ/4} ∈ ℚ(i,√2). Per PLAN §3.3, a decimal rendering of the exact result is itself labelled ≈.",
    },
    {
      id: "closing-down-disagrees",
      detect: "numeric:abs(closeUpValue - closeDownValue) > tol",
      message:
        "−2πi Σ_{Im z<0} Res must equal +2πi Σ_{Im z>0} Res; both give 2.2214414690791831. Since the two sums are −i√2/4 and +i√2/4, a disagreement means either the orientation sign or the half-plane predicate was applied inconsistently — and because the two sums are exact negatives here, an engine that got the predicate backwards AND the orientation backwards would agree with itself while being wrong twice.",
    },
  ],

  golden: [
    {
      params: {},
      value: "pi/sqrt(2)",
      numeric: 2.2214414690791831,
      verifiedTo: 1e-14,
      method:
        "Res ≡ −z/4 in ℚ(i)[z]/⟨z⁴+1⟩ (verified by 4z³·(−z/4) = −z⁴ ≡ 1) summed over the rung-2 radical split, cross-checked against the two upper roots' numeric residues to 12 s.f. and against a contour quadrature",
    },
    {
      params: { closeDown: true },
      label: "closing through the lower half-plane",
      value: "pi/sqrt(2)",
      numeric: 2.2214414690791831,
      verifiedTo: 1e-14,
      method:
        "the same value by −2πi Σ_{Im z<0} Res — an independent route whose residue sum is the exact negative, so it guards traps.closing-down-disagrees",
    },
  ],
};
