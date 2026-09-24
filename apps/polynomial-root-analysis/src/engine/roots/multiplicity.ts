// Multiplicity: DECIDED in ℚ mode, estimated elsewhere, and never confused (DESIGN §3, §4.1 step 3).
//
// ℚ: Yun's squarefree decomposition of the exact polynomial gives factors f_m whose roots are exactly
// the roots of p of multiplicity m. Smith's discs on f_m ALONE then say how many distinct roots of
// multiplicity m lie in each component — both halves exact, so "a double root in this disc" is `=`.
//
// ℂ, ℝ: the float polynomial with a multiple root is a measure-zero event, so a tight cluster is
// reported as what Smith can prove — "exactly k roots in this component" — and "a root of
// multiplicity k" stays a `≈` reading of it, worded as a cluster.
import { Gauss, yunSquarefree } from "@cas/exact";
import type { Cx, Polynomial } from "../polynomial.js";
import { solveAndRefine } from "./solve.js";
import { discsFor, type DiscReport, type RootDisc } from "./discs.js";

export interface RootGroup {
  /** Indices into `p.roots` of the approximations this group accounts for. */
  readonly members: readonly number[];
  /** Roots of p in the group, counted with multiplicity. */
  readonly count: number;
  /** Multiplicity of each distinct root in the group. */
  readonly multiplicity: number;
  /** `true` in ℚ mode (Yun + Smith); `false` for a cluster read off Smith's count alone. */
  readonly exact: boolean;
  /** Distinct roots in the group: known exactly in ℚ mode, `null` when only the cluster is known. */
  readonly distinct: number | null;
  /** The discs that carry the claim (f_m's own in ℚ mode, p's otherwise). */
  readonly discs: readonly RootDisc[];
}

export type GroupReport =
  | { readonly ok: true; readonly groups: readonly RootGroup[] }
  | { readonly ok: false; readonly reason: string };

function byComponent(report: Extract<DiscReport, { ok: true }>): RootDisc[][] {
  const out: RootDisc[][] = Array.from({ length: report.components }, () => []);
  for (const d of report.discs) out[d.component].push(d);
  return out;
}

/** Group p's plotted roots by what can be said about their multiplicity. */
export function rootGroups(p: Polynomial, pDiscs: DiscReport): GroupReport {
  if (!pDiscs.ok) return pDiscs;

  if (p.exact === null) {
    const comps = byComponent(pDiscs);
    return {
      ok: true,
      groups: comps.map((discs, c) => {
        const members = pDiscs.discs.flatMap((d, i) => (d.component === c ? [i] : []));
        // A component of one disc holds exactly one root: a SIMPLE root, and that much is exact.
        const k = members.length;
        return {
          members,
          count: k,
          multiplicity: k,
          exact: k === 1,
          distinct: k === 1 ? 1 : null,
          discs,
        };
      }),
    };
  }

  const factors = yunSquarefree(p.exact);
  const groups: { discs: RootDisc[]; m: number; centres: Cx[] }[] = [];
  for (const { factor, multiplicity } of factors) {
    const coeffs: Cx[] = [];
    const exact: Gauss[] = [];
    for (let k = 0; k <= factor.degree(); k++) {
      exact.push(factor.coeff(k));
      coeffs.push(factor.coeff(k).toTuple());
    }
    const roots = solveAndRefine(coeffs, exact).roots; // f_m is squarefree by construction
    const rep = discsFor(coeffs, exact, roots);
    if (!rep.ok)
      return {
        ok: false,
        reason: `the factor of multiplicity ${multiplicity}: ${rep.reason}`,
      };
    for (const discs of byComponent(rep))
      groups.push({ discs, m: multiplicity, centres: discs.map((d) => d.centre) });
  }
  // Each plotted approximation is DRAWN with the group of the nearest distinct root. That assignment
  // is presentation, not a claim: the claim is the group's own discs.
  const members: number[][] = groups.map(() => []);
  p.roots.forEach((r, i) => {
    let best = 0;
    let bestD = Infinity;
    groups.forEach((g, gi) => {
      for (const c of g.centres) {
        const d = Math.hypot(c[0] - r[0], c[1] - r[1]);
        if (d < bestD) {
          bestD = d;
          best = gi;
        }
      }
    });
    members[best].push(i);
  });
  return {
    ok: true,
    groups: groups.map((g, gi) => ({
      members: members[gi],
      count: g.discs.length * g.m,
      multiplicity: g.m,
      exact: true,
      distinct: g.discs.length,
      discs: g.discs,
    })),
  };
}
