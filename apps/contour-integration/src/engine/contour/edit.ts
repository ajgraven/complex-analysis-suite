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
import { distanceToPoint, endPoint, pointAt, startPoint } from "../../kernel/geom.js";
import {
  resolve,
  resolveAll,
  type Contour,
  type Geom,
  type LemmaId,
  type Piece,
  type PieceRole,
  type PointSpec,
  type Scalar,
} from "./model.js";

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
  const pieces = [...contour.pieces]
    .reverse()
    .map((piece) => ({ ...piece, geom: reverseGeom(piece.geom) }));
  return { ...contour, pieces };
}

/**
 * One piece walked the other way: endpoints swapped, sweep negated.
 *
 * Extracted from {@link reverseContour} when {@link reversePiece} became its second reader — the
 * second-consumer rule (ADR-0007) arriving inside a module, as `pen.ts`'s `bulgeFromApex` did. Two
 * copies of "which fields carry traversal" is exactly the drift the model's *no orientation flag*
 * decision exists to prevent: a copy that reversed a segment and forgot an arc would leave the two
 * operations disagreeing about what reversal means.
 */
function reverseGeom(geom: Geom): Geom {
  return geom.kind === "segment"
    ? { ...geom, from: geom.to, to: geom.from }
    : { ...geom, theta0: geom.theta1, theta1: geom.theta0 };
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// EDITING THE PIECE LIST — M8 step 4.1.
//
// Everything above moves a contour without changing what it is MADE of; everything below changes the
// list itself. Two rules hold across all six operations, and stating them once is cheaper than
// repeating them six times.
//
// **A REFUSAL RETURNS THE CONTOUR IT WAS GIVEN, BY REFERENCE.** Every operation returns a `Contour`
// rather than `Contour | null`, so they compose, and a caller that ignores the difference still
// cannot end up holding an open contour — the worst it can do is nothing. A caller that wants to say
// *why* nothing happened tests `next === contour`, which is exact precisely because these are pure:
// no operation in this section hands back its own argument for any other reason. (The one case that
// reads as a refusal and
// is not is an identity `reorderPieces`, which legitimately produces an equal contour by rebuilding
// it; it returns a NEW object, so even that is distinguishable.) This follows `moveBranchPoint` and
// `setParam` rather than `joinToOneCut`'s `null`, because those two are also "an edit that may not
// apply", where `joinToOneCut` is a question with an answer.
//
// **THE JOINING PROBLEM, which is the substance of the step.** Removing a piece from a closed chain
// opens it, and reordering one opens it in several places at once; the repair is a straight segment
// across each seam. But a seam's two ends are not points — they are `PointSpec`s, whose coordinates
// are `Scalar`s bound to the template's own parameters, and that is the whole difference between a
// join that survives a drag of `R` and one that is merely correct this afternoon. {@link endpointSpec}
// is where that is decided; its doc records what the affine form can and cannot express, and
// `contourEdit.test.ts` measures the difference rather than asserting it.
//
// **WHAT THE OPERATIONS DO TO THE PIECE COUNT** — measured, because it is not what it first looks
// like. Removing piece `k` from a closed chain opens exactly ONE seam, between `k−1` and `k+1`, and
// it opens none at all when `k`'s own two endpoints coincide (a full turn: the circle template's
// arc, the keyhole's two circles, the dogbone's end caps). So `deletePiece` is `n − 1` for a piece
// that is a loop and `n` — one removed, one join minted — for a piece that is not. A `reorderPieces`
// that is a cyclic ROTATION opens no seam and is `n`; swapping the first two pieces opens three
// seams in the four-sided shapes and the wedge and two in the keyhole and the dogbone, where the
// swapped pair includes a full turn. `insertPiece` is always `n + 1`, and the other three never
// touch the list's length. The plan's gate asks for "closure and piece count invariants": those are
// the invariants, and they are per-case rather than a single number.

/**
 * When two endpoints are the SAME point.
 *
 * `kernel/geom.ts`'s `isClosed` decides closure at a default `1e-9`, and both the ledger and
 * `integrate.ts` call it with that default — so this is not a free choice. A looser number here
 * would leave a seam unjoined that the ledger still calls open; a tighter one would mint a
 * zero-length piece into the reader's piece list at a seam the ledger was perfectly happy with. It
 * is kept in step BY HAND, because `isClosed` publishes its tolerance as a parameter default rather
 * than as an exported constant, and `contourEdit.test.ts` therefore asserts the agreement at both
 * ends (a 1e-10 gap: no join, and `isClosed` says closed; a 1e-8 gap: a join, and `isClosed` said
 * open) rather than trusting this paragraph.
 */
const JOIN_TOL = 1e-9;

/** Are these the same point, at {@link JOIN_TOL}? */
const meets = (a: Cx, b: Cx): boolean => Math.hypot(a[0] - b[0], a[1] - b[1]) <= JOIN_TOL;

/**
 * Multiply an affine scalar by a LITERAL, staying affine — or `null` where the form cannot hold it.
 *
 * `(m·P + c)·k` is `(m·k)·P + c·k`, so the coefficient and the offset each take the factor and the
 * result is affine in the same parameter. The offset may itself be a `Scalar` (D7's `b − η`), which
 * takes the factor by the same rule one level down.
 *
 * The one shape that has nowhere to go is a PARAMETER-SUPPLIED coefficient — F1's wedge, whose
 * `mul` is `{ param }` — because `Scalar.mul` is `number | { param }` and there is no seat in it for
 * the product of a parameter and a literal. Two exact factors escape that: `k === 1` is the identity
 * and is returned untouched (which is why an arc starting at `theta = 0` composes even when its
 * radius carries a `derived` coefficient, since `Math.cos(0)` is exactly 1), and `k === 0`
 * annihilates the whole form to the literal zero however it is written.
 */
function scaleScalar(s: Scalar, k: number): Scalar | null {
  if (k === 1) return s;
  if (typeof s === "number") return s * k;
  if (k === 0) return 0;
  if (typeof s.mul === "object") return null;
  const add = s.add === undefined ? undefined : scaleScalar(s.add, k);
  if (add === null) return null;
  return { param: s.param, mul: (s.mul ?? 1) * k, ...(add === undefined ? {} : { add }) };
}

/**
 * Add two affine scalars, staying inside `Scalar`. Total: there is no shape this cannot hold.
 *
 * **That totality is a finding rather than a design goal, and it is the one place this module
 * exceeded what the step expected of it.** Two scalars bound to the SAME parameter combine by adding
 * coefficients, which is obvious. Two bound to DIFFERENT parameters look inexpressible in an "affine
 * function of one named parameter" — and are not, because `add` may itself be a `Scalar`: `a + R`
 * is `{ param: "a", mul: 1, add: { param: "R" } }`, exactly the nesting D7's `b − η` already uses
 * and `resolveScalar` already recurses through. So a centre bound to one parameter and a radius
 * bound to another still yield a SYMBOLIC endpoint, live under a drag of either.
 *
 * Nesting cannot run away: only {@link endpointSpec} adds, it adds once per endpoint, and a segment's
 * endpoints — which is what every join it builds is made of — are returned unchanged. Depth stays at
 * the one level the model's own doc describes.
 */
function addScalar(a: Scalar, b: Scalar): Scalar {
  if (typeof b === "number") return b === 0 ? a : shiftScalar(a, b);
  if (typeof a === "number") return a === 0 ? b : shiftScalar(b, a);
  if (a.param === b.param && typeof a.mul !== "object" && typeof b.mul !== "object") {
    return { param: a.param, mul: (a.mul ?? 1) + (b.mul ?? 1), add: addScalar(a.add ?? 0, b.add ?? 0) };
  }
  // Different parameters, or a coefficient that is one: `b` rides in `a`'s innermost `add`, which is
  // where `shiftScalar` puts a literal for the same reason — the constant end of the form.
  return { ...a, add: addScalar(a.add ?? 0, b) };
}

/**
 * Where a piece BEGINS or ENDS, as a symbolic `PointSpec` — or `null` when the composition cannot
 * stay inside `Scalar`.
 *
 * A segment's endpoints are specs already, so they come back untouched. An arc's are
 * `center + radius·(cos θ, sin θ)`, and the surprise is how often that stays affine: `radius` is
 * affine in one parameter, `cos θ` is a literal, and multiplying an affine form by a literal is
 * affine (see {@link scaleScalar}). **Every arc in all ten sandbox templates is expressible** — a
 * semicircle of radius `R` about the origin starting at `θ = 0` has endpoint x `{ param: "R", mul: 1 }`,
 * and the `R → ∞` arc's far end is `{ param: "R", mul: -1 }`.
 *
 * What it cannot express, and each for its own reason:
 *
 * - **A `theta` bound to a parameter.** `cos` of a parameter is not affine in it, and no widening of
 *   the form short of an expression language would make it so. Nothing in the gallery does this;
 *   the test constructs one, because the fallback needs a case to be measured against.
 * - **A parameter-supplied `mul` on the radius** (F1's `derived` rotation), except where `cos θ` or
 *   `sin θ` is exactly 1 or 0 — {@link scaleScalar}'s note says why.
 *
 * It CAN express a centre bound to a different parameter than the radius, which the step expected to
 * be a refusal; {@link addScalar}'s note says why it is not.
 *
 * **WHY THE DIFFERENCE IS REAL, and the measurement.** A symbolic join is a statement about the
 * template — "this segment runs from wherever `rho` puts the indentation's end to wherever `R` puts
 * the big arc's start" — so it stays a correct join as the parameter MOVES. A literal one is only a
 * correct join at the parameter values that were current when it was minted. Measured over the
 * indented semicircle with its `right` segment deleted: the join is symbolic, and driving `R` from 8
 * to 40 and `rho` from 0.05 to 0.3 leaves the contour closed with a seam gap of 0. Measured over a
 * constructed arc whose sweep is bound to `phi` (which forces the literal branch): the join is
 * closed at `phi = 1`, and moving `phi` to 2 opens it by **1.918** — the contour is simply broken,
 * and the ledger will correctly refuse the residue theorem on it. The operations do not pretend
 * otherwise: the fallback is taken because a join at today's numbers beats no join at all, not
 * because the two are equivalent.
 */
export function endpointSpec(geom: Geom, which: "start" | "end"): PointSpec | null {
  if (geom.kind === "segment") return which === "start" ? geom.from : geom.to;
  const theta = which === "start" ? geom.theta0 : geom.theta1;
  if (typeof theta !== "number") return null;
  const dx = scaleScalar(geom.radius, Math.cos(theta));
  const dy = scaleScalar(geom.radius, Math.sin(theta));
  if (dx === null || dy === null) return null;
  return { x: addScalar(geom.center.x, dx), y: addScalar(geom.center.y, dy) };
}

/** The literal fallback: a point read off the resolved geometry, correct at today's parameters. */
const literalSpec = (p: Cx): PointSpec => ({ x: p[0], y: p[1] });

const startSpec = (piece: Piece, shape: Resolved): PointSpec =>
  endpointSpec(piece.geom, "start") ?? literalSpec(startPoint(shape));

const endSpec = (piece: Piece, shape: Resolved): PointSpec =>
  endpointSpec(piece.geom, "end") ?? literalSpec(endPoint(shape));

/**
 * The role a piece the reader has just created starts in.
 *
 * `free` and not `vanish`, deliberately: a piece that appeared to close a gap has no part in the
 * argument yet, and step 4.1's own rule is that the ledger reports no target value while any piece
 * is `free` and names the undisposed one. Defaulting it to anything else would let an edit quietly
 * assert something about the integrand that nobody claimed.
 */
const NEW_ROLE: PieceRole = "free";

/** The shell's palette, as in `pen.ts`: `Piece.colour` is a union of six, not a number. */
const PALETTE = [0, 1, 2, 3, 4, 5] as const;

/** What a minted piece is called. A join and an insertion are named apart because "why is this
 *  piece here" has two answers, and the rail is where the reader asks it. */
const JOIN = { stem: "join", label: "straight join" } as const;
/** Two labels, because {@link insertPiece} honours its `kind` in the only way that is true: a
 *  bulge-0 arc is the CHORD of the arc it was asked for, and the name says so. */
const INSERTED = {
  segment: { stem: "piece", label: "inserted segment" },
  arc: { stem: "piece", label: "inserted chord" },
} as const;

/** The first `stem1`, `stem2`, … not already taken — `branchEdit.ts`'s `freshId`, whose form the
 *  piece list should share so that a reader meets one convention and not two. */
function mint(used: Set<string>, stem: string): { readonly id: string; readonly n: number } {
  for (let n = 1; ; n++) {
    const id = `${stem}${n}`;
    if (!used.has(id)) {
      used.add(id);
      return { id, n };
    }
  }
}

/**
 * A straight piece from one spec to another — the join, and the insertion.
 *
 * Numbered in its NAME as well as its id, following `pen.ts`'s "drawn segment 3": the rail shows
 * names, and two rows reading the same thing is what research 07 rule 2 calls an anonymous polyline
 * by another route.
 */
function straightPiece(
  from: PointSpec,
  to: PointSpec,
  used: Set<string>,
  at: number,
  what: { readonly stem: string; readonly label: string },
): Piece {
  const { id, n } = mint(used, what.stem);
  return {
    id,
    name: `${what.label} ${n}`,
    geom: { kind: "segment", from, to },
    role: NEW_ROLE,
    colour: PALETTE[at % PALETTE.length],
  };
}

/**
 * Close every seam this piece list has, including the one that wraps.
 *
 * The joining rule, in one place, because {@link deletePiece} and {@link reorderPieces} must not
 * differ about it. Walking the list in a CIRCLE rather than end to end is what makes it close the
 * loop: the seam between the last piece and the first is a seam like any other, and it is precisely
 * the one that a deletion at either end of the list opens.
 *
 * A one-piece list is not a special case — its wrap seam is its own two ends, so an open single
 * piece is closed by a chord and a full turn is left alone, which is the right answer to both.
 */
function rejoin(contour: Contour, pieces: readonly Piece[]): Contour {
  const used = new Set(pieces.map((p) => p.id));
  const shapes = pieces.map((p) => resolve(p.geom, contour.params));
  const out: Piece[] = [];
  for (let k = 0; k < pieces.length; k++) {
    out.push(pieces[k]);
    const j = (k + 1) % pieces.length;
    if (meets(endPoint(shapes[k]), startPoint(shapes[j]))) continue;
    out.push(
      straightPiece(endSpec(pieces[k], shapes[k]), startSpec(pieces[j], shapes[j]), used, out.length, JOIN),
    );
  }
  return { ...contour, pieces: out };
}

/**
 * Walk ONE piece the other way — and refuse when that would open the chain.
 *
 * **It usually would.** Reversing piece `k` swaps its endpoints, so the seam to `k−1` now wants
 * `k`'s old start and the seam to `k+1` wants its old end: both hold only if the piece begins and
 * ends at the SAME point. That is not an edge case — it is true of exactly the full turns (the
 * circle template's arc, the keyhole's two circles, the dogbone's end caps) and of nothing else, so
 * a semicircle's diameter, every side of the square and both lips of a keyhole are refused.
 *
 * **Refused, and not repaired.** The two other things this could do are both worse. Joining the
 * seams would keep the contour closed while producing a path that doubles back over itself twice —
 * a different curve, with different winding numbers, presented as "that piece, reversed". Leaving it
 * open would hand the reader a contour the ledger must refuse, from a button that said nothing about
 * doing so. The honest operation on a chain is {@link reverseContour}, which reverses the pieces AND
 * the list and is always available; this one exists for the loop pieces, where "which way round does
 * this circle go" is a real question with a local answer.
 *
 * Refusal is the contour itself, by reference — see the section header. `side` is not flipped, for
 * the reason {@link reverseContour} gives.
 */
export function reversePiece(contour: Contour, id: string): Contour {
  const index = contour.pieces.findIndex((p) => p.id === id);
  if (index < 0) return contour;
  const shape = resolve(contour.pieces[index].geom, contour.params);
  if (!meets(startPoint(shape), endPoint(shape))) return contour;
  return {
    ...contour,
    pieces: contour.pieces.map((p, k) => (k === index ? { ...p, geom: reverseGeom(p.geom) } : p)),
  };
}

/**
 * Put the pieces in the order `ids` names, and re-join whatever that opens.
 *
 * `ids` must be a PERMUTATION of the ids the contour has — same length, every one known, none
 * twice. Anything else is refused whole rather than interpreted: a list that is one short is a
 * deletion the caller did not ask for, and one with a duplicate would put the same piece on screen
 * twice with one id, which every reader of the list (the rail's hover, the ledger's rows, the
 * codec) resolves by id.
 *
 * Reordering a closed chain generally opens it — a cyclic rotation opens nothing, an adjacent
 * transposition opens up to three seams — so the result runs through {@link rejoin}, and the piece
 * count grows by the number of seams the new order opened. The alternative, refusing any order that
 * breaks the chain, would refuse nearly every reorder a reader could ask for.
 */
export function reorderPieces(contour: Contour, ids: readonly string[]): Contour {
  if (ids.length !== contour.pieces.length) return contour;
  const byId = new Map(contour.pieces.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const next: Piece[] = [];
  for (const id of ids) {
    const piece = byId.get(id);
    if (piece === undefined || seen.has(id)) return contour;
    seen.add(id);
    next.push(piece);
  }
  return rejoin(contour, next);
}

/**
 * Remove a piece, joining its neighbours across the gap so the chain stays closed.
 *
 * **Refuses below two remaining pieces**, which for the sandbox's templates means the circle (one
 * piece) and both semicircles (two). The reason is that a join cannot rescue what is left: delete
 * the arc from a semicircle and the "contour" is a diameter and a chord laid back along it, a curve
 * that encloses nothing, has zero area and is not a shape the reader asked for. Two remaining pieces
 * is the least that can bound anything.
 *
 * The count is `n − 1` when the removed piece was a full turn and `n` otherwise — see the section
 * header, which measures it. The join is minted with role `free`, so the ledger says the contour has
 * an undisposed piece rather than quietly adopting the deleted piece's role for it.
 */
export function deletePiece(contour: Contour, id: string): Contour {
  if (contour.pieces.length < 3) return contour;
  const kept = contour.pieces.filter((p) => p.id !== id);
  if (kept.length === contour.pieces.length) return contour;
  return rejoin(contour, kept);
}

/**
 * Put a new piece between `afterId`'s end and the next piece's start.
 *
 * **Both kinds produce a SEGMENT, and that is the representation talking rather than a shortcut.**
 * An arc here is specified by a bulge, and `pen.ts` fixes bulge 0 to be a straight chord — below
 * {@link STRAIGHT} `arcThroughBulge` returns null precisely so that a drag ending where it started
 * leaves a segment rather than an arc of enormous radius. So "the arc through these two endpoints
 * with bulge 0" IS the chord; the only way to return something arc-shaped would be to invent a
 * radius the caller never gave, which would put geometry on screen that nothing in the reader's
 * gesture asked for. The `kind` argument is honoured by producing the piece the reader will then
 * bow with the pen's own gesture, and step 4.3's list editor can say so.
 *
 * On a CLOSED contour the two endpoints coincide, so the inserted piece has zero length — which is
 * correct and not a degeneracy to guard against: it is a real row in the piece list that the reader
 * can immediately drag, rename and give a role, and it leaves closure exactly as it was. The
 * operation's other use is after a {@link reorderPieces} that a reader wants to close by hand.
 */
export function insertPiece(contour: Contour, afterId: string, kind: "segment" | "arc"): Contour {
  const index = contour.pieces.findIndex((p) => p.id === afterId);
  if (index < 0) return contour;
  const shapes = resolveAll(contour);
  const j = (index + 1) % contour.pieces.length;
  const used = new Set(contour.pieces.map((p) => p.id));
  const piece = straightPiece(
    endSpec(contour.pieces[index], shapes[index]),
    startSpec(contour.pieces[j], shapes[j]),
    used,
    contour.pieces.length,
    INSERTED[kind],
  );
  return {
    ...contour,
    pieces: [...contour.pieces.slice(0, index + 1), piece, ...contour.pieces.slice(index + 1)],
  };
}

/**
 * Rename a piece.
 *
 * **One argument, not the plan's `(name, nameLatex)`.** `Piece` has no `nameLatex` field and should
 * not grow one: a piece's `name` is already a sentence in this app's `$…$` convention — the circle
 * template's is `the circle $|z - a| = R$` and the indentation's is
 * `the $\rho \to 0$ indentation over $z = 0$` — so a second field would be a second spelling of one
 * thing, and the first time the two disagreed the rail and the derivation prose would print
 * different names for the same piece.
 *
 * An empty or all-whitespace name is refused rather than stored. A nameless row in the rail is the
 * anonymous polyline research 07 rule 2 forbids, and it is what the ledger's KILL rows and the
 * accumulator would then print. The name is trimmed, so "refused" and "stored" divide on the same
 * string the app will show.
 */
export function renamePiece(contour: Contour, id: string, name: string): Contour {
  const trimmed = name.trim();
  if (trimmed === "") return contour;
  if (!contour.pieces.some((p) => p.id === id)) return contour;
  return { ...contour, pieces: contour.pieces.map((p) => (p.id === id ? { ...p, name: trimmed } : p)) };
}

/**
 * Set a piece's role, and the lemma that goes with it.
 *
 * **A role that is not `vanish` CLEARS the lemma.** `Piece.lemma` is a statement about how a
 * vanishing piece is disposed of — which of research 03 §14's eight the ledger must discharge — and
 * on a `target` or `residue` piece there is nothing for it to be about: no reader would look at it,
 * so a stale one would be a fact in the model that nothing can falsify and the codec would carry it
 * into permalinks for ever. Clearing it also means a reader who moves a piece to `target` and back
 * to `vanish` gets the ledger's shape-reading default rather than a lemma they chose in a different
 * context.
 *
 * `vanish` with no lemma is a legitimate state and is stored as one: it is the sandbox's usual case,
 * where the right lemma is a fact about the integrand and the ledger reads it off the shape.
 */
export function setRole(
  contour: Contour,
  id: string,
  role: PieceRole,
  lemma?: LemmaId,
): Contour {
  if (!contour.pieces.some((p) => p.id === id)) return contour;
  const keep = role === "vanish" ? lemma : undefined;
  return {
    ...contour,
    pieces: contour.pieces.map((piece) => {
      if (piece.id !== id) return piece;
      // Destructured away rather than overwritten with `undefined`: the field must be ABSENT, so
      // that a deep comparison, `JSON.stringify` in the codec and `"lemma" in piece` all agree that
      // the piece has none.
      const { lemma: previous, ...rest } = piece;
      // An edit that changes nothing hands back the very piece, so that a caller diffing the list
      // to decide what to redraw sees no churn from a reader clicking the role a piece already has.
      if (role === piece.role && keep === previous) return piece;
      return keep === undefined ? { ...rest, role } : { ...rest, role, lemma: keep };
    }),
  };
}
