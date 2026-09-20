// Two rows that said "satisfied" about nothing — the review's items 1.3 and 1.5.
//
// Both are the same shape of defect: a KILL row whose status was read off ONE field while the
// evidence beside it said something else. 1.3 is a `⚠` refusal still carrying `asymptotics:
// "vanishes"`; 1.5 is an `=` certificate for a claim nothing checked. In both cases the headline —
// what M8 calls the product — said "The argument is complete." about an argument that does not.
//
// Every assertion here pins the REASON as well as the outcome: the certificate's level, the
// sentence's own numbers, the constraint that stopped the argument. A later guard that refused for
// a different reason would pass an outcome-only test.
import { describe, expect, it } from "vitest";
import { makeComplexFn, parse } from "@cas/expr";
import { exact, refuse } from "@cas/rigor";

import type { Cx } from "../src/kernel/geom.js";
import { findPoles } from "../src/kernel/poles.js";
import { integrateContour } from "../src/engine/contour/integrate.js";
import { applyResidueTheorem } from "../src/engine/residueTheorem.js";
import {
  disposalEstablishes,
  evaluateLedger,
  ledgerHeadline,
} from "../src/engine/ledger.js";
import { headlineFails } from "../src/engine/vocabulary.js";
import { resolveAll, type Contour, type Piece, type PieceRole } from "../src/engine/contour/model.js";
import { semicircleTemplate, stripTemplate } from "../src/engine/contour/templates.js";

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

/** The same contour with one piece's role changed — what the sandbox's role menu and a link do. */
function withRole(contour: Contour, id: string, role: PieceRole): Contour {
  return {
    ...contour,
    pieces: contour.pieces.map((p): Piece => (p.id === id ? { ...p, role } : p)),
  };
}

const killFor = (r: ReturnType<typeof run>, pieceId: string) =>
  r.rows.find((x) => x.constraint === "KILL" && x.pieceId === pieceId);

describe("1.3 — a refusal that carries 'vanishes' is a refusal", () => {
  // THE RULE ITSELF, stated where no contour is needed to reach it. Six producers are separately
  // being changed to stop returning `"vanishes"` on a refusal; once they have, nothing routed
  // through `evaluateLedger` can build this pair any more — so a test that could only get at the
  // rule through a contour would silently stop asserting it. This one cannot.
  it("does not establish a vanishing limit from a ⚠ certificate", () => {
    const bound = refuse("the arc bound at $R = 0.5$", "a pole may lie on or outside the arc");
    expect(bound.level).toBe("⚠");
    expect(disposalEstablishes({ asymptotics: "vanishes", certificate: bound })).toBe(false);
  });

  it("still establishes one from the same asymptotics under a bound that was computed", () => {
    const computed = exact("the arc: $|\\int f\\,dz| \\le 1$", "exact ℚ coefficient bound");
    expect(disposalEstablishes({ asymptotics: "vanishes", certificate: computed })).toBe(true);
    expect(disposalEstablishes({ asymptotics: "bounded", certificate: computed })).toBe(false);
  });

  // And the contour that reached it. `1/(1+z²)` has its poles at `±i`, so below `|z| = 1` the
  // reverse triangle inequality gives no positive lower bound on the denominator and `mlArcBound`
  // refuses — while the degree gap is 2, so the refusal carried `"vanishes"`.
  it("fails the arc's row at R = 0.5, where the bound was refused", () => {
    const r = run("1/(1+z^2)", semicircleTemplate(0.5));
    const row = killFor(r, "arc");
    expect(row?.status).toBe("failed");
    expect(row?.evidence.level).toBe("⚠");
    // The row's own claim is the refusal's, which ends in its repair — so the row carries no
    // second one. The three that stood here before ("the ML-estimate does not vanish…") are all
    // statements about a number this path never computed.
    expect(row?.repair).toBeUndefined();
    expect(r.closes).toBe(false);
    expect(r.failedAt).toBe("KILL");
    expect(ledgerHeadline(r)).toBe(headlineFails("KILL"));
    expect(ledgerHeadline(r)).not.toBe("The argument is complete.");
    // The measured target was `0` where `∫_{−0.5}^{0.5} dx/(1+x²) = 0.9273`. No value at all now.
    expect(r.value).toBeUndefined();
    expect(r.target).toBeUndefined();
  });

  it("and the same argument at a radius that clears the poles closes exactly", () => {
    const r = run("1/(1+z^2)", semicircleTemplate(200));
    const row = killFor(r, "arc");
    expect(row?.status).toBe("satisfied");
    expect(row?.evidence.level).toBe("≤");
    expect(r.closes).toBe(true);
    expect(r.value?.text).toBe("π");
  });
});

describe("1.5 — a piece claimed to reproduce the target is checked against it", () => {
  // The review's own reproduction. `z/(1+z²)` on the upper semicircle at `R = 50`: the arc does not
  // vanish (`∫ → iπ`, ML flat at 3.143 for every R), so the honest argument fails at the arc — and
  // calling the arc a multiple of the target made `closes = true`, `value = πi`, headline complete.
  it("refuses the semicircle's arc, which runs 157.1 against the diameter's 100", () => {
    const r = run("z/(1+z^2)", withRole(semicircleTemplate(50), "arc", "reproduces"));
    const row = killFor(r, "arc");
    expect(row?.status).toBe("failed");
    expect(row?.evidence.level).toBe("⚠");
    // The reason, with its two numbers: πR = 157.1 against 2R = 100.
    expect(row?.evidence.method).toContain("it runs 157.1 against 100.0");
    expect(r.closes).toBe(false);
    expect(r.failedAt).toBe("KILL");
    expect(ledgerHeadline(r)).not.toBe("The argument is complete.");
    expect(r.value).toBeUndefined();
  });

  // A piece of exactly the right length whose value cannot be a multiple of the target's — the
  // second clause, which the first cannot see. `∫ z dz` over `[−R, R]` is 0 by oddness while the
  // return line at `Im z = h` gives `−2iRh`, so no constant relates them.
  it("refuses a piece of the target's own length whose target integrates to zero", () => {
    const r = run("z", stripTemplate(2 * Math.PI, 6));
    const row = killFor(r, "top");
    expect(row?.status).toBe("failed");
    expect(row?.evidence.level).toBe("⚠");
    expect(row?.evidence.method).toContain("the target integrates to 0 here");
    expect(r.closes).toBe(false);
    expect(r.failedAt).toBe("KILL");
  });

  // THE TOLERANCE HAS TO SCALE WITH THE CONTOUR, and the sweep is why this test exists: an absolute
  // `1e-9` survived every case above, because the corpus's `reproduces` pieces match their target's
  // length EXACTLY (0 in 35 of 36 fixtures, 1.1e-16 relative in the wedge's). The limit parameter
  // reaches `1e6`, where a length of 2e6 computed two ways is the same length to twelve digits and
  // not to nine — so an absolute floor would refuse the argument for a rounding difference.
  it("reads two lengths of 2e6 that differ by 1e-6 as the same length", () => {
    const wide: Contour = {
      pieces: [
        {
          id: "bottom",
          name: "the real axis",
          geom: { kind: "segment", from: { x: -1e6, y: 0 }, to: { x: 1e6, y: 0 } },
          role: "target",
          colour: 0,
        },
        {
          id: "right",
          name: "the right side",
          geom: { kind: "segment", from: { x: 1e6, y: 0 }, to: { x: 1e6 + 1e-6, y: 3 } },
          role: "vanish",
          lemma: "L1",
          colour: 1,
        },
        {
          id: "top",
          name: "the line Im z = 3",
          geom: { kind: "segment", from: { x: 1e6 + 1e-6, y: 3 }, to: { x: -1e6, y: 3 } },
          role: "reproduces",
          colour: 2,
        },
        {
          id: "left",
          name: "the left side",
          geom: { kind: "segment", from: { x: -1e6, y: 3 }, to: { x: -1e6, y: 0 } },
          role: "vanish",
          lemma: "L1",
          colour: 3,
        },
      ],
      params: {},
    };
    const r = run("1/(1+z^2)", wide);
    const row = killFor(r, "top");
    // Relative: 5.0e-13, inside the tolerance. Absolute: 1.0e-6, three orders outside it.
    expect(row?.status).toBe("satisfied");
    expect(row?.evidence.level).toBe("=");
  });

  it("refuses when no piece of the contour is the target at all", () => {
    const contour = withRole(stripTemplate(2 * Math.PI, 6), "bottom", "free");
    const r = run("exp(z)/(1+exp(z))", contour);
    const row = killFor(r, "top");
    expect(row?.status).toBe("failed");
    expect(row?.evidence.level).toBe("⚠");
    expect(row?.evidence.method).toContain("no piece of this contour is the target");
    expect(row?.repair).toContain("mark exactly one piece as the target");
  });

  it("refuses when two pieces are marked as the target, naming the count", () => {
    const contour = withRole(stripTemplate(2 * Math.PI, 6), "right", "target");
    const r = run("exp(z)/(1+exp(z))", contour);
    const row = killFor(r, "top");
    expect(row?.status).toBe("failed");
    expect(row?.evidence.method).toContain("2 pieces are marked as the target");
  });

  // And the row that should pass still does, at `=`: the strip's top runs the bottom's own length
  // and `1/(1+exp(z))` gives both sides a value the other is a constant multiple of.
  it("is satisfied and exact for the strip's return line", () => {
    const r = run("exp(z/2)/(1+exp(z))", stripTemplate(2 * Math.PI, 6));
    const row = killFor(r, "top");
    expect(row?.status).toBe("satisfied");
    expect(row?.evidence.level).toBe("=");
    expect(row?.evidence.method).toContain("runs the target's own length");
  });
});
