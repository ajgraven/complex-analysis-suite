// Does this piece of the contour cross that cut?
//
// DESIGN §4 Pass 1 step 2: a crossing is legal only when the piece carries a `side` tag pinning which
// limit is meant; otherwise the ledger refuses with the repair *"tag this segment `above` or `below`,
// or move the cut."* The question sounds like a detail and is not — it is the difference between a
// keyhole contour (two segments deliberately hugging opposite sides of ℝ₊, whose difference is the
// whole integral) and a contour that wanders across a cut and silently changes sheet.
//
// FIVE ANSWERS, AND D1 IS WHY. The first version of this file had three — `clear`, `crosses`,
// `touches` — and refused the keyhole outright, which is the one contour tier D is built on. Two of
// its four pieces run ALONG the cut (that is what the `side` tag is for: `model.ts` says the tag
// "pins which limit is meant where the piece runs along a branch cut — never an ε-offset"), and the
// other two meet the cut only at their own ENDPOINTS, where they join the lips. Neither is a
// crossing, and calling both a grazing contact made the gallery's flagship record illegal.
//
//   `clear`     they do not meet.
//   `endpoint`  they meet only at an end of the PIECE — the contour arriving at the cut, which is
//               where one piece hands over to the next. Legal, and needs no tag.
//   `along`     the piece lies in the cut. The keyhole's two lips. Legal WHEN TAGGED.
//   `crosses`   the piece's interior transversally crosses. Legal when tagged; otherwise the sheet
//               changes with nothing said about it.
//   `touches`   a tangency, or a bend of the cut resting on the piece's interior. A refusal: there
//               is no side there, so no tag would pin anything.
//
// What the old `endpoint`-is-a-refusal rule was really catching — a circle that encircles a branch
// point and must therefore cross the cut somewhere — is caught properly by a different and better
// test, one piece of geometry cannot see: the WINDING NUMBER of the whole contour about each branch
// point, which `ledger.ts` decides exactly. A loop with `n(γ,b) ≠ 0` is not a loop in ℂ∖Γ at all,
// and saying that is a sharper diagnosis than naming whichever piece happened to cross.
//
// **A BEND OF THE CUT LYING ON THE PIECE IS DEGENERATE.** That one rule, checked before anything
// else, is what lets every other predicate here stay strict. The alternative — a sign convention that
// decides which of the two edges meeting at a vertex owns a crossing there — is answerable, but it
// answers the wrong question: the bend point itself has no side, so a `side` tag would pin nothing,
// and "move the cut off the contour" is the only repair that means anything. Dragging a cut across
// the contour therefore passes through a refusal at the instant of incidence, exactly as dragging a
// pole onto the contour does.
//
// SEGMENTS ARE DECIDED BY SIGN, ARCS BY A QUADRATIC. With the degenerate case already removed, a
// segment-vs-segment crossing is four strict `orient2d` predicates and admits no tolerance at all.
// An arc against a cut edge is a circle against a line — one quadratic, whose discriminant IS the
// tangency question — and the arc's angular range is checked with the traversal's own multiplicity,
// so a contour that loops twice through the same cut reports two crossings rather than one.
import type { Cx, Resolved } from "../geom.js";
import { distanceToPoint, startPoint, endPoint } from "../geom.js";
import { orient2d } from "../exactPredicates.js";
import { RELATIVE_CLEARANCE_FLOOR } from "../winding.js";

/** See the header. `touches` is the only refusal; `along` and `crosses` are legal when tagged. */
export type CrossingKind = "clear" | "endpoint" | "along" | "crosses" | "touches";

/** Whether this contact obliges the piece to declare which side of the cut it runs on. */
export const needsSide = (kind: CrossingKind): boolean => kind === "along" || kind === "crosses";

export interface CutClassification {
  readonly cutId: string;
  readonly kind: CrossingKind;
  /** How many times the piece crosses transversally. Meaningful only when `kind` is `crosses`. */
  readonly count: number;
  /** The closest approach found between the piece and the cut. Zero when they cross. */
  readonly nearest: number;
  /** One point on the crossing — for the UI to mark, and for the message. */
  readonly at?: Cx;
}

const TAU = 2 * Math.PI;

const seg = (from: Cx, to: Cx): Resolved => ({ kind: "segment", from, to });

/** The point of `[a,b]` closest to `p`. */
function footOnSegment(a: Cx, b: Cx, p: Cx): Cx {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const len2 = vx * vx + vy * vy;
  if (len2 === 0) return a;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2));
  return [a[0] + t * vx, a[1] + t * vy];
}

/**
 * How many times the arc's traversal passes through the direction `theta`.
 *
 * Half-open in the traversal parameter, `[θ₀, θ₁)`, which is the convention a CLOSED contour needs:
 * a full circle passes through its own start direction once, not twice. A multi-turn arc reports the
 * number of turns that reach it, because a contour looping twice across a cut has crossed it twice
 * and the ledger's count would otherwise under-report by a whole sheet.
 */
function passesThrough(g: Extract<Resolved, { kind: "arc" }>, theta: number): number {
  const sweep = g.theta1 - g.theta0;
  if (sweep === 0) return 0;
  const total = Math.abs(sweep);
  const along = ((((theta - g.theta0) * Math.sign(sweep)) % TAU) + TAU) % TAU;
  if (along >= total) return 0;
  return Math.ceil((total - along) / TAU);
}

/** How far along the arc, in length, the direction `theta` sits from the nearer of its two ends. */
function endpointProximity(g: Extract<Resolved, { kind: "arc" }>, theta: number): number {
  const sweep = g.theta1 - g.theta0;
  const total = Math.abs(sweep);
  const along = ((((theta - g.theta0) * Math.sign(sweep)) % TAU) + TAU) % TAU;
  return Math.min(along, Math.abs(total - along)) * g.radius;
}

/** One point where a piece meets a cut edge, and what kind of meeting it is. */
interface Hit {
  /** How many times the traversal passes through. Zero for a meeting at an end of the piece. */
  readonly count: number;
  readonly at: Cx;
  /** The meeting is at an END of the piece — where the contour hands over to its next piece. */
  readonly atPieceEnd: boolean;
  /** Tangential: no side, and therefore nothing a `side` tag could pin. */
  readonly grazing: boolean;
}

/** Whether the two collinear segments `[a,b]` and `[c,d]` overlap in more than a point. */
function overlapsCollinearly(a: Cx, b: Cx, c: Cx, d: Cx, tol: number): boolean {
  if (orient2d(a, b, c) !== 0 || orient2d(a, b, d) !== 0) return false;
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const len2 = ux * ux + uy * uy;
  if (len2 === 0) return false;
  const at = (p: Cx): number => ((p[0] - a[0]) * ux + (p[1] - a[1]) * uy) / len2;
  const lo = Math.min(at(c), at(d));
  const hi = Math.max(at(c), at(d));
  return Math.min(hi, 1) - Math.max(lo, 0) > tol / Math.sqrt(len2);
}

/** Where a segment piece meets one cut edge. Exact-sign predicates, with the ends kept apart. */
function segmentHits(a: Cx, b: Cx, c: Cx, d: Cx, tol: number): Hit | null {
  const s1 = orient2d(a, b, c);
  const s2 = orient2d(a, b, d);
  const s3 = orient2d(c, d, a);
  const s4 = orient2d(c, d, b);
  // Collinear is the caller's business (`along`), not a crossing.
  if (s1 === 0 && s2 === 0) return null;
  if (s1 * s2 > 0) return null;

  // `s3`/`s4` zero means an END of the PIECE lies on the cut's line — the contour arriving at the
  // cut. That is a meeting, not a crossing, and it is what makes the keyhole's circles legal.
  const onEnd = s3 === 0 || s4 === 0;
  if (!onEnd && s3 * s4 > 0) return null;

  const rx = b[0] - a[0];
  const ry = b[1] - a[1];
  const sx = d[0] - c[0];
  const sy = d[1] - c[1];
  const den = rx * sy - ry * sx;
  if (den === 0) return null; // parallel and not collinear: no meeting
  const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / den;
  const span = Math.hypot(rx, ry);
  const tolT = span === 0 ? 0 : tol / span;
  // Beyond the cut edge itself, in the edge's own parameter.
  const u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / den;
  if (u < -tolT || u > 1 + tolT) return null;
  if (t < -tolT || t > 1 + tolT) return null;

  const atPieceEnd = t <= tolT || t >= 1 - tolT;
  return {
    count: atPieceEnd ? 0 : 1,
    at: [a[0] + t * rx, a[1] + t * ry],
    atPieceEnd,
    grazing: false,
  };
}

/** Where an arc piece meets one cut edge: |a + uD − c|² = r², one quadratic. */
function arcHits(g: Extract<Resolved, { kind: "arc" }>, a: Cx, b: Cx, tol: number): Hit[] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const A = dx * dx + dy * dy;
  if (A === 0) return [];
  const ex = a[0] - g.center[0];
  const ey = a[1] - g.center[1];
  const B = 2 * (ex * dx + ey * dy);
  const C = ex * ex + ey * ey - g.radius * g.radius;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return [];

  const root = Math.sqrt(disc);
  const span = Math.sqrt(A);
  // The two intersections are `root/span` apart in the plane. A short chord between them is a
  // grazing contact however the discriminant's own magnitude scales, which is why tangency is judged
  // here rather than on `disc`.
  const grazing = root / span < tol;

  const out: Hit[] = [];
  for (const u of [(-B - root) / (2 * A), (-B + root) / (2 * A)]) {
    if (u < 0 || u > 1) continue;
    const at: Cx = [a[0] + u * dx, a[1] + u * dy];
    const theta = Math.atan2(at[1] - g.center[1], at[0] - g.center[0]);
    const count = passesThrough(g, theta);
    // An END of the arc, whether or not the sweep closes. The keyhole's outer piece sweeps a full
    // 2π and BOTH of its ends sit on the cut — it runs from the upper lip round to the lower one —
    // so treating a closed sweep as having no ends is exactly what made that contour illegal.
    const atPieceEnd = endpointProximity(g, theta) < tol;
    if (count === 0 && !atPieceEnd) continue;
    out.push({ count: atPieceEnd ? 0 : count, at, atPieceEnd, grazing });
    if (root === 0) break; // a double root is one point, not two
  }
  return out;
}

/** Closest approach between a piece and one cut edge. Exact for a segment; complete for an arc. */
function nearestToEdge(g: Resolved, a: Cx, b: Cx): number {
  const edge = seg(a, b);
  let best = Math.min(
    distanceToPoint(g, a),
    distanceToPoint(g, b),
    distanceToPoint(edge, startPoint(g)),
    distanceToPoint(edge, endPoint(g)),
  );
  if (g.kind === "segment") return best;

  // For a circle against a line the closest pair is radial from the centre, so the candidate set is
  // complete once the foot of the centre is projected out to the circle — in both directions, since
  // the near side may be off the arc's range while the far side is on it.
  const foot = footOnSegment(a, b, g.center);
  const vx = foot[0] - g.center[0];
  const vy = foot[1] - g.center[1];
  const len = Math.hypot(vx, vy);
  if (len > 0) {
    for (const s of [1, -1]) {
      const z: Cx = [g.center[0] + (s * g.radius * vx) / len, g.center[1] + (s * g.radius * vy) / len];
      if (passesThrough(g, Math.atan2(z[1] - g.center[1], z[0] - g.center[0])) > 0) {
        best = Math.min(best, distanceToPoint(edge, z));
      }
    }
  }
  return best;
}

/**
 * Classify one piece against one cut, already reduced to a finite polyline (`model.cutPolyline`).
 *
 * `scale` is the characteristic size of the picture — the contour's own extent will do — and sets the
 * distance below which the two are called `touches` rather than decided either way.
 */
export function classifyAgainstCut(
  cutId: string,
  g: Resolved,
  poly: readonly Cx[],
  scale: number,
): CutClassification {
  const tol = RELATIVE_CLEARANCE_FLOOR * Math.max(scale, 1);
  const from = startPoint(g);
  const to = endPoint(g);

  // A bend of the cut resting on the piece's INTERIOR has no side, so no tag could pin anything
  // there. On the piece's own END it is the ordinary handover from one piece to the next — which is
  // where the keyhole's inner circle meets its lips — so only the interior case is degenerate.
  for (const v of poly) {
    const d = distanceToPoint(g, v);
    if (d > tol) continue;
    const atEnd =
      Math.hypot(v[0] - from[0], v[1] - from[1]) <= tol ||
      Math.hypot(v[0] - to[0], v[1] - to[1]) <= tol;
    if (!atEnd) return { cutId, kind: "touches", count: 0, nearest: d, at: v };
  }

  let count = 0;
  let nearest = Number.POSITIVE_INFINITY;
  let at: Cx | undefined;
  let grazed = false;
  let met = false;
  let along = false;

  for (let k = 0; k + 1 < poly.length; k++) {
    const a = poly[k];
    const b = poly[k + 1];
    nearest = Math.min(nearest, nearestToEdge(g, a, b));
    if (g.kind === "segment" && overlapsCollinearly(g.from, g.to, a, b, tol)) {
      along = true;
      continue;
    }
    const hits =
      g.kind === "segment"
        ? ([segmentHits(g.from, g.to, a, b, tol)].filter((h) => h !== null) as Hit[])
        : arcHits(g, a, b, tol);
    for (const h of hits) {
      if (h.grazing) {
        grazed = true;
        continue;
      }
      met = true;
      count += h.count;
      if (h.count > 0) at ??= h.at;
    }
  }

  // ORDER MATTERS, and it is by how much the caller has to do about it: lying in the cut and
  // crossing it both oblige the piece to declare a side, and both are more than a grazing contact
  // has to say. A refusal that fires before them would make the keyhole illegal.
  if (along) return { cutId, kind: "along", count: 0, nearest: 0 };
  if (count > 0) {
    return { cutId, kind: "crosses", count, nearest: 0, ...(at === undefined ? {} : { at }) };
  }
  if (grazed) {
    return { cutId, kind: "touches", count: 0, nearest: Number.isFinite(nearest) ? nearest : 0, at };
  }
  if (met) return { cutId, kind: "endpoint", count: 0, nearest: 0 };
  if (nearest <= tol) {
    return { cutId, kind: "touches", count: 0, nearest: Number.isFinite(nearest) ? nearest : 0 };
  }
  return { cutId, kind: "clear", count: 0, nearest: Number.isFinite(nearest) ? nearest : Infinity };
}
