// C2 — `removable-one-minus-cos`, from `docs/contour-integration/gallery/tier-cd.md` §C2.
//
// **Detect removability and do nothing.** C1's reflex is to indent anything sitting on the contour;
// C2 is the case where that reflex is wrong. `(1 − cos x)/x²` is bounded at the origin — it tends to
// ½ — so LEGALITY finds no singularity on the path and there is nothing to indent. The engine EARNS
// that rather than assuming it: the numerator of the auxiliary vanishes to order 2 at the origin,
// exactly matching the denominator, computed by an exact Taylor expansion over ℚ(i).
//
// The catch is that removability is a property of the AUXILIARY, and the obvious auxiliary
// `(1 − e^{iz})/z²` has a simple pole at 0 with residue `−i`. Subtracting its principal part gives
// the entire `(1 − e^{iz} + iz)/z²` — and then the π has to come from somewhere else. It migrates to
// the large arc, where `z·f(z) → i` and **L5** — not L2, not Jordan — delivers `iα·L = iπ·i = −π`.
//
// **So the indentation and the non-vanishing arc are the same π, moved.** The contrast with C1 is
// the entry: same integral value π/2, and the whole difference is whether `c₋₁` is zero.
import { pt } from "../../engine/contour/model.js";
import type { Family } from "../schema.js";

export const c2RemovableOneMinusCos: Family = {
  id: "removable-one-minus-cos",
  title: "∫₀^∞ (1 − cos x)/x² dx = π/2 — removability detected, indentation not needed",
  taxonomySection: "4",
  tier: "C",

  targets: [
    {
      id: "I",
      kind: "integral",
      variable: "x",
      lower: "0",
      upper: "inf",
      integrand: "(1 - cos(x))/x^2",
      // Absolutely convergent, and NOT a principal value — the integrand is bounded at 0 (→ ½) and
      // decays like 1/x². Setting principalValue here would be a false claim, not a safe default.
      convergence: "absolute",
      symbols: {},
    },
  ],

  auxiliary: {
    // Built by subtracting the principal part i/z from (1 − e^{iz})/z², which makes the origin
    // removable. That subtraction does not DELETE the term — it moves its contribution onto the
    // large arc. See traps.dropped-principal-part-bookkeeping.
    integrand: "(1 - exp(i*z) + i*z)/z^2",
    // Re because (1 − cos x)/x² = Re f on ℝ exactly; the /2 because the integrand is even.
    // Im f on ℝ is (x − sin x)/x², which is ODD and cancels over [−R, R].
    relation: "Re/2",
    note: "Re(f|_ℝ) = (1 − cos x)/x² exactly; the added i·z contributes only to the odd imaginary part on ℝ and so cancels over a symmetric range",
  },

  parameters: [],

  hypotheses: [
    {
      id: "removable-at-origin",
      statement:
        "the auxiliary has a REMOVABLE singularity at z = 0 (c₋₁ = 0), so no indentation is required",
      check: "series:laurentCoefficient(auxiliary, 0, -1) == 0 && isBounded(auxiliary, near 0)",
      onFail: "refuse",
    },
    {
      id: "entire",
      statement:
        "the auxiliary is entire: the residue sum is empty and the closed contour value is 0",
      check: "algebraic:poleCount(auxiliary, C) == 0",
      onFail: "warn",
    },
    {
      id: "large-arc-limit-exists",
      statement:
        "z·f(z) → i uniformly on |z| = R, Im z ≥ 0 (so L5 applies and the arc does NOT vanish)",
      check: "symbolic:uniformLimit(z*auxiliary, abs(z)->inf, upperHalfPlane) == i",
      onFail: "refuse",
    },
    {
      id: "imaginary-part-odd",
      statement:
        "Im(f) on ℝ is odd, so the target pieces contribute 2·∫₀^∞ of the real part and nothing else",
      check: "parity:isOdd(im(auxiliary restricted to R))",
      onFail: "refuse",
    },
    {
      id: "exponential-not-cosine",
      statement: "the complexification must use exp(iz), never cos z",
      check: "structural:noUnboundedOnArc(auxiliary, upperHalfPlane)",
      onFail: "refuse",
    },
  ],

  // branch: DELIBERATELY OMITTED — rational × entire, single-valued everywhere.

  contour: {
    // NOT indentedSemicircle — that is the entry's whole point.
    template: "semicircle",
    limitParams: [{ name: "R", to: "inf" }],
    pieces: [
      {
        id: "line",
        name: "the real axis, undivided",
        geom: {
          kind: "segment",
          from: pt({ param: "R", mul: -1 }, 0),
          to: pt({ param: "R" }, 0),
        },
        role: "target",
        colour: 0,
      },
      {
        id: "bigarc",
        name: "the $R \\to \\infty$ semicircle",
        geom: { kind: "arc", center: pt(0, 0), radius: { param: "R" }, theta0: 0, theta1: Math.PI },
        // `vanish` with a KNOWN LIMIT rather than zero — DESIGN §4 Pass 5's `bᵢ = 0, or a known
        // limit`. The role says the piece touches no unknown, not that it contributes nothing.
        role: "vanish",
        lemma: "L5",
        colour: 1,
      },
    ],
    orientation: "ccw",
    // EMPTY, and that is the claim: the auxiliary is entire, so there is nothing to wind around.
    windings: [],
  },

  vanishingLemmas: [
    {
      piece: "bigarc",
      lemma: "L5",
      sideCondition: "z·f(z) → L uniformly along the arc of angle α; here L = i and α = +π",
      discharge: "symbolic:largeArcResidue(auxiliary, alpha = pi)",
      // = iπ·i = −π. NOT zero.
      rigorOfBound: "=",
      rigorOfLimit: "=",
      rigorIfNumericOnly: "≈",
    },
  ],

  residueSelection: { rule: "inside", set: "{} — empty: the integrand is entire" },

  closedForm: {
    expr: "( 2*pi*i*Sum(Res) - i*alpha*lim(z*f) ) / 2",
    simplified: "pi/2",
  },

  rigor: {
    policy: "min",
    inputs: ["hypotheses.*", "vanishingLemmas.*.rigor", "auxiliary.relation"],
  },

  traps: [
    {
      id: "reflex-indentation",
      detect: "structural:template == 'indentedSemicircle' && hypotheses.removable-at-origin == true",
      message:
        "There is nothing at z = 0 to detour around: the Laurent series of (1 − e^{iz} + iz)/z² is 1/2 + iz/6 + … with c₋₁ = 0. An indentation here is harmless but it is not a repair, and printing it in the derivation teaches that every boundary point needs one. Removability is DETECTED (gcd cancellation, or c₋₁ = 0 from an exact expansion), not assumed.",
    },
    {
      id: "cos-z-on-the-arc",
      detect: "structural:contains(auxiliary, cos(z)) || structural:contains(auxiliary, sin(z))",
      message:
        "cos z is UNBOUNDED on every large arc in BOTH half-planes: |cos(iY)| = cosh Y (1.1e4 at R=10, 2.4e8 at R=20, 1.2e17 at R=40). No L1/L2/L3 bound exists, so no lemma discharges the arc. Asserting that the arc vanishes because the integrand 'decays like 1/R²' gives 2T + 0 = 0, i.e. T = 0 — the answer is π/2. (The arc's value is in fact finite and equal to −π, but it is recoverable neither by a lemma nor in float64: direct quadrature gives −2.949 at R=10, then 5.4e3 at R=50, 3.4e68 at R=200 and NaN at R=1000, as the e^R integrand cancels away 16 digits.) Complexify with exp(iz) and take the real part at the end.",
    },
    {
      id: "l2-instead-of-l5",
      detect: "structural:lemmaUsed(bigarc) in ['L1','L2','L3']",
      message:
        "The arc does not vanish. z·f(z) → i, not 0, so |f| ~ 1/|z| and the decay hypothesis of L2 (p > 1) fails; Jordan needs f = e^{iaz}·g with g → 0, and the surviving iz/z² = i/z term is not of that shape. L5 is the lemma that applies and it returns iα·L = −π. Claiming L2 here yields T = 0.",
    },
    {
      id: "dropped-principal-part-bookkeeping",
      detect: "structural:principalPartSubtracted && structural:lemmaUsed(bigarc) != 'L5'",
      message:
        "Subtracting the principal part i/z to make the origin removable does not delete that term — it moves its contribution onto the large arc. The indentation's −iπ·Res and the arc's iπ·L are the same π. If you subtract the principal part AND keep the indentation's contribution, you count it twice.",
    },
  ],

  golden: [
    {
      params: {},
      value: "pi/2",
      numeric: 1.5707963267948966,
      verifiedTo: 3e-15,
      method:
        "the residue sum is EMPTY (the auxiliary is entire, verified by an exact Taylor expansion at the origin) and the whole value is L5's iα·L with L = i, α = π: ∮ = 0 gives ∫_ℝ = π and the target is Re(π)/2 = π/2. Independently verified in research two ways: (a) half-period sums of ½·sinc(x/2)² to 40π with a Euler-accelerated tail, 1.5707963267948957 (rel 5.7e-16); (b) direct summation to 2000π with an accelerated tail, 1.5707963267948999 (rel 2.1e-15)",
    },
    {
      params: { route: "indented" },
      value: "pi/2",
      numeric: 1.5707963267948966,
      verifiedTo: 1e-6,
      method:
        "the ALTERNATIVE route, and the cross-check that the two are the same π: with f = (1 − e^{iz})/z² there is a simple pole at 0 with Res = −i, the indentation (α = −π) contributes i(−π)(−i) = −π, and the big arc vanishes by L1 since |f| ≤ 2/R². Verified in research at ρ = 1e-6, R = 2000: closed-contour total 1.5e-7, small arc measured (−3.1415917, 0)",
    },
  ],
};
