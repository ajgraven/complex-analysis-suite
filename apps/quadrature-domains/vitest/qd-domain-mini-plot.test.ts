// domainPlotData — the pure geometry helper that turns a reconstructed bounded-QD φ into
// SVG-ready boundary/node points for the Algebra verdict's domain thumbnail (roadmap #3).
// Driven with the app's real QD.evalPhi on the cardioid map φ = t + ½t².
import { describe, it, expect } from "vitest";
import _QD from "../app/solver.mjs";
import "../app/sym-core.mjs";
import "../app/workers/solver-graph.mjs"; // registers the QD families (boundedQD) so QD.evalPhi resolves headlessly
import { domainPlotData } from "../app/algebra/domain-mini-plot.mjs";

const evalPhi = (_QD as any).evalPhi;
const cardioid = { unbounded: false, family: "boundedQD", w0: { re: 0, im: 0 }, branches: [{ z: { re: 0, im: 0 }, A: [{ re: 1, im: 0 }, { re: 0.5, im: 0 }] }] };

describe("domainPlotData — reconstructed-domain thumbnail geometry", () => {
  it("samples the cardioid boundary + node into finite SVG-ready data", () => {
    expect(typeof evalPhi).toBe("function");
    const d: any = domainPlotData(cardioid, evalPhi, { samples: 120 });
    expect(d).not.toBeNull();
    expect(d.boundary.length).toBe(120);
    expect(d.boundary.every((p: number[]) => p.length === 2 && p.every((c) => Number.isFinite(c)))).toBe(true);
    expect(d.nodes.length).toBe(1); // one pole ⇒ one quadrature node
    expect(d.view.length).toBe(4);
    expect(d.view.every((c: number) => Number.isFinite(c))).toBe(true);
    expect(d.view[2]).toBeGreaterThan(0); // width
    expect(d.view[3]).toBeGreaterThan(0); // height
    // the boundary bounding box lies within the padded view
    const xs = d.boundary.map((p: number[]) => p[0]);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(d.view[0] - 1e-9);
    expect(Math.max(...xs)).toBeLessThanOrEqual(d.view[0] + d.view[2] + 1e-9);
  });

  it("returns null for a non-QD map / missing evaluator", () => {
    expect(domainPlotData({ w0: { re: 0, im: 0 } } as any, evalPhi)).toBeNull(); // no branches array
    expect(domainPlotData(cardioid, null as any)).toBeNull();
    expect(domainPlotData(null as any, evalPhi)).toBeNull();
  });
});
