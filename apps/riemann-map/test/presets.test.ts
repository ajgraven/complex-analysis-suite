import { describe, expect, it } from "vitest";
import { MAP_PRESETS, presetIdForExpr } from "../src/presets.js";
import { compileMap } from "../src/map.js";

describe("map presets (A19)", () => {
  it("every preset compiles and evaluates finitely at a generic point", () => {
    for (const p of MAP_PRESETS) {
      const r = compileMap({ expr: p.expr, vars: ["z"], antiholomorphic: false });
      expect(r.ok, `${p.id} should compile`).toBe(true);
      if (!r.ok) continue;
      const [re, im] = r.map.jsFn([1.3, 0.7], [0, 0]); // off the axes / branch cuts
      expect(Number.isFinite(re) && Number.isFinite(im), `${p.id} evaluates finitely`).toBe(true);
    }
  });

  it("presetIdForExpr matches whitespace-insensitively and returns null for unknown maps", () => {
    expect(presetIdForExpr("z + 1/z")).toBe("joukowski");
    expect(presetIdForExpr("z+1/z")).toBe("joukowski");
    expect(presetIdForExpr("z + 42")).toBeNull();
  });
});
