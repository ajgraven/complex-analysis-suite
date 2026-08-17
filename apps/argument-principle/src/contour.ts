// contour.ts — the contour γ: sampling and enclosure tests.
//
// P0 carries the default circle. Phase 1 makes it follow the cursor; Phase 2 adds a freehand path
// (`kind:"path"`) with a ray-cast point-in-polygon test. Kept pure (no DOM) so it is unit-tested and
// later liftable alongside the winding primitive.

import { pointInPolygon } from "@cas/core";

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
  // Clamp to a sane range so a hostile/garbled `resolution` (e.g. a crafted share-link) can never make
  // this allocate billions of points — a hard backstop beneath the view-state guard and the slider cap.
  const count = Math.min(20000, Math.max(3, Math.floor(n)));
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

// pointInPolygon (even-odd ray cast) is the shared @cas/core geometry primitive (ADR-0007),
// re-exported so `contourSamples` below and this module's consumers keep using it unchanged.
export { pointInPolygon };

// ---- unified contour (circle or freehand path) ----------------------------------------------------

/** A contour γ: a circle, or (freehand) a closed path of world-coordinate vertices. */
export interface ContourShape {
  readonly kind: string; // "circle" | "path"
  readonly centerRe: number;
  readonly centerIm: number;
  readonly radius: number;
  readonly points?: readonly Vec2[];
}

function isPath(c: ContourShape): c is ContourShape & { points: readonly Vec2[] } {
  return c.kind === "path" && Array.isArray(c.points) && c.points.length >= 3;
}

/** The closed sample loop for γ: the drawn vertices for a path, or `resolution` points for a circle. */
export function contourSamples(c: ContourShape, resolution: number): Vec2[] {
  if (isPath(c)) return c.points.map((p) => [p[0], p[1]] as Vec2);
  return sampleCircle({ centerRe: c.centerRe, centerIm: c.centerIm, radius: c.radius }, resolution);
}

/** Is `p` strictly inside γ? (polygon even–odd for a path; open disk for a circle). */
export function insideContour(p: Vec2, c: ContourShape): boolean {
  if (isPath(c)) return pointInPolygon(p, c.points);
  return pointInCircle(p, { centerRe: c.centerRe, centerIm: c.centerIm, radius: c.radius });
}

/** Axis-aligned bounding box of γ (for sizing the finder's search region). */
export function contourBBox(c: ContourShape): { minX: number; maxX: number; minY: number; maxY: number } {
  if (isPath(c)) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of c.points) {
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }
    return { minX, maxX, minY, maxY };
  }
  return {
    minX: c.centerRe - c.radius,
    maxX: c.centerRe + c.radius,
    minY: c.centerIm - c.radius,
    maxY: c.centerIm + c.radius,
  };
}

/** The world point at fraction `t` ∈ [0,1) of the way around γ (linear-interpolated along the loop). */
export function contourPointAt(c: ContourShape, t: number, resolution: number): Vec2 {
  const pts = contourSamples(c, resolution);
  const n = pts.length;
  if (n === 0) return [c.centerRe, c.centerIm];
  const f = (((t % 1) + 1) % 1) * n;
  const i = Math.floor(f);
  const frac = f - i;
  const a = pts[i % n];
  const b = pts[(i + 1) % n];
  return [a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac];
}

/** Signed area of a closed polygon (shoelace). Positive = counter-clockwise in world coords (y up). */
export function signedArea(points: readonly Vec2[]): number {
  let a = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const q = points[(i + 1) % n];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/**
 * Return `points` oriented counter-clockwise (positively), reversing a clockwise loop. The argument
 * principle — winding of f(γ) = zeros − poles — holds for a POSITIVELY oriented γ; a freehand contour
 * may be drawn either way (and screen-y is flipped from world-y), so we normalize it here.
 */
export function orientCCW(points: readonly Vec2[]): Vec2[] {
  const pts = points.map((p) => [p[0], p[1]] as Vec2);
  if (signedArea(pts) < 0) pts.reverse();
  return pts;
}

/** Centroid + mean radius of a drawn path (the circle to fall back to when the drawing is cleared). */
export function pathStats(points: readonly Vec2[]): { centerRe: number; centerIm: number; radius: number } {
  const n = points.length || 1;
  let sx = 0;
  let sy = 0;
  for (const p of points) {
    sx += p[0];
    sy += p[1];
  }
  const cx = sx / n;
  const cy = sy / n;
  let sr = 0;
  for (const p of points) sr += Math.hypot(p[0] - cx, p[1] - cy);
  return { centerRe: cx, centerIm: cy, radius: sr / n || 0.5 };
}
