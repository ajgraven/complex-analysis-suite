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
import {
  arcLength,
  distanceToPoint,
  endPoint,
  joinTolerance,
  pointAt,
  startPoint,
} from "../../kernel/geom.js";
import {
  resolve,
  resolveAll,
  resolveScalar,
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

/**
 * Apply a parameter edit to a contour, leaving its geometry alone.
 *
 * **What this now GUARANTEES, for every caller:** the stored value is finite and inside the
 * parameter's declared `range`. A value outside it lands on the nearer bound; a non-finite one is
 * refused, returning the contour BY REFERENCE (the section header's rule) rather than clamping
 * `NaN` to something that looks deliberate.
 *
 * It did neither before, and the range was therefore a suggestion: the sliders stop at `1e6` but
 * nothing else did, so a hand-edited or stale link could seat `R` at `1e7` — measured, a contour the
 * app then declared not closed, on `isClosed`'s old absolute tolerance. That half is fixed at its
 * own end (see {@link joinTolerance}); this is the other half, and it is the one that keeps the
 * value a reader sees, the value the slider shows and the value the ledger reads the same number.
 */
export function setParam(contour: Contour, name: string, value: number): Contour {
  const param = contour.params[name];
  if (param === undefined) return contour;
  if (!Number.isFinite(value)) return contour;
  const [lo, hi] = param.range;
  const clamped = Math.min(hi, Math.max(lo, value));
  return { ...contour, params: { ...contour.params, [name]: { ...param, value: clamped } } };
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
//
// `splitPiece` (step 4.3) is the exception that shows the shape of that rule: it is `n + 1` with no
// cases at all, because it opens no seam to begin with — the two halves share the very `PointSpec`
// (or `theta` `Scalar`) they meet at, so there is nothing for {@link rejoin} to close and closure is
// preserved by construction rather than by repair.

/**
 * When two endpoints are the SAME point.
 *
 * `kernel/geom.ts`'s `isClosed` decides closure at `joinTolerance(pieces)`, and both the ledger and
 * `integrate.ts` call it with that default — so this is not a free choice. A looser number here
 * would leave a seam unjoined that the ledger still calls open; a tighter one would mint a
 * zero-length piece into the reader's piece list at a seam the ledger was perfectly happy with.
 *
 * It used to be kept in step by hand, as a second literal `1e-9`; it is now the SAME FUNCTION, so
 * the two cannot drift and both scale with the contour — see {@link joinTolerance} for why an
 * absolute number was wrong. `contourEdit.test.ts` still asserts the agreement at both ends (a
 * 1e-10 gap: no join, and `isClosed` says closed; a 1e-8 gap: a join, and `isClosed` said open)
 * rather than trusting this paragraph.
 */
const meets = (a: Cx, b: Cx, tol: number): boolean => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol;

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

/**
 * What a SPLIT's second half is called.
 *
 * A third stem beside {@link JOIN} and {@link INSERTED} for their own reason: "why is this piece
 * here" has a third answer, and a reader who meets `part 1` in the rail has been told something a
 * shared `piece 3` would not have told them. The FIRST half keeps the original piece's id and name
 * — see {@link splitPiece} — so only one name is minted per split.
 */
const SPLIT = { stem: "part", label: "split part" } as const;

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
  const tol = joinTolerance(shapes);
  const out: Piece[] = [];
  for (let k = 0; k < pieces.length; k++) {
    out.push(pieces[k]);
    const j = (k + 1) % pieces.length;
    if (meets(endPoint(shapes[k]), startPoint(shapes[j]), tol)) continue;
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
  // The whole contour's scale, not the piece's: the seam this decides is the one the ledger reads,
  // and `isClosed` is asked about the list.
  if (!meets(startPoint(shape), endPoint(shape), joinTolerance(resolveAll(contour)))) return contour;
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
 * Interpolate between two affine scalars at a LITERAL fraction — or `null` where the form cannot
 * hold it.
 *
 * `(1 − t)·a + t·b`, built from the two helpers {@link endpointSpec} already composes an arc's
 * endpoint out of: {@link scaleScalar} takes each end's literal factor, {@link addScalar} puts the
 * two together and is total. So the refusal is inherited rather than new — it is exactly
 * `scaleScalar`'s one shape, a PARAMETER-supplied coefficient, and nothing else.
 *
 * **`t` is frozen at the split, and that is the invariant worth having rather than a limitation.**
 * The alternative reading — "the vertex stays at the point it was dropped on" — is what the literal
 * fallback gives, and it is the one that comes apart: the square's right side runs from
 * `(N+½, −(N+½))` to `(N+½, N+½)`, so a vertex pinned at `(2.5, −1.25)` while `N` moves 2 → 9 sits
 * **7.0 units off** the side it is supposed to divide, and the contour becomes a dogleg through a
 * point nothing put there (measured in `contourEdit.test.ts`, against the same fixture that shows
 * the symbolic form staying a quarter of the way along at every `N`). Holding the FRACTION keeps
 * the two halves collinear with each other and with the side they came from, at every value of
 * every parameter. What it costs is that the vertex SLIDES under a parameter drag — which is the
 * same statement, read by a reader watching the screen.
 */
function lerpScalar(a: Scalar, b: Scalar, t: number): Scalar | null {
  const lo = scaleScalar(a, 1 - t);
  const hi = scaleScalar(b, t);
  if (lo === null || hi === null) return null;
  return addScalar(lo, hi);
}

/** One piece divided in two: where along it, and the two geometries. */
interface Division {
  /** Where the vertex falls along the piece, in `[0, 1]` — outside it the split is refused. */
  readonly fraction: number;
  readonly first: Geom;
  readonly second: Geom;
}

/**
 * A segment divided at the foot of the perpendicular from `at`.
 *
 * The fraction is NOT clamped into `[0, 1]`, and **the sweep corrected what this paragraph used to
 * claim about that.** It said a clamp would turn "I clicked past the end" into a split AT the end —
 * a zero-length half minted rather than refused — and the mutant that adds the clamp survived,
 * because it cannot: {@link splitPiece}'s floor refuses `fraction = 0` exactly as it refuses
 * `fraction = −0.3`, so the two forms are indistinguishable from outside. The clamp is an
 * equivalent mutant and the unclamped form is kept for a smaller reason than the one claimed — it
 * is the honest quantity, *where along this line the foot of the perpendicular falls*, and the
 * floor is left as the one place that decides whether that is a division at all.
 */
/**
 * How far along the chord `from → to` the point `at` projects.
 *
 * **No guard on a zero-length segment, and the sweep is why.** One was written here, and nothing
 * could kill it: a point has length 0, so the fraction comes out `0/0` and {@link splitPieceAt}'s
 * floor refuses it as a degenerate half — which it IS, twice over. The guard was one rule spelled
 * in two places, which is how two answers come to disagree. What makes that safe rather than clever
 * is the shape the floor is written in: a NEGATED `>`, so a `NaN` fails it, and the refusal is
 * pinned by a test rather than by this paragraph.
 */
function segmentFraction(from: Cx, to: Cx, at: Cx): number {
  const vx = to[0] - from[0];
  const vy = to[1] - from[1];
  return ((at[0] - from[0]) * vx + (at[1] - from[1]) * vy) / (vx * vx + vy * vy);
}

function segmentDivide(
  geom: Extract<Geom, { readonly kind: "segment" }>,
  from: Cx,
  to: Cx,
  fraction: number,
): Division {
  const vx = to[0] - from[0];
  const vy = to[1] - from[1];
  const x = lerpScalar(geom.from.x, geom.to.x, fraction);
  const y = lerpScalar(geom.from.y, geom.to.y, fraction);
  const mid: PointSpec =
    x === null || y === null
      ? literalSpec([from[0] + fraction * vx, from[1] + fraction * vy])
      : { x, y };
  // The two halves share `mid` BY REFERENCE, so the seam between them is not a seam that has to be
  // closed to a tolerance — it is one `PointSpec` read twice, and no parameter can open it.
  return {
    fraction,
    first: { kind: "segment", from: geom.from, to: mid },
    second: { kind: "segment", from: mid, to: geom.to },
  };
}

/**
 * An arc divided at the angle of `at` PROJECTED onto the circle.
 *
 * **The decision the step asks for, and why it is not the other one.** The reader's point will not
 * be on the arc — it is a pointer within a grab radius of it — so the operation must either move the
 * vertex onto the curve or move the curve onto the vertex. It moves the vertex, and there are four
 * reasons, of which the third is the one that would have bitten:
 *
 *  1. **It is what the operation IS.** Everything in this section changes the piece LIST; nothing in
 *     it changes the curve. A split that honoured the point would be a geometry edit wearing a
 *     list edit's name, and a silent one — the reader asked for a vertex and would get a different
 *     contour, with different winding numbers and a different `∮`.
 *  2. **The other reading is under-determined.** An arc through two points needs a third number;
 *     "the two arcs through (start, at) and (at, end)" names four points and no radii, so honouring
 *     the point means INVENTING two circles the reader never gave — which is precisely the
 *     objection {@link insertPiece} records against returning an arc from a bulge-0 request. The
 *     place a reader supplies that number is the pen's bow gesture.
 *  3. **The ledger.** `ledger.ts`'s `arcRadius` returns null for an arc whose centre is not exactly
 *     `(0, 0)`, because every certified bound in `kernel/bounds/` reasons on `|z| = R` about the
 *     ORIGIN (M4.6c). Two halves on two new circles have two new centres, generically neither at
 *     the origin — so honouring the point would silently DESTROY the `≤` on a vanishing arc that
 *     had one, from a gesture the reader thinks adds a vertex. Projecting shares `center` and
 *     `radius` by reference, so the bound survives bit for bit.
 *  4. **It stays symbolic.** The shared centre and radius ride along untouched, so both halves are
 *     still bound to `R` and still follow the `R → ∞` animation. A circle fitted to the reader's
 *     point would have to be literal — the affine form cannot express a centre computed from three
 *     float positions — and the halves would come off the parameter for nothing.
 *
 * **What it costs, measured.** The vertex does not land under the pointer. The gesture's grab radius
 * is 11 CSS px, so the worst case is the whole of it: at the sandbox's default camera (half-height
 * 2, a 600 px stage) a pixel is 1/150 of a unit, so the vertex can appear up to **0.073 units** from
 * where the reader pressed, and further as they zoom out. `contourEdit.test.ts` measures one such
 * projection at 0.1. That is visible, and it is correct, since the only place a vertex ON the arc
 * can be is on the arc — and the drag then moves it, which is what makes the cost recoverable
 * rather than merely stated.
 *
 * The angle is taken as a FRACTION of the sweep, for {@link lerpScalar}'s reason and so that one
 * rule covers both kinds of piece. Nothing in the ten templates binds a `theta` to a parameter
 * (`endpointSpec`'s own measurement), so the symbolic and literal forms agree everywhere in the
 * corpus and the choice is made on the principle rather than on a difference.
 */
/**
 * How far round the arc the point `at` lies, as a fraction of its sweep.
 *
 * A zero sweep is a point on a circle, and {@link segmentFraction}'s note applies unchanged: the
 * fraction comes out non-finite, the piece's length is zero, and the floor refuses it.
 */
function arcFraction(
  geom: Extract<Geom, { readonly kind: "arc" }>,
  params: Contour["params"],
  at: Cx,
): number {
  const cx = resolveScalar(geom.center.x, params);
  const cy = resolveScalar(geom.center.y, params);
  const theta0 = resolveScalar(geom.theta0, params);
  const sweep = resolveScalar(geom.theta1, params) - theta0;
  const turn = Math.PI * 2;
  // The offset from the start angle, read in the sweep's OWN direction: `[0, 2π)` for a positive
  // sweep and `(−2π, 0]` for a negative one. Reducing modulo a turn first is what lets a full
  // circle — whose `theta1` is `theta0 + 2π` — be divided at any angle at all, and taking the
  // direction from the sweep is what keeps a clockwise arc's fraction positive.
  const raw = (((Math.atan2(at[1] - cy, at[0] - cx) - theta0) % turn) + turn) % turn;
  return (sweep < 0 ? raw - turn : raw) / sweep;
}

function arcDivide(
  geom: Extract<Geom, { readonly kind: "arc" }>,
  params: Contour["params"],
  fraction: number,
): Division {
  // The literal fallback is {@link lerpScalar}'s own, and it is kept rather than refused for
  // `endpointSpec`'s reason: a vertex at today's numbers beats no vertex at all. Resolved here
  // rather than carried in from the fraction, so the two entry points cannot differ on it.
  const theta0 = resolveScalar(geom.theta0, params);
  const sweep = resolveScalar(geom.theta1, params) - theta0;
  const mid = lerpScalar(geom.theta0, geom.theta1, fraction) ?? theta0 + fraction * sweep;
  // Spread, so `center` and `radius` are the very objects the original carried — reason 3 above is
  // a claim about identity, and a rebuilt copy would satisfy it only until someone rounded one.
  return { fraction, first: { ...geom, theta1: mid }, second: { ...geom, theta0: mid } };
}

/**
 * The role each half of a divided piece carries.
 *
 * **A role the ledger DECIDES is inherited; a role it takes ON FAITH about the whole piece is
 * not.** That is the rule, and it falls straight out of what the ledger does with each of the five:
 *
 *  - `vanish` is re-derived per piece. Its lemma is discharged from the half's own resolved
 *    geometry, so inheriting it re-asserts a claim that is immediately re-checked — and where the
 *    half cannot carry it (a square side divided in two is no longer a side of `Γ_N`, and
 *    `kernel/bounds/squareSide.ts` refuses any half-width that is not `N + ½`) the ledger refuses
 *    by name instead of believing it. A falsifiable inheritance is a safe one.
 *  - `residue` and `free` claim nothing a half could fail: the first says the piece encircles poles,
 *    which the winding numbers decide for themselves, and the second says the piece is merely
 *    computed.
 *  - `target` and `reproduces` are DECLARED and believed. Their KILL rows read *"declared by its
 *    role"* and *"the piece is a constant multiple of the target"*, with nothing checking either —
 *    M7.3 measured that second one: four templates close for B1 because the ledger takes
 *    `reproduces` on faith. And the claim is about the WHOLE piece. Half of the target piece is not
 *    the target; half of a piece that returns `−λ` times the unknown returns something else. So
 *    **both halves go `free`**, which is the same `{@link NEW_ROLE}` every other minted piece in
 *    this module starts in, and for the same reason: an edit may not assert what nobody claimed.
 *
 * **What the reader sees, and why it is the honest outcome.** Dividing a `residue` circle changes no
 * number at all — the curve is the same curve, so `∮` is bit-identical. Dividing the `target` piece
 * stops the app reporting a target value, loudly: `ledger.ts` hands one out only when
 * `targets.length === 1` and nothing is `free`, so two `free` halves produce a COVER row naming
 * them. The reader's argument really is gone — they cut the piece their unknown was defined on —
 * and the app says so rather than quietly reporting twice the unknown, which is what inheriting
 * would have produced (two `target` rows, each contributing one copy).
 *
 * The rejected alternative was the simple one: both halves inherit whatever the piece had, on the
 * grounds that the curve is unchanged so the claims are unchanged. It is right for three roles and
 * silently false for two, and the two it is false for are the two the ledger cannot catch.
 */
function halfRole(role: PieceRole): PieceRole {
  return role === "target" || role === "reproduces" ? NEW_ROLE : role;
}

/**
 * Divide one piece in two at `at`, leaving the curve exactly as it was.
 *
 * **NOT {@link insertPiece}.** That puts a new piece BETWEEN two existing ones, and on a closed
 * contour the piece it mints has zero length because the two endpoints coincide. This one divides a
 * piece the reader points at, so the count is always `n + 1` — the one operation in this section
 * whose count rule has no cases, because it opens no seam: the halves meet at a `PointSpec` (or a
 * `theta` Scalar) they SHARE, and their outer ends are the original's own, untouched.
 *
 * `at` is the reader's point, not a point on the piece, so it is PROJECTED — onto the line for a
 * segment, onto the circle for an arc. {@link arcSplit} argues that choice at length; the short
 * version is that this operation changes the piece list and never the curve.
 *
 * **The join point is symbolic wherever the affine form holds it**, which is the same question
 * {@link endpointSpec} answers for a seam and the same answer: `(1 − t)·a + t·b` composes through
 * {@link scaleScalar} and {@link addScalar}, so a vertex dropped a quarter of the way along the
 * rectangle's right-hand side is `x = R`, `y = −R/2` and stays on that side as `R` is dragged.
 * {@link lerpScalar} measures what the literal fallback costs when the form cannot hold it (5.0
 * units of dogleg over an `R` of 4 → 9), and takes it anyway for `endpointSpec`'s reason: a vertex
 * at today's numbers beats no vertex at all.
 *
 * **Three refusals, each returning the contour BY REFERENCE** (the section header's rule):
 *
 *  1. **An unknown id.** Nothing to divide.
 *  2. **A point that is not on the piece**, judged with `distanceToPoint` — the very function
 *     `onContour` and `pieceAt` hit-test with, so "on the piece" means one thing to the gesture
 *     that starts a split and to the operation that performs it. The default `tolerance` is
 *     {@link joinTolerance}, which is the caller saying *the point is already on the piece*; a caller
 *     working from a pointer passes its own grab radius, because only it knows the zoom.
 *  3. **A degenerate half.** Both halves must be longer than {@link joinTolerance}, measured with
 *     `arcLength` — which is the same threshold, and therefore the same sentence, as {@link meets}:
 *     a half shorter than that is one whose two ends MEET, so it is a point wearing a piece's row
 *     in the rail. Stated as a length rather than as `0 < fraction < 1` because it is one
 *     expression covering both the between-ness and the degeneracy, for both kinds of piece: a
 *     negative fraction fails it on the first clause, and a piece that is ALREADY a point — a
 *     zero-length segment, a zero-sweep arc — fails both, arriving as a non-finite fraction against
 *     a length of zero. That is why neither helper carries a degeneracy guard: the sweep could not
 *     kill one, because this is the same rule and it is already here.
 *
 * **The first half keeps the original's id and name**; only the second is minted. A piece's name may
 * be the reader's own words (`renamePiece` exists so that it can be), and discarding them to mint a
 * matched pair would take away something they typed; the id matters more still, because the rail's
 * rows, the hover link, the step focus sets and the drill all address pieces by it, and re-minting
 * both would dangle every one of those references. The alternative — two fresh ids, so that neither
 * half claims to BE the piece that was divided — was rejected on that.
 *
 * The second half takes the NEXT palette colour, so that the division is visible on the stage. Two
 * halves in one colour would leave the reader looking at exactly the picture they had before, which
 * for this operation is the whole of what there is to see.
 */
export function splitPiece(
  contour: Contour,
  id: string,
  at: Cx,
  tolerance = joinTolerance(resolveAll(contour)),
): Contour {
  const piece = contour.pieces.find((p) => p.id === id);
  if (piece === undefined) return contour;
  const shape = resolve(piece.geom, contour.params);
  if (!(distanceToPoint(shape, at) <= tolerance)) return contour;
  return splitPieceAt(contour, id, splitFraction(piece, contour.params, shape, at));
}

/**
 * Where `at` falls along a piece, as a fraction of its own parameter.
 *
 * **This is what a division IS, and {@link splitPieceAt} is why that matters** — step 4.4b. A point
 * is how a POINTER expresses one, and a point cannot be replayed: a permalink that carried one
 * would re-divide a contour whose parameters had moved at a place its own geometry no longer
 * passes through, and the halves' shared `PointSpec` is symbolic precisely so that it follows the
 * slider. The fraction follows it too, and costs one number instead of two.
 *
 * Non-finite for a degenerate piece, which {@link splitPieceAt}'s floor refuses — see its note on
 * why neither helper carries a guard of its own.
 */
function splitFraction(piece: Piece, params: Contour["params"], shape: Resolved, at: Cx): number {
  return piece.geom.kind === "segment"
    ? segmentFraction(startPoint(shape), endPoint(shape), at)
    : arcFraction(piece.geom, params, at);
}

/**
 * Divide one piece in two a `fraction` of the way along it — {@link splitPiece} by the quantity it
 * actually uses, and the form a permalink carries (step 4.4b).
 *
 * Everything {@link splitPiece} documents about the halves, their roles, their ids and their shared
 * seam holds here unchanged; what this entry point does not do is decide WHERE, so it has two
 * refusals rather than three — an unknown id, and a degenerate half.
 */
export function splitPieceAt(contour: Contour, id: string, fraction: number): Contour {
  const index = contour.pieces.findIndex((p) => p.id === id);
  if (index < 0) return contour;
  const piece = contour.pieces[index];
  const shape = resolve(piece.geom, contour.params);

  const divide =
    piece.geom.kind === "segment"
      ? segmentDivide(piece.geom, startPoint(shape), endPoint(shape), fraction)
      : arcDivide(piece.geom, contour.params, fraction);

  // **Both comparisons are NEGATED `>` rather than `<=`**, so that a non-finite fraction refuses
  // rather than passing: that is what lets {@link segmentDivide} and {@link arcDivide} carry no
  // degeneracy guard of their own, a zero-length piece arriving here as `NaN` on both clauses.
  const length = arcLength(shape);
  const floor = joinTolerance(resolveAll(contour));
  if (!(fraction * length > floor)) return contour;
  if (!((1 - fraction) * length > floor)) return contour;

  // `lemma` is destructured away rather than overwritten, for `setRole`'s reason: the field must be
  // ABSENT when the role no longer has anything for it to be about, so that a deep comparison, the
  // codec's `JSON.stringify` and `"lemma" in piece` all agree.
  const { lemma: declared, ...rest } = piece;
  const role = halfRole(piece.role);
  const first: Piece = {
    ...rest,
    geom: divide.first,
    role,
    ...(role === "vanish" && declared !== undefined ? { lemma: declared } : {}),
  };
  const used = new Set(contour.pieces.map((p) => p.id));
  const { id: mintedId, n } = mint(used, SPLIT.stem);
  // Spread from `first`, so the two halves carry identical claims BY CONSTRUCTION — `side` included,
  // which is geometric (a piece running along a cut's upper lip is two pieces running along it) and
  // therefore rides whatever the role does. Writing the fields out twice is how the two would come
  // to differ, which is the drift `reverseGeom`'s extraction exists to prevent one module over.
  const second: Piece = {
    ...first,
    id: mintedId,
    name: `${SPLIT.label} ${n}`,
    geom: divide.second,
    colour: PALETTE[(piece.colour + 1) % PALETTE.length],
  };
  return {
    ...contour,
    pieces: [...contour.pieces.slice(0, index), first, second, ...contour.pieces.slice(index + 1)],
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

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE EDIT LIST — M8 step 4.4b.
//
// **A structurally edited template is carried as WHAT WAS DONE TO IT, not as what it became.** The
// plan proposed serialising one as a pen wire, its vertices and bulges; measured over the ten
// templates, that conversion changes the LEDGER for four of them. A full turn has a zero-length
// chord, so no bulge can express it and `circle`'s only piece comes back a degenerate segment; and
// an arc's centre returns 2.2e-16 off the origin, where `arcRadius` demands exactly zero. An edit
// list keeps the parameters, the symbolic geometry and the exactly-centred arcs, because it does
// not re-describe the curve at all — it replays the reader's own operations onto the template the
// recipe already names.
//
// **Every op is expressible because every editing action in the shell is one of these six.** The
// division carries a FRACTION rather than a point, which is what makes it replayable: a point would
// re-divide a contour whose slider has moved at a place its geometry no longer passes through,
// while the fraction follows the parameter exactly as the halves' shared `PointSpec` does.

/** One replayable editing action. Keys are short because they ride in a URL. */
export type ContourOp =
  | { readonly k: "d"; readonly id: string }
  | { readonly k: "i"; readonly id: string; readonly of: "segment" | "arc" }
  | { readonly k: "m"; readonly id: string; readonly by: -1 | 1 }
  | { readonly k: "r"; readonly id: string }
  | { readonly k: "R" }
  | { readonly k: "s"; readonly id: string; readonly at: number };

/**
 * Move one piece by one place — the row's reorder, expressed as {@link reorderPieces}' permutation.
 *
 * `reorderPieces` takes the whole order because a permutation is what it can verify; a reader moves
 * one row. The translation lives here rather than in the shell so that the gesture and the replay
 * cannot come to mean different things — which is the second-consumer rule arriving at the moment
 * the edit list needed the same operation the Contour card's arrows make.
 */
export function movePiece(contour: Contour, id: string, by: -1 | 1): Contour {
  const ids = contour.pieces.map((p) => p.id);
  const at = ids.indexOf(id);
  const to = at + by;
  // At either end there is nowhere to go, and a wrap would move the piece the whole way across the
  // list on a keypress that means "one step".
  //
  // **The range half is a recorded equivalent, kept deliberately.** Dropping it is unobservable:
  // the swap would write `undefined` into the id list, and `reorderPieces` refuses that as a
  // non-permutation (or, at `to === ids.length`, as a list of the wrong length) and returns the
  // contour by reference. The same outcome by a longer road. It stays because "there is nowhere to
  // go" and "that is not a permutation" are different statements, and relying on the second would
  // couple this list's ends to the other function's validation shape.
  if (at < 0 || to < 0 || to >= ids.length) return contour;
  const next = [...ids];
  next[at] = ids[to];
  next[to] = ids[at];
  return reorderPieces(contour, next);
}

/**
 * Replay an edit list onto a contour, or say which op could not be applied.
 *
 * **A refusal is named rather than skipped.** Every operation in this section refuses by returning
 * the contour BY REFERENCE, so an op that does not apply is exactly an op whose result is the very
 * contour it was given — and carrying on would rebuild a contour that is not the one the list
 * describes, which a permalink would then open in place of what was shared. The index is reported
 * because the ops are positional: which one failed is the only thing a reader could act on.
 */
export function applyOps(
  contour: Contour,
  ops: readonly ContourOp[],
): { readonly ok: true; readonly contour: Contour } | { readonly ok: false; readonly at: number; readonly op: ContourOp } {
  let out = contour;
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    const next =
      op.k === "d"
        ? deletePiece(out, op.id)
        : op.k === "i"
          ? insertPiece(out, op.id, op.of)
          : op.k === "m"
            ? movePiece(out, op.id, op.by)
            : op.k === "r"
              ? reversePiece(out, op.id)
              : op.k === "R"
                ? reverseContour(out)
                : splitPieceAt(out, op.id, op.at);
    if (next === out) return { ok: false, at: i, op };
    out = next;
  }
  return { ok: true, contour: out };
}

/** Where `at` falls along the piece `id`, for a caller recording a division it is about to make. */
export function fractionAlong(contour: Contour, id: string, at: Cx): number | null {
  const piece = contour.pieces.find((p) => p.id === id);
  if (piece === undefined) return null;
  const f = splitFraction(piece, contour.params, resolve(piece.geom, contour.params), at);
  return Number.isFinite(f) ? f : null;
}
