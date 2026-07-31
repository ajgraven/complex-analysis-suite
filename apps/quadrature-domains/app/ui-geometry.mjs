// ui-geometry.mjs -- pure 2-D geometry helpers extracted from ui.mjs (refactor D — ui.mjs seam).
//
// A cheap O(N²) boundary self-intersection check used by the Direct-tab univalence preview
// (ui.mjs: `univalent: !boundarySelfIntersectsSimple(boundaryPts)`), plus the segment-intersection
// primitive it uses. Points are { re, im }. Pure (no DOM / state / QD). Extracted verbatim; the cheap
// check intentionally does NOT detect collinear overlap (strict-`>` CCW) — behavior pinned, not fixed.

// Cheap O(N²) self-intersection check — sufficient for the preview.
export function boundarySelfIntersectsSimple(pts) {
  const N = pts.length;
  if (N < 4) return false;
  for (let i = 0; i < N; i++) {
    const a1 = pts[i], a2 = pts[(i + 1) % N];
    for (let j = i + 2; j < N; j++) {
      if (j === N - 1 && i === 0) continue;
      const b1 = pts[j], b2 = pts[(j + 1) % N];
      if (segmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}
export function segmentsIntersect(p1, p2, p3, p4) {
  function ccw(a, b, c) {
    return (c.im - a.im) * (b.re - a.re) > (b.im - a.im) * (c.re - a.re);
  }
  return ccw(p1, p3, p4) !== ccw(p2, p3, p4) &&
         ccw(p1, p2, p3) !== ccw(p1, p2, p4);
}
