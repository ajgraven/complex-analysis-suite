import { beforeAll, describe, expect, it } from "vitest";

// The renderer half of the Schwarz tab's high-resolution image export, in a real
// browser because both halves are float32 GLSL against a real drawing buffer.
//
// WHAT THIS PINS, and why each clause was needed:
//
//  • A COMPOSITED GL CANVAS READS BACK EMPTY. Both contexts are created with
//    `preserveDrawingBuffer: false`. Measured before the fix: 26 distinct colours
//    immediately after a render, 1 after the browser composites — and the old
//    export's 1x path did not re-render, so "1x (display)" saved a picture with no
//    fractal in it at all. The export must therefore render synchronously and copy
//    before yielding; this file asserts BOTH sides of that, because a test that
//    only checked the good path would pass just as well on an export that got
//    lucky with timing.
//  • `pixelSize` GROWS THE BUFFER WITHOUT MOVING THE FRAME. The whole feature is
//    "the same picture, more pixels", so it is not enough that a big buffer comes
//    back non-blank — it has to be the same view.
//  • THE CAP IS REAL. maxOutputSize() must report something the planner can use;
//    a request past it fails the render rather than shrinking it.
let QD: any;

beforeAll(async () => {
  QD = (await import("../../app/solvers/solver.mjs")).default as any;
  for (const m of [
    "solver-faber", "seeds/seeds-qd", "solver-qd", "seeds/seeds-uqd", "solver-uqd",
    "solver-lqd-common", "seeds/seeds-lqd", "solver-lqd",
    "seeds/seeds-lqd-singular", "solver-lqd-singular",
    "seeds/seeds-uqd-lqd", "solver-uqd-lqd",
    "seeds/seeds-uqd-lqd-singular", "solver-uqd-lqd-singular",
    "solver-pqd-common", "seeds/seeds-pqd", "solver-pqd",
    "seeds/seeds-pqd-singular", "solver-pqd-singular",
    "seeds/seeds-uqd-pqd", "solver-uqd-pqd",
    "seeds/seeds-uqd-pqd-singular", "solver-uqd-pqd-singular",
  ]) await import(/* @vite-ignore */ "../../app/solvers/" + m + ".mjs");
  await import("../../app/schwarz/schwarz-common.mjs");
  await import("../../app/schwarz/schwarz-webgl.mjs");
  await import("../../app/sphere/sphere-common.mjs");
  await import("../../app/sphere/sphere-webgl.mjs");
  await import("../../app/schwarz/schwarz-paint.mjs");
});

/** Copy a GL canvas the way the exporter does, and describe what arrived. */
function copyOut(src: HTMLCanvasElement, W: number, H: number) {
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  cv.getContext("2d")!.drawImage(src, 0, 0, W, H);
  const d = cv.getContext("2d")!.getImageData(0, 0, W, H).data;
  const seen = new Set<number>();
  const counts = new Map<number, number>();
  for (let i = 0; i < d.length; i += 4) {
    const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    seen.add(k);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return { distinct: seen.size, counts, pixels: W * H };
}

const DELTOID = { poles: [], polyPart: [{re:0,im:0},{re:0,im:0},{re:1,im:0}] };

function solveDeltoid() {
  const r = QD.solveInverseQD(DELTOID, { unbounded: true, c: 0.5 });
  expect(r.success).toBe(true);
  const phi = r.primary.phi;
  const boundaryPts = QD.sampleBoundary(phi, 1024);
  const sw = QD.Schwarz.buildSchwarzFromPhi(phi, DELTOID, boundaryPts);
  return { phi, boundaryPts, sw };
}

describe("Schwarz fractal export: the drawing buffer", () => {
  it("reads back only while the frame is fresh — so the export must re-render", async () => {
    const { phi, boundaryPts, sw } = solveDeltoid();
    const cv = document.createElement("canvas");
    cv.width = 400; cv.height = 400; document.body.appendChild(cv);
    const gpu = QD.Schwarz.createGPURenderer(cv);
    expect(gpu, "WebGL2").toBeTruthy();
    expect(gpu.setPhi(phi, { boundaryPts, escapeR: sw.escapeR })).toBe(true);
    gpu.setColormap("magma");
    const view = { cx: 0, cy: 0, cssW: 400, cssH: 400, scale: 400 / 4.4 };
    const opts = { maxIter: 64, scaleMode: "smooth", viewMode: "w" };

    gpu.render(view, opts);
    expect(copyOut(cv, 400, 400).distinct, "immediately after a render").toBeGreaterThan(5);

    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    // The other half of the claim: this IS blank, which is why there is no
    // re-render-free fast path in the exporter.
    expect(copyOut(cv, 400, 400).distinct, "after the browser composited").toBe(1);
  }, 120_000);

  it("pixelSize grows the buffer without moving the frame", () => {
    const { phi, boundaryPts, sw } = solveDeltoid();
    const cv = document.createElement("canvas");
    cv.width = 300; cv.height = 200; document.body.appendChild(cv);
    const gpu = QD.Schwarz.createGPURenderer(cv);
    expect(gpu.setPhi(phi, { boundaryPts, escapeR: sw.escapeR })).toBe(true);
    gpu.setColormap("magma");
    const view = { cx: 0, cy: 0, cssW: 300, cssH: 200, scale: 300 / 4.4 };
    const opts = { maxIter: 64, scaleMode: "smooth", viewMode: "w" };

    gpu.render(view, opts);
    const small = copyOut(cv, cv.width, cv.height);
    const smallDims = { w: cv.width, h: cv.height };

    gpu.render(view, { ...opts, pixelSize: { W: 1200, H: 800 } });
    expect(cv.width, "requested 1200 wide").toBe(1200);
    expect(cv.height, "aspect follows cssH").toBe(800);
    const big = copyOut(cv, 1200, 800);

    // Same frame ⇒ the same world features occupy the same FRACTION of the image.
    // A shifted or rescaled view would move these; more pixels alone does not.
    // (Checked on the flat classes, whose colours are exact — the escape-time ramp
    // gains shades with resolution and is not a fair proportion to compare.)
    const frac = (r: ReturnType<typeof copyOut>, key: number) => (r.counts.get(key) ?? 0) / r.pixels;
    const ESCAPING = (80 << 16) | (80 << 8) | 90;
    const FUNDAMENTAL_TILE = (245 << 16) | (245 << 8) | 248;
    expect(frac(small, ESCAPING), "the escaping set is on screen at all").toBeGreaterThan(0.05);
    expect(frac(big, ESCAPING)).toBeCloseTo(frac(small, ESCAPING), 2);
    expect(frac(big, FUNDAMENTAL_TILE)).toBeCloseTo(frac(small, FUNDAMENTAL_TILE), 2);
    expect(big.distinct, "a 16x larger buffer resolves at least as much").toBeGreaterThanOrEqual(small.distinct);
    expect(smallDims).toEqual({ w: 300, h: 200 });
  }, 120_000);

  it("without pixelSize the buffer is exactly what it always was", () => {
    // The export path must not have changed the interactive one: S falls back to
    // devicePixelRatio, so this is the pre-existing expression.
    const { phi, boundaryPts, sw } = solveDeltoid();
    const cv = document.createElement("canvas");
    cv.width = 7; cv.height = 7; document.body.appendChild(cv);
    const gpu = QD.Schwarz.createGPURenderer(cv);
    expect(gpu.setPhi(phi, { boundaryPts, escapeR: sw.escapeR })).toBe(true);
    const dpr = window.devicePixelRatio || 1;
    gpu.render({ cx: 0, cy: 0, cssW: 321, cssH: 213, scale: 50 }, { maxIter: 8, scaleMode: "smooth" });
    expect(cv.width).toBe(Math.max(1, Math.floor(321 * dpr)));
    expect(cv.height).toBe(Math.max(1, Math.floor(213 * dpr)));
  }, 120_000);

  it("reports a usable output cap", () => {
    const { phi, boundaryPts, sw } = solveDeltoid();
    const cv = document.createElement("canvas");
    cv.width = 64; cv.height = 64; document.body.appendChild(cv);
    const gpu = QD.Schwarz.createGPURenderer(cv);
    expect(gpu.setPhi(phi, { boundaryPts, escapeR: sw.escapeR })).toBe(true);
    const cap = gpu.maxOutputSize();
    expect(cap, "a cap the planner can clamp against").toBeGreaterThanOrEqual(2048);
    expect(cap).toBeLessThanOrEqual(65536);
  }, 120_000);
});

describe("Sphere view export", () => {
  it("renders at an explicit size and reads back only while fresh", async () => {
    const { phi, boundaryPts } = solveDeltoid();
    const cv = document.createElement("canvas");
    cv.width = 300; cv.height = 300; document.body.appendChild(cv);
    const sp = QD.Sphere.createRenderer(cv);
    expect(sp, "sphere renderer").toBeTruthy();
    expect(sp.setPhi(phi, { boundaryPts, hData: DELTOID })).toBe(true);
    expect(sp.maxOutputSize(), "the sphere reports a cap too").toBeGreaterThanOrEqual(2048);

    const cam = { azimuth: Math.PI / 4, elevation: Math.PI / 6, distance: 2.5 };
    sp.render(cam, { W: 1200, H: 1200 });
    expect(cv.width).toBe(1200);
    expect(copyOut(cv, 1200, 1200).distinct, "a rendered sphere").toBeGreaterThan(50);

    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    expect(copyOut(cv, 1200, 1200).distinct, "composited ⇒ gone, same as the fractal").toBe(1);
  }, 120_000);
});

describe("Overlay layer: re-drawn at size, not upscaled", () => {
  // The headline of a HIGH-RESOLUTION export, as opposed to a big screenshot. The
  // painters work in display-space coordinates and none of them touches the
  // transform (pinned in vitest/schwarz-export-plan.test.ts), so the exporter puts
  // ONE setTransform(mult) on a capture context and calls them unchanged.
  //
  // Line WIDTH cannot check this — a figure drawn 4x bigger has 4x wider strokes
  // whether it was re-drawn or upscaled, and the first attempt at this measurement
  // duly reported ~4 for both. What separates them is that a nearest-neighbour Nx
  // upscale makes every pixel equal to the top-left of its NxN block, and a real
  // re-render antialiases against the true curve instead. The upscale control below
  // is what makes the number evidence: it must read 1.000 while the re-render does
  // not. Measured here: 0.548 re-drawn against 1.000 upscaled, so the 0.9 floor
  // below sits well clear of both.
  function blockyFraction(cv: HTMLCanvasElement, M: number) {
    const d = cv.getContext("2d")!.getImageData(0, 0, cv.width, cv.height).data;
    const px = (x: number, y: number, k: number) => d[(y * cv.width + x) * 4 + k];
    const inked = (x: number, y: number) => px(x, y, 3) > 40;
    let on = 0, blocky = 0;
    for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
      if (!inked(x, y)) continue;
      on++;
      const bx = x - (x % M), by = y - (y % M);
      if (px(x,y,0)===px(bx,by,0) && px(x,y,1)===px(bx,by,1) && px(x,y,2)===px(bx,by,2) && px(x,y,3)===px(bx,by,3)) blocky++;
    }
    return { on, frac: on ? blocky / on : -1 };
  }

  it("a 4x overlay capture is not a 4x upscale of the 1x one", async () => {
    const { phi, boundaryPts } = solveDeltoid();
    const W = 240, H = 200, MULT = 4;

    // Install the REAL painter stack against a capture context, exactly as the
    // exporter does: same sState shape, same worldToPixel, same paint entry point.
    const sState: any = {
      viewMode: "plane", mode: "fractal",
      view: { cx: 0, cy: 0, scale: W / 4.4, cssW: W, cssH: H },
      zView: { cx: 0, cy: 0, scale: W / 4.4, cssW: W, cssH: H },
      boundarySnapshot: boundaryPts, phiSnapshot: phi,
      orbit: null, preimageTree: null, limitSet: null, domainColor: null,
      sigmaLevelCurves: null, sweepOrbits: null, curveImage: null,
      criticalOrbits: null, cycles: null, sigmaSingularities: null,
      field: null, fieldKind: null, grid: { colormap: "magma", maxIter: 64, scaleMode: "smooth", modK: 8 },
    };
    let capture: CanvasRenderingContext2D | null = null;
    const worldToPixel = (re: number, im: number) => ({
      x: sState.view.cssW / 2 + (re - sState.view.cx) * sState.view.scale,
      y: sState.view.cssH / 2 - (im - sState.view.cy) * sState.view.scale,
    });
    const paint = (QD as any).QD_UI
      ? null
      : (await import("../../app/ui/ui-registry.mjs")).QD_UI.installSchwarzPaint({
          sState,
          getCtx: () => capture,
          syncCanvasSize: () => {},
          worldToPixel,
          zToPixel: worldToPixel,
          activeRenderer: () => "gpu",
          KIND_FUND: 0, KIND_ESC: 1, KIND_INT: 2, KIND_INV: 3, KIND_OUTSIDE: 4,
        });
    expect(paint, "paint module installed").toBeTruthy();

    const draw = (mult: number) => {
      const cv = document.createElement("canvas");
      cv.width = W * mult; cv.height = H * mult;
      const ctx = cv.getContext("2d")!;
      ctx.setTransform(mult, 0, 0, mult, 0, 0);
      capture = ctx;
      try { paint!.paintBoundaryOnTop(); } finally { capture = null; }
      return cv;
    };

    const at1 = draw(1);
    const at4 = draw(MULT);
    expect(at4.width).toBe(W * MULT);

    // CONTROL: the 1x capture blown up with the old code's own settings.
    const ctl = document.createElement("canvas");
    ctl.width = W * MULT; ctl.height = H * MULT;
    const cctx = ctl.getContext("2d")!;
    cctx.imageSmoothingEnabled = false;
    cctx.drawImage(at1, 0, 0, ctl.width, ctl.height);

    const real = blockyFraction(at4, MULT);
    const fake = blockyFraction(ctl, MULT);
    expect(real.on, "the overlay drew something").toBeGreaterThan(200);
    expect(fake.frac, "an upscale is blocky BY CONSTRUCTION — if this is not 1, the metric is wrong").toBeCloseTo(1, 3);
    expect(real.frac, "a re-drawn overlay antialiases against the true curve").toBeLessThan(0.9);
  }, 120_000);
});
