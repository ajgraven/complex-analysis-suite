// The pen's geometry, and the contour a drawn path becomes.
//
// The arc is the part worth testing hard: it is pinned by ONE number, and the whole reason for
// choosing the bulge over a centre is that one number cannot disagree with the endpoints. So the
// tests assert exactly that — the arc passes through both clicks and through the apex the drag
// asked for — rather than checking the centre against a formula, which would only re-derive the
// implementation.
import { describe, expect, it } from "vitest";
import { makeComplexFn, parse } from "@cas/expr";
import { analyse } from "../src/engine/analyse.js";
import { arcThroughBulge, isPenContour, penContour, penPath, sameShape, STRAIGHT, type PenPath } from "../src/engine/contour/pen.js";
import { resolveAll } from "../src/engine/contour/model.js";
import { circleTemplate } from "../src/engine/contour/templates.js";
import { findPoles } from "../src/kernel/poles.js";
import { defaultState, type ShellState } from "../src/shell/state.js";
import { decodeShell, encodeShell } from "../src/shell/viewState.js";
import { pointAt, type Cx } from "../src/kernel/geom.js";

/** Where an arc piece actually is at parameter `t ∈ [0,1]`, from the geometry alone. */
function arcAt(
  g: { center: readonly [number, number]; radius: number; theta0: number; theta1: number },
  t: number,
): [number, number] {
  const th = g.theta0 + (g.theta1 - g.theta0) * t;
  return [g.center[0] + g.radius * Math.cos(th), g.center[1] + g.radius * Math.sin(th)];
}

const near = (a: readonly number[], b: readonly number[], tol = 1e-9): void => {
  expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(tol);
};

describe("the arc a drag draws", () => {
  it("passes through BOTH clicks and through the apex the drag asked for", () => {
    for (const bulge of [0.25, 1, 2.5, -0.25, -1, -2.5]) {
      const from: [number, number] = [-1, 0.5];
      const to: [number, number] = [2, -1];
      const g = arcThroughBulge(from, to, bulge);
      expect(g, `bulge ${bulge}`).not.toBeNull();
      if (g === null) continue;
      near(arcAt(g, 0), from);
      near(arcAt(g, 1), to);
      // The apex: the chord's midpoint displaced by `bulge` along the left-hand normal.
      const dx = to[0] - from[0];
      const dy = to[1] - from[1];
      const L = Math.hypot(dx, dy);
      const apex: [number, number] = [
        (from[0] + to[0]) / 2 + (-dy / L) * bulge,
        (from[1] + to[1]) / 2 + (dx / L) * bulge,
      ];
      near(arcAt(g, 0.5), apex, 1e-9);
    }
  });

  it("bows to the LEFT for a positive bulge and to the right for a negative one", () => {
    // The sign is the drag's own side, so a reader never has to reason about which way θ runs.
    const from: [number, number] = [0, 0];
    const to: [number, number] = [2, 0];
    const left = arcThroughBulge(from, to, 0.5);
    const right = arcThroughBulge(from, to, -0.5);
    expect(left).not.toBeNull();
    expect(right).not.toBeNull();
    if (left === null || right === null) return;
    expect(arcAt(left, 0.5)[1]).toBeCloseTo(0.5, 12);
    expect(arcAt(right, 0.5)[1]).toBeCloseTo(-0.5, 12);
  });

  it("is a SEGMENT below the straightness floor, rather than an arc of absurd radius", () => {
    // A hand-drawn wobble of 1e-12 across a chord of 2 would otherwise be an arc of radius 5e11,
    // which then dominates every bounding box computed from the geometry.
    expect(arcThroughBulge([0, 0], [2, 0], STRAIGHT / 2)).toBeNull();
    expect(arcThroughBulge([0, 0], [2, 0], 0)).toBeNull();
    // And just above the floor it is an arc, so the floor is a threshold and not a range.
    expect(arcThroughBulge([0, 0], [2, 0], STRAIGHT * 2)).not.toBeNull();
  });

  it("refuses a degenerate chord instead of dividing by zero", () => {
    expect(arcThroughBulge([1, 1], [1, 1], 0.5)).toBeNull();
  });

  it("gives a semicircle when the bulge equals the half-chord", () => {
    // b = h is the case where the centre lands ON the chord: a half turn, radius h.
    const g = arcThroughBulge([-1, 0], [1, 0], 1);
    expect(g).not.toBeNull();
    if (g === null) return;
    expect(g.radius).toBeCloseTo(1, 12);
    near(g.center, [0, 0]);
    expect(Math.abs(g.theta1 - g.theta0)).toBeCloseTo(Math.PI, 12);
  });
});

describe("the contour a drawn path becomes", () => {
  const square: PenPath = {
    nodes: [{ at: [-2, -2] }, { at: [2, -2] }, { at: [2, 2] }, { at: [-2, 2] }],
    closed: true,
  };

  it("has one piece per side, each a FIRST-CLASS object with a name", () => {
    const c = penContour(square);
    expect(c.pieces).toHaveLength(4);
    expect(c.pieces.map((p) => p.id)).toEqual(["pen0", "pen1", "pen2", "pen3"]);
    // Research 07 rule 2: named, not an anonymous polyline. The ledger and the piece list read these.
    expect(c.pieces.map((p) => p.name)).toEqual([
      "drawn segment 1", "drawn segment 2", "drawn segment 3", "drawn segment 4",
    ]);
    expect(c.pieces.every((p) => p.role === "free")).toBe(true);
    expect(new Set(c.pieces.map((p) => p.colour)).size).toBe(4);
    // No params: a drawn contour references nothing, which is why it has no recipe.
    expect(c.params).toEqual({});
  });

  it("leaves an OPEN path one piece short, so it cannot pretend to close", () => {
    const open = penContour({ ...square, closed: false });
    expect(open.pieces).toHaveLength(3);
    const closed = penContour(square);
    expect(closed.pieces).toHaveLength(4);
  });

  it("really closes, measured from the resolved geometry rather than asserted", () => {
    const r = resolveAll(penContour(square));
    const first = r[0];
    const last = r[r.length - 1];
    // Traversal order carries orientation; closure is the last piece's end meeting the first's start.
    expect(first.kind === "segment" || first.kind === "arc").toBe(true);
    const start = pointAt(first, 0);
    const end = pointAt(last, 1);
    near(start, end, 1e-12);
  });

  it("mixes arcs and segments in one path", () => {
    const c = penContour({
      nodes: [{ at: [1, 0] }, { at: [3, 0], bulge: 1.5 }, { at: [-3, 0] }, { at: [-1, 0], bulge: 0.5 }],
      closed: true,
    });
    expect(c.pieces.map((p) => p.geom.kind)).toEqual(["segment", "arc", "segment", "arc"]);
    expect(c.pieces.map((p) => p.name)).toEqual([
      "drawn segment 1", "drawn arc 2", "drawn segment 3", "drawn arc 4",
    ]);
  });

  it("has a ledger of the SAME KIND as a template's — M7.2's gate", () => {
    const src = "1/z";
    const ast = parse(src);
    const fn = makeComplexFn(ast);
    const f = (z: Cx): Cx => fn(z as [number, number], [0, 0]) as Cx;
    const poles = findPoles(ast);
    const drawn = analyse({ ast, f, poles, contour: penContour(square) });
    const template = analyse({ ast, f, poles, contour: circleTemplate([0, 0], 2) });

    expect(drawn.ledger.closes).toBe(true);
    expect(template.ledger.closes).toBe(true);
    // The same four constraints, in the same order, with the same statuses.
    const shape = (l: typeof drawn.ledger) => [...new Set(l.rows.map((r) => `${r.constraint}:${r.status}`))];
    expect(shape(drawn.ledger)).toEqual(shape(template.ledger));
    // And the same answer: a square and a circle round the same simple pole both give 2πi.
    expect(drawn.ledger.value?.text).toBe(template.ledger.value?.text);
  });

  it("reads its own path back out of the geometry — DERIVED, so there is nothing to drift", () => {
    // The alternative was to keep the `PenPath` in `ShellState` beside the contour it built, which
    // is two sources of truth for one fact. Reading it back means `penContour(penPath(c))` either
    // reproduces `c` or the codec finds out, which is the check `contourOut` performs.
    const back = penPath(penContour(square));
    expect(back).not.toBeNull();
    if (back === null) return;
    expect(back.closed).toBe(true);
    expect(back.nodes.map((n) => [...n.at])).toEqual([[-2, -2], [2, -2], [2, 2], [-2, 2]]);
    expect(back.nodes.every((n) => n.bulge === undefined)).toBe(true);

    // An OPEN path comes back open, with its final vertex — closure is derived from the geometry
    // rather than stored, so a contour cannot claim one it lacks.
    const open = penPath(penContour({ ...square, closed: false }));
    expect(open?.closed).toBe(false);
    expect(open?.nodes.map((n) => [...n.at])).toEqual([[-2, -2], [2, -2], [2, 2], [-2, 2]]);

    // And an arc's bulge survives, which is the only part that goes through trigonometry.
    const bowed = penPath(penContour({ nodes: [{ at: [-1, 0] }, { at: [1, 0], bulge: 0.8 }], closed: true }));
    expect(bowed?.nodes[1].bulge).toBeCloseTo(0.8, 9);
    expect(penPath(circleTemplate())).toBeNull();
  });

  it("is recognisable as the pen's work, which is how the codec picks its wire form", () => {
    expect(isPenContour(penContour(square))).toBe(true);
    expect(isPenContour(circleTemplate())).toBe(false);
    expect(isPenContour({ pieces: [], params: {} })).toBe(false);
  });
});

describe("a drawn contour in a `#vs=` link", () => {
  const square: PenPath = {
    nodes: [{ at: [-2, -2] }, { at: [2, -2] }, { at: [2, 2] }, { at: [-2, 2] }],
    closed: true,
  };
  const drawnState = (path: PenPath): ShellState => {
    const c = penContour(path);
    return { ...defaultState(c), contourSource: null, sandboxContour: c };
  };

  it("round-trips as the SAME CONTOUR, which M6.2 refused to do before the pen existed", () => {
    const enc = encodeShell(drawnState(square));
    expect(enc.ok, enc.ok ? "" : enc.reason).toBe(true);
    if (!enc.ok) return;
    const back = decodeShell(enc.hash);
    expect(back?.ok).toBe(true);
    if (back === null || !back.ok) return;
    expect(back.state.contour.pieces).toEqual(penContour(square).pieces);
    // And it comes back with NO recipe, which is the truth about a drawn contour.
    expect(back.state.contourSource).toBeNull();
  });

  it("round-trips ARCS, bulge and all", () => {
    const mixed: PenPath = {
      nodes: [{ at: [1, 0] }, { at: [3, 0], bulge: 1.5 }, { at: [-3, 0] }, { at: [-1, 0], bulge: -0.5 }],
      closed: true,
    };
    const enc = encodeShell(drawnState(mixed));
    expect(enc.ok, enc.ok ? "" : enc.reason).toBe(true);
    if (!enc.ok) return;
    const back = decodeShell(enc.hash);
    if (back === null || !back.ok) throw new Error("did not decode");
    expect(back.state.contour.pieces.map((p) => p.geom.kind)).toEqual(["segment", "arc", "segment", "arc"]);
    // By SHAPE, not by bytes — and this test made the codec's own mistake first. An arc's bulge is
    // read back through `atan2` and rebuilt through `cos`/`sin`, so `radius` can differ in its last
    // bit while the curve is the same to 1.3e-12. Asserting deep equality here refuses the very
    // curve on screen.
    expect(sameShape(back.state.contour, penContour(mixed))).toBe(true);
  });

  it("and the shape check DISCRIMINATES, or it would be a tolerance that permits anything", () => {
    // The three ways the round trip could really go wrong, each far outside SHAPE_EPS.
    const base: PenPath = { nodes: [{ at: [-1, 0] }, { at: [1, 0], bulge: 0.8 }], closed: true };
    const flipped: PenPath = { nodes: [{ at: [-1, 0] }, { at: [1, 0], bulge: -0.8 }], closed: true };
    const dropped: PenPath = { nodes: [{ at: [-1, 0] }, { at: [1, 0] }], closed: true };
    expect(sameShape(penContour(base), penContour(base))).toBe(true);
    expect(sameShape(penContour(base), penContour(flipped))).toBe(false);
    expect(sameShape(penContour(base), penContour(dropped))).toBe(false);
    // And a difference just above the floor is caught, so the floor is a threshold not a range.
    const nudged: PenPath = { nodes: [{ at: [-1, 0] }, { at: [1, 1e-6], bulge: 0.8 }], closed: true };
    expect(sameShape(penContour(base), penContour(nudged))).toBe(false);
  });

  it("round-trips an OPEN path as open, so a link cannot close what the reader did not", () => {
    const open: PenPath = { ...square, closed: false };
    const enc = encodeShell(drawnState(open));
    expect(enc.ok).toBe(true);
    if (!enc.ok) return;
    const back = decodeShell(enc.hash);
    if (back === null || !back.ok) throw new Error("did not decode");
    expect(back.state.contour.pieces).toHaveLength(3);
    expect(back.state.contour.pieces).toEqual(penContour(open).pieces);
  });

  it("costs a FRACTION of the piece list it replaces — the measurement that chose the form", () => {
    // Twelve corners: 2,028 base64 characters as a piece list, against this. If some future edit
    // reverted to carrying pieces, the number below is what would move.
    const n = 12;
    const dozen: PenPath = {
      nodes: Array.from({ length: n }, (_, k) => ({
        at: [Math.cos((2 * Math.PI * k) / n) * 3.14159, Math.sin((2 * Math.PI * k) / n) * 3.14159] as const,
      })),
      closed: true,
    };
    const enc = encodeShell(drawnState(dozen));
    expect(enc.ok).toBe(true);
    if (!enc.ok) return;
    // The whole hash, not just the contour, and still well inside research 07 §6's ~2 kB warning.
    expect(enc.hash.length).toBeLessThan(1200);
    const back = decodeShell(enc.hash);
    if (back === null || !back.ok) throw new Error("did not decode");
    expect(back.state.contour.pieces).toEqual(penContour(dozen).pieces);
  });

  it("refuses a malformed drawn contour BY NAME rather than opening something plausible", () => {
    const bad = (c: unknown): string => {
      const payload = { v: 1, app: "ci", state: { c } };
      const hash = `#vs=${Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")}`;
      const r = decodeShell(hash);
      if (r === null) return "NULL";
      return r.ok ? "OK" : r.reason;
    };
    expect(bad({ v: [[0, 0]] })).toContain("not a path");
    expect(bad({ v: "nope" })).toContain("not a list of vertices");
    expect(bad({ v: [[0, 0], [1, "x"]] })).toContain("not a pair of finite numbers");
    expect(bad({ v: [[0, 0], [1, 1]], b: { 7: 0.5 } })).toContain("no such piece");
    expect(bad({ v: [[0, 0], [1, 1]], b: { 0: "x" } })).toContain("not a finite number");
    expect(bad({ v: [[0, 0], [1, 1]], o: 2 })).toContain("closure flag");
  });

  it("leaves a TEMPLATE link decoding exactly as before — the forward-compat contract", () => {
    // The pen form is recognised by carrying `v` at all, so nothing minted before it moves.
    const templ = defaultState(circleTemplate([0, 0], 1));
    const enc = encodeShell({ ...templ, contourSource: { template: "circle", shift: [0, 0] } });
    expect(enc.ok).toBe(true);
    if (!enc.ok) return;
    const back = decodeShell(enc.hash);
    if (back === null || !back.ok) throw new Error("did not decode");
    expect(back.state.contourSource).toEqual({ template: "circle", shift: [0, 0] });
  });
});
