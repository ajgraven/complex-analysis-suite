// B3 — `jordan-quartic`, transcribed from `docs/contour-integration/gallery/tier-ab.md` §2.
//
// A6 × B1, and the record where **`=` is earned on the form while the decimal remains `≈`.** The
// algebraic factor of the residue is literally the same element as A6's — `P·(Q′)⁻¹ ≡ −z/4` in
// `ℚ(i)[z]/⟨z⁴+1⟩` — but the residue is `−α e^{iα}/4`, which is not an algebraic number, so the
// symmetric-function machinery that makes A6's cross-check free is **unavailable**: here
// `Σ_all Res = −0.166468279019598 i ≠ 0`, because `e^{iz}` has an essential singularity at ∞.
//
// Rung 2 of the half-plane ladder still delivers `=`, because the radical split gives
// `iα = −1/√2 ± i/√2` and hence `e^{iα}` in closed form. Certifying the resulting DECIMAL is a
// different matter and is deferred: PLAN §3.2 cut the interval tier precisely because ECMA-262 gives
// `Math.exp`/`cos`/`sin` no ulp bound.
import { pt } from "../../engine/contour/model.js";
import type { Family } from "../schema.js";

export const b3JordanQuartic: Family = {
  id: "jordan-quartic",
  title: "∫_{−∞}^{∞} cos x dx/(1+x⁴) by Jordan's lemma",
  titleLatex: "$\\int_{-\\infty}^{\\infty}\\frac{\\cos x}{1+x^4}\\,dx$ by Jordan's lemma",
  taxonomySection: "Fourier-type integrals and Jordan's lemma",
  tier: "B",

  description: {
    contour: "$[-R,R]$ closed by $\\Gamma_R$, integrand $e^{iz}/(1+z^4)$",
    point:
      "The residues at $e^{i\\pi/4},e^{3i\\pi/4}$ carry $e^{iz_k}$; the identity $\\sum\\text{all residues}=0$ of the rational case no longer holds, since $e^{iz}$ is essentially singular at $\\infty$.",
    citations: [
      { book: "Brown–Churchill", where: "§80", text: "" },
      { book: "Marsden–Hoffman", where: "§4", text: "" },
    ],
  },

  targets: [
    {
      id: "I",
      kind: "integral",
      variable: "x",
      lower: "-inf",
      upper: "inf",
      integrand: "cos(x)/(1 + x^4)",
      // Absolutely convergent: |cos x/(1+x⁴)| ≤ 1/(1+x⁴). Contrast B2, which is not.
      convergence: "absolute",
      symbols: { R: { kind: "rationalFn", var: "x" } }, // R(x) = 1/(1+x⁴)
    },
  ],

  auxiliary: {
    integrand: "exp(i*z)/(1 + z^4)",
    relation: "Re",
    note: "cos x = Re e^{ix}; the imaginary part is the free companion ∫ sin x/(1+x⁴) = 0, by parity",
  },

  parameters: [],
  // a = 1 pinned by the gallery entry; the family generalises to cos(ax)/(1+x⁴) unchanged.

  hypotheses: [
    {
      id: "no-real-poles",
      statement: "x⁴ + 1 ≥ 1 has no real zero",
      check: "algebraic:noRealRoot(1 + x^4)",
      onFail: "refuse",
    },
    {
      id: "real-on-R",
      statement: "R ∈ ℝ(x), so Re/Im give the cos/sin integrals",
      check: "structural:hasRealCoefficients(R)",
      onFail: "refuse",
    },
    {
      id: "squarefree",
      statement: "z⁴+1 is squarefree, so all four poles are simple and P/Q′ applies",
      check: "algebraic:gcd(Q, derivative(Q)) == 1",
      onFail: "refuse",
    },
    {
      id: "jordan-decay",
      statement: "M_R = max_{C_R}|R| → 0",
      check: "algebraic:decayExponent(numer(R), denom(R)) >= 1",
      onFail: "refuse",
    },
    {
      id: "half-plane-count-exact",
      statement:
        "#{roots of z⁴+1 with Im z > 0} = 2 (Möbius + Schur–Cohn, cross-checked by Routh–Hurwitz)",
      check: "algebraic:upperHalfPlaneRootCount(Q) == 2",
      onFail: "refuse",
    },
    {
      id: "half-plane-selection-exact",
      // The rung is the SAME as A6's; the OUTPUT FIELD is not. A6 lands in ℚ(i,√2); B3 lands in
      // ℚ(√2, e^{−1/√2}, cos(1/√2), sin(1/√2)).
      statement: "the restricted sum is exact via the ladder; this entry lands on rung 2",
      check: "algebraic:halfPlaneLadderRung(Q, 'upper') <= 3",
      onFail: "refuse",
    },
    {
      id: "residue-is-not-algebraic",
      statement:
        "Res = −α e^{iα}/4 lies outside ℚ(i)[z]/⟨Q⟩; symmetric-function shortcuts over the residues are INVALID here",
      check: "structural:residueFieldIsAlgebraic(f) == false",
      onFail: "warn",
    },
  ],

  // branch: DELIBERATELY OMITTED. e^{iz}/(1+z⁴) is single-valued. The 1/√2 in the answer is a
  // radical in the VALUE; there is no branch point and no cut anywhere in the problem.

  contour: {
    template: "semicircle",
    limitParams: [{ name: "R_lim", to: "inf" }],
    pieces: [
      {
        id: "realAxis",
        name: "the real segment [−R, R]",
        geom: {
          kind: "segment",
          from: pt({ param: "R_lim", mul: -1 }, 0),
          to: pt({ param: "R_lim" }, 0),
        },
        role: "target",
        colour: 0,
      },
      {
        id: "arc",
        name: "the $R \\to \\infty$ semicircle (upper: $a = 1 > 0$)",
        geom: {
          kind: "arc",
          center: pt(0, 0),
          radius: { param: "R_lim" },
          theta0: 0,
          theta1: Math.PI,
        },
        // Like B1 and unlike B2, L2 also discharges this arc (deg gap 4). Gap G1 again.
        role: "vanish",
        lemma: "L3",
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
      lemma: "L3",
      sideCondition:
        "a = 1 > 0, arc in the upper half-plane (|e^{iz}| ≤ 1), M_R = max_{C_R}|1/(1+z⁴)| → 0",
      // M_R ≤ 1/(R⁴ − 1), exact in ℚ; den(R) > 0 ⟺ R > 1.
      // At R = 50: M_R ≤ 1.600000e-7, Jordan bound π·M_R = 5.026549e-7, O(R⁻⁴) → 0.
      // (Plain ML would give πR·M_R = 2.513275e-5, also → 0 — see gap G1.)
      discharge: "symbolic:jordanBound(R, 1, R_lim)",
      rigorOfBound: "≤",
      rigorOfLimit: "=",
      rigorIfNumericOnly: "≈",
    },
  ],

  residueSelection: { rule: "upperHalfPlane" },
  halfPlaneLadder: "radicalsDeg4",

  closedForm: {
    expr: "re(2*pi*i*Sum(Res(exp(i*z)/(1+z^4), z_k), im(z_k) > 0))",
    simplified: "(pi/sqrt(2))*exp(-1/sqrt(2))*(cos(1/sqrt(2)) + sin(1/sqrt(2)))",
  },

  rigor: {
    policy: "min",
    inputs: [
      "hypotheses.*",
      "vanishingLemmas.*.rigor",
      "residues.*.rigor",
      "windingNumbers.*",
      "residueSelection.ladderRung",
      "display.renderingMode",
    ],
  },

  traps: [
    {
      id: "total-residue-theorem-misapplied",
      detect:
        "structural:isRational(contourIntegrand) == false && structural:usedTotalResidueIdentity",
      message:
        "For A6 (rational, deg gap ≥ 2) the sum over ALL four roots of −z/4 is exactly 0, which is Res(f,∞) = 0, and it is a free cross-check. Here f = e^{iz}/(1+z⁴) is NOT rational: e^{iz} has an ESSENTIAL singularity at ∞, the total-residue theorem does not apply, and the sum over all four roots is −0.166468279019598 i ≠ 0. Reusing A6's shortcut here silently changes the answer by 2πi × 0.0793108814094 i. The two entries share a denominator, a ladder rung and an algebraic residue factor, and differ on exactly this — which is why they are separate gallery entries.",
    },
    {
      id: "transcendental-factor-evaluated-at-a-float-root",
      detect:
        "structural:residueFieldIsAlgebraic(f) == false && structural:rootProvenance == 'float'",
      message:
        "P·(Q′)⁻¹ mod Q gives −z/4 exactly — the same element of ℚ(i)[z]/⟨z⁴+1⟩ that A6 uses — but that is only the ALGEBRAIC FACTOR. The residue is −α e^{iα}/4 and the transcendental factor must be evaluated at the actual root, so exactness depends entirely on rung 2 producing α = (±1+i)/√2 in closed form, whence iα = −1/√2 ± i/√2 and e^{iα} = e^{−1/√2}(cos(1/√2) ± i sin(1/√2)). Without that, the engine must fall to rung 5 and print RootSum_{Im α > 0}(−α e^{iα}/4) WITH its half-plane predicate visible (PLAN §3.3) rather than a decimal.",
    },
    {
      id: "decimal-rendering-claims-exactness",
      detect: "structural:renderingMode == 'decimal' && verdict.level == '='",
      message:
        "The `=` is on the SYMBOLIC form (π/√2)e^{−1/√2}(cos(1/√2)+sin(1/√2)). Rendering 1.5442760096181360 is ≈, and not merely by PLAN §3.3's general rule: certifying that decimal requires enclosures for exp, cos and sin at 1/√2, and PLAN §3.2 cut tier 2 precisely because ECMA-262 gives Math.exp/cos/sin NO ulp bound — every JS interval library's transcendental is a heuristic wearing a proof's clothes. Tier 3 (Arb/FLINT WASM) is the documented escape hatch. Contrast A6, whose non-π factor 1/√2 IS rationally enclosable by DESIGN §6.1's sqrtUp/sqrtDown.",
    },
    {
      id: "sine-companion-nonzero",
      detect: "numeric:abs(im(2*pi*i*residueSum)) > tol",
      message:
        "cos x/(1+x⁴) is even and sin x/(1+x⁴) is odd, so the same contour gives ∫_ℝ sin x/(1+x⁴) dx = 0 for free — measured Im(2πi Σ) = 0 exactly. The two upper residues are complex conjugates in their real parts and equal in their imaginary parts, so the real parts cancel in the sum: that cancellation IS the parity statement, and losing it means a root was mis-assigned to a half-plane.",
    },
  ],

  golden: [
    {
      params: {},
      value: "(pi/sqrt(2))*exp(-1/sqrt(2))*(cos(1/sqrt(2)) + sin(1/sqrt(2)))",
      numeric: 1.544276009618136,
      verifiedTo: 1e-15,
      method:
        "the two upper residues are $-\\alpha e^{i\\alpha}/4$ at $\\alpha = e^{\\pm i\\pi/4}$, carried exactly as $(\\pi\\sqrt2/4 \\mp \\pi i\\sqrt2/4)\\,e^{-\\sqrt2/2 \\pm i\\sqrt2/2}$; the form is exact and the decimal is an estimate, because certifying $\\exp$, $\\cos$ and $\\sin$ at $1/\\sqrt2$ needs interval enclosures this engine does not carry. Cross-checked against the contour quadrature",
    },
    {
      params: { companion: "sin" },
      label: "the sine companion",
      value: "0",
      numeric: 0,
      verifiedTo: 1e-14,
      method:
        "the free companion $\\int_{\\mathbb{R}} \\sin x/(1+x^4)\\,dx$, which is the imaginary part of the same contour value and is 0; the cancellation of the two residues' real parts is the parity statement",
    },
  ],
};
