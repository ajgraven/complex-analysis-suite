import { describe, expect, it } from "vitest";
import { makeUnboundedLaurentSchwarz } from "@cas/schwarz";
import { pixelToPlot, renderSchwarzField, schwarzBoundaryPoly, schwarzEscapeAt } from "../src/render/schwarzView";

// The deltoid σ engine — ground truth φ(z) = z + 1/(2z²) (c = 1, F = [0,0,½]); Ω is the exterior of K.
const engine = makeUnboundedLaurentSchwarz(1, [
  [0, 0],
  [0, 0],
  [0.5, 0],
]);
const poly = schwarzBoundaryPoly(engine);

describe("Schwarz σ CPU render (S4a-2)", () => {
  it("classifies the origin (∈ K, not in Ω) as fundamental n=0 and a far point as escaped", () => {
    const atOrigin = schwarzEscapeAt(engine, poly, [0, 0]);
    expect(atOrigin.kind).toBe("fundamental");
    expect(atOrigin.n).toBe(0);
    expect(schwarzEscapeAt(engine, poly, [100, 0], { escapeR: 50 }).kind).toBe("escaped");
  });

  it("pixelToPlot matches the view window (center at mid-pixel, half-width 1/zoom)", () => {
    const view = { center: [0, 0] as [number, number], zoom: 0.4 }; // [-2.5, 2.5]²
    const mid = pixelToPlot(50, 50, 100, view);
    expect(mid[0]).toBeCloseTo(0, 1);
    expect(mid[1]).toBeCloseTo(0, 1);
    expect(pixelToPlot(0, 50, 100, view)[0]).toBeCloseTo(-2.5, 1); // left edge
    expect(pixelToPlot(99, 50, 100, view)[0]).toBeCloseTo(2.5, 1); // right edge
  });

  it("renderSchwarzField fills an opaque RGBA buffer with dynamical structure", () => {
    const view = { center: [0, 0] as [number, number], zoom: 0.4 };
    const size = 24;
    const buf = renderSchwarzField(engine, poly, view, size, { maxIter: 48, escapeR: 1e4 });
    expect(buf.length).toBe(size * size * 4);
    for (let i = 3; i < buf.length; i += 4) expect(buf[i]).toBe(255); // fully opaque
    const colors = new Set<string>();
    for (let i = 0; i < buf.length; i += 4) colors.add(`${buf[i]},${buf[i + 1]},${buf[i + 2]}`);
    expect(colors.size).toBeGreaterThan(1); // K vs Ω regions ⇒ not a flat fill
    expect(colors.has("30,60,140")).toBe(true); // the K interior (fundamental n=0) deep-blue base
  });
});
