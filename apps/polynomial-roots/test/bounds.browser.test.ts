import { describe, it, expect } from "vitest";
import { compileAlphabet } from "../src/engine/alphabet";
import { boundFor, drawBound, PHI, toScreen } from "../src/stage/bounds";

// The overlay's canvas half. The node gate checks the region's arithmetic and its inclusion; only a
// browser can say that the dashed curves reached the bitmap WHERE the arithmetic put them — a circle
// drawn about the wrong centre, or at a radius in the wrong units, passes every pure test.

const alphabet = (preset: string) => {
  const r = compileAlphabet({ preset } as never);
  if ("error" in r) throw new Error(r.error);
  return r.alphabet;
};

function frame(w: number, h: number): CanvasRenderingContext2D {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  document.body.append(canvas);
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("no 2d context");
  return ctx;
}

/** Is there ink within `r` pixels of (x, y)? The curves are dashed and antialiased, so a neighbourhood. */
function inkNear(ctx: CanvasRenderingContext2D, x: number, y: number, r = 3): boolean {
  const d = ctx.getImageData(Math.round(x) - r, Math.round(y) - r, 2 * r + 1, 2 * r + 1).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 40) return true;
  return false;
}

describe("the bound overlay draws where the arithmetic says", () => {
  it("puts the Odlyzko–Poonen circles and line at their radii, and nothing at the origin", () => {
    const bound = boundFor(alphabet("zero-one"));
    if (bound === null) throw new Error("no bound");
    const view = { cx: 0, cy: 0, halfHeight: 1.75, width: 900, height: 600 };
    const ctx = frame(view.width, view.height);
    drawBound(ctx, bound, view);
    // A dashed circle is ink on roughly half its circumference; sample many angles and require most.
    for (const radius of [1 / PHI, PHI]) {
      let hit = 0;
      const n = 72;
      for (let k = 0; k < n; k++) {
        const t = (2 * Math.PI * k) / n;
        const p = toScreen(view, radius * Math.cos(t), radius * Math.sin(t));
        if (p.y < 0 || p.y > view.height) continue;
        if (inkNear(ctx, p.x, p.y)) hit++;
      }
      expect(hit, `r = ${radius}`).toBeGreaterThan(24);
    }
    // The line Re z = 3/2, at the column the arithmetic puts it.
    const x = toScreen(view, 1.5, 0).x;
    let onLine = 0;
    for (let y = 40; y < view.height; y += 20) if (inkNear(ctx, x, y)) onLine++;
    expect(onLine).toBeGreaterThan(10);
    // And NOTHING at the origin or halfway between the circles: the overlay is curves, not a fill.
    const o = toScreen(view, 0, 0);
    expect(inkNear(ctx, o.x, o.y, 6)).toBe(false);
    const mid = toScreen(view, 1, 0);
    expect(inkNear(ctx, mid.x, mid.y + 40, 2)).toBe(false);
  });

  it("follows the view: a panned frame moves the circle, it does not redraw it in place", () => {
    const bound = boundFor(alphabet("trinary"));
    if (bound === null) throw new Error("no bound");
    const view = { cx: 1.2, cy: 0.4, halfHeight: 1, width: 600, height: 600 };
    const ctx = frame(view.width, view.height);
    drawBound(ctx, bound, view);
    // |z| = 2 at angle 0 is at re = 2, which in this view is at x = 300 + 0.8·300 = 540.
    const p = toScreen(view, 2, 0);
    expect(p.x).toBeCloseTo(540, 6);
    expect(inkNear(ctx, p.x, p.y, 4)).toBe(true);
    // Clearing: drawing again after the bound is switched off is the caller's clear, and a second draw
    // must not accumulate — the first thing drawBound does is clear.
    drawBound(ctx, bound, { ...view, cx: -5, cy: -5 });
    expect(inkNear(ctx, p.x, p.y, 4)).toBe(false);
  });
});
