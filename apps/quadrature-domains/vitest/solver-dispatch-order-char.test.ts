// Characterization test for refactor stage A2 (finding QD-SOLV-1).
//
// Pins the behavior the dispatch-order guard protects: a *singular* solve request must route to the
// singular family, not its (superset-matching) base. `selectFamily` walks `familyDispatchOrder`
// front-to-back and returns the first `matches()` hit; a singular family's `matches()` is a strict
// subset of its base's, so the singular must be checked first. The live order is built by reverse
// load order (registerFamily unshift), and the load lists load base-before-singular — so this holds
// today. The guard functions added by the fix (checkDispatchOrder / assertDispatchOrder) are tested
// together with the fix; this file pins the pre-existing dispatch behavior and stays green before AND
// after. Loads the full solver graph headlessly (worker-entry.test.ts pattern).
import { describe, it, expect, beforeAll } from "vitest";

let QD: any;
beforeAll(async () => {
  ({ default: QD } = await import("../app/workers/solver-graph.mjs"));
});

describe("selectFamily dispatch precedence — singular before base (QD-SOLV-1 invariant)", () => {
  it("routes a singular LQD request to the singular family, not the base", () => {
    expect(QD.selectFamily({ lqd: true, singular: true }).name).toBe("boundedLQD_singular");
  });

  it("routes a non-singular LQD request to the base family", () => {
    expect(QD.selectFamily({ lqd: true }).name).toBe("boundedLQD");
  });

  it("routes a singular power-QD request to the singular family, not the base", () => {
    expect(QD.selectFamily({ alpha: 2, singular: true }).name).toBe("powerQD_singular");
  });

  it("routes a non-singular power-QD request to the base family", () => {
    expect(QD.selectFamily({ alpha: 2 }).name).toBe("powerQD");
  });
});
