// QD.Sym power sums / coordinate moments (roadmap #9): trace(Mᵥᵏ) over the quotient R/I of a
// zero-dim ideal = Σ_{p∈V(I)} v(p)ᵏ (Stickelberger), Newton's identities → the coordinate's
// univariate characteristic polynomial. Exact ℚ(i) goldens + an evaluate-on-the-solutions oracle.
import { describe, it, expect } from "vitest";
import _QD from "../app/solvers/solver.mjs";
import "../app/sym/sym-core.mjs";
import "../app/analysis/faber-analysis.mjs"; // registers QD.FaberAnalysis.polynomialRoots (the eigen-solver's root finder)

const S: any = (_QD as any).Sym;
const { MPoly, Gaussian, monomialOrder, buchberger, multiplicationMatrix, powerSums,
        newtonToElementary, charPolyByTraces, coordinateMoments, solveByEigenvalues } = S;
const V = (n: string) => MPoly.variable(n);
const I = (k: number) => MPoly.fromInt(k);
const re = (g: any) => g.toComplex().re;
const im = (g: any) => g.toComplex().im;
// ascending Gaussian coeff array → [{re,im}…]
const cx = (arr: any[]) => arr.map((g: any) => ({ re: re(g), im: im(g) }));
const closeCx = (a: any, b: any, tol = 1e-9) => Math.abs(a.re - b.re) < tol && Math.abs(a.im - b.im) < tol;
const Mof = (gens: any[], vars: string[], v: string) =>
  multiplicationMatrix(buchberger(gens, monomialOrder("grevlex", vars)), monomialOrder("grevlex", vars), vars, v).M;

describe("QD.Sym power sums (trace of Mᵥᵏ)", () => {
  it("⟨x²−1, y²−1⟩, coordinate x: values {1,1,−1,−1} → p = [4, 0, 4, 0, 4]", () => {
    const M = Mof([V("x").pow(2).sub(I(1)), V("y").pow(2).sub(I(1))], ["x", "y"], "x");
    const p = powerSums(M, 4).map(re);
    expect(p).toEqual([4, 0, 4, 0, 4]);
  });

  it("charPolyByTraces(M_x) for ⟨x²−1,y²−1⟩ = (λ²−1)² = λ⁴ − 2λ² + 1", () => {
    const M = Mof([V("x").pow(2).sub(I(1)), V("y").pow(2).sub(I(1))], ["x", "y"], "x");
    expect(charPolyByTraces(M).map(re)).toEqual([1, 0, -2, 0, 1]);
  });

  it("⟨x²+1⟩ (roots ±i): p = [2, 0, −2, 0, 2], char = λ²+1", () => {
    const M = Mof([V("x").pow(2).add(I(1))], ["x"], "x");
    expect(powerSums(M, 4).map(re)).toEqual([2, 0, -2, 0, 2]);
    expect(charPolyByTraces(M).map(re)).toEqual([1, 0, 1]);
  });

  it("⟨x²−i⟩ (a COMPLEX moment): p₂ = Σx² = 2i, char = λ² − i", () => {
    const M = Mof([V("x").pow(2).sub(MPoly.constant(Gaussian.I))], ["x"], "x");
    const p = powerSums(M, 2);
    expect([re(p[0]), re(p[1]), im(p[1])]).toEqual([2, 0, 0]);
    expect(closeCx(p[2].toComplex(), { re: 0, im: 2 })).toBe(true);   // p₂ = 2i
    expect(cx(charPolyByTraces(M)).map((c) => [c.re, c.im])).toEqual([[0, -1], [0, 0], [1, 0]]); // λ² − i
  });

  it("newtonToElementary matches the known symmetric functions of {1,1,−1,−1}", () => {
    // e = [1, e1=0, e2=−2, e3=0, e4=1]  (Π(λ−vᵢ) coeffs, up to sign)
    const p = [4, 0, 4, 0, 4].map((k) => Gaussian.fromInt(k));
    expect(newtonToElementary(p, 4).map(re)).toEqual([1, 0, -2, 0, 1]);
  });
});

describe("QD.Sym coordinateMoments (QD-facing) + evaluate-on-solutions oracle", () => {
  it("cross-checks trace-moments against Σ v(pᵢ)ᵏ on the numerically-solved points", () => {
    // Distinct simple roots (radical): x²=x+1 (golden ratio φ,ψ), y=x². Two points (φ,φ²),(ψ,ψ²);
    // the x-power-sums are the Lucas numbers L = [2,1,3,4,7,…] — nonzero odd moments, a real check.
    const sys = [V("x").pow(2).sub(V("x")).sub(I(1)), V("y").sub(V("x").pow(2))];
    const sol = solveByEigenvalues(sys, { vars: ["x", "y"] });
    expect(sol.ok).toBe(true);
    // x-moments are exactly the Lucas numbers L₀..L₄ = 2,1,3,4,7 (φᵏ+ψᵏ).
    const xm = coordinateMoments(sys, "x", 4, { vars: ["x", "y"] });
    [2, 1, 3, 4, 7].forEach((L, k) => expect(closeCx(xm.moments[k], { re: L, im: 0 }, 1e-9)).toBe(true));
    for (const v of ["x", "y"]) {
      const mm = coordinateMoments(sys, v, 4, { vars: ["x", "y"] });
      expect(mm.ok).toBe(true);
      expect(mm.D).toBe(sol.solutions.length);
      for (let k = 0; k <= 4; k++) {
        // Σ over solutions of (v-coordinate)^k, evaluated numerically
        let sr = 0, si = 0;
        for (const s of sol.solutions) {
          let pr = 1, pi = 0;
          for (let j = 0; j < k; j++) { const nr = pr * s[v].re - pi * s[v].im, ni = pr * s[v].im + pi * s[v].re; pr = nr; pi = ni; }
          sr += pr; si += pi;
        }
        expect(closeCx(mm.moments[k], { re: sr, im: si }, 1e-6)).toBe(true);
      }
    }
  });

  it("rejects a non-ambient coordinate and a positive-dimensional system", () => {
    expect(coordinateMoments([V("x").pow(2).sub(I(1))], "z", 3, { vars: ["x"] }).ok).toBe(false);
    expect(coordinateMoments([V("x").mul(V("y"))], "x", 3, { vars: ["x", "y"] }).ok).toBe(false); // dim 1
  });
});
