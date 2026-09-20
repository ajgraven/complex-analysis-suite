// Segment and arc geometry: the pure-maths half of a contour.
//
// Split out of `engine/contour/model.ts` so that `kernel/` obeys its own layering rule (DESIGN.md
// §1 — kernel imports only `@cas/*`). The division is meaningful rather than bureaucratic: what a
// segment *is* belongs here, while what a piece *means* — its role in the argument, the parameter
// its radius is bound to, the lemma that disposes of it — belongs to the engine.
import type { Pt } from "./exactPredicates.js";

export type Cx = readonly [re: number, im: number];
/** Re-exported so callers get one definition of a planar point, not two that can drift. */
export type { Pt };

/** A piece with every parameter substituted: the form every routine here consumes. */
export type Resolved =
  | { readonly kind: "segment"; readonly from: Cx; readonly to: Cx }
  | {
      readonly kind: "arc";
      readonly center: Cx;
      readonly radius: number;
      /** Radians. The sign of (theta1 − theta0) is the arc's orientation; there is no separate flag. */
      readonly theta0: number;
      readonly theta1: number;
    };

/**
 * Whether an arc's centre passes `arcRadius`'s own test — exactly `(0, 0)`, both components.
 *
 * **Exported so the three readers share one definition.** `ledger.ts` asks it to decide whether a
 * certified bound applies, `stageController.ts`'s snap asks it to decide whether to fire, and
 * {@link penPath} asks it to decide whether the claim is true before carrying it. Written three
 * times, the first disagreement would be a link that promises a bound the geometry cannot carry.
 * A signed zero passes, since `-0 !== 0` is false.
 */
export function isOriginCentred(g: Resolved): boolean {
  return g.kind === "arc" && g.center[0] === 0 && g.center[1] === 0;
}

/** z(t) for t ∈ [0, 1]. */
export function pointAt(g: Resolved, t: number): Cx {
  if (g.kind === "segment") {
    return [g.from[0] + t * (g.to[0] - g.from[0]), g.from[1] + t * (g.to[1] - g.from[1])];
  }
  const th = g.theta0 + t * (g.theta1 - g.theta0);
  return [g.center[0] + g.radius * Math.cos(th), g.center[1] + g.radius * Math.sin(th)];
}

/** dz/dt — the `dz` of `∫ f dz`, and where orientation enters the integral. */
export function derivAt(g: Resolved, t: number): Cx {
  if (g.kind === "segment") return [g.to[0] - g.from[0], g.to[1] - g.from[1]];
  const sweep = g.theta1 - g.theta0;
  const th = g.theta0 + t * sweep;
  return [-g.radius * sweep * Math.sin(th), g.radius * sweep * Math.cos(th)];
}

export const startPoint = (g: Resolved): Cx => pointAt(g, 0);
export const endPoint = (g: Resolved): Cx => pointAt(g, 1);

export function arcLength(g: Resolved): number {
  if (g.kind === "segment") return Math.hypot(g.to[0] - g.from[0], g.to[1] - g.from[1]);
  return Math.abs(g.radius * (g.theta1 - g.theta0));
}

/** True when the arc closes on itself — the case the periodic trapezoidal rule exists for. */
export function isFullCircle(g: Resolved): boolean {
  return g.kind === "arc" && Math.abs(Math.abs(g.theta1 - g.theta0) - 2 * Math.PI) < 1e-12;
}

/** Shortest distance from `p` to the piece. Drives both the refusal test and the node controller. */
export function distanceToPoint(g: Resolved, p: Cx): number {
  if (g.kind === "segment") {
    const vx = g.to[0] - g.from[0];
    const vy = g.to[1] - g.from[1];
    const len2 = vx * vx + vy * vy;
    if (len2 === 0) return Math.hypot(p[0] - g.from[0], p[1] - g.from[1]);
    const t = Math.max(0, Math.min(1, ((p[0] - g.from[0]) * vx + (p[1] - g.from[1]) * vy) / len2));
    return Math.hypot(p[0] - (g.from[0] + t * vx), p[1] - (g.from[1] + t * vy));
  }

  const dx = p[0] - g.center[0];
  const dy = p[1] - g.center[1];
  const r = Math.hypot(dx, dy);
  if (isFullCircle(g)) return Math.abs(r - g.radius);

  // Inside the swept angular range the nearest point is radial; outside it is an endpoint.
  const lo = Math.min(g.theta0, g.theta1);
  const hi = Math.max(g.theta0, g.theta1);
  let th = Math.atan2(dy, dx);
  while (th < lo) th += 2 * Math.PI;
  while (th >= lo + 2 * Math.PI) th -= 2 * Math.PI;
  if (th <= hi) return Math.abs(r - g.radius);

  const a = startPoint(g);
  const b = endPoint(g);
  return Math.min(Math.hypot(p[0] - a[0], p[1] - a[1]), Math.hypot(p[0] - b[0], p[1] - b[1]));
}

/**
 * The most chords {@link polygonise} will ever lay down on one arc.
 *
 * A ceiling on the work, not on the accuracy — and the difference is the point. `n` grows like
 * `sweep/(2√(maxSagitta/r))`, so a query point at relative clearance `1e-10` already asks for ~444k
 * vertices and anything tighter saturates this. Measured before it became a refusal: 36 winding
 * queries at the cap took 8.2 s, each building and discarding a million-element array, and during a
 * contour drag that is once per pole per frame.
 */
export const MAX_POLYGON_CHORDS = 1_000_000;

/**
 * The finest sagitta {@link polygonise} can deliver on this piece — 0 for a segment, which is exact.
 *
 * Asked BEFORE the polyline is built, so that a query the cap cannot serve is refused instead of
 * being answered from a polygon coarser than it asked for. `windingNumber` is the reader.
 */
export function finestSagitta(g: Resolved): number {
  if (g.kind === "segment") return 0;
  const sweep = Math.abs(g.theta1 - g.theta0);
  if (g.radius === 0 || sweep === 0) return 0;
  return g.radius * (1 - Math.cos(sweep / (2 * MAX_POLYGON_CHORDS)));
}

/**
 * Polygonise to a guaranteed accuracy: every point of the piece lies within `sagitta` of the
 * returned polyline.
 *
 * A segment is already exact. For an arc stepped in `n` equal angles the chord's maximum deviation
 * is the sagitta `r(1 − cos(sweep/2n))`, so inverting that gives `n` — an *a priori* bound, not a
 * refinement loop. That is what lets the winding number stay exactly decided while admitting curved
 * pieces (see kernel/winding.ts).
 *
 * **The `sagitta` that comes back is the one DELIVERED, not the one asked for**, and they differ
 * exactly when {@link MAX_POLYGON_CHORDS} binds. Returning the points alone is how a caller came to
 * read a guarantee off a polygon that did not carry it: at radius `1e6` the cap's sagitta is
 * 4.93e-6 against a requested 2.5e-7 — 19.7× coarser at every radius, since both scale with `r` —
 * and `windingNumber` then reported `decided: true` with the wrong integer for 24 of 36 sampled
 * points genuinely inside the circle.
 */
export function polygonise(g: Resolved, maxSagitta: number): { points: Pt[]; sagitta: number } {
  if (g.kind === "segment") return { points: [startPoint(g), endPoint(g)], sagitta: 0 };
  const sweep = Math.abs(g.theta1 - g.theta0);
  if (g.radius === 0 || sweep === 0) return { points: [startPoint(g), endPoint(g)], sagitta: 0 };

  const ratio = Math.min(1, Math.max(0, maxSagitta / g.radius));
  const fromSagitta = ratio >= 1 ? 1 : Math.max(1, Math.ceil(sweep / (2 * Math.acos(1 - ratio))));
  // Floor: no chord may subtend more than a quarter turn. Without it a generous sagitta budget —
  // which happens whenever the query point is far from the arc — collapses a full circle to a
  // single chord from its start point back to itself, and a two-vertex "polygon" has no interior.
  // More segments only ever tighten the sagitta, so the bound above is unaffected.
  const fromSweep = Math.ceil(sweep / (Math.PI / 2));
  const n = Math.min(Math.max(fromSagitta, fromSweep, 1), MAX_POLYGON_CHORDS);
  const points: Pt[] = [];
  for (let k = 0; k <= n; k++) points.push(pointAt(g, k / n));
  return { points, sagitta: g.radius * (1 - Math.cos(sweep / (2 * n))) };
}

/**
 * How far two endpoints may be apart and still be the same point, for a contour of this size.
 *
 * **Relative, because the gap being tolerated is rounding dust and rounding dust scales.** The
 * semicircle's seam is `R·sin(π)`, i.e. `1.2246e-16·R`: measured, an absolute `1e-9` called the
 * template closed at `R = 1e6` (gap 1.22e-10) and OPEN at `R = 1e7` (gap 1.22e-9), so a hand-edited
 * link past the sliders' `1e6` stop opened on a contour the app declared not closed. The scale is
 * the longest piece, which is what `integrateContour` already computes for the clearance floor, and
 * the `max(1, …)` keeps a small contour on the old absolute number.
 *
 * **One rule in one place**: {@link isClosed} takes it as its default and `engine/contour/edit.ts`
 * imports it for the seam test, where the two were previously kept in step by hand.
 */
export const RELATIVE_JOIN_TOL = 1e-9;

/** {@link RELATIVE_JOIN_TOL}, scaled to this contour. */
export function joinTolerance(pieces: readonly Resolved[]): number {
  return RELATIVE_JOIN_TOL * Math.max(1, ...pieces.map(arcLength));
}

/** Whether the traversal joins up end to end and returns to its start, within `tol`. */
export function isClosed(pieces: readonly Resolved[], tol = joinTolerance(pieces)): boolean {
  if (pieces.length === 0) return false;
  for (let k = 0; k < pieces.length - 1; k++) {
    const a = endPoint(pieces[k]);
    const b = startPoint(pieces[k + 1]);
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) > tol) return false;
  }
  const first = startPoint(pieces[0]);
  const last = endPoint(pieces[pieces.length - 1]);
  return Math.hypot(first[0] - last[0], first[1] - last[1]) <= tol;
}
