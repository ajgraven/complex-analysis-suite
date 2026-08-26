import { describe, it, expect } from "vitest";
import { PRESETS, presetById } from "../src/presets.js";

describe("presets", () => {
  it("has unique ids and resolves by id", () => {
    const ids = PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(presetById("cylinder")?.name).toContain("Cylinder");
    expect(presetById("nope")).toBeUndefined();
  });

  it("the cylinder is a unit stream + a doublet μ = U·a² (so |z|=1 is a streamline)", () => {
    const cyl = presetById("cylinder");
    expect(cyl).toBeDefined();
    if (!cyl) return;
    expect(Math.hypot(cyl.uniform[0], cyl.uniform[1])).toBeCloseTo(1, 12);
    expect(cyl.sings).toHaveLength(1);
    const d = cyl.sings[0];
    expect(d.kind).toBe("doublet");
    if (d.kind === "doublet") expect(d.mu).toEqual([1, 0]);
  });

  it("the empty-field preset clears everything", () => {
    const empty = presetById("clear");
    expect(empty?.sings).toHaveLength(0);
    expect(empty?.uniform).toEqual([0, 0]);
  });
});
