import { describe, expect, it } from "vitest";
import { MAP_PRESETS, EXTERIOR_MAP_PRESETS, presetIdForExpr } from "../src/presets.js";
import { compileMap } from "../src/map.js";

describe("map presets (A19)", () => {
  it("every interior preset compiles and evaluates finitely at a generic point", () => {
    for (const p of MAP_PRESETS) {
      const r = compileMap({ expr: p.expr, vars: ["z"], antiholomorphic: false });
      expect(r.ok, `${p.id} should compile`).toBe(true);
      if (!r.ok) continue;
      const [re, im] = r.map.jsFn([1.3, 0.7], [0, 0]); // off the axes / branch cuts
      expect(Number.isFinite(re) && Number.isFinite(im), `${p.id} evaluates finitely`).toBe(true);
    }
  });

  it("every exterior preset compiles and evaluates finitely on 𝔻* (|z| > 1)", () => {
    for (const p of EXTERIOR_MAP_PRESETS) {
      const r = compileMap({ expr: p.expr, vars: ["z"], antiholomorphic: false });
      expect(r.ok, `${p.id} should compile`).toBe(true);
      if (!r.ok) continue;
      const [re, im] = r.map.jsFn([1.3, 0.7], [0, 0]); // a point in the exterior disk (|z| ≈ 1.48)
      expect(Number.isFinite(re) && Number.isFinite(im), `${p.id} evaluates finitely`).toBe(true);
    }
  });

  it("presetIdForExpr matches whitespace-insensitively against the chosen gallery", () => {
    // Defaults to the interior gallery.
    expect(presetIdForExpr("z + z*z/2")).toBe("cardioid");
    expect(presetIdForExpr("z+z*z/2")).toBe("cardioid");
    expect(presetIdForExpr("z + z*z*z/3")).toBe("nephroid");
    expect(presetIdForExpr("z + 42")).toBeNull();
    // z + 1/z blows up on the interior disk — it was dropped from the interior gallery (it lives, halved,
    // only in the exterior one, where it is a genuine conformal map of 𝔻*).
    expect(presetIdForExpr("z + 1/z")).toBeNull();
    expect(presetIdForExpr("(z + 1/z)/2")).toBeNull();
    expect(presetIdForExpr("(z + 1/z)/2", EXTERIOR_MAP_PRESETS)).toBe("joukowski-ext");
    expect(presetIdForExpr("z + 1/(2*z*z)", EXTERIOR_MAP_PRESETS)).toBe("deltoid-ext");
  });
});
