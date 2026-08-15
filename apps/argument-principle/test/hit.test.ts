import { describe, expect, it } from "vitest";
import { nearestRoot, isolateRadius } from "../src/hit.js";
import type { Singularities } from "../src/singularities.js";

const sing = (over: Partial<Singularities> = {}): Singularities => ({
  zeros: [],
  poles: [],
  critical: [],
  differentiable: true,
  exact: true,
  ...over,
});

describe("nearestRoot (F13 / C7 hit-testing)", () => {
  const s = sing({
    zeros: [
      { z: [1, 0], order: 1 },
      { z: [-1, 0], order: 2 },
    ],
    poles: [{ z: [0, 1], order: 1 }],
    critical: [{ z: [0, -1], order: 1 }],
  });

  it("returns the closest marked root within tolerance, tagged by kind", () => {
    expect(nearestRoot([0.95, 0.02], s, 0.2)?.kind).toBe("zero");
    expect(nearestRoot([0.02, 0.98], s, 0.2)?.kind).toBe("pole");
    expect(nearestRoot([0.0, -0.97], s, 0.2)?.kind).toBe("critical");
  });

  it("returns the exact Root object (so order + reference identity survive)", () => {
    const hit = nearestRoot([-1.01, 0], s, 0.2);
    expect(hit?.root.order).toBe(2);
    expect(hit?.root).toBe(s.zeros[1]);
  });

  it("returns null when nothing is within tolerance", () => {
    expect(nearestRoot([5, 5], s, 0.2)).toBeNull();
  });
});

describe("isolateRadius (C7)", () => {
  it("is a fraction of the distance to the nearest OTHER root, so it encloses just the pick", () => {
    const s = sing({
      zeros: [
        { z: [0, 0], order: 1 },
        { z: [1, 0], order: 1 },
      ],
    });
    const r = isolateRadius([0, 0], s, s.zeros[0]);
    expect(r).toBeCloseTo(0.4, 6); // 0.4 × distance 1
    expect(r).toBeLessThan(0.5); // strictly inside the gap → the neighbour stays out
  });

  it("falls back to a small default when the root stands alone", () => {
    const s = sing({ zeros: [{ z: [0, 0], order: 3 }] });
    expect(isolateRadius([0, 0], s, s.zeros[0])).toBeCloseTo(0.3, 6);
  });

  it("never returns a degenerate or absurd radius", () => {
    const s = sing({
      zeros: [
        { z: [0, 0], order: 1 },
        { z: [1e-6, 0], order: 1 },
      ],
    });
    const r = isolateRadius([0, 0], s, s.zeros[0]);
    expect(r).toBeGreaterThanOrEqual(0.02);
    expect(r).toBeLessThanOrEqual(4);
  });
});
