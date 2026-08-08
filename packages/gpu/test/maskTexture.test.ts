import { describe, expect, it } from "vitest";
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
