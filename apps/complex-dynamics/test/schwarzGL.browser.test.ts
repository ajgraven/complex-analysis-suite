import { describe, expect, it } from "vitest";
import { makeUnboundedLaurentSchwarz, type Complex } from "@cas/schwarz";
import { schwarzBoundaryPoly } from "../src/render/schwarzView";
import { createSchwarzGLRenderer } from "../src/render/schwarzGL";
import { schwarzColormap } from "../src/render/schwarzColormaps";

// BROWSER-MODE end-to-end test for the GPU σ render (S4b-ii + ADR-0009 item 3). The node/jsdom gate can't
// run WebGL2, so this joins CD's existing `pnpm test:browser` project (real headless-Chromium WebGL2,
// SwiftShader).
//
// I1 already proved GPU σ(w) = CPU σ(w) to float32 ε (@cas/schwarz browser harness). This proves the
// RENDER SHELL around it — CD's view→w mapping, the Ω mask, the escape loop, and the SELECTABLE COLORMAP
// (render/schwarzColormaps.ts) — assembles into a working image: the shader compiles, a frame renders,
// it's opaque, it has K-vs-Ω structure, the fundamental set paints through the chosen colormap, and
// switching the colormap / scale mode changes the pixels.

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

/** RGB of the pixel at the image center (the view center maps here). */
function centerRGB(d: Uint8ClampedArray, size: number): [number, number, number] {
  const mid = ((size / 2) * size + size / 2) * 4;
  return [d[mid], d[mid + 1], d[mid + 2]];
}

/** Count pixels whose RGB differs (by > tol on any channel) between two same-size frames. */
function pixelsDiffering(a: Uint8ClampedArray, b: Uint8ClampedArray, tol = 2): number {
  let n = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (
      Math.abs(a[i] - b[i]) > tol ||
      Math.abs(a[i + 1] - b[i + 1]) > tol ||
      Math.abs(a[i + 2] - b[i + 2]) > tol
    ) {
      n++;
    }
  }
  return n;
}

function expectCloseColor(
  actual: readonly number[],
  expected: readonly number[],
  tol: number,
  label: string,
): void {
  for (let ch = 0; ch < 3; ch++) {
    expect(Math.abs(actual[ch] - expected[ch]), `${label} ch${ch} (${actual} ≈ ${expected})`).toBeLessThanOrEqual(
      tol,
    );
  }
}

const DELTOID: { c: number; F: Complex[] } = { c: 1, F: [[0, 0], [0, 0], [0.5, 0]] };
const VIEW = { center: [0, 0] as [number, number], zoom: 0.4 };
const OPTS = { maxIter: 48, escapeR: 1e4 };

describe("CD σ GPU render (S4b-ii + ADR-0009 item 3) — full pipeline in real WebGL2", () => {
  it("createSchwarzGLRenderer builds — the composed σ shader compiles + links", () => {
    const r = createSchwarzGLRenderer();
    expect(r, "WebGL2 present but the σ shader failed to build (null renderer)").not.toBeNull();
    r?.destroy();
  });

  it("renders the deltoid σ field: opaque, structured (K vs Ω), K interior in the colormap's base color", () => {
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

    // The center pixel maps to w ≈ origin ∈ K ⇒ fundamental n=0 ⇒ computeT(0)=0 ⇒ the colormap's t=0 end.
    // With the default (viridis) that is the dark-purple base [68,1,84]. Comparing against the imported
    // palette datum keeps this robust to palette edits (it tracks the ramp, not a frozen literal).
    const base = schwarzColormap("viridis")[0];
    expectCloseColor(centerRGB(d, size), base, 8, "K-interior center = viridis base");
    r.destroy();
  });

  it("setColormap repaints the fundamental set through the chosen ramp (center tracks the ramp's t=0 end)", () => {
    const r = createSchwarzGLRenderer();
    expect(r).not.toBeNull();
    if (!r) return;
    const engine = makeUnboundedLaurentSchwarz(DELTOID.c, DELTOID.F);
    r.setPhi(DELTOID, schwarzBoundaryPoly(engine));
    const size = 64;

    r.render(VIEW, size, OPTS);
    const viridis = readPixels(r.canvas, size);
    expectCloseColor(centerRGB(viridis, size), schwarzColormap("viridis")[0], 8, "viridis center");

    r.setColormap("turbo");
    r.render(VIEW, size, OPTS);
    const turbo = readPixels(r.canvas, size);
    expectCloseColor(centerRGB(turbo, size), schwarzColormap("turbo")[0], 8, "turbo center");

    r.setColormap("grayscale");
    r.render(VIEW, size, OPTS);
    const gray = readPixels(r.canvas, size);
    expectCloseColor(centerRGB(gray, size), schwarzColormap("grayscale")[0], 8, "grayscale center");

    // The palettes are visibly different objects, so the whole frame must move — not just the center.
    expect(pixelsDiffering(viridis, turbo), "viridis vs turbo differ").toBeGreaterThan(size); // ≫ a handful
    expect(pixelsDiffering(viridis, gray), "viridis vs grayscale differ").toBeGreaterThan(size);
    r.destroy();
  });

  it("the scale mode changes the escape-time coloring (linear vs sqrt remap n→t differently)", () => {
    const r = createSchwarzGLRenderer();
    expect(r).not.toBeNull();
    if (!r) return;
    const engine = makeUnboundedLaurentSchwarz(DELTOID.c, DELTOID.F);
    r.setPhi(DELTOID, schwarzBoundaryPoly(engine));
    const size = 64;

    r.render(VIEW, size, { ...OPTS, scaleMode: "linear" });
    const linear = readPixels(r.canvas, size);
    r.render(VIEW, size, { ...OPTS, scaleMode: "sqrt" });
    const sqrt = readPixels(r.canvas, size);

    // sqrt pushes low escape counts toward the bright end, so the n≥1 fundamental band recolors while the
    // flat sets (escaped/interior/invalid) and the n=0 center hold — the frames must differ, but not wholly.
    const diff = pixelsDiffering(linear, sqrt);
    expect(diff, "some pixels recolor under sqrt").toBeGreaterThan(size);
    expect(diff, "flat + n=0 regions unchanged ⇒ not the whole frame").toBeLessThan(size * size);
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
