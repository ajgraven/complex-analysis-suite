// The roots' inclusion discs, certified (DESIGN §3 Roots card, §4.1 step 2).
//
// Smith's theorem, in exact arithmetic, on the very numbers on screen: the coefficients as they are
// (the exact layer in ℚ mode, the dyadic doubles otherwise) and the root approximations as the
// dyadic doubles they are. What it certifies is therefore a statement about THE POLYNOMIAL SHOWN —
// "exactly k roots of p in this component" — and it is `=` without any error analysis of the solve.
import { gaussOfDoubles, smithDiscs, type Frac, type SmithDisc } from "@cas/exact";
import type { Cx, Polynomial } from "../polynomial.js";

export interface RootDisc {
  readonly centre: Cx;
  /** The squared radius, exactly (reduced on first read — see `SmithDisc.radiusSq`). */
  readonly radiusSq: Frac;
  /** A double ≥ the radius, for drawing. */
  readonly radius: number;
  readonly component: number;
  /** Roots of p (with multiplicity) in this disc's component — Smith's count, exact. */
  readonly count: number;
  /** The certificate itself, for exact tests (membership, disjointness) without reducing anything. */
  readonly smith: SmithDisc;
}

export type DiscReport =
  | {
      readonly ok: true;
      readonly discs: readonly RootDisc[];
      readonly components: number;
    }
  | { readonly ok: false; readonly reason: string };

function toDisc(d: SmithDisc, centre: Cx): RootDisc {
  return {
    centre,
    get radiusSq(): Frac {
      return d.radiusSq;
    },
    radius: d.radiusUpper(),
    component: d.component,
    count: d.count,
    smith: d,
  };
}

/** Smith's discs for `p`'s coefficients about approximations `roots` (one per root). */
export function discsFor(
  coeffs: readonly Cx[],
  exactCoeffs: readonly import("@cas/exact").Gauss[] | null,
  roots: readonly Cx[],
): DiscReport {
  if (!roots.every((r) => Number.isFinite(r[0]) && Number.isFinite(r[1]))) {
    return {
      ok: false,
      reason:
        "the root solve did not return finite approximations, so no disc is claimed",
    };
  }
  const c = exactCoeffs ?? coeffs.map(([re, im]) => gaussOfDoubles(re, im));
  const res = smithDiscs(
    c,
    roots.map(([re, im]) => gaussOfDoubles(re, im)),
  );
  if (!res.ok) return res;
  return {
    ok: true,
    discs: res.discs.map((d, i) => toDisc(d, roots[i])),
    components: res.components,
  };
}

/** The discs about a polynomial's own roots, in its label order. */
export function rootDiscs(p: Polynomial): DiscReport {
  const exact = p.exact
    ? Array.from({ length: p.degree + 1 }, (_, k) =>
        (p.exact as NonNullable<typeof p.exact>).coeff(k),
      )
    : null;
  return discsFor(p.coeffs, exact, p.roots);
}

/**
 * A decimal string that is ≥ the true radius: three significant figures, rounded UP. The float
 * `radius` is within a few ulps of the exact rational bound; the relative bump covers that.
 */
export function formatRadiusUpper(radius: number): string {
  if (radius === 0) return "0";
  const v = radius * (1 + 1e-12);
  const m = 10 ** (Math.floor(Math.log10(v)) - 2);
  const up = Math.ceil(v / m) * m;
  return up.toPrecision(3);
}
