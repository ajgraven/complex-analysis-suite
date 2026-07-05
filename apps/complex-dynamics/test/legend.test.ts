import { describe, it, expect } from "vitest";
import { describeLegend } from "../src/render/legend";

describe("describeLegend", () => {
  it("escape-time modes are a palette gradient with a black interior named per plane", () => {
    const p = describeLegend("smooth", "Mandelbrot set");
    expect(p.visual).toBe("gradient");
    expect(p.interior).toBe("Mandelbrot set");
    expect(p.low && p.high).toBeTruthy();

    const d = describeLegend("escape", "filled Julia set");
    expect(d.visual).toBe("gradient");
    expect(d.interior).toBe("filled Julia set");
  });

  it("domain / multiplier / Newton use a hue wheel and explain it in a note", () => {
    for (const mode of ["domain", "multiplier", "newtonBasins"]) {
      const m = describeLegend(mode, "filled Julia set");
      expect(m.visual).toBe("wheel");
      expect(m.note && m.note.length).toBeGreaterThan(0);
      expect(m.interior).toBeUndefined(); // no black-interior swatch for these
    }
  });

  it("interior distance colours the interior, so it has no interior swatch and notes the exterior", () => {
    const m = describeLegend("interiorDE", "filled Julia set");
    expect(m.visual).toBe("gradient");
    expect(m.interior).toBeUndefined();
    expect(m.note).toMatch(/black/i);
  });

  it("period colouring is a gradient over the palette with an explanatory note", () => {
    const m = describeLegend("period", "filled Julia set");
    expect(m.visual).toBe("gradient");
    expect(m.note).toMatch(/period/i);
  });

  it("every mode yields a non-empty title and a valid visual", () => {
    const modes = [
      "escape", "smooth", "histogram", "distance", "distanceAnalytic", "interiorDE", "orbit",
      "stripe", "triangle", "decomposition", "period", "multiplier", "marty", "newtonBasins",
      "domain", "somethingUnknown",
    ];
    for (const mode of modes) {
      const m = describeLegend(mode, "the set");
      expect(m.title.length).toBeGreaterThan(0);
      expect(["gradient", "wheel", "note"]).toContain(m.visual);
    }
  });
});
