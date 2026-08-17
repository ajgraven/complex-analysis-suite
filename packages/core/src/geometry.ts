// geometry.ts — convention-neutral 2D geometry primitives shared across the suite.
//
// No pi / 2pi-i here (ADR-0006). A "point" is a plain [x, y] pair, independent of any complex
// type — apps pass their [re, im] tuples as points, but this module knows nothing about that.

/**
 * A 2D point as an `[x, y]` tuple. Declared `readonly` so both mutable `[number, number]`
 * callers (e.g. the apps' `[re, im]` tuples) and readonly ones pass without a cast.
 */
export type Point2 = readonly [number, number];

/**
 * Even-odd (crossing-number) ray-cast point-in-polygon test. Orientation-independent (the
 * winding parity is the same for a CW or CCW vertex list); `poly` is treated as a closed loop —
 * the last vertex connects back to the first.
 *
 * The `(yi > p[1]) !== (yj > p[1])` guard is what makes the `/(yj − yi)` division safe: it runs
 * only when the two endpoints of an edge straddle the horizontal test ray, and straddling forces
 * `yj !== yi`, so a horizontal edge never divides by zero. A point exactly on an edge or vertex is
 * classified per the standard test's implementation-defined boundary behavior; every consumer uses
 * this for interior/exterior classification, where the boundary is measure-zero.
 *
 * This is the single home for the even-odd test that `@cas/schwarz` (the prior blessed export),
 * `@cas/conformal`, the Riemann-map app, and the Argument-Principle app each carried a
 * byte-identical private copy of — consolidated here on the ADR-0007 second-consumer rule. (QD's
 * vanilla-JS `{re,im}` variant and its binned accelerator stay at the QD edge, ADR-0008.)
 */
export function pointInPolygon(p: Point2, poly: readonly Point2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const yi = poly[i][1];
    const xj = poly[j][0];
    const yj = poly[j][1];
    const hit = yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}
