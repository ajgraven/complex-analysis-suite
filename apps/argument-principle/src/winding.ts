// winding.ts — the tool's core instrument: the winding number of a closed sampled curve about a point.
//
// The argument principle says the winding number of the image curve f(γ) about the origin equals the
// number of zeros minus poles of f enclosed by γ. Here we compute that winding NUMERICALLY from a
// sampled polyline: accumulate the change in arg along the (closed) curve and divide by 2π. This is the
// right-hand side of the theorem; the left-hand side (counting located zeros/poles inside γ) arrives in
// Phase 2, and the whole point is that they agree.
//
// Honest labelling: the returned integer is an ESTIMATE (`≈`). It is exact when the curve is well
// resolved and stays clear of the target point, but is unreliable if the curve grazes it — hence
// `windingReliable`.
//
// This is app-local for now. Once the complex-function-plotter's `singularities.ts` (which carries the
// same winding idea over a small circle) becomes a co-consumer, this is the ADR-0007 second-consumer
// extraction candidate (plan §4, ADR-0020).

export type Vec2 = readonly [number, number];

function angleTo(p: Vec2, about: Vec2): number {
  return Math.atan2(p[1] - about[1], p[0] - about[0]);
}

/**
 * Net signed turns of the closed polyline `points` about `about`, as a real number (≈ an integer for a
 * clean loop). The list is treated as a CLOSED loop: the edge from the last point back to the first is
 * included. Returns 0 for fewer than 2 points.
 */
export function windingTurns(points: readonly Vec2[], about: Vec2 = [0, 0]): number {
  const n = points.length;
  if (n < 2) return 0;
  let total = 0;
  let prev = angleTo(points[n - 1], about); // start from the last point so the wrap edge is counted once
  for (let i = 0; i < n; i++) {
    const a = angleTo(points[i], about);
    let d = a - prev;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    total += d;
    prev = a;
  }
  return total / (2 * Math.PI);
}

/**
 * Turns accumulated from the START of the loop through fraction `upto` ∈ [0,1] of its segments — the
 * "argument swept so far" as a point traverses the curve. At `upto = 1` this equals {@link windingTurns}.
 */
export function partialWindingTurns(
  points: readonly Vec2[],
  upto: number,
  about: Vec2 = [0, 0],
): number {
  const n = points.length;
  if (n < 2) return 0;
  const wrap = (d: number): number => {
    let x = d;
    while (x > Math.PI) x -= 2 * Math.PI;
    while (x < -Math.PI) x += 2 * Math.PI;
    return x;
  };
  const x = Math.max(0, Math.min(1, upto)) * n;
  const whole = Math.floor(x); // number of complete edges swept
  const frac = x - whole; // fraction into the current edge
  let total = 0;
  let prev = angleTo(points[0], about);
  for (let i = 1; i <= whole; i++) {
    const a = angleTo(points[i % n], about);
    total += wrap(a - prev);
    prev = a;
  }
  // Interpolate the current edge so the sweep is continuous and reaches the FULL winding exactly at
  // upto = 1 (where whole = n covers every edge, including the closing one, and frac = 0).
  if (frac > 0 && whole < n) {
    const a = angleTo(points[(whole + 1) % n], about);
    total += wrap(a - prev) * frac;
  }
  return total / (2 * Math.PI);
}

/** The winding number (integer): {@link windingTurns} rounded to the nearest whole turn. */
export function windingNumber(points: readonly Vec2[], about: Vec2 = [0, 0]): number {
  const n = Math.round(windingTurns(points, about));
  return n === 0 ? 0 : n; // normalize -0 → 0
}

/**
 * Is the winding estimate trustworthy? Unreliable when the curve passes very close to `about` (relative
 * to its own extent) — the argument then swings wildly between samples and the accumulation aliases.
 */
export function windingReliable(points: readonly Vec2[], about: Vec2 = [0, 0]): boolean {
  if (points.length < 3) return false;
  let maxR = 0;
  let minR = Infinity;
  for (const p of points) {
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) return false;
    const r = Math.hypot(p[0] - about[0], p[1] - about[1]);
    if (r > maxR) maxR = r;
    if (r < minR) minR = r;
  }
  if (maxR === 0) return false;
  // The nearest approach must be a non-trivial fraction of the curve's scale.
  return minR > 1e-6 * maxR;
}
