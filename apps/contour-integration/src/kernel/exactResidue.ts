// Exact residues over ℚ(i).
//
// The Laurent expansion of `f = N/D` about a pole `a` of order `m` is a series quotient once the
// pole is shifted to the origin: `D(w + a) = wᵐ·G(w)` with `G(0) ≠ 0`, so
//
//     f(w + a) = w^{-m} · [ N(w + a) · G(w)^{-1} ]
//
// and `Res = ` the coefficient of `w^{m-1}` in that bracket. One Taylor shift, one series inverse,
// one convolution — and the **whole principal part** comes out of the same coefficients, free. The
// order-m derivative formula would differentiate a quotient m−1 times instead, which is symbolically
// explosive (research 03 §0.2 recommends the series route from m ≥ 3; this uses it at every m).
//
// Everything here refuses rather than guesses. A pole that is not a Gaussian rational gets no exact
// residue in this pass — its residue lives in an algebraic extension, and naming that honestly is
// M2's second half (PLAN.md §3.3's ladder). The numeric path still covers it, labelled `≈`.
import {
  Frac,
  Gauss,
  QiPoly,
  multiplicityAt,
  yunSquarefree,
  seriesFromPoly,
  seriesInverse,
  seriesMul,
  splitOrder,
} from "@cas/exact";
import { simplestRational } from "./exactRational.js";

export type Cx = readonly [re: number, im: number];

export interface ExactPole {
  readonly at: Gauss;
  readonly order: number;
  readonly residue: Gauss;
  /** The full principal part: coefficients of `(z−a)^{-m} … (z−a)^{-1}`, ascending in that order. */
  readonly principalPart: readonly Gauss[];
}

/** The floating value of an exact point. Mutable-tuple shaped to match `@cas/core`'s `ComplexTuple`,
 *  which is what the numeric side of the app passes around. */
export const gaussToCx = (g: Gauss): [number, number] => [g.re.toNumber(), g.im.toNumber()];

/**
 * Cancel the common factor of numerator and denominator, exactly.
 *
 * Its roots are the **removable** singularities: points where the numeric path can only say "the
 * numerator nearly vanishes here too, so this may not be a pole". Exactly, there is no "may".
 */
export function cancelCommon(num: QiPoly, den: QiPoly): {
  num: QiPoly;
  den: QiPoly;
  removable: QiPoly;
} {
  const g = num.gcd(den);
  if (g.degree() < 1) return { num, den, removable: QiPoly.int(1) };
  return { num: num.divExact(g), den: den.divExact(g), removable: g };
}

/**
 * A Gaussian-rational candidate for a numerically-located point, or null.
 *
 * `simplestRational` on each component, which recovers `1/2` from `0.5` and `0` from `0`. The
 * candidate is a *guess*; {@link exactPoleAt} only accepts it after evaluating the denominator there
 * in exact arithmetic. Guess-then-verify, never guess-then-report.
 */
export function rationalCandidate(z: Cx, tol = 1e-7): Gauss | null {
  const re = snap(z[0], tol);
  const im = snap(z[1], tol);
  if (re === null || im === null) return null;
  return new Gauss(re, im);
}

function snap(x: number, tol: number): Frac | null {
  // Round to a nearby short decimal first, so a root that came back as 0.9999999999998 is offered as
  // 1 rather than as its own 16-digit continued fraction.
  for (const digits of [0, 1, 2, 3, 4, 6, 9]) {
    const scale = 10 ** digits;
    const rounded = Math.round(x * scale) / scale;
    if (Math.abs(rounded - x) <= tol * Math.max(1, Math.abs(x))) return simplestRational(rounded);
  }
  return null;
}

/**
 * The exact residue of `num/den` at a **verified** Gaussian-rational pole, or null.
 *
 * Null means "this point is not an exactly-rational pole of f" — either the candidate is not a root
 * of the denominator at all, or it is a root of the numerator to at least the same order (a
 * removable singularity). Both are answers.
 */
export function exactPoleAt(num: QiPoly, den: QiPoly, a: Gauss): ExactPole | null {
  if (!den.eval(a).isZero()) return null;

  const m = multiplicityAt(den, a) - multiplicityAt(num, a);
  if (m <= 0) return null; // the numerator cancels it: removable, not a pole

  // Shift the pole to the origin, then strip wᵐ off the denominator.
  const shiftedNum = num.shift(a);
  const shiftedDen = den.shift(a);
  const { order: denOrder, rest: G } = splitOrder(shiftedDen);
  const { order: numOrder, rest: N } = num.isZero()
    ? { order: 0, rest: QiPoly.zero() }
    : splitOrder(shiftedNum);

  // f(w+a) = w^{numOrder − denOrder} · N(w)/G(w), so the pole order must be denOrder − numOrder.
  // Cross-checking it against the multiplicity count above is free, and a disagreement would mean
  // the shift and the division disagree about the same polynomial — a bug, not a hard input.
  if (denOrder - numOrder !== m) {
    throw new Error(
      `exactPoleAt: order mismatch (${denOrder} − ${numOrder} ≠ ${m}); the Taylor shift and the multiplicity count disagree`,
    );
  }

  const terms = m; // coefficients 0 … m−1 of N·G⁻¹ are the principal part
  const quotient = seriesMul(
    seriesFromPoly(N, terms),
    seriesInverse(seriesFromPoly(G, terms), terms),
    terms,
  );

  // The principal part's coefficients: c_{-m} … c_{-1} are quotient[0] … quotient[m−1].
  const principalPart = quotient.slice(0, m);
  return { at: a, order: m, residue: principalPart[m - 1] ?? Gauss.ZERO, principalPart };
}

export interface ExactResidueReport {
  /** Poles that are exactly Gaussian rational, with exact residues. */
  readonly poles: readonly ExactPole[];
  /** Degree of the denominator left after cancelling, i.e. how many poles there are with multiplicity. */
  readonly totalDegree: number;
  /** True when every pole of f was pinned exactly — the condition for an exact residue SUM. */
  readonly complete: boolean;
  /** Roots of the cancelled common factor: removable singularities, known exactly. */
  readonly removableDegree: number;
}

/** Locates the roots of a polynomial numerically. Injected so this module needs no root-finder. */
export type RootFinder = (p: QiPoly) => readonly Cx[];

/**
 * Pin as many poles as possible exactly, using numeric locations only as *candidates*.
 *
 * The roots are taken from **Yun's squarefree factors**, not from the denominator itself, and that
 * is not a refinement — it is what makes the high-multiplicity case work at all. An m-fold root is
 * ill-conditioned by its nature: perturbing the coefficients by ε moves it by ε^{1/m}, so
 * Durand–Kerner locates a 5-fold root to about 1e-3 and no amount of polishing helps. Yun's factors
 * have **simple** roots by construction, so the same root comes back to ~1e-14 there, and the
 * multiplicity comes from the decomposition rather than from clustering the scatter.
 *
 * `complete` is the field that matters: true only when the exactly-verified multiplicities account
 * for the whole denominator, and it is what lets a caller claim an exact residue sum. One unpinned
 * algebraic pole and the sum is no longer exact — the honest outcome, not a shortfall to paper over.
 */
export function exactResidues(
  num: QiPoly,
  den: QiPoly,
  findRoots: RootFinder,
): ExactResidueReport {
  const cancelled = cancelCommon(num, den);
  const poles: ExactPole[] = [];
  const seen: Gauss[] = [];
  let accounted = 0;

  for (const { factor } of yunSquarefree(cancelled.den)) {
    for (const z of findRoots(factor)) {
      const a = rationalCandidate(z);
      if (!a) continue;
      if (seen.some((s) => s.equals(a))) continue;
      if (!factor.eval(a).isZero()) continue; // the snap was wrong; reject rather than report
      const pole = exactPoleAt(cancelled.num, cancelled.den, a);
      if (!pole) continue;
      seen.push(a);
      poles.push(pole);
      accounted += multiplicityAt(cancelled.den, a);
    }
  }

  const totalDegree = cancelled.den.degree();
  return {
    poles,
    totalDegree,
    complete: totalDegree >= 0 && accounted === totalDegree,
    removableDegree: Math.max(0, cancelled.removable.degree()),
  };
}

/** Σ of the given residues, exactly. */
export function residueSum(poles: readonly { residue: Gauss }[]): Gauss {
  let acc = Gauss.ZERO;
  for (const p of poles) acc = acc.add(p.residue);
  return acc;
}

/** Σ n(γ,a)·Res(f,a), exactly, given exact winding numbers. */
export function weightedResidueSum(
  poles: readonly ExactPole[],
  windingOf: (a: Gauss) => number,
): Gauss {
  let acc = Gauss.ZERO;
  for (const p of poles) {
    const n = windingOf(p.at);
    if (n === 0) continue;
    acc = acc.add(p.residue.mul(new Gauss(Frac.of(BigInt(n)), Frac.ZERO)));
  }
  return acc;
}
