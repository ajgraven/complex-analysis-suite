// univalence.ts — honest detection of when the image of the disk FOLDS (roadmap 1.4).
//
// A conformal map is univalent (injective) on 𝔻 exactly when the picture is trustworthy: distinct
// disk points land on distinct image points. Two cheap, honest signals catch the common failures:
//   (1) an interior CRITICAL POINT φ′(z)=0 — the map folds locally there (e.g. z² at 0);
//   (2) the image BOUNDARY φ(∂𝔻) SELF-INTERSECTS — the image overlaps globally even where φ′≠0.
// Neither is a proof of (non-)univalence, so the UI labels the verdict "≈". Pure geometry → node-tested.
import type { Pt } from "../render/grid.js";

/** Orientation sign of the triple (a,b,c): >0 ccw, <0 cw, 0 collinear. */
function cross(a: Pt, b: Pt, c: Pt): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

/** Do open segments p1p2 and p3p4 properly cross (interiors intersect, shared endpoints don't count)? */
export function segmentsProperlyIntersect(p1: Pt, p2: Pt, p3: Pt, p4: Pt): boolean {
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);
  // Strict straddle on both sides ⇒ a proper crossing (collinear/touching cases are treated as no-cross,
  // so a shared vertex between consecutive segments never registers).
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/**
 * Does a polyline self-intersect? Consecutive segments (sharing a vertex) are skipped. When `closed`,
 * the polyline is treated as a loop (the wrap-around segment is included, and it is not tested against
 * its two neighbours). O(n²); callers downsample a dense curve first.
 */
export function polylineSelfIntersects(poly: readonly Pt[], closed = false): boolean {
  const n = poly.length;
  if (n < 4) return false;
  const segCount = closed ? n : n - 1;
  const at = (i: number): Pt => poly[i % n];
  for (let i = 0; i < segCount; i++) {
    const a1 = at(i);
    const a2 = at(i + 1);
    for (let j = i + 2; j < segCount; j++) {
      // Skip the pair that shares a vertex through the wrap-around (first vs last segment of a loop).
      if (closed && i === 0 && j === segCount - 1) continue;
      if (segmentsProperlyIntersect(a1, a2, at(j), at(j + 1))) return true;
    }
  }
  return false;
}

/** Evenly sample at most `max` points from a polyline (keeps the last point). */
export function downsample(poly: readonly Pt[], max: number): Pt[] {
  if (poly.length <= max) return poly.slice();
  if (max < 2) return max > 0 && poly.length ? [poly[poly.length - 1]] : []; // avoid step = n/0 → NaN indices
  const step = (poly.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => poly[Math.round(i * step)]);
}
