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

import type { Cx } from "../src/kernel/geom.js";
import { findPoles } from "../src/kernel/poles.js";
import { integrateContour } from "../src/engine/contour/integrate.js";
import { applyResidueTheorem } from "../src/engine/residueTheorem.js";
import { evaluateLedger } from "../src/engine/ledger.js";
import { resolveAll, type Contour } from "../src/engine/contour/model.js";
import { semicircleTemplate } from "../src/engine/contour/templates.js";
import { arcThroughBulge, penContour, penPath, type PenPath } from "../src/engine/contour/pen.js";

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
