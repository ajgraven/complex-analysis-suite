import { describe, expect, it } from "vitest";
import { parse } from "@cas/expr/parser";
import { makeComplexFn } from "@cas/expr/evaluate";
import { FUNCTION_PRESETS, presetIdForExpr } from "../src/presets.js";

// Every preset must parse and evaluate finitely — the gallery is data, and a typo would otherwise only
// surface at runtime. Sample at two generic points chosen to avoid every preset's singularities
// (z = 0, z = 1, z = ±i, cos z = 0), so all eight are finite there.

const SAMPLES: [number, number][] = [
  [0.7, 0.3],
  [1.3, -0.9],
];

describe("argument-principle presets", () => {
  for (const p of FUNCTION_PRESETS) {
    it(`${p.name} parses and evaluates finitely`, () => {
      const f = makeComplexFn(parse(p.expr));
      for (const z of SAMPLES) {
        const [re, im] = f(z, [0, 0]);
        expect(Number.isFinite(re)).toBe(true);
        expect(Number.isFinite(im)).toBe(true);
      }
    });
  }

  it("presetIdForExpr round-trips each preset's expression (whitespace-insensitive)", () => {
    for (const p of FUNCTION_PRESETS) {
      expect(presetIdForExpr(p.expr)).toBe(p.id);
      expect(presetIdForExpr(` ${p.expr} `)).toBe(p.id);
    }
    expect(presetIdForExpr("z + 42")).toBeNull();
  });
});
