import { describe, it, expect } from "vitest";
import type { Complex } from "@cas/expr/complex";
import { findBranchPoints, type BranchBox } from "../src/riemann/branchPoints.js";

const csqrt = (z: Complex): Complex => {
  const r = Math.hypot(z[0], z[1]);
  const a = Math.atan2(z[1], z[0]) / 2;
  const s = Math.sqrt(r);
  return [s * Math.cos(a), s * Math.sin(a)];
};
const sq = (z: Complex): Complex => [z[0] * z[0] - z[1] * z[1], 2 * z[0] * z[1]];
/** The two sheets ±√(z²−1) — branch points at ±1. */
const rootZ2m1 = (z: Complex): Complex[] => {
  const w = csqrt([sq(z)[0] - 1, sq(z)[1]]);
  return [w, [-w[0], -w[1]]];
};
/** The two sheets ±√z — branch point at 0. */
const rootZ = (z: Complex): Complex[] => {
  const w = csqrt(z);
  return [w, [-w[0], -w[1]]];
};

const BOX: BranchBox = { xmin: -2, xmax: 2, ymin: -2, ymax: 2 };
const near = (pts: Complex[], target: Complex, tol: number): boolean =>
  pts.some((p) => Math.hypot(p[0] - target[0], p[1] - target[1]) < tol);

describe("findBranchPoints — sheet-merge scan (M3.4)", () => {
  it("√(z²−1): finds the two branch points at ±1", () => {
    const pts = findBranchPoints(rootZ2m1, BOX, { grid: 60 });
    expect(near(pts, [1, 0], 0.2)).toBe(true);
    expect(near(pts, [-1, 0], 0.2)).toBe(true);
    expect(pts.length).toBeLessThanOrEqual(4); // the two real branch points, no clutter
  });

  it("√z: finds the single branch point at the origin", () => {
    const pts = findBranchPoints(rootZ, BOX, { grid: 60 });
    expect(near(pts, [0, 0], 0.2)).toBe(true);
    expect(pts.length).toBeLessThanOrEqual(3);
  });

  it("two always-separated sheets have no branch points", () => {
    const twoFlat = (z: Complex): Complex[] => [z, [z[0] + 3, z[1]]]; // gap ≡ 3 everywhere
    expect(findBranchPoints(twoFlat, BOX, { grid: 40 })).toHaveLength(0);
  });

  it("a coverage hole (no sheets outside a disk) does not fake branch points at the edge", () => {
    const clipped = (z: Complex): Complex[] =>
      Math.hypot(z[0], z[1]) <= 1.5 ? rootZ2m1(z) : [];
    const pts = findBranchPoints(clipped, BOX, { grid: 60 });
    expect(near(pts, [1, 0], 0.2)).toBe(true);
    expect(near(pts, [-1, 0], 0.2)).toBe(true);
    expect(pts.length).toBeLessThanOrEqual(4); // no ring of spurious points at |z| = 1.5
  });

  it("a degenerate box yields nothing", () => {
    expect(findBranchPoints(rootZ, { xmin: 0, xmax: 0, ymin: -1, ymax: 1 })).toHaveLength(0);
  });
});
