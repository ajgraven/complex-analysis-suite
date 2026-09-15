// @vitest-environment node
//
// The DOM-free half of the Schwarz tab's high-res image export: how big the file
// may be, and what it is honest to claim about its detail.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  EXPORT_MULTIPLIERS, planExportSize, describeExportDetail, exportFileName,
} from "../app/schwarz/schwarz-export-plan.mjs";

const src = (rel: string) =>
  readFileSync(fileURLToPath(new URL("../app/schwarz/" + rel, import.meta.url)), "utf8");

describe("planExportSize", () => {
  it("multiplies the display size when the renderer has room", () => {
    expect(planExportSize({ cssW: 1000, cssH: 700, mult: 4, maxDim: 8192 }))
      .toMatchObject({ outW: 4000, outH: 2800, mult: 4, clamped: false });
  });

  it("caps on the LONGEST edge and scales both by the same factor", () => {
    // The cap binds on width; height must follow by the same factor or the export
    // is a different frame from the one on screen — which is the whole point of a
    // multiplier rather than a fixed pixel size.
    const p = planExportSize({ cssW: 1600, cssH: 900, mult: 8, maxDim: 8192 });
    expect(p.outW).toBe(8192);
    expect(p.clamped).toBe(true);
    expect(p.outW / p.outH).toBeCloseTo(1600 / 900, 2);
    expect(p.mult).toBeCloseTo(8192 / 1600, 6);
  });

  it("keeps the effective multiplier fractional rather than snapping to a whole one", () => {
    // Snapping 5.12x down to 4x would throw away 1.6 megapixels the GPU was
    // willing to render, so the applied multiplier is a real number and the UI
    // reports the pixel size it produces.
    const p = planExportSize({ cssW: 1600, cssH: 900, mult: 8, maxDim: 8192 });
    expect(Number.isInteger(p.mult)).toBe(false);
    expect(p.requestedMult).toBe(8);
  });

  it("downscales, and says so, when the display alone already exceeds the cap", () => {
    const p = planExportSize({ cssW: 9000, cssH: 9000, mult: 1, maxDim: 8192 });
    expect(p.outW).toBe(8192);
    expect(p.mult).toBeLessThan(1);
    expect(p.clamped).toBe(true);   // a truncated render would be worse than a smaller one
  });

  it("applies no cap when the renderer could not be asked for one", () => {
    expect(planExportSize({ cssW: 1000, cssH: 700, mult: 4, maxDim: 0 }))
      .toMatchObject({ outW: 4000, outH: 2800, clamped: false });
  });

  it("never returns a zero or fractional pixel size", () => {
    for (const mult of [1, 2, 4, 8, 0.31]) {
      for (const [w, h] of [[1, 1], [37, 900], [1280, 731]]) {
        const p = planExportSize({ cssW: w, cssH: h, mult, maxDim: 8192 });
        expect(Number.isInteger(p.outW) && p.outW >= 1).toBe(true);
        expect(Number.isInteger(p.outH) && p.outH >= 1).toBe(true);
      }
    }
  });

  it("offers 1/2/4/8 to the UI", () => expect(EXPORT_MULTIPLIERS).toEqual([1, 2, 4, 8]));
});

describe("describeExportDetail — the claim the file can actually support", () => {
  it("a GPU field is genuinely re-rendered, so nothing is upscaled", () => {
    const d = describeExportDetail({ view: "plane", onGpu: true, outW: 4000, outH: 2800 });
    expect(d.fieldUpscaled).toBe(false);
    expect(d.detail).toContain("4000×2800");
  });

  it("a CPU field is upscaled, and the line names the size it was really computed at", () => {
    // The honest-labelling guardrail: "4x" is true of the overlays and false of a
    // field that only ever existed at the resolution slider's size.
    const d = describeExportDetail({ view: "plane", onGpu: false, outW: 4000, outH: 2800, fieldW: 640, fieldH: 448 });
    expect(d.fieldUpscaled).toBe(true);
    expect(d.detail).toContain("640×448");
  });

  it("the z-disk view is judged by its renderer, exactly as the plane is", () => {
    expect(describeExportDetail({ view: "z", onGpu: true, outW: 100, outH: 100 }).fieldUpscaled).toBe(false);
    expect(describeExportDetail({ view: "z", onGpu: false, outW: 100, outH: 100, fieldW: 64, fieldH: 64 }).fieldUpscaled).toBe(true);
  });

  it("the sphere is upscaled whatever the renderer, because its fractal is a texture", () => {
    // Its geometry (silhouette, boundary curve, markers) DOES sharpen with the
    // frame; the fractal painted onto it cannot exceed texSize, so the claim is
    // capped and the line says where to raise it.
    const d = describeExportDetail({ view: "sphere", onGpu: true, outW: 2400, outH: 2400, texSize: 1024 });
    expect(d.fieldUpscaled).toBe(true);
    expect(d.detail).toContain("1024×1024");
  });
});

describe("exportFileName", () => {
  it("names the view and the real pixel size", () => {
    const at = new Date(Date.UTC(2026, 8, 15, 10, 30, 0));
    expect(exportFileName({ view: "z", outW: 2000, outH: 1400, now: at }))
      .toBe("qd-schwarz-zdisk-2026-09-15T10-30-00-2000x1400.png");
    expect(exportFileName({ view: "sphere", outW: 8, outH: 8, now: at })).toContain("-sphere-");
    expect(exportFileName({ view: "plane", outW: 8, outH: 8, now: at })).toContain("-plane-");
  });
});

describe("the invariant the crisp overlay rests on", () => {
  it("no painter touches the canvas transform", () => {
    // The export re-renders overlays by putting ONE setTransform(mult) on a capture
    // context and calling the existing painters unchanged — which is only sound
    // while none of them sets, resets or composes a transform of its own. A painter
    // that did would silently export its layer at display size over a scaled one,
    // so the invariant is pinned here rather than left as a grep someone did once.
    const paint = src("schwarz-paint.mjs");
    for (const banned of ["setTransform", "resetTransform", "ctx.scale(", "ctx.translate(", "ctx.rotate("]) {
      expect(paint.includes(banned), "schwarz-paint.mjs must not call " + banned).toBe(false);
    }
  });

  it("the export renders the view the user is actually looking at", () => {
    // The z-disk view has its own camera (sState.zView) and its own shader branch
    // (viewMode:'z'). The export used to pass NEITHER, so in z-disk mode it saved
    // the plane at the plane's camera — a different picture from the one on screen,
    // and one that looks perfectly plausible on its own. Both halves are pinned
    // because either alone still exports the wrong thing.
    const feat = src("schwarz-features.mjs");
    expect(feat, "the z camera").toContain("inZ ? sState.zView : sState.view");
    expect(feat.match(/viewMode:\s*inZ \? 'z' : 'w'/g) ?? [],
      "every export render must carry the view mode").not.toHaveLength(0);
  });

  it("the exporter always clears the capture redirect", () => {
    // Leaving it set would send the LIVE app's painting into a detached canvas, so
    // the clear has to be unconditional rather than on the success path.
    const feat = src("schwarz-features.mjs");
    const i = feat.indexOf("setOverlayCapture(ovCtx)");
    expect(i, "the export must install a capture context").toBeGreaterThan(-1);
    const after = feat.slice(i, i + 900);
    expect(after).toMatch(/finally\s*\{[^}]*setOverlayCapture\(null\)/);
  });
});
