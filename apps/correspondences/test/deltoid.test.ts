import { describe, expect, it } from "vitest";
import {
  DELTOID,
  deltoidBoundary,
  escapeTime,
  pointInPolygon,
  type Complex,
} from "../src/deltoid.js";

const near = (a: Complex, b: Complex, p = 9): void => {
  expect(a[0]).toBeCloseTo(b[0], p);
  expect(a[1]).toBeCloseTo(b[1], p);
};

// A curated corpus of z₀ on the exterior |z|>1, where the round-trip identity σ(φ(z₀)) = conj(F(z₀))
// holds exactly (φ⁻¹ recovers z₀). Pins the whole chain against hand-derivable values.
const EXTERIOR: Complex[] = [
  [2, 0],
  [0, 2],
  [1.5, -1.3],
  [-2.4, 0.8],
];

describe("deltoid φ(z) = z + 1/(2 z²)", () => {
  it("evalPhi at known points", () => {
    near(DELTOID.evalPhi([1, 0]), [1.5, 0]); // cusp:  1 + 1/2
    near(DELTOID.evalPhi([2, 0]), [2.125, 0]); // 2 + 0.5/4
    near(DELTOID.evalPhi([0, 2]), [-0.125, 2]); // 2i + 0.5/(2i)² = 2i − 0.125
  });

  it("evalPhiDeriv = 1 − 1/z³ (cusps at the cube roots of unity)", () => {
    near(DELTOID.evalPhiDeriv([1, 0]), [0, 0]); // φ'(1) = 0 → cusp
    near(DELTOID.evalPhiDeriv([2, 0]), [0.875, 0]); // 1 − 1/8
    const omega: Complex = [Math.cos((2 * Math.PI) / 3), Math.sin((2 * Math.PI) / 3)];
    near(DELTOID.evalPhiDeriv(omega), [0, 0]); // another cube root of unity → cusp
  });

  it("evalF (Schwarz extension) = 1/z + 0.5 z²", () => {
    near(DELTOID.evalF([1, 0]), [1.5, 0]); // 1 + 0.5
    near(DELTOID.evalF([2, 0]), [2.5, 0]); // 0.5 + 2
    near(DELTOID.evalF([0, 2]), [-2, -0.5]); // 1/(2i) + 0.5(2i)² = −0.5i − 2
  });
});

describe("deltoid Newton inverse + Schwarz reflection σ = conj ∘ F ∘ φ⁻¹", () => {
  it("invertPhi round-trips φ on the exterior |z|>1", () => {
    for (const z0 of EXTERIOR) {
      const back = DELTOID.invertPhi(DELTOID.evalPhi(z0));
      expect(back).not.toBeNull();
      if (back) near(back, z0, 8);
    }
  });

  it("σ(φ(z₀)) = conj(F(z₀)) — the exact round-trip identity", () => {
    for (const z0 of EXTERIOR) {
      const Fz0 = DELTOID.evalF(z0);
      const expected: Complex = [Fz0[0], -Fz0[1]];
      const got = DELTOID.sigma(DELTOID.evalPhi(z0));
      expect(got).not.toBeNull();
      if (got) near(got.value, expected, 8);
    }
  });

  it("σ carries a warm seed and maps boundary points to finite values", () => {
    const z: Complex = [Math.cos(0.7), Math.sin(0.7)];
    const got = DELTOID.sigma(DELTOID.evalPhi(z));
    expect(got).not.toBeNull();
    if (got) expect(Number.isFinite(got.value[0]) && Number.isFinite(got.value[1])).toBe(true);
  });
});

describe("deltoid boundary + escape-time classification", () => {
  it("the boundary passes through the cusp φ(1) = 1.5", () => {
    near(deltoidBoundary(512)[0], [1.5, 0]); // k=0 → θ=0 → φ(1)
  });

  it("the origin lies in K (inside the deltoid) → not in Ω → fundamental at n=0", () => {
    const poly = deltoidBoundary(512);
    expect(pointInPolygon([0, 0], poly)).toBe(true);
    const isInOmega = (w: Complex): boolean => !pointInPolygon(w, poly);
    const r = escapeTime(DELTOID, isInOmega, [0, 0], { maxIter: 64, escapeR: 50 });
    expect(r.kind).toBe("fundamental");
    expect(r.n).toBe(0);
  });

  it("a point far outside the deltoid escapes toward infinity", () => {
    const poly = deltoidBoundary(512);
    const isInOmega = (w: Complex): boolean => !pointInPolygon(w, poly);
    const r = escapeTime(DELTOID, isInOmega, [100, 0], { maxIter: 64, escapeR: 50 });
    expect(r.kind).toBe("escaped");
  });

  // Branch-correctness of φ⁻¹: σ needs the |z|>1 preimage. A warm-seeded Newton can drift onto an
  // interior preimage of the degree-3 inverse, corrupting the orbit into a fake bounded set — which
  // showed up as spurious non-escaping "wings" filling ~20% of the σ dynamical plane. These pin the fix.
  it("invertPhi always returns the exterior branch |z|>1 for w ∈ Ω", () => {
    const probes: Complex[] = [
      [1.2, 1.2],
      [-1.4, 0.6],
      [0.9, -1.5],
      [-1.7, -0.9],
      [2.0, 0.3],
    ];
    const poly = deltoidBoundary(512);
    for (const w of probes) {
      expect(pointInPolygon(w, poly)).toBe(false); // w is in Ω
      const z = DELTOID.invertPhi(w);
      expect(z).not.toBeNull();
      if (z) {
        expect(Math.hypot(z[0], z[1])).toBeGreaterThan(1); // exterior branch
        near(DELTOID.evalPhi(z), w, 7); // and a genuine preimage
      }
    }
  });

  it("the σ dynamical plane has no bulk non-escaping region (branch-correct φ⁻¹)", () => {
    const poly = deltoidBoundary(200);
    const isInOmega = (w: Complex): boolean => !pointInPolygon(w, poly);
    const N = 60;
    const halfSpan = 2.1;
    let inOmega = 0;
    let interior = 0;
    for (let py = 0; py < N; py++) {
      const wy = (0.5 - py / N) * 2 * halfSpan;
      for (let px = 0; px < N; px++) {
        const wx = (px / N - 0.5) * 2 * halfSpan;
        const w: Complex = [wx, wy];
        if (!isInOmega(w)) continue;
        inOmega++;
        const r = escapeTime(DELTOID, isInOmega, w, { maxIter: 80, escapeR: 40 });
        if (r.kind === "interior" || r.kind === "invalid") interior++;
      }
    }
    // The true non-escaping set is a measure-zero fractal; well under 1% of sampled Ω should linger.
    expect(interior / inOmega).toBeLessThan(0.01);
  });
});
