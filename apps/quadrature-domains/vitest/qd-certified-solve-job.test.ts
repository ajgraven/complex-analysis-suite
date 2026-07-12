// The 'solveRealCertified' worker job + certifiedRealToJSON serializer (roadmap #2a-1): the
// off-main-thread twin of QD.Sym.solveRealCertified. Guards that runJob returns a JSON-safe payload
// (numeric box midpoints + endpoints + exact flags, no Rational objects) with the certified count,
// so the store/verdict wiring (#2a-2) can rely on it across postMessage.
import { describe, it, expect } from "vitest";
import _QD from "../app/solver.mjs";
import "../app/sym-core.mjs";

const S: any = (_QD as any).Sym;
const { MPoly, Gaussian, runJob, solveRealCertified, certifiedRealToJSON } = S;
const V = (n: string) => MPoly.variable(n);
const I = (k: number) => MPoly.fromInt(k);
const tl = (polys: any[]) => polys.map((p) => p.termList());

describe("runJob('solveRealCertified') + certifiedRealToJSON (#2a-1)", () => {
  it("⟨x²−1, y²−1⟩ → JSON-safe, 4 exact solutions = {±1}², im = 0", () => {
    const res = runJob("solveRealCertified", { polys: tl([V("x").pow(2).sub(I(1)), V("y").pow(2).sub(I(1))]), vars: ["x", "y"] });
    expect(res.ok).toBe(true);
    expect(res.certified).toBe(true);
    expect(res.count).toBe(4);
    expect(res.allExact).toBe(true);
    expect(JSON.parse(JSON.stringify(res))).toEqual(res);          // JSON-safe (numbers/bools only)
    for (const s of res.solutions) for (const v of ["x", "y"]) {
      expect(typeof s[v].re).toBe("number");
      expect(s[v].exact).toBe(true);
      expect(s[v].reLo).toBe(s[v].reHi);                            // an exact point box
      expect(Math.abs(Math.abs(s[v].re) - 1)).toBeLessThan(1e-12); // ±1
      expect(s[v].imLo === 0 && s[v].imHi === 0).toBe(true);       // real
    }
    const pts = new Set(res.solutions.map((s: any) => Math.round(s.x.re) + "," + Math.round(s.y.re)));
    expect(pts).toEqual(new Set(["1,1", "1,-1", "-1,1", "-1,-1"]));
  });

  it("⟨x²−2⟩ → 2 non-exact boxes whose endpoints bracket ±√2", () => {
    const res = runJob("solveRealCertified", { polys: tl([V("x").pow(2).sub(I(2))]), vars: ["x"] });
    expect(res.ok).toBe(true);
    expect(res.count).toBe(2);
    expect(res.allExact).toBe(false);
    for (const s of res.solutions) {
      const tv = s.x.re < 0 ? -Math.SQRT2 : Math.SQRT2;
      expect(s.x.reLo <= tv && tv <= s.x.reHi).toBe(true);          // rigorous numeric bracket
      expect(s.x.exact).toBe(false);
    }
  });

  it("honest failure (complex-coeff minPoly) surfaces as { ok:false, reason }", () => {
    const res = runJob("solveRealCertified", { polys: tl([V("x").pow(2).sub(MPoly.constant(Gaussian.I))]), vars: ["x"] });
    expect(res.ok).toBe(false);
    expect(typeof res.reason).toBe("string");
  });

  it("certifiedRealToJSON matches the engine result and is JSON-safe", () => {
    const json = certifiedRealToJSON(solveRealCertified([V("x").pow(2).sub(I(1))]));
    expect(json.count).toBe(2);
    expect(json.allExact).toBe(true);
    expect(json.solutions.map((s: any) => s.x.re).sort((a: number, b: number) => a - b)).toEqual([-1, 1]);
    expect(JSON.parse(JSON.stringify(json))).toEqual(json);
    // a non-ok result passes through untouched
    expect(certifiedRealToJSON({ ok: false, reason: "x" })).toEqual({ ok: false, reason: "x" });
  });
});
