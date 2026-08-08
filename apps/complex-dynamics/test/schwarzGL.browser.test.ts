import { describe, expect, it } from "vitest";
import { makeUnboundedLaurentSchwarz, type Complex } from "@cas/schwarz";
import { schwarzBoundaryPoly } from "../src/render/schwarzView";
import { createSchwarzGLRenderer } from "../src/render/schwarzGL";

// BROWSER-MODE end-to-end test for the GPU σ render (S4b-ii). The node/jsdom gate can't run WebGL2, so
// this joins CD's existing `pnpm test:browser` project (real headless-Chromium WebGL2, SwiftShader).
//
// I1 already proved GPU σ(w) = CPU σ(w) to float32 ε (@cas/schwarz browser harness). This proves the
// RENDER SHELL around it — CD's view→w mapping, the Ω mask, the escape loop, and the palette (all mirrored
// from schwarzView.ts) — assembles into a working image: the shader compiles, a frame renders, it's
// opaque, it has K-vs-Ω structure, and the K interior comes out the CPU path's deep-blue base color.

/** drawImage the renderer's offscreen GL canvas onto a 2D canvas and read the pixels back — the exact
 *  path renderSchwarzView uses to blit onto #JCSSchwarz. */
function readPixels(glCanvas: HTMLCanvasElement, size: number): Uint8ClampedArray {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("no 2D context for readback");
  ctx.drawImage(glCanvas, 0, 0);
  return ctx.getImageData(0, 0, size, size).data;
}

function distinctColors(d: Uint8ClampedArray): Set<string> {
  const s = new Set<string>();
  for (let i = 0; i < d.length; i += 4) s.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
  return s;
}

const DELTOID: { c: number; F: Complex[] } = { c: 1, F: [[0, 0], [0, 0], [0.5, 0]] };
const VIEW = { center: [0, 0] as [number, number], zoom: 0.4 };
const OPTS = { maxIter: 48, escapeR: 1e4 };

describe("CD σ GPU render (S4b-ii) — full pipeline in real WebGL2", () => {
  it("createSchwarzGLRenderer builds — the composed σ shader compiles + links", () => {
    const r = createSchwarzGLRenderer();
    expect(r, "WebGL2 present but the σ shader failed to build (null renderer)").not.toBeNull();
    r?.destroy();
  });

  it("renders the deltoid σ field: opaque, structured (K vs Ω), K interior in the deep-blue base color", () => {
    const r = createSchwarzGLRenderer();
    expect(r).not.toBeNull();
    if (!r) return;
    const engine = makeUnboundedLaurentSchwarz(DELTOID.c, DELTOID.F);
    r.setPhi(DELTOID, schwarzBoundaryPoly(engine));
    const size = 64;
    expect(r.render(VIEW, size, OPTS)).toBe(true);

    const d = readPixels(r.canvas, size);
    for (let i = 3; i < d.length; i += 4) expect(d[i]).toBe(255); // fully opaque
    expect(distinctColors(d).size).toBeGreaterThan(1); // K vs Ω ⇒ not a flat fill

    // The center pixel maps to w ≈ origin ∈ K ⇒ fundamental n=0 ⇒ schwarzView.ts's deep-blue base
    // [30,60,140]. Distinguishes it from escaped (black), invalid (gray 80,80,80), interior (18,20,46),
    // and the light end of the ramp — a robust "the K interior painted as the CPU path would".
    const mid = ((size / 2) * size + size / 2) * 4;
    expect(d[mid + 2], "center blue channel (K base ≈140)").toBeGreaterThan(100);
    expect(d[mid + 2] - d[mid], "center blue ≫ red (deep blue, not gray/black)").toBeGreaterThan(40);
    r.destroy();
  });

  it("renders a pole-bearing σ field (single exterior pole) with structure — parity with the CPU path", () => {
    const r = createSchwarzGLRenderer();
    expect(r).not.toBeNull();
    if (!r) return;
    const phi = { c: 1, F: [] as Complex[], branches: [{ z: [0.2, 0] as Complex, A: [[0.3, 0] as Complex] }] };
    const engine = makeUnboundedLaurentSchwarz(phi.c, phi.F, phi.branches);
    r.setPhi(phi, schwarzBoundaryPoly(engine));
    const size = 64;
    expect(r.render({ center: [0, 0], zoom: 0.3 }, size, OPTS)).toBe(true);

    const d = readPixels(r.canvas, size);
    for (let i = 3; i < d.length; i += 4) expect(d[i]).toBe(255); // opaque
    expect(distinctColors(d).size).toBeGreaterThan(1); // structure, not a flat fill
    r.destroy();
  });
});
