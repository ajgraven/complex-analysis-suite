/**
 * The pure Tier-2 image-metrics core (`computeJuliaImageMetrics`) that the Julia-metrics Web Worker
 * and its synchronous fallback both call. Pins the monic vs general-f contract (which display rows
 * each path returns) and the empty-interior / rigorous-connectivity branches.
 */
import { describe, it, expect } from "vitest";
import type { Complex } from "../src/complex";
import { parse } from "@cas/expr/parser";
import { computeJuliaImageMetrics } from "../src/render/juliaProperties";

const f = parse("z^2 + c");
const esc = parse("abs(z) > 2");
const O: Complex = [0, 0];
const base = { fAst: f, escAst: esc, a: O, centerX: 0, centerY: 0, zoom: 0.5, size: 128 };

describe("computeJuliaImageMetrics", () => {
  it("monic z²+c at c=0: pixel area ≈ π (unit disk); omits the general-f rows", () => {
    const m = computeJuliaImageMetrics({
      ...base,
      c: [0, 0],
      boundingRadius: 1, // the c=0 filled Julia set is the closed unit disk
      escapes: false,
      rigorousConnectivity: false,
    });
    expect(m.pixelArea).not.toBeNull();
    expect(m.pixelArea as number).toBeGreaterThan(2.9);
    expect(m.pixelArea as number).toBeLessThan(3.4); // ≈ π
    expect(m.boxDim).not.toBeNull();
    // Monic keeps its analytic extent/symmetry/connectivity rows → those keys are absent.
    expect("extent" in m).toBe(false);
    expect("symmetry" in m).toBe(false);
    expect("connectivity" in m).toBe(false);
  });

  it("escaping c (empty interior): area 0, null extent, Cantor-dust connectivity", () => {
    const m = computeJuliaImageMetrics({
      ...base,
      c: [2, 2], // far outside M ⇒ Cantor-dust Julia set
      boundingRadius: null,
      escapes: true,
      rigorousConnectivity: false,
    });
    expect(m.pixelArea).toBe(0);
    expect(m.extent).toBeNull();
    expect(m.symmetry).toBe("none detected");
    expect(m.connectivity).toContain("Cantor dust");
  });

  it("rigorous Tier-1 connectivity ⇒ the image connectivity row is omitted", () => {
    const m = computeJuliaImageMetrics({
      ...base,
      c: [2, 2],
      boundingRadius: null,
      escapes: true,
      rigorousConnectivity: true,
    });
    expect("connectivity" in m).toBe(false);
  });
});
