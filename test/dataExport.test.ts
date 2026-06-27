import { describe, it, expect } from "vitest";
import { coeffsToCsv, coeffsToText, inspectToText, orbitToCsv } from "../src/ui/dataExport";
import type { InspectResult } from "../src/render/inspect";

describe("orbitToCsv", () => {
  it("emits an n,re,im header and one row per iterate (full precision)", () => {
    const csv = orbitToCsv([
      [0, 0],
      [-1, 0],
      [0.5, -0.25],
    ]);
    expect(csv.split("\n")).toEqual(["n,re,im", "0,0,0", "1,-1,0", "2,0.5,-0.25"]);
  });

  it("preserves full precision (no rounding)", () => {
    const csv = orbitToCsv([[-0.743643887037151, 0.131825904205312]]);
    expect(csv).toContain("0,-0.743643887037151,0.131825904205312");
  });
});

describe("inspectToText", () => {
  const periodic: InspectResult = {
    fate: "periodic",
    period: 2,
    escapeIter: 0,
    multiplier: [0.0001, 0],
    multiplierMag: 0.0001,
    rotation: { p: 1, q: 2 },
    distance: null,
    cyclePoints: [
      [0, 0],
      [-1, 0],
    ],
  };

  it("reports the parameter, fate, period, multiplier, and internal angle", () => {
    const txt = inspectToText(periodic, [-1, 0], "param");
    expect(txt).toContain("Parameter c = ");
    expect(txt).toContain("Fate: attracting cycle");
    expect(txt).toContain("Period: 2");
    expect(txt).toContain("Internal angle: 1/2");
    expect(txt).toMatch(/Multiplier: \|lambda\| =/);
  });

  it("labels the dynamical plane and keeps full precision of the point", () => {
    const escaped: InspectResult = {
      fate: "escaped",
      period: 0,
      escapeIter: 7,
      multiplier: null,
      multiplierMag: null,
      rotation: null,
      distance: 1.5e-5,
      cyclePoints: null,
    };
    const txt = inspectToText(escaped, [-0.123456789012345, 2], "dyn");
    expect(txt).toContain("Orbit of z0 = -0.123456789012345");
    expect(txt).toContain("Escape time: 7 iterations");
    expect(txt).toContain("Distance to set: 0.000015");
  });
});

describe("coeffsToCsv", () => {
  it("emits a k,re,im header and one row per coefficient (full precision)", () => {
    const csv = coeffsToCsv([
      [-0.5, 0],
      [0, 0.125],
    ]);
    expect(csv.split("\n")).toEqual(["k,re,im", "0,-0.5,0", "1,0,0.125"]);
  });
});

describe("coeffsToText", () => {
  it("titles the block and lists b_k = re + i*im", () => {
    const txt = coeffsToText(
      [
        [-0.5, 0],
        [0.125, 0],
      ],
      "Mandelbrot exterior map",
    );
    expect(txt).toContain("Mandelbrot exterior map");
    expect(txt).toContain("b_0 = -0.5+i*0");
    expect(txt).toContain("b_1 = 0.125+i*0");
  });
});
