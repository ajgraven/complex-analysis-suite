// Exterior SC forward map (Faber M1b) — validated against the closed-form regular n-gon, whose exterior
// map is known exactly (prevertices = n-th roots of unity, interior angle α = (n−2)/n; M0 spike). The
// integrand's exterior exponent 1 − α and the u^{-2} pole must reproduce: equal side lengths, closure
// (Σ Sₖ = 0 by the no-log-at-∞ constraint), correct interior angles, and — the hard check — the capacity
// against the Γ(1/4) closed form for the square.
import { describe, expect, it } from "vitest";
import type { C } from "../src/vandermondeArnoldi.js";
import { buildExteriorForwardMap, exteriorSideIntegrals } from "../src/exteriorSchwarzChristoffel.js";

const cabs = (z: C): number => Math.hypot(z[0], z[1]);
const rootsOfUnity = (n: number): C[] => Array.from({ length: n }, (_, k): C => [Math.cos((2 * Math.PI * k) / n), Math.sin((2 * Math.PI * k) / n)]);
const regularAngles = (n: number): number[] => Array(n).fill((n - 2) / n);

describe("exteriorSideIntegrals — regular n-gon", () => {
  it("gives equal side lengths and closes (Σ Sₖ ≈ 0) for n = 3,4,5,6", () => {
    for (const n of [3, 4, 5, 6]) {
      const S = exteriorSideIntegrals(rootsOfUnity(n), regularAngles(n));
      const lens = S.map(cabs);
      const meanLen = lens.reduce((a, b) => a + b, 0) / n;
      for (const L of lens) expect(Math.abs(L - meanLen) / meanLen).toBeLessThan(1e-6); // equal sides
      const sum: C = S.reduce((a, b): C => [a[0] + b[0], a[1] + b[1]], [0, 0]);
      expect(cabs(sum)).toBeLessThan(1e-6 * meanLen); // closure ⇒ no-log constraint holds
    }
  });

  it("turns by the exterior angle 2π/n at each vertex (⇒ interior angle (n−2)π/n)", () => {
    for (const n of [3, 4, 6]) {
      const S = exteriorSideIntegrals(rootsOfUnity(n), regularAngles(n));
      for (let k = 0; k < n; k++) {
        const a = S[k];
        const b = S[(k + 1) % n];
        let turn = Math.atan2(b[1], b[0]) - Math.atan2(a[1], a[0]);
        while (turn <= -Math.PI) turn += 2 * Math.PI;
        while (turn > Math.PI) turn -= 2 * Math.PI;
        expect(Math.abs(Math.abs(turn) - (2 * Math.PI) / n)).toBeLessThan(1e-4);
      }
    }
  });
});

describe("buildExteriorForwardMap — capacity golden", () => {
  it("square capacity = |C| = 1 gives the Γ(1/4) side length", () => {
    // cap(square, side s) = s·Γ(1/4)²/(4π^{3/2}); with C = 1 ⇒ side = 1/κ₄.
    const GAMMA_QUARTER = 3.625609908;
    const kappa4 = (GAMMA_QUARTER * GAMMA_QUARTER) / (4 * Math.pow(Math.PI, 1.5));
    const sideExpected = 1 / kappa4; // ≈ 1.6944
    const m = buildExteriorForwardMap(rootsOfUnity(4), regularAngles(4)); // C defaults to [1,0] ⇒ capacity 1
    expect(m.capacity).toBeCloseTo(1, 12);
    const sideLen = cabs(m.sides[0]); // |Sₖ| with |C| = 1 is the polygon side length
    expect(Math.abs(sideLen - sideExpected)).toBeLessThan(2e-3);
  });

  it("recovers C from target vertices and reproduces them exactly", () => {
    // The map's natural square (capacity 1), then a similarity of it (scale·rotate·translate) as the
    // target: with the same prevertices, C = (v₁−v₀)/S₀ must recover that similarity and rebuild all four
    // target vertices — the forward map's defining property. (Uses the map's own orientation, so this is
    // independent of the exterior CW-vs-CCW traversal convention.)
    const m0 = buildExteriorForwardMap(rootsOfUnity(4), regularAngles(4));
    const scale = 1.7;
    const rot: C = [Math.cos(0.3), Math.sin(0.3)];
    const xform = (v: C): C => {
      const sx = scale * v[0];
      const sy = scale * v[1];
      return [sx * rot[0] - sy * rot[1] + 0.5, sx * rot[1] + sy * rot[0] - 0.2];
    };
    const target = m0.vertices.map(xform);
    const m = buildExteriorForwardMap(rootsOfUnity(4), regularAngles(4), { targetVertices: target });
    for (let k = 0; k < 4; k++) expect(cabs([m.vertices[k][0] - target[k][0], m.vertices[k][1] - target[k][1]])).toBeLessThan(1e-9);
  });
});
