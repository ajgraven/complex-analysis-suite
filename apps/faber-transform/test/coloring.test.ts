// CPU phase-portrait coloring: hue tracks arg, the modulus→lightness transfer darkens small |f|, and
// the enhancement overlays stay within the RGB range. These mirror the shaded (non-fwidth) branches of
// the shared @cas/gpu PHASE_COLORING_GLSL, so the CPU fallback and GPU path agree in style.
import { describe, expect, it } from "vitest";
import type { Cx } from "@cas/core";
import { DEFAULT_COLORING, phaseColor } from "../src/render/coloring.js";

const flatHue = { enhance: 0, sectors: 6, crisp: false, modulus: 0, modScale: 1 } as const;

describe("phaseColor", () => {
  it("maps arg to the six primary/secondary hues at unit modulus (flat hue, constant lightness)", () => {
    const pos: Cx = { re: 1, im: 0 };
    // arg 0 → red; the GPU LUT and hueRgb both start the wheel at red.
    expect(phaseColor(pos, flatHue)).toEqual([255, 0, 0]);
    const neg: Cx = { re: -1, im: 0 }; // arg π → cyan
    expect(phaseColor(neg, flatHue)).toEqual([0, 255, 255]);
  });

  it("darkens toward zero under the linear modulus transfer", () => {
    const small = phaseColor({ re: 0.1, im: 0 }, { ...flatHue, modulus: 1, modScale: 1 });
    const big = phaseColor({ re: 1, im: 0 }, { ...flatHue, modulus: 1, modScale: 1 });
    expect(Math.max(...small)).toBeLessThan(Math.max(...big));
  });

  it("keeps every channel in [0,255] across all enhancement modes", () => {
    for (let enhance = 0; enhance <= 5; enhance++) {
      for (const v of [{ re: 0.3, im: 0.7 }, { re: -2, im: 1.1 }, { re: 0.001, im: -0.02 }] as Cx[]) {
        const [r, g, b] = phaseColor(v, { ...DEFAULT_COLORING, enhance, modulus: 3 });
        for (const c of [r, g, b]) {
          expect(Number.isInteger(c)).toBe(true);
          expect(c).toBeGreaterThanOrEqual(0);
          expect(c).toBeLessThanOrEqual(255);
        }
      }
    }
  });

  it("returns a neutral grey for a non-finite value", () => {
    expect(phaseColor({ re: Infinity, im: 0 })).toEqual([77, 77, 84]);
  });
});
