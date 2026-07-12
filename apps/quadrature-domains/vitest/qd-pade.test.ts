// QD.Sym rational (Padé) reconstruction (roadmap #10): recover p(t)/q(t) from a truncated power
// series via extended Euclid over ℚ[t]. Exact goldens (geometric / Fibonacci generating functions)
// + a general expand-back-to-a-series round-trip oracle + the existence (degeneracy) guard.
import { describe, it, expect } from "vitest";
import _QD from "../app/solver.mjs";
import "../app/sym-core.mjs";

const S: any = (_QD as any).Sym;
const { RatFn, seriesMul, seriesRecip, padeApproximant, rationalReconstruct } = S;
const ser = (coeffs: number[]) => coeffs.map((k) => RatFn.fromInt(k));
const vals = (a: any[]) => a.map((c: any) => c.evalComplex({}).re);
const eqArr = (a: any[], b: number[]) => a.length === b.length && a.every((c: any, i: number) => Math.abs(c.evalComplex({}).re - b[i]) < 1e-12);

// expand num/den back to a length-(L+1) power series (den[0] = 1) and compare to `a`.
const expandsTo = (num: any[], den: any[], a: any[]) => {
  const L = a.length - 1, K = RatFn, pad = (p: any[]) => { const o = []; for (let i = 0; i <= L; i++) o.push(p[i] || K.fromInt(0)); return o; };
  const s = seriesMul(pad(num), seriesRecip(pad(den), L), L);
  return a.every((c: any, i: number) => c.sub(s[i]).isZero());
};

describe("QD.Sym Padé reconstruction", () => {
  it("[0/1] geometric: 1/(1−t) from [1,1,1] → 1 / (1−t)", () => {
    const r = padeApproximant(ser([1, 1, 1]), 0, 1);
    expect(r.ok).toBe(true);
    expect(eqArr(r.num, [1])).toBe(true);
    expect(eqArr(r.den, [1, -1])).toBe(true);
  });

  it("[0/1] scaled geometric: 1/(1−2t) from [1,2,4] → 1 / (1−2t)", () => {
    const r = padeApproximant(ser([1, 2, 4]), 0, 1);
    expect(eqArr(r.num, [1])).toBe(true);
    expect(eqArr(r.den, [1, -2])).toBe(true);
  });

  it("[1/1]: (1+t)/(1−t) from its series [1,2,2,2] → (1+t)/(1−t)", () => {
    const r = padeApproximant(ser([1, 2, 2, 2]), 1, 1);
    expect(eqArr(r.num, [1, 1])).toBe(true);
    expect(eqArr(r.den, [1, -1])).toBe(true);
  });

  it("polynomial (no pole): [3,5,0,0] as [2/1] → (3+5t)/1", () => {
    const r = padeApproximant(ser([3, 5, 0, 0]), 2, 1);
    expect(eqArr(r.num, [3, 5])).toBe(true);
    expect(eqArr(r.den, [1])).toBe(true);
  });

  it("[1/1]: t/(1+t) from [0,1,−1,1] → t / (1+t)", () => {
    const r = padeApproximant(ser([0, 1, -1, 1]), 1, 1);
    expect(eqArr(r.num, [0, 1])).toBe(true);
    expect(eqArr(r.den, [1, 1])).toBe(true);
  });

  it("rationalReconstruct: Fibonacci gen. fn 1/(1−t−t²) from [1,1,2,3,5,8] → 1 / (1−t−t²)", () => {
    const a = ser([1, 1, 2, 3, 5, 8]);
    const r = rationalReconstruct(a);
    expect(eqArr(r.num, [1])).toBe(true);
    expect(eqArr(r.den, [1, -1, -1])).toBe(true);
    expect(expandsTo(r.num, r.den, a)).toBe(true);
  });

  it("round-trip oracle: (2−t)/(1+t+3t²) → series → [1/2] recovers it", () => {
    const K = RatFn;
    const num0 = ser([2, -1]), den0 = ser([1, 1, 3]);
    const L = 5, pad = (p: any[]) => { const o = []; for (let i = 0; i <= L; i++) o.push(p[i] || K.fromInt(0)); return o; };
    const a = seriesMul(pad(num0), seriesRecip(pad(den0), L), L); // the true series to order 5
    const r = padeApproximant(a, 1, 2);
    expect(r.ok).toBe(true);
    expect(eqArr(r.num, [2, -1])).toBe(true);
    expect(eqArr(r.den, [1, 1, 3])).toBe(true);
    expect(expandsTo(r.num, r.den, a)).toBe(true);
  });

  it("honest failures: too-short series, and a non-existent [0/1] entry (den(0)=0)", () => {
    expect(padeApproximant(ser([1, 1]), 1, 1).ok).toBe(false);          // needs m+n+1 = 3 coeffs
    expect(padeApproximant(ser([0, 1, -1, 1]), 0, 1).ok).toBe(false);   // t/(1+t) has no [0/1] approximant
  });
});
