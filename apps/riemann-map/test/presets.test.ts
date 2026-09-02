import { describe, expect, it } from "vitest";
import { EXTERIOR_MAP_PRESETS as FLOW_EXTERIOR_MAP_PRESETS } from "@cas/flow";
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

  it("the shared exterior presets' expr and psi closure agree (no drift across the @cas/flow extraction)", () => {
    // The shared @cas/flow presets carry BOTH forms: the `expr` this studio compiles to draw ψ(𝔻*), and the
    // `psi` closure the 2D Hydrodynamics app evaluates to transplant a flow. Compiling one and comparing to
    // the other at several exterior points pins them together — an edit to either alone fails here.
    const pts: readonly [number, number][] = [[1.3, 0.7], [2, 0], [0, 1.5], [-1.2, 0.9]];
    for (const p of FLOW_EXTERIOR_MAP_PRESETS) {
      const r = compileMap({ expr: p.expr, vars: ["z"], antiholomorphic: false });
      expect(r.ok, `${p.id} should compile`).toBe(true);
      if (!r.ok) continue;
      for (const [x, y] of pts) {
        const [ere, eim] = r.map.jsFn([x, y], [0, 0]);
        const [pre, pim] = p.psi([x, y]);
        expect(ere, `${p.id} re at (${x},${y})`).toBeCloseTo(pre, 12);
        expect(eim, `${p.id} im at (${x},${y})`).toBeCloseTo(pim, 12);
      }
    }
  });

  it("presetIdForExpr matches whitespace-insensitively against the chosen gallery", () => {
    // Defaults to the interior gallery.
    expect(presetIdForExpr("z + z^2/2")).toBe("cardioid");
    expect(presetIdForExpr("z+z^2/2")).toBe("cardioid");
    expect(presetIdForExpr("z + z^3/3")).toBe("nephroid");
    expect(presetIdForExpr("z + 42")).toBeNull();
    // z + 1/z blows up on the interior disk — it was dropped from the interior gallery (it lives, halved,
    // only in the exterior one, where it is a genuine conformal map of 𝔻*).
    expect(presetIdForExpr("z + 1/z")).toBeNull();
    expect(presetIdForExpr("(z + 1/z)/2")).toBeNull();
    expect(presetIdForExpr("(z + 1/z)/2", EXTERIOR_MAP_PRESETS)).toBe("joukowski-ext");
    expect(presetIdForExpr("z + 1/(2*z^2)", EXTERIOR_MAP_PRESETS)).toBe("deltoid-ext");
  });
});
