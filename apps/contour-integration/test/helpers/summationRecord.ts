// A minimal tier-G record with REAL square geometry, shared by the tests that need to run one.
//
// Written out rather than spread from a loaded record because the first G record lands in M5.6c(3);
// until then this is the only way to drive `runFamily`/`solveFamily` down the summation route, and
// after it the synthetic one is still worth keeping — it varies the integrand freely, which a
// gallery record must not.
import { squareTemplate } from "../../src/engine/contour/templates.js";
import type { Family, FamilyPiece } from "../../src/families/schema.js";

export interface SquareOptions {
  /** The target's range — `("-inf", "inf")` two-sided, `("1", "inf")` one-sided. */
  readonly lower?: string;
  readonly upper?: string;
  readonly terms?: string;
  readonly weight?: 1 | 2;
  /** Omit the declaration entirely, to exercise the sandbox-shaped case. */
  readonly noTargetTerms?: boolean;
}

export function summationRecord(integrand: string, over: SquareOptions = {}): Family {
  const pieces: FamilyPiece[] = squareTemplate(2).pieces.map((piece) => ({
    id: piece.id,
    name: piece.name,
    geom: piece.geom,
    role: piece.role,
    colour: piece.colour,
    ...(piece.lemma === undefined ? {} : { lemma: piece.lemma }),
  }));
  return {
    id: "synthetic-square",
    title: "a square with the unknown inside the sum",
    titleLatex: "a square with the unknown inside the sum",
    taxonomySection: "Series by the residue theorem",
    tier: "G",
    description: {
      contour: "the squares $\\Gamma_N$",
      point: "A synthetic record: the unknown sits inside the residue sum rather than on a piece of the contour.",
      citations: [{ book: "Ahlfors", where: "Ch. 4 §5", text: "" }],
    },
    targets: [
      {
        id: "S",
        kind: "sum",
        variable: "n",
        lower: over.lower ?? "-inf",
        upper: over.upper ?? "inf",
        summand: "1/(n^2+a^2)",
        convergence: "absolute",
        symbols: {},
      },
    ],
    auxiliary: { integrand, relation: "Re", note: "the summation kernel times the cofactor" },
    parameters: [],
    hypotheses: [],
    contour: {
      template: "square",
      limitParams: [{ name: "N", to: "inf", through: "halfIntegers" }],
      pieces,
      orientation: "ccw",
      windings: [],
    },
    vanishingLemmas: pieces.map((piece) => ({
      piece: piece.id,
      lemma: "L2" as const,
      sideCondition: "|f| = O(1/|z|²) on the square",
      discharge: "8π·coth(π/2)·(N+½)·max|f| → 0",
      rigorOfBound: "≤" as const,
      rigorOfLimit: "=" as const,
      rigorIfNumericOnly: "≈" as const,
    })),
    residueSelection: {
      rule: "all",
      ...(over.noTargetTerms === true
        ? {}
        : {
            targetTerms: [
              { targetId: "S", terms: over.terms ?? "poles(K) ∩ Z", weight: over.weight ?? 1 },
            ],
          }),
    },
    closedForm: { expr: "(pi/a)*coth(pi*a)" },
    rigor: { policy: "min", inputs: [] },
    traps: [],
    golden: [
      {
        params: {},
        value: "(pi/a)*coth(pi*a)",
        numeric: 4.26473,
        verifiedTo: 1e-4,
        method: "direct summation of the series",
      },
    ],
  };
}
