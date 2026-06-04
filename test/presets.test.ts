import { describe, expect, it } from "vitest";
import { dynPresets, paramPresets, presetNames, type Preset } from "../src/presets";

function assertWellFormed(preset: Preset) {
  for (const field of ["f", "c", "n", "nplot", "escape"] as const) {
    expect(typeof preset[field]).toBe("string");
    expect(preset[field]).not.toBe("");
  }
  expect(typeof preset.zoom).toBe("number");
  expect(preset.center).toHaveLength(2);
  expect(Number.isFinite(preset.center[0])).toBe(true);
  expect(Number.isFinite(preset.center[1])).toBe(true);
}

describe("presets", () => {
  it("exposes the same names in both dictionaries", () => {
    expect(Object.keys(dynPresets).sort()).toEqual(Object.keys(paramPresets).sort());
  });

  it("presetNames matches the dictionary keys", () => {
    expect([...presetNames].sort()).toEqual(Object.keys(paramPresets).sort());
    expect(presetNames).toHaveLength(7);
  });

  it("every parameter preset is well-formed", () => {
    for (const name of presetNames) assertWellFormed(paramPresets[name]);
  });

  it("every dynamical preset is well-formed and has an orbit start z0", () => {
    for (const name of presetNames) {
      assertWellFormed(dynPresets[name]);
      expect(dynPresets[name].z0).toBeDefined();
    }
  });
});
