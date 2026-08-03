// QD.Sym.solveRealCertified (roadmap #4): certified real solving = RUR (self-certifying univariate
// rep) + exact Sturm real-root isolation + rigorous interval evaluation of the coordinate maps.
// Returns a rational isolating BOX per coordinate — no floating-point eigenvalue step, so it never
// merges a clustered real root. Goldens: exact rational solutions, rigorous brackets for irrationals,
// near-coincident-root separation, an empty real set, and a cross-check against solveByEigenvalues.
import { describe, it, expect } from "vitest";
import _QD from "../app/solvers/solver.mjs";
import "../app/sym/sym-core.mjs";
import "../app/analysis/faber-analysis.mjs"; // registers the eigen-solver's root finder for the cross-check

const S: any = (_QD as any).Sym;
const { MPoly, solveRealCertified, solveByEigenvalues } = S;
const V = (n: string) => MPoly.variable(n);
const I = (k: number) => MPoly.fromInt(k);
// a {lo,hi} Rational box: does it (rigorously) contain x? and how wide (as a double)?
const contains = (box: any, x: number, tol = 0) => box.lo.toNumber() <= x + tol && x - tol <= box.hi.toNumber();
const width = (box: any) => box.hi.toNumber() - box.lo.toNumber();

describe("QD.Sym.solveRealCertified (RUR + Sturm)", () => {
  it("exact rational solutions: ⟨x²−1, y²−1⟩ → 4 point-boxes = {±1}², im = [0,0]", () => {
    const r = solveRealCertified([V("x").pow(2).sub(I(1)), V("y").pow(2).sub(I(1))]);
    expect(r.ok).toBe(true);
    expect(r.count).toBe(4);
    expect(r.solutions.length).toBe(4);
    for (const s of r.solutions) {
      for (const v of ["x", "y"]) {
        expect(s[v].exact).toBe(true);
        expect(s[v].re.lo.equals(s[v].re.hi)).toBe(true);                 // an exact point box
        expect(Math.abs(Math.abs(s[v].mid.re) - 1)).toBeLessThan(1e-12);  // value = ±1
        expect(s[v].im.lo.isZero() && s[v].im.hi.isZero()).toBe(true);    // real coordinate
      }
    }
    const pts = new Set(r.solutions.map((s: any) => Math.round(s.x.mid.re) + "," + Math.round(s.y.mid.re)));
    expect(pts).toEqual(new Set(["1,1", "1,-1", "-1,1", "-1,-1"]));
  });

  it("rigorous brackets for irrationals: ⟨x²−2⟩ → boxes tightly contain ±√2 (≤, not =)", () => {
    const r = solveRealCertified([V("x").pow(2).sub(I(2))]);
    expect(r.ok).toBe(true);
    expect(r.count).toBe(2);
    const mids = r.solutions.map((s: any) => s.x.mid.re).sort((a: number, b: number) => a - b);
    expect(mids[0]).toBeCloseTo(-Math.SQRT2, 8);
    expect(mids[1]).toBeCloseTo(Math.SQRT2, 8);
    for (const s of r.solutions) {
      expect(s.x.exact).toBe(false);                          // irrational ⇒ a genuine (non-point) bracket
      const tv = s.x.mid.re < 0 ? -Math.SQRT2 : Math.SQRT2;
      expect(contains(s.x.re, tv)).toBe(true);                // the box rigorously brackets the true root
      expect(width(s.x.re)).toBeLessThan(1e-9);               // and is tight
    }
  });

  it("separates near-coincident roots a numeric solver would merge: 1 and 1+1e-6", () => {
    // 2(x−1) · (10⁶·x − (10⁶+1)): roots 1 and 1000001/1000000, 1e-6 apart, both exact rational.
    const p = V("x").mul(I(2)).sub(I(2)).mul(V("x").mul(I(1000000)).sub(I(1000001)));
    const r = solveRealCertified([p]);
    expect(r.ok).toBe(true);
    expect(r.count).toBe(2);                                  // BOTH isolated — Sturm doesn't merge them
    const mids = r.solutions.map((s: any) => s.x.mid.re).sort((a: number, b: number) => a - b);
    expect(mids[0]).toBeCloseTo(1, 9);
    expect(mids[1]).toBeCloseTo(1.000001, 9);
    expect(r.solutions.every((s: any) => s.x.exact)).toBe(true); // rational ⇒ exact point boxes
  });

  it("empty real set (real system): ⟨x²+1⟩ → count 0, no solutions", () => {
    const r = solveRealCertified([V("x").pow(2).add(I(1))]);
    expect(r.ok).toBe(true);
    expect(r.count).toBe(0);
    expect(r.solutions.length).toBe(0);
  });

  it("2-var irrationals cross-check solveByEigenvalues: ⟨x²−x−1, y−x²⟩ (golden ratio)", () => {
    const sys = [V("x").pow(2).sub(V("x")).sub(I(1)), V("y").sub(V("x").pow(2))];
    const cert = solveRealCertified(sys);
    expect(cert.ok).toBe(true);
    expect(cert.count).toBe(2);
    const eig = solveByEigenvalues(sys, { vars: ["x", "y"] });
    expect(eig.ok).toBe(true);
    // each certified box contains exactly the matching eigenvalue solution in BOTH coordinates
    for (const s of cert.solutions) {
      const match = eig.solutions.find((e: any) => contains(s.x.re, e.x.re, 1e-7) && contains(s.y.re, e.y.re, 1e-7));
      expect(match).toBeTruthy();
    }
    const xmids = cert.solutions.map((s: any) => s.x.mid.re).sort((a: number, b: number) => a - b);
    expect(xmids[0]).toBeCloseTo((1 - Math.sqrt(5)) / 2, 8);  // ψ ≈ −0.618
    expect(xmids[1]).toBeCloseTo((1 + Math.sqrt(5)) / 2, 8);  // φ ≈  1.618
  });
});
