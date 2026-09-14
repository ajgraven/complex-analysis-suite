// The pen: a hand-drawn path, and the contour it becomes.
//
// M7.2, and M1's deferred item. Research 07 rule 6 gives the grammar — click = corner, drag = arc,
// click-the-start = close — and this module is the half of it that has no DOM: a list of vertices in
// the plane turns into the same kind of `Contour` a template produces, with real pieces carrying
// ids, names, roles and colours rather than an anonymous polyline.
//
// **WHY A BULGE AND NOT A CENTRE.** An arc drawn between two clicks is pinned by one more number,
// and there are two candidates: the circle's centre (two numbers, over-determined and able to
// disagree with the endpoints) or how far the arc bows away from the chord (one number, incapable of
// disagreeing with anything). The bulge is the signed perpendicular distance from the chord's
// midpoint to the arc's apex, which is also exactly what the drag gesture measures — the pointer's
// offset from the chord. Zero is a straight line, and it degrades to one continuously, so a drag
// that ends where it started leaves a segment rather than an arc of enormous radius.
//
// **WHY VERTICES ARE THE WIRE FORM.** Measured before it was built: a twelve-corner path carried as
// its piece list is 2,028 base64 characters, which is at research 07 §6's ~2 kB warning, and twenty
// corners is 4,635. The same path as vertices plus a per-piece kind tag is **292**, and forty corners
// is 879. The saving is not compression — it is that ids, names, colours and every shared endpoint
// are DERIVED, so carrying them is carrying the same fact twice. `viewState.ts` writes this form;
// DESIGN §2.2's "no sampled-point representation" is untouched, because these vertices are where the
// reader clicked and not a discretisation of anything.

import { pointAt, type Resolved } from "../../kernel/geom.js";
import { resolveAll, type Contour, type Piece, type PieceRole } from "./model.js";

/** Where the reader clicked, and how the piece LEAVING that vertex bows. */
export interface PenNode {
  readonly at: readonly [number, number];
  /**
   * Signed perpendicular distance from the chord's midpoint to the arc's apex, in world units.
   *
   * Absent or below {@link STRAIGHT} is a straight segment. Positive bows to the left of the
   * direction of travel, negative to the right, so the sign is the drag's own side and a reader
   * never has to think about which way `theta` runs.
   */
  readonly bulge?: number;
}

export interface PenPath {
  readonly nodes: readonly PenNode[];
  /** Whether the last node joins back to the first. An open path is drawable but will not close. */
  readonly closed: boolean;
}

/**
 * Below this, a bulge is a straight line.
 *
 * Not an epsilon for float noise: it is the point at which an arc is indistinguishable from its
 * chord at any zoom a reader can reach, and turning it into an arc anyway would produce a radius of
 * `h²/2b` — millions of units wide for a hand-drawn wobble, which then dominates every bounding box
 * the app computes from the geometry.
 */
export const STRAIGHT = 1e-9;

/**
 * Colours cycle so adjacent pieces are told apart.
 *
 * SIX of them, and the compiler is why: `Piece.colour` is `0 | 1 | 2 | 3 | 4 | 5`, not a number, so
 * a draft that cycled modulo 8 did not typecheck. The palette is the shell's, and a seventh entry
 * would be a colour it cannot draw.
 */
const COLOURS = [0, 1, 2, 3, 4, 5] as const;

/**
 * The arc through `from` and `to` whose apex is `bulge` from the chord's midpoint.
 *
 * Derivation, with the chord along the x-axis from `(−h, 0)` to `(h, 0)` and the apex at `(0, b)`:
 * the circle through those three points has centre `(0, k)` with `k = (b² − h²) / 2b` and radius
 * `(b² + h²) / 2|b|`. Rotating and translating back is the caller's frame. The sweep runs from
 * `from` to `to` THROUGH the apex, which is what fixes the sign of `theta1 − theta0` — and the model
 * has no orientation flag precisely so that sign is the only place traversal is recorded.
 */
export function arcThroughBulge(
  from: readonly [number, number],
  to: readonly [number, number],
  bulge: number,
): { center: readonly [number, number]; radius: number; theta0: number; theta1: number } | null {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const chord = Math.hypot(dx, dy);
  if (!(chord > 0) || Math.abs(bulge) < STRAIGHT) return null;
  const h = chord / 2;
  const b = bulge;
  const k = (b * b - h * h) / (2 * b);
  const radius = (b * b + h * h) / (2 * Math.abs(b));
  // The chord's midpoint, and the unit normal pointing to the LEFT of the direction of travel.
  const mx = (from[0] + to[0]) / 2;
  const my = (from[1] + to[1]) / 2;
  const nx = -dy / chord;
  const ny = dx / chord;
  const center: readonly [number, number] = [mx + nx * k, my + ny * k];
  const theta0 = Math.atan2(from[1] - center[1], from[0] - center[0]);
  const theta1raw = Math.atan2(to[1] - center[1], to[0] - center[0]);
  // Choose the branch of `theta1` that sweeps through the apex rather than the long way round.
  const apexX = mx + nx * b;
  const apexY = my + ny * b;
  const apex = Math.atan2(apexY - center[1], apexX - center[0]);
  const wrap = (t: number): number => {
    let d = t - theta0;
    while (d <= -Math.PI * 2) d += Math.PI * 2;
    while (d > Math.PI * 2) d -= Math.PI * 2;
    return d;
  };
  // Two candidates for the end angle; take the one whose sweep contains the apex.
  const up = wrap(theta1raw) <= 0 ? wrap(theta1raw) + Math.PI * 2 : wrap(theta1raw);
  const down = up - Math.PI * 2;
  const between = (d: number): boolean => {
    const a = wrap(apex);
    const aUp = a <= 0 ? a + Math.PI * 2 : a;
    const aDown = aUp - Math.PI * 2;
    return d > 0 ? aUp > 0 && aUp < d : aDown < 0 && aDown > d;
  };
  const sweep = between(up) ? up : down;
  return { center, radius, theta0, theta1: theta0 + sweep };
}

/** The role every pen piece starts with. */
export const PEN_ROLE: PieceRole = "free";

/**
 * Turn a drawn path into a contour.
 *
 * Ids are positional (`pen0`, `pen1`, …) so that a redraw of the same path is the same contour, and
 * names say what the piece IS — the piece list, the ledger's KILL rows and the accumulator all read
 * them, and "anonymous polyline" is exactly what research 07 rule 2 forbids.
 *
 * A path with fewer than two nodes has no pieces, which is a contour the ledger will refuse rather
 * than a state this function has to special-case.
 */
export function penContour(path: PenPath): Contour {
  const { nodes, closed } = path;
  const pieces: Piece[] = [];
  const last = closed ? nodes.length : nodes.length - 1;
  for (let i = 0; i < last; i++) {
    const a = nodes[i];
    const b = nodes[(i + 1) % nodes.length];
    const id = `pen${i}`;
    const arc = arcThroughBulge(a.at, b.at, a.bulge ?? 0);
    const n = i + 1;
    pieces.push(
      arc === null
        ? {
            id,
            name: `drawn segment ${n}`,
            geom: {
              kind: "segment",
              from: { x: a.at[0], y: a.at[1] },
              to: { x: b.at[0], y: b.at[1] },
            },
            role: PEN_ROLE,
            colour: COLOURS[i % COLOURS.length],
          }
        : {
            id,
            name: `drawn arc ${n}`,
            geom: {
              kind: "arc",
              center: { x: arc.center[0], y: arc.center[1] },
              radius: arc.radius,
              theta0: arc.theta0,
              theta1: arc.theta1,
            },
            role: PEN_ROLE,
            colour: COLOURS[i % COLOURS.length],
          },
    );
  }
  // No params: a drawn contour references nothing, which is also why it has no recipe and why the
  // codec had to grow a second form for it rather than carrying `{template, params, shift}`.
  return { pieces, params: {} };
}

/** Is this contour one the pen drew? Used by the codec to choose its wire form. */
export function isPenContour(contour: Contour): boolean {
  return contour.pieces.length > 0 && contour.pieces.every((p) => p.id.startsWith("pen"));
}

/**
 * Recover the path a contour was drawn from — the inverse of {@link penContour}.
 *
 * **Derived rather than stored, deliberately.** The alternative is to keep the `PenPath` in
 * `ShellState` beside the contour it built, which is a second source of truth for the same fact and
 * the exact shape of bug `contourSource` had to grow a verification step to prevent. Reading the
 * path back out of the geometry means there is nothing to drift: `penContour(penPath(c))` either
 * reproduces `c` or the caller finds out, and `viewState.ts` checks precisely that before minting a
 * link, the same posture it takes to a template's recipe.
 *
 * Closure is derived too, from the last piece's end meeting the first piece's start — which is the
 * model's own rule that a contour cannot claim a closure it lacks.
 */
export function penPath(contour: Contour): PenPath | null {
  if (!isPenContour(contour)) return null;
  const resolved = resolveAll(contour);
  if (resolved.length === 0) return null;

  const startOf = (g: Resolved): readonly [number, number] => pointAt(g, 0);
  const endOf = (g: Resolved): readonly [number, number] => pointAt(g, 1);

  const nodes: PenNode[] = resolved.map((g) => {
    const from = startOf(g);
    if (g.kind === "segment") return { at: [from[0], from[1]] as const };
    // The bulge is the apex's signed offset from the chord's midpoint, along the LEFT normal — the
    // same quantity the drag measured, read back off the arc.
    const to = endOf(g);
    const apex = pointAt(g, 0.5);
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const chord = Math.hypot(dx, dy);
    if (!(chord > 0)) return { at: [from[0], from[1]] as const };
    const mx = (from[0] + to[0]) / 2;
    const my = (from[1] + to[1]) / 2;
    const bulge = ((apex[0] - mx) * -dy + (apex[1] - my) * dx) / chord;
    return { at: [from[0], from[1]] as const, bulge };
  });

  const first = startOf(resolved[0]);
  const lastEnd = endOf(resolved[resolved.length - 1]);
  const closed = Math.hypot(lastEnd[0] - first[0], lastEnd[1] - first[1]) < CLOSE_EPS;
  if (closed) return { nodes, closed: true };
  return { nodes: [...nodes, { at: [lastEnd[0], lastEnd[1]] as const }], closed: false };
}

/**
 * How near the last point must come to the first for the path to be closed.
 *
 * Read back from geometry that has been through `cos`/`sin`, so it is a float-noise tolerance and
 * not a snapping distance: the pen's own closing gesture places the final vertex EXACTLY on the
 * first, and this only has to survive the round trip through an arc's angles.
 */
const CLOSE_EPS = 1e-9;

/**
 * Do two contours describe the same SHAPE, to within float noise?
 *
 * **A byte comparison is the wrong instrument here, and measuring says why.** `viewState.ts` checks
 * a template's recipe by rebuilding it and comparing the pieces exactly, which works because the
 * rebuild is deterministic from the same inputs. A drawn arc is not: the bulge is read back out of
 * the geometry through `atan2`, and rebuilding it runs `cos`/`sin` again. Measured over the arcs the
 * pen can draw, the recovered bulge is bit-identical in most cases and off by 2.0e-13 at worst, and
 * the resulting points move by at most **1.3e-12** — so an exact comparison refuses a link to the
 * curve the reader is looking at, on the grounds of a last-bit difference in `radius`.
 *
 * So the check is the property actually meant: sampled at five parameters per piece, do the two
 * agree? {@link SHAPE_EPS} sits three orders above the measured noise and many orders below anything
 * a reader could draw, and it still catches every way the round trip could really go wrong — a
 * flipped bulge sign moves the apex by `2|b|`, a dropped arc by `|b|`, a reversed sweep by the
 * radius. `pen.test.ts` asserts that discrimination rather than trusting it.
 */
export function sameShape(a: Contour, b: Contour, tol = SHAPE_EPS): boolean {
  if (a.pieces.length !== b.pieces.length) return false;
  const ra = resolveAll(a);
  const rb = resolveAll(b);
  for (let i = 0; i < ra.length; i++) {
    if (ra[i].kind !== rb[i].kind) return false;
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const p = pointAt(ra[i], t);
      const q = pointAt(rb[i], t);
      if (!(Math.hypot(p[0] - q[0], p[1] - q[1]) <= tol)) return false;
    }
  }
  return true;
}

/** Three orders above the measured 1.3e-12 round-trip noise; far below anything drawable. */
export const SHAPE_EPS = 1e-9;
