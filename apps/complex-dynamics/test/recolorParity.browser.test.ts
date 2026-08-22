import { describe, expect, it } from "vitest";
import { GLPlot } from "../src/render/glPlot";
import { dynPresets } from "../src/presets";

// TWO-PASS RECOLOUR PARITY (cd-render Fix L). The recolour fast path reproduces the fused shader's
// output for the escape-family modes (smooth / escape / histogram / decomposition) at uAA == 1 by
// sampling a cached RGBA32F escape-field texture instead of re-iterating. This test proves that
// substitution is BYTE-IDENTICAL in a real WebGL2 context: a full (fused) render and a recolour of
// the same view must produce the same pixels. A drift here would mean a colour shift whenever an
// appearance control (palette / rotation / gradient / outline / equipotential) is touched.
//
// Runs in the browser project (like shaderCompile.browser.test.ts) because it needs a live WebGL2
// context. Uses canvas.toDataURL() — GLPlot creates its context with preserveDrawingBuffer, and
// Chromium's PNG encoding is deterministic for identical pixel buffers, so equal data URLs ⟺ equal
// pixels. render() is driven synchronously here (not via the RAF scheduler) so each frame is read
// back deterministically.

function makeCanvas(res: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = res;
  canvas.height = res;
  return canvas;
}

describe("two-pass recolour parity (cd-render Fix L)", () => {
  it("recolour of the cached field is byte-identical to a full fused render (smooth, z²+c)", () => {
    const res = 128;
    const canvas = makeCanvas(res);
    const plot = new GLPlot(canvas, dynPresets.mandelbrot, "dyn", res);

    // Full fused render (forceFull ⇒ single full-resolution pass, and it disables the recolour path).
    plot.setForceFullRender(true);
    plot.render();
    const fused = canvas.toDataURL();

    // Now take the recolour path: forceFull off, an appearance-only change (rotation ← 0, i.e. the same
    // value) flags wantRecolor, smooth mode + AA off ⇒ canRecolor(). render() builds the field once,
    // colourises. Same appearance ⇒ must reproduce the fused image exactly.
    plot.setForceFullRender(false);
    plot.setGradientRotation(0);
    plot.render();
    const recoloured = canvas.toDataURL();

    expect(recoloured).toBe(fused);
    // Guard against a vacuous pass on a blank canvas (a dead context would make both an empty image).
    expect(fused.length).toBeGreaterThan(1000);
  });

  it("a second recolour (field reused, not rebuilt) is still byte-identical", () => {
    const res = 128;
    const canvas = makeCanvas(res);
    const plot = new GLPlot(canvas, dynPresets.mandelbrot, "dyn", res);
    plot.setForceFullRender(true);
    plot.render();
    const fused = canvas.toDataURL();
    plot.setForceFullRender(false);
    plot.setGradientRotation(0);
    plot.render(); // builds the field + colourises
    plot.setGradientRotation(0);
    plot.render(); // reuses the cached field + colourises again
    expect(canvas.toDataURL()).toBe(fused);
  });
});
