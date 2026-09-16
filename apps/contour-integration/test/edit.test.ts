// Moving a contour, and the thing that makes it worth doing.
//
// North-star behaviour 1 is "drag a contour across a pole and watch the value jump by exactly
// `2πi·Res`", and until this slice the app could only approach it through a parameter slider. The
// tests below pin the jump — exactly, not to a tolerance — and the two properties the gesture rests
// on: that translation stays inside `model.ts`'s affine `Scalar` subset (so a dragged template is
// still a template, with its radius still bound to `R`), and that the draft quadrature a drag runs at
// cannot change the answer, only the cross-check.
import { describe, expect, it } from "vitest";
import { makeComplexFn, parse } from "@cas/expr";
import { analyse } from "../src/engine/analyse.js";
import {
  handlesOf,
  nearestHandle,
  onContour,
  pieceAt,
  radiusDragValue,
  setParam,
  translateContour,
} from "../src/engine/contour/edit.js";
import { resolveAll, type Contour } from "../src/engine/contour/model.js";
import {
  circleTemplate,
  indentedSemicircleTemplate,
  rectangleTemplate,
  semicircleTemplate,
} from "../src/engine/contour/templates.js";
import { arcLength, isClosed, type Cx } from "../src/kernel/geom.js";
import { findPoles } from "../src/kernel/poles.js";

const must = <T,>(v: T | undefined, what: string): T => {
  if (v === undefined) throw new Error(`expected ${what} to be present`);
  return v;
};

const TEMPLATES: readonly (readonly [string, Contour])[] = [
  ["circle", circleTemplate([0, 0], 1.5)],
  ["semicircle up", semicircleTemplate(3, "upper")],
  ["semicircle down", semicircleTemplate(3, "lower")],
  ["indented semicircle", indentedSemicircleTemplate(8, 0.05)],
  ["rectangle", rectangleTemplate(-1.6, -1.2, 1.6, 1.2)],
];

describe("translateContour", () => {
  it.each(TEMPLATES)("keeps %s closed", (_name, contour) => {
    expect(isClosed(resolveAll(contour))).toBe(true);
    for (const d of [[1, 0], [-2.5, 0.75], [0, -4]] as const) {
      expect(isClosed(resolveAll(translateContour(contour, d)))).toBe(true);
    }
  });

  it.each(TEMPLATES)("is a RIGID motion of %s — every arclength unchanged", (_name, contour) => {
    const before = resolveAll(contour).map(arcLength);
    const after = resolveAll(translateContour(contour, [3, -2])).map(arcLength);
    after.forEach((len, k) => expect(len).toBeCloseTo(before[k] ?? NaN, 12));
  });

  it("leaves a param-bound coordinate BOUND — a dragged template is still a template", () => {
    // The claim the module rests on. `-R` translated by dx is `-R + dx`, absorbed into the Scalar's
    // own `add`, so the radius is still `R`: the slider still works, and `R → ∞` still animates on a
    // contour the user has dragged across the plane. A fork to literal coordinates would lose that.
    const moved = translateContour(semicircleTemplate(3, "upper"), [2, 0]);
    const from = must(moved.pieces[0], "the diameter").geom;
    if (from.kind !== "segment") throw new Error("expected a segment");
    expect(from.from.x).toEqual({ param: "R", mul: -1, add: 2 });

    for (const R of [3, 7]) {
      const at = resolveAll(setParam(moved, "R", R));
      const seg = must(at[0], "the resolved diameter");
      if (seg.kind !== "segment") throw new Error("expected a segment");
      expect(seg.from[0]).toBeCloseTo(-R + 2, 12);
      expect(seg.to[0]).toBeCloseTo(R + 2, 12);
    }
  });

  it("is the identity for a zero offset", () => {
    const c = circleTemplate([0, 0], 1.5);
    expect(translateContour(c, [0, 0])).toBe(c);
  });
});

describe("handles", () => {
  it("offers one per PARAM-BOUND arc radius, and nothing else", () => {
    expect(handlesOf(...withResolved(circleTemplate([0, 0], 1.5))).map((h) => h.param)).toEqual(["R"]);
    // The indented semicircle's two handles are its two limits — `R → ∞` and `ρ → 0` — which is what
    // its argument is actually about.
    expect(handlesOf(...withResolved(indentedSemicircleTemplate(8, 0.05))).map((h) => h.param)).toEqual(
      ["rho", "R"],
    );
    // A rectangle has no arcs at all.
    expect(handlesOf(...withResolved(rectangleTemplate(-1, -1, 1, 1)))).toEqual([]);
  });

  it("does NOT invent a handle for a literal radius", () => {
    // A degree of freedom the template did not declare is not one to hand the user.
    const literal: Contour = {
      params: {},
      pieces: [
        {
          id: "c",
          name: "a fixed circle",
          geom: { kind: "arc", center: { x: 0, y: 0 }, radius: 2, theta0: 0, theta1: 2 * Math.PI },
          role: "residue",
          colour: 0,
        },
      ],
    };
    expect(handlesOf(...withResolved(literal))).toEqual([]);
    const [c, resolved] = withResolved(literal);
    const handles = handlesOf(c, resolved);
    expect(nearestHandle(handles, [2, 0], 1)).toBeNull();
  });

  it("inverts its own binding when dragged", () => {
    const [c, resolved] = withResolved(circleTemplate([0, 0], 1.5));
    const handle = must(handlesOf(c, resolved)[0], "the radius handle");
    expect(must(radiusDragValue(c, handle, [4, 0]) ?? undefined, "a value")).toEqual({
      param: "R",
      value: 4,
    });
    // `mul` and `add` are inverted, not ignored: a radius written `2R + 1` reaching 9 means R = 4.
    const scaled: Contour = {
      ...c,
      pieces: [{ ...must(c.pieces[0], "the arc"), geom: { kind: "arc", center: { x: 0, y: 0 }, radius: { param: "R", mul: 2, add: 1 }, theta0: 0, theta1: 2 * Math.PI } }],
    };
    const scaledHandle = must(handlesOf(...withResolved(scaled))[0], "the scaled handle");
    expect(radiusDragValue(scaled, scaledHandle, [9, 0])?.value).toBeCloseTo(4, 12);
  });

  it("refuses to leave the parameter's declared range rather than clamping silently", () => {
    const [c, resolved] = withResolved(indentedSemicircleTemplate(8, 0.05));
    const rho = must(
      handlesOf(c, resolved).find((h) => h.param === "rho"),
      "the ρ handle",
    );
    // ρ's declared range is [1e-9, 1]; a drag to radius 5 is outside it.
    expect(radiusDragValue(c, rho, [5, 0])).toBeNull();
    expect(radiusDragValue(c, rho, [0.4, 0])?.value).toBeCloseTo(0.4, 12);
  });
});

describe("hit tests", () => {
  it("finds the contour under a point, within tolerance", () => {
    const resolved = resolveAll(circleTemplate([0, 0], 1.5));
    expect(onContour(resolved, [1.5, 0], 0.01)).toBe(true);
    expect(onContour(resolved, [1.53, 0], 0.05)).toBe(true);
    expect(onContour(resolved, [0, 0], 0.05)).toBe(false); // the centre is not the contour
    expect(onContour(resolved, [3, 0], 0.05)).toBe(false);
  });

  it("names WHICH piece, by nearest and not by first — M8 step 1.10", () => {
    // `onContour` answers *is the pointer on the curve*, which is the grab's question. The hover's
    // answer is the piece, because it is what lights the rail row and what the readout prints.
    //
    // **Every closed contour has pieces meeting at their endpoints**, so near a join two are inside
    // any workable tolerance at once — and "the first that qualifies" hands the reader whichever
    // piece the record happened to list first. The indented semicircle's corner at `z = −R` is the
    // case, and the discriminating point is just off it: measured at `(−7.9, 0.3)` with `R = 8`, the
    // real axis (piece 0) is **0.3000** away and the big arc (piece 3) is **0.0943**, so a tolerance
    // of 0.5 admits both and only the nearer one is the piece the reader is pointing at. A
    // first-wins reader answers 0 here, which is the whole difference.
    const [, pieces] = withResolved(indentedSemicircleTemplate(8, 0.05));
    expect(pieces).toHaveLength(4);
    expect(pieceAt(pieces, [-7.9, 0.3], 0.5), "just off the corner, on the arc").toBe(3);
    // Exactly ON the corner both are 0 — a tie, and a tie goes to the earlier piece. That is not a
    // choice between them, which is why it is asserted separately from the case above.
    expect(pieceAt(pieces, [-8, 0], 0.5)).toBe(0);
    expect(pieceAt(pieces, [0, 8], 0.5), "the top of the arc").toBe(3);

    const resolved = resolveAll(circleTemplate([0, 0], 1.5));
    expect(pieceAt(resolved, [1.5, 0], 0.01)).toBe(0);
    expect(pieceAt(resolved, [0, 0], 0.05), "the centre is not the contour").toBe(-1);
    expect(pieceAt(resolved, [3, 0], 0.05)).toBe(-1);
  });

  it("picks the NEAREST handle, and none past the tolerance", () => {
    const [c, resolved] = withResolved(indentedSemicircleTemplate(8, 0.05));
    const handles = handlesOf(c, resolved);
    const rho = must(handles.find((h) => h.param === "rho"), "ρ");
    expect(nearestHandle(handles, rho.at, 0.01)?.param).toBe("rho");
    expect(nearestHandle(handles, [500, 500], 0.01)).toBeNull();
  });
});

describe("dragging across a pole — north-star behaviour 1", () => {
  const ast = parse("1/z");
  const fn = makeComplexFn(ast);
  const f = (z: Cx): Cx => fn(z as [number, number], [0, 0]) as Cx;
  const poles = findPoles(ast);
  const at = (dx: number) => {
    const contour = translateContour(circleTemplate([0, 0], 1.5), [dx, 0]);
    return { contour, ...analyse({ ast, f, poles, contour }) };
  };

  it("jumps by EXACTLY 2πi·Res, and the exact value is exact on both sides", () => {
    const inside = at(1.25);
    const outside = at(1.75);
    expect(must(inside.integral.windings[0], "a winding").n).toBe(1);
    expect(must(outside.integral.windings[0], "a winding").n).toBe(0);
    expect(must(inside.theorem.exactValue, "∮ inside").text).toBe("2πi");
    expect(must(outside.theorem.exactValue, "∮ outside").text).toBe("0");
    // The jump, as a number: 2πi·Res = 2πi·1. Not "close to" — the residue theorem is a formula.
    const before = must(inside.theorem.exactValue, "∮ inside").value;
    const after = must(outside.theorem.exactValue, "∮ outside").value;
    expect(after[0] - before[0]).toBeCloseTo(0, 12);
    expect(after[1] - before[1]).toBeCloseTo(-2 * Math.PI, 12);
  });

  it("passes THROUGH a state with no number when a step lands on the pole", () => {
    // A stepped drag. The circle has radius 1.5, so the pole reaches the contour at dx = 1.5 exactly,
    // and the step is chosen to land there — which is what "park it on the pole" means (north-star 5).
    const states = [];
    for (let k = 0; k <= 12; k++) states.push(at(k * 0.25));
    const refused = states.filter((sIt) => sIt.integral.refusal !== undefined);
    expect(refused).toHaveLength(1);
    // North-star 5: no number at all, not a greyed-out one.
    for (const r of refused) {
      expect(r.integral.value).toBeUndefined();
      expect(r.theorem.exactValue).toBeUndefined();
      expect(r.ledger.value).toBeUndefined();
      expect(r.ledger.closes).toBe(false);
      expect(r.ledger.failedAt).toBe("LEGALITY");
    }
  });

  it("still reports the exact value one ulp-scale away from the pole, because the formula still holds", () => {
    // Recorded because it is a limit worth knowing: the refusal is for a pole ON the contour, and a
    // pole 1e-6 away is not on it — `2πi Σ n·Res` is as exact there as anywhere. What degrades is the
    // quadrature cross-check, whose error estimate blows up to ~1e+2, and PLAN §4.4's answer to that
    // is to subtract the principal part (M2 work), not to refuse a value the engine knows exactly.
    const near = at(1.5 - 1e-6);
    expect(near.integral.refusal).toBeUndefined();
    expect(must(near.theorem.exactValue, "∮ near").text).toBe("2πi");
    expect(Math.max(...near.integral.pieces.map((p) => p.errorEstimate))).toBeGreaterThan(1);
  });
});

describe("the draft quadrature a drag runs at", () => {
  const ast = parse("1/z");
  const fn = makeComplexFn(ast);
  const f = (z: Cx): Cx => fn(z as [number, number], [0, 0]) as Cx;
  const poles = findPoles(ast);
  const contour = translateContour(circleTemplate([0, 0], 1.5), [1.45, 0]);
  const full = analyse({ ast, f, poles, contour });
  const draft = analyse({ ast, f, poles, contour, budget: { maxEvaluations: 768 } });

  it("cannot change the ANSWER — `∮` comes from a formula, not from the quadrature", () => {
    expect(must(draft.theorem.exactValue, "draft ∮").text).toBe(
      must(full.theorem.exactValue, "full ∮").text,
    );
    expect(draft.integral.windings).toEqual(full.integral.windings);
  });

  it("says it was capped, rather than quietly returning a value at the wrong resolution", () => {
    expect(full.integral.pieces.every((p) => !p.capped)).toBe(true);
    expect(draft.integral.pieces.some((p) => p.capped)).toBe(true);
    expect(draft.integral.pieces[0]?.nodes).toBeLessThan(full.integral.pieces[0]?.nodes ?? 0);
    // The cap reaches the certificate as a ✗ step, so it is visible in the derivation too.
    expect(
      must(draft.integral.pieces[0], "a piece").certificate.provenance.some(
        (s) => !s.ok && s.text.includes("budget"),
      ),
    ).toBe(true);
  });

  it("disagrees with the full pass only within its OWN error estimate", () => {
    // What the shell's reconcile on `pointerup` checks, and why a disagreement past this is a bug
    // signal rather than an expected cost of drafting (PLAN §4.5).
    const a = must(draft.integral.value, "a draft value");
    const b = must(full.integral.value, "a full value");
    const off = Math.hypot(a[0] - b[0], a[1] - b[1]);
    const worst = Math.max(...draft.integral.pieces.map((p) => p.errorEstimate));
    expect(off).toBeLessThanOrEqual(Math.max(32 * worst, 1e-9 * Math.max(1, Math.hypot(...b))));
  });
});

/** A contour with its own resolved geometry, which is what `handlesOf` needs. */
function withResolved(contour: Contour): [Contour, ReturnType<typeof resolveAll>] {
  return [contour, resolveAll(contour)];
}
