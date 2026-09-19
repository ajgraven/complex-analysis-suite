// Editing the contour: M8 step 1.4b's `reverseContour`, and step 4.1's six piece-list operations
// with the join they rest on.
//
// The `reverseContour` block at the FOOT of this file is step 1.4b's and is unchanged — its whole
// content is that `∮` changes sign, which is why it tests the integral and not the data.
//
// The plan's gate is *"every operation preserves closure and piece count invariants across the ten
// templates"*, and the tests below read it in both halves. **Closure** is checked with
// `kernel/geom.ts`'s own `isClosed` — the function the ledger and `integrate.ts` call, reused rather
// than reimplemented, so a contour these operations call closed is closed in exactly the sense the
// ledger will judge it by. **The count invariant is not one number**, and saying so is most of what
// these tests found: removing a piece opens ONE seam unless the piece was a full turn, in which case
// it opens none, so `deletePiece` is `n` for a semicircle's arc and `n − 1` for a keyhole's circle.
// Every count assertion below therefore derives its expectation from the geometry — how many seams
// does this edit really open? — rather than hardcoding a delta, which is the difference between a
// test that pins the rule and one that pins today's answer.
import { describe, expect, it } from "vitest";
import {
  deletePiece,
  endpointSpec,
  insertPiece,
  renamePiece,
  reorderPieces,
  reverseContour,
  reversePiece,
  setParam,
  setRole,
} from "../src/engine/contour/edit.js";
import {
  resolve,
  resolveAll,
  resolveScalar,
  type Contour,
  type Geom,
  type Param,
  type Piece,
} from "../src/engine/contour/model.js";
import {
  circleTemplate,
  indentedSemicircleTemplate,
  keyholeTemplate,
  semicircleTemplate,
} from "../src/engine/contour/templates.js";
import { integrateContour } from "../src/engine/contour/integrate.js";
import { TEMPLATES } from "../src/shell/templates.js";
import { endPoint, isClosed, startPoint, type Cx } from "../src/kernel/geom.js";

/** `1/z`, whose integral round the unit circle is the one number every reader knows. */
const oneOverZ = ([x, y]: Cx): Cx => {
  const d = x * x + y * y;
  return [x / d, -y / d];
};

/** The ten the gate names, built once: every operation here is pure, so one instance is enough. */
const TEN: readonly (readonly [string, Contour])[] = TEMPLATES.map((t) => [t.id, t.build()] as const);

const dist = (a: Cx, b: Cx): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** `edit.ts`'s own tolerance, restated here so a drift in it shows up as a failure rather than as
 *  two files agreeing with each other. */
const TOL = 1e-9;

/** Does this piece begin where it ends? The property {@link reversePiece} turns on, and the one that
 *  decides whether a deletion opens a seam — computed from the geometry, never from a list of ids. */
function isLoop(contour: Contour, piece: Piece): boolean {
  const shape = resolve(piece.geom, contour.params);
  return dist(startPoint(shape), endPoint(shape)) <= TOL;
}

/** How many seams a given ORDER of pieces leaves open — the number of joins an edit must mint. */
function openSeams(contour: Contour, pieces: readonly Piece[]): number {
  const shapes = pieces.map((p) => resolve(p.geom, contour.params));
  let n = 0;
  for (let k = 0; k < shapes.length; k++) {
    if (dist(endPoint(shapes[k]), startPoint(shapes[(k + 1) % shapes.length])) > TOL) n++;
  }
  return n;
}

/** The widest seam in a contour, including the wrap — a number, where `isClosed` gives a verdict. */
const worstSeam = (contour: Contour): number =>
  openSeamWidths(contour).reduce((a, b) => Math.max(a, b), 0);

function openSeamWidths(contour: Contour): number[] {
  const shapes = resolveAll(contour);
  return shapes.map((_, k) => dist(endPoint(shapes[k]), startPoint(shapes[(k + 1) % shapes.length])));
}

const clone = (contour: Contour): string => JSON.stringify(contour);

const par = (name: string, value: number): Param => ({ name, value, range: [0.05, 50], scale: "linear" });

const freePiece = (id: string, geom: Geom, colour: 0 | 1 | 2): Piece => ({
  id,
  name: `the piece ${id}`,
  geom,
  role: "free",
  colour,
});

describe("the ten templates", () => {
  it("are the ten the gate names, and every one of them starts closed", () => {
    // The precondition of every assertion below: an operation cannot be shown to PRESERVE closure on
    // a contour that never had it.
    expect(TEN).toHaveLength(10);
    for (const [id, contour] of TEN) expect(isClosed(resolveAll(contour)), id).toBe(true);
  });
});

describe("endpointSpec", () => {
  it("hands a segment's own specs straight back", () => {
    const [, contour] = TEN[1];
    const piece = contour.pieces[0];
    if (piece.geom.kind !== "segment") throw new Error("the semicircle's first piece is its diameter");
    // `toBe`, not `toEqual`: the identity is the claim. A mutant that resolved a segment's endpoints
    // to literals would still be numerically right today and would lose the parameter binding, which
    // is the whole point of the symbolic branch.
    expect(endpointSpec(piece.geom, "start")).toBe(piece.geom.from);
    expect(endpointSpec(piece.geom, "end")).toBe(piece.geom.to);
  });

  it("expresses EVERY arc in all ten templates, and agrees with the resolved geometry", () => {
    let arcs = 0;
    for (const [id, contour] of TEN) {
      for (const piece of contour.pieces) {
        if (piece.geom.kind !== "arc") continue;
        arcs++;
        const shape = resolve(piece.geom, contour.params);
        for (const which of ["start", "end"] as const) {
          const spec = endpointSpec(piece.geom, which);
          if (spec === null) throw new Error(`${id}/${piece.id} ${which} was not expressible`);
          const got: Cx = [resolveScalar(spec.x, contour.params), resolveScalar(spec.y, contour.params)];
          const want = which === "start" ? startPoint(shape) : endPoint(shape);
          // 1e-12 and not exact: the symbolic form distributes `cos θ` over `(m·R + c)` where
          // `pointAt` multiplies after adding, so the two differ in the last bits.
          expect(dist(got, want), `${id}/${piece.id} ${which}`).toBeLessThan(1e-12);
        }
        // A `start` spec that came back equal to the `end` one would pass the check above on a full
        // turn and nowhere else; this pins that the two are read from DIFFERENT angles.
        const a = endpointSpec(piece.geom, "start");
        const b = endpointSpec(piece.geom, "end");
        if (a !== null && b !== null && !isLoop(contour, piece)) {
          expect(JSON.stringify(a), `${id}/${piece.id}`).not.toEqual(JSON.stringify(b));
        }
      }
    }
    // Ten arcs across the ten templates (the three round shapes one each, the wedge one, and two
    // each in the indented semicircle, the keyhole and the dogbone). The count is asserted because
    // "expresses every arc" is vacuous if the loop found none — the failure a misplaced `continue`
    // produces, and the only way this test can pass by doing nothing.
    expect(arcs).toBe(10);
  });

  it("keeps the endpoint BOUND to the parameter, which is what a join needs it for", () => {
    // The semicircle's arc, radius `R`, θ from 0 to π: the far end is `−R` and not the number −3.
    const [, contour] = TEN[1];
    const spec = endpointSpec(contour.pieces[1].geom, "end");
    expect(spec).not.toBeNull();
    expect(typeof spec?.x).toBe("object");
    expect(resolveScalar(spec?.x ?? 0, contour.params)).toBeCloseTo(-3, 12);
    // …and it MOVES with the parameter. A literal would sit at −3 for ever.
    expect(resolveScalar(spec?.x ?? 0, setParam(contour, "R", 11).params)).toBeCloseTo(-11, 12);
  });

  it("refuses a theta bound to a parameter — cos of a parameter is not affine in it", () => {
    const geom: Geom = {
      kind: "arc",
      center: { x: 0, y: 0 },
      radius: 2,
      theta0: 0,
      theta1: { param: "phi" },
    };
    expect(endpointSpec(geom, "end")).toBeNull();
    // The START of the same arc is a literal angle and is expressible: the refusal is about the
    // angle asked for, not about the piece.
    expect(endpointSpec(geom, "start")).not.toBeNull();
  });

  it("refuses a parameter-supplied coefficient — except where the factor is exactly 1", () => {
    // F1's wedge shape: a radius `k·R` whose `k` is a frozen `derived` parameter. Multiplying that
    // by cos(π/3) would need a coefficient `k·0.5`, and `Scalar.mul` is `number | {param}`.
    const radius = { param: "R", mul: { param: "k" } } as const;
    const centre = { x: 0, y: 0 };
    expect(endpointSpec({ kind: "arc", center: centre, radius, theta0: Math.PI / 3, theta1: 1 }, "start")).toBeNull();
    // At θ = 0 the factors are exactly 1 and exactly 0, so the scaling is the identity and the
    // annihilator — measured, not assumed: `Math.cos(0) === 1` and `Math.sin(0) === 0`.
    const atZero = endpointSpec({ kind: "arc", center: centre, radius, theta0: 0, theta1: 1 }, "start");
    expect(atZero).not.toBeNull();
    const params = { R: par("R", 3), k: par("k", 2) };
    expect(resolveScalar(atZero?.x ?? 0, params)).toBeCloseTo(6, 12);
    expect(resolveScalar(atZero?.y ?? 0, params)).toBe(0);
  });

  it("takes the coefficient AND the offset of an affine radius", () => {
    // A radius written `2R + 1`, the shape `radiusDragValue` documents. At θ = π the endpoint is
    // `−(2R + 1)`, so a scaling that reached the coefficient and not the offset would read `−2R + 1`
    // — right at R = 0 and nowhere else, which is why the fixture is checked at three radii.
    const geom: Geom = {
      kind: "arc",
      center: { x: 0, y: 0 },
      radius: { param: "R", mul: 2, add: 1 },
      theta0: Math.PI,
      theta1: 0,
    };
    const spec = endpointSpec(geom, "start");
    expect(spec).not.toBeNull();
    for (const r of [0.5, 3, 20]) {
      expect(resolveScalar(spec?.x ?? 0, { R: par("R", r) }), `R=${r}`).toBeCloseTo(-(2 * r + 1), 12);
    }
  });

  it("COMBINES a centre and a radius bound to the SAME parameter", () => {
    // A circle of radius `R` centred at `(R, 0)`: the far end is `2R`, which the affine form holds by
    // adding coefficients rather than by nesting.
    const geom: Geom = {
      kind: "arc",
      center: { x: { param: "R" }, y: 0 },
      radius: { param: "R" },
      theta0: 0,
      theta1: Math.PI,
    };
    const spec = endpointSpec(geom, "start");
    expect(spec).not.toBeNull();
    for (const r of [1, 4, 30]) {
      expect(resolveScalar(spec?.x ?? 0, { R: par("R", r) }), `R=${r}`).toBeCloseTo(2 * r, 12);
    }
  });

  it("composes an arc with NO parameters at all — the pen's own geometry", () => {
    // A drawn contour has literal centres, radii and angles (`pen.ts` builds them from where the
    // reader clicked), so this is the path every join on a hand-drawn shape takes. The sweep found
    // it uncovered: a mutant that dropped the literal half of the sum survived the ten templates
    // entirely, because every arc in all ten has a parameter-bound radius.
    const geom: Geom = {
      kind: "arc",
      center: { x: 3, y: -1 },
      radius: 2,
      theta0: 0,
      theta1: Math.PI / 2,
    };
    const start = endpointSpec(geom, "start");
    const end = endpointSpec(geom, "end");
    expect(resolveScalar(start?.x ?? NaN, {})).toBeCloseTo(5, 12);
    expect(resolveScalar(start?.y ?? NaN, {})).toBeCloseTo(-1, 12);
    expect(resolveScalar(end?.x ?? NaN, {})).toBeCloseTo(3, 12);
    expect(resolveScalar(end?.y ?? NaN, {})).toBeCloseTo(1, 12);
  });

  it("combines the OFFSETS as well as the coefficients when both name one parameter", () => {
    // Centre `(R, 0)`, radius `2R + 1`, θ = 0: the endpoint is `3R + 1`. A combine that added the
    // coefficients and kept only the centre's offset would read `3R` — right at no R at all, and
    // invisible to every fixture whose radius has a zero offset, which is all ten templates.
    const geom: Geom = {
      kind: "arc",
      center: { x: { param: "R" }, y: 0 },
      radius: { param: "R", mul: 2, add: 1 },
      theta0: 0,
      theta1: Math.PI,
    };
    const spec = endpointSpec(geom, "start");
    for (const r of [1, 4, 30]) {
      expect(resolveScalar(spec?.x ?? NaN, { R: par("R", r) }), `R=${r}`).toBeCloseTo(3 * r + 1, 12);
    }
  });

  it("EXPRESSES a centre bound to a different parameter than the radius", () => {
    // The step expected this to be a refusal. It is not: `Scalar.add` may itself be a `Scalar` —
    // D7's `b − η` nesting — so `a + R·cos θ` is writable and stays live under a drag of EITHER.
    const geom: Geom = {
      kind: "arc",
      center: { x: { param: "a" }, y: 0 },
      radius: { param: "R" },
      theta0: 0,
      theta1: Math.PI,
    };
    const spec = endpointSpec(geom, "start");
    expect(spec).not.toBeNull();
    for (const [a, r] of [[1, 3], [7, 0.5], [-2, 40]] as const) {
      const params = { a: par("a", a), R: par("R", r) };
      expect(resolveScalar(spec?.x ?? 0, params)).toBeCloseTo(a + r, 12);
    }
  });
});

describe("reversePiece", () => {
  it.each(TEN)("reverses exactly the loop pieces of %s, and refuses the rest", (id, contour) => {
    const before = clone(contour);
    for (const piece of contour.pieces) {
      const next = reversePiece(contour, piece.id);
      // The rule, derived from the geometry rather than from a list of ids: reversing a piece swaps
      // its endpoints, so the chain survives exactly when those endpoints were the same point.
      if (!isLoop(contour, piece)) {
        expect(next, `${id}/${piece.id}`).toBe(contour);
        continue;
      }
      expect(next.pieces, `${id}/${piece.id}`).toHaveLength(contour.pieces.length);
      expect(isClosed(resolveAll(next)), `${id}/${piece.id}`).toBe(true);
      // It actually reversed: a mutant returning the contour unchanged would pass both lines above.
      expect(JSON.stringify(next.pieces.find((p) => p.id === piece.id))).not.toEqual(
        JSON.stringify(piece),
      );
      // Everything except the geometry rides along — the piece is the same piece walked the other
      // way, so its role, lemma, side and colour are untouched.
      const after = next.pieces.find((p) => p.id === piece.id);
      expect({ ...after, geom: null }).toEqual({ ...piece, geom: null });
    }
    expect(clone(contour), "the input must not be mutated").toBe(before);
  });

  it("on the circle is the whole contour reversed — one piece, so the two agree", () => {
    const [, circle] = TEN[0];
    expect(reversePiece(circle, "circle")).toEqual(reverseContour(circle));
  });

  it("refuses an unknown id, and a piece whose ends differ, leaving the contour untouched", () => {
    const semicircle = semicircleTemplate(3, "upper");
    for (const id of ["nope", "diameter", "arc"]) {
      const next = reversePiece(semicircle, id);
      expect(next, id).toBe(semicircle);
      expect(next, id).toEqual(semicircle);
    }
    // …and on a contour whose piece IS reversible, so that "unknown id" is refused on its own
    // account rather than because the first piece happened to be one this operation declines. The
    // sweep found that gap: every unknown-id fixture here had a non-loop first piece.
    const [, circle] = TEN[0];
    expect(reversePiece(circle, "nope")).toBe(circle);
  });
});

describe("deletePiece", () => {
  it.each(TEN)("removes a piece of %s and re-joins the chain", (id, contour) => {
    const before = clone(contour);
    const n = contour.pieces.length;
    for (const piece of contour.pieces) {
      const next = deletePiece(contour, piece.id);
      if (n < 3) {
        // The circle (1) and both semicircles (2): what is left cannot bound anything.
        expect(next, `${id}/${piece.id}`).toBe(contour);
        continue;
      }
      expect(isClosed(resolveAll(next)), `${id}/${piece.id}`).toBe(true);
      expect(next.pieces.some((p) => p.id === piece.id), `${id}/${piece.id}`).toBe(false);
      // THE COUNT RULE, derived: one piece gone, plus one join iff removing it opened a seam — which
      // it did unless the piece was a full turn. Measured: `n − 1` for the keyhole's two circles and
      // the dogbone's two end caps, `n` for every other piece in the ten.
      const expected = n - 1 + (isLoop(contour, piece) ? 0 : 1);
      expect(next.pieces, `${id}/${piece.id}`).toHaveLength(expected);
      // A minted join is `free`: it has no part in the argument until the reader gives it one, and
      // adopting the deleted piece's role would be the app asserting something nobody claimed.
      for (const p of next.pieces) {
        if (p.id.startsWith("join")) expect(p.role, `${id}/${piece.id}`).toBe("free");
      }
    }
    expect(clone(contour), "the input must not be mutated").toBe(before);
  });

  it("refuses an unknown id and any contour of fewer than three pieces", () => {
    const [, circle] = TEN[0];
    const semicircle = semicircleTemplate(3, "upper");
    const indented = indentedSemicircleTemplate(8, 0.05);
    for (const [c, pieceId, what] of [
      [circle, "circle", "the only piece"],
      [semicircle, "arc", "one of two"],
      [indented, "no-such-piece", "an unknown id"],
    ] as const) {
      const next = deletePiece(c, pieceId);
      expect(next, what).toBe(c);
      expect(next, what).toEqual(c);
    }
  });
});

describe("insertPiece", () => {
  it.each(TEN)("adds one piece to %s, after the piece named, without opening it", (id, contour) => {
    const before = clone(contour);
    for (const piece of contour.pieces) {
      for (const kind of ["segment", "arc"] as const) {
        const next = insertPiece(contour, piece.id, kind);
        expect(next.pieces, `${id}/${piece.id}/${kind}`).toHaveLength(contour.pieces.length + 1);
        expect(isClosed(resolveAll(next)), `${id}/${piece.id}/${kind}`).toBe(true);
        // It lands immediately after the piece named — a mutant appending at the end would keep the
        // count and the closure on a contour whose seam happens to be there, and break both here.
        const at = next.pieces.findIndex((p) => p.id === piece.id);
        expect(next.pieces[at + 1]?.id.startsWith("piece"), `${id}/${piece.id}`).toBe(true);
        // BOTH kinds produce a segment: a bulge-0 arc is its own chord in this representation, and
        // inventing a radius would put geometry on screen the reader never asked for.
        expect(next.pieces[at + 1]?.geom.kind, `${id}/${piece.id}/${kind}`).toBe("segment");
        // …and the NAME says which was asked for, so the reader is told rather than quietly given
        // something else. A mutant that ignored `kind` would fail exactly here.
        expect(next.pieces[at + 1]?.name, `${id}/${piece.id}/${kind}`).toBe(
          kind === "arc" ? "inserted chord 1" : "inserted segment 1",
        );
      }
    }
    expect(clone(contour), "the input must not be mutated").toBe(before);
  });

  it("refuses an unknown afterId", () => {
    const [, contour] = TEN[3];
    const next = insertPiece(contour, "no-such-piece", "segment");
    expect(next).toBe(contour);
    expect(next).toEqual(contour);
  });

  it("mints an id nothing else holds, so two insertions are two pieces", () => {
    const contour = indentedSemicircleTemplate(8, 0.05);
    const twice = insertPiece(insertPiece(contour, "left", "segment"), "left", "segment");
    expect(new Set(twice.pieces.map((p) => p.id)).size).toBe(twice.pieces.length);
    expect(twice.pieces).toHaveLength(contour.pieces.length + 2);
  });
});

describe("reorderPieces", () => {
  it.each(TEN)("rotates %s without opening a seam", (id, contour) => {
    // A cyclic rotation of a closed chain is still a closed chain, so this is the one reorder that
    // mints nothing — and the case that would hide a bug in the permutation itself, hence the
    // order assertion.
    const ids = [...contour.pieces.slice(1), contour.pieces[0]].map((p) => p.id);
    const next = reorderPieces(contour, ids);
    expect(next.pieces.map((p) => p.id), id).toEqual(ids);
    expect(next.pieces, id).toHaveLength(contour.pieces.length);
    expect(isClosed(resolveAll(next)), id).toBe(true);
  });

  it.each(TEN.filter(([, c]) => c.pieces.length >= 3))(
    "swaps the first two pieces of %s and re-joins every seam that opens",
    (id, contour) => {
      const order = [contour.pieces[1], contour.pieces[0], ...contour.pieces.slice(2)];
      const next = reorderPieces(contour, order.map((p) => p.id));
      expect(isClosed(resolveAll(next)), id).toBe(true);
      // Derived, not hardcoded: however many seams THIS permutation opens is how many joins there
      // must be. Measured — three for the four-sided shapes and the wedge, two for the keyhole and
      // the dogbone, whose swapped pair includes a full turn.
      expect(next.pieces, id).toHaveLength(contour.pieces.length + openSeams(contour, order));
      // The pieces the reader asked for are all still there, in the order asked for.
      expect(next.pieces.filter((p) => !p.id.startsWith("join")).map((p) => p.id), id).toEqual(
        order.map((p) => p.id),
      );
      // Every id distinct: this permutation mints two or three joins in ONE pass, and every reader
      // of the list (the rail's hover, the ledger's rows, the codec) resolves a piece by its id.
      expect(new Set(next.pieces.map((p) => p.id)).size, id).toBe(next.pieces.length);
    },
  );

  it("refuses anything that is not a permutation", () => {
    const contour = indentedSemicircleTemplate(8, 0.05);
    const ids = contour.pieces.map((p) => p.id);
    const bad: readonly (readonly [string, readonly string[]])[] = [
      ["one short", ids.slice(1)],
      ["one too many", [...ids, "left"]],
      ["an unknown id", ["left", "indent", "right", "nope"]],
      ["a duplicate", ["left", "left", "right", "bigarc"]],
      ["empty", []],
    ];
    for (const [what, order] of bad) {
      const next = reorderPieces(contour, order);
      // Refused WHOLE: a partial reorder would be a deletion the caller never asked for.
      expect(next, what).toBe(contour);
      expect(next, what).toEqual(contour);
    }
  });
});

describe("renamePiece and setRole", () => {
  it.each(TEN)("rename leaves %s's list length and closure alone", (id, contour) => {
    const piece = contour.pieces[0];
    const next = renamePiece(contour, piece.id, "  the piece I renamed  ");
    expect(next.pieces, id).toHaveLength(contour.pieces.length);
    expect(isClosed(resolveAll(next)), id).toBe(true);
    // Trimmed, so the string that is refused for being empty and the string that is stored are
    // decided the same way.
    expect(next.pieces[0].name).toBe("the piece I renamed");
    // Only that piece: a mutant renaming by index or renaming all would fail here.
    expect(next.pieces.slice(1).map((p) => p.name)).toEqual(contour.pieces.slice(1).map((p) => p.name));
  });

  it("refuses an empty name, a whitespace name and an unknown id", () => {
    const contour = indentedSemicircleTemplate(8, 0.05);
    for (const [what, id, name] of [
      ["empty", "left", ""],
      ["whitespace", "left", "   \n\t "],
      ["unknown id", "nope", "a fine name"],
    ] as const) {
      const next = renamePiece(contour, id, name);
      expect(next, what).toBe(contour);
      expect(next, what).toEqual(contour);
    }
  });

  it.each(TEN)("setRole leaves %s's list length and closure alone", (id, contour) => {
    const next = setRole(contour, contour.pieces[0].id, "residue");
    expect(next.pieces, id).toHaveLength(contour.pieces.length);
    expect(isClosed(resolveAll(next)), id).toBe(true);
    expect(next.pieces[0].role, id).toBe("residue");
  });

  it("CLEARS the lemma for any role but vanish, and the field is absent rather than undefined", () => {
    const contour = indentedSemicircleTemplate(8, 0.05);
    const indent = contour.pieces[1];
    expect(indent.lemma).toBe("L4"); // the fixture's premise: there is a lemma to clear.

    const target = setRole(contour, "indent", "target").pieces[1];
    expect(target.role).toBe("target");
    // `in` and not `=== undefined`: the codec serialises the piece, and a key carrying `undefined`
    // is a different object from one without the key.
    expect("lemma" in target).toBe(false);
    // Passing a lemma with a non-vanish role does not smuggle it back in.
    expect("lemma" in setRole(contour, "indent", "target", "L2").pieces[1]).toBe(false);

    // `vanish` keeps what it is given…
    expect(setRole(contour, "indent", "vanish", "L2").pieces[1].lemma).toBe("L2");
    // …and `vanish` with none given clears it, which is the sandbox's usual state: the ledger then
    // reads the lemma off the shape.
    expect("lemma" in setRole(contour, "indent", "vanish").pieces[1]).toBe(false);
  });

  it("leaves `side` alone — it is a fact about the cut, not about the role", () => {
    const keyhole = keyholeTemplate(4, 0.15);
    const upper = setRole(keyhole, "upper", "free").pieces[0];
    expect(upper.role).toBe("free");
    expect(upper.side).toBe("above");
  });

  it("returns the very piece when nothing changes, and the contour itself for an unknown id", () => {
    const contour = indentedSemicircleTemplate(8, 0.05);
    expect(setRole(contour, "indent", "vanish", "L4").pieces[1]).toBe(contour.pieces[1]);
    const next = setRole(contour, "nope", "target");
    expect(next).toBe(contour);
    expect(next).toEqual(contour);
  });
});

describe("the join: symbolic where it can be, literal where it cannot", () => {
  it("keeps a SYMBOLIC join closed as the parameters move", () => {
    // Delete the indented semicircle's `right` segment: the seam runs from the indentation arc's end
    // to the big arc's start, both of which are arc endpoints at θ = 0 — so both come back as
    // `{param}` scalars and the join is `rho → R` rather than `0.05 → 8`.
    const contour = indentedSemicircleTemplate(8, 0.05);
    const next = deletePiece(contour, "right");
    const join = next.pieces.find((p) => p.id.startsWith("join"));
    if (join === undefined || join.geom.kind !== "segment") throw new Error("expected a join segment");
    expect(typeof join.geom.from.x).toBe("object");
    expect(typeof join.geom.to.x).toBe("object");
    expect(isClosed(resolveAll(next))).toBe(true);

    // Measured: the widest seam is 9.8e-16 as minted and 4.9e-15 after driving `R` to 40 and `rho`
    // to 0.3 — and that residue is the TEMPLATE's own, `sin(π) = 1.22e-16` scaled by `R`, not the
    // join's. The join's own seam is exact, because both ends name the same parameter.
    for (const [r, rho] of [[8, 0.05], [40, 0.3], [0.5, 0.2]] as const) {
      const moved = setParam(setParam(next, "R", r), "rho", rho);
      expect(isClosed(resolveAll(moved)), `R=${r} rho=${rho}`).toBe(true);
      expect(worstSeam(moved), `R=${r} rho=${rho}`).toBeLessThan(1e-13);
    }
  });

  it("closes a LITERAL join only at the parameters it was minted at — measured, 1.918 open", () => {
    // Nothing in the gallery has a parameter-bound sweep, so the case the fallback exists for is
    // built here: a fan whose arc runs `0 → phi`. `endpointSpec` refuses it (cos of a parameter is
    // not affine), so the join is minted from numbers.
    const phi = 1;
    const fan: Contour = {
      pieces: [
        freePiece("out", { kind: "segment", from: { x: 0, y: 0 }, to: { x: 2, y: 0 } }, 0),
        freePiece(
          "fan",
          { kind: "arc", center: { x: 0, y: 0 }, radius: 2, theta0: 0, theta1: { param: "phi" } },
          1,
        ),
        freePiece(
          "back",
          {
            kind: "segment",
            from: { x: 2 * Math.cos(phi), y: 2 * Math.sin(phi) },
            to: { x: 0, y: 0 },
          },
          2,
        ),
      ],
      params: { phi: par("phi", phi) },
    };
    expect(isClosed(resolveAll(fan))).toBe(true);

    const next = deletePiece(fan, "back");
    const join = next.pieces.find((p) => p.id.startsWith("join"));
    if (join === undefined || join.geom.kind !== "segment") throw new Error("expected a join segment");
    // The literal branch: numbers, not bindings. This is the assertion that would fail if
    // `endpointSpec` ever started inventing a symbolic form for a parameter-bound angle.
    expect(typeof join.geom.from.x).toBe("number");
    expect(isClosed(resolveAll(next))).toBe(true);
    expect(worstSeam(next)).toBe(0);

    // …and it is correct at those parameters ONLY. Measured: moving `phi` from 1 to 2 opens the
    // contour by 1.9177 — `|2e^{2i} − 2e^{i}| = 4 sin(1/2)` — and the ledger will refuse the residue
    // theorem on it, correctly. The operation does not pretend the two branches are equivalent.
    const moved = setParam(next, "phi", 2);
    expect(isClosed(resolveAll(moved))).toBe(false);
    expect(worstSeam(moved)).toBeCloseTo(4 * Math.sin(0.5), 9);
    expect(worstSeam(moved)).toBeCloseTo(1.9177, 4);
  });

  it("decides a seam at the same tolerance `isClosed` decides closure", () => {
    // `edit.ts` keeps its own copy of 1e-9 because `isClosed` publishes it as a parameter default.
    // The probe is an IDENTITY reorder, which mints a join exactly where a seam is open — so the two
    // numbers are compared through their behaviour rather than by reading them.
    for (const [delta, joins] of [[1e-10, 0], [1e-8, 1]] as const) {
      const triangle: Contour = {
        pieces: [
          freePiece("a", { kind: "segment", from: { x: 0, y: 0 }, to: { x: 1, y: 0 } }, 0),
          freePiece("b", { kind: "segment", from: { x: 1, y: 0 }, to: { x: 0, y: 1 } }, 1),
          freePiece("c", { kind: "segment", from: { x: 0, y: 1 + delta }, to: { x: 0, y: 0 } }, 2),
        ],
        params: {},
      };
      expect(isClosed(resolveAll(triangle)), `delta=${delta}`).toBe(joins === 0);
      const next = reorderPieces(triangle, ["a", "b", "c"]);
      expect(next.pieces, `delta=${delta}`).toHaveLength(3 + joins);
      expect(isClosed(resolveAll(next)), `delta=${delta}`).toBe(true);
    }
  });
});

describe("reverseContour", () => {
  it("NEGATES the integral — the orientation is part of the theorem's statement", () => {
    const forward = circleTemplate([0, 0], 1.5);
    const backward = reverseContour(forward);
    const value = (c: typeof forward): Cx =>
      integrateContour(oneOverZ, resolveAll(c), [{ at: [0, 0], order: 1 }]).pieces[0].value;
    const [fr, fi] = value(forward);
    const [br, bi] = value(backward);
    expect(fi).toBeCloseTo(2 * Math.PI, 8);
    expect(bi).toBeCloseTo(-2 * Math.PI, 8);
    expect(br).toBeCloseTo(-fr, 8);
  });

  it("reverses the PIECE ORDER too, so the path stays connected", () => {
    // A contour is a CHAIN: reversing each piece and leaving the list alone would leave every piece
    // ending where the next begins in the old direction, and the path would come apart.
    const c = reverseContour(semicircleTemplate(3, "upper"));
    const pieces = resolveAll(c);
    // Measured through the geometry rather than the spec: consecutive pieces share an endpoint.
    const at = (i: number, t: number): Cx => {
      const p = pieces[i];
      return p.kind === "segment"
        ? [p.from[0] + t * (p.to[0] - p.from[0]), p.from[1] + t * (p.to[1] - p.from[1])]
        : [
            p.center[0] + p.radius * Math.cos(p.theta0 + t * (p.theta1 - p.theta0)),
            p.center[1] + p.radius * Math.sin(p.theta0 + t * (p.theta1 - p.theta0)),
          ];
    };
    for (let k = 0; k + 1 < pieces.length; k++) {
      const end = at(k, 1);
      const start = at(k + 1, 0);
      expect(Math.hypot(end[0] - start[0], end[1] - start[1]), `piece ${k} does not meet piece ${k + 1}`).toBeLessThan(1e-9);
    }
    // **The list order, explicitly** — connectivity alone does not pin it. Measured: for a CLOSED
    // two-piece contour, reversing each piece and leaving the list alone also joins up, and the sum
    // over pieces is the same, so the integral cannot see the difference either. What it changes is
    // which piece is walked FIRST, which is the accumulator's trail and an open contour's endpoints.
    const original = semicircleTemplate(3, "upper");
    expect(c.pieces.map((p) => p.id)).toEqual([...original.pieces].reverse().map((p) => p.id));
    // And the names, roles and colours ride along: they say WHICH piece this is, not which way it
    // is walked.
    expect(c.pieces.map((p) => p.role)).toEqual([...original.pieces].reverse().map((p) => p.role));
  });

  it("does NOT flip `side` — that would move the piece onto the other lip", () => {
    // `side` names which limiting value the piece carries where it lies ON a cut. "Above" is above
    // whichever way you walk it, so flipping would be a different contour rather than this one
    // backwards.
    const base = circleTemplate([0, 0], 1);
    const withSide = { ...base, pieces: base.pieces.map((p) => ({ ...p, side: "above" as const })) };
    expect(reverseContour(withSide).pieces[0].side).toBe("above");
  });
});
