/**
 * The zoom magnification is shown in scientific notation. `formatZoom` rounds to `sig` significant
 * figures, trims trailing zeros, and must round-trip through `Number.parseFloat` (the getter + the
 * validator both parse the field back to a number), so displaying it never corrupts the value.
 */
import { describe, it, expect } from "vitest";
import { formatZoom } from "../src/ui/controls";

describe("formatZoom", () => {
  it("renders round magnitudes as clean scientific notation", () => {
    expect(formatZoom(500000)).toBe("5e+5");
    expect(formatZoom(1)).toBe("1e+0");
    expect(formatZoom(0.6)).toBe("6e-1");
    expect(formatZoom(1e21)).toBe("1e+21");
    expect(formatZoom(1e-7)).toBe("1e-7");
  });

  it("keeps significant figures (default 6) and trims trailing zeros", () => {
    expect(formatZoom(16.366537)).toBe("1.63665e+1");
    expect(formatZoom(1.23456789e15)).toBe("1.23457e+15");
    expect(formatZoom(1.5)).toBe("1.5e+0");
  });

  it("honours a custom significant-figure count (the compact view-chip uses 3)", () => {
    expect(formatZoom(16.366537, 3)).toBe("1.64e+1");
    expect(formatZoom(1234567, 3)).toBe("1.23e+6");
  });

  it("round-trips through parseFloat within its significant figures (serialization-safe)", () => {
    for (const z of [0.32, 1.1, 500000, 1.23457e15, 9.87654e-3, 2]) {
      expect(Math.abs(Number.parseFloat(formatZoom(z)) - z) / z).toBeLessThan(1e-5);
    }
  });

  it("passes non-finite values through unchanged rather than throwing", () => {
    expect(formatZoom(Number.POSITIVE_INFINITY)).toBe("Infinity");
    expect(formatZoom(Number.NaN)).toBe("NaN");
  });
});
