// The convex hull of the plotted roots, in EXACT arithmetic on their dyadic values, and the exact
// containment test Gauss–Lucas is checked with (PLAN §7 PRA-2 gate).
//
// Gauss–Lucas is a theorem about the TRUE roots and critical points. What this module decides is the
// same statement about the plotted approximations — a consistency check with no rounding in it, so a
// failure means the approximations are wrong, never that the orientation test was.
import { Frac, compareFrac, fracOfDouble } from "@cas/exact";
import type { Cx } from "../types.js";

type P = readonly [Frac, Frac];

const exact = ([x, y]: Cx): P => [fracOfDouble(x), fracOfDouble(y)];

/** Sign of the cross product (b − a) × (c − a): +1 left turn, −1 right, 0 collinear. Exact. */
function orient(a: P, b: P, c: P): number {
  const v = b[0]
    .sub(a[0])
    .mul(c[1].sub(a[1]))
    .sub(b[1].sub(a[1]).mul(c[0].sub(a[0])));
  return v.n > 0n ? 1 : v.n < 0n ? -1 : 0;
}

const cmp = (a: P, b: P): number => compareFrac(a[0], b[0]) || compareFrac(a[1], b[1]);

export interface Hull {
  /** Hull vertices counter-clockwise (a point, a segment, or a polygon), as doubles for drawing. */
  readonly vertices: readonly Cx[];
  readonly exactVertices: readonly P[];
}

/** Andrew's monotone chain with exact orientation; collinear points are dropped. */
export function convexHull(points: readonly Cx[]): Hull {
  const pts = [...new Map(points.map((p) => [`${p[0]},${p[1]}`, p])).values()]
    .map((p) => ({ p, e: exact(p) }))
    .sort((a, b) => cmp(a.e, b.e));
  if (pts.length <= 2)
    return { vertices: pts.map((q) => q.p), exactVertices: pts.map((q) => q.e) };
  const build = (list: typeof pts): typeof pts => {
    const out: typeof pts = [];
    for (const q of list) {
      while (
        out.length >= 2 &&
        orient(out[out.length - 2].e, out[out.length - 1].e, q.e) <= 0
      )
        out.pop();
      out.push(q);
    }
    return out;
  };
  const lower = build(pts);
  const upper = build([...pts].reverse());
  const ring = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  return { vertices: ring.map((q) => q.p), exactVertices: ring.map((q) => q.e) };
}

/** Is `z` in the CLOSED hull? Exact — including the degenerate point and segment hulls. */
export function inHull(h: Hull, z: Cx): boolean {
  const q = exact(z);
  const v = h.exactVertices;
  if (v.length === 0) return false;
  if (v.length === 1) return cmp(v[0], q) === 0;
  if (v.length === 2) {
    if (orient(v[0], v[1], q) !== 0) return false;
    const lo = cmp(v[0], v[1]) <= 0 ? v[0] : v[1];
    const hi = lo === v[0] ? v[1] : v[0];
    return cmp(lo, q) <= 0 && cmp(q, hi) <= 0;
  }
  for (let i = 0; i < v.length; i++)
    if (orient(v[i], v[(i + 1) % v.length], q) < 0) return false;
  return true;
}
