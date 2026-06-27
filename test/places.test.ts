import { describe, it, expect } from "vitest";
import { PLACES } from "../src/state/places";
import { SHARE_IDS } from "../src/state/appState";

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

  it("every place state key is a serialized control (in SHARE_IDS)", () => {
    // A key not in SHARE_IDS would be silently dropped by applyAppState on selection.
    const allowed = new Set<string>(SHARE_IDS);
    for (const place of PLACES) {
      for (const key of Object.keys(place.state)) {
        expect(allowed.has(key)).toBe(true);
      }
    }
  });
});
