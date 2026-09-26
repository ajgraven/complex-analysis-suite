// Running a loop: the word → an exact polyline of aⱼ values → `@cas/monodromy`'s certified tracker →
// the permutation of the roots, in their LABELS. The tracker proves; this module only prepares its
// input, names a refusal in the reader's terms (which branch point it ran into), and carries the labels
// across so the roots on screen trade colours exactly as the proof says they trade places.
import { gaussOfDoubles, type Gauss, type QiPoly } from "@cas/exact";
import {
  trackCoefficientPath,
  trackFamilyPath,
  type Perm,
  type Solver,
  type TrackEvidence,
} from "@cas/monodromy";
import type { Polynomial } from "../polynomial.js";
import type { Cx } from "../types.js";
import { solveRoots } from "../roots/solve.js";
import type { BranchPoints } from "../analysis/discriminant.js";
import { loopPath, segmentDistance, type Loop, type LoopContext } from "./loop.js";

export type LoopRun =
  | {
      readonly ok: true;
      /** σ on root INDICES: the root at index i ends where index σ[i]'s root started. */
      readonly perm: Perm;
      /** σ on LABELS, 0-based: the root labelled L+1 ends where label σ[L]+1 started. */
      readonly labelPerm: Perm;
      /** The labels after the loop: position k now holds the root that arrived there. */
      readonly labelsAfter: readonly number[];
      /** The aⱼ polyline travelled. */
      readonly path: readonly Cx[];
      /** Per root index, its certified continuation. */
      readonly paths: readonly (readonly Cx[])[];
      readonly evidence: TrackEvidence;
    }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly path: readonly Cx[] | null;
      readonly paths: readonly (readonly Cx[])[];
    };

/** The branch points and radii a loop is built round, from PRA-2's analysis of aⱼ. */
export function loopContext(
  p: Polynomial,
  j: number,
  branch: BranchPoints | null,
): LoopContext {
  const points = branch?.points ?? [];
  const radii = points.map((z, i) => {
    if (!branch || branch.route !== "exact") return 0;
    const rep = branch.discs[i];
    if (!rep.ok) return 0;
    const d = rep.discs.find((x) => x.centre[0] === z[0] && x.centre[1] === z[1]);
    return d?.radius ?? 0;
  });
  return { coefficient: j, base: p.coeffs[j], branchPoints: points, branchRadii: radii };
}

const solve: Solver = (coeffs, _exact, seeds) => solveRoots(coeffs, seeds).roots;

function exactCoeffs(p: Polynomial): Gauss[] {
  const ex: QiPoly | null = p.exact;
  return ex
    ? Array.from({ length: p.degree + 1 }, (_, k) => ex.coeff(k))
    : p.coeffs.map(([x, y]) => gaussOfDoubles(x, y));
}

export function runLoop(p: Polynomial, loop: Loop, ctx: LoopContext): LoopRun {
  const j = ctx.coefficient;
  if (!ctx.family && j >= p.degree)
    return {
      ok: false,
      reason: `the leading coefficient a${j} is held fixed along a loop`,
      path: null,
      paths: [],
    };
  const built = loopPath(loop, ctx);
  if (!built.ok) return { ok: false, reason: built.reason, path: null, paths: [] };
  const coeffs = exactCoeffs(p);
  const last = built.path.length - 1;
  // The ends are aⱼ itself (or the family's base point), EXACTLY — in ℚ mode it need not be a double;
  // the vertices between are the doubles drawn, which are exact dyadic rationals.
  const fam = ctx.family;
  const start = fam ? fam.base : coeffs[j];
  const path = built.path.map((z, i) =>
    i === 0 || i === last ? start : gaussOfDoubles(z[0], z[1]),
  );
  const r = fam
    ? trackFamilyPath({ family: fam.grid, path, roots: p.roots, solve, name: "t" })
    : trackCoefficientPath({ coeffs, coefficient: j, path, roots: p.roots, solve });
  if (!r.ok) {
    let reason = r.reason;
    if (r.at && ctx.branchPoints.length) {
      const [a, b] = r.at;
      let best = 0;
      let bestD = Infinity;
      ctx.branchPoints.forEach((q, i) => {
        const d = segmentDistance(q, a, b);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      reason = `${reason} (branch point #${best + 1} is ${bestD.toPrecision(2)} away)`;
    }
    return { ok: false, reason, path: built.path, paths: r.paths };
  }
  const perm = r.perm ?? p.roots.map((_, i) => i);
  const L = p.labels;
  const labelPerm = new Array<number>(p.degree);
  perm.forEach((k, i) => (labelPerm[L[i] - 1] = L[k] - 1));
  const labelsAfter = new Array<number>(p.degree);
  perm.forEach((k, i) => (labelsAfter[k] = L[i]));
  return {
    ok: true,
    perm,
    labelPerm,
    labelsAfter,
    path: built.path,
    paths: r.paths,
    evidence: r.evidence,
  };
}
