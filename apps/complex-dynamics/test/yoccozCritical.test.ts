import { describe, expect, it } from "vitest";
import { parameterLanding } from "../src/render/angleParameter";
import { dynamicRay, parameterRay } from "../src/render/rays";
import { criticalPieceMask } from "../src/render/yoccozCritical";
import { yoccozPuzzle } from "../src/render/yoccozPuzzle";

const C: [number, number] = [-1, 0]; // basilica
const BOX: [number, number, number, number] = [-2.2, -2.2, 2.2, 2.2];
const N = 300;
const G0 = 0.5;

function mask(depth: number) {
  const puz = yoccozPuzzle(C, depth);
  if (!puz) return null;
  const rays = puz.rayAngles.map((a) => dynamicRay(a, C, { depth: 500 }));
  return criticalPieceMask(C, G0 / 2 ** depth, rays, [0, 0], BOX, N);
}

/** mask(depth) asserted non-null (the basilica always has a puzzle). */
function must(depth: number) {
  const m = mask(depth);
  expect(m).not.toBeNull();
  if (!m) throw new Error("no mask");
  return m;
}

/** Is the cell containing plane point (x,y) flooded? */
function at(m: { data: Uint8Array; n: number; box: [number, number, number, number] }, x: number, y: number): boolean {
  const [x0, y0, x1, y1] = m.box;
  const i = Math.floor(((x - x0) / (x1 - x0)) * m.n);
  const j = Math.floor(((y - y0) / (y1 - y0)) * m.n);
  return m.data[j * m.n + i] === 1;
}
const count = (m: { data: Uint8Array }): number => m.data.reduce((s, v) => s + v, 0);

describe("criticalPieceMask (the Yoccoz critical piece, by flood fill)", () => {
  it("the basilica critical piece contains 0 but never the −1 lobe (pinch cuts hold)", () => {
    for (const depth of [0, 1, 2, 3]) {
      const m = mask(depth);
      expect(m).not.toBeNull();
      if (!m) return;
      expect(at(m, 0, 0)).toBe(true); // the critical point 0 is inside
      expect(at(m, -1, 0)).toBe(false); // the other lobe (around the −1 cycle point) is not
    }
  });

  it("the piece nests: it shrinks with depth and stays around the 0-disk", () => {
    const c0 = count(must(0));
    const c1 = count(must(1));
    const c2 = count(must(2));
    expect(c1).toBeLessThan(c0); // depth 1 cuts off the β side at α′
    expect(c2).toBeLessThan(c1);
    // by depth 1 the piece is the 0-disk: it no longer reaches β (≈ +1.618) or past α (≈ −0.618)
    const m1 = must(1);
    expect(at(m1, 1.4, 0)).toBe(false);
    expect(at(m1, -0.9, 0)).toBe(false);
  });

  it("returns null when the target is outside the region", () => {
    const puz = yoccozPuzzle(C, 1);
    if (!puz) throw new Error("no puzzle");
    const rays = puz.rayAngles.map((a) => dynamicRay(a, C, { depth: 500 }));
    expect(criticalPieceMask(C, 0.25, rays, [5, 5], BOX, N)).toBeNull(); // 5+5i escapes → not in region
  });
});

describe("parapuzzle critical piece (parameter plane, roots sealed)", () => {
  const PBOX: [number, number, number, number] = [-2.2, -1.4, 0.7, 1.4];
  /** Sealed parameter rays: each traced ray extended to its exact landing so the flood barrier reaches
   *  the root pinch on ∂M (parameter rays land at the wake roots only parabolically-slowly). */
  function pmask(depth: number) {
    const puz = yoccozPuzzle(C, depth); // C = −1 is in the 1/2-wake
    if (!puz) throw new Error("no puzzle");
    const q = puz.alphaAngles[0].q * 2 ** depth;
    const rays = puz.rayAngles.map((t) => {
      const ray = parameterRay(t, { depth: 500 });
      const land = parameterLanding(Math.round(t * q), q);
      if (land) ray.push([land.point[0], land.point[1]]);
      return ray;
    });
    const m = criticalPieceMask(C, G0 / 2 ** depth, rays, C, PBOX, N, true);
    if (!m) throw new Error("no mask");
    return m;
  }

  it("contains the parameter c = −1 but not the main cardioid (c = 0), sealed at the −3/4 root", () => {
    for (const depth of [0, 1, 2]) {
      const m = pmask(depth);
      expect(at(m, -1, 0)).toBe(true); // the parameter itself is inside its parapuzzle piece
      expect(at(m, 0, 0)).toBe(false); // c = 0 is outside the 1/2-wake — the seal stops the leak
    }
  });

  it("nests: the parapuzzle piece shrinks with depth", () => {
    expect(count(pmask(1))).toBeLessThan(count(pmask(0)));
    expect(count(pmask(2))).toBeLessThan(count(pmask(1)));
  });
});
