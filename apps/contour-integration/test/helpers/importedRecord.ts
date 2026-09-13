// A minimal record whose contour encloses NOTHING and closes on one imported value.
//
// The same purpose as `summationRecord.ts`: E3 lands in M5.8c and F2 in M5.8d, and until then this is
// the only way to drive `solveImported` end to end. It stays afterwards for the reason that one does
// — it varies the import, the coefficient row and the number of unknowns freely, which a gallery
// record must not.
//
// The geometry is E3's shifted rectangle, because its two verticals are the only `vanish` sides in
// the corpus that an ENTIRE integrand's L1 bound actually discharges.
import { pt } from "../../src/engine/contour/model.js";
import type { Family, FamilyPiece } from "../../src/families/schema.js";
import type { Level } from "@cas/rigor";

export interface ImportedOptions {
  /** The `knownValue.expr` on the top side. */
  readonly known?: string;
  readonly rigor?: Level;
  readonly method?: string;
  /**
   * A second unknown on the target piece with coefficient `i` — F2's two-real-integrals-in-one shape.
   *
   * The geometry is unchanged, and that is deliberate: the bottom side of this rectangle IS
   * `∫ℝe^{−x²}e^{ibx}dx = C + iS`, so the second unknown is real (`S = ∫ℝe^{−x²}sin(bx)dx = 0`, the
   * odd part) rather than invented. The realified system then has to determine both, and the
   * quadrature cross-check stays live — which it would not if the fixture carried F2's own known
   * value on a contour that is not F2's.
   */
  readonly second?: boolean;
  /** Put the import on the TARGET piece instead, which the loader must refuse. */
  readonly onTarget?: boolean;
  readonly height?: number;
}

export function importedRecord(over: ImportedOptions = {}): Family {
  const h = over.height ?? 0.85;
  const known = {
    expr: over.known ?? "-sqrt(pi)*exp(-b^2/4)",
    method: over.method ?? "the top side collapses to the real Gaussian; ∫ℝe^{−x²}dx = Γ(1/2) is imported",
    rigor: over.rigor ?? ("=" as Level),
  };
  const targets = over.second
    ? [
        { id: "C", role: "primary" as const },
        { id: "S", role: "bonus" as const },
      ]
    : [{ id: "T", role: "primary" as const }];
  const pieces: FamilyPiece[] = [
    {
      id: "bottom",
      name: "the real axis",
      geom: { kind: "segment", from: pt({ param: "R", mul: -1 }, 0), to: pt({ param: "R" }, 0) },
      role: "target",
      coefficients: over.second
        ? [
            { targetId: "C", coefficient: "1" },
            { targetId: "S", coefficient: "i" },
          ]
        : [{ targetId: "T", coefficient: "1" }],
      colour: 0,
    },
    {
      id: "right",
      name: "the right vertical",
      geom: { kind: "segment", from: pt({ param: "R" }, 0), to: pt({ param: "R" }, h) },
      role: "vanish",
      lemma: "L1",
      colour: 1,
    },
    {
      id: "top",
      name: "the saddle line",
      geom: { kind: "segment", from: pt({ param: "R" }, h), to: pt({ param: "R", mul: -1 }, h) },
      role: over.onTarget ? "target" : "free",
      ...(over.onTarget ? { coefficients: [{ targetId: "T", coefficient: "1" }] } : {}),
      knownValue: known,
      colour: 2,
    },
    {
      id: "left",
      name: "the left vertical",
      geom: {
        kind: "segment",
        from: pt({ param: "R", mul: -1 }, h),
        to: pt({ param: "R", mul: -1 }, 0),
      },
      role: "vanish",
      lemma: "L1",
      colour: 3,
    },
  ];
  return {
    id: "synthetic-imported",
    title: "a rectangle enclosing nothing, closing on one import",
    taxonomySection: "§6",
    tier: "E",
    targets: targets.map((t) => ({
      ...t,
      kind: "integral" as const,
      variable: "x" as const,
      lower: "-inf",
      upper: "inf",
      integrand: "exp(-x^2)*cos(b*x)",
      convergence: "absolute" as const,
      symbols: {},
    })),
    auxiliary: {
      integrand: "exp(-z^2 + i*b*z)",
      relation: "components",
      note: "the bottom side is the target; the top side is known and not derived here",
    },
    parameters: [{ name: "b", domain: "real", constraints: ["b >= 0"] }],
    hypotheses: [],
    contour: {
      template: "rectangle",
      limitParams: [{ name: "R", to: "inf" }],
      pieces,
      orientation: "ccw",
      windings: [],
    },
    vanishingLemmas: [
      {
        piece: "right",
        lemma: "L1",
        sideCondition: "|f| ≤ e^{−R²} on the vertical, since y² − by ≤ 0 on [0,b]",
        discharge: "symbolic:mlBound(piece=right, M=exp(-R^2), L=b/2, limit=R->inf, requires=[])",
        rigorOfBound: "≤",
        rigorOfLimit: "=",
        rigorIfNumericOnly: "≈",
      },
      {
        piece: "left",
        lemma: "L1",
        sideCondition: "the same bound: Re(−z²+ibz) = −R² + y² − by at both x = ±R",
        discharge: "symbolic:mlBound(piece=left, M=exp(-R^2), L=b/2, limit=R->inf, requires=[])",
        rigorOfBound: "≤",
        rigorOfLimit: "=",
        rigorIfNumericOnly: "≈",
      },
    ],
    residueSelection: { rule: "inside", set: "the rectangle — EMPTY, f is entire" },
    closedForm: { expr: "-knownValue(top)", simplified: "sqrt(pi)*exp(-b^2/4)" },
    rigor: { policy: "min", inputs: [] },
    traps: [
      {
        id: "contour-method-implies-residues",
        detect: "engine:requiresNonEmpty(residues)",
        message: "an empty residue sum is 0, and 0 is the number that closes this argument",
      },
    ],
    golden: [
      {
        params: { b: 1.7 },
        value: "sqrt(pi)*exp(-b^2/4)",
        numeric: 0.86059173957255597,
        verifiedTo: 5.2e-16,
        method: "1200-panel × 32-pt Gauss–Legendre on [−12,12]",
      },
      {
        params: { b: 1 },
        value: "sqrt(pi)*exp(-1/4)",
        numeric: 1.3803884470431429,
        verifiedTo: 6.4e-16,
        method: "same",
      },
    ],
  };
}
