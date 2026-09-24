// Everything the Analysis card and the stage's overlays show, from one polynomial — computed at commit
// in full, and during a drag without the two parts that cost a commit's budget rather than a frame's
// (the exact discriminant route and the pseudozero certificate).
import type { Polynomial } from "../polynomial.js";
import type { Cx } from "../types.js";
import type { DiscReport } from "../roots/discs.js";
import { criticalPoints, type CriticalReport } from "./critical.js";
import {
  branchPoints,
  branchPointsNumeric,
  exactDiscriminant,
  type BranchPoints,
} from "./discriminant.js";
import { pseudozeroRegions, type PseudozeroReport } from "./pseudozero.js";
import type { Gauss } from "@cas/exact";

export interface AnalysisOptions {
  /** The coefficient whose branch points are shown, or null. */
  readonly coefficient: number | null;
  /** log₁₀ ε of the pseudozero set, or null for none. */
  readonly pseudozero: number | null;
  /** The world square the certificate is made over (the root pane's view). */
  readonly range: readonly [number, number, number, number];
  /** A drag frame: skip what only a commit can afford. */
  readonly drag: boolean;
}

export interface Analysis {
  readonly critical: CriticalReport | null;
  /** disc(p), exactly, on an exact layer. */
  readonly discriminant: Gauss | null;
  /** disc(p) from the plotted roots — `aₙ^{2n−2}∏(rᵢ − rⱼ)²` — always, labelled ≈. */
  readonly discriminantApprox: Cx;
  readonly branch: BranchPoints | null;
  readonly pseudozero: PseudozeroReport | null;
}

function discFromRoots(p: Polynomial): Cx {
  let re = 1;
  let im = 0;
  const mul = (a: number, b: number): void => {
    const nr = re * a - im * b;
    im = re * b + im * a;
    re = nr;
  };
  for (let k = 0; k < 2 * p.degree - 2; k++) mul(p.lead[0], p.lead[1]);
  for (let i = 0; i < p.degree; i++)
    for (let j = i + 1; j < p.degree; j++) {
      const dx = p.roots[i][0] - p.roots[j][0];
      const dy = p.roots[i][1] - p.roots[j][1];
      mul(dx * dx - dy * dy, 2 * dx * dy);
    }
  const sign = ((p.degree * (p.degree - 1)) / 2) % 2 === 0 ? 1 : -1;
  return [sign * re, sign * im];
}

export function analyse(
  p: Polynomial,
  discs: DiscReport,
  opts: AnalysisOptions,
): Analysis {
  const j =
    opts.coefficient !== null && opts.coefficient <= p.degree ? opts.coefficient : null;
  let branch: BranchPoints | null = null;
  if (j !== null)
    branch =
      opts.drag || !p.exact
        ? { route: "numeric", points: branchPointsNumeric(p, j) }
        : branchPoints(p, j);
  return {
    critical: criticalPoints(p),
    discriminant: opts.drag ? null : exactDiscriminant(p),
    discriminantApprox: discFromRoots(p),
    branch,
    pseudozero:
      opts.drag || opts.pseudozero === null || !discs.ok
        ? null
        : pseudozeroRegions(p, discs.discs, 10 ** opts.pseudozero, opts.range),
  };
}
