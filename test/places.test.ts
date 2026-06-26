import { describe, it, expect } from "vitest";
import { PLACES } from "../src/state/places";

describe("places", () => {
  it("each place flies to a parseable z²+c location", () => {
    expect(PLACES.length).toBeGreaterThan(3);
    for (const p of PLACES) {
      expect(p.state.inpf).toBe("z^2+c");
      const parts = String(p.state.inpparamcenter).split(",").map(Number);
      expect(parts).toHaveLength(2);
      expect(parts.every(Number.isFinite)).toBe(true);
      expect(Number(p.state.inpparamzoom)).toBeGreaterThan(0);
      expect(Number(p.state.inpmn)).toBeGreaterThan(0);
    }
  });

  it("has unique names", () => {
    const names = PLACES.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
