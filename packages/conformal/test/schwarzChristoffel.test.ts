import { describe, expect, it } from "vitest";
import type { C } from "../src/vandermondeArnoldi.js";
import { buildForwardMap } from "../src/schwarzChristoffel.js";

// Regular-n-gon circumradii with f′(0)=1 (research-notes §6); nearest-double forms.
const NGON_R: Record<number, number> = {
  3: 1.7666387502854475,
  4: 1.3110287771460598,
  5: 1.174450160620581,
  6: 1.1129126745223055,
};

const rootsOfUnity = (n: number, rot = 0): C[] =>
  Array.from({ length: n }, (_, k): C => {
    const t = rot + (2 * Math.PI * k) / n;
    return [Math.cos(t), Math.sin(t)];
  });

describe("Schwarz–Christoffel forward map (given prevertices)", () => {
  it("maps the disk onto a regular n-gon — circumradius, regularity, centre", () => {
    for (const n of [3, 4, 5, 6]) {
      const pv = rootsOfUnity(n);
      const angles = pv.map(() => (n - 2) / n); // interior angle π(n−2)/n ⇒ α = (n−2)/n
      const map = buildForwardMap(pv, angles); // default C=1, A=0 ⇒ f′(0)=1

      // vertex 0 = image of prevertex w=1: real, at the circumradius Rₙ
      expect(map.vertices[0][0]).toBeCloseTo(NGON_R[n], 10);
      expect(map.vertices[0][1]).toBeCloseTo(0, 10);

      // every vertex lies at radius Rₙ, equally spaced by 2π/n — a regular polygon
      for (let k = 0; k < n; k++) {
        expect(Math.hypot(map.vertices[k][0], map.vertices[k][1])).toBeCloseTo(NGON_R[n], 10);
        const ang = Math.atan2(map.vertices[k][1], map.vertices[k][0]);
        expect(Math.cos(ang)).toBeCloseTo(Math.cos((2 * Math.PI * k) / n), 9);
        expect(Math.sin(ang)).toBeCloseTo(Math.sin((2 * Math.PI * k) / n), 9);
      }

      // the conformal centre maps to the polygon centre, and forward(w=1) agrees with vertex 0
      const centre = map.forward([0, 0]);
      expect(Math.hypot(centre[0], centre[1])).toBeCloseTo(0, 10);
      const f1 = map.forward([1, 0]);
      expect(f1[0]).toBeCloseTo(NGON_R[n], 10);
      expect(f1[1]).toBeCloseTo(0, 10);
    }
  });

  it("maps the disk onto the square [−1,1]² with conformal radius 2/K(1/√2)", () => {
    const pv = rootsOfUnity(4, Math.PI / 4); // e^{iπ/4}, e^{i3π/4}, e^{i5π/4}, e^{i7π/4}
    const angles = pv.map(() => 0.5); // right angles
    const corners: C[] = [
      [1, -1], // 1 − i
      [1, 1], // 1 + i
      [-1, 1], // −1 + i
      [-1, -1], // −1 − i
    ];
    const map = buildForwardMap(pv, angles, { targetVertices: corners });

    // conformal radius |f′(0)| = |C| = 2/K(1/√2)
    expect(Math.hypot(map.constant[0], map.constant[1])).toBeCloseTo(1.0787052023767587, 9);
    // the square is centred at the origin
    expect(Math.hypot(map.center[0], map.center[1])).toBeCloseTo(0, 9);
    // every prevertex maps to its corner
    for (let k = 0; k < 4; k++) {
      const z = map.forward(pv[k]);
      expect(z[0]).toBeCloseTo(corners[k][0], 9);
      expect(z[1]).toBeCloseTo(corners[k][1], 9);
    }
    // Cook's edge midpoint: g(1) = −i (the bottom edge of the square)
    const edge = map.forward([1, 0]);
    expect(edge[0]).toBeCloseTo(0, 9);
    expect(edge[1]).toBeCloseTo(-1, 9);
  });
});
