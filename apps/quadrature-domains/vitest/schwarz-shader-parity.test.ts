// @vitest-environment jsdom
//
// QD Schwarz shader — GPU-side contract guard (Review P4 / QD-schwarz-a-A-06: the QD Schwarz GLSL had
// ZERO automated protection — the repo's only shader test lived in apps/correspondences). This is the
// NODE-runnable half: it pins the shader's public, drift-prone contract (colormap stop lists, the family
// dispatch, the scale-mode id map) from the actual shader source + helpers, so a structural drift (a
// renumbered family, a dropped scale-mode branch, a mismatched palette) fails in CI without a GPU. The
// float32 NUMERIC half is the browser dual-backend harness (packages/gpu, `pnpm test:browser`). Together
// they close the "GLSL mirrors drift undetected" gap the review flagged.
import { describe, it, expect, beforeAll } from "vitest";

let glHelpers: {
  pickColormap: (name: string) => number[][];
  SCALE_MODE_ID: Record<string, number>;
};
let frag: string;

beforeAll(async () => {
  const QD: { Schwarz: { _glHelpers: typeof glHelpers; _shaders: { frag: string } } } = (
    await import("../app/solver.mjs")
  ).default as never;
  await import("../app/schwarz/schwarz-webgl.mjs"); // registers Schwarz._glHelpers + Schwarz._shaders
  glHelpers = QD.Schwarz._glHelpers;
  frag = QD.Schwarz._shaders.frag;
});

const NAMES = [
  "magma", "inferno", "plasma", "viridis", "cividis",
  "turbo", "grayscale", "rainbow", "iceandfire", "twotone", "cyclic",
];

describe("QD Schwarz shader GPU-side contract (node guard) — Review P4", () => {
  it("pickColormap returns a valid RGB stop list (int 0..255 triples) for every named colormap", () => {
    for (const n of NAMES) {
      const stops = glHelpers.pickColormap(n);
      expect(Array.isArray(stops) && stops.length >= 2, n).toBe(true);
      for (const s of stops) {
        expect(s.length).toBe(3);
        for (const ch of s) expect(Number.isInteger(ch) && ch >= 0 && ch <= 255).toBe(true);
      }
    }
  });

  it("an unknown colormap name falls back to magma (never returns empty/garbage)", () => {
    expect(glHelpers.pickColormap("does-not-exist")).toEqual(glHelpers.pickColormap("magma"));
  });

  it("cyclic is the magma forward→reverse→forward ramp (the GPU contract the CPU painter must match)", () => {
    const magma = glHelpers.pickColormap("magma");
    expect(glHelpers.pickColormap("cyclic")).toEqual(magma.concat(magma.slice().reverse(), magma));
  });

  it("the fragment shader dispatches all six inverse families on u_family (0..5)", () => {
    for (let f = 0; f <= 5; f++) expect(frag, `u_family == ${f}`).toContain(`u_family == ${f}`);
  });

  it("SCALE_MODE_ID maps the five modes to 0..4; the shader branches on every non-default (smooth) mode", () => {
    const ids = glHelpers.SCALE_MODE_ID;
    expect(new Set(Object.values(ids))).toEqual(new Set([0, 1, 2, 3, 4]));
    for (const [name, n] of Object.entries(ids)) {
      // smooth (0) is the fallthrough default; discrete/log/sqrt/modulo have explicit branches.
      if (name !== "smooth") expect(frag, `u_scaleMode == ${n} (${name})`).toContain(`u_scaleMode == ${n}`);
    }
  });
});
