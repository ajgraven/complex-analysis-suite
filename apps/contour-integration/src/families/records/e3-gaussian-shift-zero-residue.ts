// E3 — `gaussian-shift-zero-residue`, transcribed from
// `docs/contour-integration/gallery/tier-efg.md` §3.
//
// **THE EMPTY SINGULAR SET IS INFORMATION, NOT ITS ABSENCE.** Every other entry in tiers E–G ends in
// a residue; E3 has none. `f(z) = e^{−z²+ibz}` is entire, the rectangle encloses nothing, and the
// residue theorem's conclusion is `∮ = 2πi·Σ(∅) = 0` — which is Cauchy's theorem. `0` is a number,
// and it is the number that closes the argument. An engine built on "contour method ⇒ residues"
// mishandles this (research 03 §6 trap iv); one that treats an empty singular set as "nothing to
// compute, therefore refuse" is worse. Since M5.3a entirety is a DECISION here (`PoleReport.entire`)
// rather than the silence `findPoles` used to return, so the record says what it means.
//
// **THE SHIFT HEIGHT IS NOT FREE, AND THE WRONG ONE STILL CLOSES.** `f(z+ih)/f(z)` is not constant
// for any `h`, so there is no `reproduces` piece here and no L7 — the top side is `free`. It is
// KNOWN only at `h = b/2`, the saddle of `−z²+ibz`, where the oscillation cancels and the top side
// becomes the real Gaussian. At any other height it is `e^{c(h)}` times **the same unknown at a
// different parameter**: the closed-contour identity stays true and says nothing. The record's own
// measurement, at `b = 1.7, h = −b/2, R = 8`: the rectangle still closes to 3.8e-15 and the top side
// −0.860591739572559 is exactly `−e^{3b²/4}·T(2b)`.
//
// **AND THE ONE KNOWN VALUE IS IMPORTED.** `∫ℝe^{−x²}dx = √π` is `Γ(1/2)`, a polar-coordinates fact;
// this contour CONSUMES it and does not prove it. That is ADR-0042's decision and the reason this is
// the first record with a `knownValue`: pricing the top side by quadrature would cap an exact
// argument at `≈` by its most certain step, and a bare `=` would launder the import as a derivation.
//
// Two engine pieces landed with it. `kernel/bounds/gaussianSide.ts` kills the two verticals — the
// third integrand shape to need a vanishing SEGMENT, and the first whose `max|f|` is ATTAINED rather
// than majorised, because `Re Q(c+iy)` is an exact quadratic in `y`. And Pass 5 takes its fourth
// route (`families/solveImported.ts`), which requires `∮ = 0` — not a restriction but this record's
// content, since `2πi Σ Res` carries π and `√π` does not, and `0` is the one value both rings share.
import { pt } from "../../engine/contour/model.js";
import type { Family } from "../schema.js";

export const e3GaussianShiftZeroResidue: Family = {
  id: "gaussian-shift-zero-residue",
  title: "∫_{−∞}^{∞} e^{−x²} cos bx dx by a rectangle",
  titleLatex: "$\\int_{-\\infty}^{\\infty}e^{-x^2}\\cos bx\\,dx$ by a rectangle",
  taxonomySection: "Rectangles and sectors",
  tier: "E",

  description: {
    contour: "the rectangle with vertices $\\pm R,\\ \\pm R+ib/2$; integrand $e^{-z^2+ibz}$, entire",
    point:
      "Cauchy's theorem, not a residue: on $\\operatorname{Im}z=b/2$ the integrand reduces to $e^{-b^2/4}e^{-x^2}$, and $\\int e^{-x^2}dx=\\sqrt\\pi$ is taken as known.",
    citations: [
      { book: "Stein–Shakarchi", where: "Ch. 2 §1", text: "Fourier transform of the Gaussian" },
      { book: "Needham", where: "Ch. 9", text: "" },
    ],
  },

  targets: [
    {
      id: "C",
      role: "primary",
      kind: "integral",
      variable: "x",
      lower: "-inf",
      upper: "inf",
      integrand: "exp(-x^2)*cos(b*x)",
      convergence: "absolute",
      symbols: {},
    },
    {
      // The ODD half, and it is not decoration. The bottom side is `∫ℝe^{−x²}e^{ibx}dx = C + iS`, so
      // the single complex identity realifies into two real equations and determines BOTH. `S = 0`
      // then comes out of the imaginary row as arithmetic rather than as a hypothesis nobody checked
      // — which is the record's `target-is-real` claim, made falsifiable.
      id: "S",
      role: "bonus",
      kind: "integral",
      variable: "x",
      lower: "-inf",
      upper: "inf",
      integrand: "exp(-x^2)*sin(b*x)",
      convergence: "absolute",
      symbols: {},
    },
  ],

  auxiliary: {
    integrand: "exp(-z^2 + i*b*z)",
    // As D4: the extraction IS the real/imaginary split of one complex identity, legitimate because
    // both unknowns are real.
    relation: "components",
    note: "cos(bz) grows like e^{|b||y|} in both half-planes, so the verticals would not vanish for it; the contour carries e^{ibz} and the cosine target is recovered from the real row, with the sine on the imaginary one",
  },

  // WLOG b ≥ 0: cos is even in b, so the family reduces to b ≥ 0. Without that the rectangle's height
  // b/2 changes SIGN and the traversal flips from ccw to cw, while `contour.orientation` is a fixed
  // string (gallery finding SG-3).
  parameters: [{ name: "b", domain: "real", constraints: ["b >= 0"] }],

  hypotheses: [
    {
      id: "entire-integrand",
      statement: "f(z) = e^{−z²+ibz} is entire: the singular set is EMPTY and S = 2πi·Σ(∅) = 0",
      check: "structural:isEntire(exp(-z^2 + i*b*z))",
      onFail: "refuse",
    },
    {
      id: "shift-is-the-saddle",
      statement:
        "h = b/2 is the unique height at which the top side becomes a KNOWN integral: d/dz(−z²+ibz) = 0 at z = ib/2, and there e^{−z²+ibz} = e^{−x²−b²/4}",
      check: "symbolic:eq(solve(diff(-z^2 + i*b*z, z) == 0, z), i*b/2)",
      onFail: "refuse",
    },
    {
      id: "target-is-real",
      statement:
        "the bottom side gives ∫ℝ e^{−x²}e^{ibx}dx, whose imaginary part ∫ℝ e^{−x²}sin(bx)dx = 0 because the integrand is odd; so the bottom side IS the target, with no real part to take",
      check: "parity:isOdd(exp(-x^2)*sin(b*x))",
      onFail: "warn",
    },
    {
      id: "gaussian-value-is-imported",
      statement:
        "∫ℝ e^{−x²}dx = √π is Γ(1/2), established by polar coordinates — NOT by this contour. This argument consumes it; it does not prove it.",
      check: "provenance:external('Gamma(1/2) = sqrt(pi)', method='polar coordinates')",
      onFail: "warn",
    },
  ],

  contour: {
    template: "rectangle",
    // R = 6 rather than the default: the top side is compared against its own quadrature on the
    // ledger, and `∫_R^∞ e^{−x²}` is the gap — 1.5e-8 of the value at R = 4 and 2.2e-11 at R = 6.
    limitParams: [{ name: "R", to: "inf", start: 6 }],
    // The saddle height, frozen from `b` at instantiation — the same move F1 makes with its wedge
    // angle, and for the same reason: the `Scalar` is affine in the LIVE parameters, and `b` is not
    // one of them (dragging `R` must not move the rectangle's height).
    derived: [{ name: "saddle", expr: "b/2" }],
    pieces: [
      {
        id: "bottom",
        name: "the real axis",
        geom: { kind: "segment", from: pt({ param: "R", mul: -1 }, 0), to: pt({ param: "R" }, 0) },
        role: "target",
        coefficients: [
          { targetId: "C", coefficient: "1" },
          { targetId: "S", coefficient: "i" },
        ],
        colour: 0,
      },
      {
        id: "right",
        name: "the right vertical $x = R$",
        geom: {
          kind: "segment",
          from: pt({ param: "R" }, 0),
          to: pt({ param: "R" }, { param: "saddle" }),
        },
        role: "vanish",
        lemma: "L1",
        colour: 1,
      },
      {
        id: "top",
        name: "the saddle line $\\operatorname{Im} z = b/2$",
        geom: {
          kind: "segment",
          from: pt({ param: "R" }, { param: "saddle" }),
          to: pt({ param: "R", mul: -1 }, { param: "saddle" }),
        },
        role: "free",
        knownValue: {
          expr: "-sqrt(pi)*exp(-b^2/4)",
          method:
            "on $\\operatorname{Im} z = b/2$ the integrand collapses to $e^{-x^2-b^2/4}$; the remaining $\\int_{\\mathbb{R}} e^{-x^2}dx = \\Gamma(1/2) = \\sqrt{\\pi}$ is imported, not derived here",
          rigor: "=",
        },
        colour: 2,
      },
      {
        id: "left",
        name: "the left vertical $x = -R$",
        geom: {
          kind: "segment",
          from: pt({ param: "R", mul: -1 }, { param: "saddle" }),
          to: pt({ param: "R", mul: -1 }, 0),
        },
        role: "vanish",
        lemma: "L1",
        colour: 3,
      },
    ],
    orientation: "ccw",
    // NOTHING. The enclosed singular set is empty; this is Cauchy's theorem, i.e. the residue
    // theorem with an empty sum.
    windings: [],
  },

  vanishingLemmas: [
    {
      piece: "right",
      lemma: "L1",
      sideCondition:
        "on z = R+iy, y ∈ [0,b/2]: |f| = e^(-R^2+y^2-b*y) <= e^(-R^2), because y^2 - b*y <= 0 on [0,b]; hence |int| <= (b/2)*e^(-R^2)",
      discharge: "symbolic:mlBound(piece=right, M=exp(-R^2), L=b/2, limit=R->inf, requires=[])",
      rigorOfBound: "≤",
      rigorOfLimit: "=",
      rigorIfNumericOnly: "≈",
    },
    {
      piece: "left",
      lemma: "L1",
      sideCondition:
        "identical bound: at z = ±R+iy, Re(-z^2+i*b*z) = -R^2 + y^2 - b*y in BOTH cases (the ∓2iRy and ±ibR terms are purely imaginary), so |f(-R+iy)| <= e^(-R^2) on [0,b/2] too",
      discharge: "symbolic:mlBound(piece=left, M=exp(-R^2), L=b/2, limit=R->inf, requires=[])",
      rigorOfBound: "≤",
      rigorOfLimit: "=",
      rigorIfNumericOnly: "≈",
    },
  ],

  // The rule is the ORDINARY one, and it correctly returns the empty set. No special case is needed
  // or wanted: Pass 2 emits zero pole rows, `∮ = 0` with certificate level `=`, and Pass 5 closes.
  residueSelection: { rule: "inside", set: "the rectangle −R < Re z < R, 0 < Im z < b/2 — EMPTY" },

  closedForm: {
    expr: "-knownValue(top)",
    simplified: "sqrt(pi)*exp(-b^2/4)",
  },

  rigor: {
    policy: "min",
    // `residues.*` is an EMPTY list here, and an empty meet is the lattice top `=`, not `?`. Getting
    // that wrong is the single most likely way to break this record.
    inputs: ["hypotheses.*", "vanishingLemmas.*.rigor", "freePieces.*.knownValue.rigor", "residues.*.rigor"],
  },

  traps: [
    {
      id: "contour-method-implies-residues",
      detect: "engine:requiresNonEmpty(residues)",
      message:
        "The residue theorem asserts ∮f = 2πi Σ n(γ,aₖ)Res(f,aₖ) — over WHATEVER singularities are enclosed, including none. An empty sum is 0, and 0 is the number that closes this argument. Reporting 'no poles found, cannot evaluate' is a bug; so is silently hunting for a pole to make the machinery fire.",
    },
    {
      id: "shift-height-must-be-the-saddle",
      detect: "algebraic:ne(contour.height, b/2)",
      message:
        "At height h the integrand on the top line is e^{h²−bh}·e^{−x²}·e^{i(b−2h)x}, so the top side is e^{h²−bh} times the SAME unknown at parameter b−2h. The closed-contour identity stays true and says nothing. Verified at b = 1.7, h = −b/2, R = 8: the rectangle still closes (|∮| = 3.8e-15) and the top side −0.860591739572559 equals −e^{3b²/4}·T(2b). Only h = b/2, the saddle of −z²+ibz, kills the oscillation and makes the top side a known real Gaussian.",
    },
    {
      id: "gaussian-value-claimed-as-contour-output",
      detect: "provenance:declaresExternal(closedForm, 'Gamma(1/2)')",
      message:
        "This contour does not prove ∫ℝe^{−x²}dx = √π; it CONSUMES it. Presenting √π as an output of the residue machinery is the same category error as claiming ∫₀^∞e^{−xⁿ}dx = Γ(1+1/n) is a contour result (research 03 §7's honesty note). Label the import — which is what `knownValue.method` is for.",
    },
    {
      id: "quasi-period-assumed",
      detect: "symbolic:isQuasiPeriod(f, contour.height)",
      message:
        "f(z+ih)/f(z) = e^{h²−bh}e^{−2ihz}·… is NOT constant in z, so E3 is not an L7 family at all and has no `reproduces` piece. Do not reach for λ here — verified: f(z+ib/2)/f(z) takes the values 0.595−0.333i and −0.245+0.022i at two different points.",
    },
    {
      id: "cos-not-complexified",
      detect: "structural:contains(problem.contourIntegrand, 'cos(b*z)')",
      message:
        "cos(bz) grows like e^{|b||y|} in both half-planes, so the vertical sides would not vanish. Use e^{ibz} on the contour and read the cosine off the REAL row and the sine off the imaginary one — no real part needs to be taken by hand.",
    },
  ],

  // `b = 0` is NOT a fixture, and the gallery's own invariant says why it would be a poor one: the
  // rectangle degenerates to the real axis, the identity reads `√π = √π`, and the family carries no
  // content there. The engine agrees for a sharper reason — a zero-height vertical has no ML bound
  // but a vacuous `≤ 0`, which `gaussianSideBound` refuses by name.
  golden: [
    {
      params: { b: 1 },
      value: "sqrt(pi)*exp(-1/4)",
      numeric: 1.3803884470431429,
      verifiedTo: 6.4e-16,
      method: "1200 panels of 32-point Gauss–Legendre on $[-12, 12]$, with an $e^{-144}$ tail",
    },
    {
      params: { b: 1.7 },
      value: "sqrt(pi)*exp(-b^2/4)",
      numeric: 0.86059173957255597,
      verifiedTo: 5.2e-16,
      method: "the same quadrature at $b = 1.7$, the shift this record is most often measured at",
    },
    {
      params: { b: 3 },
      value: "sqrt(pi)*exp(-b^2/4)",
      numeric: 0.18681526145713168,
      verifiedTo: 5.9e-16,
      method: "the same quadrature and the same tail bound, at $b = 3$",
    },
    {
      params: { b: 6.5 },
      value: "sqrt(pi)*exp(-b^2/4)",
      numeric: 4.585001385525313e-5,
      verifiedTo: 2.0e-12,
      method:
        "the same quadrature at $b = 6.5$: the worst case in this tier, where the target is $4\\times10^{-5}$ against an integrand of order 1, so cancellation costs about four digits. Kept as the point where the quadrature's label degrades honestly while the exact one does not",
    },
  ],
};
