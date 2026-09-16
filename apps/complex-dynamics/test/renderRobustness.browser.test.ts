import { describe, expect, it, vi } from "vitest";
import { GLPlot } from "../src/render/glPlot";
import { dynPresets } from "../src/presets";

// WP9/R7 + R8 + R9 (review 2026-09-16). Four claims that need a real WebGL2 context: a refused
// view, a refused export, temporal AA resuming after a recolour, and one render per request.

function plot(res = 96): { plot: GLPlot; canvas: HTMLCanvasElement } {
  const canvas = document.createElement("canvas");
  canvas.width = res;
  canvas.height = res;
  return { plot: new GLPlot(canvas, dynPresets.mandelbrot, "dyn", res), canvas };
}

const frame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));

/**
 * Wait for `cond`, one animation frame at a time, up to `frames`.
 *
 * A fixed count of rAF ticks is not a safe wait here: under SwiftShader, with six browser specs
 * sharing one context, a single accumulate sample of a 128² view can take several frames, and the
 * R7 case below duly passed alone and failed in the full suite. The claim being made is "another
 * frame is scheduled and eventually draws", so the wait is bounded rather than fixed.
 */
async function waitFor(cond: () => boolean, frames = 240): Promise<boolean> {
  for (let i = 0; i < frames; i++) {
    if (cond()) return true;
    await frame();
  }
  return cond();
}

describe("R8 — a view the plot cannot draw is refused, not stored", () => {
  // The view span is 2/zoom, so zero gives an infinite span, a negative one mirrors the image, and a
  // NaN reaches the shader as a NaN uniform. A corrupt share link or a keyframe built from a bad
  // number all arrive through these setters, and there was no way back once one did.
  it("keeps the last good zoom and centre", () => {
    const { plot: p } = plot();
    p.zoom = 4;
    p.center = [0.25, -0.5];

    for (const bad of [0, -1, NaN, Infinity, -Infinity]) p.zoom = bad;
    expect(p.zoom).toBe(4);

    for (const bad of [
      [NaN, 0],
      [0, Infinity],
      [-Infinity, -Infinity],
    ] as [number, number][]) {
      p.center = bad;
    }
    expect(p.center).toEqual([0.25, -0.5]);
  });

  it("a positive finite zoom still applies (the anti-vacuity clause)", () => {
    const { plot: p } = plot();
    p.zoom = 1e-3;
    expect(p.zoom).toBe(1e-3);
    p.zoom = 1e9;
    expect(p.zoom).toBe(1e9);
  });

  it("setCenterDD refuses a non-finite double-double too", () => {
    const { plot: p } = plot();
    p.center = [0.1, 0.2];
    p.setCenterDD([NaN, 0], [0, 0]);
    expect(p.center).toEqual([0.1, 0.2]);
  });
});

describe("R8 — an export that cannot be honoured rejects instead of saving a blank PNG", () => {
  it("refuses once the context is lost", async () => {
    const { plot: p, canvas } = plot();
    p.render();
    const gl = canvas.getContext("webgl2");
    const lose = gl?.getExtension("WEBGL_lose_context");
    expect(lose, "WEBGL_lose_context is needed for this test").toBeTruthy();
    lose?.loseContext();
    await frame();
    await expect(p.renderToImageData(64)).rejects.toThrow(/context was lost/i);
  });
});

describe("R7 — a recolour does not end the temporal accumulation", () => {
  // The recolour paints ONE sample of the cached field. With temporal AA on, the anti-aliased frame
  // the accumulator had built is replaced by that single sample — and nothing rebuilt it, because
  // the fast path returned without scheduling anything. A palette change left the view permanently
  // aliased.
  it("schedules another frame, so the ladder restarts", async () => {
    const { plot: p, canvas } = plot(128);
    p.setAccumulate(true);
    p.render();
    const first = canvas.toDataURL();
    expect(await waitFor(() => canvas.toDataURL() !== first), "samples accumulate at all").toBe(true);
    const accumulated = canvas.toDataURL();

    p.setGradientRotation(0.37); // appearance only ⇒ scheduleRender(false) ⇒ the recolour path
    expect(
      await waitFor(() => canvas.toDataURL() !== accumulated),
      "the palette change really did reach the image (anti-vacuity)",
    ).toBe(true);
    const recoloured = canvas.toDataURL();

    // If the accumulation had not resumed, NOTHING would ever draw again: the recolour path returns
    // without scheduling, and no other change is coming.
    expect(
      await waitFor(() => canvas.toDataURL() !== recoloured),
      "the accumulation resumed after the recolour",
    ).toBe(true);
  });
});

describe("R9 — a direct render retires the frame that was scheduled for it", () => {
  it("draws once, not twice, for the recorder's set-then-render pattern", async () => {
    const { plot: p } = plot();
    p.setForceFullRender(true);
    p.render();
    await frame();
    const draws = vi.spyOn(p as unknown as { render: () => void }, "render");
    // Exactly what `recordAnimation`'s `apply(t)` does: two schedules and one synchronous draw.
    p.center = [-0.5, 0];
    p.zoom = 2;
    p.render();
    const afterDirect = draws.mock.calls.length;
    await frame();
    await frame();
    expect(draws.mock.calls.length, "the scheduled frame drew the same view again").toBe(
      afterDirect,
    );
    draws.mockRestore();
  });

  it("but a change made AFTER the direct render is still drawn", async () => {
    // The coalescing hazard: a second `scheduleRender()` returns early because one is already
    // scheduled, so the pending frame has to carry the LATEST request's sequence, not the first's.
    const { plot: p, canvas } = plot();
    p.render();
    await frame();
    p.center = [-0.5, 0]; // schedules
    p.render(); // …and covers it
    p.zoom = 8; // schedules again — nothing has drawn this yet
    const before = canvas.toDataURL();
    await frame();
    await frame();
    expect(canvas.toDataURL()).not.toBe(before);
  });
});

describe("R6 — an export is one frame's worth of settings, start to finish", () => {
  // `renderToImageData` yields between 256-px strips so the UI stays responsive, and every strip
  // re-read the LIVE fields — so a palette nudge, a pan or a wheel during a multi-second export
  // changed the look of the remaining strips and the saved PNG was two pictures with a seam.
  const SIZE = 512; // > STRIP (256) ⇒ at least one yield, which is where the change used to land

  const bytes = (img: ImageData): string => {
    let h = "";
    for (let i = 0; i < img.data.length; i += 4099) h += img.data[i].toString(16);
    return h;
  };

  it("a palette change mid-export does not reach the image; one made before it does", async () => {
    const { plot: p } = plot();
    p.setColoring(1, 0, 1); // smooth, classic
    const classic = await p.renderToImageData(SIZE);
    expect(classic).not.toBeNull();

    p.setColoring(1, 3, 1); // grayscale — a change BEFORE the export must show (anti-vacuity)
    const gray = await p.renderToImageData(SIZE);
    expect(gray).not.toBeNull();
    expect(bytes(gray as ImageData)).not.toBe(bytes(classic as ImageData));

    // Now start on classic and switch to grayscale between strips.
    p.setColoring(1, 0, 1);
    let switched = false;
    const mid = await p.renderToImageData(SIZE, {
      onProgress: (f) => {
        if (f < 1 && !switched) {
          switched = true;
          p.setColoring(1, 3, 1);
        }
      },
    });
    expect(switched, "the export really did yield mid-flight").toBe(true);
    expect(bytes(mid as ImageData)).toBe(bytes(classic as ImageData));
  });

  it("announces that it is exporting, so the plot can ignore input for the duration", async () => {
    const { plot: p } = plot();
    expect(p.exporting).toBe(false);
    let sawFlag = false;
    await p.renderToImageData(SIZE, {
      onProgress: () => {
        sawFlag = sawFlag || p.exporting;
      },
    });
    expect(sawFlag).toBe(true);
    expect(p.exporting).toBe(false); // …and cleared afterwards
  });
});
