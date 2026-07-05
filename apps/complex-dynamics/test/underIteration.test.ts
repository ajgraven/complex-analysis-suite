import { describe, expect, it } from "vitest";
import { parse } from "../src/expr/parser";
import { detectUnderIteration, type UnderIterationInput } from "../src/render/underIteration";

const fAst = parse("z^2+c");
const escAst = parse("abs(z)>2");

/** z²+c parameter-plane probe: orbit of the critical point 0, c = the pixel. */
function param(center: [number, number], zoom: number, iterations: number): UnderIterationInput {
  return {
    fAst,
    escAst,
    plane: "param",
    c: [0, 0],
    orbitStart: [0, 0],
    a: [0, 0],
    center,
    zoom,
    iterations,
  };
}

describe("detectUnderIteration — parameter plane (z²+c)", () => {
  it("does NOT flag the default full view at n=100 (no false alarm)", () => {
    const r = detectUnderIteration(param([-0.5, 0], 0.5, 100));
    expect(r.underIterated).toBe(false);
    expect(r.recoveredFraction).toBeLessThan(0.02);
  });

  it("flags a deep boundary zoom with a low iteration cap, and suggests a higher cap", () => {
    // Seahorse valley at 2000×: at n=30 most of the boundary halo only escapes much later.
    const r = detectUnderIteration(param([-0.745, 0.113], 2000, 30));
    expect(r.underIterated).toBe(true);
    expect(r.recoveredFraction).toBeGreaterThan(0.4);
    expect(r.suggestedIterations).toBeGreaterThan(30);
  });

  it("does NOT flag the same deep view once the cap is high enough", () => {
    const r = detectUnderIteration(param([-0.745, 0.113], 2000, 1500));
    expect(r.underIterated).toBe(false);
  });

  it("excludes genuinely-interior views (deep inside the set → not flagged, interiorFraction ≈ 1)", () => {
    const r = detectUnderIteration(param([-0.5, 0], 5, 100));
    expect(r.underIterated).toBe(false);
    expect(r.recoveredFraction).toBe(0); // every cell stays bounded — nothing is 'recovered'
    expect(r.interiorFraction).toBeGreaterThan(0.95); // the whole window sits inside the set
  });

  it("does NOT flag a far-exterior view (everything escapes immediately, interiorFraction ≈ 0)", () => {
    const r = detectUnderIteration(param([3, 3], 1, 100));
    expect(r.underIterated).toBe(false);
    expect(r.interiorFraction).toBe(0);
  });

  it("returns a clear verdict when the cap already exceeds the probe ceiling", () => {
    // n ≥ PROBE_CEIL/2 ⇒ probeIter ≤ n ⇒ nothing to probe ⇒ not flagged, never throws.
    const r = detectUnderIteration(param([-0.745, 0.113], 2000, 5000));
    expect(r.underIterated).toBe(false);
  });
});

describe("detectUnderIteration — dynamical plane", () => {
  /** Julia set of c = −0.745 + 0.113i; orbit of the pixel z₀, c fixed. */
  function dyn(center: [number, number], zoom: number, iterations: number): UnderIterationInput {
    return {
      fAst,
      escAst,
      plane: "dyn",
      c: [-0.745, 0.113],
      orbitStart: [0, 0],
      a: [0, 0],
      center,
      zoom,
      iterations,
    };
  }

  it("flags a deep Julia-boundary zoom at a low cap", () => {
    const r = detectUnderIteration(dyn([0, 0], 200, 30));
    expect(r.underIterated).toBe(true);
    expect(r.recoveredFraction).toBeGreaterThan(0.3);
  });

  it("does NOT flag the same view at a sufficient cap", () => {
    const r = detectUnderIteration(dyn([0, 0], 200, 1500));
    expect(r.underIterated).toBe(false);
  });
});
