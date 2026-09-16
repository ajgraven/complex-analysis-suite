// Moving a contour, without leaving the representation it is written in.
//
// THE FINDING THIS RESTS ON. `model.ts`'s `Scalar` is the affine subset
// `number | { param, mul?, add? }`, and translation is an affine operation — so a literal coordinate
// moves by rewriting the number, and a PARAM-BOUND one absorbs the offset into its own `add`. No fork
// to a second "free geometry" representation, no change to `resolve`, and a translated template is
// still a template: its radius is still bound to `R`, so the slider and the `R → ∞` animation keep
// working on a contour the user has dragged across the plane.
//
// EVERY GESTURE HERE KEEPS THE CONTOUR CLOSED. Translation is a rigid motion applied to every piece,
// so closure is preserved identically; a radius handle edits the PARAMETER the template already binds
// its arcs to, so the pieces move together the way the template intends. That is deliberate rather
// than incidental: dragging one endpoint of a template's diameter would open the contour, the ledger
// would correctly refuse the residue theorem, and the user would have broken a worked example by
// accident. Free-hand path editing — adding, removing and moving individual points — needs the pen
// tool's own semantics for closure and is not this module.
import type { Cx, Resolved } from "../../kernel/geom.js";
import { distanceToPoint, pointAt } from "../../kernel/geom.js";
import type { Contour, Geom, PointSpec, Scalar } from "./model.js";

/** Shift one affine scalar by `d`, staying affine. */
function shiftScalar(s: Scalar, d: number): Scalar {
  if (typeof s === "number") return s + d;
  // `add` is exactly the seat for this: `{ param: "R", mul: -1 }` + dx is `-R + dx`, which is what a
  // translated endpoint means, and it survives every later change to `R`. A nested `add` — D7's
  // `b − η`, affine in two parameters — shifts at its innermost end, so the translation lands on the
  // constant and both parameters keep their meaning.
  return { ...s, add: shiftScalar(s.add ?? 0, d) };
}

const shiftPoint = (p: PointSpec, d: Cx): PointSpec => ({
  x: shiftScalar(p.x, d[0]),
  y: shiftScalar(p.y, d[1]),
});

function shiftGeom(g: Geom, d: Cx): Geom {
  return g.kind === "segment"
    ? { ...g, from: shiftPoint(g.from, d), to: shiftPoint(g.to, d) }
    : { ...g, center: shiftPoint(g.center, d) };
}

/**
 * Translate the whole contour by `d`.
 *
 * The radius and the sweep of an arc are untouched, so this is a rigid motion: a closed contour stays
 * closed, the orientation is unchanged, and every winding number about a FIXED pole may change — which
 * is the entire point of being able to do it.
 */
export function translateContour(contour: Contour, d: Cx): Contour {
  if (d[0] === 0 && d[1] === 0) return contour;
  return { ...contour, pieces: contour.pieces.map((p) => ({ ...p, geom: shiftGeom(p.geom, d) })) };
}

/**
 * A grabbable handle.
 *
 * Only one kind so far, and it is the one that cannot go wrong: the radius of an arc whose radius is
 * bound to a parameter. Dragging it edits that parameter, so it is the same edit as the parameter's
 * slider — which means the indented semicircle's two handles are `R → ∞` and `ρ → 0`, the two limits
 * the argument is actually about.
 */
export interface Handle {
  readonly pieceIndex: number;
  readonly kind: "radius";
  /** The parameter this handle edits. */
  readonly param: string;
  /** Where to draw it: on the arc, at its mid-sweep. */
  readonly at: Cx;
  /** The arc's centre, so a drag can read the new radius off the distance to it. */
  readonly centre: Cx;
  readonly pieceName: string;
}

export function handlesOf(contour: Contour, resolved: readonly Resolved[]): Handle[] {
  const out: Handle[] = [];
  contour.pieces.forEach((piece, pieceIndex) => {
    const geom = piece.geom;
    const shape = resolved[pieceIndex];
    if (geom.kind !== "arc" || shape === undefined || shape.kind !== "arc") return;
    // A literal radius has no parameter to edit, and inventing one here would silently add a degree
    // of freedom the template did not declare.
    if (typeof geom.radius === "number") return;
    out.push({
      pieceIndex,
      kind: "radius",
      param: geom.radius.param,
      at: pointAt(shape, 0.5),
      centre: shape.center,
      pieceName: piece.name,
    });
  });
  return out;
}

/**
 * The parameter value that puts a radius handle under `at`.
 *
 * Inverts the handle's own `Scalar`: a radius written `{ param: "R", mul: 2, add: 1 }` is `2R + 1`, so
 * a target radius `r` means `R = (r − 1)/2`. Returns null when the binding cannot be inverted (a zero
 * multiplier pins the radius, and no drag can change it) or when the result leaves the parameter's
 * declared range, rather than clamping silently.
 */
export function radiusDragValue(
  contour: Contour,
  handle: Handle,
  at: Cx,
): { readonly param: string; readonly value: number } | null {
  const piece = contour.pieces[handle.pieceIndex];
  if (piece === undefined || piece.geom.kind !== "arc") return null;
  const scalar = piece.geom.radius;
  if (typeof scalar === "number") return null;
  // The coefficient may itself be a parameter (F1's wedge). That is still invertible — it is a
  // FROZEN `derived` value, so `r = k·R + c` has one live unknown exactly as a literal `k` does —
  // but a coefficient naming a parameter that is not there would otherwise read as `1` and move the
  // handle to a radius the contour never had.
  const mul =
    typeof scalar.mul === "object" ? (contour.params[scalar.mul.param]?.value ?? null) : (scalar.mul ?? 1);
  if (mul === null || mul === 0) return null;
  // A radius that is affine in a SECOND parameter is not a handle this gesture can move: solving for
  // one value would silently pin the other. Records that need it exist (D7's edges); a draggable
  // radius that does not is what this returns null for.
  const offset = scalar.add ?? 0;
  if (typeof offset !== "number") return null;

  const wanted = Math.hypot(at[0] - handle.centre[0], at[1] - handle.centre[1]);
  const value = (wanted - offset) / mul;
  const param = contour.params[scalar.param];
  if (param === undefined || !Number.isFinite(value)) return null;
  const [lo, hi] = param.range;
  if (value < lo || value > hi) return null;
  return { param: scalar.param, value };
}

/** Apply a parameter edit to a contour, leaving its geometry alone. */
export function setParam(contour: Contour, name: string, value: number): Contour {
  const param = contour.params[name];
  if (param === undefined) return contour;
  return { ...contour, params: { ...contour.params, [name]: { ...param, value } } };
}

/** The handle nearest `at`, within `tolerance` plot units, or null. */
export function nearestHandle(
  handles: readonly Handle[],
  at: Cx,
  tolerance: number,
): Handle | null {
  let best: Handle | null = null;
  let bestDist = tolerance;
  for (const h of handles) {
    const d = Math.hypot(h.at[0] - at[0], h.at[1] - at[1]);
    if (d <= bestDist) {
      bestDist = d;
      best = h;
    }
  }
  return best;
}

/** Whether `at` is within `tolerance` plot units of any piece — i.e. whether the user grabbed the
 *  contour itself rather than the empty plane behind it. */
export function onContour(
  resolved: readonly Resolved[],
  at: Cx,
  tolerance: number,
): boolean {
  return resolved.some((g) => distanceToPoint(g, at) <= tolerance);
}

/**
 * WHICH piece `at` is nearest to within `tolerance`, or `-1`.
 *
 * {@link onContour} answers *is the pointer on the curve*, which is the question a GRAB asks — a
 * body drag moves the whole contour, so which piece was under the pointer does not enter it. M8 step
 * 1.10's hover asks a different question, because the piece is the answer: hovering the curve has to
 * light the row in the rail that names that piece, and the readout has to print its name.
 *
 * **The NEAREST within tolerance, not the first.** Every closed contour has pieces meeting at their
 * endpoints, and at a join both are inside any tolerance at once — so "the first that qualifies"
 * would hand the reader whichever piece the record happened to list first, from a pointer sitting
 * equally on two. Ties still go to the earlier piece, which is a tie and not a choice.
 */
export function pieceAt(resolved: readonly Resolved[], at: Cx, tolerance: number): number {
  let best = -1;
  let bestDist = tolerance;
  for (let k = 0; k < resolved.length; k++) {
    const d = distanceToPoint(resolved[k], at);
    if (d <= bestDist) {
      // `<` rather than `<=` here, against the `<=` on the tolerance above: the first comparison
      // admits a piece, the second replaces one, and using `<=` for both would make the LAST of two
      // equidistant pieces win, which is the arbitrary answer this function exists to avoid.
      if (best === -1 || d < bestDist) {
        best = k;
        bestDist = d;
      }
    }
  }
  return best;
}

/**
 * The same curve, walked the other way — M8 step 1.4b.
 *
 * `∮` changes SIGN, which is what makes this worth a button: a reader who has watched the residue
 * theorem give `2πi Σ Res` can watch the same contour give `−2πi Σ Res` and see that the orientation
 * is part of the statement rather than a convention the app applied for them.
 *
 * **Every piece is reversed AND the list is reversed**, because a contour is a CHAIN: reversing the
 * pieces alone would leave each one ending where the next begins in the old direction, and the path
 * would no longer be connected. The roles, ids, names, colours and `lemma` tags ride along unchanged
 * — they are facts about which piece this is, not about which way it is walked.
 *
 * `side` is deliberately NOT flipped. It names which limiting value the piece carries where it lies
 * ON a cut — "above" is above whichever way you walk — so flipping it would silently move the piece
 * onto the other lip, which is a different contour and not this one backwards.
 */
export function reverseContour(contour: Contour): Contour {
  const pieces = [...contour.pieces].reverse().map((piece) => ({
    ...piece,
    geom:
      piece.geom.kind === "segment"
        ? { ...piece.geom, from: piece.geom.to, to: piece.geom.from }
        : { ...piece.geom, theta0: piece.geom.theta1, theta1: piece.geom.theta0 },
  }));
  return { ...contour, pieces };
}
