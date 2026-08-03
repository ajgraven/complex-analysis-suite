// QD.Sym series calculus (roadmap #7): termwise derivative / integral + log / exp on the
// Taylor-coefficient representation. Golden Taylor coefficients (via evalComplex on the
// constant RatFn coeffs) + exact exp∘log / log∘exp round-trips.
import { describe, it, expect } from "vitest";
import _QD from "../app/solvers/solver.mjs";
import "../app/sym/sym-core.mjs";

const S: any = (_QD as any).Sym;
const { RatFn, seriesDeriv, seriesIntegral, seriesLog, seriesExp } = S;
const ser = (coeffs: number[]) => coeffs.map((k) => RatFn.fromInt(k));
const vals = (a: any[]) => a.map((c: any) => c.evalComplex({}).re);
const seq = (a: any[], b: any[]) => a.length === b.length && a.every((c: any, i: number) => c.sub(b[i]).isZero());
const approx = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) < 1e-12);

describe("QD.Sym series calculus (Taylor)", () => {
  it("seriesExp: exp(t) = 1 + t + t²/2! + t³/3! + t⁴/4!", () => {
    const E = seriesExp(ser([0, 1, 0, 0, 0]), 4);
    expect(approx(vals(E), [1, 1, 1 / 2, 1 / 6, 1 / 24])).toBe(true);
  });

  it("seriesLog: log(1+t) = t − t²/2 + t³/3 − t⁴/4", () => {
    const Lg = seriesLog(ser([1, 1, 0, 0, 0]), 4);
    expect(approx(vals(Lg), [0, 1, -1 / 2, 1 / 3, -1 / 4])).toBe(true);
  });

  it("seriesDeriv / seriesIntegral: termwise, and ∫ then d/dt round-trips", () => {
    const a = ser([3, 2, 5, 7, 0]); // 3 + 2t + 5t² + 7t³
    expect(approx(vals(seriesDeriv(a, 4)), [2, 10, 21, 0, 0])).toBe(true);          // a' = 2 + 10t + 21t²
    expect(approx(vals(seriesIntegral(a, 4)), [0, 3, 1, 5 / 3, 7 / 4])).toBe(true); // ∫a = 3t + t² + 5t³/3 + 7t⁴/4
    const rt = seriesDeriv(seriesIntegral(a, 5), 5);
    expect(approx(vals(rt).slice(0, 5), vals(a))).toBe(true);                        // d/dt ∫ a = a
  });

  it("exp ∘ log = id (a[0]=1) and log ∘ exp = id (a[0]=0), EXACT", () => {
    const a1 = ser([1, 2, -3, 1, 4]);
    expect(seq(seriesExp(seriesLog(a1, 4), 4), a1)).toBe(true);
    const a0 = ser([0, 2, -3, 1, 4]);
    expect(seq(seriesLog(seriesExp(a0, 4), 4), a0)).toBe(true);
  });

  it("rejects the unrepresentable constant-term cases", () => {
    expect(() => seriesLog(ser([2, 1, 0]), 2)).toThrow(/a\[0\] must be 1/);
    expect(() => seriesExp(ser([1, 1, 0]), 2)).toThrow(/a\[0\] must be 0/);
  });
});
