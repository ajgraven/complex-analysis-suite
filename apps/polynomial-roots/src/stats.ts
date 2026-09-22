// The statistics panel's numbers, and the sentences that keep them honest.
//
// Two counts, both from the sweep's own totals rather than from the picture: how many roots are REAL,
// and how many lie within `δ` of the unit circle. They are the numbers behind the two features a reader
// notices first — the bright line along the real axis and the haze at the circle — and they are worth
// stating because the picture alone cannot distinguish "denser here" from "brighter here after the tone
// map".
//
// Every figure carries the degree range it was counted over, because it is not a fact about the family:
// the real-root SHARE falls as the degree climbs (there are still O(log d) real roots among d), and a
// reader shown "0.4% real" without the degree would take it for a property of Littlewood polynomials.
import type { SweepStats } from "./engine/sweep.js";

/** The accumulated counts over every chunk of one job. */
export interface Totals {
  polynomials: number;
  roots: number;
  realRoots: number;
  nearCircle: number;
  nonConverged: number;
}

/** A fresh, empty accumulator. */
export function emptyTotals(): Totals {
  return { polynomials: 0, roots: 0, realRoots: 0, nearCircle: 0, nonConverged: 0 };
}

/** Fold one chunk's stats in. */
export function addStats(into: Totals, s: SweepStats): void {
  into.polynomials += s.polynomials;
  into.roots += s.roots;
  into.realRoots += s.realRoots;
  into.nearCircle += s.nearCircle;
  into.nonConverged += s.nonConverged;
}

/** A count and its share, formatted. */
export interface StatLine {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
}

/** Group digits so a nine-figure root count is readable. */
export function formatCount(n: number): string {
  const r = Math.round(n);
  return r.toLocaleString("en-US");
}

/** A share as a percentage, with enough figures to be useful when it is small. */
export function formatShare(part: number, whole: number): string {
  if (!(whole > 0)) return "—";
  const pct = (100 * part) / whole;
  if (pct === 0) return "0%";
  if (pct < 0.001) return `${pct.toExponential(1)}%`;
  if (pct < 1) return `${pct.toFixed(3)}%`;
  if (pct < 10) return `${pct.toFixed(2)}%`;
  return `${pct.toFixed(1)}%`;
}

/**
 * The panel's lines. `complete` says whether the sweep finished — a partial sweep's counts are of what
 * has been computed so far and must not read as the family's.
 */
export function statLines(
  totals: Totals,
  opts: { minDegree: number; maxDegree: number; circleDelta: number; complete: boolean },
): StatLine[] {
  const over = opts.minDegree === opts.maxDegree ? `degree ${opts.minDegree}` : `degrees ${opts.minDegree}–${opts.maxDegree}`;
  const qualifier = opts.complete ? over : `${over}, still computing`;
  const lines: StatLine[] = [
    {
      label: "Polynomials",
      value: formatCount(totals.polynomials),
      detail: `proper, over ${qualifier}`,
    },
    {
      label: "Roots",
      value: formatCount(totals.roots),
      detail: `found over ${qualifier}`,
    },
    {
      label: "Real roots",
      value: formatCount(totals.realRoots),
      detail: `${formatShare(totals.realRoots, totals.roots)} of them — the bright line on the axis`,
    },
    {
      label: `Within ${opts.circleDelta} of |z| = 1`,
      value: formatCount(totals.nearCircle),
      detail: `${formatShare(totals.nearCircle, totals.roots)} of them — the haze at the circle`,
    },
  ];
  if (totals.nonConverged > 0) {
    // Never silent. A polynomial the solver could not certify contributes no roots to the picture, and
    // the reader is told rather than left to wonder why the counts do not multiply out.
    lines.push({
      label: "Not solved",
      value: formatCount(totals.nonConverged),
      detail: "polynomials whose roots could not be certified; they are not drawn",
    });
  }
  return lines;
}

/** The one-sentence summary the stage's accessible description ends with. */
export function describeTotals(totals: Totals, opts: { minDegree: number; maxDegree: number }): string {
  if (totals.roots === 0) return "No roots have been computed yet.";
  const over =
    opts.minDegree === opts.maxDegree ? `degree ${opts.minDegree}` : `degrees ${opts.minDegree} to ${opts.maxDegree}`;
  return `${formatCount(totals.roots)} roots of ${formatCount(totals.polynomials)} polynomials over ${over}, of which ${formatShare(totals.realRoots, totals.roots)} are real.`;
}
