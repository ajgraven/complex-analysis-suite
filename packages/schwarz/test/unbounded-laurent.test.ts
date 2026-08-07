import { describe, expect, it } from "vitest";
import {
  makeUnboundedLaurentSchwarz,
  escapeTime,
  pointInPolygon,
  type Complex,
  type UnboundedLaurentSchwarz,
} from "../src/index.js";

// Ground truth: the deltoid φ(z) = z + 1/(2 z²) — the classical unbounded-Laurent instance
// (c = 1, F₂ = ½). The golden identity σ(φ(z₀)) = conj(F(z₀)) pins the whole φ / φ⁻¹ / F / conj chain
// against hand-derivable values, and the branch tests pin the exterior-branch φ⁻¹ that σ needs.
const DELTOID = makeUnboundedLaurentSchwarz(1, [
  [0, 0],
  [0, 0],
  [0.5, 0],
]);

const boundary = (s: UnboundedLaurentSchwarz, n = 512): Complex[] => {
  const pts: Complex[] = [];
  for (let k = 0; k < n; k++) {
    const t = (2 * Math.PI * k) / n;
    pts.push(s.evalPhi([Math.cos(t), Math.sin(t)]));
  }
  return pts;
};

const near = (a: Complex, b: Complex, p = 9): void => {
  expect(a[0]).toBeCloseTo(b[0], p);
  expect(a[1]).toBeCloseTo(b[1], p);
};

const EXTERIOR: Complex[] = [
  [2, 0],
  [0, 2],
  [1.5, -1.3],
  [-2.4, 0.8],
];

describe("@cas/schwarz unbounded-Laurent σ (deltoid ground truth)", () => {
  it("evalPhi / evalF at known points", () => {
    near(DELTOID.evalPhi([1, 0]), [1.5, 0]); // cusp: 1 + 1/2
    near(DELTOID.evalPhi([2, 0]), [2.125, 0]); // 2 + 0.5/4
    near(DELTOID.evalPhi([0, 2]), [-0.125, 2]); // 2i + 0.5/(2i)²
    near(DELTOID.evalF([2, 0]), [2.5, 0]); // 0.5 + 2
    near(DELTOID.evalF([0, 2]), [-2, -0.5]); // 1/(2i) + 0.5(2i)²
  });

  it("evalPhiDeriv = 1 − 1/z³ (cusp at z = 1)", () => {
    near(DELTOID.evalPhiDeriv([1, 0]), [0, 0]);
    near(DELTOID.evalPhiDeriv([2, 0]), [0.875, 0]); // 1 − 1/8
  });

  it("σ(φ(z₀)) = conj(F(z₀)) — the exact round-trip identity", () => {
    for (const z0 of EXTERIOR) {
      const Fz0 = DELTOID.evalF(z0);
      const got = DELTOID.sigma(DELTOID.evalPhi(z0));
      expect(got).not.toBeNull();
      if (got) near(got, [Fz0[0], -Fz0[1]], 8);
    }
  });

  it("invertPhi returns the exterior branch |z| > 1 for w ∈ Ω", () => {
    const poly = boundary(DELTOID);
    const probes: Complex[] = [
      [1.2, 1.2],
      [-1.4, 0.6],
      [0.9, -1.5],
      [2.0, 0.3],
    ];
    for (const w of probes) {
      expect(pointInPolygon(w, poly)).toBe(false); // w ∈ Ω (exterior of K)
      const z = DELTOID.invertPhi(w);
      expect(z).not.toBeNull();
      if (z) {
        expect(Math.hypot(z[0], z[1])).toBeGreaterThan(1); // exterior branch
        near(DELTOID.evalPhi(z), w, 7); // a genuine preimage
      }
    }
  });

  it("escapeTime: origin ∈ K → fundamental at n = 0; a far point escapes", () => {
    const poly = boundary(DELTOID);
    const isInOmega = (w: Complex): boolean => !pointInPolygon(w, poly);
    expect(pointInPolygon([0, 0], poly)).toBe(true);
    const inK = escapeTime(DELTOID, isInOmega, [0, 0], { maxIter: 64, escapeR: 50 });
    expect(inK.kind).toBe("fundamental");
    expect(inK.n).toBe(0);
    const far = escapeTime(DELTOID, isInOmega, [100, 0], { maxIter: 64, escapeR: 50 });
    expect(far.kind).toBe("escaped");
  });
});
