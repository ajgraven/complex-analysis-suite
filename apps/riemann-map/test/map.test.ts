import { describe, expect, it } from "vitest";
import { compileMap } from "../src/map.js";
import type { MapState } from "../src/viewState.js";

const mk = (expr: string): MapState => ({ expr, vars: ["z"], antiholomorphic: false });

describe("compileMap (A1/S3)", () => {
  it("compiles a valid map to a JS evaluator + GLSL body + latex", () => {
    const r = compileMap(mk("z + 1/z")); // Joukowski
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [re, im] = r.map.jsFn([2, 0], [0, 0]); // 2 + 1/2
    expect(re).toBeCloseTo(2.5, 12);
    expect(im).toBeCloseTo(0, 12);
    expect(r.map.glslBody).toMatch(/\bfFn\b/);
    expect(r.map.latex.length).toBeGreaterThan(0);
  });

  it("returns an honest error for a malformed expression (never throws)", () => {
    const r = compileMap(mk("(z + 1")); // unclosed parenthesis
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.length).toBeGreaterThan(0);
  });
});
