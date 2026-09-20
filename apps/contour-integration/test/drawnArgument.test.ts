// **A DRAWN CONTOUR THAT IS AN ARGUMENT** — M8 step 4.2.
//
// M7.2 gave the pen a grammar and a shape; step 4.1 gave every piece a role and a declared lemma.
// This is the join: a hand-drawn semicircle with its base as the target and its arc vanishing by
// the ML estimate reports π, with the same certificate a template's would carry.
//
// **THE PLAN'S PREMISE FOR THIS STEP IS FALSE, AND MEASURING IS HOW.** It says the arc readers
// "today read template arcs only" and would have to be taught a drawn arc's geometry. They do not:
// `LedgerInput` carries RESOLVED geometry, which is where a bound's hypotheses are asked — so an
// arc that is genuinely centred at the origin certifies whatever produced it, and one that is not
// refuses, equally whatever produced it. What a drawn arc lacked was a way to BE centred at the
// origin (the pen's two snaps, step 4.2's other half) and a way to carry a role at all.
import { describe, expect, it } from "vitest";
import { makeComplexFn, parse } from "@cas/expr";

import { pointAt, type Cx } from "../src/kernel/geom.js";
import { findPoles } from "../src/kernel/poles.js";
import { integrateContour } from "../src/engine/contour/integrate.js";
import { applyResidueTheorem } from "../src/engine/residueTheorem.js";
import { evaluateLedger } from "../src/engine/ledger.js";
import { resolveAll, type Contour } from "../src/engine/contour/model.js";
import { semicircleTemplate } from "../src/engine/contour/templates.js";
import { arcThroughBulge, penContour, penPath, sameShape, type PenPath } from "../src/engine/contour/pen.js";
import { defaultState, type ShellState } from "../src/shell/state.js";
import { decodeShell, encodeShell } from "../src/shell/viewState.js";
import { TEMPLATES } from "../src/shell/templates.js";

function run(src: string, contour: Contour) {
  const ast = parse(src);
  const fn = makeComplexFn(ast);
  const f = (z: Cx): Cx => fn(z as [number, number], [0, 0]) as Cx;
  const pieces = resolveAll(contour);
  const poles = findPoles(ast);
  const integral = integrateContour(
    f,
    pieces,
    poles.poles.map((p) => ({ at: p.at, order: p.order })),
  );
  const theorem = applyResidueTheorem(poles, integral);
  return evaluateLedger({ ast, pieces, spec: contour.pieces, poles, integral, theorem });
}

/**
 * The plan's own figure: an upper semicircle of radius `R`, drawn as two pieces.
 *
 * Counter-clockwise, because that is the orientation the residue theorem is stated in and a
 * clockwise one answers `−π` — which is correct and is not the number the plan names. The base runs
 * `(−R, 0) → (R, 0)` and the arc returns over the top, bowing left of its own direction of travel
 * by exactly `R`, which is what puts the centre at the origin.
 */
function drawnSemicircle(R: number, roles = true): PenPath {
  return {
    nodes: [
      { at: [-R, 0] as const, ...(roles ? { role: "target" as const } : {}) },
      { at: [R, 0] as const, bulge: R, ...(roles ? { role: "vanish" as const, lemma: "L2" as const } : {}) },
    ],
    closed: true,
  };
}

const arcRow = (r: ReturnType<typeof run>) =>
  r.rows.filter((x) => x.constraint === "KILL").find((x) => x.pieceId === "pen1");

describe("a drawn semicircle is an argument, not a shape", () => {
  it("is centred at the origin EXACTLY, which is what the bound's hypothesis asks", () => {
    // `arcRadius` refuses any arc whose centre is not exactly `(0, 0)` — M4.6c's finding, since
    // every certified bound reasons about `|z| = R` about the origin. With the base vertices at
    // `±R` and the bulge at `R`, the construction's `k = (b² − h²)/(2b)` is a difference of two
    // identical floats, so the centre is exactly zero rather than nearly so. `toBe`, not
    // `toBeCloseTo`: the engine's test is `!== 0`, and "nearly zero" is what it refuses.
    const arc = arcThroughBulge([-8, 0], [8, 0], 8);
    expect(arc?.center[0]).toBe(0);
    expect(arc?.center[1]).toBe(0);
    expect(arc?.radius).toBe(8);
  });

  it("closes, and reports π with the ML estimate's own certificate", () => {
    const drawn = penContour(drawnSemicircle(8));
    const r = run("1/(1+z^2)", drawn);
    expect(r.closes).toBe(true);
    expect(r.target?.text).toBe("π");
    expect(arcRow(r)?.status).toBe("satisfied");
    expect(arcRow(r)?.evidence.level).toBe("≤");
  });

  it("carries the SAME certificate a template's arc does, sentence for sentence", () => {
    // The step's claim in its strongest form: a drawn piece is treated exactly as a template piece.
    // Comparing the rendered claim rather than the status is what makes it a claim about the
    // CERTIFICATE — the same lemma, the same degree gap, the same number — instead of about two
    // arcs both happening to pass.
    const drawn = run("1/(1+z^2)", penContour(drawnSemicircle(8)));
    const template = run("1/(1+z^2)", semicircleTemplate(8));
    const fromDrawn = arcRow(drawn);
    const fromTemplate = template.rows
      .filter((x) => x.constraint === "KILL")
      .find((x) => x.pieceId === "arc");
    expect(fromDrawn).toBeDefined();
    expect(fromTemplate).toBeDefined();
    // The piece's NAME differs — `drawn arc 2` against the template's own — so the comparison is on
    // the certificate the bound module wrote, which is where the mathematics is.
    expect(fromDrawn?.evidence.claim).toBe(fromTemplate?.evidence.claim);
    expect(fromDrawn?.evidence.level).toBe(fromTemplate?.evidence.level);
    expect(drawn.target?.text).toBe(template.target?.text);
  });

  it("refuses an OFF-CENTRE drawn arc by name, and says what the bound needs", () => {
    // What a hand drag really produces. The bulged piece is the RETURN arc — the one LEAVING
    // `(8, 0)` — so its chord runs `(8,0) → (−8,0)` and its left normal points at `(0, −1)`.
    // Dragging the apex to a height of 7.6 instead of 8 gives `k = (7.6² − 8²)/(2·7.6) = −0.4105`,
    // and `M + n·k` puts the centre at `(0, +0.4105)`: a real geometric offset, not float noise,
    // and the bound that reasons about `|z| = R` about the origin does not apply to it. The sign
    // was wrong in the first draft, which is worth leaving recorded — a `PenNode`'s bulge belongs
    // to the piece LEAVING it, so the chord it bows is not always the one a reader pictures.
    const path: PenPath = {
      nodes: [
        { at: [-8, 0] as const, role: "target" as const },
        { at: [8, 0] as const, bulge: 7.6, role: "vanish" as const, lemma: "L2" as const },
      ],
      closed: true,
    };
    const drawn = penContour(path);
    const arc = drawn.pieces[1];
    expect(arc.geom.kind).toBe("arc");
    if (arc.geom.kind !== "arc") return;
    expect(arc.geom.center.y).toBeCloseTo(0.4105, 4);
    const row = arcRow(run("1/(1+z^2)", drawn));
    expect(row?.status).toBe("unknown");
    expect(row?.evidence.method).toContain("centred elsewhere");
    // And no target value is reported off an uncertified piece.
    expect(run("1/(1+z^2)", drawn).target).toBeUndefined();
  });

  it("refuses a DECLARED lemma on a drawn piece the same way it does on a template's", () => {
    // Step 4.1's routing knows nothing about where a piece came from, which is the point: the same
    // sentence, on a drawn arc, for the same reason.
    const path: PenPath = {
      nodes: [
        { at: [-8, 0] as const, role: "target" as const },
        { at: [8, 0] as const, bulge: 8, role: "vanish" as const, lemma: "L3" as const },
      ],
      closed: true,
    };
    const row = arcRow(run("1/(1+z^2)", penContour(path)));
    expect(row?.status).toBe("failed");
    expect(row?.claim).toContain("Jordan's lemma");
    expect(row?.claim).toContain("carries no such factor");
  });
});

describe("the pen carries a role, because nothing in the plane says one", () => {
  it("emits the node's role and lemma onto the piece", () => {
    const pieces = penContour(drawnSemicircle(8)).pieces;
    expect(pieces.map((p) => p.role)).toEqual(["target", "vanish"]);
    expect(pieces[1].lemma).toBe("L2");
    // The default is still `free`, which is the honest starting point for a path nobody has
    // described yet — an undisposed piece is a term nobody has bounded.
    expect(penContour(drawnSemicircle(8, false)).pieces.map((p) => p.role)).toEqual(["free", "free"]);
  });

  it("does NOT put a lemma on a piece that is not a vanishing one", () => {
    // A lemma is a statement about how a vanishing piece is disposed of; on a `target` it would be
    // a field nothing reads, and `setRole` clears it from the editing side for the same reason.
    const path: PenPath = {
      nodes: [
        { at: [-8, 0] as const, role: "target" as const, lemma: "L2" as const },
        { at: [8, 0] as const, bulge: 8, role: "vanish" as const, lemma: "L2" as const },
      ],
      closed: true,
    };
    const pieces = penContour(path).pieces;
    expect("lemma" in pieces[0]).toBe(false);
    expect(pieces[1].lemma).toBe("L2");
  });

  it("reads the role back, so `penContour(penPath(c))` is the whole round trip", () => {
    // Every other field of a node is recovered from the CURVE; a role has no geometric shadow, so
    // dropping it here would silently turn a drawn argument back into a drawn shape the first time
    // anything went through the path form.
    const drawn = penContour(drawnSemicircle(8));
    const path = penPath(drawn);
    expect(path).not.toBeNull();
    if (path === null) return;
    expect(path.nodes.map((n) => n.role)).toEqual(["target", "vanish"]);
    expect(path.nodes[1].lemma).toBe("L2");
    const again = penContour(path);
    expect(again.pieces.map((p) => p.role)).toEqual(["target", "vanish"]);
    expect(again.pieces[1].lemma).toBe("L2");
  });
});

describe("the arc's CENTRE is carried, because a bulge cannot hold it — M8 step 4.4b", () => {
  // **The defect this section exists for shipped in step 4.2 and was found by measuring 4.4b.** The
  // roles ride the wire since 4.4a, so a drawn argument survives a permalink — except that the one
  // thing `arcRadius` insists on, a centre of EXACTLY `(0, 0)`, does not. `penPath` reads the chord
  // and the apex back off the curve through `cos`/`sin`, so a semicircle of radius 8 whose centre
  // is exactly the origin comes back with bulge `7.999999999999999` and a centre at `(0, 8.9e-16)`.
  // The curve is the same to 1e-15 and the ARGUMENT is gone.
  const linked = (path: PenPath): Contour => {
    const drawn = penContour(path);
    const state: ShellState = {
      ...defaultState(TEMPLATES[0].build()),
      expr: "1/(1+z^2)",
      contour: drawn,
      sandboxContour: drawn,
      contourSource: null,
    };
    const e = encodeShell(state);
    if (!e.ok) throw new Error(`encode refused: ${e.reason}`);
    const back = decodeShell(e.hash);
    if (back === null) throw new Error("decode found no link");
    if (!back.ok) throw new Error(`decode refused: ${back.reason}`);
    return back.state.contour;
  };

  it("reopens from its own permalink still closing, with the same bound and the same value", () => {
    // **By VERDICT, not by centre.** The centre is the mechanism; what a reader loses is the
    // argument, so that is what the test compares — and before the fix this was `closes=false`,
    // a KILL row at `unknown`, and no target value at all.
    const drawn = penContour(drawnSemicircle(8));
    const before = run("1/(1+z^2)", drawn);
    expect(before.closes).toBe(true);
    expect(arcRow(before)?.evidence.level).toBe("≤");
    const after = run("1/(1+z^2)", linked(drawnSemicircle(8)));
    expect(after.closes, "the drawn argument did not survive its own link").toBe(true);
    expect(arcRow(after)?.evidence.level).toBe("≤");
    expect(after.rows.map((r) => `${r.constraint}|${r.status}|${r.evidence.level}`)).toEqual(
      before.rows.map((r) => `${r.constraint}|${r.status}|${r.evidence.level}`),
    );
    expect(before.target?.text, "the fixture reports no value, so the comparison is vacuous").toBe("π");
    expect(after.target?.text).toBe(before.target?.text);
  });

  it("restores the centre EXACTLY, and the curve is the one that was drawn", () => {
    // Both halves, because either alone would pass on a wrong fix: a centre of exactly zero on a
    // circle of the wrong radius is no better than an off-centre one on the right circle.
    const drawn = penContour(drawnSemicircle(8));
    const back = linked(drawnSemicircle(8));
    const arc = resolveAll(back)[1];
    expect(arc.kind).toBe("arc");
    if (arc.kind !== "arc") return;
    expect(arc.center).toEqual([0, 0]);
    expect(sameShape(back, drawn), "the restored arc is a different curve").toBe(true);
  });

  it("rebuilds an arc through BOTH of its ends, not just the one it starts from", () => {
    // **The claim's tolerance is looser than the geometry's, so the reconstruction has to be fair
    // to both ends.** `ORIGIN_EPS` admits ends whose distances from the origin differ by 1e-9
    // relative — that is what makes the claim checkable at all rather than a demand for bit
    // equality — so taking the radius from ONE end can leave the other 2e-9 off, which on a radius
    // of 8 is 1.6e-8 and above `sameShape`'s floor. The sweep found both spellings of the same
    // carelessness (a radius from one end, and an end angle from the bulge-built arc's own centre
    // rather than from the origin), and neither could be seen on an arc whose ends agree exactly.
    //
    // Forged rather than drawn, because the encoder never MAKES such a claim: it carries one only
    // for an arc that is already exactly centred. What is under test is what the decoder does with
    // one that arrives.
    const R = 8;
    const lopsided = R * (1 + 4e-10);
    const from: Cx = [-R, 0];
    const to: Cx = [lopsided, 0];
    // The bulge and the claim ride the node the piece LEAVES, which is step 4.2's own rule.
    const built = penContour({ nodes: [{ at: from, bulge: R, centred: true }, { at: to }], closed: false });
    const arc = resolveAll(built)[0];
    expect(arc.kind).toBe("arc");
    if (arc.kind !== "arc") return;
    expect(arc.center).toEqual([0, 0]);
    // **The property is that the two misses are EQUAL**, not that either is small: the gap is the
    // reader's, and no circle about the origin closes it. What the reconstruction owes them is not
    // to spend it all on one end. Measured: the mean splits the 3.2e-9 gap into 1.6e-9 either side,
    // where taking the radius from the start puts the whole of it on the finish.
    const missFrom = Math.hypot(pointAt(arc, 0)[0] - from[0], pointAt(arc, 0)[1] - from[1]);
    const missTo = Math.hypot(pointAt(arc, 1)[0] - to[0], pointAt(arc, 1)[1] - to[1]);
    const gap = Math.abs(Math.hypot(to[0], to[1]) - Math.hypot(from[0], from[1]));
    expect(gap).toBeGreaterThan(3e-9); // or the comparison below is between two zeros
    expect(missFrom, "one end was privileged over the other").toBeCloseTo(missTo, 12);
    expect(Math.max(missFrom, missTo)).toBeLessThan(gap * 0.6);
  });

  it("claims it only where it is TRUE, so an off-centre arc is not quietly re-centred", () => {
    // The pairing. A hand drag to an apex of 7.6 puts the centre at `(0, −0.4105)` — step 4.2's own
    // measurement — and `penPath` must not claim the origin for it, or the link would move the
    // curve and mint a `≤` from geometry that never carried one.
    const off: PenPath = {
      nodes: [
        { at: [-8, 0] as const, role: "target" as const },
        { at: [8, 0] as const, bulge: 7.6, role: "vanish" as const, lemma: "L2" as const },
      ],
      closed: true,
    };
    const path = penPath(penContour(off));
    expect(path?.nodes[1].centred).toBeUndefined();
    expect(penPath(penContour(drawnSemicircle(8)))?.nodes[1].centred).toBe(true);
    // And the refusal reaches the ledger rather than being a fact about a field: the off-centre
    // arc gets no bound of this shape, before or after a link.
    const back = linked(off);
    const arc = resolveAll(back)[1];
    expect(arc.kind === "arc" && arc.center[1] !== 0).toBe(true);
    expect(arcRow(run("1/(1+z^2)", back))?.status).toBe("unknown");
  });
});
