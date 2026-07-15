// domainPlotData — the pure geometry helper that turns a reconstructed bounded-QD φ into
// SVG-ready boundary/node points for the Algebra verdict's domain thumbnail (roadmap #3).
// Driven with the app's real QD.evalPhi on the cardioid map φ = t + ½t².
import { describe, it, expect } from "vitest";
import _QD from "../app/solver.mjs";
import "../app/sym-core.mjs";
import "../app/workers/solver-graph.mjs"; // registers the QD families (boundedQD) so QD.evalPhi resolves headlessly
import { domainPlotData, momentPlotData } from "../app/algebra/domain-mini-plot.mjs";

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

describe("momentPlotData — moment-route polynomial φ = a + Σ wₖzᵏ thumbnail (C1-ext-B)", () => {
  it("cardioid φ = z + ½z² samples to the known cardioid geometry", () => {
    const d: any = momentPlotData([null, 1, { re: 0.5, im: 0 }], 2, { re: 0, im: 0 }, { samples: 240 });
    expect(d).not.toBeNull();
    expect(d.boundary.length).toBe(240);
    expect(d.boundary.every((p: number[]) => p.length === 2 && p.every((c) => Number.isFinite(c)))).toBe(true);
    // θ=0 → 1 + 0.5 = 1.5 (the nose); θ=π → −1 + 0.5 = −0.5 (the cusp) — SVG y-down, im=0 either way
    expect(d.boundary[0][0]).toBeCloseTo(1.5, 6); expect(d.boundary[0][1]).toBeCloseTo(0, 6);
    expect(d.boundary[120][0]).toBeCloseTo(-0.5, 6); expect(d.boundary[120][1]).toBeCloseTo(0, 6);
    expect(d.nodes).toEqual([[0, 0]]);   // node a = φ(0) = 0
  });

  it("unit disk φ = z is the unit circle; w₁ may be a bare number", () => {
    const d: any = momentPlotData([null, 1], 1, { re: 0, im: 0 }, { samples: 64 });
    expect(d.boundary.every((p: number[]) => Math.abs(Math.hypot(p[0], p[1]) - 1) < 1e-9)).toBe(true);
    expect(d.boundary[0][0]).toBeCloseTo(1, 9);   // θ=0 → (1,0)
  });

  it("translates the whole domain by the node a = φ(0)", () => {
    const d: any = momentPlotData([null, 1], 1, { re: 2, im: 1 }, { samples: 64 });
    expect(d.nodes).toEqual([[2, -1]]);            // SVG y-down: (2,1) → (2,−1)
    expect(d.boundary[0][0]).toBeCloseTo(3, 9); expect(d.boundary[0][1]).toBeCloseTo(-1, 9);   // a + (1,0)
    expect(d.boundary.every((p: number[]) => Math.abs(Math.hypot(p[0] - 2, p[1] + 1) - 1) < 1e-9)).toBe(true);
  });

  it("agrees with the app's QD.evalPhi route on the cardioid (coefficients ≡ evaluator)", () => {
    const viaEval: any = domainPlotData(cardioid, evalPhi, { samples: 120 });
    const viaCoef: any = momentPlotData([null, 1, { re: 0.5, im: 0 }], 2, { re: 0, im: 0 }, { samples: 120 });
    let maxd = 0;
    for (let k = 0; k < 120; k++) maxd = Math.max(maxd, Math.hypot(viaEval.boundary[k][0] - viaCoef.boundary[k][0], viaEval.boundary[k][1] - viaCoef.boundary[k][1]));
    expect(maxd).toBeLessThan(1e-9);
  });

  it("returns null on bad input", () => {
    expect(momentPlotData(null as any, 2, { re: 0, im: 0 })).toBeNull();
    expect(momentPlotData([null, 1], 0, { re: 0, im: 0 })).toBeNull();
  });
});
