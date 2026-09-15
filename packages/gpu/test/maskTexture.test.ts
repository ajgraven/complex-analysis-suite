import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { polygonMaskFrame } from "../src/maskTexture.js";

// The GL upload half of buildPolygonMaskTexture needs a WebGL2 context + DOM (offscreen 2D canvas), so it
// is exercised by the consuming app's browser render (CD's schwarzGL) + the shaderCompile browser gate.
// The SAMPLING TRANSFORM, though, is pure geometry — and it is load-bearing: get the frame wrong and every
// pixel's in/out test reads the mask at the wrong uv. So pin it in node here.

describe("@cas/gpu polygonMaskFrame — the world-space square a polygon's mask covers", () => {
  it("centers on the bbox and pads the larger half-extent by padFactor (square)", () => {
    // bbox [-1,1] × [-1,1]: center (0,0), max half-extent 1, ×2 padFactor ⇒ 2.
    const f = polygonMaskFrame(
      [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ],
      2,
    );
    expect(f.center).toEqual([0, 0]);
    expect(f.halfExtent).toBeCloseTo(2, 12);
  });

  it("uses the LARGER of width/height (a wide, short polygon still gets a square frame)", () => {
    // bbox [0,10] × [2,4]: center (5,3), width 10 > height 2 ⇒ half-extent 5·padFactor.
    const f = polygonMaskFrame(
      [
        [0, 2],
        [10, 2],
        [10, 4],
        [0, 4],
      ],
      1,
    );
    expect(f.center).toEqual([5, 3]);
    expect(f.halfExtent).toBeCloseTo(5, 12); // max(10,2)/2 · 1
  });

  it("offsets the center for a non-origin bbox (the deltoid boundary sits around 0 but a pole domain need not)", () => {
    const f = polygonMaskFrame(
      [
        [2, 0],
        [6, 0],
        [6, 2],
        [2, 2],
      ],
      1,
    );
    expect(f.center).toEqual([4, 1]);
    expect(f.halfExtent).toBeCloseTo(2, 12);
  });

  it("stays finite for degenerate input (empty ⇒ unit frame; a single point ⇒ non-zero extent)", () => {
    expect(polygonMaskFrame([], 4)).toEqual({ center: [0, 0], halfExtent: 1 });
    const pt = polygonMaskFrame([[3, 3]], 4);
    expect(pt.center).toEqual([3, 3]);
    expect(pt.halfExtent).toBe(1); // zero bbox → clamped to 1, not 0 (keeps uv math finite)
  });
});

// `conservativeOmega` resolves the rasteriser's half-texel edge error AGAINST Ω, so a shader whose in-Ω
// test is this mask never asks a PARTIAL inverse about a point outside its domain. Complex Dynamics' σ
// view measured what happens without it: 1.14% of a 512² frame painted "invalid" at 30x zoom, 99.9% of
// those tracing to a point the mask called in-Ω where no preimage exists.
//
// These are SOURCE assertions because the GL upload half needs a WebGL2 context and a DOM (see the header),
// so nothing in THIS package can render the mask. What they guard is a "fix" that zeroes the artifact by
// over-dilating instead — wrong in the other direction, silencing the speckle by misclassifying a band
// along every edge — and the bound on the bias is pinned here because here is where it is stated.
//
// The behavioural half lives with the consumer, and took two attempts. Three metrics built against Complex
// Dynamics' cusped deltoid all scored a 10× over-dilation IDENTICALLY to the real fix (the numbers are in
// apps/complex-dynamics/test/schwarzMask.browser.test.ts); the one that works is in the sibling
// schwarzGL.browser.test.ts, on a φ whose σ field is exactly two classes, and it bites once ∂Ω moves by
// about one screen pixel — 38.7× the ±1 texel bounded below.
describe("@cas/gpu buildPolygonMaskTexture — the conservative margin", () => {
  const src = readFileSync(fileURLToPath(new URL("../src/maskTexture.ts", import.meta.url)), "utf8");

  it("strokes the outline in the NOT-in-Ω colour, for each orientation", () => {
    // Ω inside ⇒ erode it (black, the 0 the shader reads as outside); Ω outside ⇒ dilate the polygon over
    // the band (white). Getting this backwards widens the very band it is meant to close.
    expect(src).toMatch(/strokeStyle\s*=\s*conservativeOmega === "inside" \? "#000" : "#fff"/);
  });

  it("bounds the bias at ±1 texel — the error it absorbs, not more", () => {
    // lineWidth is in mask-pixel units, centred on the path, so 2 is ±1 texel: twice the ~half-texel
    // coverage error, and no more. A larger value trades the speckle for a visibly displaced ∂Ω.
    const stroke = /conservativeOmega\)\s*\{[\s\S]{0,600}?ctx\.lineWidth\s*=\s*(\d+)/.exec(src);
    expect(stroke, "the conservative block must set a line width").not.toBeNull();
    expect(Number((stroke as RegExpExecArray)[1])).toBeLessThanOrEqual(2);
  });

  it("keeps a cusp from throwing a miter spike outside ∂Ω", () => {
    expect(src).toMatch(/lineJoin\s*=\s*"round"/);
  });

  it("is opt-in: a caller that asks for nothing gets the unbiased mask it always had", () => {
    expect(src).toMatch(/if \(conservativeOmega\)/);
  });
});
