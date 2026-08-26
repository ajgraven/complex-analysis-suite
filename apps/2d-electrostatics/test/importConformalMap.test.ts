import { describe, it, expect } from "vitest";
import { RM_TO_POTENTIAL_CONFORMAL_LINK, RM_TO_POTENTIAL_CONFORMAL_CAPACITY } from "@cas/interchange";
import { conformalPolygonFromLink, buildConformalLink } from "../src/importConformalMap.js";
import { fitPolygonFlow } from "../src/polygonMap.js";
import type { Pt } from "../src/transplant.js";

// The consumer side of the RM → potential conformal golden (ADR-0035): decode the SAME frozen link the
// interchange package pins structurally, read its polygon, and re-fit the EXTERIOR flow map via
// @cas/conformal. The capacity it computes must match the frozen value — this is the real cross-app
// contract (a producer→consumer test cannot live in either app, so both pin the shared golden).
describe("RM → potential conformal golden (consumer side)", () => {
  it("decodes the polygon and re-fits its exterior capacity = the frozen value", () => {
    const imported = conformalPolygonFromLink(RM_TO_POTENTIAL_CONFORMAL_LINK);
    if (!imported) throw new Error("golden link did not decode to a conformal polygon");
    expect(imported.corners).toEqual([
      [1, -1],
      [1, 1],
      [-1, 1],
      [-1, -1],
    ]);
    expect(imported.engine).toBe("sc-interior"); // the producer (RM) fits the interior map
    const map = fitPolygonFlow(imported.corners); // the consumer re-derives its OWN exterior fit
    expect(map.converged).toBe(true);
    expect(map.capacity).toBeCloseTo(RM_TO_POTENTIAL_CONFORMAL_CAPACITY, 6);
  });

  it("ignores a non-conformal or malformed link", () => {
    expect(conformalPolygonFromLink("#s=not-a-real-link")).toBeNull();
    expect(conformalPolygonFromLink("#nonsense")).toBeNull();
  });
});

describe("producer round-trip", () => {
  it("a built link decodes back to the same polygon (engine sc-exterior)", () => {
    const corners: Pt[] = [
      [1.3, 0],
      [0, 1.3],
      [-1.3, 0],
      [0, -1.3],
    ];
    const map = fitPolygonFlow(corners);
    const link = buildConformalLink(
      corners,
      {
        engine: "sc-exterior",
        angles: map.angles,
        prevertices: map.cornerPreimages,
        capacity: map.capacity,
        converged: map.converged,
        degraded: map.degraded,
        residual: map.residual,
      },
      { createdAt: "2026-07-06T00:00:00Z" },
    );
    const back = conformalPolygonFromLink(link);
    if (!back) throw new Error("round-trip link did not decode");
    expect(back.engine).toBe("sc-exterior");
    expect(back.corners.length).toBe(4);
    for (let i = 0; i < corners.length; i++) {
      expect(back.corners[i][0]).toBeCloseTo(corners[i][0], 12);
      expect(back.corners[i][1]).toBeCloseTo(corners[i][1], 12);
    }
  });
});
