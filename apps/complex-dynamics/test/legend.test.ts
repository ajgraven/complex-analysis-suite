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

// ── WP1 / R3 (review 2026-09-16): the legend must describe what the shader DRAWS ──────────────
// Four notes were checked against `shaderBuilder.ts` and three of them described the opposite of
// the picture. These assertions are keyed to the shader expression in each case, so a future change
// to the shader that is not mirrored here goes red.
describe("the legend agrees with the shader", () => {
  it("multiplier: bright at the superattracting centre, not dark (val = sqrt(1 - |λ|))", () => {
    const m = describeLegend("multiplier", "filled Julia set");
    const note = m.note ?? "";
    expect(note).toMatch(/bright/i);
    // The shipped wording was "brightness = |λ| (dark = superattracting)" — exactly backwards.
    expect(note).not.toMatch(/dark\s*=\s*superattracting/i);
  });

  it("orbit trap: hugging the trap is the HIGH end (palette(1 - √trap·1.3))", () => {
    const t = describeLegend("orbit", "filled Julia set");
    expect(t.high).toMatch(/hugs the trap/i);
    expect(t.low).toMatch(/stays away/i);
  });

  it("period: claims no ordering, because palette(fract(period·0.618)) has none", () => {
    const p = describeLegend("period", "filled Julia set");
    // A low/high pair on a gradient reads as an ordered scale; this mode's hue is a hash.
    expect(p.low).toBeUndefined();
    expect(p.high).toBeUndefined();
    expect(p.note ?? "").toMatch(/not an ordered scale/i);
  });

  it("distance: keeps its (correct) ramp ends and now says the boundary is darkened", () => {
    // Unlike the three above, this one was not inverted — `palette(s / uN)` really does run from
    // fast escape to the boundary. What it never mentioned is the `* de` / `* edge` factor that
    // darkens the boundary, which is the whole point of the mode.
    for (const mode of ["distance", "distanceAnalytic"]) {
      const d = describeLegend(mode, "filled Julia set");
      expect(d.low).toBe("far");
      expect(d.high).toBe("close to the edge");
      expect(d.note ?? "").toMatch(/darkened/i);
    }
  });
});
