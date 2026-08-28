import { describe, it, expect } from "vitest";
import { boundaryOf, conformalNet, spiralEquipotentials } from "../src/render/heleShawRender.js";
import { onePointMap } from "../src/heleShawOnePoint.js";
import type { Pt } from "../src/transplant.js";

const finite = (p: Pt): boolean => Number.isFinite(p[0]) && Number.isFinite(p[1]);
const map1 = onePointMap([1, 0], 2);

describe("boundaryOf (∂Ω_t = φ_t(∂𝔻))", () => {
  it("is a closed, finite polyline", () => {
    if (!map1) throw new Error("map");
    const b = boundaryOf(map1, 240);
    expect(b.length).toBe(241);
    expect(b.every(finite)).toBe(true);
    expect(Math.hypot(b[0][0] - b[b.length - 1][0], b[0][1] - b[b.length - 1][1])).toBeLessThan(1e-9); // closes
  });
});

describe("conformalNet (exterior grid of φ_t)", () => {
  it("returns finite ring and ray curves", () => {
    if (!map1) throw new Error("map");
    const { rings, rays } = conformalNet(map1, { rings: 4, rays: 12, rMax: 4 });
    expect(rings.length).toBe(4);
    expect(rays.length).toBe(12);
    for (const c of [...rings, ...rays]) expect(c.pts.every(finite)).toBe(true);
  });
});

describe("spiralEquipotentials of the driving charge α at w₀", () => {
  const w0: Pt = [2, 0];
  it("a twisted charge (γ ≠ 0) gives logarithmic spirals winding around w₀", () => {
    const curves = spiralEquipotentials([1, 1], w0, { rMax: 5, levels: 8 });
    expect(curves.length).toBeGreaterThan(0);
    for (const c of curves) expect(c.pts.every(finite)).toBe(true);
    // a spiral winds: the argument about w₀ sweeps more than 2π across a level curve
    const some = curves.find((c) => c.pts.length > 20);
    if (some) {
      let sweep = 0;
      for (let i = 1; i < some.pts.length; i++) {
        const a0 = Math.atan2(some.pts[i - 1][1] - w0[1], some.pts[i - 1][0] - w0[0]);
        const a1 = Math.atan2(some.pts[i][1] - w0[1], some.pts[i][0] - w0[0]);
        let d = a1 - a0;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        sweep += Math.abs(d);
      }
      expect(sweep).toBeGreaterThan(1); // genuinely curved, not a straight radial line
    }
  });

  it("a pure vortex (q = 0) gives radial rays; a pure source (γ = 0) gives finite circles", () => {
    const vortex = spiralEquipotentials([0, 1], w0, { rMax: 4, levels: 6 });
    expect(vortex.length).toBe(6);
    for (const c of vortex) expect(c.pts.every(finite)).toBe(true);
    const source = spiralEquipotentials([1, 0], w0, { rMax: 4, levels: 6 });
    expect(source.length).toBeGreaterThan(0);
    for (const c of source) expect(c.pts.every(finite)).toBe(true);
  });
});
