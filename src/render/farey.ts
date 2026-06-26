/**
 * Farey bulb labels for the Mandelbrot parameter plane. Each rational p/q in (0,1)
 * names a hyperbolic component attached to the main cardioid at the point where the
 * fixed-point multiplier equals e^{2πi·p/q}; that attachment point is
 *
 *     c(p/q) = μ/2 − μ²/4,   μ = e^{2πi·p/q},
 *
 * and the attached bulb has period q and internal rotation number p/q (so 1/2 sits at
 * the period-2 neck c = −3/4, 1/3 and 2/3 are the symmetric period-3 bulbs, …). This
 * module is pure (no DOM/GL) so it can be unit-tested; the overlay does the drawing.
 */

import type { Vec2 } from "../arrays";

export interface FareyLabel {
  /** "p/q". */
  text: string;
  /** Cardioid attachment point of the p/q bulb, in plot coordinates. */
  c: Vec2;
  /** Outward unit normal at the attachment (points into the bulb), plot coordinates. */
  normal: Vec2;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * Attachment point c = μ/2 − μ²/4 and the outward cardioid normal (∝ μ − μ², the
 * direction the boundary moves with the internal angle) for μ = e^{2πi·p/q}.
 */
export function bulbRoot(p: number, q: number): { c: Vec2; normal: Vec2 } {
  const t = (2 * Math.PI * p) / q;
  const mr = Math.cos(t);
  const mi = Math.sin(t);
  const m2r = mr * mr - mi * mi; // μ²
  const m2i = 2 * mr * mi;
  const c: Vec2 = [mr / 2 - m2r / 4, mi / 2 - m2i / 4];
  const nr = mr - m2r; // μ − μ² ∝ outward normal
  const ni = mi - m2i;
  const len = Math.hypot(nr, ni) || 1;
  return { c, normal: [nr / len, ni / len] };
}

/**
 * Visible Farey labels p/q (0 < p < q ≤ maxQ, gcd(p,q)=1) whose attachment point lies
 * within the parameter-plane view (centre/zoom). The caller scales maxQ with zoom and
 * does pixel-space collision culling.
 */
export function fareyLabels(center: Vec2, zoom: number, maxQ = 8): FareyLabel[] {
  const half = 1 / zoom; // half the view span in plot units (the view spans 2/zoom)
  const out: FareyLabel[] = [];
  for (let q = 2; q <= maxQ; q++) {
    for (let p = 1; p < q; p++) {
      if (gcd(p, q) !== 1) continue;
      const { c, normal } = bulbRoot(p, q);
      if (Math.abs(c[0] - center[0]) > half * 1.15 || Math.abs(c[1] - center[1]) > half * 1.15)
        continue;
      out.push({ text: `${p}/${q}`, c, normal });
    }
  }
  return out;
}
