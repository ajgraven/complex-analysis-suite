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
 *
 * The labelled denominator grows with zoom ({@link fareyMaxDenominator}) and at deep zoom the
 * visible bulbs are found by enumerating only the arc of internal angles the view covers
 * ({@link fareyLabels}), so ever-finer bulbs get named as you zoom into the cardioid — down to the
 * f64 precision wall — without an O(maxQ²) blow-up.
 */

import type { Vec2 } from "../arrays";

export interface FareyLabel {
  /** "p/q". */
  text: string;
  /** Numerator and denominator of the bulb's internal angle p/q (reduced). */
  p: number;
  q: number;
  /** Cardioid attachment point of the p/q bulb, in plot coordinates. */
  c: Vec2;
  /** Outward unit normal at the attachment (points into the bulb), plot coordinates. */
  normal: Vec2;
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
 * The largest bulb denominator worth labelling at this zoom. A p/q bulb has plot-diameter
 * ≈ 2/q² (calibrated to the period-2 disc: radius ¼ ⇒ diameter ½ = 2/2²), which spans
 * ≈ (2/q²)·(size·zoom/2) = size·zoom/q² pixels; the largest q whose bulb still spans `minPx`
 * pixels is √(size·zoom/minPx). This grows like √zoom — so ever-finer denominators keep
 * appearing as you zoom in, instead of the old fixed cap that stopped near q = 16. Clamped to
 * [4, cap]; the cap bounds the deep-zoom O(maxQ) enumeration (≈40 ms at the ceiling), and only
 * bites past zoom ≈ 2.5e9 — a microscopic view already near the f64 overlay-precision wall.
 */
export function fareyMaxDenominator(zoom: number, size: number, minPx = 14, cap = 300_000): number {
  const q = Math.sqrt((size * zoom) / minPx);
  return Math.max(4, Math.min(cap, Math.floor(q)));
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Main-cardioid boundary point c(θ) = μ/2 − μ²/4 for μ = e^{2πiθ} (bulbRoot without the normal). */
function cardioidPoint(theta: number): Vec2 {
  const t = 2 * Math.PI * theta;
  const mr = Math.cos(t);
  const mi = Math.sin(t);
  const m2r = mr * mr - mi * mi;
  const m2i = 2 * mr * mi;
  return [mr / 2 - m2r / 4, mi / 2 - m2i / 4];
}

/**
 * Internal angle θ ∈ [0,1) of the cardioid boundary point nearest `center`. Coarse scan (the
 * distance-to-a-convex-ish-curve has one basin per region) then a derivative-free ternary refine, so
 * it is robust even at the cusp where c′(0) = 0 would break a Newton step.
 */
function nearestCardioidTheta(center: Vec2): number {
  const dist2 = (th: number): number => {
    const c = cardioidPoint(th);
    const dx = c[0] - center[0];
    const dy = c[1] - center[1];
    return dx * dx + dy * dy;
  };
  const N = 512;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < N; i++) {
    const th = i / N;
    const d = dist2(th);
    if (d < bestD) {
      bestD = d;
      best = th;
    }
  }
  let lo = best - 1 / N;
  let hi = best + 1 / N;
  // Refine to ~f64 precision: at extreme zoom the view box is ~1e-10 wide, so an imprecise θ would
  // put the nearest boundary point just outside it and make the centred bulb wrongly vanish.
  for (let k = 0; k < 100; k++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (dist2(m1) < dist2(m2)) hi = m2;
    else lo = m1;
  }
  return (lo + hi) / 2;
}

// The near-cusp view genuinely holds ~√zoom bulbs; emit only the largest few hundred (collision
// culling keeps far fewer) so an overlay redraw stays cheap at any depth.
const MAX_LABELS = 400;
// Below this denominator the plain O(maxQ²) sweep is trivially fast and bullet-proof; only past it
// (deep zoom) do we switch to the visible-arc enumeration, where the window is a single narrow arc.
const BRUTE_MAX_Q = 200;

/**
 * Visible Farey labels p/q (0 < p < q ≤ maxQ, gcd(p,q)=1) whose attachment point lies within the
 * parameter-plane view (centre/zoom), returned largest-bulb-first (ascending q). The caller scales
 * maxQ with zoom ({@link fareyMaxDenominator}) and does pixel-space collision culling.
 *
 * For a whole-cardioid / moderate view (maxQ ≤ {@link BRUTE_MAX_Q}) it just sweeps every p/q. Past
 * that — deep zoom, where a from-root tree walk would cost O(√zoom) descending toward whatever low
 * rational the window sits near (the cusp being the worst) — it instead locates the visible arc of
 * internal angles directly and, per denominator q, tests only the O(1) integers p with p/q in that
 * arc. That is O(maxQ) cheap integer work plus trig on just the handful of candidates, so it stays a
 * few milliseconds even at zoom 1e10 and never makes the labels vanish near the cusp.
 */
export function fareyLabels(center: Vec2, zoom: number, maxQ = 8): FareyLabel[] {
  const half = 1 / zoom; // half the view span in plot units (the view spans 2/zoom)
  const R = half * 1.15;
  const cx = center[0];
  const cy = center[1];
  const inBox = (c: Vec2): boolean => Math.abs(c[0] - cx) <= R && Math.abs(c[1] - cy) <= R;

  const out: FareyLabel[] = [];
  const emit = (p: number, q: number): void => {
    const { c, normal } = bulbRoot(p, q);
    if (inBox(c)) out.push({ text: `${p}/${q}`, p, q, c, normal });
  };

  if (maxQ <= BRUTE_MAX_Q) {
    for (let q = 2; q <= maxQ; q++)
      for (let p = 1; p < q; p++) if (gcd(p, q) === 1) emit(p, q);
    out.sort((x, y) => x.q - y.q || x.p - y.p);
    return out;
  }

  // Deep zoom: enumerate only the arc of internal angles that the view actually covers.
  const theta = nearestCardioidTheta(center);
  if (!inBox(cardioidPoint(theta))) return out; // cardioid boundary never enters the view

  // Half-widths of the visible arc, θ ∈ [theta − loR, theta + hiR]. Walk each edge out to the box
  // boundary by bisection; for R small the arc is a single connected piece (the two cardioid branches
  // only meet at the cusp, through θ = 0, which stays one arc here), so a single crossing is found.
  const edge = (dir: 1 | -1): number => {
    if (inBox(cardioidPoint(theta + dir * 0.5))) return 0.5; // view spans a whole half-turn ⇒ wide
    let a = 0;
    let b = 0.5;
    for (let k = 0; k < 54; k++) {
      const m = (a + b) / 2;
      if (inBox(cardioidPoint(theta + dir * m))) a = m;
      else b = m;
    }
    return b;
  };
  const loR = edge(-1);
  const hiR = edge(1);

  for (let q = 2; q <= maxQ && out.length < MAX_LABELS; q++) {
    const pMin = Math.ceil(q * (theta - loR));
    // Cap the span to one full period so a near-whole-circle window can't emit a residue twice.
    const pMax = Math.min(Math.floor(q * (theta + hiR)), pMin + q - 1);
    for (let p = pMin; p <= pMax; p++) {
      const pr = ((p % q) + q) % q; // reduce onto (0, q); p may run negative past the cusp
      if (pr !== 0 && gcd(pr, q) === 1) emit(pr, q);
    }
  }
  out.sort((x, y) => x.q - y.q || x.p - y.p);
  return out;
}
