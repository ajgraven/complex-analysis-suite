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
// extraction candidate (plan §4, ADR-0025).

export type Vec2 = readonly [number, number];

function angleTo(p: Vec2, about: Vec2): number {
  return Math.atan2(p[1] - about[1], p[0] - about[0]);
}

function wrapPi(d: number): number {
  let x = d;
  while (x > Math.PI) x -= 2 * Math.PI;
  while (x < -Math.PI) x += 2 * Math.PI;
  return x;
}

/**
 * The running net turns about `about` as a point traverses the CLOSED polyline from `points[0]`. Returns
 * an array of length `n + 1`: entry `k` is the turns accumulated after the first `k` edges, walking
 * `points[0] → points[1] → … → points[k]` (with the closing edge `points[n-1] → points[0]` as edge `n`).
 * So entry `0` is `0` and entry `n` is the full {@link windingTurns}. This is the one primitive the
 * winding readout, the traversal sweep, and the argument strip-chart all read from — sharing it keeps the
 * "argument swept so far" and the total winding from ever diverging. Returns `[0]` for fewer than 2 points.
 */
export function cumulativeArg(points: readonly Vec2[], about: Vec2 = [0, 0]): number[] {
  const n = points.length;
  if (n < 2) return [0];
  const out = new Array<number>(n + 1);
  out[0] = 0;
  let total = 0;
  let prev = angleTo(points[0], about);
  for (let i = 1; i <= n; i++) {
    const a = angleTo(points[i % n], about);
    total += wrapPi(a - prev);
    prev = a;
    out[i] = total / (2 * Math.PI);
  }
  return out;
}

/**
 * Net signed turns of the closed polyline `points` about `about`, as a real number (≈ an integer for a
 * clean loop). The list is treated as a CLOSED loop: the edge from the last point back to the first is
 * included. Returns 0 for fewer than 2 points.
 */
export function windingTurns(points: readonly Vec2[], about: Vec2 = [0, 0]): number {
  const c = cumulativeArg(points, about);
  return c[c.length - 1];
}

/**
 * Turns accumulated from the START of the loop through fraction `upto` ∈ [0,1] of its segments — the
 * "argument swept so far" as a point traverses the curve. At `upto = 1` this equals {@link windingTurns}
 * exactly (it reads the same {@link cumulativeArg} array's last entry). Linearly interpolates within the
 * current edge so the sweep is continuous.
 */
export function partialWindingTurns(
  points: readonly Vec2[],
  upto: number,
  about: Vec2 = [0, 0],
): number {
  const n = points.length;
  if (n < 2) return 0;
  const c = cumulativeArg(points, about); // length n + 1; c[n] is the full winding
  const x = Math.max(0, Math.min(1, upto)) * n;
  const whole = Math.floor(x); // number of complete edges swept
  if (whole >= n) return c[n];
  const frac = x - whole; // fraction into the current edge
  return c[whole] + (c[whole + 1] - c[whole]) * frac;
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

/**
 * Does the sampled image curve cross a BRANCH CUT — i.e. is f multivalued around this contour, so the
 * argument principle does not apply? Signature: the closed image polyline is **bounded** (all samples
 * finite, no magnitude blow-up) yet has a single **dominant jump** — one edge far longer than the rest and
 * a sizeable fraction of the curve's own extent. That is a genuine discontinuity (e.g. `sqrt`, `log`,
 * fractional powers jumping across the principal cut), distinct from a contour merely grazing a pole (which
 * blows the magnitude up — caught by {@link windingReliable}, not here). Convention-free; independent of
 * the winding target (a discontinuity of f(γ) is a discontinuity about any point).
 */
export function crossesBranchCut(points: readonly Vec2[]): boolean {
  const n = points.length;
  if (n < 8) return false;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const mags: number[] = [];
  for (const p of points) {
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) return false; // pole ON the contour, not a cut
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
    mags.push(Math.hypot(p[0], p[1]));
  }
  const scale = Math.hypot(maxX - minX, maxY - minY); // the curve's own bounding-box diagonal
  if (!(scale > 0)) return false;
  const edges: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    edges.push(Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  edges.sort((x, y) => x - y);
  const median = edges[n >> 1];
  const maxEdge = edges[n - 1];
  if (!(median > 0)) return false;
  // A magnitude blow-up means the contour is grazing a pole (|f| → ∞), not crossing a branch cut.
  mags.sort((x, y) => x - y);
  const medMag = mags[n >> 1] || 1e-12;
  if (mags[n - 1] > 12 * medMag) return false;
  return maxEdge > 25 * median && maxEdge > 0.3 * scale;
}
