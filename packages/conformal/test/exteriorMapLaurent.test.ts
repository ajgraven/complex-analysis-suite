// Laurent-at-∞ extractor (Faber M1b, step 3). The extracted {c, laurent} must reproduce the closed-form
// regular n-gon (M1a): for the unit-capacity square, laurent[3] = 1/6 and only indices ≡ −1 (mod n) are
// non-zero; and the general chiral-polygon extraction must re-evaluate to φ(∂𝔻) tracing the polygon.
import { describe, expect, it } from "vitest";
import type { C } from "../src/vandermondeArnoldi.js";
import { buildExteriorForwardMap, exteriorMapLaurentAtInfinity } from "../src/exteriorSchwarzChristoffel.js";
import { fitExteriorSchwarzChristoffel } from "../src/exteriorScParameterProblem.js";

const near = (a: number, b: number, tol = 1e-9): boolean => Math.abs(a - b) < tol;
const rootsOfUnity = (n: number): C[] => Array.from({ length: n }, (_, k): C => [Math.cos((2 * Math.PI * k) / n), Math.sin((2 * Math.PI * k) / n)]);
const regularAngles = (n: number): number[] => Array(n).fill((n - 2) / n);

// φ(z) = c·z + Σ_k laurent[k] z^{−k}, evaluated for |z| ≥ 1.
function evalPhi(c: number, laurent: readonly C[], z: C): C {
  let re = c * z[0];
  let im = c * z[1];
  const d = z[0] * z[0] + z[1] * z[1];
  let zk: C = [1, 0]; // z^{−k}
  const iz: C = [z[0] / d, -z[1] / d];
  for (let k = 0; k < laurent.length; k++) {
    if (k > 0) zk = [zk[0] * iz[0] - zk[1] * iz[1], zk[0] * iz[1] + zk[1] * iz[0]];
    re += laurent[k][0] * zk[0] - laurent[k][1] * zk[1];
    im += laurent[k][0] * zk[1] + laurent[k][1] * zk[0];
  }
  return [re, im];
}

describe("exteriorMapLaurentAtInfinity — regular n-gon reproduces the M1a closed form", () => {
  it("square (capacity 1): laurent[3] = 1/6, lower entries 0, only k ≡ 3 (mod 4) non-zero", () => {
    const m = buildExteriorForwardMap(rootsOfUnity(4), regularAngles(4)); // C = [1,0] ⇒ capacity 1
    const { c, laurent } = exteriorMapLaurentAtInfinity(m, 20);
    expect(near(c, 1)).toBe(true);
    expect(near(laurent[0][0], 0) && near(laurent[1][0], 0) && near(laurent[2][0], 0)).toBe(true);
    expect(near(laurent[3][0], 1 / 6) && near(laurent[3][1], 0)).toBe(true);
    for (let k = 1; k < laurent.length; k++) {
      if ((k + 1) % 4 !== 0) expect(near(laurent[k][0], 0) && near(laurent[k][1], 0)).toBe(true);
    }
  });

  it("triangle & hexagon: capacity 1, only k ≡ −1 (mod n) non-zero", () => {
    for (const n of [3, 6]) {
      const { c, laurent } = exteriorMapLaurentAtInfinity(buildExteriorForwardMap(rootsOfUnity(n), regularAngles(n)), 24);
      expect(near(c, 1)).toBe(true);
      for (let k = 1; k < laurent.length; k++) {
        if ((k + 1) % n !== 0) expect(near(laurent[k][0], 0) && near(laurent[k][1], 0)).toBe(true);
      }
    }
  });
});

describe("exteriorMapLaurentAtInfinity — general polygon boundary", () => {
  it("chiral quadrilateral: φ(∂𝔻) from {c, laurent} traces a polygon of the right diameter", () => {
    const quad: C[] = [[2, 0], [0.6, 1.2], [-1, 0.4], [-0.3, -1.1]];
    const m = fitExteriorSchwarzChristoffel(quad);
    const { c, laurent } = exteriorMapLaurentAtInfinity(m, 160);
    expect(c).toBeCloseTo(m.capacity, 12);
    // Trace ∂K = φ(unit circle) and compare its diameter to the fitted polygon's diameter (rotation- and
    // translation-invariant: laurent is centred + rotated, so only the SIZE is directly comparable).
    const diam = (pts: readonly C[]): number => {
      let d = 0;
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) d = Math.max(d, Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]));
      return d;
    };
    const boundary: C[] = Array.from({ length: 400 }, (_, i) => evalPhi(c, laurent, [Math.cos((2 * Math.PI * i) / 400), Math.sin((2 * Math.PI * i) / 400)]));
    expect(Math.abs(diam(boundary) - diam(m.vertices)) / diam(m.vertices)).toBeLessThan(2e-3);
  });
});
