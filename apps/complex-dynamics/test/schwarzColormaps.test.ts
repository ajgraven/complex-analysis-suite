import { describe, it, expect } from "vitest";
import {
  SCHWARZ_COLORMAPS,
  SCHWARZ_COLORMAP_NAMES,
  DEFAULT_SCHWARZ_COLORMAP,
  schwarzColormap,
  SCHWARZ_SCALE_MODES,
  DEFAULT_SCHWARZ_SCALE,
  schwarzScaleId,
} from "../src/render/schwarzColormaps";

// The σ pane colors its escape-time field through a @cas/gpu colormap ramp built from these tables
// (render/schwarzGL.ts), and the picker in main.ts is populated from SCHWARZ_COLORMAP_NAMES /
// SCHWARZ_SCALE_MODES. These guard the DATA (valid ramps, a working fallback, ids kept in sync with
// the shader's computeT) — the pixels themselves are proven on the GPU in schwarzGL.browser.test.ts.
describe("SCHWARZ_COLORMAPS", () => {
  it("every palette is a non-empty list of integer RGB triples in 0..255", () => {
    for (const [name, table] of Object.entries(SCHWARZ_COLORMAPS)) {
      expect(table.length, `${name} has colours`).toBeGreaterThan(1);
      for (const rgb of table) {
        expect(rgb.length, `${name} triple length`).toBe(3);
        for (const ch of rgb) {
          expect(Number.isInteger(ch), `${name} channel is integer`).toBe(true);
          expect(ch).toBeGreaterThanOrEqual(0);
          expect(ch).toBeLessThanOrEqual(255);
        }
      }
    }
  });

  it("every name in the picker order resolves to a real palette", () => {
    for (const name of SCHWARZ_COLORMAP_NAMES) {
      expect(SCHWARZ_COLORMAPS[name], `${name} exists`).toBeDefined();
    }
  });

  it("the default is the first name in the picker order and exists", () => {
    expect(SCHWARZ_COLORMAP_NAMES[0]).toBe(DEFAULT_SCHWARZ_COLORMAP);
    expect(SCHWARZ_COLORMAPS[DEFAULT_SCHWARZ_COLORMAP]).toBeDefined();
  });

  it("grayscale runs black → white so a legend/eyeball can spot it as the achromatic ramp", () => {
    const g = SCHWARZ_COLORMAPS.grayscale;
    expect(g[0]).toEqual([0, 0, 0]);
    expect(g[g.length - 1]).toEqual([255, 255, 255]);
    for (const [r, gr, b] of g) {
      expect(r).toBe(gr); // achromatic: r == g == b at every stop
      expect(gr).toBe(b);
    }
  });

  it("viridis (the default) is chromatic — not every stop is gray", () => {
    const hasChroma = SCHWARZ_COLORMAPS.viridis.some(([r, g, b]) => r !== g || g !== b);
    expect(hasChroma).toBe(true);
  });
});

describe("schwarzColormap", () => {
  it("returns the requested palette by name", () => {
    expect(schwarzColormap("magma")).toBe(SCHWARZ_COLORMAPS.magma);
  });

  it("falls back to the default for an unknown name instead of throwing (a bad saved name never breaks a render)", () => {
    expect(schwarzColormap("does-not-exist")).toBe(SCHWARZ_COLORMAPS[DEFAULT_SCHWARZ_COLORMAP]);
    expect(schwarzColormap("")).toBe(SCHWARZ_COLORMAPS[DEFAULT_SCHWARZ_COLORMAP]);
  });
});

describe("SCHWARZ_SCALE_MODES", () => {
  it("ids are the contiguous 0..N-1 the shader's computeT switches on", () => {
    expect(SCHWARZ_SCALE_MODES.map((m) => m.id)).toEqual(
      SCHWARZ_SCALE_MODES.map((_, i) => i),
    );
  });

  it("carries the five documented modes with stable keys", () => {
    expect(SCHWARZ_SCALE_MODES.map((m) => m.key)).toEqual([
      "linear",
      "log",
      "sqrt",
      "discrete",
      "cyclic",
    ]);
  });

  it("the default scale exists and is linear (id 0)", () => {
    expect(schwarzScaleId(DEFAULT_SCHWARZ_SCALE)).toBe(0);
    expect(SCHWARZ_SCALE_MODES.find((m) => m.key === DEFAULT_SCHWARZ_SCALE)?.id).toBe(0);
  });
});

describe("schwarzScaleId", () => {
  it("maps each key to its id", () => {
    for (const m of SCHWARZ_SCALE_MODES) expect(schwarzScaleId(m.key)).toBe(m.id);
  });

  it("falls back to linear (0) for an unknown key", () => {
    expect(schwarzScaleId("nope")).toBe(0);
    expect(schwarzScaleId("")).toBe(0);
  });
});
