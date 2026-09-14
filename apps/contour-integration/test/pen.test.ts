// @vitest-environment jsdom
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
import { arcThroughBulge, bulgeFromApex, isPenContour, penContour, penPath, sameShape, STRAIGHT, type PenPath } from "../src/engine/contour/pen.js";
import { resolveAll, type Contour } from "../src/engine/contour/model.js";
import { circleTemplate } from "../src/engine/contour/templates.js";
import { findPoles } from "../src/kernel/poles.js";
import { defaultState, type ShellState } from "../src/shell/state.js";
import { decodeShell, encodeShell } from "../src/shell/viewState.js";
import { mountApp, type ShellHandle } from "../src/shell/app.js";
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

describe("bulgeFromApex — the drag's arithmetic, and penPath's", () => {
  // ONE formula with two consumers: the gesture turns a pointer position into a bulge, and
  // `penPath` reads a bulge back off a finished arc. They were two copies of the same three lines
  // until the second was written. Tested here because the gesture itself lives in a closure inside
  // `mountApp`, where only a browser can reach it — so the arithmetic is pinned separately from the
  // wiring, and `penInk.browser.test.ts` pins the wiring.
  it("inverts arcThroughBulge: the apex it reports is the apex that was asked for", () => {
    for (const bulge of [0.3, -0.7, 2, -3.5]) {
      const from: [number, number] = [-1, 0.5];
      const to: [number, number] = [2, -1];
      const g = arcThroughBulge(from, to, bulge);
      expect(g).not.toBeNull();
      if (g === null) continue;
      expect(bulgeFromApex(from, to, arcAt(g, 0.5))).toBeCloseTo(bulge, 9);
    }
  });

  it("is SIGNED by the side the pointer is on, which is what makes the drag read naturally", () => {
    const from: [number, number] = [0, 0];
    const to: [number, number] = [2, 0];
    // Travelling +x, "left" is +y.
    expect(bulgeFromApex(from, to, [1, 0.5])).toBeCloseTo(0.5, 12);
    expect(bulgeFromApex(from, to, [1, -0.5])).toBeCloseTo(-0.5, 12);
    // And it measures the PERPENDICULAR offset only: sliding along the chord changes nothing.
    expect(bulgeFromApex(from, to, [1.9, 0.5])).toBeCloseTo(0.5, 12);
  });

  it("returns 0 for a degenerate chord rather than dividing by zero", () => {
    expect(bulgeFromApex([1, 1], [1, 1], [2, 2])).toBe(0);
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
    // **EVERY piece, not SOME** — a sweep survivor. This predicate chooses a WIRE FORM, so a
    // contour that merely CONTAINS a drawn piece has to fall through to the codec's refusal rather
    // than be carried as a path of vertices: `penPath` reads one vertex per piece start, which would
    // silently reinterpret a template's pieces as corners of a drawn one.
    const mixed: Contour = { pieces: [...penContour(square).pieces, ...circleTemplate().pieces], params: {} };
    expect(isPenContour(mixed)).toBe(false);
    expect(penPath(mixed)).toBeNull();
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

  it("compares the KIND too, which the samples alone cannot always decide", () => {
    // **THIS TEST'S FIRST DRAFT PINNED THE OUTCOME WITHOUT PINNING THE REASON, and re-running the
    // sweep is what said so.** It bowed a chord of 2 by 1e-8 and asserted `sameShape` was false,
    // which it is — but with the kind check DELETED it is still false, because the samples differ by
    // 1.4e-8, fourteen times SHAPE_EPS. The claim in the name was never being tested.
    //
    // Measured, the check cannot be the deciding vote for a chord of ordinary size at the DEFAULT
    // tolerance: an arc is an arc only above the straightness floor, so its radius is at least
    // `h²/2e-9`, and at `h = 1` that is 5e8 — where `pointAt`'s own cancellation moves the samples
    // by 1.1e-7, two orders above the tolerance. The samples always disagree first.
    //
    // Where it decides is a SHORT chord, where the radius is small (1.25e-5 here), the arithmetic is
    // exact and the bow sits inside the tolerance. Sampled at 1e-7 these two ARE the same curve;
    // they are still not the same piece — `theta0`/`theta1` rather than `from`/`to`, a different row
    // in the ledger, and a different thing to drag.
    //
    // The bulge sits on the node the piece LEAVES, so node 0 bows piece 0. (Written on node 1 the
    // first time, which bows the CLOSING piece — a mistake the failure named immediately.)
    const h = 5e-7;
    const bowed = penContour({ nodes: [{ at: [-h, 0], bulge: 1e-8 }, { at: [h, 0] }], closed: true });
    const straight = penContour({ nodes: [{ at: [-h, 0] }, { at: [h, 0] }], closed: true });
    expect(bowed.pieces[0].geom.kind).toBe("arc");
    expect(straight.pieces[0].geom.kind).toBe("segment");
    // The samples genuinely agree at this tolerance — asserted, not assumed, or the line below
    // would be passing for the same reason the first draft did.
    const ra = resolveAll(bowed);
    const rb = resolveAll(straight);
    let worst = 0;
    for (let i = 0; i < ra.length; i++) {
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const a = pointAt(ra[i], t);
        const b = pointAt(rb[i], t);
        worst = Math.max(worst, Math.hypot(a[0] - b[0], a[1] - b[1]));
      }
    }
    expect(worst).toBeLessThan(1e-7);
    expect(sameShape(bowed, straight, 1e-7)).toBe(false);
    // And at the default tolerance, where the samples decide it anyway.
    expect(sameShape(bowed, straight)).toBe(false);
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

    // **A DROPPED PIECE is the one difference the sampling cannot see**, because the loop runs over
    // the FIRST contour's pieces: an open path of three vertices shares its two pieces exactly with
    // the first two of an open path of four, so without the length check the shorter compares EQUAL
    // to the longer. A sweep survivor, and the piece-count claim the doc comment makes.
    const three = penContour({ nodes: [{ at: [-1, 0] }, { at: [0, 0] }, { at: [1, 0] }], closed: false });
    const four = penContour({
      nodes: [{ at: [-1, 0] }, { at: [0, 0] }, { at: [1, 0] }, { at: [1, 1] }],
      closed: false,
    });
    expect([three.pieces.length, four.pieces.length]).toEqual([2, 3]);
    expect(sameShape(three, four)).toBe(false);
    expect(sameShape(four, three)).toBe(false);
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

  it("REFUSES to mint a link whose vertices do not rebuild the shape on screen", () => {
    // A sweep survivor, and one worth the trouble: deleting the verification left every test green,
    // because every path the pen can actually draw round-trips — which is the point of the check and
    // also why nothing exercised it. What it guards is a contour whose pieces are NOT the chain its
    // vertices describe. `penPath` reads ONE vertex per piece START, so a broken chain reads back as
    // a path that closes through the gap, and the link would open a shape nobody drew.
    const seg = (id: string, n: number, from: Cx, to: Cx, colour: 0 | 1): Contour["pieces"][number] => ({
      id,
      name: `drawn segment ${n}`,
      geom: { kind: "segment", from: { x: from[0], y: from[1] }, to: { x: to[0], y: to[1] } },
      role: "free",
      colour,
    });
    const broken: Contour = {
      // Piece 1 starts at (1,1), nowhere near where piece 0 ends.
      pieces: [seg("pen0", 1, [0, 0], [2, 0], 0), seg("pen1", 2, [1, 1], [0, 0], 1)],
      params: {},
    };
    // The path read back carries the two STARTS, and nothing in it says where piece 0 really ended.
    expect(penPath(broken)?.nodes.map((n) => n.at)).toEqual([
      [0, 0],
      [1, 1],
    ]);
    const enc = encodeShell({ ...defaultState(broken), contourSource: null, sandboxContour: broken });
    expect(enc.ok).toBe(false);
    if (enc.ok) return;
    expect(enc.reason).toContain("do not rebuild the shape on screen");
    // Named with its own count, so the refusal says which contour it is about.
    expect(enc.reason).toContain("2 vertices");
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

// ──────────────────────────────────────────────────────────────────────────────────────────────
// The pen AT THE SHELL (M7.2c) — the grammar, and what it produces.
//
// jsdom has no canvas, so the preview's ink is the browser suite's business. What is testable here
// is everything that decides a CONTOUR: which click places what, what closes, what the snap names,
// and that the result is the same object a template would have produced.
// ──────────────────────────────────────────────────────────────────────────────────────────────

describe("drawing a contour by hand, at the shell", () => {
  const mountApp2 = mountApp;
  const setup = (): { root: HTMLElement; app: ShellHandle } => {
    HTMLCanvasElement.prototype.getContext = (() => null) as never;
    // jsdom implements neither `PointerEvent` nor pointer capture. Stubbed here rather than guarded
    // in the app: the shell has called `setPointerCapture` since M3.5c and a `try` around it would
    // be production code shaped by a test environment.
    if (!("setPointerCapture" in Element.prototype)) {
      (Element.prototype as unknown as { setPointerCapture: (id: number) => void }).setPointerCapture = () => {};
      (Element.prototype as unknown as { releasePointerCapture: (id: number) => void }).releasePointerCapture = () => {};
    }
    window.history.replaceState(null, "", window.location.pathname);
    const root = document.createElement("div");
    document.body.replaceChildren(root);
    return { root, app: mountApp2(root) };
  };
  const q2 = <T extends HTMLElement = HTMLElement>(root: Element, sel: string): T => {
    const e = root.querySelector<T>(sel);
    if (e === null) throw new Error(`no ${sel}`);
    return e;
  };
  const byLabel2 = <T extends HTMLElement = HTMLElement>(root: Element, label: string): T =>
    q2<T>(root, `[aria-label="${label}"]`);
  /** The button in `host` whose text is exactly `label`. */
  const clickIn2 = (host: Element, label: string): void => {
    const b = [...host.querySelectorAll("button")].find((x) => (x.textContent ?? "").trim() === label);
    if (b === undefined) throw new Error(`no button '${label}'`);
    b.click();
  };

  /**
   * A click on the stage at a screen point — the same path a pointer takes.
   *
   * **WHAT JSDOM ACTUALLY DOES TO THE GEOMETRY, measured rather than assumed.** Its
   * `getBoundingClientRect` is all zeros and `clientWidth`/`clientHeight` are 0 — but `viewport()`
   * guards with `|| 1`, so `scale` is `2·halfHeight / 1` and the screen→plot map **MAGNIFIES by 4**
   * rather than collapsing: pixel `p` lands at `(p − 0.5)·4` world units, and the grab tolerance is
   * `11 × 4 = 44` world units. (An earlier comment here said every pixel went to the view centre.
   * It does not, and believing it cost this file a test that asserted the wrong thing — see the drag
   * below.) Distances all scale by the same factor, so every decision that compares one to the
   * tolerance is scale-INVARIANT here; what changes is that 10 px from the origin is inside it, so
   * the points below are chosen deliberately rather than assumed far apart.
   */
  const clickAt = (root: Element, x: number, y: number): void => {
    const stage = q2(root, ".stage");
    const ev = new MouseEvent("pointerdown", { bubbles: true, clientX: x, clientY: y });
    Object.defineProperty(ev, "pointerId", { value: 1 });
    stage.dispatchEvent(ev);
  };

  it("offers the pen only in the SANDBOX, since a record's contour is the record's", () => {
    const { root } = setup();
    expect(root.querySelector('[aria-label="draw a contour by hand"]')).not.toBeNull();
    const source = q2(root, ".sourceToggle");
    const gallery = [...source.querySelectorAll("button")].find((b) => b.textContent === "Gallery");
    gallery?.click();
    expect(root.querySelector('[aria-label="draw a contour by hand"]')).toBeNull();
  });

  it("shows the GRAMMAR while drawing, because an undiscoverable gesture is no gesture", () => {
    const { root } = setup();
    byLabel2<HTMLButtonElement>(root, "draw a contour by hand").click();
    const card = q2(root, ".rail");
    const text = card.textContent ?? "";
    expect(text).toContain("Click to place a corner");
    expect(text).toContain("drag to bow");
    expect(text).toContain("Backspace");
    expect(text).toContain("Escape");
    // And the controls that do the same jobs for a pointer-only reader.
    expect(root.querySelector('[aria-label="close the drawn path and adopt it as the contour"]')).not.toBeNull();
    expect(root.querySelector('[aria-label="remove the last vertex"]')).not.toBeNull();
    expect(root.querySelector('[aria-label="abandon the drawn path"]')).not.toBeNull();
  });

  it("counts vertices as they are placed, and Undo removes ONE — object-level, not per-sample", () => {
    const { root } = setup();
    byLabel2<HTMLButtonElement>(root, "draw a contour by hand").click();
    const count = (): string => q2(root, ".penRow .num").textContent ?? "";
    expect(count()).toContain("0 vertexes");
    clickAt(root, 10, 10);
    expect(count()).toContain("1 vertex");
    clickAt(root, 20, 20);
    clickAt(root, 30, 10);
    expect(count()).toContain("3 vertexes");
    byLabel2<HTMLButtonElement>(root, "remove the last vertex").click();
    expect(count()).toContain("2 vertexes");
  });

  it("will not CLOSE a path that is not one — two vertices is not a contour", () => {
    const { root } = setup();
    byLabel2<HTMLButtonElement>(root, "draw a contour by hand").click();
    const close = byLabel2<HTMLButtonElement>(root, "close the drawn path and adopt it as the contour");
    expect(close.disabled).toBe(true);
    clickAt(root, 10, 10);
    clickAt(root, 20, 20);
    expect(byLabel2<HTMLButtonElement>(root, "close the drawn path and adopt it as the contour").disabled).toBe(true);
    clickAt(root, 30, 10);
    expect(byLabel2<HTMLButtonElement>(root, "close the drawn path and adopt it as the contour").disabled).toBe(false);
  });

  it("ABANDONS on Cancel, leaving the contour that was there", () => {
    const { root, app } = setup();
    const before = app.currentState().contour.pieces;
    byLabel2<HTMLButtonElement>(root, "draw a contour by hand").click();
    clickAt(root, 10, 10);
    clickAt(root, 20, 20);
    byLabel2<HTMLButtonElement>(root, "abandon the drawn path").click();
    expect(app.currentState().contour.pieces).toEqual(before);
    // And the pen is put away.
    expect(root.querySelector('[aria-label="draw a contour by hand"]')).not.toBeNull();
  });

  it("ADOPTS the drawn path as the contour, with no recipe — which is the truth about it", () => {
    const { root, app } = setup();
    byLabel2<HTMLButtonElement>(root, "draw a contour by hand").click();
    clickAt(root, 10, 10);
    clickAt(root, 60, 10);
    clickAt(root, 35, 60);
    byLabel2<HTMLButtonElement>(root, "close the drawn path and adopt it as the contour").click();
    const state = app.currentState();
    // Pen ids, pen names: the pieces are first-class objects, not an anonymous polyline.
    expect(state.contour.pieces.map((p) => p.id)).toEqual(["pen0", "pen1", "pen2"]);
    expect(state.contour.pieces.every((p) => p.name.startsWith("drawn "))).toBe(true);
    expect(state.contourSource).toBeNull();
    expect(penPath(state.contour)?.closed).toBe(true);
    // The pen is put away, and the card says the contour is hand-drawn.
    expect(q2(root, ".rail").textContent ?? "").toContain("drawn · 3 pieces");
  });

  it("DRAG BOWS the piece into an arc — and jsdom CAN see it, which is the correction", () => {
    // The first draft bowed the piece LEAVING the new vertex, measured against a chord whose far end
    // was still the click itself: a zero chord, so `penBow` returned and nothing happened. It bows
    // the INCOMING piece now, against a chord both of whose ends are placed.
    //
    // **AND THE STORY ABOUT WHY THE BUG SURVIVED WAS WRONG.** It was recorded as invisible to jsdom
    // by construction — a zero-sized rect collapsing the chord — and measuring says otherwise: the
    // `|| 1` viewport guard MAGNIFIES the geometry by 4 (see `clickAt`), the chord here is 280 world
    // units long, and the drag produces a real arc with a bulge of −358. What let the bug through
    // was this test asserting the piece COUNT, where the defect shows in the KINDS. So it asserts
    // the kinds, and the browser file's job is the one thing jsdom really cannot supply — the app's
    // own layout, with a tolerance of 11 real pixels and a stage with a true aspect.
    const { root, app } = setup();
    byLabel2<HTMLButtonElement>(root, "draw a contour by hand").click();
    clickAt(root, 10, 10);
    clickAt(root, 80, 10);
    // The press placed vertex 2; now move WITH THE BUTTON HELD, which is what bows it.
    const stage = q2(root, ".stage");
    const drag = new MouseEvent("pointermove", { bubbles: true, clientX: 45, clientY: 90, buttons: 1 });
    Object.defineProperty(drag, "pointerId", { value: 1 });
    stage.dispatchEvent(drag);
    clickAt(root, 45, -60);
    byLabel2<HTMLButtonElement>(root, "close the drawn path and adopt it as the contour").click();

    const kinds = app.currentState().contour.pieces.map((p) => p.geom.kind);
    // Exactly one arc, and it is the piece the drag bowed — the INCOMING one, piece 0.
    expect(kinds).toEqual(["arc", "segment", "segment"]);
    expect(app.currentState().contour.pieces[0].name).toBe("drawn arc 1");
    // Signed by the side the pointer pulled towards, which is what makes the gesture read naturally.
    // The magnitude is in jsdom's magnified units, so the sign and the non-zero are the claim.
    const bulge = penPath(app.currentState().contour)?.nodes[0].bulge ?? 0;
    expect(bulge).toBeLessThan(-1);
    expect(app.currentState().contourSource).toBeNull();
  });

  it("ENTER closes the path, and ESCAPE abandons it — the keyboard half of the grammar", () => {
    const { root, app } = setup();
    const ink = q2(root, "canvas.ink");

    // Escape first: three vertices, then abandon.
    byLabel2<HTMLButtonElement>(root, "draw a contour by hand").click();
    clickAt(root, 10, 10);
    clickAt(root, 20, 20);
    const before = app.currentState().contour.pieces;
    ink.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(root.querySelector('[aria-label="draw a contour by hand"]')).not.toBeNull();
    expect(app.currentState().contour.pieces).toEqual(before);

    // Then Enter, which commits.
    byLabel2<HTMLButtonElement>(root, "draw a contour by hand").click();
    clickAt(root, 10, 10);
    clickAt(root, 20, 20);
    clickAt(root, 30, 30);
    ink.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(app.currentState().contourSource).toBeNull();
    expect(app.currentState().contour.pieces.map((p) => p.id)).toEqual(["pen0", "pen1", "pen2"]);
  });

  it("does NOT rebuild the card on a move that changes nothing — a focused control keeps focus", () => {
    // A sweep survivor whose consequence is not cosmetic. `renderContourCard` REPLACES the card's
    // children, so rebuilding it on every pointer sample destroys and recreates the buttons — and a
    // reader who has tabbed to `Cancel` loses focus to the document the moment the mouse crosses the
    // stage. The guard is `snapped.why !== penSnap`.
    //
    // **BOTH POINTS ARE CHOSEN SO THAT NOTHING SNAPS**, which took measuring: jsdom's tolerance is
    // 44 world units (see `clickAt`), so a click at (10, 10) is *inside* it and reads "snapped to
    // the origin" — and the first draft of this test then saw a legitimate rebuild on the move and
    // failed on the clean tree. At (40, 40) and (60, 45) the snap is null both times, so a rebuild
    // can only be the guard failing.
    const { root } = setup();
    byLabel2<HTMLButtonElement>(root, "draw a contour by hand").click();
    clickAt(root, 40, 40);
    expect(root.querySelector(".snapNote")).toBeNull();
    const cancel = byLabel2<HTMLButtonElement>(root, "abandon the drawn path");
    cancel.focus();
    expect(document.activeElement).toBe(cancel);
    const move = new MouseEvent("pointermove", { bubbles: true, clientX: 60, clientY: 45 });
    Object.defineProperty(move, "pointerId", { value: 1 });
    q2(root, ".stage").dispatchEvent(move);
    expect(root.querySelector(".snapNote"), "the move must snap to nothing, or the rebuild is honest").toBeNull();
    expect(document.activeElement, "a pointer move rebuilt the card and took the focus").toBe(cancel);
  });

  it("REFUSES to commit a path of ONE — Enter on a single vertex is not a contour", () => {
    // A sweep survivor, and rule 9 ("degenerate states are named and refused, not computed") in the
    // one place it could still be got wrong: Enter calls `penCommit(penNodes.length >= 3)`, so with
    // one vertex it asks for an OPEN commit, and `penContour` builds ZERO pieces from an open path
    // of one. Loosening the guard to `< 1` therefore adopts an EMPTY contour — no pieces, no ledger
    // rows about anything, and no way back except the template picker.
    const { root, app } = setup();
    const before = app.currentState().contour.pieces;
    byLabel2<HTMLButtonElement>(root, "draw a contour by hand").click();
    clickAt(root, 10, 10);
    q2(root, "canvas.ink").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    // Nothing adopted, and the pen is still out with the one vertex it had.
    expect(app.currentState().contour.pieces).toEqual(before);
    expect(q2(root, ".penRow .num").textContent ?? "").toContain("1 vertex");
  });

  it("BACKSPACE removes one vertex, as the button does", () => {
    const { root } = setup();
    const ink = q2(root, "canvas.ink");
    byLabel2<HTMLButtonElement>(root, "draw a contour by hand").click();
    clickAt(root, 10, 10);
    clickAt(root, 20, 20);
    ink.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }));
    expect(q2(root, ".penRow .num").textContent).toContain("1 vertex");
  });

  it("is PUT AWAY when the sandbox is left — M7's closing review found it was not", () => {
    // **THE DEFECT, measured.** The pen's controls live in the Contour card and the card offers them
    // in the sandbox only, so switching to gallery mode took them off screen while `penNodes` stayed
    // non-null — and `pointerdown` takes the pen's click BEFORE any grab test, deliberately. With
    // two vertices placed, a click in gallery mode placed a THIRD into a path with no visible
    // controls, and Enter then committed it: `contourSource` went null and `sandboxContour` became a
    // contour the reader never drew, which is what they would find on returning to the sandbox.
    const { root, app } = setup();
    const source = app.currentState().contourSource;
    expect(source).not.toBeNull();
    byLabel2<HTMLButtonElement>(root, "draw a contour by hand").click();
    clickAt(root, 40, 40);
    clickAt(root, 80, 40);
    expect(q2(root, ".penRow .num").textContent).toContain("2 vertex");

    clickIn2(q2(root, ".sourceToggle"), "Gallery");
    // A click on the stage is the RECORD's now, not a third vertex, and Enter commits nothing.
    clickAt(root, 120, 60);
    q2(root, "canvas.ink").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(app.currentState().mode).toBe("gallery");

    // Back in the sandbox: the pen is offered afresh, and the recipe is the one that was there.
    clickIn2(q2(root, ".sourceToggle"), "Sandbox");
    expect(root.querySelector('[aria-label="draw a contour by hand"]')).not.toBeNull();
    expect(root.querySelector(".penRow .num")).toBeNull();
    expect(app.currentState().contourSource).toEqual(source);
  });

  it("and by a RESTORED state, which is the same defect through `applyState`", () => {
    const { root, app } = setup();
    byLabel2<HTMLButtonElement>(root, "draw a contour by hand").click();
    clickAt(root, 40, 40);
    // A contrast cell, a drill rung and a `#vs=` link all land here.
    app.applyState({ ...defaultState(circleTemplate([0, 0], 1)), expr: "1/(1+z^2)" });
    expect(root.querySelector('[aria-label="draw a contour by hand"]')).not.toBeNull();
    // `.penRow` is the card's button row either way — what is gone is the vertex COUNT.
    expect(root.querySelector(".penRow .num")).toBeNull();
    clickAt(root, 90, 90);
    // The click did not reach a stale pen: the contour is still the template's.
    expect(app.currentState().contour.pieces.map((p) => p.id)).toEqual(["circle"]);
    expect(app.currentState().contourSource).toEqual({ template: "circle", shift: [0, 0] });
  });

  it("and the adopted contour gets a LINK, which is what M7.2b's wire form is for", () => {
    const { root, app } = setup();
    byLabel2<HTMLButtonElement>(root, "draw a contour by hand").click();
    clickAt(root, 10, 10);
    clickAt(root, 60, 10);
    clickAt(root, 35, 60);
    byLabel2<HTMLButtonElement>(root, "close the drawn path and adopt it as the contour").click();
    const enc = encodeShell(app.currentState());
    expect(enc.ok, enc.ok ? "" : enc.reason).toBe(true);
    if (!enc.ok) return;
    const back = decodeShell(enc.hash);
    expect(back?.ok).toBe(true);
    if (back === null || !back.ok) return;
    expect(sameShape(back.state.contour, app.currentState().contour)).toBe(true);
  });
});
