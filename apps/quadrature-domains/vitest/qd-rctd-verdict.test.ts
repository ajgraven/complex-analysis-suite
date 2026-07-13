// The RCTD-import verdict now shows each parameter cell's REGION (its constraints), not just the
// real-solution count (roadmap #2b-2b): "n real solutions where [g ⋈ 0]". This guards the
// serialization round-trip (termList → parseRCTD → polyFromTermList) + the constraint rendering
// pipeline the UI verdict uses (the UI's latexOf/reimSafeLatex are thin var-name mappers on top).
import { describe, it, expect } from "vitest";
import _QD from "../app/solver.mjs";
import "../app/sym-core.mjs";
import "../app/algebra/cas-export.mjs";

const S: any = (_QD as any).Sym;
const CAS: any = (_QD as any).CASExport;
const { MPoly } = S;
const V = (n: string) => MPoly.variable(n);
const I = (k: number) => MPoly.fromInt(k);
const at = (g: any, env: any) => { const o: any = {}; for (const k of Object.keys(env)) o[k] = { re: env[k], im: 0 }; return g.evalComplex(o).re; };
const relTex = (r: string) => (r === ">" ? "> 0" : r === "≠" ? "\\ne 0" : "= 0");

describe("RCTD import verdict — per-cell region (#2b-2b)", () => {
  it("parseRCTD round-trips the cells; each constraint renders as 'poly ⋈ 0' with its count", () => {
    const M0 = V("M0");
    // two parameter cells: 1 real QD for M0 > 1, 0 real for M0 < 1 (written 1 − M0 > 0)
    const json = {
      format: "qd-rctd", version: 1, params: ["M0"],
      cells: [
        { index: 1, realCount: 1, constraints: [{ terms: M0.sub(I(1)).termList(), rel: ">" }], chain: [{ terms: M0.sub(I(2)).termList() }] },
        { index: 2, realCount: 0, constraints: [{ terms: I(1).sub(M0).termList(), rel: ">" }], chain: [{ terms: M0.termList() }] },
      ],
    };
    const parsed = CAS.parseRCTD(JSON.stringify(json));
    expect(parsed.ok).toBe(true);
    expect(parsed.cells.length).toBe(2);

    // the verdict logic (minus the UI's var-name mapper): count + rendered constraint region
    const line = (cell: any) => {
      const cons = cell.constraints.map((c: any) => S.polyFromTermList(c.terms).toLatex((n: string) => n) + " " + relTex(c.rel));
      return "cell " + cell.index + ": " + cell.realCount + " real where " + cons.join(", ");
    };
    expect(line(parsed.cells[0])).toMatch(/cell 1: 1 real where .*M0.* > 0/);
    expect(line(parsed.cells[1])).toMatch(/cell 2: 0 real where .*M0.* > 0/);

    // the constraint polynomials actually reconstruct: M0 − 1 vanishes at M0=1, equals 2 at M0=3
    const g1 = S.polyFromTermList(parsed.cells[0].constraints[0].terms);
    expect(Math.abs(at(g1, { M0: 1 }))).toBeLessThan(1e-12);
    expect(Math.abs(at(g1, { M0: 3 }) - 2)).toBeLessThan(1e-12);
    // cell 2's constraint 1 − M0 vanishes at M0=1, equals −2 at M0=3
    const g2 = S.polyFromTermList(parsed.cells[1].constraints[0].terms);
    expect(Math.abs(at(g2, { M0: 1 }))).toBeLessThan(1e-12);
    expect(Math.abs(at(g2, { M0: 3 }) + 2)).toBeLessThan(1e-12);
  });

  it("a cell with no constraints reads as the whole parameter space", () => {
    const json = { format: "qd-rctd", cells: [{ index: 1, realCount: 2, constraints: [], chain: [{ terms: V("x").termList() }] }] };
    const parsed = CAS.parseRCTD(JSON.stringify(json));
    expect(parsed.ok).toBe(true);
    expect(parsed.cells[0].constraints.length).toBe(0);   // ⇒ the UI shows "(all parameters)"
    expect(parsed.cells[0].realCount).toBe(2);
  });
});
