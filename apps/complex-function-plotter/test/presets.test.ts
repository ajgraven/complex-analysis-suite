import { describe, expect, it } from "vitest";
import { parse } from "@cas/expr/parser";
import { compileF } from "@cas/expr/glsl";
import { makeComplexFn } from "@cas/expr/evaluate";
import { PRESETS } from "../src/presets.js";

describe("preset gallery", () => {
  it("every preset parses, compiles to GLSL, and evaluates finitely", () => {
    for (const p of PRESETS) {
      const ast = parse(p.expr);
      expect(compileF(ast)).toContain("fFn");
      const w = makeComplexFn(ast)([0.7, 0.3], [0, 0]);
      expect(Number.isFinite(w[0])).toBe(true);
      expect(Number.isFinite(w[1])).toBe(true);
      expect(p.span).toBeGreaterThan(0);
    }
  });

  it("has unique labels", () => {
    const labels = PRESETS.map((p) => p.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
