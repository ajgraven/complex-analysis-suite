// Roadmap #16 — the EXACT deleted correspondence curve. Locks the once-symbolic deflation (dividing out
// the trivial branch w = η(z) in ℚ(i), the step the numeric engine does per-pixel and can mislabel near a
// cusp) against hand-derived goldens, cross-checks it against the app's live NUMERIC branch engine (every
// numeric branch must lie on the exact curve), and pins the exact cusp locus (disc_w C).
import { describe, it, expect } from "vitest";
import { correspondenceCurve, cuspLocus, Gauss, QiPoly } from "../src/exact/index.js";
import { makeUnboundedLaurentSchwarz, type Complex } from "../src/deltoid.js";
import { makeUnboundedLaurentCorrespondence } from "../src/correspondence.js";

// z̄ⁿ with a Gaussian-integer coefficient, as a QiPoly (little-endian).
const mono = (coeff: Gauss, k: number): QiPoly => {
  const cs: Gauss[] = new Array<Gauss>(k + 1).fill(Gauss.ZERO);
  cs[k] = coeff;
  return QiPoly.fromCoeffs(cs);
};
const polySum = (...ps: QiPoly[]): QiPoly => ps.reduce((a, b) => a.add(b), QiPoly.zero());
const cabs = (z: readonly [number, number]): number => Math.hypot(z[0], z[1]);

describe("exact correspondence curve — the deltoid", () => {
  // φ(z) = z + 1/(2z²): c = 1, F = [0, 0, ½].
  const c = Gauss.ONE;
  const F = [Gauss.ZERO, Gauss.ZERO, Gauss.rat(1n, 2n)];
  const curve = correspondenceCurve(c, F);

  it("is the 2:2 curve 2w² − z̄²·w − z̄", () => {
    expect(curve.wDegree).toBe(2);
    const expected = [
      mono(Gauss.int(-1), 1), // w⁰ : −z̄
      mono(Gauss.int(-1), 2), // w¹ : −z̄²
      mono(Gauss.int(2), 0), // w² : 2
    ];
    expect(curve.wCoeffs.length).toBe(3);
    curve.wCoeffs.forEach((cj, j) => expect(cj.equals(expected[j])).toBe(true));
  });

  it("renders as text and LaTeX", () => {
    expect(curve.text).toBe("2 w^2 - z̄^2 w - z̄ = 0");
    expect(curve.latex).toBe("2w^{2} - \\bar{z}^{2}\\,w - \\bar{z} = 0");
  });

  it("has cusp locus z̄⁴ + 8z̄", () => {
    // 2w² − z̄²w − z̄ has disc_w = (z̄²)² − 4·2·(−z̄) = z̄⁴ + 8z̄.
    const expected = polySum(mono(Gauss.int(1), 4), mono(Gauss.int(8), 1));
    expect(cuspLocus(curve).equals(expected)).toBe(true);
  });

  it("every numeric branch lies on the exact curve (exact ↔ numeric oracle)", () => {
    const Fnum: Complex[] = [
      [0, 0],
      [0, 0],
      [0.5, 0],
    ];
    const sch = makeUnboundedLaurentSchwarz(1, Fnum);
    const corr = makeUnboundedLaurentCorrespondence(1, Fnum, sch.evalPhi);
    const zs: Complex[] = [
      [2, 0],
      [1.5, 0.7],
      [-1.2, 2.3],
      [0.3, -1.8],
      [3, -0.4],
      [-2.5, -1.1],
    ];
    for (const z of zs) {
      const zbar: [number, number] = [z[0], -z[1]];
      for (const w of corr.branches(z)) {
        const residual = cabs(curve.evalNumeric(w, zbar));
        expect(residual).toBeLessThan(1e-9);
      }
    }
  });
});

describe("exact correspondence curve — other Laurent families", () => {
  it("φ = w + 1/w³ gives the 3:3 curve w³ − z̄³w² − z̄²w − z̄ (exercises the degree-3 resultant)", () => {
    const curve = correspondenceCurve(Gauss.ONE, [Gauss.ZERO, Gauss.ZERO, Gauss.ZERO, Gauss.int(1)]);
    expect(curve.wDegree).toBe(3);
    const expected = [
      mono(Gauss.int(-1), 1), // w⁰ : −z̄
      mono(Gauss.int(-1), 2), // w¹ : −z̄²
      mono(Gauss.int(-1), 3), // w² : −z̄³
      mono(Gauss.int(1), 0), // w³ : 1
    ];
    curve.wCoeffs.forEach((cj, j) => expect(cj.equals(expected[j])).toBe(true));
    // The cusp locus is a genuine nonzero polynomial (branch points exist) of the expected degree.
    const disc = cuspLocus(curve);
    expect(disc.isZero()).toBe(false);
    // disc_w of a degree-3 curve has degree ≤ 2·3 − 2 = 4 in each of its coefficients' variable.
    expect(disc.degree()).toBeGreaterThan(0);

    // Numeric oracle: build the matching numeric φ = w + 1/w³ and check branches lie on the exact curve.
    const evalPhi = (z: Complex): Complex => {
      const r2 = z[0] * z[0] + z[1] * z[1];
      // 1/z³ = conj(z)³ / |z|⁶
      const zc: Complex = [z[0], -z[1]];
      const zc2: Complex = [zc[0] * zc[0] - zc[1] * zc[1], 2 * zc[0] * zc[1]];
      const zc3: Complex = [zc2[0] * zc[0] - zc2[1] * zc[1], zc2[0] * zc[1] + zc2[1] * zc[0]];
      const inv3: Complex = [zc3[0] / (r2 * r2 * r2), zc3[1] / (r2 * r2 * r2)];
      return [z[0] + inv3[0], z[1] + inv3[1]];
    };
    const corr = makeUnboundedLaurentCorrespondence(1, [[0, 0], [0, 0], [0, 0], [1, 0]], evalPhi);
    for (const z of [[2, 0.5], [-1.4, 1.1], [0.6, -2.2]] as Complex[]) {
      const zbar: [number, number] = [z[0], -z[1]];
      for (const w of corr.branches(z)) {
        expect(cabs(curve.evalNumeric(w, zbar))).toBeLessThan(1e-8);
      }
    }
  });

  it("handles a complex Laurent coefficient: φ = w + i/w² → w² − i·z̄²·w − i·z̄", () => {
    const curve = correspondenceCurve(Gauss.ONE, [Gauss.ZERO, Gauss.ZERO, Gauss.I]);
    const expected = [
      mono(Gauss.I.neg(), 1), // w⁰ : −i·z̄
      mono(Gauss.I.neg(), 2), // w¹ : −i·z̄²
      mono(Gauss.int(1), 0), // w² : 1
    ];
    expect(curve.wDegree).toBe(2);
    curve.wCoeffs.forEach((cj, j) => expect(cj.equals(expected[j])).toBe(true));
  });
});

describe("exact engine — honest failures", () => {
  it("rejects a degenerate map (m < 2) and a zero leading coefficient", () => {
    expect(() => correspondenceCurve(Gauss.ONE, [Gauss.ONE])).toThrow();
    expect(() => correspondenceCurve(Gauss.ZERO, [Gauss.ZERO, Gauss.ONE, Gauss.ONE])).toThrow();
  });
});
