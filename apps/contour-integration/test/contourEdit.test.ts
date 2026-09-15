// `reverseContour` — M8 step 1.4b.
//
// The engine half of the Contour card's one new control. **Its whole content is that `∮` changes
// sign**, which is why the test is the integral and not the data: a reversal that produced a
// plausible-looking piece list and the same value would be a reversal that did nothing.
import { describe, expect, it } from "vitest";

import { circleTemplate, semicircleTemplate } from "../src/engine/contour/templates.js";
import { reverseContour } from "../src/engine/contour/edit.js";
import { resolveAll } from "../src/engine/contour/model.js";
import { integrateContour } from "../src/engine/contour/integrate.js";
import type { Cx } from "../src/kernel/geom.js";

/** `1/z`, whose integral round the unit circle is the one number every reader knows. */
const oneOverZ = ([x, y]: Cx): Cx => {
  const d = x * x + y * y;
  return [x / d, -y / d];
};

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
