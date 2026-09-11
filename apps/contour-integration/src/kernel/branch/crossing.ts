// Does this piece of the contour cross that cut?
//
// DESIGN §4 Pass 1 step 2: a crossing is legal only when the piece carries a `side` tag pinning which
// limit is meant; otherwise the ledger refuses with the repair *"tag this segment `above` or `below`,
// or move the cut."* The question sounds like a detail and is not — it is the difference between a
// keyhole contour (two segments deliberately hugging opposite sides of ℝ₊, whose difference is the
// whole integral) and a contour that wanders across a cut and silently changes sheet.
//
// THE ANSWER IS THREE-VALUED, ON PURPOSE. `clear` and `crosses` are decisions; `touches` is a
// refusal, and it is the honest outcome whenever the piece and the cut are closer than the geometry
// can resolve. A grazing contact has no side, so neither tag would pin anything and the app must say
// so rather than round the question away. That is the same posture `winding.ts` takes about a pole
// sitting on the contour, and it shares the same threshold so the app has ONE idea of "too close to
// say" rather than two that can drift.
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

/** `clear` and `crosses` are decisions. `touches` is a refusal: too close to have a side. */
export type CrossingKind = "clear" | "crosses" | "touches";

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

interface Hit {
  readonly count: number;
  readonly at: Cx;
  /** True when the intersection is grazing, or lands on an endpoint of either object. */
  readonly grazing: boolean;
}

/** Transversal crossing of a segment piece with one cut edge — four strict `orient2d` predicates. */
function segmentHits(a: Cx, b: Cx, c: Cx, d: Cx): Hit | null {
  const s1 = orient2d(a, b, c);
  const s2 = orient2d(a, b, d);
  const s3 = orient2d(c, d, a);
  const s4 = orient2d(c, d, b);
  // Every degenerate configuration has a zero somewhere, and every one of them is already `touches`:
  // a vertex of the cut on the piece was caught before this ran, and a vertex of the PIECE on the cut
  // leaves the two at distance zero, which the clearance test below reads.
  if (s1 === 0 || s2 === 0 || s3 === 0 || s4 === 0) return null;
  if (s1 * s2 > 0 || s3 * s4 > 0) return null;

  const rx = b[0] - a[0];
  const ry = b[1] - a[1];
  const sx = d[0] - c[0];
  const sy = d[1] - c[1];
  const den = rx * sy - ry * sx;
  // The sign tests above already proved the crossing; `den` is only how it is LOCATED, and it cannot
  // be zero once all four orientations are strict.
  const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / den;
  return { count: 1, at: [a[0] + t * rx, a[1] + t * ry], grazing: false };
}

/** Transversal crossings of an arc piece with one cut edge: |a + uD − c|² = r², one quadratic. */
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
  // The two intersections are `root/A` apart in `u`, so `root/span` apart in the plane. A short chord
  // between them is a grazing contact however the discriminant's own magnitude scales, which is why
  // tangency is judged here rather than on `disc`.
  const grazing = root / span < tol;

  const out: Hit[] = [];
  for (const u of [(-B - root) / (2 * A), (-B + root) / (2 * A)]) {
    // Past either end of this edge is not a crossing of THIS pair; the edge's own vertices cannot be
    // on the arc, because the caller already refused that case.
    if (u < 0 || u > 1) continue;
    const at: Cx = [a[0] + u * dx, a[1] + u * dy];
    const theta = Math.atan2(at[1] - g.center[1], at[0] - g.center[0]);
    const count = passesThrough(g, theta);
    const nearArcEnd = endpointProximity(g, theta) < tol;
    if (count === 0 && !nearArcEnd) continue;
    out.push({ count: Math.max(count, 1), at, grazing: grazing || nearArcEnd });
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

  // The one pre-check that keeps every predicate below strict. A bend of the cut resting on the piece
  // — the branch point itself included — has no side, so there is nothing for a `side` tag to pin.
  for (const v of poly) {
    const d = distanceToPoint(g, v);
    if (d <= tol) return { cutId, kind: "touches", count: 0, nearest: d, at: v };
  }

  let count = 0;
  let nearest = Number.POSITIVE_INFINITY;
  let at: Cx | undefined;
  let grazed = false;

  for (let k = 0; k + 1 < poly.length; k++) {
    const a = poly[k];
    const b = poly[k + 1];
    nearest = Math.min(nearest, nearestToEdge(g, a, b));
    const hits =
      g.kind === "segment"
        ? ([segmentHits(g.from, g.to, a, b)].filter((h) => h !== null) as Hit[])
        : arcHits(g, a, b, tol);
    for (const h of hits) {
      if (h.grazing) {
        grazed = true;
        continue;
      }
      count += h.count;
      at ??= h.at;
    }
  }

  if (grazed || (count === 0 && nearest <= tol)) {
    return { cutId, kind: "touches", count: 0, nearest: Number.isFinite(nearest) ? nearest : 0, at };
  }
  if (count > 0) {
    return { cutId, kind: "crosses", count, nearest: 0, ...(at === undefined ? {} : { at }) };
  }
  return { cutId, kind: "clear", count: 0, nearest: Number.isFinite(nearest) ? nearest : Infinity };
}
