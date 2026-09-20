import { describe, expect, it } from "vitest";
import { parse } from "@cas/expr/parser";
import { drawOverlay, type OverlayParams } from "../src/render/overlay";
import { inspect } from "../src/render/inspect";

// WP8/S7 (review 2026-09-16). One click used to produce TWO escape counts: the panel classified the
// critical orbit, the plot label classified the orbit of the clicked point `c`, and with the
// "critical orbit" overlay on the plot ALSO drew a third, dashed, one step away from its own solid
// one. The overlay had no test at all, because it is canvas code — so the label is read back off a
// recording 2-D context, which is all that is needed to compare the two numbers a reader compares.

const F = parse("z^2+c");
const ESC = parse("abs(z)>2");

/** A 2-D context that records the calls this test reads and accepts everything else. */
function recordingCtx(): { ctx: CanvasRenderingContext2D; texts: string[]; strokes: number } {
  const texts: string[] = [];
  const state = { strokes: 0, dashed: false, dashedStrokes: 0 };
  const target: Record<string, unknown> = {
    fillText: (t: string) => void texts.push(t),
    strokeText: () => {},
    measureText: (t: string) => ({ width: t.length * 6 }),
    setLineDash: (d: number[]) => void (state.dashed = d.length > 0),
    stroke: () => {
      state.strokes++;
      if (state.dashed) state.dashedStrokes++;
    },
    getLineDash: () => [] as number[],
    createLinearGradient: () => ({ addColorStop: () => {} }),
    isPointInPath: () => false,
  };
  const ctx = new Proxy(target, {
    get: (t, prop: string) =>
      prop in t ? t[prop] : /^[a-z]/.test(prop) ? () => undefined : undefined,
    set: () => true,
    has: () => true,
  }) as unknown as CanvasRenderingContext2D;
  return {
    ctx,
    texts,
    get strokes() {
      return state.dashedStrokes;
    },
  } as { ctx: CanvasRenderingContext2D; texts: string[]; strokes: number };
}

function params(over: Partial<OverlayParams> = {}): OverlayParams {
  return {
    fAst: F,
    escapeAst: ESC,
    z0: [0.26, 0],
    c: [0.26, 0],
    center: [0, 0],
    zoom: 0.75,
    nplot: 200,
    fractType: "param",
    size: 512,
    ...over,
  };
}

/** The `c=… · …` white-point annotation, which is the last text the overlay writes. */
function label(texts: string[]): string {
  const hit = texts.filter((t) => t.startsWith("c=") || t.startsWith("z0="));
  if (hit.length === 0) throw new Error(`no white-point label in [${texts.join(" | ")}]`);
  return hit[hit.length - 1];
}

describe("the parameter plane's orbit is the critical orbit", () => {
  it("the plot label's escape count equals the inspector's", () => {
    for (const c of [
      [0.26, 0],
      [1, 0],
      [0.4, 0.3],
      [-0.9, 0.4],
    ] as [number, number][]) {
      const r = recordingCtx();
      drawOverlay(r.ctx, params({ z0: c, c }));
      const panel = inspect(F, ESC, "param", [0, 0], c, [0, 0]);
      expect(panel.fate, `c=${c}`).toBe("escaped");
      expect(label(r.texts), `c=${c}`).toContain(`escapes (n=${panel.escapeIter})`);
    }
  });

  // The anti-vacuity clause, and the measurement that made this worth fixing: the orbit of the point
  // c reaches the bailout exactly one step sooner, since f(0) = c. A test that only checked "some
  // number is printed" would have passed on either convention.
  it("the orbit of c would have given a DIFFERENT number", () => {
    const c: [number, number] = [0.26, 0];
    const crit = inspect(F, ESC, "param", [0, 0], c, [0, 0]);
    const pixel = inspect(F, ESC, "param", c, c, [0, 0]);
    expect(pixel.escapeIter).toBe(crit.escapeIter - 1);
    const r = recordingCtx();
    drawOverlay(r.ctx, params({ z0: c, c }));
    expect(label(r.texts)).not.toContain(`escapes (n=${pixel.escapeIter})`);
  });

  it("says WHICH orbit it is reporting", () => {
    const r = recordingCtx();
    drawOverlay(r.ctx, params());
    expect(label(r.texts)).toContain("critical orbit escapes");
  });

  it("the dynamical plane still follows the clicked point, not the critical one", () => {
    const r = recordingCtx();
    drawOverlay(r.ctx, params({ fractType: "dyn", z0: [2.5, 0], c: [-1, 0] }));
    const panel = inspect(F, ESC, "dyn", [2.5, 0], [-1, 0], [0, 0]);
    expect(label(r.texts)).toContain(`z0=`);
    expect(label(r.texts)).toContain(`escapes (n=${panel.escapeIter})`);
    expect(label(r.texts)).not.toContain("critical orbit");
  });

  it("the dashed critical-orbit overlay is a dynamical-plane instrument now", () => {
    // On the parameter plane it would trace the identical polyline over the solid one.
    const onParam = recordingCtx();
    drawOverlay(onParam.ctx, params({ critical: true }));
    expect(onParam.strokes).toBe(0);
    const onDyn = recordingCtx();
    drawOverlay(onDyn.ctx, params({ critical: true, fractType: "dyn", z0: [2.5, 0], c: [-1, 0] }));
    expect(onDyn.strokes).toBeGreaterThan(0);
  });
});
