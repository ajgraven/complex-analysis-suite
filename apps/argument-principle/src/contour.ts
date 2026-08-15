// contour.ts — the contour γ: sampling and enclosure tests.
//
// P0 carries the default circle. Phase 1 makes it follow the cursor; Phase 2 adds a freehand path
// (`kind:"path"`) with a ray-cast point-in-polygon test. Kept pure (no DOM) so it is unit-tested and
// later liftable alongside the winding primitive.

export type Vec2 = readonly [number, number];

export interface Circle {
  readonly centerRe: number;
  readonly centerIm: number;
  readonly radius: number;
}

/**
 * Sample `n` points evenly around a circle, counter-clockwise from θ=0. The list is a CLOSED loop for
 * the winding accumulator — the first and last points are NOT duplicated (the wrap edge closes it).
 */
export function sampleCircle(circle: Circle, n: number): Vec2[] {
  const count = Math.max(3, Math.floor(n));
  const pts: Vec2[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const t = (2 * Math.PI * i) / count;
    pts[i] = [
      circle.centerRe + circle.radius * Math.cos(t),
      circle.centerIm + circle.radius * Math.sin(t),
    ];
  }
  return pts;
}

/** Is `p` strictly inside the circle? (Boundary counts as outside, so a root on γ is excluded.) */
export function pointInCircle(p: Vec2, circle: Circle): boolean {
  const dx = p[0] - circle.centerRe;
  const dy = p[1] - circle.centerIm;
  return dx * dx + dy * dy < circle.radius * circle.radius;
}

/**
 * Ray-cast point-in-polygon (even–odd rule) for the freehand contour (Phase 2). The polygon is the
 * closed loop through `poly` (last vertex connects back to the first).
 */
export function pointInPolygon(p: Vec2, poly: readonly Vec2[]): boolean {
  let inside = false;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i][0];
    const yi = poly[i][1];
    const xj = poly[j][0];
    const yj = poly[j][1];
    const crosses = yi > p[1] !== yj > p[1];
    if (crosses) {
      const xCross = ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi;
      if (p[0] < xCross) inside = !inside;
    }
  }
  return inside;
}
