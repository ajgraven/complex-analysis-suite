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

/** The counts one degree contributes. */
export interface DegreeCounts {
  polynomials: number;
  roots: number;
  realRoots: number;
  nearCircle: number;
  nonConverged: number;
}

/**
 * The accumulated counts over every chunk of one job — in aggregate, and PER DEGREE.
 *
 * The aggregate is what the headline lines quote; the per-degree rows are what make the header's warning
 * visible rather than asserted. "0.4% real" over degrees 1–16 is a mixture dominated by the top degree,
 * and the share at each degree separately is the number that falls — which a single aggregate cannot
 * show and a reader cannot infer.
 */
export interface Totals extends DegreeCounts {
  readonly byDegree: Map<number, DegreeCounts>;
}

const zeroCounts = (): DegreeCounts => ({ polynomials: 0, roots: 0, realRoots: 0, nearCircle: 0, nonConverged: 0 });

/** A fresh, empty accumulator. */
export function emptyTotals(): Totals {
  return { ...zeroCounts(), byDegree: new Map() };
}

/**
 * The totals restricted to the degrees `keep` admits, rebuilt from the per-degree rows — what the
 * incremental scrub keeps when it drops the degrees outside the new range, so the aggregate stays the
 * exact sum of the rows it is shown beside.
 */
export function totalsFor(totals: Totals, keep: (degree: number) => boolean): Totals {
  const out = emptyTotals();
  for (const [degree, row] of totals.byDegree) {
    if (!keep(degree)) continue;
    addStats(out, row, degree);
  }
  return out;
}

/** Fold one chunk's stats in, under the degree it was swept at when that is known. */
export function addStats(into: Totals, s: SweepStats, degree?: number): void {
  const targets: DegreeCounts[] = [into];
  if (degree !== undefined) {
    let row = into.byDegree.get(degree);
    if (row === undefined) {
      row = zeroCounts();
      into.byDegree.set(degree, row);
    }
    targets.push(row);
  }
  for (const t of targets) {
    t.polynomials += s.polynomials;
    t.roots += s.roots;
    t.realRoots += s.realRoots;
    t.nearCircle += s.nearCircle;
    t.nonConverged += s.nonConverged;
  }
}

/** One row of the per-degree table: the degree, its counts, and the two shares as display strings. */
export interface DegreeRow {
  readonly degree: number;
  readonly polynomials: string;
  readonly realShare: string;
  readonly circleShare: string;
  /** Mean real roots per polynomial — the quantity with a published asymptotic, unlike the share. */
  readonly realPerPolynomial: string;
}

/** The per-degree table, ascending by degree, for the degrees that have reported anything. */
export function degreeRows(totals: Totals): DegreeRow[] {
  return [...totals.byDegree.entries()]
    .sort(([a], [b]) => a - b)
    .filter(([, c]) => c.roots > 0)
    .map(([degree, c]) => ({
      degree,
      polynomials: formatCount(c.polynomials),
      realShare: formatShare(c.realRoots, c.roots),
      circleShare: formatShare(c.nearCircle, c.roots),
      realPerPolynomial: (c.realRoots / Math.max(1, c.polynomials - c.nonConverged)).toFixed(3),
    }));
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

/** What a limit-set frame turned out to contain, counted from the frame itself. */
export interface LimitShares {
  /** Texels in the frame. */
  readonly total: number;
  /** Texels whose walk reached the cap: the depth-`D` approximation of the limit set. */
  readonly inSet: number;
  /** Texels walked to the end, where no series over the alphabet can vanish. */
  readonly escaped: number;
  /** Texels inside the excluded band. */
  readonly excluded: number;
  /** Texels whose walk ran out of nodes. */
  readonly exhausted: number;
}

/**
 * Count what a limit-set frame holds, from the stage's own read-back.
 *
 * **This exists because a frame with NOTHING in the set does not look empty.** The tone map equalises
 * the escape depth over the occupied texels, so a window that misses the limit set entirely — and there
 * are many, since the set is thin away from the unit circle — has its one or two escape levels stretched
 * across the whole ramp and comes out as a full, evenly-coloured picture. Measured at the dragon:
 * `0.372 − 0.542i` at half-height 1e-3 and below is 0% in the set at depth 16, 24, 34 and 48 alike, and
 * the frame was painted in two bright colours. The picture cannot say this; the panel can.
 */
export function measureLimit(reach: ArrayLike<number>, depth: number): LimitShares {
  let inSet = 0;
  let escaped = 0;
  let excluded = 0;
  let exhausted = 0;
  for (let i = 0; i < reach.length; i++) {
    const v = reach[i];
    if (v < -1.5) exhausted++;
    else if (v < -0.5) excluded++;
    else if (v >= depth + 1) inSet++;
    else escaped++;
  }
  return { total: reach.length, inSet, escaped, excluded, exhausted };
}

/** What the limit-set engine is showing, for the panel and the accessible description. */
export interface LimitSummary {
  readonly alphabet: string;
  /** The walk's depth cap. */
  readonly depth: number;
  /** Foster's fudge at the view centre, in the units of `|P(z)|`. */
  readonly eps: number;
  /** The excluded band is being walked. */
  readonly annulus: boolean;
  /** Why this engine is drawing (the handover's own sentence). */
  readonly reason: string;
  /** What the last frame held, once there has been one. */
  readonly shares?: LimitShares;
}

/**
 * The panel's lines under the limit-set engine.
 *
 * There are no counts here and there should not be: this engine draws a SET, not a sample of one, so
 * every number it can honestly report is about the approximation rather than about the family. What it
 * owes the reader is the depth, the fudge and the band policy — the three things that decide which
 * picture of the limit set is on screen.
 */
export function limitLines(s: LimitSummary): StatLine[] {
  const walked = s.shares === undefined ? 0 : s.shares.inSet + s.shares.escaped;
  const lines: StatLine[] = [];
  if (s.shares !== undefined) {
    lines.push({
      label: "In the set",
      value: walked === 0 ? "—" : formatShare(s.shares.inSet, walked),
      detail:
        walked === 0
          ? "no texel in this view was walked — it is all inside the excluded band"
          : s.shares.inSet === 0
            ? `NOTHING in this view survives to depth ${s.depth}: the limit set is thin here, so the picture is the escape depth alone`
            : `of the ${formatCount(walked)} texels walked; the rest escaped, and are shaded by how deep they got`,
    });
  }
  return [
    ...lines,
    {
      label: "Depth",
      value: String(s.depth),
      detail: "coefficients a₀ … a_D; a point is drawn by how deep its tree survived",
    },
    {
      label: "ε at the centre",
      value: s.eps.toExponential(2),
      detail: "a polynomial with a root inside one texel has |P(z)| no larger than this",
    },
    {
      label: "Band |z| ≈ 1",
      value: s.annulus ? "walked" : "not walked",
      detail: s.annulus
        ? "under the node budget; a texel that runs out is painted its own neutral"
        : "0.8 < |z| < 1.25 is left to the root engine, and painted a neutral rather than black",
    },
  ];
}

/** The one-sentence summary of a limit-set frame. */
export function describeLimit(s: LimitSummary): string {
  const walked = s.shares === undefined ? 0 : s.shares.inSet + s.shares.escaped;
  const held =
    s.shares === undefined || walked === 0
      ? ""
      : s.shares.inSet === 0
        ? ` No point in this view survives to depth ${s.depth}, so the limit set does not reach it and what is drawn is the escape depth alone.`
        : ` ${formatShare(s.shares.inSet, walked)} of the walked area is in it.`;
  return `The limit set of ${s.alphabet} to depth ${s.depth}: the points at which a power series over the alphabet can vanish, shaded by how deep the search survived.${held} ${s.reason}`;
}

/** What the deep engine drew, for the panel and the accessible description. */
export interface DeepSummary {
  readonly alphabet: string;
  /** Polynomials with a root in the view. */
  readonly count: number;
  /** Distinct POINTS among them — see `ReferenceFrame.distinct`. */
  readonly distinct: number;
  readonly degreeMin: number;
  readonly degreeMax: number;
  /** The walk's depth cap. */
  readonly depth: number;
  readonly nodes: number;
  /** The node budget ran out, so the list is partial. */
  readonly exhausted: boolean;
  readonly precision: "float64" | "dd";
  /** The worst residual in the frame — the certificate for the whole picture. */
  readonly residual: number;
  readonly halfHeight: number;
  readonly reason: string;
  readonly error?: string;
}

/**
 * The panel's lines under the deep engine.
 *
 * There is no density to report and no set: this engine draws a FINITE LIST of roots, each solved and
 * each carrying its own residual. So what it owes the reader is how many there are, what degrees they
 * came from, and — the line that matters — the worst residual, which is the only honest statement about
 * how well the arithmetic held at this depth.
 */
export function deepLines(s: DeepSummary): StatLine[] {
  const lines: StatLine[] = [
    {
      label: "Roots here",
      value: formatCount(s.count),
      detail:
        s.count === 0
          ? "no polynomial over this alphabet has a root in this view"
          : `polynomials of degree ${s.degreeMin}–${s.degreeMax}, on ${formatCount(s.distinct)} distinct points — if P is Littlewood with a root here, so is P·(1 + z^(d+1))`,
    },
    {
      label: "Arithmetic",
      value: s.precision === "dd" ? "double-double" : "float64",
      detail:
        s.precision === "dd"
          ? "a pair of doubles, ~106 bits — what a view below 10⁻¹¹ needs"
          : "53 bits, which places every view above about 10⁻¹¹",
    },
    {
      label: "Worst residual",
      value: s.count === 0 ? "—" : s.residual.toExponential(2),
      detail: "|P(α)| / Σ|a_k||α|^k over every root drawn — the certificate, not the hope",
    },
  ];
  if (s.exhausted) {
    lines.push({
      label: "Not finished",
      value: formatCount(s.nodes),
      detail: "nodes before the budget ran out; this list is PARTIAL and the picture is missing roots",
    });
  }
  return lines;
}

/** The one-sentence summary of a deep frame. */
export function describeDeep(s: DeepSummary): string {
  if (s.error !== undefined) return `The deep walk could not run: ${s.error}`;
  if (s.count === 0) {
    return `No polynomial over ${s.alphabet} has a root within ${s.halfHeight.toExponential(1)} of this centre. ${s.reason}`;
  }
  return `${formatCount(s.count)} roots of ${s.alphabet} polynomials of degree ${s.degreeMin} to ${s.degreeMax}, on ${formatCount(s.distinct)} distinct points, each solved from one walk at the view centre in ${s.precision === "dd" ? "double-double" : "float64"} and drawn as an offset from it, to a worst residual of ${s.residual.toExponential(2)}. ${s.reason}`;
}

/**
 * The Egan hue's legend: what the colour reads, how many classes that is, and — for the flagship
 * alphabet, where it was measured — where it means something.
 *
 * The measured sentence is Littlewood's alone and says so: coherence depends on `max|a|` and on the
 * alphabet's shape through the tail bound, and a number measured on one alphabet quoted under another is
 * exactly the kind of `≈` that stops being honest. Under the other engines the sentence says the hue is
 * not being drawn, because the colour control still reads "Egan's hue" there.
 */
export function eganNote(
  alphabet: { readonly id?: string; readonly spec: { readonly preset: string }; readonly leading: readonly number[]; readonly values: readonly unknown[] },
  state: { readonly hueDigits: number },
  engine: "roots" | "limit" | "deep",
): string {
  if (engine !== "roots") {
    return `Egan's hue colours the root cloud only. This view is drawn by the ${engine === "limit" ? "limit-set walk" : "deep engine"}, coloured by density.`;
  }
  const k = state.hueDigits;
  const classes = alphabet.leading.length * Math.pow(alphabet.values.length, k);
  const which = k === 1 ? "the first coefficient" : `the first ${k} coefficients`;
  const head =
    `Each root is coloured by ${which} after the constant term of its own polynomial, scaled so the ` +
    `constant term is its representative — ${formatCount(classes)} hues, and polynomials sharing a longer prefix get closer ones. ` +
    `A pixel whose roots disagree is drawn toward grey in proportion.`;
  if (alphabet.spec.preset !== "littlewood") return head;
  return (
    `${head} ≈ Measured over every Littlewood polynomial of degree 12, three coefficients: pixels with |z| < 0.7 are 99% one hue, ` +
    `0.8–0.9 about half, and outside the unit circle about a third — there a root's position is decided by the polynomial's top ` +
    `coefficients, which this colouring does not read.`
  );
}
