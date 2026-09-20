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

import { isOriginCentred, pointAt, type Resolved } from "../../kernel/geom.js";
import { resolveAll, type Contour, type LemmaId, type Piece, type PieceRole } from "./model.js";

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
  /**
   * What the piece LEAVING this vertex is FOR — M8 step 4.2.
   *
   * **On the node rather than derived, because a role is not a fact about geometry.** Everything
   * else `penPath` recovers it reads back off the curve: where the reader clicked, how far the
   * piece bows, whether the path closes. A role is the reader's own claim about what the piece does
   * in an argument, and nothing in the plane says it — so it is carried, and this is the one field
   * of a `PenNode` that `penContour` cannot reconstruct.
   *
   * Absent means {@link PEN_ROLE}: a drawn path is `free` until a reader says otherwise, which is
   * the honest starting point (an undisposed piece is a term nobody has bounded, and step 4.1's
   * COVER row says exactly that).
   */
  readonly role?: PieceRole;
  /**
   * Which lemma disposes of the piece leaving this vertex, when it is a `vanish` one.
   *
   * Carried for {@link PenNode.role}'s reason and read by the ledger exactly as a template's is
   * (step 4.1): a drawn arc declaring Jordan's lemma on a rational integrand is refused by name,
   * the same sentence a template piece would get. The pen does not validate the pairing — the
   * ledger is where that question is answered, and answering it twice is how two answers come to
   * disagree.
   */
  readonly lemma?: LemmaId;
  /**
   * That the arc leaving this vertex is centred EXACTLY on the origin — M8 step 4.4b.
   *
   * **The second field of a node that is carried rather than derived, and for {@link PenNode.role}'s
   * reason one level down.** A bulge is one number and it does determine the circle — but only
   * through `atan2` and `cos`/`sin`, and `arcRadius` demands a centre that is EXACTLY `(0, 0)`
   * because every certified arc bound reasons from the reverse triangle inequality on `|z| = R`
   * about the origin. Measured: an upper semicircle of radius 8 drawn with step 4.2's snap has its
   * centre exactly at the origin and closes with a `≤`, but `penPath` reads the chord and the apex
   * back off the curve through trig, recovers `7.999999999999999`, and `arcThroughBulge` then
   * rebuilds the centre at `(0, 8.9e-16)` — so the SAME argument, reopened from its own permalink,
   * lost its bound and stopped closing.
   *
   * **Recomputing the bulge from the arc's own centre and radius is an improvement and NOT a fix**:
   * over 8,000 antipodal arcs it lands exactly on the origin 64.3% of the time against the apex
   * route's 49.5%. Nothing derived from a double gets to 100%, which is what carrying the claim is
   * for — and the claim is cheap, because `penContour` can build the arc from the endpoints and the
   * sweep with the centre written down as a literal zero.
   *
   * Set by {@link penPath} exactly when the live arc passes `arcRadius`'s own test, so the two
   * cannot come to disagree about what "centred at the origin" means; the codec validates it
   * against the vertices before trusting it.
   */
  readonly centred?: true;
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

/**
 * The bulge that puts an arc's apex at `apex`, for the chord `from → to`.
 *
 * The inverse of {@link arcThroughBulge}'s definition, and the ONE place that formula lives: the
 * drag gesture needs it to turn a pointer position into a bulge, and {@link penPath} needs it to
 * read a bulge back off a finished arc. Those were two copies of the same three lines until the
 * second one was written, which is the second-consumer rule arriving inside a module.
 *
 * `0` for a degenerate chord — there is no apex to measure against a point.
 */
export function bulgeFromApex(
  from: readonly [number, number],
  to: readonly [number, number],
  apex: readonly [number, number],
): number {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const chord = Math.hypot(dx, dy);
  if (!(chord > 0)) return 0;
  const mx = (from[0] + to[0]) / 2;
  const my = (from[1] + to[1]) / 2;
  return ((apex[0] - mx) * -dy + (apex[1] - my) * dx) / chord;
}

/** The role every pen piece starts with. */
export const PEN_ROLE: PieceRole = "free";

/**
 * How far apart the two ends of a supposedly origin-centred arc may be, in radius.
 *
 * A claim, not a float epsilon: if the ends are not the same distance from the origin then NO circle
 * about the origin passes through both, and the arc a link is asking for does not exist. The codec
 * refuses beyond this rather than building the nearest thing, which is the same posture the recipe's
 * own verification takes. It is the drawn-path tolerance {@link sameShape} uses, so "the same shape"
 * means one thing across the module.
 */
export const ORIGIN_EPS = 1e-9;

/**
 * The arc from `from` to `to` about the ORIGIN, with the sweep `through` already chose.
 *
 * `null` when the two ends are not the same distance from the origin, because then no such arc
 * exists — see {@link ORIGIN_EPS}. The radius is the mean of the two, so neither endpoint is
 * privileged over the other; the angles come straight from `atan2` about `(0, 0)`, which is exact
 * in the sense that matters here (the centre is a literal zero and no arithmetic can move it).
 */
export function originArc(
  from: readonly [number, number],
  to: readonly [number, number],
  through: { readonly theta0: number; readonly theta1: number },
): { center: readonly [number, number]; radius: number; theta0: number; theta1: number } | null {
  const rFrom = Math.hypot(from[0], from[1]);
  const rTo = Math.hypot(to[0], to[1]);
  if (!(rFrom > 0) || !(rTo > 0)) return null;
  if (Math.abs(rFrom - rTo) > ORIGIN_EPS * Math.max(rFrom, rTo)) return null;
  // **Both angles come from the ENDPOINTS; `through` supplies only the BRANCH.** Carrying its sweep
  // over wholesale looks equivalent and is not: its angles are measured about its own centre, which
  // is the slightly-off one this function exists to replace, so the sweep it reports is the sweep
  // between two points seen from the wrong place — measured on a chord at the edge of
  // {@link ORIGIN_EPS}, that left the far end 3.6e-9 out against the near end's 1.6e-9. What is
  // genuinely `through`'s to decide is discrete: which way round, and how far. So the end angle is
  // read about the origin like the start angle, and then moved by whole turns to the branch nearest
  // the sweep the bulge chose.
  const theta0 = Math.atan2(from[1], from[0]);
  const want = through.theta1 - through.theta0;
  const turn = Math.PI * 2;
  const raw = Math.atan2(to[1], to[0]) - theta0;
  const sweep = raw + turn * Math.round((want - raw) / turn);
  // The MEAN of the two radii, so neither end is privileged: the gap between them is the reader's
  // and no circle about the origin closes it, but spending all of it on one end is a choice this
  // function has no reason to make.
  return { center: [0, 0], radius: (rFrom + rTo) / 2, theta0, theta1: theta0 + sweep };
}

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
    // **The role rides the node, and a lemma only where it means something** — M8 step 4.2. A
    // `lemma` is a statement about how a VANISHING piece is disposed of, so carrying one on a
    // `target` or a `free` piece would put a field on the wire that nothing reads — the same rule
    // `setRole` enforces from the editing side, stated once on each side of the boundary because
    // neither can see the other.
    const role = a.role ?? PEN_ROLE;
    const lemma = role === "vanish" && a.lemma !== undefined ? { lemma: a.lemma } : {};
    // **The claim is honoured by CONSTRUCTION, not by correcting what the bulge built.** With the
    // centre written down as a literal zero there is nothing left to round: the radius and both
    // angles are read from the endpoints the reader clicked, and only the SWEEP — a discrete choice
    // of which way round, already made by `arcThroughBulge` — is taken from the arc above.
    const centred = arc !== null && a.centred === true ? originArc(a.at, b.at, arc) : null;
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
            role,
            ...lemma,
            colour: COLOURS[i % COLOURS.length],
          }
        : {
            id,
            name: `drawn arc ${n}`,
            geom: {
              kind: "arc",
              center: { x: (centred ?? arc).center[0], y: (centred ?? arc).center[1] },
              radius: (centred ?? arc).radius,
              theta0: (centred ?? arc).theta0,
              theta1: (centred ?? arc).theta1,
            },
            role,
            ...lemma,
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

  // **The role comes from the PIECE, not from the geometry** — M8 step 4.2, and it is the one part
  // of a node this function does not derive. Everything else here is read back off the curve, which
  // is what makes `penContour(penPath(c))` a round trip the codec can verify; a role has no
  // geometric shadow, so dropping it would silently turn a drawn argument back into a drawn shape
  // the first time a link was minted from it.
  const nodes: PenNode[] = resolved.map((g, i) => {
    const spec = contour.pieces[i];
    const carried =
      spec === undefined
        ? {}
        : { role: spec.role, ...(spec.lemma === undefined ? {} : { lemma: spec.lemma }) };
    const from = startOf(g);
    if (g.kind === "segment") return { at: [from[0], from[1]] as const, ...carried };
    // The bulge is the apex's signed offset from the chord's midpoint — the same quantity the drag
    // measured, through the same function.
    const bulge = bulgeFromApex(from, endOf(g), pointAt(g, 0.5));
    // **And whether it is centred on the origin, which the bulge CANNOT carry** — M8 step 4.4b, and
    // the field's own note says what it costs not to. Read with `ledger.ts`'s test rather than a
    // comparison written here, so the claim is true in exactly the sense the bound needs.
    const centred = isOriginCentred(g) ? { centred: true as const } : {};
    return { at: [from[0], from[1]] as const, bulge, ...centred, ...carried };
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
