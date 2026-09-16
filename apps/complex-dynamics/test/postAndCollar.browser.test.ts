import { describe, expect, it, vi } from "vitest";
import { GLPlot } from "../src/render/glPlot";
import { dynPresets } from "../src/presets";

// Two GL-level defects found in the 2026-09-16 review (WP1, R1 + R2). Both are invisible to the node
// gate by construction: it never creates a WebGL2 context, so it can neither read a pixel back nor
// observe a GL error. Both shipped and neither had a test.
//
// Runs in the browser project alongside recolorParity / shaderCompile / schwarzGL.

function makeCanvas(res: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = res;
  canvas.height = res;
  return canvas;
}

/** One accumulated frame from a fresh plot, as a data URL. The jitter is Halton-keyed on
 *  accumCount, so a fresh plot rendered the same number of times is deterministic. */
function accumulatedFrame(post: boolean, vignette: number): string {
  const res = 96;
  const canvas = makeCanvas(res);
  const plot = new GLPlot(canvas, dynPresets.mandelbrot, "dyn", res);
  plot.center = [0, 0];
  plot.zoom = 0.65;
  plot.setPost(post, vignette, 1);
  plot.setAccumulate(true);
  plot.render(); // → renderAccumulate → drawPost
  return canvas.toDataURL();
}

describe("R1 — the post-processing grade applies only when post-processing is on", () => {
  // `drawPost` is ALSO the display path for the temporal accumulator, and `accumulate` is on by
  // default in the app. It uploaded `_vignette` / `_gamma` unconditionally, so the default view was
  // vignetted and gamma-graded on screen while a plain render and every export were not: what you
  // saw was never what you saved. The uniforms are now identity (0 / 1) whenever `_post` is false.
  //
  // The claim is pinned exactly as stated: with post OFF the vignette slider must not reach the
  // image. That needs no assumption about where the set is on screen — the earlier draft of this
  // test sampled the centre of the frame and measured the Julia set's black interior.
  it("the vignette slider does not reach the image while post is off", () => {
    const none = accumulatedFrame(false, 0);
    const strong = accumulatedFrame(false, 0.9);
    expect(strong).toBe(none);
    expect(none.length).toBeGreaterThan(1000); // not a blank canvas
  });

  it("but it does when post is on (the anti-vacuity clause for the test above)", () => {
    // Without this, the test above would also pass on a build where the post pass never runs at all.
    const off = accumulatedFrame(false, 0.9);
    const on = accumulatedFrame(true, 0.9);
    expect(on).not.toBe(off);
  });
});

describe("R2 — the idle interaction collar actually renders", () => {
  // `ensureCollarTex` left the collar texture bound on unit 0, and then `renderCollar` attached that
  // same texture to the collar FBO. `setupDraw`'s default path binds nothing on unit 0, so the `uCdf`
  // sampler still pointed at the render target: a sampler feedback loop. Every collar draw was
  // rejected with GL_INVALID_OPERATION (1282), `collarValid` never became true, and the whole
  // idle-overscan feature did nothing — in every session, on both plots, since it shipped. The
  // one-shot `collarWarned` guard made it read as a single hiccup rather than a permanent failure.
  it("renders a collar frame with no GL error and no 'collar disabled' warning", async () => {
    const res = 128;
    const canvas = makeCanvas(res);
    const plot = new GLPlot(canvas, dynPresets.mandelbrot, "dyn", res);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      plot.render(); // a settled render schedules the collar chain on the next frames
      // The chain is rAF-driven and grows one level per frame; give it several.
      for (let i = 0; i < 6; i++) await new Promise((r) => requestAnimationFrame(() => r(null)));

      const disabled = warn.mock.calls.filter((c) => String(c[0]).includes("interaction collar disabled"));
      expect(disabled, `collar render failed: ${JSON.stringify(disabled[0] ?? null)}`).toHaveLength(0);

      const gl = canvas.getContext("webgl2");
      expect(gl?.getError()).toBe(gl?.NO_ERROR);
    } finally {
      warn.mockRestore();
    }
  });
});
