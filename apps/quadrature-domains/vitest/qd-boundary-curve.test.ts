// qd-boundary-curve — QD.QDEquations.boundaryCurve: the EXACT Schwarz-function boundary
// curve Q(w,w̄)=0 of a solved bounded quadrature domain, by resultant elimination of the
// disk parameter (the Aharonov–Shapiro / Gustafsson algebraicity theorem). Two independent
// checks per domain: (1) the exact polynomial matches a hand-verified golden; (2) an
// INDEPENDENT numeric oracle — Q must vanish on the numerically sampled boundary φ(∂𝔻), and
// the extracted rational Schwarz function must satisfy S(w)=w̄ there.
import { describe, it, expect } from "vitest";
import _QD from "../app/solver.mjs";
import "../app/sym-core.mjs";
import "../app/qd-equations.mjs";

const S: any = (_QD as any).Sym;
const QE: any = (_QD as any).QDEquations;
const { mpolyVar, mpolyInt, mpolyConst } = S;
const gi = (re: number, im = 0) => S.gaussInt(re, im);
const grat = (rn: number, rd: number, iN = 0, iD = 1) => S.gauss(S.rat(BigInt(rn), BigInt(rd)), S.rat(BigInt(iN), BigInt(iD)));
const w = mpolyVar("w"), wb = mpolyVar("wb");

// numeric φ(e^{iθ}) for a spec (independent of the symbolic path)
function phiNum(spec: any, theta: number) {
  const t = { re: Math.cos(theta), im: Math.sin(theta) };
  const cx = (a: any, b: any) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
  const cadd = (a: any, b: any) => ({ re: a.re + b.re, im: a.im + b.im });
  const csub = (a: any, b: any) => ({ re: a.re - b.re, im: a.im - b.im });
  const cdiv = (a: any, b: any) => { const d = b.re * b.re + b.im * b.im; return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d }; };
  const gv = (G: any) => ({ re: G.re.toNumber(), im: G.im.toNumber() });
  let out = gv(spec.w0);
  for (const b of spec.branches) {
    const z = gv(b.z), zb = { re: z.re, im: -z.im };
    let denPow = { re: 1, im: 0 }, tPow = { re: 1, im: 0 };
    const den = csub({ re: 1, im: 0 }, cx(zb, t));
    for (let k = 1; k <= b.A.length; k++) {
      denPow = cx(denPow, den); tPow = cx(tPow, t);
      const a = gv(b.A[k - 1]); const abar = { re: a.re, im: -a.im };
      out = cadd(out, cdiv(cx(abar, tPow), denPow));
    }
  }
  return out;
}
const onBoundaryMaxErr = (Q: any, spec: any, n = 24) => {
  let m = 0;
  for (let k = 0; k < n; k++) { const p = phiNum(spec, (2 * Math.PI * k) / n); const e = Q.evalComplex({ w: p, wb: { re: p.re, im: -p.im } }); m = Math.max(m, Math.hypot(e.re, e.im)); }
  return m;
};

describe("QDEquations.boundaryCurve — exact Schwarz curve + rational Schwarz function", () => {
  it("disk φ = c + R·t (c=1, R=2): Q = (w−1)(w̄−1) − 4, and S(w) = (w+3)/(w−1)", () => {
    const spec = { w0: gi(1), branches: [{ z: gi(0), A: [gi(2)] }] };
    const { Q, degW, degWb, order, schwarz } = QE.boundaryCurve(spec);
    // exact golden (the resultant's canonical form, = −[(w−1)(w̄−1) − 4])
    const expected = mpolyInt(3).add(w).add(wb).sub(w.mul(wb));
    expect(Q.equals(expected)).toBe(true);
    expect([degW, degWb, order]).toEqual([1, 1, 1]);
    // Q vanishes on the numerically sampled boundary
    expect(onBoundaryMaxErr(Q, spec)).toBeLessThan(1e-12);
    // S(w) = w̄ on ∂Ω (rational Schwarz function, single-valued)
    expect(schwarz).not.toBeNull();
    let sErr = 0;
    for (let k = 0; k < 12; k++) { const p = phiNum(spec, (Math.PI * k) / 6); const s = schwarz.evalComplex({ w: p }); sErr = Math.max(sErr, Math.hypot(s.re - p.re, s.im + p.im)); }
    expect(sErr).toBeLessThan(1e-10);
  });

  it("cardioid φ = t + ½·t² (order-2 QD): Q = w²w̄² − 3/2·ww̄ − ½w − ½w̄ − 3/16, S algebraic (deg 2)", () => {
    const spec = { w0: gi(0), branches: [{ z: gi(0), A: [gi(1), grat(1, 2)] }] };
    const { Q, degW, degWb, order, schwarz } = QE.boundaryCurve(spec);
    const expected = w.pow(2).mul(wb.pow(2))
      .sub(w.mul(wb).scale(grat(3, 2)))
      .sub(w.scale(grat(1, 2)))
      .sub(wb.scale(grat(1, 2)))
      .sub(mpolyConst(grat(3, 16)));
    expect(Q.equals(expected)).toBe(true);
    expect([degW, degWb, order]).toEqual([2, 2, 2]);
    expect(onBoundaryMaxErr(Q, spec)).toBeLessThan(1e-12);
    expect(schwarz).toBeNull();   // deg_{w̄}=2 ⇒ Schwarz function is algebraic, not returned as rational
  });

  it("two simple poles (z₁=1/3, z₂=−1/4, order 1 each): exact degree-2 curve vanishes on ∂Ω", () => {
    const spec = { w0: gi(0), branches: [{ z: grat(1, 3), A: [gi(1)] }, { z: grat(-1, 4), A: [gi(1)] }] };
    const { Q, order } = QE.boundaryCurve(spec);
    expect(order).toBe(2);
    expect(onBoundaryMaxErr(Q, spec)).toBeLessThan(1e-10);
  });

  it("rejects an empty domain and an order beyond the resultant cap", () => {
    expect(() => QE.boundaryCurve({ w0: gi(0), branches: [] })).toThrow(/empty domain/);
    const big = { w0: gi(0), branches: [{ z: gi(0), A: Array.from({ length: 11 }, (_, k) => gi(k + 1)) }] };
    expect(() => QE.boundaryCurve(big)).toThrow(/exceeds the resultant cap/);
  });
});
