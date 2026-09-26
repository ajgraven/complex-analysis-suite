// Naming the group, per irreducible factor, in the tier its degree and its evidence allow (DESIGN §3):
//   • Sₙ / Aₙ named by the theorem on the cycle types (tier0.ts) — exact at ANY degree;
//   • otherwise degree ≤ 7: Stauduhar's descent (descent.ts) — exact, and LABELLED on the roots;
//   • otherwise degree 8–15: the candidates the cycle types allow, ranked (tier2.ts) — an estimate;
//   • past 15: nothing is named.
// Plain data only: this runs in the worker, and certify.ts makes the labels on the main thread.
import type { ZPoly } from "@cas/exact";
import { solveRoots } from "../roots/solve.js";
import { identify, type DescentStep } from "./descent.js";
import {
  EXACT_MAX_DEGREE,
  TABLE_MAX_DEGREE,
  alternatingGroup,
  symmetricGroup,
  type TransitiveGroup,
} from "./tables.js";
import { rankCandidates, type Candidate } from "./tier2.js";

type Cx = readonly [number, number];

export type Identification =
  | {
      readonly tier: 1;
      readonly label: string;
      readonly name: string;
      readonly order: number;
      readonly even: boolean;
      readonly solvable: boolean;
      /** How it was named: by the theorem on the cycle types, or by the descent. */
      readonly by: "theorem" | "descent";
      /** Generators as permutations of the factor's roots, in the order they were given (0-based). */
      readonly generators: readonly (readonly number[])[];
      /** The roots were the plotted ones, and each plotted root's own disc holds the root it names. */
      readonly labelsHold: boolean;
      readonly steps: readonly DescentStep[];
      /** The last resolvent's integer root, and the transformation it was read through. */
      readonly witness: {
        readonly root: string;
        readonly transform: readonly number[];
      } | null;
      readonly bits: number;
    }
  | {
      readonly tier: 2;
      readonly candidates: readonly Candidate[];
      readonly primesUsed: number;
    }
  | { readonly tier: 0; readonly reason: string };

/** The monic transform F(y) = lcⁿ⁻¹·f(y/lc): same splitting field, integer roots lc·xᵢ. */
export function monicTransform(f: ZPoly): bigint[] {
  const n = f.length - 1;
  const lc = f[n];
  return f.map((c, k) => (k === n ? 1n : c * lc ** BigInt(n - 1 - k)));
}

function named(
  g: TransitiveGroup,
  by: "theorem" | "descent",
  rest: Pick<
    Extract<Identification, { tier: 1 }>,
    "generators" | "labelsHold" | "steps" | "witness" | "bits"
  >,
): Identification {
  return {
    tier: 1,
    label: g.label,
    name: g.name,
    order: g.order,
    even: g.even,
    solvable: g.solvable,
    by,
    ...rest,
  };
}

export function identifyFactor(
  f: ZPoly,
  evidence: {
    readonly verdict: "S" | "A" | "open";
    readonly discSquare: boolean;
    readonly cycleTypes: readonly {
      readonly type: readonly number[];
      readonly count: number;
    }[];
  },
  /** The reader's roots of f, in label order, when f is the whole polynomial. */
  plotted: readonly Cx[] | null,
): Identification {
  const n = f.length - 1;
  if (evidence.verdict !== "open" && n <= TABLE_MAX_DEGREE) {
    const g = evidence.verdict === "S" ? symmetricGroup(n) : alternatingGroup(n);
    // Sₙ and Aₙ are normal in Sₙ: any numbering of the roots carries the same group.
    if (g)
      return named(g, "theorem", {
        generators: g.generators,
        labelsHold: true,
        steps: [],
        witness: null,
        bits: 0,
      });
  }
  if (evidence.verdict !== "open")
    return { tier: 0, reason: `the table stops at degree ${TABLE_MAX_DEGREE}` };
  if (n <= EXACT_MAX_DEGREE) {
    const F = monicTransform(f);
    const lc = Number(f[n]);
    const approx: Cx[] =
      plotted && plotted.length === n
        ? plotted.map(([x, y]) => [lc * x, lc * y])
        : solveRoots(F.map((c) => [Number(c), 0] as [number, number])).roots;
    const r = identify(F, approx, evidence.discSquare);
    if (!r.ok) return { tier: 0, reason: r.reason };
    return named(r.group, "descent", {
      generators: r.generators,
      labelsHold: plotted !== null && r.labelsHold,
      steps: r.steps,
      witness: r.witness
        ? { root: r.witness.root, transform: r.witness.transform }
        : null,
      bits: r.bits,
    });
  }
  if (n <= TABLE_MAX_DEGREE) {
    const t = rankCandidates(n, evidence.cycleTypes, evidence.discSquare);
    return { tier: 2, candidates: t.candidates, primesUsed: t.primesUsed };
  }
  return { tier: 0, reason: `no table of the groups of degree ${n} is carried` };
}
