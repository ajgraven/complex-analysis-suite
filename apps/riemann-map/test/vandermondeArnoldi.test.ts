import { describe, expect, it } from "vitest";
import { arnoldiBasis, evalArnoldi, evalExpansion, type C } from "../src/solve/vandermondeArnoldi.js";
import { lstsqHouseholder } from "../src/solve/lstsq.js";

function circle(m: number, r = 1): C[] {
  return Array.from({ length: m }, (_, j): C => {
    const t = (2 * Math.PI * j) / m;
    return [r * Math.cos(t), r * Math.sin(t)];
  });
}

describe("Vandermonde–Arnoldi basis (P3a)", () => {
  it("produces column-orthonormal Q under the discrete inner product", () => {
    const z = circle(200, 1.3);
    const { Q, n } = arnoldiBasis(z, 12);
    for (let j = 0; j <= n; j++) {
      for (let l = 0; l <= n; l++) {
        let re = 0;
        let im = 0;
        for (let i = 0; i < z.length; i++) {
          re += Q[i][j][0] * Q[i][l][0] + Q[i][j][1] * Q[i][l][1]; // Re⟨q_j, q_l⟩
          im += Q[i][j][0] * Q[i][l][1] - Q[i][j][1] * Q[i][l][0]; // Im⟨q_j, q_l⟩
        }
        expect(re).toBeCloseTo(j === l ? 1 : 0, 8);
        expect(im).toBeCloseTo(0, 8);
      }
    }
  });

  it("reproduces a low-degree polynomial exactly (fit z², evaluate off the sample set)", () => {
    const z = circle(200, 1);
    const basis = arnoldiBasis(z, 8);
    // Fit coeffs so Σ c_k p_k(z_j) = z_j² by complex least squares (split into real blocks).
    const target: C[] = z.map((w): C => [w[0] * w[0] - w[1] * w[1], 2 * w[0] * w[1]]);
    const V = evalArnoldi(basis, z); // = Q
    const n1 = basis.n + 1;
    // Real system for complex unknowns c = a + i b:
    //   Re(V c) = Re(target):  Re(V)·a − Im(V)·b
    //   Im(V c) = Im(target):  Im(V)·a + Re(V)·b
    const rows = 2 * z.length;
    const A: number[][] = new Array(rows);
    const rhs: number[] = new Array(rows);
    for (let j = 0; j < z.length; j++) {
      const r1 = new Array<number>(2 * n1).fill(0);
      const r2 = new Array<number>(2 * n1).fill(0);
      for (let k = 0; k < n1; k++) {
        r1[k] = V[j][k][0];
        r1[n1 + k] = -V[j][k][1];
        r2[k] = V[j][k][1];
        r2[n1 + k] = V[j][k][0];
      }
      A[j] = r1;
      rhs[j] = target[j][0];
      A[z.length + j] = r2;
      rhs[z.length + j] = target[j][1];
    }
    const x = lstsqHouseholder(A, rhs);
    const coeffs: C[] = [];
    for (let k = 0; k < n1; k++) coeffs.push([x[k], x[n1 + k]]);
    const test: C[] = [[0.3, -0.4], [0.5, 0.5]];
    const got = evalExpansion(basis, coeffs, test);
    for (let i = 0; i < test.length; i++) {
      const z2: C = [test[i][0] * test[i][0] - test[i][1] * test[i][1], 2 * test[i][0] * test[i][1]];
      expect(got[i][0]).toBeCloseTo(z2[0], 6);
      expect(got[i][1]).toBeCloseTo(z2[1], 6);
    }
  });
});
